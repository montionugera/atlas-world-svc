#!/usr/bin/env bash
# Emit generated/mob-types.json — the valid server mob type id set consumed by
# the content gate (scripts/check_content.mjs --mob-types), F-013.
# Reads the live server config via ts-node. Idempotent; output is committed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"          # colyseus-server/
OUT="$ROOT/generated/mob-types.json"

"$ROOT/node_modules/.bin/ts-node" --transpile-only \
  "$HERE/gen-mob-types.ts" "$OUT"

echo "codegen: wrote mob types to $OUT"
