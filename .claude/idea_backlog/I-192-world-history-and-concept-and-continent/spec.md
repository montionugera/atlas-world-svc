---
title: "World History and Concept and Continent Studio Schemas, Mystery State Machine, and Quality Checklists"
id: I-192
status: idea
epic: E-010
---

# World History and Concept and Continent Studio Schemas, Mystery State Machine, and Quality Checklists

## Summary

Establish the clean-slate `content/studio/` Layer 1 (**World History and Concept**) and Layer 2 (**Continent**) JSON schemas, data documents, **Intentional Mystery / Fog of Lore** state machine (`canon | draft | mystery`), and **Five-Pillar Step-by-Step Quality, Continuity, Consistency, and Fantasy Checklist**, along with the deterministic validator `scripts/validate_studio_hierarchy.py` and its unit test suite `tests/test_validate_studio_hierarchy.py`.

## Acceptance criteria

- [ ] `content/studio/schemas/common-mystery.schema.json` defines the shared rationalized node envelope (`id`, `name`, `status` in `["canon", "draft", "mystery"]`, mandatory `core_rationale` >= 20 characters, `mystery_hook` with `in_world_rumor`, `visual_silhouette`, `unanswered_question` required when `status == "mystery"`, and the five-pillar `quality_checklist` object with `causal_continuity`, `fantasy_and_wonder`, `character_scale_consistency`, `spatial_and_ecological_consistency`, and `intentional_mystery_discipline`).
- [ ] `content/studio/schemas/world-history-and-concept.schema.json` and `content/studio/world_history_and_concept.json` define the singleton **World History and Concept** constitution (`character_scale_law` with `height_range_meters: [0.90, 1.20]`, `reference_height_meters: 1.05`, `max_grass_height_meters <= 0.35`, `max_bush_height_meters <= 0.65`, `max_stair_riser_meters <= 0.18`, `prop_counter_height_meters: [0.55, 0.65]`, `min_doorway_height_meters >= 1.80`, `min_highway_corridor_width_meters >= 3.5`, `player_arrival_premise`, `primordial_gods`, `historical_epochs` with `world_scars`, `starter_town_bindings`, and `quality_checklist`) with zero references to deprecated proof-of-concept lore (`undertow`, `C02 Woolmarch`, `STAGE_0`).
- [ ] `content/studio/schemas/continent.schema.json` and three initial Continent files under `content/studio/continents/` (`continent-01-hearthbloom-basin.json` with `status: "canon"`, `continent-02-clockwork-steppe.json` with `status: "draft"`, and `continent-03-shattered-halo.json` with `status: "mystery"`) demonstrate parent World History scar inheritance, 90 to 120 centimeter architectural adaptation, inter-continent travel links, and the five-pillar quality checklist.
- [ ] `python3 scripts/validate_studio_hierarchy.py --check` exits `0` on the repository's `content/studio/` tree and deterministically rejects invalid parent references, missing `core_rationale`, missing `mystery_hook` on `"mystery"` nodes, `"canon"` children under non-`"canon"` parents, unchecked `quality_checklist` items on `"canon"` nodes, violations of the 90 to 120 centimeter character scale law, or legacy proof-of-concept terms.
- [ ] `python3 -m unittest tests/test_validate_studio_hierarchy.py` passes all positive and negative validation tests.
