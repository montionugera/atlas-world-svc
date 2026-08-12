# mapforge

Draws the game's world sheets — cluster-1 (the Meltwash basin) and the atlas
(the world map) — as **authored vector documents** from the world's own
geography data.

**The spine (`content/spine/`) is the source of truth.** The entry point is
`render-sheet.mjs`, which loads the spine, builds the node tree, and draws
straight from it:

```
content/spine/                                   the spine (source of truth)
        │
        ▼  node tools/mapforge/render-sheet.mjs --sheet <cluster1|atlas>
        │     loadSpine → buildTree → draw*Sheet()  (lib/draft.mjs +
        │     lib/basin-sheet.mjs / lib/atlas-sheet.mjs → lib/raster.mjs)
        ▼
game-client/assets/art/maps/cluster1-world.svg    real paths, real text
game-client/assets/art/maps/cluster1-world.png    2000 px raster for the storybook
game-client/assets/art/maps/atlas-world.svg       the world sheet
game-client/assets/art/maps/atlas-world.png       2000 px raster for the storybook
```

`content/maps/cluster1-geography.json` is a **generated mirror** of the
spine (byte-emitted by `emitGeography` in `scripts/check_spine_emit.mjs`),
kept committed for tooling that still reads flat geography JSON. It is not
edited by hand and it is not where a map change starts — edit the spine.

`render-map.mjs` is the **legacy mirror-driven CLI**: it reads
`content/maps/cluster1-geography.json` directly and draws the same
`cluster1` sheet through `lib/basin-sheet.mjs`. It's kept around because its
`--check` wiring and the byte-parity test (`tests/parity.test.mjs`) pin the
renderer's determinism against a committed fixture; since the mirror is
byte-emitted from the spine, `render-map.mjs` and `render-sheet.mjs --sheet
cluster1` produce identical output. Prefer `render-sheet.mjs` for anything
new.

`scripts/check_map_render.mjs` is the drift gate (**G-MAP-DRIFT**): it
rebuilds every sheet in `render-sheet.mjs`'s `SHEETS` registry from the live
spine and byte-compares against the committed SVGs, the same contract one
layer downstream of `check_spine_emit.mjs`'s spine→mirror drift check. Run
it with `--check` (default, writes nothing) or `--write` (regenerates every
sheet) after a spine edit.

## Why this is not a generated image

A diffusion model cannot draw _this_ world's coastline, _this_ world's roads,
or letter _this_ world's place names and day-counts correctly — it produces
plausible-looking cartographic noise. The reference standard (a game world map
with real coastlines, labelled roads, day-counts and place markers, legible at
full size) is a **drafting** problem, not a painting problem. Every string on
the sheet is real SVG `<text>`, positioned from the data.

`art-manifest.json`'s `art:map-cluster1` entry records `gen.method:
"authored-vector"` rather than model parameters, because there are none.

## Commands

```bash
# spine-driven (current) — pick a sheet
node tools/mapforge/render-sheet.mjs --sheet cluster1           # SVG + PNG
node tools/mapforge/render-sheet.mjs --sheet atlas               # SVG + PNG
node tools/mapforge/render-sheet.mjs --sheet cluster1 --no-png   # SVG only
node tools/mapforge/render-sheet.mjs --sheet cluster1 --check    # self-checks + drift check, write nothing

# drift gate — every sheet in SHEETS, rebuilt from the live spine
node scripts/check_map_render.mjs             # --check (default): compare, write nothing
node scripts/check_map_render.mjs --write     # regenerate every sheet's SVG + PNG

# legacy, mirror-driven — reads content/maps/cluster1-geography.json directly
node tools/mapforge/render-map.mjs            # SVG + PNG (PNG needs rsvg-convert)
node tools/mapforge/render-map.mjs --no-png   # SVG only
node tools/mapforge/render-map.mjs --check    # run the self-checks, write nothing
```

Pure Node — **no dependencies, no network, no GPU**. Deterministic: the same
input JSON produces a byte-identical SVG (no `Math.random`, no timestamps, no
locale-dependent formatting; every list in the source is an array, so iteration
order is fixed).

### The PNG step

The renderer shells out to `rsvg-convert` (librsvg), equivalent to running:

```bash
rsvg-convert -w 2000 -b '#f3e7ce' \
  game-client/assets/art/maps/cluster1-world.svg \
  -o game-client/assets/art/maps/cluster1-world.png
```

If `rsvg-convert` is not on `PATH`, the SVG is still written and a message
tells you to install librsvg (`brew install librsvg`) — no command is
printed, and the CLI exits 0. rsvg-convert (librsvg) is the **only**
supported converter. Do NOT substitute ImageMagick: without the librsvg
delegate it silently drops every stroke, producing a blank-looking PNG with
no error.

The PNG exists only because the asset storybook renders raster art today; the
SVG is the artifact.

## Self-checks

Every run prints, and fails loudly on, the checks that keep the drawing honest:

| Check             | Behaviour                                                                   |
| ----------------- | --------------------------------------------------------------------------- |
| town ∈ zone       | **fails** if a town's coordinates fall outside the zone polygon it claims   |
| canon distances   | **fails** if a town-pair's straight-line distance drifts >8% from A1 §5.1   |
| relay sight-lines | **fails** if any tower-to-tower span exceeds the 10 km line-of-sight budget |
| terrain fill      | **fails** if a zone declares a `terrainKind` with no pattern                |
| road length       | reports drawn vs declared km (informational — see _centre-lines_ below)     |

**Centre-lines.** `roads[].points` is a simplified centre-line, so its measured
length runs 0–15% short of `roads[].roadKm` (A1 §5.1's surveyed figure). The
day-counts lettered on the sheet come from `days`/`roadKm`, never from the
drawn length.

## Schema — `content/maps/cluster1-geography.json` (mirror shape)

This is the shape `emitGeography` writes into the mirror and the shape
`drawBasinSheet` draws from — useful as a reference even though the spine,
not this file, is what you edit.

Coordinates are **km**, `x` east, `y` south (north is smaller `y`) — the
convention inherited from `content/maps/atlas-frontier.md`. The sheet is
150 km × 190 km; `x = 0` is open sea, `y = 0` is the hard parchment edge.

Positions preserve **topology, adjacency, ordering and terrain — not exact
metric distance** (A1 §5.3). `distances.legs[]` records what canon asserts so
the residual is always visible.

| Key                | Shape                                                                                               | Notes                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `coordinateSystem` | `{ units, convention, extentKm, origin, tolerance }`                                                | the frame and its stated tolerance                                                  |
| `coastline`        | `{ points: [[x,y],…] }`                                                                             | north → south; the sea lies **west** of the line                                    |
| `river`            | `{ points, reaches[], labelAt, tidalLimit, ford }`                                                  | `reaches[]` index into `points` and set the stroke weight per reach                 |
| `saltmire`         | `{ polygon }`                                                                                       | channels deliberately not modelled — A1 §7.1: they move                             |
| `iceEdge`          | `{ hardEdgeAtY, shelfLip }`                                                                         | the sheet's north boundary is **not** a coastline                                   |
| `terrainPatches[]` | `{ id, label, terrainKind, polygon, labelAt }`                                                      | ground with no zone — filled and named in lower case, no boundary, no level band    |
| `zones[]`          | `{ id, name, order, levelBand, terrainKind, town, polygon, labelAt, gradient?, gradientSegments? }` | the ten zones; `order` is A1 §4.4's walking order                                   |
| `towns[]`          | `{ id, name, at, zone, emblem, reason, labelAnchor, ruin?, wallsOnly? }`                            | `reason` is A1 §3.3's one-line existence test; `wallsOnly` draws a ruin's shell     |
| `camps[]`          | `{ id, name, at, zone }`                                                                            | the expedition camp — a camp, not a town                                            |
| `roads[]`          | `{ id, name, from, to, weight, dashed, days, daysLabel, roadKm, labelAtIndex, points }`             | `weight ∈ trunk\|spur\|track`; `daysLabel` is what gets lettered on the leg         |
| `relay`            | `{ spacingKm, owner, chains[], towers[], detachedTowers[] }`                                        | towers carry the sheet's single accent colour; chains join line-of-sight neighbours |
| `distances`        | `{ paceKmPerDay, legs[] }`                                                                          | canon's day-counts and A1's km — the sheet's walking table                          |
| `seaLane`          | `{ from, to, label }`                                                                               | one arrow off the west edge, per A1 §7.2                                            |
| `sheet`            | `{ title, subtitle, hand, northMark, scaleBarNote, withheld[] }`                                    | the panel copy, including what the mapmaker refuses to draw                         |

### Rules the data must keep

- **Invent nothing.** Every proper noun must already exist in
  `docs/worldbuilding/A1-geography-cluster1.md` or `content/story/canon.md`.
  Terrain patches use common nouns only.
- **A town is not a zone** (A1 §4.1). Ten zones; six of them contain a town.
- **The Ashvale Front's northern deep carries no grave rows** (A1 §7.2) — set
  `graveRows: false` on that segment and leave it as bare hatch.
- **One accent colour**, reserved entirely for relay towers and their
  sight-lines. Everything else is ink on cream.
- **No scale bar.** The sheet carries a walking table instead (A1 §7.1).

### Changing the map

Edit the spine (`content/spine/`), then `node scripts/check_spine_emit.mjs
--write` to regenerate the mirror and `node tools/mapforge/render-sheet.mjs
--sheet cluster1` (or `--sheet atlas`) to redraw the sheet — read its
self-check output and look at the PNG. `node scripts/check_map_render.mjs`
byte-compares every committed sheet against a fresh spine build so drift
can't slip in. If a town moves, its zone polygon and any road endpoint
referencing it must move with it, and the relay towers sampled along that
road must be recomputed — the tower coordinates are frozen on purpose, so
that downstream consumers get stable ids.
