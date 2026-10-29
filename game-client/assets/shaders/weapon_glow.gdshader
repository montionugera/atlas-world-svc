shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_toon, specular_toon;

// Lineage 2 & Ragnarok Origin style weapon enchant visual glow shader (+4 to +20)
// Tier 0: None
// Tier 1: Faint White (+4..+6)
// Tier 2: Luminescent Blue (+7..+9)
// Tier 3: Radiant Red (+10..+12)
// Tier 4: Abyssal Purple (+13..+15)
// Tier 5: Celestial Gold (+16..+20)
uniform int glow_tier : hint_range(0, 5) = 0;
uniform vec4 base_albedo : source_color = vec4(0.85, 0.88, 0.92, 1.0);
uniform sampler2D albedo_texture : source_color, filter_linear_mipmap, hint_default_white;
uniform float pulse_speed : hint_range(0.5, 10.0) = 3.0;
uniform float glow_intensity : hint_range(0.0, 10.0) = 2.5;

vec4 get_glow_color(int tier) {
    if (tier == 1) return vec4(1.0, 1.0, 1.0, 0.65);       // Faint White (+4..+6)
    if (tier == 2) return vec4(0.0, 0.85, 1.0, 0.85);      // Luminescent Blue (+7..+9)
    if (tier == 3) return vec4(1.0, 0.15, 0.25, 0.95);     // Radiant Red (+10..+12)
    if (tier == 4) return vec4(0.68, 0.28, 0.98, 1.0);     // Abyssal Purple (+13..+15)
    if (tier == 5) return vec4(1.0, 0.75, 0.1, 1.35);      // Celestial Gold (+16..+20)
    return vec4(0.0, 0.0, 0.0, 0.0);
}

void fragment() {
    vec4 tex_color = texture(albedo_texture, UV);
    ALBEDO = base_albedo.rgb * tex_color.rgb;
    ROUGHNESS = 0.3;
    SPECULAR = 0.5;

    if (glow_tier > 0) {
        vec4 glow = get_glow_color(glow_tier);
        float pulse = sin(TIME * pulse_speed) * 0.5 + 0.5;
        
        // Stylized Fresnel rim emission for pulsing edge glow
        float n_dot_v = 1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0);
        float fresnel = pow(n_dot_v, 2.8);
        float emission_factor = (fresnel * 0.75 + 0.25) * (0.8 + 0.4 * pulse);
        
        // For Celestial Gold (+16..+20), add solar flare boost
        if (glow_tier == 5) {
            emission_factor *= (1.2 + 0.3 * sin(TIME * 6.0));
        }

        EMISSION = glow.rgb * glow_intensity * emission_factor * glow.a;
    }
}

void light() {
    float n_dot_l = max(dot(NORMAL, LIGHT), 0.0);
    float cel_factor = smoothstep(0.4, 0.45, n_dot_l * ATTENUATION);
    vec3 light_color = mix(vec3(0.2, 0.2, 0.35) * ALBEDO, LIGHT_COLOR * ALBEDO, cel_factor);
    
    DIFFUSE_LIGHT += light_color;
}
