# Spec — I-203: District The Eclipse Observatory Canon Promotion, Orrery Bridge Connection, and Nebula Undertide Draft

## Problem & Product Owner Goal
As part of our continuous 4-hour Autonomous Product Owner loop (`Increment -> Validate -> Verify -> Measure & Self-Evaluate -> Auto-Tune -> Brainstorm`), `build/reports/studio_self_eval_telemetry.json` identifies `district-eclipse-observatory` (`draft -> canon`, `4/5` checklist pillars) and `district-nebula-undertide` (`mystery -> draft`, `3/5` checklist pillars) on Continent 03 (`The Shattered Halo`) as the top-priority increments.

## Scope & Acceptance Criteria
1. **Promote `district-eclipse-observatory` (`draft -> canon`, `5/5` pillars)**:
   - Connect `town-starfall-haven` (`East`, `open`) <-> `hunting-area-orrery-bridge` (`West`, `open`) across the Starlight Planetarium Causeway.
   - Promote `hunting-area-orrery-bridge.json` (`mystery -> canon` at `[0, 1]`, `map_id: "orrery-bridge"`, `level_range: [36, 42]`).
   - Author `town-prism-zenith.json` (`canon` Town at `[1, 1]`, `map_id: "prism-zenith"`, `level_range: [38, 44]`) with `90-120cm` scale bindings (`0.58-0.60m` counters, `0.14m` stair risers, `2.20m x 1.65m` doorways, `13.5m` main roads).
   - Author `dungeon-pendulum-sanctum.json` (`canon` Dungeon at `[1, 1]`, `floor_index: -1`, `map_id: "pendulum-sanctum-b1"`, `level_range: [40, 46]`).
   - Author `hunting-area-apogee-spire.json` (`mystery` Hunting Area at `[1, 0]`, `map_id: null`, `level_range: [42, 46]`, linked via `fog_of_lore` on `town-prism-zenith` `North`).
2. **Promote `district-nebula-undertide` (`mystery -> draft`, `4/5` pillars)**:
   - Seed `hunting-area-kelp-spiral-reef.json` (`mystery` at `[0, 1]`, `level_range: [42, 46]`) under `district-nebula-undertide`.
3. **Compile & Self-Evaluate**:
   - Compile `content/maps/_manifest.runtime.json` (`22` playable maps across Continents 01, 02, and 03) and pass all `INV-01..INV-07` invariants, `100.0%` Quality Score, and `A+` (`< 1,000 ms`) warm turn speed.
