---
title: "Concept art: Ondo Forge boy and girl race turnarounds into the Game DB, old adult dwarf sheets marked old concept"
id: F-220
status: refined
from_idea: I-305
---

# Concept art: Ondo Forge boy and girl race turnarounds into the Game DB, old adult dwarf sheets marked old concept

## Problem

On 2026-11-15 the owner redesigned the Ondo Forge (dwarf) pair as children, a boy and a girl, and picked the final
race turnarounds in the character factory (asset-studio `atlas-3d-plan`): boy v1 and girl v2 (relayed by the
character session; the owner's words there: "M >> v1  F >> V2"). The Game DB still shows the adult pair
(`character-race-dwarf-kiln-artisan`) and the adult female base-body sheet
(`character-race-dwarf-ondo-base-body-female`). The owner's rule (2026-11-12): final concept images made with
ChatGPT also go into the Atlas Game DB, and he judges 3D builds against what the Game DB shows.

## Why now

The boy and girl 3D builds are judged against the Game DB race sheet, which today is the old adult design.

## Sketch

Content only, same shape as F-212 and F-213:

- Two new ids, each with `content/concept-art/images/<id>.webp` + `thumbs/<id>.webp` (source PNGs 1536x1024,
  copied from `recipes/ondo-boy-m/concept/race-turnaround-boy-v1.png` and
  `recipes/ondo-girl-f/concept/race-turnaround-girl-v2.png`):
  `character-race-dwarf-ondo-boy-turnaround`, `character-race-dwarf-ondo-girl-turnaround`.
- One entry per id in BOTH `content/concept-art/index.json` and `content/concept-art/art-briefs.json`: category
  `character`, zoneId `town-root-train-roundhouse`, loreRef `dwarf`, tool `chatgpt`, rights `concept-reference`,
  verdict `unreviewed`, prompt = the recorded ChatGPT message.
- The two old adult entries get `"concept": "legacy"` in `index.json` (the F-216 mechanism: files kept, hidden from
  the gallery, the lore page and default search).
- Out of scope: the bare body sheets of the boy and girl stay in the private factory repo (this repo is public);
  `game-client/assets/art/concept/race-dwarf.png` and the six-race lineup still show the adult design.
- No code change; `lore.test.mjs` pins the dwarf id list and is updated.

## Acceptance criteria

- [ ] Both images exist as webp, at most 800 KB and 2800 px on the longest side; each thumb is 960 px wide.
- [ ] `index.json` and `art-briefs.json` each hold both new ids with category `character` and loreRef `dwarf`.
- [ ] `character-race-dwarf-kiln-artisan` and `character-race-dwarf-ondo-base-body-female` carry `"concept": "legacy"` in `index.json`; their files stay.
- [ ] `cd scripts && npm test` and `node --test atelier/atlas-world-panels/tests/*.test.mjs` pass.
- [ ] `scripts/build_catalog_db.py` puts both new ids into table `concept_art`, and the Concept Art gallery shows the two new sheets and not the two old ones.
