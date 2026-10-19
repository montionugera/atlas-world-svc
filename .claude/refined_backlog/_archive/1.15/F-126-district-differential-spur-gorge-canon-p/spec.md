---
title: "District Differential Spur Gorge Canon Promotion, Planetary Carrier Span Connection, and Aurora Chime Atoll Draft"
id: F-126
from_idea: I-220
status: refined
---

# Specification — I-220: District Differential Spur Gorge Canon Promotion, Planetary Carrier Span Connection, and Aurora Chime Atoll Draft

## Outcome Statement
Promote `district-differential-spur-gorge` (`Differential Spur Gorge`) on `continent-02-clockwork-steppe` from `draft` to `canon` with a complete 2×2 connected map matrix (`planetary-carrier-span`, `torque-balance-citadel`, `epicyclic-pinion-vault-b1`, and Mystery frontier `hunting-area-sun-gear-escarpment`), connect `town-helical-torque-hub` (`East`) to `hunting-area-planetary-carrier-span` (`West`), promote `district-aurora-chime-atoll` on `continent-03-shattered-halo` from `mystery` to `draft` with Mystery entry node `hunting-area-resonance-tether-causeway`, and seed `district-saffron-kiln-orchards` (`mystery`) on `continent-01-hearthbloom-basin`.

## Acceptance criteria
- [ ] Promote `district-differential-spur-gorge` (`draft -> canon`, `5/5` verified pillars) on `continent-02-clockwork-steppe` and open `town-helical-torque-hub` `East` portal to `hunting-area-planetary-carrier-span` (`planetary-carrier-span`).
- [ ] Author Canon leaf nodes `hunting-area-planetary-carrier-span.json` (`[0, 1]`), `town-torque-balance-citadel.json` (`[1, 1]`), `dungeon-epicyclic-pinion-vault.json` (`[1, 1]` floor `-1`), and Mystery node `hunting-area-sun-gear-escarpment.json` (`[1, 0]`) obeying the 90 to 120 centimeter Character Scale Law and `INV-01`..`INV-07`.
- [ ] Promote `district-aurora-chime-atoll` (`mystery -> draft`) on `continent-03-shattered-halo` with Mystery entry node `hunting-area-resonance-tether-causeway`, and seed `district-saffron-kiln-orchards` (`mystery`) on `continent-01-hearthbloom-basin`.
- [ ] Update unit tests and run `python3 scripts/run_world_pipeline.py --fast --auto-tune` with 100.0% Quality Score and `A+` (`< 1,000 ms`) warm turn speed.
