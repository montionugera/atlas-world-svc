---
title: "Damage-over-time statuses"
id: I-175
status: idea
---

# Damage-over-time statuses

## Problem

`StatusEffects` currently supports freeze, stun, and knockback, but has no damage-over-time (DoT) status effects for `burn` or `poison`.

## Acceptance criteria

- [ ] `StatusEffects` and `SkillEffect` support `Burn` and `Poison` damage-over-time statuses with a 5.0-second default duration (`DOT_DEFAULT_DURATION_SEC = 5.0`) and configurable damage per second.
- [ ] Afflicting a target with `burn` or `poison` deals periodic damage over time across 5 seconds (`status_effect_tick_system`) without reapplying the initial attack.
- [ ] Once the 5-second burn or poison duration expires, the status clears and no further DoT damage is applied.
