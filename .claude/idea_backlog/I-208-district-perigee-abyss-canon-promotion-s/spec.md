# I-208 — District Perigee Abyss Canon Promotion, Stalactite Plunge Connection, and Porcelain Cradle Draft

## Problem Statement
Following `F-102`, the autonomous Product Owner self-evaluation brainstorm queue prioritizes promoting `district-perigee-abyss` (`draft -> canon`) on Continent 03 (`continent-03-shattered-halo`, `Levels 48 to 50`) and promoting `district-porcelain-cradle` (`mystery -> draft`) on Continent 01 (`continent-01-hearthbloom-basin`).

## Scope & Requirements
1. **Promote `district-perigee-abyss` (`draft -> canon`, `5/5` pillars)**:
   - Connect `town-crown-beacon-citadel` (`East` portal) to `hunting-area-stalactite-plunge` (`West` portal).
   - Build a 2×2 connected node matrix for `district-perigee-abyss`:
     - `[0, 1]` `hunting-area-stalactite-plunge` (`canon`, `map_id: "stalactite-plunge"`, `Levels 48 to 49`).
     - `[1, 1]` `town-perigee-diving-station` (`canon`, `map_id: "perigee-diving-station"`, `Levels 48 to 50`).
     - `[1, 1]` (`floor_index: -1`) `dungeon-submerged-orrery-keel` (`canon`, `map_id: "submerged-orrery-keel-b1"`, `Levels 49 to 55`).
     - `[1, 0]` `hunting-area-maelstrom-eye-lip` (`mystery`, `map_id: null`, `Levels 49 to 50`).
2. **Promote `district-porcelain-cradle` (`mystery -> draft`, `4/5` pillars) & Seed `district-thunder-coil-basin` (`mystery`, `3/5` pillars)**:
   - Promote `district-porcelain-cradle` on `continent-01-hearthbloom-basin` (`mystery -> draft`, `4/5` pillars) with its initial Mystery child node `hunting-area-celadon-causeway` at `[0, 1]`.
   - Seed `district-thunder-coil-basin` (`status: "mystery"`, `3/5` pillars) on `continent-02-clockwork-steppe` (`Levels 26 to 30`).

## Acceptance criteria
- [ ] `district-perigee-abyss` is promoted to `canon` with `5/5` quality checklist pillars verified and a 4-node connected matrix (`stalactite-plunge`, `perigee-diving-station`, `submerged-orrery-keel-b1`, and `hunting-area-maelstrom-eye-lip`).
- [ ] `district-porcelain-cradle` is promoted to `draft` (`4/5` pillars) with `hunting-area-celadon-causeway` (`mystery`), and `district-thunder-coil-basin` (`mystery`, `3/5` pillars) is added on Continent 02.
- [ ] `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes with `100.0%` Quality Score, 0 invariant errors, and `A+` sub-second warm turn speed.
