---
title: "Bestiary catalog ingestion, mob AI states, threat table, and respawn lifecycle in server-rs"
id: F-062
status: refined
from_idea: I-133
---

# Bestiary catalog ingestion, mob AI states, threat table, and respawn lifecycle in server-rs

## Acceptance criteria

- [ ] Bestiary catalog ingestion: Deserialize and index `content/bestiary/bestiary.json` in Rust with type-safe `BestiaryEntry` mappings.
- [ ] Mob stat derivation: Calculate runtime stats (HP, pAtk, pDef, armor, speed, element, chase range) from tier and archetype formulas matching F-031 rules bit-for-bit.
- [ ] Threat table: Implement decaying threat table with exponential half-life decay, damage accumulation, and taunt locking.
- [ ] Mob AI state machine: Implement `Idle`, `Wander`, `Chase`, `Attack`, and `ReturnHome` states driven by threat table and leash distances in Bevy ECS.
- [ ] Respawn lifecycle: Automatically respawn dead mobs at their spawn anchor after respawn timer with full health and reset AI state.
- [ ] Automated unit and integration tests in `server-rs` verifying catalog parsing, derivation accuracy, threat resolution, and respawn loop.
