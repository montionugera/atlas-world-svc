---
title: "asset-storybook as an art-direction review surface: baked thumbnail spine + virtualized gallery + reject/rebuild verdicts"
id: I-087
status: brainstormed
---

# asset-storybook as an art-direction review surface

**Canonical spec:** `docs/superpowers/specs/2026-08-08-asset-storybook-review-surface-design.md`
(brainstormed and owner-approved 2026-08-08). This file is the backlog stub; read
the canonical spec before refining.

## Problem

`tools/asset-storybook` was built for the ~60-asset F-002 seed set and now carries
**742 cards** (653 manifest entries + 88 concept-art PNGs). Measured in Chrome with
no scrolling: **643 `<model-viewer>` elements**, **11,268 DOM nodes**, **16.4 MB
transferred at rest**, **92 MB JS heap**, and only **10 of 643 models actually
loaded**.

Three defects follow, beyond slowness:

- **Health can never settle** — `initHealth` counts cards, but lazy 3D never loads,
  so 11 of 23 sidebar dots (including *All*) read `loading…` forever.
- **16.4 MB at rest** — the default Concept Art tab eager-loads 9 PNGs at 1.1–1.5 MB.
- **`Model3d:dungeons (283)`** — the largest section is mislabelled because
  `RENDER_LABELS` is a hand-maintained lookup that falls through silently.

Plus 742 HEAD size-probes per page load that a build step could answer in one fetch.

## Why now

The catalog grew 10× (F-031 promoted monsters, F-026 environment art, the KayKit
dungeon/environment packs). The tool is now the surface where art direction
happens, and it can neither be scrolled comfortably nor trusted.

## Sketch

Baked thumbnail spine (headless Blender for 3D, `sharp` for 2D) with an mtime
staleness gate extending guard (F); virtualized grid holding <400 DOM nodes; a
single live `<model-viewer>` in a detail overlay; taxonomy from a registry with a
gate assertion; health redefined over thumbnails; and a `reject`/`rebuild` verdict
layer written to a committed `content/review-queue.json` that the art pipeline can
consume as a work order.

Spike verified: **0.94 s per model batched, 6.9 KB per thumbnail, ≈10 min for 643,
≈4.4 MB committed, 0 failures across all 7 kinds.**
