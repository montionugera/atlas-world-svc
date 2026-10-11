---
title: "Combat depth"
id: E-007
---

# How we will know E-007 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. A mob attack shows a tell and can be avoided by moving out before it lands.
2. A bow shot aimed away from a mob misses it.
3. Standing in a Blizzard field takes damage more than once.
4. A player can recover health during a fight without dying.
5. The boss has measurably more health and damage than a route mob of the same type.
