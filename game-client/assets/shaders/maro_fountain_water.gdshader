shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_back, diffuse_burley, specular_schlick_ggx;

// Maro Bell M4 Central Plaza Astrolabe Fountain Water Shader (Godot 4 Forward+)
// Implements gpt-m1-m7-engineering-standard-2026-11-16.md Section C6:
//   - Calm, high-clarity turquoise basin water
//   - Subtle radial concentric ripple waves from falling astrolabe spillover jets
//   - Circular jet impact foam ring
//   - Painterly specular shimmer highlights

uniform sampler2D ripple_noise : repeat_enable, filter_linear_mipmap;

uniform vec4 fountain_shallow_color : source_color = vec4(0.24, 0.78, 0.82, 0.90);
uniform vec4 fountain_deep_color : source_color = vec4(0.08, 0.38, 0.52, 0.95);
uniform vec4 fountain_foam_color : source_color = vec4(0.90, 0.98, 1.0, 1.0);

uniform float ripple_speed : hint_range(0.2, 5.0) = 1.6;
uniform float ripple_frequency : hint_range(5.0, 50.0) = 22.0;
uniform float ripple_amplitude : hint_range(0.01, 0.3) = 0.08;
uniform float sparkle_strength : hint_range(0.0, 1.0) = 0.22;

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
    vec2 centered_uv = UV - vec2(0.5);
    float dist = length(centered_uv) * 2.0;

    // Concentric radial ripple waves
    float wave_phase = dist * ripple_frequency - TIME * ripple_speed;
    float radial_wave = sin(wave_phase);

    // Minor procedural turbulence
    float n_val = pnoise(centered_uv * 12.0 + vec2(TIME * 0.3, -TIME * 0.2));
    float wave_distorted = radial_wave + (n_val - 0.5) * 0.45;

    // Normal perturbation
    vec2 wave_grad = normalize(centered_uv + vec2(0.0001)) * wave_distorted * ripple_amplitude;
    NORMAL = normalize(mix(NORMAL, vec3(wave_grad.x, wave_grad.y, 1.0), 0.45));

    // Color gradient from center to stone basin rim
    vec3 water_color = mix(fountain_deep_color.rgb, fountain_shallow_color.rgb, dist * 0.85);

    // Spillover jet impact foam ring at dist ~ 0.75 (radius ~3.10m)
    float jet_impact_ring = smoothstep(0.18, 0.0, abs(dist - 0.74)) * (0.65 + 0.35 * n_val);
    vec3 final_albedo = mix(water_color, fountain_foam_color.rgb, jet_impact_ring);

    // Sun sparkle glints on wave crests
    float sparkle = pow(max(0.0, wave_distorted * 0.5 + 0.5), 6.0) * sparkle_strength;
    final_albedo += vec3(sparkle);

    ALBEDO = final_albedo;
    ROUGHNESS = mix(0.10, 0.50, jet_impact_ring);
    METALLIC = 0.04;
    SPECULAR = 0.65;
    ALPHA = mix(0.88, 0.98, jet_impact_ring);
}
