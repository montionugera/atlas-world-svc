---
id: atlas-frontier
title: "Atlas Frontier"
world:
  width: 1000
  height: 1000
playerSpawn:
  x: 500
  y: 500
regions:
  - id: region-spawn-meadow
    title: "Spawn Meadow"
    bounds: { x: 350, y: 350, width: 300, height: 300 }
    spawnPoint: { x: 500, y: 500 }
  - id: region-icefield
    title: "Northern Icefield"
    bounds: { x: 0, y: 0, width: 1000, height: 250 }
    spawnPoint: { x: 500, y: 125 }
  - id: region-thornveil
    title: "Thornveil"
    bounds: { x: 750, y: 250, width: 250, height: 500 }
    spawnPoint: { x: 875, y: 500 }
zoneHazards:
  - { type: freeze, x: 380, y: 110, radius: 60, value: 4, interval: 1000, duration: 2000, regionId: region-icefield }
  - { type: freeze, x: 640, y: 150, radius: 55, value: 4, interval: 1000, duration: 2000, regionId: region-icefield }
  - { type: stun, x: 500, y: 90, radius: 45, value: 1, interval: 1500, duration: 800, castTime: 400, regionId: region-icefield }
mobSpawnAreas:
  - { id: meadow_wilds, x: 400, y: 400, width: 200, height: 200, mobType: balanced, count: 3, regionId: region-spawn-meadow }
  - { id: icefield_stoneguard, x: 300, y: 40, width: 400, height: 170, mobType: defensive, count: 2, spawnIntervalMs: 8000, regionId: region-icefield }
  - { id: thornveil_skirmishers, x: 790, y: 320, width: 180, height: 360, mobType: spear_thrower, count: 4, regionId: region-thornveil }
  - { id: thornveil_route_stalkers, x: 760, y: 300, width: 110, height: 180, mobType: bramble_stalker, count: 2, regionId: region-thornveil }
  - { id: thornveil_route_spearlings, x: 760, y: 520, width: 110, height: 180, mobType: veil_spearling, count: 2, regionId: region-thornveil }
  - { id: thornveil_interior, x: 890, y: 400, width: 95, height: 160, mobType: bramble_drake, count: 1, regionId: region-thornveil }
links:
  - region-spawn-meadow
  - region-icefield
  - region-ghost
---

## Overview

Atlas Frontier is the v0 authored map: a single **1000×1000 world unit** shelf with
the expedition camp dead-center and two escalating wilds fanning off it. All
coordinates below are in world units (the same space as `colyseus-server`
physics and `mapConfig.ts`). Player spawn is `(500, 500)` — the meadow camp — so
the first thing a fresh expedition sees is the safe zone, with danger reachable
by walking, not by teleport.

The three regions are authored as explicit, non-overlapping sub-rects and mirror
the three regions in `content/story/bible.md`. Faction placement follows the
bible's territorial logic (mobs defend home turf; nothing roams for no reason).

## Regions

### Spawn Meadow — `region-spawn-meadow`
Bounds `(350, 350) 300×300`, centered on player spawn `(500, 500)`. This is the
"safe-ish landing" from the bible: a 300u box around camp so a player has a
generous buffer before crossing into any wild. It is deliberately centered, not
offset, so every wild is roughly equidistant — the meadow is the hub, the wilds
are the spokes. Mobs here are **unaligned wilds** (`balanced`, count 3), placed
inside the region at `(400,400) 200×200` so nothing spawns on top of the player.

### Northern Icefield — `region-icefield`
Bounds `(0, 0) 1000×250` — the full northern band. The bible puts the icefield
"~175u north of camp"; because the engine's north is **smaller y** (see
`mapConfig.ts`: `north_ice_fields` sits at `y:250`, `south_mud_pit` at `y:600`),
north is the `y = 0` edge. A 250u-tall band puts its inner edge at `y=250`,
125u north of the meadow's top edge (`y=350`) — matching "first real difficulty
step just north of camp." It is the **Stoneguard's** home turf, so it gets
`defensive` mobs (count 2) at `(300,40) 400×170`, and the natural freeze/stun
hazards the bible calls out: two `freeze` fields and one `stun` field, all
tagged `regionId: region-icefield`. The stun carries a `castTime` (telegraphed),
the freezes pulse on a 1s `interval`.

### Thornveil — `region-thornveil`
Bounds `(750, 250) 250×500` — a tall eastern band. The bible places Thornveil
"east of the meadow"; east is **larger x** (`east_dunes` at `x:550`). A band
starting at `x=750` sits well east of the meadow's right edge (`x=650`), giving
the "dense sightlines / ranged ambush" corridor its own column that does not
overlap the meadow or the icefield. It is **skirmisher** territory, so it gets
`spear_thrower` mobs (count 4) at `(790,320) 180×360`, kept inside the region
bounds.

F-031 adds the zone's first **tiered** population on top of that skirmisher
band, keyed on the depth tiers F-029 established in
`content/bestiary/placement-thornveil.json`: `bramble_stalker` (count 2) and
`veil_spearling` (count 2) on the **route** tier, and a single `bramble_drake`
deeper in as the **interior** step. The existing `thornveil_skirmishers` area
is deliberately untouched — `mob:spear_thrower` is this faction's canonical mob
in `content/story/factions.json`, `content/story/style.md` and
`content/story/bible.md`, and retargeting it would leave canon pointing at a
mob that spawns nowhere.

## Authoring notes

- Region rects are chosen so all three lie fully within the 1000×1000 world and
  do not overlap: meadow `350–650 × 350–650`, icefield `0–1000 × 0–250`,
  thornveil `750–1000 × 250–750`.
- Every `mobSpawnAreas[].regionId` and `zoneHazards[].regionId` references a
  declared region id above — the content gate hard-fails on any dangling ref.
- `mobType` ids (`balanced`, `defensive`, `spear_thrower`) are the real
  `colyseus-server` mob definition ids; the gate hard-FAILs any mobType not in
  the generated `colyseus-server/generated/mob-types.json` (F-013).
- `links` point back at the three bible region ids for coverage cross-check.
- Every `mobSpawnAreas[].id` added from F-031 onward must ALSO exist in
  `colyseus-server/src/config/mapConfig.ts` with the same `mobType` and `count`
  (gate **G-SPAWN-PAIR**). Geometry may differ — the two maps describe
  different worlds until I-015 lands a real map loader. The eight pre-F-031 ids
  are allow-listed in `scripts/lib/spawn-pairing.mjs` as `LEGACY_UNPAIRED`;
  nothing may be added to that list.
