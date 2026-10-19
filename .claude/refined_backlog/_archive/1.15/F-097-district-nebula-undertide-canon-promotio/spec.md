---
title: "District Nebula Undertide Canon Promotion, Kelp Spiral Reef Connection, and Gilded Exhaust Draft"
id: F-097
from_idea: I-204
status: refined
---

# I-204 — District Nebula Undertide Canon Promotion, Kelp Spiral Reef Connection, and Gilded Exhaust Draft

## Problem Statement
Following `F-096`, the autonomous Product Owner self-evaluation brainstorm queue prioritizes promoting `district-nebula-undertide` (`draft -> canon`) on Continent 03 (`continent-03-shattered-halo`, `Levels 46 to 50`) to complete the three core Districts of Continent 03, and promoting `district-gilded-exhaust` (`mystery -> draft`) on Continent 02 (`continent-02-clockwork-steppe`).

## Scope & Requirements
1. **Promote `district-nebula-undertide` (`draft -> canon`, `5/5` pillars)**:
   - Connect `town-prism-zenith` (`East` portal) to `hunting-area-kelp-spiral-reef` (`West` portal).
   - Build a 2×2 connected node matrix for `district-nebula-undertide`:
     - `[0, 1]` `hunting-area-kelp-spiral-reef` (`canon`, `map_id: "kelp-spiral-reef"`, `Levels 46 to 48`).
     - `[1, 1]` `town-undertide-sanctuary` (`canon`, `map_id: "undertide-sanctuary"`, `Levels 46 to 50`).
     - `[1, 1]` (`floor_index: -1`) `dungeon-vesper-cradle` (`canon`, `map_id: "vesper-cradle-b1"`, `Levels 48 to 50`).
     - `[1, 0]` `hunting-area-abyssal-barometer` (`mystery`, `map_id: null`, `Levels 48 to 50`).
2. **Promote `district-gilded-exhaust` (`mystery -> draft`, `4/5` pillars) & Seed `district-zenith-crown` (`mystery`, `3/5` pillars)**:
   - Promote `district-gilded-exhaust` on `continent-02-clockwork-steppe` (`mystery -> draft`, `4/5` pillars) with its initial Mystery child node `hunting-area-flue-causeway` at `[0, 1]`.
   - Seed `district-zenith-crown` (`status: "mystery"`, `3/5` pillars) on `continent-03-shattered-halo` (`Levels 48 to 50`) so Continent 03 preserves an intentional Mystery District frontier.

## Acceptance criteria
- [ ] `district-nebula-undertide` is promoted to `canon` with `5/5` quality checklist pillars verified and a 4-node connected matrix (`kelp-spiral-reef`, `undertide-sanctuary`, `vesper-cradle-b1`, and `hunting-area-abyssal-barometer`).
- [ ] `district-gilded-exhaust` is promoted to `draft` (`4/5` pillars) with `hunting-area-flue-causeway` (`mystery`), and `district-zenith-crown` (`mystery`, `3/5` pillars) is added on Continent 03.
- [ ] `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes with `100.0%` Quality Score, 0 invariant errors, and `A+` sub-second warm turn speed.
