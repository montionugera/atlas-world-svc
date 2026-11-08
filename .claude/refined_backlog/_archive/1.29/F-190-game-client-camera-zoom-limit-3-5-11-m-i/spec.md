---
title: "Game client camera zoom limit 3.5-11 m is too tight for a 160 m town: widen max to 30 m with a distance-proportional wheel step (VerticalSliceRoot.cs:1302-1305)"
id: F-190
from_idea: I-275
status: refined
---

# Wider camera zoom in the Godot game client

## Goal
The owner could not pull the camera back far enough to judge a 160 m town. Let the mouse wheel zoom out to 30 m (was 11 m), keep the close limit at 3.5 m.

## Scope
- `game-client/src/VerticalSliceRoot.cs` wheel handler (~1302-1305): clamp 3.5..30; step proportional to distance (10% of current distance, min 0.45 m) so both ends feel the same.
- Check that the camera far plane, fog and `SmartCameraOccluder` still look right at 30 m; fix only what breaks.
- Out of scope: the per-view CameraDistance presets (6.4 / 7.4 / v.CameraDistance).

## Acceptance criteria
- [ ] Wheel-down reaches 30 m and stops; wheel-up reaches 3.5 m and stops (unit/probe asserts the clamp values).
- [ ] At 30 m in Maro Bell the camera does not clip the far plane or fade the whole screen black.
- [ ] Godot probes ATLAS_VERIFY_MARO_BELL and ATLAS_VERIFY_ANIM still pass; Gate 1 green.
