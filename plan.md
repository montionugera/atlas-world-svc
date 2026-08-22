# F-048 — World Fill Plan C: The Fabric Layer

**This file is a pointer. The real plan is elsewhere. Do not implement from this file.**

| What | Where |
| --- | --- |
| **The plan you implement** | `docs/superpowers/plans/2026-08-16-world-fill-c-fabric-layer.md` (13 tasks) |
| **Read BEFORE any task** | `docs/superpowers/plans/world-fill-STATE.md` — running handover state, measured baselines, the traps |
| **Approved design** | `docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md` |
| Backlog spec stub | `.claude/refined_backlog/F-048-world-fill-plan-c-the-fabric-layer-seede/spec.md` |
| Base tag for the "nothing moved" invariant | `plan-c-base` |

## The one-line goal

Generate a reproducible 400 x 400 km world — 13 landmasses, 160 regions, 1,740 landform
instances, 45 settlements, 60 dungeon anchors — from a committed seed and 13 premise files,
commit it as a new `content/world/fabric/` layer whose sea-to-land ratio is 1.5 : 1 **by
construction**, and prove promotion into a spine trunk is byte-idempotent — without changing a
single committed spine byte, sheet byte, or runtime coordinate.

## The invariant on EVERY commit

- `node scripts/check_spine_emit.mjs --check` -> clean
- `(cd colyseus-server && npx jest mapDimensions)` -> green
- `git diff --stat plan-c-base -- content/spine content/maps game-client/assets/art/maps/` -> empty

Plan C commits **ZERO** spine node bytes. Trunk output goes to the gitignored draft folder only.
