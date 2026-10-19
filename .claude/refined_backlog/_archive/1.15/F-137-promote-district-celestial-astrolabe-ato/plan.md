# Implementation Plan: F-137 — Promote `district-celestial-astrolabe-atoll` to Canon on Continent 03

1. Promote `content/studio/districts/continent-03-shattered-halo/district-celestial-astrolabe-atoll.json` (`draft -> canon`) with 5/5 verified quality pillars and 2x2 grid nodes.
2. Promote `hunting-area-armillary-ring-causeway.json` (`mystery -> canon`) and open `East` portal on `town-penumbra-prism-haven.json`.
3. Create `town-celestial-astrolabe-sanctuary.json` (`canon`), `dungeon-starlight-orrery-nave.json` (`canon`), and `hunting-area-equinox-zenith-arch.json` (`mystery`).
4. Promote `district-ginger-steam-terraces.json` (`mystery -> draft`) on Continent 01 with `hunting-area-ginger-aqueduct-bridge.json` (`mystery`) and seed `district-thermal-compensator-basin.json` (`mystery`) on Continent 02.
5. Run `python3 scripts/run_world_pipeline.py --fast --auto-tune` and verify unit tests (`unittest` across hierarchy and web perspectives).
