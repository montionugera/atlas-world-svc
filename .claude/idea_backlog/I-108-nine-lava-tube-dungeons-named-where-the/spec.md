---
title: "Nine Lava Tube dungeons named where the fabric draws only one"
id: I-108
status: idea
---

# Nine Lava Tube dungeons named where the fabric draws only one

## Problem

`content/world/resolved/continent-0{2,4,5,7,9}.json#dungeons` name nine dungeons "Lava tube 1"-"8" plus "Ashen Spar Lava Tubes", spread across five continents (c02, c04, c05, c07, c09) — verified live at 786a709. The fabric draws exactly ONE `lava-tube`-type landform in the whole world, on `c10/r01` (`content/world/fabric/continent-10.json:35`), a SIXTH continent none of the nine dungeons are on. Nothing compares dungeon names against the fabric's actual landform placements.

Same root cause, second instance: `content/world/resolved/continent-05.json#dungeons` (Thirstwold) carries `dungeon-coldreach-arete-shelters`, `dungeon-stonemoor-ponor-throat` and `dungeon-meltwash-ice-caves` — three dungeon ids naming OTHER landmasses (Coldreach, Stonemoor, the Meltwash) while standing on Thirstwold ground. Verified live at 786a709 (all three ids present in the file). The dungeon-naming generator does not check a name against the landmass it is actually placing the dungeon on.

## Why now

Filed by Task 14 (STATE §28, 2026-08-29). Immersion-breaking content mismatch: a player reading "Lava tube 4" on Wealdmarch (c02) is standing nowhere near the world's one real lava tube.

## Sketch

(rough shape; not a design yet)
