---
title: "Aimed ranged attacks"
id: I-173
status: idea
---

# Aimed ranged attacks

## Problem

Every weapon in `combat_system` currently executes an instant auto-targeted hit against the nearest mob in range. Ranged weapons (`Bow` and `Staff`) must instead fire projectiles along the player's aimed direction so aiming matters.

## Acceptance criteria

- [ ] `WeaponKind` (`Melee`, `Bow`, `Staff`) and `EquippedWeapon` component configure whether a player's primary attack performs a melee strike or spawns an aimed ranged projectile.
- [ ] Firing a `Bow` or `Staff` spawns a projectile traveling in the player's aimed direction (`target_pos` direction or movement/facing vector) rather than auto-hitting the nearest mob.
- [ ] A bow shot fired directly toward a mob travels along the aim vector, collides with the mob, and deals damage.
- [ ] A bow shot fired 45 degrees away from a mob travels in the aimed direction and misses the mob (`Health` remains full).
