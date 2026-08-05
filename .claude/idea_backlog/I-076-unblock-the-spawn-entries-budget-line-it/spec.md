---
title: "Unblock the spawn-entries budget line: its blockedBy reason is stale — F-030/F-031 resolved the variant axis (a species is its own MOB_TYPES entry, element? exists), and there is now a real 6-row authored spawn table; add a spawnEntries measure to scripts/lib/season1.mjs and clear the blocker"
id: I-076
status: idea
---

# Unblock the spawn-entries budget line: its blockedBy reason is stale — F-030/F-031 resolved the variant axis (a species is its own MOB_TYPES entry, element? exists), and there is now a real 6-row authored spawn table; add a spawnEntries measure to scripts/lib/season1.mjs and clear the blocker

## Problem

`content/season-1-budget.json` still carries:

```json
{ "id": "spawn-entries", "target": 120,
  "blockedBy": "the variant axis does not exist on MobTypeConfig (spec 9 q2)" }
```

**That reason is now false.** F-030 established that a species is simply its own
`MOB_TYPES` entry, and added `element?: Element` to `MobTypeConfig`; F-031 minted three
more species the same way and authored a real spawn table. There is no missing axis.

The consequence is that the line is permanently dark: `scripts/lib/season1.mjs` has no
`spawnEntries` measure, and `buildRows` reports `actual = null` for any line carrying a
`blockedBy`. So the report prints `-` forever and nobody can see progress against a target
of 120 — while the authored table quietly grew from 3 rows to 6.

## Why now

F-031 just doubled the authored spawn table and added **G-SPAWN-PAIR**, which guarantees
every authored area has a runtime counterpart with matching mobType and count. That gate is
what makes the authored table a trustworthy thing to count — before it, the two halves
could disagree silently. This is the cheapest moment to turn the line on.

## Sketch

1. Decide what an "entry" is. The budget's own `source` says *"12 species per zone x 10
   zones"*, so an entry is one **spawn-table row**, not one mob instance. Today: 6 authored
   rows against a target of 120.
2. Add `spawnEntries(root)` to `scripts/lib/season1.mjs` — count `mobSpawnAreas[]` across
   `content/maps/*.md`. Register it in `MEASURES`.
3. Drop the `blockedBy` key from the `spawn-entries` line, add `"measure": "spawnEntries"`.
4. Extend `scripts/tests/season1.test.mjs` with a fixture case.

**Open question for the brainstorm:** 120 assumed 12 species per zone across 10 zones, but
only ONE authored map exists and the `zones` line is itself blocked on keyspace unification
(P1). The target may need re-deriving rather than merely unblocking — check whether 120 is
still the honest number before wiring a measure to it.
