#!/usr/bin/env bash
# Regenerate MetaTypes.cs + Content/ into a temp dir and diff against:
#   1. git HEAD's committed content — catches "source changed but generated
#      output wasn't regenerated+committed". Reads only from git (never the
#      mutable on-disk file), so this leg is immune to execution order: an
#      earlier codegen step in the same run overwriting the live file can't
#      hide drift from it.
#   2. the current on-disk committed file/dir — catches a generated file that
#      was hand-edited (drifted from the generator) but not committed yet.
#      This leg is only meaningful if nothing has regenerated it yet this
#      run, which is why test_contracts.sh runs the drift checks BEFORE the
#      codegen step (gen-csharp.sh, whose meta stage overwrites these same
#      paths).
# Non-zero exit on any drift from either check — mirrors check_drift.sh's
# role for the @colyseus/schema-based codegen.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"                  # colyseus-server/
CONTRACTS="$(cd "$ROOT/../contracts" && pwd)"       # contracts/
REPO_ROOT="$(git -C "$ROOT" rev-parse --show-toplevel)"
TYPES="$CONTRACTS/src/meta/types.ts"
REL_CS="colyseus-server/generated/csharp/Runtime/MetaTypes.cs"
REL_CONTENT="colyseus-server/generated/csharp/Runtime/Content"
LIVE_CS="$ROOT/generated/csharp/Runtime/MetaTypes.cs"
LIVE_CONTENT="$ROOT/generated/csharp/Runtime/Content"

TMP_CS="$(mktemp -d)/MetaTypes.cs"
TMP_CONTENT="$(mktemp -d)"
HEAD_CS="$(mktemp -d)/MetaTypes.cs"
HEAD_CONTENT="$(mktemp -d)"

"$ROOT/node_modules/.bin/ts-node" --transpile-only \
  "$HERE/gen-csharp-meta.ts" "$TYPES" "$TMP_CS"
cp "$CONTRACTS/content"/*.json "$TMP_CONTENT/"

# Reconstruct the pristine committed content from git HEAD (leg 1's reference).
git -C "$REPO_ROOT" show "HEAD:$REL_CS" >"$HEAD_CS"
git -C "$REPO_ROOT" ls-tree -r --name-only HEAD -- "$REL_CONTENT" | while IFS= read -r f; do
  git -C "$REPO_ROOT" show "HEAD:$f" >"$HEAD_CONTENT/$(basename "$f")"
done

fail=0

if ! diff -u "$HEAD_CS" "$TMP_CS" >/tmp/meta-cs-drift-head.diff 2>&1; then
  echo "❌ drift: git HEAD's MetaTypes.cs differs from fresh generation"
  cat /tmp/meta-cs-drift-head.diff
  fail=1
fi
if ! diff -r "$HEAD_CONTENT" "$TMP_CONTENT" >/tmp/meta-content-drift-head.diff 2>&1; then
  echo "❌ drift: git HEAD's Runtime/Content differs from contracts/content"
  cat /tmp/meta-content-drift-head.diff
  fail=1
fi

if [ -f "$LIVE_CS" ] && ! diff -u "$LIVE_CS" "$TMP_CS" >/tmp/meta-cs-drift-live.diff 2>&1; then
  echo "❌ drift: on-disk MetaTypes.cs differs from fresh generation (hand-edited?)"
  cat /tmp/meta-cs-drift-live.diff
  fail=1
fi
if [ -d "$LIVE_CONTENT" ] && ! diff -r "$LIVE_CONTENT" "$TMP_CONTENT" >/tmp/meta-content-drift-live.diff 2>&1; then
  echo "❌ drift: on-disk Runtime/Content differs from contracts/content"
  cat /tmp/meta-content-drift-live.diff
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "✅ drift(meta): generated output matches committed (HEAD + on-disk)"
else
  echo "   run 'bash scripts/codegen/gen-csharp-meta.sh' and commit"
fi
exit $fail
