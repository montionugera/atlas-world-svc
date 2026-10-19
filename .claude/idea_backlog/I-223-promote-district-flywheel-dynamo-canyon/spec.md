# Specification: I-223 Promote District Flywheel Dynamo Canyon to Canon on Continent 02 with 2x2 Connected Map Matrix

## Problem & Product Owner Rationale
`district-flywheel-dynamo-canyon` on Continent 02 (`The Clockwork Steppe`) is currently the top item in `nextIncrementBrainstormQueue` (`status: "draft"`). Promoting it to `canon` completes the ninth full 2x2 connected District matrix on Continent 02, connects `town-torque-balance-citadel` in `district-differential-spur-gorge` eastward into `hunting-area-centrifugal-gantry-span`, and advances `district-penumbra-prism-reef` (`mystery -> draft`) on Continent 03 while seeding a new ninth Mystery District (`district-cinnamon-bellows-bluff`) on Continent 01.

## Acceptance criteria
- [ ] Promote `content/studio/districts/continent-02-clockwork-steppe/district-flywheel-dynamo-canyon.json` from `draft` to `canon` with all 5 quality checklist pillars verified and symmetric portal edges.
- [ ] Promote `hunting-area-centrifugal-gantry-span` (`mystery -> canon`, `map_id: "centrifugal-gantry-span"`, `[0, 1]`, floor `0`) and open the East portal from `town-torque-balance-citadel` (`district-differential-spur-gorge`).
- [ ] Create `town-flywheel-governor-hub` (`canon`, `map_id: "flywheel-governor-hub"`, `[1, 1]`, floor `0`), `dungeon-kinetic-ballast-vault` (`canon`, `map_id: "kinetic-ballast-vault-b1"`, `[1, 1]`, floor `-1`), and `hunting-area-gyroscope-rim-overlook` (`mystery`, `map_id: null`, `[1, 0]`, floor `0`).
- [ ] Promote `district-penumbra-prism-reef` (`mystery -> draft`) on Continent 03 with `hunting-area-penumbra-refraction-causeway` (`mystery`), and seed `district-cinnamon-bellows-bluff` (`mystery`) on Continent 01.
- [ ] Pass `python3 scripts/run_world_pipeline.py --fast --auto-tune` with `100.0%` Quality Score and `A+` (`< 1,000 ms`) warm turn speed.
