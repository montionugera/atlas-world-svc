---
title: "Safe to open to outside players"
id: E-006
status: epic
---

# Safe to open to outside players

Part of the open-world MMORPG direction (owner, 2026-10-11). Source: the
must-have scan of `server-rs`, `client/react-client` and `nakama` on
`feature/gameplay-combat-parity` at `bf25f809`.

## Outcome

People outside this machine can connect without being able to break the server
or each other's play, and a regression in the Rust server is caught before it
merges.

## Evidence of the gap

- Default WebSocket config, every binary frame forwarded, unbounded queues (`server-rs/src/net/ws.rs:392`, `:456`, `:423`).
- No player cap on a room (`ws.rs:428`, `server-rs/src/simulation.rs:864`).
- The token travels in the `?token=` query in clear text; no Origin check on upgrade (`ws.rs:310`, `:360-390`).
- The only CI job targets the deleted `colyseus-server` (`.github/workflows/ci.yml:14`); no workflow runs `cargo`.
- Only `/debug/*` is served over HTTP; the k8s manifest has no probes (`k8s/local/server-rs.yaml:19-40`). Shutdown sends no close frames (`server-rs/src/main.rs:288-301`).
- The protocol has no version field (`schemas/game_protocol.fbs:57-69`).
- `docker-compose.yml` still builds the deleted server; `server-rs` reads no `NAKAMA_*` variable; the manifest sets `BIND_ADDR` while `main.rs:79` reads `HOST`/`PORT`.

## Slices

Order matters: earlier slices unblock later ones.

1. CI for the Rust server — a workflow that runs `cargo fmt --check`, clippy and `cargo test` on every pull request, and removes the job for the deleted server.
2. Input limits — cap message size, rate-limit inputs per connection, bound the queues, and drop idle or stalled connections.
3. Player caps — a per-region player limit with a clear refusal message.
4. Server-side checks on intents — enforce cooldowns, attack range and movement speed on the server so a modified client gains nothing.
5. Health, readiness and clean shutdown — health and readiness endpoints, probes in the manifest, and close frames plus a state flush on shutdown.
6. Protocol version — client and server exchange a version on connect and refuse a mismatch with a readable message.
7. Encrypted connections and origin checks — token out of the URL, an Origin allowlist, and TLS termination documented for non-local use.
8. One command for the full local stack — game server, Nakama and its database start together and are wired to each other.

## Out of scope

- Real sign-in itself (E-003).
- Metrics dashboards and autoscaling.

## Open questions

- Whether TLS terminates at the ingress or in `server-rs`.
