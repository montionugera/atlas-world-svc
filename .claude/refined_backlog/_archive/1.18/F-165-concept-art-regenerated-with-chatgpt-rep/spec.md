---
title: "Concept art regenerated with ChatGPT: replace all 24 images, queen boss redesign"
id: F-165
status: refined
from_idea: I-245
---

# Concept art regenerated with ChatGPT: replace all 24 images, queen boss redesign

## Problem

The 24 images in `content/concept-art/` come from Google Flow. The owner compared the same prompts in ChatGPT and found them "a lot richer" and closer to the target: Ragnarok-style characters, Lineage 2-style structures, bosses and mobs, Genshin tone and detail. Only 3 of 24 exist from ChatGPT, and none has shipped. The MVP boss sheet also predates the owner's 2026-11-01 redesign: thin insect torso on a huge segmented abdomen with six jointed legs, no human skin.

## Why now

Owner upgrade unblocked generation on 2026-11-01. The FLUX two-stage trial on mont-pc the same day was rejected (results in `art-tools-v9/STATE.md`), so ChatGPT is the route.

## Sketch

- Sources stay outside the repo: `~/asset-studio-private/atlas-3d-plan/art-tools-v9/` (`prompts.json`, `gpt/`).
- Each image: owner-approved art source, 4x-UltraSharp on mont-pc port 8188, fit longest side to 2800 px, webp q90, 960 px thumb q84.
- Swap prompt strings in both `index.json` and `art-briefs.json`. Add ChatGPT to the tool enum in `atelier/atlas-world-panels/js/concept-arts-model.mjs` if the gate needs it.
- One feature, shipped into `release/1.18`, reaching main at promote. The set ships whole, never part-finished, so styles do not mix.

Out of scope: `twostage.py` and the other uncommitted FLUX files on the main checkout, lore text that still says giant ant, and a new wiki page, since this replaces images on an existing surface.

## Acceptance criteria

- [ ] All 24 entries in `content/concept-art/index.json` point at ChatGPT-sourced images; none of the old Flow images remains in use.
- [ ] Every image was opened by the implementer and matches its name and prompt, with no visible text or letters, including the boss sheet.
- [ ] `boss-mvp-kiln-saint-pyraea` shows the insect-abdomen, six-legged design with a small human for scale.
- [ ] Every image meets the gate in `concept-arts-model.mjs`: 2800 px, 800 KB, 960 px thumbs.
- [ ] Prompt strings match in `index.json` and `art-briefs.json`, and `art_prompt_lint.py` reports 0 problems.
- [ ] `cd scripts && npm test` and `node --test atelier/atlas-world-panels/tests/*.test.mjs` pass.
- [ ] Gate 1 passes and the feature ships into `release/1.18`.
- [ ] After promote, the new art shows at `http://localhost:8788/?tab=concept-arts` and in the hosted gallery, checked in Chrome.
