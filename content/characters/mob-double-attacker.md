---
id: mob-double-attacker
assetKey: "mob:double_attacker"
name: "The Twin-Strike"
role: boss
status: shipped
tier: seed
stats:
  archetype: bruiser
  durability: high
  speed: mid
  threat: melee
links:
  story: [faction-unaligned]
---

## Lore

The wall the meadow puts up before it lets you leave. The Twin-Strike hits
twice where everything else hits once — a fast opener that reads as the whole
attack, then a second, heavier blow landing into the gap a dodge leaves behind.
It has no faction because nothing wanted to stand next to it. Newcomers who
learned to trade blows with straylings die here learning that the trade changed.

## Visual Brief

Current mapping: KayKit skeleton set `skeleton_rogue.glb` (seed/market) — the
dual-wield rogue silhouette is the honest read for a two-hit attacker. Boss
scale is larger than the wilds baseline (server radius 8 vs 4); frame the seed
rig taller/heavier at ~2.0u, feet-pivot. Bespoke target when re-forged: a
scarred twin-blade frame that reads as "apex of the unaligned". Seed rig,
default clip map until then.

## Design Notes

`role:boss` — hp 810 and a `boss_area` footprint set it apart from the wilds
(server config `colyseus-server/src/config/mobs/definitions/doubleAttacker.ts`;
numbers stay server-side, v1 boundary). Enum intent: high durability / mid
speed / melee threat. The two-hit cadence is a server behavior, not a stat enum.
