---
title: "District The Zenith Crown Canon Promotion, Airship Loop Activation, and Ash-Bellows Trench Draft"
id: F-101
from_idea: I-206
status: refined
---

# I-206 — District The Zenith Crown Canon Promotion, Airship Loop Activation, and Ash-Bellows Trench Draft

## Problem Statement
Following `F-099`, the autonomous Product Owner self-evaluation brainstorm queue prioritizes promoting `district-zenith-crown` (`draft -> canon`) on Continent 03 (`continent-03-shattered-halo`, `Levels 46 to 50`), activating the cross-continent airship link between Continent 03 and Continent 01 (`continent-01-hearthbloom-basin`), and promoting `district-ash-bellows-trench` (`mystery -> draft`) on Continent 01.

## Scope & Requirements
1. **Promote `district-zenith-crown` (`draft -> canon`, `5/5` pillars) & Open Airship Travel Loop**:
   - Connect `town-undertide-sanctuary` (`East` portal) to `hunting-area-aurora-tether` (`West` portal).
   - Build a 2×2 connected node matrix for `district-zenith-crown`:
     - `[0, 1]` `hunting-area-aurora-tether` (`canon`, `map_id: "aurora-tether"`, `Levels 46 to 48`).
     - `[1, 1]` `town-crown-beacon-citadel` (`canon`, `map_id: "crown-beacon-citadel"`, `Levels 47 to 50`).
     - `[1, 1]` (`floor_index: -1`) `dungeon-star-heart-nave` (`canon`, `map_id: "star-heart-nave-b1"`, `Levels 48 to 54`).
     - `[1, 0]` `hunting-area-solstice-anchor` (`mystery`, `map_id: null`, `Levels 49 to 50`).
   - Open the airship travel link between `continent-03-shattered-halo` (`Hearthbloom Sky-Spire`) and `continent-01-hearthbloom-basin` (`Cloud-Pier Observatory`).
2. **Promote `district-ash-bellows-trench` (`mystery -> draft`, `4/5` pillars) & Seed `district-perigee-abyss` (`mystery`, `3/5` pillars)**:
   - Promote `district-ash-bellows-trench` on `continent-01-hearthbloom-basin` (`mystery -> draft`, `4/5` pillars) with its initial Mystery child node `hunting-area-firebrick-duct` at `[0, 1]`.
   - Seed `district-perigee-abyss` (`status: "mystery"`, `3/5` pillars) on `continent-03-shattered-halo` (`Levels 48 to 50`).

## Acceptance criteria
- [ ] `district-zenith-crown` is promoted to `canon` with `5/5` quality checklist pillars verified and a 4-node connected matrix (`aurora-tether`, `crown-beacon-citadel`, `star-heart-nave-b1`, and `hunting-area-solstice-anchor`).
- [ ] `district-ash-bellows-trench` is promoted to `draft` (`4/5` pillars) with `hunting-area-firebrick-duct` (`mystery`), and `district-perigee-abyss` (`mystery`, `3/5` pillars) is added on Continent 03.
- [ ] `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes with `100.0%` Quality Score, 0 invariant errors, and `A+` sub-second warm turn speed.
