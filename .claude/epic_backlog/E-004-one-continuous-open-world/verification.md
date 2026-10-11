---
title: "One continuous open world"
id: E-004
---

# How we will know E-004 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. A load run at the chosen region capacity holds the tick budget recorded in the decision record.
2. Two players far apart in one region receive no entities from each other's surroundings.
3. The playable map is produced from the generated world data, with no hand-copied obstacle blocks in the client.
4. After a server restart, a region's mobs and world objects are where they were.
5. A player walks across a region border and keeps playing without a manual reconnect.
