---
title: "Env pre-render sightline clutter strip-delta and glb import gate"
id: I-314
status: idea
---

# Env pre-render sightline clutter strip-delta and glb import gate

## Goal

Provide deterministic pre-render verification gates for procedural 3D environments:
1. Fix `scripts/godot-verify.sh` by extending pre-flight import checks to all `.glb` assets under `game-client/assets/` to eliminate missing/stale `.import` or `.scn` failures.
2. Build `game-client/src/World/EnvRenderPreGate.cs` implementing camera sightline raycasts with auto-offset elevation, milestone node supersession sweeps with coplanar z-fight detection, and animated shader strip delta validation.
3. Wire a headless self-test probe gated by `ATLAS_VERIFY_ENV_PREGATE=1` that exercises positive and negative fixtures and reports `[EnvRenderPreGateVerify] VERDICT PASS`.

## Architecture

- **Pre-flight GLB import gate (`scripts/godot-verify.sh`)**:
  Traverse `game-client/assets/**/*.glb` in addition to `studio-cache/*.glb` and `assets/audio/*.ogg`. Detect missing `.import` files or missing target `.scn` files in `.godot/imported/` and automatically trigger headless Godot import.
- **Sightline raycasting (`CheckCameraSightline` & `CheckRayBoxSightline`)**:
  Cast 5 rays (center + 4 inner frustum corner targets) against target bounding box `Aabb` in physics space or pure math against obstacle `Aabb`s. Return structured occlusion results and calculate elevated/pulled-back unoccluded camera suggestions when occlusion exceeds `maxOcclusionRatio`.
- **Milestone node deprecation sweep (`SweepDeprecatedMilestoneNodes`)**:
  Traverse scene hierarchy, identify active `MeshInstance3D`/`Node3D` belonging to superseded milestones (`M1_*` to `M{activeMilestone-1}_*`) under specified subsystem keywords (`Water`, `Waterfall`, `Fountain`), optionally hide them, and detect coplanar visible bounding boxes (`|dy| < 0.01f` with >50% XZ overlap) that cause z-fighting.
- **Time delta strip validation (`ValidateTimeDeltaStrip`)**:
  Verify that animated shader materials update parameters across captured frames (e.g. `time_offset`) and that consecutive `Image.GetData()` frame byte hashes vary to prevent frozen animation artifacts.
- **Probe integration**:
  Add an environment switch in `game-client/src/VerticalSliceRoot.cs` (`ATLAS_VERIFY_ENV_PREGATE=1`) that attaches the probe node, executing synthetic test cases and printing `[EnvRenderPreGateVerify] VERDICT PASS` before quitting tree.

## Acceptance criteria

- [ ] `scripts/godot-verify.sh` inspects all `.glb` files under `$PROJECT/assets/` and marks `needs_import=1` if `.import` or target `.scn` is missing or stale.
- [ ] `game-client/src/World/EnvRenderPreGate.cs` implements `CheckCameraSightline`, `CheckRayBoxSightline`, `SweepDeprecatedMilestoneNodes`, and `ValidateTimeDeltaStrip`.
- [ ] Probe exercises cliff-wall camera occlusion detection and suggests valid elevated camera offset.
- [ ] Probe exercises milestone deprecation sweep, hiding legacy `M1_*` water nodes and flagging coplanar z-fighting nodes.
- [ ] Probe exercises time delta strip validation, detecting identical static frames (fail) versus varied frames (pass).
- [ ] Running `scripts/godot-verify.sh ATLAS_VERIFY_ENV_PREGATE '^\[EnvRenderPreGateVerify\] VERDICT PASS$'` succeeds with exit code 0.
