# Spec: I-213 — District West Pendulum Steppe Canon Promotion, Metronome Bridge Connection, and Libration Mirror Shoals Draft

## Problem Statement
The Product Owner Self-Evaluation prioritized brainstorm queue (`build/studio_self_evaluation.json`) ranks:
1. `[District] district-pendulum-steppe-west` (`West Pendulum Steppe`) on Continent 02 (`continent-02-clockwork-steppe`): currently `draft` (`4/5` Five-Pillar Quality Checklist verified) -> ready to promote to `canon` with a complete 2×2 connected map matrix (`Levels 21 to 35`).
2. `[District] district-libration-mirror-shoals` (`Libration Mirror Shoals`) on Continent 03 (`continent-03-shattered-halo`): currently `mystery` (`3/5` checklist verified) -> ready to promote to `draft` (`4/5` checklist verified) with an initial Mystery border Hunting Area (`hunting-area-silver-tide-causeway`), while seeding a new Mystery frontier District (`district-glaze-river-delta`) on Continent 01 (`continent-01-hearthbloom-basin`) to preserve multi-layer `canon + draft + mystery` test coverage.

## Acceptance criteria
- [ ] Promote `district-pendulum-steppe-west` (`West Pendulum Steppe`) from `draft` to `canon` with all 5 Five-Pillar Quality Checklist gates verified (`5/5`) and open the bidirectional route from `town-pinion-terminus` (`West` portal) to `hunting-area-metronome-bridge` (`East` portal).
- [ ] Promote `hunting-area-metronome-bridge` from `mystery` to `canon` (`[0, 1]`), and author `town-metronome-pivot-citadel` (`canon`, `[1, 1]`), `dungeon-counterweight-shaft` (`canon`, `[1, 1]`, floor `-1`), and `hunting-area-Deadbeat-escapement-bluff` (`hunting-area-deadbeat-escapement-bluff`, `mystery`, `[1, 0]`) with 90-120cm toddler/kid scale compliance and pinned Maxion Monsters (`21..35`).
- [ ] Promote `district-libration-mirror-shoals` on Continent 03 from `mystery` to `draft` (`4/5` pillars verified) with Mystery child node `hunting-area-silver-tide-causeway`, and seed a new Mystery frontier District `district-glaze-river-delta` on Continent 01.
- [ ] Recompile `content/maps/_manifest.runtime.json` (52 playable maps, 92 Studio nodes) and verify `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes with `100.0%` Quality Score and `A+` (`< 1,000 ms`) warm turn speed.
