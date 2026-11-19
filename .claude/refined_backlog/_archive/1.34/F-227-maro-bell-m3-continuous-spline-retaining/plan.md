# I-312 / F-227 Implementation Plan — Maro Bell M3: Continuous Spline Retaining Walls, Bastions, True 3-Arch Bridge & Canal Edge

## Goal
Build and verify **Milestone 3 (M3)** of Maro Bell over the locked `M1 Rev 2` (`8.4/10`) + `M2 Rev 2` (`8.5/10`) masterplan: continuous Catmull-Rom spline outer curtain walls & battlements, `12` tangent-matched cylindrical/octagonal bastions (`B01..B12`), 6-sub-terrace shared-pier retaining arch walls tied directly to M2 road edges, recessed river/canal stone quay walls matching the `-0.8 m` waterline and `-3.2 m` riverbed, and a physically open 3-arch semicircular stone bridge at `Zone 9 South Gate`, passing `[MaroBellVerify]` (`1,204/1,204` Player + `237/237` Mount regression + M3 structural/arch checks) and achieving **`>= 8.0 / 10` (`PASS`)** in ChatGPT Visual QA.

## Tasks

- [ ] **Task 1: Build Continuous Spline Walls, Bastions, Retaining Arches, Quay Edges & True 3-Arch Bridge in Blender (`blender_maro_m3_walls_bridge.py`)**
  - Load `M2 Rev 2` scene (`maro_bell_m2_roads_stairs.blend` or rebuild via `blender_maro_m2_roads_stairs.py`), remove M1 wall/bridge placeholders (`Maro_M1_Walls_And_Bridge`), and construct `Maro_M3_Walls_Bastions_Bridge`:
    1. **Retaining-Wall Attachment (`RW01..RW10`):** Derive spline control points, `-2.0 m` terrain-embedded foundation skirts, and crest elevations directly from the locked M2 road/plaza outer edges and M1 6-sub-terrace heights (`T1A +3.12..+4.35m`, `T1B +7.68..+9.28m`, `T2A +15.05m`, `T2B +18.85..+19.85m`, `T2C +22.85..+23.35m`, `T3 +32.10..+34.65m`), with shared-pier 3D semicircular retaining arch bays (`1.20 m` battered piers, `3.20 m` clear arch span, `0.65 m` recessed/open structural depth, molded cornice, and `+0.95 m` stone parapet coping).
    2. **Outer Curtain Walls & Battlements (`CW01..CW06`):** Sweep battered ashlar fortification walls (`3.2 m` base thickness tapering to `2.4 m` walkway, `-2.5 m` cliff/terrain foundation skirt) along the circular town perimeter with integer arc-length-redistributed crenelated merlons and embrasures.
    3. **Bastions & Gate Towers (`B01..B12`):** Construct 12 explicit cylindrical/octagonal stone bastions (`B01_SouthGate_W`, `B02_SouthGate_E`, `B03_Harbor_SW`, `B04_Craft_W`, `B05_Res_NW`, `B06_Sanctuary_NW`, `B07_NorthGate_W`, `B08_NorthGate_E`, `B09_Sanctuary_NE`, `B10_Inn_NE`, `B11_Shrine_E`, `B12_Guild_SE`) with corbeled machicolations, crenelated crowns, and explicit welded junction collars matching incoming curtain-wall tangents (`0.000 mm` seam).
    4. **True Three-Arch Stone Bridge (`Maro_M3_ThreeArch_Bridge`):** Construct 3 physically open semicircular stone arch vaults (`center span 9.20 m`, `side spans 7.40 m`, radial voussoir rings, spandrel walls, `2` pointed cutwater piers rooted to `-3.60 m`, continuous cambered `16.0 m` cobble roadway + `0.35 m` curbs + `0.55 m` parapets with cutwater refuge bays, and North/South bank abutments welded to `J01 +3.12 m` and South Approach `+2.40 m`).
    5. **River & Canal Quay Edges (`QW01..QW04`):** Construct stepped stone quay walls, mooring stairs, and arched drainage culverts along the North and South riverbanks (`-0.80 m` water surface, `-3.20 m` riverbed) welded cleanly into the bridge wingwalls.
  - Export `m3_wall_bridge_continuity_report.json` and `game-client/assets/models/env/maro-bell/maro_bell_m1_masterplan.glb`.

- [ ] **Task 2: Render & Annotate Blender M3 Views 1–4 (`annotate_maro_m3_views.py`)**
  - Render in Blender Workbench/EEVEE and compose annotated `1024px` sheets:
    1. `m3_view1_topdown_wall_bridge_network.png`: Top-down continuous wall, retaining arch, bastion (`B01..B12`), quay (`QW01..QW04`), and 3-arch bridge network with structural node IDs & elevation table.
    2. `m3_view2_grazing_retaining_wall_road_interfaces.png`: `18°` grazing-light closeups of curved retaining walls, shared-pier arches, stairwing collars, and M2 road/curb interfaces (`0` foundation gaps).
    3. `m3_view3_wireframe_bastions_arches_transitions.png`: High-contrast wireframe closeups of bastions, arc-length battlements, wall-to-bastion welded collars, and structural arch openings.
    4. `m3_view4_three_arch_bridge_orthos_scale.png`: Three-arch bridge front elevation (showing all 3 true openings + cutwater piers + `-0.8 m` waterline + `-3.2 m` riverbed), side profile, and 3/4 view with `1.30 m` scale references.

- [ ] **Task 3: Upgrade `MaroBellVerify.cs` for M3 Structural/Arch Verification & Render Godot Views 5–6**
  - Add M3 structural verification to `MaroBellVerify.cs`:
    - Verify presence & non-empty collision of `Maro_M3_ThreeArch_Bridge`, `B01..B12`, `RW01..RW10`, `CW01..CW06`, and `QW01..QW04`.
    - Perform horizontal & vertical raycast verification through all 3 bridge arch openings (`center Z=+217m, X=0m` and flanking `X=±9.8m`) proving they are true 3D structural voids above the `-0.80 m` waterline while the bridge deck above (`Y = +2.75..+3.18 m`) is continuously walkable into `J01 (+3.12 m)`.
    - Rerun full `M2` Player (`1,204/1,204` steps) and Mount (`237/237` steps) controller traversal + new South Approach -> 3-Arch Bridge -> `J01` -> Quay embankment traversal checks.
  - Render Godot 4 Forward+ M3 QA views (`1024px`):
    5. `m3_view5_godot_player_eye_riverfront_bridge.png`: Godot player-eye riverfront and 3-arch bridge approach showing open arch spans, cutwater piers, stone quay walls, and town tier retaining walls rising behind.
    6. `m3_view6_godot_collision_continuity_debug.png`: Godot collision/continuity debug view with 3D labels on `B01..B12` / `RW01..RW10` / `Bridge Arches 1-3`, exported mesh stats, and rerun M2+M3 controller traversal HUD.

- [ ] **Task 4: Submit All 6 M3 Views + Continuity Report to ChatGPT (`pageId: 32`) & Achieve `>= 8.0 / 10` PASS**
  - Visually inspect all 6 downscaled `1024px` views (`read_file`), generate Tailscale preview links, upload to ChatGPT (`pageId: 32`), record `>= 8.0 / 10 PASS` verdict in `gpt-m3-qa-verdict-2026-11-16.md`, update `maro-bell-master-checklist.md`, and request owner sign-off for `M4`.
