---
title: "Promote District Penumbra Prism Reef to Canon on Continent 03 with 2x2 Connected Map Matrix"
id: F-134
from_idea: I-224
status: refined
---

# Specification: I-224 Promote District Penumbra Prism Reef to Canon on Continent 03 with 2x2 Connected Map Matrix

## Problem & Product Owner Rationale
`district-penumbra-prism-reef` on Continent 03 (`The Shattered Halo`) is currently the top item in `nextIncrementBrainstormQueue` (`status: "draft"`). Promoting it to `canon` completes the tenth full 2x2 connected District matrix on Continent 03, connects `town-aurora-bell-sanctuary` in `district-aurora-chime-atoll` eastward into `hunting-area-penumbra-refraction-causeway`, advances `district-cinnamon-bellows-bluff` (`mystery -> draft`) on Continent 01 with `hunting-area-cinnamon-bark-viaduct` (`mystery`), and seeds `district-bimetallic-escapement-mesa` (`mystery`) on Continent 02.

## Acceptance criteria
- [ ] Promote `content/studio/districts/continent-03-shattered-halo/district-penumbra-prism-reef.json` from `draft` to `canon` with all 5 quality checklist pillars verified and symmetric portal edges.
- [ ] Promote `hunting-area-penumbra-refraction-causeway` (`mystery -> canon`, `map_id: "penumbra-refraction-causeway"`, `[0, 1]`, floor `0`) and open the East portal from `town-aurora-bell-sanctuary` (`district-aurora-chime-atoll`).
- [ ] Create `town-penumbra-prism-haven` (`canon`, `map_id: "penumbra-prism-haven"`, `[1, 1]`, floor `0`), `dungeon-twilight-coral-crypt` (`canon`, `map_id: "twilight-coral-crypt-b1"`, `[1, 1]`, floor `-1`), and `hunting-area-corona-flare-arch` (`mystery`, `map_id: null`, `[1, 0]`, floor `0`).
- [ ] Promote `district-cinnamon-bellows-bluff` (`mystery -> draft`) on Continent 01 with `hunting-area-cinnamon-bark-viaduct` (`mystery`), and seed `district-bimetallic-escapement-mesa` (`mystery`) on Continent 02.
- [ ] Pass `python3 scripts/run_world_pipeline.py --fast --auto-tune` with `100.0%` Quality Score and `A+` (`< 1,000 ms`) warm turn speed.
