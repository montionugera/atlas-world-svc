# F-226 Implementation Plan — Maro Bell M2: Continuous Spline Roads, Curbs, Stairs, Welded Junctions & Navigation

## Goal
Build and verify **Milestone 2 (M2)** of Maro Bell over the locked `420 m` M1 Rev 2 hillside (`6` sub-terraces): a continuous spline-sampled road network with paired World-Up curbs, explicit welded junction/roundabout patches, uniform-riser multi-flight stone staircases with intermediate landings & switchback ramps, numerical mesh-continuity verification (`<= 1 mm` endpoint join, `<= 0.5°` tangent, `<= 5 mm` curb step), and Godot 4 player-controller walkability & collision/navigation debug verification across all 9 zones, achieving **`>= 8.0 / 10` (`PASS`)** in ChatGPT Visual QA.

## Tasks

- [ ] **Task 1: Author Continuous Spline Road, Curb, Stair & Welded Junction Generator (`blender_maro_m2_roads_stairs.py`)**
  - Extend the locked `420 m` M1 Rev 2 hillside scene with an explicit topological road spline graph (`16` shared junction nodes, `22` spline edges covering the `16.0 m` Main Boulevard with organic lateral offsets & intermediate landings, `7.5 m` curved concentric/district streets, and `4.0 m` secondary connectors).
  - Sweep every road edge from arc-length-sampled (`ds = 0.75 m`) **World-Up (`+Z`)** cross-sections: crowned cobble surface + paired raised stone curbs (`0.35 m × 0.18 m`) + deep terrain-embedded foundation skirts (`-1.2 m`), with continuous arc-length UVs (`drift < 0.2%`).
  - Build explicit welded junction discs/patches at every node where spline edges meet (`bmesh.ops.remove_doubles` at `0.5 mm` tolerance at shared boundary rings) and road-to-stair transition landings.
  - Build uniform-riser (`0.175 m` riser, `0.36 m` tread) multi-flight staircases with intermediate landings and continuous stone balustrades for `T1A->T1B`, `T1B->T2A`, `T2A->T3` (3 flights + 2 landings + flanking low-slope switchback ramps `<= 11.8°`), and district terrace connectors.
  - Output a machine-readable numerical geometry continuity report (`m2_geometry_continuity_report.json`) computed directly from the evaluated Blender meshes (endpoint separation `<= 1.0 mm`, tangent mismatch `<= 0.5°`, curb height discontinuity `<= 5.0 mm`, actual road slope distribution `<= 12.0°`, actual stair slope distribution `<= 24.5°`).

- [ ] **Task 2: Render Blender M2 Views 1–3 & Export Validated GLB to Godot (`annotate_maro_m2_views.py`)**
  - Export updated `maro_bell_m1_masterplan.glb` to `game-client/assets/models/env/maro-bell/maro_bell_m1_masterplan.glb`.
  - Render & annotate the Blender views required by ChatGPT M2 QA:
    1. `m2_view1_topdown_spline_network.png`: Top-down annotated road spline graph (`16` junction nodes, road widths `16 m` / `7.5 m` / `4.0 m`, stair flights, switchback ramps, and numerical continuity summary box).
    2. `m2_view2_wireframe_junction_closeup.png`: High-res wireframe + grazing-light close-up composite of a curved road-to-curb-to-stair welded junction (`<= 1 mm` seam tolerance, zero gaps/twists).
    3. `m2_view3_side_stair_ramp_profiles.png`: Orthographic side profiles of all major stair and ramp transitions (`T1A->T1B`, `T1B->T2A`, `T2A->T2B/2C switchbacks`, `T2A->T3 3-flight Grand Staircase`) with measured riser/tread & angle callouts.

- [ ] **Task 3: Upgrade `MaroBellVerify.cs` for M2 Traversal, Collision/Navigation Debug & Godot Views 4–6**
  - Add M2 node-presence, continuous curb/junction mesh checks, and simulated player/mount traversal probes in `MaroBellVerify.cs` (`120` raycast & step-height stations along the full South Gate -> Plaza -> Sanctuary longitudinal route and all 9 district routes, verifying `0` voids, `max step <= 0.22 m` on stairs, `max road slope <= 12.0°`).
  - Render Godot 4 Forward+ M2 QA views:
    4. `m2_view4_godot_uphill_player_eye.png`: Player-eye uphill view along the organically curved & landed Southern Boulevard toward the Central Plaza & Great Bell Sanctuary.
    5. `m2_view5_godot_downhill_player_eye.png`: Player-eye downhill view from the Tier 3 Sanctuary Forecourt (`+32.0 m`) looking down the 3-flight Grand Staircase, Central Plaza (`+15.0 m`), and Southern Boulevard (`+3.0 m`).
    6. `m2_view6_godot_collision_nav_debug.png`: Godot collision/navigation debug overlay showing walkable green road/stair ribbons, cyan curb boundaries, and verified traversal breadcrumb markers across the 9 zones.

- [ ] **Task 4: Submit All 6 M2 Views + Numerical Continuity Report to ChatGPT (`pageId: 33`) & Achieve `>= 8.0 / 10` PASS**
  - Inspect all 6 downscaled `1024px` views (`read_file`), generate Tailscale preview links, upload to ChatGPT (`pageId: 33`), record the `>= 8.0 / 10 PASS` verdict, update `maro-bell-master-checklist.md`, and request owner sign-off for `M3`.
