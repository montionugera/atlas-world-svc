---
title: "Protocol version"
id: I-164
status: idea
---

# Protocol version

## Problem

Slice 2 of epic E-006 ("Safe to open to outside players"); later wire-format slices depend on it.
A client built for an older wire format (the bytes the two sides exchange) connects and misreads data.

- The FlatBuffers schema (the binary message layout) has no version field and no `file_identifier`:
  `schemas/game_protocol.fbs:1` is the namespace and `:69` the `root_type`, with nothing between.
- The server's socket upgrade reads only the token (`server-rs/src/net/ws.rs:291-325`) and the map
  (`ws.rs:327-338`); the handshake callback (`ws.rs:355-391`) refuses only a bad or missing token.
- The client's address is only `?token=…&map=…` (`client/react-client/src/hooks/useServerRsClient.ts:318`).
- On failure the player sees a guess: "Connection failed (Server might be offline or schema mismatch)" (`client/react-client/src/App.tsx:119-121`).
- A decode failure is only logged to the console (`useServerRsClient.ts:664-667`).

## Goal

Client and server each state one integer protocol version when connecting. If they differ, the
server refuses with a specific close code and the player reads a sentence telling them what to do.

## Design

### Why the version travels in the handshake, not in the schema

The generated FlatBuffers code was hand-edited, because the installed `flatc` compiler (25.12)
differs from the runtime library (24.3, `server-rs/Cargo.toml:14`). A version field or
`file_identifier` in the schema would force a regeneration and repeat that hand-editing. A
handshake value needs none, and it refuses the client before any game bytes are sent.

### The handshake (language-neutral rule)

1. The client adds the query parameter `proto=<integer>`: `ws://host:2567/?token=…&map=…&proto=1`.
2. The server always completes the WebSocket upgrade for a valid token, then compares.
3. If `proto` equals the server's number: continue as today.
4. If `proto` is present and different (or not an integer): the close reason must never echo raw
   client input. Echo the client value only when it parses as an integer; otherwise write `client=invalid`.
   The server sends one Close frame with code **4001** and reason
   `protocol version mismatch: server=<S> client=<C>` (or `protocol version mismatch: server=<S> client=invalid`),
   then drops the socket. This version check runs before the `get_loadout` fetch (`ws.rs:401`) or registering
   the connection (`ws.rs:426`).
5. If `proto` is absent: the server admits the client and logs a warning (the rollout allowance).

Any client (React today, Godot in `game-client/` later) needs one query parameter and one
close-code check; nothing here is TypeScript-specific.

Why not the alternatives:
- **Refusing during the HTTP upgrade** (as the token check does, status 401): a browser hides the
  status and body from scripts and reports only close code 1006, so no readable message is possible.
- **A subprotocol name** (`Sec-WebSocket-Protocol: atlas.v1`): browsers fail the connection unless
  the server echoes one, which it does not today, and slice 6 reserves that header for the token.
- **A custom header**: a browser WebSocket cannot set one.

### What the player sees

After close code 4001 the client shows the out-of-date message (in the log panel and as a
`connectionError` value returned by `useServerRsClient`), and `App.tsx` does not call `joinRoom`
or log "joined":

- client older than server: "This game client is out of date (client protocol 1, server protocol 2). Reload the page to update."
- client newer than server: "The server is older than this client (client protocol 2, server protocol 1). Try again in a minute."
- The numbers are parsed from the close reason; if unparseable, show the first sentence without them.

### Where the number lives

- **Server:** `pub const PROTOCOL_VERSION: u32 = 1;` in `server-rs/src/protocol/mod.rs`.
- **React client:** one TypeScript constant in `client/react-client/src/protocol/protocolVersion.ts`.
- **Single source of truth:** one Jest test reads the Rust source file (`server-rs/src/protocol/mod.rs`) from disk and checks that the two numbers are equal. No JSON file and no Docker path coupling.

### When the number must be bumped

Bump `PROTOCOL_VERSION` by one whenever a client built before the change would misread or be misread:
removing, reordering or retyping a schema field; changing the meaning of an existing field or
flag (for example `STATE_FLAG_*` in `server-rs/src/protocol/mod.rs:8-10`), an enum value, the
delta-encoding rules, or the entity-id hash.

### Rollout order (the owner plays on a live local server)

1. **Client first**: send `proto`, handle close code 4001. The current server ignores unknown
   query keys (`ws.rs:294-301`, `:328-336` match only `token` and `map`), so nothing changes.
2. **Server second**: add the comparison. The already-updated client matches; a tab still running
   the old client sends no `proto` and is admitted with a warning.
3. Later bumps change the Rust constant and TypeScript constant in one commit; a stale open tab
   then gets the "out of date" message, which is the feature working.

## Acceptance criteria

- [ ] A Rust test connects with `proto=<server version + 1>` and a valid token, and receives a Close frame with code 4001 whose reason contains both version numbers; the server's connection count stays 0.
- [ ] A Rust test connects with a 200-character non-numeric `proto` and receives a Close frame with code 4001 whose reason is at most 123 bytes and contains `client=invalid`; the server's connection count stays 0.
- [ ] A Rust test connects with the matching `proto` and receives a broadcast snapshot; a second connects with no `proto` and is also admitted (rollout allowance).
- [ ] A Jest test shows the client's socket address contains `proto=` followed by the client's version number.
- [ ] A Jest test closes the mock socket with code 4001 and reason `protocol version mismatch: server=2 client=1`; the client shows the out-of-date message in `connectionError`, and `App.tsx` does not call `joinRoom` or log "joined".
- [ ] A Jest test reads `server-rs/src/protocol/mod.rs` and asserts the client's TypeScript constant equals `PROTOCOL_VERSION`.

## Out of scope

- Locking the schema file to the version (follow-up idea).
- Refusing a client that sends no `proto`; slice 6 (origin check, token out of the address) already tightens the handshake and should make it mandatory.
- Any change to `schemas/game_protocol.fbs` or regeneration of FlatBuffers code.
- Supporting several versions at once, or negotiating down to an older one.
- The Godot client's implementation (it opens no socket yet); only the rule is fixed here.

## Risks

- **The close frame arrives after the socket has opened**, so the client's `connect()` promise has
  already resolved (`useServerRsClient.ts:334-345`). The mismatch must be handled in `onclose`
  (`:679`), which today receives no event argument, and `App.tsx` must not call `joinRoom` or log "joined".
- **A close reason is limited to 123 bytes.** Formatting non-integer client inputs as `client=invalid` keeps the reason well under the 123-byte limit.
- **Behaviour in code** (delta rules, flags) relies on the prose bump rule and on review.

## How to verify

```bash
cd server-rs && cargo test
cd client/react-client && CI=true npx react-scripts test --watchAll=false
cd client/react-client && npx tsc --noEmit -p .
```

Manual, on the live local server: change the client constant's number, reload, and confirm the
"out of date" sentence shows and no avatar spawns; then revert.
