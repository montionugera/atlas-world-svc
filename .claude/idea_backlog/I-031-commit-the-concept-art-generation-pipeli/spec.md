---
title: "Commit the concept-art generation pipeline into the repo (Z-Image Turbo img2img + silhouette recipe + prompt laws + batch matrix scripts) — currently scratchpad-only and dies with the session"
id: I-031
status: idea
---

# Commit the concept-art generation pipeline — the valuable part is the least durable

## Problem

`HANDOFF-2026-07-28.md` §2 calls the art pipeline *"reusable — this is the valuable
part"*, then §3 concedes it is **session-fragile**:

> Scratchpad dir (all `*.py` pipeline scripts + generation outputs) dies with the
> session — the committed art is safe; regenerate scripts from this doc + memory if needed.

So the 81 committed images are durable but **the means of producing more is not**.
The named scripts — `zimage-charsheet.py` (txt2img), `zimage-i2i.py` (img2img),
`batch-race-jobs-v3.py` (full 8×8 matrix + muscle gradient) — exist only in a scratchpad
that is already gone. Reproducing the house style currently means re-deriving it from a
prose handoff.

What is at risk is not just code but **hard-won tuning that cost real iteration**:

- **Winning recipe (v3):** Z-Image Turbo img2img, **denoise 0.82**, over flat-grey
  per-job silhouettes cut from the approved human row via ImageMagick magenta-key.
  Proportion/pose comes from the silhouette; race/costume from the prompt.
- **Prompt laws:** text alone *cannot* hold head-body ratio — must anchor with an image
  (the owner caught drift twice). Words like "raccoon"/"goggles"/"dwarf" drag the model
  to 3D-furry/Pixar; the counter-prompts are
  `"KEMONOMIMI, HUMAN face, no fur"` and
  `"crisp flat 2D anime illustration, NOT 3D render NOT CGI NOT clay"`.
- **Muscle-gradient canon:** race axis (Elf lightest → Ogre heaviest) × job axis
  (Mage → Swordsman), scored 6.0 → 8.5.
- **Race identity canon**, locked by owner iteration: Ogre = moss-green skin, small
  tusks, intelligent eyes, natural muscle; Immortal halo = a ring of **light**, not
  bells; Dragon = white hair, pearl-opal iridescent skin; Beastkin = human face, animal
  ears/tail only.
- **QC method:** contact sheet per row (`magick montage … -tile 8x8`), then reroll only
  failing cells with a new seed + reinforced identity words.

Losing this means the next art pass either re-spends that iteration budget or produces
art that does not match the 80 committed images.

## Why now

- The scratchpad is **already gone**; every further session widens the gap between the
  prose description and a working pipeline.
- Handoff §4 lists "more art: scene illustrations (caravan fire, Broker duel, twin
  graves) with the same pipeline" as a suggested next move — that move is blocked on
  reconstructing what was lost.
- Race identity canon is now referenced by `content/story/canon.md`, so art and lore
  are coupled; drift in the generator becomes drift against canon.

## Sketch

(rough shape; not a design yet)

1. Reconstruct the three scripts from the handoff and commit them under a durable path
   (e.g. `tools/art-forge/`), alongside the existing `asset-forge` precedent.
2. Commit the **silhouette source set** (or the ImageMagick recipe that cuts it from the
   approved human row) — the silhouettes are the pose anchor and are equally session-bound.
3. Encode the prompt laws + race identity canon as **data** (a prompt/config file), not
   prose in a handoff, so a regeneration is deterministic and reviewable in a diff.
4. Document the host dependency honestly — see below.

## Constraints / risks

- **The pipeline depends on the owner's personal hardware.** It runs on `mont-pc` over
  Tailscale (`100.66.190.100`, Windows, 2× RTX 3090), ComfyUI on **GPU 0, port 8188**,
  models on `F:\comfy-ui`. The owner's own instance is GPU 1:8189 — **do not touch**.
  This is not CI-runnable and must not become a gate. It is an operator tool.
- Committing scripts that embed a Tailscale IP and a personal machine path is a mild
  disclosure concern — worth a config indirection rather than hardcoding.
- Model provenance/licensing for Z-Image Turbo output should be recorded, since the repo
  already runs a tiered CC0/CC-BY asset gate for other content.

## Related

- `HANDOFF-2026-07-28.md` §2 (pipeline), §3 (fragility), §4 (next moves)
- [[I-030]] — the gate for the art this pipeline produces
- Precedent: F-003 `asset-forge` (Blender→glb→manifest) solved the same
  "operator pipeline must be committed" problem for 3D
