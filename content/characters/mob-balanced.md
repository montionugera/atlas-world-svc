---
id: mob-balanced
assetKey: "mob:balanced"
name: "Meadow Strayling"
role: enemy
status: shipped
tier: seed
stats:
  archetype: bruiser
  durability: mid
  speed: mid
  threat: melee
links:
  story: [faction-unaligned]
---

## Lore

The baseline of the wilds — no specialty, no trick, just a thing that has
lasted long enough to be dangerous to a newcomer and forgettable to a veteran.
Straylings hold the middle of every scale: they take a fair hit, close at a
fair pace, and give ground only when it costs them nothing. If the meadow has a
"normal", this is it, and everything else is measured against it.

## Visual Brief

Current mapping: KayKit skeleton set `skeleton_minion.glb` (seed/market) —
lean humanoid skeleton, neutral silhouette that reads as "generic hostile",
which is exactly the role. Scale ~1.6u, feet-pivot. No bespoke target planned;
the seed rig carries it. Kenney/KayKit default clip map.

## Design Notes

Design intent "the mid-point of everything" — server balance numbers
(`colyseus-server/src/config/mobs/definitions/balanced.ts`) remain the source
of truth (v1 boundary). Enum intent: mid durability / mid speed / melee threat.
