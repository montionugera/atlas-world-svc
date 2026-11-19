# Chapter 0 slice: rewire Maro-Linde-Kilnwatch portals and retune levels for Lv 1-15

Status: draft for build. Follows F-233 (world geography) and F-235 (world structure merge, owner decisions).

## Goal

Make the first content target (owner decision 2026-11-18: Lv 1-15, chapter 0, Maro Bell + Kilnwatch first) hold in the
playable studio data: the three districts Teacup Meadows, Porcelain Cradle and Kilnfire Terraces form a walkable
triangle, and two race homes (Maro, Linde) each have a real Lv 1-10 start that leads into Lv 10-15.

F-235 only recorded the plan (`encounter_bands`, link `priority`, `legacy_portals` rulings). This feature is the first
one that changes node portals, `level_range` and spawn levels.

## Scope: three districts only

| District | Town node | Other nodes |
|---|---|---|
| Teacup Meadows | `town-lantern-hollow` | `hunting-area-clover-south-gate`, `hunting-area-kiln-east-orchard`, `dungeon-kiln-cellar`, `hunting-area-whispering-mire` (mystery) |
| Porcelain Cradle | `town-porcelain-loom-sanctuary` | `hunting-area-celadon-causeway`, `dungeon-medallion-heart-vault`, `hunting-area-lotus-kiln-rim` (mystery) |
| Kilnfire Terraces | `town-kilnwatch-bastion` | `hunting-area-cinder-apron`, `hunting-area-slag-chasm` (mystery) |

Files: `content/studio/nodes/continent-01-hearthbloom-basin/<district>/`, `content/studio/districts/continent-01-hearthbloom-basin/district-<slug>.json`,
`content/studio/continents/continent-01-hearthbloom-basin.json`, and the generated `content/maps/_manifest.runtime.json` (+ whatever `compile_world_maps.py` regenerates).

## Requirements

### R1. Close the triangle (two new bidirectional portal pairs)

- R1a. Teacup Meadows <-> Porcelain Cradle, the P0 link `link-teacup-meadows--porcelain-cradle` ("Celadon Causeway Road").
  Endpoints: `town-lantern-hollow` <-> `hunting-area-celadon-causeway`.
- R1b. Porcelain Cradle <-> Kilnfire Terraces, the P0 link `link-porcelain-cradle--kilnfire-terraces` ("Lotus Rim Stairs").
  Endpoints: `hunting-area-celadon-causeway` <-> `town-kilnwatch-bastion`. (`hunting-area-lotus-kiln-rim` is a mystery
  node and stays fog-gated; it is not used as the route.)
- Each pair: a portal on both node files (same JSON shape as the existing ones: `portal_id`, `direction`,
  `target_node_id`, `target_map_id`, `target_direction`, `gate_state: "open"`, `trigger_box_meters`,
  `arrival_point_meters`) and, if cross-district portals are also mirrored in `portal_edges`, the same there. Follow
  how the existing cross-district pair `hunting-area-kiln-east-orchard` <-> `town-kilnwatch-bastion` is recorded and do exactly that.
- Directions: use a free direction slot on each node. Prefer the slot that matches the districts' `geography.position`
  (x east, y south). If the geographically right slot is taken, use the nearest free one and list it in the report.
  Trigger box and arrival point must lie inside the map bounds, on the edge for that direction, like the existing portals on the same node.
- Both links' `priority` becomes `built`.

### R2. Remove the one legacy portal whose replacement now exists

- Delete the portal pair `town-draft-kiln-post` <-> `hunting-area-celadon-causeway` (ruling `remove`) from both node
  files, from any `portal_edges`, and delete its two `legacy_portals` entries.
- Leave every other `legacy_portals` entry and its live portal untouched (the two `becomes_transport` pairs and the
  `keep` entry that touch these districts are out of scope).
- Stop and report instead of deleting if INV-04 (reachability from a starter town) fails for any Ash-Bellows node afterwards.

### R3. Retune levels to the encounter bands

Target after the change:

| Node | `level_range` now | target | Spawn levels now | target spread |
|---|---|---|---|---|
| `town-lantern-hollow` | [1,5] | unchanged | none | none |
| `hunting-area-clover-south-gate` | [1,10] | unchanged | 2-5 | cover 1-9 |
| `hunting-area-kiln-east-orchard` | [6,15] | [10,15] | 9 only | cover 10-14 |
| `dungeon-kiln-cellar` | [10,18] | [13,15] | 13-16 | 13-15 |
| `town-porcelain-loom-sanctuary` | [11,14] | [1,5] | none | none |
| `hunting-area-celadon-causeway` | [10,12] | [1,10] | 10-12 | cover 1-9 |
| `dungeon-medallion-heart-vault` | [13,15] | unchanged | 13-15 | unchanged |
| Kilnfire Terraces nodes | | unchanged | | unchanged |

- District `level_range`: Porcelain Cradle [10,15] -> [1,15]. Teacup Meadows and Kilnfire Terraces unchanged. Fix any
  `level_band_label` that the change makes wrong.
- "Cover a-b" means: the lowest spawn level is at most a+1, the highest is at least b-1, and no gap between consecutive
  spawn levels in the node is larger than 3. Reuse the monsters already on the node; change `level`, and add a second
  spawn entry of an existing monster on that node only if needed to close a gap. No new monster families.
- Before changing a spawn `level`: find where that `monster_id` is defined (monster catalog / studio monster files). If
  a monster has its own level or level-derived stats there, keep the two consistent in the same change; if that is not
  possible without inventing data, stop and report.
- `encounter_bands.status` for Teacup Meadows and Porcelain Cradle goes from `proposed` to `applied`, if the validator
  accepts that value; otherwise leave it and say so.

### R4. Regenerate and keep every gate green

- Regenerate the runtime manifest the supported way (`python3 scripts/compile_world_maps.py`), commit the regenerated output.
- All of these pass:
  - `python3 scripts/validate_studio_hierarchy.py --check`
  - `python3 -m unittest tests.test_validate_studio_hierarchy`
  - `python3 scripts/compile_world_maps.py --check`
  - `cd scripts && node --test tests/catalog-canon.test.mjs tests/catalog-records.test.mjs tests/canon-names.test.mjs tests/compiled-region-integration.test.mjs`
  - `cd scripts && node --test tests/atlas-web-records.test.mjs` (run alone)
  - `node scripts/check_canon_names.mjs`
  - `python3 scripts/build_catalog_db.py`

### R5. One new automated rule

Add GEO-11 to `scripts/validate_studio_hierarchy.py` with a test in `tests/test_validate_studio_hierarchy.py`:
a `district_links` entry with `priority: "built"` must have at least one open node portal in each direction between its
two districts. (Today `built` is only a label; this makes R1 checkable and stops a link being marked built with no way through.)
The test must fail when one of the new portals is removed from a fixture.

## Acceptance criteria

- [ ] From `town-lantern-hollow` there is an open-portal path to `town-porcelain-loom-sanctuary` and to
   `town-kilnwatch-bastion`, and from `town-porcelain-loom-sanctuary` to `town-kilnwatch-bastion`, using only nodes in
   these three districts, in both directions. Show it with a short script run against the committed JSON, not by reading.
- [ ] No node portal from these three districts targets `town-draft-kiln-post`, and `legacy_portals` has exactly two fewer entries.
- [ ] The table in R3 holds (print node, `level_range`, sorted spawn levels).
- [ ] All R4 commands pass; `git status` is clean after regenerate + commit.
- [ ] GEO-11 exists, passes on the real data, and its test goes red when a portal is removed.
- [ ] The review links load: `http://atlas-edit.joymify.local.com/?r=district:district-teacup-meadows` and
   `http://atlas-edit.joymify.local.com/?r=district:district-porcelain-cradle` show the new level ranges.

## Not in this feature

- Renaming studio nodes to the canon names (Lantern Hollow -> Maro Bell, Porcelain-Loom Sanctuary -> Linde Glaze): that is I-264.
- The caravan, bind points, fast travel, quests, the chapter 0 boss, a Bell Reckoning event.
- Any district outside the three; the four other race prologues; `becomes_transport` conversions; `transport_links` validation.
- server-rs and the Godot client. (A scout found nothing in `server-rs/src` or `game-client/src` that reads the manifest's
  levels or portal table; if the build finds a consumer there, stop and report.)
- Map geometry or art changes.

## Risks

- A portal trigger box placed on a wall or outside the walkable area passes every validator and is still unusable in play. Nothing here tests it; noted for the first playable route check.
- Monster level may be defined in two places (R3 guard).
- Kilnwatch's geographically correct slot toward Porcelain Cradle (west / south-west) is already used, so the stairs will arrive on a different side than the map position suggests.
