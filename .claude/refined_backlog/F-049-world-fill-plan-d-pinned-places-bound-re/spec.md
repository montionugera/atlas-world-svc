---
title: "World fill Plan D: pinned places, bound records and relations"
id: F-049
status: refined
from_idea: I-101
---

# World fill Plan D: pinned places, bound records and relations

## Approved design and plan already exist — do not re-derive

This idea is the **fourth of five execution slices** of an already-approved design.

- **Design (approved):** `docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md`
- **Plan (written; pre-review — seam review happens per-phase during execution):**
  `docs/superpowers/plans/2026-08-16-world-fill-d-pinned-bound-relations.md`
- **Running handover state — read first:** `docs/superpowers/plans/world-fill-STATE.md`
  (161 confirmed plan-vs-repo divergences; several are filed specifically as
  **Plan D hazards / Consumes-block entries**, e.g. the Netstead capital pin on c04,
  the `shelterFetchKm` must-read-`narrowWaterKm` hazard, and the pin shape that must
  include `title`).
- Sibling slices: A (unblock and afford — **shipped**, F-046), B (vocabulary and render —
  **shipped**, F-047), C (the fabric layer — **shipped**, F-048), E (redraw and prose).

## Problem

Plan C shipped the world: one seed, 13 landmasses, 160 regions, 1,740 landforms,
45 settlements, byte-identical across runs. But nothing authored is joined to it yet:

- zero pinned places — the six canon towns (Gildmark, Tallowquay, Netstead, …) have no
  generator-honoured anchor on the new ground;
- every generated settlement has `title: null` because **naming is this plan's job**;
  there is a 120-combination name pool against 626 needed names;
- zero civil/bound records and zero relations — no machine-checkable bearing,
  betweenness, distance, adjacency, road-connectivity or co-location claims;
- zero dungeons (60 complexes / 190 floors owed);
- the only join authority for authored content is a legacy mirror.

## Why now

The fabric handles Plan D binds to exist as of F-048 (`content/world/handles/`,
`pinReceipts` headroom reserved in `content/world/fabric/continent-NN.json`). Plan E's
redraw consumes everything this plan produces. The fabric's handles are waiting for
their names.

## Sketch

Per the plan doc: three file families between fabric and renderer —
`content/world/civil/pinned/*.json` (generator inputs: seed point + constraint block),
`content/world/civil/bound/*.json` (generated handle + size band, never a coordinate),
`content/world/relations/*.json` (n-ary claims with prose citations) — plus
`scripts/lib/resolve.mjs` joining them into `content/world/resolved/*.json`, the only
thing renderers read. Gates: `G-PIN-SAT`, `G-BIND`, `G-HANDLE-BAND`,
`G-DUNGEON-REACH`, `G-MEANING`. The pin translation rule fixes the six canon towns at
committed `absoluteAnchor` + shared `PIN_OFFSET = [81, 129]` so `G-CANON-LEG`'s ±8%
residuals survive untouched.
