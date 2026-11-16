shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

// Maro Bell M4 Wet-Edge Bank Stone Transition Shader (Godot 4 Forward+)
// Implements gpt-m1-m7-engineering-standard-2026-11-16.md Section C5:
//   - Continuous darkening and saturation increase on masonry/rock near the -2.55m waterline
//   - Reduced roughness (0.20 vs 0.82) for damp sheen
//   - Procedural noise-perturbed wet/dry transition line preventing artificial horizontal seams

uniform vec4 dry_stone_color : source_color = vec4(0.72, 0.68, 0.62, 1.0);
uniform vec4 wet_stone_color : source_color = vec4(0.38, 0.36, 0.32, 1.0);
uniform vec4 moss_tint_color : source_color = vec4(0.24, 0.42, 0.22, 1.0);

uniform float wetness_height : hint_range(0.1, 1.0) = 0.55;
uniform float wet_roughness : hint_range(0.05, 0.5) = 0.18;
uniform float dry_roughness : hint_range(0.5, 1.0) = 0.85;

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
    // UV.y is 0.0 at waterline (-2.55m) and 1.0 at +0.90m above water (-1.65m)
    float n_val = pnoise(vec2(UV.x * 14.0, UV.y * 6.0));
    float perturbed_height = UV.y + (n_val - 0.5) * 0.22;

    float wet_factor = 1.0 - smoothstep(0.0, wetness_height, perturbed_height);
    float moss_factor = smoothstep(0.15, 0.45, perturbed_height) * (1.0 - smoothstep(0.45, 0.75, perturbed_height)) * n_val;

    vec3 base_color = mix(dry_stone_color.rgb, wet_stone_color.rgb, wet_factor);
    base_color = mix(base_color, moss_tint_color.rgb, moss_factor * 0.45);

    ALBEDO = base_color;
    ROUGHNESS = mix(dry_roughness, wet_roughness, wet_factor);
    METALLIC = 0.02;
    SPECULAR = mix(0.20, 0.55, wet_factor);
}
