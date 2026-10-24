---
title: "Atlas explorer phone/touch audit fixes B1-B7: 375px search input 0px wide, search sheet won't close, 460px min-height clips OL/3D toolbars, 3D 1:1 reset keeps TOWN scene, 3D touchcancel selects mesh, OL two-finger rotate; commit audit script + wire probes into precheck"
id: F-156
status: refined
from_idea: I-237
---

# Atlas explorer phone/touch audit fixes (B1-B7)

## Problem

A live audit on 2026-10-23 (headless Chrome over CDP, each bug reproduced twice, after F-154/F-155) found these bugs in `scripts/catalog_explorer_web.py`.

- **B1:** At 320 to 430 px the search input is 0 px wide, so text is invisible and tapping does not focus it. The Presets and Clear buttons shrink to 8x12 px and overlap. Cause: input CSS `flex:1 1 0; width:0` inside a content-sized `.joy-omni-command-bar`.
- **B2:** The search results bottom sheet covers 547 of 812 px. Tapping a result navigates but the sheet stays open and covers it. Tapping the map above it and pressing Esc do not close it.
- **B3:** At 375 px (non-theater) the OL/3D mount (460 px) is clipped by the 330 px shell (`overflow:hidden`), so the OL toolbar and the 3D toolbar are not visible and taps hit other elements. Cause: inline `min-height:460px` at about line 10090.
- **B4:** In 812x375 landscape theater all 6 3D buttons are below the fold. Same `min-height:460px` cause.
- **B5:** In 3D, HUD "5.2x" switches the scene to TOWN, but "1:1" resets only the camera, leaving the scene on TOWN and 2D zoom at 5.2. Cause: `zoomActiveAtlasEngine` reset path, about lines 6897-6903.
- **B6:** In 3D, a `touchcancel` on a mesh selects it. `canvas.onpointercancel` shares the pointerup handler (about lines 8669-8672); the 2D path passes null on cancel.
- **B7:** An OL two-finger twist rotates the map by about 0.48 rad. It stays rotated until "1:1" and is not in the URL. Cause: default OL interactions and a View without `enableRotation:false` (about lines 7695-7704).

Line numbers are from the audit at `041bb4434` and may have moved. Verify each before editing.

Out of scope, filed separately: I-238 (OL labels vanish while zooming at 768/375 px) and I-239 (touch target sizes and the HUD covering the map).

## Acceptance criteria

- [ ] B1: at 320, 375, 390 and 430 px the search input is at least 120 px wide, accepts focus on tap, and the Presets and Clear buttons are each at least 32 px in both dimensions and do not overlap.
- [ ] B2: on a phone, selecting a search result closes the sheet, and Esc and a tap on the map outside the sheet both close it. The sheet also has a visible close control of at least 32x32 px.
- [ ] B3 and B4: at 375x812 and 812x375, in and out of theater, every OL and 3D toolbar button is inside the viewport and is the topmost element at its centre point.
- [ ] B5: in 3D, pressing "1:1" after "5.2x" restores the scene and 2D zoom that were active before "5.2x".
- [ ] B6: a `touchcancel` or `pointercancel` on a 3D mesh does not change the selection.
- [ ] B7: an OL two-finger twist leaves the view rotation at 0 (`enableRotation:false` or the rotate interaction removed), and pinch zoom still works.
- [ ] The audit script (from the session scratchpad: `atlas_audit_repro.mjs` and `lib.mjs`) is committed under `scripts/probes/` with one assertion per bug B1 to B7, and each assertion is shown failing on the pre-fix code and passing after.
- [ ] The probes (`atlas_ux_probe.py`, `atlas_zoom_drift_check.mjs` and the new audit script) run from `scripts/precheck.sh`, or the reason they cannot is recorded.
- [ ] `tests/test_studio_web_perspectives.py`, `atlas_ux_probe.py`, `atlas_zoom_drift_check.mjs` and Gate 1 all pass.
