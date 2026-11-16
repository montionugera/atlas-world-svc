---
title: "Maro Bell M3 continuous spline retaining walls bastions three-arch bridge and canal edge"
id: I-312
status: idea
---

# I-312 / F-227: Maro Bell M3 — Continuous Spline Retaining Walls, Bastions, True 3-Arch Stone Bridge & Canal Edge Integration

## Problem

In `M1 Rev 2` (`F-225`, `8.4 / 10 PASS`) and `M2 Rev 2` (`F-226`, `8.5 / 10 PASS`), the 420 m circular 9-zone town, 6-sub-terrace hillside (`+3.0 m` to `+35.0 m`), and continuous spline road/curb/stair network (`J01..J16`, `22` edges, `3` multi-flight staircases) were approved, but outer fortifications, terrace retaining walls, river embankments, and the southern approach crossing still use simplified M1 placeholder ribbons/slabs.

Per ChatGPT's M2 verdict (`gpt-m2-qa-verdict-2026-11-16.md`) and the governing M1–M7 engineering standard (`gpt-m1-m7-engineering-standard-2026-11-16.md`), **M3** must replace placeholder wall ribbons and bridge blocks with a continuous, spline-driven structural masonry system:
1. **Retaining-wall attachment:** Derive wall alignment, deep terrain foundations (`-2.0 m` skirt), and crest elevations directly from the locked M2 road-edge and M1 6-sub-terrace coordinates (`T1A +3.12..+4.35 m`, `T1B +7.68..+9.28 m`, `T2A +15.05 m`, `T2B +18.85..+19.85 m`, `T2C +22.85..+23.35 m`, `T3 +32.10..+34.65 m`).
2. **Continuous curved walls & retaining arches:** Sweep battered ashlar stone bases, shared-pier retaining blind/open semicircular arches (`true 3D recessed/open arch bays`, zero decorative flat textures), cornice moldings, and parapet copings along smooth Catmull-Rom curves with designed corner transitions (`<= 1.0 mm` endpoint seam tolerance, `<= 0.5°` tangent alignment).
3. **Battlements and bastions:** Snap crenelated battlements (integer module distribution by arc-length) and cylindrical/octagonal corner bastions (`B01..B12`) to structural wall geometry using explicit welded junction collars.
4. **True three-arch stone bridge (`Zone 9 South Gate`):** Build physically open semicircular stone arches (`3` spans across the `26 m` river channel), pointed cutwater stone piers rooted to the `-3.2 m` riverbed, continuous cambered cobble deck + parapets, and terrain-integrated North/South bank abutments welding cleanly into `J01 (+3.12 m)` and the South Approach Road.
5. **River and canal edge:** Sculpt recessed stone quay walls, stepped waterfront embankments, and watertight bridge-bank junctions matching the approved M1 waterline (`-0.8 m` water surface, `-3.2 m` riverbed) with zero exposed foundation gaps or floating masonry.
6. **Geometry QA & Godot 4 Regression:** Export `m3_wall_bridge_continuity_report.json` + update `maro_bell_m1_masterplan.glb` + rerun `[MaroBellVerify]` Player (`1,204/1,204`) & Mount (`237/237`) controller regression tests + M3 bridge/quay traversal and wall/bastion collision checks, and pass ChatGPT Visual QA (`>= 8.0 / 10`) across all 6 required M3 views.

## Why now

- `M2 Rev 2` passed ChatGPT Visual QA (`8.5 / 10 PASS`) and received owner sign-off to ship `F-226` (`00f9b1a8b`) and proceed immediately to `M3`.
- Per the M1–M7 Hard Gate Rule, `M3` must score `>= 8.0 / 10` in ChatGPT Visual QA before `M4` (A-Grade Stylized River, Fountain & Waterfall System in Godot 4 Forward+) can begin.

## Proposed direction

1. **Continuous Spline Wall, Retaining Arch & Bastion Generator (`blender_maro_m3_walls_bridge.py`):**
   - Load the locked `M2 Rev 2` scene (`M1` terrain + `M2` spline roads, curbs, stairs, and `J01..J16` junctions), remove placeholder M1 outer wall/bridge blocks (`Maro_M1_Walls_And_Bridge`), and generate the `Maro_M3_Walls_Bastions_Bridge` collection from authoritative terrace and road-edge splines.
   - Build **Outer Curtain Fortification Walls** (`W_Outer_SW`, `W_Outer_West`, `W_Outer_NW`, `W_Outer_NE`, `W_Outer_East`, `W_Outer_SE`) with battered ashlar base (`-2.5 m` foundation skirt into cliff/terrain), cornice stringcourse, walkway, and arc-length-redistributed crenelated battlements, linked at **`12` explicit Bastion/Gate Tower nodes (`B01..B12`)** (`B01_SouthGate_W`, `B02_SouthGate_E`, `B03_Harbor_SW`, `B04_Craft_W`, `B05_Res_NW`, `B06_Sanctuary_NW`, `B07_NorthGate_W`, `B08_NorthGate_E`, `B09_Sanctuary_NE`, `B10_Inn_NE`, `B11_Shrine_E`, `B12_Guild_SE`) with welded tangent-matched junction collars (`0.000 mm` endpoint gap).
   - Build **6-Sub-Terrace Retaining Arches & Parapet Walls** (`W_Ret_T1A_T1B`, `W_Ret_T1B_T2A_W`, `W_Ret_T1B_T2A_E`, `W_Ret_T2A_T2B_W`, `W_Ret_T2A_T2B_E`, `W_Ret_T2B_T2C_W`, `W_Ret_T2B_T2C_E`, `W_Ret_T2C_T3_W`, `W_Ret_T2C_T3_E`, `W_Sanctuary_Citadel_Arc`) derived directly from the M2 road/plaza outer edges, with shared-pier 3D semicircular retaining arch bays (`0.65 m` recessed/open structural bays, `1.20 m` shared battered piers, `-2.0 m` foundation skirts, and `+0.95 m` stone safety parapets above upper terrace road level) terminating cleanly into stairwing cheek-walls at `Stair01`, `Stair02`, `Stair03`, and district stairs.
   - Build the **True Three-Arch Stone Bridge (`Maro_M3_ThreeArch_Bridge`)** across the southern river channel (`Y = -238 m` to `-196 m` in Blender / `Z = +196 m` to `+238 m` in Godot):
     - Three physically open semicircular stone arch vaults (`center span 9.2 m`, `flanking spans 7.4 m`, `arch ring thickness 0.65 m` with radially oriented voussoir blocks and keystone).
     - Two pointed hydrodynamic **cutwater piers** (`P1`, `P2`) rooted to `-3.6 m` (below the `-3.2 m` riverbed) with stepped plinths at the `-0.8 m` M1 waterline.
     - Continuous cambered cobble bridge deck (`16.0 m` clear roadway width + `2 × 0.35 m` curbs + `2 × 0.55 m` stone parapets with refuge bays over cutwaters), welding at the north abutment directly into `J01 (+3.12 m)` (`0.000 mm` seam) and at the south abutment into the South Approach Road (`+2.40 m`).
   - Build **River & Canal Stone Quay Embankments (`W_Quay_NorthBank_W`, `W_Quay_NorthBank_E`, `W_Quay_SouthBank_W`, `W_Quay_SouthBank_E`)** along the `-0.8 m` waterline and `-3.2 m` riverbed with recessed stone mooring steps, drainage culvert arches, and watertight wingwall collars welded to the bridge abutments.
2. **Numerical Continuity Report & 6-View M3 QA Package (`annotate_maro_m3_views.py` + `MaroBellVerify.cs`):**
   - Compute `m3_wall_bridge_continuity_report.json` directly from evaluated Blender meshes (wall-to-bastion seam `<= 1.0 mm`, tangent mismatch `<= 0.5°`, arch bay openings `100%` unobstructed 3D geometry, foundation embedment `>= 1.5 m` everywhere, `0` degenerate triangles).
   - Extend `MaroBellVerify.cs` to verify M3 nodes (`Maro_M3_Walls_Bastions_Bridge`, `Maro_M3_ThreeArch_Bridge`, `B01..B12`, retaining walls, quay walls), verify physical raycast clearances underneath all 3 bridge arch openings (`waterline Y = -0.80 m` unimpeded through all 3 arch spans) and over the bridge deck into `J01`, re-run the full `1,204`-step Player Controller and `237`-step Mount Controller regression suites (`0` stuck states, `0` wall encroachments on M2 routes), and render Godot views `5` and `6`.

## Acceptance criteria

- [ ] `blender_maro_m3_walls_bridge.py` generates continuous spline outer curtain walls, `B01..B12` bastions with welded collars, 6-sub-terrace shared-pier retaining arch walls derived from M2 road edges, stone river quay embankments, and the true 3-arch semicircular stone bridge, exporting `maro_bell_m1_masterplan.glb` (`maro_bell_m3_walls_bridge.glb`) and `m3_wall_bridge_continuity_report.json`.
- [ ] `MaroBellVerify.cs` passes all M1 + M2 (`1,204/1,204` Player steps, `237/237` Mount steps) + M3 verification checks (3 physical bridge arch openings verified by through-arch water/clearance raycasts, continuous bridge-to-`J01` deck weld, bastion/retaining-wall collision integrity, zero route encroachment).
- [ ] All 6 required M3 views (`m3_view1_topdown_wall_bridge_network.png`, `m3_view2_grazing_retaining_wall_road_interfaces.png`, `m3_view3_wireframe_bastions_arches_transitions.png`, `m3_view4_three_arch_bridge_orthos_scale.png`, `m3_view5_godot_player_eye_riverfront_bridge.png`, `m3_view6_godot_collision_continuity_debug.png`) are rendered, downscaled to `1024px`, inspected, and staged in `game-client/studio-cache/renders/gpt-crosscheck/`.
- [ ] ChatGPT Visual QA (`pageId: 32`) scores **M3 >= 8.0 / 10 (`PASS`)** and owner approves advancing to `M4`.
