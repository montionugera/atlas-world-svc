# F-040 — Millcross town plan (implementation plan)

**Goal, verbatim — do not widen, do not narrow:**

> Produce a top-down town plan for Millcross — roads with real widths, building footprints, the
> ford, the cart yard, the mill — as `content/towns/town-millcross.json`, plus a renderer that
> draws it as an image, plus gate rules that prove it is walkable.

**Design (approved, do not redesign):** `docs/superpowers/specs/2026-08-09-town-plan-view-design.md`
**Handoff (method, constraints, traps):** `docs/superpowers/specs/2026-08-09-town-plan-handoff.md`
**Canon source:** `docs/worldbuilding/A1-geography-cluster1.md` §6

## Settled decisions

| | |
| --- | --- |
| **D1** | town is ~200 world units across |
| **D2** | plan lives in its own local coordinate space, anchored to the geography `at` point |
| **D3** | the collision binder ships with it |
| **D4** | **Millcross only** |

## Scale contract (measured, not invented)

player radius **1.3** · mob radii **3–5** · player speed **20 u/s** · world **1000×1000** ·
static collision bodies today: **4** (the world walls).
Derived: mob-passable cart road must clear **12 units**; player-only alley **4 units**.

## Non-negotiables

- **Mutation-test every gate rule.** Delete the rule, re-run — the suite must go red. A rule whose
  deletion leaves the suite green is unprotected.
- Fixtures **must** include a deliberately sealed courtyard and a road-overlapping footprint, or T4
  and T6 are decorative.
- **Transcribe A1 §6.** Invent only what it leaves open, and say which is which (task 9's table).
- Every task ends with the quality gate: **implement → verify (run it) → independent adversarial
  review → refactor → re-verify.**

---

## Task 1 — Spatial review of existing geography (design §7 deliverable 0)

Read-only pass over `content/maps/cluster1-geography.json`: roads routed sanely · zone polygons
tile · every town `at` lies inside its zone · coast and river do not self-intersect.

Record verdicts in a **new** `docs/worldbuilding/A3-town-plans.md` §0, including the four already
filed zone-polygon overlaps recorded as **explicitly accepted**. Geography is **never written
back** (design §9) — recording is not fixing. Time-boxed.

- **Files:** `docs/worldbuilding/A3-town-plans.md` (new)
- **Verify:** the doc has a verdict per criterion, and every number is reproducible by the inline
  `node` command the doc cites.
- **Mutation test:** none — this task adds no gate rule.

## Task 2 — `content/schemas/town-plan.schema.json`

Draft-07 with `$id`, mirroring `zone-content.schema.json`. `additionalProperties: false` at every
level.

**SHAPE-ONLY.** `width` / `extent` are plain numbers with **no** `minimum`/`maximum`, and footprint
rects carry **no** size floor — the T2/T3 width floors live in the gate. If Ajv rejects the document
first, the T-rule becomes dead code and its mutation will not flip.

Enums that no T-rule owns **do** belong here: `roads[].kind` (`cart` | `foot`) and
`footprints[].kind` (8 values).

- **Files:** `content/schemas/town-plan.schema.json`, `scripts/tests/town-plan.test.mjs`
- **Verify:** `npm install --prefix scripts && npm test --prefix scripts`
- **Mutation test:** drop one `additionalProperties: false` → suite red.

## Task 3 — `scripts/lib/town-geometry.mjs` (pure, no I/O)

`roadPolygon(points, width)` (per-segment swept rect + joint quads) · `rectsOverlap` ·
`polyRectOverlap` · `pointInPoly` · `walkableGrid(plan, { cell: 1.0, playerRadius: 1.3 })` ·
`floodFillRegions(grid)`.

**4-connectivity** — a diagonal-only touch is not walkable. This is *invented, design-open*; state
it as such. Export the constants so a mutation can target them.

- **Files:** `scripts/lib/town-geometry.mjs`, `scripts/tests/town-geometry.test.mjs`
- **Verify:** `npm test --prefix scripts` — L-bend joint has no notch; a two-region grid returns 2;
  a one-region grid returns 1.

## Task 4 — `content/towns/town-millcross.json`

Transcribe A1 §6: river across the middle · ford where the road crosses · roads converging then
ribbon-sprawling out (**no bounded core**) · **no wall and no gate footprints** · the mill-house the
only `storeys: 2` mass, at the race · plank-and-tent quarter on the **east** bank · cart yard plaza ·
`firstSight` = the cart queue landmark. `anchor.geographyAt: [86, 118]`, extent ~220 × 160.

Every invented id and number must be tracked for task 9's canon-vs-invented table.

- **Files:** `content/towns/town-millcross.json`, `scripts/tests/town-millcross.test.mjs`
- **Verify:** the test compiles the schema, validates the file, and asserts via task 3's lib —
  exactly **one** connected region, **zero** footprint↔road overlaps, exactly **one** `firstSight`.

## Task 5 — Gate rules T1 / T2 / T3 / T5 + wiring

Add `checkTownPlan()` to `scripts/check_content.mjs`, mirroring `checkZoneContent` exactly:
**soft-skip** when `content/towns/` is absent or holds no `town-*.json` — placed *before* the schema
is touched, or every existing fixture in `check_content.test.mjs` goes red. Schema-invalid entries
`continue`. T1 uses a `loadGeographyZones`-style town loader. Wire `townCount` through `main()` and
the `finish()` count line.

- **Verify:** `node scripts/check_content.mjs` → `1 towns, 0 failures`, exit 0.
- **Mutation test:** delete T1, then T2, then T3, then T5 **individually** → `npm test --prefix
  scripts` red each time. Record 4 separate red runs.

## Task 6 — T4 / T6 / T7, the geometry rules

Same function, using task 3's lib. Fixtures in `scripts/tests/town-plan.test.mjs` **must** include:

1. a **deliberately sealed courtyard** — four footprints ringing an interior plaza
2. a **road-overlapping footprint**
3. a `firstSight`-unreachable case
4. a zero-`firstSight` and a two-`firstSight` case

Both polarities per rule. The clean baseline fixture sits **exactly on** the floors so nothing has
slack.

- **Verify:** `npm test --prefix scripts` and `node scripts/check_content.mjs`
- **Mutation test:** delete T4 → the overlap fixture goes green (suite red). Delete T6 → the sealed
  courtyard goes green. Delete T7 → the two-landmark fixture goes green.
  **T6 is load-bearing: if its mutation does not flip, fix the fixture, not the rule.**

## Task 7 — Renderer `tools/art-forge/generate/townplan.mjs`

`buildTownPlanSvg({ plan, width, height })` + `renderTownPlanPng({ plan, outPath })`, reusing
`blockin.mjs`'s exact `magick` `execFile` route and its ENOENT → "install imagemagick" error shape.
**No `-blur`** — this is a map, not a ControlNet signal.

Draws water · roads at true width · plazas · footprints (2-storey tonally distinct) · landmarks with
the `firstSight` marked · and a **scale bar in world units** so the 12-unit cart road is visually
checkable.

```
node tools/art-forge/generate/townplan.mjs \
  --plan content/towns/town-millcross.json \
  --out docs/worldbuilding/A3-town-millcross-plan.png
```

- **Files:** `tools/art-forge/generate/townplan.mjs`, `tools/art-forge/tests/townplan.test.mjs`
- **Verify:** `npm test --prefix tools/art-forge` (SVG string assertions only — no `magick` needed
  in CI: road stroke width equals `width`, footprint count matches, `firstSight` marker present),
  then run the CLI and **open the PNG**. The owner must be able to look at it.

## Task 8 — Collision binder

Add a single-path `createStaticBox({ id, center, halfWidth, halfHeight })` to
`colyseus-server/src/physics/PlanckPhysicsManager.ts` — the `planck.World` is private, so mirror
`createWorldBoundaries`' `type: 'static'` plus `entityDataByBody` registration with
`{ type: 'townStatic', id }`.

Then `colyseus-server/src/physics/buildTownStatics.ts` exporting
`buildTownStatics({ plan, physicsManager, origin })` — one static body per footprint, offset by
`origin`. Options-object API only.

- **Files:** the two above, `colyseus-server/src/tests/town-statics.test.ts`
- **Verify:** `( cd colyseus-server && npm test -- town-statics )` and `npm run build`. Tests run
  against both a fake target and a real manager: body count === footprint count · centers at the
  right world offset · **roads, plazas and water produce zero bodies** (pins design §5, "water is
  not collision").
- **Mutation test:** make the binder skip footprints → tests red.

## Task 9 — `docs/worldbuilding/A3-town-plans.md` (extends task 1's §0)

The scale contract table **with its derivation** (mob radius 5 → 12-unit cart road; player 1.3 →
4-unit alley) · the Millcross derivation quoting A1 §6 · an explicit **canon vs invented**
two-column table covering every id and coordinate class in the JSON · the embedded render · design
§10's four open questions carried forward unresolved (water physics, runtime attachment, mobs in
towns, interiors).

- **Verify:** every "canon" row quotes A1 §6 verbatim; every other authored element appears in the
  "invented" column. An unlisted element is the exact defect this table exists to catch.

## Task 10 — Integration sweep

```
npm install --prefix scripts
npm test --prefix scripts
npm test --prefix tools/art-forge
node scripts/check_content.mjs
node scripts/check_content.mjs --require-complete
( cd colyseus-server && npm test && npm run build && npm run format:check )
```

Regenerate the PNG. Re-run the **full T1–T7 mutation sweep in one pass and record 7 reds.**
`git symbolic-ref --short HEAD` before any commit (trap 6).

Gate 1 (`precheck.sh`) runs **neither** the content gate nor the scripts suite (trap 7) — both must
be run by hand.

---

## Traps (from the handoff §6)

1. Fresh worktree has no deps — `npm install --prefix scripts`, `( cd tools/art-forge && npm install )`. **Done.**
2. Never a bare `cd` in a command block — use `--prefix` or an explicit `( … )` subshell.
3. Never `$?` after a pipe — redirect, then read it.
4. `refine` overwrites the backlog `spec.md` with a skeleton — backed up.
5. Another session works this repo concurrently — commit promptly.
6. Check `git symbolic-ref --short HEAD` before committing.
7. Gate 1 runs neither the content gate nor the scripts suite.

## Definition of done

The owner can look at a rendered top-down map of Millcross · the gate proves it is walkable ·
`buildTownStatics` puts one static body under each building.
