---
title: "Reward and progression loop"
id: E-005
---

# How we will know E-005 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. Killing a mob raises the player's experience, and enough kills raise the level shown in the client.
2. A dropped item can be picked up and appears in the inventory after a fresh sign-in.
3. Equipping a different weapon changes the damage the server deals.
4. A quest from the authored story set can be accepted, completed by play, and claimed.
