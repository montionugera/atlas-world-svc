#!/usr/bin/env python3
"""
Converts a VRoid Studio VRM (`.vrm` 0.x or 1.0, e.g., `Victoria_Rubin.vrm`, `AvatarSample_B.vrm`, `Vivi.vrm`)
into an Atlas World `pipelineCharacter` GLB:
  1. Normalizes facing direction (-Y forward in Blender / +Z in glTF), scales standing height to `--height`
     (default 0.94m to match Atlas World humanoid scale), grounds feet at Z=0, and aligns bone tails along
     their primary limb/spine/secondary directions so Mixamo and Meshy quaternion retargeting is 100% upright.
  2. Maps VRoid's `J_Bip_*` humanoid skeleton to the canonical Atlas World skeleton (`Hips`, `Spine02`, `Spine01`,
     `Spine`, `neck`, `Head`, `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand`, `RightShoulder`, `RightArm`,
     `RightForeArm`, `RightHand`, `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase`, `RightUpLeg`, `RightLeg`,
     `RightFoot`, `RightToeBase`).
  3. Maps ALL VRoid native hair spring chains (`HairJoint-*` UUID chains in VRM 0.x AND `J_Sec_Hair*` in VRM 1.0)
     AND outfit skirt/coat/sleeve spring chains (`J_Sec_*_Skirt*`, `J_Sec_*_CoatSkirt*`, `J_Sec_*_TopsUpperLeg*`,
     `J_Sec_*_LowerSleeve*`, `J_Sec_*_TipSleeve*`) directly into our 120Hz `SecondarySpringPhysics.cs` naming
     convention (`sec_hair_*_{depth}`, `sec_hem_*_{depth}`, `sec_cape_*_{depth}`).
"""

import argparse
import math
import os
import re
import sys
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Quaternion, Vector

VRM_TO_CANONICAL_BONES = {
    "J_Bip_C_Hips": "Hips",
    "J_Bip_C_Spine": "Spine02",
    "J_Bip_C_Chest": "Spine01",
    "J_Bip_C_UpperChest": "Spine",
    "J_Bip_C_Neck": "neck",
    "J_Bip_C_Head": "Head",
    "J_Bip_L_Shoulder": "LeftShoulder",
    "J_Bip_L_UpperArm": "LeftArm",
    "J_Bip_L_LowerArm": "LeftForeArm",
    "J_Bip_L_Hand": "LeftHand",
    "J_Bip_R_Shoulder": "RightShoulder",
    "J_Bip_R_UpperArm": "RightArm",
    "J_Bip_R_LowerArm": "RightForeArm",
    "J_Bip_R_Hand": "RightHand",
    "J_Bip_L_UpperLeg": "LeftUpLeg",
    "J_Bip_L_LowerLeg": "LeftLeg",
    "J_Bip_L_Foot": "LeftFoot",
    "J_Bip_L_ToeBase": "LeftToeBase",
    "J_Bip_R_UpperLeg": "RightUpLeg",
    "J_Bip_R_LowerLeg": "RightLeg",
    "J_Bip_R_Foot": "RightFoot",
    "J_Bip_R_ToeBase": "RightToeBase",
}

PRIMARY_CHILD = {
    "J_Bip_C_Hips": "J_Bip_C_Spine",
    "J_Bip_C_Spine": "J_Bip_C_Chest",
    "J_Bip_C_Chest": "J_Bip_C_UpperChest",
    "J_Bip_C_UpperChest": "J_Bip_C_Neck",
    "J_Bip_C_Neck": "J_Bip_C_Head",
    "J_Bip_L_Shoulder": "J_Bip_L_UpperArm",
    "J_Bip_L_UpperArm": "J_Bip_L_LowerArm",
    "J_Bip_L_LowerArm": "J_Bip_L_Hand",
    "J_Bip_R_Shoulder": "J_Bip_R_UpperArm",
    "J_Bip_R_UpperArm": "J_Bip_R_LowerArm",
    "J_Bip_R_LowerArm": "J_Bip_R_Hand",
    "J_Bip_L_UpperLeg": "J_Bip_L_LowerLeg",
    "J_Bip_L_LowerLeg": "J_Bip_L_Foot",
    "J_Bip_L_Foot": "J_Bip_L_ToeBase",
    "J_Bip_R_UpperLeg": "J_Bip_R_LowerLeg",
    "J_Bip_R_LowerLeg": "J_Bip_R_Foot",
    "J_Bip_R_Foot": "J_Bip_R_ToeBase",
}

HELPER_WEIGHT_TARGET = {
    "J_Aim_L_Shoulder": "LeftShoulder",
    "J_Aim_L_TopsUpperArm": "LeftArm",
    "J_Roll_L_UpperArm": "LeftArm",
    "J_Roll_L_Elbow": "LeftForeArm",
    "J_Roll_L_LowerArm": "LeftForeArm",
    "J_Roll_L_Hand": "LeftHand",
    "J_Aim_R_Shoulder": "RightShoulder",
    "J_Aim_R_TopsUpperArm": "RightArm",
    "J_Roll_R_UpperArm": "RightArm",
    "J_Roll_R_Elbow": "RightForeArm",
    "J_Roll_R_LowerArm": "RightForeArm",
    "J_Roll_R_Hand": "RightHand",
    "J_Aim_L_UpperLeg": "LeftUpLeg",
    "J_Roll_L_UpperLeg": "LeftUpLeg",
    "J_Aim_R_UpperLeg": "RightUpLeg",
    "J_Roll_R_UpperLeg": "RightUpLeg",
    "J_Adj_L_FaceEye": "Head",
    "J_Adj_R_FaceEye": "Head",
    "J_Adj_L_FaceEyeSet": "Head",
    "J_Adj_R_FaceEyeSet": "Head",
    "J_Sec_L_Bust1": "Spine",
    "J_Sec_L_Bust2": "Spine",
    "J_Sec_R_Bust1": "Spine",
    "J_Sec_R_Bust2": "Spine",
}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--vrm",
        default="/Users/pasitnusso/asset-studio-private/atlas-3d-plan/vroid_bases/Victoria_Rubin.vrm",
    )
    ap.add_argument(
        "--ref-anims-glb",
        default="game-client/studio-cache/b6ca879a29f94c47a5794bff2ee36770200203fb914ec6ee22030151bf397697.glb",
    )
    ap.add_argument(
        "--twintails-vrm",
        default="/Users/pasitnusso/asset-studio-private/atlas-3d-plan/vroid_bases/HairSample_Female.vrm",
        help="Optional VRM with twin-tails hair mesh to transplant and extend to hip length (#604042 dark brown)",
    )
    ap.add_argument("--height", type=float, default=0.94)
    ap.add_argument("--out", default="/tmp/vroid_sample_base.glb")
    return ap.parse_args(argv)


def transplant_long_twintails_hair(target_arm, target_meshes: list, twintails_vrm_path: str):
    """
    Replaces `target_arm`'s `Hair001` mesh and `HairJoint-*` bones with VRoid's center-parted
    twin-tails hair from `HairSample_Female.vrm`, removing the 151 cat-ear bow vertices,
    extending the left & right twin-tail bundles down to waist/hip level (`z = 0.88m` in VRM space),
    coloring the hair rich dark-brown (`#604042` with `#DDB3B1` highlight), and rigging each
    long twin-tail to a smooth 3-link spring-bone chain (`HairJoint-L_1..3`, `HairJoint-R_1..3`).
    """
    if not twintails_vrm_path or not os.path.exists(twintails_vrm_path):
        return target_meshes

    existing_objs = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=twintails_vrm_path)
    new_objs = [o for o in bpy.data.objects if o not in existing_objs]

    src_arm = next((o for o in new_objs if o.type == "ARMATURE"), None)
    src_hair = next((o for o in new_objs if o.type == "MESH" and "Hair" in o.name and o.vertex_groups), None)
    if src_arm is None or src_hair is None:
        for o in new_objs:
            bpy.data.objects.remove(o, do_unlink=True)
        return target_meshes

    if src_hair.data.shape_keys:
        src_hair.shape_key_clear()

    # Align source Hair001 to target J_Bip_C_Head in VRM pre-normalized space
    src_head_co = src_arm.data.bones["J_Bip_C_Head"].head_local.copy()
    tgt_head_co = target_arm.data.bones["J_Bip_C_Head"].head_local.copy()
    delta_head = tgt_head_co - src_head_co

    vg_idx_to_name = {g.index: g.name for g in src_hair.vertex_groups}
    cat_ear_groups = {
        "HairJoint-497a97b7-0bdc-4267-b035-69f3756b7131",
        "HairJoint-3b3816bb-29a0-4f71-a43b-955cd9f77fee",
        "HairJoint-657f1584-c779-4ae9-b57d-5930319d77a4",
        "HairJoint-48a7d468-0b6e-4433-a606-d6a9d8605c20",
    }
    left_tail_groups = {
        "HairJoint-e7d28e69-662e-4477-aab0-b5306c3d289e",
        "HairJoint-bd3d74cd-25c5-4b6f-8ab4-26e33295af50",
        "HairJoint-072bb29a-1352-4368-9965-3ad8d6adae3a",
    }
    right_tail_groups = {
        "HairJoint-bdda9c05-5e10-4c8a-abe5-be7e2c14be93",
        "HairJoint-57e03dad-29d9-4b6e-9cbd-9d7abc5241b0",
        "HairJoint-b38a18db-210c-45be-a86b-f132749b5f7c",
    }
    front_bang_groups = {
        "HairJoint-7a62315d-abea-4b4a-8710-52770aea9364",
        "HairJoint-a9eb6651-9b09-4f52-9181-d468710fdd0b",
    }
    left_side_groups = {
        "HairJoint-a6e7e603-7ea0-4e51-b4ef-7eb38f08503a",
        "HairJoint-7e3d21ed-7f06-4187-bc0f-54c178df85e8",
    }
    right_side_groups = {
        "HairJoint-075310cc-2c55-4f87-bee0-66afe35050fb",
        "HairJoint-bb44c057-ba1b-48cf-a828-ee58c3a4328d",
    }

    # 1. Delete cat-ear bow vertices cleanly via bmesh
    cat_vert_indices = set()
    for v in src_hair.data.vertices:
        w_cat = sum(g.weight for g in v.groups if vg_idx_to_name.get(g.group) in cat_ear_groups)
        if w_cat > 0.25:
            cat_vert_indices.add(v.index)

    bm = bmesh.new()
    bm.from_mesh(src_hair.data)
    bm.verts.ensure_lookup_table()
    to_del = [bm.verts[i] for i in cat_vert_indices if i < len(bm.verts)]
    bmesh.ops.delete(bm, geom=to_del, context="VERTS")
    bm.to_mesh(src_hair.data)
    bm.free()

    # 2. Extend twin-tail vertices from z=[1.606..1.316] down to hip/skirt level z=[1.606..0.880]
    #    and rebuild clean 3-link vertex weights for each long twin-tail
    z_tie_src = 1.606
    z_tip_src = 1.316
    span_src = z_tie_src - z_tip_src  # 0.290m
    span_dst = 0.725                  # reaches z=0.881m in source space (waist/hips!)

    vg_idx_to_name = {g.index: g.name for g in src_hair.vertex_groups}
    new_weights = []

    for v in src_hair.data.vertices:
        w_left = sum(g.weight for g in v.groups if vg_idx_to_name.get(g.group) in left_tail_groups)
        w_right = sum(g.weight for g in v.groups if vg_idx_to_name.get(g.group) in right_tail_groups)
        w_fb = sum(g.weight for g in v.groups if vg_idx_to_name.get(g.group) in front_bang_groups)
        w_ls = sum(g.weight for g in v.groups if vg_idx_to_name.get(g.group) in left_side_groups)
        w_rs = sum(g.weight for g in v.groups if vg_idx_to_name.get(g.group) in right_side_groups)

        co = v.co.copy()
        w_tail = w_left + w_right
        if w_tail > 0.05:
            is_left = w_left >= w_right
            side_sign = -1.0 if is_left else 1.0
            t = max(0.0, min(1.0, (z_tie_src - co.z) / span_src))
            # Smoothly stretch vertical drop from 0.29m to 0.725m (blended by w_tail near tie root)
            eff_t = t * min(1.0, w_tail * 1.35)
            new_z = z_tie_src - eff_t * span_dst
            co.z = co.z * (1.0 - min(1.0, w_tail * 1.2)) + new_z * min(1.0, w_tail * 1.2)

            # Gentle inward taper near the lower tips (matching the VRoid reference silhouette)
            inward_curve = math.sin(eff_t * math.pi) * 0.015 - (eff_t ** 1.8) * 0.042
            co.x += side_sign * inward_curve
            # Keep twin-tails cleanly behind the shoulders/back (y < -0.045 in +Y forward VRM 0.x space)
            co.y -= 0.028 * math.sin(min(1.0, eff_t * 1.3) * math.pi * 0.5)

            p = "HairJoint-L" if is_left else "HairJoint-R"
            if eff_t < 0.10:
                u = eff_t / 0.10
                vw = {"J_Bip_C_Head": 1.0 - 0.85 * u, f"{p}_1": 0.85 * u}
            elif eff_t < 0.35:
                u = (eff_t - 0.10) / 0.25
                vw = {f"{p}_1": 1.0 - u, f"{p}_2": u}
            elif eff_t < 0.62:
                u = (eff_t - 0.35) / 0.27
                vw = {f"{p}_2": 1.0 - u, f"{p}_3": u}
            elif eff_t < 0.88:
                u = (eff_t - 0.62) / 0.26
                vw = {f"{p}_3": 1.0 - u, f"{p}_4": u}
            else:
                vw = {f"{p}_4": 1.0}
        elif w_fb > 0.10:
            vw = {"J_Bip_C_Head": 1.0 - 0.65 * w_fb, "HairJoint-CF_1": 0.65 * w_fb}
        elif w_ls > 0.10:
            vw = {"J_Bip_C_Head": 1.0 - 0.65 * w_ls, "HairJoint-LS_1": 0.65 * w_ls}
        elif w_rs > 0.10:
            vw = {"J_Bip_C_Head": 1.0 - 0.65 * w_rs, "HairJoint-RS_1": 0.65 * w_rs}
        else:
            vw = {"J_Bip_C_Head": 1.0}
            # Push scalp vertices slightly outward (+3.5mm) so they cleanly cover any inner head cap
            radial = Vector((co.x, co.y - 0.01, max(0.0, co.z - 1.48)))
            if radial.length > 1e-4:
                co += radial.normalized() * 0.0035

        v.co = co + delta_head
        new_weights.append(vw)

    src_hair.vertex_groups.clear()
    for vi, vw in enumerate(new_weights):
        tot = sum(vw.values())
        for gname, w in vw.items():
            if w > 1e-4:
                vg = src_hair.vertex_groups.get(gname) or src_hair.vertex_groups.new(name=gname)
                vg.add([vi], w / tot, "REPLACE")

    # 3. Recolor hair textures on src_hair (and any HairBack material on target Body) to luminance-normalized
    #    warm brown/neutral so CharacterCustomization.SetHairColor(MaroChestnut) produces rich #604042 + #DDB3B1 highlights
    hair_mats = list(src_hair.data.materials)
    for tm in target_meshes:
        for mat in tm.data.materials:
            if mat and "hair" in mat.name.lower():
                hair_mats.append(mat)

    for mat in hair_mats:
        if not mat or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                img = node.image
                w, h = img.size[:]
                px = np.array(img.pixels[:], dtype=np.float32).reshape((h, w, 4))
                rgb = px[:, :, :3]
                lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
                l_min, l_max = float(np.percentile(lum, 5)), float(np.percentile(lum, 95))
                norm_l = np.clip((lum - l_min) / max(0.08, l_max - l_min), 0.0, 1.0)
                # Warm neutral-brown base so both untinted Blender renders and Godot AlbedoColor*Texture look rich #604042
                base_col = np.array([0.24, 0.15, 0.16], dtype=np.float32)
                mid_col = np.array([0.40, 0.26, 0.27], dtype=np.float32)
                hi_col = np.array([0.78, 0.58, 0.56], dtype=np.float32)
                new_rgb = (
                    base_col * (1.0 - norm_l[:, :, None])
                    + mid_col * norm_l[:, :, None]
                    + hi_col * (np.clip((norm_l - 0.55) / 0.45, 0.0, 1.0) ** 1.5)[:, :, None] * 0.45
                )
                px[:, :, :3] = np.clip(new_rgb, 0.0, 1.0)
                img.pixels[:] = px.ravel().tolist()
                img.pack()

    # 4. Replace old Hair001 mesh on target_arm and rebuild HairJoint-* bones on target_arm
    old_hairs = [m for m in target_meshes if "Hair" in m.name]
    for oh in old_hairs:
        target_meshes.remove(oh)
        bpy.data.objects.remove(oh, do_unlink=True)

    src_hair.parent = target_arm
    for mod in src_hair.modifiers:
        if mod.type == "ARMATURE":
            mod.object = target_arm
    src_hair.name = "Hair001.baked"
    target_meshes.append(src_hair)

    for o in new_objs:
        if o != src_hair:
            bpy.data.objects.remove(o, do_unlink=True)

    bpy.context.view_layer.objects.active = target_arm
    bpy.ops.object.mode_set(mode="EDIT")
    ebones = target_arm.data.edit_bones
    for b in list(ebones):
        if b.name.startswith("HairJoint") or b.name.startswith("J_Sec_Hair"):
            ebones.remove(b)

    head_eb = ebones["J_Bip_C_Head"]
    z_tie = z_tie_src + delta_head.z
    z_m1 = (z_tie_src - span_dst * 0.25) + delta_head.z
    z_m2 = (z_tie_src - span_dst * 0.50) + delta_head.z
    z_m3 = (z_tie_src - span_dst * 0.75) + delta_head.z
    z_tip = (z_tie_src - span_dst) + delta_head.z

    for prefix, sx in (("HairJoint-L", -1.0), ("HairJoint-R", 1.0)):
        pts = [
            Vector((sx * 0.075, -0.032, z_tie)),
            Vector((sx * 0.112, -0.050, z_m1)),
            Vector((sx * 0.128, -0.060, z_m2)),
            Vector((sx * 0.122, -0.064, z_m3)),
            Vector((sx * 0.105, -0.062, z_tip)),
        ]
        parent_eb = head_eb
        for idx in range(4):
            nb = ebones.new(f"{prefix}_{idx + 1}")
            nb.head = pts[idx]
            nb.tail = pts[idx + 1]
            nb.parent = parent_eb
            nb.use_connect = idx > 0
            parent_eb = nb

    for bname, h_pt, t_pt in (
        ("HairJoint-CF_1", Vector((0.0, 0.105, 1.545 + delta_head.z)), Vector((0.0, 0.110, 1.475 + delta_head.z))),
        ("HairJoint-LS_1", Vector((-0.078, 0.052, 1.458 + delta_head.z)), Vector((-0.075, 0.048, 1.395 + delta_head.z))),
        ("HairJoint-RS_1", Vector((0.078, 0.052, 1.458 + delta_head.z)), Vector((0.075, 0.048, 1.395 + delta_head.z))),
    ):
        nb = ebones.new(bname)
        nb.head = h_pt
        nb.tail = t_pt
        nb.parent = head_eb
        nb.use_connect = False

    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    print("Transplanted long dark-brown (#604042) twin-tails hair onto target VRoid armature!")
    return target_meshes


def bind_action(arm, act):
    arm.animation_data_create()
    arm.animation_data.action = act
    if hasattr(act, "slots") and len(act.slots) > 0:
        act.slots[0].name_display = arm.name
        arm.animation_data.action_slot = act.slots[0]


def build_secondary_bone_map(arm) -> dict[str, str]:
    """
    Walks all secondary hair and cloth chains in the VRM armature (both VRM 0.x `HairJoint-*` / `J_Sec_*_Skirt*`
    and VRM 1.0 `J_Sec_Hair*` / `J_Sec_*_Tops*`) and assigns clean `sec_hair_*_{depth}`, `sec_hem_*_{depth}`,
    and `sec_cape_*_{depth}` names ordered by chain depth (1, 2, 3, ...).
    """
    sec_map = {}
    strand_idx = 0

    for b in arm.data.bones:
        # Root of a secondary chain is any non-J_Bip, non-helper bone whose parent is a J_Bip/Roll/Aim bone
        is_hair_root = (
            b.name.startswith("HairJoint") or b.name.startswith("J_Sec_Hair")
        ) and (b.parent is None or not (b.parent.name.startswith("HairJoint") or b.parent.name.startswith("J_Sec_Hair")))
        is_cloth_root = (
            b.name.startswith("J_Sec_")
            and not b.name.startswith("J_Sec_Hair")
            and "Bust" not in b.name
            and (b.parent is None or not b.parent.name.startswith("J_Sec_"))
        )
        if not (is_hair_root or is_cloth_root):
            continue

        strand_idx += 1
        chain = []
        cur = b
        while cur is not None:
            chain.append(cur)
            next_children = [
                c
                for c in cur.children
                if c.name.startswith("HairJoint") or c.name.startswith("J_Sec_")
            ]
            cur = next_children[0] if next_children else None

        if is_hair_root:
            # Classify hair strand by root position relative to Head
            head_co = b.head_local
            if head_co.y < -0.025 and abs(head_co.x) < 0.055:
                prefix = f"sec_hair_cf{strand_idx}"
            elif head_co.x > 0.028:
                prefix = f"sec_hair_l{strand_idx}"
            elif head_co.x < -0.028:
                prefix = f"sec_hair_r{strand_idx}"
            else:
                prefix = f"sec_hair_c{strand_idx}"
        else:
            lname = b.name.lower()
            side = "l" if "_l_" in lname else ("r" if "_r_" in lname else "c")
            if "sleeve" in lname or "upperarm" in lname or "hood" in lname or "cape" in lname:
                prefix = f"sec_cape_{side}{strand_idx}"
            else:
                prefix = f"sec_hem_{side}{strand_idx}"

        for depth, cb in enumerate(chain, start=1):
            sec_map[cb.name] = f"{prefix}_{depth}"

    return sec_map


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = 30

    bpy.ops.import_scene.gltf(filepath=args.vrm)
    for o in list(bpy.data.objects):
        if o.type == "MESH" and not o.vertex_groups:
            bpy.data.objects.remove(o, do_unlink=True)

    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    arm.name = "Armature"
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.vertex_groups]
    print("Imported VRoid meshes:", [m.name for m in meshes])

    # Extract 5 combined eye+brow expression deltas on Face mesh before clearing shape keys for transform_apply
    face_mesh = next((m for m in meshes if "Face" in m.name), None)
    face_expr_deltas = {}
    if face_mesh is not None and face_mesh.data.shape_keys:
        kb = face_mesh.data.shape_keys.key_blocks
        n_fv = len(face_mesh.data.vertices)
        basis_co = np.array([kb[0].data[i].co for i in range(n_fv)], dtype=np.float32)

        def _get_delta(idx: int) -> np.ndarray:
            tn = f"target_{idx}"
            if tn not in kb:
                return np.zeros_like(basis_co)
            return np.array([kb[tn].data[i].co for i in range(n_fv)], dtype=np.float32) - basis_co

        face_expr_deltas = {
            "eye_blink": _get_delta(12),
            "eye_happy": _get_delta(15) + 0.70 * _get_delta(7),
            "eye_angry": _get_delta(11) + 0.80 * _get_delta(5),
            "eye_sorrow": _get_delta(18) + 0.80 * _get_delta(8),
            "eye_surprised": _get_delta(19) + 0.70 * _get_delta(9),
        }

    # Remove all shape keys on Face/Body/Hair before transforms so 58 VRM morph targets don't bloat the GLB
    for m in meshes:
        if m.data.shape_keys:
            m.shape_key_clear()

    # Remove any helper EMPTIES or non-skinned objects
    for o in list(bpy.data.objects):
        if o != arm and o not in meshes:
            bpy.data.objects.remove(o, do_unlink=True)

    if args.twintails_vrm:
        meshes = transplant_long_twintails_hair(arm, meshes, args.twintails_vrm)

    # 1. Normalize facing direction (-Y forward in Blender), scale standing height to args.height (0.94m), ground at Z=0
    rotated_180_z = False
    if arm.data.bones["J_Bip_L_ToeBase"].head_local.y > arm.data.bones["J_Bip_L_Foot"].head_local.y:
        arm.matrix_world = Matrix.Rotation(math.pi, 4, "Z") @ arm.matrix_world
        bpy.context.view_layer.update()
        rotated_180_z = True

    dg = bpy.context.evaluated_depsgraph_get()
    zs = [(m.evaluated_get(dg).matrix_world @ v.co).z for m in meshes for v in m.data.vertices]
    cur_h = max(zs) - min(zs)
    scale_factor = args.height / cur_h
    arm.matrix_world = Matrix.Diagonal((scale_factor, scale_factor, scale_factor, 1.0)) @ arm.matrix_world
    bpy.context.view_layer.update()

    dg = bpy.context.evaluated_depsgraph_get()
    pts = [m.evaluated_get(dg).matrix_world @ v.co for m in meshes for v in m.data.vertices]
    min_z = min(p.z for p in pts)
    cx = 0.5 * (min(p.x for p in pts) + max(p.x for p in pts))
    cy = 0.5 * (min(p.y for p in pts) + max(p.y for p in pts))
    arm.matrix_world = Matrix.Translation((-cx, -cy, -min_z)) @ arm.matrix_world
    bpy.context.view_layer.update()

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()

    # 1b. Make VRoid Face mouthless smooth porcelain + restore 5 eye+brow expression morph targets
    if face_mesh is not None and face_mesh in meshes:
        for mat in face_mesh.data.materials:
            if not mat or not mat.node_tree:
                continue
            for n in mat.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image and "Face_00" in n.image.name:
                    img = n.image
                    iw, ih = img.size
                    px = np.array(img.pixels[:], dtype=np.float32).reshape((ih, iw, 4))
                    patch = px[int(ih * 0.30) : int(ih * 0.34), int(iw * 0.46) : int(iw * 0.54), :3]
                    skin_rgb = np.median(patch.reshape(-1, 3), axis=0)
                    px[int(ih * 0.18) : int(ih * 0.30), int(iw * 0.40) : int(iw * 0.60), :3] = skin_rgb
                    img.pixels[:] = px.ravel().tolist()
                    img.update()
                    img.pack()

        bpy.context.view_layer.objects.active = face_mesh
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
        bpy.ops.object.mode_set(mode="OBJECT")

        bm = bmesh.new()
        bm.from_mesh(face_mesh.data)
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        orig_layer = bm.verts.layers.int.new("orig_vi")
        for i, v in enumerate(bm.verts):
            v[orig_layer] = i

        mouth_faces = [f for f in bm.faces if f.material_index == 0]
        bmesh.ops.delete(bm, geom=mouth_faces, context="FACES_ONLY")
        loose_v = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose_v, context="VERTS")

        bm.verts.ensure_lookup_table()
        mouth_boundary = [
            v for v in bm.verts if v.is_boundary and abs(v.co.x) < 0.025 and 0.785 < v.co.z < 0.840 and v.co.y < -0.030
        ]
        bmesh.ops.remove_doubles(bm, verts=mouth_boundary, dist=0.003)

        bm.verts.ensure_lookup_table()
        for _ in range(12):
            mouth_region = [
                v
                for v in bm.verts
                if not v.is_boundary and abs(v.co.x) < 0.025 and 0.785 < v.co.z < 0.838 and v.co.y < -0.030
            ]
            bmesh.ops.smooth_vert(bm, verts=mouth_region, factor=0.65, use_axis_x=True, use_axis_y=True, use_axis_z=True)

        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.verts.ensure_lookup_table()
        kept_orig_idx = [v[orig_layer] for v in bm.verts]
        bm.to_mesh(face_mesh.data)
        bm.free()
        for p in face_mesh.data.polygons:
            p.use_smooth = True
        face_mesh.data.update()

        if face_expr_deltas:
            sx = (-scale_factor) if rotated_180_z else scale_factor
            sy = (-scale_factor) if rotated_180_z else scale_factor
            sz = scale_factor
            sk_basis = face_mesh.shape_key_add(name="Basis", from_mix=False)
            for expr_name, d_arr in face_expr_deltas.items():
                sk = face_mesh.shape_key_add(name=expr_name, from_mix=False)
                for new_vi, old_vi in enumerate(kept_orig_idx):
                    base_pt = sk_basis.data[new_vi].co
                    if base_pt.z < 0.832:
                        sk.data[new_vi].co = base_pt
                    else:
                        dv = d_arr[old_vi]
                        sk.data[new_vi].co = base_pt + Vector((dv[0] * sx, dv[1] * sy, dv[2] * sz))
        face_mesh.name = "FaceMesh"
        face_mesh.data.name = "FaceMesh"

    # 2. Build complete bone rename map for J_Bip_*, HairJoint-*/J_Sec_Hair*, and J_Sec_*_Skirt/Sleeve/Tops*
    sec_bone_map = build_secondary_bone_map(arm)
    bone_rename = dict(VRM_TO_CANONICAL_BONES)
    bone_rename.update(sec_bone_map)
    print(f"Mapped {len(VRM_TO_CANONICAL_BONES)} primary humanoid bones + {len(sec_bone_map)} secondary hair/outfit spring bones")

    # Map finger bones to LeftHand/RightHand so finger vertices stay rigid with the hand
    for b in arm.data.bones:
        if any(k in b.name for k in ("Index", "Middle", "Ring", "Little", "Thumb")):
            if "_L_" in b.name:
                HELPER_WEIGHT_TARGET[b.name] = "LeftHand"
            elif "_R_" in b.name:
                HELPER_WEIGHT_TARGET[b.name] = "RightHand"

    # 3. Rename vertex groups on all meshes and merge helper weights into canonical parents
    for m in meshes:
        for vg in list(m.vertex_groups):
            if vg.name in bone_rename:
                vg.name = bone_rename[vg.name]

        for helper_name, target_name in HELPER_WEIGHT_TARGET.items():
            if helper_name in m.vertex_groups and target_name not in m.vertex_groups:
                m.vertex_groups.new(name=target_name)

        for v in m.data.vertices:
            w_map = {}
            for g in v.groups:
                if g.weight <= 1e-5:
                    continue
                gname = m.vertex_groups[g.group].name
                target = HELPER_WEIGHT_TARGET.get(gname, gname)
                w_map[target] = w_map.get(target, 0.0) + g.weight
            top = sorted(w_map.items(), key=lambda kv: kv[1], reverse=True)[:4]
            tot = sum(w for _, w in top)
            for vg in m.vertex_groups:
                vg.remove([v.index])
            if tot > 1e-5:
                for gname, w in top:
                    vg = m.vertex_groups.get(gname) or m.vertex_groups.new(name=gname)
                    vg.add([v.index], w / tot, "REPLACE")

        for helper_name in list(HELPER_WEIGHT_TARGET.keys()):
            if helper_name in m.vertex_groups:
                m.vertex_groups.remove(m.vertex_groups[helper_name])

    # 4. Edit Armature: align bone tails along primary limb/chain directions, rename bones,
    #    re-parent secondary roots whose parent was a J_Roll/J_Aim helper, delete unused helpers,
    #    and add prop_weapon_r + handslot.r on RightHand
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    ebones = arm.data.edit_bones

    for bname, cname in PRIMARY_CHILD.items():
        if bname in ebones and cname in ebones:
            eb = ebones[bname]
            cb = ebones[cname]
            if (cb.head - eb.head).length > 0.008:
                eb.tail = cb.head.copy()
                eb.align_roll(Vector((0.0, -1.0, 0.0)) if ("Leg" in bname or "Foot" in bname) else Vector((0.0, 0.0, 1.0)))

    for bname in ("J_Bip_C_Head", "J_Bip_L_Hand", "J_Bip_R_Hand", "J_Bip_L_ToeBase", "J_Bip_R_ToeBase"):
        if bname in ebones:
            eb = ebones[bname]
            if bname == "J_Bip_C_Head":
                eb.tail = eb.head + Vector((0.0, 0.0, 0.06))
                eb.align_roll(Vector((0.0, -1.0, 0.0)))
            elif "Hand" in bname:
                d = (eb.head - eb.parent.head).normalized() if eb.parent else Vector((1.0, 0.0, 0.0))
                eb.tail = eb.head + d * 0.04
                eb.align_roll(Vector((0.0, 0.0, 1.0)))
            elif "ToeBase" in bname:
                eb.tail = eb.head + Vector((0.0, -0.04, 0.0))
                eb.align_roll(Vector((0.0, 0.0, 1.0)))

    # Align secondary chain bone tails along each chain
    for old_name in sec_bone_map:
        if old_name not in ebones:
            continue
        eb = ebones[old_name]
        sec_children = [c for c in eb.children if c.name in sec_bone_map]
        if sec_children and (sec_children[0].head - eb.head).length > 0.005:
            eb.tail = sec_children[0].head.copy()
        elif eb.parent and eb.parent.name in sec_bone_map and (eb.head - eb.parent.head).length > 0.005:
            eb.tail = eb.head + (eb.head - eb.parent.head)
        else:
            eb.tail = eb.head + Vector((0.0, 0.0, -0.04))

    for old_name, new_name in bone_rename.items():
        if old_name in ebones:
            ebones[old_name].name = new_name

    keep_bones = set(bone_rename.values())
    for eb in list(ebones):
        if eb.name in keep_bones and eb.parent and eb.parent.name not in keep_bones:
            # Climb ancestors until we find a kept bone
            p = eb.parent
            while p is not None and p.name not in keep_bones:
                tname = HELPER_WEIGHT_TARGET.get(p.name)
                if tname and tname in ebones:
                    p = ebones[tname]
                    break
                p = p.parent
            eb.parent = p

    for eb in list(ebones):
        if eb.name not in keep_bones:
            ebones.remove(eb)

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

    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()

    # 5. Configure PBR materials so VRoid's original hair/face/outfit colors render cleanly
    alpha_keywords = ("FaceMouth", "FaceEyeline", "FaceEyelash", "FaceBrow", "EyeHighlight", "EyeExtra")
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        nt = mat.node_tree
        tex_img = None
        for n in nt.nodes:
            if n.type == "TEX_IMAGE" and n.image:
                tex_img = n.image
                break
        if not tex_img:
            continue
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Roughness"].default_value = 0.78 if "Hair" in mat.name else 0.90
        bsdf.inputs["Metallic"].default_value = 0.0
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.12
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = tex_img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if any(k in mat.name for k in alpha_keywords):
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    for img in bpy.data.images:
        w, h = img.size
        if w > 512 or h > 512:
            img.scale(min(512, w), min(512, h))
            img.pack()

    # Join Body and Hair into CharacterMesh, keeping FaceMesh separate so its 5 eye expression morph targets stay lightweight
    body_hair_meshes = [m for m in meshes if m != face_mesh]
    bpy.ops.object.select_all(action="DESELECT")
    for m in body_hair_meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = body_hair_meshes[0]
    if len(body_hair_meshes) > 1:
        bpy.ops.object.join()
    mesh_obj = bpy.context.view_layer.objects.active
    mesh_obj.name = "CharacterMesh"
    mesh_obj.data.name = "CharacterMesh"

    # 6. Import canonical combat/locomotion actions from ref-anims-glb and retarget onto the VRoid rig
    before_objs = set(bpy.data.objects)
    before_acts = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=args.ref_anims_glb)
    ref_arm = next(o for o in bpy.data.objects if o not in before_objs and o.type == "ARMATURE")
    ref_acts = [a for a in bpy.data.actions if a not in before_acts]

    order = []

    def walk_bones(b):
        order.append(b.name)
        for c in b.children:
            walk_bones(c)

    for b in arm.data.bones:
        if b.parent is None:
            walk_bones(b)

    TR = {n: arm.data.bones[n].matrix_local.to_3x3() for n in order}
    SR = {b.name: b.matrix_local.to_quaternion() for b in ref_arm.data.bones}
    OFF = {}
    for bname in order:
        if bname in SR and not bname.startswith("sec_") and bname not in ("prop_weapon_r", "handslot.r"):
            q_rest = SR[bname].inverted() @ TR[bname].to_quaternion()
            if bname in ("LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand"):
                s_y = SR[bname] @ Vector((0.0, 1.0, 0.0))
                t_y = TR[bname].to_quaternion() @ Vector((0.0, 1.0, 0.0))
                swing_w = t_y.rotation_difference(s_y)
                q_swing = (SR[bname].inverted() @ swing_w @ TR[bname].to_quaternion()).normalized()
                OFF[bname] = q_swing
            elif bname in ("LeftUpLeg", "RightUpLeg"):
                s_y = SR[bname] @ Vector((0.0, 1.0, 0.0))
                t_y = TR[bname].to_quaternion() @ Vector((0.0, 1.0, 0.0))
                swing_w = t_y.rotation_difference(s_y)
                q_swing = (SR[bname].inverted() @ swing_w @ TR[bname].to_quaternion()).normalized()
                OFF[bname] = q_swing
            else:
                OFF[bname] = q_rest

    hips_scale = arm.data.bones["Hips"].head_local.z / max(0.2, ref_arm.data.bones["Hips"].head_local.z)
    foot_z_t = min(arm.data.bones["LeftFoot"].head_local.z, arm.data.bones["RightFoot"].head_local.z)

    retargeted = []
    for sact in ref_acts:
        cname = sact.name
        f0, f1 = [int(round(v)) for v in sact.frame_range]
        bind_action(ref_arm, sact)
        sc.frame_set(f0)
        bpy.context.view_layer.update()
        hs0 = ref_arm.pose.bones["Hips"].head.copy()

        act = bpy.data.actions.new(f"vrm_{cname}")
        arm.data.pose_position = "POSE"
        bind_action(arm, act)
        for pb in arm.pose.bones:
            pb.rotation_mode = "QUATERNION"
            pb.location = (0.0, 0.0, 0.0)
            pb.scale = (1.0, 1.0, 1.0)

        hips_deltas = []
        min_ankle = 1e9
        for f in range(f0, f1 + 1):
            out_f = f - f0 + 1
            sc.frame_set(f)
            bpy.context.view_layer.update()
            W = {}
            for n in order:
                pb = arm.pose.bones[n]
                b = arm.data.bones[n]
                if n in OFF:
                    sw = ref_arm.pose.bones[n].matrix.to_quaternion()
                    W[n] = sw @ OFF[n]
                else:
                    W[n] = (
                        (W[b.parent.name] @ (TR[b.parent.name].inverted() @ TR[n]).to_quaternion())
                        if b.parent
                        else TR[n].to_quaternion()
                    )
                if b.parent:
                    lr = (TR[b.parent.name].inverted() @ TR[n]).to_quaternion()
                    pb.rotation_quaternion = (lr.inverted() @ W[b.parent.name].inverted() @ W[n]).normalized()
                else:
                    pb.rotation_quaternion = (TR[n].to_quaternion().inverted() @ W[n]).normalized()

                if n == "Hips":
                    d = (ref_arm.pose.bones["Hips"].head - hs0) * hips_scale
                    d.x *= 0.25
                    d.y = 0.0
                    hips_deltas.append(d.copy())
                    pb.location = TR["Hips"].inverted() @ d
                    pb.keyframe_insert("location", frame=out_f)

                if n in OFF or n.startswith("sec_"):
                    pb.keyframe_insert("rotation_quaternion", frame=out_f)

            bpy.context.view_layer.update()
            lz = arm.pose.bones["LeftFoot"].head.z
            rz = arm.pose.bones["RightFoot"].head.z
            min_ankle = min(min_ankle, min(lz, rz) - foot_z_t)

        for idx, d in enumerate(hips_deltas):
            out_f = idx + 1
            d_grounded = Vector((d.x, d.y, d.z - min_ankle))
            arm.pose.bones["Hips"].location = TR["Hips"].inverted() @ d_grounded
            arm.pose.bones["Hips"].keyframe_insert("location", frame=out_f)

        retargeted.append((cname, act))

    for o in [o for o in bpy.data.objects if o not in before_objs]:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in ref_acts:
        bpy.data.actions.remove(a)

    for cname, act in retargeted:
        act.name = cname
        act.use_fake_user = True

    arm.animation_data.action = None
    for tr in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(tr)
    for cname, act in retargeted:
        bind_action(arm, act)
        tr = arm.animation_data.nla_tracks.new()
        tr.name = cname
        strip = tr.strips.new(cname, 1, act)
        if hasattr(act, "slots") and len(act.slots) > 0 and hasattr(strip, "action_slot"):
            strip.action_slot = act.slots[0]
        arm.animation_data.action = None

    # Reset pose bones to rest T-pose so the exported GLB rest node transforms are upright
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pb.location = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=args.out,
        export_format="GLB",
        export_morph=True,
        export_morph_normal=False,
        export_morph_tangent=False,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,
        export_def_bones=False,
        export_skins=True,
        export_yup=True,
        export_image_format="JPEG",
        export_jpeg_quality=85,
    )
    print(f"Exported VRoid sample GLB -> {args.out} ({os.path.getsize(args.out) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
