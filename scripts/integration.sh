#!/usr/bin/env bash
set -uo pipefail

# =============================================================================
# integration.sh — Gate 2: the whole-release integration check.
#
# Run by ps-release-workflow `promote` from the _release worktree, immediately
# before the release branch is proposed to main. Gate 1 (ship) checks one
# feature; this checks the assembled release.
#
# Worktree-aware and self-provisioning: a freshly created _release worktree has
# no node_modules, so this installs dependencies before testing rather than
# failing on a missing binary.
#
# NOTE: this repo is a pnpm workspace (colyseus-server, client, contracts,
# nakama) and its packages use the `workspace:*` protocol — `npm install` fails
# here with EUNSUPPORTEDPROTOCOL. Use pnpm at the root. `scripts/` is NOT part
# of the workspace and carries its own npm lockfile.
#
# Usage:
#   ./scripts/integration.sh              # full gate
#   ./scripts/integration.sh --no-install # assume deps are already installed
#
# Exit code: 0 only if every section passes; 1 if any section fails.
# =============================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MAIN_ROOT="$(git worktree list --porcelain 2>/dev/null | awk 'NR==1{print $2}')"
echo "📂 Gate 2 working tree: $REPO_ROOT"
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
  echo "======================================================================"
  echo "▶ $name"
  echo "======================================================================"
  if "$@"; then
    SECTION_NAMES+=("$name"); SECTION_RESULTS+=("PASS")
    echo "✅ $name — PASS"
  else
    SECTION_NAMES+=("$name"); SECTION_RESULTS+=("FAIL")
    echo "❌ $name — FAIL"
  fi
}

# --- Sections ----------------------------------------------------------------

# Workspace deps + the content-gate package, which lives outside the workspace.
# contracts must be BUILT, not just installed: colyseus-server imports
# @atlas/contracts from its dist/, so tsc reports phantom TS2307s without it.
deps_install() {
  command -v pnpm >/dev/null 2>&1 || { echo "pnpm not found — install it (corepack enable)"; return 1; }
  (cd "$REPO_ROOT" && pnpm install --frozen-lockfile) || return 1
  (cd "$REPO_ROOT/scripts" && npm ci) || return 1
  (cd "$REPO_ROOT/contracts" && npm run build)
}

server_build()  { (cd "$REPO_ROOT/colyseus-server" && npm run build); }
server_tests()  { (cd "$REPO_ROOT/colyseus-server" && npm test); }
server_format() { (cd "$REPO_ROOT/colyseus-server" && npm run format:check); }

# The ship bar: escalates orphan/unreachable content warnings to failures.
content_gate()  { node "$REPO_ROOT/scripts/check_content.mjs" --require-complete; }

# docs/story/story-graph.md is generated; a drifted graph means someone edited
# content without regenerating it.
graph_drift()   { node "$REPO_ROOT/scripts/gen_story_graph.mjs" --check; }

# content/maps/cluster1-geography.json is generated from the spine
# (content/spine/nodes/*); drift means someone hand-edited the mirror or
# changed the spine without re-emitting (F-041 G-EMIT-DRIFT).
spine_emit_drift() { node "$REPO_ROOT/scripts/check_spine_emit.mjs" --check; }

content_tests() { (cd "$REPO_ROOT/scripts" && npm test); }

explorer_smoke() { (cd "$REPO_ROOT" && node --test tools/story-explorer/tests/*.test.mjs); }

art_forge_tests() { (cd "$REPO_ROOT" && node --test tools/art-forge/tests/*.test.mjs); }

# F-041 Phase 0: render-map --check is the ONLY existing enforcement of
# town-in-zone containment (render-map.mjs:234-244) and must not go dark
# while the spine migration runs. Wired, never edited (spec §6). --check
# self-checks and writes nothing.
mapforge_check() { node "$REPO_ROOT/tools/mapforge/render-map.mjs" --check; }

# F-042 G-MAP-DRIFT: the committed sheet SVGs (cluster1-world.svg,
# atlas-world.svg) must byte-match tools/mapforge/render-sheet.mjs's SHEETS
# registry rebuilt from the live spine.
map_render_drift() { node "$REPO_ROOT/scripts/check_map_render.mjs"; }

# F-042: mapforge's own unit + parity test suite (basin-sheet, atlas-sheet,
# raster, render-sheet). Glob form, not a directory arg — `node --test
# <directory>` fails on newer Node (ledger ruling, Task 1).
mapforge_tests() { node --test "$REPO_ROOT"/tools/mapforge/tests/*.test.mjs; }

# --- Execute -----------------------------------------------------------------
[ "$RUN_INSTALL" -eq 1 ] && run_section "deps: pnpm workspace + content-gate + contracts build" deps_install
run_section "server: tsc build"            server_build
run_section "server: jest suite"           server_tests
run_section "server: prettier format"      server_format
run_section "content: gate (--require-complete)" content_gate
run_section "content: story-graph drift"   graph_drift
run_section "content: spine emit drift (G-EMIT-DRIFT)" spine_emit_drift
run_section "content: mapforge render --check" mapforge_check
run_section "content: map render drift (G-MAP-DRIFT)" map_render_drift
run_section "content: mapforge test suite" mapforge_tests
run_section "content: gate test suite"     content_tests
run_section "content: story-explorer smoke" explorer_smoke
run_section "art-forge: intake tests" art_forge_tests

# --- Summary -----------------------------------------------------------------
echo ""
echo "======================================================================"
echo " GATE 2 SUMMARY"
echo "======================================================================"
EXIT=0
for i in "${!SECTION_NAMES[@]}"; do
  printf ' %-4s  %s\n' "${SECTION_RESULTS[$i]}" "${SECTION_NAMES[$i]}"
  [ "${SECTION_RESULTS[$i]}" = "FAIL" ] && EXIT=1
done
echo "======================================================================"
if [ "$EXIT" -eq 0 ]; then
  echo "RESULT: GATE 2 PASS — release is integration-clean"
else
  echo "RESULT: GATE 2 FAILURES ABOVE ☝ — do not promote"
fi
exit "$EXIT"
