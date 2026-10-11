---
title: "Social play"
id: E-008
status: epic
---

# Social play

Part of the open-world MMORPG direction (owner, 2026-10-11). Source: the
must-have scan of `server-rs`, `client/react-client` and `nakama` on
`feature/gameplay-combat-parity` at `bf25f809`.

## Outcome

Players can talk to each other, group up, and find the people they know, so a
shared world feels shared.

## Evidence of the gap

- No match for chat, friend or matchmaking in `client/react-client/src`.
- `nakama/src/main.ts:49-58` registers RPCs only; no social hooks are used by the client.
- A room is chosen by a `?map=` URL parameter (`useServerRsClient.ts:318`).

## Slices

Order matters: earlier slices unblock later ones.

1. Nearby and world chat — text chat by proximity and by channel, with basic rate limiting.
2. Friends list — add, accept and see who is online, using Nakama's friends.
3. Parties — form a party, see members' health and position, and share kill credit.
4. Find and join friends in the world — travel to or meet a friend's region.

## Out of scope

- Guilds, trading and voice.

## Open questions

- Whether chat goes through Nakama or the game server.
