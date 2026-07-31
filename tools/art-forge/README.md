# Art Forge

Pipeline for generating character concept art with ComfyUI on the owner's
GPU box (mont-pc), then intaking the results into the game's asset
manifest. This README documents the **recipe** — the hard-won generation
tuning — plus the access path and QC method. It ships **zero images**;
see `forge.config.json` and `prompts/*.json` for the machine-readable
config, and `.superpowers/sdd/2026-08-01-art-forge-foundation/` for the
task briefs behind this pipeline.

> **Nothing under `generate/` runs in CI.** Generation needs a live GPU
> and a Tailscale tunnel into a specific machine on the owner's home
> network — there is no way to run it headlessly or in a pipeline. Every
> `generate/*` script (added in a later task) is a manual, interactive
> tool run by a human at a keyboard, never a CI step. Treat anything
> under `generate/` as out of scope for automated gates.

## Stage: ACCESS (mont-pc, interactive)

Generation runs on the owner's PC, **mont-pc** — Windows, 2× RTX 3090,
reachable over Tailscale at `100.66.190.100`.

1. **SSH** as user `mont` — key auth already works, no password needed:

   ```bash
   ssh mont@100.66.190.100
   ```

2. **Tunnel** ComfyUI's web/API port to localhost before doing anything
   else:

   ```bash
   ssh -f -N -L 8188:127.0.0.1:8188 -o ServerAliveInterval=30 mont@100.66.190.100
   ```

3. **Launch ComfyUI** (if `http://127.0.0.1:8188/system_stats` doesn't
   respond) via the Windows launch script:

   ```
   C:\Users\Mont\run-comfy-gpu0.cmd
   ```

   > **GPU 1 : 8189 is the owner's own ComfyUI instance — do not touch
   > it.** Our instance is pinned to **GPU 0, port 8188**. Never launch,
   > kill, or send jobs to anything on port 8189.

## Stage: GENERATE — the winning v3 recipe

Model: **Z-Image Turbo**, mode **img2img**, **denoise 0.82**, over
flat-grey per-job silhouettes cut from the approved human row via
ImageMagick magenta-key.

- **Proportion and pose** come from the silhouette.
- **Race and costume** come from the prompt.

This split is the whole trick: earlier attempts that tried to hold
proportion with text alone drifted on head-body ratio every time. See
`forge.config.json` → `sampler` / `silhouettes` for the exact values.

The muscle gradient (`forge.config.json` → `muscleGradient`) locks a
race axis (lightest → heaviest) crossed with a job axis, scored
6.0 → 8.5. Race identity markers (`prompts/race-identity.json`) are
locked by owner iteration and referenced by `content/story/canon.md`
§5 — treat them as canon, not as suggestions.

## Prompt laws

See `prompts/style-laws.json` for the machine-readable positive/negative
lists. The hard-won rules behind them:

- **Text alone CANNOT hold head-body ratio.** Always anchor with an
  image (the silhouette). The owner caught drift twice on text-only
  attempts.
- **Anti-3D counter-prompts.** The words "raccoon", "goggles" and
  "dwarf" drag the model toward 3D-furry/Pixar. Counter with
  `KEMONOMIMI, HUMAN face, no fur` and `crisp flat 2D anime
  illustration, NOT 3D render, NOT CGI, NOT clay`.

## Stage: QC

QC runs **per row**, not per image:

1. Build a contact sheet for the row:

   ```bash
   magick montage row-*.png -tile 8x8 -geometry +2+2 contact-sheet.png
   ```

2. Inspect the contact sheet. Reroll **only the failing cells** — not
   the whole row — with a new seed plus reinforced identity words from
   `prompts/race-identity.json`.

## Files in this directory

- `forge.config.json` — model, sampler, silhouette, ComfyUI host/port/GPU,
  and muscle-gradient axes.
- `prompts/style-laws.json` — positive/negative prompt fragments and the
  prompt laws above.
- `prompts/race-identity.json` — per-race identity markers and muscle
  score, locked canon (see `content/story/canon.md` §5).
- `generate/` (Task 8) — the actual ComfyUI job scripts. Not present yet;
  not run in CI when it lands.
