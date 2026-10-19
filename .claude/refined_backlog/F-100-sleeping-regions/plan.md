# Implementation Plan — F-100: Sleeping regions

## Goal
Pause simulation ticks (`step_if_awake`) on regions with 0 active human players (`PlayerAvatar`) and fast-forward `DeadMobTracker` respawn timers by the elapsed sleep duration when a player wakes the region.

## Tasks

### Task 1: Add region sleep/wake state and respawn timer fast-forward to `AtlasSimulation`
- **Files**:
  - `server-rs/src/simulation.rs`
  - `server-rs/tests/sleeping_regions_test.rs`
- **Steps**:
  1. Write unit and integration tests verifying:
     - `active_player_count()` returns the count of `PlayerAvatar` entities (ignoring bots).
     - `step_if_awake(now_ms, &[], &[])` transitions a 0-player region to `is_sleeping() == true` (`sleeping_since_ms() == Some(now_ms)`) and returns `None` without advancing `clock.tick()`.
     - When a mob is killed and tracked in `DeadMobTracker` with a 5.0s respawn timer, and the last player disconnects at `t = 1000ms`, the region enters sleep.
     - While asleep from `1000ms` to `4000ms` (`3.0s`), `step_if_awake` returns `None` and `clock.tick()` remains frozen.
     - When a player wakes the region at `t = 4000ms` (`wake(4000)` or `step_if_awake` with input), the `DeadMobTracker` timer is fast-forwarded by `3.0s` (only `2.0s` remaining).
     - When a player wakes a region after `6000ms` of sleep (`>= 5.0s` respawn delay), the dead mob respawns immediately at its `MobSpawnAnchor` before the first awake tick executes.
  2. Implement `active_player_count`, `is_sleeping`, `sleeping_since_ms`, `sleep`, `wake`, and `step_if_awake` on `AtlasSimulation`.
  3. Run `cargo test --test sleeping_regions_test` and `cargo test --lib` to verify all tests pass.
