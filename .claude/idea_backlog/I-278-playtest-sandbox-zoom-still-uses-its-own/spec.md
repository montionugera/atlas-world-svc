---
title: "Make the playtest sandbox really use CameraZoom"
id: I-278
---

# Sandbox zoom through CameraZoom

## Goal
F-191 added `CameraZoom` for the game scene and the sandbox, but the sandbox had been rewritten (F-188) with its own `SetCameraDistance` clamp (0.35-22 m) and wheel/key steps, so it was never switched. Owner screenshot shows "Face Zoom (0.35m..22m)". One range for both.

## Scope
- `CameraZoom`: `MinDistance` 0.35 (the sandbox face-zoom close limit; game now gets it too), `MaxDistance` 30, `Zoomed(current, dir)` step = max(0.08, 14% of distance).
- `PlaytestSandboxRoot.cs`: `SetCameraDistance` clamps with `CameraZoom`; wheel and +/- use `CameraZoom.Zoomed`; remove its own Min/MaxCameraDistance; controls text shows the shared range.
- `MaroBellVerify` zoom assert and the dev-tuning slider follow `CameraZoom`.

## Acceptance criteria
- [ ] No `0.35f`/`22.0f` zoom clamp or private zoom step remains outside `CameraZoom` (grep).
- [ ] Probe asserts both scenes' limits through `CameraZoom` (0.35 in, 30 out); build passes; Gate 1 green.
