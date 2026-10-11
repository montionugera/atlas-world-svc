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
3. A client that floods inputs or sends an oversized frame is throttled or dropped without degrading server tick rate.
4. The Kubernetes readiness probe answers HTTP 200, and server SIGTERM emits a clean WebSocket close frame before shutdown.
5. The metrics endpoint returns current tick time, connected players, entity count, and total bytes sent to an external load runner.
6. A WebSocket upgrade request from a foreign Origin not in the allowlist is refused with HTTP 403.
7. Submitting an intent with an illegitimate target_id, unreachable target position, or premature respawn request fails server validation with a test that fails today.
8. Connecting to a region that has reached its configured player limit receives a region full refusal message.
