# I-207 — District Ash-Bellows Trench Canon Promotion, Firebrick Duct Connection, and Perigee Abyss Draft

## Problem Statement
Following `F-101`, the autonomous Product Owner self-evaluation brainstorm queue prioritizes promoting `district-ash-bellows-trench` (`draft -> canon`) on Continent 01 (`continent-01-hearthbloom-basin`, `Levels 12 to 18`) and promoting `district-perigee-abyss` (`mystery -> draft`) on Continent 03 (`continent-03-shattered-halo`).

## Scope & Requirements
1. **Promote `district-ash-bellows-trench` (`draft -> canon`, `5/5` pillars)**:
   - Connect `town-kilnwatch-bastion` (`South` portal) to `hunting-area-firebrick-duct` (`North` portal).
   - Build a 2×2 connected node matrix for `district-ash-bellows-trench`:
     - `[0, 1]` `hunting-area-firebrick-duct` (`canon`, `map_id: "firebrick-duct"`, `Levels 12 to 15`).
     - `[1, 1]` `town-draft-kiln-post` (`canon`, `map_id: "draft-kiln-post"`, `Levels 14 to 17`).
     - `[1, 1]` (`floor_index: -1`) `dungeon-ember-bellows-chamber` (`canon`, `map_id: "ember-bellows-chamber-b1"`, `Levels 16 to 20`).
     - `[1, 0]` `hunting-area-glaze-flue-vent` (`mystery`, `map_id: null`, `Levels 16 to 18`).
2. **Promote `district-perigee-abyss` (`mystery -> draft`, `4/5` pillars) & Seed `district-porcelain-cradle` (`mystery`, `3/5` pillars)**:
   - Promote `district-perigee-abyss` on `continent-03-shattered-halo` (`mystery -> draft`, `4/5` pillars) with its initial Mystery child node `hunting-area-stalactite-plunge` at `[0, 1]`.
   - Seed `district-porcelain-cradle` (`status: "mystery"`, `3/5` pillars) on `continent-01-hearthbloom-basin` (`Levels 10 to 15`).

## Acceptance criteria
- [ ] `district-ash-bellows-trench` is promoted to `canon` with `5/5` quality checklist pillars verified and a 4-node connected matrix (`firebrick-duct`, `draft-kiln-post`, `ember-bellows-chamber-b1`, and `hunting-area-glaze-flue-vent`).
- [ ] `district-perigee-abyss` is promoted to `draft` (`4/5` pillars) with `hunting-area-stalactite-plunge` (`mystery`), and `district-porcelain-cradle` (`mystery`, `3/5` pillars) is added on Continent 01.
- [ ] `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes with `100.0%` Quality Score, 0 invariant errors, and `A+` sub-second warm turn speed.
