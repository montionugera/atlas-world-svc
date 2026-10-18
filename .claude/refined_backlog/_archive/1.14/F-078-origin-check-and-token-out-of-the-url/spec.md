---
id: F-078
title: "Origin check and token out of the URL"
status: refined
created: 2026-10-16
epic: E-006
from_idea: I-168
---

# Origin check and token out of the URL — an Origin allowlist on the socket upgrade, and the client sends its token by the existing Sec-WebSocket-Protocol path instead of the query string; TLS termination documented

## Problem
1. Currently `server-rs/src/net/ws.rs` does not validate the `Origin` header on WebSocket upgrade requests, allowing any cross-origin webpage to open a WebSocket connection if it has a token or dev token.
2. When a browser sends `Sec-WebSocket-Protocol: atlas-v1, token.<jwt>`, RFC 6455 requires the server handshake response to echo the selected subprotocol (`Sec-WebSocket-Protocol: atlas-v1`), and `client/react-client/src/hooks/useServerRsClient.ts` still puts `?token=${token}` in the WebSocket URL query string where proxies and access logs can record it.
3. TLS (`wss://`) termination at the edge/Ingress before reaching `server-rs` is not documented in `k8s/local/server-rs.yaml`.

## Solution
1. **WebSocket Upgrade `Origin` Allowlist in `server-rs/src/net/ws.rs`**:
   - Add `ws_origin_allowed(origin: Option<&str>, allowed_origins: &[String]) -> bool`:
     - Non-browser clients that omit `Origin` (`None`) are permitted (headless bots, load runners, native clients).
     - When `Origin` is present, allow local origins (`http://localhost[:port]`, `http://127.0.0.1[:port]`, `https://localhost[:port]`, `https://127.0.0.1[:port]`) plus any origin configured in `ATLAS_ALLOWED_ORIGINS` (comma-separated env var or `WsServer::with_allowed_origins`).
     - Reject disallowed `Origin` headers during the WebSocket handshake with `403 Forbidden`.
2. **Subprotocol Token Handshake & Client URL Cleanup**:
   - In `server-rs/src/net/ws.rs`, when the client request includes `Sec-WebSocket-Protocol` containing `atlas-v1` (or `token.<jwt>`), echo `Sec-WebSocket-Protocol: atlas-v1` (or the first non-token subprotocol, falling back to the `token.*` entry if it was the only subprotocol) on the `101 Switching Protocols` response so browsers complete the RFC 6455 subprotocol handshake cleanly.
   - In `client/react-client/src/hooks/useServerRsClient.ts`, remove `token=${token}` from the WebSocket URL (`${protocol}://${config.serverHost}:${config.serverPort}?map=${activeMap}&proto=${PROTOCOL_VERSION}`) and pass the token via subprotocols: `new WebSocket(url, ["atlas-v1", `token.${token}`])`.
3. **TLS Termination Documentation**:
   - Document edge TLS (`wss://`) termination and `ATLAS_ALLOWED_ORIGINS` in `k8s/local/server-rs.yaml`.

## Acceptance Criteria
- [ ] WebSocket upgrade requests with an untrusted `Origin` header (e.g. `https://evil.example`) are rejected with `403 Forbidden`, while local origins and configured `ATLAS_ALLOWED_ORIGINS` are accepted.
- [ ] `useServerRsClient.ts` no longer places `token=` in the WebSocket URL query string and instead authenticates via `Sec-WebSocket-Protocol: atlas-v1, token.<token>`.
- [ ] `server-rs` echoes `Sec-WebSocket-Protocol: atlas-v1` when offered by the client.
- [ ] TLS termination and `ATLAS_ALLOWED_ORIGINS` are documented in `k8s/local/server-rs.yaml`.
