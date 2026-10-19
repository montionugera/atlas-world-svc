# Spec: I-216 — District Glaze-River Delta Canon Promotion, Cobalt Sandbar Ford Connection, and Helical-Gear Trench Draft

## Problem Statement
The Product Owner Self-Evaluation prioritized brainstorm queue (`build/studio_self_evaluation.json`) ranks:
1. `[District] district-glaze-river-delta` (`Glaze-River Delta`) on Continent 01 (`continent-01-hearthbloom-basin`): currently `draft` (`4/5` Five-Pillar Quality Checklist verified) -> ready to promote to `canon` with a complete 2×2 connected map matrix (`Levels 18 to 20`).
2. `[District] district-helical-gear-trench` (`Helical-Gear Trench`) on Continent 02 (`continent-02-clockwork-steppe`): currently `mystery` (`3/5` checklist verified) -> ready to promote to `draft` (`4/5` checklist verified) with an initial Mystery border Hunting Area (`hunting-area-spiral-wormway-ramp`), while seeding a new Mystery frontier District (`district-umbrage-prism-atoll`) on Continent 03 (`continent-03-shattered-halo`) to preserve multi-layer `canon + draft + mystery` test coverage.

## Acceptance criteria
- [ ] Promote `district-glaze-river-delta` (`Glaze-River Delta`) from `draft` to `canon` with all 5 Five-Pillar Quality Checklist gates verified (`5/5`) and open the bidirectional route from `town-root-train-roundhouse` (`East` portal) to `hunting-area-cobalt-sandbar-ford` (`West` portal).
- [ ] Promote `hunting-area-cobalt-sandbar-ford` from `mystery` to `canon` (`[0, 1]`), and author `town-glaze-barge-quay` (`canon`, `[1, 1]`), `dungeon-sunken-potter-hold` (`canon`, `[1, 1]`, floor `-1`), and `hunting-area-kiln-lighthouse-spit` (`mystery`, `[1, 0]`) with 90-120cm toddler/kid scale compliance and pinned Maxion Monsters (`18..20`).
- [ ] Promote `district-helical-gear-trench` on Continent 02 from `mystery` to `draft` (`4/5` pillars verified) with Mystery child node `hunting-area-spiral-wormway-ramp`, and seed a new Mystery frontier District `district-umbrage-prism-atoll` on Continent 03.
- [ ] Recompile `content/maps/_manifest.runtime.json` (58 playable maps, 102 Studio nodes) and verify `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes with `100.0%` Quality Score and `A+` (`< 1,000 ms`) warm turn speed.
