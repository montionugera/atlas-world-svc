shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_back, diffuse_burley, specular_schlick_ggx;

// Maro Bell M4 Stylized River Water Shader (Godot 4 Forward+)
// Self-contained procedural GLSL FBM waves, UV/world-space depth & cutwater pier foam, and time_offset animation.

uniform sampler2D depth_tex : hint_depth_texture, repeat_disable, filter_nearest;
uniform sampler2D screen_tex : hint_screen_texture, repeat_disable, filter_linear_mipmap;
uniform sampler2D normal_a : hint_normal, repeat_enable, filter_linear_mipmap;
uniform sampler2D normal_b : hint_normal, repeat_enable, filter_linear_mipmap;
uniform sampler2D foam_noise : repeat_enable, filter_linear_mipmap;

uniform vec4 shallow_color : source_color = vec4(0.19, 0.72, 0.72, 1.0);
uniform vec4 deep_color : source_color = vec4(0.025, 0.22, 0.36, 1.0);
uniform vec4 foam_color : source_color = vec4(0.88, 0.98, 0.95, 1.0);

uniform float deep_distance : hint_range(0.5, 10.0) = 3.2;
uniform float foam_distance : hint_range(0.05, 2.0) = 0.45;
uniform float flow_speed : hint_range(0.01, 1.0) = 0.25;
uniform float normal_strength : hint_range(0.0, 1.0) = 0.35;
uniform float ripple_scale : hint_range(0.5, 20.0) = 5.0;
uniform float water_opacity : hint_range(0.1, 1.0) = 0.86;
uniform float sparkle_strength : hint_range(0.0, 1.0) = 0.24;
uniform float refraction_strength : hint_range(0.0, 0.1) = 0.015;
uniform float time_offset = 0.0;

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

float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int k = 0; k < 3; k++) {
        v += amp * pnoise(p);
        p = p * 2.03 + vec2(17.1, 31.7);
        amp *= 0.5;
    }
    return v;
}

void fragment() {
    float t = TIME + time_offset;
    vec3 world_pos = (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;

    // 1. Flow-aligned UV coordinates (UV.x flows downstream West->East)
    vec2 flow_uv1 = vec2(UV.x * ripple_scale - t * flow_speed, UV.y * ripple_scale * 0.65);
    vec2 flow_uv2 = vec2(UV.x * ripple_scale * 1.45 - t * flow_speed * 0.75, UV.y * ripple_scale * 0.85 + t * flow_speed * 0.18);

    // 2. Self-contained procedural FBM wave normal perturbation
    float h_c = fbm(flow_uv1 * 2.2) * 0.6 + fbm(flow_uv2 * 2.6) * 0.4;
    float h_x = fbm((flow_uv1 + vec2(0.08, 0.0)) * 2.2) * 0.6 + fbm((flow_uv2 + vec2(0.08, 0.0)) * 2.6) * 0.4;
    float h_y = fbm((flow_uv1 + vec2(0.0, 0.08)) * 2.2) * 0.6 + fbm((flow_uv2 + vec2(0.0, 0.08)) * 2.6) * 0.4;
    vec3 proc_normal = normalize(vec3((h_c - h_x) * 3.5, (h_c - h_y) * 3.5, 1.0));
    NORMAL = normalize(mix(NORMAL, proc_normal, normal_strength));

    // 3. Cross-channel bank distance (UV.y = 0.0 South bank, 1.0 North bank, 0.5 center thalweg)
    float bank_dist = min(UV.y, 1.0 - UV.y);

    // World-space proximity to BR01 Bridge Cutwater Piers (Z = 231.7m & 218.3m, X in [-11.0, +11.0])
    float pier1_dz = abs(world_pos.z - 231.7);
    float pier2_dz = abs(world_pos.z - 218.3);
    float pier_dz = min(pier1_dz, pier2_dz);
    float pier_dx = max(0.0, abs(world_pos.x) - 9.2);
    float pier_dist = length(vec2(pier_dx, pier_dz));
    float pier_collar = 1.0 - smoothstep(1.1, 3.2, pier_dist);

    // Downstream wake plumes behind the 2 cutwater piers (X in [-2.0, +38.0])
    float wake_x = smoothstep(-2.0, 2.0, world_pos.x) * (1.0 - smoothstep(6.0, 38.0, world_pos.x));
    float wake_z = 1.0 - smoothstep(0.6, 2.8, pier_dz);
    float wake_turbulence = wake_x * wake_z;

    // 4. Depth factor: Shallow Turquoise (#30B8B8) along banks & pier scour mounds -> Deep Teal (#06385C) in center
    float uv_depth = smoothstep(0.05, 0.28, bank_dist);
    // Scour shelves around piers are shallow turquoise
    float pier_shallow_shelf = 1.0 - smoothstep(1.5, 5.2, pier_dist);
    float depth_factor = clamp(uv_depth * (1.0 - pier_shallow_shelf * 0.78), 0.0, 1.0);

    // 5. Shoreline, Cutwater Pier & Downstream Wake Foam
    float f_noise = fbm(flow_uv1 * 4.2 + vec2(-t * 0.42, t * 0.15));
    float bank_foam = 1.0 - smoothstep(0.015, 0.075 + (f_noise - 0.5) * 0.045, bank_dist);
    float pier_foam = smoothstep(0.30, 0.72, pier_collar + (f_noise - 0.45) * 0.45);
    float wake_foam = smoothstep(0.42, 0.78, wake_turbulence * 0.75 + (f_noise - 0.45) * 0.55);
    float foam_edge = clamp(max(bank_foam, max(pier_foam, wake_foam)), 0.0, 1.0);

    // 6. Flow-aligned wave-crest ribbons (visibly scrolling downstream with t for View 5 time-delta QA)
    float wave_phase = sin(UV.x * 44.0 - t * 2.8 + h_c * 5.5 + UV.y * 6.0);
    float wave_crest = smoothstep(0.72, 0.96, wave_phase) * (0.42 + 0.38 * wake_turbulence);

    // 7. Water color absorption (Shallow Turquoise #30B8B8 -> Deep Teal-Blue #06385C)
    vec3 water_color = mix(shallow_color.rgb, deep_color.rgb, depth_factor);
    water_color = mix(water_color, mix(shallow_color.rgb, foam_color.rgb, 0.60), wave_crest);

    // Screen refraction in shallow shelves so submerged gravel & 45 river boulders read clearly
    vec2 refr_uv = SCREEN_UV + proc_normal.xy * refraction_strength * (1.0 - foam_edge);
    vec3 refr_color = texture(screen_tex, refr_uv).rgb;
    float shallow_clarity = (1.0 - depth_factor) * 0.42;
    water_color = mix(water_color, mix(refr_color, shallow_color.rgb, 0.58), shallow_clarity);

    // Foam blend
    vec3 final_albedo = mix(water_color, foam_color.rgb, foam_edge);

    // 8. Moving sun sparkle glints on wave crests
    float sparkle_p = pnoise(flow_uv1 * 10.0 + vec2(-t * 0.65, t * 0.35));
    float sparkle = pow(max(0.0, sparkle_p - 0.68) / 0.32, 3.0) * sparkle_strength * (1.0 - foam_edge);
    final_albedo += vec3(sparkle);

    ALBEDO = final_albedo;
    ROUGHNESS = mix(0.26, 0.65, foam_edge);
    METALLIC = 0.02;
    SPECULAR = mix(0.38, 0.15, foam_edge);
    float base_alpha = mix(0.66, water_opacity, depth_factor);
    ALPHA = mix(base_alpha, 0.96, max(foam_edge, wave_crest * 0.55));
}
