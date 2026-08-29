---
title: "Five weak gate assertions have wide headroom or cannot fail"
id: I-116
status: idea
---

# Five weak gate assertions have wide headroom or cannot fail

## Problem

Five assertions confirmed still live at 786a709, each weak in a distinct way, none technically broken: (a) `scripts/tests/trunk-census.test.mjs`'s `ids.length <= budget.maxNodes` compares 36 actual nodes against `content/spine/load-budget.json`'s `maxNodes: 96` — 62.5% headroom, won't catch runaway growth until the trunk nearly triples; (b) `scripts/tests/world-budget.test.mjs:592` derives its expected ink figure with the same stats the gate itself uses, so agreement is partially circular; (c) `scripts/tests/zone-content.test.mjs` has no positive lower bound on target — a budget of 0 passes with zero records; (d) `scripts/tests/resolve.test.mjs:263` treats a global census as a basin-local bound — a town on another continent would falsely red it; (e) `tools/mapforge/tests/generate-world.test.mjs`'s translation-equality check is self-declared unarmed on an idempotent run. Also related: G-BIOME-INK's per-sheet check is circular at the committed legend tier — every legend row draws its own swatch, so `referenced ⊆ emitted` by construction on all continent sheets, and the `legendTier` param that would make it demonstrable is never passed on the shipped path.

## Why now

Filed across the bc393a4 review and Task 8 (STATE §28, 2026-08-28/29). None is currently failing to catch a real regression — each is a known soft spot with wide margin, worth tightening incrementally rather than urgently.

## Sketch

(rough shape; not a design yet)
