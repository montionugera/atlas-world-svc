---
title: "Rust game server migration - high-density ECS and Rapier physics core"
id: E-001
---

# How we will know E-001 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the toolkit never parses this file.

## Assertions

1. **Deterministic Parity Assertion:** The headless Rust simulation core produces behavioral parity (mob positions, target selections, separation vectors, and damage calculations) matching the TypeScript golden trace across a 1,000-tick test scenario.
2. **High-Density Performance Assertion:** The Rust simulation benchmark demonstrates $\ge 10,000$ active entities running with p95 tick time $\le 2.0\text{ ms}$ (at 20 Hz, budget 50 ms) and exactly 0.0 ms garbage collection pauses under continuous load.
3. **Zero-Copy Protocol Assertion:** FlatBuffers binary delta streams correctly decode inside the Web client (`game-client`) with zero frame drops and $\ge 50\%$ smaller wire payload compared to Colyseus schema joins.
4. **Agones & Nakama Infrastructure Assertion:** The server binary registers with the local Agones sidecar via gRPC (`Ready`, `Health`, graceful `Shutdown`) and enforces Nakama S2S session token validation during client connection handshakes.
5. **Platform Ecosystem Assertion:** Required platform utilities and decorators from `node-server-decorator` are validated or integrated upstream.
