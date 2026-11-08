#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="$REPO_ROOT/game-client"
GODOT_BIN="${ATLAS_GODOT_MONO:-$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot}"
if [ ! -x "$GODOT_BIN" ]; then
  GODOT_BIN="$HOME/Applications/Godot_mono.app/Contents/MacOS/Godot"
fi

echo "1. Ensuring Asset Studio pull-only cache is populated..."
node "$REPO_ROOT/scripts/studio-pull.mjs"

echo "2. Building GameClient C# assembly..."
dotnet build "$CLIENT_DIR/GameClient.csproj" --nologo -v q

echo "3. Launching Interactive Playtest Sandbox (Maro Bell, 1440x900)..."
export ATLAS_MAP_ID="${ATLAS_MAP_ID:-maro-bell}"
exec "$GODOT_BIN" --path "$CLIENT_DIR" --resolution 1440x900 res://scenes/PlaytestSandbox.tscn "$@"
