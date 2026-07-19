#!/usr/bin/env bash
set -uo pipefail

# =============================================================================
# test_all.sh — run the full local test suite for Atlas World in one shot:
#   • server  : colyseus-server jest suite + schema-contract tests
#   • client  : react-client suite (single run, non-watch)
#   • e2e     : (opt-in) scripts/e2e-meta.sh — live Nakama meta RPC pipeline
#
# Worktree-aware: operates on whatever checkout you invoke it from, so it also
# works from a linked git worktree (e.g. a release/ or feature/ worktree).
#
# Usage:
#   ./scripts/test_all.sh                # server (jest + contracts) + client
#   ./scripts/test_all.sh --e2e          # also run the docker-backed e2e-meta.sh
#   ./scripts/test_all.sh --no-contracts # skip the schema-contract tests
#   ./scripts/test_all.sh --no-client    # server only (jest + contracts)
#   ./scripts/test_all.sh --server-only  # server jest only (no contracts, no client)
#
# Exit code: 0 only if every selected section passes; 1 if any section fails.
# =============================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MAIN_ROOT="$(git worktree list --porcelain 2>/dev/null | awk 'NR==1{print $2}')"
echo "📂 Working tree: $REPO_ROOT"
[ -n "$MAIN_ROOT" ] && [ "$REPO_ROOT" != "$MAIN_ROOT" ] && \
  echo "   ↳ linked worktree (primary checkout: $MAIN_ROOT)"

# --- Flags -------------------------------------------------------------------
RUN_CONTRACTS=1
RUN_CLIENT=1
RUN_E2E=0
for arg in "$@"; do
  case "$arg" in
    --e2e)          RUN_E2E=1 ;;
    --no-contracts) RUN_CONTRACTS=0 ;;
    --no-client)    RUN_CLIENT=0 ;;
    --server-only)  RUN_CLIENT=0; RUN_CONTRACTS=0 ;;
    -h|--help)
      # Print only the leading banner block (first ===== ... ===== fence).
      awk '/^# ===/{n++} n>=1{sub(/^# ?/,""); print} n>=2{exit}' "$0"
      exit 0 ;;
    *)
      echo "❌ unknown flag: $arg (see --help)"; exit 2 ;;
  esac
done

# --- Result tracking ---------------------------------------------------------
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

# --- Dependency guard --------------------------------------------------------
# Fail loudly with an actionable message rather than let a suite die on a
# cryptic "command not found". Checks for the actual runner binary, not just a
# node_modules dir — a linked worktree can carry a partial/stub install.
need_deps() {
  local dir="$1" label="$2" bin="$3"
  if [ ! -x "$dir/node_modules/.bin/$bin" ]; then
    echo "❌ $label: '$bin' not installed under $dir/node_modules"
    echo "   run:  (cd $dir && npm ci)"
    return 1
  fi
}

# --- Section runners ---------------------------------------------------------
server_jest() {
  need_deps "$REPO_ROOT/colyseus-server" "server" jest || return 1
  (cd "$REPO_ROOT/colyseus-server" && npm test)
}

server_contracts() {
  need_deps "$REPO_ROOT/colyseus-server" "server" jest || return 1
  (cd "$REPO_ROOT/colyseus-server" && npm run test:contracts)
}

client_tests() {
  need_deps "$REPO_ROOT/client/react-client" "client" react-scripts || return 1
  # CI=true makes react-scripts run once and exit (no interactive watch).
  (cd "$REPO_ROOT/client/react-client" && CI=true npm test)
}

e2e_meta() {
  bash "$REPO_ROOT/scripts/e2e-meta.sh"
}

# --- Execute -----------------------------------------------------------------
run_section "server: jest suite" server_jest
[ "$RUN_CONTRACTS" -eq 1 ] && run_section "server: schema contracts" server_contracts
[ "$RUN_CLIENT" -eq 1 ]    && run_section "client: react-client suite" client_tests
[ "$RUN_E2E" -eq 1 ]       && run_section "e2e: Nakama meta pipeline" e2e_meta

# --- Summary -----------------------------------------------------------------
echo ""
echo "======================================================================"
echo " TEST SUMMARY"
echo "======================================================================"
EXIT=0
for i in "${!SECTION_NAMES[@]}"; do
  printf ' %-4s  %s\n' "${SECTION_RESULTS[$i]}" "${SECTION_NAMES[$i]}"
  [ "${SECTION_RESULTS[$i]}" = "FAIL" ] && EXIT=1
done
echo "======================================================================"
if [ "$EXIT" -eq 0 ]; then
  echo "RESULT: ALL PASS"
else
  echo "RESULT: FAILURES ABOVE ☝"
fi
exit "$EXIT"
