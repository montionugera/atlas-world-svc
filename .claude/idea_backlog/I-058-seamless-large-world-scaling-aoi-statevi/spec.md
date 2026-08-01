---
title: "Seamless large-world scaling: AOI (StateView) + shard grid + border ghosts + authority handoff + cross-shard combat"
id: I-058
status: idea
---

# Seamless large-world scaling

> **Canonical design:** [`docs/superpowers/specs/2026-08-01-seamless-large-world-scaling-design.md`](../../../docs/superpowers/specs/2026-08-01-seamless-large-world-scaling-design.md)
> This file is a stub. All design detail lives in the spec above.

## Problem

The server runs one world as one room, one Node process, and one Planck world, and sends every client the full state of every entity. Two independent ceilings follow:

- **Bandwidth** scales with *total* entity count, so a larger world costs every player more even for entities they cannot see.
- **CPU** scales with entity count in a single thread at a 50 ms tick (`config/gameConfig.ts:8`).

Map area itself is not a cost — entities are. A seamless continuous world needs both ceilings lifted, by different mechanisms.

## Why now

The substrate already exists and is currently unused:

- `mapId` already parameterizes a room's dimensions and mob spawn tables (`GameRoom.ts:85`, `config/mapConfig.ts`); the default is literally `map-01-sector-a`.
- `docs/networking.spec.md` already designs a Nakama-issued token carrying `mapKey`, and `MAP_KEY` is already a documented pod env var.
- `StateView` ships in the installed `@colyseus/schema` v4; `remoteRoomCall` and `@colyseus/redis-presence` are installed and unused.

## Sketch

Five stages, in order. Stages 1–2 ship value alone and cause no regression; 3–5 are a distributed-systems build.

1. **AOI** — per-client `StateView` interest filtering, plus a load harness.
2. **Residency** — `LOCAL` / `GHOST` on `WorldObject`; systems iterate local only.
3. **Shard link** — fixed cell grid; Redis border snapshots; see across borders.
4. **Handoff** — authority transfer with brief client dual-connect.
5. **Cross-shard combat** — damage and impulse intents resolved by the victim's owner.

## Blocking risk

**No load or stress test exists in the repo.** The bottleneck that motivates sharding has never been measured, and `cellSize` cannot be chosen without that number. The Stage 1 load harness gates the decision to build stages 3–5 at all. Three further serious risks (knockback at seams, boss fights straddling borders, Agones model mismatch) are recorded in the canonical spec's risk register.
