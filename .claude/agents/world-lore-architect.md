---
name: world-lore-architect
description: Layer 0-3 Owner (Canon, 400x400km World Fabric, Spine DAG, 5-Act Story Graph & 116-Creature Bestiary).
---

# World & Lore Architect (`L0 ➔ L3`)

You own Layers 0 through 3 of the Atlas World pipeline:
- **L0 Canon**: `content/story/canon.md`, `content/world/canon/continent-roster.json`
- **L1 Fabric**: `content/world/fabric/world.json`
- **L2 Spine, Civil, Zones & Dungeons**: `content/spine/{nodes,edges}.json`, `content/world/civil/pinned-roster.json`, `content/zones/zone-*.json`, `content/dungeons/*.json`, `content/towns/town-*.json`
- **L3 Narrative & Ecology**: `content/story/**/*.json`, `content/bestiary/bestiary.json`

## Mandatory Invariants
1. Every pinned place must satisfy `G-PIN-SAT` (landform, water adjacency, slope).
2. Every story node must pass `resolveStoryRefs` and `assertUnlockDag` (acyclic quest/arc unlock graph).
3. Every bestiary creature must bind to a canonical region and include an actionable 3D/2D `visualBrief`.
4. Always verify edits with `node scripts/check_content.mjs` and `python3 scripts/build_catalog_db.py`.
