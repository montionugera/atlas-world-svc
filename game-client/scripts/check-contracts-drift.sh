#!/usr/bin/env bash
# Drift gate for the copied C# contracts.
#
# The client's src/Contracts/*.cs are COPIES of the server's generated schema
# (colyseus-server/generated/csharp/Runtime/*.cs) with exactly one edit: the
# namespace AtlasWorld.Schema -> AtlasWorld.Contracts (which also removes the CS0118
# base-class shadow — AtlasWorld.Schema shadowed Colyseus.Schema.Schema).
#
# This script proves the copies have NOT drifted from the server source, comparing
# each file after normalizing that single known difference away. Any other difference
# (a field added/removed/reordered on the server, a hand-edit to a copy) is drift and
# exits non-zero.
#
#   --regen   regenerate the server's Runtime/ first (npm run client:csharp) so the
#             comparison is against a fresh generation, not just the committed tree.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_ROOT="$(cd "$HERE/.." && pwd)"                       # game-client/
REPO_ROOT="$(cd "$CLIENT_ROOT/.." && pwd)"                  # repo (or worktree) root
SERVER_GEN="$REPO_ROOT/colyseus-server/generated/csharp/Runtime"
CLIENT_CONTRACTS="$CLIENT_ROOT/src/Contracts"

if [[ "${1:-}" == "--regen" ]]; then
  echo "regenerating server C# contracts (npm run client:csharp)…"
  ( cd "$REPO_ROOT/colyseus-server" && npm run client:csharp )
fi

if [[ ! -d "$SERVER_GEN" ]]; then
  echo "❌ server generated dir not found: $SERVER_GEN" >&2
  exit 2
fi

# Normalize: strip the client-only namespace rename so the copy reads like its source.
# (Only AtlasWorld.Schema -> AtlasWorld.Contracts was changed; AtlasWorld.Contracts.Meta
#  in MetaTypes.cs is identical on both sides and is left untouched.)
normalize() { sed 's/namespace AtlasWorld\.Contracts {/namespace AtlasWorld.Schema {/'; }

fail=0
count=0
for src in "$SERVER_GEN"/*.cs; do
  base="$(basename "$src")"
  copy="$CLIENT_CONTRACTS/$base"
  count=$((count + 1))
  if [[ ! -f "$copy" ]]; then
    echo "❌ drift: client is missing $base (present in server generated dir)"
    fail=1
    continue
  fi
  if ! diff <(normalize <"$copy") "$src" >/dev/null 2>&1; then
    echo "❌ drift: $base differs from server source"
    diff <(normalize <"$copy") "$src" || true
    fail=1
  fi
done

# Catch extra files in the client copy that no longer exist on the server.
for copy in "$CLIENT_CONTRACTS"/*.cs; do
  base="$(basename "$copy")"
  if [[ ! -f "$SERVER_GEN/$base" ]]; then
    echo "❌ drift: client has orphaned $base (not in server generated dir)"
    fail=1
  fi
done

if [[ "$fail" -eq 0 ]]; then
  echo "✅ contracts drift check: $count file(s) match server source (namespace-normalized)"
fi
exit "$fail"
