shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, unshaded;

// Maro Bell M4 Plunge-Pool Foam & Expanding Ripple Rings Shader (Godot 4 Forward+)
// Self-contained procedural FBM aerated whitewater core and expanding concentric ripple rings.

uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;

uniform vec4 foam_tint : source_color = vec4(0.92, 0.98, 1.0, 1.0);
uniform vec4 ripple_tint : source_color = vec4(0.36, 0.84, 0.94, 0.85);

uniform float drift_speed : hint_range(0.01, 1.0) = 0.22;
uniform float expansion_speed : hint_range(0.1, 3.0) = 1.15;
uniform float ring_frequency : hint_range(1.0, 30.0) = 16.0;
uniform float opacity : hint_range(0.1, 1.0) = 0.92;
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
        p = p * 2.02 + vec2(19.3, 41.2);
        amp *= 0.5;
    }
    return v;
}

void fragment() {
    float t = TIME + time_offset;
    vec2 centered_uv = UV - vec2(0.5);
    float dist = length(centered_uv) * 2.0;

    // Drifting cellular FBM turbulence
    vec2 drift_uv = UV * 5.0 + vec2(sin(t * drift_speed * 1.4), cos(t * drift_speed)) * 0.45;
    float n_val = fbm(drift_uv);

    // Expanding concentric ripple rings
    float ring_phase = dist * ring_frequency - t * expansion_speed + (n_val - 0.5) * 1.2;
    float ring_wave = 0.5 + 0.5 * sin(ring_phase);
    ring_wave = smoothstep(0.42, 0.92, ring_wave);

    // Impact foam core vs outer ripples
    float core_foam = smoothstep(0.82, 0.18, dist) * smoothstep(0.28, 0.68, n_val + 0.25);
    float outer_ripples = ring_wave * smoothstep(1.05, 0.25, dist);

    float combined = max(core_foam, outer_ripples * 0.88);
    float edge_fade = smoothstep(1.05, 0.72, dist);

    vec3 final_color = mix(ripple_tint.rgb, foam_tint.rgb, clamp(core_foam + outer_ripples * 0.45, 0.0, 1.0));
    ALBEDO = final_color;
    ALPHA = clamp(opacity * combined * edge_fade, 0.0, 0.96);
}
