---
title: "Concept art cleanup: drop 18 retired-world images, keep 7 race sheets + Maro Bell grey boxes"
id: F-187
from_idea: I-270
status: refined
---

# I-270 Concept art cleanup

Goal: remove the 18 concept-art items that depict the retired Lantern Hollow / Clover / Kiln Saint world (key art, continents, towns, zones, dungeons, mobs, bosses). Keep the 7 race sheets (character category) and the 2 Maro Bell grey-box shots.

## Acceptance criteria

- [ ] index.json, images, thumbs and art-briefs.json rows for the 18 ids are gone; atlas-world-panels tests pass after updating tests that pinned removed ids; no dangling references.
