---
title: "District Helical-Gear Trench Canon Promotion, Spiral Wormway Ramp Connection, and Umbrage Prism Atoll Draft"
id: F-119
from_idea: I-217
status: refined
---

# Spec: I-217 — District Helical-Gear Trench Canon Promotion, Spiral Wormway Ramp Connection, and Umbrage Prism Atoll Draft

## Problem Statement
The Product Owner Self-Evaluation prioritized brainstorm queue (`build/studio_self_evaluation.json`) ranks:
1. `[District] district-helical-gear-trench` (`Helical-Gear Trench`) on Continent 02 (`continent-02-clockwork-steppe`): currently `draft` (`4/5` Five-Pillar Quality Checklist verified) -> ready to promote to `canon` with a complete 2×2 connected map matrix (`Levels 38 to 40`).
2. `[District] district-umbrage-prism-atoll` (`Umbrage Prism Atoll`) on Continent 03 (`continent-03-shattered-halo`): currently `mystery` (`3/5` checklist verified) -> ready to promote to `draft` (`4/5` checklist verified) with an initial Mystery border Hunting Area (`hunting-area-violet-spectrum-span`), while seeding a new Mystery frontier District (`district-terracotta-wind-chimes`) on Continent 01 (`continent-01-hearthbloom-basin`) to preserve multi-layer `canon + draft + mystery` test coverage.

## Acceptance criteria
- [ ] Promote `district-helical-gear-trench` (`Helical-Gear Trench`) from `draft` to `canon` with all 5 Five-Pillar Quality Checklist gates verified (`5/5`) and open the bidirectional route from `town-metronome-pivot-citadel` (`East` portal) to `hunting-area-spiral-wormway-ramp` (`West` portal).
- [ ] Promote `hunting-area-spiral-wormway-ramp` from `mystery` to `canon` (`[0, 1]`), and author `town-helical-torque-hub` (`canon`, `[1, 1]`), `dungeon-worm-drive-gearbox` (`canon`, `[1, 1]`, floor `-1`), and `hunting-area-bevel-pinion-overlook` (`mystery`, `[1, 0]`) with 90-120cm toddler/kid scale compliance and pinned Maxion Monsters (`38..40`).
- [ ] Promote `district-umbrage-prism-atoll` on Continent 03 from `mystery` to `draft` (`4/5` pillars verified) with Mystery child node `hunting-area-violet-spectrum-span`, and seed a new Mystery frontier District `district-terracotta-wind-chimes` on Continent 01.
- [ ] Recompile `content/maps/_manifest.runtime.json` (61 playable maps, 107 Studio nodes) and verify `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes with `100.0%` Quality Score and `A+` (`< 1,000 ms`) warm turn speed.
