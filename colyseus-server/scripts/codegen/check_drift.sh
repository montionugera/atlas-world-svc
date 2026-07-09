#!/usr/bin/env bash
# Regenerate C# into a temp dir and diff against the committed Runtime/.
# Non-zero exit on any drift — this is the CI gate that makes stale output impossible.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CONTRACTS="$(cd "$ROOT/../contracts" && pwd)"
TMP="$(mktemp -d)"
STRIP="$(mktemp -d)"

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

if diff -r "$TMP" "$ROOT/generated/csharp/Runtime" >/dev/null; then
  echo "✅ drift: generated output matches committed"
else
  echo "❌ drift: committed Runtime/ differs from fresh generation — run 'npm run client:csharp' and commit"
  diff -r "$TMP" "$ROOT/generated/csharp/Runtime" || true
  exit 1
fi
