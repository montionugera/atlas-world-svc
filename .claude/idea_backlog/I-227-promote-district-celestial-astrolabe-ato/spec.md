# Specification: I-227 — Promote `district-celestial-astrolabe-atoll` to Canon on Continent 03

## 1. Objective & Product Owner Rationale
As part of the Autonomous Product Owner top-down World Studio increment loop on `release/1.15`, the #1 item on `nextIncrementBrainstormQueue` is `[District] district-celestial-astrolabe-atoll (Celestial Astrolabe Atoll) | draft -> canon | Checklist: 4/5`.
Promoting `district-celestial-astrolabe-atoll` to `canon` advances Continent 03 (`The Shattered Halo`) to 11 Canon Districts, opens the eastern portal from `town-penumbra-prism-haven`, and adds 3 new playable maps (`armillary-ring-causeway`, `celestial-astrolabe-sanctuary`, `starlight-orrery-nave-b1`) plus 1 intentional Mystery frontier (`hunting-area-equinox-zenith-arch`). Simultaneously, we advance `district-ginger-steam-terraces` (`mystery -> draft`) on Continent 01 with `hunting-area-ginger-aqueduct-bridge` (`mystery`), and seed `district-thermal-compensator-basin` (`mystery`) on Continent 02.

## 2. Scope & Deliverables
1. **Continent 03 District Promotion (`draft -> canon`)**:
   - `content/studio/districts/continent-03-shattered-halo/district-celestial-astrolabe-atoll.json` (`status: "canon"`, 5/5 verified quality pillars, 4 grid nodes, portal edges).
   - Open `East` portal on `town-penumbra-prism-haven.json` to `hunting-area-armillary-ring-causeway` (`armillary-ring-causeway`).
   - Promote `hunting-area-armillary-ring-causeway.json` (`mystery -> canon`, `map_id: "armillary-ring-causeway"`, `[0, 1]`, floor `0`, `level_range: [49, 50]`).
   - Create `town-celestial-astrolabe-sanctuary.json` (`canon`, `map_id: "celestial-astrolabe-sanctuary"`, `[1, 1]`, floor `0`, `level_range: [49, 50]`).
   - Create `dungeon-starlight-orrery-nave.json` (`canon`, `map_id: "starlight-orrery-nave-b1"`, `[1, 1]`, floor `-1`, `level_range: [49, 50]`).
   - Create `hunting-area-equinox-zenith-arch.json` (`mystery`, `map_id: null`, `[1, 0]`, floor `0`, `level_range: [50, 50]`).
2. **Continent 01 & Continent 02 Frontier Pipeline**:
   - Promote `content/studio/districts/continent-01-hearthbloom-basin/district-ginger-steam-terraces.json` (`mystery -> draft`) and create `content/studio/nodes/continent-01-hearthbloom-basin/district-ginger-steam-terraces/hunting-area-ginger-aqueduct-bridge.json` (`mystery`).
   - Create `content/studio/districts/continent-02-clockwork-steppe/district-thermal-compensator-basin.json` (`mystery`) and register in `continent-02-clockwork-steppe.json`.
3. **Verification Gates**:
   - Zero Abbreviations, 90 to 120 centimeter toddler/kid Character Scale Law, and all Seven Invariants (`INV-01`..`INV-07`).
   - `python3 scripts/run_world_pipeline.py --fast --auto-tune` (`100.0%` Quality Score, `A+` warm turn speed, **157 Studio nodes**, **91 playable maps**).
