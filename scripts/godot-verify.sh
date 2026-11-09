#!/usr/bin/env bash
# Run one env-gated Godot C# probe on the pinned mono build and require its PASS line (F-174).
# PATH `godot` is the non-mono build: it prints "Can't load script" on C# and still exits 0,
# so neither an exit code nor the PATH binary proves anything. Every Godot call is bounded:
# probes by ATLAS_GODOT_TIMEOUT (default 180 s), the --import of a fresh worktree (~633 glbs) by
# ATLAS_GODOT_IMPORT_TIMEOUT (default 900 s). A call that never quits FAILS, it never hangs.
#   scripts/godot-verify.sh ATLAS_VERIFY_PIPELINE_CHAR '^\[PipelineCharVerify\] VERDICT PASS$'
set -uo pipefail
env_name="${1:?usage: godot-verify.sh <ENV_NAME> <PASS_REGEX>}"
pass_re="${2:?usage: godot-verify.sh <ENV_NAME> <PASS_REGEX>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${ATLAS_GODOT_PROJECT:-$REPO_ROOT/game-client}"
GODOT="${ATLAS_GODOT_MONO:-$HOME/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot}"
SECS="${ATLAS_GODOT_TIMEOUT:-180}"
IMPORT_SECS="${ATLAS_GODOT_IMPORT_TIMEOUT:-900}"
BUILD_SECS="${ATLAS_DOTNET_BUILD_TIMEOUT:-600}"

# bounded <secs> <cmd…>: coreutils timeout/gtimeout when present (both are on this Mac), else perl alarm.
# `-k 10` escalates to SIGKILL 10 s after SIGTERM, so a Godot that ignores SIGTERM cannot hang Gate 1.
# The perl fallback execs the command, so SIGALRM's default action kills it outright.
bounded() {
  local secs="$1"; shift
  local t; t=$(command -v timeout || command -v gtimeout || true)
  if [ -n "$t" ]; then "$t" -k 10 "$secs" "$@"; else perl -e 'alarm shift; exec @ARGV or die "exec: $!"' "$secs" "$@"; fi
}
timed_out() { [ "$1" -eq 124 ] || [ "$1" -eq 137 ] || [ "$1" -eq 142 ]; }   # 124 = timeout(1), 137 = SIGKILL after -k, 142 = SIGALRM (perl)

[ -x "$GODOT" ] || { echo "❌ mono Godot not found: $GODOT (set ATLAS_GODOT_MONO)"; exit 1; }
bounded "$SECS" "$GODOT" --version 2>/dev/null | grep -q '\.mono\.' || { echo "❌ $GODOT is not a mono build"; exit 1; }
bounded "$BUILD_SECS" dotnet build "$PROJECT/GameClient.csproj" -nologo -v q; rc=$?
if timed_out "$rc"; then echo "❌ dotnet build timed out after ${BUILD_SECS}s"; exit 1; fi
[ "$rc" -eq 0 ] || { echo "❌ dotnet build failed"; exit 1; }

# A fresh worktree has no .godot/imported and a fresh pull has no .import sidecar. Import first,
# or the res:// loads fail and the probe reports a confusing "instances a Node3D" FAIL.
needs_import=0
[ -d "$PROJECT/.godot/imported" ] || needs_import=1
for g in "$PROJECT"/studio-cache/*.glb; do
  if [ -e "$g" ]; then
    if [ ! -e "$g.import" ]; then
      needs_import=1
    else
      scn=$(grep -m1 '^path="res://\.godot/imported/' "$g.import" 2>/dev/null | cut -d'"' -f2 | sed 's|^res://||')
      if [ -z "$scn" ] || [ ! -e "$PROJECT/$scn" ]; then needs_import=1; fi
      base="${g%.glb}"
      # Godot gltf/embedded_image_handling=1 extracts embedded textures to <sha>_*.jpg on first import.
      # If the .glb.import was cloned without those extracted textures or their .ctex files, force re-import.
      shopt -s nullglob
      extracted=("${base}"_*.jpg "${base}"_*.png)
      shopt -u nullglob
      if [ "${#extracted[@]}" -eq 0 ]; then
        rm -f "$g.import"
        needs_import=1
      else
        for tex in "${extracted[@]}"; do
          if [ ! -e "$tex.import" ]; then
            needs_import=1
          else
            ctex=$(grep -m1 '^path="res://\.godot/imported/' "$tex.import" 2>/dev/null | cut -d'"' -f2 | sed 's|^res://||')
            if [ -z "$ctex" ] || [ ! -e "$PROJECT/$ctex" ]; then needs_import=1; fi
          fi
        done
      fi
    fi
  fi
done
if [ "$needs_import" = 1 ]; then
  echo "▶ godot --import (fresh worktree or new pull)"
  attempt=1
  max_attempts=3
  while [ "$attempt" -le "$max_attempts" ]; do
    imp=$(bounded "$IMPORT_SECS" "$GODOT" --headless --path "$PROJECT" --import 2>&1); rc=$?
    if timed_out "$rc"; then
      echo "❌ godot --import timed out after ${IMPORT_SECS}s (ATLAS_GODOT_IMPORT_TIMEOUT)"
      printf '%s\n' "$imp" | tail -n 40
      exit 1
    fi
    if [ "$rc" -eq 0 ]; then
      break
    fi
    echo "⚠️ godot --import exited $rc (attempt $attempt/$max_attempts), retrying..."
    attempt=$((attempt + 1))
    sleep 1
  done
  if [ "$rc" -ne 0 ]; then
    echo "❌ godot --import exited $rc after $max_attempts attempts (last 40 lines)"
    printf '%s\n' "$imp" | tail -n 40
    exit 1
  fi
fi

out=$(export "$env_name=1"; bounded "$SECS" "$GODOT" --headless --path "$PROJECT" 2>&1); rc=$?
printf '%s\n' "$out" | grep -E '^\[[A-Za-z]+(Verify|Probe)\]|ERROR|Unhandled'
timed_out "$rc" && { echo "❌ probe $env_name timed out after ${SECS}s (it never quit)"; exit 1; }
[ "$rc" -eq 0 ] || { echo "❌ probe $env_name exited $rc"; exit 1; }
grep -Eq "$pass_re" <<<"$out" || { echo "❌ probe $env_name printed no line matching $pass_re"; exit 1; }
echo "✅ probe $env_name passed"
