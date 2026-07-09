#!/usr/bin/env bash
# Regenerate C# meta-system DTOs (MetaTypes.cs) from contracts/src/meta/types.ts,
# and mirror the starter content catalogs (items/skills/quests JSON) into the
# generated Unity package so the client can ship with the same starter data.
# Idempotent — safe to re-run. Output under generated/csharp/Runtime/ is committed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"                 # colyseus-server/
CONTRACTS="$(cd "$ROOT/../contracts" && pwd)"      # contracts/
TYPES="$CONTRACTS/src/meta/types.ts"
OUT_CS="$ROOT/generated/csharp/Runtime/MetaTypes.cs"
CONTENT_OUT="$ROOT/generated/csharp/Runtime/Content"

"$ROOT/node_modules/.bin/ts-node" --transpile-only \
  "$HERE/gen-csharp-meta.ts" "$TYPES" "$OUT_CS"

rm -rf "$CONTENT_OUT"
mkdir -p "$CONTENT_OUT"
cp "$CONTRACTS/content"/*.json "$CONTENT_OUT/"

echo "codegen: wrote C# meta types to $OUT_CS"
echo "codegen: copied catalog JSON to $CONTENT_OUT"
