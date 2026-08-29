---
title: "basin-sheet.mjs and resolveWorld are permanently dead production code"
id: I-118
status: idea
---

# basin-sheet.mjs and resolveWorld are permanently dead production code

## Problem

`tools/mapforge/lib/basin-sheet.mjs` (30.3 KB) and `scripts/lib/places.mjs#resolveWorld` are permanently dead production code after ruling 8 (Plan E's Task 6, ratified 2026-08-26/27) retired the cluster1 basin sheet from the `SHEETS` registry. Ruling 8 kept both as Task 8's raw material; Task 8 (continent-zoom tier, shipped 2026-08-29) ended up reading `content/world/resolved/` directly instead and never called either. Verified via grep at 786a709: no production caller of `basin-sheet.mjs`'s exports or of `resolveWorld` remains; `places.test.mjs`'s arm-3 assertion ("no production path calls them") is the only thing that reads this fact, and it currently asserts the negative on purpose.

## Why now

Filed explicitly as an owner question by both Task 8's report and its review (STATE §28, 2026-08-29): "their permanent dormancy is a dead-code question for an owner — filed below, not decided here." Deleting them retires their own tests too, which is a deliberate call nobody has made yet.

## Sketch

(rough shape; not a design yet)
