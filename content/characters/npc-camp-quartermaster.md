---
id: npc-camp-quartermaster
assetKey: "npc"
name: "Camp Quartermaster"
role: npc
status: shipped
tier: seed
stats:
  archetype: support
  durability: mid
  speed: low
  threat: melee
links:
  story: [faction-expedition, region-spawn-meadow]
---

## Lore

The one who stayed at camp so the others could leave it. The quartermaster
holds the line between the expedition tents and everything past them — not a
fighter by trade, but the fixed point a returning party steers toward. If the
meadow has a heartbeat, it is the quartermaster still being there when you get
back.

## Visual Brief

Current mapping: `cleric.glb` (seed/market) — a calm, robed non-combatant
silhouette that reads as "camp personnel, not a threat". Scale ~1.7u,
feet-pivot. Placed in `region-spawn-meadow` near the tents. Seed rig, default
clip map; no bespoke target planned for v1.

## Design Notes

`role:npc`. A non-combatant anchor; any stats it carries are baseline support
values sourced from server config (`combatStats` NPC/player baselines via the
`addNPC` path), never from this sheet (v1 boundary). Enum intent: support / low
speed / mid durability — a stationary presence, not a combatant. A dedicated
NPC config registry (`src/config/npcs/`, mirroring `src/config/mobs/`) is a
tracked follow-up; today NPCs resolve through `DEFAULT_NPC_STATS`.
