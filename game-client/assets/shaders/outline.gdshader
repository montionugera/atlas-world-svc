shader_type spatial;
render_mode blend_mix, cull_front, unshaded;

uniform vec4 outline_color : source_color = vec4(0.1, 0.1, 0.15, 1.0);
uniform float outline_thickness : hint_range(0.001, 0.05) = 0.012;

void vertex() {
    // Extrude vertices along vertex normals in view space to maintain consistent silhouette
    vec4 clip_position = PROJECTION_MATRIX * (MODELVIEW_MATRIX * vec4(VERTEX, 1.0));
    vec3 clip_normal = mat3(PROJECTION_MATRIX) * (mat3(MODELVIEW_MATRIX) * NORMAL);
    
    vec2 offset = normalize(clip_normal.xy) * outline_thickness * clip_position.w;
    clip_position.xy += offset;
    
    POSITION = clip_position;
}

void fragment() {
    ALBEDO = outline_color.rgb;
}
