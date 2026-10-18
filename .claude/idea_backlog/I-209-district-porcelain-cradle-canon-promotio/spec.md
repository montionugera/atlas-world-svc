# Spec — I-209: District Porcelain Cradle Canon Promotion, Celadon Causeway Connection, and Thunder-Coil Basin Draft

## Problem & Product Owner Goal
As part of the continuous 4-hour Autonomous Product Owner loop on `release/1.15`, the top priorities in `build/studio_self_evaluation.json` are:
1. Promote `[District] district-porcelain-cradle (Porcelain Cradle Sanctuary)` on Continent 01 (`Hearthbloom Basin`) from `draft` to `canon` (`5/5` Five-Pillar Quality Checklist) with a connected 2×2 District matrix (`hunting-area-celadon-causeway`, `town-porcelain-loom-sanctuary`, `dungeon-medallion-heart-vault`, `hunting-area-lotus-kiln-rim`), linking `town-draft-kiln-post` (`East`) <-> `hunting-area-celadon-causeway` (`West`).
2. Promote `[District] district-thunder-coil-basin (Thunder-Coil Basin)` on Continent 02 (`The Clockwork Steppe`) from `mystery` to `draft` (`4/5` pillars) and seed its initial Mystery child `hunting-area-leyden-causeway`.
3. Seed a new `mystery` District on Continent 03 (`The Shattered Halo`), `district-aphelion-halo-rim` (`3/5` pillars), so the repository continues to maintain at least 1 `canon`, 1 `draft`, and 1 `mystery` District for full Four-Level Studio verification.

## Acceptance criteria
1. All 7 invariants (`INV-01..INV-07`) pass with 0 errors.
2. `content/maps/_manifest.runtime.json` compiles 40 playable maps (`+3` new Canon maps: `celadon-causeway`, `porcelain-loom-sanctuary`, `medallion-heart-vault-b1`).
3. `python3 scripts/run_world_pipeline.py --fast --auto-tune` achieves `100.0%` Quality Score and `A+` (`< 1,000 ms`) warm turn speed across 72 total Studio nodes.
