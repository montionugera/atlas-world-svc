---
title: "Godot client on the Rust server"
id: E-009
status: epic
---

# Godot client on the Rust server

The open question of whether Godot is still the chosen platform gates the whole epic.

Part of the open-world MMORPG direction (owner, 2026-10-11). Source: the
must-have scan of `server-rs`, `client/react-client` and `nakama` on
`feature/gameplay-combat-parity` at `bf25f809`.

## Outcome

The real game client connects to the Rust server and can do everything the
React test client can, so the test client stops being the only way to play.

## Evidence of the gap

- `game-client/src/Core/Config.cs:13` and `Net/ColyseusConnection.cs` target Colyseus at `ws://127.0.0.1:2568`; `game-client/GameClient.csproj:14` pins the Colyseus SDK.
- `colyseus-server/` was deleted in release 1.11 (`19d32661`); F-064 decommissioned it without porting the client.
- `README.md:76-81` and `CLAUDE.md` still describe the deleted server.

## Slices

Order matters: earlier slices unblock later ones.

1. Connect and decode — the Godot client opens a socket to server-rs and decodes snapshots using the shared protocol.
2. Move and predict — input, local prediction and reconciliation on the acknowledged input, matching the test client.
3. Fight — attacks, skills, projectiles, damage and death shown from server state.
4. Sign-in panel on the new flow — authenticate with Nakama and pass session tokens to server-rs.
5. Inventory panel on real data — wire inventory and equipment UI to live server loadout data.
6. Quest panel on real data — wire quest UI to live server quest progression and rewards.
7. Refresh the documents — README and CLAUDE.md describe the Rust server and the current clients.

## Depends on

Slices 1 to 3 need E-006 slice 2; slices 4 to 6 need E-003 slices 2 and 3 and E-005 slices 5 and 9.

Build order across epics: E-006 slices 1 and 2; then E-003; then E-006 slices 3 to 7; then E-004 slices 1 to 3; then E-005 slices 1 to 6; then E-004 slices 4 to 10 and E-006 slice 8; then E-005 slices 7 to 9; E-007 alongside; then E-008; then E-009.

## Out of scope

- New art or user-interface design.

## Open questions

- Whether the Godot client is still the chosen platform (decision of 2026-07-11); this open question gates the whole epic.
