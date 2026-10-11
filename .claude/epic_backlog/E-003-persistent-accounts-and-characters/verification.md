---
title: "Persistent accounts and characters"
id: E-003
---

# How we will know E-003 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. A real `get_loadout` round trip succeeds on join in the local stack, and a wrong http key makes the server report not ready.
2. A real Nakama token is accepted, a forged token is refused in a release build with no auth secret set, and a token for account A cannot drive account B's avatar.
3. The client URL and handshake carry a Nakama session token and no `dev-token`.
4. A second connection for the same account closes the first with the named code, and a StrictMode double-mount still ends with one working connection.
5. A returning account spawns with its saved weapon and stats, not defaults (level is asserted in E-005).
6. Kills made in a session are present in Nakama after leaving.
7. After a normal leave and rejoin the character is at its saved position and health, AND after the server is killed with `kill -9` and restarted the character is restored to a state no older than the save interval set in this slice.
8. After a dropped socket the same account reattaches to the same avatar within the grace period and the client reconnects without a reload.
