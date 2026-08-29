---
title: "World fill Plan B: vocabulary and render — 170-type landform lexicon, four schemas, 20 biomes, 40 glyph families, deterministic label declutter, baked-texture rasteriser"
id: F-047
status: refined
from_idea: I-099
---

# World fill Plan B: vocabulary and render

## Approved design and plan already exist — do not re-derive

This idea is the **second of five execution slices** of an already-approved design.

- **Design (approved):** `docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md` (commit `554b81a`)
- **Plan (written, reviewed, repaired):** `docs/superpowers/plans/2026-08-16-world-fill-b-vocabulary-and-render.md` (commit `19ca44d`)
- **Running handover state — read first:** `docs/superpowers/plans/world-fill-STATE.md` (commit `8ee43d3`)
- Sibling slices: A (unblock and afford — **shipped**, F-046), C (fabric layer), D (pinned, bound, relations), E (redraw and prose).

## Problem

Plan A made the gate and join machinery affordable, but the repo still has no vocabulary to
describe the world it is about to generate, and no renderer that can draw it:

- there is no landform lexicon at all — nothing names the ground a generator would place;
- `content/spine/edges.json` has never had a schema, and there is no schema for a landform
  instance or a typed spine feature;
- `scripts/lib/spine.mjs` carries 12 biomes and 7 terrain kinds, against a target of 20 and 18;
- `draft.mjs`'s ink layer cannot fill a biome, has no glyph library, and stacks labels greedily;
- nothing has ever rendered at target density, so "it will be too slow" is a guess in both
  directions.

## Why now

Plan C's fabric generator consumes the vocabulary half (Tasks 1–5) as a stated handoff boundary,
and Plan E's redraw depends on the render half being proved against today's *small* chart, where
a regression is still visible by eye. Building the renderer after the world exists means every
render defect and every content defect arrive in the same diff.

## Sketch

12 tasks in two halves with a hard boundary.

**Vocabulary (1–5, the Plan C handoff):** the 170-type lexicon + its schema → the landform
instance schema and a typed `features[]` on the node schema → the first-ever `edges.json` schema
→ hoist `derived` out of the node files into one `content/spine/derived.json` sidecar → grow
`BIOMES` 12→20 and `TERRAIN_KINDS` 7→18, add `content/world/budgets.json`, and gate both with
`G-LANDFORM` + `G-SHEET-BUDGET`.

**Render (6–12):** close the ink loop with 20 biome fills, 18 terrain fills and `G-BIOME-INK` →
40 distinguishable glyph families (`G-GLYPH`) → deterministic Imhof label placement with zoom
tiers (`G-LABEL`) → a hand-written-zlib baked-texture rasteriser and `GENERATOR_VERSION` → a
committed synthetic canary sheet at full target density (13 landmasses, 160 regions, 1,740
glyphs, 340 labels) that must render clean and rasterise in ≤ 2 s at 2000 px → PNGs out of the
review loop as ≤ 512 px thumbs plus the storybook vocabulary panel → and finally the single
permitted re-ink of the two live sheets.

**The invariant throughout:** the world never moves. `check_spine_emit --check` clean and the
`mapDimensions` jest pin green on every one of the twelve commits; the render lock re-baselines
exactly once, in Task 12.
