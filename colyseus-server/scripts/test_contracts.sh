#!/usr/bin/env bash
# Unified contracts test suite (mirrors quant/scripts/test_all.sh).
# Runs every contracts check, prints a ✅/❌ summary, exits non-zero if any fail.
SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPTS/.." && pwd)"
cd "$ROOT"
JEST="./node_modules/.bin/jest"

# Drift checks run BEFORE codegen on purpose: gen-csharp.sh (and its
# gen-csharp-meta.sh stage) overwrite the committed generated/csharp/Runtime/
# tree in place. If codegen ran first, the drift checks would always diff a
# just-regenerated file against itself and could never detect real drift
# (stale committed output, or a hand-edit that was never regenerated).
echo "▶ drift";         bash scripts/codegen/check_drift.sh;                   DRIFT=$?
echo "▶ drift(meta)";   bash scripts/codegen/check_drift_meta.sh;              DRIFT_META=$?
echo "▶ codegen";       bash scripts/codegen/gen-csharp.sh;                     GEN=$?
echo "▶ smoke";         bash scripts/codegen/smoke_contracts.sh;               SMOKE=$?
echo "▶ schema jest";   "$JEST" src/tests --silent;                           JEST_RC=$?
echo "▶ package shape"; "$JEST" src/tests/codegen/package-shape.test.ts --silent; PKG=$?

echo ""
echo "==========================================="
echo "   Contracts Test Summary"
echo "==========================================="
row() { [ "$2" -eq 0 ] && echo "✅ $1" || echo "❌ $1"; }
row "drift check    " $DRIFT
row "drift check meta" $DRIFT_META
row "codegen        " $GEN
row "smoke fields   " $SMOKE
row "schema jest    " $JEST_RC
row "package shape  " $PKG

[ $GEN -eq 0 ] && [ $SMOKE -eq 0 ] && [ $DRIFT -eq 0 ] && [ $DRIFT_META -eq 0 ] && [ $JEST_RC -eq 0 ] && [ $PKG -eq 0 ] || exit 1
exit 0
