# POC-06: Player Impression Validation and Scorecard Gate Implementation Plan

## Overview
Implement the final validation slice of Epic `E-011` (`First 10 Minutes POC — The First Light of Maro Bell`):
1. Create `PocMaro10mVerify.cs` in `game-client/src/World/` providing headless end-to-end execution of all 6 POC beats (`POC-00` through `POC-05`), collecting beat timing telemetry and asserting the 7-metric POC Evaluation Scorecard.
2. Wire `ATLAS_VERIFY_POC_MARO_10M` in `game-client/src/VerticalSliceRoot.cs`.
3. Add telemetry timestamps and scorecard evaluation in `MaroBellPocController.cs`.
4. Document the playtest observation protocol and scorecard evaluation template.
5. Create `scripts/tests/poc-maro-scorecard.test.mjs` verifying node test coverage for scorecard calculations and save isolation.
6. Wire `E-011` in `scripts/epic-check.sh` so `psrw epic verify E-011` passes cleanly.
7. Run Gate 1 and ship `F-211`.

## Detailed Steps

### Step 1: Telemetry & Scorecard in `MaroBellPocController.cs`
- Add telemetry tracking for beat entry and completion timestamps (`BeatTimestamps` dictionary).
- Track frame time samples or simulation tick durations.
- Add `PocScorecardResult EvaluateScorecard()` validating:
  1. `LandmarkDiscovery`: Great Bell reveal composition valid and Pip discovered (100% vs 80% threshold).
  2. `MovementQuality`: 2.5D elevation followed, slope limit <= 35°, 3 m/s speed (100% vs 90% threshold).
  3. `WarmthRecall`: Amber errand accepted, workshop lantern lit with OmniLight3D + emissive mesh, Amber completed, oil rewarded (100% vs 70% threshold).
  4. `CombatClarity`: Soot Muncher melee range authority enforced (3.0m), defeat, parcel recovery, return to Pip (100% vs 80% threshold).
  5. `MysteryComprehension`: Bram spoken, Old Lantern inspected (`first_trace`), canon safety guaranteed (zero reveals of name or "the Ninth"), Edda timing anomaly noticed (100% vs 80% threshold).
  6. `CuriosityToContinue`: Time-Wound event witnessed, oil drain, stabilization completed, Whispering Glade hook unlocked (100% vs 70% threshold).
  7. `TechnicalStability`: 0 unhandled exceptions, zero save corruption (isolated `poc_maro_10m` collection), frame time under budget (100% vs 100% threshold).

### Step 2: Implement `PocMaro10mVerify.cs`
- Create `game-client/src/World/PocMaro10mVerify.cs`:
  - Run asynchronous simulation through all beats:
    - Beat 00: Initial state & endpoint resolution & 80x160m layout check.
    - Beat 01: Arrival -> StepPlayer to Pip -> Greet Pip -> Reveal composition check.
    - Beat 02: Walk to Amber -> Accept errand -> Light workshop lantern -> Return to Amber.
    - Beat 03: Melee attack Soot Muncher -> Defeat -> Recover parcel -> Deliver to Pip.
    - Beat 04: Walk to Bram -> Inspect Old Lantern -> First trace verified & canon checks passed.
    - Beat 05: Walk to Edda -> Witness Time-Wound oil drain -> Stabilize lantern -> Unlock Whispering Glade.
    - Beat 06: Evaluate scorecard -> Assert all 7 metrics meet or exceed target thresholds -> Log scorecard table.
  - Print `[PocMaro10mVerify] VERDICT PASS` (or FAIL) and exit tree with code 0 or 1.

### Step 3: Wire Probe in `VerticalSliceRoot.cs`
- Add `if (OS.GetEnvironment("ATLAS_VERIFY_POC_MARO_10M") == "1")` dispatch in `game-client/src/VerticalSliceRoot.cs`.

### Step 4: Unit Test Suite `poc-maro-scorecard.test.mjs`
- Create `scripts/tests/poc-maro-scorecard.test.mjs`:
  - Test scorecard structure, weights, and threshold bounds.
  - Test beat progression sequence (`POC-00` -> `POC-05` -> `POC-06`).
  - Test save isolation invariants (demo keys in `poc_maro_10m`, never canonical quests).
  - Verify all 7 metrics pass threshold requirements.

### Step 5: Wire `E-011` in `scripts/epic-check.sh`
- Add `E-011` case or block in `scripts/epic-check.sh`:
  - Support `PSRW_EPIC_ID=E-011` or full check.
  - Run node test suites (`poc-maro-integration.test.mjs`, `poc-maro-warmth.test.mjs`, `poc-maro-combat.test.mjs`, `poc-maro-mystery.test.mjs`, `poc-maro-disturbance.test.mjs`, `poc-maro-scorecard.test.mjs`).
  - Run Rust meta test (`cargo test --manifest-path server-rs/Cargo.toml poc_maro_10m`).
  - Run Godot verification probe (`./scripts/godot-verify.sh ATLAS_VERIFY_POC_MARO_10M '^\[PocMaro10mVerify\] VERDICT PASS$'`).

### Step 6: Verification & Ship
- Run all node tests.
- Run `server-rs` cargo tests and `cargo fmt`.
- Run Godot headless probe via `scripts/godot-verify.sh`.
- Run `psrw ship --no-deploy`.
