shader_type spatial;
render_mode blend_mix, cull_front, unshaded;

uniform vec4 outline_color : source_color = vec4(0.1, 0.1, 0.15, 1.0);
uniform float outline_thickness : hint_range(0.001, 0.05) = 0.012;

varying float v_view_dist;

void vertex() {
    // Compute distance from camera in view space (-Z is forward)
    vec4 view_pos = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
    v_view_dist = -view_pos.z;

    // Extrude vertices along vertex normals in view space to maintain consistent silhouette,
    // but scale extrusion down to 0 when camera is inside or very close to the mesh (< 2.2m)
    vec4 clip_position = PROJECTION_MATRIX * view_pos;
    vec3 clip_normal = mat3(PROJECTION_MATRIX) * (mat3(MODELVIEW_MATRIX) * NORMAL);

    float dist_scale = clamp((v_view_dist - 1.8) / 1.2, 0.0, 1.0);
    vec2 n_xy = length(clip_normal.xy) > 0.0001 ? normalize(clip_normal.xy) : vec2(0.0);
    vec2 offset = n_xy * outline_thickness * max(clip_position.w, 0.0) * dist_scale;
    clip_position.xy += offset;

    POSITION = clip_position;
}

void fragment() {
    // Never draw inverted-hull (cull_front) back-faces when the camera is inside or within 2.0m of a mesh
    if (v_view_dist < 2.0) {
        discard;
    }
    ALBEDO = outline_color.rgb;
    ALPHA = outline_color.a * clamp((v_view_dist - 2.0) / 1.0, 0.0, 1.0);
}
