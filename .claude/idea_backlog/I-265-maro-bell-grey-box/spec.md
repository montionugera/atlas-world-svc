---
title: "Maro Bell grey box"
id: I-265
status: idea
---

# Maro Bell grey box

## Goal
Step 2 of the owner's fast track: a walkable grey-shape model of Maro Bell, the Maro Folk starter town, to test scale before any art. Owner said "go" on 2026-11-07. Plain grey shapes only: The Great Bell, the winding main road, lanterns, building blocks, and spots for the six F-180 town NPCs. No real art, no talking NPCs, no quests, no shops.

## Problem
Maro Bell exists only as words: `content/studio/canon/glossary.json` (`landmarks.maro_bell`, `npcs.town.maro_bell`) and the F-180 spec. Nobody can stand in it, so nobody can tell whether a 1 m character next to The Great Bell feels like "Tiny Human, Massive World" or like a toy diorama.

## Town home (decision)
- A playable town lives in `content/maps/<map-id>.json`, the version-3 map document both runtimes already load: `server-rs` `MapConfig::load` -> `load_generated_region_config` reads `content/maps/<id>.json` for any unknown map id, and the Godot client reads the same file through `UnifiedMapDocument.LoadOrDefault`.
- `content/towns/town-*.json` (the F-040 town-plan format, only Millcross) is an old-world design plan, gated against `content/world/resolved#towns`, which has no Maro Bell. New towns do not go there.
- Map id: `maro-bell`. The studio node for this town is still `town-lantern-hollow` (map id `lantern-hollow`) under its old name; joining the node to `maro-bell` is part of the rename idea I-264, not this feature.

## Layout (from F-180: hanging lanterns -> village road -> Great Bell -> porcelain ribs)
South to north, the road climbs the whole way so the bell stays in view:
1. **Arrival** (south): valley-mouth gate block, Reed's spot, Pip's spot, and a scale row of 12 grey posts at the six races' heights (man and woman each).
2. **Market bend:** Amber's oil shop block on the road.
3. **Lantern Row:** Bram's lantern house block and one marked "old lantern" post.
4. **Bell Terrace** (north): Tovin's shrine block, Edda's spot, The Great Bell hanging between two cliff blocks.
5. Valley walls on both sides, with tall thin "porcelain rib" blocks against them. Lantern posts line the road. Exit gate south toward Kilnwatch Bastion (q-maro-08).

NPC spot placement is Claudia's proposal (F-180 places no one); the owner may move any of them.

## Scale (working numbers, owner may amend)
- 1 server unit = 0.1 m (`coord_scale` 0.1).
- Race heights scale the F-182 lineup ratios so the tallest (Daro Guard man) is 1.2 m, the top of the repo's character band `characterScaleBandMeters` [0.9, 1.2]: Daro Guard M 1.20 / F 1.11; Maro Folk, Linde Folk, Silme Seers M 1.03 / F 0.94; Tava Kin M 0.91 / F 0.82; Ondo Forge M 0.84 / F 0.77. Ondo Forge and the Tava Kin woman fall below the 0.9 m band floor; this is reported, not fixed.
- Starting sizes: whole map 80 m x 160 m; road 4 m wide; lantern posts 2.5 m; houses 6-8 m footprint, 4-5 m tall; cliffs 30 m tall; The Great Bell 8 m tall, hanging 10 m above the terrace.

## Scope
- `content/maps/maro-bell.json`: the map document with the layout above. Every grey block that a player should not walk through also has a matching `staticObstacles` rect, so the server (which collides) and the client (which draws) agree.
- Godot client: grey blocks need a generic box shape and a floating name label. Add the smallest structure kind that does this (for example `kind: "block"` with size and an optional label) to the existing structure renderer in `game-client/src/World/MapChunkStreamer.cs`; do not add new art assets.
- Godot client: `VerticalSliceRoot` loads a hard-coded `freja-south-gate`; make it read the map id from `ATLAS_MAP_ID` (same env name as `Core/Config.cs`), default unchanged.
- Review surface: screenshots from Godot (one top-down, one from player eye height at the arrival gate looking toward the bell) shown on the edit host (:8789), per the every-artifact-observable rule.
- Out of scope: NPC behaviour, dialogue, quests, shop, real art, the I-264 renames, the studio node and runtime manifest.

## Acceptance criteria
- [ ] `content/maps/maro-bell.json` exists and `server-rs` loads it: a Rust test calls `MapConfig::load("maro-bell")` and gets the authored width/height and a non-empty `static_obstacles` (not the legacy fallback).
- [ ] The map holds, each with a stable id: The Great Bell, two cliff walls, at least 4 porcelain ribs, the winding main road route from south gate to bell terrace, at least 12 lantern posts along it, blocks for the gate, Amber's shop, Bram's house, Tovin's shrine, an old-lantern marker, six NPC spot markers labelled Bram, Pip, Edda, Amber, Reed, Tovin, and 12 race-height posts. A node test checks every one of these ids is present.
- [ ] A node test checks the race-height posts match the Scale table within 0.01 m, and that every solid block has a matching static obstacle.
- [ ] The player spawn sits at the arrival gate, and the road route connects spawn to the bell terrace without crossing a static obstacle (node test).
- [ ] Godot: `ATLAS_MAP_ID=maro-bell` loads the town in the main scene and the grey blocks and labels render; an env-gated probe run through `scripts/godot-verify.sh` prints PASS; default map id still `freja-south-gate`.
- [ ] Two Godot screenshots (top-down, eye height at the gate) are committed and visible on the edit host at a tested deep link.
- [ ] Gate 1 (`./scripts/precheck.sh`) green.
