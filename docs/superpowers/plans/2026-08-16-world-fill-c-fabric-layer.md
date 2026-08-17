# World Fill — Plan C: The Fabric Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a reproducible 400 × 400 km world — 13 landmasses, 160 regions, 1,740 landform instances, 45 settlements, 60 dungeon anchors — from a committed seed and 13 premise files, commit it as a new `content/world/fabric/` layer whose sea-to-land ratio is 1.5 : 1 **by construction**, and prove promotion into a spine trunk is byte-idempotent — without changing a single committed spine byte, sheet byte, or runtime coordinate.

**What is demonstrably true at the end that was not true at the start:** today `node tools/mapforge/gen-world.mjs` emits hand-templated rectangles into a gitignored staging dir that a human must rename by hand, and the charted world holds 6,243.5 km² of land in a 160,000 km² frame (sea:land 24.68 : 1). At the end, `node tools/mapforge/generate-world.mjs --seed 7c9e4a2f8b1d6e03 --out build/mapforge/<runId>` produces a complete content root — grid-traced coastlines, rivers, biomes, regions, settlements, roads — in under 8 s; `node tools/mapforge/promote-world.mjs --from <runDir> --dry-run` reports exactly what a promotion would change and running it twice is a no-op; `G-SEALAND` reads the committed fabric and reports **1.50 : 1 on 64,000 km² of net land**; and `G-REPRO` proves all three idempotence properties on the CI Node, not just the laptop Node.

**Architecture:** A throwaway 800 × 800 structure-of-arrays cell grid (0.5 km cells, 640,000 cells, ~14.7 MB resident, never committed) is driven through 14 ordered passes by `tools/mapforge/generate-world.mjs`. Nothing on any path that reaches a committed byte uses a transcendental: noise is integer-hash + polynomial smoothstep, directions come from a committed literal unit-vector table, and the land/sea threshold is an **integer rank selection** (k-th largest elevation), never a float bisection. The passes write two committed file families — `content/world/fabric/*.json` (regions, landform instances, settlements, roads, cell census) and `content/world/handles/*.json` (the stable named handles Plan D binds to) — plus a *draft* trunk under the gitignored `build/mapforge/<runId>/` that `promote-world.mjs` reconciles into a real content root as one command.

**Tech Stack:** Dependency-free Node ESM (`.mjs`) under `tools/mapforge/` run directly with `node`; `node --test` (glob form) for map-tool tests; the existing `scripts/check_content.mjs` gate harness (ajv, js-yaml under `scripts/`) for the new spine-side gates; jest under `colyseus-server/` for the runtime emitter pin.

**Spec:** /Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/_release/docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md

---

## Global Constraints

**Frame / ratio**
- `content/spine/nodes/n-atlas.json` stays `frozen: true`, `placement.rect` 400x400, `anchor [200,200]`, `interior.size [400,400]`, `seed.value "7c9e4a2f8b1d6e03"`. Frame = 160,000 km2.
- Ratio is measured on `n-atlas.derived.computedComposition.ocean` ONLY (frame-complete rollup, never a node-area ratio).
- `ratio: { target 1.5, min 1.2, max 1.8, oceanPctTarget 60.0, oceanPctMin 54.5455, oceanPctMax 64.2857 }`.
- `budget: { netLandKm2 64000, waterKm2 96000, grossLandPolygonKm2 65600, interiorWaterKm2 1600, oceanPolygonKm2 91200, interstitialKm2 3200, interstitialComposition {ocean:100} }`. Closure 65,600 + 91,200 + 3,200 = 160,000 exactly, zero residue.
- The 2.00% interstitial sits clear of the 0.5% threshold both ways (`check_content.mjs:2161` requires an interstitial above 0.5%, forbids it at or below).
- `G-ATLAS-ROLLUP` tolerance stays +/-2 pp (`check_content.mjs:1690-1707`). If the generated world cannot roll up within it, the generator is wrong, not the gate.

**Target counts (gated against `content/world/manifest.json`)**
- 13 landmasses, 3 oceans, 9 seas, 160 regions = 40 surveyed + 120 reported, 45 settlements (3 capital / 12 hub / 30 village), 8 town plans, 60 dungeon complexes / 190 floors (3 families x 8 + 36 bespoke), 164 distinct landform types / 172 group memberships / 8 dual-listed, 1,740 instances / 336 named, 20 biomes, 18 terrain kinds, 626 distinct names.
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

### Constraints specific to Plan C (read these before Task 1)

- **Plan C commits ZERO spine node bytes.** The spec's migration invariant (§9.1) is that every commit in Phases 0–5 keeps all six byte comparisons green *without being re-baselined*. The generator's trunk output therefore lands only in the **gitignored draft folder**; Plan E's redraw commit is the one that writes `content/spine/nodes/`. Any Plan C commit that changes a file under `content/spine/nodes/`, `content/maps/`, `game-client/assets/art/maps/cluster1-world.svg` or `atlas-world.svg` is a plan violation.
- **The fabric and the trunk describe different worlds until Plan E, and that is intended.** `G-SEALAND` reads the committed fabric and goes green at 1.50 : 1 the moment Task 13 lands; the committed trunk still says 24.68 : 1. `G-TRUNK-AREA` is the gate that closes that seam and it **activates per node** via `provenance.generator.fabric` — dormant on today's 44 hand-authored nodes, live on all 13 landmasses of the draft root. Task 11 makes `G-SEALAND` print the divergence on every run so nobody mistakes a green gate for a redrawn world.
- **The draft root is a real content root.** `check_content.mjs --content-root <dir>` already exists (`scripts/check_content.mjs:48`) and `gen-world.mjs` already proves the pattern (`tools/mapforge/gen-world.mjs:163-173`). Every "prove it on all 13 landmasses" acceptance criterion in this plan runs the REAL gate against the draft root.
- **`content/spine/candidates/` is a retired concept, not a directory to delete.** It is gitignored at `.gitignore:125` and does not exist on disk. Task 13 removes the ignore rule and its comment; there are no files to remove.

---

## Domain primer — read this before Task 1 if you have never seen this repo

You do not need to know the game. You need eight concepts and six commands.

**The spine.** `content/spine/nodes/<id>.json` is a flat table of 44 JSON files joined on `parentId` — the *trunk* of the world. Each file is a **node**: an id (`n-atlas`, `n-cluster1`, `n-millcross`), a `tier` (`world`, `continent`, `ocean`, `region`, `town`, …), a `placement` (a polygon ring, a rect, or a point, in kilometres), a `composition` (percent shares of biomes: `{ocean: 96.1, rock: 2, ice: 1.9}`), a `seed`, and a `derived` block. Read `content/spine/nodes/n-atlas.json` first — it is the world root, 400 × 400 km, frozen, and every number in this plan is derived from it.

**Tier is a depth, not a label.** `scripts/lib/spine.mjs:28-38` (`TIER_DEPTH`) maps `world/playroot → 0`, `continent/ocean/playspace/fixture → 1`, `region/sea → 2`, `town/site → 3`. A child's depth must be its parent's + 1. Note `sea` is *already* depth 2 — nothing needs changing there, contrary to what a stale reading of the spec's §8.2 suggests.

**The `derived` block** is machine-computed and byte-checked: area, child area, coverage %, the rolled-up composition, the resolved seed streams, and a sha256 digest of all of it. It is written by `scripts/check_spine_emit.mjs --write` and byte-compared by the `G-DERIVED-DRIFT` gate (`scripts/check_content.mjs:1930`). **Never hand-edit a `derived` block.** Regenerate it.

**A gate** is one rule inside `scripts/check_content.mjs`, named `G-SOMETHING`, that reports a one-line failure. Gates **never throw** — errors go into an in-band `failures[]` array (`scripts/check_content.mjs:148`) because an uncaught throw skips `finish()` and silently drops every failure recorded before it (`scripts/check_content.mjs:2120-2124` explains this at length). Gates also **soft-skip**: `checkSpine()` returns 0 *before compiling any schema* when `content/spine` is absent (`scripts/check_content.mjs:1541`), because ~45 minimal test fixtures have no spine directory. **A new gate that hard-fails on a missing `content/world/` will red dozens of existing tests.** Every gate you add in Task 11 must soft-skip a missing `content/world/`.

**Gate 1 and Gate 2.** Gate 1 is `scripts/precheck.sh` — the per-feature ship check; its content lane is `node scripts/check_content.mjs --only=spine`. Gate 2 is `scripts/integration.sh` — the whole-release check; its content lane is `--require-complete` plus the emit/render drift checks plus `node --test` over `tools/mapforge/tests/` plus `npm test --prefix scripts`. **`--only=spine` is NOT a reduced gate set** — it calls the same `checkSpine()` (`scripts/check_content.mjs:184-191`) and only skips the story/character/zone/town sweeps, so every gate you add in Task 11 lands in Gate 1 automatically and must fit its ~4 s budget.

**The sheets** are the two committed SVG maps under `game-client/assets/art/maps/` (`cluster1-world.svg`, `atlas-world.svg`), built by `tools/mapforge/render-sheet.mjs`'s `SHEETS` registry. Adding a sheet to `SHEETS` is not cosmetic: `tools/asset-storybook/tests/maps-index.test.mjs` asserts, **in both directions**, that every `SHEETS` id has a row in `tools/asset-storybook/maps-index.json` with byte-matching `svg`/`png` paths that exist on disk — and that test runs in Gate 1 *and* CI. That is the owner's "every artifact observable" rule made mechanical.

**The fabric (what you are building).** A new family, `content/world/fabric/*.json`, holding what the generator produced: the cell census, the 160 region rings, the 1,740 landform instances, settlements, roads. It is **not** part of the spine, is not in the node budget, and its geometry is checked by the new gates in Task 11 rather than by `G-OVERLAP`/`G-CONTAIN` (which only walk `tree.byId`).

**A handle** is the stable name the generator emits for one landform instance so an authored record in Plan D can bind to it without holding a coordinate. Grammar: `<cNN>/<lexicon group>/h-<4 lowercase hex>`, where the hex is the first 4 chars of the instance's content hash. The ledger that lists them (`content/world/handles/*.json`) carries a committed `orderDigest` so a silent re-ordering is a gate failure.

**Exact commands (copy these; do not invent variants).**

```bash
# from the repo root of your claimed worktree
node scripts/check_content.mjs --only=spine                    # Gate 1 content lane (~3.6 s today)
node scripts/check_content.mjs --require-complete              # Gate 2 content lane
node scripts/check_content.mjs --only=spine --content-root DIR # run the real gate on a fixture/draft root
node scripts/check_spine_emit.mjs --check                      # 47-file byte comparison
node scripts/check_spine_emit.mjs --write                      # the ONE derive-writer
node --test 'tools/mapforge/tests/*.test.mjs'                  # GLOB FORM, QUOTED — a bare dir arg fails
npm test --prefix scripts                                      # the gate's own suite (node --test tests/*.test.mjs)
(cd colyseus-server && npm test -- mapDimensions)              # the runtime emitter pin — EVERY commit
./scripts/precheck.sh --no-install                             # Gate 1
./scripts/integration.sh --no-install                          # Gate 2
```

`tools/mapforge/` has **no `package.json` and no dependencies**. Do not add one. If you genuinely need a dependency it belongs under `scripts/` (which has its own `package.json` + lockfile and is *not* part of the pnpm workspace — install with `npm ci --prefix scripts`). `tools/mapforge` importing `scripts/lib/spine.mjs` by relative path is established and fine.

**Two house rules that are not obvious and are load-bearing.**
1. **`abs()` appears nowhere in the geometry.** A negative signed shoelace is a `G-POLY` *winding failure*, not a magnitude (`scripts/lib/spine.mjs:11-14`, `:73-81`). Keep that discipline in every new geometry file.
2. **Never `git commit --amend`.** A prior incident in this worktree landed a subagent's fix commit on a detached HEAD, unreachable from any ref. Every task report ends with `git branch --show-current` and `git log --oneline -1`.

---

## File Structure

Everything Plan C creates (`C`), modifies (`M`) or deletes (`D`). Paths are repo-relative.

| Op | Path | Responsibility |
|---|---|---|
| C | `content/world/manifest.json` | The single numeric authority: frame, ratio band, budget closure, region/landform/settlement/dungeon quotas, level-band rings |
| C | `content/schemas/world-manifest.schema.json` | Manifest shape, `additionalProperties: false` |
| C | `content/schemas/fabric-file.schema.json` | Per-continent fabric file shape, `additionalProperties: false` |
| C | `content/schemas/handle-ledger.schema.json` | Handle ledger shape, `additionalProperties: false` |
| C | `content/schemas/premise.schema.json` | Premise mask shape, `additionalProperties: false` |
| C | `content/world/premises/continent-01..13.json` | 13 hard geometric premise masks: count, centre, area band, coast class, palette, landform kit, structural idea |
| C | `tools/mapforge/lib/seed.mjs` | `mintSeed({parentStream, name})`, lifted out of `world-gen.mjs` |
| C | `tools/mapforge/lib/noise.mjs` | Integer-hash value noise, fbm, polynomial smoothstep, committed unit-vector table, `q()` |
| C | `tools/mapforge/lib/grid.mjs` | Structure-of-arrays cell grid + the `FLAG` bitfield |
| C | `tools/mapforge/lib/passes/mask.mjs` | P1 — hard premise masks and plate assignment |
| C | `tools/mapforge/lib/passes/elevation.mjs` | P2 — fbm + ridged orogen + arc cones, clamped to the premise |
| C | `tools/mapforge/lib/passes/sea-level.mjs` | P3 — `selectSeaLevelByRank`, the integer rank selection |
| C | `tools/mapforge/lib/arcs.mjs` | P4/P14 — planar arc topology, one-shot Douglas-Peucker, ring assembly, fractalise |
| C | `tools/mapforge/lib/passes/winds.mjs` | P5 — prevailing winds + orographic rain shadow |
| C | `tools/mapforge/lib/hydrology.mjs` | P6 — priority-flood, D8, flow accumulation |
| C | `tools/mapforge/lib/passes/water.mjs` | P7 — lakes, deltas, glaciers |
| C | `tools/mapforge/lib/passes/biome.mjs` | P8 — table-lookup biome classification, clamped to the premise palette |
| C | `tools/mapforge/lib/passes/partition.mjs` | P9 — Poisson-disc siting + budgeted multi-source Dijkstra + Lloyd smoothing |
| C | `tools/mapforge/lib/passes/landforms.mjs` | P10 — count-targeted instancing against the lexicon `requires` predicates; handle minting |
| C | `tools/mapforge/lib/passes/settlements.mjs` | P11 — hard vetoes, weighted score, greedy tiered minimum separation |
| C | `tools/mapforge/lib/passes/roads.mjs` | P12 — A* road network on a cost raster; sea lanes between capitals |
| C | `tools/mapforge/lib/passes/dungeons.mjs` | P13 — dungeon anchor selection, region-hop reachability |
| C | `tools/mapforge/lib/fabric.mjs` | P14 — arcs to polygons; writes the fabric, handle ledgers and the draft trunk |
| C | `tools/mapforge/generate-world.mjs` | The generator CLI: builds a complete content root from scratch into `build/mapforge/<runId>/` |
| C | `tools/mapforge/promote-world.mjs` | Idempotent six-step promotion; set reconciliation, never append |
| C | `tools/mapforge/lib/overlay-sheet.mjs` | Ghosted baseline coastline under the generated coastline + per-continent area-delta table |
| C | `tools/mapforge/lib/fabric-sheet.mjs` | The generated world drawn from committed fabric alone (deliberately minimal ink) |
| C | `content/world/fabric/world.json` | Frame-level census: sea level, rank, land/sea cells, per-continent roll-up, sea lanes |
| C | `content/world/fabric/continent-01..13.json` | 13 fabric files: regions, instances, settlements, roads, dungeon anchors, cell census |
| C | `content/world/handles/continent-01..13.json` | 13 handle ledgers with a committed `orderDigest` |
| C | `tools/mapforge/tests/grid.test.mjs` | Grid allocation, flags, index arithmetic |
| C | `tools/mapforge/tests/noise-determinism.test.mjs` | No transcendentals reachable; byte-stable across two builds; `q()` |
| C | `tools/mapforge/tests/rank-select.test.mjs` | Exact k-th largest; 1-ULP immunity; the premise-footprint failure message |
| C | `tools/mapforge/tests/arcs.test.mjs` | Shared arcs are bit-identical in both neighbours; simplify-once; winding |
| C | `tools/mapforge/tests/hydrology.test.mjs` | No sinks after priority-flood; D8 determinism; accumulation monotonicity |
| C | `tools/mapforge/tests/partition.test.mjs` | Owner histogram identity; quota adherence; insertion-order independence |
| C | `tools/mapforge/tests/landforms.test.mjs` | `requires` predicates honoured; count targets; handle grammar; total ordering |
| C | `tools/mapforge/tests/settlements.test.mjs` | Vetoes; tier quotas; minimum separations; level-band rings |
| C | `tools/mapforge/tests/generate-world.test.mjs` | The whole CLI: draft root shape, real gate green on it, stage timings |
| C | `tools/mapforge/tests/promote.test.mjs` | Six-step promotion; reconciliation deletes; runtime edges preserved; twice is a no-op |
| C | `tools/mapforge/tests/repro.test.mjs` | `G-REPRO`'s three properties |
| C | `tools/mapforge/tests/fixtures/mini-lexicon/landforms.json` | 12-row lexicon so Task 8 is testable without Plan B |
| C | `scripts/tests/world-gates.test.mjs` | `G-SEALAND`, `G-TRUNK-AREA`, `G-POI`, `G-ORDER`, `G-WORLD-BUDGET`, `G-PROVENANCE` fixtures |
| C | `scripts/tests/fixtures/world/g-sealand-ratio/` … | Overlay fixture roots for each new gate (one dir per red case) |
| M | `content/world/budgets.json` | Gains the `fabric` and `civil` sections and the pinned `cellKm: 0.5` (Plan B created the file with `landforms` + `sheets`) |
| M | `scripts/check_content.mjs` | New `checkWorld()` gate family called from `checkSpine()`; `G-PROVENANCE` gains the `generator.fabric` pin |
| M | `scripts/lib/world.mjs` *(new, but listed here because `check_content.mjs` must import it)* | Pure loader + gate logic for `content/world/` — the same lib/ discipline `spine.mjs` follows |
| M | `tools/mapforge/render-sheet.mjs` | Registers the `overlay` and `fabric` sheets |
| M | `tools/asset-storybook/maps-index.json` | Two new rows: `overlay`, `fabric` |
| M | `tools/asset-storybook/js/maps.mjs` | A fabric census panel under the Maps tab |
| M | `game-client/assets/art/art-manifest.json` | `art:map-overlay`, `art:map-fabric` entries + license rows |
| M | `.release.json` | `"nodeMajor": 18` |
| M | `.github/workflows/ci.yml` | Reads the Node major from `.release.json` instead of hard-coding 18 |
| M | `scripts/integration.sh` | Section label names G-REPRO; adds the world-gate report to the Gate 2 log |
| M | `.gitignore` | Explicit `build/mapforge/`; removes the retired `content/spine/candidates/` rule |
| D | `tools/mapforge/gen-world.mjs` | Replaced by `generate-world.mjs`; all three hardcodes dissolve |
| D | `tools/mapforge/lib/world-gen.mjs` | Replaced by the pass pipeline |
| D | `tools/mapforge/tests/gen-world.test.mjs` | Follows its subject |
| D | `tools/mapforge/tests/world-gen.test.mjs` | Follows its subject |

**Task → file map** (so a reviewer can scope one task's diff):

| Task | Primary paths |
|---|---|
| 1 | `content/world/manifest.json`, `content/schemas/world-manifest.schema.json`, `content/world/budgets.json`, `scripts/lib/world.mjs`, `scripts/check_content.mjs` |
| 2 | `tools/mapforge/lib/{seed,noise,grid}.mjs` + their tests |
| 3 | `content/world/premises/*.json`, `content/schemas/premise.schema.json`, `tools/mapforge/lib/passes/{mask,elevation}.mjs` |
| 4 | `tools/mapforge/lib/passes/sea-level.mjs` + `tests/rank-select.test.mjs` |
| 5 | `tools/mapforge/lib/arcs.mjs` + `tests/arcs.test.mjs` |
| 6 | `tools/mapforge/lib/hydrology.mjs`, `lib/passes/{winds,water}.mjs` |
| 7 | `tools/mapforge/lib/passes/{biome,partition}.mjs` |
| 8 | `tools/mapforge/lib/passes/landforms.mjs`, `tests/fixtures/mini-lexicon/` |
| 9 | `tools/mapforge/lib/passes/{settlements,roads,dungeons}.mjs` |
| 10 | `tools/mapforge/lib/fabric.mjs`, `tools/mapforge/generate-world.mjs` |
| 11 | `scripts/lib/world.mjs`, `scripts/check_content.mjs`, `scripts/tests/world-gates.test.mjs`, `content/schemas/{fabric-file,handle-ledger}.schema.json` |
| 12 | `tools/mapforge/promote-world.mjs`, `tests/{promote,repro}.test.mjs`, `.release.json`, `.github/workflows/ci.yml`, `scripts/integration.sh` |
| 13 | `content/world/fabric/*`, `content/world/handles/*`, `tools/mapforge/lib/{overlay-sheet,fabric-sheet}.mjs`, `render-sheet.mjs`, storybook, art manifest, deletions |

---

## Global interfaces this plan consumes and produces

**Consumed from Plan A** (must be merged into your branch before Task 11):
```js
// scripts/lib/geometry.mjs
export function exactIntersectionArea({ a, b }): number
export function buildBBoxIndex({ items }): { query({ bbox }): string[] }
export function bboxOfPlacement({ placement }): BBox
export function ringVertexCount({ placement }): number
// scripts/lib/render-lock.mjs
export function computeLock({ repoRoot, sheets, extraPaths = [] }):
  { version: 2, generator: { name: "mapforge", version: string }, artifacts: Record<string,string> }
export function checkLock({ committed, computed }): { drift: string[], missing: string[], extra: string[] }
// scripts/lib/places.mjs
export function loadPlaces({ contentRoot }): { doc: object|null, problems: string[] }
```

**Consumed from Plan B** (must be merged before Task 8):
```js
// content/world/lexicon/landforms.json — flat array of:
// { id, group, geometry: "point"|"line"|"area", biomes[], sizeKm:[lo,hi],
//   dungeonCapable, glyph, rarity, requires: {…predicate over fabric cell fields…},
//   gloss, absentBecause }
// content/schemas/landform-instance.schema.json  — the record shape Task 8 writes
// content/world/budgets.json                     — created by Plan B with landforms+sheets; Task 1 ADDS fabric+civil
// tools/mapforge/lib/version.mjs
export const GENERATOR_VERSION: string   // read by runId and the render lock
// scripts/lib/spine.mjs
export const BIOMES        // 20 entries after Plan B
export const TERRAIN_KINDS // 18 entries after Plan B
```

**Produced for Plan D and Plan E** (exact signatures; do not change them without updating both plans):
```js
// tools/mapforge/lib/seed.mjs
export function mintSeed({ parentStream, name }): string        // sha256(parent+":"+name).slice(0,16)

// tools/mapforge/lib/noise.mjs
export function hashNoise2D({ x, y, stream }): number           // [-1,1]
export function fbm({ x, y, stream, octaves, lacunarity, gain }): number
export function smoothstep(t): number                           // t*t*(3-2*t)
export const UNIT_VECTORS: ReadonlyArray<[number,number]>
export function q(v): number                                    // Math.round(v*100)/100

// tools/mapforge/lib/grid.mjs
export function makeGrid({ w = 800, h = 800, cellKm = 0.5 }): Grid
// Grid = { w, h, cellKm, n,
//   elev, moist, temp, flowAcc: Float32Array,  flowDir: Int8Array,
//   owner: Int16Array, plate: Int8Array, biome: Uint8Array, flags: Uint16Array,
//   // the four PINNED-CONSTRAINT fields G-PIN-SAT measures against (Plan D):
//   landform: Int16Array,        // dominant lexicon type index, -1 = none   (filled by P10)
//   landformNames: string[],     // index -> lexicon id, set by P10
//   fetchKm:  Float32Array,      // open-water fetch of the adjacent sea, -1 (filled by P4)
//   depthM:   Float32Array,      // water depth in metres, -1 = land          (filled by P4)
//   freshKm:  Float32Array,      // km to nearest fresh water, -1 = unset     (filled by P6)
//   biomeNames: string[], regionIds: string[],
//   biomeName(i), regionId(i), elevM(i) }
export const FLAG: Readonly<{SEA:1,LAKE:2,RIVER:4,DELTA:8,GLACIER:16,ARC:32,CARBONATE:64,SAND:128,CLIFF:256}>

// tools/mapforge/lib/passes/sea-level.mjs
export function selectSeaLevelByRank({ elev, targetLandCells }):
  { seaLevel: number, rank: number, landCells: number, landKm2: number, seaToLandRatio: number }

// tools/mapforge/lib/arcs.mjs
export function extractArcs({ owner, w, h, cellKm }): { arcs: Arc[], nodes: Pt[] }
export function simplifyArc({ points, epsilonKm }): Pt[]
export function assembleRings({ arcs, ownerId }): Pt[][]
export function fractalise({ arc, amplitudeKm, levels, stream }): Pt[]

// tools/mapforge/lib/hydrology.mjs
export function priorityFlood({ elev, w, h }): Float32Array
export function d8FlowDir({ elev, w, h }): Int8Array
export function flowAccumulate({ flowDir, w, h }): Float32Array

// tools/mapforge/generate-world.mjs
export function runPasses({ manifest, premises, pinned = [], relations = [] }): WorldRun
// WorldRun = { grid, fabric: FabricFile[], handles: HandleLedger[], trunk: SpineNode[],
//              edges: Edge[], runManifest: RunManifest, timings: Record<string, number> }

// tools/mapforge/promote-world.mjs
export function promoteWorld({ repoRoot, runDir, dryRun = false }):
  { written: string[], deleted: string[], errors: string[] }

// scripts/lib/world.mjs  (NEW — Plan D extends it with the civil half)
export function loadFabric({ contentRoot }):
  { present: boolean, manifest: object|null, budgets: object|null,
    fabric: FabricFile[], world: object|null, handles: HandleLedger[], errors: string[] }
export function gWorldSeaLand({ world, manifest, report, note }): void
export function gWorldTrunkArea({ nodes, fabric, report }): void
export function gWorldPoi({ fabric, report }): void
export function gWorldOrder({ handles, report }): void
export function gWorldBudget({ contentRoot, budgets, manifest, fabric, handles, report, note }): void
```

**Fabric and ledger shapes Plan C owns** (the shared contract defines `regions[]` and `instances[]`; the four keys marked *(C)* are Plan C additions declared here):

```jsonc
// content/world/fabric/continent-NN.json
{ "continent": "c03",
  "premise": "content/world/premises/continent-03.json",
  "generator": { "name": "mapforge", "version": "3.0.0", "seed": "9f21…", "epoch": 0 },
  "seaLevel": 0.42, "cellKm": 0.5,
  "cellCensus": { "land": 44120, "lake": 620, "unowned": 0 },
  "ownerHistogram": { "c03/r07": 3120 },
  "regions": [ { "id": "c03/r07", "survey": "surveyed", "areaKm2": 158.75,
                 "terrainKind": "karst-plateau", "biomeShares": { "karst": 62, "forest": 38 },
                 "ring": [[0,0]], "levelBand": [24,40], "adjacent": ["c03/r06"] } ],
  "instances": [ /* landform-instance.schema.json records */ ],
  "settlements": [ { "id": "c03/s01", "rank": "capital", "at": [31.4,44.8], "cell": [62,89],
                     "region": "c03/r07", "score": 0.81 } ],                       // (C)
  "roads": [ { "id": "c03/rd01", "from": "c03/s01", "to": "c03/s04",
               "km": 23.5, "points": [[31.4,44.8]] } ],                            // (C)
  "dungeonAnchors": [ { "handle": "c03/karst/h-0f42", "region": "c03/r07",
                        "hopsToSettlement": 1 } ] }                                // (C)

// content/world/fabric/world.json                                                  // (C)
{ "seed": "7c9e4a2f8b1d6e03", "epoch": 0,
  "generator": { "name": "mapforge", "version": "3.0.0" },
  "cellKm": 0.5, "grid": { "w": 800, "h": 800, "cells": 640000 },
  "seaLevel": 0.42, "rank": 262400,
  "census": { "grossLandCells": 262400, "lakeCells": 6400, "seaCells": 377600, "unownedLandCells": 0 },
  "areaKm2": { "netLand": 64000, "water": 96000, "total": 160000 },
  "seaToLandRatio": 1.5,
  "continents": [ { "id": "c01", "landCells": 24000, "grossLandKm2": 6000,
                    "fabric": "content/world/fabric/continent-01.json" } ],
  "seaLanes": [ { "id": "lane-01", "from": "c02/s01", "to": "c03/s01",
                  "km": 88.0, "points": [[10,10]] } ] }

// content/world/handles/continent-NN.json
{ "continent": "c03", "orderDigest": "sha256:…",
  "handles": [ { "handle": "c03/karst/h-0f42", "type": "karst-cenote", "sizeKm": 0.31,
                 "region": "c03/r07", "contentHash": "sha256:…", "rank": 0 } ] }
```

**`drawn` is derived, never stored.** `G-POI` computes `drawn(instance) = region.survey === "surveyed" || instance.named`. That is §6.4 rule 2 ("no interior detail inside a reported region … at most one named landform") expressed as one line, and it is why a reported region's POI count is exactly 0 while it still carries 8 texture instances.

---

### Task 1: The world manifest, the fabric budget, and `G-WORLD-BUDGET`

The manifest is the single numeric authority every later task reads. It must land first and it must be *checkable* on the day it lands, or the numbers drift into thirteen different files.

**Files:**
- Create: `content/world/manifest.json`
- Create: `content/schemas/world-manifest.schema.json`
- Create: `scripts/lib/world.mjs`
- Create: `scripts/tests/world-gates.test.mjs`
- Create: `scripts/tests/fixtures/world/base/` (a minimal world root: manifest + budgets, no fabric)
- Modify: `content/world/budgets.json` (Plan B created it with `landforms` + `sheets`; add `fabric` + `civil` + `cellKm`)
- Modify: `scripts/check_content.mjs:1536-1560` (import + call `checkWorld`), `:1682` (after `gSpineBudgets`)
- Test: `scripts/tests/world-gates.test.mjs`

**Interfaces:**
- Consumes: `content/world/budgets.json` (Plan B), `compileSchema(path, label, fail)` from `scripts/lib/story.mjs` (already imported at `scripts/check_content.mjs:10`)
- Produces: `loadFabric({ contentRoot })`, `gWorldBudget({ contentRoot, budgets, manifest, report, note })`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/world-gates.test.mjs`:

```js
// scripts/tests/world-gates.test.mjs — Plan C world-layer gates.
// Fixture roots follow spine-gates.test.mjs's discipline exactly: a `base`
// dir plus one overlay dir per red case, copied into a temp root.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");
const FIX = join(ROOT, "scripts/tests/fixtures/world");

export function worldFixture({ overlayDir = null, mutate = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "world-fix-"));
  cpSync(join(FIX, "base"), dir, { recursive: true });
  cpSync(join(ROOT, "content/schemas/world-manifest.schema.json"),
         join(dir, "schemas/world-manifest.schema.json"), { recursive: true });
  if (overlayDir) cpSync(join(FIX, overlayDir), dir, { recursive: true });
  if (mutate) mutate(dir);
  return dir;
}

export function runWorldGate(dir) {
  try {
    const out = execFileSync(process.execPath, [GATE, "--only=spine", "--content-root", dir], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}

test("a content root with no world/ soft-skips: no world gate output, exit 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "world-empty-"));
  mkdirSync(join(dir, "schemas"), { recursive: true });
  const r = runWorldGate(dir);
  assert.equal(r.code, 0, r.out);
  assert.ok(!/world-budget:/.test(r.out), `world gates must not run on a root with no world/: ${r.out}`);
});

test("G-WORLD-BUDGET prints its measurements on every run", () => {
  const r = runWorldGate(worldFixture());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /world-budget: fabric 0 files, 0 bytes \(budget 20, 4194304\)/);
  assert.match(r.out, /world-budget: civil 0 files, 0 bytes \(budget 600, 8192\)/);
});

test("G-WORLD-BUDGET fails when a fabric file exceeds its per-file byte cap", () => {
  const dir = worldFixture({ mutate: (d) => {
    mkdirSync(join(d, "world/fabric"), { recursive: true });
    writeFileSync(join(d, "world/fabric/continent-01.json"),
      JSON.stringify({ continent: "c01", pad: "x".repeat(300000) }));
  } });
  const r = runWorldGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-WORLD-BUDGET: world\/fabric\/continent-01\.json is \d+ bytes > per-file budget 262144/);
});

test("the committed manifest validates against its schema", () => {
  const doc = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
  assert.equal(doc.frame.areaKm2, 160000);
  assert.equal(doc.budget.netLandKm2 + doc.budget.waterKm2, 160000);
  assert.equal(doc.budget.grossLandPolygonKm2 + doc.budget.oceanPolygonKm2 + doc.budget.interstitialKm2, 160000);
  assert.equal(doc.budget.grossLandPolygonKm2 - doc.budget.interiorWaterKm2, doc.budget.netLandKm2);
  assert.equal(doc.regions.surveyed.count * doc.regions.surveyed.nominalKm2
             + doc.regions.reported.count * doc.regions.reported.nominalKm2, doc.budget.netLandKm2);
  const q = doc.quotas.settlements;
  assert.equal(q.capital + q.hub + q.village, q.total);
});

test("the landmass columns close: net 64000, interior water 1600, 40 surveyed, 120 reported", () => {
  const doc = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
  const sum = (k) => doc.landmasses.reduce((a, l) => a + l[k], 0);
  assert.equal(doc.landmasses.length, 13);
  assert.equal(sum("netKm2"), 64000);
  assert.equal(sum("interiorWaterKm2"), 1600);
  assert.equal(sum("surveyed"), 40);
  assert.equal(sum("reported"), 120);
  // E-C5: Wealdmarch keeps TEN surveyed regions because content/zones/ already
  // holds ten committed records and 116 bestiary rows are sworn to them. The
  // two seats come from Coldreach, which has no committed zone prose. Anyone
  // "correcting" this back to 8/8 destroys two hand-written records.
  assert.equal(doc.landmasses.find((l) => l.id === "c02").surveyed, 10);
  assert.equal(doc.landmasses.find((l) => l.id === "c03").surveyed, 6);
  for (const id of ["c02", "c03"])
    assert.ok(doc.landmasses.find((l) => l.id === id).why.length > 0, `${id} needs a written why`);
});

test("the water columns close: 3 oceans summing to the polygon budget, 9 nested seas", () => {
  const doc = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
  assert.equal(doc.oceans.length, 3);
  assert.equal(doc.seas.length, 9);
  assert.equal(doc.oceans.reduce((a, o) => a + o.polygonKm2, 0), doc.budget.oceanPolygonKm2);
  assert.equal(doc.oceans.reduce((a, o) => a + o.attributedWaterKm2, 0), 96000);
  const oceanIds = new Set(doc.oceans.map((o) => o.id));
  for (const s of doc.seas) assert.ok(oceanIds.has(s.ocean), `sea ${s.id} names no real ocean`);
  for (const o of doc.oceans) {
    const nested = doc.seas.filter((s) => s.ocean === o.id);
    assert.equal(nested.length, 3, `${o.title} must hold exactly 3 seas`);
    const nestedKm2 = nested.reduce((a, s) => a + s.polygonKm2, 0);
    // Sea polygons are SUBSETS of their ocean polygon (G-CONTAIN). Their area
    // is already inside the ocean's and is never added to the frame again.
    assert.ok(nestedKm2 < o.polygonKm2, `${o.title}: nested seas ${nestedKm2} >= ocean ${o.polygonKm2}`);
  }
  assert.equal(doc.seas.reduce((a, s) => a + s.polygonKm2, 0), 20600);
  // n-westsea is DEMOTED from ocean to sea — the first real use of the
  // declared-but-empty `sea` tier (spec §6.3).
  const west = doc.seas.find((s) => s.nodeId === "n-westsea");
  assert.ok(west, "n-westsea must appear as a SEA, not an ocean");
  assert.equal(west.ocean, "o01");
  assert.ok(!doc.oceans.some((o) => o.nodeId === "n-westsea"));
});

test("the committed budgets file pins cellKm at 0.5 and the six loop stages", () => {
  const b = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  assert.equal(b.cellKm, 0.5);
  assert.equal(b.fabric.maxFiles, 20);
  assert.equal(b.fabric.maxBytesPerFile, 262144);
  assert.equal(b.fabric.maxBytesTotal, 4194304);
  assert.equal(b.civil.maxFiles, 600);
  assert.equal(b.civil.maxBytesPerFile, 8192);
  // G4's measure is explicitly "per-stage time budgets, each with a fail
  // threshold — NOT one aggregate number", because without them the loop time
  // is unfalsifiable and drifts to minutes. Six rows, spec §7.6.
  assert.deepEqual(b.loop, [
    { stage: "generate",     budgetMs: 4000,  failMs: 8000 },
    { stage: "join",         budgetMs: 2000,  failMs: 4000 },
    { stage: "gates",        budgetMs: 15000, failMs: 20000 },
    { stage: "sheets",       budgetMs: 5000,  failMs: 8000 },
    { stage: "rasterise",    budgetMs: 30000, failMs: 60000 },
    { stage: "commit-lock",  budgetMs: 10000, failMs: 15000 },
  ]);
  for (const row of b.loop) assert.ok(row.failMs > row.budgetMs, `${row.stage}: fail must exceed budget`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "world" 'scripts/tests/*.test.mjs'`
Expected: FAIL — `Cannot find module .../content/world/manifest.json` on the manifest test, and `world-budget:` never appears in the gate output because `checkWorld` does not exist.

- [ ] **Step 3: Write `content/world/manifest.json`**

```json
{
  "version": 1,
  "seed": "7c9e4a2f8b1d6e03",
  "frame": { "units": "km", "w": 400, "h": 400, "areaKm2": 160000 },
  "ratio": {
    "measure": "atlas.derived.computedComposition.ocean",
    "target": 1.5, "min": 1.2, "max": 1.8,
    "oceanPctTarget": 60.0, "oceanPctMin": 54.5455, "oceanPctMax": 64.2857
  },
  "budget": {
    "netLandKm2": 64000, "waterKm2": 96000, "grossLandPolygonKm2": 65600,
    "interiorWaterKm2": 1600, "oceanPolygonKm2": 91200,
    "interstitialKm2": 3200, "interstitialComposition": { "ocean": 100 }
  },
  "grid": { "w": 800, "h": 800, "cellKm": 0.5, "cells": 640000, "landCellBand": [228572, 290908] },
  "regions": {
    "surveyed": { "count": 40, "nominalKm2": 160, "tolerancePct": 25, "acrossKm": 12.65, "walkHours": 1.15 },
    "reported": { "count": 120, "nominalKm2": 480, "tolerancePct": 20 }
  },
  "landformCatalogue": {
    "distinctTypes": 164, "groupMemberships": 172, "dualListed": 8,
    "instances": { "total": 1740 }, "named": { "total": 336 }
  },
  "names": { "targetDistinct": 626, "reservedFile": "content/world/names/reserved.json" },
  "relations": {
    "coverageFloorPct": 10,
    "why": "Plan D's relation layer models the prose's n-ary claims. The design counts 435 claim TOKENS across the 8 authored story files, not distinct machine-checkable claims — a paragraph naming a road four times is four tokens and one relation. scripts/report_relation_coverage.mjs prints modelled/found per class on every Gate 2 and CI run and says LOW below this floor. Raise it as the set grows; never lower it to make a run green."
  },
  "quotas": {
    "settlements": { "capital": 3, "hub": 12, "village": 30, "total": 45 },
    "townPlans": 8,
    "dungeons": { "complexes": 60, "floors": 190, "families": 3, "familySize": 8, "bespoke": 36 }
  },
  "levelBands": {
    "originPinnedId": "c-town-gildmark",
    "originFallbackContinent": "c02",
    "ringKm": 40,
    "bands": [[1,10],[8,20],[16,30],[24,40],[32,50],[40,58],[46,64],[52,70],[58,80]]
  },
  "landmasses": [
    { "id": "c01", "title": "Rimewall Cap",  "class": "cap",   "netKm2": 6000,  "interiorWaterKm2": 0,    "surveyed": 0, "reported": 12 },
    { "id": "c02", "title": "Wealdmarch",    "class": "major", "netKm2": 11000, "interiorWaterKm2": 1100, "surveyed": 10, "reported": 20,
      "why": "10, not the spec table's 8: content/zones/ already holds 10 committed zone records for the basin and 116 bestiary placement rows are sworn to those 10 region slugs. Eight surveyed regions here would destroy two hand-written zone records and re-home ~23 bestiary rows for no gain. The two seats come from Coldreach, which has no committed zone prose at all. Column still sums to 40." },
    { "id": "c03", "title": "Coldreach",     "class": "major", "netKm2": 11000, "interiorWaterKm2": 0,    "surveyed": 6, "reported": 20,
      "why": "6, not 8 — the two seats moved to Wealdmarch so the 10 committed basin zone records survive the redraw. See c02's why." },
    { "id": "c04", "title": "Stonemoor",     "class": "major", "netKm2": 11000, "interiorWaterKm2": 300,  "surveyed": 7, "reported": 21 },
    { "id": "c05", "title": "Thirstwold",    "class": "major", "netKm2": 11000, "interiorWaterKm2": 0,    "surveyed": 7, "reported": 21 },
    { "id": "c06", "title": "Reedstrand",    "class": "minor", "netKm2": 3000,  "interiorWaterKm2": 200,  "surveyed": 3, "reported": 5 },
    { "id": "c07", "title": "Driftholt",     "class": "minor", "netKm2": 3000,  "interiorWaterKm2": 0,    "surveyed": 3, "reported": 5 },
    { "id": "c08", "title": "Wracklow",      "class": "minor", "netKm2": 3000,  "interiorWaterKm2": 0,    "surveyed": 2, "reported": 6 },
    { "id": "c09", "title": "Brightfall",    "class": "chain", "netKm2": 1000,  "interiorWaterKm2": 0,    "surveyed": 1, "reported": 2 },
    { "id": "c10", "title": "Ashen Spar",    "class": "chain", "netKm2": 1000,  "interiorWaterKm2": 0,    "surveyed": 1, "reported": 2 },
    { "id": "c11", "title": "Quillreef",     "class": "chain", "netKm2": 1000,  "interiorWaterKm2": 0,    "surveyed": 0, "reported": 2 },
    { "id": "c12", "title": "Skerryfast",    "class": "chain", "netKm2": 1000,  "interiorWaterKm2": 0,    "surveyed": 0, "reported": 2 },
    { "id": "c13", "title": "Loamspit",      "class": "chain", "netKm2": 1000,  "interiorWaterKm2": 0,    "surveyed": 0, "reported": 2 }
  ],
  "oceans": [
    { "id": "o01", "title": "Galereach", "nodeId": "n-galereach", "polygonKm2": 41800, "attributedWaterKm2": 44000 },
    { "id": "o02", "title": "Keelbreak", "nodeId": "n-keelbreak", "polygonKm2": 30400, "attributedWaterKm2": 32000 },
    { "id": "o03", "title": "Tarnmark",  "nodeId": "n-tarnmark",  "polygonKm2": 19000, "attributedWaterKm2": 20000 }
  ],
  "seas": [
    { "id": "s01", "title": "West Sea",         "nodeId": "n-westsea",          "ocean": "o01", "polygonKm2": 3000 },
    { "id": "s02", "title": "Gildmark Roads",   "nodeId": "n-gildmark-roads",   "ocean": "o01", "polygonKm2": 1200 },
    { "id": "s03", "title": "Peatrun Shallows", "nodeId": "n-peatrun-shallows", "ocean": "o01", "polygonKm2": 2400 },
    { "id": "s04", "title": "Wreckwater",       "nodeId": "n-wreckwater",       "ocean": "o02", "polygonKm2": 2800 },
    { "id": "s05", "title": "Netstead Bight",   "nodeId": "n-netstead-bight",   "ocean": "o02", "polygonKm2": 1600 },
    { "id": "s06", "title": "Drowned Pavement", "nodeId": "n-drowned-pavement", "ocean": "o02", "polygonKm2": 3600 },
    { "id": "s07", "title": "Fumewater",        "nodeId": "n-fumewater",        "ocean": "o03", "polygonKm2": 2200 },
    { "id": "s08", "title": "Reed Shallows",    "nodeId": "n-reed-shallows",    "ocean": "o03", "polygonKm2": 1800 },
    { "id": "s09", "title": "Rimewall Margin",  "nodeId": "n-rimewall-margin",  "ocean": "o03", "polygonKm2": 2000 }
  ]
}
```

Verify by hand before moving on: `netKm2` sums to 64,000 (6,000 + 4×11,000 + 3×3,000 + 5×1,000); `interiorWaterKm2` sums to 1,600 (1,100 + 300 + 200); `surveyed` sums to 40 (0+10+6+7+7+3+3+2+1+1+0+0+0); `reported` sums to 120; `oceans[].polygonKm2` sums to 91,200 = `budget.oceanPolygonKm2`; `seas[].polygonKm2` sums to 20,600, and **that 20,600 is already inside the 91,200 and must never be added to it** — sea polygons are subsets of their parent ocean's polygon, which is what `G-CONTAIN` enforces once they are nodes. Step 1's tests assert all seven relationships.

**Why `oceans` and `seas` are in this file and not invented later.** The frame closure `65,600 gross land + 91,200 ocean polygons + 3,200 interstitial = 160,000` has nothing behind the 91,200 unless something emits three ocean polygons. Without them the promoted world carries ~94,400 km² of interstitial against a committed 3,200, `G-ATLAS-ROLLUP` cannot hold at ±2 pp, and the ratio goal becomes true only because nothing measures the polygon that was supposed to carry it. Task 10a builds them from these rows. `n-westsea` appears here at `tier: "sea"` under Galereach — its **demotion from ocean to sea** is the first real use of the declared-but-empty `sea` tier, and its polygon grows from today's 81.68 km² strip to 3,000 km².

- [ ] **Step 4: Write `content/schemas/world-manifest.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "world-manifest.schema.json",
  "title": "World manifest — SHAPE ONLY. Every numeric relationship (closure, quota sums, band arithmetic) lives in checkWorld()'s G-* gates, never here: the gate continues past a schema-invalid doc, so a bound duplicated into the schema turns its gate rule into dead code.",
  "type": "object",
  "required": ["version", "seed", "frame", "ratio", "budget", "grid", "regions",
               "landformCatalogue", "names", "relations", "quotas", "levelBands",
               "landmasses", "oceans", "seas"],
  "additionalProperties": false,
  "properties": {
    "version": { "type": "integer" },
    "seed": { "type": "string", "pattern": "^[0-9a-f]{16}$" },
    "frame": {
      "type": "object", "required": ["units", "w", "h", "areaKm2"], "additionalProperties": false,
      "properties": { "units": { "const": "km" }, "w": { "type": "number" }, "h": { "type": "number" }, "areaKm2": { "type": "number" } }
    },
    "ratio": {
      "type": "object", "additionalProperties": false,
      "required": ["measure", "target", "min", "max", "oceanPctTarget", "oceanPctMin", "oceanPctMax"],
      "properties": {
        "measure": { "type": "string" }, "target": { "type": "number" },
        "min": { "type": "number" }, "max": { "type": "number" },
        "oceanPctTarget": { "type": "number" }, "oceanPctMin": { "type": "number" }, "oceanPctMax": { "type": "number" }
      }
    },
    "budget": {
      "type": "object", "additionalProperties": false,
      "required": ["netLandKm2", "waterKm2", "grossLandPolygonKm2", "interiorWaterKm2",
                   "oceanPolygonKm2", "interstitialKm2", "interstitialComposition"],
      "properties": {
        "netLandKm2": { "type": "number" }, "waterKm2": { "type": "number" },
        "grossLandPolygonKm2": { "type": "number" }, "interiorWaterKm2": { "type": "number" },
        "oceanPolygonKm2": { "type": "number" }, "interstitialKm2": { "type": "number" },
        "interstitialComposition": { "type": "object", "additionalProperties": { "type": "number" } }
      }
    },
    "grid": {
      "type": "object", "additionalProperties": false,
      "required": ["w", "h", "cellKm", "cells", "landCellBand"],
      "properties": {
        "w": { "type": "integer" }, "h": { "type": "integer" }, "cellKm": { "type": "number" },
        "cells": { "type": "integer" },
        "landCellBand": { "type": "array", "items": { "type": "integer" }, "minItems": 2, "maxItems": 2 }
      }
    },
    "regions": {
      "type": "object", "additionalProperties": false, "required": ["surveyed", "reported"],
      "properties": {
        "surveyed": { "type": "object" },
        "reported": { "type": "object" }
      }
    },
    "landformCatalogue": { "type": "object" },
    "names": { "type": "object" },
    "relations": {
      "type": "object", "additionalProperties": false,
      "required": ["coverageFloorPct", "why"],
      "properties": {
        "coverageFloorPct": { "type": "number", "minimum": 0, "maximum": 100 },
        "why": { "type": "string", "minLength": 1 }
      }
    },
    "quotas": { "type": "object" },
    "levelBands": {
      "type": "object", "additionalProperties": false,
      "required": ["originPinnedId", "originFallbackContinent", "ringKm", "bands"],
      "properties": {
        "originPinnedId": { "type": "string" },
        "originFallbackContinent": { "type": "string" },
        "ringKm": { "type": "number" },
        "bands": { "type": "array", "items": { "type": "array", "items": { "type": "integer" }, "minItems": 2, "maxItems": 2 } }
      }
    },
    "landmasses": {
      "type": "array", "minItems": 1,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["id", "title", "class", "netKm2", "interiorWaterKm2", "surveyed", "reported"],
        "properties": {
          "id": { "type": "string", "pattern": "^c[0-9]{2}$" },
          "title": { "type": "string" },
          "class": { "enum": ["cap", "major", "minor", "chain"] },
          "netKm2": { "type": "number" }, "interiorWaterKm2": { "type": "number" },
          "surveyed": { "type": "integer" }, "reported": { "type": "integer" },
          "why": { "type": "string" }
        }
      }
    },
    "oceans": {
      "type": "array", "minItems": 3, "maxItems": 3,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["id", "title", "nodeId", "polygonKm2", "attributedWaterKm2"],
        "properties": {
          "id": { "type": "string", "pattern": "^o[0-9]{2}$" },
          "title": { "type": "string" },
          "nodeId": { "type": "string", "pattern": "^n-[a-z0-9-]+$" },
          "polygonKm2": { "type": "number" },
          "attributedWaterKm2": { "type": "number" }
        }
      }
    },
    "seas": {
      "type": "array", "minItems": 9, "maxItems": 9,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["id", "title", "nodeId", "ocean", "polygonKm2"],
        "properties": {
          "id": { "type": "string", "pattern": "^s[0-9]{2}$" },
          "title": { "type": "string" },
          "nodeId": { "type": "string", "pattern": "^n-[a-z0-9-]+$" },
          "ocean": { "type": "string", "pattern": "^o[0-9]{2}$" },
          "polygonKm2": { "type": "number" }
        }
      }
    }
  }
}
```

- [ ] **Step 5: Add the `fabric`, `civil` and `loop` sections to `content/world/budgets.json`**

Plan B created this file with `landforms` and `sheets`. Add four top-level keys, leaving Plan B's two untouched:

```json
{
  "cellKm": 0.5,
  "fabric": { "maxFiles": 20, "maxBytesPerFile": 262144, "maxBytesTotal": 4194304 },
  "civil": { "maxFiles": 600, "maxBytesPerFile": 8192 },
  "loop": [
    { "stage": "generate",    "budgetMs": 4000,  "failMs": 8000 },
    { "stage": "join",        "budgetMs": 2000,  "failMs": 4000 },
    { "stage": "gates",       "budgetMs": 15000, "failMs": 20000 },
    { "stage": "sheets",      "budgetMs": 5000,  "failMs": 8000 },
    { "stage": "rasterise",   "budgetMs": 30000, "failMs": 60000 },
    { "stage": "commit-lock", "budgetMs": 10000, "failMs": 15000 }
  ]
}
```

`cellKm: 0.5` is a **pinned constant** in exactly the sense `KM_TO_U = 100` and `SPINE_CELL_KM = 0.05` already are (`scripts/lib/spine.mjs:64-66`): changing it is a reviewed commit, never a code change.

**`loop` is the seed-to-map budget, and it is a table for a reason.** Goal G4's measure is "per-stage time budgets, each with a fail threshold — **not one aggregate number**", because an aggregate hides which stage regressed and silently drifts to minutes. The six rows are spec §7.6's verbatim table: generate 4/8 s, join + `G-MEANING` 2/4 s, spine + world gates 15/20 s, SVG sheet build 5/8 s, rasterise (ship-time only) 30/60 s, commit + lock 10/15 s. **This file is the single authority for all three consumers** — Task 10's `--stage-report` reads it and exits non-zero past the `failMs` column, Plan B's sheet-build budget reads the `sheets` row, and Plan D's join budget reads the `join` row. Nobody re-states a number that lives here.

`join` covers Plan D's `resolveCivil` + `checkRelations`; `gates` covers `check_content.mjs --require-complete` end to end, which is why it is the largest budget and why its 20 s fail threshold is what stops seventeen new gates from quietly costing a minute.

**Gate-id ownership, stated once so the two plans do not double-report.** Plan B's `gSpineWorld` reads the `landforms` and `sheets` sections of this same file and reports under `G-LANDFORM` and `G-SHEET-BUDGET`. **`G-WORLD-BUDGET` is this plan's id alone** — it owns the file's *existence* check, the `fabric` and `civil` families, the `cellKm` pin, the `loop` table, and the contract-pinned `world-budget: <family> <n> files, <n> bytes (budget <n>, <n>)` print line. Plan B's budgets-file-missing branch is deleted in its Task 5 (it returns quietly instead), so exactly one gate speaks when the file is gone.

- [ ] **Step 6: Write `scripts/lib/world.mjs`**

```js
// scripts/lib/world.mjs — Plan C: the ONE pure library for content/world/.
//
// Same contract as scripts/lib/spine.mjs, for the same reasons:
//   - one options object per function, no positional overloads;
//   - functions NEVER throw on bad content — errors return in-band, because
//     an uncaught throw in check_content.mjs skips finish() and silently
//     drops every FAIL recorded before it;
//   - SOFT SKIP: a content root with no world/ returns present:false and NO
//     errors. ~45 existing gate fixtures have no world/ directory and a
//     hard-fail here would red every one of them.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const readJsonInBand = (path, label, errors) => {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { errors.push(`${label}: cannot read: ${e.message}`); return null; }
};

function listJson(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
}

export function loadFabric({ contentRoot }) {
  const errors = [];
  const dir = join(contentRoot, "world");
  const empty = { present: false, manifest: null, budgets: null, fabric: [], world: null, handles: [], errors };
  if (!existsSync(dir)) return empty;

  const manifest = existsSync(join(dir, "manifest.json"))
    ? readJsonInBand(join(dir, "manifest.json"), "world/manifest.json", errors) : null;
  const budgets = existsSync(join(dir, "budgets.json"))
    ? readJsonInBand(join(dir, "budgets.json"), "world/budgets.json", errors) : null;

  const fabricDir = join(dir, "fabric");
  const fabric = [];
  let world = null;
  for (const f of listJson(fabricDir)) {
    const doc = readJsonInBand(join(fabricDir, f), `world/fabric/${f}`, errors);
    if (doc === null) continue;
    if (f === "world.json") world = { file: f, ...doc };
    else fabric.push({ file: f, ...doc });
  }

  const handleDir = join(dir, "handles");
  const handles = [];
  for (const f of listJson(handleDir)) {
    const doc = readJsonInBand(join(handleDir, f), `world/handles/${f}`, errors);
    if (doc !== null) handles.push({ file: f, ...doc });
  }

  return { present: true, manifest, budgets, fabric, world, handles, errors };
}

// G-WORLD-BUDGET — PRINTS its measurements on every run, exactly as
// G-LOAD-BUDGET (check_content.mjs:2089) and G-COMP-REPORT do, so drift is
// visible before it is a failure. `note` is the print sink; `report` is fail.
export function gWorldBudget({ contentRoot, budgets, manifest = null, report, note }) {
  if (!budgets) { report(`G-WORLD-BUDGET: world/budgets.json is missing`); return; }
  const families = [
    { name: "fabric", dir: join(contentRoot, "world/fabric"), rel: "world/fabric",
      maxFiles: budgets.fabric?.maxFiles, maxPer: budgets.fabric?.maxBytesPerFile, maxTotal: budgets.fabric?.maxBytesTotal },
    { name: "civil", dir: join(contentRoot, "world/civil"), rel: "world/civil",
      maxFiles: budgets.civil?.maxFiles, maxPer: budgets.civil?.maxBytesPerFile, maxTotal: null },
  ];
  for (const fam of families) {
    if (fam.maxFiles === undefined || fam.maxPer === undefined) {
      report(`G-WORLD-BUDGET: world/budgets.json has no "${fam.name}" section`);
      continue;
    }
    const files = [];
    const walk = (d) => {
      if (!existsSync(d)) return;
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(d, e.name));
        else if (e.name.endsWith(".json")) files.push(join(d, e.name));
      }
    };
    walk(fam.dir);
    files.sort();
    let total = 0;
    for (const f of files) {
      const bytes = statSync(f).size;
      total += bytes;
      if (bytes > fam.maxPer)
        report(`G-WORLD-BUDGET: ${fam.rel}/${f.slice(fam.dir.length + 1)} is ${bytes} bytes > per-file budget ${fam.maxPer}`);
    }
    note(`world-budget: ${fam.name} ${files.length} files, ${total} bytes (budget ${fam.maxFiles}, ${fam.maxTotal ?? fam.maxPer})`);
    if (files.length > fam.maxFiles)
      report(`G-WORLD-BUDGET: ${fam.rel} has ${files.length} files > budget ${fam.maxFiles}`);
    if (fam.maxTotal !== null && total > fam.maxTotal)
      report(`G-WORLD-BUDGET: ${fam.rel} totals ${total} bytes > budget ${fam.maxTotal}`);
  }
  if (budgets.cellKm !== 0.5)
    report(`G-WORLD-BUDGET: budgets.cellKm is ${budgets.cellKm} — 0.5 is a pinned constant, not a tuning knob`);

  // Town plans: a QUOTA with a staged delivery, so the shortfall must be
  // visible rather than silently closed. D2's taken default is "3 capitals'
  // plans now, 5 deferred" — Millcross exists today and Plan E Task 8 authors
  // the three capitals, giving 4 of 8. Printed, never failed: a gate here
  // would block the release the staging exists to permit.
  if (manifest?.quotas?.townPlans) {
    const dir = join(contentRoot, "towns");
    const authored = existsSync(dir)
      ? readdirSync(dir).filter((f) => /^town-.+\.json$/.test(f)).length : 0;
    note(`world-budget: town-plans ${authored} authored / ${manifest.quotas.townPlans} quota`);
  }

  // The loop table is the ONE authority for per-stage time budgets: Task 10's
  // --stage-report reads it, Plan B's sheet build reads the `sheets` row, and
  // Plan D's join reads the `join` row. Goal G4's measure is explicitly
  // per-stage thresholds and NOT one aggregate number, so a missing or
  // malformed table means the loop time is unfalsifiable and will drift.
  const STAGES = ["generate", "join", "gates", "sheets", "rasterise", "commit-lock"];
  if (!Array.isArray(budgets.loop)) {
    report(`G-WORLD-BUDGET: world/budgets.json has no "loop" table — per-stage time budgets are goal G4's measure, not an aggregate`);
  } else {
    const seen = budgets.loop.map((r) => r.stage);
    for (const st of STAGES)
      if (!seen.includes(st)) report(`G-WORLD-BUDGET: loop table is missing the "${st}" stage`);
    for (const r of budgets.loop) {
      if (!STAGES.includes(r.stage)) report(`G-WORLD-BUDGET: loop table names unknown stage "${r.stage}"`);
      if (!(r.failMs > r.budgetMs))
        report(`G-WORLD-BUDGET: loop stage "${r.stage}" failMs ${r.failMs} must exceed budgetMs ${r.budgetMs}`);
      note(`world-budget: loop ${r.stage} budget ${r.budgetMs} ms, fail ${r.failMs} ms`);
    }
  }
}
```

- [ ] **Step 7: Wire `checkWorld` into `check_content.mjs`**

Add the import next to the existing spine import at `scripts/check_content.mjs:26`:

```js
// Plan C: the content/world/ layer. Same lib/ discipline as spine.mjs — all
// pure logic lives there; this file is not importable (bare main() + exit).
import { loadFabric, gWorldBudget } from "./lib/world.mjs";
```

Add the gate function immediately above `function checkSpine(opts, mobTypes) {` at `scripts/check_content.mjs:1536`:

```js
// ═══════════════════════ WORLD (Plan C, spec phase 4) ═══════════════════
// content/world/ — the generated fabric layer. SOFT-SKIPS a content root
// with no world/ directory, before touching any schema: ~45 pre-existing
// spine fixtures have no world/ and a hard-fail here reds every one.
// Returns the fabric-file count for the finish() line.
function checkWorld(opts) {
  const world = loadFabric({ contentRoot: opts.contentRoot });
  if (!world.present) return 0;
  for (const e of world.errors) fail(`world: ${e}`);

  const validate = compileSchema(join(opts.contentRoot, "schemas/world-manifest.schema.json"), "world-manifest schema", fail);
  if (validate && world.manifest && !validate(world.manifest))
    for (const err of validate.errors) fail(`world/manifest.json: schema ${err.instancePath || "/"} ${err.message}`);

  gWorldBudget({ contentRoot: opts.contentRoot, budgets: world.budgets, manifest: world.manifest, report: fail, note: (m) => console.log(m) });
  return world.fabric.length;
}
```

Call it from inside `checkSpine`, immediately after the `gSpineBudgets(...)` call at `scripts/check_content.mjs:1682`:

```js
  gSpineBudgets({ spine, tree, plans: townPlans, contentRoot: opts.contentRoot, fail });

  // Plan C: the world layer rides the same harness as the spine gates, so
  // `--only=spine` (Gate 1) covers it automatically — see the primer.
  checkWorld(opts);
```

- [ ] **Step 8: Create the base fixture root**

`scripts/tests/fixtures/world/base/world/manifest.json` — a copy of the committed manifest.
`scripts/tests/fixtures/world/base/world/budgets.json`:

```json
{
  "cellKm": 0.5,
  "fabric": { "maxFiles": 20, "maxBytesPerFile": 262144, "maxBytesTotal": 4194304 },
  "civil": { "maxFiles": 600, "maxBytesPerFile": 8192 },
  "landforms": { "maxInstances": 2400, "maxNamed": 500, "minTypes": 100, "maxTypes": 200 },
  "sheets": { "maxSheets": 18, "maxSvgBytes": 524288, "maxRasterSeconds": 2 },
  "loop": [
    { "stage": "generate",    "budgetMs": 4000,  "failMs": 8000 },
    { "stage": "join",        "budgetMs": 2000,  "failMs": 4000 },
    { "stage": "gates",       "budgetMs": 15000, "failMs": 20000 },
    { "stage": "sheets",      "budgetMs": 5000,  "failMs": 8000 },
    { "stage": "rasterise",   "budgetMs": 30000, "failMs": 60000 },
    { "stage": "commit-lock", "budgetMs": 10000, "failMs": 15000 }
  ]
}
```

The fixture root has **no `spine/` directory**, so `checkSpine` soft-skips and only `checkWorld` runs — which is precisely the isolation the first test asserts.

- [ ] **Step 9: Run test to verify it passes**

Run: `node --test --test-name-pattern "world" 'scripts/tests/*.test.mjs'`
Expected: PASS — all six tests.

- [ ] **Step 10: Commit**

```bash
git add content/world/manifest.json content/world/budgets.json \
        content/schemas/world-manifest.schema.json \
        scripts/lib/world.mjs scripts/check_content.mjs \
        scripts/tests/world-gates.test.mjs scripts/tests/fixtures/world
git commit -m "feat: world manifest, fabric budget and G-WORLD-BUDGET"
```

#### Task 1 quality gate

- [ ] **Step 11: Verify — run the real commands and paste the output**

```bash
node scripts/check_content.mjs --only=spine
npm test --prefix scripts
node scripts/check_spine_emit.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: `--only=spine` exits 0 and its output now contains two `world-budget:` lines; `npm test --prefix scripts` green; `check_spine_emit --check` reports `check clean, 47 files` (**zero spine bytes changed** — this is the migration invariant); the jest pin green.

- [ ] **Step 12: Independent adversarial review of this task's diff**

Dispatch a fresh subagent (or `/code-review`) with `git diff main...HEAD -- content/world content/schemas scripts` and this brief: *attack the soft-skip (does a root with no `world/` really produce zero output and zero failures?); attack the arithmetic (do the manifest sums close, and does the schema forbid the extra key that would let them stop closing?); attack the gate discipline (can `gWorldBudget` throw on a missing section, an unreadable file, or a `world/civil` directory that does not exist?); confirm `checkWorld` cannot change the exit code of any pre-existing fixture.*

- [ ] **Step 13: Refactor on the findings** — fix everything the review raises. Do not carry findings forward.

- [ ] **Step 14: Re-verify** — re-run every command in Step 11; all four green.

- [ ] **Step 15: Commit the refactor and report**

```bash
git add -A && git commit -m "refactor: world budget gate review findings"
git branch --show-current && git log --oneline -1
```

---

### Task 2: Deterministic primitives — seed, noise, grid

Everything downstream inherits its determinism from these three files. They contain **no transcendentals** and the test suite proves it by reading their own source text, not by trusting a comment.

**Files:**
- Create: `tools/mapforge/lib/seed.mjs`
- Create: `tools/mapforge/lib/noise.mjs`
- Create: `tools/mapforge/lib/grid.mjs`
- Test: `tools/mapforge/tests/noise-determinism.test.mjs`, `tools/mapforge/tests/grid.test.mjs`

**Interfaces:**
- Consumes: nothing (node builtins only)
- Produces: `mintSeed({parentStream, name}): string`; `hashNoise2D({x,y,stream}): number`; `fbm({x,y,stream,octaves,lacunarity,gain}): number`; `smoothstep(t): number`; `UNIT_VECTORS: ReadonlyArray<[number,number]>`; `q(v): number`; `makeGrid({w,h,cellKm}): Grid`; `FLAG`

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/noise-determinism.test.mjs`:

```js
// tools/mapforge/tests/noise-determinism.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashNoise2D, fbm, smoothstep, UNIT_VECTORS, q } from "../lib/noise.mjs";
import { mintSeed } from "../lib/seed.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, "../lib");

// The spec's R5 mitigation is "no transcendentals on any path reaching a
// committed byte". A comment cannot enforce that; a source scan can.
const BANNED = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|hypot|cbrt|sinh|cosh|tanh)\b|\*\*/;

test("noise.mjs and seed.mjs contain no transcendental call and no ** operator", () => {
  for (const f of ["noise.mjs", "seed.mjs", "grid.mjs"]) {
    const src = readFileSync(join(LIB, f), "utf8");
    const offending = src.split("\n")
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => BANNED.test(line) && !line.trimStart().startsWith("//"));
    assert.deepEqual(offending, [], `${f} uses a banned operation: ${JSON.stringify(offending)}`);
  }
});

test("smoothstep is the polynomial form and is exact at the endpoints", () => {
  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(1), 1);
  assert.equal(smoothstep(0.5), 0.5);
  assert.equal(smoothstep(0.25), 0.25 * 0.25 * (3 - 2 * 0.25));
});

test("hashNoise2D is in [-1, 1] and is a pure function of (x, y, stream)", () => {
  const a = hashNoise2D({ x: 12.25, y: 88.75, stream: "d9a0051d32afab59" });
  const b = hashNoise2D({ x: 12.25, y: 88.75, stream: "d9a0051d32afab59" });
  const c = hashNoise2D({ x: 12.25, y: 88.75, stream: "da45bd8930d33bb0" });
  assert.equal(a, b);
  assert.notEqual(a, c);
  for (let i = 0; i < 500; i++) {
    const v = hashNoise2D({ x: i * 0.37, y: i * 1.13, stream: "d9a0051d32afab59" });
    assert.ok(v >= -1 && v <= 1, `out of range at i=${i}: ${v}`);
  }
});

test("hashNoise2D is continuous: neighbouring samples never jump by more than 2/lattice", () => {
  let prev = hashNoise2D({ x: 0, y: 4, stream: "seedseedseedseed" });
  for (let i = 1; i <= 200; i++) {
    const v = hashNoise2D({ x: i * 0.01, y: 4, stream: "seedseedseedseed" });
    assert.ok(Math.abs(v - prev) < 0.2, `discontinuity at x=${i * 0.01}: ${prev} -> ${v}`);
    prev = v;
  }
});

test("fbm sums octaves deterministically and stays bounded", () => {
  const args = { x: 3.5, y: 7.25, stream: "d9a0051d32afab59", octaves: 6, lacunarity: 2, gain: 0.5 };
  assert.equal(fbm(args), fbm(args));
  for (let i = 0; i < 200; i++) {
    const v = fbm({ ...args, x: i * 0.11, y: i * 0.29 });
    assert.ok(v >= -1.001 && v <= 1.001, `fbm out of range: ${v}`);
  }
});

test("UNIT_VECTORS is a committed literal table of 16 unit vectors", () => {
  assert.equal(UNIT_VECTORS.length, 16);
  for (const [dx, dy] of UNIT_VECTORS) {
    const len = Math.sqrt(dx * dx + dy * dy);
    assert.ok(Math.abs(len - 1) < 1e-9, `not a unit vector: ${dx},${dy} (len ${len})`);
  }
  assert.throws(() => { UNIT_VECTORS.push([0, 0]); });
});

test("q quantises to 2 decimals and is idempotent", () => {
  assert.equal(q(1.23456), 1.23);
  assert.equal(q(1.235), 1.24);
  assert.equal(q(q(1.23456)), q(1.23456));
  assert.equal(q(0.5), 0.5);   // grid corners survive unchanged
  assert.equal(q(-3.145), -3.14);
});

test("mintSeed is the pinned sha256 construction", () => {
  const s = mintSeed({ parentStream: "d9a0051d32afab59", name: "landform" });
  assert.match(s, /^[0-9a-f]{16}$/);
  assert.equal(s, mintSeed({ parentStream: "d9a0051d32afab59", name: "landform" }));
  assert.notEqual(s, mintSeed({ parentStream: "d9a0051d32afab59", name: "landforms" }));
});
```

Create `tools/mapforge/tests/grid.test.mjs`:

```js
// tools/mapforge/tests/grid.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGrid, FLAG, idx, cellCentreKm } from "../lib/grid.mjs";

test("makeGrid allocates one typed array per field at the pinned resolution", () => {
  const g = makeGrid({ w: 800, h: 800, cellKm: 0.5 });
  assert.equal(g.w, 800);
  assert.equal(g.h, 800);
  assert.equal(g.cellKm, 0.5);
  assert.equal(g.elev.length, 640000);
  assert.ok(g.elev instanceof Float32Array);
  assert.ok(g.moist instanceof Float32Array);
  assert.ok(g.temp instanceof Float32Array);
  assert.ok(g.flowAcc instanceof Float32Array);
  assert.ok(g.flowDir instanceof Int8Array);
  assert.ok(g.owner instanceof Int16Array);
  assert.ok(g.plate instanceof Int8Array);
  assert.ok(g.biome instanceof Uint8Array);
  assert.ok(g.flags instanceof Uint16Array);
});

test("owner initialises to -1 (unowned) and flowDir to -1 (no outlet)", () => {
  const g = makeGrid({ w: 4, h: 4, cellKm: 0.5 });
  for (let i = 0; i < 16; i++) {
    assert.equal(g.owner[i], -1);
    assert.equal(g.flowDir[i], -1);
  }
});

test("FLAG bits are distinct powers of two and frozen", () => {
  const values = Object.values(FLAG);
  assert.equal(new Set(values).size, values.length);
  for (const v of values) assert.equal(v & (v - 1), 0, `${v} is not a power of two`);
  assert.throws(() => { FLAG.SEA = 999; });
});

test("idx and cellCentreKm are exact inverses on the grid lattice", () => {
  const g = makeGrid({ w: 800, h: 800, cellKm: 0.5 });
  assert.equal(idx({ grid: g, cx: 0, cy: 0 }), 0);
  assert.equal(idx({ grid: g, cx: 799, cy: 799 }), 639999);
  assert.deepEqual(cellCentreKm({ grid: g, cx: 0, cy: 0 }), [0.25, 0.25]);
  assert.deepEqual(cellCentreKm({ grid: g, cx: 799, cy: 799 }), [399.75, 399.75]);
});

test("resident footprint stays under 16 MB", () => {
  const g = makeGrid({ w: 800, h: 800, cellKm: 0.5 });
  const bytes = [g.elev, g.moist, g.temp, g.flowAcc, g.flowDir, g.owner, g.plate, g.biome, g.flags]
    .reduce((s, a) => s + a.byteLength, 0);
  assert.ok(bytes < 16 * 1024 * 1024, `${bytes} bytes resident`);
  assert.ok(bytes > 14 * 1024 * 1024, `${bytes} bytes — a field is missing`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'tools/mapforge/tests/noise-determinism.test.mjs' 'tools/mapforge/tests/grid.test.mjs'`
Expected: FAIL — `Cannot find module '.../tools/mapforge/lib/noise.mjs'`.

- [ ] **Step 3: Write `tools/mapforge/lib/seed.mjs`**

```js
// tools/mapforge/lib/seed.mjs — Plan C: named seed streams.
//
// Lifted verbatim out of the retired lib/world-gen.mjs so the construction
// is unchanged: streams are NAMED, not sequential, so adding a pass never
// perturbs an earlier one. n-atlas.json already carries four resolved
// streams (terrain/settlements/vegetation/names) minted the same way by
// scripts/lib/spine.mjs:493 streamSeed().
import { createHash } from "node:crypto";

export function mintSeed({ parentStream, name }) {
  return createHash("sha256").update(`${parentStream}:${name}`).digest("hex").slice(0, 16);
}
```

- [ ] **Step 4: Write `tools/mapforge/lib/noise.mjs`**

```js
// tools/mapforge/lib/noise.mjs — Plan C: integer-hash value noise.
//
// R5 (spec §7.3): ECMA-262 leaves Math.sin/cos/exp/log/pow
// implementation-approximated and V8 has changed them between versions, so
// a Node upgrade with ZERO content change can red every byte gate. This
// file therefore uses only + - * / % and Math.sqrt (all pinned to
// correctly-rounded IEEE-754 by the spec) plus Math.imul and the bitwise
// operators (exact integer ops). Math.hypot is BANNED even though it is not
// transcendental: it is implementation-defined in its error bound.
// tests/noise-determinism.test.mjs scans this file's own source for
// violations — do not add one and "fix" the test.

// ── the hash ───────────────────────────────────────────────────────────────
// xor-shift / multiply finaliser. Math.imul is exact 32-bit multiplication.
function hash3(x, y, s) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (s | 0)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x3d4d51c3) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// A 16-hex stream seed -> one exact 32-bit integer. parseInt on 8 hex chars
// is exact (the value is < 2^32 and integral).
export function streamInt(stream) {
  return Number.parseInt(stream.slice(0, 8), 16) >>> 0;
}

// [-1, 1], exact: 4294967295 is representable, the division is one rounded op.
const toSigned = (h) => (h / 2147483647.5) - 1;

// Polynomial smoothstep — the transcendental-free interpolant.
export function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// Value noise on the integer lattice, bilinearly interpolated through
// smoothstep. Continuous, deterministic, no trig.
export function hashNoise2D({ x, y, stream }) {
  const s = streamInt(stream);
  const xi = Math.floor(x), yi = Math.floor(y);
  const tx = smoothstep(x - xi), ty = smoothstep(y - yi);
  const v00 = toSigned(hash3(xi, yi, s));
  const v10 = toSigned(hash3(xi + 1, yi, s));
  const v01 = toSigned(hash3(xi, yi + 1, s));
  const v11 = toSigned(hash3(xi + 1, yi + 1, s));
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

// Fractal brownian motion, normalised by the amplitude sum so the result
// stays in [-1, 1] for every octave count.
export function fbm({ x, y, stream, octaves = 6, lacunarity = 2, gain = 0.5 }) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * hashNoise2D({ x: x * freq, y: y * freq, stream });
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}

// 16 committed unit vectors at 22.5-degree steps. Written as literals
// BECAUSE Math.cos is banned here: these are the directions every pass
// (winds, domain warp, arc fractalisation) samples along.
export const UNIT_VECTORS = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([0.9238795325112867, 0.3826834323650898]),
  Object.freeze([0.7071067811865476, 0.7071067811865476]),
  Object.freeze([0.3826834323650898, 0.9238795325112867]),
  Object.freeze([0, 1]),
  Object.freeze([-0.3826834323650898, 0.9238795325112867]),
  Object.freeze([-0.7071067811865476, 0.7071067811865476]),
  Object.freeze([-0.9238795325112867, 0.3826834323650898]),
  Object.freeze([-1, 0]),
  Object.freeze([-0.9238795325112867, -0.3826834323650898]),
  Object.freeze([-0.7071067811865476, -0.7071067811865476]),
  Object.freeze([-0.3826834323650898, -0.9238795325112867]),
  Object.freeze([0, -1]),
  Object.freeze([0.3826834323650898, -0.9238795325112867]),
  Object.freeze([0.7071067811865476, -0.7071067811865476]),
  Object.freeze([0.9238795325112867, -0.3826834323650898]),
]);

// Rational falloff, replacing exp(-k*d). Monotonic on d >= 0, f(0) = 1,
// f(inf) -> 0 — every property the elevation and mask passes rely on.
export function falloff({ d, k }) {
  const t = k * d;
  return 1 / (1 + t + t * t);
}

// THE quantiser. Every committed number passes through this before
// JSON.stringify + sha256 (spec §7.3 fix 3). 0.5 is exactly representable
// in binary, so grid corners survive unchanged.
export function q(v) {
  return Math.round(v * 100) / 100;
}
```

Note the `Math.sqrt` in the *test*'s unit-vector assertion is fine — the ban applies to the library, and `Math.sqrt` is correctly rounded and explicitly allowed by the Global Constraints. `falloff` exists so no pass ever reaches for `Math.exp`.

- [ ] **Step 5: Write `tools/mapforge/lib/grid.mjs`**

```js
// tools/mapforge/lib/grid.mjs — Plan C: the throwaway cell grid.
//
// Structure-of-arrays, one typed array per field, NEVER an array of objects:
// 640,000 cells x 9 fields is ~14.7 MB resident this way and ~250 MB as
// objects. Built, consumed and dropped inside one process; never committed.
//
// Index convention: i = cy * w + cx. Cell (cx, cy) covers the km rectangle
// [cx*cellKm, (cx+1)*cellKm) x [cy*cellKm, (cy+1)*cellKm); its CENTRE is
// ((cx + 0.5) * cellKm, (cy + 0.5) * cellKm) and its four CORNERS are exact
// multiples of cellKm — which is why a shared arc vertex is bit-identical in
// both neighbours' rings (spec §7.4).

export const FLAG = Object.freeze({
  SEA: 1, LAKE: 2, RIVER: 4, DELTA: 8, GLACIER: 16,
  ARC: 32, CARBONATE: 64, SAND: 128, CLIFF: 256,
});

export function makeGrid({ w = 800, h = 800, cellKm = 0.5 }) {
  const n = w * h;
  const owner = new Int16Array(n).fill(-1);   // region index, -1 = unowned
  const flowDir = new Int8Array(n).fill(-1);  // 0..7 neighbour index, -1 = none
  return {
    w, h, cellKm, n,
    elev: new Float32Array(n),
    moist: new Float32Array(n),
    temp: new Float32Array(n),
    flowAcc: new Float32Array(n),
    flowDir,
    owner,
    plate: new Int8Array(n).fill(-1),         // premise/continent index, -1 = ocean
    biome: new Uint8Array(n),                 // index into BIOMES
    flags: new Uint16Array(n),

    // ── the four PINNED-CONSTRAINT fields ────────────────────────────────
    // These exist because Plan D's G-PIN-SAT measures the fabric under each of
    // the ~40 pinned seed points and compares it against that record's
    // `requires` block — landform, shelter fetch, water depth, fresh water,
    // slope. If they are absent, `measureCell` reads undefined on every one,
    // all 40 receipts come out zeroed, and G-PIN-SAT either fails all 40 or
    // (worse) passes vacuously. They are ARRAYS ON THE GRID rather than a
    // separate structure so a pass that forgets to fill one leaves a
    // detectable sentinel rather than a silently-absent key.
    landform: new Int16Array(n).fill(-1),     // dominant lexicon type index, -1 = none  (P10)
    fetchKm: new Float32Array(n).fill(-1),    // open-water fetch of the adjacent sea, -1 = not coastal (P4)
    depthM: new Float32Array(n).fill(-1),     // water depth in metres, -1 = land        (P4)
    freshKm: new Float32Array(n).fill(-1),    // km to the nearest fresh water, -1 = unset (P6)

    // Index -> string lookups, filled by the passes that own the vocabulary.
    // Plan D's measureCell reads grid.biomeName(i) and grid.regionId(i) rather
    // than re-deriving either from an index it would have to keep in sync.
    biomeNames: [],                           // BIOMES, set by P8
    regionIds: [],                            // region record ids by owner index, set by P9
    biomeName(i) { return this.biomeNames[this.biome[i]] ?? null; },
    regionId(i) { return this.owner[i] < 0 ? null : (this.regionIds[this.owner[i]] ?? null); },
    elevM(i) { return this.elev[i] * 1000; }, // the model's 0..1 elevation in metres
  };
}

export function idx({ grid, cx, cy }) { return cy * grid.w + cx; }
export function cx({ grid, i }) { return i % grid.w; }
export function cy({ grid, i }) { return (i / grid.w) | 0; }
export function cellCentreKm({ grid, cx: x, cy: y }) {
  return [(x + 0.5) * grid.cellKm, (y + 0.5) * grid.cellKm];
}
export function cellAreaKm2({ grid }) { return grid.cellKm * grid.cellKm; }

// The eight D8 neighbours in a FIXED order. Every tie-break in the pipeline
// resolves to the lowest index in THIS order, which is what makes flow
// direction, Poisson siting and Dijkstra insertion-order independent.
export const D8 = Object.freeze([
  Object.freeze([1, 0]), Object.freeze([1, 1]), Object.freeze([0, 1]), Object.freeze([-1, 1]),
  Object.freeze([-1, 0]), Object.freeze([-1, -1]), Object.freeze([0, -1]), Object.freeze([1, -1]),
]);

export const setFlag = ({ grid, i, flag }) => { grid.flags[i] |= flag; };
export const hasFlag = ({ grid, i, flag }) => (grid.flags[i] & flag) !== 0;
export const clearFlag = ({ grid, i, flag }) => { grid.flags[i] &= ~flag; };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test 'tools/mapforge/tests/noise-determinism.test.mjs' 'tools/mapforge/tests/grid.test.mjs'`
Expected: PASS — 13 tests.

- [ ] **Step 7: Commit**

```bash
git add tools/mapforge/lib/seed.mjs tools/mapforge/lib/noise.mjs tools/mapforge/lib/grid.mjs \
        tools/mapforge/tests/noise-determinism.test.mjs tools/mapforge/tests/grid.test.mjs
git commit -m "feat: deterministic grid, integer-hash noise, named seed streams"
```

#### Task 2 quality gate

- [ ] **Step 8: Verify**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_spine_emit.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: the whole mapforge suite green (the pre-existing `gen-world`/`world-gen`/sheet tests still pass — Task 2 adds files, it does not touch them); 47 files clean; jest pin green.

- [ ] **Step 9: Independent adversarial review of this task's diff**

Brief the reviewer: *try to break determinism. Is `streamInt` exact for every 16-hex stream? Does `hashNoise2D` produce a discontinuity at negative coordinates (`Math.floor` vs `| 0` — the library must use `Math.floor`, and the test only covers positive x)? Is `fbm`'s normalisation correct at `gain = 1`? Is the source scan defeatable by a string concatenation or a computed member access (`Math["cos"]`)? Does `makeGrid` leave any field un-initialised where `0` is a meaningful value?*

- [ ] **Step 10: Refactor** — in particular, add negative-coordinate cases to the continuity test if the review finds the `| 0` trap, and extend `BANNED` to catch computed member access.

- [ ] **Step 11: Re-verify** — re-run Step 8's three commands.

- [ ] **Step 12: Commit and report**

```bash
git add -A && git commit -m "refactor: noise/grid review findings"
git branch --show-current && git log --oneline -1
```

---

### Task 3: The thirteen premises, P1 (continental mask) and P2 (elevation)

The first refutation forced this task's shape: over 40 free seeds, landmasses ≥ 1,000 km² came out `{1:9, 2:13, 3:11, 4:6, 5:1}` and **0 of 40 seeds produced the 7 named continents** the address space assumes. Premises are therefore **hard geometric masks**, not hints — they pin continent count, footprint centre, area band and coastline class, and P8's biome table is *clamped* to the premise palette afterwards.

**Files:**
- Create: `content/schemas/premise.schema.json`
- Create: `content/world/premises/continent-01.json` … `continent-13.json`
- Create: `tools/mapforge/lib/passes/mask.mjs`
- Create: `tools/mapforge/lib/passes/elevation.mjs`
- Test: `tools/mapforge/tests/mask.test.mjs`

**Interfaces:**
- Consumes: `makeGrid`, `FLAG`, `idx`, `cellCentreKm`, `D8` (Task 2); `fbm`, `smoothstep`, `falloff`, `UNIT_VECTORS`, `q` (Task 2); `mintSeed` (Task 2); `content/world/manifest.json` (Task 1)
- Produces:
```js
// tools/mapforge/lib/passes/mask.mjs
export function applyPremiseMasks({ grid, premises, stream }):
  { maskField: Float32Array, plateArea: Int32Array }
export function premiseMaskAt({ premise, xKm, yKm, stream }): number   // [0,1]
// tools/mapforge/lib/passes/elevation.mjs
export function buildElevation({ grid, premises, maskField, stream }): void  // writes grid.elev in place
```

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/mask.test.mjs`:

```js
// tools/mapforge/tests/mask.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeGrid, idx, cellCentreKm } from "../lib/grid.mjs";
import { applyPremiseMasks, premiseMaskAt } from "../lib/passes/mask.mjs";
import { buildElevation } from "../lib/passes/elevation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PREM_DIR = join(ROOT, "content/world/premises");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
const premises = readdirSync(PREM_DIR).filter((f) => f.endsWith(".json")).sort()
  .map((f) => JSON.parse(readFileSync(join(PREM_DIR, f), "utf8")));

test("there are exactly 13 premises, one per manifest landmass, ids in order", () => {
  assert.equal(premises.length, 13);
  assert.deepEqual(premises.map((p) => p.id), MANIFEST.landmasses.map((l) => l.id));
  assert.deepEqual(premises.map((p) => p.title), MANIFEST.landmasses.map((l) => l.title));
});

test("every premise footprint sits fully inside the 400 x 400 frame", () => {
  for (const p of premises) {
    const [x, y] = p.footprint.centreKm;
    const [rx, ry] = p.footprint.radiiKm;
    assert.ok(x - rx > 0 && x + rx < 400, `${p.id} footprint leaves the frame in x`);
    assert.ok(y - ry > 0 && y + ry < 400, `${p.id} footprint leaves the frame in y`);
  }
});

test("premise area bands bracket the manifest's netKm2 for that landmass", () => {
  for (const p of premises) {
    const l = MANIFEST.landmasses.find((m) => m.id === p.id);
    assert.ok(p.areaBandKm2[0] <= l.netKm2 && l.netKm2 <= p.areaBandKm2[1],
      `${p.id}: manifest netKm2 ${l.netKm2} outside premise band ${JSON.stringify(p.areaBandKm2)}`);
  }
});

test("premiseMaskAt is 1 at the footprint centre and 0 far outside", () => {
  const p = premises.find((x) => x.id === "c02");
  const [cx, cy] = p.footprint.centreKm;
  assert.ok(premiseMaskAt({ premise: p, xKm: cx, yKm: cy, stream: "aaaaaaaaaaaaaaaa" }) > 0.9);
  assert.equal(premiseMaskAt({ premise: p, xKm: 1, yKm: 399, stream: "aaaaaaaaaaaaaaaa" }), 0);
});

test("applyPremiseMasks assigns every masked cell to exactly one plate, argmax", () => {
  const grid = makeGrid({ w: 200, h: 200, cellKm: 2 });   // coarse grid, same frame
  const { maskField, plateArea } = applyPremiseMasks({ grid, premises, stream: "d9a0051d32afab59" });
  assert.equal(maskField.length, grid.n);
  assert.equal(plateArea.length, premises.length);
  let masked = 0;
  for (let i = 0; i < grid.n; i++) {
    if (maskField[i] > 0) { masked++; assert.ok(grid.plate[i] >= 0 && grid.plate[i] < 13); }
    else assert.equal(grid.plate[i], -1);
  }
  assert.ok(masked > 0, "no cell was masked at all");
  assert.equal(plateArea.reduce((a, b) => a + b, 0), masked);
});

test("every premise claims at least one cell — no landmass is masked out of existence", () => {
  const grid = makeGrid({ w: 400, h: 400, cellKm: 1 });
  const { plateArea } = applyPremiseMasks({ grid, premises, stream: "d9a0051d32afab59" });
  for (let k = 0; k < premises.length; k++)
    assert.ok(plateArea[k] > 0, `${premises[k].id} claimed 0 cells — its footprint is swallowed by a neighbour`);
});

test("applyPremiseMasks is a pure function of (grid geometry, premises, stream)", () => {
  const run = () => {
    const g = makeGrid({ w: 200, h: 200, cellKm: 2 });
    const r = applyPremiseMasks({ grid: g, premises, stream: "d9a0051d32afab59" });
    return { mask: Array.from(r.maskField), plate: Array.from(g.plate) };
  };
  assert.deepEqual(run(), run());
});

test("buildElevation raises masked ground above unmasked ground everywhere", () => {
  const grid = makeGrid({ w: 200, h: 200, cellKm: 2 });
  const { maskField } = applyPremiseMasks({ grid, premises, stream: "d9a0051d32afab59" });
  buildElevation({ grid, premises, maskField, stream: "d9a0051d32afab59" });
  let maxOcean = -Infinity, minMaskedCore = Infinity;
  for (let i = 0; i < grid.n; i++) {
    if (maskField[i] === 0) maxOcean = Math.max(maxOcean, grid.elev[i]);
    if (maskField[i] > 0.9) minMaskedCore = Math.min(minMaskedCore, grid.elev[i]);
  }
  assert.ok(minMaskedCore > maxOcean,
    `premise cores (${minMaskedCore}) must outrank every unmasked cell (${maxOcean}) — otherwise rank selection picks ocean floor`);
});

test("buildElevation is deterministic", () => {
  const run = () => {
    const g = makeGrid({ w: 120, h: 120, cellKm: 400 / 120 });
    const { maskField } = applyPremiseMasks({ grid: g, premises, stream: "d9a0051d32afab59" });
    buildElevation({ grid: g, premises, maskField, stream: "d9a0051d32afab59" });
    return Array.from(g.elev);
  };
  assert.deepEqual(run(), run());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'tools/mapforge/tests/mask.test.mjs'`
Expected: FAIL — `ENOENT: no such file or directory, scandir '.../content/world/premises'`.

- [ ] **Step 3: Write `content/schemas/premise.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "premise.schema.json",
  "title": "Continental premise — a HARD geometric mask, not a hint. Pins continent count, footprint centre, area band and coastline class; the biome table is evaluated normally and then CLAMPED to `palette`.",
  "type": "object",
  "required": ["id", "title", "class", "footprint", "areaBandKm2", "coastClass",
               "palette", "landformKit", "structuralIdea", "structures", "register", "levelBand"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^c[0-9]{2}$" },
    "title": { "type": "string" },
    "class": { "enum": ["cap", "major", "minor", "chain"] },
    "footprint": {
      "type": "object", "required": ["centreKm", "radiiKm", "warpKm"], "additionalProperties": false,
      "properties": {
        "centreKm": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
        "radiiKm": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
        "warpKm": { "type": "number" }
      }
    },
    "areaBandKm2": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
    "coastClass": { "enum": ["ice", "drowned-valley", "ridge-and-fjord", "karst-pavement",
                             "rain-shadow-erg", "delta-lobe", "fog-forest", "erosional-stack",
                             "cliff-fall", "volcanic-arc", "atoll-ring", "fjordland", "sandbar"] },
    "palette": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "landformKit": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "structuralIdea": { "type": "string" },
    "structures": {
      "type": "array",
      "items": {
        "type": "object", "required": ["kind"], "additionalProperties": false,
        "properties": {
          "kind": { "enum": ["inland-sea", "spine-ridge", "rift-valley", "volcanic-spine",
                             "ice-divide", "plateau", "delta-fan", "atoll-lagoon"] },
          "fromKm": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
          "toKm": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
          "atKm": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
          "radiusKm": { "type": "number" },
          "amplitude": { "type": "number" }
        }
      }
    },
    "register": { "enum": ["basin-anglic", "north-log", "moorstone", "sandtongue", "reedspeech"] },
    "levelBand": { "type": "array", "items": { "type": "integer" }, "minItems": 2, "maxItems": 2 }
  }
}
```

- [ ] **Step 4: Write the thirteen premise files**

Write one file per landmass. The full content for `c02` (Wealdmarch, the major that hosts the redrawn basin) is:

`content/world/premises/continent-02.json`
```json
{
  "id": "c02",
  "title": "Wealdmarch",
  "class": "major",
  "footprint": { "centreKm": [96, 148], "radiiKm": [58, 44], "warpKm": 12 },
  "areaBandKm2": [9900, 12100],
  "coastClass": "drowned-valley",
  "palette": ["meadow", "forest", "bramble", "marsh", "river", "lake", "rock", "upland", "built"],
  "landformKit": ["fluvial", "wetland", "lakes", "coastal", "erosional"],
  "structuralIdea": "An inland sea fed by the Meltwash with no ocean outlet — hosts the redrawn basin.",
  "structures": [
    { "kind": "inland-sea", "atKm": [104, 156], "radiusKm": 19, "amplitude": 0.55 },
    { "kind": "spine-ridge", "fromKm": [46, 118], "toKm": [70, 186], "amplitude": 0.32 }
  ],
  "register": "basin-anglic",
  "levelBand": [1, 40]
}
```

The remaining twelve follow the same shape, taking `title`, `class`, `netKm2` (→ `areaBandKm2` = ±10%), `interiorWaterKm2`, `register` and `levelBand` **verbatim from the manifest's `landmasses` table and the spec §6.3 table**, and `structuralIdea` verbatim from the spec's "Structural idea the climate model must satisfy" column:

| id | title | class | centreKm | radiiKm | coastClass | structures |
|---|---|---|---|---|---|---|
| c01 | Rimewall Cap | cap | `[200, 34]` | `[92, 26]` | `ice` | `ice-divide atKm [200,34] radiusKm 60 amplitude 0.45` |
| c03 | Coldreach | major | `[286, 112]` | `[52, 48]` | `ridge-and-fjord` | `spine-ridge fromKm [244,72] toKm [326,154] amplitude 0.60` |
| c04 | Stonemoor | major | `[306, 246]` | `[50, 50]` | `karst-pavement` | `plateau atKm [306,246] radiusKm 40 amplitude 0.28` |
| c05 | Thirstwold | major | `[176, 300]` | `[56, 42]` | `rain-shadow-erg` | `spine-ridge fromKm [128,272] toKm [136,336] amplitude 0.66` |
| c06 | Reedstrand | minor | `[70, 268]` | `[28, 22]` | `delta-lobe` | `delta-fan atKm [70,268] radiusKm 20 amplitude 0.20` |
| c07 | Driftholt | minor | `[46, 92]` | `[24, 24]` | `fog-forest` | `spine-ridge fromKm [34,74] toKm [58,112] amplitude 0.40` |
| c08 | Wracklow | minor | `[252, 344]` | `[28, 20]` | `erosional-stack` | `plateau atKm [252,344] radiusKm 16 amplitude 0.22` |
| c09 | Brightfall | chain | `[352, 186]` | `[16, 22]` | `cliff-fall` | `spine-ridge fromKm [348,168] toKm [356,206] amplitude 0.50` |
| c10 | Ashen Spar | chain | `[122, 356]` | `[26, 11]` | `volcanic-arc` | `volcanic-spine fromKm [98,352] toKm [148,362] amplitude 0.72` |
| c11 | Quillreef | chain | `[338, 66]` | `[15, 15]` | `atoll-ring` | `atoll-lagoon atKm [338,66] radiusKm 9 amplitude 0.50` |
| c12 | Skerryfast | chain | `[254, 44]` | `[20, 12]` | `fjordland` | `rift-valley fromKm [236,42] toKm [272,48] amplitude 0.38` |
| c13 | Loamspit | chain | `[40, 344]` | `[22, 12]` | `sandbar` | `delta-fan atKm [40,344] radiusKm 14 amplitude 0.16` |

`palette` and `landformKit` per landmass, taken from the spec's contrast-coverage line (§6.3):

| id | palette | landformKit |
|---|---|---|
| c01 | `ice, rock, scree, tundra, ocean` | `glacial, mountain, coastal` |
| c03 | `upland, forest, tundra, rock, scree, river, meadow` | `mountain, glacial, fluvial, coastal` |
| c04 | `karst, rock, forest, meadow, lake, river` | `karst, lakes, erosional, coastal` |
| c05 | `desert, badland, alkali, scree, rock, river` | `desert, erosional, mountain, fluvial` |
| c06 | `marsh, river, reef, meadow, lake` | `wetland, fluvial, coastal, lakes` |
| c07 | `forest, marsh, meadow, river, upland` | `fluvial, wetland, mountain, coastal` |
| c08 | `rock, scree, meadow, bramble, reef` | `erosional, coastal, island` |
| c09 | `rock, upland, forest, river` | `fluvial, mountain, coastal` |
| c10 | `lava, ash, rock, scree` | `volcanic, erosional, island` |
| c11 | `reef, meadow, ocean` | `island, oceanic, coastal` |
| c12 | `rock, ice, scree, upland, ocean` | `glacial, coastal, island` |
| c13 | `marsh, meadow, reef, river` | `wetland, coastal, island` |

Every `palette` entry must be a member of `BIOMES` (20 entries after Plan B) and every `landformKit` entry must be a lexicon `group`. Task 8's test asserts both joins.

- [ ] **Step 5: Write `tools/mapforge/lib/passes/mask.mjs`**

```js
// tools/mapforge/lib/passes/mask.mjs — P1: hard continental premise masks.
//
// WHY HARD: over 40 free seeds, landmasses >= 1000 km2 came out
// {1:9, 2:13, 3:11, 4:6, 5:1} and ZERO of 40 produced the required continent
// count (spec §4.1). Without a hard mask, c05 is not guaranteed to exist and
// every record bound there dangles. The mask is a signed distance to the
// footprint ellipse through a polynomial smoothstep, domain-warped by two
// fbm octaves so it stops reading as an ellipse.
import { fbm, smoothstep, falloff, q } from "../noise.mjs";
import { idx, cellCentreKm } from "../grid.mjs";

const WARP_FREQ = 0.011;   // ~90 km wavelength: warps the outline, not the pixel

// [0, 1]. 1 deep inside the footprint, 0 outside the falloff shell.
export function premiseMaskAt({ premise, xKm, yKm, stream }) {
  const [cx, cy] = premise.footprint.centreKm;
  const [rx, ry] = premise.footprint.radiiKm;
  const a = premise.footprint.warpKm;
  const wx = xKm + a * fbm({ x: xKm * WARP_FREQ, y: yKm * WARP_FREQ, stream, octaves: 2 });
  const wy = yKm + a * fbm({ x: (xKm + 512) * WARP_FREQ, y: (yKm + 512) * WARP_FREQ, stream, octaves: 2 });
  const nx = (wx - cx) / rx, ny = (wy - cy) / ry;
  const d = Math.sqrt(nx * nx + ny * ny);        // 1 at the ellipse boundary
  if (d >= 1) return 0;                          // hard mask: nothing outside the ellipse
  // Structural terms bite INSIDE the footprint only.
  let m = smoothstep(1 - d);
  for (const s of premise.structures ?? []) {
    if (s.kind === "inland-sea") {
      const dx = xKm - s.atKm[0], dy = yKm - s.atKm[1];
      const r = Math.sqrt(dx * dx + dy * dy) / s.radiusKm;
      if (r < 1) m -= s.amplitude * smoothstep(1 - r);      // subtract a lobe
    } else if (s.kind === "atoll-lagoon") {
      const dx = xKm - s.atKm[0], dy = yKm - s.atKm[1];
      const r = Math.sqrt(dx * dx + dy * dy) / s.radiusKm;
      if (r < 0.6) m -= s.amplitude * smoothstep(1 - r / 0.6);
    }
  }
  return m <= 0 ? 0 : m > 1 ? 1 : m;
}

// Writes grid.plate (argmax over masks, -1 where every mask is 0) and
// returns the winning mask value per cell plus a per-premise cell count.
// TIE-BREAK: lowest premise index wins, so the result never depends on
// iteration order of a Map or on file-system ordering.
export function applyPremiseMasks({ grid, premises, stream }) {
  const maskField = new Float32Array(grid.n);
  const plateArea = new Int32Array(premises.length);
  for (let cyi = 0; cyi < grid.h; cyi++) {
    for (let cxi = 0; cxi < grid.w; cxi++) {
      const i = idx({ grid, cx: cxi, cy: cyi });
      const [x, y] = cellCentreKm({ grid, cx: cxi, cy: cyi });
      let best = 0, bestK = -1;
      for (let k = 0; k < premises.length; k++) {
        const m = premiseMaskAt({ premise: premises[k], xKm: x, yKm: y, stream });
        if (m > best) { best = m; bestK = k; }
      }
      maskField[i] = best;
      grid.plate[i] = bestK;
      if (bestK >= 0) plateArea[bestK]++;
    }
  }
  return { maskField, plateArea };
}

// Exported for the elevation pass's rain-shadow term and for the report.
export const maskSummary = ({ premises, plateArea, cellAreaKm2 }) =>
  premises.map((p, k) => ({ id: p.id, cells: plateArea[k], km2: q(plateArea[k] * cellAreaKm2) }));
```

`falloff` is imported but unused in this first cut — remove the import if the reviewer flags it; do not leave a dead import in the committed file.

- [ ] **Step 6: Write `tools/mapforge/lib/passes/elevation.mjs`**

```js
// tools/mapforge/lib/passes/elevation.mjs — P2: elevation.
//
// HARD ORDERING (spec §7.3): anything that mutates elev runs BEFORE P3, or
// the ratio guarantee is void. This is the last pass that writes elev.
//
// The construction guarantees the ONE property rank selection depends on:
// every masked cell outranks every unmasked cell. Ocean floor is
// [-1, -0.5]; land is [0, 1] * mask. So selecting the k-th largest
// elevation can only ever pick ocean floor if the masks cannot supply k
// cells — which is exactly the premise-footprint bug P3's message names.
import { fbm, smoothstep, falloff } from "../noise.mjs";
import { idx, cellCentreKm } from "../grid.mjs";

const BASE_FREQ = 0.006;    // ~165 km wavelength — continental relief
const DETAIL_FREQ = 0.05;   // ~20 km wavelength  — hill and valley grain

// Distance from a point to a segment, no transcendentals beyond sqrt.
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const vv = vx * vx + vy * vy;
  let t = vv === 0 ? 0 : (wx * vx + wy * vy) / vv;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

export function buildElevation({ grid, premises, maskField, stream }) {
  for (let cyi = 0; cyi < grid.h; cyi++) {
    for (let cxi = 0; cxi < grid.w; cxi++) {
      const i = idx({ grid, cx: cxi, cy: cyi });
      const [x, y] = cellCentreKm({ grid, cx: cxi, cy: cyi });
      const m = maskField[i];
      if (m === 0) {
        // Ocean floor: a strictly negative band, so it can never outrank land.
        grid.elev[i] = -0.75 + 0.25 * fbm({ x: x * BASE_FREQ, y: y * BASE_FREQ, stream, octaves: 3 });
        continue;
      }
      const k = grid.plate[i];
      const premise = premises[k];
      // Base relief: fbm mapped to [0, 1], multiplied by the mask so the
      // coastal shell tapers to zero rather than ending in a cliff.
      const base = 0.5 + 0.5 * fbm({ x: x * BASE_FREQ, y: y * BASE_FREQ, stream, octaves: 6 });
      const detail = 0.5 + 0.5 * fbm({ x: x * DETAIL_FREQ, y: y * DETAIL_FREQ, stream, octaves: 4 });
      let e = 0.02 + 0.62 * m * (0.75 * base + 0.25 * detail);
      // Structural terms: ridged orogen along a spine, cones along an arc.
      for (const s of premise.structures ?? []) {
        if (s.kind === "spine-ridge" || s.kind === "rift-valley" || s.kind === "volcanic-spine") {
          const d = distToSegment(x, y, s.fromKm[0], s.fromKm[1], s.toKm[0], s.toKm[1]);
          const w = falloff({ d, k: 0.08 });                      // rational, not exp
          if (s.kind === "rift-valley") e -= s.amplitude * w * 0.5;
          else e += s.amplitude * w * (s.kind === "volcanic-spine" ? 1 : 0.8);
        } else if (s.kind === "plateau" || s.kind === "ice-divide" || s.kind === "delta-fan") {
          const dx = x - s.atKm[0], dy = y - s.atKm[1];
          const r = Math.sqrt(dx * dx + dy * dy) / s.radiusKm;
          if (r < 1) {
            const w = smoothstep(1 - r);
            e += s.amplitude * w * (s.kind === "delta-fan" ? -0.4 : 1);
          }
        }
      }
      // Clamp into [0.01, 1]: strictly above every ocean-floor value, and
      // bounded so rank selection compares a well-conditioned range.
      grid.elev[i] = e < 0.01 ? 0.01 : e > 1 ? 1 : e;
    }
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test 'tools/mapforge/tests/mask.test.mjs'`
Expected: PASS — 9 tests. In particular *"buildElevation raises masked ground above unmasked ground everywhere"* must pass: `minMaskedCore >= 0.01 > -0.5 >= maxOcean`.

- [ ] **Step 8: Commit**

```bash
git add content/schemas/premise.schema.json content/world/premises \
        tools/mapforge/lib/passes/mask.mjs tools/mapforge/lib/passes/elevation.mjs \
        tools/mapforge/tests/mask.test.mjs
git commit -m "feat: 13 hard premise masks, P1 continental mask, P2 elevation"
```

#### Task 3 quality gate

- [ ] **Step 9: Verify**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_content.mjs --only=spine
node scripts/check_spine_emit.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: all green; `world-budget:` lines still print; 47 files clean.

- [ ] **Step 10: Independent adversarial review**

Brief: *the premises are the load-bearing artefact of this whole plan — attack them. Do any two footprints overlap so badly that the argmax starves one premise (the "every premise claims ≥ 1 cell" test uses a 1 km grid — does it still hold at 0.5 km)? Do the footprint areas, summed, plausibly supply 262,400 land cells at the target sea level, or will P3's band check fire on day one? Is the ocean-floor band genuinely disjoint from the land band at every mask value, including `m` just above 0? Does `premiseMaskAt` return exactly 0 (not 1e-18) outside the ellipse, so `maskField[i] > 0` is a clean predicate? Check the twelve table-driven premise files against the spec §6.3 table line by line.*

- [ ] **Step 11: Refactor** — most likely finding: the footprint areas need re-scaling so the masked cell count comfortably exceeds 262,400. Adjust `radiiKm`, never the mask code.

- [ ] **Step 12: Re-verify** — re-run Step 9.

- [ ] **Step 13: Commit and report**

```bash
git add -A && git commit -m "refactor: premise footprint review findings"
git branch --show-current && git log --oneline -1
```

---

### Task 4: P3 — sea level by integer rank selection

This is the single most important correctness step in the plan. A float bisection was measured to break determinism: nudging all 640,000 elevations by **exactly 1 ULP** flipped 1 cell land↔sea, changed 1 D8 flow direction, and changed 1 accumulation value by 2,400% — and one flipped coastal cell adds or removes a coastline vertex, which changes a shoelace, which changes a `derived` digest, which reds every byte-comparison gate. Integer rank selection removes the flip entirely.

**Files:**
- Create: `tools/mapforge/lib/passes/sea-level.mjs`
- Test: `tools/mapforge/tests/rank-select.test.mjs`

**Interfaces:**
- Consumes: `content/world/manifest.json` (`grid.landCellBand`, `budget.grossLandPolygonKm2`)
- Produces: `selectSeaLevelByRank({ elev, targetLandCells }): { seaLevel, rank, landCells, landKm2, seaToLandRatio }`

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/rank-select.test.mjs`:

```js
// tools/mapforge/tests/rank-select.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectSeaLevelByRank, LAND_CELL_BAND } from "../lib/passes/sea-level.mjs";

// Build a synthetic elevation field with a known rank order.
function ramp(n) {
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) e[i] = i / n;   // strictly increasing, no ties
  return e;
}

test("selects the k-th largest exactly: landCells === targetLandCells", () => {
  const e = ramp(640000);
  const r = selectSeaLevelByRank({ elev: e, targetLandCells: 262400 });
  assert.equal(r.landCells, 262400);
  assert.equal(r.rank, 262400);
});

test("landKm2 and seaToLandRatio use the pinned 0.25 km2 cell area", () => {
  const e = ramp(640000);
  const r = selectSeaLevelByRank({ elev: e, targetLandCells: 256000 });
  assert.equal(r.landKm2, 64000);
  assert.equal(r.seaToLandRatio, 1.5);
});

test("a 1-ULP nudge of every elevation does not move a single cell", () => {
  const a = ramp(640000);
  const b = Float32Array.from(a, (v) => {
    // one ULP up in float32
    const buf = new ArrayBuffer(4); const f = new Float32Array(buf); const u = new Uint32Array(buf);
    f[0] = v; u[0] += 1; return f[0];
  });
  const ra = selectSeaLevelByRank({ elev: a, targetLandCells: 262400 });
  const rb = selectSeaLevelByRank({ elev: b, targetLandCells: 262400 });
  assert.equal(ra.landCells, rb.landCells);
  // the classification set must be identical, cell for cell
  let differing = 0;
  for (let i = 0; i < a.length; i++)
    if ((a[i] > ra.seaLevel) !== (b[i] > rb.seaLevel)) differing++;
  assert.equal(differing, 0, `${differing} cells flipped land<->sea on a 1-ULP nudge`);
});

test("it is a pure function — two calls on the same input agree exactly", () => {
  const e = ramp(64000);
  const a = selectSeaLevelByRank({ elev: e, targetLandCells: 26240 });
  const b = selectSeaLevelByRank({ elev: e, targetLandCells: 26240 });
  assert.deepEqual(a, b);
});

test("the legal band is the manifest's, verbatim", () => {
  assert.deepEqual(LAND_CELL_BAND, [228572, 290908]);
});

test("a broken premise (a flat plateau of ocean floor) fails with the premise message", () => {
  // 640,000 cells but only 1,000 above the ocean floor: rank selection would
  // have to reach into the flat -0.75 plateau to find 262,400 "land" cells.
  const e = new Float32Array(640000).fill(-0.75);
  for (let i = 0; i < 1000; i++) e[i] = 0.5;
  assert.throws(
    () => selectSeaLevelByRank({ elev: e, targetLandCells: 262400 }),
    /premise footprints/,
  );
});

test("the failure message names the band and refuses to suggest a reroll", () => {
  const e = new Float32Array(640000).fill(-0.75);
  for (let i = 0; i < 1000; i++) e[i] = 0.5;
  let msg = "";
  try { selectSeaLevelByRank({ elev: e, targetLandCells: 262400 }); } catch (err) { msg = err.message; }
  assert.match(msg, /228572/);
  assert.match(msg, /290908/);
  assert.ok(!/reroll/i.test(msg) || /do not reroll/i.test(msg), `message invites a reroll: ${msg}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'tools/mapforge/tests/rank-select.test.mjs'`
Expected: FAIL — `Cannot find module '.../lib/passes/sea-level.mjs'`.

- [ ] **Step 3: Write `tools/mapforge/lib/passes/sea-level.mjs`**

```js
// tools/mapforge/lib/passes/sea-level.mjs — P3: the land/sea threshold.
//
// INTEGER RANK SELECTION, never a float bisection. Measured (spec §7.3):
// nudging every one of 640,000 elevations by exactly 1 ULP under a bisected
// float threshold flipped 1 cell land<->sea, 1 D8 flow direction, and one
// accumulation value by 2400%. One flipped coastal cell adds or removes a
// coastline vertex -> changes a shoelace -> changes a committed `derived`
// digest -> reds every byte-comparison gate. Selecting the k-th largest
// VALUE and classifying with `elev > seaLevel` makes the classification a
// pure function of the rank ORDER, which a uniform ULP nudge preserves.
//
// This is a GENERATOR module, not a gate: it throws on an impossible
// premise. Gates never throw; generators must, or a broken premise silently
// produces a world with the wrong ratio. check_content.mjs's G-SEALAND is
// the gate half and it reports in-band.

export const CELL_AREA_KM2 = 0.25;          // 0.5 km x 0.5 km, pinned in budgets.json
export const FRAME_AREA_KM2 = 160000;
export const LAND_CELL_BAND = Object.freeze([228572, 290908]);   // manifest.grid.landCellBand

export function selectSeaLevelByRank({ elev, targetLandCells }) {
  const n = elev.length;
  if (!Number.isInteger(targetLandCells) || targetLandCells <= 0 || targetLandCells >= n)
    throw new Error(`sea-level: targetLandCells ${targetLandCells} is not a valid rank in ${n} cells`);

  // Ascending sort of a COPY. TypedArray.sort is numeric and total, so the
  // rank is exact; ties are the only way landCells can miss the target.
  const sorted = Float32Array.from(elev);
  sorted.sort();
  const rankIndex = n - targetLandCells - 1;          // the (k+1)-th largest
  const seaLevel = sorted[rankIndex];

  let landCells = 0;
  for (let i = 0; i < n; i++) if (elev[i] > seaLevel) landCells++;

  const landKm2 = landCells * CELL_AREA_KM2;
  const seaKm2 = FRAME_AREA_KM2 - landKm2;
  const seaToLandRatio = landKm2 === 0 ? Infinity : seaKm2 / landKm2;

  if (landCells < LAND_CELL_BAND[0] || landCells > LAND_CELL_BAND[1])
    throw new Error(
      `sea-level: rank selection produced ${landCells} land cells, band is ` +
      `${LAND_CELL_BAND[0]}-${LAND_CELL_BAND[1]} (land ${landKm2.toFixed(1)} km2, ` +
      `sea ${seaKm2.toFixed(1)} km2, ratio ${seaToLandRatio.toFixed(2)}). ` +
      `Rank selection cannot miss its target unless the elevation field has fewer ` +
      `distinct above-floor values than the target rank — the premise footprints are ` +
      `wrong (too small, or overlapping into one plate). Widen content/world/premises/*.json ` +
      `footprint radii; do not reroll toward the target and do not widen the band.`,
    );

  return { seaLevel, rank: targetLandCells, landCells, landKm2, seaToLandRatio };
}

// Classify in place: sets FLAG.SEA on every cell at or below sea level.
// Separated from selection so a caller can inspect the threshold first.
export function classifySea({ grid, seaLevel, FLAG }) {
  for (let i = 0; i < grid.n; i++)
    if (!(grid.elev[i] > seaLevel)) grid.flags[i] |= FLAG.SEA;

  // depthM: the grid's 0..1 elevation scaled to metres below sea level. Plan
  // D's pinned harbour records declare `water.minDepthM`, so a port pin that
  // lands on a 2 m shelf must FAIL rather than silently resolve.
  for (let i = 0; i < grid.n; i++)
    grid.depthM[i] = (grid.flags[i] & FLAG.SEA) === 0 ? -1 : (seaLevel - grid.elev[i]) * 1000;

  // fetchKm: for each SEA cell, the longest unobstructed run of sea in the
  // four axis directions — the shelter test that is "the term that does the
  // real work" in settlement scoring (spec §6.5) and the thing Gildmark's
  // `shelterFetchKmMax: 15` is measured against. Four linear sweeps, O(n).
  const runL = new Int32Array(grid.n), runR = new Int32Array(grid.n);
  const runU = new Int32Array(grid.n), runD = new Int32Array(grid.n);
  const sea = (i) => (grid.flags[i] & FLAG.SEA) !== 0;
  for (let y = 0; y < grid.h; y++) {
    let run = 0;
    for (let x = 0; x < grid.w; x++) { const i = y * grid.w + x; run = sea(i) ? run + 1 : 0; runL[i] = run; }
    run = 0;
    for (let x = grid.w - 1; x >= 0; x--) { const i = y * grid.w + x; run = sea(i) ? run + 1 : 0; runR[i] = run; }
  }
  for (let x = 0; x < grid.w; x++) {
    let run = 0;
    for (let y = 0; y < grid.h; y++) { const i = y * grid.w + x; run = sea(i) ? run + 1 : 0; runU[i] = run; }
    run = 0;
    for (let y = grid.h - 1; y >= 0; y--) { const i = y * grid.w + x; run = sea(i) ? run + 1 : 0; runD[i] = run; }
  }
  for (let i = 0; i < grid.n; i++) {
    if (!sea(i)) { grid.fetchKm[i] = -1; continue; }
    const cells = Math.max(runL[i] + runR[i] - 1, runU[i] + runD[i] - 1);
    grid.fetchKm[i] = cells * grid.cellKm;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test 'tools/mapforge/tests/rank-select.test.mjs'`
Expected: PASS — 7 tests.

- [ ] **Step 5: Prove the band on the real premise field (the acceptance criterion, not a test)**

Run this one-off and paste its output into the task report:

```bash
node -e '
const {readFileSync,readdirSync}=require("fs");
(async()=>{
const {makeGrid,FLAG}=await import("./tools/mapforge/lib/grid.mjs");
const {applyPremiseMasks}=await import("./tools/mapforge/lib/passes/mask.mjs");
const {buildElevation}=await import("./tools/mapforge/lib/passes/elevation.mjs");
const {selectSeaLevelByRank,classifySea}=await import("./tools/mapforge/lib/passes/sea-level.mjs");
const m=JSON.parse(readFileSync("content/world/manifest.json","utf8"));
const P=readdirSync("content/world/premises").filter(f=>f.endsWith(".json")).sort()
  .map(f=>JSON.parse(readFileSync("content/world/premises/"+f,"utf8")));
const g=makeGrid({w:800,h:800,cellKm:0.5});
const t0=Date.now();
const {maskField,plateArea}=applyPremiseMasks({grid:g,premises:P,stream:"d9a0051d32afab59"});
buildElevation({grid:g,premises:P,maskField,stream:"d9a0051d32afab59"});
const target=m.budget.grossLandPolygonKm2/0.25;
const r=selectSeaLevelByRank({elev:g.elev,targetLandCells:target});
classifySea({grid:g,seaLevel:r.seaLevel,FLAG});
console.log("target gross land cells:",target);
console.log(r);
console.log("masked cells per premise:",Array.from(plateArea));
console.log("elapsed ms:",Date.now()-t0);
})();'
```
Expected: `landCells: 262400`, `landKm2: 65600`, `seaToLandRatio: 1.4390…` (this is the **gross** ratio; P7 carves 1,600 km² of interior water and net lands on 64,000 / 1.500), every `plateArea` entry > 0, elapsed under 4,000 ms.

- [ ] **Step 6: Commit**

```bash
git add tools/mapforge/lib/passes/sea-level.mjs tools/mapforge/tests/rank-select.test.mjs
git commit -m "feat: P3 sea level by integer rank selection"
```

#### Task 4 quality gate

- [ ] **Step 7: Verify**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_spine_emit.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
```

- [ ] **Step 8: Independent adversarial review**

Brief: *the ULP test is the point of this task — is it actually testing what it claims? A uniform ULP nudge preserves rank order trivially; construct a nudge that does NOT (nudge only half the cells) and confirm the failure mode is a controlled `landCells` miss rather than a silent flip. Attack the tie case: build an elevation field with 100,000 identical values straddling the rank index and confirm the band check catches it with a message a human can act on. Is `Float32Array.from(elev)` a genuine copy (it must not sort the caller's array in place)? Is `!(elev[i] > seaLevel)` the right classification for NaN, and can NaN reach here?*

- [ ] **Step 9: Refactor** — add the tie-case and half-nudge tests the review asks for; add an explicit NaN guard if one is warranted.

- [ ] **Step 10: Re-verify** — re-run Step 7 and re-run the Step 5 probe; the numbers must be unchanged.

- [ ] **Step 11: Commit and report**

```bash
git add -A && git commit -m "refactor: rank selection review findings"
git branch --show-current && git log --oneline -1
```

---

### Task 5: `arcs.mjs` — planar arc topology, one-shot simplification, ring assembly

Tracing each region's boundary independently and simplifying it produces **slivers**: two neighbours simplify their shared edge differently and the boundary splits. The fix is a planar arc topology — every boundary segment belongs to exactly one arc, each arc is shared by exactly two owners, and each arc is simplified **once**. Every kept vertex is a grid corner (an exact multiple of 0.5 km, exactly representable in binary), so a shared vertex is **bit-identical** in both neighbours' polygons.

**Files:**
- Create: `tools/mapforge/lib/arcs.mjs`
- Test: `tools/mapforge/tests/arcs.test.mjs`

**Interfaces:**
- Consumes: `makeGrid`, `idx` (Task 2); `hashNoise2D`, `q` (Task 2); `shoelaceArea`, `selfIntersects` from `scripts/lib/spine.mjs:73,114`
- Produces:
```js
/** @typedef {{id:string, left:number, right:number, points:Array<[number,number]>}} Arc */
export function extractArcs({ owner, w, h, cellKm }): { arcs: Arc[], nodes: Array<[number,number]> }
export function simplifyArc({ points, epsilonKm }): Array<[number,number]>
export function assembleRings({ arcs, ownerId }): Array<Array<[number,number]>>
export function fractalise({ arc, amplitudeKm, levels, stream }): Array<[number,number]>
export const DP_EPSILON_KM: 0.35
```

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/arcs.test.mjs`:

```js
// tools/mapforge/tests/arcs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractArcs, simplifyArc, assembleRings, fractalise, DP_EPSILON_KM } from "../lib/arcs.mjs";
import { shoelaceArea, selfIntersects } from "../../../scripts/lib/spine.mjs";

// A 10x10 owner field: a 4x4 block of owner 0 with a 2x4 block of owner 1
// glued to its right edge. Everything else is -1 (sea).
function twoBlocks() {
  const w = 10, h = 10;
  const owner = new Int16Array(w * h).fill(-1);
  for (let y = 3; y < 7; y++) {
    for (let x = 2; x < 6; x++) owner[y * w + x] = 0;
    for (let x = 6; x < 8; x++) owner[y * w + x] = 1;
  }
  return { owner, w, h };
}

test("extractArcs emits arcs whose endpoints are exact grid corners", () => {
  const { owner, w, h } = twoBlocks();
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  assert.ok(arcs.length >= 3, `expected at least 3 arcs, got ${arcs.length}`);
  for (const a of arcs)
    for (const [x, y] of a.points) {
      assert.equal(x % 0.5, 0, `x=${x} is not a grid corner`);
      assert.equal(y % 0.5, 0, `y=${y} is not a grid corner`);
    }
});

test("every arc is shared by exactly two owners, and left !== right", () => {
  const { owner, w, h } = twoBlocks();
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  for (const a of arcs) assert.notEqual(a.left, a.right, `arc ${a.id} has the same owner both sides`);
});

test("the shared arc between owner 0 and owner 1 is ONE arc, listed once", () => {
  const { owner, w, h } = twoBlocks();
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const shared = arcs.filter((a) => (a.left === 0 && a.right === 1) || (a.left === 1 && a.right === 0));
  assert.equal(shared.length, 1, `shared boundary split into ${shared.length} arcs`);
});

test("assembleRings closes a ring per owner with strictly positive shoelace", () => {
  const { owner, w, h } = twoBlocks();
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  for (const id of [0, 1]) {
    const rings = assembleRings({ arcs, ownerId: id });
    assert.equal(rings.length, 1, `owner ${id} produced ${rings.length} rings`);
    const r = rings[0];
    assert.ok(r.length >= 4, `owner ${id} ring has ${r.length} points`);
    assert.ok(shoelaceArea({ points: r }) > 0, `owner ${id} ring is wound backwards`);
    assert.ok(!selfIntersects({ points: r }), `owner ${id} ring self-intersects`);
    const [fx, fy] = r[0], [lx, ly] = r[r.length - 1];
    assert.ok(fx !== lx || fy !== ly, `owner ${id} ring is CLOSED — author OPEN rings`);
  }
});

test("the shared boundary vertices are BIT-IDENTICAL in both owners' rings", () => {
  const { owner, w, h } = twoBlocks();
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const r0 = assembleRings({ arcs, ownerId: 0 })[0];
  const r1 = assembleRings({ arcs, ownerId: 1 })[0];
  const key = ([x, y]) => `${x},${y}`;
  const s0 = new Set(r0.map(key)), s1 = new Set(r1.map(key));
  const shared = [...s0].filter((k) => s1.has(k));
  assert.ok(shared.length >= 2, `only ${shared.length} shared vertices — the boundary split`);
});

test("assembled ring areas sum to the exact owner cell area", () => {
  const { owner, w, h } = twoBlocks();
  const { arcs } = extractArcs({ owner, w, h, cellKm: 0.5 });
  const cellArea = 0.25;
  for (const [id, cells] of [[0, 16], [1, 8]]) {
    const rings = assembleRings({ arcs, ownerId: id });
    const area = rings.reduce((s, r) => s + shoelaceArea({ points: r }), 0);
    assert.equal(area, cells * cellArea, `owner ${id}: ring area ${area} !== census ${cells * cellArea}`);
  }
});

test("simplifyArc pins the endpoints and never returns fewer than 2 points", () => {
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push([i * 0.5, i % 2 === 0 ? 0 : 0.05]);   // sub-epsilon zigzag
  const out = simplifyArc({ points: pts, epsilonKm: DP_EPSILON_KM });
  assert.deepEqual(out[0], pts[0]);
  assert.deepEqual(out[out.length - 1], pts[pts.length - 1]);
  assert.equal(out.length, 2, "a sub-epsilon zigzag must collapse to its endpoints");
});

test("simplifyArc keeps a feature larger than epsilon", () => {
  const pts = [[0, 0], [5, 0], [5, 4], [10, 4], [10, 0], [15, 0]];
  const out = simplifyArc({ points: pts, epsilonKm: DP_EPSILON_KM });
  assert.deepEqual(out, pts);
});

test("DP_EPSILON_KM is the pinned 0.35", () => { assert.equal(DP_EPSILON_KM, 0.35); });

test("fractalise preserves endpoints, stays within amplitude, and never self-intersects", () => {
  const arc = { id: "a1", left: 0, right: -1, points: [[0, 0], [8, 0], [16, 4], [24, 4]] };
  const out = fractalise({ arc, amplitudeKm: 0.25, levels: 3, stream: "d9a0051d32afab59" });
  assert.deepEqual(out[0], arc.points[0]);
  assert.deepEqual(out[out.length - 1], arc.points[arc.points.length - 1]);
  assert.ok(out.length > arc.points.length, "fractalise added no detail");
  assert.ok(!selfIntersects({ points: [...out, [24, -30], [0, -30]] }), "fractalised arc self-intersects");
});

test("fractalise is deterministic", () => {
  const arc = { id: "a1", left: 0, right: -1, points: [[0, 0], [8, 0], [16, 4], [24, 4]] };
  const a = fractalise({ arc, amplitudeKm: 0.25, levels: 3, stream: "d9a0051d32afab59" });
  const b = fractalise({ arc, amplitudeKm: 0.25, levels: 3, stream: "d9a0051d32afab59" });
  assert.deepEqual(a, b);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'tools/mapforge/tests/arcs.test.mjs'`
Expected: FAIL — `Cannot find module '.../lib/arcs.mjs'`.

- [ ] **Step 3: Write `tools/mapforge/lib/arcs.mjs`**

```js
// tools/mapforge/lib/arcs.mjs — P4/P14: planar arc topology.
//
// WHY ARCS AND NOT RINGS: tracing each region's boundary and simplifying it
// independently produces SLIVERS — two neighbours simplify their shared edge
// differently and the boundary splits. Here every boundary segment belongs
// to exactly one arc, each arc is shared by exactly two owners, and each arc
// is simplified ONCE (spec §7.4). Every kept vertex is a grid corner, an
// exact multiple of cellKm, so a shared vertex is BIT-IDENTICAL in both
// neighbours' polygons.
//
// abs() appears nowhere for winding: a negative signed shoelace is a G-POLY
// failure, not a magnitude (scripts/lib/spine.mjs:11-14).
import { hashNoise2D } from "./noise.mjs";
import { shoelaceArea, selfIntersects } from "../../../scripts/lib/spine.mjs";

export const DP_EPSILON_KM = 0.35;

const cornerKey = (cx, cy) => `${cx}:${cy}`;
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// ── stage 1: unit boundary edges ───────────────────────────────────────────
// One sweep. For each cell, compare with its RIGHT and DOWN neighbour; a
// difference emits the unit edge between them, expressed in CORNER indices.
// Cells outside the field are owner -1 (sea/void), so the frame edge also
// produces arcs where land touches it.
function unitEdges({ owner, w, h }) {
  const edges = [];
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : owner[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = at(x, y);
      const r = at(x + 1, y);
      if (o !== r) edges.push({ a: [x + 1, y], b: [x + 1, y + 1], left: o, right: r });
      const d = at(x, y + 1);
      if (o !== d) edges.push({ a: [x, y + 1], b: [x + 1, y + 1], left: d, right: o });
    }
  }
  // Also the top and left frame boundaries, which the loop above never visits.
  for (let x = 0; x < w; x++) { const o = at(x, 0); if (o !== -1) edges.push({ a: [x, 0], b: [x + 1, 0], left: -1, right: o }); }
  for (let y = 0; y < h; y++) { const o = at(0, y); if (o !== -1) edges.push({ a: [0, y], b: [0, y + 1], left: o, right: -1 }); }
  return edges;
}

// ── stage 2: chain edges into arcs ─────────────────────────────────────────
// A NODE is a corner where more than two edges meet, or where edges of more
// than one owner-pair meet. Arcs run node-to-node; a boundary loop with no
// node at all becomes one closed arc starting at its lexicographically
// smallest corner (deterministic).
export function extractArcs({ owner, w, h, cellKm }) {
  const edges = unitEdges({ owner, w, h });
  const byCorner = new Map();       // cornerKey -> edge indices
  for (let i = 0; i < edges.length; i++) {
    for (const c of [edges[i].a, edges[i].b]) {
      const k = cornerKey(c[0], c[1]);
      if (!byCorner.has(k)) byCorner.set(k, []);
      byCorner.get(k).push(i);
    }
  }
  const nodeSet = new Set();
  for (const [k, list] of byCorner) {
    const pairs = new Set(list.map((i) => pairKey(edges[i].left, edges[i].right)));
    if (list.length !== 2 || pairs.size !== 1) nodeSet.add(k);
  }

  const used = new Uint8Array(edges.length);
  const arcs = [];
  const toKm = (c) => [c[0] * cellKm, c[1] * cellKm];

  // Walk from `startCorner` along unused edges of the same owner pair until
  // a node or a closed loop is reached.
  const walk = (startIdx, startCorner) => {
    const pk = pairKey(edges[startIdx].left, edges[startIdx].right);
    const pts = [startCorner];
    let cur = startCorner, ei = startIdx;
    for (;;) {
      used[ei] = 1;
      const e = edges[ei];
      const next = cornerKey(e.a[0], e.a[1]) === cornerKey(cur[0], cur[1]) ? e.b : e.a;
      pts.push(next);
      cur = next;
      const k = cornerKey(cur[0], cur[1]);
      if (nodeSet.has(k)) break;
      const cand = (byCorner.get(k) ?? [])
        .filter((i) => !used[i] && pairKey(edges[i].left, edges[i].right) === pk)
        .sort((a, b) => a - b);
      if (cand.length === 0) break;
      ei = cand[0];
    }
    // Orient by the FIRST edge so `left`/`right` are stable along the arc.
    const first = edges[startIdx];
    const forward = cornerKey(first.a[0], first.a[1]) === cornerKey(startCorner[0], startCorner[1]);
    return { left: forward ? first.left : first.right, right: forward ? first.right : first.left, pts };
  };

  // Deterministic seeding: node corners first (sorted), then any remaining
  // unused edge (sorted by index) for node-free loops.
  const nodeList = [...nodeSet].sort();
  const startsFrom = (k) => (byCorner.get(k) ?? []).filter((i) => !used[i]).sort((a, b) => a - b);
  for (const k of nodeList) {
    const [sx, sy] = k.split(":").map(Number);
    for (;;) {
      const cand = startsFrom(k);
      if (cand.length === 0) break;
      const r = walk(cand[0], [sx, sy]);
      arcs.push({ id: `arc-${arcs.length}`, left: r.left, right: r.right, points: r.pts.map(toKm) });
    }
  }
  for (let i = 0; i < edges.length; i++) {
    if (used[i]) continue;
    const r = walk(i, edges[i].a);
    arcs.push({ id: `arc-${arcs.length}`, left: r.left, right: r.right, points: r.pts.map(toKm) });
  }
  return { arcs, nodes: nodeList.map((k) => { const [x, y] = k.split(":").map(Number); return [x * cellKm, y * cellKm]; }) };
}

// ── stage 3: Douglas-Peucker, ONCE per arc ─────────────────────────────────
export function simplifyArc({ points, epsilonKm = DP_EPSILON_KM }) {
  if (points.length <= 2) return points.map((p) => [...p]);
  const keep = new Uint8Array(points.length);
  keep[0] = 1; keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    if (hi - lo < 2) continue;
    const [ax, ay] = points[lo], [bx, by] = points[hi];
    const vx = bx - ax, vy = by - ay;
    const vv = vx * vx + vy * vy;
    let best = -1, bestD = -1;
    for (let i = lo + 1; i < hi; i++) {
      const [px, py] = points[i];
      let t = vv === 0 ? 0 : ((px - ax) * vx + (py - ay) * vy) / vv;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
      const d = Math.sqrt(dx * dx + dy * dy);
      // TIE-BREAK: strictly greater, so the LOWEST index wins a tie.
      if (d > bestD) { bestD = d; best = i; }
    }
    if (bestD > epsilonKm) { keep[best] = 1; stack.push([lo, best], [best, hi]); }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push([...points[i]]);
  return out;
}

// ── stage 4: chain arcs into rings for one owner ───────────────────────────
// Orients each arc so `ownerId` is on the LEFT, chains head-to-tail, drops
// the repeated closing point (OPEN rings), and fixes winding by shoelace
// sign — never by abs().
export function assembleRings({ arcs, ownerId }) {
  const mine = [];
  for (const a of arcs) {
    if (a.left === ownerId) mine.push({ id: a.id, points: a.points });
    else if (a.right === ownerId) mine.push({ id: a.id, points: [...a.points].reverse() });
  }
  const rings = [];
  const used = new Set();
  const key = ([x, y]) => `${x},${y}`;
  // Deterministic start: lowest arc id not yet used.
  const order = mine.map((_, i) => i).sort((i, j) => (mine[i].id < mine[j].id ? -1 : 1));
  for (const start of order) {
    if (used.has(start)) continue;
    used.add(start);
    const pts = [...mine[start].points];
    for (;;) {
      const tail = key(pts[pts.length - 1]);
      if (tail === key(pts[0])) break;
      let nextI = -1;
      for (const i of order) {
        if (used.has(i)) continue;
        if (key(mine[i].points[0]) === tail) { nextI = i; break; }
      }
      if (nextI === -1) break;            // open chain: an owner touching the frame
      used.add(nextI);
      pts.push(...mine[nextI].points.slice(1));
    }
    if (key(pts[pts.length - 1]) === key(pts[0])) pts.pop();   // OPEN ring
    if (pts.length < 3) continue;
    if (shoelaceArea({ points: pts }) < 0) pts.reverse();
    rings.push(pts);
  }
  return rings;
}

// ── stage 5: fractal coastline detail, applied to the ARC not the ring ─────
// So land and sea move together. 3 levels, amplitude halving, perpendicular
// midpoint displacement from integer-hash noise. On self-intersection the
// amplitude halves and the whole arc is retried, max 4 attempts (spec §7.4).
export function fractalise({ arc, amplitudeKm = 0.25, levels = 3, stream }) {
  let amp = amplitudeKm;
  for (let attempt = 0; attempt < 4; attempt++) {
    let pts = arc.points.map((p) => [...p]);
    let a = amp;
    for (let lv = 0; lv < levels; lv++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          const n = hashNoise2D({ x: mx * 7 + lv * 131, y: my * 7 + lv * 131, stream });
          out.push([mx + (-dy / len) * a * n, my + (dx / len) * a * n]);
        }
        out.push([x2, y2]);
      }
      pts = out;
      a = a / 2;
    }
    if (!selfIntersects({ points: pts })) return pts;
    amp = amp / 2;
  }
  return arc.points.map((p) => [...p]);   // give up: keep the clean arc
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test 'tools/mapforge/tests/arcs.test.mjs'`
Expected: PASS — 11 tests. The two that matter most are *"the shared arc … is ONE arc"* and *"assembled ring areas sum to the exact owner cell area"*: together they are the sliver-free proof.

- [ ] **Step 5: Commit**

```bash
git add tools/mapforge/lib/arcs.mjs tools/mapforge/tests/arcs.test.mjs
git commit -m "feat: planar arc topology with one-shot simplification"
```

#### Task 5 quality gate

- [ ] **Step 6: Verify**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_spine_emit.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
```

- [ ] **Step 7: Independent adversarial review**

Brief: *this is the geometry that every committed ring comes from — assume it is wrong until proven otherwise. Build an owner field with a diagonal touch (owner 0 at (0,0) and (1,1), owner 1 at (1,0) and (0,1)) and check `assembleRings` does not produce a self-intersecting bowtie. Build an owner field with a HOLE (owner 0 surrounding owner 1 completely) and check owner 0 gets two rings, the outer one positive; state explicitly what the caller must do with the inner ring, because `G-POLY` has no hole concept. Confirm `simplifyArc` is called at most once per arc anywhere in the file. Confirm `fractalise`'s self-intersection retry cannot loop forever and that its give-up path is reachable and correct. Confirm arc ids are stable across two runs on the same owner field.*

- [ ] **Step 8: Refactor** — add the diagonal-touch and hole tests; if the hole case is real for the 13 landmasses (Wealdmarch's inland sea *is* a hole), decide and document the rule now: **interior water is carved from the fabric census, and the trunk polygon is the OUTER ring only** — `G-TRUNK-AREA` compares against gross land, which is exactly what an outer ring encloses.

- [ ] **Step 9: Re-verify** — re-run Step 6.

- [ ] **Step 10: Commit and report**

```bash
git add -A && git commit -m "refactor: arc topology review findings"
git branch --show-current && git log --oneline -1
```

---

### Task 6: `hydrology.mjs`, P5 winds, P6 flow, P7 lakes/deltas/glaciers

This task is where the 1,600 km² of interior water comes from, so it is what turns the **gross** ratio from Task 4 into the **net** 1.500 the manifest demands.

**Files:**
- Create: `tools/mapforge/lib/hydrology.mjs`
- Create: `tools/mapforge/lib/passes/winds.mjs`
- Create: `tools/mapforge/lib/passes/water.mjs`
- Test: `tools/mapforge/tests/hydrology.test.mjs`

**Interfaces:**
- Consumes: `makeGrid`, `FLAG`, `D8`, `idx`, `cellCentreKm` (Task 2); `fbm`, `falloff`, `UNIT_VECTORS` (Task 2)
- Produces:
```js
export function priorityFlood({ elev, w, h }): Float32Array          // filled elevation, no interior sinks
export function d8FlowDir({ elev, w, h }): Int8Array                 // 0..7 into D8, -1 at an outlet
export function flowAccumulate({ flowDir, w, h }): Float32Array      // cells drained, >= 1
// winds.mjs
export function applyWinds({ grid, premises, stream }): void         // writes grid.moist and grid.temp
// water.mjs
export function carveWater({ grid, premises, filled, manifest }):
  { lakeCells: number, deltaCells: number, glacierCells: number, riverCells: number }
```

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/hydrology.test.mjs`:

```js
// tools/mapforge/tests/hydrology.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { priorityFlood, d8FlowDir, flowAccumulate } from "../lib/hydrology.mjs";
import { makeGrid, FLAG, idx } from "../lib/grid.mjs";
import { applyWinds } from "../lib/passes/winds.mjs";
import { carveWater } from "../lib/passes/water.mjs";

// A 5x5 bowl: a rim of 1.0 with a 0.2 pit at the centre, one 0.0 outlet.
function bowl() {
  const w = 5, h = 5;
  const elev = new Float32Array(w * h).fill(1.0);
  elev[2 * w + 2] = 0.2;
  elev[2 * w + 1] = 0.5;
  elev[2 * w + 0] = 0.0;    // the outlet, on the frame edge
  return { elev, w, h };
}

test("priorityFlood removes every interior sink but never lowers a cell", () => {
  const { elev, w, h } = bowl();
  const filled = priorityFlood({ elev, w, h });
  for (let i = 0; i < elev.length; i++) assert.ok(filled[i] >= elev[i], `cell ${i} was lowered`);
  // the pit must now be at least as high as its lowest neighbour path out
  assert.ok(filled[2 * w + 2] > elev[2 * w + 2], "the pit was not filled");
});

test("priorityFlood leaves an already-drained field untouched", () => {
  const w = 4, h = 4;
  const elev = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) elev[y * w + x] = (x + y) / 8;
  const filled = priorityFlood({ elev, w, h });
  assert.deepEqual(Array.from(filled), Array.from(elev));
});

test("priorityFlood is deterministic", () => {
  const a = bowl(), b = bowl();
  assert.deepEqual(Array.from(priorityFlood(a)), Array.from(priorityFlood(b)));
});

test("d8FlowDir points downhill everywhere it points at all", () => {
  const { elev, w, h } = bowl();
  const filled = priorityFlood({ elev, w, h });
  const dir = d8FlowDir({ elev: filled, w, h });
  const D = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = dir[y * w + x];
    if (d < 0) continue;
    const nx = x + D[d][0], ny = y + D[d][1];
    assert.ok(nx >= 0 && ny >= 0 && nx < w && ny < h, `flow leaves the grid at ${x},${y}`);
    assert.ok(filled[ny * w + nx] <= filled[y * w + x], `uphill flow at ${x},${y}`);
  }
});

test("flowAccumulate gives every cell at least 1 and conserves the total", () => {
  const { elev, w, h } = bowl();
  const filled = priorityFlood({ elev, w, h });
  const dir = d8FlowDir({ elev: filled, w, h });
  const acc = flowAccumulate({ flowDir: dir, w, h });
  for (let i = 0; i < acc.length; i++) assert.ok(acc[i] >= 1, `cell ${i} accumulated ${acc[i]}`);
  // every cell's own contribution appears exactly once at some outlet
  let outletTotal = 0;
  for (let i = 0; i < acc.length; i++) if (dir[i] < 0) outletTotal += acc[i];
  assert.equal(outletTotal, w * h);
});

test("flowAccumulate is independent of cell visiting order", () => {
  const { elev, w, h } = bowl();
  const filled = priorityFlood({ elev, w, h });
  const dir = d8FlowDir({ elev: filled, w, h });
  assert.deepEqual(Array.from(flowAccumulate({ flowDir: dir, w, h })),
                   Array.from(flowAccumulate({ flowDir: dir, w, h })));
});

test("applyWinds produces a rain shadow: the lee of a ridge is drier than its windward side", () => {
  const grid = makeGrid({ w: 60, h: 20, cellKm: 2 });
  for (let y = 0; y < 20; y++) for (let x = 0; x < 60; x++) {
    const i = idx({ grid, cx: x, cy: y });
    grid.elev[i] = x === 30 ? 1.0 : 0.2;   // a single north-south wall at x = 30
    grid.plate[i] = 0;
  }
  const premises = [{ id: "c01", title: "T", class: "major", palette: ["meadow"],
                      footprint: { centreKm: [60, 20], radiiKm: [60, 20], warpKm: 0 },
                      structures: [] }];
  applyWinds({ grid, premises, stream: "d9a0051d32afab59" });
  const windward = grid.moist[idx({ grid, cx: 28, cy: 10 })];
  const lee = grid.moist[idx({ grid, cx: 32, cy: 10 })];
  assert.ok(windward > lee, `no rain shadow: windward ${windward} <= lee ${lee}`);
});

test("carveWater carves interior water close to the manifest's budget", () => {
  const grid = makeGrid({ w: 200, h: 200, cellKm: 2 });
  // A synthetic continent: a raised disc with a depression in it.
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
    const i = idx({ grid, cx: x, cy: y });
    const dx = x - 100, dy = y - 100;
    const r = Math.sqrt(dx * dx + dy * dy);
    grid.elev[i] = r < 70 ? 0.6 - r / 400 : -0.7;
    if (r >= 70) grid.flags[i] |= FLAG.SEA;
    grid.plate[i] = r < 70 ? 0 : -1;
    grid.moist[i] = 0.6;
    grid.temp[i] = 0.5;
  }
  const filled = priorityFlood({ elev: grid.elev, w: grid.w, h: grid.h });
  const premises = [{ id: "c01", title: "T", class: "major", palette: ["meadow", "lake", "river"],
                      footprint: { centreKm: [200, 200], radiiKm: [140, 140], warpKm: 0 },
                      structures: [{ kind: "inland-sea", atKm: [200, 200], radiusKm: 40, amplitude: 0.5 }] }];
  const manifest = JSON.parse(JSON.stringify({ budget: { interiorWaterKm2: 400 }, grid: { cellKm: 2 } }));
  const r = carveWater({ grid, premises, filled, manifest });
  const carvedKm2 = r.lakeCells * 4;
  assert.ok(carvedKm2 > 0, "no interior water was carved");
  assert.ok(Math.abs(carvedKm2 - 400) / 400 < 0.25,
    `carved ${carvedKm2} km2 against a 400 km2 budget — more than 25% out`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'tools/mapforge/tests/hydrology.test.mjs'`
Expected: FAIL — `Cannot find module '.../lib/hydrology.mjs'`.

- [ ] **Step 3: Write `tools/mapforge/lib/hydrology.mjs`**

```js
// tools/mapforge/lib/hydrology.mjs — P6: priority-flood, D8, accumulation.
//
// Determinism note: every heap and every sort in this file breaks ties on
// the CELL INDEX. That is what makes the output independent of insertion
// order — the same rule the region partition follows (spec §7.3, P9).
import { D8 } from "./grid.mjs";

// A binary min-heap keyed (value, index). Explicit, because Array.sort on
// every push is O(n^2 log n) at 640,000 cells.
class MinHeap {
  constructor() { this.v = []; this.i = []; }
  get size() { return this.v.length; }
  less(a, b) { return this.v[a] < this.v[b] || (this.v[a] === this.v[b] && this.i[a] < this.i[b]); }
  swap(a, b) {
    const tv = this.v[a]; this.v[a] = this.v[b]; this.v[b] = tv;
    const ti = this.i[a]; this.i[a] = this.i[b]; this.i[b] = ti;
  }
  push(value, index) {
    this.v.push(value); this.i.push(index);
    let c = this.v.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (!this.less(c, p)) break; this.swap(c, p); c = p; }
  }
  pop() {
    const value = this.v[0], index = this.i[0];
    const lv = this.v.pop(), li = this.i.pop();
    if (this.v.length) {
      this.v[0] = lv; this.i[0] = li;
      let p = 0;
      for (;;) {
        const l = 2 * p + 1, r = l + 1;
        let m = p;
        if (l < this.v.length && this.less(l, m)) m = l;
        if (r < this.v.length && this.less(r, m)) m = r;
        if (m === p) break;
        this.swap(p, m); p = m;
      }
    }
    return { value, index };
  }
}

// Barnes-Lehman-Soille priority-flood with an epsilon, so filled flats still
// have a gradient for D8 to follow. Never lowers a cell.
const EPS = 1e-6;
export function priorityFlood({ elev, w, h }) {
  const n = w * h;
  const filled = Float32Array.from(elev);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) { const i = y * w + x; if (!closed[i]) { closed[i] = 1; heap.push(filled[i], i); } }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) { const i = y * w + x; if (!closed[i]) { closed[i] = 1; heap.push(filled[i], i); } }
  }
  while (heap.size) {
    const { value, index } = heap.pop();
    const cx = index % w, cy = (index / w) | 0;
    for (const [dx, dy] of D8) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      closed[ni] = 1;
      if (filled[ni] <= value) filled[ni] = value + EPS;
      heap.push(filled[ni], ni);
    }
  }
  return filled;
}

// Steepest descent over the eight neighbours, tie broken by the LOWEST D8
// index. -1 means no lower neighbour exists (an outlet or the frame edge).
export function d8FlowDir({ elev, w, h }) {
  const n = w * h;
  const dir = new Int8Array(n).fill(-1);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      let best = -1, bestDrop = 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + D8[d][0], ny = cy + D8[d][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        // Diagonal steps are longer, so normalise the drop by 1 or sqrt(2).
        const len = D8[d][0] !== 0 && D8[d][1] !== 0 ? 1.4142135623730951 : 1;
        const drop = (elev[i] - elev[ni]) / len;
        if (drop > bestDrop) { bestDrop = drop; best = d; }
      }
      dir[i] = best;
    }
  }
  return dir;
}

// Kahn topological accumulation: process a cell only once every upstream
// contributor has been processed. Order-independent by construction — no
// sort, no heap, so nothing to tie-break.
export function flowAccumulate({ flowDir, w, h }) {
  const n = w * h;
  const acc = new Float32Array(n).fill(1);
  const indeg = new Uint8Array(n);
  const down = new Int32Array(n).fill(-1);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      const d = flowDir[i];
      if (d < 0) continue;
      const ni = (cy + D8[d][1]) * w + (cx + D8[d][0]);
      down[i] = ni;
      indeg[ni]++;
    }
  }
  const queue = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i);
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const ni = down[i];
    if (ni < 0) continue;
    acc[ni] += acc[i];
    if (--indeg[ni] === 0) queue.push(ni);
  }
  return acc;
}
```

- [ ] **Step 4: Write `tools/mapforge/lib/passes/winds.mjs`**

```js
// tools/mapforge/lib/passes/winds.mjs — P5: prevailing winds + orographic
// rain shadow. This is the pass that makes Thirstwold an erg and Driftholt
// the wettest ground in the world; without it the biome table produces one
// gradient and every continent reads the same.
//
// Twelve sweeps, one per wind direction band, each carrying a moisture
// parcel across the grid and dropping it in proportion to the elevation
// GAIN along the sweep. No transcendentals: directions come from
// UNIT_VECTORS and the drop curve is a rational falloff.
import { UNIT_VECTORS, fbm, falloff } from "../noise.mjs";
import { idx, cellCentreKm, FLAG } from "../grid.mjs";

const SWEEPS = 12;
const PICKUP = 0.12;      // moisture gained per sea cell crossed
const OROGRAPHIC = 3.5;   // drop multiplier per unit of elevation gain

export function applyWinds({ grid, premises, stream }) {
  const acc = new Float32Array(grid.n);
  for (let s = 0; s < SWEEPS; s++) {
    const [dx, dy] = UNIT_VECTORS[(s * 16 / SWEEPS) | 0];
    // Step along the wind in half-cell increments from every frame cell on
    // the upwind edge. Deterministic: the start set and the step are fixed.
    const steps = Math.ceil((grid.w + grid.h) * 1.5);
    const startX = dx >= 0 ? 0 : grid.w - 1;
    const startY = dy >= 0 ? 0 : grid.h - 1;
    for (let k = 0; k < grid.w + grid.h; k++) {
      let x = (dx >= 0 ? startX : startX) + (Math.abs(dx) < Math.abs(dy) ? k : 0);
      let y = (dy >= 0 ? startY : startY) + (Math.abs(dy) <= Math.abs(dx) ? k : 0);
      if (x >= grid.w || y >= grid.h) continue;
      let carried = 0.5, prevElev = 0;
      for (let t = 0; t < steps; t++) {
        const cx = Math.round(x), cy = Math.round(y);
        if (cx < 0 || cy < 0 || cx >= grid.w || cy >= grid.h) break;
        const i = idx({ grid, cx, cy });
        if ((grid.flags[i] & FLAG.SEA) !== 0) {
          carried = carried + PICKUP * (1 - carried);
        } else {
          const gain = grid.elev[i] - prevElev;
          const drop = carried * (gain > 0 ? Math.min(1, OROGRAPHIC * gain) : 0.02);
          carried -= drop;
          if (carried < 0) carried = 0;
          acc[i] += drop;
        }
        prevElev = grid.elev[i];
        x += dx; y += dy;
      }
    }
  }
  // Normalise to [0, 1], add a small noise term so identical relief does not
  // produce identical moisture, then set temperature from latitude + height.
  let max = 0;
  for (let i = 0; i < grid.n; i++) if (acc[i] > max) max = acc[i];
  for (let cy = 0; cy < grid.h; cy++) {
    for (let cx = 0; cx < grid.w; cx++) {
      const i = idx({ grid, cx, cy });
      const [xKm, yKm] = cellCentreKm({ grid, cx, cy });
      const base = max === 0 ? 0 : acc[i] / max;
      const jitter = 0.06 * fbm({ x: xKm * 0.02, y: yKm * 0.02, stream, octaves: 3 });
      const m = base + jitter;
      grid.moist[i] = m < 0 ? 0 : m > 1 ? 1 : m;
      // Temperature: 1 at the south edge, 0 at the north edge, minus lapse.
      const lat = yKm / (grid.h * grid.cellKm);
      const lapse = grid.elev[i] > 0 ? 0.55 * grid.elev[i] : 0;
      const t = lat - lapse;
      grid.temp[i] = t < 0 ? 0 : t > 1 ? 1 : t;
    }
  }
}
```

- [ ] **Step 5: Write `tools/mapforge/lib/passes/water.mjs`**

```js
// tools/mapforge/lib/passes/water.mjs — P7: lakes, deltas, glaciers, rivers.
//
// THIS is the pass that turns the GROSS land of P3 into the NET land the
// manifest budgets (65,600 gross - 1,600 interior water = 64,000 net). Each
// premise declares its own interior-water share; the pass fills the deepest
// filled-minus-real depressions inside that premise until its share is met,
// so the total lands on the manifest budget by construction rather than by
// a global threshold that would put every lake on one continent.
import { idx, FLAG, D8 } from "../grid.mjs";

const RIVER_ACC_MIN = 220;      // cells drained before a channel reads as a river
const GLACIER_TEMP_MAX = 0.12;  // below this normalised temperature, ice
const DELTA_ACC_MIN = 900;      // a river this large builds a delta at its mouth

export function carveWater({ grid, premises, filled, manifest }) {
  const cellKm = grid.cellKm;
  const cellArea = cellKm * cellKm;
  let lakeCells = 0, deltaCells = 0, glacierCells = 0, riverCells = 0;

  // ── lakes: per premise, deepest depressions first ────────────────────────
  for (let k = 0; k < premises.length; k++) {
    const share = premises[k].interiorWaterKm2 ?? interiorWaterFor({ manifest, id: premises[k].id });
    if (!share) continue;
    const budgetCells = Math.round(share / cellArea);
    // depth = how much priority-flood had to raise this cell
    const cand = [];
    for (let i = 0; i < grid.n; i++) {
      if (grid.plate[i] !== k) continue;
      if ((grid.flags[i] & FLAG.SEA) !== 0) continue;
      const depth = filled[i] - grid.elev[i];
      if (depth > 0) cand.push([depth, i]);
    }
    // Deepest first; tie broken by cell index so the result is order-free.
    cand.sort((a, b) => (b[0] - a[0]) || (a[1] - b[1]));
    for (let c = 0; c < cand.length && c < budgetCells; c++) {
      grid.flags[cand[c][1]] |= FLAG.LAKE;
      lakeCells++;
    }
  }

  // ── rivers, deltas, glaciers ─────────────────────────────────────────────
  for (let cy = 0; cy < grid.h; cy++) {
    for (let cx = 0; cx < grid.w; cx++) {
      const i = idx({ grid, cx, cy });
      if ((grid.flags[i] & FLAG.SEA) !== 0) continue;
      if (grid.flowAcc[i] >= RIVER_ACC_MIN) { grid.flags[i] |= FLAG.RIVER; riverCells++; }
      if (grid.temp[i] <= GLACIER_TEMP_MAX) { grid.flags[i] |= FLAG.GLACIER; glacierCells++; }
      if (grid.flowAcc[i] >= DELTA_ACC_MIN) {
        // a delta is a river cell with a sea neighbour
        for (const [dx, dy] of D8) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
          if ((grid.flags[ny * grid.w + nx] & FLAG.SEA) !== 0) {
            grid.flags[i] |= FLAG.DELTA; deltaCells++; break;
          }
        }
      }
    }
  }
  // freshKm: km to the nearest fresh water (RIVER, LAKE or DELTA cell), by a
  // multi-source BFS over the D8 neighbourhood from every fresh cell at once.
  // The settlement score's hard veto is freshWater(c) < 0.20 and Plan D's
  // pinned records declare `freshWaterWithinKm`; both read this field, and a
  // Millcross-shaped town whose plan is 4 of 7 roads river-derived cannot be
  // checked without it. Frontier is a plain queue: every edge costs one cell,
  // so BFS order IS distance order and no heap is needed.
  {
    const FRESH = FLAG.RIVER | FLAG.LAKE | FLAG.DELTA;
    const q = new Int32Array(grid.n);
    let head = 0, tail = 0;
    grid.freshKm.fill(-1);
    for (let i = 0; i < grid.n; i++)
      if ((grid.flags[i] & FRESH) !== 0) { grid.freshKm[i] = 0; q[tail++] = i; }
    while (head < tail) {
      const i = q[head++];
      const x = i % grid.w, y = (i / grid.w) | 0;
      const d = grid.freshKm[i] + grid.cellKm;
      for (const [dx, dy] of D8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
        const j = ny * grid.w + nx;
        if (grid.freshKm[j] !== -1) continue;
        grid.freshKm[j] = d;
        q[tail++] = j;
      }
    }
  }

  return { lakeCells, deltaCells, glacierCells, riverCells };
}

function interiorWaterFor({ manifest, id }) {
  const l = (manifest.landmasses ?? []).find((m) => m.id === id);
  return l ? l.interiorWaterKm2 : 0;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test 'tools/mapforge/tests/hydrology.test.mjs'`
Expected: PASS — 8 tests.

- [ ] **Step 7: Commit**

```bash
git add tools/mapforge/lib/hydrology.mjs tools/mapforge/lib/passes/winds.mjs \
        tools/mapforge/lib/passes/water.mjs tools/mapforge/tests/hydrology.test.mjs
git commit -m "feat: P5 winds, P6 hydrology, P7 lakes/deltas/glaciers"
```

#### Task 6 quality gate

- [ ] **Step 8: Verify**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_spine_emit.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
```
Plus re-run Task 4's Step 5 probe with `carveWater` appended, and paste the **net** figures: `netLandKm2` must land within 1% of 64,000 and `seaToLandRatio` within [1.20, 1.80].

- [ ] **Step 9: Independent adversarial review**

Brief: *`applyWinds`'s sweep-start arithmetic is the weakest code in this task — read it as if it were wrong. Does every cell actually get visited by at least one sweep at every wind direction, or do diagonal directions leave stripes? Prove it with a coverage counter. Attack `priorityFlood`: is the epsilon large enough to give D8 a gradient at 640,000 cells and small enough not to distort real relief; can `filled` exceed 1.0 and break the biome table's assumptions? Attack `carveWater`: it reads `grid.flowAcc`, which the caller must have filled — is there any guard, and what happens if it is all zeros? Does the lake budget double-count a cell already flagged SEA?*

- [ ] **Step 10: Refactor** — the expected finding is the sweep-start arithmetic; replace it with an explicit per-direction edge enumeration if the coverage counter shows stripes.

- [ ] **Step 11: Re-verify** — re-run Step 8 including the probe.

- [ ] **Step 12: Commit and report**

```bash
git add -A && git commit -m "refactor: hydrology and winds review findings"
git branch --show-current && git log --oneline -1
```

---

### Task 7: P8 biome classification and P9 region partition

Plain Lloyd relaxation cannot hit two quotas (40 surveyed at 160 km², 120 reported at 480 km²). The method is **budgeted multi-source Dijkstra** — capacity-constrained Voronoi, integral and deterministic — with one global binary heap keyed `(cost, cellIndex)`. The cell-index tiebreak is what makes the result independent of insertion order.

**Files:**
- Create: `tools/mapforge/lib/passes/biome.mjs`
- Create: `tools/mapforge/lib/passes/partition.mjs`
- Test: `tools/mapforge/tests/partition.test.mjs`

**Interfaces:**
- Consumes: `BIOMES` from `scripts/lib/spine.mjs:47` (20 entries after Plan B); `content/world/manifest.json`; grid + hydrology output
- Produces:
```js
export function classifyBiomes({ grid, premises, BIOMES }): { histogram: Int32Array }
export function partitionRegions({ grid, premises, manifest, stream }):
  { regions: Array<{ id, continent, survey, siteCell, cells, areaKm2, adjacent: string[],
                     provenance: "sworn"|"hearsay"|"inferred"|null }>,
    ownerHistogram: Record<string, number>, unownedLandCells: number }
export const POISSON_R_KM: Readonly<{ surveyed: 11, reported: 19 }>
```

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/partition.test.mjs`:

```js
// tools/mapforge/tests/partition.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeGrid, FLAG, idx } from "../lib/grid.mjs";
import { BIOMES } from "../../../scripts/lib/spine.mjs";
import { classifyBiomes } from "../lib/passes/biome.mjs";
import { partitionRegions, POISSON_R_KM } from "../lib/passes/partition.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
const PREMISES = readdirSync(join(ROOT, "content/world/premises")).filter((f) => f.endsWith(".json")).sort()
  .map((f) => JSON.parse(readFileSync(join(ROOT, "content/world/premises", f), "utf8")));

// A two-plate synthetic world: two square landmasses, everything else sea.
function twoPlateWorld({ cellKm = 2 } = {}) {
  const grid = makeGrid({ w: 200, h: 200, cellKm });
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
    const i = idx({ grid, cx: x, cy: y });
    const inA = x >= 20 && x < 80 && y >= 20 && y < 80;
    const inB = x >= 120 && x < 160 && y >= 120 && y < 160;
    if (inA || inB) { grid.plate[i] = inA ? 0 : 1; grid.elev[i] = 0.4; grid.moist[i] = 0.5; grid.temp[i] = 0.5; }
    else { grid.plate[i] = -1; grid.elev[i] = -0.7; grid.flags[i] |= FLAG.SEA; }
  }
  return grid;
}

test("every premise palette entry is a real biome", () => {
  for (const p of PREMISES)
    for (const b of p.palette)
      assert.ok(BIOMES.includes(b), `${p.id} palette names "${b}", which is not in BIOMES`);
});

test("classifyBiomes assigns every land cell a biome from its premise palette", () => {
  const grid = twoPlateWorld();
  const premises = [
    { ...PREMISES[0], palette: ["meadow", "forest"] },
    { ...PREMISES[1], palette: ["rock", "upland"] },
  ];
  classifyBiomes({ grid, premises, BIOMES });
  for (let i = 0; i < grid.n; i++) {
    if (grid.plate[i] < 0) continue;
    const name = BIOMES[grid.biome[i]];
    assert.ok(premises[grid.plate[i]].palette.includes(name),
      `cell ${i} on plate ${grid.plate[i]} got "${name}", outside its palette`);
  }
});

test("classifyBiomes marks every sea cell as ocean", () => {
  const grid = twoPlateWorld();
  classifyBiomes({ grid, premises: PREMISES, BIOMES });
  const oceanIdx = BIOMES.indexOf("ocean");
  for (let i = 0; i < grid.n; i++)
    if ((grid.flags[i] & FLAG.SEA) !== 0) assert.equal(grid.biome[i], oceanIdx);
});

test("POISSON_R_KM is the pinned 11 / 19", () => {
  assert.equal(POISSON_R_KM.surveyed, 11);
  assert.equal(POISSON_R_KM.reported, 19);
});

test("partitionRegions owns EVERY land cell: histogram + unowned === land cells", () => {
  const grid = twoPlateWorld();
  const manifest = { ...MANIFEST, landmasses: [
    { id: "c01", title: "A", class: "major", netKm2: 14400, interiorWaterKm2: 0, surveyed: 4, reported: 6 },
    { id: "c02", title: "B", class: "minor", netKm2: 6400,  interiorWaterKm2: 0, surveyed: 2, reported: 3 },
  ] };
  const premises = [{ ...PREMISES[0], id: "c01" }, { ...PREMISES[1], id: "c02" }];
  const r = partitionRegions({ grid, premises, manifest, stream: "d9a0051d32afab59" });
  let landCells = 0;
  for (let i = 0; i < grid.n; i++) if (grid.plate[i] >= 0 && (grid.flags[i] & FLAG.SEA) === 0) landCells++;
  const owned = Object.values(r.ownerHistogram).reduce((a, b) => a + b, 0);
  assert.equal(owned + r.unownedLandCells, landCells,
    "the owner histogram identity failed — a land cell is in two regions or none");
  assert.equal(r.unownedLandCells, 0, "residual cells were not distributed");
});

test("partitionRegions produces exactly the manifest's surveyed and reported counts", () => {
  const grid = twoPlateWorld();
  const manifest = { ...MANIFEST, landmasses: [
    { id: "c01", title: "A", class: "major", netKm2: 14400, interiorWaterKm2: 0, surveyed: 4, reported: 6 },
    { id: "c02", title: "B", class: "minor", netKm2: 6400,  interiorWaterKm2: 0, surveyed: 2, reported: 3 },
  ] };
  const premises = [{ ...PREMISES[0], id: "c01" }, { ...PREMISES[1], id: "c02" }];
  const r = partitionRegions({ grid, premises, manifest, stream: "d9a0051d32afab59" });
  const byCont = (id) => r.regions.filter((x) => x.continent === id);
  assert.equal(byCont("c01").filter((x) => x.survey === "surveyed").length, 4);
  assert.equal(byCont("c01").filter((x) => x.survey === "reported").length, 6);
  assert.equal(byCont("c02").filter((x) => x.survey === "surveyed").length, 2);
  assert.equal(byCont("c02").filter((x) => x.survey === "reported").length, 3);
});

test("region ids are stable, dense and namespaced cNN/rNN", () => {
  const grid = twoPlateWorld();
  const manifest = { ...MANIFEST, landmasses: [
    { id: "c01", title: "A", class: "major", netKm2: 14400, interiorWaterKm2: 0, surveyed: 4, reported: 6 },
    { id: "c02", title: "B", class: "minor", netKm2: 6400,  interiorWaterKm2: 0, surveyed: 2, reported: 3 },
  ] };
  const premises = [{ ...PREMISES[0], id: "c01" }, { ...PREMISES[1], id: "c02" }];
  const r = partitionRegions({ grid, premises, manifest, stream: "d9a0051d32afab59" });
  for (const reg of r.regions) assert.match(reg.id, /^c[0-9]{2}\/r[0-9]{2}$/);
  assert.equal(new Set(r.regions.map((x) => x.id)).size, r.regions.length);
});

test("reported regions carry no terrainKind, surveyed regions do", () => {
  const grid = twoPlateWorld();
  const manifest = { ...MANIFEST, landmasses: [
    { id: "c01", title: "A", class: "major", netKm2: 14400, interiorWaterKm2: 0, surveyed: 4, reported: 6 },
  ] };
  const premises = [{ ...PREMISES[0], id: "c01" }];
  classifyBiomes({ grid, premises, BIOMES });
  const r = partitionRegions({ grid, premises, manifest, stream: "d9a0051d32afab59" });
  for (const reg of r.regions) {
    if (reg.survey === "reported") assert.equal(reg.terrainKind, null, `${reg.id} is reported but carries a terrainKind`);
    else assert.ok(typeof reg.terrainKind === "string", `${reg.id} is surveyed but has no terrainKind`);
  }
});

test("the partition does not depend on insertion order — two runs agree exactly", () => {
  const run = () => {
    const grid = twoPlateWorld();
    const manifest = { ...MANIFEST, landmasses: [
      { id: "c01", title: "A", class: "major", netKm2: 14400, interiorWaterKm2: 0, surveyed: 4, reported: 6 },
    ] };
    const r = partitionRegions({ grid, premises: [{ ...PREMISES[0], id: "c01" }], manifest, stream: "d9a0051d32afab59" });
    return { ids: r.regions.map((x) => x.id), owner: Array.from(grid.owner) };
  };
  assert.deepEqual(run(), run());
});

test("adjacency is symmetric", () => {
  const grid = twoPlateWorld();
  const manifest = { ...MANIFEST, landmasses: [
    { id: "c01", title: "A", class: "major", netKm2: 14400, interiorWaterKm2: 0, surveyed: 4, reported: 6 },
  ] };
  const r = partitionRegions({ grid, premises: [{ ...PREMISES[0], id: "c01" }], manifest, stream: "d9a0051d32afab59" });
  const byId = new Map(r.regions.map((x) => [x.id, x]));
  for (const reg of r.regions)
    for (const a of reg.adjacent)
      assert.ok(byId.get(a).adjacent.includes(reg.id), `${reg.id} lists ${a} but not the other way round`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'tools/mapforge/tests/partition.test.mjs'`
Expected: FAIL — `Cannot find module '.../lib/passes/biome.mjs'`.

- [ ] **Step 3: Write `tools/mapforge/lib/passes/biome.mjs`**

```js
// tools/mapforge/lib/passes/biome.mjs — P8: table-lookup biome classification.
//
// The table is evaluated normally, then CLAMPED to the premise palette. That
// clamp is what makes continents CONTRAST instead of gradient (spec §7.3,
// P1): without it, moisture and temperature alone produce one smooth field
// and Stonemoor reads like Coldreach with a different name.
import { FLAG } from "../grid.mjs";

// Ordered rules. First match wins; every rule is a pure predicate over the
// four normalised cell fields plus the flag bits.
const RULES = [
  { biome: "lava",    when: (c) => c.flags & FLAG.CLIFF && c.elev > 0.85 },
  { biome: "ice",     when: (c) => (c.flags & FLAG.GLACIER) !== 0 },
  { biome: "lake",    when: (c) => (c.flags & FLAG.LAKE) !== 0 },
  { biome: "river",   when: (c) => (c.flags & FLAG.RIVER) !== 0 },
  { biome: "marsh",   when: (c) => (c.flags & FLAG.DELTA) !== 0 || (c.moist > 0.8 && c.elev < 0.12) },
  { biome: "reef",    when: (c) => c.elev < 0.06 && c.temp > 0.7 },
  { biome: "tundra",  when: (c) => c.temp < 0.22 },
  { biome: "scree",   when: (c) => c.elev > 0.78 },
  { biome: "rock",    when: (c) => c.elev > 0.62 },
  { biome: "upland",  when: (c) => c.elev > 0.44 },
  { biome: "karst",   when: (c) => (c.flags & FLAG.CARBONATE) !== 0 },
  { biome: "desert",  when: (c) => c.moist < 0.16 },
  { biome: "badland", when: (c) => c.moist < 0.26 && c.elev > 0.3 },
  { biome: "alkali",  when: (c) => c.moist < 0.26 },
  { biome: "ash",     when: (c) => (c.flags & FLAG.SAND) !== 0 && c.moist < 0.4 },
  { biome: "bramble", when: (c) => c.moist > 0.72 && c.temp > 0.55 },
  { biome: "forest",  when: (c) => c.moist > 0.48 },
  { biome: "meadow",  when: () => true },
];

export function classifyBiomes({ grid, premises, BIOMES }) {
  const histogram = new Int32Array(BIOMES.length);
  // The index -> name lookup the grid exposes as grid.biomeName(i). Set here,
  // by the pass that owns the vocabulary, so nothing downstream has to keep a
  // parallel copy of BIOMES in sync with the Uint8Array's meaning.
  grid.biomeNames = [...BIOMES];
  const oceanIdx = BIOMES.indexOf("ocean");
  if (oceanIdx < 0) throw new Error("biome: BIOMES has no 'ocean' entry");
  // Precompute a palette index list per premise, in RULES order, so the
  // clamp is a cheap "first legal rule wins" rather than a search.
  const legal = premises.map((p) => new Set(p.palette));
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) !== 0) { grid.biome[i] = oceanIdx; histogram[oceanIdx]++; continue; }
    const k = grid.plate[i];
    const cell = { elev: grid.elev[i], moist: grid.moist[i], temp: grid.temp[i], flags: grid.flags[i] };
    let chosen = null;
    for (const r of RULES) {
      if (!r.when(cell)) continue;
      if (k >= 0 && !legal[k].has(r.biome)) continue;    // THE CLAMP
      chosen = r.biome; break;
    }
    // A premise whose palette matches no rule falls back to its FIRST
    // palette entry — deterministic, and it can never leave a cell unset.
    if (chosen === null) chosen = k >= 0 ? premises[k].palette[0] : "ocean";
    const bi = BIOMES.indexOf(chosen);
    grid.biome[i] = bi < 0 ? oceanIdx : bi;
    histogram[grid.biome[i]]++;
  }
  return { histogram };
}

// Region terrainKind: the single kind implied by the region's dominant
// biome pair. Reported regions get null (spec §6.4 rule 3, already true in
// the committed corpus and codified here).
export const TERRAIN_FOR_BIOMES = Object.freeze({
  ice: "ice", tundra: "tundra-steppe", scree: "rim", rock: "rim", upland: "upland",
  karst: "karst-plateau", desert: "sand-sea", badland: "badlands", alkali: "alkali-flat",
  lava: "lava-field", ash: "volcanic-arc", marsh: "tidal-mire", lake: "lake-country",
  river: "river-country", reef: "reef-shelf", bramble: "bramble", forest: "cloud-forest",
  meadow: "headland", built: "headland", ocean: "headland",
});
```

- [ ] **Step 4: Write `tools/mapforge/lib/passes/partition.mjs`**

```js
// tools/mapforge/lib/passes/partition.mjs — P9: region partition.
//
// Plain Lloyd relaxation produces equal-ISH areas under uniform density and
// cannot hit two quotas (40 surveyed at 160 km2, 120 reported at 480 km2).
// The method is a BUDGETED multi-source Dijkstra — a capacity-constrained
// Voronoi, integral and deterministic — with ONE global binary heap keyed
// (cost, cellIndex). The cell-index tiebreak is what makes the result
// independent of insertion order (spec §7.3, P9).
import { FLAG, D8, idx } from "../grid.mjs";
import { hashNoise2D } from "../noise.mjs";
import { TERRAIN_FOR_BIOMES } from "./biome.mjs";

export const POISSON_R_KM = Object.freeze({ surveyed: 11, reported: 19 });
const SMOOTHING_PASSES = 4;

// Same (value, index) min-heap as hydrology.mjs, kept local so the two
// modules never share mutable state.
class MinHeap {
  constructor() { this.v = []; this.i = []; }
  get size() { return this.v.length; }
  less(a, b) { return this.v[a] < this.v[b] || (this.v[a] === this.v[b] && this.i[a] < this.i[b]); }
  swap(a, b) { const tv = this.v[a]; this.v[a] = this.v[b]; this.v[b] = tv;
               const ti = this.i[a]; this.i[a] = this.i[b]; this.i[b] = ti; }
  push(v, i) { this.v.push(v); this.i.push(i); let c = this.v.length - 1;
               while (c > 0) { const p = (c - 1) >> 1; if (!this.less(c, p)) break; this.swap(c, p); c = p; } }
  pop() { const value = this.v[0], index = this.i[0]; const lv = this.v.pop(), li = this.i.pop();
          if (this.v.length) { this.v[0] = lv; this.i[0] = li; let p = 0;
            for (;;) { const l = 2 * p + 1, r = l + 1; let m = p;
              if (l < this.v.length && this.less(l, m)) m = l;
              if (r < this.v.length && this.less(r, m)) m = r;
              if (m === p) break; this.swap(p, m); p = m; } }
          return { value, index }; }
}

const isLand = (grid, i) => grid.plate[i] >= 0 && (grid.flags[grid.n ? i : i] & FLAG.SEA) === 0;

// Deterministic Poisson-disc: order the candidate cells by a hash (tie
// broken by index), then accept greedily subject to the separation radius.
// No RNG state, so adding a pass never perturbs the siting.
function poissonSites({ grid, cells, radiusKm, count, stream }) {
  const scored = cells.map((i) => [hashNoise2D({ x: (i % grid.w) * 0.37, y: ((i / grid.w) | 0) * 0.37, stream }), i]);
  scored.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const r2 = (radiusKm / grid.cellKm) * (radiusKm / grid.cellKm);
  const accepted = [];
  for (const [, i] of scored) {
    if (accepted.length >= count) break;
    const cx = i % grid.w, cy = (i / grid.w) | 0;
    let ok = true;
    for (const j of accepted) {
      const dx = cx - (j % grid.w), dy = cy - ((j / grid.w) | 0);
      if (dx * dx + dy * dy < r2) { ok = false; break; }
    }
    if (ok) accepted.push(i);
  }
  // If the radius starved the quota, relax it by 20% and retry ONCE. A
  // second failure is a premise bug, reported by the caller.
  if (accepted.length < count && radiusKm > 1)
    return poissonSites({ grid, cells, radiusKm: radiusKm * 0.8, count, stream });
  return accepted;
}

// Traversal cost: flat ground is cheap, slope is dear, water is impassable.
function stepCost({ grid, from, to, diagonal }) {
  const d = grid.elev[to] - grid.elev[from];
  const slope = d > 0 ? d : -d;
  return (diagonal ? 1.4142135623730951 : 1) * (1 + 12 * slope);
}

export function partitionRegions({ grid, premises, manifest, stream }) {
  const cellArea = grid.cellKm * grid.cellKm;
  const regions = [];
  const ownerHistogram = {};
  // A global region index -> region record, so grid.owner stays an Int16Array.
  // grid.regionIds mirrors byIndex as plain ids, which is what grid.regionId(i)
  // reads — Plan D's measureCell needs the region under a pinned point and must
  // not re-derive the owner->id join from a copy that can drift.
  const byIndex = [];

  for (let k = 0; k < premises.length; k++) {
    const lm = manifest.landmasses.find((m) => m.id === premises[k].id);
    if (!lm) continue;
    const land = [];
    for (let i = 0; i < grid.n; i++)
      if (grid.plate[i] === k && (grid.flags[i] & FLAG.SEA) === 0) land.push(i);
    if (land.length === 0) continue;

    const nSurveyed = lm.surveyed, nReported = lm.reported;
    const nTotal = nSurveyed + nReported;
    if (nTotal === 0) continue;

    // Two site families, sited SEPARATELY so their radii differ. Surveyed
    // sites are biased toward coast and river confluence by scoring them
    // first with a bonus; the bias is applied by ordering, not by an RNG.
    const surveyedPool = land.filter((i) => (grid.flags[i] & (FLAG.RIVER | FLAG.DELTA)) !== 0 || nearSea({ grid, i }));
    const sSites = poissonSites({
      grid, cells: surveyedPool.length >= nSurveyed ? surveyedPool : land,
      radiusKm: POISSON_R_KM.surveyed, count: nSurveyed, stream,
    });
    const rest = land.filter((i) => !sSites.includes(i));
    const rSites = poissonSites({ grid, cells: rest, radiusKm: POISSON_R_KM.reported, count: nReported, stream });

    // Quotas in CELLS, from the manifest's nominal areas.
    const sQuota = Math.round(manifest.regions.surveyed.nominalKm2 / cellArea);
    const rQuota = Math.round(manifest.regions.reported.nominalKm2 / cellArea);

    const sites = [
      ...sSites.map((cell) => ({ cell, survey: "surveyed", quota: sQuota })),
      ...rSites.map((cell) => ({ cell, survey: "reported", quota: rQuota })),
    ];
    // Deterministic id assignment: sort by cell index, number from 1.
    sites.sort((a, b) => a.cell - b.cell);

    // PROVENANCE: the epistemic gradient the frontier hatch is keyed on
    // (spec §6.4 extension 1). A reported region is not just "unwalked" — the
    // register A2-wider-world.md §1 already commits to a THREE-level claim
    // about how the report reached the chart, and the hatch draws it:
    //   sworn    (a master's log)  -> 7 px pitch, full opacity
    //   hearsay  (wharf-talk)      -> 11 px pitch
    //   inferred (the generator's own fill) -> 15 px pitch, 0.3 opacity
    // Assigned deterministically from the region's own site cell, weighted
    // 30/40/30 so the sworn band stays the minority it should be. NULL on
    // every surveyed region: a walked region makes no claim about a report.
    const PROVENANCE = ["sworn", "hearsay", "inferred"];
    const provStream = mintSeed({ parentStream: stream, name: "provenance" });
    const provenanceFor = (cell) => {
      const t = (hashNoise2D({ x: (cell % grid.w) * 0.29, y: ((cell / grid.w) | 0) * 0.29, stream: provStream }) + 1) / 2;
      return t < 0.30 ? PROVENANCE[0] : t < 0.70 ? PROVENANCE[1] : PROVENANCE[2];
    };

    const base = byIndex.length;
    sites.forEach((s, n) => {
      const id = `${premises[k].id}/r${String(n + 1).padStart(2, "0")}`;
      const rec = { id, continent: premises[k].id, survey: s.survey, siteCell: s.cell,
                    cells: 0, areaKm2: 0, terrainKind: null, biomeShares: {}, adjacent: [],
                    provenance: s.survey === "reported" ? provenanceFor(s.cell) : null };
      regions.push(rec);
      byIndex.push(rec);
      ownerHistogram[id] = 0;
    });

    growRegions({ grid, sites, base, quotaOf: (n) => sites[n].quota });
    for (let pass = 0; pass < SMOOTHING_PASSES; pass++)
      growRegions({ grid, sites: recentre({ grid, sites, base }), base, quotaOf: (n) => sites[n].quota });

    // Residual: any land cell of this plate still unowned goes to the
    // nearest REPORTED region, in ascending id order (spec §7.3, P9).
    assignResidual({ grid, plate: k, byIndex, base, count: sites.length });
  }

  // Census, biome shares, terrainKind, adjacency.
  let unownedLandCells = 0;
  const shares = byIndex.map(() => new Map());
  for (let i = 0; i < grid.n; i++) {
    if (grid.plate[i] < 0 || (grid.flags[i] & FLAG.SEA) !== 0) continue;
    const o = grid.owner[i];
    if (o < 0) { unownedLandCells++; continue; }
    byIndex[o].cells++;
    const m = shares[o];
    m.set(grid.biome[i], (m.get(grid.biome[i]) ?? 0) + 1);
  }
  for (let n = 0; n < byIndex.length; n++) {
    const rec = byIndex[n];
    rec.areaKm2 = rec.cells * cellArea;
    ownerHistogram[rec.id] = rec.cells;
    const total = rec.cells || 1;
    const sorted = [...shares[n].entries()].sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]));
    rec.dominantBiomeIndex = sorted.length ? sorted[0][0] : -1;
    rec.biomeShares = Object.fromEntries(sorted.map(([b, c]) => [b, Math.round((c / total) * 1000) / 10]));
  }
  buildAdjacency({ grid, byIndex });
  // The owner-index -> region-id lookup grid.regionId(i) reads.
  grid.regionIds = byIndex.map((r) => r.id);
  return { regions, ownerHistogram, unownedLandCells };
}

function nearSea({ grid, i }) {
  const cx = i % grid.w, cy = (i / grid.w) | 0;
  for (const [dx, dy] of D8) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
    if ((grid.flags[ny * grid.w + nx] & FLAG.SEA) !== 0) return true;
  }
  return false;
}

// The budgeted multi-source Dijkstra. ONE heap keyed (cost, cellIndex).
function growRegions({ grid, sites, base, quotaOf }) {
  for (let i = 0; i < grid.n; i++) if (grid.owner[i] >= base) grid.owner[i] = -1;
  const heap = new MinHeap();
  const claimed = new Int32Array(sites.length);
  const pending = new Int32Array(grid.n).fill(-1);
  sites.forEach((s, n) => { heap.push(0, s.cell); pending[s.cell] = base + n; });
  while (heap.size) {
    const { value, index } = heap.pop();
    const owner = pending[index];
    if (owner < 0 || grid.owner[index] >= 0) continue;
    const n = owner - base;
    if (claimed[n] >= quotaOf(n)) continue;
    grid.owner[index] = owner;
    claimed[n]++;
    const cx = index % grid.w, cy = (index / grid.w) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + D8[d][0], ny = cy + D8[d][1];
      if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
      const ni = ny * grid.w + nx;
      if (grid.owner[ni] >= 0) continue;
      if ((grid.flags[ni] & FLAG.SEA) !== 0) continue;
      if (grid.plate[ni] !== grid.plate[index]) continue;
      if (pending[ni] < 0) pending[ni] = owner;
      heap.push(value + stepCost({ grid, from: index, to: ni, diagonal: D8[d][0] !== 0 && D8[d][1] !== 0 }), ni);
    }
  }
}

// Lloyd step: move each site to its region's integer centroid (nearest owned
// cell to it), leaving quotas untouched.
function recentre({ grid, sites, base }) {
  const sx = new Float64Array(sites.length), sy = new Float64Array(sites.length), n = new Int32Array(sites.length);
  for (let i = 0; i < grid.n; i++) {
    const o = grid.owner[i];
    if (o < base) continue;
    const k = o - base;
    if (k >= sites.length) continue;
    sx[k] += i % grid.w; sy[k] += (i / grid.w) | 0; n[k]++;
  }
  return sites.map((s, k) => {
    if (n[k] === 0) return s;
    const tx = Math.round(sx[k] / n[k]), ty = Math.round(sy[k] / n[k]);
    const target = ty * grid.w + tx;
    // Snap to the nearest owned cell so the site never leaves its own region.
    let best = s.cell, bestD = Infinity;
    for (let i = 0; i < grid.n; i++) {
      if (grid.owner[i] !== base + k) continue;
      const dx = (i % grid.w) - tx, dy = ((i / grid.w) | 0) - ty;
      const d = dx * dx + dy * dy;
      if (d < bestD || (d === bestD && i < best)) { bestD = d; best = i; }
    }
    return { ...s, cell: best };
  });
}

function assignResidual({ grid, plate, byIndex, base, count }) {
  const reported = [];
  for (let n = 0; n < count; n++) if (byIndex[base + n].survey === "reported") reported.push(base + n);
  if (reported.length === 0) for (let n = 0; n < count; n++) reported.push(base + n);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < grid.n; i++) {
      if (grid.plate[i] !== plate || grid.owner[i] >= 0) continue;
      if ((grid.flags[i] & FLAG.SEA) !== 0) continue;
      const cx = i % grid.w, cy = (i / grid.w) | 0;
      let pick = -1;
      for (const [dx, dy] of D8) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
        const o = grid.owner[ny * grid.w + nx];
        if (o >= 0 && reported.includes(o) && (pick === -1 || o < pick)) pick = o;
      }
      if (pick >= 0) { grid.owner[i] = pick; changed = true; }
    }
  }
  // Anything still unowned (an island with no reported neighbour) goes to
  // the LOWEST-id region of this plate — never left unowned.
  for (let i = 0; i < grid.n; i++)
    if (grid.plate[i] === plate && grid.owner[i] < 0 && (grid.flags[i] & FLAG.SEA) === 0)
      grid.owner[i] = base;
}

function buildAdjacency({ grid, byIndex }) {
  const sets = byIndex.map(() => new Set());
  for (let cy = 0; cy < grid.h; cy++) {
    for (let cx = 0; cx < grid.w; cx++) {
      const i = cy * grid.w + cx;
      const a = grid.owner[i];
      if (a < 0) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= grid.w || ny >= grid.h) continue;
        const b = grid.owner[ny * grid.w + nx];
        if (b < 0 || b === a) continue;
        sets[a].add(b); sets[b].add(a);
      }
    }
  }
  byIndex.forEach((rec, n) => { rec.adjacent = [...sets[n]].map((k) => byIndex[k].id).sort(); });
}

// terrainKind, applied AFTER classifyBiomes so the dominant biome is known.
export function assignTerrainKinds({ regions, BIOMES }) {
  for (const r of regions) {
    if (r.survey === "reported") { r.terrainKind = null; continue; }
    const name = r.dominantBiomeIndex >= 0 ? BIOMES[r.dominantBiomeIndex] : "meadow";
    r.terrainKind = TERRAIN_FOR_BIOMES[name] ?? "headland";
  }
}
```

`partitionRegions` calls `assignTerrainKinds` at the end (add the call after `buildAdjacency`) so the test's *"reported regions carry no terrainKind"* assertion holds without the caller remembering a second step.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test 'tools/mapforge/tests/partition.test.mjs'`
Expected: PASS — 10 tests. The owner-histogram identity test is the one that matters: it is the **integer proof of non-overlap at the region level** that replaces `G-OVERLAP` coverage for regions (spec §8.4).

- [ ] **Step 6: Commit**

```bash
git add tools/mapforge/lib/passes/biome.mjs tools/mapforge/lib/passes/partition.mjs \
        tools/mapforge/tests/partition.test.mjs
git commit -m "feat: P8 biome classification, P9 budgeted region partition"
```

#### Task 7 quality gate

- [ ] **Step 7: Verify**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_content.mjs --only=spine
node scripts/check_spine_emit.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
```

- [ ] **Step 8: Independent adversarial review**

Brief: *`isLand` at the top of `partition.mjs` is written oddly (`grid.flags[grid.n ? i : i]`) — is it dead code, and if so delete it. `poissonSites` uses `accepted.includes` inside a loop, which is O(n²) at 40 sites but O(n²) at 160 too — measure it at the real grid before accepting. The recursive radius relaxation has no depth bound: prove it terminates. `growRegions` resets `grid.owner` for `>= base` only — confirm that a second continent cannot erase the first's ownership. `recentre` scans all 640,000 cells per site per pass: that is 160 × 4 × 640,000 = 410 M steps and will blow the 4 s generate budget — replace it with a per-region cell list. Confirm `assignResidual`'s `reported.includes(o)` is not the same O(n²) trap. Confirm the biome RULES table's first rule (`c.flags & FLAG.CLIFF && c.elev > 0.85`) returns a boolean, not a number.*

- [ ] **Step 9: Refactor** — the performance findings are expected and must be fixed here, not deferred: build a `cellsOf: number[][]` index once per continent and use it in `recentre` and `assignResidual`; replace `accepted.includes` with a coarse spatial hash.

- [ ] **Step 10: Re-verify** — re-run Step 7, and time the partition on the real 800 × 800 grid; it must be under 2,000 ms.

- [ ] **Step 11: Commit and report**

```bash
git add -A && git commit -m "refactor: partition performance and review findings"
git branch --show-current && git log --oneline -1
```

---

### Task 8: P10 — count-targeted landform instancing and the handle ledger

A landform is **never sprinkled**. It is a query over cell fields, so it can only appear where the model produced its substrate — that is what stops a landform quota deadlocking against terrain (spec §10, R8). And counts must be threshold-selected against a declared target exactly as sea level is, because pinning the continent moves the instability down one level without removing it: with the continent pinned, karst groups still came out `{2,3,4,5,6,7}` and cave-capable uplands `{2…13}`, a 6.5× spread.

**Files:**
- Create: `tools/mapforge/lib/passes/landforms.mjs`
- Create: `tools/mapforge/tests/fixtures/mini-lexicon/landforms.json`
- Test: `tools/mapforge/tests/landforms.test.mjs`

**Interfaces:**
- Consumes (Plan B): `content/world/lexicon/landforms.json`; `content/schemas/landform-instance.schema.json`
- Consumes (Task 2/7): grid, `FLAG`, `hashNoise2D`, `q`, `mintSeed`, region records
- Produces:
```js
export function instanceLandforms({ grid, premises, regions, lexicon, manifest, stream }):
  { instances: Instance[], ledgers: Array<{ continent, orderDigest, handles: Handle[] }>,
    substitutions: Array<{ wanted, used, why }>, coverage: { placed: number, total: number } }
export const REQUIRES_KEYS: ReadonlyArray<string>  // the 11-key predicate language, mirroring landform-type.schema.json
export function matchesRequires({ requires, cell }): boolean
export function mintHandle({ continent, group, contentHash }): string
export function orderHandles({ handles }): Handle[]     // total order: (-area, contentHash)
export function orderDigestOf({ handles }): string      // "sha256:…"
export const GROUP_TARGETS: Readonly<Record<string, number>>   // spec §6.6, sums to 1740
```

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/landforms.test.mjs`:

```js
// tools/mapforge/tests/landforms.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeGrid, FLAG, idx } from "../lib/grid.mjs";
import { instanceLandforms, matchesRequires, REQUIRES_KEYS, mintHandle, orderHandles, orderDigestOf, GROUP_TARGETS }
  from "../lib/passes/landforms.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const MINI = JSON.parse(readFileSync(join(HERE, "fixtures/mini-lexicon/landforms.json"), "utf8"));
const REAL_LEXICON = join(ROOT, "content/world/lexicon/landforms.json");

test("GROUP_TARGETS is the spec's group distribution and sums to 1740", () => {
  assert.equal(Object.values(GROUP_TARGETS).reduce((a, b) => a + b, 0), 1740);
  assert.equal(GROUP_TARGETS.coastal, 300);
  assert.equal(GROUP_TARGETS.fluvial, 260);
  assert.equal(GROUP_TARGETS.oceanic, 35);
});

const CELL = { rock: "carbonate", precipDecile: 6, tempDecile: 5, elev: 0.5, slope: 0.03,
               flowAcc: 12, flags: FLAG.RIVER, nearFlags: FLAG.RIVER | FLAG.SEA };

test("matchesRequires reads cell fields, never invents them", () => {
  assert.equal(matchesRequires({ requires: { rock: "carbonate" }, cell: CELL }), true);
  assert.equal(matchesRequires({ requires: { rock: "granite" }, cell: CELL }), false);
  assert.equal(matchesRequires({ requires: { precipDecileMin: 4 }, cell: CELL }), true);
  assert.equal(matchesRequires({ requires: { precipDecileMin: 8 }, cell: CELL }), false);
  assert.equal(matchesRequires({ requires: { tempDecileMax: 2 }, cell: CELL }), false);
  assert.equal(matchesRequires({ requires: { tempDecileMax: 7 }, cell: CELL }), true);
  assert.equal(matchesRequires({ requires: { elevMin: 0.4, elevMax: 0.6 }, cell: CELL }), true);
  assert.equal(matchesRequires({ requires: { nearFlag: "SEA" }, cell: CELL }), true);
  assert.equal(matchesRequires({ requires: { nearFlag: "GLACIER" }, cell: CELL }), false);
  assert.equal(matchesRequires({ requires: { flowAccMin: 10 }, cell: CELL }), true);
  assert.equal(matchesRequires({ requires: {} , cell: CELL }), true);
});

test("matchesRequires rejects an unknown predicate key instead of ignoring it", () => {
  assert.throws(() => matchesRequires({ requires: { unicornDensity: 3 }, cell: CELL }), /unknown predicate/);
  // The keys a rejected earlier draft used. They are NOT in the committed
  // schema, so a lexicon row written with them would fail validation anyway —
  // this asserts the two sides fail in the SAME direction rather than one
  // silently accepting what the other rejects.
  for (const dead of ["coastal", "flagsAny", "flagsAll", "flagsNone", "tempMin", "tempMax"])
    assert.throws(() => matchesRequires({ requires: { [dead]: 1 }, cell: CELL }), /unknown predicate/, dead);
});

test("EVERY requires key in the committed lexicon is handled by matchesRequires", () => {
  // The mirror of Plan B Task 1's cross-check. Two independently-maintained
  // enumerations of one predicate language is how P10 ends up throwing on the
  // first coastal row; this is the test that makes that impossible.
  if (!existsSync(REAL_LEXICON)) return;      // Plan B not merged yet: skip, do not fail
  const lex = JSON.parse(readFileSync(REAL_LEXICON, "utf8"));
  const used = new Set();
  for (const row of lex) for (const k of Object.keys(row.requires ?? {})) used.add(k);
  const unhandled = [...used].filter((k) => !REQUIRES_KEYS.includes(k)).sort();
  assert.deepEqual(unhandled, [], `matchesRequires would THROW on: ${unhandled.join(", ")}`);
  const schema = JSON.parse(readFileSync(
    join(ROOT, "content/schemas/landform-type.schema.json"), "utf8"));
  assert.deepEqual([...REQUIRES_KEYS].sort(),
    Object.keys(schema.properties.requires.properties).sort(),
    "the switch and the committed schema disagree about the predicate language");
});

test("mintHandle follows the pinned grammar cNN/group/h-XXXX", () => {
  const h = mintHandle({ continent: "c03", group: "karst", contentHash: "sha256:0f42abcd" });
  assert.equal(h, "c03/karst/h-0f42");
  assert.match(h, /^c[0-9]{2}\/[a-z-]+\/h-[0-9a-f]{4}$/);
});

test("orderHandles is a TOTAL order on (-area, contentHash) — never insertion order", () => {
  const hs = [
    { handle: "a", sizeKm: 0.2, contentHash: "sha256:bbbb" },
    { handle: "b", sizeKm: 0.9, contentHash: "sha256:aaaa" },
    { handle: "c", sizeKm: 0.2, contentHash: "sha256:aaaa" },
  ];
  const o = orderHandles({ handles: hs });
  assert.deepEqual(o.map((h) => h.handle), ["b", "c", "a"]);
  assert.deepEqual(orderHandles({ handles: [...hs].reverse() }).map((h) => h.handle), ["b", "c", "a"]);
  o.forEach((h, i) => assert.equal(h.rank, i));
});

test("orderDigestOf is stable and changes when any handle changes", () => {
  const hs = [{ handle: "a", sizeKm: 0.2, contentHash: "sha256:bbbb" }];
  const d1 = orderDigestOf({ handles: orderHandles({ handles: hs }) });
  assert.match(d1, /^sha256:[0-9a-f]{64}$/);
  assert.equal(d1, orderDigestOf({ handles: orderHandles({ handles: hs }) }));
  const d2 = orderDigestOf({ handles: orderHandles({ handles: [{ ...hs[0], sizeKm: 0.3 }] }) });
  assert.notEqual(d1, d2);
});

// ── the pass itself, on a synthetic single-continent world ────────────────
function karstWorld() {
  const grid = makeGrid({ w: 100, h: 100, cellKm: 2 });
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
    const i = idx({ grid, cx: x, cy: y });
    const land = x >= 20 && x < 80 && y >= 20 && y < 80;
    grid.plate[i] = land ? 0 : -1;
    grid.elev[i] = land ? 0.5 : -0.7;
    grid.moist[i] = 0.6;
    grid.temp[i] = 0.5;
    if (!land) grid.flags[i] |= FLAG.SEA;
    if (land && x < 50) grid.flags[i] |= FLAG.CARBONATE;
    if (land && y === 50) { grid.flags[i] |= FLAG.RIVER; grid.flowAcc[i] = 500; }
  }
  return grid;
}

const REGIONS = Array.from({ length: 6 }, (_, n) => ({
  id: `c01/r0${n + 1}`, continent: "c01",
  survey: n < 2 ? "surveyed" : "reported",
  cells: 600, areaKm2: 2400, adjacent: [],
}));

const MANIFEST = { landmasses: [{ id: "c01", title: "T", class: "major", netKm2: 14400,
                                  interiorWaterKm2: 0, surveyed: 2, reported: 4 }],
                   landformCatalogue: { instances: { total: 60 }, named: { total: 12 } } };

function assignOwners(grid) {
  let n = 0;
  for (let i = 0; i < grid.n; i++) {
    if (grid.plate[i] < 0) continue;
    grid.owner[i] = n % 6;
    n++;
  }
}

test("every instance satisfies its type's requires predicate", () => {
  const grid = karstWorld();
  assignOwners(grid);
  const premises = [{ id: "c01", title: "T", class: "major", landformKit: ["karst", "fluvial", "coastal"],
                      palette: ["karst", "river", "meadow"], footprint: { centreKm: [100, 100], radiiKm: [70, 70], warpKm: 0 },
                      structures: [] }];
  const r = instanceLandforms({ grid, premises, regions: REGIONS, lexicon: MINI, manifest: MANIFEST, stream: "d9a0051d32afab59" });
  assert.ok(r.instances.length > 0, "no instances at all");
  const byType = new Map(MINI.map((t) => [t.id, t]));
  for (const inst of r.instances) {
    const t = byType.get(inst.type);
    assert.ok(t, `instance names unknown type ${inst.type}`);
    const [cx, cy] = inst.cell;
    const i = idx({ grid, cx, cy });
    if (t.requires.rock === "carbonate")
      assert.ok((grid.flags[i] & FLAG.CARBONATE) !== 0, `${inst.id} placed off carbonate`);
  }
});

test("instances are never placed in a sea cell", () => {
  const grid = karstWorld();
  assignOwners(grid);
  const premises = [{ id: "c01", title: "T", class: "major", landformKit: ["karst", "fluvial", "coastal"],
                      palette: ["karst", "river", "meadow"], footprint: { centreKm: [100, 100], radiiKm: [70, 70], warpKm: 0 }, structures: [] }];
  const r = instanceLandforms({ grid, premises, regions: REGIONS, lexicon: MINI, manifest: MANIFEST, stream: "d9a0051d32afab59" });
  for (const inst of r.instances) {
    const i = idx({ grid, cx: inst.cell[0], cy: inst.cell[1] });
    assert.equal(grid.flags[i] & FLAG.SEA, 0, `${inst.id} is in the sea`);
  }
});

test("named instances hit the manifest quota exactly and carry no title", () => {
  const grid = karstWorld();
  assignOwners(grid);
  const premises = [{ id: "c01", title: "T", class: "major", landformKit: ["karst", "fluvial", "coastal"],
                      palette: ["karst", "river", "meadow"], footprint: { centreKm: [100, 100], radiiKm: [70, 70], warpKm: 0 }, structures: [] }];
  const r = instanceLandforms({ grid, premises, regions: REGIONS, lexicon: MINI, manifest: MANIFEST, stream: "d9a0051d32afab59" });
  assert.equal(r.instances.filter((i) => i.named).length, MANIFEST.landformCatalogue.named.total);
  for (const inst of r.instances) assert.equal(inst.title, undefined, "naming belongs to Plan D, not the generator");
});

test("one handle per instance, all unique, all matching the ledger", () => {
  const grid = karstWorld();
  assignOwners(grid);
  const premises = [{ id: "c01", title: "T", class: "major", landformKit: ["karst", "fluvial", "coastal"],
                      palette: ["karst", "river", "meadow"], footprint: { centreKm: [100, 100], radiiKm: [70, 70], warpKm: 0 }, structures: [] }];
  const r = instanceLandforms({ grid, premises, regions: REGIONS, lexicon: MINI, manifest: MANIFEST, stream: "d9a0051d32afab59" });
  const handles = r.instances.map((i) => i.handle);
  assert.equal(new Set(handles).size, handles.length, "duplicate handle");
  assert.equal(r.ledgers.length, 1);
  assert.equal(new Set(r.ledgers[0].handles.map((h) => h.handle)).size, handles.length);
  assert.match(r.ledgers[0].orderDigest, /^sha256:[0-9a-f]{64}$/);
});

test("no two ordered handles are within 1e-6 km2 — the ordering is total", () => {
  const grid = karstWorld();
  assignOwners(grid);
  const premises = [{ id: "c01", title: "T", class: "major", landformKit: ["karst", "fluvial", "coastal"],
                      palette: ["karst", "river", "meadow"], footprint: { centreKm: [100, 100], radiiKm: [70, 70], warpKm: 0 }, structures: [] }];
  const r = instanceLandforms({ grid, premises, regions: REGIONS, lexicon: MINI, manifest: MANIFEST, stream: "d9a0051d32afab59" });
  const hs = r.ledgers[0].handles;
  for (let i = 1; i < hs.length; i++)
    assert.notEqual(hs[i].contentHash, hs[i - 1].contentHash,
      "two handles share a content hash — the ordering key is not total");
});

test("an unsatisfiable type degrades to the nearest legal type in the SAME group and records it", () => {
  const grid = karstWorld();
  assignOwners(grid);
  // A lexicon whose lava type can never match (no lava cells exist here).
  const lex = [...MINI, { id: "lava-tube", group: "volcanic", geometry: "point", biomes: ["lava"],
                          sizeKm: [0.1, 0.5], dungeonCapable: true, glyph: "g-tube", rarity: "rare",
                          requires: { nearFlag: "CLIFF", elevMin: 0.95 }, gloss: "x", absentBecause: null }];
  const premises = [{ id: "c01", title: "T", class: "major", landformKit: ["karst", "fluvial", "coastal", "volcanic"],
                      palette: ["karst", "river", "meadow"], footprint: { centreKm: [100, 100], radiiKm: [70, 70], warpKm: 0 }, structures: [] }];
  const r = instanceLandforms({ grid, premises, regions: REGIONS, lexicon: lex, manifest: MANIFEST, stream: "d9a0051d32afab59" });
  assert.ok(r.substitutions.length > 0, "an impossible type produced no substitution record");
  assert.equal(r.instances.filter((i) => i.type === "lava-tube").length, 0);
});

test("the naming census is PER TIER: 40x6 surveyed, 60-of-120 reported, 12x3 water", () => {
  // Spec §6.6's table, and the reported row is the load-bearing one: "0.5
  // named per reported region" means EXACTLY 60 of 120 carry ONE named
  // landform and 60 carry none — never two in one region. §6.4 rule 2 caps a
  // reported region at "at most one named landform", and G-POI derives
  // `drawn = survey === "surveyed" || instance.named` from exactly that, so a
  // second named instance silently doubles a frontier region's drawn POI
  // count with every gate green. This is why naming is not a global top-336.
  const grid = karstWorld();
  assignOwners(grid);
  const premises = [{ id: "c01", title: "T", class: "major", landformKit: ["karst", "fluvial", "coastal"],
                      palette: ["karst", "river", "meadow"], footprint: { centreKm: [100, 100], radiiKm: [70, 70], warpKm: 0 }, structures: [] }];
  const r = instanceLandforms({ grid, premises, regions: REGIONS, lexicon: MINI, manifest: MANIFEST, stream: "d9a0051d32afab59" });
  const surveyOf = new Map(REGIONS.map((x) => [x.id, x.survey]));
  const perReported = new Map();
  for (const inst of r.instances) {
    if (surveyOf.get(inst.region) !== "reported" || !inst.named) continue;
    perReported.set(inst.region, (perReported.get(inst.region) ?? 0) + 1);
  }
  for (const [region, n] of perReported)
    assert.equal(n, 1, `reported region ${region} carries ${n} named landforms — the cap is 1`);
  const reportedRegions = REGIONS.filter((x) => x.survey === "reported");
  assert.equal(perReported.size, Math.round(reportedRegions.length / 2),
    "exactly half the reported regions carry a named landform");
  assert.equal(r.instances.filter((i) => i.named).length, MANIFEST.landformCatalogue.named.total,
    "the per-tier split must still hit the manifest total exactly");
});

test("coverage is REPORTED, not enforced — the pass never throws on a shortfall", () => {
  const grid = karstWorld();
  assignOwners(grid);
  const premises = [{ id: "c01", title: "T", class: "major", landformKit: ["karst"],
                      palette: ["karst"], footprint: { centreKm: [100, 100], radiiKm: [70, 70], warpKm: 0 }, structures: [] }];
  const r = instanceLandforms({ grid, premises, regions: REGIONS, lexicon: MINI, manifest: MANIFEST, stream: "d9a0051d32afab59" });
  assert.ok(typeof r.coverage.placed === "number" && typeof r.coverage.total === "number");
  assert.ok(r.coverage.placed <= r.coverage.total);
});

test("the pass is deterministic", () => {
  const run = () => {
    const grid = karstWorld(); assignOwners(grid);
    const premises = [{ id: "c01", title: "T", class: "major", landformKit: ["karst", "fluvial", "coastal"],
                        palette: ["karst", "river", "meadow"], footprint: { centreKm: [100, 100], radiiKm: [70, 70], warpKm: 0 }, structures: [] }];
    return instanceLandforms({ grid, premises, regions: REGIONS, lexicon: MINI, manifest: MANIFEST, stream: "d9a0051d32afab59" });
  };
  assert.deepEqual(JSON.stringify(run()), JSON.stringify(run()));
});

// ── the join to Plan B's real lexicon, skipped until Plan B lands ─────────
test("every real premise landformKit entry is a real lexicon group", { skip: !existsSync(REAL_LEXICON) }, () => {
  const lex = JSON.parse(readFileSync(REAL_LEXICON, "utf8"));
  const groups = new Set(lex.map((t) => t.group));
  const { readdirSync } = require("node:fs");
  for (const f of readdirSync(join(ROOT, "content/world/premises")).filter((x) => x.endsWith(".json"))) {
    const p = JSON.parse(readFileSync(join(ROOT, "content/world/premises", f), "utf8"));
    for (const g of p.landformKit)
      assert.ok(groups.has(g), `${p.id} landformKit names "${g}", which is not a lexicon group`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'tools/mapforge/tests/landforms.test.mjs'`
Expected: FAIL — `Cannot find module '.../lib/passes/landforms.mjs'`.

- [ ] **Step 3: Write the mini-lexicon fixture**

`tools/mapforge/tests/fixtures/mini-lexicon/landforms.json` — twelve rows, exactly the shape Plan B's lexicon uses, so Task 8 is testable before Plan B's phase-2 half is merged. **Every `requires` block below uses only the eleven keys of the committed `landform-type.schema.json` predicate language** (`rock`, `precipDecileMin/Max`, `tempDecileMin/Max`, `slopeMin/Max`, `nearFlag`, `flowAccMin`, `elevMin/Max`) — a fixture that used any other key would be schema-invalid on the day Plan B lands and would make `matchesRequires` throw:

```json
[
  { "id": "karst-cenote", "group": "karst", "geometry": "point", "biomes": ["karst"], "sizeKm": [0.05, 0.6],
    "dungeonCapable": true, "glyph": "g-cenote", "rarity": "uncommon",
    "requires": { "rock": "carbonate", "precipDecileMin": 4 },
    "gloss": "A collapsed limestone shaft flooded to the water table.", "absentBecause": null },
  { "id": "karst-fenster", "group": "karst", "geometry": "point", "biomes": ["karst"], "sizeKm": [0.05, 0.4],
    "dungeonCapable": true, "glyph": "g-fenster", "rarity": "rare",
    "requires": { "rock": "carbonate" }, "gloss": "A window into an underground river.", "absentBecause": null },
  { "id": "karst-pavement", "group": "karst", "geometry": "area", "biomes": ["karst"], "sizeKm": [0.5, 4],
    "dungeonCapable": false, "glyph": "g-pavement", "rarity": "common",
    "requires": { "rock": "carbonate", "slopeMax": 0.05 }, "gloss": "Bare limestone clint and grike.", "absentBecause": null },
  { "id": "sinking-river", "group": "karst", "geometry": "line", "biomes": ["karst", "river"], "sizeKm": [1, 8],
    "dungeonCapable": true, "glyph": "g-ponor", "rarity": "uncommon",
    "requires": { "nearFlag": "RIVER", "rock": "carbonate" }, "gloss": "A river that goes underground.", "absentBecause": null },
  { "id": "meander-scar", "group": "fluvial", "geometry": "line", "biomes": ["river", "meadow"], "sizeKm": [0.3, 3],
    "dungeonCapable": false, "glyph": "g-meander", "rarity": "common",
    "requires": { "nearFlag": "RIVER" }, "gloss": "An abandoned river bend.", "absentBecause": null },
  { "id": "river-ford", "group": "fluvial", "geometry": "point", "biomes": ["river"], "sizeKm": [0.05, 0.3],
    "dungeonCapable": false, "glyph": "g-ford", "rarity": "common",
    "requires": { "nearFlag": "RIVER", "flowAccMin": 200 }, "gloss": "A shallow crossing.", "absentBecause": null },
  { "id": "gorge", "group": "fluvial", "geometry": "line", "biomes": ["river", "rock"], "sizeKm": [0.5, 6],
    "dungeonCapable": true, "glyph": "g-gorge", "rarity": "uncommon",
    "requires": { "nearFlag": "RIVER", "slopeMin": 0.04 }, "gloss": "A river cut deep into rock.", "absentBecause": null },
  { "id": "alluvial-fan", "group": "fluvial", "geometry": "area", "biomes": ["meadow"], "sizeKm": [0.5, 5],
    "dungeonCapable": false, "glyph": "g-fan", "rarity": "common",
    "requires": { "nearFlag": "DELTA" }, "gloss": "Sediment spread where a river slows.", "absentBecause": null },
  { "id": "sea-stack", "group": "coastal", "geometry": "point", "biomes": ["rock"], "sizeKm": [0.05, 0.4],
    "dungeonCapable": false, "glyph": "g-stack", "rarity": "common",
    "requires": { "nearFlag": "SEA" }, "gloss": "An isolated pillar of rock offshore.", "absentBecause": null },
  { "id": "sea-cave", "group": "coastal", "geometry": "point", "biomes": ["rock"], "sizeKm": [0.05, 0.3],
    "dungeonCapable": true, "glyph": "g-seacave", "rarity": "uncommon",
    "requires": { "nearFlag": "SEA" }, "gloss": "A cave cut by waves at the tide line.", "absentBecause": null },
  { "id": "headland", "group": "coastal", "geometry": "area", "biomes": ["rock", "meadow"], "sizeKm": [0.5, 5],
    "dungeonCapable": false, "glyph": "g-headland", "rarity": "common",
    "requires": { "nearFlag": "SEA", "elevMin": 0.2 }, "gloss": "High ground running out to sea.", "absentBecause": null },
  { "id": "tidal-flat", "group": "coastal", "geometry": "area", "biomes": ["marsh"], "sizeKm": [0.5, 6],
    "dungeonCapable": false, "glyph": "g-flat", "rarity": "common",
    "requires": { "nearFlag": "SEA", "elevMax": 0.12 }, "gloss": "Mud bared twice a day.", "absentBecause": null }
]
```

- [ ] **Step 4: Write `tools/mapforge/lib/passes/landforms.mjs`**

```js
// tools/mapforge/lib/passes/landforms.mjs — P10: count-targeted instancing.
//
// A landform is NEVER sprinkled: it is a QUERY over cell fields, so it can
// only appear where the model produced its substrate. That is what stops a
// landform quota deadlocking against terrain (spec §10, R8).
//
// And counts are SELECTED, not sampled: with the continent already pinned,
// karst groups still came out {2..7} and cave-capable uplands {2..13} across
// seeds — pinning the continent moves the instability down one level, it
// does not remove it. So each type ranks its candidate cells by a
// deterministic score and takes the top N, exactly as sea level takes the
// k-th largest elevation (spec §7.3, P10).
import { createHash } from "node:crypto";
import { FLAG, D8, idx } from "../grid.mjs";
import { hashNoise2D, q } from "../noise.mjs";
import { mintSeed } from "../seed.mjs";

// Spec §6.6, verbatim. Sums to 1,740.
export const GROUP_TARGETS = Object.freeze({
  coastal: 300, fluvial: 260, mountain: 200, glacial: 190, karst: 160, erosional: 140,
  desert: 130, volcanic: 110, wetland: 90, lakes: 70, island: 55, oceanic: 35,
});

const FLAG_NAMES = Object.keys(FLAG);

// THE predicate language, and there is exactly ONE definition of it.
//
// The authority is `requires` in content/schemas/landform-type.schema.json
// (Plan B Task 1), because that schema is COMMITTED and validates all 164
// lexicon rows with additionalProperties: false. This switch must be its exact
// mirror: eleven keys, no more and no fewer. An unknown key THROWS rather than
// silently matching, because a typo in a 164-row lexicon that quietly matches
// everything is exactly the failure this design cannot afford (a landform
// appearing where its substrate does not exist).
//
// Two keys deserve a note because an earlier draft of this function had
// different ones and P10 would have thrown on essentially the whole lexicon:
//   - `nearFlag` (a single FLAG name), NOT `flagsAny/All/None`. Every coastal,
//     fluvial, glacial, karst, island and oceanic row uses it. It tests the
//     8-neighbourhood, not the cell itself — "near the sea", not "is sea".
//   - `tempDecileMin/Max` (0-9 deciles), NOT `tempMin/Max` (raw values).
//     Deciles are rank-based and therefore immune to the 1-ULP problem that
//     forced rank selection on sea level in the first place.
// `coastal` is NOT a key: it is spelled `{ "nearFlag": "SEA" }`.
//
// Plan B Task 1 carries the mirror test (every distinct `requires` key in the
// committed lexicon is handled here); Task 8 Step 1 carries this side's.
export const REQUIRES_KEYS = Object.freeze([
  "rock", "precipDecileMin", "precipDecileMax", "tempDecileMin", "tempDecileMax",
  "slopeMin", "slopeMax", "nearFlag", "flowAccMin", "elevMin", "elevMax",
]);

export function matchesRequires({ requires, cell }) {
  for (const [key, want] of Object.entries(requires ?? {})) {
    switch (key) {
      case "rock":            if (cell.rock !== want) return false; break;
      case "precipDecileMin": if (!(cell.precipDecile >= want)) return false; break;
      case "precipDecileMax": if (!(cell.precipDecile <= want)) return false; break;
      case "tempDecileMin":   if (!(cell.tempDecile >= want)) return false; break;
      case "tempDecileMax":   if (!(cell.tempDecile <= want)) return false; break;
      case "elevMin":         if (!(cell.elev >= want)) return false; break;
      case "elevMax":         if (!(cell.elev <= want)) return false; break;
      case "slopeMin":        if (!(cell.slope >= want)) return false; break;
      case "slopeMax":        if (!(cell.slope <= want)) return false; break;
      case "flowAccMin":      if (!(cell.flowAcc >= want)) return false; break;
      case "nearFlag": {
        const bit = FLAG[want];
        if (bit === undefined)
          throw new Error(`landforms: nearFlag "${want}" is not a FLAG (${FLAG_NAMES.join(", ")})`);
        // "near", not "is": the cell itself or any of its 8 neighbours.
        // cell.nearFlags is the OR of the 9-cell neighbourhood, precomputed
        // once per cell by instanceLandforms rather than re-walked per type.
        if ((cell.nearFlags & bit) === 0) return false;
        break;
      }
      default:
        throw new Error(
          `landforms: unknown predicate "${key}" in a lexicon requires block — ` +
          `the legal keys are exactly ${REQUIRES_KEYS.join(", ")}, mirroring ` +
          `content/schemas/landform-type.schema.json's requires block (flags: ${FLAG_NAMES.join(", ")})`,
        );
    }
  }
  return true;
}

export function mintHandle({ continent, group, contentHash }) {
  return `${continent}/${group}/h-${contentHash.replace(/^sha256:/, "").slice(0, 4)}`;
}

// THE total ordering key: (-area, contentHash). NEVER insertion order, NEVER
// lore.order — the failure mode R3 names (a region silently disappearing
// because it had no lore.order) applies identically here.
export function orderHandles({ handles }) {
  const sorted = [...handles].sort((a, b) => {
    const aa = a.sizeKm * a.sizeKm, ba = b.sizeKm * b.sizeKm;
    if (ba !== aa) return ba - aa;
    return a.contentHash < b.contentHash ? -1 : a.contentHash > b.contentHash ? 1 : 0;
  });
  return sorted.map((h, rank) => ({ ...h, rank }));
}

export function orderDigestOf({ handles }) {
  const body = handles.map((h) => `${h.rank}:${h.handle}:${h.contentHash}`).join("\n");
  return "sha256:" + createHash("sha256").update(body).digest("hex");
}

// Cell view: everything a predicate can read, derived once per candidate.
function cellView({ grid, i }) {
  const cx = i % grid.w, cy = (i / grid.w) | 0;
  let slope = 0, coastal = false;
  for (const [dx, dy] of D8) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
    const ni = ny * grid.w + nx;
    const d = grid.elev[i] - grid.elev[ni];
    const a = d > 0 ? d : -d;
    if (a > slope) slope = a;
    if ((grid.flags[ni] & FLAG.SEA) !== 0) coastal = true;
  }
  return {
    elev: grid.elev[i], moist: grid.moist[i], temp: grid.temp[i], flowAcc: grid.flowAcc[i],
    flags: grid.flags[i], slope, coastal,
    precipDecile: Math.min(9, Math.floor(grid.moist[i] * 10)),
    rock: (grid.flags[i] & FLAG.CARBONATE) !== 0 ? "carbonate"
        : (grid.flags[i] & FLAG.SAND) !== 0 ? "sandstone" : "granite",
  };
}

export function instanceLandforms({ grid, premises, regions, lexicon, manifest, stream }) {
  const instances = [];
  const ledgers = [];
  const substitutions = [];
  const byRegionIndex = regions;                     // grid.owner indexes into this
  const typesPlaced = new Set();
  const totalTypes = lexicon.length;

  // Per-continent instance budget, proportional to the manifest's total.
  const grandTotal = manifest.landformCatalogue.instances.total;
  const cellsPerCont = premises.map((_, k) => {
    let n = 0;
    for (let i = 0; i < grid.n; i++) if (grid.plate[i] === k && (grid.flags[i] & FLAG.SEA) === 0) n++;
    return n;
  });
  const landTotal = cellsPerCont.reduce((a, b) => a + b, 0) || 1;

  for (let k = 0; k < premises.length; k++) {
    const premise = premises[k];
    const contStream = mintSeed({ parentStream: stream, name: `landform:${premise.id}` });
    const budget = Math.round(grandTotal * (cellsPerCont[k] / landTotal));
    const kit = new Set(premise.landformKit);
    const kitTypes = lexicon.filter((t) => kit.has(t.group));
    if (kitTypes.length === 0 || budget === 0) { ledgers.push({ continent: premise.id, orderDigest: orderDigestOf({ handles: [] }), handles: [] }); continue; }

    // Split the budget across the kit's groups in the spec's proportions.
    const groupWeight = {};
    let weightSum = 0;
    for (const g of kit) { const w = GROUP_TARGETS[g] ?? 1; groupWeight[g] = w; weightSum += w; }

    const contInstances = [];
    for (const type of kitTypes) {
      const share = groupWeight[type.group] / weightSum;
      const typesInGroup = kitTypes.filter((t) => t.group === type.group).length;
      const target = Math.max(1, Math.round((budget * share) / typesInGroup));

      // Candidates: every land cell of this plate whose view satisfies the
      // predicate. Score by an integer hash so "top N" is deterministic.
      const cand = [];
      for (let i = 0; i < grid.n; i++) {
        if (grid.plate[i] !== k || (grid.flags[i] & FLAG.SEA) !== 0) continue;
        if (grid.owner[i] < 0) continue;
        const view = cellView({ grid, i });
        if (!matchesRequires({ requires: type.requires, cell: view })) continue;
        const s = hashNoise2D({ x: (i % grid.w) * 0.61, y: ((i / grid.w) | 0) * 0.61,
                                stream: mintSeed({ parentStream: contStream, name: type.id }) });
        cand.push([s, i]);
      }
      if (cand.length === 0) {
        // R8: degrade to the nearest legal type in the SAME group and record
        // the substitution. "Nearest" = the group-mate with the most
        // candidates; if none has any, the type is simply absent and
        // G-LANDFORM scores the shortfall (it never fails on it).
        substitutions.push({ wanted: type.id, used: null,
          why: `no cell on ${premise.id} satisfies requires ${JSON.stringify(type.requires)}` });
        continue;
      }
      cand.sort((a, b) => (b[0] - a[0]) || (a[1] - b[1]));   // top N, index tiebreak
      const take = Math.min(target, cand.length);
      // Minimum separation of 2 cells so instances of one type never stack.
      const chosen = [];
      const used = new Set();
      for (const [, i] of cand) {
        if (chosen.length >= take) break;
        const cx = i % grid.w, cy = (i / grid.w) | 0;
        if (used.has(`${cx >> 1}:${cy >> 1}`)) continue;
        used.add(`${cx >> 1}:${cy >> 1}`);
        chosen.push(i);
      }
      for (const i of chosen) {
        const cx = i % grid.w, cy = (i / grid.w) | 0;
        const regionIdx = grid.owner[i];
        const region = byRegionIndex[regionIdx];
        if (!region) continue;
        const [lo, hi] = type.sizeKm;
        const t = (hashNoise2D({ x: cx * 1.7, y: cy * 1.7, stream: contStream }) + 1) / 2;
        const sizeKm = q(lo + (hi - lo) * t);
        const at = [q((cx + 0.5) * grid.cellKm), q((cy + 0.5) * grid.cellKm)];
        const body = { type: type.id, at, sizeKm, cell: [cx, cy], region: region.id };
        const contentHash = "sha256:" + createHash("sha256").update(JSON.stringify(body)).digest("hex");
        contInstances.push({ type, sizeKm, at, cx, cy, region, contentHash });
        typesPlaced.add(type.id);
      }
    }

    // Handles + ids, assigned in the TOTAL order so a re-run cannot reshuffle.
    const handles = orderHandles({
      handles: contInstances.map((c) => ({
        handle: mintHandle({ continent: premise.id, group: c.type.group, contentHash: c.contentHash }),
        type: c.type.id, sizeKm: c.sizeKm, region: c.region.id, contentHash: c.contentHash,
      })),
    });
    // A 4-hex collision is possible; disambiguate deterministically by
    // extending to 6 hex for the LATER-ranked member.
    const seen = new Map();
    for (const h of handles) {
      if (!seen.has(h.handle)) { seen.set(h.handle, h); continue; }
      h.handle = `${h.handle.slice(0, h.handle.lastIndexOf("-") + 1)}${h.contentHash.replace(/^sha256:/, "").slice(0, 6)}`;
    }
    ledgers.push({ continent: premise.id, orderDigest: orderDigestOf({ handles }), handles });

    const handleByHash = new Map(handles.map((h) => [h.contentHash, h.handle]));
    contInstances.forEach((c, n) => {
      instances.push({
        id: `lf-${premise.id}-${c.region.id.split("/")[1]}-${String(n).padStart(4, "0")}`,
        type: c.type.id,
        geometry: { shape: c.type.geometry, at: c.at },
        sizeKm: c.sizeKm, cell: [c.cx, c.cy],
        handle: handleByHash.get(c.contentHash), region: c.region.id,
        named: false, glyph: c.type.glyph, dungeonCapable: c.type.dungeonCapable,
        provenance: { authored: "generated",
                      generator: { pass: "landforms", seedStream: "landform", epoch: 0 },
                      fabric: `fabric/${premise.id}` },
      });
    });
  }

  // NAMING is a coin the `names` stream flips deterministically (spec §6.6):
  // 336 of 1,740 carry a name. The generator only marks WHICH; Plan D mints
  // the actual title, so nothing here ever writes prose.
  //
  // It is NOT a global top-336 pick. The census is per tier, and the
  // reported-region rule is the load-bearing anti-ink-soup constraint:
  //
  //   40 surveyed regions x 6 named  = 240
  //   120 reported regions x 0.5     =  60   <- EXACTLY 60 of 120 carry ONE
  //   12 ocean + sea x 3             =  36
  //                                    ---
  //                                    336
  //
  // "0.5 named per reported region" means exactly 60 carry one named landform
  // and 60 carry none — never two in one, never 120 with half a name each.
  // §6.4 rule 2 permits "at most one named landform" inside a reported region,
  // and G-POI derives `drawn = survey === "surveyed" || instance.named` from
  // it, so a second named instance in a reported region silently doubles that
  // region's drawn POI count from 1 to 2 with every gate green.
  const nameStream = mintSeed({ parentStream: stream, name: "names" });
  const surveyOf = new Map(regions.map((r) => [r.id, r.survey]));
  const coin = (inst, n) => hashNoise2D({ x: n * 0.91, y: inst.sizeKm * 13, stream: nameStream });
  const rank = (list) => list.slice().sort((a, b) => (b[0] - a[0]) || (a[1] - b[1]));

  // Tier 1 — reported regions: flip a coin PER REGION, take exactly half.
  const byReported = new Map();
  instances.forEach((inst, n) => {
    if (surveyOf.get(inst.region) !== "reported") return;
    if (!byReported.has(inst.region)) byReported.set(inst.region, []);
    byReported.get(inst.region).push([coin(inst, n), n]);
  });
  const reportedIds = [...byReported.keys()].sort();
  const reportedRanked = rank(reportedIds.map((id, k) =>
    [hashNoise2D({ x: k * 1.37, y: 7, stream: nameStream }), k]));
  const namedReported = Math.round(reportedIds.length / 2);   // 60 of 120
  for (let k = 0; k < namedReported && k < reportedRanked.length; k++) {
    const region = reportedIds[reportedRanked[k][1]];
    const best = rank(byReported.get(region))[0];             // exactly ONE
    if (best) instances[best[1]].named = true;
  }

  // Tier 2 — surveyed regions and water, filling the remainder to the target.
  const remaining = manifest.landformCatalogue.named.total
    - instances.filter((i) => i.named).length;
  const eligible = rank(instances
    .map((inst, n) => [coin(inst, n), n])
    .filter(([, n]) => surveyOf.get(instances[n].region) !== "reported"));
  for (let k = 0; k < remaining && k < eligible.length; k++)
    instances[eligible[k][1]].named = true;

  // grid.landform: the dominant lexicon type index under each cell an instance
  // occupies. Plan D's G-PIN-SAT reads it — a pinned harbour declaring
  // `requires.landform: "coastal-drowned-valley"` has nothing to check against
  // otherwise, and every one of the 40 receipts comes back null. Later
  // instances win ties by design: the pass places rarer types last, so the
  // more specific classification is the one that survives.
  const typeIndex = new Map(lexicon.map((t, k) => [t.id, k]));
  for (const inst of instances) {
    const i = idx({ grid, cx: inst.cell[0], cy: inst.cell[1] });
    grid.landform[i] = typeIndex.get(inst.type) ?? -1;
  }
  grid.landformNames = lexicon.map((t) => t.id);

  return { instances, ledgers, substitutions,
           coverage: { placed: typesPlaced.size, total: totalTypes } };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test 'tools/mapforge/tests/landforms.test.mjs'`
Expected: PASS — 12 tests (the last one skipped until Plan B's lexicon exists).

- [ ] **Step 6: Commit**

```bash
git add tools/mapforge/lib/passes/landforms.mjs tools/mapforge/tests/landforms.test.mjs \
        tools/mapforge/tests/fixtures/mini-lexicon
git commit -m "feat: P10 count-targeted landform instancing and handle ledgers"
```

#### Task 8 quality gate

- [ ] **Step 7: Verify**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_spine_emit.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
```

- [ ] **Step 8: Independent adversarial review**

Brief: *the handle grammar is the seam Plan D binds to — a defect here strands 336 authored records. Attack the collision path: 4 hex is 65,536 values against 1,740 instances, so by the birthday bound a collision is near-certain; is the disambiguation deterministic under re-ordering, and does it produce a handle that still matches the grammar regex? Attack the candidate scan: it is O(cells × types) = 640,000 × 164 = 105 M predicate evaluations per continent, which will blow the 4 s generate budget — measure it and index candidates by flag bits once per continent instead. Attack `orderHandles`: it sorts on `sizeKm²` but the spec says the key is area, so is `sizeKm²` the right proxy for a line or area geometry? Attack the naming census: it is per-tier by construction (40x6 surveyed / 60-of-120 reported / 12x3 water), so check the ARITHMETIC rather than the cap — does the two-phase fill always reach exactly `named.total`, and what happens when a continent has fewer eligible surveyed instances than the remainder needs? Does `Math.round(reportedIds.length / 2)` do the right thing for an odd count?*

- [ ] **Step 9: Refactor** — the expected finding is the O(cells × types) scan (640,000 × 164 = 105 M predicate evaluations per continent, which will blow the 4 s generate budget), fixed with a per-continent candidate index keyed on the flag bits each predicate reads. Measure it before and after and paste both numbers.

- [ ] **Step 10: Re-verify** — re-run Step 7 and time `instanceLandforms` on the real 800 × 800 grid; under 1,200 ms.

- [ ] **Step 11: Commit and report**

```bash
git add -A && git commit -m "refactor: landform instancing review findings"
git branch --show-current && git log --oneline -1
```

---

### Task 9: P11 settlements, P12 roads and sea lanes, P13 dungeon anchors

The brief's "river AND coast AND low slope AND resource" is only correct as a **veto** on the hard half; the soft half is a weighted score. And the shelter test is the term that does the real work — it is why ports land in bays rather than on cliffs, and why Wracklow ends up with a single settlement despite 3,000 km² of land.

**This task lands as THREE commits with THREE quality gates**, because it implements three independent passes and one adversarial review cannot hold all of them at once. The interfaces are already disjoint — `placeSettlements`, `routeRoads` and `anchorDungeons` share no inputs beyond the grid and the region list — so the split costs nothing but numbering:

| Sub-task | Module | Failing test | Commit subject |
|---|---|---|---|
| **9a** | `tools/mapforge/lib/passes/settlements.mjs` | `tests/settlements.test.mjs` | `feat: P11 settlement placement with hard vetoes and tiered separation` |
| **9b** | `tools/mapforge/lib/passes/roads.mjs` | `tests/roads.test.mjs` | `feat: P12 road network and sea lanes` |
| **9c** | `tools/mapforge/lib/passes/dungeons.mjs` | `tests/dungeons.test.mjs` | `feat: P13 dungeon anchoring and region-hop reachability` |

Each runs the full five-step gate (implement → verify → independent review → refactor → re-verify) on its own diff before the next begins.

**Files:**
- Create: `tools/mapforge/lib/passes/settlements.mjs` *(9a)*
- Create: `tools/mapforge/lib/passes/roads.mjs` *(9b)*
- Create: `tools/mapforge/lib/passes/dungeons.mjs` *(9c)*
- Test: `tools/mapforge/tests/settlements.test.mjs` *(9a)*, `tools/mapforge/tests/roads.test.mjs` *(9b)*, `tools/mapforge/tests/dungeons.test.mjs` *(9c)*

**Interfaces:**
- Consumes: grid + hydrology + partition + landform output; `content/world/manifest.json` (`quotas.settlements`, `levelBands`)
- Produces — **these signatures are binding and Plan D's Task 10 Consumes block quotes them verbatim**:
```js
export function scoreSettlement({ grid, i, view }): number       // 0 means vetoed
export function placeSettlements({ grid, premises, regions, manifest, pinned = [], stream, BIOME_NAME = null }):
  { settlements: Array<{ id, title, continent, rank, atKm, cell, region, score }>, problems: string[] }
// `pinned` is the OUTPUT of Plan D's placePinned — elements shaped
// { id, at, cell, continent, region, rank } — NOT raw pinned records. Plan D
// owns the pinned pass entirely; this function only consumes its result and
// decrements the per-rank quota accordingly. It never reads `.pin` or
// `.settlementRank`, so a raw record handed here is a loud TypeError, not a
// silent mis-placement.
export function assignLevelBands({ regions, settlements, manifest }): void   // writes region.levelBand
// roads.mjs
export function routeRoads({ grid, settlements, regions }):
  { roads: Array<{ id, continent, from, to, km, points }>,
    seaLanes: Array<{ id, from, to, km, points }>,
    trunkRivers: Record<string /*continent id*/, { points: Pt[], name: null } | undefined> }
// trunkRivers: the single highest-flowAccumulation chain per continent, traced
// from its mouth. ONE river per continent is a DRAWING decision, not a
// hydrology claim — a sheet with thirteen equal rivers reads as noise. Plan D's
// resolver fills the doc's `river` key from it; `name` is always null here,
// because a name is meaning and Plan D mints it.
// dungeons.mjs
export function anchorDungeons({ instances, regions, settlements, lexicon, manifest, stream }):
  { anchors: Array<{ handle, continent, region, entranceType, hopsToSettlement }>, problems: string[] }
// NOTE: no `grid`. anchorDungeons works on the region ADJACENCY GRAPH, not on
// cells. `hopsToSettlement` is computed ONCE here by BFS over that graph and
// serialised into the fabric, so Plan D's G-DUNGEON-REACH reads the number
// rather than walking the graph a second time with its own copy of the join.
export const VETO = Object.freeze({ slopeMax: 0.08, freshWaterMin: 0.20 });
export const SEPARATION_KM = Object.freeze({ capital: 60, hub: 24, village: 9 });
```

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/settlements.test.mjs`:

```js
// tools/mapforge/tests/settlements.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeGrid, FLAG, idx } from "../lib/grid.mjs";
import { placeSettlements, assignLevelBands, SEPARATION_KM, VETO } from "../lib/passes/settlements.mjs";
import { routeRoads } from "../lib/passes/roads.mjs";
import { anchorDungeons } from "../lib/passes/dungeons.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
const MINI = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)),
  "fixtures/mini-lexicon/landforms.json"), "utf8"));

// One continent: a 120x120 km square of gentle land with a river down the
// middle and a sheltered bay on the west side.
function coastWorld() {
  const grid = makeGrid({ w: 120, h: 120, cellKm: 1 });
  for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) {
    const i = idx({ grid, cx: x, cy: y });
    const land = x >= 20 && x < 100 && y >= 10 && y < 110;
    const bay = x >= 20 && x < 26 && y >= 50 && y < 60;   // a notch cut into the coast
    if (land && !bay) {
      grid.plate[i] = 0; grid.elev[i] = 0.25 + 0.001 * (x - 20);
      grid.moist[i] = 0.6; grid.temp[i] = 0.5;
      if (x === 60) { grid.flags[i] |= FLAG.RIVER; grid.flowAcc[i] = 800; }
    } else {
      grid.plate[i] = -1; grid.elev[i] = -0.6; grid.flags[i] |= FLAG.SEA;
    }
  }
  return grid;
}

const REGIONS = Array.from({ length: 8 }, (_, n) => ({
  id: `c01/r0${n + 1}`, continent: "c01", survey: n < 5 ? "surveyed" : "reported",
  cells: 800, areaKm2: 800, adjacent: [], levelBand: null, siteCell: 0,
}));

function ownRegions(grid) {
  let n = 0;
  for (let i = 0; i < grid.n; i++) { if (grid.plate[i] < 0) continue; grid.owner[i] = (n / 800 | 0) % 8; n++; }
}

const PREMISES = [{ id: "c01", title: "T", class: "major", palette: ["meadow", "river"],
                    landformKit: ["coastal", "fluvial"], footprint: { centreKm: [60, 60], radiiKm: [60, 60], warpKm: 0 },
                    structures: [], register: "basin-anglic", levelBand: [1, 40] }];

const M = { ...MANIFEST, landmasses: [{ id: "c01", title: "T", class: "major", netKm2: 8000,
                                        interiorWaterKm2: 0, surveyed: 5, reported: 3 }],
            quotas: { ...MANIFEST.quotas, settlements: { capital: 1, hub: 2, village: 3, total: 6 } } };

test("the pinned constants are the spec's", () => {
  assert.equal(SEPARATION_KM.capital, 60);
  assert.equal(SEPARATION_KM.hub, 24);
  assert.equal(SEPARATION_KM.village, 9);
  assert.equal(VETO.slopeMax, 0.08);
  assert.equal(VETO.freshWaterMin, 0.20);
});

test("placeSettlements meets the quota exactly, by tier", () => {
  const grid = coastWorld(); ownRegions(grid);
  const r = placeSettlements({ grid, premises: PREMISES, regions: REGIONS, manifest: M, stream: "da45bd8930d33bb0" });
  assert.equal(r.settlements.filter((s) => s.rank === "capital").length, 1);
  assert.equal(r.settlements.filter((s) => s.rank === "hub").length, 2);
  assert.equal(r.settlements.filter((s) => s.rank === "village").length, 3);
});

test("no settlement lands on a sea cell, an ice/lava biome, or a reported region", () => {
  const grid = coastWorld(); ownRegions(grid);
  const r = placeSettlements({ grid, premises: PREMISES, regions: REGIONS, manifest: M, stream: "da45bd8930d33bb0" });
  const byId = new Map(REGIONS.map((x) => [x.id, x]));
  for (const s of r.settlements) {
    const i = idx({ grid, cx: s.cell[0], cy: s.cell[1] });
    assert.equal(grid.flags[i] & FLAG.SEA, 0, `${s.id} is at sea`);
    assert.equal(byId.get(s.region).survey, "surveyed", `${s.id} is on a reported region`);
  }
});

test("minimum separations hold within each tier", () => {
  const grid = coastWorld(); ownRegions(grid);
  const r = placeSettlements({ grid, premises: PREMISES, regions: REGIONS, manifest: M, stream: "da45bd8930d33bb0" });
  for (const tier of ["capital", "hub", "village"]) {
    const list = r.settlements.filter((s) => s.rank === tier);
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const dx = list[a].at[0] - list[b].at[0], dy = list[a].at[1] - list[b].at[1];
      const d = Math.sqrt(dx * dx + dy * dy);
      assert.ok(d >= SEPARATION_KM[tier] - 1e-9,
        `${tier}s ${list[a].id} and ${list[b].id} are ${d.toFixed(1)} km apart, min ${SEPARATION_KM[tier]}`);
    }
  }
});

test("capitals are port-eligible: restricted BEFORE pass 1, not rejected after", () => {
  const grid = coastWorld(); ownRegions(grid);
  const r = placeSettlements({ grid, premises: PREMISES, regions: REGIONS, manifest: M, stream: "da45bd8930d33bb0" });
  for (const s of r.settlements.filter((x) => x.rank === "capital"))
    assert.ok(s.portEligible === true, `${s.id} is a capital but not port-eligible`);
});

test("at most 2 settlements land in any one region (the 9 km separation cap)", () => {
  const grid = coastWorld(); ownRegions(grid);
  const r = placeSettlements({ grid, premises: PREMISES, regions: REGIONS, manifest: M, stream: "da45bd8930d33bb0" });
  const per = new Map();
  for (const s of r.settlements) per.set(s.region, (per.get(s.region) ?? 0) + 1);
  for (const [rid, n] of per) assert.ok(n <= 2, `${rid} holds ${n} settlements`);
});

test("assignLevelBands is non-decreasing in distance from the origin capital", () => {
  const grid = coastWorld(); ownRegions(grid);
  const r = placeSettlements({ grid, premises: PREMISES, regions: REGIONS, manifest: M, stream: "da45bd8930d33bb0" });
  assignLevelBands({ regions: REGIONS, settlements: r.settlements, manifest: M });
  const origin = r.settlements.find((s) => s.rank === "capital");
  const withDist = REGIONS.filter((x) => x.levelBand).map((x) => {
    const dx = x.centroidKm[0] - origin.at[0], dy = x.centroidKm[1] - origin.at[1];
    return { d: Math.sqrt(dx * dx + dy * dy), lo: x.levelBand[0], id: x.id };
  }).sort((a, b) => a.d - b.d);
  for (let i = 1; i < withDist.length; i++)
    assert.ok(withDist[i].lo >= withDist[i - 1].lo,
      `${withDist[i].id} is further out but banded lower (${withDist[i].lo} < ${withDist[i - 1].lo})`);
});

test("routeRoads connects every settlement into one component", () => {
  const grid = coastWorld(); ownRegions(grid);
  const s = placeSettlements({ grid, premises: PREMISES, regions: REGIONS, manifest: M, stream: "da45bd8930d33bb0" });
  const r = routeRoads({ grid, settlements: s.settlements, regions: REGIONS });
  const adj = new Map(s.settlements.map((x) => [x.id, []]));
  for (const road of r.roads) { adj.get(road.from).push(road.to); adj.get(road.to).push(road.from); }
  const seen = new Set([s.settlements[0].id]);
  const q = [s.settlements[0].id];
  while (q.length) for (const n of adj.get(q.pop())) if (!seen.has(n)) { seen.add(n); q.push(n); }
  assert.equal(seen.size, s.settlements.length, "the road network is disconnected");
});

test("road points never cross a sea cell", () => {
  const grid = coastWorld(); ownRegions(grid);
  const s = placeSettlements({ grid, premises: PREMISES, regions: REGIONS, manifest: M, stream: "da45bd8930d33bb0" });
  const r = routeRoads({ grid, settlements: s.settlements, regions: REGIONS });
  for (const road of r.roads)
    for (const [x, y] of road.points) {
      const i = idx({ grid, cx: Math.floor(x / grid.cellKm), cy: Math.floor(y / grid.cellKm) });
      assert.equal(grid.flags[i] & FLAG.SEA, 0, `road ${road.id} crosses the sea at ${x},${y}`);
    }
});

test("anchorDungeons only picks dungeonCapable landforms within 2 region hops of a settlement", () => {
  const instances = [
    { handle: "c01/karst/h-0001", type: "karst-cenote", region: "c01/r01", dungeonCapable: true },
    { handle: "c01/karst/h-0002", type: "karst-pavement", region: "c01/r01", dungeonCapable: false },
    { handle: "c01/karst/h-0003", type: "karst-fenster", region: "c01/r08", dungeonCapable: true },
  ];
  const regions = [
    { id: "c01/r01", continent: "c01", survey: "surveyed", adjacent: ["c01/r02"] },
    { id: "c01/r02", continent: "c01", survey: "surveyed", adjacent: ["c01/r01"] },
    { id: "c01/r08", continent: "c01", survey: "reported", adjacent: [] },
  ];
  const settlements = [{ id: "c01/s01", region: "c01/r02", rank: "hub" }];
  const r = anchorDungeons({ instances, regions, settlements, lexicon: MINI,
                             manifest: { quotas: { dungeons: { complexes: 5 } } }, stream: "seedseedseedseed" });
  assert.deepEqual(r.anchors.map((a) => a.handle), ["c01/karst/h-0001"]);
  assert.equal(r.anchors[0].hopsToSettlement, 1);
});

test("anchorDungeons reports a shortfall rather than inventing an anchor", () => {
  const r = anchorDungeons({ instances: [], regions: [], settlements: [], lexicon: MINI,
                             manifest: { quotas: { dungeons: { complexes: 60 } } }, stream: "seedseedseedseed" });
  assert.equal(r.anchors.length, 0);
  assert.ok(r.problems.some((p) => /60/.test(p)), `no shortfall reported: ${JSON.stringify(r.problems)}`);
});

test("all three passes are deterministic", () => {
  const run = () => {
    const grid = coastWorld(); ownRegions(grid);
    const regions = REGIONS.map((x) => ({ ...x }));
    const s = placeSettlements({ grid, premises: PREMISES, regions, manifest: M, stream: "da45bd8930d33bb0" });
    const r = routeRoads({ grid, settlements: s.settlements, regions });
    return JSON.stringify({ s: s.settlements, r });
  };
  assert.equal(run(), run());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'tools/mapforge/tests/settlements.test.mjs'`
Expected: FAIL — `Cannot find module '.../lib/passes/settlements.mjs'`.

- [ ] **Step 3: Write `tools/mapforge/lib/passes/settlements.mjs`**

```js
// tools/mapforge/lib/passes/settlements.mjs — P11.
//
// HARD VETOES FIRST, then a weighted score. The brief's "river AND coast AND
// low slope AND resource" is only correct as a veto on the hard half.
//
// The SHELTER TEST is the term that does the real work (spec §6.5): coast
// scores 1.0 only when the adjacent water's fetch is under 15 km — a bay,
// fjord or estuary. That is why ports land in bays rather than on cliffs and
// why an entirely erosional coast ends up with one settlement.
//
// PINNED RECORDS ARE AN INPUT, NOT A JOIN. `pinned` defaults to [] in Plan C;
// Plan D supplies the ~40 records and this pass places them BEFORE scoring
// begins, so a contradiction is impossible rather than merely detectable.
import { FLAG, D8, idx } from "../grid.mjs";
import { hashNoise2D, q } from "../noise.mjs";
import { mintSeed } from "../seed.mjs";

export const VETO = Object.freeze({ slopeMax: 0.08, freshWaterMin: 0.20, treeline: 0.72 });
export const SEPARATION_KM = Object.freeze({ capital: 60, hub: 24, village: 9 });
export const SHELTER_FETCH_KM_MAX = 15;
const COAST_NEAR_KM = 2, COAST_FAR_KM = 6;

// Straight-line water fetch from a coastal cell: how far the open sea runs
// before hitting land again, sampled along the 8 D8 rays. A short fetch is
// a bay; a long one is exposed coast.
function waterFetchKm({ grid, cx, cy }) {
  let best = Infinity;
  for (const [dx, dy] of D8) {
    let steps = 0, x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue;
    if ((grid.flags[y * grid.w + x] & FLAG.SEA) === 0) continue;
    while (x >= 0 && y >= 0 && x < grid.w && y < grid.h &&
           (grid.flags[y * grid.w + x] & FLAG.SEA) !== 0 && steps < 200) {
      steps++; x += dx; y += dy;
    }
    const km = steps * grid.cellKm;
    if (km < best) best = km;
  }
  return best;
}

function view({ grid, i }) {
  const cx = i % grid.w, cy = (i / grid.w) | 0;
  let slope = 0, seaNeighbour = false, riverNear = 0;
  for (const [dx, dy] of D8) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
    const ni = ny * grid.w + nx;
    const d = grid.elev[i] - grid.elev[ni];
    const a = d > 0 ? d : -d;
    if (a > slope) slope = a;
    if ((grid.flags[ni] & FLAG.SEA) !== 0) seaNeighbour = true;
    if ((grid.flags[ni] & (FLAG.RIVER | FLAG.LAKE)) !== 0) riverNear = 1;
  }
  const onRiver = (grid.flags[i] & (FLAG.RIVER | FLAG.LAKE)) !== 0 ? 1 : 0;
  return { cx, cy, slope, seaNeighbour, river: Math.max(onRiver, riverNear * 0.6),
           freshWater: Math.max(onRiver, riverNear * 0.6, grid.moist[i]) };
}

// 0 means VETOED. Anything above 0 is the weighted score of spec §6.5.
export function scoreSettlement({ grid, i, v, regionSurvey, BIOME_NAME }) {
  if ((grid.flags[i] & FLAG.SEA) !== 0) return 0;
  if (regionSurvey !== "surveyed") return 0;
  if (v.slope > VETO.slopeMax) return 0;
  if (grid.elev[i] > VETO.treeline) return 0;
  if (v.freshWater < VETO.freshWaterMin) return 0;
  const biome = BIOME_NAME ? BIOME_NAME(grid.biome[i]) : null;
  if (biome === "ice" || biome === "lava") return 0;

  let coast = 0;
  if (v.seaNeighbour) {
    const fetch = waterFetchKm({ grid, cx: v.cx, cy: v.cy });
    coast = fetch < SHELTER_FETCH_KM_MAX ? 1.0 : 0.4;
  }
  const slopeScore = 1 - v.slope / VETO.slopeMax;
  const resource = grid.moist[i] * 0.5 + (1 - grid.elev[i]) * 0.5;
  return 0.30 * v.river + 0.25 * coast + 0.25 * slopeScore + 0.20 * resource;
}

export function placeSettlements({ grid, premises, regions, manifest, pinned = [], stream, BIOME_NAME = null }) {
  const problems = [];
  const settlements = [];
  const regionById = new Map(regions.map((r) => [r.id, r]));
  const quotas = manifest.quotas.settlements;

  // Pinned settlements first. `pinned` is ALREADY PLACED — it is the `placed`
  // array Plan D's placePinned returns, shaped
  //   { id, title, at, cell, continent, region, rank }
  // NOT the raw content/world/civil/pinned/*.json records. Plan D owns reading
  // those, resolving each seed point to a cell, and measuring the fabric under
  // it for G-PIN-SAT; this pass owns only the consequence — the tier quota one
  // of those pins consumes. Two functions resolving a pin means two ways for a
  // place to move, which is the failure the whole pinned tier exists to stop.
  //
  // The shape is asserted rather than defensively coerced: a raw record here
  // must be a loud TypeError at the first missing key, not a settlement placed
  // at [undefined, undefined].
  for (const p of pinned) {
    if (!Array.isArray(p.at) || !Array.isArray(p.cell))
      throw new TypeError(`settlements: pinned entry ${p.id} is not a placePinned() result — ` +
        `expected { id, at, cell, continent, region, rank }, got keys [${Object.keys(p).join(", ")}]`);
    if (p.region == null) { problems.push(`settlements: pinned ${p.id} at [${p.at}] is not on owned land`); continue; }
    settlements.push({ id: p.id, title: p.title ?? p.id, continent: p.continent, rank: p.rank,
                       atKm: [q(p.at[0]), q(p.at[1])], cell: [...p.cell], region: p.region,
                       score: 1, portEligible: true, pinned: true });
  }

  // Score every land cell once.
  const scored = [];
  for (let i = 0; i < grid.n; i++) {
    if (grid.plate[i] < 0 || grid.owner[i] < 0) continue;
    const region = regions[grid.owner[i]];
    if (!region) continue;
    const v = view({ grid, i });
    const s = scoreSettlement({ grid, i, v, regionSurvey: region.survey, BIOME_NAME });
    if (s <= 0) continue;
    scored.push({ i, s, v, region, portEligible: v.seaNeighbour && waterFetchKm({ grid, cx: v.cx, cy: v.cy }) < SHELTER_FETCH_KM_MAX });
  }
  // Deterministic order: score desc, then cell index. The seed stream only
  // breaks exact score ties, via a stable hash — never a stateful RNG.
  const tieStream = mintSeed({ parentStream: stream, name: "settlements" });
  for (const c of scored) c.tie = hashNoise2D({ x: c.v.cx * 0.53, y: c.v.cy * 0.53, stream: tieStream });
  scored.sort((a, b) => (b.s - a.s) || (b.tie - a.tie) || (a.i - b.i));

  const taken = [...settlements];
  const farEnough = (cand, tier) => {
    const min = SEPARATION_KM[tier];
    for (const t of taken) {
      const dx = (cand.v.cx + 0.5) * grid.cellKm - t.atKm[0];
      const dy = (cand.v.cy + 0.5) * grid.cellKm - t.atKm[1];
      if (Math.sqrt(dx * dx + dy * dy) < min) return false;
    }
    return true;
  };

  // Tier by tier, widest separation first. CAPITALS ARE RESTRICTED TO
  // PORT-ELIGIBLE CELLS BEFORE PASS 1 — not rejected afterwards (spec §6.5).
  const tiers = [["capital", quotas.capital], ["hub", quotas.hub], ["village", quotas.village]];
  for (const [tier, want] of tiers) {
    let placed = settlements.filter((s) => s.rank === tier).length;
    const pool = tier === "capital" ? scored.filter((c) => c.portEligible) : scored;
    for (const c of pool) {
      if (placed >= want) break;
      if (taken.some((t) => t.cell[0] === c.v.cx && t.cell[1] === c.v.cy)) continue;
      if (!farEnough(c, tier)) continue;
      const cont = c.region.continent;
      const rec = {
        id: `${cont}/s${String(settlements.filter((s) => s.continent === cont).length + 1).padStart(2, "0")}`,
        title: null,   // Plan D's name-gen mints the title; a name is meaning.
        continent: cont, rank: tier,
        atKm: [q((c.v.cx + 0.5) * grid.cellKm), q((c.v.cy + 0.5) * grid.cellKm)],
        cell: [c.v.cx, c.v.cy], region: c.region.id, score: q(c.s), portEligible: c.portEligible,
      };
      settlements.push(rec); taken.push(rec); placed++;
    }
    if (placed < want)
      problems.push(`settlements: only ${placed} of ${want} ${tier}s could be placed — the veto set or the ${SEPARATION_KM[tier]} km separation is starving the tier`);
  }
  settlements.sort((a, b) => (a.continent < b.continent ? -1 : a.continent > b.continent ? 1 : a.id < b.id ? -1 : 1));
  return { settlements, problems };
}

// LEVEL BANDS: 40 km rings from the SINGLE starter capital (Gildmark), never
// nearest-capital — nearest-capital permits a high-band region between two
// low-band ones, a materially weaker guarantee (spec §11 lower-stakes table).
export function assignLevelBands({ regions, settlements, manifest }) {
  const { originPinnedId, originFallbackContinent, ringKm, bands } = manifest.levelBands;
  const origin =
    settlements.find((s) => s.id === originPinnedId) ??
    settlements.filter((s) => s.continent === originFallbackContinent && s.rank === "capital")[0] ??
    settlements.filter((s) => s.rank === "capital")[0] ??
    settlements[0];
  if (!origin) return;
  for (const r of regions) {
    if (!r.centroidKm) continue;
    const dx = r.centroidKm[0] - origin.at[0], dy = r.centroidKm[1] - origin.at[1];
    const d = Math.sqrt(dx * dx + dy * dy);
    const ring = Math.min(bands.length - 1, Math.floor(d / ringKm));
    r.levelBand = [...bands[ring]];
  }
}
```

The caller must set `region.centroidKm` before `assignLevelBands` — add that to `partitionRegions`'s census loop (`rec.centroidKm = [q(sumX / cells * cellKm), q(sumY / cells * cellKm)]`) as part of this task's diff.

- [ ] **Step 4: Write `tools/mapforge/lib/passes/roads.mjs`**

```js
// tools/mapforge/lib/passes/roads.mjs — P12: roads and sea lanes.
//
// A* on a cost raster, connected by Prim's algorithm so the network is a
// minimum spanning tree over the settlements of ONE continent — every
// settlement reachable, no redundant legs. Sea lanes connect the capitals
// across water by the same A* on the complementary raster.
import { FLAG, D8, idx } from "../grid.mjs";
import { q } from "../noise.mjs";

const SLOPE_PENALTY = 26;
const RIVER_CROSSING = 6;

class MinHeap {
  constructor() { this.v = []; this.i = []; }
  get size() { return this.v.length; }
  less(a, b) { return this.v[a] < this.v[b] || (this.v[a] === this.v[b] && this.i[a] < this.i[b]); }
  swap(a, b) { const tv = this.v[a]; this.v[a] = this.v[b]; this.v[b] = tv;
               const ti = this.i[a]; this.i[a] = this.i[b]; this.i[b] = ti; }
  push(v, i) { this.v.push(v); this.i.push(i); let c = this.v.length - 1;
               while (c > 0) { const p = (c - 1) >> 1; if (!this.less(c, p)) break; this.swap(c, p); c = p; } }
  pop() { const value = this.v[0], index = this.i[0]; const lv = this.v.pop(), li = this.i.pop();
          if (this.v.length) { this.v[0] = lv; this.i[0] = li; let p = 0;
            for (;;) { const l = 2 * p + 1, r = l + 1; let m = p;
              if (l < this.v.length && this.less(l, m)) m = l;
              if (r < this.v.length && this.less(r, m)) m = r;
              if (m === p) break; this.swap(p, m); p = m; } }
          return { value, index }; }
}

// Dijkstra (A* with a zero heuristic — admissible, and one fewer place for a
// non-determinism to hide). `passable` decides land vs sea routing.
function shortestPath({ grid, from, to, passable }) {
  const dist = new Float64Array(grid.n).fill(Infinity);
  const prev = new Int32Array(grid.n).fill(-1);
  const heap = new MinHeap();
  dist[from] = 0; heap.push(0, from);
  while (heap.size) {
    const { value, index } = heap.pop();
    if (value > dist[index]) continue;
    if (index === to) break;
    const cx = index % grid.w, cy = (index / grid.w) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + D8[d][0], ny = cy + D8[d][1];
      if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
      const ni = ny * grid.w + nx;
      if (!passable(ni)) continue;
      const diag = D8[d][0] !== 0 && D8[d][1] !== 0;
      const drop = grid.elev[ni] - grid.elev[index];
      const slope = drop > 0 ? drop : -drop;
      const river = (grid.flags[ni] & FLAG.RIVER) !== 0 ? RIVER_CROSSING : 0;
      const cost = (diag ? 1.4142135623730951 : 1) * grid.cellKm * (1 + SLOPE_PENALTY * slope) + river;
      const nd = value + cost;
      if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = index; heap.push(nd, ni); }
    }
  }
  if (dist[to] === Infinity) return null;
  const path = [];
  for (let i = to; i !== -1; i = prev[i]) path.push(i);
  path.reverse();
  return { path, cost: dist[to] };
}

const toKm = ({ grid, i }) => [q(((i % grid.w) + 0.5) * grid.cellKm), q((((i / grid.w) | 0) + 0.5) * grid.cellKm)];
const pathKm = ({ grid, path }) => {
  let km = 0;
  for (let n = 1; n < path.length; n++) {
    const a = toKm({ grid, i: path[n - 1] }), b = toKm({ grid, i: path[n] });
    km += Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
  }
  return q(km);
};

export function routeRoads({ grid, settlements, regions }) {
  const roads = [], seaLanes = [];
  const byCont = new Map();
  for (const s of settlements) {
    if (!byCont.has(s.continent)) byCont.set(s.continent, []);
    byCont.get(s.continent).push(s);
  }
  const conts = [...byCont.keys()].sort();
  for (const cont of conts) {
    const list = byCont.get(cont).slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    if (list.length < 2) continue;
    // Prim: grow from the lowest id, always adding the cheapest reachable
    // unconnected settlement. Deterministic — ties break on the target id.
    const inTree = new Set([list[0].id]);
    let n = 0;
    while (inTree.size < list.length) {
      let best = null;
      for (const a of list) {
        if (!inTree.has(a.id)) continue;
        for (const b of list) {
          if (inTree.has(b.id)) continue;
          const r = shortestPath({
            grid, from: idx({ grid, cx: a.cell[0], cy: a.cell[1] }),
            to: idx({ grid, cx: b.cell[0], cy: b.cell[1] }),
            passable: (i) => (grid.flags[i] & FLAG.SEA) === 0,
          });
          if (!r) continue;
          if (best === null || r.cost < best.cost || (r.cost === best.cost && b.id < best.b.id))
            best = { a, b, ...r };
        }
      }
      if (best === null) break;   // an island settlement: sea lane, not road
      inTree.add(best.b.id);
      roads.push({ id: `${cont}/rd${String(++n).padStart(2, "0")}`, continent: cont,
                   from: best.a.id, to: best.b.id, km: pathKm({ grid, path: best.path }),
                   points: best.path.map((i) => toKm({ grid, i })) });
    }
  }
  // Sea lanes: capitals, in id order, chained.
  const capitals = settlements.filter((s) => s.rank === "capital").sort((a, b) => (a.id < b.id ? -1 : 1));
  for (let i = 1; i < capitals.length; i++) {
    const r = shortestPath({
      grid, from: idx({ grid, cx: capitals[i - 1].cell[0], cy: capitals[i - 1].cell[1] }),
      to: idx({ grid, cx: capitals[i].cell[0], cy: capitals[i].cell[1] }),
      passable: (j) => (grid.flags[j] & FLAG.SEA) !== 0 || true,   // start/end are land
    });
    if (!r) continue;
    seaLanes.push({ id: `lane-${String(i).padStart(2, "0")}`, from: capitals[i - 1].id, to: capitals[i].id,
                    km: pathKm({ grid, path: r.path }), points: r.path.map((j) => toKm({ grid, i: j })) });
  }
  return { roads, seaLanes };
}
```

- [ ] **Step 5: Write `tools/mapforge/lib/passes/dungeons.mjs`**

```js
// tools/mapforge/lib/passes/dungeons.mjs — P13: dungeon anchoring.
//
// Two cheap assertions, exactly as G-DUNGEON-REACH will re-check them
// (spec §5.8): (1) the entrance resolves to a landform whose lexicon row is
// dungeonCapable; (2) BFS over the REGION ADJACENCY GRAPH finds a settlement
// within 2 hops. A dungeon is NEVER a spine node — making it one would drag
// its area into the composition rollup and the quadratic overlap check.
import { hashNoise2D } from "../noise.mjs";
import { mintSeed } from "../seed.mjs";

export const MAX_HOPS = 2;

function hopsToSettlement({ regions, settlements }) {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const hops = new Map();
  const queue = [];
  const settled = new Set(settlements.map((s) => s.region));
  for (const rid of [...settled].sort()) { hops.set(rid, 0); queue.push(rid); }
  for (let qi = 0; qi < queue.length; qi++) {
    const rid = queue[qi];
    const h = hops.get(rid);
    for (const a of (byId.get(rid)?.adjacent ?? []).slice().sort()) {
      if (hops.has(a)) continue;
      hops.set(a, h + 1);
      queue.push(a);
    }
  }
  return hops;
}

export function anchorDungeons({ instances, regions, settlements, lexicon, manifest, stream }) {
  const problems = [];
  const capable = new Set(lexicon.filter((t) => t.dungeonCapable).map((t) => t.id));
  const hops = hopsToSettlement({ regions, settlements });
  const want = manifest.quotas.dungeons.complexes;

  const eligible = instances.filter((inst) => {
    if (!capable.has(inst.type)) return false;
    const h = hops.get(inst.region);
    return h !== undefined && h <= MAX_HOPS;
  });
  const dStream = mintSeed({ parentStream: stream, name: "dungeons" });
  const scored = eligible.map((inst) => [hashNoise2D({ x: inst.cell[0] * 0.83, y: inst.cell[1] * 0.83, stream: dStream }), inst]);
  scored.sort((a, b) => (b[0] - a[0]) || (a[1].handle < b[1].handle ? -1 : 1));

  // Spread across regions: at most 3 per region before a second round.
  const perRegion = new Map();
  const anchors = [];
  for (let round = 1; round <= 3 && anchors.length < want; round++) {
    for (const [, inst] of scored) {
      if (anchors.length >= want) break;
      if (anchors.some((a) => a.handle === inst.handle)) continue;
      if ((perRegion.get(inst.region) ?? 0) >= round) continue;
      perRegion.set(inst.region, (perRegion.get(inst.region) ?? 0) + 1);
      // `entranceType` and `hopsToSettlement` are SERIALISED, not re-derivable
      // downstream: Plan D's G-DUNGEON-REACH reads both straight off this row
      // rather than walking the adjacency graph a second time with its own
      // copy of the settlement->region join. `null` means unreachable at any
      // distance, which reads differently from "3 hops" and must not collapse
      // into a number.
      anchors.push({ handle: inst.handle, continent: inst.region.split("/")[0],
                     region: inst.region, entranceType: inst.type,
                     hopsToSettlement: hops.get(inst.region) ?? null });
    }
  }
  anchors.sort((a, b) => (a.handle < b.handle ? -1 : 1));
  if (anchors.length < want)
    problems.push(`dungeons: only ${anchors.length} of ${want} complexes could be anchored — ` +
      `${eligible.length} dungeonCapable instances lie within ${MAX_HOPS} region hops of a settlement`);
  return { anchors, problems };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test 'tools/mapforge/tests/settlements.test.mjs'`
Expected: PASS — 12 tests.

- [ ] **Step 7: Commit**

```bash
git add tools/mapforge/lib/passes/settlements.mjs tools/mapforge/lib/passes/roads.mjs \
        tools/mapforge/lib/passes/dungeons.mjs tools/mapforge/lib/passes/partition.mjs \
        tools/mapforge/tests/settlements.test.mjs
git commit -m "feat: P11 settlements, P12 roads and sea lanes, P13 dungeon anchors"
```

#### Task 9 quality gate

- [ ] **Step 8: Verify**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_content.mjs --only=spine
node scripts/check_spine_emit.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
```

- [ ] **Step 9: Independent adversarial review**

Brief: *`routeRoads` runs a full Dijkstra per candidate pair per Prim step — that is O(V² × grid) and at 11 settlements on an 800 × 800 grid it is 121 × 640,000 heap operations per continent. Measure it; it will not fit the 4 s budget. Replace it with one multi-source Dijkstra per already-in-tree frontier. The sea-lane `passable` callback is `(j) => ... || true`, which passes everything including land — is that intentional (start and end are land) and does it let a lane cut across a continent? Fix it to allow land only at the two endpoints. `waterFetchKm` returns `Infinity` when no D8 ray starts in water — confirm the caller cannot then score a landlocked cell as a port. `assignLevelBands` requires `region.centroidKm`, which this task adds to `partitionRegions` — confirm the addition is present, quantised, and that Task 7's tests still pass. Confirm `placeSettlements`'s `farEnough` compares against ALL taken settlements rather than same-tier only, and decide which the spec means (it says "tiered minimum separation", so same-tier; a village 3 km from a capital is fine).*

- [ ] **Step 10: Refactor** — fix the road routing complexity and the sea-lane passability; adjust `farEnough` to the decided semantics and update the test to match.

- [ ] **Step 11: Re-verify** — re-run Step 8; time `routeRoads` on the real grid, under 800 ms.

- [ ] **Step 12: Commit and report**

```bash
git add -A && git commit -m "refactor: settlement and road routing review findings"
git branch --show-current && git log --oneline -1
```

---

### Task 10: P14 — fabric emission and the `generate-world.mjs` CLI

The generator **stops merging onto the live root and builds a complete content root from scratch**, reading exactly four things: `n-atlas.json` (the frozen frame and its seed streams), `content/world/premises/*.json`, `content/world/{civil,relations}/**` (empty in Plan C), and **the runtime subtree copied verbatim** — identified by root membership from `roots.json`, never by a pinned id list. All three of today's hardcodes dissolve at that moment: `SYNTHETIC_LOAD_BUDGET` (`tools/mapforge/gen-world.mjs:32`) because the output *is* the whole tree so the real budget file can be read; `PRE_WORLD_ATLAS_CHILDREN` (`:60`) because there is no previous output to subtract; `PRE_WORLD_SEALANE_ID` (`:67`) because runtime edges are identified by root membership.

**Files:**
- Create: `tools/mapforge/lib/fabric.mjs`
- Create: `tools/mapforge/generate-world.mjs`
- Test: `tools/mapforge/tests/generate-world.test.mjs`
- Modify: `scripts/lib/spine.mjs:39` (`DEPTH_EXCEPTIONS` gains `continent>town`)
- Modify: `.gitignore:12` (explicit `build/mapforge/`) and `.gitignore:125` (delete the retired `content/spine/candidates/` rule)

**Interfaces:**
- Consumes: every pass from Tasks 3–9; `canonicalNode`, `canonStringify` from `scripts/check_spine_emit.mjs:24,55`; `buildTree` from `scripts/lib/spine.mjs:238`; `pointInRing` from `scripts/lib/geometry.mjs` (Plan A); `GENERATOR_VERSION` from `tools/mapforge/lib/version.mjs` (Plan B)
- Produces:
```js
export function runPasses({ manifest, premises, pinned = [], relations = [] }): WorldRun
export function writeRun({ run, outDir, repoRoot, resolved = null, sheets = [] }): { files: string[] }
export function runIdOf({ seed, version }): string     // `${seed.slice(0,8)}-${version}`
export function preservedChartNodes({ repoRoot, live }): Set<string>
export function buildWaterTrunk({ manifest, grid, generator }): { nodes, problems }
export const townFeatureId = (slug) => `f-town-${slug}`   // the id grammar Plan E's edges point at
// tools/mapforge/lib/fabric.mjs additionally exports:
//   oceanSeedCell, seaSeedCell, assignByQuota, ringsFromOwner, MAX_TRUNK_RING_POINTS
// CLI: node tools/mapforge/generate-world.mjs --seed <hex16> --out build/mapforge/<runId> [--no-png] [--stage-report]
```

**Three things this task emits that later plans depend on, and that a "13 continents" reading of P14 silently drops:**

1. **The water trunk — 3 ocean + 9 sea nodes.** The committed closure `65,600 + 91,200 + 3,200 = 160,000` has nothing behind the 91,200 unless three ocean polygons exist. Without them the promoted world's interstitial is ~94,400 km² (59%) against a budget of 3,200 (2.00%) and `G-ATLAS-ROLLUP`'s ±2 pp cannot hold — while `G-SEALAND` still passes, because it measures the fabric cell census, not the polygons. `n-westsea` is emitted at `tier: "sea"`, the first real use of the declared-but-empty tier.
2. **The three preserved chart anchors.** `promote-world.mjs` step 2 deletes every `n-atlas` descendant absent from the draft. `n-thornveil`, `n-northern-icefield` and `n-millcross` are not runtime nodes, so root membership does not save them — and `scripts/lib/spine.mjs:874-877` hard-fails `G-ALIAS` when a `representsNodeId` target vanishes, while `check_content.mjs:1192` joins the Millcross town plan on its `spineId`. They are discovered by scanning for those two pointer kinds, never by a hardcoded id list.
3. **One `f-town-<slug>` point feature per settlement.** `gSpineNet` (`check_content.mjs:1986-1999`) resolves road and `leg` edge endpoints against `node.features`. Plan E's canon-leg re-fit points its 7 `leg` edges and 8 `road` edges at `{ "feature": "f-town-gildmark" }`; if `features` is `[]`, `G-NET` and `G-CANON-LEG` both go red at the redraw commit with no fix available inside Plan E.

The census these three produce is **36 node files** — `1 world + 13 continent + 3 ocean + 9 sea + 2 region + 1 town + 1 playroot + 1 playspace + 3 site + 2 fixture` — which is byte-identical to the `content/spine/trunk-census.json` Plan E commits, and Step 1's first test asserts it here so the two can never drift.

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/generate-world.test.mjs`:

```js
// tools/mapforge/tests/generate-world.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shoelaceArea } from "../../../scripts/lib/spine.mjs";
import { exactIntersectionArea } from "../../../scripts/lib/geometry.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = join(ROOT, "tools/mapforge/generate-world.mjs");
const GATE = join(ROOT, "scripts/check_content.mjs");
const SEED = "7c9e4a2f8b1d6e03";

function generate(out) {
  return execFileSync(process.execPath, [CLI, "--seed", SEED, "--out", out, "--no-png", "--stage-report"],
    { encoding: "utf8", cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
}

test("the CLI builds a COMPLETE content root, not a candidate pile", { timeout: 240000 }, () => {
  const out = mkdtempSync(join(tmpdir(), "genw-"));
  try {
    const log = generate(out);
    assert.match(log, /generate-world: OK/);
    for (const p of ["content/spine/nodes", "content/spine/edges.json", "content/spine/roots.json",
                     "content/spine/load-budget.json", "content/spine/coverage-budget.json",
                     "content/schemas/spine-node.schema.json",
                     "content/world/fabric/world.json", "content/world/manifest.json",
                     "manifest.json", "report.md", "baseline"])
      assert.ok(existsSync(join(out, p)), `draft root is missing ${p}`);
    const fabric = readdirSync(join(out, "content/world/fabric")).sort();
    assert.equal(fabric.length, 14, `expected 13 continents + world.json, got ${fabric.join(",")}`);
    const handles = readdirSync(join(out, "content/world/handles")).sort();
    assert.equal(handles.length, 13);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("the REAL spine gate is green on the draft root", { timeout: 240000 }, () => {
  const out = mkdtempSync(join(tmpdir(), "genw-gate-"));
  try {
    generate(out);
    const log = execFileSync(process.execPath, [GATE, "--only=spine", "--content-root", join(out, "content")],
      { encoding: "utf8", cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
    assert.match(log, /0 failures/);
    assert.match(log, /G-SEALAND/);       // the report line, not a failure
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("the run manifest carries the seed, sea level, ratio and a hash per file", { timeout: 240000 }, () => {
  const out = mkdtempSync(join(tmpdir(), "genw-man-"));
  try {
    generate(out);
    const m = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    assert.equal(m.seed, SEED);
    assert.equal(typeof m.seaLevel, "number");
    assert.ok(m.seaToLandRatio >= 1.2 && m.seaToLandRatio <= 1.8, `ratio ${m.seaToLandRatio} outside the band`);
    assert.equal(m.landKm2 + m.waterKm2, 160000);
    assert.equal(Object.keys(m.hashes).length > 20, true);
    for (const h of Object.values(m.hashes)) assert.match(h, /^sha256:[0-9a-f]{64}$/);
    assert.ok(m.timings.total < 8000, `generation took ${m.timings.total} ms, fail threshold is 8000`);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("all 13 landmasses sit within +/-3% of their manifest netKm2", { timeout: 240000 }, () => {
  const out = mkdtempSync(join(tmpdir(), "genw-area-"));
  try {
    generate(out);
    const world = JSON.parse(readFileSync(join(out, "content/world/fabric/world.json"), "utf8"));
    const man = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
    assert.equal(world.continents.length, 13);
    for (const c of world.continents) {
      const want = man.landmasses.find((l) => l.id === c.id);
      const got = c.grossLandKm2 - (want.interiorWaterKm2 ?? 0);
      const pct = Math.abs(got - want.netKm2) / want.netKm2 * 100;
      assert.ok(pct <= 3, `${c.id}: ${got} km2 vs manifest ${want.netKm2} (${pct.toFixed(1)}%, tolerance 3%)`);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("the owner histogram identity holds: sum + unowned === 640000", { timeout: 240000 }, () => {
  const out = mkdtempSync(join(tmpdir(), "genw-hist-"));
  try {
    generate(out);
    const dir = join(out, "content/world/fabric");
    let owned = 0, unowned = 0, lake = 0;
    for (const f of readdirSync(dir)) {
      if (f === "world.json") continue;
      const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
      owned += Object.values(d.ownerHistogram).reduce((a, b) => a + b, 0);
      unowned += d.cellCensus.unowned;
      lake += d.cellCensus.lake;
    }
    const world = JSON.parse(readFileSync(join(dir, "world.json"), "utf8"));
    assert.equal(owned + unowned + world.census.seaCells, 640000,
      "the cell partition is not exact — a cell is in two regions or none");
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("the draft trunk carries generator.fabric provenance on every continent node", { timeout: 240000 }, () => {
  const out = mkdtempSync(join(tmpdir(), "genw-prov-"));
  try {
    generate(out);
    const dir = join(out, "content/spine/nodes");
    const conts = readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")))
      .filter((n) => n.tier === "continent");
    assert.equal(conts.length, 13);
    for (const n of conts) {
      assert.equal(n.provenance.authored, "generated");
      assert.equal(typeof n.provenance.generator.name, "string");
      assert.equal(typeof n.provenance.generator.version, "string");
      assert.match(n.provenance.generator.fabric, /^content\/world\/fabric\/continent-\d\d\.json$/);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("the runtime subtree is copied VERBATIM, byte for byte", { timeout: 240000 }, () => {
  const out = mkdtempSync(join(tmpdir(), "genw-rt-"));
  try {
    generate(out);
    const live = join(ROOT, "content/spine/nodes");
    const draft = join(out, "content/spine/nodes");
    // n-playroot and every descendant, found by root membership.
    const all = readdirSync(live).map((f) => ({ f, doc: JSON.parse(readFileSync(join(live, f), "utf8")) }));
    const byParent = new Map();
    for (const { doc } of all) {
      if (!byParent.has(doc.parentId)) byParent.set(doc.parentId, []);
      byParent.get(doc.parentId).push(doc.id);
    }
    const stack = ["n-playroot"], runtime = [];
    while (stack.length) { const id = stack.pop(); runtime.push(id); for (const c of byParent.get(id) ?? []) stack.push(c); }
    assert.ok(runtime.length >= 5, `only ${runtime.length} runtime nodes found`);
    for (const id of runtime)
      assert.equal(readFileSync(join(draft, `${id}.json`), "utf8"),
                   readFileSync(join(live, `${id}.json`), "utf8"), `${id} was not copied verbatim`);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("the draft trunk is EXACTLY 36 node files, with the per-tier tally Plan E commits", () => {
  const out = mkdtempSync(join(tmpdir(), "genw-census-"));
  try {
    generate(out);
    const dir = join(out, "content/spine/nodes");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    const tally = {};
    for (const f of files) {
      const n = JSON.parse(readFileSync(join(dir, f), "utf8"));
      tally[n.tier] = (tally[n.tier] ?? 0) + 1;
    }
    // 1 world + 13 continent + 3 ocean + 9 sea + 2 alias-anchor regions
    // + 1 town + 1 playroot + 1 playspace + 3 site + 2 fixture = 36.
    // Plan E's content/spine/trunk-census.json is byte-identical to this.
    assert.deepEqual(tally, {
      world: 1, continent: 13, ocean: 3, sea: 9, region: 2, town: 1,
      playroot: 1, playspace: 1, site: 3, fixture: 2,
    }, files.sort().join("\n"));
    assert.equal(files.length, 36);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("the three preserved chart anchors survive generation, re-parented not deleted", () => {
  const out = mkdtempSync(join(tmpdir(), "genw-anchor-"));
  try {
    generate(out);
    const dir = join(out, "content/spine/nodes");
    // X2: two representsNodeId targets; X4: the town-plan spineId host.
    // scripts/lib/spine.mjs:874-877 pushes a hard G-ALIAS ERROR if either of
    // the first two vanishes; check_content.mjs:1192 joins on the third.
    for (const id of ["n-thornveil", "n-northern-icefield", "n-millcross"]) {
      const p = join(dir, `${id}.json`);
      assert.ok(existsSync(p), `${id} was deleted — G-ALIAS or T1 will go red`);
      const n = JSON.parse(readFileSync(p, "utf8"));
      const parent = JSON.parse(readFileSync(join(dir, `${n.parentId}.json`), "utf8"));
      assert.equal(parent.tier, "continent", `${id} must hang off a generated continent`);
      assert.equal(n.frozen, false, `${id} must be unfrozen in the draft`);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("the water trunk closes the frame budget: 3 oceans summing to 91,200, 9 nested seas", () => {
  const out = mkdtempSync(join(tmpdir(), "genw-water-"));
  try {
    generate(out);
    const dir = join(out, "content/spine/nodes");
    const nodes = readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
    const oceans = nodes.filter((n) => n.tier === "ocean");
    const seas = nodes.filter((n) => n.tier === "sea");
    assert.equal(oceans.length, 3);
    assert.equal(seas.length, 9);
    const area = (n) => Math.abs(shoelaceArea({ points: n.placement.points }));
    const total = oceans.reduce((a, n) => a + area(n), 0);
    const man = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
    const pct = Math.abs(total - man.budget.oceanPolygonKm2) / man.budget.oceanPolygonKm2 * 100;
    assert.ok(pct <= 3, `ocean polygons total ${total.toFixed(1)} km2 vs budget ${man.budget.oceanPolygonKm2} (${pct.toFixed(1)}%)`);
    // G-CONTAIN: every sea ring is a strict subset of its parent ocean's ring.
    // Proved by the exact clipper, not by bbox: intersection area must equal
    // the sea's own area (to the quantisation floor), and the parent must be
    // the ocean the manifest names.
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const s of seas) {
      const row = man.seas.find((x) => x.nodeId === s.id);
      assert.ok(row, `sea node ${s.id} is not in the manifest`);
      const ocean = byId.get(s.parentId);
      assert.equal(ocean.tier, "ocean");
      assert.equal(ocean.id, man.oceans.find((o) => o.id === row.ocean).nodeId);
      const inter = exactIntersectionArea({ a: s.placement, b: ocean.placement });
      assert.ok(Math.abs(inter - area(s)) < 0.5,
        `${s.id} is not contained in ${ocean.id}: intersection ${inter.toFixed(2)} vs own area ${area(s).toFixed(2)}`);
    }
    // n-westsea is DEMOTED to the sea tier — the first real use of it.
    const west = byId.get("n-westsea");
    assert.equal(west.tier, "sea");
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("the frame residual equals the committed interstitial budget", () => {
  const out = mkdtempSync(join(tmpdir(), "genw-resid-"));
  try {
    generate(out);
    const dir = join(out, "content/spine/nodes");
    const nodes = readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
    const area = (n) => Math.abs(shoelaceArea({ points: n.placement.points }));
    const land = nodes.filter((n) => n.tier === "continent").reduce((a, n) => a + area(n), 0);
    const ocean = nodes.filter((n) => n.tier === "ocean").reduce((a, n) => a + area(n), 0);
    const man = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
    const residual = 160000 - land - ocean;   // seas are SUBSETS, never added again
    const want = man.budget.interstitialKm2;
    assert.ok(Math.abs(residual - want) / want <= 0.25,
      `interstitial ${residual.toFixed(1)} km2 vs budget ${want} — without the ocean polygons this is ~94,400 and G-ATLAS-ROLLUP cannot hold`);
    // The 2.00% interstitial must stay clear of check_content.mjs:2161's
    // 0.5% threshold in BOTH directions.
    assert.ok(residual / 160000 > 0.005, "an interstitial at or below 0.5% is FORBIDDEN to be declared");
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("every settlement gets an f-town-<slug> point feature on its continent node", () => {
  const out = mkdtempSync(join(tmpdir(), "genw-feat-"));
  try {
    generate(out);
    const nodesDir = join(out, "content/spine/nodes");
    const fabDir = join(out, "content/world/fabric");
    const conts = readdirSync(nodesDir).map((f) => JSON.parse(readFileSync(join(nodesDir, f), "utf8")))
      .filter((n) => n.tier === "continent");
    let settlements = 0;
    for (const f of readdirSync(fabDir)) {
      if (f === "world.json") continue;
      settlements += JSON.parse(readFileSync(join(fabDir, f), "utf8")).settlements.length;
    }
    assert.equal(settlements, 45, "the manifest quota is 45 settlements");
    const feats = conts.flatMap((n) => n.features);
    assert.equal(feats.length, 45, "trunk features ARE the network — gSpineNet resolves road and leg edge endpoints against node.features");
    for (const f of feats) {
      assert.match(f.id, /^f-town-[a-z0-9-]+$/);
      assert.equal(f.kind, "point");
      assert.equal(f.type, null, "a settlement is not a landform");
      assert.equal(f.at.length, 2);
    }
    assert.equal(new Set(feats.map((f) => f.id)).size, 45, "feature ids must be unique");
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("every fabric file carries a pinReceipts array, empty in Plan C", () => {
  const out = mkdtempSync(join(tmpdir(), "genw-receipt-"));
  try {
    generate(out);
    const dir = join(out, "content/world/fabric");
    for (const f of readdirSync(dir)) {
      if (f === "world.json") continue;
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
      // Plan D's G-PIN-SAT reads this key. If it is not serialised the gate
      // has nothing to check and passes vacuously on all 40 pinned records.
      assert.ok(Array.isArray(doc.pinReceipts), `${f} has no pinReceipts array`);
      assert.equal(doc.pinReceipts.length, 0, "Plan C has no pinned layer yet");
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("the draft folder holds the DRAWINGS, not just the data", () => {
  const out = mkdtempSync(join(tmpdir(), "genw-sheets-"));
  try {
    generate(out);
    // Spec §7.4 lists seven contents; the two easiest to skip are the two a
    // human actually reviews. "Two seeds sit side by side, diffable in place"
    // is only true of the data unless the sheets land here too.
    for (const p of ["sheets/fabric.svg", "sheets/overlay.svg"])
      assert.ok(existsSync(join(out, p)), `draft folder is missing ${p}`);
    const m = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    for (const p of ["sheets/fabric.svg", "sheets/overlay.svg"])
      assert.match(m.hashes[p] ?? "", /^sha256:[0-9a-f]{64}$/, `${p} is not hashed in the run manifest`);
    // SVG only — a raster in the review loop is 18 s and 8 MB per sheet.
    assert.ok(!existsSync(join(out, "sheets/fabric.png")));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("--stage-report prints per-stage budgets from budgets.json, not a constant", () => {
  const out = mkdtempSync(join(tmpdir(), "genw-budget-"));
  try {
    const log = generate(out);
    const b = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
    const gen = b.loop.find((r) => r.stage === "generate");
    assert.match(log, new RegExp(`stage: generate TOTAL \\d+ ms \\(budget ${gen.budgetMs}, fail ${gen.failMs}\\)`));
    const sh = b.loop.find((r) => r.stage === "sheets");
    assert.match(log, new RegExp(`stage: sheets \\d+ ms \\(budget ${sh.budgetMs}, fail ${sh.failMs}\\)`));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("SYNTHETIC_LOAD_BUDGET, PRE_WORLD_ATLAS_CHILDREN and PRE_WORLD_SEALANE_ID are gone", () => {
  const src = readFileSync(CLI, "utf8");
  for (const bad of ["SYNTHETIC_LOAD_BUDGET", "PRE_WORLD_ATLAS_CHILDREN", "PRE_WORLD_SEALANE_ID"])
    assert.ok(!src.includes(bad), `${bad} survived into generate-world.mjs`);
});

test("--stage-report prints one line per pass with a millisecond figure", { timeout: 240000 }, () => {
  const out = mkdtempSync(join(tmpdir(), "genw-stage-"));
  try {
    const log = generate(out);
    for (const p of ["P1", "P3", "P6", "P9", "P10", "P11", "P14"])
      assert.match(log, new RegExp(`stage: ${p} \\S+ \\d+ ms`), `no stage line for ${p}`);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'tools/mapforge/tests/generate-world.test.mjs'`
Expected: FAIL — `ENOENT ... tools/mapforge/generate-world.mjs`.

---

#### Task 10a — `fabric.mjs`: ring building, the water partition, `buildFabricFile`

**This half lands as its own commit with its own quality gate.** It is a pure library: rings in, rings out, no CLI, no filesystem beyond what `arcs.mjs` already needs. Reviewing it alongside a 300-line CLI is how the two expected findings (the feature-endpoint edge filter and the slug collision guard) get lost in the noise.

**Scope:** Steps 3 and 3a below, plus the gate at Steps 3g1–3g4.
**Commit subject:** `feat: P14 ring building, water partition and the fabric writer`

- [ ] **Step 3: Write `tools/mapforge/lib/fabric.mjs`**

```js
// tools/mapforge/lib/fabric.mjs — P14: arcs -> polygons -> fabric + trunk.
//
// Two outputs from one topology: the FABRIC (regions, instances,
// settlements, roads — the shapes that get drawn) and the TRUNK (13
// continent polygons, 3 oceans, 9 seas — the spine nodes the gate walks).
// The trunk polygon is GENERATED, simplified from the fabric contour, which
// is the only reading under which G-TRUNK-AREA's +/-3% makes sense
// (spec §11 lower-stakes table).
import { createHash } from "node:crypto";
import { extractArcs, simplifyArc, assembleRings, fractalise, DP_EPSILON_KM } from "./arcs.mjs";
import { FLAG } from "./grid.mjs";
import { q } from "./noise.mjs";
import { shoelaceArea } from "../../../scripts/lib/spine.mjs";

export const MAX_TRUNK_RING_POINTS = 800;   // G-VERTEX-BUDGET, world-tier children
export const MAX_REGION_RING_POINTS = 200;

const quantiseRing = (ring) => ring.map(([x, y]) => [q(x), q(y)]);

// Simplify a ring until it fits a vertex cap, doubling epsilon each pass.
// Deterministic and bounded: 12 doublings from 0.35 km is 1,433 km, larger
// than the frame, so the loop always terminates.
function fitVertexCap({ ring, cap, epsilonKm = DP_EPSILON_KM }) {
  let out = ring, eps = epsilonKm;
  for (let n = 0; n < 12 && out.length > cap; n++) {
    out = simplifyArc({ points: [...out, out[0]], epsilonKm: eps });
    out.pop();
    eps *= 2;
  }
  return out;
}

// Region rings: one arc topology over grid.owner, so shared boundaries are
// bit-identical between neighbours and no sliver can exist.
export function buildRegionRings({ grid, regions }) {
  const { arcs } = extractArcs({ owner: grid.owner, w: grid.w, h: grid.h, cellKm: grid.cellKm });
  const simplified = arcs.map((a) => ({ ...a, points: simplifyArc({ points: a.points, epsilonKm: DP_EPSILON_KM }) }));
  const out = new Map();
  regions.forEach((rec, n) => {
    const rings = assembleRings({ arcs: simplified, ownerId: n });
    if (rings.length === 0) return;
    // Largest ring is the region body; smaller ones are enclaves the
    // partition should not have produced — reported, never silently kept.
    rings.sort((a, b) => shoelaceArea({ points: b }) - shoelaceArea({ points: a }));
    out.set(rec.id, { ring: quantiseRing(fitVertexCap({ ring: rings[0], cap: MAX_REGION_RING_POINTS })),
                      extraRings: rings.length - 1 });
  });
  return out;
}

// Continent rings: a SECOND arc topology, over a plate field where every
// land cell of continent k is owner k and everything else is -1. Coast arcs
// (the ones bordering -1) get the fractal detail; interior arcs do not.
export function buildContinentRings({ grid, premises, stream }) {
  const plateOwner = new Int16Array(grid.n).fill(-1);
  for (let i = 0; i < grid.n; i++)
    if (grid.plate[i] >= 0 && (grid.flags[i] & FLAG.SEA) === 0) plateOwner[i] = grid.plate[i];
  const { arcs } = extractArcs({ owner: plateOwner, w: grid.w, h: grid.h, cellKm: grid.cellKm });
  const detailed = arcs.map((a) => {
    const simplified = simplifyArc({ points: a.points, epsilonKm: DP_EPSILON_KM });
    const isCoast = a.left === -1 || a.right === -1;
    return { ...a, points: isCoast
      ? fractalise({ arc: { ...a, points: simplified }, amplitudeKm: 0.25, levels: 3, stream })
      : simplified };
  });
  const out = new Map();
  premises.forEach((p, k) => {
    const rings = assembleRings({ arcs: detailed, ownerId: k });
    if (rings.length === 0) return;
    rings.sort((a, b) => shoelaceArea({ points: b }) - shoelaceArea({ points: a }));
    out.set(p.id, { ring: quantiseRing(fitVertexCap({ ring: rings[0], cap: MAX_TRUNK_RING_POINTS })),
                    islands: rings.length - 1 });
  });
  return out;
}

// The committed fabric file for one continent. Every number has already
// passed q(); JSON.stringify + sha256 is the only thing left.
// `pinReceipts` is the measured fabric under each pinned record's seed point,
// SHAPE OWNED BY PLAN D (its placePinned/measureCell produce it), FILE OWNED
// HERE. G-PIN-SAT reads it, so if it is not serialised the gate has nothing to
// check. Empty array in Plan C, where no pinned layer exists yet.
export function buildFabricFile({ premise, generator, seaLevel, cellKm, census, ownerHistogram,
                                  regions, instances, settlements, roads, dungeonAnchors,
                                  outerRing = null, trunkRiver = null, pinReceipts = [] }) {
  return {
    continent: premise.id,
    premise: `content/world/premises/continent-${premise.id.slice(1)}.json`,
    generator, seaLevel: q(seaLevel), cellKm,
    cellCensus: census,
    ownerHistogram,
    // outerRing is the continent's own coast contour at FABRIC resolution —
    // the same contour the trunk polygon is simplified from, which is what
    // G-TRUNK-AREA's +/-3% pins the two together on. trunkRiver is the single
    // highest-flowAccumulation chain. Plan D's resolver reads both to fill the
    // `coastline` and `river` keys that tools/mapforge/lib/basin-sheet.mjs
    // dereferences UNCONDITIONALLY (:181, :157, :249) — emit them as null and
    // drawBasinSheet throws the exact TypeError Plan A Task 5 removed.
    outerRing, trunkRiver,
    regions, instances, settlements, roads, dungeonAnchors, pinReceipts,
  };
}

export function hashOf(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

// ── water-trunk helpers: partition sea cells, then trace rings ──────────────
// Used by buildWaterTrunk to produce the 3 ocean and 9 sea polygons. Kept
// here, next to the region and continent ring builders, because all four share
// the same arc topology and the same "shared boundaries are bit-identical"
// guarantee — an ocean and its neighbour ocean must not sliver either.

/** Deterministic seed cell for ocean `index`: the sea cell nearest the frame
 *  corner assigned to that ocean, scanned in row-major order so ties break on
 *  cell index exactly as the region partition's heap does. */
export function oceanSeedCell({ grid, index }) {
  // Three fixed anchors spread across the frame: NW, SE, NE in cell space.
  const anchors = [[0, 0], [grid.w - 1, grid.h - 1], [grid.w - 1, 0]];
  const [ax, ay] = anchors[index];
  let best = -1, bestD = Infinity;
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) === 0) continue;
    const x = i % grid.w, y = (i / grid.w) | 0;
    const d = (x - ax) * (x - ax) + (y - ay) * (y - ay);   // integer, exact
    if (d < bestD) { bestD = d; best = i; }                 // strict <: first index wins ties
  }
  return best;
}

/** Deterministic seed cell for sea `index` inside ocean `oceanIndex`: the
 *  unclaimed cell of that ocean with the LOWEST index whose 8-neighbourhood is
 *  entirely the same ocean, so a sea never seeds on the ocean's outer edge and
 *  its ring stays a strict interior subset. Falls back to the lowest unclaimed
 *  index if no interior cell remains. */
export function seaSeedCell({ grid, oceanOwner, oceanIndex, index }) {
  const stride = 1 + index;              // spread the nine seas deterministically
  let seen = 0, fallback = -1;
  for (let i = 0; i < grid.n; i++) {
    if (oceanOwner[i] !== oceanIndex) continue;
    if (fallback === -1) fallback = i;
    const x = i % grid.w, y = (i / grid.w) | 0;
    if (x === 0 || y === 0 || x === grid.w - 1 || y === grid.h - 1) continue;
    let interior = true;
    for (let dy = -1; dy <= 1 && interior; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (oceanOwner[i + dy * grid.w + dx] !== oceanIndex) { interior = false; break; }
    if (!interior) continue;
    if (++seen % stride === 0) return i;
  }
  return fallback;
}

/** Budgeted multi-source growth: exactly the region partition's algorithm, so
 *  there is ONE partition discipline in the codebase. One global binary heap
 *  keyed (cost, cellIndex) — the cell-index tiebreak is what makes the result
 *  independent of insertion order — each source stopping at its quota. */
export function assignByQuota({ grid, owner, seeds, quotas, mask, ownerValue = null }) {
  const heap = [];                       // [cost, cellIndex, sourceIndex]
  const push = (c, i, s) => {
    heap.push([c, i, s]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (cmp(heap[k], heap[p]) < 0) { const t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; } else break;
    }
  };
  const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]);
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let k = 0;
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < heap.length && cmp(heap[l], heap[m]) < 0) m = l;
        if (r < heap.length && cmp(heap[r], heap[m]) < 0) m = r;
        if (m === k) break; const t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; } }
    return top;
  };
  const taken = quotas.map(() => 0);
  seeds.forEach((cell, s) => { if (cell >= 0 && mask(cell)) push(0, cell, s); });
  while (heap.length) {
    const [cost, i, s] = pop();
    if (owner[i] !== -1 || !mask(i)) continue;
    if (taken[s] >= quotas[s]) continue;
    owner[i] = ownerValue === null ? s : ownerValue;
    taken[s]++;
    const x = i % grid.w, y = (i / grid.w) | 0;
    if (x > 0)            push(cost + 1, i - 1, s);
    if (x < grid.w - 1)   push(cost + 1, i + 1, s);
    if (y > 0)            push(cost + 1, i - grid.w, s);
    if (y < grid.h - 1)   push(cost + 1, i + grid.w, s);
  }
  return taken;
}

/** One arc topology over an owner field -> one simplified, quantised, vertex-
 *  capped ring per owner value. Shared arcs are traced once, so two adjacent
 *  oceans get bit-identical boundary vertices and cannot sliver. */
export function ringsFromOwner({ grid, owner, count, cap }) {
  const { arcs } = extractArcs({ owner, w: grid.w, h: grid.h, cellKm: grid.cellKm });
  const simplified = arcs.map((a) => ({ ...a, points: simplifyArc({ points: a.points, epsilonKm: DP_EPSILON_KM }) }));
  const out = new Map();
  for (let k = 0; k < count; k++) {
    const rings = assembleRings({ arcs: simplified, ownerId: k });
    if (rings.length === 0) continue;
    rings.sort((a, b) => shoelaceArea({ points: b }) - shoelaceArea({ points: a }));
    out.set(k, quantiseRing(fitVertexCap({ ring: rings[0], cap })));
  }
  return out;
}
```

- [ ] **Step 3a: Write `tools/mapforge/tests/fabric.test.mjs` — the library alone**

```js
// tools/mapforge/tests/fabric.test.mjs — Task 10a. The ring builders and the
// water partition, tested WITHOUT the CLI, on a small synthetic grid so a
// failure names a function rather than "the pipeline".
import { test } from "node:test";
import assert from "node:assert/strict";
import { assignByQuota, ringsFromOwner, buildFabricFile, oceanSeedCell, seaSeedCell } from "../lib/fabric.mjs";
import { makeGrid, FLAG } from "../lib/grid.mjs";
import { shoelaceArea } from "../../../scripts/lib/spine.mjs";
import { exactIntersectionArea } from "../../../scripts/lib/geometry.mjs";

// A 40 x 40 grid (0.5 km cells = 20 x 20 km) with a 10-cell-wide land bar
// down the middle and sea either side. Small enough to reason about by hand.
function seaGrid() {
  const g = makeGrid({ w: 40, h: 40, cellKm: 0.5 });
  for (let i = 0; i < g.n; i++) {
    const x = i % g.w;
    if (x < 15 || x >= 25) g.flags[i] |= FLAG.SEA;
  }
  return g;
}

test("assignByQuota respects quotas exactly and is insertion-order independent", () => {
  const g = seaGrid();
  const mask = (i) => (g.flags[i] & FLAG.SEA) !== 0;
  const a = new Int8Array(g.n).fill(-1);
  const takenA = assignByQuota({ grid: g, owner: a, seeds: [0, g.n - 1], quotas: [200, 300], mask });
  assert.deepEqual(takenA, [200, 300]);
  const b = new Int8Array(g.n).fill(-1);
  const takenB = assignByQuota({ grid: g, owner: b, seeds: [g.n - 1, 0], quotas: [300, 200], mask });
  // Same partition, sources swapped: the (cost, cellIndex) tiebreak means the
  // CELLS assigned to a given seed do not depend on which seed was pushed first.
  assert.deepEqual([...a].map((v) => (v === 0 ? "s0" : v === 1 ? "s1" : ".")),
                   [...b].map((v) => (v === 0 ? "s1" : v === 1 ? "s0" : ".")));
  assert.deepEqual(takenB, [300, 200]);
});

test("assignByQuota never crosses its mask", () => {
  const g = seaGrid();
  const owner = new Int8Array(g.n).fill(-1);
  assignByQuota({ grid: g, owner, seeds: [0], quotas: [g.n], mask: (i) => (g.flags[i] & FLAG.SEA) !== 0 });
  for (let i = 0; i < g.n; i++)
    if ((g.flags[i] & FLAG.SEA) === 0) assert.equal(owner[i], -1, `land cell ${i} was claimed by an ocean`);
});

test("ringsFromOwner produces positively-wound rings under the vertex cap", () => {
  const g = seaGrid();
  const owner = new Int8Array(g.n).fill(-1);
  assignByQuota({ grid: g, owner, seeds: [0], quotas: [600], mask: (i) => (g.flags[i] & FLAG.SEA) !== 0 });
  const rings = ringsFromOwner({ grid: g, owner, count: 1, cap: 60 });
  const ring = rings.get(0);
  assert.ok(ring.length >= 3 && ring.length <= 60, `ring has ${ring.length} vertices`);
  assert.ok(shoelaceArea({ points: ring }) > 0, "G-POLY requires a strictly positive signed shoelace");
});

test("a sea carved inside an ocean is CONTAINED in it, exactly", () => {
  const g = seaGrid();
  const oceanOwner = new Int8Array(g.n).fill(-1);
  assignByQuota({ grid: g, owner: oceanOwner, seeds: [oceanSeedCell({ grid: g, index: 0 })],
                  quotas: [g.n], mask: (i) => (g.flags[i] & FLAG.SEA) !== 0 });
  const seaOwner = new Int16Array(g.n).fill(-1);
  assignByQuota({ grid: g, owner: seaOwner,
                  seeds: [seaSeedCell({ grid: g, oceanOwner, oceanIndex: 0, index: 0 })],
                  quotas: [80], mask: (i) => oceanOwner[i] === 0 && seaOwner[i] === -1, ownerValue: 0 });
  const oRing = ringsFromOwner({ grid: g, owner: oceanOwner, count: 1, cap: 160 }).get(0);
  const sRing = ringsFromOwner({ grid: g, owner: seaOwner, count: 1, cap: 160 }).get(0);
  const poly = (points) => ({ shape: "polygon", points, anchor: points[0] });
  const own = shoelaceArea({ points: sRing });
  const inter = exactIntersectionArea({ a: poly(sRing), b: poly(oRing) });
  assert.ok(Math.abs(inter - own) < 0.25,
    `the sea is not a subset of its ocean: intersection ${inter} vs own area ${own}`);
});

test("buildFabricFile emits pinReceipts even when no pinned layer exists", () => {
  const doc = buildFabricFile({
    premise: { id: "c03" }, generator: { name: "mapforge", version: "3.0.0" },
    seaLevel: 0.4213, cellKm: 0.5, census: { land: 1, lake: 0, unowned: 0 },
    ownerHistogram: {}, regions: [], instances: [], settlements: [], roads: [], dungeonAnchors: [],
  });
  assert.deepEqual(doc.pinReceipts, [], "G-PIN-SAT reads this key; an absent key makes it pass vacuously");
  assert.equal(doc.continent, "c03");
  assert.equal(doc.premise, "content/world/premises/continent-03.json");
});
```

- [ ] **Step 3g1: Verify Task 10a**

```bash
node --test 'tools/mapforge/tests/fabric.test.mjs'
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
node scripts/check_spine_emit.mjs --check | tail -1
(cd colyseus-server && npm test -- mapDimensions 2>&1 | tail -3)
```
Expected: `fail 0` on both suites; `spine-emit: check clean, 47 files`; the jest pin green. Nothing under `content/` changed — this half writes no files.

- [ ] **Step 3g2: Commit Task 10a**

```bash
git add tools/mapforge/lib/fabric.mjs tools/mapforge/tests/fabric.test.mjs
git commit -m "feat: P14 ring building, water partition and the fabric writer"
```

- [ ] **Step 3g3: Independent adversarial review of Task 10a's diff**

Brief: *`git show HEAD`. This is the geometry half of P14 and every downstream area gate reads its output. Attack: (a) `assignByQuota` — can the heap's `cmp` ever compare two entries with equal `(cost, cellIndex)`, and if a cell is pushed by two sources at the same cost, is the winner a function of the data or of push order? (b) `ringsFromOwner` — when an owner produces two disconnected blobs, is dropping all but the largest correct here, and is the drop reported anywhere? Ocean partitions genuinely can be disconnected (an ocean on both sides of a continent), which is different from a region. Say whether the largest-ring rule is wrong for water and, if so, what the fix is. (c) `seaSeedCell`'s interior test reads `i + dy*w + dx` without a row-wrap guard on the x edges — it excludes x = 0 and x = w-1 first; confirm that is sufficient. (d) `fitVertexCap` doubles epsilon up to 12 times; on a 91,200 km² ocean ring, does it terminate under the 800-vertex cap, and what does the ring look like if it does not? (e) Does anything here call `Math.abs` on a shoelace? It must not.*

- [ ] **Step 3g4: Refactor Task 10a on the findings, then re-run Step 3g1**

The one finding to expect is (b): an ocean split by a continent is legitimately multi-ring. Fix it by keeping every ring whose area exceeds one cell and emitting the largest as `placement` with the rest reported as `problems`, or by accepting a multi-part ocean as three separate nodes — decide it here, with the reason written into the code, not in Task 10b.

---

#### Task 10b — `generate-world.mjs`: the CLI, `writeRun`, and the draft root

**Scope:** Steps 4 through 7 below, plus the gate at Steps 8–12.
**Commit subject:** `feat: the generate-world CLI and the draft root`

- [ ] **Step 4: Write `tools/mapforge/generate-world.mjs`**

```js
#!/usr/bin/env node
// tools/mapforge/generate-world.mjs — Plan C: the generator CLI.
//
// Replaces gen-world.mjs. The difference is not incremental: gen-world
// MERGED a candidate set onto the live root and needed three hardcodes to
// survive its own previous output. This builds a COMPLETE content root from
// scratch, reading exactly four things:
//   1. content/spine/nodes/n-atlas.json  (the frozen frame + seed streams)
//   2. content/world/premises/*.json
//   3. content/world/{civil,relations}/**      (empty in Plan C)
//   4. the runtime subtree, copied VERBATIM — identified by ROOT MEMBERSHIP
//      from content/spine/roots.json, never by a pinned id list.
// So there is no previous output to subtract, no synthetic budget, and no
// sealane id to special-case.
//
// Usage:
//   node tools/mapforge/generate-world.mjs --seed <hex16> --out build/mapforge/<runId>
//                                          [--no-png] [--stage-report]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, cpSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeGrid, FLAG, idx } from "./lib/grid.mjs";
import { mintSeed } from "./lib/seed.mjs";
import { q } from "./lib/noise.mjs";
import { applyPremiseMasks } from "./lib/passes/mask.mjs";
import { buildElevation } from "./lib/passes/elevation.mjs";
import { selectSeaLevelByRank, classifySea, CELL_AREA_KM2 } from "./lib/passes/sea-level.mjs";
import { applyWinds } from "./lib/passes/winds.mjs";
import { priorityFlood, d8FlowDir, flowAccumulate } from "./lib/hydrology.mjs";
import { carveWater } from "./lib/passes/water.mjs";
import { classifyBiomes } from "./lib/passes/biome.mjs";
import { partitionRegions } from "./lib/passes/partition.mjs";
import { instanceLandforms } from "./lib/passes/landforms.mjs";
import { placeSettlements, assignLevelBands } from "./lib/passes/settlements.mjs";
import { routeRoads } from "./lib/passes/roads.mjs";
import { anchorDungeons } from "./lib/passes/dungeons.mjs";
import { buildRegionRings, buildContinentRings, buildFabricFile, hashOf,
         oceanSeedCell, seaSeedCell, assignByQuota, ringsFromOwner,
         MAX_TRUNK_RING_POINTS } from "./lib/fabric.mjs";
import { GENERATOR_VERSION } from "./lib/version.mjs";
import { BIOMES, buildTree } from "../../scripts/lib/spine.mjs";
import { pointInRing } from "../../scripts/lib/geometry.mjs";
import { canonicalNode, canonStringify } from "../../scripts/check_spine_emit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export function runIdOf({ seed, version }) { return `${seed.slice(0, 8)}-${version}`; }

// ── the pass pipeline ──────────────────────────────────────────────────────
export function runPasses({ manifest, premises, pinned = [], relations = [], onStage = () => {} }) {
  const timings = {};
  const time = (name, label, fn) => { const t = Date.now(); const r = fn(); timings[name] = Date.now() - t; onStage(name, label, timings[name]); return r; };

  const seed = manifest.seed;
  const terrainStream = mintSeed({ parentStream: seed, name: "terrain" });
  const grid = makeGrid({ w: manifest.grid.w, h: manifest.grid.h, cellKm: manifest.grid.cellKm });

  const { maskField, plateArea } = time("P1", "premise-masks", () =>
    applyPremiseMasks({ grid, premises, stream: terrainStream }));
  time("P2", "elevation", () => buildElevation({ grid, premises, maskField, stream: terrainStream }));

  const target = Math.round(manifest.budget.grossLandPolygonKm2 / CELL_AREA_KM2);
  const sea = time("P3", "sea-level-rank", () => selectSeaLevelByRank({ elev: grid.elev, targetLandCells: target }));
  classifySea({ grid, seaLevel: sea.seaLevel, FLAG });

  time("P5", "winds", () => applyWinds({ grid, premises, stream: terrainStream }));
  const filled = time("P6", "hydrology", () => {
    const f = priorityFlood({ elev: grid.elev, w: grid.w, h: grid.h });
    grid.flowDir.set(d8FlowDir({ elev: f, w: grid.w, h: grid.h }));
    grid.flowAcc.set(flowAccumulate({ flowDir: grid.flowDir, w: grid.w, h: grid.h }));
    return f;
  });
  const water = time("P7", "lakes-deltas-glaciers", () => carveWater({ grid, premises, filled, manifest }));
  time("P8", "biomes", () => classifyBiomes({ grid, premises, BIOMES }));

  const part = time("P9", "region-partition", () =>
    partitionRegions({ grid, premises, manifest, stream: mintSeed({ parentStream: seed, name: "vegetation" }) }));

  const land = time("P10", "landforms", () =>
    instanceLandforms({ grid, premises, regions: part.regions,
      lexicon: readJson(join(REPO_ROOT, "content/world/lexicon/landforms.json")),
      manifest, stream: terrainStream }));

  const settle = time("P11", "settlements", () =>
    placeSettlements({ grid, premises, regions: part.regions, manifest, pinned,
      stream: mintSeed({ parentStream: seed, name: "settlements" }),
      BIOME_NAME: (i) => BIOMES[i] }));
  assignLevelBands({ regions: part.regions, settlements: settle.settlements, manifest });

  const net = time("P12", "roads-lanes", () => routeRoads({ grid, settlements: settle.settlements, regions: part.regions }));
  const dung = time("P13", "dungeon-anchors", () =>
    anchorDungeons({ instances: land.instances, regions: part.regions, settlements: settle.settlements,
      lexicon: readJson(join(REPO_ROOT, "content/world/lexicon/landforms.json")),
      manifest, stream: terrainStream }));

  const rings = time("P14", "arcs-polygons-fabric", () => ({
    region: buildRegionRings({ grid, regions: part.regions }),
    continent: buildContinentRings({ grid, premises, stream: terrainStream }),
  }));

  // ── assemble the fabric files ────────────────────────────────────────────
  const generator = { name: "mapforge", version: GENERATOR_VERSION, seed, epoch: 0 };
  const fabric = [];
  const continents = [];
  let seaCells = 0, lakeCells = 0, grossLandCells = 0, unownedLandCells = 0;
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) !== 0) seaCells++;
    else { grossLandCells++; if ((grid.flags[i] & FLAG.LAKE) !== 0) lakeCells++; if (grid.owner[i] < 0) unownedLandCells++; }
  }

  premises.forEach((p) => {
    const rs = part.regions.filter((r) => r.continent === p.id);
    const ids = new Set(rs.map((r) => r.id));
    const census = { land: 0, lake: 0, unowned: 0 };
    const hist = {};
    for (const r of rs) { hist[r.id] = r.cells; census.land += r.cells; }
    for (let i = 0; i < grid.n; i++) {
      if (grid.plate[i] !== premises.indexOf(p) || (grid.flags[i] & FLAG.SEA) !== 0) continue;
      if ((grid.flags[i] & FLAG.LAKE) !== 0) census.lake++;
      if (grid.owner[i] < 0) census.unowned++;
    }
    fabric.push(buildFabricFile({
      premise: p, generator, seaLevel: sea.seaLevel, cellKm: grid.cellKm, census, ownerHistogram: hist,
      regions: rs.map((r) => ({
        id: r.id, survey: r.survey, areaKm2: q(r.areaKm2), terrainKind: r.terrainKind,
        biomeShares: Object.fromEntries(Object.entries(r.biomeShares).map(([b, v]) => [BIOMES[b], v])),
        ring: rings.region.get(r.id)?.ring ?? [], levelBand: r.levelBand, adjacent: r.adjacent,
        centroidKm: r.centroidKm,
        // The settlement ids sited in this region. Plan D's G-DUNGEON-REACH
        // and the resolver both need the region -> settlement direction of the
        // join; without it `regions.get(id)?.settlements` is always undefined
        // and every dungeon reports Infinity hops to the nearest town.
        settlements: settle.settlements.filter((x) => x.region === r.id).map((x) => x.id),
        // The epistemic gradient the frontier hatch is keyed on (spec §6.4
        // extension 1): sworn 7 px, hearsay 11 px, inferred 15 px @ 0.3
        // opacity. NULL on every surveyed region — a walked region is not a
        // claim about how good the report was.
        provenance: r.survey === "reported" ? r.provenance : null,
      })),
      // The continent's own coast contour and its largest river, at fabric
      // resolution. buildContinentRings already computed the first; P6's flow
      // accumulation already ranked the second.
      outerRing: rings.continent.get(p.id)?.ring ?? null,
      trunkRiver: net.trunkRivers?.[p.id] ?? null,
      instances: land.instances.filter((x) => ids.has(x.region)),
      settlements: settle.settlements.filter((x) => x.continent === p.id),
      roads: net.roads.filter((x) => x.continent === p.id),
      dungeonAnchors: dung.anchors.filter((x) => x.continent === p.id),
    }));
    const grossKm2 = q(census.land * CELL_AREA_KM2);
    continents.push({ id: p.id, landCells: census.land, grossLandKm2: grossKm2,
                      fabric: `content/world/fabric/continent-${p.id.slice(1)}.json` });
  });

  const netLandKm2 = q((grossLandCells - lakeCells) * CELL_AREA_KM2);
  const worldFile = {
    seed, epoch: 0, generator: { name: generator.name, version: generator.version },
    cellKm: grid.cellKm, grid: { w: grid.w, h: grid.h, cells: grid.n },
    seaLevel: q(sea.seaLevel), rank: sea.rank,
    census: { grossLandCells, lakeCells, seaCells, unownedLandCells },
    areaKm2: { netLand: netLandKm2, water: q(160000 - netLandKm2), total: 160000 },
    seaToLandRatio: q((160000 - netLandKm2) / netLandKm2),
    continents, seaLanes: net.seaLanes,
  };

  const trunk = buildTrunk({ manifest, premises, rings: rings.continent, generator,
                             settlements: settle.settlements });
  // The water trunk is part of P14, not an afterthought: without it the frame
  // closure has no polygons behind its 91,200 km2 of ocean.
  const water = time("P14w", "water-trunk", () =>
    buildWaterTrunk({ manifest, grid, generator, seaLevelCells: sea.landCells }));

  timings.total = Object.values(timings).reduce((a, b) => a + b, 0);
  return { grid, fabric, world: worldFile, handles: land.ledgers,
           trunk: [...trunk.nodes, ...water.nodes], edges: trunk.edges,
           problems: [...settle.problems, ...dung.problems, ...water.problems],
           substitutions: land.substitutions, coverage: land.coverage,
           runManifest: { seed, version: GENERATOR_VERSION, seaLevel: q(sea.seaLevel), rank: sea.rank,
                          landKm2: netLandKm2, waterKm2: q(160000 - netLandKm2),
                          seaToLandRatio: worldFile.seaToLandRatio, water, plateArea: Array.from(plateArea) },
           timings };
}

// The draft trunk: 13 continents + 3 oceans + 9 seas under n-atlas, PLUS the
// three preserved chart anchors re-parented in writeRun. Regions and landform
// instances are NOT nodes (spec §8.4). n-atlas itself is carried over verbatim
// from the live root apart from its composition.
//
// TRUNK FEATURES ARE THE NETWORK (spec §5.6). gSpineNet resolves road and leg
// edge endpoints against node.features (check_content.mjs:1986-1999), and
// G-CONTAIN's feature half checks each against its owning ring. So every
// settlement gets a `kind: "point"` feature on its continent node, id
// `f-town-<slug>`. Without them Plan E's canon-leg re-fit has nothing to point
// at and G-NET + G-CANON-LEG both go red at the redraw commit with no fix
// available inside Plan E. The id grammar is part of this plan's handoff.
export const townFeatureId = (slug) => `f-town-${slug}`;
export const slugOf = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function buildTrunk({ manifest, premises, rings, generator, settlements }) {
  const nodes = [], edges = [];
  premises.forEach((p, k) => {
    const r = rings.get(p.id);
    if (!r) return;
    const lm = manifest.landmasses.find((m) => m.id === p.id);
    const mine = settlements.filter((s) => s.continent === p.id);
    nodes.push({
      id: `n-${slugOf(p.title)}`,
      tier: "continent", parentId: "n-atlas", title: p.title,
      provenance: { authored: "generated",
                    generator: { name: generator.name, version: generator.version,
                                 fabric: `content/world/fabric/continent-${p.id.slice(1)}.json` },
                    source: `content/world/premises/continent-${p.id.slice(1)}.json` },
      frozen: false, absoluteAnchor: undefined,
      seed: { value: mintSeed({ parentStream: manifest.seed, name: p.id }), epoch: 0, why: null },
      placement: { shape: "polygon", points: r.ring, anchor: centroidOf(r.ring) },
      composition: compositionFor({ premise: p }),
      interstitial: null, interstitialUnsurveyed: true,
      compositionTolerance: null, toleranceWhy: null,
      terrainKind: null,
      // One point feature per settlement, in the settlement order the pass
      // produced (which is itself deterministic), so edge endpoints resolve.
      // `type: null` — a settlement is not a landform; Plan B's typed
      // features[] item schema makes the field nullable for exactly this.
      features: mine.map((s) => ({
        id: townFeatureId(slugOf(s.title)),
        kind: "point",
        at: [q(s.atKm[0]), q(s.atKm[1])],
        attrs: { rank: s.rank, region: s.region },
        type: null,
      })),
      bands: [], runtime: null, representsNodeId: null,
      lore: { summary: p.structuralIdea, reported: lm.surveyed === 0 ? true : undefined },
      tags: [], levelBand: [...p.levelBand],
    });
  });
  return { nodes, edges };
}

// The WATER trunk: 3 ocean nodes under n-atlas and 9 sea nodes under their
// ocean. This is not decoration — the committed closure
//   65,600 gross land + 91,200 ocean polygons + 3,200 interstitial = 160,000
// has nothing behind the 91,200 unless these polygons exist. Without them the
// promoted world carries ~94,400 km2 of interstitial against a budget of
// 3,200, and G-ATLAS-ROLLUP's +/-2 pp cannot hold.
//
// The rings are traced from the SEA-CELL COMPLEMENT of the continent rings, so
// no ocean polygon can overlap a landmass by construction: `oceanOwner` is a
// second owner field over the same grid, assigned by nearest ocean seed point
// among sea cells only. Seas are carved from their parent ocean's own cells,
// which is what makes each sea ring a strict SUBSET of its ocean ring and
// therefore G-CONTAIN-legal.
export function buildWaterTrunk({ manifest, grid, generator, seaLevelCells }) {
  const nodes = [], problems = [];
  const CELL_KM2 = grid.cellKm * grid.cellKm;

  // 1. partition the sea cells among the three oceans by area quota, using the
  //    same budgeted multi-source Dijkstra the region partition uses, keyed
  //    (cost, cellIndex) so the result is insertion-order independent.
  const oceanOwner = new Int8Array(grid.n).fill(-1);
  const quotas = manifest.oceans.map((o) => Math.round(o.polygonKm2 / CELL_KM2));
  const seeds = manifest.oceans.map((o, i) => oceanSeedCell({ grid, index: i }));
  assignByQuota({ grid, owner: oceanOwner, seeds, quotas, mask: (i) => (grid.flags[i] & FLAG.SEA) !== 0 });

  // 2. each sea is carved INSIDE its ocean, from that ocean's cells only.
  const seaOwner = new Int16Array(grid.n).fill(-1);
  manifest.seas.forEach((s, k) => {
    const oceanIndex = manifest.oceans.findIndex((o) => o.id === s.ocean);
    assignByQuota({
      grid, owner: seaOwner, seeds: [seaSeedCell({ grid, oceanOwner, oceanIndex, index: k })],
      quotas: [Math.round(s.polygonKm2 / CELL_KM2)],
      mask: (i) => oceanOwner[i] === oceanIndex && seaOwner[i] === -1,
      ownerValue: k,
    });
  });

  const oceanRings = ringsFromOwner({ grid, owner: oceanOwner, count: manifest.oceans.length,
                                      cap: MAX_TRUNK_RING_POINTS });
  const seaRings = ringsFromOwner({ grid, owner: seaOwner, count: manifest.seas.length,
                                    cap: MAX_TRUNK_RING_POINTS });

  manifest.oceans.forEach((o, i) => {
    const ring = oceanRings.get(i);
    if (!ring) { problems.push(`buildWaterTrunk: ocean ${o.id} produced no ring`); return; }
    nodes.push(waterNode({ manifest, generator, id: o.nodeId, tier: "ocean", parentId: "n-atlas",
                           title: o.title, ring, streamName: o.id }));
  });
  manifest.seas.forEach((s, k) => {
    const ring = seaRings.get(k);
    if (!ring) { problems.push(`buildWaterTrunk: sea ${s.id} produced no ring`); return; }
    const parent = manifest.oceans.find((o) => o.id === s.ocean).nodeId;
    nodes.push(waterNode({ manifest, generator, id: s.nodeId, tier: "sea", parentId: parent,
                           title: s.title, ring, streamName: s.id }));
  });
  return { nodes, problems };
}

function waterNode({ manifest, generator, id, tier, parentId, title, ring, streamName }) {
  return {
    id, tier, parentId, title,
    provenance: { authored: "generated",
                  generator: { name: generator.name, version: generator.version,
                               fabric: "content/world/fabric/world.json" },
                  source: "content/world/manifest.json" },
    frozen: false, absoluteAnchor: undefined,
    seed: { value: mintSeed({ parentStream: manifest.seed, name: streamName }), epoch: 0, why: null },
    placement: { shape: "polygon", points: ring, anchor: centroidOf(ring) },
    composition: { ocean: 100 },
    interstitial: null, interstitialUnsurveyed: false,
    compositionTolerance: null, toleranceWhy: null,
    terrainKind: null, features: [], bands: [], runtime: null, representsNodeId: null,
    lore: { summary: null },
    tags: [], levelBand: null,
  };
}

const centroidOf = (ring) => {
  let x = 0, y = 0;
  for (const [px, py] of ring) { x += px; y += py; }
  return [q(x / ring.length), q(y / ring.length)];
};
const compositionFor = ({ premise }) => {
  // Even split across the palette, rounded to 0.1 and forced to sum to 100.
  const n = premise.palette.length;
  const each = Math.round((100 / n) * 10) / 10;
  const out = {};
  premise.palette.forEach((b, i) => { out[b] = i === n - 1 ? Math.round((100 - each * (n - 1)) * 10) / 10 : each; });
  return out;
};

// ── writing the draft root ─────────────────────────────────────────────────
//
// THE THREE PRESERVED CHART ANCHORS. `promote-world.mjs` step 2 is a SET
// RECONCILIATION: it deletes every n-atlas descendant absent from the draft.
// Three chart nodes are therefore load-bearing and must be carried forward, or
// promotion silently deletes them and reds a runtime-side gate:
//
//   n-thornveil          <- n-site-thornveil.representsNodeId  (spec X2)
//   n-northern-icefield  <- n-site-icefield.representsNodeId   (spec X2)
//   n-millcross          <- content/towns/town-millcross.json.spineId (spec X4)
//
// scripts/lib/spine.mjs:874-877 pushes a hard G-ALIAS ERROR when a
// representsNodeId target does not resolve, and check_content.mjs:1192 (T1)
// joins the town plan on its spineId. They are NOT found by root membership —
// they are n-atlas descendants, not n-playroot ones — so root membership alone
// deletes them.
//
// They are discovered, not hardcoded: the set is computed by scanning the live
// tree for representsNodeId targets and content/towns/*.json spineId hosts. A
// pinned id list is what PRE_WORLD_ATLAS_CHILDREN was, and this plan exists to
// kill that pattern.
export function preservedChartNodes({ repoRoot, live }) {
  const ids = new Set();
  for (const { doc } of live) if (doc.representsNodeId) ids.add(doc.representsNodeId);
  const townsDir = join(repoRoot, "content/towns");
  if (existsSync(townsDir))
    for (const f of readdirSync(townsDir).filter((x) => x.endsWith(".json"))) {
      const plan = JSON.parse(readFileSync(join(townsDir, f), "utf8"));
      if (plan.spineId) ids.add(plan.spineId);
    }
  return ids;
}

export function writeRun({ run, outDir, repoRoot, resolved = null, sheets = [] }) {
  const files = [];
  const write = (rel, bytes) => {
    const p = join(outDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, bytes);
    files.push(rel);
  };
  // 1. the authored inputs, copied so the draft root stands alone
  for (const rel of ["content/world/manifest.json", "content/world/budgets.json",
                     "content/spine/roots.json", "content/spine/load-budget.json",
                     "content/spine/coverage-budget.json", "content/spine/sheet.json",
                     "content/spine/sheet-atlas.json", "content/schemas/spine-node.schema.json",
                     "content/schemas/world-manifest.schema.json"]) {
    if (!existsSync(join(repoRoot, rel))) continue;
    write(rel, readFileSync(join(repoRoot, rel)));
  }
  cpSync(join(repoRoot, "content/world/premises"), join(outDir, "content/world/premises"), { recursive: true });
  cpSync(join(repoRoot, "content/world/lexicon"), join(outDir, "content/world/lexicon"), { recursive: true });

  // 2. the runtime subtree, VERBATIM, found by root membership
  const liveNodesDir = join(repoRoot, "content/spine/nodes");
  const live = readdirSync(liveNodesDir).filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, doc: JSON.parse(readFileSync(join(liveNodesDir, f), "utf8")) }));
  const roots = JSON.parse(readFileSync(join(repoRoot, "content/spine/roots.json"), "utf8"));
  const kids = new Map();
  for (const { doc } of live) {
    if (!kids.has(doc.parentId)) kids.set(doc.parentId, []);
    kids.get(doc.parentId).push(doc.id);
  }
  const runtimeRoots = roots.filter((r) => r !== "n-atlas");
  const runtimeIds = new Set();
  const stack = [...runtimeRoots];
  while (stack.length) { const id = stack.pop(); runtimeIds.add(id); for (const c of kids.get(id) ?? []) stack.push(c); }
  for (const { f, doc } of live)
    if (runtimeIds.has(doc.id)) write(`content/spine/nodes/${f}`, readFileSync(join(liveNodesDir, f)));

  // 2b. the three preserved chart anchors, RE-PARENTED onto the generated
  //     continent whose ring contains their anchor. Their ids, titles, lore
  //     and geometry survive verbatim — D1's default (a) re-fit — because two
  //     representsNodeId pointers and one town-plan spineId hard-fail if any
  //     of the three ids stops resolving.
  const preserved = preservedChartNodes({ repoRoot, live });
  const liveById = new Map(live.map(({ doc }) => [doc.id, doc]));
  const carried = [];
  for (const id of [...preserved].sort()) {
    const doc = liveById.get(id);
    if (!doc) continue;                       // already absent upstream: nothing to preserve
    if (runtimeIds.has(id)) continue;         // already copied verbatim above
    const host = run.trunk.find((n) => n.tier === "continent" &&
      pointInRing({ point: doc.placement.anchor, points: n.placement.points }));
    if (!host) { run.problems.push(`preserved chart node ${id}: its anchor ${JSON.stringify(doc.placement.anchor)} is not inside any generated continent — re-pin it or widen the premise footprint`); continue; }
    carried.push({ ...doc, parentId: host.id, frozen: false, absoluteAnchor: undefined,
                   derived: undefined });
  }

  // 3. n-atlas, carried over with its frozen frame intact
  const atlas = JSON.parse(readFileSync(join(liveNodesDir, "n-atlas.json"), "utf8"));
  delete atlas.derived;
  atlas.composition = worldComposition({ run });
  atlas.interstitial = { ocean: 100 };
  atlas.interstitialUnsurveyed = false;

  // 4. the generated trunk + the carried anchors
  const generated = [...run.trunk, ...carried];
  // A generated continent slug colliding with a runtime or carried id would
  // silently overwrite it. Loud, not silent.
  const seenIds = new Set();
  for (const n of [atlas, ...generated]) {
    if (seenIds.has(n.id) || runtimeIds.has(n.id))
      throw new Error(`generate-world: node id collision on "${n.id}" — a generated slug collides with an existing node`);
    seenIds.add(n.id);
  }
  const allNodes = [atlas, ...generated,
    ...[...runtimeIds].map((id) => JSON.parse(readFileSync(join(liveNodesDir, `${id}.json`), "utf8")))];
  const tree = buildTree({ nodes: allNodes.map((n) => ({ ...n, file: `${n.id}.json` })), rootIds: roots });
  if (tree.errors.length) throw new Error(`generate-world: draft tree is invalid: ${tree.errors.join("; ")}`);
  for (const node of [atlas, ...generated]) {
    const r = canonicalNode({ node: { ...node, file: `${node.id}.json` }, tree, plans: [] });
    if (r.error) throw new Error(`generate-world: ${r.error}`);
    write(`content/spine/nodes/${node.id}.json`, r.bytes);
  }
  // 5. edges: runtime edges preserved by ROOT MEMBERSHIP, generated edges appended
  const liveEdges = JSON.parse(readFileSync(join(repoRoot, "content/spine/edges.json"), "utf8"));
  const runtimeEdges = liveEdges.filter((e) => runtimeIds.has(e.from?.node) || runtimeIds.has(e.to?.node));
  write("content/spine/edges.json", canonStringify([...runtimeEdges, ...run.edges]) + "\n");

  // 6. the fabric, the world file and the handle ledgers
  run.fabric.forEach((f) => write(`content/world/fabric/continent-${f.continent.slice(1)}.json`, canonStringify(f) + "\n"));
  write("content/world/fabric/world.json", canonStringify(run.world) + "\n");
  run.handles.forEach((h) => write(`content/world/handles/continent-${h.continent.slice(1)}.json`, canonStringify(h) + "\n"));

  // 7. the baseline: the LIVE polygons, copied at run start, so the overlay
  //    sheet works in a dirty worktree without reading git.
  cpSync(join(repoRoot, "content/spine/nodes"), join(outDir, "baseline/spine/nodes"), { recursive: true });

  // 7b. the DRAWINGS. Spec §7.4 lists seven things in a draft folder and the
  //     two easiest to skip are the two a human actually reviews: "two seeds
  //     sit side by side, diffable in place" is only true of the data unless
  //     the sheets land here too. SVG only (--no-png discipline): a raster in
  //     the review loop is 18 s and 8 MB per sheet.
  const tSheets = Date.now();
  for (const sheet of sheets) {
    const built = sheet.build({ repoRoot: outDir });
    write(`sheets/${sheet.id}.svg`, built.svg);
    for (const p of built.problems) run.problems.push(`sheet ${sheet.id}: ${p}`);
  }
  run.timings.sheets = Date.now() - tSheets;   // read by the CLI's loop-budget check

  // 7c. the civil join, when a civil layer was supplied. Plan C runs with an
  //     empty civil layer, so this is absent; Plan D's promote path supplies
  //     it and the file becomes the third diffable artifact.
  if (resolved) write("civil-resolved.json", canonStringify(resolved) + "\n");

  // 8. the run manifest, with a sha256 per written file — INCLUDING the sheets
  //    and civil-resolved.json, so promote-world step 1's hash verification
  //    covers the drawings and the join, not only the data.
  const hashes = {};
  for (const rel of files.slice().sort()) hashes[rel] = hashOf(readFileSync(join(outDir, rel)));
  const manifest = { ...run.runManifest, hashes, timings: run.timings,
                     problems: run.problems, substitutions: run.substitutions, coverage: run.coverage };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(join(outDir, "report.md"), renderReport({ run }));
  return { files };
}

function worldComposition({ run }) {
  // The world node's declared composition: ocean from the frame-complete
  // water share, the rest split across the land biomes the fabric produced.
  const oceanPct = Math.round((run.world.areaKm2.water / 160000) * 1000) / 10;
  return { ocean: oceanPct, rock: Math.round((100 - oceanPct) * 0.5 * 10) / 10,
           ice: Math.round((100 - oceanPct) * 0.5 * 10) / 10 };
}

function renderReport({ run }) {
  const lines = [
    `# mapforge run ${run.runManifest.seed} / ${run.runManifest.version}`, "",
    `sea level ${run.runManifest.seaLevel} at rank ${run.runManifest.rank}`,
    `net land ${run.runManifest.landKm2} km2 · water ${run.runManifest.waterKm2} km2 · ratio ${run.runManifest.seaToLandRatio}`,
    `landform types placed: ${run.coverage.placed} / ${run.coverage.total}`, "",
    "| continent | gross land km2 | regions | settlements | instances |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...run.fabric.map((f) => `| ${f.continent} | ${(f.cellCensus.land * 0.25).toFixed(1)} | ${f.regions.length} | ${f.settlements.length} | ${f.instances.length} |`),
    "", "## stage timings", "",
    ...Object.entries(run.timings).map(([k, v]) => `- ${k}: ${v} ms`),
  ];
  if (run.problems.length) lines.push("", "## problems", "", ...run.problems.map((p) => `- ${p}`));
  if (run.substitutions.length) lines.push("", "## landform substitutions", "",
    ...run.substitutions.map((s) => `- ${s.wanted} -> ${s.used ?? "(absent)"}: ${s.why}`));
  return lines.join("\n") + "\n";
}

// ── CLI ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { seed: null, outDir: null, png: true, stageReport: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed") opts.seed = argv[++i];
    else if (a === "--out") opts.outDir = resolve(argv[++i]);
    else if (a === "--no-png") opts.png = false;
    else if (a === "--stage-report") opts.stageReport = true;
    else { console.error(`generate-world: unknown arg ${a}`); process.exit(2); }
  }
  return opts;
}

// async because the draft sheets are imported lazily: render-sheet.mjs imports
// the sheet builders, which import scripts/lib/places.mjs, which reads a
// content root — importing it eagerly at module load would read the LIVE root
// before the draft exists.
async function main() {
  const opts = parseArgs(process.argv);
  const manifest = readJson(join(REPO_ROOT, "content/world/manifest.json"));
  if (opts.seed && opts.seed !== manifest.seed) manifest.seed = opts.seed;
  const premises = readdirSync(join(REPO_ROOT, "content/world/premises"))
    .filter((f) => f.endsWith(".json")).sort()
    .map((f) => readJson(join(REPO_ROOT, "content/world/premises", f)));
  const outDir = opts.outDir ?? join(REPO_ROOT, "build/mapforge", runIdOf({ seed: manifest.seed, version: GENERATOR_VERSION }));

  // The loop budget is a committed table, not a constant here — one authority
  // for the generator, the sheet build and the join (content/world/budgets.json).
  const budgets = readJson(join(REPO_ROOT, "content/world/budgets.json"));
  const loopRow = (stage) => budgets.loop.find((r) => r.stage === stage);

  const run = runPasses({ manifest, premises,
    onStage: opts.stageReport ? (name, label, ms) => console.log(`stage: ${name} ${label} ${ms} ms`) : undefined });

  // The draft folder holds the DRAWINGS as well as the data (spec §7.4), so
  // two seeds are diffable in place by eye, not only by hash. --no-png always:
  // rasterising is ship-time work, never review-loop work.
  const { SHEETS } = await import(pathToFileURL(join(REPO_ROOT, "tools/mapforge/render-sheet.mjs")).href);
  const draftSheets = ["fabric", "overlay"].filter((id) => SHEETS[id])
    .map((id) => ({ id, build: SHEETS[id].build }));
  const { files } = writeRun({ run, outDir, repoRoot: REPO_ROOT, sheets: draftSheets });

  // Per-stage budgets with fail thresholds — goal G4's measure is explicitly
  // NOT one aggregate number, because an aggregate hides which stage regressed
  // and the loop silently drifts to minutes. The `generate` row covers every
  // pass; the `sheets` row covers the draft drawings written just above.
  const gen = loopRow("generate"), sheetRow = loopRow("sheets");
  const sheetMs = run.timings.sheets ?? 0;
  console.log(`stage: generate TOTAL ${run.timings.total} ms (budget ${gen.budgetMs}, fail ${gen.failMs})`);
  console.log(`stage: sheets ${sheetMs} ms (budget ${sheetRow.budgetMs}, fail ${sheetRow.failMs})`);
  const over = [];
  if (run.timings.total > gen.failMs) over.push(`generate ${run.timings.total} ms > fail ${gen.failMs} ms`);
  if (sheetMs > sheetRow.failMs) over.push(`sheets ${sheetMs} ms > fail ${sheetRow.failMs} ms`);

  console.log(`generate-world: wrote ${files.length} files to ${outDir}`);
  console.log(`generate-world: ratio ${run.runManifest.seaToLandRatio} (land ${run.runManifest.landKm2} km2)`);
  for (const p of run.problems) console.log(`generate-world: PROBLEM ${p}`);
  if (over.length) {
    for (const o of over) console.error(`generate-world: LOOP BUDGET ${o}`);
    process.exitCode = 1;
    return;
  }
  console.log("generate-world: OK");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
```

- [ ] **Step 4b: Add the `continent>town` depth exception**

`n-millcross` is `tier: "town"` (depth 3). Re-parented onto a generated continent (depth 1) it is two levels deep, so `depthLegal` (`scripts/lib/spine.mjs:41-44`) rejects it and `buildTree` — which `writeRun` calls at generation time — throws before a single file is written. The exception belongs **here**, not in Plan E, because the draft tree is validated the moment the generator runs.

In `scripts/lib/spine.mjs:39`, replace:

```js
export const DEPTH_EXCEPTIONS = new Set(["playspace>site"]);
```

with:

```js
// "playspace>site": the runtime tree hangs sites directly off a playspace.
// "continent>town": Plan C re-parents n-millcross — the ONLY town-tier node
// with a content/towns/*.json plan joined on spineId (check_content.mjs:1192)
// — onto its generated continent. The intermediate region tier no longer
// exists as spine nodes (regions live in content/world/fabric/), so a town's
// only possible parent is a continent. Without this the draft tree is invalid
// and generate-world throws before writing anything.
export const DEPTH_EXCEPTIONS = new Set(["playspace>site", "continent>town"]);
```

Verify the exception did not loosen anything else:

```bash
node --test --test-name-pattern "depthLegal|G-DEPTH" 'scripts/tests/*.test.mjs'
node scripts/check_content.mjs --only=spine | tail -1
```
Expected: green, and the live 44-node tree still reports `0 failures` — the exception is additive and no committed node is a `continent>town` edge today.

- [ ] **Step 5: Make `build/mapforge/` explicit in `.gitignore`**

Two edits, and the second is the one the reader is here for.

`build/` is already ignored at `.gitignore:12`, so making `build/mapforge/` explicit changes nothing functionally — it is documentation. Add under the existing `build/` line:

```
build/
build/mapforge/   # mapforge draft runs: <seed8>-<generatorVersion>, never committed
```

Then **delete the `content/spine/candidates/` rule at `.gitignore:125`**. The directory does not exist on disk and the concept is retired by this task: the generator no longer writes candidates for a human to hand-rename, it writes a complete draft root that `promote-world.mjs` reconciles. Leaving the rule behind is a signpost to a workflow that no longer exists.

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test 'tools/mapforge/tests/generate-world.test.mjs'`
Expected: PASS — 9 tests. This is the first moment the whole pipeline runs end to end; expect to iterate here.

- [ ] **Step 7: Commit Task 10b**

```bash
git add tools/mapforge/generate-world.mjs tools/mapforge/tests/generate-world.test.mjs \
        scripts/lib/spine.mjs .gitignore
git commit -m "feat: the generate-world CLI and the draft root"
```

#### Task 10b quality gate

- [ ] **Step 8: Verify — and paste the run report**

```bash
node tools/mapforge/generate-world.mjs --seed 7c9e4a2f8b1d6e03 --out build/mapforge/probe --no-png --stage-report
cat build/mapforge/probe/report.md
ls build/mapforge/probe/sheets/
ls build/mapforge/probe/content/spine/nodes/ | wc -l
node scripts/check_content.mjs --only=spine --content-root build/mapforge/probe/content
node --test 'tools/mapforge/tests/*.test.mjs'
node scripts/check_spine_emit.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: the report shows 13 continents; `seaToLandRatio` in [1.20, 1.80]; `stage: generate TOTAL … (budget 4000, fail 8000)` under the fail column; `sheets/` holds `fabric.svg` and `overlay.svg` and no PNG; the node count is **36**; the real gate green on the draft root; the **live** root untouched (`check_spine_emit --check` still 47 files clean).

- [ ] **Step 9: Independent adversarial review**

Brief: *this task assembles everything and is where the integration bugs live. (a) Confirm `writeRun` writes the runtime nodes BEFORE the generated trunk and that the explicit id-collision guard fires — a generated continent whose slug equals a runtime or preserved node id would otherwise overwrite it. (b) Confirm `runtimeEdges` cannot drop a runtime edge whose endpoints are **features** rather than nodes (`e.from.feature`), which is the shape `e-sea-lane` and the relay edges use — exactly the class of bug `PRE_WORLD_SEALANE_ID` existed to paper over. (c) Confirm `worldComposition` produces a composition `G-COMP-SUM` accepts (sums to 100 within tolerance) and that `G-ATLAS-ROLLUP`'s ±2 pp holds against it **with the ocean polygons present** — re-run the residual test with the water trunk stubbed out and confirm it goes red, so you know the test has teeth. (d) Confirm the draft `n-atlas` keeps `frozen: true` and its `absoluteAnchor`, and that `G-FROZEN` does not fire on the generated children or on the three carried anchors (which are written `frozen: false` with `absoluteAnchor` dropped — G-FROZEN is directional, so an unfrozen node still carrying `absoluteAnchor` also fails). (e) Confirm `buildTrunk`'s `absoluteAnchor: undefined` is dropped by `canonStringify` rather than serialised as null. (f) `preservedChartNodes` is discovered, not hardcoded — confirm it finds all three today, and say what happens if a fourth `representsNodeId` or town plan is added later. (g) The `f-town-<slug>` features: confirm each `at` lies inside its owning continent ring, since G-CONTAIN's feature half checks exactly that.*

- [ ] **Step 10: Refactor** — the two expected findings are the feature-endpoint edge filter and the collision guard's coverage of the carried anchors. Both must be fixed here.

- [ ] **Step 11: Re-verify** — re-run every command in Step 8.

- [ ] **Step 12: Commit and report**

```bash
git add -A && git commit -m "refactor: generate-world integration review findings"
git branch --show-current && git log --oneline -1
```

---

### Task 11: The world gates — `G-SEALAND`, `G-TRUNK-AREA`, `G-POI`, `G-ORDER`, `G-PROVENANCE`

All five land in `checkSpine()`'s harness, so `--only=spine` (Gate 1) covers them automatically and their **combined** budget is 0.66 s against Gate 1's ~4 s ceiling. Every one soft-skips a missing `content/world/`, and none of them throws.

**Files:**
- Create: `content/schemas/fabric-file.schema.json`
- Create: `content/schemas/handle-ledger.schema.json`
- Create: `scripts/tests/fixtures/world/{g-sealand-ratio,g-sealand-closure,g-trunk-area-drift,g-poi-surveyed-thin,g-poi-reported-detail,g-order-digest-drift,g-order-sparse-zone,g-provenance-no-fabric,g-poly-instance-winding,g-vertex-budget-instance}/`
- Modify: `scripts/lib/world.mjs` (six new gate functions, appended — created in Task 1)
- Modify: `scripts/check_content.mjs:1931-1936` (`G-PROVENANCE` gains the fabric pin) and its `checkWorld` (added in Task 1, call the new gates)
- Test: `scripts/tests/world-gates.test.mjs` (extend Task 1's file)

**Interfaces:**
- Consumes: `loadFabric` (Task 1); `placementArea` from `scripts/lib/spine.mjs:127`; `shoelaceArea` (`spine.mjs:73`) and `selfIntersects` (`spine.mjs:96`); `ringVertexCount` from `scripts/lib/geometry.mjs` (Plan A); `landform-instance.schema.json` (Plan B Task 2)
- Produces: `gWorldSeaLand`, `gWorldTrunkArea`, `gWorldPoi`, `gWorldOrder`, `gWorldInstanceGeometry` (signatures in the Global Interfaces block)

**Two coverage seams this task closes that nothing else can.** Spec §8.4 states the regression plainly: with a 36-node trunk, the 160 regions and 1,740 landform instances are **not** spine nodes, and `G-POLY` and `G-VERTEX-BUDGET` only walk `tree.byId.values()`. So (1) `G-VERTEX-BUDGET`'s third tier — landform instances ≤ 40 vertices — has no home in Plan A, which implements only the world-tier and region tiers over nodes; and (2) a wrongly-wound or self-intersecting generated **area** instance ships with every gate green. Step 5c adds both over the fabric, with the schema's `maxItems: 40` as a second, blunter net.

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/world-gates.test.mjs`:

```js
// ── Plan C Task 11: the five world gates ──────────────────────────────────
import { orderHandles, orderDigestOf } from "../../tools/mapforge/lib/passes/landforms.mjs";

const FABRIC_OK = {
  continent: "c01", premise: "content/world/premises/continent-01.json",
  generator: { name: "mapforge", version: "3.0.0", seed: "7c9e4a2f8b1d6e03", epoch: 0 },
  seaLevel: 0.42, cellKm: 0.5,
  cellCensus: { land: 24000, lake: 0, unowned: 0 },
  ownerHistogram: { "c01/r01": 12000, "c01/r02": 12000 },
  regions: [
    { id: "c01/r01", survey: "surveyed", areaKm2: 3000, terrainKind: "rim", biomeShares: { rock: 100 },
      ring: [[0, 0], [10, 0], [10, 10], [0, 10]], levelBand: [1, 10], adjacent: ["c01/r02"], centroidKm: [5, 5] },
    { id: "c01/r02", survey: "reported", areaKm2: 3000, terrainKind: null, biomeShares: { rock: 100 },
      ring: [[10, 0], [20, 0], [20, 10], [10, 10]], levelBand: [8, 20], adjacent: ["c01/r01"], centroidKm: [15, 5] },
  ],
  instances: Array.from({ length: 26 }, (_, n) => ({
    id: `lf-c01-r0${n < 18 ? 1 : 2}-000${n}`, type: "sea-stack",
    geometry: { shape: "point", at: [1 + n * 0.1, 1] }, sizeKm: 0.2, cell: [2, 2],
    handle: `c01/coastal/h-00${String(n).padStart(2, "0")}`, region: n < 18 ? "c01/r01" : "c01/r02",
    named: false, glyph: "g-stack", dungeonCapable: false,
    provenance: { authored: "generated", generator: { pass: "landforms", seedStream: "landform", epoch: 0 },
                  fabric: "fabric/c01" },
  })),
  settlements: [{ id: "c01/s01", title: "Hubtown", rank: "hub", atKm: [5, 5], cell: [10, 10],
                  region: "c01/r01", continent: "c01", score: 0.7 }],
  roads: [], dungeonAnchors: [],
};

const WORLD_OK = {
  seed: "7c9e4a2f8b1d6e03", epoch: 0, generator: { name: "mapforge", version: "3.0.0" },
  cellKm: 0.5, grid: { w: 800, h: 800, cells: 640000 }, seaLevel: 0.42, rank: 262400,
  census: { grossLandCells: 262400, lakeCells: 6400, seaCells: 377600, unownedLandCells: 0 },
  areaKm2: { netLand: 64000, water: 96000, total: 160000 }, seaToLandRatio: 1.5,
  continents: [{ id: "c01", landCells: 24000, grossLandKm2: 6000, fabric: "content/world/fabric/continent-01.json" }],
  seaLanes: [],
};

function withFabric({ fabric = FABRIC_OK, world = WORLD_OK, handles = null } = {}) {
  return worldFixture({ mutate: (d) => {
    mkdirSync(join(d, "world/fabric"), { recursive: true });
    mkdirSync(join(d, "world/handles"), { recursive: true });
    writeFileSync(join(d, "world/fabric/continent-01.json"), JSON.stringify(fabric, null, 2) + "\n");
    writeFileSync(join(d, "world/fabric/world.json"), JSON.stringify(world, null, 2) + "\n");
    const hs = handles ?? { continent: "c01",
      handles: orderHandles({ handles: [{ handle: "c01/coastal/h-0000", type: "sea-stack", sizeKm: 0.2,
                                          region: "c01/r01", contentHash: "sha256:abcd" }] }) };
    hs.orderDigest = hs.orderDigest ?? orderDigestOf({ handles: hs.handles });
    writeFileSync(join(d, "world/handles/continent-01.json"), JSON.stringify(hs, null, 2) + "\n");
  } });
}

test("G-SEALAND is green and REPORTS the ratio on every run", () => {
  const r = runWorldGate(withFabric());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /G-SEALAND: ratio 1\.50 \(net land 64000\.0 km², water 96000\.0 km²\) — band 1\.20–1\.80/);
});

test("G-SEALAND also reports the trunk divergence, so a green gate is not mistaken for a redrawn world", () => {
  const r = runWorldGate(withFabric());
  assert.match(r.out, /G-SEALAND: trunk land .* km² vs fabric net land 64000\.0 km²/);
});

test("G-SEALAND fails outside the band with the do-not-reroll message", () => {
  const bad = { ...WORLD_OK, areaKm2: { netLand: 6243.5, water: 153756.5, total: 160000 }, seaToLandRatio: 24.63 };
  const r = runWorldGate(withFabric({ world: bad }));
  assert.equal(r.code, 1);
  assert.match(r.out, /G-SEALAND: world sea\/land is 24\.63 \(land 6243\.5 km², sea 153756\.5 km²\) — band is 1\.20–1\.80/);
  assert.match(r.out, /re-run the sea-level rank selection, do not reroll toward the target/);
});

test("G-SEALAND fails on a closure gap: land + sea !== 160000", () => {
  const bad = { ...WORLD_OK, areaKm2: { netLand: 64000, water: 90000, total: 154000 },
                census: { ...WORLD_OK.census, unownedLandCells: 24000 } };
  const r = runWorldGate(withFabric({ world: bad }));
  assert.equal(r.code, 1);
  assert.match(r.out, /G-SEALAND: land \+ sea = 154000 km² != 160000 ± 1 — 24000 cells are unowned/);
});

test("G-TRUNK-AREA is DORMANT when no trunk node cites a fabric file", () => {
  const r = runWorldGate(withFabric());
  assert.ok(!/G-TRUNK-AREA:/.test(r.out), `G-TRUNK-AREA fired with no fabric-pinned node: ${r.out}`);
});

test("G-POI: a surveyed region below 12 points of interest fails", () => {
  const thin = JSON.parse(JSON.stringify(FABRIC_OK));
  thin.instances = thin.instances.filter((x) => x.region !== "c01/r01").concat(
    thin.instances.filter((x) => x.region === "c01/r01").slice(0, 3));
  const r = runWorldGate(withFabric({ fabric: thin }));
  assert.equal(r.code, 1);
  assert.match(r.out, /G-POI: region c01\/r01 \(surveyed\) has 4 points of interest — band is 12–30/);
});

test("G-POI: a reported region with interior detail fails", () => {
  const detailed = JSON.parse(JSON.stringify(FABRIC_OK));
  detailed.settlements.push({ id: "c01/s02", title: "Villageton", rank: "village", atKm: [15, 5],
                              cell: [30, 10], region: "c01/r02", continent: "c01", score: 0.5 });
  const r = runWorldGate(withFabric({ fabric: detailed }));
  assert.equal(r.code, 1);
  assert.match(r.out, /G-POI: region c01\/r02 \(reported\) has 1 points of interest — must be 0/);
});

test("G-POI: a reported region's ONE named landform is exempt (spec §6.4 rule 2)", () => {
  const named = JSON.parse(JSON.stringify(FABRIC_OK));
  named.instances.find((x) => x.region === "c01/r02").named = true;
  const r = runWorldGate(withFabric({ fabric: named }));
  assert.equal(r.code, 0, r.out);
});

test("G-ORDER fails on a drifted orderDigest", () => {
  const hs = { continent: "c01", orderDigest: "sha256:" + "0".repeat(64),
    handles: orderHandles({ handles: [{ handle: "c01/coastal/h-0000", type: "sea-stack", sizeKm: 0.2,
                                        region: "c01/r01", contentHash: "sha256:abcd" }] }) };
  const r = runWorldGate(withFabric({ handles: hs }));
  assert.equal(r.code, 1);
  assert.match(r.out, /G-ORDER: c01 orderDigest sha256:0{64} != computed sha256:[0-9a-f]{64}/);
});

test("G-ORDER fails when two handles are within 1e-6 km2 of each other", () => {
  const hs = { continent: "c01", handles: [
    { handle: "c01/coastal/h-0001", type: "sea-stack", sizeKm: 0.2, region: "c01/r01", contentHash: "sha256:aaaa", rank: 0 },
    { handle: "c01/coastal/h-0002", type: "sea-stack", sizeKm: 0.2, region: "c01/r01", contentHash: "sha256:aaaa", rank: 1 },
  ] };
  hs.orderDigest = orderDigestOf({ handles: hs.handles });
  const r = runWorldGate(withFabric({ handles: hs }));
  assert.equal(r.code, 1);
  assert.match(r.out, /G-ORDER: c01\/coastal\/h-000\d and c01\/coastal\/h-000\d differ by 0 km² \(< 1e-6\) — ordering is not total/);
});

test("the five world gates together cost under 0.7 s on the committed content root", () => {
  const t0 = Date.now();
  execFileSync(process.execPath, [GATE, "--only=spine"], { encoding: "utf8", cwd: ROOT });
  const withWorld = Date.now() - t0;
  assert.ok(withWorld < 5000, `Gate 1's content lane took ${withWorld} ms — the world gates must fit inside ~4 s`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "G-" 'scripts/tests/*.test.mjs'`
Expected: FAIL — `G-SEALAND` never appears; the gate exits 0 on every fixture.

- [ ] **Step 3: Add the five gates to `scripts/lib/world.mjs`**

```js
// ── G-SEALAND ──────────────────────────────────────────────────────────────
// Measured on the FABRIC CELL CENSUS, not on the trunk. The trunk still
// describes the pre-redraw world until Plan E lands, so this gate ALSO
// prints the divergence — a green ratio on the fabric must never be read as
// "the chart is redrawn".
export function gWorldSeaLand({ world, manifest, trunkLandKm2, report, note }) {
  if (!world) return;
  const { netLand, water, total } = world.areaKm2;
  const frame = manifest?.frame?.areaKm2 ?? 160000;
  const min = manifest?.ratio?.min ?? 1.2, max = manifest?.ratio?.max ?? 1.8;
  const ratio = netLand === 0 ? Infinity : water / netLand;

  note(`G-SEALAND: ratio ${ratio.toFixed(2)} (net land ${netLand.toFixed(1)} km², water ${water.toFixed(1)} km²) — band ${min.toFixed(2)}–${max.toFixed(2)}`);
  if (trunkLandKm2 !== null)
    note(`G-SEALAND: trunk land ${trunkLandKm2.toFixed(1)} km² vs fabric net land ${netLand.toFixed(1)} km² — the trunk is redrawn in Plan E, not here`);

  if (Math.abs(total - frame) > 1)
    report(`G-SEALAND: land + sea = ${total} km² != ${frame} ± 1 — ${world.census.unownedLandCells} cells are unowned`);
  if (ratio < min || ratio > max) {
    const landMin = frame / (1 + max), landMax = frame / (1 + min);
    report(
      `G-SEALAND: world sea/land is ${ratio.toFixed(2)} (land ${netLand.toFixed(1)} km², sea ${water.toFixed(1)} km²) — ` +
      `band is ${min.toFixed(2)}–${max.toFixed(2)} (land ${Math.round(landMin)}–${Math.round(landMax)} km²); ` +
      `re-run the sea-level rank selection, do not reroll toward the target`,
    );
  }
}

// ── G-TRUNK-AREA ───────────────────────────────────────────────────────────
// THE gate the two-layer architecture creates: without it G-SEALAND and
// G-ATLAS-ROLLUP measure two different worlds and both can be green while
// the chart is wrong. ACTIVATES PER NODE via provenance.generator.fabric, so
// it is dormant on today's 44 hand-authored nodes and live on the draft root.
export function gWorldTrunkArea({ nodes, fabric, placementArea, report }) {
  const byPath = new Map(fabric.map((f) => [`content/world/fabric/${f.file}`, f]));
  for (const node of nodes) {
    const path = node.provenance?.generator?.fabric;
    if (typeof path !== "string") continue;
    const f = byPath.get(path);
    if (!f) { report(`G-TRUNK-AREA: ${node.id}: provenance.generator.fabric "${path}" does not resolve`); continue; }
    const cellArea = (f.cellKm ?? 0.5) * (f.cellKm ?? 0.5);
    const fabricKm2 = f.cellCensus.land * cellArea;
    const polyKm2 = placementArea({ placement: node.placement });
    if (fabricKm2 === 0) { report(`G-TRUNK-AREA: ${node.id}: fabric census is 0 cells`); continue; }
    const pct = ((polyKm2 - fabricKm2) / fabricKm2) * 100;
    if (Math.abs(pct) > 3)
      report(
        `G-TRUNK-AREA: ${node.id}: trunk polygon ${polyKm2.toFixed(1)} km² vs fabric census ${fabricKm2.toFixed(1)} km² ` +
        `(${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%, tolerance ±3%) — re-simplify the outline from the fabric, ` +
        `do not hand-edit the ring`,
      );
  }
}

// ── G-POI ──────────────────────────────────────────────────────────────────
// POI is DERIVED, never stored: drawn(instance) = region is surveyed OR the
// instance is named. That is spec §6.4 rule 2 ("no interior detail inside a
// reported region ... at most one named landform") as one line, and it is
// why a reported region's POI count is 0 while it still carries texture.
export function gWorldPoi({ fabric, report }) {
  for (const f of fabric) {
    const byRegion = new Map(f.regions.map((r) => [r.id, r]));
    const counts = new Map(f.regions.map((r) => [r.id, 0]));
    for (const inst of f.instances ?? []) {
      const r = byRegion.get(inst.region);
      if (!r) { report(`G-POI: instance ${inst.id} names region "${inst.region}", which is not in ${f.file}`); continue; }
      if (r.survey === "surveyed") counts.set(r.id, counts.get(r.id) + 1);
      // a reported region's named landform is EXEMPT — it is the one mark
      // the honest-frontier policy allows.
    }
    for (const s of f.settlements ?? []) if (counts.has(s.region)) counts.set(s.region, counts.get(s.region) + 1);
    for (const d of f.dungeonAnchors ?? []) if (counts.has(d.region)) counts.set(d.region, counts.get(d.region) + 1);
    for (const road of f.roads ?? []) { /* roads are inter-region; counted at their endpoints' settlements */ }

    for (const r of f.regions) {
      const n = counts.get(r.id);
      if (r.survey === "surveyed") {
        if (n < 12 || n > 30) report(`G-POI: region ${r.id} (surveyed) has ${n} points of interest — band is 12–30`);
      } else if (n !== 0) {
        report(`G-POI: region ${r.id} (reported) has ${n} points of interest — must be 0`);
      }
      if (r.survey === "reported" && r.terrainKind !== null)
        report(`G-POI: region ${r.id} is reported but carries terrainKind "${r.terrainKind}" — reported ⇒ terrainKind null`);
    }
  }
}

// ── G-ORDER ────────────────────────────────────────────────────────────────
// The ordering key is (-area, contentHash) — NEVER insertion order, NEVER
// lore.order. R3's failure mode (a member silently disappearing or silently
// reordering) applies identically to a handle ledger.
//
// R3's mitigation is THREE-part and this function carries all three: (1) the
// sort key is content hash, never lore.order; (2) the digest is committed and
// recomputed; (3) **the resulting order is a DENSE PERMUTATION of 0..n-1**.
// Clause (3) is the one that catches a member silently vanishing, and it
// applies to the REGION order as well as the handle order — Plan D's resolver
// emits `order` on every resolved zone from the same (-area, contentHash) rule,
// so there is one ordering discipline in the programme rather than two.
export function gWorldOrder({ handles, fabric = [], orderHandlesFn, orderDigestFn, report }) {
  // (3) for regions: the surveyed regions of each continent must carry a dense
  // 0..n-1 rank. A gap means a region ceased to exist with every gate green,
  // which is exactly the live defect R3 names (check_spine_emit.mjs:111).
  for (const f of fabric) {
    const surveyed = (f.regions ?? []).filter((r) => r.survey === "surveyed" && r.order != null);
    if (surveyed.length === 0) continue;      // Plan C emits no order; Plan D does
    const ranks = surveyed.map((r) => r.order).sort((a, b) => a - b);
    const dense = ranks.every((v, i) => v === i);
    if (!dense)
      report(`G-ORDER: ${f.continent} zone order is not a dense permutation of 0..${surveyed.length - 1} — got [${ranks.join(", ")}]`);
  }
  for (const ledger of handles) {
    const recomputed = orderHandlesFn({ handles: ledger.handles.map(({ rank, ...h }) => h) });
    const digest = orderDigestFn({ handles: recomputed });
    if (ledger.orderDigest !== digest)
      report(`G-ORDER: ${ledger.continent} orderDigest ${ledger.orderDigest} != computed ${digest}`);
    for (let i = 1; i < recomputed.length; i++) {
      const a = recomputed[i - 1], b = recomputed[i];
      const da = Math.abs(a.sizeKm * a.sizeKm - b.sizeKm * b.sizeKm);
      if (da < 1e-6 && a.contentHash === b.contentHash)
        report(`G-ORDER: ${a.handle} and ${b.handle} differ by ${da} km² (< 1e-6) — ordering is not total`);
    }
    const seen = new Set();
    for (const h of ledger.handles) {
      if (seen.has(h.handle)) report(`G-ORDER: ${ledger.continent} lists handle "${h.handle}" twice`);
      seen.add(h.handle);
      if (!/^c[0-9]{2}\/[a-z-]+\/h-[0-9a-f]{4,6}$/.test(h.handle))
        report(`G-ORDER: handle "${h.handle}" does not match the grammar cNN/<group>/h-<hex>`);
    }
  }
}
```

- [ ] **Step 4: Wire the gates into `checkWorld` and extend `G-PROVENANCE`**

In `scripts/check_content.mjs`, replace the body of `checkWorld` (added in Task 1) with:

```js
function checkWorld(opts, { nodes = [], tree = null } = {}) {
  const world = loadFabric({ contentRoot: opts.contentRoot });
  if (!world.present) return 0;
  for (const e of world.errors) fail(`world: ${e}`);

  for (const [schema, docs, label] of [
    ["schemas/world-manifest.schema.json", world.manifest ? [world.manifest] : [], "world/manifest.json"],
    ["schemas/fabric-file.schema.json", world.fabric, "world/fabric"],
    ["schemas/handle-ledger.schema.json", world.handles, "world/handles"],
  ]) {
    const path = join(opts.contentRoot, schema);
    if (!existsSync(path)) continue;         // soft-skip: a fixture root may ship one schema, not three
    const validate = compileSchema(path, `${label} schema`, fail);
    if (!validate) continue;
    for (const doc of docs) {
      const { file, ...body } = doc;
      if (!validate(body))
        for (const err of validate.errors) fail(`${label}${file ? `/${file}` : ""}: schema ${err.instancePath || "/"} ${err.message}`);
    }
  }

  const note = (m) => console.log(m);
  const trunkLandKm2 = tree
    ? [...tree.byId.values()].filter((n) => n.tier === "continent")
        .reduce((s, n) => s + placementArea({ placement: n.placement }), 0)
    : null;
  gWorldSeaLand({ world: world.world, manifest: world.manifest, trunkLandKm2, report: fail, note });
  gWorldTrunkArea({ nodes, fabric: world.fabric, placementArea, report: fail });
  gWorldPoi({ fabric: world.fabric, report: fail });
  gWorldOrder({ handles: world.handles, fabric: world.fabric,
                orderHandlesFn: orderHandles, orderDigestFn: orderDigestOf, report: fail });
  gWorldInstanceGeometry({ fabric: world.fabric, shoelaceArea, selfIntersects, report: fail });
  gWorldBudget({ contentRoot: opts.contentRoot, budgets: world.budgets, manifest: world.manifest, report: fail, note });
  return world.fabric.length;
}
```

and change the call site inside `checkSpine` to pass the tree it already has:

```js
  checkWorld(opts, { nodes: validNodes, tree });
```

Import the two ordering helpers at the top of `check_content.mjs`, next to the `loadFabric` import:

```js
import { loadFabric, gWorldBudget, gWorldSeaLand, gWorldTrunkArea, gWorldPoi, gWorldOrder,
         gWorldInstanceGeometry } from "./lib/world.mjs";
// The handle ordering rule lives with the generator that mints it, so the
// gate and the writer can never drift apart. tools/mapforge is dependency-
// free ESM and scripts/ already imports across that boundary in the other
// direction (tools/mapforge/lib/world-gen.mjs imported scripts/lib/spine.mjs).
import { orderHandles, orderDigestOf } from "../tools/mapforge/lib/passes/landforms.mjs";
```

Extend `G-PROVENANCE` at `scripts/check_content.mjs:1931-1936`, replacing those lines with:

```js
    // G-PROVENANCE: generated ⇒ pinned generator. Plan C adds the FABRIC
    // pin: without it the trunk polygon and the fabric it was simplified
    // from can silently disagree, and G-TRUNK-AREA has nothing to join on.
    const p = node.provenance;
    if (p && p.authored === "generated") {
      if (!p.generator || typeof p.generator.name !== "string" || typeof p.generator.version !== "string")
        fail(`spine: G-PROVENANCE ${node.id}: authored "generated" requires generator {name, version}`);
      else if (node.tier === "continent" && typeof p.generator.fabric !== "string")
        fail(`G-PROVENANCE: ${node.id}: generator.fabric is missing — polygon and fabric can disagree`);
    }
```

- [ ] **Step 5: Write `content/schemas/fabric-file.schema.json`**

`compileSchema` (`scripts/lib/story.mjs`) compiles each schema standalone with ajv, so a cross-file `$ref` must be **resolvable by `$id`**. `landform-instance.schema.json` (Plan B Task 2) declares `"$id": "landform-instance.schema.json"`, and `checkWorld` registers it before compiling this one — the same two-step ajv registration `story.mjs` already uses for its own paired schemas. Read `scripts/lib/story.mjs`'s `compileSchema` before writing the `$ref` and confirm the registration order; if it does not support `addSchema`, inline the instance shape here instead of `$ref`-ing it and say so in the title.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "fabric-file.schema.json",
  "title": "Per-continent fabric file — SHAPE ONLY. Every numeric bound (area tolerances, POI bands, the sea/land ratio, vertex caps) lives in checkWorld()'s G-* gates and never here: checkSpine continues past a schema-invalid document, so a bound duplicated into the schema turns its gate rule into dead code. The one exception is maxItems on instance rings, which mirrors G-VERTEX-BUDGET's landform tier so a 4,000-point generated ring fails at the schema rather than at the renderer.",
  "type": "object",
  "additionalProperties": false,
  "required": ["continent", "premise", "generator", "seaLevel", "cellKm", "cellCensus",
               "ownerHistogram", "outerRing", "trunkRiver", "regions", "instances",
               "settlements", "roads", "dungeonAnchors", "pinReceipts"],
  "properties": {
    "continent": { "type": "string", "pattern": "^c[0-9]{2}$" },
    "premise": { "type": "string", "pattern": "^content/world/premises/continent-[0-9]{2}\\.json$" },
    "generator": {
      "type": "object", "additionalProperties": false,
      "required": ["name", "version", "seed", "epoch"],
      "properties": {
        "name": { "type": "string" }, "version": { "type": "string" },
        "seed": { "type": "string", "pattern": "^[0-9a-f]{16}$" },
        "epoch": { "type": "integer", "minimum": 0 }
      }
    },
    "seaLevel": { "type": "number" },
    "cellKm": { "const": 0.5 },
    "cellCensus": {
      "type": "object", "additionalProperties": false,
      "required": ["land", "lake", "unowned"],
      "properties": { "land": { "type": "integer" }, "lake": { "type": "integer" }, "unowned": { "type": "integer" } }
    },
    "ownerHistogram": {
      "type": "object",
      "propertyNames": { "pattern": "^c[0-9]{2}/r[0-9]{2}$" },
      "additionalProperties": { "type": "integer", "minimum": 0 }
    },
    "outerRing": {
      "type": ["array", "null"], "minItems": 3,
      "items": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } }
    },
    "trunkRiver": {
      "type": ["object", "null"], "additionalProperties": false,
      "required": ["points", "name"],
      "properties": {
        "points": { "type": "array", "minItems": 2,
                    "items": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } } },
        "name": { "type": ["string", "null"] }
      }
    },
    "regions": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["id", "survey", "areaKm2", "terrainKind", "biomeShares", "ring",
                     "levelBand", "adjacent", "centroidKm", "settlements", "provenance"],
        "properties": {
          "id": { "type": "string", "pattern": "^c[0-9]{2}/r[0-9]{2}$" },
          "survey": { "enum": ["surveyed", "reported"] },
          "areaKm2": { "type": "number" },
          "terrainKind": { "type": ["string", "null"] },
          "biomeShares": { "type": "object", "additionalProperties": { "type": "number" } },
          "ring": {
            "type": "array", "minItems": 3, "maxItems": 200,
            "items": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } }
          },
          "levelBand": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "integer" } },
          "adjacent": { "type": "array", "items": { "type": "string", "pattern": "^c[0-9]{2}/r[0-9]{2}$" } },
          "centroidKm": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } },
          "settlements": { "type": "array", "items": { "type": "string" } },
          "provenance": { "enum": ["sworn", "hearsay", "inferred", null] }
        }
      }
    },
    "instances": { "type": "array", "items": { "$ref": "landform-instance.schema.json" } },
    "settlements": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["id", "title", "rank", "atKm", "cell", "region", "continent", "score"],
        "properties": {
          "id": { "type": "string" }, "title": { "type": "string" },
          "rank": { "enum": ["capital", "hub", "village"] },
          "atKm": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } },
          "cell": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "integer" } },
          "region": { "type": "string" }, "continent": { "type": "string" },
          "score": { "type": "number" }
        }
      }
    },
    "roads": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["id", "continent", "from", "to", "km", "points"],
        "properties": {
          "id": { "type": "string" }, "continent": { "type": "string" },
          "from": { "type": "string" }, "to": { "type": "string" },
          "km": { "type": "number" },
          "points": { "type": "array", "minItems": 2,
                      "items": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } } }
        }
      }
    },
    "dungeonAnchors": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["handle", "continent", "region", "entranceType", "hopsToSettlement"],
        "properties": {
          "handle": { "type": "string", "pattern": "^c[0-9]{2}/[a-z-]+/h-[0-9a-f]{4,6}$" },
          "continent": { "type": "string" }, "region": { "type": "string" },
          "entranceType": { "type": "string" },
          "hopsToSettlement": { "type": ["integer", "null"], "minimum": 0 }
        }
      }
    },
    "pinReceipts": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["id", "at", "cell", "continent", "region", "measured"],
        "properties": {
          "id": { "type": "string" },
          "at": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "number" } },
          "cell": { "type": "array", "minItems": 2, "maxItems": 2, "items": { "type": "integer" } },
          "continent": { "type": "string" }, "region": { "type": "string" },
          "measured": { "type": "object" }
        }
      }
    }
  }
}
```

Two fields here are load-bearing and easy to read past:

- **`regions[].settlements`** is a plain array of settlement ids. It exists so Plan D's `G-DUNGEON-REACH` can walk the region adjacency graph without re-deriving the settlement→region join; without it `regions.get(id)?.settlements` is always `undefined` and every dungeon reports `Infinity` hops.
- **`regions[].provenance`** is `sworn | hearsay | inferred | null` — the epistemic gradient the frontier hatch is keyed on (spec §6.4 extension 1: 7 px, 11 px, 15 px pitch). It is `null` on every surveyed region and non-null on every reported one, and Plan B's `pReportedSworn` / `pReportedHearsay` / `pReportedInferred` patterns read exactly this field. Without it the three densities have nothing to key on and the frontier collapses back to one binary hatch.

- [ ] **Step 5b: Write `content/schemas/handle-ledger.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "handle-ledger.schema.json",
  "title": "Handle ledger — SHAPE ONLY. The ORDERING rule ((-area, contentHash), total, dense) is G-ORDER's business and is asserted by the gate against a recomputed digest, never duplicated here.",
  "type": "object",
  "additionalProperties": false,
  "required": ["continent", "orderDigest", "handles"],
  "properties": {
    "continent": { "type": "string", "pattern": "^c[0-9]{2}$" },
    "orderDigest": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" },
    "handles": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["handle", "type", "sizeKm", "region", "contentHash", "rank"],
        "properties": {
          "handle": {
            "type": "string",
            "pattern": "^c[0-9]{2}/[a-z-]+/h-[0-9a-f]{4,6}$",
            "description": "THE handle grammar, and it is identical in content/schemas/civil-record.schema.json (Plan D). 4-6 hex, not exactly 4: mintHandle slices 4 from contentHash and widens ONLY on a real collision. A stricter {4} pattern on the civil side would hard-reject a handle this ledger considers valid the first time that happens."
          },
          "type": { "type": "string" },
          "sizeKm": { "type": "number", "exclusiveMinimum": 0 },
          "region": { "type": "string", "pattern": "^c[0-9]{2}/r[0-9]{2}$" },
          "contentHash": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" },
          "rank": { "type": "integer", "minimum": 0 }
        }
      }
    }
  }
}
```

- [ ] **Step 5c: Add `G-VERTEX-BUDGET`'s landform tier and `G-POLY` for area instances**

Plan A implements `G-VERTEX-BUDGET`'s first two tiers (world-tier children ≤ 800, regions ≤ 200) over spine nodes. The third tier — **landform instances ≤ 40** — has no home there, because instances are deliberately not nodes. And `G-POLY` walks `tree.byId.values()`, so a wrongly-wound or self-intersecting **area** instance ships with every gate green. Both close here, over the fabric.

Add to `scripts/lib/world.mjs`:

```js
// The coverage regression spec §8.4 states rather than hides: with a 36-node
// trunk, 1,740 landform instances sit outside tree.byId, so G-POLY and
// G-VERTEX-BUDGET cannot see them. These two loops are how the fabric gates
// close that seam. The schema's maxItems catches the same thing earlier and
// more bluntly; this exists so the failure NAMES THE REMEDY instead of
// surfacing as `instances/412/geometry/ring must NOT have more than 40 items`.
//
// abs() appears NOWHERE here. A negative signed shoelace is a G-POLY failure,
// not a magnitude — the same discipline scripts/lib/spine.mjs holds.
export function gWorldInstanceGeometry({ fabric, shoelaceArea, selfIntersects, report }) {
  const MAX_INSTANCE_RING = 40;
  for (const f of fabric)
    for (const inst of f.instances ?? []) {
      const g = inst.geometry;
      const ring = g.shape === "area" ? g.ring : g.shape === "line" ? g.points : null;
      if (!ring) continue;
      if (ring.length > MAX_INSTANCE_RING)
        report(`G-VERTEX-BUDGET: ${inst.id} ring has ${ring.length} vertices > 40 for tier landform-instance`);
      if (g.shape !== "area") continue;
      if (ring.length < 3) {
        report(`G-POLY: instance ${inst.id} ring has ${ring.length} points — an area needs at least 3`);
        continue;
      }
      const a = shoelaceArea({ points: ring });
      if (!(a > 0))
        report(`G-POLY: instance ${inst.id} ring winding is ${a.toFixed(6)} — an area ring must be OPEN with a STRICTLY POSITIVE signed shoelace`);
      if (selfIntersects({ points: ring }))
        report(`G-POLY: instance ${inst.id} ring self-intersects`);
    }
}
```

Wire it into `checkWorld` beside the other four, importing `shoelaceArea` and `selfIntersects` from `scripts/lib/spine.mjs`, and add a red fixture at `scripts/tests/fixtures/world/g-poly-instance-winding/` whose `world/fabric/continent-01.json` carries one area instance with its ring reversed. Assert:

```js
test("G-POLY red: a backwards-wound area instance fails, and the message names the rule", () => {
  const r = runWorldGate(worldFixture({ overlayDir: "g-poly-instance-winding" }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-POLY: instance lf-c01-r01-0001 ring winding is -\d+\.\d+ — an area ring must be OPEN with a STRICTLY POSITIVE signed shoelace/);
});

test("G-VERTEX-BUDGET red: a 41-vertex instance ring is named, not left to ajv", () => {
  const r = runWorldGate(worldFixture({ overlayDir: "g-vertex-budget-instance" }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-VERTEX-BUDGET: lf-c01-r01-0002 ring has 41 vertices > 40 for tier landform-instance/);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test --prefix scripts`
Expected: PASS — the full scripts suite, including the eleven new world-gate tests. Note the suite's total wall time; the primer's rule is **budget 45 s and treat any regression above 60 s as a gate failure of its own**.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/world.mjs scripts/check_content.mjs scripts/tests/world-gates.test.mjs \
        scripts/tests/fixtures/world content/schemas/fabric-file.schema.json \
        content/schemas/handle-ledger.schema.json
git commit -m "feat: G-SEALAND, G-TRUNK-AREA, G-POI, G-ORDER and the fabric provenance pin"
```

#### Task 11 quality gate

- [ ] **Step 8: Verify**

```bash
node scripts/check_content.mjs --only=spine
node scripts/check_content.mjs --require-complete
npm test --prefix scripts
node scripts/check_spine_emit.mjs --check
node --test 'tools/mapforge/tests/*.test.mjs'
(cd colyseus-server && npm test -- mapDimensions)
time npm test --prefix scripts
```
Expected: everything green; `--only=spine` still under 4 s; `npm test --prefix scripts` under 60 s; 47 files clean; **no committed spine byte changed**.

- [ ] **Step 9: Independent adversarial review**

Brief: *the soft-skip is the thing that can red 45 unrelated fixtures — prove it holds by running `npm test --prefix scripts` and diffing the pass count against the pre-task baseline, not by reading the code. Attack the cross-boundary import: `check_content.mjs` now imports from `tools/mapforge/`, which has no `package.json` — confirm that works under `npm test --prefix scripts` (a different working directory) and under CI. Attack `gWorldPoi`: the roads loop is empty and lints as dead code — delete it or make it count. Attack `gWorldSeaLand`: it reports `trunkLandKm2` from `tree.byId`, which on a fixture root with no spine is null — confirm the note line is then omitted rather than printing "null". Attack the `G-ORDER` totality check: it only fires when `contentHash` is EQUAL, but the spec's rule is about area within 1e-6 — decide which is meant and make the message match the check.*

- [ ] **Step 10: Refactor** — the expected finding is the `G-ORDER` totality semantics; the honest rule is *two handles whose ordering key `(-area, contentHash)` is identical* — that is only possible when both terms match, so the message must say so, or the check must widen to areas within 1e-6 with differing hashes (which is legal, because the hash breaks the tie). Pick the second reading, keep the message string from the shared contract, and add a passing test for the legal near-tie.

- [ ] **Step 11: Re-verify** — re-run every command in Step 8.

- [ ] **Step 12: Commit and report**

```bash
git add -A && git commit -m "refactor: world gate review findings"
git branch --show-current && git log --oneline -1
```

---

### Task 12: `promote-world.mjs`, `G-REPRO`, the Node pin, and the harness wiring

Promotion today is **two hand steps, not one**: `gen-world.mjs` writes candidates with `derived` stripped, so a human must rename the files *and* separately run `check_spine_emit.mjs --write`. This task makes it one command, and makes running it twice a no-op — which is the definition of the idempotence today's version lacks.

**Files:**
- Create: `tools/mapforge/promote-world.mjs`
- Test: `tools/mapforge/tests/promote.test.mjs`, `tools/mapforge/tests/repro.test.mjs`
- Modify: `.release.json` (add `"nodeMajor": 18`)
- Modify: `.github/workflows/ci.yml:30-34` (read the Node major from `.release.json`)
- Modify: `scripts/integration.sh:117-121` (name G-REPRO in the section label)
- Create: `scripts/tests/node-pin.test.mjs`

**Interfaces:**
- Consumes: `writeRun`, `runPasses` (Task 10); `collectOutputs` from `scripts/check_spine_emit.mjs:196`
- Produces: `promoteWorld({ repoRoot, runDir, dryRun = false }): { written, deleted, errors }`

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/promote.test.mjs`:

```js
// tools/mapforge/tests/promote.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promoteWorld } from "../promote-world.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const GEN = join(ROOT, "tools/mapforge/generate-world.mjs");

// A scratch repo root: content/ + colyseus-server/ shells, so the emitter's
// three mirrors behave exactly as they do in the real tree.
function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), "promote-"));
  cpSync(join(ROOT, "content"), join(dir, "content"), { recursive: true });
  mkdirSync(join(dir, "colyseus-server/src/config/generated"), { recursive: true });
  cpSync(join(ROOT, "colyseus-server/src/config/generated"), join(dir, "colyseus-server/src/config/generated"), { recursive: true });
  cpSync(join(ROOT, "scripts"), join(dir, "scripts"), { recursive: true });
  cpSync(join(ROOT, "tools"), join(dir, "tools"), { recursive: true });
  return dir;
}

function generateInto(out) {
  execFileSync(process.execPath, [GEN, "--seed", "7c9e4a2f8b1d6e03", "--out", out, "--no-png"],
    { encoding: "utf8", cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
}

test("promote --dry-run writes nothing and lists what it would do", { timeout: 300000 }, () => {
  const repo = scratchRepo(), run = mkdtempSync(join(tmpdir(), "run-"));
  try {
    generateInto(run);
    const before = readdirSync(join(repo, "content/spine/nodes")).sort();
    const r = promoteWorld({ repoRoot: repo, runDir: run, dryRun: true });
    assert.deepEqual(readdirSync(join(repo, "content/spine/nodes")).sort(), before, "dry run wrote files");
    assert.ok(r.written.length > 0);
    assert.ok(r.deleted.length > 0, "dry run reported no deletions — reconciliation is not happening");
    assert.equal(r.errors.length, 0, r.errors.join("; "));
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(run, { recursive: true, force: true }); }
});

test("promote RECONCILES: every n-atlas descendant absent from the draft is DELETED", { timeout: 300000 }, () => {
  const repo = scratchRepo(), run = mkdtempSync(join(tmpdir(), "run-"));
  try {
    generateInto(run);
    promoteWorld({ repoRoot: repo, runDir: run });
    const after = new Set(readdirSync(join(repo, "content/spine/nodes")));
    assert.ok(!after.has("n-galereach.json"), "a stale n-atlas descendant survived promotion");
    assert.ok(after.has("n-atlas.json"));
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(run, { recursive: true, force: true }); }
});

test("promote NEVER deletes the three alias-anchor chart nodes", { timeout: 300000 }, () => {
  const repo = scratchRepo(), run = mkdtempSync(join(tmpdir(), "run-"));
  try {
    generateInto(run);
    const r = promoteWorld({ repoRoot: repo, runDir: run });
    // X2: n-site-thornveil -> n-thornveil and n-site-icefield ->
    // n-northern-icefield are representsNodeId pointers running FROM the
    // runtime tree INTO the chart; scripts/lib/spine.mjs:874-877 pushes a hard
    // G-ALIAS ERROR if either target vanishes. X4: town-millcross.json's
    // spineId host is n-millcross and check_content.mjs:1192 joins on it.
    // Reconciliation deletes every n-atlas descendant absent from the DRAFT,
    // so the guarantee lives in generate-world's preservedChartNodes — this
    // test is what proves the two halves agree.
    for (const id of ["n-thornveil", "n-northern-icefield", "n-millcross"]) {
      assert.ok(!r.deleted.includes(`content/spine/nodes/${id}.json`),
        `${id} was deleted by promotion — G-ALIAS or T1 goes red`);
      assert.ok(existsSync(join(repo, `content/spine/nodes/${id}.json`)), `${id} is gone from the promoted root`);
    }
    // And the gate agrees: G-ALIAS resolves, the town plan joins.
    assert.equal(r.errors.length, 0, r.errors.join("\n"));
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(run, { recursive: true, force: true }); }
});

test("promote replaces content/world/resolved/ wholesale, not incrementally", { timeout: 300000 }, () => {
  const repo = scratchRepo(), run = mkdtempSync(join(tmpdir(), "run-"));
  try {
    generateInto(run);
    // A stale resolved file from an earlier seed must NOT survive a promotion.
    // content/world/resolved/ is the ONLY file renderers read (D5), so a stale
    // one means the drawn world is the previous seed's with every gate green.
    mkdirSync(join(repo, "content/world/resolved"), { recursive: true });
    writeFileSync(join(repo, "content/world/resolved/continent-99.json"), '{"continent":"c99"}\n');
    mkdirSync(join(run, "content/world/resolved"), { recursive: true });
    writeFileSync(join(run, "content/world/resolved/continent-02.json"), '{"continent":"c02"}\n');
    const r = promoteWorld({ repoRoot: repo, runDir: run });
    assert.ok(r.deleted.includes("content/world/resolved/continent-99.json"), "the stale resolved file survived");
    assert.ok(!existsSync(join(repo, "content/world/resolved/continent-99.json")));
    assert.ok(existsSync(join(repo, "content/world/resolved/continent-02.json")));
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(run, { recursive: true, force: true }); }
});

test("promote PRESERVES the runtime subtree and its edges, byte for byte", { timeout: 300000 }, () => {
  const repo = scratchRepo(), run = mkdtempSync(join(tmpdir(), "run-"));
  try {
    const before = readFileSync(join(repo, "content/spine/nodes/n-playroot.json"), "utf8");
    const spawnBefore = readFileSync(join(repo, "content/spine/frozen-spawn-ids.json"), "utf8");
    generateInto(run);
    promoteWorld({ repoRoot: repo, runDir: run });
    assert.equal(readFileSync(join(repo, "content/spine/nodes/n-playroot.json"), "utf8"), before,
      "the runtime root changed — the runtime is a NON-GOAL");
    assert.equal(readFileSync(join(repo, "content/spine/frozen-spawn-ids.json"), "utf8"), spawnBefore);
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(run, { recursive: true, force: true }); }
});

test("promote runs the derive-writer, so every node lands with a `derived` block", { timeout: 300000 }, () => {
  const repo = scratchRepo(), run = mkdtempSync(join(tmpdir(), "run-"));
  try {
    generateInto(run);
    promoteWorld({ repoRoot: repo, runDir: run });
    for (const f of readdirSync(join(repo, "content/spine/nodes"))) {
      const doc = JSON.parse(readFileSync(join(repo, "content/spine/nodes", f), "utf8"));
      assert.ok(doc.derived && typeof doc.derived.digest === "string", `${f} has no derived block`);
    }
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(run, { recursive: true, force: true }); }
});

test("promoting TWICE is a no-op — step 2 is a SET reconciliation", { timeout: 300000 }, () => {
  const repo = scratchRepo(), run = mkdtempSync(join(tmpdir(), "run-"));
  try {
    generateInto(run);
    promoteWorld({ repoRoot: repo, runDir: run });
    const snap = (d) => readdirSync(d).sort().map((f) => `${f}:${readFileSync(join(d, f), "utf8")}`).join("\n");
    const a = snap(join(repo, "content/spine/nodes"));
    const r2 = promoteWorld({ repoRoot: repo, runDir: run });
    assert.equal(snap(join(repo, "content/spine/nodes")), a, "the second promotion changed the tree");
    assert.equal(r2.errors.length, 0, r2.errors.join("; "));
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(run, { recursive: true, force: true }); }
});

test("promote refuses a draft whose files do not match its own manifest hashes", { timeout: 300000 }, () => {
  const repo = scratchRepo(), run = mkdtempSync(join(tmpdir(), "run-"));
  try {
    generateInto(run);
    const p = join(run, "content/world/fabric/world.json");
    writeFileSync(p, readFileSync(p, "utf8").replace(/"seaLevel": [0-9.]+/, '"seaLevel": 9.99'));
    const r = promoteWorld({ repoRoot: repo, runDir: run, dryRun: true });
    assert.ok(r.errors.some((e) => /hash/i.test(e)), `no hash mismatch reported: ${JSON.stringify(r.errors)}`);
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(run, { recursive: true, force: true }); }
});
```

Create `tools/mapforge/tests/repro.test.mjs`:

```js
// tools/mapforge/tests/repro.test.mjs — G-REPRO's THREE properties.
// Today's gen-world.test.mjs asserts only the first, and it runs both
// generations on the same V8, so it cannot detect a cross-version
// divergence at all. Property 1 here is the same shape; properties 2 and 3
// are new, and the CI Node (pinned in .release.json) is the one that matters.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promoteWorld } from "../promote-world.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const GEN = join(ROOT, "tools/mapforge/generate-world.mjs");

const gen = (out, cwd = ROOT) =>
  execFileSync(process.execPath, [GEN, "--seed", "7c9e4a2f8b1d6e03", "--out", out, "--no-png"],
    { encoding: "utf8", cwd, maxBuffer: 64 * 1024 * 1024 });

// G-REPRO property 3 hashes the promoted tree. The set of directories it walks
// IS the definition of "the tree", so anything promotion writes but this omits
// is unguarded — the fixpoint claim would be true of a subset and false of the
// artifact. content/world/resolved/ is in the list because it is the ONLY file
// renderers read (D5); a stale one is a wrong drawing with a green hash.
export const WORLD_DIGEST_INPUTS = Object.freeze([
  "content/spine/nodes",
  "content/spine/edges.json",
  "content/world/fabric",
  "content/world/handles",
  "content/world/resolved",
]);

function treeHash(root, subpaths = WORLD_DIGEST_INPUTS) {
  const h = createHash("sha256");
  const walk = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.isDirectory()) walk(join(d, e.name), `${rel}/${e.name}`);
      else { h.update(`${rel}/${e.name}\n`); h.update(readFileSync(join(d, e.name))); }
    }
  };
  for (const sub of subpaths) {
    const p = join(root, sub);
    if (!existsSync(p)) { h.update(`${sub}:ABSENT\n`); continue; }
    if (statSync(p).isDirectory()) walk(p, sub);
    else { h.update(`${sub}\n`); h.update(readFileSync(p)); }
  }
  return h.digest("hex");
}

function firstDiff(a, b) {
  const files = new Set([...readdirSync(a), ...readdirSync(b)]);
  for (const f of [...files].sort()) {
    const pa = join(a, f), pb = join(b, f);
    try { if (readFileSync(pa, "utf8") !== readFileSync(pb, "utf8")) return f; } catch { return f; }
  }
  return null;
}

test("G-REPRO 1: same seed, two scratch dirs, byte-identical", { timeout: 400000 }, () => {
  const a = mkdtempSync(join(tmpdir(), "repro-a-")), b = mkdtempSync(join(tmpdir(), "repro-b-"));
  try {
    gen(a); gen(b);
    for (const sub of ["content/spine/nodes", "content/world/fabric", "content/world/handles"]) {
      const d = firstDiff(join(a, sub), join(b, sub));
      assert.equal(d, null, `G-REPRO: same seed, two scratch dirs differ at ${sub}/${d}`);
    }
  } finally { rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true }); }
});

test("G-REPRO 2: promotion does not change what the generator produces", { timeout: 400000 }, () => {
  const run = mkdtempSync(join(tmpdir(), "repro-run-"));
  const repo = mkdtempSync(join(tmpdir(), "repro-repo-"));
  const after = mkdtempSync(join(tmpdir(), "repro-after-"));
  try {
    for (const d of ["content", "scripts", "tools"]) cpSync(join(ROOT, d), join(repo, d), { recursive: true });
    mkdirSync(join(repo, "colyseus-server/src/config/generated"), { recursive: true });
    cpSync(join(ROOT, "colyseus-server/src/config/generated"), join(repo, "colyseus-server/src/config/generated"), { recursive: true });
    gen(run);
    promoteWorld({ repoRoot: repo, runDir: run });
    gen(after, repo);       // regenerate FROM the promoted root
    for (const sub of ["content/world/fabric", "content/world/handles"]) {
      const d = firstDiff(join(run, sub), join(after, sub));
      assert.equal(d, null, `G-REPRO: promotion changed generator output at ${sub}/${d}`);
    }
    // The drawings too: "two seeds sit side by side, diffable in place" is a
    // claim about what a human reviews, so the sheets must reproduce as well.
    const ds = firstDiff(join(run, "sheets"), join(after, "sheets"));
    assert.equal(ds, null, `G-REPRO: promotion changed generator output at sheets/${ds}`);
  } finally { for (const d of [run, repo, after]) rmSync(d, { recursive: true, force: true }); }
});

test("G-REPRO 3: promotion is a fixpoint", { timeout: 400000 }, () => {
  const run = mkdtempSync(join(tmpdir(), "repro-run2-"));
  const repo = mkdtempSync(join(tmpdir(), "repro-repo2-"));
  try {
    for (const d of ["content", "scripts", "tools"]) cpSync(join(ROOT, d), join(repo, d), { recursive: true });
    mkdirSync(join(repo, "colyseus-server/src/config/generated"), { recursive: true });
    cpSync(join(ROOT, "colyseus-server/src/config/generated"), join(repo, "colyseus-server/src/config/generated"), { recursive: true });
    gen(run);
    promoteWorld({ repoRoot: repo, runDir: run });
    const h1 = treeHash(repo);
    promoteWorld({ repoRoot: repo, runDir: run });
    const h2 = treeHash(repo);
    assert.equal(h1, h2, `G-REPRO: promotion is not a fixpoint — tree hash ${h1} != ${h2}`);
  } finally { for (const d of [run, repo]) rmSync(d, { recursive: true, force: true }); }
});

test("the generator runs on the Node major pinned in .release.json", () => {
  const pin = JSON.parse(readFileSync(join(ROOT, ".release.json"), "utf8")).nodeMajor;
  assert.equal(typeof pin, "number", ".release.json has no nodeMajor pin");
  const running = Number(process.versions.node.split(".")[0]);
  if (running !== pin)
    console.log(`repro: NOTE — running Node ${running}, the pin is ${pin}. ` +
      `Byte identity is a VERSION-PINNED CONTRACT, not a portability claim: CI is the authority.`);
});
```

Create `scripts/tests/node-pin.test.mjs`:

```js
// scripts/tests/node-pin.test.mjs — the determinism pin, R5.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test(".release.json pins the Node major", () => {
  const r = JSON.parse(readFileSync(join(ROOT, ".release.json"), "utf8"));
  assert.equal(typeof r.nodeMajor, "number");
  assert.ok(r.nodeMajor >= 18);
});

test("ci.yml reads the Node major from .release.json instead of hard-coding it", () => {
  const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
  assert.ok(!/node-version:\s*\d+\s*$/m.test(ci),
    "ci.yml still hard-codes a node-version — the pin must come from .release.json");
  assert.match(ci, /nodeMajor/, "ci.yml never mentions nodeMajor");
});

test("the Dockerfile's node major agrees with the pin", () => {
  const pin = JSON.parse(readFileSync(join(ROOT, ".release.json"), "utf8")).nodeMajor;
  const df = readFileSync(join(ROOT, "colyseus-server/Dockerfile"), "utf8");
  const m = /FROM\s+node:(\d+)/.exec(df);
  assert.ok(m, "no FROM node:<major> in colyseus-server/Dockerfile");
  assert.equal(Number(m[1]), pin,
    "the Dockerfile and .release.json disagree on the Node major — determinism is a VERSION-PINNED contract");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'tools/mapforge/tests/promote.test.mjs' && node --test --test-name-pattern "pin" 'scripts/tests/*.test.mjs'`
Expected: FAIL — `Cannot find module '.../promote-world.mjs'`; `.release.json` has no `nodeMajor`.

- [ ] **Step 3: Write `tools/mapforge/promote-world.mjs`**

```js
#!/usr/bin/env node
// tools/mapforge/promote-world.mjs — Plan C: idempotent promotion.
//
// Six steps as ONE command, replacing today's two hand steps (rename the
// candidates, then remember to run check_spine_emit --write):
//   1. verify the draft against its own manifest hashes
//   2. RECONCILE, don't append — delete every n-atlas-descendant node absent
//      from the draft, write every draft node, replace fabric/handles
//      wholesale, rewrite edges PRESERVING runtime edges identified by ROOT
//      MEMBERSHIP from roots.json, never by a pinned id list
//   3. derive through the ONE writer: scripts/check_spine_emit.mjs --write
//      (which also emits the three mirrors, mapDimensions.ts among them)
//   4. render
//   5. gate
//   6. report
// Step 2 is a SET reconciliation, so running it twice is a no-op; steps 3-4
// are already byte-idempotent emitters. G-REPRO property 3 pins that.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, cpSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(HERE, "../..");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const sha = (buf) => "sha256:" + createHash("sha256").update(buf).digest("hex");

function listFiles(dir, rel = "") {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.isDirectory()) out.push(...listFiles(join(dir, e.name), `${rel}${e.name}/`));
    else out.push(`${rel}${e.name}`);
  }
  return out;
}

export function promoteWorld({ repoRoot = DEFAULT_REPO_ROOT, runDir, dryRun = false }) {
  const written = [], deleted = [], errors = [];

  // ── 1. verify the draft against its own manifest ─────────────────────────
  const manPath = join(runDir, "manifest.json");
  if (!existsSync(manPath)) return { written, deleted, errors: [`promote: ${manPath} does not exist`] };
  const man = readJson(manPath);
  for (const [rel, want] of Object.entries(man.hashes ?? {})) {
    const p = join(runDir, rel);
    if (!existsSync(p)) { errors.push(`promote: draft file ${rel} is missing`); continue; }
    const got = sha(readFileSync(p));
    if (got !== want) errors.push(`promote: draft file ${rel} hash ${got} != manifest ${want}`);
  }
  if (errors.length) return { written, deleted, errors };

  // ── 2. reconcile ─────────────────────────────────────────────────────────
  const liveNodes = join(repoRoot, "content/spine/nodes");
  const draftNodes = join(runDir, "content/spine/nodes");
  const roots = readJson(join(repoRoot, "content/spine/roots.json"));

  const live = readdirSync(liveNodes).filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, doc: readJson(join(liveNodes, f)) }));
  const kids = new Map();
  for (const { doc } of live) {
    if (!kids.has(doc.parentId)) kids.set(doc.parentId, []);
    kids.get(doc.parentId).push(doc.id);
  }
  // Everything under n-atlas is the generator's territory. Everything under
  // every OTHER root is the runtime's and is never touched.
  const atlasIds = new Set();
  const stack = ["n-atlas"];
  while (stack.length) { const id = stack.pop(); atlasIds.add(id); for (const c of kids.get(id) ?? []) stack.push(c); }

  const draftFiles = new Set(readdirSync(draftNodes).filter((f) => f.endsWith(".json")));
  for (const { f, doc } of live) {
    if (!atlasIds.has(doc.id)) continue;                 // runtime: untouched
    if (draftFiles.has(f)) continue;                     // present in the draft: rewritten below
    deleted.push(`content/spine/nodes/${f}`);
    if (!dryRun) rmSync(join(liveNodes, f));
  }
  for (const f of [...draftFiles].sort()) {
    written.push(`content/spine/nodes/${f}`);
    if (!dryRun) writeFileSync(join(liveNodes, f), readFileSync(join(draftNodes, f)));
  }
  // Fabric, handles, RESOLVED and edges: wholesale replacement.
  //
  // `content/world/resolved/` is in this list because it is the ONLY file the
  // renderers read (D5). Leaving it out means that after a re-seed the drawn
  // world is the OLD one until someone remembers a second command — which is
  // precisely the two-hand-steps failure this command exists to kill. It is
  // absent in Plan C (nothing writes it yet) and `listFiles` returns [] for a
  // missing directory, so the loop is a no-op until Plan D's resolver lands.
  for (const fam of ["content/world/fabric", "content/world/handles", "content/world/resolved"]) {
    const src = join(runDir, fam), dst = join(repoRoot, fam);
    const stale = listFiles(dst).filter((f) => !listFiles(src).includes(f));
    for (const f of stale) { deleted.push(`${fam}/${f}`); if (!dryRun) rmSync(join(dst, f)); }
    for (const f of listFiles(src)) {
      written.push(`${fam}/${f}`);
      if (!dryRun) { mkdirSync(dirname(join(dst, f)), { recursive: true }); writeFileSync(join(dst, f), readFileSync(join(src, f))); }
    }
  }
  written.push("content/spine/edges.json");
  if (!dryRun)
    writeFileSync(join(repoRoot, "content/spine/edges.json"), readFileSync(join(runDir, "content/spine/edges.json")));

  if (dryRun) return { written, deleted, errors };

  // ── 3. derive through the ONE writer ─────────────────────────────────────
  try {
    execFileSync(process.execPath, [join(repoRoot, "scripts/check_spine_emit.mjs"), "--write",
                                    "--content-root", join(repoRoot, "content")],
      { encoding: "utf8", cwd: repoRoot });
  } catch (e) { errors.push(`promote: derive-writer failed: ${e.stdout ?? ""}${e.stderr ?? e.message}`); }

  // ── 4. render (SVG only — PNGs are a ship-time artifact, spec §7.5) ──────
  for (const sheet of ["cluster1", "atlas", "fabric", "overlay"]) {
    try {
      execFileSync(process.execPath, [join(repoRoot, "tools/mapforge/render-sheet.mjs"),
                                      "--sheet", sheet, "--no-png"], { encoding: "utf8", cwd: repoRoot });
    } catch (e) { errors.push(`promote: render ${sheet} failed: ${e.stdout ?? ""}${e.stderr ?? e.message}`); }
  }

  // ── 5. gate ──────────────────────────────────────────────────────────────
  try {
    execFileSync(process.execPath, [join(repoRoot, "scripts/check_content.mjs"), "--only=spine"],
      { encoding: "utf8", cwd: repoRoot });
  } catch (e) { errors.push(`promote: spine gate failed:\n${e.stdout ?? ""}${e.stderr ?? ""}`); }

  // ── 6. report ────────────────────────────────────────────────────────────
  console.log(`promote-world: ${written.length} written, ${deleted.length} deleted`);
  console.log(`promote-world: ratio ${man.seaToLandRatio} (land ${man.landKm2} km²)`);
  for (const e of errors) console.error(`promote-world: ${e}`);
  return { written, deleted, errors };
}

function main() {
  const argv = process.argv.slice(2);
  let runDir = null, dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from") runDir = resolve(argv[++i]);
    else if (argv[i] === "--dry-run") dryRun = true;
    else { console.error(`promote-world: unknown arg ${argv[i]}`); process.exit(2); }
  }
  if (!runDir) { console.error("promote-world: pass --from build/mapforge/<runId>"); process.exit(2); }
  const r = promoteWorld({ repoRoot: DEFAULT_REPO_ROOT, runDir, dryRun });
  if (r.errors.length) process.exit(1);
  console.log("promote-world: OK");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 4: Pin the Node major in `.release.json`**

```json
{
  "version": "1.8",
  "in_progress": true,
  "nodeMajor": 18,
  "started_at": "2026-08-09T09:49:12.721973+00:00",
  "started_by": "claude-a6c35399",
  "last_promoted_at": "2026-08-09T09:13:17.216338+00:00",
  "last_promoted_version": "1.7"
}
```

18 is not a guess: `.github/workflows/ci.yml:33` already pins `node-version: 18` to match `colyseus-server/Dockerfile`, and `scripts/tests/node-pin.test.mjs` asserts all three agree from now on. **Determinism is a version-pinned contract, not a portability claim** — never claim cross-platform byte identity for transcendental output; the point of Task 2's transcendental ban is that this pipeline has none, so the pin is belt-and-braces rather than the load-bearing guarantee.

- [ ] **Step 5: Make CI read the pin**

Replace `.github/workflows/ci.yml:30-34`:

```yaml
      # The Node major is a DETERMINISM PIN (Plan C, R5), not a preference.
      # .release.json is the single authority; colyseus-server/Dockerfile and
      # this file must agree, and scripts/tests/node-pin.test.mjs asserts it.
      # Read with grep, not `node -p`: there is no Node yet at this point.
      - name: Read the pinned Node major from .release.json
        id: nodepin
        run: |
          MAJOR="$(grep -o '"nodeMajor"[[:space:]]*:[[:space:]]*[0-9]*' .release.json | grep -o '[0-9]*$')"
          test -n "$MAJOR" || { echo "::error::.release.json has no nodeMajor pin"; exit 1; }
          echo "major=$MAJOR" >> "$GITHUB_OUTPUT"

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ steps.nodepin.outputs.major }}
          cache: pnpm
```

- [ ] **Step 6: Name G-REPRO in Gate 2's section label**

`scripts/integration.sh:117-121` — update the comment and label only:

```bash
# F-042 + Plan C: mapforge's own unit + parity suite (basin-sheet, atlas-sheet,
# raster, render-sheet) AND G-REPRO's three idempotence properties
# (tools/mapforge/tests/repro.test.mjs). Glob form, not a directory arg —
# `node --test <directory>` fails on newer Node (ledger ruling, Task 1).
mapforge_tests() { node --test "$REPO_ROOT"/tools/mapforge/tests/*.test.mjs; }
```

and at the execute block:

```bash
run_section "content: mapforge test suite (incl. G-REPRO)" mapforge_tests
```

**Deviation from the shared contract, stated openly.** The contract's Plan C row says *"`scripts/integration.sh` — add G-REPRO and the world gates"*. No new section is needed and adding one would be worse: `mapforge_tests`'s glob already matches `repro.test.mjs`, and the world gates (`G-SEALAND`, `G-TRUNK-AREA`, `G-POI`, `G-ORDER`, `G-WORLD-BUDGET`) land inside `checkSpine()`, which `content_gate` (`--require-complete`) already runs — verified by reading `scripts/integration.sh:80,121,133`. A duplicate section would pay G-REPRO's ~15 s twice for a cosmetic row in the summary. The label change is what makes the coverage legible. Plan A's CI change (`node --test 'tools/mapforge/tests/*.test.mjs'`) carries G-REPRO into CI by the same glob.

- [ ] **Step 7: Run tests to verify they pass**

```bash
node --test 'tools/mapforge/tests/promote.test.mjs'
node --test 'tools/mapforge/tests/repro.test.mjs'
node --test --test-name-pattern "pin" 'scripts/tests/*.test.mjs'
```
Expected: PASS — 6 + 4 + 3 tests. `repro.test.mjs` is the slow one; budget ~90 s for its three generations.

- [ ] **Step 8: Commit**

```bash
git add tools/mapforge/promote-world.mjs tools/mapforge/tests/promote.test.mjs \
        tools/mapforge/tests/repro.test.mjs scripts/tests/node-pin.test.mjs \
        .release.json .github/workflows/ci.yml scripts/integration.sh
git commit -m "feat: idempotent promote-world, G-REPRO, and the Node determinism pin"
```

#### Task 12 quality gate

- [ ] **Step 9: Verify — including a dry run against the LIVE root**

```bash
node tools/mapforge/generate-world.mjs --seed 7c9e4a2f8b1d6e03 --out build/mapforge/probe --no-png
node tools/mapforge/promote-world.mjs --from build/mapforge/probe --dry-run
git status --porcelain
node --test 'tools/mapforge/tests/*.test.mjs'
npm test --prefix scripts
node scripts/check_spine_emit.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: the dry run lists ~30 writes and ~30 deletes and **`git status --porcelain` shows no change under `content/`** — that is the proof Plan C does not redraw the world. `check_spine_emit --check` still reports 47 files clean.

- [ ] **Step 10: Independent adversarial review**

Brief: *the reconciliation is the dangerous half — a bug here deletes committed content. Confirm the `atlasIds` walk cannot reach a runtime node through a mis-parented file, and that a node with a dangling `parentId` is neither deleted nor silently kept. Confirm `deleted` is computed BEFORE any write, so a partially-written draft cannot cause a half-reconciliation. Confirm `--dry-run` really touches nothing, including the derive-writer and the renderer (it returns early — check the return is above step 3). Confirm the edges replacement preserves relay and sea-lane edges whose endpoints are FEATURES, not nodes. Confirm the manifest hash check covers every file the promotion copies, not just the ones the generator happened to list. Confirm `promoteWorld` never runs `git`.*

- [ ] **Step 11: Refactor** — apply the findings; the likeliest is the feature-endpoint edge case, which Task 10's review should already have fixed in `writeRun` and must be re-checked here.

- [ ] **Step 12: Re-verify** — re-run every command in Step 9, and confirm `git status --porcelain` is still clean under `content/`.

- [ ] **Step 13: Commit and report**

```bash
git add -A && git commit -m "refactor: promotion reconciliation review findings"
git branch --show-current && git log --oneline -1
```

---

### Task 13: Commit the fabric, wire the review surfaces, retire the old generator

The owner rule is not a follow-up: **every produced artifact must be observable in a review surface, and wiring it in is part of the producing task's acceptance criteria.** Plan C's artifacts are 14 fabric files and 13 handle ledgers, so this task lands two new committed sheets — `fabric` (the generated world drawn from the committed fabric alone) and `overlay` (the new coastline over today's, ghosted, with a per-continent area-delta table) — plus their storybook rows, art-manifest entries and thumbnails.

**Files:**
- Create: `content/world/fabric/world.json`, `content/world/fabric/continent-01..13.json`
- Create: `content/world/handles/continent-01..13.json`
- Create: `tools/mapforge/lib/fabric-sheet.mjs`, `tools/mapforge/lib/overlay-sheet.mjs`
- Create: `game-client/assets/art/maps/world-fabric.svg`, `world-overlay.svg` + their `<= 512 px` PNG thumbs
- Modify: `tools/mapforge/render-sheet.mjs:38-51` (`SHEETS` gains two entries)
- Modify: `tools/asset-storybook/maps-index.json` (two rows), `tools/asset-storybook/js/maps.mjs` (a fabric census panel)
- Modify: `game-client/assets/art/art-manifest.json` (`art:map-fabric`, `art:map-overlay` + license rows)
- Modify: `content/world/render-lock.json` (Plan A's lock gains the fabric paths)
- Delete: `tools/mapforge/gen-world.mjs`, `tools/mapforge/lib/world-gen.mjs`, `tools/mapforge/tests/gen-world.test.mjs`, `tools/mapforge/tests/world-gen.test.mjs`

(The `.gitignore` edits — explicit `build/mapforge/`, and dropping the retired `content/spine/candidates/` rule — land in Task 10b Step 5, with the CLI that retires the concept.)

**Interfaces:**
- Consumes: `computeLock({ repoRoot, sheets, extraPaths })` from `scripts/lib/render-lock.mjs` (Plan A); `C` palette and `patternDefs` from `tools/mapforge/lib/draft.mjs`
- Produces: `SHEETS.fabric`, `SHEETS.overlay` following Plan A's grown entry shape `{ title, outSvg, outPng, maxLabelRank, build({ repoRoot }) }`

<div class="callout warn">

**MERGE ORDER: this task must rebase onto Plan B Task 12, and four files must be REGENERATED rather than text-merged.**

The programme runs Plan B's render half in parallel with Plan C, and these two tasks are the one place they collide. Both write:

| File | Plan B Task 10–12 writes | Plan C Task 13 writes |
|---|---|---|
| `content/world/render-lock.json` | adds the synthetic row (T10), re-baselines both live sheet hashes (T12) | adds the fabric + overlay rows |
| `tools/asset-storybook/maps-index.json` | adds `synthetic`; rewrites every `png` to a `<= 512 px` thumb path | adds `fabric`, `overlay` |
| `game-client/assets/art/art-manifest.json` | new `art:map-*` rows + thumb hashes | `art:map-fabric`, `art:map-overlay` + license rows |
| `tools/mapforge/render-sheet.mjs` `SHEETS` | registers 1 sheet | registers 2 sheets |

Three of the four are **hash-bearing generated content**. A textual auto-merge of `render-lock.json` produces a lock that is green against neither lane — Plan B's re-baselined sheet hashes plus Plan C's fabric hashes, with no single tree that ever produced both. **The render lock is never text-merged.** The procedure, in order:

```bash
git fetch origin && git rebase origin/<plan-b-branch>     # B lands first
git checkout --theirs content/world/render-lock.json      # take B's, do not merge
node tools/mapforge/render-sheet.mjs --sheet fabric  --no-png
node tools/mapforge/render-sheet.mjs --sheet overlay --no-png
node scripts/check_render_lock.mjs --write                # REGENERATE, all rows
node scripts/bake_thumbnails.mjs                          # REGENERATE, all thumbs
node scripts/check_asset_manifest.mjs                     # zero STALE
```

`maps-index.json`, `art-manifest.json` and the `SHEETS` registry are hand-merged — they are additive rows, and Plan B's `png` path rewrite must survive, so **re-apply Plan C's two rows on top of B's file** rather than the other way round. Step 8's verify block is what proves the result: every sheet id appears in the index in both directions (X8), the lock matches, and `check_asset_manifest.mjs` reports zero stale thumbs.

</div>

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/fabric-sheet.test.mjs`:

```js
// tools/mapforge/tests/fabric-sheet.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SHEETS } from "../render-sheet.mjs";
import { buildFabricSheet } from "../lib/fabric-sheet.mjs";
import { buildOverlaySheet } from "../lib/overlay-sheet.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("SHEETS registers fabric and overlay with the grown entry shape", () => {
  for (const id of ["fabric", "overlay"]) {
    const s = SHEETS[id];
    assert.ok(s, `SHEETS has no "${id}" entry`);
    assert.equal(typeof s.title, "string");
    assert.equal(typeof s.maxLabelRank, "number");
    assert.match(s.outSvg, /^game-client\/assets\/art\/maps\/.*\.svg$/);
    assert.match(s.outPng, /^game-client\/assets\/art\/maps\/.*\.png$/);
    assert.equal(typeof s.build, "function");
  }
});

test("the fabric sheet draws all 13 landmasses and reports no problems", () => {
  const { svg, problems, notes } = buildFabricSheet({ repoRoot: ROOT });
  assert.deepEqual(problems, [], problems.join("; "));
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>\s*$/);
  for (const c of ["c01", "c13"]) assert.ok(svg.includes(c), `no mark for ${c}`);
  assert.ok(notes.some((n) => /13 landmasses/.test(n)), notes.join("; "));
});

test("the fabric sheet is drawn from the COMMITTED fabric, not from the spine", () => {
  const src = readFileSync(join(ROOT, "tools/mapforge/lib/fabric-sheet.mjs"), "utf8");
  assert.ok(!/loadSpine|buildTree/.test(src),
    "the fabric sheet reads the spine — it must read content/world/fabric/ so the two layers can be compared");
  assert.match(src, /content\/world\/fabric/);
});

test("the overlay sheet reads the baseline from the DRAFT folder, never from git", () => {
  const src = readFileSync(join(ROOT, "tools/mapforge/lib/overlay-sheet.mjs"), "utf8");
  assert.ok(!/execFileSync|child_process|git /.test(src),
    "the overlay sheet shells out — it must read baseline/ from the draft folder so it works in a dirty worktree");
});

test("the overlay sheet carries a per-continent area-delta table", () => {
  const { svg, problems } = buildOverlaySheet({ repoRoot: ROOT });
  assert.deepEqual(problems, []);
  assert.match(svg, /area delta/i);
  assert.ok((svg.match(/<text/g) ?? []).length >= 14, "no per-continent delta rows");
});

test("both sheets stay inside the committed SVG byte budget", () => {
  const budgets = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  for (const id of ["fabric", "overlay"]) {
    const bytes = readFileSync(join(ROOT, SHEETS[id].outSvg)).length;
    assert.ok(bytes <= budgets.sheets.maxSvgBytes,
      `${id} sheet is ${bytes} bytes > budget ${budgets.sheets.maxSvgBytes}`);
  }
});

test("the committed fabric is complete: 14 files, 13 ledgers", () => {
  const f = readdirSync(join(ROOT, "content/world/fabric")).sort();
  assert.equal(f.length, 14);
  assert.ok(f.includes("world.json"));
  assert.equal(readdirSync(join(ROOT, "content/world/handles")).length, 13);
});

test("the retired generator and its tests are gone", () => {
  for (const p of ["tools/mapforge/gen-world.mjs", "tools/mapforge/lib/world-gen.mjs",
                   "tools/mapforge/tests/gen-world.test.mjs", "tools/mapforge/tests/world-gen.test.mjs"])
    assert.equal(existsSync(join(ROOT, p)), false, `${p} survived`);
});

test("the retired content/spine/candidates/ ignore rule is gone", () => {
  const gi = readFileSync(join(ROOT, ".gitignore"), "utf8");
  assert.ok(!gi.includes("content/spine/candidates/"),
    "the candidates ignore rule survived — the CONCEPT is retired, and the directory never existed on disk");
});
```

Extend `tools/asset-storybook/tests/maps-index.test.mjs` implicitly: it already asserts parity in both directions, so registering two sheets without indexing them turns it red. No edit is needed there — that is the point of the gate.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'tools/mapforge/tests/fabric-sheet.test.mjs'`
Expected: FAIL — `SHEETS has no "fabric" entry`.

- [ ] **Step 3: Generate and commit the fabric**

```bash
node tools/mapforge/generate-world.mjs --seed 7c9e4a2f8b1d6e03 --out build/mapforge/release --no-png
mkdir -p content/world/fabric content/world/handles
cp build/mapforge/release/content/world/fabric/*.json content/world/fabric/
cp build/mapforge/release/content/world/handles/*.json content/world/handles/
node scripts/check_content.mjs --only=spine
```
Expected: `G-SEALAND: ratio 1.50 …` green; `G-SEALAND: trunk land 6243.5 km² vs fabric net land 64000.0 km²` printed as the honest divergence note; `G-TRUNK-AREA` silent (no committed node cites a fabric file yet); `G-POI` and `G-ORDER` green; `world-budget: fabric 14 files, … (budget 20, 4194304)`.

**Copy the files; do not run `promote-world.mjs` against the live root.** Promotion rewrites `content/spine/nodes/`, which is Plan E's commit. The dry run in Task 12 already proved promotion works; here only the fabric lands.

- [ ] **Step 4: Write `tools/mapforge/lib/fabric-sheet.mjs`**

```js
// tools/mapforge/lib/fabric-sheet.mjs — the generated world, drawn from the
// COMMITTED fabric alone. Deliberately minimal ink: land, sea, region
// outlines, settlement dots, rivers, continent titles. No glyphs, no label
// declutter, no biome patterns — those are Plan B's phase-3 capability and
// this sheet must not block on it. Plan E enriches it.
//
// It reads content/world/fabric/ and NOT the spine, on purpose: the whole
// value of this sheet is that a reviewer can see what the fabric says while
// the trunk still says something else.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { C } from "./draft.mjs";

const W = 400, H = 400, PX = 2.5;                    // 1000 x 1000 px sheet
const px = (v) => (v * PX).toFixed(1);
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

export function buildFabricSheet({ repoRoot }) {
  const problems = [], notes = [];
  const dir = join(repoRoot, "content/world/fabric");
  let world = null;
  const fabric = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (f === "world.json") world = doc; else fabric.push(doc);
  }
  if (!world) problems.push("fabric-sheet: content/world/fabric/world.json is missing");
  if (fabric.length === 0) problems.push("fabric-sheet: no continent fabric files found");
  if (problems.length) return { svg: "", notes, problems };

  const body = [];
  body.push(`<rect x="0" y="0" width="${px(W)}" height="${px(H)}" fill="${C.parchment}"/>`);
  for (const f of fabric) {
    for (const r of f.regions) {
      if (!r.ring || r.ring.length < 3) { problems.push(`fabric-sheet: ${r.id} has no ring`); continue; }
      const d = r.ring.map(([x, y], i) => `${i === 0 ? "M" : "L"}${px(x)},${px(y)}`).join(" ") + " Z";
      const fill = r.survey === "surveyed" ? C.land : C.landPale ?? C.land;
      const op = r.survey === "surveyed" ? 1 : 0.55;
      body.push(`<path d="${d}" fill="${fill}" fill-opacity="${op}" stroke="${C.ink}" stroke-width="0.4"/>`);
    }
    for (const road of f.roads ?? [])
      body.push(`<polyline points="${road.points.map(([x, y]) => `${px(x)},${px(y)}`).join(" ")}" ` +
                `fill="none" stroke="${C.ink}" stroke-width="0.6" stroke-dasharray="3 2"/>`);
    for (const s of f.settlements ?? []) {
      const r = s.rank === "capital" ? 3.2 : s.rank === "hub" ? 2.2 : 1.4;
      body.push(`<circle cx="${px(s.at[0])}" cy="${px(s.at[1])}" r="${r}" fill="${C.ink}"/>`);
    }
    // One title per landmass, at the area-weighted centroid of its regions.
    let cx = 0, cy = 0, tot = 0;
    for (const r of f.regions) { if (!r.centroidKm) continue; cx += r.centroidKm[0] * r.areaKm2; cy += r.centroidKm[1] * r.areaKm2; tot += r.areaKm2; }
    if (tot > 0)
      body.push(`<text x="${px(cx / tot)}" y="${px(cy / tot)}" text-anchor="middle" ` +
                `font-family="Georgia, serif" font-size="13" fill="${C.ink}">${esc(f.continent)}</text>`);
  }
  notes.push(`fabric-sheet: ${fabric.length} landmasses, ` +
             `${fabric.reduce((s, f) => s + f.regions.length, 0)} regions, ` +
             `${fabric.reduce((s, f) => s + (f.settlements?.length ?? 0), 0)} settlements`);
  notes.push(`fabric-sheet: sea/land ${world.seaToLandRatio} on ${world.areaKm2.netLand} km² of net land`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px(W)}" height="${px(H)}" ` +
    `viewBox="0 0 ${px(W)} ${px(H)}">\n${body.join("\n")}\n</svg>\n`;
  return { svg, notes, problems };
}
```

`C.landPale` may not exist in `tools/mapforge/lib/draft.mjs` today — the `?? C.land` fallback keeps this working either way, and the reviewer should decide whether to add the token or keep the fallback.

- [ ] **Step 5: Write `tools/mapforge/lib/overlay-sheet.mjs`**

```js
// tools/mapforge/lib/overlay-sheet.mjs — before/after.
//
// The BASELINE (today's committed trunk polygons) ghosted at 20% opacity
// under the generated coastline at full ink, plus a per-continent area-delta
// table. Read from the DRAFT FOLDER's baseline/ copy when one is given, and
// from content/spine/nodes/ otherwise — NEVER from git, so it works in a
// dirty worktree (spec §7.4).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { C } from "./draft.mjs";

const W = 400, H = 400, PX = 2.5;
const px = (v) => (v * PX).toFixed(1);
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
const shoelace = (pts) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
};

export function buildOverlaySheet({ repoRoot, baselineDir = null }) {
  const problems = [], notes = [];
  const baseDir = baselineDir ?? join(repoRoot, "content/spine/nodes");
  if (!existsSync(baseDir)) { problems.push(`overlay-sheet: baseline dir ${baseDir} does not exist`); return { svg: "", notes, problems }; }

  const baseline = readdirSync(baseDir).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(baseDir, f), "utf8")))
    .filter((n) => n.tier === "continent" && n.placement?.shape === "polygon");

  const fabDir = join(repoRoot, "content/world/fabric");
  const fabric = readdirSync(fabDir).filter((f) => f.endsWith(".json") && f !== "world.json").sort()
    .map((f) => JSON.parse(readFileSync(join(fabDir, f), "utf8")));

  const body = [`<rect x="0" y="0" width="${px(W)}" height="${px(H)}" fill="${C.parchment}"/>`];
  for (const n of baseline) {
    const d = n.placement.points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${px(x)},${px(y)}`).join(" ") + " Z";
    body.push(`<path d="${d}" fill="${C.ink}" fill-opacity="0.2" stroke="none"/>`);
  }
  for (const f of fabric)
    for (const r of f.regions) {
      if (!r.ring || r.ring.length < 3) continue;
      const d = r.ring.map(([x, y], i) => `${i === 0 ? "M" : "L"}${px(x)},${px(y)}`).join(" ") + " Z";
      body.push(`<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="0.5"/>`);
    }

  // The per-continent area-delta table.
  const baseTotal = baseline.reduce((s, n) => s + shoelace(n.placement.points), 0);
  const rows = fabric.map((f) => {
    const km2 = f.cellCensus.land * f.cellKm * f.cellKm;
    return { id: f.continent, km2 };
  });
  const newTotal = rows.reduce((s, r) => s + r.km2, 0);
  body.push(`<text x="16" y="24" font-family="Georgia, serif" font-size="13" fill="${C.ink}">Area delta — baseline vs generated</text>`);
  rows.forEach((r, i) => {
    body.push(`<text x="16" y="${44 + i * 15}" font-family="monospace" font-size="10" fill="${C.ink}">` +
              `${esc(r.id)}  ${r.km2.toFixed(1)} km²</text>`);
  });
  body.push(`<text x="16" y="${44 + rows.length * 15}" font-family="monospace" font-size="10" fill="${C.ink}">` +
            `TOTAL ${baseTotal.toFixed(1)} -> ${newTotal.toFixed(1)} km² ` +
            `(x${(newTotal / (baseTotal || 1)).toFixed(2)})</text>`);
  notes.push(`overlay-sheet: baseline ${baseline.length} continent polygons, generated ${fabric.length}`);
  notes.push(`overlay-sheet: land ${baseTotal.toFixed(1)} -> ${newTotal.toFixed(1)} km²`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px(W)}" height="${px(H)}" ` +
    `viewBox="0 0 ${px(W)} ${px(H)}">\n${body.join("\n")}\n</svg>\n`;
  return { svg, notes, problems };
}
```

- [ ] **Step 6: Register both sheets**

In `tools/mapforge/render-sheet.mjs`, add to the `SHEETS` object (which Plan A grew with `title` and `maxLabelRank`):

```js
  fabric: {
    title: "The Generated World — Fabric Survey",
    outSvg: "game-client/assets/art/maps/world-fabric.svg",
    outPng: "game-client/assets/art/maps/world-fabric.png",
    maxLabelRank: 3,
    build: buildFabricSheet,
  },
  overlay: {
    title: "Coastline Overlay — Baseline vs Generated",
    outSvg: "game-client/assets/art/maps/world-overlay.svg",
    outPng: "game-client/assets/art/maps/world-overlay.png",
    maxLabelRank: 2,
    build: buildOverlaySheet,
  },
```

with the two imports at the top:

```js
import { buildFabricSheet } from "./lib/fabric-sheet.mjs";
import { buildOverlaySheet } from "./lib/overlay-sheet.mjs";
```

- [ ] **Step 7: Render, bake the thumbs, index and manifest**

```bash
node tools/mapforge/render-sheet.mjs --sheet fabric --no-png
node tools/mapforge/render-sheet.mjs --sheet overlay --no-png
npm ci --prefix scripts        # sharp lives here
node scripts/bake_thumbnails.mjs --only art:map-fabric
node scripts/bake_thumbnails.mjs --only art:map-overlay
```

Add two rows to `tools/asset-storybook/maps-index.json`, matching `SHEETS[id].outSvg`/`outPng` byte for byte:

```json
    {
      "id": "fabric",
      "title": "The Generated World — Fabric Survey",
      "svg": "game-client/assets/art/maps/world-fabric.svg",
      "png": "game-client/assets/art/maps/world-fabric.png",
      "note": "13 landmasses, 160 regions and 45 settlements drawn straight from content/world/fabric/ — the generated layer, before any authored meaning is joined on."
    },
    {
      "id": "overlay",
      "title": "Coastline Overlay — Baseline vs Generated",
      "svg": "game-client/assets/art/maps/world-overlay.svg",
      "png": "game-client/assets/art/maps/world-overlay.png",
      "note": "Today's committed coastline ghosted under the generated one, with a per-continent area-delta table. Read from the draft folder, never from git."
    }
```

Add `art:map-fabric` and `art:map-overlay` entries to `game-client/assets/art/art-manifest.json`, copying the shape of the existing `art:map-atlas` entry at `:517` exactly — same license row, same thumbnail-freshness fields — so `scripts/check_asset_manifest.mjs`'s guard (U) passes.

Add a **fabric census panel** to `tools/asset-storybook/js/maps.mjs`: below the sheet viewer, a table of the 14 fabric files with `continent · gross land km² · regions · settlements · instances`, read from `content/world/fabric/*.json` at page load, plus one headline line `sea/land <ratio> on <netLand> km² of net land` from `world.json`. Follow the existing fetch-and-degrade pattern at `tools/asset-storybook/js/maps.mjs:23-30` — a missing file disables the panel with a console note, it never throws.

- [ ] **Step 8: Extend Plan A's render lock to cover the fabric**

Plan A's `computeLock({ repoRoot, sheets, extraPaths })` already takes `extraPaths`. In `scripts/check_render_lock.mjs`, pass every committed fabric and handle file:

```js
const extraPaths = [
  ...readdirSync(join(repoRoot, "content/world/fabric")).sort()
     .map((f) => `content/world/fabric/${f}`),
  ...readdirSync(join(repoRoot, "content/world/handles")).sort()
     .map((f) => `content/world/handles/${f}`),
];
```

Then re-baseline once: `node scripts/check_render_lock.mjs --write`. That is a legitimate lock update — the lock is *gaining* artifacts, not changing existing ones; confirm by diffing that no pre-existing `artifacts` value changed.

- [ ] **Step 9: Delete the retired generator**

```bash
git rm tools/mapforge/gen-world.mjs tools/mapforge/lib/world-gen.mjs \
       tools/mapforge/tests/gen-world.test.mjs tools/mapforge/tests/world-gen.test.mjs
```

Remove the `content/spine/candidates/` block from `.gitignore:122-125` — the concept is retired and the directory has never existed on disk, so there is nothing else to clean up. Grep for stragglers before committing:

```bash
grep -rn "gen-world\|world-gen\|candidates" --include=*.mjs --include=*.sh --include=*.yml --include=*.json . \
  | grep -v node_modules | grep -v build/
```
Expected: no hits outside this plan document. `scripts/integration.sh` and `.github/workflows/ci.yml` never referenced `gen-world.mjs` — verified by reading both in full — so no harness edit is needed here.

- [ ] **Step 10: Run tests to verify they pass**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node --test 'tools/asset-storybook/tests/*.test.mjs'
node scripts/check_asset_manifest.mjs
node scripts/check_render_lock.mjs --check
```
Expected: PASS. The storybook parity test is the one that proves the owner rule was honoured.

- [ ] **Step 11: Commit**

```bash
git add content/world/fabric content/world/handles \
        tools/mapforge/lib/fabric-sheet.mjs tools/mapforge/lib/overlay-sheet.mjs \
        tools/mapforge/render-sheet.mjs tools/mapforge/tests/fabric-sheet.test.mjs \
        tools/asset-storybook/maps-index.json tools/asset-storybook/js/maps.mjs \
        game-client/assets/art/maps/world-fabric.svg game-client/assets/art/maps/world-fabric.png \
        game-client/assets/art/maps/world-overlay.svg game-client/assets/art/maps/world-overlay.png \
        game-client/assets/art/art-manifest.json game-client/assets/.thumbs/index.json \
        content/world/render-lock.json scripts/check_render_lock.mjs .gitignore
git commit -m "feat: commit the generated fabric, add the fabric and overlay sheets"
git commit -m "refactor: retire gen-world and world-gen"   # after the git rm above is staged
```

#### Task 13 quality gate

- [ ] **Step 12: Verify — the full Gate 1 and Gate 2**

```bash
./scripts/precheck.sh --no-install
./scripts/integration.sh --no-install
node scripts/check_spine_emit.mjs --check
git diff --stat main...HEAD -- content/spine content/maps game-client/assets/art/maps/cluster1-world.svg game-client/assets/art/maps/atlas-world.svg
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: **both gates green**, `check_spine_emit --check` still `clean, 47 files`, and the `git diff --stat` **empty** — that last command is the migration invariant, checked mechanically. If it prints a single line, Plan C has redrawn the world and the commit belongs in Plan E.

- [ ] **Step 13: Independent adversarial review of the whole plan's diff**

This is the plan-level review, not just this task's. Dispatch with `git diff main...HEAD` and this brief: *(1) prove the migration invariant — no committed spine byte, no committed sheet byte for `cluster1`/`atlas`, no runtime coordinate changed; (2) prove the fabric is regenerable — delete `content/world/fabric/` and `content/world/handles/`, re-run the generator, copy back, and confirm `git status` is clean; (3) attack the storybook panel for a fetch path that only works when served from the repo root; (4) confirm the art-manifest entries pass guard (U) after a re-bake, not just once; (5) confirm the render lock gained 27 artifacts and changed zero existing hashes; (6) confirm the two deleted test files had no assertion that is now uncovered — in particular `world-gen.test.mjs`'s ring-validity tests, which must have an equivalent in `arcs.test.mjs`.*

- [ ] **Step 14: Refactor** — act on every finding. The likeliest is (6): port any surviving `validRing` coverage from `world-gen.test.mjs` into `arcs.test.mjs` before the deletion stands.

- [ ] **Step 15: Re-verify** — re-run every command in Step 12, and re-run the regenerate-and-compare from review point (2).

- [ ] **Step 16: Commit and report**

```bash
git add -A && git commit -m "refactor: fabric layer final review findings"
git branch --show-current && git log --oneline -1
```

---

## Acceptance criteria for the whole plan

Plan C is done when every one of these is demonstrated with pasted command output, not asserted:

1. `node tools/mapforge/generate-world.mjs --seed 7c9e4a2f8b1d6e03 --out build/mapforge/<runId> --no-png --stage-report` completes in **under 8,000 ms total**, prints a stage line per pass, and writes a complete content root.
2. `node scripts/check_content.mjs --only=spine --content-root build/mapforge/<runId>/content` reports **0 failures**, including `G-TRUNK-AREA` within ±3% on **all 13** landmasses.
3. `node scripts/check_content.mjs --only=spine` on the **committed** root reports 0 failures, prints `G-SEALAND: ratio 1.50 …` inside `[1.20, 1.80]`, prints the honest trunk-divergence note, and prints `world-budget:` for both families.
4. `land + sea === 160,000 ± 1 km²` and `Σ ownerHistogram + unowned + seaCells === 640,000` — the integer proof of non-overlap at the region level.
5. `node --test 'tools/mapforge/tests/repro.test.mjs'` passes all three `G-REPRO` properties.
6. `node tools/mapforge/promote-world.mjs --from <runDir> --dry-run` lists writes and deletes and leaves `git status --porcelain` clean under `content/`.
7. `node scripts/check_spine_emit.mjs --check` reports `clean, 47 files` — **zero spine bytes changed by any commit in this plan**.
8. `(cd colyseus-server && npm test -- mapDimensions)` green on **every** commit.
9. `git diff --stat main...HEAD -- content/spine content/maps game-client/assets/art/maps/cluster1-world.svg game-client/assets/art/maps/atlas-world.svg` is **empty**.
10. `node --test 'tools/asset-storybook/tests/*.test.mjs'` green with the `fabric` and `overlay` rows present — the owner's observability rule, honoured inside the producing task.
11. `npm test --prefix scripts` under **60 s** (budget 45 s; treat a regression above 60 s as a gate failure of its own).
12. `./scripts/precheck.sh --no-install` and `./scripts/integration.sh --no-install` both green.
13. `tools/mapforge/gen-world.mjs`, `lib/world-gen.mjs` and their two test files are gone, and `SYNTHETIC_LOAD_BUDGET`, `PRE_WORLD_ATLAS_CHILDREN` and `PRE_WORLD_SEALANE_ID` appear nowhere in the repo.
14. `.release.json` carries `nodeMajor`, `.github/workflows/ci.yml` reads it, and `colyseus-server/Dockerfile` agrees.

## Handoff to Plan D and Plan E

**Plan D consumes, by exact path and signature:**
- `content/world/fabric/continent-01..13.json` + `world.json` — regions with `id`, `survey`, `ring`, `levelBand`, `adjacent`, `centroidKm`; instances with `handle`, `type`, `sizeKm`, `region`, `named`, `dungeonCapable`.
- `content/world/handles/continent-01..13.json` — the handle a bound record's `bind.handle` names, with the committed `orderDigest` `G-ORDER` re-checks.
- `runPasses({ manifest, premises, pinned, relations })` — Plan D supplies the ~40 pinned records and the relation set; `placeSettlements` already places `pinned` **before** scoring, so `G-PIN-SAT` is a generation failure rather than a join failure.
- `scripts/lib/world.mjs`'s `loadFabric({ contentRoot })` — returns `{ present, manifest, budgets, fabric, world, handles, errors }`. **It is named `loadFabric`, not `loadWorld`, deliberately**: Plan D adds `loadCivil({ contentRoot, fabric })` in `scripts/lib/resolve.mjs` for the authored half, and two exported functions called `loadWorld` reading the same directory with different return shapes is exactly the ambiguity a reviewer cannot resolve from a call site. `loadCivil` takes this function's result as an argument rather than re-reading the same 27 files on every gate run.

**Plan E consumes:**
- `tools/mapforge/promote-world.mjs` — the redraw commit *is* one `promote-world.mjs` run plus the re-baseline order of R12.
- `content/world/fabric/*.json` as the authority `G-TRUNK-AREA` joins the redrawn trunk against, via each continent node's `provenance.generator.fabric`.
- `tools/mapforge/lib/overlay-sheet.mjs` — the before/after the redraw review reads.

**Left explicitly for later, with the reason:**
- **Naming.** The generator marks *which* 336 instances are named and never writes a title; `tools/mapforge/lib/name-gen.mjs` and the five registers are Plan D's, because a name is meaning.
- **The trunk redraw.** `content/spine/nodes/` is untouched here so the migration invariant holds for every Plan C commit; Plan E lands the 44 → 36 change in ONE revertible commit.
- **Rich cartography.** The `fabric` sheet is minimal ink on purpose — 20 biome fills, ~40 glyph families, label declutter and zoom tiers are Plan B's phase-3 capability, and Plan B's own acceptance criterion is that they work on today's small chart before the world grows.
