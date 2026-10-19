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
6. **Mandatory Step-by-Step Quality, Continuity, Consistency, and Fantasy Checklist (`quality_checklist`)**:
   - Every node across all four levels embeds a structured **Quality, Continuity, Consistency, and Fantasy Checklist** enforced both by `scripts/validate_studio_hierarchy.py --check` (automated schema and compiler gates) and the right-hand **Core Rationale and Quality Gate Drawer** in `scripts/catalog_explorer_web.py` (human creative sign-off). No node can promote to `"canon"` or unlock downward child generation until 100% of its level-specific checklist items pass.
7. **Interactive Four-Perspective Studio User Interface (`scripts/catalog_explorer_web.py`)**:
   - Sticky top-down perspective switcher using full, unabbreviated labels and routes (`#perspective=world-history-and-concept` ➔ `#perspective=continent&continent=<id>` ➔ `#perspective=district&district=<id>` ➔ `#perspective=town-or-hunting-area&map=<id>&monster=<id>`) with:
     - **World History and Concept Perspective**: Cosmic Timeline, Great War Scars graph, 90 to 120 centimeter Character Scale Law visualizer, and Starter Town origins.
     - **Continent Perspective**: Macro Continent Atlas with `Canon`, `Draft`, and `Mystery (Fog of Lore)` District overlays and Great War Scar overlays.
     - **District Perspective**: Maxion-style (`rolth.maxion.gg/WorldMap`) and Lineage-style (`lineage.pmfun.com/list/map`) connected two-dimensional map tile matrix with left sidebar Level-Band vertical tabs (`Levels 1 to 20` through `Levels 81 to 100`) and clickable Monster Portrait pinning across tiles.
     - **Town and Hunting Area Perspective**: Local Map and three-dimensional asset kit inspector plus embedded `rolth.maxion.gg/Monster/1035` detail sheet (`192×192` portrait, four property pills, four stat boxes `Level / Health Points / Hit and Flee / Base and Job Experience`, `2×5` Elemental Modifiers grid, and Item Drop Portrait Cards with drop percentage badges).
     - Persistent right-hand **Core Rationale, Quality Checklist, and Mystery Approval Drawer** (`POST /api/studio/rationale/update`, `POST /api/studio/generate-children`) enforcing parent-canon and checklist preconditions before downward artificial intelligence generation.

---

## Step-by-Step Quality, Continuity, Consistency, and Fantasy Checklist (Per Perspective)

Every node at every layer is evaluated against **five mandatory pillars** before it can be promoted from `Draft` to `Canon` or spawn child nodes:
1. **Causal Continuity (Parent-to-Child Thread)**: Does this node directly inherit and express the physical scar, history, and logic of its parent layer without contradiction?
2. **Fantasy & Wonder (Anti-Generic Hook)**: Does this place evoke a distinct, memorable high-fantasy image (a silhouette, a living mechanism, or a divine relic) rather than generic boilerplate medieval filler?
3. **90 to 120 Centimeter Toddler and Kid Scale Consistency**: Is the world physically built for a 1.05-meter character (unobstructed camera sightlines, knee-high grass, chest-high bushes, low shop counters, gentle stair risers, and wide roads)?
4. **Spatial & Ecological Consistency**: Do adjacent regions, climates, monster families, item drops, and level bands transition believably without jarring spikes or broken portals?
5. **Intentional Mystery Discipline (No Filler Slop)**: Are unfinished edges sealed with intriguing in-world rumors and visual silhouettes (`status: "mystery"`) rather than copy-pasted placeholder maps?

### Level 1 Checklist — World History and Concept
- [ ] **Fantasy Premise & Player Identity**: Explains clearly *who* the 90 to 120 centimeter players are, *why* their small stature matters in this world, and *what* inciting phenomenon brings them into the Starter Towns now.
- [ ] **Divine & Historical Causality**: Every Primordial God and Great War epoch leaves at least one concrete planetary `geographical_scar` and `architectural_imprint` that directly births a Continent.
- [ ] **90 to 120 Centimeter Character Scale Law Locked**: Explicitly sets `height_range_meters: [0.90, 1.20]`, `reference_height_meters: 1.05`, `max_grass_height_meters <= 0.35`, `max_bush_height_meters <= 0.65`, `max_stair_riser_meters <= 0.18`, `prop_counter_height_meters: 0.55 to 0.65`, and `min_highway_corridor_width_meters >= 3.5`.
- [ ] **Starter Town Arrival Continuity**: Every Starter Town binding connects the cosmic arrival premise to a specific, safe Level 1 Continent, District, and Town.
- [ ] **Zero Legacy Boilerplate**: Contains zero references to deprecated proof-of-concept lore (`undertow`, `C02 Woolmarch`, `STAGE_0`).

### Level 2 Checklist — Continent
- [ ] **Parent Scar Inheritance (Continuity)**: Traces directly to at least one `Canon` Primordial God and Great War scar in `world_history_and_concept.json` (`parent_world_history_causes`).
- [ ] **Macro Fantasy Silhouette & Climate**: Defines a memorable macro biome, skybox palette, and weather phenomenon shaped by its parent God or War Scar (not just "generic green plains").
- [ ] **Civilization & Toddler-Scale Architecture**: Specifies how local mortals build structures in response to the Continent's climate and how doorways (`>= 1.80 meters`), counters (`0.55 to 0.65 meters`), and steps (`<= 0.18 meters`) adapt to 90 to 120 centimeter characters.
- [ ] **Inter-Continent Travel Consistency**: Declares believable travel hubs (ferries, airships, root-trains, bridges, or rifts) connecting to other Continents, with `locked_by_mystery` reasons where target Continents are still uncharted.
- [ ] **Mystery Continent Integrity**: If `status == "mystery"`, defines `in_world_rumor`, `visual_silhouette`, and `unanswered_question` without generating empty filler Districts.

### Level 3 Checklist — District
- [ ] **Continent-to-District Continuity**: Explains how the parent Continent's macro climate and war scar create this District's specific geography and `local_conflict`.
- [ ] **Orthogonal Grid & Portal Symmetry (Consistency)**: Surface Town and Hunting Area nodes occupy unique `[column, row]` coordinates on the District grid; all `North / South / East / West / Dungeon` portal edges are bidirectional and geometrically aligned.
- [ ] **Smooth Level-Band & Pacing Flow**: Node level ranges stay within the District's `level_band` (`Levels 1 to 20` through `Levels 81 to 100`), and adjacent open maps never jump by more than 15 levels.
- [ ] **Ecological Family Cohesion (Fantasy & Consistency)**: Resident monster families (`ecological_monster_families`) match the District's biome and conflict rationale (no random lava demons in a glacial meltwater meadow without a specific lore scar).
- [ ] **Fog of Lore Boundary Discipline**: Every border touching an unbuilt `mystery` tile compiles a physical `fog_of_lore` barricade portal with an evocative in-world `lock_reason`.

### Level 4 Checklist — Town, Hunting Area, and Dungeon
- [ ] **Distinct Topographic & Visual Identity**: Each map has a unique terrain silhouette, elevation profile, water/road layout, and distinct preview thumbnail (never identical green minimaps with overlapping yellow circles at `(0,0)`).
- [ ] **90 to 120 Centimeter Scale & Sightline Verification**: Ground foliage (`<= 0.35m` grass, `<= 0.65m` bushes), terrace steps (`<= 0.25m`), main roads (`>= 12.0m` cart road / `>= 4.0m` footpath), and three-dimensional `.glb` props guarantee zero camera occlusion for a 1.05-meter character.
- [ ] **Portal & Safe-Zone Playability**: Starter Towns have a peaceful `safe_zone_radius_meters` with zero aggressive monster spawns inside; all `North / South / East / West / Dungeon` trigger boxes and arrival points are clear of static obstacle colliders.
- [ ] **Monster & Item Drop Fantasy Consistency**: Every resident monster exists in `bestiary.json`, belongs to the parent District's ecological families, has complete stats (`Level`, `Health Points`, `Hit and Flee`, `Experience`, `Element`, `Size`, `Race`), and drops thematic items plus a Monster Card with valid drop percentages (`0.001% to 100%`).
- [ ] **Runtime Compilation Cleanliness**: Compiles cleanly into `content/maps/<map_id>.json` and `content/maps/_manifest.runtime.json` with zero warnings from `scripts/compile_world_maps.py --check`.

---

## Architecture and Data Flow

```
[World History and Concept] content/studio/world_history_and_concept.json
  │  (Primordial Gods, Great War Scars, 90-120cm Character Scale Law, Starter Town Bindings)
  │  ✓ Gate 1: World History Quality, Scale & Fantasy Checklist
  ▼
[Continent]                 content/studio/continents/<continent_id>.json
  │  (Parent World History Cause, Macro Climate, Architecture Scale Adaptation, Level Band)
  │  ✓ Gate 2: Continent Continuity, Architecture & Mystery Checklist
  ▼
[District]                  content/studio/districts/<continent_id>/<district_id>.json
  │  (Local Conflict, Level Band 1-20..81-100, Monster Families, 2D Grid & North/South/East/West/Dungeon Graph)
  │  ✓ Gate 3: District Grid Symmetry, Ecology & Pacing Checklist
  ▼
[Town / Hunting Area]       content/studio/nodes/<continent_id>/<district_id>/<node_id>.json
  │  (Starter Spawn, Terrain Tile, North/South/East/West Portals, Resident Monster Drops, 3D Asset Kit)
  │  ✓ Gate 4: Local Map Sightline, Bestiary Drops & Runtime Compilation Checklist
  ▼
scripts/compile_world_maps.py --check
  ├──► content/maps/<map_id>.json            (Playable maps for Canon and Draft nodes)
  └──► content/maps/_manifest.runtime.json   (Starter spawns, portal routing, Fog of Lore locks)
```

---

## Slices

1. **World History and Concept and Continent Studio Schemas, Mystery State Machine, and Quality Checklists**: Author `common-mystery.schema.json` (including the 5-pillar `quality_checklist` contract), `world-history-and-concept.schema.json`, and `continent.schema.json` plus initial `content/studio/world_history_and_concept.json` and Continent documents (`canon`, `draft`, and `mystery` Fog of Lore examples) with deterministic validator `scripts/validate_studio_hierarchy.py`.
2. **District and Town or Hunting Area Topology, Ecology, and Map Compiler Upgrade**: Author `district.schema.json` and `town-or-hunting-area.schema.json`, populate canonical starter District and Town / Hunting Area / Dungeon nodes under `content/studio/`, and upgrade `scripts/compile_world_maps.py` to compile `content/maps/_manifest.runtime.json` and enforce all seven graph, scale, continuity, and mystery invariants.
3. **Four-Level Perspective Switcher (World History and Concept to Continent) in Observatory Web Studio**: Upgrade `scripts/catalog_explorer_web.py` with the sticky unabbreviated Perspective Bar, URL hash routing, the **World History and Concept** Cosmic and 90 to 120 centimeter Character Scale Visualizer view, and the **Continent** Macro Atlas view with `Canon`, `Draft`, and `Mystery (Fog of Lore)` visual treatments.
4. **District Connected Map Matrix and Town or Hunting Area plus Monster Detail Inspector**: Wire the **District** view (vertical Level-Band tabs `Levels 1 to 20` through `Levels 81 to 100`, monster portrait pinning onto connected two-dimensional map tiles, North / South / East / West portal bridges) and **Town or Hunting Area** view (topographic blueprint, three-dimensional asset kit lineup, and embedded `Monster/1035` detail sheet) directly to compiled `content/studio/` data.
5. **Human-in-the-Loop Core Rationale, Quality Checklist Gate, Mystery Toggle, and Top-Down Generation Drawer**: Add `GET /api/studio/perspectives`, `POST /api/studio/rationale/update`, and `POST /api/studio/generate-children` to `scripts/catalog_explorer_web.py` with the persistent right-hand Core Rationale, Interactive 5-Pillar Quality Checklist, and Mystery Approval Drawer, automatic undo snapshots, and parent-canon plus checklist gating before child generation.
