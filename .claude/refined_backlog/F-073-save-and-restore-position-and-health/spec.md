---
title: "Save and restore position and health"
id: F-073
status: refined
from_idea: I-142
---

# Save and restore position and health

Part of Epic `E-003` (Persistent accounts and characters — Slice 7).

## Context & Problem

Even after `F-071` applies a player's saved level, stats, and weapon on join, every join spawns the player at a fresh deterministic spawn point with full health, and leaving or crashing loses their world position and current health.

## Acceptance criteria

- [ ] `@atlas/contracts` defines `CharacterStateDoc` (`schemaVersion: 1`, `mapId`, `x`, `y`, `health`, `seq`), adds optional `characterState?: CharacterStateDoc` to `LoadoutSnapshot` (`loadoutSnapshotSchema`), and registers `RPC.saveCharacterState = "save_character_state"`.
- [ ] `nakama` implements S2S-only `save_character_state` RPC (`nakama/src/rpc/saveCharacterState.ts`, registered in `nakama/src/main.ts`) with CAS storage and monotonic `seq` deduplication so out-of-order writes cannot clobber newer state, and `getLoadout` includes `characterState` when saved.
- [ ] `server-rs` adds `CharacterStateSnapshot` to `LoadoutSnapshot`, implements `save_character_state` on `NakamaClient` / `MockNakamaClient` / `NakamaStorage` using a timestamp-seeded monotonic `seq` (safe across server crashes/restarts), and restores saved `(x, y)` (clamped to arena bounds) and `health` (clamped to `(0.0..=max_health)`, respawning at full health if saved at `<= 0.0`) when spawning a player in `AtlasSimulation`.
- [ ] `AtlasSimulation::live_tick` captures departing players' `(x, y, health)` before despawn on leave, and `CharacterStateBuffer` flushes character states immediately on player leave, on a periodic checkpoint interval (so state survives an unclean server crash), and on graceful shutdown.
- [ ] Unit and integration tests in `contracts`, `nakama`, and `server-rs/tests/nakama_persistence.rs` verify saving on interval and on leave, monotonic `seq` crash/reorder safety, and restoring position and health on rejoin.
