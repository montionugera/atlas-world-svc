---
title: "Atlas unified spatial engine UX-8..UX-14 (OL vendored, 3D picking, town-only shops)"
id: I-233
status: idea
---

# Atlas cross-engine full parity across 2d_svg, 2d_ol, and 3d_map3d + 3D DPR & Safari hardening (Waves 3, 4 & 5)

## Problem

While overland continents, 63 zone pins, 13 landmarks, and highways are aligned across `2d_svg`, `2d_ol`, and `3d_map3d` (F-154..F-161), four cross-engine parity gaps remain:
1. **OpenLayers (`2d_ol`) missing overland layers (Wave 3):**
   - `mountRealOpenLayersInstance` plots the 63 zone pins, labels, highways, and ruler, but omits the 12 `ATLAS_OVERLAND_MOB_PINS` (Monster / Mini-Boss / Raid / MVP spawn pins), the active `D17` BFS travel route path + hop badges, and the active `D9` 6-race growth route.
   - When drilling into Town / Field / Dungeon while `ATLAS_ENGINE_MODE === '2d_ol'`, `getAtlasEffectiveEngineMode()` falls back to `2d_svg` without surfacing a clear sub-map mode indicator in the HUD.
2. **3D Blockout (`3d_map3d`) missing route ribbons, `field` tactical context, and on-canvas labels (Wave 4):**
   - `buildAtlas3dBlockoutScene` builds `overland`, `town`, and `dungeon` scenes, but has no dedicated `field` tactical scene when `resolveActiveFieldOrFortEntry()` is active, and does not render active `D17` BFS travel routes or `D9` race growth routes in 3D.
   - `3d_map3d` lacks on-canvas projected 2D landmark labels / hover callouts so users cannot read town/dungeon names without clicking each mesh.
3. **3D HiDPI (`DPR`) budget & mobile Safari viewport hygiene (Wave 5):**
   - High-DPR displays (`devicePixelRatio > 2`) can multiply 3D canvas fill cost; DPR should be capped at 2 with `100dvh` / `safe-area-inset` support on mobile viewports.

## Why now

Completes the unified spatial engine contract so `2d_svg`, `2d_ol`, and `3d_map3d` expose the same actionable information across all spatial contexts and viewports.

## Sketch

- **Wave 3 (`2d_ol`):** Add `mobPinLayer` (`ATLAS_OVERLAND_MOB_PINS` filtered by `fFilter` and level band, clickable + 44x44 coarse-pointer hit area) and `routeLayer` (`D17` BFS route + `D9` race growth route splines and numbered hop/stage badges) to `mountRealOpenLayersInstance`, plus a HUD badge when `2d_ol` delegates sub-map blueprints to 2D vector.
- **Wave 4 (`3d_map3d`):** Add `context === 'field'` tactical blockout scene (terrain pad, spawn territory rings, boss/mob pillars, portal gate markers) to `buildAtlas3dBlockoutScene`; extrude elevated 3D route ribbons + hop beacons when `ATLAS_ROUTE_PLANNER_OPEN` or a race growth route is active; draw projected 2D landmark label pills and hover callout on `#atlasMap3dCanvas`.
- **Wave 5 (Performance & Mobile Guard):** Cap `#atlasMap3dCanvas` backing-store DPR at `Math.min(window.devicePixelRatio || 1, 2)` and add `100dvh` / `safe-area-inset` layout rules.

## Acceptance criteria

- [ ] In `2d_ol`, `ATLAS_OVERLAND_MOB_PINS` render on a dedicated vector layer (`atlasRole='mob_pins'`) respecting active tier and level-band filters, and clicking/tapping selects the mob pin POI (within 44x44 px on coarse pointers).
- [ ] In `2d_ol` and `3d_map3d`, opening the BFS Route Planner (`ATLAS_ROUTE_PLANNER_OPEN`) or selecting a Race Growth Route renders the route segments and hop/stage markers matching `2d_svg`.
- [ ] In `3d_map3d`, entering a Field / Fortress tactical blueprint (`focusFieldTacticalBlueprint` / `focusFortressBlueprint`) builds a `context === 'field'` 3D tactical scene with pickable spawn/fortress meshes, and overland 3D renders projected landmark labels + hover callout with DPR capped at `<= 2`.
- [ ] `V-14` is added to `scripts/probes/atlas_ux_probe.py` and matching live assertions to `scripts/probes/atlas_zoom_drift_check.mjs`; `tests/test_studio_web_perspectives.py`, all probes, and Gate 1 pass.
