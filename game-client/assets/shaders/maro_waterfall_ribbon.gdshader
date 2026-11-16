shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, unshaded;

// Maro Bell M4 Stylized Waterfall Ribbon Shader (Godot 4 Forward+)
// Cohesive translucent cyan-turquoise cascading water volume with soft billowy whitewater crests,
// smooth FBM sheet lobes (no thin stringy sine gratings), and time_offset animation.

uniform sampler2D flow_noise : repeat_enable, filter_linear_mipmap;
uniform sampler2D foam_tex : repeat_enable, filter_linear_mipmap;

uniform vec4 water_tint : source_color = vec4(0.14, 0.62, 0.78, 1.0);
uniform vec4 whitewater_tint : source_color = vec4(0.90, 0.97, 1.0, 1.0);

uniform float fall_speed : hint_range(0.1, 3.0) = 0.95;
uniform float flow_tiling : hint_range(1.0, 20.0) = 4.2;
uniform float opacity : hint_range(0.1, 1.0) = 0.88;
uniform float edge_softness : hint_range(0.01, 0.5) = 0.18;
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
        p = p * 2.02 + vec2(13.4, 29.1);
        amp *= 0.5;
    }
    return v;
}

void fragment() {
    float t = TIME + time_offset;
    vec2 flow_uv = vec2(UV.x * 4.5, UV.y * flow_tiling - t * fall_speed);

    // Broad, cohesive cascading water sheets with organic FBM turbulence (avoids thin stringy threads)
    float broad_sheets = fbm(vec2(UV.x * 5.2, flow_uv.y * 0.90));
    float medium_flow = fbm(vec2(UV.x * 9.5 + (broad_sheets - 0.5) * 1.4, flow_uv.y * 1.25 - t * 0.35));
    float sheet_lobes = 0.5 + 0.5 * sin(UV.x * 9.4 + broad_sheets * 2.8);
    float volume_mask = clamp(broad_sheets * 0.52 + medium_flow * 0.32 + sheet_lobes * 0.24, 0.0, 1.0);

    // Downward accelerating wave pulses
    float cascade_pulses = 0.5 + 0.5 * sin(UV.y * 16.0 - t * fall_speed * 4.2 + broad_sheets * 4.0);
    float aerated_froth = fbm(vec2(UV.x * 8.0, flow_uv.y * 1.65 - t * 0.45));

    // Upper crest aeration and lower plunge whitewater transition while preserving cyan water body in mid-drop
    float lip_foam = (1.0 - smoothstep(0.0, 0.20, UV.y)) * smoothstep(0.32, 0.70, volume_mask) * 0.55;
    float lower_turbulence = smoothstep(0.56, 0.98, UV.y) * 0.48;
    float raw_whitewater = aerated_froth * 0.36 + broad_sheets * 0.28 + cascade_pulses * 0.16 + lower_turbulence + lip_foam;
    float whitewater = smoothstep(0.46, 0.86, raw_whitewater) * 0.84;

    // Soft organic lateral edge fade
    float raw_edge = min(UV.x, 1.0 - UV.x);
    float organic_edge = raw_edge + (broad_sheets - 0.5) * 0.12 * smoothstep(0.0, 0.14, raw_edge);
    float edge_fade = smoothstep(0.01, max(edge_softness * 1.45, 0.06), organic_edge);

    // Cohesive water curtain alpha (continuous translucent turquoise core + denser aerated foam crests)
    float curtain_alpha = mix(0.68, 0.96, clamp(volume_mask * 0.65 + whitewater * 0.55, 0.0, 1.0));

    // Rich cyan-teal depth variation across the falling water body
    vec3 deep_water_core = mix(vec3(0.05, 0.38, 0.56), water_tint.rgb, smoothstep(0.22, 0.78, broad_sheets));
    ALBEDO = mix(deep_water_core, whitewater_tint.rgb, whitewater);
    ALPHA = clamp(opacity * edge_fade * curtain_alpha, 0.0, 0.90);
}
