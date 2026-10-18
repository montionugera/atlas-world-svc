---
title: "District Thunder-Coil Basin Canon Promotion, Leyden Causeway Connection, and Aphelion Halo Rim Draft"
id: F-108
from_idea: I-210
status: refined
---

# Spec — I-210: District Thunder-Coil Basin Canon Promotion, Leyden Causeway Connection, and Aphelion Halo Rim Draft

## Problem & Product Owner Goal
As part of the continuous 4-hour Autonomous Product Owner loop on `release/1.15`, the top priorities in `build/studio_self_evaluation.json` are:
1. Promote `[District] district-thunder-coil-basin (Thunder-Coil Basin)` on Continent 02 (`The Clockwork Steppe`) from `draft` to `canon` (`5/5` Five-Pillar Quality Checklist) with a connected 2×2 District matrix (`hunting-area-leyden-causeway`, `town-inductor-switchyard`, `dungeon-faraday-dynamo-vault`, `hunting-area-corona-arc-cliff`), linking `town-bellows-hearth` (`East`) <-> `hunting-area-leyden-causeway` (`West`).
2. Promote `[District] district-aphelion-halo-rim (Aphelion Halo Rim)` on Continent 03 (`The Shattered Halo`) from `mystery` to `draft` (`4/5` pillars) and seed its initial Mystery child `hunting-area-comet-tether-span`.
3. Seed a new `mystery` District on Continent 01 (`Hearthbloom Basin`), `district-amber-root-hollows` (`3/5` pillars), so the repository continues to maintain at least 1 `canon`, 1 `draft`, and 1 `mystery` District for full Four-Level Studio verification.

## Acceptance criteria
- [ ] All 7 invariants (`INV-01..INV-07`) pass with 0 errors.
- [ ] `content/maps/_manifest.runtime.json` compiles 43 playable maps (`+3` new Canon maps: `leyden-causeway`, `inductor-switchyard`, `faraday-dynamo-vault-b1`).
- [ ] `python3 scripts/run_world_pipeline.py --fast --auto-tune` achieves `100.0%` Quality Score and `A+` (`< 1,000 ms`) warm turn speed across 77 total Studio nodes.
