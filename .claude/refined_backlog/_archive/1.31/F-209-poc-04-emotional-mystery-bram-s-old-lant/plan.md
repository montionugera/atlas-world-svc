# POC-04: Emotional Mystery — Bram's Old Lantern and First Trace (06:15-07:45 inspect interaction and canon-safe POC flag) Implementation Plan

## Goal
Introduce the first subtle trace of the Last Cala Knight (`q-maro-04` *Bram's Old Lantern* `first_trace` beat) through human kindness and master craftsmanship without naming, numbering, or identifying her.

## Proposed Changes

### 1. `server-rs/src/meta/engine.rs`
- Add `rpc_inspect_poc_old_lantern(&self, user_id: &str) -> Result<Value, MetaError>`:
  - Loads `PocMaro10mState` from `COLLECTION_POC_MARO_10M` / `KEY_POC_SESSION_STATE`.
  - Sets `state.trace_glimpsed = true`.
  - Advances `state.active_beat` to `"POC-04"` if currently `"POC-00"`, `"POC-01"`, `"POC-02"`, or `"POC-03"`.
  - Persists state to SQLite doc store via `store.write_batch`.
  - Returns `{ ok: true, alreadyGlimpsed: bool, state: PocMaro10mState }`.
- Register `"inspect_poc_old_lantern"` in `RustMetaEngine::invoke_rpc`.
- Add unit test `poc_maro_10m_bram_and_old_lantern_inspect_authoritative_and_idempotent`.

### 2. `game-client/src/World/MaroBellPocController.cs`
- Define coordinates:
  - `BramWorldPos = new(-3.5f, 0f, -24.0f)`
  - `OldLanternWorldPos = new(3.5f, 0f, -38.0f)`
- Add properties:
  - `public EntityView? BramView { get; private set; }`
  - `public Node3D? OldLanternNode { get; private set; }`
  - `public OmniLight3D? OldLanternLight { get; private set; }`
  - `public MeshInstance3D? OldLanternGlowMesh { get; private set; }`
  - `public bool BramSpoken { get; private set; }`
  - `public bool TraceGlimpsed { get; private set; }`
- Spawning in `Initialize(doc)`:
  - Spawn `BramView` (Npc, position `BramWorldPos`, facing road, label `"[Lantern Keeper] Bram"`).
  - Create / bind `OldLanternNode` at `OldLanternWorldPos`.
  - Attach lantern label `"[Old Lantern - Press F]"`.
- Interaction methods:
  - `InteractWithBram()`:
    - Sets `BramSpoken = true`.
    - Dialogue: *"Bram: This lantern has kept vigil through forty winters. Years ago, when its reservoir cracked, a traveller passing through town repaired the seams with silver solder so fine no smith in Maro could match it. She asked for no coin, only that we keep the wick trimmed. Go have a look at the terrace shrine."*
    - Objective: `"Inspect Bram's old lantern at the Terrace Shrine [F]"`.
    - Audio cue: `AudioRegistry.Instance?.Play("sfx:bell_resonance", BramWorldPos);`.
  - `InspectOldLantern()`:
    - Sets `TraceGlimpsed = true`.
    - ActiveBeat becomes `"POC-04"`.
    - Dialogue: *"The silver brazing along the seams is impossibly delicate and even. An unknown master's hand mended this cold brass with patient devotion."*
    - Objective: `"Speak with Edda by the Great Bell staircase [F]"`.
    - Audio cue: `AudioRegistry.Instance?.Play("sfx:chime_bright", OldLanternWorldPos);`.
    - Light / emissive state for subtle warmth.
- Extend `TryInteractNearest(playerPos)`:
  - Check `BramWorldPos` within `InteractionRadiusMeters` -> `InteractWithBram()`.
  - Check `OldLanternWorldPos` within `InteractionRadiusMeters` -> `InspectOldLantern()`.
- Physics process:
  - Update `BramView?.Animation.Update(true, Vector3.Zero);`.

### 3. `game-client/src/World/MaroBellVerify.cs`
- Add `VerifyPoc04EmotionalMysteryBramOldLantern(UnifiedMapDocument doc)`:
  - Verifies `maro-bell.json` declarations (`npc-spot-bram`, `old-lantern`).
  - Verifies `BramView` spawned, idle animation.
  - Verifies `InteractWithBram()` dialogue, objective, and lack of forbidden tokens (zero "Ninth", zero "Cala Knight", zero names).
  - Verifies `InspectOldLantern()` close-up inspect interaction, audio event, beat transition to `"POC-04"`, `TraceGlimpsed = true`.
  - Verifies idempotency on repeated inspect calls.
- Call `VerifyPoc04EmotionalMysteryBramOldLantern(doc)` in `Run()`.

### 4. `scripts/tests/poc-maro-mystery.test.mjs`
- Test node suite verifying map declarations, C# controller definitions, C# verification probe, and Rust RPC declarations.
- Verify zero forbidden reveals across all dialogue and string constants.

## Verification Gates
1. `node --test scripts/tests/poc-maro-mystery.test.mjs`
2. `cargo test --manifest-path server-rs/Cargo.toml poc_maro_10m`
3. `cargo fmt --manifest-path server-rs/Cargo.toml --check`
4. `./scripts/godot-verify.sh`
5. `psrw ship --no-deploy`
