---
id: mob-thorncrown-drake
assetKey: "mob:thorncrown_drake"
name: "Thorncrown Drake"
role: boss
status: concept
tier: seed
stats:
  archetype: bruiser
  durability: high
  speed: mid
  threat: melee
links:
  story: [faction-unaligned, region-thornveil]
---

## Lore

The old one the bramble drakes get out of the way for. It has lived in the deep
veil long enough that the canes grow through its back plates, and it carries a
hedge on its spine wherever it goes. The bramble-kin have routed their lanes
around it for two generations and will not say why out loud. Nothing in the
Thornveil disputes the ground it is standing on.

## Visual Brief

A heavy four-legged drake the size of a barn: bark-brown plates with living
black cane rooted along the spine, head crowned in thorn growth and old
scarring. Seed rig until re-forged — frame it markedly larger than the wilds
baseline (server radius 9 vs 4), feet-pivot, and read the turn as slow. Bespoke
target when forged: the crown of cane should be the silhouette, visible before
the head is.

## Design Notes

`role:boss` — hp 1400, radius 9 and a solo `boss_area` footprint set it apart
from the wilds (server config
`colyseus-server/src/config/mobs/definitions/thorncrownDrake.ts`; numbers stay
server-side, v1 boundary). Enum intent: bruiser / high durability / mid speed /
melee threat, matching its bestiary row.

Defence element `earth` mirrors the bestiary row and is a documented exception to
G-ELEM — see `docs/superpowers/specs/2026-08-04-l3-boss-design.md` section 3.2.
The slow rotation is the telegraph: the wind-up is long enough to walk out of.
