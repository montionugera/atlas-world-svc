# Headless Blender poster bake for the asset storybook (F-038).
#
# Reads a JSON job file [[abs_src_glb, abs_out_webp], ...] and renders one
# 256x256 transparent WEBP per model, all inside ONE Blender process. Batching
# matters: per-process startup is ~2s, so 21 models measured 0.94s each here
# versus 4.2s when each got its own process.
#
# The rig is deliberately IDENTICAL for every asset — same two suns, same
# elevation, same FOV. An art-direction review is only meaningful if the
# differences you see are differences in the asset, not in how it was shot.
# The one thing that adapts is azimuth: an elongated object is turned so its
# long axis runs diagonally across the square frame instead of spanning one
# edge as a sliver. Shading response is untouched by that rotation.
#
# Blender does NOT exit non-zero on an unhandled Python exception (see
# tools/asset-forge/bake.sh), so every failure path prints a BAKE_FAIL: line
# and the caller counts them rather than trusting the exit code.
#
# Usage: blender -b --factory-startup --python bake_poster.py -- jobs.json

import bpy
import sys
import math
import json
import os
import time

import mathutils

argv = sys.argv[sys.argv.index("--") + 1:]
jobs = json.load(open(argv[0]))

RESOLUTION = 256
FILL_RATIO = 2.0     # camera distance as a multiple of the model's max extent
ELEVATION = 0.45     # fixed vertical component of the camera offset
ELONGATION_RATIO = 3.0  # width:depth beyond which a model counts as elongated


def world_bounds(objs):
    pts = [o.matrix_world @ mathutils.Vector(c)
           for o in objs for c in o.bound_box]
    mn = mathutils.Vector((min(p.x for p in pts),
                           min(p.y for p in pts),
                           min(p.z for p in pts)))
    mx = mathutils.Vector((max(p.x for p in pts),
                           max(p.y for p in pts),
                           max(p.z for p in pts)))
    return mn, mx


def azimuth_for(dx, dy):
    """Fixed 0.72 for ordinary shapes; swung toward the diagonal for
    elongated ones so a spear fills the tile instead of slicing it."""
    lo = min(dx, dy)
    if lo <= 0:
        return 0.72
    if max(dx, dy) / lo < ELONGATION_RATIO:
        return 0.72
    return 1.0 if dx >= dy else 0.35


for src, out in jobs:
    t0 = time.time()
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=src)
    except Exception as e:  # noqa: BLE001 - report and continue the batch
        print("BAKE_FAIL:%s:import %s" % (src, e))
        continue

    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not objs:
        print("BAKE_FAIL:%s:no-mesh" % src)
        continue

    try:
        mn, mx = world_bounds(objs)
        ctr = (mn + mx) / 2
        dx, dy, dz = (mx - mn).x, (mx - mn).y, (mx - mn).z
        size = max(dx, dy, dz) or 1.0

        cam_data = bpy.data.cameras.new("Cam")
        cam = bpy.data.objects.new("Cam", cam_data)
        bpy.context.scene.collection.objects.link(cam)
        bpy.context.scene.camera = cam

        az = azimuth_for(dx, dy)
        d = size * FILL_RATIO
        cam.location = ctr + mathutils.Vector((d * az, -d * az, d * ELEVATION))
        cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()

        key = bpy.data.lights.new("Key", 'SUN')
        key_obj = bpy.data.objects.new("Key", key)
        bpy.context.scene.collection.objects.link(key_obj)
        key_obj.rotation_euler = (math.radians(55), 0, math.radians(35))
        key.energy = 3.5

        fill = bpy.data.lights.new("Fill", 'SUN')
        fill_obj = bpy.data.objects.new("Fill", fill)
        bpy.context.scene.collection.objects.link(fill_obj)
        fill_obj.rotation_euler = (math.radians(65), 0, math.radians(-120))
        fill.energy = 1.2

        scene = bpy.context.scene
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
        scene.render.resolution_x = RESOLUTION
        scene.render.resolution_y = RESOLUTION
        scene.render.film_transparent = True
        scene.render.image_settings.file_format = 'WEBP'
        scene.render.image_settings.color_mode = 'RGBA'
        scene.render.image_settings.quality = 85
        scene.render.filepath = out
        bpy.ops.render.render(write_still=True)
    except Exception as e:  # noqa: BLE001
        print("BAKE_FAIL:%s:render %s" % (src, e))
        continue

    if not os.path.exists(out):
        print("BAKE_FAIL:%s:no-output" % src)
        continue

    print("BAKE_OK:%s:%.2fs" % (os.path.basename(out), time.time() - t0))
