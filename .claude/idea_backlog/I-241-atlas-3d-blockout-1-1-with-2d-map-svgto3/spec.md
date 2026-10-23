---
title: "Atlas 3D blockout 1:1 with the 2D map: real shapes, sea, mountains, distinct silhouettes"
id: I-241
status: idea
---

# Atlas 3D blockout aligned 1:1 with 2D (owner feedback 2026-10-23)

## Problem

Owner: "3D look not aligned with the map (location, shape); it should represent building / dungeon / mountain / high land / sea." In `scripts/catalog_explorer_web.py`, `buildAtlas3dBlockoutScene()` (about line 8222) draws 3 hardcoded rectangular boxes (`C01_Hearthbloom_Basin_Plateau`, `C02_Clockwork_Steppe_Mesa`, `C03_Shattered_Sky_Halo_Caldera`) and 9 generic 11x11 cubes at arbitrary (x, z). None of them line up with the 2D map (viewBox 1040x500), and there is no sea, no mountain, and no distinction between towns, towers and dungeons.

Constraints: keep the `.glb` export (`exportAtlasBlockoutGlb`), the V-6 and V-7 mesh-count and ground-mesh contracts, click and double-click selection and drill-in (Town buildings, Dungeon cutaway), and all V-1..V-10 probes passing. Ruler scale is unchanged (384.6 m per unit).

## Sketch

- One projection helper `svgTo3dWorld(svgX, svgY) -> { x: (svgX - 520) * 0.25, z: (svgY - 250) * 0.25 }` (x in [-130, 130], z in [-62.5, 62.5]). Every continent, every one of the 13 `ATLAS_OVERLAND_LANDMARK_ANCHORS`, every zone, boss pin and highway uses it.
- A sea plane `Sea_Ocean_Basin` at y = 0 with a deep navy/teal look.
- Extrude the real 2D continent polygons (`polyPts` in 3D coordinates) with stepped plateaus (C01 basin and coastal shelf, C02 terraced highland mesa, C03 high caldera ring with central abyss), plus stepped mountain and ridge meshes at the mountain zones (Dragonspine Cog, Cloud-Halo, Brass-Spur Ridge, Astrolabe Rift, northern caldera).
- Draw roads and sea bridges between the landmarks, following terrain height.
- Distinct silhouettes by type: town/castle/fortress as a walled compound (curtain wall, 4 corner towers, stepped keep, banner); tower as a tall tiered spire with glowing rings; dungeon/catacomb/lair as a sunken entrance crater or stepped crypt with a gate arch; windmill, harbor pier and field markers where they apply.

## Acceptance criteria

- [ ] `svgTo3dWorld` exists, and all 13 `ATLAS_OVERLAND_LANDMARK_ANCHORS` land in the scene within 0.5 units of `svgTo3dWorld(anchor.x, anchor.y)`; zones, boss pins and roads use the same helper.
- [ ] The 3D continents are extruded from the same polygons as the 2D map (no hardcoded rectangles remain), and a sea plane is present.
- [ ] Mountain or highland geometry exists at the named mountain zones and is distinguishable from plains.
- [ ] Castle/town, tower and dungeon/catacomb landmarks use three visibly different geometries (asserted by distinct mesh signatures, and checked by screenshot).
- [ ] Click selects a landmark POI and double-click still drills into Town or Dungeon; `.glb` export still works; V-6 and V-7 contracts hold.
- [ ] V-12 is added to `scripts/probes/atlas_ux_probe.py` (and the 13-landmark alignment assertion to `scripts/probes/atlas_zoom_drift_check.mjs`) and each assertion is shown failing on the pre-change code; V-1..V-11, `tests/test_studio_web_perspectives.py`, the phone/touch audit probe and Gate 1 pass.
- [ ] Headless Chrome screenshots at 1440x900 and 1080x810 of 2D Crisp Vector, 2D OpenLayers and 3D Blockout are viewed side by side and the 3D positions and shapes match the 2D map.
