---
title: "Atlas zone loc vs pin mismatch: zone loc projects far from drawn pin (e.g. Lantern Hollow loc->(158,454), pin (432,422)); ruler scale 384.6 m/unit confirmed vs F-045 400km model"
id: F-162
status: refined
from_idea: I-236
---

# Atlas canonical 63-zone coordinate truth + OpenLayers phone zoom-control hygiene (Waves 1 & 2)

## Problem

1. **Zone `loc_coord` vs drawn pin drift (up to 318 px across 36 of 63 zones):**
   - `registerAtlasOverlandPinAnchors` only registers the 13 `overlandLandmarks` into `ATLAS_OVERLAND_PIN_ANCHORS`, leaving 50 of the 63 zones (`getAtlasPlacedZonePoints`) unregistered.
   - `renderDedicatedWorldAtlas` (`scripts/catalog_explorer_web.py` L21226) maintains a duplicate hardcoded 14-entry `zoneSvgAnchorMap` that drifts by up to 190 px from `getAtlasPlacedZonePoints` (e.g. `zone-dungeon-spice-kiln-cellar` at `(342,352)` vs `(152,365)`).
   - `D17` BFS route hops, `D9` race growth waypoints, `#studioL2Crosshair`, and `D30..D90` overlays call `clampWorldLocCoord(loc)` directly for non-landmark zones, plotting badges and lines up to 258 px away from the drawn zone pin (often in the sea or on the wrong continent).
2. **OpenLayers phone `.ol-zoom` overlap (follow-up from F-160/F-161):**
   - At phone widths (`390x844`, `375x812`) in `2d_ol`, OpenLayers' built-in `.ol-zoom` (`left:13..37, top:305..352`) sits directly underneath `#atlasHudToggleBtn` (`left:17..61, top:309..353`), while `#atlasOlToolbarPanel` and the HUD already provide dedicated zoom controls.
   - `scripts/probes/atlas_ux_probe.py` does not accept `--url` for live server checks.

## Why now

Waves 3–5 (OpenLayers & 3D route/overlay parity) depend on a single, 0 px-drift coordinate source of truth across all 63 zones, while fixing `.ol-zoom` completes the phone touch audit (`L5`).

## Sketch

- Register all 63 zones from `getAtlasPlacedZonePoints(tatlas, zones)` into `ATLAS_OVERLAND_PIN_ANCHORS` by `zone_id`, `studio_node_id`, and `loc_coord` (preserving the 13 landmark anchors and the 384.6 m/unit ruler scale).
- Remove the duplicate 14-entry `zoneSvgAnchorMap` in `renderDedicatedWorldAtlas` and resolve all `D9` growth waypoints, `D17` BFS route hops, and zone-bound overlay projections through `getAtlasPlacedZonePoints` / `resolveAtlasFocusLoc`.
- Suppress OpenLayers' redundant built-in `.ol-zoom` and `.ol-attribution` controls (`controls: []` in `mountRealOpenLayersInstance` plus CSS hide on `.ol-zoom, .ol-attribution, .ol-rotate`) so `#atlasHudToggleBtn` and `#atlasLegendToggleBtn` never collide with `.ol-zoom`.
- Accept `--url` in `scripts/probes/atlas_ux_probe.py`.

## Acceptance criteria

- [ ] Every one of the 63 zones in `getAllAtlas63Zones` is registered in `ATLAS_OVERLAND_PIN_ANCHORS`, and `resolveAtlasFocusLoc(z.loc_coord, z.zone_id)` matches `getAtlasPlacedZonePoints()[z.zone_id]` with 0 px drift.
- [ ] The duplicate hardcoded 14-entry `zoneSvgAnchorMap` in `renderDedicatedWorldAtlas` is removed; `D9` race growth waypoints and `D17` BFS route planner hops land at 0 px drift from `getAtlasPlacedZonePoints()[zoneId]`.
- [ ] In `2d_ol` at `375x812` and `390x844`, no `.ol-zoom` control overlaps `#atlasHudToggleBtn` or `#atlasLegendToggleBtn` (asserted by new check `L5` in `scripts/probes/atlas_phone_touch_audit.mjs`).
- [ ] `V-13` is added to `scripts/probes/atlas_ux_probe.py` and matching assertions to `scripts/probes/atlas_zoom_drift_check.mjs`; `tests/test_studio_web_perspectives.py`, all probes, and Gate 1 pass.
