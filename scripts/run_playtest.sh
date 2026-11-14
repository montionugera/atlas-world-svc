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

for glb in "$CLIENT_DIR"/studio-cache/*.glb; do
  [ -e "$glb" ] || continue
  if [ ! -f "$glb.import" ] || [ "$glb" -nt "$glb.import" ]; then
    echo "1b. Importing updated studio-cache GLBs into Godot..."
    "$GODOT_BIN" --headless --path "$CLIENT_DIR" --import >/dev/null 2>&1 || true
    for g in "$CLIENT_DIR"/studio-cache/*.glb; do
      [ -f "$g.import" ] && touch "$g.import" || true
    done
    break
  fi
done

echo "2. Building GameClient C# assembly..."
dotnet build "$CLIENT_DIR/GameClient.csproj" --nologo -v q

export ATLAS_MAP_ID="${ATLAS_MAP_ID:-maro-bell}"
if [ "${1:-}" = "--verify" ]; then
  shift
  echo "3. Running Headless PlaytestSandboxVerify Gate..."
  export ATLAS_VERIFY_PLAYTEST_SANDBOX=1
  exec "$GODOT_BIN" --headless --path "$CLIENT_DIR" res://scenes/PlaytestSandbox.tscn "$@"
fi

echo "3. Launching Interactive Playtest Sandbox (Maro Bell, 1440x900)..."
exec "$GODOT_BIN" --path "$CLIENT_DIR" --resolution 1440x900 res://scenes/PlaytestSandbox.tscn "$@"
