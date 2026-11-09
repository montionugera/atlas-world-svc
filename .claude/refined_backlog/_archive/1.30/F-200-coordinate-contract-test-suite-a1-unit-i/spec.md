---
title: "Coordinate contract test suite (A1 unit identity, A5 attack range metres, A6 region boundary, A7 slope parity)"
id: F-200
status: refined
from_idea: I-283
---

# I-283 Coordinate contract test suite (A1, A5, A6, A7)

## Goal
Add a single shared coordinate-contract test suite and fixture derived from real map data covering the safe static/Rust/client-constant subset (A1 unit identity, A5 attack range metres, A6 region boundary, A7 slope parity 35 deg), and update the stale pre-F-185 comment in `game-client/src/World/AnimationVerify.cs`.

## Scope
- `scripts/tests/fixtures/coordinate-contract-fixture.json`: shared fixture with independent expected values grounded in real map data (`millcross-ford.json`, `freja-south-gate.json`) and `docs/unit-contract.md`.
- `scripts/tests/coordinate-contract.test.mjs`:
  - `A1` unit identity: `1 unit = 1 metre`, `coord_scale == 1.0` in `server-rs/src/content/map.rs` and `ServerCoordScale == 1.0f` in `game-client/src/VerticalSliceRoot.cs`, and map `unitContract == "metres-v1"`.
  - `A5` attack range in metres: melee and ranged ranges in `server-rs` (`CombatStats::default().attack_range`, `DerivedMobStats::attack_range`, `EquippedWeapon` ranges) and `game-client` (`VerticalSliceRoot.MeleeAttackRangeWorld`) are in realistic metre bands (`[1.5, 5.0]` m melee, `[10.0, 40.0]` m ranged), never legacy `0.1 m` (`20..300`) values.
  - `A6` region boundary: `REGION_SIZE_UNITS == 400.0`, `AOI_ENTER_RADIUS_UNITS == 60.0`, `AOI_EXIT_RADIUS_UNITS == 64.0`, `BORDER_GHOST_BAND_UNITS == 25.0`, `HANDOFF_HYSTERESIS_UNITS == 3.2`, matching compiled 400x400 m region maps (`millcross-ford.json`).
  - `A7` walkable slope parity: `MAX_WALKABLE_SLOPE_DEG == 35.0` in `server-rs/src/content/map.rs` and `MaxWalkableSlopeDeg == 35.0f` in `game-client/src/World/TerrainElevation.cs`.
- `game-client/src/World/AnimationVerify.cs`: update stale comment at line 64 from `30 server u/s * 0.1` to `3.0 m/s (1 unit = 1 m)`.

## Acceptance criteria
- [ ] Shared fixture `scripts/tests/fixtures/coordinate-contract-fixture.json` exists with expected values not copied from a single implementation.
- [ ] `node --test scripts/tests/coordinate-contract.test.mjs` passes all 4 cases (`A1`, `A5`, `A6`, `A7`).
- [ ] Mutation check verified: flipping each constant fails the corresponding test case.
- [ ] Stale comment in `game-client/src/World/AnimationVerify.cs` is updated.
