---
title: "Maro Bell M1: circular 9-zone 3-tier hillside, recessed river channel, and outer valley master plan"
id: I-310
status: idea
---

# Maro Bell M1: Circular 9-Zone 3-Tier Hillside, Recessed River Channel, and Outer Valley Master Plan

## Problem

In `F-224`, ChatGPT Visual QA scored the Maro Bell 3D build `3.0 / 10` (`Terrain & 3-tier hillside silhouette: 1.5/10`, `Town plan, curved fortifications & valley: 2.0/10`, `Bird's-Eye Nine-Zone Town: 2.0/10`) and rejected it for visual art-direction sign-off because:
1. The town footprint is a flat `80m × 160m` rectangular slab (`terrainAmplitude: 0`, `PlaneMesh(160, 240)`) instead of a broadly circular, terraced 3-tier hillside town wrapped around a central plaza.
2. The three distinct elevation tiers (Waterfront/Lower Market -> Central Circular Plaza & Mid-Ring Districts -> Upper Great Bell Sanctuary Acropolis) are missing or flattened to `Y = 0`.
3. The river is a flat cyan box sitting on top of the ground rather than a recessed curved river channel wrapping the southern/western perimeter with cliff waterfalls and plunge pools.
4. Outer walls and roads were placed as disconnected straight props rather than continuous curved ribbons sweeping around a circular hillside perimeter, and the background horizon is flat instead of enclosed by wooded cliffs, an upper aqueduct, and distant alpine mountains.

## Why now

The owner and ChatGPT mandated a strict milestone-gated rebuild (`M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M7`) governed by `gpt-m1-m7-engineering-standard-2026-11-16.md`. **Milestone 1 (`M1 — Town & Terrain Master Plan`)** is the foundational geometric master plan from which all subsequent continuous spline roads (`M2`), continuous curved walls/arches/bridge (`M3`), Forward+ river/waterfalls (`M4`), landmarks (`M5`), modular hero houses (`M6`), and district assembly (`M7`) derive. Nothing in `M2–M7` may proceed until `M1` achieves `>= 8.0 / 10` in ChatGPT Visual QA across the 4 mandatory views and receives owner sign-off.

## Engineering Design & Master Geometry (`M1`)

### 1. Coordinate & Scale Convention (`World Scale Prototype D`)
- **Units:** `1.0 unit = 1.0 meter` across Blender (`Z-up`) and Godot 4 (`Y-up`, `-Z = North`, `+Z = South`, `+X = East`, `-X = West`).
- **Prototype D Scale Reference (`11-atlas-cala-knight-town-design-board.png`):**
  - Player reference marker (`D`): **`1.30 m` tall** (`4.7 heads`)
  - Main doors: **`3.0 – 3.5 m`** (`~3.2 m`)
  - 1-story house massing: **`5.0 – 7.0 m`** (`~6.0 m`)
  - 2-story house massing: **`11.0 – 14.0 m`** (`~12.0 m`)
  - Civic / Guild Hall massing: **`15.0 – 25.0 m`** (`~24.0 m`)
  - Landmark (Great Bell Sanctuary Tower): **`30.0 – 80.0+ m`** (`~42.0 m` structure height above Tier 3 terrace, reaching `Y = +57.0 m` world altitude)
  - Main boulevard width: **`12.0 – 18.0 m`** (`14.0 m` clear carriageway)
  - Residential / radial street width: **`6.0 – 8.0 m`** (`7.0 m`)
  - Central Circular Plaza diameter: **`56.0 m`** (`50 – 80 m` target)
  - Circular fortified town playable diameter: **`168.0 m` inner walled diameter** (`R = 84.0 m` circular/oval curtain wall ring) inside a **`520.0 m × 520.0 m`** sculpted valley, cliff, waterfall, and alpine mountain basin.

### 2. Three-Tier Stepped Hillside Elevation Architecture
1. **Recessed River Channel & Plunge Basins (`Y = -4.8 m` riverbed floor, `Y = -2.2 m` water plane):**
   - Sculpted curving river valley wrapping the **West, Southwest, South, and Southeast** outer perimeter of the circular town mound (`R = 92 m .. 118 m` from town center).
   - Fed by the **Northwest High Cliff Waterfall** (`Y = +32.0 m -> -2.2 m`) and **Eastern Cliff Waterfall** (`Y = +26.0 m -> -2.2 m`), with a **Southwest Cascade Step** into the southern main river channel crossed by the South Gate 3-arch stone bridge.
2. **Tier 1 — Southern Waterfront Quay, South Gate & Lower Market Ring (`Y = +1.5 m` to `+3.2 m`):**
   - Southern Arrival Bank (`Z = +112 m .. +96 m, Y = +1.2 m`), 3-Arch Stone Bridge (`Z = +96 m .. +76 m`, crown `Y = +2.8 m`), and **Zone 9 South Gate (`Z = +76 m, Y = +2.0 m`)**.
   - **Zone 2 Market District Boulevard** ascending from `Z = +72 m (Y = +2.0 m)` to `Z = +26 m (Y = +4.2 m)`, flanked by lower terraces of **Zone 3 (Crafting Quarter SW, `Y = +3.0 m`)** and **Zone 5 (Adventurer's Guild SE, `Y = +3.0 m`)**.
3. **Tier 2 — Central Circular Plaza & Mid-Hillside District Ring (`Y = +6.5 m` to `+9.0 m`):**
   - Connected to Tier 1 by a continuous curved stone retaining wall (`H = 3.5 m`) and wide stepped boulevard ramp (`Z = +26 m .. +18 m`).
   - Centered on **Zone 1 Central Great Bell Plaza (`X = 0, Z = -2 m, Y = +6.5 m`, diameter `56 m`)** with the Golden Astrolabe Fountain massing at center (`X = 0, Z = -2 m`).
   - Radial streets (`7.0 m` wide) branch outward to the mid-hillside districts:
     - **Zone 3 Crafting Quarter (W/SW, `X = -46 m, Z = +16 m, Y = +6.2 m`)**
     - **Zone 4 Residential Area (NW, `X = -44 m, Z = -22 m, Y = +8.5 m`)**
     - **Zone 5 Adventurer's Guild (E/SE, `X = +46 m, Z = +12 m, Y = +6.8 m`)**
     - **Zone 6 Inn & Tavern (NE, `X = +44 m, Z = -22 m, Y = +8.5 m`)**
     - **Zone 7 Shrine & Records (Far East Cliff Bastion Terrace, `X = +74 m, Z = +4 m, Y = +7.5 m`)**
4. **Tier 3 — Upper Great Bell Sanctuary Acropolis & North Gate Crown (`Y = +15.0 m` to `+16.5 m`):**
   - Connected to Tier 2 by a curved upper retaining wall (`H = 8.5 m` with Romanesque blind-arch bays) and the **Monumental Flared Grand Staircase** (`Z = -22 m .. -38 m`, width flaring from `18 m` to `26 m`, rising from `Y = +6.5 m` to `Y = +15.0 m`).
   - Crowns the northern crescent (`Z = -38 m .. -82 m, Y = +15.0 m`), supporting the **Great Bell Sanctuary Landmark** (`X = 0, Z = -52 m, Y = +15.0 m`, height `42.0 m` to spire tip `Y = +57.0 m`), flanking colonnades & windmills (`NW` and `NE` ridges), and **Zone 8 North Gate (`X = 0, Z = -82 m, Y = +15.5 m`)** leading out to the northern mountain pass.
5. **Perimeter Wooded Cliffs, High Aqueduct & Distant Mountain Silhouette Ring (`Y = +26 m` to `+115 m`):**
   - Steep tiered limestone cliffs enveloping the NW, N, and E valley walls (`R = 125 m .. 190 m`, `Y = +26 m .. +44 m`), spanned on the NE/N ridge by a monumental multi-arch stone aqueduct (`Y = +32 m`) and crowned on the distant N/NE crest by an upper acropolis citadel silhouette (`Y = +68 m .. +95 m`) and surrounding alpine peaks (`R = 200 m .. 260 m`, `Y = +75 m .. +115 m`).

### 3. Nine-Zone Spatial Table (Matching `11-atlas-cala-knight-town-design-board.png`)

| Zone # | Canonical Name | World Center `(X, Y, Z)` | Tier | Footprint / Scale Target |
|---|---|---|---|---|
| **①** | **Great Bell Plaza (Central Hub & Sanctuary Axis)** | `(0, +6.5, -2)` Plaza & `(0, +15.0, -52)` Sanctuary | Tier 2 & Tier 3 | `56m` circular plaza + `42m` tall Sanctuary landmark |
| **②** | **Market District** | `(0, +3.0, +46)` | Tier 1 | `14m` wide main boulevard (`Z=+70..+24`) + `12m` 2-story shop massings |
| **③** | **Crafting Quarter** | `(-46, +6.2, +16)` | Tier 1–2 SW | Forge courtyard, smithy workshops (`6–12m`), SW windmill ridge |
| **④** | **Residential Area** | `(-44, +8.5, -22)` | Tier 2 NW | Stepped curved streets (`7m` wide), `6–12m` 1 & 2-story houses |
| **⑤** | **Adventurer's Guild** | `(+46, +6.8, +12)` | Tier 1–2 E | `24m` tall Civic/Guild Hall + courtyard & quest pavilion |
| **⑥** | **Inn & Tavern** | `(+44, +8.5, -22)` | Tier 2 NE | `14m` 2-story Inn complex + garden terrace overlooking plaza |
| **⑦** | **Shrine & Records** | `(+74, +7.5, +4)` | Tier 2 Far E | Eastern cliffside overlook sanctuary & archive pavilion |
| **⑧** | **North Gate (to Wilds)** | `(0, +15.5, -82)` | Tier 3 N | Twin-tower northern gatehouse & highland road exit |
| **⑨** | **South Gate (to Region)** | `(0, +2.0, +76)` | Tier 1 S | Twin-tower southern gatehouse + 3-arch stone river bridge (`Z=+76..+98`) |

## Acceptance Criteria

- [ ] Parametric Blender `M1` Master Plan generator (`/Users/pasitnusso/asset-studio-private/atlas-3d-plan/tools/blender_maro_m1_masterplan.py`) runs cleanly in Blender 4.5 (`blender --background --python`) and exports both the master `.blend` scene and validated `maro_bell_m1_masterplan.glb` (`1.0m` unit scale, `Y-up` glTF, all transforms applied).
- [ ] Replaces the rectangular `80×160` flat slab with the broadly circular 9-zone, 3-tier hillside town (`Tier 1 Y=+1.5..+3.2m`, `Tier 2 Y=+6.5..+9.0m`, `Tier 3 Y=+15.0..+16.5m`), recessed curving river channel (`Y=-4.8m` bed, `Y=-2.2m` water), continuous curved outer fortification placeholder ribbon, perimeter waterfall cliffs, high aqueduct, and distant alpine mountain bowl.
- [ ] Generates and verifies all **4 mandatory `M1` QA views**:
  1. Orthographic Top-Down view annotated with all 9 zones (`①–⑨`), metric dimensions (`m`), elevation contours, north arrow, and `1.30 m` player-scale markers.
  2. Three-quarter Bird's-Eye Aerial view matching approved Shot 5 (`11-atlas-cala-knight-town-design-board.png`).
  3. Side-Section / Elevation Profile view with exact tier heights (`m`), riverbed depth, cliff elevations, and road/stair ascent grades.
  4. Godot 4 Forward+ Player-Eye view (`1.30 m` eye height) from the southern bridge approach looking north up the 3 tiers toward the Great Bell Sanctuary massing.
- [ ] Submits the 4 `M1` views + dimensional metadata to the active ChatGPT QA thread (`Atlas: The Cala Knight`, prefixed `from @claudia`) and iterates until ChatGPT awards **`PASS (>= 8.0 / 10)`** on `M1`, then updates `maro-bell-master-checklist.md`.
