# World Fill — running state

**A living handover file. Read this before starting any of Plans B, C, D or E.**

It exists so a new session does not need the previous session's conversation. If something here
is wrong, fix the file — do not work around it in a prompt.

Last updated: 2026-08-22, after **Plan B shipped** (F-047 → release/1.8, merge `65006fe`),
**Plan C was claimed** as F-048, and **Plan C seams 1, 2 and 3 (Tasks 1-6) were built, reviewed
and adjudicated** — see §9, §10 and §11, and **forty-one** confirmed plan errors in §5.

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
| C — The Fabric Layer | F-048 | **IN FLIGHT** — claimed 2026-08-22, worktree `.claude/worktrees/F-048-…`, base tag `plan-c-base`. |
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

Forty-one confirmed. Each was found by running code, not by reading. **Verify a brief against the
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
