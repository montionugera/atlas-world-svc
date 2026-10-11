---
title: "Combat depth"
id: E-007
---

# How we will know E-007 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. A mob attack shows a tell for 800 ms and can be avoided by moving out of its facing cone before it lands.
2. Parrying an incoming projectile consumes stamina, preventing consecutive parries once stamina drops to zero.
3. A bow shot fired 45 degrees away from a mob travels in the aimed direction and misses.
4. Standing in a Blizzard or Meteor field takes damage across 3 distinct intervals during its lifetime.
5. Afflicting a target with burn or poison deals damage over time for 5 seconds without reapplying the initial attack.
6. Activating a heal source or regeneration increases current health during a fight without dying.
7. A spawned boss mob has at least 3x the max health and higher damage output than a route mob of the same type.
8. A mob selects between at least 2 distinct attacks depending on its distance to the player target.
9. An allied companion entity spawns alongside the player and follows within 5 units as the player moves.
10. A companion attacks hostile targets in combat, and respawns after a 10-second timer when defeated.
