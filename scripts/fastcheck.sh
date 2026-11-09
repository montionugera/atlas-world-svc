#!/usr/bin/env bash
set -uo pipefail

# =============================================================================
# fastcheck.sh — <15s targeted mid-iteration verifier (+ optional Jev triage).
#
# Use during development BEFORE `psrw ship`: runs ONLY the unit/compile checks
# touched by your current git diff against main/release, instead of paying the
# full 5-15 min Gate 1 (`precheck.sh`) tax on every iteration.
#
# Usage:
#   ./scripts/fastcheck.sh            # check files changed vs gate base
#   ./scripts/fastcheck.sh --jev      # also run 350ms Jev diff review-lens triage
# =============================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

WITH_JEV=0
for arg in "$@"; do
  case "$arg" in
    --jev) WITH_JEV=1 ;;
    -h|--help)
      sed -n '4,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "❌ unknown flag: $arg"; exit 2 ;;
  esac
done

START=$SECONDS
BASE="$("$REPO_ROOT/scripts/precheck.sh" --print-gate-base 2>/dev/null || git merge-base HEAD origin/main 2>/dev/null || echo HEAD~1)"
CHANGED="$( { git -c core.quotePath=false diff --name-only --no-renames "$BASE" -- 2>/dev/null; git -c core.quotePath=false ls-files --others --exclude-standard 2>/dev/null; } | sort -u )"

if [ -z "$CHANGED" ]; then
  echo "⚡ fastcheck: no changed files against $BASE (0s)"
  exit 0
fi

echo "⚡ fastcheck against ${BASE:0:9} ($(printf '%s\n' "$CHANGED" | wc -l | tr -d ' ') changed file(s)):"
printf '%s\n' "$CHANGED" | sed 's/^/  • /' | head -n 15

FAIL=0
run_step() {
  local label="$1"; shift
  local t0=$SECONDS
  echo ""
  echo "▶ $label"
  if "$@"; then
    echo "✅ $label ($((SECONDS - t0))s)"
  else
    echo "❌ $label FAILED ($((SECONDS - t0))s)"
    FAIL=1
  fi
}

# 1. Contracts
if grep -qE '^contracts/' <<<"$CHANGED"; then
  run_step "contracts: build & jest" bash -c "cd '$REPO_ROOT/contracts' && npm run build && npx jest --maxWorkers=2 --bail"
fi

# 2. Rust server-rs (cargo check --tests is ~5x faster than full clippy+test)
if [ "$("$REPO_ROOT/scripts/precheck.sh" --print-rust-selector <<<"$CHANGED" 2>/dev/null)" = "RUN" ]; then
  export PATH="$HOME/.cargo/bin:$PATH"
  run_step "server-rs: cargo fmt & cargo check --tests" bash -c "cd '$REPO_ROOT/server-rs' && cargo fmt --check && cargo check --tests --jobs 2"
fi

# 3. React client
if grep -qE '^client/react-client/' <<<"$CHANGED"; then
  run_step "client: tsc --noEmit" bash -c "cd '$REPO_ROOT/client/react-client' && npx tsc --noEmit"
fi

# 4. Direct test files touched under scripts/tests or atelier/*/tests
DIRECT_MJS="$(grep -E '^(scripts/tests|atelier/[^/]+/tests)/.*\.test\.mjs$' <<<"$CHANGED" || true)"
if [ -n "$DIRECT_MJS" ]; then
  # shellcheck disable=SC2086
  run_step "node --test (touched test files)" node --test $DIRECT_MJS
fi

# 5. Content spine / digest quick check (~1s)
if grep -qE '^content/' <<<"$CHANGED"; then
  run_step "content: spine & world digest" bash -c "node '$REPO_ROOT/scripts/check_content.mjs' --only=spine && node '$REPO_ROOT/scripts/check_world_digest.mjs' --check"
fi

# 6. Python scripts syntax / quick check
PY_TOUCHED="$(grep -E '^scripts/.*\.py$' <<<"$CHANGED" || true)"
if [ -n "$PY_TOUCHED" ]; then
  # shellcheck disable=SC2086
  run_step "python3 py_compile" python3 -m py_compile $PY_TOUCHED
fi

# 7. Optional Jev System-1 triage (~350ms)
if [ "$WITH_JEV" -eq 1 ] && command -v jev-gate >/dev/null 2>&1; then
  echo ""
  echo "▶ jev-gate triage-diff"
  jev-gate triage-diff --repo "$REPO_ROOT" --base "$BASE" --head HEAD --hook-line || true
fi

echo ""
echo "⚡ fastcheck finished in $((SECONDS - START))s (exit $FAIL)"
exit "$FAIL"
