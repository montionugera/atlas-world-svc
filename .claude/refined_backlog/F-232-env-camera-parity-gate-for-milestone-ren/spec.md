---
title: "Env camera parity gate for milestone renders and sightline checks"
id: F-232
status: refined
from_idea: I-317
---

# I-317 — Env camera parity gate for milestone renders and sightline checks

## Problem

During F-230 (Maro Bell M5 Rev 1–6), several iterations tuned geometry against `EnvRenderPreGate` sightline checks whose camera coordinates and target bounding boxes had drifted from the actual perspective cameras rendered in `MaroBellVerify.cs`. While commit `578fa6472` unified the M5 cameras onto `M5CamView*` constants, nothing mechanically prevents future M5/M6/M7 edits from re-introducing inline `new Vector3(...)` camera drift, omitting a declared `*CamView*` constant from `EnvRenderPreGate` `camChecks`, or pairing a camera with a `TargetAabb` outside its rendered perspective frustum.

## Why now

M6 and M7 environment milestones follow immediately on `release/1.34`. Catching camera/gate drift in `<100ms` during `fastcheck.sh` and Gate 1 (`precheck.sh`) avoids burning 15–30 minute Blender + Godot + Vision QA cycles on mis-aimed or ungated cameras.

## Proposed direction

Add a deterministic Node test suite (`scripts/tests/env-cam-parity.test.mjs`) that parses `game-client/src/World/MaroBellVerify.cs` (and exports reusable `auditCsharpCameraParity()` assertions for unit testing synthetic drift cases):
1. Every declared `*CamView*` `(Pos, LookAt)` constant must be registered in `Verify*EnvRenderPreGate` `camChecks`.
2. Every perspective hero/closeup `Save(outDir, "m5_view..." | "m6_view..." | "m7_view...")` must read `.Pos` and `.LookAt` from a shared `*CamView*` constant rather than inline `new Vector3(...)` literals.
3. Every `(CamPos, LookAt)` pair in `camChecks` must keep its paired `TargetAabb` centre inside the camera's 3D perspective frustum (`depth > 0` and horizontal/vertical half-FOV bounds).

## Acceptance criteria

- [ ] `scripts/tests/env-cam-parity.test.mjs` passes against live `game-client/src/World/MaroBellVerify.cs`.
- [ ] Unit tests verify failure on (a) inline `new Vector3(...)` camera drift before a milestone `Save()`, (b) an ungated `*CamView*` constant missing from `camChecks`, and (c) a `LookAt` vector pointing away from `TargetAabb`.
- [ ] `./scripts/fastcheck.sh` and Gate 1 (`precheck.sh`) pass cleanly.
