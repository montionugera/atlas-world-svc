---
title: "Persistent accounts and characters"
id: E-003
---

# How we will know E-003 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. A returning account spawns with its saved level and equipment, not defaults.
2. Kills made in a session are present in Nakama after leaving.
3. A connection using `dev-token` is refused when an auth secret is set.
4. After leaving and rejoining, the character is at its saved position and health.
5. After a dropped socket, the same account reattaches to the same avatar within the grace period, and the client reconnects without a reload.
