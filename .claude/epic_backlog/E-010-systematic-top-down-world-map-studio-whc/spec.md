---
title: "Systematic Top-Down World & Map Studio (WHC -> C -> D -> T/A)"
id: E-010
status: epic
---

# Systematic Top-Down World & Map Studio (`WHC -> C -> D -> T/A`)

## Outcome

Atlas World has a deterministic, top-down **4-Level World, Map & Asset Building Studio** (`content/studio/` + `scripts/compile_world_maps.py` + `scripts/catalog_explorer_web.py`) that replaces the legacy bottom-up POC lore (`content/spine/` / `undertow` / `C02 Woolmarch` boilerplate) with a strict causal hierarchy:

1. **`[WHC]` World History & Concept (`content/studio/whc.json`)**:
   - Defines Primordial Gods (`GOD`), Great Wars / Cataclysms (`world_scars`), why players enter the world (`player_arrival_premise`), which Starter Towns `[T]` new players spawn into (`starter_town_bindings`), and the **90–120 cm (`1.05 m` reference) Cute Toddler/Kid Character Scale Law** (`grass <= 0.35m`, `bush <= 0.65m`, `stair_riser <= 0.18m`, `counter_height 0.55–0.65m`, `doorway >= 1.80m x 1.40m`, `highway >= 3.5m`).
2. **`[C]` Continent (`content/studio/continents/<continent_id>.json`)**:
   - Directly justified by `[WHC]` Gods and Great War scars (`parent_whc_causes`); defines macro climate, civilization/architecture style (with explicit 90–120cm scale adaptation), level band, inter-continent travel links, and child `[D]` District references.
3. **`[D]` District (`content/studio/districts/<continent_id>/<district_id>.json`)**:
   - Subdivides a Continent `[C]` into regional clusters with local conflict rationale, level band (`1-20`, `21-40`, `41-60`, `61-80`, `81-100`), ecological monster families, and an orthogonal 2D grid + bidirectional `N / S / E / W / DNG` portal adjacency graph of child `[T/A/DNG]` nodes.
4. **`[T / A]` Town | Hunting Area & Dungeon (`content/studio/nodes/<continent_id>/<district_id>/<node_id>.json` -> `content/maps/<map_id>.json`)**:
   - Leaf playable maps with starter town spawn rules, distinct topographic/3D terrain tiles, `N / S / E / W / Dungeon` neighbor portals, resident monster spawns (with spawn counts, elements, sizes, races, and item/card drop `%`), and 3D `.glb` asset kit bindings honoring the 90–120cm scale law.
5. **Intentional Mystery / Fog of Lore State Machine (`status: "canon" | "draft" | "mystery"`)**:
   - Every node across all 4 levels requires a non-empty `core_rationale` linked to its parent. Unbuilt regions remain intentional **`"mystery"` (Fog of Lore)** with an `in_world_rumor`, `visual_silhouette`, and `unanswered_question`—never low-quality filler slop—and compile to non-traversable Fog-of-Lore boundary portals (`gate_state: "fog_of_lore"`).
6. **Interactive 4-Perspective Studio UI (`scripts/catalog_explorer_web.py`)**:
   - Sticky top-down perspective switcher (`#whc` ➔ `#c=<id>` ➔ `#d=<id>` ➔ `#ta=<id>&monster=<id>`) with:
     - `[WHC]` Cosmic Timeline, War Scars graph, 90–120cm Toddler Scale Law visualizer, and Starter Town origins.
     - `[C]` Macro Continent Atlas with `Canon` (`🟢`), `Draft` (`🟡`), and `Mystery / Fog of Lore` (`🟣`) district overlays and War Scar overlays.
     - `[D]` Maxion-style (`rolth.maxion.gg/WorldMap`) + Lineage-style (`lineage.pmfun.com/list/map`) connected 2D map tile matrix with left sidebar Level-Band vertical tabs (`1-20`..`81-100`) and clickable Monster Portrait pinning across tiles.
     - `[T/A]` Local Map + 3D `.glb` kit inspector + `rolth.maxion.gg/Monster/1035` detail sheet (`192×192` portrait, 4 property pills, 4 stat boxes `LEVEL / HP / HIT-FLEE / EXP-JOB`, 2×5 Elemental Modifiers grid, and Item Drop Portrait Cards with `%` badges).
     - Persistent right-hand **Core Rationale & Mystery/Approval Drawer** (`POST /api/studio/rationale/update`, `POST /api/studio/generate-children`) enforcing parent-canon preconditions before downward AI generation.

---

## Architecture & Data Flow

```
[WHC] content/studio/whc.json
  │  (Primordial Gods, Great War Scars, 90-120cm Toddler Scale Law, Starter Town Bindings)
  ▼
[C]   content/studio/continents/<c_id>.json          [status: canon | draft | mystery]
  │  (Parent WHC Scar Cause, Macro Climate, Architecture Scale Adaptation, Level Band)
  ▼
[D]   content/studio/districts/<c_id>/<d_id>.json    [status: canon | draft | mystery]
  │  (Local Conflict, Level Band 1-20..81-100, Monster Families, 2D Grid & N/S/E/W/DNG Graph)
  ▼
[T/A] content/studio/nodes/<c_id>/<d_id>/<n_id>.json [status: canon | draft | mystery]
  │  (Starter Spawn, Terrain Tile, N/S/E/W Portals, Resident Monster Drops, 3D .glb Kit)
  ▼
scripts/compile_world_maps.py --check (Enforces INV-01 .. INV-07)
  ├──► content/maps/<map_id>.json            (Playable maps for canon/draft nodes)
  └──► content/maps/_manifest.runtime.json   (Starter spawns, portal routing, fog_of_lore locks)
```

---

## Slices

1. **WHC & Continent Studio Schemas + Mystery State Machine (`content/studio/`)**: Author `common-mystery.schema.json`, `whc.schema.json`, and `continent.schema.json` plus initial `content/studio/whc.json` (Gods, Great Wars, 90–120cm Toddler Scale Law, Starter Town bindings) and `[C]` Continent documents (`canon`, `draft`, and `mystery` Fog-of-Lore examples) with deterministic validator `scripts/validate_studio_hierarchy.py`.
2. **District `[D]` & Leaf Map `[T/A/DNG]` Topology, Ecology & Compiler Upgrade**: Author `district.schema.json` and `node-ta.schema.json`, populate canonical starter District `[D]` and `[T/A/DNG]` nodes under `content/studio/`, and upgrade `scripts/compile_world_maps.py` to compile `content/maps/_manifest.runtime.json` and enforce all 7 graph/scale/mystery invariants (`INV-01`..`INV-07`).
3. **4-Level Perspective Switcher (`#whc` ➔ `#c` ➔ `#d` ➔ `#ta`) in Observatory Web Studio**: Upgrade `scripts/catalog_explorer_web.py` with the sticky `#perspectiveBar`, URL/hash routing (`#whc`, `#c=<id>`, `#d=<id>`, `#ta=<id>&monster=<id>`), `[WHC]` Cosmic & 90–120cm Scale Visualizer view, and `[C]` Macro Continent SVG view with `Canon / Draft / Mystery` Fog-of-Lore visual treatments.
4. **District `[D]` Maxion/Lineage Connected Matrix & `[T/A]` Local Map + Monster/1035 Inspector**: Wire the `[D]` District view (vertical Level-Band tabs `1-20`..`81-100`, monster portrait pinning onto connected 2D map tiles, N/S/E/W portal bridges) and `[T/A]` view (topographic blueprint, 3D `.glb` kit lineup, and embedded `Monster/1035` detail sheet) directly to compiled `content/studio/` data.
5. **Human-in-the-Loop Core Rationale, Mystery Toggle & Top-Down AI Generation Drawer**: Add `GET /api/studio/perspectives`, `POST /api/studio/rationale/update`, and `POST /api/studio/generate-children` to `scripts/catalog_explorer_web.py` with the persistent right-hand Rationale & Gate Drawer, automatic undo snapshots, and parent-canon gating before child generation.
