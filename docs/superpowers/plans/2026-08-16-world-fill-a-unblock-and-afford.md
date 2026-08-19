# World Fill — Plan A: Unblock and Afford Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the map lane affordable and redraw-safe without changing a single drawn pixel — at the end, `G-OVERLAP` runs in ~20 ms instead of ~3,040 ms on the same 133 sibling pairs, both sheet adapters read a committed descriptor instead of hard-coded node ids, the three content-gate joins and the sheet builders read a spine-derived world instead of the legacy `content/maps/cluster1-geography.json` mirror (which is deleted), five byte-for-byte file comparisons collapse into one checksum lock with a unified diff on mismatch, `G-VERTEX-BUDGET` and a per-parent child cap exist and are green, and both committed SVGs are byte-identical to what is committed today.

**Architecture:** Three independent seams open in a fixed order. (1) A new pure library `scripts/lib/geometry.mjs` replaces lattice-sampled polygon overlap with bbox reject → exact disjointness pre-filter → ear-clip + convex Sutherland–Hodgman clipped area, swapped in at exactly one call site with `G-DERIVED-DRIFT` staying byte-green as the proof nothing moved. (2) A new pure library `scripts/lib/places.mjs` owns the spine → world-document join that `emitGeography()` performs today; every consumer of the legacy mirror re-points at it, both hard-coded sheet adapters become descriptor-driven from `content/spine/sheet.json` / `sheet-atlas.json`, and only then is the mirror deleted. (3) A new `scripts/lib/render-lock.mjs` + `scripts/check_render_lock.mjs` hashes each built sheet into `content/world/render-lock.json`, replacing `check_map_render.mjs`, `render-map.mjs --check`, `parity.test.mjs` and the 47 KB `basin-baseline.svg` fixture with its three consumers.

**Tech Stack:** Node ESM (`.mjs`), zero dependencies in `tools/mapforge/`; `scripts/` has its own npm package (ajv, js-yaml, sharp) and is NOT part of the pnpm workspace. Tests are `node --test` with the quoted glob form. Server tests are jest. Gate 1 is `scripts/precheck.sh`, Gate 2 is `scripts/integration.sh`, CI is `.github/workflows/ci.yml` — three different lists.

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
- 13 landmasses, 3 oceans, 9 seas, 160 regions = 40 surveyed + 120 reported, 45 settlements (3 capital / 12 hub / 30 village), 8 town plans, 60 dungeon complexes / 190 floors (3 families x 8 + 36 bespoke), **170** distinct landform types / **178** group memberships / 8 dual-listed / 23 `dungeonCapable` / 40 glyph families / 12 groups, 1,740 instances / 336 named, 20 biomes, 18 terrain kinds, 626 distinct names.
- **The landform census is 170/178, not the spec's 164/172.** Plan B Task 1 is the sole authority for the lexicon and ships six types the spec table omits — three bound by a named pinned record (`headland`, `ford`, `sea-waterfall`) and three that are fabric-generator vocabulary for c01's shelf ice and c10's tephra ground (`ice-shelf`, `ash-front`, `ash-plain`), all single-group, none `dungeonCapable` — so memberships move 172 -> 178 while the 8 dual-listed and 23 `dungeonCapable` counts are unchanged. Every downstream number reads 170: Plan C's `G-WORLD-BUDGET` band, Plan D's `requires.landform` join test, and the `world-budget: landforms <n> types` / `G-LANDFORM: types placed: <n> / <n>` print lines. Plan A gates none of these, but its Global Constraints block is quoted verbatim by the other four plans, so the number is corrected here rather than re-derived there.
- The `requires` predicate vocabulary is likewise Plan B's, closed at exactly 11 keys (`rock`, `precipDecileMin/Max`, `tempDecileMin/Max`, `slopeMin/Max`, `nearFlag`, `flowAccMin`, `elevMin/Max`) under `additionalProperties: false`. No plan may add `coastal`, `flagsAny/All/None`, `tempMin` or `tempMax`.
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

## Domain primer — read this before Task 1

You have never seen this codebase. Read these files, in this order, before writing any code. Total ~1,500 lines.

1. `scripts/lib/spine.mjs` lines 1-190 — the constants and the geometry primitives.
2. `scripts/check_content.mjs` lines 1536-1800 (`checkSpine`) and 2125-2180 (`gSpineOverlapRollup`).
3. `scripts/check_spine_emit.mjs` — all 277 lines. It is short and it is the heart of Plan A's second seam.
4. `tools/mapforge/render-sheet.mjs` — all 123 lines.
5. `tools/mapforge/lib/atlas-sheet.mjs` lines 36-135 and 660-676.

**The spine** is a flat table of JSON files at `content/spine/nodes/<id>.json`, one file per place, joined on `parentId`. There are exactly **44** of them today. Two disjoint roots are listed in `content/spine/roots.json`: `n-atlas` (the *chart* — the fictional world you draw) and `n-playroot` (the *runtime* — the actual game maps). Everything Plan A touches is on the `n-atlas` side; the `n-playroot` side must not move.

**A node** carries: `id`, `tier`, `parentId`, `title`, a `placement` (`{shape:"polygon", points:[[x,y],…], anchor:[x,y]}` or `{shape:"rect", rect:{x,y,w,h}, anchor}` or `{shape:"point", at, anchor}`), an `interior` (its own coordinate frame), a `composition` (percentages by biome), a `features[]` array (rivers, coastlines, towers — drawn things that are not nodes), and a **`derived`** block.

**A tier** is a *depth*, not a label: `TIER_DEPTH` (`scripts/lib/spine.mjs:28-38`) maps `world:0, playroot:0, continent:1, ocean:1, playspace:1, fixture:1, region:2, sea:2, town:3, site:3`. A child's depth must be its parent's + 1.

**The `derived` block** is machine-computed (area, composition rollup, coverage percent, resolved seed streams, and a sha256 `digest` of the rest). It is written by `scripts/check_spine_emit.mjs --write` and byte-compared by the gate rule **G-DERIVED-DRIFT**. *This is Plan A's single most important instrument:* every committed `derived` number comes from `placementArea()` (an exact shoelace), never from the overlap kernel — so if you swap the overlap kernel and `derived` bytes do not change, you have proved you moved nothing.

**A gate** is one named rule inside `scripts/check_content.mjs`, printed as `FAIL  <G-NAME>: <message>` and exiting 1. Gates **never throw** — errors are returned in band and pushed onto a module-level `failures` array. An uncaught throw skips `finish()` and silently drops every FAIL recorded before it, which is why the no-throw discipline is load-bearing rather than stylistic. Gates also **soft-skip**: a content root with no `content/spine/` returns 0 *before compiling any schema*, because ~45 minimal test fixtures depend on that.

**Gate 1** = `scripts/precheck.sh` — the per-feature ship check. Its content lane is `node scripts/check_content.mjs --only=spine`, currently **3.75 s**. `--only=spine` is **not a reduced gate set**: it calls the same `checkSpine()` and only skips the story/character/zone/town sweeps, so every new spine gate lands in Gate 1 automatically.

**Gate 2** = `scripts/integration.sh` — the release check, ~125 s. **CI** (`.github/workflows/ci.yml`) runs a *third, different* list: Gate 2 minus the mapforge tests and minus `render-map --check`.

**The sheets** are two committed SVG files, `game-client/assets/art/maps/cluster1-world.svg` (the basin, close-up) and `game-client/assets/art/maps/atlas-world.svg` (the whole 400x400 km world). They are **drawn from data in code**, never painted: `tools/mapforge/render-sheet.mjs` holds a `SHEETS` registry, each entry a `build({repoRoot}) -> {svg, notes, problems}` function. Byte-determinism is the contract.

**The legacy mirror** is `content/maps/cluster1-geography.json` — a 25.6 KB generated JSON document emitted from the spine by `check_spine_emit.mjs`'s `emitGeography()`. Three content-gate joins read it from disk (`check_content.mjs:816`, `:955`, `:1192`) and `tools/mapforge/render-map.mjs` draws from it. Plan A moves the join into `scripts/lib/places.mjs` and deletes the file.

### Exact commands

```bash
# from the repo root of your worktree
node scripts/check_content.mjs --only=spine            # Gate 1 fast path (~3.75 s today)
node scripts/check_content.mjs --require-complete      # Gate 2 bar
node scripts/check_content.mjs --content-root <dir>    # run against a fixture root
node scripts/check_spine_emit.mjs --check              # 47 emitted files must byte-match
node scripts/check_spine_emit.mjs --write              # rewrite them
node scripts/check_render_lock.mjs --check             # NEW in Task 10
node scripts/check_render_lock.mjs --write             # NEW in Task 10
node tools/mapforge/render-sheet.mjs --sheet cluster1 --no-png --check
node tools/mapforge/render-sheet.mjs --sheet atlas --no-png --check
node --test 'tools/mapforge/tests/*.test.mjs'          # LOCAL ONLY (Node >= 22): Node expands it
node --test tools/mapforge/tests/*.test.mjs            # CI / bash -e: the SHELL expands it (Node 18)
node --test scripts/tests/spine-gates.test.mjs         # the heavy one: 93.3 s / 62 tests today
npm test --prefix scripts                              # the whole gate suite, ~108 s today
(cd colyseus-server && npm test -- mapDimensions)      # the jest pin, EVERY commit
./scripts/precheck.sh --no-install                     # Gate 1
./scripts/integration.sh --no-install                  # Gate 2
```

### Measured baselines (taken in this worktree on 2026-08-16, Node v26.5.0)

| Measurement | Value | How |
| --- | --- | --- |
| `check_content.mjs --only=spine` | **3.75 s**, 44 nodes, 0 failures, 19 warnings | `time node scripts/check_content.mjs --only=spine` |
| Sibling pairs walked by `G-OVERLAP` | **133** (n-atlas 55, n-cluster1 66, four parents 3 each) | see Task 1 Step 2 |
| Grid-sampled overlap, all 133 pairs | **3,038 ms** | prototype run |
| Exact-clipped overlap, all 133 pairs | **19.7 ms** (154x) | prototype run |
| Verdict differences between the two | **0 of 133** | prototype run |
| Max numeric deviation | **0.00269 km2**, on `n-ashvale-front ∩ n-emberdown` | prototype run |
| `node --test scripts/tests/spine-gates.test.mjs` | **93.3 s**, 62 tests | `time node --test …` |
| `n-atlas` children | **11** | tree walk |
| Largest committed ring | **27** points (`n-galereach`) | tree walk |

These are not aspirations. Reproduce them before you change anything, and quote your own numbers in every phase report.

### Six byte-for-byte comparisons — the corrected list

The spec's §3.3 C3 names six. **One of them is wrong and this plan corrects it:** `tools/mapforge/render-map.mjs --check` is **not** a byte comparison — read `render-map.mjs:73-76`, it prints `--check: no files written` and exits 0 after running only the `problems[]` self-check. The real list is:

| # | Comparison | Harness | Fate in Plan A |
| --- | --- | --- | --- |
| 1 | `tools/mapforge/tests/parity.test.mjs:17` vs `fixtures/basin-baseline.svg` | Gate 2 | fixed in Task 11, deleted in Task 12 |
| 2 | `tools/mapforge/tests/basin-sheet.test.mjs:17-20` vs the same fixture | Gate 2 | becomes a lock-hash assertion (Task 12) |
| 3 | `tools/mapforge/tests/render-sheet.test.mjs:14-17` vs the same fixture | Gate 2 | becomes a lock-hash assertion (Task 12) |
| 4 | `scripts/check_spine_emit.mjs --check` (47 files) | Gate 2 + CI | survives; drops to 46 files in Task 12 |
| 5 | `scripts/check_map_render.mjs` (2 sheets, built vs committed) | Gate 2 + CI | absorbed by `check_render_lock.mjs` (Task 10/12) |
| 6 | `tools/mapforge/render-sheet.mjs --check` | **no harness runs it** | wired into CI in Task 12 |

`tools/mapforge/tests/raster.test.mjs:11` is a **fourth** consumer of the 47 KB fixture — it rasterises it, it does not compare. Re-pointed in Task 11.

### Non-obvious traps, verified in this worktree

- **`tools/mapforge/tests/parity.test.mjs:14-16` renders into the TRACKED `game-client/assets/art/maps/cluster1-world.svg` and then runs `git checkout -- <that file>`.** `integration.sh` runs `map_render_drift` *before* `mapforge_tests`, so during a redraw the suite silently reverts a freshly regenerated uncommitted sheet mid-Gate-2. **Fix this before any task regenerates a sheet** (Task 11).
- **Three test fixture roots write their own `content/maps/cluster1-geography.json` and have no `content/spine/` at all**: `scripts/tests/zone-content.test.mjs:355`, `scripts/tests/town-plan.test.mjs:493`, `scripts/tests/bestiary-placement.test.mjs:95`. They also assert on the literal message `not in cluster1-geography.json#zones`. `loadPlaces()` therefore **needs a fallback branch that reads the mirror file when the spine is absent or does not resolve**, and the three failure messages at `check_content.mjs:835`, `:981`, `:1203` must stay verbatim.
- **`scripts/tests/spine-gates.test.mjs:752-762` asserts `outputs.length === nodeFiles + 3`** (the assertion itself is `:758`) and requires `maps/cluster1-geography.json` among the emitted paths. Task 12 changes it to `+ 2`.
- **`check_content.mjs` ends in a bare `main();` at line 2200** — importing it *runs the whole gate*. That is why gate tests spawn it. Task 13 adds the `import.meta.url` guard that makes an in-process call possible.
- **`checkSpine()` is NOT parameterised with an injected fail/warn collector.** `check_content.mjs:144-153` has module-level `const failures = []` / `const fail = …` and `checkSpine` closes over them. Only the sub-gate helpers take injected collectors. The spec §8.6 claim that "the function is already parameterised that way" is wrong.
- **`TIER_DEPTH` already has `sea: 2`** (`scripts/lib/spine.mjs:31`). The spec §8.2's "G-DEPTH gains a real depth for sea" is wrong; there is nothing to change.
- **`abs()` appears nowhere in the spine geometry** and must appear nowhere in `scripts/lib/geometry.mjs` either. A negative signed shoelace is a G-POLY failure, not a magnitude.
- **`tools/mapforge/` has no `package.json` and no dependencies.** Do not add one. If you need a dependency it belongs under `scripts/` (which has its own npm lockfile and is not in the pnpm workspace).
- **`node --test` needs a FILE LIST, and the two ways of producing one are not interchangeable.** A bare directory argument fails. Locally (this worktree runs Node v26.5.0) the quoted form `node --test 'tools/mapforge/tests/*.test.mjs'` works because Node itself expands the pattern — a feature added in **Node v22.0.0**. `.github/workflows/ci.yml:34` pins `node-version: 18`, so in any CI step (and in any `bash -e` harness) the pattern must be **shell-expanded and therefore unquoted**: `node --test tools/mapforge/tests/*.test.mjs`. That is exactly what `scripts/integration.sh:112` and `scripts/package.json:6` already do. Quoting it under Node 18 hands Node a literal path that does not exist — the step runs zero tests and can still go green, which is worse than failing.
- **Two `representsNodeId` pointers run from the runtime tree into the chart** (`n-site-thornveil` → `n-thornveil`, `n-site-icefield` → `n-northern-icefield`) and `scripts/lib/spine.mjs:875-877` hard-fails if either target vanishes. Plan A renames nothing, so this is a "do not touch" note, not a task.

---

## File Structure

`C` = create, `M` = modify, `D` = delete. Every file Plan A touches, and what it is responsible for.

| Op | Path | Responsibility | Task |
| --- | --- | --- | --- |
| C | `scripts/lib/geometry.mjs` | Exact polygon intersection: segment/collinear tests, ring disjointness, ear clip, convex Sutherland–Hodgman, bbox index, ring vertex count. Pure — no `fs`, no deps, no `abs()` | 1 |
| C | `scripts/tests/geometry-exact.test.mjs` | Degenerate / touching / contained / collinear / concave unit tests, plus the grid-vs-exact equivalence over the real 133 sibling pairs | 1, 2, 3 |
| M | `scripts/lib/spine.mjs` | Re-export `exactIntersectionArea` and `buildBBoxIndex`; keep `gridIntersectionArea` exported for the equivalence test only; **delete `gridUnionArea`** (zero *production* consumers since F-043 — but **two live test consumers** in `scripts/tests/spine.test.mjs`, retired in the same commit) | 2 |
| M | `scripts/tests/spine.test.mjs:7,88-95,97-120` | The two `gridUnionArea` consumers retired: dropped from the import, the union assertion deleted, and the F-043 pairSum identity re-anchored on `exactIntersectionArea` so the proof survives the swap instead of vanishing with it | 2 |
| M | `scripts/check_content.mjs` | `gSpineOverlapRollup` call site swaps to exact clipping + the bbox index; `gSpineBudgets` becomes the three-term budget; new `G-VERTEX-BUDGET`; the three joins at `:816`, `:955`, `:1192` re-point at `places.mjs`; the alias sweep at `:1416-1528` gains the resolved-world second chance; the entry guard + `runGateInProcess` export | 2,3,4,6,9,13 |
| M | `content/spine/load-budget.json` | Three-term budget: `maxNodes` 96, `maxChildrenPerParent` 24, `maxRingPoints` 160, `maxBytes` 786432 | 4 |
| C | `scripts/lib/places.mjs` | `resolveWorld` + `loadPlaces` — the ONE join authority that replaces the legacy mirror for the three gate joins and both sheet builders | 5 |
| C | `scripts/tests/places.test.mjs` | `resolveWorld` output is byte-identical to today's `emitGeography` output; missing subjects report, never throw; the fallback branch | 5, 7 |
| M | `scripts/check_spine_emit.mjs` | `GEO_HEADER` + the join body move to `places.mjs`; `emitGeography` becomes a thin serialiser; then de-hardcoded — subjects read from `content/spine/sheet.json`, `problems.push` instead of `throw`, scope by `zoneRoot` instead of the `lore.order != null` filter and the two-element exclusion | 5, 7 |
| M | `content/spine/sheet.json` | Gains the `subjects` descriptor block | 7 |
| M | `content/spine/sheet-atlas.json` | Gains the `subjects` descriptor block | 8 |
| M | `tools/mapforge/render-sheet.mjs` | Imports `resolveWorld` from `places.mjs` instead of `emitGeography` from `check_spine_emit.mjs`; `SHEETS` entries gain `title` and `maxLabelRank` | 6 |
| M | `tools/mapforge/lib/atlas-sheet.mjs` | `n-atlas`/`n-cluster1`/`n-westsea`, `f-west-coast`/`f-the-meltwash`, and the `id !== …` child filter all read from the `sheet-atlas.json` descriptor | 8 |
| C | `scripts/lib/render-lock.mjs` | `computeLock` / `checkLock` / `unifiedDiff` — the checksum lock replacing five byte comparisons | 10 |
| C | `scripts/check_render_lock.mjs` | CLI `--check` / `--write` for `G-RENDER-LOCK` | 10 |
| C | `content/world/render-lock.json` | Committed sha256 per artifact (sheets today, fabric in Plan C) | 10 |
| C | `scripts/tests/render-lock.test.mjs` | Lock round-trip, drift detection, unified-diff-on-mismatch, extra/missing sets | 10 |
| M | `tools/asset-storybook/js/state.mjs` | `RENDER_LOCK_URL` constant | 10 |
| M | `tools/asset-storybook/js/maps.mjs` | Each sheet card shows its locked short hash — the review surface for the lock | 10 |
| C | `tools/asset-storybook/tests/render-lock-index.test.mjs` | Every `SHEETS` `outSvg` has a lock row; the storybook can render every row | 10 |
| C | `tools/mapforge/tests/fixtures/raster-probe.svg` | Small (< 5 KB) raster fixture replacing the 47 KB baseline in `raster.test.mjs` | 11 |
| M | `tools/mapforge/tests/raster.test.mjs` | Re-pointed at `raster-probe.svg` at 500 px | 11 |
| M | `tools/mapforge/tests/parity.test.mjs` | The `git checkout --` self-revert is removed (renders to a temp path) — **before** it is deleted | 11 |
| M | `tools/mapforge/tests/basin-sheet.test.mjs` | Baseline assertion → lock-hash assertion; the four behavioural tests survive verbatim | 12 |
| M | `tools/mapforge/tests/render-sheet.test.mjs` | Baseline assertion → lock-hash assertion | 12 |
| M | `scripts/tests/spine-gates.test.mjs` | Two pinned literal fixtures at `:403,:410` RE-RUN under exact clipping; the emitted-file count drops to `+2`; the three spawn helpers become in-process calls | 2, 12, 13 |
| M | `scripts/integration.sh` | Drop `mapforge_check` and `map_render_drift`; add `render_lock` | 12 |
| M | `.github/workflows/ci.yml:113-120` | Add `node --test tools/mapforge/tests/*.test.mjs` (**unquoted** — CI pins Node 18, which has no Node-side glob) and `render-sheet --check`; replace the map-render step with the lock check | 12 |
| M | `game-client/assets/art/art-manifest.json` | Two `note` strings stop naming the deleted `render-map.mjs` | 12 |
| D | `content/maps/cluster1-geography.json` | Retired once Task 12's proof step is green | 12 |
| D | `tools/mapforge/render-map.mjs` | Retired with the mirror | 12 |
| D | `tools/mapforge/tests/parity.test.mjs` | Retired (its self-revert is fixed FIRST, in Task 11) | 12 |
| D | `tools/mapforge/tests/fixtures/basin-baseline.svg` | Retired (47,020 bytes, byte-identical duplicate of a committed file) | 12 |
| D | `scripts/check_map_render.mjs` | Absorbed by `check_render_lock.mjs` | 12 |
| D | `scripts/tests/check_map_render.test.mjs` | Follows its subject | 12 |

**Not touched by Plan A, deliberately:** `tools/mapforge/lib/basin-sheet.mjs` (it already consumes exactly the doc shape `resolveWorld` returns — the only change would be cosmetic), `tools/mapforge/lib/draft.mjs` (Plan B owns the fill/legend closure), `content/spine/nodes/*` (zero content change), and every runtime file.

---

## Tasks

### Task 1: Exact polygon geometry library

The overlap gate is 81–92% of Gate 1's content lane and burns ~3.0 s to discover **zero** overlaps, because `gridIntersectionArea` (`scripts/lib/spine.mjs:160-170`) walks every 0.05 km lattice cell of the two bounding boxes' intersection calling `placementContains` twice. This task builds the exact replacement as a **pure library with no call sites**, so it can be reviewed and tested entirely on its own.

**Files:**
- Create: `scripts/lib/geometry.mjs`
- Create: `scripts/tests/geometry-exact.test.mjs`

**Interfaces:**
- Consumes: `shoelaceArea({points})` from `scripts/lib/spine.mjs:73` (re-implemented locally to keep `geometry.mjs` free of a cycle — `spine.mjs` will import *from* `geometry.mjs` in Task 2, never the reverse).
- Produces, all consumed by Task 2 and Task 3:
  - `segmentsIntersect({ p1, p2, p3, p4 }): boolean` — proper crossing OR collinear overlap
  - `pointInRing({ point, points }): boolean`
  - `ringsDisjoint({ a, b }): boolean` — `a`, `b` are open rings (`Pt[]`)
  - `earClip({ points }): Pt[][]` — a positive-shoelace simple ring → an array of positively-wound triangles; `[]` for a negatively-wound or degenerate ring, never a throw
  - `clipConvex({ subject, clip }): Pt[]` — Sutherland–Hodgman, both arguments convex and positively wound
  - `exactIntersectionArea({ a, b }): number` — `a`, `b` are `Placement` objects. **No `cell` parameter.**
  - `bboxOfPlacement({ placement }): BBox`
  - `ringVertexCount({ placement }): number` — polygon → `points.length`, rect → 4, point → 0
  - `buildBBoxIndex({ items }): { query({ bbox }): string[] }` — `items` is `{id, bbox}[]`; `query` returns ids sorted ascending

Types, for the reader:

```js
/** @typedef {[number, number]} Pt */
/** @typedef {{x:number, y:number, w:number, h:number}} BBox */
/** @typedef {{shape:"polygon", points:Pt[], anchor:Pt}
 *          | {shape:"rect", rect:BBox, anchor:Pt}
 *          | {shape:"point", at:Pt, anchor:Pt}} Placement */
```

**Domain notes you need before writing the test.** The repo's coordinate convention is *x east, y south*, and `shoelaceArea` (`spine.mjs:73-81`) returns a **signed** value that G-POLY requires to be **strictly positive** for every committed ring. Call that orientation "positive"; do not call it clockwise or counter-clockwise, because the y-down axis makes those words ambiguous. Everything in this file must agree on that one sign: a triangle `(A,B,C)` is a legal ear when `(B−A)×(C−A) > 0`, and Sutherland–Hodgman keeps the points for which `(B−A)×(P−A) >= 0`. The dominant real case at 160 tiled regions is **shared-edge touching**, which is exactly where a general clipper like Greiner–Hormann is degenerate-unsafe — that is why this is ear-clip plus convex-on-convex clipping and not a library.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/geometry-exact.test.mjs`:

```js
// Plan A Task 1 — scripts/lib/geometry.mjs unit tests.
//
// The exact clipper is STRICTLY MORE SENSITIVE than the lattice sampler it
// replaces: it reports sub-cell slivers that grid sampling rounds to zero.
// Every case below is therefore an assertion on an EXACT expected number,
// never on "close enough" — a tolerance here would hide the one class of
// change this swap is allowed to make.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  segmentsIntersect,
  pointInRing,
  ringsDisjoint,
  earClip,
  clipConvex,
  exactIntersectionArea,
  bboxOfPlacement,
  ringVertexCount,
  buildBBoxIndex,
} from "../lib/geometry.mjs";

const poly = (points) => ({ shape: "polygon", points, anchor: points[0] });
const rect = (x, y, w, h) => ({ shape: "rect", rect: { x, y, w, h }, anchor: [x, y] });
const pt = (x, y) => ({ shape: "point", at: [x, y], anchor: [x, y] });

// Positive-shoelace unit square, x east / y south.
const UNIT = [[0, 0], [10, 0], [10, 10], [0, 10]];

test("segmentsIntersect: proper crossing", () => {
  assert.equal(segmentsIntersect({ p1: [0, 0], p2: [10, 10], p3: [0, 10], p4: [10, 0] }), true);
});

test("segmentsIntersect: collinear overlap counts as an intersection", () => {
  assert.equal(segmentsIntersect({ p1: [0, 0], p2: [10, 0], p3: [5, 0], p4: [15, 0] }), true);
});

test("segmentsIntersect: collinear but disjoint does not", () => {
  assert.equal(segmentsIntersect({ p1: [0, 0], p2: [10, 0], p3: [11, 0], p4: [15, 0] }), false);
});

test("segmentsIntersect: shared endpoint counts (touching is an intersection)", () => {
  assert.equal(segmentsIntersect({ p1: [0, 0], p2: [10, 0], p3: [10, 0], p4: [10, 10] }), true);
});

test("segmentsIntersect: parallel and apart does not", () => {
  assert.equal(segmentsIntersect({ p1: [0, 0], p2: [10, 0], p3: [0, 1], p4: [10, 1] }), false);
});

test("pointInRing: inside, outside", () => {
  assert.equal(pointInRing({ point: [5, 5], points: UNIT }), true);
  assert.equal(pointInRing({ point: [50, 5], points: UNIT }), false);
});

test("ringsDisjoint: apart is disjoint", () => {
  assert.equal(ringsDisjoint({ a: UNIT, b: [[100, 100], [110, 100], [110, 110], [100, 110]] }), true);
});

test("ringsDisjoint: a shared edge is NOT disjoint (the degenerate case that matters)", () => {
  assert.equal(ringsDisjoint({ a: UNIT, b: [[10, 0], [20, 0], [20, 10], [10, 10]] }), false);
});

test("ringsDisjoint: fully contained with no edge crossing is NOT disjoint", () => {
  assert.equal(ringsDisjoint({ a: UNIT, b: [[2, 2], [4, 2], [4, 4], [2, 4]] }), false);
});

test("earClip: a positive square yields 2 positively-wound triangles", () => {
  const tris = earClip({ points: UNIT });
  assert.equal(tris.length, 2);
  for (const [A, B, C] of tris) {
    const cross = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    assert.ok(cross > 0, `triangle ${JSON.stringify([A, B, C])} is wound backwards`);
  }
});

test("earClip: a NEGATIVE ring returns [] and never throws (G-POLY owns that failure)", () => {
  assert.deepEqual(earClip({ points: [[0, 0], [0, 10], [10, 10], [10, 0]] }), []);
});

test("earClip: a 2-point degenerate ring returns []", () => {
  assert.deepEqual(earClip({ points: [[0, 0], [1, 1]] }), []);
});

test("clipConvex: square clipped by an overlapping square", () => {
  const out = clipConvex({ subject: UNIT, clip: [[5, 5], [15, 5], [15, 15], [5, 15]] });
  assert.equal(out.length, 4);
});

test("exactIntersectionArea: identical squares give the full area", () => {
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: poly(UNIT) }), 100);
});

test("exactIntersectionArea: the pinned G-OVERLAP fixture twins give exactly 400", () => {
  // scripts/tests/fixtures/spine/base/spine/nodes/n-r.json, duplicated as n-r2
  // by spine-gates.test.mjs:394-411, which asserts the literal string
  // "G-OVERLAP n-r ∩ n-r2: 400.0 over limit 2.0".
  const p = poly([[20, 20], [40, 20], [40, 40], [20, 40]]);
  assert.equal(exactIntersectionArea({ a: p, b: p }).toFixed(1), "400.0");
});

test("exactIntersectionArea: a shared edge is exactly 0, not a sliver", () => {
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: poly([[10, 0], [20, 0], [20, 10], [10, 10]]) }), 0);
});

test("exactIntersectionArea: a shared corner is exactly 0", () => {
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: poly([[10, 10], [20, 10], [20, 20], [10, 20]]) }), 0);
});

test("exactIntersectionArea: disjoint is exactly 0", () => {
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: poly([[100, 100], [110, 100], [110, 110], [100, 110]]) }), 0);
});

test("exactIntersectionArea: containment gives the contained area", () => {
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: poly([[2, 2], [4, 2], [4, 4], [2, 4]]) }), 4);
});

test("exactIntersectionArea: rect x polygon", () => {
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: rect(5, 5, 10, 10) }), 25);
});

test("exactIntersectionArea: a CONCAVE L against a square (inclusion-exclusion, not double-counted)", () => {
  // L = the union of the bar x in [0,6] y in [0,2] and the bar x in [0,2] y in [0,6].
  // Square = [1,5]x[1,5]. Overlap = 4 + 4 - 1 = 7. A triangulation that
  // double-counts the shared corner reports 8 and this test is why.
  const L = poly([[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]]);
  const S = poly([[1, 1], [5, 1], [5, 5], [1, 5]]);
  assert.equal(exactIntersectionArea({ a: L, b: S }).toFixed(4), "7.0000");
});

test("exactIntersectionArea: a point placement contributes 0 in both slots", () => {
  assert.equal(exactIntersectionArea({ a: poly(UNIT), b: pt(1, 1) }), 0);
  assert.equal(exactIntersectionArea({ a: pt(1, 1), b: poly(UNIT) }), 0);
});

test("bboxOfPlacement + ringVertexCount cover all three shapes", () => {
  assert.deepEqual(bboxOfPlacement({ placement: poly(UNIT) }), { x: 0, y: 0, w: 10, h: 10 });
  assert.deepEqual(bboxOfPlacement({ placement: rect(3, 4, 5, 6) }), { x: 3, y: 4, w: 5, h: 6 });
  assert.deepEqual(bboxOfPlacement({ placement: pt(7, 8) }), { x: 7, y: 8, w: 0, h: 0 });
  assert.equal(ringVertexCount({ placement: poly(UNIT) }), 4);
  assert.equal(ringVertexCount({ placement: rect(0, 0, 1, 1) }), 4);
  assert.equal(ringVertexCount({ placement: pt(0, 0) }), 0);
});

test("buildBBoxIndex: query returns every bbox-overlapping id, sorted, and no id twice", () => {
  const idx = buildBBoxIndex({
    items: [
      { id: "b", bbox: { x: 0, y: 0, w: 10, h: 10 } },
      { id: "a", bbox: { x: 5, y: 5, w: 10, h: 10 } },
      { id: "c", bbox: { x: 100, y: 100, w: 1, h: 1 } },
    ],
  });
  assert.deepEqual(idx.query({ bbox: { x: 1, y: 1, w: 2, h: 2 } }), ["b"]);
  assert.deepEqual(idx.query({ bbox: { x: 6, y: 6, w: 1, h: 1 } }), ["a", "b"]);
  assert.deepEqual(idx.query({ bbox: { x: 500, y: 500, w: 1, h: 1 } }), []);
});

test("buildBBoxIndex: a query result is a SUPERSET of every truly intersecting pair", () => {
  // The index is only ever allowed to be conservative. A false negative here
  // silently disables G-OVERLAP for that pair, which is the one bug in this
  // library that a green gate would never reveal.
  const items = [];
  for (let i = 0; i < 20; i++) items.push({ id: `n${i}`, bbox: { x: i, y: 0, w: 2.5, h: 2.5 } });
  const idx = buildBBoxIndex({ items });
  for (const a of items)
    for (const b of items) {
      if (a.id === b.id) continue;
      const overlaps =
        a.bbox.x < b.bbox.x + b.bbox.w && b.bbox.x < a.bbox.x + a.bbox.w &&
        a.bbox.y < b.bbox.y + b.bbox.h && b.bbox.y < a.bbox.y + a.bbox.h;
      if (overlaps) assert.ok(idx.query({ bbox: a.bbox }).includes(b.id), `${a.id} missed ${b.id}`);
    }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/tests/geometry-exact.test.mjs`

Expected: FAIL, every test erroring with `Cannot find module '.../scripts/lib/geometry.mjs'` (Node reports it as `ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/geometry.mjs`:

```js
// Plan A Task 1 — exact polygon intersection for the spine geometry gates.
//
// Replaces scripts/lib/spine.mjs's lattice-sampled gridIntersectionArea().
// Measured on the real 133 sibling pairs: 3,038 ms -> 19.7 ms (154x), verdict
// identical on all 133, max numeric deviation 0.00269 km2.
//
// Conventions (inherited from lib/spine.mjs, non-negotiable):
//   - one options object per function, no positional overloads;
//   - abs() appears NOWHERE. A negative signed shoelace is a G-POLY failure,
//     not a magnitude, so every ring reaching a clip is positively wound and
//     every clipped piece comes out positively wound by construction;
//   - nothing throws. A degenerate or backwards ring yields [] / 0, never an
//     exception — an uncaught throw inside a gate skips finish() and silently
//     drops every FAIL recorded before it.
//
// Pure: no fs, no deps. spine.mjs imports FROM here; never the reverse.

/** @typedef {[number, number]} Pt */
/** @typedef {{x:number, y:number, w:number, h:number}} BBox */

const orient = (p, q, r) =>
  Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));

// q is on segment p–r, given the three are already known collinear.
const onSeg = (p, q, r) =>
  Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0]) &&
  Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1]);

// Proper crossing OR collinear overlap OR a shared endpoint. Deliberately
// wider than spine.mjs:107's properCross(), which excludes touching because
// selfIntersects() must tolerate adjacent edges sharing a vertex. Here
// touching MUST count: it is what keeps ringsDisjoint() from declaring two
// tiled neighbours disjoint and skipping the clip that proves their overlap
// is exactly zero.
export function segmentsIntersect({ p1, p2, p3, p4 }) {
  const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(p1, p3, p2)) return true;
  if (o2 === 0 && onSeg(p1, p4, p2)) return true;
  if (o3 === 0 && onSeg(p3, p1, p4)) return true;
  if (o4 === 0 && onSeg(p3, p2, p4)) return true;
  return false;
}

// Ray cast, half-open on edges — the same rule spine.mjs:95 pointInPolygon
// uses, kept identical so a vertex that is "inside" for one gate is inside
// for the other.
export function pointInRing({ point, points }) {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

// Stage 2 of the three-stage replacement: exact disjointness. If no edge pair
// meets and neither ring holds the other's first vertex, the intersection is
// EXACTLY 0 and no clipping is needed. Measured: eliminates 122 of the real
// 133 pairs in ~11 ms total.
export function ringsDisjoint({ a, b }) {
  for (let i = 0; i < a.length; i++) {
    const p1 = a[i], p2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const p3 = b[j], p4 = b[(j + 1) % b.length];
      if (segmentsIntersect({ p1, p2, p3, p4 })) return false;
    }
  }
  if (pointInRing({ point: a[0], points: b })) return false;
  if (pointInRing({ point: b[0], points: a })) return false;
  return true;
}

const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
// Inclusive on purpose: a candidate vertex lying exactly ON an ear's edge
// blocks the ear. Excluding it produces overlapping triangles on rings with
// collinear runs, which double-counts area — the concave-L test is the pin.
const pointInTriInclusive = (p, a, b, c) =>
  cross2(a, b, p) >= 0 && cross2(b, c, p) >= 0 && cross2(c, a, p) >= 0;

// Positively-wound simple ring -> positively-wound triangles. G-POLY already
// guarantees simple + open + strictly positive, so no orientation fix-up is
// needed; a ring that violates it yields [] and its own G-POLY FAIL elsewhere.
export function earClip({ points }) {
  const n = points.length;
  if (n < 3) return [];
  const idx = [...points.keys()];
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 4 * n) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const ia = idx[(k - 1 + idx.length) % idx.length];
      const ib = idx[k];
      const ic = idx[(k + 1) % idx.length];
      const A = points[ia], B = points[ib], Cc = points[ic];
      if (cross2(A, B, Cc) <= 0) continue; // reflex or collinear — not an ear
      let ok = true;
      for (const io of idx) {
        if (io === ia || io === ib || io === ic) continue;
        if (pointInTriInclusive(points[io], A, B, Cc)) { ok = false; break; }
      }
      if (!ok) continue;
      out.push([A, B, Cc]);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) return []; // not a simple positively-wound ring — report nothing
  }
  if (idx.length === 3) out.push([points[idx[0]], points[idx[1]], points[idx[2]]]);
  return out;
}

// Sutherland-Hodgman. Both arguments must be convex and positively wound;
// the result is then convex and positively wound too, so its shoelace is
// non-negative by construction and abs() is never needed.
export function clipConvex({ subject, clip }) {
  let output = subject;
  for (let i = 0; i < clip.length && output.length; i++) {
    const A = clip[i], B = clip[(i + 1) % clip.length];
    const side = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const P = input[j], Q = input[(j + 1) % input.length];
      const sp = side(P), sq = side(Q);
      if (sp >= 0) output.push(P);
      if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
        const t = sp / (sp - sq);
        output.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
      }
    }
  }
  return output;
}

// Same pinned formula as spine.mjs:73 — sum(x_i*y_{i+1} - x_{i+1}*y_i)/2 over
// the OPEN ring. Duplicated (not imported) so this module stays leaf-level.
function shoelace(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

// A rect becomes a POSITIVELY wound ring: [x,y] -> [x+w,y] -> [x+w,y+h] ->
// [x,y+h] has shoelace +w*h. The reverse order gives -w*h and every clip
// against it silently returns nothing.
function ringOf(placement) {
  if (!placement) return null;
  if (placement.shape === "polygon") return placement.points;
  if (placement.shape === "rect") {
    const r = placement.rect;
    return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  }
  return null; // point placements have no area — spine.mjs:131 agrees
}

export function bboxOfPlacement({ placement }) {
  const ring = ringOf(placement);
  if (!ring) return { x: placement.at[0], y: placement.at[1], w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function ringVertexCount({ placement }) {
  const ring = ringOf(placement);
  return ring ? ring.length : 0;
}

// The drop-in replacement for gridIntersectionArea({a, b, cell}). No `cell`:
// there is no sampling any more. Three stages, cheapest first.
export function exactIntersectionArea({ a, b }) {
  const ra = ringOf(a), rb = ringOf(b);
  if (!ra || !rb) return 0;
  // (1) bounding-box reject — verbatim from spine.mjs:161-164.
  const ba = bboxOfPlacement({ placement: a }), bb = bboxOfPlacement({ placement: b });
  const x0 = Math.max(ba.x, bb.x), y0 = Math.max(ba.y, bb.y);
  const x1 = Math.min(ba.x + ba.w, bb.x + bb.w), y1 = Math.min(ba.y + ba.h, bb.y + bb.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  // (2) exact disjointness pre-filter.
  if (ringsDisjoint({ a: ra, b: rb })) return 0;
  // (3) exact clipped area for the survivors.
  const ta = earClip({ points: ra }), tb = earClip({ points: rb });
  let area = 0;
  for (const t1 of ta)
    for (const t2 of tb) {
      const piece = clipConvex({ subject: t1, clip: t2 });
      if (piece.length >= 3) area += shoelace(piece);
    }
  return area;
}

// Uniform-grid bbox index. Conservative by construction: an item registers in
// every bucket its bbox touches, and a query unions every bucket its own bbox
// touches, so the result can only ever be a SUPERSET of the truly overlapping
// set. Sorted output keeps gate message order a function of the data alone.
const INDEX_DIVISIONS = 8;
export function buildBBoxIndex({ items }) {
  if (items.length === 0) return { query: () => [] };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { bbox } of items) {
    if (bbox.x < minX) minX = bbox.x;
    if (bbox.y < minY) minY = bbox.y;
    if (bbox.x + bbox.w > maxX) maxX = bbox.x + bbox.w;
    if (bbox.y + bbox.h > maxY) maxY = bbox.y + bbox.h;
  }
  // A zero-extent axis would divide by zero; collapse it to one bucket.
  const spanX = maxX - minX, spanY = maxY - minY;
  const cellX = spanX > 0 ? spanX / INDEX_DIVISIONS : 1;
  const cellY = spanY > 0 ? spanY / INDEX_DIVISIONS : 1;
  const buckets = new Map(); // "cx,cy" -> Set<id>
  const range = (bbox) => {
    const cx0 = Math.floor((bbox.x - minX) / cellX);
    const cy0 = Math.floor((bbox.y - minY) / cellY);
    const cx1 = Math.floor((bbox.x + bbox.w - minX) / cellX);
    const cy1 = Math.floor((bbox.y + bbox.h - minY) / cellY);
    return { cx0, cy0, cx1, cy1 };
  };
  for (const { id, bbox } of items) {
    const { cx0, cy0, cx1, cy1 } = range(bbox);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = `${cx},${cy}`;
        let s = buckets.get(k);
        if (!s) { s = new Set(); buckets.set(k, s); }
        s.add(id);
      }
  }
  return {
    query({ bbox }) {
      const { cx0, cy0, cx1, cy1 } = range(bbox);
      const hit = new Set();
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++)
          for (const id of buckets.get(`${cx},${cy}`) ?? []) hit.add(id);
      return [...hit].sort();
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/tests/geometry-exact.test.mjs`

Expected: PASS — `pass 22`, `fail 0`.

- [ ] **Step 5: Prove nothing else moved**

Run:
```bash
node scripts/check_content.mjs --only=spine | tail -1
node scripts/check_spine_emit.mjs --check | tail -1
(cd colyseus-server && npm test -- mapDimensions 2>&1 | tail -5)
```
Expected: `content-gate: … 44 nodes, 0 failures, 19 warnings`; `spine-emit: check clean, 47 files`; jest `1 passed`. The new file has no call sites yet, so all three must be unchanged.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/geometry.mjs scripts/tests/geometry-exact.test.mjs
git commit -m "feat: exact polygon intersection library for the spine gates"
```

- [ ] **Step 7: QUALITY GATE — verify**

Run and paste the output of:
```bash
node --test scripts/tests/geometry-exact.test.mjs
node scripts/check_content.mjs --only=spine | tail -1
git branch --show-current && git log --oneline -1
```

- [ ] **Step 8: QUALITY GATE — independent adversarial review**

Dispatch a fresh reviewer subagent (or `/code-review`) on **this task's diff only** (`git diff HEAD~1`). Give it this brief verbatim:

> Review `scripts/lib/geometry.mjs`. It replaces a lattice sampler with exact clipping in a gate where an under-report silently disables a rule. Hunt specifically for: (a) any case where `exactIntersectionArea` returns 0 for genuinely overlapping placements; (b) any case where triangles from `earClip` overlap each other, which would double-count area; (c) `abs()` anywhere, or any place a negative shoelace is treated as a magnitude; (d) a throw on malformed input; (e) a `buildBBoxIndex` query that can omit a truly overlapping item; (f) non-determinism — iteration over a `Set`/`Map` whose order depends on insertion.

- [ ] **Step 9: QUALITY GATE — refactor on the findings**

Fix every confirmed finding, each as a **new commit** (`fix: …`), never `--amend`. If a finding is a real defect, add the failing test to `geometry-exact.test.mjs` first.

- [ ] **Step 10: QUALITY GATE — re-verify**

Re-run Step 7's three commands. All must be identical to Step 7's output apart from the new commit hash.

---

### Task 2: Swap the overlap kernel — the standalone commit

This is the change spec §7.2 says must land **by itself, before any geometry change**, with `G-DERIVED-DRIFT` byte-green as the proof nothing moved. Exact clipping is **strictly more sensitive** than grid sampling — it reports a real 0.0014 km² sliver the sampler rounds to zero — so the equivalence run happens **before** the swap, not after.

**Files:**
- Create: `scripts/tools/overlap-preflight.mjs`
- Modify: `scripts/lib/spine.mjs:160-186` (re-export `exactIntersectionArea`; delete `gridUnionArea`)
- Modify: `scripts/tests/spine.test.mjs:7,88-95,97-120` (retire the two `gridUnionArea` consumers **in the same commit as the deletion**)
- Modify: `scripts/check_content.mjs:27` (import), `:2134` (the one call site)
- Modify: `scripts/tests/geometry-exact.test.mjs` (append the equivalence test)
- Modify: `scripts/tests/spine-gates.test.mjs:394-411` (re-run, do not assume, the two pinned literals)

**Interfaces:**
- Consumes: `exactIntersectionArea({ a, b }): number`, `bboxOfPlacement({ placement }): BBox` from Task 1.
- Produces: `exactIntersectionArea` re-exported from `scripts/lib/spine.mjs` (so `check_content.mjs` keeps one import source); `gridIntersectionArea` stays exported but becomes **production-dead** — only the equivalence tests call it; `gridUnionArea` **no longer exists**.

**`gridUnionArea` has two live test consumers — verified, not assumed.** `grep -n gridUnionArea` returns `scripts/lib/spine.mjs:172` (the definition), and in `scripts/tests/spine.test.mjs`: `:7` (the import), `:88-95` (the cell-aligned-rects test, with the union assertion at `:92`), and `:97-120` (the F-043 comment block plus the pairSum-identity test at `:105-120`, which uses the union scan at `:116` as its reference). Deleting the export without touching that file makes `spine.test.mjs` fail **at import time**, taking the whole file dark inside `npm test --prefix scripts`, which runs in Gate 2 and in CI. Step 5 below retires both consumers in the same commit; the pairSum identity is not deleted, it is re-anchored on `exactIntersectionArea` — that identity is the F-043 proof and must survive the swap.

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/geometry-exact.test.mjs`:

```js
// ── the equivalence pre-flight, run over the REAL committed spine ──────────
// This is the proof the swap is allowed. It must pass BEFORE the call site
// changes, because exact clipping is strictly MORE sensitive than lattice
// sampling — a sub-cell sliver the sampler rounds to zero becomes visible,
// and that is the correct direction of change but it must be seen first.
import { join, dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSpine, buildTree, gridIntersectionArea, placementArea,
  SPINE_CELL_KM, SPINE_CELL_U,
} from "../lib/spine.mjs";

const REPO = pathResolve(dirname(fileURLToPath(import.meta.url)), "../..");

function realSiblingPairs() {
  const spine = loadSpine({ contentRoot: join(REPO, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const pairs = [];
  for (const parent of tree.byId.values()) {
    const kids = (tree.childrenOf.get(parent.id) ?? [])
      .map((i) => tree.byId.get(i))
      .filter((n) => n.placement.shape !== "point");
    const cell = parent.interior?.units === "u" ? SPINE_CELL_U : SPINE_CELL_KM;
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++)
        pairs.push({ a: kids[i], b: kids[j], cell });
  }
  return pairs;
}

test("equivalence: exactly 133 sibling pairs exist on the committed spine", () => {
  assert.equal(realSiblingPairs().length, 133);
});

test("equivalence: exact clipping agrees with grid sampling on every G-OVERLAP VERDICT", () => {
  const disagreements = [];
  for (const { a, b, cell } of realSiblingPairs()) {
    const grid = gridIntersectionArea({ a: a.placement, b: b.placement, cell });
    const exact = exactIntersectionArea({ a: a.placement, b: b.placement });
    const limit = 0.005 * Math.min(
      placementArea({ placement: a.placement }),
      placementArea({ placement: b.placement }),
    );
    if ((grid > limit) !== (exact > limit))
      disagreements.push(`${a.id} ∩ ${b.id}: grid ${grid} exact ${exact} limit ${limit}`);
  }
  assert.deepEqual(disagreements, []);
});

test("equivalence: the largest numeric deviation stays under 0.01 km²", () => {
  let maxDev = 0, worst = null;
  for (const { a, b, cell } of realSiblingPairs()) {
    const grid = gridIntersectionArea({ a: a.placement, b: b.placement, cell });
    const exact = exactIntersectionArea({ a: a.placement, b: b.placement });
    const dev = Math.max(grid, exact) - Math.min(grid, exact);
    if (dev > maxDev) { maxDev = dev; worst = `${a.id} ∩ ${b.id} grid ${grid} exact ${exact}`; }
  }
  // Measured 2026-08-16: 0.00269 km² on n-ashvale-front ∩ n-emberdown, two
  // orders of magnitude below the 0.5%-of-the-smaller-polygon tolerance.
  assert.ok(maxDev < 0.01, `max deviation ${maxDev} at ${worst}`);
});

test("equivalence: exact clipping is at least 20x faster on the same 133 pairs", () => {
  const pairs = realSiblingPairs();
  let tGrid = 0, tExact = 0;
  for (const { a, b, cell } of pairs) {
    let t0 = process.hrtime.bigint();
    gridIntersectionArea({ a: a.placement, b: b.placement, cell });
    let t1 = process.hrtime.bigint();
    exactIntersectionArea({ a: a.placement, b: b.placement });
    let t2 = process.hrtime.bigint();
    tGrid += Number(t1 - t0);
    tExact += Number(t2 - t1);
  }
  // Measured 154x on this hardware. 20x is the floor a slower CI box must
  // still clear; below it, the O(n²) problem is not actually solved.
  assert.ok(tGrid / tExact > 20, `only ${(tGrid / tExact).toFixed(1)}x (grid ${tGrid / 1e6}ms exact ${tExact / 1e6}ms)`);
});
```

- [ ] **Step 2: Run the pre-flight to verify it PASSES — before the swap**

This is deliberately not a red-first step: the equivalence run must be green against the **unchanged** kernel, because exact clipping is strictly more sensitive than lattice sampling and a sub-cell sliver must be seen before it is adopted (spec §7.2). Every other implementation step in this plan is red-first; this one is the pre-flight and inverts on purpose.

Run: `node --test scripts/tests/geometry-exact.test.mjs`

Expected: PASS — all four new tests green, `fail 0`. The test imports `exactIntersectionArea` from `../lib/geometry.mjs` (Task 1, already landed) and `gridIntersectionArea` from `../lib/spine.mjs` (unchanged), so nothing here depends on the swap. If any of the four fails, **stop** — the swap is not safe and the finding belongs in the phase report, not in a workaround.

- [ ] **Step 3: Write the pre-flight reporter**

Create `scripts/tools/overlap-preflight.mjs` — a human-readable version of the same measurement, so the phase report can quote it:

```js
#!/usr/bin/env node
// Plan A Task 2 — the G-OVERLAP equivalence pre-flight, as a report.
//
// Prints one line per sibling pair whose two algorithms disagree at all, plus
// the totals. Exit 0 always: this is a REPORT, in the always-exit-0 style of
// scripts/report_season1.mjs. The gate that fails is the test suite.
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSpine, buildTree, gridIntersectionArea, placementArea,
  SPINE_CELL_KM, SPINE_CELL_U,
} from "../lib/spine.mjs";
import { exactIntersectionArea } from "../lib/geometry.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const contentRoot = process.argv.includes("--content-root")
  ? resolve(process.argv[process.argv.indexOf("--content-root") + 1])
  : join(ROOT, "content");

const spine = loadSpine({ contentRoot });
const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });

let pairs = 0, verdictDiff = 0, maxDev = 0, worst = "", tGrid = 0, tExact = 0;
for (const parent of tree.byId.values()) {
  const kids = (tree.childrenOf.get(parent.id) ?? [])
    .map((i) => tree.byId.get(i))
    .filter((n) => n.placement.shape !== "point");
  const cell = parent.interior?.units === "u" ? SPINE_CELL_U : SPINE_CELL_KM;
  for (let i = 0; i < kids.length; i++)
    for (let j = i + 1; j < kids.length; j++) {
      pairs++;
      const t0 = process.hrtime.bigint();
      const grid = gridIntersectionArea({ a: kids[i].placement, b: kids[j].placement, cell });
      const t1 = process.hrtime.bigint();
      const exact = exactIntersectionArea({ a: kids[i].placement, b: kids[j].placement });
      const t2 = process.hrtime.bigint();
      tGrid += Number(t1 - t0);
      tExact += Number(t2 - t1);
      const limit = 0.005 * Math.min(
        placementArea({ placement: kids[i].placement }),
        placementArea({ placement: kids[j].placement }),
      );
      if ((grid > limit) !== (exact > limit)) {
        verdictDiff++;
        console.log(`VERDICT DIFF ${kids[i].id} ∩ ${kids[j].id}: grid ${grid} exact ${exact} limit ${limit}`);
      }
      const dev = Math.max(grid, exact) - Math.min(grid, exact);
      if (dev > maxDev) { maxDev = dev; worst = `${kids[i].id} ∩ ${kids[j].id} (grid ${grid}, exact ${exact})`; }
    }
}
console.log(`overlap-preflight: ${pairs} sibling pairs`);
console.log(`overlap-preflight: verdict differences ${verdictDiff}`);
console.log(`overlap-preflight: max deviation ${maxDev.toFixed(6)} km² at ${worst}`);
console.log(`overlap-preflight: grid ${(tGrid / 1e6).toFixed(1)} ms, exact ${(tExact / 1e6).toFixed(2)} ms, speed-up ${(tGrid / tExact).toFixed(1)}x`);
```

- [ ] **Step 4: Run the pre-flight and record the numbers**

Run: `node scripts/tools/overlap-preflight.mjs`

Expected (numbers will vary with hardware; the first two must be exact):
```
overlap-preflight: 133 sibling pairs
overlap-preflight: verdict differences 0
overlap-preflight: max deviation 0.002692 km² at n-ashvale-front ∩ n-emberdown (grid 0.115, exact 0.1176923…)
overlap-preflight: grid 3038.1 ms, exact 19.73 ms, speed-up 154.0x
```
**If `verdict differences` is not 0, stop and report.** A non-zero count means the swap changes a gate outcome and this plan's zero-change invariant does not hold.

- [ ] **Step 5: Retire the two `gridUnionArea` tests in `scripts/tests/spine.test.mjs`**

This step lands **before** the deletion, in the same commit, so the suite is never red at import time.

First, the import at `scripts/tests/spine.test.mjs:7`. Replace:

```js
  placementArea, gridIntersectionArea, gridUnionArea,
```

with:

```js
  placementArea, gridIntersectionArea, exactIntersectionArea,
```

Second, the cell-aligned-rects test at `:88-95`. Replace the whole test with:

```js
test("gridIntersectionArea is exact on cell-aligned rects", () => {
  const a = { shape: "rect", rect: { x: 0, y: 0, w: 4, h: 4 } };
  const b = { shape: "rect", rect: { x: 2, y: 0, w: 4, h: 4 } };
  assert.equal(gridIntersectionArea({ a, b, cell: 1.0 }), 8);
  const far = { shape: "rect", rect: { x: 100, y: 100, w: 2, h: 2 } };
  assert.equal(gridIntersectionArea({ a, b: far, cell: 1.0 }), 0);
});
```

(The `gridUnionArea` assertion at `:92` is the only line dropped; the `gridIntersectionArea` half of the test survives verbatim.)

Third — and this is the load-bearing half — the F-043 comment block and pairSum-identity test at `:97-120`. It currently proves `Σpairwise === Σareas − union` using the union scan as its reference. The union scan is going away, so re-anchor the identity on the new kernel instead of deleting the proof. Replace the whole comment block and test with:

```js
// F-043 perf fix: gSpineOverlapRollup's double-count check replaces the
// O(area) union scan with a running Σ of the pairwise intersection values it
// already computes in the sibling loop. By inclusion-exclusion,
// Σareas − union = Σpairwise − Σtriple + …, so this is exact whenever no three
// placements overlap at a shared point (the case pinned here) and only ever
// OVER-reports otherwise — never masks a real double-count.
//
// Plan A Task 2 retired gridUnionArea (its only two consumers were in this
// file). The identity is NOT retired with it: the union of these three
// cell-aligned rects is computable in closed form (they tile [0,8]x[0,4] with
// two 2x4 overlaps), so the identity is pinned against a literal, and against
// BOTH kernels, which is what makes this test the equivalence proof for the
// double-count half of G-OVERLAP.
test("pairwise Σ intersection equals Σareas − union under both kernels", () => {
  const cell = 1.0;
  const a = { shape: "rect", rect: { x: 0, y: 0, w: 4, h: 4 } }; // area 16
  const b = { shape: "rect", rect: { x: 2, y: 0, w: 4, h: 4 } }; // area 16, a∩b = 8
  const c = { shape: "rect", rect: { x: 4, y: 0, w: 4, h: 4 } }; // area 16, b∩c = 8, a∩c = 0 (touch only)
  const kids = [a, b, c];
  const UNION = 32; // [0,8] x [0,4], by construction — the closed form the scan used to compute
  let gridPairSum = 0, exactPairSum = 0;
  for (let i = 0; i < kids.length; i++)
    for (let j = i + 1; j < kids.length; j++) {
      gridPairSum += gridIntersectionArea({ a: kids[i], b: kids[j], cell });
      exactPairSum += exactIntersectionArea({ a: kids[i], b: kids[j] });
    }
  const sum = kids.reduce((s, k) => s + placementArea({ placement: k }), 0);
  assert.equal(sum, 48);
  assert.equal(gridPairSum, 16); // a∩b=8 + b∩c=8 + a∩c=0
  assert.equal(exactPairSum, 16); // the exact kernel agrees, including on the touching pair
  assert.equal(sum - UNION, 16);
});
```

- [ ] **Step 6: Re-export from `spine.mjs` and delete `gridUnionArea`**

In `scripts/lib/spine.mjs`, immediately after the `gridIntersectionArea` function (currently ending at line 170), replace lines 172-186 (the whole `gridUnionArea` function) with:

```js
// Plan A Task 2 — the exact replacement. gridIntersectionArea above stays
// EXPORTED but is production-dead: its only remaining caller is
// scripts/tests/geometry-exact.test.mjs's equivalence pre-flight. Do not
// delete it — it is the reference implementation the swap is checked against,
// and deleting it deletes the proof.
//
// gridUnionArea was removed here. It had ZERO PRODUCTION consumers — F-043
// replaced it with the inclusion-exclusion pairSum identity at
// check_content.mjs:2141-2151 — and exactly TWO TEST consumers, both in
// scripts/tests/spine.test.mjs, retired in the same commit (Step 5). Anything
// that still names it after this commit is a real break, not a leftover.
export { exactIntersectionArea, bboxOfPlacement, ringVertexCount, buildBBoxIndex } from "./geometry.mjs";
```

Add the import at the top of `scripts/lib/spine.mjs`, after line 19's `town-geometry.mjs` import:

```js
// Plan A Task 1: exact polygon intersection. spine.mjs imports FROM geometry.mjs;
// geometry.mjs imports nothing, so this cannot cycle.
import { exactIntersectionArea } from "./geometry.mjs";
```

(The named `import` plus the `export … from` re-export both being present is deliberate: nothing inside `spine.mjs` calls it today, but Task 3 and Task 4 will, and a re-export alone does not create a local binding.)

- [ ] **Step 7: Swap the one call site**

In `scripts/check_content.mjs`, change the import on line 27 — replace `gridIntersectionArea` with `exactIntersectionArea` in the long import list from `./lib/spine.mjs`.

Then in `gSpineOverlapRollup`, replace line 2134:

```js
        const inter = gridIntersectionArea({ a: kids[i].placement, b: kids[j].placement, cell });
```

with:

```js
        // Plan A Task 2: exact clipping replaces lattice sampling. Measured on
        // the committed 133 sibling pairs: 3,038 ms -> 19.7 ms, verdict
        // identical on all 133, max deviation 0.0027 km². `cell` is no longer
        // read here — it stays computed above because SPINE_CELL_KM /
        // SPINE_CELL_U are still the town-geometry sampler's constants.
        const inter = exactIntersectionArea({ a: kids[i].placement, b: kids[j].placement });
```

Then delete the now-unused `const cell = …` line at `:2131` **only if** nothing else in the function reads it — read the function first; as written at the time of this plan it is read nowhere else, so delete it and also drop `SPINE_CELL_U` from the destructured import if it becomes unused. (`SPINE_CELL_KM` is still imported and used by the town-geometry gates; check with `grep -n "SPINE_CELL" scripts/check_content.mjs` before removing either.)

- [ ] **Step 8: Run the two pinned literal fixtures — re-run, never assume**

Run: `node --test scripts/tests/spine-gates.test.mjs 2>&1 | grep -E "G-OVERLAP|pass |fail "`

Expected: the test `G-OVERLAP + G-COMP-ROLLUP red: overlapping twins now hard-fail` PASSES, meaning both pinned literals still hold verbatim:
```
G-OVERLAP n-r ∩ n-r2: 400.0 over limit 2.0
G-OVERLAP n-c: children double-count 400.0 (limit 32.0)
```
`fail 0`. If either literal moved, the fixture's rectangles are not exactly reproduced by clipping and that is a real defect — fix the clipper, do not edit the literal.

- [ ] **Step 9: Prove nothing moved and measure the win**

Run:
```bash
time node scripts/check_content.mjs --only=spine | tail -1
node scripts/check_spine_emit.mjs --check | tail -1
git diff --stat content/ colyseus-server/
(cd colyseus-server && npm test -- mapDimensions 2>&1 | tail -5)
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
npm test --prefix scripts 2>&1 | tail -8
```
Expected: `content-gate: … 44 nodes, 0 failures, 19 warnings` in well under 1 s (baseline 3.75 s); `spine-emit: check clean, 47 files`; `git diff --stat` over `content/` and `colyseus-server/` prints **nothing** — that is `G-DERIVED-DRIFT` byte-green, the proof; jest `1 passed`; mapforge `fail 0`.

`npm test --prefix scripts` is in this block **because Step 5 and Step 6 edit that suite**: it is the only command here that executes `scripts/tests/spine.test.mjs`, and the whole point of Step 5 is that a missing export takes that file dark at import time. Expected: `fail 0`, and the **pass count must not drop** against the baseline you recorded in Task 1 — one deleted assertion (the `gridUnionArea` equality) against one renamed test and one rewritten identity test nets to the same test count. A silently *smaller* suite is the exact failure mode this step exists to catch.

- [ ] **Step 10: Commit**

```bash
git add scripts/lib/spine.mjs scripts/check_content.mjs scripts/tests/spine.test.mjs \
        scripts/tools/overlap-preflight.mjs scripts/tests/geometry-exact.test.mjs
git commit -m "perf: exact clipping replaces lattice sampling in G-OVERLAP"
```

- [ ] **Step 11: QUALITY GATE — verify**

Paste the full output of Step 9 plus:
```bash
node scripts/tools/overlap-preflight.mjs
git branch --show-current && git log --oneline -1
```

- [ ] **Step 12: QUALITY GATE — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`. Brief:

> This commit swaps the kernel of `G-OVERLAP`, the gate that proves the world's polygons do not overlap. The invariant is that **no committed byte changes**. Check: (a) is `gridUnionArea` really gone from every consumer — `grep -rn "gridUnionArea" --include=*.mjs .` must return **nothing at all**, including under `scripts/tests/`; (b) did `npm test --prefix scripts` keep the same pass count, or did a file go dark at import time; (c) does anything still read the `cell` variable in `gSpineOverlapRollup`; (d) could the removal of `SPINE_CELL_U` from an import break the town-geometry gates; (e) is the failure-message string in `gSpineOverlapRollup` byte-identical to before (the tests pin two literals, but the messages for *other* pairs are not pinned by anything); (f) is `check_content.mjs`'s import list still consistent — no unused imports, no missing ones; (g) does the rewritten pairSum-identity test still prove the F-043 inclusion-exclusion claim, or was it weakened into a tautology.

- [ ] **Step 13: QUALITY GATE — refactor and re-verify**

Fix findings as new commits. Re-run Step 9 and Step 11. `git diff --stat content/ colyseus-server/` must still print nothing, and `npm test --prefix scripts` must still report the same pass count.

---
### Task 3: The bbox spatial index — stop testing pairs that cannot touch

> **RECORDED DEVIATION (2026-08-18): implemented, measured, and deliberately UNWIRED.**
> The index was built, wired into `gSpineOverlapRollup`, and then removed again;
> `scripts/lib/geometry.mjs` keeps `buildBBoxIndex` exported and tested for Plans C
> and D. It is written here because the reversal previously lived only in code
> comments and in a commit with an empty body, while this plan still read as if
> the task had shipped as specified.
>
> **What was measured.** On the real spine (133 sibling pairs, 105 index-skipped;
> median of 7 alternating trials x 300 runs): plain `0.3848 ms/run` vs indexed
> `0.4768 ms/run` — **1.239x slower**, sums bit-identical
> (`0.11905015776303106`). The index's skip set is exactly stage 1's bbox-reject
> set, so it saves no `ringsDisjoint` or triangulation call that the kernel does
> not already skip for free.
>
> **The reason recorded in the first pass was wrong**, and wrong in the direction
> that would mislead the plans inheriting this library. It said "`maxChildrenPerParent`
> is 24, so this loop can never exceed 276 pairs and the index can never pay."
> Re-measured, the governing variable is **disjointness, not n**:
>
> | Parent shape | plain | indexed | verdict |
> | --- | --- | --- | --- |
> | 24 children, 160-pt rings, **disjoint** | 1.147 ms | 0.106 ms | **10.77x faster indexed** |
> | 24 children, 40-pt rings, **disjoint** | 0.285 ms | 0.055 ms | **5.17x faster indexed** |
> | 16 children, 8-pt rings, **disjoint** | 0.026 ms | 0.021 ms | 1.22x faster indexed |
> | 12 children, 8-pt rings, **disjoint** | 0.015 ms | 0.020 ms | index loses (0.74x) |
> | 24 children, 160-pt rings, **nested** | 994.9 ms | 980.4 ms | a wash (1.01x) |
> | 24 children, 40-pt rings, **nested** | 70.05 ms | 71.28 ms | index loses (0.98x) |
>
> The index pays iff most children are **disjoint** — which is the goal state the
> world-fill programme is building toward. Today's spine is the exception: its
> largest group (`n-cluster1`, 12 children, ~8-point rings) sits at the measured
> crossover, and `n-atlas` is half-nested.
>
> **Why it stays unwired anyway.** Even in the row where it wins 10.77x, the
> absolute saving is `1.04 ms` against a `761 ms` gate lane — 0.14% — bought with
> a permanent false-negative surface: any future drift between the index's
> confirmation predicate and `exactIntersectionArea`'s stage-1 reject silently
> blinds `G-OVERLAP`. Re-wiring behind a threshold on `n` was explicitly rejected;
> `n` is not the predictor. `scripts/tests/geometry-exact.test.mjs` pins the
> absence (`assert.doesNotMatch(body, /buildBBoxIndex\(/)`), so re-wiring goes red
> rather than happening by accident.

At the target the 16 direct children of `n-atlas` are 3 oceans + 13 landmasses with **every land bbox nested inside an ocean bbox**, so the bbox reject inside `exactIntersectionArea` stops eliminating anything and the disjointness pre-filter runs on all 120 pairs. The index makes the pair loop skip candidates whose bounding boxes cannot meet, **without changing the order in which failure messages are emitted** — message order is part of what the two pinned literal fixtures assert against, and it must stay a function of the data alone.

**Files:**
- Modify: `scripts/check_content.mjs` — `gSpineOverlapRollup` (currently `:2125-2178`)
- Modify: `scripts/tests/geometry-exact.test.mjs` (append)

**Interfaces:**
- Consumes: `buildBBoxIndex({ items }): { query({ bbox }): string[] }` and `bboxOfPlacement({ placement }): BBox` from Task 1, re-exported through `scripts/lib/spine.mjs` in Task 2.
- Produces: no new exports. `gSpineOverlapRollup`'s observable behaviour — the exact set and order of `report(...)` calls, and the `pairSum` value — is **unchanged**.

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/geometry-exact.test.mjs`:

```js
// ── the index must never make the gate blinder ─────────────────────────────
test("index: on the real spine, the candidate filter skips only pairs whose exact area is 0", () => {
  const spine = loadSpine({ contentRoot: join(REPO, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  let skipped = 0, skippedNonZero = [];
  for (const parent of tree.byId.values()) {
    const kids = (tree.childrenOf.get(parent.id) ?? [])
      .map((i) => tree.byId.get(i))
      .filter((n) => n.placement.shape !== "point");
    if (kids.length < 2) continue;
    const index = buildBBoxIndex({
      items: kids.map((k) => ({ id: k.id, bbox: bboxOfPlacement({ placement: k.placement }) })),
    });
    for (let i = 0; i < kids.length; i++) {
      const near = new Set(index.query({ bbox: bboxOfPlacement({ placement: kids[i].placement }) }));
      for (let j = i + 1; j < kids.length; j++) {
        if (near.has(kids[j].id)) continue;
        skipped++;
        const area = exactIntersectionArea({ a: kids[i].placement, b: kids[j].placement });
        if (area !== 0) skippedNonZero.push(`${kids[i].id} ∩ ${kids[j].id} = ${area}`);
      }
    }
  }
  assert.deepEqual(skippedNonZero, [], "the index skipped a pair with a real overlap");
  assert.ok(skipped > 0, "the index skipped nothing — it is not doing any work");
});
```

- [ ] **Step 2: Run the test to verify it passes on the library, then wire it**

Run: `node --test scripts/tests/geometry-exact.test.mjs`

Expected: PASS. As in Task 2 this is a **pre-flight** — the library is already correct; the test exists so that the wiring in Step 3 has a standing proof that it cannot blind the gate. If `skippedNonZero` is non-empty, stop: the index is unsound and must be fixed before it is wired.

- [ ] **Step 3: Wire the index into `gSpineOverlapRollup`**

In `scripts/check_content.mjs`, inside `gSpineOverlapRollup`, replace the pair loop (currently `:2130-2141`) with:

```js
    // Plan A Task 3: an O(n) bbox bucket index replaces the implicit
    // all-pairs bbox test. The OUTER i<j loop order is unchanged on purpose —
    // it is what makes the G-OVERLAP message order a function of the data
    // alone, and scripts/tests/spine-gates.test.mjs:403,410 pin two literal
    // messages that would reorder if this became an index-driven walk.
    // The index only ever ADDS a `continue`; it never adds a pair.
    const boxes = kids.map((k) => ({ id: k.id, bbox: bboxOfPlacement({ placement: k.placement }) }));
    const index = buildBBoxIndex({ items: boxes });
    let pairSum = 0;
    for (let i = 0; i < kids.length; i++) {
      const near = new Set(index.query({ bbox: boxes[i].bbox }));
      for (let j = i + 1; j < kids.length; j++) {
        if (!near.has(kids[j].id)) continue; // bounding boxes cannot meet
        const inter = exactIntersectionArea({ a: kids[i].placement, b: kids[j].placement });
        pairSum += inter;
        const limit = 0.005 * Math.min(placementArea({ placement: kids[i].placement }),
                                       placementArea({ placement: kids[j].placement }));
        if (inter > limit)
          report(`spine: G-OVERLAP ${kids[i].id} ∩ ${kids[j].id}: ${inter.toFixed(1)} over limit ${limit.toFixed(1)}`);
      }
    }
```

Add `bboxOfPlacement` and `buildBBoxIndex` to the `./lib/spine.mjs` import list on line 27.

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
node --test scripts/tests/geometry-exact.test.mjs
node --test scripts/tests/spine-gates.test.mjs 2>&1 | grep -E "G-OVERLAP|pass |fail "
time node scripts/check_content.mjs --only=spine | tail -1
git diff --stat content/ colyseus-server/
```
Expected: both suites `fail 0`; the two pinned literals still `400.0` and `400.0`; `44 nodes, 0 failures, 19 warnings`; `git diff --stat` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add scripts/check_content.mjs scripts/tests/geometry-exact.test.mjs
git commit -m "perf: bbox bucket index prefilters G-OVERLAP sibling pairs"
```

- [ ] **Step 6: QUALITY GATE — verify**

```bash
node scripts/tools/overlap-preflight.mjs
time node scripts/check_content.mjs --only=spine | tail -1
node scripts/check_spine_emit.mjs --check | tail -1
(cd colyseus-server && npm test -- mapDimensions 2>&1 | tail -5)
git branch --show-current && git log --oneline -1
```

- [ ] **Step 7: QUALITY GATE — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`. Brief:

> An index was added in front of a gate. The only interesting bug class is a **false negative**: a pair the index skips that genuinely overlaps. Check: (a) that `near` is built from the SAME bbox the item registered with, not a recomputed or rounded one; (b) that a zero-width or zero-height bbox (a degenerate ring, a rect with `w: 0`) still registers and still matches; (c) that `pairSum` — used for the parent-level double-count check — cannot now miss a contribution that the old all-pairs loop counted; (d) that the report message order is byte-identical to before for a fixture with three or more overlapping children, not just the two-child fixture the tests pin.

- [ ] **Step 8: QUALITY GATE — refactor and re-verify**

Fix findings as new commits. Re-run Step 6.

---

### Task 4: The three-term load budget and `G-VERTEX-BUDGET`

`{maxNodes: 48, maxBytes: 393216}` prices the wrong thing in both directions: 96 nodes with ≤ 3 siblings each cost ~30 pairs, while 48 nodes all under one parent cost 1,128 — 37x more, while passing the cap. The real quadratic term is `Σ_parents C(children, 2)` and, after Task 2, the per-pair constant is dominated by **ring vertex count**, which nothing constrains today. This task adds both governors. Both are **green on today's content by construction** (`n-atlas` has 11 children, `n-cluster1` 12, the largest ring is `n-galereach` at 27 points), so this is pure affordance, not a content change.

**Files:**
- Modify: `content/spine/load-budget.json` (all 4 lines)
- Modify: `scripts/check_content.mjs` — `gSpineBudgets` (`:2075-2091`) and `checkSpine` (add the `G-VERTEX-BUDGET` loop after the G-POLY block at `:1613`)
- Create: `scripts/tests/fixtures/spine/g-vertex-budget-region/` (overlay fixture)
- Create: `scripts/tests/fixtures/spine/g-children-cap/` (overlay fixture)
- Modify: `scripts/tests/spine-gates.test.mjs` (append two red fixtures + one print assertion)

**Interfaces:**
- Consumes: `ringVertexCount({ placement }): number` from Task 1 via `scripts/lib/spine.mjs`; `TIER_DEPTH` from `scripts/lib/spine.mjs:28`.
- Produces: the exact failure strings other plans assert on —
  - `G-LOAD-BUDGET: n-atlas has 27 children > budget 24 — the pairwise overlap check is quadratic in siblings (351 pairs); introduce an intermediate node rather than raising the cap`
  - `G-VERTEX-BUDGET: <id> ring has <n> vertices > <cap> for tier <tier>`
  - and the print line `spine-load: <n> nodes, <n> bytes, max children <n>/<cap>, max ring <n>/<cap> (budget <maxNodes> nodes, <maxBytes> bytes)`

**Vertex caps, by tier.** The shared contract states them as world-tier children ≤ 800, regions ≤ 200, landform instances ≤ 40. Landform instances are not spine nodes and never will be (they are Plan C's fabric records), so in the spine gate the table has exactly two rows plus a default:

```js
const VERTEX_CAP = { continent: 800, ocean: 800, sea: 800, region: 200, town: 200, site: 200, playspace: 800, fixture: 200, world: 800, playroot: 800 };
```

**AMENDED 2026-08-19 (Task 4 review) — the tier table is INERT under today's budget, and needed its own coverage.** The effective cap is `min(maxRingPoints, VERTEX_CAP[tier])`. Every row above is 200 or 800 while the committed `maxRingPoints` is **160**, so `min()` returns 160 for all ten tiers and the table lowers nothing today; the red fixture below lowers the global term to 3, so it returns 3 for every tier there too. Measured: replacing the whole expression with `const cap = maxRingPoints` left `spine-gates.test.mjs` at **74 pass / 0 fail** — the table was a rule the suite could not distinguish from deleted, the repo's documented *"green suite is not a covering suite"* failure mode. **The table is kept, not deleted** — it is the forward contract for the redraw, when `maxRingPoints` rises above 200 and the per-tier row becomes the binding term — and Step 1 below gains a two-test pair that proves it binds: one 208-vertex ring under a global cap of 300, **red** on `n-r` (tier `region`, cap 200) and **green** on `n-c` (tier `continent`, cap 800). Same ring, same budget, opposite verdicts, so only the table can explain the difference. The ring is produced by densifying an existing ring with collinear points on its own edges — area, containment, anchor and overlap are unchanged, and no 208-point literal enters the repo. Both mutations are proven red: dropping the `min()` fails the region test, flattening every row to 200 fails the continent test.

**The third tier has two named owners — it is not left to whoever gets there first.** The 40-vertex landform-instance cap is enforced in two places, both outside Plan A and both required: (1) **Plan B Task 2** puts `"maxItems": 40` on `geometry.points` and `geometry.ring` in `content/schemas/landform-instance.schema.json`, with a rejecting case in `scripts/tests/landform-instance-schema.test.mjs`; (2) **Plan C Task 11** adds the world-gate message `G-VERTEX-BUDGET: <id> ring has <n> vertices > 40 for tier landform-instance`, so an over-long generated ring names its remedy instead of surfacing as a raw ajv error. Plan A's `VERTEX_CAP` table deliberately has no `landform-instance` row; if a future reader adds one, the spine gate would silently claim coverage it does not have.

- [ ] **Step 1: Write the failing test**

First create the two overlay fixtures. An overlay is a directory copied **on top of** `scripts/tests/fixtures/spine/base/` by `spineFixture({overlayDir})` (`scripts/tests/spine-gates.test.mjs:212`), so it only needs the files it changes.

Create `scripts/tests/fixtures/spine/g-vertex-budget-region/spine/load-budget.json`:

```json
{
  "maxNodes": 10,
  "maxChildrenPerParent": 24,
  "maxRingPoints": 160,
  "maxBytes": 65536
}
```

Create `scripts/tests/fixtures/spine/g-vertex-budget-region/spine/nodes/n-r.json` — the base fixture's `n-r` with a 5-point ring, which is over a deliberately-lowered region cap. Rather than authoring a 201-point ring by hand, the test **lowers the cap through the fixture's own budget file**, so create instead:

`scripts/tests/fixtures/spine/g-vertex-budget-region/spine/load-budget.json`:

```json
{
  "maxNodes": 10,
  "maxChildrenPerParent": 24,
  "maxRingPoints": 3,
  "maxBytes": 65536
}
```

(`maxRingPoints` is the *global* ceiling; the per-tier `VERTEX_CAP` is the tighter of the two. Setting the global to 3 makes the base fixture's 4-point `n-r` ring the violation, with no 201-point literal in the repo.)

Create `scripts/tests/fixtures/spine/g-children-cap/spine/load-budget.json`:

```json
{
  "maxNodes": 10,
  "maxChildrenPerParent": 1,
  "maxRingPoints": 160,
  "maxBytes": 65536
}
```

Now append to `scripts/tests/spine-gates.test.mjs`, after the Task 1.13 G-OVERLAP block (currently ending at `:411`):

```js
// ─── Plan A Task 4: the three-term load budget + G-VERTEX-BUDGET ───────────
t11("G-LOAD-BUDGET prints all three measured terms on every run", () => {
  const r = runSpineGate(spineFixture());
  assert11.equal(r.code, 0, r.out);
  assert11.match(r.out, /spine-load: 3 nodes, \d+ bytes, max children \d+\/\d+, max ring \d+\/\d+ \(budget 10 nodes, 65536 bytes\)/);
});

t11("G-LOAD-BUDGET red: a parent over maxChildrenPerParent names the quadratic cost", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-children-cap" }));
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-LOAD-BUDGET: n-c has 2 children > budget 1 — the pairwise overlap check is quadratic in siblings \(1 pairs\); introduce an intermediate node rather than raising the cap/);
});

t11("G-VERTEX-BUDGET red: a ring over the global maxRingPoints", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-vertex-budget-region" }));
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-VERTEX-BUDGET: n-r ring has 4 vertices > 3 for tier region/);
});

t11("G-VERTEX-BUDGET green: every committed node is inside its tier cap", () => {
  const r = runGate(join(ROOT, "content"));
  assert11.equal(r.code, 0, r.stdout);
  assert11.doesNotMatch(r.stdout, /G-VERTEX-BUDGET/);
});

t11("G-LOAD-BUDGET green: the committed table is inside all three terms", () => {
  const r = runGate(join(ROOT, "content"));
  // 44 nodes / 96, n-cluster1's 12 children / 24, n-galereach's 27 points / 160.
  assert11.match(r.stdout, /spine-load: 44 nodes, \d+ bytes, max children 12\/24, max ring 27\/160 \(budget 96 nodes, 786432 bytes\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/tests/spine-gates.test.mjs 2>&1 | grep -E "VERTEX|LOAD-BUDGET|pass |fail "`

Expected: FAIL — the print-format tests fail because the current line is `spine-load: 3 nodes, N bytes (budget 10 nodes, 65536 bytes)` with no children/ring terms; the two red-fixture tests fail with `code 0` because neither rule exists.

- [ ] **Step 3: Update the committed budget**

Replace the whole of `content/spine/load-budget.json` with:

```json
{
  "maxNodes": 96,
  "maxChildrenPerParent": 24,
  "maxRingPoints": 160,
  "maxBytes": 786432
}
```

Rationale to carry in the phase report: `maxNodes` 96 is loader sanity only (the trunk becomes 36, leaving 2.7x headroom for the runtime tree); `maxChildrenPerParent` 24 is the real governor — at 24 the worst case is 276 pairs; `maxRingPoints` 160 is where the per-pair cost curve flattens (measured 120 pts → 1.76 ms/pair, 200 → 1.85) and a ring is still reviewable as text; `maxBytes` doubles because hoisting `derived` (Plan B) lands the 36 trunk nodes near 150 KB.

- [ ] **Step 4: Implement the three-term budget**

In `scripts/check_content.mjs`, replace the `if (!spine.budgets.load) { … } else { … }` block inside `gSpineBudgets` (`:2085-2092`) with:

```js
  // Plan A Task 4: three terms, not one. A global node count is the wrong
  // proxy — 96 nodes with <= 3 siblings each cost ~30 pairs; 48 nodes all
  // under ONE parent cost 1,128 while passing maxNodes: 48. The quadratic
  // term is Σ_parents C(children, 2), and after Task 2 the per-pair constant
  // is dominated by ring vertex count. All three PRINT on every run, the
  // G-COMP-REPORT discipline, so drift is visible before it is a failure.
  let maxKids = 0, maxKidsAt = "-", maxRing = 0, maxRingAt = "-";
  for (const node of tree.byId.values()) {
    const kids = (tree.childrenOf.get(node.id) ?? []).length;
    if (kids > maxKids) { maxKids = kids; maxKidsAt = node.id; }
    const v = ringVertexCount({ placement: node.placement });
    if (v > maxRing) { maxRing = v; maxRingAt = node.id; }
  }

  if (!spine.budgets.load) {
    fail(`spine: G-LOAD-BUDGET: spine/load-budget.json is missing`);
  } else {
    const { maxNodes, maxBytes, maxChildrenPerParent, maxRingPoints } = spine.budgets.load;
    console.log(`spine-load: ${spine.nodes.length} nodes, ${bytes} bytes, max children ${maxKids}/${maxChildrenPerParent}, max ring ${maxRing}/${maxRingPoints} (budget ${maxNodes} nodes, ${maxBytes} bytes)`);
    if (spine.nodes.length > maxNodes) fail(`spine: G-LOAD-BUDGET: ${spine.nodes.length} nodes > budget ${maxNodes}`);
    if (bytes > maxBytes) fail(`spine: G-LOAD-BUDGET: ${bytes} bytes > budget ${maxBytes}`);
    // The two new terms. A MISSING term is not a silent pass: an old budget
    // file that predates this task would otherwise disable both governors
    // exactly when a redraw needs them most.
    if (typeof maxChildrenPerParent !== "number")
      fail(`spine: G-LOAD-BUDGET: spine/load-budget.json has no maxChildrenPerParent`);
    else
      for (const node of tree.byId.values()) {
        const kids = (tree.childrenOf.get(node.id) ?? []).length;
        if (kids > maxChildrenPerParent)
          fail(`G-LOAD-BUDGET: ${node.id} has ${kids} children > budget ${maxChildrenPerParent} — the pairwise overlap check is quadratic in siblings (${(kids * (kids - 1)) / 2} pairs); introduce an intermediate node rather than raising the cap`);
      }
    if (typeof maxRingPoints !== "number")
      fail(`spine: G-LOAD-BUDGET: spine/load-budget.json has no maxRingPoints`);
    else
      for (const node of tree.byId.values()) {
        const cap = Math.min(maxRingPoints, VERTEX_CAP[node.tier] ?? maxRingPoints);
        const v = ringVertexCount({ placement: node.placement });
        if (v > cap)
          fail(`G-VERTEX-BUDGET: ${node.id} ring has ${v} vertices > ${cap} for tier ${node.tier}`);
      }
  }
```

Add the tier table beside the other module constants near the top of `scripts/check_content.mjs` (after the imports, before `parseArgs`):

```js
// Plan A Task 4 — G-VERTEX-BUDGET. Every cost in the map lane is linear or
// worse in ring vertex count and nothing constrained it before this. The
// EFFECTIVE cap is min(load-budget.maxRingPoints, VERTEX_CAP[tier]) — the
// global term is the loader's ceiling, the per-tier term is the geometry
// gate's. Landform instances are NOT spine nodes (they are Plan C's fabric
// records) so their 40-vertex cap is not enforced here and must not be
// pretended into this table.
const VERTEX_CAP = Object.freeze({
  world: 800, playroot: 800, continent: 800, ocean: 800, sea: 800,
  playspace: 800, fixture: 200, region: 200, town: 200, site: 200,
});
```

Add `ringVertexCount` to the `./lib/spine.mjs` import list on line 27.

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
node --test scripts/tests/spine-gates.test.mjs 2>&1 | tail -8
node scripts/check_content.mjs --only=spine | grep spine-load
git diff --stat content/spine/nodes/ colyseus-server/
```
Expected: `fail 0`; `spine-load: 44 nodes, <n> bytes, max children 12/24, max ring 27/160 (budget 96 nodes, 786432 bytes)`; **no diff** under `content/spine/nodes/` (only `load-budget.json` changed, and it is not a node file so no `derived` block moves).

- [ ] **Step 6: Commit**

```bash
git add content/spine/load-budget.json scripts/check_content.mjs \
        scripts/tests/spine-gates.test.mjs scripts/tests/fixtures/spine/g-children-cap \
        scripts/tests/fixtures/spine/g-vertex-budget-region
git commit -m "feat: three-term load budget and G-VERTEX-BUDGET"
```

- [ ] **Step 7: QUALITY GATE — verify**

```bash
node scripts/check_content.mjs --only=spine | tail -1
node scripts/check_spine_emit.mjs --check | tail -1
node --test scripts/tests/spine-gates.test.mjs 2>&1 | tail -6
(cd colyseus-server && npm test -- mapDimensions 2>&1 | tail -5)
git branch --show-current && git log --oneline -1
```

- [ ] **Step 8: QUALITY GATE — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`. Brief:

> Two new budget rules landed in `gSpineBudgets`. Check: (a) that ~45 existing minimal fixture roots which ship a two-key `load-budget.json` do not now fail on the missing-term rules — run `node --test scripts/tests/spine-gates.test.mjs` and `node --test scripts/tests/spine.test.mjs` and report the counts; (b) that the loops walk `tree.byId.values()` (the schema-VALID set) and never raw `spine.nodes`, matching the discipline the function's own header comment describes; (c) that `ringVertexCount` on a `point` placement returns 0 and therefore never trips a cap; (d) that the printed `spine-load:` line is a single line with no trailing whitespace, since three tests regex it; (e) whether `VERTEX_CAP` missing a tier silently falls back to the global cap and whether that is the right default (argue it either way, but say which).

- [ ] **Step 9: QUALITY GATE — refactor and re-verify**

Fix findings as new commits. Re-run Step 7. Also run `./scripts/precheck.sh --no-install 2>&1 | tail -20` once here — this is the first task that changes a committed file, so Gate 1 as a whole should be seen green.

---
### Task 5: `scripts/lib/places.mjs` — the one join authority

Spec §9.2 step 1: *write `resolveWorld({fabric, civil})` returning the shape `emitGeography()` returns today, built in memory.* This task **moves** that join out of the emitter rather than reimplementing it, so byte-identity is structural rather than tested-for. `check_spine_emit.mjs`'s `emitGeography` becomes a three-line serialiser over the moved function.

Two behaviours change and both are the point: the join **never throws** (a missing subject or feature becomes `problems.push(...)`, so a redraw gets a diagnosable red instead of a raw `TypeError: Cannot read properties of undefined (reading 'title')`), and `loadPlaces({contentRoot})` gains a **fallback branch** that reads the legacy mirror file when the content root has no resolvable spine — which is exactly the situation in the three gate fixture suites that write their own `content/maps/cluster1-geography.json` and ship no `content/spine/` at all.

**Files:**
- Create: `scripts/lib/places.mjs`
- Create: `scripts/tests/places.test.mjs`
- Modify: `scripts/check_spine_emit.mjs:76-187` (delete `GEO_HEADER`, `strip`, the body of `emitGeography`; keep `GEOGRAPHY_VERSION` re-exported)

**Interfaces:**
- Consumes: `loadSpine`, `buildTree`, `resolveToRoot` from `scripts/lib/spine.mjs`; `canonStringify` from `scripts/check_spine_emit.mjs` (imported *by* the emitter, not by `places.mjs` — `places.mjs` returns an object, never a string, so it stays leaf-level and cannot cycle).
- Produces:
  - `WORLD_DOC_KEYS: string[]` — the 19 keys, in insertion order. Load-bearing: `canonStringify` serialises `Object.keys()` in insertion order, so building the doc in any other order changes the emitted bytes for no semantic reason.
  - `DEFAULT_SUBJECTS` — the subject descriptor, holding exactly today's hard-coded ids. **Task 7 moves this into `content/spine/sheet.json` and deletes the constant.**
  - `resolveWorld({ spine, tree, descriptor = null, fabric = null, civil = null }): { doc: object|null, problems: string[] }`
  - `loadPlaces({ contentRoot }): { doc: object|null, problems: string[] }`
- Consumed by: Task 6 (`check_content.mjs` ×3, `render-sheet.mjs`), Task 8 (`atlas-sheet.mjs` reads only the descriptor, not the doc), Plan D (which removes the fallback branch and points `loadPlaces` at `content/world/resolved/`).

Doc-shape typedefs, for the reader:

```js
/** @typedef {[number, number]} Pt */
/** @typedef {{id:string,name:string,order:number,levelBand:[number,number],gradient?:true,
 *   terrainKind:string|null,town:string|null,labelAt:Pt,polygon:Pt[],note?:string,
 *   gradientSegments?:Array<{id,label,levelBand,graveRows,yFromKm,yToKm,note}>}} PlaceZone */
/** @typedef {{id:string,name:string,at:Pt,zone:string,ruin?:true,emblem:string,
 *   reason:string,labelAnchor:string,wallsOnly?:string}} PlaceTown */
/** @typedef {{id:string,name:string,at:Pt,zone:string,note:string}} PlaceCamp */
/** @typedef {{id:string,name:string,from:string,to:string,weight:"trunk"|"spur"|"track",
 *   dashed:boolean,hours:number,hoursLabel:string,roadKm:number,throughRoute?:string,
 *   labelAtIndex:number,note:string,amendedPending?:string,points:Pt[]}} PlaceRoad */
```

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/places.test.mjs`:

```js
// Plan A Task 5 — scripts/lib/places.mjs.
//
// The ONE assertion that matters is byte-identity: canonStringify over
// resolveWorld's doc must equal the committed content/maps/cluster1-geography.json
// EXACTLY. Everything downstream (three gate joins, two sheet builders) is
// only safe to re-point because of it, and key ORDER is half of it —
// canonStringify walks Object.keys() in insertion order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpine, buildTree } from "../lib/spine.mjs";
import { canonStringify } from "../check_spine_emit.mjs";
import { WORLD_DOC_KEYS, resolveWorld, loadPlaces } from "../lib/places.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT = join(ROOT, "content");
const MIRROR = join(CONTENT, "maps/cluster1-geography.json");

function realTree() {
  const spine = loadSpine({ contentRoot: CONTENT });
  return { spine, tree: buildTree({ nodes: spine.nodes, rootIds: spine.roots }) };
}

test("resolveWorld reproduces the committed mirror BYTE for BYTE", () => {
  const { spine, tree } = realTree();
  const { doc, problems } = resolveWorld({ spine, tree });
  assert.deepEqual(problems, []);
  assert.equal(canonStringify(doc) + "\n", readFileSync(MIRROR, "utf8"));
});

test("resolveWorld builds the doc in the pinned key order", () => {
  const { spine, tree } = realTree();
  const { doc } = resolveWorld({ spine, tree });
  assert.deepEqual(Object.keys(doc), WORLD_DOC_KEYS);
  assert.equal(WORLD_DOC_KEYS.length, 19);
});

test("resolveWorld REPORTS a missing subject node, never throws (the C2 TypeError)", () => {
  const { spine, tree } = realTree();
  tree.byId.delete("n-saltmire");
  const { doc, problems } = resolveWorld({ spine, tree });
  assert.equal(doc, null);
  assert.ok(
    problems.some((p) => p.includes("n-saltmire")),
    `expected a problem naming n-saltmire, got ${JSON.stringify(problems)}`,
  );
});

test("resolveWorld REPORTS a missing subject feature, never throws", () => {
  const { spine, tree } = realTree();
  const cluster = tree.byId.get("n-cluster1");
  tree.byId.set("n-cluster1", { ...cluster, features: cluster.features.filter((f) => f.id !== "f-west-coast") });
  const { doc, problems } = resolveWorld({ spine, tree });
  assert.equal(doc, null);
  assert.ok(problems.some((p) => p.includes("f-west-coast")), JSON.stringify(problems));
});

test("loadPlaces on the real content root resolves from the SPINE and matches the mirror", () => {
  const { doc, problems } = loadPlaces({ contentRoot: CONTENT });
  assert.deepEqual(problems, []);
  assert.equal(canonStringify(doc) + "\n", readFileSync(MIRROR, "utf8"));
});

test("loadPlaces FALLS BACK to the mirror file when the root has no spine (the fixture path)", () => {
  // zone-content.test.mjs, town-plan.test.mjs and bestiary-placement.test.mjs
  // all build exactly this shape: a maps/ dir, no spine/ dir. Without the
  // fallback, ~60 gate tests go dark (all three joins `return 0` on a failed
  // load, so the gate would silently stop counting rather than fail).
  const dir = mkdtempSync(join(tmpdir(), "places-fallback-"));
  try {
    mkdirSync(join(dir, "maps"), { recursive: true });
    const fixture = { id: "x", zones: [{ id: "z1" }], towns: [{ id: "t1" }], camps: [], roads: [] };
    writeFileSync(join(dir, "maps/cluster1-geography.json"), JSON.stringify(fixture));
    const { doc, problems } = loadPlaces({ contentRoot: dir });
    assert.deepEqual(problems, []);
    assert.deepEqual(doc.zones, [{ id: "z1" }]);
    assert.deepEqual(doc.towns, [{ id: "t1" }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadPlaces on an empty root returns doc null and one problem, never throws", () => {
  const dir = mkdtempSync(join(tmpdir(), "places-empty-"));
  try {
    const { doc, problems } = loadPlaces({ contentRoot: dir });
    assert.equal(doc, null);
    assert.equal(problems.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadPlaces prefers the SPINE over a stale mirror on a root that has both", () => {
  const dir = mkdtempSync(join(tmpdir(), "places-both-"));
  try {
    cpSync(join(CONTENT, "spine"), join(dir, "spine"), { recursive: true });
    cpSync(join(CONTENT, "towns"), join(dir, "towns"), { recursive: true });
    mkdirSync(join(dir, "maps"), { recursive: true });
    writeFileSync(join(dir, "maps/cluster1-geography.json"), JSON.stringify({ zones: [], towns: [] }));
    const { doc, problems } = loadPlaces({ contentRoot: dir });
    assert.deepEqual(problems, []);
    assert.ok(doc.zones.length > 0, "fell back to the stale mirror instead of resolving the spine");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/tests/places.test.mjs`

Expected: FAIL — `Cannot find module '.../scripts/lib/places.mjs'` on every test.

- [ ] **Step 3: Create `scripts/lib/places.mjs`**

The body below is `emitGeography`'s body (`check_spine_emit.mjs:102-187`) moved verbatim, with three mechanical changes: it returns an object instead of a serialised string; `feat()` and the two `tree.byId.get` subject lookups push a problem instead of throwing or returning `undefined`; and the subject ids come from a named constant instead of being spelled inline. Nothing else moves — every field expression, every conditional spread, every comment stays.

```js
// Plan A Task 5 — the ONE join authority: spine (and, from Plan D, fabric +
// civil) -> the world document that gates and renderers read.
//
// This body was MOVED verbatim out of scripts/check_spine_emit.mjs's
// emitGeography(). Moving rather than reimplementing is what makes byte
// identity structural instead of merely tested — and the byte identity is
// what lets four consumers be re-pointed in one commit without a re-baseline.
//
// Conventions (inherited, non-negotiable):
//   - one options object per function;
//   - NEVER throws. A missing subject node or feature is problems.push(...).
//     The pre-Plan-A emitter threw a raw TypeError, which is why dropping
//     n-saltmire crashed both sheet builders instead of reporting;
//   - key insertion order IS the byte format. canonStringify walks
//     Object.keys() in insertion order and drops undefined-valued keys.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSpine, buildTree, resolveToRoot } from "./spine.mjs";

// The emitted document's key order, pinned. Changing this array changes the
// committed bytes of every consumer of the world document.
export const WORLD_DOC_KEYS = Object.freeze([
  "id", "title", "version", "source", "about", "coordinateSystem",
  "coastline", "river", "saltmire", "iceEdge", "terrainPatches",
  "zones", "towns", "camps", "roads", "relay", "distances", "seaLane", "sheet",
]);

// The subject descriptor. Task 7 moves this into content/spine/sheet.json's
// `subjects` block and deletes this constant; until then it holds EXACTLY the
// ids check_spine_emit.mjs:104-132 spelled inline, so the move is a pure
// relocation with no behaviour change.
export const DEFAULT_SUBJECTS = Object.freeze({
  rootId: "n-atlas",
  zoneRoot: "n-cluster1",
  landIds: ["n-cluster1"],
  seaIds: ["n-westsea"],
  terrainPatchIds: ["n-eastern-hills"],
  mireIds: ["n-saltmire"],
  featureIds: { coast: "f-west-coast", river: "f-the-meltwash", iceEdge: "f-northern-ice-edge" },
});

export const GEOGRAPHY_VERSION = 2;

// Header prose is mirror boilerplate, frozen verbatim from the shipped file.
const GEO_HEADER = {
  id: "cluster1-geography",
  title: "Cluster 1 — the Meltwash basin",
  version: GEOGRAPHY_VERSION,
  source: "docs/worldbuilding/A1-geography-cluster1.md",
  about: "GENERATED FILE — do not edit by hand. Emitted from content/spine/nodes/* by scripts/check_spine_emit.mjs (regenerate with --write; CI byte-compares with --check). Machine-readable geography of cluster 1: the data the world map is DRAWN FROM; the SVG is a view of it, never the source of truth. Every proper noun here already exists in the Cartographer's document (A1) or content/story/canon.md — nothing is invented.",
  coordinateSystem: {
    units: "km",
    convention: "x increases EAST, y increases SOUTH (north is smaller y) — inherited unchanged from content/maps/atlas-frontier.md",
    extentKm: { width: 30, height: 38 },
    origin: "x=0 is the west edge of the sheet (open sea); y=0 is the hard parchment edge at the top (the ice). A1 §2 (pre-F-045): the land was roughly 190 km north-south and 150 km east-west; F-045 (I-095) scales the basin ÷5 to 38 km north-south and 30 km east-west, same schematic.",
    tolerance: "Positions are authored to reproduce A1 §5.1's straight-line distances within ~8%. A1 §5.3 is explicit that the world preserves topology, adjacency, ordering and terrain — NOT exact metric distance — so these coordinates are a faithful schematic, not a survey. `distances[].deltaPct` records the residual for every canon-bearing leg.",
  },
};

const strip = (n) => n.lore?.geoId ?? n.id.slice(2);

export function resolveWorld({ spine, tree, descriptor = null, fabric = null, civil = null }) {
  const problems = [];
  const S = descriptor ?? DEFAULT_SUBJECTS;
  // Plan D supplies fabric/civil and makes spine/tree optional. Until then a
  // caller passing either is asking for a join this build cannot do, and
  // silently ignoring it would be the worst of the three options.
  if (fabric !== null || civil !== null)
    problems.push("resolveWorld: fabric/civil joins are Plan D — this build resolves from the spine only");

  const node = (key, id) => {
    const n = tree.byId.get(id);
    if (!n) problems.push(`sheet: subject "${key}" -> "${id}" does not resolve`);
    return n ?? null;
  };

  const C = node("zoneRoot", S.zoneRoot);
  const feat = (key, id) => {
    if (!C) return null;
    const f = (C.features ?? []).find((x) => x.id === id);
    if (!f) problems.push(`sheet: subject "${key}" -> "${id}" does not resolve`);
    return f ?? null;
  };

  const coast = feat("coast", S.featureIds.coast);
  const river = feat("river", S.featureIds.river);
  const ice = feat("iceEdge", S.featureIds.iceEdge);
  const salt = node("mireIds[0]", S.mireIds[0]);
  const hills = node("terrainPatchIds[0]", S.terrainPatchIds[0]);
  if (problems.length) return { doc: null, problems };

  const kids = (id) => (tree.childrenOf.get(id) ?? []).map((i) => tree.byId.get(i));
  const regions = kids(S.zoneRoot)
    .filter((n) => n.tier === "region" && n.lore?.order != null)
    .sort((a, b) => a.lore.order - b.lore.order);
  const rootAt = (n) => n.parentId === null
    ? n.placement.anchor
    : resolveToRoot({ tree, id: n.parentId, point: n.placement.anchor });
  const townNodes = regions.flatMap((r) => kids(r.id).filter((n) => n.tier === "town"));
  const towns = townNodes.filter((n) => !n.tags.includes("camp")).sort((a, b) => a.lore.order - b.lore.order);
  const camps = townNodes.filter((n) => n.tags.includes("camp"));
  const endName = (e, side) => e.attrs[side === "from" ? "geoFrom" : "geoTo"]
    ?? strip(tree.byId.get(e[side].node));
  const excluded = new Set([...S.mireIds, ...S.terrainPatchIds]);

  const doc = {
    ...GEO_HEADER,
    coastline: { id: "west-coast", note: coast.attrs.note, points: coast.points },
    river: { id: "the-meltwash", name: river.attrs.name, note: river.attrs.note,
      reaches: river.attrs.reaches, points: river.points, labelAt: river.attrs.labelAt,
      tidalLimit: river.attrs.tidalLimit, ford: river.attrs.ford },
    saltmire: { id: "the-saltmire", name: salt.title, note: salt.lore.note, polygon: salt.placement.points },
    iceEdge: { id: "northern-ice-edge", note: ice.attrs.note, hardEdgeAtY: ice.attrs.hardEdgeAtY, shelfLip: ice.points },
    terrainPatches: [{ id: "eastern-hills", label: hills.title, terrainKind: hills.terrainKind,
      labelAt: hills.lore.labelAt, note: hills.lore.note, polygon: hills.placement.points }],
    zones: regions.filter((r) => !excluded.has(r.id)).map((r) => {
      const town = kids(r.id).find((n) => n.tier === "town" && !n.tags.includes("camp"));
      return {
        id: strip(r), name: r.title, order: r.lore.order, levelBand: r.levelBand,
        ...(r.bands.length ? { gradient: true } : {}),
        terrainKind: r.terrainKind, town: town ? strip(town) : null,
        labelAt: r.lore.labelAt, polygon: r.placement.points,
        ...(r.lore.note ? { note: r.lore.note } : {}),
        ...(r.bands.length ? { gradientSegments: r.bands.map((b) => ({
          id: b.id.slice(2), label: b.label, levelBand: b.levelBand,
          graveRows: b.attrs.graveRows, yFromKm: b.fromKm, yToKm: b.toKm,
          note: b.attrs.note })) } : {}),
      };
    }),
    towns: towns.map((n) => ({ id: strip(n), name: n.title, at: rootAt(n),
      zone: strip(tree.byId.get(n.parentId)),
      ...(n.tags.includes("ruin") ? { ruin: true } : {}),
      emblem: n.lore.emblem, reason: n.lore.reason, labelAnchor: n.lore.labelAnchor,
      ...(n.lore.wallsOnly ? { wallsOnly: n.lore.wallsOnly } : {}) })),
    camps: camps.map((n) => ({ id: strip(n), name: n.title, at: rootAt(n),
      zone: strip(tree.byId.get(n.parentId)), note: n.lore.note })),
    roads: spine.edges.filter((e) => e.kind === "road").map((e) => ({
      id: e.id.slice(2), name: e.attrs.name, from: endName(e, "from"), to: endName(e, "to"),
      weight: e.weight, dashed: e.dashed, hours: e.attrs.hours, hoursLabel: e.attrs.hoursLabel,
      roadKm: e.attrs.roadKm, ...(e.attrs.throughRoute ? { throughRoute: e.attrs.throughRoute } : {}),
      labelAtIndex: e.attrs.labelAtIndex, note: e.attrs.note,
      ...(e.attrs.amendedPending ? { amendedPending: e.attrs.amendedPending } : {}),
      points: e.points })),
    relay: { ...C.lore.relay,
      chains: spine.edges.filter((e) => e.kind === "relay").map((e) => ({
        id: e.id.slice(2), note: e.attrs.note,
        towerIds: [e.from, ...(e.via ?? []), e.to].map((r) => r.feature.slice(2)) })),
      towers: C.features.filter((f) => /^f-tower-\d/.test(f.id)).map((f) => ({
        id: f.id.slice(2), at: f.at, ...(f.attrs.town ? { town: f.attrs.town } : {}) })),
      detachedTowers: C.features.filter((f) => f.attrs?.detached).map((f) => ({
        id: f.id.slice(2), at: f.at, town: f.attrs.town, note: f.attrs.note })) },
    distances: { ...C.lore.distances,
      legs: spine.edges.filter((e) => e.kind === "leg").map((e) => ({
        from: endName(e, "from"), to: endName(e, "to"), canonHours: e.attrs.canonHours,
        roadKm: e.attrs.roadKm, straightKm: e.attrs.straightKm })) },
    seaLane: (() => {
      const e = spine.edges.find((x) => x.kind === "sealane");
      if (!e) { problems.push(`sheet: subject "seaLane" -> no edge of kind "sealane"`); return null; }
      const far = (C.features ?? []).find((f) => f.id === e.to.feature);
      if (!far) { problems.push(`sheet: subject "seaLane.to" -> "${e.to.feature}" does not resolve`); return null; }
      return { note: e.attrs.note, from: rootAt(tree.byId.get(e.from.node)), to: far.at, label: e.attrs.label };
    })(),
    sheet: spine.sheet,
  };
  if (problems.length) return { doc: null, problems };
  return { doc, problems };
}

// The disk-facing entry point. Prefers the spine; falls back to the legacy
// mirror FILE for content roots that carry one but no spine — which is every
// fixture root in scripts/tests/{zone-content,town-plan,bestiary-placement}.test.mjs.
// Plan D deletes the fallback and points this at content/world/resolved/.
export function loadPlaces({ contentRoot }) {
  const problems = [];
  if (existsSync(join(contentRoot, "spine"))) {
    const spine = loadSpine({ contentRoot });
    if (spine.present && spine.errors.length === 0) {
      const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
      if (tree.errors.length === 0 && tree.byId.has(DEFAULT_SUBJECTS.zoneRoot))
        return resolveWorld({ spine, tree });
    }
  }
  const mirror = join(contentRoot, "maps/cluster1-geography.json");
  if (existsSync(mirror)) {
    try {
      return { doc: JSON.parse(readFileSync(mirror, "utf8")), problems };
    } catch (e) {
      problems.push(`geography: ${mirror}: ${e.message}`);
      return { doc: null, problems };
    }
  }
  problems.push(`geography: ${contentRoot} has neither a resolvable spine nor maps/cluster1-geography.json`);
  return { doc: null, problems };
}
```

- [ ] **Step 4: Reduce `emitGeography` to a serialiser**

In `scripts/check_spine_emit.mjs`, delete lines 76-187 (the `GEO_HEADER` comment block, `GEOGRAPHY_VERSION`, `GEO_HEADER`, `strip`, and the whole of `emitGeography`) and replace with:

```js
// ── spine → content/maps/cluster1-geography.json (G-EMIT-DRIFT, Phase 1) ──
// The join itself moved to scripts/lib/places.mjs in Plan A Task 5 — this is
// now only the serialiser. GEOGRAPHY_VERSION is re-exported because it is
// part of the emitted document's contract and callers reference it by name.
export { GEOGRAPHY_VERSION } from "./lib/places.mjs";

export function emitGeography({ spine, tree }) {
  const { doc, problems } = resolveWorld({ spine, tree });
  if (problems.length) return { bytes: null, problems };
  return { bytes: canonStringify(doc) + "\n", problems: [] };
}
```

Add the import at the top of `scripts/check_spine_emit.mjs`, beside the `./lib/spine.mjs` import on line 18:

```js
import { resolveWorld } from "./lib/places.mjs";
```

Then update the single call site at `:209`, inside `collectOutputs`:

```js
  if (tree.byId.has("n-cluster1")) {
    // Plan A Task 5: emitGeography now returns { bytes, problems } and never
    // throws. A missing subject is an in-band error here, exactly like an
    // unparsable town plan five lines above — a raw TypeError would skip
    // main()'s error printing and exit with a stack instead of a diagnosis.
    const geo = emitGeography({ spine, tree });
    if (geo.problems.length) return { errors: geo.problems };
    outputs.push({ path: join(contentRoot, "maps/cluster1-geography.json"), bytes: geo.bytes });
  }
```

- [ ] **Step 5: Patch the one other `emitGeography` caller**

`tools/mapforge/render-sheet.mjs:33` does `JSON.parse(emitGeography({ spine, tree }))`. Task 6 re-points it at `places.mjs` entirely, but it must not be broken between commits. Change it now to:

```js
  const { bytes, problems } = emitGeography({ spine, tree });
  if (problems.length) return { svg: "", notes: [], problems };
  const doc = JSON.parse(bytes);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
node --test scripts/tests/places.test.mjs
node scripts/check_spine_emit.mjs --check | tail -1
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
node scripts/check_content.mjs --require-complete 2>&1 | tail -1
git diff --stat content/ game-client/ colyseus-server/
```
Expected: places suite `fail 0`; `spine-emit: check clean, 47 files`; mapforge `fail 0`; the full content gate unchanged; **no diff** under `content/`, `game-client/` or `colyseus-server/`.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/places.mjs scripts/tests/places.test.mjs \
        scripts/check_spine_emit.mjs tools/mapforge/render-sheet.mjs
git commit -m "refactor: move the geography join into scripts/lib/places.mjs"
```

- [ ] **Step 8: QUALITY GATE — verify**

```bash
node --test scripts/tests/places.test.mjs 2>&1 | tail -6
node scripts/check_spine_emit.mjs --check | tail -1
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
(cd colyseus-server && npm test -- mapDimensions 2>&1 | tail -5)
git branch --show-current && git log --oneline -1
```

- [ ] **Step 9: QUALITY GATE — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`. Brief:

> A 90-line join was moved between modules and its error handling changed from `throw` to in-band problems. Diff the moved body **line by line** against `git show HEAD~1:scripts/check_spine_emit.mjs` and report ANY expression that is not character-identical apart from the three declared changes (return shape, subject lookup, `excluded` set). Then check: (a) does `canonStringify` drop any key differently now — specifically, is any key that used to be present-with-`undefined` now absent, or vice versa; (b) does `loadPlaces`'s spine branch handle a root with a spine that has `errors` (it must fall through to the mirror, not return a half-built doc); (c) can `resolveWorld` return `doc` non-null while `problems` is non-empty; (d) is there any import cycle — `places.mjs` must not import `check_spine_emit.mjs`.

- [ ] **Step 10: QUALITY GATE — refactor and re-verify**

Fix findings as new commits. Re-run Step 8, and re-run `git diff --stat content/ game-client/ colyseus-server/` — it must print nothing.

---
### Task 6: Re-point all four mirror consumers at `places.mjs`

Spec §9.2 step 2. The three gate joins each call `loadGeographyZones` / `loadGeographyTowns` against `maps/cluster1-geography.json` and — critically — **`return 0` when the load fails**. A botched re-home therefore does not fail the gate; it *silently disables* it. The acceptance criterion for this task is not "exit 0", it is "the gate still COUNTS the same number of records".

**Files:**
- Modify: `scripts/check_content.mjs:107-142` (both loaders), `:816`, `:955`, `:1192`
- Modify: `tools/mapforge/render-sheet.mjs:25,29-35,37-49`
- Modify: `scripts/tests/places.test.mjs` (append the count assertions)

**Interfaces:**
- Consumes: `loadPlaces({ contentRoot }): { doc, problems }` from Task 5.
- Produces: `SHEETS[id]` grows two declared fields, which Plan B's sheet registry and the storybook parity gate both read —
  ```js
  SHEETS[id] = { title: string, outSvg: string, outPng: string, maxLabelRank: number,
                 build({ repoRoot }): { svg: string, notes: string[], problems: string[] } }
  ```
  `maxLabelRank` is declared now and consumed by Plan B's `placeLabels`. Plan A sets `cluster1: 10` (a region sheet draws every rank) and `atlas: 3` (a world sheet draws world title, ocean, continent, sea only).

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/places.test.mjs`:

```js
// ── the three gate joins must still COUNT, not merely exit 0 ───────────────
// All three call sites `return 0` when the geography load fails, so a botched
// re-home silently disables the gate rather than failing it. These assert the
// printed record counts, which is the only signal that the join still joined.
import { execFileSync } from "node:child_process";

function runFullGate(contentRoot) {
  try {
    return { code: 0, out: execFileSync(process.execPath,
      [join(ROOT, "scripts/check_content.mjs"), "--content-root", contentRoot],
      { encoding: "utf8" }) };
  } catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}

test("gate joins: the real content root still counts 10 zones, 1 town and its placements", () => {
  const r = runFullGate(CONTENT);
  assert.equal(r.code, 0, r.out);
  // The counts the gate printed BEFORE the re-home. If the join went dark,
  // every one of these drops to 0 while the gate still exits 0.
  assert.match(r.out, /content-gate: \d+ sheets, \d+ maps, \d+ story, [1-9]\d* placements, 10 zones, 1 towns, 44 nodes, 0 failures/);
});
```

Also append to `tools/mapforge/tests/render-sheet.test.mjs`:

```js
test("SHEETS entries declare title, outSvg, outPng and maxLabelRank", () => {
  for (const [id, sheet] of Object.entries(SHEETS)) {
    assert.equal(typeof sheet.title, "string", `${id}.title`);
    assert.ok(sheet.title.length > 0, `${id}.title is empty`);
    assert.match(sheet.outSvg, /^game-client\/assets\/art\/maps\/.+\.svg$/, `${id}.outSvg`);
    assert.match(sheet.outPng, /^game-client\/assets\/art\/maps\/.+\.png$/, `${id}.outPng`);
    assert.equal(typeof sheet.maxLabelRank, "number", `${id}.maxLabelRank`);
    assert.equal(typeof sheet.build, "function", `${id}.build`);
  }
});
```
(add `import { SHEETS } from "../render-sheet.mjs";` to that file's imports).

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
node --test scripts/tests/places.test.mjs 2>&1 | tail -6
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
```
Expected: the mapforge suite FAILS on `SHEETS entries declare title…` with `AssertionError [ERR_ASSERTION]: cluster1.title` (`undefined !== "string"`). The `places.test.mjs` count assertion should already **pass** — it is a pin on today's behaviour, captured *before* the re-home so a regression is visible.

**Record the real counts first.** Run `node scripts/check_content.mjs 2>&1 | tail -1` and paste it into the phase report; if the printed placements/zones/towns counts differ from the regex above, correct the regex to the observed values before proceeding. Do not proceed with a regex you have not seen match.

- [ ] **Step 3: Re-point the two loaders**

In `scripts/check_content.mjs`, replace both `loadGeographyZones` (`:107-121`) and `loadGeographyTowns` (`:128-142`) bodies. Keep the function names, the `byId` Map return, and the failure-count discipline — every downstream rule and ~60 fixture tests depend on all three.

```js
// I-059: zone records from the Cartographer's geography. levelBand is the
// authority for a placement file's routeBand (G8) — the band is asserted
// across files, never retyped from prose.
//
// Plan A Task 6: the SOURCE moved from the legacy content/maps/
// cluster1-geography.json mirror to scripts/lib/places.mjs, which resolves
// the same document from content/spine/ and falls back to the mirror file for
// content roots that ship one but no spine. `path` is now the content ROOT,
// not a file path. The failure messages downstream still name
// "cluster1-geography.json#zones" verbatim — ~10 fixture tests regex them and
// the mirror is still the concept even after the file is gone.
function loadGeographyZones(contentRoot) {
  const { doc, problems } = loadPlaces({ contentRoot });
  for (const p of problems) fail(`geography: ${p}`);
  if (!doc) return null;
  if (!Array.isArray(doc.zones)) {
    fail(`geography: ${contentRoot} is shape-invalid — expected { zones: [...] }`);
    return null;
  }
  const byId = new Map();
  for (const z of doc.zones) {
    if (!z || typeof z.id !== "string") continue;
    byId.set(z.id, z);
  }
  return byId;
}

// F-040 T1: town records from the Cartographer's geography. The geography is
// the authority on which towns exist and where they are; a town plan asserts
// against it and the geography is NEVER written back (design §9).
function loadGeographyTowns(contentRoot) {
  const { doc, problems } = loadPlaces({ contentRoot });
  for (const p of problems) fail(`geography: ${p}`);
  if (!doc) return null;
  if (!Array.isArray(doc.towns)) {
    fail(`geography: ${contentRoot} is shape-invalid — expected { towns: [...] }`);
    return null;
  }
  const byId = new Map();
  for (const t of doc.towns) {
    if (!t || typeof t.id !== "string") continue;
    byId.set(t.id, t);
  }
  return byId;
}
```

Add to the imports at the top of `scripts/check_content.mjs`:

```js
// Plan A Task 6: the ONE geography join authority. Replaces three direct
// reads of content/maps/cluster1-geography.json.
import { loadPlaces } from "./lib/places.mjs";
```

Then change the three call sites — `:816`, `:955`, `:1192` — from `join(opts.contentRoot, "maps/cluster1-geography.json")` to `opts.contentRoot`:

```js
  const zones = loadGeographyZones(opts.contentRoot);      // :816 and :955
  const towns = loadGeographyTowns(opts.contentRoot);      // :1192
```

**Do not touch** the three failure strings at `:835`, `:981`, `:1203` — `zone "…" not in cluster1-geography.json#zones` and `town "…" not in cluster1-geography.json#towns` are regexed by `scripts/tests/zone-content.test.mjs:483,493,507` and `scripts/tests/town-plan.test.mjs:583,589`.

- [ ] **Step 4: Re-point `render-sheet.mjs`**

In `tools/mapforge/render-sheet.mjs`, replace the `emitGeography` import on line 25 and `buildCluster1Sheet` (`:29-35`), and grow `SHEETS` (`:37-49`):

```js
import { loadSpine, buildTree } from "../../scripts/lib/spine.mjs";
// Plan A Task 6: the sheet reads the world document from the join authority
// directly. It used to import emitGeography from check_spine_emit.mjs and
// JSON.parse its output — the round-trip through a string was pure overhead:
// the mirror FILE was never read here (that was render-map.mjs), so this is
// a pure import swap with no byte consequence, proved by render-sheet.test.mjs.
import { resolveWorld } from "../../scripts/lib/places.mjs";

export function buildCluster1Sheet({ repoRoot }) {
  const spine = loadSpine({ contentRoot: join(repoRoot, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const { doc, problems } = resolveWorld({ spine, tree });
  if (problems.length) return { svg: "", notes: [], problems };
  return drawBasinSheet({ doc });
}

export const SHEETS = {
  cluster1: {
    // `title` mirrors tools/asset-storybook/maps-index.json's row title —
    // the storybook parity gate (X8) checks paths today and Plan B extends it
    // to the title. `maxLabelRank` is declared here and consumed by Plan B's
    // labels.mjs: a region sheet draws every priority rank 0-10, a world
    // sheet stops at rank 3 (world title, ocean, continent, sea).
    title: "Cluster 1 — Basin Survey",
    outSvg: "game-client/assets/art/maps/cluster1-world.svg",
    outPng: "game-client/assets/art/maps/cluster1-world.png",
    maxLabelRank: 10,
    build: buildCluster1Sheet,
  },
  atlas: {
    title: "The Atlas World — Mariners' Chart",
    outSvg: "game-client/assets/art/maps/atlas-world.svg",
    outPng: "game-client/assets/art/maps/atlas-world.png",
    maxLabelRank: 3,
    build: buildAtlasSheet,
  },
};
```

The two `title` values are copied verbatim from `tools/asset-storybook/maps-index.json` so the registry and the index already agree.

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
node --test scripts/tests/places.test.mjs 2>&1 | tail -6
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
node --test 'tools/asset-storybook/tests/*.test.mjs' 2>&1 | tail -6
npm test --prefix scripts 2>&1 | tail -8
node scripts/check_content.mjs --require-complete 2>&1 | tail -1
git diff --stat content/ game-client/ colyseus-server/
```
Expected: every suite `fail 0`; the content gate prints the same counts recorded in Step 2; no diff under `content/`, `game-client/` or `colyseus-server/`.

**The `npm test --prefix scripts` run is the load-bearing one here** — `zone-content.test.mjs` (41.7 KB), `town-plan.test.mjs` (39.7 KB) and `bestiary-placement.test.mjs` (12.8 KB) are the three suites whose fixture roots have no spine, and they are the proof the fallback branch works.

- [ ] **Step 6: Commit**

```bash
git add scripts/check_content.mjs tools/mapforge/render-sheet.mjs \
        scripts/tests/places.test.mjs tools/mapforge/tests/render-sheet.test.mjs
git commit -m "refactor: re-point the three gate joins and the sheet builder at places.mjs"
```

- [ ] **Step 7: QUALITY GATE — verify**

```bash
npm test --prefix scripts 2>&1 | tail -8
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
node scripts/check_content.mjs --require-complete 2>&1 | tail -1
(cd colyseus-server && npm test -- mapDimensions 2>&1 | tail -5)
git branch --show-current && git log --oneline -1
```

- [ ] **Step 8: QUALITY GATE — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`. Brief:

> Three gate joins changed their data source. Each `return 0`s on a failed load, so **the dangerous outcome is a green gate that stopped checking**. Verify by experiment, not by reading: (a) temporarily break `loadPlaces` to return `{doc: null}`, run `node scripts/check_content.mjs`, and confirm the gate FAILS rather than exiting 0 with zeroed counts — then revert; (b) confirm the three downstream failure strings still contain the literal `cluster1-geography.json#zones` / `#towns`; (c) confirm `loadGeographyZones` is now called twice per full run (bestiary placement and zone content) and that calling `loadPlaces` twice does not double-report a problem into `failures`; (d) confirm `render-sheet.mjs` no longer imports anything from `check_spine_emit.mjs`.

Finding (c) is expected to be real — decide deliberately whether to memoise `loadPlaces` per content root or to accept the double read, and write the decision into the code as a comment.

- [ ] **Step 9: QUALITY GATE — refactor and re-verify**

Fix findings as new commits. Re-run Step 7.

---

### Task 7: The subject descriptor and the de-hardcoded emitter

Spec §9.2 step 3, first half. Dropping `n-saltmire` from the spine today throws `TypeError: Cannot read properties of undefined (reading 'title')`; dropping `n-cluster1` throws on `'features'`. Task 5 already turned those into reports. This task removes the **other** half of the hazard: the subject ids themselves, which are spelled into code, plus two silent filters that would let a region vanish from the world with every gate green.

The two filters, verbatim from spec §9.5 and R3:
- `check_spine_emit.mjs:111` filtered `n.lore?.order != null`, **silently dropping** any region without the field. Scaling a null-check to 160 regions is how a region disappears unnoticed.
- `:132` hard-coded a two-element exclusion `["n-saltmire","n-eastern-hills"]`.

Both are replaced by the descriptor. The output is byte-identical today because all 12 regions under `n-cluster1` carry a `lore.order` and the two excluded ids are exactly the descriptor's `mireIds` + `terrainPatchIds`.

**Files:**
- Modify: `content/spine/sheet.json` (add `subjects`)
- Modify: `scripts/lib/places.mjs` (read the descriptor; delete `DEFAULT_SUBJECTS`; fail on a missing `lore.order` inside scope)
- Modify: `scripts/tests/places.test.mjs` (append)
- Create: `scripts/tests/fixtures/spine/g-sheet-subject-missing/` (overlay fixture)

**Interfaces:**
- Consumes: `spine.sheet` from `loadSpine` (`scripts/lib/spine.mjs:228`) — already loaded, no new I/O.
- Produces: the `subjects` descriptor block, the shape Task 8 and Plan B both read:
  ```jsonc
  "subjects": {
    "rootId": "n-atlas",
    "zoneRoot": "n-cluster1",
    "landIds": ["n-cluster1"],
    "seaIds": ["n-westsea"],
    "terrainPatchIds": ["n-eastern-hills"],
    "mireIds": ["n-saltmire"],
    "featureIds": { "coast": "f-west-coast", "river": "f-the-meltwash", "iceEdge": "f-northern-ice-edge" }
  }
  ```
  and the exact failure strings `sheet: subject "<key>" -> "<id>" does not resolve` and `sheet: region "<id>" under "<zoneRoot>" has no lore.order — a region without an order is dropped silently, which is how a region ceases to exist with every gate green`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/places.test.mjs`:

```js
// ── the descriptor, and the two silent filters it kills ────────────────────
import { DEFAULT_SUBJECTS_REMOVED_IN_TASK_7 } from "../lib/places.mjs"; // must NOT exist

test("the subject descriptor lives in content/spine/sheet.json, not in code", () => {
  const sheet = JSON.parse(readFileSync(join(CONTENT, "spine/sheet.json"), "utf8"));
  assert.ok(sheet.subjects, "content/spine/sheet.json has no `subjects` block");
  assert.equal(sheet.subjects.rootId, "n-atlas");
  assert.equal(sheet.subjects.zoneRoot, "n-cluster1");
  assert.deepEqual(sheet.subjects.landIds, ["n-cluster1"]);
  assert.deepEqual(sheet.subjects.seaIds, ["n-westsea"]);
  assert.deepEqual(sheet.subjects.terrainPatchIds, ["n-eastern-hills"]);
  assert.deepEqual(sheet.subjects.mireIds, ["n-saltmire"]);
  assert.deepEqual(sheet.subjects.featureIds, {
    coast: "f-west-coast", river: "f-the-meltwash", iceEdge: "f-northern-ice-edge",
  });
});

test("resolveWorld reads subjects from the descriptor and still reproduces the mirror", () => {
  const { spine, tree } = realTree();
  const { doc, problems } = resolveWorld({ spine, tree, descriptor: spine.sheet.subjects });
  assert.deepEqual(problems, []);
  assert.equal(canonStringify(doc) + "\n", readFileSync(MIRROR, "utf8"));
});

test("resolveWorld with a descriptor naming a node that does not exist REPORTS with the pinned message", () => {
  const { spine, tree } = realTree();
  const bad = { ...spine.sheet.subjects, mireIds: ["n-not-a-node"] };
  const { doc, problems } = resolveWorld({ spine, tree, descriptor: bad });
  assert.equal(doc, null);
  assert.ok(problems.includes('sheet: subject "mireIds[0]" -> "n-not-a-node" does not resolve'), JSON.stringify(problems));
});

test("resolveWorld with a descriptor naming a feature that does not exist REPORTS", () => {
  const { spine, tree } = realTree();
  const bad = { ...spine.sheet.subjects, featureIds: { ...spine.sheet.subjects.featureIds, river: "f-nope" } };
  const { problems } = resolveWorld({ spine, tree, descriptor: bad });
  assert.ok(problems.includes('sheet: subject "river" -> "f-nope" does not resolve'), JSON.stringify(problems));
});

test("R3: a region under zoneRoot with NO lore.order now FAILS instead of vanishing", () => {
  const { spine, tree } = realTree();
  const victim = (tree.childrenOf.get("n-cluster1") ?? [])
    .map((i) => tree.byId.get(i))
    .find((n) => n.tier === "region" && !["n-saltmire", "n-eastern-hills"].includes(n.id));
  assert.ok(victim, "no eligible region found in the committed spine");
  tree.byId.set(victim.id, { ...victim, lore: { ...victim.lore, order: undefined } });
  const { doc, problems } = resolveWorld({ spine, tree, descriptor: spine.sheet.subjects });
  assert.equal(doc, null);
  assert.ok(
    problems.some((p) => p.includes(victim.id) && p.includes("lore.order")),
    `expected a lore.order problem naming ${victim.id}, got ${JSON.stringify(problems)}`,
  );
});

test("the DEFAULT_SUBJECTS constant is gone — the descriptor is the only source", async () => {
  const mod = await import("../lib/places.mjs");
  assert.equal(mod.DEFAULT_SUBJECTS, undefined,
    "DEFAULT_SUBJECTS still exists: two sources of subject ids means two ways for a sheet to break");
});
```

Delete the bogus first import line above once you have read it — it exists only to make the intent explicit and will not resolve. The real assertion is the last test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/tests/places.test.mjs 2>&1 | tail -10`

Expected: FAIL — `content/spine/sheet.json has no \`subjects\` block`, plus `Cannot read properties of undefined (reading 'rootId')` in the descriptor tests, plus the `DEFAULT_SUBJECTS` test failing because the constant is still exported.

- [ ] **Step 3: Add the descriptor to `content/spine/sheet.json`**

Append to the existing object (after `"withheld"`), keeping the file's two-space indentation:

```json
  "subjects": {
    "rootId": "n-atlas",
    "zoneRoot": "n-cluster1",
    "landIds": ["n-cluster1"],
    "seaIds": ["n-westsea"],
    "terrainPatchIds": ["n-eastern-hills"],
    "mireIds": ["n-saltmire"],
    "featureIds": {
      "coast": "f-west-coast",
      "river": "f-the-meltwash",
      "iceEdge": "f-northern-ice-edge"
    }
  }
```

**Note:** `content/spine/sheet.json` is copied into the emitted world document as `doc.sheet` (`places.mjs`'s last key, `sheet: spine.sheet`). Adding `subjects` therefore **does** change the emitted mirror's bytes, and the committed sheet SVGs' `<desc>` block does not include it. Run `node scripts/check_spine_emit.mjs --check` immediately and expect **DRIFT on `maps/cluster1-geography.json` only**; regenerate with `--write` in Step 5 and confirm the two SVGs are unaffected. This is the one place in Plan A where a committed content byte legitimately changes, it changes exactly one file, and it is reviewable as one added block.

- [ ] **Step 4: Read the descriptor in `places.mjs`**

Three edits:

(a) Delete the `DEFAULT_SUBJECTS` export block entirely.

(b) Replace the `const S = descriptor ?? DEFAULT_SUBJECTS;` line and the `fabric/civil` guard with:

```js
  const S = descriptor ?? spine?.sheet?.subjects ?? null;
  if (!S) {
    problems.push("sheet: content/spine/sheet.json has no `subjects` descriptor — the sheet's subject ids are DATA, not code");
    return { doc: null, problems };
  }
  if (fabric !== null || civil !== null)
    problems.push("resolveWorld: fabric/civil joins are Plan D — this build resolves from the spine only");
```

(c) Replace the region scoping (`const regions = kids(S.zoneRoot).filter(…)`) with:

```js
  // R3: enumerate ALL region children of zoneRoot. The old
  // `.filter(n => n.lore?.order != null)` SILENTLY DROPPED any region without
  // the field — with a null-check scaled to 160 regions, a region ceases to
  // exist with every gate green. A missing order inside this scope is now a
  // FAIL. Byte-identical today: all 12 committed children carry one.
  const scoped = kids(S.zoneRoot).filter((n) => n.tier === "region");
  for (const r of scoped)
    if (r.lore?.order == null)
      problems.push(`sheet: region "${r.id}" under "${S.zoneRoot}" has no lore.order — a region without an order is dropped silently, which is how a region ceases to exist with every gate green`);
  if (problems.length) return { doc: null, problems };
  const regions = [...scoped].sort((a, b) => a.lore.order - b.lore.order);
```

(d) In `loadPlaces`, replace `tree.byId.has(DEFAULT_SUBJECTS.zoneRoot)` with:

```js
      const zoneRoot = spine.sheet?.subjects?.zoneRoot;
      if (tree.errors.length === 0 && zoneRoot && tree.byId.has(zoneRoot))
        return resolveWorld({ spine, tree });
```

- [ ] **Step 5: Regenerate the mirror and run everything**

Run:
```bash
node scripts/check_spine_emit.mjs --check ; echo "exit $?"
node scripts/check_spine_emit.mjs --write
git diff --stat
node --test scripts/tests/places.test.mjs 2>&1 | tail -6
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
npm test --prefix scripts 2>&1 | tail -8
node scripts/check_content.mjs --require-complete 2>&1 | tail -1
(cd colyseus-server && npm test -- mapDimensions 2>&1 | tail -5)
```
Expected: the first command exits 1 with `spine-emit: DRIFT …/maps/cluster1-geography.json` and **that path only**; `--write` rewrites it; `git diff --stat` shows exactly two changed files (`content/spine/sheet.json` and `content/maps/cluster1-geography.json`) and **no SVG, no node file, no `mapDimensions.ts`**; every suite `fail 0`.

- [ ] **Step 6: Add the red fixture for a broken descriptor**

Create `scripts/tests/fixtures/spine/g-sheet-subject-missing/spine/sheet.json` — a copy of the base fixture's sheet file (or a minimal one if the base has none) whose `subjects.mireIds` names a node that does not exist. Then append to `scripts/tests/spine-gates.test.mjs`:

```js
t11("sheet subjects: a descriptor naming a missing node REPORTS, never a raw TypeError", () => {
  const dir = spineFixture({ overlayDir: "g-sheet-subject-missing" });
  const r = runEmit(dir, ["--check"]);
  assert11.equal(r.code, 1);
  assert11.doesNotMatch(r.out, /TypeError/);
  assert11.match(r.out, /does not resolve/);
});
```

If the base fixture has no `n-cluster1`, `collectOutputs` skips the geography emit entirely and this test proves nothing — in that case build the fixture on top of `realSpineCopy()` instead, overwriting only `spine/sheet.json`. Read `scripts/tests/fixtures/spine/base/spine/` and choose before writing the test; state which you chose in the phase report.

- [ ] **Step 7: Commit**

```bash
git add content/spine/sheet.json content/maps/cluster1-geography.json \
        scripts/lib/places.mjs scripts/tests/places.test.mjs \
        scripts/tests/spine-gates.test.mjs scripts/tests/fixtures/spine/g-sheet-subject-missing
git commit -m "refactor: sheet subjects become data; a missing region no longer vanishes"
```

- [ ] **Step 8: QUALITY GATE — verify**

```bash
node scripts/check_spine_emit.mjs --check | tail -1
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
npm test --prefix scripts 2>&1 | tail -8
git diff --stat HEAD~1 -- game-client/ colyseus-server/
git branch --show-current && git log --oneline -1
```
The `git diff --stat HEAD~1 -- game-client/ colyseus-server/` must print **nothing**: the sheets and the generated TypeScript did not move.

- [ ] **Step 9: QUALITY GATE — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`. Brief:

> A hard-coded subject list became a committed descriptor and a silent filter became a failure. Check: (a) that adding `subjects` to `sheet.json` changed exactly ONE emitted artifact and not the SVGs — `git show --stat HEAD` is the evidence; (b) that `resolveWorld` cannot now return a doc whose `zones` array is a *different length* than before for the committed content (count it: it must be 10 — 12 region children minus the mire and the hills); (c) that a descriptor with an EMPTY `mireIds` or `terrainPatchIds` array does not index `[0]` of nothing and throw; (d) that `loadPlaces`'s fallback still fires for a root with a spine but **no** `sheet.json`; (e) whether the new `lore.order` failure could fire on any of the ~45 minimal spine fixtures — run the full `npm test --prefix scripts` and report the count.

Finding (c) is a real gap in the code as written above — `S.mireIds[0]` on an empty array yields `undefined` and `node()` will report `"undefined" does not resolve`, which is a report rather than a throw but a poor message. Decide whether to harden it.

- [ ] **Step 10: QUALITY GATE — refactor and re-verify**

Fix findings as new commits. Re-run Step 8.

---
### Task 8: De-hardcode the second sheet adapter

Spec §9.2 step 3, second half, and correction **C2**: *"a second adapter exists — both sheets break, not one."* `tools/mapforge/lib/atlas-sheet.mjs` spells `n-atlas` / `n-cluster1` / `n-westsea` at `:41-43,46`, `f-west-coast` / `f-the-meltwash` at `:55-58`, and an `id !== "n-cluster1" && id !== "n-westsea"` child filter at `:125`. It already reports rather than throws (`:44-51`), so this task is narrower than Task 7's: it moves the ids into the sheet's own descriptor so a redraw that renames the basin does not need a code edit.

**Files:**
- Modify: `content/spine/sheet-atlas.json` (add `subjects`)
- Modify: `tools/mapforge/lib/atlas-sheet.mjs:36-58`, `:112-115`, `:121-125`
- Modify: `tools/mapforge/tests/atlas-sheet.test.mjs` (append)

**Interfaces:**
- Consumes: the `subjects` descriptor shape defined by Task 7.
- Produces: `drawAtlasSheet({ spine, tree, sheet })` unchanged in signature; it now reads `sheet.subjects` instead of literals. `buildAtlasSheet({ repoRoot })` unchanged.

The atlas sheet's descriptor differs from the basin's in exactly one field — `landIds` and `seaIds` are the *basin pair drawn as a miniature*, and everything else under `rootId` is drawn by the F-043 wider-world block, which is precisely what the `:125` filter expresses. So the filter becomes `n.parentId === S.rootId && !S.landIds.includes(n.id) && !S.seaIds.includes(n.id)`.

- [ ] **Step 1: Write the failing test**

Append to `tools/mapforge/tests/atlas-sheet.test.mjs`:

```js
// ── Plan A Task 8: the second adapter's ids are DATA ───────────────────────
test("sheet-atlas.json carries the subjects descriptor", () => {
  const sheet = JSON.parse(readFileSync(join(ROOT, "content/spine/sheet-atlas.json"), "utf8"));
  assert.ok(sheet.subjects, "content/spine/sheet-atlas.json has no `subjects` block");
  assert.equal(sheet.subjects.rootId, "n-atlas");
  assert.deepEqual(sheet.subjects.landIds, ["n-cluster1"]);
  assert.deepEqual(sheet.subjects.seaIds, ["n-westsea"]);
  assert.deepEqual(sheet.subjects.featureIds, {
    coast: "f-west-coast", river: "f-the-meltwash", iceEdge: "f-northern-ice-edge",
  });
});

test("the atlas adapter names no spine id in its source — every id comes from the descriptor", () => {
  const src = readFileSync(join(ROOT, "tools/mapforge/lib/atlas-sheet.mjs"), "utf8");
  // Comments and problem-message templates are allowed to name ids; CODE is
  // not. Strip line comments, then look for quoted spine ids.
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  for (const id of ["n-cluster1", "n-westsea", "f-west-coast", "f-the-meltwash"]) {
    assert.ok(
      !code.includes(`"${id}"`) && !code.includes(`'${id}'`),
      `atlas-sheet.mjs still hard-codes "${id}" — a redraw that renames it needs a code edit`,
    );
  }
});

test("a descriptor naming a missing land node REPORTS and returns an empty svg, never throws", () => {
  const spine = loadSpine({ contentRoot: join(ROOT, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const sheet = JSON.parse(readFileSync(join(ROOT, "content/spine/sheet-atlas.json"), "utf8"));
  const bad = { ...sheet, subjects: { ...sheet.subjects, landIds: ["n-not-a-node"] } };
  const { svg, problems } = drawAtlasSheet({ spine, tree, sheet: bad });
  assert.equal(svg, "");
  assert.ok(problems.some((p) => p.includes("n-not-a-node")), JSON.stringify(problems));
});

test("dropping the mire from the tree no longer crashes the atlas sheet (correction C2)", () => {
  const spine = loadSpine({ contentRoot: join(ROOT, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const sheet = JSON.parse(readFileSync(join(ROOT, "content/spine/sheet-atlas.json"), "utf8"));
  tree.byId.delete("n-saltmire");
  // Must not throw. It may or may not report — the atlas sheet does not draw
  // the mire — but a raw TypeError is the failure mode this task removes.
  assert.doesNotThrow(() => drawAtlasSheet({ spine, tree, sheet }));
});
```

Add `drawAtlasSheet` to that file's import from `../lib/atlas-sheet.mjs`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/mapforge/tests/atlas-sheet.test.mjs 2>&1 | tail -10`

Expected: FAIL — `content/spine/sheet-atlas.json has no \`subjects\` block`, and `atlas-sheet.mjs still hard-codes "n-cluster1"`.

- [ ] **Step 3: Add the descriptor to `content/spine/sheet-atlas.json`**

Append after `"withheld"`:

```json
  "subjects": {
    "rootId": "n-atlas",
    "zoneRoot": "n-cluster1",
    "landIds": ["n-cluster1"],
    "seaIds": ["n-westsea"],
    "terrainPatchIds": ["n-eastern-hills"],
    "mireIds": ["n-saltmire"],
    "featureIds": {
      "coast": "f-west-coast",
      "river": "f-the-meltwash",
      "iceEdge": "f-northern-ice-edge"
    }
  }
```

**`sheet-atlas.json` is NOT copied into any emitted artifact** (only `sheet.json` is, via `doc.sheet`), but it *is* read by `buildAtlasSheet` and its `withheld` list is lettered onto the chart. Adding a key that nothing letters does not change the SVG — `node scripts/check_render_lock.mjs`/`check_map_render.mjs` in Step 5 is the proof.

- [ ] **Step 4: Read the descriptor in `atlas-sheet.mjs`**

Replace `:36-58` with:

```js
export function drawAtlasSheet({ spine, tree, sheet }) {
  const problems = [];
  const notes = [];

  // ---- data joins — everything drawn is looked up here ---------------------
  // Plan A Task 8: subject ids come from content/spine/sheet-atlas.json's
  // `subjects` block, never from literals here. Correction C2: this file was
  // the SECOND hard-coded adapter — dropping n-cluster1 or n-westsea used to
  // reach `.title` / `.features` on undefined and take the sheet down with a
  // raw TypeError. Same descriptor shape scripts/lib/places.mjs reads.
  const S = sheet?.subjects;
  if (!S) {
    problems.push("sheet-atlas.json has no `subjects` descriptor — the sheet's subject ids are DATA, not code");
    return { svg: "", notes, problems };
  }

  const need = (key, id) => {
    const n = tree.byId.get(id);
    if (!n) problems.push(`sheet: subject "${key}" -> "${id}" does not resolve`);
    return n ?? null;
  };
  const atlas = need("rootId", S.rootId);
  const cluster = need("landIds[0]", S.landIds[0]);
  const westsea = need("seaIds[0]", S.seaIds[0]);
  if (!atlas || !cluster || !westsea) return { svg: "", notes, problems };

  const [EXT_W, EXT_H] = atlas.interior.size; // atlas-km
  const feature = (id) => (cluster.features ?? []).find((f) => f.id === id);
  const coast = feature(S.featureIds.coast);
  const river = feature(S.featureIds.river);
  if (!coast) problems.push(`sheet: subject "coast" -> "${S.featureIds.coast}" does not resolve`);
  if (!river) problems.push(`sheet: subject "river" -> "${S.featureIds.river}" does not resolve`);
```

Then update the three label strings at `:95`, `:112-115` to interpolate the ids rather than spell them:

```js
      problems.push(`town ${t.id} at [${at}] is outside the ${cluster.id} polygon`);
```
```js
  checkFrame(`${cluster.id} polygon`, cluster.placement.points);
  checkFrame(`${westsea.id} polygon`, westsea.placement.points);
  if (coast) checkFrame(S.featureIds.coast, coast.points);
  if (river) checkFrame(S.featureIds.river, river.points);
```

And the child filter at `:123-125`:

```js
  // ---- F-043: the wider world — tier-1 children of the root beyond the ------
  // basin pair (landIds/seaIds are already joined above). Sorted by id for
  // determinism, same rule the basin block's town list uses.
  const worldChildren = [...tree.byId.values()]
    .filter((n) => n.parentId === S.rootId
      && !S.landIds.includes(n.id)
      && !S.seaIds.includes(n.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
```

**These `checkFrame` label strings appear in `problems[]`, not in the SVG** — verify that with `grep -n "checkFrame" tools/mapforge/lib/atlas-sheet.mjs` before editing. If any of them reaches the drawn output, the interpolation changes bytes and the label must stay literal.

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
node scripts/check_map_render.mjs
node tools/mapforge/render-sheet.mjs --sheet atlas --no-png --check
node tools/mapforge/render-sheet.mjs --sheet cluster1 --no-png --check
git diff --stat game-client/ content/maps/ colyseus-server/
```
Expected: `fail 0`; `check-map-render: check clean, 2 sheets`; both `--check: no files written, no drift`; **no diff** — the SVGs did not move.

- [ ] **Step 6: Commit**

```bash
git add content/spine/sheet-atlas.json tools/mapforge/lib/atlas-sheet.mjs \
        tools/mapforge/tests/atlas-sheet.test.mjs
git commit -m "refactor: atlas sheet subjects come from the descriptor"
```

- [ ] **Step 7: QUALITY GATE — verify**

```bash
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
node scripts/check_map_render.mjs
node scripts/check_content.mjs --require-complete 2>&1 | tail -1
(cd colyseus-server && npm test -- mapDimensions 2>&1 | tail -5)
git diff --stat HEAD~1 -- game-client/
git branch --show-current && git log --oneline -1
```

- [ ] **Step 8: QUALITY GATE — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`. Brief:

> A renderer's hard-coded node ids became descriptor lookups. The bug class is **a string that used to reach the SVG and now interpolates differently**. Check: (a) every string you changed — does it end up in `problems[]` only, or can it reach `put(...)`? Trace each one; (b) the `worldChildren` filter — with `landIds`/`seaIds` as arrays, is the resulting child set byte-identical to the old two-`!==` version for the committed spine? Count it (expected 9: 11 children minus the basin pair); (c) does the sheet still report when `S.landIds` is an empty array rather than indexing `[0]` of nothing; (d) confirm the `svg` returned on the descriptor-missing path is `""` and that `check_map_render.mjs`'s `built.problems.length` branch handles it (it `continue`s, so an empty svg is never compared — verify).

- [ ] **Step 9: QUALITY GATE — refactor and re-verify**

Fix findings as new commits. Re-run Step 7.

---

### Task 9: Re-point the spine-alias sweep

Spec §9.2 step 4, and coupling **X4**. `checkSpineExternalAliases` (`scripts/check_content.mjs:1416-1528`) resolves five families against `n-<slug>` spine nodes: 116 bestiary rows across 9 region slugs, 10 story regions, 6 `art:town-*` manifest keys, 10 zone files, 1 town plan. It conflicts directly with "the spine shrinks to a 36-node trunk": once regions leave `content/spine/nodes/`, every one of these breaks.

Plan A does **not** shrink the trunk — Plan E does. What Plan A owes is the *second resolution path*, landed and tested now, so that Plan E's redraw is a data change rather than a gate rewrite. The spine lookup stays **primary**, so on today's content the printed lines are byte-identical and the second path never fires; a fixture proves it fires when the spine lookup misses.

**Files:**
- Modify: `scripts/check_content.mjs:1416-1528`
- Modify: `scripts/tests/spine-gates.test.mjs` (append one red and one green fixture test)

**Interfaces:**
- Consumes: `loadPlaces({ contentRoot }): { doc, problems }` from Task 5.
- Produces: no new exports. The printed line grows one alternative form: `spine-alias: <label> → <slug> (resolved-zone)` / `(resolved-town)` for records that resolve through the world document rather than the spine. The failure message changes to name both attempts:
  `spine-alias: bestiary.json region "<slug>": neither n-<slug> (spine) nor "<slug>" (resolved world) exists`

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/spine-gates.test.mjs`, in the G-ALIAS section (after the existing `aliasContentCopy` tests):

```js
// ─── Plan A Task 9: the alias sweep's second resolution path ───────────────
// X4: 116 bestiary rows + 10 story regions + 6 art:town keys + 10 zone files
// + 1 town plan all resolve against `n-<slug>` spine nodes today. Plan E's
// 36-node trunk removes region and town tiers from content/spine/nodes/, so
// the sweep needs a path through the resolved world document. Landed HERE,
// with the spine path still PRIMARY, so today's output is byte-identical.
t11("alias sweep: today's output resolves entirely through the spine (no resolved-* lines)", () => {
  const r = runGate(join(ROOT, "content"));
  assert11.equal(r.code, 0, r.stdout);
  assert11.match(r.stdout, /spine-alias: bestiary\.json region "millcross" ×\d+ → n-millcross \(region\)/);
  assert11.doesNotMatch(r.stdout, /\(resolved-zone\)/);
  assert11.doesNotMatch(r.stdout, /\(resolved-town\)/);
});

t11("alias sweep: a slug with NO spine node resolves through the world document instead", () => {
  const dir = aliasContentCopy();
  // Remove a region NODE while leaving every reference to it in place. Before
  // this task that is an immediate FAIL; after it, the resolved world (which
  // still carries the zone) answers instead.
  const victim = "n-thornveil";
  rmSync(join(dir, "content/spine/nodes", `${victim}.json`));
  const r = runAliasGate(dir);
  // The tree loses a node, so OTHER gates go red (G-TREE, G-CONTAIN, the two
  // representsNodeId pointers). This test asserts ONLY that the alias sweep
  // itself no longer contributes a "is not a spine node" failure for thornveil.
  assert11.doesNotMatch(r.out, /spine-alias: bestiary\.json region "thornveil": /);
});

t11("alias sweep: a slug in NEITHER source names both attempts in one message", () => {
  const dir = aliasContentCopy();
  const bestiary = join(dir, "content/bestiary/bestiary.json");
  const rows = JSON.parse(read11(bestiary, "utf8"));
  rows[0].region = "nowhereshire";
  write11(bestiary, JSON.stringify(rows, null, 2) + "\n");
  const r = runAliasGate(dir);
  assert11.equal(r.code, 1);
  assert11.match(r.out, /spine-alias: bestiary\.json region "nowhereshire": neither n-nowhereshire \(spine\) nor "nowhereshire" \(resolved world\) exists/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/tests/spine-gates.test.mjs 2>&1 | grep -E "alias sweep|pass |fail "`

Expected: FAIL — the second test fails because removing `n-thornveil` still produces `spine-alias: bestiary.json region "thornveil": n-thornveil is not a spine node`; the third fails because the message is still the old single-attempt form.

- [ ] **Step 3: Add the second resolution path**

In `scripts/check_content.mjs`, inside `checkSpineExternalAliases`, replace the resolver helpers (`:1420-1424`) with:

```js
  const spine = loadSpine({ contentRoot: opts.contentRoot });
  if (!spine.present) return;
  const byId = new Map(spine.nodes.map((n) => [n.id, n]));

  // Plan A Task 9 (X4): the SECOND resolution path. The spine lookup stays
  // PRIMARY — today every one of the 143 references resolves through it and
  // the printed lines are byte-identical. Plan E's 36-node trunk moves region
  // and town tiers out of content/spine/nodes/ entirely; at that point the
  // resolved world document is the only place a zone slug exists, and this
  // path is what stops 143 references going red in the redraw commit.
  // loadPlaces() soft-skips a root with neither source (doc null), so a
  // fixture with no spine and no mirror behaves exactly as before.
  const world = loadPlaces({ contentRoot: opts.contentRoot }).doc;
  const resolvedZones = new Set((world?.zones ?? []).map((z) => z.id));
  const resolvedTowns = new Set((world?.towns ?? []).map((t) => t.id));

  const say = (label, node) => console.log(`spine-alias: ${label} → ${node.id} (${node.tier})`);
  const sayResolved = (label, slug, kind) => console.log(`spine-alias: ${label} → ${slug} (resolved-${kind})`);
  const slugNode = (slug) => byId.get(`n-${slug}`) ?? null;
  const townNode = (slug) =>
    [byId.get(`n-${slug}`), byId.get(`n-${slug}-town`)].find((n) => n && n.tier === "town") ?? null;
```

Then, at each of the four `report(...)` sites that fail on an unresolved slug, add the fallback before reporting. The bestiary-region site (`:1455-1461`) becomes:

```js
      for (const [slug, n] of [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const node = slugNode(slug);
        if (node) { say(`bestiary.json region "${slug}" ×${n}`, node); continue; }
        if (resolvedZones.has(slug)) { sayResolved(`bestiary.json region "${slug}" ×${n}`, slug, "zone"); continue; }
        report(`spine-alias: bestiary.json region "${slug}": neither n-${slug} (spine) nor "${slug}" (resolved world) exists`);
      }
```

The placement-zone site (`:1465-1472`):

```js
      const node = slugNode(slug);
      if (node) { say(`bestiary/${f}`, node); continue; }
      if (resolvedZones.has(slug)) { sayResolved(`bestiary/${f}`, slug, "zone"); continue; }
      report(`spine-alias: bestiary/${f}: zone "${slug}": neither n-${slug} (spine) nor "${slug}" (resolved world) exists`);
```

The `art:town-*` site (`:1521-1526`):

```js
      const node = townNode(slug);
      if (node) { say(`art-manifest ${key}`, node); continue; }
      if (resolvedTowns.has(slug)) { sayResolved(`art-manifest ${key}`, slug, "town"); continue; }
      report(`spine-alias: art-manifest ${key}: neither a town-tier spine node n-${slug} / n-${slug}-town nor "${slug}" (resolved world) exists`);
```

**Leave families (1), (2) and (4) alone** — zone files, town plans and character `links.story` join on an explicit `spineId` field, not on a slug convention. Those are Plan E's problem (the field's *value* changes) and no second path helps them; adding one would be scope drift.

**One message string changes:** the `art:town-*` failure at `:1523` is regexed by `scripts/tests/spine-gates.test.mjs:880`. Update that assertion in the same commit to the new text.

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
node --test scripts/tests/spine-gates.test.mjs 2>&1 | tail -8
node scripts/check_content.mjs --require-complete 2>&1 | grep -c "spine-alias:"
node scripts/check_content.mjs --require-complete 2>&1 | tail -1
```
Expected: `fail 0`; the `spine-alias:` line count is **unchanged from before this task** (record it in Step 2's phase notes and compare); `0 failures`.

- [ ] **Step 5: Commit**

```bash
git add scripts/check_content.mjs scripts/tests/spine-gates.test.mjs
git commit -m "feat: alias sweep resolves through the world document when the spine misses"
```

- [ ] **Step 6: QUALITY GATE — verify**

```bash
node --test scripts/tests/spine-gates.test.mjs 2>&1 | tail -6
npm test --prefix scripts 2>&1 | tail -8
node scripts/check_content.mjs --require-complete 2>&1 | tail -1
(cd colyseus-server && npm test -- mapDimensions 2>&1 | tail -5)
git branch --show-current && git log --oneline -1
```

- [ ] **Step 7: QUALITY GATE — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`. Brief:

> A gate gained a fallback path, which is the classic way to *weaken* a gate by accident. Check: (a) can the fallback make a genuinely-dangling reference pass? Specifically, is `resolvedZones` ever populated from a source that is itself derived from the same bestiary/manifest data (it must not be — it comes from the spine or the mirror only); (b) `loadPlaces` is now called a fourth time per full gate run — does it re-read and re-parse the spine each time, and is that acceptable inside Gate 1's ~4 s budget? Measure `time node scripts/check_content.mjs --only=spine` before and after; (c) does the alias sweep's `loadSpine` call plus `loadPlaces`'s internal `loadSpine` mean the spine is now parsed twice in this function alone; (d) confirm the printed `spine-alias:` line count on real content is identical to `git stash`ed HEAD~1.

Finding (b)/(c) is expected to be real. The remedy, if the measurement warrants it, is to pass the already-loaded `spine`/`tree` into `resolveWorld` rather than calling `loadPlaces` — decide and write the decision down.

- [ ] **Step 8: QUALITY GATE — refactor and re-verify**

Fix findings as new commits. Re-run Step 6.

---
### Task 10: The render lock

`tools/mapforge/tests/fixtures/basin-baseline.svg` is **47,020 bytes byte-identical to `game-client/assets/art/maps/cluster1-world.svg`**, read by three tests and rasterised by a fourth. At 2 sheets that is one redundant copy; at Plan B's ≤ 16 sheets it is sixteen, and every redraw touches 32 files where 16 changed. This task replaces the whole scheme with one committed checksum file plus a unified diff on mismatch — because a checksum says *that* something changed, not *what*, and the mitigation must ship in the same commit.

The lock also becomes the sheets' **review surface** in the asset-storybook: each Map Sheets card shows its locked short hash, so a reviewer can see at a glance which sheet the lock is pinning. Wiring that in is part of this task's acceptance criteria, not a follow-up.

**Files:**
- Create: `scripts/lib/render-lock.mjs`
- Create: `scripts/check_render_lock.mjs`
- Create: `content/world/render-lock.json`
- Create: `scripts/tests/render-lock.test.mjs`
- Create: `tools/asset-storybook/tests/render-lock-index.test.mjs`
- Modify: `tools/asset-storybook/js/state.mjs` (add `RENDER_LOCK_URL`)
- Modify: `tools/asset-storybook/js/maps.mjs` (`loadIndex` gains a lock fetch; each card gains a hash line)

**Interfaces:**
- Consumes: `SHEETS` from `tools/mapforge/render-sheet.mjs` (with `title` / `maxLabelRank` from Task 6).
- Produces:
  ```js
  export function computeLock({ repoRoot, sheets, extraPaths = [] }):
    { version: 2, generator: { name: "mapforge", version: string }, artifacts: Record<string,string> }
  export function checkLock({ committed, computed }):
    { drift: string[], missing: string[], extra: string[] }
  export function unifiedDiff({ a, b, maxLines = 40 }): string
  export const GENERATOR_VERSION: string   // defined here ONLY until Plan B Task 9
                                           // Step 3b replaces it with a re-export from
                                           // tools/mapforge/lib/version.mjs. Two live
                                           // definitions is the failure the constant exists
                                           // to prevent, so B owns deleting this one.
  ```
  Artifact values are `"sha256:<hex>"`; keys are repo-relative paths. `extraPaths` entries are hashed **from disk**; sheet entries are hashed from the **built** bytes, which is what makes the lock a drift gate rather than a file inventory.
- Failure string, pinned: `G-RENDER-LOCK: <path> sha256 <got> != locked <want>`, followed by a ≤ 40-line unified diff.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/render-lock.test.mjs`:

```js
// Plan A Task 10 — the checksum lock that replaces five byte comparisons.
//
// The honest cost of a checksum is that it says THAT something changed, not
// WHAT. unifiedDiff is the mitigation and it ships here, in the same file, so
// the two can never separate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeLock, checkLock, unifiedDiff, GENERATOR_VERSION } from "../lib/render-lock.mjs";
import { SHEETS } from "../../tools/mapforge/render-sheet.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LOCK_PATH = join(ROOT, "content/world/render-lock.json");
const sha = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");

test("computeLock hashes every sheet's BUILT bytes, keyed by repo-relative outSvg", () => {
  const lock = computeLock({ repoRoot: ROOT, sheets: SHEETS });
  assert.equal(lock.version, 2);
  assert.deepEqual(lock.generator, { name: "mapforge", version: GENERATOR_VERSION });
  for (const sheet of Object.values(SHEETS)) {
    const got = lock.artifacts[sheet.outSvg];
    assert.match(got ?? "", /^sha256:[0-9a-f]{64}$/, `no lock entry for ${sheet.outSvg}`);
    assert.equal(got, sha(sheet.build({ repoRoot: ROOT }).svg));
  }
});

test("computeLock hashes extraPaths from DISK (the growth point for Plan C's fabric)", () => {
  const dir = mkdtempSync(join(tmpdir(), "lock-extra-"));
  try {
    writeFileSync(join(dir, "thing.json"), "hello\n");
    const lock = computeLock({ repoRoot: dir, sheets: {}, extraPaths: ["thing.json"] });
    assert.equal(lock.artifacts["thing.json"], sha("hello\n"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the committed lock matches what the sheets build right now", () => {
  const committed = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
  const computed = computeLock({ repoRoot: ROOT, sheets: SHEETS });
  assert.deepEqual(checkLock({ committed: committed.artifacts, computed: computed.artifacts }),
    { drift: [], missing: [], extra: [] });
});

test("checkLock separates drift, missing and extra — three different mistakes", () => {
  const r = checkLock({
    committed: { a: "sha256:1", b: "sha256:2", gone: "sha256:3" },
    computed: { a: "sha256:1", b: "sha256:CHANGED", added: "sha256:4" },
  });
  assert.deepEqual(r, { drift: ["b"], missing: ["gone"], extra: ["added"] });
});

test("unifiedDiff shows the changed region with a hunk header and respects maxLines", () => {
  const a = ["one", "two", "three", "four", "five"].join("\n");
  const b = ["one", "two", "THREE", "four", "five"].join("\n");
  const d = unifiedDiff({ a, b });
  assert.match(d, /^@@ -3,1 \+3,1 @@$/m);
  assert.match(d, /^-three$/m);
  assert.match(d, /^\+THREE$/m);
});

test("unifiedDiff on identical input is the empty string", () => {
  assert.equal(unifiedDiff({ a: "x\ny\n", b: "x\ny\n" }), "");
});

test("unifiedDiff truncates and says so", () => {
  const a = Array.from({ length: 500 }, (_, i) => `a${i}`).join("\n");
  const b = Array.from({ length: 500 }, (_, i) => `b${i}`).join("\n");
  const d = unifiedDiff({ a, b, maxLines: 10 });
  assert.ok(d.split("\n").length <= 12, `diff is ${d.split("\n").length} lines`);
  assert.match(d, /truncated/);
});

test("the CLI --check exits 0 today and 1 on a tampered lock", () => {
  const { execFileSync } = require("node:child_process");
  const CLI = join(ROOT, "scripts/check_render_lock.mjs");
  execFileSync(process.execPath, [CLI, "--check"], { encoding: "utf8" }); // throws on non-zero
  const original = readFileSync(LOCK_PATH, "utf8");
  try {
    const doc = JSON.parse(original);
    const firstKey = Object.keys(doc.artifacts)[0];
    doc.artifacts[firstKey] = "sha256:" + "0".repeat(64);
    writeFileSync(LOCK_PATH, JSON.stringify(doc, null, 2) + "\n");
    let failed = false, out = "";
    try { execFileSync(process.execPath, [CLI, "--check"], { encoding: "utf8" }); }
    catch (e) { failed = true; out = `${e.stdout ?? ""}${e.stderr ?? ""}`; }
    assert.ok(failed, "--check exited 0 on a tampered lock");
    assert.match(out, /G-RENDER-LOCK: .+ sha256 sha256:[0-9a-f]{64} != locked sha256:0{64}/);
  } finally {
    writeFileSync(LOCK_PATH, original);
  }
});

test("the CLI --check catches a STALE committed svg, not just a stale lock", () => {
  const { execFileSync } = require("node:child_process");
  const CLI = join(ROOT, "scripts/check_render_lock.mjs");
  const svgPath = join(ROOT, SHEETS.cluster1.outSvg);
  const original = readFileSync(svgPath, "utf8");
  try {
    writeFileSync(svgPath, original.slice(0, Math.floor(original.length / 2)));
    let failed = false, out = "";
    try { execFileSync(process.execPath, [CLI, "--check"], { encoding: "utf8" }); }
    catch (e) { failed = true; out = `${e.stdout ?? ""}${e.stderr ?? ""}`; }
    assert.ok(failed, "--check exited 0 on a truncated committed svg");
    assert.match(out, /@@ /, "no unified diff was printed — the checksum's whole mitigation");
  } finally {
    // Self-healing: restore from the file we read, never `git checkout --`,
    // which is exactly the parity.test.mjs footgun this plan removes.
    writeFileSync(svgPath, original);
  }
});
```

Replace the two `require("node:child_process")` calls with a top-level `import { execFileSync } from "node:child_process";` — `require` is not available in an ESM module. (Written that way above only to keep each test self-describing; fix it when you create the file.)

Create `tools/asset-storybook/tests/render-lock-index.test.mjs`:

```js
// Plan A Task 10 — the lock's review surface.
//
// "Every produced artifact must be observable in a review surface" (owner
// rule, 2026-08-15). content/world/render-lock.json is an artifact this plan
// produces; the Maps tab is where it becomes visible. This gate is the
// mechanical half — a sheet with no lock row shows a blank hash on its card.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SHEETS } from "../../mapforge/render-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const lock = JSON.parse(readFileSync(join(REPO_ROOT, "content/world/render-lock.json"), "utf8"));

test("every SHEETS outSvg has a lock row", () => {
  for (const [id, sheet] of Object.entries(SHEETS))
    assert.match(lock.artifacts[sheet.outSvg] ?? "", /^sha256:[0-9a-f]{64}$/,
      `sheet "${id}" (${sheet.outSvg}) has no row in content/world/render-lock.json`);
});

test("the Maps tab reads the lock URL from state.mjs", () => {
  const state = readFileSync(join(HERE, "../js/state.mjs"), "utf8");
  assert.match(state, /RENDER_LOCK_URL\s*=\s*.*render-lock\.json/);
  const maps = readFileSync(join(HERE, "../js/maps.mjs"), "utf8");
  assert.match(maps, /RENDER_LOCK_URL/, "maps.mjs does not read the lock — the artifact is unobservable");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
node --test scripts/tests/render-lock.test.mjs
node --test tools/asset-storybook/tests/render-lock-index.test.mjs
```
Expected: FAIL — `Cannot find module '.../scripts/lib/render-lock.mjs'` and `ENOENT … content/world/render-lock.json`.

- [ ] **Step 3: Create `scripts/lib/render-lock.mjs`**

```js
// Plan A Task 10 — the checksum lock (G-RENDER-LOCK).
//
// Replaces G-MAP-DRIFT and absorbs four other byte-for-byte comparison
// points. One gate, one file, ONE CHANGED LINE per changed artifact — instead
// of a 47,020-byte fixture that is a byte-identical duplicate of a file
// already in the repo, read by three tests and rasterised by a fourth.
//
// The honest cost: a checksum says THAT something changed, not WHAT. The
// mitigation ships in the same module — unifiedDiff() — because the two must
// never be separable.
//
// Pure apart from readFileSync on extraPaths. Never throws.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

// Bump when the RENDERER's output format changes for reasons other than
// content — it is recorded in the lock so a re-baseline caused by a tool
// change is distinguishable from one caused by a world change. Plan B moves
// this constant to tools/mapforge/lib/version.mjs and imports it here.
export const GENERATOR_VERSION = "3.0.0";

const sha256 = (text) => "sha256:" + createHash("sha256").update(text, "utf8").digest("hex");

export function computeLock({ repoRoot, sheets, extraPaths = [] }) {
  const artifacts = {};
  // Sorted so the committed file's key order is a function of the data alone.
  for (const id of Object.keys(sheets).sort()) {
    const sheet = sheets[id];
    const built = sheet.build({ repoRoot });
    // A sheet with build problems has no meaningful bytes to lock. Recording
    // a hash of "" here would make the lock GREEN on a broken renderer, which
    // is the one outcome a drift gate must never produce.
    if (built.problems.length) continue;
    artifacts[sheet.outSvg] = sha256(built.svg);
  }
  for (const p of [...extraPaths].sort()) {
    let text = null;
    try { text = readFileSync(join(repoRoot, p), "utf8"); } catch { /* missing = absent from the lock */ }
    if (text !== null) artifacts[p] = sha256(text);
  }
  return { version: 2, generator: { name: "mapforge", version: GENERATOR_VERSION }, artifacts };
}

// Three different mistakes, reported separately: drift (the artifact changed),
// missing (the lock names something that no longer builds — a deleted sheet
// whose lock row survived), extra (something builds that the lock does not
// name — a new sheet nobody baselined).
export function checkLock({ committed, computed }) {
  const drift = [], missing = [], extra = [];
  for (const k of Object.keys(committed).sort()) {
    if (!(k in computed)) missing.push(k);
    else if (committed[k] !== computed[k]) drift.push(k);
  }
  for (const k of Object.keys(computed).sort()) if (!(k in committed)) extra.push(k);
  return { drift, missing, extra };
}

// A deliberately simple diff: trim the common prefix and suffix, then print
// the remaining old lines as `-` and the remaining new lines as `+`. This is
// NOT Myers — it will not find an interior match inside a changed region, and
// it is not supposed to. It exists so a lock mismatch tells a reviewer WHERE
// to look in ~40 lines, and a real investigation uses `git diff`.
export function unifiedDiff({ a, b, maxLines = 40 }) {
  if (a === b) return "";
  const A = a.split("\n"), B = b.split("\n");
  let head = 0;
  while (head < A.length && head < B.length && A[head] === B[head]) head++;
  let tail = 0;
  while (tail < A.length - head && tail < B.length - head &&
         A[A.length - 1 - tail] === B[B.length - 1 - tail]) tail++;
  const aMid = A.slice(head, A.length - tail);
  const bMid = B.slice(head, B.length - tail);
  const out = [`@@ -${head + 1},${aMid.length} +${head + 1},${bMid.length} @@`];
  let budget = maxLines;
  let truncated = false;
  for (const line of aMid) {
    if (budget-- <= 0) { truncated = true; break; }
    out.push(`-${line}`);
  }
  for (const line of bMid) {
    if (budget-- <= 0) { truncated = true; break; }
    out.push(`+${line}`);
  }
  if (truncated) out.push(`… truncated at ${maxLines} lines (${aMid.length} removed, ${bMid.length} added)`);
  return out.join("\n");
}
```

- [ ] **Step 4: Create `scripts/check_render_lock.mjs`**

```js
#!/usr/bin/env node
// Plan A Task 10 — G-RENDER-LOCK CLI.
//
// --check  rebuild every SHEETS entry, hash it, and assert BOTH that the hash
//          matches content/world/render-lock.json AND that the committed SVG
//          on disk is that same artifact. The first catches a stale lock; the
//          second catches a stale committed sheet — which is what
//          scripts/check_map_render.mjs used to do and this absorbs.
// --write  re-baseline the lock. Does NOT write the SVGs: re-rendering is
//          `node tools/mapforge/render-sheet.mjs --sheet <id>`, and keeping
//          the two commands separate is what makes a re-baseline a decision.
//
// main() guarded by import.meta.url, same pattern as check_spine_emit.mjs:277.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SHEETS } from "../tools/mapforge/render-sheet.mjs";
import { computeLock, checkLock, unifiedDiff } from "./lib/render-lock.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK_PATH = join(ROOT, "content/world/render-lock.json");

function readLock() {
  try { return JSON.parse(readFileSync(LOCK_PATH, "utf8")); }
  catch { return null; }
}

function main() {
  const argv = process.argv.slice(2);
  let mode = "check";
  for (const arg of argv) {
    if (arg === "--check") mode = "check";
    else if (arg === "--write") mode = "write";
    else { console.error(`check-render-lock: unknown arg ${arg}`); process.exit(2); }
  }

  // Build once; both modes need the same bytes.
  const built = {};
  const problems = [];
  for (const [id, sheet] of Object.entries(SHEETS)) {
    const r = sheet.build({ repoRoot: ROOT });
    if (r.problems.length) problems.push(...r.problems.map((p) => `${id}: ${p}`));
    else built[sheet.outSvg] = r.svg;
  }
  if (problems.length) {
    for (const p of problems) console.error(`check-render-lock: PROBLEM: ${p}`);
    process.exit(1);
  }

  const computed = computeLock({ repoRoot: ROOT, sheets: SHEETS });

  if (mode === "write") {
    mkdirSync(dirname(LOCK_PATH), { recursive: true });
    writeFileSync(LOCK_PATH, JSON.stringify(computed, null, 2) + "\n");
    console.log(`check-render-lock: wrote ${Object.keys(computed.artifacts).length} artifact hashes to content/world/render-lock.json`);
    process.exit(0);
  }

  const committed = readLock();
  if (!committed) {
    console.error("G-RENDER-LOCK: content/world/render-lock.json is missing — baseline it with `node scripts/check_render_lock.mjs --write`");
    process.exit(1);
  }

  let bad = 0;
  const { drift, missing, extra } = checkLock({ committed: committed.artifacts, computed: computed.artifacts });
  for (const path of drift) {
    console.error(`G-RENDER-LOCK: ${path} sha256 ${computed.artifacts[path]} != locked ${committed.artifacts[path]}`);
    let onDisk = "";
    try { onDisk = readFileSync(join(ROOT, path), "utf8"); } catch { /* missing */ }
    const d = unifiedDiff({ a: onDisk, b: built[path] ?? "" });
    if (d) console.error(d);
    bad++;
  }
  for (const path of missing) { console.error(`G-RENDER-LOCK: ${path} is locked but nothing builds it any more`); bad++; }
  for (const path of extra) { console.error(`G-RENDER-LOCK: ${path} builds but has no lock row — baseline it with --write`); bad++; }

  // Second assertion: the COMMITTED file must be the artifact the lock names.
  // A green lock over a stale committed SVG is exactly what check_map_render.mjs
  // existed to prevent, and dropping it would be a coverage regression.
  for (const [path, svg] of Object.entries(built)) {
    let onDisk = null;
    try { onDisk = readFileSync(join(ROOT, path), "utf8"); } catch { /* missing = stale */ }
    if (onDisk === svg) continue;
    console.error(`G-RENDER-LOCK: ${path} on disk is not the artifact it builds to — re-render with \`node tools/mapforge/render-sheet.mjs --sheet <id>\``);
    const d = unifiedDiff({ a: onDisk ?? "", b: svg });
    if (d) console.error(d);
    bad++;
  }

  if (bad) process.exit(1);
  console.log(`check-render-lock: check clean, ${Object.keys(computed.artifacts).length} artifacts`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 5: Baseline the lock**

Run: `node scripts/check_render_lock.mjs --write && cat content/world/render-lock.json`

Expected: a two-artifact file. Then `node scripts/check_render_lock.mjs --check` → `check-render-lock: check clean, 2 artifacts`.

- [ ] **Step 6: Wire the lock into the storybook**

In `tools/asset-storybook/js/state.mjs`, beside `MAPS_INDEX_URL` (`:94`):

```js
// Plan A Task 10: the render lock is an artifact this repo produces, so it is
// observable here — each Map Sheets card shows the sha256 the gate pins.
export const RENDER_LOCK_URL = "../../content/world/render-lock.json";
```

In `tools/asset-storybook/js/maps.mjs`, add the import and a loader beside `loadIndex`:

```js
import { MAPS_CLASS, MAPS_INDEX_URL, RENDER_LOCK_URL, REPO_ROOT_REL } from "./state.mjs";

// Same defensive shape as loadIndex(): a missing or unreadable lock disables
// the hash line, it never takes the Maps section down.
async function loadLock() {
  try {
    const res = await fetch(RENDER_LOCK_URL);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const doc = await res.json();
    return doc.artifacts ?? {};
  } catch (err) {
    console.warn("[asset-storybook] render-lock.json unavailable — sheet hashes hidden:", err);
    return {};
  }
}
```

In `mountMaps`, change `const sheets = await loadIndex();` to also load the lock, and add a hash line to each card's `meta` block after the `noteP` block:

```js
  const lock = await loadLock();
  …
    const locked = lock[sheet.svg];
    const hashP = document.createElement("p");
    hashP.className = "filename";
    hashP.textContent = locked
      ? "locked " + locked.replace(/^sha256:/, "").slice(0, 12)
      : "NOT LOCKED — no row in content/world/render-lock.json";
    meta.appendChild(hashP);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run:
```bash
node --test scripts/tests/render-lock.test.mjs 2>&1 | tail -6
node --test 'tools/asset-storybook/tests/*.test.mjs' 2>&1 | tail -6
node scripts/check_render_lock.mjs --check
node scripts/check_map_render.mjs
git status --short
```
Expected: both suites `fail 0`; the lock check clean; the old `check_map_render.mjs` **also** still clean (it is not deleted until Task 12 — running both is the proof they agree); `git status --short` shows only the intended new/modified files and **no modified SVG**.

- [ ] **Step 8: See the storybook — the artifact must be observable, not just committed**

Run:
```bash
(cd tools/asset-storybook && python3 -m http.server 6007) &
sleep 2 && curl -s -o /dev/null -w "%{http_code} %{url_effective}\n" -L http://localhost:6007/
open -a "Google Chrome" "http://localhost:6007/#section-map-sheets"
```
Confirm **by looking** that both Map Sheets cards show a `locked <12 hex chars>` line. Kill the server afterwards. **Check for a stale server on 6007 first** (`lsof -ti:6007`) — a leftover process from an earlier session has previously made a new tab look missing.

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/render-lock.mjs scripts/check_render_lock.mjs \
        content/world/render-lock.json scripts/tests/render-lock.test.mjs \
        tools/asset-storybook/tests/render-lock-index.test.mjs \
        tools/asset-storybook/js/state.mjs tools/asset-storybook/js/maps.mjs
git commit -m "feat: G-RENDER-LOCK checksum lock with unified diff on mismatch"
```

- [ ] **Step 10: QUALITY GATE — verify**

```bash
node scripts/check_render_lock.mjs --check
node --test scripts/tests/render-lock.test.mjs 2>&1 | tail -6
node --test 'tools/asset-storybook/tests/*.test.mjs' 2>&1 | tail -6
./scripts/precheck.sh --no-install 2>&1 | tail -20
git branch --show-current && git log --oneline -1
```

- [ ] **Step 11: QUALITY GATE — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`. Brief:

> A checksum gate replaced byte comparisons. The dangerous outcome is a lock that is green while an artifact is wrong. Check: (a) `computeLock` `continue`s past a sheet with build problems — does the CLI still fail in that case, or can a broken renderer produce a green `--check`? Trace both `--check` and `--write`; (b) can `--write` be run on a broken renderer and silently drop a sheet from the lock, so the next `--check` reports `missing` instead of the real problem?; (c) the two `render-lock.test.mjs` tests that mutate real committed files — do they restore correctly if the assertion throws, and do they use `writeFileSync` rather than `git checkout --` (they must; `git checkout --` is the parity footgun); (d) does `unifiedDiff` handle one side being the empty string, a file with no trailing newline, and a file that is a strict prefix of the other; (e) is `content/world/` covered by any `.gitignore` rule (`git check-ignore -v content/world/render-lock.json` must print nothing).

- [ ] **Step 12: QUALITY GATE — refactor and re-verify**

Fix findings as new commits. Re-run Step 10.

---
### Task 11: Disarm the parity footgun and shrink the raster fixture

Two independent hazards, both in `tools/mapforge/tests/`, both fixed **before** Task 12 deletes anything.

**The footgun.** `tools/mapforge/tests/parity.test.mjs:14-16` executes `render-map.mjs` **into the tracked** `game-client/assets/art/maps/cluster1-world.svg`, then runs `git checkout -- <that file>`. `scripts/integration.sh` runs `map_render_drift` *before* `mapforge_tests`, so during a redraw the suite silently reverts a freshly regenerated, uncommitted sheet mid-Gate-2. Spec §9.2 is explicit: fix this **first or delete the test first** — it is live in this worktree today.

**The cost.** `raster.test.mjs:11` rasterises the 47 KB `basin-baseline.svg` at the default 2000 px, measured at **12.13 s** — the second-largest single item in the mapforge suite, and a consumer of a fixture Task 12 deletes.

**Files:**
- Modify: `tools/mapforge/tests/parity.test.mjs`
- Create: `tools/mapforge/tests/fixtures/raster-probe.svg`
- Modify: `tools/mapforge/tests/raster.test.mjs`

**Interfaces:**
- Consumes: `rasterize({ svgPath, pngPath, width = 2000, background })` from `tools/mapforge/lib/raster.mjs`.
- Produces: nothing new. This task only removes a destructive side effect and a cost.

- [ ] **Step 1: Write the failing test**

Append to `tools/mapforge/tests/raster.test.mjs`:

```js
// Plan A Task 11: no test in this directory may write into the tracked tree.
// parity.test.mjs used to render into game-client/assets/art/maps/
// cluster1-world.svg and then `git checkout --` it, which silently discards a
// freshly regenerated uncommitted sheet mid-Gate-2 (integration.sh runs
// map_render_drift BEFORE mapforge_tests). This asserts the whole directory
// is clean of both idioms, so the hazard cannot come back under a new name.
import { readdirSync } from "node:fs";

test("no mapforge test writes into game-client/ or calls `git checkout --`", () => {
  const dir = resolve(HERE);
  const offenders = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".test.mjs"))) {
    const src = readFileSync(join(dir, f), "utf8");
    if (/git["'\s,]+.*checkout/.test(src)) offenders.push(`${f}: calls git checkout`);
    if (/game-client\/assets\/art\/maps/.test(src) && /writeFileSync|execFileSync|spawnSync/.test(src))
      offenders.push(`${f}: writes into the tracked maps directory`);
  }
  assert.deepEqual(offenders, []);
});

test("the raster fixture is small — the 47 KB baseline cost 12.13 s at 2000 px", () => {
  const size = statSync(resolve(HERE, "fixtures/raster-probe.svg")).size;
  assert.ok(size < 5120, `raster-probe.svg is ${size} bytes, budget 5120`);
});
```

Add `readFileSync` and `join` to that file's imports if they are not already there.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/mapforge/tests/raster.test.mjs 2>&1 | tail -10`

Expected: FAIL — `offenders` contains `parity.test.mjs: calls git checkout` and `parity.test.mjs: writes into the tracked maps directory`; and `ENOENT … fixtures/raster-probe.svg`.

- [ ] **Step 3: Disarm `parity.test.mjs`**

Replace the whole file with a version that renders to a **temp directory** and never touches the tracked tree. `render-map.mjs` has no output-path flag, so the temp root becomes the repo root of a throwaway tree: copy only what it reads (`content/maps/cluster1-geography.json`) plus the tool itself is read from the real repo by absolute path, and the output path is derived from `REPO_ROOT` inside the script — which means the CLI genuinely cannot be redirected. Therefore the honest fix is to stop using the CLI and call the library directly:

```js
// Plan A Task 11: this test used to run the render-map.mjs CLI, which writes
// into the TRACKED game-client/assets/art/maps/cluster1-world.svg, and then
// `git checkout --`ed it. integration.sh runs map_render_drift BEFORE this
// suite, so during a redraw it silently reverted a freshly regenerated,
// uncommitted sheet mid-Gate-2. render-map.mjs derives its output path from
// its own location and offers no --out flag, so the CLI cannot be redirected:
// the fix is to assert on the LIBRARY, which is what the CLI is a thin shell
// around. Task 12 deletes this file entirely along with render-map.mjs and
// the baseline fixture; it is fixed first so the hazard cannot survive a
// half-done deletion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drawBasinSheet } from "../lib/basin-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const FIXTURE = join(HERE, "fixtures/basin-baseline.svg");

test("the mirror-driven draw reproduces the baseline byte-for-byte (no file writes)", () => {
  const doc = JSON.parse(readFileSync(join(ROOT, "content/maps/cluster1-geography.json"), "utf8"));
  const { svg, problems } = drawBasinSheet({ doc });
  assert.deepEqual(problems, []);
  assert.equal(svg, readFileSync(FIXTURE, "utf8"));
});
```

- [ ] **Step 4: Create the small raster fixture**

Create `tools/mapforge/tests/fixtures/raster-probe.svg` — a deliberately tiny sheet that still exercises the two things `rasterize()` can get wrong (a `url(#…)` pattern fill, and text with a `font-family` that must not fall back silently):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <desc>Plan A Task 11 — rasteriser probe. Deliberately small (the 47 KB
  basin-baseline.svg cost 12.13 s at 2000 px). Exercises a pattern fill, a
  stroked path and a text run, which is everything rasterize() can drop.</desc>
  <defs>
    <pattern id="pProbe" width="7" height="7" patternUnits="userSpaceOnUse">
      <path d="M0,7 L7,0" stroke="#8a7250" stroke-width="0.45" fill="none"/>
    </pattern>
  </defs>
  <rect x="0" y="0" width="400" height="300" fill="#f3e7ce"/>
  <rect x="20" y="20" width="160" height="120" fill="url(#pProbe)" stroke="#2b2118" stroke-width="1.2"/>
  <path d="M200,40 C240,80 280,60 360,120" stroke="#2b2118" stroke-width="1.6" fill="none"/>
  <circle cx="120" cy="200" r="6" fill="#2b2118"/>
  <text x="20" y="260" font-family="Georgia, serif" font-size="16" fill="#2b2118">raster probe</text>
  <text x="20" y="284" font-family="Georgia, serif" font-size="11" fill="#5a4a36">pattern · stroke · glyph</text>
</svg>
```

- [ ] **Step 5: Re-point `raster.test.mjs`**

Change the fixture constant and pin the width:

```js
// Plan A Task 11: was fixtures/basin-baseline.svg at the default 2000 px —
// 12.13 s, and a consumer of a 47 KB fixture that is a byte-identical
// duplicate of a committed file. raster-probe.svg is < 5 KB at 500 px and
// still carries a pattern fill, a stroke and two text runs, which is
// everything rsvg-convert can silently drop.
const FIXTURE_SVG = resolve(HERE, "fixtures/raster-probe.svg");
```

and in the first test's `rasterize(...)` call add `width: 500`:

```js
    const result = rasterize({ svgPath: FIXTURE_SVG, pngPath, width: 500 });
```

- [ ] **Step 6: Run the tests to verify they pass, and measure**

Run:
```bash
{ time node --test tools/mapforge/tests/raster.test.mjs ; } 2>&1 | tail -8
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
git status --short game-client/
```
Expected: `fail 0`; the raster suite drops from ~12 s to ~1 s (record both numbers); `git status --short game-client/` prints **nothing** — running the suite no longer touches the tracked tree. Run the suite twice in a row and confirm it is still nothing.

- [ ] **Step 7: Commit**

```bash
git add tools/mapforge/tests/parity.test.mjs tools/mapforge/tests/raster.test.mjs \
        tools/mapforge/tests/fixtures/raster-probe.svg
git commit -m "fix: no mapforge test writes into the tracked tree; small raster fixture"
```

- [ ] **Step 8: QUALITY GATE — verify**

```bash
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
git status --short
./scripts/integration.sh --no-install 2>&1 | tail -25
git branch --show-current && git log --oneline -1
```
The Gate 2 run here is the point: it is the harness whose ordering made the footgun dangerous, and this is the first commit where running it cannot revert a sheet.

- [ ] **Step 9: QUALITY GATE — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`. Brief:

> A test that mutated the working tree was rewritten and a fixture was replaced. Check: (a) that `scripts/tests/check_map_render.test.mjs` still uses `git checkout --` — it does, and it is deleted in Task 12; confirm that it is the ONLY remaining instance repo-wide (`grep -rn 'checkout' --include='*.test.mjs' .`) and say so; (b) that the rewritten `parity.test.mjs` still asserts something the other two baseline tests do not (it reads the MIRROR FILE; `render-sheet.test.mjs` reads the SPINE — that difference is the whole point of a parity test and must survive until Task 12 removes both); (c) that `raster-probe.svg` actually rasterises non-trivially — check the produced PNG is more than a few hundred bytes, not a blank canvas; (d) whether the new "no test writes into game-client/" guard has false positives on a test that merely mentions the path in a string.

- [ ] **Step 10: QUALITY GATE — refactor and re-verify**

Fix findings as new commits. Re-run Step 8.

---

### Task 12: Prove green, then retire the legacy lane

Spec §9.2 steps 5 and 6, in that order and no other. **Step 5 first: prove the whole thing green with the mirror still committed and unread.** Only then delete.

This task is deliberately two commits: a proof commit that changes nothing, and a deletion commit. If the proof is not green, the deletion does not happen and the phase report says so.

**Files:**
- Delete: `content/maps/cluster1-geography.json`, `tools/mapforge/render-map.mjs`, `tools/mapforge/tests/parity.test.mjs`, `tools/mapforge/tests/fixtures/basin-baseline.svg`, `scripts/check_map_render.mjs`, `scripts/tests/check_map_render.test.mjs`
- Modify: `tools/mapforge/tests/basin-sheet.test.mjs:10-12,14-21` (doc source + the baseline test)
- Modify: `tools/mapforge/tests/render-sheet.test.mjs:11-18` (the baseline test)
- Modify: `scripts/tests/spine-gates.test.mjs:752-762` (the emitted-mirror count)
- Modify: `scripts/integration.sh:87-89,98-107,122-123` (the emit comment, the two doomed function definitions, their two `run_section` lines)
- Modify: `.github/workflows/ci.yml:113-120` (the `Map render drift-gate (G-MAP-DRIFT)` step)
- Modify: `game-client/assets/art/art-manifest.json:494,514` (the two `note` strings)
- Modify: `tools/mapforge/README.md:24-36,70-73,118` (the mirror section, the legacy command block, the mirror schema heading)

**Interfaces:**
- Consumes: `computeLock`, `checkLock` from Task 10; `loadPlaces` from Task 5.
- Produces: `collectOutputs` emits **46** files, not 47. `integration.sh` and `ci.yml` both run `check_render_lock.mjs --check`.
- **Produces, and owns exclusively: the three new CI steps** — `Render lock (G-RENDER-LOCK)`, `Mapforge test suite` and `Sheet self-check (render-sheet --check)` are added to `.github/workflows/ci.yml` **once, here, in Step 5**. Plan B Task 12 must *verify their presence*, not re-add them: two identically named workflow steps would double the mapforge suite's CI time and make a failure ambiguous about which copy reddened.

- [ ] **Step 1: Prove green with the mirror still committed and unread**

Add a temporary guard proving nothing reads the mirror file any more, then run everything. Append to `scripts/tests/places.test.mjs`:

```js
test("STEP 5 PROOF: nothing outside the emitter reads the legacy mirror FILE", () => {
  // The gate joins, both sheet builders and the alias sweep all resolve from
  // the spine now. The only remaining writer is check_spine_emit.mjs's
  // collectOutputs, and the only remaining reader is render-map.mjs — both
  // deleted in the next commit. Anything ELSE naming the path is a consumer
  // this plan missed, and deleting the file would break it silently.
  const allowed = new Set([
    "scripts/check_spine_emit.mjs",
    "tools/mapforge/render-map.mjs",
    "tools/mapforge/tests/parity.test.mjs",
    "tools/mapforge/lib/basin-sheet.mjs",   // a comment only
    "tools/mapforge/README.md",
    "scripts/lib/places.mjs",               // the fallback branch
    "scripts/integration.sh",               // a comment only
    "scripts/tests/places.test.mjs",
    "scripts/tests/zone-content.test.mjs",  // fixture roots write their own
    "scripts/tests/town-plan.test.mjs",
    "scripts/tests/bestiary-placement.test.mjs",
    "content/zones/zone-cindervast.json",   // a provenance `source` string
    "content/spine/nodes/n-saltmire.json",  // a provenance `source` string
    "game-client/assets/art/art-manifest.json", // a note string
  ]);
  const out = execFileSync("git", ["grep", "-l", "cluster1-geography"], { cwd: ROOT, encoding: "utf8" });
  const unexpected = out.split("\n").filter(Boolean)
    .filter((p) => !allowed.has(p) && !p.startsWith(".claude/") && !p.startsWith("docs/")
                   && p !== "content/maps/cluster1-geography.json"
                   && p !== "game-client/assets/art/maps/cluster1-world.svg"
                   && p !== "tools/mapforge/tests/fixtures/basin-baseline.svg");
  assert.deepEqual(unexpected, [], "an unlisted file still names the legacy mirror");
});
```

Then run the **whole** proof:

```bash
node scripts/check_content.mjs --require-complete 2>&1 | tail -1
node scripts/check_spine_emit.mjs --check | tail -1
node scripts/check_render_lock.mjs --check
node scripts/check_map_render.mjs
node tools/mapforge/render-sheet.mjs --sheet cluster1 --no-png --check
node tools/mapforge/render-sheet.mjs --sheet atlas --no-png --check
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
node --test 'tools/asset-storybook/tests/*.test.mjs' 2>&1 | tail -6
npm test --prefix scripts 2>&1 | tail -8
(cd colyseus-server && npm test 2>&1 | tail -6)
./scripts/integration.sh --no-install 2>&1 | tail -25
git status --short
```

Expected: **all green, and `git status --short` shows nothing modified** — no re-baseline anywhere. That is the migration invariant (spec §9.1): *for every commit before the redraw, all six byte comparisons stay green without being re-baselined.* Paste every line into the phase report.

**One extra assertion this deletion owes, added by Task 9's review.** Task 9 gave the alias sweep a second resolution path through `placesDoc()`, and `loadPlaces` falls THROUGH to `content/maps/cluster1-geography.json` for any root whose spine carries no `subjects` descriptor. That means that between Task 9 and this deletion, a slug present in NEITHER the spine nor the spine-derived world can still be answered by the stale committed mirror, with no diagnostic (reproduced: strip the `subjects` key from a copied root, rename `n-thornveil` -> `n-thornveil-zone`, and the sweep prints `→ thornveil (resolved-zone)` off the mirror; `rm` the mirror and the same root goes red). Deleting the mirror closes that path. **After the deletion, re-run one unresolvable-slug fixture and confirm the alias sweep is RED, not green** — a green run there would mean the mirror was never what answered and some other stale source is.

Commit the proof:
```bash
git add scripts/tests/places.test.mjs
git commit -m "test: prove the legacy mirror has no remaining readers"
```

**If anything is red, stop here.** The deletion below is the only irreversible-feeling step in Plan A (it is a `git revert` away, so it is R1 not R0, but it is the step that makes a mistake expensive to notice).

- [ ] **Step 2: Write the failing test for the post-deletion state**

Modify `tools/mapforge/tests/basin-sheet.test.mjs` — replace the baseline comparison in the first test (`:14-21`) with a lock-hash assertion, and re-point the doc source (`:10-12`, which reads the deleted mirror):

```js
import { createHash } from "node:crypto";
import { loadSpine, buildTree } from "../../../scripts/lib/spine.mjs";
import { resolveWorld } from "../../../scripts/lib/places.mjs";

// Plan A Task 12: the doc came from content/maps/cluster1-geography.json,
// which no longer exists. The four behavioural tests below are unchanged and
// still mutate this doc — resolveWorld returns a fresh object each call, so
// structuredClone is still the right tool.
const { doc } = resolveWorld((() => {
  const spine = loadSpine({ contentRoot: join(ROOT, "content") });
  return { spine, tree: buildTree({ nodes: spine.nodes, rootIds: spine.roots }) };
})());

test("drawBasinSheet matches the committed render lock", () => {
  // Was: a byte comparison against fixtures/basin-baseline.svg — 47,020 bytes
  // byte-identical to game-client/assets/art/maps/cluster1-world.svg, one of
  // three consumers of one redundant copy. Now: one line in one lock file.
  const { svg, problems } = drawBasinSheet({ doc });
  assert.deepEqual(problems, []);
  const lock = JSON.parse(readFileSync(join(ROOT, "content/world/render-lock.json"), "utf8"));
  assert.equal(
    "sha256:" + createHash("sha256").update(svg, "utf8").digest("hex"),
    lock.artifacts["game-client/assets/art/maps/cluster1-world.svg"],
  );
});
```

Modify `tools/mapforge/tests/render-sheet.test.mjs:11-18` the same way — the test title changes because it no longer names a baseline:

```js
test("the spine-driven cluster1 sheet matches the committed render lock", () => {
  const { svg, problems } = buildCluster1Sheet({ repoRoot: ROOT });
  assert.deepEqual(problems, []);
  const lock = JSON.parse(readFileSync(join(ROOT, "content/world/render-lock.json"), "utf8"));
  assert.equal(
    "sha256:" + createHash("sha256").update(svg, "utf8").digest("hex"),
    lock.artifacts["game-client/assets/art/maps/cluster1-world.svg"],
  );
});
```

Modify `scripts/tests/spine-gates.test.mjs:752-762` — the emitted-file count (the `nodeFiles + 3` assertion is `:758`, the three-mirror loop `:759-761`):

```js
test("spine-emit emits every node file plus BOTH surviving mirrors — a silently dropped mirror reds", () => {
  const contentRoot = join(ROOT, "content");
  const { outputs, errors } = collectOutputs({ contentRoot });
  assert.equal(errors, undefined, JSON.stringify(errors));
  const paths = outputs.map((o) => o.path);
  const nodeFiles = readdirSync(join(contentRoot, "spine/nodes")).filter((f) => f.endsWith(".json")).length;
  // Plan A Task 12: 3 -> 2. The geography mirror was retired once every
  // consumer moved to scripts/lib/places.mjs; the two RUNTIME-facing mirrors
  // stay, and mapDimensions.ts is compiled server code (X1).
  assert.equal(outputs.length, nodeFiles + 2, paths.join("\n"));
  for (const suffix of ["maps/atlas-frontier.md",
                        "colyseus-server/src/config/generated/mapDimensions.ts"])
    assert.ok(paths.some((p) => p.endsWith(suffix)), `missing mirror ${suffix} in:\n${paths.join("\n")}`);
  assert.ok(!paths.some((p) => p.endsWith("cluster1-geography.json")),
    "the retired geography mirror is being emitted again");
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:
```bash
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -8
node --test scripts/tests/spine-gates.test.mjs 2>&1 | grep -E "three mirrors|BOTH surviving|fail "
```
Expected: FAIL — the spine-gates mirror test fails with `47 !== 46`; the two lock-hash tests should pass already (the lock is correct), which is fine.

- [ ] **Step 4: Delete the legacy lane**

```bash
git rm content/maps/cluster1-geography.json
git rm tools/mapforge/render-map.mjs
git rm tools/mapforge/tests/parity.test.mjs
git rm tools/mapforge/tests/fixtures/basin-baseline.svg
git rm scripts/check_map_render.mjs
git rm scripts/tests/check_map_render.test.mjs
```

Then remove the geography emit from `scripts/check_spine_emit.mjs`'s `collectOutputs` — delete the `if (tree.byId.has("n-cluster1")) { … }` block (Task 5's edited version) and the now-unused `emitGeography` function and its `resolveWorld` import. Leave the `GEOGRAPHY_VERSION` re-export: `content/zones/zone-cindervast.json` and `content/spine/nodes/n-saltmire.json` still name the document in provenance strings, and Plan D's resolved files inherit the version number.

- [ ] **Step 5: Update the three harnesses**

`scripts/integration.sh` — delete the `mapforge_check` and `map_render_drift` function definitions (`:98-107`) and their two `run_section` lines (`:122-123`); add:

```bash
# Plan A: G-RENDER-LOCK replaces both `render-map.mjs --check` (which was
# never a byte comparison — it only ran the problems[] self-check) and
# check_map_render.mjs. One gate, one committed hash per artifact, with a
# unified diff printed on mismatch.
render_lock() { node "$REPO_ROOT/scripts/check_render_lock.mjs" --check; }
```
and the matching `run_section "content: render lock (G-RENDER-LOCK)" render_lock` in the same position the two deleted sections occupied — **before** `mapforge_tests`, so a stale sheet is reported before the suite that depends on it.

Also update the `spine_emit_drift` comment at `:87-89`, which names the deleted mirror.

`.github/workflows/ci.yml` — replace the "Map render drift-gate (G-MAP-DRIFT)" step (`:113-120`) with:

```yaml
      # Render lock (Plan A G-RENDER-LOCK): every sheet in
      # tools/mapforge/render-sheet.mjs's SHEETS registry is rebuilt from the
      # live spine, hashed, and compared against content/world/render-lock.json
      # AND against the committed SVG on disk. Replaces G-MAP-DRIFT.
      - name: Render lock (G-RENDER-LOCK)
        run: node scripts/check_render_lock.mjs --check

      # X6: CI ran NEITHER the mapforge tests NOR render-sheet --check, so five
      # of six byte comparisons were Gate-2-only (local). That is the wrong
      # place for them once the map lane is the feature under active
      # development.
      #
      # SHELL-EXPANDED FILE LIST, UNQUOTED — this is NOT the quoted form used in
      # the local verify commands. ci.yml:34 pins node-version: 18, and Node's
      # own `--test <glob-pattern>` support only arrived in v22. Quoting here
      # would hand Node 18 the literal string "tools/mapforge/tests/*.test.mjs"
      # as a path: the step would either error on a nonexistent file or, worse,
      # run zero tests and go green while proving nothing. The working form is
      # the one scripts/integration.sh:112 and scripts/package.json:6 already
      # use — let the shell expand it.
      - name: Mapforge test suite
        run: node --test tools/mapforge/tests/*.test.mjs

      - name: Sheet self-check (render-sheet --check)
        run: |
          node tools/mapforge/render-sheet.mjs --sheet cluster1 --no-png --check
          node tools/mapforge/render-sheet.mjs --sheet atlas --no-png --check
```

`game-client/assets/art/art-manifest.json` — the two `note` strings at `:494` and `:514` name `tools/mapforge/render-map.mjs` and `content/maps/cluster1-geography.json`. Rewrite both to name `tools/mapforge/render-sheet.mjs` and `content/spine/`. These are prose fields; `check_asset_manifest.mjs`'s thumbnail-freshness guard (U) rehashes **source image bytes**, not notes, so this cannot invalidate a thumb — verify that claim by running the gate in Step 6.

`tools/mapforge/README.md` — delete the generated-mirror paragraph and the "legacy mirror-driven CLI" paragraph (`:24-36`), the three legacy command lines (`:70-73`), and the mirror schema section headed at `:118`.

- [ ] **Step 6: Run everything**

```bash
node scripts/check_spine_emit.mjs --check | tail -1
node scripts/check_render_lock.mjs --check
node scripts/check_content.mjs --require-complete 2>&1 | tail -1
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
node --test 'tools/asset-storybook/tests/*.test.mjs' 2>&1 | tail -6
npm test --prefix scripts 2>&1 | tail -8
node scripts/check_asset_manifest.mjs 2>&1 | tail -5
(cd colyseus-server && npm test 2>&1 | tail -6)
./scripts/precheck.sh --no-install 2>&1 | tail -20
./scripts/integration.sh --no-install 2>&1 | tail -25
git status --short
```
Expected: `spine-emit: check clean, 46 files`; every suite `fail 0`; both gates PASS; `git status --short` shows only the intended deletions and modifications, **no modified SVG and no modified node file**.

Also verify CI's list by reading it back: `grep -n "run:" .github/workflows/ci.yml` — confirm the lock check, the mapforge suite and the two `--check` calls are present and the old map-render step is gone.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: retire the legacy geography mirror and its render lane"
```

- [ ] **Step 8: QUALITY GATE — verify**

```bash
./scripts/precheck.sh --no-install 2>&1 | tail -20
./scripts/integration.sh --no-install 2>&1 | tail -25
git status --short
git branch --show-current && git log --oneline -3
```

- [ ] **Step 9: QUALITY GATE — independent adversarial review**

Fresh reviewer on `git diff HEAD~2` (both commits — the proof and the deletion). Brief:

> Six files were deleted, including a generated content file and a whole CLI. The bug class is **coverage that silently vanished**. Enumerate, for each of the six comparison points listed in this plan's Domain primer, exactly which surviving command now covers it, and name a mutation that would catch a regression there — then actually perform two of those mutations and confirm the gate reddens. Then check: (a) that `basin-sheet.test.mjs`'s four behavioural tests (`town outside its zone`, the `"undefined"` guard, `canonHours`, waystations) survived verbatim and still mutate a doc; (b) that `check_asset_manifest.mjs` is green and the thumb hashes did not move; (c) that `integration.sh`'s section ORDER puts the lock check before the mapforge suite; (d) that no `.md`, `.json` or `.sh` still instructs a reader to run a deleted command — `git grep -n "render-map\|check_map_render"` must return only historical `docs/` and `.claude/` material; (e) that `content/maps/` still contains `atlas-frontier.md` and is not now an empty directory git would drop.

- [ ] **Step 10: QUALITY GATE — refactor and re-verify**

Fix findings as new commits. Re-run Step 8.

---
### Task 13: Make `checkSpine` callable in-process

The heaviest thing in the content lane is not a gate; it is the gate's own test suite. `npm test --prefix scripts` is ~108 s, of which `scripts/tests/spine-gates.test.mjs` alone is **93.3 s across 62 tests**, measured in this worktree. It spawns `check_content.mjs` as a child process **66 times**; seven of those run against the real committed spine and the rest against fixtures where essentially the whole 0.38 s is Node startup plus ajv compile.

Task 2 already removed the overlap cost from those seven. This task removes the **spawn** cost from all of them. Spec §8.6 claims `checkSpine` "is already parameterised" with an injected collector — **it is not**: `check_content.mjs:144-153` has module-level `const failures = []` / `const fail = (m) => failures.push(m)` and `checkSpine(opts, mobTypes)` closes over them. This is a real refactor and it is budgeted as its own task for that reason.

This task is **pure test-harness cost**. It changes no gate semantics and no committed byte. Its acceptance criterion is: the same 62 tests, the same assertions character-for-character, in **under 60 s**.

**Files:**
- Modify: `scripts/check_content.mjs` — the entry point (`:2200`), `finish` (`:2180-2199`), and one new export
- Modify: `scripts/tests/spine-gates.test.mjs` — three helper bodies and one direct-spawn helper

**Interfaces:**
- Produces:
  ```js
  export function summaryLines({ sheetCount, mapCount, storyCount, placementCount,
                                 zoneCount, townCount, nodeCount }): string[]
  export function runSpineGateInProcess({ argv }): { code: number, out: string }
  ```
  `runSpineGateInProcess` supports **`--only=spine` runs only** — the full sweep touches too much module state to reset safely, and the full-sweep call sites (`runAliasGate`, `runEmit`) stay as spawns.

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/spine-gates.test.mjs`:

```js
// ─── Plan A Task 13: in-process gate runs ──────────────────────────────────
// 66 child-process spawns, ~0.38 s each of pure Node startup + ajv compile,
// is 93.3 s of a 108 s content-gate suite. The gate's own tests cost more
// than the gate. These pin the in-process entry's contract: identical
// {code, out} shape, and no state leaking between runs.
const { runSpineGateInProcess } = await import("../check_content.mjs");

t11("in-process: a green fixture returns code 0 and the same summary line as a spawn", () => {
  const dir = spineFixture();
  const inproc = runSpineGateInProcess({ argv: ["--content-root", dir, "--only=spine"] });
  const spawned = (() => {
    try { return { code: 0, out: exec11(process.execPath, [GATE11, "--only=spine", "--content-root", dir], { encoding: "utf8" }) }; }
    catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
  })();
  assert11.equal(inproc.code, spawned.code);
  assert11.equal(inproc.out, spawned.out);
});

t11("in-process: a red fixture returns code 1 and the same output as a spawn", () => {
  const dir = spineFixture({ overlayDir: "g-contain-child-outside" });
  const inproc = runSpineGateInProcess({ argv: ["--content-root", dir, "--only=spine"] });
  const spawned = (() => {
    try { return { code: 0, out: exec11(process.execPath, [GATE11, "--only=spine", "--content-root", dir], { encoding: "utf8" }) }; }
    catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
  })();
  assert11.equal(inproc.code, 1);
  assert11.equal(inproc.out, spawned.out);
});

t11("in-process: failures do NOT leak from one run into the next", () => {
  const red = spineFixture({ overlayDir: "g-contain-child-outside" });
  const green = spineFixture();
  assert11.equal(runSpineGateInProcess({ argv: ["--content-root", red, "--only=spine"] }).code, 1);
  const second = runSpineGateInProcess({ argv: ["--content-root", green, "--only=spine"] });
  assert11.equal(second.code, 0, second.out);
  assert11.doesNotMatch(second.out, /G-CONTAIN/);
});

t11("in-process: importing check_content.mjs does NOT run the gate", () => {
  // Before this task the file ended in a bare `main();` — importing it ran
  // the whole gate against the real content root and called process.exit().
  // The entry guard is what makes every other test in this block possible.
  const src = read11(join11(ROOT11, "scripts/check_content.mjs"), "utf8");
  assert11.match(src, /if \(process\.argv\[1\] && import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href\) main\(\);/);
  assert11.doesNotMatch(src, /^main\(\);$/m);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/tests/spine-gates.test.mjs 2>&1 | grep -E "in-process|fail "`

Expected: FAIL — the top-level `await import("../check_content.mjs")` **runs the whole gate and calls `process.exit()`**, killing the test process. That crash is itself the demonstration of why the entry guard is needed. Node will report the suite as failed with no test results.

- [ ] **Step 3: Add the entry guard and extract the summary**

In `scripts/check_content.mjs`:

(a) add `pathToFileURL` to the `node:url` import on line 8:
```js
import { fileURLToPath, pathToFileURL } from "node:url";
```

(b) replace `finish` (`:2180-2199`) with a split — the formatting, and the printing-and-exiting:

```js
// Plan A Task 13: the summary lines, extracted so the in-process entry below
// emits BYTE-IDENTICAL output to a spawn. Duplicating this format string in
// two places is exactly the drift the gate's own tests would then stop
// catching, so there is one copy and both callers use it.
export function summaryLines({ sheetCount = 0, mapCount = 0, storyCount = 0, placementCount = 0,
                               zoneCount = 0, townCount = 0, nodeCount = 0 }) {
  const lines = [];
  for (const w of warnings) lines.push(`WARN  ${w}`);
  for (const f of failures) lines.push(`FAIL  ${f}`);
  // I-060 design §7: Z5's WARN is an accepted blind spot, so the ratio it
  // measures is printed as its own line. GUARDED — a content root with no
  // zone content has no ratio to report, and `0 of 0` would print a
  // measurement of a thing that was never measured. Three tests pin this.
  if (zoneCount > 0 || zoneHazardsTotal > 0)
    lines.push(`zone-content: ${zoneHazardsUnmapped} of ${zoneHazardsTotal} hazards have no runtime effect`);
  lines.push(`content-gate: ${sheetCount} sheets, ${mapCount} maps, ${storyCount} story, ${placementCount} placements, ${zoneCount} zones, ${townCount} towns, ${nodeCount} nodes, ${failures.length} failures, ${warnings.length} warnings`);
  return lines;
}

function finish(sheetCount = 0, mapCount = 0, storyCount = 0, placementCount = 0, zoneCount = 0, townCount = 0, nodeCount = 0) {
  for (const line of summaryLines({ sheetCount, mapCount, storyCount, placementCount, zoneCount, townCount, nodeCount }))
    console.log(line);
  process.exit(failures.length ? 1 : 0);
}
```

(c) add the in-process entry immediately above the entry guard:

```js
// Plan A Task 13 — the in-process entry, for the gate's own test suite.
//
// scripts/tests/spine-gates.test.mjs spawned check_content.mjs 66 times at
// ~0.38 s of Node startup + ajv compile each; the suite cost 93.3 s of a
// 108 s content lane. This runs the SAME checkSpine() against the SAME
// parsed options and returns the SAME {code, out} a spawn produces.
//
// --only=spine ONLY. The full sweep mutates far more module state (memoised
// town plans, the story loader) and resetting it safely is not worth the
// risk; runAliasGate and runEmit stay as spawns.
//
// console is captured rather than threaded through a collector because every
// gate helper already writes with console.log and rewriting ~40 call sites to
// take an injected sink would be a far larger diff for the same result. The
// swap is restored in a `finally`, so a throw inside checkSpine cannot leave
// the test runner's console broken.
export function runSpineGateInProcess({ argv }) {
  failures.length = 0;
  warnings.length = 0;
  zoneHazardsTotal = 0;
  zoneHazardsUnmapped = 0;
  const captured = [];
  const realLog = console.log, realError = console.error;
  console.log = (...a) => captured.push(a.join(" "));
  console.error = (...a) => captured.push(a.join(" "));
  try {
    const opts = parseArgs(["node", "check_content.mjs", ...argv]);
    if (opts.only !== "spine")
      throw new Error("runSpineGateInProcess supports --only=spine only");
    const mobTypes = loadMobTypes(opts.mobTypes);
    const nodeCount = checkSpine(opts, mobTypes);
    captured.push(...summaryLines({ nodeCount }));
    return { code: failures.length ? 1 : 0, out: captured.join("\n") + "\n" };
  } catch (e) {
    // Gate functions never throw by contract; if one does, surface it the way
    // a spawn would (non-zero exit, the message on the output) rather than
    // taking down the test runner.
    captured.push(`check-content: ${e.stack ?? e.message}`);
    return { code: 1, out: captured.join("\n") + "\n" };
  } finally {
    console.log = realLog;
    console.error = realError;
  }
}
```

(d) replace the final line `main();` with:

```js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

**`zoneHazardsTotal` and `zoneHazardsUnmapped` are declared with `let` at `:148-149`** — confirm that before writing the reset lines; if either is `const`, change the declaration.

- [ ] **Step 4: Convert the three fixture-spawn helpers**

In `scripts/tests/spine-gates.test.mjs`, replace the bodies of `runGate` (`:26-33`), `runSpineGate` (`:222-228`), `p3RunSpineGate` (`:473-480`) and `runP4Gate` (`:644-650`). Keep each helper's **return-property names** exactly as they are — ~50 tests destructure them:

```js
// Plan A Task 13: in-process, not spawned. 66 spawns at ~0.38 s of Node
// startup + ajv compile each was 93.3 s of a 108 s content-gate suite.
export function runGate(contentRoot) {
  const r = runSpineGateInProcess({ argv: ["--content-root", contentRoot, "--only=spine"] });
  return { code: r.code, stdout: r.out };
}
```
```js
function runSpineGate(dir) {
  return runSpineGateInProcess({ argv: ["--content-root", dir, "--only=spine"] }); // {code, out}
}
```
```js
function p3RunSpineGate(root) {
  const r = runSpineGateInProcess({ argv: ["--content-root", root, "--only=spine"] });
  return { status: r.code, out: r.out };
}
```
```js
function runP4Gate(root, extraArgs = []) {
  return runSpineGateInProcess({ argv: ["--only=spine", "--content-root", root, ...extraArgs] }); // {code, out}
}
```

Move the `runSpineGateInProcess` import to a static import at the top of the file, beside the `../lib/spine.mjs` import — the entry guard now makes that safe:

```js
import { runSpineGateInProcess } from "../check_content.mjs";
```

**Leave `runEmit`, `runAliasGate` and `aliasContentCopy` as spawns.** `runEmit` drives a different CLI; `runAliasGate` runs the FULL sweep, which the in-process entry deliberately refuses.

- [ ] **Step 5: Run the tests and measure**

Run:
```bash
{ time node --test scripts/tests/spine-gates.test.mjs ; } 2>&1 | tail -12
{ time npm test --prefix scripts ; } 2>&1 | tail -12
node scripts/check_content.mjs --only=spine | tail -1
git diff --stat content/ game-client/ colyseus-server/
```
Expected: **62 tests, `fail 0`, under 60 s** (baseline 93.3 s; expect roughly 25–40 s once both Task 2 and this land). The whole `scripts` suite should land well under 60 s too. The CLI still prints `44 nodes, 0 failures, 19 warnings`. No content diff.

**If the suite is over 60 s, that is a finding, not a pass.** Report the per-test timings (`node --test` prints them) and name the three slowest.

- [ ] **Step 6: Commit**

```bash
git add scripts/check_content.mjs scripts/tests/spine-gates.test.mjs
git commit -m "perf: run the spine gate in-process in its own test suite"
```

- [ ] **Step 7: QUALITY GATE — verify**

```bash
{ time npm test --prefix scripts ; } 2>&1 | tail -12
node scripts/check_content.mjs --only=spine | tail -1
node scripts/check_content.mjs --require-complete | tail -1
./scripts/precheck.sh --no-install 2>&1 | tail -20
git branch --show-current && git log --oneline -1
```

- [ ] **Step 8: QUALITY GATE — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`. Brief:

> A CLI became importable and its tests stopped spawning it. Two bug classes: **state leaking between in-process runs** (a failure recorded by test 12 showing up in test 13) and **output that is no longer identical to a spawn** (so an assertion that used to pin real behaviour now pins a harness artifact). Check: (a) enumerate EVERY module-level mutable binding in `check_content.mjs` — `failures`, `warnings`, `zoneHazardsTotal`, `zoneHazardsUnmapped`, and any memo caches such as `loadTownPlans`' — and confirm each is either reset by `runSpineGateInProcess` or provably safe across content roots. `loadTownPlans` is memoised: read it and say whether the memo is keyed by content root; (b) confirm the console capture cannot swallow output from an unrelated concurrent test — `node --test` runs files in separate processes but tests within a file may interleave under `--test-concurrency`; check what this repo's invocation does; (c) confirm the entry guard does not break `scripts/precheck.sh` / `integration.sh` / `ci.yml`, all of which invoke the file directly; (d) confirm no assertion in the suite was weakened to make it pass — diff the assertion lines specifically.

Finding (a) on `loadTownPlans`' memo is expected to be real. Read `scripts/check_content.mjs`'s `loadTownPlans` before starting; if the memo is not keyed by content root, resetting it belongs in `runSpineGateInProcess` and a test must pin it.

- [ ] **Step 9: QUALITY GATE — refactor and re-verify**

Fix findings as new commits. Re-run Step 7.

- [ ] **Step 10: Final whole-plan verification**

This is the last task, so run the complete acceptance set and paste all of it:

```bash
node scripts/tools/overlap-preflight.mjs
time node scripts/check_content.mjs --only=spine | tail -1
node scripts/check_content.mjs --require-complete | tail -1
node scripts/check_spine_emit.mjs --check | tail -1
node scripts/check_render_lock.mjs --check
node tools/mapforge/render-sheet.mjs --sheet cluster1 --no-png --check
node tools/mapforge/render-sheet.mjs --sheet atlas --no-png --check
node --test 'tools/mapforge/tests/*.test.mjs' 2>&1 | tail -6
node --test 'tools/asset-storybook/tests/*.test.mjs' 2>&1 | tail -6
time npm test --prefix scripts 2>&1 | tail -8
(cd colyseus-server && npm test 2>&1 | tail -6)
./scripts/precheck.sh --no-install 2>&1 | tail -20
./scripts/integration.sh --no-install 2>&1 | tail -25
git status --short
git log --oneline main..HEAD
git branch --show-current && git log --oneline -1
```

---

## Acceptance criteria — the A → B/C boundary

Plan A is done when every line below is demonstrated with pasted command output, not asserted.

The commands below compare against `plan-a-base`, a lightweight git tag marking the commit Plan A started from. Create it as the very first thing you do, before Task 1 Step 1:

```bash
git tag plan-a-base HEAD
git rev-parse --short plan-a-base   # record this in the task log
```

Delete it (`git tag -d plan-a-base`) only after the acceptance table below is signed off — it is the sole reference point for the "nothing moved" criteria.

| # | Criterion | The command that proves it |
| --- | --- | --- |
| 1 | **The committed SVGs are byte-identical to what was committed before Plan A started.** | `git diff --stat plan-a-base -- game-client/assets/art/maps/` prints nothing |
| 2 | **No node file moved.** | `git diff --stat plan-a-base -- content/spine/nodes/` prints nothing |
| 3 | **The runtime emitter is untouched.** | `git diff --stat plan-a-base -- colyseus-server/` prints nothing; `(cd colyseus-server && npm test -- mapDimensions)` passes |
| 4 | **AMENDED 2026-08-19 (Task 4 review) — four became five.** `git diff --stat` over `content/` shows exactly **five** entries and no others: three MODIFIED (`content/spine/load-budget.json` — the three-term budget, **Task 4**; `content/spine/sheet.json`, `content/spine/sheet-atlas.json` — one added `subjects` block each, Tasks 7 and 8), one CREATED (`content/world/render-lock.json`, Task 10), one DELETED (`content/maps/cluster1-geography.json`, Task 12). `content/spine/nodes/**` and `content/maps/atlas-frontier.md` must NOT appear. The mirror is regenerated once, in Task 7 Step 5, and that regeneration must be inside the same commit as the `sheet.json` edit — a mirror diff surviving into any later commit is a `G-EMIT-DRIFT` failure, not an accepted cost. **Why the amendment:** the criterion as first written enumerated four entries and omitted `load-budget.json`, but the Global Constraints (line 33), the File Structure table (line 169) and Task 4 Step 3 all mandate that edit — so the criterion was incomplete, and the commit that made it (`b449a91`) was plan-faithful. `load-budget.json` is a **budget**, not drawn content: it holds no coordinate and no node, and criterion 2 (`content/spine/nodes/` prints nothing) remains the real "zero content change" test. Any per-commit restatement of this invariant that reads "`content/` must print nothing" is over-broad from Task 4 onward and should be read as "`content/spine/nodes/` must print nothing, and `content/` must show only the entries enumerated here". | `git diff --stat plan-a-base -- content/` |
| 5 | `G-OVERLAP` verdicts are identical on all 133 sibling pairs, max deviation < 0.01 km². | `node scripts/tools/overlap-preflight.mjs` |
| 6 | Gate 1's spine lane is **under 1 s** (baseline 3.75 s). | `time node scripts/check_content.mjs --only=spine` |
| 7 | The gate's own test suite is **under 60 s** (baseline 93.3 s for `spine-gates.test.mjs`). | `time npm test --prefix scripts` |
| 8 | The two pinned literal fixtures at `spine-gates.test.mjs:403,410` were **re-run**, not assumed, and still read `400.0`. | the passing `G-OVERLAP + G-COMP-ROLLUP red` test |
| 9 | `check_spine_emit --check` is clean at **46** files (was 47). | `node scripts/check_spine_emit.mjs --check` |
| 10 | `content/maps/cluster1-geography.json` is deleted and **Gate 2 is still green**. | `./scripts/integration.sh --no-install` |
| 11 | `G-VERTEX-BUDGET` and `maxChildrenPerParent` exist, print their measurements every run, and are green. | `node scripts/check_content.mjs --only=spine \| grep spine-load` |
| 12 | Neither sheet adapter names a spine id in code. | the two "names no spine id in its source" / descriptor tests |
| 13 | Dropping `n-saltmire` or `n-cluster1` from the tree produces a **diagnosable report**, not a `TypeError`. | the `resolveWorld REPORTS…` and `dropping the mire…` tests |
| 14 | The render lock is **observable** in the asset-storybook — both Map Sheets cards show `locked <hash>`. | the screenshot / Chrome check in Task 10 Step 8, plus `render-lock-index.test.mjs` |
| 15 | CI now runs the mapforge suite, `render-sheet --check` and the lock. | `grep -n "run:" .github/workflows/ci.yml` |

## What Plan A ships as working software on its own

The same two sheets, byte-identical, with the legacy mirror and both hard-coded adapters gone; `G-OVERLAP` at ~20 ms instead of ~3,040 ms on the same pairs; a checksum lock plus a unified diff in place of five file comparisons and a 47 KB duplicate fixture; a per-parent child cap and a ring-vertex cap that price the real cost driver; a gate suite that costs less than half what it did; and a test directory that can no longer revert the working tree mid-Gate-2. **Zero content change.** It is shippable on its own even if nothing else in the programme ever follows.

## Interfaces this plan hands to Plans B, C, D and E

| Signature | Consumed by |
| --- | --- |
| `exactIntersectionArea({ a, b }): number` | C (fabric polygon checks), E (the redraw's overlap verification) |
| `ringVertexCount({ placement }): number`, `bboxOfPlacement({ placement }): BBox`, `buildBBoxIndex({ items })` | C, E — **three interface notes on `buildBBoxIndex`, all latent because Plan A leaves it on no production path.** (1) **The extent is derived from the ITEMS, so one outlier collapses the grid.** Measured at n=1,740 (Plan C's landform-instance count) scattered over the 400x400 km frame, warmed, median of 7 build+query-all: no outlier **3.0 ms**; one item at `+1e6` **69.0 ms**; one item at `-1e5` **71.1 ms** — a 23x scan degradation. Candidates/query stays 1.3 in every row, so correctness is untouched and only the scan degrades. A legitimately huge sea strip does **not** hurt, because it lies inside the frame and so does not extend the extent (**3.2 ms**); only geometry OUTSIDE the frame does. When Plan C wires it in, derive the extent from the world frame rather than from the items, or divert wholly-outside items to an overflow list. (2) **`query`'s confirmation predicate requires strict overlap**, so a fully zero-extent item box sitting on the query's low edge is dropped. Correct for area overlap, wrong for point containment — if Plan C/D need containment, add an explicit `containsPoint` query rather than loosening this predicate, which would turn a harmless superset into noise. (3) `INDEX_DIVISIONS` is a fixed 8 over the whole extent; at Plan C's scale size the grid from a robust extent (median box size x sqrt(n)) or a fixed cell edge. |
| `resolveWorld({ spine, tree, descriptor, fabric, civil }): { doc, problems }` | **D** — supplies `fabric`/`civil` and makes `spine`/`tree` optional; the `problems.push` guard for those arguments is D's first edit |
| `loadPlaces({ contentRoot }): { doc, problems }` | **D** — points it at `content/world/resolved/` and removes the mirror fallback branch. **The fallback is load-bearing, not vestigial** (risk A4): three fixture suites build a content root containing only `content/maps/cluster1-geography.json` with no `content/spine/` at all — `scripts/tests/zone-content.test.mjs:355`, `scripts/tests/town-plan.test.mjs:493`, `scripts/tests/bestiary-placement.test.mjs:95`. Removing the branch without migrating those three roots to the `ResolvedWorld` shape makes `loadPlaces` return `{doc: null}` for them, the three joins at `check_content.mjs:816/955/1192` take their `if (!zones) return 0` early-out, and the two assertions that require a FAIL to fire (`zone-content.test.mjs:483`, `town-plan.test.mjs:589`) go red. The migration, the three literal expectations and the three gate messages at `check_content.mjs:835/:981/:1203` move in **one** commit in D, whose verify step compares the `npm test --prefix scripts` pass count against the pre-task baseline — exiting 0 is not the check |
| `WORLD_DOC_KEYS: string[]` | D, E |
| The `subjects` descriptor block in `sheet.json` / `sheet-atlas.json` | B (new sheets declare their own), E (the redraw rewrites `zoneRoot` and the id arrays) |
| `computeLock({ repoRoot, sheets, extraPaths })`, `checkLock`, `unifiedDiff` | C (`extraPaths` gains the fabric files), E (the R12 re-baseline order) |
| `GENERATOR_VERSION` | **B Task 9 Step 3b** — creates `tools/mapforge/lib/version.mjs`, **deletes this file's literal**, and re-exports from there. Plan A's copy is temporary by construction; B's `texture-bake.test.mjs` greps the repo and asserts exactly one `export const GENERATOR_VERSION` survives |
| `SHEETS[id] = { title, outSvg, outPng, maxLabelRank, build }` | B (`maxLabelRank` drives `placeLabels`; the synthetic sheet registers here) |
| `content/spine/load-budget.json`'s three-term shape | C, E |
| `summaryLines(...)`, `runSpineGateInProcess({ argv })` | C, D, E — every new gate's fixture tests should use the in-process runner, not a spawn |

## Risks specific to Plan A

| # | Risk | Why it is here | Mitigation, already in the tasks |
| --- | --- | --- | --- |
| A1 | **Exact clipping is strictly more sensitive** and surfaces a sub-cell sliver the sampler rounded to zero, turning a green gate red for a reason nobody expects | Measured: it reports a real 0.0014 km² sliver grid sampling reports as 0 | Task 2's pre-flight runs **before** the swap and fails the task if any verdict moves; the max-deviation assertion pins the size |
| A2 | **A re-homed gate join silently stops checking** rather than failing — all three call sites `return 0` on a failed load | The single most dangerous failure mode in this plan | Task 6's acceptance asserts the printed **record counts**, and its review step requires an actual break-and-observe experiment |
| A3 | **`sheet.json` is copied into the emitted mirror**, so adding `subjects` legitimately changes a committed byte inside a plan whose invariant is "zero content change" | Discovered by reading `places.mjs`'s last key, `sheet: spine.sheet` | Task 7 Step 3 names it in advance, bounds it to exactly one file, and Step 5 proves the SVGs and `mapDimensions.ts` did not move |
| A4 | **Three fixture suites have no spine and write their own mirror**, so removing the mirror read would take ~60 tests dark | Verified: `zone-content.test.mjs:355`, `town-plan.test.mjs:493`, `bestiary-placement.test.mjs:95` | Task 5's `loadPlaces` fallback branch, with its own test, and Task 6 Step 5 runs the whole `scripts` suite as the proof |
| A5 | **The `parity.test.mjs` footgun is live**: it reverts a regenerated uncommitted sheet mid-Gate-2 | `integration.sh` runs `map_render_drift` before `mapforge_tests` | Task 11 disarms it **before** Task 12 deletes anything, and adds a directory-wide guard so it cannot return under a new name |
| A6 | **Deleting the mirror is the one step that is expensive to un-notice** | Six files leave at once | Task 12 splits into a proof commit and a deletion commit; the proof enumerates every remaining reader by `git grep` and fails on an unlisted one; the review step requires two mutation experiments |
| A7 | **The in-process gate runner leaks state between runs**, so a test passes or fails because of the test before it | `check_content.mjs` has four module-level mutable bindings plus a memoised town-plan loader | Task 13 resets all four, pins the no-leak behaviour with its own test, and its review step requires enumerating every module-level binding |
| A8 | **Message order changes** when a spatial index reorders the pair walk, and only two of ~130 possible messages are pinned | The two pinned literals would still pass | Task 3 keeps the outer `i<j` loop order and only ever adds a `continue`; its review step asks for a three-child fixture check |

## Ordering — do not re-derive this

Tasks 1 → 13 run in numeric order. Three constraints inside that order are load-bearing and must not be rearranged:

1. **Task 2 lands the clipping swap by itself**, before any other geometry change, with `git diff --stat content/ colyseus-server/` printing nothing as the proof.
2. **Tasks 5 → 6 → 7/8 → 9 → 12** are spec §9.2's steps 1 → 2 → 3 → 4 → 5/6 verbatim. Reversing any pair reds three gate families and the surviving renderer at once.
3. **Task 11 precedes Task 12.** The `git checkout --` self-revert must be disarmed before any deletion, or a half-finished Task 12 leaves a suite that silently reverts the tree.

Tasks 10 and 13 are independent of the rest and could run in parallel in a separate worktree if the lane is split — but Task 12 consumes Task 10, so 10 must finish first.
