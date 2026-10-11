---
title: "Persistent accounts and characters"
id: E-003
---

# How we will know E-003 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. One command starts game server, Nakama and its database, and the server initializes its Nakama client with environment-provided URL and key.
2. With no auth secret set in a non-debug build, a forged token is refused, and only valid tokens signed by Nakama are accepted.
3. A second connection for the same account replaces the active connection or is refused, and a token for account A cannot drive account B's avatar.
4. A returning account spawns with its saved level and equipment fetched from Nakama instead of defaults.
5. Kill and match events recorded during a session are present in Nakama storage after leaving.
6. After leaving and rejoining, or safely across a server crash, the character is restored at its saved position and health.
7. After a dropped socket, the same account reattaches to the same avatar within the grace period, and the client reconnects without a reload.
