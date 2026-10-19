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
#
# Exit code: 0 only if every section passes; 1 if any section fails.
# =============================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Cap worker concurrency across Jest, Cargo, Node test runners, and pnpm to
# prevent OOM freezes on developer laptops when Gate 1 runs.
export ATLAS_MAX_WORKERS="${ATLAS_MAX_WORKERS:-2}"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-$ATLAS_MAX_WORKERS}"
export RAYON_NUM_THREADS="${RAYON_NUM_THREADS:-$ATLAS_MAX_WORKERS}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

MAIN_ROOT="$(git worktree list --porcelain 2>/dev/null | awk 'NR==1{print $2}')"
echo "📂 Gate 1 working tree: $REPO_ROOT (max workers: $ATLAS_MAX_WORKERS)"
[ -n "$MAIN_ROOT" ] && [ "$REPO_ROOT" != "$MAIN_ROOT" ] && \
  echo "   ↳ linked worktree (primary checkout: $MAIN_ROOT)"

RUN_INSTALL=1
for arg in "$@"; do
  case "$arg" in
    --no-install) RUN_INSTALL=0 ;;
    -h|--help)
      awk '/^# ===/{n++} n>=1{sub(/^# ?/,""); print} n>=2{exit}' "$0"
      exit 0 ;;
    *) echo "❌ unknown flag: $arg (see --help)"; exit 2 ;;
  esac
done

SECTION_NAMES=()
SECTION_RESULTS=()

run_section() {
  local name="$1"; shift
  local start=$SECONDS
  echo ""
  echo "----------------------------------------------------------------------"
  echo "▶ $name"
  echo "----------------------------------------------------------------------"
  if "$@"; then
    SECTION_NAMES+=("$name"); SECTION_RESULTS+=("PASS")
    echo "✅ $name — PASS"
  else
    SECTION_NAMES+=("$name"); SECTION_RESULTS+=("FAIL")
    echo "❌ $name — FAIL"
  fi
  echo "[gate-timing] $name $((SECONDS - start))s"
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
  # the dep-info scrub below keeps either choice sound.
  if [ -z "${CARGO_TARGET_DIR:-}" ]; then
    local own="$REPO_ROOT/server-rs/target" main="$MAIN_ROOT/server-rs/target" free_gb
    if [ -n "$MAIN_ROOT" ] && [ "$REPO_ROOT" != "$MAIN_ROOT" ] && [ ! -d "$own" ] && [ -d "$main" ]; then
      free_gb=$(df -Pk "$REPO_ROOT" | awk 'NR==2{print int($4/1048576)}')
      if [ "${free_gb:-0}" -lt 50 ]; then
        echo "⚠️  only ${free_gb:-?}GB free — using the shared target $main"
        own="$main"
      elif cp -c -R "$main" "$own.seed.$$" 2>/dev/null && mv "$own.seed.$$" "$own"; then
        echo "🌱 seeded $own from $main (APFS clone)"
      else
        rm -rf "$own.seed.$$"
        echo "⚠️  could not clone $main — building $own from scratch"
      fi
    fi
    export CARGO_TARGET_DIR="$own"
  fi
  scrub_foreign_server_rs_depinfo "$CARGO_TARGET_DIR"
  echo "🦀 Checking Rust server-rs formatting, lints, and tests (target: ${CARGO_TARGET_DIR:-default}, jobs: $ATLAS_MAX_WORKERS)..."
  (cd "$REPO_ROOT/server-rs" && cargo fmt --check && cargo clippy --jobs "$ATLAS_MAX_WORKERS" --all-targets -- -D warnings && cargo test --jobs "$ATLAS_MAX_WORKERS" -- --test-threads="$ATLAS_MAX_WORKERS")
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

# The Chrome smoke is ~60% of a warm Gate 1, and CI runs it as its own step
# (ci.yml "storybook smoke"), so Gate 1 runs it only when the change can reach
# it. The prefixes are what the smoke's local server was MEASURED serving (882
# distinct paths) plus its own code; run.mjs imports only node: builtins, so no
# package/lock file is an input. Fails closed: no base, HEAD == base (the
# post-merge run in _release), an empty diff, or any git error -> run it.
# Diff is base vs the WORKING TREE plus untracked files, so uncommitted edits
# count. ATLAS_FORCE_STORYBOOK_SMOKE=1 always runs it.
STORYBOOK_SMOKE_PATHS='^(atelier/asset-storybook/|atelier/art-forge/|atelier/mapforge/|content/|game-client/assets/|colyseus-server/generated/|scripts/lib/|scripts/precheck\.sh$)'
storybook_smoke_skip_reason() {
  [ "${ATLAS_FORCE_STORYBOOK_SMOKE:-0}" = "1" ] && return 1
  local base="${PSRW_GATE_BASE:-}" rel changed
  if [ -z "$base" ]; then
    rel=$(node -e 'const r=require("./.release.json"); if (r.in_progress && r.version) console.log("release/" + r.version)' 2>/dev/null)
    if [ -n "$rel" ] && git rev-parse -q --verify "$rel^{commit}" >/dev/null; then
      base=$(git merge-base HEAD "$rel") || return 1
    else
      base=$(git merge-base HEAD origin/main) || return 1
    fi
  fi
  base=$(git rev-parse -q --verify "$base^{commit}") || return 1
  [ "$base" = "$(git rev-parse HEAD)" ] && return 1
  changed=$( { git diff --name-only "$base" -- && git ls-files --others --exclude-standard; } ) || return 1
  [ -z "$changed" ] && return 1
  printf '%s\n' "$changed" | grep -qE "$STORYBOOK_SMOKE_PATHS" && return 1
  echo "storybook smoke SKIPPED: no change under its inputs since ${base:0:12} (CI still runs it; ATLAS_FORCE_STORYBOOK_SMOKE=1 forces)"
}

storybook_tests() {
  # F-038: taxonomy resolution, thumb-index join, verdict store. Pure modules,
  # so they run here with no browser and no Blender.
  # F-053: plus the headless Forge smoke (skips loudly, exit 0, with no Chrome).
  ( cd "$REPO_ROOT" && node --test --test-concurrency="$ATLAS_MAX_WORKERS" atelier/asset-storybook/tests/*.test.mjs ) || return 1
  ( cd "$REPO_ROOT" && storybook_smoke_skip_reason ) && return 0
  ( cd "$REPO_ROOT" && node atelier/asset-storybook/tests/smoke/run.mjs )
}

map_builder_tests() { ( cd "$REPO_ROOT" && node --test --test-concurrency="$ATLAS_MAX_WORKERS" atelier/map-builder/tests/*.test.mjs ) }

# --- Execute -----------------------------------------------------------------
[ "$RUN_INSTALL" -eq 1 ] && run_section "deps: pnpm workspace install" deps_install
run_section "contracts: tsc build"          contracts_build
run_section "contracts: jest suite"         contracts_tests
run_section "server-rs: cargo clippy & test" rust_gates
run_section "nakama: tsc --noEmit"          nakama_typecheck
run_section "nakama: jest suite"            nakama_tests
run_section "client: react-client suite"    client_tests
run_section "system deps: binary check (scripts/system-deps.json)" system_deps_check
run_section "art-forge: node --test suite"  art_forge_tests
run_section "asset-storybook: node --test suite" storybook_tests
run_section "map-builder: node --test suite" map_builder_tests
run_section "combat-lab: model gates"       combat_lab
run_section "content: spine gates (--only=spine)" content_spine
run_section "world digest (G-WORLD-DIGEST)" world_digest
run_section "world-first map compiler (L0-L4 44 maps)" world_map_compiler

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
if [ "$EXIT" -eq 0 ]; then
  echo "RESULT: GATE 1 PASS — feature is ship-clean"
else
  echo "RESULT: GATE 1 FAILURES ABOVE ☝ — do not ship"
fi
exit "$EXIT"
