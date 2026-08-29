# Spec — I-089 Tier Spine: seeded map data model (all seven phases)

**Release:** 1.8 · **Status:** approved scope — **option 2 (all seven phases)** per research §9 Phases 0–6; Phase 7 remains out of scope per the research's own recommendation. The owner picked option 2 explicitly on 2026-08-09, closing the open decision recorded in HANDOFF.md.
**Sources:** `.claude/idea_backlog/I-089-seeded-map-data-model-seed-derived-file/research.md` (the 981-line tier-spine design) and `HANDOFF.md` in the same folder. Where the two conflict, **HANDOFF.md wins**.

## 1. Overview

One JSON file per place under `content/spine/nodes/<id>.json`, all the same shape: `{ id, tier, parentId, seed, placement, composition }` (plus the supporting fields defined in research §3). `tier` is a **depth**, not a label — world 0, continent 1, region 2, town 3 (with sibling labels sharing a depth: ocean 1, playspace 1, fixture 1, sea 2, site 3, playroot 0) — and a check enforces **child depth = parent depth + 1**, which permanently kills "region means three things". The tree is never stored; a script joins the flat table on `parentId`. Existing files — `content/maps/cluster1-geography.json`, `content/maps/atlas-frontier.md`, `content/story/regions.json`, the town plans — are **not deleted**; they become **generated output** (or gain a foreign key), validated by regenerating from the spine and **byte-comparing**. The whole enforcement surface is `scripts/check_content.mjs` plus `scripts/integration.sh`/CI; the running game server reads none of these files, so runtime blast radius is zero.

## 2. Hard constraints (normative — carried from HANDOFF.md)

These are requirements, not guidance. A phase that violates one is not done.

- **HC-1 — The spine MUST NEVER emit `colyseus-server/generated/spawn-areas.json`.** That file is produced from live server config (`src/config/genSpawnAreas.ts` reads `MAP_CONFIG`) and is the repo's **only** authored-vs-runtime binding, checked by `scripts/lib/spawn-pairing.mjs`. If the spine emitted it, `G-SPAWN-PAIR` would compare content to content and could never fail — silently undoing F-031. The spine emits the **authored side only**; `mapConfig.ts` stays hand-authored.
- **HC-2 — Every new check MUST be demonstrated failing before it is trusted.** For each gate added in any phase, the phase includes a fixture (or a deliberate bad edit, reverted in the same commit series) that makes the gate go red, with the red output captured, before the gate is counted as delivered. Rationale: the research's own Phase 1 was labelled "nothing goes red" and the adversarial review proved all 12 nodes would have failed immediately (the deleted ±5% polygon-vs-rect identity). "RED: none" labels below are **predictions, not evidence**.
- **HC-3 — Cluster 1 measured facts are fixed inputs; do not re-derive.** Cluster 1 has **12 children** (10 zones + `saltmire` + `eastern-hills`; counting only 10 gives a wrong denominator and cost a wasted pass). Unclaimed ground **49.5%** of the 150×190 km sheet; **8 overlapping sibling pairs** (~2.85%, largest `ashvale-front` ∩ `hollowmarch` = 363.6 km²); zone polygon-to-bbox ratios **71.6–83.7%** — therefore any polygon-vs-rect area identity within 5% is unsatisfiable and is banned from the gate set.
- **HC-4 — Town anchor semantics (normative):** a town's `anchor.geographyAt` names the town's **CENTRE-of-interest point in the interior frame, not the origin corner**. Verified: `town-millcross.json` extent 220×160 puts landmark `the-ford` at local `[110,80]` = `[220/2,160/2]`, and its `geographyAt [86,118]` is byte-identical to `towns[0].at` and `river.ford.at` in the geography. The schema carries an explicit `interior.anchorInInterior` field and the gate asserts `originInParent + anchorInInterior / perParentUnit === plan.anchor.geographyAt`. Equating anchor with the corner displaces every town by (110, 80) local units and MUST be rejected by test.
- **HC-5 — `runtime.mapIds` is an array (`string[]`), never a single id.** "Exactly one node per mapId" is unrepresentable: `getMobSpawnAreasForMap` (`colyseus-server/src/config/mapConfig.ts`) special-cases only two test map ids and otherwise returns one shared spawn-area array. One node, many selectors; spawn-area ids preserved byte-for-byte.
- **HC-6 — Lore/canon MAY be rewritten to fit the schema.** Binding owner ruling. Canon conflicts are not blockers and must not be re-raised as such. This licence covers the Phase 1 boundary redraws.

## 3. Data model (summary; research §3–§8 is the authority on field-level detail)

- Node id keyspace `^n-[a-z0-9]+(-[a-z0-9]+)*$`, filename stem === id, one global id namespace shared with feature ids. Two roots ship: `n-atlas` (fiction, km) and `n-playroot` (runtime, world units) — the runtime tree is **never** hung off the fiction continent.
- `seed.value` is a literal 16-hex string per node (never derived from the parent — re-parenting must not reroll), with `epoch` + required `why` on reroll; sub-seeds via `streamSeed(node, name) = first 8 bytes of sha256(seed.value + ":" + name)`. Rerolls go through `spine.mjs reroll <id> [--subtree] --why "<reason>"` (research §6.3): bumps `epoch`, writes `why`, and **skips nodes with `frozen === true`** — so a reroll is a reviewable operation, never a silent one-token diff.
- `placement` is in the **parent's** units; `interior.size`/`originInParent` are **derived** from `bbox(placement)` and byte-checked — except at town nodes, where the plan's `extent` is authoritative and placement is derived from it (research §3.2). Composition percentages are defined over the **placement polygon** area only.
- `frozen` is transitive (ancestors must be frozen) and frozen nodes carry a byte-checked `absoluteAnchor` — enforced by **G-FROZEN** (Phase 1).
- Polygon overlap/union math uses deterministic grid sampling at pinned cell sizes (0.25 km fiction / 1.0 u runtime); shoelace for single polygons, `abs()` nowhere.
- Sibling tables: `content/spine/edges.json` (roads/relays/sealane/canon legs, three-valued endpoints), `sheet.json` (Phase 1), `roots.json` (Phase 0), `frozen-spawn-ids.json` (Phase 4), `load-budget.json` (Phase 0), `coverage-budget.json` (Phase 0).

## 4. Phases

Phase numbering is the research's own (§9). Reds are concentrated in Phases 3, 5, 6 — each a deliberate red-then-fix. Per HC-2, *every* phase additionally demonstrates each new gate failing on a fixture regardless of its "RED" label. The research's §9 phase list leaves five §8 gates unassigned (G-COMP-SUM, G-FROZEN, G-SPINE-COMPLETE, G-LOAD-BUDGET, G-COMP-REPORT's budget half); this spec assigns all five below — an unassigned gate never gets built.

### Phase 0 — the table exists, nothing consumes it (predicted RED: none)

**Deliverables**

- `scripts/lib/spine.mjs` — pure library (load, join, traverse, shoelace, grid-sample intersection, rollup, transform composition) **plus the `reroll <id> [--subtree] --why "<reason>"` subcommand** (research §6.3: bumps `epoch`, requires `why`, skips `frozen` nodes — pure table manipulation, no generator needed). MUST live in `lib/` so tests can import it; `check_content.mjs` is not importable.
- `content/spine/nodes/` with 4 files: `n-atlas`, `n-cluster1`, `n-westsea`, `n-playroot`; plus `roots.json`, `load-budget.json`, `coverage-budget.json`.
- `content/schemas/spine-node.schema.json` — **shape-only**, no numeric bounds anywhere (the gate `continue`s past schema-invalid docs; a duplicated floor makes its gate rule dead code — the discipline `town-plan.test.mjs:105-118` pins).
- `checkSpine()` in `check_content.mjs` wiring **G-ID, G-PARENT, G-TREE, G-DEPTH, G-POLY, G-SEED, G-COMP-SUM** (research §8.3: composition sums 100 ± 0.5, keys ∈ BIOMES, no 0 values — the typo class, a 65 that should be 6.5; the 4 seed nodes already carry composition, so the gate has real input from day one). Soft-skip a content root with no `spine/` directory BEFORE compiling the schema.
- `scripts/spine-tree.mjs` — ASCII tree + coverage printer with a snapshot test. **Hard deliverable**: the flat table has no single file showing the shape of the world; without this printer authors drift back to editing generated mirrors.
- `node tools/mapforge/render-map.mjs --check` added to `scripts/integration.sh` **now** — it is the only existing town-in-zone enforcement and must not go dark during migration.

**Acceptance criteria**

- All 7 gates pass on the 4-node table; each of the 7 demonstrated red on a fixture (HC-2): duplicate/case-colliding id, dangling parent, cycle, depth-skip (e.g. town under continent), clockwise ring, duplicated seed, composition summing to 158.5 (a 65 that should be 6.5).
- `spine.mjs reroll` demonstrated: epoch bumped + `why` written on an unfrozen node; a `frozen` node skipped.
- `spine-tree.mjs` snapshot test green; `render-map.mjs --check` running in `integration.sh`.

### Phase 1 — transcribe the geography; geography still authoritative (predicted RED: none, with two paid debts)

**Deliverables**

- The ~24 remaining fiction nodes: **12 regions** (incl. `n-saltmire`, `n-eastern-hills` — HC-3), 6 towns + 1 camp (tier `town`, tagged `camp`), features, bands, and `edges.json`. `cluster1-geography.json` is **not edited by hand** hereafter.
- `content/spine/sheet.json` — the map-as-artifact (research §3.1: `title`, `subtitle`, `hand`, `noScaleBar`, `scaleBarNote`, `northMark`, the rendered withheld list). Required **before** the geography emitter can be byte-exact: the geography file contains the sheet block (research §1.1).
- Gates added as FAIL: **G-CONTAIN, G-FRAME, G-SCALE, G-ANCHOR, G-NET, G-FROZEN, G-CANON-LEG, G-DERIVED-DRIFT, G-PROVENANCE, G-LOAD-BUDGET, G-COMP-REPORT**. Added as WARN, flipped to FAIL at end of phase: **G-OVERLAP, G-COMP-ROLLUP**. Notes:
  - **G-FROZEN** (research §8.4): `frozen === true` ⇒ every ancestor frozen; `absoluteAnchor` present and byte-equal to the anchor composed through the parent chain. It lands **before** G-CANON-LEG, which depends on both endpoints being `frozen === true` — without G-FROZEN, that dependency means nothing.
  - **G-LOAD-BUDGET** (research §8.5): node count and total spine bytes ≤ `content/spine/load-budget.json`, printed every run — this phase grows the table past 4 nodes, so the cap becomes meaningful now.
  - **G-COMP-REPORT** (research §8.3): prints coverage% + `rollupVerdict` per node with CHECKED/ASSERTED/UNCHECKED totals, **and FAILs when the UNCHECKED count exceeds `content/spine/coverage-budget.json`** — the committed budget that stops a half-built world looking finished; raising it is a reviewed commit.
- The spine→geography emitter behind **G-EMIT-DRIFT** (`--check` only; not yet in CI).
- Two authoring debts paid inside the phase, under the HC-6 rewrite licence:
  - the **8 overlapping sibling pairs** re-authored disjoint;
  - the **49.5% unclaimed ground** split between `n-westsea`'s polygon and `n-cluster1`'s `interstitial`.

**Mitigation (a) — this phase hides a world rewrite, so byte-compare is not sufficient evidence.** Closing the unclaimed ground and the 8 overlaps redraws boundaries; the byte-compare only proves spine and geography agree *after both were changed together*. Therefore Phase 1 additionally MUST deliver:

1. A **before/after coverage rendering** (reuse the HANDOFF recipe: 1 km raster + point-in-polygon over the 12 children; run-length encode or the SVG balloons to ~900 KB — target ~48 KB), committed alongside the change.
2. An **owner-facing boundary-change summary**: one line per redrawn boundary (which pair, which edge moved, approximate km² transferred), plus the before/after unclaimed and overlap percentages. The owner reviews and acks this summary before the phase closes. No automated test can judge whether the redrawn world is the intended one; a human must.

**Acceptance criteria:** all Phase 1 gates FAIL-demonstrated per HC-2 (including: G-FROZEN red on a frozen node with an unfrozen ancestor; G-LOAD-BUDGET red on a lowered budget; G-COMP-REPORT red on an UNCHECKED count over budget); emitter reproduces `cluster1-geography.json` byte-exactly (sheet block sourced from `sheet.json`); coverage rendering + boundary summary delivered and owner-acked; G-OVERLAP and G-COMP-ROLLUP flipped to FAIL and green.

### Phase 2 — geography becomes generated (predicted RED: none)

**Deliverables:** `node scripts/check_spine_emit.mjs --check` (G-EMIT-DRIFT) added to `scripts/integration.sh` and `.github/workflows/ci.yml`, next to the story-graph drift check; the file marked generated in its own `about`.

**Acceptance criteria:** CI red-then-green demonstrated (HC-2): a deliberate hand-edit to `cluster1-geography.json` fails the drift check; reverted. Z1/Z2/G1/G8/T1, mapforge, and `season1.mjs` all still green (they read the byte-identical mirror).

### Phase 3 — the town frame (**first deliberate red**)

**Deliverables**

- `spineId` added to `town-plan.schema.json` and `zone-content.schema.json` (optional in zone-content).
- Gates: **G-TOWN-FRAME** (the HC-4 anchor identity), **G-TOWN-COMP** (union-based partition: `built = area(footprints ∪ roads ∪ plazas)/extent`, `river = area(water \ built)/extent`, each within ±3 pp of declared), **G-TERRAINKIND** (authored, forward-only: implied biomes ≥ 15%).
- `perParentUnit = 100` (1 km = 100 u) and `anchorInInterior` written on the 7 town nodes — the km→u factor entering the repo for the first time.

**Deliberate red-then-fix:** `scripts/tests/town-plan.test.mjs:86-97` (pins "exactly eight object levels" + `additionalProperties:false`) goes red on the new root property — that pin exists precisely to force this edit; fix is one line. **Do NOT** give `spineId` numeric bounds, or `:105-118` reds as well — avoid, don't fix.

**Acceptance criteria:** both pins' outcomes as predicted (`:86-97` red then fixed; `:105-118` stays green); `town-millcross.test.mjs:236-241` stays green; `tools/art-forge/tests/townplan.test.mjs` stays green (path-bound to an unmoved file); G-TOWN-FRAME demonstrated red on a corner-equals-anchor fixture (HC-4/HC-2); G-TOWN-COMP demonstrated red on a wrong `built` value.

### Phase 4 — the runtime root (predicted RED: none)

**Deliverables**

- `n-frontier-shelf` (playspace, under `n-playroot`) + its 3 sites carrying the 6 spawn areas (**ids byte-identical**), the 3 hazard features, the `playerSpawn` feature (declared **inert** — `GameState.addPlayer` unchanged), and the two `fixture` nodes. Sites carry `representsNodeId` cross-links to their fiction nodes.
- `content/spine/frozen-spawn-ids.json` authored and committed: the 8 `LEGACY_UNPAIRED` ids + the 3 F-031 ids. This lands **before** G-SPAWN-ID-STABLE is exercised — the gate compares against this file, not against a previous emit.
- Emitters under G-EMIT-DRIFT: spine→`atlas-frontier.md`, and spine→`colyseus-server/src/config/generated/mapDimensions.ts` (generated TypeScript, imported at build time, pinned by a jest test — never a JSON file read at room create).
- Gates: **G-RUNTIME** (incl. `runtime.originU === originInParent × perParentUnit` composed to root — HC-5 mapIds rules), **G-SPAWN-FIT** (per-area margin ≥ `boundaryThickness(5) + radius(mobType)`), **G-SPAWN-ID-STABLE** (emitted id set **equals** `content/spine/frozen-spawn-ids.json` — equality, not superset), **G-ALIAS** (playspace half), **G-SPINE-COMPLETE** (research §5.3/§8.3: under `--require-complete`, every non-leaf-tier node has ≥ 1 child — without it an empty world is fully green and the commit that *adds* content is the one that turns red; it lands here because `n-playroot` gains its first child in this phase, so the flag can be turned on for both trees).
- One authored value moves: `thornveil_interior` (`atlas-frontier.md:33`) widened `x:890 width:100 → width:95` so its east margin has real slack; the commit message says so.

**HC-1 applies here in full: this phase emits the authored side only.** `mapConfig.ts` stays hand-authored; `genSpawnAreas.ts` keeps producing `generated/spawn-areas.json`; `G-SPAWN-PAIR` keeps two independent sources.

**Mitigation (b) — the spawn check is blind to geometry, and the spec closes that as far as is honest.** `G-SPAWN-PAIR` compares **ids only, never positions**; the authored and runtime tables have described different worlds since F-031, and `spawn-pairing.mjs` states this deliberately. The spec's position:

1. The id-only comparison **stays id-only** — comparing positions across two tables that intentionally describe different worlds would either always fail or force emitting both sides (banned by HC-1).
2. Geometry on the **authored** side is newly gated: **G-SPAWN-FIT** verifies every flattened spawn rect sits inside world bounds with per-mob margin — the first geometric check these rects have ever had.
3. The Phase 4 gate output MUST print, for each paired spawn-area id, the authored rect and the runtime rect side by side as an **informational report** (never FAIL — a failing version would pressure someone into HC-1's tautology). The divergence becomes visible in gate output instead of folklore. Closing the divergence itself is a server change, out of scope (§6).

**Acceptance criteria:** `spawn-pairing.test.mjs:53-66` stays green (the 8 `LEGACY_UNPAIRED` ids verbatim, list not grown); `checkMaps` stays green; the mapDimensions jest test green; G-SPAWN-FIT demonstrated red on a rect with insufficient margin, G-SPAWN-ID-STABLE demonstrated red on a renamed id, G-SPINE-COMPLETE demonstrated red under `--require-complete` on a childless non-leaf-tier fixture (HC-2); the side-by-side geometry report present in output.

### Phase 5 — the story foreign key (**second deliberate red**)

**Deliverables:** `spineId` added to `region.schema.json` as optional; all 10 records populated; the story half of **G-ALIAS** added as WARN, then both flipped to required/FAIL. G-ALIAS sweeps every external spatial reference (story regions, zone content, bestiary placements + `bestiary.json[].region`, town plans, `content/characters/*.md#links.story`, `art:town-*` manifest keys) and **prints each record's resolved tier** — `region-millcross → n-millcross (town)` makes the tier contradiction visible in output. No renames (story re-tiering is out of scope, §6).

**Deliberate red-then-fix:** five test files with synthetic region fixtures go red — `story-refs.test.mjs:84,:87`, `story-acts.test.mjs:76-78`, `story-unlocks.test.mjs:75-77,:144`, `story-fates-lore.test.mjs:75-77`, `tools/story-explorer/tests/smoke.test.mjs:62`. Fix is one field per fixture, five files.

**Acceptance criteria:** exactly those five files red then fixed; `story-graph-drift.test.mjs` and `docs/story/story-graph.md` stay green (a field was added, not a node — no regeneration); G-ALIAS demonstrated red on a dangling `spineId` (HC-2); tier printout present.

### Phase 6 — the gate counter (**third deliberate red, shipped alone**)

**Deliverables:** `N nodes` added to `finish()`'s contract line (`content-gate: N sheets, N maps, N story, N placements, N zones, N towns, N failures, N warnings`).

**Deliberate red-then-fix:** ~12 assertions regexing that line across `zone-content.test.mjs`, `town-plan.test.mjs`, `season1.test.mjs`, and the story tests. Shipped as **its own commit** so the diff is unambiguously "counter added".

**Acceptance criteria:** the regex updates and the counter land in one isolated commit; full `scripts/` suite green after.

### Cross-cutting (all phases)

- Content gates run only at Gate 2 (promote) and CI today; **add `node scripts/check_content.mjs --only=spine` to `scripts/precheck.sh`** (Gate 1) so per-feature ships pay for the structural gates (cycles, orphans) but not the whole content sweep (~1 s).
- `checkSpine()` output prints coverage % and `rollupVerdict` (CHECKED / ASSERTED / UNCHECKED) for every node on every run, with totals and the load-budget line. The rollup's *coverage percentages* are honest reporting at tiers where towns are 0.28–0.53% of their parent — but two halves of it are hard gates: the UNCHECKED count over `coverage-budget.json` FAILs (G-COMP-REPORT), and node count / spine bytes over `load-budget.json` FAILs (G-LOAD-BUDGET).

## 5. Verification summary

- **Per phase:** the phase's gates demonstrated red on fixtures (HC-2), then green on real content; the predicted red/green test outcomes matched or the mismatch is explained in the phase's commit; `scripts/` suite + `integration.sh` green; mirrors byte-identical under G-EMIT-DRIFT.
- **Phase 1 additionally:** owner ack on the boundary-change summary + coverage rendering (the only non-automatable acceptance in this spec).
- **End state:** four former source-of-truth artifacts are generated mirrors or foreign-keyed; the spine is the single authoring surface; all research §8 gates are wired (none left unassigned); `spine-tree.mjs` shows the world; every spine failure is catchable at Gate 1 (`--only=spine`), Gate 2, and CI.

## 6. Out of scope (release 1.8)

- **Phase 7 — retiring the mirrors** (`cluster1-geography.json`, `atlas-frontier.md`). Explicitly deferred by the research: deletion reddens Z1/Z2, G1/G8, T1, ~52 id references and seven checked-in fixtures; keeping the mirrors costs one drift check per CI run and buys the entire existing gate surface unchanged.
- **Rendering changes** — `render-map.mjs` is added to CI, not modified; committed SVG/PNG unchanged.
- **Generation algorithms** — no terrain/settlement/name synthesis; `seed` + `streamSeed()` define the contract only; every 1.8 node is `authored: "hand"`. (The `spine.mjs reroll` subcommand ships in Phase 0 as bookkeeping — it rolls seeds, it generates nothing.)
- **Server behaviour** — no change to spawning, physics, AOI, room creation; `playerSpawn` inert; `buildTownStatics` uncalled in production; hardening client-supplied `mapId` in `GameRoom.onCreate` is a separate budgeted change (research open question 4).
- **Closing the authored-vs-runtime spawn geometry divergence** (F-031 legacy) — reported, not fixed (§4 Phase 4).
- **Story re-tiering** — `region-millcross` keeps its name; the `spineId` foreign key + printed tier is the whole intervention.
- **Raising region-tier coverage** — authoring `site` children that tile regions is real content work; the 60% coverage floor is a reporting line in 1.8, a possible FAIL gate in 1.9 (research open question 2).
- **Art, assets, manifest keys.**

## 7. Open questions for the owner (non-blocking; defaults stated)

1. km→u factor = 100 (default: yes — Millcross 2.2×1.6 km; one-way door for future town plans).
2. `n-atlas` sized 2000×2000 km (default: yes — sizing to the first sheet makes cluster 2 the most expensive edit in the model).