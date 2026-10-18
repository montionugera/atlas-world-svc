# Implementation Plan: F-134 Promote District Penumbra Prism Reef to Canon

1. Promote `district-penumbra-prism-reef` (`draft -> canon`) on Continent 03 with 5/5 verified quality pillars and symmetric portal edges.
2. Promote `hunting-area-penumbra-refraction-causeway` (`mystery -> canon`) at `[0, 1]` and open the East portal from `town-aurora-bell-sanctuary`.
3. Create `town-penumbra-prism-haven` (`canon`, `[1, 1]`, floor `0`), `dungeon-twilight-coral-crypt` (`canon`, `[1, 1]`, floor `-1`), and `hunting-area-corona-flare-arch` (`mystery`, `[1, 0]`, floor `0`).
4. Promote `district-cinnamon-bellows-bluff` (`mystery -> draft`) on Continent 01 with `hunting-area-cinnamon-bark-viaduct` (`mystery`), and seed `district-bimetallic-escapement-mesa` (`mystery`) on Continent 02.
5. Run `python3 scripts/run_world_pipeline.py --fast --auto-tune` and verify `100.0%` Quality Score and `A+` (`< 1,000 ms`) turn speed.
