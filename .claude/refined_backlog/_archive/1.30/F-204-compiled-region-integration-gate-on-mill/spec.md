---
title: "Compiled-region integration gate on millcross-ford (C1-C8 + 64m AOI vs 24m chunk coverage)"
id: F-204
status: refined
from_idea: I-294
---

# I-294 Compiled-region integration gate on millcross-ford (C1–C8)

## Goal
Verify that compiled 400×400 m world-spine region maps (`millcross-ford`) share a consistent contract across `content/maps/millcross-ford.json`, `server-rs` (`world_regions.rs` + `map.rs`), and `game-client` (`UnifiedMapDocument.cs` + `TerrainElevation.cs` + `MapChunkStreamer.cs`), covering ChatGPT Technical Review v2.1 checks `C1`–`C8` including the 64 m AOI vs 24 m chunk-edge streaming boundary.

## Scope
- `scripts/tests/compiled-region-integration.test.mjs`:
  - `C1`: identity (`millcross-ford`, `metres-v1`, `400×400 m` across JSON, `server-rs`, and `game-client`).
  - `C2`: geography (`worldSpineBinding` matches `zone-millcross-ford.json` & `n-millcross.json`).
  - `C3`: spawn parity (`playerSpawn` and `spawnAreas` in server `[0..400]` <-> world `[-200..200]` coordinates).
  - `C4`: obstacles (`staticObstacles` 2D AABB bounds and `town-millcross.json` `0.1x` metre scaling).
  - `C5`: terrain & walkability parity (Rust & C# analytical heightfield + `35°` slope agreement on sampled grid).
  - `C6`: portals (unique IDs, in-bounds trigger coordinates, existing target map files).
  - `C7`: streaming vs AOI (`24 m` chunks, `activeChunkRadius = 2` -> `5×5 = 120 m` window; `60 m` from chunk center vs `48 m` worst-case from chunk edge vs `60/64 m` AOI and full `400×400 m` floor mesh).
  - `C8`: repeatability (`compile_world_maps.py --check` exits 0 with zero drift).

## Acceptance criteria
- [ ] `node --test scripts/tests/compiled-region-integration.test.mjs` passes all 8 checks (`C1`–`C8`).
- [ ] `python3 scripts/compile_world_maps.py --check` exits 0.
