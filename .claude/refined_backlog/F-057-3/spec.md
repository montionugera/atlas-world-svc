---
title: "3"
id: F-057
status: refined
epic: E-001
from_idea: I-128
---

# FlatBuffers binary delta state replication protocol and TypeScript client decoders

## Problem

Replace Colyseus reflection-based schema replication with zero-copy FlatBuffers binary delta streams:
1. Define `.fbs` schemas for player inputs, entity snapshots, and combat events.
2. Compile Rust encoders and TypeScript decoders.
3. Wire Tokio WebSocket transport in `server-rs` with spatial Area of Interest (AOI) view filtering.

## Acceptance criteria

- [ ] AC-1: FlatBuffers `.fbs` schema compiles to valid Rust and TypeScript code without errors.
- [ ] AC-2: Web client decodes entity state stream directly from `ArrayBuffer` with zero allocation overhead.
- [ ] AC-3: End-to-end synthetic bot connection test verifies 300 connected clients receiving localized delta updates.
