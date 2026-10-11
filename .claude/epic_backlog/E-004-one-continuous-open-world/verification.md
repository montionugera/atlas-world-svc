---
title: "One continuous open world"
id: E-004
---

# How we will know E-004 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. A repeatable load run reports tick time and bandwidth per player measured at 50, 100, 200, and 400 entities against the tick budget.
2. An architecture decision record is committed naming region size, world state store, crossing mechanism, and tick budget with F-027 cited as an input.
3. In a simulation with at least 20 players spread across a region, each player receives only entities within their interest radius.
4. The server loads and runs an authored region from the generated world data instead of hard-coded test maps.
5. Client obstacle geometry and server spawn points match the generated map source with zero diff and no hand copies.
6. A region with 0 players stops ticking at 0 Hz and wakes on player entry with mob respawn timers adjusted for sleeping duration.
7. The world state store selected in slice 2 connects, writes, and reads world state data in integration tests.
8. After a server restart, region state for active mobs and world objects is restored to pre-restart coordinates and states.
9. An entity positioned near a region boundary is replicated and visible as a border ghost from the neighbouring region.
10. A player walking across a region boundary transitions authority cleanly to the neighbouring region without a manual reconnect.
