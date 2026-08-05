---
id: mob-bramble-drake
assetKey: "mob:bramble_drake"
name: "Bramble Drake"
role: enemy
status: concept
tier: seed
stats:
  archetype: bruiser
  durability: high
  speed: mid
  threat: melee
links:
  story: [region-thornveil]
---

## Lore

It does not fly. It pushes through the deep veil at chest height and takes the
canes down with it, which is how you know where it has been. The bramble-kin do
not hunt it. They have a word for the sound it makes and they use the word as
an order to leave.

## Visual Brief

A low four-legged drake the length of a cart, scaled bark-brown with green moss
in the plate seams. The skull is broad and blunt, built for pushing. No
reference art yet: the concept-art pipeline is anchored on humanoid
silhouettes, so quadrupeds cannot be generated with the validated recipe — see
`docs/superpowers/specs/2026-08-05-l4-promote-monsters-design.md` section 1.3.

## Design Notes

Interior-tier bruiser (F-031 derivation rule, tierFactor 1.75): hp 263, radius
5, pAtk 35, speed 8. This is the difficulty step off the route band. `role:
enemy`, not boss — F-030's Thorncrown Drake is the zone's apex and is
hand-tuned. Its bestiary row is `faction-unaligned`, so it is deliberately NOT
added to `faction-thornveil.mobFamily`; the bramble-kin route around it.
