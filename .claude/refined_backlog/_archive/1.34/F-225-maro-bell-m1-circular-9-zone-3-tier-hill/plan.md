---
title: "Maro Bell M1: circular 9-zone 3-tier hillside, recessed river channel, and outer valley master plan"
id: F-225
status: refined
---

# Implementation Plan — F-225 (Maro Bell M1 Master Plan)

## Tasks

1. **Task 1 — Parametric Blender M1 Master Plan Generator (`blender_maro_m1_masterplan.py`):**
   - Build `/Users/pasitnusso/asset-studio-private/atlas-3d-plan/tools/blender_maro_m1_masterplan.py` (executed via `/usr/local/bin/blender --background --python`).
   - Construct the `520m × 520m` valley & mountain bowl, recessed curving river channel (`Y=-4.8m` bed, `Y=-2.2m` water), 3 stepped circular hillside tiers (`Tier 1 Y=+1.5..+3.2m`, `Tier 2 Y=+6.5..+9.0m`, `Tier 3 Y=+15.0..+16.5m`), continuous curved outer fortification placeholder ribbon (`R=84m`), NW & E waterfall cliffs + high aqueduct, and all 9 zone architectural massing volumes + `1.30m` player scale markers.
   - Export `env/m1/maro_bell_m1_masterplan.blend`, `env/m1/maro_bell_m1_masterplan.glb` (`1.0m` unit scale, Y-up glTF), and render the Blender orthographic top-down (`m1_view1_topdown_raw.png`), 3/4 bird's-eye Shot 5 (`m1_view2_birdseye_shot5.png`), and side-section elevation profile (`m1_view3_side_section_raw.png`).
2. **Task 2 — Annotated Engineering Sheets (`annotate_maro_m1_views.py`):**
   - Overlay crisp metric annotations, all 9 zone badges (`①–⑨`), elevation contour heights (`Y = -2.2m, +2.0m, +6.5m, +15.0m, +32.0m, +57.0m`), north arrow, and `1.30m` player scale callouts onto View 1 (Top-Down) and View 3 (Side-Section Profile).
3. **Task 3 — Godot 4 Forward+ Integration & View 4 Player-Eye Render (`MaroBellVerify.cs`):**
   - Sync `maro_bell_m1_masterplan.glb` into `game-client/studio-cache/env/m1/maro_bell_m1_masterplan.glb` (gitignored studio-cache) and add `M1` verification & rendering to `MaroBellVerify.cs` (`m1_view4_godot_player_eye_south.png` at `1.30m` player eye height on the southern bridge approach looking north up the 3 tiers, plus Godot 3/4 bird's-eye cross-check).
4. **Task 4 — ChatGPT Visual QA Gate (`>= 8.0 / 10`):**
   - Downscale all 4 views (`sips -Z 1024`), inspect via `read_file`, upload to the active `Atlas: The Cala Knight` ChatGPT thread (`from @claudia`), iterate if needed until `>= 8.0 / 10` PASS, and mark `M1` complete in `maro-bell-master-checklist.md`.
