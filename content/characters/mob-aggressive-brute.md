---
id: mob-aggressive-brute
assetKey: "mob:aggressive"
name: "Ashfang Brute"
role: enemy
status: shipped
tier: bespoke
stats:
  archetype: bruiser
  durability: high
  speed: low
  threat: melee
links:
  story: [faction-ashfang]
---

## Lore

The Ashfang packs' front line. Brutes are the ones that stopped running with
the pack and started walking at things — scar tissue where hide used to be,
ember-red markings earned by surviving what should have killed them. A brute
does not stalk. It sees you, it comes, and the rest of the pack reads its
charge as the signal to close.

## Visual Brief

Built (retrofit — matches `mob_aggressive_brute.glb`): Kenney
`character-male-b` kitbash — bulked torso and arms, shrunk head, crimson
colormap, scaled 0.66u → 1.8u. Silhouette read: mass forward, top-heavy.
Source .blend: `art-source/bespoke/mob_aggressive_brute/source/`.

## Design Notes

Design intent "tanky, slow, relentless" — server balance numbers remain in
colyseus-server config (v1 boundary).
