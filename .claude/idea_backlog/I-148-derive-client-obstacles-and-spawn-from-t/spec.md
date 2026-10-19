---
title: "Derive client obstacles and spawn from the same source"
id: I-148
status: idea
---

# Derive client obstacles and spawn from the same source

## Problem

`client/react-client` maintains hand-copied obstacle and building geometry (`MILLCROSS_BUILDINGS` in `terrainRenderer.ts`, `STATIC_BLOCKS_BY_MAP` in `terrain.ts`) and only lists the 5 legacy rooms in `maps.ts`. When loading a generated-world region (`millcross-ford`, `thornveil`, `ashvale-front`, `northern-icefield`, `cindervast`, `emberdown`, `gildmark-head`, `hollowmarch`, `rooktide-reach`) or `map-for-play`, client obstacles and server spawn points can drift because they are not derived from the same authoritative JSON source (`content/maps/<regionId>.json` and `content/towns/town-millcross.json`).

## Acceptance criteria

- [ ] `scripts/compile_world_maps.py` (and the shared map loader in `client/react-client/src/config/`) derives a deterministic client world-map manifest from `content/maps/*.json` and `content/towns/town-millcross.json` with zero hand-copied obstacle or spawn coordinates.
- [ ] `client/react-client/src/renderers/terrainRenderer.ts` (`MILLCROSS_BUILDINGS`), `client/react-client/src/config/terrain.ts` (`staticBlocksFor`, `spawnAreasFor`, `playerSpawnFor`), and `client/react-client/src/config/maps.ts` (`MAPS`) derive obstacle rectangles, spawn areas, and player spawn points for `map-for-play` and all generated-world regions (`GENERATED_REGION_IDS`) from the shared source.
- [ ] Automated parity tests in `client/react-client/src/config/serverMapParity.test.ts` and `server-rs/src/content/world_regions.rs` verify that client obstacle geometry (`staticBlocksFor`) and server spawn points (`spawnAreas`, `playerSpawn`) match the generated map source (`content/maps/<regionId>.json` and `content/towns/town-millcross.json`) with zero diff and no hand copies.
