# I-270 Concept art cleanup

Goal: remove the 18 concept-art items that depict the retired Lantern Hollow / Clover / Kiln Saint world (key art, continents, towns, zones, dungeons, mobs, bosses). Keep the 7 race sheets (character category) and the 2 Maro Bell grey-box shots.

## Acceptance criteria

- [ ] index.json, images, thumbs and art-briefs.json rows for the 18 ids are gone; atlas-world-panels tests pass after updating tests that pinned removed ids; no dangling references.
