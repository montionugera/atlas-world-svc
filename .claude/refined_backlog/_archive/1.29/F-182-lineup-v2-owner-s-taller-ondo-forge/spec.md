---
title: "Lineup v2: owner's taller Ondo Forge"
id: F-182
from_idea: I-263
status: refined
---

# I-263 Lineup v2: owner's taller Ondo Forge

## Goal
Replace the F-181 six-race lineup with the owner's edited version from the Art Direction Setup chat. The owner asked "Dwarf is too small" and ChatGPT redrew the lineup with the Ondo Forge pair taller. Same 12 characters, same order, no text.

## Scope
- Swap `content/concept-art/images|thumbs/character-race-lineup-six-races.webp` for the new image, upscaled with 4x-UltraSharp at 2x (ComfyUI on mont-pc), kept at 2800 px wide and 800 KB or less.
- Record the owner's edit in the index and brief prompt and the caption: Ondo Forge redrawn taller.
- Measured heights of the new image, share of frame height ground to crown: Daro Guard M 70 / F 65; Maro Folk, Linde Folk, Silme Seers M 60 / F 54-55; Tava Kin M 53 / F 48; Ondo Forge M 49 / F 45. Ondo Forge man is now about 81 percent of the Maro Folk man (F-181 working brief: 68 percent).
- Out of scope: covering up the Silme Seers and Daro Guard women (asked separately, no owner answer yet).

## Acceptance criteria
- [ ] New webp is the owner's edited image (taller Ondo Forge pair), 12 figures, no text, width 2800 or less, size 800 KB or less; thumb regenerated the same way as F-181.
- [ ] index.json and art-briefs.json entries mention the owner's edit; card count stays 25; concept-arts tests pass.
- [ ] Gate 1 green; review link http://localhost:8789/?tab=concept-arts&category=character&id=character-race-lineup-six-races shows the new image.

## Scope added by the owner mid-feature (2026-11-07)
"let update the outdated char's images + race info as well", then "use pre generated".
- [ ] The 6 race character cards use the owner's labelled reference sheets from the ChatGPT image library (Maro 16, Ondo 22, Linde 15, Daro 08, Tava 20, Silme 13 in the 2026-11-07 library download), upscaled to 2800x1867, under 800 KB; card ids, files, zoneId and loreRef unchanged; titles and captions use canon race names; aspect 3:2.
- [ ] Lore "Mortal Lineages" race records (`world_history_and_concept.json` race_taxonomy, the 6 playable races) show canon names, canon home town names and canon themes; retired words (Tontatta, Mink, Electro, Sulong, One Piece) gone; ids and graph node ids unchanged.
- Follow-up, not in scope: world-graph town nodes still carry old names (town-lantern-hollow etc.), so card map pins show old town names.
