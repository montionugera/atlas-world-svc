---
title: "Atlas explorer touch targets: phone pins as small as 7px (all <44px), theater exit button 34x24, top-left HUD covers 61% of map at 375px"
id: F-160
status: refined
from_idea: I-239
---

# Atlas explorer touch targets: pins, theater exit, HUD size on phones

## Problem

The 2026-10-23 phone audit measured three touch problems in `scripts/catalog_explorer_web.py`:
- Map pins on a phone are as small as 7 px, and none reaches 44 px, the common minimum touch target.
- The theater exit button is 34x24 px.
- The top-left HUD covers 61% of the map area at 375 px width.

## Why now

F-156 fixed the controls that were broken outright (B1-B7). These remain usable only with a precise finger, and the HUD hides most of the map on a phone.

## Sketch

- Pins: keep the drawn marker size, but give each pin a transparent hit area of at least 44x44 px on coarse pointers (`pointer: coarse`), without enlarging the drawn marker or breaking the zoom-invariant pin work in F-154. Adjacent pins may overlap hit areas; the nearest centre wins.
- Theater exit: at least 44x44 px on coarse pointers.
- HUD: on phone widths (<= 430 px) it must cover at most 25% of the map area, and be collapsible so the map can use the full frame. The sidebar toggle from F-157 is the model.

## Acceptance criteria

- [ ] At 375x812 with a coarse pointer, every visible pin's effective hit area is at least 44x44 px, measured by the audit script, in the SVG engine and in `2d_ol`.
- [ ] Drawn pin size is unchanged at all zoom levels (F-154 zoom-invariant assertions still pass).
- [ ] At 375x812 and 812x375, the theater exit button is at least 44x44 px and is the topmost element at its centre.
- [ ] At 375x812 the HUD covers at most 25% of the map area by default and has a control that hides it.
- [ ] The touch audit (`atlas_phone_touch_audit.mjs`) gains one assertion per item above, shown failing before the fix and passing after.
- [ ] `tests/test_studio_web_perspectives.py`, `atlas_ux_probe.py`, `atlas_zoom_drift_check.mjs` and Gate 1 pass.
