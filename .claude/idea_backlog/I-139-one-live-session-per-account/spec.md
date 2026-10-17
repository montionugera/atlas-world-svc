---
title: "One live session per account"
id: I-139
status: idea
---

# One live session per account

Part of E-003 (Persistent accounts and characters), slice 4 of 8.

## Problem

`server-rs/src/net/ws.rs` (`ws.rs:526-537`) currently registers every connection under `session_id#seq` without evicting older connections for the same `session_id`, allowing multiple simultaneous live WebSocket sessions to control and receive snapshots for the same account at the same time. The comment at `ws.rs:526-529` notes that a naive session-keyed map broke React StrictMode double-mounts when two sockets finished their handshakes out of order.

## Design

1. **Named Close Code (`DUPLICATE_SESSION_CLOSE_CODE = 4002`)**:
   - Define `pub const DUPLICATE_SESSION_CLOSE_CODE: u16 = 4002` in `server-rs/src/protocol/mod.rs` and `export const DUPLICATE_SESSION_CLOSE_CODE = 4002` in `client/react-client/src/protocol/protocolVersion.ts`.
2. **Accept-Ordered Single-Session Registry (`server-rs/src/net/ws.rs`)**:
   - Assign a monotonically increasing `conn_seq: u64` in `accept_loop` at `listener.accept().await` time (before spawning `handle_connection`, `accept_hdr_async`, or `get_loadout`).
   - When `handle_connection` registers `(session_id, conn_seq)`:
     - If an existing connection for `session_id` has a smaller `conn_seq < new_seq` (the normal second-tab / reconnect / StrictMode mount-2 case), remove the older connection from `connections` and `session_rooms` and send it `Message::Close(Some(CloseFrame { code: CloseCode::Library(DUPLICATE_SESSION_CLOSE_CODE), reason: "session replaced by newer connection".into() }))`.
     - If an existing connection for `session_id` already has a larger `conn_seq > new_seq` (the out-of-order StrictMode handshake race where mount-1's discarded socket finished `accept_hdr_async` / `get_loadout` after mount-2's live socket already registered), keep the newer (`conn_seq > new_seq`) connection in `connections` and immediately close the stale (`new_seq`) socket with `DUPLICATE_SESSION_CLOSE_CODE` (`4002`).
   - Ensure `write_task` flushes `Message::Close` before terminating instead of being immediately aborted on eviction.
   - When an evicted or closed socket cleans up, only queue a room disconnect if `session_id` has no live connection in that room.
3. **Client Handling (`client/react-client/src/hooks/useServerRsClient.ts`)**:
   - Handle close code `DUPLICATE_SESSION_CLOSE_CODE` (`4002`) on the active socket by setting `connectionError` to a clear message without clobbering a newer socket in StrictMode.

## Acceptance criteria

- [ ] Connecting a second WebSocket for the same account (`session_id`) keeps the newest connection live (`active_connections_count() == 1`) and closes the older connection with named close code `DUPLICATE_SESSION_CLOSE_CODE` (`4002`).
- [ ] Closing or evicting the older connection does not despawn the account's avatar in the same room or interrupt snapshot delivery to the newer connection.
- [ ] A regression test simulates the React StrictMode double-mount (including out-of-order handshake completion where the first-accepted socket finishes after the second-accepted socket) and verifies that the second (newer) socket always wins and stays connected while the first (older) socket closes with `4002`.
