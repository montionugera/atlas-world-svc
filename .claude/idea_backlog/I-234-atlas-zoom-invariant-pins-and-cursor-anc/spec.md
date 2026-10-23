---
title: "Atlas zoom-invariant pins and cursor-anchored zoom across SVG/OL/3D"
id: I-234
status: idea
---

# Atlas zoom-invariant pins and cursor-anchored zoom across SVG/OL/3D

## Problem

Owner report (2026-10-23): "the zoom make location change (eg zoom make tower, boss move), a lot of bug".
Measured in headless Chrome on `scripts/catalog_explorer_web.py` (:8788): counter-scaled map pins
(`.atlas-screen-pin`, `transform-box: fill-box` + px `transform-origin`) drifted 440 px at 1.5x and
1,444 px at 3x. Wheel zoom ignored the SVG letterbox and pan, overwrote `STUDIO_MAP_LOC`, and
crossing 3.5x/4.5x hijacked the overland map into a field/town blueprint. Two audits found 25 more
use-case bugs (unclamped drag pan, boss_hierarchy reading `loc_coord`, seal click opening the wrong
dungeon, OL view resetting on every render, HUD not driving OL/3D, 3D wheel not cursor-anchored,
search tray clipped, URL state not round-tripping).

## Acceptance criteria

- [ ] Pin anchor drift < 0.5 px at zoom 1.0, 1.5, 2.05, 3.0, 4.5, 6.0 for towers, towns, boss pins, race and warp badges (`node scripts/probes/atlas_zoom_drift_check.mjs` exit 0; `--simulate-bug` exits 1).
- [ ] Wheel zoom keeps the world point under the cursor stationary (< 0.5 px) and never changes `STUDIO_MAP_LOC`.
- [ ] Overland zoom is continuous to 8x; only the explicit Town/Field buttons enter a blueprint.
- [ ] Core landmark labels never disappear when zooming in.
- [ ] OL keeps its view across `render()`; HUD +/- drives the active engine (SVG/OL/3D); 3D wheel is cursor-anchored.
- [ ] Search results are clickable; boss seal click opens its own catacomb; URL round-trips pan/town/field/interior.
- [ ] `pytest tests/test_studio_web_perspectives.py`, `scripts/probes/atlas_ux_probe.py` (V-9) and Gate 1 pass.

## Out of scope (follow-ups)

- Route planner and 3D camera state in the URL; SVG vs OL filter count semantics.
