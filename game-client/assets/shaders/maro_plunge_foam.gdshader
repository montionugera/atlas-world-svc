shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, unshaded;

// Maro Bell M4 Plunge-Pool Foam & Expanding Ripple Rings Shader (Godot 4 Forward+)
// Implements gpt-m1-m7-engineering-standard-2026-11-16.md Section C8:
//   - Layered drifting impact foam patch at the base of waterfalls
//   - Expanding concentric ripple rings moving outward from impact point
//   - Radial edge fade and turbulent noise breakup

uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;

uniform vec4 foam_tint : source_color = vec4(0.88, 0.96, 1.0, 1.0);
uniform vec4 ripple_tint : source_color = vec4(0.45, 0.82, 0.92, 0.65);

uniform float drift_speed : hint_range(0.01, 1.0) = 0.15;
uniform float expansion_speed : hint_range(0.1, 3.0) = 0.85;
uniform float ring_frequency : hint_range(1.0, 30.0) = 12.0;
uniform float opacity : hint_range(0.1, 1.0) = 0.85;

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
    vec2 centered_uv = UV - vec2(0.5);
    float dist = length(centered_uv) * 2.0;

    // Drifting radial noise
    vec2 drift_uv = UV * 2.0 + vec2(sin(TIME * drift_speed * 1.5), cos(TIME * drift_speed)) * 0.25;
    float n_val = texture(noise_tex, drift_uv).r;
    if (n_val < 0.01) {
        n_val = pnoise(drift_uv * 4.0);
    }

    // Expanding concentric ripple rings
    float ring_phase = dist * ring_frequency - TIME * expansion_speed;
    float ring_wave = 0.5 + 0.5 * sin(ring_phase);
    ring_wave = pow(ring_wave, 3.0);

    // Impact foam core (dist < 0.65) vs outer ripples
    float core_foam = smoothstep(0.75, 0.20, dist) * (0.65 + 0.35 * n_val);
    float outer_ripples = ring_wave * smoothstep(1.0, 0.30, dist) * smoothstep(0.10, 0.40, dist);

    float combined = max(core_foam, outer_ripples);
    float edge_fade = smoothstep(1.0, 0.65, dist);

    vec3 final_color = mix(ripple_tint.rgb, foam_tint.rgb, core_foam);
    ALBEDO = final_color;
    ALPHA = opacity * combined * edge_fade;
}
