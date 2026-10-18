# Implementation Plan — F-093: District Mainspring Caldera Canon Promotion, Connected 2x2 Foundry Matrix, and Cross-District Flywheel Viaduct

## Completed Tasks
1. **Task 1 — Mainspring Caldera Canon Promotion & Verdigris Siphon Frontier (`map-biome-engineer`)**:
   - Promoted `content/studio/districts/continent-02-clockwork-steppe/district-mainspring-caldera.json` from `draft` to `canon` (`5/5` Five-Pillar Quality Checklist) with its `2x2` orthogonal map matrix (`grid_nodes` and `portal_edges`).
   - Created `content/studio/districts/continent-02-clockwork-steppe/district-verdigris-siphon.json` (`draft`, `4/5` checklist pillars) and `content/studio/nodes/continent-02-clockwork-steppe/district-verdigris-siphon/hunting-area-siphon-sluice.json` (`mystery`) as the next high-priority brainstorm frontier on Continent 02.
2. **Task 2 — Layer-4 Leaf Nodes & Cross-District Flywheel Viaduct (`asset-forge-director`)**:
   - Promoted `hunting-area-caldera-rim.json` (`mystery -> canon` at `[0, 1]`, `map_id: "caldera-rim"`, `level_range: [22, 28]`) with `Steam-Valve Beetle` and `Bronze Slag-Hound` spawns and `0.01%` cards, connected `West` across the Flywheel Viaduct to `hunting-area-brass-spur-ridge.json` (`East` upgraded from `fog_of_lore` to `open`).
   - Created `town-escapement-anvil.json` (`canon` Town at `[1, 1]`, `map_id: "escapement-anvil"`), `dungeon-chronometer-foundry.json` (`canon` Dungeon at `[1, 1]`, `floor_index: -1`, `map_id: "chronometer-foundry-b1"`), and `hunting-area-sun-coil-spire.json` (`mystery` Hunting Area at `[1, 0]`).
3. **Task 3 — Verification & Unit Test Suite (`qa-gatekeeper`)**:
   - Updated `tests/test_validate_studio_hierarchy.py` and `tests/test_studio_web_perspectives.py` (`17/17` unit tests passing, `26` total studio nodes, `12` playable maps in `content/maps/_manifest.runtime.json`, `432.2 ms` `A+` warm turn speed).
