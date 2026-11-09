---
title: "POC-00: Maro Bell integration baseline (room routing, reproducible POC reset, diagnostics HUD)"
id: F-205
status: refined
epic: E-011
from_idea: I-287
---

# I-287 POC-00: Maro Bell integration baseline

## Goal
Establish a repeatable build of **Maro Bell** (`content/maps/maro-bell.json`, `80×160 m`) using existing project systems (`metres-v1`, locked 2.5D ground-following height, `server-rs` authority, Godot C#, `UnifiedMapDocument`, `TerrainElevation`, `MapChunkStreamer`, `35°` walkability, `RustMetaEngine` SQLite), so subsequent POC slices (`POC-01..POC-06`) contribute to one playable experience.

## Player-Facing Experience
Launches directly into a controllable character in Maro Bell without requiring a developer to manually teleport, spawn content, or execute console commands.

## Scope In vs Out
- **Scope In:** `metres-v1`, locked 2.5D behavior, Rust authority, Godot C#, existing `UnifiedMapDocument`, `TerrainElevation`, `MapChunkStreamer`, `35°` walkability, one game server, local Rust persistence, mapped `maro-bell` room ID on Rust & Godot (no silent fallback to `map-for-play`), repeatable POC test-profile reset, and minimal diagnostics HUD (player position, map ID, server connection, frame time, active POC beat).
- **Scope Out:** New renderer, replacement world generator, new network protocol, multi-server persistence, new terrain physics, or substituting a 400×400 m region for the 80×160 m `maro-bell.json` map.

## Acceptance criteria
- [ ] Godot and `server-rs` both resolve and load `maro-bell` (`80×160 m`, `unitContract: "metres-v1"`) with no silent fallback to `map-for-play`.
- [ ] Player movement and blocking geometry in `maro-bell` are enforced by `server-rs` authority (`coord_scale == 1.0`, `35°` slope limit).
- [ ] POC test character/session resets to a reproducible initial state in `RustMetaEngine` without leaking demo flags into canonical saves.
- [ ] Minimal diagnostics overlay reports player position, `mapId`, connection state, frame time, and current POC beat.
