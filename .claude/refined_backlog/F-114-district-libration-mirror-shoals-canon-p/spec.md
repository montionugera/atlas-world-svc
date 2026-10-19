---
title: "District Libration Mirror Shoals Canon Promotion, Silver-Tide Causeway Connection, and Glaze-River Delta Draft"
id: F-114
from_idea: I-214
status: refined
---

# Spec: I-214 — District Libration Mirror Shoals Canon Promotion, Silver-Tide Causeway Connection, and Glaze-River Delta Draft

## Problem Statement
The Product Owner Self-Evaluation prioritized brainstorm queue (`build/studio_self_evaluation.json`) ranks:
1. `[District] district-libration-mirror-shoals` (`Libration Mirror Shoals`) on Continent 03 (`continent-03-shattered-halo`): currently `draft` (`4/5` Five-Pillar Quality Checklist verified) -> ready to promote to `canon` with a complete 2×2 connected map matrix (`Levels 48 to 50`).
2. `[District] district-glaze-river-delta` (`Glaze-River Delta`) on Continent 01 (`continent-01-hearthbloom-basin`): currently `mystery` (`3/5` checklist verified) -> ready to promote to `draft` (`4/5` checklist verified) with an initial Mystery border Hunting Area (`hunting-area-cobalt-sandbar-ford`), while seeding a new Mystery frontier District (`district-helical-gear-trench`) on Continent 02 (`continent-02-clockwork-steppe`) to preserve multi-layer `canon + draft + mystery` test coverage.

## Acceptance criteria
- [ ] Promote `district-libration-mirror-shoals` (`Libration Mirror Shoals`) from `draft` to `canon` with all 5 Five-Pillar Quality Checklist gates verified (`5/5`) and open the bidirectional route from `town-aphelion-buoy-haven` (`East` portal) to `hunting-area-silver-tide-causeway` (`West` portal).
- [ ] Promote `hunting-area-silver-tide-causeway` from `mystery` to `canon` (`[0, 1]`), and author `town-libration-balance-haven` (`canon`, `[1, 1]`), `dungeon-sunken-syzygy-dome` (`canon`, `[1, 1]`, floor `-1`), and `hunting-area-crescent-reflector-reef` (`mystery`, `[1, 0]`) with 90-120cm toddler/kid scale compliance and pinned Maxion Monsters (`48..50`).
- [ ] Promote `district-glaze-river-delta` on Continent 01 from `mystery` to `draft` (`4/5` pillars verified) with Mystery child node `hunting-area-cobalt-sandbar-ford`, and seed a new Mystery frontier District `district-helical-gear-trench` on Continent 02.
- [ ] Recompile `content/maps/_manifest.runtime.json` (55 playable maps, 97 Studio nodes) and verify `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes with `100.0%` Quality Score and `A+` (`< 1,000 ms`) warm turn speed.
