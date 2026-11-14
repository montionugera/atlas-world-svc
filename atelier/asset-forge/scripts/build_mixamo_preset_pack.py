#!/usr/bin/env python3
"""
Retargets the tagged Mixamo Animation Library (Female & Male, Idle / Walk / Walk-Start / Run)
from ~/asset-studio-private/atlas-3d-plan/clipsets/mixamo_library/catalog.json onto the
Meshy humanoid rig (`maro_folk_girl.glb`):
  1. Produces `game-client/studio-cache/mixamo_maro_presets.glb` containing all 24 Mixamo clips
     (`mx_<slug>`) + `game-client/studio-cache/mixamo_catalog.json` so PlaytestSandboxRoot can
     hot-swap any Female/Male Idle, Walk, Walk-Start, or Run clip at runtime with [I] and [K].
  2. Updates `/tmp/maro_folk_girl.glb` so its default `idle`, `walk`, and `run` clips use the
     Mixamo Female presets (`f_idle_weight_shift`, `f_walk_normal`, `f_run_forward`).
"""

import argparse
import json
import math
import os
import shutil
import struct
import sys
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

BONE_MAP = {
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

ARM_SWING_BONES = {
    "LeftShoulder",
    "LeftArm",
    "LeftForeArm",
    "LeftHand",
    "RightShoulder",
    "RightArm",
    "RightForeArm",
    "RightHand",
}

LEG_UP_SWING_BONES = {
    "LeftUpLeg",
    "RightUpLeg",
}

SEC_BONE_NAMES = [
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
]


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-glb", default="/tmp/maro_folk_girl.glb")
    ap.add_argument(
        "--library-dir",
        default=os.path.expanduser("~/asset-studio-private/atlas-3d-plan/clipsets/mixamo_library"),
    )
    ap.add_argument("--out-presets-glb", required=True)
    ap.add_argument("--out-catalog-json", required=True)
    ap.add_argument("--out-character-glb", default="/tmp/maro_folk_girl_mixamo.glb")
    return ap.parse_args(argv)


def bind_action(arm, act):
    arm.animation_data_create()
    arm.animation_data.action = act
    if hasattr(act, "slots") and len(act.slots) > 0:
        act.slots[0].name_display = arm.name
        arm.animation_data.action_slot = act.slots[0]


def stamp_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack_from("<III", data, 0)
    json_len, json_type = struct.unpack_from("<II", data, 12)
    json_obj = json.loads(data[20 : 20 + json_len].decode("utf-8"))
    json_obj.setdefault("asset", {}).setdefault("extras", {})["atlasForge"] = {
        "tool": "build_mixamo_preset_pack.py",
        "kind": "pipelineCharacter",
        "version": "2.0.0",
        "vroidBase": "AvatarSample_A",
        "mixamoLibrary": "atlas-mixamo-library/1",
    }
    alpha_keywords = ("FaceMouth", "FaceEyeline", "FaceEyelash", "FaceBrow", "EyeHighlight", "EyeExtra")
    for mat in json_obj.get("materials", []):
        mname = mat.get("name", "")
        pbr = mat.setdefault("pbrMetallicRoughness", {})
        pbr["metallicFactor"] = 0.0
        pbr["roughnessFactor"] = 0.90
        if mname == "Hair":
            if "silme" in os.path.basename(path).lower():
                pbr["baseColorFactor"] = [0.92, 0.93, 0.99, 1.0]
            else:
                pbr["baseColorFactor"] = [0.58, 0.38, 0.27, 1.0]
            pbr["roughnessFactor"] = 0.78
            mat["doubleSided"] = True
        elif "Hair" in mname:
            pbr["baseColorFactor"] = [1.0, 1.0, 1.0, 1.0]
            pbr["roughnessFactor"] = 0.78
            mat["doubleSided"] = True
        elif any(k in mname for k in alpha_keywords):
            mat["alphaMode"] = "BLEND"
            mat["doubleSided"] = True
    new_json = json.dumps(json_obj, separators=(",", ":")).encode("utf-8")
    while len(new_json) % 4 != 0:
        new_json += b" "
    rest = data[20 + json_len :]
    total_len = 12 + 8 + len(new_json) + len(rest)
    out = (
        struct.pack("<III", magic, version, total_len)
        + struct.pack("<II", len(new_json), json_type)
        + new_json
        + rest
    )
    with open(path, "wb") as f:
        f.write(out)


def main():
    args = parse_args()
    catalog_path = os.path.join(args.library_dir, "catalog.json")
    catalog = json.loads(open(catalog_path, "r", encoding="utf-8").read())

    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = 30

    bpy.ops.import_scene.gltf(filepath=args.base_glb)
    T = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    T.name = "Armature"
    mesh_obj = next(
        (o for o in bpy.data.objects if o.type == "MESH" and o.vertex_groups and "Face" not in o.name),
        next(o for o in bpy.data.objects if o.type == "MESH" and o.vertex_groups),
    )

    # Keep a copy of the Meshy female preset clips before retargeting Mixamo clips
    for src_name, backup_name in [("idle", "mx_meshy_idle_4"), ("walk", "mx_meshy_walking_woman"), ("run", "mx_meshy_run_fast_9")]:
        if src_name in bpy.data.actions:
            cp = bpy.data.actions[src_name].copy()
            cp.name = backup_name
            if hasattr(cp, "slots") and len(cp.slots) > 0:
                cp.slots[0].name_display = T.name

    if T.animation_data:
        T.animation_data.action = None
        for tr in list(T.animation_data.nla_tracks):
            T.animation_data.nla_tracks.remove(tr)
    T.data.pose_position = "REST"
    bpy.context.view_layer.update()

    order = []

    def walk_bones(b):
        order.append(b.name)
        for c in b.children:
            walk_bones(c)

    for b in T.data.bones:
        if b.parent is None:
            walk_bones(b)

    TQ = T.matrix_world.to_quaternion()
    TR = {n: T.data.bones[n].matrix_local.to_3x3() for n in order}
    TRW = {n: TQ.to_matrix() @ TR[n] for n in order}
    hips_h_t = (T.matrix_world @ T.data.bones["Hips"].head_local).z
    foot_z_t = min(
        (T.matrix_world @ T.data.bones["LeftFoot"].head_local).z,
        (T.matrix_world @ T.data.bones["RightFoot"].head_local).z,
    )
    leg_len_t = max(0.20, hips_h_t - foot_z_t)

    # Measure rest-pose body capsules & hip/skirt lateral radius for per-frame arm push-out clearance
    T.data.pose_position = "REST"
    bpy.context.view_layer.update()
    dg_rest = bpy.context.evaluated_depsgraph_get()
    body_meshes = [
        o for o in bpy.data.objects
        if o.type == "MESH" and o.vertex_groups and "Face" not in o.name and "Hair" not in o.name
    ]
    if not body_meshes:
        body_meshes = [mesh_obj]
    rest_verts = np.concatenate([
        np.array([list(o.evaluated_get(dg_rest).matrix_world @ v.co) for v in o.evaluated_get(dg_rest).data.vertices])
        for o in body_meshes
    ])

    def j_pos(bname):
        return np.array(T.matrix_world @ T.pose.bones[bname].head)

    def seg_dist(X, a, b):
        d = b - a
        t = np.clip(((X - a) @ d) / max(float(d @ d), 1e-9), 0.0, 1.0)
        C = a + t[:, None] * d
        return np.linalg.norm(X - C, axis=1), C

    neck_bone = "neck" if "neck" in T.pose.bones else ("Neck" if "Neck" in T.pose.bones else "Spine")
    seg_defs = {
        "torso": ("Hips", neck_bone),
        "thigh.l": ("LeftUpLeg", "LeftLeg"),
        "thigh.r": ("RightUpLeg", "RightLeg"),
        "arm.l": ("LeftArm", "LeftForeArm"),
        "arm.r": ("RightArm", "RightForeArm"),
        "fore.l": ("LeftForeArm", "LeftHand"),
        "fore.r": ("RightForeArm", "RightHand"),
        "shin.l": ("LeftLeg", "LeftFoot"),
        "shin.r": ("RightLeg", "RightFoot"),
    }
    seg_keys = [k for k, (b0, b1) in seg_defs.items() if b0 in T.pose.bones and b1 in T.pose.bones]
    D_rest = np.stack([seg_dist(rest_verts, j_pos(seg_defs[k][0]), j_pos(seg_defs[k][1]))[0] for k in seg_keys], axis=1)
    own_rest = D_rest.argmin(axis=1)
    RAD = {
        k: (float(np.percentile(D_rest[own_rest == i, i], 78)) if (own_rest == i).any() else 0.09)
        for i, k in enumerate(seg_keys)
    }
    # Measure hip/skirt outer lateral envelope around Hips..upper-thigh where resting hands sit (excluding wide flared sleeves at |x| > 0.155m)
    hip_band_mask = (
        (rest_verts[:, 2] >= (hips_h_t - 0.14))
        & (rest_verts[:, 2] <= (hips_h_t + 0.04))
        & (np.abs(rest_verts[:, 1]) <= 0.11)
        & (np.abs(rest_verts[:, 0]) <= 0.155)
    )
    hip_skirt_rad_x = float(np.percentile(np.abs(rest_verts[hip_band_mask, 0]), 88)) if hip_band_mask.any() else 0.138
    hip_skirt_rad_x = max(0.125, min(0.148, hip_skirt_rad_x))
    print(f"[ArmClearance] RAD torso={RAD.get('torso', 0):.3f} thigh.l={RAD.get('thigh.l', 0):.3f} hip_skirt_rad_x={hip_skirt_rad_x:.3f}")

    AW_inv = T.matrix_world.to_3x3().inverted()

    def qsmooth(qs):
        dil = [max(qs[max(0, i - 3): i + 4], key=lambda q: q.angle).copy() for i in range(len(qs))]
        out = []
        for i in range(len(dil)):
            acc = np.zeros(4)
            ref = np.array(dil[i])
            for q in dil[max(0, i - 3): i + 4]:
                qa = np.array(q)
                acc += qa if float(qa @ ref) >= 0.0 else -qa
            out.append(Quaternion(acc / max(float(np.linalg.norm(acc)), 1e-9)))
        return out

    def apply_arm_body_clearance(act, f_start, f_end, clear_m=0.024, max_deg=28.0, step_deg=2.0):
        """Swing LeftArm/RightArm outward around the shoulder whenever ForeArm/Hand penetrates torso/hip-skirt/thigh capsules."""
        T.data.pose_position = "POSE"
        bind_action(T, act)
        frames = list(range(f_start, f_end + 1))
        for side, arm_b, fore_b, hand_b, sign_x in [
            ("L", "LeftArm", "LeftForeArm", "LeftHand", 1.0),
            ("R", "RightArm", "RightForeArm", "RightHand", -1.0),
        ]:
            if not all(b in T.pose.bones for b in (arm_b, fore_b, hand_b)):
                continue
            arm_pb = T.pose.bones[arm_b]
            base_quats = {}
            esc_quats = []

            def check_pen():
                bpy.context.view_layer.update()
                p_fa = j_pos(fore_b)
                p_ha = j_pos(hand_b)
                # Extend slightly past wrist to fingertips (~8 cm along forearm->hand direction)
                dir_fh = p_ha - p_fa
                ln_fh = float(np.linalg.norm(dir_fh))
                p_tip = p_ha + (dir_fh / max(ln_fh, 1e-6)) * 0.075
                pts = np.linspace(p_fa, p_tip, 6)
                best = (0.0, None, None)
                for k in ("torso", "thigh.l", "thigh.r"):
                    if k not in seg_defs:
                        continue
                    a_, b_ = j_pos(seg_defs[k][0]), j_pos(seg_defs[k][1])
                    d, C = seg_dist(pts, a_, b_)
                    v = RAD.get(k, 0.10) + clear_m - d
                    idx = int(v.argmax())
                    if float(v[idx]) > best[0]:
                        n = pts[idx] - C[idx]
                        # Bias push-out direction outward laterally (sign_x) so arms always clear to the outside of the body
                        n[0] = sign_x * max(abs(float(n[0])), 0.45 * float(np.linalg.norm(n)))
                        ln = float(np.linalg.norm(n))
                        best = (float(v[idx]), pts[idx], n / max(ln, 1e-9))
                # Also check lateral hip/skirt envelope around Hips
                hips_p = j_pos("Hips")
                for pt in pts[2:]:  # lower forearm, wrist, hand
                    if (hips_p[2] - 0.15) <= pt[2] <= (hips_p[2] + 0.12) and abs(pt[1] - hips_p[1]) <= 0.12:
                        lat_dist = (pt[0] - hips_p[0]) * sign_x
                        pen_lat = (hip_skirt_rad_x + clear_m) - lat_dist
                        if pen_lat > best[0]:
                            best = (float(pen_lat), pt, np.array([sign_x, 0.0, 0.15]) / math.sqrt(1.0225))
                return best

            for f in frames:
                sc.frame_set(f)
                bpy.context.view_layer.update()
                base_quats[f] = arm_pb.rotation_quaternion.copy()
                M0 = arm_pb.matrix.copy()
                h0 = M0.translation.copy()
                E = Quaternion()
                ang = 0.0
                while ang < max_deg:
                    v, X, n = check_pen()
                    if v <= 0.0:
                        break
                    ax = np.cross(X - j_pos(arm_b), n)
                    ln = float(np.linalg.norm(ax))
                    if ln < 1e-6:
                        break
                    E = Quaternion(AW_inv @ Vector(ax / ln), math.radians(step_deg)) @ E
                    ang += step_deg
                    arm_pb.matrix = Matrix.Translation(h0) @ E.to_matrix().to_4x4() @ Matrix.Translation(-h0) @ M0
                esc_quats.append(E)

            if max(q.angle for q in esc_quats) > 1e-5:
                sm_esc = qsmooth(esc_quats)
                for idx, f in enumerate(frames):
                    sc.frame_set(f)
                    arm_pb.rotation_quaternion = base_quats[f]
                    bpy.context.view_layer.update()
                    M0 = arm_pb.matrix.copy()
                    h0 = M0.translation.copy()
                    arm_pb.matrix = Matrix.Translation(h0) @ sm_esc[idx].to_matrix().to_4x4() @ Matrix.Translation(-h0) @ M0
                    bpy.context.view_layer.update()
                    arm_pb.keyframe_insert("rotation_quaternion", frame=f)

    def eval_bbox_min_z():
        dg = bpy.context.evaluated_depsgraph_get()
        ev = mesh_obj.evaluated_get(dg)
        return min((ev.matrix_world @ v.co).z for v in ev.data.vertices)

    retargeted_actions = []

    for entry in catalog["clips"]:
        slug = entry["slug"]
        act_name = f"mx_{slug}"
        fbx_path = os.path.join(args.library_dir, entry["file"])
        if not os.path.isfile(fbx_path):
            raise FileNotFoundError(fbx_path)

        before_objs = set(bpy.data.objects)
        before_acts = set(bpy.data.actions)
        bpy.ops.import_scene.fbx(filepath=fbx_path)
        S = next(o for o in bpy.data.objects if o not in before_objs and o.type == "ARMATURE")
        sact = next(x for x in bpy.data.actions if x not in before_acts)

        MW = S.matrix_world
        MR = MW.to_quaternion()
        SR = {b.name: (MR @ b.matrix_local.to_quaternion()) for b in S.data.bones}

        f0, f1 = [int(round(v)) for v in sact.frame_range]
        sc.frame_set(f0)
        bpy.context.view_layer.update()

        hs0 = (MW @ S.pose.bones["mixamorig:Hips"].head).copy()
        foot0_z = min(
            (MW @ S.pose.bones["mixamorig:LeftFoot"].head).z,
            (MW @ S.pose.bones["mixamorig:RightFoot"].head).z,
        )
        hips_h_s = max(0.20, hs0.z - foot0_z)
        k = leg_len_t / hips_h_s

        # A-pose (Meshy maro_folk_girl) to T-pose (Mixamo) retargeting:
        # 1. ARM_SWING_BONES align bone Y-axis with feminine inward arm adduction
        # 2. LEG_UP_SWING_BONES slerp 35% toward bone-axis swing (keeping straight knees and ~14cm boot clearance)
        # 3. LeftLeg/RightLeg (1-DOF knees) use pure rest offset so knees never twist sideways
        OFF = {}
        for tb, sb in BONE_MAP.items():
            if sb not in SR or tb not in TRW:
                continue
            q_rest = SR[sb].inverted() @ TRW[tb].to_quaternion()
            if tb in ARM_SWING_BONES:
                s_y = SR[sb] @ Vector((0.0, 1.0, 0.0))
                t_y = TRW[tb].to_quaternion() @ Vector((0.0, 1.0, 0.0))
                swing_w = t_y.rotation_difference(s_y)
                q_swing = (SR[sb].inverted() @ swing_w @ TRW[tb].to_quaternion()).normalized()
                # Never blend toward A-pose rest (adduct=0.0); per-frame capsule push-out handles body/skirt clearance
                OFF[tb] = (sb, q_swing)
            elif tb in LEG_UP_SWING_BONES:
                s_y = SR[sb] @ Vector((0.0, 1.0, 0.0))
                t_y = TRW[tb].to_quaternion() @ Vector((0.0, 1.0, 0.0))
                swing_w = t_y.rotation_difference(s_y)
                q_swing = (SR[sb].inverted() @ swing_w @ TRW[tb].to_quaternion()).normalized()
                # If target character is already in a wide T-pose leg stance (e.g. silme_seeress),
                # swing 75% toward Mixamo's natural standing hip width so legs don't splay wide in idle/walk!
                hip_span_x = abs(T.data.bones["LeftUpLeg"].head_local.x - T.data.bones["RightUpLeg"].head_local.x)
                leg_align = 0.75 if hip_span_x > 0.082 else 0.35
                OFF[tb] = (sb, q_rest.slerp(q_swing, leg_align).normalized())
            else:
                OFF[tb] = (sb, q_rest)

        if act_name in bpy.data.actions:
            bpy.data.actions.remove(bpy.data.actions[act_name])
        act = bpy.data.actions.new(act_name)
        T.data.pose_position = "POSE"
        bind_action(T, act)
        for pb in T.pose.bones:
            pb.rotation_mode = "QUATERNION"
            pb.location = (0.0, 0.0, 0.0)
            pb.scale = (1.0, 1.0, 1.0)

        n_frames = max(1, f1 - f0)
        hips_world_deltas = []
        min_ankle_delta = 1e9
        for f in range(f0, f1 + 1):
            out_f = f - f0 + 1
            sc.frame_set(f)
            bpy.context.view_layer.update()
            W = {}
            for n in order:
                pb = T.pose.bones[n]
                b = T.data.bones[n]
                if n in OFF:
                    sb, off_q = OFF[n]
                    sw = (MW @ S.pose.bones[sb].matrix).to_quaternion()
                    w_world = sw @ off_q
                    if n in ("LeftArm", "RightArm"):
                        sign_x = 1.0 if n == "LeftArm" else -1.0
                        # Apply gentle 8.5 deg outward coronal clearance in world space so hands hang naturally outside the hip skirt
                        flair_w = Quaternion((0.0, 1.0, 0.0), math.radians(8.5 * sign_x))
                        w_world = flair_w @ w_world
                    W[n] = TQ.inverted() @ w_world
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
                    hs = MW @ S.pose.bones["mixamorig:Hips"].head
                    d = (hs - hs0) * k
                    # Strip forward/lateral travel in-place; preserve gentle weight-shift X sway on idle
                    if entry["move_type"] == "idle":
                        d.x *= 0.85
                        d.y *= 0.35
                    else:
                        d.x *= 0.25
                        d.y = 0.0
                    hips_world_deltas.append(d.copy())
                    pb.location = TR["Hips"].inverted() @ (TQ.inverted() @ d)
                    pb.keyframe_insert("location", frame=out_f)

                if n in BONE_MAP:
                    pb.keyframe_insert("rotation_quaternion", frame=out_f)

            # Secondary hair/cape/hem chains stay in clean REST pose in baked clips;
            # real-time 120Hz Velocity-Verlet + Sphere/Capsule Collider physics in SecondarySpringPhysics.cs drives them!
            for spb in T.pose.bones:
                if spb.name.startswith("sec_"):
                    spb.rotation_quaternion = Quaternion((1.0, 0.0, 0.0, 0.0))
                    spb.keyframe_insert("rotation_quaternion", frame=out_f)

            bpy.context.view_layer.update()
            lz = (T.matrix_world @ T.pose.bones["LeftFoot"].head).z
            rz = (T.matrix_world @ T.pose.bones["RightFoot"].head).z
            min_ankle_delta = min(min_ankle_delta, min(lz, rz) - foot_z_t)

        # Ground lowest ankle across the clip so min(LeftFoot.z, RightFoot.z) - restFootZ == 0.000m
        z_min = min_ankle_delta
        for idx, d in enumerate(hips_world_deltas):
            out_f = idx + 1
            d_grounded = Vector((d.x, d.y, d.z - z_min))
            T.pose.bones["Hips"].location = TR["Hips"].inverted() @ (TQ.inverted() @ d_grounded)
            T.pose.bones["Hips"].keyframe_insert("location", frame=out_f)

        # Apply subtle per-frame body/thigh capsule clearance only if actual torso/thigh penetration occurs
        apply_arm_body_clearance(act, 1, n_frames + 1, clear_m=0.006, max_deg=10.0)

        act.use_fake_user = True
        retargeted_actions.append(act_name)
        entry["clip_name"] = act_name
        entry["frames"] = n_frames + 1

        T.animation_data.action = None
        for o in [o for o in bpy.data.objects if o not in before_objs]:
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.actions.remove(sact)
        print(f"Retargeted {act_name:28s}: {n_frames + 1:3d} frames (min_z_before={z_min:+.4f} -> 0.000)")

    # Add the backup Meshy female presets into catalog as well so user can compare Mixamo vs Meshy side-by-side
    for slug, label, mtype, cname in [
        ("meshy_idle_4", "Meshy Female Idle 4", "idle", "mx_meshy_idle_4"),
        ("meshy_walking_woman", "Meshy Walking Woman", "walk", "mx_meshy_walking_woman"),
        ("meshy_run_fast_9", "Meshy Run Fast 9", "run", "mx_meshy_run_fast_9"),
    ]:
        if cname in bpy.data.actions:
            f0, f1 = [int(round(v)) for v in bpy.data.actions[cname].frame_range]
            apply_arm_body_clearance(bpy.data.actions[cname], max(1, f0), max(1, f1), clear_m=0.006, max_deg=10.0)
            catalog["clips"].append(
                {
                    "slug": slug,
                    "label": label,
                    "gender": "female",
                    "move_type": mtype,
                    "product_id": "meshy-preset",
                    "name": label,
                    "description": label,
                    "inplace": True,
                    "support_inplace": True,
                    "file": "",
                    "clip_name": cname,
                    "frames": f1 - f0 + 1,
                }
            )
            retargeted_actions.append(cname)

    # Set default canonical `idle`, `walk`, `run` on the character GLB to the top Mixamo Female presets
    for canonical, mx_source in [
        ("idle", "mx_f_idle_weight_shift"),
        ("walk", "mx_f_walk_normal"),
        ("run", "mx_f_run_jogging"),
    ]:
        if mx_source in bpy.data.actions:
            if canonical in bpy.data.actions:
                bpy.data.actions.remove(bpy.data.actions[canonical])
            cp = bpy.data.actions[mx_source].copy()
            cp.name = canonical
            cp.use_fake_user = True
            if hasattr(cp, "slots") and len(cp.slots) > 0:
                cp.slots[0].name_display = T.name

    # 1. Export the full Mixamo Preset Library GLB (Armature + all mx_* actions) to out_presets_glb
    os.makedirs(os.path.dirname(os.path.abspath(args.out_presets_glb)), exist_ok=True)
    T.data.pose_position = "POSE"
    T.animation_data_create()
    T.animation_data.action = None
    for tr in list(T.animation_data.nla_tracks):
        T.animation_data.nla_tracks.remove(tr)
    for cname in sorted(set(retargeted_actions)):
        act = bpy.data.actions[cname]
        bind_action(T, act)
        tr = T.animation_data.nla_tracks.new()
        tr.name = cname
        f0 = int(round(act.frame_range[0]))
        strip = tr.strips.new(cname, max(1, f0), act)
        if hasattr(act, "slots") and len(act.slots) > 0 and hasattr(strip, "action_slot"):
            strip.action_slot = act.slots[0]
        T.animation_data.action = None

    bpy.ops.export_scene.gltf(
        filepath=args.out_presets_glb,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips_merged_animation_name="Animation",
        export_force_sampling=True,
        export_def_bones=False,
        export_skins=True,
        export_yup=True,
    )
    print(f"Exported Mixamo preset pack: {args.out_presets_glb} ({os.path.getsize(args.out_presets_glb)} bytes)")

    os.makedirs(os.path.dirname(os.path.abspath(args.out_catalog_json)), exist_ok=True)
    with open(args.out_catalog_json, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2)
    print(f"Wrote runtime Mixamo catalog: {args.out_catalog_json}")

    # 2. Export the canonical character GLB (`out_character_glb`) with the 11 required clips (under 2.8 MB budget)
    wanted_canonical = {
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
    if "combat_idle" not in bpy.data.actions and "block_idle" in bpy.data.actions:
        ci = bpy.data.actions["block_idle"].copy()
        ci.name = "combat_idle"
        if hasattr(ci, "slots") and len(ci.slots) > 0:
            ci.slots[0].name_display = T.name
    for tr in list(T.animation_data.nla_tracks):
        T.animation_data.nla_tracks.remove(tr)
    for act in list(bpy.data.actions):
        if act.name not in wanted_canonical:
            bpy.data.actions.remove(act)
    for cname in sorted(wanted_canonical):
        if cname not in bpy.data.actions:
            continue
        act = bpy.data.actions[cname]
        bind_action(T, act)
        tr = T.animation_data.nla_tracks.new()
        tr.name = cname
        f0 = int(round(act.frame_range[0]))
        strip = tr.strips.new(cname, max(1, f0), act)
        if hasattr(act, "slots") and len(act.slots) > 0 and hasattr(strip, "action_slot"):
            strip.action_slot = act.slots[0]
        T.animation_data.action = None

    bpy.ops.export_scene.gltf(
        filepath=args.out_character_glb,
        export_format="GLB",
        export_morph=True,
        export_morph_normal=False,
        export_morph_tangent=False,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips_merged_animation_name="Animation",
        export_force_sampling=True,
        export_def_bones=False,
        export_skins=True,
        export_yup=True,
        export_image_format="AUTO",
    )
    stamp_glb(args.out_character_glb)
    print(f"Exported canonical character GLB: {args.out_character_glb} ({os.path.getsize(args.out_character_glb)} bytes)")


if __name__ == "__main__":
    main()
