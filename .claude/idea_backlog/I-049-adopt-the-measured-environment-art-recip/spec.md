---
title: "Adopt the measured environment art recipe as a named profile (schnell + ControlNet depth strength 0.30, denoise 1.0, hires 4x-UltraSharp @0.40), build its runner, replicate the measurement, and scale the storybook to observe it"
id: I-049
status: idea
wave: 3
order: 1
sequence_why: "art recipe gates every downstream art idea (I-050, I-061)"
supersedes_title: "Adopt the measured environment art recipe as default (schnell + ControlNet depth strength 0.30, denoise 1.0, hires 4x-UltraSharp @0.40) and settle the FLUX.1-dev non-commercial licence route per DR-002 appendix A"
---

# Environment art recipe, runner, replication, and storybook

> **Canonical design:** [`docs/superpowers/specs/2026-08-02-environment-art-recipe-design.md`](../../../docs/superpowers/specs/2026-08-02-environment-art-recipe-design.md)
> This file is a stub. All design detail lives in the spec above.

## Two title claims were settled before design

**The licence half is withdrawn.** Owner ruling, 2026-08-02: **this is not a commercial project**, so the FLUX.1-dev non-commercial restriction does not bind. Every mitigation DR-002 appendix A proposed — tiered licence policy, intake tagging, closing the `check_asset_manifest.mjs` exemption — is dropped. Recorded as DR-002 appendix B so the reversal is traceable, since DR-002's analysis was built on the now-false premise *"this project is a game intended to ship."*

**"As default" became "as a named profile."** `forge.config.json` holds the **character** recipe (Z-Image Turbo, denoise 0.82 / steps 24 / cfg 3), empirically validated by the F-024 campaign. The environment recipe is a different pipeline, not a competing value — different model, empty latent instead of an img2img anchor, and a control signal the character path does not use. Making either the implicit default makes the other a forgettable flag; forgetting it on a character run silently applies denoise 1.0, the exact failure F-024 spent a campaign diagnosing.

## Problem

There is **no environment art capability in the repo at all**. `forge.config.json` is single-recipe and character-only; its three consumers (`charsheet.mjs`, `i2i.mjs`, `batch-matrix.mjs`) are all character-path; there is no environment generator script. The measured environment recipe exists only as prose in `docs/worldbuilding/ABP-controlnet-rescue.md`.

The measurement is also thinner than it looks: **two subjects, one seed**, with `steps = 16` and strengths 0.40–0.60 never swept, and no strength sweep for Norhollow. The ABP's own next-steps asks for replication across five more L1 subjects and a second seed before sample-and-approve.

## Why now

This gates the downstream art ideas — **I-050** (regenerate the 6 town placeholders) and **I-061** (biome key art for the empty `art:biome` group) both need a working environment pipeline, not a prose recipe.

## Sketch

Four phases, in order. Phases 1 and 4 are pure code; 2 and 3 need the ComfyUI box.

1. **Config v2** — `profiles.character` / `profiles.environment`, no implicit default; update the three consumers; regression test pinning 0.82 / 24 / 3. Append DR-002 appendix B.
2. **Runner** — `generate/env.mjs`, ported from the ABP's recorded workflow JSON (empty latent → depth ControlNet → schnell → hires).
3. **Replication** — Millcross, Embervale, Rooktide, Cindervast (`A1-ART-02/03/06/07`), second seed, strengths 0.30 and 0.40; committed measurement record with a hold-or-fail verdict. Four subjects, not the ABP's "five" — `A1-ART-01` is the world map, which `ae74b5f` deliberately made an authored vector rather than a diffusion image.
4. **Storybook** — tab/section layer plus group and free-text filters over the existing group buckets; split the 103 KB single-file monolith along its existing seams.

## Scope note

The owner elected (2026-08-02) to keep the storybook refactor **inside this spec** rather than splitting it into its own idea, after the coupling was flagged. Consequence recorded in the design's risk register: a ComfyUI outage during Phase 3 stalls a frontend refactor that has no technical dependency on it. Phases 1 and 4 are box-independent and can be pulled forward if Phase 3 blocks.
