# Implementation Plan: F-143 — Promote `district-ginger-steam-terraces` to Canon on Continent 01

1. Promote `content/studio/districts/continent-01-hearthbloom-basin/district-ginger-steam-terraces.json` (`draft -> canon`) with 5/5 verified quality pillars and 2x2 grid nodes.
2. Promote `hunting-area-ginger-aqueduct-bridge.json` (`mystery -> canon`) and open `East` portal on `town-cinnamon-mill-haven.json`.
3. Create `town-ginger-bathhouse-haven.json` (`canon`), `dungeon-teapot-steam-cistern.json` (`canon`), and `hunting-area-cardamom-cloud-overlook.json` (`mystery`).
4. Promote `district-thermal-compensator-basin.json` (`mystery -> draft`) on Continent 02 with `hunting-area-radiator-manifold-span.json` (`mystery`) and seed `district-solstice-pendulum-atoll.json` (`mystery`) on Continent 03.
5. Run `python3 scripts/run_world_pipeline.py --fast --auto-tune` and verify unit tests (`unittest` across hierarchy and web perspectives).
