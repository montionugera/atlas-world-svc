---
title: "Atlas OL core labels vanish while zooming 1x-2.2x at 768px and 375px (passes at 1440); root cause unknown"
id: F-159
status: refined
from_idea: I-238
---

# Atlas OL core labels vanish while zooming (768 px and 375 px)

## Problem

The F-155 zoom-drift check asserts that the count of core landmark labels in the `2d_ol` (OpenLayers) engine never drops while zooming in from 1x to 4.5x (`atlas_zoom_drift_check.mjs`, assertion "OL: core landmark labels never vanish while zooming in"). A live audit on 2026-10-23 found that at 768 px and 375 px viewport widths the labels disappear somewhere between 1x and 2.2x, then return. At 1440 px the assertion passes. The root cause is not known. Suspects: OL label declutter ordering changing with the smaller map size, or a resolution-dependent style threshold.

## Why now

Phone and tablet are in scope for the explorer (F-156, F-157). A map that loses its town names while pinching in reads as broken.

## Sketch

1. Reproduce with the zoom-drift check at 768x1024 and 375x812; record which labels vanish and at what zoom steps.
2. Find the cause in the OL label layer style or declutter code in `scripts/catalog_explorer_web.py`.
3. Fix at the cause. Do not widen the assertion or skip the viewports.

## Acceptance criteria

- [ ] The zoom-drift check records, for 768x1024 and 375x812, the core label count at each zoom step from 1x to 4.5x, and the count never decreases between steps.
- [ ] The same check still passes at 1440x900.
- [ ] The probe runs the OL label assertion at all three viewport sizes (today it only reports a failure at the two small ones when run by hand) and is wired into `scripts/precheck.sh`.
- [ ] The root cause is stated in the commit message with the line it was found at.
- [ ] Gate 1 passes.
