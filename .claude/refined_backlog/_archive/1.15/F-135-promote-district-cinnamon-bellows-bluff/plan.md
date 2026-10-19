# Implementation Plan: F-135 Promote District Cinnamon-Bellows Bluff to Canon

1. Promote `district-cinnamon-bellows-bluff` (`draft -> canon`) on Continent 01 with 5/5 verified quality pillars and symmetric portal edges.
2. Promote `hunting-area-cinnamon-bark-viaduct` (`mystery -> canon`) at `[0, 1]` and open the East portal from `town-saffron-press-village`.
3. Create `town-cinnamon-mill-haven` (`canon`, `[1, 1]`, floor `0`), `dungeon-spice-kiln-cellar` (`canon`, `[1, 1]`, floor `-1`), and `hunting-area-star-anise-promontory` (`mystery`, `[1, 0]`, floor `0`).
4. Promote `district-bimetallic-escapement-mesa` (`mystery -> draft`) on Continent 02 with `hunting-area-bimetallic-expansion-span` (`mystery`), and seed `district-celestial-astrolabe-atoll` (`mystery`) on Continent 03.
5. Run `python3 scripts/run_world_pipeline.py --fast --auto-tune` and verify `100.0%` Quality Score and `A+` (`< 1,000 ms`) turn speed.
