---
id: player-expedition
assetKey: "player"
name: "Expedition Member"
role: player-skin
status: shipped
tier: bespoke
stats:
  archetype: skirmisher
  durability: mid
  speed: mid
  threat: melee
links:
  story: [faction-expedition, region-spawn-meadow]
---

## Lore

You. One of the party that reopened the meadow — not a chosen hero, just the
one still standing at the tent line when the training dummies stopped being
enough. The expedition kit is practical: what you can carry, swing, and repair
in the field. Everything past the meadow is someone else's territory; the
player is the one deciding to walk into it anyway.

## Visual Brief

Current mapping: `player_knight.glb` (bespoke) — KayKit Adventurers knight, the
one bespoke-tier character in the roster, chosen so the avatar the player
inhabits reads a cut above the seed mobs. Scale ~1.8u, feet-pivot, −Z forward.
Single visual for v1 (no per-skin variants yet); a future `player-skin` split
would add sheets sharing this `assetKey` family.

## Design Notes

`role:player-skin`. Server-authoritative movement/combat; the client never
sends position or HP. Player baseline numbers live in `combatStats`
(`PLAYER_STATS`) server-side (v1 boundary). Enum intent: mid/mid, melee —
a neutral baseline the kit builds on.
