---
title: "Godot client on the Rust server"
id: E-009
---

# How we will know E-009 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. The Godot client opens a WebSocket to server-rs and decodes 100% of received FlatBuffers entity snapshots.
2. Walking and stopping reconcile on the server's acknowledged input within the error bound set in this slice.
3. A player can attack, cast a skill, take damage and die, each shown from server state.
4. The Godot sign-in panel authenticates against Nakama and passes a valid session token accepted by server-rs.
5. The inventory panel renders real items from the server and equipping an item updates server attributes.
6. The quest panel displays live progress for the 28 authored quests and claiming a completed objective grants rewards.
7. README.md and CLAUDE.md describe only the active Rust server and client workflows, with zero references to colyseus-server.
