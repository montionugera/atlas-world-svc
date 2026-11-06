#!/usr/bin/env bash
set -uo pipefail

# =============================================================================
# precheck.sh — Gate 1: the per-feature check.
#
# Run by ps-release-workflow `ship`, TWICE: once from the feature worktree
# (verifying the code being shipped) and again from the _release worktree on the
# merged result. A failure on the second run rolls the merge back.
#
# Gate 1 checks ONE feature compiles and its unit tests pass. Gate 2
# (integration.sh) checks the assembled release, including the content gates and
# story-graph drift — deliberately NOT duplicated here, because Gate 1 runs on
# every ship and must stay fast.
#
# WHY `tsc --noEmit` IS A SEPARATE SECTION FROM THE JEST SUITE:
#   A green jest run does NOT prove the package compiles. `npm run build` is
#   tsc, which typechecks the whole project including src/tests/**; ts-jest
#   transpiles per file and CACHES, so a test file whose literals went stale
#   against a changed shared type is never re-checked. This bit for real on
#   2026-07-30 (F-019): jest reported 571 passed / 0 failed and the very next
#   docker build failed with three TS2741/TS2322 errors in a test file the suite
#   had just "passed". Never collapse these two sections into one.
#
# WHY contracts IS BUILT BEFORE ANYTHING ELSE:
#   nakama imports @atlas/contracts from its dist/, so a
#   stale or missing dist makes tsc either report phantom TS2307s or — worse —
#   typecheck green against the OLD types. Both failure modes are silent.
#
# NOTE: this repo is a pnpm workspace (client, contracts, nakama)
# whose packages use the `workspace:*` protocol — `npm install` fails
# here with EUNSUPPORTEDPROTOCOL. Use pnpm at the root.
#
# Usage:
#   ./scripts/precheck.sh              # full gate
#   ./scripts/precheck.sh --no-install # assume deps are already installed
#   PRECHECK_FULL=1 ./scripts/precheck.sh  # never skip a section by change-detection
#
# SELECTIVE RUST: the server-rs section (cargo fmt/clippy/test, the slowest and
# most memory-hungry one) is SKIPPED when no changed path can affect it — see
# rust_relevant_change(). Changed paths use the shared gate base plus working
# tree and untracked files. An unavailable base, diff, or include scan runs
# the section to fail closed.
#
# Exit code: 0 only if every section passes; 1 if any section fails.
# =============================================================================

# One base for every selective gate. Errors must cause callers to run the gate.
gate_base() {
  local base="${PSRW_GATE_BASE:-}" branch subject previous rel
  if [ -z "$base" ]; then
    branch=$(git symbolic-ref --quiet --short HEAD) || return 1
    subject=$(git log -1 --format=%s HEAD) || return 1
    if [[ "$branch" == release/* ]] && [[ "$subject" =~ ^merge\ feat/.*\ into\ release/ ]]; then
      previous=$(git log --first-parent --format='%H %s' HEAD^1 -- 2>/dev/null | awk '$2 == "merge" && $3 ~ /^feat\// && $4 == "into" && $5 ~ /^release\// { print $1; exit }') || return 1
      if [ -n "$previous" ]; then base="$previous"; else base=$(git merge-base HEAD origin/main) || return 1; fi
    else
      rel=""
      if [ -f .release.json ]; then
        rel=$(node -e 'const r=require("./.release.json"); if (r.in_progress && r.version) console.log("release/" + r.version)' 2>/dev/null) || return 1
      fi
      if [ -n "$rel" ] && git rev-parse -q --verify "$rel^{commit}" >/dev/null; then
        base=$(git merge-base HEAD "$rel") || return 1
      else
        base=$(git merge-base HEAD origin/main) || return 1
      fi
    fi
  fi
  git rev-parse -q --verify "$base^{commit}"
}

changed_paths() {
  local base head changed
  base=$(gate_base) || return 1
  head=$(git rev-parse --verify HEAD) || return 1
  [ "$base" != "$head" ] || return 1
  changed=$( { git -c core.quotePath=false diff --name-only --no-renames "$base" -- &&
    git -c core.quotePath=false ls-files --others --exclude-standard; } ) || return 1
  [ -n "$changed" ] || return 1
  printf '%s\n' "$changed"
}

# Resolve all literal Rust includes dynamically. Non-literal or malformed macros
# cannot be classified safely, so a failed scan makes the Rust gate run.
rust_embedded_paths() {
  python3 - "$REPO_ROOT" <<'PYSCAN'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1]).resolve()
crate = root / 'server-rs'
try:
    paths = set()
    # every .rs in the crate (src, tests, benches, examples, build.rs), never build output
    sources = [p for p in crate.rglob('*.rs') if 'target' not in p.relative_to(crate).parts[:1]]
    if not sources:
        raise ValueError('no Rust sources')
    macro = re.compile(r'\binclude_(?:str|bytes)!\s*([({\[])')
    literal = re.compile(r'\s*"([^"\\\n]+)"\s*,?\s*([)}\]])')
    closing = {'(': ')', '{': '}', '[': ']'}
    for source in sources:
        text = source.read_text(encoding='utf-8')
        for match in macro.finditer(text):
            arg = literal.match(text, match.end())
            if not arg or arg.group(2) != closing[match.group(1)]:
                raise ValueError('non-literal include')
            path = (source.parent / arg.group(1)).resolve().relative_to(root)
            paths.add(path.as_posix())
    if not paths:
        raise ValueError('no includes')
    print('\n'.join(sorted(paths)))
except (OSError, UnicodeError, ValueError):
    sys.exit(1)
PYSCAN
}

# server-rs also READS content at runtime (e.g. format!("../content/maps/{id}.json"),
# resolved from the server-rs/ cwd). Every `content/` token in a crate source is reduced
# to the directory prefix before its first placeholder; a dynamic base (`{root}/content/`)
# cannot be reduced, so the scan fails and the Rust gate runs.
rust_runtime_prefixes() {
  python3 - "$REPO_ROOT" <<'PYSCAN'
import pathlib, posixpath, re, sys
root = pathlib.Path(sys.argv[1]).resolve()
crate = root / 'server-rs'
try:
    sources = [p for p in crate.rglob('*.rs') if 'target' not in p.relative_to(crate).parts[:1]]
    if not sources:
        raise ValueError('no Rust sources')
    token = re.compile(r'[^\s"\'`(){},;<>|]*content/[^\s"\'`(){},;<>|]*')
    prefixes = set()
    for source in sources:
        text = source.read_text(encoding='utf-8')
        for m in token.finditer(text):
            if m.start() > 0 and text[m.start() - 1] == '}':
                raise ValueError('dynamic base before content/')
            tok = m.group(0).rstrip('.:')
            if '$' in tok or '%' in tok:
                raise ValueError('placeholder in token')
            # a path is relative to the server-rs cwd (runtime) or to the source file (include_*)
            found = False
            for base in (crate, source.parent):
                rel = posixpath.normpath(posixpath.join(base.relative_to(root).as_posix(), tok))
                if rel == '..' or rel.startswith('../'):
                    continue
                prefixes.add(rel + ('/' if tok.endswith('/') else ''))
                found = True
            if not found:
                raise ValueError('prefix escapes the repo')
    print('\n'.join(sorted(prefixes)))
except (OSError, UnicodeError, ValueError):
    sys.exit(1)
PYSCAN
}

rust_paths_relevant() {
  local paths="$1" embedded prefixes path prefix
  embedded=$(rust_embedded_paths) || return 0
  prefixes=$(rust_runtime_prefixes) || return 0
  while IFS= read -r path; do
    case "$path" in server-rs/*|scripts/precheck.sh) return 0 ;; esac
    if printf '%s\n' "$embedded" | grep -Fx -- "$path" >/dev/null; then return 0; fi
    while IFS= read -r prefix; do
      [ -n "$prefix" ] || continue
      case "$path" in "$prefix"*) return 0 ;; esac
    done <<< "$prefixes"
  done <<< "$paths"
  return 1
}

# Small diagnostic interfaces also exercise the real selector in tests.
if [ "${1:-}" = "--print-gate-base" ]; then gate_base; exit $?; fi
if [ "${1:-}" = "--print-changed-paths" ]; then changed_paths; exit $?; fi
if [ "${1:-}" = "--print-rust-decision" ]; then
  # End-to-end selector (changed paths -> Rust relevance), never honouring PRECHECK_FULL.
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$REPO_ROOT" || exit 1
  if paths="$(changed_paths)" && ! rust_paths_relevant "$paths"; then echo SKIP; else echo RUN; fi
  exit 0
fi
if [ "${1:-}" = "--print-rust-selector" ]; then
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  paths=$(cat) || exit 1
  if rust_paths_relevant "$paths"; then echo RUN; else echo SKIP; fi
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Cap worker concurrency across Jest, Cargo, Node test runners, and pnpm to
# prevent OOM freezes on developer laptops when Gate 1 runs.
export ATLAS_MAX_WORKERS="${ATLAS_MAX_WORKERS:-2}"
export ATLAS_CARGO_JOBS="${ATLAS_CARGO_JOBS:-$ATLAS_MAX_WORKERS}"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-$ATLAS_CARGO_JOBS}"
export RAYON_NUM_THREADS="${RAYON_NUM_THREADS:-$ATLAS_MAX_WORKERS}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

MAIN_ROOT="$(git worktree list --porcelain 2>/dev/null | awk 'NR==1{print $2}')"
echo "📂 Gate 1 working tree: $REPO_ROOT (max workers: $ATLAS_MAX_WORKERS)"
[ -n "$MAIN_ROOT" ] && [ "$REPO_ROOT" != "$MAIN_ROOT" ] && \
  echo "   ↳ linked worktree (primary checkout: $MAIN_ROOT)"

RUN_INSTALL=1
PRINT_PLAN=0
for arg in "$@"; do
  case "$arg" in
    --print-plan) PRINT_PLAN=1 ;;
    --no-install) RUN_INSTALL=0 ;;
    -h|--help)
      awk '/^# ===/{n++} n>=1{sub(/^# ?/,""); print} n>=2{exit}' "$0"
      exit 0 ;;
    *) echo "❌ unknown flag: $arg (see --help)"; exit 2 ;;
  esac
done

SECTION_NAMES=()
SECTION_RESULTS=()
GROUP_NAME=""
GROUP_RES=""      # set inside a parallel group: file receiving "RESULT<TAB>name" lines
SKIP_REASON=""

# stop_walk <pid>: SIGSTOP the pid BEFORE listing its children, then recurse, printing every
# pid it froze. A frozen process cannot fork, so nothing spawned mid-walk escapes the list
# (a plain snapshot-then-TERM missed children forked between the two; I-251/F-171).
stop_walk() { local c; kill -STOP "$1" 2>/dev/null || return 0; echo "$1"; for c in $(pgrep -P "$1" 2>/dev/null); do stop_walk "$c"; done; }
# pgid_of <pid>: the pid's process group id (empty when the pid is gone).
pgid_of() { ps -o pgid= -p "$1" 2>/dev/null | tr -d ' '; }
# kill_tree <pid>...: freeze each whole tree, TERM it, CONT it (so the TERM is delivered and
# nothing is left stopped), then KILL what is left. A pid that leads its own process group
# (each group runner starts under `set -m`) is also frozen and killed AS A GROUP, which
# catches children re-parented away from the tree when a mid-tree process exits (F-173).
# Never group-signals the caller's own process group. Always returns 0.
kill_tree() {
  local all="" leaders="" p own
  own=$(pgid_of $$)
  for p in "$@"; do
    [ -n "$p" ] || continue
    if [ "$(pgid_of "$p")" = "$p" ] && [ "$p" != "$own" ]; then
      kill -STOP -- "-$p" 2>/dev/null && leaders="$leaders -$p"
    fi
    all="$all $(stop_walk "$p")"
  done
  [ -n "${all// /}${leaders// /}" ] || return 0
  # shellcheck disable=SC2086
  { kill -TERM -- $leaders $all; kill -CONT -- $leaders $all; } 2>/dev/null; sleep 1; kill -9 -- $leaders $all 2>/dev/null
  return 0
}

# A section function returns 77 to ask for a visible SKIP (reason in SKIP_REASON).
SKIP_RC=77
run_section() {
  local name="$1"; shift
  local start=$SECONDS result rc icon
  echo ""
  echo "----------------------------------------------------------------------"
  echo "▶ $name"
  echo "----------------------------------------------------------------------"
  SKIP_REASON=""
  [ -n "$GROUP_RES" ] && echo "[group $GROUP_NAME] ▶ $name" >&3
  "$@"; rc=$?
  if [ "$rc" -eq 0 ]; then
    result=PASS; echo "✅ $name — PASS"
  elif [ "$rc" -eq "$SKIP_RC" ]; then
    result=SKIP; echo "⏭  $name — SKIP ($SKIP_REASON)"
  else
    result=FAIL; echo "❌ $name — FAIL"
  fi
  if [ -n "$GROUP_RES" ]; then
    printf '%s\t%s\n' "$result" "$name" >> "$GROUP_RES"
    case "$result" in PASS) icon="✅" ;; SKIP) icon="⏭ " ;; *) icon="❌" ;; esac
    echo "[group $GROUP_NAME] $icon $name $((SECONDS - start))s" >&3
  else SECTION_NAMES+=("$name"); SECTION_RESULTS+=("$result"); fi
  echo "[gate-timing] $name $((SECONDS - start))s"
}

# 0 = run rust_gates; 1 = safe to skip. Echoes the reason.
rust_relevant_change() {
  if [ "${PRECHECK_FULL:-0}" = "1" ]; then echo "PRECHECK_FULL=1"; return 0; fi
  local paths
  if ! paths="$(changed_paths)"; then echo "diff unavailable — running to be safe"; return 0; fi
  if rust_paths_relevant "$paths"; then echo "Rust input changed or include scan unavailable"; return 0; fi
  echo "no rust-relevant path changed"; return 1
}

# --- Sections ----------------------------------------------------------------

# A fresh feature worktree has no node_modules at all.
#
# client/react-client needs a SEPARATE npm install. pnpm-workspace.yaml lists
# 'client', but there is no client/package.json — the real app sits one level
# down at client/react-client/ with its own package-lock.json, and appears
# nowhere in pnpm-lock.yaml. So the root pnpm install does not touch it and
# `react-scripts` is simply absent. Same situation as scripts/, which
# integration.sh installs the same way.
deps_install() {
  command -v pnpm >/dev/null 2>&1 || { echo "pnpm not found — run: corepack enable"; return 1; }
  if [ ! -d "$REPO_ROOT/node_modules/.pnpm" ]; then
    (cd "$REPO_ROOT" && CI=true pnpm install --frozen-lockfile --network-concurrency "$ATLAS_MAX_WORKERS" --child-concurrency "$ATLAS_MAX_WORKERS") || return 1
  fi
  if [ -f "$REPO_ROOT/client/react-client/package.json" ] && [ ! -x "$REPO_ROOT/client/react-client/node_modules/.bin/react-scripts" ]; then
    (cd "$REPO_ROOT/client/react-client" && npm ci) || return 1
  fi
  if [ -f "$REPO_ROOT/scripts/package.json" ] && [ ! -d "$REPO_ROOT/scripts/node_modules/js-yaml" ]; then
    (cd "$REPO_ROOT/scripts" && npm ci) || return 1
  fi
}

# Must run before any typecheck; see the header note.
contracts_build() { (cd "$REPO_ROOT/contracts" && npm run build); }
contracts_tests() { (cd "$REPO_ROOT/contracts" && npx jest --maxWorkers="$ATLAS_MAX_WORKERS"); }


# server-rs embeds content/**/*.json (outside the crate) with include_str!, and
# cargo records those in dep-info as ABSOLUTE paths of whichever checkout built
# last. A target that was shared or cloned can therefore hold a server-rs
# fingerprint that watches ANOTHER worktree's JSON, and cargo reuses the test
# binary after this worktree's JSON changed. Drop every server-rs fingerprint
# whose dep-info names a /server-rs/ path not under this checkout, so cargo
# rebuilds it. A byte count, not a parse: the encoded dep-info is binary.
scrub_foreign_server_rs_depinfo() {
  local f d all own dropped=0
  # One grep over all dep-info files narrows to those naming any /server-rs/ path.
  while IFS= read -r f; do
    d="$(dirname "$f")"
    [ -d "$d" ] || continue
    all=$(LC_ALL=C grep -aoF "/server-rs/" "$f" | wc -l)
    own=$(LC_ALL=C grep -aoF "$REPO_ROOT/server-rs/" "$f" | wc -l)
    if [ "$all" -ne "$own" ]; then rm -rf "$d"; dropped=$((dropped + 1)); fi
  done < <(find "$1"/*/.fingerprint -maxdepth 2 -path '*/server-rs-*/dep-*' -type f -print0 2>/dev/null | LC_ALL=C xargs -0 grep -laF "/server-rs/" 2>/dev/null)
  [ "$dropped" -gt 0 ] && echo "🧹 dropped $dropped server-rs fingerprint(s) recording another checkout's paths — server-rs will rebuild"
  return 0
}

# Rust server-rs quality gate (fmt, clippy, unit tests)
rust_gates() {
  if [ ! -d "$REPO_ROOT/server-rs" ]; then
    echo "no server-rs on this branch — skipping"
    return 0
  fi
  export PATH="$HOME/.cargo/bin:$PATH"
  # Each worktree builds into its OWN server-rs/target (gitignored). A target
  # shared with the primary checkout made worktrees evict each other's
  # incremental cache (touch rebuild 12-16s same path vs 111s after another
  # path built). A new worktree's target is seeded once by APFS clone (cp -c,
  # copy-on-write, ~68s) from the primary's; if cloning fails it starts empty
  # (slow, still correct). Under 50GB free it falls back to the shared target;
  # the dep-info scrub below keeps either choice sound. In that low-disk
  # fallback, worktrees sharing the target drop each other's server-rs
  # fingerprints (server-rs rebuilds every run), and a scrub racing another
  # worktree's live cargo build can fail that build (re-run it).
  if [ -z "${CARGO_TARGET_DIR:-}" ]; then
    local own="$REPO_ROOT/server-rs/target" main="$MAIN_ROOT/server-rs/target" free_gb
    if [ -n "$MAIN_ROOT" ] && [ "$REPO_ROOT" != "$MAIN_ROOT" ] && [ ! -d "$own" ] && [ -d "$main" ]; then
      free_gb=$(df -Pk "$REPO_ROOT" | awk 'NR==2{print int($4/1048576)}')
      if [ "${free_gb:-0}" -lt 50 ]; then
        echo "⚠️  only ${free_gb:-?}GB free — using the shared target $main"
        own="$main"
      elif [ "$(uname)" = Darwin ] && cp -c -R "$main" "$own.seed.$$" 2>/dev/null; then
        # A concurrent first gate may have seeded it meanwhile; BSD mv has no -T
        # and would nest the clone inside the existing target.
        if [ -d "$own" ]; then rm -rf "$own.seed.$$"; else mv "$own.seed.$$" "$own" && echo "🌱 seeded $own from $main (APFS clone)"; fi
      else
        rm -rf "$own.seed.$$"
        echo "⚠️  could not clone $main — building $own from scratch"
      fi
    fi
    export CARGO_TARGET_DIR="$own"
  fi
  scrub_foreign_server_rs_depinfo "$CARGO_TARGET_DIR"
  echo "🦀 Checking Rust server-rs formatting, lints, and tests (target: ${CARGO_TARGET_DIR:-default}, jobs: $ATLAS_CARGO_JOBS)..."
  # cargo test, not nextest: measured on F-170 (research.md) nextest was no
  # faster here (12.3 s vs 11.0 s at 2 jobs), and one runner keeps Gate 1 the
  # same on every machine.
  (cd "$REPO_ROOT/server-rs" && cargo fmt --check && cargo clippy --jobs "$ATLAS_CARGO_JOBS" --all-targets -- -D warnings &&
    cargo test --jobs "$ATLAS_CARGO_JOBS" -- --test-threads="$ATLAS_CARGO_JOBS")
}

# Selective wrapper: SKIP (rc 77) when no changed path can reach server-rs.
rust_section() {
  local reason
  if reason="$(rust_relevant_change)"; then
    echo "🦀 server-rs gate: $reason"
    rust_gates
  else
    SKIP_REASON="$reason; PRECHECK_FULL=1 to force"
    return "$SKIP_RC"
  fi
}

# nakama is bundled into the Nakama runtime; a type error here breaks InitModule.
nakama_typecheck() { (cd "$REPO_ROOT/nakama" && npx tsc --noEmit); }
nakama_tests()     { (cd "$REPO_ROOT/nakama" && npx jest --maxWorkers="$ATLAS_MAX_WORKERS"); }

# The react-client suite. This used to run only via scripts/test_all.sh, which
# nothing called — so it gated nothing. CI=true makes react-scripts run once and
# exit instead of dropping into interactive watch (which would hang the gate).
# Skipped cleanly on branches without the client, same as combat_lab.
client_tests() {
  if [ ! -f "$REPO_ROOT/client/react-client/package.json" ]; then
    echo "no client/react-client on this branch — skipping"
    return 0
  fi
  # Distinguish "deps missing" from "tests failed" — react-scripts absent shows
  # up as a bare `command not found`, which reads like a broken suite.
  if [ ! -x "$REPO_ROOT/client/react-client/node_modules/.bin/react-scripts" ]; then
    echo "react-scripts not installed under client/react-client/node_modules"
    echo "  run:  (cd client/react-client && npm ci)   — or drop --no-install"
    return 1
  fi
  (cd "$REPO_ROOT/client/react-client" && CI=true npm test -- --maxWorkers="$ATLAS_MAX_WORKERS")
}

# The combat balance model gates itself (G1-G12) and fails on spec staleness.
# Skipped cleanly on branches predating the combat lab rather than failing them.
combat_lab() {
  if [ ! -f "$REPO_ROOT/atelier/combat-lab/verify.mjs" ]; then
    echo "no atelier/combat-lab on this branch — skipping"
    return 0
  fi
  node "$REPO_ROOT/atelier/combat-lab/verify.mjs"
}

# F-041: the tier-spine structural gates (cycles, orphans, depth skips) are
# the cheapest content failures to run and the most expensive to find late —
# without this they'd surface only at Gate 2 or CI. --only=spine keeps Gate 1
# out of the full content sweep (~1 s).
content_spine() { node "$REPO_ROOT/scripts/check_content.mjs" --only=spine; }

# Plan E / spec §9.3: the whole-world digest — what replaces the freeze once
# coordinates are generated. Already gated in Gate 2 and CI; belongs here too
# (~0.19 s) because a stale digest is a repo-wide invariant, not a per-feature
# one, and Gate 1 is the check that runs on EVERY ship. commit f07dbe2 edited
# content/spine/nodes/n-atlas.json without re-baselining the digest, and that
# failing gate passed five consecutive review gates before being caught at
# final-green — none of them ran repo-wide invariants.
world_digest() { node "$REPO_ROOT/scripts/check_world_digest.mjs" --check; }

# F-002: World-First L0-L4 Map Compiler invariant (44 playable maps across all
# 13 continents, 40 surveyed zones, 10 story regions, and 116 bestiary creatures).
world_map_compiler() {
  if [ ! -f "$REPO_ROOT/scripts/compile_world_maps.py" ]; then
    return 0
  fi
  python3 "$REPO_ROOT/scripts/compile_world_maps.py" --check
}

# Studio hierarchy, 5-pillar completeness, and scale clamps (INV-01..07)
studio_hierarchy() {
  python3 "$REPO_ROOT/scripts/validate_studio_hierarchy.py" --check
}

# scripts/system-deps.json is the declared source of truth for system-level
# (non-npm) binaries this repo shells out to (magick, rsvg-convert, ...).
# Check-only here (no --install) — Gate 1 runs on a developer's own machine,
# which CI's apt-get/shim approach has no business touching. A missing
# REQUIRED binary (currently: magick, needed by art_forge_tests below) fails
# with the install command for the developer's OS; an absent OPTIONAL one
# (rsvg-convert) is reported but never fails the gate, matching the tests'
# own self-skip behavior.
system_deps_check() { node "$REPO_ROOT/scripts/check-system-deps.mjs"; }

art_forge_tests() {
  # F-053: the suite must leave the committed run ledgers byte-identical —
  # tests once appended 18 entries to runs/A1-ART-02.json.
  local before after
  before=$(cat "$REPO_ROOT"/atelier/art-forge/runs/*.json | shasum)
  ( cd "$REPO_ROOT/atelier/art-forge" && node --test --test-concurrency="$ATLAS_MAX_WORKERS" tests/*.test.mjs ) || return 1
  after=$(cat "$REPO_ROOT"/atelier/art-forge/runs/*.json | shasum)
  [ "$before" = "$after" ] || { echo "art-forge tests modified atelier/art-forge/runs/*.json"; return 1; }
}

# The Chrome smoke was measured at 78-86s of a Gate 1 run in one environment
# (5-6s in another), and CI runs it as its own step
# (ci.yml "storybook smoke"), so Gate 1 runs it only when the change can reach
# it. The prefixes are what the smoke's local server was MEASURED serving (882
# distinct paths) plus its own code; run.mjs imports only node: builtins, so no
# package/lock file is an input. Fails closed: no base, HEAD == base (the
# post-merge run in _release), an empty diff, or any git error -> run it.
# Diff is base vs the WORKING TREE plus untracked files, so uncommitted edits
# count. Gitignored generated inputs (e.g. the asset thumbs) are invisible to
# git diff, so a change only to those skips here; CI still covers it.
# ATLAS_FORCE_STORYBOOK_SMOKE=1 always runs it.
STORYBOOK_SMOKE_PATHS='^(atelier/atlas-world-panels/|atelier/art-forge/|atelier/mapforge/|atelier/map-builder/|content/|game-client/assets/|colyseus-server/generated/|scripts/lib/|scripts/catalog_explorer_web\.py$|scripts/atlas_world_web/|tools/mac-observatory/vendor/|scripts/precheck\.sh$)'
storybook_smoke_skip_reason() {
  [ "${ATLAS_FORCE_STORYBOOK_SMOKE:-0}" = "1" ] && return 1
  local changed
  changed=$(changed_paths) || return 1
  grep -qE "$STORYBOOK_SMOKE_PATHS" <<<"$changed" && return 1
  echo "storybook smoke SKIPPED: no change under its inputs since gate base (CI still runs it; ATLAS_FORCE_STORYBOOK_SMOKE=1 forces)"
}

storybook_tests() {
  # F-038: taxonomy resolution, thumb-index join, verdict store. Pure modules,
  # so they run here with no browser and no Blender.
  # F-053: plus the headless Forge smoke (skips loudly, exit 0, with no Chrome).
  ( cd "$REPO_ROOT" && node --test --test-concurrency="$ATLAS_MAX_WORKERS" atelier/atlas-world-panels/tests/*.test.mjs ) || return 1
  ( cd "$REPO_ROOT" && storybook_smoke_skip_reason ) && return 0
  ( cd "$REPO_ROOT" && node atelier/atlas-world-panels/tests/smoke/run.mjs )
}

atlas_web_tests() {
  # I-246: read-only guard, hidden controls, image contents, routing, the verify script.
  ( cd "$REPO_ROOT/scripts" && node --test --test-concurrency="$ATLAS_MAX_WORKERS" tests/atlas-web-*.test.mjs )
}

map_builder_tests() { ( cd "$REPO_ROOT" && node --test --test-concurrency="$ATLAS_MAX_WORKERS" atelier/map-builder/tests/*.test.mjs ) }

# F-156: atlas explorer probes (scripts/probes/). atlas_ux_probe.py is pure Python (no server, no browser);
# atlas_zoom_drift_check.mjs and atlas_phone_touch_audit.mjs drive headless Chrome against a throwaway
# catalog_explorer_web.py server on a free port. Runs only when the change can reach the explorer
# (fails closed to RUN when the diff cannot be computed); ATLAS_FORCE_EXPLORER_PROBES=1 always runs them.
# The two Chrome probes SKIP loudly (exit 0) when Chrome is absent (CI runners without it; set CHROME_BIN or
# install Chrome to enable) - the Python probe and tests/test_studio_web_perspectives.py still run.
EXPLORER_PROBE_PATHS='^(scripts/catalog_explorer_web\.py|scripts/atlas_world_web/|atelier/atlas-world-panels/|scripts/studio_|scripts/probes/atlas_|tests/test_studio_web_perspectives\.py|scripts/precheck\.sh$)'
explorer_probes_skip_reason() {
  [ "${ATLAS_FORCE_EXPLORER_PROBES:-0}" = "1" ] && return 1
  local changed
  changed=$(changed_paths) || return 1
  grep -qE "$EXPLORER_PROBE_PATHS" <<<"$changed" && return 1
  echo "explorer probes SKIPPED: no change under their inputs since gate base (ATLAS_FORCE_EXPLORER_PROBES=1 forces)"
}

explorer_probes() {
  ( cd "$REPO_ROOT" && explorer_probes_skip_reason ) && return 0
  python3 "$REPO_ROOT/scripts/lint_file_size.py" >/dev/null || { echo "lint_file_size.py FAILED"; return 1; }
  echo "lint_file_size.py ok"
  python3 "$REPO_ROOT/scripts/probes/atlas_ux_probe.py" >/dev/null || { echo "atlas_ux_probe.py FAILED"; return 1; }
  echo "atlas_ux_probe.py ok"
  local chrome="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}" c
  if [ ! -x "$chrome" ]; then
    chrome=""
    for c in google-chrome google-chrome-stable chromium chromium-browser; do
      command -v "$c" >/dev/null 2>&1 && { chrome="$(command -v "$c")"; break; }
    done
  fi
  if [ -z "$chrome" ]; then
    # fail closed in CI: a skipped probe there would hide B1-B7 regressions
    if [ -n "${CI:-}" ]; then echo "explorer Chrome probes FAILED: no Chrome found in CI (set CHROME_BIN)"; return 1; fi
    echo "explorer Chrome probes SKIPPED: no Chrome found locally (set CHROME_BIN)"
    return 0
  fi
  export CHROME_BIN="$chrome"
  # Each probe runs in the background with its OWN log file and its OWN watchdog
  # (not `timeout(1)`: that moves node into its own process group and the Chrome
  # probe stalls). Both hit the same server; each launches its own Chrome with a
  # free debugging port and a private profile, so they cannot collide.
  # start_probe <script> <url> <outfile> <rcfile>
  start_probe() {
    (
      node "$1" --url "$2" > "$3" 2>&1 &
      local p=$! w prc
      ( sleep 900; kill "$p" 2>/dev/null ) &
      w=$!
      wait "$p"; prc=$?
      pkill -P "$w" 2>/dev/null; kill "$w" 2>/dev/null; wait "$w" 2>/dev/null
      echo "$prc" > "$4"
    ) &
  }
  local port log pid rc=0
  port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])') || return 1
  log=$(mktemp)
  python3 "$REPO_ROOT/scripts/catalog_explorer_web.py" --port "$port" >"$log" 2>&1 &
  pid=$!
  local zp="" tp=""
  trap 'kill_tree "$zp" "$tp" "$pid"; rm -f "$log" "$log".*; exit 143' INT TERM
  trap 'kill "$pid" 2>/dev/null; rm -f "$log"' RETURN
  local up=0 i
  for i in $(seq 1 40); do
    curl -fs "http://127.0.0.1:$port/" >/dev/null 2>&1 && { up=1; break; }
    sleep 0.5
  done
  if [ "$up" -ne 1 ]; then echo "explorer server did not start on :$port"; tail -5 "$log"; kill "$pid" 2>/dev/null; return 1; fi
  local zoom_out="$log.zoom" zoom_rc="$log.zoom.rc" touch_out="$log.touch" touch_rc="$log.touch.rc"
  start_probe "$REPO_ROOT/scripts/probes/atlas_zoom_drift_check.mjs" "http://127.0.0.1:$port/" "$zoom_out" "$zoom_rc"; zp=$!
  start_probe "$REPO_ROOT/scripts/probes/atlas_phone_touch_audit.mjs" "http://127.0.0.1:$port/" "$touch_out" "$touch_rc"; tp=$!
  wait "$zp" "$tp"
  echo "--- atlas_zoom_drift_check.mjs"; tail -9 "$zoom_out"
  echo "--- atlas_phone_touch_audit.mjs"; tail -9 "$touch_out"
  # a missing rc file (probe subshell died) is a failure, never a pass
  [ "$(cat "$zoom_rc" 2>/dev/null)" = "0" ] || rc=1
  [ "$(cat "$touch_rc" 2>/dev/null)" = "0" ] || rc=1
  rm -f "$zoom_out" "$zoom_rc" "$touch_out" "$touch_rc"
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
  rm -f "$log"
  trap - RETURN INT TERM
  return "$rc"
}

# --- Execute -----------------------------------------------------------------
#
# Sections are "name|function" entries. deps_install and contracts_build run
# serially BEFORE the groups (nakama typechecks against contracts/dist).
#
# PARALLEL GROUPS (GATE_PARALLEL=0 runs every entry in the old serial order).
# Independence audit (F-170): suites that can touch a repo path another
# concurrently running group reads must share a group. Findings:
#   - cargo test (rust_gates) WRITES contracts/src/protocol/fixtures/snapshot_test.bin
#     (server-rs/tests/it/protocol_roundtrip.rs), which contracts jest
#     (protocol-roundtrip.test.ts) READS -> contracts jest sits in the rust group,
#     AFTER server-rs, so it reads a finished fixture.
#   - atlas-web-read-only.test.mjs renames build/catalog.sqlite aside, and the
#     panels smoke, the explorer server and the probes (all via
#     scripts/catalog_explorer_web.py) build/open that same file ->
#     atlas web, panels (+smoke) and explorer probes are ONE group (explorer).
#   - the panels concept-arts test creates and deletes
#     atelier/atlas-world-panels/tests/.tmp-gate-test, inside the tree the
#     explorer serves -> same explorer group.
#   - art-forge hashes atelier/art-forge/runs/*.json before/after; its tests write
#     only under os.tmpdir() (ART_FORGE_RUNS_DIR, intake fixtures); nothing else
#     writes those ledgers -> node group.
#   - map-builder tests build a fake repo under os.tmpdir(); combat-lab, spine,
#     world digest (--check) and both Python checks (--check) only read the repo.
#   - client / nakama / contracts jest + tsc write only their own caches
#     (node_modules/.cache, ts-jest cache); contracts/dist is built before the groups.
#   - ports: the panels smoke and the explorer server bind a free port, and the two
#     probes use private Chrome profiles + free debugging ports.
# Group order is fixed; each group's log prints whole in this order.
GROUP_ORDER="ts rust node explorer py"
GROUP_ts=(
  "nakama: tsc --noEmit|nakama_typecheck"
  "nakama: jest suite|nakama_tests"
  "client: react-client suite|client_tests"
)
GROUP_rust=(
  "server-rs: cargo clippy & test|rust_section"
  "contracts: jest suite|contracts_tests"
)
GROUP_node=(
  "system deps: binary check (scripts/system-deps.json)|system_deps_check"
  "art-forge: node --test suite|art_forge_tests"
  "map-builder: node --test suite|map_builder_tests"
  "combat-lab: model gates|combat_lab"
  "content: spine gates (--only=spine)|content_spine"
  "world digest (G-WORLD-DIGEST)|world_digest"
)
GROUP_explorer=(
  "atlas-world-panels: node --test suite|storybook_tests"
  "atlas web: node --test suite|atlas_web_tests"
  "atlas explorer: UX + touch probes (F-156)|explorer_probes"
)
GROUP_py=(
  "world-first map compiler (L0-L4 44 maps)|world_map_compiler"
  "studio hierarchy & scale clamps (INV-01..07)|studio_hierarchy"
)
# The exact old serial order (every entry of every group, once).
SERIAL_PLAN=(
  "contracts: jest suite|contracts_tests"
  "server-rs: cargo clippy & test|rust_section"
  "nakama: tsc --noEmit|nakama_typecheck"
  "nakama: jest suite|nakama_tests"
  "client: react-client suite|client_tests"
  "system deps: binary check (scripts/system-deps.json)|system_deps_check"
  "art-forge: node --test suite|art_forge_tests"
  "atlas-world-panels: node --test suite|storybook_tests"
  "map-builder: node --test suite|map_builder_tests"
  "atlas web: node --test suite|atlas_web_tests"
  "atlas explorer: UX + touch probes (F-156)|explorer_probes"
  "combat-lab: model gates|combat_lab"
  "content: spine gates (--only=spine)|content_spine"
  "world digest (G-WORLD-DIGEST)|world_digest"
  "world-first map compiler (L0-L4 44 maps)|world_map_compiler"
  "studio hierarchy & scale clamps (INV-01..07)|studio_hierarchy"
)
# Test seam (scripts/tests/precheck-parallel.test.mjs): with ATLAS_PRECHECK_TEST_MODE=1 the
# plan, groups and section functions come from ATLAS_PRECHECK_TEST_PLAN and the heavy
# pre-sections (install, contracts build) are skipped. Never set outside tests.
TEST_MODE=0
if [ "${ATLAS_PRECHECK_TEST_MODE:-0}" = "1" ] && [ -f "${ATLAS_PRECHECK_TEST_PLAN:-}" ]; then
  TEST_MODE=1
  # shellcheck disable=SC1090
  . "$ATLAS_PRECHECK_TEST_PLAN"
fi
group_entries() { eval "printf '%s\\n' \"\${GROUP_$1[@]}\""; }

if [ "$PRINT_PLAN" -eq 1 ]; then
  for e in "${SERIAL_PLAN[@]}"; do printf 'serial\t%s\n' "$e"; done
  for g in $GROUP_ORDER; do group_entries "$g" | while IFS= read -r e; do printf '%s\t%s\n' "$g" "$e"; done; done
  exit $((TEST_MODE ? 3 : 0)) # test mode never exits 0 (psrw reads exit codes)
fi

run_entry() { run_section "${1%%|*}" "${1#*|}"; }

run_group() { # run_group <name>: runs in a background subshell; log + results go to files
  local g="$1" e start=$SECONDS
  GROUP_NAME="$g"
  GROUP_RES="$GROUP_DIR/$g.res"; : > "$GROUP_RES"
  while IFS= read -r e; do run_entry "$e"; done < <(group_entries "$g")
  echo "[gate-timing] group $g $((SECONDS - start))s"
}

# run_groups_parallel [group...]: run the groups (default $GROUP_ORDER) as background
# subshells, each leading its own process group, and collect their results fail-closed.
# The serial plan runs through here too, as the single group "serial" (F-173), so it gets
# the same INT/TERM cleanup.
run_groups_parallel() {
  local order="${*:-$GROUP_ORDER}"
  GROUP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/atlas-gate1.XXXXXX") || { echo "❌ cannot create a temp dir for the parallel groups (TMPDIR=${TMPDIR:-unset})"; return 1; }
  local g pids="" pid line res name found tab
  tab=$(printf '\t')
  trap 'kill_tree $pids; rm -rf "$GROUP_DIR"; exit 130' INT TERM
  # Job control: each group subshell leads its own process group (see kill_tree). The gate's
  # INT/TERM trap is what reaches them; psrw runs the gate with a plain subprocess.run (no
  # timeout, no group kill), so a SIGKILL sent to the gate's own process group would NOT reach
  # the groups — kill the gate with TERM/INT, never `kill -9 -- -<gate pgid>`.
  # A lone "serial" group streams its output live instead of to a log file (F-173 review).
  local live=0
  [ "$order" = "serial" ] && live=1
  set -m
  for g in $order; do
    if [ "$live" -eq 1 ]; then
      ( run_group "$g" ) 3>/dev/null 2>&1 < /dev/null &
    else
      ( run_group "$g" ) 3>&1 > "$GROUP_DIR/$g.log" 2>&1 < /dev/null &
    fi
    pids="$pids $!"
    echo "🚦 group $g started (pid $!)"
  done
  set +m
  # Wait for every pid; the per-group results files, not exit codes, decide.
  for pid in $pids; do wait "$pid"; done
  trap - INT TERM
  for g in $order; do
    echo ""
    echo "######################################################################"
    echo "# GROUP: $g"
    echo "######################################################################"
    [ "$live" -eq 1 ] || cat "$GROUP_DIR/$g.log"
    # Fail closed: every expected section needs a recorded result; a group whose
    # subshell died leaves FAIL entries instead of silently dropping sections.
    while IFS= read -r line; do
      name="${line%%|*}"; found=""
      while IFS="$tab" read -r res rname; do
        if [ "$rname" = "$name" ]; then found="$res"; break; fi
      done < "$GROUP_DIR/$g.res"
      if [ -z "$found" ]; then found=FAIL; echo "❌ $name — no result recorded (group $g aborted)"; fi
      SECTION_NAMES+=("$name"); SECTION_RESULTS+=("$found")
    done < <(group_entries "$g")
  done
  rm -rf "$GROUP_DIR"
}

# Available memory in GB (free + inactive + speculative on macOS, MemAvailable on Linux).
# Prints "unknown" when it cannot be read. ATLAS_PARALLEL_FREE_GB_OVERRIDE fakes it (tests).
available_gb() {
  if [ -n "${ATLAS_PARALLEL_FREE_GB_OVERRIDE:-}" ]; then echo "$ATLAS_PARALLEL_FREE_GB_OVERRIDE"; return 0; fi
  local gb=""
  if [ -r /proc/meminfo ]; then
    gb=$(awk '/^MemAvailable:/{printf "%.1f", $2/1048576}' /proc/meminfo 2>/dev/null)
  elif command -v vm_stat >/dev/null 2>&1; then
    gb=$(vm_stat 2>/dev/null | awk '/page size of/{ps=$8} /^Pages free/{f=$3} /^Pages inactive/{i=$3} /^Pages speculative/{s=$3} END{if(ps>0 && f!="" && i!="" && s!="") printf "%.1f", (f+i+s)*ps/1073741824}')
  fi
  echo "${gb:-unknown}"
}
# 0 = enough memory to run the groups in parallel. Unknown or low -> 1 (serial is the safe mode).
parallel_memory_ok() {
  # Default floor 3 GB = 1.5 x the 2.0 GB drop in available memory measured during a full
  # parallel Gate 1 on the 36 GB dev Mac (F-171 research.md; swap did not grow). The old 6 GB
  # guess kept every real run serial (readings 4.1-5.2 GB).
  local have min="${ATLAS_PARALLEL_MIN_FREE_GB:-3}"
  have=$(available_gb)
  case "$have" in
    ''|*[!0-9.]*) echo "🐢 available memory unknown — running serially (safe mode)"; return 1 ;;
  esac
  if awk -v h="$have" -v m="$min" 'BEGIN{exit !(h+0 >= m+0)}'; then return 0; fi
  echo "🐢 only ${have} GB memory available (< ATLAS_PARALLEL_MIN_FREE_GB=${min}) — running serially"
  return 1
}

if [ "$TEST_MODE" -eq 0 ]; then
  [ "$RUN_INSTALL" -eq 1 ] && run_section "deps: pnpm workspace install" deps_install
  run_section "contracts: tsc build" contracts_build
fi
if [ "${GATE_PARALLEL:-1}" = "0" ] || ! parallel_memory_ok; then
  # shellcheck disable=SC2034 # read via group_entries' eval
  GROUP_serial=("${SERIAL_PLAN[@]}")
  run_groups_parallel serial || { echo "RESULT: GATE 1 FAILURES ABOVE ☝ — serial runner could not start; do not ship"; exit 1; }
else
  run_groups_parallel || { echo "RESULT: GATE 1 FAILURES ABOVE ☝ — parallel runner could not start; do not ship"; exit 1; }
fi

# Completeness guard: every serial-plan section must have exactly one result.
for e in "${SERIAL_PLAN[@]}"; do
  name="${e%%|*}"; n=0
  for i in "${!SECTION_NAMES[@]}"; do [ "${SECTION_NAMES[$i]}" = "$name" ] && n=$((n + 1)); done
  if [ "$n" -ne 1 ]; then
    echo "❌ completeness: '$name' has $n recorded results (expected 1)"
    SECTION_NAMES+=("completeness: $name"); SECTION_RESULTS+=("FAIL")
  fi
done

# --- Summary -----------------------------------------------------------------
echo ""
echo "======================================================================"
echo " GATE 1 SUMMARY"
echo "======================================================================"
EXIT=0
for i in "${!SECTION_NAMES[@]}"; do
  printf ' %-4s  %s\n' "${SECTION_RESULTS[$i]}" "${SECTION_NAMES[$i]}"
  [ "${SECTION_RESULTS[$i]}" = "FAIL" ] && EXIT=1
done
echo "======================================================================"
echo "[gate-timing] total ${SECONDS}s"
if [ "$TEST_MODE" -eq 1 ]; then
  # Test seam: psrw decides Gate 1 by exit code only, so a leaked ATLAS_PRECHECK_TEST_MODE must
  # never exit 0 or print the real PASS line. A passing stub run exits 3.
  if [ "$EXIT" -eq 0 ]; then echo "RESULT: TEST MODE PASS — not a Gate 1 result"; exit 3; fi
  echo "RESULT: TEST MODE FAILURES — not a Gate 1 result"; exit 1
fi
if [ "$EXIT" -eq 0 ]; then
  echo "RESULT: GATE 1 PASS — feature is ship-clean"
else
  echo "RESULT: GATE 1 FAILURES ABOVE ☝ — do not ship"
fi
exit "$EXIT"
