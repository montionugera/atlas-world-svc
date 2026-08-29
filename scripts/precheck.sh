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
#   colyseus-server and nakama import @atlas/contracts from its dist/, so a
#   stale or missing dist makes tsc either report phantom TS2307s or — worse —
#   typecheck green against the OLD types. Both failure modes are silent.
#
# NOTE: this repo is a pnpm workspace (colyseus-server, client, contracts,
# nakama) whose packages use the `workspace:*` protocol — `npm install` fails
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

MAIN_ROOT="$(git worktree list --porcelain 2>/dev/null | awk 'NR==1{print $2}')"
echo "📂 Gate 1 working tree: $REPO_ROOT"
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
  (cd "$REPO_ROOT" && pnpm install --frozen-lockfile) || return 1
  if [ -f "$REPO_ROOT/client/react-client/package.json" ]; then
    (cd "$REPO_ROOT/client/react-client" && npm ci) || return 1
  fi
}

# Must run before any typecheck; see the header note.
contracts_build() { (cd "$REPO_ROOT/contracts" && npm run build); }
contracts_tests() { (cd "$REPO_ROOT/contracts" && npx jest); }

# The check jest will NOT do for you. Covers src/tests/** too.
server_typecheck() { (cd "$REPO_ROOT/colyseus-server" && npx tsc --noEmit); }
server_tests()     { (cd "$REPO_ROOT/colyseus-server" && npm test); }
server_format()    { (cd "$REPO_ROOT/colyseus-server" && npm run format:check); }

# nakama is bundled into the Nakama runtime; a type error here breaks InitModule.
nakama_typecheck() { (cd "$REPO_ROOT/nakama" && npx tsc --noEmit); }
nakama_tests()     { (cd "$REPO_ROOT/nakama" && npx jest); }

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
  (cd "$REPO_ROOT/client/react-client" && CI=true npm test)
}

# The combat balance model gates itself (G1-G12) and fails on spec staleness.
# Skipped cleanly on branches predating the combat lab rather than failing them.
combat_lab() {
  if [ ! -f "$REPO_ROOT/tools/combat-lab/verify.mjs" ]; then
    echo "no tools/combat-lab on this branch — skipping"
    return 0
  fi
  node "$REPO_ROOT/tools/combat-lab/verify.mjs"
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
  ( cd "$REPO_ROOT/tools/art-forge" && node --test tests/*.test.mjs )
}

storybook_tests() {
  # F-038: taxonomy resolution, thumb-index join, verdict store. Pure modules,
  # so they run here with no browser and no Blender.
  ( cd "$REPO_ROOT" && node --test tools/asset-storybook/tests/*.test.mjs )
}

# --- Execute -----------------------------------------------------------------
[ "$RUN_INSTALL" -eq 1 ] && run_section "deps: pnpm workspace install" deps_install
run_section "contracts: tsc build"          contracts_build
run_section "contracts: jest suite"         contracts_tests
run_section "server: tsc --noEmit"          server_typecheck
run_section "server: jest suite"            server_tests
run_section "server: prettier format"       server_format
run_section "nakama: tsc --noEmit"          nakama_typecheck
run_section "nakama: jest suite"            nakama_tests
run_section "client: react-client suite"    client_tests
run_section "system deps: binary check (scripts/system-deps.json)" system_deps_check
run_section "art-forge: node --test suite"  art_forge_tests
run_section "asset-storybook: node --test suite" storybook_tests
run_section "combat-lab: model gates"       combat_lab
run_section "content: spine gates (--only=spine)" content_spine
run_section "world digest (G-WORLD-DIGEST)" world_digest

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
if [ "$EXIT" -eq 0 ]; then
  echo "RESULT: GATE 1 PASS — feature is ship-clean"
else
  echo "RESULT: GATE 1 FAILURES ABOVE ☝ — do not ship"
fi
exit "$EXIT"
