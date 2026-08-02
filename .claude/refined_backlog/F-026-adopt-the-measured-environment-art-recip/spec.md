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
3. **DEFERRED — hardware-blocked, unmet.** The environment graph uses an empty latent and no `VAEEncode`, applies ControlNet at strength 0.30, and takes sampler conditioning from the ControlNet outputs rather than the raw text encodes. `env.mjs`, which would build this graph, was never started (see "Shipped vs deferred" below).
4. **DEFERRED — hardware-blocked, unmet.** `env.mjs` produces a real image that reads as painted concept art, not flat vector poster art. `env.mjs` does not exist in this branch.
5. **DEFERRED — hardware-blocked, unmet.** The replication record exists with an explicit hold-or-fail verdict across four subjects and two seeds. No replication run occurred.
6. `scripts/check_asset_manifest.mjs` and its test stay green through both storybook tasks — the gate mirrors the storybook's render-type resolution deliberately, and they must never disagree.

## Shipped vs deferred

The plan had 9 tasks. Only Tasks 1, 2, 3, 4, 8, and 9 ran; Tasks 5, 6, and 7
were **never started**.

**Shipped:**
- `forge.config.json` v2 with named profiles (`profiles.character`,
  `profiles.environment`) and no implicit default.
- The three existing character tools (`charsheet.mjs`, `i2i.mjs`,
  `batch-matrix.mjs`) migrated to `forge.profile.*`, with a
  mutation-proven guard: pointing any consumer's default profile at
  `"environment"`, or letting a denoise fallback drift off the frozen
  recipe, fails a test.
- DR-002 appendix B (design record addendum).
- `asset-storybook` tabs/filter over art entries, and the follow-on
  module split of the 103 KB single file into `js/*.mjs`.
- Gate 1 now runs the art-forge test suite at all (it did not before this
  branch) — acceptance criterion 1.

**Deferred — blocked on the ComfyUI hardware at `100.66.190.100:8188`,
which was unreachable for the entire duration of this branch:**
- `blockin.mjs` — the depth-map producer (Task 5). Not started; not in
  the repository.
- `generate/env.mjs` — the schnell + ControlNet-depth runner (Task 6).
  Not started; does not exist.
- The measurement replication run across four subjects and two seeds
  (Task 7). Not started; no replication record exists.
- This directly leaves acceptance criteria **3, 4, and 5 unmet** — they
  are marked DEFERRED above, not satisfied.

**Important:** `forge.config.json`'s `profiles.environment` block **is
committed but INERT.** Nothing in this branch executes it — there is no
runner. Its own `_note` field now records that the checkpoint filename
`flux1-schnell-fp8.safetensors` was **verified** against the live ComfyUI
server (v0.24.1) on 2026-08-02 via `GET /object_info/CheckpointLoaderSimple`;
the ControlNet filename `flux-controlnet-union-pro-2.0.safetensors`
remains **unverified**. Do not assume `profiles.environment` describes a
working pipeline; it is recipe data waiting for a runner that does not
exist yet.

This is an accepted hardware blocker, not a defect — do not re-attempt
Tasks 5–7 without first re-establishing that the ComfyUI server at
`100.66.190.100:8188` is reachable.

## Known risk carried from the spec

`blockin.mjs` is **not in the repository** — the ABP's depth generator derives from it, but it was scratchpad-only. Building it is the largest piece of unplanned work, and Task 5's first step is recovering the block-in polygon schema from the ABP records. If it is not recoverable, that task becomes a design decision rather than an implementation. **This risk materialized: Task 5 was never started (see "Shipped vs deferred" above), so `blockin.mjs` remains unbuilt.**
