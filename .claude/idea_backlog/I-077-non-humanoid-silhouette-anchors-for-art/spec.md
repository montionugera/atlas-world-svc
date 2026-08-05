---
title: "Non-humanoid silhouette anchors for art-forge: the character profile is img2img at denoise 0.82 over human-row silhouettes, and style-laws law #1 says text alone cannot hold proportion — so only 24 of 116 bestiary designs (humanoid-raider) are generatable at all; build anchors for quadruped-beast/drake, insect, plant-rooted, giant-hulk, spirit, serpentine, automaton and winged to unblock the other 92"
id: I-077
status: idea
---

# Non-humanoid silhouette anchors for art-forge: the character profile is img2img at denoise 0.82 over human-row silhouettes, and style-laws law #1 says text alone cannot hold proportion — so only 24 of 116 bestiary designs (humanoid-raider) are generatable at all; build anchors for quadruped-beast/drake, insect, plant-rooted, giant-hulk, spirit, serpentine, automaton and winged to unblock the other 92

## Problem

The concept-art pipeline can only draw humans.

`tools/art-forge/forge.config.json`'s `character` profile is **img2img at denoise 0.82**,
anchored on *"flat-grey per-job silhouettes cut from the approved human row"* living on
mont-pc at `F:\comfy-ui\input` — eight of them (`archer`, `assassin`, `engineer`,
`healer`, `mage`, `spearman`, `summoner`, `swordsman`). And `prompts/style-laws.json` law
number one is explicit:

> Text alone CANNOT hold head-body ratio — always anchor with an image. The owner caught
> drift twice on text-only attempts.

So text-only generation is a *known-failing* path, not an untried one.

Only **24 of 116** bestiary designs are `humanoid-raider`. The other 92 span
quadruped-beast 18, giant-hulk 14, insect-low 11, spirit 11, automaton 11, plant-rooted 6,
serpentine 6, winged-small 6, drakes 6, insect-upright 2, torso-dragger 1 — **none has an
anchor**. `art-bestiary` targets 30; F-031 got it to 2.

F-031 also proved `bodyPlan` alone does not predict success: `mob-bramble-stalker` is
tagged `humanoid-raider` but is described as a *headless plant*, and the human anchor
dominated so hard that the first attempt returned a black-shaded ninja holding bamboo. It
only worked after the clause was rewritten to fight the anchor explicitly.

## Why now

`art-bestiary` is 2 of 30 and structurally capped. Every future creature lane hits this
same wall and burns QC cycles rediscovering it. The recipe itself is settled — F-024 locked
denoise/steps/cfg — so the only missing ingredient is the anchor set.

## Sketch

1. Pick body plans by roster weight: quadruped (18 beast + 6 drake = 24), giant-hulk 14,
   insect 13, spirit 11, automaton 11, plant-rooted 6, serpentine 6, winged 6.
2. Produce a flat-grey silhouette per plan the same way the human row was made (ImageMagick
   magenta-key off an approved reference); place them in `F:\comfy-ui\input`, `sil-` prefix.
3. Re-run a calibration sweep per plan — 0.82 was validated for humans and may not transfer;
   a quadruped may need lower denoise to keep four legs.
4. Extend `prompts/creature-identity.json` entries with the right anchor, and widen the
   confirmed-anchor test in `tools/art-forge/tests/creature-prompt.test.mjs`.

**Constraint:** interactive GPU work on mont-pc, cannot run in CI. Scope it as its own lane,
not as a rider on a content feature.
