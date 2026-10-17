---
id: I-165
title: "Input limits — cap message size, rate-limit inputs per connection, bound the queues, and drop idle or stalled connections"
status: idea
created: 2026-10-16
epic: E-006
---

# Input limits — cap message size, rate-limit inputs per connection, bound the queues, and drop idle or stalled connections

## Problem
Currently `server-rs/src/net/ws.rs` accepts WebSocket frames without an explicit `WebSocketConfig` size cap, uses unbounded `mpsc::unbounded_channel()` queues for both inbound packets and per-client outbound snapshots, applies no per-connection input rate limit, and keeps silent/idle connections open indefinitely. An outside client can send oversized frames, flood the server with thousands of inputs per second, stall reading its socket to grow server memory without bound, or hold idle connections open forever.

## Solution
1. **Message & Packet Size Cap**:
   - Configure `tokio_tungstenite::tungstenite::protocol::WebSocketConfig` with `max_message_size = Some(4096)` and `max_frame_size = Some(4096)` on `accept_hdr_async_with_config`.
   - Enforce `MAX_INPUT_PACKET_BYTES = 512` on binary frames in the per-connection reader loop; if a binary frame exceeds `MAX_INPUT_PACKET_BYTES`, close the connection with WebSocket `CloseCode::Size` (`1009`) and disconnect the client.
2. **Per-Connection Input Rate Limiting**:
   - Track a per-connection sliding-window / token-bucket rate limiter (`InputRateLimiter`, default `max_inputs_per_sec = 60`, burst capacity `30`) in the connection reader task.
   - Excess packets beyond the rate budget are dropped (and counted) without forwarding to the simulation tick loop.
3. **Bounded Inbound & Outbound Queues + Stalled Connection Eviction**:
   - Replace `mpsc::unbounded_channel` with bounded `mpsc::channel` (`MAX_OUTBOUND_QUEUE_DEPTH = 64` per connection, `MAX_INBOUND_QUEUE_DEPTH = 4096` across the server).
   - In `WsServer::send_to` / `broadcast`, use `try_send`. If a client's outbound queue is `Full`, evict/disconnect that stalled client (`clients.remove`) so a slow or paused reader cannot stall the tick loop or leak memory.
4. **Idle Connection Timeout**:
   - Configure an idle timeout on `WsServer` (`idle_timeout: Duration`, default `60s`, configurable via `with_idle_timeout` for fast deterministic tests).
   - Wrap `ws_receiver.next()` in `tokio::time::timeout(idle_timeout, ...)`; if no frame arrives before the timeout expires, send a close frame (`1008 Policy Violation` / idle timeout) and drop the connection.

## Acceptance Criteria
- [ ] Oversized binary frames (`> 512` bytes or `> 4096` frame size) are rejected and close the offending connection without affecting other players.
- [ ] A connection flooding more than the allowed rate budget has excess packets dropped while legitimate inputs up to the cap still arrive.
- [ ] Outbound per-connection queues are bounded (`64` messages) and stalled connections whose outbound buffer fills up are evicted cleanly.
- [ ] Connections that send no frames within `idle_timeout` are automatically closed and emit a `ClientEvent::Disconnected`.
