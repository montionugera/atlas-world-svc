#!/usr/bin/env bash
# Regenerate MetaTypes.cs + Content/ into a temp dir and diff against the
# committed generated/csharp/Runtime/. Non-zero exit on any drift — mirrors
# check_drift.sh's role for the @colyseus/schema-based codegen.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"                  # colyseus-server/
CONTRACTS="$(cd "$ROOT/../contracts" && pwd)"       # contracts/
TYPES="$CONTRACTS/src/meta/types.ts"
COMMITTED_CS="$ROOT/generated/csharp/Runtime/MetaTypes.cs"
COMMITTED_CONTENT="$ROOT/generated/csharp/Runtime/Content"

TMP_CS="$(mktemp -d)/MetaTypes.cs"
TMP_CONTENT="$(mktemp -d)"

"$ROOT/node_modules/.bin/ts-node" --transpile-only \
  "$HERE/gen-csharp-meta.ts" "$TYPES" "$TMP_CS"
cp "$CONTRACTS/content"/*.json "$TMP_CONTENT/"

fail=0
if ! diff -u "$COMMITTED_CS" "$TMP_CS" >/tmp/meta-cs-drift.diff 2>&1; then
  echo "❌ drift: committed MetaTypes.cs differs from fresh generation"
  cat /tmp/meta-cs-drift.diff
  fail=1
fi
if ! diff -r "$COMMITTED_CONTENT" "$TMP_CONTENT" >/tmp/meta-content-drift.diff 2>&1; then
  echo "❌ drift: committed Runtime/Content differs from contracts/content"
  cat /tmp/meta-content-drift.diff
  fail=1
fi

if [ $fail -eq 0 ]; then
  echo "✅ drift(meta): generated output matches committed"
else
  echo "   run 'bash scripts/codegen/gen-csharp-meta.sh' and commit"
fi
exit $fail
