#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="$REPO_ROOT/game-client"
GODOT_BIN="/Users/pasitnusso/Applications/Godot_mono.app/Contents/MacOS/Godot"

echo "1. Building GameClient C# assembly..."
dotnet build "$CLIENT_DIR/GameClient.csproj" --nologo -v q

echo "2. Launching Atlas World on macOS (iPad mini 1133x744 mobile simulation)..."
export ATLAS_SIMULATE_MOBILE="${ATLAS_SIMULATE_MOBILE:-1}"
exec "$GODOT_BIN" --path "$CLIENT_DIR" --resolution 1133x744 "$@"
