"""Headless Blender bake/export step.

Runs *inside* Blender (invoked via `blender -b <src.blend> --python bake_export.py -- --out <out.glb>`).
Loads the already-open .blend scene, validates it, and exports a GLB with
modifiers applied, animations, and skins baked in.

Important Blender quirk (verified on Blender 4.5.11 LTS, macOS): an *unhandled*
Python exception (including a failed `assert`) inside a `--python` script does
NOT make the `blender` process exit non-zero -- Blender prints the traceback
and still exits 0. That defeats `bake.sh`'s `set -e` hard-fail requirement, so
every failure path here must call `sys.exit(1)` explicitly after printing a
clear message to stderr, rather than relying on a bare `assert`/exception to
propagate.
"""

import bpy
import sys
import json
import traceback

# Marker prefix so bake.sh can reliably locate our JSON result line even when
# other addons (e.g. a locally-installed BlenderMCP addon) print unrelated
# noise to stdout during startup/shutdown.
RESULT_MARKER = "BAKE_RESULT:"


def fail(message):
    print(f"bake_export.py: ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def main():
    if "--" not in sys.argv:
        fail("expected arguments after '--' (e.g. -- --out <path>)")
    argv = sys.argv[sys.argv.index("--") + 1 :]

    if "--out" not in argv:
        fail("missing required --out <path> argument")
    out = argv[argv.index("--out") + 1]

    if bpy.app.version < (4, 5):
        fail(f"Blender >=4.5 required, got {bpy.app.version}")

    if not any(o.type == "ARMATURE" for o in bpy.data.objects):
        fail("no armature in scene")

    try:
        bpy.ops.export_scene.gltf(
            filepath=out,
            export_format="GLB",
            export_apply=True,  # apply modifiers/transforms
            export_animations=True,
            export_skins=True,
            export_yup=True,  # glTF +Y up
            export_image_format="AUTO",
        )
    except Exception:
        traceback.print_exc(file=sys.stderr)
        fail("glTF export raised an exception (see traceback above)")

    print(
        RESULT_MARKER
        + json.dumps(
            {
                "ok": True,
                "out": out,
                "blender": ".".join(map(str, bpy.app.version)),
            }
        )
    )
    sys.exit(0)


main()
