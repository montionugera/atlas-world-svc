---
title: "Experience and levels"
id: F-131
status: refined
from_idea: I-154
---

# Experience and levels

## Acceptance criteria

- [ ] `PlayerProgression` component (`level`, `xp`, `xp_to_next_level`, `total_xp`) tracks player experience and level thresholds (`xp_for_level(level)`), and killing a mob grants experience to the killer, advancing `level` and scaling player stats (`max_hp`, `attack_power`) when `xp >= xp_to_next_level` (`server-rs/tests/experience_and_levels_test.rs`).
- [ ] `EntityDelta` on the wire carries `level` and `xp` so the client receives synchronized level and experience updates on every snapshot delta.
