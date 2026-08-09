#!/usr/bin/env bash
# Emit generated/spawn-areas.json — the runtime spawn table's (id, mobType,
# count) triples consumed by the content gate's G-SPAWN-PAIR rule (F-031).
# Reads the live server config via ts-node. Idempotent; output is committed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"          # colyseus-server/
OUT="$ROOT/generated/spawn-areas.json"

"$ROOT/node_modules/.bin/ts-node" --transpile-only \
  "$HERE/gen-spawn-areas.ts" "$OUT"

echo "codegen: wrote spawn areas to $OUT"
