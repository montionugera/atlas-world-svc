# Epic Implementation Plan: Lineage II (`l2sanctum.net`) Multi-Scale Composable Map Pipeline (Phases A–D)

**Date**: 2026-10-25  
**Spec Reference**: [2026-10-25-lineage2-grade-multiscale-map-and-biome-pipeline-design.md](file:///Users/pasitnusso/workspace/repos/atlas-world-svc/docs/superpowers/specs/2026-10-25-lineage2-grade-multiscale-map-and-biome-pipeline-design.md)  
**Target Repository**: `atlas-world-svc`  
**Execution Strategy**: Multi-Agent Parallel Execution (`invoke_subagent`) + Final Unified Verification (`Gate V-16`)

---

## 1. Epic Goal & Scope

Deliver all 4 remaining phases of the Lineage II (`l2sanctum.net/wiki/freya/quests/*`) multi-scale cartographic pipeline as one unified Epic:

1. **Phase A — Per-Biome Top-Down Cartographic Signatures Across All 32 Field & Fortress Zones**:
   - Enrich `content/studio/map_feature_layers.json` with `zone_biome_assignments` mapping every one of the 24 Field Hunting Areas and 8 Fortress/Harbor zones to one of the 10 canonical biomes (`grassland`, `swamp`, `canyon`, `rainforest`, `valley`, `volcano_cave`, `god_valley`, `sea_cave`, `underground_cave`, `giant_tower`) + per-biome SVG palette & feature generators.
   - Upgrade `buildFieldComposableLayerInnerSvg(layerId, entry, bp, isFort)` in `scripts/catalog_explorer_web.py` so each zone's 6 composable layers (`L0` DEM/Relief, `L1` Hydrology/Magma/Sulfur Springs, `L2` Highland Cliffs/Snow Ridges/Basalt Calderas/Canyon Switchbacks, `L3` Roads & Walkways, `L4` Biome Foliage/Pine/Spore/Crystal Clusters, `L5` Architectural Ruins & `l2sanctum.net` Golden Quest Rings) dynamically render its assigned biome theme (`resolveFieldZoneBiomeId(entry)`).

2. **Phase B — Interactive Studio Map Layer Authoring & Disk Persistence (`POST /api/studio/map-layers`)**:
   - Add a `do_POST` route `/api/studio/map-layers` in `Handler` (`scripts/catalog_explorer_web.py`) and helper `save_studio_map_feature_layers_patch(payload)` that persists incremental layer features (`walkways`, `rivers`, `trees`, `quest_rings`) or layer visibility directly into `content/studio/map_feature_layers.json` without rebuilding the full map.
   - Add client-side `saveIncrementalComposableFeaturesToDisk()` and `undoLastIncrementalComposableFeature()` + UI buttons (`💾 Save Layer Edits to JSON`, `↩️ Undo Last Feature`) in the Field Tactical Blueprint 6-layer panel.

3. **Phase C — 2D-to-3D Composable Layer Parity (`buildAtlas3dBlockoutScene` & Godot `.glb` Export)**:
   - Upgrade `buildAtlas3dBlockoutScene()` (`context === 'field'`) in `scripts/catalog_explorer_web.py` so the 3D Field Blockout scene and exported `.glb` include meshes corresponding to the 6 composable layers:
     - `Field_River_Channel_1` (`part: 'composable_river'`, carved water ribbon)
     - `Field_Bridge_Sluice_1` (`part: 'composable_bridge'`, stone bridge deck)
     - `Field_Highland_Terrace_NW` & `Field_Highland_Terrace_SE` (`part: 'composable_highland'`, terraced cliff plateaus)
     - `Field_Small_Walkway_*` (`part: 'composable_walkway'`, 3.8m secondary footpaths)
     - `Field_Tree_Canopy_*` (`part: 'composable_tree'`, top-down tree canopy cones)
     - `Field_Watchtower_Ruin_1` & `Field_Quest_Ring_1` (`part: 'composable_ruin'` / `'composable_quest_ring'`)

4. **Phase D — Interactive `l2sanctum.net` Quest Pin Drill-Down & Optical Sub-Map Cross-Fade Transition**:
   - Render clickable `l2sanctum.net` golden double-ring quest pins on Field Tactical Blueprints and Overland Regional maps linked to `starter_quest_codex.quests` (`selectAtlasQuestPin(questId)`), showing giver NPC, target monsters, drop rate, and reward in the POI drawer.
   - Add smooth `220ms` optical SVG viewport cross-fade/zoom animation (`triggerSmoothSubMapTransitionCss()`) when stepping between Overland (`1.0×` / `2.6×`), Field (`4.8×`), Town (`5.2×`), and Dungeon (`6.0×`).

5. **Phase E — Automated Guardrail `V-16` & Pytest Suite**:
   - Add **Gate `V-16_epic_biome_signatures_persistence_3d_parity_and_quest_pins`** in `scripts/probes/atlas_ux_probe.py` and `test_epic_phases_a_to_d_biome_persistence_3d_and_quest_pins` in `tests/test_studio_web_perspectives.py`.
