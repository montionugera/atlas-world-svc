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

Order matters: each slice builds on the one before.

1. Apply the saved character on join — build the server with its Nakama client, and spawn the avatar from the fetched loadout (level, weapon, stats) instead of defaults.
2. Report match events to Nakama — flush kill and match events through `report_match_events` on a buffered interval and on leave.
3. Real sign-in — the client authenticates with Nakama and sends that session token; the server verifies it; the `dev-token` path is allowed only in a debug build with no auth secret set.
4. Save and restore position and health — persist where a character is and its health on leave and on an interval; restore on join.
5. Session resume after a dropped connection — keep the avatar for a grace period, let the same account reattach to it, and have the client retry with backoff.

## Out of scope

- Experience, loot, inventory and quests (E-005).
- Persisting the world itself, as opposed to characters (E-004).

## Open questions

- Whether a real Nakama session token validates against the key
  `server-rs` uses (`jwt.rs:78`, HS256). Slice 3 must settle this first.
