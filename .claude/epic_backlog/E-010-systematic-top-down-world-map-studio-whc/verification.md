---
title: "Systematic Top-Down World & Map Studio (WHC -> C -> D -> T/A)"
id: E-010
---

# How we will know E-010 works

Prose for humans. `scripts/epic-check.sh` implements these assertions; the
toolkit never parses this file.

## Assertions

1. **Top-Down Hierarchy & Mystery State Machine (`WHC -> C -> D -> T/A`)**: `python3 scripts/validate_studio_hierarchy.py --check` exits `0`, verifying that `content/studio/whc.json`, `content/studio/continents/*.json`, `content/studio/districts/**/*.json`, and `content/studio/nodes/**/*.json` validate against their JSON schemas, every node has a non-empty `core_rationale` (`>= 20` chars) and valid parent FK, `"mystery"` nodes include `mystery_hook` (`in_world_rumor`, `visual_silhouette`, `unanswered_question`), and no `"canon"` child exists under a `"draft"` or `"mystery"` parent.
2. **90–120 cm Cute Toddler/Kid Character Scale Law**: `content/studio/whc.json` codifies `height_range_m: [0.90, 1.20]` (`reference_height_m: 1.05`) and environment guardrails (`max_grass_height_m <= 0.35`, `max_bush_height_m <= 0.65`, `max_stair_riser_m <= 0.18`, `min_doorway_height_m >= 1.80`, `min_highway_corridor_width_m >= 3.5`), and `python3 scripts/compile_world_maps.py --check` verifies all compiled `[T/A]` maps honor these bounds.
3. **Deterministic Map Compilation & 7 Graph Invariants (`INV-01`..`INV-07`)**: `python3 scripts/compile_world_maps.py --check` exits `0` and generates `content/maps/_manifest.runtime.json` with valid Starter Town spawn bindings (`defaultStarterMapId`, `starterSpawns`), orthogonal 2D district grids, bidirectional `N/S/E/W/DNG` portals, BFS reachability from Starter Town `[T]` to all `"canon"`/`"draft"` nodes, level-band continuity, and `"fog_of_lore"` boundary portals for adjacent `"mystery"` nodes.
4. **4-Level Perspective Switcher & Benchmarks in Observatory (`scripts/catalog_explorer_web.py`)**: `GET /api/studio/perspectives` returns 200 OK with the 4-tier `WHC -> C -> D -> T/A` tree, and the web UI renders `#whc` (Gods, Great Wars, 90–120cm scale visualizer), `#c=<id>` (Macro Continent with Canon/Draft/Mystery overlays), `#d=<id>` (Maxion vertical Level-Band tabs `1-20`..`81-100` + monster portrait pinning on connected 2D map tiles + Lineage N/S/E/W links), and `#ta=<id>&monster=<id>` (local map inspector + `Monster/1035` detail sheet with `192×192` portrait, 4 stat boxes, 2×5 elemental grid, and drop `%` cards).
5. **Core Rationale & Gated Downward AI Generation API**: `POST /api/studio/rationale/update` persists status (`canon | draft | mystery`) and `core_rationale` edits with automatic undo snapshots while rejecting `canon` promotion if the parent is not `canon`; `POST /api/studio/generate-children` returns `400` when the parent node is `mystery` or lacks approved rationale, and succeeds (`200`) when the parent is `canon`.
