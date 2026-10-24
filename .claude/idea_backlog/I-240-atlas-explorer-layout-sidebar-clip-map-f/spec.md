---
title: "Atlas explorer layout + sidebar: clip map frame, lens bar truncation, toggleable sidebar and drawer"
id: I-240
status: idea
---

# Atlas explorer layout + sidebar (owner feedback 2026-10-23, screenshot /tmp/FE28F5FF-A0B8-4E75-B8CB-5D850F0691C9.jpeg)

## Problem

Owner: "look broken, want able to toggle sidebar for larger map area." On an iPad-landscape width (about 1100 px) in `scripts/catalog_explorer_web.py`:

1. **Map content bleeds outside its frame.** `#dedicatedWorldAtlasSvg` is a 1040x500 viewBox with `preserveAspectRatio="xMidYMid meet"`. When the container is taller, the Legacy Raster Plate (`ATLAS_RASTER_RELIEF_OVERLAY`) and zoomed or panned content draw above y=0 and below y=500 because `<g id="studioCartoViewport">` has no clip. There is also dead dark-blue space below the map, and the bottom legend bar is not anchored to the map.
2. **Persona lens bar buttons are truncated** (`Scal...`, `Detai...`, `War...`, `Rout...`, `Growt...`, `Theat...`) at 900 to 1280 px in `#joyPersonaLensBar`, because the search box and lens pills squeeze them.
3. **No way to reclaim width.** The app `.sidebar` (268 px) plus the Place Inspector `#studioGooglePlaceDrawer` (320 px) take about 588 px (more than half of a 1100 px screen). Closing the inspector with its x clears the POI but leaves the drawer area in place.

Ruler scale decision (owner, 2026-10-23): keep 384.6 m per unit. Do not change it.

## Sketch

- Add `<clipPath id="atlasWorldFrameClip">` (rect 0 0 1040 500, rx 6) in the SVG `<defs>` and wrap `#studioCartoViewport` in `<g clip-path="url(#atlasWorldFrameClip)">`. Bound the raster plate to 0 0 1040 500.
- Make `.joy-spatial-shell__canvas` fit the map with no dead space, and anchor the legend bar under the map.
- Toolbar buttons get `flex-shrink:0; white-space:nowrap`; `#joyPersonaLensBar` wraps to two rows or scrolls cleanly at 900 to 1280 px.
- Add `toggleAppSidebar()`, with a button before Back/Forward, a floating re-open tab when collapsed, hotkey `[`, `body[data-sidebar-collapsed="true"]` collapsing `.sidebar` to width 0, persisted in localStorage and the URL state.
- Closing `#studioGooglePlaceDrawer` also collapses the drawer area (`ATLAS_LEFT_DRAWER_OPEN = false`), gives the drawer header a "Collapse panel" button, and at viewports of 1180 px or less the drawer overlays instead of taking width. Add a "Maximize map" control in the map HUD or top bar that collapses both.

## Acceptance criteria

- [ ] `#dedicatedWorldAtlasSvg` contains `<clipPath id="atlasWorldFrameClip">` applied to a group wrapping `#studioCartoViewport`; at 1440x900 and 1080x810, with and without the Legacy Raster Plate and at zoom 1x and 5.2x, no pixel of map content renders outside the 0..1040 x 0..500 frame (verified by screenshot and by a rendered-bounds probe).
- [ ] There is no empty dead space below the map at 1440x900 and 1080x810, and the legend bar sits directly under the map.
- [ ] At 900, 1024, 1080, 1180 and 1280 px, no button in `#joyPersonaLensBar` has `scrollWidth > clientWidth`, and no label shows an ellipsis.
- [ ] `toggleAppSidebar()` collapses `.sidebar` to 0 px, widens the map canvas by at least 240 px, persists across reload (localStorage) and URL state, responds to the `[` hotkey, and a visible control re-opens it.
- [ ] Closing the Place Inspector widens the map by at least 300 px; at 1180 px or less the drawer overlays rather than taking width; "Maximize map" gives the map nearly the full screen width.
- [ ] V-11 is added to `scripts/probes/atlas_ux_probe.py` and matching assertions to `scripts/probes/atlas_zoom_drift_check.mjs`, covering clipPath presence, sidebar widths and lens-bar truncation; V-1..V-10, `tests/test_studio_web_perspectives.py`, the drift check, the phone/touch audit probe and Gate 1 all pass.
- [ ] Headless Chrome screenshots at 1440x900 and 1080x810 (2D Crisp Vector with raster plate on and off, sidebar open and closed; 2D OpenLayers) are viewed and look correct.
