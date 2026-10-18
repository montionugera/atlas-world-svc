# I-199: Continent 02 The Clockwork Steppe and District Rustcog Downs Canon Promotion, Connected Map Matrix, and Cross-Continent Viaduct

## Summary
Execute the next autonomous Product Owner top-down studio increment (`Increment -> Validate -> Verify -> Measure & Self-Evaluate -> Auto-Tune -> Brainstorm`):
1. **Promote `continent-02-clockwork-steppe` (`draft -> canon`, `5/5` Five-Pillar Quality Checklist)**:
   - Verify `spatial_and_ecological_consistency` with complete child District ecology and cross-continent Kettle-Whistle Viaduct connection from Continent 01 (`hunting-area-cinder-apron`) to `town-pinion-terminus`.
   - Register a second District on Continent 02 (`district-mainspring-caldera`, `status: "draft"`) so the inner Mainspring Foundry plateau is represented in the Continent 02 hierarchy.
2. **Promote `district-rustcog-downs` (`draft -> canon`, `5/5` Five-Pillar Quality Checklist)**:
   - Populate its `2x2` orthogonal connected map matrix (`grid_nodes` and `portal_edges`) and author 4 Layer-4 nodes under `content/studio/nodes/continent-02-clockwork-steppe/district-rustcog-downs/`:
     - `town-pinion-terminus.json` (`canon` Town at `[0, 1]`, `map_id: "pinion-terminus"`, `level_range: [15, 22]`, connected `West` to `hunting-area-cinder-apron`, `East` to `hunting-area-brass-spur-ridge`, and `Dungeon` to `dungeon-pendulum-shaft`).
     - `hunting-area-brass-spur-ridge.json` (`canon` Hunting Area at `[1, 1]`, `map_id: "brass-spur-ridge"`, `level_range: [18, 28]`, with `Clockwork Gear-Hound` and `Copper Glider-Mantis` spawns and 0.01% cards, connected `West` to `town-pinion-terminus` and `North` via a `fog_of_lore` portal to `hunting-area-astrolabe-rift`).
     - `dungeon-pendulum-shaft.json` (`canon` Dungeon at `[0, 1]`, `floor_index: -1`, `map_id: "pendulum-shaft-b1"`, `level_range: [20, 30]`, with `Mainspring Automaton` and `Escapement Tick-Spider` spawns and 0.01% cards, connected `Exit` to `town-pinion-terminus`).
     - `hunting-area-astrolabe-rift.json` (`mystery` Hunting Area at `[1, 0]`, `map_id: null`, `level_range: [25, 30]`, with `mystery_hook` for the locked Astrolabe Gate to Continent 03).
3. **Author `district-mainspring-caldera.json` (`draft`, `4/5` pillars)**:
   - Inner volcanic-brass caldera District of Continent 02 (`Levels 21 to 40`, `level_range: [22, 30]`) ready for the next brainstorm queue iteration.
4. **Auto-Tune Pipeline Turn Speed (`undo_latest_snapshot` & `--dump-check`)**:
   - Skip redundant `build_catalog_db.py` invocations inside `undo_latest_snapshot()` when only `content/studio/` files are restored, cutting unit test stage latency by ~300ms.

## Acceptance Criteria
- [ ] `python3 scripts/validate_studio_hierarchy.py --check --write-manifest` passes with 0 errors across 1 World History and Concept root, 3 Continents (`2 canon`, `1 mystery`), 4 Districts (`3 canon`, `1 draft`), and 12 Layer-4 Nodes (`9 canon`, `3 mystery`).
- [ ] `content/maps/_manifest.runtime.json` compiles 9 playable studio maps reachable via BFS from `town-lantern-hollow`.
- [ ] `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes all 7 stages with 100% Quality Score and improved Stage 6 unit test speed.
