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

1. Gate 1 runs the art-forge suite at all — it did **not** before this branch; Task 1 fixed this and everything else depended on it. **MET.**
2. `profiles.character` still reads denoise 0.82 / steps 24 / cfg 3 after the restructure. This is the regression guard on the only empirically-validated art path in the repo, where a wrong consumer update fails *silently* — you still get an image, just the wrong style. **MET.**
3. **MET.** The environment graph (`env.mjs` → `buildEnvGraph`) uses an empty latent (`EmptySD3LatentImage`, no `VAEEncode`), applies `ControlNetApplyAdvanced` at strength 0.30, and the sampler's positive/negative conditioning is taken from the ControlNet outputs, not the raw text encodes. Covered by `tests/env-graph.test.mjs`.
4. **MET.** `env.mjs` produces real generations that read as painted concept art, not flat vector poster art — confirmed by the 2026-08-03 replication run: 16/16 cells painted, 0 flat-vector collapses, across four subjects.
5. **MET, with a qualified verdict — read this one carefully.** The replication record exists at `docs/worldbuilding/ABP-controlnet-replication.md`, covering six subjects in total (Gildmark and Norhollow carried over from the earlier rescue round, plus Millcross/Embervale/Rooktide/Cindervast run 2026-08-03) with two seeds run on the four new subjects. Its verdict is **PARTIAL HOLD**, not an unqualified pass: the strength-vs-paint-quality claim replicates cleanly (16/16 painted), but the profile as a whole is **not** yet safe for unattended batch use — one subject's block-in composition is confirmed centred/monumental rather than a staggered hillside (a block-in authoring defect, not a recipe defect), and content-control artifacts (hallucinated text/emblems, modern-world contamination, a wall-condition brief violation) remain unsuppressed in roughly a third of cells. Do not cite this criterion as "replication passed" without that qualification.
6. `scripts/check_asset_manifest.mjs` and its test stay green through both storybook tasks — the gate mirrors the storybook's render-type resolution deliberately, and they must never disagree. **MET.**

## Shipped

The plan had 9 tasks. All 9 ran and shipped.

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
- Gate 1 now runs the art-forge test suite at all — acceptance criterion 1.
- **`blockin.mjs`** (Task 5) — the depth control image producer. Reconstructed
  from two measurement records (`docs/worldbuilding/ABP-flux-dev-and-anchor.md`,
  `docs/worldbuilding/ABP-controlnet-rescue.md`) after the original
  scratchpad-only version was lost (see `task-5-report.md` for the
  recovery trail). Converts a brief's `masses` into a plane-bucketed depth
  PNG. Covered by `tests/blockin.test.mjs`.
- **`generate/env.mjs`** (Task 6) — the schnell + depth-ControlNet runner,
  base pass only (the hires pass described in the recipe is a separate,
  not-yet-built graph). Ports the graph recorded in
  `docs/worldbuilding/ABP-controlnet-rescue.md`, composes the brief prose
  with house style vocabulary and an anti-modern-contamination guard list
  read from config. Covered by `tests/env-graph.test.mjs`.
- **The replication run** (Task 7) — 16 generations across four new
  subjects (Millcross, Embervale, Rooktide, Cindervast), two seeds
  (12345, 741852), both ends of the strength window (0.30, 0.40), recorded
  in `docs/worldbuilding/ABP-controlnet-replication.md`. Verdict:
  **PARTIAL HOLD** — see criterion 5 above and the document itself for the
  full breakdown; this is not an unqualified pass.

**The ComfyUI hardware turned out to be reachable.** `100.66.190.100:8188`
itself was never directly reachable — the server binds `--listen
127.0.0.1` on mont-pc, so that Tailscale address:port combination never
worked, at any point in this branch — but the box is reachable either by
running on it directly or via an SSH tunnel
(`ssh -N -L 8188:127.0.0.1:8188 Mont@100.66.190.100`, per
`forge.config.json`'s `comfy._note`). Earlier drafts of this spec and of
`tools/art-forge/README.md` recorded Tasks 5–7 as hardware-blocked and
not started; that was accurate when written but is now stale in the
opposite direction — this section supersedes it and is the current
source of truth.

`forge.config.json`'s `profiles.environment` block is committed **and now
has a runner exercising it** (`env.mjs`). Its `_note` field records that
both the checkpoint filename `flux1-schnell-fp8.safetensors` and the
ControlNet filename `flux-controlnet-union-pro-2.0.safetensors` were
**verified** to exist on the live ComfyUI server (v0.24.1) on
2026-08-02, via `GET /object_info/CheckpointLoaderSimple` and
`GET /object_info/ControlNetLoader` respectively, and the 2026-08-03
replication confirms 16/16 real generations against them completed
without error. Do not read this as "unattended-batch-safe" — see
criterion 5's PARTIAL HOLD qualification above.

## Known risk carried from the spec — resolved

`blockin.mjs` was **not in the repository** at spec-writing time — the ABP's depth generator derives from it, but it was scratchpad-only. Building it was flagged as the largest piece of unplanned work, with Task 5's first step being recovery of the block-in polygon schema from the ABP records; if not recoverable, that task would become a design decision rather than an implementation. **This risk materialized (the scratchpad version was in fact lost) but was resolved**: the schema was recovered from `ABP-flux-dev-and-anchor.md` and `ABP-controlnet-rescue.md`, and `blockin.mjs` is now committed and tested — see "Shipped" above and `task-5-report.md` for the recovery trail.
