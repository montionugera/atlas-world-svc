---
title: "Maro Bell M4 stylized river fountain waterfall system and M3 P1 masonry silhouette refinement"
id: F-228
status: refined
from_idea: I-313
---

# I-313 / F-228: Maro Bell M4 — A-Grade Stylized River, Fountain & Waterfall System (Godot 4 Forward+) + M3 P1 Masonry Silhouette Refinement

## Problem

With `M1 Rev 2` (`8.4 / 10 PASS`), `M2 Rev 2` (`8.5 / 10 PASS`), and `M3` (`8.1 / 10 PASS`, `F-227`) approved and shipped into `release/1.34`, Maro Bell has a validated 420 m circular 9-zone hillside, a continuous spline road/curb/stair network (`J01..J16`), and continuous perimeter walls (`CW01..CW12`), bastions (`B01..B16`), retaining arcades (`RW01..RW10`), quays (`QW01..QW04`), and a 3-arch semicircular stone bridge (`BR01`).

However, two sets of requirements must now be delivered in **Milestone 4 (M4)**:
1. **Governing M4 Water System (`gpt-m1-m7-engineering-standard-2026-11-16.md` Section A & C + `maro-bell-master-checklist.md`):**
   - Currently, the river (`Z = -2.55 m`), valley waterfalls, and plaza fountain use flat opaque placeholder water meshes (`flat cyan rectangular appearance`), with no shallow/deep underwater channel shelves, no wet-edge bank material blending, no Godot 4 Forward+ `.gdshader` depth/ripple/foam/sparkle rendering, no multi-ribbon curved waterfalls, and no plunge-pool foam or `GPUParticles3D` mist/splash systems.
2. **M3 Carry-Forward `P1` Visual & Structural Refinements (`gpt-m3-qa-verdict-2026-11-16.md` Section 3):**
   - **`P1 — BR01 Bridge Silhouette`:** Slim down the oversized rectangular upper cutwater masses so they do not obscure the 3 arch spans in 3/4 views, and smooth the stepped voussoir arch rings into a refined 24-segment radial curve while preserving the 3 true 3D arch voids and `J01 (+3.12 m)` deck weld.
   - **`P1 — Retaining Arcade Structural Logic`:** Distinguish soil-retaining masonry from open galleries/drainage passages by adding thicker battered piers (`1.55 m`), recessed ashlar backing walls behind soil-retaining bays, and a shared stone plinth/stringcourse collar on `B15/B16` turrets.
   - **`P1 — Riverside Hero-Camera Composition`:** Step down the foreground riverfront curtain wall height (`CW01/CW12`) into a welcoming riverside promenade parapet and open the `B01/B02` South Gatehouse framing so the flowing river, stepped quays, and 3-arch bridge (`BR01`) visually dominate player-eye views (`View 5` target `>= 8.0 / 10`).

## Why now

- `M3` (`F-227`) passed ChatGPT Visual QA (`8.1 / 10 PASS`) and received owner sign-off to ship into `release/1.34` and advance immediately to `M4` while carrying the 3 `P1` silhouette refinements on the active register.
- Per the M1–M7 Hard Gate Rule, `M4` must score `>= 8.0 / 10` in ChatGPT Visual QA + GPU frame-time verification before `M5` begins.

## Proposed direction

1. **Blender M4 Water Geometry + M3 `P1` Structural Silhouette Upgrade (`blender_maro_m4_water_system.py`):**
   - Load the `M3` scene (`blender_maro_m3_walls_bridge.py` pipeline) and apply the 3 `P1` masonry refinements (`BR01` slimmer cutwater upper shafts + 24-segment smooth arch rings, `RW01..RW10` thicker `1.55 m` piers + recessed ashlar soil backing with intentional open gallery/culvert bays + `B15/B16` turret plinth/stringcourse collars, and `CW01/CW12` stepped riverside promenade wall profile).
   - Build the **4-System Stylized Water Geometry (`Maro_M4_Water_System`):**
     - **Riverbed & Shallow Gravel/Rock Shelves (`M4_Riverbed_Sculpted`, `M4_ShallowShelves_*`, `M4_RiverRocks_*`):** Depressed main channel (`Z = -6.00 m`) rising smoothly to shallow pebble/sand shelves (`Z = -3.20 m .. -2.70 m`) along both banks and around the 2 bridge cutwater piers so depth shaders read real underwater geometry.
     - **Wet-Edge Bank Band (`M4_WetBankBand_*`):** Continuous shoreline transition strips (`Z = -2.85 m .. -1.70 m`) along `QW01..QW04` and outer valley banks with vertex-color/UV height mask for damp darkened stone & moss blending.
     - **Flow-Aligned River Surface (`M4_RiverSurface_Main`):** Continuous subdivided ribbon (`Z = -2.55 m`) spanning the full valley & 3 bridge arches with flow-aligned `UV.x` (`+U` downstream West->East) and cross-channel `UV.y` (`0..1` bank-to-bank proximity stored in `UV2`/vertex color for grazing-angle and orthographic depth-foam stability).
     - **Multi-Ribbon Curved Waterfalls (`M4_Waterfall_West`, `M4_Waterfall_East`, `M4_Waterfall_NorthAqueduct`):** Each built from (a) a primary curved ribbon following the cliff profile from upper lip to plunge pool (`UV.y = 0` top to `1` bottom), (b) narrower offset secondary whitewater strips (`+0.18 m` normal offset to prevent z-fighting), and (c) plunge-pool impact foam patches (`M4_PlungeFoam_*`) + expanding ripple rings (`M4_RippleRings_*`).
     - **Central Plaza Astrolabe Fountain Basin & Water Prototype (`M4_Fountain_Basin`, `M4_Fountain_WaterSurface`, `M4_Fountain_SpilloverRibbons` at `J05 +15.05 m`):** Sculpted octagonal/circular stone basin with real stepped floor (`+14.45 m`), calm radial water surface (`+15.38 m`), upper bowl spillover ribbons, and splash ring.
2. **Godot 4 Forward+ 4-Layer Water Shaders, `GPUParticles3D` Mist & GPU Frame-Time Profiler (`game-client/assets/shaders/maro_*.gdshader` + `MaroBellVerify.cs`):**
   - Implement `maro_river_water.gdshader` (depth-buffer reconstruction via `hint_depth_texture` + `INV_PROJECTION_MATRIX` blended with authored channel depth/shoreline attributes so both perspective and orthographic views display turquoise shallows `vec3(0.19, 0.72, 0.72)`, deep teal-blue `vec3(0.025, 0.22, 0.36)`, dual flow-aligned scrolling normal maps, broken noise shoreline & cutwater-pier foam, subtle refraction, and sun sparkles).
   - Implement `maro_waterfall_ribbon.gdshader` (accelerating downward streaks, lower-drop whitewater turbulence breakup, soft edge fade) and `maro_plunge_foam.gdshader` (drifting layered impact whitewater & expanding ripple rings).
   - Implement `maro_fountain_water.gdshader` (high-clarity basin water with radial concentric ripples and jet impact foam) and `maro_wet_bank.gdshader` (noisy wet-stone darkening & roughness reduction near `-2.55 m`).
   - Instantiate `GPUParticles3D` mist & splash emitters (`M4_WaterfallMist_*`, `M4_WaterfallSplash_*`, `M4_FountainSplash_*`) in `MaroBellVerify.cs` and profile GPU/CPU frame times across 4 staged passes (`Water Disabled`, `Base River Water`, `Water + Shoreline/Waterfall Foam`, `Full Water + Mist/Splash Particles + SSR`).
3. **6-View M4 QA Screenshot Package (`annotate_maro_m4_views.py` + `MaroBellVerify.cs`):**
   - Render & compose 6 `1024px` views in `game-client/studio-cache/renders/gpt-crosscheck/`:
     1. `m4_view1_daylight_river_waterfall_overview.png`
     2. `m4_view2_underwater_depth_shoreline_closeup.png`
     3. `m4_view3_bridge_arch_waterline_cutwaters.png`
     4. `m4_view4_waterfall_profile_plunge_pool.png`
     5. `m4_view5_time_delta_flow_animation_strip.png`
     6. `m4_view6_godot_gpu_frametime_collision_qa.png`

## Acceptance criteria

- [ ] `blender_maro_m4_water_system.py` builds the sculpted riverbed + shallow gravel/rock shelves, wet-edge bank bands, flow-aligned river ribbon, 3 multi-ribbon curved waterfalls + plunge-pool foam/ripple meshes, Central Plaza fountain basin + spillover water prototype, and all 3 M3 `P1` masonry silhouette refinements, exporting `maro_bell_m1_masterplan.glb` and `m4_water_system_report.json`.
- [ ] Godot 4 Forward+ shaders (`maro_river_water.gdshader`, `maro_waterfall_ribbon.gdshader`, `maro_plunge_foam.gdshader`, `maro_fountain_water.gdshader`, `maro_wet_bank.gdshader`) compile with zero shader errors and render alongside `GPUParticles3D` mist/splash emitters in `MaroBellVerify.cs`.
- [ ] `MaroBellVerify.cs` verifies all M1 + M2 (`1,204/1,204` Player steps, `237/237` Mount steps) + M3 (`93/93` Bridge steps, `3/3` open bridge arches) + M4 checks (water shader activation, multi-frame time-delta motion verification, GPU/frame-time profile across 4 water stages) with `[MaroBellVerify] VERDICT PASS`.
- [ ] All 6 M4 QA views (`m4_view1`..`m4_view6`) are rendered in Godot 4 Forward+ / Blender, downscaled to `1024px`, visually verified, and submitted to ChatGPT (`pageId: 29`) achieving **`>= 8.0 / 10 PASS`**.
