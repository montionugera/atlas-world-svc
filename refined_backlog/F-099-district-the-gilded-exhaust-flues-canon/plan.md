# Implementation Plan — F-099: District The Gilded Exhaust Flues Canon Promotion, Flue Causeway Connection, and Zenith Crown Draft

1. **Promote `district-gilded-exhaust` (`draft -> canon`) on Continent 02 (`continent-02-clockwork-steppe`)**:
   - Complete all 5 quality checklist pillars (`5/5` verified) for `district-gilded-exhaust` (`Levels 26 to 30`).
   - Connect `town-patina-lock` (`East` portal) to `hunting-area-flue-causeway` (`West` portal).
2. **Author 2×2 Connected Node Matrix for `district-gilded-exhaust`**:
   - `[0, 1]` `hunting-area-flue-causeway` (`canon`, `map_id: "flue-causeway"`, `Levels 26 to 28`).
   - `[1, 1]` `town-bellows-hearth` (`canon`, `map_id: "bellows-hearth"`, `Levels 27 to 30`).
   - `[1, 1]` (`floor_index: -1`) `dungeon-ash-valve-vault` (`canon`, `map_id: "ash-valve-vault-b1"`, `Levels 28 to 32`).
   - `[1, 0]` `hunting-area-cinder-chimney` (`mystery`, `map_id: null`, `Levels 28 to 30`).
3. **Promote `district-zenith-crown` (`mystery -> draft`, `4/5` pillars) & Seed `district-ash-bellows-trench` (`mystery`, `3/5` pillars)**:
   - Promote `district-zenith-crown` to `draft` (`4/5` pillars) on Continent 03 (`continent-03-shattered-halo`) with its initial Mystery child node `hunting-area-aurora-tether` at `[0, 1]`.
   - Seed `district-ash-bellows-trench` (`status: "mystery"`, `3/5` pillars) on Continent 01 (`continent-01-hearthbloom-basin`).
4. **Update Studio Hierarchy & Perspectives Automated Tests**:
   - Verify 28 playable maps and 52 Studio nodes (`3` Continents, `11` Districts, `37` Town/Hunting Area/Dungeon nodes) at `543.6 ms` `A+` turn speed.
