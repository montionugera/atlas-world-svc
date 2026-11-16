# Implementation Plan: Env pre-render sightline clutter strip-delta and glb import gate

## Phase 1: Pre-flight import check update in scripts/godot-verify.sh
- Extend pre-flight detection to find and check all `.glb` assets under `$PROJECT/assets/`.
- Verify detection logic against missing `.import` or missing `.scn` target files.

## Phase 2: Implement EnvRenderPreGate.cs
- Implement `CheckCameraSightline` with 5-ray sampling and auto-offset computation.
- Implement pure-math `CheckRayBoxSightline` for obstacles represented by `Aabb`s.
- Implement `SweepDeprecatedMilestoneNodes` for milestone node deprecation and coplanar z-fight detection.
- Implement `ValidateTimeDeltaStrip` for shader material parameter variation and frame image hash validation.
- Implement self-test probe cases for positive and negative fixtures.

## Phase 3: VerticalSliceRoot Probe Integration
- Wire `ATLAS_VERIFY_ENV_PREGATE=1` into `game-client/src/VerticalSliceRoot.cs`.

## Phase 4: Verification and Quality Gate
- Run `dotnet build game-client/GameClient.csproj`.
- Run `scripts/godot-verify.sh ATLAS_VERIFY_ENV_PREGATE '^\[EnvRenderPreGateVerify\] VERDICT PASS$'`.
- Ensure clean git status inside feature worktree.
