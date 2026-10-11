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
- The token query path is `ws.rs:291`; `ws.rs:310` is the `Sec-WebSocket-Protocol` path, so the server already accepts a token outside the URL. `local_origin` (`ws.rs:534`) exists but only guards `/debug`.
- The only CI job targets the deleted `colyseus-server` (`.github/workflows/ci.yml:14`); no workflow runs `cargo`.
- Only `/debug/*` is served over HTTP; the k8s manifest has no probes (`k8s/local/server-rs.yaml:19-40`). Shutdown sends no close frames (`server-rs/src/main.rs:288-301`).
- The protocol has no version field (`schemas/game_protocol.fbs:57-69`).
- `docker-compose.yml` still builds the deleted server; `server-rs` reads `NAKAMA_SERVER_KEY` (`auth/jwt.rs:47`, `debug.rs:39`) but reads no Nakama URL or http key, and `NakamaClient::new` is only called in tests; the manifest sets `BIND_ADDR` while `main.rs:79` reads `HOST`/`PORT`.

## Slices

Order matters: earlier slices unblock later ones. Slices 6 and 7 overlap idea I-002 (security hardening).

1. CI for the Rust server — a workflow that runs cargo fmt --check, clippy and cargo test on every pull request, and removes the job for the deleted server.
2. Protocol version — client and server exchange a version on connect and refuse a mismatch with a readable message.
3. Input limits — cap message size, rate-limit inputs per connection, bound the queues, and drop idle or stalled connections.
4. Health, readiness and clean shutdown — health and readiness endpoints, probes in the manifest, and close frames plus a state flush on shutdown.
5. Metrics endpoint — tick time, players, entities and bytes sent, readable by a load run.
6. Origin check and token out of the URL — an Origin allowlist on the socket upgrade, and the client sends its token by the existing Sec-WebSocket-Protocol path instead of the query string; TLS termination documented.
7. Validate target intents — reject a `target_id` or target position the player cannot legitimately use, each with a test that fails today. (Already enforced server-side, so not in scope: movement normalisation, attack cooldown and range, cast range, and respawn, which is timer-driven with the wire flag honoured only in debug.)
8. Player caps per region — a per-region player limit with a clear refusal message.

## Depends on

Slice 8 needs E-004 slice 2; slices 1 and 2 have no dependency and go first of everything.

Build order across epics: E-006 slices 1 and 2; then E-003; then E-006 slices 3 to 7; then E-004 slices 1 to 3; then E-005 slices 1 to 6; then E-004 slices 4 to 10 and E-006 slice 8; then E-005 slices 7 to 9; E-007 alongside; then E-008; then E-009.

## Out of scope

- Real sign-in itself (E-003).
- Dashboards and autoscaling.

## Open questions

- Whether TLS terminates at the ingress or in `server-rs`.
