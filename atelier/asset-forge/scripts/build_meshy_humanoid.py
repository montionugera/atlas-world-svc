#!/usr/bin/env python3
"""
Portable Meshy AI Humanoid Rig + Animation + Customization Assembler (F-186).

Takes a Meshy AI auto-rigged humanoid GLB (or merged animations GLB) plus walk/run GLBs,
and produces a game-ready `pipelineCharacter` GLB that works across human/elf/silme races:
  1. Merges and renames Meshy animation clips to canonical pipeline clip names:
     idle, walk, run, combat_idle, block_idle, attack, attack_2, attack_3, block, hit, death.
  2. Normalizes standing crown height to `--height` (default 0.94 m for female Maro Folk / Silme Seers),
     places feet at Z = 0, centers XZ pivot, and bakes Armature scale to 1.0.
  3. Centers Hips horizontally in-place (stripping root travel on walk/run/hit/combat_idle) and grounds feet on Z = 0.
  4. Adds portable weapon socket bones (`prop_weapon_r` -> `handslot.r` on `RightHand`) and secondary
     hair/cape bone chains (`sec_hair_*` on `Head`, `sec_cape_*` on `Spine`) with subtle follow-through.
  5. Splits hair polygons into a dedicated `Hair` material surface with a luminance-normalized strand
     texture and default hair tint factor so runtime `SetHairColor(Color)` in Godot can recolor hair
     to any shade (Chestnut, Silver/Elf White, Blonde, Crimson, Azure, etc.) without touching face/clothes.
  6. Downscales textures to <= 1024 px so the final GLB stays well within the 15k tri / 2.8 MB budget.
"""

import argparse
import math
import os
import sys
import bpy
from mathutils import Matrix, Quaternion, Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--anims-glb", required=True, help="Meshy merged animations GLB (or rigged base GLB)")
    ap.add_argument("--walk-glb", required=True, help="Meshy walking_glb_url GLB")
    ap.add_argument("--run-glb", required=True, help="Meshy running_glb_url GLB")
    ap.add_argument("--out", required=True, help="Output GLB path")
    ap.add_argument("--height", type=float, default=0.94, help="Target crown height in meters (default: 0.94)")
    ap.add_argument(
        "--hair-color",
        default="0.58,0.38,0.27",
        help="Default RGB baseColorFactor for the Hair material slot",
    )
    return ap.parse_args(argv)


def iter_fcurves(act):
    if hasattr(act, "layers") and act.layers:
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    for fc in cb.fcurves:
                        yield fc
    elif hasattr(act, "fcurves"):
        for fc in act.fcurves:
            yield fc


def remove_fcurve(act, fc):
    if hasattr(act, "layers") and act.layers:
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    for existing in list(cb.fcurves):
                        if existing == fc:
                            cb.fcurves.remove(existing)
                            return
    elif hasattr(act, "fcurves"):
        act.fcurves.remove(fc)


def import_glb_actions(filepath):
    before_objs = set(bpy.data.objects)
    before_acts = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=filepath)
    new_objs = [o for o in bpy.data.objects if o not in before_objs]
    new_acts = [a for a in bpy.data.actions if a not in before_acts]
    return new_objs, new_acts


def bind_action(arm, act):
    arm.animation_data_create()
    arm.animation_data.action = act
    if hasattr(act, "slots") and len(act.slots) > 0:
        act.slots[0].name_display = arm.name
        arm.animation_data.action_slot = act.slots[0]


def main():
    args = parse_args()
    hair_rgb = [float(x) for x in args.hair_color.split(",")]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = 30

    # 1. Import base animated GLB + walk/run GLBs
    base_objs, _ = import_glb_actions(args.anims_glb)
    arm = next(o for o in base_objs if o.type == "ARMATURE")
    arm.name = "Armature"
    for o in list(base_objs):
        if o.type == "MESH" and not o.vertex_groups:
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.vertex_groups]
    assert len(meshes) == 1, f"Expected 1 skinned mesh, found {len(meshes)}"
    mesh_obj = meshes[0]
    mesh_obj.name = "CharacterMesh"
    mesh_obj.data.name = "CharacterMesh"

    rename_map = {
        "Idle": "idle",
        "Idle_3": "idle",
        "Idle_4": "idle",
        "Idle_7": "idle",
        "Walking_Woman": "walk",
        "Casual_Walk": "walk",
        "run_fast_9": "run",
        "run_fast_9_inplace": "run",
        "Run_02": "run",
        "Run_03": "run",
        "Combat_Stance": "combat_idle",
        "Attack": "attack",
        "Right_Hand_Sword_Slash": "attack_2",
        "Left_Slash": "attack_3",
        "Block1": "block",
        "Hit_Reaction": "hit",
        "Dead": "death",
    }
    for act in list(bpy.data.actions):
        if act.name in rename_map:
            target_name = rename_map[act.name]
            if target_name in bpy.data.actions and bpy.data.actions[target_name] != act:
                bpy.data.actions.remove(bpy.data.actions[target_name])
            act.name = target_name
        if hasattr(act, "slots") and len(act.slots) > 0:
            act.slots[0].name_display = arm.name

    seen_extra_paths = set()
    for extra_path, target_clip_name in [(args.walk_glb, "walk"), (args.run_glb, "run")]:
        if not extra_path or extra_path in seen_extra_paths and os.path.abspath(args.walk_glb) == os.path.abspath(args.run_glb):
            continue
        seen_extra_paths.add(extra_path)
        extra_objs, extra_acts = import_glb_actions(extra_path)
        for o in extra_objs:
            bpy.data.objects.remove(o, do_unlink=True)
        assert extra_acts, f"No animation action found in {extra_path}"
        if len(extra_acts) == 1 and extra_acts[0].name not in rename_map:
            if target_clip_name in bpy.data.actions and bpy.data.actions[target_clip_name] != extra_acts[0]:
                bpy.data.actions.remove(bpy.data.actions[target_clip_name])
            extra_acts[0].name = target_clip_name
            if hasattr(extra_acts[0], "slots") and len(extra_acts[0].slots) > 0:
                extra_acts[0].slots[0].name_display = arm.name
        else:
            for act in extra_acts:
                if act.name in rename_map:
                    mapped_name = rename_map[act.name]
                    if mapped_name in bpy.data.actions and bpy.data.actions[mapped_name] != act:
                        bpy.data.actions.remove(bpy.data.actions[mapped_name])
                    act.name = mapped_name
                if hasattr(act, "slots") and len(act.slots) > 0:
                    act.slots[0].name_display = arm.name

    if "combat_idle" in bpy.data.actions and "block_idle" not in bpy.data.actions:
        bi = bpy.data.actions["combat_idle"].copy()
        bi.name = "block_idle"
        if hasattr(bi, "slots") and len(bi.slots) > 0:
            bi.slots[0].name_display = arm.name

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
    for act in list(bpy.data.actions):
        if act.name not in wanted_clips:
            bpy.data.actions.remove(act)

    clip_acts = [bpy.data.actions[c] for c in sorted(wanted_clips) if c in bpy.data.actions]
    print("Loaded canonical clips:", [a.name for a in clip_acts])

    # 2. World placement: rest pose height = args.height, feet at z=0, centered XZ
    if arm.animation_data:
        arm.animation_data.action = None
        for tr in list(arm.animation_data.nla_tracks):
            arm.animation_data.nla_tracks.remove(tr)
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()

    def eval_bbox():
        dg = bpy.context.evaluated_depsgraph_get()
        ev = mesh_obj.evaluated_get(dg)
        pts = [ev.matrix_world @ v.co for v in ev.data.vertices]
        lo = Vector([min(p[i] for p in pts) for i in range(3)])
        hi = Vector([max(p[i] for p in pts) for i in range(3)])
        return lo, hi

    lo, hi = eval_bbox()
    cur_h = hi.z - lo.z
    scale_factor = args.height / cur_h
    arm.matrix_world = Matrix.Diagonal((scale_factor, scale_factor, scale_factor, 1.0)) @ arm.matrix_world
    bpy.context.view_layer.update()
    lo, hi = eval_bbox()
    cx = 0.5 * (lo.x + hi.x)
    cy = 0.5 * (lo.y + hi.y)
    arm.matrix_world = Matrix.Translation((-cx, -cy, -lo.z)) @ arm.matrix_world
    bpy.context.view_layer.update()

    total_arm_scale = arm.matrix_world.to_scale()[0]
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    mesh_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()

    lo, hi = eval_bbox()
    print(f"Normalized rest bbox: lo={[round(x, 4) for x in lo]} hi={[round(x, 4) for x in hi]} height={round(hi.z - lo.z, 4)}m")

    # 3. Scale Hips location F-curves by total_arm_scale, strip non-Hips location/scale tracks,
    #    center Hips horizontally in-place, ground feet on Z=0, and close loop seams.
    loop_clips = {"idle", "walk", "run", "combat_idle", "block_idle", "block"}
    for act in clip_acts:
        for fc in list(iter_fcurves(act)):
            dp = fc.data_path
            if dp.endswith(".location"):
                if 'pose.bones["Hips"]' not in dp:
                    remove_fcurve(act, fc)
                    continue
                for kp in fc.keyframe_points:
                    kp.co[1] *= total_arm_scale
                    kp.handle_left[1] *= total_arm_scale
                    kp.handle_right[1] *= total_arm_scale
            elif dp.endswith(".scale"):
                remove_fcurve(act, fc)

    # Reset all pose bone locations & scales so removed F-curves never leave stale unscaled values in memory
    for pb in arm.pose.bones:
        pb.location = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)

    # Center Hips horizontally in world space and ground feet on Z = 0 per clip
    arm.data.pose_position = "POSE"
    hips_rest_m = arm.data.bones["Hips"].matrix_local.to_3x3()
    hips_rest_inv = hips_rest_m.inverted()
    hips_rest_head = arm.data.bones["Hips"].head_local.copy()

    for act in clip_acts:
        bind_action(arm, act)
        f0, f1 = [int(round(v)) for v in act.frame_range]

        # Gather Hips location F-curves (x=0, y=1, z=2 in bone local space)
        loc_fcs = {
            fc.array_index: fc
            for fc in iter_fcurves(act)
            if fc.data_path == 'pose.bones["Hips"].location'
        }
        if len(loc_fcs) == 3:
            n_keys = len(loc_fcs[0].keyframe_points)
            # Pass 1: Center X/Y horizontally in-place
            v0_local = Vector((loc_fcs[0].keyframe_points[0].co[1], loc_fcs[1].keyframe_points[0].co[1], loc_fcs[2].keyframe_points[0].co[1]))
            w0 = hips_rest_m @ v0_local
            for k_idx in range(n_keys):
                v_loc = Vector((loc_fcs[0].keyframe_points[k_idx].co[1], loc_fcs[1].keyframe_points[k_idx].co[1], loc_fcs[2].keyframe_points[k_idx].co[1]))
                w_vec = hips_rest_m @ v_loc
                dx = w_vec.x - w0.x
                dy = w_vec.y - w0.y
                if act.name in ("walk", "run", "hit", "combat_idle", "block_idle", "idle", "block"):
                    dx *= 0.15
                    dy *= 0.15
                elif act.name in ("attack", "attack_2", "attack_3"):
                    dx *= 0.35
                    dy *= 0.35
                w_new = Vector((-hips_rest_head.x + dx, -hips_rest_head.y + dy, w_vec.z))
                l_new = hips_rest_inv @ w_new
                for axis in range(3):
                    kp = loc_fcs[axis].keyframe_points[k_idx]
                    kp.co[1] = l_new[axis]
                    kp.handle_left[1] = l_new[axis]
                    kp.handle_right[1] = l_new[axis]

        # Close loop seam on looping clips before measuring exact floor across all frames
        if act.name in loop_clips:
            for fc in iter_fcurves(act):
                if len(fc.keyframe_points) >= 2:
                    v_first = fc.keyframe_points[0].co[1]
                    fc.keyframe_points[-1].co[1] = v_first
                    fc.keyframe_points[-1].handle_left[1] = v_first
                    fc.keyframe_points[-1].handle_right[1] = v_first

        # Pass 2: Measure exact world Z floor across ALL frames f0..f1 and ground lowest contact on Z = 0.000
        zs = []
        for f in range(f0, f1 + 1):
            sc.frame_set(f)
            bpy.context.view_layer.update()
            lo_f, _ = eval_bbox()
            zs.append(lo_f.z)
        z_floor_min = min(zs)
        z_floor_f0 = zs[0]
        z_floor_end = zs[-1]

        if len(loc_fcs) == 3:
            n_keys = len(loc_fcs[0].keyframe_points)
            for k_idx in range(n_keys):
                frame_num = loc_fcs[0].keyframe_points[k_idx].co[0]
                t = max(0.0, min(1.0, (frame_num - f0) / max(1.0, float(f1 - f0))))
                v_loc = Vector((loc_fcs[0].keyframe_points[k_idx].co[1], loc_fcs[1].keyframe_points[k_idx].co[1], loc_fcs[2].keyframe_points[k_idx].co[1]))
                w_vec = hips_rest_m @ v_loc
                z_corr = -z_floor_min if act.name != "death" else -(z_floor_f0 * (1.0 - t) + z_floor_end * t)
                w_new = Vector((w_vec.x, w_vec.y, w_vec.z + z_corr))
                l_new = hips_rest_inv @ w_new
                for axis in range(3):
                    kp = loc_fcs[axis].keyframe_points[k_idx]
                    kp.co[1] = l_new[axis]
                    kp.handle_left[1] = l_new[axis]
                    kp.handle_right[1] = l_new[axis]

            if act.name == "death":
                zs_death = []
                for f in range(f0, f1 + 1):
                    sc.frame_set(f)
                    bpy.context.view_layer.update()
                    lo_f, _ = eval_bbox()
                    zs_death.append(lo_f.z)
                rem_min = min(zs_death)
                if rem_min < 0.0:
                    for k_idx in range(n_keys):
                        v_loc = Vector((loc_fcs[0].keyframe_points[k_idx].co[1], loc_fcs[1].keyframe_points[k_idx].co[1], loc_fcs[2].keyframe_points[k_idx].co[1]))
                        w_vec = hips_rest_m @ v_loc
                        l_new = hips_rest_inv @ Vector((w_vec.x, w_vec.y, w_vec.z - rem_min))
                        for axis in range(3):
                            kp = loc_fcs[axis].keyframe_points[k_idx]
                            kp.co[1] = l_new[axis]
                            kp.handle_left[1] = l_new[axis]
                            kp.handle_right[1] = l_new[axis]

        zs_verified = []
        for f in range(f0, f1 + 1):
            sc.frame_set(f)
            bpy.context.view_layer.update()
            lo_f, _ = eval_bbox()
            zs_verified.append(lo_f.z)
        print(f"Grounded clip {act.name:12s}: min_z={min(zs_verified):+.4f} max_min_z={max(zs_verified):+.4f}")
        assert min(zs_verified) >= -0.002, f"Clip {act.name} still sinks below Z=0: min_z={min(zs_verified):.4f}"

    arm.animation_data.action = None
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()

    # 4. Add portable weapon socket (`prop_weapon_r` -> `handslot.r`) and secondary bones (`sec_hair_*`, `sec_cape_*`)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    ebones = arm.data.edit_bones

    for eb in ebones:
        if (eb.tail - eb.head).length > 0.25:
            direction = (eb.tail - eb.head).normalized()
            eb.tail = eb.head + direction * 0.06

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
    hair_chains = {
        "sec_hair_c1": [
            (Vector((hx, hy + 0.055, hz + 0.02)), Vector((hx, hy + 0.065, hz - 0.025))),
            (Vector((hx, hy + 0.065, hz - 0.025)), Vector((hx, hy + 0.072, hz - 0.070))),
            (Vector((hx, hy + 0.072, hz - 0.070)), Vector((hx, hy + 0.078, hz - 0.115))),
        ],
        "sec_hair_l1": [
            (Vector((hx + 0.048, hy + 0.015, hz + 0.01)), Vector((hx + 0.055, hy + 0.020, hz - 0.040))),
            (Vector((hx + 0.055, hy + 0.020, hz - 0.040)), Vector((hx + 0.060, hy + 0.025, hz - 0.090))),
        ],
        "sec_hair_r1": [
            (Vector((hx - 0.048, hy + 0.015, hz + 0.01)), Vector((hx - 0.055, hy + 0.020, hz - 0.040))),
            (Vector((hx - 0.055, hy + 0.020, hz - 0.040)), Vector((hx - 0.060, hy + 0.025, hz - 0.090))),
        ],
    }
    for prefix, segs in hair_chains.items():
        parent_eb = head_eb
        for idx, (h_pt, t_pt) in enumerate(segs, start=1):
            bname = f"{prefix}_{idx}"
            eb = ebones.new(bname)
            eb.head = h_pt
            eb.tail = t_pt
            eb.parent = parent_eb
            eb.use_connect = idx > 1
            eb.use_deform = True
            parent_eb = eb

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
    }
    for prefix, segs in cape_chains.items():
        parent_eb = spine_eb
        for idx, (h_pt, t_pt) in enumerate(segs, start=1):
            bname = f"{prefix}_{idx}"
            eb = ebones.new(bname)
            eb.head = h_pt
            eb.tail = t_pt
            eb.parent = parent_eb
            eb.use_connect = idx > 1
            eb.use_deform = True
            parent_eb = eb

    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()

    sec_bone_names = [
        "sec_hair_c1_1",
        "sec_hair_c1_2",
        "sec_hair_c1_3",
        "sec_hair_l1_1",
        "sec_hair_l1_2",
        "sec_hair_r1_1",
        "sec_hair_r1_2",
        "sec_cape_l1_1",
        "sec_cape_l1_2",
        "sec_cape_r1_1",
        "sec_cape_r1_2",
    ]
    for bname in sec_bone_names:
        if bname not in mesh_obj.vertex_groups:
            mesh_obj.vertex_groups.new(name=bname)

    arm.data.pose_position = "POSE"
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for act in clip_acts:
        bind_action(arm, act)
        f0, f1 = [int(round(v)) for v in act.frame_range]
        n_frames = max(1, f1 - f0)
        is_loop = act.name in loop_clips
        n_cycles = max(1, round(n_frames / 30.0)) if is_loop else 1
        amp = 0.08 if act.name in ("run", "attack", "attack_2", "attack_3") else (0.018 if act.name == "idle" else 0.035)
        for f in range(f0, f1 + 1):
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

    # 5. Split Hair polygons into a dedicated `Hair` material slot & build luminance-normalized Hair texture
    base_mat = mesh_obj.data.materials[0]
    base_mat.name = "Body"

    base_img = None
    if base_mat.use_nodes:
        for node in base_mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                inp = node.inputs.get("Base Color")
                if inp and inp.is_linked and inp.links[0].from_node.type == "TEX_IMAGE":
                    base_img = inp.links[0].from_node.image
                    break
        if base_img is None:
            for node in base_mat.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image and "normal" not in node.image.name.lower() and "rough" not in node.image.name.lower():
                    base_img = node.image
                    break

    assert base_img is not None, "Could not locate Base Color image on Body material"
    img_w, img_h = base_img.size[0], base_img.size[1]
    px = list(base_img.pixels)

    def sample_uv(u, v):
        u = u % 1.0
        v = v % 1.0
        ix = min(img_w - 1, max(0, int(u * img_w)))
        iy = min(img_h - 1, max(0, int(v * img_h)))
        idx = (iy * img_w + ix) * 4
        return px[idx], px[idx + 1], px[idx + 2]

    def is_brown_hair_color(r, g, b):
        mx = max(r, g, b)
        mn = min(r, g, b)
        if mx < 0.07 or mx > 0.64:
            return False
        if not (r > g and g >= b - 0.02 and (r - b) > 0.045):
            return False
        sat = (mx - mn) / max(1e-4, mx)
        return sat > 0.16

    uv_layer = mesh_obj.data.uv_layers.active.data
    verts = mesh_obj.data.vertices
    polys = mesh_obj.data.polygons

    H = args.height
    z_hair_min = 0.67 * H
    z_crown_min = 0.855 * H

    def in_face_oval(co):
        return abs(co.x) < 0.052 * (H / 0.94) and co.y < -0.045 * (H / 0.94) and (0.73 * H) < co.z < (0.855 * H)

    hair_polys = set()
    for p in polys:
        center = sum((verts[vi].co for vi in p.vertices), Vector()) / len(p.vertices)
        if center.z < z_hair_min:
            continue
        if in_face_oval(center):
            continue
        uvs = [uv_layer[li].uv for li in p.loop_indices]
        u_avg = sum(uv.x for uv in uvs) / len(uvs)
        v_avg = sum(uv.y for uv in uvs) / len(uvs)
        r, g, b = sample_uv(u_avg, v_avg)
        if is_brown_hair_color(r, g, b) or (center.z >= z_crown_min and r > b + 0.03 and max(r, g, b) < 0.68):
            hair_polys.add(p.index)

    vert_to_polys = {}
    for p in polys:
        for vi in p.vertices:
            vert_to_polys.setdefault(vi, []).append(p.index)

    for _ in range(2):
        added = set()
        for pidx in hair_polys:
            for vi in polys[pidx].vertices:
                for nidx in vert_to_polys[vi]:
                    if nidx in hair_polys:
                        continue
                    np = polys[nidx]
                    c = sum((verts[v].co for v in np.vertices), Vector()) / len(np.vertices)
                    if c.z < z_hair_min * 0.96 or in_face_oval(c):
                        continue
                    uvs = [uv_layer[li].uv for li in np.loop_indices]
                    u_avg = sum(uv.x for uv in uvs) / len(uvs)
                    v_avg = sum(uv.y for uv in uvs) / len(uvs)
                    r, g, b = sample_uv(u_avg, v_avg)
                    if r > b + 0.03 and 0.06 < max(r, g, b) < 0.66:
                        added.add(nidx)
        hair_polys |= added

    print(f"Selected {len(hair_polys)} / {len(polys)} polygons for Hair material surface")

    hair_verts = {vi for pidx in hair_polys for vi in polys[pidx].vertices}
    for vi in hair_verts:
        v = verts[vi]
        if v.co.z < 0.79 * H:
            if v.co.x > 0.025:
                sec_name = "sec_hair_l1_2" if v.co.z < 0.73 * H else "sec_hair_l1_1"
            elif v.co.x < -0.025:
                sec_name = "sec_hair_r1_2" if v.co.z < 0.73 * H else "sec_hair_r1_1"
            else:
                sec_name = "sec_hair_c1_3" if v.co.z < 0.71 * H else ("sec_hair_c1_2" if v.co.z < 0.75 * H else "sec_hair_c1_1")
            mesh_obj.vertex_groups[sec_name].add([vi], 0.18, "REPLACE")

    for v in verts:
        groups = [(g.group, g.weight) for g in v.groups if g.weight > 1e-5]
        groups.sort(key=lambda x: x[1], reverse=True)
        top = groups[:4]
        s = sum(w for _, w in top)
        for g in list(v.groups):
            mesh_obj.vertex_groups[g.group].remove([v.index])
        if s > 0:
            for gidx, w in top:
                mesh_obj.vertex_groups[gidx].add([v.index], w / s, "REPLACE")
        else:
            mesh_obj.vertex_groups["Hips"].add([v.index], 1.0, "REPLACE")

    hair_mat = base_mat.copy()
    hair_mat.name = "Hair"
    mesh_obj.data.materials.append(hair_mat)
    for pidx in hair_polys:
        polys[pidx].material_index = 1

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
        for node in hair_mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                inp = node.inputs.get("Base Color")
                if inp and inp.is_linked and inp.links[0].from_node.type == "TEX_IMAGE":
                    tex_node = inp.links[0].from_node
                    tex_node.image = hair_img
                    nt = hair_mat.node_tree
                    mix = nt.nodes.new("ShaderNodeMix")
                    mix.data_type = "RGBA"
                    mix.blend_type = "MULTIPLY"
                    mix.inputs[0].default_value = 1.0
                    mix.inputs[7].default_value = (hair_rgb[0], hair_rgb[1], hair_rgb[2], 1.0)
                    nt.links.new(tex_node.outputs["Color"], mix.inputs[6])
                    nt.links.new(mix.outputs[2], inp)
                break

    # 6. Downscale textures to <= 1024 px
    for img in bpy.data.images:
        if img == hair_img:
            continue
        w, h = img.size[0], img.size[1]
        if w == 0 or h == 0:
            continue
        lname = img.name.lower()
        target = 512 if ("normal" in lname or "rough" in lname or "metal" in lname) else 1024
        if w > target or h > target:
            img.scale(target, target)
            img.pack()

    # 7. Push all canonical actions into NLA tracks WITH explicit action_slot binding and POSE mode active!
    arm.data.pose_position = "POSE"
    arm.animation_data_create()
    arm.animation_data.action = None
    for tr in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(tr)
    for act in clip_acts:
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
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=args.out,
        export_format="GLB",
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,
        export_def_bones=False,
        export_image_format="JPEG",
        export_jpeg_quality=88,
    )
    print(f"Exported {args.out} ({os.path.getsize(args.out)} bytes)")


if __name__ == "__main__":
    main()
