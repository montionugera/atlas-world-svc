---
title: "Server accepts a real Nakama token"
id: I-137
status: idea
---

# Server accepts a real Nakama token

Part of E-003 (Persistent accounts and characters), slice 2 of 8.

## Problem

1. A real Nakama session token minted via `POST /v2/account/authenticate/device` (`nakama/local.yml`) is an HS256 JWT whose payload carries `uid` (UUID user ID), `usn` (username), `tid` (token ID), and `exp` (expiry UNIX timestamp) — not `sub` or `username`. Currently `Claims` (`server-rs/src/auth/jwt.rs:8`) requires `sub: String`, causing `AuthGuard::validate_token` to reject every real Nakama session JWT with `InvalidToken("missing field `sub`")`.
2. `k8s/local/server-rs.yaml` sets `NAKAMA_SERVER_KEY: "defaultkey"` (Nakama's HTTP Basic device-auth key) instead of `session.encryption_key` (`"atlas_dev_session_key_change_me_please_32"` in `nakama/local.yml:8`), so even with claim mapping, `server-rs` in local Kubernetes would reject real Nakama tokens with `InvalidSignature`.
3. `dev-token` bypass (`server-rs/src/auth/jwt.rs:60`) and the hard-coded fallback secret (`server-rs/src/auth/jwt.rs:49`) are unconditionally compiled into release builds, allowing anyone to forge any `sub` in production via `dev-token:<user_id>`.

## Design

1. **Nakama JWT Claim Mapping (`server-rs/src/auth/jwt.rs`)**:
   - Update `Claims` to accept both Nakama session JWT claims (`uid` -> `sub`, `usn` -> `username`, ignoring extra fields like `tid`) and internal test claims (`sub`, `username`) via `#[serde(alias = "uid")]` on `sub` and `#[serde(alias = "usn")]` on `username`.
   - Reject tokens whose `sub`/`uid` claim is empty or whitespace-only with `AuthError::InvalidToken`.
2. **Debug-Only `dev-token` and Fallback Secret (`cfg(debug_assertions)`)**:
   - Compile the `dev-token` / `dev-token:<id>` bypass in `AuthGuard::validate_token` and the hard-coded fallback secret in `AuthGuard::from_env` (`"atlas_dev_session_key_change_me_please_32"`, matching `nakama/local.yml`) only under `#[cfg(debug_assertions)]`.
   - Provide `AuthGuard::from_vars(session_key, server_key, jwt_secret)` reading `NAKAMA_SESSION_KEY`, `NAKAMA_SERVER_KEY`, or `JWT_SECRET` (ignoring empty/whitespace values), plus `AuthGuard::new_strict(secret)` so release-mode rejection of `dev-token` and missing-secret startup failure are unit-testable in both debug and release test runs.
3. **Kubernetes Manifest Key Alignment (`k8s/local/server-rs.yaml`)**:
   - Update `NAKAMA_SERVER_KEY` in `k8s/local/server-rs.yaml` (both `Deployment` and `GameServer` specs) from `"defaultkey"` to `"atlas_dev_session_key_change_me_please_32"` so `server-rs` verifies tokens signed by `nakama/local.yml` (`session.encryption_key`).

## Acceptance criteria

- [ ] A real Nakama session JWT (containing `tid`, `uid`, `usn`, `exp` and signed with `session.encryption_key` from `nakama/local.yml`) is accepted by `AuthGuard::validate_token` and maps `uid` to `Claims.sub` and `usn` to `Claims.username`.
- [ ] On WebSocket connect with a valid Nakama session JWT whose `uid` is a UUID, `WsServer` authenticates the handshake as `session_id = uid` and invokes `NakamaClient::get_loadout(&uid)`.
- [ ] `dev-token` / `dev-token:<id>` and the hard-coded fallback secret in `server-rs/src/auth/jwt.rs` are compiled in only under `cfg(debug_assertions)`; in strict/release mode, `dev-token` is rejected as an invalid JWT and missing secret configuration is an error.
- [ ] `k8s/local/server-rs.yaml` sets `NAKAMA_SERVER_KEY` to `"atlas_dev_session_key_change_me_please_32"` (matching `nakama/local.yml` `session.encryption_key`) on both the `Deployment` and `GameServer` specs.
