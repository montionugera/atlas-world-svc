#!/usr/bin/env bash
# Regenerate C# into a temp dir and diff against the committed Runtime/.
# Non-zero exit on any drift — this is the CI gate that makes stale output impossible.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
STRIP="$(mktemp -d)"

# Same pipeline as gen-csharp.sh, but into a throwaway dir (isolator under src/codegen).
"$ROOT/node_modules/.bin/ts-node" --transpile-only \
  "$ROOT/src/codegen/run-isolate.ts" "$ROOT/src/schemas" "$STRIP"
node "$ROOT/node_modules/@colyseus/schema/bin/schema-codegen" \
  "$STRIP"/*.ts --output "$TMP" --csharp --namespace AtlasWorld.Schema >/dev/null

if diff -r "$TMP" "$ROOT/generated/csharp/Runtime" >/dev/null; then
  echo "✅ drift: generated output matches committed"
else
  echo "❌ drift: committed Runtime/ differs from fresh generation — run 'npm run client:csharp' and commit"
  diff -r "$TMP" "$ROOT/generated/csharp/Runtime" || true
  exit 1
fi
