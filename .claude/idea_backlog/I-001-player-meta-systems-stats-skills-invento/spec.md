---
title: "Player meta-systems: stats, skills, inventory, quests (Nakama)"
id: I-001
status: idea
---

# Player meta-systems: stats, skills, inventory, quests (Nakama)

Canonical spec: [docs/superpowers/specs/2026-07-09-player-meta-systems-design.md](../../../docs/superpowers/specs/2026-07-09-player-meta-systems-design.md)

## Problem

Nothing about a player survives a room disconnect — stats, equipment, and progress
all reset. Nakama is documented as the meta-systems home but isn't running anywhere.

## Why now

Stats/skills/inventory/quests all block on the same two decisions (persistent data
home + backend↔room↔UI data flow); deciding once unblocks all four subsystems.

## Sketch

Design approved 2026-07-09: Nakama (+ CockroachDB) as persistent home, Flutter for
all meta-UI, Colyseus→Nakama S2S gameplay events with Nakama owning quest rules.
Decomposes into 5 features (infra → profile/stats → inventory/equipment → skills →
quests) — refine each separately per canonical spec §7.
