#!/usr/bin/env bash
# Headless bake: <src.blend> -> stamped <out.glb>
#
# Usage: bake.sh <src.blend> <out.glb>
#
# Resolves $BLENDER (defaults to the macOS app bundle path), runs
# bake_export.py inside Blender to produce the GLB, then stamps it with
# provenance (blender version, blend sha256) via stamp.mjs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"

if [[ $# -ne 2 ]]; then
  echo "usage: bake.sh <src.blend> <out.glb>" >&2
  exit 1
fi

SRC_BLEND="$1"
OUT_GLB="$2"

if [[ ! -x "$BLENDER" ]]; then
  echo "bake.sh: ERROR: Blender not found (or not executable) at '$BLENDER'. Set \$BLENDER to override the default path." >&2
  exit 1
fi

if [[ ! -f "$SRC_BLEND" ]]; then
  echo "bake.sh: ERROR: source .blend not found: $SRC_BLEND" >&2
  exit 1
fi

# Blender quirk (verified on 4.5.11 LTS/macOS): an unhandled exception inside
# a --python script does NOT make Blender exit non-zero. bake_export.py works
# around this by calling sys.exit(1) explicitly on every failure path
# (Blender <4.5, no armature, export exception), so a non-zero exit here is a
# real hard-fail and `set -e` below will stop the script. On success,
# bake_export.py prints one line prefixed "BAKE_RESULT:" containing a JSON
# blob with the resolved Blender version -- we scrape that instead of
# reparsing `$BLENDER --version`.
BAKE_OUTPUT="$("$BLENDER" -b "$SRC_BLEND" --python "$SCRIPT_DIR/bake_export.py" -- --out "$OUT_GLB")"
echo "$BAKE_OUTPUT"

RESULT_LINE="$(printf '%s\n' "$BAKE_OUTPUT" | grep '^BAKE_RESULT:' || true)"
if [[ -z "$RESULT_LINE" ]]; then
  echo "bake.sh: ERROR: bake_export.py did not report a BAKE_RESULT line (see Blender output above)" >&2
  exit 1
fi

if [[ ! -f "$OUT_GLB" ]]; then
  echo "bake.sh: ERROR: expected output glb not found after export: $OUT_GLB" >&2
  exit 1
fi

RESULT_JSON="${RESULT_LINE#BAKE_RESULT:}"
BLENDER_VERSION="$(node -e "console.log(JSON.parse(process.argv[1]).blender)" "$RESULT_JSON")"
BLEND_SHA="$(shasum -a 256 "$SRC_BLEND" | cut -d' ' -f1)"

node "$SCRIPT_DIR/stamp.mjs" "$OUT_GLB" --blender "$BLENDER_VERSION" --blend-sha "$BLEND_SHA"
