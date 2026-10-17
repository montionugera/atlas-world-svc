---
title: "World fill Plan C: the fabric layer — seeded 400x400 generator, 13 landmasses / 160 regions / 1,740 landform instances / 45 settlements, committed content/world/fabric + handles, 1.5:1 sea-to-land by construction"
id: I-100
status: captured
---

# World fill Plan C: the fabric layer

## Approved design and plan already exist — do not re-derive

This idea is the **third of five execution slices** of an already-approved design.

- **Design (approved):** `docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md` (commit `554b81a`)
- **Plan (written, reviewed, repaired):** `docs/superpowers/plans/2026-08-16-world-fill-c-fabric-layer.md` (commit `9801f41`)
- **Running handover state — read first:** `docs/superpowers/plans/world-fill-STATE.md` (commit `0330d5e`)
- Sibling slices: A (unblock and afford — **shipped**, F-046), B (vocabulary and render — **shipped**, F-047), D (pinned, bound, relations), E (redraw and prose).

## Problem

Plan A made the gate and join machinery affordable and Plan B built the vocabulary and the
renderer, but **there is still no world**. Today:

- `node tools/mapforge/gen-world.mjs` emits hand-templated rectangles into a gitignored staging
  dir that a human must rename by hand;
- the charted world holds 6,243.5 km² of land in a 160,000 km² frame — sea:land **24.68 : 1**
  against a target of 1.5 : 1;
- nothing produces regions, landform instances, settlements, roads or dungeon anchors, so
  Plan D has nothing to bind authored records to;
- there is no promotion path from a generated run into a real content root, and no proof that
  running one twice is a no-op.

## Why now

Plan D's pinned/bound records need `content/world/handles/*.json` and the fabric they name;
Plan E's trunk redraw is one `promote-world.mjs` run. Both are blocked until the generator
exists and its output is committed and gated.

## Sketch

13 tasks. A throwaway 800 × 800 structure-of-arrays cell grid (0.5 km cells, ~14.7 MB resident,
never committed) driven through 14 ordered passes by `tools/mapforge/generate-world.mjs`:
manifest + budgets + `G-WORLD-BUDGET` → deterministic primitives (seed, integer-hash noise,
grid) → 13 premise files, continental mask, elevation, substrate → sea level by **integer rank
selection** → planar arc topology and one-shot simplification → hydrology (winds, flow, lakes,
deltas, glaciers) → biome classification and region partition → count-targeted landform
instancing and the handle ledger → settlements, roads, sea lanes, dungeon anchors → fabric
emission and the CLI → five new world gates (`G-SEALAND`, `G-TRUNK-AREA`, `G-POI`, `G-ORDER`,
`G-PROVENANCE`) → `promote-world.mjs`, `G-REPRO`, the Node pin and harness wiring → commit the
fabric, wire the review surfaces, retire the old generator.

**The invariant throughout:** Plan C commits **ZERO spine node bytes**. The generator's trunk
output lands only in the gitignored draft folder; Plan E's redraw commit is the one that writes
`content/spine/nodes/`. `check_spine_emit.mjs --check` clean and the `mapDimensions` jest pin
green on every one of the thirteen commits.
