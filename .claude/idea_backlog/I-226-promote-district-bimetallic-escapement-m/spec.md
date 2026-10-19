# Specification: I-226 Promote District Bimetallic Escapement Mesa to Canon on Continent 02 with 2x2 Connected Map Matrix

## Problem & Product Owner Rationale
`district-bimetallic-escapement-mesa` on Continent 02 (`The Clockwork Steppe`) is currently the top item in `nextIncrementBrainstormQueue` (`status: "draft"`). Promoting it to `canon` completes the tenth full 2x2 connected District matrix on Continent 02, connects `town-flywheel-governor-hub` in `district-flywheel-dynamo-canyon` eastward into `hunting-area-bimetallic-expansion-span`, advances `district-celestial-astrolabe-atoll` (`mystery -> draft`) on Continent 03 with `hunting-area-armillary-ring-causeway` (`mystery`), and seeds `district-ginger-steam-terraces` (`mystery`) on Continent 01.

## Acceptance criteria
- [ ] Promote `content/studio/districts/continent-02-clockwork-steppe/district-bimetallic-escapement-mesa.json` from `draft` to `canon` with all 5 quality checklist pillars verified and symmetric portal edges.
- [ ] Promote `hunting-area-bimetallic-expansion-span` (`mystery -> canon`, `map_id: "bimetallic-expansion-span"`, `[0, 1]`, floor `0`) and open the East portal from `town-flywheel-governor-hub` (`district-flywheel-dynamo-canyon`).
- [ ] Create `town-bimetallic-chronometer-hub` (`canon`, `map_id: "bimetallic-chronometer-hub"`, `[1, 1]`, floor `0`), `dungeon-invar-balance-vault` (`canon`, `map_id: "invar-balance-vault-b1"`, `[1, 1]`, floor `-1`), and `hunting-area-solar-coil-overlook` (`mystery`, `map_id: null`, `[1, 0]`, floor `0`).
- [ ] Promote `district-celestial-astrolabe-atoll` (`mystery -> draft`) on Continent 03 with `hunting-area-armillary-ring-causeway` (`mystery`), and seed `district-ginger-steam-terraces` (`mystery`) on Continent 01.
- [ ] Pass `python3 scripts/run_world_pipeline.py --fast --auto-tune` with `100.0%` Quality Score and `A+` (`< 1,000 ms`) warm turn speed.
