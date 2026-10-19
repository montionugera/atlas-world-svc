# Implementation Plan — F-096: District The Eclipse Observatory Canon Promotion, Orrery Bridge Connection, and Nebula Undertide Draft

1. **Promote `district-eclipse-observatory` (`draft -> canon`) on Continent 03 (`continent-03-shattered-halo`)**:
   - Complete all 5 quality checklist pillars (`5/5` verified) for `district-eclipse-observatory` (`Levels 40 to 46`).
   - Connect `town-starfall-haven` (`East` portal) to `hunting-area-orrery-bridge` (`West` portal).
2. **Author 2×2 Connected Node Matrix for `district-eclipse-observatory`**:
   - `[0, 1]` `hunting-area-orrery-bridge` (`canon`, `map_id: "orrery-bridge"`, `Levels 40 to 44`).
   - `[1, 1]` `town-prism-zenith` (`canon`, `map_id: "prism-zenith"`, `Levels 40 to 46`).
   - `[1, 1]` (`floor_index: -1`) `dungeon-pendulum-sanctum` (`canon`, `map_id: "pendulum-sanctum-b1"`, `Levels 42 to 46`).
   - `[1, 0]` `hunting-area-apogee-spire` (`mystery`, `map_id: null`, `Levels 44 to 46`).
3. **Promote `district-nebula-undertide` (`mystery -> draft`, `4/5` pillars)**:
   - Add initial Mystery child node `hunting-area-kelp-spiral-reef` at `[0, 1]`.
4. **Auto-Tune Test Suite Turn Speed (`ValidateStudioHierarchyTests`)**:
   - Replace per-test `shutil.copytree` in `setUp()` with `setUpClass()` + `_mutated_files()` context manager, cutting Stage 6 unit test runtime from ~950 ms down to ~262 ms (`569.3 ms` `A+` total warm turn speed).
