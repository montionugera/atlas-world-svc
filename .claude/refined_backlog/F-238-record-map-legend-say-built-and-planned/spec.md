---
title: "Record map legend: say built and planned on the continent map, explain P0 P1 P2"
id: F-238
from_idea: I-323
status: refined
---

# Record map legend: say built and planned on the continent map, explain P0 P1 P2

## Goal

Owner, 2026-11-19, looking at the continent map (F-237): "what is Open / Close, confused". On the continent map the
edges are routes between districts, not doors, so "Open" / "Closed" is the wrong wording, and the `built` / `P0` /
`P1` / `P2` pills are not explained anywhere.

## Change

In `renderRecordMap` (`scripts/atlas_world_web/frontend/02c_records_search.js`), continent map only:
- legend line items read "Route built, walkable now" (solid) and "Route planned, not built yet" (dashed);
- one more legend line: "P0 build first · P1 next · P2 later".
District maps are doors, so they keep their wording but say it in full: "Door open" / "Door closed".

## Acceptance criteria

- [ ] The continent-01 record page legend shows the built / planned wording and the P0 P1 P2 line; "Open" and "Closed" alone no longer appear on it.
- [ ] The district record page legend says "Door open" / "Door closed".
- [ ] `scripts/tests/atlas-web-record-map.test.mjs` asserts the continent legend wording, and the atlas web suites pass.

## Not in this feature

Any layout, colour or data change.
