#!/usr/bin/env python3
"""
Reusable 4-Slot Modular VRoid 360° Head + Elf Ears + Wavy Hair + Head Accessory Assembler.

Designed for hybrid AI 3D Body (Tripo / Meshy) + Clean VRoid 360° Head & Hair characters:
  Slot 1: AI 3D Body Collar Socket (trims AI head at the neck collar `z <= collar_z` so 0 broken AI head polys remain).
  Slot 2: Full 360° VRoid Head (`Face.baked` + `Body.baked[Neck + BackSkull]` welded into a single seamless `FaceMesh`
          with 1 unified skin texture, 5 live eye/brow blendshapes, and optional `--ear-style elf` pointed ear morph).
  Slot 3: Reusable Modular 3D Hair (`HairMesh` from any CC0/VRoid `.vrm` sharing the exact same skull transform,
          with ear-corridor parting, center-parted bangs, `--hair-wave` sinusoidal long wavy curls, priestess crown bun,
          clean procedural anisotropic strand luminance texture, and spring-bone weights).
  Slot 4: Separate 3D Head-Socket Accessory (`HairpinMesh`, metallic gold celestial ring & hairpin weighted to `Head`).
"""

import math
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge0 > edge1:
        return 1.0 - smoothstep(edge1, edge0, x)
    t = max(0.0, min(1.0, (x - edge0) / max(1e-6, edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def build_clean_hair_strand_material(name: str = "Hair") -> bpy.types.Material:
    """
    Creates a clean, reusable 256x256 vertical anisotropic anime hair strand luminance texture
    (`VRoidHairStrandLuminance`) and `Hair` material compatible with `CharacterCustomization.SetHairColor`.
    """
    w, h = 256, 256
    u = np.linspace(0.0, 1.0, w, dtype=np.float32)[None, :]
    v = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]

    # Soft multi-frequency vertical anime hair strand highlights + subtle horizontal angel-ring sheen
    strands = 0.86 + 0.07 * np.sin(u * 38.0 * math.pi) + 0.04 * np.cos(u * 86.0 * math.pi)
    angel_ring = 0.06 * np.exp(-(((v - 0.62) / 0.14) ** 2))
    root_tip_shade = 1.0 - 0.08 * np.exp(-((v / 0.12) ** 2)) - 0.06 * np.exp(-(((1.0 - v) / 0.12) ** 2))
    lum = np.clip((strands + angel_ring) * root_tip_shade, 0.72, 1.0)

    px = np.ones((h, w, 4), dtype=np.float32)
    px[..., 0] = lum * 0.95
    px[..., 1] = lum * 0.96
    px[..., 2] = lum * 1.00

    img = bpy.data.images.new("VRoidHairStrandLuminance", width=w, height=h, alpha=False)
    img.pixels[:] = px.ravel().tolist()
    img.update()
    img.pack()

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    nt = mat.node_tree
    nt.nodes.clear()
    out_n = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf_n = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf_n.inputs["Roughness"].default_value = 0.82
    bsdf_n.inputs["Metallic"].default_value = 0.0
    if "Specular IOR Level" in bsdf_n.inputs:
        bsdf_n.inputs["Specular IOR Level"].default_value = 0.15
    tex_n = nt.nodes.new("ShaderNodeTexImage")
    tex_n.image = img
    mix_n = nt.nodes.new("ShaderNodeMix")
    mix_n.data_type = "RGBA"
    mix_n.blend_type = "MULTIPLY"
    mix_n.inputs[0].default_value = 1.0
    mix_n.inputs[7].default_value = (0.92, 0.93, 0.99, 1.0)
    nt.links.new(tex_n.outputs["Color"], mix_n.inputs[6])
    nt.links.new(mix_n.outputs[2], bsdf_n.inputs["Base Color"])
    nt.links.new(bsdf_n.outputs["BSDF"], out_n.inputs["Surface"])
    return mat


def assemble_modular_vroid_head_and_hair(
    arm: bpy.types.Object,
    vroid_head_path: str,
    vroid_hair_path: str,
    target_skin_rgb: np.ndarray,
    hair_mat_template: bpy.types.Material = None,
    head_scale: float = 1.0,
    ear_style: str = "elf",
    hair_wave: float = 1.0,
    add_gold_hairpin: bool = True,
    collar_z: float = 0.764,
):
    """
    Imports a CC0/VRoid `.vrm` head (and optional separate `.vrm` hair donor), constructs a 100% watertight
    360-degree `FaceMesh` (front face + pointed elf ears + back skull + neck), a modular wavy `HairMesh`,
    and a separate 3D `HairpinMesh`, all scaled flexibly via `head_scale` around the neck collar socket.
    """
    rot_z = Matrix.Rotation(math.pi, 4, "Z")

    before_objs = set(bpy.data.objects)
    before_acts = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=vroid_head_path)
    imported_objs = [o for o in bpy.data.objects if o not in before_objs]

    vface = next(o for o in imported_objs if o.type == "MESH" and "Face" in o.name)
    vbody = next(o for o in imported_objs if o.type == "MESH" and "Body" in o.name)
    vhair = next((o for o in imported_objs if o.type == "MESH" and "Hair" in o.name), None)

    f_mw = rot_z @ vface.matrix_world.copy()
    b_mw = rot_z @ vbody.matrix_world.copy()
    h_mw = (rot_z @ vhair.matrix_world.copy()) if vhair else f_mw.copy()

    for obj in (vface, vbody, vhair):
        if obj is not None:
            obj.parent = None
            obj.modifiers.clear()

    for o in imported_objs:
        if o not in (vface, vbody, vhair):
            bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if a not in before_acts:
            bpy.data.actions.remove(a)

    # Transform vface, vbody, vhair into Z-up, -Y-forward VRoid world space
    for v in vface.data.vertices:
        v.co = f_mw @ v.co
    if vface.data.shape_keys:
        for kb in vface.data.shape_keys.key_blocks:
            for d in kb.data:
                d.co = f_mw @ d.co
    vface.matrix_world = Matrix.Identity(4)
    vface.data.update()

    for v in vbody.data.vertices:
        v.co = b_mw @ v.co
    vbody.matrix_world = Matrix.Identity(4)
    vbody.data.update()

    if vhair is not None:
        for v in vhair.data.vertices:
            v.co = h_mw @ v.co
        vhair.matrix_world = Matrix.Identity(4)
        vhair.data.update()

    # Measure VRoid eye center
    vco = np.array([v.co for v in vface.data.vertices], dtype=np.float32)
    iris_mat_idx = next(i for i, m in enumerate(vface.data.materials) if m and "EyeIris" in m.name)
    iris_verts = [
        vface.data.vertices[vi].co
        for p in vface.data.polygons
        if p.material_index == iris_mat_idx
        for vi in p.vertices
    ]
    eye_x = float(np.mean([p.x for p in iris_verts]))
    eye_y = float(np.mean([p.y for p in iris_verts]))
    eye_z = float(np.mean([p.z for p in iris_verts]))
    chin_z = float(vco[:, 2].min())

    # Tint Face_00_SKIN to match target_skin_rgb, FaceBrow to Dark Elf charcoal-violet, and EyeIris to Golden Amber
    skin_mat_idx = next(i for i, m in enumerate(vface.data.materials) if m and "SKIN" in m.name)
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
                    base_skin = np.median(patch.reshape(-1, 3), axis=0)
                    # Erase painted mouth line & nostril dot for clean mouthless anime porcelain look
                    ipx[int(ih * 0.18) : int(ih * 0.30), int(iw * 0.40) : int(iw * 0.60), :3] = base_skin
                    base_lum = float(0.299 * base_skin[0] + 0.587 * base_skin[1] + 0.114 * base_skin[2])
                    px_lum = 0.299 * ipx[..., 0] + 0.587 * ipx[..., 1] + 0.114 * ipx[..., 2]
                    lum_ratio = np.clip(px_lum / max(base_lum, 1e-4), 0.90, 1.03)[..., None]
                    warm_blush = np.clip((ipx[..., 0] - ipx[..., 1]) - (base_skin[0] - base_skin[1]), 0.0, 0.25)[..., None]
                    elf_blush = warm_blush * np.array([0.05, -0.05, 0.04], dtype=np.float32)
                    ipx[..., :3] = np.clip(target_skin_rgb[None, None, :] * lum_ratio + elf_blush, 0.0, 1.0)
                    # Ensure forehead UV patch (0.45..0.55, 0.28..0.36) is exact target_skin_rgb for welded BackSkull/Neck UVs
                    ipx[int(ih * 0.28) : int(ih * 0.36), int(iw * 0.45) : int(iw * 0.55), :3] = target_skin_rgb
                    img.pixels[:] = ipx.ravel().tolist()
                    img.update()
                    img.pack()
                elif "FaceBrow" in img.name:
                    iw, ih = img.size
                    ipx = np.array(img.pixels[:], dtype=np.float32).reshape((ih, iw, 4))
                    mask = ipx[..., 3] > 0.05
                    ipx[mask, 0] = 0.28
                    ipx[mask, 1] = 0.22
                    ipx[mask, 2] = 0.34
                    img.pixels[:] = ipx.ravel().tolist()
                    img.update()
                    img.pack()
                elif "EyeIris" in img.name:
                    iw, ih = img.size
                    ipx = np.array(img.pixels[:], dtype=np.float32).reshape((ih, iw, 4))
                    mask = ipx[..., 3] > 0.1
                    r = ipx[mask, 0]
                    g = ipx[mask, 1]
                    b = ipx[mask, 2]
                    ipx[mask, 0] = np.clip(b * 1.45 + r * 0.85, 0.0, 1.0)
                    ipx[mask, 1] = np.clip(g * 1.15 + r * 0.45, 0.0, 0.90)
                    ipx[mask, 2] = np.clip(b * 0.45 + 0.10, 0.0, 0.80)
                    img.pixels[:] = ipx.ravel().tolist()
                    img.update()
                    img.pack()

    # Capture 5 live morph targets from vface before bmesh surgery
    kb = vface.data.shape_keys.key_blocks
    basis_co = np.array([kb[0].data[i].co for i in range(len(vco))], dtype=np.float32)

    def _get_delta(idx):
        tn = f"target_{idx}"
        return (
            np.array([kb[tn].data[i].co for i in range(len(vco))], dtype=np.float32) - basis_co
            if tn in kb
            else np.zeros_like(basis_co)
        )

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

    # Build Full 360° Head bmesh:
    # 1. Start with vface (removing ONLY inner mouth cavity `material_index == 0`, keeping native ears & brows!)
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
    if loose_v:
        bmesh.ops.delete(bm, geom=loose_v, context="VERTS")
    bm.verts.ensure_lookup_table()

    # Weld and smooth mouth slit into mouthless porcelain lower face
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

    # 2. Append Back-of-Skull + Vertical Neck (`SKIN` polygons at z >= 1.432, |x| <= 0.105) from `vbody` directly into `bm`!
    #    (Excludes the lower trapezius/shoulder flare at z < 1.432 so the neck fits 100% inside the high stand-up collar!)
    body_mats = [m.name if m else "" for m in vbody.data.materials]
    uv_lay = bm.loops.layers.uv.active
    b_vert_map = {}
    added_back_faces = []
    for p in vbody.data.polygons:
        mn = body_mats[p.material_index]
        c = p.center
        if "SKIN" in mn and c.z >= 1.432 and abs(c.x) <= 0.105:
            f_verts = []
            for vi in p.vertices:
                if vi not in b_vert_map:
                    nv = bm.verts.new(vbody.data.vertices[vi].co)
                    nv[orig_layer] = -1  # Back-of-skull/neck vertex (0 morph delta)
                    b_vert_map[vi] = nv
                f_verts.append(b_vert_map[vi])
            try:
                nf = bm.faces.new(f_verts)
                nf.material_index = skin_mat_idx
                nf.smooth = True
                nf.normal_update()
                if nf.normal.dot(p.normal) < 0.0:
                    nf.normal_flip()
                if uv_lay is not None:
                    for loop in nf.loops:
                        loop[uv_lay].uv = (0.50, 0.32)
                added_back_faces.append(nf)
            except ValueError:
                pass

    bm.verts.ensure_lookup_table()
    # Weld ONLY the outer skin perimeter boundary vertices (where Face skin meets Body[Neck+BackSkull] skin, never near eyes!)
    skin_seam_verts = [
        v
        for v in bm.verts
        if v.is_boundary
        and all(f.material_index == skin_mat_idx for f in v.link_faces)
        and (v.co.y > -0.055 or abs(v.co.x) > 0.048 or v.co.z < (eye_z - 0.035) or v.co.z > (eye_z + 0.065))
    ]
    bmesh.ops.remove_doubles(bm, verts=skin_seam_verts, dist=0.0008)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    kept_orig_idx = [v[orig_layer] for v in bm.verts]
    bm.to_mesh(vface.data)
    bm.free()
    for p in vface.data.polygons:
        p.use_smooth = True
    vface.data.update()

    # 3. Optional Procedural Elf Ear Morph (`ear_style == "elf"`) on the unified 360° VRoid head in VRoid space
    #    IMPORTANT: Strictly restrict to the actual ear behind the temple (`co.y > -0.006` and `1.510 <= co.z <= 1.586`)
    #    so the temple/cheekbone (`co.y < -0.006`) is NEVER pulled out into a second spike!
    if ear_style == "elf":
        for v in vface.data.vertices:
            co = v.co
            ax = abs(co.x - eye_x)
            if ax > 0.078 and 1.510 <= co.z <= 1.586 and co.y > -0.006:
                t_x = smoothstep(0.078, 0.103, ax)
                t_y = smoothstep(-0.006, 0.008, co.y)
                t_z = smoothstep(1.510, 1.542, co.z) * smoothstep(1.586, 1.560, co.z)
                t_ear = t_x * t_y * t_z
                if t_ear > 0.001:
                    sgn = 1.0 if co.x >= eye_x else -1.0
                    tip_z = 1.554 + 0.022 * t_x
                    tip_y = 0.012 + 0.024 * t_x
                    pinch = 0.72 * (t_ear ** 1.15)
                    co.x += sgn * 0.092 * (t_ear ** 1.05)
                    co.z = co.z * (1.0 - pinch) + tip_z * pinch + 0.018 * (t_ear ** 1.10)
                    co.y = co.y * (1.0 - 0.55 * pinch) + tip_y * (0.55 * pinch) + 0.020 * (t_ear ** 1.10)
        vface.data.update()

    # 4. Unified Flexible Scale Transform (`transform_vroid_pt`) anchored at the neck collar socket (`collar_z`)
    base_s = 0.455 * head_scale
    scale_x, scale_y, scale_z = base_s, base_s * 0.98, base_s
    collar_vroid_z = 1.425
    target_collar_z = collar_z
    target_eye_x = 0.000
    target_eye_y = -0.048
    target_eye_z = target_collar_z + (eye_z - collar_vroid_z) * scale_z

    def transform_vroid_pt(pt: Vector, is_neck_skin: bool = False) -> Vector:
        nx = (pt.x - eye_x) * scale_x + target_eye_x
        ny = (pt.y - eye_y) * scale_y + target_eye_y
        nz = (pt.z - eye_z) * scale_z + target_eye_z
        if is_neck_skin and nz < (target_collar_z + 0.022):
            t_col = smoothstep(target_collar_z + 0.022, target_collar_z - 0.008, nz)
            nx *= 1.0 - 0.42 * t_col
            ny = ny * (1.0 - 0.45 * t_col) + (-0.006) * (0.45 * t_col)
        return Vector((nx, ny, nz))

    for v in vface.data.vertices:
        is_neck = v.co.z < 1.485 and abs(v.co.x) < 0.075
        v.co = transform_vroid_pt(v.co, is_neck_skin=is_neck)
    vface.data.update()

    # Apply proxy-sphere anime normals ONLY on front Face_00_SKIN (keeping eye/brow/lash normals 100% untouched!)
    skin_vert_indices = {
        vi for p in vface.data.polygons if p.material_index == skin_mat_idx for vi in p.vertices
    }
    decal_vert_indices = {
        vi for p in vface.data.polygons if p.material_index != skin_mat_idx for vi in p.vertices
    }
    pure_skin_verts = skin_vert_indices - decal_vert_indices
    custom_vnorms = []
    for vi, v in enumerate(vface.data.vertices):
        if vi in pure_skin_verts and v.co.y < -0.015 and v.co.z > (target_collar_z + 0.015):
            dx = (v.co.x - target_eye_x) * 3.0
            proxy_n = Vector((dx, -0.86, 0.44)).normalized()
            blend_w = 0.68 * smoothstep(-0.015, -0.035, v.co.y)
            custom_vnorms.append(v.normal.lerp(proxy_n, blend_w).normalized())
        else:
            custom_vnorms.append(v.normal.copy())
    vface.data.normals_split_custom_set_from_vertices(custom_vnorms)

    # Re-apply 5 live morph targets (with 0 delta on welded back-of-skull & neck vertices)
    sk_basis = vface.shape_key_add(name="Basis", from_mix=False)
    for expr_name, d_arr in expr_deltas.items():
        sk = vface.shape_key_add(name=expr_name, from_mix=False)
        for new_vi, old_vi in enumerate(kept_orig_idx):
            if old_vi >= 0:
                dv = d_arr[old_vi]
                sk.data[new_vi].co = sk_basis.data[new_vi].co + Vector(
                    (dv[0] * scale_x, dv[1] * scale_y, dv[2] * scale_z)
                )
            else:
                sk.data[new_vi].co = sk_basis.data[new_vi].co.copy()

    # Bind FaceMesh to Head + neck bones
    vface.vertex_groups.clear()
    vg_f_head = vface.vertex_groups.new(name="Head")
    vg_f_neck = vface.vertex_groups.new(name="neck")
    for vi, v in enumerate(vface.data.vertices):
        w_neck = smoothstep(target_collar_z + 0.022, target_collar_z - 0.008, v.co.z)
        if w_neck > 0.01:
            vg_f_neck.add([vi], w_neck, "REPLACE")
            vg_f_head.add([vi], 1.0 - w_neck, "REPLACE")
        else:
            vg_f_head.add([vi], 1.0, "REPLACE")

    vface.parent = arm
    f_mod = vface.modifiers.new(name="Armature", type="ARMATURE")
    f_mod.object = arm
    vface.name = "FaceMesh"
    vface.data.name = "FaceMesh"

    # Configure FaceMesh materials (preserving EyeIris opacity & decal alpha blending)
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
        bsdf_n.inputs["Base Color"].default_value = (0.955, 0.955, 0.955, 1.0)
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

    print(
        f"[Slot 2] Assembled Full 360° VRoid FaceMesh ({len(vface.data.polygons)} polys, +{len(added_back_faces)} welded BackSkull/Neck polys, ear_style={ear_style}, head_scale={head_scale})"
    )

    # 5. Slot 3: Reusable Modular 3D Wavy Long Hair (`HairMesh`)
    if vroid_hair_path and vroid_hair_path != vroid_head_path:
        if vhair is not None:
            bpy.data.objects.remove(vhair, do_unlink=True)
        b_h = set(bpy.data.objects)
        b_a = set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=vroid_hair_path)
        h_objs = [o for o in bpy.data.objects if o not in b_h]
        vhair = next((o for o in h_objs if o.type == "MESH" and "Hair" in o.name), None)
        d_face = next((o for o in h_objs if o.type == "MESH" and "Face" in o.name), None)
        d_eye_x, d_eye_y, d_eye_z = eye_x, eye_y, eye_z
        if d_face is not None:
            df_mw = rot_z @ d_face.matrix_world.copy()
            d_iris_idx = next((i for i, m in enumerate(d_face.data.materials) if m and "EyeIris" in m.name), 0)
            d_iv = [
                df_mw @ d_face.data.vertices[vi].co
                for p in d_face.data.polygons
                if p.material_index == d_iris_idx
                for vi in p.vertices
            ]
            if d_iv:
                d_eye_x = float(np.mean([p.x for p in d_iv]))
                d_eye_y = float(np.mean([p.y for p in d_iv]))
                d_eye_z = float(np.mean([p.z for p in d_iv]))
        if vhair is not None:
            vh_mw = rot_z @ vhair.matrix_world.copy()
            vhair.parent = None
            vhair.modifiers.clear()
            for v in vhair.data.vertices:
                co_w = vh_mw @ v.co
                v.co = Vector((co_w.x - d_eye_x + eye_x, co_w.y - d_eye_y + eye_y, co_w.z - d_eye_z + eye_z))
            vhair.matrix_world = Matrix.Identity(4)
            vhair.data.update()
        for o in h_objs:
            if o != vhair:
                bpy.data.objects.remove(o, do_unlink=True)
        for a in list(bpy.data.actions):
            if a not in b_a:
                bpy.data.actions.remove(a)

    bm_hair = bmesh.new()
    if vhair is not None:
        bm_hair.from_mesh(vhair.data)
        bm_hair.faces.ensure_lookup_table()
        # If the donor hair has a small hairclip accessory material (e.g. Sendagaya_Shino mat[1] with <800 verts), remove it
        if len(vhair.data.materials) > 1:
            mat0_faces = [f for f in bm_hair.faces if f.material_index == 0]
            other_faces = [f for f in bm_hair.faces if f.material_index != 0]
            if len(mat0_faces) > 2000 and len(other_faces) < 400:
                bmesh.ops.delete(bm_hair, geom=other_faces, context="FACES")
                bmesh.ops.delete(bm_hair, geom=[v for v in bm_hair.verts if not v.link_faces], context="VERTS")

    uv_hair = bm_hair.loops.layers.uv.active or bm_hair.loops.layers.uv.new("UVMap")

    # Append `HairBack` scalp cap polygons from `vbody`
    hb_vert_map = {}
    for p in vbody.data.polygons:
        mn = body_mats[p.material_index]
        if "HairBack" in mn:
            f_verts = []
            for vi in p.vertices:
                if vi not in hb_vert_map:
                    hb_vert_map[vi] = bm_hair.verts.new(vbody.data.vertices[vi].co)
                f_verts.append(hb_vert_map[vi])
            try:
                nf = bm_hair.faces.new(f_verts)
                nf.smooth = True
                nf.normal_update()
                if nf.normal.dot(p.normal) < 0.0:
                    nf.normal_flip()
                for loop in nf.loops:
                    loop[uv_hair].uv = (0.50, 0.50)
            except ValueError:
                pass

    # Add a sculpted High Priestess Bun on top-back of the VRoid crown (`z = eye_z + 0.168`, `y = eye_y + 0.115`)
    bun_center = Vector((eye_x, eye_y + 0.115, eye_z + 0.168))
    res_bun = bmesh.ops.create_uvsphere(bm_hair, u_segments=20, v_segments=12, radius=0.056)
    bun_vert_set = set(res_bun["verts"])
    for v in res_bun["verts"]:
        rel = v.co.copy()
        rel.x *= 1.05
        rel.y *= 0.92
        rel.z *= 0.80
        ang = math.atan2(rel.y, rel.x)
        r_mult = 1.0 + 0.04 * math.sin(ang * 6.0 + rel.z * 45.0)
        v.co = bun_center + Vector((rel.x * r_mult, rel.y * r_mult, rel.z))
    for f in bm_hair.faces:
        f.smooth = True
        if any(v in bun_vert_set for v in f.verts):
            for loop in f.loops:
                rel_v = loop.vert.co - bun_center
                u_b = (math.atan2(rel_v.y, rel_v.x) / (2.0 * math.pi)) % 1.0
                v_b = max(0.05, min(0.95, 0.5 + rel_v.z * 8.0))
                loop[uv_hair].uv = (u_b, v_b)

    # Remove `vbody` now that its BackSkull/Neck and HairBack polygons have been extracted
    bpy.data.objects.remove(vbody, do_unlink=True)

    # Deform HairMesh in VRoid space:
    # (a) Part front bangs in an elegant Dark Elf Seeress arch so eyebrows and upper forehead are visible!
    # (b) Part side strands around the pointed Elf Ear corridor so the elf ears poke through cleanly!
    # (c) Shape back hair into lush, flowing Wavy Long Hair (`hair_wave`) draping behind the shoulders!
    bm_hair.verts.ensure_lookup_table()
    for v in bm_hair.verts:
        co = v.co
        rx = co.x - eye_x
        ry = co.y - eye_y
        rz = co.z - eye_z

        # (a) Curtain-parted front bangs (`ry < 0.025`, `-0.025 <= rz <= 0.105`, `|rx| < 0.068`)
        if ry < 0.025 and -0.025 <= rz <= 0.105 and abs(rx) < 0.068:
            w_front = smoothstep(0.025, -0.008, ry) * smoothstep(-0.025, 0.012, rz) * smoothstep(0.105, 0.055, rz)
            center_arch = math.exp(-((rx / 0.036) ** 2))
            # Sweep center bangs gracefully outward & upward like curtain bangs so eyebrows & forehead read clearly
            co.z += 0.022 * w_front * center_arch
            co.x += (0.024 if rx >= 0.0 else -0.024) * w_front * center_arch * smoothstep(0.0, 0.014, abs(rx))

        # (b) Wavy Long Hair curls & flare on back/shoulder strands (`ry > 0.045`, `rz < 0.050`)
        if ry > 0.045 and rz < 0.050:
            t_back = smoothstep(0.045, 0.088, ry)
            t_down = smoothstep(0.050, -0.380, rz) * t_back
            if t_down > 0.001:
                # Stretch down to mid-back/waist (`z_game ≈ 0.48..0.52m`)
                dz = -0.18 * (t_down ** 1.10)
                new_rz = rz + dz
                flare_y = 0.085 * smoothstep(0.04, 0.50, t_down)
                phase = new_rz * 26.0 + rx * 22.0
                wave_amp = hair_wave * smoothstep(0.06, 0.42, t_down)
                wx = 0.026 * wave_amp * math.sin(phase)
                wy = 0.020 * wave_amp * math.cos(phase * 0.85)
                co.x += wx + (0.14 * rx * smoothstep(0.10, 0.80, t_down))
                co.y += flare_y + wy
                co.z = eye_z + new_rz

        v.co = transform_vroid_pt(co, is_neck_skin=False)

    bm_hair.to_mesh(vhair.data)
    bm_hair.free()
    vhair.data.update()

    bpy.context.view_layer.objects.active = vhair
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.mode_set(mode="OBJECT")

    # Bias HairMesh vertex normals outward from head center so interior hair cards next to the neck never render black
    hair_center = Vector((0.0, 0.005, target_eye_z + 0.015))
    h_vnorms = []
    for v in vhair.data.vertices:
        out_dir = (v.co - hair_center)
        out_dir.z = max(-0.15, out_dir.z)
        if out_dir.length > 1e-4:
            out_dir.normalize()
            h_vnorms.append(v.normal.lerp(out_dir, 0.55).normalized())
        else:
            h_vnorms.append(v.normal.copy())
    vhair.data.normals_split_custom_set_from_vertices(h_vnorms)

    # Assign clean procedural `Hair` strand luminance material
    hair_mat = build_clean_hair_strand_material("Hair")
    vhair.data.materials.clear()
    vhair.data.materials.append(hair_mat)
    for p in vhair.data.polygons:
        p.material_index = 0
        p.use_smooth = True

    # Weight HairMesh to `Head` + `sec_hair_c1_1..4` + `sec_hair_l1_1..2` + `sec_hair_r1_1..2`
    vhair.vertex_groups.clear()
    vg_h_head = vhair.vertex_groups.new(name="Head")
    vg_h_c = [vhair.vertex_groups.new(name=f"sec_hair_c1_{i}") for i in range(1, 5)]
    vg_h_l = [vhair.vertex_groups.new(name=f"sec_hair_l1_{i}") for i in range(1, 3)]
    vg_h_r = [vhair.vertex_groups.new(name=f"sec_hair_r1_{i}") for i in range(1, 3)]

    for vi, v in enumerate(vhair.data.vertices):
        co = v.co
        if co.z >= 0.805 or co.y < -0.015:
            if co.z < 0.815 and abs(co.x) > 0.025 and co.y < -0.015:
                sw = smoothstep(0.815, 0.745, co.z) * 0.45
                vg_h_head.add([vi], 1.0 - sw, "REPLACE")
                if co.x > 0:
                    vg_h_l[0].add([vi], sw * 0.65, "REPLACE")
                    vg_h_l[1].add([vi], sw * 0.35, "REPLACE")
                else:
                    vg_h_r[0].add([vi], sw * 0.65, "REPLACE")
                    vg_h_r[1].add([vi], sw * 0.35, "REPLACE")
            else:
                vg_h_head.add([vi], 1.0, "REPLACE")
        else:
            t_chain = smoothstep(0.805, 0.500, co.z)
            w_chain = t_chain * 0.88
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
            tot_w = min(0.90, w1 + w2 + w3 + w4)
            vg_h_head.add([vi], 1.0 - tot_w, "REPLACE")
            vg_h_c[0].add([vi], w1, "REPLACE")
            vg_h_c[1].add([vi], w2, "REPLACE")
            vg_h_c[2].add([vi], w3, "REPLACE")
            vg_h_c[3].add([vi], w4, "REPLACE")

    vhair.parent = arm
    h_mod = vhair.modifiers.new(name="Armature", type="ARMATURE")
    h_mod.object = arm
    vhair.name = "HairMesh"
    vhair.data.name = "HairMesh"
    print(f"[Slot 3] Assembled Modular Wavy HairMesh ({len(vhair.data.polygons)} polys, hair_wave={hair_wave})")

    # 6. Slot 4: Separate 3D Gold Hairpin Accessory (`HairpinMesh`) parented to `Head` socket
    hairpin_obj = None
    if add_gold_hairpin:
        bm_pin = bmesh.new()
        pin_origin_vroid = Vector((eye_x - 0.085, eye_y + 0.088, eye_z + 0.145))
        ring_rot = Matrix.Rotation(math.radians(28.0), 4, "Y") @ Matrix.Rotation(math.radians(-18.0), 4, "X")
        n_seg = 24
        n_ring = 8
        R_maj = 0.046
        r_min = 0.0042
        ring_verts = []
        for i in range(n_seg):
            theta = 2.0 * math.pi * i / n_seg
            ct, st = math.cos(theta), math.sin(theta)
            row = []
            for j in range(n_ring):
                phi = 2.0 * math.pi * j / n_ring
                cp, sp = math.cos(phi), math.sin(phi)
                local_p = Vector(((R_maj + r_min * cp) * ct, (R_maj + r_min * cp) * st, r_min * sp))
                p_vroid = pin_origin_vroid + (ring_rot @ local_p)
                row.append(bm_pin.verts.new(transform_vroid_pt(p_vroid)))
            ring_verts.append(row)
        for i in range(n_seg):
            ni = (i + 1) % n_seg
            for j in range(n_ring):
                nj = (j + 1) % n_ring
                f = bm_pin.faces.new((ring_verts[i][j], ring_verts[ni][j], ring_verts[ni][nj], ring_verts[i][nj]))
                f.smooth = True

        res_shaft = bmesh.ops.create_cone(
            bm_pin, cap_ends=True, cap_tris=True, segments=10, radius1=0.0045, radius2=0.0015, depth=0.145
        )
        shaft_rot = Matrix.Rotation(math.radians(68.0), 4, "Y") @ Matrix.Rotation(math.radians(15.0), 4, "Z")
        for v in res_shaft["verts"]:
            p_vroid = pin_origin_vroid + Vector((0.025, 0.010, -0.010)) + (shaft_rot @ v.co)
            v.co = transform_vroid_pt(p_vroid)

        for b_idx, b_off in enumerate([Vector((-0.036, -0.005, -0.035)), Vector((-0.038, -0.005, -0.068))]):
            res_bead = bmesh.ops.create_uvsphere(bm_pin, u_segments=10, v_segments=8, radius=0.0095 - 0.0015 * b_idx)
            for v in res_bead["verts"]:
                p_vroid = pin_origin_vroid + b_off + v.co
                v.co = transform_vroid_pt(p_vroid)

        for f in bm_pin.faces:
            f.smooth = True

        pin_mesh_data = bpy.data.meshes.new("CrownOrnamentMesh")
        bm_pin.to_mesh(pin_mesh_data)
        bm_pin.free()

        hairpin_obj = bpy.data.objects.new("CrownOrnamentMesh", pin_mesh_data)
        bpy.context.scene.collection.objects.link(hairpin_obj)

        gold_mat = bpy.data.materials.new(name="GoldAccessory")
        gold_mat.use_nodes = True
        g_nt = gold_mat.node_tree
        g_nt.nodes.clear()
        g_out = g_nt.nodes.new("ShaderNodeOutputMaterial")
        g_bsdf = g_nt.nodes.new("ShaderNodeBsdfPrincipled")
        g_bsdf.inputs["Base Color"].default_value = (0.94, 0.76, 0.28, 1.0)
        g_bsdf.inputs["Metallic"].default_value = 0.82
        g_bsdf.inputs["Roughness"].default_value = 0.34
        g_nt.links.new(g_bsdf.outputs["BSDF"], g_out.inputs["Surface"])
        pin_mesh_data.materials.append(gold_mat)

        vg_pin = hairpin_obj.vertex_groups.new(name="Head")
        vg_pin.add(list(range(len(pin_mesh_data.vertices))), 1.0, "REPLACE")
        hairpin_obj.parent = arm
        p_mod = hairpin_obj.modifiers.new(name="Armature", type="ARMATURE")
        p_mod.object = arm
        print(f"[Slot 4] Attached Separate 3D Gold CrownOrnamentMesh ({len(pin_mesh_data.polygons)} polys) to Head socket")

    return vface, vhair, hairpin_obj
