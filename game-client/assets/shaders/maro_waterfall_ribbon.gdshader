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

    // High-contrast vertical water streaks + downward foam bands
    float streaks = fbm(vec2(UV.x * 9.0, flow_uv.y * 1.4));
    float cascade_waves = 0.5 + 0.5 * sin(UV.y * 22.0 - t * fall_speed * 4.5 + streaks * 4.0);
    float foam = fbm(vec2(UV.x * 12.0, flow_uv.y * 2.2 - t * 0.45));

    // Upper lip & lower plunge turbulence
    float lip_foam = 1.0 - smoothstep(0.0, 0.16, UV.y);
    float lower_turbulence = smoothstep(0.45, 0.96, UV.y);
    float whitewater = smoothstep(
        0.34,
        0.68,
        foam * 0.55 + streaks * 0.35 + cascade_waves * 0.25 + lower_turbulence * 0.38 + lip_foam * 0.32
    );

    // Soft lateral edge fade
    float edge = min(UV.x, 1.0 - UV.x);
    float edge_fade = smoothstep(0.0, max(edge_softness, 0.001), edge);

    float alpha_variation = mix(0.72, 1.0, max(streaks, whitewater));

    ALBEDO = mix(water_tint.rgb, whitewater_tint.rgb, whitewater);
    ALPHA = opacity * edge_fade * alpha_variation;
}
