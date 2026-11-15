---
title: "Material-aware footstep SFX by ground surface (stone, dirt, water, glass)"
id: I-307
status: idea
---

# Material-aware footstep SFX by ground surface (stone, dirt, water, glass)

## Problem

Every footstep in `VerticalSliceRoot`, `PlaytestSandboxRoot`, and `MaroBellPocController` plays the same stone road SFX (`sfx:footstep_1..8`) regardless of whether the player walks on grass, dirt, water, or glass.

## Why now

Footstep cadence and timing are now synced 1:1 with walk/run strides (`#48`) and `UnifiedMapDocument` already models `SurfaceType` on `GroundPalettes`, `Routes`, and `GroundZones`, making material-aware playback the natural next step.

## Sketch

Canonical spec: [`docs/superpowers/specs/2026-11-15-i307-material-aware-footstep-sfx-design.md`](../../../docs/superpowers/specs/2026-11-15-i307-material-aware-footstep-sfx-design.md).

- Hybrid `FootstepSurfaceResolver` (structure/pad override > `Routes` > `GroundZones` > `BaseGroundId` > `Stone` fallback).
- `AudioRegistry.PlayFootstep(..., FootstepSurface surface = FootstepSurface.Stone)` resolving `sfx:footstep_<surface>_1..8` with fallback to `sfx:footstep_1..8`.
- 4 walkable test pads (`Stone`, `Dirt`, `Water`, `Glass`) in `PlaytestSandbox.tscn` + ElevenLabs `.ogg` variants per material (owner ear-checked).

## Acceptance criteria

- [ ] `FootstepSurfaceMapper` & `FootstepSurfaceResolver` resolve `Stone`, `Dirt`, `Grass`, `Water`, and `Glass` from map data and pad/structure overrides with `Stone` fallback.
- [ ] `AudioRegistry.PlayFootstep` plays `sfx:footstep_<surface>_1..8` without immediate repeats and falls back safely to stone if keys are missing.
- [ ] `PlaytestSandbox.tscn` exposes 4 walkable test pads (`Stone`, `Dirt`, `Water`, `Glass`); `AudioVerify` and `PlaytestSandboxVerify` pass on `Godot_mono.app`.
- [ ] ElevenLabs `.ogg` variants for `dirt`, `grass`, `water`, and `glass` are ear-checked by the owner before shipping.
