# POC-02: Warmth — A Small Kindness (02:30-04:15 Amber lantern errand and authoritative unlit->lit state change) Implementation Plan

## Goal
Implement POC-02 beat in Maro Bell: Amber NPC interaction, village lantern unlit->lit state transition with warm OmniLight3D and emissive material, authoritative and idempotent server-rs RPCs, and full verification probes.

## Tasks
1. **Server-rs Meta Engine (`server-rs/src/meta/engine.rs`)**:
   - Register `accept_poc_amber_errand` and `complete_poc_amber_errand` RPCs.
   - Enforce idempotency: repeated completions do not duplicate rewards or `lanterns_lit` entries.
   - Dedup `lanterns_lit` in `update_poc_maro_10m_state`.
   - Add unit test: `poc_maro_10m_amber_errand_authoritative_and_idempotent()`.

2. **Game Client Controller (`game-client/src/World/MaroBellPocController.cs`)**:
   - Add Amber NPC at `(1.0, 0, 28.0)` with overhead prompt.
   - Add workshop lantern node setup (`lantern-06` at `(-0.8, 0, 23.7)`).
   - Implement `OmniLight3D` + warm emissive material state change on lighting lantern.
   - Implement Amber errand flow (`StartAmberErrand`, `LightVillageLantern`, `CompleteAmberErrand`) with idempotency.
   - Wire interaction in `TryInteractNearest` and proximity barks in `StepPlayer`.

3. **Godot Headless Probe (`game-client/src/World/MaroBellVerify.cs`)**:
   - Add `VerifyPoc02WarmthAmberLanternErrand` validating Amber placement, errand start, lantern lighting, OmniLight3D presence, errand completion, beat transition to `POC-02`, and idempotency.

4. **Integration Tests (`scripts/tests/poc-maro-warmth.test.mjs`)**:
   - Node test suite verifying map contracts, controller declarations, server-rs RPC contracts, and probe wiring.

5. **Verification & Quality Gate**:
   - Run `cargo test --manifest-path server-rs/Cargo.toml poc_maro_10m`.
   - Run `cargo fmt --manifest-path server-rs/Cargo.toml`.
   - Run `dotnet build game-client/AtlasWorld.sln`.
   - Run `node --test scripts/tests/poc-maro-warmth.test.mjs scripts/tests/poc-maro-wonder.test.mjs scripts/tests/maro-bell.test.mjs`.
   - Run `./scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL "MaroBellVerify.*VERDICT PASS"`.
