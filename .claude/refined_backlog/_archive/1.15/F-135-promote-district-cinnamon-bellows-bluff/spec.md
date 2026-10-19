---
title: "Promote District Cinnamon-Bellows Bluff to Canon on Continent 01 with 2x2 Connected Map Matrix"
id: F-135
from_idea: I-225
status: refined
---

# Specification: I-225 Promote District Cinnamon-Bellows Bluff to Canon on Continent 01 with 2x2 Connected Map Matrix

## Problem & Product Owner Rationale
`district-cinnamon-bellows-bluff` on Continent 01 (`Hearthbloom Basin`) is currently the top item in `nextIncrementBrainstormQueue` (`status: "draft"`). Promoting it to `canon` completes the ninth full 2x2 connected District matrix on Continent 01, connects `town-saffron-press-village` in `district-saffron-kiln-orchards` eastward into `hunting-area-cinnamon-bark-viaduct`, advances `district-bimetallic-escapement-mesa` (`mystery -> draft`) on Continent 02 with `hunting-area-bimetallic-expansion-span` (`mystery`), and seeds `district-celestial-astrolabe-atoll` (`mystery`) on Continent 03.

## Acceptance criteria
- [ ] Promote `content/studio/districts/continent-01-hearthbloom-basin/district-cinnamon-bellows-bluff.json` from `draft` to `canon` with all 5 quality checklist pillars verified and symmetric portal edges.
- [ ] Promote `hunting-area-cinnamon-bark-viaduct` (`mystery -> canon`, `map_id: "cinnamon-bark-viaduct"`, `[0, 1]`, floor `0`) and open the East portal from `town-saffron-press-village` (`district-saffron-kiln-orchards`).
- [ ] Create `town-cinnamon-mill-haven` (`canon`, `map_id: "cinnamon-mill-haven"`, `[1, 1]`, floor `0`), `dungeon-spice-kiln-cellar` (`canon`, `map_id: "spice-kiln-cellar-b1"`, `[1, 1]`, floor `-1`), and `hunting-area-star-anise-promontory` (`mystery`, `map_id: null`, `[1, 0]`, floor `0`).
- [ ] Promote `district-bimetallic-escapement-mesa` (`mystery -> draft`) on Continent 02 with `hunting-area-bimetallic-expansion-span` (`mystery`), and seed `district-celestial-astrolabe-atoll` (`mystery`) on Continent 03.
- [ ] Pass `python3 scripts/run_world_pipeline.py --fast --auto-tune` with `100.0%` Quality Score and `A+` (`< 1,000 ms`) warm turn speed.
