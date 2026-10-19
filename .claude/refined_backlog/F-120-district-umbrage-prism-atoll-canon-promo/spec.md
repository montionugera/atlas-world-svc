---
title: "District Umbrage Prism Atoll Canon Promotion, Violet Spectrum Span Connection, and Terracotta Wind-Chime Ridge Draft"
id: F-120
from_idea: I-218
status: refined
---

# Spec: I-218 — District Umbrage Prism Atoll Canon Promotion, Violet Spectrum Span Connection, and Terracotta Wind-Chime Ridge Draft

## Problem Statement
The Product Owner Self-Evaluation prioritized brainstorm queue (`build/studio_self_evaluation.json`) ranks:
1. `[District] district-umbrage-prism-atoll` (`Umbrage Prism Atoll`) on Continent 03 (`continent-03-shattered-halo`): currently `draft` (`4/5` Five-Pillar Quality Checklist verified) -> ready to promote to `canon` with a complete 2×2 connected map matrix (`Levels 49 to 50`).
2. `[District] district-terracotta-wind-chimes` (`Terracotta Wind-Chime Ridge`) on Continent 01 (`continent-01-hearthbloom-basin`): currently `mystery` (`3/5` checklist verified) -> ready to promote to `draft` (`4/5` checklist verified) with an initial Mystery border Hunting Area (`hunting-area-chime-pipe-colonnade`), while seeding a new Mystery frontier District (`district-differential-spur-gorge`) on Continent 02 (`continent-02-clockwork-steppe`) to preserve multi-layer `canon + draft + mystery` test coverage.

## Acceptance criteria
- [ ] Promote `district-umbrage-prism-atoll` (`Umbrage Prism Atoll`) from `draft` to `canon` with all 5 Five-Pillar Quality Checklist gates verified (`5/5`) and open the bidirectional route from `town-libration-balance-haven` (`East` portal) to `hunting-area-violet-spectrum-span` (`West` portal).
- [ ] Promote `hunting-area-violet-spectrum-span` from `mystery` to `canon` (`[0, 1]`), and author `town-umbrage-focal-sanctum` (`canon`, `[1, 1]`), `dungeon-shadow-refraction-crypt` (`canon`, `[1, 1]`, floor `-1`), and `hunting-area-indigo-caustic-arch` (`mystery`, `[1, 0]`) with 90-120cm toddler/kid scale compliance and pinned Maxion Monsters (`49..50`).
- [ ] Promote `district-terracotta-wind-chimes` on Continent 01 from `mystery` to `draft` (`4/5` pillars verified) with Mystery child node `hunting-area-chime-pipe-colonnade`, and seed a new Mystery frontier District `district-differential-spur-gorge` on Continent 02.
- [ ] Recompile `content/maps/_manifest.runtime.json` (64 playable maps, 112 Studio nodes) and verify `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes with `100.0%` Quality Score and `A+` (`< 1,000 ms`) warm turn speed.
