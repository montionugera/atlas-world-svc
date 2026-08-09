---
title: "Seeded map data model: seed + derived file so cluster-1 map detail can grow without hand-authoring every point"
id: I-089
status: idea
design: docs/superpowers/specs/2026-08-09-seeded-map-data-model-design.md
---

# Seeded map data model

**The canonical design is `docs/superpowers/specs/2026-08-09-seeded-map-data-model-design.md`.**
Read that, not this.

## Problem

The cluster-1 world map is drawn from roughly **150 hand-placed points** — measured 2026-08-09:
20 coastline points for 190 km of coast, 20 river points with zero tributaries, ~70 points for all
ten zones (each a 6–7 point rounded polygon), **one** `terrainPatches` entry against the six
terrain fills A1 §7.1 promises, and no settlements below town rank. There is no seed anywhere in
the map data or the renderer: the map is 100% authored, so detail costs an author a coordinate
pair and has stalled at what an author can afford.

## Why now

The map reads as a diagram of blobs rather than terrain, and every proposed fix so far has assumed
more hand-authoring. Splitting canon-bearing features (authored) from texture (generated from a
seed) is what lets detail grow at all — and the repo already has a seed convention in `art-forge`
to follow rather than invent.

## Sketch

Data model only, no algorithms and no rendering change:

- `generation.seed` added to `cluster1-geography.json` as the **only** change to that file, which
  is cross-cutting (the ecology gates G1/G8 validate zone ids and level bands against it).
- A committed, machine-written `cluster1-derived.json` carrying the seed, a `generatorVersion`, a
  `sourceHash`, and four **named streams** (coastline, rivers, terrain, settlements).
- Sub-seeds derived by namespaced hash rather than addition, so streams cannot collide and detail
  is addable without rerolling approved work.
- Generated features are **nameless** — the geography file's own `about` field forbids invented
  proper nouns.
- A five-gate determinism test (`scripts/tests/map-derive.test.mjs`); `tools/mapforge` currently
  has no tests at all.

Deferred to later specs: the generation algorithms themselves, any rendering change, and the
world-tier / cluster-2 question (canon fixes cluster 1 as *"a province, not a continent"*).
