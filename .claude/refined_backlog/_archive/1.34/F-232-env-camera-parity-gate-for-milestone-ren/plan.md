# Implementation Plan — Env Camera Parity Gate

## Tasks

1. Implement `scripts/tests/env-cam-parity.test.mjs` with `auditCsharpCameraParity(source)` covering:
   - `*CamView*` declaration -> `camChecks` registration parity,
   - perspective milestone `Save()` inline `Vector3` drift detection,
   - 3D perspective frustum inclusion check between `(Pos, LookAt)` and `TargetAabb`.
2. Verify live `game-client/src/World/MaroBellVerify.cs` passes and synthetic drift/missing/mis-aimed fixtures fail closed.
3. Run `./scripts/fastcheck.sh`, independent code review, and `psrw ship` onto `release/1.34`.
