---
title: "Maro Bell M2 continuous spline roads curbs stairs welded junctions and navigation"
id: F-226
from_idea: I-311
status: refined
---

# I-311 / F-226: Maro Bell M2 — Continuous Spline Roads, Curbs, Stairs, Welded Junctions & Navigation

## Problem

In `M1 Rev 2` (`F-225`, approved at `8.4 / 10 PASS`), the 420 m circular 9-zone town and 6-sub-terrace hillside layout were established at master-plan graybox level, but ChatGPT's M1 verdict (`gpt-m1-qa-verdict-2026-11-16.md`) and the governing M1–M7 engineering standard (`gpt-m1-m7-engineering-standard-2026-11-16.md`) require **M2** to replace simplified radial road ribbons and block-stair placeholders with a true **continuous spline road, paired-curb, uniform-riser staircase, welded junction, and player-traversal-verified network**.

Specifically:
1. Roads in M1 were straight/piecewise spokes without explicit junction patches, paired raised stone curbs, or organic terrain-hugging S-curves along the southern approach and district boundaries.
2. Steep transitions need explicit uniform-riser stair flights (`riser ~ 0.17–0.19 m`, `tread ~ 0.34–0.38 m`), intermediate landings, and gentle switchback/ramp alternatives (`<= 12°` for streets/mounts, `<= 24°` for stair flights).
3. Exported GLB geometry must be numerically audited for endpoint join continuity (`<= 1 mm`), tangent alignment (`<= 0.5°`), curb height consistency (`<= 5 mm`), and actual player-controller walkability from the South Gate (`+3.0 m`) across all 9 zones up to the Tier 3 Great Bell Sanctuary (`+32.0..+35.0 m`).

## Why now

- `M1 Rev 2` passed ChatGPT Visual QA (`8.4 / 10 PASS`) and received owner sign-off to proceed immediately to `M2`.
- Per the M1–M7 Hard Gate Rule, `M2` must score `>= 8.0 / 10` in ChatGPT Visual QA before `M3` (Continuous Spline Walls, Retaining Arches & 3-Arch Bridge) can begin.

## Proposed direction

1. **Master Road Spline Graph (`blender_maro_m2_roads_stairs.py`):**
   - Author a unified spline graph over the locked `420 m` M1 Rev 2 hillside (`6` sub-terraces) with explicit shared junction nodes (`J_SouthGate`, `J_MarketLower`, `J_MarketUpper`, `J_PlazaSouth`, `J_PlazaWest`, `J_PlazaEast`, `J_PlazaNorth`, `J_CraftSW`, `J_ResNW`, `J_GuildSE`, `J_InnNE`, `J_ShrineE`, `J_SanctuaryLower`, `J_SanctuaryForecourt`, `J_NorthGate`).
   - Introduce subtle organic curvature / lateral offsets and intermediate landings along the Main Southern Boulevard (`16.0 m` wide) while preserving the strong axial framing of the Great Bell Sanctuary recommended by ChatGPT.
   - Generate all secondary concentric & district-boundary streets (`7.5 m` wide) and pedestrian alleys (`4.0 m` wide) by arc-length sampling (`ds <= 1.0 m`) with stable **World-Up (`+Z` in Blender / `+Y` in Godot)** cross-sections: crowned cobble roadbed + left/right raised stone curbs (`0.35 m` wide × `0.18 m` high) + deep skirt foundations (`-1.2 m` into terrain so zero floating edges or light leaks occur under grazing light).
2. **Welded Intersection Patches & Road-to-Stair Transition Plazas:**
   - Generate explicit shared intersection/roundabout/plaza patches at every multi-way junction node where incoming road ribbons and curbs terminate on shared boundary rings (`<= 1 mm` vertex weld tolerance).
3. **Uniform-Riser Stair Flights & Intermediate Landings:**
   - Construct parametric stair flights with uniform risers (`0.175 m`), uniform treads (`0.36 m`), intermediate stone landings every `10–14` steps, and continuous stepped stone balustrades at:
     - `Stair_T1A_to_T1B` (`+4.2 m -> +7.6 m`, with mid-landing and flanking low-slope ramp lanes)
     - `Stair_T1B_to_T2A_Plaza` (`+9.2 m -> +15.0 m`, flared grand approach with intermediate landing)
     - `Stair_T2A_to_T3_Sanctuary` (`+15.0 m -> +32.0 m`, monumental flared 3-flight staircase with 2 intermediate landings and flanking switchback/terrace ramps to `Tier 2B` `+19.0 m` and `Tier 2C` `+23.5 m`)
     - District connector stairs between `Tier 1B <-> Tier 2B <-> Tier 2C <-> Tier 3`.
4. **Exported GLB Numerical Continuity Audit & Godot 4 Traversal Verification (`MaroBellVerify.cs`):**
   - Measure exported mesh continuity directly (`endpoint separation <= 1.0 mm`, `curb height step <= 5.0 mm`, `road slope <= 12.0°`, `stair flight slope <= 24.5°`, `0` raycast gaps along all 9 zone routes).
   - In `MaroBellVerify.cs`, simulate actual ground raycast & player-controller step-up traversal from South Bridge (`Z = +225 m`) -> Central Plaza (`Z = -2 m`) -> Great Bell Sanctuary (`Z = -115 m`) and across all 9 zones, plus render the **6 required M2 QA views** for ChatGPT (`>= 8.0 / 10`).

## Acceptance criteria

- [ ] Master road spline graph + continuous World-Up road/curb cross-section sweep + welded junction patches + uniform-riser multi-flight stairs with landings built in Blender and exported to `game-client/assets/models/env/maro-bell/maro_bell_m1_masterplan.glb` (and `maro_bell_m2_roads_stairs.glb`).
- [ ] Numerical geometry continuity audit passes on exported geometry (`endpoint mismatch <= 1.0 mm`, `tangent mismatch <= 0.5°`, `curb height discontinuity <= 5.0 mm`, `0` vertical air-gaps along all 9 district routes).
- [ ] `MaroBellVerify.cs` verifies 9-zone road/stair walkability and captures all 6 M2 QA views (`m2_view1_topdown_spline_network.png`, `m2_view2_wireframe_junction_closeup.png`, `m2_view3_side_stair_ramp_profiles.png`, `m2_view4_godot_uphill_player_eye.png`, `m2_view5_godot_downhill_player_eye.png`, `m2_view6_godot_collision_nav_debug.png`).
- [ ] ChatGPT Visual QA scores **M2 >= 8.0 / 10 (`PASS`)** on `pageId: 33`.
