---
title: "Atlas explorer phone: map legend overlay covers most of the map at 390px; make it collapsible or compact"
id: F-161
status: refined
from_idea: I-242
---

# Atlas explorer phone: compact, collapsible map legend

## Problem

The F-160 audit (2026-10-24, 390x844) showed the map legend overlay (`.atlas-map-legend`, markup near line 11046 of `scripts/catalog_explorer_web.py`) still covers most of the map frame on a phone. It lists 5 to 6 legend rows plus a keyboard-shortcut line ("Keys: [+/-] Semantic Zoom, [Arrows] Pan ...") that is meaningless on a touch device. It is `pointer-events:none`, so it cannot be dismissed, and it hides the map the user is trying to read. F-160 fixed the HUD (hidden by default at <= 430 px, `toggleAtlasHud`) but explicitly left the legend out of scope.

## Why now

F-156 to F-160 made the phone explorer usable for taps and layout. The legend is now the biggest thing between a phone user and the map.

## Sketch

- At <= 430 px width, or on a coarse pointer, the legend defaults to collapsed: a single 44x44 px "Legend" button, same style and behaviour pattern as `#atlasHudToggleBtn` / `toggleAtlasHud` (state in a `let`, remembered in `localStorage` under a new key with try/catch, `aria-pressed`).
- When expanded on a phone, it omits the keyboard-shortcut line and is capped at 25% of the map height, scrolling inside if needed. It becomes tappable (`pointer-events:auto`) so the toggle works.
- Desktop and tablet (> 430 px, fine pointer) are unchanged: same legend, same position, keys line kept.
- The legend and the existing toolbars must not overlap (F-158 keeps the 3D toolbar clear of the legend).
- Applies to every engine that shows the legend (2d_svg, 2d_ol, 3d_map3d).

## Acceptance criteria

- [ ] At 375x812 and 390x844 the legend is collapsed by default and covers at most 5% of the map frame area; the toggle button is at least 44x44 px and is the topmost element at its centre.
- [ ] Pressing the toggle expands the legend to at most 25% of the map frame height, without the keyboard-shortcut line, and pressing it again collapses it; the choice survives a reload (`localStorage`) and the page still works when storage throws.
- [ ] At 1280x800 and 1440x900 the legend renders exactly as before (same rect, keys line present), checked against a pre-change measurement.
- [ ] In 2d_svg, 2d_ol and 3d_map3d at 375x812 the legend (collapsed or expanded) does not overlap any map toolbar button.
- [ ] `scripts/probes/atlas_phone_touch_audit.mjs` gains one assertion per item above, each shown failing on the pre-change code and passing after, run against a server started from the feature worktree (not the shared :8788 server).
- [ ] Phone (390x844) and desktop (1280x800) screenshots of the final state are taken, read, and shown to the owner.
- [ ] `tests/test_studio_web_perspectives.py`, `atlas_ux_probe.py`, `atlas_zoom_drift_check.mjs` and Gate 1 pass.
