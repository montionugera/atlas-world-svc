---
title: "Weapon switching and skill loadout in play"
id: I-159
status: idea
---

# Weapon switching and skill loadout in play

## Acceptance criteria

- [ ] `SkillLoadout` component maps player skill slots `1..=4` to custom equipped skill IDs (`server-rs/src/ecs/components.rs`), and `skill_execution_system` resolves slot `1..=4` from `SkillLoadout` when present instead of hardcoded defaults (`server-rs/tests/weapon_switch_and_skill_loadout_test.rs`).
- [ ] Switching the active weapon updates `EquippedWeapon` on the server so subsequent primary attacks immediately switch between melee strike and aimed ranged projectile behavior.
