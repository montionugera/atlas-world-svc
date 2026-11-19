# I-313 / F-228 Implementation Plan — Maro Bell M4: A-Grade Stylized River, Fountain & Waterfall System (Godot 4 Forward+) + M3 P1 Masonry Silhouette Refinement

## Goal
Deliver **Milestone 4 (M4)** of Maro Bell (`gpt-m1-m7-engineering-standard-2026-11-16.md` Section A & C + `maro-bell-master-checklist.md`) while simultaneously resolving ChatGPT's 3 `P1` M3 masonry silhouette carry-forwards (`BR01` cutwater/arch proportions, `RW01..RW10` soil-retaining backing masonry + `B15/B16` turret collars, and `CW01/CW12` riverside promenade sightlines), passing `[MaroBellVerify]` (`1,204/1,204` Player + `237/237` Mount + `93/93` Bridge + M4 water/shader/GPU checks) and achieving **`>= 8.0 / 10 PASS`** in ChatGPT Visual QA.

## Tasks

- [x] **Task 1: Build M4 Sculpted Riverbed, Shallow Shelves, Wet-Edge Banks, Multi-Ribbon Waterfalls, Fountain Basin & M3 `P1` Refinements in Blender (`blender_maro_m4_water_system.py`)**
  - Apply M3 `P1` structural refinements:
    1. **`BR01` Three-Arch Bridge Silhouette:** Slim the upper cutwater shafts (`width 2.8m -> 1.85m`, lower stepped nose cap below arch springline) so all 3 arch vaults remain unobstructed in 3/4 views, and increase arch ring circumferential smoothness (`24` radial voussoir segments with chamfered intrados molding).
    2. **`RW01..RW10` Retaining Arcade Structural Logic:** Widen shared battered piers (`1.25m -> 1.55m`), add recessed ashlar stone backing walls behind soil-retaining bays while keeping dedicated open gallery/drainage bays, and add shared octagonal stone base plinths + continuous stringcourse collars on `B15/B16` Citadel turrets.
    3. **`CW01/CW12` Riverside Hero Sightline Rebalance:** Step down the waterfront curtain walls into a welcoming terraced riverside promenade wall (`crest +7.8m` vs `+13.6m`) with open river-overlook balustrades so the 3-arch bridge (`BR01`), river channel, and rising town tiers dominate player-eye views.
  - Construct `Maro_M4_Water_System` in Blender:
    1. Sculpted depressed riverbed (`Z = -6.00 m` thalweg), sloped gravel/sand shallow shelves (`Z = -3.20 m .. -2.70 m`) along both quays and around bridge piers, and submerged river boulders/pebbles (`M4_Riverbed_Sculpted`, `M4_ShallowShelves`, `M4_RiverRocks`).
    2. Continuous wet-edge bank transition strips (`M4_WetBankBand_North`, `M4_WetBankBand_South`, `Z = -2.85 m .. -1.70 m`) hugging `QW01..QW04` and valley banks.
    3. Flow-aligned subdivided River Surface mesh (`M4_RiverSurface_Main`, `Z = -2.55 m`) with `UV.x` aligned downstream (`West -> East`) and shoreline/pier proximity encoded in vertex colors (`R = shore_proximity`, `G = NormalizedDepth`, `B = RapidsMask`) so shaders render rich depth & shoreline foam under any camera projection.
    4. Three multi-ribbon curved Waterfall assemblies (`M4_Waterfall_West`, `M4_Waterfall_East`, `M4_Waterfall_NorthAqueduct`), each with a cliff-hugging curved primary ribbon, offset secondary whitewater strips (`+0.18 m`), plunge-pool foam patches (`M4_PlungeFoam_*`), and expanding ripple rings (`M4_RippleRings_*`).
    5. Central Plaza Astrolabe Fountain water prototype (`M4_Fountain_Basin`, `M4_Fountain_WaterSurface`, `M4_Fountain_SpilloverRibbons` at `J05 +15.05 m`).
  - Export `m4_water_system_report.json` and updated `game-client/assets/models/env/maro-bell/maro_bell_m1_masterplan.glb`.

- [x] **Task 2: Build Godot 4 Forward+ 4-Layer Water Shaders, `GPUParticles3D` Mist & GPU Frame-Time Profiler (`game-client/assets/shaders/maro_*.gdshader` + `MaroBellVerify.cs`)**
  - Create `maro_river_water.gdshader`, `maro_waterfall_ribbon.gdshader`, `maro_plunge_foam.gdshader`, `maro_fountain_water.gdshader`, and `maro_wet_bank.gdshader` under `game-client/assets/shaders/`.
  - Upgrade `MaroBellVerify.cs` to:
    - Bind the procedural noise/normal textures and `.gdshader` materials to `M4_RiverSurface_Main`, `M4_WetBankBand_*`, `M4_Waterfall_*`, `M4_PlungeFoam_*`, `M4_RippleRings_*`, and `M4_Fountain_*`.
    - Spawn `GPUParticles3D` mist and splash droplets at waterfall plunge pools and the plaza fountain.
    - Verify M1 + M2 (`1,204/1,204` Player, `237/237` Mount) + M3 (`93/93` Bridge, `3/3` open bridge arches) + M4 water/shader/particle invariants and profile GPU/CPU frame times across 4 water stages (`disabled`, `base_water`, `water_plus_foam`, `full_water_mist_ssr`).
    - Render all 6 M4 QA views (`m4_view1`..`m4_view6`) directly from windowed Godot 4 Forward+ (with Blender orthographic/section insets where helpful) so every M4 screenshot displays the live Godot 4 `.gdshader` water, foam, ripples, waterfalls, and mist.

- [x] **Task 3: Compose & Visually Inspect 6-View `1024px` M4 QA Package (`annotate_maro_m4_views.py`)**
  - Compose annotated `1024px` sheets in `game-client/studio-cache/renders/gpt-crosscheck/`:
    1. `m4_view1_daylight_river_waterfall_overview.png`
    2. `m4_view2_underwater_depth_shoreline_closeup.png`
    3. `m4_view3_bridge_arch_waterline_cutwaters.png`
    4. `m4_view4_waterfall_profile_plunge_pool.png`
    5. `m4_view5_time_delta_flow_animation_strip.png`
    6. `m4_view6_godot_gpu_frametime_collision_qa.png`
  - Visually inspect all 6 views (`read_file`) and generate Tailscale preview links (`img-preview-link`).

- [x] **Task 4: Submit M4 Package to ChatGPT (`pageId: 29`) & Achieve `>= 8.0 / 10 PASS`**
  - Upload `m4_view1`..`m4_view6` + M4 engineering & GPU frame-time table to ChatGPT (`pageId: 29`), record verdict in `gpt-m4-qa-verdict-2026-11-16.md`, mark `M4` `[x]` in `maro-bell-master-checklist.md`, and request owner sign-off for `M5`.
