shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, unshaded;

// Maro Bell M4 Plunge-Pool Foam & Expanding Ripple Arcs Shader (Godot 4 Forward+)
// Features aerated whitewater crests interwoven with deep-cyan/turquoise boiling water pockets
// so the plunge zone has rich internal color/turbulence variation instead of a uniform white mass.

uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;

uniform vec4 foam_tint : source_color = vec4(0.90, 0.97, 1.0, 1.0);
uniform vec4 ripple_tint : source_color = vec4(0.24, 0.76, 0.88, 0.85);
uniform vec4 pocket_tint : source_color = vec4(0.06, 0.44, 0.62, 1.0);

uniform float drift_speed : hint_range(0.01, 1.0) = 0.28;
uniform float expansion_speed : hint_range(0.1, 3.0) = 1.35;
uniform float ring_frequency : hint_range(1.0, 30.0) = 15.0;
uniform float opacity : hint_range(0.1, 1.0) = 0.86;
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

    // Multi-scale drifting cellular FBM turbulence
    vec2 drift_uv1 = UV * 5.2 + vec2(sin(t * drift_speed * 1.3), cos(t * drift_speed * 0.9)) * 0.45;
    vec2 drift_uv2 = UV * 8.8 - vec2(cos(t * drift_speed * 1.1), sin(t * drift_speed * 1.4)) * 0.38;
    float n_val = fbm(drift_uv1) * 0.60 + fbm(drift_uv2) * 0.40;

    // Swirling internal water pockets (carves translucent cyan/teal water windows inside the foam core)
    float pocket_noise = fbm(centered_uv * 6.8 + vec2(-t * drift_speed * 1.6, t * drift_speed * 1.2));
    float foam_web = smoothstep(0.36, 0.72, n_val * 0.65 + pocket_noise * 0.45);

    // Multi-lobed radial warp so foam patch & outward wave arcs have irregular organic boundaries
    float lobe_warp = 0.16 * sin(ang * 3.0 + n_val * 4.5) + 0.11 * cos(ang * 5.0 - t * 0.55) + 0.08 * sin(ang * 7.0);
    float warped_dist = dist + (n_val - 0.5) * 0.46 + lobe_warp;

    // Broken, intermittent outward wave arcs (zero full concentric circles)
    float ring_phase = warped_dist * (ring_frequency * 0.70) - t * expansion_speed + n_val * 2.6;
    float ring_wave = smoothstep(0.56, 0.94, 0.5 + 0.5 * sin(ring_phase));
    float arc_breakup = smoothstep(0.42, 0.76, fbm(centered_uv * 7.4 + vec2(-t * 0.32, t * 0.22)));
    float outer_ripples = ring_wave * arc_breakup * smoothstep(1.02, 0.24, warped_dist) * 0.68;

    // Aerated boiling whitewater core with internal cyan/teal water pockets
    float core_envelope = smoothstep(0.84, 0.10, warped_dist);
    float core_foam = core_envelope * mix(0.28, 0.96, foam_web);

    float combined = clamp(max(core_foam, outer_ripples), 0.0, 1.0);
    float edge_fade = smoothstep(1.02, 0.62, warped_dist) * smoothstep(1.0, 0.80, dist);

    // Blend from deep-cyan turbulent water pockets -> turquoise ripples -> bright aerated foam crests
    vec3 turbulent_base = mix(pocket_tint.rgb, ripple_tint.rgb, smoothstep(0.25, 0.75, pocket_noise));
    float white_crest_factor = clamp(foam_web * core_envelope * 0.92 + outer_ripples * 0.42, 0.0, 1.0);
    vec3 final_color = mix(turbulent_base, foam_tint.rgb, white_crest_factor);

    // Modulate alpha so cyan water pockets are partially translucent to the river below
    float pocket_alpha = mix(0.58, 0.95, white_crest_factor);
    ALBEDO = final_color;
    ALPHA = clamp(opacity * combined * edge_fade * pocket_alpha, 0.0, 0.88);
}
