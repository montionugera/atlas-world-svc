---
id: I-166
title: "Health, readiness and clean shutdown — health and readiness endpoints, probes in the manifest, and close frames plus a state flush on shutdown"
status: idea
created: 2026-10-16
epic: E-006
---

# Health, readiness and clean shutdown — health and readiness endpoints, probes in the manifest, and close frames plus a state flush on shutdown

## Problem
Currently `server-rs` has no `/healthz` or `/readyz` HTTP endpoints for Kubernetes liveness and readiness probes, `k8s/local/server-rs.yaml` defines no `livenessProbe` or `readinessProbe`, and on shutdown `server-rs/src/main.rs` flushes character state and match events to Nakama without marking the server not-ready or sending WebSocket `CloseFrame`s (`1001 Going Away`) to active client connections.

## Solution
1. **`/healthz` and `/readyz` HTTP Endpoints on `WsServer`**:
   - Track an `Arc<AtomicBool>` readiness flag (`ready`, defaulting to `true` once `WsServer::bind` succeeds, controllable via `ws_server.set_ready(bool)` and readable via `ws_server.is_ready()`).
   - Intercept `GET /healthz` and `GET /readyz` in `accept_loop` (without requiring the `/debug/*` loopback gate so Kubernetes kubelet probes from the node IP succeed):
     - `GET /healthz` returns `200 OK` with `{"ok":true,"status":"healthy"}`.
     - `GET /readyz` returns `200 OK` with `{"ok":true,"ready":true}` when `ready == true`, or `503 Service Unavailable` with `{"ok":false,"ready":false}` when `ready == false` (such as during shutdown drain).
2. **Kubernetes Liveness & Readiness Probes in `k8s/local/server-rs.yaml`**:
   - Add `livenessProbe` (`httpGet: { path: /healthz, port: 2567 }`) and `readinessProbe` (`httpGet: { path: /readyz, port: 2567 }`) to the `server-rs` Deployment container spec in `k8s/local/server-rs.yaml`.
3. **Graceful WebSocket Shutdown (`WsServer::shutdown`) + State Flush**:
   - Add `pub async fn shutdown(&self)` on `WsServer` that marks `ready = false`, drains all active connections, and sends `Message::Close(Some(CloseFrame { code: CloseCode::Away, reason: "server shutting down".into() }))` (`1001 Going Away`) to every connected client.
   - Call `ws_server.shutdown().await` in `server-rs/src/main.rs` immediately when the shutdown signal fires, alongside the final `CharacterStateBuffer` and `MatchEventBuffer` flushes to Nakama.

## Acceptance Criteria
- [ ] `GET /healthz` returns HTTP 200 and `GET /readyz` returns HTTP 200 when ready and HTTP 503 after `set_ready(false)` or `shutdown()`.
- [ ] `k8s/local/server-rs.yaml` configures `livenessProbe` on `/healthz` and `readinessProbe` on `/readyz`.
- [ ] Calling `ws_server.shutdown().await` sends WebSocket `CloseCode::Away` (`1001`) frames to all connected clients and marks `/readyz` as `503`.
