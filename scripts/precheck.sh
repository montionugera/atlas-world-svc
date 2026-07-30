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
deps_install() {
  command -v pnpm >/dev/null 2>&1 || { echo "pnpm not found — run: corepack enable"; return 1; }
  (cd "$REPO_ROOT" && pnpm install --frozen-lockfile)
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

# The combat balance model gates itself (G1-G12) and fails on spec staleness.
# Skipped cleanly on branches predating the combat lab rather than failing them.
combat_lab() {
  if [ ! -f "$REPO_ROOT/tools/combat-lab/verify.mjs" ]; then
    echo "no tools/combat-lab on this branch — skipping"
    return 0
  fi
  node "$REPO_ROOT/tools/combat-lab/verify.mjs"
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
run_section "combat-lab: model gates"       combat_lab

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
