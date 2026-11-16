# I-315 / F-230 — Maro Bell M5: Romanesque Curved Great Bell Sanctuary, Golden Astrolabe Fountain, and Grand Staircase Landmarks

## Problem

Milestones M1 (`8.4/10 PASS`), M2 (`8.5/10 PASS`), M3 (`8.1/10 PASS`, P1 items closed at `8.3/10`), and M4 (`8.4/10 PASS` in Rev 3) are now locked. In the current Maro Bell 3D masterplan (`maro_bell_m1_masterplan.glb`), the two primary town landmarks — the **Great Bell Sanctuary** on the North Upper Sanctuary Terrace (`+15.6 m` to `+20.0 m`) and the **Central Golden Astrolabe Fountain** in the Central Bell Plaza (`+8.0 m`) — are still represented by early M1/M4 blockout placeholders (`M1_BellSanctuaryArch`, `M1_GreatBell`, `M1_AstrolabeFountain`).

Per ChatGPT's F-224 cross-check and M4 Rev 3 authorization (`gpt-m1-m7-engineering-standard-2026-11-16.md` Section M5 and `gpt-m4-rev3-qa-verdict-2026-11-16.md` Section 6):
- **Shot 4 (Great Bell Sanctuary Arch & Stairs) Failure Modes:** The placeholder reads as a rectangular stone portal with a small bell; it lacks the monumental Romanesque semicircular curved arch, stepped archivolt moldings, recessed stone relief bays, flanking cylindrical/octagonal side bell-towers with blue conical/domed roofs, upper blue-and-gold roof spire silhouette, commanding ornate golden Great Bell + suspension yoke, and flared monumental grand staircase with intermediate landings and stone balustrades.
- **Shot 3 (Central Plaza & Golden Astrolabe Fountain) Failure Modes:** The placeholder astrolabe rings are thin and indistinct from plaza hero cameras; it needs a dominant sculptural multi-ring golden armillary/astrolabe centerpiece with engraved degree ticks, central celestial sun/compass core, tiered carved stone pedestal, lion/spigot water jets, and bronze-gold ornamental finials while preserving the M4-approved radial fountain basin water (`M4_FountainWaterSurface`) and cascade sheets (`M4_FountainCascadeUpper/Lower`).

## Why now

M4 Rev 3 passed ChatGPT Visual QA at `8.4 / 10` (`2026-11-17`) and received owner sign-off. The milestone gate rule (`M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M7`) authorizes M5 next, and M6/M7 depend on the locked landmark silhouettes and sightlines from the Southern Boulevard (`Shot 2`), Central Plaza (`Shot 3`), and Sanctuary Approach (`Shot 4`).

## Proposed direction

1. **Romanesque Curved Great Bell Sanctuary (`M5_BellSanctuary_*` replacing boxy `M1_BellSanctuaryArch` / `M1_GreatBell`):**
   - **Monumental Semicircular Romanesque Archway:** True radial voussoir arch (`R_inner = 7.2 m`, `R_outer = 10.4 m`, springing from `Z = +23.5 m` to crown `Z = +33.9 m` above the `+15.6 m` upper terrace; clear arch opening `14.4 m` wide × `15.5 m` tall) with 3 stepped concentric archivolt rings, carved impost capitals, and deep coffered intrados soffits.
   - **Commanding Golden Great Bell & Suspension Assembly (`M5_GreatBell_*`):** Large ornate bronze-gold bell (`diameter = 5.6 m`, `height = 6.4 m`, flared sound-bow rim, relief waist bands, crown canons, clapper, and heavy timber/gilded-iron headstock yoke suspended from the arch vault at `Z = +26.8 m`) unmistakably readable from both the Sanctuary Staircase (`Shot 4`) and Main Market Boulevard (`Shot 2`).
   - **Upper Blue-and-Gold Spire, Stepped Gable Crown & Flanking Side Towers:** Steep slate-blue tiled gable roof + octagonal lantern belfry spire (`top Z = +48.5 m` with golden finial weathervane), flanked by twin Romanesque side towers (`X = ±13.5 m`, `top Z = +39.0 m`) with arched arcade gallery openings, golden cornice bands, blue conical roofs, androyal-blue hanging sanctuary banners with gold trim.
   - **Monumental Flared Grand Staircase (`M5_SanctuaryGrandStairs` integrated with `ST04` / `J02 -> J03`):** Broad ceremonial flared stone wings, intermediate landing (`Z = +11.8 m`) with twin stone brazier/lantern pedestals, stepped cheek-walls, carved balusters, and handrail piers — preserving exact walkable slope/collision parity along `J02 (0, 36, +8.0m) -> J03 (0, 82, +15.6m)`.
2. **Dominant Sculptural Golden Astrolabe Fountain (`M5_Astrolabe_*` at `(0, 0, +8.0m)`):**
   - **Tiered Carved Limestone & Gold Pedestal:** Octagonal lower basin coping (`R = 8.5 m`, preserving `M4_FountainWaterSurface` and `M4_FountainFoam`), carved fluted central column + intermediate catch-basin bowl (`R = 3.6 m`, `Z = +10.2 m`) with 8 gilded water-spout masks feeding `M4_FountainCascadeUpper/Lower`.
   - **Commanding Multi-Ring Golden Armillary Sphere (`center Z = +15.2 m`, `outer diameter = 7.6 m`, top finial `Z = +20.4 m`):** Interlocking meridian ring (`thickness = 0.42 m`), ecliptic band (`tilted 23.5°`, `width = 0.55 m` with relief zodiac/graduation ribs), equatorial ring, polar axis shaft (`tilted 38°`), radiant golden sun/star burst core (`diameter = 2.1 m`), and ornate cardinal pointer finials — reading clearly as the civic centerpiece in `Shot 3`.
3. **6-View M5 Visual QA Package + Godot 4 Runtime & Regression Verification:**
   - **View 1 (`m5_view1_sanctuary_ortho_front_side.png`):** 2-panel Orthographic Front & Side sheet of the Great Bell Sanctuary + Grand Staircase with metric dimension callouts and `1.30 m` player scale reference.
   - **View 2 (`m5_view2_astrolabe_ortho_closeup.png`):** 2-panel Orthographic & 3/4 Closeup of the Golden Astrolabe Fountain with M4 basin water/cascades and `1.30 m` player scale reference.
   - **View 3 (`m5_view3_south_boulevard_hero_shot2.png`):** Southern Market Boulevard (`Shot 2` camera) looking north toward the Astrolabe and towering Great Bell Sanctuary silhouette.
   - **View 4 (`m5_view4_central_plaza_astrolabe_shot3.png`):** Central Bell Plaza (`Shot 3` hero camera) framing the dominant Golden Astrolabe Fountain, radial water basin, and Sanctuary backdrop.
   - **View 5 (`m5_view5_sanctuary_arch_stairs_shot4.png`):** Sanctuary Approach & Grand Staircase (`Shot 4` hero camera + `1.30 m` player scale marker) showing the curved Romanesque arch, Great Bell suspension, blue/gold spire, and flared staircase.
   - **View 6 (`m5_view6_arch_bell_support_closeups_qa.png`):** 3-panel structural closeup (Archivolt/Voussoir & Bell Yoke Support + Stair Balustrade/Landing + Godot 4 Uncapped GPU/CPU & M1–M4 Navigation Regression HUD).

## Acceptance criteria

- [ ] Build `blender_maro_m5_landmarks.py` to generate the full Romanesque Curved Great Bell Sanctuary (`M5_BellSanctuary_*`, `M5_GreatBell_*`, `M5_SanctuaryGrandStairs_*`) and dominant Golden Astrolabe Fountain (`M5_Astrolabe_*`) inside `maro_bell_m1_masterplan.glb` while preserving all M1–M4 terrain, road, wall, bridge, and water locks.
- [ ] Extend `MaroBellVerify.cs` with M5 landmark structural, bounding-box, material, and sightline assertions while maintaining `100%` pass on all M1–M4 navigation (`J01..J16`, `1,204/1,204` Player steps, `237/237` Mount steps, `93/93` Bridge steps) and uncapped GPU performance (`<= 25.0 ms`) gates.
- [ ] Render all 6 required M5 QA views (`1600x1200` raw -> `1024x768` annotated via `annotate_maro_m5_views.py`) and pass real ChatGPT Visual QA (`>= 8.0 / 10`) on `pageId: 29` + owner sign-off.
