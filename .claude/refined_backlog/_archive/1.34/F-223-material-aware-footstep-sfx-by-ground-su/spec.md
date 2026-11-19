---
title: "Material-aware footstep SFX by ground surface (stone, dirt, water, glass)"
id: F-223
from_idea: I-307
status: refined
---

# F-223: Material-Aware Footstep SFX by Ground Surface

**Canonical Spec:** [`docs/superpowers/specs/2026-11-15-i307-material-aware-footstep-sfx-design.md`](../../../docs/superpowers/specs/2026-11-15-i307-material-aware-footstep-sfx-design.md)

## Problem

Every footstep in `VerticalSliceRoot`, `PlaytestSandboxRoot`, and `MaroBellPocController` plays the same stone road SFX (`sfx:footstep_1..8`) regardless of whether the player walks on grass, dirt, water, or glass.

## Approved Decisions (`batch-grill`, 2026-11-15)

- **Material scope & test pads:** Support `Stone`, `Dirt`, `Water`, `Glass`, plus `Grass` (mapped from `meadow_grass` / `forest_moss`), with 4 labeled walkable test pads (`Stone`, `Dirt`, `Water`, `Glass`) in `PlaytestSandbox.tscn` near the Bell Terrace spawn.
- **Ground surface detection:** Hybrid `FootstepSurfaceResolver` reusing `UnifiedMapDocument.ResolveGroundIdAt(wx, wz, out _, out _)` (`Routes` -> `GroundZones` -> `BaseGroundId` via `UnifiedMapGroundPalette.SurfaceType`) plus optional `SurfacePadOverride` and `UnifiedMapStructureVolume.SurfaceType` overrides (fallback: `Stone`).
- **Audio asset sourcing:** Generate 4–8 single-strike ElevenLabs `.ogg` variants (0.3–1.2s, soft single impact) per new material (`dirt`, `water`, `glass`, `grass`) via Chrome, wired behind a safe fallback to `Stone` (`sfx:footstep_1..8`), with owner ear-check before shipping (Rule #17).
- **Single-stride & multi-stride timing:** Reuse `AnimationController.PollFootstepStrike(out bool isRightFoot, out bool isRunning)` unchanged.

## Acceptance Criteria

- [ ] `FootstepSurfaceMapper` maps all `content/ground_palettes.json` `surfaceType` values plus `water`, `glass`, `dirt` cleanly, defaulting unknown values to `Stone`.
- [ ] `FootstepSurfaceResolver` resolves `SurfacePadOverride` > `UnifiedMapStructureVolume.SurfaceType` > `Routes` > `GroundZones` (by priority) > `BaseGroundId`, with `Stone` fallback.
- [ ] `AudioRegistry.PlayFootstep(..., surface)` resolves `sfx:footstep_<surface>_1..8`, avoids repeating the last 3 indices per surface, and gracefully falls back to `sfx:footstep_1..8` (`Stone`) if a variant key is missing.
- [ ] `PlaytestSandbox.tscn` / `PlaytestSandboxRoot.cs` includes 4 labeled walkable test pads (`Stone`, `Dirt`, `Water`, `Glass`) and `PlaytestSandboxVerify.cs` asserts surface resolution and `PlayFootstep` playback for all 5 materials (`Stone`, `Dirt`, `Grass`, `Water`, `Glass`).
- [ ] `AudioVerify.cs` (`ATLAS_VERIFY_SFX=1`) and `PlaytestSandboxVerify.cs` (`ATLAS_VERIFY_PLAYTEST_SANDBOX=1`) pass under `Godot_mono.app`, and `scripts/precheck.sh` passes.
- [ ] Owner confirms by ear that `dirt`, `grass`, `water`, and `glass` footsteps sound natural and balanced.
