---
title: "Godot client on the Rust server"
id: E-009
status: epic
---

# Godot client on the Rust server

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

1. Connect and decode — the Godot client opens a socket to `server-rs` and decodes snapshots using the shared protocol.
2. Move and predict — input, local prediction and reconciliation on the acknowledged input, matching the test client.
3. Fight — attacks, skills, projectiles, damage and death shown from server state.
4. Meta panels on real data — sign-in, inventory and quests wired to Nakama through the new flow.
5. Refresh the documents — README and CLAUDE.md describe the Rust server and the current clients.

## Out of scope

- New art or user-interface design.

## Open questions

- Whether the Godot client is still the chosen platform (decision of 2026-07-11).
