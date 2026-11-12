---
title: "Concept art: male Furral galvanic scout sheet and turnaround into the Game DB"
id: I-295
status: idea
---

# Concept art: male Furral galvanic scout sheet and turnaround into the Game DB

## Problem

The character factory (asset-studio `atlas-3d-plan`) built its third character, a male Furral scout, from two
ChatGPT concept images. The owner's rule (2026-11-12): final concept images made with ChatGPT also go into the
Atlas Game DB. Today the Game DB holds one Furral image (`character-race-furral-electro-scout`, the race sheet);
the two images the 3D body was generated from are only in the factory repo.

## Why now

The paid 3D generation from these images is spent and the body is usable, so the images are final.

## Sketch

Content only, same shape as F-165:

- `content/concept-art/images/<id>.webp` + `content/concept-art/thumbs/<id>.webp` for two ids:
  `character-race-furral-galvanic-scout-sheet` (1086x1448) and
  `character-race-furral-galvanic-scout-turnaround` (1536x1024).
- One entry per id in BOTH `content/concept-art/index.json` and `content/concept-art/art-briefs.json`:
  category `character`, zoneId `town-cinnamon-mill-haven`, loreRef `furral`, tool `chatgpt`,
  rights `concept-reference`, verdict `unreviewed`, prompt = the recorded ChatGPT prompt.
- No code change.

## Acceptance criteria

- [ ] Both images exist as webp, each at most 800 KB and 2800 px on the longest side; both thumbs are 960 px wide.
- [ ] `index.json` and `art-briefs.json` each hold both ids with category `character` and loreRef `furral`; the item count goes from 9 to 11.
- [ ] `cd scripts && npm test` and `node --test atelier/atlas-world-panels/tests/*.test.mjs` pass.
- [ ] `scripts/build_catalog_db.py` puts both ids into table `concept_art`.
