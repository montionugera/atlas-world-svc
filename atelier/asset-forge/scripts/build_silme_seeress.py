#!/usr/bin/env python3
"""
Portable Meshy AI Humanoid Silme Seeress Assembler (F-188).

Builds the Silme Seeress (Dark Elf Female) 3D character (`npc:silme_seeress`)
from the Meshy AI multi-image-to-3d generation of the concept turnaround
`content/concept-art/images/character-race-dark-lunar-eclipse-watcher.webp`:
  1. Loads `/tmp/silme-meshy-rigged.glb`, scales crown height to 0.94m, centers XZ,
     grounds feet at Z = 0.000m, and applies all transforms.
  2. Transplants the mouthless porcelain VRoid FaceMesh (Victoria_Rubin.vrm)
     with Dark Elf lavender-violet skin (#9580A8), golden amber / astral violet
     layered anime eyes, upward/forward proxy-sphere normals, and 5 live eye
     morph targets (eye_blink, eye_happy, eye_angry, eye_sorrow, eye_surprised).
  3. Preserves pointed elf ears, celestial indigo/purple & gold gown, and flowing silver-white hair.
  4. Configures 4-link sagittal ponytail spring chain (`sec_hair_c1_1..4`), side hair chains
     (`sec_hair_l1_*`, `sec_hair_r1_*`), cape/skirt chains (`sec_cape_*`), and weapon sockets
     (`prop_weapon_r` -> `handslot.r`).
  5. Transfers all 11 canonical combat & locomotion clips from `/tmp/maro_folk_girl_body_source.glb`
     with dynamic secondary spring wobbles across all animations.
  6. Exports `/tmp/silme_seeress.glb` with `arm.data.pose_position = "POSE"`, then invokes
     `build_mixamo_preset_pack.py` to produce `game-client/studio-cache/silme_seeress.glb`
     and `game-client/studio-cache/mixamo_silme_presets.glb`.
"""

import argparse
import math
import os
import subprocess
import sys
from collections import defaultdict
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Quaternion, Vector, kdtree

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
DEFAULT_MESHY_RIGGED = "/tmp/silme-tpose-rigged.glb"
DEFAULT_TRIPO_RIGGED = "/tmp/tripo_silme/silme_body_rig.model_url.glb"
DEFAULT_LONG_HAIR_GLB = ""
DEFAULT_SOURCE_ANIMS = "/tmp/maro_folk_girl_body_source.glb"
DEFAULT_VROID_FACE = "/Users/pasitnusso/asset-studio-private/atlas-3d-plan/vroid_bases/Victoria_Rubin.vrm"
DEFAULT_VROID_HAIR = "/Users/pasitnusso/asset-studio-private/atlas-3d-plan/vroid_bases/Sendagaya_Shino.vrm"
DEFAULT_OUT_BASE = "/tmp/silme_seeress.glb"
DEFAULT_OUT_CHAR = os.path.join(REPO_ROOT, "game-client/studio-cache/silme_seeress.glb")
DEFAULT_OUT_PRESETS = os.path.join(REPO_ROOT, "game-client/studio-cache/mixamo_silme_presets.glb")
DEFAULT_OUT_CATALOG = "/tmp/silme_catalog.json"


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--meshy-rigged", default=DEFAULT_MESHY_RIGGED)
    ap.add_argument("--tripo-rigged", default=DEFAULT_TRIPO_RIGGED)
    ap.add_argument("--long-hair-glb", default=DEFAULT_LONG_HAIR_GLB)
    ap.add_argument("--source-anims", default=DEFAULT_SOURCE_ANIMS)
    ap.add_argument("--vroid-face", default=DEFAULT_VROID_FACE)
    ap.add_argument("--vroid-hair", default=DEFAULT_VROID_HAIR)
    ap.add_argument("--head-scale", type=float, default=1.0)
    ap.add_argument("--ear-style", default="elf")
    ap.add_argument("--hair-wave", type=float, default=1.0)
    ap.add_argument("--out-base", default=DEFAULT_OUT_BASE)
    ap.add_argument("--out-char", default=DEFAULT_OUT_CHAR)
    ap.add_argument("--out-presets", default=DEFAULT_OUT_PRESETS)
    ap.add_argument("--out-catalog", default=DEFAULT_OUT_CATALOG)
    ap.add_argument("--height", type=float, default=0.94)
    ap.add_argument("--skip-mixamo", action="store_true")
    return ap.parse_args(argv)


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge0 > edge1:
        return 1.0 - smoothstep(edge1, edge0, x)
    t = max(0.0, min(1.0, (x - edge0) / max(1e-6, edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def main():
    args = parse_args()
    print(f"Building Silme Seeress: rigged={args.meshy_rigged}, anims={args.source_anims}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = 30

    # 1. Import Meshy Rigged Silme Seeress base
    bpy.ops.import_scene.gltf(filepath=args.meshy_rigged)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    mesh = next(o for o in bpy.data.objects if o.type == "MESH" and o.vertex_groups)
    arm.name = "Armature"
    mesh.name = "CharacterMesh"

    # Remove any extra unskinned meshes or light/camera nodes
    for o in list(bpy.data.objects):
        if o not in (arm, mesh):
            bpy.data.objects.remove(o, do_unlink=True)

    # 2. Normalize placement: scale crown to args.height (0.94m), feet at Z = 0.000m, center XZ
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()

    def eval_bbox(m_obj):
        dg = bpy.context.evaluated_depsgraph_get()
        ev = m_obj.evaluated_get(dg)
        pts = [ev.matrix_world @ v.co for v in ev.data.vertices]
        lo = Vector([min(p[i] for p in pts) for i in range(3)])
        hi = Vector([max(p[i] for p in pts) for i in range(3)])
        return lo, hi

    lo, hi = eval_bbox(mesh)
    cur_h = hi.z - lo.z
    scale_factor = args.height / max(1e-4, cur_h)
    arm.matrix_world = Matrix.Diagonal((scale_factor, scale_factor, scale_factor, 1.0)) @ arm.matrix_world
    bpy.context.view_layer.update()

    lo, hi = eval_bbox(mesh)
    cx = 0.5 * (lo.x + hi.x)
    cy = 0.5 * (lo.y + hi.y)
    arm.matrix_world = Matrix.Translation((-cx, -cy, -lo.z)) @ arm.matrix_world
    bpy.context.view_layer.update()

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()

    # 2A. If Tripo 3D P1 rigged body (`args.tripo_rigged`) is present, transplant its high-detail delighted mesh
    #     (which has a clean sculpted purple bodysuit/panties front & back and zero thigh shadow bleed) onto `arm`!
    using_tripo_body = False
    head_mesh = mesh
    if args.tripo_rigged and os.path.isfile(args.tripo_rigged):
        before_tr = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=args.tripo_rigged)
        tr_objs = [o for o in bpy.data.objects if o not in before_tr]
        t_arm = next((o for o in tr_objs if o.type == "ARMATURE"), None)
        t_mesh = next((o for o in tr_objs if o.type == "MESH" and o.vertex_groups), None)
        if t_arm and t_mesh:
            using_tripo_body = True
            t_arm.data.pose_position = "REST"
            bpy.context.view_layer.update()
            t_arm.matrix_world = Matrix.Rotation(-1.5707963, 4, "Z") @ t_arm.matrix_world
            bpy.context.view_layer.update()
            t_lo, t_hi = eval_bbox(t_mesh)
            t_sf = args.height / max(1e-4, t_hi.z - t_lo.z)
            t_arm.matrix_world = Matrix.Diagonal((t_sf, t_sf, t_sf, 1.0)) @ t_arm.matrix_world
            bpy.context.view_layer.update()
            t_lo, t_hi = eval_bbox(t_mesh)
            t_arm.matrix_world = Matrix.Translation((-0.5 * (t_lo.x + t_hi.x), -0.5 * (t_lo.y + t_hi.y), -t_lo.z)) @ t_arm.matrix_world
            bpy.context.view_layer.update()

            bpy.ops.object.select_all(action="DESELECT")
            t_arm.select_set(True)
            t_mesh.select_set(True)
            bpy.context.view_layer.objects.active = t_arm
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            bpy.context.view_layer.update()

            # Snap `arm` 22 core edit bones to `t_arm` true joint-to-joint heads AND tails
            bone_map_tr = {
                "Hips": "mixamorig:Hips",
                "Spine02": "mixamorig:Spine",
                "Spine01": "mixamorig:Spine1",
                "Spine": "mixamorig:Spine2",
                "neck": "mixamorig:Neck",
                "Head": "mixamorig:Head",
                "LeftShoulder": "mixamorig:LeftShoulder",
                "LeftArm": "mixamorig:LeftArm",
                "LeftForeArm": "mixamorig:LeftForeArm",
                "LeftHand": "mixamorig:LeftHand",
                "RightShoulder": "mixamorig:RightShoulder",
                "RightArm": "mixamorig:RightArm",
                "RightForeArm": "mixamorig:RightForeArm",
                "RightHand": "mixamorig:RightHand",
                "LeftUpLeg": "mixamorig:LeftUpLeg",
                "LeftLeg": "mixamorig:LeftLeg",
                "LeftFoot": "mixamorig:LeftFoot",
                "LeftToeBase": "mixamorig:LeftToeBase",
                "RightUpLeg": "mixamorig:RightUpLeg",
                "RightLeg": "mixamorig:RightLeg",
                "RightFoot": "mixamorig:RightFoot",
                "RightToeBase": "mixamorig:RightToeBase",
            }
            tr_heads = {tb: t_arm.data.bones[sb].head_local.copy() for tb, sb in bone_map_tr.items() if sb in t_arm.data.bones}
            tr_tails = {tb: t_arm.data.bones[sb].tail_local.copy() for tb, sb in bone_map_tr.items() if sb in t_arm.data.bones}
            for side, tb in [("Left", "LeftHand"), ("Right", "RightHand")]:
                mid_b = f"mixamorig:{side}HandMiddle3"
                if mid_b in t_arm.data.bones:
                    tr_tails[tb] = t_arm.data.bones[mid_b].head_local.copy()

            bpy.context.view_layer.objects.active = arm
            bpy.ops.object.mode_set(mode="EDIT")
            old_rolls = {eb.name: eb.roll for eb in arm.data.edit_bones}
            for eb in arm.data.edit_bones:
                eb.use_connect = False
            for tb, new_h in tr_heads.items():
                if tb in arm.data.edit_bones:
                    eb = arm.data.edit_bones[tb]
                    eb.head = new_h
                    eb.tail = tr_tails[tb]
                    eb.roll = old_rolls[tb]
            bpy.ops.object.mode_set(mode="OBJECT")
            bpy.context.view_layer.update()

            # Merge Tripo finger vertex groups into LeftHand / RightHand and rename 22 core groups
            inv_map = {v: k for k, v in bone_map_tr.items()}
            for side in ("Left", "Right"):
                hand_vg_name = f"mixamorig:{side}Hand"
                if hand_vg_name not in t_mesh.vertex_groups:
                    t_mesh.vertex_groups.new(name=hand_vg_name)
                hand_vg = t_mesh.vertex_groups[hand_vg_name]
                finger_vgs = [
                    vg for vg in list(t_mesh.vertex_groups)
                    if vg.name.startswith(f"mixamorig:{side}Hand") and vg.name != hand_vg_name
                ]
                if finger_vgs:
                    f_indices = {vg.index for vg in finger_vgs}
                    for vi, v in enumerate(t_mesh.data.vertices):
                        fw = sum(g.weight for g in v.groups if g.group in f_indices)
                        if fw > 0.0:
                            hand_vg.add([vi], fw, "ADD")
                    for vg in finger_vgs:
                        t_mesh.vertex_groups.remove(vg)

            for vg in list(t_mesh.vertex_groups):
                if vg.name in inv_map:
                    vg.name = inv_map[vg.name]
                else:
                    t_mesh.vertex_groups.remove(vg)

            # Checkpoint 1: Trim Tripo P1 body above the high gold-trimmed stand-up collar (z > 0.764m)
            # and keep Meshy-6's un-decimated anime Dark Elf head (`head_mesh`, z >= 0.735m) with 0 decimation!
            bm_tr = bmesh.new()
            bm_tr.from_mesh(t_mesh.data)
            bm_tr.faces.ensure_lookup_table()
            bmesh.ops.delete(
                bm_tr,
                geom=[f for f in bm_tr.faces if f.calc_center_median().z > 0.764],
                context="FACES",
            )
            bmesh.ops.delete(bm_tr, geom=[v for v in bm_tr.verts if not v.link_faces], context="VERTS")
            bm_tr.to_mesh(t_mesh.data)
            bm_tr.free()
            t_mesh.data.update()

            # Extract Meshy-6 un-decimated head (`head_mesh`, z >= 0.735m) and align to collar seam
            head_mesh = mesh
            head_mesh.name = "HeadMesh"
            head_mesh.data.name = "HeadMesh"
            bm_hd = bmesh.new()
            bm_hd.from_mesh(head_mesh.data)
            bm_hd.faces.ensure_lookup_table()
            to_del_hd = []
            for f in bm_hd.faces:
                c = f.calc_center_median()
                if c.z < 0.735:
                    to_del_hd.append(f)
                elif c.z < 0.768 and (abs(c.x) > 0.036 or c.y > 0.028):
                    to_del_hd.append(f)
                elif abs(c.x) > 0.095:
                    to_del_hd.append(f)
            bmesh.ops.delete(bm_hd, geom=to_del_hd, context="FACES")
            bmesh.ops.delete(bm_hd, geom=[v for v in bm_hd.verts if not v.link_faces], context="VERTS")
            for v in bm_hd.verts:
                v.co.x += 0.002
                v.co.y += 0.011
                v.co.z -= 0.004
                # Tuck lower neck (z < 0.766m) cleanly inside Tripo P1's high black-and-gold stand-up collar
                if v.co.z < 0.768:
                    t_nk = min(1.0, max(0.0, (0.768 - v.co.z) / 0.030))
                    v.co.x *= (1.0 - 0.18 * t_nk)
                    if v.co.y < 0.0:
                        v.co.y += 0.012 * t_nk
            bm_hd.to_mesh(head_mesh.data)
            bm_hd.free()
            head_mesh.data.update()

            # Bind `head_mesh` strictly to `Head` and `neck` (removing any stray shoulder/arm weights from T-pose auto-rig!)
            for vg in list(head_mesh.vertex_groups):
                if vg.name not in ("Head", "neck"):
                    head_mesh.vertex_groups.remove(vg)
            if "Head" not in head_mesh.vertex_groups:
                head_mesh.vertex_groups.new(name="Head")
            if "neck" not in head_mesh.vertex_groups:
                head_mesh.vertex_groups.new(name="neck")
            for vi, v in enumerate(head_mesh.data.vertices):
                w_h = min(1.0, max(0.0, (v.co.z - 0.762) / 0.025))
                head_mesh.vertex_groups["Head"].add([vi], w_h, "REPLACE")
                head_mesh.vertex_groups["neck"].add([vi], 1.0 - w_h, "REPLACE")

            # Strip ORM and NormalGL textures from both `t_mesh` and `head_mesh` so only clean Base Color textures remain
            for m_clean in (t_mesh, head_mesh):
                if m_clean.data.materials and m_clean.data.materials[0].use_nodes:
                    nt_cl = m_clean.data.materials[0].node_tree
                    for n in list(nt_cl.nodes):
                        if n.type == "TEX_IMAGE" and n.image and (
                            "normal" in n.image.name.lower()
                            or "orm" in n.image.name.lower()
                            or "rough" in n.image.name.lower()
                        ):
                            nt_cl.nodes.remove(n)
                        elif n.type == "NORMAL_MAP":
                            nt_cl.nodes.remove(n)

            # Decimate ONLY t_mesh (Tripo body below collar, ~0.68); HeadMesh stays at 100% full resolution (0 decimation)!
            for m_mod in list(t_mesh.modifiers):
                t_mesh.modifiers.remove(m_mod)
            dec_mod = t_mesh.modifiers.new(name="Decimate", type="DECIMATE")
            dec_mod.ratio = 0.68
            bpy.context.view_layer.objects.active = t_mesh
            bpy.ops.object.modifier_apply(modifier=dec_mod.name)

            # Parent t_mesh to `arm` as `CharacterMesh` while keeping `head_mesh` (`HeadMesh`) parented to `arm`
            t_mesh.parent = arm
            arm_mod = t_mesh.modifiers.new(name="Armature", type="ARMATURE")
            arm_mod.object = arm
            bpy.context.view_layer.objects.active = arm

            mesh = t_mesh
            mesh.name = "CharacterMesh"
            mesh.data.name = "CharacterMesh"
            for o in tr_objs:
                if o != mesh:
                    bpy.data.objects.remove(o, do_unlink=True)
            print(
                f"[Gate 2] Transplanted Tripo 3D P1 body ({len(mesh.data.polygons)} polys) + "
                f"un-decimated Meshy-6 HeadMesh ({len(head_mesh.data.polygons)} polys) onto Armature!"
            )

    lo, hi = eval_bbox(mesh)
    print(f"Normalized bbox: lo={[round(x, 4) for x in lo]} hi={[round(x, 4) for x in hi]} height={round(hi.z - lo.z, 4)}m")

    # 2B. Gate 2 — Verify and enforce zero bridging triangles between left and right boots/ankles (z < 0.28m)
    bm_leg = bmesh.new()
    bm_leg.from_mesh(mesh.data)
    bm_leg.faces.ensure_lookup_table()
    bridging_leg_faces = [
        f
        for f in bm_leg.faces
        if f.calc_center_median().z < 0.28
        and min(v.co.x for v in f.verts) < -0.004
        and max(v.co.x for v in f.verts) > 0.004
    ]
    if bridging_leg_faces:
        print(f"[Gate 2] Removing {len(bridging_leg_faces)} bridging triangles between left/right ankles (z < 0.28m)")
        bmesh.ops.delete(bm_leg, geom=bridging_leg_faces, context="FACES")
        bm_leg.to_mesh(mesh.data)
        mesh.data.update()
    bm_leg.free()

    ankle_verts_l = [v.co.x for v in mesh.data.vertices if 0.02 <= v.co.z <= 0.24 and v.co.x < 0.0]
    ankle_verts_r = [v.co.x for v in mesh.data.vertices if 0.02 <= v.co.z <= 0.24 and v.co.x > 0.0]
    ankle_gap_m = (min(ankle_verts_r) - max(ankle_verts_l)) if (ankle_verts_l and ankle_verts_r) else 0.0
    print(f"[Gate 2] Left/Right ankle separation (0.02m..0.24m): gap={round(ankle_gap_m, 4)}m, bridging_faces=0")

    # 3. Add weapon socket (`prop_weapon_r` -> `handslot.r`) and secondary chains to Armature
    bpy.ops.object.mode_set(mode="EDIT")
    ebones = arm.data.edit_bones

    for eb in ebones:
        if (eb.tail - eb.head).length > 0.25:
            d = (eb.tail - eb.head).normalized()
            eb.tail = eb.head + d * 0.06

    r_hand = ebones["RightHand"]
    r_forearm = ebones["RightForeArm"]
    hand_dir = (r_hand.head - r_forearm.head).normalized()
    grip_pos = r_hand.head + hand_dir * 0.035 + Vector((0.0, -0.012, -0.008))

    prop_r = ebones.new("prop_weapon_r")
    prop_r.head = grip_pos
    prop_r.tail = grip_pos + Vector((0.0, -0.08, 0.04))
    prop_r.roll = 0.0
    prop_r.parent = r_hand
    prop_r.use_deform = False

    slot_r = ebones.new("handslot.r")
    slot_r.head = prop_r.head.copy()
    slot_r.tail = prop_r.tail.copy()
    slot_r.roll = prop_r.roll
    slot_r.parent = prop_r
    slot_r.use_deform = False

    head_eb = ebones["Head"]
    hx, hy, hz = head_eb.head.x, head_eb.head.y, head_eb.head.z

    # Hair chains: 4-link sagittal central ponytail chain + side strands
    hair_chains = {
        "sec_hair_c1": [
            (Vector((hx, hy + 0.045, hz + 0.010)), Vector((hx, hy + 0.055, hz - 0.065))),
            (Vector((hx, hy + 0.055, hz - 0.065)), Vector((hx, hy + 0.062, hz - 0.150))),
            (Vector((hx, hy + 0.062, hz - 0.150)), Vector((hx, hy + 0.068, hz - 0.240))),
            (Vector((hx, hy + 0.068, hz - 0.240)), Vector((hx, hy + 0.072, hz - 0.330))),
        ],
        "sec_hair_l1": [
            (Vector((hx + 0.048, hy + 0.015, hz + 0.010)), Vector((hx + 0.055, hy + 0.020, hz - 0.050))),
            (Vector((hx + 0.055, hy + 0.020, hz - 0.050)), Vector((hx + 0.060, hy + 0.025, hz - 0.120))),
        ],
        "sec_hair_r1": [
            (Vector((hx - 0.048, hy + 0.015, hz + 0.010)), Vector((hx - 0.055, hy + 0.020, hz - 0.050))),
            (Vector((hx - 0.055, hy + 0.020, hz - 0.050)), Vector((hx - 0.060, hy + 0.025, hz - 0.120))),
        ],
    }
    for prefix, segs in hair_chains.items():
        p_eb = head_eb
        for idx, (h_pt, t_pt) in enumerate(segs, start=1):
            bname = f"{prefix}_{idx}"
            eb = ebones.new(bname)
            eb.head = h_pt
            eb.tail = t_pt
            eb.parent = p_eb
            eb.use_connect = idx > 1
            eb.use_deform = True
            p_eb = eb

    spine_eb = ebones["Spine"]
    sx, sy, sz = spine_eb.head.x, spine_eb.head.y, spine_eb.head.z
    cape_chains = {
        "sec_cape_l1": [
            (Vector((sx + 0.075, sy + 0.035, sz + 0.015)), Vector((sx + 0.095, sy + 0.045, sz - 0.035))),
            (Vector((sx + 0.095, sy + 0.045, sz - 0.035)), Vector((sx + 0.110, sy + 0.055, sz - 0.085))),
        ],
        "sec_cape_r1": [
            (Vector((sx - 0.075, sy + 0.035, sz + 0.015)), Vector((sx - 0.095, sy + 0.045, sz - 0.035))),
            (Vector((sx - 0.095, sy + 0.045, sz - 0.035)), Vector((sx - 0.110, sy + 0.055, sz - 0.085))),
        ],
        "sec_bust_l1": [
            (Vector((sx + 0.028, sy - 0.045, sz - 0.035)), Vector((sx + 0.030, sy - 0.088, sz - 0.048))),
        ],
        "sec_bust_r1": [
            (Vector((sx - 0.028, sy - 0.045, sz - 0.035)), Vector((sx - 0.030, sy - 0.088, sz - 0.048))),
        ],
    }
    for prefix, segs in cape_chains.items():
        p_eb = spine_eb
        for idx, (h_pt, t_pt) in enumerate(segs, start=1):
            bname = f"{prefix}_{idx}"
            eb = ebones.new(bname)
            eb.head = h_pt
            eb.tail = t_pt
            eb.parent = p_eb
            eb.use_connect = idx > 1
            eb.use_deform = True
            p_eb = eb

    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()

    sec_bone_names = [
        "sec_hair_c1_1",
        "sec_hair_c1_2",
        "sec_hair_c1_3",
        "sec_hair_c1_4",
        "sec_hair_l1_1",
        "sec_hair_l1_2",
        "sec_hair_r1_1",
        "sec_hair_r1_2",
        "sec_cape_l1_1",
        "sec_cape_l1_2",
        "sec_cape_r1_1",
        "sec_cape_r1_2",
        "sec_bust_l1_1",
        "sec_bust_r1_1",
    ]
    for bname in sec_bone_names:
        for m_target in {mesh, head_mesh}:
            if bname not in m_target.vertex_groups:
                m_target.vertex_groups.new(name=bname)

    # Configure Body material on `mesh` (CharacterMesh)
    for m_target in {mesh, head_mesh}:
        for mat in m_target.data.materials:
            if mat and mat.use_nodes:
                for n in mat.node_tree.nodes:
                    if n.type == "BSDF_PRINCIPLED":
                        if "Roughness" in n.inputs:
                            n.inputs["Roughness"].default_value = 0.92
                        if "Specular IOR Level" in n.inputs:
                            n.inputs["Specular IOR Level"].default_value = 0.10
                        if "Metallic" in n.inputs:
                            n.inputs["Metallic"].default_value = 0.0
                    elif n.type == "TEX_IMAGE" and n.image and "normal" not in n.image.name.lower() and "rough" not in n.image.name.lower() and "orm" not in n.image.name.lower():
                        if n.image.size[0] > 1024 or n.image.size[1] > 1024:
                            n.image.scale(min(1024, n.image.size[0]), min(1024, n.image.size[1]))
                            n.image.pack()

    # 4. Partition Hair Polygons and Build Material 1 (Hair) on `head_mesh` with HairStrandLuminance
    body_mat = head_mesh.data.materials[0]
    body_mat.name = "Head" if using_tripo_body else "Body"
    if using_tripo_body and mesh.data.materials:
        mesh.data.materials[0].name = "Body"

    base_img = None
    if body_mat.use_nodes:
        for n in body_mat.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and "normal" not in n.image.name.lower() and "rough" not in n.image.name.lower():
                base_img = n.image
                break
    assert base_img is not None, "Missing base texture image"

    # Scale base texture to <= 1024
    if base_img.size[0] > 1024 or base_img.size[1] > 1024:
        base_img.scale(min(1024, base_img.size[0]), min(1024, base_img.size[1]))
        base_img.pack()

    # Hair Material with HairStrandLuminance
    hair_mat = body_mat.copy()
    hair_mat.name = "Hair"
    head_mesh.data.materials.append(hair_mat)

    hair_img = base_img.copy()
    hair_img.name = "HairStrandLuminance"
    hair_img.scale(512, 512)
    hpx = list(hair_img.pixels)
    for i in range(0, len(hpx), 4):
        r, g, b, a = hpx[i], hpx[i + 1], hpx[i + 2], hpx[i + 3]
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        norm_l = min(1.0, max(0.24, lum * 2.15))
        hpx[i] = norm_l
        hpx[i + 1] = norm_l
        hpx[i + 2] = norm_l
        hpx[i + 3] = a
    hair_img.pixels[:] = hpx
    hair_img.pack()

    if hair_mat.use_nodes:
        nt = hair_mat.node_tree
        inp = None
        for n in nt.nodes:
            if n.type == "BSDF_PRINCIPLED":
                inp = n.inputs.get("Base Color")
                break
        if inp and inp.is_linked and inp.links[0].from_node.type == "TEX_IMAGE":
            tex_node = inp.links[0].from_node
            tex_node.image = hair_img
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs[0].default_value = 1.0
            # Silver-white / celestial lavender hair tint
            mix.inputs[7].default_value = (0.90, 0.91, 0.98, 1.0)
            nt.links.new(tex_node.outputs["Color"], mix.inputs[6])
            nt.links.new(mix.outputs[2], inp)

    # 4. Auto-measure Meshy Head Geometry & Neck Skin Tone, then Partition Hair Polygons (Gate 3A)
    uv_layer = head_mesh.data.uv_layers.active.data
    verts = head_mesh.data.vertices
    polys = head_mesh.data.polygons
    w_b, h_b = base_img.size[:]
    px_b = np.array(base_img.pixels[:], dtype=np.float32).reshape((h_b, w_b, 4))

    head_band_verts = [v.co for v in verts if 0.78 <= v.co.z <= 0.91 and abs(v.co.x) < 0.065]
    head_cx = float(np.median([p.x for p in head_band_verts])) if head_band_verts else 0.0
    face_front_verts = [
        v.co for v in verts if 0.795 <= v.co.z <= 0.865 and abs(v.co.x - head_cx) < 0.032 and v.co.y < -0.010
    ]
    head_front_y = float(np.percentile([p.y for p in face_front_verts], 18)) if face_front_verts else -0.068
    chin_carve_z = 0.782
    brow_carve_z = 0.858
    print(
        f"[Gate 3] Measured Meshy head: head_cx={round(head_cx, 4)}m, "
        f"head_front_y={round(head_front_y, 4)}m, carve_z=[{chin_carve_z}, {brow_carve_z}]"
    )

    # Sample neck / upper-chest lavender skin tone from head_mesh
    neck_skin_samples = []
    for p in polys:
        c = p.center
        if 0.70 <= c.z <= 0.77 and abs(c.x - head_cx) < 0.035 and c.y < -0.010:
            uvs = [uv_layer[li].uv for li in p.loop_indices]
            u = sum(uv.x for uv in uvs) / len(uvs) % 1.0
            v = sum(uv.y for uv in uvs) / len(uvs) % 1.0
            r, g, b, _ = px_b[int(v * h_b), int(u * w_b)]
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if 0.32 < lum < 0.78 and b >= g:
                neck_skin_samples.append([r, g, b])
    if neck_skin_samples:
        sampled_neck_rgb = np.median(np.array(neck_skin_samples, dtype=np.float32), axis=0)
        target_skin = 0.55 * sampled_neck_rgb + 0.45 * np.array([0.584, 0.502, 0.659], dtype=np.float32)
    else:
        target_skin = np.array([0.584, 0.502, 0.659], dtype=np.float32)
    print(f"[Gate 3] Target Dark Elf lavender skin RGB: {[round(float(x), 3) for x in target_skin]}")

    def in_face_oval(c):
        return (
            abs(c.x - head_cx) < 0.038
            and c.y < -0.030
            and 0.775 < c.z < 0.875
        )

    # Strict Material 1 (Hair) guard: ONLY neutral silver-white crown/bun (z >= 0.855m or back hair y > +0.018m),
    # strictly excluding the front face/forehead/eyebrows (in_face_oval)
    hair_polys = set()
    for p in polys:
        c = p.center
        if in_face_oval(c):
            continue
        if not (c.z >= 0.855 or (c.z >= 0.72 and c.y > 0.018 and abs(c.x - head_cx) < 0.075)):
            continue
        uvs = [uv_layer[li].uv for li in p.loop_indices]
        u = sum(uv.x for uv in uvs) / len(uvs) % 1.0
        v = sum(uv.y for uv in uvs) / len(uvs) % 1.0
        r, g, b, _ = px_b[int(v * h_b), int(u * w_b)]
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        if lum > 0.68 and (r - g) < 0.075:
            hair_polys.add(p.index)

    for pidx in hair_polys:
        polys[pidx].material_index = 1
    stray_hair = [
        pidx for pidx in hair_polys if polys[pidx].center.z < 0.84 and polys[pidx].center.y <= 0.018
    ]
    assert len(stray_hair) == 0, f"Gate 3 FAIL: {len(stray_hair)} Material 1 polygons leaked onto neck/chest/shoulders!"
    print(f"[Gate 3A] Assigned {len(hair_polys)} / {len(polys)} polygons to Hair material slot (0 neck/shoulder leaks)")

    # 5. Weight hair vertices on `head_mesh` to sec_hair_c1_1..4 and sec_hair_l1/r1
    head_vg = head_mesh.vertex_groups.get("Head").index
    c1_vg = head_mesh.vertex_groups.get("sec_hair_c1_1").index
    c2_vg = head_mesh.vertex_groups.get("sec_hair_c1_2").index
    c3_vg = head_mesh.vertex_groups.get("sec_hair_c1_3").index
    c4_vg = head_mesh.vertex_groups.get("sec_hair_c1_4").index
    l1_vg = head_mesh.vertex_groups.get("sec_hair_l1_1").index
    l2_vg = head_mesh.vertex_groups.get("sec_hair_l1_2").index
    r1_vg = head_mesh.vertex_groups.get("sec_hair_r1_1").index
    r2_vg = head_mesh.vertex_groups.get("sec_hair_r1_2").index

    hair_verts = {vi for pidx in hair_polys for vi in polys[pidx].vertices}
    for vi in hair_verts:
        co = verts[vi].co
        # Central back hair: blend down along Z from 0.82 to 0.45
        if co.y > 0.015 and abs(co.x - 0.002) < 0.060:
            w_chain = smoothstep(0.825, 0.500, co.z) * 0.88
            t_chain = smoothstep(0.820, 0.450, co.z)
            w1 = w2 = w3 = w4 = 0.0
            if t_chain < 0.25:
                u = t_chain / 0.25
                w1 = w_chain * (1.0 - 0.65 * u)
                w2 = w_chain * (0.65 * u)
            elif t_chain < 0.55:
                u = (t_chain - 0.25) / 0.30
                w1 = w_chain * 0.35 * (1.0 - u)
                w2 = w_chain * (0.65 * (1.0 - u) + 0.35 * u)
                w3 = w_chain * (0.65 * u)
            elif t_chain < 0.80:
                u = (t_chain - 0.55) / 0.25
                w2 = w_chain * 0.35 * (1.0 - u)
                w3 = w_chain * (0.65 * (1.0 - u) + 0.35 * u)
                w4 = w_chain * (0.65 * u)
            else:
                u = min(1.0, (t_chain - 0.80) / 0.20)
                w3 = w_chain * 0.35 * (1.0 - u)
                w4 = w_chain * (0.65 + 0.35 * u)

            tot_w = min(0.92, w1 + w2 + w3 + w4)
            head_mesh.vertex_groups[head_vg].add([vi], 1.0 - tot_w, "REPLACE")
            head_mesh.vertex_groups[c1_vg].add([vi], w1, "REPLACE")
            head_mesh.vertex_groups[c2_vg].add([vi], w2, "REPLACE")
            head_mesh.vertex_groups[c3_vg].add([vi], w3, "REPLACE")
            head_mesh.vertex_groups[c4_vg].add([vi], w4, "REPLACE")
        elif abs(co.x - 0.002) >= 0.050 and co.z < 0.78:
            if co.x > 0.002:
                w = smoothstep(0.78, 0.55, co.z) * 0.50
                head_mesh.vertex_groups[l1_vg].add([vi], w * 0.60, "REPLACE")
                head_mesh.vertex_groups[l2_vg].add([vi], w * 0.40, "REPLACE")
            else:
                w = smoothstep(0.78, 0.55, co.z) * 0.50
                head_mesh.vertex_groups[r1_vg].add([vi], w * 0.60, "REPLACE")
                head_mesh.vertex_groups[r2_vg].add([vi], w * 0.40, "REPLACE")

    # 4B. Clean dark baked shadows ONLY if using fallback Meshy body (Tripo P1 body already has a clean purple bodysuit/panties and spotless lavender thighs!)
    if not using_tripo_body:
        thigh_skin_samples = []
        for p in polys:
            c = p.center
            if 0.34 <= c.z <= 0.44 and 0.038 <= abs(c.x) <= 0.068 and c.y < -0.015:
                uvs = [uv_layer[li].uv for li in p.loop_indices]
                u = sum(uv.x for uv in uvs) / len(uvs) % 1.0
                v = sum(uv.y for uv in uvs) / len(uvs) % 1.0
                r, g, b, _ = px_b[int(v * h_b), int(u * w_b)]
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                if 0.42 < lum < 0.80:
                    thigh_skin_samples.append([r, g, b])
        clean_thigh_rgb = (
            np.median(np.array(thigh_skin_samples, dtype=np.float32), axis=0)
            if thigh_skin_samples
            else np.array([0.65, 0.55, 0.68], dtype=np.float32)
        )
        cleaned_thigh_polys = 0
        for p in polys:
            c = p.center
            if 0.37 <= c.z <= 0.525 and abs(c.x) < 0.035 and -0.035 < c.y < 0.030:
                uvs = [uv_layer[li].uv for li in p.loop_indices]
                us = [int((uv.x % 1.0) * w_b) for uv in uvs]
                vs = [int((uv.y % 1.0) * h_b) for uv in uvs]
                u0, u1 = max(0, min(us) - 1), min(w_b, max(us) + 2)
                v0, v1 = max(0, min(vs) - 1), min(h_b, max(vs) + 2)
                patch = px_b[v0:v1, u0:u1, :3]
                lum = 0.299 * patch[..., 0] + 0.587 * patch[..., 1] + 0.114 * patch[..., 2]
                dark_mask = lum < 0.38
                if np.any(dark_mask):
                    patch[dark_mask] = clean_thigh_rgb
                    px_b[v0:v1, u0:u1, :3] = patch
                    cleaned_thigh_polys += 1
        base_img.pixels[:] = px_b.ravel().tolist()
        base_img.update()
        base_img.pack()
        print(f"[Gate 3] Cleaned {cleaned_thigh_polys} inner-thigh dark shadow polygons")
    else:
        print("[Gate 3] Tripo 3D P1 body active: native sculpted purple bodysuit/panties & delighted thighs preserved (0 UV patches painted)")

    # 4C. Weight bust/chest vertices (0.61 <= z <= 0.72, y < -0.038, |x| < 0.068) to sec_bust_l1_1 and sec_bust_r1_1
    bust_l_vg = mesh.vertex_groups.get("sec_bust_l1_1").index
    bust_r_vg = mesh.vertex_groups.get("sec_bust_r1_1").index
    spine_vg = mesh.vertex_groups.get("Spine").index
    bust_weighted_count = 0
    for vi, v in enumerate(mesh.data.vertices):
        co = v.co
        if 0.615 <= co.z <= 0.720 and co.y < -0.035 and abs(co.x) < 0.068:
            cy_factor = smoothstep(-0.035, -0.062, co.y)
            cz_factor = smoothstep(0.615, 0.655, co.z) * smoothstep(0.720, 0.680, co.z)
            w_bust = min(0.72, cy_factor * cz_factor * 0.78)
            if w_bust > 0.04:
                bust_weighted_count += 1
                if co.x >= 0.0:
                    mesh.vertex_groups[bust_l_vg].add([vi], w_bust, "REPLACE")
                else:
                    mesh.vertex_groups[bust_r_vg].add([vi], w_bust, "REPLACE")
                mesh.vertex_groups[spine_vg].add([vi], 1.0 - w_bust, "REPLACE")
    print(f"[Gate 3] Weighted {bust_weighted_count} chest/bust vertices to sec_bust_l1_1 / sec_bust_r1_1 for natural breathing & gait physics")

    # 4D. Graft Silme's flowing silver-white wavy long hair from args.long_hair_glb (Tripo P1 Wavy Hair or Meshy fallback)
    if args.long_hair_glb and os.path.isfile(args.long_hair_glb):
        before_lh = set(bpy.data.objects)
        orig_acts_lh = set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=args.long_hair_glb)
        lh_objs = [o for o in bpy.data.objects if o not in before_lh]
        lh_mesh = next((o for o in lh_objs if o.type == "MESH" and len(o.data.polygons) > 100), None)
        if lh_mesh is not None:
            bpy.ops.object.select_all(action="DESELECT")
            lh_mesh.select_set(True)
            bpy.context.view_layer.objects.active = lh_mesh
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            lh_mesh.matrix_world = Matrix.Rotation(1.5707963, 4, "Z")
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

            lh_base_img = None
            if lh_mesh.data.materials and lh_mesh.data.materials[0].use_nodes:
                for n in lh_mesh.data.materials[0].node_tree.nodes:
                    if n.type == "TEX_IMAGE" and n.image and ("color" in n.image.name.lower() or ("normal" not in n.image.name.lower() and "orm" not in n.image.name.lower())):
                        lh_base_img = n.image
                        break
            lh_w, lh_h = lh_base_img.size[:] if lh_base_img else (1, 1)
            lh_px = (
                np.array(lh_base_img.pixels[:], dtype=np.float32).reshape((lh_h, lh_w, 4))
                if lh_base_img
                else np.ones((1, 1, 4), dtype=np.float32)
            )
            lh_uv = lh_mesh.data.uv_layers.active.data

            # Build 3D-welded adjacency across UV island seams
            pos_to_faces = defaultdict(list)
            for p in lh_mesh.data.polygons:
                for vi in p.vertices:
                    co = lh_mesh.data.vertices[vi].co
                    pos_to_faces[(round(co.x, 4), round(co.y, 4), round(co.z, 4))].append(p.index)
            face_nbrs = defaultdict(set)
            for flist in pos_to_faces.values():
                for i in range(len(flist)):
                    for j in range(i + 1, len(flist)):
                        face_nbrs[flist[i]].add(flist[j])
                        face_nbrs[flist[j]].add(flist[i])

            keep_lh_polys = set()
            for p in lh_mesh.data.polygons:
                c = p.center
                if c.z < 0.20 and c.y < 0.058:
                    continue
                if c.y < -0.018:
                    continue
                if abs(c.x) > 0.210 and c.z > -0.05:
                    continue
                if abs(c.x) > 0.255:
                    continue
                uvs = [lh_uv[li].uv for li in p.loop_indices]
                u = sum(uv.x for uv in uvs) / len(uvs) % 1.0
                v = sum(uv.y for uv in uvs) / len(uvs) % 1.0
                r, g, b, _ = lh_px[int(v * lh_h), int(u * lh_w)]
                if b > 0.16 and (r - b) < 0.045:
                    keep_lh_polys.add(p.index)

            # Morphological closing (6 passes) + pruning of spiky 1-neighbor boundary tabs (6 passes)
            for _ in range(6):
                add_f = {
                    p.index for p in lh_mesh.data.polygons
                    if p.index not in keep_lh_polys and p.center.y > 0.045 and abs(p.center.x) < 0.255
                    and sum(1 for nb in face_nbrs[p.index] if nb in keep_lh_polys) >= 3
                }
                keep_lh_polys |= add_f
            for _ in range(6):
                drop_tabs = {
                    fi for fi in keep_lh_polys
                    if sum(1 for nb in face_nbrs[fi] if nb in keep_lh_polys) <= 1
                }
                if not drop_tabs:
                    break
                keep_lh_polys -= drop_tabs

            # Keep ONLY the single largest 3D-welded connected component (guarantees 0 floating islands!)
            visited = set()
            best_comp = set()
            for fi in keep_lh_polys:
                if fi in visited:
                    continue
                comp = set()
                stack = [fi]
                visited.add(fi)
                while stack:
                    cur = stack.pop()
                    comp.add(cur)
                    for nb in face_nbrs[cur]:
                        if nb in keep_lh_polys and nb not in visited:
                            visited.add(nb)
                            stack.append(nb)
                if len(comp) > len(best_comp):
                    best_comp = comp

            lh_bm = bmesh.new()
            lh_bm.from_mesh(lh_mesh.data)
            lh_bm.faces.ensure_lookup_table()
            bmesh.ops.delete(lh_bm, geom=[f for f in lh_bm.faces if f.index not in best_comp], context="FACES")
            loose_lh = [v for v in lh_bm.verts if not v.link_faces]
            if loose_lh:
                bmesh.ops.delete(lh_bm, geom=loose_lh, context="VERTS")

            # 3D-welded boundary & surface smoothing (6 passes)
            for _ in range(6):
                lh_bm.verts.ensure_lookup_table()
                pos_groups = defaultdict(list)
                for v in lh_bm.verts:
                    pos_groups[(round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4))].append(v)
                pos_nbrs = defaultdict(set)
                edge_count = defaultdict(int)
                for f in lh_bm.faces:
                    keys = [(round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4)) for v in f.verts]
                    for i in range(len(keys)):
                        k1, k2 = keys[i], keys[(i + 1) % len(keys)]
                        if k1 != k2:
                            pos_nbrs[k1].add(k2)
                            pos_nbrs[k2].add(k1)
                            ek = (min(k1, k2), max(k1, k2))
                            edge_count[ek] += 1
                b_nbrs = defaultdict(list)
                for (k1, k2), cnt in edge_count.items():
                    if cnt == 1:
                        b_nbrs[k1].append(k2)
                        b_nbrs[k2].append(k1)
                new_pos = {}
                for k, vlist in pos_groups.items():
                    cur_co = vlist[0].co.copy()
                    if k in b_nbrs and len(b_nbrs[k]) >= 2:
                        avg_b = sum((Vector(nb) for nb in b_nbrs[k]), Vector((0, 0, 0))) / len(b_nbrs[k])
                        new_pos[k] = cur_co.lerp(avg_b, 0.58)
                    elif pos_nbrs[k]:
                        avg_n = sum((Vector(nb) for nb in pos_nbrs[k]), Vector((0, 0, 0))) / len(pos_nbrs[k])
                        new_pos[k] = cur_co.lerp(avg_n, 0.22)
                for k, co in new_pos.items():
                    for v in pos_groups[k]:
                        v.co = co

            lh_bm.to_mesh(lh_mesh.data)
            lh_bm.free()
            lh_mesh.data.update()
            bpy.context.view_layer.objects.active = lh_mesh
            bpy.ops.mesh.customdata_custom_splitnormals_clear()

            # Fit LongHairMesh onto the back of Silme's head/shoulders (Z = 0.440m .. 0.922m)
            h_pts = [v.co for v in lh_mesh.data.vertices]
            h_lo = Vector([min(p[i] for p in h_pts) for i in range(3)])
            h_hi = Vector([max(p[i] for p in h_pts) for i in range(3)])
            target_h = 0.485
            hsf = target_h / max(1e-4, h_hi.z - h_lo.z)
            for v in lh_mesh.data.vertices:
                v.co.x = (v.co.x - 0.5 * (h_lo.x + h_hi.x)) * hsf * 0.92
                v.co.y = (v.co.y - h_lo.y) * hsf * 0.85 + 0.016
                v.co.z = (v.co.z - h_hi.z) * hsf + 0.922
            lh_mesh.data.update()

            # Build dedicated LongHairStrandLuminance texture preserving Tripo P1's wavy lock shading
            lh_hair_mat = hair_mat.copy()
            lh_hair_mat.name = "Hair"
            if lh_base_img is not None and lh_hair_mat.use_nodes:
                lh_lum_img = lh_base_img.copy()
                lh_lum_img.name = "LongHairStrandLuminance"
                lh_lum_img.scale(512, 512)
                lpx = list(lh_lum_img.pixels)
                for i in range(0, len(lpx), 4):
                    r, g, b, a = lpx[i], lpx[i + 1], lpx[i + 2], lpx[i + 3]
                    lum = 0.299 * r + 0.587 * g + 0.114 * b
                    norm_l = min(1.0, max(0.38, lum * 1.48))
                    lpx[i] = norm_l * 0.98
                    lpx[i + 1] = norm_l * 0.96
                    lpx[i + 2] = norm_l
                    lpx[i + 3] = a
                lh_lum_img.pixels[:] = lpx
                lh_lum_img.pack()
                for n in lh_hair_mat.node_tree.nodes:
                    if n.type == "TEX_IMAGE":
                        n.image = lh_lum_img

            lh_mesh.data.materials.clear()
            lh_mesh.data.materials.append(lh_hair_mat)
            for p in lh_mesh.data.polygons:
                p.material_index = 0
                p.use_smooth = True

            # Weight long hair vertices cleanly to Head + sec_hair_c1_1..4 + sec_hair_l1/r1
            lh_mesh.vertex_groups.clear()
            vg_lh_head = lh_mesh.vertex_groups.new(name="Head")
            vg_lh_c = [lh_mesh.vertex_groups.new(name=f"sec_hair_c1_{i}") for i in range(1, 5)]
            vg_lh_l = [lh_mesh.vertex_groups.new(name=f"sec_hair_l1_{i}") for i in range(1, 3)]
            vg_lh_r = [lh_mesh.vertex_groups.new(name=f"sec_hair_r1_{i}") for i in range(1, 3)]
            for vi, v in enumerate(lh_mesh.data.vertices):
                co = v.co
                w_chain = smoothstep(0.83, 0.46, co.z) * 0.90
                t_chain = smoothstep(0.83, 0.45, co.z)
                w1 = w2 = w3 = w4 = 0.0
                if t_chain < 0.25:
                    u = t_chain / 0.25
                    w1 = w_chain * (1.0 - 0.65 * u)
                    w2 = w_chain * (0.65 * u)
                elif t_chain < 0.55:
                    u = (t_chain - 0.25) / 0.30
                    w1 = w_chain * 0.35 * (1.0 - u)
                    w2 = w_chain * (0.65 * (1.0 - u) + 0.35 * u)
                    w3 = w_chain * (0.65 * u)
                elif t_chain < 0.80:
                    u = (t_chain - 0.55) / 0.25
                    w2 = w_chain * 0.35 * (1.0 - u)
                    w3 = w_chain * (0.65 * (1.0 - u) + 0.35 * u)
                    w4 = w_chain * (0.65 * u)
                else:
                    u = min(1.0, (t_chain - 0.80) / 0.20)
                    w3 = w_chain * 0.35 * (1.0 - u)
                    w4 = w_chain * (0.65 + 0.35 * u)
                tot_w = min(0.92, w1 + w2 + w3 + w4)
                vg_lh_head.add([vi], 1.0 - tot_w, "REPLACE")
                vg_lh_c[0].add([vi], w1, "REPLACE")
                vg_lh_c[1].add([vi], w2, "REPLACE")
                vg_lh_c[2].add([vi], w3, "REPLACE")
                vg_lh_c[3].add([vi], w4, "REPLACE")
                if abs(co.x) > 0.055 and co.z < 0.76:
                    side_w = smoothstep(0.76, 0.50, co.z) * 0.35
                    if co.x > 0:
                        vg_lh_l[0].add([vi], side_w * 0.6, "REPLACE")
                        vg_lh_l[1].add([vi], side_w * 0.4, "REPLACE")
                    else:
                        vg_lh_r[0].add([vi], side_w * 0.6, "REPLACE")
                        vg_lh_r[1].add([vi], side_w * 0.4, "REPLACE")

            lh_mesh.parent = arm
            for m_mod in list(lh_mesh.modifiers):
                lh_mesh.modifiers.remove(m_mod)
            lh_mod = lh_mesh.modifiers.new(name="Armature", type="ARMATURE")
            lh_mod.object = arm
            lh_mesh.name = "LongHairMesh"
            lh_mesh.data.name = "LongHairMesh"
            print(f"[Gate 3] Grafted modular Tripo P1 Wavy LongHairMesh ({len(lh_mesh.data.polygons)} polys, 1 connected component, 0 floating islands) onto Silme Seeress!")

        for o in lh_objs:
            if o != lh_mesh:
                bpy.data.objects.remove(o, do_unlink=True)
        for a in list(bpy.data.actions):
            if a not in orig_acts_lh:
                bpy.data.actions.remove(a)

    # 6-7. Sample Dark Elf lavender-pink skin tone from head_mesh, then remove the old AI head_mesh
    #      and mount the Reusable 4-Slot Modular VRoid 360° Head + Elf Ears + Wavy Hair + Gold Hairpin!
    fh_samples = []
    for p in polys:
        c = p.center
        if 0.830 <= c.z <= 0.852 and abs(c.x) < 0.022 and c.y < -0.030:
            uvs = [uv_layer[li].uv for li in p.loop_indices]
            u = sum(x.x for x in uvs) / len(uvs) % 1.0
            v = sum(x.y for x in uvs) / len(uvs) % 1.0
            r, g, b, _ = px_b[int(v * h_b), int(u * w_b)]
            if (r - g) > 0.05:
                fh_samples.append([r, g, b])
    if fh_samples:
        target_skin = np.median(np.array(fh_samples, dtype=np.float32), axis=0)
    else:
        target_skin = np.array([0.835, 0.698, 0.748], dtype=np.float32)

    if head_mesh != mesh:
        bpy.data.objects.remove(head_mesh, do_unlink=True)

    sys.path.insert(0, os.path.dirname(__file__))
    from modular_vroid_head import assemble_modular_vroid_head_and_hair

    vface, vhair, hairpin_obj = assemble_modular_vroid_head_and_hair(
        arm=arm,
        vroid_head_path=args.vroid_face,
        vroid_hair_path=args.vroid_hair or args.vroid_face,
        target_skin_rgb=target_skin,
        hair_mat_template=hair_mat,
        head_scale=args.head_scale,
        ear_style=args.ear_style,
        hair_wave=args.hair_wave,
        add_gold_hairpin=True,
        collar_z=0.764,
    )

    # 8. Import all 11 canonical actions from source anims and align arm rest-pose difference
    print(f"Importing actions from {args.source_anims}...")
    orig_acts = set(bpy.data.actions)
    before_src = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=args.source_anims)
    src_objs = [o for o in bpy.data.objects if o not in before_src]
    src_arm = next((o for o in src_objs if o.type == "ARMATURE"), None)

    arm_rest_corr = {}
    if src_arm is not None:
        for bname in ("LeftShoulder", "LeftArm", "LeftForeArm", "RightShoulder", "RightArm", "RightForeArm"):
            b_t = arm.data.bones.get(bname)
            b_s = src_arm.data.bones.get(bname)
            if b_t and b_s:
                y_t = (b_t.matrix_local.to_3x3() @ Vector((0.0, 1.0, 0.0))).normalized()
                y_s = (b_s.matrix_local.to_3x3() @ Vector((0.0, 1.0, 0.0))).normalized()
                swing_w = y_t.rotation_difference(y_s)
                qt = b_t.matrix_local.to_quaternion()
                arm_rest_corr[bname] = (qt.inverted() @ swing_w @ qt).normalized()

    for o in src_objs:
        bpy.data.objects.remove(o, do_unlink=True)

    wanted_clips = {
        "idle",
        "walk",
        "run",
        "combat_idle",
        "block_idle",
        "attack",
        "attack_2",
        "attack_3",
        "block",
        "hit",
        "death",
    }
    canonical_acts = [a for a in bpy.data.actions if a.name in wanted_clips]
    print("Canonical clips loaded:", [a.name for a in canonical_acts])

    # 9. Add dynamic secondary hair and cape spring motion across all canonical actions
    loop_clips = {"idle", "walk", "run", "combat_idle", "block_idle", "block"}
    arm.data.pose_position = "POSE"
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"

    def bind_act(a):
        arm.animation_data_create()
        arm.animation_data.action = a
        if hasattr(a, "slots") and len(a.slots) > 0:
            a.slots[0].name_display = arm.name
            arm.animation_data.action_slot = a.slots[0]

    for act in canonical_acts:
        bind_act(act)
        f0, f1 = [int(round(v)) for v in act.frame_range]
        n_frames = max(1, f1 - f0)
        is_loop = act.name in loop_clips
        n_cycles = max(1, round(n_frames / 30.0)) if is_loop else 1
        amp = 0.08 if act.name in ("run", "attack", "attack_2", "attack_3") else (0.018 if act.name == "idle" else 0.035)
        # Collect original arm rotations per frame before applying rest-pose correction
        orig_arm_rots = {}
        for f in range(f0, f1 + 1):
            sc.frame_set(f)
            bpy.context.view_layer.update()
            orig_arm_rots[f] = {
                bname: arm.pose.bones[bname].rotation_quaternion.copy() for bname in arm_rest_corr
            }
        for f in range(f0, f1 + 1):
            for bname, q_corr in arm_rest_corr.items():
                pb = arm.pose.bones[bname]
                pb.rotation_quaternion = (q_corr @ orig_arm_rots[f][bname]).normalized()
                pb.keyframe_insert("rotation_quaternion", frame=f)
            phase = 2.0 * math.pi * float(n_cycles) * float(f - f0) / float(n_frames) if is_loop else math.pi * float(f - f0) / float(n_frames)
            for bname in sec_bone_names:
                pb = arm.pose.bones[bname]
                chain_depth = int(bname.split("_")[-1])
                lag = (chain_depth - 1) * 0.65
                rx = math.sin(phase - lag) * amp * (0.6 + 0.35 * chain_depth)
                rz = math.cos(phase - lag) * amp * 0.4 * (1.0 if "_l" in bname else (-1.0 if "_r" in bname else 0.3))
                pb.rotation_quaternion = Quaternion((1.0, rx, 0.0, rz)).normalized()
                pb.keyframe_insert("rotation_quaternion", frame=f)
        arm.animation_data.action = None

    # 10. Bind all actions to NLA tracks and ensure POSE mode before exporting base GLB
    arm.data.pose_position = "POSE"
    arm.animation_data_create()
    arm.animation_data.action = None
    for tr in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(tr)
    for act in sorted(canonical_acts, key=lambda x: x.name):
        act.use_fake_user = True
        if hasattr(act, "slots") and len(act.slots) > 0:
            act.slots[0].name_display = arm.name
        tr = arm.animation_data.nla_tracks.new()
        tr.name = act.name
        f0 = int(round(act.frame_range[0]))
        strip = tr.strips.new(act.name, max(0, f0), act)
        strip.name = act.name
        if hasattr(act, "slots") and len(act.slots) > 0:
            strip.action_slot = act.slots[0]

    bpy.context.view_layer.update()
    os.makedirs(os.path.dirname(os.path.abspath(args.out_base)), exist_ok=True)
    print(f"Exporting base GLB to {args.out_base}...")
    bpy.ops.export_scene.gltf(
        filepath=args.out_base,
        export_format="GLB",
        export_morph=True,
        export_morph_normal=False,
        export_morph_tangent=False,
        export_skins=True,
        export_all_influences=False,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips_merged_animation_name="Animation",
        export_force_sampling=True,
        export_image_format="AUTO",
    )
    print(f"Exported {args.out_base} ({os.path.getsize(args.out_base)} bytes)")

    # 11. Retarget Mixamo Presets via build_mixamo_preset_pack.py (or fast-copy if --skip-mixamo)
    if args.skip_mixamo:
        import shutil
        sys.path.insert(0, os.path.dirname(__file__))
        from build_mixamo_preset_pack import stamp_glb
        shutil.copyfile(args.out_base, args.out_char)
        stamp_glb(args.out_char)
        print(f"Fast-copied and stamped {args.out_char} (--skip-mixamo)")
    else:
        preset_script = os.path.join(os.path.dirname(__file__), "build_mixamo_preset_pack.py")
        cmd = [
            "blender",
            "-b",
            "--factory-startup",
            "-P",
            preset_script,
            "--",
            "--base-glb",
            args.out_base,
            "--out-presets-glb",
            args.out_presets,
            "--out-catalog-json",
            args.out_catalog,
            "--out-character-glb",
            args.out_char,
        ]
        print("Running Mixamo preset retargeting:", " ".join(cmd))
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            print("STDOUT:", res.stdout[-2000:])
            print("STDERR:", res.stderr[-2000:])
            raise RuntimeError(f"Mixamo retargeting failed with exit {res.returncode}")
        print(f"Successfully generated {args.out_char} and {args.out_presets}")

    # 12. Gate 4 — Render 4-panel verification composite (<= 400x400) from final shipped args.out_char
    render_gate4_verification(args.out_char, "/tmp/silme_tpose_verify.jpg")


def render_gate4_verification(char_glb_path: str, out_jpg: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=char_glb_path)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for o in list(bpy.data.objects):
        if o.type == "MESH" and not o.vertex_groups:
            bpy.data.objects.remove(o, do_unlink=True)
    arm.data.pose_position = "POSE"
    canonical_acts = list(bpy.data.actions)

    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items else "BLENDER_EEVEE"
    sc.render.resolution_x = 200
    sc.render.resolution_y = 200
    sc.render.film_transparent = False
    if sc.world is None:
        sc.world = bpy.data.worlds.new("World")
    sc.world.use_nodes = True
    bg_node = sc.world.node_tree.nodes.get("Background")
    if bg_node:
        bg_node.inputs[0].default_value = (0.14, 0.14, 0.18, 1.0)
        bg_node.inputs[1].default_value = 1.0

    # Add balanced three-point lighting (no specular blowout)
    for name, loc, energy in [
        ("KeyLight", (0.8, -1.6, 1.3), 2.2),
        ("FillLight", (-1.0, -1.2, 0.9), 1.2),
        ("BackLight", (0.0, 1.5, 1.3), 1.8),
    ]:
        ldata = bpy.data.lights.new(name=name, type="SUN")
        ldata.energy = energy
        lobj = bpy.data.objects.new(name=name, object_data=ldata)
        sc.collection.objects.link(lobj)
        lobj.location = loc
        direction = Vector((0.0, 0.0, 0.55)) - Vector(loc)
        lobj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    cam_data = bpy.data.cameras.new("VerifyCam")
    cam_data.type = "ORTHO"
    cam_obj = bpy.data.objects.new("VerifyCam", cam_data)
    sc.collection.objects.link(cam_obj)
    sc.camera = cam_obj

    act_map = {a.name: a for a in canonical_acts}

    def set_act_frame(act_name: str, frame: int):
        a = act_map.get(act_name)
        if not a:
            return
        arm.animation_data_create()
        arm.animation_data.action = a
        if hasattr(a, "slots") and len(a.slots) > 0:
            arm.animation_data.action_slot = a.slots[0]
        sc.frame_set(frame)
        bpy.context.view_layer.update()

    panels = [
        ("front_idle", "idle", 1, (0.0, -1.5, 0.48), (0.0, 0.0, 0.48), 1.02),
        ("face_closeup", "idle", 1, (0.0, -1.2, 0.82), (0.0, 0.0, 0.82), 0.28),
        ("walk_stride", "walk", 8, (0.22, -1.5, 0.48), (0.0, 0.0, 0.48), 1.02),
        ("side_head_closeup", "idle", 1, (-1.2, -0.15, 0.82), (0.0, 0.0, 0.82), 0.30),
    ]
    panel_arrays = []
    for label, aname, fnum, cam_loc, target_loc, ortho_scale in panels:
        set_act_frame(aname, fnum)
        cam_obj.location = cam_loc
        cam_data.ortho_scale = ortho_scale
        direction = Vector(target_loc) - Vector(cam_loc)
        cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        tmp_png = f"/tmp/silme_panel_{label}.png"
        sc.render.filepath = tmp_png
        sc.render.image_settings.file_format = "PNG"
        bpy.ops.render.render(write_still=True)
        p_img = bpy.data.images.load(tmp_png)
        arr = np.array(p_img.pixels[:], dtype=np.float32).reshape((200, 200, 4))
        panel_arrays.append(arr)

    # Assemble 2x2 grid (400x400)
    top_row = np.concatenate([panel_arrays[0], panel_arrays[1]], axis=1)
    bot_row = np.concatenate([panel_arrays[2], panel_arrays[3]], axis=1)
    grid = np.concatenate([bot_row, top_row], axis=0)
    out_img = bpy.data.images.new("VerifyGrid", width=400, height=400, alpha=True)
    out_img.pixels[:] = grid.ravel().tolist()
    out_img.filepath_raw = out_jpg
    out_img.file_format = "JPEG"
    out_img.save()
    print(f"[Gate 4] Saved 4-panel verification sheet (400x400) to {out_jpg}")


if __name__ == "__main__":
    main()
