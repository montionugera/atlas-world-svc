shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_back, diffuse_burley, specular_schlick_ggx;

// Maro Bell M4 Central Plaza Astrolabe Fountain Water Shader (Godot 4 Forward+)
// Calm high-clarity turquoise basin water, concentric radial ripples, spillover impact foam ring, and sparkles.

uniform sampler2D ripple_noise : repeat_enable, filter_linear_mipmap;

uniform vec4 fountain_shallow_color : source_color = vec4(0.24, 0.82, 0.86, 0.90);
uniform vec4 fountain_deep_color : source_color = vec4(0.06, 0.42, 0.58, 0.95);
uniform vec4 fountain_foam_color : source_color = vec4(0.92, 0.99, 1.0, 1.0);

uniform float ripple_speed : hint_range(0.2, 5.0) = 2.0;
uniform float ripple_frequency : hint_range(5.0, 50.0) = 26.0;
uniform float ripple_amplitude : hint_range(0.01, 0.3) = 0.12;
uniform float sparkle_strength : hint_range(0.0, 1.0) = 0.30;
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

void fragment() {
    float t = TIME + time_offset;
    vec2 centered_uv = UV - vec2(0.5);
    float dist = length(centered_uv) * 2.0;

    // Concentric radial ripple waves expanding from center & spillover ring
    float wave_phase = dist * ripple_frequency - t * ripple_speed;
    float radial_wave = sin(wave_phase);

    // Minor procedural turbulence
    float n_val = pnoise(centered_uv * 14.0 + vec2(t * 0.35, -t * 0.25));
    float wave_distorted = radial_wave + (n_val - 0.5) * 0.40;
    float crest_highlight = smoothstep(0.45, 0.92, wave_distorted);

    // Normal perturbation
    vec2 wave_grad = normalize(centered_uv + vec2(0.0001)) * wave_distorted * ripple_amplitude;
    NORMAL = normalize(mix(NORMAL, vec3(wave_grad.x, wave_grad.y, 1.0), 0.55));

    // Color gradient from deep center column to shallow turquoise stone rim
    vec3 water_color = mix(fountain_deep_color.rgb, fountain_shallow_color.rgb, clamp(dist * 0.90, 0.0, 1.0));
    water_color = mix(water_color, mix(fountain_shallow_color.rgb, fountain_foam_color.rgb, 0.55), crest_highlight * 0.55);

    // Spillover jet impact foam clusters at dist ~ 0.75 (radius ~3.10m, 8 radial splash lobes) + subtle outer rim foam
    float ang = atan(centered_uv.y, centered_uv.x);
    float jet_lobes = smoothstep(0.15, 0.85, 0.5 + 0.5 * cos(ang * 8.0 + (n_val - 0.5) * 1.2));
    float jet_impact_ring = smoothstep(0.16, 0.0, abs(dist - 0.75 + (n_val - 0.5) * 0.08)) * mix(0.22, 0.78, jet_lobes) * (0.55 + 0.45 * n_val);
    float rim_foam = smoothstep(0.90, 0.99, dist) * (0.35 + 0.40 * n_val);
    float total_foam = clamp(max(jet_impact_ring, rim_foam), 0.0, 0.85);
    vec3 final_albedo = mix(water_color, fountain_foam_color.rgb, total_foam);

    // Sun sparkle glints on wave crests
    float sparkle = pow(max(0.0, wave_distorted * 0.5 + 0.5), 5.0) * sparkle_strength;
    final_albedo += vec3(sparkle);

    ALBEDO = final_albedo;
    ROUGHNESS = mix(0.08, 0.48, total_foam);
    METALLIC = 0.04;
    SPECULAR = 0.70;
    ALPHA = mix(0.86, 0.98, total_foam);
}
