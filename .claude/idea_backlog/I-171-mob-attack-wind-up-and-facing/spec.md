---
title: "Mob attack wind-up and facing"
id: I-171
status: idea
---

# Mob attack wind-up and facing

## Problem

Mobs currently fire their melee or ranged attack on the exact tick their cooldown reaches zero, giving players no visual or temporal tell to react, and their attacks hit regardless of whether the target remains inside the mob's facing cone at the moment the swing lands.

## Acceptance criteria

- [ ] `MobAi` supports an 800 ms (`MOB_WINDUP_DURATION_SEC = 0.8`) attack wind-up tell (`is_winding_up()`, `windup_timer`, `windup_facing`) and a facing cone check (`MOB_FACING_CONE_HALF_ANGLE_COS = 0.5`, 60-degree half-angle / 120-degree cone).
- [ ] When a mob with wind-up enabled begins an attack, it locks its facing vector toward the target and enters the wind-up state for 800 ms before the attack lands.
- [ ] If the player remains inside the mob's facing cone and within range when the 800 ms wind-up completes, the attack lands and reduces the player's health.
- [ ] If the player moves out of the mob's facing cone before the 800 ms wind-up completes, the attack misses and the player takes zero damage.
