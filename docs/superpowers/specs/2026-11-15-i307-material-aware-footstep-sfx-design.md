# I-307: Material-Aware Footstep SFX by Ground Surface

**Idea ID:** `I-307`
**Date:** 2026-11-15
**Status:** Draft Spec (pending R0 owner approval)

## User Request & Outcome

- **User request:** *"we updated sfx right ?; is that support change matterial ? like glass , ดิน , หิน น้ำ"* -> *"Yes"* (approved capturing & designing material-aware footsteps).
- **User-visible outcome:** The user will confirm this by walking/running in `PlaytestSandbox.tscn` across the 4 labeled walkable surface pads (**Stone**, **Dirt**, **Water**, **Glass**) plus surrounding **Grass**, hearing distinct material-matched single-strike footsteps synced 1:1 with visual steps, and observing `[AudioVerify] RESULT: PASS` + `[PlaytestSandboxVerify] VERDICT PASS`.

## Decisions (`batch-grill`, 2026-11-15)

- **Material scope & test pads** -> `Stone`, `Dirt`, `Water`, `Glass`, plus `Grass` (mapped from `meadow_grass` / `forest_moss`), with 4 walkable test pads in `PlaytestSandbox.tscn` — lets all 4 requested materials and existing meadow grass be heard immediately without waiting for world maps to place water/glass zones.
- **Ground surface detection** -> Hybrid resolver: map data (`Routes` -> `GroundZones` -> `BaseGroundId` via `UnifiedMapGroundPalette.SurfaceType`) + optional `surfaceType` / `surface_type` override on `UnifiedMapStructureVolume` and floor/pad nodes (fallback: `Stone`) — zero per-frame physics overhead on open terrain while supporting 3D bridges, glass floors, and test pads.
- **Audio asset sourcing** -> Generate 4–8 single-strike ElevenLabs `.ogg` variants (0.3–2.0s) per new material (`dirt`, `water`, `glass`, `grass`) via Chrome (with owner ear-check before shipping), wired behind a safe fallback to `Stone` (`sfx:footstep_1..8`) when a material's keys are absent from `audio-manifest.json`.
- **Single-stride & multi-stride timing** -> Reuse `AnimationController.PollFootstepStrike(out bool isRightFoot, out bool isRunning)` unchanged (`ASSUMED: reversible: Y`).

## Approaches Considered

1. **Recommended — Hybrid `SurfaceResolver` (reusing `UnifiedMapDocument.ResolveGroundIdAt`) + Material-Keyed `AudioRegistry.PlayFootstep`:**
   - Pure C# `FootstepSurfaceResolver.Resolve(Vector3 worldPos, UnifiedMapDocument? doc, IReadOnlyList<SurfacePadOverride>? pads = null)` checks: (a) walkable structure/pad override (`SurfacePadOverride` bounds or `UnifiedMapStructureVolume.SurfaceType` when non-empty), then (b) `doc.ResolveGroundIdAt(worldPos.X, worldPos.Z, out _, out _)` -> `doc.GroundPalettes[groundId].SurfaceType` -> `FootstepSurfaceMapper.FromSurfaceType(...)` (with `"structure_foundation"` -> `Stone`), else fallback `FootstepSurface.Stone`.
   - `AudioRegistry.PlayFootstep(Vector3 worldPos, bool isRightFoot = false, bool isRunning = false, FootstepSurface surface = FootstepSurface.Stone)` resolves `sfx:footstep_<surface>_1..8` (falling back to `sfx:footstep_1..8` / `sfx:footstep`), keeping per-surface non-repeating ring buffer and triangular pitch/volume micro-variation, plus per-material dB trim so water/glass don't clip or overpower.
   - **Trade-off:** Zero duplicated spline/zone geometry (reuses `UnifiedMapDocument.ResolveGroundIdAt`), purely deterministic and headless-testable; pad/bridge overrides simply pass `SurfacePadOverride` or `UnifiedMapStructureVolume.SurfaceType`.
2. **Physics Raycast-Only:** Cast a downward `PhysicsRayQueryParameters3D` per footstep strike and read `metadata/surface_type`. Rejected because `TerrainElevation` maps and `PlaytestSandboxRoot` ground movement don't rely on per-zone physics colliders for roads vs grass.
3. **Map-Data-Only:** Only inspect `UnifiedMapDocument` palettes/routes. Rejected because 3D structures, bridges, and `PlaytestSandbox.tscn` test pads need per-pad overrides.

## Architecture & File Changes

### 1. Canonical Surface Enum & Mapping (`game-client/src/Audio/FootstepSurface.cs`)
- `public enum FootstepSurface { Stone, Dirt, Grass, Water, Glass }`
- `FootstepSurfaceMapper.FromSurfaceType(string? raw)` maps `UnifiedMapGroundPalette.SurfaceType` and overrides case-insensitively:
  - `"stone_path"`, `"sheer_rock"`, `"stone"`, `"cobble"`, `"rock"` -> `Stone`
  - `"dirt"`, `"soil"`, `"earth"`, `"mud"`, `"estuary_mudflat"`, `"scorched_basalt_ash"`, `"bramble_root_floor"` -> `Dirt`
  - `"lush_grass"`, `"forest_moss"`, `"grass"`, `"meadow"`, `"moss"` -> `Grass`
  - `"water"`, `"shallow_water"`, `"river"`, `"stream"`, `"pond"`, `"puddle"` -> `Water`
  - `"glass"`, `"crystal"`, `"stained_glass"`, `"wind_scoured_ice"`, `"ice"` -> `Glass`
  - anything null/unknown -> `Stone`

### 2. Hybrid Surface Resolver (`game-client/src/World/FootstepSurfaceResolver.cs`)
- Reuses `UnifiedMapDocument.ResolveGroundIdAt(worldPos.X, worldPos.Z, out _, out _)` instead of duplicating spline/zone math.
- Inputs: `Vector3 worldPos`, `UnifiedMapDocument? doc`, optional `IReadOnlyList<SurfacePadOverride>? pads`.
- Precedence (top wins):
  1. Explicit `SurfacePadOverride` rect/circle containing `(worldPos.X, worldPos.Z)` (for `PlaytestSandbox.tscn` walkable test pads or custom bridges/floors).
  2. `UnifiedMapStructureVolume` with non-empty `SurfaceType` whose footprint contains `(worldPos.X, worldPos.Z)` (add optional `[JsonPropertyName("surfaceType")] public string? SurfaceType { get; set; }` on `UnifiedMapStructureVolume` in `game-client/src/World/UnifiedMapDocument.cs`).
  3. `doc.ResolveGroundIdAt(worldPos.X, worldPos.Z, out _, out _)` -> if `"structure_foundation"` return `Stone`; else look up `doc.GroundPalettes[groundId].SurfaceType` via `FootstepSurfaceMapper.FromSurfaceType`.
  4. Fallback `FootstepSurface.Stone`.

### 3. `AudioRegistry` Material Support (`game-client/src/Audio/AudioRegistry.cs`)
- Keep backward-compatible default parameter:
  `PlayFootstep(Vector3 worldPos, bool isRightFoot = false, bool isRunning = false, FootstepSurface surface = FootstepSurface.Stone)`
- Event key lookup order for `surface`:
  1. `sfx:footstep_<surface_lower>_1..8` (e.g., `sfx:footstep_dirt_1..8`, `sfx:footstep_water_1..8`, `sfx:footstep_glass_1..8`, `sfx:footstep_grass_1..8`, `sfx:footstep_stone_1..8`)
  2. Fallback to `sfx:footstep_1..8` (for `Stone` or any surface whose clips aren't in manifest yet)
  3. Fallback to `sfx:footstep`
- Per-surface non-repeating 3-step history (`_recentFootstepVariants` per surface or reset on surface change) so stepping from stone onto water never skips or repeats the same sample index.
- Per-material gain offset (so crisp glass taps and water splashes sit balanced alongside soft stone footsteps, ~`-8` to `-14 dB` walk / `-5` to `-11 dB` run).

### 4. Client Callers
- `game-client/src/World/PlaytestSandboxRoot.cs`: resolve surface at `playerPos` via `FootstepSurfaceResolver` (including the 4 sandbox test pads) and pass to `PlayFootstep(playerPos, rightFoot, running, surface)`. Add 4 clearly labeled walkable surface pads near spawn (`Stone`, `Dirt`, `Water`, `Glass`) with distinct visual tint/material and `SurfacePadOverride` bounds.
- `game-client/src/VerticalSliceRoot.cs` and `game-client/src/World/MaroBellPocController.cs`: resolve surface from the active `UnifiedMapDocument` at `playerPos` and pass to `PlayFootstep`.

### 5. ElevenLabs SFX Assets & Manifest (`game-client/assets/` & `atelier/atlas-world-panels/audio-index.json`)
- Generate 4–8 single-strike `.ogg` clips (0.3–1.2s, soft single impact, no multi-step loops) via ElevenLabs for each new surface:
  - `footstep_dirt_01..08.ogg` -> `sfx:footstep_dirt_1..8`
  - `footstep_grass_01..08.ogg` -> `sfx:footstep_grass_1..8`
  - `footstep_water_01..08.ogg` -> `sfx:footstep_water_1..8`
  - `footstep_glass_01..08.ogg` -> `sfx:footstep_glass_1..8`
  - Alias `sfx:footstep_stone_1..8` -> existing `res://assets/audio/footstep_stone_01..08.ogg`
- Update both `game-client/assets/audio-manifest.json` and `atelier/atlas-world-panels/audio-index.json` so the asset storybook audio index stays in sync.
- Owner ear-check gate (Rule #17): user listens to generated clips / `PlaytestSandbox.tscn` pads before shipping.

## Verification & Acceptance Criteria

- [ ] `FootstepSurfaceMapper` maps all `content/ground_palettes.json` `surfaceType` values plus `water`, `glass`, `dirt` cleanly, defaulting unknown values to `Stone`.
- [ ] `FootstepSurfaceResolver` resolves `Routes` > `GroundZones` (by priority) > `BaseGroundId`, with pad/structure overrides taking precedence over terrain.
- [ ] `AudioRegistry.PlayFootstep(..., surface)` resolves `sfx:footstep_<surface>_1..8`, avoids repeating the last 3 indices, and gracefully falls back to `sfx:footstep_1..8` (`Stone`) if a variant key is missing.
- [ ] `PlaytestSandbox.tscn` includes 4 labeled walkable test pads (`Stone`, `Dirt`, `Water`, `Glass`) and `PlaytestSandboxVerify.cs` asserts surface resolution and `PlayFootstep` playback for all 5 materials (`Stone`, `Dirt`, `Grass`, `Water`, `Glass`).
- [ ] `AudioVerify.cs` (`ATLAS_VERIFY_AUDIO`) and `PlaytestSandboxVerify.cs` (`ATLAS_VERIFY_PLAYTEST_SANDBOX`) pass under `Godot_mono.app`, and `scripts/precheck.sh` passes.
- [ ] Owner confirms by ear that `dirt`, `grass`, `water`, and `glass` footsteps sound natural and balanced.
