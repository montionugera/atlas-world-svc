---
title: "Ledger: lock 2.5D physics (no height-dependent combat) and 30 Hz tick as owner decisions"
id: F-194
from_idea: I-279
status: refined
---

# I-279 Lock 2.5D and 30 Hz in the decision ledger

## Goal
Record two owner decisions (2026-11-08) in `content/studio/canon/decisions.json`.

## Scope
1. `physics-2-5d` (decided): server stays on rapier2d; terrain height is a value that follows the ground. No combat outcome depends on height (no jump dodge, arcing shots, flying bosses). Bridges/multi-level = separate layers with portals; caves/dungeons = separate instances. Source: ChatGPT "Game Roadmap Ideation" + owner answer "no".
2. `tick-30hz` (decided, not yet applied): target simulation tick is 30 Hz; code is still 20 Hz (`WORLD_TICK_RATE_HZ` in `server-rs/src/content/world_model.rs`, `tick_rate_ms` in `server-rs/src/main.rs`). Changing the code is a separate feature.

## Out of scope
Changing the tick rate in code; any physics change.

## Acceptance criteria
- [ ] Both rows exist in decisions.json with status `decided` and owner_answer filled.
- [ ] `node --test scripts/tests/catalog-canon.test.mjs` passes.
