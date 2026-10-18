# ADR: E-004 Continuous Open World Model (`server-rs`)

- **Date:** 2026-10-18
- **Status:** Approved (`E-004` Slice 2 / `F-082`)
- **Inputs:**
  - `F-027` (`I-058` / `docs/superpowers/specs/2026-08-01-seamless-large-world-scaling-design.md`): Stage 1–5 AOI, residency (`LOCAL` / `GHOST`), border ghost bands, and hysteresis authority handoff design.
  - `F-081` (`I-144` / `docs/superpowers/specs/2026-10-18-server-rs-capacity-report.md`): Measured `server-rs` capacity table across `50`, `100`, `200`, and `400` entities at `20 Hz`.
  - `F-002` (`scripts/compile_world_maps.py`): 44 compiled v3 zone maps (`content/maps/<zoneId>.json`), each `4000 × 4000` units with deterministic terrain heightfields, terraces, obstacles, routes, and bestiary spawns.

## 1. Region Size (`4000 × 4000` units)

- **Decision:** Every region room corresponds to one compiled `4000 × 4000` world zone (`REGION_SIZE_UNITS = 4000.0`).
- **Rationale from `F-081`:** At `400` entities (`80` players + `320` mobs) inside a `4000 × 4000` region, `server-rs` completes a full simulation + snapshot tick in **`p95 ≈ 1.45 ms`** (< 3% of the 50 ms budget). A single `server-rs` process can therefore comfortably host multiple active `4000 × 4000` regions while sleeping empty regions (`Slice 6`).

## 2. Tick Budget & Area-of-Interest (`AOI`) Filtering

- **Tick Budget:** `20 Hz` (`TICK_BUDGET_MS = 50`, simulation warning threshold `SIM_WARN_BUDGET_MS = 15.0`).
- **AOI Radius (`Slice 3`):**
  - Enter radius: `AOI_ENTER_RADIUS_UNITS = 600.0` (1.5× the client `SERVER_RS_VIEWPORT = 400` span so entities enter replication smoothly outside the visible camera frame).
  - Exit radius (hysteresis): `AOI_EXIT_RADIUS_UNITS = 640.0` (`40.0` unit hysteresis band from `F-027` Stage 1 to prevent boundary oscillation).
  - When an entity leaves a player's AOI (`distance > 640.0`) while still alive in the region, the per-player snapshot includes its ID in `removed_ids` exactly once so the client removes the stale sprite cleanly.

## 3. World State Store (`Slice 7` & `Slice 8`)

- **Decision:** `WorldStateStore` trait (`server-rs/src/storage/world_store.rs`) with two implementations:
  1. **Local Atomic JSON Store (`FileWorldStateStore`):** Writes per-region snapshots (`RegionStateSnapshot`: tick, mob positions/HP/respawn timers, world objects) atomically via temp-file rename under `ATLAS_WORLD_STATE_DIR` (or in-memory `MemoryWorldStateStore` for unit tests).
  2. **Nakama Storage Adapter (`NakamaWorldStateStore`):** Persists region state documents to Nakama collection `"world_regions"`, key `<region_id>`.
- **Rationale:** Gives zero-dependency single-node persistence across restarts while supporting shared cluster state when Nakama is configured.

## 4. Border Ghosts & Authority Handoff (`Slice 9` & `Slice 10`)

- **Border Ghost Band (`Slice 9`):** `BORDER_GHOST_BAND_UNITS = 250.0`. Entities within `250.0` units of a region border (`x < 250`, `x > 3750`, `y < 250`, `y > 3750`) are mirrored as read-only border ghosts into the adjacent region's snapshot stream (offset into the neighbour's local coordinate frame) so players approaching a seam see entities across the border before crossing.
- **Authority Handoff (`Slice 10`):** `HANDOFF_HYSTERESIS_UNITS = 32.0`. When a player's position crosses a region boundary by at least `32.0` units in the outbound direction, the server transfers the player's live session (`session_rooms` mapping + avatar state: HP, cooldowns, velocity, entry position) to the neighbouring region room without requiring a manual WebSocket reconnect.
