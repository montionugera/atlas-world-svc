# Implementation Plan — F-105: Save and restore region state across a restart

## Goal
Enable `AtlasSimulation` to export and restore its complete region state (`RegionStateSnapshot`: active mobs, dead mob respawn timers, and world objects) across a server restart via `WorldStateStore`.

## Tasks

### Task 1: Add region state export/restore and `WorldStateStore` integration on `AtlasSimulation`
- **Files**:
  - `server-rs/src/simulation.rs`
  - `server-rs/tests/region_restart_persistence_test.rs`
- **Steps**:
  1. Write integration tests in `server-rs/tests/region_restart_persistence_test.rs` verifying:
     - Modifying active mob coordinates and HP, killing a mob to create a `DeadMobTracker`, and inserting a `WorldObjectRecord` in a region (`town-millcross`).
     - Saving region state via `sim.save_to_store(&store, saved_at_ms).await`.
     - Constructing a brand-new `AtlasSimulation` (simulating a server restart) and calling `new_sim.restore_from_store(&store, Some(restart_ms)).await`.
     - Verifying that active mobs, dead mob respawn timers (including downtime fast-forward), and world objects match their pre-restart state.
  2. Implement `world_objects`, `upsert_world_object`, `export_region_state`, `restore_region_state`, `save_to_store`, and `restore_from_store` on `AtlasSimulation`.
  3. Run `cargo test --test region_restart_persistence_test` and `cargo clippy` to verify all tests pass.
