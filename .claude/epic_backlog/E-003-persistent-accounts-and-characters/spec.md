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

1. Wire the game server to Nakama — the server reads the Nakama URL and http key from the environment, calls `with_nakama`, and both are set in `k8s/local/server-rs.yaml`. (`scripts/deploy-local.sh` already starts game server, Nakama and CockroachDB together; this slice connects them. Reopens promoted F-021 and F-063.)
2. Server accepts a real Nakama token — first mint one token via `authenticate/device` (as `scripts/e2e-meta.sh:85` does) and decode it, because `Claims` (`jwt.rs:8`) requires `sub` while Nakama tokens may carry `uid`/`usn` and be signed with `session.encryption_key` (`nakama/local.yml:8`); then either verify locally with that key and map the id, or use the existing unused `verify_session` (`nakama.rs:170`). `dev-token` (`jwt.rs:60`) and the hard-coded fallback secret (`jwt.rs:49`) are compiled in only under `cfg(debug_assertions)`.
3. Client signs in with Nakama — the test client authenticates against Nakama and sends that session token instead of the configured `dev-token` (`useServerRsClient.ts:310`).
4. One live session per account — newest connection wins and the older one is closed with a named close code; includes a regression test for the React StrictMode double-mount that `ws.rs:425-428` records.
5. Apply the saved character on join — spawn the avatar from the fetched loadout (weapon and stats) instead of defaults.
6. Report match events to Nakama — flush kill and match events through `report_match_events` on a buffered interval and on leave.
7. Save and restore position and health — on leave, on an interval, and safely across a server crash.
8. Session resume after a dropped connection — keep the avatar for a grace period, let the same account reattach to it, and have the client retry with backoff.

## Depends on

Nothing external; it comes first after E-006 slices 1 and 2.

Build order across epics: E-006 slices 1 and 2; then E-003; then E-006 slices 3 to 7; then E-004 slices 1 to 3; then E-005 slices 1 to 6; then E-004 slices 4 to 10 and E-006 slice 8; then E-005 slices 7 to 9; E-007 alongside; then E-008; then E-009.

## Out of scope

- Experience, loot, inventory and quests (E-005).
- Persisting the world itself, as opposed to characters (E-004).

## Open questions

None; the token signing key question is resolved in slice 2.
