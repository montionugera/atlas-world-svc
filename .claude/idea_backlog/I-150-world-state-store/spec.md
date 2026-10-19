---
title: "World state store"
id: I-150
status: idea
---

# World state store

## Problem

`server-rs` has no persistence store for world region state (`RegionStateSnapshot`: active mobs, dead mob respawn timers, and world objects) as selected in the `E-004` Slice 2 decision record (`docs/superpowers/decisions/2026-10-18-e004-world-model-decision.md`).

## Acceptance criteria

- [ ] `server-rs/src/storage/world_store.rs` defines the serializable `RegionStateSnapshot`, `MobStateRecord`, `DeadMobRespawnRecord`, and `WorldObjectRecord` types and the async `WorldStateStore` trait (`save_region_state`, `load_region_state`, `delete_region_state`, `list_region_ids`).
- [ ] Implements `MemoryWorldStateStore` (in-memory store for unit tests), `FileWorldStateStore` (atomic temp-file + rename JSON store under `ATLAS_WORLD_STATE_DIR`), and `MetaWorldStateStore` (persisting region snapshots into collection `"world_regions"`, key `<region_id>` via `MetaDocStore` / `NakamaStorage`).
- [ ] Automated integration tests verify connecting, writing, reading, updating, and listing world state data across `MemoryWorldStateStore`, `FileWorldStateStore`, and `MetaWorldStateStore`.
