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
- The same snapshot is broadcast to the whole room (`server-rs/src/main.rs:284`); there is no area-of-interest filter. Promoted F-027 (I-058) already designed area-of-interest, a shard grid, border ghosts and authority handoff on the deleted TypeScript server; it is an input to the world-model decision.
- Room state is not persisted; `server-rs` has no store of its own.
- The owner reported lag with fewer than 100 mobs and players; real capacity of `server-rs` is unmeasured (only `benches/sim_scale.rs` exists).
- The project documents describe one match = one room = one pod, which is an arena model and conflicts with an open world.

## Slices

Order matters: earlier slices unblock later ones. Ideas I-072 (snapshot-bytes metric) and I-073 (load harness) are folded into slice 1.

1. Measure capacity — a repeatable load run and harness that reports tick time and bandwidth per player at 50, 100, 200 and 400 entities (absorbing I-072 and I-073).
2. Decide the world model — the decision record must name region size, the store for world state, the crossing mechanism and the tick budget, and must take F-027 as input.
3. Send each player only what is near them — per-client area-of-interest filtering of snapshots, with enter and leave handled cleanly.
4. Load a generated-world region on the server — run a region of the generated world map instead of hand-made test maps.
5. Derive client obstacles and spawn from the same source (no hand copies) — generate client obstacles and server spawn points from the shared world source without hand copies.
6. Sleeping regions — a region with no players stops ticking and wakes on entry; states the rule for mob respawn timers while asleep.
7. World state store — add the store chosen in slice 2.
8. Save and restore region state across a restart — persist and restore region state (mobs, world objects) across a server restart.
9. Border ghosts — entities near a border are visible from the neighbouring region.
10. Authority handoff — a player crossing a border continues in the neighbour without a manual reconnect.

## Depends on

Slice 1 needs E-006 slice 5 (metrics); slice 3 and every later wire change need E-006 slice 2 (protocol version); slice 10 needs E-003 slices 7 and 8.

Build order across epics: E-006 slices 1 and 2; then E-003; then E-006 slices 3 to 7; then E-004 slices 1 to 3; then E-005 slices 1 to 6; then E-004 slices 4 to 10 and E-006 slice 8; then E-005 slices 7 to 9; E-007 alongside; then E-008; then E-009.

## Out of scope

- Character persistence (E-003).
- Production multi-node deployment and autoscaling; this epic proves the model on one machine.

## Open questions

- Region size and the crossing mechanism are decided by slice 2 from slice 1's numbers; slices 3-10 must not start before it.
- Whether Agones allocation still fits an always-on world.
