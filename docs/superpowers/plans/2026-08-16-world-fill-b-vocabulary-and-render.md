# Vocabulary, Schemas and Render Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the repo a content vocabulary and a renderer that can draw the target world *before* the target world exists — a 170-type landform lexicon with four new JSON schemas, 20 biomes and 18 terrain kinds with a closed ink loop, 40 distinguishable glyph families, deterministic label decluttering with zoom tiers, and a baked-texture rasteriser — all proved on a synthetic sheet at full target density (13 landmasses, 160 regions, 1,740 glyphs, 340 labels) that renders with **zero** `G-BIOME-INK`, `G-GLYPH` and `G-LABEL` problems and rasterises in **≤ 2 s at 2000 px**, none of which is true at the start.

**Architecture:** Two halves with a hard boundary between them. The **vocabulary half** (Tasks 1–5) writes content-model artifacts — `content/world/lexicon/landforms.json`, three new schemas, a hoisted `content/spine/derived.json`, and the grown `BIOMES`/`TERRAIN_KINDS` vocabulary in `scripts/lib/spine.mjs` — and is the explicit handoff Plan C's fabric generator consumes. The **render half** (Tasks 6–12) adds four new pure modules under `tools/mapforge/lib/` (`glyphs.mjs`, `labels.mjs`, `texture-bake.mjs`, `version.mjs`), grows `draft.mjs`'s ink layer, and proves every capability on a committed synthetic fixture sheet before adopting it on the two live sheets in one final, separately-reviewed re-ink commit.

**Tech Stack:** Node ESM (`.mjs`), zero dependencies under `tools/mapforge/` (pure `node`); `ajv` + `sharp` under `scripts/` (its own `package.json`, `npm ci --prefix scripts`); `node --test` for map tooling (**a file LIST, never a bare directory** — quoted glob locally on Node >= 22, UNQUOTED shell-expanded glob in CI, which is pinned to Node 18; see Process); jest for `colyseus-server`; `rsvg-convert` (librsvg) for rasterisation.

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
- 13 landmasses, 3 oceans, 9 seas, 160 regions = 40 surveyed + 120 reported, 45 settlements (3 capital / 12 hub / 30 village), 8 town plans, 60 dungeon complexes / 190 floors (3 families x 8 + 36 bespoke), **170** distinct landform types / **178** group memberships / 8 dual-listed, 1,740 instances / 336 named, 20 biomes, 18 terrain kinds, 626 distinct names.
- **Why 170 and not the spec's 164.** **Six ids name real, place-forming ground the 164-row draft had no id for**, and they divide into two halves with two different consumers.
  **Three are cited by a named row of Plan D's pinned roster** (Task 4 Step 2), and each one replaced an id that was wrong or unsatisfiable there: `headland` for `c-lm-gildmark-head` (a cliffed promontory, not `marine-terrace`'s flat bench), `ford` for `c-lm-millcross-ford` (the crossing point, not `braided-channel`'s line of bars), and `sea-waterfall` for `c-lm-brightfall-leap` — that last one is not a nicety, because `knickpoint-gorge` requires `nearFlag: RIVER` and biomes `river,rock` and therefore can NEVER be satisfied at a cell that also satisfies the row's `water.kind: "sea"`, which is a `G-PIN-SAT` failure by construction.
  **Three are fabric-generator vocabulary**, needed by Plan C's instance placement for two continents' structural ideas and cited by no pinned record: `ice-shelf` for c01 Rimewall Cap (floating shelf ice over sea — every glacial id in the draft is grounded ice or its debris), and `ash-front` + `ash-plain` for c10 Ashen Spar (the tephra-fall margin, which is the group's only edge form, and the walkable tephra plain — every other volcanic area id is `lava` or `caldera`). Without them an arc continent's ash ground has no form to draw and c01's seaward margin renders as moraine.
  A record cannot bind to a type that does not exist, and inventing an id downstream would put the vocabulary in two files. Plan B owns the lexicon, so the six are added HERE and the census is re-run: 164 + 6 = **170** types, 172 + 6 = **178** memberships, dual-listed unchanged at **8** (all six are single-group), `dungeonCapable` unchanged at **23**, glyph families unchanged at **40** (each new row reuses its own group's existing glyph, so `G-GLYPH`'s no-two-groups-share-a-mark rule is untouched), groups unchanged at **12**. 170 sits inside `budgets.landforms` `minTypes 100 / maxTypes 200` with no cap change.
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

---

## Deviations from the shared contract, argued (read before Task 1)

Four, all deliberate. Each is stated here so a reviewer does not have to discover it in a diff.

**D-B1 — Plan B ADDS `alsoGroups` to the lexicon row.** The shared contract's row carries a single `"group": "karst"` string, but the census requires **170 distinct types across 178 group memberships with 8 dual-listed**. One string cannot express 178 memberships over 170 rows. Plan B owns `content/schemas/landform-type.schema.json`, so it adds `"alsoGroups": string[]` (default `[]`, `maxItems: 1` — every dual listing in the spec is a pair, never a triple). `group` stays the **primary** key and is what `G-GLYPH`'s group-uniqueness is computed over; `alsoGroups` is a query tag only. Memberships = 170 + 8 = 178, checked by test.

**D-B4 — the lexicon ships 170 types, not the spec's 164.** Six ids name ground no 164-row id covered. **Three are bound by a named pinned record** — `headland` (`c-lm-gildmark-head`), `ford` (`c-lm-millcross-ford`) and `sea-waterfall` (`c-lm-brightfall-leap`, whose previous `knickpoint-gorge` was unsatisfiable beside `water.kind: "sea"` and would have failed `G-PIN-SAT`). **Three are fabric-generator vocabulary with no pinned citation** — `ice-shelf` (c01's floating seaward margin), `ash-front` and `ash-plain` (c10's tephra margin and plain, the arc's only edge form and its only non-`lava`/`caldera` area). They are added to the lexicon in Task 1 with the census re-run (see Global Constraints and Task 1 Step 4b), rather than invented in Plan D, because a vocabulary with two homes is the defect `requires.landform` exists to prevent. Everything downstream that quotes a census — Plan C's `G-WORLD-BUDGET` band, Plan D's `requires.landform` join test, the `world-budget: landforms <n> types` print line — reads 170/178/8/23/40/12.

**D-B2 — the dungeon-capable set is 23 types, not 18.** Spec §5.5 writes "**Dungeon-capable types (18):**" and then enumerates **23** names. The plan adopts the enumerated list (a plan must resolve an ambiguity, not carry it): cave, cenote, sinkhole, foiba, karst fenster, ponor, lava tube, fumarole vent, caldera floor, glacier cave, moulin, nunatak shelter, sea cave, sea arch, blowhole, gorge, plunge-pool undercut, slot canyon, hoodoo hollow, rift fissure, tectonic cave, yardang hollow, sub-lacustrine vent. `content/world/budgets.json` pins `landforms.dungeonCapableTypes: 23` and Task 1's test asserts it, so Plan D's 60 dungeons bind against a number that is written down.

**D-B3 — Task 12 changes the rendered bytes of `game-client/assets/art/maps/atlas-world.svg` and re-baselines `content/world/render-lock.json`.** Spec §9.1's migration invariant says every Phase 0–5 commit keeps the byte comparisons green *without re-baselining*. Spec §5.7 says, in the same document, that reconciling the ink loop "changes rendered legend output and **will** break `basin-baseline.svg` — which is fine". The two cannot both be literally true, so this plan pins the resolution:

> **The invariant protects the WORLD, not the DRAWING.** A commit may change how the map is *drawn* (legend, glyphs, label placement); it may not change what the map *says*. The mechanical form of that rule, asserted on every commit in Tasks 6–12: `node scripts/check_spine_emit.mjs --check` exits 0 with no drift (the 47 emitted files, including `colyseus-server/src/config/generated/mapDimensions.ts`), and `(cd colyseus-server && npm test -- mapDimensions)` is green.

Tasks 6–11 additionally hold the *live* sheets byte-identical (`node scripts/check_render_lock.mjs --check` green **without** `--write`) — every new capability is proved on the synthetic canary sheet first. **Task 12 is the single commit in this plan that re-baselines the lock**, and it does so with the SVG diff reviewed line by line.

---

## Domain primer — for an implementer who has never seen this repo

Read these files before Task 1, in this order. They are the whole context.

| Read | Why |
| --- | --- |
| `scripts/lib/spine.mjs:1-70` | the constants block: `TIER_DEPTH`, `BIOMES`, `TERRAIN_KINDS`, `TERRAIN_IMPLIES`, and the three pinned rules in the header comment |
| `scripts/lib/spine.mjs:193-233` | `loadSpine()` — the ONLY filesystem function in the library, and its soft-skip contract |
| `scripts/check_content.mjs:1536-1560` | `checkSpine()`'s opening: soft-skip, schema compile, `validNodes` |
| `scripts/check_spine_emit.mjs:24-75` | `canonStringify` + `canonicalNode` — the ONE byte format |
| `tools/mapforge/lib/draft.mjs:36-53, 165-246` | `FILL_FOR`, `TERRAIN_LEGEND`, `pat()`, `patternDefs()` — the entire ink layer today |
| `tools/mapforge/render-sheet.mjs:31-50` | the `SHEETS` registry — the single place a sheet exists |
| `tools/mapforge/lib/atlas-sheet.mjs:366-477` | the greedy vertical label stack `labels.mjs` replaces |

**The spine.** `content/spine/nodes/*.json` — today **44 files**, one JSON object per file, one **node** per object. A node is a named piece of the world with a `placement` (a polygon, rect or point in its parent's coordinate frame), a `composition` (percentages over the biome vocabulary), a `seed`, and a `tier`.

**Tier** is a *depth*, not a label (`spine.mjs:28-38`): `world`/`playroot` = 0, `continent`/`ocean`/`playspace`/`fixture` = 1, `region`/`sea` = 2, `town`/`site` = 3. A child's depth must be its parent's + 1. Two disjoint roots live in `content/spine/roots.json`: `n-atlas` (the *chart* — the drawn world) and `n-playroot` (the *runtime* — what the game server actually simulates). **Nothing in this plan touches the runtime root.**

**The `derived` block** is the computed half of a node: area, child area, coverage %, rolled-up composition, the absolute anchor, four seed streams, and a sha256 `digest` of all of it. It is **recomputed** by `deriveNode()` (`spine.mjs:460-486`) and **byte-compared** against the committed copy by the gate. Today it lives inline inside each node file; Task 4 hoists it to one sidecar file.

**A gate** is a named rule with an id like `G-POLY` or `G-OVERLAP`, implemented inside `scripts/check_content.mjs`, that pushes a one-line failure string into a module-level array and never throws. (An uncaught throw skips `finish()` and silently drops every failure recorded before it — that is why the rule is absolute.) Run all spine gates with:

```bash
node scripts/check_content.mjs --only=spine
```

**Gate 1** (`./scripts/precheck.sh --no-install`) is the per-feature ship check: pnpm install, contracts, server tsc + jest + prettier, nakama, react-client, art-forge tests, **asset-storybook tests**, combat-lab, and `check_content.mjs --only=spine`. **`--only=spine` is NOT a reduced gate set** — it calls the same `checkSpine()` and only skips the story/character/zone/town sweeps, so every new spine gate lands in Gate 1 automatically and Gate 1's ~4 s spine budget is a hard constraint on the whole new gate set.

**Gate 2** (`./scripts/integration.sh --no-install`) is the release check: everything above plus `check_content --require-complete`, story-graph drift, `check_spine_emit --check`, the map render checks, `node --test tools/mapforge/tests/*.test.mjs`, `npm test --prefix scripts`, story-explorer and art-forge.

**CI** (`.github/workflows/ci.yml`) is a **third, different list** — Gate 2 minus the mapforge tests, plus the asset-manifest gate and the storybook tests. Do not assume CI runs Gate 2.

**The sheets** are SVG maps drawn from the spine by `tools/mapforge/render-sheet.mjs`. Two exist: `cluster1` (the surveyed basin, drawn by `lib/basin-sheet.mjs`) and `atlas` (the whole 400 x 400 km world, drawn by `lib/atlas-sheet.mjs`). Both are committed under `game-client/assets/art/maps/` and both are byte-checked. A sheet builder **never throws**: it returns `{ svg, notes, problems }` and a non-empty `problems[]` is a hard failure at the CLI. `basin-sheet.mjs:199-202` is the pattern to copy.

**The asset-storybook** (`tools/asset-storybook/`) is a static review page. `maps-index.json` lists one row per `SHEETS` entry, and `tests/maps-index.test.mjs` fails in **both directions** if the two drift. Adding a sheet without indexing it reddens Gate 1.

### Exact commands

```bash
# spine gates (Gate 1 fast path)
node scripts/check_content.mjs --only=spine
node scripts/check_content.mjs --require-complete          # Gate 2 bar
node scripts/check_content.mjs --content-root /tmp/fixture # a fixture root

# the emitter (47 files: 44 nodes + 3 mirrors) — after Task 4, 48
node scripts/check_spine_emit.mjs --check
node scripts/check_spine_emit.mjs --write

# sheets
node tools/mapforge/render-sheet.mjs --sheet atlas --check
node scripts/check_render_lock.mjs --check                 # from Plan A
node scripts/check_render_lock.mjs --write                 # re-baseline (Task 12 ONLY)

# tests — a FILE LIST, never a bare directory.
# LOCAL (this worktree runs Node >= 22): quote the pattern and let Node expand it.
node --test 'tools/mapforge/tests/*.test.mjs'
node --test 'tools/asset-storybook/tests/*.test.mjs'
# CI and any `bash -e` harness step: DO NOT QUOTE — .github/workflows/ci.yml:34
# pins node-version 18, and Node-side --test glob patterns only exist from v22,
# so a quoted pattern reaches Node 18 as a literal path and runs ZERO tests
# (a green step proving nothing). The shell must do the expanding:
node --test tools/mapforge/tests/*.test.mjs
node --test tools/asset-storybook/tests/*.test.mjs
npm ci --prefix scripts && npm test --prefix scripts
(cd colyseus-server && npm test -- mapDimensions)

# the two harnesses
./scripts/precheck.sh --no-install                          # Gate 1
./scripts/integration.sh --no-install                       # Gate 2
```

### Traps this repo has actually hit

- **`node --test <dir>` fails on newer Node, and the fix is NOT one string.** Two different mechanisms are easy to conflate. Locally (Node >= 22) `node --test 'tools/mapforge/tests/*.test.mjs'` works because *Node* expands the pattern. In `.github/workflows/ci.yml` the same quoted string is a silent no-op: `ci.yml:34` pins `node-version: 18`, Node-side `--test` globbing landed in v22, so Node 18 treats the quoted pattern as a literal filename and either errors or runs zero tests. **In CI and in any `bash -e` harness step, drop the quotes so the SHELL expands the pattern** — which is exactly what the repo already does: `scripts/integration.sh:112` is `node --test "$REPO_ROOT"/tools/mapforge/tests/*.test.mjs` (pattern unquoted) and `scripts/package.json:6` is `node --test tests/*.test.mjs`. Copy those, never the quoted form, into a workflow file.
- **`tools/mapforge/` has NO `package.json` and NO dependencies.** Do not add one. If a dependency is genuinely needed it belongs under `scripts/` (`ajv`, `js-yaml`, `sharp` live there, installed with `npm ci --prefix scripts`). `tools/mapforge` imports `scripts/lib/spine.mjs` by relative path — that direction is established and fine.
- **Gate functions never throw; sheet builders never throw.** Errors return in-band.
- **`abs()` appears nowhere in the geometry.** A negative signed shoelace is a `G-POLY` failure, not a magnitude.
- **Gate soft-skip discipline is load-bearing.** `checkSpine` returns 0 before compiling any schema when `content/spine` is absent; `loadSpine` returns `present: false` with no errors for a missing spine dir; `check_spine_emit.mjs` skips mirrors a fixture root lacks. ~27 fixture roots under `scripts/tests/fixtures/spine/` depend on this. **A new gate that hard-fails on a missing `content/world/` will red dozens of existing tests.**
- **Test fixture helpers already exist — reuse them, never reinvent:** `spineFixture({ overlayDir, mutate })` and `runSpineGate(dir)` (`scripts/tests/spine-gates.test.mjs:212,222`), `realSpineCopy()` (`:180`), `runEmit(dir, args)` (`:173`). Note `spineFixture()` runs `check_spine_emit --write` on the fixture root to fill `derived` — Task 4 depends on that.
- **`prettier` runs on commit** via husky + lint-staged, but only on `colyseus-server/src/**/*.ts`. `.mjs` files under `scripts/` and `tools/` are not auto-formatted; match surrounding style by hand.

---

## File Structure

Every file this plan creates (`C`), modifies (`M`) or deletes (`D`). Nothing outside this table is touched.

### Vocabulary half (Tasks 1–5) — the Plan C handoff boundary

| Op | Path | Responsibility | Task |
| --- | --- | --- | ---: |
| C | `content/world/lexicon/landforms.json` | The 170-type flat array. `group` is the primary key column, `alsoGroups` the many-to-many tag (8 dual listings -> 178 memberships) | 1 |
| C | `content/schemas/landform-type.schema.json` | Lexicon row shape, `additionalProperties: false`, closed `requires` predicate vocabulary | 1 |
| C | `scripts/tests/landform-lexicon.test.mjs` | 170/178/8/23 census, glyph group-uniqueness, `requires` key closure, the six D-B4 additions, gloss rules | 1 |
| C | `content/schemas/landform-instance.schema.json` | Fabric instance shape (Plan C writes the records). `point`/`line`/`area`, `additionalProperties: false`, and `maxItems: 40` on every ring — G-VERTEX-BUDGET's landform tier. It does **not** check winding: a signed shoelace is not expressible in JSON Schema, and that half is Plan C Task 11 Step 5c's `gWorldInstanceGeometry` | 2 |
| M | `content/schemas/spine-node.schema.json:7,59,66` | Typed `features[]` item every existing feature validates against unchanged, plus nullable `type` citing a lexicon id; root `additionalProperties: false` | 2 |
| C | `scripts/tests/landform-instance-schema.test.mjs` | The instance schema accepts the three geometries and rejects a coordinate-free record, an unknown key, and a 41-point ring (`maxItems: 40`, G-VERTEX-BUDGET's landform tier). It does **not** claim to reject a negative-shoelace record — JSON Schema cannot evaluate winding; that is `gWorldInstanceGeometry`'s job in Plan C Task 11 | 2 |
| C | `content/schemas/spine-edge.schema.json` | The `edges.json` schema that has never existed — 4 `kind`s, discriminated endpoint refs | 3 |
| C | `scripts/tests/edges-schema.test.mjs` | All 20 committed edges validate; a bad endpoint ref fails | 3 |
| C | `content/spine/derived.json` | Hoisted `derived` blocks keyed by node id, canonical bytes | 4 |
| M | `scripts/check_spine_emit.mjs:41-47,68-71,189-250` | Drop `derived` from `NODE_FIELDS`; emit the sidecar as output #48 | 4 |
| M | `scripts/lib/spine.mjs:227-233` | `loadSpine` returns `derived` alongside `edges`/`sheet` | 4 |
| M | `scripts/check_content.mjs:1928-1930` | `G-DERIVED-DRIFT` becomes one whole-file canonical-bytes comparison | 4 |
| M | `tools/mapforge/lib/world-gen.mjs:313-316` + `gen-world.mjs:102-103` + `tests/world-gen.test.mjs:7,37-39,89` | `buildWorld({ atlasNode, seedStreams })` — the only reader of `atlasNode.derived` | 4 |
| M | `scripts/lib/spine.mjs:47-60` | `BIOMES` 12 -> 20, `TERRAIN_KINDS` 7 -> 18, `TERRAIN_IMPLIES` extended | 5 |
| C | `content/world/budgets.json` | `landforms` + `sheets` sections and the pinned `cellKm: 0.5` (Plan C adds `fabric`/`civil`) | 5 |
| M | `scripts/check_content.mjs:1682` (new `gSpineWorld`, called after `gSpineBudgets`) | `G-LANDFORM` (lexicon census, type/geometry join, instance + named caps) and `G-SHEET-BUDGET` (sheet count + SVG bytes). **`G-WORLD-BUDGET` is Plan C's, not this plan's** — Plan C owns `content/world/budgets.json`'s existence and the contract's pinned `world-budget: <family> …` print line | 5 |
| C | `scripts/tests/world-budget.test.mjs` | `G-LANDFORM` + `G-SHEET-BUDGET` fixtures, incl. the soft-skip | 5 |

### Render half (Tasks 6–12)

| Op | Path | Responsibility | Task |
| --- | --- | --- | ---: |
| M | `tools/mapforge/lib/draft.mjs:36-53,165-246` | `BIOME_FILL` (20, NEW), `FILL_FOR` (18), `patternDefs({includeReported, frontierTiers, baked, ids})`, `LEGEND` (25 rows) zoom-tiered; `TERRAIN_LEGEND` kept as a derived alias | 6 |
| C | `tools/mapforge/lib/ink.mjs` | `checkBiomeInk()` — the three-loop `G-BIOME-INK` closure, importable by every sheet builder | 6 |
| C | `tools/mapforge/tests/biome-ink.test.mjs` | All three loops, both unreachable directions | 6 |
| C | `tools/mapforge/lib/glyphs.mjs` | 40 glyph families, pure `({x,y,size,seed}) -> svg path d`; `symbolDefs`, `glyphForType`, `checkGlyphCoverage` | 7 |
| C | `tools/mapforge/tests/glyphs.test.mjs` | `G-GLYPH` coverage + group-uniqueness + determinism | 7 |
| C | `tools/mapforge/lib/labels.mjs` | `ADVANCE_WIDTH`, `measureText`, `placeLabels` — priority ranks, 8-candidate Imhof search, leader line, drop-and-report | 8 |
| C | `tools/mapforge/tests/labels.test.mjs` | 300 synthetic labels, zero collisions, no hand-tuning; zoom tiers; determinism | 8 |
| C | `tools/mapforge/lib/version.mjs` | `GENERATOR_VERSION` — one constant read by the lock and the runId | 9 |
| C | `tools/mapforge/lib/texture-bake.mjs` | `bakeBiomeTexture` / `bakedUnderlay` — one `<image>` layer instead of N live patterns | 9 |
| C | `tools/mapforge/tests/texture-bake.test.mjs` | Determinism + the underlay replaces every pattern reference | 9 |
| M | `tools/mapforge/tests/raster.test.mjs:11` | Re-pointed at `fixtures/raster-probe.svg` at 500 px (Plan A created the fixture) | 9 |
| C | `tools/mapforge/tests/fixtures/synthetic-world/spine/` | Synthetic content root at target density: 13 landmasses, 160 regions, 1,740 instances, 340 labels | 10 |
| C | `tools/mapforge/lib/synthetic-sheet.mjs` | The canary sheet builder — the only consumer of all four new modules at once | 10 |
| C | `game-client/assets/art/maps/synthetic-density.svg` + `.png` | The committed canary artifact (SVG + a <= 512 px thumb) | 10 |
| M | `tools/mapforge/render-sheet.mjs:31-50,52-120` | Register `synthetic`; `--png` becomes opt-in with `--png-width` (default 512) | 10, 11 |
| C | `tools/mapforge/tests/synthetic-sheet.test.mjs` | Zero ink/glyph/label problems at target density; <= 2 s raster at 2000 px | 10 |
| M | `tools/asset-storybook/maps-index.json` (data file, rewritten wholesale) | The `synthetic` row; `png` is now the <= 512 px thumb | 10, 11 |
| M | `tools/asset-storybook/tests/maps-index.test.mjs:44-71` | Assert the thumb on disk and its size cap, not a 2000 px raster | 11 |
| M | `tools/asset-storybook/js/maps.mjs:243-330` | The lexicon / glyph / legend panel | 11 |
| M | `scripts/bake_thumbnails.mjs:60` | Map sheets bake at <= 512 px | 11 |
| M | `game-client/assets/art/art-manifest.json:490-535` | `art:map-*` `gen.raster` records the thumb width; the SVG stays the artifact | 11 |
| M | `tools/mapforge/lib/atlas-sheet.mjs:366-477,451,286-292` | Greedy stack -> `placeLabels`; circles -> `glyphs.mjs`; gains a legend block | 12 |
| M | `tools/mapforge/lib/basin-sheet.mjs:199-207,647-665` | Same label swap; legend reads `LEGEND` at its tier | 12 |
| M | `content/world/render-lock.json` (generated by `check_render_lock.mjs --write`) | Re-baselined ONCE, in Task 12 only | 12 |
| — | `.github/workflows/ci.yml:113-125` | **Not modified.** Plan A Task 12 already added the mapforge suite, the render lock and `render-sheet --check` (X6). Task 12 Step 8 verifies they are present rather than adding them twice | 12 |

### Files this plan explicitly does NOT touch

`content/spine/nodes/*.json` geometry (only the `derived` key is removed, by the emitter, in Task 4) · `content/spine/edges.json` content · `content/spine/roots.json` · `content/spine/frozen-spawn-ids.json` · anything under `colyseus-server/src/` · `content/maps/` · `content/zones/` · `content/towns/`.

---

## Shared interfaces this plan CONSUMES (owned by Plan A)

Plan B cannot start until these exist. Every one is called by name below.

```js
// scripts/lib/geometry.mjs
export function buildBBoxIndex({ items }): { query({ bbox }): string[] }   // items: {id, bbox}[]
export function bboxOfPlacement({ placement }): { x, y, w, h }
export function ringVertexCount({ placement }): number

// scripts/lib/places.mjs
export function resolveWorld({ spine, tree, descriptor, fabric = null, civil = null }):
  { doc: object|null, problems: string[] }
export function loadPlaces({ contentRoot }): { doc: object|null, problems: string[] }

// scripts/lib/render-lock.mjs  +  scripts/check_render_lock.mjs --check|--write
export function computeLock({ repoRoot, sheets, extraPaths = [] }):
  { version: 2, generator: { name: "mapforge", version: string }, artifacts: Record<string,string> }
export function checkLock({ committed, computed }): { drift: string[], missing: string[], extra: string[] }
export function unifiedDiff({ a, b, maxLines = 40 }): string

// tools/mapforge/render-sheet.mjs — the grown registry entry shape
// SHEETS[id] = { title, outSvg, outPng, maxLabelRank, build({ repoRoot }) }
//              -> { svg: string, notes: string[], problems: string[] }

// content/spine/sheet.json AND sheet-atlas.json gained a `subjects` descriptor block
// { rootId, zoneRoot, landIds, seaIds, terrainPatchIds, mireIds, featureIds }
```

**If Plan A has not landed**, Tasks 1–5 are still buildable (they touch none of the above); Tasks 6–9 are buildable except for the `buildBBoxIndex` import in `labels.mjs` (substitute a local index and swap it in a follow-up commit); Tasks 10–12 are hard-blocked on `SHEETS[].title`/`maxLabelRank` and the render lock.

---

# PHASE 2 — VOCABULARY AND SCHEMAS (Tasks 1–5)

### Task 1: The landform lexicon — 170 types

**Files:**
- Create: `content/world/lexicon/landforms.json`
- Create: `content/schemas/landform-type.schema.json`
- Test: `scripts/tests/landform-lexicon.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `content/world/lexicon/landforms.json` — a flat JSON **array** of rows shaped `{ id, group, alsoGroups, geometry, biomes, sizeKm, dungeonCapable, glyph, rarity, requires, gloss, absentBecause }`. Plan C's P10 reads `requires` and `sizeKm`; Plan D's bound records cite `id` in `bind.expect.type`; Task 7's `G-GLYPH` reads `group` + `glyph`.
  - `content/schemas/landform-type.schema.json` — `$id: "landform-type.schema.json"`, `additionalProperties: false`.
  - Census constants other tasks assert on: **170** distinct types, **178** group memberships, **8** dual-listed, **23** `dungeonCapable`, **40** distinct glyph ids, **12** groups.
  - The **id resolution table** (Step 4b) — the authoritative mapping from every `requires.landform` id Plan D's pinned roster cites onto a lexicon id. Plan D rewrites its roster against it; nothing downstream invents a landform id.

**Domain notes.** A *landform* is a named kind of ground ("cenote", "esker", "barchan dune"), not an instance. The lexicon is the vocabulary; Plan C stamps out 1,740 *instances* against it. `group` is one of twelve families (coastal, fluvial, mountain, glacial, karst, erosional, desert, volcanic, wetland, lakes, island, oceanic) and is the **primary** key — `G-GLYPH` computes glyph uniqueness over `group` alone. Eight types genuinely belong to two families (a sea cave is coastal *and* karst); those carry the second family in `alsoGroups` (see D-B1). `requires` is a **predicate over fabric cell fields** and is what stops a karst quota deadlocking in a region with no carbonate: a type can only be placed where the model produced its substrate.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/landform-lexicon.test.mjs`:

```js
// Plan B Task 1 — the landform lexicon is the vocabulary Plan C instances
// against and Plan D binds to. Its census is a contract, not a preference:
// 170 distinct types / 178 group memberships / 8 dual-listed / 23
// dungeon-capable / 40 glyph families over 12 groups. (170, not the spec's
// 164: six ids Plan D's pinned roster needs had no equivalent — D-B4.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LEX = JSON.parse(readFileSync(join(ROOT, "content/world/lexicon/landforms.json"), "utf8"));
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "content/schemas/landform-type.schema.json"), "utf8"));

const GROUPS = ["coastal", "fluvial", "mountain", "glacial", "karst", "erosional",
  "desert", "volcanic", "wetland", "lakes", "island", "oceanic"];
// The membership census, per group: spec section 5.5's table plus the six
// D-B4 additions (coastal +2 headland/sea-waterfall, fluvial +1 ford,
// glacial +1 ice-shelf, volcanic +2 ash-front/ash-plain).
// 22+14+16+22+12+9+19+15+17+14+8+10 = 178.
const MEMBERSHIPS = { coastal: 22, fluvial: 14, mountain: 16, glacial: 22, karst: 12,
  erosional: 9, desert: 19, volcanic: 15, wetland: 17, lakes: 14, island: 8, oceanic: 10 };
// The six D-B4 ids: headland/ford/sea-waterfall are bound by a named pinned
// record, ice-shelf/ash-front/ash-plain are Plan C generator vocabulary for
// c01's shelf ice and c10's tephra ground. Pinned by test so a later "tidy the
// lexicon" commit cannot quietly unbind a pin or blank a continent's ground.
const DB4_ADDITIONS = {
  headland: "coastal", "sea-waterfall": "coastal", ford: "fluvial",
  "ice-shelf": "glacial", "ash-front": "volcanic", "ash-plain": "volcanic" };
// The closed predicate vocabulary — every key here must be a field the Plan C
// grid actually carries (grid.mjs: elev, moist, temp, flowAcc, flags).
const REQUIRES_KEYS = new Set(["rock", "precipDecileMin", "precipDecileMax",
  "tempDecileMin", "tempDecileMax", "slopeMin", "slopeMax", "nearFlag",
  "flowAccMin", "elevMin", "elevMax"]);

test("every lexicon row validates against landform-type.schema.json", () => {
  const validate = new Ajv({ allErrors: true }).compile(SCHEMA);
  for (const row of LEX)
    assert.ok(validate(row), `${row?.id}: ${JSON.stringify(validate.errors)}`);
});

test("census: 170 distinct types, 178 memberships, 8 dual-listed", () => {
  assert.equal(LEX.length, 170);
  assert.equal(new Set(LEX.map((r) => r.id)).size, 170, "ids must be unique");
  const dual = LEX.filter((r) => r.alsoGroups.length > 0);
  assert.equal(dual.length, 8);
  const memberships = LEX.reduce((n, r) => n + 1 + r.alsoGroups.length, 0);
  assert.equal(memberships, 178);
});

test("the six D-B4 additions exist, in the right group, single-listed", () => {
  // Six ids had no equivalent in the 164-row draft, so they live here (D-B4)
  // rather than being invented downstream. Three are bound by a named pinned
  // record (headland, ford, sea-waterfall) and deleting one silently unbinds
  // that pin; three are Plan C generator vocabulary (ice-shelf, ash-front,
  // ash-plain) and deleting one leaves c01's shelf ice or c10's tephra ground
  // with no form to draw. Both failures are silent, which is why they are
  // asserted here rather than left to a downstream gate.
  const byId = new Map(LEX.map((r) => [r.id, r]));
  for (const [id, group] of Object.entries(DB4_ADDITIONS)) {
    const row = byId.get(id);
    assert.ok(row, `${id}: a D-B4 addition the lexicon does not ship`);
    assert.equal(row.group, group, `${id}: primary group`);
    assert.deepEqual(row.alsoGroups, [], `${id}: an addition is single-listed — dual stays 8`);
    assert.equal(row.dungeonCapable, false, `${id}: dungeonCapable stays pinned at 23`);
  }
});

test("per-group membership counts match the spec table", () => {
  const got = Object.fromEntries(GROUPS.map((g) => [g, 0]));
  for (const r of LEX) for (const g of [r.group, ...r.alsoGroups]) got[g]++;
  assert.deepEqual(got, MEMBERSHIPS);
});

test("a type never lists its own primary group in alsoGroups", () => {
  for (const r of LEX) assert.ok(!r.alsoGroups.includes(r.group), r.id);
});

test("23 types are dungeonCapable and all 23 are point-or-line geometry", () => {
  const d = LEX.filter((r) => r.dungeonCapable);
  assert.equal(d.length, 23);
  for (const r of d)
    assert.notEqual(r.geometry, "area", `${r.id}: a dungeon door is an entrance, not a field`);
});

test("40 glyph families, and no glyph is shared by two PRIMARY groups", () => {
  const owner = new Map(); // glyph -> primary group
  for (const r of LEX) {
    const prev = owner.get(r.glyph);
    if (prev === undefined) owner.set(r.glyph, r.group);
    else assert.equal(prev, r.group,
      `G-GLYPH: groups "${prev}" and "${r.group}" share glyph "${r.glyph}"`);
  }
  assert.equal(owner.size, 40);
});

test("every requires key is in the closed predicate vocabulary", () => {
  for (const r of LEX)
    for (const k of Object.keys(r.requires))
      assert.ok(REQUIRES_KEYS.has(k), `${r.id}: requires.${k} is not a fabric cell field`);
});

test("the predicate vocabulary is EXACTLY what the committed schema declares", () => {
  // One language, one definition. The schema is the authority because it is
  // committed and validates all 170 rows with additionalProperties: false.
  assert.deepEqual([...REQUIRES_KEYS].sort(),
    Object.keys(SCHEMA.properties.requires.properties).sort());
});

test("every requires key is handled by Plan C's matchesRequires — the cross-check", () => {
  // Two independently-maintained enumerations of one predicate language is how
  // P10 ends up THROWING on the first coastal row it meets, which is
  // essentially the whole lexicon. Plan C's landforms.mjs exports its switch's
  // key list precisely so this test can exist; Plan C Task 8 carries the
  // mirror. Skipped, not failed, until Plan C is merged into this branch.
  const impl = join(ROOT, "tools/mapforge/lib/passes/landforms.mjs");
  if (!existsSync(impl)) return;
  const src = readFileSync(impl, "utf8");
  const m = /export const REQUIRES_KEYS = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(src);
  assert.ok(m, "landforms.mjs does not export REQUIRES_KEYS");
  const implKeys = [...m[1].matchAll(/"([a-zA-Z]+)"/g)].map((x) => x[1]).sort();
  assert.deepEqual(implKeys, [...REQUIRES_KEYS].sort(),
    "the lexicon schema and matchesRequires disagree about the predicate language");
});

test("sizeKm bands are ordered, positive, and inside the frame", () => {
  for (const r of LEX) {
    const [lo, hi] = r.sizeKm;
    assert.ok(lo > 0 && hi > lo, `${r.id}: sizeKm [${lo}, ${hi}]`);
    assert.ok(hi <= 400, `${r.id}: sizeKm high bound exceeds the 400 km frame`);
  }
});

test("every gloss is a real sentence and never just restates the id", () => {
  for (const r of LEX) {
    assert.ok(r.gloss.length > 0 && r.gloss.length <= 120, `${r.id}: gloss length`);
    assert.ok(r.gloss.endsWith("."), `${r.id}: gloss must end in a full stop`);
    assert.notEqual(r.gloss.toLowerCase().replace(/[^a-z]/g, ""),
      r.id.replace(/-/g, ""), `${r.id}: gloss restates the id`);
  }
});

test("absentBecause is null everywhere until a real world proves otherwise", () => {
  for (const r of LEX) assert.equal(r.absentBecause, null, r.id);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm ci --prefix scripts && node --test 'scripts/tests/landform-lexicon.test.mjs'
```
Expected: FAIL — `Error: ENOENT: no such file or directory, open '.../content/world/lexicon/landforms.json'` on every test.

- [ ] **Step 3: Write the schema**

Create `content/schemas/landform-type.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "landform-type.schema.json",
  "title": "Landform type — one row of content/world/lexicon/landforms.json. SHAPE ONLY: the census (170/178/8/23/40) is asserted by scripts/tests/landform-lexicon.test.mjs and by G-LANDFORM, never duplicated here — a bound written into a schema turns its gate rule into dead code.",
  "type": "object",
  "required": ["id", "group", "alsoGroups", "geometry", "biomes", "sizeKm", "dungeonCapable", "glyph", "rarity", "requires", "gloss", "absentBecause"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
    "group": { "enum": ["coastal", "fluvial", "mountain", "glacial", "karst", "erosional", "desert", "volcanic", "wetland", "lakes", "island", "oceanic"] },
    "alsoGroups": {
      "type": "array",
      "maxItems": 1,
      "items": { "enum": ["coastal", "fluvial", "mountain", "glacial", "karst", "erosional", "desert", "volcanic", "wetland", "lakes", "island", "oceanic"] }
    },
    "geometry": { "enum": ["point", "line", "area"] },
    "biomes": { "type": "array", "minItems": 1, "items": { "type": "string" } },
    "sizeKm": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } },
    "dungeonCapable": { "type": "boolean" },
    "glyph": { "type": "string", "pattern": "^g-[a-z0-9]+(-[a-z0-9]+)*$" },
    "rarity": { "enum": ["common", "uncommon", "rare"] },
    "requires": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "rock": { "enum": ["carbonate", "clastic", "volcanic"] },
        "precipDecileMin": { "type": "integer", "minimum": 0, "maximum": 9 },
        "precipDecileMax": { "type": "integer", "minimum": 0, "maximum": 9 },
        "tempDecileMin": { "type": "integer", "minimum": 0, "maximum": 9 },
        "tempDecileMax": { "type": "integer", "minimum": 0, "maximum": 9 },
        "slopeMin": { "type": "number", "minimum": 0 },
        "slopeMax": { "type": "number", "minimum": 0 },
        "nearFlag": { "enum": ["SEA", "LAKE", "RIVER", "DELTA", "GLACIER", "ARC", "CLIFF"] },
        "flowAccMin": { "type": "number", "minimum": 0 },
        "elevMin": { "type": "number", "minimum": 0, "maximum": 1 },
        "elevMax": { "type": "number", "minimum": 0, "maximum": 1 }
      }
    },
    "gloss": { "type": "string", "minLength": 1, "maxLength": 120 },
    "absentBecause": { "type": ["string", "null"] }
  }
}
```

- [ ] **Step 4: Author the 170 rows**

Create `content/world/lexicon/landforms.json` as a flat JSON array. Transcribe the table below **row for row, in this order** (the file's order is the reviewable order; nothing in the pipeline depends on it, but a stable order keeps diffs honest).

Columns: `id` · `group` · `also` (goes into `alsoGroups`; `-` means `[]`) · `geometry` · `glyph` · `D` (`dungeonCapable`; `D` = true) · `rarity` (`c`/`u`/`r` -> common/uncommon/rare) · `sizeKm` lo–hi · `biomes`.

```
# COASTAL (20 primary, 22 memberships)
coastal-drowned-valley   coastal  -        area   g-lagoon  .  u  1-12       ocean,meadow
sea-cave                 coastal  karst    point  g-cliff   D  u  0.02-0.3   ocean,rock
sea-arch                 coastal  -        point  g-arch    D  r  0.02-0.2   ocean,rock
sea-stack                coastal  -        point  g-cliff   .  c  0.01-0.15  ocean,rock
blowhole                 coastal  -        point  g-cliff   D  r  0.01-0.05  ocean,rock
geo                      coastal  -        line   g-cliff   .  u  0.05-0.6   ocean,rock
wave-cut-platform        coastal  -        area   g-cliff   .  c  0.1-2      ocean,rock
marine-terrace           coastal  -        area   g-cliff   .  u  0.5-6      rock,meadow
tombolo                  coastal  island   line   g-spit    .  r  0.2-3      ocean,rock
spit                     coastal  -        line   g-spit    .  c  0.3-6      ocean,marsh
baymouth-bar             coastal  -        line   g-spit    .  u  0.3-4      ocean,marsh
barrier-island           coastal  -        area   g-spit    .  u  0.5-9      ocean,meadow
coastal-lagoon           coastal  -        area   g-lagoon  .  c  0.3-8      ocean,marsh
estuary                  coastal  -        area   g-lagoon  .  c  1-14       ocean,river,marsh
cuspate-foreland         coastal  -        area   g-spit    .  r  0.5-7      ocean,meadow
machair                  coastal  -        area   g-lagoon  .  r  0.2-3      meadow,ocean
raised-beach             coastal  -        line   g-cliff   .  u  0.3-5      rock,meadow
tidal-flat               coastal  -        area   g-lagoon  .  c  0.5-10     ocean,marsh
headland                 coastal  -        area   g-cliff   .  c  0.3-6      rock,meadow
sea-waterfall            coastal  -        point  g-cliff   .  r  0.02-0.3   ocean,rock

# FLUVIAL (14 primary, 14 memberships)
delta                    fluvial  coastal  area   g-delta   .  u  2-20       river,marsh,ocean
braided-channel          fluvial  -        line   g-meander .  c  1-12       river,scree
meander-scroll-plain     fluvial  -        area   g-meander .  c  1-15       river,meadow
oxbow-lake               fluvial  -        area   g-meander .  c  0.05-0.8   lake,river
alluvial-fan             fluvial  -        area   g-fan     .  c  0.5-8      scree,meadow
floodplain-levee         fluvial  -        line   g-meander .  c  1-14       river,meadow
river-terrace            fluvial  -        area   g-fan     .  u  0.5-8      river,meadow
plunge-pool              fluvial  -        point  g-falls   D  u  0.02-0.3   river,rock
knickpoint-gorge         fluvial  -        line   g-falls   D  u  0.3-6      river,rock
canyon                   fluvial  -        line   g-falls   .  u  1-18       rock,river
confluence-bench         fluvial  -        point  g-meander .  c  0.1-1.2    river,meadow
anabranch-island         fluvial  -        area   g-meander .  u  0.1-2.5    river,forest
sinking-river            fluvial  -        line   g-falls   .  r  0.5-9      river,karst
ford                     fluvial  -        point  g-meander .  c  0.02-0.4   river,meadow

# MOUNTAIN (16 primary, 16 memberships)
ridge-spine              mountain -        line   g-ridge   .  c  3-40       upland,rock
summit-pyramid           mountain -        point  g-peak    .  u  0.2-2      rock,ice
col-pass                 mountain -        point  g-ridge   .  c  0.1-1.5    upland,rock
spur-ridge               mountain -        line   g-ridge   .  c  1-12       upland,rock
cuesta                   mountain -        line   g-mesa    .  u  2-20       rock,meadow
hogback                  mountain -        line   g-mesa    .  u  1-14       rock,scree
mesa                     mountain -        area   g-mesa    .  u  1-16       rock,badland
butte                    mountain -        point  g-mesa    .  c  0.1-1.5    rock,badland
plateau-scarp            mountain -        line   g-mesa    .  u  2-25       rock,upland
talus-cone               mountain -        area   g-scree   .  c  0.1-1.5    scree,rock
rockfall-apron           mountain -        area   g-scree   .  c  0.2-3      scree,rock
avalanche-chute          mountain -        line   g-scree   .  u  0.3-4      scree,ice
saddle-notch             mountain -        point  g-ridge   .  c  0.1-1      upland,rock
foothill-belt            mountain -        area   g-ridge   .  c  3-30       upland,forest
massif-dome              mountain -        area   g-peak    .  r  4-35       rock,upland
tectonic-cave            mountain -        point  g-peak    D  r  0.02-0.4   rock,upland

# GLACIAL (22 primary, 22 memberships)
cirque                   glacial  -        area   g-cirque   .  c  0.3-4     ice,rock
arete                    glacial  -        line   g-cirque   .  c  0.5-8     ice,rock
horn-peak                glacial  -        point  g-cirque   .  u  0.2-2     ice,rock
moraine-terminal         glacial  -        line   g-moraine  .  c  0.5-9     scree,ice
moraine-lateral          glacial  -        line   g-moraine  .  c  0.5-12    scree,ice
moraine-medial           glacial  -        line   g-moraine  .  u  0.5-10    scree,ice
drumlin                  glacial  -        area   g-moraine  .  c  0.2-2     meadow,scree
esker                    glacial  -        line   g-moraine  .  u  0.5-14    scree,meadow
kame                     glacial  -        area   g-moraine  .  u  0.1-1.5   scree,meadow
kettle-hole              glacial  -        point  g-erratic  .  c  0.05-0.8  lake,meadow
outwash-plain            glacial  -        area   g-moraine  .  c  2-25      scree,tundra
roche-moutonnee          glacial  -        point  g-erratic  .  u  0.05-0.6  rock,ice
glacial-erratic          glacial  -        point  g-erratic  .  c  0.01-0.1  rock,tundra
u-valley                 glacial  -        area   g-cirque   .  c  2-25      ice,rock
hanging-valley           glacial  -        area   g-cirque   .  u  0.5-6     ice,rock
nunatak                  glacial  -        point  g-crevasse D  u  0.1-1.5   ice,rock
ice-divide               glacial  -        line   g-crevasse .  r  5-60      ice
outlet-glacier           glacial  -        line   g-crevasse .  c  2-30      ice,scree
glacier-cave             glacial  karst    point  g-crevasse D  r  0.02-0.4  ice,rock
moulin                   glacial  karst    point  g-crevasse D  u  0.01-0.1  ice
fjord                    glacial  coastal  area   g-cirque   .  u  2-30      ocean,ice,rock
ice-shelf                glacial  -        area   g-crevasse .  r  3-40      ice,ocean

# KARST (9 primary, 12 memberships)
karst-cenote             karst    lakes    point  g-cenote   D  u  0.05-0.6  karst,forest
cave-system              karst    -        point  g-cave     D  c  0.05-1.2  karst,rock
sinkhole-doline          karst    -        point  g-cenote   D  c  0.05-0.9  karst,meadow
polje                    karst    -        area   g-pavement .  u  1-14      karst,meadow
limestone-pavement       karst    -        area   g-pavement .  c  0.5-9     karst,rock
karst-fenster            karst    -        point  g-cave     D  r  0.02-0.3  karst,river
ponor                    karst    -        point  g-cave     D  u  0.02-0.4  karst,river
foiba                    karst    -        point  g-cenote   D  r  0.02-0.3  karst,rock
karst-tower              karst    -        point  g-tower    .  u  0.1-1.2   karst,forest

# EROSIONAL (9 primary, 9 memberships)
badland-gully            erosional -       line   g-gully     .  c  0.2-4    badland,rock
hoodoo                   erosional -       point  g-hoodoo    D  u  0.01-0.15 badland,desert
yardang                  erosional -       line   g-hoodoo    D  u  0.1-2    desert,badland
slot-canyon              erosional -       line   g-gully     D  u  0.1-2.5  rock,desert
pediment                 erosional -       area   g-gully     .  u  1-16     desert,scree
inselberg                erosional -       point  g-hoodoo    .  u  0.2-2.5  rock,desert
deflation-hollow         erosional -       area   g-gully     .  c  0.2-3    desert,alkali
undercut-alcove          erosional -       point  g-arch-rock .  u  0.02-0.3 rock,badland
natural-bridge           erosional -       point  g-arch-rock .  r  0.02-0.2 rock,badland

# DESERT (19 primary, 19 memberships)
erg-dune-sea             desert   -        area   g-dune   .  u  5-60       desert
barchan-dune             desert   -        point  g-dune   .  c  0.05-0.8   desert
seif-dune                desert   -        line   g-dune   .  c  0.5-9      desert
star-dune                desert   -        point  g-dune   .  u  0.2-2      desert
transverse-dune-field    desert   -        area   g-dune   .  c  1-18       desert
draa                     desert   -        line   g-dune   .  r  3-40       desert
desert-pavement-reg      desert   -        area   g-playa  .  c  1-20       desert,rock
playa                    desert   -        area   g-playa  .  c  0.5-12     alkali,desert
sabkha                   desert   -        area   g-playa  .  u  0.5-10     alkali,ocean
wadi                     desert   -        line   g-wadi   .  c  1-18       desert,river
alluvial-bajada          desert   -        area   g-wadi   .  u  1-16       scree,desert
ventifact-field          desert   -        area   g-playa  .  u  0.2-3      desert,rock
oasis-spring             desert   -        point  g-oasis  .  r  0.05-0.9   desert,meadow
salt-pan-crust           desert   -        area   g-playa  .  c  0.3-8      alkali
gypsum-dune              desert   -        area   g-dune   .  r  0.5-7      alkali,desert
desert-varnish-scarp     desert   -        line   g-playa  .  u  0.3-6      desert,rock
nebkha-field             desert   -        area   g-dune   .  u  0.2-4      desert,bramble
zeugen-ridge             desert   -        line   g-playa  .  r  0.2-4      desert,rock
sand-sheet               desert   -        area   g-dune   .  c  2-30       desert

# VOLCANIC (15 primary, 15 memberships)
shield-cone              volcanic -        area   g-cone      .  u  2-25     lava,ash
stratocone               volcanic -        point  g-cone      .  u  1-9      ash,lava
cinder-cone              volcanic -        point  g-cone      .  c  0.2-2    ash
caldera-floor            volcanic -        area   g-caldera   D  u  1-14     ash,lava
lava-tube                volcanic -        line   g-vent      D  u  0.1-3    lava,rock
lava-field-aa            volcanic -        area   g-lavafield .  c  1-20     lava
lava-field-pahoehoe      volcanic -        area   g-lavafield .  c  1-20     lava
fumarole-vent            volcanic -        point  g-vent      D  c  0.01-0.2 ash,lava
spatter-rampart          volcanic -        line   g-cone      .  u  0.1-2    lava,ash
volcanic-plug            volcanic -        point  g-cone      .  u  0.1-1.2  rock,ash
tuff-ring                volcanic -        area   g-caldera   .  r  0.3-4    ash,lake
lahar-fan                volcanic -        area   g-lavafield .  u  1-14     ash,scree
rift-fissure             volcanic -        line   g-vent      D  u  0.5-12   lava,rock
ash-front                volcanic -        line   g-lavafield .  u  1-20     ash,scree
ash-plain                volcanic -        area   g-lavafield .  c  2-30     ash

# WETLAND (17 primary, 17 memberships)
tidal-mire               wetland  -        area   g-tuft     .  c  0.5-12    marsh,ocean
salt-marsh               wetland  -        area   g-tuft     .  c  0.5-10    marsh,alkali
mangrove-flat            wetland  -        area   g-mangrove .  u  0.5-9     marsh,forest
reed-fen                 wetland  -        area   g-tuft     .  c  0.3-8     marsh,river
raised-bog               wetland  -        area   g-bog      .  u  0.5-9     marsh,tundra
blanket-mire             wetland  -        area   g-bog      .  u  1-16      marsh,tundra
peat-hag                 wetland  -        point  g-bog      .  c  0.02-0.4  marsh,tundra
swamp-forest             wetland  -        area   g-mangrove .  c  1-14      marsh,forest
carr-thicket             wetland  -        area   g-mangrove .  u  0.2-3     marsh,bramble
seasonal-marsh           wetland  -        area   g-tuft     .  c  0.3-7     marsh,meadow
spring-mire              wetland  -        point  g-bog      .  u  0.05-0.7  marsh,river
floating-mat             wetland  -        area   g-bog      .  r  0.05-0.8  lake,marsh
saltmire-pan             wetland  -        area   g-tuft     .  u  0.2-4     alkali,marsh
quaking-bog              wetland  -        area   g-bog      .  r  0.1-1.5   marsh,lake
delta-lobe-marsh         wetland  -        area   g-mangrove .  u  0.5-8     marsh,river
brackish-lagoon-marsh    wetland  -        area   g-mangrove .  u  0.3-6     marsh,ocean
wet-meadow               wetland  -        area   g-tuft     .  c  0.3-7     marsh,meadow

# LAKES (13 primary, 14 memberships)
tarn                     lakes    -        area   g-tarn  .  c  0.05-0.9     lake,ice
crater-lake              lakes    -        area   g-lake  .  r  0.2-3        lake,ash
ribbon-lake              lakes    -        area   g-lake  .  u  0.5-9        lake,ice
moraine-dammed-lake      lakes    -        area   g-tarn  .  u  0.2-4        lake,scree
landslide-dammed-lake    lakes    -        area   g-tarn  .  r  0.1-3        lake,scree
endorheic-lake           lakes    -        area   g-lake  .  u  1-16         lake,alkali
salt-lake                lakes    -        area   g-lake  .  u  0.5-14       lake,alkali
meromictic-lake          lakes    -        area   g-lake  .  r  0.2-3        lake
sub-lacustrine-vent      lakes    -        point  g-tarn  D  r  0.01-0.1     lake,ash
lake-delta-bench         lakes    -        area   g-lake  .  u  0.2-3        lake,river
lake-terrace             lakes    -        line   g-lake  .  u  0.3-6        lake,meadow
inland-sea-basin         lakes    -        area   g-lake  .  r  5-60         lake,ocean
ephemeral-pan-lake       lakes    -        area   g-tarn  .  c  0.2-4        lake,alkali

# ISLAND (7 primary, 8 memberships)
atoll                    island   oceanic  area   g-atoll .  r  0.5-9        reef,ocean
volcanic-high-island     island   -        area   g-isle  .  u  1-14         lava,forest
continental-fragment-isle island  -        area   g-isle  .  u  0.5-12       rock,meadow
skerry                   island   -        point  g-isle  .  c  0.01-0.2     rock,ocean
motu                     island   -        area   g-atoll .  u  0.05-0.9     reef,meadow
cay                      island   -        area   g-atoll .  c  0.05-0.8     reef,ocean
barrier-reef-island      island   -        area   g-atoll .  u  0.2-3        reef,ocean

# OCEANIC (9 primary, 10 memberships)
abyssal-plain            oceanic  -        area   g-seamount .  c  10-90     ocean
mid-ocean-ridge          oceanic  -        line   g-seamount .  u  10-120    ocean
seamount                 oceanic  -        point  g-seamount .  c  0.5-8     ocean
guyot                    oceanic  -        point  g-seamount .  u  0.5-7     ocean
oceanic-trench           oceanic  -        line   g-seamount .  r  10-100    ocean
fringing-reef            oceanic  -        line   g-reef     .  c  0.5-12    reef,ocean
barrier-reef             oceanic  -        line   g-reef     .  u  2-30      reef,ocean
reef-shelf-bank          oceanic  -        area   g-reef     .  c  1-20      reef,ocean
submarine-canyon         oceanic  -        line   g-seamount .  u  2-25      ocean
```

**`requires`** is NOT in the table because it is per-group with a short override list. Apply the group default to every row, then apply the overrides:

```jsonc
// group defaults
"coastal":   { "nearFlag": "SEA" }
"fluvial":   { "nearFlag": "RIVER" }
"mountain":  { "slopeMin": 0.06 }
"glacial":   { "nearFlag": "GLACIER", "tempDecileMax": 2 }
"karst":     { "rock": "carbonate", "precipDecileMin": 4 }
"erosional": { "precipDecileMax": 3, "slopeMin": 0.03 }
"desert":    { "rock": "clastic", "precipDecileMax": 1 }
"volcanic":  { "rock": "volcanic", "nearFlag": "ARC" }
"wetland":   { "precipDecileMin": 5, "slopeMax": 0.02 }
"lakes":     { "nearFlag": "LAKE" }
"island":    { "nearFlag": "SEA", "elevMax": 0.55 }
"oceanic":   { "nearFlag": "SEA", "elevMax": 0.4 }

// overrides — each one is a substrate fact the group default cannot express
"sinking-river":       { "nearFlag": "RIVER", "rock": "carbonate" }
"canyon":              { "nearFlag": "RIVER", "slopeMin": 0.05 }
"oasis-spring":        { "rock": "clastic", "precipDecileMax": 1, "flowAccMin": 50 }
"sub-lacustrine-vent": { "nearFlag": "LAKE", "rock": "volcanic" }
"fjord":               { "nearFlag": "GLACIER", "tempDecileMax": 2, "elevMax": 0.5 }
"atoll":               { "nearFlag": "SEA", "elevMax": 0.55, "tempDecileMin": 7 }
"motu":                { "nearFlag": "SEA", "elevMax": 0.55, "tempDecileMin": 7 }
"cay":                 { "nearFlag": "SEA", "elevMax": 0.55, "tempDecileMin": 7 }
"barrier-reef-island": { "nearFlag": "SEA", "elevMax": 0.55, "tempDecileMin": 7 }
"fringing-reef":       { "nearFlag": "SEA", "elevMax": 0.4, "tempDecileMin": 7 }
"barrier-reef":        { "nearFlag": "SEA", "elevMax": 0.4, "tempDecileMin": 7 }
"reef-shelf-bank":     { "nearFlag": "SEA", "elevMax": 0.4, "tempDecileMin": 7 }
"tidal-mire":          { "precipDecileMin": 5, "slopeMax": 0.02, "nearFlag": "SEA" }
"salt-marsh":          { "precipDecileMin": 5, "slopeMax": 0.02, "nearFlag": "SEA" }
"mangrove-flat":       { "precipDecileMin": 5, "slopeMax": 0.02, "nearFlag": "SEA", "tempDecileMin": 7 }
"brackish-lagoon-marsh": { "precipDecileMin": 5, "slopeMax": 0.02, "nearFlag": "SEA" }
"delta-lobe-marsh":    { "precipDecileMin": 5, "slopeMax": 0.02, "nearFlag": "DELTA" }

// the six D-B4 additions — each override is the substrate fact that
// makes the id a PLACE rather than a synonym for its group default
"headland":            { "nearFlag": "SEA", "slopeMin": 0.04 }
"sea-waterfall":       { "nearFlag": "SEA", "flowAccMin": 40 }
"ford":                { "nearFlag": "RIVER", "slopeMax": 0.02 }
"ice-shelf":           { "nearFlag": "GLACIER", "tempDecileMax": 2, "elevMax": 0.42 }
"ash-front":           { "rock": "volcanic", "nearFlag": "ARC" }
"ash-plain":           { "rock": "volcanic", "nearFlag": "ARC", "slopeMax": 0.03 }
```

- [ ] **Step 4b: The id resolution table — the single authority for every downstream `requires.landform`**

Plan D's pinned roster binds every record through `requires.landform`, and this table is the authority for what each candidate name resolves to; Plan D's fix pass rewrites its roster against it, and Plan D's own join test — every `requires.landform` is an id in `content/world/lexicon/landforms.json` — is what proves the rewrite landed. **Of the six D-B4 additions, three are resolutions of a name a pinned record uses (the record is named in the row); the other three are marked *no pinned citation* and are listed here only because Plan C's generator needs them and this file is the vocabulary's one home.** Every other row resolves onto an id the lexicon already ships. Two families of error are being corrected here: ids that are really `TERRAIN_KINDS` or Plan C `coastClass` values (a different namespace — `karst-pavement`, `sand-sea`, `cloud-forest`, `atoll-ring`, `delta-lobe`), and ids that are plain-English near-synonyms of a catalogued type (`lagoon`, `upland-ridge`, `rock-shore`, `volcanic-cone`).

| Plan D cites | Resolves to | Why |
| --- | --- | --- |
| `atoll-ring` | `atoll` | `atoll-ring` is the island group's own shape, not a second type |
| `braided-terrace` | `braided-channel` | the terrace is the channel's own bar surface |
| `bramble-thicket` | `carr-thicket` | wetland scrub; its `biomes` already carry `bramble` |
| `cloud-forest` | `foothill-belt` | `cloud-forest` is a **terrain kind** (Task 5), not a landform |
| `coastal-range-lee` | `spur-ridge` | a lee-side ridge is a mountain spur; "lee" is a bearing, not a form |
| `delta-lobe` | `delta` | the lobe is the delta's unit; `delta-lobe-marsh` is the *marsh* on it |
| `headland` (`c-lm-gildmark-head`) | **`headland` (NEW)** | erosional cliffed promontory — `cuspate-foreland` is depositional and `marine-terrace` is a flat bench, so neither is the same place |
| `hollow` | `deflation-hollow` | the only catalogued hollow |
| `ice-margin` | `moraine-terminal` | the terminal moraine IS the ice margin, drawn |
| `ice-shelf` (no pinned citation — c01 generator vocabulary) | **`ice-shelf` (NEW)** | floating shelf ice over sea; every other glacial id is grounded ice or its debris, so Rimewall Cap's seaward margin would otherwise render as moraine |
| `inland-basin` | `inland-sea-basin` | same feature, catalogued under `lakes` |
| `karst-pavement` | `limestone-pavement` | exact synonym; `karst-plateau` is the terrain kind |
| `lagoon` | `coastal-lagoon` | exact synonym |
| `migrating-bar` | `spit` | the catalogued migrating bar form |
| `open-down` | `cuesta` | chalk downland is a cuesta dip-slope |
| `peat-coast` | `blanket-mire` | peat at the shore; `peat-hag` is an erosion scar within it |
| `rock-shore` | `wave-cut-platform` | exact synonym, `ocean,rock` |
| `sand-sea` | `erg-dune-sea` | `sand-sea` is a **terrain kind** (Task 5); the erg is the landform |
| `sea-waterfall` (`c-lm-brightfall-leap`) | **`sea-waterfall` (NEW)** | `plunge-pool` and `knickpoint-gorge` both require `nearFlag: RIVER` with biomes `river,rock`, so neither can be satisfied at a cell that also satisfies the row's `water.kind: "sea"` — a `G-PIN-SAT` failure by construction, and the reason this row is not a nicety |
| `upland-ridge` | `ridge-spine` | exact synonym |
| `volcanic-cone` | `stratocone` | the catalogued cone; `cinder-cone` is the smaller monogenetic form |
| `ash-front` (no pinned citation — c10 generator vocabulary) | **`ash-front` (NEW)** | the tephra-fall margin — a line, and the only volcanic edge form |
| `ash-plain` (no pinned citation — c10 generator vocabulary) | **`ash-plain` (NEW)** | walkable tephra plain; every other volcanic area is `lava` or `caldera` |
| `ford` (`c-lm-millcross-ford`) | **`ford` (NEW)** | a crossing point; `confluence-bench` is a bank and `braided-channel` is a line of bars, neither is a crossing |

Ids Plan D cites that are already lexicon ids need no row and are unchanged — among them `cave-system`, `karst-cenote`, `estuary`, `fjord`, `esker`, `polje`, `tidal-mire`, `salt-marsh` and `barrier-island`.

**This table is content, not commentary:** transcribe the six new rows into `landforms.json` in Step 4 and hand this table to Plan D's fix pass verbatim. Nothing else in the programme may mint a landform id.

**`gloss`** is authored prose under four mechanical rules the test enforces: one sentence, `<= 120` characters, ends in a full stop, and never simply restates the id. It must say what a **player standing there would see**, not what a geologist would call it. One worked example per group, plus all six D-B4 additions written out (they are new vocabulary and must not be improvised) — write the other 152 in the same register:

```jsonc
"coastal-drowned-valley": "A river mouth the sea has walked up, so the water is salt a long way inland."
"delta":                  "The river gives up and splits, laying its load down in a fan of shifting channels."
"ridge-spine":            "One unbroken backbone of rock; the only ways over it are the notches."
"cirque":                 "A bowl bitten out of a mountain head, usually with meltwater standing in the floor."
"karst-cenote":           "A collapsed limestone shaft flooded to the water table."
"hoodoo":                 "A standing column of soft rock left behind because a harder cap protected it."
"erg-dune-sea":           "Sand to the horizon in ranks, each crest moving a little every year."
"caldera-floor":          "The flat floor of a mountain that emptied itself and fell in."
"tidal-mire":             "Grass and channel by turns, walkable at low water and not at high."
"tarn":                   "A small cold lake sitting in a rock bowl, fed by snow and nothing else."
"skerry":                 "A bare rock the sea covers and uncovers; a hazard, never a landing."
"fringing-reef":          "Living rock built right against the shore, breaking every swell before it lands."

// the six D-B4 additions
"headland":               "A shoulder of cliff shoved out into the water; the coast road goes over it or not at all."
"sea-waterfall":          "A stream that runs off the cliff lip and never reaches a beach, because there is none."
"ford":                   "A gravel shallow where the river spreads wide enough to walk, in the right season."
"ice-shelf":              "Ice floating on sea, thick enough to stand on and flat to the horizon."
"ash-front":              "The line where the fall stopped: grey to one side, green to the other, and nothing between."
"ash-plain":              "Soft grey ground that takes a bootprint and keeps it until the next fall covers it."
```

Set `"absentBecause": null` on all 170 rows.

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
node --test 'scripts/tests/landform-lexicon.test.mjs'
```
Expected: PASS — 13 tests, 0 fail. If the per-group census test fails, the message prints the whole `got` object next to `MEMBERSHIPS`; fix the **file**, never the expected counts.

- [ ] **Step 6: Verify nothing else moved**

Run:
```bash
node scripts/check_content.mjs --only=spine && node scripts/check_spine_emit.mjs --check && node scripts/check_render_lock.mjs --check && (cd colyseus-server && npm test -- mapDimensions)
```
Expected: all four exit 0. `content/world/` is a new directory no existing gate reads, so this task is provably inert.

- [ ] **Step 7: Commit**

```bash
git add content/world/lexicon/landforms.json content/schemas/landform-type.schema.json scripts/tests/landform-lexicon.test.mjs
git commit -m "feat: 170-type landform lexicon + row schema"
```

- [ ] **Step 8: QUALITY GATE — verify**

Run and paste the output:
```bash
node --test 'scripts/tests/landform-lexicon.test.mjs'
node scripts/check_content.mjs --only=spine
git branch --show-current && git log --oneline -1
```

- [ ] **Step 9: QUALITY GATE — independent adversarial review**

Dispatch a fresh subagent (or `/code-review`) with this brief: *"Review `git show HEAD` only. The lexicon is a vocabulary Plan C generates against and Plan D binds to. Check specifically: (a) does any `requires` predicate name a field the Plan C grid does not carry — the grid is `elev, moist, temp, flowAcc, flowDir, owner, plate, biome, flags{SEA,LAKE,RIVER,DELTA,GLACIER,ARC,CARBONATE,SAND,CLIFF}`; (b) is any `sizeKm` band unsatisfiable against the 0.5 km cell grid (a `point` type with a low bound under 0.5 km is fine — it is a mark, not a cell count — but an `area` type with a **high** bound under 0.5 km can never be drawn); (c) do the 23 dungeon-capable types actually match the spec's enumerated list one for one; (d) is any `biomes` entry outside the 20-value vocabulary Task 5 will pin; (e) the six D-B4 additions (`headland`, `sea-waterfall`, `ford`, `ice-shelf`, `ash-front`, `ash-plain`) — confirm each reuses a glyph already owned by its own primary group (so the 40-family count and the no-two-groups-share-a-mark rule are both unmoved), carries `alsoGroups: []` and `dungeonCapable: false`, and that its `requires` override is satisfiable at the same time as its `biomes` list (an `ice-shelf` requiring `GLACIER` and claiming biome `ocean` must be reachable on a real shelf cell, not only in principle); (f) walk Step 4b's resolution table and name any row where the target id's `requires` block makes the pinned place unplaceable — that is the failure `sea-waterfall` was added to avoid."*

- [ ] **Step 10: QUALITY GATE — refactor on the findings**

Fix every finding in a NEW commit (`fix: ...`). Never `--amend`. If a finding says a bound is unsatisfiable, change the bound, not the test.

- [ ] **Step 11: QUALITY GATE — re-verify**

```bash
node --test 'scripts/tests/landform-lexicon.test.mjs' && node scripts/check_content.mjs --only=spine
git branch --show-current && git log --oneline -1
```

---

### Task 2: The instance schema, and the feature schema written from scratch

**Files:**
- Create: `content/schemas/landform-instance.schema.json`
- Modify: `content/schemas/spine-node.schema.json:7` (root `additionalProperties`), `:59` (`features`)
- Test: `scripts/tests/landform-instance-schema.test.mjs`

**Interfaces:**
- Consumes: `content/world/lexicon/landforms.json` (Task 1) — only for the `type` cross-reference test.
- Produces: `content/schemas/landform-instance.schema.json` (`$id: "landform-instance.schema.json"`) — Plan C's `tools/mapforge/lib/passes/landforms.mjs` writes records against it; a typed `features[]` item in `spine-node.schema.json` carrying an optional nullable `type`.

**Domain notes.** Today `spine-node.schema.json:59` is literally `"features": { "type": "array" }` — **no schema at all** for the 58 committed map features. The census, measured on the corpus:

| Shape | Count |
| --- | ---: |
| `{attrs, id, kind, points}` | 10 (all `kind: "line"`) |
| `{at, attrs, id, kind}` | 47 (all `kind: "point"`) |
| `{at, attrs, id, kind, offSheet}` | 1 |
| distinct `attrs` key-sets | **12**, including `{}` on 22 features |

`attrs` value types across the corpus: `note` string · `name` string-or-null · `role` string · `town` string · `reaches` array · `labelAt` array · `tidalLimit` object · `ford` object · `hardEdgeAtY` number · `detached` boolean · `inert` boolean · `hazard` object.

**Trunk `features[]` stays exactly as it is** — `gSpineNet` (`check_content.mjs:1986-1999`) resolves road endpoints against `node.features`, and G-CONTAIN's feature half (`:1850-1870`) checks them against the owning ring. Migrating the 58 features would rewrite both gate families for no benefit. **Trunk features are the network; fabric instances are the texture.** The bare array gains a typed item every existing feature validates against *unchanged*, plus a nullable `type` citing a lexicon id.

Flipping the root to `additionalProperties: false` is verified safe: the union of keys across all 44 committed node files is exactly the 24 enumerated schema properties, with **zero** outside. Today a typo'd field name is accepted silently; after this task it is a schema failure.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/landform-instance-schema.test.mjs`:

```js
// Plan B Task 2 — the two schemas the machine-written layers are held to.
// The fabric layer is generated, so every unexpected key is a bug:
// additionalProperties is false on BOTH schemas, in both directions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const INSTANCE = rd("content/schemas/landform-instance.schema.json");
const NODE = rd("content/schemas/spine-node.schema.json");
const LEX = rd("content/world/lexicon/landforms.json");
const ajv = () => new Ajv({ allErrors: true });

const POINT = {
  id: "lf-c03-r07-0142", type: "karst-cenote",
  geometry: { shape: "point", at: [212.4, 88.9] },
  sizeKm: 0.31, cell: [425, 178],
  handle: "c03/karst/h-0f42", region: "c03/r07",
  named: false, glyph: "g-cenote", dungeonCapable: true,
  provenance: { authored: "generated",
                generator: { pass: "karst", seedStream: "landform", epoch: 0 },
                fabric: "fabric/continent-03" },
};
const LINE = { ...POINT, id: "lf-c03-r07-0143", type: "esker", glyph: "g-moraine",
  dungeonCapable: false,
  geometry: { shape: "line", points: [[1, 1], [2, 2], [3, 1]] } };
const AREA = { ...POINT, id: "lf-c03-r07-0144", type: "polje", glyph: "g-pavement",
  dungeonCapable: false,
  geometry: { shape: "area", ring: [[0, 0], [2, 0], [2, 2]] } };

test("the instance schema accepts all three geometries", () => {
  const v = ajv().compile(INSTANCE);
  for (const doc of [POINT, LINE, AREA])
    assert.ok(v(doc), `${doc.geometry.shape}: ${JSON.stringify(v.errors)}`);
});

test("the instance schema rejects an unknown key anywhere", () => {
  const v = ajv().compile(INSTANCE);
  assert.equal(v({ ...POINT, spineId: "n-thornveil" }), false, "top level");
  assert.equal(v({ ...POINT, geometry: { shape: "point", at: [1, 1], z: 3 } }), false, "geometry");
});

test("the instance schema rejects a wrong-shape geometry payload", () => {
  const v = ajv().compile(INSTANCE);
  assert.equal(v({ ...POINT, geometry: { shape: "point", points: [[1, 1]] } }), false);
  assert.equal(v({ ...AREA, geometry: { shape: "area", ring: [[0, 0], [1, 1]] } }), false,
    "an area ring needs >= 3 points");
});

test("the instance schema rejects a ring over G-VERTEX-BUDGET's 40-vertex landform cap", () => {
  // Spec §8.3: "world-tier children <= 800 vertices, regions <= 200, landforms
  // <= 40", and §8.4: every cost in this design is linear or worse in vertex
  // count. Plan A implements the first two tiers over SPINE NODES; instances
  // are deliberately not nodes, so without maxItems here and Plan C's
  // gWorldInstanceGeometry, nothing at all constrains a generated ring.
  const v = ajv().compile(INSTANCE);
  const ring = Array.from({ length: 41 }, (_, n) => [n, (n * 7) % 13]);
  assert.equal(v({ ...AREA, geometry: { shape: "area", ring } }), false, "41-point area ring");
  assert.equal(v({ ...AREA, geometry: { shape: "area", ring: ring.slice(0, 40) } }), true,
    "40 is the cap, not 39");
  const line = Array.from({ length: 41 }, (_, n) => [n, 0]);
  assert.equal(v({ ...LINE, geometry: { shape: "line", points: line } }), false, "41-point line");
});

test("the instance schema CANNOT check winding — that is the fabric gate's job", () => {
  // Stated as a test so nobody later "adds winding validation to the schema"
  // and believes the fabric is covered. A reversed ring is structurally
  // identical to a correct one; only gWorldInstanceGeometry (Plan C Task 11
  // Step 5c) computes the signed shoelace, and it reports
  //   G-POLY: instance <id> ring winding is <n> — an area ring must be OPEN
  //   with a STRICTLY POSITIVE signed shoelace
  const v = ajv().compile(INSTANCE);
  const reversed = { ...AREA, geometry: { shape: "area", ring: [...AREA.geometry.ring].reverse() } };
  assert.ok(v(reversed), "a reversed ring is schema-VALID — this is why the fabric gate exists");
});

test("the instance handle grammar is IDENTICAL to the handle-ledger grammar", () => {
  // Plan C's handle-ledger.schema.json permits 4-6 hex, because mintHandle
  // widens on a real contentHash collision. A stricter {4} here would
  // hard-reject a handle the ledger considers valid the first time that fires.
  const v = ajv().compile(INSTANCE);
  assert.ok(v({ ...POINT, handle: "c03/karst/h-0f42" }));
  assert.ok(v({ ...POINT, handle: "c03/karst/h-0f42ab" }), "6-hex collision-resolved handle");
  assert.ok(v({ ...POINT, handle: "c03/river-terrace/h-0f42" }), "hyphenated group name");
  assert.equal(v({ ...POINT, handle: "c3/karst/h-0f42" }), false);
  assert.equal(INSTANCE.properties.handle.pattern, "^c[0-9]{2}/[a-z-]+/h-[0-9a-f]{4,6}$");
});

test("every instance `type` and `glyph` in the fixtures exists in the lexicon", () => {
  const byId = new Map(LEX.map((r) => [r.id, r]));
  for (const doc of [POINT, LINE, AREA]) {
    const row = byId.get(doc.type);
    assert.ok(row, `${doc.type} is not a lexicon id`);
    assert.equal(doc.glyph, row.glyph);
    assert.equal(doc.dungeonCapable, row.dungeonCapable);
    assert.equal(doc.geometry.shape, row.geometry);
  }
});

test("all 44 committed spine nodes still validate under the tightened node schema", () => {
  const v = ajv().compile(NODE);
  const dir = join(ROOT, "content/spine/nodes");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  assert.ok(files.length >= 36, "expected the committed trunk");
  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    assert.ok(v(doc), `${f}: ${JSON.stringify(v.errors)}`);
  }
});

test("the node schema now rejects a typo'd top-level key and a typo'd attrs key", () => {
  const v = ajv().compile(NODE);
  const base = JSON.parse(readFileSync(join(ROOT, "content/spine/nodes/n-atlas.json"), "utf8"));
  assert.equal(v({ ...base, terainKind: "ice" }), false, "root additionalProperties must be false");
  const withFeature = { ...base, features: [{ id: "f-x", kind: "point", at: [1, 1], attrs: { nmae: "x" } }] };
  assert.equal(v(withFeature), false, "attrs additionalProperties must be false");
});

test("a feature may carry a nullable lexicon `type`", () => {
  const v = ajv().compile(NODE);
  const base = JSON.parse(readFileSync(join(ROOT, "content/spine/nodes/n-atlas.json"), "utf8"));
  const ok = { ...base, features: [
    { id: "f-a", kind: "point", at: [1, 1], type: "karst-cenote", attrs: {} },
    { id: "f-b", kind: "point", at: [1, 1], type: null, attrs: {} },
  ] };
  assert.ok(v(ok), JSON.stringify(v.errors));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
node --test 'scripts/tests/landform-instance-schema.test.mjs'
```
Expected: FAIL — `ENOENT ... content/schemas/landform-instance.schema.json`, and the two tightening tests fail with `v(...)` returning `true` (the root is `additionalProperties: true` today).

- [ ] **Step 3: Write the instance schema**

Create `content/schemas/landform-instance.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "landform-instance.schema.json",
  "title": "Landform instance — one record in content/world/fabric/continent-NN.json. MACHINE-WRITTEN: additionalProperties is false everywhere, because every unexpected key here is a generator bug, not an authoring choice. WINDING is NOT checkable here — JSON Schema cannot evaluate a signed shoelace — so the open-ring / strictly-positive-shoelace / no-self-intersection rules are enforced by gWorldInstanceGeometry (Plan C Task 11 Step 5c) over the fabric, since these records are deliberately not spine nodes and G-POLY only walks tree.byId. What IS enforceable here is the VERTEX CAP: maxItems 40 mirrors G-VERTEX-BUDGET's landform tier, so a 4,000-point generated ring fails at parse time as well as at the gate.",
  "type": "object",
  "required": ["id", "type", "geometry", "sizeKm", "cell", "handle", "region", "named", "glyph", "dungeonCapable", "provenance"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^lf-c[0-9]{2}-r[0-9]{2}-[0-9]{4}$" },
    "type": { "type": "string" },
    "geometry": {
      "oneOf": [
        {
          "type": "object", "required": ["shape", "at"], "additionalProperties": false,
          "properties": {
            "shape": { "const": "point" },
            "at": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } }
          }
        },
        {
          "type": "object", "required": ["shape", "points"], "additionalProperties": false,
          "properties": {
            "shape": { "const": "line" },
            "points": { "type": "array", "minItems": 2, "maxItems": 40, "items": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } } }
          }
        },
        {
          "type": "object", "required": ["shape", "ring"], "additionalProperties": false,
          "properties": {
            "shape": { "const": "area" },
            "ring": { "type": "array", "minItems": 3, "maxItems": 40, "items": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } } }
          }
        }
      ]
    },
    "sizeKm": { "type": "number", "exclusiveMinimum": 0 },
    "cell": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "integer", "minimum": 0 } },
    "handle": { "type": "string", "pattern": "^c[0-9]{2}/[a-z-]+/h-[0-9a-f]{4,6}$" },
    "region": { "type": "string", "pattern": "^c[0-9]{2}/r[0-9]{2}$" },
    "named": { "type": "boolean" },
    "glyph": { "type": "string", "pattern": "^g-[a-z0-9]+(-[a-z0-9]+)*$" },
    "dungeonCapable": { "type": "boolean" },
    "provenance": {
      "type": "object",
      "required": ["authored", "generator", "fabric"],
      "additionalProperties": false,
      "properties": {
        "authored": { "const": "generated" },
        "generator": {
          "type": "object",
          "required": ["pass", "seedStream", "epoch"],
          "additionalProperties": false,
          "properties": {
            "pass": { "type": "string" },
            "seedStream": { "type": "string" },
            "epoch": { "type": "integer", "minimum": 0 }
          }
        },
        "fabric": { "type": "string" }
      }
    }
  }
}
```

- [ ] **Step 4: Tighten the node schema**

In `content/schemas/spine-node.schema.json`, replace line 7:

```json
  "additionalProperties": true,
```
with:
```json
  "additionalProperties": false,
```

and replace line 59:

```json
    "features": { "type": "array" },
```
with:

```json
    "features": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "kind", "attrs"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string" },
          "kind": { "enum": ["point", "line", "area"] },
          "at": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } },
          "points": { "type": "array", "minItems": 2, "items": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } } },
          "ring": { "type": "array", "minItems": 3, "items": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } } },
          "offSheet": { "type": "boolean" },
          "type": { "type": ["string", "null"] },
          "attrs": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "name": { "type": ["string", "null"] },
              "note": { "type": "string" },
              "role": { "type": "string" },
              "town": { "type": "string" },
              "reaches": { "type": "array" },
              "labelAt": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } },
              "tidalLimit": { "type": "object" },
              "ford": { "type": "object" },
              "hardEdgeAtY": { "type": "number" },
              "detached": { "type": "boolean" },
              "inert": { "type": "boolean" },
              "hazard": { "type": "object" }
            }
          }
        }
      }
    },
```

Also update the schema `title` to record why the root closed:

```json
  "title": "Spine node — SHAPE ONLY. Every numeric floor/ceiling lives in checkSpine()'s G-* gates, never here: the gate continues past a schema-invalid doc, so a bound duplicated into the schema turns its gate rule into dead code (town-plan.test.mjs:105-118 discipline). Plan B Task 2 closed the root: the union of keys across all committed node files is exactly the enumerated set, so a typo'd field name is now a schema failure instead of a silent accept.",
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
node --test 'scripts/tests/landform-instance-schema.test.mjs'
```
Expected: PASS — 7 tests, 0 fail.

- [ ] **Step 6: Verify the real gate and the emitter are unmoved**

Run:
```bash
node scripts/check_content.mjs --only=spine
node scripts/check_spine_emit.mjs --check
node scripts/check_render_lock.mjs --check
npm test --prefix scripts
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: all exit 0. `npm test --prefix scripts` is the one that would surface a fixture regression: **`scripts/tests/fixtures/spine/*` node files are copied through `spineFixture()` and validated against this same schema**, so a fixture carrying a key outside the enumerated set now fails. If one does, that is a real fixture defect — fix the fixture, do not reopen the root.

- [ ] **Step 7: Commit**

```bash
git add content/schemas/landform-instance.schema.json content/schemas/spine-node.schema.json scripts/tests/landform-instance-schema.test.mjs
git commit -m "feat: landform-instance schema + typed spine feature items"
```

- [ ] **Step 8: QUALITY GATE — verify**

```bash
node --test 'scripts/tests/landform-instance-schema.test.mjs'
npm test --prefix scripts 2>&1 | tail -20
git branch --show-current && git log --oneline -1
```

- [ ] **Step 9: QUALITY GATE — independent adversarial review**

Brief: *"Review `git show HEAD`. (a) Enumerate every `attrs` key present across all 58 committed features and confirm each one appears in the new `attrs.properties`; a missing key silently reds the gate for a node nobody touched. (b) `oneOf` on `geometry` — confirm a `{shape:'point', at:[...], points:[...]}` payload is rejected by exactly one branch and not accidentally accepted by another. (c) Confirm no fixture root under `scripts/tests/fixtures/spine/` carries a node key outside the 24 enumerated properties. (d) `required: ['id','kind','attrs']` on a feature — confirm all 58 committed features carry a (possibly empty) `attrs`."*

- [ ] **Step 10: QUALITY GATE — refactor** — fix findings in a new `fix:` commit.
- [ ] **Step 11: QUALITY GATE — re-verify** — repeat Step 6 in full, then `git branch --show-current && git log --oneline -1`.

---

### Task 3: A schema for `content/spine/edges.json`, which has never had one

**Files:**
- Create: `content/schemas/spine-edge.schema.json`
- Modify: `scripts/check_content.mjs:1546-1548` (validate edges right after `loadSpine`)
- Test: `scripts/tests/edges-schema.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `content/schemas/spine-edge.schema.json` (`$id: "spine-edge.schema.json"`). Plan E re-fits the 7 `leg` edges against it; `gSpineNet` keeps reading `spine.edges` unchanged.

**Domain notes.** `content/spine/edges.json` is a flat array of **20** edges in four kinds, and nothing has ever checked its shape — `checkSpine` passes `spine.edges` straight into `gSpineNet` with the comment *"edges have no schema so spine.edges is passed through as-is (nothing to filter against)"* (`check_content.mjs:1675-1677`). Measured census of every committed edge:

| `kind` | n | `from` ref | `to` ref | required extras | `attrs` keys seen |
| --- | ---: | --- | --- | --- | --- |
| `road` | 8 | `{node}` or `{feature}` | `{node}`, `{feature}` or `{edge, atIndex}` | `weight`, `dashed`, `points` | name, note, hours, hoursLabel, roadKm, labelAtIndex, throughRoute, geoTo, geoFrom, amendedPending |
| `relay` | 2 | `{feature}` | `{feature}` | `via` (object) | note |
| `leg` | 7 | `{node}` | `{node}` | — | canonHours, roadKm, straightKm |
| `sealane` | 3 | `{node}` or `{feature}` | `{feature}` | — | label, note, sailDays, season |

The schema is **discriminated on `kind`** so a `leg` cannot smuggle a `points` array and a `road` cannot omit `weight`. Endpoint refs are a `oneOf` over exactly the three ref shapes observed. `attrs` closes to the observed union — the same discipline as Task 2's feature `attrs`.

Note the soft-skip: **a content root with no `edges.json` is legal** (`loadSpine:227` returns `[]`), and ~27 fixture roots have none. The validation loop must therefore run only over the edges that were actually loaded, and a missing schema file must be one clean `fail`, not a crash — that is exactly what `compileSchema(path, label, fail)` already gives you.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/edges-schema.test.mjs`:

```js
// Plan B Task 3 — content/spine/edges.json has carried 20 edges and no
// schema since it was created. This pins the four kinds and the three
// endpoint-ref shapes actually in use, so Plan E's canon-leg re-fit cannot
// invent a fifth by accident.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "content/schemas/spine-edge.schema.json"), "utf8"));
const EDGES = JSON.parse(readFileSync(join(ROOT, "content/spine/edges.json"), "utf8"));

function realRoot() {
  const dir = mkdtempSync(join(tmpdir(), "edges-schema-"));
  cpSync(join(ROOT, "content"), dir, { recursive: true });
  return dir;
}
function runGate(dir) {
  try {
    return { code: 0, out: execFileSync(process.execPath,
      [GATE, "--only=spine", "--content-root", dir], { encoding: "utf8" }) };
  } catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}

test("all 20 committed edges validate", () => {
  const v = new Ajv({ allErrors: true }).compile(SCHEMA);
  assert.equal(EDGES.length, 20);
  for (const e of EDGES) assert.ok(v(e), `${e.id}: ${JSON.stringify(v.errors)}`);
});

test("the four kinds are present in the expected counts", () => {
  const n = {};
  for (const e of EDGES) n[e.kind] = (n[e.kind] ?? 0) + 1;
  assert.deepEqual(n, { road: 8, relay: 2, leg: 7, sealane: 3 });
});

test("a leg carrying road geometry is rejected", () => {
  const v = new Ajv({ allErrors: true }).compile(SCHEMA);
  const leg = EDGES.find((e) => e.kind === "leg");
  assert.equal(v({ ...leg, points: [[0, 0], [1, 1]] }), false);
});

test("a road with no weight is rejected", () => {
  const v = new Ajv({ allErrors: true }).compile(SCHEMA);
  const road = EDGES.find((e) => e.kind === "road");
  const { weight, ...noWeight } = road;
  assert.equal(v(noWeight), false);
});

test("an unknown endpoint ref shape is rejected", () => {
  const v = new Ajv({ allErrors: true }).compile(SCHEMA);
  const leg = EDGES.find((e) => e.kind === "leg");
  assert.equal(v({ ...leg, to: { town: "n-gildmark" } }), false);
});

test("the real content root is green under the wired-in validation", () => {
  const r = runGate(realRoot());
  assert.equal(r.code, 0, r.out);
});

test("the gate reports G-EDGE-SCHEMA on a malformed edge", () => {
  const dir = realRoot();
  const edges = JSON.parse(readFileSync(join(dir, "spine/edges.json"), "utf8"));
  edges[0].weight = 7; // weight is an enum of three strings
  writeFileSync(join(dir, "spine/edges.json"), JSON.stringify(edges, null, 2));
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /G-EDGE-SCHEMA: spine\/edges\.json\[0\]/);
  rmSync(dir, { recursive: true, force: true });
});

test("a content root with no edges.json is still green (soft-skip)", () => {
  const dir = realRoot();
  rmSync(join(dir, "spine/edges.json"));
  const r = runGate(dir);
  // G-NET may report missing road geometry, but never a schema failure.
  assert.doesNotMatch(r.out, /G-EDGE-SCHEMA/);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
node --test 'scripts/tests/edges-schema.test.mjs'
```
Expected: FAIL — `ENOENT ... content/schemas/spine-edge.schema.json`.

- [ ] **Step 3: Write the schema**

Create `content/schemas/spine-edge.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "spine-edge.schema.json",
  "title": "Spine edge — one element of content/spine/edges.json. SHAPE ONLY: G-NET resolves the endpoints, G-CANON-LEG holds the leg distances to +/-8%, and neither bound is repeated here.",
  "definitions": {
    "ref": {
      "oneOf": [
        { "type": "object", "required": ["node"], "additionalProperties": false, "properties": { "node": { "type": "string" } } },
        { "type": "object", "required": ["feature"], "additionalProperties": false, "properties": { "feature": { "type": "string" } } },
        { "type": "object", "required": ["edge", "atIndex"], "additionalProperties": false, "properties": { "edge": { "type": "string" }, "atIndex": { "type": "integer", "minimum": 0 } } }
      ]
    },
    "km": { "type": "array", "minItems": 2, "items": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } } }
  },
  "type": "object",
  "required": ["id", "kind", "from", "to", "attrs"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^e-[a-z0-9]+(-[a-z0-9]+)*$" },
    "kind": { "enum": ["road", "relay", "leg", "sealane"] },
    "from": { "$ref": "#/definitions/ref" },
    "to": { "$ref": "#/definitions/ref" },
    "weight": { "enum": ["trunk", "spur", "track"] },
    "dashed": { "type": "boolean" },
    "points": { "$ref": "#/definitions/km" },
    "via": { "type": "object" },
    "attrs": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": { "type": "string" },
        "note": { "type": "string" },
        "label": { "type": "string" },
        "hours": { "type": "number" },
        "hoursLabel": { "type": "string" },
        "roadKm": { "type": "number" },
        "straightKm": { "type": "number" },
        "canonHours": { "type": ["number", "string"] },
        "labelAtIndex": { "type": "integer", "minimum": 0 },
        "throughRoute": { "type": "string" },
        "geoFrom": { "type": "string" },
        "geoTo": { "type": "string" },
        "sailDays": { "type": ["number", "string"] },
        "season": { "type": "string" },
        "amendedPending": { "type": "string" }
      }
    }
  },
  "allOf": [
    { "if": { "properties": { "kind": { "const": "road" } } },
      "then": { "required": ["weight", "dashed", "points"] } },
    { "if": { "properties": { "kind": { "const": "relay" } } },
      "then": { "required": ["via"], "not": { "required": ["points"] } } },
    { "if": { "properties": { "kind": { "const": "leg" } } },
      "then": { "not": { "anyOf": [{ "required": ["points"] }, { "required": ["weight"] }, { "required": ["via"] }] } } },
    { "if": { "properties": { "kind": { "const": "sealane" } } },
      "then": { "not": { "anyOf": [{ "required": ["points"] }, { "required": ["weight"] }, { "required": ["via"] }] } } }
  ]
}
```

- [ ] **Step 4: Wire the validation into `checkSpine`**

In `scripts/check_content.mjs`, immediately after the `loadSpine` block at `:1546-1548`:

```js
  const spine = loadSpine({ contentRoot: opts.contentRoot });
  for (const e of spine.errors) fail(`spine: ${e}`);
```

insert:

```js
  // Plan B Task 3 — G-EDGE-SCHEMA. edges.json carried 20 edges and no schema
  // until now; gSpineNet below reads it raw. Validation is SHAPE only (G-NET
  // owns endpoint resolution, G-CANON-LEG owns the distances). Soft-skip is
  // load-bearing: loadSpine returns [] for a content root with no edges.json,
  // and ~27 fixture roots have none, so an empty list validates vacuously and
  // the schema is only compiled when there is something to check.
  if (spine.edges.length) {
    const validateEdge = compileSchema(
      join(opts.contentRoot, "schemas/spine-edge.schema.json"), "spine-edge schema", fail);
    if (validateEdge)
      spine.edges.forEach((e, i) => {
        if (!validateEdge(e))
          for (const err of validateEdge.errors)
            fail(`G-EDGE-SCHEMA: spine/edges.json[${i}] (${e?.id ?? "?"}): ${err.instancePath || "/"} ${err.message}`);
      });
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
node --test 'scripts/tests/edges-schema.test.mjs'
```
Expected: PASS — 8 tests, 0 fail. The `G-EDGE-SCHEMA` message must match `spine/edges.json[0]`.

- [ ] **Step 6: Verify the whole spine lane**

Run:
```bash
node scripts/check_content.mjs --only=spine
node scripts/check_content.mjs --require-complete
npm test --prefix scripts
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add content/schemas/spine-edge.schema.json scripts/check_content.mjs scripts/tests/edges-schema.test.mjs
git commit -m "feat: G-EDGE-SCHEMA — a schema for content/spine/edges.json"
```

- [ ] **Step 8: QUALITY GATE — verify**

```bash
node --test 'scripts/tests/edges-schema.test.mjs'
node scripts/check_content.mjs --only=spine
git branch --show-current && git log --oneline -1
```

- [ ] **Step 9: QUALITY GATE — independent adversarial review**

Brief: *"Review `git show HEAD`. (a) Cross-check the schema's `attrs.properties` against a fresh census of every `attrs` key in `content/spine/edges.json` — run the census yourself, do not trust the plan's table. (b) The `allOf`/`if`/`then` blocks: confirm each one actually constrains (a draft-07 `if` with a `properties` clause and no `required` matches vacuously when `kind` is absent — is `kind` required? yes, so reason about whether that is enough). (c) Confirm the new validation runs BEFORE `gSpineNet`, so a malformed edge earns a schema failure rather than an obscure G-NET one. (d) Confirm the schema is not compiled at all on a fixture root with no `edges.json`."*

- [ ] **Step 10: QUALITY GATE — refactor** — new `fix:` commit.
- [ ] **Step 11: QUALITY GATE — re-verify** — repeat Step 6, then `git branch --show-current && git log --oneline -1`.

---

### Task 4: Hoist `derived` to `content/spine/derived.json`

**Files:**
- Create: `content/spine/derived.json`
- Modify: `scripts/check_spine_emit.mjs:41-47` (`NODE_FIELDS`), `:68-71` (the field loop), `:189-250` (`collectOutputs`)
- Modify: `scripts/lib/spine.mjs:227-233` (`loadSpine` returns `derived`)
- Modify: `scripts/check_content.mjs:1928-1930` (G-DERIVED-DRIFT) and `:1668-1671` (call site)
- Modify: `content/schemas/spine-node.schema.json:66` (drop the `derived` property)
- Modify: `tools/mapforge/lib/world-gen.mjs:313-316`, `tools/mapforge/gen-world.mjs:102-103`, `tools/mapforge/tests/world-gen.test.mjs:7,37-39,89` (the four `buildWorld({ atlasNode })` call sites)
- Test: extend `scripts/tests/spine-gates.test.mjs` (new cases only — every existing case survives verbatim)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `content/spine/derived.json` — one JSON object keyed by node id, values are the `deriveNode()` block, ids in ascending order, `canonStringify` bytes + trailing newline. Plan E re-emits it in the redraw commit.
  - `loadSpine({contentRoot})` now returns `derived: Record<string, object>` (`{}` when the file is absent), alongside `nodes`/`edges`/`sheet`/`roots`/`budgets`.
  - `buildWorld({ atlasNode, seedStreams })` — signature change; `seedStreams` is `derived["n-atlas"].resolvedSeedStreams`.

**Domain notes.** `derived` is **21,381 of 105,255 node bytes (20.3%)** and **925 of 4,488 committed lines (20.6%)**, and half of it (`resolvedSeedStreams` + `digest`) is content no human has ever read in review. Hoisting it makes a redraw's node diff **pure intent** — rings, seeds, composition, premise.

The migration is self-enforcing in three independent ways, which is why it is safe:
1. `canonicalNode()` rejects any node key outside `NODE_FIELDS` with `"${node.id}: unknown fields ..."`; removing `"derived"` from that list turns a leftover inline block into an emitter error.
2. Task 2 already closed the node schema root, so a leftover `derived` key is *also* a schema failure once the property is removed.
3. `G-DERIVED-DRIFT` compares the whole sidecar's bytes, so a hand-edit anywhere in it is one loud line.

**The one real consumer to re-point.** `grep -rn '\.derived'` across `scripts/` and `tools/` returns exactly six hits; four are internal to the emitter/gate and one is `gen-world.mjs:42`'s `delete obj.derived` (harmless). The sixth is real: `tools/mapforge/lib/world-gen.mjs:314-316` reads `atlasNode.derived.resolvedSeedStreams.terrain` and `.names`, and `tests/world-gen.test.mjs` feeds it `content/spine/nodes/n-atlas.json` straight off disk. Plan C deletes both files, but they are live **now**, so this task re-points them.

**Fixture safety.** `spineFixture()` (`spine-gates.test.mjs:212`) runs `check_spine_emit --write` on every fixture root before running the gate — so every fixture gets a sidecar for free. The two structural fixtures that *cannot* emit (`g-tree-cycle`, `g-id-duplicate-id`) are handled by the gate's `tree.errors.length` bail, which mirrors the emitter's own bail (`collectOutputs` returns `{errors}` before writing anything when `tree.errors.length`). Emitter and gate therefore agree exactly on **when the sidecar should exist**.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/spine-gates.test.mjs` (using the file's existing aliased imports — `t11`, `assert11`, `read11`, `write11`, `join11`, `ROOT11`, and the helpers `realSpineCopy`, `runEmit`, `spineFixture`, `runSpineGate`):

```js
// ─── Plan B Task 4 · derived hoisted to content/spine/derived.json ──────────
t11("no committed node file carries an inline derived block", () => {
  const dir = join11(ROOT11, "content/spine/nodes");
  for (const f of require11("node:fs").readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const doc = JSON.parse(read11(join11(dir, f), "utf8"));
    assert11.equal(doc.derived, undefined, `${f} still carries derived`);
  }
});

t11("the sidecar covers exactly the committed node ids, in ascending order", () => {
  const fs11 = require11("node:fs");
  const ids = fs11.readdirSync(join11(ROOT11, "content/spine/nodes"))
    .filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
  const side = JSON.parse(read11(join11(ROOT11, "content/spine/derived.json"), "utf8"));
  assert11.deepEqual(Object.keys(side), ids);
  for (const id of ids)
    assert11.ok(typeof side[id].digest === "string" && side[id].digest.startsWith("sha256:"), id);
});

t11("spine-emit --write emits the sidecar and --check is green after it", () => {
  const dir = realSpineCopy();
  assert11.equal(runEmit(dir, ["--write"]).code, 0);
  const first = read11(join11(dir, "spine/derived.json"), "utf8");
  assert11.equal(runEmit(dir, ["--write"]).code, 0);
  assert11.equal(read11(join11(dir, "spine/derived.json"), "utf8"), first, "not idempotent");
  assert11.equal(runEmit(dir, ["--check"]).code, 0);
});

t11("G-DERIVED-DRIFT red: one hand-edited number in the sidecar", () => {
  const dir = spineFixture({ mutate: (d) => {
    const p = join11(d, "spine/derived.json");
    const side = JSON.parse(read11(p, "utf8"));
    side[Object.keys(side)[0]].coveragePct = 99.9;
    write11(p, JSON.stringify(side, null, 2) + "\n");
  } });
  const r = runSpineGate(dir);
  assert11.equal(r.code, 1);
  assert11.match(r.out,
    /G-DERIVED-DRIFT: content\/spine\/derived\.json differs from the recomputed block/);
});

t11("G-DERIVED-DRIFT red: the sidecar is missing entirely", () => {
  const dir = spineFixture({ mutate: (d) => require11("node:fs").rmSync(join11(d, "spine/derived.json")) });
  const r = runSpineGate(dir);
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-DERIVED-DRIFT: content\/spine\/derived\.json is missing/);
});

t11("G-DERIVED-DRIFT red: a stale id left in the sidecar after a node is deleted", () => {
  const dir = spineFixture({ mutate: (d) => {
    const p = join11(d, "spine/derived.json");
    const side = JSON.parse(read11(p, "utf8"));
    side["n-ghost"] = side[Object.keys(side)[0]];
    write11(p, JSON.stringify(side, null, 2) + "\n");
  } });
  assert11.equal(runSpineGate(dir).code, 1);
});
```

Add `import { createRequire as cr11 } from "node:module"; const require11 = cr11(import.meta.url);` near the file's other aliased imports if a CJS `require` is not already available (the file is ESM).

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
node --test 'scripts/tests/spine-gates.test.mjs'
```
Expected: FAIL — six new failures. The first reports `n-atlas.json still carries derived`; the second `ENOENT ... content/spine/derived.json`.

- [ ] **Step 3: Emit the sidecar**

In `scripts/check_spine_emit.mjs`, drop `"derived"` from `NODE_FIELDS` (`:41-47`) so its last line becomes:

```js
  "tags", "levelBand",
];
```

and delete the `derived` branch from the field loop (`:70`), so `canonicalNode`'s loop reads:

```js
  const out = {};
  for (const k of NODE_FIELDS) {
    if (k === "interior") out.interior = interior;
    else if (doc[k] !== undefined) out[k] = doc[k];
  }
  return { bytes: canonStringify(out) + "\n" };
```

Add the sidecar builder just above `collectOutputs` (`:189`):

```js
// Plan B Task 4 — the hoisted `derived` block. One object keyed by node id,
// ids ASCENDING (readdir is already sorted and G-ID pins id === filename
// stem, but the sort is explicit so the bytes never depend on that coupling).
// Only ids BFS-reached from a root are derived: deriveNode -> composeToRoot
// loops forever on a cyclic parentId chain, which is already a G-TREE
// failure. collectOutputs bails on tree.errors before reaching here, so the
// gate's matching bail keeps emitter and gate agreeing on when this file
// should exist at all.
export function derivedSidecar({ tree, plans = [] }) {
  const out = {};
  for (const id of [...tree.byId.keys()].filter((i) => tree.depthOf.has(i)).sort())
    out[id] = deriveNode({ tree, id, plans });
  return canonStringify(out) + "\n";
}
```

and push it as an output inside `collectOutputs`, immediately after the node loop (`:206`, before the `n-cluster1` geography mirror push):

```js
  outputs.push({ path: join(contentRoot, "spine/derived.json"), bytes: derivedSidecar({ tree, plans }) });
```

- [ ] **Step 4: Teach `loadSpine` about the sidecar**

In `scripts/lib/spine.mjs`, extend the `empty` literal at `:196`:

```js
  const empty = { present: false, nodes: [], edges: [], derived: {}, sheet: null, roots: [], budgets: { load: null, coverage: null }, errors };
```

and, next to the `edges`/`sheet` reads at `:227-228`, add:

```js
  // Plan B Task 4: the hoisted derived block. ABSENT is not an error here —
  // G-DERIVED-DRIFT owns failing on it, exactly as G-LOAD-BUDGET owns a
  // missing budget file. Same soft-skip contract as edges/sheet above.
  const derived = existsSync(join(dir, "derived.json"))
    ? (readJsonInBand(join(dir, "derived.json"), "spine/derived.json") ?? {})
    : null;
```

and return it (`:233`):

```js
  return { present: true, nodes, edges, derived, sheet, roots, budgets, errors };
```

(`null` distinguishes *absent* from *present but empty*; `{}` in `empty` keeps the no-spine soft-skip shape harmless.)

- [ ] **Step 5: Turn G-DERIVED-DRIFT into one whole-file comparison**

In `scripts/check_content.mjs`, delete the per-node check at `:1928-1930`:

```js
    // G-DERIVED-DRIFT: recomputation reproduces the committed block.
    if (tree.depthOf.has(node.id) && !eq(node.derived, deriveNode({ tree, id: node.id, plans })))
      fail(`spine: G-DERIVED-DRIFT ${node.id}: committed derived block does not match recomputation`);
```

Add a new gate function beside `gSpineFrames`:

```js
// Plan B Task 4 — G-DERIVED-DRIFT, now ONE whole-file comparison against
// content/spine/derived.json instead of 44 per-node byte comparisons.
//
// Skipped entirely when the tree has errors, because check_spine_emit's
// collectOutputs bails on tree.errors before writing ANY output — so on a
// cyclic or dangling tree the sidecar legitimately does not exist and the
// G-TREE failure is the honest one to report. Recomputing here would also
// hang: deriveNode -> composeToRoot walks the ancestor chain to root.
//
// A checksum says THAT something changed, not WHAT — so the remedy is in the
// message, and `node scripts/check_spine_emit.mjs --write` regenerates it.
function gSpineDerived({ tree, plans, contentRoot, fail }) {
  if (tree.errors.length) return;
  const path = join(contentRoot, "spine/derived.json");
  if (!existsSync(path)) {
    fail(`G-DERIVED-DRIFT: content/spine/derived.json is missing — run \`node scripts/check_spine_emit.mjs --write\``);
    return;
  }
  let committed;
  try { committed = readFileSync(path, "utf8"); }
  catch (e) { fail(`G-DERIVED-DRIFT: content/spine/derived.json is unreadable: ${e.message}`); return; }
  const recomputed = derivedSidecar({ tree, plans });
  if (committed !== recomputed) {
    const cIds = Object.keys(JSON.parse(committed));
    const rIds = Object.keys(JSON.parse(recomputed));
    const stale = cIds.filter((i) => !rIds.includes(i));
    const missing = rIds.filter((i) => !cIds.includes(i));
    fail(`G-DERIVED-DRIFT: content/spine/derived.json differs from the recomputed block` +
      (stale.length ? ` — stale ids: ${stale.join(", ")}` : "") +
      (missing.length ? ` — missing ids: ${missing.join(", ")}` : "") +
      ` — run \`node scripts/check_spine_emit.mjs --write\``);
  }
}
```

Import `derivedSidecar` at the top of `check_content.mjs` (it lives in the emitter, which is already importable — `check_spine_emit.mjs` exports `emitGeography`, `canonStringify` and `collectOutputs` today and has no bare `main()` side effect on import):

```js
import { derivedSidecar } from "./check_spine_emit.mjs";
```

and call it right after `gSpineFrames` (`:1671`):

```js
  gSpineFrames({ nodes: validNodes, tree, plans: townPlans, fail });
  gSpineDerived({ tree, plans: townPlans, contentRoot: opts.contentRoot, fail });
```

- [ ] **Step 6: Drop `derived` from the node schema**

In `content/schemas/spine-node.schema.json`, delete the property at `:66`:

```json
    "levelBand": { "type": ["array", "null"] },
    "derived": { "type": "object" }
```
becomes:
```json
    "levelBand": { "type": ["array", "null"] }
```

With Task 2's `additionalProperties: false` root already in place, a leftover inline `derived` is now a schema failure as well as an emitter failure.

- [ ] **Step 7: Re-point the one real consumer**

In `tools/mapforge/lib/world-gen.mjs`, change `:313-316`:

```js
export function buildWorld({ atlasNode }) {
  const terrain = atlasNode.derived.resolvedSeedStreams.terrain;
  const rand = rng(terrain);
  const nameRand = rng(atlasNode.derived.resolvedSeedStreams.names);
```
to:
```js
// Plan B Task 4: `derived` moved out of the node file into
// content/spine/derived.json, so the caller passes the streams in. Keeping
// the read inside this function would make a pure library do file I/O.
export function buildWorld({ atlasNode, seedStreams }) {
  const terrain = seedStreams.terrain;
  const rand = rng(terrain);
  const nameRand = rng(seedStreams.names);
```

In `tools/mapforge/gen-world.mjs`, change `:102-103`:

```js
  const atlasNode = readJson(join(realContentRoot, "spine/nodes/n-atlas.json"));
  const { nodes: candidateNodes, edges: candidateEdges, summary } = buildWorld({ atlasNode });
```
to:
```js
  const atlasNode = readJson(join(realContentRoot, "spine/nodes/n-atlas.json"));
  const seedStreams = readJson(join(realContentRoot, "spine/derived.json"))["n-atlas"].resolvedSeedStreams;
  const { nodes: candidateNodes, edges: candidateEdges, summary } =
    buildWorld({ atlasNode, seedStreams });
```

In `tools/mapforge/tests/world-gen.test.mjs`, add next to the `atlasNode` read at `:11`:

```js
const seedStreams = JSON.parse(
  readFileSync(resolve(ROOT, "content/spine/derived.json"), "utf8"))["n-atlas"].resolvedSeedStreams;
```
and change every `buildWorld({ atlasNode })` call (`:38`, `:39`, `:89`) to `buildWorld({ atlasNode, seedStreams })`.

- [ ] **Step 8: Regenerate and verify**

Run:
```bash
node scripts/check_spine_emit.mjs --write
node scripts/check_spine_emit.mjs --check
node scripts/check_content.mjs --only=spine
node --test 'scripts/tests/spine-gates.test.mjs'
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_render_lock.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: all exit 0. `--write` rewrites all 44 node files (removing `derived`) and creates `content/spine/derived.json`. `git status` must show exactly 45 modified/created files under `content/spine/` and **nothing** under `game-client/`, `content/maps/` or `colyseus-server/`.

- [ ] **Step 9: Check the byte budget did not move the wrong way**

Run:
```bash
node scripts/check_content.mjs --only=spine 2>&1 | grep spine-load
```
Expected: a line of the form `spine-load: 44 nodes, <bytes> bytes (budget 96 nodes, 786432 bytes)`. The byte count should land within a few hundred bytes of today's 119,880 — `derived` moved, it did not vanish, and the sidecar adds one id key per node. **If it grew by more than 5%**, `derivedSidecar` is not using `canonStringify`.

- [ ] **Step 10: Commit**

```bash
git add content/spine content/schemas/spine-node.schema.json scripts/check_spine_emit.mjs scripts/lib/spine.mjs scripts/check_content.mjs scripts/tests/spine-gates.test.mjs tools/mapforge/lib/world-gen.mjs tools/mapforge/gen-world.mjs tools/mapforge/tests/world-gen.test.mjs
git commit -m "refactor: hoist derived blocks to content/spine/derived.json"
```

- [ ] **Step 11: QUALITY GATE — verify**

```bash
./scripts/integration.sh --no-install 2>&1 | tail -25
git branch --show-current && git log --oneline -1
```
Expected: the GATE 2 SUMMARY block with every section `PASS`.

- [ ] **Step 12: QUALITY GATE — independent adversarial review**

Brief: *"Review `git show HEAD`. This commit moves 20% of the spine's bytes. (a) Confirm `derivedSidecar` and `gSpineDerived` iterate the **identical** id set — an off-by-one in the `depthOf` filter makes the gate permanently red or permanently blind. (b) Confirm importing `check_spine_emit.mjs` from `check_content.mjs` does not create an import cycle or run `main()` on import (check the entry guard at the bottom of both files). (c) The `tree.errors.length` bail: prove the `g-tree-cycle` and `g-id-duplicate-id` fixtures still produce their original assertions and no new noise. (d) Confirm `mapDimensions.ts` and `content/maps/cluster1-geography.json` are byte-identical to their pre-commit versions — `git show HEAD --stat` must not list them. (e) Confirm no remaining reader of `node.derived` exists: run `grep -rn '\.derived' scripts/ tools/ colyseus-server/src/` yourself."*

- [ ] **Step 13: QUALITY GATE — refactor** — new `fix:` commit.
- [ ] **Step 14: QUALITY GATE — re-verify** — repeat Steps 8 and 11, then `git branch --show-current && git log --oneline -1`.

---

### Task 5: 20 biomes, 18 terrain kinds, `budgets.json`, `G-LANDFORM` and `G-SHEET-BUDGET`

**Files:**
- Modify: `scripts/lib/spine.mjs:47-60` (`BIOMES`, `TERRAIN_KINDS`, `TERRAIN_IMPLIES`)
- Create: `content/world/budgets.json`
- Modify: `scripts/check_content.mjs:1682` — new `gSpineWorld`, called from `checkSpine` immediately after `gSpineBudgets`
- Test: `scripts/tests/world-budget.test.mjs`

**Interfaces:**
- Consumes: `content/world/lexicon/landforms.json` (Task 1).
- Produces:
  ```js
  export const BIOMES: readonly string[]        // 20, exact order below
  export const TERRAIN_KINDS: readonly string[] // 18, exact order below
  export const TERRAIN_IMPLIES: Readonly<Record<string, string[]>>  // 18 rows
  ```
  and `content/world/budgets.json` — Plan C adds its `fabric` and `civil` sections to the same file.

**Domain notes.** `G-COMP-SUM` (`check_content.mjs:1629-1637`) already validates composition keys against `BIOMES`, and `G-TERRAINKIND` (`spine.mjs:637-653`, wired at `:1723`) already validates `terrainKind` against `TERRAIN_KINDS` and enforces the forward-only implication ("a declared kind's implied biomes must each be >= 15% of composition"). **Both gates grow for free** — this task only widens the two frozen arrays. No committed node uses any new value, so the corpus is unchanged.

`tidal-mire` is marked **wired, not new**: the `pMire` pattern already exists in `draft.mjs:216-222` and already has a `TERRAIN_LEGEND` row, but no `terrainKind` reaches it — it is legended-but-unreachable, one of the three inconsistencies `G-BIOME-INK` closes in Task 6.

`lava` and `ash` are deliberately **split**: ash is a walkable depositional plain (the Cindervast reading), lava is an impassable flow field. Splitting them is what lets a volcanic arc read as an arc rather than a smudge.

`G-LANDFORM` in this task is the **catalogue half only** — there is no fabric yet, so the instance half soft-skips and prints a score. Spec R8's discipline applies: it *scores* coverage (`types placed: 154 / 170`) and fails only below the floor, the always-exit-0-report pattern `scripts/report_season1.mjs` already proves.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/world-budget.test.mjs`:

```js
// Plan B Task 5 — the grown vocabulary, the world budget file, and the two
// gates that read them. Both PRINT on every run (the
// G-LOAD-BUDGET / G-COMP-REPORT discipline) so drift is visible before it is
// a failure; G-LANDFORM SCORES coverage and fails only below the floor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BIOMES, TERRAIN_KINDS, TERRAIN_IMPLIES } from "../lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");
const LEX = JSON.parse(readFileSync(join(ROOT, "content/world/lexicon/landforms.json"), "utf8"));

function realRoot() {
  const dir = mkdtempSync(join(tmpdir(), "world-budget-"));
  cpSync(join(ROOT, "content"), dir, { recursive: true });
  return dir;
}
function runGate(dir) {
  try {
    return { code: 0, out: execFileSync(process.execPath,
      [GATE, "--only=spine", "--content-root", dir], { encoding: "utf8" }) };
  } catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}

test("BIOMES is exactly the 20 pinned ids in the pinned order", () => {
  assert.deepEqual([...BIOMES], [
    "ocean", "ice", "marsh", "river", "meadow", "forest", "bramble", "rock",
    "upland", "alkali", "ash", "built",
    "tundra", "lake", "scree", "karst", "badland", "desert", "lava", "reef"]);
});

test("TERRAIN_KINDS is exactly the 18 pinned ids in the pinned order", () => {
  assert.deepEqual([...TERRAIN_KINDS], [
    "ice", "upland", "alkali-flat", "rim", "bramble", "headland", "river-country",
    "tundra-steppe", "sand-sea", "badlands", "karst-plateau", "volcanic-arc",
    "lava-field", "cloud-forest", "reef-shelf", "fjordland", "lake-country", "tidal-mire"]);
});

test("every terrain kind implies at least one biome, and every implied biome is a biome", () => {
  assert.equal(Object.keys(TERRAIN_IMPLIES).length, 18);
  for (const kind of TERRAIN_KINDS) {
    const implied = TERRAIN_IMPLIES[kind];
    assert.ok(Array.isArray(implied) && implied.length > 0, `${kind}: no implication`);
    for (const b of implied) assert.ok(BIOMES.includes(b), `${kind} implies non-biome "${b}"`);
  }
});

test("every biome named by a lexicon row is in BIOMES", () => {
  for (const r of LEX)
    for (const b of r.biomes)
      assert.ok(BIOMES.includes(b), `${r.id}: biome "${b}" is outside BIOMES`);
});

test("budgets.json pins cellKm and the landform + sheet caps", () => {
  const b = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  assert.equal(b.cellKm, 0.5);
  assert.deepEqual(b.landforms, {
    maxInstances: 2400, maxNamed: 500, minTypes: 100, maxTypes: 200,
    typeCoverageFloor: 100, dungeonCapableTypes: 23 });
  assert.deepEqual(b.sheets, {
    maxSheets: 18, maxSvgBytes: 524288, maxRasterSeconds: 2, rasterWidthPx: 2000 });
});

test("the gate PRINTS a world-budget line for landforms on every run", () => {
  const r = runGate(realRoot());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^world-budget: landforms 170 types, 0 instances \(budget 100-200 types, 2400 instances\)$/m);
  assert.match(r.out, /^G-LANDFORM: types placed: 0 \/ 170$/m);
});

test("G-LANDFORM red: a spine feature cites a type that is not in the lexicon", () => {
  const dir = realRoot();
  const p = join(dir, "spine/nodes/n-cluster1.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc.features[0].type = "not-a-landform";
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /G-LANDFORM: .*type "not-a-landform" is not in the lexicon/);
  rmSync(dir, { recursive: true, force: true });
});

test("G-LANDFORM red: a feature's kind contradicts its lexicon geometry", () => {
  const dir = realRoot();
  const p = join(dir, "spine/nodes/n-cluster1.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  const line = doc.features.find((f) => f.kind === "line");
  line.type = "karst-cenote"; // lexicon geometry is "point"
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /G-LANDFORM: .*kind "line" but lexicon geometry is "point"/);
  rmSync(dir, { recursive: true, force: true });
});

test("soft-skip: a content root with no content/world/ is still green", () => {
  const dir = realRoot();
  rmSync(join(dir, "world"), { recursive: true, force: true });
  const r = runGate(dir);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /G-LANDFORM|G-SHEET-BUDGET/);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
node --test 'scripts/tests/world-budget.test.mjs'
```
Expected: FAIL — `BIOMES` has 12 entries, `TERRAIN_KINDS` has 7, and `content/world/budgets.json` does not exist.

- [ ] **Step 3: Grow the vocabulary**

In `scripts/lib/spine.mjs`, replace `:47-60` with:

```js
export const BIOMES = Object.freeze([
  "ocean", "ice", "marsh", "river", "meadow", "forest",
  "bramble", "rock", "upland", "alkali", "ash", "built",
  // Plan B Task 5 (+8): `lava` and `ash` are deliberately SPLIT — ash is a
  // walkable depositional plain (the Cindervast reading), lava an impassable
  // flow field. Splitting them is what lets a volcanic arc read as an arc.
  "tundra", "lake", "scree", "karst", "badland", "desert", "lava", "reef",
]);
export const TERRAIN_KINDS = Object.freeze([
  "ice", "upland", "alkali-flat", "rim", "bramble", "headland", "river-country",
  // Plan B Task 5 (+11). `tidal-mire` is WIRED, NOT NEW: the pMire pattern and
  // its legend row already exist (draft.mjs) and no terrainKind reached them —
  // legended-but-unreachable, one of the three loops G-BIOME-INK closes.
  "tundra-steppe", "sand-sea", "badlands", "karst-plateau", "volcanic-arc",
  "lava-field", "cloud-forest", "reef-shelf", "fjordland", "lake-country", "tidal-mire",
]);
// forward-only: terrainKind is AUTHORED; each implied biome must appear in
// composition at >= 15% (G-TERRAINKIND, Phase 3). Never derived backwards.
export const TERRAIN_IMPLIES = Object.freeze({
  ice: ["ice"], upland: ["upland"], "alkali-flat": ["alkali"], rim: ["rock"],
  bramble: ["bramble"], headland: ["rock", "meadow"], "river-country": ["river", "meadow"],
  "tundra-steppe": ["tundra"], "sand-sea": ["desert"], badlands: ["badland"],
  "karst-plateau": ["karst"], "volcanic-arc": ["ash"], "lava-field": ["lava"],
  "cloud-forest": ["forest"], "reef-shelf": ["reef"], fjordland: ["rock", "ice"],
  "lake-country": ["lake"], "tidal-mire": ["marsh"],
});
```

- [ ] **Step 4: Write the budget file**

Create `content/world/budgets.json`:

```json
{
  "version": 1,
  "about": "Budgets for the layers that live OUTSIDE content/spine/ and are therefore invisible to G-LOAD-BUDGET. Every gate that reads this file PRINTS its measurement on every run — the G-LOAD-BUDGET / G-COMP-REPORT discipline — so drift is visible long before it is a failure. Plan B's gSpineWorld owns the `landforms` and `sheets` sections (G-LANDFORM, G-SHEET-BUDGET); Plan C adds `fabric`, `civil` and `loop` and owns G-WORLD-BUDGET, including this file's existence check.",
  "cellKm": 0.5,
  "cellKmWhy": "PINNED CONSTANT, same discipline as KM_TO_U = 100 and SPINE_CELL_KM = 0.05. 0.5 km over the 400 x 400 km frame is an 800 x 800 grid = 640,000 cells ~= 14.7 MB resident. Changing it changes every landform predicate's meaning.",
  "landforms": {
    "maxInstances": 2400,
    "maxNamed": 500,
    "minTypes": 100,
    "maxTypes": 200,
    "typeCoverageFloor": 100,
    "dungeonCapableTypes": 23
  },
  "sheets": {
    "maxSheets": 18,
    "maxSheetsWhy": "The roster, enumerated: 1 atlas + 1 basin + 13 continent (Plan E) + 1 overlay + 1 fabric (Plan C) + 1 synthetic (Plan B) = 18. The design's \"<= 16\" counted the shipped chart only (1 atlas + 13 continents + 1 basin + 1 overlay) and omitted the three review sheets the owner's every-artifact-observable rule requires. Raising this cap without adding a line here is a budget failure, not a fix.",
    "maxSvgBytes": 524288,
    "maxRasterSeconds": 2,
    "rasterWidthPx": 2000
  }
}
```

- [ ] **Step 5: Write the gate**

In `scripts/check_content.mjs`, add beside the other `gSpine*` helpers:

```js
// Plan B Task 5 — G-LANDFORM + G-SHEET-BUDGET.
//
// OWNERSHIP: G-WORLD-BUDGET is Plan C's gate, living in scripts/lib/world.mjs.
// It owns content/world/budgets.json's existence, the fabric/civil families,
// and the contract-pinned `world-budget: <family> <n> files, <n> bytes
// (budget <n>, <n>)` line. This gate reads two SECTIONS of the same file and
// reports under its own ids, so the two never double-report the same defect.
//
// SOFT-SKIP is load-bearing: a content root with no content/world/ is legal
// (every one of the ~27 spine fixtures is one), so absence reports NOTHING.
// This mirrors checkSpine's own bail on a missing content/spine.
//
// The instance half is dormant until Plan C writes content/world/fabric/.
// Until then the coverage line still PRINTS ("types placed: 0 / 170") — a
// score, not a failure, exactly as scripts/report_season1.mjs does. The floor
// only bites once a fabric exists, because a quota that cannot be met against
// real terrain must degrade and be reported, never deadlock (spec R8).
function gSpineWorld({ tree, contentRoot, fail }) {
  const worldDir = join(contentRoot, "world");
  if (!existsSync(worldDir)) return;

  const lexPath = join(worldDir, "lexicon/landforms.json");
  const budPath = join(worldDir, "budgets.json");
  if (!existsSync(lexPath)) { fail(`G-LANDFORM: ${lexPath} is missing`); return; }
  // The budgets.json-missing branch belongs to Plan C's G-WORLD-BUDGET, which
  // owns that file and prints the contract-pinned `world-budget: <family> …`
  // line. Reporting it here too would double-report once Plan C lands, so this
  // gate only bails quietly and lets the owner speak.
  if (!existsSync(budPath)) return;
  const lex = readJson(lexPath, "world/lexicon/landforms.json", fail);
  const budgets = readJson(budPath, "world/budgets.json", fail);
  if (!lex || !budgets) return;

  const byId = new Map(lex.map((r) => [r.id, r]));
  const { minTypes, maxTypes, maxInstances, maxNamed, typeCoverageFloor, dungeonCapableTypes } = budgets.landforms;

  if (lex.length < minTypes || lex.length > maxTypes)
    fail(`G-LANDFORM: catalogue holds ${lex.length} types — budget is ${minTypes}-${maxTypes}`);
  const dCount = lex.filter((r) => r.dungeonCapable).length;
  if (dCount !== dungeonCapableTypes)
    fail(`G-LANDFORM: ${dCount} dungeonCapable types, budget pins ${dungeonCapableTypes} — dungeon binding depends on this number`);

  // Trunk features may cite a lexicon type. Fabric instances are NOT node
  // features (spec 5.6) — trunk features are the network, fabric is texture.
  for (const node of tree.byId.values())
    for (const f of node.features ?? []) {
      if (f.type == null) continue;
      const row = byId.get(f.type);
      if (!row) { fail(`G-LANDFORM: ${node.id}/${f.id}: type "${f.type}" is not in the lexicon`); continue; }
      if (row.geometry !== f.kind)
        fail(`G-LANDFORM: ${node.id}/${f.id}: kind "${f.kind}" but lexicon geometry is "${row.geometry}"`);
    }

  // Instance census over content/world/fabric/, dormant until Plan C.
  const fabricDir = join(worldDir, "fabric");
  const placed = new Set();
  let instances = 0, named = 0;
  if (existsSync(fabricDir))
    for (const f of readdirSync(fabricDir).filter((x) => x.endsWith(".json")).sort()) {
      const doc = readJson(join(fabricDir, f), `world/fabric/${f}`, fail);
      for (const inst of doc?.instances ?? []) {
        instances++;
        if (inst.named) named++;
        placed.add(inst.type);
      }
    }

  console.log(`world-budget: landforms ${lex.length} types, ${instances} instances (budget ${minTypes}-${maxTypes} types, ${maxInstances} instances)`);
  console.log(`G-LANDFORM: types placed: ${placed.size} / ${lex.length}`);
  if (instances > maxInstances) fail(`G-LANDFORM: ${instances} landform instances > budget ${maxInstances}`);
  if (named > maxNamed) fail(`G-LANDFORM: ${named} named landforms > budget ${maxNamed}`);
  if (existsSync(fabricDir)) {
    if (placed.size < typeCoverageFloor)
      fail(`G-LANDFORM: types placed: ${placed.size} / ${lex.length} — below the floor of ${typeCoverageFloor}`);
    for (const row of lex)
      if (!placed.has(row.id) && row.absentBecause === null)
        fail(`G-LANDFORM: type "${row.id}" has 0 instances and no absentBecause`);
  }

  // Sheet budget: measured against whatever sheets exist on disk today.
  const mapsDir = join(contentRoot, "../game-client/assets/art/maps");
  if (existsSync(mapsDir)) {
    const svgs = readdirSync(mapsDir).filter((f) => f.endsWith(".svg")).sort();
    let worst = 0, worstName = "";
    for (const f of svgs) {
      const b = statSync(join(mapsDir, f)).size;
      if (b > worst) { worst = b; worstName = f; }
    }
    console.log(`world-budget: sheets ${svgs.length} files, ${worst} bytes largest (${worstName || "none"}) (budget ${budgets.sheets.maxSheets}, ${budgets.sheets.maxSvgBytes})`);
    if (svgs.length > budgets.sheets.maxSheets)
      fail(`G-SHEET-BUDGET: ${svgs.length} sheets > budget ${budgets.sheets.maxSheets}`);
    if (worst > budgets.sheets.maxSvgBytes)
      fail(`G-SHEET-BUDGET: sheet ${worstName} is ${worst} bytes > budget ${budgets.sheets.maxSvgBytes}`);
  }
}
```

Call it from `checkSpine`, immediately after `gSpineBudgets` (`:1682`):

```js
  gSpineBudgets({ spine, tree, plans: townPlans, contentRoot: opts.contentRoot, fail });
  gSpineWorld({ tree, contentRoot: opts.contentRoot, fail });
```

Confirm `statSync` and `readdirSync` are already imported at the top of `check_content.mjs` (they are — `gSpineBudgets` uses both).

- [ ] **Step 6: Run the test to verify it passes**

Run:
```bash
node --test 'scripts/tests/world-budget.test.mjs'
```
Expected: PASS — 10 tests, 0 fail.

- [ ] **Step 7: Verify the whole spine lane and the Gate 1 budget**

Run:
```bash
node scripts/check_content.mjs --only=spine
time node scripts/check_content.mjs --only=spine > /dev/null
npm test --prefix scripts
node scripts/check_spine_emit.mjs --check
node scripts/check_render_lock.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: all exit 0. The **timing** matters: `--only=spine` must stay under **4 s** — Plan A's exact-clipping swap put it near 1 s, and `gSpineWorld`'s per-gate budget is 0.03 s (G-LANDFORM) + a directory stat. If the run exceeds 4 s, `gSpineWorld` is doing something quadratic; fix it here, not later.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/spine.mjs content/world/budgets.json scripts/check_content.mjs scripts/tests/world-budget.test.mjs
git commit -m "feat: 20 biomes, 18 terrain kinds, G-LANDFORM + G-SHEET-BUDGET"
```

- [ ] **Step 9: QUALITY GATE — verify**

```bash
node scripts/check_content.mjs --only=spine 2>&1 | grep -E 'world-budget|G-LANDFORM|spine-load'
npm test --prefix scripts 2>&1 | tail -15
git branch --show-current && git log --oneline -1
```

- [ ] **Step 10: QUALITY GATE — independent adversarial review**

Brief: *"Review `git show HEAD`. (a) Widening `BIOMES` **loosens** `G-COMP-SUM` — confirm no committed node's composition contained a key that was previously a failure and is now silently accepted (compare `git show HEAD~1:scripts/lib/spine.mjs` against every committed `composition` object). (b) Confirm every one of the 11 new `TERRAIN_IMPLIES` rows names biomes that a real region could plausibly reach 15% of, and that no new kind implies **three or more** biomes (that makes the kind unusable). (c) The soft-skip: prove `gSpineWorld` returns before any `readJson` when `content/world/` is absent, and run the full `npm test --prefix scripts` to confirm zero fixture regressions. (d) The sheets budget reaches OUTSIDE the content root via `join(contentRoot, '../game-client/...')` — confirm that is guarded by `existsSync` and cannot fail on a temp fixture root."*

- [ ] **Step 11: QUALITY GATE — refactor** — new `fix:` commit.
- [ ] **Step 12: QUALITY GATE — re-verify** — repeat Step 7, then `git branch --show-current && git log --oneline -1`.

---

## ▶ HANDOFF BOUNDARY — Plan C may start here

Everything Plan C's fabric generator needs from Plan B now exists. Confirm all six before signalling the handoff:

```bash
node -e "const l=require('./content/world/lexicon/landforms.json'); \
  console.log('types', l.length, 'memberships', l.reduce((n,r)=>n+1+r.alsoGroups.length,0), \
  'dual', l.filter(r=>r.alsoGroups.length).length, 'dungeon', l.filter(r=>r.dungeonCapable).length)"
node -e "import('./scripts/lib/spine.mjs').then(m=>console.log('BIOMES',m.BIOMES.length,'KINDS',m.TERRAIN_KINDS.length))"
ls content/schemas/landform-instance.schema.json content/schemas/spine-edge.schema.json content/world/budgets.json content/spine/derived.json
node scripts/check_content.mjs --only=spine && node scripts/check_spine_emit.mjs --check
node scripts/check_render_lock.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
```

| Must be true | Value |
| --- | --- |
| `landforms.json` census | `types 170 memberships 178 dual 8 dungeon 23` |
| Vocabulary | `BIOMES 20 KINDS 18` |
| Schemas on disk | `landform-instance`, `spine-edge`, plus the tightened `spine-node` |
| `budgets.json` | present, `cellKm: 0.5` |
| `derived.json` | present, `G-DERIVED-DRIFT` green |
| Sheets | **byte-identical** — the render lock is green *without* `--write` |

**Plan C additionally needs, and Plan B does not provide:** `content/world/manifest.json`, `content/world/premises/*.json`, `content/world/fabric/`, `content/world/handles/`. Those are Plan C's own first tasks.

Tasks 6–12 below are Plan B's render half and run **in parallel with Plan C**, in the same worktree or a separate one. They touch `tools/mapforge/`, `tools/asset-storybook/`, `scripts/bake_thumbnails.mjs`, `game-client/assets/art/art-manifest.json` and the two sheet SVGs.

**Parallel does not mean disjoint — five files are written by BOTH lanes, and four of them are hash-bearing or generated. Merge order is therefore part of the contract, not a preference:**

| Contested file | Plan B writes | Plan C writes | Rule |
| --- | --- | --- | --- |
| `content/world/budgets.json` | `landforms` + `sheets` + `cellKm` (Task 5) | appends `fabric`, `civil`, `loop` | Plan B never edits it again after Task 5; a genuine append, safe to text-merge |
| `content/world/render-lock.json` | one artifact line (Task 10), re-baselined (Task 12) | adds the fabric/overlay artifact paths (its Task 13) | **NEVER TEXT-MERGE.** Plan C rebases onto Plan B's Task 12 and re-runs `node scripts/check_render_lock.mjs --write` |
| `tools/asset-storybook/maps-index.json` | adds `synthetic`; rewrites every `png` to a ≤ 512 px thumb path (Tasks 10, 11) | adds `fabric` + `overlay` | Plan C re-applies its two rows **on top of** B's thumb-path rewrite, then re-runs `node --test tools/asset-storybook/tests/*.test.mjs` |
| `game-client/assets/art/art-manifest.json` | `art:map-*` `gen.raster` thumb width (Task 11) | adds its own `art:map-*` rows | Plan C re-applies on top of B's rewritten `gen.raster` block, then `node scripts/bake_thumbnails.mjs` + `node scripts/check_asset_manifest.mjs` |
| `tools/mapforge/render-sheet.mjs` `SHEETS` | registers `synthetic` (Task 10) + the `--png` opt-in (Task 11) | registers `fabric` + `overlay` | Plan C's registry entries are re-applied after B's `--png`/`--png-width` change, never merged around it |

**The rule in one line: Plan C's Task 13 rebases onto Plan B's Task 12 and REGENERATES the lock and the thumbs (`node scripts/check_render_lock.mjs --write`, `node scripts/bake_thumbnails.mjs`) rather than resolving a JSON conflict by hand.** A textual auto-merge of a hash-bearing lock produces a file that is green against neither lane, and the failure surfaces two tasks later as an unexplained drift line. Plan B's Task 12 is unaffected by the ordering and does not wait for Plan C.

---

# PHASE 3 — RENDER CAPABILITY (Tasks 6–12)

**The invariant for Tasks 6–11:** every capability is proved on a **synthetic** sheet; the two live sheets stay byte-identical and `node scripts/check_render_lock.mjs --check` is green **without** `--write` on every one of these commits. Task 12 is the only re-ink.

---

### Task 6: Close the ink loop — 20 biome fills, 18 terrain fills, one legend, `G-BIOME-INK`

**Files:**
- Modify: `tools/mapforge/lib/draft.mjs:36-53` (`FILL_FOR`, `TERRAIN_LEGEND`), `:165-246` (`pat`, `patternDefs`)
- Create: `tools/mapforge/lib/ink.mjs`
- Test: `tools/mapforge/tests/biome-ink.test.mjs`

**Interfaces:**
- Consumes: `BIOMES`, `TERRAIN_KINDS` from `scripts/lib/spine.mjs` (Task 5).
- Produces:
  ```js
  // tools/mapforge/lib/draft.mjs
  export const BIOME_FILL: Record<string /*biome*/, string /*patternId*/>   // 20 entries, NEW
  export const FILL_FOR:   Record<string /*terrainKind*/, string>           // 18 entries
  export const LEGEND: Array<{ pattern: string, label: string, tier: number }>  // 25 rows
  export const PATTERNS: Record<string /*patternId*/, string /*svg <pattern> markup*/>
  export const LEGACY_PATTERN_IDS: readonly string[]  // the 8 ids today's sheets emit, in order
  export function patternDefs({ includeReported = false, frontierTiers = false, baked = false, ids = LEGACY_PATTERN_IDS }): string
  export const TERRAIN_LEGEND: Array<[string, string]>  // derived alias: LEGEND tier <= 1 as [pattern, label]

  // tools/mapforge/lib/ink.mjs
  export function checkBiomeInk({ emittedIds = null, referencedIds = null, legendTier = null }): string[]
  ```
- **Owned addition to the shared contract:** `patternDefs` gains an `ids` parameter and a `frontierTiers` parameter. Without `ids`, adding 13 patterns to the global emit list changes both live sheets' `<defs>` bytes and breaks the Task 6–11 invariant. `ids` defaults to `LEGACY_PATTERN_IDS`, so both live sheets are byte-identical by construction. **`frontierTiers` exists for the same reason and is the easier one to get wrong:** `tools/mapforge/lib/atlas-sheet.mjs:287` calls `patternDefs({ includeReported: true })` today and emits **9** patterns. Folding the three new provenance hatches (`pReportedSworn`, `pReportedHearsay`, `pReportedInferred`) into `includeReported` would make that same call emit 12 — so `atlas-world.svg`'s `<defs>` would move at **Task 6**, two tasks before its licensed re-ink, and Task 6 Step 7's `git status --porcelain game-client/` + `check_render_lock --check` would both go red. So `includeReported` still appends exactly `pReported`, and the three densities need `frontierTiers: true`. The synthetic sheet (Task 10) and Plan E's continent sheets pass them explicitly; Task 12's Adoption 1 rewrites the atlas `<defs>` to a computed `ids` list and can then drop both flags.

**Domain notes.** Spec correction **C7**, verified: `FILL_FOR` (`draft.mjs:36-44`) has 7 entries keyed by **`terrainKind`, not biome** — there are **zero biome fills in the repo**. `patternDefs()` emits **8** patterns plus `pReported`. `TERRAIN_LEGEND` has **6** rows, listing `pMire` (unreachable until Task 5 wired `tidal-mire`) and omitting `pRock`/`pRiver` (reachable). The atlas sheet is worse: `atlas-sheet.mjs:373` is its only `fill="url(...)"` call, choosing between exactly two patterns, and the file has **no legend block at all**.

The failure is **loud, not silent**: `basin-sheet.mjs:200-202` pushes `no fill for terrainKind` into `problems`, which hard-fails the CLI. `G-BIOME-INK` generalises that into a closure over four loops.

`G-BIOME-INK` runs in the **sheet build** (`problems[]`), not in `checkSpine` — it needs a built sheet's emitted and referenced pattern sets. The vocabulary half of the closure is pure and is also asserted directly by the unit test, so a regression is caught without building anything.

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/biome-ink.test.mjs`:

```js
// Plan B Task 6 — G-BIOME-INK closes THREE loops, not one, and it goes red on
// today's tables. A pattern emitted but unreachable, or legended but
// unreachable, is ALSO a failure: unreachable ink is ink nobody can explain.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BIOME_FILL, FILL_FOR, LEGEND, PATTERNS, LEGACY_PATTERN_IDS, TERRAIN_LEGEND, patternDefs }
  from "../lib/draft.mjs";
import { checkBiomeInk } from "../lib/ink.mjs";
import { BIOMES, TERRAIN_KINDS } from "../../../scripts/lib/spine.mjs";

const reachable = () => new Set([...Object.values(BIOME_FILL), ...Object.values(FILL_FOR),
  "pReported", "pReportedSworn", "pReportedHearsay", "pReportedInferred"]);

test("loop 1: every biome has a fill", () => {
  assert.equal(Object.keys(BIOME_FILL).length, 20);
  for (const b of BIOMES) assert.ok(BIOME_FILL[b], `biome "${b}" has no BIOME_FILL entry`);
});

test("loop 2: every terrain kind has a fill", () => {
  assert.equal(Object.keys(FILL_FOR).length, 18);
  for (const k of TERRAIN_KINDS) assert.ok(FILL_FOR[k], `terrain kind "${k}" has no FILL_FOR entry`);
});

test("loop 3: every referenced pattern exists in the PATTERNS registry", () => {
  for (const id of reachable()) assert.ok(PATTERNS[id], `pattern "${id}" is referenced but never defined`);
});

test("loop 4: every reachable pattern has exactly one legend row, and nothing else does", () => {
  const legendIds = LEGEND.map((r) => r.pattern);
  assert.equal(new Set(legendIds).size, legendIds.length, "a pattern is legended twice");
  assert.deepEqual(new Set(legendIds), reachable());
  assert.equal(LEGEND.length, 25);   // 21 distinct fill patterns + pReported + the 3 provenance densities
});

test("checkBiomeInk() reports nothing on the shipped tables", () => {
  assert.deepEqual(checkBiomeInk({}), []);
});

test("checkBiomeInk() names the file and line for a missing FILL_FOR entry", () => {
  const saved = FILL_FOR["karst-plateau"];
  delete FILL_FOR["karst-plateau"];
  const problems = checkBiomeInk({});
  FILL_FOR["karst-plateau"] = saved;
  assert.equal(problems.length, 1);
  assert.match(problems[0],
    /^G-BIOME-INK: terrain kind "karst-plateau" .* has no entry in FILL_FOR \(tools\/mapforge\/lib\/draft\.mjs\) — it will render as blank parchment$/);
});

test("checkBiomeInk() flags an emitted-but-unreachable pattern", () => {
  const problems = checkBiomeInk({ emittedIds: [...reachable(), "pGhost"], referencedIds: [...reachable()] });
  assert.ok(problems.some((p) => p === `G-BIOME-INK: pattern "pGhost" is emitted but unreachable`), problems);
});

test("checkBiomeInk() flags a referenced-but-unemitted pattern", () => {
  const r = [...reachable()];
  const problems = checkBiomeInk({ emittedIds: r.slice(1), referencedIds: r });
  assert.ok(problems.some((p) => p.includes(`is referenced but not emitted`)), problems);
});

test("checkBiomeInk() flags a legend row for an unreachable pattern", () => {
  LEGEND.push({ pattern: "pPhantom", label: "phantom", tier: 3 });
  const problems = checkBiomeInk({});
  LEGEND.pop();
  assert.ok(problems.some((p) => p === `G-BIOME-INK: pattern "pPhantom" has a legend row but is unreachable`), problems);
});

test("BYTE PARITY: patternDefs() with no ids emits exactly today's 8 patterns in today's order", () => {
  assert.deepEqual([...LEGACY_PATTERN_IDS],
    ["pIce", "pUpland", "pFlat", "pRim", "pBramble", "pMire", "pRock", "pRiver"]);
  const out = patternDefs();
  const ids = [...out.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, [...LEGACY_PATTERN_IDS]);
  // THE atlas call site, unchanged: atlas-sheet.mjs:287 passes exactly this
  // and must keep getting exactly NINE patterns until Task 12 re-inks it.
  const withReported = patternDefs({ includeReported: true });
  const reportedIds = [...withReported.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(reportedIds, [...LEGACY_PATTERN_IDS, "pReported"]);
  assert.equal(reportedIds.length, 9,
    "atlas-world.svg's <defs> moves at Task 6 if this is not 9 — two tasks before its licensed re-ink");
});

test("the three provenance densities are behind their OWN flag, not includeReported", () => {
  const withTiers = patternDefs({ includeReported: true, frontierTiers: true });
  assert.deepEqual([...withTiers.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]),
    [...LEGACY_PATTERN_IDS, "pReported", "pReportedSworn", "pReportedHearsay", "pReportedInferred"]);
  // frontierTiers alone, without includeReported, is legal and adds only three.
  assert.deepEqual([...patternDefs({ frontierTiers: true }).matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]),
    [...LEGACY_PATTERN_IDS, "pReportedSworn", "pReportedHearsay", "pReportedInferred"]);
  // And neither flag can duplicate an id already named in `ids`.
  assert.deepEqual([...patternDefs({ ids: ["pKarst", "pReported"], includeReported: true, frontierTiers: true })
    .matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]),
    ["pKarst", "pReported", "pReportedSworn", "pReportedHearsay", "pReportedInferred"]);
});

test("BYTE PARITY: TERRAIN_LEGEND is still the same six rows in the same order", () => {
  assert.deepEqual(TERRAIN_LEGEND, [
    ["pIce", "ice shelf"], ["pUpland", "upland"], ["pFlat", "alkali flat"],
    ["pRim", "rim country"], ["pBramble", "bramble"], ["pMire", "tidal mire"]]);
});

test("patternDefs({ ids }) emits exactly the requested set, in the requested order", () => {
  const out = patternDefs({ ids: ["pKarst", "pLava", "pReef"] });
  assert.deepEqual([...out.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]),
    ["pKarst", "pLava", "pReef"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
node --test 'tools/mapforge/tests/biome-ink.test.mjs'
```
Expected: FAIL — `SyntaxError: The requested module '../lib/draft.mjs' does not provide an export named 'BIOME_FILL'`, and `ERR_MODULE_NOT_FOUND ... lib/ink.mjs`.

- [ ] **Step 3: Rebuild the ink layer in `draft.mjs`**

Replace `tools/mapforge/lib/draft.mjs:36-53` with:

```js
// Plan B Task 6 — the ink layer, closed. Three tables and one registry:
//   BIOME_FILL   biome        -> pattern id   (20; there were ZERO before)
//   FILL_FOR     terrainKind  -> pattern id   (18; was 7)
//   PATTERNS     pattern id   -> <pattern> markup
//   LEGEND       one row per REACHABLE pattern, with a zoom tier
// G-BIOME-INK (lib/ink.mjs) closes all four loops in both directions.
export const BIOME_FILL = {
  ocean: "pOcean", ice: "pIce", marsh: "pMire", river: "pRiver",
  meadow: "pMeadow", forest: "pForest", bramble: "pBramble", rock: "pRock",
  upland: "pUpland", alkali: "pFlat", ash: "pAsh", built: "pBuilt",
  tundra: "pTundra", lake: "pLake", scree: "pScree", karst: "pKarst",
  badland: "pBadland", desert: "pDesert", lava: "pLava", reef: "pReef",
};

export const FILL_FOR = {
  ice: "pIce",
  upland: "pUpland",
  "alkali-flat": "pFlat",
  rim: "pRim",
  bramble: "pBramble",
  headland: "pRock",
  "river-country": "pRiver",
  // Plan B Task 6 (+11)
  "tundra-steppe": "pTundra",
  "sand-sea": "pDesert",
  badlands: "pBadland",
  "karst-plateau": "pKarst",
  "volcanic-arc": "pAsh",
  "lava-field": "pLava",
  "cloud-forest": "pForest",
  "reef-shelf": "pReef",
  fjordland: "pScree",
  "lake-country": "pLake",
  "tidal-mire": "pMire",
};

// Zoom tiers: a sheet draws every row with `tier <= its legendTier`. Tier 1 is
// EXACTLY today's six basin rows in today's order — that is what keeps
// cluster1-world.svg byte-identical until Task 12 deliberately re-inks it.
export const LEGEND = [
  { pattern: "pIce",      label: "ice shelf",              tier: 1 },
  { pattern: "pUpland",   label: "upland",                 tier: 1 },
  { pattern: "pFlat",     label: "alkali flat",            tier: 1 },
  { pattern: "pRim",      label: "rim country",            tier: 1 },
  { pattern: "pBramble",  label: "bramble",                tier: 1 },
  { pattern: "pMire",     label: "tidal mire",             tier: 1 },
  { pattern: "pRock",     label: "headland rock",          tier: 2 },
  { pattern: "pRiver",    label: "river country",          tier: 2 },
  { pattern: "pForest",   label: "forest",                 tier: 2 },
  { pattern: "pMeadow",   label: "meadow",                 tier: 2 },
  { pattern: "pReported",         label: "reported, not surveyed", tier: 2 },
  { pattern: "pReportedSworn",    label: "reported — sworn log",   tier: 2 },
  { pattern: "pReportedHearsay",  label: "reported — hearsay",     tier: 2 },
  { pattern: "pReportedInferred", label: "reported — inferred",    tier: 2 },
  { pattern: "pOcean",    label: "open sea",               tier: 3 },
  { pattern: "pLake",     label: "lake",                   tier: 3 },
  { pattern: "pTundra",   label: "tundra",                 tier: 3 },
  { pattern: "pScree",    label: "scree",                  tier: 3 },
  { pattern: "pKarst",    label: "karst pavement",         tier: 3 },
  { pattern: "pBadland",  label: "badland",                tier: 3 },
  { pattern: "pDesert",   label: "sand sea",               tier: 3 },
  { pattern: "pLava",     label: "lava field",             tier: 3 },
  { pattern: "pAsh",      label: "ash plain",              tier: 3 },
  { pattern: "pReef",     label: "reef",                   tier: 3 },
  { pattern: "pBuilt",    label: "built ground",           tier: 3 },
];

// Kept as a DERIVED alias so basin-sheet.mjs's legend block is untouched and
// cluster1-world.svg stays byte-identical. Task 12 replaces the call site.
export const TERRAIN_LEGEND = LEGEND.filter((r) => r.tier <= 1).map((r) => [r.pattern, r.label]);
```

- [ ] **Step 4: Turn `patternDefs` into a registry**

Replace `tools/mapforge/lib/draft.mjs:172-246` (the whole `patternDefs` function) with a `PATTERNS` registry plus a thin selector. **Move the eight existing `pat(...)` calls verbatim** — same ids, same widths/heights, same path data, same colours — into the registry, then add the thirteen new ones:

```js
// The eight ids today's two sheets emit, in today's emit order. patternDefs()
// with no `ids` reproduces that <defs> block byte for byte.
export const LEGACY_PATTERN_IDS = Object.freeze([
  "pIce", "pUpland", "pFlat", "pRim", "pBramble", "pMire", "pRock", "pRiver"]);

export const PATTERNS = {
  // --- the eight originals, moved verbatim from patternDefs() ---
  pIce: pat("pIce", 26, 13,
    `<path d="M0,4 h11 M15,4 h9 M4,9.5 h13 M20,9.5 h6" stroke="${C.inkSoft}" stroke-width="0.9" fill="none"/>`),
  pUpland: pat("pUpland", 18, 14,
    `<path d="M2,10 l4,-6 l4,6 M11,13 l3,-4.5 l3,4.5" stroke="${C.inkSoft}" stroke-width="0.9" fill="none"/>`),
  pFlat: pat("pFlat", 16, 16,
    `<circle cx="3" cy="4" r="0.8" fill="${C.inkSoft}"/><circle cx="11" cy="9" r="0.8" fill="${C.inkSoft}"/><circle cx="6" cy="13" r="0.7" fill="${C.inkSoft}"/>`),
  pRim: pat("pRim", 11, 11,
    `<path d="M0,11 l11,-11" stroke="${C.inkSoft}" stroke-width="0.75" fill="none"/>`),
  pBramble: pat("pBramble", 9, 9,
    `<path d="M0,9 l9,-9 M0,0 l9,9" stroke="${C.inkSoft}" stroke-width="0.65" fill="none"/>`),
  pMire: pat("pMire", 22, 16,
    `<path d="M2,8 h9 M6.5,8 v-3.5 M4,8 v-2.5 M9,8 v-2.5" stroke="${C.inkMid}" stroke-width="0.8" fill="none"/>` +
    `<path d="M13,15 h8 M17,15 v-3 M14.8,15 v-2.2 M19.2,15 v-2.2" stroke="${C.inkMid}" stroke-width="0.8" fill="none"/>`),
  pRock: pat("pRock", 12, 12,
    `<path d="M2,2 v4 M7,5 v4 M10,1 v3 M4,9 v3" stroke="${C.inkSoft}" stroke-width="0.9" fill="none"/>`),
  pRiver: pat("pRiver", 20, 18,
    `<path d="M3,12 v-5 M6,14 v-4 M13,7 v-5 M16,9 v-4" stroke="${C.inkSoft}" stroke-width="0.8" fill="none"/>`),
  pReported: pat("pReported", 7, 7,
    `<path d="M0,7 L7,0" stroke="${C.ink}" stroke-width="0.45" opacity="0.5"/>`),

  // --- The frontier hatch is an EPISTEMIC GRADIENT, not a binary (spec §6.4
  // extension 1). A reported region carries `provenance` in the fabric, and
  // these three densities draw it: a master's sworn log reads darker and
  // tighter than wharf-talk, which reads darker than the generator's own
  // fill. That register is what A2-wider-world.md §1 already commits to in
  // prose; without the three densities the chart flattens it back to "not
  // surveyed" and the honest-frontier policy stops being visible.
  // pReported stays as the fallback for a reported region with no provenance.
  pReportedSworn: pat("pReportedSworn", 7, 7,
    `<path d="M0,7 L7,0" stroke="${C.ink}" stroke-width="0.45" opacity="0.5"/>`),
  pReportedHearsay: pat("pReportedHearsay", 11, 11,
    `<path d="M0,11 L11,0" stroke="${C.ink}" stroke-width="0.45" opacity="0.42"/>`),
  pReportedInferred: pat("pReportedInferred", 15, 15,
    `<path d="M0,15 L15,0" stroke="${C.ink}" stroke-width="0.45" opacity="0.3"/>`),

  // --- Plan B Task 6: thirteen new fills. Every one is line/dot work in the
  // same two inks; no new colour enters the palette (A1-ART-01: ink on cream,
  // ONE accent reserved for the relay chain).
  pOcean: pat("pOcean", 24, 24,
    `<path d="M0,6 q6,-3 12,0 t12,0 M0,18 q6,-3 12,0 t12,0" stroke="${C.inkSoft}" stroke-width="0.5" fill="none" opacity="0.55"/>`),
  pMeadow: pat("pMeadow", 20, 20,
    `<path d="M4,15 v-3 M10,18 v-3 M16,13 v-3" stroke="${C.inkSoft}" stroke-width="0.6" fill="none"/>`),
  pForest: pat("pForest", 18, 18,
    `<path d="M5,14 l3,-6 l3,6 Z M12,17 l2.5,-5 l2.5,5 Z" fill="none" stroke="${C.inkSoft}" stroke-width="0.7"/>`),
  pAsh: pat("pAsh", 14, 14,
    `<circle cx="3" cy="3" r="0.55" fill="${C.inkMid}"/><circle cx="9" cy="7" r="0.55" fill="${C.inkMid}"/><circle cx="5" cy="11" r="0.5" fill="${C.inkMid}"/><circle cx="12" cy="12" r="0.5" fill="${C.inkMid}"/>`),
  pBuilt: pat("pBuilt", 12, 12,
    `<path d="M0,6 h12 M6,0 v12" stroke="${C.inkSoft}" stroke-width="0.5" fill="none"/>`),
  pTundra: pat("pTundra", 20, 20,
    `<path d="M3,10 h5 M12,16 h5" stroke="${C.inkSoft}" stroke-width="0.6" fill="none"/><circle cx="15" cy="6" r="0.5" fill="${C.inkSoft}"/>`),
  pLake: pat("pLake", 18, 18,
    `<path d="M2,7 q4,-2.5 8,0 M6,14 q4,-2.5 8,0" stroke="${C.inkMid}" stroke-width="0.6" fill="none"/>`),
  pScree: pat("pScree", 14, 14,
    `<path d="M2,3 l2,2 M8,2 l2,2 M4,9 l2,2 M10,10 l2,2" stroke="${C.inkSoft}" stroke-width="0.7" fill="none"/>`),
  pKarst: pat("pKarst", 16, 16,
    `<path d="M0,5 h16 M0,11 h16 M5,0 v5 M11,5 v6 M3,11 v5" stroke="${C.inkSoft}" stroke-width="0.6" fill="none"/>`),
  pBadland: pat("pBadland", 15, 15,
    `<path d="M2,14 l3,-9 l3,9 M9,14 l2.5,-6 l2.5,6" stroke="${C.inkSoft}" stroke-width="0.6" fill="none"/>`),
  pDesert: pat("pDesert", 22, 14,
    `<path d="M0,10 q5.5,-5 11,0 t11,0" stroke="${C.inkSoft}" stroke-width="0.7" fill="none"/>`),
  pLava: pat("pLava", 13, 13,
    `<path d="M1,4 l3,3 l-3,3 M7,2 l3,3 l-3,3 M4,10 l3,2" stroke="${C.inkMid}" stroke-width="0.75" fill="none"/>`),
  pReef: pat("pReef", 16, 16,
    `<path d="M3,12 v-4 M3,10 h-1.6 M3,10 h1.6 M11,14 v-5 M11,11 h-1.6 M11,11 h1.6" stroke="${C.inkMid}" stroke-width="0.6" fill="none"/>`),
};

// `ids` (Plan B Task 6) is what keeps the live sheets byte-identical: the
// default IS today's emit list, so the existing two callers change nothing.
//
// `includeReported` and `frontierTiers` are TWO flags, not one, and that is
// load-bearing. atlas-sheet.mjs:287 calls `patternDefs({ includeReported:
// true })` today and gets exactly nine patterns. If the three provenance
// densities rode along on `includeReported`, that untouched call site would
// start emitting twelve, atlas-world.svg's <defs> would move at Task 6, and
// the Task 6-11 byte-identity invariant would break two tasks before its one
// recorded carve-out (Task 12). So `includeReported` appends exactly
// `pReported`, forever, and the densities are opt-in separately.
//
// `baked` swaps the vector patterns for the single <image> underlay
// texture-bake.mjs produces (Task 9) — a sheet passes it when the pattern
// layer would otherwise cover most of the canvas, which is 100% of
// rsvg-convert's cost.
const FRONTIER_TIER_IDS = ["pReportedSworn", "pReportedHearsay", "pReportedInferred"];

export function patternDefs({ includeReported = false, frontierTiers = false,
                              baked = false, ids = LEGACY_PATTERN_IDS } = {}) {
  if (baked) return "";
  const wanted = [...ids];
  const add = (id) => { if (!wanted.includes(id)) wanted.push(id); };
  if (includeReported) add("pReported");
  if (frontierTiers) FRONTIER_TIER_IDS.forEach(add);
  return wanted.map((id) => PATTERNS[id]).filter(Boolean).join("\n");
}
```

- [ ] **Step 5: Write `ink.mjs`**

Create `tools/mapforge/lib/ink.mjs`:

```js
// tools/mapforge/lib/ink.mjs — G-BIOME-INK.
//
// A biome may not exist without an SVG fill pattern AND a legend row. The
// rule closes FOUR loops and it is symmetric: ink nobody can reach and ink
// nobody can explain are both failures. Pure — no fs, no deps. Returns
// problems in-band and never throws, the basin-sheet.mjs:200-202 contract.
import { BIOME_FILL, FILL_FOR, LEGEND, PATTERNS } from "./draft.mjs";
import { BIOMES, TERRAIN_KINDS } from "../../../scripts/lib/spine.mjs";

// The four frontier hatches are reachable through `provenance`, not through
// BIOME_FILL or FILL_FOR, so they must be named here explicitly or
// G-BIOME-INK reports them as "emitted but unreachable".
export const FRONTIER_PATTERNS = Object.freeze({
  sworn: "pReportedSworn", hearsay: "pReportedHearsay", inferred: "pReportedInferred",
});
export const frontierPattern = (provenance) => FRONTIER_PATTERNS[provenance] ?? "pReported";

export function reachablePatterns() {
  return new Set([...Object.values(BIOME_FILL), ...Object.values(FILL_FOR),
                  "pReported", ...Object.values(FRONTIER_PATTERNS)]);
}

/**
 * @param emittedIds     the pattern ids a built sheet actually put in <defs>,
 *                       or null to skip the per-sheet half.
 * @param referencedIds  the pattern ids that sheet actually points a fill at.
 * @param legendTier     the sheet's legend tier, or null to skip.
 */
export function checkBiomeInk({ emittedIds = null, referencedIds = null, legendTier = null } = {}) {
  const problems = [];
  const reach = reachablePatterns();

  // loop 1 — every biome has a fill
  for (const b of BIOMES)
    if (!BIOME_FILL[b])
      problems.push(`G-BIOME-INK: biome "${b}" has no BIOME_FILL entry`);

  // loop 2 — every terrain kind has a fill
  for (const k of TERRAIN_KINDS)
    if (!FILL_FOR[k])
      problems.push(`G-BIOME-INK: terrain kind "${k}" is in TERRAIN_KINDS but has no entry in FILL_FOR (tools/mapforge/lib/draft.mjs) — it will render as blank parchment`);

  // loop 3 — every reachable pattern is actually defined
  for (const id of reach)
    if (!PATTERNS[id])
      problems.push(`G-BIOME-INK: pattern "${id}" is referenced but never defined in PATTERNS`);

  // loop 4 — exactly one legend row per reachable pattern, both directions
  const seen = new Map();
  for (const row of LEGEND) {
    if (seen.has(row.pattern))
      problems.push(`G-BIOME-INK: pattern "${row.pattern}" has two legend rows`);
    seen.set(row.pattern, row);
    if (!reach.has(row.pattern))
      problems.push(`G-BIOME-INK: pattern "${row.pattern}" has a legend row but is unreachable`);
  }
  for (const id of reach)
    if (!seen.has(id))
      problems.push(`G-BIOME-INK: pattern "${id}" is reachable but has no legend row`);

  // per-sheet half — emitted vs referenced, both directions
  if (emittedIds && referencedIds) {
    const emitted = new Set(emittedIds);
    const referenced = new Set(referencedIds);
    for (const id of emitted)
      if (!referenced.has(id))
        problems.push(`G-BIOME-INK: pattern "${id}" is emitted but unreachable`);
    for (const id of referenced)
      if (!emitted.has(id))
        problems.push(`G-BIOME-INK: pattern "${id}" is referenced but not emitted — it will render as blank parchment`);
  }

  // legend tier — a tier that hides a pattern the sheet actually draws
  if (legendTier !== null && referencedIds) {
    const shown = new Set(LEGEND.filter((r) => r.tier <= legendTier).map((r) => r.pattern));
    for (const id of referencedIds)
      if (!shown.has(id))
        problems.push(`G-BIOME-INK: pattern "${id}" is drawn at legend tier ${legendTier} but has no visible legend row`);
  }
  return problems;
}
```

Note the message in loop 2 is one line and names the file, per the spec's representative message. It deliberately does **not** name a line number, because a line number in a message is the same rot-on-insert problem `G-CITE` exists to kill.

- [ ] **Step 6: Run the test to verify it passes**

Run:
```bash
node --test 'tools/mapforge/tests/biome-ink.test.mjs'
```
Expected: PASS — 13 tests, 0 fail. The one to read the output of is *"BYTE PARITY: patternDefs() with no ids emits exactly today's 8 patterns"* — its second half pins the atlas call site at nine patterns, and that is the assertion standing between Task 6 and an unlicensed re-ink of `atlas-world.svg`.

- [ ] **Step 7: Prove the live sheets did not move a byte**

Run:
```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node tools/mapforge/render-sheet.mjs --sheet cluster1 --check
node tools/mapforge/render-sheet.mjs --sheet atlas --check
node scripts/check_render_lock.mjs --check
git status --porcelain game-client/
```
Expected: all exit 0, and `git status --porcelain game-client/` prints **nothing**. This is the Task 6–11 invariant. If a sheet moved, `patternDefs`'s default `ids` or the `TERRAIN_LEGEND` alias is wrong — fix it here.

- [ ] **Step 8: Commit**

```bash
git add tools/mapforge/lib/draft.mjs tools/mapforge/lib/ink.mjs tools/mapforge/tests/biome-ink.test.mjs
git commit -m "feat: G-BIOME-INK — 20 biome fills, 18 terrain fills, one legend"
```

- [ ] **Step 9: QUALITY GATE — verify**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_render_lock.mjs --check && git status --porcelain game-client/ | wc -l
git branch --show-current && git log --oneline -1
```
Expected: tests pass; the `wc -l` prints `0`.

- [ ] **Step 10: QUALITY GATE — independent adversarial review**

Brief: *"Review `git show HEAD`. (a) The eight original patterns were moved from a function body into a registry object — diff them **character by character** against `git show HEAD~1:tools/mapforge/lib/draft.mjs`; a single changed digit silently re-inks a committed sheet. (b) `patternDefs({includeReported:true})` must still emit pReported **last**; confirm the order logic does that when `ids` is the default. (c) `checkBiomeInk` imports from `draft.mjs` and `draft.mjs` does not import from `ink.mjs` — confirm no cycle. (d) The 13 new patterns: confirm every one uses only `C.ink`, `C.inkMid` or `C.inkSoft` — the accent colour is reserved for the relay chain (A1-ART-01) and a fill using it is a design defect. (e) Confirm pattern tile sizes are all >= 7 px; a tile under ~6 px is a solid grey smear at thumbnail scale, which is the F-044 lesson."*

- [ ] **Step 11: QUALITY GATE — refactor** — new `fix:` commit.
- [ ] **Step 12: QUALITY GATE — re-verify** — repeat Step 7 in full, then `git branch --show-current && git log --oneline -1`.

---

### Task 7: The glyph library — 40 distinguishable families, `G-GLYPH`

**Files:**
- Create: `tools/mapforge/lib/glyphs.mjs`
- Test: `tools/mapforge/tests/glyphs.test.mjs`

**Interfaces:**
- Consumes: `content/world/lexicon/landforms.json` (Task 1) — read by the caller and passed in; `glyphs.mjs` itself does no file I/O.
- Produces:
  ```js
  export const GLYPHS: Record<string /*g-*/, ({ x, y, size, seed }) => string /*svg path d*/>
  export function symbolDefs({ ids }): string
  export function glyphForType({ lexicon, typeId }): string | null
  export function checkGlyphCoverage({ lexicon, namedCounts = null, emittedIds = null }): string[]
  export function glyphUse({ id, x, y, size }): string   // Plan-B-owned addition
  ```

**Domain notes.** Spec correction **C8**, verified: the committed `atlas-world.svg` carries **19 circles in 5 variants** (r 0.7/0.8/1.1/1.6/2), differing only in radius and ink. There is no shape vocabulary at all.

**40 families cover 170 types** — all dune types share the dune family, all cave mouths share the cave family. `G-GLYPH` asserts three things: every catalogued type with `>= 1` **named** instance has a family; every glyph id resolves to an emitted `<symbol>`; **no two landform *groups* share a glyph**. Within a group sharing is intended (20 glacial forms do not need 20 icons). The **1,404 unnamed instances are deliberately exempt** from the coverage rule — giving them each a distinct glyph is how you get 1,400 identical dots by a different route.

`glyphUse` exists because the target sheet carries 1,740 instances: emitting 1,740 inline `<path d="...">` elements is hundreds of KB, while 40 `<symbol>` definitions plus 1,740 `<use>` references is a few KB. Symbols are defined at origin `(0,0)` at size 10 in a `viewBox="-6 -6 12 12"`; `glyphUse` places and scales them.

**Determinism:** `seed` drives jitter through an integer hash (xor-shift + `Math.imul`) and a polynomial, never `Math.random` and never a transcendental. Same inputs, same string, on every engine.

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/glyphs.test.mjs`:

```js
// Plan B Task 7 — G-GLYPH. 40 families cover 170 types; a group never shares
// a glyph with another group; every emitted glyph resolves to a symbol; and
// the 1,404 unnamed texture instances are exempt by design.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GLYPHS, symbolDefs, glyphForType, checkGlyphCoverage, glyphUse } from "../lib/glyphs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const LEX = JSON.parse(readFileSync(join(ROOT, "content/world/lexicon/landforms.json"), "utf8"));

test("there are exactly 40 glyph families and each is a function", () => {
  assert.equal(Object.keys(GLYPHS).length, 40);
  for (const [id, fn] of Object.entries(GLYPHS)) {
    assert.equal(typeof fn, "function", id);
    assert.match(id, /^g-[a-z0-9]+(-[a-z0-9]+)*$/);
  }
});

test("every glyph the lexicon names exists, and every family is used", () => {
  const used = new Set(LEX.map((r) => r.glyph));
  for (const id of used) assert.ok(GLYPHS[id], `lexicon names glyph "${id}" with no family`);
  for (const id of Object.keys(GLYPHS)) assert.ok(used.has(id), `family "${id}" is never used`);
});

test("every glyph produces a non-trivial, well-formed path", () => {
  for (const [id, fn] of Object.entries(GLYPHS)) {
    const d = fn({ x: 100, y: 50, size: 8, seed: 7 });
    assert.equal(typeof d, "string", id);
    assert.ok(d.length > 8, `${id}: path is too short to be a mark`);
    assert.match(d, /^M/, `${id}: a path must start with a moveto`);
    assert.doesNotMatch(d, /NaN|undefined|Infinity/, `${id}: non-finite coordinate`);
  }
});

test("glyphs are deterministic and seed-sensitive", () => {
  for (const [id, fn] of Object.entries(GLYPHS)) {
    const a = fn({ x: 10, y: 10, size: 8, seed: 1 });
    assert.equal(a, fn({ x: 10, y: 10, size: 8, seed: 1 }), `${id}: not deterministic`);
  }
  // At least one family must actually vary with the seed, or the jitter is dead code.
  const varies = Object.entries(GLYPHS).some(([, fn]) =>
    fn({ x: 10, y: 10, size: 8, seed: 1 }) !== fn({ x: 10, y: 10, size: 8, seed: 2 }));
  assert.ok(varies, "no family responds to seed — the jitter is dead");
});

test("glyphs scale and translate with size and position", () => {
  for (const [id, fn] of Object.entries(GLYPHS)) {
    assert.notEqual(fn({ x: 0, y: 0, size: 8, seed: 3 }), fn({ x: 40, y: 0, size: 8, seed: 3 }), `${id}: ignores x`);
    assert.notEqual(fn({ x: 0, y: 0, size: 8, seed: 3 }), fn({ x: 0, y: 0, size: 16, seed: 3 }), `${id}: ignores size`);
  }
});

test("G-GLYPH: no two landform GROUPS share a glyph", () => {
  const problems = checkGlyphCoverage({ lexicon: LEX });
  assert.deepEqual(problems, []);
});

test("G-GLYPH red: two groups sharing a glyph", () => {
  const bad = LEX.map((r) => (r.id === "cave-system" ? { ...r, glyph: "g-cliff" } : r));
  const problems = checkGlyphCoverage({ lexicon: bad });
  assert.ok(problems.some((p) => /^G-GLYPH: groups "(coastal|karst)" and "(coastal|karst)" share glyph "g-cliff"$/.test(p)), problems);
});

test("G-GLYPH red: a type with named instances and no family", () => {
  const bad = LEX.map((r) => (r.id === "esker" ? { ...r, glyph: "g-nonexistent" } : r));
  const problems = checkGlyphCoverage({ lexicon: bad, namedCounts: { esker: 4 } });
  assert.ok(problems.some((p) => p === `G-GLYPH: type "esker" has 4 named instances but no glyph family`), problems);
});

test("G-GLYPH: unnamed instances never demand a family", () => {
  const bad = LEX.map((r) => (r.id === "esker" ? { ...r, glyph: "g-nonexistent" } : r));
  const problems = checkGlyphCoverage({ lexicon: bad, namedCounts: { esker: 0 } });
  assert.ok(!problems.some((p) => p.includes("named instances")), problems);
});

test("G-GLYPH red: a referenced glyph is not among the emitted symbols", () => {
  const problems = checkGlyphCoverage({ lexicon: LEX, emittedIds: ["g-cave"] });
  assert.ok(problems.some((p) => /^G-GLYPH: glyph "g-[a-z-]+" is referenced but no <symbol> was emitted$/.test(p)), problems);
});

test("symbolDefs emits one symbol per requested id, deterministically", () => {
  const out = symbolDefs({ ids: ["g-cave", "g-dune", "g-reef"] });
  assert.deepEqual([...out.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]),
    ["g-cave", "g-dune", "g-reef"]);
  assert.equal(out, symbolDefs({ ids: ["g-cave", "g-dune", "g-reef"] }));
  const all = symbolDefs({ ids: Object.keys(GLYPHS) });
  assert.ok(all.length < 40 * 900, "40 symbols must stay well under 36 KB");
});

test("glyphForType resolves through the lexicon and returns null for a stranger", () => {
  assert.equal(glyphForType({ lexicon: LEX, typeId: "karst-cenote" }), "g-cenote");
  assert.equal(glyphForType({ lexicon: LEX, typeId: "not-a-type" }), null);
});

test("glyphUse is a compact <use>, not an inlined path", () => {
  const u = glyphUse({ id: "g-dune", x: 12.345, y: 6.789, size: 7 });
  assert.match(u, /^<use href="#g-dune" x="[-\d.]+" y="[-\d.]+" width="7" height="7"\/>$/);
  assert.ok(u.length < 90);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
node --test 'tools/mapforge/tests/glyphs.test.mjs'
```
Expected: FAIL — `ERR_MODULE_NOT_FOUND ... lib/glyphs.mjs`.

- [ ] **Step 3: Write `glyphs.mjs`**

Create `tools/mapforge/lib/glyphs.mjs`:

```js
// tools/mapforge/lib/glyphs.mjs — the shape vocabulary.
//
// 40 families cover the 170 catalogued landform types: all dune types share
// the dune family, all cave mouths share the cave family. Within a GROUP,
// sharing is intended — 21 glacial forms do not need 21 icons. ACROSS groups
// it is a failure, because two groups drawn with one mark are two things a
// reader cannot tell apart. G-GLYPH is that rule.
//
// Every family is a pure ({x, y, size, seed}) -> svg path `d`. Jitter comes
// from an integer hash, never Math.random and never a transcendental: the SVG
// these strings land in is COMMITTED and byte-compared.
//
// Pure — no fs, no deps. The lexicon is passed in, never read here.
import { r2 } from "./draft.mjs";

// xor-shift + Math.imul: exact integer arithmetic, identical on every engine.
function hash(seed, salt) {
  let h = (seed | 0) ^ Math.imul(salt | 0, 0x9e3779b1);
  h ^= h << 13; h |= 0;
  h ^= h >>> 17;
  h ^= h << 5; h |= 0;
  return (h >>> 0) / 4294967296; // [0, 1)
}
/** Deterministic jitter in [-1, 1], scaled by the caller. */
const j = (seed, salt) => hash(seed, salt) * 2 - 1;

// Path builders. `u` is one glyph unit = size / 10, so every family is drawn
// against the same 10-unit box and `size` is a real diameter in px.
const P = (...parts) => parts.join(" ");
const M = (x, y) => `M${r2(x)},${r2(y)}`;
const L = (x, y) => `L${r2(x)},${r2(y)}`;
const Q = (cx, cy, x, y) => `Q${r2(cx)},${r2(cy)} ${r2(x)},${r2(y)}`;
/** A closed circle as two arcs — no transcendentals, exact in the output. */
const CIRC = (x, y, r) =>
  `M${r2(x - r)},${r2(y)} A${r2(r)},${r2(r)} 0 1 0 ${r2(x + r)},${r2(y)} A${r2(r)},${r2(r)} 0 1 0 ${r2(x - r)},${r2(y)} Z`;

export const GLYPHS = {
  // ── coastal (4) ────────────────────────────────────────────────────────
  "g-cliff": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 1) * 0.6 * u;
    return P(M(x - 4 * u, y + 3 * u), L(x - 4 * u, y - 2 * u), L(x + 4 * u + d, y - 2 * u),
      M(x - 2 * u, y - 2 * u), L(x - 2.6 * u, y + 2 * u), M(x + u, y - 2 * u), L(x + 0.4 * u, y + 2 * u)); },
  "g-arch": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 2) * 0.4 * u;
    return P(M(x - 4 * u, y + 4 * u), L(x - 4 * u, y), Q(x + d, y - 5 * u, x + 4 * u, y), L(x + 4 * u, y + 4 * u)); },
  "g-spit": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 3) * 0.8 * u;
    return P(M(x - 4.5 * u, y + 2 * u), Q(x, y - 2 * u + d, x + 3.5 * u, y - u), Q(x + 4.5 * u, y - 0.5 * u, x + 3 * u, y + 1.5 * u)); },
  "g-lagoon": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 4) * 0.5 * u;
    return P(M(x - 4 * u, y), Q(x - 3 * u, y - 3.5 * u + d, x, y - 3 * u), Q(x + 4 * u, y - 2.5 * u, x + 4 * u, y),
      Q(x + 3.5 * u, y + 3 * u, x, y + 3 * u), Q(x - 4 * u, y + 3 * u, x - 4 * u, y), "Z",
      M(x - 1.6 * u, y), Q(x, y - u, x + 1.6 * u, y)); },

  // ── fluvial (4) ────────────────────────────────────────────────────────
  "g-delta": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 5) * 0.7 * u;
    return P(M(x, y - 4 * u), L(x - 3.5 * u + d, y + 3.5 * u), M(x, y - 4 * u), L(x, y + 3.5 * u),
      M(x, y - 4 * u), L(x + 3.5 * u + d, y + 3.5 * u)); },
  "g-meander": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 6) * 0.6 * u;
    return P(M(x - 4.5 * u, y + 2 * u), Q(x - 1.5 * u, y - 3.5 * u + d, x, y),
      Q(x + 1.5 * u, y + 3.5 * u - d, x + 4.5 * u, y - 2 * u)); },
  "g-fan": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 7) * 0.5 * u;
    return P(M(x, y - 3.5 * u), L(x - 4 * u, y + 3.5 * u), M(x, y - 3.5 * u), L(x - 1.3 * u + d, y + 3.5 * u),
      M(x, y - 3.5 * u), L(x + 1.3 * u + d, y + 3.5 * u), M(x, y - 3.5 * u), L(x + 4 * u, y + 3.5 * u)); },
  "g-falls": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 8) * 0.4 * u;
    return P(M(x - 2 * u, y - 4 * u), L(x - 2 * u, y + 1.5 * u), M(x, y - 4 * u), L(x, y + 1.5 * u),
      M(x + 2 * u, y - 4 * u), L(x + 2 * u, y + 1.5 * u),
      M(x - 3 * u, y + 2.5 * u), Q(x + d, y + 4.5 * u, x + 3 * u, y + 2.5 * u)); },

  // ── mountain (4) ───────────────────────────────────────────────────────
  "g-peak": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 9) * 0.6 * u;
    return P(M(x - 4 * u, y + 3.5 * u), L(x + d, y - 4 * u), L(x + 4 * u, y + 3.5 * u), "Z",
      M(x - 1.4 * u, y - 0.6 * u), L(x + d, y - 2 * u), L(x + 1.4 * u, y - 0.6 * u)); },
  "g-ridge": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 10) * 0.7 * u;
    return P(M(x - 4.5 * u, y + 2.5 * u), L(x - 2.2 * u, y - 2 * u), L(x + d, y + u),
      L(x + 2.2 * u, y - 3 * u), L(x + 4.5 * u, y + 2.5 * u)); },
  "g-mesa": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 11) * 0.6 * u;
    return P(M(x - 4.5 * u, y + 3 * u), L(x - 2.6 * u, y - 2.5 * u), L(x + 2.6 * u + d, y - 2.5 * u),
      L(x + 4.5 * u, y + 3 * u), "Z"); },
  "g-scree": ({ x, y, size, seed }) => { const u = size / 10;
    return P(M(x - 3.5 * u + j(seed, 12) * u, y - 2 * u), L(x - 2.3 * u, y - 0.6 * u),
      M(x + 0.4 * u + j(seed, 13) * u, y - 3 * u), L(x + 1.6 * u, y - 1.6 * u),
      M(x - 2 * u + j(seed, 14) * u, y + 1.6 * u), L(x - 0.8 * u, y + 3 * u),
      M(x + 2 * u + j(seed, 15) * u, y + 1.2 * u), L(x + 3.2 * u, y + 2.6 * u)); },

  // ── glacial (4) ────────────────────────────────────────────────────────
  "g-cirque": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 16) * 0.5 * u;
    return P(M(x - 4 * u, y - 2.5 * u), Q(x + d, y + 4.5 * u, x + 4 * u, y - 2.5 * u),
      M(x - 4 * u, y - 2.5 * u), L(x - 2.5 * u, y - 4 * u), M(x + 4 * u, y - 2.5 * u), L(x + 2.5 * u, y - 4 * u)); },
  "g-moraine": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 17) * 0.5 * u;
    return P(M(x - 4.5 * u, y + 2.5 * u), Q(x + d, y - 3.5 * u, x + 4.5 * u, y + 2.5 * u),
      M(x - 2 * u, y + 3.4 * u), L(x - 1.4 * u, y + 3.4 * u), M(x + 1.4 * u, y + 3.4 * u), L(x + 2 * u, y + 3.4 * u)); },
  "g-crevasse": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 18) * 0.6 * u;
    return P(M(x - 3 * u, y - 3.5 * u), L(x - 3.6 * u, y + 3.5 * u), M(x, y - 3.5 * u), L(x + d, y + 3.5 * u),
      M(x + 3 * u, y - 3.5 * u), L(x + 3.6 * u, y + 3.5 * u)); },
  "g-erratic": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 19) * 0.7 * u;
    return P(M(x - 2.6 * u, y + 2.4 * u), L(x - 3 * u, y - 0.6 * u), L(x - 0.6 * u, y - 2.6 * u + d),
      L(x + 2.6 * u, y - 1.4 * u), L(x + 3 * u, y + 2.4 * u), "Z"); },

  // ── karst (4) ──────────────────────────────────────────────────────────
  "g-cave": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 20) * 0.4 * u;
    return P(M(x - 3.5 * u, y + 3 * u), L(x - 3.5 * u, y), Q(x + d, y - 5 * u, x + 3.5 * u, y),
      L(x + 3.5 * u, y + 3 * u), "Z"); },
  "g-cenote": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 21) * 0.3 * u;
    return P(CIRC(x, y, 3.4 * u + d), CIRC(x, y, 1.5 * u)); },
  "g-pavement": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 22) * 0.6 * u;
    return P(M(x - 4 * u, y - 3 * u), L(x + 4 * u, y - 3 * u), M(x - 4 * u, y + d), L(x + 4 * u, y + d),
      M(x - 4 * u, y + 3 * u), L(x + 4 * u, y + 3 * u), M(x - 1.5 * u, y - 3 * u), L(x - 1.5 * u, y + d),
      M(x + 1.8 * u, y + d), L(x + 1.8 * u, y + 3 * u)); },
  "g-tower": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 23) * 0.4 * u;
    return P(M(x - 2.2 * u, y + 3.5 * u), L(x - 1.8 * u, y - 2 * u), Q(x + d, y - 5 * u, x + 1.8 * u, y - 2 * u),
      L(x + 2.2 * u, y + 3.5 * u), "Z"); },

  // ── erosional (3) ──────────────────────────────────────────────────────
  "g-hoodoo": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 24) * 0.4 * u;
    return P(M(x - 1.1 * u, y + 4 * u), L(x - 0.7 * u, y - 1.5 * u), L(x + 0.7 * u, y - 1.5 * u),
      L(x + 1.1 * u, y + 4 * u), "Z", M(x - 2.4 * u + d, y - 1.5 * u), L(x + 2.4 * u, y - 1.5 * u),
      L(x + 1.9 * u, y - 3.2 * u), L(x - 1.9 * u, y - 3.2 * u), "Z"); },
  "g-gully": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 25) * 0.6 * u;
    return P(M(x, y + 4 * u), L(x + d, y - 0.5 * u), L(x - 2.6 * u, y - 3.6 * u),
      M(x + d, y - 0.5 * u), L(x + 2.6 * u, y - 3.6 * u), M(x + d, y - 0.5 * u), L(x + 0.4 * u, y - 3.6 * u)); },
  "g-arch-rock": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 26) * 0.4 * u;
    return P(M(x - 4.2 * u, y + 3.4 * u), L(x - 4.2 * u, y - u), L(x - 2.4 * u, y - 2.6 * u + d),
      L(x + 2.4 * u, y - 2.6 * u), L(x + 4.2 * u, y - u), L(x + 4.2 * u, y + 3.4 * u),
      M(x - 2.2 * u, y + 3.4 * u), Q(x, y - 1.6 * u, x + 2.2 * u, y + 3.4 * u)); },

  // ── desert (4) ─────────────────────────────────────────────────────────
  "g-dune": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 27) * 0.8 * u;
    return P(M(x - 4.5 * u, y + 2.5 * u), Q(x - 1.5 * u + d, y - 3.5 * u, x + 2 * u, y - u),
      Q(x + 3.6 * u, y - 0.2 * u, x + 4.5 * u, y + 2.5 * u)); },
  "g-playa": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 28) * 0.4 * u;
    return P(M(x - 4 * u, y), Q(x + d, y - 3.4 * u, x + 4 * u, y), Q(x, y + 3.4 * u, x - 4 * u, y), "Z",
      M(x - 2 * u, y), L(x + 2 * u, y)); },
  "g-wadi": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 29) * 0.6 * u;
    return P(M(x - 4.5 * u, y - 2 * u), L(x - 2 * u, y + d), M(x - 0.8 * u, y + 0.6 * u), L(x + 1.4 * u, y + 1.6 * u),
      M(x + 2.6 * u, y + 2 * u), L(x + 4.5 * u, y + 3 * u)); },
  "g-oasis": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 30) * 0.5 * u;
    return P(CIRC(x, y + 2 * u, 1.2 * u), M(x, y + 0.8 * u), L(x + d, y - 2 * u),
      M(x + d, y - 2 * u), Q(x - 2.4 * u, y - 3.4 * u, x - 3.4 * u, y - 1.6 * u),
      M(x + d, y - 2 * u), Q(x + 2.4 * u, y - 3.4 * u, x + 3.4 * u, y - 1.6 * u)); },

  // ── volcanic (4) ───────────────────────────────────────────────────────
  "g-cone": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 31) * 0.5 * u;
    return P(M(x - 4.2 * u, y + 3.4 * u), L(x - 1.4 * u + d, y - 3.4 * u), L(x - 0.5 * u, y - 2.4 * u),
      L(x + 0.5 * u, y - 3.4 * u), L(x + 1.4 * u + d, y - 3.4 * u), L(x + 4.2 * u, y + 3.4 * u), "Z"); },
  "g-caldera": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 32) * 0.4 * u;
    return P(M(x - 4.4 * u, y + u), L(x - 2.4 * u, y - 2.4 * u + d), L(x + 2.4 * u, y - 2.4 * u),
      L(x + 4.4 * u, y + u), M(x - 2.4 * u, y - 2.4 * u + d), Q(x, y + 1.4 * u, x + 2.4 * u, y - 2.4 * u)); },
  "g-lavafield": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 33) * 0.5 * u;
    return P(M(x - 4.2 * u, y - u), L(x - 2.4 * u, y + u + d), L(x - 0.6 * u, y - u),
      M(x + 0.8 * u, y + 2.4 * u), L(x + 2.4 * u, y + 0.6 * u), L(x + 4.2 * u, y + 2.4 * u)); },
  "g-vent": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 34) * 0.5 * u;
    return P(CIRC(x, y + 2.2 * u, u), M(x - 1.6 * u, y + 0.6 * u), L(x - 2.2 * u + d, y - 2.6 * u),
      M(x, y + 0.4 * u), L(x + d, y - 3.4 * u), M(x + 1.6 * u, y + 0.6 * u), L(x + 2.2 * u + d, y - 2.6 * u)); },

  // ── wetland (3) ────────────────────────────────────────────────────────
  "g-tuft": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 35) * 0.4 * u;
    return P(M(x - 4 * u, y + 2 * u), L(x + 4 * u, y + 2 * u), M(x - 2 * u, y + 2 * u), L(x - 2.2 * u, y - 1.4 * u),
      M(x + d, y + 2 * u), L(x + d, y - 2.6 * u), M(x + 2 * u, y + 2 * u), L(x + 2.2 * u, y - 1.4 * u)); },
  "g-bog": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 36) * 0.7 * u;
    return P(M(x - 3.6 * u, y - 2.4 * u), L(x - 0.4 * u, y - 2.4 * u), M(x + 1.2 * u + d, y - 2.4 * u), L(x + 3.6 * u, y - 2.4 * u),
      M(x - 3 * u, y + 0.2 * u), L(x + 0.6 * u, y + 0.2 * u), M(x + 2 * u, y + 0.2 * u), L(x + 3.6 * u, y + 0.2 * u),
      M(x - 3.6 * u, y + 2.8 * u), L(x - 0.8 * u, y + 2.8 * u), M(x + 0.8 * u + d, y + 2.8 * u), L(x + 3.6 * u, y + 2.8 * u)); },
  "g-mangrove": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 37) * 0.4 * u;
    return P(M(x + d, y + 3.6 * u), L(x + d, y - 1.4 * u),
      M(x + d, y - 1.4 * u), Q(x - 2.6 * u, y - 2.4 * u, x - 3.4 * u, y - 0.4 * u),
      M(x + d, y - 1.4 * u), Q(x + 2.6 * u, y - 2.4 * u, x + 3.4 * u, y - 0.4 * u),
      M(x + d, y + 1.6 * u), L(x - 2.4 * u, y + 3.6 * u), M(x + d, y + 1.6 * u), L(x + 2.4 * u, y + 3.6 * u)); },

  // ── lakes (2) ──────────────────────────────────────────────────────────
  "g-lake": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 38) * 0.5 * u;
    return P(M(x - 4.2 * u, y), Q(x - 2 * u + d, y - 3.4 * u, x + 1.4 * u, y - 2.6 * u),
      Q(x + 4.2 * u, y - 2 * u, x + 4.2 * u, y + 0.6 * u), Q(x + 2 * u, y + 3.2 * u, x - 1.4 * u, y + 2.6 * u),
      Q(x - 4.2 * u, y + 2 * u, x - 4.2 * u, y), "Z"); },
  "g-tarn": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 39) * 0.4 * u;
    return P(M(x - 2.6 * u, y + 0.6 * u), Q(x + d, y - 3 * u, x + 2.6 * u, y + 0.6 * u),
      Q(x, y + 3 * u, x - 2.6 * u, y + 0.6 * u), "Z", M(x - 3.6 * u, y - 2.4 * u), L(x - 2 * u, y - 1.2 * u)); },

  // ── island (2) ─────────────────────────────────────────────────────────
  "g-isle": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 40) * 0.6 * u;
    return P(M(x - 3.4 * u, y + 1.6 * u), Q(x - 1.6 * u + d, y - 2.6 * u, x + 0.6 * u, y - 1.6 * u),
      Q(x + 3.4 * u, y - 0.6 * u, x + 3.4 * u, y + 1.6 * u), "Z"); },
  "g-atoll": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 41) * 0.4 * u;
    return P(M(x - 3.4 * u, y), Q(x - 3 * u + d, y - 3.4 * u, x, y - 3.4 * u),
      Q(x + 3 * u, y - 3.4 * u, x + 3.4 * u, y),
      M(x + 2.4 * u, y + 2.2 * u), Q(x, y + 3.6 * u, x - 2.4 * u, y + 2.2 * u)); },

  // ── oceanic (2) ────────────────────────────────────────────────────────
  "g-reef": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 42) * 0.5 * u;
    return P(M(x - 4.2 * u, y - 1.6 * u), L(x + 4.2 * u, y - 1.6 * u),
      M(x - 2.6 * u, y - 1.6 * u), L(x - 3 * u, y + 1.4 * u), M(x + d, y - 1.6 * u), L(x + d, y + 2.2 * u),
      M(x + 2.6 * u, y - 1.6 * u), L(x + 3 * u, y + 1.4 * u)); },
  "g-seamount": ({ x, y, size, seed }) => { const u = size / 10, d = j(seed, 43) * 0.5 * u;
    return P(M(x - 3.8 * u, y + 2.6 * u), L(x + d, y - 2.6 * u), L(x + 3.8 * u, y + 2.6 * u),
      M(x - 4.4 * u, y + 3.8 * u), L(x - 1.6 * u, y + 3.8 * u), M(x + 1.6 * u, y + 3.8 * u), L(x + 4.4 * u, y + 3.8 * u)); },
};

/**
 * <symbol> definitions. Each family is drawn ONCE at the origin at size 10 in
 * a "-6 -6 12 12" viewBox; sheets place instances with glyphUse(). At 1,740
 * instances that is 40 definitions plus 1,740 short <use> elements, instead
 * of 1,740 inlined paths.
 */
export function symbolDefs({ ids }) {
  return ids
    .filter((id) => GLYPHS[id])
    .map((id) =>
      `<symbol id="${id}" viewBox="-6 -6 12 12" overflow="visible">` +
      `<path d="${GLYPHS[id]({ x: 0, y: 0, size: 10, seed: 0 })}" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/>` +
      `</symbol>`)
    .join("\n");
}

export function glyphUse({ id, x, y, size }) {
  return `<use href="#${id}" x="${r2(x - size / 2)}" y="${r2(y - size / 2)}" width="${size}" height="${size}"/>`;
}

export function glyphForType({ lexicon, typeId }) {
  const row = lexicon.find((r) => r.id === typeId);
  return row ? row.glyph : null;
}

/**
 * G-GLYPH. `namedCounts` is type id -> number of NAMED instances; the 1,404
 * unnamed texture instances are exempt by design — giving each of them a
 * distinct glyph is how you get 1,400 identical dots by another route.
 */
export function checkGlyphCoverage({ lexicon, namedCounts = null, emittedIds = null }) {
  const problems = [];
  const owner = new Map(); // glyph -> primary group
  for (const row of lexicon) {
    const prev = owner.get(row.glyph);
    if (prev === undefined) owner.set(row.glyph, row.group);
    else if (prev !== row.group)
      problems.push(`G-GLYPH: groups "${prev}" and "${row.group}" share glyph "${row.glyph}"`);
  }
  for (const row of lexicon) {
    const named = namedCounts ? (namedCounts[row.id] ?? 0) : 0;
    if (!GLYPHS[row.glyph] && (named > 0 || namedCounts === null))
      problems.push(named > 0
        ? `G-GLYPH: type "${row.id}" has ${named} named instances but no glyph family`
        : `G-GLYPH: type "${row.id}" names glyph "${row.glyph}" with no family`);
  }
  if (emittedIds) {
    const emitted = new Set(emittedIds);
    for (const id of new Set(lexicon.map((r) => r.glyph)))
      if (!emitted.has(id))
        problems.push(`G-GLYPH: glyph "${id}" is referenced but no <symbol> was emitted`);
  }
  return problems;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
node --test 'tools/mapforge/tests/glyphs.test.mjs'
```
Expected: PASS — 13 tests, 0 fail.

- [ ] **Step 5: Eyeball all 40 marks — they must be tellable apart**

`G-GLYPH` proves *distinctness of id*, not *distinctness of shape*. Render a contact sheet and look at it:

```bash
node -e '
import("./tools/mapforge/lib/glyphs.mjs").then(({GLYPHS}) => {
  const ids = Object.keys(GLYPHS); const cols = 8, cell = 64;
  const rows = Math.ceil(ids.length / cols);
  const body = ids.map((id, i) => {
    const cx = (i % cols) * cell + cell / 2, cy = Math.floor(i / cols) * cell + cell / 2 - 6;
    return `<path d="${GLYPHS[id]({x: cx, y: cy, size: 26, seed: i})}" fill="none" stroke="#241f18" stroke-width="1.1" stroke-linejoin="round"/>`
      + `<text x="${cx}" y="${cy + 22}" font-size="7" text-anchor="middle" fill="#5d5344" font-family="Georgia,serif">${id}</text>`;
  }).join("\n");
  require("fs").writeFileSync("/tmp/glyph-sheet.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cols*cell}" height="${rows*cell}" viewBox="0 0 ${cols*cell} ${rows*cell}"><rect width="100%" height="100%" fill="#f3e7ce"/>${body}</svg>`);
});' 
open -a "Google Chrome" /tmp/glyph-sheet.svg
```
Acceptance, judged by eye against the written criterion: **no two marks in different groups read as the same mark at 26 px**. If two do, change one — a mark a reader cannot separate is a mark that is not there. `/tmp/glyph-sheet.svg` is a scratch artifact; do not commit it (Task 11 gives the glyph table a permanent home in the storybook).

- [ ] **Step 6: Prove the live sheets did not move**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_render_lock.mjs --check && git status --porcelain game-client/ | wc -l
```
Expected: pass, and `0`. `glyphs.mjs` has no consumer yet, so this is provably inert.

- [ ] **Step 7: Commit**

```bash
git add tools/mapforge/lib/glyphs.mjs tools/mapforge/tests/glyphs.test.mjs
git commit -m "feat: G-GLYPH — 40 glyph families for the 170-type lexicon"
```

- [ ] **Step 8: QUALITY GATE — verify**

```bash
node --test 'tools/mapforge/tests/glyphs.test.mjs'
node scripts/check_render_lock.mjs --check
git branch --show-current && git log --oneline -1
```

- [ ] **Step 9: QUALITY GATE — independent adversarial review**

Brief: *"Review `git show HEAD` and open the contact sheet from Step 5. (a) Distinctness is the whole point — name any two glyphs in **different** groups that read as the same mark at 26 px, and any glyph that is illegible at 8 px (the instance size on a world sheet). (b) Confirm no family uses `Math.random`, `Math.sin/cos/exp/log/pow`, `Date`, or `Math.hypot`; the SVG they land in is committed and byte-compared. (c) Confirm `symbolDefs` output is stable across calls and does not depend on object key order beyond the `ids` argument. (d) `checkGlyphCoverage` with `namedCounts === null` behaves differently from `namedCounts = {}` — is that intentional and documented? (e) `CIRC` uses SVG elliptical arcs — confirm the emitted numbers are all products of `r2()` and cannot print in exponential notation for any plausible size."*

- [ ] **Step 10: QUALITY GATE — refactor** — new `fix:` commit; re-render the contact sheet after any shape change.
- [ ] **Step 11: QUALITY GATE — re-verify** — repeat Steps 4 and 6, then `git branch --show-current && git log --oneline -1`.

---

### Task 8: Deterministic label decluttering — `labels.mjs`, `G-LABEL`

**Files:**
- Create: `tools/mapforge/lib/labels.mjs`
- Test: `tools/mapforge/tests/labels.test.mjs`

**Interfaces:**
- Consumes: `buildBBoxIndex({ items })` from `scripts/lib/geometry.mjs` (Plan A).
- Produces:
  ```js
  /** @typedef {{id:string, text:string, at:[number,number], rank:number, anchorPref?:string}} LabelReq */
  export const RANKS: Readonly<Record<string, number>>   // the 10 named priority ranks
  export const ADVANCE_WIDTH: Record<string, number>     // committed em-widths, never measured
  export const DEFAULT_ADVANCE: number
  export function measureText({ text, size, tracking = 0 }): { w: number, h: number }
  export function placeLabels({ labels, obstacles, maxLabelRank, frame }):
    { placed: Array<{id, x, y, anchor, leader?: [number,number][]}>, dropped: Array<{id, why}> }
  export function checkLabels({ placed, dropped, tier, budget = null }): string[]
  ```

**Domain notes.** Spec correction **C9**, verified: a deterministic `nudgeClearOfLand` exists (`atlas-sheet.mjs:235-252`) but it dodges **land**, not other labels; `grep -ri 'collision|declutter'` across `tools/mapforge` returns nothing. The committed `atlas-world.svg` carries **37** `<text>` elements against a **340+** target, and the current mechanism is a greedy vertical stack (`atlas-sheet.mjs:469-476`) that took three hand-tuning attempts to fix **one** collision.

Four mechanisms, all deterministic:

1. **Priority ranks 0–9** — world title, ocean, continent, sea, region, capital, hub, dungeon, named landform, village. Placement order is **priority then id**, so the output is a function of the data alone.
2. **Zoom tiers** — each sheet declares `maxLabelRank` (world 3, continent 8, region 10) and a label above the tier **is not drawn and not counted**. This is the single largest lever on ink density: 120 hatched frontier regions contribute at most 60 labels between them.
3. **Text metrics from a committed per-character advance-width table** — never a browser measurement, which is non-deterministic and unavailable in Node.
4. **A fixed 8-candidate search in the classic Imhof order** (NE, NW, SE, SW, N, S, E, W) against a bounding-box index, then a fallback ladder of leader-line-to-margin, then **drop-and-report**. A dropped label is reported, never silently absent.

`G-LABEL` is a **gate**, with a hard budget of `<= 40` labels at zoom tier 1.

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/labels.test.mjs`:

```js
// Plan B Task 8 — G-LABEL. The acceptance bar from spec R10: 300 synthetic
// labels place with ZERO collisions and NO hand-tuning. Everything here is a
// function of the data alone — no measurement, no randomness, no clock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RANKS, ADVANCE_WIDTH, measureText, placeLabels, checkLabels } from "../lib/labels.mjs";

const FRAME = { x: 0, y: 0, w: 1400, h: 1400 };

// A deterministic spread of `n` labels — integer hash, no Math.random.
function synthetic(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let h = Math.imul(i + 1, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
    const u = (h >>> 0) / 4294967296;
    let g = Math.imul(i + 7, 0xc2b2ae35); g ^= g >>> 16;
    const v = (g >>> 0) / 4294967296;
    out.push({ id: `l-${String(i).padStart(3, "0")}`,
      text: ["Gildmark", "the Drowned Stair", "Rooktide Reach", "Netstead", "Ashen Spar",
             "Quillreef", "the Meltwash", "Skerryfast"][i % 8],
      at: [40 + u * (FRAME.w - 80), 40 + v * (FRAME.h - 80)],
      rank: 3 + (i % 7) });
  }
  return out;
}
const boxesOverlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("the rank vocabulary is the ten pinned priorities in order", () => {
  assert.deepEqual(Object.entries(RANKS), [
    ["worldTitle", 0], ["ocean", 1], ["continent", 2], ["sea", 3], ["region", 4],
    ["capital", 5], ["hub", 6], ["dungeon", 7], ["namedLandform", 8], ["village", 9]]);
});

test("the advance-width table is committed, complete for ASCII, and sane", () => {
  for (let c = 32; c < 127; c++) {
    const ch = String.fromCharCode(c);
    assert.ok(typeof ADVANCE_WIDTH[ch] === "number", `no advance width for ${JSON.stringify(ch)}`);
    assert.ok(ADVANCE_WIDTH[ch] > 0 && ADVANCE_WIDTH[ch] < 1.6, ch);
  }
  assert.ok(ADVANCE_WIDTH["W"] > ADVANCE_WIDTH["i"], "W must be wider than i");
});

test("measureText is proportional, deterministic and tracking-aware", () => {
  const a = measureText({ text: "Gildmark", size: 12 });
  assert.deepEqual(a, measureText({ text: "Gildmark", size: 12 }));
  assert.ok(a.w > 0 && a.h > 0);
  assert.ok(Math.abs(measureText({ text: "Gildmark", size: 24 }).w - a.w * 2) < 1e-9, "linear in size");
  assert.ok(measureText({ text: "WWWW", size: 12 }).w > measureText({ text: "iiii", size: 12 }).w);
  assert.ok(measureText({ text: "ab", size: 12, tracking: 2 }).w > measureText({ text: "ab", size: 12 }).w);
});

test("ACCEPTANCE: 300 labels place with zero collisions and no hand-tuning", () => {
  const { placed, dropped } = placeLabels({
    labels: synthetic(300), obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.equal(placed.length + dropped.length, 300);
  for (let i = 0; i < placed.length; i++)
    for (let k = i + 1; k < placed.length; k++)
      assert.ok(!boxesOverlap(placed[i].box, placed[k].box),
        `${placed[i].id} x ${placed[k].id}`);
  assert.deepEqual(checkLabels({ placed, dropped, tier: 3 }), [],
    "any drop must be reported, and a drop at tier 3 is a G-LABEL failure");
});

test("placement is a pure function of the data — same input, same output", () => {
  const a = placeLabels({ labels: synthetic(120), obstacles: [], maxLabelRank: 10, frame: FRAME });
  const b = placeLabels({ labels: synthetic(120), obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.deepEqual(a, b);
});

test("input order does not change the result — priority-then-id, never insertion", () => {
  const labels = synthetic(120);
  const a = placeLabels({ labels, obstacles: [], maxLabelRank: 10, frame: FRAME });
  const b = placeLabels({ labels: [...labels].reverse(), obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.deepEqual(a, b);
});

test("a higher-priority label wins its preferred position against a lower one", () => {
  const at = [700, 700];
  const { placed } = placeLabels({
    labels: [{ id: "b-low", text: "Netstead", at, rank: RANKS.village },
             { id: "a-high", text: "Gildmark", at, rank: RANKS.capital }],
    obstacles: [], maxLabelRank: 10, frame: FRAME });
  assert.equal(placed[0].id, "a-high");
  assert.equal(placed[0].anchor, "NE", "the first Imhof candidate goes to the higher rank");
});

test("zoom tier: labels above maxLabelRank are neither drawn nor counted", () => {
  const labels = [
    { id: "a", text: "Galereach", at: [200, 200], rank: RANKS.ocean },
    { id: "b", text: "Netstead", at: [220, 200], rank: RANKS.village },
  ];
  const { placed, dropped } = placeLabels({ labels, obstacles: [], maxLabelRank: 3, frame: FRAME });
  assert.deepEqual(placed.map((p) => p.id), ["a"]);
  assert.deepEqual(dropped, [], "a label above the tier is out of scope, not a drop");
});

test("obstacles are avoided", () => {
  const obstacle = { id: "o", bbox: { x: 690, y: 660, w: 200, h: 90 } };
  const { placed } = placeLabels({
    labels: [{ id: "a", text: "Gildmark", at: [700, 700], rank: RANKS.capital }],
    obstacles: [obstacle], maxLabelRank: 10, frame: FRAME });
  assert.equal(placed.length, 1);
  assert.ok(!boxesOverlap(placed[0].box, obstacle.bbox));
});

test("a label boxed in on all eight sides gets a leader line, then is dropped", () => {
  const wall = [];
  for (let i = 0; i < 400; i++)
    wall.push({ id: `w-${i}`, bbox: { x: 0, y: 0, w: FRAME.w, h: FRAME.h } });
  const { placed, dropped } = placeLabels({
    labels: [{ id: "a", text: "Gildmark", at: [700, 700], rank: RANKS.capital }],
    obstacles: wall, maxLabelRank: 10, frame: FRAME });
  assert.equal(placed.length, 0);
  assert.deepEqual(dropped, [{ id: "a", why: "no candidate position and no clear margin for a leader" }]);
});

test("labels never leave the frame", () => {
  const { placed } = placeLabels({
    labels: [{ id: "tl", text: "Gildmark", at: [2, 2], rank: 5 },
             { id: "br", text: "Gildmark", at: [FRAME.w - 2, FRAME.h - 2], rank: 5 }],
    obstacles: [], maxLabelRank: 10, frame: FRAME });
  for (const p of placed) {
    assert.ok(p.box.x >= FRAME.x && p.box.y >= FRAME.y, p.id);
    assert.ok(p.box.x + p.box.w <= FRAME.x + FRAME.w, p.id);
    assert.ok(p.box.y + p.box.h <= FRAME.y + FRAME.h, p.id);
  }
});

test("G-LABEL: a hard budget of 40 labels at zoom tier 1", () => {
  const placed = Array.from({ length: 41 }, (_, i) => ({ id: `l${i}`, x: i, y: 0, anchor: "NE",
    box: { x: i * 30, y: 0, w: 20, h: 10 } }));
  const problems = checkLabels({ placed, dropped: [], tier: 1, budget: 40 });
  assert.ok(problems.some((p) => p === "G-LABEL: 41 labels at zoom tier 1 > budget 40"), problems);
});

test("G-LABEL: overlaps and drops each report with ids", () => {
  const placed = [
    { id: "a", x: 0, y: 0, anchor: "NE", box: { x: 0, y: 0, w: 50, h: 12 } },
    { id: "b", x: 0, y: 0, anchor: "NE", box: { x: 10, y: 2, w: 50, h: 12 } },
  ];
  const problems = checkLabels({ placed, dropped: [{ id: "c", why: "boxed in" }], tier: 2 });
  assert.ok(problems.includes("G-LABEL: 1 label boxes overlap at zoom tier 2 (a x b)"), problems);
  assert.ok(problems.includes("G-LABEL: 1 labels dropped at tier 2: c"), problems);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
node --test 'tools/mapforge/tests/labels.test.mjs'
```
Expected: FAIL — `ERR_MODULE_NOT_FOUND ... lib/labels.mjs`.

- [ ] **Step 3: Write `labels.mjs`**

Create `tools/mapforge/lib/labels.mjs`:

```js
// tools/mapforge/lib/labels.mjs — deterministic label decluttering.
//
// Replaces the greedy vertical stack at atlas-sheet.mjs:469-476, which dodged
// LAND but never other labels and needed three hand-tuning passes to fix ONE
// collision. Four mechanisms, all deterministic:
//   1. priority ranks 0-9, placement order priority-then-id
//   2. zoom tiers — a label above the sheet's maxLabelRank is not drawn and
//      NOT COUNTED (the single largest lever on ink density)
//   3. a COMMITTED per-character advance-width table — never a browser
//      measurement, which is non-deterministic and absent in Node
//   4. an 8-candidate search in the classic Imhof order, then a leader line
//      to the margin, then DROP-AND-REPORT. A dropped label is reported,
//      never silently absent.
//
// Pure — no fs, no clock, no randomness. Same input, same output, always.
import { buildBBoxIndex } from "../../../scripts/lib/geometry.mjs";
import { r2 } from "./draft.mjs";

export const RANKS = Object.freeze({
  worldTitle: 0, ocean: 1, continent: 2, sea: 3, region: 4,
  capital: 5, hub: 6, dungeon: 7, namedLandform: 8, village: 9,
});

// Advance widths in em, for the sheets' serif stack (Georgia / Iowan Old
// Style / Times New Roman). COMMITTED, never measured: a browser metric is
// unavailable in Node and differs between machines, and these strings land in
// a byte-compared SVG. Values are the common metric to two decimals; the
// declutter needs proportion, not typographic exactness.
export const DEFAULT_ADVANCE = 0.52;
export const ADVANCE_WIDTH = {
  " ": 0.25, "!": 0.28, '"': 0.4, "#": 0.52, "$": 0.52, "%": 0.78, "&": 0.79, "'": 0.21,
  "(": 0.33, ")": 0.33, "*": 0.42, "+": 0.55, ",": 0.27, "-": 0.34, ".": 0.27, "/": 0.34,
  "0": 0.52, "1": 0.52, "2": 0.52, "3": 0.52, "4": 0.52, "5": 0.52, "6": 0.52, "7": 0.52,
  "8": 0.52, "9": 0.52, ":": 0.27, ";": 0.27, "<": 0.55, "=": 0.55, ">": 0.55, "?": 0.44,
  "@": 0.86, A: 0.72, B: 0.7, C: 0.71, D: 0.77, E: 0.66, F: 0.62, G: 0.76, H: 0.81,
  I: 0.4, J: 0.43, K: 0.74, L: 0.63, M: 0.95, N: 0.78, O: 0.79, P: 0.6, Q: 0.79,
  R: 0.71, S: 0.63, T: 0.67, U: 0.78, V: 0.72, W: 1.02, X: 0.71, Y: 0.68, Z: 0.63,
  "[": 0.33, "\\": 0.34, "]": 0.33, "^": 0.55, _: 0.5, "`": 0.33,
  a: 0.48, b: 0.55, c: 0.43, d: 0.55, e: 0.46, f: 0.32, g: 0.49, h: 0.56, i: 0.27,
  j: 0.29, k: 0.52, l: 0.27, m: 0.84, n: 0.56, o: 0.52, p: 0.55, q: 0.54, r: 0.4,
  s: 0.4, t: 0.34, u: 0.56, v: 0.49, w: 0.72, x: 0.48, y: 0.49, z: 0.43,
  "{": 0.36, "|": 0.3, "}": 0.36, "~": 0.55,
  // the two non-ASCII marks the corpus actually uses
  "’": 0.21, "·": 0.27, "—": 1.0,
};

export function measureText({ text, size, tracking = 0 }) {
  let em = 0;
  for (const ch of String(text)) em += ADVANCE_WIDTH[ch] ?? DEFAULT_ADVANCE;
  return { w: em * size + tracking * Math.max(String(text).length - 1, 0), h: size * 1.0 };
}

// The classic Imhof preference order. Offsets are in multiples of the label's
// own height, so the ladder scales with the type size.
const CANDIDATES = [
  ["NE", 0.6, -0.6], ["NW", -0.6, -0.6], ["SE", 0.6, 0.6], ["SW", -0.6, 0.6],
  ["N", 0, -0.9], ["S", 0, 0.9], ["E", 0.9, 0], ["W", -0.9, 0],
];
const overlaps = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inFrame = (box, f) =>
  box.x >= f.x && box.y >= f.y && box.x + box.w <= f.x + f.w && box.y + box.h <= f.y + f.h;

function boxFor({ at, anchor, dx, dy, m }) {
  const [px, py] = at;
  const x = anchor.includes("W") ? px + dx * m.h - m.w : anchor.includes("E") ? px + dx * m.h : px - m.w / 2;
  const y = anchor.includes("N") ? py + dy * m.h - m.h : anchor.includes("S") ? py + dy * m.h : py - m.h / 2;
  return { x: r2(x), y: r2(y), w: r2(m.w), h: r2(m.h) };
}

/**
 * @param labels        LabelReq[]
 * @param obstacles     [{ id, bbox }] — anything a label must not cover
 * @param maxLabelRank  the sheet's zoom tier; labels with a HIGHER rank are
 *                      out of scope entirely (not drawn, not dropped)
 * @param frame         { x, y, w, h } in sheet px
 */
export function placeLabels({ labels, obstacles = [], maxLabelRank = 10, frame }) {
  // Priority THEN id — never insertion order. This is what makes the output a
  // function of the data alone (spec 7.4).
  const queue = labels
    .filter((l) => l.rank <= maxLabelRank)
    .slice()
    .sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const items = obstacles.map((o) => ({ id: `obs:${o.id}`, bbox: o.bbox }));
  const boxById = new Map(items.map((i) => [i.id, i.bbox]));
  let index = buildBBoxIndex({ items });

  const placed = [];
  const dropped = [];

  const clear = (box) => {
    if (!inFrame(box, frame)) return false;
    for (const id of index.query({ bbox: box }))
      if (overlaps(box, boxById.get(id))) return false;
    return true;
  };
  const commit = (id, box) => {
    boxById.set(id, box);
    items.push({ id, bbox: box });
    index = buildBBoxIndex({ items }); // rebuilt per commit: n <= ~400, and a
    // rebuild keeps the index a pure function of its input rather than a
    // mutable structure whose state depends on call history.
  };

  for (const l of queue) {
    // Font size falls out of the rank: a world title is not a village name.
    const size = l.rank <= 1 ? 15 : l.rank <= 3 ? 13 : l.rank <= 6 ? 11 : 9.5;
    const m = measureText({ text: l.text, size, tracking: l.rank <= 3 ? 2 : 0.6 });
    const order = l.anchorPref
      ? [...CANDIDATES.filter((c) => c[0] === l.anchorPref), ...CANDIDATES.filter((c) => c[0] !== l.anchorPref)]
      : CANDIDATES;

    let done = false;
    for (const [anchor, dx, dy] of order) {
      const box = boxFor({ at: l.at, anchor, dx, dy, m });
      if (!clear(box)) continue;
      placed.push({ id: l.id, x: box.x, y: r2(box.y + m.h * 0.78), anchor, box, size, text: l.text });
      commit(l.id, box);
      done = true;
      break;
    }
    if (done) continue;

    // Fallback ladder step 2: a leader line out to the nearest clear margin.
    // Four margins, tried N, S, E, W, at a fixed 6 px inset — deterministic.
    let leadered = false;
    for (const side of ["N", "S", "E", "W"]) {
      const box =
        side === "N" ? { x: r2(l.at[0] - m.w / 2), y: r2(frame.y + 6), w: r2(m.w), h: r2(m.h) }
        : side === "S" ? { x: r2(l.at[0] - m.w / 2), y: r2(frame.y + frame.h - 6 - m.h), w: r2(m.w), h: r2(m.h) }
        : side === "E" ? { x: r2(frame.x + frame.w - 6 - m.w), y: r2(l.at[1] - m.h / 2), w: r2(m.w), h: r2(m.h) }
        : { x: r2(frame.x + 6), y: r2(l.at[1] - m.h / 2), w: r2(m.w), h: r2(m.h) };
      if (!clear(box)) continue;
      placed.push({ id: l.id, x: box.x, y: r2(box.y + m.h * 0.78), anchor: side, box, size, text: l.text,
        leader: [[r2(l.at[0]), r2(l.at[1])], [r2(box.x + m.w / 2), r2(box.y + m.h / 2)]] });
      commit(l.id, box);
      leadered = true;
      break;
    }
    if (!leadered) dropped.push({ id: l.id, why: "no candidate position and no clear margin for a leader" });
  }
  return { placed, dropped };
}

/**
 * G-LABEL. `budget` is the hard label cap for this tier (40 at zoom tier 1);
 * null skips it. Overlaps are checked against the RETURNED boxes, not against
 * the placer's own bookkeeping — the gate must be able to disbelieve the
 * placer.
 */
export function checkLabels({ placed, dropped = [], tier, budget = null }) {
  const problems = [];
  const pairs = [];
  for (let i = 0; i < placed.length; i++)
    for (let k = i + 1; k < placed.length; k++)
      if (overlaps(placed[i].box, placed[k].box)) pairs.push(`${placed[i].id} x ${placed[k].id}`);
  if (pairs.length)
    problems.push(`G-LABEL: ${pairs.length} label boxes overlap at zoom tier ${tier} (${pairs.join(", ")})`);
  if (dropped.length)
    problems.push(`G-LABEL: ${dropped.length} labels dropped at tier ${tier}: ${dropped.map((d) => d.id).join(", ")}`);
  if (budget !== null && placed.length > budget)
    problems.push(`G-LABEL: ${placed.length} labels at zoom tier ${tier} > budget ${budget}`);
  return problems;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
node --test 'tools/mapforge/tests/labels.test.mjs'
```
Expected: PASS — 13 tests, 0 fail. **The acceptance test is the fifth one**: 300 synthetic labels, zero pairwise box overlaps, zero drops.

- [ ] **Step 5: Measure the placer against the real target**

The target sheet carries 340+ labels. Confirm the placer is affordable and the drop rate is honest:

```bash
node -e '
Promise.all([import("./tools/mapforge/lib/labels.mjs")]).then(([L]) => {
  const FRAME = { x: 0, y: 0, w: 1400, h: 1400 };
  const mk = (n) => Array.from({length: n}, (_, i) => {
    let h = Math.imul(i+1, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
    let g = Math.imul(i+7, 0xc2b2ae35); g ^= g >>> 16;
    return { id: `l-${String(i).padStart(3,"0")}`, text: "the Drowned Stair",
      at: [40 + ((h>>>0)/4294967296)*(FRAME.w-80), 40 + ((g>>>0)/4294967296)*(FRAME.h-80)],
      rank: 3 + (i % 7) };
  });
  for (const n of [100, 340, 600]) {
    const t = process.hrtime.bigint();
    const r = L.placeLabels({ labels: mk(n), obstacles: [], maxLabelRank: 10, frame: FRAME });
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    console.log(n, "labels ->", r.placed.length, "placed", r.dropped.length, "dropped", ms.toFixed(1), "ms");
  }
});'
```
Acceptance, written down so it can be judged: at **340 labels, 0 dropped and under 400 ms**. (The stated per-gate budget for `G-LABEL` is 0.40 s.) If drops appear at 340, the label sizes or candidate offsets are wrong — **fix the algorithm, never the test**. If the time is over budget, the index rebuild in `commit()` is the cause; batch the rebuild.

- [ ] **Step 6: Prove the live sheets did not move**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_render_lock.mjs --check && git status --porcelain game-client/ | wc -l
```
Expected: pass, and `0`. `labels.mjs` has no consumer until Task 10.

- [ ] **Step 7: Commit**

```bash
git add tools/mapforge/lib/labels.mjs tools/mapforge/tests/labels.test.mjs
git commit -m "feat: G-LABEL — deterministic label declutter with zoom tiers"
```

- [ ] **Step 8: QUALITY GATE — verify**

```bash
node --test 'tools/mapforge/tests/labels.test.mjs'
node scripts/check_render_lock.mjs --check
git branch --show-current && git log --oneline -1
```

- [ ] **Step 9: QUALITY GATE — independent adversarial review**

Brief: *"Review `git show HEAD`. (a) Determinism is the whole claim — find any path where the output depends on input array order, object key iteration order, floating-point accumulation order, or a clock. (b) `commit()` rebuilds the bbox index on every placement: what is the real complexity at 340 labels, and is the Step 5 timing inside the 0.40 s `G-LABEL` budget? (c) `boxFor` handles 8 anchors with two ternaries — verify each of the 8 by hand against a worked example and confirm none produces a box on the wrong side. (d) The leader-line fallback places at the frame margin but does not check the leader LINE itself for crossings; is that an acceptable stated limitation or a defect? (e) `checkLabels` is O(n^2) in placed labels — at 340 that is 57,630 comparisons; measure it. (f) Confirm the `ADVANCE_WIDTH` table covers every character actually used in `content/spine/nodes/*.json` titles and `content/spine/sheet*.json` strings — run that check yourself; an uncovered character silently falls back to 0.52 and mis-sizes a box."*

- [ ] **Step 10: QUALITY GATE — refactor** — new `fix:` commit.
- [ ] **Step 11: QUALITY GATE — re-verify** — repeat Steps 4, 5 and 6, then `git branch --show-current && git log --oneline -1`.

---

### Task 9: The baked-texture rasteriser, `GENERATOR_VERSION`, and the raster budget

**Files:**
- Create: `tools/mapforge/lib/version.mjs`
- Create: `tools/mapforge/lib/texture-bake.mjs`
- Create: `tools/mapforge/tests/texture-bake.test.mjs`
- Modify: `tools/mapforge/tests/raster.test.mjs:11` (fixture re-point)
- Modify: `scripts/lib/render-lock.mjs` (no line anchor available and none needed: the file does not exist yet — Plan A Task 10 CREATES it, and the target is the single `export const GENERATOR_VERSION = "3.0.0"` line it writes near the top, Plan A plan `:2859`). It becomes a **re-export**, so the constant has exactly one definition in the repo.

**Interfaces:**
- Consumes: `PATTERNS`, `BIOME_FILL`, `C` from `draft.mjs` (Task 6); `tools/mapforge/tests/fixtures/raster-probe.svg` (created by Plan A); `scripts/lib/render-lock.mjs`'s `computeLock` (Plan A Task 10), whose `generator.version` field this task re-points.
- Produces:
  ```js
  // tools/mapforge/lib/version.mjs
  export const GENERATOR_VERSION: string   // e.g. "3.0.0"

  // tools/mapforge/lib/texture-bake.mjs
  export const TILE_RECIPES: Record<string /*patternId*/, { w, h, ink: number[][], opacity: number }>
  export function bakeBiomeTexture({ biome, pxPerKm }): { dataUri: string, w: number, h: number }
  export function bakedUnderlay({ regions, pxPerKm }): string
  export function encodePng({ w, h, rgba }): string   // Plan-B-owned addition; returns a data: URI
  ```

**Domain notes — the measurement that forces this.** `rsvg-convert -w 2000` on the committed `cluster1-world.svg` (47 KB, 297 paths, 100 texts) takes **10.92–11.59 s**. Replacing every `url(#...)` with a flat colour drops it to **0.52 s — a 21x collapse.** Cost scales with pattern-covered *pixel area*, not pattern count (8/20/40 distinct patterns on one canvas: 2.76/2.62/2.58 s). A synthetic sheet at the agreed target density took **18.16 s and produced an 8.2 MB PNG**; fifteen sheets is **272 s and 123 MB per redraw**.

So: **bake the texture, do not tile it.** `bakedUnderlay` composites every region's biome tile into ONE full-frame raster and emits ONE `<image>`; the vector ink (coasts, roads, labels, glyphs) draws on top. rsvg then does one blit instead of millions of pattern lookups.

**Two honest costs, stated rather than hidden:**
1. **Each pattern now has two definitions** — a vector `<pattern>` in `PATTERNS` and a raster recipe in `TILE_RECIPES`. That is a drift surface. It is closed by a test asserting the two key sets are identical, and by keeping the recipe a literal transcription of the vector path's segments.
2. **PNG bytes must be deterministic ACROSS Node majors, and `node:zlib` cannot prove that.** These bytes land inside a committed, byte-compared SVG; CI pins `node-version: 18` while this worktree runs v26. Relying on `zlib.deflateSync(buf, {level: 0})` means resting a byte comparison on zlib's stored-block framing being stable across two builds we cannot both run — an assumption, not a proof. So `encodePng` **does not use zlib at all**: it hand-writes the RFC 1950 zlib wrapper (`0x78 0x01`) plus a single final RFC 1951 **stored** block (`0x01`, `LEN` LE, `NLEN` LE, raw bytes) and an adler32 trailer, all integer arithmetic. That is ~20 lines, is in the same family as this programme's no-transcendentals-on-a-committed-path rule, and is enforced by two tests: one greps the module for any `node:zlib` reference, the other checks the emitted stream byte by byte against the RFC layout. Textures are small tiles and one frame-sized underlay, so stored framing costs bytes and buys a provable property.

`GENERATOR_VERSION` lives in its own one-line module because two things read it — Plan A's `computeLock`'s `generator.version` field, and Plan C's `runId = ${seed8}-${GENERATOR_VERSION}`. A constant with two readers in two plans must have exactly one home.

**"One home" is a claim this task must MAKE TRUE, not merely assert.** Plan A Task 10 creates a local `export const GENERATOR_VERSION = "3.0.0"` inside `scripts/lib/render-lock.mjs`, because at that point `tools/mapforge/lib/version.mjs` does not exist yet. This task deletes that literal and replaces it with a re-export (Step 3b), so `grep -rn "export const GENERATOR_VERSION" scripts tools` returns exactly one line. Two consequences worth stating:

- **The import direction is `scripts/` → `tools/mapforge/`**, the reverse of the established `tools/mapforge` → `scripts/lib/spine.mjs` direction. That is deliberate: the generator version belongs to the generator, and `tools/mapforge/lib/version.mjs` has no imports of its own, so it cannot cycle. It must resolve under `npm test --prefix scripts`, which runs from a different working directory — the relative specifier `../../tools/mapforge/lib/version.mjs` is resolved against the importing module's URL, not the cwd, so it does; Step 6 proves it by running that suite.
- **Plan C must not create `version.mjs` a second time.** Plan C Task 10 consumes it; if this task has not landed, Plan C blocks on it rather than defining a third copy.

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/texture-bake.test.mjs`:

```js
// Plan B Task 9 — pattern fills are 100% of the rasteriser's cost, and the
// design was about to add pattern layers over 90% of the land. The underlay
// replaces N live patterns with ONE <image>. Determinism is non-negotiable:
// these bytes land inside a committed, byte-compared SVG.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TILE_RECIPES, bakeBiomeTexture, bakedUnderlay, encodePng } from "../lib/texture-bake.mjs";
import { PATTERNS, BIOME_FILL } from "../lib/draft.mjs";
import { GENERATOR_VERSION } from "../lib/version.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const REGIONS = [
  { id: "r1", biome: "karst",  ring: [[0, 0], [40, 0], [40, 30], [0, 30]] },
  { id: "r2", biome: "desert", ring: [[40, 0], [90, 0], [90, 40], [40, 40]] },
  { id: "r3", biome: "forest", ring: [[0, 30], [40, 30], [40, 70], [0, 70]] },
];

test("GENERATOR_VERSION is a semver string", () => {
  assert.match(GENERATOR_VERSION, /^\d+\.\d+\.\d+$/);
});

test("GENERATOR_VERSION has exactly ONE definition in the repo", () => {
  // Plan A Task 10 created a second `export const GENERATOR_VERSION = "3.0.0"`
  // inside scripts/lib/render-lock.mjs because this module did not exist yet.
  // Step 3b deletes it and re-exports instead. If both survive, the render lock
  // and Plan C's runId can disagree about which generator produced a world —
  // which is the exact failure the single-home rule exists to prevent. A
  // regex on the string itself cannot see that; only a repo-wide scan can.
  const hits = execFileSync("git",
    ["grep", "-l", "-E", "^export const GENERATOR_VERSION", "--", "scripts", "tools"],
    { cwd: ROOT, encoding: "utf8" }).trim().split("\n").sort();
  assert.deepEqual(hits, ["tools/mapforge/lib/version.mjs"]);
});

test("scripts/lib/render-lock.mjs re-exports the constant rather than redefining it", () => {
  const src = readFileSync(join(ROOT, "scripts/lib/render-lock.mjs"), "utf8");
  assert.match(src, /from "\.\.\/\.\.\/tools\/mapforge\/lib\/version\.mjs"/);
  assert.doesNotMatch(src, /^export const GENERATOR_VERSION/m);
});

test("every pattern has a tile recipe, and every recipe has a pattern", () => {
  assert.deepEqual(Object.keys(TILE_RECIPES).sort(), Object.keys(PATTERNS).sort());
});

test("every recipe is a non-empty tile of a legible size", () => {
  for (const [id, r] of Object.entries(TILE_RECIPES)) {
    assert.ok(r.w >= 7 && r.h >= 7, `${id}: tile ${r.w}x${r.h} is a grey smear at thumb scale`);
    assert.ok(Array.isArray(r.ink) && r.ink.length > 0, `${id}: no ink`);
    for (const [x0, y0, x1, y1] of r.ink) {
      for (const v of [x0, y0, x1, y1]) assert.ok(Number.isFinite(v), id);
      assert.ok(x0 >= 0 && x1 <= r.w && y0 >= 0 && y1 <= r.h, `${id}: segment leaves the tile`);
    }
    assert.ok(r.opacity > 0 && r.opacity <= 1, id);
  }
});

test("encodePng produces a valid, deterministic data URI", () => {
  const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(200);
  const a = encodePng({ w: 4, h: 4, rgba });
  assert.equal(a, encodePng({ w: 4, h: 4, rgba }), "not deterministic");
  assert.match(a, /^data:image\/png;base64,/);
  const bytes = Buffer.from(a.slice("data:image/png;base64,".length), "base64");
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "PNG signature");
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(bytes.subarray(bytes.length - 8, bytes.length - 4).toString("ascii"), "IEND");
});

test("encodePng never calls zlib — the committed-byte path is pure arithmetic", () => {
  // Determinism WITHIN one Node build is not the property that matters. These
  // bytes land inside a committed, byte-compared SVG; CI pins node-version 18
  // while this worktree runs v26, so the real question is cross-build byte
  // identity. Rather than BET on node:zlib framing being stable across majors
  // and then be unable to prove it, the encoder does not use zlib at all: it
  // hand-writes RFC 1951 stored blocks (§3.2.4) and the RFC 1950 zlib wrapper.
  // Both are fully specified bit layouts over integer arithmetic, in the same
  // family as the plan's no-transcendentals rule. This test is the enforcement.
  const src = readFileSync(join(ROOT, "tools/mapforge/lib/texture-bake.mjs"), "utf8");
  assert.doesNotMatch(src, /node:zlib|require\(["']zlib/,
    "zlib framing is an unprovable cross-version assumption on a committed-byte path");
  assert.doesNotMatch(src, /deflateSync|gzipSync/);
});

test("encodePng's zlib stream is a literal, byte-checkable stored block", () => {
  // A 4x4 opaque grey PNG. Every byte below is derivable from the two RFCs and
  // the PNG spec, so this literal is a specification, not a captured output:
  //   raw scanlines = 4 rows x (1 filter byte 0x00 + 16 bytes of 0xC8) = 68 B
  //   zlib wrapper  = 0x78 0x01, then ONE final stored block:
  //                   0x01, LEN=68 (0x44 0x00), NLEN=~68 (0xBB 0xFF), 68 raw bytes
  //   adler32 over the 68 raw bytes, big-endian
  const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(200);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255; // opaque alpha
  const bytes = Buffer.from(
    encodePng({ w: 4, h: 4, rgba }).slice("data:image/png;base64,".length), "base64");
  // Locate the IDAT payload: 4-byte length, "IDAT", payload, 4-byte CRC.
  const i = bytes.indexOf(Buffer.from("IDAT", "ascii"));
  const len = bytes.readUInt32BE(i - 4);
  const z = bytes.subarray(i + 4, i + 4 + len);
  assert.equal(z[0], 0x78, "zlib CMF (deflate, 32K window)");
  assert.equal(z[1], 0x01, "zlib FLG (no dict, fastest) — 0x7801 has a valid FCHECK");
  assert.equal(z[2], 0x01, "one FINAL STORED block");
  assert.equal(z.readUInt16LE(3), 68, "LEN = 4 rows x (1 filter + 16 px bytes)");
  assert.equal(z.readUInt16LE(5), 0xffff - 68, "NLEN = one's complement of LEN");
  assert.equal(z[7], 0x00, "row 0 filter byte is None — filters are never adaptive here");
  assert.equal(z[8], 200, "first pixel byte");
  // adler32 of the 68 raw bytes, computed here from the spec, not from the impl.
  let a = 1, b = 0;
  for (const v of z.subarray(7, 7 + 68)) { a = (a + v) % 65521; b = (b + a) % 65521; }
  assert.equal(z.readUInt32BE(7 + 68), ((b << 16) | a) >>> 0, "adler32 trailer");
  assert.equal(z.length, 2 + 5 + 68 + 4, "no second block, no padding");
});

test("bakeBiomeTexture is deterministic and covers every biome", () => {
  for (const biome of Object.keys(BIOME_FILL)) {
    const a = bakeBiomeTexture({ biome, pxPerKm: 3.5 });
    assert.equal(a.dataUri, bakeBiomeTexture({ biome, pxPerKm: 3.5 }).dataUri, biome);
    assert.ok(a.w > 0 && a.h > 0, biome);
    assert.match(a.dataUri, /^data:image\/png;base64,/);
  }
});

test("bakedUnderlay emits ONE <image> and ZERO pattern references", () => {
  const svg = bakedUnderlay({ regions: REGIONS, pxPerKm: 3.5 });
  assert.equal([...svg.matchAll(/<image /g)].length, 1, "the whole point is one blit");
  assert.equal([...svg.matchAll(/url\(#/g)].length, 0, "no live pattern may survive the bake");
  assert.match(svg, /^<image [^>]*href="data:image\/png;base64,/);
});

test("bakedUnderlay is deterministic and independent of region input order", () => {
  const a = bakedUnderlay({ regions: REGIONS, pxPerKm: 3.5 });
  assert.equal(a, bakedUnderlay({ regions: REGIONS, pxPerKm: 3.5 }));
  assert.equal(a, bakedUnderlay({ regions: [...REGIONS].reverse(), pxPerKm: 3.5 }));
});

test("a region whose biome has no fill is reported, not silently blank", () => {
  assert.throws(
    () => bakedUnderlay({ regions: [{ id: "x", biome: "not-a-biome", ring: [[0, 0], [1, 0], [1, 1]] }], pxPerKm: 3.5 }),
    /G-BIOME-INK: biome "not-a-biome" has no BIOME_FILL entry/,
    "the bake is called from inside a builder that catches — see synthetic-sheet.mjs");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
node --test 'tools/mapforge/tests/texture-bake.test.mjs'
```
Expected: FAIL — `ERR_MODULE_NOT_FOUND ... lib/texture-bake.mjs` and `... lib/version.mjs`.

- [ ] **Step 3: Write `version.mjs`**

Create `tools/mapforge/lib/version.mjs`:

```js
// tools/mapforge/lib/version.mjs — ONE home for the generator version.
//
// Two readers in two plans: Plan A's computeLock() stamps it into
// content/world/render-lock.json's `generator.version`, and Plan C's
// generate-world.mjs builds `runId = ${seed.slice(0,8)}-${GENERATOR_VERSION}`.
// A constant with two readers in two plans must have exactly one home, or the
// lock and the run id disagree about which generator produced a world.
//
// BUMP IT whenever a change alters emitted bytes for unchanged inputs.
export const GENERATOR_VERSION = "3.0.0";
```

- [ ] **Step 3b: Delete Plan A's copy and re-export instead**

Plan A Task 10 created `export const GENERATOR_VERSION = "3.0.0";` inside `scripts/lib/render-lock.mjs`, with the comment "Plan B moves this to tools/mapforge/lib/version.mjs". This is that move. In `scripts/lib/render-lock.mjs`, delete that line and its comment, and put in their place:

```js
// The generator version has ONE home: tools/mapforge/lib/version.mjs. This is
// the only scripts/ -> tools/mapforge/ import in the repo (every other edge
// runs the other way, tools/mapforge -> scripts/lib/spine.mjs). It is
// deliberate: the version belongs to the generator, version.mjs imports
// nothing, so no cycle is possible. The re-export keeps every existing
// importer of render-lock.mjs — including scripts/tests/render-lock.test.mjs,
// which imports GENERATOR_VERSION from here — resolving unchanged.
export { GENERATOR_VERSION } from "../../tools/mapforge/lib/version.mjs";
import { GENERATOR_VERSION } from "../../tools/mapforge/lib/version.mjs";
```

(The named `import` alongside the `export … from` is required: `computeLock` reads the constant in its own body, and a re-export alone creates no local binding — the same pattern Plan A Task 2 used in `spine.mjs`.)

Verify immediately:

```bash
git grep -n -E "^export const GENERATOR_VERSION" -- scripts tools
node -e 'import("./scripts/lib/render-lock.mjs").then(m=>console.log(m.GENERATOR_VERSION))'
node --test --test-name-pattern "render lock" 'scripts/tests/*.test.mjs' 2>&1 | tail -5
```
Expected: the grep returns exactly `tools/mapforge/lib/version.mjs:...`, the node line prints `3.0.0`, and the render-lock suite is green — which is what proves the reverse-direction relative specifier resolves when `scripts/` is the working directory.

- [ ] **Step 4: Write `texture-bake.mjs`**

Create `tools/mapforge/lib/texture-bake.mjs`:

```js
// tools/mapforge/lib/texture-bake.mjs — bake the texture, do not tile it.
//
// MEASURED: rsvg-convert -w 2000 on the committed 47 KB cluster1 sheet takes
// 10.92-11.59 s; replacing every url(#...) with a flat colour drops it to
// 0.52 s. Cost scales with pattern-covered PIXEL AREA. At target density one
// sheet took 18.16 s and 8.2 MB. So the pattern layer is composited ONCE into
// a single raster and emitted as ONE <image>; vector ink draws on top.
//
// DETERMINISM: these bytes land inside a committed, byte-compared SVG, and CI
// pins node-version 18 while local dev runs v26. node:zlib is therefore BANNED
// on this path — not because level-0 framing is known to differ, but because
// "it should be identical across two zlib builds we cannot both run" is an
// assumption we would be resting a byte comparison on. Instead the zlib stream
// is written by hand: the RFC 1950 wrapper (0x78 0x01) plus ONE final RFC 1951
// STORED block (0x01, LEN LE, NLEN LE, raw bytes) plus an adler32 trailer.
// All integer arithmetic, all fully specified bit layouts — the same discipline
// as this programme's no-transcendentals-on-a-committed-path rule.
//
// THE HONEST COST: each pattern now has two definitions, a vector <pattern>
// in draft.mjs's PATTERNS and a raster recipe here. The key sets are asserted
// equal by texture-bake.test.mjs, and each recipe is a literal transcription
// of its vector path's segments — read them side by side when changing one.
import { BIOME_FILL, C } from "./draft.mjs";

// Tile recipes: [x0, y0, x1, y1] ink segments in tile space, transcribed from
// the matching PATTERNS entry. `opacity` matches the vector stroke weight's
// visual density (a 0.45-wide stroke reads lighter than a 0.9 one).
export const TILE_RECIPES = {
  pIce:      { w: 26, h: 13, opacity: 0.70, ink: [[0,4,11,4],[15,4,24,4],[4,9,17,9],[20,9,26,9]] },
  pUpland:   { w: 18, h: 14, opacity: 0.70, ink: [[2,10,6,4],[6,4,10,10],[11,13,14,8],[14,8,17,13]] },
  pFlat:     { w: 16, h: 16, opacity: 0.70, ink: [[3,4,3,4],[11,9,11,9],[6,13,6,13]] },
  pRim:      { w: 11, h: 11, opacity: 0.60, ink: [[0,11,11,0]] },
  pBramble:  { w: 9,  h: 9,  opacity: 0.55, ink: [[0,9,9,0],[0,0,9,9]] },
  pMire:     { w: 22, h: 16, opacity: 0.80, ink: [[2,8,11,8],[6,8,6,4],[4,8,4,5],[9,8,9,5],[13,15,21,15],[17,15,17,12],[15,15,15,13],[19,15,19,13]] },
  pRock:     { w: 12, h: 12, opacity: 0.70, ink: [[2,2,2,6],[7,5,7,9],[10,1,10,4],[4,9,4,12]] },
  pRiver:    { w: 20, h: 18, opacity: 0.65, ink: [[3,12,3,7],[6,14,6,10],[13,7,13,2],[16,9,16,5]] },
  pReported:         { w: 7,  h: 7,  opacity: 0.35, ink: [[0,7,7,0]] },
  pReportedSworn:    { w: 7,  h: 7,  opacity: 0.50, ink: [[0,7,7,0]] },
  pReportedHearsay:  { w: 11, h: 11, opacity: 0.42, ink: [[0,11,11,0]] },
  pReportedInferred: { w: 15, h: 15, opacity: 0.30, ink: [[0,15,15,0]] },
  pOcean:    { w: 24, h: 24, opacity: 0.35, ink: [[0,6,12,6],[12,6,24,6],[0,18,12,18],[12,18,24,18]] },
  pMeadow:   { w: 20, h: 20, opacity: 0.50, ink: [[4,15,4,12],[10,18,10,15],[16,13,16,10]] },
  pForest:   { w: 18, h: 18, opacity: 0.60, ink: [[5,14,8,8],[8,8,11,14],[12,17,14,12],[14,12,17,17]] },
  pAsh:      { w: 14, h: 14, opacity: 0.60, ink: [[3,3,3,3],[9,7,9,7],[5,11,5,11],[12,12,12,12]] },
  pBuilt:    { w: 12, h: 12, opacity: 0.45, ink: [[0,6,12,6],[6,0,6,12]] },
  pTundra:   { w: 20, h: 20, opacity: 0.50, ink: [[3,10,8,10],[12,16,17,16],[15,6,15,6]] },
  pLake:     { w: 18, h: 18, opacity: 0.55, ink: [[2,7,10,7],[6,14,14,14]] },
  pScree:    { w: 14, h: 14, opacity: 0.60, ink: [[2,3,4,5],[8,2,10,4],[4,9,6,11],[10,10,12,12]] },
  pKarst:    { w: 16, h: 16, opacity: 0.55, ink: [[0,5,16,5],[0,11,16,11],[5,0,5,5],[11,5,11,11],[3,11,3,16]] },
  pBadland:  { w: 15, h: 15, opacity: 0.55, ink: [[2,14,5,5],[5,5,8,14],[9,14,11,8],[11,8,14,14]] },
  pDesert:   { w: 22, h: 14, opacity: 0.55, ink: [[0,10,11,10],[11,10,22,10]] },
  pLava:     { w: 13, h: 13, opacity: 0.75, ink: [[1,4,4,7],[4,7,1,10],[7,2,10,5],[10,5,7,8],[4,10,7,12]] },
  pReef:     { w: 16, h: 16, opacity: 0.60, ink: [[3,12,3,8],[1,10,5,10],[11,14,11,9],[9,11,13,11]] },
};

// ── a minimal, deterministic PNG encoder (stdlib only) ─────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// RFC 1950 + RFC 1951 stored blocks, written by hand. No node:zlib anywhere on
// this path — see the DETERMINISM note at the top of the file.
// A stored block carries at most 65,535 bytes, so a large underlay is emitted
// as several blocks with BFINAL set only on the last.
const MAX_STORED = 0xffff;
function adler32(buf) {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) { a = (a + buf[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
function zlibStored(raw) {
  const parts = [Buffer.from([0x78, 0x01])]; // CMF=0x78 (deflate/32K), FLG=0x01
  for (let off = 0; off < raw.length || off === 0; off += MAX_STORED) {
    const len = Math.min(MAX_STORED, raw.length - off);
    const head = Buffer.alloc(5);
    head[0] = off + len >= raw.length ? 0x01 : 0x00; // BFINAL on the last block
    head.writeUInt16LE(len, 1);
    head.writeUInt16LE(0xffff - len, 3);            // NLEN = ~LEN
    parts.push(head, Buffer.from(raw.subarray(off, off + len)));
    if (len === 0) break;
  }
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32BE(adler32(raw), 0);
  parts.push(trailer);
  return Buffer.concat(parts);
}

/** RGBA8 -> a `data:image/png;base64,...` URI. Deterministic by construction. */
export function encodePng({ w, h, rgba }) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter type 0 (None) on every scanline
    Buffer.from(rgba.buffer ?? rgba, (rgba.byteOffset ?? 0) + y * w * 4, w * 4)
      .copy(raw, y * (1 + w * 4) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

// ── raster helpers ─────────────────────────────────────────────────────────
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
function line(put, x0, y0, x1, y1) {  // integer Bresenham — no transcendentals
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    put(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function tileFor(patternId) {
  const r = TILE_RECIPES[patternId];
  if (!r) throw new Error(`G-BIOME-INK: pattern "${patternId}" has no tile recipe`);
  const [br, bg, bb] = hex(C.parchmentDeep);
  const [ir, ig, ib] = hex(C.inkSoft);
  const rgba = new Uint8ClampedArray(r.w * r.h * 4);
  for (let i = 0; i < r.w * r.h; i++) {
    rgba[i * 4] = br; rgba[i * 4 + 1] = bg; rgba[i * 4 + 2] = bb; rgba[i * 4 + 3] = 255;
  }
  const put = (x, y) => {
    if (x < 0 || y < 0 || x >= r.w || y >= r.h) return;
    const i = (y * r.w + x) * 4, a = r.opacity;
    rgba[i] = br + (ir - br) * a;
    rgba[i + 1] = bg + (ig - bg) * a;
    rgba[i + 2] = bb + (ib - bb) * a;
  };
  for (const [x0, y0, x1, y1] of r.ink) line(put, x0 | 0, y0 | 0, x1 | 0, y1 | 0);
  return { rgba, w: r.w, h: r.h };
}

export function bakeBiomeTexture({ biome, pxPerKm }) {
  const patternId = BIOME_FILL[biome];
  if (!patternId) throw new Error(`G-BIOME-INK: biome "${biome}" has no BIOME_FILL entry`);
  const t = tileFor(patternId);
  return { dataUri: encodePng({ w: t.w, h: t.h, rgba: t.rgba }), w: t.w, h: t.h };
}

const evenOdd = (ring, px, py) => {
  let inside = false;
  for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
    const [xi, yi] = ring[i], [xk, yk] = ring[k];
    if (yi > py !== yk > py && px < ((xk - xi) * (py - yi)) / (yk - yi) + xi) inside = !inside;
  }
  return inside;
};

/**
 * ONE <image> for the whole texture layer. `regions` is
 * [{ id, biome, ring }] in km; ring order does not matter — regions are
 * composited in ascending `id` so the output is a function of the set.
 */
export function bakedUnderlay({ regions, pxPerKm }) {
  let maxX = 0, maxY = 0;
  for (const r of regions) for (const [x, y] of r.ring) { if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
  const W = Math.max(1, Math.ceil(maxX * pxPerKm));
  const H = Math.max(1, Math.ceil(maxY * pxPerKm));
  const [pr, pg, pb] = hex(C.parchmentDeep);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    out[i * 4] = pr; out[i * 4 + 1] = pg; out[i * 4 + 2] = pb; out[i * 4 + 3] = 255;
  }
  for (const r of [...regions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const patternId = BIOME_FILL[r.biome];
    if (!patternId) throw new Error(`G-BIOME-INK: biome "${r.biome}" has no BIOME_FILL entry`);
    const t = tileFor(patternId);
    let lo = Infinity, hi = -Infinity, top = Infinity, bot = -Infinity;
    for (const [x, y] of r.ring) {
      if (x < lo) lo = x; if (x > hi) hi = x; if (y < top) top = y; if (y > bot) bot = y;
    }
    const x0 = Math.max(0, Math.floor(lo * pxPerKm)), x1 = Math.min(W, Math.ceil(hi * pxPerKm));
    const y0 = Math.max(0, Math.floor(top * pxPerKm)), y1 = Math.min(H, Math.ceil(bot * pxPerKm));
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++) {
        if (!evenOdd(r.ring, (px + 0.5) / pxPerKm, (py + 0.5) / pxPerKm)) continue;
        const s = ((py % t.h) * t.w + (px % t.w)) * 4, d = (py * W + px) * 4;
        out[d] = t.rgba[s]; out[d + 1] = t.rgba[s + 1]; out[d + 2] = t.rgba[s + 2]; out[d + 3] = 255;
      }
  }
  return `<image href="${encodePng({ w: W, h: H, rgba: out })}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`;
}
```

- [ ] **Step 5: Re-point the raster test at the small fixture**

`tools/mapforge/tests/raster.test.mjs` costs **12.13 s** today because it rasterises the 47 KB pattern-heavy baseline at the default 2000 px. Plan A created `tools/mapforge/tests/fixtures/raster-probe.svg` (`<= 5 KB`) and is retiring `basin-baseline.svg`. Change `:11`:

```js
const FIXTURE_SVG = resolve(HERE, "fixtures/basin-baseline.svg");
```
to:
```js
// Plan B Task 9: re-pointed off the retired 47 KB pattern-heavy baseline
// (12.13 s at the default 2000 px) onto Plan A's small probe at 500 px — this
// test proves rasterize()'s CONTRACT, not any sheet's appearance. 1.07 s.
const FIXTURE_SVG = resolve(HERE, "fixtures/raster-probe.svg");
```
and in the first test's `rasterize(...)` call, pass the width explicitly:
```js
    const result = rasterize({ svgPath: FIXTURE_SVG, pngPath, width: 500 });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
node --test 'tools/mapforge/tests/texture-bake.test.mjs'
time node --test 'tools/mapforge/tests/raster.test.mjs'
```
Expected: both PASS. The raster suite must now finish in **under 3 s** (it was 12.13 s).

- [ ] **Step 7: Measure the payoff, and write the number down**

Prove the underlay actually collapses the cost, on the same shape of input that measured 18.16 s:

```bash
node -e '
Promise.all([import("./tools/mapforge/lib/texture-bake.mjs")]).then(async ([T]) => {
  const fs = await import("node:fs");
  const regions = [];
  for (let i = 0; i < 120; i++) {
    const cx = (i % 12) * 33 + 8, cy = Math.floor(i / 12) * 33 + 8;
    regions.push({ id: `r-${String(i).padStart(3,"0")}`,
      biome: ["karst","desert","forest","tundra","lava","reef","badland","scree"][i % 8],
      ring: [[cx,cy],[cx+30,cy],[cx+30,cy+30],[cx,cy+30]] });
  }
  let t = process.hrtime.bigint();
  const baked = T.bakedUnderlay({ regions, pxPerKm: 3.5 });
  console.log("bake:", (Number(process.hrtime.bigint()-t)/1e6).toFixed(0), "ms,", (baked.length/1024).toFixed(0), "KB of data URI");
  fs.writeFileSync("/tmp/baked.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1400" viewBox="0 0 1400 1400">${baked}</svg>`);
});'
time rsvg-convert -w 2000 /tmp/baked.svg -o /tmp/baked.png
ls -la /tmp/baked.png
```
Acceptance, written down: `rsvg-convert -w 2000` on the baked sheet completes in **under 2 s** (the committed `sheets.maxRasterSeconds` budget). Record the measured seconds in the commit message. If it exceeds 2 s, the underlay is still emitting patterns somewhere — the second `texture-bake.test.mjs` assertion (`zero url(#`) is the check that should have caught it.

- [ ] **Step 8: Prove the live sheets did not move**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_render_lock.mjs --check && git status --porcelain game-client/ | wc -l
```
Expected: pass, and `0`.

- [ ] **Step 9: Commit**

```bash
git add tools/mapforge/lib/version.mjs tools/mapforge/lib/texture-bake.mjs tools/mapforge/tests/texture-bake.test.mjs tools/mapforge/tests/raster.test.mjs
git commit -m "feat: baked texture underlay + deterministic PNG encoder"
```

- [ ] **Step 10: QUALITY GATE — verify**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_render_lock.mjs --check
git branch --show-current && git log --oneline -1
```

- [ ] **Step 11: QUALITY GATE — independent adversarial review**

Brief: *"Review `git show HEAD`. (a) `encodePng` — verify the IHDR fields, the scanline filter bytes, and the CRC of at least one chunk **by hand** against the PNG spec; then confirm a real decoder reads it (`rsvg-convert`, or `node -e` with sharp under `scripts/`). (b) Determinism: `zlibStored` is hand-written precisely so no cross-Node-major assumption survives — verify its output against RFC 1950 §2.2 and RFC 1951 §3.2.4 **by hand**, including the multi-block path (feed it more than 65,535 bytes and confirm BFINAL is set only on the last block, that `NLEN === 0xFFFF - LEN` in each header, and that adler32 is computed over the whole uncompressed stream, not per block); then confirm `rsvg-convert` and a real decoder both read the result. Confirm by grep that `node:zlib` appears nowhere in the module. (c) `TILE_RECIPES` duplicates `PATTERNS` — spot-check three recipes against their vector paths and report any that do not match. (d) `bakedUnderlay`'s inner loop is per-pixel point-in-polygon at O(pixels x ring vertices); at 120 regions of 200 vertices on a 1400x1400 frame, what is the real cost? Measure it — if it is over 4 s the design needs a scanline fill. (e) `Buffer.from(rgba.buffer ...)` — confirm it is correct for both a `Uint8ClampedArray` with a non-zero `byteOffset` and a plain array."*

- [ ] **Step 12: QUALITY GATE — refactor** — new `fix:` commit.
- [ ] **Step 13: QUALITY GATE — re-verify** — repeat Steps 6, 7 and 8, then `git branch --show-current && git log --oneline -1`.

---

### Task 10: The synthetic target-density sheet — the canary that proves all of it

**Files:**
- Create: `tools/mapforge/tests/fixtures/synthetic-world/world.json`
- Create: `tools/mapforge/lib/synthetic-sheet.mjs`
- Create: `game-client/assets/art/maps/synthetic-density.svg`
- Modify: `tools/mapforge/render-sheet.mjs:38-50` (register the sheet)
- Modify: `tools/asset-storybook/maps-index.json` (20-line data file, no anchor: the whole `sheets[]` array is rewritten by hand and re-checked by `tools/asset-storybook/tests/maps-index.test.mjs`; this task adds the third row)
- Modify: `content/world/render-lock.json` (generated file, no anchor: created by Plan A Task 10 and only ever rewritten wholesale by `node scripts/check_render_lock.mjs --write` — never hand-edited)
- Test: `tools/mapforge/tests/synthetic-sheet.test.mjs`

**Interfaces:**
- Consumes: `checkBiomeInk` (Task 6), `GLYPHS`/`symbolDefs`/`glyphUse`/`checkGlyphCoverage` (Task 7), `placeLabels`/`checkLabels`/`RANKS` (Task 8), `bakedUnderlay` (Task 9), `patternDefs`/`LEGEND`/`C`/`r2`/`esc` (Task 6), `computeLock` (Plan A).
- Produces:
  ```js
  // tools/mapforge/lib/synthetic-sheet.mjs
  export function makeSyntheticWorld({ landmasses = 13, regions = 160, instances = 1740, labels = 340 }):
    { regions: [...], instances: [...], labels: [...] }
  export function buildSyntheticSheet({ repoRoot }): { svg: string, notes: string[], problems: string[] }
  ```
  and `SHEETS.synthetic` — the third registry entry, `maxLabelRank: 10`.

**Domain notes — why this sheet is committed rather than thrown away.** Spec R10: *"Phase 3 precedes the redraw for exactly this reason: build the fills, glyphs, priority declutter and zoom tiers against today's small chart, where a regression is visible. Acceptance: the atlas sheet renders 300 synthetic labels with zero collisions and no hand-tuning."* Today's chart is small, so a regression at target density would not show up in it at all. The canary sheet is the only artifact in the repo that is **actually the size of the world we are about to build**, and the owner rule ("every produced artifact must be observable in a review surface") applies to it like anything else: it gets a `SHEETS` entry, a `maps-index.json` row, a render-lock line and a storybook card.

The fixture world is **generated by an integer hash from a fixed seed**, not committed as data — 160 rings and 1,740 instances of committed JSON would be ~500 KB of fixture nobody reads. `world.json` holds only the **parameters and the expected census**, so the fixture is reviewable in twenty lines and the shapes are reproducible.

It is deliberately **not** in `art-manifest.json`: it is a test canary, not shipped art, and adding it there would demand a licence row and a `.thumbs` entry for something no player ever sees. `maps-index.json` parity (X8) is satisfied because that test checks `SHEETS` <-> index, not the art manifest.

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/synthetic-sheet.test.mjs`:

```js
// Plan B Task 10 — the canary. This is the ONLY artifact in the repo built at
// the size of the world Plan C is about to generate: 13 landmasses, 160
// regions, 1,740 glyph instances, 340 labels. Every Phase 3 capability is
// proved here before it touches a live sheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeSyntheticWorld, buildSyntheticSheet } from "../lib/synthetic-sheet.mjs";
import { SHEETS } from "../render-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const FIXTURE = JSON.parse(readFileSync(join(HERE, "fixtures/synthetic-world/world.json"), "utf8"));

test("the fixture world hits the target census exactly", () => {
  const w = makeSyntheticWorld(FIXTURE.params);
  assert.equal(w.regions.length, FIXTURE.expect.regions);
  assert.equal(w.instances.length, FIXTURE.expect.instances);
  assert.equal(w.labels.length, FIXTURE.expect.labels);
  assert.equal(new Set(w.regions.map((r) => r.landmass)).size, FIXTURE.expect.landmasses);
});

test("makeSyntheticWorld is deterministic", () => {
  assert.deepEqual(makeSyntheticWorld(FIXTURE.params), makeSyntheticWorld(FIXTURE.params));
});

test("ACCEPTANCE: the canary builds with ZERO problems at target density", () => {
  const { svg, notes, problems } = buildSyntheticSheet({ repoRoot: ROOT });
  assert.deepEqual(problems, [], problems.join("\n"));
  assert.ok(svg.startsWith("<svg "), "not an svg");
  assert.ok(notes.some((n) => /labels 340 placed 340 dropped 0/.test(n)), notes.join(" | "));
  assert.ok(notes.some((n) => /instances 1740/.test(n)), notes.join(" | "));
});

test("the canary uses ONE baked image and ZERO live patterns", () => {
  const { svg } = buildSyntheticSheet({ repoRoot: ROOT });
  assert.equal([...svg.matchAll(/<image /g)].length, 1);
  assert.equal([...svg.matchAll(/url\(#p/g)].length, 0, "a live pattern survived the bake");
});

test("1,740 instances are drawn as <use>, not inlined paths", () => {
  const { svg } = buildSyntheticSheet({ repoRoot: ROOT });
  assert.equal([...svg.matchAll(/<use href="#g-/g)].length, 1740);
  assert.ok([...svg.matchAll(/<symbol id="g-/g)].length <= 40);
});

test("the canary stays inside the committed sheet byte budget", () => {
  const budgets = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  const { svg } = buildSyntheticSheet({ repoRoot: ROOT });
  assert.ok(Buffer.byteLength(svg, "utf8") <= budgets.sheets.maxSvgBytes,
    `${Buffer.byteLength(svg, "utf8")} > ${budgets.sheets.maxSvgBytes}`);
});

test("the committed synthetic-density.svg is not stale", () => {
  const { svg } = buildSyntheticSheet({ repoRoot: ROOT });
  assert.equal(readFileSync(join(ROOT, SHEETS.synthetic.outSvg), "utf8"), svg,
    "run: node tools/mapforge/render-sheet.mjs --sheet synthetic");
});

test("the registry entry carries a title and a zoom tier", () => {
  assert.equal(typeof SHEETS.synthetic.title, "string");
  assert.equal(SHEETS.synthetic.maxLabelRank, 10);
});

test("BUDGET: rsvg-convert rasterises the canary in under 2 s at 2000 px", (t) => {
  const probe = spawnSync("rsvg-convert", ["--version"], { stdio: "pipe" });
  if (probe.error || probe.status !== 0) { t.skip("rsvg-convert not installed"); return; }
  const budgets = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  const out = join(mkdtempSync(join(tmpdir(), "canary-")), "out.png");
  const t0 = process.hrtime.bigint();
  const run = spawnSync("rsvg-convert",
    ["-w", String(budgets.sheets.rasterWidthPx), join(ROOT, SHEETS.synthetic.outSvg), "-o", out],
    { stdio: "pipe" });
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  assert.equal(run.status, 0, String(run.stderr));
  assert.ok(statSync(out).size > 0);
  assert.ok(secs <= budgets.sheets.maxRasterSeconds,
    `G-RASTER-BUDGET: ${secs.toFixed(2)} s > budget ${budgets.sheets.maxRasterSeconds} s at ${budgets.sheets.rasterWidthPx} px`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
node --test 'tools/mapforge/tests/synthetic-sheet.test.mjs'
```
Expected: FAIL — `ERR_MODULE_NOT_FOUND ... lib/synthetic-sheet.mjs`.

- [ ] **Step 3: Write the fixture parameters**

Create `tools/mapforge/tests/fixtures/synthetic-world/world.json`:

```json
{
  "about": "Parameters for the target-density canary sheet. The 160 rings and 1,740 instances are GENERATED from `seed` by an integer hash in synthetic-sheet.mjs, not committed — half a megabyte of fixture nobody reads is not a fixture. What is committed is the parameter set and the census it must hit, so the sheet is reviewable in twenty lines and reproducible byte for byte.",
  "params": {
    "seed": 20260816,
    "landmasses": 13,
    "regions": 160,
    "instances": 1740,
    "labels": 340,
    "frameKm": 400,
    "pxPerKm": 3.5
  },
  "expect": { "landmasses": 13, "regions": 160, "instances": 1740, "labels": 340 }
}
```

- [ ] **Step 4: Write `synthetic-sheet.mjs`**

Create `tools/mapforge/lib/synthetic-sheet.mjs`:

```js
// tools/mapforge/lib/synthetic-sheet.mjs — the target-density canary.
//
// Spec R10: "build the fills, glyphs, priority declutter and zoom tiers
// against today's small chart, where a regression is visible." Today's chart
// is small enough that a target-density regression would not show up in it at
// all — so this sheet IS the target density, and it is committed, indexed and
// locked like any other artifact (owner rule, 2026-08-15).
//
// It draws no real geography and claims none: it is a test instrument.
// Builder contract, exactly as basin-sheet.mjs: never throw, return
// { svg, notes, problems }.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { C, r2, esc, LEGEND, patternDefs } from "./draft.mjs";
import { checkBiomeInk } from "./ink.mjs";
import { symbolDefs, glyphUse, checkGlyphCoverage, GLYPHS } from "./glyphs.mjs";
import { placeLabels, checkLabels, RANKS } from "./labels.mjs";
import { bakedUnderlay } from "./texture-bake.mjs";
import { BIOMES } from "../../../scripts/lib/spine.mjs";

// One integer hash, seeded once — no Math.random, no clock, no transcendental.
function rnd(seed, i) {
  let h = Math.imul(seed ^ i, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const LAND_BIOMES = BIOMES.filter((b) => b !== "ocean");

export function makeSyntheticWorld({ seed, landmasses, regions, instances, labels, frameKm }) {
  // Regions: a jittered lattice of quads covering the frame, `landmasses`
  // groups by index so the census is exact rather than emergent.
  const cols = Math.ceil(Math.sqrt(regions));
  const rows = Math.ceil(regions / cols);
  const cw = frameKm / cols, ch = frameKm / rows;
  const rs = [];
  for (let i = 0; i < regions; i++) {
    const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
    const jx = (rnd(seed, i * 3) - 0.5) * cw * 0.18;
    const jy = (rnd(seed, i * 3 + 1) - 0.5) * ch * 0.18;
    rs.push({
      id: `s-r-${String(i).padStart(3, "0")}`,
      landmass: `c${String((i % landmasses) + 1).padStart(2, "0")}`,
      biome: LAND_BIOMES[Math.floor(rnd(seed, i * 3 + 2) * LAND_BIOMES.length)],
      ring: [[r2(cx + jx), r2(cy + jy)], [r2(cx + cw + jx), r2(cy + jy)],
             [r2(cx + cw + jx), r2(cy + ch + jy)], [r2(cx + jx), r2(cy + ch + jy)]],
    });
  }
  // Instances: spread over the regions, each carrying a real glyph id.
  const glyphIds = Object.keys(GLYPHS);
  const inst = [];
  for (let i = 0; i < instances; i++) {
    const r = rs[i % rs.length];
    const [x0, y0] = r.ring[0], [x1, y1] = r.ring[2];
    inst.push({
      id: `s-lf-${String(i).padStart(4, "0")}`,
      glyph: glyphIds[Math.floor(rnd(seed, 7919 + i) * glyphIds.length)],
      at: [r2(x0 + rnd(seed, 104729 + i) * (x1 - x0)), r2(y0 + rnd(seed, 15485863 + i) * (y1 - y0))],
    });
  }
  // Labels: the real rank distribution — a handful of oceans and continents,
  // then regions, then the long tail of named landforms and villages.
  const RANK_MIX = [RANKS.ocean, RANKS.continent, RANKS.sea, RANKS.region,
    RANKS.capital, RANKS.hub, RANKS.dungeon, RANKS.namedLandform, RANKS.village];
  const WORDS = ["Gildmark", "the Drowned Stair", "Rooktide Reach", "Netstead", "Ashen Spar",
    "Quillreef", "the Meltwash", "Skerryfast", "Thirstwold", "Loamspit", "Wracklow"];
  const lbl = [];
  for (let i = 0; i < labels; i++)
    lbl.push({
      id: `s-l-${String(i).padStart(3, "0")}`,
      text: WORDS[i % WORDS.length],
      at: [r2(8 + rnd(seed, 1299709 + i) * (frameKm - 16)), r2(8 + rnd(seed, 2038074743 + i) * (frameKm - 16))],
      rank: RANK_MIX[Math.min(Math.floor(rnd(seed, 999983 + i) * RANK_MIX.length), RANK_MIX.length - 1)],
    });
  return { regions: rs, instances: inst, labels: lbl };
}

export function buildSyntheticSheet({ repoRoot }) {
  const problems = [];
  const notes = [];
  let fixture, lexicon;
  try {
    fixture = JSON.parse(readFileSync(
      join(repoRoot, "tools/mapforge/tests/fixtures/synthetic-world/world.json"), "utf8"));
    lexicon = JSON.parse(readFileSync(
      join(repoRoot, "content/world/lexicon/landforms.json"), "utf8"));
  } catch (e) {
    problems.push(`synthetic: cannot read inputs: ${e.message}`);
    return { svg: "", notes, problems };
  }

  const { seed, frameKm, pxPerKm } = fixture.params;
  let world;
  try { world = makeSyntheticWorld(fixture.params); }
  catch (e) { problems.push(`synthetic: ${e.message}`); return { svg: "", notes, problems }; }

  const W = Math.round(frameKm * pxPerKm);
  const PAD = 46;
  const SHEET_W = W + PAD * 2, SHEET_H = W + PAD * 2 + 40;

  // ---- G-BIOME-INK: nothing is emitted that is not referenced ---------------
  const referenced = [];   // the bake replaces every pattern reference on the
  // canvas, so the only live pattern left is the legend swatches' own.
  const legendTier = 3;
  for (const row of LEGEND) if (row.tier <= legendTier) referenced.push(row.pattern);
  const emitted = [...new Set(referenced)];
  problems.push(...checkBiomeInk({ emittedIds: emitted, referencedIds: referenced, legendTier }));

  // ---- G-GLYPH -------------------------------------------------------------
  const usedGlyphs = [...new Set(world.instances.map((i) => i.glyph))].sort();
  const namedCounts = {};
  for (const row of lexicon) namedCounts[row.id] = usedGlyphs.includes(row.glyph) ? 1 : 0;
  problems.push(...checkGlyphCoverage({ lexicon, namedCounts, emittedIds: usedGlyphs }));

  // ---- G-LABEL -------------------------------------------------------------
  const frame = { x: PAD, y: PAD, w: W, h: W };
  const { placed, dropped } = placeLabels({
    labels: world.labels.map((l) => ({ ...l, at: [PAD + l.at[0] * pxPerKm, PAD + l.at[1] * pxPerKm] })),
    obstacles: [], maxLabelRank: 10, frame });
  problems.push(...checkLabels({ placed, dropped, tier: legendTier }));

  // ---- the baked texture underlay ------------------------------------------
  let underlay = "";
  try { underlay = bakedUnderlay({ regions: world.regions, pxPerKm }); }
  catch (e) { problems.push(String(e.message)); }

  notes.push(`regions ${world.regions.length} · instances ${world.instances.length}`);
  notes.push(`labels ${world.labels.length} placed ${placed.length} dropped ${dropped.length}`);
  notes.push(`glyph families used ${usedGlyphs.length} / ${Object.keys(GLYPHS).length}`);

  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${SHEET_H}" viewBox="0 0 ${SHEET_W} ${SHEET_H}" role="img" aria-label="Target-density canary sheet">`);
  o.push(`<title>TARGET-DENSITY CANARY</title>`);
  o.push(`<desc>Not geography. A synthetic sheet at the agreed target density (13 landmasses, 160 regions, 1740 landform instances, 340 labels), built by tools/mapforge/lib/synthetic-sheet.mjs so a render regression at scale is visible before the real world exists.</desc>`);
  o.push("<defs>");
  o.push(patternDefs({ ids: emitted }));
  o.push(symbolDefs({ ids: usedGlyphs }));
  o.push("</defs>");
  o.push(`<style>text { font-family: Georgia, "Iowan Old Style", "Times New Roman", serif; fill: ${C.ink}; }
  .lbl { paint-order: stroke fill; stroke: ${C.parchment}; stroke-width: 3.4px; stroke-linejoin: round; }</style>`);
  o.push(`<rect width="${SHEET_W}" height="${SHEET_H}" fill="${C.parchment}"/>`);
  o.push(`<g transform="translate(${PAD} ${PAD})">${underlay}</g>`);
  o.push(`<g color="${C.inkMid}" fill="none" stroke="currentColor" stroke-width="0.9">`);
  for (const i of world.instances)
    o.push(glyphUse({ id: i.glyph, x: r2(PAD + i.at[0] * pxPerKm), y: r2(PAD + i.at[1] * pxPerKm), size: 7 }));
  o.push("</g>");
  for (const p of placed) {
    if (p.leader)
      o.push(`<path d="M${p.leader[0][0]},${p.leader[0][1]} L${p.leader[1][0]},${p.leader[1][1]}" stroke="${C.inkSoft}" stroke-width="0.5" fill="none"/>`);
    o.push(`<text class="lbl" x="${p.x}" y="${p.y}" font-size="${p.size}" fill="${C.ink}">${esc(p.text)}</text>`);
  }
  // legend, zoom-tiered
  let ly = SHEET_H - 28;
  let lx = PAD;
  for (const row of LEGEND.filter((r) => r.tier <= legendTier)) {
    o.push(`<rect x="${r2(lx)}" y="${r2(ly)}" width="18" height="12" fill="url(#${row.pattern})" stroke="${C.inkSoft}" stroke-width="0.5"/>`);
    o.push(`<text x="${r2(lx + 22)}" y="${r2(ly + 10)}" font-size="8" fill="${C.inkMid}">${esc(row.label)}</text>`);
    lx += 118;
    if (lx > SHEET_W - 120) { lx = PAD; ly += 14; }
  }
  o.push("</svg>");
  return { svg: o.join("\n") + "\n", notes, problems };
}
```

- [ ] **Step 5: Register the sheet**

In `tools/mapforge/render-sheet.mjs`, import the builder and add the third entry (keeping the `title`/`maxLabelRank` keys Plan A introduced):

```js
import { buildSyntheticSheet } from "./lib/synthetic-sheet.mjs";
```
```js
  synthetic: {
    title: "Target-Density Canary",
    outSvg: "game-client/assets/art/maps/synthetic-density.svg",
    outPng: "game-client/assets/art/maps/synthetic-density.png",
    maxLabelRank: 10,
    build: buildSyntheticSheet,
  },
```

- [ ] **Step 6: Build it, index it, lock it**

Run:
```bash
node tools/mapforge/render-sheet.mjs --sheet synthetic
```
Then add the row to `tools/asset-storybook/maps-index.json` (`svg`/`png` must byte-match the registry, or X8 reddens Gate 1):

```json
    {
      "id": "synthetic",
      "title": "Target-Density Canary",
      "svg": "game-client/assets/art/maps/synthetic-density.svg",
      "png": "game-client/assets/art/maps/synthetic-density.png",
      "note": "NOT GEOGRAPHY — a synthetic sheet at the agreed target density (13 landmasses, 160 regions, 1,740 landform instances, 340 labels). It exists so a render regression at scale is visible before the real world exists."
    }
```

Then extend the lock (this adds a **new** artifact; it does not re-baseline an existing one):
```bash
node scripts/check_render_lock.mjs --write
git diff --stat content/world/render-lock.json
```
Expected: `content/world/render-lock.json | 1 +` — exactly **one added line**. **If any existing line changed, stop**: a live sheet moved and the Task 6–11 invariant is broken. Find it before continuing.

- [ ] **Step 7: Run every test**

Run:
```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node --test 'tools/asset-storybook/tests/*.test.mjs'
node tools/mapforge/render-sheet.mjs --sheet cluster1 --check
node tools/mapforge/render-sheet.mjs --sheet atlas --check
node tools/mapforge/render-sheet.mjs --sheet synthetic --check
node scripts/check_render_lock.mjs --check
node scripts/check_content.mjs --only=spine 2>&1 | grep world-budget
```
Expected: all exit 0. The `world-budget: sheets 3 files, ... (budget 18, 524288)` line must show the canary inside the byte cap.

- [ ] **Step 8: Look at it**

```bash
open -a "Google Chrome" game-client/assets/art/maps/synthetic-density.svg
```
Judged against the written criteria, not taste: **no two labels overlap**; **the glyph field reads as many different marks, not a field of dots**; **the biome underlay shows visibly different textures between neighbouring regions**; **the legend explains every texture on the canvas**. A failure here is a real defect in Tasks 6–9, not a canary problem — go fix the module.

- [ ] **Step 9: Commit**

```bash
git add tools/mapforge/lib/synthetic-sheet.mjs tools/mapforge/tests/fixtures/synthetic-world/world.json tools/mapforge/tests/synthetic-sheet.test.mjs tools/mapforge/render-sheet.mjs tools/asset-storybook/maps-index.json content/world/render-lock.json game-client/assets/art/maps/synthetic-density.svg
git commit -m "feat: target-density canary sheet at 160 regions / 340 labels"
```

(No `.png` yet — Task 11 sets the thumb policy and bakes it. Until then `maps-index.test.mjs` will fail its on-disk PNG assertion, which is exactly why Task 11 follows immediately and why Step 7 above runs the storybook suite: **expect that one failure here, and only that one.** If any other storybook assertion fails, it is real.)

- [ ] **Step 10: QUALITY GATE — verify**

```bash
node --test 'tools/mapforge/tests/synthetic-sheet.test.mjs'
node scripts/check_render_lock.mjs --check
git show --stat HEAD
git branch --show-current && git log --oneline -1
```

- [ ] **Step 11: QUALITY GATE — independent adversarial review**

Brief: *"Review `git show HEAD` and open `game-client/assets/art/maps/synthetic-density.svg` in Chrome. (a) Is the canary genuinely at target density, or does it cheat — count `<use>` elements, `<text>` elements, and distinct region rings in the committed SVG and compare against 1,740 / 340 / 160. (b) The label rank mix: is it representative, or does it stack the deck by making most labels low-rank and therefore easy? (c) Confirm `buildSyntheticSheet` cannot throw for any input — it is called from a CLI that treats a throw as a crash, not a diagnosable red. (d) Confirm the `render-lock.json` diff added exactly one line and changed none. (e) The `namedCounts` construction in `buildSyntheticSheet` marks a type as named iff its glyph is used — is that a real exercise of `G-GLYPH`, or does it make the gate vacuous?"*

- [ ] **Step 12: QUALITY GATE — refactor** — new `fix:` commit; re-render and re-lock if the SVG changes.
- [ ] **Step 13: QUALITY GATE — re-verify** — repeat Step 7, then `git branch --show-current && git log --oneline -1`.

---

### Task 11: PNGs out of the review loop — 512 px thumbs, storybook, art manifest

**Files:**
- Modify: `tools/mapforge/render-sheet.mjs:52-120` (`--png` opt-in, `--png-width`, default 512)
- Modify: `scripts/bake_thumbnails.mjs:60` and its job list (map sheets bake at `<= 512` px)
- Modify: `tools/asset-storybook/tests/maps-index.test.mjs:44-71`
- Modify: `tools/asset-storybook/js/maps.mjs:243-330` (the legend/glyph panel)
- Modify: `game-client/assets/art/art-manifest.json:490-535`
- Modify: `tools/asset-storybook/maps-index.json` (data file, no anchor — `png` values unchanged; the files behind them shrink)

**Interfaces:**
- Consumes: `SHEETS` (Task 10), `LEGEND` + `GLYPHS` (Tasks 6–7), `content/world/lexicon/landforms.json` (Task 1).
- Produces: no new module. The change is a **policy**, encoded in three places that must agree.

**Domain notes — the conflict the spec left open, and how it is resolved.** Spec §7.5 says *"PNGs leave the review loop, commit SVG only"*. But three committed mechanisms disagree:
- `tools/asset-storybook/tests/maps-index.test.mjs:56-70` asserts the PNG exists on disk, **in both directions**, and it runs in **Gate 1 AND CI**.
- `art-manifest.json:490,517` register `art:map-cluster1` / `art:map-atlas` with `file: maps/*.png`, and `check_asset_manifest.mjs`'s guard (U) rehashes those bytes against `.thumbs/index.json`.
- F-044 established that **SVG ink vanishes at thumbnail scale**, which is the entire reason the PNGs exist.

**Resolution, pinned:** `outPng` becomes a **`<= 512` px thumb** — committed, small, and still a real raster so the storybook card is legible. The **2000 px ship raster is generated at ship time and never committed.** `.gitattributes:29` puts `game-client/assets/**/*.png` in LFS but not `*.svg`, so this cuts LFS churn from ~123 MB per redraw to a few hundred KB. Today's two PNGs are **1.2 MB and 373 KB**; at 512 px they land near 100 KB each.

- [ ] **Step 1: Write the failing test**

Replace the third test in `tools/asset-storybook/tests/maps-index.test.mjs` (`:44-71`) with:

```js
test("every indexed sheet's svg/png paths match SHEETS and exist on disk", () => {
  const index = loadIndex();
  for (const sheet of index.sheets) {
    const registrySheet = SHEETS[sheet.id];
    assert.ok(registrySheet, `maps-index.json row "${sheet.id}" has no matching SHEETS entry`);
    assert.equal(sheet.svg, registrySheet.outSvg,
      `maps-index.json "${sheet.id}".svg must match SHEETS[${sheet.id}].outSvg`);
    assert.equal(sheet.png, registrySheet.outPng,
      `maps-index.json "${sheet.id}".png must match SHEETS[${sheet.id}].outPng`);
    assert.ok(existsSync(join(REPO_ROOT, sheet.svg)), `${sheet.svg} does not exist on disk`);
    assert.ok(existsSync(join(REPO_ROOT, sheet.png)), `${sheet.png} does not exist on disk`);
  }
});

// Plan B Task 11 — PNGs left the review loop (spec 7.5). What is committed is
// a <= 512 px THUMB, because F-044 proved SVG ink vanishes at card scale, so
// the card cannot simply point at the vector. The 2000 px ship raster is
// generated at ship time and never committed: .gitattributes puts
// game-client/assets/**/*.png in LFS but not *.svg, and a full redraw at 2000
// px is ~123 MB of LFS blobs with no cross-version dedup.
test("every committed sheet PNG is a review THUMB, not a ship raster", () => {
  const index = loadIndex();
  const budgets = JSON.parse(readFileSync(
    join(REPO_ROOT, "content/world/budgets.json"), "utf8"));
  for (const sheet of index.sheets) {
    const bytes = statSync(join(REPO_ROOT, sheet.png)).size;
    assert.ok(bytes <= budgets.sheets.maxThumbBytes,
      `${sheet.png} is ${bytes} bytes — a committed sheet PNG must be a <= ${budgets.sheets.thumbWidthPx} px thumb ` +
      `(budget ${budgets.sheets.maxThumbBytes}); re-bake with ` +
      `\`node tools/mapforge/render-sheet.mjs --sheet ${sheet.id} --png\``);
  }
});

test("every sheet also has a card note, so the storybook explains what it is", () => {
  for (const sheet of loadIndex().sheets) {
    assert.ok(typeof sheet.note === "string" && sheet.note.length > 20, sheet.id);
    assert.ok(typeof sheet.title === "string" && sheet.title.length > 0, sheet.id);
  }
});
```

Add `statSync` and `readFileSync` to the file's `node:fs` import.

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
node --test 'tools/asset-storybook/tests/maps-index.test.mjs'
```
Expected: FAIL — `synthetic-density.png does not exist on disk`, and `cluster1-world.png is 1258291 bytes — a committed sheet PNG must be a <= 512 px thumb`, and `budgets.sheets.maxThumbBytes` is `undefined`.

- [ ] **Step 3: Add the thumb budget**

In `content/world/budgets.json`, extend the `sheets` section:

```json
  "sheets": {
    "maxSheets": 18,
    "maxSheetsWhy": "The roster, enumerated: 1 atlas + 1 basin + 13 continent (Plan E) + 1 overlay + 1 fabric (Plan C) + 1 synthetic (Plan B) = 18. The design's \"<= 16\" counted the shipped chart only (1 atlas + 13 continents + 1 basin + 1 overlay) and omitted the three review sheets the owner's every-artifact-observable rule requires. Raising this cap without adding a line here is a budget failure, not a fix.",
    "maxSvgBytes": 524288,
    "maxRasterSeconds": 2,
    "rasterWidthPx": 2000,
    "thumbWidthPx": 512,
    "maxThumbBytes": 262144
  }
```

Update `scripts/tests/world-budget.test.mjs`'s `budgets.sheets` `deepEqual` to match — the test is the contract, so it changes in the same commit and for a stated reason.

- [ ] **Step 4: Make PNG generation opt-in, at thumb width**

In `tools/mapforge/render-sheet.mjs`, replace the width constant and the argv handling:

```js
const PNG_WIDTH = 2000;
```
becomes:
```js
// Plan B Task 11 (spec 7.5): the committed raster is a REVIEW THUMB. The
// 2000 px ship raster is produced at ship time with --png-width 2000 and is
// never committed — a full redraw at 2000 px is ~123 MB of LFS blobs.
const THUMB_WIDTH = 512;
```

```js
  const wantPng = !argv.includes("--no-png");
```
becomes:
```js
  // --png is now OPT-IN. --no-png is still accepted (and is now the default)
  // so every existing invocation and every doc line keeps working.
  const wantPng = argv.includes("--png");
  let pngWidth = THUMB_WIDTH;
```

and in the argv loop:
```js
    if (argv[i] === "--sheet") sheetId = argv[++i];
    else if (argv[i] === "--no-png" || argv[i] === "--check") continue;
```
becomes:
```js
    if (argv[i] === "--sheet") sheetId = argv[++i];
    else if (argv[i] === "--png-width") pngWidth = Number(argv[++i]);
    else if (argv[i] === "--png" || argv[i] === "--no-png" || argv[i] === "--check") continue;
```

and in the rasterise call, `width: PNG_WIDTH` becomes `width: pngWidth`, with the log line `console.log(\`  wrote ${outPng} (${pngWidth}px wide)\`)`.

Update the usage comment at `:12`:
```js
//   node tools/mapforge/render-sheet.mjs --sheet <id> [--png] [--png-width <n>] [--check]
//   default: SVG only. --png writes a 512 px review thumb; --png-width 2000
//   is the ship raster and is NEVER committed.
```

Update `tools/mapforge/README.md:61-64` to match.

- [ ] **Step 5: Re-bake the three thumbs**

```bash
node tools/mapforge/render-sheet.mjs --sheet cluster1 --png
node tools/mapforge/render-sheet.mjs --sheet atlas --png
node tools/mapforge/render-sheet.mjs --sheet synthetic --png
ls -la game-client/assets/art/maps/
```
Expected: three `.png` files, each **under 256 KB**. The `.svg` files must be byte-unchanged — check with `git status --porcelain game-client/assets/art/maps/*.svg` (must print nothing).

- [ ] **Step 6: Re-bake the `.thumbs` index and update the art manifest**

Guard (U) rehashes each manifest entry's source bytes, so shrinking the PNGs invalidates two thumb hashes:

```bash
npm ci --prefix scripts
node scripts/bake_thumbnails.mjs --only art:map-cluster1
node scripts/bake_thumbnails.mjs --only art:map-atlas
node scripts/check_asset_manifest.mjs
```

In `game-client/assets/art/art-manifest.json`, update both map entries' `gen` blocks so the recorded raster settings match reality (`:530-534` for atlas, the matching block for cluster1):

```json
        "raster": "rsvg-convert -w 512 (review thumb; the 2000px ship raster is generated at ship time and never committed — spec 2026-08-16 §7.5)",
        "deterministic": true, "width": 512,
```

Do **not** add an `art:map-synthetic` entry: the canary is a test instrument, not shipped art, and a manifest entry would demand a licence row and a `.thumbs` record for something no player sees. `maps-index.json` parity (X8) is satisfied because that gate checks `SHEETS` <-> index, never the art manifest.

- [ ] **Step 7: Give the storybook a legend and glyph panel**

In `tools/asset-storybook/js/maps.mjs`, after the `note` paragraph in `mountMaps` (`:262-270`), add a collapsible reference panel. This is the owner rule made real for Tasks 6–7: the ink and glyph vocabularies are produced artifacts and must be *observable*, not merely committed.

```js
  // Plan B Task 11 — the ink + glyph reference. The fills and the 40 glyph
  // families are produced artifacts under the owner rule (2026-08-15), so
  // they get a review surface here rather than living only in source.
  // Loaded lazily and degraded silently, exactly like loadIndex() above: a
  // missing lexicon must never take the Maps tab down with it.
  const ref = document.createElement("details");
  ref.className = "maps-ref";
  const sum = document.createElement("summary");
  sum.textContent = "Map vocabulary — fills, terrain kinds and glyph families";
  ref.appendChild(sum);
  const refBody = document.createElement("div");
  refBody.className = "grid maps-ref-grid";
  ref.appendChild(refBody);
  section.appendChild(ref);

  (async () => {
    try {
      const [{ LEGEND, patternDefs }, { GLYPHS }, lexRes] = await Promise.all([
        import(REPO_ROOT_REL + "tools/mapforge/lib/draft.mjs"),
        import(REPO_ROOT_REL + "tools/mapforge/lib/glyphs.mjs"),
        fetch(REPO_ROOT_REL + "content/world/lexicon/landforms.json"),
      ]);
      const lexicon = lexRes.ok ? await lexRes.json() : [];
      const swatches = LEGEND.map((row) =>
        `<figure class="card"><svg width="120" height="52" viewBox="0 0 120 52">` +
        `<defs>${patternDefs({ ids: [row.pattern] })}</defs>` +
        `<rect width="120" height="52" fill="url(#${row.pattern})" stroke="#8a7f6c" stroke-width="0.8"/>` +
        `</svg><figcaption class="filename">${row.pattern} — ${row.label} (tier ${row.tier})</figcaption></figure>`).join("");
      const byGlyph = new Map();
      for (const r of lexicon) {
        if (!byGlyph.has(r.glyph)) byGlyph.set(r.glyph, []);
        byGlyph.get(r.glyph).push(r.id);
      }
      const marks = Object.keys(GLYPHS).map((id) =>
        `<figure class="card"><svg width="64" height="64" viewBox="0 0 64 64">` +
        `<path d="${GLYPHS[id]({ x: 32, y: 30, size: 34, seed: 1 })}" fill="none" stroke="#241f18" stroke-width="1.2" stroke-linejoin="round"/>` +
        `</svg><figcaption class="filename">${id} — ${(byGlyph.get(id) || []).length} types</figcaption></figure>`).join("");
      refBody.innerHTML = swatches + marks;
    } catch (err) {
      console.warn("[asset-storybook] map vocabulary panel unavailable:", err);
      ref.remove();
    }
  })();
```

- [ ] **Step 8: Run everything**

Run:
```bash
node --test 'tools/asset-storybook/tests/*.test.mjs'
node --test 'tools/mapforge/tests/*.test.mjs'
node --test 'scripts/tests/world-budget.test.mjs'
node scripts/check_asset_manifest.mjs
node scripts/check_render_lock.mjs --check
node scripts/check_content.mjs --only=spine 2>&1 | grep world-budget
git status --porcelain game-client/assets/art/maps/*.svg | wc -l
```
Expected: all exit 0, and the last command prints `0` — **no SVG moved**.

- [ ] **Step 9: Open the storybook and look at the panel**

```bash
(cd tools/asset-storybook && python3 -m http.server 6007) &
sleep 2 && open -a "Google Chrome" http://localhost:6007/#map-sheets
```
**Kill any stale server on 6007 first** (`lsof -ti:6007 | xargs kill`) — an F-039 `http.server` left running on that port once made a whole new tab look missing for a day. Acceptance: three sheet cards render with legible thumbs; the "Map vocabulary" panel expands to 25 fill swatches and 40 glyph marks; the browser console has no errors.

- [ ] **Step 10: Commit**

```bash
git add tools/mapforge/render-sheet.mjs tools/mapforge/README.md content/world/budgets.json scripts/tests/world-budget.test.mjs tools/asset-storybook/tests/maps-index.test.mjs tools/asset-storybook/js/maps.mjs game-client/assets/art/art-manifest.json game-client/assets/.thumbs game-client/assets/art/maps/*.png
git commit -m "feat: 512px review thumbs, ship raster out of the loop, storybook vocabulary panel"
```

- [ ] **Step 11: QUALITY GATE — verify**

```bash
./scripts/precheck.sh --no-install 2>&1 | tail -20
node --test 'tools/asset-storybook/tests/*.test.mjs'
git branch --show-current && git log --oneline -1
```
Expected: the Gate 1 summary with every section `PASS`.

- [ ] **Step 12: QUALITY GATE — independent adversarial review**

Brief: *"Review `git show HEAD`, and open the storybook Maps tab. (a) THREE mechanisms must agree on the PNG policy — `maps-index.test.mjs`, `art-manifest.json` guard (U), and `render-sheet.mjs`'s default. Name any way they can now disagree. (b) `--png` became opt-in: grep the whole repo (`scripts/`, `.github/`, `tools/`, `*.md`) for every `render-sheet` invocation and confirm none silently stopped producing a PNG something else depends on. (c) The storybook panel imports `draft.mjs` and `glyphs.mjs` **from the browser** — confirm both are dependency-free ESM with no `node:` imports on the reachable path (`glyphs.mjs` imports `r2` from `draft.mjs`; `draft.mjs` imports nothing) and that a failure removes the panel rather than the tab. (d) At 512 px, is the cluster1 thumb still legible on a card, or did F-044's vanishing-ink problem come back? Look at it. (e) Confirm `.thumbs/index.json` was regenerated for both changed sources and that `check_asset_manifest.mjs` reports zero STALE."*

- [ ] **Step 13: QUALITY GATE — refactor** — new `fix:` commit.
- [ ] **Step 14: QUALITY GATE — re-verify** — repeat Step 8, then `git branch --show-current && git log --oneline -1`.

---

### Task 12: Re-ink the two live sheets — the one commit in this plan that moves a pixel

**Files:**
- Modify: `tools/mapforge/lib/atlas-sheet.mjs:286-292` (defs), `:366-477` (the greedy stack), `:451` (the circle), and a new legend block. Its import line gains `FILL_FOR` from `./draft.mjs` and `frontierPattern` from `./ink.mjs`:
  ```js
  import { C, r2, esc, LEGEND, FILL_FOR, patternDefs } from "./draft.mjs";
  import { frontierPattern } from "./ink.mjs";   // the provenance-keyed frontier hatch
  ```
  `ink.mjs` imports from `draft.mjs` and `draft.mjs` imports nothing, so this cannot cycle — the same check Task 6's review brief already makes.
- Modify: `tools/mapforge/lib/basin-sheet.mjs:199-207` (fill lookup), `:647-665` (the legend block)
- Modify: `content/world/render-lock.json` (generated file, no anchor — re-baselined via `check_render_lock.mjs --write`, **the only time in this plan**)
- Modify: `game-client/assets/art/maps/atlas-world.svg`, `cluster1-world.svg` and their thumbs (generated artifacts, no anchor — rewritten wholesale by `render-sheet.mjs` and `bake_thumbnails.mjs`)
- Verify (do NOT edit): `.github/workflows/ci.yml:113-125` already carries the mapforge suite, the render lock and `render-sheet --check`, added by Plan A Task 12. Adding them again produces two identically-named steps and doubles the CI cost of the suite.
- Modify: `tools/mapforge/tests/basin-sheet.test.mjs`, `tools/mapforge/tests/atlas-sheet.test.mjs` — their four NON-baseline behavioural assertions only; the byte-baseline tests in both files are untouched (Global Constraints, the migration invariant)

**Interfaces:**
- Consumes: everything from Tasks 6–10.
- Produces: no new interface. This task **adopts** them.

**Domain notes — read D-B3 at the top of this plan before starting.** This commit changes rendered bytes and re-baselines the lock. What it may **not** change is what the map *says*: `node scripts/check_spine_emit.mjs --check` must exit 0 with no drift (all 47 emitted files including `mapDimensions.ts`), and the jest pin must be green. Those two commands are the boundary between "re-inking" and "redrawing", and Plan E owns the redraw.

**Four adoptions, in this order, each verified alone.** This is R12's discipline (*"re-baseline in a strict order within the commit, each verified alone; any failure surviving a completed step is a real defect, not whiplash"*) applied at task scale.

**Adoption 1 — the fill lookup (provably zero-byte).** `atlas-sheet.mjs:370-374` currently reads:
```js
    const isIce = land.terrainKind === "ice";
    put(
      `<path d="${smooth(land.placement.points, true, ZONE_TENSION)}" ` +
        `fill="url(#${isIce ? "pIce" : "pReported"})" stroke="${C.ink}" stroke-width="${isIce ? 0.7 : 0.55}"` +
        `${isIce ? "" : ' class="coast-reported"'}/>`,
    );
```
Replace with the table lookup:
```js
    // Plan B Task 12: the fill comes from FILL_FOR now, not a boolean. This is
    // provably byte-identical today — n-rimewall-cap is the ONLY world child
    // carrying a terrainKind ("ice" -> pIce) and every other one has none
    // (-> pReported) — but it means a generated continent with a real
    // terrainKind inks correctly instead of hatching as unsurveyed.
    // A reported region has NO terrainKind by construction, so it falls to
    // the frontier hatch keyed on its provenance rather than a flat default.
    // STILL byte-identical today: no committed node carries `provenance`, and
    // frontierPattern(undefined) is exactly "pReported" — the three densities
    // only start drawing once Plan C's fabric supplies the field.
    const fill = patternFor(land);
    const isIce = fill === "pIce";
    put(
      `<path d="${smooth(land.placement.points, true, ZONE_TENSION)}" ` +
        `fill="url(#${fill})" stroke="${C.ink}" stroke-width="${isIce ? 0.7 : 0.55}"` +
        `${isIce ? "" : ' class="coast-reported"'}/>`,
    );
```
Import `FILL_FOR` from `./draft.mjs`, and declare the lookup **once at module scope** so the `<defs>` list and the draw loop cannot diverge:
```js
// ONE expression, used by both the <defs> builder and the draw loop. Writing
// the fallback twice is how a sheet ends up referencing pReportedSworn while
// <defs> emits only pReported — a self-inflicted G-BIOME-INK
// 'referenced but not emitted' at the first node that carries provenance.
const patternFor = (n) => FILL_FOR[n.terrainKind] ?? frontierPattern(n.provenance);
```
Also change the `<defs>` block at `:287` so it emits exactly the patterns this sheet references:
```js
  // No forced "pReported" entry: every non-ice world child resolves to it
  // today via frontierPattern(undefined), so the set is {pIce, pReported}
  // either way and the sheet stays byte-identical — while a node that later
  // carries provenance emits the density it actually draws with.
  const referencedPatterns = [...new Set(worldLand.map(patternFor))].sort();
  put(patternDefs({ ids: referencedPatterns }));
  problems.push(...checkBiomeInk({ emittedIds: referencedPatterns, referencedIds: referencedPatterns }));
```
**Verify alone:** `node tools/mapforge/render-sheet.mjs --sheet atlas --check` must still exit 0 **before you touch anything else**. If it does not, the lookup is not equivalent — fix it here.

**Adoption 2 — glyphs replace the five circle variants.** `atlas-sheet.mjs:451`:
```js
          put(`<circle cx="${X(f.at[0])}" cy="${Y(f.at[1])}" r="${isPort ? 2 : 1.1}" fill="${C.ink}"/>`);
```
becomes:
```js
          // Plan B Task 12: a port is a mark, not a bigger dot. A feature
          // carrying a lexicon `type` draws its family's glyph; an untyped
          // point keeps the plain dot, so nothing untyped changes meaning.
          const gid = f.type ? glyphForType({ lexicon, typeId: f.type }) : null;
          if (gid) { usedGlyphs.add(gid); put(glyphUse({ id: gid, x: X(f.at[0]), y: Y(f.at[1]), size: isPort ? 9 : 7 })); }
          else put(`<circle cx="${X(f.at[0])}" cy="${Y(f.at[1])}" r="${isPort ? 2 : 1.1}" fill="${C.ink}"/>`);
```
Declare `const usedGlyphs = new Set();` near `problems`, read the lexicon once at the top of the builder (in a `try`, pushing to `problems` on failure — **never throw**), and emit `symbolDefs({ ids: [...usedGlyphs].sort() })` into `<defs>`. **No committed feature carries a `type` today**, so this adoption is also byte-zero until Plan D writes one. Add `problems.push(...checkGlyphCoverage({ lexicon, namedCounts, emittedIds: [...usedGlyphs] }))`.

**Verify alone:** `--check` still exits 0.

**Adoption 3 — `placeLabels` replaces the greedy vertical stack. This one moves bytes.** Delete `atlas-sheet.mjs:469-476`:
```js
    clusterLabels.sort((a, b) => (a.at[1] - b.at[1] || (a.id < b.id ? -1 : 1)));
    const MIN_GAP_KM = 16 / ATLAS_PX_PER_KM; // ~16px baseline-to-baseline at map scale
    let lastY = -Infinity;
    for (const l of clusterLabels) {
      const y = Math.max(l.at[1], lastY + MIN_GAP_KM);
      lastY = y;
      putLabel(lineLabel(l.text, [l.at[0], y], l.angleDeg, l.opts));
    }
```
Accumulate every continent's `clusterLabels` into one sheet-wide list instead (move the array out of the `for (const land of worldLand)` loop), tag each with a rank, and after the loop run one placement pass over the whole sheet — the ocean names included, because *"labels that collide across continents"* is precisely what the per-continent stack could never see:
```js
  // Plan B Task 12: ONE placement pass over the whole sheet. The greedy
  // vertical stack this replaces (a) only saw one continent at a time and
  // (b) needed three hand-tuning attempts to fix a single collision — see
  // the comment block it came from. placeLabels is priority-then-id, so it is
  // a function of the data alone; a label it cannot place is REPORTED.
  const frame = { x: ATLAS_MAP_LEFT, y: ATLAS_MAP_TOP, w: MAP_W, h: MAP_H };
  const reqs = sheetLabels.map((l) => ({
    id: l.id, text: l.text, rank: l.rank, at: [X(l.at[0]), Y(l.at[1])] }));
  const { placed, dropped } = placeLabels({
    labels: reqs, obstacles: [], maxLabelRank: sheet.maxLabelRank ?? 8, frame });
  problems.push(...checkLabels({ placed, dropped, tier: 1, budget: 40 }));
  for (const p of placed) {
    if (p.leader)
      putLabel(`<path d="M${p.leader[0][0]},${p.leader[0][1]} L${p.leader[1][0]},${p.leader[1][1]}" stroke="${C.inkSoft}" stroke-width="0.5" fill="none"/>`);
    const src = sheetLabels.find((l) => l.id === p.id);
    putLabel(`<text class="lbl" x="${p.x}" y="${p.y}" font-size="${p.size}"` +
      `${src.opts?.italic ? ' font-style="italic"' : ""} fill="${src.opts?.fill ?? C.ink}"` +
      ` letter-spacing="${src.opts?.tracking ?? 0.6}">${esc(p.text)}</text>`);
  }
  notes.push(`labels ${reqs.length} placed ${placed.length} dropped ${dropped.length}`);
```
Rank assignment, from `RANKS`: continent titles `RANKS.continent`, ocean names `RANKS.ocean`, region titles `RANKS.region`, port features `RANKS.hub`, line-feature names `RANKS.namedLandform`. Set `sheet-atlas.json`'s tier via the registry (`SHEETS.atlas.maxLabelRank`), **not** a literal.

Note the `G-LABEL` budget of **40 at tier 1** is deliberately tight; the committed atlas sheet carries **37** `<text>` elements today, so it has 3 to spare. If a rank assignment pushes it over, that is the gate telling you a label belongs on a continent sheet, not the world sheet.

**Adoption 4 — the atlas sheet gains a legend; the basin sheet's legend reads `LEGEND`.** The atlas sheet has **no legend block at all** while drawing two fills. Add one below the frame, using `LEGEND.filter((r) => r.tier <= 2)`. In `basin-sheet.mjs:647-665`, replace the `TERRAIN_LEGEND` loop with the same tiered read and update the header string:
```js
  put(
    `<text x="${PANEL_X}" y="${r2(py)}" font-size="12" letter-spacing="2" fill="${C.inkMid}">FILLS · NO CONTOURS</text>`,
  );
  py += 16;
  const rows = LEGEND.filter((r) => r.tier <= 1);
  for (let i = 0; i < rows.length; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const bx = PANEL_X + col * 250, by = py + row * 34;
    put(`<rect x="${bx}" y="${r2(by)}" width="40" height="24" fill="${C.parchmentDeep}" stroke="${C.inkSoft}" stroke-width="0.8"/>`);
    put(`<rect x="${bx}" y="${r2(by)}" width="40" height="24" fill="url(#${rows[i].pattern})"/>`);
    put(`<text x="${bx + 48}" y="${r2(by + 16)}" font-size="12.5" fill="${C.ink}">${esc(rows[i].label)}</text>`);
  }
  py += Math.ceil(rows.length / 2) * 34 + 4;
```
(The literal `"SIX FILLS"` becomes `"FILLS"` and the hard-coded `3 * 34` becomes a computed row count — both were assumptions that six rows is forever.)

- [ ] **Step 1: Write the failing behavioural tests**

Add to `tools/mapforge/tests/atlas-sheet.test.mjs` (the existing behavioural tests survive verbatim; these are new):

```js
// Plan B Task 12 — the sheet adopts the Phase 3 capabilities.
test("the atlas sheet places every label through the declutter, with none dropped", () => {
  const { svg, notes, problems } = buildAtlasSheet({ repoRoot: ROOT });
  assert.deepEqual(problems, [], problems.join("\n"));
  const note = notes.find((n) => n.startsWith("labels "));
  assert.ok(note, notes.join(" | "));
  assert.match(note, /dropped 0$/, note);
});

test("no two label boxes overlap on the built atlas sheet", () => {
  const { svg } = buildAtlasSheet({ repoRoot: ROOT });
  // Re-derive the boxes from the emitted text, so the assertion does not
  // trust the placer's own bookkeeping.
  const texts = [...svg.matchAll(/<text class="lbl" x="([-\d.]+)" y="([-\d.]+)" font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)];
  assert.ok(texts.length >= 30, `only ${texts.length} labels on the sheet`);
  const boxes = texts.map((m) => {
    const size = Number(m[3]);
    const { w, h } = measureText({ text: m[4], size });
    return { x: Number(m[1]), y: Number(m[2]) - h * 0.78, w, h, t: m[4] };
  });
  for (let i = 0; i < boxes.length; i++)
    for (let k = i + 1; k < boxes.length; k++) {
      const a = boxes[i], b = boxes[k];
      assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h),
        `"${a.t}" overlaps "${b.t}"`);
    }
});

test("the atlas sheet now carries a legend block", () => {
  const { svg } = buildAtlasSheet({ repoRoot: ROOT });
  assert.ok(svg.includes("reported, not surveyed"), "no legend row for the frontier hatch");
  assert.ok([...svg.matchAll(/<rect [^>]*fill="url\(#p/g)].length >= 2, "no legend swatches");
});

test("the atlas sheet emits only the patterns it references", () => {
  const { svg } = buildAtlasSheet({ repoRoot: ROOT });
  const emitted = new Set([...svg.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]));
  const referenced = new Set([...svg.matchAll(/url\(#(p[A-Za-z]+)\)/g)].map((m) => m[1]));
  assert.deepEqual([...emitted].sort(), [...referenced].sort());
});
```

Import `measureText` from `../lib/labels.mjs` in that test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
node --test 'tools/mapforge/tests/atlas-sheet.test.mjs'
```
Expected: FAIL — no `labels ...` note; no legend rows; `emitted` includes eight patterns while `referenced` has two.

- [ ] **Step 3: Apply adoption 1, verify alone**

Apply adoption 1 above, then:
```bash
node tools/mapforge/render-sheet.mjs --sheet atlas --check && echo "ADOPTION 1: byte-zero, as predicted"
```
Expected: exit 0. **A non-zero exit here means the lookup is not equivalent** — do not proceed by re-baselining; fix the lookup.

- [ ] **Step 4: Apply adoption 2, verify alone**

Apply adoption 2, then:
```bash
node tools/mapforge/render-sheet.mjs --sheet atlas --check && echo "ADOPTION 2: byte-zero, as predicted"
```
Expected: exit 0 (no committed feature carries a `type`).

- [ ] **Step 5: Apply adoptions 3 and 4, then re-render**

```bash
node tools/mapforge/render-sheet.mjs --sheet atlas
node tools/mapforge/render-sheet.mjs --sheet cluster1
node --test 'tools/mapforge/tests/*.test.mjs'
git diff --stat game-client/assets/art/maps/
```
Expected: the two SVGs change; the tests pass. Read the SVG diff — the changed lines must be **only** `<text>` positions, the new legend block, and the `<defs>` pattern list. **Any change to a `<path d="...">` of a coast, river, region boundary or road is a defect**: this task does not touch geometry.

- [ ] **Step 6: Look at both sheets**

```bash
open -a "Google Chrome" game-client/assets/art/maps/atlas-world.svg game-client/assets/art/maps/cluster1-world.svg
```
Acceptance, against the written criteria: **zero overlapping labels on either sheet** (the F-043 defect was three ocean names and two Coldreach labels fully erased); every fill on the canvas has a legend row; the basin sheet's legend is visually unchanged apart from the header word.

- [ ] **Step 7: Re-baseline the lock and the thumbs, in R12's order**

Strictly in this order, each verified before the next:
```bash
# 1. the emitters — the WORLD must not have moved
node scripts/check_spine_emit.mjs --check && echo "1 OK: the world is unchanged"
(cd colyseus-server && npm test -- mapDimensions) && echo "1 OK: the runtime pin is green"

# 2. the sheets (already re-rendered in step 5)
node tools/mapforge/render-sheet.mjs --sheet atlas --check || echo "expected: stale until the lock is written"

# 3. the lock
node scripts/check_render_lock.mjs --write
git diff content/world/render-lock.json

# 4. the thumbs
node tools/mapforge/render-sheet.mjs --sheet atlas --png
node tools/mapforge/render-sheet.mjs --sheet cluster1 --png
node scripts/bake_thumbnails.mjs --only art:map-cluster1
node scripts/bake_thumbnails.mjs --only art:map-atlas
node scripts/check_asset_manifest.mjs
```
The `render-lock.json` diff must show **exactly two changed hash lines** (atlas + cluster1) and no added or removed keys.

- [ ] **Step 8: Add the mapforge tests to CI (X6)**

**X6 — CI runs neither the mapforge tests nor a sheet drift check, so five of six byte comparisons are Gate-2-only (local).** That is the wrong place for them once the map lane is the feature under active development. **Plan A Task 12 already fixed it**, and this task must NOT add the steps a second time: two identically-named workflow steps double the CI time on the mapforge suite and make the log unreadable.

So this is a VERIFICATION step, not an edit:

```bash
grep -n "Mapforge test suite\|Render lock (G-RENDER-LOCK)\|render-sheet.mjs --sheet" .github/workflows/ci.yml
```
Expected: the `Mapforge test suite`, `Render lock (G-RENDER-LOCK)` and `Sheet self-check (render-sheet --check)` steps are all present, added by Plan A Task 12. If any is absent — Plan A landed differently, or a merge dropped it — add it here in the **shell-expanded, UNQUOTED** form, because `ci.yml:34` pins `node-version: 18` and Node-side `--test` glob patterns only exist from v22:

```yaml
      - name: Mapforge test suite
        run: node --test tools/mapforge/tests/*.test.mjs

      - name: Render lock (G-RENDER-LOCK)
        run: node scripts/check_render_lock.mjs --check
```

- [ ] **Step 9: Run every harness**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node --test 'tools/asset-storybook/tests/*.test.mjs'
npm test --prefix scripts
./scripts/precheck.sh --no-install 2>&1 | tail -20
./scripts/integration.sh --no-install 2>&1 | tail -25
```
Expected: both gate summaries all `PASS`.

- [ ] **Step 10: Commit**

```bash
git add tools/mapforge/lib/atlas-sheet.mjs tools/mapforge/lib/basin-sheet.mjs tools/mapforge/tests/atlas-sheet.test.mjs tools/mapforge/tests/basin-sheet.test.mjs content/world/render-lock.json game-client/assets/art/maps game-client/assets/.thumbs
git commit -m "feat: re-ink the live sheets with declutter, glyphs and a legend"
```

- [ ] **Step 11: QUALITY GATE — verify**

```bash
./scripts/integration.sh --no-install 2>&1 | tail -25
git show --stat HEAD
git branch --show-current && git log --oneline -1
```

- [ ] **Step 12: QUALITY GATE — independent adversarial review**

Brief: *"Review `git show HEAD` and open both SVGs in Chrome. This is the only commit in Plan B that changes a committed pixel, so the bar is higher. (a) **Prove the world did not move**: confirm `git show --stat HEAD` lists no file under `content/spine/`, `content/maps/` or `colyseus-server/`, and run `node scripts/check_spine_emit.mjs --check` yourself. (b) Read the full SVG diff. Every changed line must be a `<text>`, a legend element or a `<defs>` pattern. Report **any** changed `<path d>` belonging to a coast, river, region boundary, road or sea lane. (c) Adoptions 1 and 2 were predicted byte-zero — confirm from the commit history that each was verified alone before the next was applied. (d) Count `<text>` elements on the atlas sheet and check it against the `G-LABEL` tier-1 budget of 40. (e) Confirm the `render-lock.json` diff changed exactly two hashes and no keys. (f) Confirm the CI steps use the SHELL-EXPANDED, UNQUOTED form (`node --test tools/mapforge/tests/*.test.mjs`) — `ci.yml` pins `node-version: 18` and Node-side `--test` globbing only exists from v22. (g) The label rank assignment is a design choice with consequences — does anything important now fall below the sheet's `maxLabelRank` and silently disappear? Compare the label list before and after."*

- [ ] **Step 13: QUALITY GATE — refactor** — new `fix:` commit; if the SVG changes, redo Step 7 in full (re-render → lock → thumbs), never partially.
- [ ] **Step 14: QUALITY GATE — re-verify**

```bash
./scripts/integration.sh --no-install 2>&1 | tail -25
node scripts/check_render_lock.mjs --check
git branch --show-current && git log --oneline -1
```

---

## Definition of done for Plan B

Run all of it. Every line must hold.

```bash
# vocabulary half
node -e "const l=require('./content/world/lexicon/landforms.json'); \
  console.log(l.length, l.reduce((n,r)=>n+1+r.alsoGroups.length,0), \
  l.filter(r=>r.alsoGroups.length).length, l.filter(r=>r.dungeonCapable).length)"   # 170 178 8 23
node -e "import('./scripts/lib/spine.mjs').then(m=>console.log(m.BIOMES.length, m.TERRAIN_KINDS.length))"  # 20 18

# render half
node --test 'tools/mapforge/tests/*.test.mjs'
node --test 'tools/asset-storybook/tests/*.test.mjs'
npm test --prefix scripts
node tools/mapforge/render-sheet.mjs --sheet synthetic --check
node scripts/check_render_lock.mjs --check
node scripts/check_spine_emit.mjs --check
(cd colyseus-server && npm test -- mapDimensions)

# both harnesses
./scripts/precheck.sh --no-install
./scripts/integration.sh --no-install
```

| # | Claim | Proof |
| --- | --- | --- |
| 1 | 170 types / 178 memberships / 8 dual-listed / 23 dungeon-capable exist as content | `scripts/tests/landform-lexicon.test.mjs` |
| 2 | Three new schemas exist and the node schema is closed in both directions | `scripts/tests/landform-instance-schema.test.mjs`, `scripts/tests/edges-schema.test.mjs` |
| 3 | `derived` is one sidecar file and `G-DERIVED-DRIFT` is one whole-file comparison | `scripts/tests/spine-gates.test.mjs` new cases |
| 4 | 20 biomes and 18 terrain kinds, with `G-LANDFORM` + `G-SHEET-BUDGET` printing every run | `scripts/tests/world-budget.test.mjs`; the `world-budget:` lines in the gate output |
| 5 | Every biome and every terrain kind inks, and unreachable ink fails in both directions | `tools/mapforge/tests/biome-ink.test.mjs` |
| 6 | 40 distinguishable glyph families cover 170 types; no two groups share a mark | `tools/mapforge/tests/glyphs.test.mjs` + the Task 7 contact sheet |
| 7 | **340 labels place with zero collisions and no hand-tuning** | `tools/mapforge/tests/labels.test.mjs` acceptance test + the Task 8 measurement |
| 8 | A target-density sheet rasterises in **<= 2 s at 2000 px** | `tools/mapforge/tests/synthetic-sheet.test.mjs` budget test |
| 9 | Committed PNGs are `<= 512` px review thumbs; the ship raster is never committed | `tools/asset-storybook/tests/maps-index.test.mjs` thumb-budget test |
| 10 | Every produced artifact is observable in the storybook | three sheet cards + the Map-vocabulary panel, opened in Chrome (Tasks 10, 11) |
| 11 | **The world never moved** | `check_spine_emit --check` clean on every commit; `mapDimensions` jest pin green on every commit |
| 12 | The map lane's determinism gates run on a pull request | the `ci.yml` steps Plan A Task 12 added (X6), verified present in Task 12 Step 8 |

---

## Risks specific to Plan B

| # | Risk | Why it is ranked here | Mitigation, in the plan |
| --- | --- | --- | --- |
| **B1** | **Task 12's SVG diff hides a real defect in legitimate churn** — R12's byte-comparison whiplash, at task scale | The re-ink legitimately changes ~40 `<text>` lines and adds a legend; a moved coastline would read as more of the same | Adoptions 1 and 2 are proved **byte-zero and verified alone** before adoption 3 moves anything; the review brief requires reporting any changed `<path d>`; `check_spine_emit --check` is the independent proof that the *world* is untouched |
| **B2** | **The two definitions of every pattern drift** — vector `PATTERNS` vs raster `TILE_RECIPES` | Nothing forces a recipe to be re-transcribed when a vector path is edited | `texture-bake.test.mjs` asserts identical key sets; the review brief spot-checks three recipes; the honest cost is written into the module header rather than hidden |
| **B3** | **A library-produced compressed stream is not formally guaranteed stable across Node majors** | The PNG bytes land in a committed, byte-compared SVG; CI runs Node 18 and local dev is Node 26, so a framing change would silently re-ink a locked sheet | **Closed by construction, not by argument:** `node:zlib` is banned from `texture-bake.mjs` and the zlib stream is hand-written as RFC 1950 wrapper + RFC 1951 stored blocks + adler32 — integer arithmetic over fully specified bit layouts. Two tests enforce it (a grep for `node:zlib`/`deflateSync`, and a byte-by-byte check of the emitted stream against the RFC layout including the multi-block path). Plan C's `.release.json` Node-major pin closes the general case |
| **B4** | **The label placer is affordable at 300 and not at 340+** | `commit()` rebuilds the bbox index per placement | Measured explicitly in Task 8 Step 5 at 100 / 340 / 600 with a written acceptance bar (0 dropped, < 400 ms at 340) before any sheet consumes it |
| **B5** | **Widening `BIOMES` silently loosens `G-COMP-SUM`** | A vocabulary gate that grows accepts what it used to reject | Task 5's review brief requires diffing every committed `composition` object against the old vocabulary |
| **B6** | **Adding a sheet reddens Gate 1 through a gate nobody was thinking about** (X8) | `maps-index.test.mjs` checks `SHEETS` <-> index in **both** directions and runs in Gate 1 and CI | Task 10 adds the index row in the same commit as the registry entry; Task 10 Step 9 states the one expected failure explicitly so a second one is not mistaken for it |
| **B7** | **`--png` becoming opt-in silently stops producing a PNG something depends on** | Three mechanisms encode the PNG policy and they must agree | Task 11's review brief requires grepping every `render-sheet` invocation across `scripts/`, `.github/`, `tools/` and `*.md` |
| **B8** | **Concurrent-session collision in the `_release` worktree** (R15) | A prior incident landed a subagent fix commit on a detached HEAD, unreachable from any ref | Every quality gate in this plan ends with `git branch --show-current && git log --oneline -1`; never `git commit --amend` |

---

## What Plan B deliberately does not do

- **It does not generate any land.** No premise masks, no cell grid, no hydrology, no sea level. That is Plan C, and the lexicon `requires` predicates are written *against* the grid fields Plan C will carry precisely so the two meet at a stated interface rather than a guess.
- **It does not author any meaning.** No pinned records, no bound records, no relations, no dungeons, no names. That is Plan D. The `type` field on a spine feature is added to the schema here and is `null` on all 58 committed features; Plan D is the first writer.
- **It does not redraw the world.** No spine node is unfrozen, no ring moves, no id is renamed, no zone record is written, no citation is rewritten. That is Plan E.
- **It does not change `content/world/manifest.json`** — that file does not exist yet, and Plan C owns creating it. Plan B's `budgets.json` is a separate file with a separate job (the layers *outside* `content/spine/`, which `G-LOAD-BUDGET` cannot see).
- **It does not touch the game runtime.** `n-playroot` and everything under it, `frozen-spawn-ids.json`, all four live map ids, and every spawn rectangle are untouched, and `mapDimensions.test.ts` staying green is an acceptance criterion on every one of the twelve commits.

---

## Sequencing summary

```
Task 1  lexicon ─┐
Task 2  schemas ─┼─> Task 5  vocabulary + budgets ──▶ ▶ HANDOFF: Plan C may start
Task 3  edges   ─┤
Task 4  derived ─┘

Task 6  ink loop ──┐
Task 7  glyphs   ──┼─> Task 10  synthetic canary ──> Task 11  thumbs + storybook ──> Task 12  re-ink live sheets
Task 8  labels   ──┤                                                                        │
Task 9  bake     ──┘                                                                        └─▶ Plan E consumes
```

- **Tasks 1–3 are independent of one another** and may run in parallel as three subagents. Task 4 must follow Task 2 (it removes a schema property Task 2 tightened around). Task 5 must follow Task 1 (its test reads the lexicon).
- **Tasks 6–9 are independent of one another** and of Task 5 except that Task 6 imports `BIOMES`/`TERRAIN_KINDS` at their new lengths. Run them as four parallel subagents after Task 5.
- **Task 10 needs all of 6–9.** Task 11 needs 10. Task 12 needs 11.
- **Plan A blocks Tasks 8, 10, 11 and 12** (`buildBBoxIndex`, `SHEETS[].title`/`maxLabelRank`, the render lock). Tasks 1–7 and 9 are buildable without it.
- **Plan E needs Task 12** — R10's whole argument is that the fills, glyphs, declutter and zoom tiers are built and proven against today's small chart, where a regression is visible, *before* the redraw.
