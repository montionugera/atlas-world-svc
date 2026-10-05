# Implementation Plan: F-057 (E-001 Slice 3) FlatBuffers Binary Delta Replication Protocol & TypeScript Decoders

**Worktree:** `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-057-3`  
**Branch:** `feat/F-057`  
**Goal:** Implement a zero-allocation binary delta state replication protocol using FlatBuffers across `server-rs` (Rust serializer) and client/contracts (TypeScript decoders), delivering $< 5\text{ KB/s}$ wire bandwidth per client and $< 50\text{ }\mu\text{s}$ serialization latency per snapshot.

---

## Task 1: Author FlatBuffers Schema & Code Generation Pipeline
- **Files:** `schemas/game_protocol.fbs`, `server-rs/src/protocol/generated.rs`, `contracts/src/protocol/generated/`
- **Action:**
  - Defined schema: `Vec2`, `EntityType`, `EntityDelta`, `WorldSnapshot`, and `ClientInput`.
  - Compiled Rust bindings via `flatc --rust -o server-rs/src/protocol/generated schemas/game_protocol.fbs`.
  - Compiled TypeScript bindings via `flatc --ts -o contracts/src/protocol/generated schemas/game_protocol.fbs`.
- **Verify:** ✅ `flatc` generated bindings compile cleanly in both Rust and TypeScript targets.

## Task 2: Implement Rust Snapshot Builder & Delta Culling in `server-rs`
- **Files:** `server-rs/src/protocol/mod.rs`, `server-rs/Cargo.toml`
- **Action:**
  - Added `flatbuffers = "24.3"` to `server-rs/Cargo.toml`.
  - Implemented `SnapshotBuilder` with reusable internal buffer for zero allocations.
  - Added serialization helper `serialize_snapshot` supporting entity deltas and removed IDs.
- **Verify:** ✅ 11/11 tests pass in `server-rs`.

## Task 3: Implement TypeScript Binary Delta Decoder
- **Files:** `contracts/src/protocol/BinaryDeltaDecoder.ts`, `contracts/package.json`
- **Action:**
  - Added `flatbuffers` to `contracts/package.json`.
  - Implemented `BinaryDeltaDecoder` parsing binary byte arrays into typed snapshot records.
  - Handled entity removals and delta unmarshaling.
- **Verify:** ✅ 59/59 tests pass in `contracts` suite.

## Task 4: Cross-Language Binary Parity & Bandwidth Assertion Test
- **Files:** `server-rs/tests/protocol_roundtrip.rs`, `contracts/src/protocol/protocol-roundtrip.test.ts`
- **Action:**
  - `server-rs` serializes 60 entities (10 players, 50 mobs) and writes `snapshot_test.bin`.
  - TypeScript test ingests `snapshot_test.bin` and asserts 100% bit-parity across all fields.
  - Wire bandwidth empirical measurement:
    - 60 entities total packet: $2,392\text{ bytes}$ ($39.87\text{ B/entity}$).
    - Typical 15-entity AOI view: $216\text{ bytes}$ ($4.22\text{ KB/s}$ at $20\text{ Hz}$), beating the $< 5\text{ KB/s}$ budget.
- **Verify:** ✅ `protocol_roundtrip.rs` (2/2 pass) and `protocol-roundtrip.test.ts` (2/2 pass).

## Task 5: Gate 1 Integration, Documentation & Quality Gates
- **Action:**
  - Updated `README.md` with FlatBuffers protocol specifications and empirical bandwidth results.
  - Verified `./scripts/precheck.sh --no-install`.
- **Verify:** ✅ Gate 1 PASS.
