# Implementation Plan — F-103: World state store

## Goal
Define the serializable world region state models (`RegionStateSnapshot`, `MobStateRecord`, `DeadMobRespawnRecord`, `WorldObjectRecord`) and implement `WorldStateStore` across `MemoryWorldStateStore`, `FileWorldStateStore`, and `MetaWorldStateStore` in `server-rs/src/storage/world_store.rs`.

## Tasks

### Task 1: Implement `world_store.rs` and integration tests
- **Files**:
  - `server-rs/src/storage/world_store.rs`
  - `server-rs/src/storage/mod.rs`
  - `server-rs/tests/world_state_store_test.rs`
- **Steps**:
  1. Write integration tests in `server-rs/tests/world_state_store_test.rs` verifying `save_region_state`, `load_region_state`, `list_region_ids`, and `delete_region_state` across `MemoryWorldStateStore`, `FileWorldStateStore`, and `MetaWorldStateStore` (backed by both `InMemoryMetaStore` and `SqliteMetaStore`).
  2. Implement `server-rs/src/storage/world_store.rs` and re-export from `server-rs/src/storage/mod.rs`.
  3. Run `cargo test --test world_state_store_test` and `cargo clippy` to verify all tests pass.
