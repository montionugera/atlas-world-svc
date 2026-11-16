shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, unshaded;

// Maro Bell M4 Stylized Waterfall Ribbon Shader (Godot 4 Forward+)
// Implements gpt-m1-m7-engineering-standard-2026-11-16.md Section C7:
//   - Downward scrolling UV.y * flow_tiling - TIME * fall_speed
//   - Flow noise streaks and whitewater turbulence breakup
//   - Increasing lower-drop turbulence (smoothstep(0.55, 1.0, UV.y))
//   - Soft lateral edge fade preventing hard ribbon clipping

uniform sampler2D flow_noise : repeat_enable, filter_linear_mipmap;
uniform sampler2D foam_tex : repeat_enable, filter_linear_mipmap;

uniform vec4 water_tint : source_color = vec4(0.30, 0.75, 0.88, 1.0);
uniform vec4 whitewater_tint : source_color = vec4(0.88, 0.97, 1.0, 1.0);

uniform float fall_speed : hint_range(0.1, 3.0) = 0.65;
uniform float flow_tiling : hint_range(1.0, 20.0) = 5.0;
uniform float opacity : hint_range(0.1, 1.0) = 0.82;
uniform float edge_softness : hint_range(0.01, 0.5) = 0.18;

// Procedural noise fallback
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

void fragment() {
    // UV.y increases toward the bottom of the waterfall
    vec2 flow_uv = vec2(UV.x * 2.0, UV.y * flow_tiling - TIME * fall_speed);

    float streaks = texture(flow_noise, flow_uv).r;
    if (streaks < 0.01) {
        streaks = pnoise(vec2(UV.x * 6.0, flow_uv.y * 3.0));
    }

    float foam = texture(foam_tex, flow_uv * vec2(1.7, 1.25) + vec2(0.0, TIME * 0.11)).r;
    if (foam < 0.01) {
        foam = pnoise(vec2(UV.x * 8.0, flow_uv.y * 4.5 + TIME * 0.25));
    }

    // Lower drop becomes progressively more turbulent
    float lower_turbulence = smoothstep(0.55, 1.0, UV.y);
    float whitewater = smoothstep(0.38, 0.74, foam + lower_turbulence * 0.32 + (streaks - 0.5) * 0.25);

    // Soft lateral edge fade
    float edge = min(UV.x, 1.0 - UV.x);
    float edge_fade = smoothstep(0.0, max(edge_softness, 0.001), edge);

    float alpha_variation = mix(0.60, 1.0, streaks);

    ALBEDO = mix(water_tint.rgb, whitewater_tint.rgb, whitewater);
    ALPHA = opacity * edge_fade * alpha_variation;
}
