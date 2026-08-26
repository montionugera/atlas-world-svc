# World Fill — Plan E: The Redraw and Prose Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the generated 400 × 400 km world in ONE revertible commit — trunk shrunk 44 → 36 nodes, the 7 canon walking legs re-fit inside ±8%, all six byte comparisons re-baselined in a strict verified order — and reconcile the prose on top of it: 40 surveyed-region zone records with globally unique landmark names and globally unique resource-kind sets, `survey` as a first-class schema field, `Z2` failing in **both** directions, and `G-CITE` retiring every rotting `canon.md:<digits>` line citation.

**What is demonstrably true at the end that was not true at the start:** `git revert -m 1 <merge-sha>` restores the previous green world *and* its renderings in one step; `node scripts/check_canon_legs.mjs` proves all 7 canon distances hold against the pinned coordinates *before* a continent exists; `node scripts/check_content.mjs --require-complete` passes on a 36-node trunk with 13 landmasses; a zone record written for unwalked ground is a hard FAIL instead of silently-accepted prose debt; and `grep -rn "canon\.md:[0-9]" content/story docs/worldbuilding` returns nothing.

**Architecture:** Three ordered movements. **(1) Pre-redraw capability** — four commits that change zero drawn pixels: a citation gate, `survey` promoted from free-form `lore` to a schema field, a canon-leg pre-flight solver, and a whole-world digest. **(2) The redraw** — unfreeze deepest-first in three commits, then ONE commit that runs Plan C's `promoteWorld`, re-fits the edges, re-baselines every byte comparison in the R12 order, and re-homes the aliases; then refreeze root-first with a shrunken, reasoned freeze set. **(3) Prose** — Z2 rewritten in both directions against the fabric, a committed allocation table that solves the 40-zone set-packing before a word is written, 40 zone records, and the `AMENDED-PENDING` re-voicings.

**Tech Stack:** Node ESM (`.mjs`, no dependencies) for map tooling under `tools/mapforge/`; Node ESM with `ajv` under `scripts/` (its own `package.json`, outside the pnpm workspace); `node --test` for both; jest for `colyseus-server`; JSON Schema draft-07 for content shapes; SVG sheets rendered by `tools/mapforge/render-sheet.mjs`.

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
- 13 landmasses, 3 oceans, 9 seas, 160 regions = 40 surveyed + 120 reported, 45 settlements (3 capital / 12 hub / 30 village), 8 town plans QUOTA with 1 authored (E-C9), 60 dungeon complexes / 190 floors (3 families x 8 + 36 bespoke), **170** distinct landform types / **178** group memberships / 8 dual-listed / 23 `dungeonCapable` / 40 glyph families / 12 groups, 1,740 instances / 336 named, 20 biomes, 18 terrain kinds, 626 distinct names.
- The landform census is **170 / 178**, not the spec's 164 / 172: Plan B Task 1 ships six additional rows — `headland`, `ford` and `sea-waterfall`, each bound by a named row of Plan D's pinned roster, plus `ice-shelf`, `ash-front` and `ash-plain`, which are Plan C's generator vocabulary for c01's shelf ice and c10's tephra ground — and Plan B owns the lexicon. Every count printed by `G-LANDFORM` and `world-budget: landforms <n> types` reads 170. Nothing in this plan may re-derive it.
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

## Domain primer — read this before Task 1 if you have never seen this repo

You will not be able to write a correct step in this plan without these eight facts. Each was verified by reading the file named.

**1. The spine is the world's skeleton.** `content/spine/nodes/*.json` — today **44 files**, one JSON object per node. A node has an `id` (`n-<slug>`), a `tier`, a `parentId`, a `placement` (a `polygon`/`rect`/`point` in its parent's coordinate frame), a `composition` (biome percentages summing to 100), and a `derived` block the tooling recomputes. `content/spine/roots.json` holds exactly two roots: `n-atlas` (the *chart* — the drawn world) and `n-playroot` (the *runtime* — the live game maps). They are disjoint subtrees.

**2. A tier is a depth, not a label.** `scripts/lib/spine.mjs:28-38`:
```js
export const TIER_DEPTH = Object.freeze({
  world: 0, playroot: 0,
  continent: 1, ocean: 1, playspace: 1, fixture: 1,
  region: 2, sea: 2,
  town: 3, site: 3,
});
```
A child's depth must be its parent's + 1 (`G-DEPTH`), with exactly one written exception, `DEPTH_EXCEPTIONS = new Set(["playspace>site"])` (`spine.mjs:40`). This plan adds a second.

**3. A `derived` block is machine-computed and byte-checked.** `deriveNode()` (`spine.mjs:459-486`) computes `areaParentUnits2` (exact shoelace), `computedComposition`, `resolvedSeedStreams` (four named sha256 seed streams) and a `digest` (sha256 of the node body). `G-DERIVED-DRIFT` byte-compares the committed block against a fresh recomputation. **Plan B hoists every `derived` block out of the node files into `content/spine/derived.json`**, so by the time you run this plan the node files have no `derived` key and the drift gate is one whole-file comparison.

**4. A "gate" is a named assertion inside `scripts/check_content.mjs`.** Gates are `G-<NAME>` and never throw — errors are returned or pushed in-band, because an uncaught throw skips `finish()` and silently drops every FAIL recorded before it (`gSpineOverlapRollup`'s own comment says so). Gates also **soft-skip**: a content root with no `content/spine/` returns 0 before compiling any schema, because ~45 minimal test fixtures depend on it. Any new gate that hard-fails on a missing directory reddens dozens of existing tests.

**5. Gate 1 vs Gate 2 vs CI are three different lists.**
- **Gate 1** = `./scripts/precheck.sh` — run when a feature ships into the release. Its content step is `node scripts/check_content.mjs --only=spine`. **`--only=spine` is NOT a reduced gate set** (`check_content.mjs:184-191`): it calls the same `checkSpine()` and only skips the story/character/zone/town sweeps. Every new *spine* gate lands in Gate 1 automatically.
- **Gate 2** = `./scripts/integration.sh` — run when the release is promoted to `main`. Runs the full `check_content.mjs --require-complete`, story-graph drift, `check_spine_emit --check`, the render lock, `node --test tools/mapforge/tests/*.test.mjs`, and `npm test --prefix scripts`.
- **CI** = `.github/workflows/ci.yml` — a third list. Plan A adds the mapforge tests and `render-sheet --check` to it.

**6. "Sheets" are the drawn SVG maps.** `tools/mapforge/render-sheet.mjs` holds a `SHEETS` registry (today two entries: `cluster1`, `atlas`) mapping a sheet id to a builder and an output path under `game-client/assets/art/maps/`. Registering a sheet is not cosmetic: `tools/asset-storybook/maps-index.json` must carry one matching row (asserted **both directions** by `tools/asset-storybook/tests/maps-index.test.mjs:33-61`, which runs in Gate 1 *and* CI), and `game-client/assets/art/art-manifest.json` must carry an `art:map-*` entry with a fresh baked thumbnail.

**7. "Frozen" is the coordinate firewall.** 14 nodes carry `frozen: true`. `gSpineFrozen` (`check_content.mjs:1957-1979`) enforces three rules: an **unfrozen** node may not carry `absoluteAnchor`; a **frozen** node's ancestor must also be frozen (transitive, *upward* only — a frozen node with unfrozen children is legal); and a frozen node's `absoluteAnchor` must byte-equal its composed anchor. That directionality is what makes the unfreeze order in Task 5 forced.

**8. The exact commands.** Run every one of these from the repo root of your claimed worktree.
```bash
node scripts/check_content.mjs --only=spine            # Gate 1 fast path (~1 s after Plan A)
node scripts/check_content.mjs --require-complete      # Gate 2 bar
node scripts/check_content.mjs --content-root <dir>    # run against a fixture root
node scripts/check_spine_emit.mjs --check              # 47-file emitter drift
node scripts/check_spine_emit.mjs --write              # re-emit derived.json + the 3 mirrors
node scripts/check_render_lock.mjs --check             # Plan A's checksum lock
node scripts/check_render_lock.mjs --write             # re-baseline the lock
node scripts/check_canon_legs.mjs                      # THIS PLAN, Task 3
node scripts/check_world_digest.mjs --check|--write    # THIS PLAN, Task 4
node tools/mapforge/render-sheet.mjs --sheet atlas --no-png
node tools/mapforge/promote-world.mjs --from build/mapforge/<runId> [--dry-run]
node --test 'tools/mapforge/tests/*.test.mjs'          # GLOB FORM, quoted — a bare dir arg fails
npm test --prefix scripts                              # node --test tests/*.test.mjs
(cd colyseus-server && npm test -- mapDimensions)      # the jest pin — EVERY commit
./scripts/precheck.sh --no-install                     # Gate 1
./scripts/integration.sh --no-install                  # Gate 2
```
A freshly created worktree has **no** `node_modules`. Before anything else: `pnpm install --frozen-lockfile` at the root, `npm ci --prefix scripts`, and `(cd contracts && npm run build)`.

---

## Corrections this plan makes to the shared contract

These are not licence to change scope. Each is a measured fact that a step below depends on; stating them here stops an implementer from "fixing" the plan back into a broken state.

| # | The contract says | Measured truth | What this plan does |
|---|---|---|---|
| **E-C1** | §9.3: unfreeze "towns -> regions -> `n-cluster1` -> `n-atlas`" | The Global Constraints require `n-atlas` to stay `frozen: true`. It can: `gSpineFrozen` only checks a frozen node's **ancestors**, and `n-atlas.parentId === null`. A frozen root over unfrozen children is legal today and stays legal. | The unfreeze stops at `n-cluster1`. `n-atlas` is never unfrozen. Task 5 has **three** commits, not four. |
| **E-C2** | §8.2: `TRUNK_TIERS` becomes `{world, playroot, continent, ocean, sea, playspace}` | Adding `ocean` to today's `TRUNK_TIERS` makes the childless `n-westsea` a **hard FAIL** under `--require-complete` (it carries no `lore.reported`), reddening Gate 2 on a commit that changes no content. | `checkSpineComplete` gains a `WATER_TIERS` skip *before* the trunk branch: an `ocean` or `sea` node has no surveyed interior and is complete when childless. Net effect pre-redraw: **4 fewer warnings, zero new failures.** |
| **E-C3** | §8.2 implies continents keep spine children | Post-redraw the 160 regions are fabric rows, not nodes, so all 13 continents are childless and take 13 hard FAILs. | `checkSpineComplete` gains `fabricRegionCounts`, built by following each trunk node's `provenance.generator.fabric` pin (Plan C's `G-PROVENANCE` addition) and counting `regions.length`. A continent with >= 1 fabric region is complete. |
| **E-C4** | "Spine trunk shrinks 44 -> 36 node files" without a census | 36 only closes with an exact composition. Verified arithmetic: 1 world + 13 continents + 3 oceans + 9 seas + **2 alias-anchor regions** (`n-thornveil`, `n-northern-icefield` — targets of the two `representsNodeId` pointers, hard-failed by `spine.mjs:875-877` if they vanish) + **1 town** (`n-millcross`, the `spineId` host of the one committed town plan) + 7 runtime nodes (`n-playroot`, `n-frontier-shelf`, 3 sites, 2 fixtures) = **36 exactly**. | `content/spine/trunk-census.json` commits that census with a written reason per line. `n-millcross` under a continent needs a second depth exception, `continent>town` — added in Task 6 alongside the census. |
| **E-C5** | §6.3: Wealdmarch 8 surveyed / Coldreach 8 surveyed | 10 zone records and 116 bestiary placement rows are already sworn to the 10 committed basin zones. Folding 10 zones into 8 regions destroys two hand-written records and re-homes ~23 bestiary rows for nothing. | **Wealdmarch 10 surveyed / Coldreach 6 surveyed.** Totals unchanged: 10+6+7+7+3+3+2+1+1 = **40 surveyed**, 120 reported. The per-landmass area residual is absorbed by `G-REGION-SIZE`'s +/-25% surveyed band, which the original 8/8 split also relied on. **Already committed by Plan C Task 1** in `content/world/manifest.json`'s `landmasses[]` (`c02.surveyed: 10`, `c03.surveyed: 6`, each with a written `why`), and pinned by that task's own assertions — this plan consumes it, it does not amend anything. The premise files carry no `regions` key; `premise.schema.json` is `additionalProperties: false`. |
| **E-C6** | §11 D2: "zone records staged one continent per release" | `Z2` iterates the geography, not the files (`check_content.mjs:1042-1045`): once **one** zone file exists, every surveyed region must have exactly one record or the gate fails. Staging would require weakening Z2, which R13 explicitly forbids. | D2's staging applies to **town plans**, which have no completeness gate — see E-C9 for the corrected split. **All 40 zone records land in this plan** (Tasks 11–14). |
| **E-C7** | §9.4: canon legs pinned "with both endpoints required frozen" | Post-redraw, 6 of the 7 legs' endpoint town nodes cease to exist (only `n-millcross` survives, per E-C4). `gSpineNet`'s `rootPoint` would FAIL with `G-NET ... endpoint node "n-gildmark" does not resolve`. | The 7 legs are re-pointed at **trunk point features** (`f-town-gildmark` etc. — "trunk features are the network", spec §5.6), and `G-CANON-LEG`'s endpoint rule becomes **frozen OR pinned**, resolved through the new `content/spine/canon-legs.json`. This lands in Task 3, *before* the unfreeze, or Task 5 reds seven legs at once. |
| **E-C8** | G-CITE scope unstated | `canon.md:<digits>` appears in 4 live worldbuilding docs **and** in ~15 dated design/backlog documents under `docs/superpowers/` and `.claude/`. | G-CITE's scope is **live lore only**: `content/story/**/*.md`, `content/**/*.json` string values, `docs/worldbuilding/**/*.md`. Dated records under `docs/superpowers/` and `.claude/` are excluded by construction — rewriting a dated record is falsifying it. The scope list is a committed constant, not a regex guess. |
| **E-C9** | §11 D2's taken default: "3 capitals' plans now, 5 deferred", against `manifest.quotas.townPlans: 8` | **Three capital town plans cannot be authored inside this programme.** A town plan joins the world by `spineId` (`content/towns/town-millcross.json`, `check_content.mjs:1192`), so each plan needs a `tier:"town"` spine node — and E-C4's census, which Plan C owns and pins with a test, budgets exactly **one** town node. Authoring `town-gildmark.json`, `town-tallowquay.json` and `town-netstead.json` would force `n-gildmark`/`n-tallowquay`/`n-netstead` into the trunk, making the census 39 and reddening Plan C Task 10's `readdirSync(draftNodes).length === 36` assertion on a plan-authoring commit. | **1 town plan authored, 7 deferred.** The quota in `content/world/manifest.json` stays `8` — it is the target, not a claim — and Plan C Task 1's `gSpineBudgets` already prints `world-budget: town-plans <authored> / <quota>` on every gate run, so the debt is a visible number rather than an unknown. This plan authors **no** file under `content/towns/`, and Plan D's roster carries `"plan": null` on the three deferred capitals for the same reason — a `plan` path naming a file nobody writes is worse than an honest null, because `check_content.mjs:1192`'s T1 join reads it. Exactly one roster row (`c-town-millcross`) carries a path, and Plan D Task 4 Step 1b asserts that with `assert.deepEqual(withPlan, ["c-town-millcross"])`. Raising the count is a future release: one plan, one node, one census line, one reviewed commit — the mechanism is written into `trunk-census.json`'s `why.town`. |
| **E-C10** | §11's sheet budget "≤ 16 (1 atlas + 13 continents + 1 basin + 1 overlay)" names 13 continent sheets that no plan builds | Across Plans A–D the `SHEETS` registry ends at five entries: `cluster1`, `atlas` (live today), `synthetic` (Plan B Task 10), `fabric` and `overlay` (Plan C Task 13). Nothing creates a per-continent builder, so 1,740 instances, 336 named landforms and 45 settlements would be generated with no sheet that draws them, and §7.4's `maxLabelRank: 8` continent zoom tier would never be exercised on real content. | **Task 8 of this plan builds them**: `tools/mapforge/lib/continent-sheet.mjs`, one builder parameterised by continent id over `content/world/resolved/continent-NN.json`, and 13 `SHEETS` entries with their storybook rows, art-manifest entries and baked thumbs. The roster then closes at **18** (1 atlas + 1 basin + 13 continent + 1 overlay + 1 fabric + 1 synthetic), which is the number `budgets.sheets.maxSheets` carries and the number Task 16 Step 7 checks. |

---

## File Structure

Every file this plan creates (`C`), modifies (`M`) or deletes (`D`).

| Op | Path | Responsibility |
|---|---|---|
| C | `scripts/lib/citations.mjs` | `canonSections`, `resolveCanonCite`, `scanCitations`, `checkCitations` — the section-citation model and G-CITE's failure strings |
| C | `scripts/check_canon_legs.mjs` | CLI pre-flight: resolve the 7 canon legs against the pinned coordinates and report the residual at +/-8% before a continent exists |
| C | `content/spine/canon-legs.json` | The committed leg -> pinned-record join, and the only place a leg endpoint may be named |
| C | `scripts/lib/world-digest.mjs` | `computeWorldDigest` / `checkWorldDigest` — per-input sha256 over fabric + resolved + trunk |
| C | `scripts/check_world_digest.mjs` | CLI `--check` / `--write` for `G-WORLD-DIGEST` |
| C | `content/spine/world-digest.json` | The committed digest — one line changes on a deliberate regeneration |
| C | `content/spine/trunk-census.json` | The 36-node census with a written reason per tier (E-C4) |
| C | `scripts/lib/survey.mjs` | `surveyOf`, `loadFabricRegionIndex` — the one place `surveyed` / `reported` is decided |
| C | `docs/worldbuilding/A4-zone-allocation.md` | The 40-row allocation table: zone id, continent, fabric region id, resource-kind set, 2 landmark names. Solves the set-packing before any prose is written |
| C | `content/zones/zone-*.json` | 30 new surveyed-region records (40 total) |
| C | `scripts/tests/citations.test.mjs` | G-CITE: line form fails, section form resolves, out-of-scope paths are untouched |
| C | `scripts/tests/canon-legs.test.mjs` | The pre-flight: a broken leg fails with the remedy in the message; a missing pin is diagnosable |
| C | `scripts/tests/world-digest.test.mjs` | Round-trip, per-input attribution, `absent` handling |
| C | `scripts/tests/survey.test.mjs` | `survey` field precedence, `lore.reported` fallback, fabric index |
| C | `scripts/tests/zone-allocation.test.mjs` | The allocation table is Z6-clean: 40 distinct kind-sets, 80 globally unique landmark names, every row names a real fabric region |
| C | `scripts/tests/fixtures/spine/e-water-childless/` | Overlay fixture: a childless ocean and sea are complete |
| C | `scripts/tests/fixtures/spine/e-continent-fabric/` | Overlay fixture: a childless continent with a fabric pin is complete; without one it FAILs |
| C | `tools/mapforge/lib/continent-sheet.mjs` | `buildContinentSheet({ repoRoot, continent })` — the per-continent zoom tier (`maxLabelRank: 8`), one builder for all 13 (E-C10) |
| C | `tools/mapforge/tests/continent-sheet.test.mjs` | 13 registry entries, one storybook row each, zero `PROBLEMS` on the densest continent, the committed SVGs are not stale |
| C | `game-client/assets/art/maps/<continent>.svg` | 13 continent sheets (`wealdmarch.svg` … `loamspit.svg`) |
| M | `scripts/lib/spine.mjs:890-909` | `TRUNK_TIERS` gains `ocean`, `sea`; new `WATER_TIERS`; `checkSpineComplete({tree, fabricRegionCounts})`; `surveyOf` re-export; `DEPTH_EXCEPTIONS` gains `continent>town` |
| M | `scripts/check_content.mjs:198-201` | `checkCitations(opts)` wired into the full sweep only (never `--only=spine`) |
| M | `scripts/check_content.mjs:940-1071` | `checkZoneContent`: `Z2` in both directions against the fabric survey index; the completeness universe becomes the surveyed regions, not the mirror's zone list |
| M | `scripts/check_content.mjs:1773-1777` | `checkSpineComplete` call passes `fabricRegionCounts` |
| M | `scripts/check_content.mjs:2027-2038` | `G-CANON-LEG` endpoint rule: frozen **or** pinned via `content/spine/canon-legs.json` |
| M | `content/schemas/spine-node.schema.json:6-8` | `survey: {"enum": ["surveyed","reported"]}` as a first-class optional property in the root `properties` block (Plan B already flipped the root to `additionalProperties: false`, so this is required to add it at all) |
| M | `content/schemas/zone-content.schema.json:6-8` | `region` and `survey` join keys, added to both the root `required` array (`:6`) and the root `properties` block (`:8`) |
| M | `content/spine/nodes/*.json` | 44 -> 36 files in ONE redraw commit; unfreeze deepest-first, refreeze root-first (generated data files, rewritten wholesale by `promote-world.mjs` — no anchor to give) |
| M | `content/spine/edges.json:1-654` | 7 leg edges re-pointed at trunk point features and re-fit; 8 road edges re-pointed (the first at `:4`); runtime edges preserved by root membership. Whole-array rewrite, not a hunk |
| M | `content/spine/derived.json` | Re-emitted wholesale by `check_spine_emit.mjs --write` — never hand-edited, no anchor |
| M | `content/world/render-lock.json` | Re-baselined in the strict R12 order. Generated file, created by Plan A Task 10 and only ever rewritten by `node scripts/check_render_lock.mjs --write` — no anchor |
| M | `content/zones/zone-*.json` (10 existing) | Gain `region` + `survey`; re-homed onto the new Wealdmarch region ids (two added keys per file, at the top level beside `zone`) |
| M | `content/story/canon.md` | ~30 line citations -> section citations; 5 `AMENDED-PENDING` markers re-voiced. Whole-file sweep — the citations are scattered across all 522 lines, so no anchor is meaningful |
| M | `docs/worldbuilding/A0-current-world.md` | ~26 line citations (whole-file sweep); 3 `AMENDED-PENDING` markers, one of them at `:454` |
| M | `docs/worldbuilding/A1-cosmology.md` | 4 line citations (whole-file sweep) |
| M | `docs/worldbuilding/A1-geography-cluster1.md:290,319,331` | 7 `AMENDED-PENDING` markers; the reconciliation table, ridge-line length and tower spacing at those three lines are recomputed, not re-voiced; basin geography re-voiced onto Wealdmarch |
| M | `docs/worldbuilding/A2-zones-cluster1.md` | 1 `AMENDED-PENDING` marker (whole-file sweep to find it — `grep -n AMENDED-PENDING`) |
| M | `docs/worldbuilding/A2-wider-world.md:43-91` | §3 "The continents" and §4 "The chains, the seas, the cap": Driftholt/Reedstrand promoted to minor continent, `n-westsea` demoted to `sea`, the 9 sea names knitted in |
| M | `docs/worldbuilding/F-043-wider-world-panel.md:71` | 1 line citation |
| M | `docs/worldbuilding/DR-003-season-1-budget.md:135` | 1 line citation |
| M | `scripts/tests/seal-provenance.test.mjs:80-108` | The blank-line citation test and its `KNOWN_STALE` set are superseded by G-CITE and deleted |
| M | `scripts/tests/zone-content.test.mjs:334-370,483,493,507` | `allZones`/`fixture` gain `region` + `survey`; the fixture root at `:355` moves off `content/maps/cluster1-geography.json`; the three literal expectations move with the gate messages; new Z2 both-direction tests |
| M | `scripts/tests/spine-gates.test.mjs:180-200,393-410` | Water-tier and fabric-count completeness tests; the `realSpineCopy()` counts at `:180-200` move to the new census; the two hermetic `G-OVERLAP` assertions at `:403,410` must NOT move |
| M | `game-client/assets/art/maps/*.svg` | Regenerated sheets — 18 after Task 8 (generated artifacts, no anchor) |
| M | `game-client/assets/art/art-manifest.json:517` | New `art:map-*` entries modelled on the committed `art:map-atlas` block at `:517`, license rows, thumbnail re-bake |
| M | `tools/asset-storybook/maps-index.json:4-19` | The `sheets[]` array grows to 18 rows (2 today at `:5-19`); parity is asserted both directions by `tools/asset-storybook/tests/maps-index.test.mjs:33-61` |
| M | `content/bestiary/*.json`, `content/story/regions.json`, `content/towns/town-millcross.json` | Alias re-homing under D1 default (a) — ids preserved wherever possible. Data files keyed by region slug; the rows to touch are enumerated by the gate, not by a line range |
| M | `scripts/integration.sh:90-112,114-127` | Add `canon_legs` and `world_digest` section functions beside `spine_emit_drift` (`:90`) and `mapforge_tests` (`:112`), and their `run_section` lines in the `--- Execute ---` block (`:114-127`) |
| M | `.github/workflows/ci.yml:102-103` | Add `check_canon_legs.mjs` and `check_world_digest.mjs --check` steps beside the story-graph drift-gate step at `:102-103` |

---

## Interfaces this plan consumes from other plans

Nothing below is implemented here. If a signature is missing when a task runs, **stop and report it** — do not reimplement another plan's file.

**From Plan A**
```js
// scripts/lib/places.mjs
export function loadPlaces({ contentRoot }): { doc: object|null, problems: string[] }
export function resolveWorld({ spine, tree, descriptor, fabric, civil }): { doc: object|null, problems: string[] }
// scripts/lib/render-lock.mjs
export function computeLock({ repoRoot, sheets, extraPaths }): { version: 2, generator: {...}, artifacts: Record<string,string> }
// CLI: node scripts/check_render_lock.mjs --check | --write
// SHEETS[id] = { title, outSvg, outPng, maxLabelRank, build({repoRoot}) }
```

**From Plan B**
```js
// scripts/lib/spine.mjs
export const BIOMES        // 20 entries
export const TERRAIN_KINDS // 18 entries
// content/schemas/spine-node.schema.json — root additionalProperties:false, `derived` removed
// content/spine/derived.json — hoisted derived blocks keyed by node id
// content/schemas/spine-edge.schema.json — the edges.json schema
// content/world/lexicon/landforms.json — 170 types / 178 group memberships / 8 dual-listed
// the render capability Task 8's continent sheets are built from:
// tools/mapforge/lib/draft.mjs   — C, r2, esc, createDraft, patternDefs({ids}), LEGEND,
//                                  FILL_FOR (terrainKind -> pattern), BIOME_FILL (biome -> pattern), ROAD_W
// tools/mapforge/lib/ink.mjs     — checkBiomeInk({emittedIds, referencedIds, legendTier}),
//                                  frontierPattern(provenance) -> pattern id (the ONE
//                                  provenance -> hatch mapping; do not re-declare it)
// tools/mapforge/lib/glyphs.mjs  — GLYPHS, symbolDefs({ids}), glyphUse({id,x,y,size}),
//                                  checkGlyphCoverage({lexicon, namedCounts, emittedIds})
// tools/mapforge/lib/labels.mjs  — RANKS, placeLabels({labels, obstacles, maxLabelRank, frame}),
//                                  checkLabels({placed, dropped, tier})
// tools/mapforge/lib/texture-bake.mjs — bakedUnderlay({regions, pxPerKm})
```

**From Plan C**
```js
// CLI: node tools/mapforge/promote-world.mjs --from build/mapforge/<runId> [--dry-run]
export function promoteWorld({ repoRoot, runDir, dryRun }): { written: string[], deleted: string[], errors: string[] }
// content/world/fabric/continent-NN.json  -> { continent, premise, regions: [{ id, survey, areaKm2, ... }], instances }
// content/world/manifest.json
// G-PROVENANCE now pins node.provenance.generator.fabric = "content/world/fabric/continent-NN.json"
```
**The surveyed split (E-C5) — consumed, already committed by Plan C Task 1.** `content/world/manifest.json`'s `landmasses[]` declares `c02` (Wealdmarch) `surveyed: 10, reported: 20` and `c03` (Coldreach) `surveyed: 6, reported: 20`, with a written `why` citing the 10 committed zone records and 116 bestiary placement rows. Plan C Task 1's own assertions pin `c02.surveyed === 10` and `c03.surveyed === 6` and keep Σsurveyed = 40 / Σreported = 120. **This is not a premise-file key** — `content/schemas/premise.schema.json` is `additionalProperties: false` and has no `regions` property; the region quota lives in the manifest and the premises consume it. Every other landmass row is unchanged.

**The 36-file trunk (E-C4) — consumed, produced by Plan C Task 10 (`buildTrunk` + `buildWaterTrunk` + `preservedChartNodes`) and written by Task 12's `promoteWorld`.** The promoted trunk is `n-atlas` unchanged + 13 continent nodes each with `provenance.generator.fabric` set + 3 `tier:"ocean"` nodes + 9 `tier:"sea"` nodes nested inside their ocean (G-CONTAIN) + the two alias-anchor region nodes `n-thornveil` and `n-northern-icefield` re-parented onto Wealdmarch + the single town node `n-millcross` + the 7-node runtime subtree copied verbatim = **36 files**. Plan C Task 10's test `the three preserved chart anchors survive generation, re-parented not deleted` and Task 12's `promote PRESERVES...` test are the proofs; Task 6 Step 1's `content/spine/trunk-census.json` is the committed restatement. Each continent node also carries one `kind:"point"` feature per settlement, id `f-town-<slug>` — the endpoints Task 6 Step 6 re-points the seven canon legs at.

**From Plan D**
```js
// scripts/lib/resolve.mjs
export function resolveCivil({ fabric, handles, civil }): { resolved: ResolvedWorld, problems: string[] }
// scripts/lib/relations.mjs
export function checkRelations({ relations, resolved, fabric }): { drifts: [...] }
// content/world/civil/pinned/*.json — ~40 records, each with pin.at [x,y] and pin.toleranceKm
// content/world/resolved/*.json — the committed join output renderers read
// content/world/names/registers.json, content/world/names/reserved.json
```

## Interfaces this plan produces

```js
// scripts/lib/citations.mjs
/** @typedef {{n:number, heading:string, line:number, subheadings:string[]}} CanonSection */
export const CITE_SCOPE: ReadonlyArray<string>            // committed path prefixes; E-C8
export function canonSections({ text }): Map<number, CanonSection>
export function resolveCanonCite({ sections, section, heading }): CanonSection | null
export function scanCitations({ files }): { line: Array<{file,line,text}>, section: Array<{file,line,section,heading}> }
export function checkCitations({ repoRoot, canonText, files }): string[]   // G-CITE failure messages

// scripts/lib/survey.mjs
/** @typedef {"surveyed"|"reported"} Survey */
export function surveyOf({ node }): Survey                 // node.survey ?? (node.lore?.reported === true ? "reported" : "surveyed")
export function loadFabricRegionIndex({ contentRoot }):
  { byRegionId: Map<string, {continent:string, survey:Survey, areaKm2:number}>,
    countByFabricPath: Map<string, number>, problems: string[] }
export function fabricRegionCountsFor({ nodes, index }): Map<string, number>   // node id -> region count

// scripts/lib/world-digest.mjs
export function computeWorldDigest({ repoRoot, inputs }):
  { version: 1, inputs: Record<string, string>, digest: string }   // per-input "sha256:<hex>" or "absent"
export function checkWorldDigest({ committed, computed }): string[]

// tools/mapforge/lib/continent-sheet.mjs
export const CONTINENT_SHEETS: ReadonlyArray<{ id: string, continent: string, title: string }>  // 13 rows, c01..c13
export function buildContinentSheet({ repoRoot, continent }): { svg: string, notes: string[], problems: string[] }
// and 13 SHEETS entries in tools/mapforge/render-sheet.mjs, each maxLabelRank 8

// scripts/lib/spine.mjs (extended here)
export const WATER_TIERS: ReadonlySet<string>              // {"ocean","sea"}
export const TRUNK_TIERS: ReadonlySet<string>              // {world, playroot, continent, ocean, sea, playspace}
export function checkSpineComplete({ tree, fabricRegionCounts }): { errors: string[], warns: string[] }
// DEPTH_EXCEPTIONS gains "continent>town"
```

---

## Task order and why it cannot be re-derived

```
1 G-CITE ──┐                       (before any new lore is written — spec §9.6)
2 survey field ──┐
3 canon-leg pre-flight + G-CANON-LEG frozen-OR-pinned ──┐
4 world-digest ──┤                                      │
                 └──> 5 unfreeze (3 commits) ───────────┘
                            └──> 6 THE REDRAW (1 commit)
                                      └──> 7 refreeze root-first
                                              └──> 8 the 13 continent sheets
                                                └──> 9 Z2 both ways
                                                          └──> 10 allocation table
                                                                └──> 11 zone records: Wealdmarch + Coldreach
                                                                     └──> 12 Stonemoor · 13 Thirstwold · 14 the minors
                                                                            └──> 15 prose
                                                                                     └──> 16 final green
```

- **Task 3 must precede Task 5.** Unfreezing the six canon towns while `G-CANON-LEG` still demands frozen endpoints reds seven legs at once, and someone will "just disable the gate for now."
- **Tasks 1, 2, 4 change zero drawn pixels.** All six byte comparisons stay green **without re-baselining**. If one of them needs a re-baseline, the change is not scaffolding — stop and re-scope it.
- **Task 6 is one commit.** Its steps re-baseline in the strict R12 order — spine canonicalisation, geography emit, sheets, fixtures, storybook index, art manifest + thumbs — each verified alone before the single `git commit`. Any failure surviving a completed step is a real defect, not whiplash.
- **Task 8 must follow Task 7 and precede Task 9.** The continent sheets read `content/world/resolved/*.json`, which only exists after the redraw; and they must exist before the prose lane starts, because Tasks 11–14 are written by looking at a region and the sheet is how a human looks at one. It is also the last commit that adds a drawn artifact, so the render lock stops moving after it.
- **Task 9 must follow Task 6.** Before the redraw the fabric describes a world the spine has not adopted; a fabric-keyed Z2 would demand 40 records against a 10-zone chart.
- **Tasks 12, 13 and 14 are three tasks, not one.** 24 zone records is three independent editorial units (Stonemoor's karst, Thirstwold's erg, the seven small landmasses), each with its own register and its own review — a single 24-record diff cannot be reviewed by one adversarial reader in one pass, which is exactly how a filler record ships.

---

### Task 1: G-CITE and the citation sweep

Citation rot has happened **five times**. `content/story/canon.md` is 522 lines; one insertion in §1 rots every citation below it, and **no gate validates any of them** (`grep -n "citation\|canonRef" scripts/check_content.mjs` returns nothing). This task lands the gate first, then rewrites every live-lore citation to the section form, so all the prose written in Tasks 10–12 is born citing correctly.

**Domain notes.** `canon.md`'s headings are stable and numbered at H2 (`## 1. World chronology` … `## 6. Contradiction rule`); H3s are named but mostly unnumbered (`### How news travels (the Bellfaith, three layers, two speeds)`), except under §6 where they are numbered (`### 6.1 Keyspace register`). A section citation is `` `canon.md §4 "How news travels (the Bellfaith, three layers, two speeds)"` `` and resolves when the heading text matches either the H2 title of §4 or any H3 inside §4 (trimmed, case-insensitive; a numbered H3 matches on either its full text or its text minus the `N.M ` prefix).

**Files:**
- Create: `scripts/lib/citations.mjs`
- Create: `scripts/tests/citations.test.mjs`
- Modify: `scripts/check_content.mjs:198-201` (wire `checkCitations` into the full sweep only)
- Modify: `content/story/canon.md` (self-citations, if any), `docs/worldbuilding/A0-current-world.md`, `docs/worldbuilding/A1-cosmology.md`, `docs/worldbuilding/F-043-wider-world-panel.md`, `docs/worldbuilding/DR-003-season-1-budget.md`
- Modify: `scripts/tests/seal-provenance.test.mjs:80-108` (delete the superseded blank-line test)
- Test: `scripts/tests/citations.test.mjs`

**Interfaces:**
- Consumes: nothing from other plans.
- Produces: `CITE_SCOPE`, `canonSections({text})`, `resolveCanonCite({sections, section, heading})`, `scanCitations({files})`, `checkCitations({repoRoot, canonText, files})` — **Plan D's relation `cite` strings are validated by this same resolver**, so every `cite` in `content/world/relations/*.json` must use the section form.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/citations.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonSections, resolveCanonCite, scanCitations, checkCitations, CITE_SCOPE }
  from "../lib/citations.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CANON = readFileSync(join(ROOT, "content/story/canon.md"), "utf8");

const FAKE_CANON = [
  "# Title",
  "",
  "## 1. World chronology",
  "text",
  "",
  "## 4. Geography & trade logic",
  "text",
  "",
  "### How news travels (the Bellfaith, three layers, two speeds)",
  "text",
  "",
  "## 6. Contradiction rule",
  "",
  "### 6.1 Keyspace register",
  "text",
].join("\n");

function scratch(files) {
  const dir = mkdtempSync(join(tmpdir(), "cite-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body, "utf8");
  }
  return dir;
}

test("canonSections indexes H2 numbers and their H3 children", () => {
  const s = canonSections({ text: FAKE_CANON });
  assert.equal(s.size, 3);
  assert.equal(s.get(4).heading, "Geography & trade logic");
  assert.deepEqual(s.get(4).subheadings,
    ["How news travels (the Bellfaith, three layers, two speeds)"]);
  assert.deepEqual(s.get(6).subheadings, ["6.1 Keyspace register"]);
});

test("resolveCanonCite matches an H2 title, an H3 title, and a numbered H3 minus its prefix", () => {
  const s = canonSections({ text: FAKE_CANON });
  assert.ok(resolveCanonCite({ sections: s, section: 4, heading: "Geography & trade logic" }));
  assert.ok(resolveCanonCite({ sections: s, section: 4,
    heading: "How news travels (the Bellfaith, three layers, two speeds)" }));
  assert.ok(resolveCanonCite({ sections: s, section: 6, heading: "Keyspace register" }));
  assert.equal(resolveCanonCite({ sections: s, section: 4, heading: "The bramble road" }), null);
  assert.equal(resolveCanonCite({ sections: s, section: 9, heading: "anything" }), null);
});

test("G-CITE fails a line citation with the remedy in the message", () => {
  const dir = scratch({
    "content/story/canon.md": FAKE_CANON,
    "docs/worldbuilding/A9-test.md": 'Millcross is the hub (`canon.md:173-174`).\n',
  });
  const out = checkCitations({ repoRoot: dir, canonText: FAKE_CANON,
    files: ["docs/worldbuilding/A9-test.md"] });
  assert.equal(out.length, 1);
  assert.match(out[0],
    /^G-CITE: docs\/worldbuilding\/A9-test\.md:1 cites canon\.md:173-174 — line citations rot on insert; cite the section$/);
});

test("G-CITE fails a section citation that does not resolve", () => {
  const dir = scratch({
    "content/story/canon.md": FAKE_CANON,
    "docs/worldbuilding/A9-test.md": 'See `canon.md §4 "The bramble road"`.\n',
  });
  const out = checkCitations({ repoRoot: dir, canonText: FAKE_CANON,
    files: ["docs/worldbuilding/A9-test.md"] });
  assert.deepEqual(out,
    ['G-CITE: docs/worldbuilding/A9-test.md cites canon.md §4 "The bramble road" which does not resolve']);
});

test("G-CITE passes a resolving section citation", () => {
  const dir = scratch({
    "content/story/canon.md": FAKE_CANON,
    "docs/worldbuilding/A9-test.md": 'See `canon.md §4 "Geography & trade logic"`.\n',
  });
  assert.deepEqual(checkCitations({ repoRoot: dir, canonText: FAKE_CANON,
    files: ["docs/worldbuilding/A9-test.md"] }), []);
});

test("CITE_SCOPE excludes dated records — rewriting one would falsify it (E-C8)", () => {
  assert.deepEqual([...CITE_SCOPE].sort(),
    ["content/", "docs/worldbuilding/"]);
  assert.ok(!CITE_SCOPE.some((p) => p.startsWith("docs/superpowers")));
  assert.ok(!CITE_SCOPE.some((p) => p.startsWith(".claude")));
});

test("the live corpus carries no canon.md line citations", () => {
  const files = scanCitations({ files: [] }); // signature smoke — real sweep below
  assert.ok(files);
  const out = checkCitations({ repoRoot: ROOT, canonText: CANON, files: null });
  assert.deepEqual(out, [], `G-CITE failures in the live corpus:\n${out.join("\n")}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test 'scripts/tests/citations.test.mjs'`

Expected: FAIL with `Cannot find module '.../scripts/lib/citations.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/citations.mjs`:

```js
// G-CITE — citation integrity for content/story/canon.md (spec §9.6, R14).
//
// Fifth occurrence of rot-on-insert. canon.md is 522 lines and one insertion
// in §1 silently invalidates every `canon.md:<digits>` below it. The line form
// is banned; the section form is checked for resolution.
//
// SCOPE IS DELIBERATELY NARROW (plan E-C8). Dated records — anything under
// docs/superpowers/ or .claude/ — are design artifacts of a moment. Rewriting
// their citations would falsify the record of what was true when they were
// written. Only LIVE lore is swept.
//
// Never throws: every problem is a returned string, matching the gate contract
// in scripts/lib/spine.mjs's header.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const CITE_SCOPE = Object.freeze(["content/", "docs/worldbuilding/"]);

const SWEEP_EXT = new Set([".md", ".json"]);
const LINE_RE = /`canon\.md:(\d+)(?:-(\d+))?`/g;
const SECTION_RE = /`canon\.md §(\d+) "([^"]+)"`/g;

const norm = (s) => s.trim().toLowerCase();
// A numbered H3 ("6.1 Keyspace register") must match on its bare title too.
const stripNum = (s) => s.replace(/^\d+(?:\.\d+)*\s+/, "");

/** Index canon.md's H2 sections and the H3 headings inside each. */
export function canonSections({ text }) {
  const sections = new Map();
  let current = null;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const h2 = /^## (\d+)\.\s+(.+?)\s*$/.exec(lines[i]);
    if (h2) {
      current = { n: Number(h2[1]), heading: h2[2], line: i + 1, subheadings: [] };
      sections.set(current.n, current);
      continue;
    }
    if (/^## /.test(lines[i])) { current = null; continue; }
    const h3 = /^### (.+?)\s*$/.exec(lines[i]);
    if (h3 && current) current.subheadings.push(h3[1]);
  }
  return sections;
}

/** null when the section number is unknown or no heading in it matches. */
export function resolveCanonCite({ sections, section, heading }) {
  const s = sections.get(section);
  if (!s) return null;
  const want = norm(heading);
  if (norm(s.heading) === want) return s;
  for (const sub of s.subheadings)
    if (norm(sub) === want || norm(stripNum(sub)) === want) return s;
  return null;
}

function walk(dir, out) {
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SWEEP_EXT.has(name.slice(name.lastIndexOf(".")))) out.push(full);
  }
  return out;
}

/** Every in-scope file under repoRoot, repo-relative and sorted. */
export function citeFiles({ repoRoot }) {
  const out = [];
  for (const prefix of CITE_SCOPE) {
    const dir = join(repoRoot, prefix);
    if (!existsSync(dir)) continue; // soft-skip: fixture roots carry neither
    walk(dir, out);
  }
  return out.map((f) => relative(repoRoot, f)).sort();
}

/** Both citation forms with their 1-based line numbers. Pure over text. */
export function scanCitations({ files }) {
  const line = [], section = [];
  for (const { path, text } of files ?? []) {
    const rows = text.split("\n");
    for (let i = 0; i < rows.length; i++) {
      for (const m of rows[i].matchAll(LINE_RE))
        line.push({ file: path, line: i + 1, text: m[0].replaceAll("`", "") });
      for (const m of rows[i].matchAll(SECTION_RE))
        section.push({ file: path, line: i + 1, section: Number(m[1]), heading: m[2] });
    }
  }
  return { line, section };
}

/** G-CITE. `files` null = sweep CITE_SCOPE under repoRoot. */
export function checkCitations({ repoRoot, canonText, files = null }) {
  const rels = files ?? citeFiles({ repoRoot });
  const loaded = [];
  for (const rel of rels) {
    const full = join(repoRoot, rel);
    if (!existsSync(full)) continue;
    loaded.push({ path: rel, text: readFileSync(full, "utf8") });
  }
  const { line, section } = scanCitations({ files: loaded });
  const sections = canonSections({ text: canonText });
  const problems = [];
  for (const c of line)
    problems.push(`G-CITE: ${c.file}:${c.line} cites ${c.text} — line citations rot on insert; cite the section`);
  for (const c of section)
    if (!resolveCanonCite({ sections, section: c.section, heading: c.heading }))
      problems.push(`G-CITE: ${c.file} cites canon.md §${c.section} "${c.heading}" which does not resolve`);
  return problems;
}
```

- [ ] **Step 4: Wire G-CITE into the gate**

In `scripts/check_content.mjs`, add to the import block at the top (after the existing `scripts/lib/*` imports):

```js
import { checkCitations } from "./lib/citations.mjs";
```

Then replace `main()`'s body at `scripts/check_content.mjs:198-201`:

```js
  const zoneCount = checkZoneContent(opts);
  const townCount = checkTownPlan(opts);
  const nodeCount = checkSpine(opts, mobTypes);
  return finish(sheetCount, mapCount, story.count, placementCount, zoneCount, townCount, nodeCount);
```

with:

```js
  const zoneCount = checkZoneContent(opts);
  const townCount = checkTownPlan(opts);
  // G-CITE (spec §9.6). Full sweep only — never --only=spine: this reads the
  // prose corpus, not the spine, and Gate 1's ~4 s budget is a hard cap on the
  // spine gate set. Soft-skips a content root without content/story/canon.md,
  // the same discipline loadSpine() uses for a missing spine dir.
  const canonPath = join(opts.contentRoot, "story/canon.md");
  if (existsSync(canonPath))
    for (const p of checkCitations({ repoRoot: ROOT, canonText: readFileSync(canonPath, "utf8") }))
      fail(p);
  const nodeCount = checkSpine(opts, mobTypes);
  return finish(sheetCount, mapCount, story.count, placementCount, zoneCount, townCount, nodeCount);
```

- [ ] **Step 5: Run the gate and capture the red list**

Run: `node scripts/check_content.mjs --require-complete 2>&1 | grep "G-CITE" | tee /tmp/g-cite-red.txt; wc -l /tmp/g-cite-red.txt`

Expected: ~33 `G-CITE:` failures across `docs/worldbuilding/A0-current-world.md` (about 26), `A1-cosmology.md` (4), `F-043-wider-world-panel.md` (1) and `DR-003-season-1-budget.md` (1). This list is the work order for Step 6.

- [ ] **Step 6: Rewrite every line citation to the section form**

For each entry in `/tmp/g-cite-red.txt`, open the cited `canon.md` line range, find the enclosing `##`/`###` heading, and replace the citation. Worked examples from the real corpus — these four are the patterns; apply the same reading to the rest:

| File:line | Was | Becomes |
|---|---|---|
| `A0-current-world.md:58` | `` (`canon.md:173-174`) `` | `` (`canon.md §4 "Geography & trade logic"`) `` |
| `A0-current-world.md:62` | `` (`canon.md:190-192`) `` | `` (`canon.md §4 "Geography & trade logic"`) `` |
| `A0-current-world.md:455` | `` (`canon.md:222-225`) `` | `` (`canon.md §4 "How news travels (the Bellfaith, three layers, two speeds)"`) `` |
| `A1-cosmology.md:183` | `` (`canon.md:428`) `` | `` (`canon.md §5 "The elements"`) `` |

Rule: cite the **narrowest resolving heading** — an H3 when the claim sits inside one, the H2 otherwise. Never invent a heading; run Step 7 after every few edits, not once at the end.

- [ ] **Step 7: Delete the superseded blank-line test**

`scripts/tests/seal-provenance.test.mjs:80-108` holds `test('no canon.md citation in a worldbuilding doc lands on a blank line', ...)` and a `KNOWN_STALE` set of three tolerated rotted citations. G-CITE bans the form outright, so the test is dead and the tolerance list is a liability. Delete the whole `test(...)` block from line 80 (`test('no canon.md citation in a worldbuilding doc lands on a blank line', () => {`) through its closing `});`, and remove `readdirSync`/`WB_DIR` from the import block **only if no other test in the file uses them** (the "no world doc calls forging the seal the high-value crime" test does — leave them).

- [ ] **Step 8: Run the full verification**

Run:
```bash
node --test 'scripts/tests/citations.test.mjs'
node scripts/check_content.mjs --require-complete
npm test --prefix scripts
(cd colyseus-server && npm test -- mapDimensions)
node scripts/check_render_lock.mjs --check
node scripts/check_spine_emit.mjs --check
```
Expected: all PASS. **`check_render_lock --check` and `check_spine_emit --check` must pass WITHOUT a re-baseline** — this task changes prose only; if either drifts, something outside the citation sweep was edited.

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/citations.mjs scripts/tests/citations.test.mjs scripts/check_content.mjs \
        scripts/tests/seal-provenance.test.mjs content/story/canon.md docs/worldbuilding/
git commit -m "feat: G-CITE section citations, retire canon.md line refs"
```

- [ ] **Step 10: Quality gate — verify**

Run: `./scripts/precheck.sh --no-install` and paste the output. Expected: every section PASS.

- [ ] **Step 11: Quality gate — independent adversarial review**

Dispatch a fresh reviewer subagent (or `/code-review`) on `git diff HEAD~1` with this brief: *"Adversarially review this diff. Specifically: (a) does `canonSections` mis-index a `##` heading that is not numbered? (b) can `checkCitations` throw on an unreadable file, which would skip `finish()` and silently drop every FAIL before it? (c) did any citation rewrite change the CLAIM the sentence makes, not just its pointer? (d) is `CITE_SCOPE` reachable from a fixture content root that has no `docs/`?"*

- [ ] **Step 12: Quality gate — refactor on the findings**

Apply every finding. Do not carry any forward as "later."

- [ ] **Step 13: Quality gate — re-verify and report**

Run: `./scripts/precheck.sh --no-install && node --test 'scripts/tests/citations.test.mjs' && git branch --show-current && git log --oneline -1`

---

### Task 2: `survey` as a first-class field; water tiers and fabric-aware completeness

Today "is this ground walked or merely reported?" is a free-form `lore.reported === true` flag on 15 nodes (`n-brightfall`, `n-coldreach`, `n-coldreach-interior`, `n-coldreach-shore`, `n-driftholt`, `n-galereach`, `n-keelbreak`, `n-peatrun-coast`, `n-reedstrand`, `n-rimewall-cap`, `n-slateflow-coast`, `n-stonemoor`, `n-stonemoor-interior`, `n-stonemoor-shore`, `n-tarnmark`). Scaling a `lore` convention to 160 regions is how a region disappears from the world without anyone noticing (spec R3). This task promotes it to a schema-validated field and makes `checkSpineComplete` survive the redraw — **while changing zero committed bytes**, because the reader keeps the `lore.reported` fallback until the redraw replaces the nodes wholesale.

**Files:**
- Create: `scripts/lib/survey.mjs`
- Create: `scripts/tests/survey.test.mjs`
- Create: `scripts/tests/fixtures/spine/e-water-childless/` (overlay: one childless ocean + one childless sea)
- Create: `scripts/tests/fixtures/spine/e-continent-fabric/` (overlay: one childless continent + a fabric file)
- Modify: `scripts/lib/spine.mjs:890-909` (`TRUNK_TIERS`, new `WATER_TIERS`, `checkSpineComplete` signature), `scripts/lib/spine.mjs:40` (`DEPTH_EXCEPTIONS`)
- Modify: `scripts/check_content.mjs:1773-1777` (pass `fabricRegionCounts`)
- Modify: `content/schemas/spine-node.schema.json:8-66` (add `survey` to the root `properties` block, beside `lore` at `:63`)
- Modify: `scripts/tests/spine-gates.test.mjs:180-200` (the `realSpineCopy()` cases — the four removed warnings)
- Test: `scripts/tests/survey.test.mjs`

**Interfaces:**
- Consumes: Plan B's `content/schemas/spine-node.schema.json` with root `additionalProperties: false` (so an unlisted `survey` key would be a schema failure — this task is what makes it legal); Plan C's `provenance.generator.fabric` pin and `content/world/fabric/continent-NN.json` shape `{ continent, regions: [{ id, survey, ... }] }`.
- Produces: `surveyOf({node})`, `loadFabricRegionIndex({contentRoot})`, `fabricRegionCountsFor({nodes, index})`, `WATER_TIERS`, `checkSpineComplete({tree, fabricRegionCounts})`.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/survey.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { surveyOf, loadFabricRegionIndex, fabricRegionCountsFor } from "../lib/survey.mjs";
import { checkSpineComplete, TRUNK_TIERS, WATER_TIERS, DEPTH_EXCEPTIONS } from "../lib/spine.mjs";

// A minimal tree double: checkSpineComplete only reads byId and childrenOf.
function treeOf(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map(nodes.map((n) => [n.id, []]));
  for (const n of nodes) if (n.parentId) childrenOf.get(n.parentId).push(n.id);
  return { byId, childrenOf };
}
const node = (id, tier, extra = {}) =>
  ({ id, tier, parentId: null, lore: {}, provenance: { generator: null }, ...extra });

test("surveyOf prefers the field, falls back to lore.reported, defaults surveyed", () => {
  assert.equal(surveyOf({ node: node("a", "region", { survey: "reported" }) }), "reported");
  assert.equal(surveyOf({ node: node("b", "region", { lore: { reported: true } }) }), "reported");
  assert.equal(surveyOf({ node: node("c", "region") }), "surveyed");
  // The field WINS over a stale lore flag — one source of truth after migration.
  assert.equal(
    surveyOf({ node: node("d", "region", { survey: "surveyed", lore: { reported: true } }) }),
    "surveyed");
});

test("TRUNK_TIERS gains ocean and sea; WATER_TIERS is exactly those two", () => {
  assert.deepEqual([...TRUNK_TIERS].sort(),
    ["continent", "ocean", "playroot", "playspace", "sea", "world"]);
  assert.deepEqual([...WATER_TIERS].sort(), ["ocean", "sea"]);
});

test("DEPTH_EXCEPTIONS gains continent>town for the town-plan host (E-C4)", () => {
  assert.deepEqual([...DEPTH_EXCEPTIONS].sort(), ["continent>town", "playspace>site"]);
});

test("a childless ocean or sea is complete — water has no surveyed interior (E-C2)", () => {
  const tree = treeOf([node("n-w", "world"), node("n-o", "ocean", { parentId: "n-w" }),
                       node("n-s", "sea", { parentId: "n-o" })]);
  const { errors, warns } = checkSpineComplete({ tree });
  assert.deepEqual(errors.filter((e) => /n-o|n-s/.test(e)), []);
  assert.deepEqual(warns.filter((w) => /n-o|n-s/.test(w)), []);
});

test("a childless continent FAILs without a fabric pin and passes with one (E-C3)", () => {
  const bare = treeOf([node("n-w", "world"), node("n-c", "continent", { parentId: "n-w" })]);
  assert.equal(checkSpineComplete({ tree: bare }).errors.filter((e) => /n-c/.test(e)).length, 1);
  const counts = new Map([["n-c", 8]]);
  assert.deepEqual(
    checkSpineComplete({ tree: bare, fabricRegionCounts: counts }).errors.filter((e) => /n-c/.test(e)),
    []);
});

test("a childless REPORTED trunk node is a warning, not a failure", () => {
  const tree = treeOf([node("n-w", "world"),
                       node("n-c", "continent", { parentId: "n-w", survey: "reported" })]);
  const { errors, warns } = checkSpineComplete({ tree });
  assert.deepEqual(errors.filter((e) => /n-c/.test(e)), []);
  assert.equal(warns.filter((w) => /n-c/.test(w)).length, 1);
  assert.match(warns.find((w) => /n-c/.test(w)), /reported, not surveyed/);
});

test("loadFabricRegionIndex counts regions per fabric file and reads their survey", () => {
  const root = mkdtempSync(join(tmpdir(), "fab-"));
  mkdirSync(join(root, "world/fabric"), { recursive: true });
  writeFileSync(join(root, "world/fabric/continent-02.json"), JSON.stringify({
    continent: "c02",
    regions: [{ id: "c02/r01", survey: "surveyed" }, { id: "c02/r02", survey: "reported" }],
  }));
  const idx = loadFabricRegionIndex({ contentRoot: root });
  assert.deepEqual(idx.problems, []);
  assert.equal(idx.byRegionId.get("c02/r01").survey, "surveyed");
  assert.equal(idx.countByFabricPath.get("content/world/fabric/continent-02.json"), 2);

  // n-cluster1, not n-wealdmarch: the c02 continent node keeps its live id
  // (Plan C manifest.landmasses[].nodeId, pinned by Plan C Task 10's
  // "every continent node id comes from manifest.landmasses[].nodeId").
  const counts = fabricRegionCountsFor({
    nodes: [{ id: "n-cluster1",
              provenance: { generator: { fabric: "content/world/fabric/continent-02.json" } } }],
    index: idx });
  assert.equal(counts.get("n-cluster1"), 2);
});

test("loadFabricRegionIndex soft-skips a content root with no fabric dir", () => {
  const root = mkdtempSync(join(tmpdir(), "fab-none-"));
  const idx = loadFabricRegionIndex({ contentRoot: root });
  assert.deepEqual(idx.problems, []);
  assert.equal(idx.byRegionId.size, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test 'scripts/tests/survey.test.mjs'`

Expected: FAIL with `Cannot find module '.../scripts/lib/survey.mjs'`.

- [ ] **Step 3: Write `scripts/lib/survey.mjs`**

```js
// F-0xx / plan E — the one place "surveyed" vs "reported" is decided.
//
// Before this file the distinction lived in free-form `lore.reported === true`
// on 15 nodes. Scaling a lore convention to 160 regions is exactly how a
// region ceases to exist with every gate green (spec R3). `survey` is now a
// schema-validated field; the lore fallback survives ONLY until the redraw
// replaces every node wholesale, which is why this commit changes zero
// committed bytes.
//
// Never throws — problems are returned, matching the gate contract.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/** @typedef {"surveyed"|"reported"} Survey */

/** @returns {Survey} */
export function surveyOf({ node }) {
  if (node?.survey === "reported" || node?.survey === "surveyed") return node.survey;
  return node?.lore?.reported === true ? "reported" : "surveyed";
}

/**
 * Index every fabric region by id, and count regions per fabric FILE PATH
 * (repo-relative), which is what a trunk node's provenance.generator.fabric
 * points at.
 */
export function loadFabricRegionIndex({ contentRoot }) {
  const byRegionId = new Map();
  const countByFabricPath = new Map();
  const problems = [];
  const dir = join(contentRoot, "world/fabric");
  if (!existsSync(dir)) return { byRegionId, countByFabricPath, problems }; // soft-skip
  for (const file of readdirSync(dir).filter((f) => /^continent-\d+\.json$/.test(f)).sort()) {
    const rel = `content/world/fabric/${file}`;
    let doc;
    try { doc = JSON.parse(readFileSync(join(dir, file), "utf8")); }
    catch (e) { problems.push(`fabric: ${rel} is unreadable: ${e.message}`); continue; }
    if (!Array.isArray(doc?.regions)) {
      problems.push(`fabric: ${rel} is shape-invalid — expected { regions: [...] }`);
      continue;
    }
    countByFabricPath.set(rel, doc.regions.length);
    for (const r of doc.regions) {
      if (byRegionId.has(r.id)) problems.push(`fabric: region "${r.id}" is declared twice`);
      byRegionId.set(r.id, { continent: doc.continent, survey: r.survey, areaKm2: r.areaKm2 });
    }
  }
  return { byRegionId, countByFabricPath, problems };
}

/** node id -> number of fabric regions it owns, via provenance.generator.fabric. */
export function fabricRegionCountsFor({ nodes, index }) {
  const counts = new Map();
  for (const n of nodes ?? []) {
    const rel = n?.provenance?.generator?.fabric;
    if (!rel) continue;
    counts.set(n.id, index.countByFabricPath.get(rel) ?? 0);
  }
  return counts;
}
```

- [ ] **Step 4: Extend `scripts/lib/spine.mjs`**

Replace `scripts/lib/spine.mjs:40`:

```js
export const DEPTH_EXCEPTIONS = new Set(["playspace>site"]);
```

with:

```js
// Plan E (E-C4): the second and last exception. Post-redraw the region tier
// leaves the chart, but content/towns/town-millcross.json joins by
// spineId: "n-millcross" and the town-plan gate needs the node. Hanging the
// one town-plan host directly off its continent is what closes the 36-node
// census; a third exception means the depth invariant has stopped meaning
// anything and should be re-derived instead.
export const DEPTH_EXCEPTIONS = new Set(["playspace>site", "continent>town"]);
```

Then replace `scripts/lib/spine.mjs:890-909` (`TRUNK_TIERS` through the end of `checkSpineComplete`) with:

```js
export const TRUNK_TIERS = new Set(["world", "playroot", "continent", "ocean", "sea", "playspace"]);
// Plan E (E-C2): water has no surveyed interior. Regions tile CONTINENTS; an
// ocean or sea is complete when childless, and adding them to TRUNK_TIERS
// without this skip turns today's four harmless warnings into a hard FAIL on
// n-westsea, which carries no lore.reported.
export const WATER_TIERS = new Set(["ocean", "sea"]);

/**
 * G-SPINE-COMPLETE. `fabricRegionCounts` (Plan E, E-C3) maps a trunk node id
 * to the number of regions its fabric file declares: after the redraw the 160
 * regions are fabric rows, not nodes, so all 13 continents are childless and
 * would take 13 hard FAILs. A continent with >= 1 fabric region is complete.
 */
export function checkSpineComplete({ tree, fabricRegionCounts = new Map() }) {
  const errors = [];
  const warns = [];
  for (const [id, node] of tree.byId) {
    if (LEAF_TIERS.has(node.tier)) continue;
    if ((tree.childrenOf.get(id) ?? []).length > 0) continue;
    if (WATER_TIERS.has(node.tier)) continue;
    if ((fabricRegionCounts.get(id) ?? 0) > 0) continue;
    if (TRUNK_TIERS.has(node.tier)) {
      // A reported node (mariners' chart entry) is deliberately childless —
      // unsurveyed, by spec — so it steps down to a WARN. F-043 read this off
      // lore.reported; surveyOf() keeps that fallback until the redraw.
      if (surveyOf({ node }) === "reported")
        warns.push(`G-SPINE-COMPLETE: "${id}" (tier ${node.tier}) is childless — reported, not surveyed; childless by design (F-043)`);
      else
        errors.push(`G-SPINE-COMPLETE: "${id}" (tier ${node.tier}) has no children — a ${node.tier} may not be empty under --require-complete`);
    } else
      warns.push(`G-SPINE-COMPLETE: "${id}" (tier ${node.tier}) has no children yet (region/sea tiling is out of scope in 1.8 — reported, not failed)`);
  }
  return { errors, warns };
}
```

Add the import at the top of `scripts/lib/spine.mjs`, beside the existing `import { LEGACY_UNPAIRED } from "./spawn-pairing.mjs";` (survey.mjs imports nothing from spine.mjs, so this cannot cycle):

```js
import { surveyOf } from "./survey.mjs";
export { surveyOf };
```

- [ ] **Step 5: Pass `fabricRegionCounts` from the gate**

In `scripts/check_content.mjs`, add to the `./lib/spine.mjs` import list: `WATER_TIERS`. Add a new import line:

```js
import { loadFabricRegionIndex, fabricRegionCountsFor } from "./lib/survey.mjs";
```

Replace `scripts/check_content.mjs:1773-1777`:

```js
  // F-041 P4 — G-SPINE-COMPLETE (both trees; escalates only under the flag)
  const complete = checkSpineComplete({ tree });
```

with:

```js
  // F-041 P4 — G-SPINE-COMPLETE (both trees; escalates only under the flag).
  // Plan E (E-C3): after the redraw the regions live in content/world/fabric/,
  // so a continent's completeness is proved by its fabric pin, not by spine
  // children. An absent fabric dir yields an empty map and today's behaviour.
  const fabricIndex = loadFabricRegionIndex({ contentRoot: opts.contentRoot });
  for (const p of fabricIndex.problems) fail(p);
  const complete = checkSpineComplete({
    tree,
    fabricRegionCounts: fabricRegionCountsFor({ nodes: validNodes, index: fabricIndex }),
  });
```

- [ ] **Step 6: Add `survey` to the node schema**

In `content/schemas/spine-node.schema.json`, inside `properties`, immediately after the `"terrainKind"` line, insert:

```json
    "survey": { "enum": ["surveyed", "reported"] },
```

(Plan B flipped this schema's root to `additionalProperties: false`; without this line a `survey` key on any node is a schema failure.)

- [ ] **Step 7: Run the tests**

Run:
```bash
node --test 'scripts/tests/survey.test.mjs'
node scripts/check_content.mjs --require-complete
```
Expected: `survey.test.mjs` PASS. `check_content --require-complete` PASS, and its warning list is **four shorter** — `n-westsea`, `n-galereach`, `n-keelbreak`, `n-tarnmark` no longer warn.

- [ ] **Step 8: Repair the tests that asserted on those four warnings**

Run: `grep -n "G-SPINE-COMPLETE" scripts/tests/*.test.mjs`

For every assertion that counts warnings or matches on `n-westsea` / `n-galereach` / `n-keelbreak` / `n-tarnmark` being childless, update the expectation to the new list and add a one-line comment naming E-C2. Do **not** relax an assertion to a `>=` — the exact count is the evidence.

Then add two fixture-backed cases to `scripts/tests/spine-gates.test.mjs`, reusing the existing helpers `spineFixture({ overlayDir })` (`:212`) and `runSpineGate(dir)` (`:222`) — fixtures live under `scripts/tests/fixtures/spine/`:

```js
test("G-SPINE-COMPLETE: a childless ocean and sea are complete (plan E, E-C2)", () => {
  const dir = spineFixture({ overlayDir: "e-water-childless" });
  const out = runSpineGate(dir);
  assert.doesNotMatch(out, /G-SPINE-COMPLETE: "n-e-ocean"/);
  assert.doesNotMatch(out, /G-SPINE-COMPLETE: "n-e-sea"/);
});

test("G-SPINE-COMPLETE: a childless continent needs a fabric pin (plan E, E-C3)", () => {
  const dir = spineFixture({ overlayDir: "e-continent-fabric" });
  const out = runSpineGate(dir);
  assert.doesNotMatch(out, /G-SPINE-COMPLETE: "n-e-cont-pinned"/);
  assert.match(out,
    /G-SPINE-COMPLETE: "n-e-cont-bare" \(tier continent\) has no children/);
});
```

Build the two overlay directories: `scripts/tests/fixtures/spine/e-water-childless/nodes/` holds `n-e-ocean.json` (tier `ocean`, parent the fixture world) and `n-e-sea.json` (tier `sea`, parent `n-e-ocean`); `scripts/tests/fixtures/spine/e-continent-fabric/` holds `nodes/n-e-cont-pinned.json` (with `provenance.generator.fabric` = `content/world/fabric/continent-99.json`), `nodes/n-e-cont-bare.json` (no fabric pin), and `world/fabric/continent-99.json` = `{"continent":"c99","regions":[{"id":"c99/r01","survey":"surveyed"}]}`. Copy the placement/composition shape from an existing fixture node so every unrelated gate stays green.

- [ ] **Step 9: Prove zero committed bytes moved**

Run:
```bash
node scripts/check_spine_emit.mjs --check
node scripts/check_render_lock.mjs --check
git status --porcelain content/spine/nodes content/spine/derived.json game-client/assets/art/maps
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: both `--check`s PASS, `git status` on those paths prints **nothing**, jest PASS. This is the migration invariant: scaffolding changes no drawn pixel. If `derived.json` moved, you edited a node file — revert it.

- [ ] **Step 10: Commit**

```bash
git add scripts/lib/survey.mjs scripts/lib/spine.mjs scripts/check_content.mjs \
        content/schemas/spine-node.schema.json scripts/tests/
git commit -m "feat: survey field, water-tier and fabric-aware completeness"
```

- [ ] **Step 11: Quality gate — verify**

Run: `./scripts/precheck.sh --no-install && npm test --prefix scripts` and paste the output. Expected: every section PASS; `npm test --prefix scripts` under 60 s (Plan A's overlap fix budgets 45 s; treat above 60 s as a gate failure of its own).

- [ ] **Step 12: Quality gate — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`, brief: *"(a) Does the `WATER_TIERS` skip hide a real empty-world failure the gate exists for? (b) Can `loadFabricRegionIndex` throw on a malformed fabric file — an uncaught throw skips `finish()` and drops every FAIL before it. (c) Does `surveyOf` disagree with `lore.reported` on any of the 15 committed nodes? Run `node -e` over `content/spine/nodes/` and prove it. (d) Is `continent>town` reachable today, and would it silently legalise a mis-parented town before the redraw?"*

- [ ] **Step 13: Quality gate — refactor, re-verify, report**

Apply findings, then run: `./scripts/precheck.sh --no-install && node --test 'scripts/tests/survey.test.mjs' && git branch --show-current && git log --oneline -1`

---

### Task 3: The canon-leg pre-flight, and `G-CANON-LEG` on pins instead of freezes

`content/spine/edges.json` carries **7 `leg` edges** pinning canon walking distances, enforced at ±8% with both endpoints required frozen (`check_content.mjs:2027-2038`). Measured values today:

| Edge id | From | To | `straightKm` |
|---|---|---|---:|
| `e-leg-embervale-norhollow` | `n-embervale` | `n-norhollow` | 7.1 |
| `e-leg-millcross-rooktide` | `n-millcross` | `n-rooktide` | 10.9 |
| `e-leg-millcross-embervale` | `n-millcross` | `n-embervale` | 9.7 |
| `e-leg-embervale-gildmark` | `n-embervale` | `n-gildmark` | 14.1 |
| `e-leg-millcross-gildmark` | `n-millcross` | `n-gildmark` | 17 |
| `e-leg-norhollow-gildmark` | `n-norhollow` | `n-gildmark` | 18.6 |
| `e-leg-cindervast-rooktide` | `n-cindervast-town` | `n-rooktide` | 34 |

A free redraw breaks most of them at once (R9: seven simultaneous errors that look like a gate bug). Two things fix it, and both must land **before** the unfreeze in Task 5:

1. **A pre-flight** that resolves the 7 legs against Plan D's *pinned coordinates* and reports the residual, so the ~40 hand-placed pins can be iterated to a solution before a single continent exists.
2. **The endpoint rule changes from "frozen" to "frozen OR pinned"** (E-C7). Six of the seven endpoint town nodes cease to exist after the redraw; the legs re-point at trunk **point features**, which `gSpineNet`'s `rootPoint` already resolves, and their fixity comes from the pinned civil record's `pin.toleranceKm`, not from `frozen: true`.

**Files:**
- Create: `scripts/check_canon_legs.mjs`
- Create: `content/spine/canon-legs.json`
- Create: `scripts/tests/canon-legs.test.mjs`
- Modify: `scripts/check_content.mjs:2027-2038` (the `e.kind === "leg"` block inside `gSpineNet`)
- Modify: `scripts/integration.sh:90-112,114-127` (add a `canon_legs` section function beside `spine_emit_drift` at `:90`, and its `run_section` line in the Execute block at `:114-127`)
- Modify: `.github/workflows/ci.yml:102-103` (add the pre-flight step beside the story-graph drift-gate step)
- Test: `scripts/tests/canon-legs.test.mjs`

**Interfaces:**
- Consumes: Plan D's `content/world/civil/pinned/*.json`, each with `{ id, pin: { at: [x, y], toleranceKm, why } }`.
- Produces: `content/spine/canon-legs.json` — the **only** place a canon-leg endpoint may be named; `node scripts/check_canon_legs.mjs` (exit 1 on any leg outside ±8%).

- [ ] **Step 1: Write `content/spine/canon-legs.json`**

```json
{
  "version": 1,
  "toleranceFraction": 0.08,
  "why": "spec §9.4 / R9. The seven canon walking distances are constraints ON the generator, not outputs of it. Each endpoint names the Tier-1 pinned civil record that fixes it (spec §5.2) and the trunk point feature the edge resolves through after the redraw. Both must be present: the pinned record is the constraint, the feature is the geometry the gate measures.",
  "legs": {
    "e-leg-embervale-norhollow": {
      "from": { "pinned": "c-town-embervale", "feature": "f-town-embervale" },
      "to":   { "pinned": "c-town-norhollow", "feature": "f-town-norhollow" }
    },
    "e-leg-millcross-rooktide": {
      "from": { "pinned": "c-town-millcross", "feature": "f-town-millcross" },
      "to":   { "pinned": "c-town-rooktide",  "feature": "f-town-rooktide" }
    },
    "e-leg-millcross-embervale": {
      "from": { "pinned": "c-town-millcross", "feature": "f-town-millcross" },
      "to":   { "pinned": "c-town-embervale", "feature": "f-town-embervale" }
    },
    "e-leg-embervale-gildmark": {
      "from": { "pinned": "c-town-embervale", "feature": "f-town-embervale" },
      "to":   { "pinned": "c-town-gildmark",  "feature": "f-town-gildmark" }
    },
    "e-leg-millcross-gildmark": {
      "from": { "pinned": "c-town-millcross", "feature": "f-town-millcross" },
      "to":   { "pinned": "c-town-gildmark",  "feature": "f-town-gildmark" }
    },
    "e-leg-norhollow-gildmark": {
      "from": { "pinned": "c-town-norhollow", "feature": "f-town-norhollow" },
      "to":   { "pinned": "c-town-gildmark",  "feature": "f-town-gildmark" }
    },
    "e-leg-cindervast-rooktide": {
      "from": { "pinned": "c-town-cindervast", "feature": "f-town-cindervast" },
      "to":   { "pinned": "c-town-rooktide",   "feature": "f-town-rooktide" }
    }
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `scripts/tests/canon-legs.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCanonLegs } from "../check_canon_legs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = join(ROOT, "scripts/check_canon_legs.mjs");

const LEGS = {
  version: 1, toleranceFraction: 0.08, why: "test",
  legs: {
    "e-leg-a-b": { from: { pinned: "c-a", feature: "f-a" },
                   to:   { pinned: "c-b", feature: "f-b" } },
  },
};
// 3-4-5 triangle: [0,0] -> [3,4] is exactly 5 km.
const EDGES = [{ id: "e-leg-a-b", kind: "leg", from: { feature: "f-a" },
                 to: { feature: "f-b" }, attrs: { straightKm: 5 } }];

function root({ legs = LEGS, edges = EDGES, pins }) {
  const dir = mkdtempSync(join(tmpdir(), "legs-"));
  mkdirSync(join(dir, "spine"), { recursive: true });
  mkdirSync(join(dir, "world/civil/pinned"), { recursive: true });
  writeFileSync(join(dir, "spine/canon-legs.json"), JSON.stringify(legs));
  writeFileSync(join(dir, "spine/edges.json"), JSON.stringify(edges));
  for (const [id, at] of Object.entries(pins))
    writeFileSync(join(dir, `world/civil/pinned/${id}.json`),
      JSON.stringify({ id, pin: { at, toleranceKm: 1.5, why: "test" } }));
  return dir;
}

test("a leg inside +/-8% passes and reports its residual", () => {
  const dir = root({ pins: { "c-a": [0, 0], "c-b": [3, 4] } });
  const r = checkCanonLegs({ contentRoot: dir });
  assert.deepEqual(r.problems, []);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].resolvedKm, 5);
  assert.equal(r.rows[0].deltaPct, 0);
  assert.equal(r.rows[0].verdict, "OK");
});

test("a leg outside +/-8% fails and names the remedy", () => {
  // [0,0] -> [3,5] = 5.83 km against straightKm 5 => +16.6%
  const dir = root({ pins: { "c-a": [0, 0], "c-b": [3, 5] } });
  const r = checkCanonLegs({ contentRoot: dir });
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0],
    /^G-CANON-LEG-PREFLIGHT: e-leg-a-b: pinned c-a → c-b is 5\.8 km vs straightKm 5 \(\+16\.6%\) — breaks ±8%; move the pin, do not rewrite canon$/);
});

test("a missing pinned record is diagnosable, never a crash", () => {
  const dir = root({ pins: { "c-a": [0, 0] } });
  const r = checkCanonLegs({ contentRoot: dir });
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0],
    /^G-CANON-LEG-PREFLIGHT: e-leg-a-b: pinned record "c-b" does not resolve/);
});

test("every leg edge in edges.json is covered by canon-legs.json", () => {
  const dir = root({ edges: [...EDGES, { id: "e-leg-x-y", kind: "leg",
    from: { feature: "f-x" }, to: { feature: "f-y" }, attrs: { straightKm: 9 } }],
    pins: { "c-a": [0, 0], "c-b": [3, 4] } });
  const r = checkCanonLegs({ contentRoot: dir });
  assert.ok(r.problems.some((p) =>
    /^G-CANON-LEG-PREFLIGHT: e-leg-x-y: no entry in content\/spine\/canon-legs\.json/.test(p)));
});

test("the CLI soft-skips a content root with no pinned layer and exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "legs-empty-"));
  mkdirSync(join(dir, "spine"), { recursive: true });
  writeFileSync(join(dir, "spine/canon-legs.json"), JSON.stringify(LEGS));
  writeFileSync(join(dir, "spine/edges.json"), JSON.stringify(EDGES));
  const out = execFileSync("node", [CLI, "--content-root", dir], { encoding: "utf8" });
  assert.match(out, /canon-legs: no pinned layer yet — skipped/);
});

test("the live repo's seven legs are all covered", () => {
  const legs = JSON.parse(readFileSync(join(ROOT, "content/spine/canon-legs.json"), "utf8"));
  const edges = JSON.parse(readFileSync(join(ROOT, "content/spine/edges.json"), "utf8"));
  const ids = edges.filter((e) => e.kind === "leg").map((e) => e.id).sort();
  assert.equal(ids.length, 7);
  assert.deepEqual(Object.keys(legs.legs).sort(), ids);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test 'scripts/tests/canon-legs.test.mjs'`

Expected: FAIL with `Cannot find module '.../scripts/check_canon_legs.mjs'`.

- [ ] **Step 4: Write `scripts/check_canon_legs.mjs`**

```js
#!/usr/bin/env node
// Canon-leg pre-flight (spec §9.4, R9).
//
// The seven `leg` edges pin canon walking distances at +/-8%. A free redraw
// breaks most of them AT ONCE, surfacing as seven simultaneous errors that
// look like a gate bug. This runs BEFORE the generator: it measures the seven
// distances against the ~40 HAND-PLACED pinned coordinates (spec D4:
// hand-place, solver-check) so the pins can be iterated to a solution while
// moving a pin is still free.
//
// Deliberately NOT a solver. The relation layer verifies; it does not
// optimise (D4). The remedy in every message is "move the pin", because the
// alternative — rewriting the seven distances in canon — touches
// docs/worldbuilding/A1-cosmology.md and content/story/canon.md and reopens
// the citation-rot surface for a sixth time.
//
// Usage: node scripts/check_canon_legs.mjs [--content-root <dir>]
// Exit 1 if any leg is outside the tolerance or any endpoint fails to resolve.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

function readJson(path, problems) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { problems.push(`canon-legs: ${path} is unreadable: ${e.message}`); return null; }
}

/** Every pinned civil record keyed by id, with its [x, y]. */
function loadPins({ contentRoot, problems }) {
  const dir = join(contentRoot, "world/civil/pinned");
  const pins = new Map();
  if (!existsSync(dir)) return { pins, present: false };
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const doc = readJson(join(dir, f), problems);
    if (!doc) continue;
    if (!Array.isArray(doc.pin?.at) || doc.pin.at.length !== 2) {
      problems.push(`canon-legs: pinned record "${doc.id ?? f}" has no pin.at [x, y]`);
      continue;
    }
    pins.set(doc.id, { at: doc.pin.at, toleranceKm: doc.pin.toleranceKm });
  }
  return { pins, present: true };
}

// Math.hypot is BANNED on this path (Global Constraints, determinism):
// sqrt(dx*dx + dy*dy) is correctly-rounded IEEE-754 on every conforming engine.
const dist = (a, b) => {
  const dx = a[0] - b[0], dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
};
const round1 = (v) => Math.round(v * 10) / 10;

export function checkCanonLegs({ contentRoot }) {
  const problems = [];
  const rows = [];
  const legsDoc = readJson(join(contentRoot, "spine/canon-legs.json"), problems);
  const edges = readJson(join(contentRoot, "spine/edges.json"), problems);
  if (!legsDoc || !edges) return { rows, problems, skipped: false };

  const { pins, present } = loadPins({ contentRoot, problems });
  if (!present) return { rows, problems, skipped: true };

  const tol = legsDoc.toleranceFraction;
  const legEdges = edges.filter((e) => e.kind === "leg");
  for (const e of legEdges) {
    const entry = legsDoc.legs[e.id];
    if (!entry) {
      problems.push(`G-CANON-LEG-PREFLIGHT: ${e.id}: no entry in content/spine/canon-legs.json — every leg endpoint must be named exactly once, and only there`);
      continue;
    }
    const a = pins.get(entry.from.pinned), b = pins.get(entry.to.pinned);
    for (const [side, id, got] of [["from", entry.from.pinned, a], ["to", entry.to.pinned, b]])
      if (!got)
        problems.push(`G-CANON-LEG-PREFLIGHT: ${e.id}: pinned record "${id}" does not resolve in content/world/civil/pinned/ (${side} endpoint)`);
    if (!a || !b) continue;

    const resolvedKm = round1(dist(a.at, b.at));
    const declared = e.attrs.straightKm;
    const deltaPct = Math.round(((resolvedKm - declared) / declared) * 1000) / 10;
    const ok = Math.abs(resolvedKm - declared) / declared <= tol;
    rows.push({ id: e.id, from: entry.from.pinned, to: entry.to.pinned,
                declaredKm: declared, resolvedKm, deltaPct, verdict: ok ? "OK" : "BREAK" });
    if (!ok)
      problems.push(`G-CANON-LEG-PREFLIGHT: ${e.id}: pinned ${entry.from.pinned} → ${entry.to.pinned} is ${resolvedKm} km vs straightKm ${declared} (${deltaPct > 0 ? "+" : ""}${deltaPct}%) — breaks ±${Math.round(tol * 100)}%; move the pin, do not rewrite canon`);
  }
  // Coverage the other way: an entry naming an edge that no longer exists.
  const byId = new Set(legEdges.map((e) => e.id));
  for (const id of Object.keys(legsDoc.legs))
    if (!byId.has(id))
      problems.push(`G-CANON-LEG-PREFLIGHT: canon-legs.json names "${id}", which is not a leg edge in content/spine/edges.json`);
  return { rows, problems, skipped: false };
}

function main() {
  const argv = process.argv.slice(2);
  let contentRoot = join(REPO_ROOT, "content");
  for (let i = 0; i < argv.length; i++)
    if (argv[i] === "--content-root") contentRoot = resolve(argv[++i]);
  const { rows, problems, skipped } = checkCanonLegs({ contentRoot });
  console.log("canon-legs · pre-flight");
  if (skipped) {
    console.log("  canon-legs: no pinned layer yet — skipped (content/world/civil/pinned/ absent)");
    process.exit(0);
  }
  // ALWAYS print the table, pass or fail — the always-exit-0-report discipline
  // scripts/report_season1.mjs established: drift must be visible before it is
  // a failure.
  console.log("  edge                          from            to              declared  resolved   delta  verdict");
  for (const r of rows)
    console.log(`  ${r.id.padEnd(28)}  ${r.from.padEnd(14)}  ${r.to.padEnd(14)}  ${String(r.declaredKm).padStart(8)}  ${String(r.resolvedKm).padStart(8)}  ${String(r.deltaPct).padStart(6)}  ${r.verdict}`);
  if (problems.length) {
    console.error("\n  PROBLEMS:");
    for (const p of problems) console.error(`    ${p}`);
    process.exit(1);
  }
  console.log(`\n  ${rows.length} legs, all inside ±8%`);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 5: Change `G-CANON-LEG`'s endpoint rule to frozen-OR-pinned**

Replace `scripts/check_content.mjs:2027-2032` — the opening of the `e.kind === "leg"` block:

```js
    if (e.kind === "leg") {
      for (const ref of [e.from, e.to]) {
        const n = ref.node && tree.byId.get(ref.node);
        if (n && !n.frozen) fail(`spine: G-CANON-LEG ${e.id}: endpoint ${n.id} is not frozen`);
      }
```

with:

```js
    if (e.kind === "leg") {
      // Plan E (E-C7). "Both endpoints frozen" was the pre-generator fixity
      // proof. After the redraw six of the seven endpoint TOWN NODES cease to
      // exist — settlements become civil records plus trunk point features —
      // so fixity comes from the Tier-1 pin instead. content/spine/canon-legs.json
      // is the ONLY place a leg endpoint may be named: two naming paths means
      // two ways for a leg to move.
      const legEntry = canonLegs?.legs?.[e.id];
      if (!legEntry)
        fail(`spine: G-CANON-LEG ${e.id}: no entry in content/spine/canon-legs.json`);
      for (const [side, ref] of [["from", e.from], ["to", e.to]]) {
        const n = ref.node && tree.byId.get(ref.node);
        const pinnedId = legEntry?.[side]?.pinned;
        const pinned = pinnedId != null && pinnedIds.has(pinnedId);
        if (n && !n.frozen && !pinned)
          fail(`spine: G-CANON-LEG ${e.id}: endpoint ${n.id} is neither frozen nor pinned (canon-legs.json ${side} -> ${pinnedId ?? "none"})`);
        if (!n && !pinned)
          fail(`spine: G-CANON-LEG ${e.id}: ${side} endpoint resolves to no frozen node and no pinned record`);
      }
```

`gSpineNet`'s signature gains the two new inputs. Change its declaration at `scripts/check_content.mjs:1984`:

```js
function gSpineNet({ nodes, edges, tree, fail }) {
```
to
```js
function gSpineNet({ nodes, edges, tree, canonLegs, pinnedIds, fail }) {
```
and at its call site inside `checkSpine` (search for `gSpineNet({ nodes:`), pass them:
```js
  const canonLegsPath = join(opts.contentRoot, "spine/canon-legs.json");
  const canonLegs = existsSync(canonLegsPath)
    ? readJson(canonLegsPath, "canon-legs", fail) : null;
  const pinnedDir = join(opts.contentRoot, "world/civil/pinned");
  const pinnedIds = new Set(existsSync(pinnedDir)
    ? readdirSync(pinnedDir).filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(readFileSync(join(pinnedDir, f), "utf8")).id)
    : []);
  gSpineNet({ nodes: validNodes, edges: spine.edges, tree, canonLegs, pinnedIds, fail });
```

**Soft-skip discipline:** with neither `canon-legs.json` nor a pinned dir present (every minimal fixture root), `canonLegs` is `null` and `pinnedIds` is empty — so a leg edge in a fixture would now fail on "no entry". Guard the whole new block:

```js
      if (canonLegs === null) {
        // No canon-legs.json in this content root (minimal fixture): fall back
        // to the pre-plan-E rule so ~45 structural fixtures stay green.
        for (const ref of [e.from, e.to]) {
          const n = ref.node && tree.byId.get(ref.node);
          if (n && !n.frozen) fail(`spine: G-CANON-LEG ${e.id}: endpoint ${n.id} is not frozen`);
        }
      } else { /* the frozen-OR-pinned block above */ }
```

- [ ] **Step 6: Run the tests**

Run:
```bash
node --test 'scripts/tests/canon-legs.test.mjs'
node scripts/check_canon_legs.mjs
node scripts/check_content.mjs --require-complete
npm test --prefix scripts
```
Expected: `canon-legs.test.mjs` PASS. `check_canon_legs.mjs` prints `canon-legs: no pinned layer yet — skipped` and exits 0 **if Plan D has not landed yet**; once it has, it prints the seven-row table. `check_content --require-complete` PASS with no new failures (all six endpoints are still frozen today, so the OR is not yet load-bearing).

- [ ] **Step 7: Iterate the pins until all seven legs pass**

If Plan D has landed and any row reads `BREAK`, edit the offending record's `pin.at` in `content/world/civil/pinned/*.json` and re-run `node scripts/check_canon_legs.mjs`. Rules:
- Move the **pin**, never `straightKm`. Rewriting a canon distance touches `canon.md` and `A1-cosmology.md` and reopens citation rot.
- Six points and seven distances is over-determined by one; expect to move two or three pins, not one. Start with the pin appearing in the most `BREAK` rows.
- Every move must keep the record's `pin.why` honest. If a move contradicts the `why`, the constraint block is wrong, not the coordinate.

- [ ] **Step 8: Wire into Gate 2 and CI**

In `scripts/integration.sh`, after the `spine_emit_drift()` definition, add:
```bash
# Plan E / spec §9.4: the seven canon walking distances measured against the
# hand-placed Tier-1 pins, BEFORE the generator. Soft-skips until the pinned
# layer exists.
canon_legs() { node "$REPO_ROOT/scripts/check_canon_legs.mjs"; }
```
and in the `--- Execute ---` block, immediately after the `content: story-graph drift` line:
```bash
run_section "content: canon-leg pre-flight"  canon_legs
```
In `.github/workflows/ci.yml`, add a step beside the existing content-gate step:
```yaml
      - name: canon-leg pre-flight
        run: node scripts/check_canon_legs.mjs
```

- [ ] **Step 9: Commit**

```bash
git add scripts/check_canon_legs.mjs content/spine/canon-legs.json scripts/tests/canon-legs.test.mjs \
        scripts/check_content.mjs scripts/integration.sh .github/workflows/ci.yml \
        content/world/civil/pinned
git commit -m "feat: canon-leg pre-flight, G-CANON-LEG on pins not freezes"
```

- [ ] **Step 10: Quality gate — verify**

Run: `./scripts/precheck.sh --no-install && ./scripts/integration.sh --no-install` and paste the output. Expected: every section PASS.

- [ ] **Step 11: Quality gate — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`, brief: *"(a) The soft-skip fallback branch — can a real content root take it by accident and silently restore the weaker rule? (b) Does the frozen-OR-pinned rule let a leg endpoint drift with every gate green? Name the exact scenario. (c) `checkCanonLegs` reads JSON from disk — can it throw and skip `finish()`? (d) Is the residual rounding (`round1`, then a percentage from the ROUNDED value) capable of passing a leg that is really outside ±8%? Show the arithmetic."*

- [ ] **Step 12: Quality gate — refactor, re-verify, report**

Apply findings, then: `./scripts/integration.sh --no-install && git branch --show-current && git log --oneline -1`

---

### Task 4: `content/spine/world-digest.json` and `G-WORLD-DIGEST`

§9.3 asks what replaces the freeze once coordinates are generated. Three layers: `derived.digest` (already on every node, already guarded), a **shrunken freeze** (Task 7), and this — a sha256 over the concatenated canonical bytes of fabric + resolved + trunk. A deliberate regeneration updates one line; an accidental one reddens the gate. Building it on today's world, before the redraw, is what makes it trustworthy when the world changes.

**Files:**
- Create: `scripts/lib/world-digest.mjs`, `scripts/check_world_digest.mjs`, `content/spine/world-digest.json`
- Create: `scripts/tests/world-digest.test.mjs`
- Modify: `scripts/integration.sh:90-112,114-127`, `.github/workflows/ci.yml:102-103`
- Test: `scripts/tests/world-digest.test.mjs`

**Interfaces:**
- Consumes: nothing mandatory. `content/world/fabric/` and `content/world/resolved/` are recorded as `"absent"` until Plans C and D land — which is the point: their arrival is itself a one-line digest change.
- Produces: `computeWorldDigest({repoRoot, inputs})`, `checkWorldDigest({committed, computed})`, `node scripts/check_world_digest.mjs --check|--write`.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/world-digest.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeWorldDigest, checkWorldDigest, WORLD_DIGEST_INPUTS }
  from "../lib/world-digest.mjs";

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "wdig-"));
  mkdirSync(join(dir, "content/spine/nodes"), { recursive: true });
  writeFileSync(join(dir, "content/spine/nodes/n-a.json"), '{"id":"n-a"}\n');
  return dir;
}

test("the input list is the committed three layers, in this order", () => {
  assert.deepEqual([...WORLD_DIGEST_INPUTS],
    ["content/world/fabric", "content/world/resolved", "content/spine/nodes"]);
});

test("an absent input is recorded as absent, not skipped", () => {
  const dir = scratch();
  const d = computeWorldDigest({ repoRoot: dir });
  assert.equal(d.inputs["content/world/fabric"], "absent");
  assert.equal(d.inputs["content/world/resolved"], "absent");
  assert.match(d.inputs["content/spine/nodes"], /^sha256:[0-9a-f]{64}$/);
  assert.match(d.digest, /^sha256:[0-9a-f]{64}$/);
});

test("the digest is stable across two computations of the same tree", () => {
  const dir = scratch();
  assert.deepEqual(computeWorldDigest({ repoRoot: dir }), computeWorldDigest({ repoRoot: dir }));
});

test("a byte change in one layer moves that layer's digest and the whole", () => {
  const dir = scratch();
  const before = computeWorldDigest({ repoRoot: dir });
  writeFileSync(join(dir, "content/spine/nodes/n-a.json"), '{"id":"n-b"}\n');
  const after = computeWorldDigest({ repoRoot: dir });
  assert.notEqual(before.inputs["content/spine/nodes"], after.inputs["content/spine/nodes"]);
  assert.notEqual(before.digest, after.digest);
  assert.equal(before.inputs["content/world/fabric"], after.inputs["content/world/fabric"]);
});

test("a file APPEARING in a previously absent layer is a digest change", () => {
  const dir = scratch();
  const before = computeWorldDigest({ repoRoot: dir });
  mkdirSync(join(dir, "content/world/fabric"), { recursive: true });
  writeFileSync(join(dir, "content/world/fabric/continent-01.json"), "{}\n");
  const after = computeWorldDigest({ repoRoot: dir });
  assert.equal(before.inputs["content/world/fabric"], "absent");
  assert.match(after.inputs["content/world/fabric"], /^sha256:/);
  assert.notEqual(before.digest, after.digest);
});

test("renaming a file changes the digest — path is hashed, not just bytes", () => {
  const dir = scratch();
  const before = computeWorldDigest({ repoRoot: dir });
  rmSync(join(dir, "content/spine/nodes/n-a.json"));
  writeFileSync(join(dir, "content/spine/nodes/n-z.json"), '{"id":"n-a"}\n');
  assert.notEqual(before.digest, computeWorldDigest({ repoRoot: dir }).digest);
});

test("checkWorldDigest names the layer that moved, not just the whole", () => {
  const a = { version: 1, inputs: { x: "sha256:1", y: "sha256:2" }, digest: "sha256:aa" };
  const b = { version: 1, inputs: { x: "sha256:1", y: "sha256:3" }, digest: "sha256:bb" };
  const out = checkWorldDigest({ committed: a, computed: b });
  assert.equal(out.length, 2);
  assert.match(out[0], /^G-WORLD-DIGEST: input "y" is sha256:3 != committed sha256:2$/);
  assert.match(out[1], /^G-WORLD-DIGEST: world digest sha256:bb != committed sha256:aa/);
});

test("a matching digest yields no problems", () => {
  const a = { version: 1, inputs: { x: "sha256:1" }, digest: "sha256:aa" };
  assert.deepEqual(checkWorldDigest({ committed: a, computed: a }), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test 'scripts/tests/world-digest.test.mjs'`

Expected: FAIL with `Cannot find module '.../scripts/lib/world-digest.mjs'`.

- [ ] **Step 3: Write `scripts/lib/world-digest.mjs`**

```js
// G-WORLD-DIGEST (spec §9.3 layer 2).
//
// The freeze bought one thing: a coordinate change became a loud reviewable
// byte diff. Under generated land, coordinates ARE generated, so pinning
// individual anchors is both wrong and useless. This replaces it at the whole-
// world level: one sha256 over fabric + resolved + trunk. A deliberate
// regeneration updates one line; an accidental one reddens the gate.
//
// Per-input digests, not one opaque number: "the world changed" is useless in
// review, "content/world/resolved changed and nothing else did" is a finding.
//
// An ABSENT input is recorded as "absent", never skipped — otherwise the
// arrival of content/world/fabric/ (Plan C) would be invisible to the digest,
// which is the one moment it most needs to be visible.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const WORLD_DIGEST_INPUTS = Object.freeze([
  "content/world/fabric",
  "content/world/resolved",
  "content/spine/nodes",
]);

function filesUnder(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) filesUnder(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * sha256 over `<relpath>\0<bytes>\0` for every file, in sorted path order.
 * Hashing the PATH is what makes a rename a change; hashing only the bytes
 * would call a rename a no-op.
 */
function digestOf({ repoRoot, dir }) {
  const h = createHash("sha256");
  for (const f of filesUnder(dir)) {
    h.update(relative(repoRoot, f).split("\\").join("/"));
    h.update("\0");
    h.update(readFileSync(f));
    h.update("\0");
  }
  return `sha256:${h.digest("hex")}`;
}

export function computeWorldDigest({ repoRoot, inputs = WORLD_DIGEST_INPUTS }) {
  const perInput = {};
  for (const rel of inputs) {
    const dir = join(repoRoot, rel);
    perInput[rel] = existsSync(dir) ? digestOf({ repoRoot, dir }) : "absent";
  }
  const roll = createHash("sha256");
  for (const rel of inputs) { roll.update(rel); roll.update("\0"); roll.update(perInput[rel]); roll.update("\0"); }
  return { version: 1, inputs: perInput, digest: `sha256:${roll.digest("hex")}` };
}

/** Never throws. Names the moved layer FIRST, then the roll-up. */
export function checkWorldDigest({ committed, computed }) {
  const problems = [];
  const keys = new Set([...Object.keys(committed?.inputs ?? {}), ...Object.keys(computed.inputs)]);
  for (const k of [...keys].sort()) {
    const want = committed?.inputs?.[k], got = computed.inputs[k];
    if (want !== got)
      problems.push(`G-WORLD-DIGEST: input "${k}" is ${got} != committed ${want}`);
  }
  if (committed?.digest !== computed.digest)
    problems.push(`G-WORLD-DIGEST: world digest ${computed.digest} != committed ${committed?.digest} — a deliberate regeneration updates this one line with \`node scripts/check_world_digest.mjs --write\`; an accidental one is this failure`);
  return problems;
}
```

- [ ] **Step 4: Write `scripts/check_world_digest.mjs`**

```js
#!/usr/bin/env node
// G-WORLD-DIGEST CLI. --check compares content/spine/world-digest.json against
// a fresh computation; --write re-baselines it. Exactly the affordance
// check_spine_emit.mjs and check_render_lock.mjs already have.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { computeWorldDigest, checkWorldDigest } from "./lib/world-digest.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = join(REPO_ROOT, "content/spine/world-digest.json");

function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes("--write");
  const computed = computeWorldDigest({ repoRoot: REPO_ROOT });
  if (write) {
    writeFileSync(LOCK, JSON.stringify(computed, null, 2) + "\n", "utf8");
    console.log(`world-digest: wrote ${computed.digest}`);
    for (const [k, v] of Object.entries(computed.inputs)) console.log(`  ${k}  ${v}`);
    process.exit(0);
  }
  if (!existsSync(LOCK)) {
    console.error("G-WORLD-DIGEST: content/spine/world-digest.json is missing — run --write");
    process.exit(1);
  }
  const committed = JSON.parse(readFileSync(LOCK, "utf8"));
  const problems = checkWorldDigest({ committed, computed });
  console.log("world-digest · check");
  for (const [k, v] of Object.entries(computed.inputs)) console.log(`  ${k}  ${v}`);
  if (problems.length) {
    console.error("\n  PROBLEMS:");
    for (const p of problems) console.error(`    ${p}`);
    process.exit(1);
  }
  console.log(`\n  ${computed.digest} — matches`);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 5: Baseline it and verify**

Run:
```bash
node --test 'scripts/tests/world-digest.test.mjs'
node scripts/check_world_digest.mjs --write
node scripts/check_world_digest.mjs --check
```
Expected: tests PASS; `--write` prints three input lines with `content/world/fabric` and `content/world/resolved` reading `absent` if Plans C/D have not landed in your branch; `--check` prints `matches`.

- [ ] **Step 6: Wire into Gate 2 and CI**

In `scripts/integration.sh`, beside `canon_legs()`:
```bash
# Plan E / spec §9.3: the whole-world digest — what replaces the freeze once
# coordinates are generated.
world_digest() { node "$REPO_ROOT/scripts/check_world_digest.mjs" --check; }
```
and in `--- Execute ---`, after the canon-leg line:
```bash
run_section "content: world digest"          world_digest
```
In `.github/workflows/ci.yml`, beside the canon-leg step:
```yaml
      - name: world digest
        run: node scripts/check_world_digest.mjs --check
```

- [ ] **Step 7: Prove zero drawn pixels moved, and commit**

Run:
```bash
node scripts/check_render_lock.mjs --check
node scripts/check_spine_emit.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
git status --porcelain game-client/assets/art/maps
```
Expected: both `--check`s PASS without re-baselining, jest PASS, `git status` prints nothing.

```bash
git add scripts/lib/world-digest.mjs scripts/check_world_digest.mjs \
        content/spine/world-digest.json scripts/tests/world-digest.test.mjs \
        scripts/integration.sh .github/workflows/ci.yml
git commit -m "feat: world digest gate replacing the coordinate freeze"
```

- [ ] **Step 8: Quality gate — verify**

Run: `./scripts/integration.sh --no-install` and paste the output. Expected: every section PASS.

- [ ] **Step 9: Quality gate — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`, brief: *"(a) Can two different trees produce the same digest? Consider a file whose bytes contain a NUL and a path boundary. (b) Does `filesUnder` follow symlinks, and could that make the digest depend on something outside the repo? (c) Is the `absent` sentinel distinguishable from a real digest of an empty directory? (d) Does `--write` make an accidental regeneration trivially launderable, and if so what stops it in review?"*

- [ ] **Step 10: Quality gate — refactor, re-verify, report**

Apply findings, then: `./scripts/integration.sh --no-install && git branch --show-current && git log --oneline -1`

---

### Task 5: Unfreeze deepest-first, three commits

G-FROZEN is **transitive and directional** (`check_content.mjs:1957-1979`): a frozen node whose ancestor is unfrozen FAILs, and an unfrozen node still carrying `absoluteAnchor` FAILs. That forces the order. Reversing it reds the gate at every intermediate commit and invites someone to "just disable the gate for now" (R11).

**The 14 frozen nodes, by depth:**

| Depth | Tier | Nodes |
|---|---|---|
| 3 | town | `n-cindervast-town`, `n-embervale`, `n-gildmark`, `n-millcross`, `n-norhollow`, `n-rooktide` |
| 2 | region | `n-cindervast`, `n-emberdown`, `n-gildmark-head`, `n-hollowmarch`, `n-millcross-ford`, `n-rooktide-reach` |
| 1 | continent | `n-cluster1` |
| 0 | world | `n-atlas` — **never unfrozen** (E-C1) |

**Files:**
- Modify: `content/spine/nodes/n-cindervast-town.json`, `n-embervale.json`, `n-gildmark.json`, `n-millcross.json`, `n-norhollow.json`, `n-rooktide.json` (commit 5a)
- Modify: `content/spine/nodes/n-cindervast.json`, `n-emberdown.json`, `n-gildmark-head.json`, `n-hollowmarch.json`, `n-millcross-ford.json`, `n-rooktide-reach.json` (commit 5b)
- Modify: `content/spine/nodes/n-cluster1.json` (commit 5c)
- Modify: `content/spine/derived.json` (re-emitted after each commit)

**Interfaces:**
- Consumes: Task 3's frozen-OR-pinned `G-CANON-LEG` — **without it, commit 5a produces up to 12 `G-CANON-LEG ... endpoint ... is not frozen` failures at once.** Verify Task 3 is merged before starting.
- Produces: nothing. This is a state change, not an API.

- [ ] **Step 1: Prove the precondition**

Run: `git log --oneline -20 | grep "canon-leg pre-flight" && node scripts/check_content.mjs --only=spine`

Expected: the Task 3 commit is present and the gate is green. If the commit is absent, **stop** — go back to Task 3.

- [ ] **Step 2: Unfreeze the six towns (commit 5a)**

In each of the six town node files, make exactly two edits: set `"frozen": false` and **delete the `absoluteAnchor` line entirely**. Example — `content/spine/nodes/n-millcross.json` currently reads:

```json
  "frozen": true,
  "absoluteAnchor": [17.2, 23.6],
```

and becomes:

```json
  "frozen": false,
```

Change nothing else. `placement`, `interior`, `composition`, `lore` and `levelBand` all stay byte-identical: this commit removes a *pin*, not a coordinate.

- [ ] **Step 3: Re-emit and verify commit 5a**

Run:
```bash
node scripts/check_spine_emit.mjs --write
node scripts/check_content.mjs --only=spine
node scripts/check_render_lock.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
git diff --stat
```
Expected: `check_content --only=spine` **PASS with zero G-FROZEN and zero G-CANON-LEG failures**. `check_render_lock --check` PASS *without* re-baselining — `frozen` and `absoluteAnchor` do not reach the sheets. `git diff --stat` shows 6 node files + `content/spine/derived.json` (the six digests) and **nothing else**.

If any `G-CANON-LEG ... is neither frozen nor pinned` appears, the pinned record for that town is missing from `content/world/civil/pinned/` or absent from `content/spine/canon-legs.json`. Fix the join, not the freeze.

- [ ] **Step 4: Commit 5a**

```bash
git add content/spine/nodes content/spine/derived.json
git commit -m "refactor: unfreeze the six canon towns"
```

- [ ] **Step 5: Unfreeze the six regions (commit 5b), then re-emit and verify**

Apply the identical two edits to the six region node files. Then run the Step 3 command block again.

Expected: PASS. The specific failure this step exists to prove **cannot** happen is `spine: G-FROZEN n-<town>: frozen but ancestor n-<region> is not` — the towns were already unfrozen in 5a, so no frozen child sits under a newly-unfrozen parent.

```bash
git add content/spine/nodes content/spine/derived.json
git commit -m "refactor: unfreeze the six canon regions"
```

- [ ] **Step 6: Unfreeze `n-cluster1` (commit 5c), then re-emit and verify**

Same two edits on `content/spine/nodes/n-cluster1.json`. Run the Step 3 block again.

Expected: PASS, and `grep -l '"frozen": true' content/spine/nodes/*.json` returns **exactly one file**, `content/spine/nodes/n-atlas.json`. `n-atlas` stays frozen: `gSpineFrozen` only walks a frozen node's ancestors, and `n-atlas.parentId === null`, so a frozen root over unfrozen children is legal — and the Global Constraints require it (E-C1).

```bash
git add content/spine/nodes content/spine/derived.json
git commit -m "refactor: unfreeze n-cluster1, frame stays frozen"
```

- [ ] **Step 7: Quality gate — verify**

Run: `./scripts/precheck.sh --no-install && ./scripts/integration.sh --no-install` and paste the output. Expected: every section PASS. Also run `node scripts/check_world_digest.mjs --check` — it **will fail**, because `content/spine/nodes` moved. Re-baseline it deliberately: `node scripts/check_world_digest.mjs --write && git add content/spine/world-digest.json && git commit -m "chore: re-baseline world digest after unfreeze"`. This is a fourth, deliberate commit; it is exactly the affordance the gate exists to make visible.

- [ ] **Step 8: Quality gate — independent adversarial review**

Fresh reviewer on `git diff HEAD~4..HEAD`, brief: *"(a) Did any commit change a coordinate, a composition value or a `lore` field alongside the freeze flags? Prove it with `git diff` filtered to non-`frozen`/`absoluteAnchor` lines. (b) Was any intermediate commit red? Check out each of the three SHAs and run `node scripts/check_content.mjs --only=spine`. (c) Is `n-atlas` still frozen with a matching `absoluteAnchor`? (d) Did `mapDimensions.ts` move in any of the four commits?"*

- [ ] **Step 9: Quality gate — refactor, re-verify, report**

Apply findings, then: `./scripts/integration.sh --no-install && git branch --show-current && git log --oneline -4`

---

### Task 6: THE REDRAW — one commit, one revert

This is the commit the whole programme exists to make survivable. It replaces the 44-node trunk with 36 nodes generated from the seed and 13 premise files, re-fits the edges, and re-baselines **every** byte comparison — in the strict R12 order, each step verified alone, so an illegitimate seventh failure cannot hide in the noise of six legitimate ones.

**Two absolute rules.**
1. **A redraw commit may not contain a hand edit.** If a ring needs adjusting, adjust the premise or the seed and regenerate. `G-PROVENANCE`'s `generator.fabric` pin and `G-TRUNK-AREA` together make a hand edit detectable.
2. **Do not commit until every step below has been verified alone.** The reason is R12: the redraw legitimately reds six comparisons, and any failure surviving a *completed* step is a real defect.

**The lock has already moved once, and that is expected.** Plan B Task 12 ("re-ink the two live sheets") re-baselined `content/world/render-lock.json` and the two committed SVGs under the one recorded carve-out in the Global Constraints. So the baseline this task re-writes is Plan B's, not the pre-programme one, and `git log --oneline -- content/world/render-lock.json` will show that earlier commit. That is the *only* legitimate prior re-baseline: if the log shows a third, find it before you generate anything, because something re-inked a sheet outside its licence.

**Which sheets this task re-renders.** Every sheet **already registered** when the task starts — `cluster1`, `atlas` (live), `synthetic` (Plan B Task 10), `fabric` and `overlay` (Plan C Task 13). The 13 per-continent sheets do **not** exist yet; they are Task 8's deliverable (E-C10), deliberately after the redraw because their builder reads `content/world/resolved/`, which promotion writes in Step 5 of this task. Steps 10 and 11 below therefore touch the storybook index and the art manifest only for sheets whose bytes moved, and the continent rows land in Task 8.

**Files:**
- Create: `content/spine/trunk-census.json`
- Modify: `content/spine/nodes/*.json` (44 → 36 files — rewritten wholesale by `promote-world.mjs`, no anchor), `content/spine/edges.json:1-654` (endpoint refs only; the first `road` edge is at `:4`), `content/spine/derived.json` (re-emitted wholesale by `check_spine_emit.mjs --write`)
- Modify: `content/world/render-lock.json`, `content/spine/world-digest.json` (both generated — only ever rewritten by their own `--write` CLI, never hand-edited)
- Modify: `game-client/assets/art/maps/*.svg` (the **5** sheets registered at this point — `cluster1`, `atlas`, `synthetic`, `fabric`, `overlay`; the 13 continent sheets arrive in Task 8), `game-client/assets/art/art-manifest.json:517`, `game-client/assets/.thumbs/index.json` (generated by `bake_thumbnails.mjs`, no anchor)
- Modify: `tools/asset-storybook/maps-index.json:4-19` (the two live rows' `note` strings; the array does not grow here)
- Modify: `content/bestiary/*.json`, `content/story/regions.json`, `content/towns/town-millcross.json` (alias re-homing, ids preserved wherever possible; the rows to touch are enumerated by the gate at Step 12, not by a line range)
- Modify: `content/maps/atlas-frontier.md`, `colyseus-server/src/config/generated/mapDimensions.ts` (emitter output — must be byte-UNCHANGED)
- Test: `scripts/tests/trunk-census.test.mjs`

**Interfaces:**
- Consumes: `node tools/mapforge/promote-world.mjs --from build/mapforge/<runId> [--dry-run]` and `promoteWorld({repoRoot, runDir, dryRun})` (Plan C); `node tools/mapforge/generate-world.mjs --seed 7c9e4a2f8b1d6e03 --out build/mapforge/<runId>` (Plan C); `SHEETS` with `title`/`maxLabelRank` (Plan A/B); `node scripts/check_render_lock.mjs --write` (Plan A); `content/world/resolved/*.json` (Plan D).
- Produces: `content/spine/trunk-census.json`.

- [ ] **Step 1: Write the failing census test**

Create `scripts/tests/trunk-census.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const NODES = join(ROOT, "content/spine/nodes");
const CENSUS = JSON.parse(readFileSync(join(ROOT, "content/spine/trunk-census.json"), "utf8"));

function tally() {
  const byTier = {};
  const ids = [];
  for (const f of readdirSync(NODES).filter((n) => n.endsWith(".json")).sort()) {
    const n = JSON.parse(readFileSync(join(NODES, f), "utf8"));
    byTier[n.tier] = (byTier[n.tier] ?? 0) + 1;
    ids.push(n.id);
  }
  return { byTier, ids };
}

test("the trunk matches its committed census exactly", () => {
  const { byTier, ids } = tally();
  assert.equal(ids.length, CENSUS.expected,
    `trunk holds ${ids.length} nodes, census says ${CENSUS.expected}`);
  assert.deepEqual(byTier, CENSUS.byTier);
});

test("every census line carries a written reason", () => {
  for (const tier of Object.keys(CENSUS.byTier))
    assert.equal(typeof CENSUS.why[tier], "string",
      `census tier "${tier}" has no why — a node count nobody can justify is a node count nobody will defend`);
});

test("the two alias anchors survive — two representsNodeId pointers depend on them (X2)", () => {
  const { ids } = tally();
  for (const id of ["n-thornveil", "n-northern-icefield"])
    assert.ok(ids.includes(id),
      `${id} is the target of a runtime representsNodeId pointer; spine.mjs:875-877 hard-FAILs G-ALIAS if it vanishes`);
});

test("the one committed town plan's spineId host survives", () => {
  const plan = JSON.parse(readFileSync(join(ROOT, "content/towns/town-millcross.json"), "utf8"));
  assert.ok(tally().ids.includes(plan.spineId));
});

test("the trunk fits the load budget", () => {
  const budget = JSON.parse(readFileSync(join(ROOT, "content/spine/load-budget.json"), "utf8"));
  assert.ok(tally().ids.length <= budget.maxNodes);
});
```

Create `content/spine/trunk-census.json`:

```json
{
  "version": 1,
  "expected": 36,
  "byTier": {
    "world": 1, "continent": 13, "ocean": 3, "sea": 9,
    "region": 2, "town": 1,
    "playroot": 1, "playspace": 1, "site": 3, "fixture": 2
  },
  "why": {
    "world": "n-atlas — the 400x400 km frame. Frozen, never regenerated.",
    "continent": "The 13 landmasses of spec §6.3. Each pins provenance.generator.fabric at the fabric file its outline was simplified from (G-TRUNK-AREA, ±3%).",
    "ocean": "Galereach, Keelbreak, Tarnmark. Polygons 41,800 / 30,400 / 19,000 km².",
    "sea": "The 9 marginal seas. Each is a SUBSET of its ocean polygon (G-CONTAIN); its area is already inside the 91,200 and is never added again.",
    "region": "n-thornveil and n-northern-icefield ONLY. The runtime tree points at both through representsNodeId and scripts/lib/spine.mjs:875-877 hard-FAILs G-ALIAS if either vanishes. Every other region is a fabric row.",
    "town": "n-millcross ONLY — the spineId host of content/towns/town-millcross.json, the one committed town plan. Hangs directly off its continent via the DEPTH_EXCEPTIONS entry \"continent>town\". Each future town plan (E-C9 defers 7) adds one node here and one line to this census, as a reviewed commit.",
    "playroot": "The runtime root, copied verbatim by promote-world.mjs via roots.json membership.",
    "playspace": "n-frontier-shelf — runtime, copied verbatim.",
    "site": "n-site-spawn-meadow, n-site-thornveil, n-site-icefield — runtime, copied verbatim.",
    "fixture": "n-fixture-deflect, n-fixture-projectile — runtime, copied verbatim."
  }
}
```

- [ ] **Step 2: Run the census test to verify it fails**

Run: `node --test 'scripts/tests/trunk-census.test.mjs'`

Expected: FAIL — `trunk holds 44 nodes, census says 36`. That failure is the definition of the work in this task.

- [ ] **Step 3: Generate the world into a draft folder**

Run:
```bash
node tools/mapforge/generate-world.mjs --seed 7c9e4a2f8b1d6e03 --out build/mapforge/7c9e4a2f-3.0.0 --stage-report
cat build/mapforge/7c9e4a2f-3.0.0/report.md
```
Expected: a per-stage timing table inside §7.6's budgets (generate ≤ 8 s), and a manifest reporting `seaLevel`, `landCells` inside [228572, 290908], `landKm2` ≈ 64,000 and `seaToLandRatio` inside [1.20, 1.80]. **If the ratio is outside the band, stop.** The message will say the premise footprints are wrong; fix a premise, do not reroll toward the target.

- [ ] **Step 4: Dry-run the promotion and read the reconciliation**

Run: `node tools/mapforge/promote-world.mjs --from build/mapforge/7c9e4a2f-3.0.0 --dry-run`

Expected: a `written` / `deleted` listing. Read the **`deleted`** list line by line. It must contain the 18 region nodes minus `n-thornveil` and `n-northern-icefield`, the 7 town nodes minus `n-millcross`, and no `n-playroot` descendant. If a runtime node appears in `deleted`, the promotion is identifying runtime edges by a pinned id list instead of `roots.json` membership — **stop and report it to Plan C.**

- [ ] **Step 5: R12 step 1 — spine canonicalisation, verified alone**

Run:
```bash
node tools/mapforge/promote-world.mjs --from build/mapforge/7c9e4a2f-3.0.0
ls content/spine/nodes/*.json | wc -l
node --test 'scripts/tests/trunk-census.test.mjs'
node scripts/check_content.mjs --only=spine
git diff --exit-code colyseus-server/src/config/generated/mapDimensions.ts; echo "mapDimensions exit: $?"
(cd colyseus-server && npm test -- mapDimensions)
```
Expected: **36** node files; the census test PASSES; `--only=spine` PASSES; `git diff --exit-code` on `mapDimensions.ts` exits **0** with no output, and jest PASSES. The runtime subtree was copied verbatim, so the generated TypeScript inside the server's `tsc` rootDir must be byte-identical. **If `mapDimensions.ts` moved, revert everything and report it — the runtime non-goal has been violated.**

- [ ] **Step 6: R12 step 1b — re-fit the seven canon legs and eight roads**

Six of the seven legs' endpoint town nodes no longer exist. Re-point each leg's `from`/`to` at the trunk point feature named in `content/spine/canon-legs.json`. Worked example — `content/spine/edges.json`, `e-leg-millcross-gildmark`:

```json
  {
    "id": "e-leg-millcross-gildmark",
    "kind": "leg",
    "from": { "node": "n-millcross" },
    "to":   { "node": "n-gildmark" },
    "attrs": { "roadKm": 28, "straightKm": 17, "canonHours": "~2.5 h" }
  }
```
becomes
```json
  {
    "id": "e-leg-millcross-gildmark",
    "kind": "leg",
    "from": { "node": "n-millcross" },
    "to":   { "feature": "f-town-gildmark" },
    "attrs": { "roadKm": 28, "straightKm": 17, "canonHours": "~2.5 h" }
  }
```
`n-millcross` survives as a node (E-C4) so its endpoint is unchanged; `n-gildmark` does not, so it resolves through the point feature the generator emitted on its continent. Apply the same substitution to the other six legs and to any of the eight `road` edges whose `{node}` endpoint vanished. **`straightKm`, `roadKm` and `canonHours` are never edited** — they are canon, and the pins were solved against them in Task 3.

Then run:
```bash
node scripts/check_canon_legs.mjs
node scripts/check_content.mjs --only=spine
```
Expected: the seven-row table with every `verdict` reading `OK`, and zero `G-CANON-LEG` / `G-NET` failures.

- [ ] **Step 6b: Apply the five owner-edge rulings (owner review, 2026-08-26)**

Step 6's grammar clears only the 13 leg lines and part of the road class; the remaining **88 − 13 = 75** `G-NET` survivors fall into five classes, each measured during the halted 2026-08-26 attempt and each ruled here so the one-commit discipline survives. Every ruling below is recorded in `world-fill-STATE.md` §28 with the same wording.

1. **RELAYS — RETIRE `e-trunk-chain` and `e-flat-chain`.** Both are tower-relay chains over `f-tower-*` features (21 + 3 `via` entries), and towers do not survive the redraw — there is no `f-town-<slug>` equivalent for a signal tower. Their canon content (which towns sit along the coastal spur) is carried by the roads themselves, which all survive re-pointed. Delete both edge records; do not substitute.
2. **SEALANES — RE-SITE at the surviving ports' `f-town-*` features.** `e-lane-coldreach`: `{node: n-gildmark}` → `{feature: f-town-gildmark}`, `{feature: f-port-tallowquay}` → `{feature: f-town-tallowquay}`. `e-lane-stonemoor-foreign`: `f-port-tallowquay` → `f-town-tallowquay`, `f-port-netstead` → `f-town-netstead`. **`e-sea-lane` is RETIRED**, not re-sited: its own `note` says it is the same once-a-year voyage as `e-lane-coldreach` with the far end uncharted, and its far endpoint `f-trade-wind-far` is an off-map chart convention with no surviving substitute — re-pointing it at Tallowquay would make it byte-duplicate the coldreach lane minus `sailDays`. The landfall ground itself survives as pinned landmark `c-lm-the-trade-wind-landfall`.
3. **ROAD-HEADS/APPROACHES — RE-SITE `e-cindervast-approach`; RETIRE nothing else here.** `{feature: f-ashvale-road-head}` → `{feature: f-town-norhollow}` (its outer farms border Cindervast's ruin district — canon §4), `{feature: f-cindervast-approach-end}` → `{feature: f-town-cindervast}`. The dashed/not-maintained attrs and the note are preserved verbatim.
4. **EXPEDITION-CAMP — RETIRE `e-terrace-track` and `e-terrace-track-north`.** The camp was a chart site, never one of the 45 settlements, so no `f-town-*` feature exists for either endpoint grammar to resolve against; its ground survives as pinned landmark `c-lm-expedition-camp`, and the road north to the ice remains canon prose and drawn relief, not spine geometry.
5. **MOVED-ROAD POINTS — TRANSLATE, never retypes.** Every retained road edge's `points[]` still sits in the pre-F-045 frame; the mechanical rule is `p' = p + PIN_OFFSET` where `PIN_OFFSET = [81, 129]` is DERIVED exactly as `pinned-roster.json` derives it (premise footprint centre minus `n-cluster1`'s anchor — read it from the committed value, do not retype). Proof the rule is right: `[17.2, 23.6] + [81, 129] = [98.2, 152.6]`, which is `c-town-millcross.at` to the decimal, and `e-terrace-track`'s last point lands exactly on `c-lm-expedition-camp.at`. Applies to `e-trade-road-trunk`, `e-river-road-south` and any other retained edge carrying stale-frame `points`.

After applying all five, run Step 6's two gate commands again — Expected: zero `G-NET` / `G-CANON-LEG` failures on the promoted trunk, with the census counts unchanged (36 files).

- [ ] **Step 6d: Class 6 — the Rooktide pin snap (owner ruling, 2026-08-26, APPROVED)**

`c-town-rooktide.at` `[98, 163.5]` is not on owned land in the generated world (2.49 km gap between c02/r18 and r19; pin receipt `region: null`; every generate run prints the problem line). The settlements pass drops the town, so no `f-town-rooktide` feature exists for Step 6's grammar. Snap the pin to **`[95.0, 162.5]`** — derived as owned-region-cells ∩ millcross-leg ±8% annulus ∩ cindervast-leg ±8% annulus, minimum displacement — in BOTH `content/world/civil/pinned-roster.json` and `content/world/civil/pinned/c-town-rooktide.json`, with the ruling recorded in each file's `why`. Update the Plan D real-world test literals that pin the old coordinates (they exist precisely to make this a reviewed, visible change), regenerate the draft, and confirm the report no longer carries the `not on owned land` line before re-promoting.

- [ ] **Step 6e: Re-place the preserved town host from its pin**

The promoted `n-millcross` keeps its pre-redraw `placement.anchor`. Re-derive it so its COMPOSED world anchor equals `c-town-millcross.at` — invert the parent composition arithmetically, never by typing world coordinates into the node — then re-run `check_spine_emit.mjs --write`. Town-frame internals move with the rect wholesale.

- [ ] **Step 6f: Rulings 7a/7b/8 — the alias vocabulary and the basin sheet (owner-approved, 2026-08-26)**

1. **(7a)** `checkSpineAlias`'s resolved-world sets gain the bare slug beside every `c-town-*` civil id — a lookup-side normalisation restoring the fallback's pre-redraw contract (recorded in STATE §28 as the sanctioned exception to "never edit the resolver").
2. **(7b)** `region.schema.json`: `spineId` OR the new `resolvedRef` (resolved world zones ∪ towns id), exactly one required; uniqueness on spineId only; `checkSpineStoryAlias` accepts both and prints which. The six orphaned story regions re-home onto `c-town-*` refs, ashvale-front onto `c02/r11`.
3. **(8)** The cluster1 sheet retires from `SHEETS` with its whole tail — registry entry, storybook row (`maps-index.json`), art-manifest block, committed SVG/thumb bytes, render-lock rebaseline, and the tests swearing to its subjects — rebuilt resolved-backed in Task 8. Bestiary `ashvale-front` rows re-home onto `c02/r11`.


- [ ] **Step 6c: Water-pin false positives in the stale-pin scan**

`loadFabricRegionIndex` counts only `continent-NN.json`, while Plan C pins every ocean/sea trunk node's `generator.fabric` at `content/world/fabric/world.json` (pinned by `generate-world.test.mjs:451`) — so the promoted water trunk adds 12 false stale-pin FAILs. Fix `survey.mjs` so the scan skips **water-tier** (`tier: "ocean" | "sea"`) pins rather than pretending `world.json` is a region index: a water node has no fabric region to band-check against, which is why the pin is legitimate. Add the regression case to `survey`'s real-world test block alongside the existing pin cases.


- [ ] **Step 7: R12 step 2 — geography emit, verified alone**

Run:
```bash
node scripts/check_spine_emit.mjs --write
node scripts/check_spine_emit.mjs --check
git diff --stat content/spine/derived.json content/maps/atlas-frontier.md colyseus-server/src/config/generated/
```
Expected: `--check` PASSES. `content/spine/derived.json` is rewritten (36 entries). `atlas-frontier.md` and `mapDimensions.ts` show **zero** changed lines.

- [ ] **Step 8: R12 step 3 — sheets, verified alone**

Run:
```bash
node -e "import('./tools/mapforge/render-sheet.mjs').then(m=>console.log(Object.keys(m.SHEETS).join('\n')))"
for s in $(node -e "import('./tools/mapforge/render-sheet.mjs').then(m=>console.log(Object.keys(m.SHEETS).join(' ')))"); do
  node tools/mapforge/render-sheet.mjs --sheet "$s" --no-png || exit 1
done
ls -la game-client/assets/art/maps/*.svg
```
Expected: every sheet builds with an empty `PROBLEMS` block. A `G-BIOME-INK`, `G-GLYPH` or `G-LABEL` problem here is a **Plan B defect surfacing on real density** — report it, do not hand-tune the sheet. `--no-png` is deliberate: PNGs leave the review loop (§7.5) and are baked as thumbnails in Step 11.

- [ ] **Step 9: R12 step 4 — fixtures, verified alone**

Run:
```bash
npm test --prefix scripts
node --test 'tools/mapforge/tests/*.test.mjs'
```
Expected: PASS. Two specific fixtures need attention if they fail:
- `scripts/tests/spine-gates.test.mjs:403,410` assert on literal `G-OVERLAP` strings over cell-aligned rectangles. They are hermetic synthetic fixtures and must **not** move; if they fail, the exact-clipping swap (Plan A) regressed.
- Any test that spawns the gate against `realSpineCopy()` (`spine-gates.test.mjs:180`) now sees 36 nodes. Update counts to the new census values and add a comment naming `content/spine/trunk-census.json` as the authority, so the next redraw updates one file instead of hunting literals.

- [ ] **Step 10: R12 step 5 — storybook index, verified alone**

No sheet is **added** here (the 13 continent rows land in Task 8), but every existing row's `note` now describes a world that no longer exists. Re-voice the two live rows in `tools/asset-storybook/maps-index.json:5-19` against the redrawn chart — `svg`/`png`/`id`/`title` must keep byte-matching `SHEETS[id]`, because `maps-index.test.mjs:33-61` compares those four fields in both directions:

```json
    {
      "id": "atlas",
      "title": "The Atlas World — Mariners' Chart",
      "svg": "game-client/assets/art/maps/atlas-world.svg",
      "png": "game-client/assets/art/maps/atlas-world.png",
      "note": "The compiled world chart on the redrawn 400 x 400 km frame: 13 landmasses, 3 oceans, 9 marginal seas, and the honest parchment where no keel has been."
    },
```
Then run: `node --test 'tools/asset-storybook/tests/*.test.mjs'`

Expected: PASS, and the `sheets[]` array still holds exactly the ids `SHEETS` declares — **5 rows at this point**, not 18. `maps-index.test.mjs:33-61` asserts the correspondence in **both** directions and runs in Gate 1 *and* CI, so a row invented ahead of its `SHEETS` entry reds Gate 1 just as hard as a missing one.

- [ ] **Step 11: R12 step 6 — art manifest, license rows and thumbnails, verified alone**

Same rule: no new `art:map-*` key here, but the existing ones now describe the old world. Re-voice `note`/`description`/`tags` on `art:map-atlas` (`game-client/assets/art/art-manifest.json:517`) and on `art:map-cluster1`, keeping every path field untouched. The block that Task 8 copies for each continent is the one at `:517`:

```json
    "art:map-atlas": {
      "group": "map",
      "title": "The Atlas World — Mariners' Chart",
      "file": "maps/atlas-world.png",
      "note": "AUTHORED VECTOR, NOT GENERATED. Drawn by tools/mapforge/render-sheet.mjs --sheet atlas from content/spine/; the SVG beside this PNG (maps/atlas-world.svg) is the artifact, the PNG is a <=512px thumbnail of it for the storybook.",
      "description": "The compiled world chart on the redrawn frame: thirteen landmasses generated from one seed, three ocean polygons, nine marginal seas nested inside them, and the parchment left empty everywhere the survey has never reached.",
      "tags": ["atlas", "map", "bellfaith", "authored-vector", "svg", "spine"],
      "source": "docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md",
      "gen": {
        "method": "authored-vector",
        "generated": false,
        "tool": "tools/mapforge/render-sheet.mjs",
        "input": "content/spine/",
        "vector": "maps/atlas-world.svg",
        "raster": "rsvg-convert -w 512",
        "deterministic": true,
        "width": 512,
        "note": "No model, no sampler, no seed — drawn from geometry. Re-run the tool to reproduce it byte-for-byte."
      }
    },
```
Then re-bake thumbnails and re-run the manifest gate:
```bash
node scripts/bake_thumbnails.mjs --only maps
node scripts/check_asset_manifest.mjs
```
Expected: PASS. Guard (U) rehashes source bytes against `game-client/assets/.thumbs/index.json`; every redraw invalidates it, which is why the bake is a step and not a follow-up. `bake_thumbnails.mjs` needs `sharp` — it lives in `scripts/`, so run `npm ci --prefix scripts` first if the binary is missing. **CI never runs the bake, only the guard**, so a skipped bake reds CI, not your laptop.

- [ ] **Step 12: Re-home the aliases (X4), verified alone**

Under D1 default (a) — re-fit, keeping every id and join key stable — most aliases survive untouched. Enumerate the ones that did not:

```bash
node scripts/check_content.mjs --require-complete 2>&1 | grep -E "G-ALIAS|spine-alias|does not resolve" | tee /tmp/alias-red.txt
wc -l /tmp/alias-red.txt
```
For each line, re-home the record — never the resolver:
- `content/bestiary/*.json` — 116 placement rows across 9 region slugs. A row naming a slug that no longer exists moves to the surveyed region that inherited that ground — the fabric region whose ring contains the old zone's `labelAt` point, computed here, not guessed.

**Where the old `labelAt` values come from, and why not from disk.** Both pre-redraw copies are gone from the working tree by the time this step runs: Plan A Task 12 `git rm`s `content/maps/cluster1-geography.json`, and Step 6's promotion has already overwritten the ten basin region nodes that carried `lore.labelAt`. **The source is git**, and specifically the legacy mirror one commit before Plan A deleted it — that file is the exact document these 10 `id`/`labelAt` pairs were authored against. Do not reintroduce a working-tree read of the deleted path; it will `ENOENT` and this step is what Task 10's allocation table transcribes.

```bash
# The last commit touching the mirror path IS Plan A Task 12's deletion, so its
# parent is the last tree that still holds the file. No sha is hand-substituted.
DEL=$(git rev-list -n 1 HEAD -- content/maps/cluster1-geography.json)
test -n "$DEL" || { echo "mirror not in this branch's history — is Plan A merged?"; exit 1; }
git show "$DEL^:content/maps/cluster1-geography.json" > /tmp/old-geography.json
node -e '
const fs=require("fs");
const old=JSON.parse(fs.readFileSync("/tmp/old-geography.json","utf8"));
const fab=JSON.parse(fs.readFileSync("content/world/fabric/continent-02.json","utf8"));
const inRing=(p,ring)=>{let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const[xi,yi]=ring[i],[xj,yj]=ring[j];
  if((yi>p[1])!==(yj>p[1])&&p[0]<((xj-xi)*(p[1]-yi))/(yj-yi)+xi)c=!c;}return c;};
for(const z of old.zones){
  const hit=fab.regions.find(r=>r.survey==="surveyed"&&inRing(z.labelAt,r.ring));
  console.log(z.id,"->",hit?hit.id:"NO SURVEYED REGION CONTAINS IT — report it");
}'
```
Expected: exactly **10** lines, one per pre-redraw basin zone, and no `NO SURVEYED REGION` line. Paste that mapping into the phase report; Task 10's allocation table transcribes the same column, so the two can never disagree. A zone whose ground fell outside every surveyed region is a redraw defect, not a re-homing decision — stop and report it.
- `content/story/regions.json` — 10 story regions. `region-spawn-meadow → n-frontier-shelf` is a **runtime** pointer and must not change.
- `game-client/assets/art/art-manifest.json` — 6 `art:town-*` keys resolve against the resolved world's towns.
- `content/towns/town-millcross.json` — `spineId: "n-millcross"` is preserved by the census; if it is not, the census is wrong.

Re-run until `/tmp/alias-red.txt` is empty. **Assert the gate still COUNTS records, not merely that it exits 0** — all three geography joins `return 0` on a failed load, so a botched re-home silently disables the gate:
```bash
node scripts/check_content.mjs --require-complete 2>&1 | grep -E "^(zones|placements|towns):.*[0-9]+ "
```
Expected: non-zero counts on all three lines.

- [ ] **Step 13: Re-baseline the two locks, verified alone**

Run:
```bash
node scripts/check_render_lock.mjs --write
node scripts/check_render_lock.mjs --check
node scripts/check_world_digest.mjs --write
node scripts/check_world_digest.mjs --check
git diff content/world/render-lock.json content/spine/world-digest.json
```
Expected: both `--check`s PASS. The `git diff` is **N changed lines for N changed artifacts** — that is the checksum lock paying for itself against the retired 47 KB fixture. Read every changed line: an artifact you did not expect to move is a real defect.

- [ ] **Step 14: Full green, then ONE commit**

Run:
```bash
node scripts/check_content.mjs --require-complete
node scripts/check_canon_legs.mjs
npm test --prefix scripts
node --test 'tools/mapforge/tests/*.test.mjs'
node --test 'tools/asset-storybook/tests/*.test.mjs'
(cd colyseus-server && npm test -- mapDimensions)
./scripts/integration.sh --no-install
```
Expected: every command PASS. Then, and only then:

```bash
git add -A
git commit -m "feat: redraw the world from the seed — 13 landmasses, 36-node trunk"
git show --stat HEAD | tail -5
```
Expected: roughly 70 files changed. **One commit.** If you have two, squash is not the fix — start over from Step 5 on a clean tree, because a two-commit redraw is a two-commit revert.

- [ ] **Step 15: Prove the revert**

Run:
```bash
git revert --no-commit HEAD && node scripts/check_content.mjs --require-complete && \
  node scripts/check_render_lock.mjs --check && git revert --abort 2>/dev/null; git reset --hard HEAD
```
Expected: the gate and the lock both PASS on the reverted tree, then the working tree returns to the redraw. This proves Mode 1 rollback (§9.7) is real **before** anyone needs it.

- [ ] **Step 16: Quality gate — verify**

Run: `./scripts/integration.sh --no-install` and paste the full output. Expected: every section PASS.

- [ ] **Step 17: Quality gate — independent adversarial review**

Fresh reviewer on `git show HEAD`, brief: *"This is a ~70-file, ~60,000-line redraw. Do NOT read the geometry. Read for these five things only: (a) Does the commit contain a HAND EDIT — any ring, anchor or composition value not produced by the generator? `git show HEAD -- content/spine/nodes` and look for a node whose `provenance.authored` is not `generated`. (b) Did `colyseus-server/src/config/generated/mapDimensions.ts` or `content/maps/atlas-frontier.md` change by even one byte? (c) Did any `straightKm`, `roadKm` or `canonHours` in `content/spine/edges.json` change? Those are canon; only the endpoint refs were allowed to move. (d) Does `content/spine/trunk-census.json` match `ls content/spine/nodes | wc -l`, and does every tier line carry a `why`? (e) Are there any records re-homed in `content/bestiary/` whose new region is NOT the one the allocation table assigns?"*

- [ ] **Step 18: Quality gate — refactor, re-verify, report**

Apply findings **as a new commit on top** — never `git commit --amend`, and never by rewriting the redraw commit. Then: `./scripts/integration.sh --no-install && git branch --show-current && git log --oneline -1`

---

### Task 7: Refreeze root-first, and the shrunken freeze

The freeze bought one thing: a coordinate change became a loud reviewable byte diff. Under generated land, coordinates are generated, so pinning individual anchors is wrong *and* useless — but a small, reasoned freeze still guards the handful of places whose position is load-bearing for canon. §9.3: refreeze **root-first**, recomputing each anchor from the new geometry, because G-FROZEN's ancestor rule reds every intermediate commit under any other order.

**`n-cluster1` IS the post-redraw Wealdmarch continent node — do not look for `n-wealdmarch`.** Plan C's `buildTrunk` mints continent ids from `manifest.landmasses[].nodeId`, never by slugging the title, and c02's column reads `n-cluster1` with a written `nodeIdWhy` on the row. That is deliberate: twelve committed node files name `n-cluster1` as their `parentId`, `scripts/check_spine_emit.mjs:104` and `tools/mapforge/lib/atlas-sheet.mjs:42` resolve it by literal id and hard-fail without it, `scripts/spine-coverage.mjs:14` walks its children, and Plan D derives `PIN_OFFSET` from its committed anchor. A slugged `n-wealdmarch` would be a NEW node, and promotion's reconciliation would delete `n-cluster1` as an `n-atlas` descendant absent from the draft — taking all of the above with it. Plan C Task 10's test *"every continent node id comes from manifest.landmasses[].nodeId, and c02 stays n-cluster1"* fails the generation if anyone changes this. So every `n-cluster1` below is the redrawn Wealdmarch, and E-C4's "re-parented onto Wealdmarch" and Step 5's "their parent `n-cluster1`" are the same statement.

**The shrunken freeze set (10 nodes), each with a written reason:**

| Node | Reason |
|---|---|
| `n-atlas` | Already frozen and never unfrozen — the frame is a Global Constraint. |
| `n-cluster1` (Wealdmarch) | Hosts the redrawn basin, the 2 alias anchors, the town-plan host and 5 of 7 canon-leg endpoints. |
| `n-thornveil` | Target of `n-site-thornveil.representsNodeId`; `spine.mjs:875-877` hard-FAILs G-ALIAS if it moves out of the tree. |
| `n-northern-icefield` | Target of `n-site-icefield.representsNodeId`, same rule. |
| `n-millcross` | `spineId` host of `content/towns/town-millcross.json`; T1–T7 measure the plan against this node's frame. |
| The 3 capital continents (`n-cluster1` counted above, plus `n-coldreach`, `n-stonemoor`) | Host Gildmark, Tallowquay and Netstead — the three charted ports and the two committed sea-lane termini. |
| `n-galereach`, `n-keelbreak`, `n-tarnmark` | The 3 ocean polygons the ratio rolls up through; a silent move here moves `G-ATLAS-ROLLUP`'s answer. |

**Files:**
- Modify: `content/spine/nodes/n-atlas.json`, `n-cluster1.json`, `n-coldreach.json`, `n-stonemoor.json`, `n-galereach.json`, `n-keelbreak.json`, `n-tarnmark.json`, `n-thornveil.json`, `n-northern-icefield.json`, `n-millcross.json`
- Modify: `content/spine/derived.json`, `content/spine/world-digest.json`
- Create: `content/spine/freeze-reasons.json`
- Test: `scripts/tests/freeze-reasons.test.mjs`

**Interfaces:**
- Consumes: `composedAnchor({tree, node})` semantics from `check_content.mjs:1945-1950` — a frozen node's `absoluteAnchor` must byte-equal its placement anchor resolved up through every parent frame to root.
- Produces: `content/spine/freeze-reasons.json` — id → reason, and the gate that requires one.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/freeze-reasons.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const NODES = join(ROOT, "content/spine/nodes");
const REASONS = JSON.parse(readFileSync(join(ROOT, "content/spine/freeze-reasons.json"), "utf8"));

const frozenIds = () => readdirSync(NODES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(NODES, f), "utf8")))
  .filter((n) => n.frozen === true)
  .map((n) => n.id)
  .sort();

test("the freeze set is exactly the reasons file, both directions", () => {
  assert.deepEqual(frozenIds(), Object.keys(REASONS.reasons).sort(),
    "a frozen node with no written reason is a freeze nobody can defend, and an unfrozen node with a reason is a freeze someone quietly dropped");
});

test("the freeze has shrunk from 14 to 10", () => {
  assert.equal(frozenIds().length, 10);
});

test("every reason is a sentence, not a label", () => {
  for (const [id, why] of Object.entries(REASONS.reasons)) {
    assert.equal(typeof why, "string");
    assert.ok(why.length >= 40, `${id}: "${why}" is a label, not a reason`);
  }
});

test("every frozen node carries an absoluteAnchor and every unfrozen node does not", () => {
  for (const f of readdirSync(NODES).filter((n) => n.endsWith(".json"))) {
    const n = JSON.parse(readFileSync(join(NODES, f), "utf8"));
    if (n.frozen === true) assert.ok(Array.isArray(n.absoluteAnchor), `${n.id} frozen without absoluteAnchor`);
    else assert.equal(n.absoluteAnchor, undefined, `${n.id} unfrozen but carries absoluteAnchor`);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test 'scripts/tests/freeze-reasons.test.mjs'`

Expected: FAIL with `Cannot find module` for `content/spine/freeze-reasons.json` — or, after Step 3, with `the freeze has shrunk from 14 to 10` reporting 1 (only `n-atlas` survived Task 5).

- [ ] **Step 3: Write `content/spine/freeze-reasons.json`**

```json
{
  "version": 1,
  "why": "spec §9.3. The freeze shrinks from 14 nodes to 10 because coordinates are now generated: pinning an individual anchor is both wrong and useless. What survives is the set whose POSITION is load-bearing for something outside the geometry — a runtime pointer, a canon distance, a town plan's frame, or the ratio rollup. Every entry is a sentence, and a frozen node absent from this file is a gate failure.",
  "reasons": {
    "n-atlas": "The 400 x 400 km frame. Every number in the design is derived from it and the Global Constraints forbid moving it; it was never unfrozen.",
    "n-cluster1": "Wealdmarch hosts the redrawn playable basin, both alias-anchor regions, the one town-plan host and five of the seven canon-leg endpoints. Moving it moves all of them at once.",
    "n-thornveil": "Target of n-site-thornveil.representsNodeId. scripts/lib/spine.mjs:875-877 hard-FAILs G-ALIAS if the target vanishes, so a runtime-side gate depends on this chart node.",
    "n-northern-icefield": "Target of n-site-icefield.representsNodeId — the same runtime-into-chart pointer, the same hard failure.",
    "n-millcross": "spineId host of content/towns/town-millcross.json. The town-plan gate's T1-T7 measure a 220 x 160 u plan against this node's frame; a moved frame silently re-scores every road clearance.",
    "n-coldreach": "Hosts Tallowquay, one of the two foreign lane termini committed in A2-wider-world.md §2 and one of the three capitals.",
    "n-stonemoor": "Hosts Netstead, the other committed lane terminus and the third capital.",
    "n-galereach": "One of the three ocean polygons G-ATLAS-ROLLUP measures the sea-to-land ratio through. A silent move changes the world's answer without changing any land.",
    "n-keelbreak": "Second of the three ocean polygons carrying the ratio rollup.",
    "n-tarnmark": "Third of the three ocean polygons carrying the ratio rollup."
  }
}
```

- [ ] **Step 4: Refreeze root-first — `n-cluster1` and the oceans (commit 7a)**

Depth 1 first, because `gSpineFrozen` FAILs a frozen node whose ancestor is unfrozen. `n-atlas` is already frozen, so depth-1 children may freeze now.

For each of `n-cluster1`, `n-coldreach`, `n-stonemoor`, `n-galereach`, `n-keelbreak`, `n-tarnmark`: set `"frozen": true` and add an `absoluteAnchor` **computed from the new geometry**, not copied from the old file. Compute it:

```bash
node -e '
import("./scripts/lib/spine.mjs").then(({ loadSpine, buildTree, resolveToRoot }) => {
  const spine = loadSpine({ contentRoot: "content" });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  for (const id of ["n-cluster1","n-coldreach","n-stonemoor","n-galereach","n-keelbreak","n-tarnmark"]) {
    const n = tree.byId.get(id);
    const a = n.parentId === null ? n.placement.anchor
      : resolveToRoot({ tree, id: n.parentId, point: n.placement.anchor });
    console.log(id, JSON.stringify(a));
  }
});'
```
Paste each printed array verbatim into its node file as `"absoluteAnchor": [...]` — `gSpineFrozen` compares with `JSON.stringify` equality, so a re-typed or re-rounded value fails.

Then verify and commit:
```bash
node scripts/check_spine_emit.mjs --write
node scripts/check_content.mjs --only=spine
git add content/spine/nodes content/spine/derived.json
git commit -m "refactor: refreeze the continent and ocean tier"
```
Expected: zero `G-FROZEN` failures.

- [ ] **Step 5: Refreeze depth 2 and 3 (commit 7b)**

Same procedure for `n-thornveil` and `n-northern-icefield` (regions, depth 2 — their parent `n-cluster1` is now frozen), then `n-millcross` (town, depth 3 — its parent is `n-cluster1` under the `continent>town` exception, already frozen). Re-run the anchor computation with those three ids.

```bash
node scripts/check_spine_emit.mjs --write
node scripts/check_content.mjs --only=spine
node --test 'scripts/tests/freeze-reasons.test.mjs'
git add content/spine/nodes content/spine/derived.json content/spine/freeze-reasons.json scripts/tests/freeze-reasons.test.mjs
git commit -m "refactor: refreeze the alias anchors and the town-plan host"
```
Expected: `--only=spine` PASS, `freeze-reasons.test.mjs` PASS with 10 frozen nodes.

- [ ] **Step 6: Wire the reasons file into the gate**

In `scripts/check_content.mjs`, inside `gSpineFrozen` (`:1957`), add the reasons check. Change the signature at `:1957`:
```js
function gSpineFrozen({ nodes, tree, fail }) {
```
to
```js
function gSpineFrozen({ nodes, tree, freezeReasons, fail }) {
```
and immediately after the `if (!node.frozen) { ... continue; }` block, insert:
```js
    // Plan E / spec §9.3: the shrunken freeze. A freeze with no written reason
    // is a freeze nobody can defend at the next redraw. Soft-skips a content
    // root that carries no reasons file (every minimal structural fixture).
    if (freezeReasons && !freezeReasons.reasons[node.id])
      fail(`spine: G-FROZEN ${node.id}: frozen with no entry in content/spine/freeze-reasons.json`);
```
At its call site inside `checkSpine`, load the file the same soft-skipping way:
```js
  const reasonsPath = join(opts.contentRoot, "spine/freeze-reasons.json");
  const freezeReasons = existsSync(reasonsPath)
    ? readJson(reasonsPath, "freeze-reasons", fail) : null;
  gSpineFrozen({ nodes: validNodes, tree, freezeReasons, fail });
```

- [ ] **Step 7: Re-baseline the digest and verify everything**

Run:
```bash
node scripts/check_world_digest.mjs --write
node scripts/check_render_lock.mjs --check
node scripts/check_canon_legs.mjs
node scripts/check_content.mjs --require-complete
npm test --prefix scripts
(cd colyseus-server && npm test -- mapDimensions)
git add content/spine/world-digest.json scripts/check_content.mjs
git commit -m "feat: G-FROZEN requires a written freeze reason"
```
Expected: `check_render_lock --check` PASS **without** a re-baseline — freezing changes no drawn pixel. Everything else PASS.

- [ ] **Step 8: Quality gate — verify**

Run: `./scripts/integration.sh --no-install` and paste the output. Expected: every section PASS.

- [ ] **Step 9: Quality gate — independent adversarial review**

Fresh reviewer on `git diff HEAD~3..HEAD`, brief: *"(a) Was any `absoluteAnchor` copied from the pre-redraw file instead of recomputed? Recompute all ten independently and compare. (b) Was any intermediate commit red? Check out each SHA and run `--only=spine`. (c) Does the freeze set omit a node whose position something outside the geometry depends on? Grep for `spineId`, `representsNodeId` and `straightKm` and check each target. (d) Can `gSpineFrozen`'s new check fire on a fixture root and red ~45 existing tests?"*

- [ ] **Step 10: Quality gate — refactor, re-verify, report**

Apply findings as new commits, then: `./scripts/integration.sh --no-install && git branch --show-current && git log --oneline -3`

---

### Task 8: The 13 continent sheets — the zoom tier nobody built

Spec §11 fixes the sheet roster at "1 atlas + 13 continents + 1 basin + 1 overlay" and §7.4 declares `maxLabelRank: 8` as the **continent** zoom tier; §11's `G-LABEL` decision caps the world tier at ≤ 40 labels *"and everything else deferred to continent sheets."* Across Plans A–D the `SHEETS` registry ends at five entries and no builder is parameterised by continent (E-C10). Without this task the redraw ships 1,740 landform instances, 336 named landforms, 45 settlements and 160 regions with **one** sheet that draws them all at world scale, the continent tier is never exercised, and the world tier's label budget defers to sheets that do not exist.

**One builder, thirteen sheets.** A per-continent module would be thirteen files to review and thirteen places for a divergence to hide. `buildContinentSheet({ repoRoot, continent })` is a single function; the registry entries are generated from `CONTINENT_SHEETS`, so adding a fourteenth landmass is one row.

**This is the last commit that adds a drawn artifact.** After it the render lock stops growing and every later task's `check_render_lock --check` must pass *without* a re-baseline. Prose does not reach the sheets.

**Files:**
- Create: `tools/mapforge/lib/continent-sheet.mjs`
- Create: `tools/mapforge/tests/continent-sheet.test.mjs`
- Create: `game-client/assets/art/maps/rimewall-cap.svg`, `wealdmarch.svg`, `coldreach.svg`, `stonemoor.svg`, `thirstwold.svg`, `reedstrand.svg`, `driftholt.svg`, `wracklow.svg`, `brightfall.svg`, `ashen-spar.svg`, `quillreef.svg`, `skerryfast.svg`, `loamspit.svg`
- Modify: `tools/mapforge/render-sheet.mjs:38-50` (the `SHEETS` registry; Plan B Task 10 and Plan C Task 13 have already added `synthetic`, `fabric` and `overlay` by the time this runs)
- Modify: `tools/asset-storybook/maps-index.json:4-19` (the `sheets[]` array grows from 5 rows to 18)
- Modify: `game-client/assets/art/art-manifest.json:517` (13 new `art:map-*` entries modelled on the `art:map-atlas` block at `:517`)
- Modify: `content/world/render-lock.json` (generated — extended by `node scripts/check_render_lock.mjs --write`, never hand-edited)
- Test: `tools/mapforge/tests/continent-sheet.test.mjs`

**Interfaces:**
- Consumes: `content/world/resolved/continent-NN.json` (Plan D `resolveCivil`, promoted in Task 6) and `content/world/fabric/continent-NN.json` (Plan C) for `regions[].biomeShares`; `C`, `r2`, `esc`, `createDraft`, `patternDefs({ids})`, `FILL_FOR`, `LEGEND`, `ROAD_W` (Plan B Task 6); `checkBiomeInk` and `frontierPattern` (Plan B Task 6, `tools/mapforge/lib/ink.mjs` — the single provenance→hatch mapping; this sheet must not declare its own); `GLYPHS`, `symbolDefs`, `glyphUse`, `checkGlyphCoverage` (Plan B Task 7); `RANKS`, `placeLabels`, `checkLabels` (Plan B Task 8); `bakedUnderlay` (Plan B Task 9); `SHEETS` (Plan A).
- Produces: `CONTINENT_SHEETS`, `buildContinentSheet({repoRoot, continent})`, and 13 `SHEETS` entries at `maxLabelRank: 8`.

- [ ] **Step 1: Write the failing test**

Create `tools/mapforge/tests/continent-sheet.test.mjs`:

```js
// Plan E Task 8 — the continent zoom tier. Spec §7.4 gives it maxLabelRank 8
// and §11 counts 13 of them in the sheet roster. This suite is the proof that
// all thirteen exist, that each is indexed, and that the densest one renders
// the real world at real density with zero PROBLEMS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTINENT_SHEETS, buildContinentSheet } from "../lib/continent-sheet.mjs";
import { SHEETS } from "../render-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const idx = () => JSON.parse(readFileSync(join(ROOT, "tools/asset-storybook/maps-index.json"), "utf8"));

test("thirteen continent sheets, one per landmass, ids unique and non-colliding", () => {
  assert.equal(CONTINENT_SHEETS.length, 13);
  assert.deepEqual([...new Set(CONTINENT_SHEETS.map((s) => s.continent))].sort(),
    ["c01","c02","c03","c04","c05","c06","c07","c08","c09","c10","c11","c12","c13"]);
  for (const s of CONTINENT_SHEETS) {
    assert.match(s.id, /^[a-z][a-z-]*$/, `${s.id} is not a slug`);
    assert.ok(!["atlas", "cluster1", "synthetic", "fabric", "overlay"].includes(s.id),
      `${s.id} collides with a sheet another plan registered`);
    assert.equal(typeof s.title, "string");
  }
});

test("every continent sheet is registered at the continent zoom tier", () => {
  for (const s of CONTINENT_SHEETS) {
    const entry = SHEETS[s.id];
    assert.ok(entry, `${s.id} is not in SHEETS — render-sheet.mjs was not wired`);
    assert.equal(entry.maxLabelRank, 8, `${s.id}: spec §7.4 fixes the continent tier at 8`);
    assert.equal(entry.outSvg, `game-client/assets/art/maps/${s.id}.svg`);
    assert.equal(entry.outPng, `game-client/assets/art/maps/${s.id}.png`);
    assert.equal(typeof entry.build, "function");
  }
});

test("the roster closes at 18 — 1 atlas + 1 basin + 13 continent + 1 overlay + 1 fabric + 1 synthetic", () => {
  const budgets = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  assert.equal(Object.keys(SHEETS).length, 18);
  assert.ok(Object.keys(SHEETS).length <= budgets.sheets.maxSheets,
    `${Object.keys(SHEETS).length} sheets > budget ${budgets.sheets.maxSheets}`);
});

test("X8 parity: every continent sheet has a storybook row, both directions", () => {
  const rows = new Map(idx().sheets.map((r) => [r.id, r]));
  for (const s of CONTINENT_SHEETS) {
    const row = rows.get(s.id);
    assert.ok(row, `${s.id} has no maps-index.json row — maps-index.test.mjs reds Gate 1`);
    assert.equal(row.svg, SHEETS[s.id].outSvg);
    assert.equal(row.png, SHEETS[s.id].outPng);
    assert.equal(row.title, SHEETS[s.id].title);
    assert.ok(row.note.length >= 40, `${s.id}: a note nobody can read is not a review surface`);
  }
  assert.equal(idx().sheets.length, 18);
});

test("ACCEPTANCE: the densest continent builds with ZERO problems", () => {
  const { svg, notes, problems } = buildContinentSheet({ repoRoot: ROOT, continent: "c02" });
  assert.deepEqual(problems, [], problems.join("\n"));
  assert.ok(svg.startsWith("<svg "), "not an svg");
  assert.ok(notes.some((n) => /regions 30 /.test(n)), notes.join(" | "));
  assert.ok(notes.some((n) => /dropped 0/.test(n)), `a label was dropped: ${notes.join(" | ")}`);
});

test("all thirteen build, and none of them throws", () => {
  for (const s of CONTINENT_SHEETS) {
    const out = buildContinentSheet({ repoRoot: ROOT, continent: s.continent });
    assert.deepEqual(out.problems, [], `${s.id}: ${out.problems.join("\n")}`);
    assert.ok(out.svg.length > 0, `${s.id}: empty svg`);
  }
});

test("the continent tier draws NO label above rank 8", () => {
  const { svg } = buildContinentSheet({ repoRoot: ROOT, continent: "c02" });
  const texts = [...svg.matchAll(/<text class="lbl"[^>]*data-rank="(\d+)"/g)].map((m) => Number(m[1]));
  assert.ok(texts.length > 0, "no ranked labels emitted");
  assert.ok(Math.max(...texts) <= 8, `rank ${Math.max(...texts)} escaped the tier cap`);
});

test("buildContinentSheet is deterministic — same bytes twice", () => {
  assert.equal(buildContinentSheet({ repoRoot: ROOT, continent: "c04" }).svg,
               buildContinentSheet({ repoRoot: ROOT, continent: "c04" }).svg);
});

test("every committed continent SVG is current", () => {
  for (const s of CONTINENT_SHEETS) {
    const p = join(ROOT, SHEETS[s.id].outSvg);
    assert.ok(existsSync(p), `${p} was never rendered`);
    assert.equal(readFileSync(p, "utf8"), buildContinentSheet({ repoRoot: ROOT, continent: s.continent }).svg,
      `stale: node tools/mapforge/render-sheet.mjs --sheet ${s.id}`);
  }
});

test("every continent sheet stays inside the committed byte budget", () => {
  const budgets = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  for (const s of CONTINENT_SHEETS) {
    const bytes = Buffer.byteLength(buildContinentSheet({ repoRoot: ROOT, continent: s.continent }).svg, "utf8");
    assert.ok(bytes <= budgets.sheets.maxSvgBytes, `${s.id}: ${bytes} > ${budgets.sheets.maxSvgBytes}`);
  }
});

test("a missing resolved file is a diagnosable PROBLEM, never a throw", () => {
  const out = buildContinentSheet({ repoRoot: ROOT, continent: "c99" });
  assert.equal(out.svg, "");
  assert.match(out.problems.join("\n"), /continent-99\.json/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test 'tools/mapforge/tests/continent-sheet.test.mjs'`

Expected: FAIL — `ERR_MODULE_NOT_FOUND ... lib/continent-sheet.mjs`.

- [ ] **Step 3: Write `tools/mapforge/lib/continent-sheet.mjs`**

```js
// tools/mapforge/lib/continent-sheet.mjs — the continent zoom tier (spec §7.4).
//
// ONE builder for all thirteen landmasses. It draws what the resolved join
// carries and nothing else: surveyed regions in baked biome ink, reported
// regions under the provenance-keyed frontier hatch (§6.4 extension 1),
// the coast and trunk river, roads, settlements, named landforms as glyphs
// with labels, unnamed instances as glyphs without them.
//
// Builder contract, identical to basin-sheet.mjs and synthetic-sheet.mjs:
// NEVER throw — a CLI treats a throw as a crash, not as a diagnosable red.
// Return { svg, notes, problems }.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { C, r2, esc, createDraft, patternDefs, FILL_FOR, LEGEND, ROAD_W } from "./draft.mjs";
// frontierPattern, NOT a local provenance->pattern table: checkBiomeInk builds
// its reachability set from ink.mjs's own FRONTIER_PATTERNS, so a second copy
// here would be a mapping this gate cannot see. One home, per the same rule
// that put `requires` and GENERATOR_VERSION in one place.
import { checkBiomeInk, frontierPattern } from "./ink.mjs";
import { GLYPHS, symbolDefs, glyphUse, checkGlyphCoverage } from "./glyphs.mjs";
import { RANKS, placeLabels, checkLabels } from "./labels.mjs";
import { bakedUnderlay } from "./texture-bake.mjs";

// The thirteen landmasses of content/world/manifest.json, in premise order.
// `id` is the sheet id, the SVG basename and the storybook row id — one string,
// three uses, so a rename is one edit. Titles are the premise `title` plus the
// structural idea, because a storybook card with a bare name teaches nothing.
export const CONTINENT_SHEETS = Object.freeze([
  { id: "rimewall-cap", continent: "c01", title: "Rimewall Cap — the ice divide" },
  { id: "wealdmarch",   continent: "c02", title: "Wealdmarch — the inland-sea basin" },
  { id: "coldreach",    continent: "c03", title: "Coldreach — one spine, one rain shadow" },
  { id: "stonemoor",    continent: "c04", title: "Stonemoor — the drowned karst plateau" },
  { id: "thirstwold",   continent: "c05", title: "Thirstwold — the rain-shadow erg" },
  { id: "reedstrand",   continent: "c06", title: "Reedstrand — the bird's-foot delta" },
  { id: "driftholt",    continent: "c07", title: "Driftholt — the fog forest" },
  { id: "wracklow",     continent: "c08", title: "Wracklow — the erosional coast" },
  { id: "brightfall",   continent: "c09", title: "Brightfall — the cliff-hung falls" },
  { id: "ashen-spar",   continent: "c10", title: "Ashen Spar — the volcanic arc" },
  { id: "quillreef",    continent: "c11", title: "Quillreef — the atoll ring" },
  { id: "skerryfast",   continent: "c12", title: "Skerryfast — the fjord skerries" },
  { id: "loamspit",     continent: "c13", title: "Loamspit — the sandbar chain" },
]);

const MAP_PX = 1400;          // the drawn square, before padding
const PAD = 46;
const MAX_PX_PER_KM = 24;     // a 12 km chain must not be drawn at 100 px/km
const LEGEND_TIER = 3;        // continent sheets carry the full legend

/** Dominant biome of a fabric region — the highest share, ties broken by name. */
function dominantBiome(shares) {
  let best = null;
  for (const [biome, share] of Object.entries(shares ?? {}))
    if (!best || share > best[1] || (share === best[1] && biome < best[0])) best = [biome, share];
  return best ? best[0] : null;
}

/** Axis-aligned bounds of every km point the sheet will draw. */
function bounds(rings) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings)
    for (const [x, y] of ring ?? []) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  return { minX, minY, maxX, maxY };
}

export function buildContinentSheet({ repoRoot, continent }) {
  const problems = [];
  const notes = [];
  const nn = String(continent ?? "").replace(/^c/, "");
  const resolvedPath = join(repoRoot, `content/world/resolved/continent-${nn}.json`);
  const fabricPath = join(repoRoot, `content/world/fabric/continent-${nn}.json`);
  const lexPath = join(repoRoot, "content/world/lexicon/landforms.json");
  for (const p of [resolvedPath, fabricPath, lexPath])
    if (!existsSync(p)) problems.push(`continent-sheet: ${p.replace(repoRoot + "/", "")} is missing`);
  if (problems.length) return { svg: "", notes, problems };

  let world, fabric, lexicon;
  try {
    world = JSON.parse(readFileSync(resolvedPath, "utf8"));
    fabric = JSON.parse(readFileSync(fabricPath, "utf8"));
    lexicon = JSON.parse(readFileSync(lexPath, "utf8"));
  } catch (e) {
    problems.push(`continent-sheet ${continent}: cannot read inputs: ${e.message}`);
    return { svg: "", notes, problems };
  }
  if (!world.coastline?.points) {
    problems.push(`continent-sheet ${continent}: resolved doc has no coastline.points`);
    return { svg: "", notes, problems };
  }
  // The builder contract is "never throw". A resolved doc missing one of the
  // array keys is a Plan D defect and must surface as a PROBLEM with the key
  // named, not as a TypeError three loops later.
  for (const k of ["zones", "towns", "camps", "roads", "landmarks", "dungeons", "instances", "terrainPatches"])
    if (!Array.isArray(world[k])) {
      problems.push(`continent-sheet ${continent}: resolved key "${k}" is not an array`);
      world[k] = [];
    }

  const meta = CONTINENT_SHEETS.find((s) => s.continent === continent);
  const biomeOf = new Map((fabric.regions ?? []).map((r) => [r.id, dominantBiome(r.biomeShares)]));

  // ---- frame: fit the drawn extent, never re-centre per element -------------
  const b = bounds([world.coastline.points, ...world.zones.map((z) => z.polygon)]);
  const spanKm = Math.max(b.maxX - b.minX, b.maxY - b.minY) || 1;
  const pxPerKm = Math.min(MAX_PX_PER_KM, r2(MAP_PX / spanKm));
  const drawnW = (b.maxX - b.minX) * pxPerKm, drawnH = (b.maxY - b.minY) * pxPerKm;
  const mapLeft = r2(PAD + (MAP_PX - drawnW) / 2 - b.minX * pxPerKm);
  const mapTop = r2(PAD + 40 + (MAP_PX - drawnH) / 2 - b.minY * pxPerKm);
  const { poly, smooth, X, Y } = createDraft({ pxPerKm, mapLeft, mapTop });
  const SHEET_W = MAP_PX + PAD * 2, SHEET_H = MAP_PX + PAD * 2 + 40 + 28;

  // ---- G-BIOME-INK: emit exactly what is referenced -------------------------
  const referenced = [];
  for (const z of world.zones)
    if (z.survey === "reported") referenced.push(frontierPattern(z.provenance));
  for (const row of LEGEND) if (row.tier <= LEGEND_TIER) referenced.push(row.pattern);
  const emitted = [...new Set(referenced)].sort();
  problems.push(...checkBiomeInk({ emittedIds: emitted, referencedIds: referenced, legendTier: LEGEND_TIER }));

  // ---- G-GLYPH: every named landform's type must have a drawn family --------
  const glyphInstances = [
    ...world.instances.map((i) => ({ glyph: i.glyph, at: i.at, size: 7 })),
    ...world.landmarks.filter((l) => l.glyph && l.at).map((l) => ({ glyph: l.glyph, at: l.at, size: 10 })),
  ].filter((g) => g.at);
  const usedGlyphs = [...new Set(glyphInstances.map((g) => g.glyph))].sort();
  const namedCounts = {};
  for (const row of lexicon) namedCounts[row.id] = 0;
  for (const l of world.landmarks) if (l.type && l.type in namedCounts) namedCounts[l.type] += 1;
  problems.push(...checkGlyphCoverage({ lexicon, namedCounts, emittedIds: usedGlyphs }));

  // ---- labels: the continent tier, rank 8 and below -------------------------
  const labels = [];
  for (const z of world.zones)
    if (z.survey === "surveyed" && z.labelAt)
      labels.push({ id: z.id, text: z.name, rank: RANKS.region, at: z.labelAt });
  for (const t of world.towns)
    labels.push({ id: t.id, text: t.name, at: t.at,
      rank: t.settlementRank === "capital" ? RANKS.capital
          : t.settlementRank === "hub" ? RANKS.hub : RANKS.village });
  for (const l of world.landmarks)
    if (l.at) labels.push({ id: l.id, text: l.name, rank: RANKS.namedLandform, at: l.at });
  for (const d of world.dungeons)
    if (d.at) labels.push({ id: d.id, text: d.name, rank: RANKS.dungeon, at: d.at });
  const frame = { x: PAD, y: PAD + 40, w: MAP_PX, h: MAP_PX };
  // placeLabels returns { id, x, y, anchor, box, size, text, leader? } and
  // deliberately does NOT return `rank` (Plan B Task 8, labels.mjs:3389-3441),
  // so the tier attribute is looked up here rather than read off the result.
  const rankById = new Map(labels.map((l) => [l.id, l.rank]));
  const { placed, dropped } = placeLabels({
    labels: labels.map((l) => ({ ...l, at: [X(l.at[0]), Y(l.at[1])] })),
    obstacles: [], maxLabelRank: 8, frame });
  problems.push(...checkLabels({ placed, dropped, tier: LEGEND_TIER }));

  // ---- the baked biome underlay, surveyed regions only ----------------------
  let underlay = "";
  try {
    underlay = bakedUnderlay({
      regions: world.zones.filter((z) => z.survey === "surveyed")
        .map((z) => ({ id: z.id, biome: biomeOf.get(z.id) ?? "meadow", ring: z.polygon })),
      pxPerKm });
  } catch (e) { problems.push(`continent-sheet ${continent}: bake failed: ${e.message}`); }

  notes.push(`continent ${continent} · ${meta ? meta.title : "(unregistered)"}`);
  notes.push(`regions ${world.zones.length} surveyed ${world.zones.filter((z) => z.survey === "surveyed").length}`);
  notes.push(`instances ${world.instances.length} · named ${world.landmarks.length} · towns ${world.towns.length}`);
  notes.push(`labels ${labels.length} placed ${placed.length} dropped ${dropped.length}`);
  notes.push(`scale ${pxPerKm} px/km over ${r2(spanKm)} km`);

  // ---- draw ----------------------------------------------------------------
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${SHEET_H}" viewBox="0 0 ${SHEET_W} ${SHEET_H}" role="img" aria-label="${esc(meta ? meta.title : continent)}">`);
  o.push(`<title>${esc(meta ? meta.title : continent)}</title>`);
  o.push(`<desc>Drawn by tools/mapforge/render-sheet.mjs from content/world/resolved/continent-${nn}.json. Surveyed regions carry biome ink; reported regions carry the provenance hatch and no terrain claim.</desc>`);
  o.push("<defs>");
  o.push(patternDefs({ ids: emitted }));
  o.push(symbolDefs({ ids: usedGlyphs }));
  o.push("</defs>");
  o.push(`<style>text { font-family: Georgia, "Iowan Old Style", "Times New Roman", serif; fill: ${C.ink}; }
  .lbl { paint-order: stroke fill; stroke: ${C.parchment}; stroke-width: 3.4px; stroke-linejoin: round; }</style>`);
  o.push(`<rect width="${SHEET_W}" height="${SHEET_H}" fill="${C.parchment}"/>`);
  o.push(`<text x="${PAD}" y="${PAD + 22}" font-size="22">${esc(meta ? meta.title : continent)}</text>`);

  // bakedUnderlay draws in km*pxPerKm from its own origin, so it is translated
  // by exactly the offsets createDraft's X/Y add — otherwise the ink sits a
  // continent's width away from the outlines it belongs to.
  o.push(`<g transform="translate(${mapLeft} ${mapTop})">${underlay}</g>`);
  for (const z of world.zones)
    if (z.survey === "reported")
      o.push(`<path d="${poly(z.polygon)} Z" fill="url(#${frontierPattern(z.provenance)})" stroke="${C.inkSoft}" stroke-width="0.5"/>`);
  // terrainPatches are keyed by terrainKind, so they read FILL_FOR (draft.mjs:36)
  // — NOT BIOME_FILL, which Plan B adds for the 20 biomes. The two namespaces
  // are distinct and mixing them is the terrain-kind/landform-id conflation
  // the lexicon warns about.
  for (const tp of world.terrainPatches)
    o.push(`<path d="${poly(tp.polygon)} Z" fill="url(#${FILL_FOR[tp.terrainKind] ?? "pRock"})" fill-opacity="0.6" stroke="none"/>`);
  o.push(`<path d="${smooth(world.coastline.points, true)}" fill="none" stroke="${C.ink}" stroke-width="1.6"/>`);
  if (world.river) o.push(`<path d="${smooth(world.river.points)}" fill="none" stroke="${C.sea}" stroke-width="2.2"/>`);
  if (world.iceEdge) o.push(`<path d="${poly(world.iceEdge.points)}" fill="none" stroke="${C.inkSoft}" stroke-width="1.2" stroke-dasharray="6 4"/>`);
  if (world.saltmire) o.push(`<path d="${poly(world.saltmire.polygon)} Z" fill="url(#pMire)" stroke="${C.inkMid}" stroke-width="1.2" stroke-dasharray="3 3"/>`);
  // Roads carry a parchment casing under the ink line, exactly as
  // basin-sheet.mjs:320-330 draws them — the casing is what stops a road
  // disappearing into a hatched region.
  for (const road of world.roads) {
    const w = ROAD_W[road.weight] ?? 1.5;
    o.push(`<path d="${smooth(road.points)}" fill="none" stroke="${C.parchmentDeep}" stroke-width="${w + 3}" stroke-linecap="round"/>`);
    o.push(`<path d="${smooth(road.points)}" fill="none" stroke="${C.ink}" stroke-width="${w}" stroke-linecap="round"${road.dashed ? ' stroke-dasharray="7 6"' : ""}/>`);
  }

  o.push(`<g color="${C.inkMid}" fill="none" stroke="currentColor" stroke-width="0.9">`);
  for (const g of glyphInstances)
    o.push(glyphUse({ id: g.glyph, x: X(g.at[0]), y: Y(g.at[1]), size: g.size }));
  o.push("</g>");
  for (const t of world.towns)
    o.push(`<circle cx="${X(t.at[0])}" cy="${Y(t.at[1])}" r="${t.settlementRank === "capital" ? 5 : t.settlementRank === "hub" ? 3.5 : 2.2}" fill="${C.ink}"/>`);
  for (const p of placed) {
    if (p.leader)
      o.push(`<path d="M${p.leader[0][0]},${p.leader[0][1]} L${p.leader[1][0]},${p.leader[1][1]}" stroke="${C.inkSoft}" stroke-width="0.5" fill="none"/>`);
    o.push(`<text class="lbl" data-rank="${rankById.get(p.id)}" x="${p.x}" y="${p.y}" font-size="${p.size}">${esc(p.text)}</text>`);
  }

  let lx = PAD, ly = SHEET_H - 16;
  for (const row of LEGEND.filter((r) => r.tier <= LEGEND_TIER)) {
    o.push(`<rect x="${r2(lx)}" y="${r2(ly - 10)}" width="18" height="12" fill="url(#${row.pattern})" stroke="${C.inkSoft}" stroke-width="0.5"/>`);
    o.push(`<text x="${r2(lx + 22)}" y="${r2(ly)}" font-size="8" fill="${C.inkMid}">${esc(row.label)}</text>`);
    lx += 128;
    if (lx > SHEET_W - 130) { lx = PAD; ly += 14; }
  }
  o.push("</svg>");
  return { svg: o.join("\n") + "\n", notes, problems };
}
```

**Three facts this code depends on, each verified against the repo before it was written.** (1) `createDraft` already returns `{ X, Y, poly, smooth, lineLabel, towerGlyph }` (`tools/mapforge/lib/draft.mjs:324`), so `X`/`Y` need no change. (2) The palette at `draft.mjs:13-23` has exactly `parchment, parchmentDeep, sea, ink, ink2, inkMid, inkSoft, accent, accentSoft` — there is **no** `C.water` or `C.road`; water is `C.sea` and a road is a `C.parchmentDeep` casing under a `C.ink` line, which is why the road block copies `basin-sheet.mjs:320-330` rather than inventing a colour. (3) `ROAD_W = { trunk: 3.2, spur: 2.2, track: 1.5 }` (`draft.mjs:34`) is the width table, and the resolved road record carries `weight`, `dashed` and `points` (`content/maps/cluster1-geography.json#roads` is the shape Plan D's `PlaceRoad` preserves).

- [ ] **Step 4: Register the thirteen sheets**

In `tools/mapforge/render-sheet.mjs`, import the builder and generate the entries from the roster — thirteen hand-written blocks is thirteen chances for a typo:

```js
import { CONTINENT_SHEETS, buildContinentSheet } from "./lib/continent-sheet.mjs";
```
then, immediately after the `SHEETS` object literal:
```js
// Plan E Task 8 / spec §7.4: the continent zoom tier. One builder, thirteen
// entries, generated from the roster so a fourteenth landmass is one row.
for (const s of CONTINENT_SHEETS) {
  if (SHEETS[s.id]) throw new Error(`render-sheet: sheet id "${s.id}" is already registered`);
  SHEETS[s.id] = {
    title: s.title,
    outSvg: `game-client/assets/art/maps/${s.id}.svg`,
    outPng: `game-client/assets/art/maps/${s.id}.png`,
    maxLabelRank: 8,
    build: ({ repoRoot }) => buildContinentSheet({ repoRoot, continent: s.continent }),
  };
}
```

- [ ] **Step 5: Build all thirteen**

Run:
```bash
for s in rimewall-cap wealdmarch coldreach stonemoor thirstwold reedstrand driftholt \
         wracklow brightfall ashen-spar quillreef skerryfast loamspit; do
  node tools/mapforge/render-sheet.mjs --sheet "$s" --no-png || exit 1
done
ls -la game-client/assets/art/maps/*.svg | wc -l
```
Expected: thirteen builds, each printing its five `notes` lines and an **empty** `PROBLEMS` block; 18 SVGs on disk. A `G-BIOME-INK`, `G-GLYPH` or `G-LABEL` problem here is a **Plan B defect surfacing on real density** — report it against Plan B Task 6/7/8 and do not hand-tune this sheet.

- [ ] **Step 6: Index them in the storybook**

Add thirteen rows to `tools/asset-storybook/maps-index.json`'s `sheets[]` array, in `CONTINENT_SHEETS` order after the five existing rows. `id`/`title`/`svg`/`png` must byte-match the registry. First row, as the pattern for the other twelve:

```json
    {
      "id": "wealdmarch",
      "title": "Wealdmarch — the inland-sea basin",
      "svg": "game-client/assets/art/maps/wealdmarch.svg",
      "png": "game-client/assets/art/maps/wealdmarch.png",
      "note": "The playable continent at basin scale: ten surveyed regions in full biome ink, twenty reported regions under the provenance hatch, the inland sea the Meltwash feeds with no ocean outlet, and every settlement, road and named landform the resolved join carries."
    },
```
Then run: `node --test 'tools/asset-storybook/tests/*.test.mjs'`

Expected: PASS with 18 rows. `maps-index.test.mjs:33-61` checks the correspondence in both directions, so a missing row and an invented row fail identically.

- [ ] **Step 7: Art manifest, license rows and thumbnails**

Add one `art:map-<id>` entry per continent to `game-client/assets/art/art-manifest.json`, modelled on the `art:map-atlas` block at `:517`. The `note` string is the same authored-vector declaration every map key carries — only the paths, title and description change:

```json
    "art:map-wealdmarch": {
      "group": "map",
      "title": "Wealdmarch — the inland-sea basin",
      "file": "maps/wealdmarch.png",
      "note": "AUTHORED VECTOR, NOT GENERATED. Drawn by tools/mapforge/render-sheet.mjs --sheet wealdmarch from content/world/resolved/continent-02.json; the SVG beside this PNG (maps/wealdmarch.svg) is the artifact, the PNG is a <=512px thumbnail of it for the storybook.",
      "description": "The playable continent at its own scale: ten surveyed regions in biome ink, twenty reported regions under the epistemic hatch, the inland sea with no ocean outlet, and the roads, settlements and named landforms the civil join binds to the fabric.",
      "tags": ["wealdmarch", "map", "continent", "authored-vector", "svg", "spine"],
      "source": "docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md",
      "gen": {
        "method": "authored-vector",
        "generated": false,
        "tool": "tools/mapforge/render-sheet.mjs",
        "input": "content/world/resolved/continent-02.json",
        "vector": "maps/wealdmarch.svg",
        "raster": "rsvg-convert -w 512",
        "deterministic": true,
        "width": 512,
        "note": "No model, no sampler, no seed — drawn from geometry. Re-run the tool to reproduce it byte-for-byte."
      }
    },
```
Then bake the thumbs and run the manifest gate:
```bash
for s in rimewall-cap wealdmarch coldreach stonemoor thirstwold reedstrand driftholt \
         wracklow brightfall ashen-spar quillreef skerryfast loamspit; do
  node tools/mapforge/render-sheet.mjs --sheet "$s" || exit 1
done
node scripts/bake_thumbnails.mjs --only maps
node scripts/check_asset_manifest.mjs
```
Expected: PASS. `bake_thumbnails.mjs` needs `sharp` from `scripts/` — run `npm ci --prefix scripts` first if it is missing. **CI never runs the bake, only the guard**, so a skipped bake reds CI rather than your laptop.

- [ ] **Step 8: Extend the lock — additions only**

Run:
```bash
node scripts/check_render_lock.mjs --write
git diff --stat content/world/render-lock.json
git diff content/world/render-lock.json | grep -c '^-[^-]' || echo "0 removed lines"
```
Expected: **26 added lines** (13 SVGs + 13 PNGs) and **zero** changed or removed lines. If an existing artifact's hash moved, a live sheet changed under a commit that was only supposed to add sheets — find it before continuing.

- [ ] **Step 9: Look at them**

```bash
open -a "Google Chrome" game-client/assets/art/maps/wealdmarch.svg \
  game-client/assets/art/maps/thirstwold.svg game-client/assets/art/maps/quillreef.svg
```
Judged against the written criteria, not taste: **no two labels overlap**; **surveyed and reported ground are distinguishable at a glance**, and the three hatch densities read as three; **the glyph field reads as many different marks**; **the legend explains every texture on the canvas**; and the smallest chain (`quillreef`) is legible rather than a dot in a field of parchment. A failure here is a real defect in Plan B Tasks 6–9 or in the scale rule at Step 3 — fix the module, never the sheet.

- [ ] **Step 10: Run the full suite and commit**

```bash
node --test 'tools/mapforge/tests/*.test.mjs'
node --test 'tools/asset-storybook/tests/*.test.mjs'
node scripts/check_render_lock.mjs --check
node scripts/check_content.mjs --only=spine 2>&1 | grep world-budget
(cd colyseus-server && npm test -- mapDimensions)
git add tools/mapforge/lib/continent-sheet.mjs tools/mapforge/tests/continent-sheet.test.mjs \
        tools/mapforge/render-sheet.mjs tools/asset-storybook/maps-index.json \
        game-client/assets/art/maps game-client/assets/art/art-manifest.json \
        game-client/assets/.thumbs content/world/render-lock.json
git commit -m "feat: the 13 continent sheets at the rank-8 zoom tier"
```
Expected: every command PASS; the `world-budget: sheets 18 files, <n> bytes (budget 18, 524288)` line inside its caps; the jest pin green (no runtime file is in this diff at all).

- [ ] **Step 11: Quality gate — verify**

Run: `node --test 'tools/mapforge/tests/continent-sheet.test.mjs' && ./scripts/integration.sh --no-install` and paste the output.

- [ ] **Step 12: Quality gate — independent adversarial review**

Fresh reviewer on `git show HEAD`, with three of the sheets open in Chrome, brief: *"(a) Is the scale rule honest — does `pxPerKm = min(24, MAP_PX / span)` make the small chains legible, or does it just draw them tiny in a huge frame? Compute the drawn extent of `quillreef` and `loamspit` and say what fraction of the canvas each fills. (b) Can `buildContinentSheet` throw for ANY input — a resolved doc with an empty `zones` array, a zone with a two-point polygon, a `null` `labelAt`, a landmark with no `glyph`? Construct each and run it. (c) The `data-rank` attribute is looked up from `rankById`, because `placeLabels` does not return a rank. Confirm every placed label resolves to a real rank — a `data-rank="undefined"` anywhere means an id diverged between the label list and the placer, and the tier test would then be asserting on nothing. (d) Are 18 sheets × their thumbnails inside `budgets.sheets`, and does the world-budget line report 18 rather than the spec's 16? (e) Does the reported hatch key on `zone.provenance` for every reported region, or does the `?? "pReported"` fallback quietly swallow a fabric that forgot to emit it? Count how many regions take the fallback."*

- [ ] **Step 13: Quality gate — refactor, re-verify, report**

Apply findings as a new commit (re-render and re-lock if any SVG byte changes), then: `node --test 'tools/mapforge/tests/continent-sheet.test.mjs' && node scripts/check_render_lock.mjs --check && git branch --show-current && git log --oneline -1`

---

### Task 9: Z2 in both directions, against the fabric

`Z2` today (`check_content.mjs:1034-1045`) iterates *the geography, not the files* — every zone the mirror declares needs exactly one `content/zones/zone-*.json` record. That is half a policy. Without the second rule, "40 written, 120 hatched" degrades into 160 thin stubs and the frontier stops meaning anything (R13). **A zone record on a `reported` region is a FAILURE, not a warning** — writing prose for unwalked ground is exactly the dishonesty the hatching exists to prevent.

This task must run **after** the redraw: before it, the fabric describes a world the spine has not adopted, and a fabric-keyed Z2 would demand 40 records against a 10-zone chart.

**Domain notes.** The zone record joins to the world by two new keys: `region` (the fabric region id, e.g. `"c02/r07"`) and `survey`. The fabric is the authority on survey status; the record's own `survey` is a **declaration** that must agree with it — a drift check, not a second source of truth. `Z6` is unchanged in mechanism: landmark names compare trimmed and case-insensitively across zones, and each zone's deduped resource-**kind set** must be globally unique against the closed 8-value enum at `check_content.mjs:918`.

**Files:**
- Modify: `scripts/check_content.mjs:940-1071` (`checkZoneContent`)
- Modify: `content/schemas/zone-content.schema.json:6-8` (add `region`, `survey` to the root `required` array at `:6` and the root `properties` block at `:8`)
- Modify: `content/zones/zone-*.json` (the 10 existing records gain `region` + `survey`)
- Modify: `scripts/tests/zone-content.test.mjs:334-370,483,493,507` (the `allZones`/`fixture` builders gain the two keys, the fixture root at `:355` moves off the deleted mirror, and the three literal expectations move with the gate messages; new both-direction tests)
- Test: `scripts/tests/zone-content.test.mjs`

**Interfaces:**
- Consumes: `loadFabricRegionIndex({contentRoot})` from Task 2; `loadPlaces({contentRoot})` from Plan A (rerouted to `content/world/resolved/` by Plan D).
- Produces: the `region` + `survey` join keys on `zone-content.schema.json`, and the two Z2 failure strings.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/zone-content.test.mjs` (reusing its existing `zoneRecord(id)` helper and fixture-root builders — do **not** reinvent them):

```js
// ── Plan E: Z2 in both directions ─────────────────────────────────────────
// The fabric is the authority on survey status. A record's own `survey` is a
// declaration checked against it, never a second source of truth.

function fabricRoot({ regions }) {
  const dir = mkdtempSync(join(tmpdir(), "z2-"));
  mkdirSync(join(dir, "world/fabric"), { recursive: true });
  mkdirSync(join(dir, "zones"), { recursive: true });
  mkdirSync(join(dir, "schemas"), { recursive: true });
  cpSync(SCHEMA_PATH, join(dir, "schemas/zone-content.schema.json"));
  writeFileSync(join(dir, "world/fabric/continent-02.json"),
    JSON.stringify({ continent: "c02", regions }));
  return dir;
}
function writeZone(dir, id, extra) {
  writeFileSync(join(dir, `zones/zone-${id}.json`),
    JSON.stringify({ ...zoneRecord(id), ...extra }));
}
function gate(dir) {
  try {
    return execFileSync("node", [GATE, "--content-root", dir],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) { return `${e.stdout ?? ""}${e.stderr ?? ""}`; }
}

test("Z2 forward: a surveyed fabric region with no record FAILs", () => {
  const dir = fabricRoot({ regions: [
    { id: "c02/r01", survey: "surveyed" },
    { id: "c02/r02", survey: "surveyed" },
  ]});
  writeZone(dir, "thornveil", { region: "c02/r01", survey: "surveyed" });
  assert.match(gate(dir),
    /zones: surveyed region "c02\/r02" has no record in content\/zones\//);
});

test("Z2 reverse: a record on a REPORTED region FAILs, and says why", () => {
  const dir = fabricRoot({ regions: [
    { id: "c02/r01", survey: "surveyed" },
    { id: "c02/r02", survey: "reported" },
  ]});
  writeZone(dir, "thornveil", { region: "c02/r01", survey: "surveyed" });
  writeZone(dir, "emberdown", { region: "c02/r02", survey: "reported" });
  assert.match(gate(dir),
    /zones: zone record "emberdown" is on a reported region — writing prose for unwalked ground is exactly the dishonesty the hatching prevents/);
});

test("Z2 drift: a record whose declared survey disagrees with the fabric FAILs", () => {
  const dir = fabricRoot({ regions: [{ id: "c02/r01", survey: "reported" }] });
  writeZone(dir, "thornveil", { region: "c02/r01", survey: "surveyed" });
  assert.match(gate(dir),
    /zones: zone record "thornveil" declares survey "surveyed" but fabric region "c02\/r01" is "reported"/);
});

test("Z2: a record naming a region no fabric declares FAILs", () => {
  const dir = fabricRoot({ regions: [{ id: "c02/r01", survey: "surveyed" }] });
  writeZone(dir, "thornveil", { region: "c02/r01", survey: "surveyed" });
  writeZone(dir, "ghost", { region: "c02/r99", survey: "surveyed" });
  assert.match(gate(dir),
    /zones: zone record "ghost" names region "c02\/r99", which no fabric file declares/);
});

test("Z2: a complete surveyed set with no reported records passes", () => {
  const dir = fabricRoot({ regions: [
    { id: "c02/r01", survey: "surveyed" },
    { id: "c02/r02", survey: "surveyed" },
    { id: "c02/r03", survey: "reported" },
  ]});
  writeZone(dir, "thornveil", { region: "c02/r01", survey: "surveyed" });
  writeZone(dir, "emberdown", { region: "c02/r02", survey: "surveyed" });
  const out = gate(dir);
  assert.doesNotMatch(out, /^zones: /m);
});

test("the schema requires both join keys", () => {
  const validate = compile();
  const doc = zoneRecord("thornveil");
  assert.equal(validate(doc), false, "a record with no region/survey must not validate");
  assert.ok(validate({ ...doc, region: "c02/r01", survey: "surveyed" }));
  assert.equal(validate({ ...doc, region: "c02/r01", survey: "rumoured" }), false);
});

test("all 40 committed records carry a region and a survey", () => {
  const files = readdirSync(join(ROOT, "content/zones")).filter((f) => /^zone-.+\.json$/.test(f));
  assert.equal(files.length, 40);
  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(ROOT, "content/zones", f), "utf8"));
    assert.match(doc.region, /^c(0[1-9]|1[0-3])\/r\d{2}$/, `${f}: bad region id`);
    assert.equal(doc.survey, "surveyed", `${f}: a committed record may only sit on surveyed ground`);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test 'scripts/tests/zone-content.test.mjs'`

Expected: FAIL on every new test — the gate does not yet read the fabric and the schema has no `region`/`survey`.

- [ ] **Step 3: Add the join keys to the schema**

In `content/schemas/zone-content.schema.json`, change `"required"` from:
```json
  "required": ["zone", "reasonToGo", "hazards", "resources", "landmarks"],
```
to
```json
  "required": ["zone", "region", "survey", "reasonToGo", "hazards", "resources", "landmarks"],
```
and add to `"properties"`, immediately after `"zone"`:
```json
    "region": { "type": "string", "pattern": "^c(0[1-9]|1[0-3])/r[0-9]{2}$" },
    "survey": { "enum": ["surveyed", "reported"] },
```
Note the deliberate asymmetry, and record it in the schema's `description`: `survey` **allows** `"reported"` here so that the gate rule that fails on it stays reachable. Duplicating the ban into the schema would make the Z-rule dead code — the discipline `zone-content.schema.json`'s own description already states and `town-plan.test.mjs:105-118` enforces.

- [ ] **Step 4: Rewrite Z2**

In `scripts/check_content.mjs`, replace the geography load at `:953-955`:

```js
  // REQUIRED once a zone file exists: Z1 and Z2 are both assertions against
  // the Cartographer's geography, which is the authority on which zones exist.
  const zones = loadGeographyZones(join(opts.contentRoot, "maps/cluster1-geography.json"));
  if (!zones) return 0;
```

(after Plan A this line already reads `loadPlaces({ contentRoot: opts.contentRoot })`) with:

```js
  // Plan E: the FABRIC is the authority on which ground exists and whether it
  // was walked. Z1 still checks the drawn world (a record must name a zone the
  // renderer knows), Z2 now checks the fabric in BOTH directions.
  const { doc: world } = loadPlaces({ contentRoot: opts.contentRoot });
  const zones = new Map((world?.zones ?? []).map((z) => [z.id, z]));
  const fabric = loadFabricRegionIndex({ contentRoot: opts.contentRoot });
  for (const p of fabric.problems) fail(p);
  if (!zones.size && !fabric.byRegionId.size) return 0; // soft-skip: neither layer present
```

Then replace the Z2 block at `:1034-1045`:

```js
  for (const [zone, group] of findDuplicateGroups(records, (r) => r.doc.zone))
    fail(`zones: zone "${zone}" has ${group.length} records (${group.map((r) => r.file).sort().join(", ")})`);

  // Iterates the geography, NOT the files: the whole point of Z2 is the zone
  // that was never written.
  const covered = new Set(records.map((r) => r.doc.zone));
  for (const id of zones.keys())
    if (!covered.has(id)) fail(`zones: geography zone "${id}" has no record in content/zones/`);
```

with:

```js
  for (const [zone, group] of findDuplicateGroups(records, (r) => r.doc.zone))
    fail(`zones: zone "${zone}" has ${group.length} records (${group.map((r) => r.file).sort().join(", ")})`);

  // ── Z2, BOTH DIRECTIONS (plan E / spec §9.5) ─────────────────────────────
  // Direction 1 unchanged in spirit: iterate the GROUND, not the files — the
  // whole point of Z2 is the region that was never written. The authority
  // moved from the retired mirror to content/world/fabric/, and it now filters
  // on survey: a reported region needs no prose.
  //
  // Direction 2 is new and is the half that makes "40 written, 120 hatched" a
  // policy instead of a hope. Without it the frontier erodes into 160 thin
  // stubs (R13). It is a FAIL, never a warning.
  const coveredRegions = new Map();
  for (const r of records) {
    const declared = r.doc.survey;
    const region = r.doc.region;
    const known = fabric.byRegionId.get(region);
    if (!known) {
      fail(`zones: zone record "${r.doc.zone}" names region "${region}", which no fabric file declares`);
      continue;
    }
    if (known.survey !== declared)
      fail(`zones: zone record "${r.doc.zone}" declares survey "${declared}" but fabric region "${region}" is "${known.survey}"`);
    if (known.survey === "reported")
      fail(`zones: zone record "${r.doc.zone}" is on a reported region — writing prose for unwalked ground is exactly the dishonesty the hatching prevents`);
    coveredRegions.set(region, r);
  }
  for (const [id, meta] of fabric.byRegionId)
    if (meta.survey === "surveyed" && !coveredRegions.has(id))
      fail(`zones: surveyed region "${id}" has no record in content/zones/`);
```

- [ ] **Step 5: Add the two join keys to the 10 existing records**

Each of the 10 committed records gains two lines, taken from the allocation table produced in Task 10 (run Task 10 first if it is not yet merged — this step depends only on its `region` column). Example, `content/zones/zone-thornveil.json`:

```json
{
  "zone": "thornveil",
  "region": "c02/r04",
  "survey": "surveyed",
  "reasonToGo": "The one ground no road overlooks, ...",
```
Nothing else in any of the 10 changes: `reasonToGo`, `hazards`, `resources` and `landmarks` are hand-written prose and must survive the redraw byte-identical. That preservation is D1 default (a) paying for itself.

- [ ] **Step 6: Run the tests**

Run:
```bash
node --test 'scripts/tests/zone-content.test.mjs'
node scripts/check_content.mjs --require-complete 2>&1 | grep "^zones:" | head -40
```
Expected: the fixture tests PASS. `check_content` prints **30 `zones: surveyed region "..." has no record` failures** — one per unwritten surveyed region. That list is the work order for Tasks 10 and 11 and is the honest state of the world until they land.

- [ ] **Step 7: Commit**

```bash
git add scripts/check_content.mjs content/schemas/zone-content.schema.json \
        content/zones scripts/tests/zone-content.test.mjs
git commit -m "feat: Z2 fails in both directions against the fabric"
```

- [ ] **Step 8: Quality gate — verify**

Run: `node --test 'scripts/tests/zone-content.test.mjs' && ./scripts/precheck.sh --no-install` and paste the output. Gate 1 does not run `checkZoneContent` (it is a full-sweep check, not `--only=spine`), so precheck must be **green** even with 30 outstanding zone failures. Gate 2 will be red until Task 14 lands — say so in the phase report rather than papering over it.

- [ ] **Step 9: Quality gate — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`, brief: *"(a) Can the soft-skip (`!zones.size && !fabric.byRegionId.size`) let a real content root disable Z2 entirely? Name the tree that does it. (b) Is the record's `survey` field load-bearing anywhere, or is it pure redundancy that will rot? Argue both sides. (c) `Z1` and `Z2` now read two different authorities (`loadPlaces` and the fabric) — can they disagree, and what happens when they do? (d) Does the schema's `pattern` on `region` reject a legal id the generator can emit?"*

- [ ] **Step 10: Quality gate — refactor, re-verify, report**

Apply findings, then: `node --test 'scripts/tests/zone-content.test.mjs' && git branch --show-current && git log --oneline -1`

---

### Task 10: The zone allocation table — solve the set-packing before writing a word

`Z6` requires every zone's deduped resource-**kind set** to be globally unique against a closed 8-value enum (`crop, timber, ore, fuel, stone, water, forage, salvage` — `check_content.mjs:918`), and every landmark name to be globally unique across zones, compared trimmed and case-insensitively. **That is a set-packing problem with 255 available sets, and it is the largest unlisted authoring cost in the whole programme (X5).** Discovering a collision on record 37 means rewriting the resources *and the prose that justifies them*. So the allocation is solved, committed and tested **first**.

**The arithmetic.** C(8,2) = 28 two-element sets, of which the 10 committed records already use these:

| Zone | Kind set |
|---|---|
| `ashvale-front` | crop, salvage |
| `cindervast` | fuel, salvage |
| `emberdown` | crop, fuel |
| `gildmark-head` | salvage, stone |
| `hollowmarch` | ore, timber |
| `meltwash-terrace` | forage, water |
| `millcross-ford` | crop, stone |
| `northern-icefield` | stone, water |
| `rooktide-reach` | forage, salvage |
| `thornveil` | timber, water |

18 two-element sets remain free; 30 more zones need sets, so 18 pairs + 12 triples closes it with 44 sets still spare. **No committed record's resources change** — that would rewrite shipped prose for nothing.

**Files:**
- Create: `docs/worldbuilding/A4-zone-allocation.md`
- Create: `scripts/tests/zone-allocation.test.mjs`
- Test: `scripts/tests/zone-allocation.test.mjs`

**Interfaces:**
- Consumes: `content/world/fabric/continent-NN.json` region ids and `survey` values (Plan C, post-redraw); `content/world/names/registers.json` and `content/world/names/reserved.json` (Plan D) for the landmark-name register discipline.
- Produces: `docs/worldbuilding/A4-zone-allocation.md` — the committed 40-row table Tasks 10 and 11 write from, and the only place a zone's kind set and landmark names are chosen.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/zone-allocation.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TABLE = join(ROOT, "docs/worldbuilding/A4-zone-allocation.md");
const KINDS = ["crop", "timber", "ore", "fuel", "stone", "water", "forage", "salvage"];

/** Parse the one GFM table in A4. Columns: zone | continent | region | kinds | landmarks */
function rows() {
  const lines = readFileSync(TABLE, "utf8").split("\n")
    .filter((l) => /^\|/.test(l) && !/^\|\s*-+/.test(l));
  const out = [];
  for (const l of lines.slice(1)) {                       // slice(1) drops the header row
    const c = l.split("|").slice(1, -1).map((s) => s.trim().replace(/`/g, ""));
    if (c.length !== 5) continue;
    out.push({ zone: c[0], continent: c[1], region: c[2],
               kinds: c[3].split(",").map((s) => s.trim()).filter(Boolean),
               landmarks: c[4].split(" / ").map((s) => s.trim()).filter(Boolean) });
  }
  return out;
}

test("the table holds exactly 40 rows — one per surveyed region", () => {
  assert.equal(rows().length, 40);
});

test("every kind comes from the closed 8-value enum", () => {
  for (const r of rows())
    for (const k of r.kinds)
      assert.ok(KINDS.includes(k), `${r.zone}: "${k}" is not a resource kind`);
});

test("every kind set is globally unique — this is Z6's set-packing, solved", () => {
  const seen = new Map();
  for (const r of rows()) {
    const key = [...new Set(r.kinds)].sort().join(",");
    assert.ok(key.length, `${r.zone}: empty kind set`);
    assert.equal(seen.get(key), undefined,
      `${r.zone} and ${seen.get(key)} share the kind set (${key}) — Z6 fails on this`);
    seen.set(key, r.zone);
  }
});

test("every landmark name is globally unique, trimmed and case-insensitive — Z6's other half", () => {
  const seen = new Map();
  for (const r of rows()) {
    assert.ok(r.landmarks.length >= 2, `${r.zone}: Z3 needs at least 2 landmarks`);
    for (const name of r.landmarks) {
      const key = name.trim().toLowerCase();
      assert.equal(seen.get(key), undefined,
        `"${name}" is used by both ${r.zone} and ${seen.get(key)} — Z6 fails on this`);
      seen.set(key, r.zone);
    }
  }
});

test("the ten committed records keep their exact kind sets and landmark names", () => {
  const byZone = new Map(rows().map((r) => [r.zone, r]));
  for (const f of readdirSync(join(ROOT, "content/zones")).filter((n) => /^zone-.+\.json$/.test(n))) {
    const doc = JSON.parse(readFileSync(join(ROOT, "content/zones", f), "utf8"));
    const row = byZone.get(doc.zone);
    assert.ok(row, `${doc.zone} is committed but absent from A4`);
    assert.deepEqual([...new Set(doc.resources.map((r) => r.kind))].sort(),
      [...new Set(row.kinds)].sort(), `${doc.zone}: A4 disagrees with the committed record`);
    for (const l of doc.landmarks)
      assert.ok(row.landmarks.some((n) => n.toLowerCase() === l.name.trim().toLowerCase()),
        `${doc.zone}: committed landmark "${l.name}" is missing from A4`);
  }
});

test("every row names a surveyed region a fabric file actually declares", () => {
  const dir = join(ROOT, "content/world/fabric");
  if (!existsSync(dir)) return; // pre-redraw: nothing to join against yet
  const survey = new Map();
  for (const f of readdirSync(dir).filter((n) => /^continent-\d+\.json$/.test(n)))
    for (const r of JSON.parse(readFileSync(join(dir, f), "utf8")).regions)
      survey.set(r.id, r.survey);
  for (const r of rows()) {
    assert.equal(survey.get(r.region), "surveyed",
      `${r.zone}: region ${r.region} is ${survey.get(r.region) ?? "absent"}, not surveyed`);
  }
  assert.equal([...survey.values()].filter((s) => s === "surveyed").length, 40);
});

test("the per-continent distribution matches E-C5", () => {
  const want = { "Wealdmarch": 10, "Coldreach": 6, "Stonemoor": 7, "Thirstwold": 7,
                 "Reedstrand": 3, "Driftholt": 3, "Wracklow": 2, "Brightfall": 1,
                 "Ashen Spar": 1 };
  const got = {};
  for (const r of rows()) got[r.continent] = (got[r.continent] ?? 0) + 1;
  assert.deepEqual(got, want);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test 'scripts/tests/zone-allocation.test.mjs'`

Expected: FAIL — `ENOENT ... docs/worldbuilding/A4-zone-allocation.md`.

- [ ] **Step 3: Write `docs/worldbuilding/A4-zone-allocation.md`**

The kind-set column below is **fixed and complete** — it is the solved set-packing and must be transcribed exactly. The `region` column is filled from the fabric after the redraw (`node -e` over `content/world/fabric/continent-NN.json`, taking the surveyed region ids in file order). The `landmarks` column is authored here, two names per zone, from the landmass's register with a classifier from the type's set, checked against `content/world/names/reserved.json`.

```markdown
# A4 — Zone allocation

**Why this file exists.** `Z6` (`scripts/check_content.mjs:1047-1071`) requires every zone's
deduped resource-**kind set** to be globally unique against a closed 8-value enum, and every
landmark name to be globally unique across all zones, compared trimmed and case-insensitively.
With 40 zones and 255 non-empty sets that is a set-packing problem, and discovering a collision
on record 37 means rewriting the resources *and* the prose that justifies them. So the allocation
is solved here first and gated by `scripts/tests/zone-allocation.test.mjs`.

**Rules.**
1. The ten records committed before the redraw keep their exact kind sets and landmark names.
   Nothing about a shipped record changes; only its `region` and `survey` join keys are added.
2. Every kind comes from `crop, timber, ore, fuel, stone, water, forage, salvage` and nowhere else.
3. Two-element sets are spent before any three-element set, so the cheap space stays legible.
4. Landmark names come from the landmass's register in `content/world/names/registers.json`
   and are checked against `content/world/names/reserved.json` — a re-seed may never re-mint a
   canon name onto a different place.
5. Per-continent counts follow plan E-C5: Wealdmarch 10, Coldreach 6, Stonemoor 7, Thirstwold 7,
   Reedstrand 3, Driftholt 3, Wracklow 2, Brightfall 1, Ashen Spar 1 = 40. The polar cap and the
   four remaining chains carry **zero** surveyed ground — honest frontier, end to end.

| zone | continent | region | kinds | landmarks |
| --- | --- | --- | --- | --- |
| meltwash-terrace | Wealdmarch | c02/r01 | forage, water | The expedition camp / The gravel bars |
| millcross-ford | Wealdmarch | c02/r02 | crop, stone | The cart queue / The mill-wheel housing |
| rooktide-reach | Wealdmarch | c02/r03 | forage, salvage | The barge-cranes / The rook flats |
| thornveil | Wealdmarch | c02/r04 | timber, water | The heartwood / The crown thickets |
| emberdown | Wealdmarch | c02/r05 | crop, fuel | The terraced ledges / The adits |
| gildmark-head | Wealdmarch | c02/r06 | salvage, stone | The mirror tower / The mire's bar |
| hollowmarch | Wealdmarch | c02/r07 | ore, timber | The tally boards / The palisade line |
| ashvale-front | Wealdmarch | c02/r08 | crop, salvage | The grave rows / The abandoned cut lines |
| northern-icefield | Wealdmarch | c02/r09 | stone, water | The oath-gate / The crevasse shelf |
| cindervast | Wealdmarch | c02/r10 | fuel, salvage | The Giving King statues / The dead gate |
| tallowquay-roads | Coldreach | c03/r01 | crop, forage | The Tallow Stair / The Warping Posts |
| spinefoot | Coldreach | c03/r02 | crop, ore | The Lodeway Cut / The Cairn Scree |
| peatrun-mouth | Coldreach | c03/r03 | crop, timber | The Peat Bar / The Dark Stain |
| rainshadow-lee | Coldreach | c03/r04 | crop, water | The Empty Sound / The Bone Hedge |
| coldreach-shelf | Coldreach | c03/r05 | forage, fuel | The Haulover / The Frost Ness |
| longskyline | Coldreach | c03/r06 | forage, ore | The One Skyline / The Storm Notch |
| netstead-bight | Stonemoor | c04/r01 | forage, stone | The Shale Mole / The Bight Beacons |
| drowned-pavement | Stonemoor | c04/r02 | forage, timber | The Clint Reef / The Grike Channels |
| slateflow-sink | Stonemoor | c04/r03 | fuel, ore | The Slateflow Swallow / The Dry Bed |
| fenster-clints | Stonemoor | c04/r04 | fuel, stone | The Fenster Window / The Rake Path |
| polje-lake | Stonemoor | c04/r05 | fuel, timber | The Polje Shore / The Drowned Meadow |
| cenote-stair | Stonemoor | c04/r06 | fuel, water | The Cut Steps / The Water Table |
| pavement-edge | Stonemoor | c04/r07 | ore, salvage | The Limestone Brink / The Karn Marker |
| sandtongue-strand | Thirstwold | c05/r01 | ore, stone | The Glass Beach / The Wind Ripple |
| one-wet-strip | Thirstwold | c05/r02 | ore, water | The Living Strip / The Spring Head |
| erg-margin | Thirstwold | c05/r03 | salvage, timber | The Barchan Front / The Last Well |
| yardang-fields | Thirstwold | c05/r04 | salvage, water | The Yardang Combs / The Wind-Cut Ridge |
| dry-wadi | Thirstwold | c05/r05 | stone, timber | The Flood Marks / The Undercut Bank |
| mirage-flats | Thirstwold | c05/r06 | crop, forage, fuel | The Sabkha Pan / The False Water |
| scarp-shade | Thirstwold | c05/r07 | crop, forage, ore | The Scarp Shadow / The Noon Camp |
| reed-lobes | Reedstrand | c06/r01 | crop, fuel, stone | The Osier Beds / The Lobe Channels |
| lagoon-crescent | Reedstrand | c06/r02 | crop, ore, timber | The Crescent Bar / The Bittern Reach |
| birdsfoot-mouth | Reedstrand | c06/r03 | crop, stone, water | The Silt Fingers / The Alder Eyot |
| fogforest-slope | Driftholt | c07/r01 | forage, fuel, water | The Drip Line / The Moss Ladder |
| drip-terraces | Driftholt | c07/r02 | forage, ore, stone | The Terrace Steps / The Fog Ceiling |
| windward-crown | Driftholt | c07/r03 | forage, timber, water | The Crown Gap / The Wet Face |
| stack-coast | Wracklow | c08/r01 | fuel, ore, salvage | The Standing Stacks / The Geo Throat |
| blowhole-shelf | Wracklow | c08/r02 | fuel, stone, timber | The Blowhole Field / The Wrack Line |
| cliffhang-falls | Brightfall | c09/r01 | ore, salvage, water | The Hanging Fall / The Spray Ledge |
| cone-line | Ashen Spar | c10/r01 | salvage, stone, timber | The Cone Row / The Tube Mouth |
```

**How these 60 were minted, so a re-mint reproduces them.** Each name is `The <register stem> <classifier>`, the stem taken from its landmass's `onsets`/`rimes` in `content/world/names/registers.json` (Plan D Task 3) and the classifier from the zone's dominant landform group in `content/world/names/classifiers.json`. Register assignment follows `registers.json`'s `continentRegister` map: `c03` → `north-log`, `c04` → `moorstone`, `c05` and `c10` → `sandtongue`, `c06`–`c09` → `reedspeech`. The ten Wealdmarch rows are the committed records' own landmark names, transcribed verbatim and never re-minted.

Five collisions were resolved during minting and are recorded so nobody re-introduces them:
- Coldreach `The Dry Sound` → **`The Empty Sound`** — `Dry Sound` and `Dark Stain` share initial /d/, are both two syllables, and differ by one character in length.
- Stonemoor `The Shaft Steps` → **`The Cut Steps`** — `Shaft Steps` and `Shale Mole` share initial /ʃ/ and both are two syllables at 11 and 10 characters (a length difference of 1), which is exactly `G-NAME-SOUND`'s confusability rule.
- Stonemoor `The Winter Lake` → **`The Drowned Meadow`** — `Winter Lake` and `Water Table` share initial /w/ at the same syllable count and equal length.
- Thirstwold `The Green Line` → **`The Living Strip`**, and `The Scoured Ridge` → **`The Wind-Cut Ridge`** — `Green Line`/`Glass Beach` and `Scoured Ridge`/`Scarp Shadow` were each an initial-phoneme + syllable-count pair inside one landmass.

`The Drowned Stair` is deliberately **not** used here: it is Plan D's bound record `c-lm-the-drowned-stair` and therefore sits in `content/world/names/reserved.json` as a hard exclusion.

- [ ] **Step 4: Run the constraint check over the filled table**

The names above are complete; this step proves it rather than authoring it. If a later fabric run changes a zone's dominant landform group, re-mint only that row and re-run — the rules are:
- **No register leakage.** A Stonemoor landmark uses `moorstone` onsets and rimes; a Thirstwold one uses `sandtongue`. Coldreach and the northern chains use `north-log`; the deltas, fog forests and reefs use `reedspeech`.
- **No sound confusability inside one landmass.** Pairwise phoneme-Levenshtein ≥ 3, and no two names sharing both initial phoneme and syllable count when their lengths differ by ≤ 1.

Run: `node --test 'scripts/tests/zone-allocation.test.mjs'`

Expected: PASS on all seven tests — 40 rows, every kind from the closed enum, 40 distinct kind sets, **80 distinct landmark names**, the ten committed records unchanged, every region surveyed, and the E-C5 per-continent distribution. The `every row names a surveyed region a fabric file actually declares` test also proves the fabric really holds exactly 40 surveyed regions.

- [ ] **Step 5: Commit**

```bash
git add docs/worldbuilding/A4-zone-allocation.md scripts/tests/zone-allocation.test.mjs
git commit -m "docs: zone allocation table, Z6 set-packing solved"
```

- [ ] **Step 6: Quality gate — verify**

Run: `node --test 'scripts/tests/zone-allocation.test.mjs' && npm test --prefix scripts` and paste the output.

- [ ] **Step 7: Quality gate — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`, brief: *"(a) Does the table's parser in the test silently drop a malformed row instead of failing on it? A dropped row means a zone with no allocation goes unnoticed. (b) Are any two landmark names confusable in the way the spec's `G-NAME-SOUND` describes, even though they are technically distinct? Check within each continent. (c) Do the 12 three-element sets waste a scarce resource — would a different packing leave more room for the 7 deferred town plans' zones (E-C9)? (d) Does any new zone id collide with a committed spine node slug, a landform type id or a `region-*` story id?"*

- [ ] **Step 8: Quality gate — refactor, re-verify, report**

Apply findings, then: `node --test 'scripts/tests/zone-allocation.test.mjs' && git branch --show-current && git log --oneline -1`

---

### Task 11: 16 zone records — Wealdmarch (10) and Coldreach (6)

The 10 Wealdmarch records already exist and were re-joined in Task 9 Step 5; this task **verifies** them against the new ground and writes Coldreach's 6 from scratch. Doing one continent-and-a-half first is deliberate: the craft rules below are cheaper to correct across 6 records than across 30.

**Craft rules (from `story-content-writer`, distilled from the Undertow epic and F-033's finding that *adding specificity is the fastest way to contradict canon* — 4 of 6 defects in that pass came from added detail).**
1. **`reasonToGo` is one sentence and answers "what does a person walk in to take out again?"** Not scenery. Not history. A reason.
2. **Every hazard is a thing that happens to a body**, and it names its cost in the same sentence. An *absence* hazard (no water, no sightline) is legitimate and carries a `note` saying the runtime enum cannot express it — the Ashvale Front's defining hazard is an absence, which is why `effect` is optional and its omission is a WARN, not a FAIL (design D3).
3. **Resources name a kind from the closed enum and say who takes it and why.** The kind is fixed by A4; the prose justifies the kind, never the reverse.
4. **Landmarks are things a traveller sees and remembers**, named in the landmass register, with a `source` pointing at the worldbuilding doc that owns them where one exists.
5. **Do not add a fact canon does not carry.** If a zone needs a river, a road or a ruin, it must be in the fabric or the resolved join. Check before you write, not after.
6. **Cite in the section form** (`canon.md §4 "Geography & trade logic"`), never by line — G-CITE fails the line form and this prose is swept.

**Files:**
- Modify: `content/zones/zone-meltwash-terrace.json`, `zone-millcross-ford.json`, `zone-rooktide-reach.json`, `zone-thornveil.json`, `zone-emberdown.json`, `zone-gildmark-head.json`, `zone-hollowmarch.json`, `zone-ashvale-front.json`, `zone-northern-icefield.json`, `zone-cindervast.json`
- Create: `content/zones/zone-tallowquay-roads.json`, `zone-spinefoot.json`, `zone-peatrun-mouth.json`, `zone-rainshadow-lee.json`, `zone-coldreach-shelf.json`, `zone-longskyline.json`
- Test: `scripts/tests/zone-content.test.mjs` (existing; no new tests — the gate is the test)

**Interfaces:**
- Consumes: `docs/worldbuilding/A4-zone-allocation.md` (Task 10) for every zone's `region`, kind set and landmark names; the `Z1–Z7` rules in `checkZoneContent` (Task 9).
- Produces: nothing programmatic.

- [ ] **Step 1: Verify the 10 Wealdmarch records against the new ground**

Run:
```bash
node scripts/check_content.mjs --require-complete 2>&1 | grep -E "^zones:" | grep -vE "surveyed region .* has no record"
```
Expected: **empty**. Any failure here means a Wealdmarch record's `region` join is wrong, or a landmark that read as true on the old basin no longer does. Fix the join first; only re-voice prose if the *ground* changed (a river that no longer runs, a coast that moved) — and log each such re-voice in the phase report, because it is the meaning drift G-MEANING exists to surface.

- [ ] **Step 2: Write the first Coldreach record in full**

Create `content/zones/zone-tallowquay-roads.json`. This is the pattern for the other 35; every field below is mandatory and every rule above is visible in it.

```json
{
  "zone": "tallowquay-roads",
  "region": "c03/r01",
  "survey": "surveyed",
  "reasonToGo": "The only anchorage on this coast a laden hull can lie in through a gale, which is why everything Coldreach sends south is stacked on its quay before it is stacked on a ship.",
  "hazards": [
    {
      "id": "the-tallow-smoke",
      "name": "The tallow smoke",
      "description": "Rendering fires burn along the whole quay in the sailing season, and the smoke sits in the roads until the wind turns. A day in it leaves a man coughing for three.",
      "effect": "poison"
    },
    {
      "id": "no-lee-at-slack-water",
      "name": "No lee at slack water",
      "description": "Between tides the anchorage stops sheltering and starts collecting: a hull that has not warped in by then rides the swell against its own cables.",
      "note": "Absence hazard: the harm is what stops being there. Nothing in the runtime enum expresses a shelter that lapses."
    }
  ],
  "resources": [
    {
      "id": "quay-grain",
      "name": "Quay grain",
      "kind": "crop",
      "description": "Southbound grain broken out of Coldreach's inland stores and re-bagged on the quay, sold by the bag to anyone provisioning for the long lane."
    },
    {
      "id": "rock-samphire",
      "name": "Rock samphire",
      "kind": "forage",
      "description": "Cut from the splash zone under the quay wall and salted down in the same barrels the tallow comes out of — the only green thing a Coldreach crew eats at sea."
    }
  ],
  "landmarks": [
    {
      "id": "the-tallow-stair",
      "name": "The Tallow Stair",
      "description": "Sixty cut steps from the quay to the rendering yards, worn to a slope in the middle and greased black the whole sailing season.",
      "source": "docs/worldbuilding/A2-wider-world.md#2"
    },
    {
      "id": "the-warping-posts",
      "name": "The Warping Posts",
      "description": "Four iron-shod posts set in the rock at the head of the roads, and the only reason a hull that misses slack water is still there in the morning.",
      "source": "docs/worldbuilding/A2-wider-world.md#2"
    }
  ]
}
```

- [ ] **Step 3: Run the gate on the one record**

Run: `node scripts/check_content.mjs --require-complete 2>&1 | grep -E "tallowquay"`

Expected: **empty** apart from the pre-existing `surveyed region "c03/r02" has no record` line for the not-yet-written siblings. If `Z3` fires, you have fewer than 2 of something; if `Z6` fires, the record's kinds or landmark names disagree with A4 — fix the record, never A4.

- [ ] **Step 4: Write `zone-spinefoot.json` — c03/r02, crop + ore**

Ground: Coldreach's premise is **one unbroken spine ridge end to end, casting a hard rain shadow that dries the lee third** (spec §6.3). Spinefoot is the wet-side apron where the ridge meets workable ground — the only Coldreach region where ore and grain come off the same slope.

```json
{
  "zone": "spinefoot",
  "region": "c03/r02",
  "survey": "surveyed",
  "reasonToGo": "The ore comes down the same cut the grain goes up, so a season's metal and a season's bread are both weighed at the foot of the ridge and nowhere else on this coast.",
  "hazards": [
    { "id": "the-morning-slide", "name": "The morning slide",
      "description": "Meltwater loosens the scree above the cut overnight and lets it go with the first sun; a party on the path at dawn is a party under it.",
      "effect": "damage" },
    { "id": "the-cut-cold", "name": "The cut cold",
      "description": "The cut runs north and never takes the sun, so a man who stops moving in it stiffens before he notices he has stopped.",
      "effect": "freeze" }
  ],
  "resources": [
    { "id": "apron-barley", "name": "Apron barley", "kind": "crop",
      "description": "Short six-row barley grown on the wet apron in the ridge's lee-free strip, cut green and dried on the rock because the ground never dries." },
    { "id": "spine-ore", "name": "Spine ore", "kind": "ore",
      "description": "Banded ore prised out of the ridge foot where the rock has already broken itself, carried down by the sledge-load rather than mined." }
  ],
  "landmarks": [
    { "id": "the-lodeway-cut", "name": "The Lodeway Cut",
      "description": "A single graded cut climbing the ridge foot, wide enough for one sledge and worn to bare rock by four generations of them.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" },
    { "id": "the-cairn-scree", "name": "The Cairn Scree",
      "description": "A slope of loose plate stone with a line of cairns walked across it, each one rebuilt by whoever passes because the slope takes one every winter.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" }
  ]
}
```

- [ ] **Step 5: Write `zone-peatrun-mouth.json` — c03/r03, crop + timber**

Ground: `A2-wider-world.md` swears to exactly two facts about the Peatrun — **it is known only by its mouth, and by the peat-dark stain it pushes to sea.** Write the mouth; do not invent the upper river. This is the river's only surveyed reach.

```json
{
  "zone": "peatrun-mouth",
  "region": "c03/r03",
  "survey": "surveyed",
  "reasonToGo": "Every stick of timber Coldreach sends south is floated to this mouth and pulled out here, because it is the last place the Peatrun is shallow enough to stand in.",
  "hazards": [
    { "id": "the-stain-water", "name": "The stain water",
      "description": "The peat-dark outflow hides everything under a hand's depth, so a wader finds a sunken log with a shin rather than an eye.",
      "effect": "damage" },
    { "id": "no-bottom-you-can-read", "name": "No bottom you can read",
      "description": "The bar shifts with each spate and the old marks lie; a crew that trusts last season's line puts a laden raft on the ground at half tide.",
      "note": "Absence hazard: the harm is the missing information, not a thing in the water. Nothing in the runtime enum expresses a channel that has stopped being where it was." }
  ],
  "resources": [
    { "id": "floated-timber", "name": "Floated timber", "kind": "timber",
      "description": "Ridge pine cut upstream in winter and let go on the spate, caught at the mouth by a boom and hauled out log by log." },
    { "id": "mouth-oats", "name": "Mouth oats", "kind": "crop",
      "description": "Black oats grown on the silt the river lays behind the bar, the only crop on this coast that likes water it cannot see the bottom of." }
  ],
  "landmarks": [
    { "id": "the-peat-bar", "name": "The Peat Bar",
      "description": "The dark shoal across the mouth that every log fetches up against and every hull must be walked over.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" },
    { "id": "the-dark-stain", "name": "The Dark Stain",
      "description": "The plume of peat water the river pushes a full league out to sea, visible from a deck long before the coast is.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" }
  ]
}
```

- [ ] **Step 6: Write `zone-rainshadow-lee.json` — c03/r04, crop + water**

Ground: this region **is** the dried lee third of the premise. The scarcity is water, and the crop exists only because of where the water is caught.

```json
{
  "zone": "rainshadow-lee",
  "region": "c03/r04",
  "survey": "surveyed",
  "reasonToGo": "The only sweet water on the dry side of the ridge is caught here, and everything that lives in the lee comes to it or dies of not coming.",
  "hazards": [
    { "id": "the-long-dry", "name": "The long dry",
      "description": "The ridge takes the rain and gives nothing back for six weeks at a stretch; a traveller who plans on finding water between the catchments plans on not arriving.",
      "note": "Absence hazard: the harm is the water that is not there. The runtime enum has no type for a thing that fails to exist." },
    { "id": "the-fall-wind", "name": "The fall wind",
      "description": "Air that dumped its rain on the far slope comes over the crest dry and hot and does not stop for three days, and it takes the moisture out of a body the same way it took it out of the ground.",
      "effect": "burn" }
  ],
  "resources": [
    { "id": "catchment-water", "name": "Catchment water", "kind": "water",
      "description": "Rock-cut catchments under the crest that hold the little the lee gets, tallied by the bucket and defended by the household that cut them." },
    { "id": "lee-rye", "name": "Lee rye", "kind": "crop",
      "description": "Rye sown directly below a catchment and irrigated by hand, the only grain that comes off the dry third and the reason anyone lives on it." }
  ],
  "landmarks": [
    { "id": "the-empty-sound", "name": "The Empty Sound",
      "description": "A wide flat-bottomed valley that carries no river and never has, holding a road instead of a stream because the shape is the only thing the water left.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" },
    { "id": "the-bone-hedge", "name": "The Bone Hedge",
      "description": "A windbreak of dead standing pine, killed by the fall wind a lifetime ago and left where it stood because nothing else will grow there to replace it.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" }
  ]
}
```

- [ ] **Step 7: Write `zone-coldreach-shelf.json` — c03/r05, forage + fuel**

Ground: the shelf is the shallow seaward margin — the working sea-edge of a coast whose interior is a ridge. Fuel on this coast is peat and rendered oil, not wood; wood goes south.

```json
{
  "zone": "coldreach-shelf",
  "region": "c03/r05",
  "survey": "surveyed",
  "reasonToGo": "A hull can be dried out on the shelf at low water and worked on standing, which is why every Coldreach keel that needs a plank ends up here instead of on a slip.",
  "hazards": [
    { "id": "the-returning-tide", "name": "The returning tide",
      "description": "The shelf floods faster than a laden man walks and it floods from behind; the drownings here are all of people who were watching the wrong horizon.",
      "effect": "damage" },
    { "id": "the-standing-water-cold", "name": "The standing-water cold",
      "description": "Working knee-deep on the shelf for a tide takes the feeling out of a man's legs, and the feeling comes back badly or not at all.",
      "effect": "freeze" }
  ],
  "resources": [
    { "id": "shelf-weed", "name": "Shelf weed", "kind": "forage",
      "description": "Cut kelp raked off the shelf at low water, eaten in the hungry weeks and burned for its ash the rest of the year." },
    { "id": "shelf-peat", "name": "Shelf peat", "kind": "fuel",
      "description": "Hard black peat cut from the drowned bog the shelf exposes twice a month, the hottest and scarcest fuel on the coast." }
  ],
  "landmarks": [
    { "id": "the-haulover", "name": "The Haulover",
      "description": "A greased timber ramp across the narrowest point of the shelf, over which a small hull is dragged rather than sailed the long way round.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" },
    { "id": "the-frost-ness", "name": "The Frost Ness",
      "description": "The blunt headland that closes the shelf's north end and holds its rime a month after the rest of the coast has lost it.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" }
  ]
}
```

- [ ] **Step 8: Write `zone-longskyline.json` — c03/r06, forage + ore**

Ground: `A2-wider-world.md` swears that **the ridge is logged from open water as one unbroken skyline**. This region is the ridge itself, and the record must be written from a deck as much as from the ground — that is how the register knows it.

```json
{
  "zone": "longskyline",
  "region": "c03/r06",
  "survey": "surveyed",
  "reasonToGo": "The crest is the only place on Coldreach a body can see both coasts at once, which makes it worth the climb to anyone who needs to know what is coming before it arrives.",
  "hazards": [
    { "id": "the-whiteout", "name": "The whiteout",
      "description": "Cloud comes over the crest from the wet side without warning and takes the ground away as well as the view; parties on the ridge in it walk in circles or off it.",
      "effect": "stun" },
    { "id": "the-crest-cold", "name": "The crest cold",
      "description": "There is no shelter on the crest for its whole length, and a night caught on it is a night spent moving or a night not survived.",
      "effect": "freeze" }
  ],
  "resources": [
    { "id": "crest-lichen", "name": "Crest lichen", "kind": "forage",
      "description": "Grey rock lichen scraped off the crest stones and boiled twice to be edible, carried by anyone who expects to be up here longer than a day." },
    { "id": "crest-float", "name": "Crest float", "kind": "ore",
      "description": "Loose ore-bearing float weathered straight out of the crest and picked off the surface, the assay that tells the Lodeway Cut where to dig." }
  ],
  "landmarks": [
    { "id": "the-one-skyline", "name": "The One Skyline",
      "description": "The unbroken line of the ridge as it is logged from open water — no notch, no saddle, no gap for its whole length, which is the fact every Coldreach chart is built on.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" },
    { "id": "the-storm-notch", "name": "The Storm Notch",
      "description": "The single shallow dip in that line, invisible from the sea and the only place a body crosses the ridge without rope.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" }
  ]
}
```

- [ ] **Step 9: Verify the 16**

Run:
```bash
node scripts/check_content.mjs --require-complete 2>&1 | grep -E "^zones:" | tee /tmp/zones-red.txt
wc -l /tmp/zones-red.txt
node --test 'scripts/tests/zone-content.test.mjs'
node --test 'scripts/tests/zone-allocation.test.mjs'
```
Expected: `/tmp/zones-red.txt` holds exactly **24** lines, all of the form `surveyed region "..." has no record` — the remaining work in Tasks 12, 13 and 14. No `Z1`–`Z7` failure survives.

- [ ] **Step 10: Commit**

```bash
git add content/zones
git commit -m "content: zone records for Wealdmarch and Coldreach"
```

- [ ] **Step 11: Quality gate — verify**

Run: `node --test 'scripts/tests/zone-content.test.mjs' && node --test 'scripts/tests/zone-allocation.test.mjs'` and paste the output.

- [ ] **Step 12: Quality gate — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`, brief: *"Review this as an editor, not an engineer. (a) Does any record state a fact the fabric or the resolved join does not carry — a river, a road, a ruin, a settlement that is not there? Check each against `content/world/resolved/`. (b) Does any `reasonToGo` describe scenery instead of answering what a person takes out? (c) Are Coldreach's six records distinguishable from one another, or do they read as one region described six times? (d) Did any of the ten pre-existing records have its prose edited when only its join keys should have changed? `git diff` will show it."*

- [ ] **Step 13: Quality gate — refactor, re-verify, report**

Apply findings, then: `node --test 'scripts/tests/zone-content.test.mjs' && git branch --show-current && git log --oneline -1`

---

### Task 12: Stonemoor's seven zone records — the drowned karst plateau

Seven records on `c04`, register **moorstone**. **Stonemoor's structural idea is that sea level cuts *through* a limestone pavement** (spec §6.3), so its coast is fenster, cenote and sinking river rather than beach and headland, and its rivers end in the ground instead of in the sea. Write from that or the seven read as one moor described seven times.

**The craft rules are Task 11's** — `reasonToGo` answers what a person walks in to take out again; every hazard happens to a body and names its cost; the resource *kind* is fixed by A4 and the prose justifies it; landmarks are things a traveller remembers; add no fact the fabric does not carry; cite in the section form. They are not restated per record.

**Where a landmark's `source` points.** `docs/worldbuilding/A2-wider-world.md#3` already swears to Stonemoor's shore, the Slateflow and the moor's unsurveyed interior, so every landmark that is a coast or river fact cites it. A landmark that exists only because the fabric placed a `karst-cenote`, a `polje` or a `karst-fenster` instance cites `content/world/resolved/continent-04.json` — the join that put it there. Never cite a doc for a fact the doc does not carry; that is how the last four rounds of drift started.

**Before writing, read what the ground actually holds:**
```bash
node -e '
const r = require("./content/world/resolved/continent-04.json");
for (const z of r.zones.filter((z) => z.survey === "surveyed"))
  console.log(z.id, z.terrainKind, JSON.stringify(z.levelBand),
    "instances:", r.instances.filter((i) => i.region === z.id).map((i) => i.type).join(","));
'
```
A cenote in `cenote-stair` must be a `karst-cenote` instance the fabric placed. If it is not there, the zone name is wrong and the fix is in A4, not in the prose.

**Files:**
- Create: `content/zones/zone-netstead-bight.json`, `zone-drowned-pavement.json`, `zone-slateflow-sink.json`, `zone-fenster-clints.json`, `zone-polje-lake.json`, `zone-cenote-stair.json`, `zone-pavement-edge.json`
- Test: `scripts/tests/zone-content.test.mjs` (existing; the gate is the test)

**Interfaces:**
- Consumes: `docs/worldbuilding/A4-zone-allocation.md` rows `c04/r01`–`c04/r07` for every `region`, kind set and landmark name; the `Z1`–`Z7` rules in `checkZoneContent` (Task 9); `content/world/resolved/continent-04.json` for what is on the ground.
- Produces: nothing programmatic.

- [ ] **Step 1: `zone-netstead-bight.json` — c04/r01, forage + stone**

```json
{
  "zone": "netstead-bight",
  "region": "c04/r01",
  "survey": "surveyed",
  "reasonToGo": "Netstead is the only place on a pavement coast where a hull can be laid alongside instead of hauled out, so anything Stonemoor sells leaves from this one bight or does not leave.",
  "hazards": [
    { "id": "the-flooding-clints", "name": "The flooding clints",
      "description": "The bight's floor is pavement, and the tide comes up through the grikes as fast as it comes round the mole; a party working the low water is cut off from underneath before it is cut off from the sea.",
      "effect": "damage" },
    { "id": "no-holding-ground", "name": "No holding ground",
      "description": "There is nothing here for an anchor to bite — bare rock under two feet of silt — so a hull that is not made fast to the mole is a hull adrift by morning.",
      "note": "Absence hazard: the harm is what the seabed is not. Nothing in the runtime enum expresses ground that will not hold." }
  ],
  "resources": [
    { "id": "bight-cockles", "name": "Bight cockles", "kind": "forage",
      "description": "Raked out of the silt pockets between the clints at low water, the one food on this coast that does not have to be shipped in." },
    { "id": "mole-shale", "name": "Mole shale", "kind": "stone",
      "description": "Flat shale split off the bight's low cliff and barrowed straight onto the mole, which is rebuilt after every winter it survives." }
  ],
  "landmarks": [
    { "id": "the-shale-mole", "name": "The Shale Mole",
      "description": "A dry-laid mole of split shale running out to deep water, holed and rebuilt so often that no two courses of it are the same age.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" },
    { "id": "the-bight-beacons", "name": "The Bight Beacons",
      "description": "Two stone-cairn beacons on the north lip; kept in line, they carry a hull over the pavement bar, and lost, they put it on it.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" }
  ]
}
```

- [ ] **Step 2: `zone-drowned-pavement.json` — c04/r02, forage + timber**

```json
{
  "zone": "drowned-pavement",
  "region": "c04/r02",
  "survey": "surveyed",
  "reasonToGo": "The tideline here is limestone pavement rather than beach, and everything that lives in a grike — crab, herb, rooted oak — is reachable on foot for the four hours the sea allows it.",
  "hazards": [
    { "id": "the-grike-leg", "name": "The grike leg",
      "description": "The clints look like a floor and are not: the cracks between them run deeper than a man is tall and take a leg to the hip without warning.",
      "effect": "damage" },
    { "id": "the-blind-return", "name": "The blind return",
      "description": "The pavement floods evenly and from every side at once, so there is no line of water to walk away from — parties drown here facing the land.",
      "effect": "damage" }
  ],
  "resources": [
    { "id": "grike-herbs", "name": "Grike herbs", "kind": "forage",
      "description": "Sheltered growth taken out of the cracks — samphire, sorrel and wild thyme all in one hand's reach, because the grike keeps the salt wind off them." },
    { "id": "clint-oak", "name": "Clint oak", "kind": "timber",
      "description": "Stunted oak rooted in the grikes and cut in short crooked lengths, worthless as plank and the best knee-timber on the coast." }
  ],
  "landmarks": [
    { "id": "the-clint-reef", "name": "The Clint Reef",
      "description": "The outermost pavement, awash at every tide and level as a table, which is why the wrecks on it are all sitting upright.",
      "source": "content/world/resolved/continent-04.json" },
    { "id": "the-grike-channels", "name": "The Grike Channels",
      "description": "The straight water-filled cracks that run the whole pavement in one direction, deep enough to swim and too narrow to turn in.",
      "source": "content/world/resolved/continent-04.json" }
  ]
}
```

- [ ] **Step 3: `zone-slateflow-sink.json` — c04/r03, fuel + ore**

Ground: `A2-wider-world.md` §3 swears the Slateflow *"comes out"* grey to the tideline. The fabric makes it a **sinking river** — it goes into the ground before it reaches the sea and comes out as a spring at the tideline. Write the sink; do not invent the underground course.

```json
{
  "zone": "slateflow-sink",
  "region": "c04/r03",
  "survey": "surveyed",
  "reasonToGo": "The river goes into the hill here and the dry bed it leaves behind is the only open cut into Stonemoor's coal and iron, so the ground gives up in one place what it hides everywhere else.",
  "hazards": [
    { "id": "the-swallow-surge", "name": "The swallow surge",
      "description": "A day's rain upstream fills the swallow faster than it drains and backs the river out across the dry bed; the surge arrives under a clear sky and takes whoever is working the cut.",
      "effect": "damage" },
    { "id": "the-bad-air", "name": "The bad air",
      "description": "Air standing in the swallow's mouth kills a lamp before it kills a man, which is the only warning anyone gets.",
      "effect": "poison" }
  ],
  "resources": [
    { "id": "sink-lignite", "name": "Sink lignite", "kind": "fuel",
      "description": "Brown coal in a seam the dry bed cuts clean through, dug out in slabs and burned wet because it will not keep." },
    { "id": "sink-iron", "name": "Sink iron", "kind": "ore",
      "description": "Bog iron gathered where the river's old channel stood in pools, panned out of the bed gravel a bucket at a time." }
  ],
  "landmarks": [
    { "id": "the-slateflow-swallow", "name": "The Slateflow Swallow",
      "description": "The rock mouth the whole river walks into, taking every stick and body the flood carries with it and giving none of them back.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" },
    { "id": "the-dry-bed", "name": "The Dry Bed",
      "description": "A league of scoured river channel below the swallow with no water in it, holding the cut, the workings and every mark the last flood left.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" }
  ]
}
```

- [ ] **Step 4: `zone-fenster-clints.json` — c04/r04, fuel + stone**

```json
{
  "zone": "fenster-clints",
  "region": "c04/r04",
  "survey": "surveyed",
  "reasonToGo": "A roof of pavement has fallen in here and left a window straight down onto the water the moor swallowed, and it is the only place a body reaches that water without a rope.",
  "hazards": [
    { "id": "the-undercut-lip", "name": "The undercut lip",
      "description": "The window's rim is cut away underneath by the same water it looks down on; the ground a party stands on to look is the ground that goes.",
      "effect": "damage" },
    { "id": "the-cold-draught", "name": "The cold draught",
      "description": "The fenster breathes out of the hill all summer at the temperature of the water below, and a wet body standing in that draught stops being able to climb out.",
      "effect": "freeze" }
  ],
  "resources": [
    { "id": "grike-juniper", "name": "Grike juniper", "kind": "fuel",
      "description": "Knotted juniper cut out of the cracks and dried standing in bundles; it is the hottest faggot on the moor and there is never much of it." },
    { "id": "rake-stone", "name": "Rake stone", "kind": "stone",
      "description": "Long clean blocks levered off the clints along the natural rake, carried out whole and sold as lintels wherever the moor has none." }
  ],
  "landmarks": [
    { "id": "the-fenster-window", "name": "The Fenster Window",
      "description": "The collapsed roof-hole, wider than it is deep, with the swallowed river running visibly across the bottom of it in daylight.",
      "source": "content/world/resolved/continent-04.json" },
    { "id": "the-rake-path", "name": "The Rake Path",
      "description": "The one line across the clints where the blocks run end to end and a laden sledge can cross the pavement without bridging a grike.",
      "source": "content/world/resolved/continent-04.json" }
  ]
}
```

- [ ] **Step 5: `zone-polje-lake.json` — c04/r05, fuel + timber**

```json
{
  "zone": "polje-lake",
  "region": "c04/r05",
  "survey": "surveyed",
  "reasonToGo": "A flat-floored basin that is a lake for half the year and a meadow for the other half, which makes it the only ground on Stonemoor that grows both peat and hay.",
  "hazards": [
    { "id": "the-winter-flood", "name": "The winter flood",
      "description": "The floor fills from below when the swallows choke, and it fills level and fast — a camp pitched on the meadow in autumn is under four feet of water by the turn of the year.",
      "effect": "damage" },
    { "id": "the-false-floor", "name": "The false floor",
      "description": "Where the water has just gone off, the peat holds a man for two steps and then does not, and there is nothing within reach to pull on.",
      "effect": "stun" }
  ],
  "resources": [
    { "id": "polje-peat", "name": "Polje peat", "kind": "fuel",
      "description": "Cut off the dry floor in high summer in a six-week window, stacked to dry on the rim because nothing dries on the floor itself." },
    { "id": "polje-alder", "name": "Polje alder", "kind": "timber",
      "description": "Alder ringing the flood line, coppiced on a short rotation and used green for anything that has to stand in water." }
  ],
  "landmarks": [
    { "id": "the-polje-shore", "name": "The Polje Shore",
      "description": "The hard line around the basin where the winter water stops dead, marked by alder on one side and bare stone on the other.",
      "source": "content/world/resolved/continent-04.json" },
    { "id": "the-drowned-meadow", "name": "The Drowned Meadow",
      "description": "The basin floor itself: hay in one season, lake in the next, with the cutting-marks of the last hay still visible under the water.",
      "source": "content/world/resolved/continent-04.json" }
  ]
}
```

- [ ] **Step 6: `zone-cenote-stair.json` — c04/r06, fuel + water**

```json
{
  "zone": "cenote-stair",
  "region": "c04/r06",
  "survey": "surveyed",
  "reasonToGo": "Sweet water on a moor that swallows all of it, reached by a cut stair instead of a rope, which is why every road on this side of Stonemoor bends to pass it.",
  "hazards": [
    { "id": "the-greased-steps", "name": "The greased steps",
      "description": "The stair is wet its whole length and grows the same weed the water does; a carrier who slips takes the load and the two people below down with him.",
      "effect": "damage" },
    { "id": "the-still-cold", "name": "The still cold",
      "description": "The shaft holds winter all year. A body that goes into that water comes out unable to grip, and the stair needs a grip.",
      "effect": "freeze" }
  ],
  "resources": [
    { "id": "rush-cake", "name": "Rush cake", "kind": "fuel",
      "description": "Lake rush cut at the water table, pressed into cakes and dried on the rim — the only fuel that will take a light in a shaft this wet." },
    { "id": "table-water", "name": "Table water", "kind": "water",
      "description": "Drawn straight off the standing table at the stair's foot, sweet all year and tallied by the yoke because the stair fixes how much can come up in a day." }
  ],
  "landmarks": [
    { "id": "the-cut-steps", "name": "The Cut Steps",
      "description": "A hundred and forty steps cut round the inside of the shaft in one continuous turn, worn hollow in the middle and nowhere else.",
      "source": "content/world/resolved/continent-04.json" },
    { "id": "the-water-table", "name": "The Water Table",
      "description": "The flat, unmoving surface at the bottom, at the same height as every other water in the moor and never a finger different.",
      "source": "content/world/resolved/continent-04.json" }
  ]
}
```

- [ ] **Step 7: `zone-pavement-edge.json` — c04/r07, ore + salvage**

```json
{
  "zone": "pavement-edge",
  "region": "c04/r07",
  "survey": "surveyed",
  "reasonToGo": "The pavement ends in a brink over the sea, and everything the moor loses over that brink — ore out of the veins, wreck off the reef — ends on the one shelf below it.",
  "hazards": [
    { "id": "the-brink-fall", "name": "The brink fall",
      "description": "The edge is undercut and unfenced for a league, and the pavement gives no warning underfoot before it stops being pavement.",
      "effect": "damage" },
    { "id": "the-shelf-tide", "name": "The shelf tide",
      "description": "The salvage shelf below is dry for three hours and then is not, and the only way back up is the way that took twenty minutes to come down.",
      "effect": "damage" }
  ],
  "resources": [
    { "id": "brink-lead", "name": "Brink lead", "kind": "ore",
      "description": "Galena in the veins the brink cuts open, worked from above with a bucket and a line because no adit will stand in this rock." },
    { "id": "brink-wrack", "name": "Brink wrack", "kind": "salvage",
      "description": "Iron, cordage and worked timber off the reef, carried up the one gully by the same crews that carry the ore down." }
  ],
  "landmarks": [
    { "id": "the-limestone-brink", "name": "The Limestone Brink",
      "description": "The straight white edge where the pavement stops and the sea starts, visible from further out than any other mark on this coast.",
      "source": "docs/worldbuilding/A2-wider-world.md#3" },
    { "id": "the-karn-marker", "name": "The Karn Marker",
      "description": "The single stack left standing off the brink, used as the range mark for the gully and as the count of how much edge the sea has taken since it was joined on.",
      "source": "content/world/resolved/continent-04.json" }
  ]
}
```

- [ ] **Step 8: Verify Stonemoor and commit**

Run:
```bash
node scripts/check_content.mjs --require-complete 2>&1 | grep -E "^zones:" | grep -v "has no record"
node --test 'scripts/tests/zone-content.test.mjs'
node --test 'scripts/tests/zone-allocation.test.mjs'
```
Expected: the first command prints **nothing** — no `Z1`–`Z7` failure on any of the seven; both suites PASS. The `has no record` lines that remain are Thirstwold's 7 and the minors' 10, which are Tasks 13 and 14.

```bash
git add content/zones && git commit -m "content: zone records for Stonemoor"
```

- [ ] **Step 9: Quality gate — verify**

Run: `node --test 'scripts/tests/zone-content.test.mjs' && node --test 'scripts/tests/zone-allocation.test.mjs'` and paste the output.

- [ ] **Step 10: Quality gate — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`, brief: *"Review as an editor. (a) Check every concrete noun against `content/world/resolved/continent-04.json` — is the cenote, the fenster, the polje, the sinking river actually placed in that region? Name any that is not. (b) Stonemoor's idea is that the sea cuts THROUGH a pavement. Does any record describe an ordinary beach-and-headland coast instead? (c) Do the seven read as seven places, or as one moor described seven times — say which two are closest and why. (d) Four records take `fuel`. Are the four fuels four different substances with four different gathering seasons, or one fuel renamed? (e) Does any landmark cite `A2-wider-world.md#3` for a fact §3 does not carry?"*

- [ ] **Step 11: Quality gate — refactor, re-verify, report**

Apply findings, then: `node --test 'scripts/tests/zone-content.test.mjs' && git branch --show-current && git log --oneline -1`

---

### Task 13: Thirstwold's seven zone records — the rain-shadow erg

Seven records on `c05`, register **sandtongue**. **Thirstwold is a rain-shadow erg behind a coastal range** (spec §6.3): one wet strip along the range's seaward foot, then 9,000 km² of cheap reported sand. Only the wet strip, the strand and the scarp are surveyed — the erg itself is frontier and stays hatched. Seven `sandtongue` names in one landmass is also where `G-NAME-SOUND`'s confusability rule earns its keep, which is why Task 10 recorded two collisions resolved during minting; do not undo them.

**Where a landmark's `source` points.** No committed worldbuilding doc describes Thirstwold — it is new ground the survey has only just acquired — so every landmark cites `content/world/resolved/continent-05.json`, the join that places it. **Do not cite `A2-wider-world.md`**: §3 and §4 do not mention this landmass and a citation to a doc that does not carry the fact is the exact failure `G-CITE` exists to make impossible.

**Files:**
- Create: `content/zones/zone-sandtongue-strand.json`, `zone-one-wet-strip.json`, `zone-erg-margin.json`, `zone-yardang-fields.json`, `zone-dry-wadi.json`, `zone-mirage-flats.json`, `zone-scarp-shade.json`
- Test: `scripts/tests/zone-content.test.mjs` (existing)

**Interfaces:**
- Consumes: `docs/worldbuilding/A4-zone-allocation.md` rows `c05/r01`–`c05/r07`; the `Z1`–`Z7` rules (Task 9); `content/world/resolved/continent-05.json`.
- Produces: nothing programmatic.

- [ ] **Step 1: Read the ground**

```bash
node -e '
const r = require("./content/world/resolved/continent-05.json");
for (const z of r.zones.filter((z) => z.survey === "surveyed"))
  console.log(z.id, z.terrainKind, JSON.stringify(z.levelBand),
    "instances:", r.instances.filter((i) => i.region === z.id).map((i) => i.type).join(","));
console.log("reported:", r.zones.filter((z) => z.survey === "reported").length);
'
```
Expected: seven surveyed rows and 20-odd reported ones. The reported majority is the point — write nothing about it.

- [ ] **Step 2: `zone-sandtongue-strand.json` — c05/r01, ore + stone**

```json
{
  "zone": "sandtongue-strand",
  "region": "c05/r01",
  "survey": "surveyed",
  "reasonToGo": "The sea sorts the desert here: everything heavy the erg sends down the coast lies in one black band on this strand, and it can be shovelled instead of mined.",
  "hazards": [
    { "id": "the-glass-cut", "name": "The glass cut",
      "description": "Lightning fuses the strand into thin sheets that break to edges sharper than a knife, and the sand hides all of it until a bare foot finds it.",
      "effect": "damage" },
    { "id": "the-onshore-blast", "name": "The onshore blast",
      "description": "The afternoon wind comes across the strand carrying its own sand and strips exposed skin in an hour; a party without cloth over its face works blind and then stops working.",
      "effect": "damage" }
  ],
  "resources": [
    { "id": "strand-black-sand", "name": "Strand black sand", "kind": "ore",
      "description": "The heavy black band the swell leaves at the top of every tide, shovelled straight into sacks and smelted inland by whoever buys it." },
    { "id": "wind-stone", "name": "Wind stone", "kind": "stone",
      "description": "Ventifact cores left standing when the sand around them blew away — three-faced, harder than anything quarried, and used for millstones the length of the coast." }
  ],
  "landmarks": [
    { "id": "the-glass-beach", "name": "The Glass Beach",
      "description": "A half-league of strand studded with fulgurite and fused sheet, which rings underfoot and cuts anything dragged across it.",
      "source": "content/world/resolved/continent-05.json" },
    { "id": "the-wind-ripple", "name": "The Wind Ripple",
      "description": "The fixed rock ripple behind the strand — a wave form cut in stone by wind, not water, and the mark every caravan turns inland at.",
      "source": "content/world/resolved/continent-05.json" }
  ]
}
```

- [ ] **Step 3: `zone-one-wet-strip.json` — c05/r02, ore + water**

```json
{
  "zone": "one-wet-strip",
  "region": "c05/r02",
  "survey": "surveyed",
  "reasonToGo": "This is the only water in Thirstwold that runs all year, and every road, camp and claim in the landmass exists because of where it comes out of the ground.",
  "hazards": [
    { "id": "the-crowded-water", "name": "The crowded water",
      "description": "Everything alive on this coast comes to the strip, which means everything alive on this coast is at the strip at dusk, and most of it was here first.",
      "effect": "damage" },
    { "id": "the-strip-fever", "name": "The strip fever",
      "description": "Standing water this heavily used goes bad in the hot months, and a party that drinks below the camps instead of above them loses a week.",
      "effect": "poison" }
  ],
  "resources": [
    { "id": "spring-iron", "name": "Spring iron", "kind": "ore",
      "description": "Iron laid down as a red crust wherever the spring water meets air, broken off in plates and carried out on the same donkeys that carry water in." },
    { "id": "strip-water", "name": "Strip water", "kind": "water",
      "description": "Drawn above the camps, carried below them, and tallied by the skin — the price of everything else in Thirstwold is quoted against it." }
  ],
  "landmarks": [
    { "id": "the-living-strip", "name": "The Living Strip",
      "description": "A green line a hundred paces wide and four leagues long, with dead sand on both sides of it and no gradient between.",
      "source": "content/world/resolved/continent-05.json" },
    { "id": "the-spring-head", "name": "The Spring Head",
      "description": "The rock cleft the whole strip comes out of, roofed over with matting and watched by whoever holds the strip that year.",
      "source": "content/world/resolved/continent-05.json" }
  ]
}
```

- [ ] **Step 4: `zone-erg-margin.json` — c05/r03, salvage + timber**

Ground: the surveyed edge of the sand sea. The erg beyond it is **reported and stays reported** — the record describes the margin a body can stand on and the front that walks over it.

```json
{
  "zone": "erg-margin",
  "region": "c05/r03",
  "survey": "surveyed",
  "reasonToGo": "The dune front walks over the old road a few paces every year and uncovers what it buried a generation ago, so the margin gives up caravans and wells in the same season it takes new ones.",
  "hazards": [
    { "id": "the-walking-front", "name": "The walking front",
      "description": "The lee face of a barchan stands at the angle sand will just hold, and a party that digs at its foot brings the whole face down on itself.",
      "effect": "damage" },
    { "id": "no-mark-holds", "name": "No mark holds",
      "description": "Every cairn, stake and wheel-rut on this ground is gone within a season, so a route that was walked last year cannot be walked back by memory.",
      "note": "Absence hazard: the harm is the missing landmark, not a thing in the sand. Nothing in the runtime enum expresses ground that forgets." }
  ],
  "resources": [
    { "id": "dune-salvage", "name": "Dune salvage", "kind": "salvage",
      "description": "Iron, glass and worked leather off caravans the erg buried and has now uncovered, gathered in the weeks before the front covers them again." },
    { "id": "buried-holt", "name": "Buried holt", "kind": "timber",
      "description": "Tamarisk trunks the sand killed standing and preserved whole, cut out of the exposed hollows — the only structural timber in Thirstwold." }
  ],
  "landmarks": [
    { "id": "the-barchan-front", "name": "The Barchan Front",
      "description": "The line of crescent dunes crossing the margin all facing the same way, close enough to walk between and moving at the pace of a slow tide.",
      "source": "content/world/resolved/continent-05.json" },
    { "id": "the-last-well", "name": "The Last Well",
      "description": "A stone-lined well at the margin's edge, dug out and re-dug each time the front passes over it, and the last certain water before the reported sand.",
      "source": "content/world/resolved/continent-05.json" }
  ]
}
```

- [ ] **Step 5: `zone-yardang-fields.json` — c05/r04, salvage + water**

```json
{
  "zone": "yardang-fields",
  "region": "c05/r04",
  "survey": "surveyed",
  "reasonToGo": "The wind has cut the bedrock into parallel combs that hold shade and night-dew, which makes a waterless field the one place in the erg's lee a party can cross in daylight and drink at dawn.",
  "hazards": [
    { "id": "the-comb-maze", "name": "The comb maze",
      "description": "Every corridor looks like every other corridor and all of them run the same way; a party that turns across the grain loses its line and then loses its water.",
      "effect": "stun" },
    { "id": "the-noon-oven", "name": "The noon oven",
      "description": "The corridors trap the day's heat between two rock walls with no wind through them, and a body caught mid-field at noon cooks where it stands.",
      "effect": "burn" }
  ],
  "resources": [
    { "id": "comb-salvage", "name": "Comb salvage", "kind": "salvage",
      "description": "Gear abandoned by parties that went across the grain instead of along it, found intact because nothing here rots and nothing here moves it." },
    { "id": "comb-dew", "name": "Comb dew", "kind": "water",
      "description": "Night dew condensing on the shaded rock faces and led into cut channels at their foot, a cupful per face per night and the reason the crossing is possible at all." }
  ],
  "landmarks": [
    { "id": "the-yardang-combs", "name": "The Yardang Combs",
      "description": "Rank on rank of wind-cut rock ridges, all parallel, all pointing the same way — a compass a body can read lying down.",
      "source": "content/world/resolved/continent-05.json" },
    { "id": "the-wind-cut-ridge", "name": "The Wind-Cut Ridge",
      "description": "The one comb that stands twice the height of the rest, carrying the dew channels that supply the whole crossing.",
      "source": "content/world/resolved/continent-05.json" }
  ]
}
```

- [ ] **Step 6: `zone-dry-wadi.json` — c05/r05, stone + timber**

```json
{
  "zone": "dry-wadi",
  "region": "c05/r05",
  "survey": "surveyed",
  "reasonToGo": "A dry channel is the only shade, the only standing wood and the only graded road out of the scarp, so everything that moves inland moves up this wadi.",
  "hazards": [
    { "id": "the-far-rain", "name": "The far rain",
      "description": "The flood comes from weather nobody in the wadi can see, arrives as a wall with the noise a few seconds ahead of it, and fills the channel bank to bank.",
      "effect": "damage" },
    { "id": "the-undercut-collapse", "name": "The undercut collapse",
      "description": "Every bank here is cut away underneath by the last flood, so the shaded ground a party camps under is the ground that comes down on it.",
      "effect": "damage" }
  ],
  "resources": [
    { "id": "flood-cobble", "name": "Flood cobble", "kind": "stone",
      "description": "Rounded cobble sorted by size along the channel and lifted straight out of it — the whole coast's building stone, delivered by water that runs twice a decade." },
    { "id": "wadi-tamarisk", "name": "Wadi tamarisk", "kind": "timber",
      "description": "Tamarisk rooted in the undercut banks, cut on a long rotation and the only living wood a Thirstwold carpenter ever sees." }
  ],
  "landmarks": [
    { "id": "the-flood-marks", "name": "The Flood Marks",
      "description": "Cut lines on the wadi wall, one per flood, the highest of them well above a standing man and none of them made by anyone still alive.",
      "source": "content/world/resolved/continent-05.json" },
    { "id": "the-undercut-bank", "name": "The Undercut Bank",
      "description": "A half-league of hollowed bank that gives the only continuous shade in the region and drops a section of itself every flood.",
      "source": "content/world/resolved/continent-05.json" }
  ]
}
```

- [ ] **Step 7: `zone-mirage-flats.json` — c05/r06, crop + forage + fuel**

```json
{
  "zone": "mirage-flats",
  "region": "c05/r06",
  "survey": "surveyed",
  "reasonToGo": "A salt flat with a thin freshwater lens under one edge of it, which is the only ground in Thirstwold that grows a grain, and the only ground that kills a party for walking at it.",
  "hazards": [
    { "id": "the-false-water", "name": "The false water",
      "description": "The flat throws a standing sheet of water on the horizon every hot afternoon and it is never there; parties walk toward it past the last real well and are found on the crust.",
      "note": "Absence hazard: the harm is that the water does not exist. Nothing in the runtime enum expresses a thing that is only apparent." },
    { "id": "the-crust-break", "name": "The crust break",
      "description": "The salt crust carries a man over brine mud that will not, and it breaks without warning at the flat's centre where it looks thickest.",
      "effect": "damage" }
  ],
  "resources": [
    { "id": "pan-millet", "name": "Pan millet", "kind": "crop",
      "description": "Short millet sown on the lens edge where the salt gives out, watered by hand from the pan wells and harvested green before the crust creeps back." },
    { "id": "glasswort", "name": "Glasswort", "kind": "forage",
      "description": "Salt-fed glasswort picked off the crust margin, eaten raw and burned for the ash the tanners buy." },
    { "id": "sabkha-scrub", "name": "Sabkha scrub", "kind": "fuel",
      "description": "Saltbush cut on the flat's dry rim and dried in a week; it burns fast and dirty and is the only fuel within two days' walk." }
  ],
  "landmarks": [
    { "id": "the-sabkha-pan", "name": "The Sabkha Pan",
      "description": "The flat itself: white, level to the eye in every direction, and soft under its own crust everywhere but the rim.",
      "source": "content/world/resolved/continent-05.json" },
    { "id": "the-false-water", "name": "The False Water",
      "description": "The mirage line that stands over the pan every afternoon of the hot season, in the same place, at the same height, and has never once been water.",
      "source": "content/world/resolved/continent-05.json" }
  ]
}
```

**Note the deliberate id reuse:** `the-false-water` is both a hazard id and a landmark id in this record. `Z4` scopes id uniqueness **within each array**, not across the file (`check_content.mjs:1000-1006`, "one id string may legally appear in all three arrays"), and the mirage is genuinely both the hazard and the landmark. If a reviewer flags it, the answer is the gate's own comment.

- [ ] **Step 8: `zone-scarp-shade.json` — c05/r07, crop + forage + ore**

```json
{
  "zone": "scarp-shade",
  "region": "c05/r07",
  "survey": "surveyed",
  "reasonToGo": "The coastal range's inland face throws a shadow that lasts until mid-morning, and everything Thirstwold grows for itself is grown in that strip of ground before the sun reaches it.",
  "hazards": [
    { "id": "the-rockfall-hour", "name": "The rockfall hour",
      "description": "The scarp sheds stone when the shade line crosses it and the rock expands; the fall comes at the same hour each morning and the terraces are directly under it.",
      "effect": "damage" },
    { "id": "the-scarp-heat", "name": "The scarp heat",
      "description": "After the shade goes off, the rock face gives back the whole morning's sun at once, and the terraces become the hottest ground in the landmass for four hours.",
      "effect": "burn" }
  ],
  "resources": [
    { "id": "ledge-wheat", "name": "Ledge wheat", "kind": "crop",
      "description": "Hard wheat on narrow terraces along the shaded foot, sown to the shade line exactly — a row planted a pace out is a row that does not come up." },
    { "id": "noon-greens", "name": "Noon greens", "kind": "forage",
      "description": "Bitter herbs that grow only in the rockfall apron where the shade holds longest, gathered at the same hour the fall makes it dangerous to." },
    { "id": "scarp-copper", "name": "Scarp copper", "kind": "ore",
      "description": "Green-stained ore in the scarp's broken face, prised out of the fallen blocks rather than the wall, which is why nobody digs here and everybody looks." }
  ],
  "landmarks": [
    { "id": "the-scarp-shadow", "name": "The Scarp Shadow",
      "description": "The moving line of shade that crosses the terraces each morning at a walking pace, and which every field boundary in the region is set against.",
      "source": "content/world/resolved/continent-05.json" },
    { "id": "the-noon-camp", "name": "The Noon Camp",
      "description": "The walled camp under the scarp's one overhang, where everyone working the terraces sits out the four hours nobody works.",
      "source": "content/world/resolved/continent-05.json" }
  ]
}
```

- [ ] **Step 9: Verify Thirstwold and commit**

Run:
```bash
node scripts/check_content.mjs --require-complete 2>&1 | grep -E "^zones:" | grep -v "has no record"
node --test 'scripts/tests/zone-content.test.mjs'
node --test 'scripts/tests/zone-allocation.test.mjs'
```
Expected: the first command prints **nothing**; both suites PASS — in particular the allocation test's `every landmark name is globally unique` case, which is the one that catches a `sandtongue` collision.

```bash
git add content/zones && git commit -m "content: zone records for Thirstwold"
```

- [ ] **Step 10: Quality gate — verify**

Run: `node --test 'scripts/tests/zone-content.test.mjs' && node --test 'scripts/tests/zone-allocation.test.mjs'` and paste the output.

- [ ] **Step 11: Quality gate — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`, brief: *"Review as an editor. (a) Do Thirstwold's seven read as seven places or as one desert seven times? Name the two that are closest. (b) Check every noun against `content/world/resolved/continent-05.json` — the yardangs, the sabkha, the barchans, the wadi. Is each actually placed in that region? (c) Two records claim `timber` in a desert. Is each justified by a real mechanism, or is one of them there because A4 said `timber`? (d) Does any record describe the reported erg as if someone had walked it? That is the exact dishonesty the hatching exists to prevent. (e) Are `The Living Strip` and `The Wind-Cut Ridge` — the two names Task 10 re-minted to clear a collision — still the names used, or did an author quietly restore `The Green Line` / `The Scoured Ridge`?"*

- [ ] **Step 12: Quality gate — refactor, re-verify, report**

Apply findings, then: `node --test 'scripts/tests/zone-content.test.mjs' && git branch --show-current && git log --oneline -1`

---

### Task 14: The ten minor-continent and chain records — and `Z2` closed

The last ten: Reedstrand 3, Driftholt 3, Wracklow 2, Brightfall 1, Ashen Spar 1. **This is the task that closes `Z2` in both directions.** These are the smallest landmasses and the easiest to write thin — resist it. Each carries a structural idea nothing else in the world carries, and one sentence naming that idea is worth more than three of scenery:

| Continent | The structural idea the prose must honour | Register | `source` for landmarks |
|---|---|---|---|
| Reedstrand (`c06`) | A bird's-foot delta with **no bedrock** — every region is a lobe and the chart is provisional by nature. Every stone on it arrived by river or as ballast. | reedspeech | `docs/worldbuilding/A2-wider-world.md#4` (the chain is committed there; the promotion to minor continent lands in Task 15) |
| Driftholt (`c07`) | Fog forest on a windward slope — **the wettest ground in the world**. | reedspeech | `docs/worldbuilding/A2-wider-world.md#4` |
| Wracklow (`c08`) | An entirely erosional coast: stacks, arches, geos, blowholes; **no river reaches the sea intact**. | reedspeech | `content/world/resolved/continent-08.json` |
| Brightfall (`c09`) | Cliff-hung waterfalls straight into the sea. | reedspeech | `docs/worldbuilding/A2-wider-world.md#4` |
| Ashen Spar (`c10`) | The volcanic arc — a strung line of cones, calderas and lava tubes. **`ash` is a walkable depositional plain; `lava` is an impassable flow field. Do not blur them.** | sandtongue | `content/world/resolved/continent-10.json` |

**Files:**
- Create: `content/zones/zone-reed-lobes.json`, `zone-lagoon-crescent.json`, `zone-birdsfoot-mouth.json`, `zone-fogforest-slope.json`, `zone-drip-terraces.json`, `zone-windward-crown.json`, `zone-stack-coast.json`, `zone-blowhole-shelf.json`, `zone-cliffhang-falls.json`, `zone-cone-line.json`
- Test: `scripts/tests/zone-content.test.mjs` (existing)

**Interfaces:**
- Consumes: `docs/worldbuilding/A4-zone-allocation.md` rows `c06/r01`–`c10/r01`; the `Z1`–`Z7` rules (Task 9); `content/world/resolved/continent-06.json` … `continent-10.json`.
- Produces: nothing programmatic.

- [ ] **Step 1: `zone-reed-lobes.json` — c06/r01, crop + fuel + stone**

```json
{
  "zone": "reed-lobes",
  "region": "c06/r01",
  "survey": "surveyed",
  "reasonToGo": "Every osier bed on the delta is cut from this lobe, and osier is what the whole of Reedstrand is built out of — hull, hurdle, wall and creel.",
  "hazards": [
    { "id": "the-shifting-channel", "name": "The shifting channel",
      "description": "The lobe's channels re-cut themselves every spate, so a boat left on a bank at dusk is on dry mud or in deep water by morning, and never the one that was expected.",
      "effect": "stun" },
    { "id": "no-ground-that-stays", "name": "No ground that stays",
      "description": "There is no rock under any of this, and the bank a camp is pitched on is silt the river is still moving; it goes in a night and takes the camp with it.",
      "note": "Absence hazard: the harm is the missing bedrock. Nothing in the runtime enum expresses ground that is only temporarily ground." }
  ],
  "resources": [
    { "id": "lobe-rice", "name": "Lobe rice", "kind": "crop",
      "description": "Wet-sown grain broadcast onto the fresh silt behind the osier and reaped from a flat boat, because there is nowhere on the lobe dry enough to stand and cut." },
    { "id": "reed-faggots", "name": "Reed faggots", "kind": "fuel",
      "description": "Cut reed dried on the osier hurdles and burned in bound bundles — it gives a fierce short heat and it is the only fuel the delta grows." },
    { "id": "ballast-stone", "name": "Ballast stone", "kind": "stone",
      "description": "Stone landed as ballast by hulls loading osier, stacked at the beds and re-sold by the barrow; not one piece of it came out of Reedstrand." }
  ],
  "landmarks": [
    { "id": "the-osier-beds", "name": "The Osier Beds",
      "description": "Rank after rank of cut willow standing in water, the only worked ground on the delta and the only thing on it that is in the same place twice.",
      "source": "docs/worldbuilding/A2-wider-world.md#4" },
    { "id": "the-lobe-channels", "name": "The Lobe Channels",
      "description": "The braid of shallow cuts that splits and rejoins across the whole lobe, redrawn by every spate and charted afresh every decade.",
      "source": "docs/worldbuilding/A2-wider-world.md#4" }
  ]
}
```

- [ ] **Step 2: `zone-lagoon-crescent.json` — c06/r02, crop + ore + timber**

```json
{
  "zone": "lagoon-crescent",
  "region": "c06/r02",
  "survey": "surveyed",
  "reasonToGo": "The bar closes a crescent of still brackish water behind it, which is the only water on the delta calm enough to build a hull in and shallow enough to work bog iron out of.",
  "hazards": [
    { "id": "the-bar-overwash", "name": "The bar overwash",
      "description": "A gale over the bar puts the sea into the lagoon in one push; the water rises a fathom in an hour and everything drawn up on the inner shore floats off it.",
      "effect": "damage" },
    { "id": "the-brackish-rot", "name": "The brackish rot",
      "description": "Standing water this warm and this salt breeds a fever that comes on in the third week; the yards work the crescent in shifts for exactly that reason.",
      "effect": "poison" }
  ],
  "resources": [
    { "id": "crescent-saltgrain", "name": "Crescent saltgrain", "kind": "crop",
      "description": "Salt-tolerant grain sown on the lagoon's inner shelf, the only crop that takes brackish flooding and the reason the crescent is settled at all." },
    { "id": "lagoon-bog-iron", "name": "Lagoon bog iron", "kind": "ore",
      "description": "Iron pans lifted out of the lagoon floor with a dredge basket, thin and impure and smelted on the bar because there is no fuel inland." },
    { "id": "lagoon-alder", "name": "Lagoon alder", "kind": "timber",
      "description": "Alder off the crescent's landward rim, cut for boat frames because it holds in brackish water where every other wood on the delta gives up." }
  ],
  "landmarks": [
    { "id": "the-crescent-bar", "name": "The Crescent Bar",
      "description": "The long sand bar that closes the lagoon, breached and re-closed by the sea often enough that the yards keep a boat on both sides of it.",
      "source": "docs/worldbuilding/A2-wider-world.md#4" },
    { "id": "the-bittern-reach", "name": "The Bittern Reach",
      "description": "The reed-walled inner end of the crescent, where the water is fresh enough to drink at the top of the ebb and nowhere else.",
      "source": "docs/worldbuilding/A2-wider-world.md#4" }
  ]
}
```

- [ ] **Step 3: `zone-birdsfoot-mouth.json` — c06/r03, crop + stone + water**

```json
{
  "zone": "birdsfoot-mouth",
  "region": "c06/r03",
  "survey": "surveyed",
  "reasonToGo": "The river splits into its last fingers here and drops everything it has carried, so this is where the delta's fresh water, its new ground and its only imported stone all arrive.",
  "hazards": [
    { "id": "the-finger-bar", "name": "The finger bar",
      "description": "Each finger ends in a bar that moves with the season, and a laden boat that takes last year's finger grounds broadside to the swell.",
      "effect": "damage" },
    { "id": "the-mouth-fog", "name": "The mouth fog",
      "description": "Cold sea over warm river water fogs the mouth in minutes and holds for a day; crews caught in it anchor where they are and lose the tide.",
      "effect": "stun" }
  ],
  "resources": [
    { "id": "finger-rice", "name": "Finger rice", "kind": "crop",
      "description": "Grain sown on the newest silt between two fingers, on ground that did not exist five years ago and will be under water in another five." },
    { "id": "head-cobble", "name": "Head cobble", "kind": "stone",
      "description": "River cobble brought down from the head of the catchment and dropped at the mouth — the only stone Reedstrand produces itself, and it arrives one flood at a time." },
    { "id": "mouth-water", "name": "Mouth water", "kind": "water",
      "description": "Fresh water taken from the top of the ebb above the eyot, the delta's whole supply, and undrinkable within an hour either side of it." }
  ],
  "landmarks": [
    { "id": "the-silt-fingers", "name": "The Silt Fingers",
      "description": "The three splayed channels the river ends in, each walled by its own levee and each a little longer every year.",
      "source": "docs/worldbuilding/A2-wider-world.md#4" },
    { "id": "the-alder-eyot", "name": "The Alder Eyot",
      "description": "The wooded island between the two western fingers, the oldest fixed ground on the delta and the mark every crew takes the fresh water above.",
      "source": "docs/worldbuilding/A2-wider-world.md#4" }
  ]
}
```

- [ ] **Step 4: `zone-fogforest-slope.json` — c07/r01, forage + fuel + water**

```json
{
  "zone": "fogforest-slope",
  "region": "c07/r01",
  "survey": "surveyed",
  "reasonToGo": "The trees here comb water out of standing fog and drop it, so a body can fill a barrel on a slope where it has not rained for a month — and everything that grows on wet bark grows here and nowhere else.",
  "hazards": [
    { "id": "the-slick-slope", "name": "The slick slope",
      "description": "Every surface on this slope carries a skin of moss and running water; the ground gives under a boot exactly as often as the moss does, and the slope is long.",
      "effect": "damage" },
    { "id": "the-wet-cold", "name": "The wet cold",
      "description": "Nothing dries. A party that is soaked on the first morning is soaked on the fourth, and the cold gets in through wet cloth in weather that would not otherwise trouble anyone.",
      "effect": "freeze" }
  ],
  "resources": [
    { "id": "bark-fungus", "name": "Bark fungus", "kind": "forage",
      "description": "Shelf fungus cut off the drip-fed trunks, dried over the only fire in the camp and traded out as the one thing Driftholt exports by weight." },
    { "id": "resin-billets", "name": "Resin billets", "kind": "fuel",
      "description": "Resin-soaked heartwood split out of fallen trunks, the only wood on the slope that will take a light in air this wet." },
    { "id": "comb-water", "name": "Comb water", "kind": "water",
      "description": "Fog-drip led off the drip line into troughs, a barrel a night from a good tree, and the reason the camps sit where they sit." }
  ],
  "landmarks": [
    { "id": "the-drip-line", "name": "The Drip Line",
      "description": "The height on the slope where the fog first touches the canopy and the constant rain under it begins — a hard line a body can walk into and hear.",
      "source": "docs/worldbuilding/A2-wider-world.md#4" },
    { "id": "the-moss-ladder", "name": "The Moss Ladder",
      "description": "A pitch of old trunks fallen across the steepest ground, climbed like a stair for four generations and thick enough with moss to be soft the whole way.",
      "source": "docs/worldbuilding/A2-wider-world.md#4" }
  ]
}
```

- [ ] **Step 5: `zone-drip-terraces.json` — c07/r02, forage + ore + stone**

```json
{
  "zone": "drip-terraces",
  "region": "c07/r02",
  "survey": "surveyed",
  "reasonToGo": "The slope steps here, and every step holds a flat of gravel the fog-fed streams have been sorting for a long time — which is where Driftholt's tin comes from and the only level ground on the island.",
  "hazards": [
    { "id": "the-terrace-slip", "name": "The terrace slip",
      "description": "A terrace is gravel resting on wet clay; working the face undercuts it, and the whole step goes at once onto the step below.",
      "effect": "damage" },
    { "id": "the-fog-ceiling-blind", "name": "The blind ceiling",
      "description": "The cloud base sits on the terraces most days and takes visibility to a few paces; a party that keeps working in it walks off a terrace edge it has known for years.",
      "effect": "stun" }
  ],
  "resources": [
    { "id": "terrace-greens", "name": "Terrace greens", "kind": "forage",
      "description": "Thick-leaved herbs on the terrace flats, the only green food that grows where the sun reaches for two hours a day." },
    { "id": "stream-tin", "name": "Stream tin", "kind": "ore",
      "description": "Placer tin washed out of the terrace gravel in a wooden box fed by the same stream that laid it down; the only metal Driftholt has ever sold." },
    { "id": "terrace-slab", "name": "Terrace slab", "kind": "stone",
      "description": "Flat slabs from the terrace risers, split along the bedding and carried down for hearths and doorsteps because nothing else here is dry enough to build with." }
  ],
  "landmarks": [
    { "id": "the-terrace-steps", "name": "The Terrace Steps",
      "description": "Five gravel flats stacked up the slope with a stream falling between each, worked from the bottom one upward for as long as anyone has counted.",
      "source": "docs/worldbuilding/A2-wider-world.md#4" },
    { "id": "the-fog-ceiling", "name": "The Fog Ceiling",
      "description": "The flat grey underside of the cloud that sits on the third terrace nine days in ten, and which the workings are measured up to rather than the sky.",
      "source": "docs/worldbuilding/A2-wider-world.md#4" }
  ]
}
```

- [ ] **Step 6: `zone-windward-crown.json` — c07/r03, forage + timber + water**

```json
{
  "zone": "windward-crown",
  "region": "c07/r03",
  "survey": "surveyed",
  "reasonToGo": "The crown of the slope takes the weather first and grows the tallest straight timber in the world for it, and the gap through it is the only crossing between Driftholt's two coasts.",
  "hazards": [
    { "id": "the-crown-wind", "name": "The crown wind",
      "description": "The gap funnels the whole windward gale into one saddle; a party crossing at the wrong hour is put on the ground and kept there, wet, until it drops.",
      "effect": "stun" },
    { "id": "the-widowmaker", "name": "The widowmaker",
      "description": "Dead limbs hang up in this canopy for years because nothing here is dry enough to snap clean, and they come down in the gusts onto whatever is beneath.",
      "effect": "damage" }
  ],
  "resources": [
    { "id": "crown-fern", "name": "Crown fern", "kind": "forage",
      "description": "Fern crosiers cut in the wet spring on the crown flats, the one bulk food Driftholt gathers rather than grows." },
    { "id": "crown-mast", "name": "Crown mast", "kind": "timber",
      "description": "Single-stick mast timber out of the windward stand, felled uphill and walked down the gap — the reason foreign hulls come here at all." },
    { "id": "face-water", "name": "Face water", "kind": "water",
      "description": "Run-off taken straight off the wet face into cut troughs, more of it than anyone can use and the only resource on Driftholt nobody counts." }
  ],
  "landmarks": [
    { "id": "the-crown-gap", "name": "The Crown Gap",
      "description": "The single saddle through the crown, floored with laid timber, and the whole island's road between its windward and leeward coasts.",
      "source": "docs/worldbuilding/A2-wider-world.md#4" },
    { "id": "the-wet-face", "name": "The Wet Face",
      "description": "The windward wall below the crown, running with water down its whole height in any weather, and green from the tideline to the cloud.",
      "source": "docs/worldbuilding/A2-wider-world.md#4" }
  ]
}
```

- [ ] **Step 7: `zone-stack-coast.json` — c08/r01, fuel + ore + salvage**

```json
{
  "zone": "stack-coast",
  "region": "c08/r01",
  "survey": "surveyed",
  "reasonToGo": "A coast of standing stacks with a vein cut open in every geo between them, and the wrecks the stacks make are dismantled on the same shore that made them.",
  "hazards": [
    { "id": "the-collapsing-stack", "name": "The collapsing stack",
      "description": "Every stack here is a stack because the arch it used to be fell down; the ones still standing are the ones that have not yet, and they give no notice.",
      "effect": "damage" },
    { "id": "the-geo-surge", "name": "The geo surge",
      "description": "A swell entering a geo has nowhere to go but up; it comes up the throat as a solid column and takes anything on the floor out with it on the way back.",
      "effect": "damage" }
  ],
  "resources": [
    { "id": "bramble-faggots", "name": "Bramble faggots", "kind": "fuel",
      "description": "Thorn cut off the stacks' landward backslope and dried on the rock — the only thing that grows on Wracklow and the only thing that burns on it." },
    { "id": "geo-vein-iron", "name": "Geo vein iron", "kind": "ore",
      "description": "Iron out of the vein the geo cuts open, chipped from the walls at low water by crews who work to the tide and not to the day." },
    { "id": "wreck-salvage", "name": "Wreck salvage", "kind": "salvage",
      "description": "Iron, cordage and cut timber off hulls the stacks caught, stripped on the shore and sold at Netstead because there is no market nearer." }
  ],
  "landmarks": [
    { "id": "the-standing-stacks", "name": "The Standing Stacks",
      "description": "A line of sea stacks a league long, each the remains of a headland, with clear water and a following swell between every pair.",
      "source": "content/world/resolved/continent-08.json" },
    { "id": "the-geo-throat", "name": "The Geo Throat",
      "description": "The deepest geo on the coast, a cleft driven back into the cliff with a vein down one wall and a blowing surge up the other.",
      "source": "content/world/resolved/continent-08.json" }
  ]
}
```

- [ ] **Step 8: `zone-blowhole-shelf.json` — c08/r02, fuel + stone + timber**

Ground: Wracklow's structural idea is that **no river reaches the sea intact**. Every scrap of wood on this shelf therefore arrived by sea, which is what makes `timber` a salvage-adjacent resource here and not a forestry one.

```json
{
  "zone": "blowhole-shelf",
  "region": "c08/r02",
  "survey": "surveyed",
  "reasonToGo": "The shelf is the one walkable ground on an erosional coast, and everything the sea takes from the rest of Wracklow — coal, timber, wrack — is laid out on it by the same swell that made it.",
  "hazards": [
    { "id": "the-blowhole-jet", "name": "The blowhole jet",
      "description": "The field is holed straight through to the sea in a dozen places, and on a big swell each hole throws a column of water higher than a mast with no pattern to when.",
      "effect": "damage" },
    { "id": "the-shelf-sweep", "name": "The shelf sweep",
      "description": "A swell that overtops the shelf runs its whole width and takes everything loose seaward, including bodies that were a hundred paces from the edge.",
      "effect": "damage" }
  ],
  "resources": [
    { "id": "sea-coal", "name": "Sea coal", "kind": "fuel",
      "description": "Coal washed out of a drowned seam offshore and thrown up along the wrack line, gathered after every gale and the warmest fuel on the island." },
    { "id": "shelf-flag", "name": "Shelf flag", "kind": "stone",
      "description": "Flagstone levered off the shelf where the swell has already loosened it, walked up the one gully and used for every roof on the coast." },
    { "id": "wrack-timber", "name": "Wrack timber", "kind": "timber",
      "description": "Driftwood and wreck timber off the wrack line — no tree grows on Wracklow and no river brings one down, so every plank here crossed open water to arrive." }
  ],
  "landmarks": [
    { "id": "the-blowhole-field", "name": "The Blowhole Field",
      "description": "A shelf pocked with a dozen holes to the sea, each roaring on a different swell, audible from inland long before it is visible.",
      "source": "content/world/resolved/continent-08.json" },
    { "id": "the-wrack-line", "name": "The Wrack Line",
      "description": "The high tide's litter along the shelf's inner edge, re-laid by every gale, and the closest thing Wracklow has to a market.",
      "source": "content/world/resolved/continent-08.json" }
  ]
}
```

- [ ] **Step 9: `zone-cliffhang-falls.json` — c09/r01, ore + salvage + water**

```json
{
  "zone": "cliffhang-falls",
  "region": "c09/r01",
  "survey": "surveyed",
  "reasonToGo": "Fresh water falls off this cliff straight into the sea, so a hull can fill its casks without landing — which is the only reason anyone stops at Brightfall and the only trade the chain has.",
  "hazards": [
    { "id": "the-spray-slick", "name": "The spray slick",
      "description": "The ledge under the fall is wet its whole length and weeded to the colour of the rock; a cask crew works it roped, and the ones who do not are why it is roped.",
      "effect": "damage" },
    { "id": "the-fall-cold", "name": "The fall cold",
      "description": "The water comes off the height with the cold of the height still in it, and standing under it to fill a cask takes the strength out of a pair of hands in minutes.",
      "effect": "freeze" }
  ],
  "resources": [
    { "id": "ledge-float", "name": "Ledge float", "kind": "ore",
      "description": "Ore-bearing float the fall has cut out of the cliff and dropped on the ledge, picked over between hulls and never dug for." },
    { "id": "ledge-wreck", "name": "Ledge wreck", "kind": "salvage",
      "description": "Gear off hulls that misjudged the swell while lying under the fall, taken off the ledge by the next crew to manage it better." },
    { "id": "fall-water", "name": "Fall water", "kind": "water",
      "description": "Caught in the fall's own plunge basin, the sweetest water on the eastern lanes and the entire reason for the chain's name and its charting." }
  ],
  "landmarks": [
    { "id": "the-hanging-fall", "name": "The Hanging Fall",
      "description": "White water leaving the cliff top clear of the rock and reaching the sea without touching it — the mark mariners named the chain for.",
      "source": "docs/worldbuilding/A2-wider-world.md#4" },
    { "id": "the-spray-ledge", "name": "The Spray Ledge",
      "description": "The narrow shelf at the fall's foot, the only landing on the isle, and never dry in any season.",
      "source": "docs/worldbuilding/A2-wider-world.md#4" }
  ]
}
```

- [ ] **Step 10: `zone-cone-line.json` — c10/r01, salvage + stone + timber**

Ground: Ashen Spar's two ground types are **not interchangeable**. `ash` is a walkable depositional plain that buries things intact; `lava` is an impassable flow field. Every sentence below keeps them apart, and a reviewer will check that it does.

```json
{
  "zone": "cone-line",
  "region": "c10/r01",
  "survey": "surveyed",
  "reasonToGo": "The ash plain between the cones buries a camp whole and gives it back a decade later, so the one line of walkable ground on the arc is also the only place anything of the arc's history can be dug up.",
  "hazards": [
    { "id": "the-flow-field", "name": "The flow field",
      "description": "The lava fields between the ash plains are not crossable at any pace: broken block that turns an ankle every third step and cuts through boot leather in a morning.",
      "effect": "damage" },
    { "id": "the-vent-air", "name": "The vent air",
      "description": "The tube mouths and fissures breathe out gas that sits in the hollows without smell until a body is already in it and already down.",
      "effect": "poison" }
  ],
  "resources": [
    { "id": "buried-gear", "name": "Buried gear", "kind": "salvage",
      "description": "Tools, iron and stores dug out of the ash that buried the last camps, preserved by the same fall that killed them and worth more than anything the arc produces." },
    { "id": "tube-basalt", "name": "Tube basalt", "kind": "stone",
      "description": "Dense basalt cut out of collapsed lava-tube roofs — the hardest building stone in the world and quarried nowhere else because nowhere else is it lying broken and reachable." },
    { "id": "ash-buried-pine", "name": "Ash-buried pine", "kind": "timber",
      "description": "Standing pine killed and preserved by an ash fall, cut off at the new ground level; it is seasoned, it is upright, and there is a finite amount of it." }
  ],
  "landmarks": [
    { "id": "the-cone-row", "name": "The Cone Row",
      "description": "A dozen cinder cones strung in one line down the arc, each with its ash plain on the lee side and its flow field on the other, in the same order every time.",
      "source": "content/world/resolved/continent-10.json" },
    { "id": "the-tube-mouth", "name": "The Tube Mouth",
      "description": "The open end of the longest lava tube on the arc, walked into for a hundred paces before the roof drops and nobody has walked further.",
      "source": "content/world/resolved/continent-10.json" }
  ]
}
```

- [ ] **Step 11: Prove `Z2` is closed in both directions**

Run:
```bash
node scripts/check_content.mjs --require-complete 2>&1 | grep -E "^zones:"
ls content/zones/zone-*.json | wc -l
node --test 'scripts/tests/zone-content.test.mjs'
node --test 'scripts/tests/zone-allocation.test.mjs'
node scripts/check_content.mjs --require-complete 2>&1 | grep -E "^zones: [0-9]+ records"
```
Expected: the first grep prints **nothing** — no missing record and no record on unwalked ground; **40** zone files; both suites PASS; and the last line reports `zones: 40 records`, which is the counting assertion that proves the gate did not silently early-out. The polar cap (Rimewall Cap) and the four remaining chains carry **zero** records by design — that is the honest frontier, and it is why the world can be ten times larger without ten times the prose.

```bash
git add content/zones && git commit -m "content: zone records for the minor continents and chains"
```

- [ ] **Step 12: Quality gate — verify**

Run: `./scripts/integration.sh --no-install` and paste the output. Expected: every section PASS. This is the first moment since Task 6 that Gate 2 is green end to end.

- [ ] **Step 13: Quality gate — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`, brief: *"Editorial review of ten records on five landmasses. (a) Pick any five concrete nouns and check each against `content/world/resolved/` — is the blowhole, the lagoon, the terrace, the fall actually placed in that region? (b) Does any record read as filler written to satisfy a count? Name it and say what is missing. (c) Does `ash` get used where `lava` is meant, or vice versa, on Ashen Spar? The split is deliberate and the whole arc reads as a smudge if it is blurred. (d) Reedstrand has no bedrock and Wracklow has no river reaching the sea. Does every `stone` and `timber` resource on those two landmasses say how it arrived? (e) Run the whole 40-record corpus through the Z6 checks by hand — 40 distinct kind sets, 80 distinct landmark names — independently of `zone-allocation.test.mjs`, and report the two closest near-collisions."*

- [ ] **Step 14: Quality gate — refactor, re-verify, report**

Apply findings, then: `./scripts/integration.sh --no-install && git branch --show-current && git log --oneline -3`

---

### Task 15: Prose reconciliation — the 22 surviving `AMENDED-PENDING` re-voicings and the wider-world amendments

F-045 was a *uniform 5× rescale* — it preserved every topological relation, bearing, rank and betweenness — and it still stranded **33 prose claims across 10 content files**, of which **22 are still standing when this task runs** (7 retired with the legacy mirror Plan A deleted, 4 with the continent node bodies Task 6 regenerated), each stamped `AMENDED-PENDING (I-095): distances now hour-scale on the 400 km world — prose re-voice deferred`. This task pays that debt on the redrawn world, where the claims are finally checkable. **This is not cosmetic:** every one of these markers is a sentence that currently asserts something false, and G-MEANING (Plan D) will flag the ones that are also machine-checkable.

**The live markers, counted by file** (`grep -rc "AMENDED-PENDING" content docs`):

| File | Markers | What they say |
|---|---|---|
| `content/story/canon.md` | 5 | §4's day-counts: Embervale↔Norhollow, Millcross→Gildmark 4–5 days, Rooktide ~2 days south |
| `docs/worldbuilding/A1-geography-cluster1.md` | 7 | The "~30 km per travel-day" pace, the "~190 km of ridge-line", "8–10 km" tower spacing, "six days", "a day's walk away" |
| `docs/worldbuilding/A0-current-world.md` | 3 | The day-count bullet list, "crossable in under a week", "slow detail (days)" |
| `content/spine/edges.json` | 5 | Road-note day-counts on the trade road, coastal spur, east-rim track and two more |
| `content/spine/nodes/*.json` | 5 **pre-redraw**, **1 post-redraw** | Pre-redraw: `n-atlas` 1, `n-cluster1` **2**, `n-coldreach` 1, `n-stonemoor` 1 — lore summaries citing "six days out on the trade wind". Post-redraw, only `n-atlas`'s survives: `buildTrunk` writes `lore: { summary: premise.structuralIdea }` on every continent node it generates, so `n-cluster1`, `n-coldreach` and `n-stonemoor` are **regenerated wholesale by Task 6** and their four markers retire with the old node bodies rather than being re-voiced. `n-atlas` is the one node promotion carries over verbatim. **This task therefore re-voices ONE node file, not four.** |
| `docs/worldbuilding/A2-zones-cluster1.md` | 1 | One distance claim inside a zone essay |
| **Total (live corpus)** | **26 pre-redraw**, **22 at this task** | Verified pre-redraw: `grep -rc "AMENDED-PENDING" content docs` — 5 + 7 + 3 + 5 + 5 + 1 = 26 live, plus 7 more in `content/maps/cluster1-geography.json` which Plan A **deletes**, so those retire with it. By the time this task runs, Task 6's promotion has already retired the 4 continent-node markers with the node bodies they lived in, leaving **22** for this task to re-voice by hand: 5 canon + 7 A1 + 3 A0 + 5 edges + 1 A2-zones + 1 n-atlas. |

**Files:**
- Modify: `content/story/canon.md`, `content/spine/edges.json`, `content/spine/nodes/n-atlas.json`
- Modify: `docs/worldbuilding/A0-current-world.md`, `A1-geography-cluster1.md`, `A2-zones-cluster1.md`, `A2-wider-world.md`, `F-043-wider-world-panel.md`, `DR-003-season-1-budget.md`
- Test: none new — `G-CITE`, `G-MEANING` and `scripts/tests/story-*.test.mjs` are the tests

**Interfaces:**
- Consumes: `checkRelations({relations, resolved, fabric})` (Plan D) — its `drifts[]` output is the second work order for this task; `node scripts/check_canon_legs.mjs`'s seven-row table for the authoritative post-redraw distances.

- [ ] **Step 1: Get the authoritative distances**

Run:
```bash
node scripts/check_canon_legs.mjs
node -e '
const e = require("./content/spine/edges.json");
for (const x of e.filter(x => x.kind === "road"))
  console.log(x.id, x.attrs.roadKm + " km", x.attrs.hoursLabel);
'
```
Expected: the seven-leg table with every verdict `OK`, and the eight road legs with their `roadKm` and `hoursLabel`. **Every number you write into prose comes from this output.** Do not re-derive a distance by hand; that is how the last four rounds of drift started.

- [ ] **Step 2: Re-voice `canon.md`'s five markers**

Each marker sits directly under the sentence it invalidates. Replace the sentence *and* delete the marker. Worked example — `content/story/canon.md:210-213` currently reads:

```markdown
- **Gildmark** sits on the coast: reachable from Millcross by the old trade
  road (4–5 days) and from both war towns by a coastal spur (about 3 days).
  **AMENDED-PENDING (I-095): distances now hour-scale on the 400 km world — prose re-voice deferred.**
```
becomes (substituting the real `hoursLabel` values from Step 1):
```markdown
- **Gildmark** sits on the coast: half a day from Millcross by the old trade
  road and an hour and a half from either war town by the coastal spur.
```

Three rules:
- **Re-voice, do not re-number.** "Half a day" reads; "0.5 h" does not. But the phrase must be *true* against Step 1's table — if the road is 2.5 h, "half a day" is a lie and "most of a morning" is not.
- **Delete the marker in the same edit.** A marker left beside corrected prose is worse than no marker.
- **Keep the claim's shape.** If the sentence asserted a *relative* fact ("further from Millcross than Norhollow is"), that relation is what must survive; the absolute number was never the point.

- [ ] **Step 3: Re-voice `A0`, `A1-geography-cluster1`, `A2-zones-cluster1`**

Same procedure for the 11 markers in those three files. Two are structural, not numeric, and need more than a substitution:
- `A0-current-world.md:454` — *"The whole land is crossable in under a week."* On the 400 km world with 13 landmasses this is false at world scale and true at basin scale. Rewrite it to say which: *"The settled basin is crossable in a day; the world beyond it is a season's sailing and no one has crossed it."*
- `A1-geography-cluster1.md:290,319,331` — the reconciliation table, the ridge-line length and the tower spacing. These derive from geometry that the redraw replaced; recompute each from `content/spine/edges.json` and `content/world/resolved/`, and state in the doc that the numbers are derived, with the command that derives them.

- [ ] **Step 4: Re-voice the one surviving node marker, and the five road notes**

**Count what is actually there before you start.** Four of the five node markers are already gone by the time this task runs: `n-cluster1` (2), `n-coldreach` (1) and `n-stonemoor` (1) are regenerated wholesale by Task 6's promotion, which writes `lore: { summary: premise.structuralIdea }` and no `amendedPending` key at all. Only `n-atlas` is carried over verbatim, so it is the only node file still carrying one. The five `attrs.amendedPending` keys in `content/spine/edges.json` **do** survive — `writeRun` carries every authored edge forward whole — so the road notes are the bulk of this step.

```bash
grep -c AMENDED-PENDING content/spine/nodes/*.json content/spine/edges.json
```
Expected before: `n-atlas.json:1` and `edges.json:5`, and **nothing else** — `grep -c` prints `:0` for the other node files. If `n-cluster1.json` still shows 2, the promotion did not regenerate it and Task 6 is incomplete; stop and check `provenance.authored` on that node (it must read `"generated"`).

`content/spine/nodes/n-atlas.json`'s `lore.summary` carries the surviving marker — a "six days out on the trade wind" claim. Re-voice the summary against Step 1's table and **delete the `amendedPending` key** — do not blank it. Then do the same for the five `attrs.amendedPending` keys on `e-trade-road-trunk`, `e-coastal-spur`, `e-east-rim-track`, `e-flat-crossing` and `e-river-road-south` in `content/spine/edges.json`, substituting each edge's own `attrs.hoursLabel` from Step 1.

The four retired markers still need their **claims** honoured, because retiring a marker is not the same as making the sentence true: `n-cluster1`, `n-coldreach` and `n-stonemoor` now carry generated `lore.summary` prose from their premise files, and A2-wider-world.md's day-count claims about those three landmasses are handled in Step 5's amendments rather than here.

```bash
grep -c AMENDED-PENDING content/spine/nodes/*.json content/spine/edges.json
```
Expected after: every count **0**.

**These are node-body edits inside a post-redraw tree**, so re-emit and re-baseline afterwards:
```bash
node scripts/check_spine_emit.mjs --write
node scripts/check_world_digest.mjs --write
node scripts/check_content.mjs --require-complete
node scripts/check_render_lock.mjs --check
```
Expected: the gate PASS; `check_render_lock --check` PASS **without** a re-baseline — `lore` prose does not reach the sheets. If the lock drifts, a renderer is reading a lore field it should not.

- [ ] **Step 5: Amend `A2-wider-world.md` for the promoted continents and the nine seas**

Three amendments the redraw makes true (spec §6.3, D6 default: *promote and amend*):
- **Driftholt and Reedstrand are minor continents**, not chains. Their premises are already in the committed prose; the amendment is one sentence each acknowledging the survey found more ground than the chart showed.
- **`n-westsea` is a sea, not an ocean.** Its own lore already says it is a strip. State the demotion and name its parent ocean, Galereach.
- **The nine marginal seas are named.** Six re-use committed place names (West Sea, Gildmark Roads, Peatrun Shallows, Wreckwater, Netstead Bight, Drowned Pavement, Fumewater, Reed Shallows, Rimewall Margin) — knit each into the existing register in one line, and say which ocean it sits inside.

Keep the epistemic register `A2` §1 already commits to: *sworn* (a master's log), *hearsay* (wharf-talk), *inferred*. A sea named from a single crossing is hearsay and must read as hearsay.

- [ ] **Step 6: Clear the last two line citations**

`F-043-wider-world-panel.md:71` and `DR-003-season-1-budget.md:135` each carry one `canon.md:<digits>`. Task 1 should already have caught them; if `node scripts/check_content.mjs --require-complete 2>&1 | grep G-CITE` prints anything, clear it now.

- [ ] **Step 7: Run G-MEANING and queue what it flags**

Run: `node scripts/check_content.mjs --require-complete 2>&1 | grep "G-MEANING"`

Expected: **empty**. Every non-empty line names a relation, its citation and the drifted value — for example `G-MEANING: relation bearing(c-town-millcross → n-thornveil) declared E ±30°, resolved NNW (338°) — cited at canon.md §4 "Geography & trade logic"; re-voice the prose or re-pin the place`. For each: re-voice the prose if the new ground is better, or move the pin if the prose is load-bearing (Gildmark's monopoly, Millcross's hub status, the Stoneguard holding both ends of one road are all load-bearing). **A re-seed is accepted only when G-MEANING reports zero unresolved drifts** (D3) — this gate blocks promote, so an outstanding drift is a blocker, not a note.

- [ ] **Step 8: Verify and commit**

```bash
grep -rn "AMENDED-PENDING" content docs/worldbuilding | grep -v "docs/superpowers"
node scripts/check_content.mjs --require-complete
node --test 'scripts/tests/citations.test.mjs'
npm test --prefix scripts
git add content docs/worldbuilding
git commit -m "docs: re-voice the deferred distance prose on the redrawn world"
```
Expected: the `grep` prints **nothing** across `content/` and `docs/worldbuilding/`. Markers surviving in `docs/superpowers/specs/` are dated design records and stay (E-C8).

- [ ] **Step 9: Quality gate — verify**

Run: `./scripts/integration.sh --no-install` and paste the output.

- [ ] **Step 10: Quality gate — independent adversarial review**

Fresh reviewer on `git diff HEAD~1`, brief: *"Editorial and factual. (a) Take every re-voiced distance and check it against `node scripts/check_canon_legs.mjs` and `content/spine/edges.json`. Any phrase that is not true of those numbers is a new lie replacing an old one. (b) Did any edit ADD a fact — a new detail, a new place, a new relation? F-033 measured that 4 of 6 defects in a craft pass came from added specificity. (c) Was any `amendedPending` key blanked instead of deleted? (d) Does `A2-wider-world.md` still keep its epistemic register, or has a hearsay sea been written as sworn?"*

- [ ] **Step 11: Quality gate — refactor, re-verify, report**

Apply findings, then: `./scripts/integration.sh --no-install && git branch --show-current && git log --oneline -1`

---

### Task 16: Final green, the rollback drill, and the ship report

The last task proves the three things this plan promised and nothing else. No new code.

**Files:** none created or modified except `docs/superpowers/plans/` progress notes if your executor keeps them.

**Interfaces:** consumes everything; produces the phase report.

- [ ] **Step 1: Run all three harnesses**

Run, and paste each output in full:
```bash
./scripts/precheck.sh --no-install
./scripts/integration.sh --no-install
```
and confirm the CI list by reading `.github/workflows/ci.yml` and running each of its content steps by hand — CI is a **third, different list** and running Gate 2 is not evidence about it.

Expected: every section PASS.

- [ ] **Step 2: Prove the seven canon legs**

Run: `node scripts/check_canon_legs.mjs`

Expected: seven rows, every `verdict` `OK`, every `delta` inside ±8%, and both endpoints of every leg resolving to a pinned record. Paste the table into the phase report — it is the single clearest evidence that the redraw did not break canon.

- [ ] **Step 3: Prove the zone census and the frontier policy**

Run:
```bash
ls content/zones/zone-*.json | wc -l
node scripts/check_content.mjs --require-complete 2>&1 | grep -E "^zones:|zone-hazard"
node -e '
const fs=require("fs"), d="content/world/fabric";
let s=0,r=0;
for (const f of fs.readdirSync(d)) for (const x of JSON.parse(fs.readFileSync(d+"/"+f)).regions)
  x.survey === "surveyed" ? s++ : r++;
console.log("surveyed:", s, "reported:", r);
'
```
Expected: **40** zone files, zero `zones:` failures, and `surveyed: 40 reported: 120`.

- [ ] **Step 4: Prove the citations**

Run:
```bash
grep -rn "canon\.md:[0-9]" content/story content/zones docs/worldbuilding || echo "clean"
node scripts/check_content.mjs --require-complete 2>&1 | grep G-CITE || echo "clean"
```
Expected: `clean` twice.

- [ ] **Step 5: The rollback drill (Mode 1)**

Find the redraw commit and prove a single revert restores a green world:
```bash
REDRAW=$(git log --format='%H %s' | grep "redraw the world from the seed" | head -1 | cut -d' ' -f1)
git checkout -b rollback-drill "$REDRAW"
git revert --no-edit "$REDRAW"
node scripts/check_content.mjs --require-complete
node scripts/check_render_lock.mjs --check
(cd colyseus-server && npm test -- mapDimensions)
git checkout - && git branch -D rollback-drill
```
Expected: the gate, the lock and the jest pin all PASS on the reverted tree. If they do not, the redraw was not atomic — say so plainly in the report; that is a shipping blocker, not a footnote.

- [ ] **Step 6: Prove Mode 2 is real (seed bump)**

A structurally-green world that reads badly is not a revert; it is a seed bump. Prove the loop exists without shipping it:
```bash
node tools/mapforge/generate-world.mjs --seed 7c9e4a2f8b1d6e03 --out /tmp/repro-a --no-png
node tools/mapforge/generate-world.mjs --seed 7c9e4a2f8b1d6e03 --out /tmp/repro-b --no-png
diff -r /tmp/repro-a /tmp/repro-b && echo "byte-identical"
node tools/mapforge/promote-world.mjs --from /tmp/repro-a --dry-run
```
Expected: `byte-identical`, and a `--dry-run` reporting a **no-op** reconciliation (nothing written, nothing deleted) — promotion is a fixpoint. If the dry run wants to change files, `G-REPRO`'s third property is broken and Plan C owns the fix.

- [ ] **Step 7: Prove every artifact is observable**

Run:
```bash
node --test 'tools/asset-storybook/tests/*.test.mjs'
node scripts/check_asset_manifest.mjs
node -e '
const idx = require("./tools/asset-storybook/maps-index.json");
console.log(idx.sheets.length, "sheets indexed");   // 18
for (const s of idx.sheets) console.log(" ", s.id, s.svg);
'
```
Expected: PASS, and one indexed row per `SHEETS` entry — **18**, per `budgets.sheets.maxSheets` and E-C10. The owner rule is not satisfied by a committed SVG — it is satisfied by a row a reviewer can open.

- [ ] **Step 8: Write the phase report**

One page, in this order: the ratio measured on `n-atlas.derived.computedComposition.ocean`; the trunk census against `content/spine/trunk-census.json`; the seven-leg table; `surveyed 40 / reported 120`; the zone census; the G-MEANING result; the rollback-drill outcome; and the two required lines:

```bash
git branch --show-current
git log --oneline -1
```

- [ ] **Step 9: Quality gate — final independent adversarial review**

Fresh reviewer on the whole branch (`git diff main...HEAD --stat`), brief: *"Do not re-review the geometry. Answer five questions with evidence. (1) Is there any commit on this branch that is red on its own? Check out each and run `--only=spine`. (2) Did `colyseus-server/src/config/generated/mapDimensions.ts` change on ANY commit? (3) Is the redraw genuinely one commit, and does `git revert -m 1` on the merge restore a green tree? (4) Does any gate that was failing before this branch now pass because it was weakened rather than satisfied? Diff every `fail(` and `warn(` call site touched. (5) Are there 40 zone records with 40 distinct kind sets and 80 distinct landmark names, verified independently of `zone-allocation.test.mjs`?"*

- [ ] **Step 10: Quality gate — refactor, re-verify, report**

Apply findings as new commits — never `git commit --amend`. Then run Steps 1–4 again in full and paste the output alongside `git branch --show-current` and `git log --oneline -1`.
