#!/usr/bin/env bash
# Emit generated/asset-keys.json — the renderable/audible server type-id key set
# (single source of truth for the client asset manifest + CI drift-gate, D3).
# Reads the live server configs via ts-node. Idempotent; output is committed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"          # colyseus-server/
OUT="$ROOT/generated/asset-keys.json"

"$ROOT/node_modules/.bin/ts-node" --transpile-only \
  "$HERE/gen-asset-keys.ts" "$OUT"

echo "codegen: wrote asset keys to $OUT"
