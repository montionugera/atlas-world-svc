---
title: "Systematic Top-Down World and Map Studio (World History and Concept -> Continent -> District -> Town or Hunting Area)"
id: E-010
status: epic
---

# Systematic Top-Down World and Map Studio (World History and Concept -> Continent -> District -> Town or Hunting Area)

## Outcome

Atlas World has a deterministic, top-down **Four-Level World, Map, and Asset Building Studio** (`content/studio/` + `scripts/compile_world_maps.py` + `scripts/catalog_explorer_web.py`) that replaces the legacy bottom-up proof-of-concept lore (`content/spine/` and `undertow` boilerplate) with a clear causal hierarchy using full, unabbreviated names across schemas, files, routes, and user interface labels:

1. **Level 1 — World History and Concept (`content/studio/world_history_and_concept.json`)**:
   - Defines Primordial Gods, Great Wars and Cataclysms (`world_scars`), why players enter the world (`player_arrival_premise`), which Starter Towns new players spawn into (`starter_town_bindings`), and the **90 to 120 centimeter (1.05 meter reference) Cute Toddler and Kid Character Scale Law** (`max_grass_height_meters <= 0.35`, `max_bush_height_meters <= 0.65`, `max_stair_riser_meters <= 0.18`, `counter_height_meters 0.55 to 0.65`, `min_doorway_height_meters >= 1.80`, `min_highway_corridor_width_meters >= 3.5`).
2. **Level 2 — Continent (`content/studio/continents/<continent_id>.json`)**:
   - Directly justified by **World History and Concept** Gods and Great War scars (`parent_world_history_causes`); defines macro climate, civilization and architecture style (with explicit 90 to 120 centimeter character scale adaptation), level band, inter-continent travel links, and child **District** references.
3. **Level 3 — District (`content/studio/districts/<continent_id>/<district_id>.json`)**:
   - Subdivides a **Continent** into regional clusters with local conflict rationale, level band (`Levels 1 to 20`, `Levels 21 to 40`, `Levels 41 to 60`, `Levels 61 to 80`, `Levels 81 to 100`), ecological monster families, and an orthogonal two-dimensional grid plus bidirectional `North / South / East / West / Dungeon` portal adjacency graph of child **Town, Hunting Area, and Dungeon** nodes.
4. **Level 4 — Town, Hunting Area, and Dungeon (`content/studio/nodes/<continent_id>/<district_id>/<node_id>.json` -> `content/maps/<map_id>.json`)**:
   - Leaf playable maps (`node_type: "town" | "hunting_area" | "dungeon"`) with Starter Town spawn rules, distinct topographic and three-dimensional terrain tiles, `North / South / East / West / Dungeon` neighbor portals, resident monster spawns (with spawn counts, elements, sizes, races, and item or card drop percentages), and three-dimensional asset kit bindings honoring the 90 to 120 centimeter character scale law.
5. **Intentional Mystery and Fog of Lore State Machine (`status: "canon" | "draft" | "mystery"`)**:
   - Every node across all four levels requires a non-empty `core_rationale` linked to its parent. Unbuilt regions remain intentional **`"mystery"` (Fog of Lore)** with an `in_world_rumor`, `visual_silhouette`, and `unanswered_question`—never low-quality filler content—and compile to non-traversable Fog of Lore boundary portals (`gate_state: "fog_of_lore"`).
6. **Interactive Four-Perspective Studio User Interface (`scripts/catalog_explorer_web.py`)**:
   - Sticky top-down perspective switcher using full, unabbreviated labels and routes (`#perspective=world-history-and-concept` ➔ `#perspective=continent&continent=<id>` ➔ `#perspective=district&district=<id>` ➔ `#perspective=town-or-hunting-area&map=<id>&monster=<id>`) with:
     - **World History and Concept Perspective**: Cosmic Timeline, Great War Scars graph, 90 to 120 centimeter Character Scale Law visualizer, and Starter Town origins.
     - **Continent Perspective**: Macro Continent Atlas with `Canon`, `Draft`, and `Mystery (Fog of Lore)` District overlays and Great War Scar overlays.
     - **District Perspective**: Maxion-style (`rolth.maxion.gg/WorldMap`) and Lineage-style (`lineage.pmfun.com/list/map`) connected two-dimensional map tile matrix with left sidebar Level-Band vertical tabs (`Levels 1 to 20` through `Levels 81 to 100`) and clickable Monster Portrait pinning across tiles.
     - **Town and Hunting Area Perspective**: Local Map and three-dimensional asset kit inspector plus embedded `rolth.maxion.gg/Monster/1035` detail sheet (`192×192` portrait, four property pills, four stat boxes `Level / Health Points / Hit and Flee / Base and Job Experience`, `2×5` Elemental Modifiers grid, and Item Drop Portrait Cards with drop percentage badges).
     - Persistent right-hand **Core Rationale and Mystery Approval Drawer** (`POST /api/studio/rationale/update`, `POST /api/studio/generate-children`) enforcing parent-canon preconditions before downward artificial intelligence generation.

---

## Architecture and Data Flow

```
[World History and Concept] content/studio/world_history_and_concept.json
  │  (Primordial Gods, Great War Scars, 90-120cm Character Scale Law, Starter Town Bindings)
  ▼
[Continent]                 content/studio/continents/<continent_id>.json
  │  (Parent World History Cause, Macro Climate, Architecture Scale Adaptation, Level Band)
  ▼
[District]                  content/studio/districts/<continent_id>/<district_id>.json
  │  (Local Conflict, Level Band 1-20..81-100, Monster Families, 2D Grid & North/South/East/West/Dungeon Graph)
  ▼
[Town / Hunting Area]       content/studio/nodes/<continent_id>/<district_id>/<node_id>.json
  │  (Starter Spawn, Terrain Tile, North/South/East/West Portals, Resident Monster Drops, 3D Asset Kit)
  ▼
scripts/compile_world_maps.py --check
  ├──► content/maps/<map_id>.json            (Playable maps for Canon and Draft nodes)
  └──► content/maps/_manifest.runtime.json   (Starter spawns, portal routing, Fog of Lore locks)
```

---

## Slices

1. **World History and Concept and Continent Studio Schemas plus Mystery State Machine**: Author `common-mystery.schema.json`, `world-history-and-concept.schema.json`, and `continent.schema.json` plus initial `content/studio/world_history_and_concept.json` (Primordial Gods, Great Wars, 90 to 120 centimeter Character Scale Law, Starter Town bindings) and Continent documents (`canon`, `draft`, and `mystery` Fog of Lore examples) with deterministic validator `scripts/validate_studio_hierarchy.py`.
2. **District and Town or Hunting Area Topology, Ecology, and Map Compiler Upgrade**: Author `district.schema.json` and `town-or-hunting-area.schema.json`, populate canonical starter District and Town / Hunting Area / Dungeon nodes under `content/studio/`, and upgrade `scripts/compile_world_maps.py` to compile `content/maps/_manifest.runtime.json` and enforce all seven graph, scale, and mystery invariants.
3. **Four-Level Perspective Switcher (World History and Concept to Continent) in Observatory Web Studio**: Upgrade `scripts/catalog_explorer_web.py` with the sticky unabbreviated Perspective Bar, URL hash routing, the **World History and Concept** Cosmic and 90 to 120 centimeter Character Scale Visualizer view, and the **Continent** Macro Atlas view with `Canon`, `Draft`, and `Mystery (Fog of Lore)` visual treatments.
4. **District Connected Map Matrix and Town or Hunting Area plus Monster Detail Inspector**: Wire the **District** view (vertical Level-Band tabs `Levels 1 to 20` through `Levels 81 to 100`, monster portrait pinning onto connected two-dimensional map tiles, North / South / East / West portal bridges) and **Town or Hunting Area** view (topographic blueprint, three-dimensional asset kit lineup, and embedded `Monster/1035` detail sheet) directly to compiled `content/studio/` data.
5. **Human-in-the-Loop Core Rationale, Mystery Toggle, and Top-Down Generation Drawer**: Add `GET /api/studio/perspectives`, `POST /api/studio/rationale/update`, and `POST /api/studio/generate-children` to `scripts/catalog_explorer_web.py` with the persistent right-hand Core Rationale and Mystery Approval Drawer, automatic undo snapshots, and parent-canon gating before child generation.
