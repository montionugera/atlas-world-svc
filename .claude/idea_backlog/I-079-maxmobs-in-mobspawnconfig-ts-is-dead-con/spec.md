---
title: "maxMobs in mobSpawnConfig.ts is dead config: MobLifeCycleManager reads only area.count (:71) and never maxMobs, so the documented per-room cap of 8 does nothing and the room already runs 17 mobs after F-031 — either enforce it or delete it, but stop shipping a number that lies"
id: I-079
status: idea
---

# maxMobs in mobSpawnConfig.ts is dead config: MobLifeCycleManager reads only area.count (:71) and never maxMobs, so the documented per-room cap of 8 does nothing and the room already runs 17 mobs after F-031 — either enforce it or delete it, but stop shipping a number that lies

## Problem

`colyseus-server/src/config/mobSpawnConfig.ts:13` declares `maxMobs: 8` as a per-room cap,
with per-map overrides from 1 (`map-for-test-deflect`) to 10 (`map-for-test-projectile`).
It reads like the room's population ceiling.

**Nothing reads it.** `MobLifeCycleManager` consumes `autoSpawn`, `spawnIntervalMs` and
`respawnDelayMs` from those settings, but population comes only from `area.count`
(`MobLifeCycleManager.ts:71` — `const desiredCount = area.count`). `maxMobs` appears in no
file outside the one that defines it.

The number has been wrong for a while and is getting worse: the runtime spawn table summed
to 12 against a nominal cap of 8 before F-031, and **17** after it. Anyone reading this file
to reason about room load — capacity planning, the AOI work from I-058/F-027, perf budgets —
draws a conclusion the runtime does not honour.

## Why now

F-027 shipped AOI scaling and measured capacity; F-031 pushed the room to 17 mobs. Room
population is now a number people actively reason about, and there is a config file
confidently stating a different one.

## Sketch

Two honest endings — pick one in the brainstorm:

1. **Enforce it.** `maintainAreaPopulation` gains a global check: stop spawning once
   `state.mobs.size >= settings.maxMobs`. Cheap, but it starves whichever areas the loop
   visits last, so per-area `count` values silently become suggestions and the starvation
   order is arbitrary. That needs a deliberate policy (round-robin? priority? scale counts
   proportionally?), not first-come.
2. **Delete it.** Remove `maxMobs` from `MobSpawnSettings` and every override, and let
   `sum(area.count)` be the single honest statement of room population. Add a test pinning
   that sum so growth shows up in a diff.

Deletion is the smaller change and matches how the system actually behaves; enforcement is
only worth it if a real cap is wanted. Either way the file must stop lying — leaving it
as-is with an explanatory comment is not an outcome.
