---
id: mob-aggressive-brute
assetKey: "mob:aggressive"
name: "Ashfang Brute"
role: enemy
status: shipped
tier: seed
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

Current mapping (2026-07-19 remap): KayKit monster set `orc_brute.glb`
(seed/market) — mass-forward, top-heavy silhouette fits the brief as-is.
Bespoke target (when re-forged in the KayKit style): bulked frame, crimson
ember markings, ~1.8u. Prior Kenney-kitbash bespoke source retained at
`art-source/bespoke/mob_aggressive_brute/source/`.

## Design Notes

Design intent "tanky, slow, relentless" — server balance numbers remain in
colyseus-server config (v1 boundary).
