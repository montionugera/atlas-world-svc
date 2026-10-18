# Implementation Plan — F-102: District Ash-Bellows Trench Canon Promotion, Firebrick Duct Connection, and Perigee Abyss Draft

1. **Promote `district-ash-bellows-trench` (`draft -> canon`) on Continent 01 (`continent-01-hearthbloom-basin`)**:
   - Complete all 5 quality checklist pillars (`5/5` verified) for `district-ash-bellows-trench` (`Levels 12 to 18`).
   - Connect `town-kilnwatch-bastion` (`South` portal) to `hunting-area-firebrick-duct` (`North` portal).
2. **Author 2×2 Connected Node Matrix for `district-ash-bellows-trench`**:
   - `[0, 1]` `hunting-area-firebrick-duct` (`canon`, `map_id: "firebrick-duct"`, `Levels 12 to 15`).
   - `[1, 1]` `town-draft-kiln-post` (`canon`, `map_id: "draft-kiln-post"`, `Levels 14 to 17`).
   - `[1, 1]` (`floor_index: -1`) `dungeon-ember-bellows-chamber` (`canon`, `map_id: "ember-bellows-chamber-b1"`, `Levels 16 to 20`).
   - `[1, 0]` `hunting-area-glaze-flue-vent` (`mystery`, `map_id: null`, `Levels 16 to 18`).
3. **Promote `district-perigee-abyss` (`mystery -> draft`, `4/5` pillars) & Seed `district-porcelain-cradle` (`mystery`, `3/5` pillars)**:
   - Promote `district-perigee-abyss` to `draft` (`4/5` pillars) on Continent 03 (`continent-03-shattered-halo`) with its initial Mystery child node `hunting-area-stalactite-plunge` at `[0, 1]`.
   - Seed `district-porcelain-cradle` (`status: "mystery"`, `3/5` pillars) on Continent 01 (`continent-01-hearthbloom-basin`).
4. **Update Studio Hierarchy & Perspectives Automated Tests**:
   - Verify 34 playable maps and 62 Studio nodes (`3` Continents, `13` Districts, `45` Town/Hunting Area/Dungeon nodes) at `505.2 ms` `A+` turn speed.
