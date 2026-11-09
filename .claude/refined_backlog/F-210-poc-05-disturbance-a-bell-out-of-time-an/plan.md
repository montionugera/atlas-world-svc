# POC-05: Disturbance — A Bell Out of Time and The Impossible Flame (07:45-10:00 Edda anomaly and Time-Wound climax) Implementation Plan

## Goal
End the 10-minute experience with a clear supernatural time anomaly (`q-maro-05` + `q-maro-06` Time-Wound climax) while keeping the atmosphere hopeful and leaving the player curious to explore beyond Maro Bell.

## Proposed Changes

### 1. `server-rs/src/meta/engine.rs`
- Add `rpc_trigger_poc_time_wound(&self, user_id: &str) -> Result<Value, MetaError>`:
  - Loads `PocMaro10mState` from `poc_maro_10m` / `session_state`.
  - Sets `state.edda_spoken = true`.
  - Sets `state.time_wound_triggered = true`.
  - Sets `state.glade_hook_unlocked = true`.
  - Advances `state.active_beat` to `"POC-05"`.
  - Persists state to SQLite doc store via `store.write_batch`.
  - Returns `{ ok: true, alreadyTriggered: bool, state: PocMaro10mState }`.
- Register `"trigger_poc_time_wound"` in `invoke_rpc`.
- Add unit test: `poc_maro_10m_edda_and_time_wound_event_authoritative_and_idempotent`.

### 2. `game-client/src/World/MaroBellPocController.cs`
- Define coordinates:
  - `EddaWorldPos = new(-3.0f, 0f, -57.0f)`
  - `TimeWoundLanternWorldPos = new(2.5f, 0f, -54.0f)`
- Add properties:
  - `public EntityView? EddaView { get; private set; }`
  - `public Node3D? TimeWoundLanternNode { get; private set; }`
  - `public OmniLight3D? TimeWoundLanternLight { get; private set; }`
  - `public MeshInstance3D? TimeWoundLanternGlowMesh { get; private set; }`
  - `public bool EddaSpoken { get; private set; }`
  - `public bool TimeWoundTriggered { get; private set; }`
  - `public bool TimeWoundStabilized { get; private set; }`
  - `public bool GladeHookUnlocked { get; private set; }`
- Spawning:
  - In `SpawnNpcs`: spawn `EddaView` (EntityKind.Npc) at `EddaWorldPos`, label `"[Bell Keeper] Edda\n[F] Speak"`.
  - In `SetupLanternNodes`: spawn `TimeWoundLanternNode` at `TimeWoundLanternWorldPos` with initial warm light/glow.
- Lifecycle methods:
  - `InteractWithEdda()`:
    - Pre-stabilization: discusses Great Bell timing mismatch, plays `sfx:bell_toll`, sets objective to investigate flickering lantern.
    - Post-stabilization: discusses the impossible flame, unlocks Whispering Glade hook, provides closing invitation.
  - `TriggerTimeWoundEvent()`:
    - Freezes lantern with unnatural cold, rapidly drains oil, dims light to purple/violet hue, plays `sfx:whisper_wind`, sets `TimeWoundTriggered = true`.
  - `StabilizeTimeWoundLantern()`:
    - Trims wick and shields cold casing, restores warm spark, plays `sfx:chime_bright`, sets `TimeWoundStabilized = true`, advances `ActiveBeat` to `"POC-05"`.
- Extend `TryInteractNearest(playerPos)` for `EddaWorldPos` and `TimeWoundLanternWorldPos`.
- Update `_PhysicsProcess` for `EddaView`.

### 3. `game-client/src/World/MaroBellVerify.cs`
- Add `VerifyPoc05DisturbanceEddaTimeWound(UnifiedMapDocument doc)`:
  - Asserts `maro-bell.json` declares `npc-spot-edda` at `(-3, -57)`.
  - Asserts `EddaView` and `TimeWoundLanternNode` spawned.
  - Tests `InteractWithEdda()`, `TriggerTimeWoundEvent()`, `StabilizeTimeWoundLantern()`, and return to Edda for Whispering Glade hook.
  - Tests idempotency.

### 4. `scripts/tests/poc-maro-disturbance.test.mjs`
- Automated node test verifying map, C#, and Rust declarations for POC-05.

## Verification
1. `node --test scripts/tests/poc-*.test.mjs`
2. `cargo fmt --manifest-path server-rs/Cargo.toml --check`
3. `cargo test --manifest-path server-rs/Cargo.toml poc_maro_10m`
4. `./scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL '^\[MaroBellVerify\] VERDICT PASS$'`
5. `psrw ship --no-deploy`
