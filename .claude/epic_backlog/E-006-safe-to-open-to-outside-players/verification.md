---
title: "Safe to open to outside players"
id: E-006
---

# How we will know E-006 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. A pull request that breaks a `server-rs` test fails CI.
2. A client that floods inputs or sends an oversized frame is throttled or dropped and the tick time of others is unaffected.
3. A client that sends an attack while on cooldown or out of range has no effect.
4. An old client is refused with a version message instead of misreading data.
5. One documented command brings up game server and Nakama together, and a join reads from Nakama.
