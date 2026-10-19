---
title: "District Verdigris Siphon Canon Promotion, Connected 2x2 Coolant Matrix, and Continent 03 The Shattered Halo Draft Architecture"
id: F-094
from_idea: I-201
status: refined
---

# I-201: District Verdigris Siphon Canon Promotion, Connected 2x2 Coolant Matrix, and Continent 03 The Shattered Halo Draft Architecture

## Summary
Execute Iteration #2 of the 4-hour Autonomous Product Owner Studio Loop (`Increment -> Validate -> Verify -> Measure & Self-Evaluate -> Auto-Tune -> Brainstorm`):
1. **Promote `district-verdigris-siphon` (`draft -> canon`, `5/5` Five-Pillar Quality Checklist)**:
   - Complete the third District on `Continent 02: The Clockwork Steppe` (`level_range: [25, 30]`) with a 2x2 connected map matrix (`grid_nodes` and `portal_edges`) and connect it across the Siphon Aqueduct from `town-escapement-anvil` (`Mainspring Caldera` East Gate upgraded from `fog_of_lore` to `open`) to `hunting-area-siphon-sluice` (`[0, 1]`).
2. **Promote `hunting-area-siphon-sluice` (`mystery -> canon`) & Author 3 New Layer-4 Nodes in `Verdigris Siphon`**:
   - `hunting-area-siphon-sluice.json` (`canon` Hunting Area at `[0, 1]`, `map_id: "siphon-sluice"`, `level_range: [25, 29]`, with `Oxidized Siphon-Construct` and `Copper Brine-Strider` spawns and `0.01%` cards, connected `West` to `town-escapement-anvil` and `East` to `town-patina-lock`).
   - `town-patina-lock.json` (`canon` Town at `[1, 1]`, `map_id: "patina-lock"`, `level_range: [26, 30]`, turquoise copper dye-loom port town connected `West` to `hunting-area-siphon-sluice`, `Dungeon` to `dungeon-mercury-reservoir`, and `North` via a `fog_of_lore` portal to `hunting-area-teal-spillway`).
   - `dungeon-mercury-reservoir.json` (`canon` Dungeon at `[1, 1]`, `floor_index: -1`, `map_id: "mercury-reservoir-b1"`, `level_range: [28, 35]`, subterranean coolant intake vault with `Alchemical Mercury-Slime` and `Verdigris Intake-Warden` spawns and `0.01%` cards).
   - `hunting-area-teal-spillway.json` (`mystery` Hunting Area at `[1, 0]`, `map_id: null`, `level_range: [28, 30]`, northern cliffside waterfall spillway reserved as Fog of Lore).
3. **Seed `district-gilded-exhaust` (`mystery` District on Continent 02)**:
   - Ensures `Continent 01` and `Continent 02` remain canon while preserving an intentional Mystery District (`district-gilded-exhaust`) for downward generation tests and Fog of Lore discipline.
4. **Promote `continent-03-shattered-halo` (`mystery -> draft`, `4/5` Checklist Pillars)** & Author `district-starfall-anchorage` (`draft`, `4/5` Checklist Pillars) + `hunting-area-tether-causeway` (`mystery`):
   - Fulfill `continent-03-shattered-halo`'s `discovery_trigger_hint` (*"Will transition to draft once Continent 02 Clockwork Steppe is canonized"*) by adding `level_band` (`30` to `50`), `climate_profile`, `civilization_style` (`character_scale_adaptation` for 1.05m characters on inverted-gravity tether bridges), `travel_links`, and `district_ids: ["district-starfall-anchorage"]`.

## Acceptance Criteria
- [ ] `python3 scripts/validate_studio_hierarchy.py --check --write-manifest` passes with 0 errors across 32 total studio nodes (`23 canon`, `2 draft`, `7 mystery`) and 15 playable maps in `content/maps/_manifest.runtime.json`.
- [ ] `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes all 7 stages with 100% Quality Score and sub-second (`A+`) warm turn speed.
