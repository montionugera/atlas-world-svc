shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_back, diffuse_burley, specular_schlick_ggx;

// Maro Bell M4 Stylized River Water Shader (Godot 4 Forward+)
// Implements gpt-m1-m7-engineering-standard-2026-11-16.md Section C3 & C4:
//   - Depth-buffer reconstruction via hint_depth_texture + INV_PROJECTION_MATRIX
//   - Fallback blend with authored vertex color depth (COLOR.g) & foam mask (COLOR.r)
//     so both perspective and grazing/orthographic views render rich shallow turquoise
//     and deep teal-blue consistently!
//   - Dual scrolling flow-aligned ripple normal maps
//   - Broken noise shoreline & cutwater-pier foam
//   - Subtle screen-reading refraction & moving sun sparkle glints

uniform sampler2D depth_tex : hint_depth_texture, repeat_disable, filter_nearest;
uniform sampler2D screen_tex : hint_screen_texture, repeat_disable, filter_linear_mipmap;
uniform sampler2D normal_a : hint_normal, repeat_enable, filter_linear_mipmap;
uniform sampler2D normal_b : hint_normal, repeat_enable, filter_linear_mipmap;
uniform sampler2D foam_noise : repeat_enable, filter_linear_mipmap;

uniform vec4 shallow_color : source_color = vec4(0.19, 0.72, 0.72, 1.0);
uniform vec4 deep_color : source_color = vec4(0.025, 0.22, 0.36, 1.0);
uniform vec4 foam_color : source_color = vec4(0.83, 0.96, 0.90, 1.0);

uniform float deep_distance : hint_range(0.5, 10.0) = 3.5;
uniform float foam_distance : hint_range(0.05, 2.0) = 0.45;
uniform float flow_speed : hint_range(0.01, 1.0) = 0.12;
uniform float normal_strength : hint_range(0.0, 1.0) = 0.35;
uniform float ripple_scale : hint_range(0.5, 20.0) = 4.0;
uniform float water_opacity : hint_range(0.1, 1.0) = 0.84;
uniform float sparkle_strength : hint_range(0.0, 1.0) = 0.15;
uniform float refraction_strength : hint_range(0.0, 0.1) = 0.018;

// Procedural 2D noise fallback for self-contained robustness
float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

float pnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void fragment() {
    // 1. Flow-aligned UV coordinates (UV.x flows downstream West->East)
    vec2 flow_uv1 = vec2(UV.x * ripple_scale + TIME * flow_speed, UV.y * ripple_scale * 0.5);
    vec2 flow_uv2 = vec2(UV.x * ripple_scale * 1.35 - TIME * flow_speed * 0.85, UV.y * ripple_scale * 0.7 + TIME * flow_speed * 0.15);

    // 2. Normal map sampling (or procedural wavy normal fallback)
    vec3 n1 = texture(normal_a, flow_uv1).rgb * 2.0 - 1.0;
    vec3 n2 = texture(normal_b, flow_uv2).rgb * 2.0 - 1.0;
    // Blend wave normals
    vec3 wave_normal = normalize(vec3(n1.xy + n2.xy, n1.z * n2.z));
    NORMAL = mix(NORMAL, wave_normal, normal_strength);

    // 3. Depth-buffer reconstruction in view space
    float raw_depth = texture(depth_tex, SCREEN_UV).r;
    vec4 scene_h = INV_PROJECTION_MATRIX * vec4(SCREEN_UV * 2.0 - 1.0, raw_depth, 1.0);
    vec3 scene_view = scene_h.xyz / max(abs(scene_h.w), 0.00001) * sign(scene_h.w);
    float depth_gap = max(0.0, -scene_view.z + VERTEX.z);

    // Blended depth factor: combines depth_gap with authored vertex depth (COLOR.g)
    // to ensure grazing angles & orthographic cameras maintain rich depth absorption!
    float buffer_depth_factor = smoothstep(0.0, max(deep_distance, 0.001), depth_gap);
    float vertex_depth_factor = COLOR.g;
    float depth_factor = clamp(mix(buffer_depth_factor, vertex_depth_factor, 0.45), 0.0, 1.0);

    // 4. Shoreline & Bridge-Pier Foam
    // Combines depth intersection with authored vertex foam mask (COLOR.r)
    float buffer_foam = 1.0 - smoothstep(0.0, max(foam_distance, 0.001), depth_gap);
    float vertex_foam = COLOR.r;
    float combined_foam_raw = max(buffer_foam, vertex_foam);

    // Noise breakup on foam edges
    float f_noise = texture(foam_noise, flow_uv1 * 2.5 + vec2(TIME * 0.08, 0.0)).r;
    if (f_noise < 0.01) {
        f_noise = pnoise(flow_uv1 * 4.0 + vec2(TIME * 0.15, 0.0));
    }
    float foam_edge = smoothstep(0.35, 0.72, combined_foam_raw + (f_noise - 0.5) * 0.45);

    // 5. Water color gradient (Shallow turquoise -> Deep teal-blue)
    vec3 water_color = mix(shallow_color.rgb, deep_color.rgb, depth_factor);

    // Refraction from screen texture (underwater scene tint)
    vec2 refr_uv = SCREEN_UV + wave_normal.xy * refraction_strength * (1.0 - foam_edge);
    vec3 refr_color = texture(screen_tex, refr_uv).rgb;
    water_color = mix(refr_color * water_color * 1.35, water_color, water_opacity * 0.75);

    // Foam blend
    vec3 final_albedo = mix(water_color, foam_color.rgb, foam_edge);

    // 6. Moving sun sparkle glints
    float sparkle_p = pnoise(flow_uv1 * 8.0 + vec2(TIME * 0.25, -TIME * 0.18));
    float sparkle = pow(max(0.0, sparkle_p - 0.72) / 0.28, 4.0) * sparkle_strength * (1.0 - foam_edge);
    final_albedo += vec3(sparkle);

    ALBEDO = final_albedo;
    ROUGHNESS = mix(0.12, 0.65, foam_edge);
    METALLIC = 0.05;
    SPECULAR = mix(0.60, 0.15, foam_edge);
    ALPHA = mix(water_opacity, 0.96, foam_edge);
}
