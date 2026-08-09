---
id: mob-veil-spearling
assetKey: "mob:veil_spearling"
name: "Veil Spearling"
role: enemy
status: concept
tier: seed
stats:
  archetype: skirmisher
  durability: low
  speed: high
  threat: ranged
links:
  story: [faction-thornveil, region-thornveil]
---

## Lore

The youngest of the bramble-kin, given a harness of three spears and one rule:
never be where you were seen. A spearling throws, moves, and throws again from
somewhere else. They are not good at it yet. There are a great many of them.

## Visual Brief

A slight figure in bramble-woven leathers, face wrapped, a three-spear harness
across the back. Bare arms scratched from shoulder to wrist. Read as young and
quick — the opposite of the Spearmaiden's practised stance.

## Design Notes

Route-tier ranged skirmisher (F-031 derivation rule, tierFactor 1.0): hp 70,
radius 3, pAtk 20, speed 11, with both a `melee` fallback and the `spear`
throw. Defence element `wind` — the slice's only non-earth mob, chosen so the
F-017 resolution table is exercised on more than one branch. Numbers stay
server-side in `colyseus-server/src/config/mobs/definitions/veilSpearling.ts`.
