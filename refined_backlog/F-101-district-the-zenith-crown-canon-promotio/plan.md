# Implementation Plan — F-101: District The Zenith Crown Canon Promotion, Airship Loop Activation, and Ash-Bellows Trench Draft

1. **Promote `district-zenith-crown` (`draft -> canon`) on Continent 03 (`continent-03-shattered-halo`)**:
   - Complete all 5 quality checklist pillars (`5/5` verified) for `district-zenith-crown` (`Levels 46 to 50`).
   - Connect `town-undertide-sanctuary` (`East` portal) to `hunting-area-aurora-tether` (`West` portal).
   - Open the airship travel link between Continent 03 (`Hearthbloom Sky-Spire`) and Continent 01 (`Cloud-Pier Observatory`).
2. **Author 2×2 Connected Node Matrix for `district-zenith-crown`**:
   - `[0, 1]` `hunting-area-aurora-tether` (`canon`, `map_id: "aurora-tether"`, `Levels 46 to 48`).
   - `[1, 1]` `town-crown-beacon-citadel` (`canon`, `map_id: "crown-beacon-citadel"`, `Levels 47 to 50`).
   - `[1, 1]` (`floor_index: -1`) `dungeon-star-heart-nave` (`canon`, `map_id: "star-heart-nave-b1"`, `Levels 48 to 54`).
   - `[1, 0]` `hunting-area-solstice-anchor` (`mystery`, `map_id: null`, `Levels 49 to 50`).
3. **Promote `district-ash-bellows-trench` (`mystery -> draft`, `4/5` pillars) & Seed `district-perigee-abyss` (`mystery`, `3/5` pillars)**:
   - Promote `district-ash-bellows-trench` to `draft` (`4/5` pillars) on Continent 01 (`continent-01-hearthbloom-basin`) with its initial Mystery child node `hunting-area-firebrick-duct` at `[0, 1]`.
   - Seed `district-perigee-abyss` (`status: "mystery"`, `3/5` pillars) on Continent 03 (`continent-03-shattered-halo`).
4. **Update Studio Hierarchy & Perspectives Automated Tests**:
   - Verify 31 playable maps and 57 Studio nodes (`3` Continents, `12` Districts, `41` Town/Hunting Area/Dungeon nodes) at `369.6 ms` `A+` turn speed.
