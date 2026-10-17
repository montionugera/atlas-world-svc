---
title: "Safe to open to outside players"
id: E-006
---

# How we will know E-006 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. A pull request that breaks a server-rs test fails the GitHub Actions cargo CI job.
2. Connecting with an incompatible protocol version is rejected with a descriptive version mismatch error.
3. A frame above the size cap set in this slice is dropped, inputs above the per-second cap set in this slice are throttled, and other players' tick time stays within the bound set in this slice while one client floods.
4. The Kubernetes readiness probe answers HTTP 200, and server SIGTERM emits a clean WebSocket close frame before shutdown.
5. The metrics endpoint returns current tick time, connected players, entity count, and total bytes sent to an external load runner.
6. A foreign Origin is refused, the client's connection URL carries no token, AND the server refuses a `?token=` query in a release build.
7. A target_id or target position the player cannot legitimately use is rejected, each with a test that fails today.
8. Connecting to a region that has reached its configured player limit receives a region full refusal message.
