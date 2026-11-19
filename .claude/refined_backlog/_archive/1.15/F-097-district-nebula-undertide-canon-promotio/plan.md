# Implementation Plan — F-097: District Nebula Undertide Canon Promotion, Kelp Spiral Reef Connection, and Gilded Exhaust Draft

1. **Promote `district-nebula-undertide` (`draft -> canon`) on Continent 03 (`continent-03-shattered-halo`)**:
   - Complete all 5 quality checklist pillars (`5/5` verified) for `district-nebula-undertide` (`Levels 42 to 50`).
   - Connect `town-prism-zenith` (`East` portal) to `hunting-area-kelp-spiral-reef` (`West` portal).
2. **Author 2×2 Connected Node Matrix for `district-nebula-undertide`**:
   - `[0, 1]` `hunting-area-kelp-spiral-reef` (`canon`, `map_id: "kelp-spiral-reef"`, `Levels 42 to 46`).
   - `[1, 1]` `town-undertide-sanctuary` (`canon`, `map_id: "undertide-sanctuary"`, `Levels 44 to 48`).
   - `[1, 1]` (`floor_index: -1`) `dungeon-vesper-cradle` (`canon`, `map_id: "vesper-cradle-b1"`, `Levels 46 to 50`).
   - `[1, 0]` `hunting-area-abyssal-barometer` (`mystery`, `map_id: null`, `Levels 48 to 50`).
3. **Seed `district-zenith-crown` (`mystery`, `3/5` pillars) & Promote `district-gilded-exhaust` (`mystery -> draft`, `4/5` pillars)**:
   - Add `district-zenith-crown` (`status: "mystery"`) to Continent 03 (`continent-03-shattered-halo`).
   - Promote `district-gilded-exhaust` to `draft` (`4/5` pillars) on Continent 02 (`continent-02-clockwork-steppe`) with its initial Mystery child node `hunting-area-flue-causeway` at `[0, 1]`.
4. **Update Studio Hierarchy & Perspectives Automated Tests**:
   - Verify 25 playable maps and 47 Studio nodes (`3` Continents, `10` Districts, `33` Town/Hunting Area/Dungeon nodes) at `373.1 ms` `A+` turn speed.
