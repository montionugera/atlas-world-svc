# F-107: Border ghosts — Implementation Plan

## Tasks
1. **Task 1: Create `server-rs/src/spatial/border_ghosts.rs` (`CardinalBorder`, `RegionAdjacencyGraph`, `extract_border_ghosts`)**
   - Define `BORDER_GHOST_BAND_UNITS = 250.0` (`WORLD_MODEL_CONTRACT.border_ghost_band_units`).
   - Define `CardinalBorder` (`North`, `South`, `East`, `West`) with `opposite()`.
   - Define `RegionAdjacencyGraph` with bidirectional `connect(region_a, border_from_a, region_b)` and `wealdmarch_default()` connecting `millcross-ford`, `thornveil`, `ashvale-front`, `northern-icefield`, `cindervast`, `emberdown`, `gildmark-head`, `hollowmarch`, `rooktide-reach`.
   - Implement `extract_border_ghosts(source_snapshot, border_from_target, region_width, region_height, band_units)` which projects players and mobs within `band_units` of the shared border into the target region's coordinate frame (`North => y' = y - H`, `South => y' = y + H`, `West => x' = x - W`, `East => x' = x + W`).
   - Re-export from `server-rs/src/spatial/mod.rs`.
2. **Task 2: Integrate border ghosts into `AoiTracker` (`server-rs/src/spatial/aoi.rs`) and `WsServer` (`server-rs/src/ws.rs`)**
   - Add `build_viewer_snapshot_with_ghosts` on `AoiTracker` accepting `&[PlayerState]` and `&[MobState]` ghost slices and merging them into the viewer's spatial index before filtering by AOI radius and entity budget.
   - Add `broadcast_aoi_snapshots_with_ghosts_to_room` on `WsServer`.
3. **Task 3: Integration test (`server-rs/tests/border_ghosts_test.rs`)**
   - Verify cross-border ghost projection across shared N/S/E/W borders, AOI visibility + entityleave when moving out of band, and no local simulation mutation of ghost entities.
