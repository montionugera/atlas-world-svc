---
title: "Concept art: female Ondo base-body sheet (underwear turnaround) into the Game DB"
id: F-213
status: refined
from_idea: I-296
---

# Concept art: female Ondo base-body sheet (underwear turnaround) into the Game DB

## Problem

The character factory (asset-studio `atlas-3d-plan`) now builds each race from one bare base body per race and
gender, with clothes and hair as separate shells. The owner rejected the bare 3D bodies built by eye and chose a
drawn sheet as the reference for the body instead: the female turnaround of the Ondo Forge reference sheet
(`character-race-dwarf-kiln-artisan`), redrawn by ChatGPT to a grey sports top and shorts. On 2026-11-13 the owner
took the sixth redraw ("v6") as the base-body reference. The owner's rule (2026-11-12): final concept images made
with ChatGPT also go into the Atlas Game DB. Today the image is only in the factory repo
(`recipes/ondo-base-f/concept/body-sheet-v6.png`).

## Why now

The 3D base body is being built to this sheet now, and the owner judges builds against what the Game DB shows.

## Sketch

Content only, same shape as F-212:

- `content/concept-art/images/<id>.webp` + `content/concept-art/thumbs/<id>.webp` for one id:
  `character-race-dwarf-ondo-base-body-female` (1536x1024).
- One entry for the id in BOTH `content/concept-art/index.json` and `content/concept-art/art-briefs.json`:
  category `character`, zoneId `town-root-train-roundhouse`, loreRef `dwarf` (the same as the Ondo Forge sheet),
  tool `chatgpt`, rights `concept-reference`, verdict `unreviewed`, prompt = the recorded ChatGPT prompt of the
  sixth redraw, with one sentence on how the five earlier redraws led to it.
- No code change.

## Acceptance criteria

- [ ] The image exists as webp, at most 800 KB and 2800 px on the longest side; the thumb is 960 px wide.
- [ ] `index.json` and `art-briefs.json` each hold the id with category `character` and loreRef `dwarf`; the item count goes from 11 to 12.
- [ ] `cd scripts && npm test` and `node --test atelier/atlas-world-panels/tests/*.test.mjs` pass.
- [ ] `scripts/build_catalog_db.py` puts the id into table `concept_art`.
