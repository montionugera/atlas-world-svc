---
id: mob-spear-thrower
assetKey: "mob:spear_thrower"
name: "Thornveil Spearmaiden"
role: enemy
status: concept
tier: bespoke
stats:
  archetype: skirmisher
  durability: low
  speed: high
  threat: ranged
links:
  story: [faction-thornveil, region-thornveil]
---

## Lore

Thornveil's answer to trespass is a spear from a direction you weren't
looking. Spearmaidens hunt in relays along the bramble lanes east of the
meadow — throw, vanish, reappear forty paces on. They don't hold ground and
don't need to: the veil holds it for them. An expedition that hears two
spears land has already been counted by a third.

## Visual Brief

Bespoke via KayKit-rig path (the proven organic/AI-mesh route): lean
silhouette opposite to the Brute — long limbs, forward lean, high ready
stance. Palette: thorn-green wraps over bark-brown, single ember accent
(trophy from an Ashfang kill). Scale target 1.6u. Spear as a bound prop in
the right hand. Clip mapping (`anims` override): idle→Idle,
walk→Walking_A, run→Running_A, attack→a KayKit throw/2H-thrust clip chosen
at forge time (eyeball candidates), death→Death_A. Verify WALK and ATTACK
visually, not just idle.

## Design Notes

Ranged skirmisher pressure — fast, fragile, repositions. Balance numbers
stay server-side.
