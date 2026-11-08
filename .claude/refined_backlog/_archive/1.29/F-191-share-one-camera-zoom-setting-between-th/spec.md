---
title: "Share one camera zoom setting between the game scene and the playtest sandbox: one CameraZoom class (3.5-30 m, proportional step) used by VerticalSliceRoot and PlaytestSandboxRoot"
id: F-191
from_idea: I-276
status: refined
---

# One camera zoom setting, used by both scenes

## Goal
Owner: the game and the playtest sandbox should share the zoom setting so one fix covers both. F-190 widened the game zoom to 3.5-30 m but the sandbox (`World/PlaytestSandboxRoot.cs:849-856`) still has its own 1.6-12 m clamp and 0.35 m step.

## Scope
- New `game-client/src/World/CameraZoom.cs`: `MinDistance` 3.5, `MaxDistance` 30, `Zoomed(current, dir)` (10% step, min 0.45 m). Moved out of `VerticalSliceRoot` (F-190).
- `VerticalSliceRoot`, `DevTuningDrawer` and `MaroBellVerify` use `CameraZoom`; the sandbox wheel handler uses it too. The sandbox gets the game's 3.5 m close limit (it was 1.6 m): one setting, by owner decision.
- Out of scope: pitch limits (sandbox allows below-horizon on purpose), per-view preset distances, touch pinch.

## Acceptance criteria
- [ ] `CameraZoom` is the only place the 3.5 / 30 / step numbers live (grep finds no other `3.5f, 11.0f`, `1.6f, 12.0f` clamps for wheel zoom).
- [ ] Both scenes zoom 3.5..30 m via `CameraZoom.Zoomed`.
- [ ] Probe ATLAS_VERIFY_MARO_BELL asserts the clamps through `CameraZoom`; sandbox probe or build passes; Gate 1 green.
