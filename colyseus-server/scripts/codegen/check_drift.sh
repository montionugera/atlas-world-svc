#!/usr/bin/env bash
# Regenerate C# into a temp dir and diff it against:
#   1. git HEAD's committed Runtime/ tree — catches "schema/meta source
#      changed but generated output wasn't regenerated+committed". Reads only
#      from git (never the mutable on-disk file), so this leg is immune to
#      execution order: an earlier codegen step in the same run overwriting
#      the live file can't hide drift from it.
#   2. the current on-disk Runtime/ tree — catches a generated file that was
#      hand-edited (drifted from the generator) but not committed yet. This
#      leg is only meaningful if nothing has regenerated the tree yet this
#      run, which is why test_contracts.sh runs the drift checks BEFORE the
#      codegen step (gen-csharp.sh) that overwrites this same directory.
# Non-zero exit on any drift from either check — this is the CI gate that
# makes stale or hand-edited output impossible.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CONTRACTS="$(cd "$ROOT/../contracts" && pwd)"
REPO_ROOT="$(git -C "$ROOT" rev-parse --show-toplevel)"
REL_RUNTIME="colyseus-server/generated/csharp/Runtime"
LIVE_RUNTIME="$ROOT/generated/csharp/Runtime"
TMP="$(mktemp -d)"
STRIP="$(mktemp -d)"
HEAD_TREE="$(mktemp -d)"

# Same pipeline as gen-csharp.sh, but into a throwaway dir (isolator under src/codegen).
"$ROOT/node_modules/.bin/ts-node" --transpile-only \
  "$ROOT/src/codegen/run-isolate.ts" "$ROOT/src/schemas" "$STRIP"
node "$ROOT/node_modules/@colyseus/schema/bin/schema-codegen" \
  "$STRIP"/*.ts --output "$TMP" --csharp --namespace AtlasWorld.Schema >/dev/null

# Also regenerate the meta-system DTOs + content mirror into the same throwaway
# dir, so this diff covers the FULL committed Runtime/ tree (schema + meta),
# not just the @colyseus/schema slice. Mirrors gen-csharp.sh's own two-stage
# generation of the same output directory.
"$ROOT/node_modules/.bin/ts-node" --transpile-only \
  "$HERE/gen-csharp-meta.ts" "$CONTRACTS/src/meta/types.ts" "$TMP/MetaTypes.cs"
mkdir -p "$TMP/Content"
cp "$CONTRACTS/content"/*.json "$TMP/Content/"

# Reconstruct the pristine committed tree from git HEAD (leg 1's reference).
git -C "$REPO_ROOT" ls-tree -r --name-only HEAD -- "$REL_RUNTIME" | while IFS= read -r f; do
  rel="${f#"$REL_RUNTIME"/}"
  mkdir -p "$HEAD_TREE/$(dirname "$rel")"
  git -C "$REPO_ROOT" show "HEAD:$f" >"$HEAD_TREE/$rel"
done

fail=0
if ! diff -r "$TMP" "$HEAD_TREE" >/tmp/schema-drift-head.diff 2>&1; then
  echo "❌ drift: git HEAD's Runtime/ differs from fresh generation — run 'npm run client:csharp' and commit"
  cat /tmp/schema-drift-head.diff
  fail=1
fi
if [ -d "$LIVE_RUNTIME" ] && ! diff -r "$TMP" "$LIVE_RUNTIME" >/tmp/schema-drift-live.diff 2>&1; then
  echo "❌ drift: on-disk Runtime/ differs from fresh generation (hand-edited / not committed?)"
  cat /tmp/schema-drift-live.diff
  fail=1
fi

[ "$fail" -eq 0 ] && echo "✅ drift: generated output matches committed (HEAD + on-disk)"
exit $fail
