# Record map component: district and continent pages draw their map from studio data

## Goal

Owner, 2026-11-18, on the district record pages (`/?r=district:district-porcelain-cradle`): "it is text, hard to
understand", then: "why not make it a component in the web that reads the config and turns it into a picture".

The district and continent record pages in the Atlas web app (edit host `:8788` and the release app) show a map drawn
from the studio JSON at request time. No stored image, no hand-placed coordinates, nothing to regenerate when the data changes.

## Design

One backend function builds a small `map` block for a record; one frontend function turns a `map` block into inline SVG.
Layout is computed on the backend (Python, unit-testable); the frontend only draws what it is given.

### Backend: `map` block on the record payload

Add to the district and continent record builders (`scripts/atlas_world_web/records.py`; follow how the existing record
fields are assembled there). Shape:

```json
{"nodes": [{"id": "...", "label": "...", "kind": "town|hunting|dungeon|unbuilt|outside", "level": [1, 10],
            "x": 0, "y": 0, "record": "<record id to open on click, or null>"}],
 "edges": [{"a": "...", "b": "...", "state": "open|closed", "danger": false, "label": ""}]}
```

`x`, `y` are grid cells (integers), not pixels.

**District map** (record kind `district`):
- Nodes: every node of the district, plus one `outside` node for each node in another district that a portal of this district targets.
- `kind`: from the node's own type field; a mystery node (no playable map) is `unbuilt`.
- `label`: the node's display name; for an `outside` node, "<node name> (<district name>)".
- Layout from portal directions: start at the district's town at (0,0), walk portals breadth-first, place the target one
  cell North (y-1), South (y+1), East (x+1) or West (x-1) of the source. `Dungeon` portals go to the nearest free
  diagonal cell below the source. If the wanted cell is taken, step further in the same direction until a free cell.
  Nodes not reached by any portal are placed in a row under the rest. Deterministic: same data, same layout.
- Edges: one per portal pair (dedupe the two directions). `state` is `open` only if the portal's `gate_state` is `open`.
- `danger`: true when the edge is open, joins this district to an `outside` node, and the two nodes' `level_range`
  minimums differ by 8 or more. (This is what makes the two legacy doors next to the Linde start visible.)

**Continent map** (record kind `continent`, only when its districts have `geography.position`):
- Nodes: one per district that has `geography.position`; `x`,`y` taken from that position (0-100, x east, y south);
  `kind` is `district`; `level` is the district `level_range`; `label` is the district name plus its town name if it has one.
- Edges: one per `district_links` entry; `label` is its `priority` (`built`, `P0`, `P1`, `P2`); `state` is `open` for `built`, else `closed`.
- A record without the needed data gets no `map` key (not an empty one).

### Frontend: one draw function

- `renderRecordMap(map)` returns an SVG string; the record page (`renderRecordPage` in
  `scripts/atlas_world_web/frontend/`) puts it near the top of district and continent records, under the title, when `map` is present.
- Boxes coloured by `kind`, two text lines (label, "Lv a-b" or "not built yet"); open edges solid, closed dashed, danger red with a warning mark; continent edge labels show the priority.
- A legend under the map. Colour is never the only signal: the kind is also written in the legend order and danger edges carry a text mark.
- A box with a `record` id is a link to that record (same navigation the page already uses for relation links). Keyboard reachable.
- Uses the app's existing colour tokens / CSS variables and existing pan-zoom helper if one fits; no new dependency.
- Must be readable at phone width 390 px: the SVG scales to the container (`viewBox`, `width: 100%`), with horizontal scroll inside its own box only if the grid is wider than 4 cells; the page itself never scrolls sideways.
- Escape every string that comes from data before it goes into the SVG.

## Acceptance criteria

- [ ] `http://localhost:<port>/?r=district:district-porcelain-cradle` shows a map with: Porcelain-Loom Sanctuary, Celadon Causeway (Lv 1-10) west of it, a link south from Celadon Causeway to Lantern Hollow (Teacup Meadows) drawn as an outside node, and two edges marked danger (to Draft Kiln Post and to Resin Arch Tunnel).
- [ ] `/?r=district:district-teacup-meadows` shows Lantern Hollow with Clover South Gate south, Kiln East Orchard east, Whispering Mire as not built with a closed edge, Kiln Cellar as a dungeon.
- [ ] The continent-01 record shows 11 district nodes at their positions and 18 link edges with priority labels.
- [ ] Python unit tests for the layout: directions land in the right cells; a collision is resolved; an unreached node is placed; danger rule true/false at the boundary (difference 7 vs 8); a district with no portals; a continent without positions gets no `map`. Same input twice gives identical output.
- [ ] A frontend test (existing `scripts/tests/atlas-web-*.test.mjs` style) that the district record page contains the map SVG and that a node label containing `<` is escaped.
- [ ] Changing a `level_range` in a node file and reloading changes the map with no build step (state how the server caches studio data and that this was tried).
- [ ] Phone (390x844) and desktop (1280x800) screenshots of the Porcelain Cradle page taken with `~/.claude/skills/ui-visual-verify/shoot.mjs`, looked at, no clipped or overlapping labels.
- [ ] Existing suites stay green: `cd scripts && node --test --test-concurrency=1 tests/atlas-web-*.test.mjs tests/catalog-records.test.mjs`, `python3 -m unittest tests.test_validate_studio_hierarchy`, and the Python tests of `scripts/atlas_world_web` if any.

## Not in this feature

- Editing the map from the page. Drag to move nodes. Storing positions.
- Maps for other record kinds (towns, nodes, races). Terrain, rivers, art.
- Renaming studio nodes to the canon names (I-264): the map shows whatever names the data has.
- Any change to studio content or validators.

## Risks

- Direction-based layout can produce a wide or odd grid for districts whose portals were generated as a chain; the fallback rule keeps it deterministic but not pretty. Check all 11 continent-01 districts render without overlap.
- The record payload grows a little on district and continent records only.
