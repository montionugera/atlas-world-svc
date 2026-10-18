---
title: "District and Town or Hunting Area Topology, Ecology, and Map Compiler Upgrade"
id: I-193
status: idea
epic: E-010
---

# District and Town or Hunting Area Topology, Ecology, and Map Compiler Upgrade

## Summary

Author the Layer 3 (**District**) and Layer 4 (**Town, Hunting Area, and Dungeon**) JSON schemas and canonical starter studio documents under `content/studio/`, extend `scripts/validate_studio_hierarchy.py` to enforce all seven deterministic graph, scale, continuity, ecology, and mystery invariants (`INV-01` through `INV-07`), and upgrade `scripts/compile_world_maps.py` to emit `content/maps/_manifest.runtime.json` with Starter Town spawn coordinates, playable map metadata, and bidirectional `North / South / East / West / Dungeon` plus `"fog_of_lore"` boundary portal routing.

## Acceptance criteria

- [ ] `content/studio/schemas/district.schema.json` and `content/studio/schemas/town-or-hunting-area.schema.json` define the unabbreviated Layer 3 (**District**) and Layer 4 (**Town, Hunting Area, and Dungeon**) schemas, embedding the shared rationalized envelope and five-pillar `quality_checklist`.
- [ ] `content/studio/districts/continent-01-hearthbloom-basin/` contains `district-teacup-meadows.json` (`status: "canon"`) and `district-kilnfire-terraces.json` (`status: "draft"`), and `content/studio/districts/continent-02-clockwork-steppe/` contains `district-rustcog-downs.json` (`status: "draft"`).
- [ ] `content/studio/nodes/continent-01-hearthbloom-basin/district-teacup-meadows/` contains canonical starter nodes (`town-lantern-hollow.json` as Starter Town `[1,1]`, `hunting-area-clover-south-gate.json` at `[1,2]`, `hunting-area-kiln-east-orchard.json` at `[2,1]`, `dungeon-kiln-cellar.json` at `[1,1]` floor `-1`, and `hunting-area-whispering-mire.json` with `status: "mystery"` at `[0,1]`).
- [ ] `python3 scripts/validate_studio_hierarchy.py --check` enforces all seven deterministic invariants (`INV-01` Hierarchy and Status Integrity, `INV-02` Grid Orthogonality and Uniqueness, `INV-03` Bidirectional Portal Symmetry, `INV-04` Starter Town Breadth-First Search Reachability, `INV-05` Level-Band Continuity, `INV-06` Ecological and Loot Table Completeness, and `INV-07` Mystery Fog of Lore Boundary Behaviour and 90 to 120 centimeter Character Scale Law) and exits `0`.
- [ ] `python3 scripts/compile_world_maps.py --check` validates the studio hierarchy and generates `content/maps/_manifest.runtime.json` with `defaultStarterMapId`, `starterSpawns`, `playableMaps` (excluding `"mystery"` nodes), and `portalRoutingTable` (including `"fog_of_lore"` boundary locks).
- [ ] `python3 -m unittest tests/test_validate_studio_hierarchy.py` passes all Layer 1 through Layer 4 invariant tests.
