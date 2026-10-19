---
title: "Promote district-thermal-compensator-basin to Canon on Continent 02 with 4 leaf nodes, advance district-solstice-pendulum-atoll to Draft on Continent 03, and seed district-cardamom-kiln-caldera on Continent 01"
id: I-231
status: idea
---

# Promote district-thermal-compensator-basin to Canon on Continent 02 with 4 leaf nodes, advance district-solstice-pendulum-atoll to Draft on Continent 03, and seed district-cardamom-kiln-caldera on Continent 01

## Problem

`district-thermal-compensator-basin` (Thermal Compensator Basin) is currently the sole `draft` District in the World Studio hierarchy (Priority #1 in `build/studio_self_evaluation.json`), sitting at the eastern frontier of `continent-02-clockwork-steppe` with only its entry node `hunting-area-radiator-manifold-span` seeded as `mystery`. Meanwhile, `district-solstice-pendulum-atoll` on `continent-03-shattered-halo` is in `mystery` status awaiting promotion to `draft`, and `continent-01-hearthbloom-basin` has 10 Canon districts with no eastern mystery frontier seeded beyond `district-ginger-steam-terraces`.

## Why now

The user explicitly selected promoting `district-thermal-compensator-basin` from `draft` to `canon` with playable Level 4 leaf nodes as the next increment on `release/1.16` after syncing `main` (`5dea9a004`).

## Sketch

1. **Continent 02 (`continent-02-clockwork-steppe`) — Promote `district-thermal-compensator-basin` to `canon`**:
   - Connect `town-bimetallic-chronometer-hub` (`East` portal) to `hunting-area-radiator-manifold-span` (`West` portal).
   - Promote `hunting-area-radiator-manifold-span` (`[0, 1]`, `map_id: "radiator-manifold-span"`) to `canon` with `construct` and `carapace` resident spawns.
   - Add `town-mercury-bellows-hub` (`[1, 1]`, floor `0`, `map_id: "mercury-bellows-hub"`, `canon`) with NPC horologists/engineers and symmetric `West`, `Dungeon`, and `North` (`fog_of_lore`) portals.
   - Add `dungeon-mercury-expansion-sump` (`[1, 1]`, floor `-1`, `map_id: "mercury-expansion-sump-b1"`, `canon`) with `carapace` and `construct` spawns dropping the key referenced by the northern `fog_of_lore` gate.
   - Add `hunting-area-thermocouple-ridge-overlook` (`[1, 0]`, floor `0`, `map_id: null`, `mystery`) behind the `North` `fog_of_lore` gate of `town-mercury-bellows-hub`.
2. **Continent 03 (`continent-03-shattered-halo`) — Advance `district-solstice-pendulum-atoll` to `draft`**:
   - Promote `district-solstice-pendulum-atoll` from `mystery` to `draft` with 4/5 checklist pillars verified (`character_scale_consistency` verified) and seed its western entry node `hunting-area-solstice-chain-causeway` at `[0, 1]` (`mystery`).
3. **Continent 01 (`continent-01-hearthbloom-basin`) — Seed `district-cardamom-kiln-caldera` as `mystery`**:
   - Seed `district-cardamom-kiln-caldera` (Cardamom-Kiln Caldera) as the eleventh District (`mystery`) on `continent-01-hearthbloom-basin` to maintain the 3-continent `canon` / `draft` / `mystery` pipeline equilibrium.
4. **Compile & Verify**:
   - Run `python3 scripts/run_world_pipeline.py --fast --auto-tune` to compile the 3 new playable maps (`radiator-manifold-span`, `mercury-bellows-hub`, `mercury-expansion-sump-b1`) into `content/maps/_manifest.runtime.json` and update unit test expectations in `tests/test_validate_studio_hierarchy.py` and `tests/test_studio_web_perspectives.py`.

## Acceptance criteria

- [ ] `district-thermal-compensator-basin` is `canon` with 5/5 checklist pillars verified and 4 leaf nodes (`hunting-area-radiator-manifold-span`, `town-mercury-bellows-hub`, `dungeon-mercury-expansion-sump`, `hunting-area-thermocouple-ridge-overlook`) bidirectionally linked to `town-bimetallic-chronometer-hub`.
- [ ] `district-solstice-pendulum-atoll` is `draft` with `hunting-area-solstice-chain-causeway` seeded at `[0, 1]`, and `district-cardamom-kiln-caldera` is seeded as `mystery` on `continent-01-hearthbloom-basin`.
- [ ] `python3 scripts/run_world_pipeline.py --fast --auto-tune` passes all 6 stages (`100.0%` quality score, `INV-01..INV-07` PASS) and all unit tests in `tests/test_validate_studio_hierarchy.py` and `tests/test_studio_web_perspectives.py` pass.
