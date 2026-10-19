# Specification — I-222: District Saffron Kiln Orchards Canon Promotion, Apricot Aqueduct Terrace Connection, and Flywheel Dynamo Canyon Draft

## Outcome Statement
Promote `district-saffron-kiln-orchards` (`Saffron Kiln Orchards`) on `continent-01-hearthbloom-basin` from `draft` to `canon` with a complete 2×2 connected map matrix (`apricot-aqueduct-terrace`, `saffron-press-village`, `nectar-glaze-vat-b1`, and Mystery frontier `hunting-area-honeycomb-kiln-ridge`), connect `town-carillon-hearth-belfry` (`East`) to `hunting-area-apricot-aqueduct-terrace` (`West`), promote `district-flywheel-dynamo-canyon` on `continent-02-clockwork-steppe` from `mystery` to `draft` with Mystery entry node `hunting-area-centrifugal-gantry-span`, and seed `district-penumbra-prism-reef` (`mystery`) on `continent-03-shattered-halo`.

## Acceptance criteria
- [ ] Promote `district-saffron-kiln-orchards` (`draft -> canon`, `5/5` verified pillars) on `continent-01-hearthbloom-basin` and open `town-carillon-hearth-belfry` `East` portal to `hunting-area-apricot-aqueduct-terrace` (`apricot-aqueduct-terrace`).
- [ ] Author Canon leaf nodes `hunting-area-apricot-aqueduct-terrace.json` (`[0, 1]`), `town-saffron-press-village.json` (`[1, 1]`), `dungeon-nectar-glaze-vat.json` (`[1, 1]` floor `-1`), and Mystery node `hunting-area-honeycomb-kiln-ridge.json` (`[1, 0]`) obeying the 90 to 120 centimeter Character Scale Law and `INV-01`..`INV-07`.
- [ ] Promote `district-flywheel-dynamo-canyon` (`mystery -> draft`) on `continent-02-clockwork-steppe` with Mystery entry node `hunting-area-centrifugal-gantry-span`, and seed `district-penumbra-prism-reef` (`mystery`) on `continent-03-shattered-halo`.
- [ ] Update unit tests and run `python3 scripts/run_world_pipeline.py --fast --auto-tune` with 100.0% Quality Score and `A+` (`< 1,000 ms`) warm turn speed.
