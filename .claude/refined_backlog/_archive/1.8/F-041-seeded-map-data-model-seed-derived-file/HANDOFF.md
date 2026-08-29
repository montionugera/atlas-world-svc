# HANDOFF — I-089 tier spine (map data model)

Written 2026-08-09. Read this first; do **not** re-derive the measurements below — they were
computed from the shipped files and independently re-verified.

## Where things stand

- Release **1.8** is open and **empty** — one commit to start it, then only this idea's docs.
- **F-039** (town concept art) is claimed by a *different* worktree
  (`.claude/worktrees/F-039-town-concept-art-...`, branch `feat/F-039`, ~2 of 8 plan tasks done).
  Unrelated to this work. Leave it alone.
- **I-089 is still an idea, not a feature.** Nothing has been implemented. No code exists.
- All work below is committed on `release/1.8` via the `_release` worktree
  (`.claude/worktrees/_release`). Edits are blocked in the main checkout.

## What the owner asked for

> "what to have better world map + detail (data like seed for the map) — currently it is like a
> region map not world map"

Then, after a first (narrower) design was called *"quite complex"*, they proposed the shape to
build: **World → Continent → Region → Town**, with biome composition percentages per tier.

**Binding owner ruling:** lore/canon content **may be rewritten** to fit the schema.
Do not re-raise "this contradicts canon" as a blocker — they have waived it explicitly.

## Artifacts (all on `release/1.8`)

| Commit | File | What it is |
|---|---|---|
| `e9e8f9d` | `docs/superpowers/specs/2026-08-09-seeded-map-data-model-design.md` | **SUPERSEDED.** The first, narrower design (seed + derived file for one province). Kept for history. |
| `1d55e8e` | `.claude/idea_backlog/I-089-.../research.md` | **The full tier-spine design, 981 lines.** Output of a 13-agent workflow. Filed as research, not as the spec — too big for one unit. |
| `365d3a9` | `docs/superpowers/specs/2026-08-09-tier-spine-visual-report.md` | Visual report with a generated coverage drawing. Renders to HTML via the render-spec hook. |
| — | `.claude/idea_backlog/I-089-.../spec.md` | Short stub pointing at the above. |

## Measured facts — verified against source, do not re-derive

All recomputed directly from `content/maps/cluster1-geography.json` at 1 km raster resolution.

| Fact | Value | Evidence |
|---|---|---|
| Sheet size | 150 × 190 km = 28,500 km² | `coordinateSystem.extentKm` |
| Ground claimed by **no** child polygon | **49.5%** | 1 km raster over the 12 child polygons |
| Ground claimed by **two** children | **2.85%**, across **8 sibling pairs** | largest: `ashvale-front` ∩ `hollowmarch` = 363.6 km² |
| Zone polygon area ÷ its bounding box | **71.6% – 83.7%** across all ten zones | any polygon-vs-rect area identity within 5% is unsatisfiable |
| Map detail budget | ~150 hand-placed points total | 20 coastline pts, 20 river pts (no tributaries), ~70 for all 10 zones, 1 terrain patch |
| Seeds in the map pipeline | **zero** | no "seed" token in the map data or `tools/mapforge/render-map.mjs` |

**The 12 "children" are the 10 zones + `saltmire` + `eastern-hills`.** Counting only the 10 zones
gives 58.9% unclaimed and 6 pairs — a wrong denominator that cost one wasted pass. Use 12.

### Latent issues found in the existing repo (not introduced by this design)

1. **Town anchors mean the town's CENTRE, and nothing documents it.**
   `content/towns/town-millcross.json` has extent 220×160 and puts landmark `the-ford` at local
   `[110,80]` — exactly `[220/2, 160/2]`. Its `anchor.geographyAt [86,118]` is byte-identical to
   both `towns[0].at` and `river.ford.at` in `cluster1-geography.json`. Assuming it names the
   origin corner misplaces every town by (110, 80) local units.
2. **`colyseus-server/generated/spawn-areas.json` is produced from live server config**
   (`src/config/genSpawnAreas.ts` reads `MAP_CONFIG.mobSpawnAreas`) and is the repo's **only**
   authored-vs-runtime binding, checked by `scripts/lib/spawn-pairing.mjs`. If any new tool emits
   that file, the check compares content to content and can never fail — it would silently undo
   F-031. **Do not let the spine emit it.**
3. **`getMobSpawnAreasForMap` (`colyseus-server/src/config/mapConfig.ts`)** special-cases only two
   test map ids and otherwise returns one shared spawn-area array. "Exactly one node per mapId" is
   therefore unrepresentable; the design uses `runtime.mapIds: string[]` instead.
4. **`content/story/regions.json` mixes tiers** — `region-icefield` is a zone, `region-millcross`
   is a town, `region-spawn-meadow` is runtime-only and absent from the fiction geography.

## The design in one paragraph

One JSON file per place under `content/spine/nodes/<id>.json`, all the same shape:
`{ id, tier, parentId, seed, placement, composition }`. `tier` is a **depth** (world 0, continent 1,
region 2, town 3) and a check enforces child depth = parent depth + 1 — which is what permanently
kills "region means three things". The tree is not stored; a script joins the files on `parentId`.
Existing files (`cluster1-geography.json`, `atlas-frontier.md`, `regions.json`, town plans) are not
deleted — they become **generated output**, validated by regenerating and byte-comparing.

The winning structure was a **flat node table** (judged 72 vs 69 single-document vs 56
file-per-node). Its conceded cost: there is no one file you can open to see the shape of the world,
so the design makes an ASCII tree printer a hard Phase 0 deliverable.

## Open decision — this is what to ask the owner first

They said "want to build it" but have **not** picked a scope. Three options were put to them:

1. **Phases 0–2 first** — node files exist, geography generated from them, **nothing goes red**.
2. **All 7 phases** — adds towns, runtime root, story links; 3 deliberate red-then-fix steps.
3. **Core only (~80 lines)** — tier-as-depth + one id namespace + anchor defined, nothing else.

## Three validation gaps — carry these forward

1. **Phase 1 hides a world rewrite.** Closing the 49.5% unowned ground and the 8 overlaps means
   redrawing boundaries. The byte-compare only proves spine and geography match *after* both were
   changed together. No test can judge whether the redrawn world is still the intended one.
2. **Phase 4 is blind to geometry.** The authored and runtime spawn tables have described different
   worlds since F-031; the check compares ids only, never positions.
3. **The "nothing goes red" phase labels are predictions, and one was already false.** Phase 1 was
   marked as breaking nothing; the review found all 12 nodes would fail immediately because of the
   polygon-vs-bbox rule above. **Rule to adopt: every new check must be demonstrated failing
   before it is trusted.**

## Process notes for whoever picks this up

- Reproduce the coverage drawing with a 1 km raster + point-in-polygon over the 12 child polygons;
  run-length encode rows or the SVG balloons to ~900 KB (it should be ~48 KB).
- If re-running the design workflow: constrain any model-returned key with a JSON-schema `enum`.
  The first run crashed because designers returned prose paragraphs where a slug was expected and
  judges then invented their own labels.
- Next workflow step per ps-release-workflow is `psrw refine I-089` — but only once the owner has
  picked a scope and a right-sized spec exists. The 981-line research file is **not** that spec.
