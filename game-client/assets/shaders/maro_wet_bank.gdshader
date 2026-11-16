shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;

// Maro Bell M4 Wet-Edge Bank Stone Transition Shader (Godot 4 Forward+)
// Implements gpt-m1-m7-engineering-standard-2026-11-16.md Section C5:
//   - Continuous darkening and saturation increase on masonry/rock near the -2.55m waterline
//   - Reduced roughness (0.20 vs 0.82) for damp sheen
//   - Procedural noise-perturbed wet/dry transition line preventing artificial horizontal seams

uniform vec4 dry_stone_color : source_color = vec4(0.74, 0.70, 0.63, 1.0);
uniform vec4 wet_stone_color : source_color = vec4(0.22, 0.21, 0.19, 1.0);
uniform vec4 moss_tint_color : source_color = vec4(0.20, 0.38, 0.18, 1.0);

uniform float wetness_height : hint_range(0.1, 1.0) = 0.68;
uniform float wet_roughness : hint_range(0.05, 0.5) = 0.12;
uniform float dry_roughness : hint_range(0.5, 1.0) = 0.86;

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
        p = p * 2.03 + vec2(15.2, 27.8);
        amp *= 0.5;
    }
    return v;
}

void fragment() {
    // UV.y is 0.0 at submerged base (-2.85m), ~0.25 at waterline (-2.55m), and 1.0 at +0.90m above water (-1.65m)
    float n_macro = fbm(vec2(UV.x * 9.0, UV.y * 3.5));
    float n_seepage = fbm(vec2(UV.x * 28.0, UV.y * 2.2));
    float block_grain = pnoise(vec2(UV.x * 42.0, UV.y * 14.0));

    float perturbed_height = UV.y + (n_macro - 0.5) * 0.34 + (n_seepage - 0.5) * 0.18;

    // Strong capillary dampness below waterline + irregular splashed stone stain above
    float soaked_band = 1.0 - smoothstep(0.18, 0.46, perturbed_height);
    float damp_stain = 1.0 - smoothstep(0.28, wetness_height, perturbed_height);
    float wet_factor = clamp(soaked_band * 0.65 + damp_stain * 0.55, 0.0, 1.0);

    // Organic tidal moss & algae pockets in stone crevices near the waterline
    float moss_band = smoothstep(0.16, 0.38, perturbed_height) * (1.0 - smoothstep(0.42, 0.78, perturbed_height));
    float moss_factor = moss_band * smoothstep(0.38, 0.72, n_macro * 0.6 + n_seepage * 0.4);

    vec3 dry_col = dry_stone_color.rgb * mix(0.88, 1.08, block_grain);
    vec3 wet_col = wet_stone_color.rgb * mix(0.82, 1.12, block_grain);
    vec3 base_color = mix(dry_col, wet_col, wet_factor);
    base_color = mix(base_color, moss_tint_color.rgb, moss_factor * 0.62);

    ALBEDO = base_color;
    ROUGHNESS = mix(dry_roughness, wet_roughness, wet_factor);
    METALLIC = 0.03;
    SPECULAR = mix(0.18, 0.68, wet_factor);
}
