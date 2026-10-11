---
title: "One continuous open world"
id: E-004
status: epic
---

# One continuous open world

Part of the open-world MMORPG direction (owner, 2026-10-11). Source: the
must-have scan of `server-rs`, `client/react-client` and `nakama` on
`feature/gameplay-combat-parity` at `bf25f809`.

## Outcome

Many players share one persistent world instead of a handful of separate test
rooms. Each player receives only what is near them, the world is the generated
world map rather than hand-made test maps, a player can walk from one region to
the next without a break, and the world survives a server restart.

## Evidence of the gap

- Five rooms are hard-coded, four of them test maps (`server-rs/src/main.rs:134-205`); an unknown map falls back to the first room (`server-rs/src/content/map.rs:22`).
- The same snapshot is broadcast to the whole room (`server-rs/src/main.rs:284`); there is no area-of-interest filter. The deleted TypeScript server had one (`InterestManager`).
- Room state is not persisted; `server-rs` has no store of its own.
- The owner reported lag with fewer than 100 mobs and players; real capacity of `server-rs` is unmeasured (only `benches/sim_scale.rs` exists).
- The project documents describe one match = one room = one pod, which is an arena model and conflicts with an open world.

## Slices

Order matters: earlier slices unblock later ones.

1. Measure capacity — a repeatable load run that reports tick time and bandwidth per player at 50, 100, 200 and 400 entities, so the region size rests on numbers.
2. Decide the world model — a decision record choosing how the world is split into regions, where state lives, and how players cross; replaces the one-match-one-room statement.
3. Send each player only what is near them — per-client area-of-interest filtering of snapshots, with enter and leave handled cleanly.
4. Run the generated world map — load a region of the generated world as the playable map instead of hand-made test maps, with client obstacle and spawn data derived from the same source.
5. Stop empty regions from ticking — a region with no players sleeps and wakes on entry.
6. Persist the world — save and restore region state (mobs, world objects) across a restart.
7. Cross between regions — a player walks over a region border and continues in the neighbour without reconnecting by hand.

## Out of scope

- Character persistence (E-003).
- Production multi-node deployment and autoscaling; this epic proves the model on one machine.

## Open questions

- Region size and the crossing mechanism are decided by slice 2 from slice 1's numbers; slices 3-7 must not start before it.
- Whether Agones allocation still fits an always-on world.
