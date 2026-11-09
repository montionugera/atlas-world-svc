# POC-03: Playfulness — The Missing Delivery (04:15-06:15 Lantern Vermin shared rig, Soot Muncher encounter, parcel recovery) Implementation Plan

## Goal
Implement POC-03 beat: shared Lantern Vermin / Soot Muncher rig, authoritative server-rs combat range/HP/defeat/parcel recovery logic, Godot combat/hit/defeat animations & feedback, and full verification probes.

## Tasks
1. **Asset Manifest (`game-client/assets/manifest.json`)**:
   - Register `mob:lantern_vermin` and `mob:soot_muncher` with working `idle`, `walk`, `run`, `attack`, `hit`, and `death` clip mappings.

2. **Server-rs Meta Engine (`server-rs/src/meta/engine.rs`)**:
   - Add `resolve_poc_vermin_combat`, `recover_poc_parcel`, and `reset_poc_vermin_encounter` RPCs.
   - Enforce authoritative range checks (`<= 3.0m`), damage calculation, and defeat gating for parcel recovery.
   - Add unit test: `poc_maro_10m_vermin_combat_and_parcel_recovery()`.

3. **Game Client Controller (`game-client/src/World/MaroBellPocController.cs`)**:
   - Spawn Soot Muncher mob (`mob:soot_muncher`) at `(12.0, 0, 6.0)` on shared Lantern Vermin rig.
   - Add Missing Parcel object at `(12.5, 0, 4.0)`.
   - Implement `AttackSootMuncher`, `RecoverParcel`, `ReturnParcelToPip`, and `ResetVerminEncounter`.
   - Wire interactions in `TryInteractNearest` and `StepPlayer`.

4. **Godot Headless Probe (`game-client/src/World/MaroBellVerify.cs`)**:
   - Add `VerifyPoc03PlayfulnessSootMuncherEncounter` checking rig animations, out-of-range vs in-range attack authority, hit/defeat reaction, parcel recovery, and encounter reset.

5. **Integration Tests (`scripts/tests/poc-maro-playfulness.test.mjs`)**:
   - Node test suite verifying manifest entries, controller declarations, server-rs RPCs, and probe assertions.

6. **Verification & Quality Gate**:
   - Run `cargo fmt --manifest-path server-rs/Cargo.toml`.
   - Run `cargo test --manifest-path server-rs/Cargo.toml poc_maro_10m`.
   - Run `dotnet build game-client/GameClient.sln`.
   - Run `node --test scripts/tests/poc-maro-playfulness.test.mjs scripts/tests/poc-maro-warmth.test.mjs scripts/tests/poc-maro-wonder.test.mjs scripts/tests/maro-bell.test.mjs`.
   - Run `./scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL "MaroBellVerify.*VERDICT PASS"`.
