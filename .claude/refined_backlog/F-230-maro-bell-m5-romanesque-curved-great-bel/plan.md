# Implementation Plan — F-230: Maro Bell M5 Monumental Landmarks

## Tasks

1. **Task 1 — Blender M5 Monumental Landmark Generator (`blender_maro_m5_landmarks.py`):**
   - Load `maro_bell_m1_masterplan.glb` in Blender (`--background`), remove/replace the boxy M1 placeholder meshes (`M1_BellSanctuaryArch`, `M1_GreatBell`, `M1_AstrolabeFountain`), and construct:
     - **Great Bell Sanctuary (`Y = +86..+114m`, base `Z = +15.6m`):**
       - Flared ceremonial grand staircase wings (`M5_SanctuaryGrandStairs`) flanking `ST04` (`Y = +36..+82m`, `Z = +8.0..+15.6m`) with stepped cheek-walls, intermediate landing (`Z = +11.8m`), carved balustrades, and 4 bronze lantern/brazier piers.
       - Massive Romanesque pier buttresses (`X = ±8.8m`) supporting a true semicircular radial-voussoir archway (`R_inner = 7.2m`, `R_outer = 10.4m`, 3 stepped concentric archivolt rings, carved impost capitals, coffered intrados soffit).
       - Ornate bronze-gold Great Bell (`M5_GreatBell`, `D = 5.6m`, `H = 6.4m`, sound-bow lip, relief waist bands, clapper, and timber/gilded-iron suspension yoke at `Z = +26.8m`).
       - Upper stepped gable facade with rose-window relief, slate-blue tiled roof, octagonal belfry lantern spire (`top Z = +48.5m` with gold spire finial), twin flanking side towers (`X = ±13.5m`, `top Z = +39.0m`) with arched belfry openings and blue conical roofs, plus royal-blue & gold hanging sanctuary banners.
     - **Central Golden Astrolabe Fountain (`(0, 0, +8.0m)`):**
       - Carved limestone & gilded bronze tiered pedestal + intermediate upper basin (`R = 3.6m`, `Z = +10.2m`) with 8 gilded water-spout masks aligned to `M4_FountainCascadeUpper/Lower` and `M4_FountainWaterSurface`.
       - Dominant multi-ring golden armillary/astrolabe sculpture (`center Z = +15.2m`, `outer D = 7.6m`, top finial `Z = +20.4m`) with heavy meridian ring, tilted ecliptic band (`23.5°`) with relief degree ribs, equatorial ring, tilted polar axis shaft (`38°`), radiant golden sun/star burst core (`D = 2.1m`), and cardinal finials.
   - Export updated `maro_bell_m1_masterplan.glb` to both `/Users/pasitnusso/asset-studio-private/atlas-3d-plan/env/m1/maro_bell_m1_masterplan.glb` and worktree `game-client/assets/models/env/maro-bell/maro_bell_m1_masterplan.glb`.

2. **Task 2 — Godot 4 Material Enhancement, Verification Probe & 6-View QA Capture (`MaroBellVerify.cs` + `annotate_maro_m5_views.py`):**
   - Enhance metallic/roughness PBR styling for `M5_GoldOrnament`, `M5_BellBronzeGold`, `M5_SanctuaryRoofBlue`, `M5_SanctuaryLimestone`, `M5_SanctuaryTrimGold`, and `M5_BannerRoyalBlue` in `MaroBellVerify.cs`.
   - Add M5 landmark geometry, height/scale, and sightline checks to `MaroBellVerify.cs` while keeping all M1–M4 navigation and uncapped GPU performance checks active.
   - Render all 6 M5 QA views (`1600x1200` raw -> `1024x768` annotated via `annotate_maro_m5_views.py`):
     - `m5_view1_sanctuary_ortho_front_side.png`
     - `m5_view2_astrolabe_ortho_closeup.png`
     - `m5_view3_south_boulevard_hero_shot2.png`
     - `m5_view4_central_plaza_astrolabe_shot3.png`
     - `m5_view5_sanctuary_arch_stairs_shot4.png`
     - `m5_view6_arch_bell_support_closeups_qa.png`

3. **Task 3 — Pre-Submission Self-Audit & ChatGPT M5 Visual QA (`pageId: 29`):**
   - Visually inspect all 6 rendered views (`1024x768`), verify zero clipping/floating geometry and unmistakable landmark readability in Shots 2, 3, and 4, and submit to ChatGPT (`pageId: 29`) for the `>= 8.0 / 10` M5 QA gate.
