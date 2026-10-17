---
title: "Client signs in with Nakama"
id: I-138
status: idea
---

# Client signs in with Nakama

Part of E-003 (Persistent accounts and characters), slice 3 of 8.

## Problem

1. `useServerRsClient.ts` (`client/react-client/src/hooks/useServerRsClient.ts:310`) falls back to `const token = config.token || "dev-token"` and `App.tsx` (`client/react-client/src/App.tsx:44`) constructs `token: playerParam ? \`dev-token:${playerParam}\` : undefined`, so the React client never authenticates with Nakama and always sends a `dev-token`.
2. When `token` is a real Nakama JWT (`header.payload.signature`), `useServerRsClient.ts:311-316` hashes the entire raw JWT string with `fnv1a32(token)` instead of extracting the `uid`/`sub` claim from the JWT payload, which does not match `server-rs`'s `fnv1a_32(&session_id)` (`server-rs/src/simulation.rs:422`).

## Design

1. **Nakama Device Authentication (`client/react-client/src/hooks/useServerRsClient.ts`)**:
   - Add `getOrCreateNakamaDeviceId(playerSeed?: string | null): string` to read/persist a 10–128 byte device identifier in `localStorage` (`atlas-world-device-id` or `atlas-world-device-id:<playerSeed>`).
   - Add `extractTokenUserId(token: string): string` to decode JWT payloads (`uid` or `sub`) as well as `dev-token` strings so `fnv1a32(extractTokenUserId(token))` matches the server's `fnv1a_32(&claims.sub)`.
   - Add `authenticateNakamaDevice({ nakamaUrl, serverKey, deviceId, playerSeed })` calling `POST ${nakamaUrl}/v2/account/authenticate/device?create=true` with Basic auth (`defaultkey:`) and returning `{ token, userId }`.
   - Extend `ServerRsClientConfig` with optional `nakamaUrl`, `nakamaServerKey`, and `deviceId`. When `nakamaUrl` is configured and `config.token` is not set, `connect()` authenticates with Nakama before opening the WebSocket and sends the Nakama session JWT as `?token=<jwt>`.
2. **Client Wiring (`client/react-client/src/App.tsx`)**:
   - Configure `nakamaUrl` on `clientConfig` (defaulting to `process.env.REACT_APP_NAKAMA_URL` or `http://<serverHost>:7350`) and pass `deviceId: getOrCreateNakamaDeviceId(playerParam)` instead of `dev-token:<playerParam>`.

## Acceptance criteria

- [ ] `authenticateNakamaDevice` posts `{ id: <deviceId> }` to `${nakamaUrl}/v2/account/authenticate/device?create=true` with Basic auth (`defaultkey:`) and returns the minted Nakama JWT token and decoded `uid`.
- [ ] `extractTokenUserId` extracts `uid` (or `sub`) from a Nakama JWT payload so `useServerRsClient` computes `playerId = String(fnv1a32(uid))`, matching `server-rs` `fnv1a_32(&claims.sub)`.
- [ ] When `nakamaUrl` is provided on `ServerRsClientConfig` (as `App.tsx` now configures by default), `useServerRsClient.connect()` authenticates against Nakama and opens the WebSocket with `?token=<nakama_jwt>` instead of `dev-token`.
- [ ] Reloading or reconnecting from the same browser profile reuses the persisted device ID from `localStorage` so Nakama returns the same account `uid`.
