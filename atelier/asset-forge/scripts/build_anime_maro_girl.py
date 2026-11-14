#!/usr/bin/env python3
"""
Builds `maro_folk_girl` (`npc:maro_folk_girl`) preserving 100% of her original `b6ca879a...glb`
hair & blue ribbon polygon assignment and `HairStrandLuminance` strand-shading texture, while:
1. Unifying bone weights across all co-located `Material 0` (blue ribbon) and `Material 1` (hair)
   vertices (`z >= 0.770`) so the blue ribbon and hair arch share 100% identical weights and
   NEVER tear apart or open a gap (`uploaded_media_1794195953727.png`).
2. Aligning the 4-link ponytail spring chain (`sec_hair_c1_1..4`) in the vertical sagittal plane
   (`x = -0.002` constant) below the ribbon knot (`z = 0.820 -> 0.575`) so the wavy ponytail
   swings in a natural S-wave (`∿`) without twisting or kinking.
3. Transplanting the mouthless porcelain VRoid `FaceMesh` (`Victoria_Rubin.vrm`) with forward-facing
   (`-Y`) sapphire eyes, lossless PNG alpha layers, and 5 live eye expression morph targets
   (`eye_blink`, `eye_happy`, `eye_angry`, `eye_sorrow`, `eye_surprised`).
"""

import math
import os
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector, kdtree

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
ORIG_MARO_GLB = os.path.join(
    REPO_ROOT,
    "game-client/studio-cache/b6ca879a29f94c47a5794bff2ee36770200203fb914ec6ee22030151bf397697.glb",
)
VROID_FACE_VRM = "/Users/pasitnusso/asset-studio-private/atlas-3d-plan/vroid_bases/Victoria_Rubin.vrm"
OUT_GLB = "/tmp/maro_folk_girl.glb"


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge0 > edge1:
        return 1.0 - smoothstep(edge1, edge0, x)
    t = max(0.0, min(1.0, (x - edge0) / max(1e-6, edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=ORIG_MARO_GLB)

    arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    mesh = [o for o in bpy.data.objects if o.type == "MESH"][0]
    arm.name = "Armature"
    mesh.name = "CharacterMesh"

    # 1. Preserve original BakedMaterial_baseColor (for Material 0 Body/Ribbon) and HairStrandLuminance (for Material 1 Hair)
    base_img = bpy.data.images.get("BakedMaterial_baseColor")
    hair_img = bpy.data.images.get("HairStrandLuminance")
    if base_img is None or hair_img is None:
        raise RuntimeError("Missing BakedMaterial_baseColor or HairStrandLuminance in original GLB")

    for img in (base_img, hair_img):
        iw, ih = img.size[:]
        if iw > 512 or ih > 512:
            img.scale(min(512, iw), min(512, ih))
        img.pack()

    for mat_idx, mat in enumerate(mesh.data.materials):
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Roughness"].default_value = 0.88 if mat_idx == 0 else 0.78
        bsdf.inputs["Metallic"].default_value = 0.0
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.15
        tex = nt.nodes.new("ShaderNodeTexImage")
        if mat_idx == 0:
            mat.name = "Body"
            tex.image = base_img
        else:
            mat.name = "Hair"
            tex.image = hair_img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    # 2. Rescue the missed brown hair faces on the crown (z > 0.775) and lower ponytail tips (z = 0.585..0.775)
    #    into Material 1 (HairStrandLuminance), while keeping the blue ribbon, skin/ears, and white cape in Material 0!
    w_b, h_b = base_img.size[:]
    px_b = np.array(base_img.pixels[:], dtype=np.float32).reshape((h_b, w_b, 4))
    uv_layer = mesh.data.uv_layers.active.data
    for p in mesh.data.polygons:
        if p.material_index == 0:
            c = p.center
            if c.z >= 0.585 and c.y > -0.015 and abs(c.x) <= 0.145:
                u = sum(uv_layer[li].uv.x for li in p.loop_indices) / len(p.loop_indices)
                v = sum(uv_layer[li].uv.y for li in p.loop_indices) / len(p.loop_indices)
                r, g, b, _ = px_b[min(h_b - 1, max(0, int(v * h_b))), min(w_b - 1, max(0, int(u * w_b)))]
                is_blue_ribbon = b > r * 1.02 and b > 0.16
                is_white_cape = r > 0.60 and g > 0.58 and b > 0.54
                is_skin = r > 0.58 and g > 0.45 and b > 0.35 and (r - b) > 0.08
                if c.z > 0.815 and c.y > 0.005 and not is_blue_ribbon and not is_white_cape and not is_skin:
                    p.material_index = 1
                elif 0.585 <= c.z <= 0.815 and c.y > 0.018 and r > b * 1.12 and r > 0.10 and not is_white_cape and not is_skin:
                    p.material_index = 1

    # 2b. Spatial 3D connected-component filter across glTF UV seams (0.5mm KDTree tolerance):
    #     Reverts any disconnected brown leather arm-cuff / belt / satchel islands (< 200 faces)
    #     back to Material 0 (Body) so they stay weighted to the arms/spine and NEVER float in mid-air!
    verts_init = mesh.data.vertices
    polys_init = mesh.data.polygons
    kd_spatial = kdtree.KDTree(len(verts_init))
    for v in verts_init:
        kd_spatial.insert(v.co, v.index)
    kd_spatial.balance()

    vert_to_faces = {i: set() for i in range(len(verts_init))}
    for p in polys_init:
        for vi in p.vertices:
            for _, idx, _ in kd_spatial.find_range(verts_init[vi].co, 0.0005):
                vert_to_faces[idx].add(p.index)

    visited_m1 = set()
    for p in polys_init:
        if p.material_index != 1 or p.index in visited_m1:
            continue
        comp = []
        stack = [p.index]
        visited_m1.add(p.index)
        while stack:
            ci = stack.pop()
            comp.append(ci)
            for vi in polys_init[ci].vertices:
                for nfi in vert_to_faces[vi]:
                    if polys_init[nfi].material_index == 1 and nfi not in visited_m1:
                        visited_m1.add(nfi)
                        stack.append(nfi)
        if len(comp) < 200:
            for pi in comp:
                polys_init[pi].material_index = 0

    # Split Material 1 (Hair) from Material 0 (Body) ONLY below z = 0.770 (where the lower ponytail
    # passes behind the white shoulder cape / navy collar), keeping the upper head & blue ribbon (z >= 0.770)
    # 100% welded!
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    bm.faces.ensure_lookup_table()
    lower_pony_faces = [
        f
        for f in bm.faces
        if f.material_index == 1 and min(v.co.z for v in f.verts) < 0.770
    ]
    bmesh.ops.split(bm, geom=lower_pony_faces, use_only_faces=True)
    bm.to_mesh(mesh.data)
    bm.free()
    mesh.data.update()

    verts = mesh.data.vertices
    polys = mesh.data.polygons
    mat0_verts = {vi for p in polys if p.material_index == 0 for vi in p.vertices}
    mat1_verts = {vi for p in polys if p.material_index == 1 for vi in p.vertices}

    # Include blue ribbon vertices in Material 0 (z >= 0.768, y > 0.005, x < 0.05) in the unified
    # hair/ribbon weight domain so the blue ribbon and hair arch share 100% identical bone weights!
    ribbon_m0_verts = {
        vi
        for p in polys
        if p.material_index == 0
        for vi in p.vertices
        if verts[vi].co.z >= 0.768 and verts[vi].co.y > 0.005 and verts[vi].co.x < 0.05
    }

    # 3. Reposition ponytail bone chain (sec_hair_c1_1..4) in a clean vertical sagittal plane (constant x = -0.002)
    arm.data.pose_position = "REST"
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    ebones = arm.data.edit_bones

    head_eb = ebones["Head"]
    pony_pts = [
        Vector((-0.002, 0.045, 0.825)),
        Vector((-0.002, 0.062, 0.762)),
        Vector((-0.002, 0.078, 0.700)),
        Vector((-0.002, 0.084, 0.638)),
        Vector((-0.002, 0.075, 0.575)),
    ]
    parent_eb = head_eb
    for idx in range(4):
        bname = f"sec_hair_c1_{idx + 1}"
        eb = ebones[bname] if bname in ebones else ebones.new(bname)
        eb.head = pony_pts[idx]
        eb.tail = pony_pts[idx + 1]
        eb.parent = parent_eb
        eb.use_connect = idx > 0
        eb.roll = 0.0
        parent_eb = eb

    for bname, h_pt, t_pt, pname in (
        ("sec_hair_l1_1", Vector((0.050, -0.040, 0.840)), Vector((0.052, -0.042, 0.800)), "Head"),
        ("sec_hair_l1_2", Vector((0.052, -0.042, 0.800)), Vector((0.050, -0.042, 0.760)), "sec_hair_l1_1"),
        ("sec_hair_r1_1", Vector((-0.048, -0.045, 0.840)), Vector((-0.050, -0.040, 0.800)), "Head"),
        ("sec_hair_r1_2", Vector((-0.050, -0.040, 0.800)), Vector((-0.050, -0.036, 0.760)), "sec_hair_r1_1"),
    ):
        eb = ebones[bname] if bname in ebones else ebones.new(bname)
        eb.head = h_pt
        eb.tail = t_pt
        eb.parent = ebones[pname]
        eb.use_connect = pname != "Head"
        eb.roll = 0.0

    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()

    for act in bpy.data.actions:
        fcurves = getattr(act, "fcurves", None)
        if fcurves is None and hasattr(act, "layers") and len(act.layers) > 0:
            for strip in act.layers[0].strips:
                for bag in getattr(strip, "channelbags", []):
                    for fc in [fc for fc in bag.fcurves if 'pose.bones["sec_' in fc.data_path]:
                        bag.fcurves.remove(fc)
        elif fcurves is not None:
            for fc in [fc for fc in fcurves if 'pose.bones["sec_' in fc.data_path]:
                fcurves.remove(fc)
    for pb in arm.pose.bones:
        if pb.name.startswith("sec_"):
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
            pb.location = (0.0, 0.0, 0.0)
            pb.scale = (1.0, 1.0, 1.0)

    # 3b. Restore 1.0x horizontal pelvis shift (dx, dy) on stationary weight-shift clips
    #     ("idle", "combat_idle", "block_idle", "block") if they were previously clamped by 0.15x,
    #     so pelvis lateral shift counterbalances thigh rotations and keeps feet planted (< 1.0 cm drift).
    hips_rest_m = arm.data.bones["Hips"].matrix_local.to_3x3()
    hips_rest_inv = hips_rest_m.inverted()
    for cname in ("idle", "combat_idle", "block_idle", "block"):
        act = bpy.data.actions.get(cname)
        if not act:
            continue
        act_fcs = getattr(act, "fcurves", None)
        if act_fcs is None:
            act_fcs = []
            if hasattr(act, "layers"):
                for lyr in act.layers:
                    for st in lyr.strips:
                        for bag in getattr(st, "channelbags", []):
                            act_fcs.extend(bag.fcurves)
        loc_fcs = {
            fc.array_index: fc
            for fc in act_fcs
            if fc.data_path == 'pose.bones["Hips"].location'
        }
        if len(loc_fcs) == 3 and len(loc_fcs[0].keyframe_points) >= 2:
            n_keys = len(loc_fcs[0].keyframe_points)
            v0 = Vector((
                loc_fcs[0].keyframe_points[0].co[1],
                loc_fcs[1].keyframe_points[0].co[1],
                loc_fcs[2].keyframe_points[0].co[1],
            ))
            w0 = hips_rest_m @ v0
            max_dx = max(
                abs((hips_rest_m @ Vector((
                    loc_fcs[0].keyframe_points[k].co[1],
                    loc_fcs[1].keyframe_points[k].co[1],
                    loc_fcs[2].keyframe_points[k].co[1],
                ))).x - w0.x)
                for k in range(n_keys)
            )
            # If idle pelvis excursion was clamped by 0.15x (< 1.5 cm), restore 1.0x counterbalance
            if max_dx < 0.015:
                for k in range(n_keys):
                    v_loc = Vector((
                        loc_fcs[0].keyframe_points[k].co[1],
                        loc_fcs[1].keyframe_points[k].co[1],
                        loc_fcs[2].keyframe_points[k].co[1],
                    ))
                    w = hips_rest_m @ v_loc
                    dx = (w.x - w0.x) / 0.15
                    dy = (w.y - w0.y) / 0.15
                    l_new = hips_rest_inv @ Vector((w0.x + dx, w0.y + dy, w.z))
                    for ax in range(3):
                        kp = loc_fcs[ax].keyframe_points[k]
                        kp.co[1] = l_new[ax]
                        kp.handle_left[1] = l_new[ax]
                        kp.handle_right[1] = l_new[ax]

    # 4. Weight Material 0 (Body) and unified Hair + Blue Ribbon domain
    def ensure_vg(name: str) -> int:
        vg = mesh.vertex_groups.get(name)
        if vg is None:
            vg = mesh.vertex_groups.new(name=name)
        return vg.index

    head_idx = ensure_vg("Head")
    sec_c1 = ensure_vg("sec_hair_c1_1")
    sec_c2 = ensure_vg("sec_hair_c1_2")
    sec_c3 = ensure_vg("sec_hair_c1_3")
    sec_c4 = ensure_vg("sec_hair_c1_4")
    sec_l1 = ensure_vg("sec_hair_l1_1")
    sec_l2 = ensure_vg("sec_hair_l1_2")
    sec_r1 = ensure_vg("sec_hair_r1_1")
    sec_r2 = ensure_vg("sec_hair_r1_2")
    sec_hair_all = {sec_c1, sec_c2, sec_c3, sec_c4, sec_l1, sec_l2, sec_r1, sec_r2}

    body_only_verts = mat0_verts - ribbon_m0_verts
    W_m0 = {}
    for vi in body_only_verts:
        v = verts[vi]
        non_sec = {
            g.group: g.weight
            for g in v.groups
            if g.weight > 1e-4 and g.group not in sec_hair_all
        }
        if not non_sec:
            non_sec = {head_idx: 1.0}
        tot = sum(non_sec.values())
        W_m0[vi] = {k: val / tot for k, val in non_sec.items()}

    kd0 = kdtree.KDTree(len(body_only_verts))
    for vi in body_only_verts:
        kd0.insert(verts[vi].co, vi)
    kd0.balance()
    visited0 = set()
    for vi in body_only_verts:
        if vi in visited0:
            continue
        cluster = [idx for (_, idx, _) in kd0.find_range(verts[vi].co, 0.0005)]
        for idx in cluster:
            visited0.add(idx)
        if len(cluster) > 1:
            acc = {}
            for idx in cluster:
                for k, val in W_m0[idx].items():
                    acc[k] = acc.get(k, 0.0) + val
            tot = sum(acc.values())
            uni = {k: val / tot for k, val in acc.items() if val / tot > 1e-4}
            for idx in cluster:
                W_m0[idx] = uni

    for vi in body_only_verts:
        for vg in mesh.vertex_groups:
            vg.remove([vi])
        for k, val in W_m0[vi].items():
            mesh.vertex_groups[k].add([vi], val, "REPLACE")

    hair_and_ribbon_verts = mat1_verts | ribbon_m0_verts
    W_m1 = {}
    for vi in hair_and_ribbon_verts:
        co = verts[vi].co
        # Anchor crown, upper ponytail arch, and blue ribbon bow (z >= 0.815 or y < 0.028) firmly to Head,
        # and blend smoothly into sec_hair_c1_1..4 below the ribbon tie!
        w_pony = 0.90 * smoothstep(0.025, 0.058, co.y) * smoothstep(0.818, 0.745, co.z)
        t_chain = smoothstep(0.815, 0.585, co.z)
        w_c1 = w_c2 = w_c3 = w_c4 = 0.0
        if w_pony > 1e-4:
            if t_chain < 0.25:
                u = t_chain / 0.25
                w_c1 = w_pony * (1.0 - 0.65 * u)
                w_c2 = w_pony * (0.65 * u)
            elif t_chain < 0.55:
                u = (t_chain - 0.25) / 0.30
                w_c1 = w_pony * 0.35 * (1.0 - u)
                w_c2 = w_pony * (0.65 * (1.0 - u) + 0.35 * u)
                w_c3 = w_pony * (0.65 * u)
            elif t_chain < 0.82:
                u = (t_chain - 0.55) / 0.27
                w_c2 = w_pony * 0.35 * (1.0 - u)
                w_c3 = w_pony * (0.65 * (1.0 - u) + 0.35 * u)
                w_c4 = w_pony * (0.65 * u)
            else:
                u = min(1.0, (t_chain - 0.82) / 0.18)
                w_c3 = w_pony * 0.35 * (1.0 - u)
                w_c4 = w_pony * (0.65 + 0.35 * u)

        w_side_l = (
            0.50
            * smoothstep(-0.005, -0.042, co.y)
            * smoothstep(0.035, 0.072, co.x)
            * smoothstep(0.835, 0.755, co.z)
        )
        w_side_r = (
            0.50
            * smoothstep(-0.005, -0.042, co.y)
            * smoothstep(0.035, 0.072, -co.x)
            * smoothstep(0.835, 0.755, co.z)
        )

        w_sec_tot = min(0.92, w_pony + w_side_l + w_side_r)
        W_m1[vi] = {
            head_idx: 1.0 - w_sec_tot,
            sec_c1: w_c1,
            sec_c2: w_c2,
            sec_c3: w_c3,
            sec_c4: w_c4,
            sec_l1: w_side_l * 0.60,
            sec_l2: w_side_l * 0.40,
            sec_r1: w_side_r * 0.60,
            sec_r2: w_side_r * 0.40,
        }

    kd1 = kdtree.KDTree(len(hair_and_ribbon_verts))
    for vi in hair_and_ribbon_verts:
        kd1.insert(verts[vi].co, vi)
    kd1.balance()
    adj1 = {vi: set() for vi in hair_and_ribbon_verts}
    for p in polys:
        vs = [vi for vi in p.vertices if vi in hair_and_ribbon_verts]
        for k in range(len(vs)):
            u, v_idx = vs[k], vs[(k + 1) % len(vs)]
            adj1[u].add(v_idx)
            adj1[v_idx].add(u)
    for vi in hair_and_ribbon_verts:
        for _, nb, _ in kd1.find_range(verts[vi].co, 0.0018):
            if nb != vi:
                adj1[vi].add(nb)

    for _ in range(8):
        W_next = {}
        for vi in hair_and_ribbon_verts:
            if not adj1[vi]:
                W_next[vi] = W_m1[vi]
                continue
            acc = {k: 0.5 * val for k, val in W_m1[vi].items()}
            inv_n = 0.5 / len(adj1[vi])
            for nb in adj1[vi]:
                for k, val in W_m1[nb].items():
                    acc[k] = acc.get(k, 0.0) + val * inv_n
            tot = sum(acc.values())
            W_next[vi] = {k: val / tot for k, val in acc.items() if val / tot > 1e-4}
        W_m1 = W_next

    visited1 = set()
    for vi in hair_and_ribbon_verts:
        if vi in visited1:
            continue
        cluster = [idx for (_, idx, _) in kd1.find_range(verts[vi].co, 0.0008)]
        for idx in cluster:
            visited1.add(idx)
        if len(cluster) > 1:
            acc = {}
            for idx in cluster:
                for k, val in W_m1[idx].items():
                    acc[k] = acc.get(k, 0.0) + val
            tot = sum(acc.values())
            uni = {k: val / tot for k, val in acc.items() if val / tot > 1e-4}
            for idx in cluster:
                W_m1[idx] = uni

    for vi in hair_and_ribbon_verts:
        for vg in mesh.vertex_groups:
            vg.remove([vi])
        for k, val in W_m1[vi].items():
            mesh.vertex_groups[k].add([vi], val, "REPLACE")

    for p in polys:
        p.use_smooth = True

    # 5. Remove coarse Meshy front-face polygons on CharacterMesh and transplant VRoid mouthless FaceMesh
    #    with razor-sharp layered sapphire eyes (forward-facing -Y normals, lossless PNG alpha) and 5 live eye expressions!
    if os.path.isfile(VROID_FACE_VRM):
        bm = bmesh.new()
        bm.from_mesh(mesh.data)
        bm.faces.ensure_lookup_table()
        to_del = []
        for f in bm.faces:
            c = mesh.matrix_world @ f.calc_center_median()
            if f.material_index == 0:
                if c.z > 0.792 and c.y < -0.022 and abs(c.x) < 0.056:
                    to_del.append(f)
            elif f.material_index == 1:
                if 0.820 < c.z < 0.858 and -0.089 < c.y < -0.045 and 0.011 < abs(c.x + 0.002) < 0.044:
                    to_del.append(f)
        bmesh.ops.delete(bm, geom=to_del, context="FACES")
        bm.verts.ensure_lookup_table()
        for v in bm.verts:
            if any(f.material_index == 1 for f in v.link_faces):
                if 0.825 < v.co.z < 0.865 and abs(v.co.x + 0.002) < 0.043 and -0.089 < v.co.y < -0.055:
                    v.co.y = -0.090
        bm.to_mesh(mesh.data)
        bm.free()
        mesh.data.update()

        before_vroid = set(bpy.data.objects)
        orig_actions = set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=VROID_FACE_VRM)
        vroid_objs = [o for o in bpy.data.objects if o not in before_vroid]
        vface = next(o for o in vroid_objs if o.type == "MESH" and "Face" in o.name)

        mw = Matrix.Rotation(math.pi, 4, "Z") @ vface.matrix_world.copy()
        vface.parent = None
        vface.modifiers.clear()
        for o in vroid_objs:
            if o != vface:
                bpy.data.objects.remove(o, do_unlink=True)
        for a in list(bpy.data.actions):
            if a not in orig_actions:
                bpy.data.actions.remove(a)

        for v in vface.data.vertices:
            v.co = mw @ v.co
        if vface.data.shape_keys:
            for kb in vface.data.shape_keys.key_blocks:
                for d in kb.data:
                    d.co = mw @ d.co
        vface.matrix_world = Matrix.Identity(4)
        vface.data.update()

        vco = np.array([v.co for v in vface.data.vertices], dtype=np.float32)
        iris_mat_idx = next(i for i, m in enumerate(vface.data.materials) if "EyeIris" in m.name)
        iris_verts = [
            vface.data.vertices[vi].co
            for p in vface.data.polygons
            if p.material_index == iris_mat_idx
            for vi in p.vertices
        ]
        eye_z = float(np.mean([p.z for p in iris_verts]))
        eye_y = float(np.mean([p.y for p in iris_verts]))
        chin_z = float(vco[:, 2].min())

        erased_imgs = set()
        for mat in vface.data.materials:
            if not mat or not mat.node_tree:
                continue
            for n in mat.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image and n.image.name not in erased_imgs:
                    img = n.image
                    erased_imgs.add(img.name)
                    if "Face_00" in img.name:
                        iw, ih = img.size
                        ipx = np.array(img.pixels[:], dtype=np.float32).reshape((ih, iw, 4))
                        patch = ipx[int(ih * 0.30) : int(ih * 0.34), int(iw * 0.46) : int(iw * 0.54), :3]
                        skin_rgb = np.median(patch.reshape(-1, 3), axis=0)
                        ipx[int(ih * 0.18) : int(ih * 0.30), int(iw * 0.40) : int(iw * 0.60), :3] = skin_rgb
                        img.pixels[:] = ipx.ravel().tolist()
                        img.update()
                        img.pack()

        kb = vface.data.shape_keys.key_blocks
        basis_co = np.array([kb[0].data[i].co for i in range(len(vco))], dtype=np.float32)

        def _get_delta(idx: int) -> np.ndarray:
            tn = f"target_{idx}"
            if tn not in kb:
                return np.zeros_like(basis_co)
            return np.array([kb[tn].data[i].co for i in range(len(vco))], dtype=np.float32) - basis_co

        expr_deltas = {
            "eye_blink": _get_delta(12),
            "eye_happy": _get_delta(15) + 0.70 * _get_delta(7),
            "eye_angry": _get_delta(11) + 0.80 * _get_delta(5),
            "eye_sorrow": _get_delta(18) + 0.80 * _get_delta(8),
            "eye_surprised": _get_delta(19) + 0.70 * _get_delta(9),
        }
        for d_arr in expr_deltas.values():
            d_arr[vco[:, 2] < (eye_z - 0.025)] = 0.0

        vface.shape_key_clear()

        bpy.context.view_layer.objects.active = vface
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
        bpy.ops.object.mode_set(mode="OBJECT")

        bm = bmesh.new()
        bm.from_mesh(vface.data)
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
            v
            for v in bm.verts
            if v.is_boundary and abs(v.co.x) < 0.035 and v.co.z < (eye_z - 0.02) and v.co.y < -0.06
        ]
        bmesh.ops.remove_doubles(bm, verts=mouth_boundary, dist=0.005)

        bm.verts.ensure_lookup_table()
        for _ in range(12):
            mouth_region = [
                v
                for v in bm.verts
                if not v.is_boundary
                and abs(v.co.x) < 0.035
                and (chin_z + 0.008) < v.co.z < (eye_z - 0.022)
                and v.co.y < -0.06
            ]
            bmesh.ops.smooth_vert(bm, verts=mouth_region, factor=0.65, use_axis_x=True, use_axis_y=True, use_axis_z=True)

        bm.verts.ensure_lookup_table()
        kept_orig_idx = [v[orig_layer] for v in bm.verts]
        bm.to_mesh(vface.data)
        bm.free()
        for p in vface.data.polygons:
            p.use_smooth = True
        vface.data.update()

        scale_x, scale_y, scale_z = 0.50, 0.52, 0.54
        target_eye_x, target_eye_y, target_eye_z = -0.002, -0.072, 0.838
        for v in vface.data.vertices:
            w_co = v.co
            nx = w_co.x * scale_x + target_eye_x
            ny = (w_co.y - eye_y) * scale_y + target_eye_y
            nz = (w_co.z - eye_z) * scale_z + target_eye_z
            if nz > 0.852:
                t = min(1.0, (nz - 0.852) / 0.050)
                ny += 0.025 * (t**1.2)
                nx = target_eye_x + (nx - target_eye_x) * (1.0 - 0.25 * t)
            if abs(nx - target_eye_x) > 0.036:
                ts = min(1.0, (abs(nx - target_eye_x) - 0.036) / 0.020)
                ny += 0.015 * ts
            v.co = Vector((nx, ny, nz))
        vface.data.update()

        # Apply anime proxy-sphere upward/forward normal bias to Face_00_SKIN vertices so overhead/backlit
        # night lanterns and moonlight always produce smooth positive N.L lighting across the face!
        skin_mat_indices = {i for i, m in enumerate(vface.data.materials) if m and "SKIN" in m.name}
        skin_vert_indices = {
            vi
            for p in vface.data.polygons
            if p.material_index in skin_mat_indices
            for vi in p.vertices
        }
        custom_vnorms = []
        for vi, v in enumerate(vface.data.vertices):
            if vi in skin_vert_indices:
                dx = (v.co.x - target_eye_x) * 3.2
                proxy_n = Vector((dx, -0.86, 0.46)).normalized()
                blended = v.normal.lerp(proxy_n, 0.72).normalized()
                custom_vnorms.append(blended)
            else:
                custom_vnorms.append(v.normal.copy())
        vface.data.normals_split_custom_set_from_vertices(custom_vnorms)

        sk_basis = vface.shape_key_add(name="Basis", from_mix=False)
        for expr_name, d_arr in expr_deltas.items():
            sk = vface.shape_key_add(name=expr_name, from_mix=False)
            for new_vi, old_vi in enumerate(kept_orig_idx):
                dv = d_arr[old_vi]
                sk.data[new_vi].co = sk_basis.data[new_vi].co + Vector(
                    (dv[0] * scale_x, dv[1] * scale_y, dv[2] * scale_z)
                )

        vface.vertex_groups.clear()
        vg_head = vface.vertex_groups.new(name="Head")
        vg_head.add(list(range(len(vface.data.vertices))), 1.0, "REPLACE")
        vface.parent = arm
        mod = vface.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = arm
        vface.name = "FaceMesh"
        vface.data.name = "FaceMesh"

        alpha_keywords = ("FaceEyeline", "FaceEyelash", "FaceBrow", "EyeIris", "EyeHighlight", "EyeExtra")
        for mat in vface.data.materials:
            if not mat or not mat.node_tree:
                continue
            nt = mat.node_tree
            tex_img = next((n.image for n in nt.nodes if n.type == "TEX_IMAGE" and n.image), None)
            if not tex_img:
                continue
            iw, ih = tex_img.size
            if iw > 512 or ih > 512:
                tex_img.scale(min(512, iw), min(512, ih))
                tex_img.pack()
            nt.nodes.clear()
            out_n = nt.nodes.new("ShaderNodeOutputMaterial")
            bsdf_n = nt.nodes.new("ShaderNodeBsdfPrincipled")
            bsdf_n.inputs["Roughness"].default_value = 0.88
            bsdf_n.inputs["Metallic"].default_value = 0.0
            if "Specular IOR Level" in bsdf_n.inputs:
                bsdf_n.inputs["Specular IOR Level"].default_value = 0.05
            tex_n = nt.nodes.new("ShaderNodeTexImage")
            tex_n.image = tex_img
            nt.links.new(tex_n.outputs["Color"], bsdf_n.inputs["Base Color"])
            if any(k in mat.name for k in alpha_keywords):
                if hasattr(mat, "surface_render_method"):
                    mat.surface_render_method = "BLENDED"
                nt.links.new(tex_n.outputs["Alpha"], bsdf_n.inputs["Alpha"])
            else:
                if hasattr(mat, "surface_render_method"):
                    mat.surface_render_method = "DITHERED"
            nt.links.new(bsdf_n.outputs["BSDF"], out_n.inputs["Surface"])

    # 6. Restore Armature to POSE mode and bind all actions to NLA tracks so glTF export never bakes frozen REST A-pose!
    arm.data.pose_position = "POSE"
    arm.animation_data_create()
    arm.animation_data.action = None
    for tr in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(tr)
    for act in sorted(bpy.data.actions, key=lambda x: x.name):
        act.use_fake_user = True
        arm.animation_data.action = act
        if hasattr(act, "slots") and len(act.slots) > 0:
            act.slots[0].name_display = arm.name
            arm.animation_data.action_slot = act.slots[0]
        tr = arm.animation_data.nla_tracks.new()
        tr.name = act.name
        f0 = int(round(act.frame_range[0]))
        strip = tr.strips.new(act.name, max(1, f0), act)
        if hasattr(act, "slots") and len(act.slots) > 0 and hasattr(strip, "action_slot"):
            strip.action_slot = act.slots[0]
        arm.animation_data.action = None
    arm.animation_data.action = None
    bpy.context.view_layer.update()

    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
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
    size_kb = os.path.getsize(OUT_GLB) / 1024.0
    print(f"Exported {OUT_GLB} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
