---
title: "Parry cost"
id: I-172
status: idea
---

# Parry cost

## Problem

Holding the attack button currently allows a player to parry incoming projectiles indefinitely with zero stamina, charge, or hold-window limit, trivializing ranged threats.

## Acceptance criteria

- [ ] Owner decision documented and enforced via `ParryState`: holding attack only provides an active parry window of `MAX_PARRY_HOLD_WINDOW_SEC = 0.4` seconds and at most `MAX_PARRY_CHARGES = 2` consecutive parries before triggering a `PARRY_COOLDOWN_SEC = 1.5` second recovery cooldown.
- [ ] A fresh swing within the 0.4 s parry window with available parry charges deflects an incoming projectile and consumes 1 parry charge.
- [ ] Continuously holding attack beyond `0.4` seconds or exhausting `2` parry charges disables parrying (`can_parry() == false`), causing subsequent incoming projectiles to hit and damage the player until parry recovery completes.
- [ ] A mob struck by its own reflected (`Parried`) projectile is staggered (`StatusEffects::is_stunned()`) for `PARRY_REFLECT_STAGGER_SEC = 0.6` seconds.
