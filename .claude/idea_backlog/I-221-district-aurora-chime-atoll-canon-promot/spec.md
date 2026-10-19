# Specification — I-221: District Aurora Chime Atoll Canon Promotion, Resonance Tether Causeway Connection, and Saffron Kiln Orchards Draft

## Outcome Statement
Promote `district-aurora-chime-atoll` (`Aurora Chime Atoll`) on `continent-03-shattered-halo` from `draft` to `canon` with a complete 2×2 connected map matrix (`resonance-tether-causeway`, `aurora-bell-sanctuary`, `stalactite-carillon-nave-b1`, and Mystery frontier `hunting-area-magnetosphere-ribbon-arch`), connect `town-umbrage-focal-sanctum` (`East`) to `hunting-area-resonance-tether-causeway` (`West`), promote `district-saffron-kiln-orchards` on `continent-01-hearthbloom-basin` from `mystery` to `draft` with Mystery entry node `hunting-area-apricot-aqueduct-terrace`, and seed `district-flywheel-dynamo-canyon` (`mystery`) on `continent-02-clockwork-steppe`.

## Acceptance criteria
- [ ] Promote `district-aurora-chime-atoll` (`draft -> canon`, `5/5` verified pillars) on `continent-03-shattered-halo` and open `town-umbrage-focal-sanctum` `East` portal to `hunting-area-resonance-tether-causeway` (`resonance-tether-causeway`).
- [ ] Author Canon leaf nodes `hunting-area-resonance-tether-causeway.json` (`[0, 1]`), `town-aurora-bell-sanctuary.json` (`[1, 1]`), `dungeon-stalactite-carillon-nave.json` (`[1, 1]` floor `-1`), and Mystery node `hunting-area-magnetosphere-ribbon-arch.json` (`[1, 0]`) obeying the 90 to 120 centimeter Character Scale Law and `INV-01`..`INV-07`.
- [ ] Promote `district-saffron-kiln-orchards` (`mystery -> draft`) on `continent-01-hearthbloom-basin` with Mystery entry node `hunting-area-apricot-aqueduct-terrace`, and seed `district-flywheel-dynamo-canyon` (`mystery`) on `continent-02-clockwork-steppe`.
- [ ] Update unit tests and run `python3 scripts/run_world_pipeline.py --fast --auto-tune` with 100.0% Quality Score and `A+` (`< 1,000 ms`) warm turn speed.
