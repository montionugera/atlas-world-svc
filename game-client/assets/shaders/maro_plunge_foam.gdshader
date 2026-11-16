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
    float ang = atan(centered_uv.y, centered_uv.x);

    // Multi-scale drifting cellular FBM turbulence (never circular bullseye rings)
    vec2 drift_uv1 = UV * 5.5 + vec2(sin(t * drift_speed * 1.3), cos(t * drift_speed * 0.9)) * 0.42;
    vec2 drift_uv2 = UV * 9.2 - vec2(cos(t * drift_speed * 1.1), sin(t * drift_speed * 1.4)) * 0.35;
    float n_val = fbm(drift_uv1) * 0.62 + fbm(drift_uv2) * 0.38;

    // Multi-lobed radial warp so foam patch & outward wave arcs have irregular organic boundaries
    float lobe_warp = 0.16 * sin(ang * 3.0 + n_val * 4.5) + 0.11 * cos(ang * 5.0 - t * 0.55) + 0.08 * sin(ang * 7.0);
    float warped_dist = dist + (n_val - 0.5) * 0.46 + lobe_warp;

    // Broken, intermittent outward wave arcs (gated by angular + FBM pocket mask so zero full circles appear)
    float ring_phase = warped_dist * (ring_frequency * 0.72) - t * expansion_speed + n_val * 2.4;
    float ring_wave = smoothstep(0.58, 0.95, 0.5 + 0.5 * sin(ring_phase));
    float arc_breakup = smoothstep(0.45, 0.76, fbm(centered_uv * 7.8 + vec2(-t * 0.25, t * 0.18)));
    float outer_ripples = ring_wave * arc_breakup * smoothstep(1.02, 0.28, warped_dist) * 0.65;

    // Aerated boiling whitewater core with frothy cellular pockets
    float core_envelope = smoothstep(0.86, 0.14, warped_dist);
    float cellular_froth = smoothstep(0.26, 0.68, n_val + 0.26 * core_envelope);
    float core_foam = core_envelope * cellular_froth;

    float combined = clamp(max(core_foam, outer_ripples), 0.0, 1.0);
    float edge_fade = smoothstep(1.02, 0.64, warped_dist) * smoothstep(1.0, 0.82, dist);

    vec3 final_color = mix(ripple_tint.rgb, foam_tint.rgb, clamp(core_foam * 1.15 + outer_ripples * 0.35, 0.0, 1.0));
    ALBEDO = final_color;
    ALPHA = clamp(opacity * combined * edge_fade, 0.0, 0.94);
}
