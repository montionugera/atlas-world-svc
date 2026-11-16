shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, unshaded;

// Maro Bell M4 Stylized Waterfall Ribbon Shader (Godot 4 Forward+)
// Self-contained procedural FBM vertical flow streaks, lower-drop turbulence, and time_offset animation.

uniform sampler2D flow_noise : repeat_enable, filter_linear_mipmap;
uniform sampler2D foam_tex : repeat_enable, filter_linear_mipmap;

uniform vec4 water_tint : source_color = vec4(0.22, 0.72, 0.86, 1.0);
uniform vec4 whitewater_tint : source_color = vec4(0.92, 0.98, 1.0, 1.0);

uniform float fall_speed : hint_range(0.1, 3.0) = 0.85;
uniform float flow_tiling : hint_range(1.0, 20.0) = 5.0;
uniform float opacity : hint_range(0.1, 1.0) = 0.90;
uniform float edge_softness : hint_range(0.01, 0.5) = 0.14;
uniform float time_offset = 0.0;

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
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
        p = p * 2.05 + vec2(13.4, 29.1);
        amp *= 0.5;
    }
    return v;
}

void fragment() {
    float t = TIME + time_offset;
    vec2 flow_uv = vec2(UV.x * 7.5, UV.y * flow_tiling - t * fall_speed);

    // Multi-frequency vertical water strands + downward accelerating foam cascades
    float streaks = fbm(vec2(UV.x * 11.0, flow_uv.y * 1.15));
    float fine_strands = fbm(vec2(UV.x * 24.0 + (streaks - 0.5) * 1.8, flow_uv.y * 0.85 - t * 0.4));
    float strand_ribbons = 0.5 + 0.5 * sin(UV.x * 26.0 + streaks * 4.2);
    float strand_mask = clamp(streaks * 0.50 + fine_strands * 0.35 + strand_ribbons * 0.35, 0.0, 1.0);

    float cascade_waves = 0.5 + 0.5 * sin(UV.y * 24.0 - t * fall_speed * 4.8 + streaks * 5.2);
    float foam = fbm(vec2(UV.x * 14.0, flow_uv.y * 2.1 - t * 0.55));

    // Upper cliff-lip acceleration & lower plunge-pool whitewater crash (preserve deep cyan water grooves between foam strands)
    float lip_foam = (1.0 - smoothstep(0.0, 0.16, UV.y)) * smoothstep(0.35, 0.72, strand_mask);
    float mid_ledge_step = exp(-pow((UV.y - 0.42) * 8.0, 2.0)) * 0.32 * strand_ribbons;
    float lower_turbulence = smoothstep(0.58, 0.98, UV.y) * 0.35;
    float whitewater = smoothstep(
        0.44,
        0.78,
        foam * 0.38 + strand_ribbons * 0.36 + streaks * 0.26 + cascade_waves * 0.18 + lower_turbulence + lip_foam * 0.35 + mid_ledge_step
    );

    // Organic FBM-perturbed lateral edge fade (eliminates straight geometric ribbon edges)
    float raw_edge = min(UV.x, 1.0 - UV.x);
    float organic_edge = raw_edge + (streaks - 0.5) * 0.14 * smoothstep(0.0, 0.12, raw_edge);
    float edge_fade = smoothstep(0.01, max(edge_softness * 1.35, 0.05), organic_edge);

    // Distinct vertical strand breakup with translucent gaps between falling water chutes
    float strand_alpha = smoothstep(0.26, 0.68, strand_mask * 0.85 + whitewater * 0.35 + lower_turbulence * 0.25);

    vec3 deep_water_groove = water_tint.rgb * mix(0.65, 1.05, streaks);
    ALBEDO = mix(deep_water_groove, whitewater_tint.rgb, whitewater);
    ALPHA = clamp(opacity * edge_fade * strand_alpha, 0.0, 0.92);
}
