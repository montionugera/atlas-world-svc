# mapforge

Draws the cluster-1 world map as an **authored vector document** from the
world's own geography data.

```
content/maps/cluster1-geography.json     the geography (source of truth)
        │
        ▼  node tools/mapforge/render-map.mjs
game-client/assets/art/maps/cluster1-world.svg    real paths, real text
game-client/assets/art/maps/cluster1-world.png    2000 px raster for the storybook
```

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
node tools/mapforge/render-map.mjs            # SVG + PNG (PNG needs rsvg-convert)
node tools/mapforge/render-map.mjs --no-png   # SVG only
node tools/mapforge/render-map.mjs --check    # run the self-checks, write nothing
```

Pure Node — **no dependencies, no network, no GPU**. Deterministic: the same
input JSON produces a byte-identical SVG (no `Math.random`, no timestamps, no
locale-dependent formatting; every list in the source is an array, so iteration
order is fixed).

### The PNG step

The renderer shells out to `rsvg-convert` (librsvg) when it is on `PATH`. If it
is not, the SVG is still written and the exact command is printed:

```bash
rsvg-convert -w 2000 -b '#f3e7ce' \
  game-client/assets/art/maps/cluster1-world.svg \
  -o game-client/assets/art/maps/cluster1-world.png
```

rsvg-convert (librsvg) is the **only** supported converter — install it with
`brew install librsvg`. Do NOT substitute ImageMagick: without the librsvg
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

## Schema — `content/maps/cluster1-geography.json`

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

Edit the JSON, re-run the renderer, read its self-check output, and look at the
PNG. If a town moves, its zone polygon and any road endpoint referencing it
must move with it, and the relay towers sampled along that road must be
recomputed — the tower coordinates are frozen in the JSON on purpose, so that
downstream consumers get stable ids.
