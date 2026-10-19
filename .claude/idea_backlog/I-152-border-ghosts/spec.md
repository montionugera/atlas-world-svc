---
title: "Border ghosts"
id: I-152
status: idea
---

# Border ghosts

## Problem

Players approaching the boundary of a `4000 × 4000` region cannot see players or mobs located just across the seam in the neighbouring region until after crossing the border.

## Acceptance criteria

- [ ] `server-rs/src/spatial/border_ghosts.rs` defines `CardinalBorder` (`North`, `South`, `East`, `West`), `RegionAdjacencyGraph` (including the canonical Wealdmarch region adjacency topology and configurable neighbour links), and `extract_border_ghosts` using `BORDER_GHOST_BAND_UNITS` (`250.0` units from `WorldModelConfig`).
- [ ] Entities within `BORDER_GHOST_BAND_UNITS` (`250.0` units) of a shared border in a neighbouring region are projected into the local region's coordinate frame (e.g., an entity at `x = 40.0` near the west border of an east neighbour projects to `x = 4040.0` in the west region) and merged into the AOI snapshot pipeline (`broadcast_aoi_snapshots_with_ghosts_to_room`) as read-only ghost entities without duplicating simulation ticks.
- [ ] Automated tests verify that an entity within `BORDER_GHOST_BAND_UNITS` (`250.0`) of a border is visible in the neighbouring region's AOI-filtered snapshot stream, and ceases to be replicated (emitting `removed_ids`) when it moves outside the border ghost band.
