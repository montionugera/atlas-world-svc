# Implementation Plan: F-130 Promote District Saffron Kiln Orchards to Canon

1. Promote `district-saffron-kiln-orchards` (`draft -> canon`) on Continent 01 with 5/5 verified quality pillars and symmetric portal edges.
2. Promote `hunting-area-apricot-aqueduct-terrace` (`mystery -> canon`) at `[0, 1]` and open the East portal from `town-carillon-hearth-belfry`.
3. Create `town-saffron-press-village` (`canon`, `[1, 1]`, floor `0`), `dungeon-nectar-glaze-vat` (`canon`, `[1, 1]`, floor `-1`), and `hunting-area-honeycomb-kiln-ridge` (`mystery`, `[1, 0]`, floor `0`).
4. Promote `district-flywheel-dynamo-canyon` (`mystery -> draft`) on Continent 02 with `hunting-area-centrifugal-gantry-span` (`mystery`), and seed `district-penumbra-prism-reef` (`mystery`) on Continent 03.
5. Run `python3 scripts/run_world_pipeline.py --fast --auto-tune` and verify `100.0%` Quality Score and `A+` (`< 1,000 ms`) turn speed.
