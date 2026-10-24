---
title: "Atlas engine parity: zone filter counts, Kilnwatch OL/SVG anchor, URL route+3D camera, theater/mobile/OL ruler audit"
id: F-155
status: refined
from_idea: I-235
---

# Atlas engine parity follow-ups to F-154

## Problem

These items were left open after F-154 (`3cf306666`).

- Kilnwatch sits about 10 px apart between OpenLayers (`2d_ol`, y=318) and 2D SVG (`2d_svg`, y=308).
- The filter counts differ between engines: SVG counts monster pins (2 at 1x), OpenLayers counts zones (40).
- The route planner state and the 3D camera are not kept in the URL.
- A lens restored from the URL does not get its default overlay.
- Theater mode, mobile widths, the OpenLayers ruler and OpenLayers label decluttering were never audited.

Owner decision (2026-10-23): **filters count ZONES**, matching OpenLayers and the filter badge counts. 2D SVG must highlight and filter the matching zones consistently at every zoom.

## Acceptance criteria

- [ ] Every landmark shared by both engines sits at the same SVG-space coordinate in OL and SVG: 0 px parity, measured live for all of them.
- [ ] For every tier filter (All/Monster/Mini-Boss/Raid/MVP), SVG and OL report the same zone count, and SVG highlights exactly those zones at 1x, 2.8x and 6x.
- [ ] The URL round-trips the route planner (open/origin/dest) and the 3D camera (zoom/yaw/pitch/pan). A lens restored from the URL applies `ATLAS_LENS_DEFAULT_BAR` and its drawer.
- [ ] Theater mode, 375/768 px widths, the OL ruler and OL decluttering are audited live, and the bugs found are fixed.
- [ ] New assertions are added to `scripts/probes/atlas_zoom_drift_check.mjs` and `scripts/probes/atlas_ux_probe.py`; pytest, the probe, the drift check and Gate 1 all pass.
