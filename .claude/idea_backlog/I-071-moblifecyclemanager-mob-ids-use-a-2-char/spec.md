---
title: "MobLifeCycleManager mob ids use a 2-char suffix and collide on burst spawn"
id: I-071
status: idea
---

# Mob ids collide when many spawn in one tick

## Problem

`MobLifeCycleManager.spawnMobAt` derives ids as `mob-debug-${tick}-${rand2}`, where `rand2` is a **2-character base36 suffix — 1,296 possible values**. Within a single tick the `tick` component is constant, so the whole id space for that tick is those 1,296 values.

Spawning 200 mobs in one tick gives roughly **15 expected collisions** by the birthday bound; **17 were observed** in practice while building F-027's tests. `MapSchema.set` **overwrites silently** on a duplicate key, so the room ends up with fewer mobs than were requested, and no error is raised.

Two consequences beyond the missing mobs:

- Any burst-spawn path — a debug or admin bulk-spawn command, a wave spawner, a boss adds phase — quietly under-delivers.
- With per-client `StateView` filtering now in place, a rebound id is a correctness hazard rather than just a counting one. (The specific stale-reference path was fixed in F-027, but the id collision that triggers it was left alone.)

## Why now

Two independent pieces of work (F-027's bandwidth test and its load harness) each had to work around this by artificially advancing `state.tick` between spawns. When two consumers in a row need the same workaround, the underlying API is wrong.

## Sketch

- Replace the random suffix with a monotonic per-room counter, or widen the suffix enough that collisions are implausible.
- Make the collision detectable regardless: have the spawn path assert the key was absent before `set`, so a duplicate fails loudly instead of silently overwriting.
- Add a test that burst-spawns 1,000 mobs in one tick and asserts 1,000 distinct mobs exist.
- Remove the `tick`-advancing workarounds from `bandwidth.test.ts` and `roomLoad.harness.ts` once fixed.
