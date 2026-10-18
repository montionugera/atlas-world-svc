# Spec — I-212: District Amber-Root Hollows Canon Promotion, Resin-Arch Tunnel Connection, and West Pendulum Steppe Draft

## Problem & Product Owner Goal
As part of the continuous 4-hour Autonomous Product Owner loop on `release/1.15`, the top priorities in `build/studio_self_evaluation.json` are:
1. Promote `[District] district-amber-root-hollows (Amber-Root Hollows)` on Continent 01 (`Hearthbloom Basin`) from `draft` to `canon` (`5/5` Five-Pillar Quality Checklist) with a connected 2×2 District matrix (`hunting-area-resin-arch-tunnel`, `town-root-train-roundhouse`, `dungeon-sap-heart-cistern`, `hunting-area-banyan-canopy-spur`), linking `town-porcelain-loom-sanctuary` (`East`) <-> `hunting-area-resin-arch-tunnel` (`West`).
2. Promote `[District] district-pendulum-steppe-west (West Pendulum Steppe)` on Continent 02 (`The Clockwork Steppe`) from `mystery` to `draft` (`4/5` pillars) and seed its initial Mystery child `hunting-area-metronome-bridge`.
3. Seed a new `mystery` District on Continent 03 (`The Shattered Halo`), `district-libration-mirror-shoals` (`3/5` pillars), so the repository continues to maintain at least 1 `canon`, 1 `draft`, and 1 `mystery` District for full Four-Level Studio verification.

## Acceptance criteria
- [ ] All 7 invariants (`INV-01..INV-07`) pass with 0 errors.
- [ ] `content/maps/_manifest.runtime.json` compiles 49 playable maps (`+3` new Canon maps: `resin-arch-tunnel`, `root-train-roundhouse`, `sap-heart-cistern-b1`).
- [ ] `python3 scripts/run_world_pipeline.py --fast --auto-tune` achieves `100.0%` Quality Score and `A+` (`< 1,000 ms`) warm turn speed across 87 total Studio nodes.
