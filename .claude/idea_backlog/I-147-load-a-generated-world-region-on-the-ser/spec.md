---
title: "Load a generated-world region on the server"
id: I-147
status: idea
---

# Load a generated-world region on the server

## Problem

`server-rs/src/content/map.rs` hard-codes `ROOM_IDS` to 5 test maps (`map-for-play` and 4 test sandboxes), causing any request for a compiled world region (`?map=millcross-ford`, `?map=thornveil`, etc.) to fall back to `map-for-play`. The server must recognize and load compiled generated-world regions (`content/maps/<region>.json`) with their authored `4000 × 4000` dimensions, height terraces, static obstacles, and bestiary spawn areas.

## Acceptance criteria

- [ ] `ROOM_IDS` and `room_id_for` in `server-rs/src/content/map.rs` include the generated-world region IDs (including `millcross-ford`, `thornveil`, `ashvale-front`, `northern-icefield`, `cindervast`) rather than falling back to `map-for-play`.
- [ ] `MapConfig::load("<region_id>")` loads the compiled v3 world region JSON (`content/maps/<region_id>.json`, with embedded fallbacks for core Wealdmarch regions) including its `4000 × 4000` dimensions, `terrain_amplitude`, `height_terraces`, `spawn_areas`, `static_obstacles`, and center `player_spawn` (`(2000.0, 2000.0)`).
- [ ] `AtlasSimulation::from_generated_region(region_id, seed)` constructs a simulation room directly from the region's `MapConfig` (using its dimensions and total mob count from `spawn_areas`), and `server-rs/src/main.rs` + `client/react-client/src/config/maps.ts` register the generated-world regions.
- [ ] Automated tests verify that `room_id_for("millcross-ford")` resolves to `"millcross-ford"`, `MapConfig::load("millcross-ford")` and `AtlasSimulation::from_generated_region("millcross-ford", ...)` spawn the region's authored mobs and obstacles on a `4000 × 4000` arena, and a WebSocket client connecting with `?map=millcross-ford` joins the `"millcross-ford"` room.
