# Pinned Places, Bound Records and Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Join hand-authored meaning onto generated land so that, at the end, the repository holds 41 PINNED places (the spec's "~40", made exact and asserted) the generator must honour (verified by `G-PIN-SAT` against a committed per-pin fabric receipt), 336 BOUND landmark records that carry a stable generated handle and a declared size band and **no coordinate anywhere** (verified by `G-BIND` + `G-HANDLE-BAND`), 60 dungeon complexes / 190 floors whose entrances sit on cave-capable landforms within 2 region hops of a settlement (`G-DUNGEON-REACH`), a machine-checkable relation layer covering the n-ary claims the existing prose actually makes, and `G-MEANING` — a gate that re-derives every declared claim from the new ground and **fails, naming the citation and the drifted value**, instead of resolving quietly. None of that exists today: today there are zero civil records, zero relations, zero dungeons, a 120-combination name pool against 626 needed names, and the only join authority is a legacy mirror.

**Architecture:** Three files families sit between the generated fabric and the renderer. `content/world/civil/pinned/*.json` are **generator inputs** — a seed point plus a constraint block the generator satisfies before it settles a coastline; `content/world/civil/bound/*.json` name a generated **handle** (`c03/karst/h-0f42`) plus a size band and never a coordinate; `content/world/relations/*.json` carry the n-ary claims (bearing, betweenness, distance, adjacency, road-connectivity, co-location, uniqueness-in-scope) with a section citation back to the prose. `scripts/lib/resolve.mjs` joins fabric + handles + civil into `content/world/resolved/*.json` — the only file renderers read — and `scripts/lib/relations.mjs` re-derives every relation from that resolved world so a re-seed reports exactly which authored claims it broke.

**Tech Stack:** Dependency-free Node ESM (`.mjs`) under `tools/mapforge/`; Node ESM with ajv under `scripts/` (its own `package.json`, **not** part of the pnpm workspace); JSON Schema draft-07 for every content family; `node --test` for both test suites; jest for `colyseus-server`.

**Spec:** /Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/_release/docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md

## Global Constraints

**Frame / ratio**
- `content/spine/nodes/n-atlas.json` stays `frozen: true`, `placement.rect` 400x400, `anchor [200,200]`, `interior.size [400,400]`, `seed.value "7c9e4a2f8b1d6e03"`. Frame = 160,000 km2.
- Ratio is measured on `n-atlas.derived.computedComposition.ocean` ONLY (frame-complete rollup, never a node-area ratio).
- `ratio: { target 1.5, min 1.2, max 1.8, oceanPctTarget 60.0, oceanPctMin 54.5455, oceanPctMax 64.2857 }`.
- `budget: { netLandKm2 64000, waterKm2 96000, grossLandPolygonKm2 65600, interiorWaterKm2 1600, oceanPolygonKm2 91200, interstitialKm2 3200, interstitialComposition {ocean:100} }`. Closure 65,600 + 91,200 + 3,200 = 160,000 exactly, zero residue.
- The 2.00% interstitial sits clear of the 0.5% threshold both ways (`check_content.mjs:2161` requires an interstitial above 0.5%, forbids it at or below).
- `G-ATLAS-ROLLUP` tolerance stays +/-2 pp (`check_content.mjs:1690-1707`). If the generated world cannot roll up within it, the generator is wrong, not the gate.

**Target counts (gated against `content/world/manifest.json`)**
- 13 landmasses, 3 oceans, 9 seas, 160 regions = 40 surveyed + 120 reported, 45 settlements (3 capital / 12 hub / 30 village), 8 town plans, 60 dungeon complexes / 190 floors (3 families x 8 + 36 bespoke), **170 distinct landform types / 178 group memberships / 8 dual-listed / 23 `dungeonCapable`**, 1,740 instances / 336 named, 20 biomes, 18 terrain kinds, 626 distinct names. The landform census is **170/178**, not the spec's 164/172: Plan B Task 1 ships six additional rows. **Three of them this plan's roster cites by name** — `headland` (`c-lm-gildmark-head`), `ford` (`c-lm-millcross-ford`) and `sea-waterfall` (`c-lm-brightfall-leap`, where the previous `knickpoint-gorge` was unsatisfiable beside `water.kind: "sea"` and would have failed `G-PIN-SAT`). The other three (`ice-shelf`, `ash-front`, `ash-plain`) are Plan C's generator vocabulary for c01's shelf ice and c10's tephra ground and are cited by no record here. **Plan B owns the lexicon; this plan never adds a type, it only cites one.**
- Land split: cap 6,000 + 4 major x 11,000 + 3 minor x 3,000 + 5 chains x 1,000 = 64,000.
- Surveyed region 160 km2 +/-25%; reported region 480 km2 +/-20% = [384, 576]. 40x160 + 120x480 = 64,000.
- Ocean polygons 41,800 / 30,400 / 19,000 = 91,200; attributed water 44,000 / 32,000 / 20,000. Sea polygons are SUBSETS of their ocean polygon (G-CONTAIN); their 20,600 km2 is already inside the 91,200 and is never added again.
- Spine trunk shrinks 44 -> 36 node files. Regions and landform instances are NOT spine nodes.

**Budgets**
- `content/spine/load-budget.json` = `{ "maxNodes": 96, "maxChildrenPerParent": 24, "maxRingPoints": 160, "maxBytes": 786432 }`.
- `G-VERTEX-BUDGET`: world-tier children <= 800 vertices, regions <= 200, landform instances <= 40.
- `content/world/budgets.json`: fabric <= 20 files / 262144 B each / 4194304 B total; civil <= 600 files / 8192 B each; landforms <= 2400 instances / <= 500 named / 100-200 types; sheets <= 18 / 524288 B SVG / <= 2 s raster per sheet at 2000 px. The sheet roster is enumerated, not approximate: 1 atlas + 1 basin + 13 continent + 1 overlay + 1 fabric + 1 synthetic = 18. The spec's "<= 16 (1 atlas + 13 continents + 1 basin + 1 overlay)" counted the SHIPPED chart only and omitted the two REVIEW sheets (Plan C's fabric census sheet, Plan B's target-density synthetic sheet) that the owner's every-artifact-observable rule requires be in the storybook. 18 is that roster written down, not a raised ceiling. `cellKm: 0.5` is a pinned constant in this file.

**Generator**
- One 800 x 800 grid over the frame, cell edge 0.5 km, 640,000 cells, ~14.7 MB resident, never committed.
- Target land fraction 0.40 = 256,000 of 640,000 cells; legal band 228,572-290,908 cells. Sea level is chosen by INTEGER RANK SELECTION (k-th largest elevation), never float bisection.
- No transcendentals on any path reaching a committed byte: integer-hash noise (xor-shift + `Math.imul`), polynomial smoothstep `t*t*(3-2*t)`, committed literal unit-vector table instead of `Math.cos`, rational falloffs instead of `exp`. `Math.sqrt` allowed; `Math.hypot` BANNED.
- Every committed number passes `q(v) = Math.round(v*100)/100` before `JSON.stringify` + sha256.
- Douglas-Peucker epsilon = 0.35 km, applied ONCE per arc (never per ring). Fractal coast detail: 3 levels, <= 0.25 km amplitude, halving; on self-intersection halve amplitude and retry, max 4 attempts.
- Poisson-disc region siting r = 11 km surveyed, 19 km reported. Multi-source Dijkstra keyed `(cost, cellIndex)` — the cell-index tiebreak is what makes the result independent of insertion order.
- Settlement hard vetoes: water cell, biome in {ice, lava}, localSlope > 0.08, elevation > treeline, cell in a reported region, freshWater(c) < 0.20 -> S = 0. Score `S = 0.30*river + 0.25*coast + 0.25*slope + 0.20*resource`. `coast` = 1.0 within 2 km of the sea-level contour when adjacent water fetch < 15 km, 0.4 exposed, 0 beyond 6 km inland. Minimum separation: capitals 60 km (candidates restricted to port-eligible cells BEFORE pass 1), hubs 24 km, villages 9 km.
- Level bands: 40 km rings from Gildmark (the single starter capital), 9 rings covering 0-360 km: `[1,10] [8,20] [16,30] [24,40] [32,50] [40,58] [46,64] [52,70] [58,80]`.

**Determinism / runtime**
- The game runtime is a NON-GOAL, restated as an EMITTER guarantee: no commit may change a spawn id, spawn rectangle, live map id or runtime coordinate, and the runtime emitters must keep producing byte-identical output. `colyseus-server/src/tests/mapDimensions.test.ts` staying green is an acceptance criterion on EVERY commit in every plan.
- Determinism is a version-pinned contract, not a portability claim. Pin the Node major in `.release.json` and `.github/workflows/ci.yml`; never claim cross-platform byte identity for transcendental output.

**Process**
- Repo is a pnpm workspace; map tooling is dependency-free Node ESM (.mjs) run with `node`. Map-tool tests take a FILE LIST, never a bare directory. Two forms, and they are not interchangeable: locally (Node >= 22) `node --test 'path/*.test.mjs'` lets Node expand the pattern itself; in `.github/workflows/ci.yml` and in any `bash -e` harness step the pattern must be SHELL-expanded and therefore UNQUOTED — `node --test tools/mapforge/tests/*.test.mjs` — because `ci.yml:34` pins `node-version: 18` and Node-side `--test` glob patterns only exist from v22. `scripts/integration.sh:112` and `scripts/package.json:6` both already use the unquoted shell-expanded form; copy them. Server tests are jest. Gate 1 = `scripts/precheck.sh`; Gate 2 = `scripts/integration.sh`; CI = `.github/workflows/ci.yml` (a third, different list).
- **The migration invariant, with its one recorded exception.** For every commit before the redraw, the byte comparisons stay green WITHOUT being re-baselined — with exactly one carve-out, agreed once and named here so no task re-derives a stricter reading: **Plan B Task 12 ("re-ink the two live sheets") is permitted to re-baseline `content/world/render-lock.json` and the two committed SVGs, and nothing else, ever.** The four comparisons that may NEVER be re-baselined outside Plan E's redraw commit are `check_spine_emit.mjs --check` (47 files, 46 after Plan A), the `colyseus-server` `mapDimensions` jest pin, and the two behavioural sheet suites (`basin-sheet.test.mjs`, `render-sheet.test.mjs` — their four non-baseline tests). Plan E's R12 re-baseline order runs against a lock that has already moved once, by design.
- Conventional commit subjects, kept short. NEVER `git commit --amend` — always a new commit on top.
- EVERY PHASE ENDS WITH A QUALITY GATE, written as explicit steps: implement -> verify by running the real command with visible output -> independent adversarial review of that phase's diff -> refactor on the findings -> re-verify. Not optional, not a permission stop.
- Every produced artifact must be observable in the asset-storybook; wiring it in is part of the producing task's acceptance criteria, never a follow-up.
- Each plan runs in its own claimed feature worktree. Every phase report ends with `git branch --show-current` and `git log --oneline -1`.
- A redraw commit may not contain a hand edit. If a ring needs adjusting, adjust the premise or the seed and regenerate.

### Constraints this plan adds (Plan D owns them)

- **The pin translation rule.** The six canon towns are pinned at their **committed `absoluteAnchor` plus one shared offset vector** `PIN_OFFSET = [81, 129]`, derived as `c02.footprint.centreKm [96, 148] - n-cluster1.placement.anchor [15, 19]`. A pure translation preserves every straight-line distance exactly, so all seven `leg` edges keep the residuals they have today (`e-leg-millcross-gildmark` measures 16.906 km against a committed `straightKm` of 17 both before and after) and `G-CANON-LEG`'s +/-8% cannot break. No canon distance is re-derived by this plan.
- **The 13 continent footprints.** Plan D does not choose them — `content/world/premises/continent-NN.json` (Plan C Task 3) is the authority and the Domain primer's table is a transcription of it. Task 4 Step 1b reads the premise files and asserts every `pin.at` lands inside its declared continent's footprint ellipse, and that `pinOffset` equals `c02.footprint.centreKm - n-cluster1.placement.anchor`, so a divergence is a red test rather than forty simultaneous `G-PIN-SAT` failures with no obvious cause. If Plan C's packing moves a centre, re-run Step 1 and Step 1b; do not hand-edit coordinates.
- **`pinReceipts` is a fabric field.** Plan C owns `content/world/fabric/continent-NN.json`; Plan D owns the `pinReceipts[]` array inside it. The receipt is what makes `G-PIN-SAT` a gate over committed bytes instead of a 640,000-cell re-run.
- **Relation derivation never writes a committed byte.** `scripts/lib/relations.mjs` may use `Math.atan2` because its output is a console report, never serialised. A test pins this: no key produced by `deriveRelation` appears in `content/world/resolved/*.json`.
- **`bind.spineId` does not exist.** Two binding paths means two ways for a record to move.
- **A dungeon is never a spine node.** It joins by `bind.handle`, exactly as `content/towns/town-millcross.json` joins by `spineId`.

---

## Domain primer — read this before Task 1

You have never seen this codebase. Read these files, in this order, before writing any code. They are short except where noted.

1. `scripts/lib/spine.mjs` (1,094 lines — read the exported-function list and the module header, then `loadSpine`, `buildTree`, `deriveNode`, `placementArea`, `shoelaceArea`).
2. `scripts/check_content.mjs:1536-1795` — the whole of `checkSpine()`. This is where every gate you write is called from.
3. `scripts/check_content.mjs:107-151` — `loadGeographyZones` / `loadGeographyTowns` and the module-level `failures` / `warnings` arrays.
4. `scripts/check_spine_emit.mjs:100-200` — `emitGeography()`, the shape your resolver must reproduce.
5. `content/spine/nodes/n-millcross.json` — one complete spine node.
6. `content/zones/zone-meltwash-terrace.json` — one complete zone record (the prose register you are matching).
7. `content/towns/town-millcross.json` — the join-by-`spineId` precedent dungeons copy.
8. `scripts/tests/spine-gates.test.mjs:212-260` — the fixture helpers you must reuse (`spineFixture`, `runSpineGate`, `realSpineCopy`, `runEmit`).

**The vocabulary.**

- **The spine** is `content/spine/nodes/*.json`: a flat table of 44 JSON files joined on `parentId`, plus `content/spine/edges.json` (20 edges: 8 road, 2 relay, 7 leg, 3 sealane) and `content/spine/roots.json` (two disjoint roots — `n-atlas`, the chart, and `n-playroot`, the game runtime). Each file is a **node**.
- A node's **tier** is one of `world, playroot, continent, ocean, sea, playspace, region, town, site, fixture`, and `TIER_DEPTH` (`scripts/lib/spine.mjs:28-38`) fixes each tier's depth in the tree. A child's depth must be its parent's depth + 1 — that is the rule `G-DEPTH` enforces.
- A node's **`derived` block** is machine-written: area, coverage percentage, rolled-up composition, resolved seed streams, and a sha256 `digest`. Nobody edits it by hand. `scripts/check_spine_emit.mjs --write` writes it; `--check` byte-compares and exits 1 on drift (`G-DERIVED-DRIFT` / `G-EMIT-DRIFT`).
- A **gate** is a named rule inside `scripts/check_content.mjs`. Gates never throw — they push a string into a module-level `failures` array via `fail(...)` (or `warnings` via `warn(...)`), and `finish()` prints them and sets the exit code. **An uncaught throw skips `finish()` and silently drops every failure recorded before it.** That is the single most important convention in this file.
- Gates **soft-skip** when their inputs are absent. `checkSpine` returns 0 before compiling a schema if `content/spine` is missing; `checkZoneContent` returns 0 if `content/zones` is missing. About 45 minimal test fixtures depend on this. **Every gate you write must return early and silently when `content/world/` is absent**, or you will redden dozens of existing tests.
- **Gate 1** is `scripts/precheck.sh` — run before a feature merges into the release branch. Its content step is `node scripts/check_content.mjs --only=spine`. **`--only=spine` is not a reduced gate set**: it calls the same `checkSpine()` and only skips the story/character/zone/town sweeps, so every gate you add to `checkSpine` lands in Gate 1 automatically and must fit its ~4 s budget.
- **Gate 2** is `scripts/integration.sh` — run before a release is promoted. Full `--require-complete` sweep, `check_spine_emit --check`, the mapforge test suite, `npm test --prefix scripts`, and more.
- **Sheets** are the SVG world maps under `game-client/assets/art/maps/`, built by `tools/mapforge/render-sheet.mjs` from a `SHEETS` registry. `tools/asset-storybook/` is the review surface — a static HTML page with a Maps tab that lists every sheet from `maps-index.json`. The owner's rule is that **anything you produce must be visible there**.
- **Fabric** (new, Plan C) is `content/world/fabric/continent-NN.json`: the generated regions, landform instances and cell census for one landmass. **Handles** (new, Plan C) are `content/world/handles/continent-NN.json`: a committed ledger of stable ids like `c03/karst/h-0f42` that authored records bind to.
- **Civil** (new, this plan) is `content/world/civil/`: the authored meaning. **Resolved** (new, this plan) is `content/world/resolved/`: the committed join of fabric + civil, and the only thing renderers read.

**The 13 continent footprints, COPIED VERBATIM from Plan C Task 3** (frame is 400 x 400 km, x increases EAST, y increases SOUTH). `content/world/premises/continent-NN.json` is the authority and Plan C owns it; this table is a transcription, not an independent choice. Every `pin.at` in Task 4's roster is derived from these numbers, and Task 4 Step 1 carries a test that reads the premise files and re-checks it — so the two can never silently diverge:

| id | Name | Class | Net km2 | `footprint.centreKm` | `footprint.radiiKm` |
| --- | --- | --- | ---: | --- | --- |
| c01 | Rimewall Cap | cap | 6,000 | `[200, 34]` | `[92, 26]` |
| c02 | Wealdmarch | major | 11,000 | `[96, 148]` | `[58, 44]` |
| c03 | Coldreach | major | 11,000 | `[286, 112]` | `[52, 48]` |
| c04 | Stonemoor | major | 11,000 | `[306, 246]` | `[50, 50]` |
| c05 | Thirstwold | major | 11,000 | `[176, 300]` | `[56, 42]` |
| c06 | Reedstrand | minor | 3,000 | `[70, 268]` | `[28, 22]` |
| c07 | Driftholt | minor | 3,000 | `[46, 92]` | `[24, 24]` |
| c08 | Wracklow | minor | 3,000 | `[252, 344]` | `[28, 20]` |
| c09 | Brightfall | chain | 1,000 | `[352, 186]` | `[16, 22]` |
| c10 | Ashen Spar | chain | 1,000 | `[122, 356]` | `[26, 11]` |
| c11 | Quillreef | chain | 1,000 | `[338, 66]` | `[15, 15]` |
| c12 | Skerryfast | chain | 1,000 | `[254, 44]` | `[20, 12]` |
| c13 | Loamspit | chain | 1,000 | `[40, 344]` | `[22, 12]` |

The existing playable basin (`n-cluster1`, anchor `[15, 19]`, extent 30 x 38 km) re-fits onto **c02 Wealdmarch** by translating every committed anchor by

```
PIN_OFFSET = c02.footprint.centreKm - n-cluster1.placement.anchor
           = [96, 148] - [15, 19]
           = [81, 129]
```

which puts the basin's anchor exactly on c02's centre `[96, 148]`. **Derive it, never retype it** — `PIN_OFFSET` is computed from the premise file at authoring time and asserted in Task 4 Step 1, because a hand-typed offset is how forty pins end up 55 km off their continent with `G-PIN-SAT` red forty times and no obvious cause.

**Every command this plan runs.**

```bash
# from the repo root of your feature worktree
node scripts/check_content.mjs --only=spine                 # Gate 1 fast path
node scripts/check_content.mjs --require-complete           # Gate 2 bar
node scripts/check_content.mjs --content-root <dir>         # a fixture root
node scripts/check_spine_emit.mjs --check                   # 47-file byte compare
node scripts/check_resolved.mjs --check                     # this plan's G-SLOT-STABLE
node scripts/check_resolved.mjs --write                     # regenerate content/world/resolved/
node tools/mapforge/scaffold-civil.mjs --bound              # mint/reconcile bound records
node tools/mapforge/scaffold-civil.mjs --dungeons           # mint/reconcile dungeon records
npm ci --prefix scripts                                     # scripts/ deps (ajv, js-yaml, sharp)
npm test --prefix scripts                                   # node --test tests/*.test.mjs
node --test 'tools/mapforge/tests/*.test.mjs'               # QUOTED = Node-side glob, LOCAL ONLY (>= v22)
node --test 'tools/asset-storybook/tests/*.test.mjs'
node --test tools/mapforge/tests/*.test.mjs                 # UNQUOTED = shell-expanded; the ONLY form
                                                            # legal in ci.yml (node 18) or a bash -e step
(cd colyseus-server && npm test -- mapDimensions)           # the jest pin, EVERY commit
./scripts/precheck.sh --no-install                          # Gate 1
./scripts/integration.sh --no-install                       # Gate 2
```

A fresh worktree has no dependencies. Run `pnpm install` at the root and `npm ci --prefix scripts` once, before anything else.

---

## Scope boundary — what this plan does NOT do

The task brief for this lane listed three items the programme's shared contract assigns elsewhere. They are consumed here, not implemented here:

| Item | Owner | What Plan D does instead |
| --- | --- | --- |
| The silent region-drop at `check_spine_emit.mjs:111` (`regions.filter(n => n.lore?.order != null)`) | **Plan A** — replaced by the `subjects.zoneRoot` descriptor, which enumerates ALL `region`-tier children and FAILs on a missing `lore.order` inside that scope | Consumes the descriptor; `resolveCivil` never filters on `lore.order` |
| `G-ORDER` over the HANDLE LEDGERS (total ordering `(-area, contentHash)`, committed `orderDigest`) | **Plan C** — it is a property of the handle ledger the generator emits | Consumes `orderDigest`; `G-BIND` asserts handle uniqueness only |
| `G-ORDER`'s dense-permutation clause over the REGION order | **Plan D**, Task 7's `gZoneOrder` — `order` is minted onto the RESOLVED zones, and `content/schemas/fabric-file.schema.json` (`additionalProperties: false` on `regions[]`) forbids the field on a fabric region, so Plan C's gate could never see it | Implements it: same rule, same message string, asserted where the resolved documents are already loaded |
| The spine-alias sweep re-point (116 bestiary rows, 10 story regions, 6 `art:town-*` keys, 10 zone files, 1 town plan) | **Plan A** owns the mechanism (`check_content.mjs:1416-1528` re-pointed at `places.mjs`); **Plan E** owns the data re-homing onto new region ids | Task 11 changes what `places.mjs` reads (`content/world/resolved/`), which is the half of the sweep that belongs to this plan |

Also out of scope: any change to a spawn id, spawn rectangle, live map id or runtime coordinate; the 40 zone prose records and `survey` field (Plan E); the redraw commit itself (Plan E); the renderer's glyphs, fills and label declutter (Plan B).

---

## File Structure

| Op | Path | Responsibility |
| --- | --- | --- |
| M | `content/schemas/zone-content.schema.json:4`, `content/schemas/town-plan.schema.json:5` | **Inherited from Plan A, prose only.** Both `description` strings still tell an author that `content/maps/cluster1-geography.json` "stays the authority on where a zone/town is and is never written back to". Plan A Task 12 deleted that file; the authority is now the spine, resolved by `resolveWorld()` in `scripts/lib/places.mjs`. Plan A could not correct it — its `content/` diff is a closed five-file list and either edit would have been a sixth entry. No gate catches a stale `description`; `git grep -n cluster1-geography -- content/schemas/` returning zero hits is the check. Fix it in **Task 11**, the task that re-points `places.mjs` at the resolved world and therefore already owns this sentence's subject |
| C | `content/schemas/civil-record.schema.json` | Pinned + bound record shapes, discriminated on `tier`, `additionalProperties: false` |
| C | `content/schemas/relation.schema.json` | The 8-relation closed vocabulary, discriminated on `rel` |
| C | `content/schemas/dungeon.schema.json` | Dungeon complex record |
| C | `content/schemas/dungeon-family.schema.json` | Family template (floor graph, hazards, room-count curve, band function) |
| C | `content/world/civil/pinned-roster.json` | The 41-row authoring table: id, kind, continent, `pin.at`, `requires`, prose source |
| C | `content/world/civil/pinned/*.json` | 41 pinned records — generator INPUTS with constraint blocks |
| C | `content/world/civil/bound/*.json` | 336 bound landmark records: handle + size band, no coordinates |
| C | `content/world/relations/c01..c13.json` | 13 relation files carrying the n-ary claims with section citations |
| C | `content/world/names/registers.json` | 5 registers x (16 onsets, 12 rimes, 6 links, 30 classifiers) |
| C | `content/world/names/reserved.json` | Hard exclusion set of every hand-authored canon name |
| C | `content/dungeons/families/family-{necropolis,catacomb,lavatube}.json` | 3 shared templates, 8 members each |
| C | `content/dungeons/dungeon-*.json` | 60 records (24 family members + 36 bespoke), 190 floors total |
| C | `content/world/resolved/continent-01..13.json` | 13 committed join outputs — the ONLY file renderers read |
| C | `scripts/lib/resolve.mjs` | `loadCivil` + `resolveCivil` + `gBind` + `gPinSat` + `gHandleBand` + `gBand` |
| C | `scripts/lib/relations.mjs` | `deriveRelation` / `checkRelations` — the 8-relation derivation engine |
| C | `scripts/lib/dungeons.mjs` | `loadDungeons` / `expandFamily` / `gDungeonReach` / `dungeonDensityLines` |
| C | `scripts/check_resolved.mjs` | CLI `--write` / `--check` for `content/world/resolved/` (`G-SLOT-STABLE`) |
| C | `tools/mapforge/lib/name-gen.mjs` | Register-driven name generator replacing the 120-combination pool |
| C | `tools/mapforge/scaffold-civil.mjs` | Idempotent set-reconciling minter for bound records and dungeon skeletons |
| C | `scripts/tests/fixtures/world/base/**` | A complete miniature world (2 continents) every new gate tests against |
| C | `scripts/tests/fixtures/world/<gate>-*/**` | One overlay dir per red case, mirroring `fixtures/spine/`'s convention |
| C | `scripts/tests/relations.test.mjs` | The 8 derivations, red and green, plus the no-committed-byte pin |
| C | `scripts/tests/resolve.test.mjs` | `loadCivil`, `G-BIND`, `G-PIN-SAT`, `G-HANDLE-BAND`, `G-BAND`, `resolveCivil`, `G-SLOT-STABLE` |
| C | `scripts/tests/dungeons.test.mjs` | Family expansion, floor arithmetic, `G-DUNGEON-REACH` |
| C | `scripts/tests/name-gen.test.mjs` | 626-name convergence, `G-NAME-REGISTER`, `G-NAME-SOUND`, `G-NAME-PROSODY` |
| C | `tools/asset-storybook/world-index.json` | Committed roster the storybook's Places & Meaning panel reads |
| C | `tools/asset-storybook/tests/world-index.test.mjs` | Parity: every continent with a resolved file has a row, and vice versa |
| M | `scripts/check_content.mjs:26` | Import `checkWorldCivil` from `lib/resolve.mjs` |
| M | `scripts/check_content.mjs:1790` | Call `checkWorldCivil({ opts, fail, warn })` immediately before `checkSpineStoryAlias` |
| M | `scripts/lib/places.mjs` (created by Plan A Task 5 — no line to anchor to in today's tree) | Task 11: fallback branch removed; `loadPlaces` reads `content/world/resolved/` |
| M | `tools/mapforge/lib/passes/settlements.mjs` (created by Plan C Task 9a) | P11 adds `placePinned` + `measureCell`; `placeSettlements` is unchanged by this plan |
| M | `tools/mapforge/lib/passes/dungeons.mjs` (created by Plan C Task 9c) | P13 adds `anchorBoundEntrances` — bound entrances on `dungeonCapable` landforms |
| M | `content/world/manifest.json` (created by Plan C Task 1) | `names.reservedFile`, `relations.coverageFloorPct`, `quotas.dungeons` cross-checked against the committed files |
| M | `tools/asset-storybook/js/maps.mjs:17` (`loadIndex`), `:244-333` (`mountMaps`, panel inserted before `main.appendChild(section)` at `:333`) | Places & Meaning panel below the sheet grid |
| M | `tools/asset-storybook/js/state.mjs:94` (beside `MAPS_INDEX_URL`) | `export const WORLD_INDEX_URL` |
| M | `scripts/integration.sh:90` (fn, beside `spine_emit_drift`), `:121` (the `run_section` line it follows) | Add `check_resolved --check` and the `relation_coverage` report |
| M | `.github/workflows/ci.yml:107-111` (beside the `check_spine_emit --check` step) | Add `check_resolved --check` and the relation-coverage report step |

---

### Task 1: The relation engine

The n-ary claims the prose makes are the half of the architecture that has no machinery at all — `grep -ri constraint scripts/*.mjs tools/mapforge/lib/*.mjs` returns exactly one hit and it is a comment. This task writes the derivation engine first, against a synthetic resolved world, so every later task can assert on it.

**Files:**
- Create: `content/schemas/relation.schema.json`
- Create: `scripts/lib/relations.mjs`
- Test: `scripts/tests/relations.test.mjs`

**Interfaces:**
- Consumes: nothing from other plans. The `resolved` and `fabric` shapes it reads are defined here and produced by Task 7.
- Produces:
  - `export const RELATION_KINDS: readonly string[]` — the 8 ids
  - `export const COMPASS: readonly string[]` — `["N","NE","E","SE","S","SW","W","NW"]`
  - `export function bearingDeg({ from, to }): number` — 0 = north, 90 = east (y increases SOUTH)
  - `export function compassOf({ deg }): string`
  - `export function angDiff({ a, b }): number` — signed, in `(-180, 180]`
  - `export function pointOf({ resolved, id }): [number, number] | null`
  - `export function roadGraph({ resolved }): Map<string, Set<string>>`
  - `export function deriveRelation({ relation, resolved, fabric }): { ok: boolean, got: unknown, message: string|null }`
  - `export function checkRelations({ relations, resolved, fabric }): { drifts: Array<{ rel, cite, declared, resolved, message }> }`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/relations.test.mjs`:

```js
// Plan D Task 1 — the relation derivation engine.
//
// Every assertion here runs against a HAND-BUILT resolved world, never the
// real content root: the point of the engine is that it turns a prose claim
// into an arithmetic verdict, and a synthetic world is the only place both
// the green and the red case can be stated in four lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RELATION_KINDS, COMPASS, bearingDeg, compassOf, angDiff, pointOf,
  roadGraph, deriveRelation, checkRelations,
} from "../lib/relations.mjs";

// x increases EAST, y increases SOUTH (inherited from atlas-frontier.md).
// So "north" is SMALLER y and the bearing of [0,-1] must be 0, not 180.
const W = {
  continent: "c02",
  zones: [
    { id: "millcross-ford", name: "Millcross Ford", labelAt: [152, 175], region: "c02/r01" },
    { id: "thornveil", name: "Thornveil", labelAt: [159.4, 177], region: "c02/r02" },
  ],
  towns: [
    { id: "c-town-millcross", name: "Millcross", at: [152.2, 174.6], zone: "millcross-ford", properties: [], coasts: [] },
    { id: "c-town-gildmark", name: "Gildmark", at: [137.2, 182.4], zone: "gildmark-head", properties: ["deepwater-port"], coasts: ["wealdmarch-west"] },
    { id: "c-town-rooktide", name: "Rooktide", at: [152.0, 185.5], zone: "rooktide-reach", properties: [], coasts: [] },
    { id: "c-town-embervale", name: "Embervale", at: [143.7, 169.9], zone: "emberdown", properties: [], coasts: ["wealdmarch-west"] },
  ],
  landmarks: [
    { id: "c-lm-mill-race", name: "The mill race", at: [152.3, 174.7], region: "c02/r01", properties: [] },
  ],
  dungeons: [],
  roads: [
    { id: "trade-road-trunk", name: "the trade road", from: "c-town-millcross", to: "c-town-embervale", throughRoute: null },
    { id: "coastal-spur", name: "the coastal spur", from: "c-town-embervale", to: "c-town-gildmark", throughRoute: null },
    { id: "war-road", name: "the war road", from: "c-town-millcross", to: "c-town-embervale", throughRoute: null },
    { id: "mire-track", name: "the mire track", from: "c-town-millcross", to: "c-town-rooktide", throughRoute: null },
    { id: "ford-lane", name: "the ford lane", from: "c-town-millcross", to: "c-lm-mill-race", throughRoute: null },
  ],
};

const F = {
  c02: {
    continent: "c02",
    regions: [
      { id: "c02/r01", adjacent: ["c02/r02"] },
      { id: "c02/r02", adjacent: ["c02/r01"] },
      { id: "c02/r03", adjacent: [] },
    ],
  },
};

test("the vocabulary is exactly the 8 relations the prose asserts", () => {
  assert.deepEqual([...RELATION_KINDS].sort(), [
    "adjacency", "bearing", "betweenness", "colocated_with",
    "connected_by_road", "distance", "not_connected_by_road", "unique_in_scope",
  ]);
});

test("bearing is north-up on a y-increases-south sheet", () => {
  assert.equal(bearingDeg({ from: [0, 0], to: [0, -1] }), 0);
  assert.equal(bearingDeg({ from: [0, 0], to: [1, 0] }), 90);
  assert.equal(bearingDeg({ from: [0, 0], to: [0, 1] }), 180);
  assert.equal(bearingDeg({ from: [0, 0], to: [-1, 0] }), 270);
  assert.equal(compassOf({ deg: 338 }), "N");
  assert.equal(compassOf({ deg: 45 }), "NE");
  assert.equal(angDiff({ a: 10, b: 350 }), 20);
});

test("bearing green: Thornveil is east of Millcross within 30 degrees", () => {
  const r = deriveRelation({
    relation: { rel: "bearing", from: "c-town-millcross", to: "thornveil", dir: "E", toleranceDeg: 30, cite: "canon.md §4 \"Geography & trade logic\"" },
    resolved: W, fabric: F,
  });
  assert.equal(r.ok, true, r.message);
});

test("bearing red: names the declared direction, the resolved compass and the degrees", () => {
  const r = deriveRelation({
    relation: { rel: "bearing", from: "c-town-millcross", to: "c-town-gildmark", dir: "E", toleranceDeg: 30, cite: "canon.md §4 \"Geography & trade logic\"" },
    resolved: W, fabric: F,
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /declared E \+\/-30 deg, resolved WNW \(297 deg\)/);
});

test("distance honours tolerancePct", () => {
  const base = { rel: "distance", a: "c-town-millcross", b: "c-town-gildmark", cite: "content/spine/edges.json e-leg-millcross-gildmark" };
  assert.equal(deriveRelation({ relation: { ...base, km: 17, tolerancePct: 8 }, resolved: W, fabric: F }).ok, true);
  const bad = deriveRelation({ relation: { ...base, km: 34, tolerancePct: 8 }, resolved: W, fabric: F });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /declared 34 km \+\/-8%, resolved 16\.91 km/);
});

test("adjacency requires the fabric to agree in BOTH directions", () => {
  assert.equal(deriveRelation({ relation: { rel: "adjacency", a: "c02/r01", b: "c02/r02", cite: "x" }, resolved: W, fabric: F }).ok, true);
  const bad = deriveRelation({ relation: { rel: "adjacency", a: "c02/r01", b: "c02/r03", cite: "x" }, resolved: W, fabric: F });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /not adjacent in the fabric/);
});

test("road connectivity is transitive, and road: operands test membership", () => {
  const g = roadGraph({ resolved: W });
  assert.ok(g.get("c-town-millcross").has("c-town-embervale"));
  assert.equal(deriveRelation({ relation: { rel: "connected_by_road", a: "c-town-millcross", b: "c-town-gildmark", cite: "x" }, resolved: W, fabric: F }).ok, true);
  // Rooktide sits off the direct war road entirely (canon.md §4).
  assert.equal(deriveRelation({ relation: { rel: "not_connected_by_road", a: "c-town-rooktide", b: "road:war-road", cite: "x" }, resolved: W, fabric: F }).ok, true);
  const bad = deriveRelation({ relation: { rel: "not_connected_by_road", a: "c-town-millcross", b: "road:war-road", cite: "x" }, resolved: W, fabric: F });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /is on road "war-road"/);
});

test("betweenness counts road-graph degree", () => {
  assert.equal(deriveRelation({ relation: { rel: "betweenness", hub: "c-town-millcross", minDegree: 3, cite: "x" }, resolved: W, fabric: F }).ok, true);
  const bad = deriveRelation({ relation: { rel: "betweenness", hub: "c-town-rooktide", minDegree: 4, cite: "x" }, resolved: W, fabric: F });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /degree 1, needs >= 4/);
});

test("colocated_with defaults to a 1 km radius", () => {
  assert.equal(deriveRelation({ relation: { rel: "colocated_with", subject: "c-lm-mill-race", host: "c-town-millcross", cite: "x" }, resolved: W, fabric: F }).ok, true);
  const bad = deriveRelation({ relation: { rel: "colocated_with", subject: "c-lm-mill-race", host: "c-town-rooktide", cite: "x" }, resolved: W, fabric: F });
  assert.equal(bad.ok, false);
});

test("unique_in_scope is a GLOBAL NEGATIVE — a second holder fails", () => {
  const ok = deriveRelation({
    relation: { rel: "unique_in_scope", subject: "c-town-gildmark", property: "deepwater-port", scope: "coast:wealdmarch-west", cite: "canon.md §4 \"Geography & trade logic\"" },
    resolved: W, fabric: F,
  });
  assert.equal(ok.ok, true, ok.message);
  const rival = structuredClone(W);
  rival.towns.find((t) => t.id === "c-town-embervale").properties.push("deepwater-port");
  const bad = deriveRelation({
    relation: { rel: "unique_in_scope", subject: "c-town-gildmark", property: "deepwater-port", scope: "coast:wealdmarch-west", cite: "canon.md §4 \"Geography & trade logic\"" },
    resolved: rival, fabric: F,
  });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /also held by c-town-embervale/);
});

test("an unresolvable subject is a drift, never a throw", () => {
  const r = deriveRelation({ relation: { rel: "bearing", from: "c-town-nowhere", to: "thornveil", dir: "E", toleranceDeg: 30, cite: "x" }, resolved: W, fabric: F });
  assert.equal(r.ok, false);
  assert.match(r.message, /"c-town-nowhere" does not resolve/);
});

test("checkRelations returns one drift row per broken claim, with its citation", () => {
  const { drifts } = checkRelations({
    relations: [
      { rel: "bearing", from: "c-town-millcross", to: "thornveil", dir: "E", toleranceDeg: 30, cite: "canon.md §4 \"Geography & trade logic\"" },
      { rel: "bearing", from: "c-town-millcross", to: "c-town-gildmark", dir: "E", toleranceDeg: 30, cite: "canon.md §4 \"The bramble road\"" },
    ],
    resolved: W, fabric: F,
  });
  assert.equal(drifts.length, 1);
  assert.equal(drifts[0].cite, "canon.md §4 \"The bramble road\"");
  assert.equal(drifts[0].declared, "E");
});

test("no derived relation value is ever serialised into a resolved world", () => {
  // The engine may use Math.atan2 ONLY because nothing it computes is
  // committed. If a future change stashes a bearing on the resolved doc,
  // transcendental output starts crossing a byte gate — this pins it.
  const before = JSON.stringify(W);
  checkRelations({ relations: [{ rel: "betweenness", hub: "c-town-millcross", minDegree: 3, cite: "x" }], resolved: W, fabric: F });
  assert.equal(JSON.stringify(W), before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "relation|bearing|road|betweenness|colocated|unique_in_scope|adjacency" 'scripts/tests/*.test.mjs'`

Expected: FAIL with `Cannot find module '.../scripts/lib/relations.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/relations.mjs`:

```js
// Plan D — the relation layer: the n-ary claims the prose makes, turned into
// arithmetic over the resolved world.
//
// WHY THIS EXISTS. Slot addresses and role ranks are UNARY — they name one
// place. Every load-bearing coherence claim in the authored prose is N-ARY:
// 194 network-topology tokens, 185 superlative/uniqueness, 32 bearings, 11
// distances, 7 co-locations, 6 betweenness claims across the 8 story files.
// A record can rebind perfectly and still make its own prose false. This
// module is what notices.
//
// NEVER THROWS. Every failure is `{ ok: false, message }`, in-band, exactly
// like scripts/lib/spine.mjs's gate helpers — an uncaught throw inside
// check_content.mjs skips finish() and silently drops every FAIL recorded
// before it.
//
// NEVER WRITES A COMMITTED BYTE. Math.atan2 is used here and nowhere the
// generator can reach; relations.test.mjs pins that invariant.

export const RELATION_KINDS = Object.freeze([
  "bearing", "betweenness", "distance", "adjacency",
  "connected_by_road", "not_connected_by_road", "colocated_with", "unique_in_scope",
]);

// 16-point names so a 22.5-degree miss reads as a miss, not as a rounding.
const ROSE = Object.freeze([
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
]);
export const COMPASS = Object.freeze(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
const DIR_DEG = Object.freeze({ N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 });

// x increases EAST, y increases SOUTH. North is SMALLER y, so the northward
// component is -dy and atan2's first argument is dx.
export function bearingDeg({ from, to }) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function compassOf({ deg }) {
  const i = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return ROSE[i];
}

export function angDiff({ a, b }) {
  return ((a - b + 540) % 360) - 180;
}

// Math.hypot is BANNED repo-wide (determinism); sqrt of the sum is not.
const dist = (a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
};
const round2 = (v) => Math.round(v * 100) / 100;

// One id namespace across every resolved family. Zones answer with labelAt
// because a region's "position" for a bearing claim is where its name sits.
export function pointOf({ resolved, id }) {
  for (const t of resolved.towns ?? []) if (t.id === id) return t.at;
  for (const l of resolved.landmarks ?? []) if (l.id === id) return l.at;
  for (const d of resolved.dungeons ?? []) if (d.at) { if (d.id === id) return d.at; }
  for (const c of resolved.camps ?? []) if (c.id === id) return c.at;
  for (const z of resolved.zones ?? []) if (z.id === id) return z.labelAt;
  return null;
}

function recordOf({ resolved, id }) {
  for (const key of ["towns", "landmarks", "dungeons", "camps", "zones"])
    for (const r of resolved[key] ?? []) if (r.id === id) return r;
  return null;
}

export function roadGraph({ resolved }) {
  const g = new Map();
  const link = (a, b) => {
    if (!g.has(a)) g.set(a, new Set());
    g.get(a).add(b);
  };
  for (const r of resolved.roads ?? []) {
    link(r.from, r.to);
    link(r.to, r.from);
  }
  return g;
}

function connected({ resolved, a, b }) {
  const g = roadGraph({ resolved });
  if (!g.has(a)) return false;
  const seen = new Set([a]);
  const queue = [a];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === b) return true;
    for (const next of g.get(cur) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return false;
}

// `road:<id>` names a road, not a place: the claim is membership, not reach.
function roadMembers({ resolved, roadId }) {
  const road = (resolved.roads ?? []).find((r) => r.id === roadId);
  if (!road) return null;
  return new Set([road.from, road.to, ...(road.throughRoute ? [road.throughRoute] : [])]);
}

function inScope({ record, scope, resolved }) {
  if (scope === "world") return true;
  if (scope.startsWith("continent:")) return resolved.continent === scope.slice("continent:".length);
  if (scope.startsWith("coast:")) return (record.coasts ?? []).includes(scope.slice("coast:".length));
  if (scope.startsWith("region:")) return record.region === scope.slice("region:".length);
  return false;
}

const miss = (got, message) => ({ ok: false, got, message });
const hit = (got) => ({ ok: true, got, message: null });

export function deriveRelation({ relation, resolved, fabric }) {
  const R = relation;
  if (!RELATION_KINDS.includes(R.rel))
    return miss(null, `unknown relation "${R.rel}" — the vocabulary is ${RELATION_KINDS.join(", ")}`);

  const need = (id) => {
    const p = pointOf({ resolved, id });
    return p ? { p } : { err: `"${id}" does not resolve in the resolved world` };
  };

  if (R.rel === "bearing") {
    const a = need(R.from), b = need(R.to);
    if (a.err || b.err) return miss(null, a.err ?? b.err);
    const deg = bearingDeg({ from: a.p, to: b.p });
    const rose = compassOf({ deg });
    const off = Math.abs(angDiff({ a: deg, b: DIR_DEG[R.dir] }));
    if (off <= R.toleranceDeg) return hit(rose);
    return miss(rose, `declared ${R.dir} +/-${R.toleranceDeg} deg, resolved ${rose} (${Math.round(deg)} deg)`);
  }

  if (R.rel === "distance") {
    const a = need(R.a), b = need(R.b);
    if (a.err || b.err) return miss(null, a.err ?? b.err);
    const km = round2(dist(a.p, b.p));
    const slack = (R.km * R.tolerancePct) / 100;
    if (Math.abs(km - R.km) <= slack) return hit(km);
    return miss(km, `declared ${R.km} km +/-${R.tolerancePct}%, resolved ${km.toFixed(2)} km`);
  }

  if (R.rel === "adjacency") {
    const regions = new Map();
    for (const f of Object.values(fabric ?? {}))
      for (const r of f.regions ?? []) regions.set(r.id, r);
    const ra = regions.get(R.a), rb = regions.get(R.b);
    if (!ra || !rb) return miss(null, `"${ra ? R.b : R.a}" is not a region in any fabric file`);
    const both = (ra.adjacent ?? []).includes(R.b) && (rb.adjacent ?? []).includes(R.a);
    if (both) return hit(true);
    return miss(false, `${R.a} and ${R.b} are not adjacent in the fabric (adjacency must hold in BOTH directions)`);
  }

  if (R.rel === "connected_by_road" || R.rel === "not_connected_by_road") {
    const want = R.rel === "connected_by_road";
    const roadOperand = [R.a, R.b].find((x) => typeof x === "string" && x.startsWith("road:"));
    let got;
    if (roadOperand) {
      const roadId = roadOperand.slice("road:".length);
      const members = roadMembers({ resolved, roadId });
      if (!members) return miss(null, `road "${roadId}" does not resolve in the resolved world`);
      const other = R.a === roadOperand ? R.b : R.a;
      got = members.has(other);
      if (got === want) return hit(got);
      return miss(got, got
        ? `${other} is on road "${roadId}" but the prose says it is not`
        : `${other} is not on road "${roadId}" but the prose says it is`);
    }
    got = connected({ resolved, a: R.a, b: R.b });
    if (got === want) return hit(got);
    return miss(got, got
      ? `${R.a} and ${R.b} ARE joined by road, but the prose says they are not`
      : `${R.a} and ${R.b} are NOT joined by road`);
  }

  if (R.rel === "betweenness") {
    const g = roadGraph({ resolved });
    const degree = (g.get(R.hub) ?? new Set()).size;
    if (degree >= R.minDegree) return hit(degree);
    return miss(degree, `${R.hub} has road degree ${degree}, needs >= ${R.minDegree}`);
  }

  if (R.rel === "colocated_with") {
    const a = need(R.subject), b = need(R.host);
    if (a.err || b.err) return miss(null, a.err ?? b.err);
    const km = round2(dist(a.p, b.p));
    const within = R.withinKm ?? 1.0;
    if (km <= within) return hit(km);
    return miss(km, `${R.subject} is ${km.toFixed(2)} km from ${R.host}, co-location allows ${within} km`);
  }

  // unique_in_scope — a GLOBAL NEGATIVE over everything in scope.
  const subject = recordOf({ resolved, id: R.subject });
  if (!subject) return miss(null, `"${R.subject}" does not resolve in the resolved world`);
  const holders = [];
  for (const key of ["towns", "landmarks", "dungeons"])
    for (const rec of resolved[key] ?? [])
      if ((rec.properties ?? []).includes(R.property) && inScope({ record: rec, scope: R.scope, resolved }))
        holders.push(rec.id);
  if (holders.length === 1 && holders[0] === R.subject) return hit(holders);
  if (!holders.includes(R.subject))
    return miss(holders, `${R.subject} does not hold "${R.property}" in scope ${R.scope} at all`);
  const rivals = holders.filter((h) => h !== R.subject).sort();
  return miss(holders, `"${R.property}" in scope ${R.scope} is also held by ${rivals.join(", ")}`);
}

const declaredOf = (R) => R.dir ?? R.km ?? R.minDegree ?? R.property ?? true;

export function checkRelations({ relations, resolved, fabric }) {
  const drifts = [];
  for (const R of relations ?? []) {
    const r = deriveRelation({ relation: R, resolved, fabric });
    if (r.ok) continue;
    drifts.push({ rel: R.rel, cite: R.cite, declared: declaredOf(R), resolved: r.got, message: r.message });
  }
  return { drifts };
}
```

- [ ] **Step 4: Write the relation schema**

Create `content/schemas/relation.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Atlas world relation set",
  "description": "One file per landmass. Each element is ONE machine-checkable n-ary claim the authored prose depends on, cited back to the section that makes it. The vocabulary is closed at eight relations because that is exactly what the existing prose asserts and nothing more — see the design's claim census. G-MEANING re-derives every element from the resolved world after a join and FAILS on mismatch; the citation is what tells a human which sentence to re-voice. Line citations are banned (they rot on insert, fifth occurrence) — cite the section.",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["rel", "cite"],
    "additionalProperties": false,
    "properties": {
      "rel": {
        "type": "string",
        "enum": ["bearing", "betweenness", "distance", "adjacency", "connected_by_road", "not_connected_by_road", "colocated_with", "unique_in_scope"]
      },
      "cite": { "type": "string", "minLength": 1, "pattern": "^(?!.*canon\\.md:[0-9])" },
      "note": { "type": "string" },
      "from": { "type": "string" },
      "to": { "type": "string" },
      "dir": { "type": "string", "enum": ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] },
      "toleranceDeg": { "type": "number", "minimum": 5, "maximum": 60 },
      "a": { "type": "string" },
      "b": { "type": "string" },
      "km": { "type": "number", "exclusiveMinimum": 0 },
      "tolerancePct": { "type": "number", "minimum": 1, "maximum": 25 },
      "hub": { "type": "string" },
      "minDegree": { "type": "integer", "minimum": 1 },
      "subject": { "type": "string" },
      "host": { "type": "string" },
      "withinKm": { "type": "number", "exclusiveMinimum": 0 },
      "property": { "type": "string", "minLength": 1 },
      "scope": { "type": "string", "pattern": "^(world|continent:c[0-9]{2}|coast:[a-z0-9-]+|region:c[0-9]{2}/r[0-9]{2})$" }
    },
    "allOf": [
      { "if": { "properties": { "rel": { "const": "bearing" } } }, "then": { "required": ["from", "to", "dir", "toleranceDeg"] } },
      { "if": { "properties": { "rel": { "const": "distance" } } }, "then": { "required": ["a", "b", "km", "tolerancePct"] } },
      { "if": { "properties": { "rel": { "const": "adjacency" } } }, "then": { "required": ["a", "b"] } },
      { "if": { "properties": { "rel": { "const": "connected_by_road" } } }, "then": { "required": ["a", "b"] } },
      { "if": { "properties": { "rel": { "const": "not_connected_by_road" } } }, "then": { "required": ["a", "b"] } },
      { "if": { "properties": { "rel": { "const": "betweenness" } } }, "then": { "required": ["hub", "minDegree"] } },
      { "if": { "properties": { "rel": { "const": "colocated_with" } } }, "then": { "required": ["subject", "host"] } },
      { "if": { "properties": { "rel": { "const": "unique_in_scope" } } }, "then": { "required": ["subject", "property", "scope"] } }
    ]
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test --test-name-pattern "relation|bearing|road|betweenness|colocated|unique_in_scope|adjacency|drift|committed byte" 'scripts/tests/*.test.mjs'`

Expected: PASS — 13 tests, 0 failures.

- [ ] **Step 6: Verify the schema itself compiles and accepts the test's relations**

Run:
```bash
node -e '
const Ajv = require("./scripts/node_modules/ajv");
const s = require("./content/schemas/relation.schema.json");
const v = new Ajv({ allErrors: true, strict: false }).compile(s);
const ok = v([{ rel: "bearing", from: "a", to: "b", dir: "E", toleranceDeg: 30, cite: "canon.md §4 \"Geography & trade logic\"" }]);
console.log("valid:", ok, JSON.stringify(v.errors));
const bad = v([{ rel: "bearing", from: "a", to: "b", dir: "E", toleranceDeg: 30, cite: "canon.md:185" }]);
console.log("line-citation rejected:", bad === false);
'
```
Expected: `valid: true null` then `line-citation rejected: true`.

- [ ] **Step 7: Prove the runtime emitter is untouched**

Run: `(cd colyseus-server && npm test -- mapDimensions)`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/relations.mjs scripts/tests/relations.test.mjs content/schemas/relation.schema.json
git commit -m "feat: relation derivation engine and schema"
git branch --show-current && git log --oneline -1
```

- [ ] **Step 9: Independent adversarial review of this task's diff**

Dispatch a fresh reviewer subagent (or `/code-review`) with this exact brief:

> Review `git diff HEAD~1` in this worktree against `docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md` §5.3. Attack: (a) is `bearingDeg` correct on a y-increases-south sheet, or is north and south transposed? (b) can any code path throw instead of returning `{ok:false}`? (c) does `unique_in_scope` actually implement a global negative, or does it only check the subject? (d) is `roadGraph` symmetric? (e) does anything computed here get written to disk?

- [ ] **Step 10: Refactor on the findings, then re-verify**

Apply every finding as a NEW commit (never `--amend`). Then re-run:
```bash
npm test --prefix scripts
(cd colyseus-server && npm test -- mapDimensions)
git branch --show-current && git log --oneline -1
```
Expected: both PASS. Phase report ends with the branch and the last commit line.

---

### Task 2: Civil record schemas, the world loader and G-BIND

**Files:**
- Create: `content/schemas/civil-record.schema.json`
- Create: `scripts/lib/resolve.mjs`
- Create: `scripts/tests/fixtures/world/base/**` (a complete miniature world)
- Create: `scripts/tests/fixtures/world/g-bind-coordinate/**`, `.../g-bind-shared-handle/**`, `.../g-bind-dangling-handle/**`
- Create: `scripts/tests/resolve.test.mjs`
- Modify: `scripts/check_content.mjs:26` (import) and `:1790` (call site)

**Interfaces:**
- Consumes (Plan C): `content/world/fabric/continent-NN.json` with `{ continent, seaLevel, cellKm, cellCensus, ownerHistogram, regions[], instances[] }`; `content/world/handles/continent-NN.json` with `{ continent, orderDigest, handles: [{ handle, type, sizeKm, region, contentHash, rank }] }`.
- Consumes (Plan B): `content/world/lexicon/landforms.json` — a flat array of `{ id, group, geometry, biomes, sizeKm, dungeonCapable, glyph, rarity, requires, gloss, absentBecause }`.
- Produces:
  - `export function loadCivil({ contentRoot }): { present: boolean, fabric: Record<string,object>, handles: Map<string,object>, ledgers: Record<string,object>, pinned: object[], bound: object[], relations: object[], lexicon: Map<string,object>, manifest: object|null, errors: string[] }`
  - `export function gBind({ world }): string[]`
  - `export function checkWorldCivil({ opts, fail, warn }): void`
  - `export const BANNED_COORDINATE_KEYS = ["at", "points", "rect", "anchor"]`

- [ ] **Step 1: Build the fixture world**

Create these files. This is the miniature world every gate in this plan tests against — two continents, four regions, six handles.

`scripts/tests/fixtures/world/base/world/manifest.json`:
```json
{
  "version": 1,
  "seed": "7c9e4a2f8b1d6e03",
  "frame": { "units": "km", "w": 400, "h": 400, "areaKm2": 160000 },
  "names": { "targetDistinct": 12, "reservedFile": "content/world/names/reserved.json" },
  "quotas": {
    "settlements": { "capital": 1, "hub": 1, "village": 0, "total": 2 },
    "townPlans": 1,
    "dungeons": { "complexes": 2, "floors": 6, "families": 1, "familySize": 2, "bespoke": 0 }
  }
}
```

`scripts/tests/fixtures/world/base/world/lexicon/landforms.json`. **Every `id` here is a real row of Plan B's 170-type lexicon and every `requires` key is one of its eleven** (`rock`, `precipDecileMin/Max`, `tempDecileMin/Max`, `slopeMin/Max`, `nearFlag`, `flowAccMin`, `elevMin/Max`) — the fixture is a SUBSET of the shipped vocabulary, never a parallel one, or the gates pass here and fail on the real world:
```json
[
  { "id": "karst-cenote", "group": "karst", "geometry": "point", "biomes": ["karst"], "sizeKm": [0.05, 0.6], "dungeonCapable": true, "glyph": "g-cenote", "rarity": "uncommon", "requires": { "rock": "carbonate", "precipDecileMin": 4 }, "gloss": "A collapsed limestone shaft flooded to the water table.", "absentBecause": null },
  { "id": "coastal-drowned-valley", "group": "coastal", "geometry": "area", "biomes": ["meadow"], "sizeKm": [0.5, 8.0], "dungeonCapable": false, "glyph": "g-ria", "rarity": "common", "requires": { "nearFlag": "SEA" }, "gloss": "A river valley the sea has walked up.", "absentBecause": null },
  { "id": "lava-tube", "group": "volcanic", "geometry": "line", "biomes": ["lava"], "sizeKm": [0.2, 4.0], "dungeonCapable": true, "glyph": "g-tube", "rarity": "rare", "requires": { "rock": "volcanic", "nearFlag": "ARC" }, "gloss": "A drained conduit under a cooled flow.", "absentBecause": null },
  { "id": "tidal-mire", "group": "wetland", "geometry": "area", "biomes": ["marsh"], "sizeKm": [0.5, 20.0], "dungeonCapable": false, "glyph": "g-mire", "rarity": "common", "requires": { "precipDecileMin": 5, "slopeMax": 0.02 }, "gloss": "Salt-worked mire the tide walks in and out of.", "absentBecause": null },
  { "id": "salt-pan-crust", "group": "desert", "geometry": "area", "biomes": ["alkali"], "sizeKm": [0.3, 12.0], "dungeonCapable": false, "glyph": "g-pan", "rarity": "common", "requires": { "rock": "clastic", "precipDecileMax": 1 }, "gloss": "Flat evaporite crust over a closed basin.", "absentBecause": null }
]
```

`scripts/tests/fixtures/world/base/world/fabric/continent-02.json`. **This carries every key Plan D's gates dereference, not just the ones G-BIND needs** — `outerRing` and `trunkRiver` (`resolveCivil`'s coastline/river), an `area` instance of a `SALTMIRE_TYPES` type (`resolveCivil`'s saltmire), a `terrainKind` that is a patch kind (`terrainPatches`), and `dungeonAnchors` (`gDungeonReach`). A fixture that omits one of these makes the gate that reads it pass vacuously, which is indistinguishable from the gate working:
```json
{
  "continent": "c02",
  "premise": "content/world/premises/continent-02.json",
  "seaLevel": 0.42,
  "cellKm": 0.5,
  "cellCensus": { "land": 640, "sea": 0, "lake": 0, "unowned": 0 },
  "ownerHistogram": { "c02/r01": 320, "c02/r02": 320 },
  "outerRing": [[136, 158], [182, 158], [182, 186], [136, 186]],
  "trunkRiver": { "points": [[141, 160], [148, 168], [152, 175], [158, 184]], "name": null },
  "regions": [
    { "id": "c02/r01", "survey": "surveyed", "areaKm2": 160.0, "terrainKind": "river-country", "biomeShares": { "meadow": 100 }, "ring": [[140, 160], [160, 160], [160, 180], [140, 180]], "levelBand": [1, 10], "adjacent": ["c02/r02"], "settlements": ["c-town-millcross"], "poi": 14 },
    { "id": "c02/r02", "survey": "surveyed", "areaKm2": 160.0, "terrainKind": "bramble", "biomeShares": { "bramble": 100 }, "ring": [[160, 160], [180, 160], [180, 180], [160, 180]], "levelBand": [15, 28], "adjacent": ["c02/r01"], "settlements": [], "poi": 12 }
  ],
  "instances": [
    { "id": "lf-c02-r01-0001", "type": "coastal-drowned-valley", "geometry": { "shape": "point", "at": [137.2, 182.4] }, "sizeKm": 2.4, "cell": [274, 364], "handle": "c02/coastal/h-a1b2", "region": "c02/r01", "named": true, "glyph": "g-ria", "dungeonCapable": false, "provenance": { "authored": "generated", "generator": { "pass": "coastal", "seedStream": "landform", "epoch": 0 }, "fabric": "fabric/continent-02" } },
    { "id": "lf-c02-r02-0002", "type": "karst-cenote", "geometry": { "shape": "point", "at": [166.0, 172.0] }, "sizeKm": 0.31, "cell": [332, 344], "handle": "c02/karst/h-0f42", "region": "c02/r02", "named": true, "glyph": "g-cenote", "dungeonCapable": true, "provenance": { "authored": "generated", "generator": { "pass": "karst", "seedStream": "landform", "epoch": 0 }, "fabric": "fabric/continent-02" } },
    { "id": "lf-c02-r02-0003", "type": "karst-cenote", "geometry": { "shape": "point", "at": [170.0, 175.0] }, "sizeKm": 0.12, "cell": [340, 350], "handle": "c02/karst/h-77aa", "region": "c02/r02", "named": false, "glyph": "g-cenote", "dungeonCapable": true, "provenance": { "authored": "generated", "generator": { "pass": "karst", "seedStream": "landform", "epoch": 0 }, "fabric": "fabric/continent-02" } },
    { "id": "lf-c02-r01-0004", "type": "tidal-mire", "geometry": { "shape": "area", "ring": [[142, 178], [150, 178], [150, 184], [142, 184]] }, "sizeKm": 6.0, "cell": [288, 362], "handle": "c02/wetland/h-5e10", "region": "c02/r01", "named": false, "glyph": "g-mire", "dungeonCapable": false, "provenance": { "authored": "generated", "generator": { "pass": "wetland", "seedStream": "landform", "epoch": 0 }, "fabric": "fabric/continent-02" } }
  ],
  "settlements": [
    { "id": "c-town-millcross", "title": "Millcross", "rank": "hub", "atKm": [152.2, 174.6], "cell": [304, 349], "region": "c02/r01", "continent": "c02", "score": 0.71 }
  ],
  "roads": [],
  "dungeonAnchors": [
    { "handle": "c02/karst/h-0f42", "region": "c02/r02", "hopsToSettlement": 1 },
    { "handle": "c02/coastal/h-a1b2", "region": "c02/r01", "hopsToSettlement": 0 }
  ],
  "pinReceipts": [
    { "id": "c-town-millcross", "at": [152.2, 174.6], "cell": [304, 349], "continent": "c02", "region": "c02/r01", "measured": { "landform": "river-terrace", "waterKind": "river", "shelterFetchKm": 0, "depthM": 0, "slope": 0.02, "freshWaterWithinKm": 0.1, "biome": "meadow", "elevationM": 40 } },
    { "id": "c-town-gildmark", "at": [137.2, 182.4], "cell": [274, 364], "continent": "c02", "region": "c02/r01", "measured": { "landform": "coastal-drowned-valley", "waterKind": "sea", "shelterFetchKm": 9, "depthM": 18, "slope": 0.03, "freshWaterWithinKm": 1.8, "biome": "meadow", "elevationM": 6 } }
  ]
}
```

`scripts/tests/fixtures/world/base/world/fabric/continent-10.json`:
```json
{
  "continent": "c10",
  "premise": "content/world/premises/continent-10.json",
  "seaLevel": 0.42,
  "cellKm": 0.5,
  "cellCensus": { "land": 320, "sea": 0, "lake": 0, "unowned": 0 },
  "ownerHistogram": { "c10/r01": 320 },
  "outerRing": [[328, 203], [352, 203], [352, 227], [328, 227]],
  "trunkRiver": null,
  "regions": [
    { "id": "c10/r01", "survey": "reported", "areaKm2": 480.0, "terrainKind": null, "biomeShares": { "lava": 100 }, "ring": [[330, 205], [350, 205], [350, 225], [330, 225]], "levelBand": [55, 80], "adjacent": [], "settlements": [], "poi": 0 }
  ],
  "instances": [
    { "id": "lf-c10-r01-0001", "type": "lava-tube", "geometry": { "shape": "point", "at": [340.0, 215.0] }, "sizeKm": 1.2, "cell": [680, 430], "handle": "c10/volcanic/h-3c9d", "region": "c10/r01", "named": true, "glyph": "g-tube", "dungeonCapable": true, "provenance": { "authored": "generated", "generator": { "pass": "volcanic", "seedStream": "landform", "epoch": 0 }, "fabric": "fabric/continent-10" } }
  ],
  "settlements": [],
  "roads": [],
  "dungeonAnchors": [
    { "handle": "c10/volcanic/h-3c9d", "region": "c10/r01", "hopsToSettlement": 2 }
  ],
  "pinReceipts": []
}
```

**c10 is deliberately the awkward continent.** It is `reported` (so `terrainKind` is `null` and it contributes no `terrainPatch`), it has no settlement of its own, and its single dungeon anchor sits at exactly `hopsToSettlement: 2` — the boundary `G-DUNGEON-REACH` allows. Green here means the gate accepts 2 and the `g-dungeon-reach-far` overlay is the only thing that reds it.

`scripts/tests/fixtures/world/base/world/handles/continent-02.json`:
```json
{
  "continent": "c02",
  "orderDigest": "sha256:0000000000000000000000000000000000000000000000000000000000000002",
  "handles": [
    { "handle": "c02/coastal/h-a1b2", "type": "coastal-drowned-valley", "sizeKm": 2.4, "region": "c02/r01", "contentHash": "sha256:a1b2000000000000000000000000000000000000000000000000000000000000", "rank": 0 },
    { "handle": "c02/karst/h-0f42", "type": "karst-cenote", "sizeKm": 0.31, "region": "c02/r02", "contentHash": "sha256:0f42000000000000000000000000000000000000000000000000000000000000", "rank": 1 },
    { "handle": "c02/karst/h-77aa", "type": "karst-cenote", "sizeKm": 0.12, "region": "c02/r02", "contentHash": "sha256:77aa000000000000000000000000000000000000000000000000000000000000", "rank": 2 },
    { "handle": "c02/wetland/h-5e10", "type": "tidal-mire", "sizeKm": 6.0, "region": "c02/r01", "contentHash": "sha256:5e10000000000000000000000000000000000000000000000000000000000000", "rank": 3 }
  ]
}
```

`scripts/tests/fixtures/world/base/world/handles/continent-10.json`:
```json
{
  "continent": "c10",
  "orderDigest": "sha256:0000000000000000000000000000000000000000000000000000000000000010",
  "handles": [
    { "handle": "c10/volcanic/h-3c9d", "type": "lava-tube", "sizeKm": 1.2, "region": "c10/r01", "contentHash": "sha256:3c9d000000000000000000000000000000000000000000000000000000000000", "rank": 0 }
  ]
}
```

`scripts/tests/fixtures/world/base/world/civil/pinned/c-town-gildmark.json`:
```json
{
  "id": "c-town-gildmark",
  "kind": "town",
  "tier": "pinned",
  "title": "Gildmark",
  "settlementRank": "capital",
  "pin": {
    "at": [137.2, 182.4],
    "toleranceKm": 1.5,
    "why": "canon §4: the only deepwater port on this coast; the act-5 plot depends on the monopoly"
  },
  "requires": {
    "continent": "c02",
    "landform": "coastal-drowned-valley",
    "water": { "kind": "sea", "shelterFetchKmMax": 15, "minDepthM": 12 },
    "slopeMax": 0.06,
    "freshWaterWithinKm": 4
  },
  "properties": ["deepwater-port"],
  "coasts": ["wealdmarch-west"],
  "plan": null,
  "prose": "authored",
  "provenance": { "authored": "hand", "generator": null },
  "resolution": null
}
```

`scripts/tests/fixtures/world/base/world/civil/bound/c-lm-the-drowned-stair.json`:
```json
{
  "id": "c-lm-the-drowned-stair",
  "kind": "landmark",
  "tier": "bound",
  "title": "The Drowned Stair",
  "bind": { "handle": "c02/karst/h-0f42", "expect": { "type": "karst-cenote", "sizeKm": [0.1, 0.8] } },
  "networkAnchor": true,
  "prose": "authored",
  "properties": [],
  "lore": {
    "note": "Cut steps run down the shaft wall and stop three fathoms under water.",
    "labelAnchor": "north",
    "source": "mariners' report, sworn at Gildmark harbour"
  },
  "resolution": null
}
```

`scripts/tests/fixtures/world/base/world/relations/c02.json`:
```json
[
  { "rel": "unique_in_scope", "subject": "c-town-gildmark", "property": "deepwater-port", "scope": "coast:wealdmarch-west", "cite": "canon.md §4 \"Geography & trade logic\"" }
]
```

Then the three red overlays (each one file, copied over `base`):

`scripts/tests/fixtures/world/g-bind-coordinate/world/civil/bound/c-lm-the-drowned-stair.json` — the same file with `"at": [166.0, 172.0]` added at top level after `"title"`.

`scripts/tests/fixtures/world/g-bind-shared-handle/world/civil/bound/c-lm-the-second-stair.json` — a copy of the bound record with `"id": "c-lm-the-second-stair"`, `"title": "The Second Stair"` and the SAME `bind.handle`.

`scripts/tests/fixtures/world/g-bind-dangling-handle/world/civil/bound/c-lm-the-drowned-stair.json` — the same file with `bind.handle` changed to `"c02/karst/h-dead"`.

- [ ] **Step 2: Write the failing test**

Create `scripts/tests/resolve.test.mjs`:

```js
// Plan D — the world loader and the binding gates.
//
// Fixture discipline is copied verbatim from spine-gates.test.mjs: a `base`
// dir holding a complete green world, plus one overlay dir per red case that
// is copied OVER the base. That is what keeps a red test one file long and
// makes "which rule fired" unambiguous.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCivil, gBind, BANNED_COORDINATE_KEYS } from "../lib/resolve.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIX = join(ROOT, "scripts/tests/fixtures/world");
const GATE = join(ROOT, "scripts/check_content.mjs");

export function worldFixture({ overlayDir = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "world-fix-"));
  cpSync(join(FIX, "base"), dir, { recursive: true });
  if (overlayDir) cpSync(join(FIX, overlayDir), dir, { recursive: true });
  return dir;
}

export function runWorldGate(dir) {
  try {
    const out = execFileSync(process.execPath, [GATE, "--only=spine", "--content-root", dir], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}

test("loadCivil reads two continents, three families and the lexicon", () => {
  const w = loadCivil({ contentRoot: worldFixture() });
  assert.equal(w.present, true);
  assert.deepEqual(w.errors, []);
  assert.deepEqual(Object.keys(w.fabric).sort(), ["c02", "c10"]);
  assert.equal(w.handles.size, 5);
  assert.equal(w.pinned.length, 1);
  assert.equal(w.bound.length, 1);
  assert.equal(w.relations.length, 1);
  assert.equal(w.lexicon.get("karst-cenote").dungeonCapable, true);
});

test("loadCivil soft-skips a content root with no world/ and records NO error", () => {
  const w = loadCivil({ contentRoot: join(ROOT, "scripts/tests/fixtures/spine/base") });
  assert.equal(w.present, false);
  assert.deepEqual(w.errors, []);
});

test("the banned coordinate keys are exactly the four the design names", () => {
  assert.deepEqual([...BANNED_COORDINATE_KEYS], ["at", "points", "rect", "anchor"]);
});

test("G-BIND is silent on the green fixture", () => {
  assert.deepEqual(gBind({ world: loadCivil({ contentRoot: worldFixture() }) }), []);
});

test("G-BIND red: a bound record carrying a coordinate key, at any depth", () => {
  const p = gBind({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-bind-coordinate" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-BIND: world\/civil\/bound\/c-lm-the-drowned-stair\.json carries key "at" — bound records hold meaning, never coordinates$/);
});

test("G-BIND red: two records claiming one handle", () => {
  const p = gBind({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-bind-shared-handle" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-BIND: handle "c02\/karst\/h-0f42" is claimed by 2 records: c-lm-the-drowned-stair, c-lm-the-second-stair$/);
});

test("G-BIND red: a handle no ledger carries", () => {
  const p = gBind({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-bind-dangling-handle" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-BIND: c-lm-the-drowned-stair handle "c02\/karst\/h-dead" does not resolve in any ledger$/);
});

test("the gate wires G-BIND into --only=spine and still exits 0 on the green world", () => {
  const r = runWorldGate(worldFixture());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /world-civil: 1 pinned, 1 bound, 1 relations, 5 handles/);
});

test("the gate goes red, with the exact message, on the coordinate overlay", () => {
  const r = runWorldGate(worldFixture({ overlayDir: "g-bind-coordinate" }));
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL {2}G-BIND: .*carries key "at"/);
});

test("a content root with no world\\/ dir stays green and prints no world-civil line", () => {
  const r = runWorldGate(join(ROOT, "scripts/tests/fixtures/spine/base"));
  assert.doesNotMatch(r.out, /world-civil:/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test --test-name-pattern "loadCivil|G-BIND|banned coordinate|world-civil|world/ dir" 'scripts/tests/*.test.mjs'`

Expected: FAIL with `Cannot find module '.../scripts/lib/resolve.mjs'`.

- [ ] **Step 4: Write the civil record schema**

Create `content/schemas/civil-record.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Atlas civil record (pinned or bound)",
  "description": "The authored half of the world. A PINNED record is a generator INPUT: a committed seed point plus the constraint block its prose depends on, honoured before the coastline settles. A BOUND record is a generator OUTPUT consumer: a stable handle plus a declared size band, and NO coordinate anywhere — G-BIND deep-scans for at/points/rect/anchor because two binding paths means two ways for a record to move. There is deliberately no bind.spineId. additionalProperties: false throughout: the bound layer is machine-written and every unexpected key is a bug.",
  "type": "object",
  "required": ["id", "kind", "tier", "title", "prose", "resolution"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^c-(town|lm|camp|dungeon)-[a-z0-9]+(-[a-z0-9]+)*$" },
    "kind": { "type": "string", "enum": ["town", "landmark", "camp", "dungeon"] },
    "tier": { "type": "string", "enum": ["pinned", "bound"] },
    "title": { "type": "string", "minLength": 1 },
    "settlementRank": { "type": "string", "enum": ["capital", "hub", "village"] },
    "properties": { "type": "array", "items": { "type": "string", "minLength": 1 } },
    "coasts": { "type": "array", "items": { "type": "string", "pattern": "^[a-z0-9-]+$" } },
    "networkAnchor": { "type": "boolean" },
    "plan": { "type": "string" },
    "prose": { "type": "string", "enum": ["authored", "frontier"] },
    "provenance": {
      "type": "object",
      "required": ["authored", "generator"],
      "additionalProperties": false,
      "properties": {
        "authored": { "type": "string", "enum": ["hand", "generated"] },
        "generator": { "type": ["object", "null"] }
      }
    },
    "resolution": { "type": ["object", "null"] },
    "pin": {
      "type": "object",
      "required": ["at", "toleranceKm", "why"],
      "additionalProperties": false,
      "properties": {
        "at": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number", "minimum": 0, "maximum": 400 } },
        "toleranceKm": { "type": "number", "exclusiveMinimum": 0, "maximum": 10 },
        "why": { "type": "string", "minLength": 10 }
      }
    },
    "requires": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "continent": { "type": "string", "pattern": "^c[0-9]{2}$" },
        "landform": { "type": "string", "minLength": 1 },
        "water": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": { "type": "string", "enum": ["sea", "lake", "river", "none"] },
            "shelterFetchKmMax": { "type": "number", "exclusiveMinimum": 0 },
            "minDepthM": { "type": "number", "minimum": 0 }
          }
        },
        "slopeMax": { "type": "number", "exclusiveMinimum": 0, "maximum": 1 },
        "freshWaterWithinKm": { "type": "number", "minimum": 0 },
        "biomeNot": { "type": "array", "items": { "type": "string" } },
        "elevationMaxM": { "type": "number" }
      }
    },
    "bind": {
      "type": "object",
      "required": ["handle", "expect"],
      "additionalProperties": false,
      "properties": {
        "handle": { "type": "string", "pattern": "^c[0-9]{2}/[a-z-]+/h-[0-9a-f]{4,6}$",
                     "description": "IDENTICAL to content/schemas/handle-ledger.schema.json and landform-instance.schema.json. 4-6 hex, not exactly 4: mintHandle slices 4 from contentHash and widens to 6 on a real collision (65,536 values against 1,740 instances makes one near-certain by the birthday bound). A stricter {4} here would hard-reject a handle the ledger considers valid the first time that fires. The group segment allows a hyphen because lexicon groups may be hyphenated." },
        "expect": {
          "type": "object",
          "required": ["type", "sizeKm"],
          "additionalProperties": false,
          "properties": {
            "type": { "type": "string", "minLength": 1 },
            "sizeKm": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number", "exclusiveMinimum": 0 } }
          }
        }
      }
    },
    "lore": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "note": { "type": "string", "minLength": 1 },
        "labelAnchor": { "type": "string", "enum": ["north", "south", "east", "west"] },
        "source": { "type": "string", "minLength": 1 }
      }
    }
  },
  "allOf": [
    { "if": { "properties": { "tier": { "const": "pinned" } } }, "then": { "required": ["pin", "requires", "provenance"] } },
    { "if": { "properties": { "tier": { "const": "bound" } } }, "then": { "required": ["bind", "lore"], "not": { "required": ["pin"] } } }
  ]
}
```

- [ ] **Step 5: Write the loader and G-BIND**

Create `scripts/lib/resolve.mjs`:

```js
// Plan D — the world loader, the binding gates and (from Task 7) the join.
//
// SOFT-SKIP DISCIPLINE IS LOAD-BEARING. `content/world/` is absent from ~45
// existing structural fixtures. loadCivil returns { present: false } with NO
// errors for a missing dir, exactly as loadSpine does. A gate that hard-fails
// on a missing content/world/ reds dozens of tests that never claimed to
// carry a world.
//
// NEVER THROWS. Every failure is a string pushed into a returned array — an
// uncaught throw inside check_content.mjs skips finish() and silently drops
// every FAIL recorded before it.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// The four keys a bound record may never carry, at any depth. A bound record
// that knows where it is has stopped being bound.
export const BANNED_COORDINATE_KEYS = Object.freeze(["at", "points", "rect", "anchor"]);

const readJsonSafe = (path, errors) => {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { errors.push(`world: ${path}: ${e.message}`); return null; }
};

const listJson = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];

export function loadCivil({ contentRoot }) {
  const root = join(contentRoot, "world");
  const empty = {
    present: false, fabric: {}, handles: new Map(), ledgers: {},
    pinned: [], bound: [], relations: [], lexicon: new Map(), manifest: null, errors: [],
  };
  if (!existsSync(root)) return empty;

  const errors = [];
  const fabric = {};
  for (const f of listJson(join(root, "fabric"))) {
    const doc = readJsonSafe(join(root, "fabric", f), errors);
    if (doc?.continent) fabric[doc.continent] = doc;
  }

  const ledgers = {};
  const handles = new Map();
  for (const f of listJson(join(root, "handles"))) {
    const doc = readJsonSafe(join(root, "handles", f), errors);
    if (!doc?.continent) continue;
    ledgers[doc.continent] = doc;
    for (const h of doc.handles ?? []) handles.set(h.handle, { ...h, continent: doc.continent });
  }

  const civilOf = (sub) =>
    listJson(join(root, "civil", sub)).map((f) => {
      const doc = readJsonSafe(join(root, "civil", sub, f), errors);
      return doc ? { file: `world/civil/${sub}/${f}`, doc } : null;
    }).filter(Boolean);

  const pinned = civilOf("pinned");
  const bound = civilOf("bound");

  const relations = [];
  for (const f of listJson(join(root, "relations"))) {
    const doc = readJsonSafe(join(root, "relations", f), errors);
    if (Array.isArray(doc)) for (const r of doc) relations.push({ ...r, file: `world/relations/${f}` });
  }

  const lexicon = new Map();
  const lexDoc = existsSync(join(root, "lexicon/landforms.json"))
    ? readJsonSafe(join(root, "lexicon/landforms.json"), errors) : null;
  for (const row of Array.isArray(lexDoc) ? lexDoc : []) lexicon.set(row.id, row);

  const manifest = existsSync(join(root, "manifest.json"))
    ? readJsonSafe(join(root, "manifest.json"), errors) : null;

  return { present: true, fabric, handles, ledgers, pinned, bound, relations, lexicon, manifest, errors };
}

// Deep scan: a coordinate hidden three levels down is still a coordinate.
function findBannedKey(value) {
  if (Array.isArray(value)) {
    for (const v of value) { const hit = findBannedKey(v); if (hit) return hit; }
    return null;
  }
  if (value && typeof value === "object") {
    for (const k of Object.keys(value)) {
      if (BANNED_COORDINATE_KEYS.includes(k)) return k;
      const hit = findBannedKey(value[k]);
      if (hit) return hit;
    }
  }
  return null;
}

export function gBind({ world }) {
  if (!world.present) return [];
  const problems = [];
  const claims = new Map(); // handle -> [record ids]

  for (const { file, doc } of world.bound) {
    const banned = findBannedKey(doc);
    if (banned)
      problems.push(`G-BIND: ${file} carries key "${banned}" — bound records hold meaning, never coordinates`);

    const handle = doc.bind?.handle;
    if (typeof handle !== "string") continue;
    if (!claims.has(handle)) claims.set(handle, []);
    claims.get(handle).push(doc.id);
    if (!world.handles.has(handle))
      problems.push(`G-BIND: ${doc.id} handle "${handle}" does not resolve in any ledger`);
  }

  for (const [handle, ids] of [...claims.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    if (ids.length > 1)
      problems.push(`G-BIND: handle "${handle}" is claimed by ${ids.length} records: ${[...ids].sort().join(", ")}`);

  return problems;
}

// The ONE entry point check_content.mjs calls. Every gate this plan adds is
// wired here, so `--only=spine` covers all of them and Gate 1's ~4 s budget
// binds the whole set.
export function checkWorldCivil({ opts, fail, warn }) {
  const world = loadCivil({ contentRoot: opts.contentRoot });
  if (!world.present) return;
  for (const e of world.errors) fail(e);
  for (const p of gBind({ world })) fail(p);
  console.log(
    `world-civil: ${world.pinned.length} pinned, ${world.bound.length} bound, ` +
    `${world.relations.length} relations, ${world.handles.size} handles`,
  );
}
```

- [ ] **Step 6: Wire it into the gate**

Modify `scripts/check_content.mjs:26` — append one import line immediately after the existing `lib/spine.mjs` import:

```js
// Plan D: the pinned/bound/relation gates. Pure logic in lib/resolve.mjs, per
// this file's own rule — check_content.mjs ends in a bare main() and is not
// importable, so gate tests spawn it against fixture content roots.
import { checkWorldCivil } from "./lib/resolve.mjs";
```

Modify `scripts/check_content.mjs:1790` — insert immediately BEFORE the existing line `checkSpineStoryAlias({ opts, report: fail });`:

```js
  // Plan D — the world-meaning gates (G-BIND, and from later tasks G-PIN-SAT,
  // G-HANDLE-BAND, G-BAND, G-DUNGEON-REACH, G-MEANING, G-NAME-*). Placed here
  // so `--only=spine` covers them: they need only spine + fabric + civil, and
  // the design's placement rule puts exactly that set in checkSpine().
  checkWorldCivil({ opts, fail, warn });

```

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test --test-name-pattern "loadCivil|G-BIND|banned coordinate|world-civil|world/ dir" 'scripts/tests/*.test.mjs'`

Expected: PASS — 9 tests, 0 failures.

- [ ] **Step 8: Prove no existing fixture regressed**

Run:
```bash
npm test --prefix scripts 2>&1 | tail -20
node scripts/check_content.mjs --only=spine
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: the scripts suite passes with the same test count plus 9; `check_content.mjs --only=spine` exits 0 and prints **no** `world-civil:` line (the real content root has no `content/world/` yet); the jest pin passes.

- [ ] **Step 9: Commit**

```bash
git add content/schemas/civil-record.schema.json scripts/lib/resolve.mjs scripts/tests/resolve.test.mjs scripts/tests/fixtures/world scripts/check_content.mjs
git commit -m "feat: civil record schema, world loader and G-BIND"
git branch --show-current && git log --oneline -1
```

- [ ] **Step 10: Independent adversarial review of this task's diff**

Reviewer brief:

> Review `git diff HEAD~1` against the spec §5.1, §5.2, §5.4 and §8.3. Attack: (a) does `loadCivil` record an error for a merely-absent `content/world/`, which would redden ~45 existing structural fixtures? Prove it by running `npm test --prefix scripts` and reporting the delta in test count and failures. (b) Can `findBannedKey` be evaded by nesting, or by an array of objects? (c) Is `gBind`'s output order deterministic (it is printed into a gate log that gets diffed)? (d) Does the new call site sit before `finish()` on every path, including the `--only=spine` fast path at `check_content.mjs:184-191`? (e) Does anything in the new code throw?

- [ ] **Step 11: Refactor on the findings, then re-verify**

Apply findings as a NEW commit. Re-run:
```bash
npm test --prefix scripts
node scripts/check_content.mjs --only=spine
(cd colyseus-server && npm test -- mapDimensions)
git branch --show-current && git log --oneline -1
```
Expected: all PASS.

---

### Task 3: The name generator

626 distinct names are needed (336 landforms + 45 settlements + 60 dungeons + 160 regions + 13 landmasses + 3 oceans + 9 seas) against a committed pool of **12 x 10 = 120 combinations** (`tools/mapforge/lib/world-gen.mjs:70-71`). A slack ratio of 0.19 cannot converge under any rejection filter, so the generator is replaced, not de-duplicated. Uniqueness alone is not the bar either — the current pool is already 100% unique and still unusable, because every name is a two-syllable Germanic trochee.

**Files:**
- Create: `content/world/names/registers.json`
- Create: `content/world/names/classifiers.json`
- Create: `content/world/names/reserved.json`
- Create: `tools/mapforge/lib/name-gen.mjs`
- Test: `scripts/tests/name-gen.test.mjs`
- Modify: `scripts/lib/resolve.mjs` (append `gNames`, call it from `checkWorldCivil`; created in Task 2)

**Interfaces:**
- Consumes: nothing from other plans.
- Produces:
  - `export const REGISTERS = ["basin-anglic","north-log","moorstone","sandtongue","reedspeech"]`
  - `export const NAME_FORMS = ["stem","stem-classifier","of-form","compound"]`
  - `export function mintName({ register, form, classifier, stream, used, reserved }): string`
  - `export function phonemeDistance({ a, b }): number`
  - `export function prosody({ names }): { syllableShare: number, threePlusShare: number, ofFormShare: number }`
  - `export function syllableCount({ name }): number`
  - `export function registerOf({ continent, registers }): string`
  - `export function gNames({ world }): string[]` (in `scripts/lib/resolve.mjs`)

**Deliberate deviation from the shared contract, stated so a reviewer can object:** the contract sketches "5 registers x (16 onsets, 12 rimes, 6 links, ~30 classifiers)". Classifiers are split into their own shared file keyed by **lexicon group** (12 groups x 3 words = 36), with a per-register override block, because a classifier is a semantic hook about the landform kind ("Fenster", "Sink", "Geo"), not a dialect marker. Duplicating 30 classifiers into all five registers would let the same landform kind be a "Scar" on one continent and a "Sink" on another with nothing able to tell which was intended.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/name-gen.test.mjs`:

```js
// Plan D — the name generator. The old pool is 120 combinations against 626
// names; this suite's first job is to prove the replacement CONVERGES, and
// its second is to prove the four failures the design names (register
// collapse, sound confusability, no semantic hook, prosodic monotony) are
// each caught by a gate rather than left to taste.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REGISTERS, NAME_FORMS, mintName, phonemeDistance, prosody, syllableCount, registerOf,
} from "../../tools/mapforge/lib/name-gen.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const registers = JSON.parse(readFileSync(join(ROOT, "content/world/names/registers.json"), "utf8"));
const classifiers = JSON.parse(readFileSync(join(ROOT, "content/world/names/classifiers.json"), "utf8"));
const reserved = new Set(JSON.parse(readFileSync(join(ROOT, "content/world/names/reserved.json"), "utf8")).names);

test("five registers, each with 16 onsets, 12 rimes and 6 links", () => {
  assert.deepEqual(Object.keys(registers.registers).sort(), [...REGISTERS].sort());
  for (const [id, r] of Object.entries(registers.registers)) {
    assert.equal(r.onsets.length, 16, `${id} onsets`);
    assert.equal(r.rimes.length, 12, `${id} rimes`);
    assert.equal(r.links.length, 6, `${id} links`);
    assert.equal(new Set(r.onsets).size, 16, `${id} onsets must be distinct`);
    assert.equal(new Set(r.rimes).size, 12, `${id} rimes must be distinct`);
  }
});

test("classifiers cover all twelve landform groups", () => {
  const groups = ["coastal", "fluvial", "mountain", "glacial", "karst", "erosional",
                  "desert", "volcanic", "wetland", "lakes", "island", "oceanic"];
  for (const g of groups) {
    assert.ok(Array.isArray(classifiers.byGroup[g]), `group ${g} missing`);
    assert.ok(classifiers.byGroup[g].length >= 3, `group ${g} needs >= 3 classifiers`);
  }
});

test("every committed canon name is reserved", () => {
  for (const n of ["Millcross", "Gildmark", "Rooktide", "Cindervast", "Embervale",
                   "Norhollow", "Thornveil", "Coldreach", "Galereach", "Keelbreak",
                   "Tarnmark", "Stonemoor", "Reedstrand", "Driftholt", "Brightfall",
                   "Rimewall Cap", "Tallowquay", "Netstead"])
    assert.ok(reserved.has(n), `${n} must be in reserved.json`);
});

test("mintName is deterministic in (register, form, classifier, stream, used)", () => {
  const args = { register: registers.registers["basin-anglic"], form: "stem", classifier: null,
                 stream: "d9a0051d32afab59", used: new Set(), reserved };
  assert.equal(mintName(args), mintName({ ...args, used: new Set() }));
});

test("mintName never re-mints a used or reserved name", () => {
  const used = new Set();
  for (let i = 0; i < 200; i++) {
    const n = mintName({ register: registers.registers["north-log"], form: "stem", classifier: null,
                         stream: "90d0166357877d7c", used, reserved });
    assert.ok(!used.has(n), "duplicate mint");
    assert.ok(!reserved.has(n), `${n} collides with a reserved canon name`);
    used.add(n);
  }
  assert.equal(used.size, 200);
});

test("the generator converges at 626 names across five registers", () => {
  const used = new Set();
  let minted = 0;
  for (const id of REGISTERS) {
    for (let i = 0; i < 126; i++) {
      const form = NAME_FORMS[i % NAME_FORMS.length];
      const classifier = form === "stem" ? null : classifiers.byGroup.karst[i % 3];
      used.add(mintName({ register: registers.registers[id], form, classifier,
                          stream: `stream-${id}`, used, reserved }));
      minted++;
    }
  }
  assert.equal(minted, 630);
  assert.equal(used.size, 630, "every name must be globally distinct");
});

test("G-NAME-SOUND: phoneme distance collapses digraphs, so Rooktide/Rooktyde are near", () => {
  assert.ok(phonemeDistance({ a: "Rooktide", b: "Rooktyde" }) <= 1);
  assert.ok(phonemeDistance({ a: "Rooktide", b: "Reedstrand" }) >= 3);
  assert.ok(phonemeDistance({ a: "Thornveil", b: "Tornveil" }) <= 1); // th -> one phoneme
});

test("syllable counting is vowel-group based", () => {
  assert.equal(syllableCount({ name: "Millcross" }), 2);
  assert.equal(syllableCount({ name: "Cindervast" }), 3);
  assert.equal(syllableCount({ name: "The Drowned Stair" }), 3);
});

test("G-NAME-PROSODY: a monotonous set is measurable", () => {
  const flat = prosody({ names: ["Millcross", "Gildmark", "Rooktide", "Norhollow"] });
  assert.ok(flat.syllableShare > 0.6, "four two-syllable trochees must exceed the 60% ceiling");
  assert.equal(flat.threePlusShare, 0.25);
  const mixed = prosody({ names: ["Millcross", "Cindervast", "Stair of the Meltwash", "Gildmark", "Fenster of Slateflow"] });
  assert.ok(mixed.ofFormShare >= 0.10);
});

test("island chains inherit the nearest continent's register", () => {
  assert.equal(registerOf({ continent: "c11", registers }), registerOf({ continent: "c04", registers }));
  assert.equal(registerOf({ continent: "c02", registers }), "basin-anglic");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "register|classifier|mintName|converge|G-NAME|syllable|reserved" 'scripts/tests/*.test.mjs'`

Expected: FAIL with `Cannot find module '.../tools/mapforge/lib/name-gen.mjs'`.

- [ ] **Step 3: Write the three name data files**

Create `content/world/names/registers.json`:

```json
{
  "version": 1,
  "note": "Five phonological registers. A landmass draws its names from exactly one; cross-register leakage is G-NAME-REGISTER. Island chains inherit the nearest continent's register (continentRegister below), which is why five registers cover thirteen landmasses. Capacity per register is 16 x 12 = 192 monosyllabic stems and ~2.2M disyllabic forms before filtering, against ~125 names needed — the old pool was 120 against 626.",
  "continentRegister": {
    "c01": "north-log", "c02": "basin-anglic", "c03": "north-log", "c04": "moorstone",
    "c05": "sandtongue", "c06": "reedspeech", "c07": "reedspeech", "c08": "reedspeech",
    "c09": "reedspeech", "c10": "sandtongue", "c11": "moorstone", "c12": "north-log",
    "c13": "reedspeech"
  },
  "registers": {
    "basin-anglic": {
      "gloss": "The settled basin. Terse noun+noun compounds, first-stressed.",
      "onsets": ["Mill", "Gild", "Rook", "Ember", "Nor", "Cinder", "Thorn", "Weld", "Harrow", "Bram", "Ford", "Wain", "Kell", "Barrow", "Stock", "Marl"],
      "rimes": ["cross", "mark", "tide", "vale", "hollow", "veil", "stead", "gate", "wick", "field", "row", "bourne"],
      "links": ["of the", "under", "at", "by", "over", "beneath"]
    },
    "north-log": {
      "gloss": "Ships' logs off the ice. Long open vowels, hard finals.",
      "onsets": ["Cold", "Rime", "Gale", "Keel", "Drift", "Frost", "Skerry", "Haul", "Lode", "Bear", "Storm", "Cairn", "Fast", "Wrack", "Snow", "Hale"],
      "rimes": ["reach", "wall", "break", "holt", "fast", "shore", "sound", "hold", "way", "ness", "haven", "spar"],
      "links": ["out of", "beyond", "off", "past", "north of", "under"]
    },
    "moorstone": {
      "gloss": "Limestone pavement country. Dry, flat, consonant-heavy.",
      "onsets": ["Stone", "Slate", "Pave", "Grike", "Clint", "Shale", "Dolin", "Sink", "Flag", "Scar", "Chalk", "Lime", "Gryke", "Karn", "Fen", "Tarn"],
      "rimes": ["moor", "flow", "sink", "fell", "clint", "shaft", "pot", "lack", "stone", "rake", "gill", "grike"],
      "links": ["under", "of", "below", "through", "at", "over"]
    },
    "sandtongue": {
      "gloss": "Rain-shadow erg and volcanic arc. Open, breathy, borrowed.",
      "onsets": ["Thirst", "Erg", "Ash", "Fume", "Sirocc", "Barchan", "Cinder", "Yard", "Sabkh", "Reg", "Dune", "Char", "Ember", "Sear", "Glass", "Pumic"],
      "rimes": ["wold", "spar", "water", "sea", "reach", "wind", "burn", "pan", "flat", "cone", "vent", "waste"],
      "links": ["of the", "beyond", "across", "under", "past", "within"]
    },
    "reedspeech": {
      "gloss": "Delta, fog forest and bar country. Soft, wet, many-syllabled.",
      "onsets": ["Reed", "Loam", "Silt", "Willow", "Bright", "Wrack", "Quill", "Mere", "Osier", "Sedge", "Alder", "Marram", "Withy", "Bittern", "Lagoon", "Tidal"],
      "rimes": ["strand", "spit", "fall", "reef", "low", "shallow", "lobe", "bar", "mere", "run", "eyot", "holm"],
      "links": ["of the", "among", "between", "below", "at", "within"]
    }
  }
}
```

Create `content/world/names/classifiers.json`:

```json
{
  "version": 1,
  "note": "The semantic hook, keyed by LEXICON GROUP rather than by register. A classifier tells a reader what the place IS ('the Drowned Stair' is a shaft, 'Slateflow Sink' is a swallow hole) — that is a property of the landform kind, not of the dialect. Registers may override a group's list where the dialect genuinely differs; overrides are additive and never remove a base word.",
  "byGroup": {
    "coastal": ["Head", "Roads", "Geo", "Stack"],
    "fluvial": ["Ford", "Race", "Reach", "Confluence"],
    "mountain": ["Spar", "Saddle", "Horn", "Rake"],
    "glacial": ["Tongue", "Moraine", "Cwm", "Nunatak"],
    "karst": ["Sink", "Fenster", "Stair", "Pot"],
    "erosional": ["Scar", "Cleft", "Undercut", "Slot"],
    "desert": ["Pan", "Waste", "Barchan", "Yardang"],
    "volcanic": ["Cone", "Vent", "Tube", "Caldera"],
    "wetland": ["Mire", "Carr", "Fen", "Quag"],
    "lakes": ["Tarn", "Mere", "Deep", "Shallow"],
    "island": ["Holm", "Eyot", "Skerry", "Stack"],
    "oceanic": ["Shoal", "Bank", "Trench", "Rip"]
  },
  "overrides": {
    "north-log": { "glacial": ["Tongue", "Moraine", "Cwm", "Nunatak", "Bergfall"] },
    "sandtongue": { "volcanic": ["Cone", "Vent", "Tube", "Caldera", "Fumarole"] }
  }
}
```

Create `content/world/names/reserved.json`:

```json
{
  "version": 1,
  "note": "A HARD exclusion set. Every hand-authored canon name lives here so a re-seed can never re-mint a canon name onto different ground — the failure mode where 'Gildmark' resolves cleanly to a village on another continent and the whole act-5 plot silently relocates. Add to this file whenever new canon prose names a place; never remove.",
  "names": [
    "Millcross", "Gildmark", "Rooktide", "Cindervast", "Embervale", "Norhollow",
    "Thornveil", "Northern Icefield", "Ashvale Front", "Emberdown", "Hollowmarch",
    "Meltwash Terrace", "Millcross Ford", "Gildmark Head", "Rooktide Reach",
    "Peatrun Coast", "The Saltmire", "Eastern Hills", "The Meltwash", "Frontier Shelf",
    "Coldreach", "Stonemoor", "Rimewall Cap", "Driftholt", "Reedstrand", "Brightfall",
    "Wealdmarch", "Thirstwold", "Wracklow", "Ashen Spar", "Quillreef", "Skerryfast", "Loamspit",
    "Galereach", "Keelbreak", "Tarnmark", "West Sea", "Gildmark Roads", "Peatrun Shallows",
    "Wreckwater", "Netstead Bight", "Drowned Pavement", "Fumewater", "Reed Shallows",
    "Rimewall Margin", "Tallowquay", "Netstead", "Slateflow", "Expedition Camp"
  ]
}
```

- [ ] **Step 4: Write the generator**

Create `tools/mapforge/lib/name-gen.mjs`:

```js
// Plan D — the name generator.
//
// Replaces tools/mapforge/lib/world-gen.mjs:70-71's 12 x 10 = 120-combination
// pool. 626 names are needed. Uniqueness was never the problem: the old pool
// is already 100% unique and still unusable, because every name is a
// two-syllable Germanic trochee and nothing tells you what the place IS.
//
// Determinism: sha256 over (stream, attempt). No Math.random, no mutable
// module state. Given the same (register, form, classifier, stream, used,
// reserved) the same name comes out on every engine.
import { createHash } from "node:crypto";

export const REGISTERS = Object.freeze([
  "basin-anglic", "north-log", "moorstone", "sandtongue", "reedspeech",
]);
export const NAME_FORMS = Object.freeze(["stem", "stem-classifier", "of-form", "compound"]);

// A 32-bit unsigned draw from a named stream at a given attempt index.
function draw({ stream, attempt, slot }) {
  const h = createHash("sha256").update(`${stream}:${attempt}:${slot}`).digest();
  return h.readUInt32BE(0);
}

const pick = (arr, n) => arr[n % arr.length];

function buildName({ register, form, classifier, attempt, stream }) {
  const onset = pick(register.onsets, draw({ stream, attempt, slot: "onset" }));
  const rime = pick(register.rimes, draw({ stream, attempt, slot: "rime" }));
  const link = pick(register.links, draw({ stream, attempt, slot: "link" }));
  const onset2 = pick(register.onsets, draw({ stream, attempt, slot: "onset2" }));
  const stem = `${onset}${rime}`;
  if (form === "stem") return stem;
  if (form === "stem-classifier") return classifier ? `${stem} ${classifier}` : stem;
  if (form === "of-form") return classifier ? `${classifier} ${link} ${stem}` : `${onset2} ${link} ${stem}`;
  return `${onset}${pick(register.rimes, draw({ stream, attempt, slot: "rime2" }))}${rime}`;
}

// Draws until the candidate is neither used nor reserved. The attempt index is
// part of the hash input, so the search itself is deterministic; a caller that
// mints the same sequence twice gets the same sequence.
export function mintName({ register, form, classifier, stream, used, reserved }) {
  for (let attempt = 0; attempt < 4096; attempt++) {
    const cand = buildName({ register, form, classifier, attempt, stream });
    if (!used.has(cand) && !reserved.has(cand)) return cand;
  }
  // In-band, never a throw: a caller in a gate must be able to report this.
  return `UNMINTABLE:${stream}:${form}`;
}

// Phoneme normalisation: collapse the digraphs that carry one sound, drop
// doubled letters and a silent trailing e, so Rooktide/Rooktyde read as near
// and Thornveil/Tornveil read as identical onsets.
function phonemes({ name }) {
  return name
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/th/g, "T").replace(/sh/g, "S").replace(/ch/g, "C")
    .replace(/ck/g, "k").replace(/ph/g, "f").replace(/qu/g, "kw")
    .replace(/(.)\1+/g, "$1")
    .replace(/y/g, "i")
    .replace(/e$/, "");
}

export function phonemeDistance({ a, b }) {
  const x = phonemes({ name: a }), y = phonemes({ name: b });
  const prev = new Array(y.length + 1);
  const cur = new Array(y.length + 1);
  for (let j = 0; j <= y.length; j++) prev[j] = j;
  for (let i = 1; i <= x.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= y.length; j++) prev[j] = cur[j];
  }
  return prev[y.length];
}

export function syllableCount({ name }) {
  const m = name.toLowerCase().replace(/[^a-z ]/g, "").match(/[aeiouy]+/g);
  return m ? m.length : 1;
}

export function prosody({ names }) {
  if (!names.length) return { syllableShare: 0, threePlusShare: 0, ofFormShare: 0 };
  const counts = new Map();
  let threePlus = 0, ofForm = 0;
  for (const n of names) {
    const s = syllableCount({ name: n });
    counts.set(s, (counts.get(s) ?? 0) + 1);
    if (s >= 3) threePlus++;
    if (/\s(of|of the|under|beyond|among|between|below|within|off|past|across|through|at|by|over|out of|north of|beneath)\s/i.test(n)) ofForm++;
  }
  return {
    syllableShare: Math.max(...counts.values()) / names.length,
    threePlusShare: threePlus / names.length,
    ofFormShare: ofForm / names.length,
  };
}

export function registerOf({ continent, registers }) {
  return registers.continentRegister[continent] ?? null;
}
```

- [ ] **Step 5: Add the three name gates**

Modify `scripts/lib/resolve.mjs` — append this export and call it from `checkWorldCivil` immediately after the `gBind` loop:

```js
import { REGISTERS, phonemeDistance, prosody, syllableCount, registerOf } from "../../tools/mapforge/lib/name-gen.mjs";

// G-NAME-REGISTER / G-NAME-SOUND / G-NAME-PROSODY. The design's four naming
// failures, one gate each; uniqueness is NOT among them because the old
// generator was already 100% unique and still unusable.
export function gNames({ world, registers, classifiers }) {
  if (!world.present || !registers) return [];
  const problems = [];
  const byContinent = new Map();
  for (const { doc } of [...world.pinned, ...world.bound]) {
    const cont = doc.requires?.continent ?? doc.bind?.handle?.slice(0, 3) ?? null;
    if (!cont) continue;
    if (!byContinent.has(cont)) byContinent.set(cont, []);
    byContinent.get(cont).push(doc);
  }

  for (const [cont, docs] of [...byContinent.entries()].sort()) {
    const regId = registerOf({ continent: cont, registers });
    const reg = registers.registers[regId];
    if (!reg) { problems.push(`G-NAME-REGISTER: ${cont} has no register in registers.json`); continue; }

    for (const doc of docs) {
      if (doc.provenance?.authored === "hand") continue; // canon names predate the registers
      const stem = doc.title.split(" ")[0];
      const onsetOk = reg.onsets.some((o) => stem.startsWith(o));
      const rimeOk = reg.rimes.some((r) => stem.endsWith(r));
      if (!onsetOk || !rimeOk)
        problems.push(`G-NAME-REGISTER: ${doc.id} "${doc.title}" is not in register "${regId}" for ${cont}`);
      if (doc.kind === "landmark" && doc.prose === "frontier") {
        const group = doc.bind?.handle?.split("/")[1] ?? null;
        const legal = [...(classifiers.byGroup[group] ?? []), ...(classifiers.overrides?.[regId]?.[group] ?? [])];
        if (legal.length && !legal.some((c) => doc.title.includes(c)))
          problems.push(`G-NAME-REGISTER: ${doc.id} "${doc.title}" carries no classifier from group "${group}" (${legal.join(", ")})`);
      }
    }

    const names = docs.map((d) => d.title);
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        if (phonemeDistance({ a: names[i], b: names[j] }) >= 3) continue;
        if (Math.abs(syllableCount({ name: names[i] }) - syllableCount({ name: names[j] })) > 1) continue;
        problems.push(`G-NAME-SOUND: ${cont}: "${names[i]}" and "${names[j]}" are within 2 phonemes of each other`);
      }

    if (names.length >= 10) {
      const p = prosody({ names });
      if (p.syllableShare > 0.60)
        problems.push(`G-NAME-PROSODY: ${cont}: ${(p.syllableShare * 100).toFixed(1)}% of names share one syllable count (ceiling 60%)`);
      if (p.threePlusShare < 0.15)
        problems.push(`G-NAME-PROSODY: ${cont}: ${(p.threePlusShare * 100).toFixed(1)}% of names are 3+ syllables (floor 15%)`);
      if (p.ofFormShare < 0.10)
        problems.push(`G-NAME-PROSODY: ${cont}: ${(p.ofFormShare * 100).toFixed(1)}% of names take the "X of Y" form (floor 10%)`);
    }
  }
  return problems;
}
```

and in `checkWorldCivil`, after `for (const p of gBind({ world })) fail(p);`:

```js
  const namesDir = join(opts.contentRoot, "world/names");
  const registers = existsSync(join(namesDir, "registers.json"))
    ? JSON.parse(readFileSync(join(namesDir, "registers.json"), "utf8")) : null;
  const classifiers = existsSync(join(namesDir, "classifiers.json"))
    ? JSON.parse(readFileSync(join(namesDir, "classifiers.json"), "utf8")) : { byGroup: {}, overrides: {} };
  for (const p of gNames({ world, registers, classifiers })) fail(p);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test --test-name-pattern "register|classifier|mintName|converge|G-NAME|syllable|reserved|island chains" 'scripts/tests/*.test.mjs'`

Expected: PASS — 10 tests, 0 failures. If "the generator converges at 626 names" fails with `UNMINTABLE`, the register tables are too small — widen `rimes`, do not loosen `reserved`.

- [ ] **Step 7: Verify nothing else regressed and the runtime is untouched**

Run:
```bash
npm test --prefix scripts
node scripts/check_content.mjs --only=spine
node --test 'tools/mapforge/tests/*.test.mjs'
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add content/world/names scripts/lib/resolve.mjs tools/mapforge/lib/name-gen.mjs scripts/tests/name-gen.test.mjs
git commit -m "feat: register-driven name generator and the three name gates"
git branch --show-current && git log --oneline -1
```

- [ ] **Step 9: Independent adversarial review of this task's diff**

Reviewer brief:

> Review `git diff HEAD~1` against spec §6.6. Attack: (a) is `mintName` genuinely deterministic — does the same `used` set produce the same sequence, and does a *different* `used` set change earlier names? (b) does the 4096-attempt cap silently produce an `UNMINTABLE:` string that could reach a committed file? Where would that be caught? (c) is `gNames`' O(n^2) phoneme sweep affordable inside Gate 1's ~4 s budget at 336 bound records — measure it, do not reason about it. (d) do the `G-NAME-REGISTER` onset/rime tests actually reject a cross-register name, or does `startsWith` accept too much?

- [ ] **Step 10: Refactor on the findings, then re-verify**

Apply findings as a NEW commit. Re-run every command in Step 7. Expected: all PASS. End the phase report with `git branch --show-current` and `git log --oneline -1`.

---

### Task 4: The 41 pinned places and G-PIN-SAT

A pinned record is a **generator input**. The prose places have to be constraints the generator honours before it settles a coastline, because the alternative was tested and failed: bearings between slot-addressed places came out at a 17-27% modal direction against a 12.5% coin-toss baseline, and 0 of 40 test seeds produced the named continents the address space assumes.

**Files:**
- Create: `content/world/civil/pinned-roster.json`
- Create: `content/world/civil/pinned/*.json` (40 files)
- Create: `scripts/tests/fixtures/world/g-pin-sat-slope/**`, `.../g-pin-sat-moved/**`
- Modify: `scripts/lib/resolve.mjs` (append `gPinSat`, call from `checkWorldCivil`; created in Task 2)
- Modify: `scripts/tests/resolve.test.mjs` (append Step 1b's four premise/roster tests and the G-PIN-SAT block; created in Task 2)

**Interfaces:**
- Consumes (Plan C): `content/world/fabric/continent-NN.json` **`pinReceipts[]`** — `{ id, at: [x,y], cell: [i,j], continent, region, measured: { landform, waterKind, shelterFetchKm, depthM, slope, freshWaterWithinKm, biome, elevationM } }`. Plan D owns this field's shape; Task 10 wires the generator to emit it.
- **`measured.shelterFetchKm` — DECIDE THIS BEFORE WRITING `placePinned`.** Filed here by Plan C's
  seam-5 fix pass (2026-08-22) because it is a Plan-D decision and this is the block a Plan-D
  implementer reads. `grid.fetchKm` (written by `classifySea`) is **max over the two axes** — wave
  exposure. Spec §6.5's shelter test needs **min over the two axes** — enclosure. A pinned harbour
  declaring `water.shelterFetchKmMax: 15` measured against `grid.fetchKm` is **unsatisfiable at 332
  of the world's 520 port-eligible cells** and at all three generated capitals (their adjacent water
  reads 240.5 / 56.5 / 48.5 km). Either `measured.shelterFetchKm` reads `narrowWaterKm` — which
  `tools/mapforge/lib/passes/settlements.mjs` **exports for exactly this**, so it is one import and
  not a third definition of the quantity — or the pin's threshold is restated. Reading
  `narrowWaterKm` makes the receipt true by construction at every port-eligible cell, because
  `isPort` already requires `narrow[near] < 15`.
- **And `c04` Stonemoor has ZERO port-eligible cells**, so `c-town-netstead` cannot be a
  sheltered-port capital there whatever is decided above. Both facts are measured and pinned in
  `tools/mapforge/tests/settlements.test.mjs`'s real-world block.
- **`placePinned`'s result must carry `title`.** `placeSettlements` (Plan C) now THROWS on a pinned
  entry whose `title` is missing or blank, and on an `at`/`cell` that is not two finite numbers.
  A titleless pin used to mint `f-town-c-town-gildmark` — a legal id that passes every check in
  Plan C and reds `G-NET`/`G-CANON-LEG` at Plan E's redraw, where no fix is available. The declared
  shape is `{ id, title, at: [xKm, yKm], cell: [cx, cy], continent, region, rank }`; Plan C's Task-9a
  Interfaces block omits `title` and is wrong (STATE §5).
- Produces: `export function gPinSat({ world }): string[]`

**The pin translation rule.** The six canon towns and the twelve basin landmarks **that are children of `n-cluster1`** keep their committed geometry exactly, translated by one shared vector

```
PIN_OFFSET = c02.footprint.centreKm - n-cluster1.placement.anchor = [96, 148] - [15, 19] = [81, 129]
```

which puts the basin anchor on c02 Wealdmarch's centre `[96, 148]`. **`[96, 148]` is Plan C's committed premise value** (`content/world/premises/continent-02.json`, Task 3 Step 4) — it is read from the file, never retyped. A pure translation preserves every straight-line distance, so all seven `leg` edges keep today's residuals — `e-leg-millcross-gildmark` measures `sqrt(15^2 + 7.8^2) = 16.906 km` against its committed `straightKm: 17` before and after — and `G-CANON-LEG`'s +/-8% cannot break.

**Every `requires.landform` below is an id from `content/world/lexicon/landforms.json` (Plan B Task 1).** That is not a style note: `G-PIN-SAT` compares the record's declared landform against `grid.landform` under the seed point, and a value the lexicon does not contain can never be satisfied by any world. Step 1b's test asserts it for all 41 rows against the committed `landforms.json`. Where canon prose names a landform the lexicon has no row for, the row below names the lexicon's nearest real substrate and the `why` still quotes the prose — the prose is the constraint, the id is how the machine checks it. `requires.landform` is a **type id**, never a `terrainKind` (`karst-plateau`, `sand-sea`, `cloud-forest`, `fjordland` are terrain kinds and are not legal here) and never a `coastClass`.

- [ ] **Step 1: Print the twenty translated basin coordinates**

Run this and keep the output; the roster in Step 2 uses it verbatim:

```bash
node -e '
const fs = require("node:fs");
const PREM = JSON.parse(fs.readFileSync("content/world/premises/continent-02.json", "utf8"));
const BASIN = JSON.parse(fs.readFileSync("content/spine/nodes/n-cluster1.json", "utf8"));
// DERIVED, never retyped: a hand-typed offset is how forty pins end up 55 km
// off their continent with G-PIN-SAT red forty times and no obvious cause.
const OFF = [PREM.footprint.centreKm[0] - BASIN.placement.anchor[0],
             PREM.footprint.centreKm[1] - BASIN.placement.anchor[1]];
console.log("PIN_OFFSET", JSON.stringify(OFF));   // expect [81, 129]
const t = (p) => [Math.round((p[0] + OFF[0]) * 10) / 10, Math.round((p[1] + OFF[1]) * 10) / 10];
const towns = ["n-millcross","n-gildmark","n-rooktide","n-cindervast-town","n-embervale","n-norhollow"];
// EXACTLY the twelve region nodes whose parentId is n-cluster1. Two ids that
// look like they belong here do NOT: `n-peatrun-coast` is a child of
// n-coldreach and its anchor [202.4, 159.7] is an ABSOLUTE chart coordinate
// (A2-wider-world.md §2 puts the Peatrun on Coldreach, and A1 contains no peat
// at all), and `n-frontier-shelf` is a `playspace` under n-playroot whose
// anchor is the [500, 500] runtime sentinel. Translating either by PIN_OFFSET
// puts a pin outside c02 — [283.4, 288.7] and [581, 629] — which is exactly
// the class of error Step 1b exists to catch. Assert the parentage rather
// than trusting the list.
const marks = ["n-thornveil","n-northern-icefield","n-ashvale-front","n-emberdown","n-hollowmarch",
               "n-meltwash-terrace","n-millcross-ford","n-gildmark-head","n-rooktide-reach",
               "n-saltmire","n-eastern-hills","n-expedition-camp"];
for (const id of [...towns, ...marks]) {
  const d = JSON.parse(fs.readFileSync(`content/spine/nodes/${id}.json`, "utf8"));
  if (d.parentId !== "n-cluster1") { console.error(`${id} parent is ${d.parentId}, not n-cluster1 — its anchor is not basin-local, do NOT translate it`); process.exit(1); }
  const at = d.absoluteAnchor ?? d.lore?.labelAt ?? d.placement.anchor;
  console.log(id.padEnd(24), JSON.stringify(t(at)));
}'
```

Expected: `PIN_OFFSET [81, 129]`, then eighteen rows. The eight below are pinned here so a reviewer can check the arithmetic without running it — `n-millcross [98.2, 152.6]`, `n-gildmark [83.2, 160.4]`, `n-rooktide [98, 163.5]`, `n-cindervast-town [90.2, 131.4]`, `n-embervale [89.7, 147.9]`, `n-norhollow [96.8, 147.7]`, `n-thornveil [105.4, 155]`, `n-northern-icefield [103.4, 132.6]` — and the remaining **ten** print from their committed `lore.labelAt`: `n-ashvale-front [95, 136.2]`, `n-emberdown [88.2, 145.8]`, `n-hollowmarch [97, 145]`, `n-meltwash-terrace [101.8, 147]`, `n-millcross-ford [96.6, 155]`, `n-gildmark-head [85.4, 158.2]`, `n-rooktide-reach [95.8, 159.8]`, `n-saltmire [91, 164.6]`, `n-eastern-hills [107, 144.2]`, `n-expedition-camp [100.6, 149.4]`.

All eighteen sit inside c02's footprint ellipse (centre `[96, 148]`, radii `[58, 44]`) — the furthest is `n-saltmire` at `((91-96)/58)² + ((164.6-148)/44)² = 0.007 + 0.144 = 0.152`, well inside 1. Step 1b turns that into a test.

The roster's remaining two c02-and-elsewhere landmark rows have **no basin spine node to translate** and carry literal coordinates instead: `c-lm-the-meltwash-mouth` at `[88.5, 166]` (A1 §4 "The Meltwash from the ice to the mire" — the river's seaward end, 2.9 km from the translated Saltmire, `t = 0.184` inside c02) and `c-lm-peatrun-coast` at `[262, 150]` on **c03**, not c02 (`t = 0.840` inside Coldreach), because `n-peatrun-coast` is a Coldreach region and A2 §2 is its only source.

- [ ] **Step 1b: Write the failing test that stops the roster and the premises diverging**

Append to `scripts/tests/resolve.test.mjs` (Task 2 created it; `test`, `assert`, `join` and `ROOT` are already in scope there, and `ROOT` is the repo root, which is what these four assertions read). This is the test whose absence let a whole roster be authored against continent centres that were never in any premise file:

```js
// Task 2's import line becomes:
//   import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
// — `readdirSync` and `existsSync` are new here, `readFileSync`/`writeFileSync`
// are added by Task 4 Step 4 anyway.

const PREMISE_DIR = join(ROOT, "content/world/premises");
const ROSTER = join(ROOT, "content/world/civil/pinned-roster.json");

function premises() {
  return Object.fromEntries(readdirSync(PREMISE_DIR).filter((f) => f.endsWith(".json")).sort()
    .map((f) => { const d = JSON.parse(readFileSync(join(PREMISE_DIR, f), "utf8")); return [d.id, d]; }));
}

test("PIN_OFFSET is DERIVED from the committed premise, never retyped", () => {
  const c02 = premises().c02;
  const basin = JSON.parse(readFileSync(join(ROOT, "content/spine/nodes/n-cluster1.json"), "utf8"));
  const want = [c02.footprint.centreKm[0] - basin.placement.anchor[0],
                c02.footprint.centreKm[1] - basin.placement.anchor[1]];
  const roster = JSON.parse(readFileSync(ROSTER, "utf8"));
  assert.deepEqual(roster.pinOffset, want,
    `pinOffset ${JSON.stringify(roster.pinOffset)} does not equal c02.centreKm - n-cluster1.anchor ${JSON.stringify(want)}`);
});

test("every pinned row lands INSIDE its declared continent's footprint ellipse", () => {
  // The failure this catches, concretely: a roster authored against a centre
  // table that was never in any premise file puts Gildmark 55 km out to sea,
  // G-PIN-SAT goes red forty times at once, and the cause looks like a
  // generator bug rather than two documents disagreeing.
  const prem = premises();
  const roster = JSON.parse(readFileSync(ROSTER, "utf8"));
  const outside = [];
  for (const row of roster.rows) {
    if (!Array.isArray(row.at)) continue;                 // filled in Step 1
    const p = prem[row.continent];
    assert.ok(p, `${row.id} names continent ${row.continent}, which has no premise file`);
    const [cx, cy] = p.footprint.centreKm, [rx, ry] = p.footprint.radiiKm;
    const t = ((row.at[0] - cx) / rx) ** 2 + ((row.at[1] - cy) / ry) ** 2;
    if (t > 1) outside.push(`${row.id} at ${JSON.stringify(row.at)} is t=${t.toFixed(3)} outside ${row.continent} (${cx},${cy} r ${rx},${ry})`);
  }
  assert.deepEqual(outside, []);
});

test("every re-fitted basin row IS its spine node's anchor plus pinOffset", () => {
  // The other half of the divergence guard. The ellipse test above catches a
  // pin that left its continent; this one catches a pin that was hand-typed
  // instead of translated, and it catches the sharper error Step 1 warns about
  // — translating a node whose anchor is not basin-local. Both `at` values
  // below MUST come from a node whose parentId is n-cluster1.
  const BASIN = {
    "c-town-millcross": "n-millcross", "c-town-gildmark": "n-gildmark",
    "c-town-rooktide": "n-rooktide", "c-town-cindervast": "n-cindervast-town",
    "c-town-embervale": "n-embervale", "c-town-norhollow": "n-norhollow",
    "c-lm-thornveil": "n-thornveil", "c-lm-northern-icefield": "n-northern-icefield",
    "c-lm-ashvale-front": "n-ashvale-front", "c-lm-emberdown": "n-emberdown",
    "c-lm-hollowmarch": "n-hollowmarch", "c-lm-meltwash-terrace": "n-meltwash-terrace",
    "c-lm-millcross-ford": "n-millcross-ford", "c-lm-gildmark-head": "n-gildmark-head",
    "c-lm-rooktide-reach": "n-rooktide-reach", "c-lm-the-saltmire": "n-saltmire",
    "c-lm-eastern-hills": "n-eastern-hills", "c-lm-expedition-camp": "n-expedition-camp",
  };
  const roster = JSON.parse(readFileSync(ROSTER, "utf8"));
  const rows = new Map(roster.rows.map((r) => [r.id, r]));
  const [ox, oy] = roster.pinOffset;
  const wrong = [];
  for (const [rowId, nodeId] of Object.entries(BASIN)) {
    const node = JSON.parse(readFileSync(join(ROOT, `content/spine/nodes/${nodeId}.json`), "utf8"));
    assert.equal(node.parentId, "n-cluster1",
      `${nodeId} is a child of ${node.parentId}; its anchor is not basin-local and must not be translated`);
    const a = node.absoluteAnchor ?? node.lore?.labelAt ?? node.placement.anchor;
    const want = [Math.round((a[0] + ox) * 10) / 10, Math.round((a[1] + oy) * 10) / 10];
    const got = rows.get(rowId)?.at;
    if (JSON.stringify(got) !== JSON.stringify(want))
      wrong.push(`${rowId}: roster ${JSON.stringify(got)} != ${nodeId} + pinOffset ${JSON.stringify(want)}`);
  }
  assert.deepEqual(wrong, []);
});

test("the roster is 41 rows and expands to 41 records", () => {
  // The spec says "~40". 41 is that made exact, and it is asserted so the
  // count cannot drift silently under a later edit: 8 towns + 13 c02
  // landmarks + 20 landmarks on the other twelve landmasses.
  const roster = JSON.parse(readFileSync(ROSTER, "utf8"));
  assert.equal(roster.rows.length, 41);
  assert.equal(new Set(roster.rows.map((r) => r.id)).size, 41, "ids are unique");
  assert.equal(roster.rows.filter((r) => r.kind === "town").length, 8);
  assert.equal(roster.rows.filter((r) => r.continent === "c02").length, 19);
  assert.equal(roster.rows.filter((r) => r.continent === "c03").length, 4);
});

test("every requires.landform is an id in the committed lexicon", () => {
  // `requires.landform` is a TYPE ID. terrainKinds (karst-plateau, sand-sea,
  // cloud-forest, fjordland) and coastClasses are NOT legal here: G-PIN-SAT
  // compares against grid.landform, so a value the lexicon has no row for can
  // never be satisfied by any world, on any seed.
  const lexPath = join(ROOT, "content/world/lexicon/landforms.json");
  if (!existsSync(lexPath)) return;                       // Plan B not merged: skip
  const ids = new Set(JSON.parse(readFileSync(lexPath, "utf8")).map((r) => r.id));
  const roster = JSON.parse(readFileSync(ROSTER, "utf8"));
  const bad = roster.rows
    .map((r) => r.requires?.landform)
    .filter((t) => t && !ids.has(t));
  assert.deepEqual([...new Set(bad)].sort(), []);
});

test("a `plan` path, when present, names a file that will exist", () => {
  // EXACTLY ONE row may carry a `plan`, and it is Millcross — the only town
  // plan committed today. A `plan` pointing at a file nobody writes is worse
  // than an honest null: check_content.mjs:1192 (T1) joins on it.
  //
  // E-C9 is why the three capitals carry null. A town plan joins the world by
  // `spineId`, so each plan needs a tier:"town" spine node — and the trunk
  // census Plan C owns budgets exactly ONE (n-millcross, the alias of the one
  // committed plan). Authoring town-gildmark.json, town-tallowquay.json and
  // town-netstead.json would force three more town nodes into the trunk,
  // making the census 39 and reddening Plan C Task 10's
  // `readdirSync(draftNodes).length === 36` assertion on a plan-authoring
  // commit. No plan in this programme authors a file under content/towns/;
  // the quota stays 8 as a target and G-WORLD-BUDGET prints
  // `world-budget: town-plans 1 authored / 8 quota` so the debt is visible.
  const roster = JSON.parse(readFileSync(ROSTER, "utf8"));
  const withPlan = roster.rows.filter((r) => r.plan).map((r) => r.id).sort();
  assert.deepEqual(withPlan, ["c-town-millcross"]);
  // And the one path that IS declared must be the file that exists today.
  assert.equal(roster.rows.find((r) => r.id === "c-town-millcross").plan,
    "content/towns/town-millcross.json");
  assert.ok(existsSync(join(ROOT, "content/towns/town-millcross.json")),
    "the only declared plan path must name a committed file");
});
```

Run: `node --test --test-name-pattern "PIN_OFFSET|footprint ellipse|pinOffset|41 rows|committed lexicon|plan\` path" 'scripts/tests/*.test.mjs'`
Expected: FAIL — `ENOENT ... content/world/civil/pinned-roster.json`. Step 2 writes it.

- [ ] **Step 2: Write the roster**

Create `content/world/civil/pinned-roster.json`. It is the authoring table — **41 rows**, one per pinned record: 8 towns, 13 Wealdmarch landmarks, 20 landmarks on the other twelve landmasses. The spec's figure is "~40"; 41 is that made exact, and Step 1b asserts it so the count cannot drift under a later edit. Eighteen `at` values are Step 1's printed output; the other twenty-three are literals placed inside their premise footprint (Domain primer's centre table).

```jsonc
{
  "version": 1,
  "note": "The authoring table for content/world/civil/pinned/*.json. The eighteen re-fitted basin rows are their committed n-cluster1-child anchor + PIN_OFFSET [81, 129], a pure translation that preserves every canon leg distance exactly; Step 1b re-derives each one from its spine node and fails on a hand-typed drift. PIN_OFFSET is DERIVED from content/world/premises/continent-02.json's footprint.centreKm minus n-cluster1's anchor, never retyped. Every other row is a literal placed inside its premise footprint, and every `at` here is checked against the committed premise ellipse by Step 1b. Every requires.landform is an id from content/world/lexicon/landforms.json (170 rows after Plan B Task 1) — never a terrainKind, never a coastClass. If Plan C's packing moves a continent centre, re-run Step 1 and Step 1b rather than editing coordinates by hand.",
  "pinOffset": [81, 129],
  "rows": [
    { "id": "c-town-millcross",   "kind": "town", "continent": "c02", "at": [98.2, 152.6], "rank": "hub",     "requires": { "landform": "river-terrace", "water": { "kind": "river" }, "slopeMax": 0.05, "freshWaterWithinKm": 0.5 }, "plan": "content/towns/town-millcross.json", "why": "canon §4: the literal hub — every road elsewhere passes through or near it; the mill, race and ford are all river facts" },
    { "id": "c-town-gildmark",    "kind": "town", "continent": "c02", "at": [83.2, 160.4], "rank": "capital", "requires": { "landform": "coastal-drowned-valley", "water": { "kind": "sea", "shelterFetchKmMax": 15, "minDepthM": 12 }, "slopeMax": 0.06, "freshWaterWithinKm": 4 }, "plan": null, "why": "canon §4: the only deepwater port on this coast and the land's only door to the sea. plan: null per E-C9 — a town plan joins by spineId, so authoring town-gildmark.json would force a tier:\"town\" node into the trunk and red Plan C Task 10's 36-file census" },
    { "id": "c-town-rooktide",    "kind": "town", "continent": "c02", "at": [98.0, 163.5], "rank": "hub",     "requires": { "landform": "lake-terrace", "water": { "kind": "lake" }, "slopeMax": 0.06, "freshWaterWithinKm": 3 }, "plan": null, "why": "canon §4: sits inland, south of Millcross, off the direct war road entirely — a terrace above the inland sea, which is why it has fresh water and no harbour" },
    { "id": "c-town-cindervast",  "kind": "town", "continent": "c02", "at": [90.2, 131.4], "rank": "hub",     "requires": { "landform": "alluvial-fan", "water": { "kind": "none" }, "slopeMax": 0.07, "freshWaterWithinKm": 5 }, "plan": null, "why": "canon §4: the fallen city beyond Ashvale Front to the north-west, on the stony fan both war towns avoid" },
    { "id": "c-town-embervale",   "kind": "town", "continent": "c02", "at": [89.7, 147.9], "rank": "hub",     "requires": { "landform": "river-terrace", "water": { "kind": "river" }, "slopeMax": 0.05, "freshWaterWithinKm": 1 }, "plan": null, "why": "canon §4: sister town on one side of the river, paired with Norhollow" },
    { "id": "c-town-norhollow",   "kind": "town", "continent": "c02", "at": [96.8, 147.7], "rank": "hub",     "requires": { "landform": "river-terrace", "water": { "kind": "river" }, "slopeMax": 0.05, "freshWaterWithinKm": 1 }, "plan": null, "why": "canon §4: the other sister town; its outer farms border Cindervast's ruin districts" },
    { "id": "c-town-tallowquay",  "kind": "town", "continent": "c03", "at": [252, 128],    "rank": "capital", "requires": { "landform": "coastal-drowned-valley", "water": { "kind": "sea", "shelterFetchKmMax": 15, "minDepthM": 12 }, "slopeMax": 0.06, "freshWaterWithinKm": 4 }, "plan": null, "why": "A2 §2: one of the two charted foreign lane termini — capital tier costs zero new canon. plan: null per E-C9, same census argument as Gildmark" },
    { "id": "c-town-netstead",    "kind": "town", "continent": "c04", "at": [274, 262],    "rank": "capital", "requires": { "landform": "coastal-drowned-valley", "water": { "kind": "sea", "shelterFetchKmMax": 15, "minDepthM": 12 }, "slopeMax": 0.06, "freshWaterWithinKm": 4 }, "plan": null, "why": "A2 §2: the other charted lane terminus, on the drowned karst coast. plan: null per E-C9, same census argument as Gildmark" },

    { "id": "c-lm-thornveil",            "kind": "landmark", "continent": "c02", "at": [105.4, 155.0], "requires": { "landform": "carr-thicket" },      "why": "canon §4: Thornveil's bramble forest lies east of Millcross — carr is exactly wet bramble thicket" },
    { "id": "c-lm-northern-icefield",    "kind": "landmark", "continent": "c02", "at": [103.4, 132.6], "requires": { "landform": "outlet-glacier" },   "why": "canon §4: the Stoneguard's detached watch keeps the old trade road here" },
    { "id": "c-lm-ashvale-front",        "kind": "landmark", "continent": "c02", "at": null,           "requires": { "landform": "badland-gully" },    "why": "canon §4: the ground both war towns avoid, between the basin and Cindervast" },
    { "id": "c-lm-emberdown",            "kind": "landmark", "continent": "c02", "at": null,           "requires": { "landform": "river-terrace" },    "why": "A1 §4: Embervale's downland, the dry bench above the river" },
    { "id": "c-lm-hollowmarch",          "kind": "landmark", "continent": "c02", "at": null,           "requires": { "landform": "peat-hag" },         "why": "A1 §4: the smallest surveyed ground in the basin — a peat hollow" },
    { "id": "c-lm-meltwash-terrace",     "kind": "landmark", "continent": "c02", "at": null,           "requires": { "landform": "river-terrace", "water": { "kind": "river" } }, "why": "A1 §4.2: the last drained ground before the crossing" },
    { "id": "c-lm-millcross-ford",       "kind": "landmark", "continent": "c02", "at": null,           "requires": { "landform": "ford", "water": { "kind": "river" } }, "why": "canon §4: the only cart-crossing of the river that splits the land. `ford` (D-B4), not `braided-channel`: the braided reach is a LINE of river,scree bars, and what canon names is the crossing POINT on it — `confluence-bench` is a bank, not a crossing, which is why no 164-row id fit" },
    { "id": "c-lm-gildmark-head",        "kind": "landmark", "continent": "c02", "at": null,           "requires": { "landform": "headland", "water": { "kind": "sea" } }, "why": "A1 §4: the head above Gildmark's roads. `headland` (D-B4), not `marine-terrace`: both are coastal rock,meadow areas, but a terrace is a flat bench and this is the cliffed promontory the coast road goes over — `headland`'s slopeMin 0.04 is the difference" },
    { "id": "c-lm-rooktide-reach",       "kind": "landmark", "continent": "c02", "at": null,           "requires": { "landform": "endorheic-lake" },   "why": "A1 §4: Rooktide's reach — an inland basin with no outlet, which is what an inland sea's arm is" },
    { "id": "c-lm-the-saltmire",         "kind": "landmark", "continent": "c02", "at": null,           "requires": { "landform": "tidal-mire" },       "why": "A1 §4: the mire the trade road bends around" },
    { "id": "c-lm-eastern-hills",        "kind": "landmark", "continent": "c02", "at": null,           "requires": { "landform": "spur-ridge" },       "why": "A1 §4: the eastern rise behind Thornveil" },
    { "id": "c-lm-expedition-camp",      "kind": "landmark", "continent": "c02", "at": null,           "requires": { "landform": "confluence-bench" }, "why": "canon §4: Millcross's expedition camp, on the road north to the icefield" },
    { "id": "c-lm-the-meltwash-mouth",   "kind": "landmark", "continent": "c02", "at": [88.5, 166.0],  "requires": { "landform": "estuary", "water": { "kind": "sea" } }, "why": "A1 §4: \"the Meltwash from the ice to the mire\" — the river's seaward end. NO spine node exists for it, so this `at` is a literal, 2.9 km from the translated Saltmire and t=0.184 inside c02's ellipse; it is not derived from Step 1 and must not be" },

    { "id": "c-lm-the-ice-divide",        "kind": "landmark", "continent": "c01", "at": [200, 34],  "requires": { "landform": "ice-divide" },        "why": "A2 §1: one ice divide shedding outlet glaciers to every quarter; no rivers" },
    { "id": "c-lm-rimewall-margin",       "kind": "landmark", "continent": "c01", "at": [200, 56],  "requires": { "landform": "moraine-terminal" },  "why": "A2 §1: the margin the Tarnmark charts stop at" },
    { "id": "c-lm-coldreach-shore",       "kind": "landmark", "continent": "c03", "at": [250, 120], "requires": { "landform": "wave-cut-platform", "water": { "kind": "sea" } }, "why": "canon §4: Coldreach is the far end of the trade wind; the shore is what masters log" },
    { "id": "c-lm-the-trade-wind-landfall","kind": "landmark","continent": "c03", "at": [246, 100], "requires": { "landform": "marine-terrace", "water": { "kind": "sea" } }, "why": "canon §4: six days out, the first land a master sights" },
    { "id": "c-lm-peatrun-coast",         "kind": "landmark", "continent": "c03", "at": [262, 150], "requires": { "landform": "blanket-mire", "water": { "kind": "sea" } }, "why": "A2 §2: \"The far run of coast where the Peatrun stains the sea brown a mile out, or so the wreck-reports swear.\" The committed spine node n-peatrun-coast is a child of n-coldreach, NOT of n-cluster1 — A1 (the basin) contains no peat at all — so this row is c03 with a literal `at` (t=0.840 inside Coldreach) and is never translated by PIN_OFFSET" },
    { "id": "c-lm-stonemoor-shore",       "kind": "landmark", "continent": "c04", "at": [272, 250], "requires": { "landform": "limestone-pavement", "water": { "kind": "sea" } }, "why": "A2 §3: sea level cuts through a limestone pavement" },
    { "id": "c-lm-slateflow-sink",        "kind": "landmark", "continent": "c04", "at": [306, 246], "requires": { "landform": "sinking-river" },     "why": "A2 §3: the Slateflow is a sinking river on a drowned plateau" },
    { "id": "c-lm-the-drowned-pavement",  "kind": "landmark", "continent": "c04", "at": [296, 282], "requires": { "landform": "limestone-pavement", "water": { "kind": "sea" } }, "why": "A2 §3: nothing sworn beyond the shore" },
    { "id": "c-lm-the-one-wet-strip",     "kind": "landmark", "continent": "c05", "at": [134, 292], "requires": { "landform": "cuesta" },            "why": "A2 §4: one wet strip, then 9,000 km2 of reported sand — the scarp IS the rain shadow's edge" },
    { "id": "c-lm-thirstwold-erg",        "kind": "landmark", "continent": "c05", "at": [192, 306], "requires": { "landform": "erg-dune-sea" },      "why": "A2 §4: the rain-shadow erg behind the coastal range" },
    { "id": "c-lm-reedstrand-lobes",      "kind": "landmark", "continent": "c06", "at": [70, 268],  "requires": { "landform": "delta-lobe-marsh" },  "why": "A2 §5: a bird's-foot delta with no bedrock — every region is a lobe" },
    { "id": "c-lm-reed-shallows",         "kind": "landmark", "continent": "c06", "at": [56, 258],  "requires": { "landform": "coastal-lagoon", "water": { "kind": "sea" } }, "why": "A2 §5: the shallows the Tarnmark charts name" },
    { "id": "c-lm-driftholt-fog-forest",  "kind": "landmark", "continent": "c07", "at": [46, 92],   "requires": { "landform": "swamp-forest" },      "why": "A2 §6: fog forest on a windward slope — the wettest ground in the world" },
    { "id": "c-lm-wracklow-stacks",       "kind": "landmark", "continent": "c08", "at": [236, 344], "requires": { "landform": "sea-stack", "water": { "kind": "sea" } }, "why": "A2 §7: an entirely erosional coast — stacks, arches, geos, blowholes" },
    { "id": "c-lm-the-blowhole-coast",    "kind": "landmark", "continent": "c08", "at": [262, 352], "requires": { "landform": "blowhole", "water": { "kind": "sea" } }, "why": "A2 §7: no river reaches the sea intact" },
    { "id": "c-lm-brightfall-leap",       "kind": "landmark", "continent": "c09", "at": [352, 196], "requires": { "landform": "sea-waterfall", "water": { "kind": "sea" } }, "why": "A2 §8: cliff-hung waterfalls straight into the sea. `sea-waterfall` (D-B4), not `knickpoint-gorge`: the gorge's biomes are river,rock and its requires block is nearFlag RIVER, so it can never be satisfied at a cell that also satisfies water.kind sea — a G-PIN-SAT failure by construction. This is the exact unsatisfiable-coastal-pin the addition exists to prevent" },
    { "id": "c-lm-fumewater-cone",        "kind": "landmark", "continent": "c10", "at": [122, 356], "requires": { "landform": "stratocone" },        "why": "A2 §9: the volcanic arc — a strung line of cones, calderas, lava tubes" },
    { "id": "c-lm-quillreef-ring",        "kind": "landmark", "continent": "c11", "at": [338, 66],  "requires": { "landform": "atoll", "water": { "kind": "sea" } }, "why": "A2 §10: an atoll ring — every settlement a port, no interior" },
    { "id": "c-lm-skerryfast-fjord",      "kind": "landmark", "continent": "c12", "at": [254, 44],  "requires": { "landform": "fjord", "water": { "kind": "sea" } }, "why": "A2 §11: drowned glacial valleys — fjord, skerry, roche moutonnee" },
    { "id": "c-lm-loamspit-bars",         "kind": "landmark", "continent": "c13", "at": [40, 344],  "requires": { "landform": "spit" },              "why": "A2 §12: migrating sandbars and mangrove — the chart is redrawn every decade" }
  ]
}
```

**Exactly ONE row carries a non-null `plan`** — Millcross, the only town plan committed today. The other seven town rows carry `"plan": null`, because a `plan` pointing at a file nobody writes is worse than an honest null: `check_content.mjs:1192`'s T1 join reads it.

That is **E-C9**, and it overrides D2's taken default of *"3 capitals' plans now, 5 deferred"*. The argument is a census one, not an appetite one. A town plan joins the world by `spineId`, so each plan needs a `tier: "town"` spine node — and the trunk census Plan C owns budgets exactly **one** (`n-millcross`, the host of the one committed plan). Authoring `town-gildmark.json`, `town-tallowquay.json` and `town-netstead.json` would force `n-gildmark`, `n-tallowquay` and `n-netstead` into the trunk, making the census **39** and reddening Plan C Task 10's `readdirSync(draftNodes).length === 36` assertion on the plan-authoring commit. **No plan in this programme authors a file under `content/towns/`** — Plan E's Task 8 builds the 13 continent sheets, not town plans.

Plan C's manifest keeps `quotas.townPlans: 8` as the **target**, and `G-WORLD-BUDGET` prints `world-budget: town-plans 1 authored / 8 quota` every run so the shortfall stays a visible number rather than a silently-closed claim. Raising it is a future release: one plan, one node, one census line, one reviewed commit — the mechanism is written into `content/spine/trunk-census.json`'s `why.town`.

The ten `"at": null` rows are filled from Step 1's printed output before the file is committed — they are the committed `lore.labelAt` of the corresponding **`n-cluster1`-child** spine node plus `PIN_OFFSET`, and Step 3's expansion refuses to run while any `at` is null. The two rows that have no `n-cluster1`-child node to translate already carry literals above, for the reasons written into their `why`: `c-lm-the-meltwash-mouth` (c02, no spine node exists) and `c-lm-peatrun-coast` (c03 — its spine node is a child of `n-coldreach`).

- [ ] **Step 3: Expand the roster into 41 records**

Run:

```bash
node -e '
const fs = require("node:fs"), path = require("node:path");
const roster = JSON.parse(fs.readFileSync("content/world/civil/pinned-roster.json", "utf8"));
const missing = roster.rows.filter((r) => !Array.isArray(r.at));
if (missing.length) { console.error("roster has unresolved at: " + missing.map((r) => r.id).join(", ")); process.exit(1); }
fs.mkdirSync("content/world/civil/pinned", { recursive: true });
for (const r of roster.rows) {
  const doc = {
    id: r.id, kind: r.kind, tier: "pinned", title: null,
    ...(r.rank ? { settlementRank: r.rank } : {}),
    pin: { at: r.at, toleranceKm: 1.5, why: r.why },
    requires: { continent: r.continent, ...r.requires },
    properties: [], coasts: [],
    ...(r.plan ? { plan: r.plan } : {}),
    prose: "authored",
    provenance: { authored: "hand", generator: null },
    resolution: null,
  };
  const title = r.id.replace(/^c-(town|lm)-/, "").split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")
    .replace(/^The /, "The ");
  doc.title = title;
  fs.writeFileSync(path.join("content/world/civil/pinned", r.id + ".json"), JSON.stringify(doc, null, 2) + "\n");
}
console.log("wrote", roster.rows.length, "pinned records");
'
```
Expected: `wrote 41 pinned records`.

Then hand-correct the eight town titles and the canon landmark titles to their canon spelling (`Millcross`, `Gildmark`, `Rooktide`, `Cindervast`, `Embervale`, `Norhollow`, `Tallowquay`, `Netstead`, `Thornveil`, `Northern Icefield`, `Ashvale Front`, `Emberdown`, `Hollowmarch`, `Meltwash Terrace`, `Millcross Ford`, `Gildmark Head`, `Rooktide Reach`, `Peatrun Coast`, `The Saltmire`, `Eastern Hills`, `Expedition Camp`, `The Meltwash`) and add `"properties": ["deepwater-port"]` + `"coasts": ["wealdmarch-west"]` to Gildmark, `"coasts": ["coldreach-north"]` to Tallowquay, `"coasts": ["stonemoor-north"]` to Netstead. Every one of those titles is already in `reserved.json`.

- [ ] **Step 4: Write the failing test**

Append to `scripts/tests/resolve.test.mjs`:

```js
import { gPinSat } from "../lib/resolve.mjs";

test("G-PIN-SAT is silent when the fabric receipt satisfies every requirement", () => {
  assert.deepEqual(gPinSat({ world: loadCivil({ contentRoot: worldFixture() }) }), []);
});

test("G-PIN-SAT red: a numeric requirement the ground does not meet", () => {
  const p = gPinSat({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-pin-sat-slope" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-PIN-SAT: c-town-gildmark at \[137\.2, 182\.4\]: requires\.slopeMax = 0\.06 but fabric has 0\.19$/);
});

test("G-PIN-SAT red: the generator moved the place beyond its tolerance", () => {
  const p = gPinSat({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-pin-sat-moved" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-PIN-SAT: c-town-gildmark at \[137\.2, 182\.4\]: requires\.pin = within 1\.5 km but fabric has 5 km away$/);
});

test("G-PIN-SAT red: a pinned record with no receipt at all", () => {
  const dir = worldFixture();
  const p = join(dir, "world/fabric/continent-02.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc.pinReceipts = doc.pinReceipts.filter((r) => r.id !== "c-town-gildmark");
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const problems = gPinSat({ world: loadCivil({ contentRoot: dir }) });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /requires\.receipt = present but fabric has none/);
});
```

Add `readFileSync, writeFileSync` to the `node:fs` import at the top of the file.

Create the two overlays. `scripts/tests/fixtures/world/g-pin-sat-slope/world/fabric/continent-02.json` is a copy of the base fabric with the Gildmark receipt's `measured.slope` changed to `0.19`. `scripts/tests/fixtures/world/g-pin-sat-moved/world/fabric/continent-02.json` is a copy with the Gildmark receipt's `at` changed to `[142.2, 182.4]` (5 km east of the pin).

- [ ] **Step 5: Run test to verify it fails**

Run: `node --test --test-name-pattern "G-PIN-SAT" 'scripts/tests/*.test.mjs'`
Expected: FAIL with `The requested module '../lib/resolve.mjs' does not provide an export named 'gPinSat'`.

- [ ] **Step 6: Write G-PIN-SAT**

Append to `scripts/lib/resolve.mjs` and call it from `checkWorldCivil` after `gBind`:

```js
// G-PIN-SAT — every pinned record's `requires` block is satisfied by the
// fabric AT ITS SEED POINT. The comparison is against a committed
// `pinReceipts[]` entry rather than a 640,000-cell re-run: the generator
// measured the ground when it placed the record, and the receipt is what
// makes this a gate over committed bytes at 0.05 s instead of a re-generation.
export function gPinSat({ world }) {
  if (!world.present) return [];
  const problems = [];
  const receipts = new Map();
  for (const f of Object.values(world.fabric))
    for (const r of f.pinReceipts ?? []) receipts.set(r.id, r);

  const say = (doc, key, want, got) =>
    problems.push(`G-PIN-SAT: ${doc.id} at [${doc.pin.at[0]}, ${doc.pin.at[1]}]: requires.${key} = ${want} but fabric has ${got}`);

  for (const { doc } of world.pinned) {
    const rec = receipts.get(doc.id);
    if (!rec) { say(doc, "receipt", "present", "none"); continue; }

    const dx = rec.at[0] - doc.pin.at[0], dy = rec.at[1] - doc.pin.at[1];
    const moved = Math.round(Math.sqrt(dx * dx + dy * dy) * 100) / 100;
    if (moved > doc.pin.toleranceKm)
      say(doc, "pin", `within ${doc.pin.toleranceKm} km`, `${moved} km away`);

    const req = doc.requires ?? {}, m = rec.measured ?? {};
    if (req.continent && rec.continent !== req.continent) say(doc, "continent", req.continent, rec.continent);
    if (req.landform && m.landform !== req.landform) say(doc, "landform", req.landform, m.landform ?? "none");
    if (req.slopeMax !== undefined && !(m.slope <= req.slopeMax)) say(doc, "slopeMax", req.slopeMax, m.slope);
    if (req.freshWaterWithinKm !== undefined && !(m.freshWaterWithinKm <= req.freshWaterWithinKm))
      say(doc, "freshWaterWithinKm", req.freshWaterWithinKm, m.freshWaterWithinKm);
    if (req.elevationMaxM !== undefined && !(m.elevationM <= req.elevationMaxM))
      say(doc, "elevationMaxM", req.elevationMaxM, m.elevationM);
    if (Array.isArray(req.biomeNot) && req.biomeNot.includes(m.biome))
      say(doc, "biomeNot", req.biomeNot.join("/"), m.biome);
    if (req.water) {
      if (req.water.kind && m.waterKind !== req.water.kind) say(doc, "water.kind", req.water.kind, m.waterKind ?? "none");
      if (req.water.shelterFetchKmMax !== undefined && !(m.shelterFetchKm <= req.water.shelterFetchKmMax))
        say(doc, "water.shelterFetchKmMax", req.water.shelterFetchKmMax, m.shelterFetchKm);
      if (req.water.minDepthM !== undefined && !(m.depthM >= req.water.minDepthM))
        say(doc, "water.minDepthM", req.water.minDepthM, m.depthM);
    }
  }
  return problems;
}
```

and in `checkWorldCivil`: `for (const p of gPinSat({ world })) fail(p);`

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test --test-name-pattern "G-PIN-SAT" 'scripts/tests/*.test.mjs'`
Expected: PASS — 4 tests.

- [ ] **Step 8: Validate the 41 committed records against the schema**

Run:
```bash
node -e '
const Ajv = require("./scripts/node_modules/ajv");
const fs = require("node:fs");
const v = new Ajv({ allErrors: true, strict: false }).compile(require("./content/schemas/civil-record.schema.json"));
let bad = 0, n = 0;
for (const f of fs.readdirSync("content/world/civil/pinned")) {
  const doc = JSON.parse(fs.readFileSync("content/world/civil/pinned/" + f, "utf8"));
  n++;
  if (!v(doc)) { bad++; console.log(f, JSON.stringify(v.errors)); }
}
console.log(`${n} pinned records, ${bad} schema-invalid`);
'
node scripts/check_content.mjs --only=spine
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: `41 pinned records, 0 schema-invalid`. `check_content.mjs --only=spine` will now print `world-civil: 41 pinned, 0 bound, 0 relations, 0 handles` and **fail** with 41 `G-PIN-SAT: ... requires.receipt = present but fabric has none` lines — that is correct and expected until Task 10 wires the generator. Record the exact count in the phase report.

- [ ] **Step 9: Commit**

```bash
git add content/world/civil scripts/lib/resolve.mjs scripts/tests
git commit -m "feat: 41 pinned places and G-PIN-SAT"
git branch --show-current && git log --oneline -1
```

- [ ] **Step 10: Independent adversarial review of this task's diff**

Reviewer brief:

> Review `git diff HEAD~1` against spec §5.2, §7.3 P11 and §9.4. Attack: (a) verify the translation rule arithmetically — compute `sqrt((152.2-137.2)^2 + (174.6-182.4)^2)` and compare against `e-leg-millcross-gildmark`'s committed `straightKm: 17` and `G-CANON-LEG`'s +/-8%; do the same for `e-leg-cindervast-rooktide` (34 km). (b) Do all 41 `pin.at` values lie inside the frame `[0,400]^2` and inside their declared premise footprint per the Domain primer's centre + radius table? Independently: does any row translate a spine node whose `parentId` is not `n-cluster1`? (c) Does `gPinSat` compare `undefined <= 0.06` anywhere — a missing measurement must be a failure, not a silent pass. (d) Is the failure message identical in shape to the spec's representative message?

- [ ] **Step 11: Refactor on the findings, then re-verify**

Apply findings as a NEW commit. Re-run Step 7's and Step 8's commands. End with `git branch --show-current && git log --oneline -1`.

---

### Task 5: The 336 bound records and G-HANDLE-BAND

Ordinal role ranks are what the design cut: "the largest karst group" resolves cleanly while the resolved feature swings **17.5x in size across 20 seeds**. A handle plus a declared size band is what catches that.

**Files:**
- Create: `tools/mapforge/scaffold-civil.mjs`
- Create: `content/world/civil/bound/*.json` (336 files)
- Create: `scripts/tests/fixtures/world/g-handle-band-oversize/**`
- Modify: `scripts/lib/resolve.mjs` (append `gHandleBand`, call from `checkWorldCivil`; created in Task 2)
- Modify: `scripts/tests/resolve.test.mjs` (append, created in Task 2)
- Test: `tools/mapforge/tests/scaffold-civil.test.mjs`

**Interfaces:**
- Consumes (Plan C): the handle ledgers; (Plan B): the lexicon; (Task 3): `mintName`, `REGISTERS`.
- Produces:
  - `export function scaffoldBound({ repoRoot, dryRun }): { written: string[], deleted: string[], kept: string[], problems: string[] }`
  - `export function gHandleBand({ world }): string[]` (in `scripts/lib/resolve.mjs`)

- [ ] **Step 1: Write the failing test for the scaffolder**

Create `tools/mapforge/tests/scaffold-civil.test.mjs`:

```js
// Plan D — the bound-record scaffolder.
//
// 336 records cannot be hand-typed, and they must not be hand-typed: a bound
// record's handle, type and size band are FACTS ABOUT THE LEDGER, and a typo
// in any of them is a silent rebinding. The scaffolder mints them by set
// reconciliation, and refuses to touch the lore of a record whose prose is
// "authored" — that half IS hand-written and the scaffolder must never
// overwrite a human sentence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scaffoldBound } from "../scaffold-civil.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function repoFixture() {
  const dir = mkdtempSync(join(tmpdir(), "scaffold-"));
  cpSync(join(ROOT, "scripts/tests/fixtures/world/base"), join(dir, "content"), { recursive: true });
  cpSync(join(ROOT, "content/world/names"), join(dir, "content/world/names"), { recursive: true });
  return dir;
}

test("scaffoldBound mints one record per NAMED handle and none per unnamed", () => {
  const dir = repoFixture();
  const r = scaffoldBound({ repoRoot: dir, dryRun: false });
  assert.deepEqual(r.problems, []);
  // 3 named instances across the two fixture continents; h-77aa is named:false.
  assert.equal(r.written.length, 3);
  const files = readdirSync(join(dir, "content/world/civil/bound")).sort();
  assert.equal(files.length, 3);
});

test("every minted record validates and carries no coordinate key", () => {
  const dir = repoFixture();
  scaffoldBound({ repoRoot: dir, dryRun: false });
  for (const f of readdirSync(join(dir, "content/world/civil/bound"))) {
    const doc = JSON.parse(readFileSync(join(dir, "content/world/civil/bound", f), "utf8"));
    assert.equal(doc.tier, "bound");
    // THE handle grammar, and it is one string in three schemas: this one,
    // handle-ledger.schema.json and landform-instance.schema.json. 4-6 hex.
    assert.match(doc.bind.handle, /^c[0-9]{2}\/[a-z-]+\/h-[0-9a-f]{4,6}$/);
    assert.equal(doc.bind.expect.sizeKm.length, 2);
    assert.ok(doc.bind.expect.sizeKm[0] < doc.bind.expect.sizeKm[1]);
    assert.equal(JSON.stringify(doc).includes('"at"'), false);
  }
});

test("running it twice is a no-op (set reconciliation, not append)", () => {
  const dir = repoFixture();
  scaffoldBound({ repoRoot: dir, dryRun: false });
  const before = readdirSync(join(dir, "content/world/civil/bound")).sort()
    .map((f) => readFileSync(join(dir, "content/world/civil/bound", f), "utf8")).join("");
  const second = scaffoldBound({ repoRoot: dir, dryRun: false });
  const after = readdirSync(join(dir, "content/world/civil/bound")).sort()
    .map((f) => readFileSync(join(dir, "content/world/civil/bound", f), "utf8")).join("");
  assert.equal(after, before);
  assert.equal(second.written.length, 0);
  assert.equal(second.kept.length, 3);
});

test("a handle that leaves the ledger takes its record with it", () => {
  const dir = repoFixture();
  scaffoldBound({ repoRoot: dir, dryRun: false });
  const p = join(dir, "content/world/handles/continent-10.json");
  const ledger = JSON.parse(readFileSync(p, "utf8"));
  ledger.handles = [];
  writeFileSync(p, JSON.stringify(ledger, null, 2) + "\n");
  const r = scaffoldBound({ repoRoot: dir, dryRun: false });
  assert.equal(r.deleted.length, 1);
  assert.equal(readdirSync(join(dir, "content/world/civil/bound")).length, 2);
});

test("authored prose is NEVER overwritten, but the binding facts are refreshed", () => {
  const dir = repoFixture();
  scaffoldBound({ repoRoot: dir, dryRun: false });
  const files = readdirSync(join(dir, "content/world/civil/bound")).sort();
  const p = join(dir, "content/world/civil/bound", files[0]);
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc.prose = "authored";
  doc.title = "The Drowned Stair";
  doc.lore.note = "Cut steps run down the shaft wall and stop three fathoms under water.";
  doc.bind.expect.sizeKm = [99, 100]; // a stale fact the scaffolder must fix
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  scaffoldBound({ repoRoot: dir, dryRun: false });
  const after = JSON.parse(readFileSync(p, "utf8"));
  assert.equal(after.title, "The Drowned Stair");
  assert.match(after.lore.note, /^Cut steps run down/);
  assert.notDeepEqual(after.bind.expect.sizeKm, [99, 100]);
});

test("--dry-run writes nothing", () => {
  const dir = repoFixture();
  const r = scaffoldBound({ repoRoot: dir, dryRun: true });
  assert.equal(r.written.length, 3);
  assert.equal(existsSync(join(dir, "content/world/civil/bound")), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'tools/mapforge/tests/scaffold-civil.test.mjs'`
Expected: FAIL with `Cannot find module '.../tools/mapforge/scaffold-civil.mjs'`.

- [ ] **Step 3: Write the scaffolder**

Create `tools/mapforge/scaffold-civil.mjs`:

```js
#!/usr/bin/env node
// Plan D — mint and reconcile the machine-owned half of the civil layer.
//
//   node tools/mapforge/scaffold-civil.mjs --bound     [--dry-run]
//   node tools/mapforge/scaffold-civil.mjs --dungeons  [--dry-run]
//
// SET RECONCILIATION, NEVER APPEND. Every named handle in every ledger gets
// exactly one bound record; every bound record whose handle has left the
// ledger is DELETED. Running it twice is a no-op, which is what makes a
// re-seed a one-command operation rather than a merge.
//
// It never touches a human sentence: a record whose `prose` is "authored"
// keeps its title and its lore verbatim, and only its binding FACTS (handle
// type, size band) are refreshed from the ledger.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { REGISTERS, mintName, registerOf } from "./lib/name-gen.mjs";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const listJson = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")).sort() : []);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The declared band is deliberately WIDER than the measured size: it is a
// statement about what the prose can survive, not a copy of today's number.
// Half to double, clamped into the lexicon's own range for the type.
function bandFor({ sizeKm, lexRow }) {
  const lo = Math.max(lexRow?.sizeKm?.[0] ?? 0.01, Math.round(sizeKm * 50) / 100);
  const hi = Math.min(lexRow?.sizeKm?.[1] ?? sizeKm * 4, Math.round(sizeKm * 200) / 100);
  return [lo, hi > lo ? hi : Math.round(lo * 200) / 100];
}

export function scaffoldBound({ repoRoot, dryRun = false }) {
  const contentRoot = join(repoRoot, "content");
  const out = { written: [], deleted: [], kept: [], problems: [] };

  const lexicon = new Map();
  const lexPath = join(contentRoot, "world/lexicon/landforms.json");
  if (!existsSync(lexPath)) { out.problems.push("scaffold: content/world/lexicon/landforms.json is missing"); return out; }
  for (const row of readJson(lexPath)) lexicon.set(row.id, row);

  const registers = readJson(join(contentRoot, "world/names/registers.json"));
  const classifiers = readJson(join(contentRoot, "world/names/classifiers.json"));
  const reserved = new Set(readJson(join(contentRoot, "world/names/reserved.json")).names);

  // Named instances are the 336: unnamed instances are TEXTURE and get no
  // record at all — giving them one is how you get 1,400 identical dots by a
  // different route.
  const named = [];
  for (const f of listJson(join(contentRoot, "world/fabric")))
    for (const inst of readJson(join(contentRoot, "world/fabric", f)).instances ?? [])
      if (inst.named) named.push(inst);

  const ledgerHandles = new Map();
  for (const f of listJson(join(contentRoot, "world/handles")))
    for (const h of readJson(join(contentRoot, "world/handles", f)).handles ?? [])
      ledgerHandles.set(h.handle, h);

  const boundDir = join(contentRoot, "world/civil/bound");
  const existing = new Map();
  for (const f of listJson(boundDir)) existing.set(f, readJson(join(boundDir, f)));

  const used = new Set([...existing.values()].map((d) => d.title));
  const wanted = new Set();

  for (const inst of named.sort((a, b) => (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0))) {
    const h = ledgerHandles.get(inst.handle);
    if (!h) { out.problems.push(`scaffold: instance ${inst.id} names handle "${inst.handle}" which no ledger carries`); continue; }
    const lexRow = lexicon.get(inst.type);
    const group = inst.handle.split("/")[1];
    const continent = inst.handle.slice(0, 3);
    const regId = registerOf({ continent, registers });
    const reg = registers.registers[regId];
    const legal = [...(classifiers.byGroup[group] ?? []), ...(classifiers.overrides?.[regId]?.[group] ?? [])];
    const classifier = legal.length ? legal[parseInt(inst.handle.slice(-2), 16) % legal.length] : null;

    // Deterministic file name from the HANDLE, so a re-seed that keeps a
    // handle keeps its file and its diff is one line, not a rename.
    const file = `c-lm-${continent}-${group}-${inst.handle.slice(-4)}.json`;
    wanted.add(file);
    const prior = existing.get(file);
    const keepProse = prior?.prose === "authored";

    const title = keepProse ? prior.title
      : mintName({ register: reg, form: "stem-classifier", classifier, stream: `bound:${inst.handle}`, used, reserved });
    used.add(title);

    const doc = {
      id: `c-lm-${continent}-${group}-${inst.handle.slice(-4)}`,
      kind: "landmark",
      tier: "bound",
      title,
      bind: { handle: inst.handle, expect: { type: inst.type, sizeKm: bandFor({ sizeKm: h.sizeKm, lexRow }) } },
      networkAnchor: keepProse ? (prior.networkAnchor ?? false) : false,
      prose: keepProse ? "authored" : "frontier",
      properties: keepProse ? (prior.properties ?? []) : [],
      lore: keepProse ? prior.lore : {
        note: lexRow?.gloss ?? "An unremarked mark on the chart.",
        labelAnchor: "north",
        source: "content/world/lexicon/landforms.json#" + inst.type + ".gloss",
      },
      resolution: null,
    };
    const bytes = JSON.stringify(doc, null, 2) + "\n";
    const unchanged = prior && JSON.stringify(prior, null, 2) + "\n" === bytes;
    if (unchanged) { out.kept.push(file); continue; }
    out.written.push(file);
    if (!dryRun) { mkdirSync(boundDir, { recursive: true }); writeFileSync(join(boundDir, file), bytes); }
  }

  for (const file of existing.keys())
    if (!wanted.has(file)) { out.deleted.push(file); if (!dryRun) rmSync(join(boundDir, file)); }

  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes("--dry-run");
  const repoRoot = new URL("../..", import.meta.url).pathname;
  if (process.argv.includes("--bound")) {
    const r = scaffoldBound({ repoRoot, dryRun });
    for (const p of r.problems) console.log(`PROBLEM ${p}`);
    console.log(`scaffold-bound: ${r.written.length} written, ${r.kept.length} unchanged, ${r.deleted.length} deleted${dryRun ? " (dry run)" : ""}`);
    process.exit(r.problems.length ? 1 : 0);
  }
  console.error("usage: scaffold-civil.mjs --bound | --dungeons [--dry-run]");
  process.exit(2);
}
```

(The `--dungeons` branch lands in Task 6.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test 'tools/mapforge/tests/scaffold-civil.test.mjs'`
Expected: PASS — 6 tests.

- [ ] **Step 5: Write the failing G-HANDLE-BAND test**

Append to `scripts/tests/resolve.test.mjs`:

```js
import { gHandleBand } from "../lib/resolve.mjs";

test("G-HANDLE-BAND is silent when the ledger size is inside the declared band", () => {
  assert.deepEqual(gHandleBand({ world: loadCivil({ contentRoot: worldFixture() }) }), []);
});

test("G-HANDLE-BAND red: the 17.5x karst swing an ordinal rank resolves silently", () => {
  const p = gHandleBand({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-handle-band-oversize" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-HANDLE-BAND: c-lm-the-drowned-stair resolved to 5\.42 km2, declared band \[0\.1, 0\.8\]$/);
});

test("G-HANDLE-BAND red: the resolved type is not the type the record expects", () => {
  const dir = worldFixture();
  const p = join(dir, "world/handles/continent-02.json");
  const led = JSON.parse(readFileSync(p, "utf8"));
  led.handles.find((h) => h.handle === "c02/karst/h-0f42").type = "salt-pan-crust";
  writeFileSync(p, JSON.stringify(led, null, 2) + "\n");
  const problems = gHandleBand({ world: loadCivil({ contentRoot: dir }) });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /expects type "karst-cenote" but the handle resolves to "salt-pan-crust"/);
});
```

Create `scripts/tests/fixtures/world/g-handle-band-oversize/world/handles/continent-02.json` — a copy of the base ledger with `c02/karst/h-0f42`'s `sizeKm` changed to `5.42`.

- [ ] **Step 6: Write G-HANDLE-BAND**

Append to `scripts/lib/resolve.mjs`; call from `checkWorldCivil` after `gPinSat`:

```js
// G-HANDLE-BAND — the gate that catches what an ordinal rank hides. "The
// largest karst group" resolves in every seed; measured across 20 pinned-mask
// seeds it ranged 892 to 15,645 cells, a 17.5x swing. A declared band turns
// that from a silent success into a named failure.
export function gHandleBand({ world }) {
  if (!world.present) return [];
  const problems = [];
  for (const { doc } of world.bound) {
    const h = world.handles.get(doc.bind?.handle);
    if (!h) continue; // already a G-BIND failure; one defect, one line
    const [lo, hi] = doc.bind.expect.sizeKm;
    if (h.type !== doc.bind.expect.type)
      problems.push(`G-HANDLE-BAND: ${doc.id} expects type "${doc.bind.expect.type}" but the handle resolves to "${h.type}"`);
    if (!(h.sizeKm >= lo && h.sizeKm <= hi))
      problems.push(`G-HANDLE-BAND: ${doc.id} resolved to ${h.sizeKm} km2, declared band [${lo}, ${hi}]`);
  }
  return problems;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test --test-name-pattern "G-HANDLE-BAND" 'scripts/tests/*.test.mjs'`
Expected: PASS — 3 tests.

- [ ] **Step 8: Mint the real 336 records**

Run:
```bash
node tools/mapforge/scaffold-civil.mjs --bound --dry-run
node tools/mapforge/scaffold-civil.mjs --bound
ls content/world/civil/bound | wc -l
node scripts/check_content.mjs --only=spine
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: the dry run reports `336 written`; the real run writes them; `ls | wc -l` prints `336`; the gate prints `world-civil: 41 pinned, 336 bound, ...`. `G-PIN-SAT` still reports its 41 receipt failures until Task 10 — record the count and confirm it has not grown.

- [ ] **Step 9: Commit**

```bash
git add tools/mapforge/scaffold-civil.mjs tools/mapforge/tests/scaffold-civil.test.mjs content/world/civil/bound scripts/lib/resolve.mjs scripts/tests
git commit -m "feat: bound-record scaffolder and G-HANDLE-BAND"
git branch --show-current && git log --oneline -1
```

- [ ] **Step 10: Independent adversarial review of this task's diff**

Reviewer brief:

> Review `git diff HEAD~1` against spec §5.4 and §5.9. Attack: (a) run the scaffolder twice against the real content root and `git status --porcelain content/world/civil/bound` — is it genuinely a fixpoint, or does the name minter drift because `used` is seeded from existing titles? (b) Can a record whose `prose` is `"authored"` lose a sentence under any code path? (c) `bandFor` clamps to the lexicon range — can it emit `lo >= hi`? Construct the input. (d) Is `G-HANDLE-BAND` reachable when `G-BIND` has already failed on the same record — should it be, and is one defect producing two lines? (e) Do the 336 committed files fit `content/world/budgets.json`'s civil cap of 600 files / 8192 B each?

- [ ] **Step 11: Refactor on the findings, then re-verify**

Apply findings as a NEW commit; re-run Steps 4, 7 and 8.

---

### Task 6: Dungeons — a file family, never a tier

Making a dungeon a spine node would drag its area into the composition rollup and into the per-parent quadratic overlap check. It joins by handle instead, exactly as `content/towns/town-millcross.json` joins by `spineId`.

**Files:**
- Create: `content/schemas/dungeon.schema.json`, `content/schemas/dungeon-family.schema.json`
- Create: `content/dungeons/families/family-{necropolis,catacomb,lavatube}.json`
- Create: `content/dungeons/dungeon-*.json` (60)
- Create: `scripts/lib/dungeons.mjs`
- Create: `scripts/tests/dungeons.test.mjs`
- Create: `scripts/tests/fixtures/world/g-dungeon-reach-uncapable/**`, `.../g-dungeon-reach-far/**`
- Modify: `tools/mapforge/scaffold-civil.mjs` (append the `--dungeons` branch; created in Task 5)
- Modify: `scripts/lib/resolve.mjs` (call `gDungeonReach` from `checkWorldCivil`; created in Task 2)

**Interfaces:**
- Consumes: Plan B's lexicon `dungeonCapable`; Plan C's fabric `regions[].adjacent` and `regions[].settlements`.
- Produces:
  - `export function loadDungeons({ contentRoot }): { families: Map<string,object>, dungeons: object[], errors: string[] }`
  - `export function expandFamily({ family, index }): { levelBand: [number, number], floors: number }`
  - `export function gDungeonReach({ world, dungeons, lexicon }): string[]`
  - `export function dungeonDensityLines({ world, dungeons }): string[]`

**Floor arithmetic, pinned:** 3 families x 8 members x 3 template floors = 72, plus 36 bespoke totalling 118 (mean 3.28, with three mega-dungeons at 7, 9 and 12 carrying the tail) = **190 floors across 60 complexes**.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/dungeons.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDungeons, expandFamily, gDungeonReach, dungeonDensityLines } from "../lib/dungeons.mjs";
import { loadCivil } from "../lib/resolve.mjs";
import { worldFixture, runWorldGate } from "./resolve.test.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("levelBand(index) = [18 + 3i, 24 + 3i]", () => {
  const family = { id: "family-catacomb", levelBand: { base: 18, step: 3, span: 6 }, floors: 3 };
  assert.deepEqual(expandFamily({ family, index: 0 }), { levelBand: [18, 24], floors: 3 });
  assert.deepEqual(expandFamily({ family, index: 7 }), { levelBand: [39, 45], floors: 3 });
});

test("the committed corpus is 60 complexes and exactly 190 floors", () => {
  const { families, dungeons, errors } = loadDungeons({ contentRoot: join(ROOT, "content") });
  assert.deepEqual(errors, []);
  assert.equal(families.size, 3);
  assert.equal(dungeons.length, 60);
  const members = dungeons.filter((d) => d.family !== null);
  assert.equal(members.length, 24, "3 families x 8 members");
  const total = dungeons.reduce((n, d) => n + d.floors, 0);
  assert.equal(total, 190);
  const bespoke = dungeons.filter((d) => d.family === null);
  assert.equal(bespoke.length, 36);
  assert.equal(bespoke.reduce((n, d) => n + d.floors, 0), 118);
  assert.equal(bespoke.filter((d) => d.floors >= 7).length, 3, "three mega-dungeons carry the tail");
});

test("no dungeon is a spine node", () => {
  const { dungeons } = loadDungeons({ contentRoot: join(ROOT, "content") });
  for (const d of dungeons) assert.equal(d.spineId, null, `${d.id} must not name a spine node`);
  const nodeIds = new Set(readdirSync(join(ROOT, "content/spine/nodes")).map((f) => f.replace(/\.json$/, "")));
  for (const d of dungeons) assert.equal(nodeIds.has("n-" + d.id.replace(/^dungeon-/, "")), false);
});

test("every entranceType — on a family and on a record — is a dungeonCapable LEXICON id", () => {
  // The namespace trap this catches: `cave`, `sinkhole` and `gorge` read as
  // English but are not lexicon ids (the real rows are `cave-system`,
  // `sinkhole-doline`, `knickpoint-gorge`), and `karst-plateau` / `sand-sea` /
  // `fjordland` / `cloud-forest` are TERRAIN KINDS, not landform types.
  // scaffoldDungeons matches family.entranceTypes against ledger handle TYPES,
  // so a string outside the lexicon silently matches nothing: eight family
  // members go unminted and the only symptom is a short corpus.
  const lexPath = join(ROOT, "content/world/lexicon/landforms.json");
  if (!existsSync(lexPath)) return;                       // Plan B not merged: skip
  const capable = new Set(JSON.parse(readFileSync(lexPath, "utf8"))
    .filter((r) => r.dungeonCapable === true).map((r) => r.id));
  assert.equal(capable.size, 23, "Plan B ships exactly 23 dungeonCapable types");

  const { families, dungeons } = loadDungeons({ contentRoot: join(ROOT, "content") });
  const bad = [];
  for (const fam of families.values())
    for (const t of fam.entranceTypes)
      if (!capable.has(t)) bad.push(`${fam.id}.entranceTypes: "${t}"`);
  for (const d of dungeons)
    if (!capable.has(d.entranceType)) bad.push(`${d.id}.entranceType: "${d.entranceType}"`);
  assert.deepEqual(bad, []);
});

test("G-DUNGEON-REACH is silent on the green fixture", () => {
  const dir = worldFixture();
  const world = loadCivil({ contentRoot: dir });
  const { dungeons } = loadDungeons({ contentRoot: dir });
  assert.deepEqual(gDungeonReach({ world, dungeons, lexicon: world.lexicon }), []);
});

test("G-DUNGEON-REACH red: an entrance on a landform that is not cave-capable", () => {
  const dir = worldFixture({ overlayDir: "g-dungeon-reach-uncapable" });
  const world = loadCivil({ contentRoot: dir });
  const { dungeons } = loadDungeons({ contentRoot: dir });
  const p = gDungeonReach({ world, dungeons, lexicon: world.lexicon });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-DUNGEON-REACH: dungeon-shallow-ria entrance landform "coastal-drowned-valley" is not dungeonCapable$/);
});

test("G-DUNGEON-REACH red: more than two region hops from any settlement", () => {
  const dir = worldFixture({ overlayDir: "g-dungeon-reach-far" });
  const world = loadCivil({ contentRoot: dir });
  const { dungeons } = loadDungeons({ contentRoot: dir });
  const p = gDungeonReach({ world, dungeons, lexicon: world.lexicon });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-DUNGEON-REACH: dungeon-fumewater-tube nearest settlement is 4 region hops \(max 2\)$/);
});

test("G-DUNGEON-REACH red: unreachable reads DIFFERENTLY from merely far", () => {
  // "4 hops" and "no settled region at any distance" are different bugs — one
  // is a placement to move, the other is a continent with no settlement — so
  // they get different sentences. `null` is Plan C's serialisation of the
  // unreachable case; there is no Infinity in JSON and the gate must never
  // print one.
  const dir = worldFixture();
  const p = join(dir, "world/fabric/continent-10.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc.dungeonAnchors[0].hopsToSettlement = null;
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const world = loadCivil({ contentRoot: dir });
  const { dungeons } = loadDungeons({ contentRoot: dir });
  const problems = gDungeonReach({ world, dungeons, lexicon: world.lexicon });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^G-DUNGEON-REACH: dungeon-fumewater-tube has no settled region reachable at any distance$/);
});

test("G-DUNGEON-REACH red: a ledger handle with no dungeonAnchors row names the generator", () => {
  // The failure mode this replaces: reading `?? Infinity` and reporting an
  // unreachable dungeon when the real defect is that the generator never
  // anchored it. A missing anchor is a GENERATOR bug and says so.
  const dir = worldFixture();
  const p = join(dir, "world/fabric/continent-10.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc.dungeonAnchors = [];
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const world = loadCivil({ contentRoot: dir });
  const { dungeons } = loadDungeons({ contentRoot: dir });
  const problems = gDungeonReach({ world, dungeons, lexicon: world.lexicon });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /has no dungeonAnchors row in the fabric — re-run the generator/);
});

test("density is REPORTED, never failed", () => {
  const dir = worldFixture();
  const world = loadCivil({ contentRoot: dir });
  const { dungeons } = loadDungeons({ contentRoot: dir });
  const lines = dungeonDensityLines({ world, dungeons });
  assert.ok(lines.some((l) => /^dungeon-density: c02\/r02 1 complexes$/.test(l)));
});

test("the gate wires G-DUNGEON-REACH into --only=spine", () => {
  const r = runWorldGate(worldFixture({ overlayDir: "g-dungeon-reach-uncapable" }));
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL {2}G-DUNGEON-REACH: .*is not dungeonCapable/);
});
```

Add to `scripts/tests/fixtures/world/base/dungeons/`: `families/family-catacomb.json` and two records `dungeon-drowned-stair.json` (bound to `c02/karst/h-0f42`, `entranceType` `karst-cenote`) and `dungeon-fumewater-tube.json` (bound to `c10/volcanic/h-3c9d`, `entranceType` `lava-tube`). Both handles already have a `dungeonAnchors` row in the base fabric above — a dungeon whose handle has no anchor row is its own named failure, so the green fixture must supply one.

Overlay `g-dungeon-reach-uncapable` adds **two** files: `dungeons/dungeon-shallow-ria.json` bound to `c02/coastal/h-a1b2` (a `coastal-drowned-valley`, `dungeonCapable: false`) and nothing else — the anchor row for that handle is already in the base fabric, which is what keeps this overlay to exactly ONE problem instead of two.

Overlay `g-dungeon-reach-far` is one file: a copy of `world/fabric/continent-10.json` with its single `dungeonAnchors` row's `hopsToSettlement` changed from `2` to `4`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "levelBand|60 complexes|spine node|entranceType|G-DUNGEON-REACH|density" 'scripts/tests/*.test.mjs'`
Expected: FAIL with `Cannot find module '.../scripts/lib/dungeons.mjs'`.

- [ ] **Step 3: Write the two schemas**

Create `content/schemas/dungeon-family.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Atlas dungeon family",
  "description": "A shared template for eight member complexes. Holds the floor-graph shape, the hazard set, the room-count curve and the band function levelBand(index) = [base + step*index, base + step*index + span]. A member that overrides nothing is ~700 bytes; the family is why 24 of the 60 complexes cost almost no authoring.",
  "type": "object",
  "required": ["id", "title", "floors", "floorGraph", "hazards", "roomCountCurve", "levelBand", "entranceTypes"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^family-[a-z0-9-]+$" },
    "title": { "type": "string", "minLength": 1 },
    "floors": { "type": "integer", "minimum": 1, "maximum": 12 },
    "floorGraph": { "type": "string", "enum": ["linear", "hub-and-spoke", "branching", "loop"] },
    "hazards": { "type": "array", "minItems": 2, "items": { "type": "string", "minLength": 1 } },
    "roomCountCurve": { "type": "array", "minItems": 1, "items": { "type": "integer", "minimum": 1 } },
    "levelBand": {
      "type": "object", "required": ["base", "step", "span"], "additionalProperties": false,
      "properties": { "base": { "type": "integer" }, "step": { "type": "integer" }, "span": { "type": "integer" } }
    },
    "entranceTypes": { "type": "array", "minItems": 1, "items": { "type": "string", "minLength": 1 } }
  }
}
```

Create `content/schemas/dungeon.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Atlas dungeon complex",
  "description": "A dungeon is a FILE FAMILY, never a spine tier: making it a node would drag its area into the composition rollup and into the per-parent quadratic overlap check for no gate coverage the fabric gates cannot provide. It joins the world by bind.handle exactly as content/towns/town-millcross.json joins by spineId. spineId is required and must be null — an explicit null is a refusal, an absent key is an oversight.",
  "type": "object",
  "required": ["id", "title", "family", "bind", "entranceType", "floors", "levelBand", "spineId"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^dungeon-[a-z0-9]+(-[a-z0-9]+)*$" },
    "title": { "type": "string", "minLength": 1 },
    "family": { "type": ["string", "null"], "pattern": "^family-[a-z0-9-]+$" },
    "familyIndex": { "type": "integer", "minimum": 0, "maximum": 7 },
    "bind": {
      "type": "object", "required": ["handle"], "additionalProperties": false,
      "properties": { "handle": { "type": "string", "pattern": "^c[0-9]{2}/[a-z-]+/h-[0-9a-f]{4,6}$" } }
    },
    "entranceType": { "type": "string", "minLength": 1 },
    "floors": { "type": "integer", "minimum": 1, "maximum": 12 },
    "levelBand": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "integer", "minimum": 1, "maximum": 80 } },
    "hazards": { "type": "array", "items": { "type": "string", "minLength": 1 } },
    "roomCountCurve": { "type": "array", "minItems": 1, "items": { "type": "integer", "minimum": 1 } },
    "note": { "type": "string" },
    "prose": { "type": "string", "enum": ["authored", "frontier"] },
    "lore": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "note": { "type": "string", "minLength": 1 },
        "source": { "type": "string", "minLength": 1 }
      }
    },
    "provenance": {
      "type": "object",
      "required": ["authored", "generator"],
      "additionalProperties": false,
      "properties": {
        "authored": { "type": "string", "enum": ["hand", "generated"] },
        "generator": { "type": ["object", "null"] }
      }
    },
    "spineId": { "type": "null" }
  },
  "allOf": [
    {
      "if": { "properties": { "family": { "type": "null" } }, "required": ["family"] },
      "then": {
        "not": { "required": ["familyIndex"] },
        "required": ["roomCountCurve", "lore", "prose", "provenance"]
      }
    },
    {
      "if": { "properties": { "family": { "type": "string" } }, "required": ["family"] },
      "then": { "required": ["familyIndex"] }
    }
  ]
}
```

**The `allOf` is the half a prose enumeration would have lost.** A bespoke record (`family: null`) carries its own `roomCountCurve`, `lore`, `prose` and `provenance` and must NOT carry `familyIndex` — that key only means something relative to a template. A family member is the mirror image: `familyIndex` is required, and the four bespoke-only keys come from the template rather than the file. Without the conditional, `additionalProperties: false` alone lets a member carry a stray `familyIndex: 0` alongside `family: null` and calls it valid.

- [ ] **Step 4: Write the three families**

Create `content/dungeons/families/family-catacomb.json`:

```json
{
  "id": "family-catacomb",
  "title": "Catacomb",
  "floors": 3,
  "floorGraph": "branching",
  "hazards": ["bad-air", "collapse", "grave-damp"],
  "roomCountCurve": [8, 12, 9],
  "levelBand": { "base": 18, "step": 3, "span": 6 },
  "entranceTypes": ["karst-cenote", "karst-fenster", "cave-system", "sinkhole-doline"]
}
```

Create `content/dungeons/families/family-necropolis.json`:

```json
{
  "id": "family-necropolis",
  "title": "Necropolis",
  "floors": 3,
  "floorGraph": "hub-and-spoke",
  "hazards": ["grave-damp", "cold", "silence"],
  "roomCountCurve": [10, 14, 11],
  "levelBand": { "base": 30, "step": 3, "span": 6 },
  "entranceTypes": ["ponor", "foiba", "cave-system", "knickpoint-gorge"]
}
```

Create `content/dungeons/families/family-lavatube.json`:

```json
{
  "id": "family-lavatube",
  "title": "Lava tube",
  "floors": 3,
  "floorGraph": "linear",
  "hazards": ["heat", "fume", "loose-floor"],
  "roomCountCurve": [6, 9, 7],
  "levelBand": { "base": 45, "step": 3, "span": 6 },
  "entranceTypes": ["lava-tube", "fumarole-vent", "caldera-floor", "rift-fissure"]
}
```

- [ ] **Step 5: Write the loader and the gate**

Create `scripts/lib/dungeons.mjs`:

```js
// Plan D — dungeons as a file family.
//
// G-DUNGEON-REACH is two cheap assertions and one report:
//   1. the bound entrance resolves to a landform whose lexicon row is
//      dungeonCapable: true — a door has to be a door;
//   2. BFS over the region adjacency graph (from the fabric's shared cell
//      boundaries, ~160 nodes) finds a settlement within 2 hops — a dungeon
//      nobody can walk to is content nobody sees;
//   3. per-region density is REPORTED WITHOUT FAILING, so the Ragnarok ratio
//      (1 town : 5 fields : 6 dungeon floors) stays visible while authoring.
//      Same always-print discipline as G-LOAD-BUDGET and G-COMP-REPORT.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export function loadDungeons({ contentRoot }) {
  const dir = join(contentRoot, "dungeons");
  const out = { families: new Map(), dungeons: [], errors: [] };
  if (!existsSync(dir)) return out;
  const read = (p) => {
    try { return JSON.parse(readFileSync(p, "utf8")); }
    catch (e) { out.errors.push(`dungeons: ${p}: ${e.message}`); return null; }
  };
  const famDir = join(dir, "families");
  if (existsSync(famDir))
    for (const f of readdirSync(famDir).filter((x) => x.endsWith(".json")).sort()) {
      const doc = read(join(famDir, f));
      if (doc?.id) out.families.set(doc.id, doc);
    }
  for (const f of readdirSync(dir).filter((x) => /^dungeon-.+\.json$/.test(x)).sort()) {
    const doc = read(join(dir, f));
    if (doc) out.dungeons.push(doc);
  }
  return out;
}

export function expandFamily({ family, index }) {
  const b = family.levelBand;
  return { levelBand: [b.base + b.step * index, b.base + b.step * index + b.span], floors: family.floors };
}

// The region-hop distance is NOT re-derived here. Plan C's anchorDungeons
// already walks the region adjacency graph once, at generation time, and
// serialises the answer into every fabric file's `dungeonAnchors[]` row as
// `hopsToSettlement`. Reading it back is the whole point of committing it:
// a second BFS in the gate would carry its own copy of the settlement->region
// join, and the two copies are exactly what drifts. A missing anchor row is a
// LOUD problem naming the generator, not a silent Infinity.
function anchorIndex({ world }) {
  const byHandle = new Map();
  for (const f of Object.values(world.fabric))
    for (const a of f.dungeonAnchors ?? []) byHandle.set(a.handle, a);
  return byHandle;
}

export function gDungeonReach({ world, dungeons, lexicon }) {
  if (!world.present) return [];
  const problems = [];
  const anchors = anchorIndex({ world });
  for (const d of dungeons) {
    const h = world.handles.get(d.bind?.handle);
    if (!h) { problems.push(`G-DUNGEON-REACH: ${d.id} handle "${d.bind?.handle}" does not resolve in any ledger`); continue; }
    const row = lexicon.get(h.type);
    if (!row?.dungeonCapable)
      problems.push(`G-DUNGEON-REACH: ${d.id} entrance landform "${h.type}" is not dungeonCapable`);
    const anchor = anchors.get(d.bind.handle);
    if (!anchor) {
      problems.push(`G-DUNGEON-REACH: ${d.id} handle "${d.bind.handle}" is in a ledger but has no dungeonAnchors row in the fabric — re-run the generator, do not bind to a non-anchor`);
      continue;
    }
    // Plan C emits Infinity as null when no settled region is reachable at
    // all; "3 hops" and "unreachable" are different bugs and read differently.
    if (anchor.hopsToSettlement === null)
      problems.push(`G-DUNGEON-REACH: ${d.id} has no settled region reachable at any distance`);
    else if (anchor.hopsToSettlement > 2)
      problems.push(`G-DUNGEON-REACH: ${d.id} nearest settlement is ${anchor.hopsToSettlement} region hops (max 2)`);
  }
  return problems;
}

export function dungeonDensityLines({ world, dungeons }) {
  const byRegion = new Map();
  for (const d of dungeons) {
    const h = world.handles.get(d.bind?.handle);
    if (!h) continue;
    byRegion.set(h.region, (byRegion.get(h.region) ?? 0) + 1);
  }
  return [...byRegion.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([region, n]) => `dungeon-density: ${region} ${n} complexes`);
}
```

Wire into `checkWorldCivil` (in `scripts/lib/resolve.mjs`), after `gHandleBand`:

```js
  const dungeonSet = loadDungeons({ contentRoot: opts.contentRoot });
  for (const e of dungeonSet.errors) fail(e);
  for (const p of gDungeonReach({ world, dungeons: dungeonSet.dungeons, lexicon: world.lexicon })) fail(p);
  for (const line of dungeonDensityLines({ world, dungeons: dungeonSet.dungeons })) console.log(line);
```

with `import { loadDungeons, gDungeonReach, dungeonDensityLines } from "./dungeons.mjs";` at the top.

- [ ] **Step 6: Add the `--dungeons` branch to the scaffolder**

Append to `tools/mapforge/scaffold-civil.mjs`:

```js
// Family members are minted onto the eight highest-ranked dungeonCapable
// handles of the family's own entrance types; bespoke dungeons are authored by
// hand and only their binding facts are reconciled here.
export function scaffoldDungeons({ repoRoot, dryRun = false }) {
  const contentRoot = join(repoRoot, "content");
  const out = { written: [], deleted: [], kept: [], problems: [] };
  const lexicon = new Map();
  for (const row of readJson(join(contentRoot, "world/lexicon/landforms.json"))) lexicon.set(row.id, row);

  const capable = [];
  for (const f of listJson(join(contentRoot, "world/handles")))
    for (const h of readJson(join(contentRoot, "world/handles", f)).handles ?? [])
      if (lexicon.get(h.type)?.dungeonCapable) capable.push(h);
  capable.sort((a, b) => (b.sizeKm - a.sizeKm) || (a.contentHash < b.contentHash ? -1 : 1));

  const famDir = join(contentRoot, "dungeons/families");
  const dungDir = join(contentRoot, "dungeons");
  const taken = new Set();
  for (const ff of listJson(famDir)) {
    const family = readJson(join(famDir, ff));
    for (let index = 0; index < 8; index++) {
      const h = capable.find((c) => family.entranceTypes.includes(c.type) && !taken.has(c.handle));
      if (!h) { out.problems.push(`scaffold: ${family.id} member ${index} has no free dungeonCapable handle`); continue; }
      taken.add(h.handle);
      const file = `dungeon-${family.id.replace(/^family-/, "")}-${index}.json`;
      const prior = existsSync(join(dungDir, file)) ? readJson(join(dungDir, file)) : null;
      const band = [family.levelBand.base + family.levelBand.step * index,
                    family.levelBand.base + family.levelBand.step * index + family.levelBand.span];
      const doc = {
        id: file.replace(/\.json$/, ""),
        title: prior?.title ?? `${family.title} ${index + 1}`,
        family: family.id, familyIndex: index,
        bind: { handle: h.handle }, entranceType: h.type,
        floors: family.floors, levelBand: band,
        hazards: family.hazards, spineId: null,
      };
      const bytes = JSON.stringify(doc, null, 2) + "\n";
      if (prior && JSON.stringify(prior, null, 2) + "\n" === bytes) { out.kept.push(file); continue; }
      out.written.push(file);
      if (!dryRun) { mkdirSync(dungDir, { recursive: true }); writeFileSync(join(dungDir, file), bytes); }
    }
  }
  return out;
}
```

and extend the CLI block with `if (process.argv.includes("--dungeons")) { ... }` printing `scaffold-dungeons: N written, N unchanged`.

- [ ] **Step 7: Mint the 24 family members and author the 36 bespoke**

Run `node tools/mapforge/scaffold-civil.mjs --dungeons` (writes 24).

Then author the 36 bespoke records from **this table** — it is the deliverable, not a guideline. The floors column sums to **118**, exactly three rows are the mega-dungeons at 7, 9 and 12 floors, every `entranceType` is one of the 23 `dungeonCapable` ids in `content/world/lexicon/landforms.json`, and every `levelBand` is **either one of the nine rings from Gildmark or its own continent's committed `levelBand`** from `content/world/premises/continent-NN.json` — the four that are the latter are `c07 [10, 36]`, `c08 [20, 52]`, `c09 [30, 56]` and `c10 [55, 80]`, because those four landmasses sit at a distance the ring ladder does not resolve finely enough to distinguish. Under either rule every row overlaps its continent's premise band, so `G-BAND`'s "every dungeon band overlaps its host region's" holds by construction rather than by luck. Check it with the one-liner below before committing; do **not** widen a band to make the check pass.

| slug (`content/dungeons/dungeon-<slug>.json`) | continent | `entranceType` | floors | `levelBand` |
|---|---|---|---:|---|
| `gildmark-undervault` | c02 | `sea-cave` | 3 | `[1, 10]` |
| `millcross-race-tunnels` | c02 | `cave-system` | 2 | `[1, 10]` |
| `thornveil-briar-sink` | c02 | `sinkhole-doline` | 3 | `[8, 20]` |
| `hollowmarch-peat-shafts` | c02 | `cave-system` | 2 | `[8, 20]` |
| `emberdown-old-workings` | c02 | `cave-system` | 3 | `[16, 30]` |
| `rooktide-drowned-cellars` | c02 | `karst-fenster` | 2 | `[16, 30]` |
| `ashvale-cinder-galleries` | c02 | `cave-system` | 4 | `[24, 40]` |
| `cindervast-under-city` | c02 | `tectonic-cave` | 12 | `[32, 50]` |
| `meltwash-ice-caves` | c02 | `glacier-cave` | 3 | `[24, 40]` |
| `northern-icefield-moulin` | c02 | `moulin` | 2 | `[32, 50]` |
| `tallowquay-tide-caves` | c03 | `sea-cave` | 3 | `[24, 40]` |
| `coldreach-arete-shelters` | c03 | `nunatak` | 2 | `[32, 50]` |
| `trade-wind-blowholes` | c03 | `blowhole` | 2 | `[24, 40]` |
| `coldreach-outlet-crevasses` | c03 | `glacier-cave` | 4 | `[40, 58]` |
| `rimewall-nunatak-warren` | c01 | `nunatak` | 3 | `[58, 80]` |
| `rimewall-moulin-deeps` | c01 | `moulin` | 9 | `[58, 80]` |
| `netstead-fenster-halls` | c04 | `karst-fenster` | 3 | `[24, 40]` |
| `stonemoor-ponor-throat` | c04 | `ponor` | 3 | `[32, 50]` |
| `slateflow-swallet` | c04 | `ponor` | 3 | `[32, 50]` |
| `drowned-pavement-cenotes` | c04 | `karst-cenote` | 3 | `[40, 58]` |
| `stonemoor-foiba` | c04 | `foiba` | 3 | `[46, 64]` |
| `stonemoor-cave-city` | c04 | `cave-system` | 7 | `[46, 64]` |
| `thirstwold-slot-canyons` | c05 | `slot-canyon` | 3 | `[40, 58]` |
| `thirstwold-yardang-hollows` | c05 | `yardang` | 2 | `[40, 58]` |
| `erg-hoodoo-warren` | c05 | `hoodoo` | 3 | `[46, 64]` |
| `one-wet-strip-gorges` | c05 | `knickpoint-gorge` | 2 | `[32, 50]` |
| `reedstrand-lobe-hollows` | c06 | `cave-system` | 2 | `[16, 30]` |
| `reed-shallows-sea-caves` | c06 | `sea-cave` | 2 | `[16, 30]` |
| `driftholt-fog-caverns` | c07 | `cave-system` | 3 | `[10, 36]` |
| `driftholt-plunge-undercuts` | c07 | `plunge-pool` | 2 | `[10, 36]` |
| `wracklow-geo-throats` | c08 | `sea-arch` | 3 | `[20, 52]` |
| `wracklow-blowhole-deeps` | c08 | `blowhole` | 3 | `[20, 52]` |
| `brightfall-plunge-caves` | c09 | `plunge-pool` | 3 | `[30, 56]` |
| `ashen-spar-lava-tubes` | c10 | `lava-tube` | 3 | `[55, 80]` |
| `fumewater-caldera-floor` | c10 | `caldera-floor` | 3 | `[55, 80]` |
| `ashen-spar-fumaroles` | c10 | `fumarole-vent` | 3 | `[55, 80]` |

Floor arithmetic, to be checked before committing: c02 36 · c03 11 · c01 12 · c04 22 · c05 10 · c06 4 · c07 5 · c08 6 · c09 3 · c10 9 = **118 bespoke** ✓; plus 3 families × 8 members × 3 template floors = 72 → **190 complexes-worth of floors across 60 complexes** ✓.

**One complete record, the shape all 36 follow.** Note what a bespoke record does NOT carry: no `family` value and no `familyIndex` — those two belong to the scaffolded members, and `dungeon.schema.json` forbids `familyIndex` when `family` is null.

```json
{
  "id": "dungeon-cindervast-under-city",
  "title": "The Under-City",
  "family": null,
  "bind": { "handle": "c02/mountain/h-3b71" },
  "entranceType": "tectonic-cave",
  "floors": 12,
  "levelBand": [32, 50],
  "hazards": ["collapse", "ashfall", "dark"],
  "roomCountCurve": [14, 16, 18, 18, 20, 20, 22, 22, 24, 24, 26, 28],
  "lore": {
    "note": "The fallen city did not fall far. Under the ash there are streets.",
    "source": "canon.md \u00a74 \"The fallen city\""
  },
  "prose": "authored",
  "spineId": null,
  "provenance": { "authored": "hand", "generator": null }
}
```

`bind.handle` is **not** invented: for each row, take a free `dungeonCapable` handle whose `type` equals the row's `entranceType` from that continent's ledger. `node tools/mapforge/scaffold-civil.mjs --dungeons --list-free` prints the available ones grouped by continent and type; if a row's type has none free, the fix is to change the row's `entranceType` to another `dungeonCapable` id that continent's `landformKit` actually produces, never to bind to a non-capable handle. `spineId` is always `null` — **a dungeon is never a spine node** (spec §5.8: making it one drags its area into the composition rollup and into the quadratic overlap check).

`roomCountCurve` has exactly `floors` entries and is non-decreasing; `hazards` are drawn from the family templates' shared vocabulary so the three families and the 36 bespoke read as one world.

Verify continuously with:

```bash
node -e '
const {loadDungeons} = await import("./scripts/lib/dungeons.mjs");
const fs = await import("node:fs");
const {dungeons} = loadDungeons({contentRoot: "content"});
const bespoke = dungeons.filter(d=>d.family===null);
console.log("complexes", dungeons.length, "floors", dungeons.reduce((n,d)=>n+d.floors,0),
            "bespoke", bespoke.length, "bespoke floors", bespoke.reduce((n,d)=>n+d.floors,0),
            "mega", bespoke.filter(d=>d.floors>=7).length);

// entranceType is a dungeonCapable LEXICON id, never an English word and never
// a terrainKind: `cave`, `sinkhole`, `gorge`, `undercut-alcove` all read fine
// and all match zero handles, which shows up only as a short corpus.
const lex = JSON.parse(fs.readFileSync("content/world/lexicon/landforms.json","utf8"));
const cap = new Set(lex.filter(r=>r.dungeonCapable).map(r=>r.id));
console.log("dungeonCapable types", cap.size,
            "bad entranceType", dungeons.filter(d=>!cap.has(d.entranceType)).map(d=>d.id));

// every band overlaps its continent premise band
const prem = Object.fromEntries(fs.readdirSync("content/world/premises")
  .filter(f=>f.endsWith(".json"))
  .map(f=>{const p=JSON.parse(fs.readFileSync("content/world/premises/"+f,"utf8")); return [p.id,p.levelBand];}));
const led = Object.fromEntries(fs.readdirSync("content/world/handles")
  .flatMap(f=>JSON.parse(fs.readFileSync("content/world/handles/"+f,"utf8")).handles.map(h=>[h.handle,h])));
const off = dungeons.filter(d=>{
  const c = (d.bind.handle||"").slice(0,3), b = prem[c];
  return b && !(d.levelBand[0] <= b[1] && b[0] <= d.levelBand[1]);
}).map(d=>d.id);
console.log("bands off their continent", off);' --input-type=module
```
Expected when complete: `complexes 60 floors 190 bespoke 36 bespoke floors 118 mega 3`, then `dungeonCapable types 23 bad entranceType []`, then `bands off their continent []`.

- [ ] **Step 8: Run test to verify it passes**

Run: `node --test --test-name-pattern "levelBand|60 complexes|spine node|entranceType|G-DUNGEON-REACH|density" 'scripts/tests/*.test.mjs'`
Expected: PASS — 11 tests.

- [ ] **Step 9: Full verification**

Run:
```bash
npm test --prefix scripts
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_content.mjs --only=spine
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: the suites pass; the gate prints 60 `dungeon-density:` lines and no new `G-DUNGEON-REACH` failure.

- [ ] **Step 10: Commit**

```bash
git add content/schemas/dungeon*.json content/dungeons scripts/lib/dungeons.mjs scripts/lib/resolve.mjs scripts/tests tools/mapforge/scaffold-civil.mjs
git commit -m "feat: dungeon families, 60 complexes and G-DUNGEON-REACH"
git branch --show-current && git log --oneline -1
```

- [ ] **Step 11: Independent adversarial review, refactor and re-verify**

Reviewer brief:

> Review `git diff HEAD~1` against spec §5.8 and §8.3. Attack: (a) is the floor arithmetic actually 190, or does the test assert a number the corpus does not carry — recompute it from the files, not from the test. (b) `gDungeonReach` READS `dungeonAnchors[].hopsToSettlement` rather than re-walking the region graph. Confirm Plan C's `anchorDungeons` emits one row per anchored handle and serialises the unreachable case as `null` (never `Infinity`, which JSON cannot carry); then confirm the three distinct sentences — missing row, `null`, `> 2` — each have a test, because collapsing them is how a generator bug gets reported as a placement bug. (c) Does `dungeonDensityLines` print on EVERY run, including a run with zero dungeons? Should it? (d) Can `scaffoldDungeons` assign the same handle to two families across separate invocations, given `taken` is rebuilt per run? (e) Do all 60 records validate against `dungeon.schema.json` — run ajv over the directory and paste the count.

Apply findings as a NEW commit and re-run Step 9. End with `git branch --show-current && git log --oneline -1`.

---

### Task 7: The resolver, the committed resolved world and the review surface

The join is the moment fabric and civil become one document. Decision D5 is taken: `content/world/resolved/*.json` is **committed**, because that is what enables `G-SLOT-STABLE` — the byte comparison that actually catches a silent rebinding — and it gives a non-Node consumer (the Godot client) a readable artifact.

**Files:**
- Create: `content/world/resolved/continent-01..13.json`
- Create: `scripts/check_resolved.mjs`
- Create: `tools/asset-storybook/world-index.json`
- Create: `tools/asset-storybook/tests/world-index.test.mjs`
- Modify: `scripts/lib/resolve.mjs` (append `resolveCivil` and `gZoneOrder`, created in Task 2)
- Modify: `scripts/tests/resolve.test.mjs` (append, created in Task 2)
- Modify: `tools/asset-storybook/js/maps.mjs:17` (a `fetchJson`/`loadWorldIndex` pair beside `loadIndex`) and `:333` (the panel, immediately before `main.appendChild(section)`)
- Modify: `tools/asset-storybook/js/state.mjs:94` (add `WORLD_INDEX_URL` beside `MAPS_INDEX_URL`)
- Modify: `scripts/integration.sh:90` (the `resolved_drift` fn beside `spine_emit_drift`) and `:121` (its `run_section` line)
- Modify: `.github/workflows/ci.yml:107-111` (the step beside `check_spine_emit --check`)

**Interfaces:**
- Consumes (Plan A): `scripts/lib/places.mjs`'s `WORLD_DOC_KEYS` and the `PlaceZone` / `PlaceTown` / `PlaceCamp` / `PlaceRoad` typedefs; `resolveWorld({ spine, tree, descriptor, fabric, civil })`. Plan A's `resolveWorld` keeps producing the single legacy-shaped doc; this task produces the **per-continent** `ResolvedWorld` that Task 11 feeds it.
- Produces:
  - `export function resolveCivil({ fabric, handles, civil, dungeons }): { resolved: ResolvedWorld, problems: string[] }`
  - `export const RESOLVED_KEYS: readonly string[]` — the **seventeen** keys, in the one order every consumer asserts. Key order is load-bearing (`canonStringify` serialises insertion order), so this constant is the single statement of it and the tests below deep-equal against it rather than re-typing the list:
    ```js
    ResolvedWorld = {
      continent,
      // the five GEOGRAPHIC keys — basin-sheet.mjs dereferences
      // coastline.points (:181) and saltmire.polygon (:157, :249) and iterates
      // terrainPatches (:151, :198, :210) UNCONDITIONALLY. They are derived
      // from the fabric, never supplied by a civil record.
      coastline, river, saltmire, iceEdge, terrainPatches,
      zones: PlaceZone[], towns: PlaceTown[], camps: PlaceCamp[], roads: PlaceRoad[],
      landmarks: [...], dungeons: [...], instances: [...],
      relay, distances, seaLane, sheet,
    }
    ```
  - `export function gZoneOrder({ resolvedByContinent }): string[]` — R3's dense-permutation clause over the REGION order. Plan C's `gWorldOrder` carries the same clause for the handle ledgers and **cannot** carry this one: `order` is minted here, onto the resolved zones, and `content/schemas/fabric-file.schema.json` is `additionalProperties: false` on `regions[]` without an `order` key, so a fabric region carrying one would be schema-invalid. Same rule, same message string, asserted against the documents that actually hold the field. Wired into `checkWorldCivil` in Task 8 Step 4, which is where `resolvedByContinent` is first built.
  - CLI `node scripts/check_resolved.mjs --write | --check`
  - `G-SLOT-STABLE` failure text: `G-SLOT-STABLE: content/world/resolved/continent-03.json differs from the recomputed join — a record rebound without a commit saying so`
  - `G-ORDER` region failure text: `G-ORDER: c02 zone order is not a dense permutation of 0..2 — got [0, 1, 3]`

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/resolve.test.mjs`:

```js
import { resolveCivil, RESOLVED_KEYS, gZoneOrder } from "../lib/resolve.mjs";
import { execFileSync } from "node:child_process";

function worldParts(dir) {
  const w = loadCivil({ contentRoot: dir });
  return { fabric: w.fabric.c02, handles: w.ledgers.c02, civil: { pinned: w.pinned, bound: w.bound } };
}

test("resolveCivil emits every family in a fixed key order", () => {
  const { resolved, problems } = resolveCivil(worldParts(worldFixture()));
  assert.deepEqual(problems, []);
  // The order is asserted against RESOLVED_KEYS, not against a re-typed list:
  // one statement of a load-bearing order, and the literal below exists so a
  // reviewer can see what that order IS without opening the module.
  assert.deepEqual([...RESOLVED_KEYS], [
    "continent", "coastline", "river", "saltmire", "iceEdge", "terrainPatches",
    "zones", "towns", "camps", "roads", "landmarks",
    "dungeons", "instances", "relay", "distances", "seaLane", "sheet",
  ]);
  assert.deepEqual(Object.keys(resolved), [...RESOLVED_KEYS]);
});

test("the five geographic keys are DERIVED, so basin-sheet.mjs cannot throw", () => {
  // The failure this catches, concretely: emitting coastline/saltmire as null
  // reintroduces the `TypeError: Cannot read properties of undefined` that
  // Plan A Task 5 removed, and it surfaces two commits later as
  // `render-sheet --sheet cluster1` dying and G-RENDER-LOCK going red.
  const { resolved } = resolveCivil(worldParts(worldFixture()));
  assert.ok(Array.isArray(resolved.coastline?.points), "coastline.points must be an array");
  assert.ok(Array.isArray(resolved.saltmire?.polygon), "saltmire.polygon must be an array");
  assert.ok(Array.isArray(resolved.terrainPatches), "terrainPatches must be an array");
  for (const p of resolved.terrainPatches) assert.ok(Array.isArray(p.polygon));
});

test("a pinned town resolves to its pin, a bound landmark to its instance", () => {
  const { resolved } = resolveCivil(worldParts(worldFixture()));
  const town = resolved.towns.find((t) => t.id === "c-town-gildmark");
  assert.deepEqual(town.at, [137.2, 182.4]);
  assert.deepEqual(town.properties, ["deepwater-port"]);
  assert.deepEqual(town.coasts, ["wealdmarch-west"]);
  const lm = resolved.landmarks.find((l) => l.id === "c-lm-the-drowned-stair");
  assert.deepEqual(lm.at, [166.0, 172.0], "position comes from the FABRIC INSTANCE, never from the record");
  assert.equal(lm.region, "c02/r02");
  assert.equal(lm.sizeKm, 0.31);
});

test("the resolved world carries no key the record was forbidden to carry", () => {
  const { resolved } = resolveCivil(worldParts(worldFixture()));
  // Coordinates are legal HERE — the ban is on the AUTHORED record, not on
  // the join output. What must not appear is a derived relation value.
  const flat = JSON.stringify(resolved);
  for (const k of ["bearingDeg", "compass", "drift", "declared"])
    assert.equal(flat.includes(`"${k}"`), false, `${k} must not be serialised`);
});

test("a bound record whose handle has no instance is a problem, never a throw", () => {
  const dir = worldFixture({ overlayDir: "g-bind-dangling-handle" });
  const { resolved, problems } = resolveCivil(worldParts(dir));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /c-lm-the-drowned-stair: handle "c02\/karst\/h-dead" has no instance in fabric continent-02/);
  assert.equal(resolved.landmarks.length, 0);
});

test("gZoneOrder is green on a real resolveCivil output", () => {
  const { resolved } = resolveCivil(worldParts(worldFixture()));
  assert.deepEqual(gZoneOrder({ resolvedByContinent: { c02: resolved } }), []);
});

test("gZoneOrder reds on a gapped rank — the silent-disappearance failure R3 names", () => {
  // Built by hand, not via a fixture overlay, and deliberately so: resolveCivil
  // mints `order` as 0..n-1 by construction, so no input it accepts can produce
  // a gap. The failure being guarded against is a LATER hand edit or a partial
  // regeneration of a committed content/world/resolved/*.json — a surveyed zone
  // vanishing while every other gate stays green.
  const zones = [
    { id: "c02/r01", survey: "surveyed", order: 0 },
    { id: "c02/r02", survey: "surveyed", order: 1 },
    { id: "c02/r03", survey: "surveyed", order: 3 },
    { id: "c02/r04", survey: "reported", order: undefined },
  ];
  const problems = gZoneOrder({ resolvedByContinent: { c02: { continent: "c02", zones } } });
  assert.equal(problems.length, 1);
  assert.equal(problems[0],
    "G-ORDER: c02 zone order is not a dense permutation of 0..2 — got [0, 1, 3]");
});

test("gZoneOrder ignores reported zones, which carry no order at all", () => {
  const zones = [
    { id: "c02/r01", survey: "surveyed", order: 0 },
    { id: "c02/r02", survey: "reported" },
    { id: "c02/r03", survey: "reported" },
  ];
  assert.deepEqual(gZoneOrder({ resolvedByContinent: { c02: { continent: "c02", zones } } }), []);
});

test("resolveCivil is a pure function of its inputs — same in, byte-same out", () => {
  const a = JSON.stringify(resolveCivil(worldParts(worldFixture())).resolved);
  const b = JSON.stringify(resolveCivil(worldParts(worldFixture())).resolved);
  assert.equal(a, b);
});

test("G-SLOT-STABLE: --write then --check is green, and a hand edit reds it", () => {
  const dir = worldFixture();
  const run = (args) => {
    try { return { code: 0, out: execFileSync(process.execPath, [join(ROOT, "scripts/check_resolved.mjs"), ...args, "--content-root", dir], { encoding: "utf8" }) }; }
    catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
  };
  assert.equal(run(["--write"]).code, 0);
  assert.equal(run(["--check"]).code, 0);
  const p = join(dir, "world/resolved/continent-02.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc.towns[0].at = [1, 1];
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const red = run(["--check"]);
  assert.equal(red.code, 1);
  assert.match(red.out, /G-SLOT-STABLE: .*continent-02\.json differs from the recomputed join/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "resolveCivil|G-SLOT-STABLE|pinned town resolves|geographic keys|gZoneOrder" 'scripts/tests/*.test.mjs'`
Expected: FAIL with `does not provide an export named 'resolveCivil'` (the import of `gZoneOrder` from the same module fails in the same statement).

- [ ] **Step 3: Write `resolveCivil`**

Append to `scripts/lib/resolve.mjs` (its import block gains `import { createHash } from "node:crypto";` — the region ordering hashes each zone's canonical body):

```js
// The join. Fabric supplies POSITION AND SIZE; civil supplies MEANING. That
// split is the whole architecture: a record never states where it is, so a
// re-seed cannot leave it stating a position that stopped being true.
//
// Key order is load-bearing. check_spine_emit.mjs's canonStringify serialises
// Object.keys() in insertion order, so a reordered build changes bytes for no
// semantic reason and reds G-SLOT-STABLE on a no-op commit.
//
// The five GEOGRAPHIC keys are not decoration. `tools/mapforge/lib/basin-sheet.mjs`
// dereferences `geo.coastline.points` (:181) and `geo.saltmire.polygon` (:157,
// :249) UNCONDITIONALLY and iterates `geo.terrainPatches` (:151, :198, :210).
// Emitting them as null/[] reintroduces exactly the `TypeError: Cannot read
// properties of undefined` that Plan A Task 5 removed, and it surfaces as
// `render-sheet --sheet cluster1` dying, which reds G-RENDER-LOCK and Plan E's
// "render every sheet" step. So the resolver DERIVES them from the fabric.
export const RESOLVED_KEYS = Object.freeze([
  "continent", "coastline", "river", "saltmire", "iceEdge", "terrainPatches",
  "zones", "towns", "camps", "roads", "landmarks",
  "dungeons", "instances", "relay", "distances", "seaLane", "sheet",
]);

// Which lexicon types stand in for the two named single-feature keys, and
// which terrainKinds read as a drawn patch rather than a region fill. Both
// are data, not conditionals, so adding a kind is a one-line edit.
const SALTMIRE_TYPES = Object.freeze(["tidal-mire", "salt-marsh", "saltmire-pan"]);
const ICE_EDGE_TYPES = Object.freeze(["ice-divide", "outlet-glacier", "moraine-terminal"]);
const PATCH_TERRAIN_KINDS = Object.freeze([
  "upland", "rim", "bramble", "headland", "alkali-flat", "tidal-mire",
  "badlands", "karst-plateau", "lava-field", "scree",
]);

export function resolveCivil({ fabric, handles, civil, dungeons = [] }) {
  const problems = [];
  const out = {};
  for (const k of RESOLVED_KEYS) out[k] = k === "continent" ? (fabric?.continent ?? null) : [];
  out.relay = null; out.distances = null; out.seaLane = null; out.sheet = null;
  out.coastline = null; out.river = null; out.saltmire = null; out.iceEdge = null;

  if (!fabric) { problems.push("resolve: no fabric file for this continent"); return { resolved: out, problems }; }

  const byHandle = new Map();
  for (const inst of fabric.instances ?? []) if (inst.handle) byHandle.set(inst.handle, inst);
  const ledger = new Map((handles?.handles ?? []).map((h) => [h.handle, h]));

  // ── the five GEOGRAPHIC keys, derived from the fabric ────────────────────
  // basin-sheet.mjs dereferences coastline.points and saltmire.polygon
  // unconditionally and iterates terrainPatches. These are what keep it from
  // throwing, and they are DERIVED — no civil record supplies geometry.

  // coastline: the continent's own outer ring. The trunk polygon is simplified
  // from exactly this contour (G-TRUNK-AREA's +/-3% is what pins the two
  // together), so drawing the fabric ring here draws the same coast the chart
  // shows, at fabric resolution.
  out.coastline = fabric.outerRing
    ? { id: `f-coast-${fabric.continent}`, points: fabric.outerRing }
    : null;
  if (!out.coastline) problems.push(`resolve: fabric ${fabric.continent} has no outerRing — the sheet builders dereference coastline.points`);

  // river: the single largest flow-accumulation trace the fabric recorded.
  // One river per continent is a DRAWING decision, not a hydrology claim —
  // the rest are instances, and a sheet with thirteen equal rivers reads as
  // noise. `fabric.trunkRiver` is emitted by P6 as the highest-flowAcc chain.
  out.river = fabric.trunkRiver
    ? { id: `f-river-${fabric.continent}`, points: fabric.trunkRiver.points, name: fabric.trunkRiver.name ?? null }
    : null;

  // saltmire / iceEdge: the largest AREA instance of each named type set.
  // Both are single-feature keys in the doc shape, so "largest" is the rule
  // and it is deterministic because instance order is the handle total order.
  const largestArea = (types) => {
    let best = null;
    for (const i of fabric.instances ?? []) {
      if (!types.includes(i.type) || i.geometry.shape !== "area") continue;
      if (!best || i.sizeKm > best.sizeKm || (i.sizeKm === best.sizeKm && i.id < best.id)) best = i;
    }
    return best;
  };
  const mire = largestArea(SALTMIRE_TYPES);
  out.saltmire = mire ? { id: mire.id, name: null, polygon: mire.geometry.ring } : null;
  const ice = largestArea(ICE_EDGE_TYPES);
  out.iceEdge = ice ? { id: ice.id, points: ice.geometry.ring } : null;

  // terrainPatches: the region rings whose terrainKind reads as a drawn patch
  // rather than a background fill. Reported regions never contribute — they
  // carry terrainKind === null by construction (spec §6.4 extension 3).
  out.terrainPatches = (fabric.regions ?? [])
    .filter((r) => r.terrainKind && PATCH_TERRAIN_KINDS.includes(r.terrainKind))
    .map((r) => ({ id: `tp-${r.id.replace("/", "-")}`, terrainKind: r.terrainKind, polygon: r.ring }));

  out.zones = (fabric.regions ?? []).map((r) => ({
    id: r.id, name: r.title ?? r.id, order: null, levelBand: r.levelBand,
    terrainKind: r.terrainKind, town: (r.settlements ?? [])[0] ?? null,
    labelAt: r.labelAt ?? centroidOf(r.ring), polygon: r.ring,
    survey: r.survey, areaKm2: r.areaKm2, adjacent: r.adjacent ?? [],
    provenance: r.provenance ?? null,
  }));

  for (const { file, doc } of civil.pinned ?? []) {
    if ((doc.requires?.continent ?? fabric.continent) !== fabric.continent) continue;
    const row = {
      id: doc.id, name: doc.title, at: doc.pin.at,
      zone: regionAt({ fabric, at: doc.pin.at }),
      properties: doc.properties ?? [], coasts: doc.coasts ?? [],
      ...(doc.settlementRank ? { settlementRank: doc.settlementRank } : {}),
      ...(doc.plan ? { plan: doc.plan } : {}),
      source: file,
    };
    if (doc.kind === "town") out.towns.push(row);
    else if (doc.kind === "camp") out.camps.push(row);
    else out.landmarks.push({ ...row, region: row.zone, sizeKm: null, type: doc.requires?.landform ?? null });
  }

  for (const { doc } of civil.bound ?? []) {
    const handle = doc.bind?.handle;
    if (!handle || !handle.startsWith(fabric.continent + "/")) continue;
    const inst = byHandle.get(handle);
    if (!inst) {
      problems.push(`resolve: ${doc.id}: handle "${handle}" has no instance in fabric ${fabric.continent === null ? "?" : "continent-" + fabric.continent.slice(1)}`);
      continue;
    }
    out.landmarks.push({
      id: doc.id, name: doc.title, at: inst.geometry.at ?? inst.geometry.points?.[0] ?? null,
      region: inst.region, type: inst.type, sizeKm: ledger.get(handle)?.sizeKm ?? inst.sizeKm,
      handle, glyph: inst.glyph, properties: doc.properties ?? [],
      note: doc.lore?.note ?? null, labelAnchor: doc.lore?.labelAnchor ?? "north",
      prose: doc.prose,
    });
  }

  for (const d of dungeons) {
    const inst = byHandle.get(d.bind?.handle);
    if (!inst) continue;
    out.dungeons.push({
      id: d.id, name: d.title, at: inst.geometry.at ?? null, region: inst.region,
      family: d.family, entranceType: d.entranceType, floors: d.floors,
      levelBand: d.levelBand, handle: d.bind.handle, properties: [],
    });
  }

  // Texture: glyph and hit-test only, never a label and never prose.
  out.instances = (fabric.instances ?? []).filter((i) => !i.named)
    .map((i) => ({ id: i.id, type: i.type, at: i.geometry.at ?? null, glyph: i.glyph, sizeKm: i.sizeKm }));

  const cmp = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const k of ["zones", "towns", "camps", "landmarks", "dungeons", "instances", "terrainPatches"]) out[k].sort(cmp);

  // R3's third clause, applied to REGIONS. Plan A kept lore.order as the sort
  // key for its byte-identity invariant and Plan C's G-ORDER covers the handle
  // ledgers, which left the region ordering with no total order at all after
  // the redraw. The rule is the SAME one the ledgers use — (-area, contentHash)
  // — so the programme has one ordering discipline, not two, and the result is
  // a DENSE permutation of 0..n-1 that gZoneOrder (below) re-checks.
  const surveyed = out.zones.filter((z) => z.survey === "surveyed");
  surveyed
    .map((z) => ({ z, key: [-z.areaKm2, hashOfZone(z)] }))
    .sort((a, b) => (a.key[0] - b.key[0]) || (a.key[1] < b.key[1] ? -1 : a.key[1] > b.key[1] ? 1 : 0))
    .forEach(({ z }, n) => { z.order = n; });

  return { resolved: out, problems };
}

// ── G-ORDER, region half ───────────────────────────────────────────────────
// R3's third clause — the resulting order is a DENSE PERMUTATION of 0..n-1 —
// applied to the REGION order. Plan C's gWorldOrder carries clauses (1)-(3)
// for the handle ledgers and stops there on purpose: `order` is minted twenty
// lines above this comment, onto the RESOLVED zones, and
// content/schemas/fabric-file.schema.json is `additionalProperties: false` on
// regions[] without an `order` key, so a fabric region can never legally carry
// one. A gap here means a surveyed zone ceased to exist with every other gate
// green — the live defect R3 names — so it is a FAIL, not a warn.
//
// Reported zones are skipped: they are unsurveyed ground with no area to rank.
export function gZoneOrder({ resolvedByContinent }) {
  const problems = [];
  for (const [cont, doc] of Object.entries(resolvedByContinent ?? {}).sort()) {
    const surveyed = (doc?.zones ?? []).filter((z) => z.survey === "surveyed");
    if (surveyed.length === 0) continue;
    const ranks = surveyed.map((z) => z.order).sort((a, b) => a - b);
    if (!ranks.every((v, i) => v === i))
      problems.push(`G-ORDER: ${cont} zone order is not a dense permutation of ` +
                    `0..${surveyed.length - 1} — got [${ranks.join(", ")}]`);
  }
  return problems;
}

// The content hash a zone is ordered by: its id, area and ring, canonicalised.
// NOT lore.order — that field silently drops a region that lacks it and
// silently reorders duplicates (spec R3, and the live defect I-096 names).
function hashOfZone(z) {
  return "sha256:" + createHash("sha256")
    .update(JSON.stringify([z.id, z.areaKm2, z.polygon])).digest("hex");
}

function centroidOf(ring) {
  if (!Array.isArray(ring) || !ring.length) return null;
  let x = 0, y = 0;
  for (const [px, py] of ring) { x += px; y += py; }
  return [Math.round((x / ring.length) * 100) / 100, Math.round((y / ring.length) * 100) / 100];
}

// Which region owns a point. Ray casting over the region ring; the fabric's
// cell partition guarantees exactly one owner, so the first hit is the answer.
function regionAt({ fabric, at }) {
  for (const r of fabric.regions ?? []) {
    const ring = r.ring ?? [];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > at[1]) !== (yj > at[1]) && at[0] < ((xj - xi) * (at[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return r.id;
  }
  return null;
}
```

- [ ] **Step 4: Write the `--write` / `--check` CLI**

Create `scripts/check_resolved.mjs`:

```js
#!/usr/bin/env node
// G-SLOT-STABLE — the byte comparison that catches a SILENT REBINDING.
//
// content/world/resolved/*.json is committed (decision D5). It is the only
// file renderers read, so a record that quietly re-bound to a different
// handle would otherwise change what is drawn with no reviewable diff
// anywhere. This regenerates the join and byte-compares, exactly as
// check_spine_emit.mjs --check does for the node table.
//
//   node scripts/check_resolved.mjs --write   # regenerate
//   node scripts/check_resolved.mjs --check   # byte-compare, exit 1 on drift
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCivil, resolveCivil } from "./lib/resolve.mjs";
import { loadDungeons } from "./lib/dungeons.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes("--write");
  const check = argv.includes("--check");
  const rootIdx = argv.indexOf("--content-root");
  const contentRoot = rootIdx === -1 ? join(ROOT, "content") : resolve(argv[rootIdx + 1]);
  if (write === check) { console.error("usage: check_resolved.mjs --write | --check [--content-root <dir>]"); process.exit(2); }

  const world = loadCivil({ contentRoot });
  if (!world.present) { console.log("check-resolved: no content/world — skipped"); process.exit(0); }
  const { dungeons } = loadDungeons({ contentRoot });

  const outDir = join(contentRoot, "world/resolved");
  let drift = 0, written = 0;
  for (const [continent, fabric] of Object.entries(world.fabric).sort()) {
    const { resolved, problems } = resolveCivil({
      fabric, handles: world.ledgers[continent],
      civil: { pinned: world.pinned, bound: world.bound },
      dungeons: dungeons.filter((d) => (d.bind?.handle ?? "").startsWith(continent + "/")),
    });
    for (const p of problems) console.log(`PROBLEM ${p}`);
    const file = join(outDir, `continent-${continent.slice(1)}.json`);
    const bytes = JSON.stringify(resolved, null, 2) + "\n";
    if (write) { mkdirSync(outDir, { recursive: true }); writeFileSync(file, bytes); written++; continue; }
    const have = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (have !== bytes) {
      drift++;
      console.log(`G-SLOT-STABLE: content/world/resolved/continent-${continent.slice(1)}.json differs from the recomputed join — a record rebound without a commit saying so`);
    }
  }
  console.log(write ? `check-resolved: wrote ${written} files` : `check-resolved: ${Object.keys(world.fabric).length} continents, ${drift} drifted`);
  process.exit(drift ? 1 : 0);
}

main();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test --test-name-pattern "resolveCivil|G-SLOT-STABLE|pinned town resolves|geographic keys|pure function|gZoneOrder" 'scripts/tests/*.test.mjs'`
Expected: PASS — 10 tests.

- [ ] **Step 6: Generate the real resolved world**

Run:
```bash
node scripts/check_resolved.mjs --write
node scripts/check_resolved.mjs --check
ls content/world/resolved | wc -l
```
Expected: `check-resolved: wrote 13 files`, then `13 continents, 0 drifted`, then `13`.

- [ ] **Step 7: Wire the review surface**

Create `tools/asset-storybook/world-index.json`:

```json
{
  "version": 1,
  "note": "One row per committed content/world/resolved/continent-NN.json. The storybook's Places & Meaning panel reads this for its roster and the resolved files themselves for the counts. Kept in parity with content/world/resolved/ by tests/world-index.test.mjs — this is the owner rule (every produced artifact must be observable in a review surface) made mechanical for the civil layer, exactly as maps-index.json does it for sheets.",
  "continents": [
    { "id": "c02", "title": "Wealdmarch", "resolved": "content/world/resolved/continent-02.json", "register": "basin-anglic", "note": "The redrawn playable basin — every canon town, road and leg." }
  ]
}
```

(one row per continent; fill all 13 from the Domain primer's table.)

Create `tools/asset-storybook/tests/world-index.test.mjs`:

```js
// Plan D — Places & Meaning parity gate. Mirrors maps-index.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const index = JSON.parse(readFileSync(join(HERE, "..", "world-index.json"), "utf8"));

test("every continent row points at a resolved file that exists", () => {
  assert.ok(Array.isArray(index.continents) && index.continents.length > 0);
  for (const row of index.continents) {
    assert.match(row.id, /^c[0-9]{2}$/);
    assert.equal(row.resolved, `content/world/resolved/continent-${row.id.slice(1)}.json`);
    assert.ok(existsSync(join(REPO_ROOT, row.resolved)), `${row.resolved} does not exist on disk`);
  }
});

test("every committed resolved file has a row — a continent cannot hide", () => {
  const dir = join(REPO_ROOT, "content/world/resolved");
  const onDisk = readdirSync(dir).filter((f) => /^continent-\d\d\.json$/.test(f)).sort();
  const indexed = index.continents.map((r) => `continent-${r.id.slice(1)}.json`).sort();
  assert.deepEqual(indexed, onDisk);
});

test("each resolved file exposes the seventeen keys in RESOLVED_KEYS order", () => {
  // Byte-for-byte key order, not a set: canonStringify serialises insertion
  // order, so a reordered build changes the committed bytes for no semantic
  // reason and reds G-SLOT-STABLE on a no-op commit.
  const KEYS = [
    "continent", "coastline", "river", "saltmire", "iceEdge", "terrainPatches",
    "zones", "towns", "camps", "roads", "landmarks",
    "dungeons", "instances", "relay", "distances", "seaLane", "sheet",
  ];
  for (const row of index.continents) {
    const doc = JSON.parse(readFileSync(join(REPO_ROOT, row.resolved), "utf8"));
    assert.deepEqual(Object.keys(doc), KEYS, `${row.resolved} key order`);
    assert.ok(Array.isArray(doc.coastline?.points),
      `${row.resolved} has no coastline.points — basin-sheet.mjs dereferences it unconditionally`);
  }
});
```

Modify `tools/asset-storybook/js/maps.mjs` — add a `WORLD_INDEX_URL` fetch and append a panel below the sheet grid inside `mountMaps`, immediately before `main.appendChild(section);`:

```js
  // Plan D — Places & Meaning. The civil layer is an ARTIFACT: 41 pinned
  // places, 336 bound records, 60 dungeons and a relation set that no sheet
  // shows on its own. Owner rule (2026-08-15): if it is produced, it is
  // reviewable here.
  const world = await loadWorldIndex();
  if (world.length) {
    const h3 = document.createElement("h2");
    h3.textContent = "Places & Meaning (" + world.length + " landmasses)";
    section.appendChild(h3);
    const table = document.createElement("table");
    table.className = "grid world-table";
    const head = document.createElement("tr");
    for (const label of ["Landmass", "Register", "Regions", "Towns", "Landmarks", "Dungeons", "Authored prose"]) {
      const th = document.createElement("th");
      th.textContent = label;
      head.appendChild(th);
    }
    table.appendChild(head);
    for (const row of world) {
      const doc = await fetchJson(repoPath(row.resolved));
      if (!doc) continue;
      const tr = document.createElement("tr");
      const cells = [
        row.title, row.register, String(doc.zones.length), String(doc.towns.length),
        String(doc.landmarks.length), String(doc.dungeons.length),
        String(doc.landmarks.filter((l) => l.prose === "authored").length),
      ];
      for (const c of cells) {
        const td = document.createElement("td");
        td.textContent = c;
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    section.appendChild(table);
  }
```

with these two helpers next to `loadIndex`:

```js
async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (err) {
    console.warn("[asset-storybook] " + url + " unavailable:", err);
    return null;
  }
}

async function loadWorldIndex() {
  const doc = await fetchJson(WORLD_INDEX_URL);
  return Array.isArray(doc?.continents) ? doc.continents : [];
}
```

and `export const WORLD_INDEX_URL = "./world-index.json";` added to `tools/asset-storybook/js/state.mjs` beside `MAPS_INDEX_URL` (line 94).

- [ ] **Step 8: Add `check_resolved --check` to Gate 2 and CI**

Modify `scripts/integration.sh` — add beside `spine_emit_drift` (line 90):

```bash
# Plan D: G-SLOT-STABLE. content/world/resolved/*.json is committed (D5) and
# is the ONLY file renderers read; a silent rebinding changes what is drawn
# with no reviewable diff anywhere else.
resolved_drift() { node "$REPO_ROOT/scripts/check_resolved.mjs" --check; }
```

and a `run_section "content: resolved join --check" resolved_drift` line immediately after the existing `spine_emit_drift` section. Add the identical step to `.github/workflows/ci.yml` beside its `check_spine_emit --check` step.

- [ ] **Step 9: Verify everything, including the review surface in a browser**

Run:
```bash
npm test --prefix scripts
node --test 'tools/asset-storybook/tests/*.test.mjs'
node scripts/check_resolved.mjs --check
node scripts/check_content.mjs --only=spine
(cd colyseus-server && npm test -- mapDimensions)
(cd tools/asset-storybook && python3 -m http.server 6007) &
sleep 2 && open -a "Google Chrome" "http://localhost:6007/index.html#section-map-sheets"
```
Expected: all suites pass; the browser shows a **Places & Meaning** table with 13 rows and non-zero counts. Confirm the numbers by eye against `node scripts/check_content.mjs --only=spine | grep world-civil`. **Kill any stale server on 6007 first** (`lsof -ti:6007 | xargs kill`) — a stale static server has previously made a new storybook tab look missing.

- [ ] **Step 10: Commit**

```bash
git add scripts/lib/resolve.mjs scripts/check_resolved.mjs content/world/resolved scripts/tests tools/asset-storybook scripts/integration.sh .github/workflows/ci.yml
git commit -m "feat: civil resolver, committed resolved world and G-SLOT-STABLE"
git branch --show-current && git log --oneline -1
```

- [ ] **Step 11: Independent adversarial review, refactor and re-verify**

Reviewer brief:

> Review `git diff HEAD~1` against spec §5.1's join diagram, §8.5 and open decision D5. Attack: (a) is `resolveCivil` pure — does it read the filesystem, the clock, or module state anywhere? (b) `RESOLVED_KEYS` order is load-bearing; does `resolveCivil` ever build the object in a different order (spread, computed keys)? Prove with a byte comparison across two runs. (c) does `regionAt` handle a point exactly on a ring edge deterministically — construct the case. (d) does the storybook panel degrade silently when `world-index.json` 404s, matching `mountMaps`'s existing contract? (e) is `check_resolved.mjs --check` actually wired into BOTH Gate 2 and CI, or only one?

Apply findings as a NEW commit; re-run Step 9. End with `git branch --show-current && git log --oneline -1`.

---

### Task 8: G-MEANING and the authored relation set

This is the gate that changes the failure mode. F-045 was a *uniform 5x rescale* — it preserved every topological relation, every bearing, every rank — and it still stranded **33 prose claims across 10 content files**, each stamped `AMENDED-PENDING (I-095)`. The repo's own answer to a pure scale change was "defer a human re-voice". No gate ran, because no gate existed.

**Files:**
- Create: `content/world/relations/c01..c13.json` (13 files, ~45 relations)
- Create: `scripts/report_relation_coverage.mjs` (always exits 0)
- Create: `scripts/tests/fixtures/world/g-meaning-bearing/**`
- Modify: `content/world/manifest.json` (created by Plan C Task 1; this adds the `relations.coverageFloorPct` block)
- Modify: `scripts/integration.sh:90-121` (a `relation_coverage` report section beside the other `report_*` sections) and `.github/workflows/ci.yml:107-111` (the matching step)
- Modify: `scripts/lib/resolve.mjs` (append `gMeaning`, call it and Task 7's `gZoneOrder` from `checkWorldCivil`; created in Task 2)
- Modify: `scripts/tests/relations.test.mjs` (append, created in Task 1)

**Interfaces:**
- Consumes: Task 1's `checkRelations`; Task 7's `resolveCivil`.
- Produces: `export function gMeaning({ world, resolvedByContinent }): string[]`

**The relation census, stated honestly.** The design's token count (194 network-topology, 185 uniqueness, 32 bearing, 11 distance, 7 co-location, 6 betweenness) counts **tokens in prose**, not distinct machine-checkable claims. The authored set is **45 relations**: 30 on c02 (every claim `canon.md §4` and `§5` make about the basin, plus the 7 leg distances), and 15 spread across the other twelve landmasses from `docs/worldbuilding/A2-wider-world.md`. Every one carries a section citation; the line form is rejected by the schema.

- [ ] **Step 1: Write the c02 relation file**

Create `content/world/relations/c02.json`. This is the whole basin claim set, each row traceable to a sentence:

```json
[
  { "rel": "betweenness", "hub": "c-town-millcross", "minDegree": 4, "cite": "canon.md §4 \"Geography & trade logic\"", "note": "\"Millcross is the literal hub — every road elsewhere passes through or near it.\"" },
  { "rel": "bearing", "from": "c-town-millcross", "to": "c-lm-thornveil", "dir": "E", "toleranceDeg": 30, "cite": "canon.md §4 \"Geography & trade logic\"", "note": "\"Thornveil's bramble forest lies east of Millcross.\"" },
  { "rel": "bearing", "from": "c-town-millcross", "to": "c-lm-northern-icefield", "dir": "N", "toleranceDeg": 30, "cite": "canon.md §4 \"Geography & trade logic\"", "note": "\"The Northern Icefield lies further north past Millcross's expedition camp.\"" },
  { "rel": "bearing", "from": "c-town-millcross", "to": "c-town-rooktide", "dir": "S", "toleranceDeg": 30, "cite": "canon.md §4 \"Geography & trade logic\"", "note": "\"Rooktide sits inland, south of Millcross.\"" },
  { "rel": "bearing", "from": "c-lm-ashvale-front", "to": "c-town-cindervast", "dir": "NW", "toleranceDeg": 30, "cite": "canon.md §4 \"Geography & trade logic\"", "note": "\"Cindervast lies beyond Ashvale Front to the north-west.\"" },
  { "rel": "unique_in_scope", "subject": "c-town-gildmark", "property": "deepwater-port", "scope": "coast:wealdmarch-west", "cite": "canon.md §4 \"Geography & trade logic\"", "note": "\"Gildmark remains the only deepwater port on this coast and the land's only door to the sea.\" A second natural inlet voids the monopoly, the economy, the news-network rationale and the act-5 plot — while a slot binding resolves cleanly." },
  { "rel": "unique_in_scope", "subject": "c-lm-millcross-ford", "property": "cart-crossing", "scope": "continent:c02", "cite": "canon.md §4 \"Geography & trade logic\"", "note": "\"The only cart-crossing of the river that splits the land.\"" },
  { "rel": "not_connected_by_road", "a": "c-town-rooktide", "b": "road:war-road", "cite": "canon.md §4 \"Geography & trade logic\"", "note": "\"off the direct war road entirely\"" },
  { "rel": "connected_by_road", "a": "c-town-cindervast", "b": "c-lm-northern-icefield", "cite": "canon.md §4 \"Geography & trade logic\"", "note": "\"they are holding both ends of the same road\"" },
  { "rel": "connected_by_road", "a": "c-town-millcross", "b": "c-town-gildmark", "cite": "canon.md §4 \"Geography & trade logic\"" },
  { "rel": "connected_by_road", "a": "c-town-embervale", "b": "c-town-norhollow", "cite": "canon.md §4 \"Geography & trade logic\"", "note": "\"sister towns on either side of the river\"" },
  { "rel": "colocated_with", "subject": "c-lm-millcross-ford", "host": "c-town-millcross", "withinKm": 1.5, "cite": "canon.md §4 \"Geography & trade logic\"", "note": "The town's NAME is a river fact — mill + crossing." },
  { "rel": "colocated_with", "subject": "c-lm-expedition-camp", "host": "c-town-millcross", "withinKm": 4.0, "cite": "canon.md §4 \"Geography & trade logic\"", "note": "\"Millcross's expedition camp\"" },
  { "rel": "colocated_with", "subject": "c-lm-gildmark-head", "host": "c-town-gildmark", "withinKm": 3.0, "cite": "docs/worldbuilding/A1-geography-cluster1.md §4 \"The coast\"" },
  { "rel": "adjacency", "a": "c02/r-millcross-ford", "b": "c02/r-thornveil", "cite": "docs/worldbuilding/A1-geography-cluster1.md §4 \"The basin\"" },
  { "rel": "adjacency", "a": "c02/r-emberdown", "b": "c02/r-hollowmarch", "cite": "docs/worldbuilding/A1-geography-cluster1.md §4 \"The basin\"" },
  { "rel": "adjacency", "a": "c02/r-meltwash-terrace", "b": "c02/r-northern-icefield", "cite": "docs/worldbuilding/A1-geography-cluster1.md §4.2 \"The terrace\"" },
  { "rel": "distance", "a": "c-town-millcross", "b": "c-town-gildmark", "km": 17, "tolerancePct": 8, "cite": "content/spine/edges.json e-leg-millcross-gildmark" },
  { "rel": "distance", "a": "c-town-millcross", "b": "c-town-rooktide", "km": 10.9, "tolerancePct": 8, "cite": "content/spine/edges.json e-leg-millcross-rooktide" },
  { "rel": "distance", "a": "c-town-millcross", "b": "c-town-embervale", "km": 9.7, "tolerancePct": 8, "cite": "content/spine/edges.json e-leg-millcross-embervale" },
  { "rel": "distance", "a": "c-town-embervale", "b": "c-town-norhollow", "km": 7.1, "tolerancePct": 8, "cite": "content/spine/edges.json e-leg-embervale-norhollow" },
  { "rel": "distance", "a": "c-town-embervale", "b": "c-town-gildmark", "km": 14.1, "tolerancePct": 8, "cite": "content/spine/edges.json e-leg-embervale-gildmark" },
  { "rel": "distance", "a": "c-town-norhollow", "b": "c-town-gildmark", "km": 18.6, "tolerancePct": 8, "cite": "content/spine/edges.json e-leg-norhollow-gildmark" },
  { "rel": "distance", "a": "c-town-cindervast", "b": "c-town-rooktide", "km": 34, "tolerancePct": 8, "cite": "content/spine/edges.json e-leg-cindervast-rooktide" },
  { "rel": "colocated_with", "subject": "c-lm-the-meltwash-mouth", "host": "c-lm-the-saltmire", "withinKm": 6.0, "cite": "docs/worldbuilding/A1-geography-cluster1.md §4 \"Water\"", "note": "\"The Meltwash from the ice to the mire\" — the river's seaward end is the mire's, and both are c02. NOT the Peatrun Coast: that is a Coldreach (c03) place, A2 §2, and a colocation across two landmasses is a claim the prose never makes." },
  { "rel": "bearing", "from": "c-town-gildmark", "to": "c-lm-the-saltmire", "dir": "E", "toleranceDeg": 40, "cite": "docs/worldbuilding/A1-geography-cluster1.md §5.1 \"The trade road\"", "note": "the trade road bends around the mire's head" },
  { "rel": "bearing", "from": "c-town-millcross", "to": "c-lm-eastern-hills", "dir": "E", "toleranceDeg": 40, "cite": "docs/worldbuilding/A1-geography-cluster1.md §4 \"The eastern rise\"" },
  { "rel": "unique_in_scope", "subject": "c-town-cindervast", "property": "fallen-city", "scope": "continent:c02", "cite": "canon.md §4 \"Geography & trade logic\"" },
  { "rel": "betweenness", "hub": "c-town-embervale", "minDegree": 2, "cite": "canon.md §4 \"Geography & trade logic\"" },
  { "rel": "not_connected_by_road", "a": "c-lm-the-saltmire", "b": "road:trade-road-trunk", "cite": "docs/worldbuilding/A1-geography-cluster1.md §5.1 \"The trade road\"", "note": "the road goes AROUND the mire's head, never through it" }
]
```

Then the twelve other files. `content/world/relations/c03.json` is the pattern for the sparse landmasses:

```json
[
  { "rel": "unique_in_scope", "subject": "c-town-tallowquay", "property": "lane-terminus", "scope": "continent:c03", "cite": "docs/worldbuilding/A2-wider-world.md §2 \"The charted ports\"" },
  { "rel": "colocated_with", "subject": "c-lm-coldreach-shore", "host": "c-town-tallowquay", "withinKm": 8.0, "cite": "docs/worldbuilding/A2-wider-world.md §2 \"The charted ports\"" },
  { "rel": "bearing", "from": "c-lm-the-trade-wind-landfall", "to": "c-town-tallowquay", "dir": "E", "toleranceDeg": 45, "cite": "canon.md §4 \"Geography & trade logic\"", "note": "\"Coldreach is the far end of the trade wind. Six days out, masters log reported, not surveyed.\"" }
]
```

Write `c01`, `c04`-`c13` the same way — 1 to 3 relations each, every one citing a sentence in `A2-wider-world.md` that already exists. `c01.json` may be `[]` if the polar cap's prose makes no positional claim; an empty array is a legitimate, reviewable statement.

- [ ] **Step 1b: Make the unmodelled remainder a NUMBER, not an unknown**

`G-MEANING`'s promise — *"a re-seed is accepted only when it reports zero unresolved drifts"* — is only as strong as the declared set, and 45 relations against the design's census of **435 n-ary claim tokens** is a coverage claim nobody has measured. A silently voided uniqueness claim (the Gildmark monopoly, the sharpest case in the whole spec) is exactly what an unmeasured set hides. So the remainder becomes a printed number, in the always-exit-0 discipline `scripts/report_season1.mjs` already proves.

Create `scripts/report_relation_coverage.mjs`:

```js
#!/usr/bin/env node
// scripts/report_relation_coverage.mjs — how much of the prose's n-ary claim
// surface the relation layer actually models.
//
// ALWAYS EXITS 0. This is a REPORT, not a gate: a coverage floor that fails
// the build would be gamed by writing thin relations, and the number is
// useful precisely because it is allowed to be uncomfortable. The floor lives
// in content/world/manifest.json as `relations.coverageFloorPct` and the
// report says LOW when it is missed, so the debt is visible on every run.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STORY = ["canon.md", "lore.json", "quests.json", "dialogue.json",
               "events.json", "arcs.json", "regions.json", "bible.md"];

// The six claim classes and the design's own grep vocabulary (§4.1). These
// patterns are the MEASUREMENT — changing one changes the denominator, so
// they are committed here and never tuned to make a number look better.
const CLASSES = [
  { id: "network",   re: /\b(road|route|lane|spur|crossroads?|ford|port|harbour|gate)\b/gi },
  { id: "unique",    re: /\b(only|sole|nearest|largest|first|last)\b/gi },
  { id: "bearing",   re: /\b(north|south|east|west|north-?east|north-?west|south-?east|south-?west)\b/gi },
  { id: "distance",  re: /\b\d+\s?(km|kilometres?|miles?|days?['\u2019]? (?:walk|ride|sail))\b/gi },
  { id: "colocated", re: /\b(beneath it|at the mouth|borders the|sits on|stands over)\b/gi },
  { id: "between",   re: /\b(hub|between|passes through|midway)\b/gi },
];
// Which relation `rel` values model which class.
const MODELS = {
  network: ["connected_by_road", "not_connected_by_road"],
  unique: ["unique_in_scope"],
  bearing: ["bearing"],
  distance: ["distance"],
  colocated: ["colocated_with"],
  between: ["betweenness", "adjacency"],
};

const storyText = STORY
  .map((f) => join(ROOT, "content/story", f))
  .filter(existsSync)
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");

const found = Object.fromEntries(CLASSES.map(({ id, re }) =>
  [id, (storyText.match(re) ?? []).length]));

const relDir = join(ROOT, "content/world/relations");
const relations = existsSync(relDir)
  ? readdirSync(relDir).filter((f) => f.endsWith(".json")).sort()
      .flatMap((f) => JSON.parse(readFileSync(join(relDir, f), "utf8")))
  : [];
const modelled = Object.fromEntries(Object.entries(MODELS).map(([cls, rels]) =>
  [cls, relations.filter((r) => rels.includes(r.rel)).length]));

const manifest = existsSync(join(ROOT, "content/world/manifest.json"))
  ? JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8")) : {};
const floor = manifest.relations?.coverageFloorPct ?? null;

let totalFound = 0, totalModelled = 0;
for (const { id } of CLASSES) {
  totalFound += found[id];
  totalModelled += modelled[id];
  console.log(`relation-coverage: ${id} ${modelled[id]}/${found[id]}`);
}
const pct = totalFound === 0 ? 100 : Math.round((totalModelled / totalFound) * 1000) / 10;
console.log(`relation-coverage: TOTAL ${totalModelled}/${totalFound} (${pct}%)`);
if (floor !== null)
  console.log(`relation-coverage: floor ${floor}% — ${pct >= floor ? "MET" : "LOW"}`);
console.log(`relation-coverage: ${relations.length} relations across ${
  existsSync(relDir) ? readdirSync(relDir).filter((f) => f.endsWith(".json")).length : 0} files`);
```

Add the floor to the manifest (Plan C Task 1 owns the file; this is a Plan D amendment to it, recorded in Plan D's file structure):

```jsonc
  "relations": {
    "coverageFloorPct": 10,
    "why": "The design counts 435 n-ary claim TOKENS in prose, not distinct machine-checkable claims — a paragraph naming a road four times is four tokens and one relation. 45 relations is the honest first pass and 10% is the floor below which the relation layer has stopped tracking the prose. Raise it as the set grows; never lower it to make a run green."
  }
```

Wire it into Gate 2 and CI beside the season-1 report, so the number appears in every release log:

```bash
# scripts/integration.sh — next to the existing report_* sections
relation_coverage() { node "$REPO_ROOT/scripts/report_relation_coverage.mjs"; }
run_section "content: relation coverage (report)" relation_coverage
```

```yaml
      # .github/workflows/ci.yml, beside the Season 1 budget report
      - name: Relation coverage (report)
        run: node scripts/report_relation_coverage.mjs
```

Run it and paste the output into the phase report:

```bash
node scripts/report_relation_coverage.mjs
```
Expected shape (the numbers are what they are — this step's deliverable is that they EXIST):
```
relation-coverage: network 6/194
relation-coverage: unique 9/185
relation-coverage: bearing 12/32
relation-coverage: distance 7/11
relation-coverage: colocated 6/7
relation-coverage: between 5/6
relation-coverage: TOTAL 45/435 (10.3%)
relation-coverage: floor 10% — MET
relation-coverage: 45 relations across 13 files
```

- [ ] **Step 2: Write the failing test**

Append to `scripts/tests/relations.test.mjs`:

```js
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gMeaning } from "../lib/resolve.mjs";
import { loadCivil, resolveCivil } from "../lib/resolve.mjs";
import { worldFixture, runWorldGate } from "./resolve.test.mjs";

const REPO = pathResolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("every committed relation carries a SECTION citation, never a line number", () => {
  const dir = join(REPO, "content/world/relations");
  let n = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    for (const r of JSON.parse(readFileSync(join(dir, f), "utf8"))) {
      n++;
      assert.doesNotMatch(r.cite, /canon\.md:\d/, `${f}: ${r.cite} is a line citation`);
      assert.ok(r.cite.length > 5, `${f}: empty citation`);
    }
  }
  assert.ok(n >= 40, `expected >= 40 authored relations, found ${n}`);
});

test("G-MEANING is silent when the resolved world agrees with every claim", () => {
  const dir = worldFixture();
  const world = loadCivil({ contentRoot: dir });
  const byCont = { c02: resolveCivil({ fabric: world.fabric.c02, handles: world.ledgers.c02, civil: { pinned: world.pinned, bound: world.bound } }).resolved };
  assert.deepEqual(gMeaning({ world, resolvedByContinent: byCont }), []);
});

test("G-MEANING red: names the relation, the citation and the drifted value", () => {
  const dir = worldFixture({ overlayDir: "g-meaning-bearing" });
  const world = loadCivil({ contentRoot: dir });
  const byCont = { c02: resolveCivil({ fabric: world.fabric.c02, handles: world.ledgers.c02, civil: { pinned: world.pinned, bound: world.bound } }).resolved };
  const p = gMeaning({ world, resolvedByContinent: byCont });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-MEANING: relation bearing\(c-town-gildmark → c-lm-the-drowned-stair\) declared E \+\/-30 deg, resolved ENE \(74 deg\) — cited at canon\.md §4 "Geography & trade logic"; re-voice the prose or re-pin the place$/);
});

test("G-MEANING blocks the gate, so a re-seed cannot promote with unresolved drift", () => {
  const r = runWorldGate(worldFixture({ overlayDir: "g-meaning-bearing" }));
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL {2}G-MEANING: relation bearing/);
});
```

Create `scripts/tests/fixtures/world/g-meaning-bearing/world/relations/c02.json`:

```json
[
  { "rel": "unique_in_scope", "subject": "c-town-gildmark", "property": "deepwater-port", "scope": "coast:wealdmarch-west", "cite": "canon.md §4 \"Geography & trade logic\"" },
  { "rel": "bearing", "from": "c-town-gildmark", "to": "c-lm-the-drowned-stair", "dir": "E", "toleranceDeg": 30, "cite": "canon.md §4 \"Geography & trade logic\"" }
]
```

(Gildmark is at `[137.2, 182.4]` and the Drowned Stair resolves to `[166.0, 172.0]`: `atan2(28.8, 10.4)` = 70.1... deg — confirm the exact printed value when the test first runs and pin the assertion to it rather than guessing.)

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test --test-name-pattern "G-MEANING|SECTION citation" 'scripts/tests/*.test.mjs'`
Expected: FAIL with `does not provide an export named 'gMeaning'`.

- [ ] **Step 4: Write G-MEANING**

Append to `scripts/lib/resolve.mjs`, and call it from `checkWorldCivil` last, after the dungeon block:

```js
import { checkRelations } from "./relations.mjs";

// G-MEANING — the gate the whole three-tier design exists to make possible.
//
// After every join, re-derive each authored claim from the NEW ground and FAIL
// on mismatch, naming the relation, the citation and the drifted value. The 33
// AMENDED-PENDING markers in the corpus exist precisely because no such gate
// ran during F-045, a strictly easier transform. A re-seed is accepted only
// when this reports zero drifts; otherwise the flagged records queue for human
// re-voicing BEFORE promote (decision D3).
export function gMeaning({ world, resolvedByContinent }) {
  if (!world.present) return [];
  const problems = [];
  const byCont = new Map();
  for (const r of world.relations) {
    const cont = (r.file.match(/relations\/(c\d\d)\.json$/) ?? [])[1] ?? null;
    if (!cont) continue;
    if (!byCont.has(cont)) byCont.set(cont, []);
    byCont.get(cont).push(r);
  }
  for (const [cont, relations] of [...byCont.entries()].sort()) {
    const resolved = resolvedByContinent[cont];
    if (!resolved) {
      for (const r of relations)
        problems.push(`G-MEANING: ${cont} has ${relations.length} relations but no resolved world — cited at ${r.cite}`);
      continue;
    }
    const { drifts } = checkRelations({ relations, resolved, fabric: world.fabric });
    for (const d of drifts)
      problems.push(`G-MEANING: relation ${describe(d, relations)} ${d.message} — cited at ${d.cite}; re-voice the prose or re-pin the place`);
  }
  return problems;
}

const describe = (drift, relations) => {
  const R = relations.find((x) => x.cite === drift.cite && x.rel === drift.rel) ?? {};
  if (R.rel === "bearing") return `bearing(${R.from} → ${R.to})`;
  if (R.rel === "distance") return `distance(${R.a} ↔ ${R.b})`;
  if (R.rel === "adjacency") return `adjacency(${R.a} ↔ ${R.b})`;
  if (R.rel === "betweenness") return `betweenness(${R.hub})`;
  if (R.rel === "colocated_with") return `colocated_with(${R.subject} @ ${R.host})`;
  if (R.rel === "unique_in_scope") return `unique_in_scope(${R.subject} "${R.property}")`;
  return `${R.rel}(${R.a} ↔ ${R.b})`;
};
```

and in `checkWorldCivil`, build the resolved map first:

```js
  const resolvedByContinent = {};
  for (const [cont, fabric] of Object.entries(world.fabric)) {
    const { resolved, problems } = resolveCivil({
      fabric, handles: world.ledgers[cont],
      civil: { pinned: world.pinned, bound: world.bound },
      dungeons: dungeonSet.dungeons.filter((d) => (d.bind?.handle ?? "").startsWith(cont + "/")),
    });
    for (const p of problems) fail(p);
    resolvedByContinent[cont] = resolved;
  }
  // G-ORDER's region half (Task 7's gZoneOrder) is wired HERE and not in Task 7,
  // because this loop is the first place in checkWorldCivil where the resolved
  // documents exist. It runs before gMeaning so a vanished zone is reported as
  // a broken ordering rather than as a pile of unresolvable relation subjects.
  for (const p of gZoneOrder({ resolvedByContinent })) fail(p);
  for (const p of gMeaning({ world, resolvedByContinent })) fail(p);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test --test-name-pattern "G-MEANING|SECTION citation" 'scripts/tests/*.test.mjs'`
Expected: PASS — 4 tests.

- [ ] **Step 6: Run G-MEANING against the real world and triage every drift**

Run: `node scripts/check_content.mjs --only=spine 2>&1 | grep G-MEANING`

Expected: some drifts. **Each one is a decision, not a nuisance.** For each: either re-pin the place (edit `pinned-roster.json`, re-expand, regenerate the fabric in Task 10) or re-voice the prose (Plan E's job — record the record id and the citation in `docs/superpowers/plans/` handoff notes and mark the relation `"note"` with `AMENDED-PENDING (Plan E)`). **Do not loosen a tolerance to make a drift disappear**; a tolerance change needs its own reasoned commit and shows up in the reviewer's diff.

- [ ] **Step 7: Verify and commit**

Run:
```bash
npm test --prefix scripts
node scripts/check_resolved.mjs --check
node scripts/check_content.mjs --only=spine
(cd colyseus-server && npm test -- mapDimensions)
git add content/world/relations scripts/lib/resolve.mjs scripts/tests
git commit -m "feat: G-MEANING and the authored relation set"
git branch --show-current && git log --oneline -1
```

- [ ] **Step 8: Independent adversarial review, refactor and re-verify**

Reviewer brief:

> Review `git diff HEAD~1` against spec §5.3, §4.1 and risk R1. Attack: (a) `describe()` re-finds the relation by `(cite, rel)` — what happens when two relations share both? Construct it from the committed `c02.json` and say whether the message names the wrong pair. (b) Does `gMeaning` re-resolve the world on every call, and does that fit Gate 1's ~4 s budget at 13 continents — measure with `time node scripts/check_content.mjs --only=spine` and paste the number. (c) Is every committed relation's subject an id the resolver actually emits, or do some name spine node ids that no longer exist? (d) Count the committed relations and check the claim of >= 40 against the file contents.

Apply findings as a NEW commit; re-run Step 7's commands.

---

### Task 9: G-BAND — difficulty rises with distance from the starter capital

**Files:**
- Create: `scripts/tests/fixtures/world/g-band-inversion/**`
- Modify: `scripts/lib/resolve.mjs` (append `gBand`, `LEVEL_RINGS`, `STARTER_CAPITAL`; created in Task 2)
- Modify: `scripts/tests/resolve.test.mjs` (append, created in Task 2)

**Interfaces:**
- Consumes: Plan C's fabric `regions[].levelBand` and `regions[].ring`; Task 6's dungeon `levelBand`.
- Produces:
  - `export const LEVEL_RINGS: ReadonlyArray<[number, number]>` — the nine bands
  - `export const STARTER_CAPITAL = "c-town-gildmark"`
  - `export function ringOfDistance({ km }): number`
  - `export function gBand({ world, resolvedByContinent, dungeons }): string[]`

The rule is distance from the **single** starter capital, not the nearest capital: nearest-capital permits a high-band region sitting between two low-band ones, which is a materially weaker guarantee. Adjacent rings overlap by 2 levels so no ring is a wall, and the ceiling of 80 matches the committed corpus exactly (`n-cindervast` is `[65,80]`, `n-meltwash-terrace` is `[1,10]`).

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/resolve.test.mjs`:

```js
import { gBand, LEVEL_RINGS, ringOfDistance, STARTER_CAPITAL } from "../lib/resolve.mjs";

test("nine rings, 40 km apart, both bounds strictly increasing, ceiling 80", () => {
  assert.equal(LEVEL_RINGS.length, 9);
  assert.deepEqual(LEVEL_RINGS[0], [1, 10]);
  assert.deepEqual(LEVEL_RINGS[8], [58, 80]);
  for (let i = 1; i < LEVEL_RINGS.length; i++) {
    assert.ok(LEVEL_RINGS[i][0] > LEVEL_RINGS[i - 1][0], `ring ${i} lower bound`);
    assert.ok(LEVEL_RINGS[i][1] > LEVEL_RINGS[i - 1][1], `ring ${i} upper bound`);
    assert.ok(LEVEL_RINGS[i][0] < LEVEL_RINGS[i - 1][1], `ring ${i} must overlap ring ${i - 1} so no ring is a wall`);
  }
  assert.equal(STARTER_CAPITAL, "c-town-gildmark");
  assert.equal(ringOfDistance({ km: 0 }), 0);
  assert.equal(ringOfDistance({ km: 39.9 }), 0);
  assert.equal(ringOfDistance({ km: 40 }), 1);
  assert.equal(ringOfDistance({ km: 9999 }), 8);
});

test("G-BAND is silent on the green fixture", () => {
  const dir = worldFixture();
  const world = loadCivil({ contentRoot: dir });
  const byCont = { c02: resolveCivil({ fabric: world.fabric.c02, handles: world.ledgers.c02, civil: { pinned: world.pinned, bound: world.bound } }).resolved,
                   c10: resolveCivil({ fabric: world.fabric.c10, handles: world.ledgers.c10, civil: { pinned: world.pinned, bound: world.bound } }).resolved };
  assert.deepEqual(gBand({ world, resolvedByContinent: byCont, dungeons: [] }), []);
});

test("G-BAND red: a far region banded below a nearer one", () => {
  const dir = worldFixture({ overlayDir: "g-band-inversion" });
  const world = loadCivil({ contentRoot: dir });
  const byCont = { c02: resolveCivil({ fabric: world.fabric.c02, handles: world.ledgers.c02, civil: { pinned: world.pinned, bound: world.bound } }).resolved,
                   c10: resolveCivil({ fabric: world.fabric.c10, handles: world.ledgers.c10, civil: { pinned: world.pinned, bound: world.bound } }).resolved };
  const p = gBand({ world, resolvedByContinent: byCont, dungeons: [] });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-BAND: region c10\/r01 levelBand\[0\] 2 < 46 at ring 5 — bands must be non-decreasing in distance from Gildmark$/);
});

test("G-BAND red: a dungeon band that does not overlap its host region's", () => {
  const dir = worldFixture();
  const world = loadCivil({ contentRoot: dir });
  const byCont = { c02: resolveCivil({ fabric: world.fabric.c02, handles: world.ledgers.c02, civil: { pinned: world.pinned, bound: world.bound } }).resolved };
  const p = gBand({ world, resolvedByContinent: byCont,
    dungeons: [{ id: "dungeon-strays", bind: { handle: "c02/karst/h-0f42" }, levelBand: [70, 80] }] });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-BAND: dungeon-strays band \[70, 80\] does not overlap host region c02\/r02 band \[15, 28\]$/);
});
```

Create `scripts/tests/fixtures/world/g-band-inversion/world/fabric/continent-10.json` — a copy of the base c10 fabric with its region's `levelBand` changed to `[2, 12]`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "G-BAND|nine rings" 'scripts/tests/*.test.mjs'`
Expected: FAIL with `does not provide an export named 'gBand'`.

- [ ] **Step 3: Write G-BAND**

Append to `scripts/lib/resolve.mjs`, called from `checkWorldCivil` after `gMeaning`:

```js
// G-BAND — difficulty rises with distance from the SINGLE starter capital.
// Nearest-capital would permit a high-band region sitting between two
// low-band ones; distance-from-Gildmark cannot. 40 km rings, nine of them,
// covering 0-360 km; adjacent rings overlap by 2 levels so no ring is a wall.
export const STARTER_CAPITAL = "c-town-gildmark";
export const RING_KM = 40;
export const LEVEL_RINGS = Object.freeze([
  [1, 10], [8, 20], [16, 30], [24, 40], [32, 50], [40, 58], [46, 64], [52, 70], [58, 80],
]);

export function ringOfDistance({ km }) {
  return Math.min(LEVEL_RINGS.length - 1, Math.floor(km / RING_KM));
}

export function gBand({ world, resolvedByContinent, dungeons = [] }) {
  if (!world.present) return [];
  const problems = [];

  let origin = null;
  for (const { doc } of world.pinned) if (doc.id === STARTER_CAPITAL) origin = doc.pin.at;
  if (!origin) return problems; // no starter capital pinned yet — nothing to measure from

  const regions = new Map();
  for (const f of Object.values(world.fabric)) for (const r of f.regions ?? []) regions.set(r.id, r);

  const centres = new Map();
  for (const resolved of Object.values(resolvedByContinent))
    for (const z of resolved.zones ?? []) if (z.labelAt) centres.set(z.id, z.labelAt);

  for (const [id, region] of [...regions.entries()].sort()) {
    const at = centres.get(id);
    if (!at || !Array.isArray(region.levelBand)) continue;
    const dx = at[0] - origin[0], dy = at[1] - origin[1];
    const ring = ringOfDistance({ km: Math.sqrt(dx * dx + dy * dy) });
    const floor = ring === 0 ? LEVEL_RINGS[0][0] : LEVEL_RINGS[ring - 1][0];
    if (region.levelBand[0] < floor)
      problems.push(`G-BAND: region ${id} levelBand[0] ${region.levelBand[0]} < ${floor} at ring ${ring} — bands must be non-decreasing in distance from Gildmark`);
  }

  for (const d of dungeons) {
    const h = world.handles.get(d.bind?.handle);
    const host = h ? regions.get(h.region) : null;
    if (!host || !Array.isArray(host.levelBand) || !Array.isArray(d.levelBand)) continue;
    const overlaps = d.levelBand[0] <= host.levelBand[1] && host.levelBand[0] <= d.levelBand[1];
    if (!overlaps)
      problems.push(`G-BAND: ${d.id} band [${d.levelBand[0]}, ${d.levelBand[1]}] does not overlap host region ${h.region} band [${host.levelBand[0]}, ${host.levelBand[1]}]`);
  }

  return problems;
}
```

with `for (const p of gBand({ world, resolvedByContinent, dungeons: dungeonSet.dungeons })) fail(p);` in `checkWorldCivil`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern "G-BAND|nine rings" 'scripts/tests/*.test.mjs'`
Expected: PASS — 4 tests.

- [ ] **Step 5: Verify against the real world, then commit**

Run:
```bash
npm test --prefix scripts
node scripts/check_content.mjs --only=spine 2>&1 | grep -c "G-BAND" || echo "0 G-BAND failures"
(cd colyseus-server && npm test -- mapDimensions)
git add scripts/lib/resolve.mjs scripts/tests
git commit -m "feat: G-BAND level rings from the starter capital"
git branch --show-current && git log --oneline -1
```

Any `G-BAND` failure against the real world is a **fabric** defect (Plan C banded a region wrong), not a gate defect. Record the count and the region ids in the phase report and file them to Plan C — do not band-aid them here.

- [ ] **Step 6: Independent adversarial review, refactor and re-verify**

Reviewer brief:

> Review `git diff HEAD~1` against spec §6.5's level-band paragraph and the shared contract's ring list. Attack: (a) do the nine committed rings match the contract's list character for character? (b) The gate compares against the PREVIOUS ring's floor, which is "one band of slack" — is that what the spec means, or does it mean the current ring's floor? Quote the spec. (c) `gBand` returns `[]` when no starter capital is pinned — is a silently disabled gate the right behaviour, or should it report? (d) Does a region exactly 40.0 km from Gildmark land in ring 1, and is the boundary tested?

Apply findings as a NEW commit; re-run Step 5.

---

### Task 10: Generator integration — pinned settlements first, bound dungeon entrances

Until this task, `G-PIN-SAT` fails 41 times on the real content root because no `pinReceipts` exist. This is where the pinned layer stops being a document and becomes a **generation input**: the 41 pinned records are placed at their committed seed points **before scoring begins**, and a constraint violation is a generation failure, not a join failure.

**Files:**
- Modify: `tools/mapforge/lib/passes/settlements.mjs` (P11 — append `placePinned` + `measureCell`; created by Plan C Task 9a, whose `placeSettlements` this task does NOT edit)
- Modify: `tools/mapforge/lib/passes/dungeons.mjs` (P13 — append `anchorBoundEntrances`; created by Plan C Task 9c)
- Modify: `content/world/manifest.json` (created by Plan C Task 1)
- Test: `tools/mapforge/tests/settlements-pinned.test.mjs`
- Test: `tools/mapforge/tests/dungeon-anchor.test.mjs`

**Interfaces:**
- Consumes (Plan C), **verbatim exported signatures — do not paraphrase them, the parameter lists are not interchangeable**:
  ```js
  runPasses({ manifest, premises, pinned = [], relations = [] })
  placeSettlements({ grid, premises, regions, manifest, pinned = [], stream, BIOME_NAME = null })
  anchorDungeons({ instances, regions, settlements, lexicon, manifest, stream })   // NO grid
  ```
  `placeSettlements` already takes `pinned` — this task does **not** add the parameter, it supplies the argument. What it passes is `placePinned`'s `placed` array (`{ id, title, at, cell, continent, region, rank }`), never a raw pinned record: Plan D owns resolving a pin to a cell and measuring the fabric under it, Plan C owns only the tier quota one of those pins consumes. `anchorDungeons` takes no `grid` at all — it works on the region adjacency graph — and it requires `settlements` and `lexicon`.
  Also from `tools/mapforge/lib/grid.mjs`: `FLAG`, `idx({ grid, cx, cy })`. From `tools/mapforge/lib/noise.mjs`: `q`.
- Produces (into Plan C's fabric writer):
  - `export function placePinned({ grid, pinned, cellKm }): { placed: Array<{ id, title, at, cell, continent, region, rank }>, receipts: Array<PinReceipt>, problems: string[] }`
    `rank` is `"capital" | "hub" | "village" | null`, taken from the record's `settlementRank`. It is the load-bearing field of the four: `placeSettlements` decrements the per-tier quota by it, so an omitted `rank` silently places three extra capitals. `title` carries the record's `title` through so the generated settlement row is not left nameless.
  - `export function measureCell({ grid, cell, cellKm }): PinReceipt["measured"]`
  - `export function anchorBoundEntrances({ instances, dungeons, lexicon }): { anchored: Array<{ dungeon, handle, instanceId }>, problems: string[] }`
  - `PinReceipt = { id, at: [number, number], cell: [number, number], continent: string, region: string, measured: { landform, waterKind, shelterFetchKm, depthM, slope, freshWaterWithinKm, biome, elevationM } }` — written into `content/world/fabric/continent-NN.json` as `pinReceipts[]`.

- [ ] **Step 1: Write the failing test for P11**

Create `tools/mapforge/tests/settlements-pinned.test.mjs`:

```js
// Plan D — P11 places the pinned layer FIRST.
//
// The ordering is the whole point. If pinned records were placed after the
// scored pass, the generator would already have spent the 60 km capital
// separation budget and a pinned capital could be rejected by its own rules.
// The design's phrase is "constraints are generation INPUTS, not post-hoc
// joins".
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGrid, FLAG, idx } from "../lib/grid.mjs";
import { placePinned, measureCell, placeSettlements } from "../lib/passes/settlements.mjs";

// A 40 x 40 toy grid at the real 0.5 km cell edge: 20 x 20 km of ground.
function toyGrid() {
  const g = makeGrid({ w: 40, h: 40, cellKm: 0.5 });
  for (let i = 0; i < g.elev.length; i++) { g.elev[i] = 0.6; g.moist[i] = 0.5; g.owner[i] = 0; }
  for (let i = 0; i < 40; i++) g.flags[i * 40] |= FLAG.SEA; // a west coast
  return g;
}

test("a pinned record lands on its committed cell, not on the scorer's choice", () => {
  const g = toyGrid();
  const pinned = [{ id: "c-town-gildmark", pin: { at: [2.25, 5.25], toleranceKm: 1.5 }, requires: { continent: "c02" } }];
  const r = placePinned({ grid: g, pinned, cellKm: 0.5 });
  assert.deepEqual(r.problems, []);
  assert.equal(r.placed.length, 1);
  assert.deepEqual(r.placed[0].cell, [4, 10]);
  assert.deepEqual(r.receipts[0].at, [2.25, 5.25]);
});

test("every pinned record gets a receipt with all eight measured fields", () => {
  const g = toyGrid();
  const r = placePinned({ grid: g, pinned: [{ id: "c-town-gildmark", pin: { at: [2.25, 5.25], toleranceKm: 1.5 }, requires: {} }], cellKm: 0.5 });
  assert.deepEqual(Object.keys(r.receipts[0].measured).sort(), [
    "biome", "depthM", "elevationM", "freshWaterWithinKm", "landform", "shelterFetchKm", "slope", "waterKind",
  ]);
});

test("a pin on a water cell is a GENERATION failure, named", () => {
  const g = toyGrid();
  const r = placePinned({ grid: g, pinned: [{ id: "c-town-gildmark", pin: { at: [0.25, 5.25], toleranceKm: 1.5 }, requires: {} }], cellKm: 0.5 });
  assert.equal(r.placed.length, 0);
  assert.match(r.problems[0], /^placePinned: c-town-gildmark at \[0\.25, 5\.25\] is a water cell — a pinned place cannot sit in the sea$/);
});

test("the scored pass honours the pinned separation budget instead of spending it", () => {
  const g = toyGrid();
  const pinnedResult = placePinned({ grid: g, pinned: [{ id: "c-town-gildmark", title: "Gildmark",
    settlementRank: "capital", pin: { at: [10.25, 10.25], toleranceKm: 1.5 }, requires: {} }], cellKm: 0.5 });
  // The FULL Plan C signature — `premises` is required and there is no
  // defaulted overload. Passing `pinnedResult.placed` (not the raw records) is
  // the contract: Plan C reads `.at`/`.cell`/`.rank` and throws a named
  // TypeError on anything else.
  const out = placeSettlements({
    grid: g,
    premises: [{ id: "c02", title: "Wealdmarch", class: "major",
                 footprint: { centreKm: [10, 10], radiiKm: [10, 10], warpKm: 0 },
                 palette: ["meadow"], landformKit: ["fluvial"], structures: [] }],
    manifest: { quotas: { settlements: { capital: 1, hub: 0, village: 2, total: 3 } } },
    regions: [{ id: "c02/r01", survey: "surveyed", continent: "c02" }],
    stream: "settle", pinned: pinnedResult.placed, BIOME_NAME: () => "meadow",
  });
  const gild = out.settlements.find((s) => s.id === "c-town-gildmark");
  assert.ok(gild, "the pinned capital must appear in the output, unmoved");
  assert.deepEqual(gild.atKm, [10.25, 10.25]);
  assert.equal(out.settlements.filter((s) => s.rank === "capital").length, 1,
    "the pinned capital consumes the capital quota — it is not placed twice");
  for (const s of out.settlements)
    if (s.id !== "c-town-gildmark") {
      const dx = s.atKm[0] - 10.25, dy = s.atKm[1] - 10.25;
      assert.ok(Math.sqrt(dx * dx + dy * dy) >= 9, `${s.id} violates the 9 km village separation from the pinned capital`);
    }
});

test("measureCell reads the grid, never a random", () => {
  const g = toyGrid();
  const a = measureCell({ grid: g, cell: [4, 10], cellKm: 0.5 });
  const b = measureCell({ grid: g, cell: [4, 10], cellKm: 0.5 });
  assert.deepEqual(a, b);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'tools/mapforge/tests/settlements-pinned.test.mjs'`
Expected: FAIL with `does not provide an export named 'placePinned'`.

- [ ] **Step 3: Implement P11's pinned pass**

Modify `tools/mapforge/lib/passes/settlements.mjs` — **add** `placePinned` and `measureCell`. `placeSettlements` itself is NOT changed here: Plan C Task 9a already declares `pinned = []`, already places it before pass 1, already seeds the separation occupancy from it and already decrements the matching rank quota. Adding a second pinned pass would be two functions resolving one pin, which is the failure the pinned tier exists to stop.

```js
// Plan D — P11 reads the pinned layer BEFORE it scores anything.
//
// The 41 pinned records are placed at their committed seed points, their
// constraint blocks are measured against the fabric, and a violation is a
// GENERATION failure rather than a join failure. Only then does the greedy
// scored placement fill the remaining slots AROUND them, which is why the
// 60 km capital / 24 km hub / 9 km village separations are honoured rather
// than spent before the pinned places are considered.
import { FLAG } from "../grid.mjs";
import { q } from "../noise.mjs";
import { idx } from "../grid.mjs";

// `idx` is IMPORTED from grid.mjs, not redeclared here — this module already
// imports it, and a second local definition with a different parameter shape
// (`{grid, cell}` vs `{grid, cx, cy}`) is a shadowing collision waiting for
// the first person who moves a line between the two halves of the file.

// EVERY read below is unguarded, deliberately. Plan C Task 2's makeGrid
// allocates landform, fetchKm, depthM, freshKm, biomeNames and regionIds, and
// P4/P6/P8/P9/P10 fill them. If one is missing this must be a loud TypeError
// on the first pinned record, not forty receipts of
// `{landform: null, shelterFetchKm: 0, depthM: 0, freshWaterWithinKm: 0}` —
// which G-PIN-SAT would either fail forty times for the wrong reason or, far
// worse, pass vacuously because 0 satisfies no declared minimum it can see.
export function measureCell({ grid, cell, cellKm }) {
  const i = idx({ grid, cx: cell[0], cy: cell[1] });
  const flags = grid.flags[i];
  return {
    landform: grid.landform[i] < 0 ? null : grid.landformNames[grid.landform[i]],
    waterKind: (flags & FLAG.SEA) ? "sea" : (flags & FLAG.LAKE) ? "lake" : (flags & FLAG.RIVER) ? "river" : "none",
    shelterFetchKm: q(grid.fetchKm[i]),
    depthM: q(grid.depthM[i]),
    slope: q(localSlope({ grid, cell })),
    freshWaterWithinKm: q(grid.freshKm[i]),
    biome: grid.biomeName(i),
    elevationM: q(grid.elevM(i)),
  };
}

function localSlope({ grid, cell }) {
  const [x, y] = cell;
  const at = (dx, dy) => grid.elev[Math.min(grid.h - 1, Math.max(0, y + dy)) * grid.w + Math.min(grid.w - 1, Math.max(0, x + dx))];
  const gx = (at(1, 0) - at(-1, 0)) / 2, gy = (at(0, 1) - at(0, -1)) / 2;
  return Math.sqrt(gx * gx + gy * gy);
}

export function placePinned({ grid, pinned, cellKm }) {
  const placed = [], receipts = [], problems = [];
  for (const rec of pinned) {
    const at = rec.pin.at;
    const cell = [Math.floor(at[0] / cellKm), Math.floor(at[1] / cellKm)];
    if (cell[0] < 0 || cell[1] < 0 || cell[0] >= grid.w || cell[1] >= grid.h) {
      problems.push(`placePinned: ${rec.id} at [${at[0]}, ${at[1]}] is outside the grid`);
      continue;
    }
    const i = idx({ grid, cx: cell[0], cy: cell[1] });
    if (grid.flags[i] & FLAG.SEA) {
      problems.push(`placePinned: ${rec.id} at [${at[0]}, ${at[1]}] is a water cell — a pinned place cannot sit in the sea`);
      continue;
    }
    const continent = rec.requires?.continent ?? null;
    const region = grid.regionId(i);
    placed.push({ id: rec.id, title: rec.title ?? rec.id, at, cell, continent, region,
                  rank: rec.settlementRank ?? null });
    receipts.push({ id: rec.id, at, cell, continent, region, measured: measureCell({ grid, cell, cellKm }) });
  }
  return { placed, receipts, problems };
}
```

`placeSettlements` needs **no edit for this** — Plan C already declares it as

```js
placeSettlements({ grid, premises, regions, manifest, pinned = [], stream, BIOME_NAME = null })
```

and already places `pinned` before scoring, marks each at its rank's separation radius and decrements that tier's quota. What this task supplies is the **argument**: the `placed` array above, not the raw records. Plan C's loop asserts that shape and throws a named `TypeError` on a raw record, so the two halves cannot silently disagree.

`receipts` reaches the committed bytes through Plan C **Task 10a**'s `buildFabricFile({ …, pinReceipts = [] })`, which serialises it as `pinReceipts[]` — a key `content/schemas/fabric-file.schema.json` (Plan C Task 11) already carries, with item `additionalProperties: false` and required `id, at, cell, continent, region, measured`. Plan C owns the file and the writer; **Plan D owns this array's shape**, which is why the `PinReceipt` typedef above is stated here in full rather than referenced. Plan C Task 10a's fabric-shape test asserts the key is present even when no pinned layer exists (an empty array, never a missing key), so `gPinSat`'s `f.pinReceipts ?? []` never silently reads `undefined` on a real fabric file.

- [ ] **Step 3b: Add the receipt-completeness test**

Append to `tools/mapforge/tests/settlements-pinned.test.mjs`:

```js
test("no receipt field is null or zero for a land pin — the grid arrays ARE populated", () => {
  // The failure this catches: measureCell reading a grid array Plan C never
  // allocated. Guarded reads would produce forty receipts of all-zeros and
  // G-PIN-SAT would either fail all forty for the wrong reason or pass
  // vacuously. Unguarded reads make it a loud TypeError instead — this test
  // is what proves the arrays exist rather than trusting the absence of a `?.`.
  const g = toyGrid();
  g.landform[idx({ grid: g, cx: 10, cy: 10 })] = 0;
  g.landformNames = ["river-terrace"];
  g.fetchKm[idx({ grid: g, cx: 10, cy: 10 })] = 8;
  g.depthM[idx({ grid: g, cx: 10, cy: 10 })] = -1;
  g.freshKm[idx({ grid: g, cx: 10, cy: 10 })] = 0.4;
  g.biomeNames = ["meadow"];
  g.regionIds = ["c02/r01"];
  const m = measureCell({ grid: g, cell: [10, 10], cellKm: 0.5 });
  assert.equal(m.landform, "river-terrace");
  assert.equal(m.shelterFetchKm, 8);
  assert.equal(m.freshWaterWithinKm, 0.4);
  assert.equal(m.biome, "meadow");
  assert.ok(m.elevationM > 0);
});

test("measureCell CRASHES rather than guessing when a grid array is missing", () => {
  const g = toyGrid();
  delete g.fetchKm;   // simulate a Plan C pass that forgot to fill it
  assert.throws(() => measureCell({ grid: g, cell: [10, 10], cellKm: 0.5 }), TypeError);
});
```

- [ ] **Step 4: Write and pass the P13 test**

Create `tools/mapforge/tests/dungeon-anchor.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorBoundEntrances } from "../lib/passes/dungeons.mjs";

const LEX = new Map([
  ["karst-cenote", { id: "karst-cenote", dungeonCapable: true }],
  ["coastal-drowned-valley", { id: "coastal-drowned-valley", dungeonCapable: false }],
]);
const INST = [
  { id: "lf-1", type: "karst-cenote", handle: "c02/karst/h-0f42", region: "c02/r02" },
  { id: "lf-2", type: "coastal-drowned-valley", handle: "c02/coastal/h-a1b2", region: "c02/r01" },
];

test("a bound entrance anchors onto its handle's instance", () => {
  const r = anchorBoundEntrances({ instances: INST, dungeons: [{ id: "dungeon-a", bind: { handle: "c02/karst/h-0f42" } }], lexicon: LEX });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.anchored, [{ dungeon: "dungeon-a", handle: "c02/karst/h-0f42", instanceId: "lf-1" }]);
});

test("anchoring onto a non-capable landform is a generation problem, not a silent pass", () => {
  const r = anchorBoundEntrances({ instances: INST, dungeons: [{ id: "dungeon-b", bind: { handle: "c02/coastal/h-a1b2" } }], lexicon: LEX });
  assert.equal(r.anchored.length, 0);
  assert.match(r.problems[0], /^anchorBoundEntrances: dungeon-b handle "c02\/coastal\/h-a1b2" is a "coastal-drowned-valley", which is not dungeonCapable$/);
});

test("a handle with no instance is named, never dropped", () => {
  const r = anchorBoundEntrances({ instances: INST, dungeons: [{ id: "dungeon-c", bind: { handle: "c02/karst/h-dead" } }], lexicon: LEX });
  assert.match(r.problems[0], /handle "c02\/karst\/h-dead" has no instance/);
});
```

Then implement in `tools/mapforge/lib/passes/dungeons.mjs`:

```js
// Plan D — P13 anchors the BOUND dungeon entrances and emits their handles.
// A door has to be a door: the lexicon's dungeonCapable flag is the only
// authority, and a violation is reported here rather than left for the gate,
// because the generator can still choose a different instance.
export function anchorBoundEntrances({ instances, dungeons, lexicon }) {
  const byHandle = new Map(instances.map((i) => [i.handle, i]));
  const anchored = [], problems = [];
  for (const d of [...dungeons].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const inst = byHandle.get(d.bind?.handle);
    if (!inst) { problems.push(`anchorBoundEntrances: ${d.id} handle "${d.bind?.handle}" has no instance`); continue; }
    if (!lexicon.get(inst.type)?.dungeonCapable) {
      problems.push(`anchorBoundEntrances: ${d.id} handle "${d.bind.handle}" is a "${inst.type}", which is not dungeonCapable`);
      continue;
    }
    anchored.push({ dungeon: d.id, handle: d.bind.handle, instanceId: inst.id });
  }
  return { anchored, problems };
}
```

- [ ] **Step 5: Update the manifest**

Modify `content/world/manifest.json` — set `names.reservedFile` to `"content/world/names/reserved.json"` and confirm `quotas.dungeons` reads `{ "complexes": 60, "floors": 190, "families": 3, "familySize": 8, "bespoke": 36 }`, matching the committed corpus that Task 6's test measures.

- [ ] **Step 6: Regenerate the world and prove G-PIN-SAT goes green**

Run:
```bash
node --test 'tools/mapforge/tests/*.test.mjs'
# No --out: the CLI already defaults to build/mapforge/<seed8>-<version>, so
# the run id is computed in ONE place. (`node -p "require(...version.mjs)"`
# would throw ERR_REQUIRE_ESM — tools/mapforge has no package.json and the
# module is ESM — and even if it resolved it would print a module object, so
# the glob below would promote an empty or wrong directory.)
node tools/mapforge/generate-world.mjs --seed 7c9e4a2f8b1d6e03 --no-png | tee /tmp/genw.log
RUN=$(grep -o 'build/mapforge/[^ ]*' /tmp/genw.log | head -1)
echo "run dir: $RUN"
node tools/mapforge/promote-world.mjs --from "$RUN" --dry-run
node tools/mapforge/promote-world.mjs --from "$RUN"
node scripts/check_resolved.mjs --write
node scripts/check_content.mjs --only=spine 2>&1 | grep -E "G-PIN-SAT|world-civil" | head -20
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: `world-civil: 41 pinned, 336 bound, 45 relations, ... handles` and **zero** `G-PIN-SAT` lines. `41` is the roster count Task 4 Step 1b pinned — a smaller number means a pinned record failed to expand, not that the gate is quiet. If a pinned record fails, the fix is either the roster's `pin.at` or the premise — never the tolerance.

- [ ] **Step 7: Commit**

```bash
git add tools/mapforge/lib/passes content/world/manifest.json content/world/fabric content/world/resolved tools/mapforge/tests
git commit -m "feat: P11 places pinned records first, P13 anchors bound entrances"
git branch --show-current && git log --oneline -1
```

- [ ] **Step 8: Independent adversarial review, refactor and re-verify**

Reviewer brief:

> Review `git diff HEAD~1` against spec §7.3 P11/P13 and the "HARD ORDERING" note. Attack: (a) does the pinned pass run before ANY scoring, or has it been slotted in after the capital pass? Read `placeSettlements` and say. (b) Does a pinned capital consume its rank's quota, or does the generator now emit 4 capitals against a quota of 3? (c) `measureCell` reads every grid array UNGUARDED, on purpose. Verify that Plan C's `makeGrid` really allocates `landform`, `landformNames`, `fetchKm`, `depthM`, `freshKm`, `biomeNames`, `regionIds` and the three accessors, and that P4 (`classifySea`), P6 (`carveWater`), P8 (`classifyBiomes`), P9 (`partitionRegions`) and P10 (`instanceLandforms`) each fill the one they own — name the line in each. Then run the real generator and dump one receipt: no field may be null for a land pin. A guarded read here would produce forty all-zero receipts and G-PIN-SAT would pass vacuously, which is the failure this design cannot afford. (d) Is `anchorBoundEntrances` deterministic in dungeon order? (e) Re-run `generate-world.mjs` twice into different scratch dirs and diff the fabric — does the pinned pass break `G-REPRO`?

Apply findings as a NEW commit; re-run Step 6.

---

### Task 11: The join cutover — `places.mjs` reads the resolved world

Plan A re-pointed the three gate joins and the sheet builders at `scripts/lib/places.mjs`, which still derives its document from the spine with a fallback branch. This task removes the fallback and makes `content/world/resolved/` the source. **The acceptance test is that the gates still COUNT records, not merely that they exit 0** — all three joins `return 0` when their load fails, so a botched re-home silently disables the gate rather than failing it.

**Files:**
- Modify: `scripts/lib/places.mjs` — `loadPlaces` body and the `resolveWorld` `fabric = null, civil = null` fallback branch (created by Plan A Task 5; no line to anchor to in today's tree, the file does not exist yet)
- Modify: `scripts/tests/places.test.mjs` (created by Plan A Task 5)
- Modify: `scripts/tests/resolve.test.mjs` (append, created in Task 2)
- Read-only consumer, NOT modified: `tools/mapforge/lib/basin-sheet.mjs:40` (`drawBasinSheet`), whose unguarded `geo.saltmire.polygon` (`:157`, `:249`) and `geo.coastline.points` (`:181`) are what Step 1's RENDER ASSERTION exercises
- Modify: `scripts/tests/zone-content.test.mjs:355,483,493,507`, `scripts/tests/town-plan.test.mjs:493,583,589`, `scripts/tests/bestiary-placement.test.mjs:95` — the three fixture roots that write ONLY the legacy mirror, migrated onto `content/world/resolved/` (Step 3b)
- Modify: `scripts/check_content.mjs:835`, `:981`, `:1203` — the three join failure messages still name the file Plan A deleted

**Interfaces:**
- Consumes (Plan A): `WORLD_DOC_KEYS`, `resolveWorld({ spine, tree, descriptor, fabric, civil })`, `loadPlaces({ contentRoot })`.
- Produces: `loadPlaces({ contentRoot })` now returns a doc merged from `content/world/resolved/*.json`; the `fabric = null, civil = null` fallback branch is deleted.

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/resolve.test.mjs`:

```js
import { loadPlaces, WORLD_DOC_KEYS } from "../lib/places.mjs";
import { drawBasinSheet } from "../../tools/mapforge/lib/basin-sheet.mjs";

test("loadPlaces reads content/world/resolved and keeps the load-bearing key order", () => {
  const { doc, problems } = loadPlaces({ contentRoot: join(ROOT, "content") });
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.keys(doc), [...WORLD_DOC_KEYS]);
});

test("the merged doc carries every continent's zones and towns", () => {
  const { doc } = loadPlaces({ contentRoot: join(ROOT, "content") });
  assert.ok(doc.zones.length >= 160, `expected >= 160 zones, got ${doc.zones.length}`);
  assert.ok(doc.towns.length >= 45, `expected >= 45 towns, got ${doc.towns.length}`);
});

test("the spine-derived fallback branch is gone", () => {
  const src = readFileSync(join(ROOT, "scripts/lib/places.mjs"), "utf8");
  assert.doesNotMatch(src, /fabric = null/, "the fallback signature must not survive");
  assert.doesNotMatch(src, /cluster1-geography/, "the legacy mirror must not be referenced");
});

test("a missing resolved dir is a PROBLEM, not a silent empty document", () => {
  const dir = mkdtempSync(join(tmpdir(), "no-resolved-"));
  const { doc, problems } = loadPlaces({ contentRoot: dir });
  assert.equal(doc, null);
  assert.match(problems[0], /content\/world\/resolved\/ holds no continent files/);
});

test("THE RENDER ASSERTION: drawBasinSheet survives the doc loadPlaces now returns", () => {
  // The failure this exists to stop: `loadPlaces` emitting coastline/river/
  // saltmire/iceEdge as null because ResolvedWorld "has no equivalent".
  // tools/mapforge/lib/basin-sheet.mjs dereferences `geo.saltmire.polygon`
  // at :157 (a clipPath) and :249 (the mire path) and `geo.coastline.points`
  // at :181 (the sea path) with NO guard at all — `geo.terrainPatches` at
  // :151 is `?? []`-guarded and is the one that would NOT have crashed. So a
  // null coastline or saltmire is a TypeError two commits later, surfacing as
  // `render-sheet --sheet cluster1` dying, which reds G-RENDER-LOCK and Plan
  // E Task 6's "render every sheet" step. Asserting KEY ORDER cannot catch
  // it; this asserts CONTENT, by rendering.
  const { doc } = loadPlaces({ contentRoot: join(ROOT, "content") });
  const { svg, problems } = drawBasinSheet({ doc });
  // A non-empty list here is a RESOLVER bug — most likely `regionAt` returning
  // null for a pin that fell outside every region ring, so a town names zone
  // "null". Fix resolveCivil; never relax this assertion.
  assert.deepEqual(problems, []);
  assert.match(svg, /^<svg /);
  assert.ok(svg.length > 4000, `the sheet is degenerate at ${svg.length} bytes`);
  // Proof the two UNGUARDED dereferences produced geometry rather than merely
  // not throwing: `clip-saltmire` is emitted from geo.saltmire.polygon, and
  // the sea path is built from geo.coastline.points.
  assert.match(svg, /<clipPath id="clip-saltmire"><path d="M/);
  assert.ok(doc.coastline.points.length >= 3, "the coastline has no course");
  assert.ok(doc.saltmire.polygon.length >= 3, "the saltmire has no outline");
});

test("THE COUNTING ASSERTION: the three gate joins still count records after the cutover", () => {
  const out = execFileSync(process.execPath, [join(ROOT, "scripts/check_content.mjs"), "--require-complete"], { encoding: "utf8" });
  const m = out.match(/content-gate: (\d+) sheets, (\d+) maps, (\d+) story, (\d+) placements, (\d+) zones, (\d+) towns, (\d+) nodes, (\d+) failures/);
  assert.ok(m, "the summary line must be present");
  assert.ok(Number(m[4]) > 0, "bestiary placements must still JOIN, not silently return 0");
  assert.ok(Number(m[5]) > 0, "zone records must still JOIN, not silently return 0");
  assert.ok(Number(m[6]) > 0, "town plans must still JOIN, not silently return 0");
  assert.equal(Number(m[8]), 0, "no failures");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "loadPlaces|fallback branch|RENDER ASSERTION|COUNTING ASSERTION" 'scripts/tests/*.test.mjs'`
Expected: FAIL — `loadPlaces` still reads the spine and the fallback signature is still present.

Note the direction of the new import: `scripts/tests/` → `tools/mapforge/lib/basin-sheet.mjs`. That is the same `scripts/ → tools/mapforge/` direction Plan B Task 9 introduces for `version.mjs`, and it is deliberate here for the same reason — the renderer is the consumer whose contract is being asserted, and the only honest way to assert "the sheet still draws" is to draw it. Confirm it resolves under `npm test --prefix scripts`, which runs from `scripts/` and not from the repo root.

- [ ] **Step 3: Rewrite `loadPlaces`**

Modify `scripts/lib/places.mjs` — replace the body of `loadPlaces` (and delete the `fabric = null, civil = null` fallback branch of `resolveWorld`) with:

```js
// Plan D cutover: the resolved world is the source. Until this commit,
// loadPlaces derived its document from the spine node table because
// content/world/ did not exist. It exists now, and deriving from two places
// is how the mirror problem started.
//
// KEY ORDER IS LOAD-BEARING: check_spine_emit.mjs's canonStringify serialises
// Object.keys() in insertion order and drops undefined-valued keys, so the doc
// is built by walking WORLD_DOC_KEYS, never by spreading.
export function loadPlaces({ contentRoot }) {
  const dir = join(contentRoot, "world/resolved");
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => /^continent-\d\d\.json$/.test(f)).sort() : [];
  if (!files.length)
    return { doc: null, problems: [`places: ${dir}/ holds no continent files — run node scripts/check_resolved.mjs --write`] };

  const problems = [];
  const merged = {};
  for (const k of WORLD_DOC_KEYS) merged[k] = null;
  merged.id = "atlas-world";
  merged.title = "The Atlas World";
  merged.version = 3;
  merged.source = "content/world/resolved/*.json";
  merged.about = "GENERATED FILE VIEW — the committed join of content/world/fabric (position and size) and content/world/civil (meaning). Never edited by hand; regenerate with scripts/check_resolved.mjs --write.";
  merged.coordinateSystem = { units: "km", convention: "x increases EAST, y increases SOUTH (north is smaller y)", extentKm: { width: 400, height: 400 } };
  const ARRAY_KEYS = ["terrainPatches", "zones", "towns", "camps", "roads"];
  for (const k of ["coastline", "river", "saltmire", "iceEdge", "terrainPatches", "zones", "towns", "camps", "roads", "relay", "distances", "seaLane", "sheet"])
    merged[k] = ARRAY_KEYS.includes(k) ? [] : null;

  for (const f of files) {
    let doc;
    try { doc = JSON.parse(readFileSync(join(dir, f), "utf8")); }
    catch (e) { problems.push(`places: world/resolved/${f}: ${e.message}`); continue; }
    for (const k of ARRAY_KEYS) merged[k].push(...(doc[k] ?? []));
    for (const k of ["relay", "distances", "seaLane", "sheet"]) if (doc[k] && !merged[k]) merged[k] = doc[k];
    // The four SINGLE-feature geographic keys. basin-sheet.mjs dereferences
    // coastline.points and saltmire.polygon unconditionally, so "first
    // continent that has one wins" is the merge rule and a world with none is
    // a reported PROBLEM, never a silent null the renderer trips over.
    for (const k of ["coastline", "river", "saltmire", "iceEdge"])
      if (doc[k] && !merged[k]) merged[k] = doc[k];
  }
  for (const k of ["coastline", "saltmire"])
    if (!merged[k]) problems.push(`places: no continent supplied "${k}" — tools/mapforge/lib/basin-sheet.mjs dereferences it unconditionally and will throw`);

  const out = {};
  for (const k of WORLD_DOC_KEYS) if (merged[k] !== undefined) out[k] = merged[k];
  return { doc: out, problems };
}
```

- [ ] **Step 3b: Migrate the three spine-less fixture suites onto the resolved world**

**This step is not optional and Step 5 will not pass without it.** Three gate test suites build a fixture content root containing ONLY `content/maps/cluster1-geography.json` — no `content/spine/`, no `content/world/`:

| File | Line | What it writes |
|---|---|---|
| `scripts/tests/zone-content.test.mjs` | `:355` | a mirror with a `zones` array |
| `scripts/tests/town-plan.test.mjs` | `:493` | a mirror with a `towns` array |
| `scripts/tests/bestiary-placement.test.mjs` | `:95` | a mirror with a `zones` array |

Plan A deliberately kept `loadPlaces`' fallback branch alive for exactly these three (its trap note and risk row A4 say so, and its Task 6 proved it with `npm test --prefix scripts`). **This task deletes that branch**, so after Step 3 those roots return `{ doc: null }`, the three joins at `check_content.mjs:816/955/1192` hit their `if (!zones) return 0` early-out, and every assertion that requires the FAIL to fire goes red — `zone-content.test.mjs:483`, `:493`, `:507` and `town-plan.test.mjs:583`, `:589`.

For each of the three, replace the `writeFileSync(join(dir, "content/maps/cluster1-geography.json"), …)` line with a writer that emits the same arrays in the `ResolvedWorld` shape, so **no other assertion in those files moves**:

```js
// scripts/tests/<each of the three>.test.mjs — the fixture writer.
// Same zones/towns arrays as the retired mirror carried; only the FILE and the
// two wrapper keys change, so every downstream assertion is untouched.
function writeResolvedFixture(dir, { zones = [], towns = [] }) {
  mkdirSync(join(dir, "content/world/resolved"), { recursive: true });
  writeFileSync(join(dir, "content/world/resolved/continent-02.json"),
    JSON.stringify({
      continent: "c02",
      coastline: { id: "f-coast-c02", points: [[0, 0], [10, 0], [10, 10]] },
      river: null, saltmire: null, iceEdge: null, terrainPatches: [],
      zones, towns, camps: [], roads: [], landmarks: [], dungeons: [],
      instances: [], relay: null, distances: null, seaLane: null, sheet: null,
    }, null, 2) + "\n");
}
```

Then, **in the same commit**, update the three gate messages and the five literal expectations that name the deleted file:

| Where | From | To |
|---|---|---|
| `check_content.mjs:835` | `zone "<id>" not in cluster1-geography.json#zones` | `zone "<id>" not in content/world/resolved#zones` |
| `check_content.mjs:981` | `… cluster1-geography.json#zones` | `… content/world/resolved#zones` |
| `check_content.mjs:1203` | `town "<id>" not in cluster1-geography.json#towns` | `town "<id>" not in content/world/resolved#towns` |
| `zone-content.test.mjs:483,493,507` | the three `/cluster1-geography\.json#zones/` matchers | `/content\/world\/resolved#zones/` |
| `town-plan.test.mjs:583,589` | the two `/cluster1-geography\.json#towns/` matchers | `/content\/world\/resolved#towns/` |

The messages must change **with** the fixtures, not after: a fixture writing the new file while the gate still names the old one is a green test asserting a string no user will ever see.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --test --test-name-pattern "loadPlaces|fallback branch|RENDER ASSERTION|COUNTING ASSERTION" 'scripts/tests/*.test.mjs'
node --test 'scripts/tests/zone-content.test.mjs' 'scripts/tests/town-plan.test.mjs' 'scripts/tests/bestiary-placement.test.mjs'
```
Expected: PASS on both — 6 tests in the first, and **the same pass count as the pre-task baseline** in the second. Record that baseline (`node --test 'scripts/tests/zone-content.test.mjs' … | tail -5`) BEFORE Step 3 and compare: three suites going silently green because their gate now early-outs is exactly the failure Step 3b exists to prevent, and it looks identical to success.

- [ ] **Step 4b: Make promotion write the resolved world — one command, not two**

Plan C's `promote-world.mjs` already lists `content/world/resolved` in its wholesale-replacement families (step 2), and `listFiles` returns `[]` for a directory that does not exist, so the loop has been a no-op until now. This step makes the draft actually carry one, so a re-seed cannot leave the **only file renderers read** stale behind a second command nobody remembers.

Two edits:

1. **`tools/mapforge/generate-world.mjs`** — after `runPasses` returns and before `writeRun`, build the join when a civil layer exists, and hand it to `writeRun` (whose `resolved` parameter Plan C Task 10b already accepts):

```js
  // The join lands in the DRAFT, so `build/mapforge/<runIdA>` and
  // `build/mapforge/<runIdB>` are diffable on MEANING as well as on ground.
  // Empty civil layer -> null -> writeRun skips the file, which is Plan C's
  // behaviour unchanged.
  const civil = loadCivil({ contentRoot: join(REPO_ROOT, "content"),
                            fabric: { fabric: run.fabric, handles: run.handles } });
  const resolved = civil.present
    ? Object.fromEntries(run.fabric.map((f) => {
        const ledger = run.handles.find((h) => h.continent === f.continent) ?? null;
        return [f.continent, resolveCivil({ fabric: f, handles: ledger, civil,
                                            dungeons: civil.dungeons }).resolved];
      }))
    : null;
  const { files } = writeRun({ run, outDir, repoRoot: REPO_ROOT, sheets: draftSheets, resolved });
```

2. **`tools/mapforge/promote-world.mjs`** — the draft holds one `civil-resolved.json` keyed by continent; promotion fans it out to one file per continent so the committed layout matches D5's `content/world/resolved/continent-NN.json`. Immediately before the fabric/handles/resolved replacement loop:

```js
  // Fan the draft's single civil-resolved.json out to the committed per-
  // continent layout, into a staging dir the wholesale loop then reconciles.
  // Written BEFORE the loop so a stale continent-99.json from a previous seed
  // is deleted by the same set reconciliation that deletes stale fabric.
  const draftResolved = join(runDir, "civil-resolved.json");
  if (existsSync(draftResolved)) {
    const byContinent = readJson(draftResolved);
    const stage = join(runDir, "content/world/resolved");
    mkdirSync(stage, { recursive: true });
    for (const [cid, doc] of Object.entries(byContinent).sort(([a], [b]) => (a < b ? -1 : 1)))
      writeFileSync(join(stage, `continent-${cid.slice(1)}.json`), canonStringify(doc) + "\n");
  }
```

Extend `WORLD_DIGEST_INPUTS` — Plan C Task 12 already lists `content/world/resolved`, so `G-REPRO` property 3 hashes it. Add the fixpoint test to `tools/mapforge/tests/promote.test.mjs`:

```js
test("promoting twice leaves content/world/resolved clean", { timeout: 300000 }, () => {
  const repo = scratchRepo(), run = mkdtempSync(join(tmpdir(), "run-"));
  try {
    generateInto(run);
    promoteWorld({ repoRoot: repo, runDir: run });
    execFileSync("git", ["init", "-q"], { cwd: repo });
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"], { cwd: repo });
    promoteWorld({ repoRoot: repo, runDir: run });
    const dirty = execFileSync("git", ["status", "--porcelain", "content/world/resolved"],
      { cwd: repo, encoding: "utf8" });
    assert.equal(dirty, "", `the second promotion rewrote the resolved world:\n${dirty}`);
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(run, { recursive: true, force: true }); }
});
```

Verify:
```bash
node --test 'tools/mapforge/tests/promote.test.mjs' 'tools/mapforge/tests/repro.test.mjs'
```
Expected: `fail 0`. The point of this step in one line: **after a re-seed, `content/world/resolved/` is correct without anyone running a second command** — and `check_resolved.mjs --write` stays as the civil-only fast path for a commit that changes meaning but not ground.

- [ ] **Step 5: Run every harness end to end**

Run, and paste the output of each into the phase report:
```bash
npm ci --prefix scripts
npm test --prefix scripts      # the pass count must MATCH the pre-task baseline, not merely exit 0
node --test 'tools/mapforge/tests/*.test.mjs'
node --test 'tools/asset-storybook/tests/*.test.mjs'
node scripts/check_content.mjs --only=spine
node scripts/check_content.mjs --require-complete
node scripts/check_spine_emit.mjs --check
node scripts/check_resolved.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
./scripts/precheck.sh --no-install
./scripts/integration.sh --no-install
```
Expected: every one exits 0. Record `time node scripts/check_content.mjs --only=spine` — the budget is **under 4 s** and every gate this plan added has a per-gate ceiling in the spec's §8.3 table (G-PIN-SAT 0.05 s, G-MEANING 0.15 s, G-BIND 0.06 s, G-HANDLE-BAND 0.03 s, G-BAND 0.02 s, G-DUNGEON-REACH 0.02 s). Record `time npm test --prefix scripts` — budget 45 s, and **treat any regression above 60 s as a gate failure of its own**.

- [ ] **Step 6: Re-verify the review surface**

Run:
```bash
lsof -ti:6007 | xargs kill 2>/dev/null || true
(cd tools/asset-storybook && python3 -m http.server 6007) &
sleep 2 && open -a "Google Chrome" "http://localhost:6007/index.html#section-map-sheets"
```
Confirm by eye: the Map Sheets tab renders, and below it the **Places & Meaning** table shows 13 landmasses with the counts the gate printed. Kill the server afterwards.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/places.mjs scripts/tests
git commit -m "refactor: places.mjs reads the resolved world, fallback removed"
git branch --show-current && git log --oneline -1
```

- [ ] **Step 8: Independent adversarial review of the WHOLE plan's diff**

This is the plan-level gate, not a task-level one. Dispatch a fresh reviewer with:

> Review `git diff <the commit before Task 1>..HEAD` against `docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md` §5 in full and the shared contract's Plan D rows. Answer each with evidence, not reasoning: (1) does `G-MEANING` report ZERO unresolved drifts on the real content root — paste the grep. (2) Does `G-BIND` find no coordinate key outside the pinned tier and no shared handle — paste the count of bound records scanned. (3) Is `G-HANDLE-BAND` green on all 336? (4) Is `G-DUNGEON-REACH` green on all 60, and does the corpus total 190 floors? (5) Is `G-PIN-SAT` green on all 41? (6) Has any commit in this range changed a spawn id, spawn rectangle, live map id or runtime coordinate — run `git diff <base>..HEAD -- colyseus-server content/spine/frozen-spawn-ids.json content/maps/atlas-frontier.md` and report. (7) Is `colyseus-server/src/tests/mapDimensions.test.ts` green? (8) Does `time node scripts/check_content.mjs --only=spine` stay under 4 s and `time npm test --prefix scripts` under 60 s? (9) Is every artifact this plan produces reachable in the asset-storybook? (10) Name the single weakest thing in this diff and say what would break first in production.

- [ ] **Step 9: Refactor on the findings, then re-verify**

Apply every finding as a NEW commit (never `--amend`). Re-run the entire Step 5 block and Step 6. The plan is done when all of them exit 0 and the reviewer's ten answers are all evidenced.

Final phase report ends with:
```bash
git branch --show-current && git log --oneline -1
```

---

## Phase quality gates, in one place

Every task above ends with the same five steps, written into the task itself: **implement → verify by running the real command with visible output → independent adversarial review of that task's diff → refactor on the findings as a NEW commit → re-verify**. It is not a permission stop and it is not optional. The three tasks that touch gate semantics or the join — Task 2 (`G-BIND` + the call site), Task 8 (`G-MEANING`), Task 10 (the generator) — get the full per-task review even when batched with a neighbour.

Two budgets are themselves gates:

| Measurement | Budget | Fail at | Command |
| --- | ---: | ---: | --- |
| Gate 1 spine section | 4 s | 4 s | `time node scripts/check_content.mjs --only=spine` |
| The gate's own test suite | 45 s | 60 s | `time npm test --prefix scripts` |

## What is demonstrably true at the end that was not true at the start

| Before | After |
| --- | --- |
| Zero civil records; the only join authority is a legacy mirror | 41 pinned + 336 bound records, schema-validated, joined into 13 committed resolved files |
| Zero dungeons | 60 complexes / 190 floors, entrances proved cave-capable and within 2 region hops of a settlement |
| Zero machine-checkable prose claims (`grep -ri constraint` returns one comment) | 45 relations across 8 relation kinds, each citing a section, each re-derived from the ground on every gate run |
| A re-seed silently voids Gildmark's port monopoly while every binding resolves | `G-MEANING` names the relation, the citation and the drifted value, and blocks promote |
| An ordinal rank resolves cleanly across a 17.5x size swing | `G-HANDLE-BAND` fails on the swing |
| 120 name combinations against 626 names needed | 5 registers converging at 630 distinct names with register, sound and prosody gates |
| Nothing in the repo can say whether a pinned place got the ground its prose assumes | `G-PIN-SAT` compares 41 constraint blocks against committed fabric receipts in 0.05 s |
| The civil layer would be invisible to review | A Places & Meaning panel in the asset-storybook, parity-gated by `world-index.test.mjs` |


