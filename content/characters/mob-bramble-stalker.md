---
id: mob-bramble-stalker
assetKey: "mob:bramble_stalker"
name: "Bramble Stalker"
role: enemy
status: concept
tier: seed
stats:
  archetype: skirmisher
  durability: mid
  speed: high
  threat: melee
links:
  story: [faction-thornveil, region-thornveil]
---

## Lore

A shoot that pulled its own roots up and learned to walk on them. The
skirmishers do not plant these; they only stopped cutting them down. A stalker
moves at the pace of the wind through the canes, which is exactly why nobody
hears it coming.

## Visual Brief

A man-height bundle of green cane walking on a knot of trailing roots. Two
whip-arms of hooked thorn; no head, only a dark hollow at chest height. The
absence of a face is the silhouette — it should read before anything else
does.

## Design Notes

Route-tier melee skirmisher (F-031 derivation rule, tierFactor 1.0): hp 100,
radius 3, pAtk 20, speed 11. Defence element `earth` mirrors the bestiary row.
Numbers stay server-side in
`colyseus-server/src/config/mobs/definitions/brambleStalker.ts`.
