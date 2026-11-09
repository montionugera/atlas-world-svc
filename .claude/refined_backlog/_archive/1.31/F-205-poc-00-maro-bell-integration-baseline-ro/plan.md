# F-205 (I-287) Implementation Plan — POC-00: Maro Bell Integration Baseline

## Goal
Establish a repeatable build of **Maro Bell** (`content/maps/maro-bell.json`, `80×160 m`) across `server-rs`, `RustMetaEngine`, and `game-client` (`metres-v1`, `coord_scale == 1.0`, `35°` walkable slope, `?map=maro-bell` / `?room=maro-bell` routing with no fallback to `map-for-play`, reproducible `poc_maro_10m` session reset isolated from canonical saves, and minimal POC diagnostics HUD).

## Tasks

### Task 1: `server-rs` Maro Bell Room Routing & Authoritative Simulation
- **Files:**
  - `server-rs/src/content/world_regions.rs`
  - `server-rs/src/net/ws.rs`
  - `server-rs/src/simulation.rs`
  - `server-rs/src/main.rs`
- **Changes:**
  - Embed `MARO_BELL_JSON` in `world_regions.rs`, return it from `embedded_region_json("maro-bell")`, and resolve `"maro-bell"` in `resolve_room_or_region_id("maro-bell") -> "maro-bell"`.
  - In `ws.rs::extract_map`, accept both `map` and `room` query keys (`?map=maro-bell` or `?room=maro-bell`).
  - In `simulation.rs::from_generated_region`, set `mob_count` to `0` when `cfg.spawn_areas.is_empty()` so peaceful settlement maps do not spawn fallback mobs.
  - In `main.rs`, register `"maro-bell"` in `rooms` via `AtlasSimulation::from_generated_region("maro-bell", seed.wrapping_add(99))`.
  - Add unit tests in `world_regions.rs` proving `"maro-bell"` routing, `80×160 m` bounds, `(40.0, 151.0)` South Gate spawn, static obstacle collision, and `35°` slope limit.

### Task 2: `RustMetaEngine` Reproducible POC Reset (`poc_maro_10m` Isolation)
- **Files:**
  - `server-rs/src/meta/engine.rs`
- **Changes:**
  - Add `PocMaro10mState` stored in collection `"poc_maro_10m"`, key `"session_state"`.
  - Implement client RPCs `"reset_poc_maro_10m"`, `"get_poc_maro_10m_state"`, and `"update_poc_maro_10m_state"` in `RustMetaEngine::invoke_rpc`.
  - Add unit tests in `server-rs/src/meta/engine.rs` proving reproducible reset and strict isolation from canonical `quest_progress` (`q-maro-01..08`) and `character_progress`.

### Task 3: `game-client` Room Endpoint Routing & Diagnostics HUD
- **Files:**
  - `game-client/src/Core/Config.cs`
  - `game-client/src/UI/Widgets/MaroBellPocDiagnosticsHud.cs`
  - `game-client/src/VerticalSliceRoot.cs`
  - `game-client/src/World/PlaytestSandboxRoot.cs`
  - `game-client/src/World/MaroBellVerify.cs`
  - `scripts/tests/poc-maro-baseline.test.mjs`
- **Changes:**
  - Add `Config.ResolveServerRsEndpointForMap(string endpoint, string mapId)` to thread `map=<mapId>` into the `server-rs` WebSocket URL.
  - Create `MaroBellPocDiagnosticsHud` displaying `mapId`, player world/server position, connection state, frame time (`ms`/`FPS`), unit/slope contract (`1u=1m | 20Hz | 35°`), and active POC beat (`POC-00`).
  - Wire `ResolveServerRsEndpointForMap` and `MaroBellPocDiagnosticsHud` into `VerticalSliceRoot` and `PlaytestSandboxRoot`.
  - Add assertions to `MaroBellVerify.cs` and create `scripts/tests/poc-maro-baseline.test.mjs` verifying all 4 acceptance criteria.
