---
title: "District Aphelion Halo Rim Canon Promotion, Comet-Tether Span Connection, and Amber-Root Hollows Draft"
id: F-110
from_idea: I-211
status: refined
---

# Spec — I-211: District Aphelion Halo Rim Canon Promotion, Comet-Tether Span Connection, and Amber-Root Hollows Draft

## Problem & Product Owner Goal
As part of the continuous 4-hour Autonomous Product Owner loop on `release/1.15`, the top priorities in `build/studio_self_evaluation.json` are:
1. Promote `[District] district-aphelion-halo-rim (Aphelion Halo Rim)` on Continent 03 (`The Shattered Halo`) from `draft` to `canon` (`5/5` Five-Pillar Quality Checklist) with a connected 2×2 District matrix (`hunting-area-comet-tether-span`, `town-aphelion-buoy-haven`, `dungeon-comet-core-geode`, `hunting-area-outer-orbit-drift`), linking `town-perigee-diving-station` (`East`) <-> `hunting-area-comet-tether-span` (`West`).
2. Promote `[District] district-amber-root-hollows (Amber-Root Hollows)` on Continent 01 (`Hearthbloom Basin`) from `mystery` to `draft` (`4/5` pillars) and seed its initial Mystery child `hunting-area-resin-arch-tunnel`.
3. Seed a new `mystery` District on Continent 02 (`The Clockwork Steppe`), `district-pendulum-steppe-west` (`3/5` pillars), so the repository continues to maintain at least 1 `canon`, 1 `draft`, and 1 `mystery` District for full Four-Level Studio verification.

## Acceptance criteria
- [ ] All 7 invariants (`INV-01..INV-07`) pass with 0 errors.
- [ ] `content/maps/_manifest.runtime.json` compiles 46 playable maps (`+3` new Canon maps: `comet-tether-span`, `aphelion-buoy-haven`, `comet-core-geode-b1`).
- [ ] `python3 scripts/run_world_pipeline.py --fast --auto-tune` achieves `100.0%` Quality Score and `A+` (`< 1,000 ms`) warm turn speed across 82 total Studio nodes.
