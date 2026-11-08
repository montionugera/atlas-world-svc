---
title: "Unit contract: 1 server unit = 0.1 m; fix studio fields labelled metres (dimensions_meters 4000, spawn_point_meters, safeZoneRadiusMeters) that are really server units"
id: F-185
status: refined
from_idea: I-268
---

# Switch the whole game to metres: 1 unit = 1 m

## Goal
Owner decision 2026-11-08: one unit everywhere, **1 game unit = 1 metre**, so every number in code and content reads as metres. Nothing changes on screen: sizes, distances and speeds look and feel exactly as they do after F-184.

## Problem
Today the server works in units of 0.1 m (`coord_scale` 0.1 in `server-rs/src/content/map.rs` and the Godot client's `coordScale 0.1f`), while 3D assets are 1 unit = 1 m (`docs/asset-delivery-spec.md`). Studio world files mislabel server units as metres (`dimensions_meters: 4000`, `spawn_point_meters`, `safeZoneRadiusMeters`), so a 400 m map reads as 4000 m. Everyone who designs from those files is off by 10x.

## Approach
Divide every server-side length, position and speed by 10, then set `coord_scale` to 1 (or remove it). Do NOT just change `coord_scale` to 1: that makes every map, mob and hit area 10x bigger on screen.

## Order
Starts after F-184 (speed rescale) ships, because F-184 touches the same speed numbers.

## Scope
- server-rs: map sizes, positions, obstacles, spawn areas, radii, ranges, aggro, speeds, dash, projectile speeds, knockback impulses; physics (rapier) tuning re-checked so pushes and collisions behave the same.
- Content: all `content/maps/*.json` (45 maps incl. maro-bell), studio nodes and runtime manifest (fields named *_meters become true metres), bestiary/mob definitions, contracts.
- Clients: Godot (`coordScale`, `UnifiedMapDocument`, `MapChunkStreamer`, `MetaIds.cs` speed mirror) and the React client (`client/react-client`).
- Tools that read or write these numbers (map builder, compile_world_maps.py, validate_studio_hierarchy.py).

## Acceptance criteria
- [ ] One documented contract: "1 game unit = 1 m", in CLAUDE.md and the server map module; `coord_scale` is 1 or gone.
- [ ] Every content map converts by a committed one-shot script (idempotence-guarded); a test fails if any map still has 4000-scale numbers.
- [ ] Before/after parity test: for at least Maro Bell and one hunting field, on-screen size (m), player run speed (3 m/s), Maro Bell crossing time (45-65 s) and one mob's chase speed are unchanged.
- [ ] Combat/physics parity: knockback distance and projectile hit outcomes for the existing combat tests are unchanged in metres.
- [ ] Studio fields named *_meters hold true metres (e.g. a 400 m map says 400).
- [ ] Godot probe renders Maro Bell identically (same screenshot framing) and the React client still loads.
- [ ] Gate 1 green with `PRECHECK_FULL=1`.
