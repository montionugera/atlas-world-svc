# I-200: District Mainspring Caldera Canon Promotion, Connected 2x2 Foundry Matrix, and Cross-District Flywheel Viaduct

## Summary
Execute the next autonomous Product Owner top-down studio increment (`Increment -> Validate -> Verify -> Measure & Self-Evaluate -> Auto-Tune -> Brainstorm`):
1. **Promote `district-mainspring-caldera` (`draft -> canon`, `5/5` Five-Pillar Quality Checklist)**:
   - Verify `spatial_and_ecological_consistency` with complete 2x2 connected map matrix (`grid_nodes` and `portal_edges`) and cross-district Flywheel Viaduct link from `hunting-area-brass-spur-ridge` (`Rustcog Downs`) to `hunting-area-caldera-rim` (`Mainspring Caldera`).
2. **Promote `hunting-area-caldera-rim` (`mystery -> canon`, `5/5` Five-Pillar Quality Checklist)**:
   - Western bronze-slag overlook of Mainspring Caldera at `[0, 1]`, `map_id: "caldera-rim"`, `level_range: [22, 28]`, connected `West` to `hunting-area-brass-spur-ridge` (`East` portal upgraded from `fog_of_lore` to `open`) and `East` to `town-escapement-anvil`.
   - Populated with `Steam-Valve Beetle` (Level 24 `Fire`/`Insect`, `0.01%` `Steam-Valve Beetle Card`) and `Bronze Slag-Hound` (Level 26 `Earth`/`Formless` construct, `0.01%` `Bronze Slag-Hound Card`).
3. **Author 3 New Layer-4 Nodes in `Mainspring Caldera` (`content/studio/nodes/continent-02-clockwork-steppe/district-mainspring-caldera/`)**:
   - `town-escapement-anvil.json` (`canon` Town at `[1, 1]`, `map_id: "escapement-anvil"`, `level_range: [24, 30]`): Suspended bronze flywheel smith-town where master clockmakers temper spring-steel weapons; connected `West` to `hunting-area-caldera-rim`, `Dungeon` to `dungeon-chronometer-foundry`, and `North` via a `fog_of_lore` portal to `hunting-area-sun-coil-spire`.
   - `dungeon-chronometer-foundry.json` (`canon` Dungeon at `[1, 1]`, `floor_index: -1`, `map_id: "chronometer-foundry-b1"`, `level_range: [26, 35]`): Subterranean mainspring core beneath Escapement Anvil housing Krono's primary escapement lever; populated with `Over-Wound Foundry Golem` (Level 29 `Fire`/`Formless` construct, `0.01%` card) and `Chrono-Spring Scarab` (Level 32 `Wind`/`Insect`, `0.01%` card).
   - `hunting-area-sun-coil-spire.json` (`mystery` Hunting Area at `[1, 0]`, `map_id: null`, `level_range: [28, 30]`): Northern thermal updraft tower of Mainspring Caldera reserved as an intentional Fog of Lore sky-dock frontier.

## Acceptance Criteria
- [ ] `python3 scripts/validate_studio_hierarchy.py --check --write-manifest` passes with 0 errors across 24 total studio nodes (`18 canon`, `0 draft`, `6 mystery`) and 12 playable maps in `content/maps/_manifest.runtime.json`.
- [ ] `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes all 7 stages with 100% Quality Score and sub-second (`A+`) warm turn speed.
