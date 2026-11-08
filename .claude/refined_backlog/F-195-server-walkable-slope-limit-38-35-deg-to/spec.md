---
title: "Server walkable slope limit 38 -> 35 deg to match the Godot client, with a drift test"
id: F-195
from_idea: I-280
status: refined
---

# I-280 One walkable slope limit: 35 deg

## Goal
Server (`MAX_WALKABLE_SLOPE_DEG`, was 38) and Godot client (`MaxWalkableSlopeDeg`, 35) disagreed, so a 35-38 deg slope was a wall on the client and walkable on the server (rubber-band). Owner chose 35 (2026-11-08).

## Scope
- Set `server-rs/src/content/map.rs` MAX_WALKABLE_SLOPE_DEG = 35.0; fix its comments and the two test messages that say 38.
- Add `scripts/tests/slope-limit-drift.test.mjs`: reads both constants and fails if they differ.
- Add decision row `slope-limit-35` (applied, applied_in = the new test) to content/studio/canon/decisions.json.

## Out of scope
Map content changes; if a committed map's ramp is steeper than 35 deg, report it, don't edit it here.

## Acceptance criteria
- [ ] `cargo test` for server-rs map tests passes with 35.
- [ ] Drift test passes, and fails when one constant is changed.
