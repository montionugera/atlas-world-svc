shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_toon, specular_toon;

// Ragnarok Origin / Ni no Kuni inspired hand-painted meadow & sanctuary plaza shader.
// Architecture: Single-Source-of-Truth CPU Heightfield Mesh (TerrainElevation.BuildTerrainMesh)
// + Stage 2 Declarative Route Splines & Ground-ID Zone shading.
// Vertex positions and normals are baked directly by C# TerrainElevation so GPU rendering and
// CPU character/prop/shadow heights are 100% triangle-identical (zero floating or sinking).
uniform vec4 grass_base_color : source_color = vec4(0.32, 0.62, 0.28, 1.0);
uniform vec4 grass_highlight_color : source_color = vec4(0.52, 0.78, 0.34, 1.0);
uniform vec4 grass_shadow_color : source_color = vec4(0.20, 0.44, 0.22, 1.0);
uniform vec4 forest_moss_color : source_color = vec4(0.18, 0.40, 0.20, 1.0);
uniform vec4 path_stone_color : source_color = vec4(0.76, 0.70, 0.58, 1.0);
uniform vec4 path_dirt_color : source_color = vec4(0.62, 0.53, 0.42, 1.0);
uniform vec4 cliff_rock_color : source_color = vec4(0.46, 0.43, 0.39, 1.0);

// Declarative Stage 2 Route Spline segments: each vec4 is (ax, az, bx, bz) in world space
uniform int route_segment_count = 0;
uniform vec4 route_segments[16];
uniform float route_half_widths[16];
uniform float forest_inner_radius = 22.0;

varying vec3 v_world_pos;
varying float v_elevation;
varying float v_slope;

float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

float value_noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.y), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(vec2(0.8, 0.6), vec2(-0.6, 0.8));
    for (int i = 0; i < 3; i++) {
        v += a * value_noise(p);
        p = rot * p * 2.05;
        a *= 0.5;
    }
    return v;
}

float dist_to_segment(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    float len_sq = dot(ab, ab);
    if (len_sq < 0.0001) {
        return length(p - a);
    }
    float t = clamp(dot(p - a, ab) / len_sq, 0.0, 1.0);
    return length(p - (a + ab * t));
}

void vertex() {
    vec3 world_v = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
    vec3 world_n = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
    v_world_pos = world_v;
    v_elevation = world_v.y;
    v_slope = 1.0 - clamp(world_n.y, 0.0, 1.0);
}

void fragment() {
    vec2 wp = v_world_pos.xz;

    // 1. Macro meadow patches (sunlit golden-green vs cool emerald clover)
    float macro_patch = fbm(wp * 0.14);
    float mid_patch = fbm(wp * 0.45 + vec2(12.3, -7.1));

    // 2. Wind-rippled stylized grass strokes
    vec2 wind_uv = wp * 2.2 + vec2(TIME * 0.35, TIME * 0.18);
    float blade_ripple = value_noise(wind_uv * vec2(1.8, 0.7));
    float micro_blade = value_noise(wp * 6.5);

    vec3 meadow = mix(grass_shadow_color.rgb, grass_base_color.rgb, smoothstep(0.25, 0.65, macro_patch));
    meadow = mix(meadow, grass_highlight_color.rgb, smoothstep(0.48, 0.82, mid_patch * 0.75 + blade_ripple * 0.35));
    meadow += (micro_blade - 0.5) * 0.04;

    // 2b. Ground-ID Zone tinting: blend into deeper pine_forest_border moss outside central clearing
    float radial_dist = length(wp) + (macro_patch - 0.5) * 6.0;
    float forest_zone_mask = smoothstep(forest_inner_radius - 3.0, forest_inner_radius + 5.0, radial_dist);
    meadow = mix(meadow, mix(meadow, forest_moss_color.rgb, 0.42), forest_zone_mask);

    // 3. Altitude tinting & cliff slope rock blending (gives clear visual reading of 3D elevation)
    float high_ridge = smoothstep(0.8, 3.2, v_elevation);
    meadow = mix(meadow, vec3(0.46, 0.72, 0.30), high_ridge * 0.35);

    // Subtle elevation contour lines every 1.0m of height above 0.45m
    if (abs(v_elevation) > 0.45) {
        float contour = abs(fract(v_elevation * 1.0) - 0.5);
        float contour_line = 1.0 - smoothstep(0.02, 0.06, contour);
        meadow = mix(meadow, cliff_rock_color.rgb * 1.12, contour_line * 0.22);
    }

    // Walkable hill embankment (15°..38°) vs Impassable Sheer Cliff Wall (>38°, v_slope > 0.212)
    float rock_mask = smoothstep(0.08, 0.22, v_slope);
    float sheer_cliff_mask = smoothstep(0.20, 0.28, v_slope);
    float rock_tex = value_noise(wp * 3.2);
    float strata = 0.5 + 0.5 * sin(v_elevation * 8.5 + rock_tex * 2.2);
    vec3 embankment_col = mix(cliff_rock_color.rgb * 0.88, cliff_rock_color.rgb * 1.14, rock_tex);
    vec3 sheer_cliff_col = mix(vec3(0.26, 0.25, 0.28), vec3(0.38, 0.36, 0.39), strata);
    vec3 cliff_col = mix(embankment_col, sheer_cliff_col, sheer_cliff_mask);
    meadow = mix(meadow, cliff_col, rock_mask * 0.90);

    // Subtle cliff-crest rim line right at the 38° walkability threshold (v_slope ≈ 0.212)
    float rim_band = 1.0 - smoothstep(0.0, 0.035, abs(v_slope - 0.212));
    meadow = mix(meadow, vec3(0.86, 0.74, 0.48), rim_band * 0.38);

    // 4. Dappled sunlight canopy rings (bright anime sunspots on the grass)
    float sun_dapple = smoothstep(0.66, 0.74, fbm(wp * 0.28 - vec2(TIME * 0.08, 0.0)));
    meadow = mix(meadow, vec3(0.72, 0.88, 0.38), sun_dapple * 0.32 * (1.0 - rock_mask));

    // 5. Tiny stylized wildflowers in lush grass areas
    vec2 flower_cell = floor(wp * 3.5);
    vec2 flower_fract = fract(wp * 3.5) - 0.5;
    float flower_seed = hash21(flower_cell);
    if (flower_seed > 0.87 && length(wp) > 3.2 && rock_mask < 0.3) {
        float dist = length(flower_fract);
        float petal = smoothstep(0.22, 0.08, dist);
        vec3 flower_col = flower_seed > 0.95
            ? vec3(1.0, 0.92, 0.35)   // Buttercup gold
            : (flower_seed > 0.91 ? vec3(0.98, 0.98, 1.0) : vec3(0.95, 0.72, 0.88)); // Daisy white / pastel pink
        meadow = mix(meadow, flower_col, petal * 0.85);
    }

    // 6. Stage 2 Declarative Route Splines & Sanctuary Plaza cobblestone/dirt border
    float edge_noise = (macro_patch - 0.5) * 1.25;
    float road_mask = 0.0;
    if (route_segment_count > 0) {
        for (int i = 0; i < 16; i++) {
            if (i >= route_segment_count) {
                break;
            }
            vec4 seg = route_segments[i];
            float hw = max(1.2, route_half_widths[i]);
            float d = dist_to_segment(wp, seg.xy, seg.zw);
            float seg_mask = 1.0 - smoothstep(hw - 0.55, hw + 0.85, d + edge_noise * 0.65);
            road_mask = max(road_mask, seg_mask);
        }
    } else {
        float road_dist = abs(wp.x + sin(wp.y * 0.12) * 1.2);
        road_mask = (1.0 - smoothstep(1.6, 3.2, road_dist + edge_noise)) * smoothstep(-14.0, 10.0, -wp.y);
    }

    float plaza_dist = length(wp - vec2(0.0, -2.0));
    float plaza_mask = 1.0 - smoothstep(3.5, 6.2, plaza_dist + edge_noise);
    float path_factor = clamp(max(road_mask, plaza_mask * 0.85), 0.0, 1.0);

    float stone_pattern = smoothstep(0.35, 0.65, value_noise(wp * 2.8));
    vec3 path_col = mix(path_dirt_color.rgb, path_stone_color.rgb, stone_pattern * 0.55);

    ALBEDO = mix(meadow, path_col, path_factor * 0.78 * (1.0 - sheer_cliff_mask));
    ROUGHNESS = mix(0.88, 0.76, path_factor);
    SPECULAR = 0.12;
}
