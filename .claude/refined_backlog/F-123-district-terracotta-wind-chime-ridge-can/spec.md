---
title: "District Terracotta Wind-Chime Ridge Canon Promotion, Chime-Pipe Colonnade Connection, and Differential Spur Gorge Draft"
id: F-123
from_idea: I-219
status: refined
---

# Specification — I-219: District Terracotta Wind-Chime Ridge Canon Promotion, Chime-Pipe Colonnade Connection, and Differential Spur Gorge Draft

## Outcome Statement
Promote `district-terracotta-wind-chimes` (`Terracotta Wind-Chime Ridge`) on `continent-01-hearthbloom-basin` from `draft` to `canon` with a complete 2×2 connected map matrix (`chime-pipe-colonnade`, `carillon-hearth-belfry`, `ceramic-resonator-crypt-b1`, and Mystery frontier `hunting-area-flute-crest-promontory`), connect `town-glaze-barge-quay` (`East`) to `hunting-area-chime-pipe-colonnade` (`West`), promote `district-differential-spur-gorge` on `continent-02-clockwork-steppe` from `mystery` to `draft` with Mystery entry node `hunting-area-planetary-carrier-span`, and seed `district-aurora-chime-atoll` (`mystery`) on `continent-03-shattered-halo`.

## Acceptance criteria
- [ ] Promote `district-terracotta-wind-chimes` (`draft -> canon`, `5/5` verified pillars) on `continent-01-hearthbloom-basin` and open `town-glaze-barge-quay` `East` portal to `hunting-area-chime-pipe-colonnade` (`chime-pipe-colonnade`).
- [ ] Author Canon leaf nodes `hunting-area-chime-pipe-colonnade.json` (`[0, 1]`), `town-carillon-hearth-belfry.json` (`[1, 1]`), `dungeon-ceramic-resonator-crypt.json` (`[1, 1]` floor `-1`), and Mystery node `hunting-area-flute-crest-promontory.json` (`[1, 0]`) obeying the 90 to 120 centimeter Character Scale Law and `INV-01`..`INV-07`.
- [ ] Promote `district-differential-spur-gorge` (`mystery -> draft`) on `continent-02-clockwork-steppe` with Mystery entry node `hunting-area-planetary-carrier-span`, and seed `district-aurora-chime-atoll` (`mystery`) on `continent-03-shattered-halo`.
- [ ] Update unit tests and run `python3 scripts/run_world_pipeline.py --fast --auto-tune` with 100.0% Quality Score and `A+` (`< 1,000 ms`) warm turn speed.
