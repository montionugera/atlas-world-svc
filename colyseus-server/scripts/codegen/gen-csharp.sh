#!/usr/bin/env bash
# Regenerate the C# schema contracts from src/schemas/*.ts.
#   1. isolate: strip @colyseus/schema classes to their @type fields (drops runtime coupling)
#   2. schema-codegen: emit C# from the clean stripped schemas
# Idempotent — safe to re-run. Output (generated/csharp/Runtime/*.cs) is committed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"          # colyseus-server/
SRC="$ROOT/src/schemas"
STRIP="$ROOT/generated/.schema-src"        # gitignored intermediate
OUT="$ROOT/generated/csharp/Runtime"

rm -rf "$STRIP"
mkdir -p "$STRIP" "$OUT"

# 1. isolate (strip runtime coupling) — isolator lives under src/codegen (tsconfig rootDir)
"$ROOT/node_modules/.bin/ts-node" --transpile-only -e \
  "require('$ROOT/src/codegen/isolate-schemas').isolateSchemas('$SRC','$STRIP')"

# 2. generate C# from the clean stripped schemas
node "$ROOT/node_modules/@colyseus/schema/bin/schema-codegen" \
  "$STRIP"/*.ts --output "$OUT" --csharp --namespace AtlasWorld.Schema

echo "codegen: wrote C# to $OUT"
