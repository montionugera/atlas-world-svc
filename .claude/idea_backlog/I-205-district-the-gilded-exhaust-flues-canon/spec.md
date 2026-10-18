# I-205 — District The Gilded Exhaust Flues Canon Promotion, Flue Causeway Connection, and Zenith Crown Draft

## Problem Statement
Following `F-097`, the autonomous Product Owner self-evaluation brainstorm queue prioritizes promoting `district-gilded-exhaust` (`draft -> canon`) on Continent 02 (`continent-02-clockwork-steppe`, `Levels 26 to 30`), completing all four Districts of Continent 02, and promoting `district-zenith-crown` (`mystery -> draft`) on Continent 03 (`continent-03-shattered-halo`).

## Scope & Requirements
1. **Promote `district-gilded-exhaust` (`draft -> canon`, `5/5` pillars)**:
   - Connect `town-patina-lock` (`East` portal) to `hunting-area-flue-causeway` (`West` portal).
   - Build a 2×2 connected node matrix for `district-gilded-exhaust`:
     - `[0, 1]` `hunting-area-flue-causeway` (`canon`, `map_id: "flue-causeway"`, `Levels 26 to 28`).
     - `[1, 1]` `town-bellows-hearth` (`canon`, `map_id: "bellows-hearth"`, `Levels 26 to 30`).
     - `[1, 1]` (`floor_index: -1`) `dungeon-ash-valve-vault` (`canon`, `map_id: "ash-valve-vault-b1"`, `Levels 28 to 32`).
     - `[1, 0]` `hunting-area-cinder-chimney` (`mystery`, `map_id: null`, `Levels 28 to 30`).
2. **Promote `district-zenith-crown` (`mystery -> draft`, `4/5` pillars) & Seed `district-ash-bellows-trench` (`mystery`, `3/5` pillars)**:
   - Promote `district-zenith-crown` on `continent-03-shattered-halo` (`mystery -> draft`, `4/5` pillars) with its initial Mystery child node `hunting-area-aurora-tether` at `[0, 1]`.
   - Seed `district-ash-bellows-trench` (`status: "mystery"`, `3/5` pillars) on `continent-01-hearthbloom-basin` (`Levels 16 to 20`).

## Acceptance criteria
- [ ] `district-gilded-exhaust` is promoted to `canon` with `5/5` quality checklist pillars verified and a 4-node connected matrix (`flue-causeway`, `bellows-hearth`, `ash-valve-vault-b1`, and `hunting-area-cinder-chimney`).
- [ ] `district-zenith-crown` is promoted to `draft` (`4/5` pillars) with `hunting-area-aurora-tether` (`mystery`), and `district-ash-bellows-trench` (`mystery`, `3/5` pillars) is added on Continent 01.
- [ ] `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes with `100.0%` Quality Score, 0 invariant errors, and `A+` sub-second warm turn speed.
