# World Fill — running state

**A living handover file. Read this before starting any of Plans B, C, D or E.**

It exists so a new session does not need the previous session's conversation. If something here
is wrong, fix the file — do not work around it in a prompt.

Last updated: 2026-08-22, after **Plan B shipped** (F-047 → release/1.8, merge `65006fe`),
**Plan C was claimed** as F-048, and **Plan C seams 1-5 (Tasks 1-9) were built and adjudicated**
— see §9, §10, §11, §12, §13 and **§14**, and **ninety** confirmed plan errors in §5.

**If you read one thing in §13, read "THE NAMING STREAM".** The seam-3 wrong-stream defect happened
a THIRD time, in seam 4, under the name `names`; it is now impossible to spell rather than merely
fixed. §13 also supersedes two things §12 states as settled: handles are six hex, and c11
Quillreef's reef promise is kept.

**If you read one thing in §11, read "THE FOUR THINGS THE FIX PASS CHANGED".** Seam 3 shipped a
moisture field whose median was exactly zero, ice on three landmasses whose own palettes forbid it,
and — found by neither reviewer — a real-world golden built from the WRONG SEED STREAM, so the
world it pinned was not the world seam 2 fitted the thirteen continents to.

---

## 1. Where the programme is

| Plan | Feature | State |
| --- | --- | --- |
| A — Unblock and Afford | F-046 | **SHIPPED** to release/1.8, 2026-08-19. All 15 acceptance criteria verified. |
| B — Vocabulary and Render | F-047 | **SHIPPED** to release/1.8, 2026-08-22. All 12 tasks; Gate 1 13/13. |
| C — The Fabric Layer | F-048 | **IN FLIGHT** — claimed 2026-08-22, worktree `.claude/worktrees/F-048-…`, base tag `plan-c-base`. Tasks 1-9 built and seams 1-5 adjudicated (§14); Task 10 next. |
| D — Pinned, Bound, Relations | — | not started |
| E — Redraw and Prose | — | not started |

Design: `docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md`
Plans: `docs/superpowers/plans/2026-08-16-world-fill-{a..e}-*.md`

---

## 2. Measured baselines — compare against these, do not re-derive

**Re-measured 2026-08-22 in the F-048 worktree** (release/1.8 merged in, Plan B present,
Node v26.5.0). The Plan A column is kept alongside so a mover is visible.

| Command | At `plan-c-base` (F-047 merged) | Was, at Plan A |
| --- | --- | --- |
| `node scripts/check_content.mjs --only=spine` | 44 nodes / 0 failures / 19 warnings, **0.76 s** | 0.79 s |
| `node --test 'scripts/tests/*.test.mjs'` | **854 pass / 1 skip / 0 fail, 35.6 s** | 698 pass, 44.8 s |
| `node --test 'tools/mapforge/tests/*.test.mjs'` | **251 pass / 0 fail, 11.1 s** | 34 pass |
| `node --test 'tools/asset-storybook/tests/*.test.mjs'` | **54 pass / 0 fail, 0.5 s** | 32 pass |
| `node scripts/check_spine_emit.mjs --check` | clean, **47 files** | 46 files |
| `node scripts/check_render_lock.mjs --check` | clean, **3 artifacts** | 2 artifacts |
| `( cd colyseus-server && npx jest mapDimensions )` | **5 passed** | 5 passed |

The three movers are all Plan B's and all expected: the `derived.json` sidecar makes the emit
census 47, the synthetic canary sheet makes the render lock 3, and the lexicon/schema/render
work is the +156 scripts and +217 mapforge tests. **Plan C's acceptance criterion 7 reads
`clean, 47 files` — that is this number, not a target to move.**

The older whole-suite readings, unchanged and not re-measured here:

| Command | Result |
| --- | --- |
| `node scripts/check_content.mjs --require-complete` | exit 0 — 12 sheets, 1 maps, 158 story, 1 placements, 10 zones, 1 towns, 44 nodes, 0 failures, 32 warnings |
| `node scripts/tools/overlap-preflight.mjs` | 133 pairs, 0 non-triangulable, 0 verdict differences, max deviation 0.002692 km² |
| `( cd colyseus-server && npx jest mapDimensions )` | 5 passed |
| `./scripts/precheck.sh --no-install` (Gate 1) | PASS 12/12 |
| `./scripts/integration.sh --no-install` (Gate 2) | PASS 11/11 |

**Measure timing on a QUIET machine.** With concurrent agents the same suite read 60–76 s
against its 60 s cap; idle it is 44.8 s. Never quote the flattering run — but do not accept a
contended one as a regression either.

---

## 3. The invariant — what "nothing moved" means

Tag the starting commit as the very first act of any plan, then compare against it:

```bash
git tag plan-<x>-base HEAD
git diff --stat plan-<x>-base -- colyseus-server/
git diff --stat plan-<x>-base -- game-client/assets/art/maps/
```

Both must print **nothing** on every commit, in every plan except E's single redraw commit.
`colyseus-server/src/tests/mapDimensions.test.ts` staying green is an acceptance criterion on
**every** commit in **every** plan.

**Keep an enumerated list of which files under `content/` a plan is allowed to change**, and
make agents check it every commit. It is what stopped scope creep four times in Plan A. If a
task legitimately needs a sixth file, that is a finding to raise — never a diff to widen quietly.

**The one carve-out, agreed once:** Plan B Task 12 may re-baseline
`content/world/render-lock.json` and the two committed SVGs. Nothing else, ever, outside Plan E's
redraw commit.

**What Task 12's carve-out ACTUALLY moved — measured 2026-08-22 by the seam-4 fix pass, because
the seam's own commit messages overstate it in two places and a commit message cannot be
amended.** Counted with `grep -o` against `plan-b-base`, not with a remembered figure:

| | `<path d=` | `<rect ` | `<text` | `rotate(` | canvas |
| --- | --- | --- | --- | --- | --- |
| `cluster1-world.svg` base → head | 297 → **297** | 28 → **28** | 100 → **100** | 12 → **12** | 1614x1396, **unchanged** |
| `atlas-world.svg` base → head | 39 → **44** | 4 → **32** | 37 → **52** | 28 → **2** | 1542 → **1672 tall** |

- **"nothing moved" is true of the BASIN sheet's element census and of every `<path d>` on both
  sheets — and of nothing else.** On the atlas, every `<text class="lbl">` moved: 26 of the 28
  `rotate()` transforms were dropped along with `text-anchor`, the canvas grew 130 px, 28 legend
  rects and 5 patterns were added. All of that is *permitted* by the carve-out. The phrasing
  oversold it, and a later plan reading "nothing moved" would draw the wrong conclusion.
- **The basin sheet has 277 DRAWN paths, not 289.** 297 `<path d=` occurrences in the file, of
  which 13 belong to `<clipPath>` blocks and 7 to `<pattern>` blocks. The pattern `<rect>`
  geometry DID change on all 13 zones — that was the point of the raster-cost fix — while the
  drawn paths did not.

---

## 4. What Plan A built that the later plans consume

All exported and under test. Signatures are contracts — do not change them casually.

| Signature | Consumed by |
| --- | --- |
| `exactIntersectionArea({ a, b })` | C, E |
| `ringVertexCount({ placement })`, `bboxOfPlacement({ placement })`, `buildBBoxIndex({ items })` | C, E |
| `resolveWorld({ spine, tree, descriptor, fabric, civil }) -> { doc, problems }` | D |
| `loadPlaces({ contentRoot }) -> { doc, problems }` | D |
| `WORLD_DOC_KEYS: string[]` | D, E |
| `computeLock({ repoRoot, sheets, extraPaths })`, `checkLock`, `unifiedDiff` | C, E |
| `runSpineGateInProcess({ argv })`, `summaryLines(...)` | C, D, E — new gate fixture tests should use this, not a spawn |
| the `subjects` descriptor block in `sheet.json` / `sheet-atlas.json` | B, E |
| the three-term `content/spine/load-budget.json` shape | C, E |
| `GENERATOR_VERSION` | B Task 9 Step 3b **deletes Plan A's literal** and re-exports from `tools/mapforge/lib/version.mjs` |

Notes carried forward:

- **`buildBBoxIndex` is exported but deliberately NOT wired into the gate.** Measured: the
  governing variable is *disjointness*, not n. On the real spine it is 1.24× **slower**; at 24
  children with 160-point disjoint rings it is 10.8× faster. Full measurement table in commit
  `a780a4e`. Its grid extent is derived from the items, so **one out-of-frame item degrades the
  scan 23× at n=1,740** — a frame-spanning sea strip costs nothing.
- **`loadPlaces`' mirror fallback is load-bearing, not vestigial.** Three fixture suites build a
  content root with no `content/spine/` at all. **Plan D removes the fallback only together with
  migrating those three roots** — `scripts/tests/zone-content.test.mjs:355`,
  `town-plan.test.mjs:493`, `bestiary-placement.test.mjs:95`.

---

## 5. Where the plan documents are WRONG

**Ninety-eight confirmed** — the table below, counted 2026-08-22 (the running prose count had drifted: it read "seventy" at 94 rows). Each was found by running code, not by reading. **Verify a brief against the
tree before trusting it** — this is the single most reliable source of defects in the programme.

| Where | The plan says | Actually |
| --- | --- | --- |
| A, acceptance criterion 4 | four `content/` entries | five — it omits `load-budget.json`, which Task 4 requires |
| A, Task 7 Step 4c | all 12 region children carry `lore.order` | only 10 do; the rule as literally written goes **RED on correct content** |
| A, Task 10 file list | — | omits the asset-storybook `Dockerfile` + `.dockerignore`; without them the *containerised* storybook 404s and every card reads "NOT LOCKED" |
| A, Task 10 Step 8 | `cd tools/asset-storybook && python3 -m http.server` | wrong document root — assets escape the directory. Serve from the **repo root**, open `/tools/asset-storybook/index.html` |
| A, Task 11 Step 9 (a) | `check_map_render.test.mjs` still uses `git checkout --` | it does not; Task 10 had already replaced it |
| A, Task 12 Step 1 allowlist | — | omits three real reads: `scripts/tests/season1.test.mjs:183` (module-level — deletion would throw at import), `season1.test.mjs:301`, `town-millcross.test.mjs:237` |
| A, Task 12 file list | — | omits four suites whose coverage the deletion would have silently voided |
| A, Risk A7 | four module-level mutable bindings | **six**: `placesByRoot:154`, `failures:225`, `warnings:226`, `zoneHazardsTotal:231`, `zoneHazardsUnmapped:232`, `townPlansCache:1255` |
| A, Task 3 fixture | the `g-children-cap` fixture triggers the rule | unreachable as written — the base fixture has no parent with 2 children |
| **C, Task 1 Step 8** | call `checkWorld` after `gSpineBudgets` (:1682) | **unreachable for exactly the roots that step describes.** `checkSpine` returns at its own first statement on a root with no `spine/`, which is before `gSpineBudgets` — so the world gate printed nothing at all. It is called from the TOP of `checkSpine`. Verified both ways by the reviewer. |
| **C, Task 1 Step 6** | `(budget ${fam.maxFiles}, ${fam.maxTotal ?? fam.maxPer})` | prints `civil`'s PER-FILE cap in the aggregate slot; `civil` has no aggregate cap at all. Reproduced: 3 files of ~5 KB read as `civil 3 files, 15030 bytes (budget 600, 8192)` and exit 0. Every term now carries its unit. The plan's own Task-1 test asserted the wrong line. |
| **C, Task 2 preamble** (and line 1341, and `budgets.json` `cellKmWhy`) | "640,000 cells x 9 fields is ~14.7 MB resident" | **13 fields, 23,680,000 bytes = 22.58 MB.** The four pinned-constraint fields (`landform`, `fetchKm`, `depthM`, `freshKm`) landed in the same commit and were counted in none of the three places. 14.7 MB was an ESTIMATE, never a budget — **do not shrink the grid to reach it.** |
| **C, Task 2 continuity fixture** (~:1113) | samples a named stream via `stream: "seedseedseedseed"` | not hex: `Number.parseInt(…, 16)` is `NaN`, `NaN \| 0` is `0`, so **every non-hex stream collapses onto the same field, deterministically, green**. `streamInt` now throws; fixtures were re-based onto real 16-hex streams. |
| **C, Task 2 `makeGrid` signature** | `({ w = 800, h = 800, cellKm = 0.5 })` | no `= {}`, so `makeGrid()` throws. The default was added and is now under test. |
| **C, Task 1 Step 3 manifest** | Global Constraints says 20 biomes / 18 terrain kinds / 40 glyph families / 12 groups are "gated against `content/world/manifest.json`" | the plan's own manifest carries **none of the four**, and `additionalProperties: false` means a later task cannot add one without a schema edit. 20 is already `BIOMES.length` in `scripts/lib/spine.mjs`; `dungeonCapableTypes: 23` lives in Plan B's `budgets.landforms`. **The manifest is not the authority for those four.** |
| **C, Task 1 manifest schema** | `landmasses: { minItems: 1 }` | no ceiling, while the neighbouring `oceans`/`seas` are pinned 3/3 and 9/9 — a 14-row manifest was schema-legal. Now `minItems: 13, maxItems: 13`. |
| **C, Task 3 Step 4** geometry table | thirteen footprint radii | Σ π·rx·ry over the plan's own table is **48,415 km²** against the **65,600 km²** `budget.grossLandPolygonKm2` demands — a **ceiling no mask implementation can clear**, so the refit was unavoidable exactly as Step 11 predicted ("adjust `radiiKm`, never the mask code"). **The reason recorded here on 2026-08-22 was WRONG and is corrected: P3 did NOT throw.** With the plan's radii `selectSeaLevelByRank` returned `landCells` exactly 262,400, in band, at the on-plan ratio — by classifying **73,831 ocean-floor cells (18,458 km², 28% of all "land") as land**. See §10; the guard that catches it now exists. |
| **C, Task 3 Step 4** — the fit TARGET | the plan gives no per-continent gross split | the target is `netKm2 + interiorWaterKm2` **per continent** (c02 1,100, c04 300, c06 200, the other ten 0), not `netKm2 × 1.025` spread uniformly. Both sum to 65,600, so an aggregate that closes hides c02 at −6.75% and c06 at −3.95%. Re-fitted 2026-08-22; worst error 0.100%. |
| **C, Task 3 Step 4** — `structures` | absolute km, unchanged by the refit | a footprint that grows 1.3–1.9× with its structures left where they were is a **different landform**. c03's committed "one unbroken spine ridge **end to end**" reached 0.88 of the rim, c12's rift-valley 0.48. Structures are now carried in footprint-relative coordinates and re-materialised at the fitted radii. |
| **C, Task 3 Step 6** substrate noise | a 4-octave fbm gated at 0.25 (volcanic) / 0.3 (karst) | **both gates are dead, and the ladder could never have interleaved two kits.** Measured: `t` over EVERY masked cell in the frame is [0.2603, 0.8333], so the 0.25 gate cannot reject anywhere; c04, the only karst premise, has min 0.376. And the volcanic branch runs first with an always-true gate, so a two-kit premise would get volcanic everywhere and karst nowhere. The field cost 173 ms for a value nothing read; deleted. |
| **C, Global Constraints line 43** | "Target land fraction 0.40 = 256,000 of 640,000 cells" | that is the **NET** figure. P3's rank target is the **GROSS 262,400** (`grossLandPolygonKm2 / 0.25`), per Task 4 Step 5 and Task 10 line 6588. A later reader "fixing" the target to 256,000 would put the world 5% under its land budget. |
| **C, Task 8 lexicon** (forward) | 45 rows carry `requires.rock` and all are satisfiable | **`sub-lacustrine-vent` (`{nearFlag: LAKE, rock: volcanic}`, group `lakes`) can never be placed.** Volcanic ground exists only on c10, whose `landformKit` is `["volcanic","erosional","island"]` with no `lakes`. Task 8's problem, filed before a green run gets read as coverage. |
| **C, Task 4 / D** `selectSeaLevelByRank` | prose says it is 800 × 800 only | it was **prose only**: a 500 × 500 grid returned `landKm2 60000` against a 160,000 km² frame the grid does not have, silently and in band. Now a guard. |
| **C, Task 3 Step 1** test | `premiseMaskAt(c02 centre) > 0.9` | **unsatisfiable by the plan's own c02 premise.** Its inland sea sits at `[104,156]`, 11.31 km from the centre, radius 19, amplitude 0.55 — it subtracts 0.197 there before any warp. Measured **0.7705**. Replaced by a sweep over the 11 purely-additive premises (worst 0.8887) plus a direct test that c02's and c11's lobes bite. |
| **C, Task 3 Step 6** code | `assignSubstrate` sets a bit only for `karst` / `volcanic` / `desert` kits, "else: no bit — clastic by default" | **contradicts the plan's own Step 1 test**, which asserts *exactly one* substrate bit per masked cell. `FLAG.SAND` is now the explicit clastic default, so the invariant is measurable instead of remembered at each of P10's read sites. Coverage measured 100.00%, 0 violations. |
| **C, Task 4 Step 1** test | `ramp(64000)` with `targetLandCells: 26240` | **throws.** `LAND_CELL_BAND` is an ABSOLUTE count for the pinned 640,000-cell grid, not a fraction — 26,240 is 8.7× under the floor. The band is the manifest's own `grid.landCellBand`, so the fixture moved, not the contract. Consequence: `selectSeaLevelByRank` is usable on the 800 × 800 grid and nothing coarser. |
| **STATE §9** (this file, seam 1) | the inventory "reads the whole of `lib/` by directory (so it covers new files, e.g. Task 3's passes)" | it did **not** — `readdirSync` is not recursive, so `lib/passes/` was scanned by **neither** determinism scan. Proven at `plan-c-base`: a planted `Math.cos` **and** `Date.now()` in `lib/passes/mask.mjs` left `determinism-inventory.test.mjs` at **4 pass / 0 fail**. The walk is recursive now, and a test asserts at least one scanned file lives in a subdirectory. |
| **C, Global Constraints** and `grid.mjs`'s header | "19 desert types (rock: clastic) and 15 volcanic types… 35 of the 170 lexicon rows" | measured against the committed lexicon: **carbonate 10, clastic 19, volcanic 16 = 45** rows carry a `requires.rock`, not 34/35. The direction of the claim is right and the remedy is unchanged; the count is not. |
| **C, Task 5 Step 3** `unitEdges` frame loops | `left: -1, right: o` (top) and `left: o, right: -1` (left) | **both INVERTED** against the convention the main sweep establishes, so an owner touching the top or left frame cannot chain a closed ring. Reproduced on a 5x5 two-owner field: 5 rings totalling 3.5 km² against a 3.25 km² census. The plan's own `twoBlocks` fixture sits clear of every frame edge and cannot see it. An arc takes `left`/`right` from its FIRST edge only, so a mis-oriented edge mid-arc is invisible — the fixture had to be swept for. |
| **C, Task 5 Step 3** `fractalise` | judges the arc with `selfIntersects` from `scripts/lib/spine.mjs` | that function walks `points[(i+1) % n]` — it CLOSES the list. On an open arc it tests against a chord the arc does not have. **Measured TRUE on the plan's own fixture** `[[0,0],[8,0],[16,4],[24,4]]`, so the plan's fractalise halves four times, gives up, and fails the plan's own `out.length > 4` assertion — every coast in the world would have got no detail, silently. An open-polyline crossing test now lives in `arcs.mjs`. |
| **C, Task 5 Step 3** arc ids / node sort | `arc-${n}`, `[...nodeSet].sort()` | both are STRING sorts of numeric things: `arc-10` precedes `arc-2`, so `assembleRings`' "lowest arc id" start is not the arc it names on any owner with ten or more arcs; and `"10:4"` precedes `"9:4"`, so arc ids depend on how many digits a coordinate has. Ids are zero-padded to 6 and nodes sort numerically. |
| **C, Task 6b Step 14** `carveWater` lakes | rank a premise's cells by `filled - elev`, deepest first, to the share | **carves 68 km² of the 1,600 km² budget.** Measured on the real field: the WHOLE WORLD holds **603** land cells with any depression (c02 267, c04 6, c06 0) against the 6,400 budgeted, so the net ratio never leaves 1.439 and Task 6b's stated purpose fails. Two simpler repairs measured and rejected — ranking by ELEVATION rings the coast (the mask taper makes the rim the lowest ground everywhere; c02's inland-sea lobe is at 0.13-0.21 while its shore is at 0.044), and centre-seeded growth without a disc bound leaks to that rim. Replaced by: premise disc says WHERE, manifest column says HOW MUCH, relief decides the shape. |
| **C, Task 6b Step 11** both `carveWater` fixtures | `manifest: { budget: { interiorWaterKm2: 400 } }` | the per-premise share is `manifest.landmasses[].interiorWaterKm2`, which the plan's own `interiorWaterFor` reads. With the plan's fixture that is 0, the premise is skipped, and the fixture's own `assert.ok(carvedKm2 > 0)` fails. Neither fixture fills `grid.flowAcc` either, which `carveWater` reads for every river, delta and fresh-water distance. |
| **C, Task 6b Step 11** rain-shadow test | `moist(x=28) > moist(x=32)` around a wall | presumes a PREVAILING wind. Neither the plan's twelve sweeps nor the sixteen here weight one bearing over another, so "lee" is not a direction the pass knows: measured windward 0.00854 against lee 0.01169, an artefact of which side the sea is on. Re-framed causally — the same ground with and without the ridge. |
| **C, Task 6b Step 13** `applyWinds` sweep starts | `x = startX + (|dx| < |dy| ? k : 0)`, one boundary line per bearing | leaves STRIPES on every diagonal bearing — a family of parallel diagonals and a large untouched triangle. Both upwind edges are enumerated now, with a coverage counter over all sixteen bearings as a test. The plan's Step 19 predicted exactly this. |
| **C, Task 6b Step 13** `SWEEPS = 12` | "one per wind direction band" | `UNIT_VECTORS[(s * 16 / 12) | 0]` selects indices 0,1,2,4,5,6,8,9,10,12,13,14 — an UNEVENLY spaced dozen (22.5°, 22.5°, 45° per quadrant), which biases the rain shadow by quadrant. Twelve evenly spaced bearings cannot be drawn from a 16-row table; the whole table is swept instead. |
| **C, Task 6b** `applyWinds({grid, premises, stream})` and `carveWater({…, filled, …})` | both parameters in the signature | **neither is read.** `premises` is never mentioned in the plan's own `applyWinds` body; and growing the lake on `filled` is actively WRONG — a 3x3 pit at 0.1 inside a 0.5 plain comes back from priorityFlood at 0.5000051, ABOVE the plain, because erasing depressions is the fill's whole job. Both dropped (seam 2's P2b precedent). `priorityFlood` stays load-bearing via P6's flow routing. |
| **C, Task 6b Step 13** `applyWinds` normalisation | `let max = 0; … base = acc[i] / max` (plan :3172-3176) | **the divisor is an EXTREMUM and it kills the field.** Measured on the real 800 x 800: the raw land accumulator has p50 0.0518 and max 11.7981 — max/p50 = 227.7, and the max is ONE coastal first-landfall cell. After dividing, the median land cell reads 0.0044; add the ±0.06 jitter and clamp and **half of all land is exactly 0.0000, with 99.2% below both the biome desert threshold (0.16) and the settlement freshWater veto (0.20)**. Every biome desert, no settlement siteable anywhere. The ACCUMULATOR was never wrong (261,077 of 262,400 land cells carry distinct values). Replaced by a saturating ramp against the 75th-percentile land cell. |
| **C, Task 6b Step 14** `GLACIER_TEMP_MAX 0.12` | a global temperature threshold on any land cell | **21.6% of all land, and it contradicts three landmasses' own committed palettes** — c11 Quillreef (atoll-ring, `reef/meadow/ocean`) 78.6% ice, c07 Driftholt (fog-forest, "the wettest ground in the world") 60.3%, c03 Coldreach 41.7%. None of the three lists `ice`. Task 7's palette clamp cannot repair it: the clamp rewrites the BIOME while `FLAG.GLACIER` is read directly by Tasks 8-10. Glaciers are premise-gated now (only c01 and c12 carry `ice`), exactly as substrate is kit-gated. |
| **C, Task 6b Step 14** the lake growth key | rank a premise's cells by relief, deepest first | correct in a basin and wrong on a ramp. The mask taper makes every continent a smooth slope, so "lowest frontier cell next" walks ALONG the contour: c04's 300 km² body came back with a **307 km shoreline** (a circle of that area has 61 km) and 7% bounding-box fill. A quadratic `LAKE_BOWL` centred on the seed, normalised by the body's own budget area, holds it together — isoperimetric ratio 0.040 → 0.385. |
| **C, Task 5 Step 8 / Task 10 :6208, :6229, :6380** `assembleRings` | rings are a flat positively-wound list; callers pick | **a HOLE and a second LOBE are the same shape at the same size, so no flat list can carry the answer.** The counterexample: a 5×5 block with a 1-cell hole AND a separate 1-cell lobe — census 6.25, rings [6.25, 0.25, 0.25]; SUM gives 6.75, outer-minus-rest gives 5.75, `rings[0]` gives 6.25 only because the two errors cancel. `assembleRings` now resolves nesting and returns `{ rings, holes, areaKm2 }`. |
| **C, Task 5 Step 3** `assembleRings` closure | `if (nextI === -1) break;` | an UNCLOSED chain is emitted as a polygon: it survives `pts.length >= 3`, it is not negative so the winding step leaves it, and it comes back with area 0. That is exactly what the plan's inverted frame edges produced. Both the unclosed chain and the zero-area ring now THROW. |
| **C, Task 10 Step ?** `fitVertexCap` (:6193-6201) | re-simplify a RING with a doubling epsilon until it fits the vertex cap | **reintroduces the sliver the one-shot rule exists to prevent, and it is a LANDMINE waiting for Task 10.** `simplifyArc` is idempotent at a fixed epsilon (600 → 67 → 67) but not across a doubling (67 → 44), so two neighbours whose rings hit the cap at different iteration counts diverge on their SHARED boundary. Measured on a two-owner ragged field: shared vertices 10 → 6 → 3 as the cap tightens, and one owner's area moves (145.0 → 144.5 → 144.125) while the other's does not. **The cap must be applied to ARCS before assembly, never to rings after it.** |
| **C, Task 6b / Task 5** the terrain STREAM | `applyPremiseMasks({ …, stream: manifest.seed })` in the seam's own real-world tests | **`manifest.seed` is the WORLD seed, the parent of four named streams.** The terrain field is built from the child `mintSeed(seed, "terrain") = d9a0051d32afab59`, which is committed in `content/spine/derived.json` as `n-atlas.resolvedSeedStreams.terrain` and is what `fit-premises.mjs`, `mask.test.mjs` and `rank-select.test.mjs` all use. Seam 3 pinned a **different world** from the one the thirteen footprints were fitted to. |
| **C, Task 7 Step 3** biome `lava` rule | `c.flags & FLAG.CLIFF && c.elev > 0.85` | **`FLAG.CLIFF` is set by NO pass in the pipeline** — grep all of `tools/mapforge/lib/` and its only occurrence is its own declaration in `grid.mjs`. The rule fired on 0 of 640,000 cells, and `lava` reached the map only through the palette[0] fallback (2,265 c10 cells with no rule ever saying so). Fixed to `FLAG.ARC`, which `assignSubstrate` mints for volcanic ground and nowhere else; the 0.85 threshold is unchanged and selects c10's top 560 cells. |
| **C, Task 7 Step 3** biome `ash` rule | `(c.flags & FLAG.SAND) !== 0 && c.moist < 0.4` | **inverted with respect to its only consumer.** `SAND` is the CLASTIC default on 213,210 of 262,400 land cells; `ash` is in exactly ONE palette, c10's, and c10 is the one continent whose kit is volcanic and therefore never carries SAND. Measured: the rule fired 26,439 times and was legal on none of them, so `ash` — the only biome `TERRAIN_IMPLIES["volcanic-arc"]` names — could not occur anywhere. Fixed to `FLAG.VOLCANIC`: 49.8% of c10. |
| **C, Task 7 Step 4** `partitionRegions` | uses `mintSeed` for the provenance stream | never imports it. `ReferenceError` on the first reported region of the first continent. |
| **C, Task 7 Step 4** `isLand` | `grid.plate[i] >= 0 && (grid.flags[grid.n ? i : i] & FLAG.SEA) === 0` | dead in two ways: `grid.n ? i : i` is `i`, and nothing calls the helper. Deleted. |
| **C, Task 7 Step 4** `biomeShares` | `{ "karst": 62, "forest": 38 }` in the fabric shape | the code keys the map by the **Uint8Array biome INDEX**, so a committed fabric file would have read `{"15": 62}`. `grid.biomeNames` exists for exactly this join and P9 now uses it — and REFUSES to run before P8 rather than keying on an unset vocabulary. |
| **C, Task 7 Step 4** what regions tile | every land cell of the plate (`plate >= 0 && !SEA`) | that is GROSS land, 65,600 km². The manifest's own arithmetic is `40 x 160 + 120 x 480 = 64,000 = budget.netLandKm2`, and the fabric record's `cellCensus` is `{ land, lake, unowned }` — three terms, lake BESIDE land. Owning lakes inflates every region by 2.5%. Regions tile NET land, and the integer proof of non-overlap therefore needs a LAKE term the plan's three-way form does not have: `Σ ownerHistogram + unowned + lake + sea = 640,000`. |
| **C, Task 7 Step 4** the region quota | every region takes the manifest NOMINAL (640 / 1,920 cells) and the leftover goes to the residual pass | **38 of the 120 reported regions land outside their own [384, 576] km² tolerance**, spread 64.5 to 743.75 km². (**CORRECTED by the seam-4 fix pass, 2026-08-22.** This row and §12 both said *33, spread 63.5 to 744.5* — that is a different measurement of a different rule: THIS seam's allocator with `rebalance` switched off. The plan's own rule gives 38 / 64.5–743.75. Both numbers are in `partition.mjs` and each docstring is individually correct; STATE conflated them. Re-derived independently by patching only the quota line: plan quota + no rebalance → 38, span 64.5–743.75; seam quota + no rebalance → 33, span 63.5–744.5; plan quota + rebalance → 10 reported and 1 surveyed still outside, 12 shortfalls, so **both halves of the replacement are load-bearing**.) `40 x 160 + 120 x 480` is a WORLD identity and no continent's net land is a multiple of its own nominal share, so "wherever the frontier happened to be" decides the whole residue. Surveyed take the nominal; reported share their own continent's remaining net land equally. |
| **C, Task 7 Step 4** `growRegions`' `pending[]` | the first owner to touch a cell claims it | once that owner fills its quota the cell is skipped FOR EVER and falls to the residual rule's "lowest id", even when a neighbour has budget and is closer. The owner is carried IN the heap entry instead — which makes the plan's `(cost, cellIndex)` key non-total, so the key is `(cost, cellIndex, ownerIndex)`. |
| **C, Task 7 Step 4** hard caps + residual | quotas sum to the land, so the books balance | they do not: a boxed-in site stops short (measured, one c04 reported region at 96 cells of 1,881) and the cells it did not get are walled behind FULL regions, so no capped round can reach them. Closed by a transfer along a PATH through the region-adjacency graph, breadth-first to the nearest surplus. |
| **C, Task 7 Step 1** fixtures | call `partitionRegions` directly | every fixture but one skips `classifyBiomes`, so `grid.biomeNames` is empty. Nine of the plan's ten Task-7 tests exercise a partition whose biome shares are meaningless. |
| **C, Task 7 Step 4** `poissonSites` | relax the radius by 20% and retry ONCE, recursively | no depth bound and no floor. On a chain continent smaller than one 19 km disc it returns fewer sites than the manifest demands — a shortfall no test in the plan's suite can see, because they all run on a square. Bounded ladder down to one cell edge, then the top `count` outright. |
| **C, Task 7 Step 4** `recentre` | scans all 640,000 cells per site per pass | 160 x 4 x 640,000 = 410 M steps. The plan's own review brief predicts it. Replaced by one CSR cells-of-region index per pass. |
| **C, Task 7 Step 3** `TERRAIN_FOR_BIOMES` | a partial map with a `?? "headland"` tail | a biome added to `BIOMES` becomes a silent headland instead of a red test. Total over all 20 members, and a miss throws. `fjordland` is the one `TERRAIN_KINDS` member no biome implies — pinned, so wiring it up has to be deliberate. |
| **C, Task 8 Step 4** instance geometry | `geometry: { shape: c.type.geometry, at: c.at }` for all three shapes | `landform-instance.schema.json` is a `oneOf` with `additionalProperties: false` per branch: `point` takes `at`, `line` takes `points` (2-40), `area` takes `ring` (3-40). **126 of the 170 lexicon rows are line or area**, so three quarters of the world fails validation the moment Task 11 puts an ajv venue on the fabric. |
| **C, Task 8 Step 4** the instance budget | per continent, proportional to land cells | surveyed regions hold 25,600 of 256,000 net-land cells, so that puts ~174 instances in them — while the plan's own naming census demands **276** there. It cannot close. The plan states the missing number itself at line 350 ("a reported region … still carries 8 texture instances"): 120 x 8 + 40 x 19.5 = 1,740 exactly. |
| **C, Task 8 Step 4** per-type target | `Math.max(1, Math.round((budget * share) / typesInGroup))` | the `max(1, …)` floor makes the continent total at least the number of kit types — 73 on c02 against a share-of-1,740 budget of ~134 — so the counts cannot be targeted at all. |
| **C, Task 8 Step 4** `substitutions` | "degrade to the nearest legal type in the SAME group and record the substitution" | the code writes `used: null` unconditionally, so the field it declares for the fallback never carries one. 46 of the 109 substitutions on the real world do have a group-mate to name. |
| **C, Task 8 Step 4** handle collisions, and **plan preamble line 91** (`h-<4 lowercase hex>`) | extend the LATER-ranked member to 6 hex, keyed on a `seen` map; the grammar is four hex | Two errors. (a) `seen` only ever holds the FIRST occupant, so a three-way collision writes the same 6-hex tail twice and the second write is silent — though NOT on a plain three-way collision, which yields three distinct handles; it duplicates only when two members also agree at six hex (reviewer H, and §12's original justification overstated this). (b) The committed schema is `h-[0-9a-f]{4,6}` — Plan B widened it deliberately — so the preamble's four is wrong. **Resolved by deleting the resolver** (seam-4 fix pass): handles are a uniform SIX hex, which makes `mintHandle` a pure function of the record's own content and therefore STABLE, and `assertHandlesUnique` throws on a genuine six-hex collision rather than renumbering anybody. Zero duplicates at six hex on this seed, one at four. |
| **C, Task 8 Step 4** `orderDigestOf` | its own test asserts the digest changes when a handle's `sizeKm` changes | the body is `rank:handle:contentHash` — `sizeKm` reaches it only through `contentHash`, which a hand-edited ledger would not have recomputed. **The plan's test cannot pass against the plan's code.** The body now covers every field the ledger row states. |
| **C, Task 8 Step 4** `kitTypes` | `lexicon.filter((t) => kit.has(t.group))` | ignores `alsoGroups`, which is what the manifest's 178 group memberships against 170 types MEANS. Eight dual-listed types become unplaceable by an accident of which column they were filed under. |
| **C, Task 8 Step 4** `cellView` | called inside the per-type loop | one 8-neighbour walk per (cell, type) pair — 16.1 M of them on the real world. Built once per cell into parallel typed arrays, with `matchesRequires` kept as the reference and a 680,000-comparison equivalence sweep against the compiled form. |
| **C, Task 8 Step 1** test | `const { readdirSync } = require("node:fs")` inside the last test | `require` is not defined in an ESM `.mjs` test file. |
| **C, Task 8 Step 4** `orderHandles` | sorts on `sizeKm * sizeKm` and calls the key "area" | squaring is monotone on positive numbers, so it is the same order under a name that is wrong for two of the three geometries: a `point`'s sizeKm is a diameter and a `line`'s is a length. |
| **STATE §11** (this file) the world biome histogram | meadow 21.9, tundra 20.8, forest 18.2, desert 10.3, ice 10.0 | measured WITHOUT P2b. `water.test.mjs`'s `realWorld` never calls `assignSubstrate`, so the `karst` and `ash` rules could not fire and their cells fell through to forest and meadow. With P2b in the pipeline the same rule table reads meadow 34.2, karst 16.5, desert 13.0, tundra 11.5, ice 10.0. |

| **C, Task 7 Step 3** biome `reef` rule | `elev < 0.06 && temp > 0.7` | **the one continent whose whole identity is reef could never fire it.** `temp` is `latitude - lapse` on a 400 km frame; c11 Quillreef's committed centre is `[338, 66]`, so its warmest land cell reads **0.183** and the atoll came out **100.0% meadow**. `reef` is in exactly four palettes, so the palette clamp has ALREADY decided which continents may carry it and the global climate term only lets the premise and the rule disagree. Temperature term dropped (seam 3's ice remedy in mirror image). Measured: c08 11.0% unchanged, c13 11.1% → 11.7%, c06 1.0% → 13.7%, c11 0.0% → **11.8%**. |
| **C, Task 8 lexicon** (Plan B's committed rows) `fringing-reef`, `barrier-reef`, `reef-shelf-bank` | `requires: {nearFlag: SEA, elevMax: 0.4, tempDecileMin: 7}` | **`group: oceanic` appears in exactly ONE premise kit — c11's — so the kit had already pinned these three types to the atoll, and the temperature term on top of it made them unplaceable world-wide.** Term dropped from the three rows. Type coverage **165 → 168 of 170**; substitutions 109 → 106. The other six `oceanic` rows never carried it and were always placeable. |
| **C, Task 7 Step 4 / Task 10a fabric shape** (plan line 318, `ringsFromOwner` at 6379) | a region has ONE `ring`, and `rings[0]` is it | **18 of the 160 regions have a boundary of more than one ring and three enclose HOLES**, because `growRegions` is a D8 Dijkstra and a region can pinch to a single lattice corner. Under `rings[0]` this world silently drops **384.50 km²** — c04/r13 draws 308.00 of its declared 470.50 (−34.5%), c07/r02 346.50 of 504.00 (−31.3%), and c07/r02 needs five rings. `assembleRings` already returns `{rings, holes, areaKm2}` with the correct total for all 160; the fabric record must carry `rings` and `holes`. |
| **Spec §6.6** the group census, and "the 270 karst + volcanic instances comfortably supply all 60 dungeon doors" | twelve group targets summing to 1,740, and 270 karst + volcanic | **the census cannot be met by ANY placement.** A group can only receive instances from continents whose kit names it, so each has a hard ceiling: `volcanic` targets 110 against a ceiling of **35** (c10's entire instance budget) and `oceanic` 35 against **16** (c11's). 145 targeted instances against a 51 ceiling — 94 that must land elsewhere whatever the draw does. The world holds **189** karst + volcanic, of which 120 are `dungeonCapable`. The CONCLUSION survives anyway: `dungeonCapable` spans twelve groups, **307** instances over **117** regions, so P13's ≤3-per-region rule can reach **235** anchors against a quota of 60. |
| **C, Global Constraints / `landform-type.schema.json`** `precipDecile*` / `tempDecile*` | the name says decile (and landforms.mjs's own header said "rank-based and therefore immune to the 1-ULP problem") | **fixed-width VALUE buckets**, `min(9, floor(v * 10))`. Measured over the 256,000 owned land cells, where a true decile is 25,600 per bin: temp `50506 24053 38238 26656 25199 40821 26402 17574 6551 0`, precip `32000 38819 40725 40374 40489 34589 19082 6737 513 2672`. So `tempDecileMin: 7` selects **9.4%** of land, not 30%, and `precipDecileMax: 1` selects 27.7%, not 20%. 84 committed rows read these keys. NOT renamed — the name lives in the committed schema and in 84 authored rows; the false claim is corrected and the histograms are pinned. |

| **C, Task 9a Step 3** (:5113) | `mintSeed({ parentStream: stream, name: "settlements" })` | **the call cannot be written.** `settlements` is one of the four names `derived.json` commits per node, `mintSeed` THROWS on it (§13's guard) and the source scan over `tools/mapforge` reds on the written call site. The stream is INJECTED — `namedStream({ worldSeed, name: "settlements" }) = da45bd8930d33bb0`, which is exactly the literal the plan's own Task-9a tests already pass. |
| **C, Task 9a Step 3** (:5075 and :5161) | — | `const regionById` is declared **twice in one function scope**. The plan's `placeSettlements` is a SyntaxError and cannot be pasted and run. |
| **C, Task 9a Interfaces** (:4773) vs its own code (:5053) | `scoreSettlement({ grid, i, view })` | the body is `({ grid, i, v, regionSurvey, BIOME_NAME })`. Two signatures for one function, in one task. |
| **C, Task 9a Step 3** (:5013) | declares `COAST_NEAR_KM = 2, COAST_FAR_KM = 6` | **both are read by nothing.** The coast term is a plain D8 sea-adjacency test, so spec §6.5's three bands (1.0 within 2 km sheltered / 0.4 exposed / 0 beyond 6 km) collapse to two and the two named distances are dead beside a rule that cannot see them. With the bands implemented the three hold **2,574 / 6,955 / 9,366** of the 18,895 eligible cells. |
| **C, Task 9a Step 1** fixture (:4848) | sea at `elev = -0.6` under land at ~0.25 | `localSlope` is the largest step to any D8 neighbour, **sea included**, so every coastal land cell reads 0.85 against `slopeMax` 0.08. No cell is port-eligible, and the plan's own first Task-9a test (1 capital) cannot pass. On the real field the elevation is continuous across sea level and the slope veto fires on 360 of 25,600 surveyed cells, so this is a fixture artefact. Sea is a 0.24 shelf here. |
| **C, Task 9a Step 1** fixture, and `BIOME_NAME = null` (:5072) | — | the fixture never sets `grid.biomeNames`, so `grid.biomeName(i)` is null everywhere and the `{ice, lava}` veto **cannot fire in any fixture**; and the parameter's `null` default makes the veto silently OFF for any caller who forgets it. `placeSettlements` now refuses to run before P8, the way P9 already does. |
| **C, Task 9a Step 7** review brief (:5215) | separation should be **same-tier only** ("a village 3 km from a capital is fine") | spec §6.5 derives the per-region cap from the 9 km separation, which is a claim about ALL settlements, and the plan's own test at :4931 asserts it. Measured under same-tier-only: village `c02/s09` lands **0.50 km — one cell —** from capital `c02/s01`. Under the shipped rule the closest pair in the world is 9.01 km. |
| **Spec §6.5** and **C, Task 9a** test (:4931) | "a 9 km separation admits at most 2 settlements per 160 km² surveyed region, which is exactly the per-region cap" | true of a **disc** and false of these regions (mean isoperimetric 0.391). Measured with no explicit cap: `c02/r08`, `c03/r12`, `c03/r15` and `c03/r22` each take **3**. The cap is now enforced, not derived. |
| **Spec §6.5** | "the three capitals are the three charted ports: Gildmark (Wealdmarch), Tallowquay (Coldreach), **Netstead (Stonemoor)**" | **c04 Stonemoor has ZERO port-eligible cells** — no sheltered water beside settlement-eligible ground (ports by continent: c02 38, c03 99, c05 165, c07 63, c09 155). The generated capitals are c02, c03 and c05. Plan D pins `c-town-netstead` on c04 as a capital requiring sea; it will hit this. |
| **STATE §11 and §12** (this file) | c10 Ashen Spar's zero eligible cells are "the **treeline** veto against a volcanic arc's relief", with two remedies offered (lower the relief, exempt `volcanic-arc`) | **MISATTRIBUTED, and both remedies achieve nothing.** Of c10's 640 surveyed cells, **ZERO clear every veto other than the treeline**, so deleting the treeline outright still leaves 0. Independent veto hits: freshWater **615**, treeline 173, lava 108, slope 25. c10 carries **0 RIVER cells and 0 LAKE cells** and its moisture is p50 **0.0000** / p90 0.0219. Ashen Spar is a waterless volcanic arc and `freshWaterMin: 0.20` is doing exactly what it exists to do. **Resolution: 0 settlements on c10, accepted** — the quotas are world totals and the §6.5 per-continent table is prose. |
| **C, Task 9a Step 3** (:5064) and the committed `grid.fetchKm` | `waterFetchKm` re-implements a shelter test from scratch, min over 8 D8 rays from the land cell | a THIRD definition of fetch beside `classifySea`'s. `grid.fetchKm` is **max over the two axes** (wave exposure); spec §6.5's "adjacent water has fetch < 15 km (bay, fjord, estuary)" needs **min over the two axes** (enclosure). Measured: max-over-axes leaves **4 port-eligible cells world-wide, all on c05** — one capital possible; min-over-axes gives **520 over six continents**. `narrowWaterKm` is the min-over-axes twin, built from the same four sweeps and joined to `classifySea` by re-deriving its output cell by cell. **PLAN D HAZARD:** a pin declaring `water.shelterFetchKmMax: 15` measured against `grid.fetchKm` is unsatisfiable at **332 of the 520** port cells and at all three generated capitals (their water reads 240.5 / 56.5 / 48.5 km). Plan D must read `narrowWaterKm` for `pinReceipts.measured.shelterFetchKm` or restate the threshold. |
| **C, Task 9b Step 13** (:5376) | `pathKm` uses `(a[0] - b[0]) ** 2` | `**` is in the committed determinism inventory's `IMPRECISE` regex (`tools/mapforge/tests/determinism-inventory.test.mjs`). The plan's own code reds the suite in the file it lands in. |
| **C, Task 9b Step 13** (:5456-5471) | Prim runs a **full Dijkstra per candidate PAIR per step** | O(V²) searches over the raster; the plan's own Step 17 predicts it. Replaced by ONE multi-source Dijkstra per Prim step, stopped at the nearest target. Measured **664-796 ms** with the early stop, **1,214-1,426 ms** without, of a 4,000 ms generate stage. Proved byte-identical to a run-to-completion Dijkstra on the real field. |
| **C, Task 9b Step 13** (:5399-5405) | `flowDir < 0` counts as "drains" | an interior sink priority-flood failed to route is elected a **river mouth in the middle of a continent**. A sink now counts only if it actually touches sea. |
| **C, Task 9b Step 13** (:5417) | the upstream walk is bounded by `grid.n` | that converts a repeated cell from a hang into a **640,000-point chain**. (The condition is unreachable on a valid field — `flowDir` is a function, so the inflow relation is a tree and a cycle has no outlet and therefore no mouth — but the plan's bound is the wrong shape for the case it names.) |
| **C, Task 9b Step 13** (:5489) | the sea lane whitelists the two **land** endpoints into `passable` | a capital is port-eligible anywhere in a 2 km band and need not be D8-adjacent to water, so the search has no first step, `shortestPath` returns null and `if (!r) continue` **drops the lane silently**. Lanes are routed between the capitals' nearest sea cells with the two capital points prepended and appended. |
| **C, Task 9b Step 13** (:5465) | the road raster is "not sea" | four pairs of landmasses **physically touch** on the refitted mask (§12), so a road may leave its own continent and put another continent's coordinates in this continent's fabric file. The raster is this continent's OWNED land, which also excludes lakes for free. **The same rule was missing from `traceTrunkRivers` and is now there too** — reproduced on a two-plate fixture, 24 of one continent's river points on the other's ground. |
| **C, Task 9b** `trunkRivers` | one trunk river per continent | **c08 and c11 each hold a single RIVER cell** that drains to sea with no inflow — one point, not a polyline. Emitting it hands Plan E a river with nothing to draw. Both are omitted and NAMED in `problems`; 7 continents carry a trunk river, not 9. |
| **C, Task 9c Step 23** (:5668) | `hashNoise2D({ x: inst.cell[0] * 0.83, … })` | the plan's OWN Task-9c fixtures (:5561-5565) build instances with no `cell`, so this is a TypeError on the plan's own test; and those fixtures pass `stream: "seedseedseedseed"`, which `streamInt` has thrown on since seam 1. The draw is keyed on the **handle** — seam 4's ruling — through an integer mix, never on array position. |
| **C, Task 9c Step 23** (:5688) | `hopsToSettlement: hops.get(inst.region) ?? null` | the `?? null` tail is **unreachable** behind an eligibility filter that already required `h <= MAX_HOPS`. Removed; **Task 11's `fabric-file.schema.json` still types the field `["integer","null"]` for Plan D's overlay and must keep doing so.** |
| **C, Task 9c** (:5650-5700) vs **C, Task 11 `gWorldPoi`** (:7502) | Task 9c filters dungeon eligibility on `dungeonCapable` and `hops <= 2` and never reads `region.survey` | **the SAME document forbids the result 2,000 lines later.** `gWorldPoi` counts every `dungeonAnchors` row into its region's POI total UNCONDITIONALLY — unlike instances, which it counts only for surveyed regions — and then requires a reported region's total to be exactly 0 (spec §6.4 rule 2, §6 "reported region exactly 0"). As written, Task 9c put **36 of 60 anchors in reported regions**: measured 43 `gWorldPoi` failures with the anchors against 7 without, i.e. 36 gate failures authored in Task 9 and payable in Task 11. Anchors are now restricted to surveyed regions — and that is also what makes `MAX_PER_REGION` live (§14). |
| **C, Task 9a Interfaces** (:4785) and its own error message | `pinned` elements are shaped `{ id, at, cell, continent, region, rank }` | **omits `title`**, which the code reads. Plan D's `placePinned` returns one, so the two agreed by luck; a Plan D implementer following the plan's declared shape would produce a titleless pin, which minted `f-town-c-town-gildmark` — a legal, collision-free id that passes every Plan C check and reds `G-NET`/`G-CANON-LEG` at Plan E's redraw with no fix available inside Plan E. `placeSettlements` now THROWS on a titleless pin and `townSlug` refuses to fall back for one; the declared shape in the error message is corrected and filed in **Plan D's Consumes block** (`…-d-…md:1827`). |
| **C, Task 9a** (:5169) and **C, Task 10** (:6614) | `assignLevelBands({ regions, settlements, manifest })` | the function's whole stated purpose is that a moved difficulty-gradient origin "says so in `problems` rather than in nobody's log" — and `problems = []` defaulted it into nobody's log. **Task 10's own call site passes no `problems` and reads no return value**, so as the plan is written the origin record and the unbanded-region report are both discarded. `problems` is now REQUIRED and throws without one. |
| **spec §6.4 rule 2** ("no interior detail inside a reported region — no settlement dot, **no road**, no terrain fill") | roads must not cross a reported region | **unsatisfiable as written, and not previously recorded.** 120 of 160 regions are reported, so a continent-spanning MST cannot avoid them: measured **20 of 38 roads, 956 of 1,666 points**, run through reported ground. No gate reds — Task 11's `gWorldPoi` deliberately does not count roads ("roads are inter-region; counted at their endpoints' settlements") — so this is a SPEC error, not a generator defect. **Plan E must decide whether to draw road ink over hatched ground**; the alternative readings are "no road ENDPOINT" or "no road INK, route freely". |
| **C, Global Constraints** and `manifest.quotas.dungeons` | `{ complexes: 60, floors: 190, families: 3, familySize: 8, bespoke: 36 }` | **P13 produces `complexes` and nothing else.** `floors` occurs exactly twice in the whole Plan C document, both times as a declaration; no pass generates a floor, a family or a bespoke marker. Pinned in `settlements.test.mjs` so the omission is a stated fact. |

The plan text already self-corrects two more: spec §8.6's "checkSpine is already parameterised
with an injected collector" (it is not — it closes over module-level bindings) and §8.2's
"G-DEPTH gains a real depth for sea" (`TIER_DEPTH` already has `sea: 2`).

**Numbers the plans disagree on — Plan B Task 1 is the sole authority:**
**170** landform types / **178** group memberships (not the spec's 164/172), 8 dual-listed,
23 `dungeonCapable`. The `requires` predicate vocabulary is closed at exactly **11 keys** under
`additionalProperties: false`.

---

## 6. Traps that will bite again

**Setup, every plan:**

1. `psrw claim` branches from **`main`**, not from `release/<v>`. The fresh worktree will not have
   the map machinery. Run `git merge release/1.8 --no-edit` in it before anything else.
2. The worktree's root `plan.md` is a **stale leftover from whichever feature ran last**, and
   `psrw claim` tells you to read it. Overwrite it with a pointer to the real plan document
   before dispatching any agent.
3. A fresh worktree has no `node_modules`. `scripts/` installs with `npm install --prefix scripts`.
   `colyseus-server` and `nakama` are **pnpm workspace members** — `npm install` there dies on
   `workspace:*`. Use `pnpm install --frozen-lockfile`; `npx jest` works directly.

**Testing:**

4. `node --test` needs a FILE LIST. Locally use the **quoted** glob `node --test 'path/*.test.mjs'`.
   In CI and any `bash -e` step it must be **UNQUOTED** — `.github/workflows/ci.yml` pins Node 18,
   which has no Node-side glob. Quoting it there runs **zero tests and still goes green**.
5. `node --test` runs files **in parallel**. Two files that mutate the same tracked artifact will
   collide — in Plan A that reproduced 1 run in 3 and could have permanently written truncated
   bytes over a committed map. **Run a suite more than once**, and check `git status` after.
6. Deleting a small test file does **not** speed up a parallel suite — it removes a worker, not
   critical path. One file dominates the wall time.
7. A gate that "passes" may have stopped checking. **Assert the printed record counts**, not just
   exit 0. All three gate joins `return 0` on a failed load.
8. **Mutation-test every new rule**: delete it, watch the suite go red, restore. A rule whose
   deletion leaves the suite green protects nothing. A test comparing two hardcoded constants is
   not a test.

**Coordination:**

9. This repo has **13 live worktrees**, six for features that already shipped. A session that
   believes it owns its worktree may be editing a sibling's branch. Always pass `-C <worktree>`
   to git — the shell's working directory silently reset to the main checkout during Plan A, and
   a git command run there does not error, it answers a different question plausibly.
10. `general-purpose` is an agent **type**, not a routable identity. Several sessions message
    under it; replies fail and authorship gets mis-assigned. Only agent IDs route.
11. Concurrent reviewers detect each other's deliberate break-and-observe probes as bugs. Say in
    the brief that other sessions may be probing.

---

## 7. How to run a plan

What worked for Plan A, in one paragraph. Claim the feature, merge the release branch in, tag the
base, then run the tasks in seams of two or three as background workflows — each task being
implement → two independent adversarial reviewers → one fix pass that adjudicates rather than
obeys. Reviewers must **re-run the commands themselves**; an implementer's green run is not
evidence. The fix agent must be told to **refute** wrong findings with evidence rather than
"fix" correct code — in Plan A a fixer overturned a remedy three reviews had agreed on, by
building the counterexample, and was right. Between seams, verify the baselines in §2 yourself
before dispatching the next one.

**Keep the orchestrator thin.** Point agents at this file and at their task section; do not read
plan preambles into the main conversation. Have workflows return a per-task
`{task, verdict, commit, status}` summary — not the full findings objects — and have long review
reports written to a file that returns only its path.

---

## 8. Open follow-ups

**From the F-047 seam-4 (Tasks 10-12) fix pass, 2026-08-22.** Each was reproduced before being
filed; none is a guess.

- **`SHEETS.cluster1.maxLabelRank` is INERT.** `basin-sheet.mjs` never calls `placeLabels` — it
  draws its names directly — so the number nothing reads sits beside a test asserting it exists.
  Wiring it in re-inks `cluster1-world.svg`, which is **Plan E's redraw**, not a fix. The
  registry row now says so, and `render-sheet.test.mjs`'s "which sheets actually RUN a label
  declutter" test pins the fact from the source so the note cannot rot.
- **`bake_thumbnails.mjs`'s call to `carryForwardFiltered` has no test on its WIRING** (the pure
  function is covered 4/4). Covering it means running `main()`, which needs `sharp` and Blender.
  Recorded rather than chased because the failure is LOUD: without it a `--only` run wipes the
  other 640 index rows, and `check_asset_manifest.mjs` guard (U) fails on every one of them —
  `thumb_freshness.test.mjs` pins that case. Worth doing when the baker is next refactored.
- **~200 lines of `scripts/tests/world-budget.test.mjs` were reformatted by prettier** during
  seam 4, unrelated to the tasks. Verified: no semantic change, and `scripts/`+`tools/` are NOT
  in the repo's prettier scope (husky/lint-staged runs it on `colyseus-server/src/**/*.ts` only),
  so this was an out-of-scope reformat. NOT reverted — the fix pass has since added ~280 lines to
  the same file, so undoing it now costs a large diff for no behavioural gain.
- **Two recorded mutation SURVIVORS, both benign and both explained at the call site**, so the
  next reviewer does not re-derive them: (a) restoring `atlas-sheet.mjs`'s `checkBiomeInk`
  self-comparison stays green — on that sheet the emitted and painted pattern sets coincide by
  construction (measured: 3 and 3, at every legend tier), so no fixture can separate them;
  (b) dropping `asked` from the atlas's `checkLabels` call stays green — the three label buckets
  always reconcile there. Both arguments are defence for a future sheet whose draw pass can skip
  a subject; the rules themselves are killed by direct fixtures.
- **`G-RASTER-BUDGET` still runs in ONE venue (Gate 2) and that is a DECISION, not an oversight.**
  Review A observed it correctly: `ci.yml` installs no librsvg, so all six raster tests skip
  there. Installing `librsvg2-bin` in CI was considered and REJECTED — it would put a wall-clock
  performance assertion on a shared, contended GitHub runner, which is the exact condition that
  produced review A's own 1-in-8 red on a developer box. What DOES run in CI is the deterministic
  half, and it now reads the same defects out of committed bytes: the aggregate pattern-area cap,
  the new per-clip direct rule, and the ink floor. Verified on Node 18 in a container: mapforge
  251 tests / 245 pass / 6 skipped, storybook 54/54, content gate 0 failures — and blanking the
  atlas thumb reds the storybook suite and prints three `G-SHEET-BUDGET` failures on that same
  Node 18.
- **The determinism ban is now an INVENTORY, not a prose rule.** "`Math.hypot` BANNED" named one
  function while the committed-byte path uses hypot x7, `atan2` x6, `Math.PI` x8, and — in
  `world-gen.mjs`, which builds the *committed* canary sheet — `Math.cos`, `Math.sin` and `**`.
  All predate `plan-b-base` and all are empirically byte-identical on CI's Node 18 and local
  Node 26, which is what `check_render_lock` measures on every run. They are frozen by file and
  count in `tools/mapforge/tests/determinism-inventory.test.mjs`; a NEW one goes red. `Math.sqrt`
  is explicitly outside the rule (IEEE 754 mandates correct rounding for it and not for the
  others). **Plans B-E should stop repeating the hypot-only wording.**


- **I-098** — stale references to what Plan A deleted: two committed schema `description` fields
  still name the deleted mirror as the authority (→ Plan D); three comments describe deleted code
  as present, one asserting test coverage that no longer exists (→ any time); and
  `tools/mapforge/lib/basin-sheet.mjs:143,:729` name the deleted `render-map.mjs` **inside the
  committed SVG's drawn bytes** (→ **Plan B Task 12**, the one commit permitted to re-ink).
- **I-096** — `check_spine_emit.mjs` silently drops any region it cannot resolve. Real in today's
  map, independent of this programme.
- Unclaimed work Plan A left on the table: a path-keyed ajv memo. `lib/story.mjs:51-55` builds a
  fresh `Ajv` and recompiles on **every** call — none of Task 13's speed-up came from schema
  reuse, it was all process startup.

---

## 9. Plan C seam 1 (Tasks 1-2) — settled, do not re-raise

Appended 2026-08-22 by the seam-1 adjudicating fix pass, after two independent adversarial
reviews (A: 1 major / 9 minor, 23 mutations killed / 0 survived; B: 4 major / 7 minor, 20 killed
/ **12 survived**). The two survivor counts were not a disagreement about rigour — they covered
different files. Every one of B's twelve was checked.

**What the seam now guarantees that it did not.**

- **The noise field is pinned to VALUES, not only to itself.** This was the seam's real defect:
  six mutations — `hash3`'s multiplier, `hash3`'s final xor-shift, `toSigned`'s divisor, `fbm`'s
  `freq *= lacunarity`, `mintSeed` sha256→sha512, `mintSeed`'s join order — each produced a
  **different world** with the whole suite green. Golden literals now pin `hashNoise2D` (one
  positive and one negative sample), `fbm`, `smoothstep` and `falloff`, and `mintSeed` is joined
  to **all 176 committed streams in `content/spine/derived.json`** (44 nodes × 4 names), which
  ties `tools/mapforge/lib/seed.mjs` to `scripts/lib/spine.mjs`'s `streamSeed()` at the same
  time. **If a later plan deliberately changes the field, those literals are what must be
  re-baselined — that is the point of them, not an obstacle.**
- **One comment policy for the two determinism scans.** `tools/mapforge/tests/_source-scan.mjs`
  holds the single stripper; `determinism-inventory.test.mjs` and `noise-determinism.test.mjs`
  both use it. Before this, a `/* … Math.cos … */` block or a `/** @see Math.hypot */` JSDoc
  reddened the suite on prose, and a legitimate `Math\n  .floor()` reddened it on correct code,
  while the inventory three files away deliberately stripped comments and its header said why.
  Stripping preserves line numbers, and the `Math` scan takes its tail **across newlines**.
- **The two scans are COMPLEMENTARY, not redundant — REFUTED as a contradiction.** The inventory
  reads the whole of `lib/` by directory (so it covers new files, e.g. Task 3's passes) and
  catches dotted forms; the whitelist covers three files by name and catches indirect spellings.
  Keep both.
- **`tools/mapforge/*.mjs` — one level ABOVE `lib/` — is now scanned too.** A `Math.cos` helper
  there evaded both scans while being importable from `lib/`. Measured clean today, so its
  inventory is empty; Task 10's CLI lands in exactly that directory.

**Decisions taken deliberately — with the evidence, so they are not re-litigated.**

- **`idx` is NOT bounds-guarded, and cost was not the reason.** `idx({cx: 800, cy: 10})` returns
  8800, which decodes to (0, 11): the east edge wraps to the west, one row up. Measured cost of a
  guard inside `idx`: ~0.7 ns/call, 13.5 ms over 20 M calls — **0.34 % of the 4 s generate
  budget, affordable.** It is still not there because of SHAPE: a guard returning −1 makes the
  typed-array read `undefined`, which is equally silent, and one that throws can abort a pass at
  cell 639,999. The guard is a **named accessor** instead — `inBounds` and `neighbourIdx` (−1 off
  grid) in `tools/mapforge/lib/grid.mjs` — with the wrap pinned as a fixture, including the
  corner-has-3-neighbours / edge-has-5 counts a wrap would silently report as 8.
  **Tasks 3-9 must use `neighbourIdx` for D8 walks.**
- **The `civil` byte budget was NOT invented; the PRINT was fixed.** There is no aggregate byte
  cap for `civil` by design (600 × 8 KB is unbounded in aggregate) — so adding one would have been
  a design decision the plan never made, while the line was simply untrue. `world-budget:` lines
  for file-measured families now name every term's unit and print only terms the family has.
- **The ban's "indirect route" scan is ACCIDENT prevention, not an adversarial sandbox.** Measured
  by the reviewer: `globalThis["Ma"+"th"].cos`, `Reflect.get`, `const E = eval`,
  `[].constructor.constructor`, `(1/3).toFixed(4)` and `toLocaleString` all evade it. Every form
  that SPELLS `Math` is caught, which is every form a later pass reaching for `Math.cos` by name
  will use. The comment claiming completeness was the defect and is now what is true; `CODEGEN`
  was broadened to ban `eval` and `Function` by NAME rather than by call shape. **Do not build the
  sandbox.**
- **`SUBSTRATE_MASK`'s test is not a tautology — REFUTED.** The reviewer's first mask mutation
  (`0x2c0`) was not a mutation at all (`64|128|512 === 0x2c0`); a genuinely different mask IS
  killed, by the `deepEqual` on `SUBSTRATE_FLAGS`.
- **`streamInt` keys the field on 32 bits, not 64 — verified harmless and left alone.** All 176
  committed streams have 176 distinct 8-character prefixes and all 176 pass the hex guard.

**Recorded mutation SURVIVOR, benign, explained at the call site** (`grid.mjs`): deleting
`regionId`'s `< 0` guard stays green — `regionIds` is a plain array, `regionIds[-1]` is
`undefined`, and the `?? null` tail answers `null` for both paths, so no fixture can separate
them. The companion `?? null` rule IS live and is killed by a fixture. Do not re-file this.

**Open, recorded rather than chased.**

- **`./scripts/precheck.sh` (Gate 1) has no scripts-suite lane and no mapforge lane.** So the
  whole determinism ban, and every `world-gates.test.mjs` rule that is not reachable through
  `check_content.mjs --only=spine`, runs only in Gate 2 (`integration.sh`) and CI. Pre-existing
  wiring, outside this seam. It is why `content/world/manifest.json` being deleted was green at
  Gate 1 until this pass added the gate rule.
- **Substrate mutual exclusion is prose, not code.** `setFlag(CARBONATE)` then `setFlag(VOLCANIC)`
  leaves both bits set; there is no `setSubstrate` that clears `SUBSTRATE_MASK` first. **P2 must
  either clear the mask itself or add that helper.** Likewise `hasFlag` on a multi-bit mask has
  ANY semantics (`hasFlag(SUBSTRATE_MASK)` is true with only `SAND` set) — reasonable, and now
  written down.
- **`budget.interstitialComposition` is the single object the manifest schema leaves open**
  (`additionalProperties: {type: number}`; the reviewer's probe found 42 of 43 object paths
  locked). It is joined to `BIOMES` by a test rather than closed with an enum in the schema,
  because a second copy of the biome vocabulary is the exact drift the `n-atlas` join exists to
  prevent.
- **`content/world/manifest.json` and `content/spine/nodes/n-atlas.json` are now joined** on seed,
  frame, grid tiling and interstitial composition. **Plan D and E: add to that join, do not start
  a second one.**

---

## 10. Plan C seam 2 (Tasks 3-4) — settled, do not re-raise

Appended 2026-08-22 by the seam-2 implementation, then **revised the same day by the seam-2
adjudicating fix pass** after two independent adversarial reviews (C: Task 3 / the refit —
5 major, 9 minor, 18 mutations killed / 9 survived; D: Task 4 / sea level / determinism —
4 major, 4 minor, 21 killed / 3 survived). Ten more plan errors are in §5 above.
**Where this section and the seam's own commit messages disagree, this section is right** —
a commit message cannot be amended, and two of the seam's overstated what they had proved.

### What the seam guarantees NOW

- **LAND IS A SUBSET OF THE CONTINENTAL MASK, and it is asserted.** This was the seam's real
  defect and it was hiding behind a false justification. `elevation.mjs` claimed "selecting the
  k-th largest elevation can only ever pick ocean floor if the masks cannot supply k cells —
  which is exactly the premise-footprint bug P3's message names". **False in the direction that
  matters.** With the plan's own Step 4 radii, `selectSeaLevelByRank` did **not** throw: it
  returned `landCells` exactly 262,400 — dead on target, inside the band, at the on-plan ratio —
  by classifying **73,831 ocean-floor cells (28% of all "land")** as land, scattered wherever the
  ocean fbm peaked. The band cannot see it, because the count is right. What separates the two
  worlds is WHERE the threshold fell: `buildElevation` puts ocean floor in [−1, −0.5] and land in
  [0.01, 1], so a sea level below the land floor means rank selection reached into the ocean. That
  is now **one comparison in `selectSeaLevelByRank`**, plus a cell-by-cell `land ⊆ mask` assertion
  on the real 800 × 800 field, plus a fixture that reproduces the phantom shape (a *varied* ocean
  floor — the flat-plateau fixture cannot reproduce it, because identical ocean values all tie at
  the threshold and the band catches the undershoot instead) and the boundary case where the
  threshold sits exactly ON the clamp. `ELEVATION_BANDS` is one constant read by both the clamp
  and the guard, not two literals kept in step by hand.
- **The premise footprints are FITTED, the procedure is COMMITTED, and the files are joined to
  it.** `tools/mapforge/fit-premises.mjs` holds the plan's Step 4 table, the target derivation and
  the fitted `SCALE` vector; `mask.test.mjs` rebuilds all thirteen footprints from it and compares.
  Centres, `coastClass`, `areaBandKm2`, `register`, `levelBand`, `palette`, `landformKit`,
  `structuralIdea` and every structure `kind`/`amplitude` are the plan's, untouched.
- **The fit target is the manifest's own per-continent split**, `netKm2 + interiorWaterKm2`, not
  `netKm2 × 1.025` spread uniformly. Worst error **0.100%** (was 0.71% against the wrong target);
  every continent lands inside its `areaBandKm2` after P7 carves its interior water.
- **`structures` scale with the footprint.** All 28 normalised structure coordinates are the plan's
  again (c03's ridge back to 1.16/1.17 of the rim, c12's rift to 0.92/0.96, c11's lagoon to 0.600),
  so the committed `structuralIdea` prose and the committed geometry agree. A structure that stops
  scaling reds `materialise is a SIMILARITY about the centre`.
- **`MASK_SHELL_FACTOR = 1.22` is the free parameter the first fit left implicit.** The rank target
  pins TOTAL land, so the thirteen per-continent errors fix only the SPLIT — the overall scale is a
  degree of freedom they cannot see. Left free, the damped iteration walks it downhill until every
  masked cell is above water: **measured, by iteration 8 the sea level had fallen onto the 0.01
  clamp and the fit oscillated between 1% and 6.5% forever.** That collapse *is* phantom land in
  slow motion. Mask area is now pinned at 1.22× the rank target (320,133 cells), asserted in the
  800 × 800 golden.
- **`warpKm` is derived by one rule, `round(min(rx, ry) * 0.27)`** — the plan gives only c02's
  example value 12, written against the pre-fit radii `[58, 44]`, which the rule reproduces exactly.
- **P2b's noise field is GONE, and the substrate rule is measurable.** See §5. Substrate output is
  byte-identical; P2b went 173 ms → 5 ms. The rule that replaced the plan's "> 0.5 majority" test is
  the exact one: **one class per plate, decided by the kit**. `FLAG.ARC` is minted in
  `assignSubstrate` and nowhere else, always with `FLAG.VOLCANIC`, and the stale-bit fixture now
  pre-sets ARC too — without that, deleting `flags &= ~FLAG.ARC` survived, and a stale ARC is
  exactly the blanket-ARC world (cones on the ice cap) the neighbouring test exists to prevent.
- **Seam 1's two open items are closed.** Substrate mutual exclusion: `assignSubstrate` clears
  `SUBSTRATE_MASK` (and `FLAG.ARC`) before setting, so it is idempotent and exactly one class lands
  per masked cell — fixtured by pre-setting all four bits and re-running. `hasFlag`'s ANY semantics
  are never relied on: every read counts bits explicitly.
- **`applyPremiseMasks` hoists the domain warp out of the premise loop** — it is a function of
  (cell, stream) only. 4,725 ms → **766 ms cold / 525 ms warm** (the seam's own comment said 460 ms;
  that did not reproduce on a second machine), bit-identical, with a parity test against
  `premiseMaskAt` over a 60 × 60 sweep.
- **Golden vectors, not just properties.** A field digest plus point samples pin the mask field, the
  plate histogram, the elevation field, the substrate split, the flag field and the real 800 × 800
  sea-level record. All re-baselined for the refit **and for nothing else**; `rank`, `landCells`,
  `landKm2` and `seaToLandRatio` did not move (`seaLevel` 0.043910134583711624 →
  0.043565794825553894, `deepest` 916.3983764648438 → 916.0540771484375).
- **The determinism ban's coverage is DERIVED FROM THE TREE.** It had been found holed in two
  consecutive seams, both times because it read a maintained list. `tests/_source-scan.mjs` now owns
  one recursive walk, one extension class (`.js .cjs .mjs .ts .cts .mts` — a `lib/helper.js` is
  CommonJS and importable from every `.mjs`, and carried `Math.cos` + `Date.now()` past both scans)
  and the four grandfathered lib files. The census inventories `lib/` and requires everything else
  under `tools/mapforge/` outside `tests/` to be empty; the whitelist takes every lib file except
  the four. **A new directory, extension or pass is covered by default — there is no list left to
  forget**, and the coverage rule itself is a test.
- **Task 4's headline test can now fail.** The committed "HALF-field nudge" test claimed in its own
  comment to permute rank order across the threshold; measured, consecutive `ramp(640000)` values at
  the rank index are **26 float32 ULPs** apart, so a one-ULP nudge cannot reorder anything and it
  reported 0 differing cells under an `<= 1` assertion, by construction. Replaced with a real
  adjacent-pair permutation across the threshold.

### REFUTED — with the evidence, so nobody re-raises them

- **"P3 throws on day one" — REFUTED, and it was the seam's own justification.** Measured above:
  no throw, 73,831 phantom land cells, every gate green. The *decision* to refit was right (the
  48,415 km² ceiling is arithmetic); the *reason* recorded for it was not. §5 is corrected.
- **"The refit is unnecessary" — REFUTED by review C, which tried to build the counterexample and
  could not.** Σ π·rx·ry over the plan's thirteen rows = π × 15,411 = 48,415 km² against 65,600
  required. No implementation of `mask.mjs` can mask more area than the ellipses it is handed.
  Do not re-litigate this.
- **Gross vs net is NOT conflated — REFUTED.** The manifest closes exactly (64,000 + 1,600 = 65,600;
  + 91,200 ocean + 3,200 interstitial = 160,000, zero residue), and plan lines 2280 and 6588 both
  compute the rank target as `grossLandPolygonKm2 / CELL_AREA_KM2` = 262,400. 262,400 is the gross
  target BY DESIGN. P7's lakes carry `FLAG.LAKE` inside it and are not re-subtracted.
- **The rank selection is genuinely order-independent — attacked and unbroken.** Three shuffles and
  a full field reversal, on Node 26 and Node 18, all return the identical `seaLevel` and
  `landCells`. Only the value at one index is read, never a position, so sort stability cannot reach
  it; `Float32Array.from` is lossless so no ties are manufactured. 623,518 distinct float32
  elevations of 640,000; exactly 1 cell sits at `=== seaLevel`. `-0`/`+0` is not a hazard.
- **`d >= 1` → `d > 1` and the `m > 1 ? 1` clamp are UN-KILLABLE BY CONSTRUCTION, not gaps.**
  Both explained at the call site in `mask.mjs`. `d === 1` gives `smoothstep(0) = 0` and every
  structure only subtracts, so both spellings return +0 there; `smoothstep(1 - d) ≤ 1` and the
  subtractive terms mean `m` can never exceed 1. **Do not re-file these.**
- **`sort()` → an explicit numeric comparator survives, and that is a deliberate control.**
  `TypedArray.prototype.sort` is numeric and total; the two are provably equivalent.
- **Dropping `"desert"` from c05's `landformKit` survives P2b, and that is correct.** Plan B's
  desert types are `rock: clastic`, so `desert` is not a substrate kit and there is deliberately no
  branch for it — the old `["desert", FLAG.SAND]` test row was vacuously true for all 13 premises.
  The kit IS read, by Task 8's instancing; a kit census belongs there. Explained at the call site.

### Open, recorded rather than chased

- **THREE continents have no coastal shell, not two.** Measured on the refitted grid: c07
  (Driftholt), c09 (Brightfall) and c10 (Ashen Spar) have masked cell count === post-rank land
  count, so every cell inside the footprint is above sea level and the coastline *is* the warped
  mask rim rather than a relief contour. **Task 5 traces its arcs off the sea/land boundary and will
  get a clean warped ellipse for those three.** Fixing it means lowering those premises' ridge
  amplitudes — premise data, and a re-fit — so it is Task 5's call with the arc quality in front of
  it. `tools/mapforge/fit-premises.mjs` is what re-runs the fit.
- **c02's inland-sea lobe scaled from radius 19 to 26.79** (2,255 km² of disc) while c02's
  `interiorWaterKm2` budget is 1,100. The lobe is a MASK subtraction, not a lake: measured, zero of
  its cells are below sea level today. **P7 must carve interior water to the budget, not to the
  disc** — the disc's plan radius happening to be ≈ 1,100 km² was not a join anything enforced.
- **`content/schemas/premise.schema.json` has no ajv venue.** Task 11's file list names `fabric-file`
  and `handle-ledger` and not this one. Until then `mask.test.mjs` holds the join in BOTH directions
  (files → schema and schema → the four enums verbatim; the one-directional version let the
  `register` enum be silently widened). **Task 11 should add it to `checkWorld`.**
- **`content/world/premises/` matches no family in `content/world/budgets.json`** (`fabric`, `civil`,
  `loop`, `landforms`, `sheets`), and `check_content.mjs` never mentions `premise`, so the 13 files
  are under no byte budget. Task 11's business, filed here because the ajv half was disclosed and
  this half was not.
- **P1+P2+P2b+P3 measured 1,405 ms cold / 1,120 ms warm** of the 4,000 ms `generate` budget
  (766 / 518 / 28 / 93). Ten passes remain. `applyPremiseMasks` is the dominant term and is already
  hoisted; the next saving there is skipping premises whose bounding box excludes the cell.
- **`selectSeaLevelByRank` is 800 × 800 ONLY, and that is now enforced.** Task 9a's `coast-world.mjs`
  fixture must supply its own threshold rather than calling it — it will get a throw naming the
  frame if it does not.



---

## 11. Plan C seam 3 (Tasks 5-6) — settled, do not re-raise

Appended 2026-08-22 by the seam-3 implementation, then **substantially REVISED the same day by the
seam-3 adjudicating fix pass** after two independent adversarial reviews (E: Task 5 / arcs —
ACCEPT-WITH-FIXES, 4 major, 22 mutations killed / 9 survived; F: Task 6 / hydrology —
**REJECT**, 1 blocker, 4 major, 23 killed / 2 survived). Sixteen more plan errors are in §5 above.
Commits: `64822b3` (arcs), `4651d9c` (hydrology), `4339a81` (winds + water), `1f7877d` (the fix
pass), `2f5796c` (mutation hardening).

**Where this section and the seam's own commit messages disagree, this section is right.**
Three of the seam's headline claims did not survive review and are corrected below.

### THE FOUR THINGS THE FIX PASS CHANGED — read these before anything else

**1. THE SEAM BUILT THE WRONG WORLD.** `arcs.test.mjs` and `water.test.mjs` passed
`stream: manifest.seed` — the WORLD seed — where every other consumer of the terrain field
(`fit-premises.mjs`, `mask.test.mjs`, `rank-select.test.mjs`) uses the committed child stream
`mintSeed(seed, "terrain") = d9a0051d32afab59`. **Neither review found it.** Consequences, all
measured: sea level 0.04435581713914871 against the fitted 0.043565794825553894; 37 arcs / 22
nodes against the real 42 / 23; and per-continent net land off its own `areaBandKm2` by up to
−59.3% (c12 at 407.25 km² against a [900, 1100] band) **while the thirteen still summed to exactly
65,600**. `lib/seed.mjs` now exports `terrainStream({ worldSeed })`, both real-world goldens join
it to `derived.json`, and every seam-3 real-world golden was re-baselined onto the correct world.
**This is the whole of review F's "per-continent area drift" (F4) — it is not a fit regression.**
On the terrain stream every continent's post-carve NET land is within **0.100%** of its manifest
`netKm2`, which is seam 2's own figure, and `water.test.mjs` now asserts it **on the generated
field** rather than comparing two committed constants the way `mask.test.mjs:50` does.

**2. THE MOISTURE FIELD WAS DEAD, and the suite could not see it.** Full detail in §5 and in
`winds.mjs`' own header. Median land moisture **0.0000 → 0.3452**; share of land below the desert
threshold / below the settlement veto / above the forest threshold **99.2 / 99.2 / 0.5 % → 21.0 /
27.0 / 28.3 %**. The normaliser is now `acc / (acc + REF)` with `REF` the 75th-percentile LAND
accumulator — scale-invariant, no atom at either bound, and unmovable by an outlier. **A digest of
a degenerate field is a perfectly stable digest**, so the golden asserts the DISTRIBUTION (median
band, both tail bands, and that each of the plan's three read-points splits the land
non-degenerately), and a degenerate accumulator now THROWS inside the pass.

**3. ICE IS PREMISE-GATED.** 21.6% of land → **10.00%**, and all of it on the two landmasses whose
committed palette carries `ice`: **c01 Rimewall Cap 96.9%**, **c12 Skerryfast 75.0%**. The three
palette contradictions (c11 78.6%, c07 60.3%, c03 41.7%, none of which lists ice) are gone by
construction, and a test asserts the rule rather than the number. `GLACIER_TEMP_MAX` moved
0.12 → 0.08 because **under the gate 0.12 is INERT** — both premises read 100% ice at anything
above 0.09, so the constant would have been dead beside a golden that could not see it.
Review F's "n-atlas says 1.87%, i.e. 4.4× less" is **REFUTED**: that is 1.87% of the FRAME in a
world `derived.json` records as 96.1% ocean — about 48% of that world's land — and it describes
the pre-Plan-C map besides.

**4. `assembleRings` RESOLVES NESTING.** See the ruling below. `{ rings, holes, areaKm2 }`.

### What the seam guarantees

- **The coastline is sliver-free ON THE REAL WORLD, not on a fixture.** `extractArcs` over the
  land/sea owner field traces **42 arcs at 23 nodes, 7,651 vertices**, simplified ONCE per arc at
  the pinned 0.35 km epsilon to **2,364**. On the TRACED arcs `assembleRings` returns exactly one
  ring per continent with `areaKm2` **exactly** its cell census, the thirteen summing to 65,600 km².
  41 ms trace + 20 ms simplify + 5 ms assemble.
- **…and the PRODUCTION path is measured too, which it was not.** Review E was right: the seam
  simplified each arc only to COUNT its vertices, threw the result away, and assembled from the
  UNSIMPLIFIED arcs — while all three of the plan's downstream callers assemble from the simplified
  ones. Douglas-Peucker MOVES vertices, so exactness after simplification is impossible by
  construction and the honest statement is a bounded loss: **−10.375 km² over the world, 0.0158%**,
  per-continent losses pinned individually, 0 proper crossings, still 13 single rings and 0 holes.
  Both paths now carry a ring-geometry sha256, because `cells` is recomputed from the same owner
  array and the per-continent equality was self-consistent by construction.
- **Interior water closes the ratio, and the number is now honest.** 6,400 lake cells = **1,600
  km²**, split c02 1,100 / c04 300 / c06 200 against the manifest's own column. See the ratio
  ruling below. Also 3,841 river cells, 27 delta cells, **26,241 glacier cells (6,560.25 km²,
  a tenth of the land)**.
- **`land ⊆ mask` is untouched.** Nothing in this seam writes `elev`, `plate` or `FLAG.SEA`: lakes,
  rivers, deltas and glaciers are FLAGS on cells that are already land, and `carveWater` refuses a
  cell that carries `FLAG.SEA`. The real-field golden re-asserts SEA/LAKE exclusivity cell by cell.
- **Golden VECTORS, not properties, on every field this seam produces** — arc/node/vertex censuses,
  per-continent ring areas, the fractalised coastline's 25 exact vertices, the bowl's filled
  surface / flow directions / accumulation, moisture and temperature digests, the lake CELL SET
  digest and three per-continent lake bounding boxes, the freshKm digest and its 103.5 km maximum.
- **Timings, re-measured after the fixes on a quiet box.** P1+P2 mask 690, P2b elevation 545,
  P3 sea level 115, P4 arcs 66 (41 trace + 20 simplify + 5 assemble), P5 winds 575, P6 hydrology
  475, P7 water 372 = **~2,840 ms of the 4,000 ms generate budget**, six passes still to write.
  The fixes cost ~120 ms: ~30 ms for the reference quantile's sort over 262,400 land floats, the
  rest in the lake growth key and ring nesting. `applyWinds` is still the largest single term, but
  it is no longer 500 ms spent on a field with no signal. **Review F's warning stands and is now
  tighter: ~1,160 ms for six passes, and P9's 160-region partition is the one that plausibly does
  not fit.**

### Decisions taken deliberately

- **THE HOLE-VS-LOBE RULING, settled once.** The seam left two contradictory contracts in one
  commit: this file said *"callers must SUM the rings"*, `arcs.test.mjs` asserted
  *outer − hole*, and all three of the plan's callers take `rings[0]`. Review E killed all three
  with one field — a 5×5 block of owner 0 with a 1-cell HOLE inside it **and** a separate 1-cell
  LOBE outside it: census 6.25, three positive rings [6.25, 0.25, 0.25]; SUM → 6.75 wrong,
  outer-minus-rest → 5.75 wrong, `rings[0]` → 6.25 right only because the two errors cancel.
  A flat area-sorted list of positively-wound rings **cannot** carry the answer, because a hole and
  a second lobe are the same shape at the same size.
  **The ruling: `assembleRings` resolves nesting itself and says so in its return shape.**

  ```js
  assembleRings({ arcs, ownerId }) -> { rings, holes, areaKm2 }
  ```

  `rings` are the OUTER boundaries (every disjoint lobe), largest first — `rings[0]` is the trunk
  polygon G-TRUNK-AREA scores, which is what the plan's callers already reach for. `holes` are the
  interior boundaries. `areaKm2` is Σ rings − Σ holes and is the ONE true area. **A caller cannot
  now sum the wrong list, because the holes are not in it.** Nesting is even-odd containment, so a
  lobe inside a hole (an island in a lake) is land again — fixtured. Verified area-exact over
  **all 19,683 3×3 three-owner fields (38,342 owner instances, 0 failures)**, where review E
  measured 64 fields failing the SUM rule. On today's real field every continent is 1 ring, 0
  holes, and the golden pins that so a future split is caught rather than absorbed.
- **An unclosed chain and a zero-area ring THROW.** `if (nextI === -1) break;` pushed a torn
  boundary through as a polygon of area 0 — precisely what the plan's inverted frame edges emitted.
  With the frame edges oriented correctly every chain closes, so a chain that does not close is a
  torn topology and this module exists to be loud about that.
- **c02's inland-sea deferral is CLOSED, and the STATE note that raised it was right.** The lobe is
  a mask subtraction whose disc is 2,255 km² against an 1,100 km² budget, and measured, none of it
  was below sea level — c02 traced ONE ring, no hole, so the lobe was dry land. P7 now carves
  **1,100 km² inside that disc**: a connected 47 × 53 km body at elevation 0.125-0.205 with **zero**
  D8 adjacencies to open sea. Budget, not disc, exactly as §10 instructed.
- **A lake grows on TERRAIN elevation, never on the priority-flooded surface.** Erasing depressions
  is the fill's entire job, so a 3 × 3 pit at 0.1 inside a 0.5 plain comes back at 0.5000051 —
  above the plain. Grown on `filled` the water lands on the flat rim and the pit stays dry.
- **A lake is not a bay.** `LAKE_SHORE_MARGIN` is stated twice, in km (1.5) and in cells (2), and
  the larger wins: the km figure is the world-model statement, the cell figure the topological one.
  At `cellKm 2` a 1.5 km margin admits the ring D8-adjacent to open sea.
- **`SWEEPS` is the whole 16-vector table**, and `applyWinds` enumerates BOTH upwind edges. See §5.

### THE RATIO RULING — what "interior water" means, and how the gate can fail

Review F is right that **`65,600 − 1,600 = 64,000` and the 1.500 that follows have zero degrees of
freedom**: rank selection returns its target BY DEFINITION and the carve stops at Σ(manifest
column) with no shortfall. The seam's wording ("the net sea-to-land ratio *is* 1.500 exactly") read
as a measurement and was not one. Two things changed, and **the number was NOT fitted**:

- **The assertion now COUNTS CELLS IN THE FLAG FIELD** rather than restating the two inputs:
  `waterCells = count(SEA) + count(LAKE)`, `netLand = n − waterCells`, and the frame must close.
  That is a different claim and it can fail — on `classifySea` disagreeing with the rank record, on
  a lake carved onto a sea cell, on a cell counted twice.
- **The rule, stated: `interiorWaterKm2` budgets STANDING water, and only standing water is
  subtracted from land.** `RIVER` and `DELTA` are CHANNEL flags on cells that stay land — at 0.5 km
  a river occupies a fraction of its cell, and that cell's biome, its region membership and its
  settlement score all still treat it as ground. **The honest alternative number is pinned in the
  same test rather than hidden: counting every channel flag as water gives 63,039.75 km² net and a
  ratio of 1.5381**, which is also inside the manifest's `[1.2, 1.8]`. A later reader who does
  count them finds it already measured and does not think the budget failed to close.

**`G-SEALAND` (Task 11) must measure the flag field, not the manifest.** If it recomputes the ratio
from `budget.grossLandPolygonKm2` and `budget.interiorWaterKm2` it will be an identity check with
the manifest on both sides and will never be able to fail. The two numbers above — 1.5000 and
1.5381 — are what it should be able to disagree with.

### THE ICE DECISION and the habitability margin

Decided against the committed content, which is the authority the repo already has:
**a landmass may carry `FLAG.GLACIER` only if its own `palette` contains `ice`.** Exactly two of
thirteen do. This is the same shape as seam 2's substrate rule ("one class per plate, decided by
the kit") and it needed no premise moved, no footprint re-fitted, and no ice budget invented that
the manifest does not carry.

Measured after the moisture and ice fixes, applying the plan's OWN Task 7 rule table (:3523-3542)
and Task 9 veto (:5010, :5057-5060):

| | before | after |
| --- | --- | --- |
| ice, share of land | 21.6% | **10.00%** (c01 96.9%, c12 75.0%, everywhere else 0) |
| land passing the settlement veto | 4,699.5 km² | **44,872 km² of 65,600** |
| landmasses with ZERO eligible cells | 5 (incl. c09 and c10, both surveyed) | **1 — c10 Ashen Spar** |
| world biome histogram | 56% desert, 20% ice | meadow 21.9, tundra 20.8, forest 18.2, desert 10.3, ice 10.0 |

- **160 regions: yes, with margin.** Regions tile all net land and ignore biome. Per landmass the
  demanded area is within tolerance everywhere — c01 5,760 km² demanded against 5,997.25 net,
  c12 960 against 999.5, c02 11,200 against 11,002.75. (On the WRONG stream c12 was 42.4% covered;
  that number is gone with the stream.)
- **45 settlements: yes, with a very large margin.** 44,872 km² survives the veto against 45
  settlements needing one cell each, and every landmass carrying surveyed regions has eligible
  ground except one.
- **The one exception, FILED not chased: c10 Ashen Spar has 1 surveyed region and 0 eligible
  cells.** The cause is neither ice nor moisture — it is the `treeline` veto (`elev > 0.72`)
  against a volcanic arc whose land elevation is p50 0.575 / p90 0.900. That is premise relief
  (seam 2) meeting a Task 9 constant, and it is **Task 9's to resolve**, with the options visible:
  lower the arc's relief, exempt `volcanic-arc` from the treeline, or accept 0 settlements on a
  landmass whose whole premise is "a strung line of cones".

### Recorded mutation SURVIVORS — each explained at its call site

**Do not re-file these.** 96 mutations across the seam plus **44 more by the fix pass**; the fix
pass killed nine that had survived (see `2f5796c`) and left three.

- `arcs.mjs` — the node rule's `pairs.size !== 1` term, the walk's owner-pair filter, and the walk's
  ascending candidate sort. All three follow from one fact with a four-line case analysis in the
  file: **on a square lattice a degree-2 corner always carries exactly one owner pair**, so the walk
  never has more than one candidate.
- `arcs.mjs` — `polylineSelfIntersects` starting `j` at `i + 2`. Consecutive segments share a
  vertex, so one of properCross's orientations is exactly 0 and it rejects them anyway.
- `hydrology.mjs` — the min-heap's index tiebreak. **It is reached and it cannot change the
  output**: two frontier cells tie only at the same value, and whichever pops first assigns the same
  `value + EPS`. Measured identical over the real 800 × 800 field and 300 tie-heavy random fields
  with the tiebreak deleted AND reversed. The identical comparison in `passes/water.mjs` IS
  observable (that heap flags what it pops) and both mutations die there.
- `passes/water.mjs` — the `FLAG.SEA` test in lake admission, subsumed by the shore margin (a sea
  cell is its own BFS source, so `inlandKm` is 0 there).
- `arcs.mjs` — `ringDepth`'s strictly-larger early-out. Two rings of one owner never cross, so a
  smaller ring cannot contain a larger one and `pointInRing` answers false unaided. Redundant, not
  dead: it is the early-out on the O(vertices) half of the loop.
- `arcs.mjs` — `pointInRing`'s half-open `(yk > py) === (ym > py)`. `>` and `>=` can only disagree
  when a vertex lies EXACTLY on the ray, which the exhaustive 19,683-field sweep, both nesting
  fixtures and the real coastline never produce. The half-open form is kept because it is the one
  that stays right if a caller ever does hand in such a ray.
- `arcs.mjs` — `assembleRings`' `order` sort. A no-op ONLY because the ids are zero-padded and
  minted ascending; drop the padding and `arc-10` precedes `arc-2` and this sort is the only thing
  restoring numeric order. **The padding and the sort are load-bearing together or not at all** —
  which is why the padding mutation reds 3 tests and this one reds none.

**Nine survivors the reviews recorded are now KILLED, so do not expect them:** the zero-area ring
(a synthetic there-and-back arc pair), `pts.length < 3` → `< 4` (a three-vertex polygon, the only
case a square lattice cannot produce), `ringDepth`'s parity (an island in a lake in a continent),
`simplifyArc`'s `bestD > epsilonKm` (a vertex exactly at epsilon, in exact binary), `fractalise`'s
two defaults, `DELTA_ACC_MIN` (a one-row channel whose mouth accumulates EXACTLY 900 — the old
golden held over an interval ~60 wide), and the reference quantile's index (seven land cells is the
smallest case where `round` and `floor` of `0.75(n−1)` disagree).

### REFUTED — with the evidence, so nobody re-raises them

- **"Per-continent area has drifted since seam 2's fit" (review F, MAJOR 4) — REFUTED.** It was the
  wrong terrain stream, above. On the committed stream the worst per-continent NET-area error is
  **0.100%**, exactly seam 2's recorded figure, and all thirteen are inside their own
  `areaBandKm2`. Review F's observation that `mask.test.mjs:50` compares two committed constants
  and never touches the field is nonetheless **correct and acted on** — the field measurement now
  lives in `water.test.mjs`'s real-world golden.
- **"n-atlas constrains ice to ~1.87%" — REFUTED.** 1.87 is a percentage of the FRAME in a world
  `derived.json` records as 96.1% ocean, i.e. roughly 48% of that world's land, and it describes
  the pre-Plan-C map. It is not the small-ice constraint it reads as.
- **"prevElev tracks the ocean floor, so the whole parcel lands on the first land cell" —
  REFUTED, by review F itself and re-confirmed here.** Clamping `prevElev` to ≥ 0 moves the
  collapse from 99.2% to 99.4%. The accumulator was never the defect.
- **"the seam's `fractalise` gives up on the real arcs" — REFUTED by review E.** All 37 (now 42)
  arcs gain detail; 0 take the give-up path, which is therefore fixture-only, which is the right
  place for it.
- **The degree-2 lattice claim — attacked exhaustively and unbroken.** Review E brute-forced
  19,683 3×3 fields over three owners, 256 2×2 fields over four owners and 20,000 random 6×6
  fields with zero violations, plus every named pathological configuration. The three `arcs.mjs`
  survivors that rest on it stand. **Do not re-derive this.**
- **Flow routing is order-independent — attacked and unbroken.** Review F re-implemented
  `priorityFlood` with a pluggable comparator and ran three comparator variants × three boundary
  insertion orders on the real field: identical SHA-256 every time, including with the tiebreak
  DELETED and REVERSED. `flowAccumulate` is identical under a reversed seed scan.
- **`land ⊆ mask`, SEA/LAKE exclusivity and the three sealed inland waters — all confirmed** cell
  by cell on the real field by review F (0 sea cells carrying a carved flag; 0 D8 adjacencies from
  any carved body to open sea; one connected component per landmass).
- **All four plan bugs the seam reported fixing were REAL** — review F reproduced each one.
- **The by-hand narrative on `arcs.test.mjs`' top-left-corner fixture was FALSE** and is corrected
  in the file: the plan's code returns the correct single ring there. What makes the frame
  convention load-bearing is the RAGGED 5×5 field. Likewise the recorded "five rings totalling
  3.5 km² against a 3.25 km² census" did not reproduce — the five sum to exactly 3.25, and the
  defect is the wrong decomposition and its ZERO-AREA ring, not an overcount.

### Open, recorded rather than chased

- **`GLACIER_TEMP_MAX 0.08` is a content calibration, and the criterion is written down** in
  `water.mjs`: c01's premise says "one ice divide shedding outlet glaciers to every quarter", so it
  is nearly all ice; c12's says "roche moutonnée, skerry, fjord" — deglaciated rock — and lists
  rock/scree/upland beside ice, so it is not. 0.08 gives 96.9% / 75.0%. Sensitivity is steep either
  side (0.06 → c12 52%, 0.12 → 98%), so the constant is pinned by behaviour and a ±0.005 mutation
  reds.
- **`LAKE_BOWL 0.15` is the other calibration**, on the knee of a measured curve (isoperimetric
  ratio at 0 / 0.06 / 0.15 / 0.47: c04 0.040 / 0.306 / 0.393 / 0.445). Below it the ribbon returns;
  above it the bowl decides the shape instead of the relief, for ≤ 0.05 more.
- **The moisture reference quantile is p75 and the criterion is stated, not fitted:** each of the
  plan's three read-points must DISCRIMINATE. Measured share below 0.16 / below 0.20 / above 0.48 —
  p50 gives 9.8 / 13.4 / 51.8, p90 gives 33.3 / 42.2 / 11.4, p75 gives 20.8 / 27.7 / 27.7. **Task 7
  owns biome composition; this is a floor under "the field carries signal".**
- **`grid.temp` still saturates on 25,091 land cells (9.6%)** at the plan's `LAPSE 0.55`. The
  golden now asserts a ceiling on that fraction so it cannot grow silently. Not reduced here: no
  committed content contradicts the lapse, and with ice premise-gated the saturation no longer
  decides anything.
- **A pinched owner comes back as one ring or two depending on arc id order.** At a diagonal touch,
  owner 0 traces two rings and owner 1 one ring through the pinch — both area-exact, neither with a
  PROPER self-intersection. Routing by turn angle would make it symmetric, but the symmetric answer
  is TWO rings, which on a one-cell diagonal isthmus would put half a landmass outside the trunk
  polygon. The pinch-through ring is the better world. 22 pinch nodes exist on the real coastline.
- **`fractalise` is O(n²) in its self-intersection test and nothing calls it yet.** It is for
  SIMPLIFIED arcs (tens of points). Task 10's P14 must not hand it a raw traced arc.
- **TASK 10 LANDMINE — `fitVertexCap` (plan :6193-6201) tears shared boundaries.** Recorded in §5
  with the measurement. Read it before writing Task 10; the cap belongs on ARCS before assembly.
- **c10 Ashen Spar has 1 surveyed region and 0 settlement-eligible cells** — the treeline veto
  against a volcanic arc's relief. Task 9's call; see the ice/habitability section above.
- **Two more cross-cutting stream risks, now that the terrain stream has a name.** `lib/seed.mjs`
  exports `terrainStream({ worldSeed })` and the goldens join it to `derived.json`, but the three
  OTHER committed streams (`settlements`, `vegetation`, `names`) have no such helper and Tasks 9,
  10 and D will each need one. **Add to `lib/seed.mjs`, do not spell a stream literal in a pass.**
- **The glacier share is 20% of all land** at the plan's `GLACIER_TEMP_MAX 0.12`. Nobody has
  reviewed that as a content number, and P8's biome table is the first thing that will read it.
- **`filled` can exceed the 1.0 elevation clamp** — by exactly one epsilon, 1.0000009536743164.
  Nothing reads it as a [0, 1] elevation today; the golden pins it so that stops being luck.

---

## 12. Plan C seam 4 (Tasks 7-8) — settled, do not re-raise

Appended 2026-08-22 by the seam-4 implementation. Commits `e95ef87` (P8 biomes + P9 regions),
`292afc9` (P10 instancing + handles). **Twenty-four more plan errors are in §5 above.**
**43 mutations: 39 killed, 4 survived, and each survivor is explained AT ITS CALL SITE** — see the
end of this section. No review has run on this seam yet.

### What the seam guarantees

- **Every one of P8's eighteen biome rules is the CHOSEN rule on at least one cell of the real
  world, and the golden asserts the eighteen counts.** Two of the plan's rules could never win and
  neither was visible as a missing biome: `lava` tested `FLAG.CLIFF`, which **no pass in the
  pipeline sets** (0 of 640,000 cells), and `ash` tested `FLAG.SAND`, the CLASTIC default on 213,210
  land cells, while `ash` is in exactly one palette — c10's, the one continent that is VOLCANIC and
  therefore never SAND. Both are §5 rows. **19 of the 20 `BIOMES` now occur**; `built` is the
  exception by design and `landform-type.schema.json` says so independently.
- **The palette fallback is MEASURED, not silent.** 8.80% of land matches no rule its palette allows
  and takes `palette[0]`; c05 Thirstwold is 19,540 cells of that on its own. Pinned per plate, so a
  change that grows the fallback is a change in what the world is made of and shows up as one.
- **Regions tile NET land and the integer proof closes on 640,000** — `256,000 owned + 0 unowned +
  6,400 lake + 377,600 sea`, asserted in aggregate AND cell by cell (no owned cell is water or
  off-mask; `grid.regionId(i)` answers the record's own id).
- **All 160 regions are inside their own manifest tolerance.** 40 surveyed at exactly 160.00 km²;
  120 reported spanning **419.75-504.00 km²** against [384, 576]. Under the plan's per-region
  nominal quota **38** of the 120 are outside it, spread **64.5 to 743.75** — see §5 row 200.
  (**CORRECTED 2026-08-22 by the seam-4 fix pass.** This paragraph said 33 / 63.5-744.5, which is
  this seam's own allocator with `rebalance` disabled, not the plan's rule. A misattributed
  measurement is how a later plan draws the wrong conclusion.) The assertion itself has little
  teeth — the allocator chooses the areas — so the measurement that carries the information sits
  beside it now: the REALISED cell count against the quota, **219 cells short over two named
  regions (0.086%) and exact everywhere else**.
- **The Dijkstra is order-independent, proven the way seam 3 proved flow routing**: three comparator
  variants x three site insertion orders on a real continent (c08, 11,988 net-land cells, 8
  regions), nine runs, one digest. The key is `(cost, cellIndex, ownerIndex)` and the third term is
  **not optional** — see §5.
- **P10 places the manifest's numbers exactly: 1,740 instances, 336 named, 168 of 170 types**
  against a committed `typeCoverageFloor` of 100. Every ring is positively wound, every record
  carries exactly the keys `landform-instance.schema.json` requires, all 1,740 ids and handles are
  unique, and the widest footprint is 8 vertices against G-VERTEX-BUDGET's 40.
- **SUPERSEDED 2026-08-22 by the seam-4 fix pass — handles are a uniform SIX hex.** The seam
  shipped four hex with a 4→5→6 walk, which is deterministic but NOT stable: a larger colliding
  arrival takes `h-abcd` and RENUMBERS the incumbent to `h-abcd0`, and Plan D binds `bind.handle`
  to these strings. Re-keying the walk on `contentHash` does not fix it either — any scheme whose
  length depends on the bucket can renumber. At six hex `mintHandle` reads nothing but its own
  arguments, so a handle can only move if the instance it names moves; `assertHandlesUnique` throws
  on a genuine six-hex collision rather than lengthening. Measured: 43 (continent, group) buckets,
  largest 181 instances, **0 duplicates at six hex** (1 at four, 0 at five). The ledger's
  `collisions` field is gone with the resolver, so the row is exactly the plan's shape and Task 11's
  `additionalProperties: false` schema needs no widening.

### THE FIVE TYPES THAT CANNOT BE PLACED — NOW TWO. Read the ruling below the table.

`sub-lacustrine-vent` was filed in §5 before this seam started, as Task 8's to resolve. **It cannot
be resolved in P10, and it is not alone.** Each of the five was counted over every cell of every
continent whose kit admits it; all five return **zero** candidates, so they are unplaceable by
construction rather than unlucky, and `landforms.test.mjs` re-derives the count so the claim cannot
rot:

| type | requires | why zero |
| --- | --- | --- |
| `sub-lacustrine-vent` | `{nearFlag: LAKE, rock: volcanic}` | volcanic ground exists only on c10, whose kit is `volcanic/erosional/island` — no `lakes` — and whose `interiorWaterKm2` is 0. Adding `lakes` to the kit does not help: c10 has no LAKE cell to be near. |
| `sinking-river` | `{nearFlag: RIVER, rock: carbonate}` | **the same defect, unfiled.** Its group is `fluvial` with no `alsoGroups`; carbonate ground exists only on c04, whose kit is `karst/lakes/erosional/coastal` — no `fluvial`. c04 has rivers and carbonate everywhere; the type simply is not in its kit. |
| `fringing-reef`, `barrier-reef`, `reef-shelf-bank` | `{nearFlag: SEA, elevMax: 0.4, tempDecileMin: 7}` | `oceanic` is in exactly one kit, c11 Quillreef's. c11's footprint centre is at y = 66 km of 400 and `applyWinds` derives temperature from latitude, so its land runs **temp p99 = 0.176**, decile 1. A tropical predicate on a polar-latitude atoll. |

**RULING, seam-4 fix pass 2026-08-22: three of the five were placed, and the fourth column above
is why the fix is honest rather than a loosening.** `oceanic` appears in **exactly one** premise
kit — c11 Quillreef's, the atoll — so the KIT had already decided that `fringing-reef`,
`barrier-reef` and `reef-shelf-bank` may exist on c11 and nowhere else. `tempDecileMin: 7` on top
of that is a GLOBAL climate gate on a question the premise has already answered, and when the two
disagreed the premise lost silently. Dropping the term from those three rows is the same correction
the P8 `reef` rule needed (§5), and it is seam 3's ice remedy in mirror image: seam 3 stopped
thresholding `ice` globally and made it premise-gated. **Type coverage 165 → 168 of 170;
substitutions 109 → 106.** `sinking-river` and `sub-lacustrine-vent` remain, and they are genuine
KIT gaps rather than climate gaps — the honest venue for those two is `absentBecause` (option (a)),
or one word on c04's kit for `sinking-river`.

Reviewer H checked the alternative reading and it does not hold: `absentBecause` on the three reef
rows would have been a FALSE DECLARATION, because the reason was a tropical continent fitted to a
polar latitude, not reefs being inherently absent. And option (c), moving c11's footprint south, is
a different world — `footprint.centreKm` is the authority Plan D re-derives every pin from, and
`[338, 66]` is the plan's own value, not seam-2 drift.

**Three ways out, none of them P10's** *(the seam's original text, kept for the record)*. (a) Give the row an `absentBecause` string — the mechanism
the committed schema already has, scored by G-LANDFORM in Task 11, and the honest one for
`sub-lacustrine-vent` and `sinking-river`. (b) Widen a premise `landformKit` — one word each for
`sinking-river` (add `fluvial` to c04) and nothing for `sub-lacustrine-vent`. (c) Move c11's
footprint south, which is a seam-2 refit. **This seam did none of them**: the lexicon is Plan B's
committed authority and the premises are seam 2's fitted geometry, and 165 of 170 is 65 clear of the
committed floor. **(Superseded by the ruling above.)** `budgets.json`'s own `landformsWhy` already rules that unplaced-with-null is a
WARNING, never a failure.

### The same shape, in the CONTENT rather than the code — filed, not chased

- **c11 Quillreef is a coral atoll that can carry no reef. — CLOSED 2026-08-22.** The diagnosis
  was right and the disposal ("filed, not chased") was not: a committed palette that promises a
  biome the world never produces is a silent promise, and Plan E writes prose about Quillreef. Both
  gates were global climate terms on top of a premise decision (see §5 and the ruling above); both
  are gone. c11 now reads **meadow 88.2% / reef 11.8%** and realises its whole palette. Every other
  continent that may carry reef is unchanged or better: c08 11.0%, c13 11.7%, c06 1.0% → 13.7%.
- **c06 Reedstrand is a wetland continent with no marsh.** *(Still open — see the palette census
  below, which now measures it rather than describing it. c06's reef promise IS kept: 13.7%.)* The `marsh` rule needs `moist > 0.8` (or a
  DELTA cell); c06's moisture p99 is 0.722. It comes out **92.7% meadow**. The rule IS live — 770
  cells world-wide, c13 5.9% — so this is calibration between a premise and a threshold, not a dead
  rule.
- **Four pairs of landmasses PHYSICALLY TOUCH on the refitted mask**, so region adjacency crosses
  continent boundaries: c01-c12 (247 cell adjacencies), c02-c07 (335), c03-c11 (126), c05-c08 (95).
  A per-continent fabric file will therefore carry an `adjacent` id belonging to another file.
  **Task 10a and Task 11 must expect that**; it is pinned in `partition.test.mjs` so it cannot
  surprise them.
- **`FLAG.CLIFF` is set by no pass and read by no lexicon row** (the committed `nearFlag` census is
  SEA 40, GLACIER 22, ARC 15, RIVER 14, LAKE 13, DELTA 1 — no CLIFF). It is a declared bit with no
  producer. Task 9's cliff work is the natural place to either mint it or delete it.

### Decisions taken deliberately

- **`SMOOTHING_PASSES = 2`, and 2 is the BEST of the sweep rather than the cheapest adequate one.**
  Measured on the real field, regions outside their own tolerance: passes 0 -> 7, 1 -> 1, 2 -> **0**,
  3 -> 3. A third pass moves sites far enough that new regions get boxed in. Compactness barely
  moves across the whole sweep (mean isoperimetric 0.379 / 0.391 / 0.391 / 0.399), so it is not the
  quantity to tune on. `partition.test.mjs` re-runs the sweep rather than trusting the comment.
- **The instance budget is per REGION: 8 for a reported region, the rest spread over the surveyed
  ones.** 120 x 8 + 40 x 19.5 = 1,740 exactly. The number 8 is the plan's own (line 350) and the
  ratio is §6.4 rule 2's 7x detail gradient. Unspendable budget — measured, 22 regions cannot spend
  all of theirs and five can spend none — moves to the other regions of the SAME continent, never
  across one, because the premise kit is what decides which landforms may exist.
- **Coverage outranks the weighted draw.** A type the world has not used yet is drawn before one it
  has, and only then does the §6.6 group weight decide. Measured: **152 types placed without it,
  165 with**, and the thirteen it recovers are every glacial, volcanic and oceanic type that has
  ground and simply never came up.
- **The ranking key inside P10 is integer, not `hashNoise2D`.** One noise value per cell per
  continent is mixed with a per-type salt by `Math.imul` and xor-shift. Millions of `hashNoise2D`
  calls would each re-validate the stream with a regex; the mix is exact on every engine (the
  determinism inventory bans the transcendentals, not `Math.imul`) and **no committed number derives
  from it** — only which of many satisfying cells is chosen.
- **`matchesRequires` stays as the reference and `compileRequires` is the fast path.** Two
  enumerations of one predicate language is exactly how a landform ends up where its substrate does
  not exist, so the two are joined by a 680,000-comparison sweep: every committed lexicon row
  against 4,000 real cells, with a guard that the sweep is not vacuous.

### THE BUDGET — the pass reviewer F named, measured

`content/world/budgets.json` does not carry the generate budget; the 4,000 ms figure is the plan's.
Measured on a quiet box, cold, from the committed terrain stream:

| pass | ms |
| --- | --- |
| P1+P2 mask | 693 |
| P2 elevation | 539 |
| P2b substrate | 17 |
| P3 sea level | 87 |
| P6 hydrology | 479 |
| P5 winds | 581 |
| P7 water | 420 |
| **P8 biomes** | **150** |
| **P9 regions** | **873 warm / 1,200 cold** |
| **P10 landforms** | **657** |
| total | **~4,500-4,800** |

**Review F's warning was right and P9 is the pass.** Its breakdown: siting 101, three grow passes
431, Lloyd 22, residual 20, rebalance 183, adjacency 8, census ~108. It was 1,082 ms before three
output-neutral optimisations (a lazy decrease-key keyed on (cell, distinct owner), hoisting the
Poisson scoring and sort out of the two calls that shared it, and a CSR cells-of-region index in
`recentre`); the remaining cost is the Dijkstra itself and the correctness work — the quota
rebalance and the region census — not waste.

**The 4,000 ms generate budget is exceeded and this seam did not change it.** P8+P9+P10 alone are
1,680-2,000 ms against the ~1,160 ms §11 left for six passes, and P11 settlements, P12 roads, P13
dungeons and P14 fabric are still unwritten. The number is a plan value, not a committed one, so
**Task 10b is where the decision belongs**: raise it with the measurement in front of the owner, or
buy the time back (the largest remaining single terms are `applyPremiseMasks` 693 ms and
`buildElevation` 539 ms, both from seam 2, and P9's three grow passes). **Do not quietly widen
`budgets.json` to make a green run.**

### Recorded mutation SURVIVORS — each explained at its call site

**Do not re-file these.** 43 mutations across `biome.mjs`, `partition.mjs` and `landforms.mjs`; the
39 killed include every rule this seam added or corrected. The four that stand:

- `partition.mjs` — `poissonSites`' relaxation FLOOR. Deleting it is green because the ladder does
  not diverge without it: it keeps halving until `radius` denormalises to 0, at which point every
  separation test is false and `tryRadius` accepts the first `count` cells — the SAME answer, about
  a thousand iterations later. The branch is an early exit. The MULTIPLIER is live: `radius * 0.8`
  → `radius` makes the loop non-terminating and the suite kills it (by timeout).
- `partition.mjs` — `neighbourIdx` in `growRegions`, against unguarded index arithmetic. Measured:
  **zero net-land cells and zero MASKED cells sit on any of the four frame edges**, so the east/west
  wrap always lands on sea and `ownable` rejects it on the next line. Unreachable by this world's
  geometry, not dead — a premise fitted to the frame edge or a re-tiled grid makes it live.
- `partition.mjs` — `assignTerrainKinds`' throw, against `?? "headland"`. `partition.test.mjs`
  asserts `TERRAIN_FOR_BIOMES` is TOTAL over `BIOMES`, so a dominant biome with no mapping cannot
  exist and any fixture reaching the throw reds the totality test first.
- `landforms.mjs` — the rarity ordering of the `grid.landform` write. Measured: **zero of the 1,740
  instances share a cell** (the per-region separation makes a tie impossible), so no fixture can
  separate the two orderings. Live the day a second instance lands on an occupied cell.

### Open, recorded rather than chased

- **Two regions cannot reach their quota** — `c02/r25` (1,766 of 1,880) and `c05/r27` (1,776 of
  1,881) — because no surplus is reachable across the region-adjacency graph at all. Both are well
  inside tolerance (441.5 and 444.0 km² against [384, 576]) and both are REPORTED in
  `partitionRegions`' return rather than absorbed.
- **The mapforge suite went 11.1 s -> 24.3 s.** Two new files each build the real 800 x 800 world
  once (~2.8 s) and then run several full partitions on it. Task 9 and Task 10 will each want the
  same field; **a shared fixture module that builds it once per process is the obvious saving**, and
  `tests/fixtures/coast-world.mjs` (Task 9a's) is where the plan already puts one.
- **`dominantBiomeIndex`, `siteCell` and `cells` are on the region record and are NOT in the fabric
  shape.** Task 10a projects the committed record; `fabric-file.schema.json` will be
  `additionalProperties: false`.
- **`TERRAIN_IMPLIES` is not enforced on fabric regions and cannot be.** A surveyed region whose
  dominant biome is `meadow` gets `terrainKind: "headland"`, which implies rock AND meadow at >= 15%
  — a claim its `biomeShares` may not support. `G-TERRAINKIND` walks spine nodes and regions are
  deliberately not spine nodes, so nothing checks it today. Plan E's redraw is where it would bite.
- **`REPORTED_INSTANCES_PER_REGION` and the naming census interact.** After the top-up the reported
  tier spans 1-17 instances per region and the surveyed tier 8-22, against nominal 8 and 19.5. The
  NAMED cap of one per reported region is untouched and asserted; the texture count is not a gated
  number today.

---

## 13. Plan C seam 4 — the ADJUDICATING FIX PASS (Tasks 7-8) — settled, do not re-raise

Appended 2026-08-22. Two independent adversarial reviews (G on biomes/regions, H on
landforms/handles), both ACCEPT-WITH-FIXES, 8 majors and 15 minors between them. Commits
`a2dfaa7`, `2e04454`, `cbe7fbc`, `2bfd306`. **Suite 513 pass / 0 fail on Node 26 and on the
CI-pinned Node 18** (506 + 6 librsvg skips), twice, `git status --porcelain` empty after each.
**21 mutations, 21 killed** (one survived first — the biomeShares 0-drop — and the surviving
mutation is what forced the real-world assertion that now kills it).

### THE NAMING STREAM — the seam-3 trap's THIRD occurrence, and the guard that ends the class

`assignNames` minted `mintSeed(terrainStream, "names") = a39da863a8093b67` while
`content/spine/derived.json` commits `n-atlas.resolvedSeedStreams.names = 6033b1b1f52e861c`.
Deterministic, self-consistent, every golden stable, both reviews of seam 3 blind to the identical
shape, and still the wrong stream — Plan D mints the 336 titles from the committed one.

**The instance is not the fix.** `lib/seed.mjs` now owns the four names `derived.json` commits per
node; `mintSeed` **THROWS** on any of them, and `namedStream({ worldSeed, name })` — which takes a
world seed, never a parent stream — is the only way to spell one. `instanceLandforms` takes
`nameStream` as a **required injected** argument and validates its shape. Three things go RED:

1. `RESERVED_STREAM_NAMES` must equal the key set every committed node carries (44 nodes, one key
   set) — so the list cannot rot away from the record;
2. the throw is exercised on all four names, and `namedStream` refuses anything else, so it cannot
   drift into a general-purpose minter that re-admits the defect;
3. a **source scan over every file under `tools/mapforge`** reds on a written
   `mintSeed({ … name: "<reserved>" })` call site anywhere in the tree, including in a branch no
   fixture reaches. It walks the tree (`_source-scan.mjs`), so Task 9's and Task 10's passes are
   covered by default, and it asserts its own non-vacuity (files scanned, call sites found).

Mutations: deleting the throw, flipping `mintSeed`'s join order, neutering the scan's regex, and
narrowing the scan to one file — all four killed.

**Still open, filed not chased:** `tools/mapforge/lib/world-gen.mjs:64` defines a SECOND `mintSeed`
with the same construction, used at :267 to mint node seeds. Two definitions of the seed
construction is the "two enumerations of one language" failure the lexicon predicate has a
680,000-comparison sweep against. It is Plan A/B territory and it is on the committed-byte path
(`buildWorld` mints spine node seeds), so it was not touched here. It spells no reserved name, so
the scan is green on it today.

### HANDLES — deterministic was never the property Plan D needs

Four hex with a 4→5→6 walk in RANK order, and rank is dominated by `sizeKm`. A larger colliding
arrival takes `h-abcd` and **renumbers the incumbent** to `h-abcd0`. Re-keying the walk on
`contentHash` (reviewer H's suggestion) does not fix it — a newcomer whose hash sorts first
displaces the incumbent just the same. **Any scheme whose length depends on the bucket can renumber
an existing handle**, so the length must not depend on the bucket at all: `HANDLE_HEX = 6`,
`mintHandle` reads nothing but its own arguments, `assertHandlesUnique` throws. Measured: 43
buckets, largest 181 instances, 0 duplicates at six hex. The test adds four kinds of later arrival
— including one that collides at four hex and is larger, and one whose hash sorts first — and
asserts the incumbent's handle is byte-identical each time.

This also dissolves reviewer H's MINOR-6 (23 handles whose group segment is the type's PRIMARY
group rather than the `via` group that drew it): with a bucket-independent handle, the segment is
cosmetic and changes nothing about collision behaviour.

### `named` — keyed on ARRAY POSITION, against the file's own rule eight hundred lines up

`landforms.mjs:781,796` drew the coin on `mix32(nameSalt, n)` with `n` the index into the global
instances array, while `orderHandles` at `:190` says "NEVER insertion order". Reversing the array
with identical objects named a different set (3 of 12 in common). Keyed on the **handle** now, and
the reported-region draw on the **region id** rather than its position in a list whose length
depends on which regions happened to receive an instance. Both mutations back to positional keys
are killed.

### THE c11 REEF RULING, and the palette census that makes the class visible

See §5's two new rows and the ruling in §12. In short: **the palette (and, for landform types, the
kit) is the premise's authority over what a continent may carry; a second GLOBAL climate gate
inside a rule or a `requires` block double-decides it, and when they disagree the committed premise
loses silently.** Quillreef — title, `coastClass: "atoll-ring"`, `structuralIdea` "an atoll ring",
palette `["reef","meadow","ocean"]` — came out 100.0% meadow and could carry neither a reef biome
nor a reef landform. Both terms dropped. c11 is now meadow 88.2% / reef 11.8% with its whole
palette realised, coverage 165 → 168 of 170, and no continent outside the four reef palettes can
take it.

**And `ruleWins` now has per-continent eyes.** It is a WORLD census, so a rule that fires somewhere
passed the dead-rule assertion while promising a biome a continent never gets. `classifyBiomes`
returns `paletteRealisation` and `partition.test.mjs` pins it entry by entry:

| | promised | realised | absent |
| --- | --- | --- | --- |
| c01 | 5 | 3 | rock, scree |
| c02 | 9 | 5 | bramble, rock, upland, **built** |
| c03 | 7 | 4 | upland, rock, scree |
| c04 | 6 | 3 | rock, forest, meadow |
| c05 | 6 | 4 | scree, rock |
| c06 | 5 | 4 | marsh |
| c07 | 5 | 5 | — |
| c08 | 5 | 3 | rock, scree |
| c09 | 4 | 3 | river |
| c10 | 4 | 4 | — |
| **c11** | **3** | **3** | **—** |
| c12 | 5 | 3 | scree, upland |
| c13 | 4 | 3 | river |

**Twenty-one absent entries, of which `built` is absent BY DESIGN** (a composition biome
`landform-type.schema.json` says no row names). The other twenty are calibration between a
committed palette and a generated field — mostly elevation (`rock`/`scree`/`upland` on continents
whose relief never reaches 0.44/0.62/0.78) and two `river` promises on continents with no RIVER
flag. **They are Task 9's to close or an owner's to accept; what this seam owes is that none of
them is silent, and none is now.** Single-biome regions fell 25 → 21 as a side effect.

**THE DENOMINATOR IS THE PLATE, NOT THE OWNED LAND**, and getting this wrong costs six false
positives: `ocean` and `lake` are palette entries on six premises while regions tile NET land, so
an owned-cell census reports six broken promises that are in fact kept. The first count taken of
this read 25 and was wrong for exactly that reason.

### REGION TOPOLOGY — the reviewer's finding was bigger than reported and its consequence was wrong

**REFUTED: "the drawn region will not equal the declared 160.00 km²."** Seam 3's `assembleRings`
resolves nesting and returns `{ rings, holes, areaKm2 }`; measured over all 160 owners, `areaKm2`
equals the declared `areaKm2` **exactly, 0 mismatches**. The generator is right.

**WHAT IS TRUE, AND LARGER: 18 of the 160 regions have a boundary of more than one ring and three
enclose holes.** `growRegions` is a D8 Dijkstra, so a region can pinch to a single lattice corner —
8-connected, 4-disconnected, two rings. The plan's fabric shape gives a region ONE `ring` (line
318) and `ringsFromOwner` takes `rings[0]` (line 6379); under that projection this world silently
drops **384.50 km²**, with c04/r13 drawing 308.00 of its declared 470.50 and c07/r02 346.50 of
504.00 across five rings. **Task 10a must carry `rings` and `holes`.** Pinned by region name with
the exact ring count, plus the identity `assembleRings(o).areaKm2 === region.areaKm2` for all 160.

Only ONE region is 8-disconnected: `c04/r19` (639 + 1), a cell `erodeEdge` tore off with no
connectivity guard. **The obvious remedy was measured and REJECTED.** A local simple-point guard in
`erodeEdge` does remove the fragment and one of the two quota shortfalls — and it takes the
multi-ring count 18 → 20, the worst region 5 → **12** rings, `c04/r19` itself 2 → 10, and the area
outside ring 0 from 384.50 → **428.00 km²**. A fix that makes the measured outcome worse is not a
fix. And no erosion guard can get below **11** multi-ring regions anyway: that many exist with
`rebalance` switched off entirely, so multi-ring is a property of D8 growth, not of erosion.

### THE GROUP CENSUS AND THE DUNGEON SUPPLY — the premise is false, the conclusion holds

Spec §6.6's twelve group targets **cannot be met by any placement**. A group only receives
instances from continents whose kit names it, and each continent's instance budget is fixed by its
region count, so every group has a hard ceiling:

```
group     target ceiling placed      group     target ceiling placed
coastal      300   1404     562      desert       130    301    142
fluvial      260   1170     484      volcanic     110     35     21  <-- target > ceiling
mountain     200    809     131      wetland       90    570    103
glacial      190    392      51      lakes         70    762     28
karst        160    305     168      island        55    169     17
erosional    140   1087      23      oceanic       35     16     10  <-- target > ceiling
```

`volcanic` wants 110 from a continent that holds 35 instances in total; `oceanic` wants 35 from one
that holds 16. **145 targeted instances against a 51 ceiling — 94 that must land in another group
whatever the draw does.** The targets are WEIGHTS, and the ceiling table is pinned so the deviation
can never again be read as a placement defect.

**The dungeon supply, answered with numbers because Task 9 needs it.** The spec derives "the 270
karst + volcanic instances comfortably supply all 60 dungeon doors" from that table. Both halves of
the premise are false — the world holds **189** karst + volcanic and only **120** of those are
`dungeonCapable`. The conclusion survives with a wide margin because `dungeonCapable` is not a
karst/volcanic property: **307 instances over 117 regions**, spanning twelve groups. P13 takes at
most `round` per region over three rounds, so the reachable supply is Σ min(count, 3) = **235
anchors against a quota of 60 — 3.9×**. **This is not a generation-shape problem and Task 9 does
not need one solved.** The one filter still to measure is Task 9's own: `hopsToSettlement ≤ 2` from
one of 45 settlements, which cannot be evaluated before P11 exists.

### REFUTED — with the evidence, so nobody re-raises them

- **"The drawn region will not equal the declared area" (G MAJOR-1's consequence).** `assembleRings`
  returns the exact declared area for all 160 regions. The real consequence is the single-`ring`
  fabric shape, above.
- **"Guard `erodeEdge` so it cannot strand a cell" (G MAJOR-1's remedy).** Built and measured: it
  makes ring topology strictly worse on every count (18 → 20 multi-ring, 5 → 12 worst, 384.50 →
  428.00 km² outside ring 0). Rejected.
- **"Order the handle bucket by `contentHash` alone" (H MAJOR-3's remedy).** A newcomer whose hash
  sorts first displaces the incumbent exactly as a larger one did. Any bucket-dependent length can
  renumber; uniform six hex is the only stable form inside the committed grammar.
- **"Declare the reef types `absentBecause`" (§12's own option (a), for the reef case).** It would
  be a false declaration — the reason was a tropical continent fitted to a polar latitude, not
  reefs being inherently absent. H is right and §12 was wrong to offer it here. It remains the
  honest venue for `sinking-river` and `sub-lacustrine-vent`.
- **"Move c11 south" (§12's option (c)).** `footprint.centreKm` is THE authority Plan D re-derives
  every pin from, `[338, 66]` is the plan's own value rather than seam-2 drift, and moving it
  re-fits the mask, sea level, elevation and every golden in seams 2, 3 and 4. That is an owner's
  decision about a different world, not a fix pass's.
- **"Rename `tempDecile`/`precipDecile`" (H MAJOR-5's stronger option).** The name is in the
  committed `landform-type.schema.json` and in 84 authored lexicon rows; re-spelling Plan B's
  authority is a larger content change than the correction is worth. The false CLAIM in
  `landforms.mjs`'s header is corrected and the real selectivity is pinned by histogram instead.
- **§12's justification for replacing the plan's collision fix was overstated (H MINOR-1).**
  Confirmed and recorded in §5 row 211: the plan's single-pass form yields three DISTINCT handles
  on a plain three-way collision; it duplicates only when two members also agree at six hex. The
  replacement was still right, and is now itself replaced.
- **§12 said `absentBecause` is "scored by G-LANDFORM in Task 11" (H MINOR-9).** It already is —
  shipped in Plan B Task 5, `scripts/check_content.mjs:2762-2782`. Nothing needs building.

### Open, recorded rather than chased

- **`c05/r06` is a SURVEYED region with zero landform instances** (H MINOR-4), and G-POI draws POIs
  for every surveyed region. §12 said "five can spend none" without saying one is in the walked
  tier. Task 9's or Task 10a's to decide; the count (155 of 160 regions hold an instance) is
  asserted.
- **`orderDigest` does not cover `named`, and `contentHash` does not cover the emitted
  `points`/`ring`** (H MINOR-8). The instance-set golden covers `named`; a hand-edited ring is
  Task 11's `gWorldInstanceGeometry` to catch. Stated here so Task 11 knows it owns it.
- **The naming spread is 2-12 per surveyed region against spec §6.6's flat 6** (H §5), and the
  reported tier ends +6.6% over its nominal instance count while the surveyed tier is -8% under,
  which contradicts `landforms.mjs:534`'s comment about where the spill lands. The census totals
  (1,740 / 336 / 276 surveyed / exactly 60 reported regions) are exact and asserted; the spread is
  not a gated number.
- **`FLAG.CLIFF` is still set by no pass and read by no lexicon row.** Task 9's cliff work mints it
  or deletes it.
- **`ARC` and `VOLCANIC` are the identical 3,999-cell set on this world** (G MINOR-4), so the
  `lava`/`ash` rules read one substrate through two names and `ash`'s `VOLCANIC` → `ARC` mutation
  survives. Not a bug; a note for whoever gives the two flags different reaches.
- **`grossLandCells` naming hazard for Task 10a** (G MINOR-2): the plan's committed `world.json`
  census key is `grossLandCells: 262400` while P9 returns `census.land = 256000` (NET). Task 10a
  must write `land + lake`, not `land`.

### THE BUDGET — surfaced, not decided

Re-measured after these fixes, warm, three runs, on a quiet box:

```
P1+P2 mask 459   P2 elevation 485   P2b substrate 8   P3 sea level 137   P6 hydrology 618
P5 winds 483     P7 water 323       P8 biomes 55      P9 regions 888     P10 landforms 598
TOTAL 4,054 ms
```

`content/world/budgets.json`'s `generate` stage is `budgetMs 4000` / `failMs 8000`. **The fixes are
budget-neutral** — every pass is inside the range §12 recorded, and the total is the same
~4,500-4,800 cold / ~4,050 warm. It is over budget and not failing, with **P11 settlements, P12
roads, P13 dungeons and P14 fabric still unwritten**. `budgets.json` was NOT edited. The decision —
raise the stage budget with the measurement in front of the owner, or buy the time back (the
largest terms are `applyPremiseMasks` 459 ms, `P9` 888 ms and `P6` 618 ms) — belongs to the owner
at Task 10b.

### Goldens that moved, and why each move is legitimate

| golden | from | to | why |
| --- | --- | --- | --- |
| `grid.biome` digest | `cc5d943407d64136` | `2cfd8e7ca716b242` | the `reef` rule lost its global temperature term |
| biome histogram / `ruleWins` | meadow 89768, reef 1884 | meadow 87771, reef 3881 | same |
| instance set digest | `a71e08bb41b6f8d6` | `3a4add619666e08b` | three reef types became placeable; handles are six hex; `named` is content-keyed |
| `grid.landform` digest | `80e897e234ccbe19` | `cf18ada96d78372c` | same |
| all 13 ledger `orderDigest`s | — | pinned anew | handle strings changed length |
| coverage / substitutions | 165, 109 | 168, 106 | three reef types placed |

**`grid.owner` did NOT move** (`cb92d2923c5c8e6f` unchanged), and neither did the terrain, mask,
elevation, sea-level, hydrology, wind or water fields. No premise `footprint` was touched. The
protected diff against `plan-c-base` over `content/spine`, `content/maps`,
`game-client/assets/art/maps/` and `colyseus-server/` is **empty**; `check_spine_emit --check` is
clean at 47 files; `npx jest mapDimensions` is 5 passed.

---

## 14. Plan C seam 5 (Task 9) — settled, do not re-raise

Appended 2026-08-22 by the seam-5 implementation and its adjudicating fix pass, after two
independent adversarial reviews (A: P11 settlements — ACCEPT-WITH-FIXES, 4 major / 5 minor;
B: P12 roads + P13 dungeons — ACCEPT-WITH-FIXES, 3 major / 7 minor). **Twenty more plan errors
are in §5 above.** Mutations: **73 distinct, 63 killed, 9 survived** — every survivor
explained AT ITS CALL SITE (see the end of this section) — plus one whose target (`pathBetween`'s
`from` parameter) was deleted rather than defended.

Commits: `c71bcc3` (P11), `f10af38` (P12), `789c195` (P13), plus the fix-pass commit.

### What the seam guarantees

- **45 settlements, exactly 3 capital / 12 hub / 30 village, zero problems.** Capitals `c02/s01`,
  `c03/s01`, `c05/s01`, one per landmass, all port-eligible, pairwise ≥ 60 km. The closest pair of
  settlements in the whole world is **9.01 km**, so the 9 km bound is binding and live, and no
  region holds more than 2.
- **Every hard veto fires and none of them fires on everything.** Counted INDEPENDENTLY over the
  25,600-cell surveyed pool (not in the short-circuiting order the pass evaluates them):
  slope **360**, treeline **173**, freshWater **6,345**, {ice, lava} **108**. 18,895 cells survive.
  **But "it fires" is not "it decides":** every treeline and every ice/lava rejection is on c10,
  which the fresh-water veto rejects entirely, so deleting either leaves the 45 placements
  byte-identical on THIS world. **The RECORDED REASON was wrong and is corrected in §15: what masks
  them is the SURVEY DRAW, not the premise set.** Both are now killed by an ISOLATING fixture — the
  treeline's first fixture tripped the SLOPE veto instead and the treeline rule could be deleted
  with the suite green.
- **The coast term has spec §6.5's THREE bands and both named distances are live** — 2,574 near /
  6,955 taper / 9,366 beyond, and sheltered 2,126 against exposed 7,403. See §5 for the two dead
  constants this replaces.
- **The score discriminates.** 18,895 eligible cells, **18,895 distinct scores, ZERO exact ties**;
  all four terms vary (river {0, 0.6, 1}; coast 16 distinct with 10,246 zeros; slope 17,010 distinct
  over 0.604–0.991; resource 18,894 distinct over 0.31–0.93). No dead weight.
- **All 9 level-band rings are populated** — 5 / 16 / 13 / 13 / 14 / 23 / 26 / 28 / 22 over 160
  regions — anchored on `c02/s01`, i.e. on Wealdmarch, which is where `originPinnedId`
  `c-town-gildmark` will land in Plan D. The fallback chain reports which origin it used.
- **38 roads, every settlement on its own continent's network, 0 road points at sea and 0 on
  another continent.** 2 sea lanes joining the 3 capitals, water end to end. 7 trunk rivers
  (c08 and c11 hold one river cell each and are NAMED rather than drawn — §5).
- **60 dungeon complexes against a quota of 60**, over **33 SURVEYED regions**, hop histogram
  **{0: 48, 1: 2, 2: 10}**, 13 distinct entrance types, every entrance `dungeonCapable` by the
  LEXICON (the instance's own flag is joined to it, never trusted beside it).
  **CORRECTED by the fix pass (§15)** — the first pass anchored over 60 regions with histogram
  {0: 18, 1: 19, 2: 23} and put **36 of the 60 in REPORTED regions**, which Task 11's own
  `gWorldPoi` forbids. The anchors moved; the reason is in §15.
- **Order independence, proved the way seam 3 proved flow routing:** three heap comparators ×
  three settlement input orders on the real world, one digest; `anchorDungeons` unchanged under a
  reversed `instances[]`; `placeSettlements` byte-identical across two full runs.

### THE c10 ASHEN SPAR RESOLUTION — accepted, with the numbers

§11 deferred this to Task 9 and **misattributed it**; see §5. Ashen Spar carries **0 RIVER cells
and 0 LAKE cells** and moisture p50 0.0000, so 615 of its 640 surveyed cells fail
`freshWaterMin: 0.20`, and **ZERO cells clear every veto other than the treeline** — deleting the
treeline, or exempting `volcanic-arc` from it, yields nothing. **The resolution is to accept 0
settlements on c10.** The quotas are world totals and are met exactly; spec §6.5's per-continent
table is prose, not a gate; and a town with no fresh water is the thing the veto exists to refuse.
This is pinned cell by cell in `settlements.test.mjs` so the attribution cannot rot again.

### THE TWO MEASURES OF WATER — and the Plan D hazard this seam could not close

`grid.fetchKm` (`classifySea`) is **max over the two axes**: wave exposure. Spec §6.5's shelter
test needs **min over the two axes**: enclosure. Both come from the same four run-length sweeps,
so `narrow ≤ fetch` is a tautology and joins nothing; `settlements.test.mjs` joins them by
**re-deriving `classifySea`'s own output** from `narrowWaterKm`'s sweeps and comparing cell by cell.

**PLAN D MUST DECIDE THIS.** A pinned harbour declaring `water.shelterFetchKmMax: 15` measured
against `grid.fetchKm` is **unsatisfiable at 332 of the 520 port-eligible cells** and at all three
generated capitals (their adjacent water reads 240.5 / 56.5 / 48.5 km). Either
`pinReceipts.measured.shelterFetchKm` reads `narrowWaterKm` — which `settlements.mjs` exports for
exactly this — or the pin's threshold is restated. **And c04 Stonemoor has zero port-eligible
cells at all**, so `c-town-netstead` cannot be a sheltered-port capital there whatever is decided.

### Decisions taken deliberately

- **Separation is against ALL settlements at the candidate's own tier distance**, not same-tier.
  See §5 — the plan's own Step 7 brief proposes the opposite and the spec, the plan's own test and
  the measurement all contradict it.
- **`MAX_SETTLEMENTS_PER_REGION = 2` and `MAX_CAPITALS_PER_CONTINENT = 1` are RULES, not
  derivations.** Both fire: without the first, four regions take 3; without the second, c05 takes
  two capitals 71.9 km apart, Wealdmarch gets none and the level-band origin moves off it. Both are
  killed by real-world assertions.
- **The `settlements` stream is INJECTED and joined to `derived.json`, never minted.** §13's guard
  makes the plan's own spelling impossible; the pass validates the shape and the test validates the
  identity BEFORE anything is measured.
- **`placeSettlements` refuses to run before P8**, the way `partitionRegions` already does, because
  the plan's `BIOME_NAME = null` default silently disables the {ice, lava} veto.
- **The positional `grid.owner → regions[]` join is ASSERTED** (`assertRegionIndex`, used by P11 and
  P12, **and now tested in BOTH** — P12's copy was an undeclared mutation survivor until §15).
  Review A reproduced 45 settlements filed under the wrong region ids, `problems: []`, by
  handing in a reversed array.
- **A pin is never moved; every way it can contradict the fabric is REPORTED** — sea cell, reported
  region, unknown region, `at`/`cell` disagreement, an over-filled tier, two pins inside the 9 km
  separation. Duplicate ids and out-of-bounds cells THROW.
- **`f-town-<slug>` is minted in `settlements.mjs`** (`townFeatureId`, `slugOf`, `townSlug`,
  `townFeatureIds`) because the settlement is where a town's identity is, and because the plan's
  `buildTrunk` writes `slugOf(s.title)` on records whose title is always `null` in Plan C — which
  slugs to the string `"null"`, 45 times over. `townSlug` falls back to the settlement id
  (`f-town-c02-s01`) and takes the title once Plan D mints one — **but only for a GENERATED
  settlement.** A titleless PIN falls back to `f-town-c-town-gildmark`, a legal id that reds
  `G-NET` at Plan E's redraw, so `placeSettlements` throws on one and `townSlug` refuses the
  fallback (§15). **Task 10's `fabric.mjs` must RE-EXPORT these, never redefine them.**
- **`routeRoads`' Prim step is ONE multi-source Dijkstra, stopped at the nearest target**, proved
  byte-identical to a run-to-completion Dijkstra on the real field. 664–796 ms with the early stop
  against 1,214–1,426 ms without. **The plan's Step 19 "under 800 ms" is NOT asserted**: a
  wall-clock assertion on a shared box is exactly `G-RASTER-BUDGET`, which reds one run in three
  under load. The number is reported; the margin is thin.

### THE BUDGET — reported, not decided

Warm, median of three runs on a quiet box, from the committed terrain stream:

```
P1+P2 mask 482   P2 elevation 497   P2b substrate 8   P3 sea level 87   P6 hydrology 425
P5 winds 505     P7 water 337       P8 biomes 50      P9 regions 838    P10 landforms 528
P11 settlements 166   P12 roads 717   P13 dungeons 1
TOTAL 4,641 ms
```

`content/world/budgets.json`'s `generate` stage is `budgetMs 4000` / `failMs 8000`. **This seam
adds 884 ms and the total is over budget and not failing, with P14 fabric and the CLI still
unwritten.** `budgets.json` was NOT edited. The decision belongs to the owner at Task 10b; the
largest single terms are now `P9` 838, `P12` 717, `P2 elevation` 497 and `P5 winds` 505.

### Recorded mutation SURVIVORS — each explained at its call site

**Do not re-file these.** 73 distinct mutations, 63 killed. The nine that stand:

- `settlements.mjs` — the `(a.i - b.i)` tail of the candidate sort. `scored` is built by ascending
  cell index and `Array.prototype.sort` is stable, so equal keys already emerge in cell order. The
  `(b.tie - a.tie)` term beside it IS killed, by the fixture golden — the real world has **zero
  exact score ties** among 18,895 cells, so the tie-rich synthetic fixture is the only venue where
  either term is observable.
- `settlements.mjs` — the surveyed pre-filter in the scoring loop. An exact duplicate of
  `scoreSettlement`'s own reported-region veto, kept because it skips the D8 walk on 230,400 cells.
- `roads.mjs` — the early stop in `nearestOutsideTree`. Deleting it leaves every test green and
  **that is the point**: it is a performance change and the survivor is the proof it is
  output-neutral.
- `roads.mjs` — `MinHeap.less`'s cell-index term. `roads.test.mjs`'s order-independence test runs
  the comparator WITHOUT it and requires byte-identical output, so the tiebreak is the control, not
  the rule.
- `roads.mjs` — the upstream walk's `seen` set. **Unreachable on any GENERATED field**: `flowDir` is
  a function, so the inflow relation followed by the walk is a tree, and a `flowDir` cycle is a
  component with no outlet and therefore no mouth to start from. Derived independently by review B.
  **Not unkillable in the absolute** — the comment claiming "cannot be killed by any fixture"
  contradicted its own next sentence and is corrected (§15): a hand-built mouth whose inflow is
  itself would kill it, and bounding exactly that case is why the guard is a `Set` and not the
  plan's `guard < grid.n`.
- `roads.mjs` — `traceTrunkRivers`' `i < cur` mouth tiebreak. The loop scans ascending, so
  first-wins already selects the lowest index among equal accumulations.
- `roads.mjs` — the `path[0] !== root[best.cell]` throw on a road leg. Unreachable: every search
  source is a settlement cell with `prev === -1`. It is what makes DELETING `pathBetween`'s `from`
  parameter safe — with `from`, a source that happened to lie ON the path truncated the road at an
  intermediate settlement, and no test saw it.
- `dungeons.mjs` — the handle tail of the draw comparator. Zero 32-bit key collisions among the 307
  eligible instances; fixturing one would be a 2^32 search for a property meant to hold without one.
- `dungeons.mjs` — the `.sort()` on the BFS sources. Every settled region enters at distance 0, so
  the frontier is the same set whatever order they are queued in **and no DISTANCE can move**. The
  returned Map's INSERTION order is not order-independent without it; nothing walks that Map today
  (every consumer does `.get`), so the survivor stands — and stops standing the moment a later task
  emits a per-region hop table by iterating it. Recorded at the call site (§15).

### Open, recorded rather than chased

- **Spec §6.5's per-continent settlement table is missed on FIVE continents, not one.** This entry
  named only c08 and understated the drift by about four times (review I). Measured:

  | | c02 | c03 | c04 | c05 | c06 | c07 | c08 | c09 | c10 |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | spec §6.5 | 11 | 10 | 8 | 7 | 3 | 3 | 1 | 1 | 1 |
  | built | 12 | 11 | **11** | 7 | **1** | **1** | **0** | **2** | **0** |

  Five of the spec's nine minor-continent settlements have migrated to the three majors. The cause
  is one thing, not five: the greedy is a **world-wide score order with no per-continent floor**.
  c10 is additionally UNSATISFIABLE (0 of 640 surveyed cells clear the veto set — no placement
  policy puts a village on Ashen Spar), and c01/c11/c12/c13 have no surveyed region at all so they
  cannot receive one either. **Owner's call**, and it is one call about the greedy, not nine.
  The mechanical contributor is P9's, not P11's: the surveyed/reported split drifts from spec
  §6.529 on **c02 (10/20 built against 8/20) and c03 (6/20 against 8/20)**, totals still 40/120,
  which is why exactly those two over-fill.
- **`hopsToSettlement` can no longer be `null`**, but `fabric-file.schema.json` (Task 11) must still
  type it `["integer","null"]` — Plan D's overlay reads that shape.
- **50 of 7,247 shore cells have two D8 sea neighbours that disagree on sheltered/exposed**, so
  their class comes from the BFS's fixed D8 order rather than from a rule. Deterministic, and
  reversing the D8 order leaves all 45 placements byte-identical, but it is a tie the model does not
  adjudicate.
- **The mapforge suite is 603 tests / ~34 s** (was 251 / 11.1 s at `plan-c-base`; **594** at seam
  5's first commit — the "593" recorded here was off by one, measured independently by BOTH
  reviewers — and §15 added 9). The seam adds one
  real-world build; the civic block for P12 and P13 lives in `settlements.test.mjs` for that reason.
- ~~**`MAX_PER_REGION = 3` in `dungeons.mjs` does not bind on this world**~~ — **SUPERSEDED by §15.**
  It was dead because P13 spread across 94 regions, 61 of which Task 11 forbids it to use. Confined
  to the 33 legal ones, 60 anchors need a second round: 27 regions take 2, and `MAX_PER_REGION`
  3 → 1 now yields 33 anchors and an under-fill problem ON THE REAL WORLD. The 2 → 3 step is still
  unexercised there and is killed by a direct fixture.

---

## 15. Plan C seam 5 — the ADJUDICATING FIX PASS (Task 9) — settled, do not re-raise

Appended 2026-08-22 after two independent adversarial reviews (**I**: P11 settlements —
ACCEPT-WITH-FIXES, 5 major / 7 minor; **J**: P12 roads + P13 dungeons + the budget —
ACCEPT-WITH-FIXES, 3 major / 5 minor). Both reviewers rebuilt the 800×800 world independently and
**every number the seam reported reproduced exactly**; the findings were about rules that measure
nothing, checks that cannot fire, and claims the code does not support. Commit: `c4b22a0`.

**Mutations this pass: 18 distinct, 17 killed, 1 survivor** (the declared surveyed pre-filter,
explained at its call site). Four mutations that SURVIVED before this pass are now killed:
delete-the-treeline-veto, swap-the-level-band-chain, delete-the-level-band-report, and
delete-`assertRegionIndex`-from-`routeRoads`.

### THE FINDING THAT MOVED GOLDENS — dungeon anchors are surveyed-only now

**P13 was authoring 36 gate failures for Task 11.** See §5's new row. `gWorldPoi` (plan `:7502`)
counts every `dungeonAnchors` row into its region's POI total unconditionally and requires a
reported region's total to be **exactly 0**; P13 filtered on `dungeonCapable` and `hops ≤ 2` and
never read `region.survey`. Measured: 36 of 60 anchors in reported regions, **43 `gWorldPoi`
failures with the anchors against 7 without**. The alternative — exempting `dungeonAnchors` from the
rule — contradicts spec §6.4 rule 2 and the design doc twice, and was not taken.

**The anchors moved, and that is legitimate.** It is a different, correct set, not a re-baseline:

| | before | after |
| --- | --- | --- |
| anchors | 60 | 60 |
| in reported regions | **36** | **0** |
| regions used | 60 | 33 |
| max per region | 1 | **2** (27 regions take a second) |
| hop histogram | {0: 18, 1: 19, 2: 23} | {0: 48, 1: 2, 2: 10} |
| distinct entrance types | 13 | 13 |
| continents | 8 | 7 — **c08 loses its only one**: it has 2 surveyed regions carrying 2 `dungeonCapable` instances, but **0 of them are within 2 hops of a settlement, because c08 has no settlement at all**. Both constraints were always there; only one of them used to bind. |
| `problems` | `[]` | `[]` |

**Supply, so the quota is not a coincidence:** 307 `dungeonCapable` instances over 117 regions, of
which **135 over 37 regions** are on surveyed ground, **126 over 33** also within 2 hops. The
ceiling at ≤3 per region is **79** against a quota of 60 — comfortable. (Review J's "99" was 33×3,
the naive bound; the real ceiling is the supply-limited one.)

**And it makes `MAX_PER_REGION` live.** See §14's superseded entry: 3 → 1 now yields 33 anchors and
an under-fill problem on the REAL world, where before it left all 60 byte-identical.

### THE FOUR SILENT HOLES ON PLAN D's PATH — all closed, none of them moves a byte today

1. **A titleless pin minted the wrong `f-town-` id.** `f-town-c-town-gildmark` passes the grammar,
   passes the collision check, passes every test here, and reds `G-NET`/`G-CANON-LEG` at Plan E's
   redraw with no fix available there. `placeSettlements` now THROWS on a pinned entry with no
   title, and `townSlug` refuses the id-fallback for a pin. The fallback stays for GENERATED
   settlements, which is what it was for.
2. **A malformed `at` was never length- or type-checked.** `at: []` produced `atKm [null, null]`
   with `problems: []`; the at/cell disagreement guard could not fire (`NaN > cellKm` is false);
   the pin exerted **no separation** (a generated village landed 4.00 km from a pin that should
   force 9.00); and `assignLevelBands` then threw `bands[ring] is not iterable`. Coordinate pairs
   are now `length === 2` and `Number.isFinite` on both — which also refuses the silently-coerced
   string form.
3. **A pin's declared `continent` was never validated.** A capital pin declaring `"cZZ"` put **two
   capitals on one landmass with `problems: []`**, because `capitalsPerContinent` is keyed on the
   declared continent and the generated tier on `region.continent`. It is joined to the region's
   continent now, and to the premise set when the region does not resolve.
4. **`assignLevelBands`' `problems = []` default was nobody's log** — see §5. Required now.

### THE VETOES — SHIP BOTH; the recorded reason was wrong

**Corrected.** `settlements.mjs`'s comment blamed the premise set ("waiting for a premise with wet
ground above the treeline or on lava"). The world already carries that ground. Over **all owned
land**: above-treeline `{c01: 1841, c03: 309, c10: 1145}`; ice/lava `{c01: 23244, c12: 2997,
c10: 834}`. What masks them is the **survey draw** — only **25,600 of 256,000 owned cells (10%)**
are ever scored, and the four continents holding the alpine and icy ground have **zero surveyed
regions** (c01 0/12, c11 0/2, c12 0/2, c13 0/2). Lift that one filter and the treeline is the
**sole** rejection on 128 cells and {ice, lava} on **13,496**. Both bind the moment the survey draw
moves by one region. Pinned cell by cell in `settlements.test.mjs` so the attribution cannot rot
the way §11's c10 attribution did.

**The surveyed pre-filter's "equivalent, kept for speed" claim STANDS** — it is an exact duplicate
of `scoreSettlement`'s own reported-region veto and changes no output, which is why the mutation
survives. What was wrong was reading "equivalent" as "inconsequential": it is the reason the two
vetoes look dead, and the call-site comment now says so instead of hiding behind the word.

### THREE FIXTURES THAT DID NOT TEST WHAT THEY NAMED

- **The treeline fixture tripped the SLOPE veto.** `grid.elev[high] = VETO.treeline + 0.01` raised
  ONE cell by +0.438 against unchanged neighbours, driving its D8 slope to **0.4390 against a cap of
  0.08**. `scoreSettlement` short-circuits, so the slope line answered and the treeline line was
  never reached — **deleting the treeline veto left the whole suite green.** §14's "both are killed
  by direct fixtures" was FALSE for one of the two. The fixture is a 3×3 plateau now (slope 0), on a
  cell clear of the others, and **every** veto case asserts — independently of the pass's
  short-circuit order — that exactly one veto rejects its cell.
- **The reported-region dungeon fixture was also an island.** `c01/r08` was `reported` AND had no
  path to a settled region, so the new survey filter would have inherited the same confound. It is
  `surveyed` now, isolating the reachability rule, and a separate fixture isolates the survey rule
  by running the SAME instance both ways.
- **`assertRegionIndex` in `routeRoads` had no test at all** — an undeclared survivor, while §14
  credited the guard as "used by P11 and P12". P11's copy was covered; P12's was not.

### THE LEVEL-BAND CHAIN — tested, not deleted

`byPin ?? byContinent ?? anyCapital` and its "anchored on X instead" report were BOTH mutation
survivors, because in Plan C `c-town-gildmark` does not exist and the real-world assertion
`origin === "c02/s01"` is satisfied by the **continent fallback alone**. The property that will
matter in Plan D — that the PIN wins — was pinned by nothing. Four fixtures now cover it: the pin
beats a satisfying continent fallback (and the two origins band the world differently, so it is a
claim about output); the continent fallback answers alone and reports nothing; neither matching
reports the move; and a pin ranked below `capital` is named rather than silently anchoring the
rings (spec §6.5 runs them from the starter CAPITAL).

### REFUTED — do not re-file

- **`MAX_PER_REGION` was not a second defect.** Review J filed it as MAJOR 2 beside MAJOR 1; it is
  the same defect seen from the other end. Fixing the survey filter fixed it. Confirmed by
  measurement, not by argument: the cap became live in the same edit.
- **Review J's "ceiling 99" is the naive 33×3.** The supply-limited ceiling is **79**. Both clear
  the quota of 60, so the conclusion holds and only the number is corrected.
- **STATE §5's sea-lane wording was already right.** It says the plan's whitelist "**drops the
  lane** silently", singular — one lane, not every lane. Nothing to correct here; the
  generalisation lives only in a summary elsewhere.
- **The `at`/`cell` and `continent` holes are the LAST two.** All nine previously declared pin
  rejection behaviours were re-reproduced by direct probe and each is mutation-covered.

### OPEN, recorded rather than chased

- **20 of 38 roads (956 of 1,666 points) cross reported regions**, against spec §6.4 rule 2's "no
  road". Unsatisfiable as written — see §5. **Plan E's decision.**
- **Task 11 opens with 5 `gWorldPoi` failures that are NOT P13's**: surveyed regions below the
  12-POI floor (7 before the anchors, 5 after — the anchors HELP). That is P10's instance supply
  and belongs to whoever writes Task 11.
- **The real-world order-independence test is 2×2, not the 3×3** earlier seams used. Review J
  verified the property at 3×3 externally (three heap comparators × three input orders, all
  byte-identical, on a raster where **50.91% of adjacent land step-costs tie**). The property holds;
  only the committed coverage is thinner than the record implied.
- **`dungeons.mjs` calls 307 "eligible"** in a comment and a test; the pass's `eligible` array is
  the post-hop set. Zero key collisions in both, so the survivor's argument is unaffected.
- `farEnough` measures unquantised cell centres while `atKm` is `q()`-quantised — exact at
  `cellKm 0.5`, but two expressions rather than one.
- `quotas.settlements.total` (45) is never checked against capital + hub + village.
- `coastTerm` at exactly `COAST_FAR_KM` returns 0, so 880 of the 6,955 "taper" cells contribute
  nothing. Correct; the label reads as more than it is.

### THE BUDGET — reported, not decided; the contention factor is the number that matters

Post-fix, warm, median of three on a quiet box, Node v26.5.0. **The fixes do not move it** — P13 is
2 ms and the survey filter is one Map lookup per instance.

```
mask 466   elevation 512   substrate 8   sealevel 89   hydrology 430   winds 512
water 338  biomes 49       regions 850   landforms 538
P11 settlements 166   levelBands 0   P12 roads 744   P13 dungeons 2
TOTAL 4,704 ms       run totals: 4,703 / 5,027 / 4,639
```

Review J measured 4,771 independently pre-fix; the seam reported 4,641. All three agree inside
noise. `budgets.json` `generate` is `budgetMs 4000` / `failMs 8000` and was **NOT edited**.

**P14 + the CLI project to ≈ 5,100–5,300 ms.** Review J timed the geometry P14 needs at **112 ms**
(`extractArcs` 53 + simplify 17 + `assembleRings` 11 for regions, 30 + 1 for continents); the rest
is building, stringifying and hashing ~1,740 instances, 160 regions, 45 settlements, 38 roads and
2 lanes — a few hundred ms.

**`failMs 8000` is ~1.5× away on a quiet box and AT RISK under the contention this repo measures.**
§2 records the same suite at 60–76 s contended against 44.8 s idle: a **1.34–1.70× factor**.
5,200 × that band is **7,000–8,800 ms**, straddling the fail line. One identical build spanned
4,639–5,027 ms inside a single quiet session. **The decision is the owner's at Task 10b.**
P12's 744 ms is inherent as designed — 33 multi-source Dijkstras over ~44,000-cell rasters, already
cut from 1,214 ms by the early stop; the remaining lever is *fewer searches*, which is a redesign.

### FILED WITH PLAN D, not left in a comment

`…-d-pinned-bound-relations.md:1827`'s Consumes block now carries the **`shelterFetchKm` decision**
(`grid.fetchKm` is max-over-axes = wave exposure; the spec's shelter test is min-over-axes =
enclosure; a `shelterFetchKmMax: 15` pin measured against `grid.fetchKm` is unsatisfiable at **332
of 520** port-eligible cells and at all three capitals — 240.5 / 56.5 / 48.5 km), the fact that
**c04 Stonemoor has ZERO port-eligible cells** so `c-town-netstead` cannot be a sheltered-port
capital there, and the corrected `placePinned` result shape including `title`. All three numbers are
pinned in `settlements.test.mjs`'s real-world block. **That insert added 20 lines at Plan D `:1827`;
every Plan D line citation BELOW 1827 in an external note shifts by +20.** No STATE citation into
Plan D is by line number, so nothing here rotted.
