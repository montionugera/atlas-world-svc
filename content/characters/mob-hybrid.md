---
id: mob-hybrid
assetKey: "mob:hybrid"
name: "Wilds Caster-at-Arms"
role: enemy
status: shipped
tier: seed
stats:
  archetype: skirmisher
  durability: mid
  speed: mid
  threat: ranged
links:
  story: [faction-unaligned]
---

## Lore

A strayling that learned a second answer. The hybrid opens at range — a thrown
strike to make you move — then closes to finish what the throw started. It is
not disciplined like the Thornveil skirmishers; it just refuses to be a pure
melee target or a pure ranged one, and that ambiguity is what makes it awkward
to fight. Read it wrong and it punishes both the rush and the retreat.

## Visual Brief

Current mapping: KayKit skeleton set `skeleton_mage.glb` (seed/market) — the
robed/caster silhouette sells the "throws something, then commits" read even
though the projectile is a spear, not a spell. Scale ~1.6u, feet-pivot. Seed
rig, default clip map; no bespoke target planned.

## Design Notes

Design intent "range then commit" — server numbers
(`colyseus-server/src/config/mobs/definitions/hybrid.ts`, which layers a spear
throw over a melee close) stay server-side (v1 boundary). Enum intent: mid
durability / mid speed / ranged threat (the opener defines the archetype).
