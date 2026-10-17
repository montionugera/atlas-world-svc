---
title: "World fill Plan A: unblock and afford — exact geometry, spatial index, places.mjs join authority, render lock"
id: I-097
status: idea
---

# World fill Plan A: unblock and afford

## Approved design and plan already exist — do not re-derive

This idea is the **first of five execution slices** of an already-approved design.

- **Design (approved):** `docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md` (commit `554b81a`)
- **Plan (written, reviewed, repaired):** `docs/superpowers/plans/2026-08-16-world-fill-a-unblock-and-afford.md` (commit `9801f41`)
- Sibling slices: plans B (vocabulary and render), C (fabric layer), D (pinned, bound, relations), E (redraw and prose) in the same directory.

## Problem

The world map is 24.7:1 sea-to-land. Filling it to the target 1.2–1.8:1 multiplies content roughly tenfold, and today's gate and join machinery cannot afford that:

- the overlap kernel is O(n²) over pairs and uses an inexact polygon test;
- four separate consumers each re-implement the place/spine join by hand;
- two sheet emitters hardcode their subject lists;
- there is no byte-level render lock, so committed SVGs can drift silently.

## Why now

Plan A is the prerequisite for Plans B–E and is the only slice that touches **zero content** — the committed map SVGs must be byte-identical when it ends. It is therefore the safest possible starting point and the one that unblocks everything after it.

## Sketch

13 tasks: exact polygon geometry library → swap the overlap kernel → bbox spatial index → three-term load budget (`G-VERTEX-BUDGET`) → `scripts/lib/places.mjs` as the single join authority → re-point four mirror consumers → subject descriptor + de-hardcoded emitters → re-point the spine-alias sweep → the render lock (`G-RENDER-LOCK`) → disarm the parity footgun → prove green and retire the legacy lane → make `checkSpine` callable in-process.

Full task detail, exact commands, measured baselines and the acceptance table live in the plan file. **Read the plan, not this sketch.**
