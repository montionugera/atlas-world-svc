---
title: "Derive client obstacles and spawn from the same source"
id: F-098
---

# Implementation Plan — F-098: Derive client obstacles and spawn from the same source

## Goal

Eliminate hand-copied obstacle and spawn geometry between `server-rs` and `client/react-client` by generating a shared client manifest (`client/react-client/src/data/generatedWorldMaps.json`) directly from `content/maps/*.json` and `content/towns/town-millcross.json` in `scripts/compile_world_maps.py`, and wiring `maps.ts`, `terrain.ts`, `terrainRenderer.ts`, and `serverMapParity.test.ts` to derive obstacle rectangles, spawn areas, and player spawn points from that shared source with zero diff.

## Tasks

### Task 1: Emit shared client world-map manifest from `scripts/compile_world_maps.py`
- **Files:**
  - Modify: `scripts/compile_world_maps.py`
  - Create/Update: `client/react-client/src/data/generatedWorldMaps.json`
- **Steps:**
  1. Extend `scripts/compile_world_maps.py` so every run compiles `client/react-client/src/data/generatedWorldMaps.json` containing:
     - `millcrossTownFootprints`: all footprints from `content/towns/town-millcross.json` (`id`, `kind`, `x: rect[0] + 100`, `y: rect[1] + 100`, `width: rect[2] - rect[0]`, `height: rect[3] - rect[1]`, `storeys`).
     - `playMapSpawnAreas`: the resolved `map-for-play` spawn areas from `content/generated/spawn-areas.json`.
     - `regions`: for each of the 9 canonical Wealdmarch regions (`millcross-ford`, `thornveil`, `ashvale-front`, `northern-icefield`, `cindervast`, `emberdown`, `gildmark-head`, `hollowmarch`, `rooktide-reach`), its `id`, `name`, `width`, `height`, `playerSpawn` (`{ x: width / 2, y: height / 2 }`), `staticObstacles` (`id`, `min_x`, `min_y`, `max_x`, `max_y`), and `spawnAreas` (`id`, `x`, `y`, `width`, `height`, `mobType`, `count`).
  2. Run `python3 scripts/compile_world_maps.py` and verify `client/react-client/src/data/generatedWorldMaps.json` is generated deterministically.

### Task 2: Derive `maps.ts`, `terrain.ts`, and `terrainRenderer.ts` from the shared manifest
- **Files:**
  - Modify: `client/react-client/src/config/maps.ts`
  - Modify: `client/react-client/src/config/terrain.ts`
  - Modify: `client/react-client/src/renderers/terrainRenderer.ts`
- **Steps:**
  1. In `client/react-client/src/config/maps.ts`, export `GENERATED_REGION_MAPS` derived from `generatedWorldMaps.json` and include them in `WORLD_MAPS` / `mapDef(mapId)` / `mapIdFromSearch(search)` while preserving `MAPS` for the 5 core rooms (`map-for-play` + 4 test rooms) so existing UI/tests remain 100% compatible and `?map=millcross-ford` (or any generated region) resolves its `4000 × 4000` `MapDef`.
  2. In `client/react-client/src/config/terrain.ts`, derive `staticBlocksFor(mapId)`, `spawnAreasFor(mapId)`, and `playerSpawnFor(mapId)` from `generatedWorldMaps.json` for `map-for-play` and all 9 generated regions (`millcross-ford`, etc.).
  3. In `client/react-client/src/renderers/terrainRenderer.ts`, derive `MILLCROSS_BUILDINGS` directly from `generatedWorldMaps.millcrossTownFootprints` instead of hand-copied coordinates.

### Task 3: Zero-diff parity tests across client, server-rs, and generated map JSON
- **Files:**
  - Modify: `client/react-client/src/config/serverMapParity.test.ts`
  - Modify: `client/react-client/src/config/maps.test.ts`
- **Steps:**
  1. Add tests in `client/react-client/src/config/serverMapParity.test.ts` reading `content/maps/<regionId>.json` and `content/towns/town-millcross.json` from disk and asserting that `staticBlocksFor(regionId)`, `spawnAreasFor(regionId)`, `playerSpawnFor(regionId)`, and `MILLCROSS_BUILDINGS` match the authoritative files and `server-rs` `MapConfig` rules with zero diff and no hand copies.
  2. Run `pnpm --filter atlas-react-client test -- --watchAll=false` and `cargo test --manifest-path server-rs/Cargo.toml`.
