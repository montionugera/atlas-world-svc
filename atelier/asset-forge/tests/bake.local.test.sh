#!/usr/bin/env bash
# Local-only end-to-end test for bake.sh. Requires a real Blender install on
# this machine, so it SKIPS (exit 0) rather than fails when Blender isn't
# available -- this keeps it out of CI's critical path while still being
# runnable by hand wherever Blender is installed.
#
# What it does: imports the kenney-mini-characters donor glb into Blender,
# saves it as a throwaway .blend, runs bake.sh against it, then asserts the
# resulting glb has a non-null atlas-forge stamp and an "idle" animation clip.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$FORGE_DIR/../.." && pwd)"

BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"

if [[ ! -x "$BLENDER" ]]; then
  echo "bake.local.test.sh: SKIP (no Blender at '$BLENDER'; set \$BLENDER to run this test)"
  exit 0
fi

DONOR="$REPO_ROOT/art-source/seed/kenney-mini-characters/character-male-b.glb"
if [[ ! -f "$DONOR" ]]; then
  echo "bake.local.test.sh: SKIP (donor glb not found: $DONOR)"
  exit 0
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/forge_bake_test.XXXXXX")"
trap 'rm -rf "$WORKDIR"' EXIT

TEST_BLEND="$WORKDIR/forge_bake_test.blend"
OUT_GLB="$WORKDIR/forge_bake_test.out.glb"

echo "bake.local.test.sh: importing donor '$DONOR' into a throwaway .blend..."
"$BLENDER" -b --python-expr "import bpy; bpy.ops.import_scene.gltf(filepath='$DONOR'); bpy.ops.wm.save_as_mainfile(filepath='$TEST_BLEND')"

if [[ ! -f "$TEST_BLEND" ]]; then
  echo "bake.local.test.sh: FAIL (throwaway .blend was not created: $TEST_BLEND)" >&2
  exit 1
fi

echo "bake.local.test.sh: running bake.sh..."
BLENDER="$BLENDER" "$FORGE_DIR/bake.sh" "$TEST_BLEND" "$OUT_GLB"

echo "bake.local.test.sh: asserting stamp + clips on baked output..."
node --input-type=module -e "
import { loadGlb, readStamp, listClipNames } from '$FORGE_DIR/lib/gltf.mjs';
const doc = await loadGlb('$OUT_GLB');
const stamp = readStamp(doc);
const clips = listClipNames(doc);
if (stamp == null) {
  throw new Error('expected non-null stamp, got null');
}
if (!clips.includes('idle')) {
  throw new Error('expected clips to include idle, got ' + JSON.stringify(clips));
}
console.log('bake.local.test.sh: stamp=' + JSON.stringify(stamp) + ' clips=' + JSON.stringify(clips));
"

echo "bake.local.test.sh: PASS"
