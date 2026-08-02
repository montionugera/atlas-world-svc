---
title: "Adopt the measured environment art recipe as a named profile (schnell + ControlNet depth strength 0.30, denoise 1.0, hires 4x-UltraSharp @0.40), build its runner, replicate the measurement, and scale the storybook to observe it"
id: F-026
from_idea: I-049
status: refined
---

# Environment art recipe, runner, replication, and storybook

> **Canonical design:** [`docs/superpowers/specs/2026-08-02-environment-art-recipe-design.md`](../../../docs/superpowers/specs/2026-08-02-environment-art-recipe-design.md)
> **Implementation plan:** [`docs/superpowers/plans/2026-08-02-environment-art-recipe.md`](../../../docs/superpowers/plans/2026-08-02-environment-art-recipe.md)
> This file is a pointer. All design and task detail lives in the two documents above, which travel with the feature branch.

## Goal

Give the repo a working environment concept-art pipeline — a named-profile config, a committed depth-map producer, a schnell + ControlNet runner, a replicated measurement, and a storybook that can display the results at scale.

## Architecture

`forge.config.json` becomes v2 with a `profiles` map (`character`, `environment`) and **no implicit default** — callers name a profile, so a character run can never silently inherit the environment's denoise 1.0. `loadForge({ profile })` resolves one profile and exposes it as `forge.profile`; the three existing character tools read `forge.profile.*` instead of `forge.config.*`. A new `blockin.mjs` produces depth control images and `env.mjs` builds the graph that consumes them.

## Components

- **`forge.config.json` v2** — recipe data for both profiles; `comfy` stays shared (it describes the machine, not the recipe).
- **`loadForge({ profile })`** — the single resolution point; throws on a missing or unknown profile.
- **`blockin.mjs`** — depth control producer. `PLANE_DEPTH` fills are measured, not chosen.
- **`env.mjs`** — schnell + depth-ControlNet graph builder, ported from the ABP's recorded workflow JSON.
- **`asset-storybook`** — group tabs + filter, then a seam-following split of the 103 KB single file.

## Tests / acceptance criteria

1. Gate 1 runs the art-forge suite at all — it does **not** today, so this is Task 1 and everything else depends on it.
2. `profiles.character` still reads denoise 0.82 / steps 24 / cfg 3 after the restructure. This is the regression guard on the only empirically-validated art path in the repo, where a wrong consumer update fails *silently* — you still get an image, just the wrong style.
3. The environment graph uses an empty latent and no `VAEEncode`, applies ControlNet at strength 0.30, and takes sampler conditioning from the ControlNet outputs rather than the raw text encodes.
4. `env.mjs` produces a real image that reads as painted concept art, not flat vector poster art.
5. The replication record exists with an explicit hold-or-fail verdict across four subjects and two seeds.
6. `scripts/check_asset_manifest.mjs` and its test stay green through both storybook tasks — the gate mirrors the storybook's render-type resolution deliberately, and they must never disagree.

## Known risk carried from the spec

`blockin.mjs` is **not in the repository** — the ABP's depth generator derives from it, but it was scratchpad-only. Building it is the largest piece of unplanned work, and Task 5's first step is recovering the block-in polygon schema from the ABP records. If it is not recoverable, that task becomes a design decision rather than an implementation.
