#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="$REPO_ROOT/game-client"
GODOT_BIN="/Users/pasitnusso/Applications/Godot_mono.app/Contents/MacOS/Godot"

echo "1. Building GameClient C# assembly..."
dotnet build "$CLIENT_DIR/GameClient.csproj" --nologo -v q

echo "2. Launching Atlas 3D Map Builder Studio on macOS (1440x900)..."
export ATLAS_MAP_BUILDER=1
exec "$GODOT_BIN" --path "$CLIENT_DIR" --resolution 1440x900 "$@"
