---
title: "Catalog DB loads new canon (glossary.json) and concept-art index as tables"
id: F-189
status: refined
from_idea: I-272
---

# Catalog DB loads new canon (glossary.json) and concept-art index as tables

## Problem

`scripts/build_catalog_db.py` (-> `build/catalog.sqlite`) reads the retired Millcross story and `world_history_and_concept.json`, but not `content/studio/canon/glossary.json` (the new canon: 9 chapters, Yara, 6 gods, regions, races, NPCs, Wardens) nor `content/concept-art/index.json` (9 images after F-187). The Game DB does not reflect the new lore or the art.

## Sketch

- New table `canon_entries(kind, id, name, parent_id, status, raw_json)` filled from glossary.json: chapter, god, region, race, npc, landmark, warden, title, retired_name.
- New table `concept_art(id, title, category, zone_id, lore_ref, file, thumb, caption, raw_json)` from concept-art/index.json. DB holds records; image bytes stay files.
- `lore_ref`/`zone_id` are kept as given; a `canon_art_links` view/check reports art whose ref matches no canon id (reported, not failed).
- Add the 2026-11-07 ChatGPT decisions to glossary.json where missing: birth token is story-only (no mechanics, no quest checks it); Volunteers' Road memorials are canon; Yara wording is "she chose the child in front of her" (never "mother"); no volunteer-sealed god (Expansion II seed only); Ch VII village choice is design intent only, not launch. Then run `node scripts/canon_card.mjs` and `scripts/check_canon_names.mjs`.
- Out of scope: Library art download (needs owner keep/replace marks), dropping Millcross story rows.

## Acceptance criteria

- [ ] Running `python3 scripts/build_catalog_db.py` creates `canon_entries` with 9 chapters, 6 gods, 6 races and `SELECT count(*) > 0` for every kind.
- [ ] `concept_art` row count equals the `items` length of `content/concept-art/index.json` (9).
- [ ] glossary.json contains the five decision statements above; `check_canon_names.mjs` passes.
- [ ] A unit test builds the DB from fixtures and asserts both tables; Gate 1 (`psrw ship`) passes.
