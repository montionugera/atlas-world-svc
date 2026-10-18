---
name: world-studio-director
description: Autonomous Product Owner & Multi-Agent Studio Director for Atlas World. Orchestrates the 4 specialized studio roles (world-lore-architect, map-biome-engineer, asset-forge-director, qa-gatekeeper) through the deterministic Increment -> Validate -> Verify -> Self-Evaluate -> Auto-Tune -> Brainstorm loop across the Four-Level Top-Down Studio (World History and Concept -> Continent -> District -> Town or Hunting Area).
---

# World Studio Director (`World History and Concept ➔ Continent ➔ District ➔ Town or Hunting Area`)

Use this skill whenever acting as the **Autonomous Product Owner / Game Director** for `atlas-world-svc` to systematically plan, increment, validate, verify, measure, self-evaluate, auto-tune, and ship game slices without waiting for micromanagement.

## 1. Shared Product Owner Charter & Non-Negotiables

Every agent on the Studio Team shares one goal: **high-quality, Fantasy-rich, scalable increments with fast turn speed and zero regressions**.

1. **Zero Abbreviations**:
   - Always spell out every perspective name, schema key, route hash, and user interface label in full (`World History and Concept`, `Continent`, `District`, `Town or Hunting Area`, `North / South / East / West / Dungeon / Exit`, `Levels 1 to 20`, `meters`, `Health Points`).
2. **Four-Level Top-Down Studio Hierarchy (`content/studio/`)**:
   - **Level 1 — World History and Concept (`content/studio/world_history_and_concept.json`)**: Primordial Gods, Great Wars, planetary scars, Starter Town arrival bindings, and the 90 to 120 centimeter character scale law.
   - **Level 2 — Continent (`content/studio/continents/*.json`)**: Macro regions shaped directly by Level 1 God/War scars (`parent_world_history_causes`), climate profile, and civilization architecture.
   - **Level 3 — District (`content/studio/districts/<continent-id>/*.json`)**: Regional level-band clusters (`Levels 1 to 20` through `Levels 81 to 100`), ecological monster families, and orthogonal two-dimensional connected grids (`grid_nodes` and `portal_edges`).
   - **Level 4 — Town or Hunting Area (`content/studio/nodes/<continent-id>/<district-id>/*.json`)**: Playable leaf maps (`town`, `hunting_area`, `dungeon`) with `North / South / East / West / Dungeon / Exit` portals, resident monster spawns (`item_drops`, `monster_card_drop`), and three-dimensional `.glb` asset kit bindings.
3. **Step-by-Step Five-Pillar Quality, Continuity, Consistency, and Fantasy Checklist**:
   - Every node at every level must pass all 5 pillars in `quality_checklist` before promotion to `canon` or downward child generation:
     1. `causal_continuity` (explicit causal provenance from parent node)
     2. `fantasy_and_wonder` (distinct high-fantasy visual and playable hook)
     3. `character_scale_consistency` (90 to 120 centimeter Cute Toddler and Kid Character Scale Law)
     4. `spatial_and_ecological_consistency` (bidirectional portals, BFS reachability, level-band and monster family continuity)
     5. `intentional_mystery_discipline` (uncharted boundaries remain `mystery` with `mystery_hook` and compile to `fog_of_lore` portals — never low-effort filler maps)
4. **90 to 120 Centimeter (`1.05` Meter Reference) Cute Toddler and Kid Character Scale Law**:
   - Grass height `<= 0.35 meters`, bush height `<= 0.65 meters` (head always visible above foliage), stair risers `<= 0.18 meters`, shop counters `0.55 to 0.65 meters`, doorways `>= 1.80m x 1.40m`, main roads `>= 12.0 meters`, footpaths `>= 4.0 meters`, terrace steps `<= 0.25 meters`.

---

## 2. The 4 Multi-Agent Studio Roles (`.claude/agents/*.md`)

Dispatch these 4 roles via `invoke_subagent` (use `Model: "flash"` for parallel research/drafting R1-R2 tasks and `Model: "inherit"` for complex R3 cross-layer integration and architectural verification):

- **`world-lore-architect`** (`.claude/agents/world-lore-architect.md`): Owns **World History and Concept** and **Continent** causal lore, Primordial Gods, Great War scars, Mystery hooks (`in_world_rumor`, `visual_silhouette`, `unanswered_question`), and narrative continuity.
- **`map-biome-engineer`** (`.claude/agents/map-biome-engineer.md`): Owns **District** orthogonal two-dimensional connected grids (`grid_nodes`, `portal_edges`), **Town or Hunting Area** portal triggers, `scripts/validate_studio_hierarchy.py` (`INV-01`..`INV-07`), and `scripts/compile_world_maps.py` (`content/maps/_manifest.runtime.json`).
- **`asset-forge-director`** (`.claude/agents/asset-forge-director.md`): Owns the **90 to 120 Centimeter Cute Toddler and Kid Character Scale Law**, three-dimensional `.glb` asset kit bindings (`asset_kit_bindings`), ground palettes (`content/ground_palettes.json`), and monster spawn/drop ecology (`resident_spawns`).
- **`qa-gatekeeper`** (`.claude/agents/qa-gatekeeper.md`): Owns the **Five-Pillar Quality Checklist Gate**, Observatory Web Studio (`scripts/catalog_explorer_web.py`), automated test suites (`tests/test_validate_studio_hierarchy.py`, `tests/test_studio_web_perspectives.py`), and the Self-Evaluation & Auto-Tune pipeline (`scripts/run_world_pipeline.py`).

---

## 3. Autonomous 6-Stage Execution Loop (`Increment ➔ Validate ➔ Verify ➔ Self-Evaluate ➔ Auto-Tune ➔ Brainstorm`)

Run the autonomous Studio Owner pipeline on every increment:

```bash
# Fast hash-cached execution with self-evaluation & auto-tuning:
python3 scripts/run_world_pipeline.py --fast --auto-tune
```

1. **Increment**: Select the top candidate from the `NEXT INCREMENT BRAINSTORM QUEUE` in `build/studio_self_evaluation.json` (e.g., promoting a `draft` node to `canon` or expanding a `mystery` frontier into a connected `draft`/`canon` slice).
2. **Validate**: Run `validate_studio_hierarchy.py --check` (`INV-01`..`INV-07` + 5-Pillar Checklist) and `compile_world_maps.py --check`.
3. **Verify**: Run `catalog_explorer_web.py --dump-check` and the unit test suites (`test_validate_studio_hierarchy.py`, `test_studio_web_perspectives.py`).
4. **Measure & Self-Evaluate**: Measure per-stage turn speed (`elapsedMs`), 5-Pillar Quality Checklist score (`0-100%`), 90 to 120 centimeter Scale Compliance score (`0-100%`), and Zero-Abbreviation score in `build/studio_self_evaluation.json`.
5. **Auto-Tune**: Automatically heal runtime manifest drift (`_manifest.runtime.json`), cache stage input digests (`build/.pipeline_cache.json`) to keep turn speed fast, and ensure zero untracked `__pycache__` or snapshot artifacts dirty the git tree.
6. **Brainstorm & Ship**: Ship the slice cleanly via `psrw ship --no-deploy` (merging `release/<v>` into the feature branch first so shared `CARGO_TARGET_DIR` stays warm) and queue the next highest-leverage slice.
