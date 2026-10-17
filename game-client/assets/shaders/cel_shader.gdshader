shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_toon, specular_toon;

uniform vec4 albedo_color : source_color = vec4(0.85, 0.45, 0.35, 1.0);
uniform sampler2D albedo_texture : source_color, filter_linear_mipmap, hint_default_white;
uniform vec4 shadow_tint : source_color = vec4(0.35, 0.35, 0.55, 1.0);

// Cel-shading thresholds
uniform float cel_threshold : hint_range(0.0, 1.0) = 0.45;
uniform float cel_softness : hint_range(0.001, 0.1) = 0.02;

// Stylized specular & rim
uniform float specular_strength : hint_range(0.0, 1.0) = 0.3;
uniform float specular_shininess : hint_range(1.0, 64.0) = 32.0;
uniform vec4 rim_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float rim_threshold : hint_range(0.0, 1.0) = 0.65;
uniform float rim_spread : hint_range(0.01, 0.5) = 0.1;

void fragment() {
    vec4 tex_color = texture(albedo_texture, UV);
    ALBEDO = albedo_color.rgb * tex_color.rgb;
    ROUGHNESS = 0.4;
    SPECULAR = 0.2;
}

void light() {
    // 1. Calculate N dot L for cel-shading
    float n_dot_l = max(dot(NORMAL, LIGHT), 0.0);
    
    // Sharp cel band with slight anti-aliased softness
    float cel_factor = smoothstep(cel_threshold - cel_softness, cel_threshold + cel_softness, n_dot_l * ATTENUATION);
    vec3 light_color = mix(shadow_tint.rgb * ALBEDO, LIGHT_COLOR * ALBEDO, cel_factor);
    
    // 2. Stylized Rim Light (Genshin hair/cloth edge silhouette)
    float n_dot_v = 1.0 - max(dot(NORMAL, VIEW), 0.0);
    float rim_factor = smoothstep(rim_threshold - rim_spread, rim_threshold + rim_spread, n_dot_v * n_dot_l);
    vec3 rim_contribution = rim_color.rgb * rim_factor * cel_factor;
    
    // 3. Stylized Specular highlight (stepped)
    vec3 half_vector = normalize(VIEW + LIGHT);
    float n_dot_h = max(dot(NORMAL, half_vector), 0.0);
    float spec_factor = pow(n_dot_h, specular_shininess);
    spec_factor = step(0.5, spec_factor) * specular_strength;
    
    DIFFUSE_LIGHT += light_color + rim_contribution;
    SPECULAR_LIGHT += LIGHT_COLOR * spec_factor;
}
