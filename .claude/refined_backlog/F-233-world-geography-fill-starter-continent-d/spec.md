---
title: "World geography fill, starter continent: district routes, terrain groups, climate and weather so the land reads as continuous"
id: F-233
status: refined
from_idea: I-318
---

# World geography fill, starter continent

Owner request, verbatim (2026-11-17): "continue on fill the the missing gap like Map Zone , Area , การเดินทาง
สภาพอากาศ ภูมิศาสตร์ ให้รู้สึกต่อเนื่อง สวยงาม ดูน่าค้นหา" (travel, weather, geography; it should feel
continuous, beautiful and worth exploring). Follows F-231 (canon sync), which records the owner's world model.

**The owner will confirm this by** opening a district record such as Teacup Meadows on
`http://atlas-edit.joymify.local.com/`, reading its terrain, climate and weather, and following
"Route to" links district by district from Maro Bell to Ondo Kiln, each with a gateway and a walk time.

## Problem (measured 2026-11-18, release/1.34)

- 96 `portal_edges` exist in `content/studio/districts/**`; 0 connect two different districts. No route
  joins Maro Bell's district to any other home town. Districts carry no position on the continent.
- Weather and climate: one `climate_profile` per continent with 1 weather phenomenon. 0 of 34 districts
  and 0 of 129 nodes have climate or weather. All 11 starter districts read as the same terracotta biome.
- The owner chose in chat (F-231 `world_model`, status chosen): one main continent in three terrain groups
  with transition zones (Green Lowlands: Maro Bell, Linde Glaze; Stone Highlands: Ondo Kiln, Daro Post;
  Old Wilds: Tava Fair, Silme Echo); travel in three layers; 8-15 min walk between neighbouring towns and
  15-30 min across a region; gateways are natural features (bridge, pass, tunnel). None of it is in the data.

## Scope

Continent 01 (Hearthbloom Basin, 11 districts, all six home towns) only. This matches the chosen
production scope (prologue + chapters 0-II). Continents 02 and 03 reuse the schema later.

## Sketch (frozen data contract)

- Each district file gains `geography`:
  `{terrain_group, map_position: {x, y} (0-100 continent grid), elevation_band (0 delta .. 4 high ridge),
  biome, climate: {temperature: warm|mild|cool|cold, moisture: dry|moderate|wet},
  weather: [{name, when, feel}] (2+), water, far_landmark (what is seen from the next district),
  discovery_hooks: [..] (2+ places between towns), status}`.
- The continent file gains `district_links[]`:
  `{id, a, b, gateway: {type: road|bridge|pass|tunnel|ford|stairs, name},
  route_type: main_road|wilderness_trail|ancient_route, walk_minutes, transition (one sentence on how
  terrain and weather change along the way), status}`.
- New content is `status: "proposed"` until the owner reviews it. It must build on each district's
  existing `core_rationale` and `local_conflict`, and on the canon glossary; it invents no new names for
  towns, races or NPCs, and passes `scripts/check_canon_names.mjs`.
- Schemas (`content/studio/schemas/district.schema.json`, `continent.schema.json`) describe the new fields.

## Gate (new checks in `scripts/validate_studio_hierarchy.py`, proven red-then-green)

- GEO-01 every district of a continent that has `district_links` has `geography`.
- GEO-02 the link graph is connected; both ends of every link exist on that continent; no duplicate pair.
- GEO-03 `walk_minutes` is 8-30.
- GEO-04 an elevation difference of 2 or more needs gateway type pass, tunnel or stairs.
- GEO-05 linked districts differ by at most one temperature step.
- GEO-06 a home town's district has the terrain group the glossary gives that town.
- GEO-07 no two linked districts have the same set of weather names.

## Game DB

`catalog_index.py`: relation "Route to" between district records (both directions), tags for terrain
group and climate, and the biome in the district summary.

## Non-goals

- Changing playable maps, node portals, level ranges or the runtime manifest.
- Renaming districts or towns (I-264). Weather rendering in the client. Continents 02 and 03.

## Acceptance criteria

- [ ] 11 of 11 continent-01 districts have `geography` with all contract fields and 2+ weather entries.
- [ ] `district_links` connects all 11 districts; a path exists between every pair of home-town districts.
- [ ] `python3 scripts/validate_studio_hierarchy.py --check` passes, and each GEO check fails when its rule is broken in a fixture.
- [ ] After a DB rebuild, the Teacup Meadows record lists at least one "Route to" relation.
- [ ] A lore reviewer reads all 11 districts in order of a walk and finds no abrupt jump (open-ended review, not a checklist).
- [ ] `./scripts/precheck.sh --no-install` is green.
