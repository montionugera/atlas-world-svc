---
title: "Mob attack variety"
id: I-178
status: idea
---

# Mob attack variety

## Problem

Each mob currently has only a single attack profile (`is_ranged` boolean), so mobs never vary their attacks based on combat situation or target distance.

## Acceptance criteria

- [ ] `MobAi` supports a list of `MobAttackAbility` entries (`abilities: Vec<MobAttackAbility>`) with per-ability distance bands (`min_range..=max_range`), damage multipliers, projectile/AoE parameters, and status effects.
- [ ] In `mob_ai_system`, a mob with multiple attack abilities selects between at least 2 distinct attacks depending on its current distance to the player target (e.g. a close-range melee cleave when near and a ranged projectile/lunge attack when further away) and records `last_used_ability`.
- [ ] Integration tests verify that the same mob executes different attack abilities when the player target is at close range versus mid/far range.
