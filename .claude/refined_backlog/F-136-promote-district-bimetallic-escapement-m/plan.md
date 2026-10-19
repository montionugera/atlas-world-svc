# Implementation Plan: F-136 — Promote `district-bimetallic-escapement-mesa` to Canon on Continent 02

1. Promote `content/studio/districts/continent-02-clockwork-steppe/district-bimetallic-escapement-mesa.json` (`draft -> canon`) with 5/5 verified quality pillars and 2x2 grid nodes.
2. Promote `hunting-area-bimetallic-expansion-span.json` (`mystery -> canon`) and open `East` portal on `town-flywheel-governor-hub.json`.
3. Create `town-bimetallic-chronometer-hub.json` (`canon`), `dungeon-invar-balance-vault.json` (`canon`), and `hunting-area-solar-coil-overlook.json` (`mystery`).
4. Promote `district-celestial-astrolabe-atoll.json` (`mystery -> draft`) on Continent 03 with `hunting-area-armillary-ring-causeway.json` (`mystery`) and seed `district-ginger-steam-terraces.json` (`mystery`) on Continent 01.
5. Run `python3 scripts/run_world_pipeline.py --fast --auto-tune` and verify unit tests (`unittest` across hierarchy and web perspectives).
