---
title: "Boss tier scaling at spawn"
id: I-177
status: idea
---

# Boss tier scaling at spawn

## Problem

Every mob spawn currently uses `MobTier::Route` (1.0x multiplier), so boss spawns have the exact same health, damage, and scale as ordinary route mobs.

## Acceptance criteria

- [ ] `MobTier::Boss` scales a mob to at least `3.0x` (`BOSS_HP_MULTIPLIER = 3.5`) the max health and higher attack power (`BOSS_ATK_MULTIPLIER = 2.5`) than a `MobTier::Route` mob of the same bestiary entry.
- [ ] Boss spawns spawned via `mob_bundle` carry `BossTag` (with `visual_scale = 1.5`) and a larger `BodyRadius` than route mobs.
- [ ] Map `SpawnArea` definitions and `AtlasSimulation` preserve `MobTier::Boss` when spawning and respawning boss anchors.
