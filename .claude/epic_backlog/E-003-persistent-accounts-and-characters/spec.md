---
title: "Persistent accounts and characters"
id: E-003
status: epic
---

# Persistent accounts and characters

Part of the open-world MMORPG direction (owner, 2026-10-11). Source: the
must-have scan of `server-rs`, `client/react-client` and `nakama` on
`feature/gameplay-combat-parity` at `bf25f809`.

## Outcome

A player signs in as themselves, plays, leaves, and comes back later to the
same character: same level, equipment and position. A dropped connection
puts them back where they were instead of resetting them. Nobody can play as
someone else.

## Evidence of the gap

- Kill events are only debug-logged (`server-rs/src/main.rs:266`);
  `report_match_events` (`server-rs/src/storage/nakama.rs:317`) has no caller.
- The saved loadout is fetched and only logged (`server-rs/src/net/ws.rs:403`);
  every avatar spawns with loadout `None` (`server-rs/src/simulation.rs:860`).
  `with_nakama` (`server-rs/src/net/ws.rs:142`) has no caller.
- `dev-token:<any id>` is accepted unconditionally
  (`server-rs/src/auth/jwt.rs:60`); a fallback secret is hard-coded (`:49`).
- A closed socket despawns the avatar next tick
  (`server-rs/src/simulation.rs:393`); the client never retries
  (`client/react-client/src/hooks/useServerRsClient.ts:679`).
- F-063 "Nakama persistent storage integration" is marked promoted, but the
  wiring above is absent.

## Slices

Order matters: each slice builds on the one before. Saving data before real sign-in would store it under forgeable ids, which is why sign-in comes first.

1. Local full stack wired to Nakama — one command starts game server, Nakama and its database; the server reads the Nakama URL and http key from the environment and constructs its client. (Reopens promoted F-021 and F-063, whose wiring is absent.)
2. Real sign-in — settle which key Nakama signs session tokens with (`nakama/local.yml:8` sets a separate `encryption_key`, while the server verifies with `NAKAMA_SERVER_KEY`), then the client authenticates with Nakama, the server verifies that token, and `dev-token` and the hard-coded fallback secret (`jwt.rs:49`) work only in a debug build.
3. One live session per account — a second connection for the same account replaces or is refused, instead of two sockets driving one session (`ws.rs:425-428`).
4. Apply the saved character on join — build the server with its Nakama client, and spawn the avatar from the fetched loadout (level, weapon, stats) instead of defaults.
5. Report match events to Nakama — flush kill and match events through `report_match_events` on a buffered interval and on leave.
6. Save and restore position and health — on leave, on an interval, and safely across a server crash.
7. Session resume after a dropped connection — keep the avatar for a grace period, let the same account reattach to it, and have the client retry with backoff.

## Depends on

Nothing external; it comes first after E-006 slices 1 and 2.

Build order across epics: E-006 slices 1 and 2; then E-003; then E-006 slices 3 to 7; then E-004 slices 1 to 3; then E-005 slices 1 to 6; then E-004 slices 4 to 10 and E-006 slice 8; then E-005 slices 7 to 9; E-007 alongside; then E-008; then E-009.

## Out of scope

- Experience, loot, inventory and quests (E-005).
- Persisting the world itself, as opposed to characters (E-004).

## Open questions

None; the token signing key question is resolved in slice 2.
