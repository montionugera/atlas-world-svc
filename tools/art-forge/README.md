# Art Forge

Pipeline for generating character concept art with ComfyUI on the owner's
GPU box (mont-pc), then intaking the results into the game's asset
manifest. This README documents the **recipe** — the hard-won generation
tuning — plus the access path and QC method. It ships **zero images**;
see `forge.config.json` and `prompts/*.json` for the machine-readable
config, `docs/superpowers/specs/2026-08-01-art-forge-foundation-design.md`
for the design, and `HANDOFF-2026-07-28.md` §2 for the original session
notes this recipe was transcribed from.

> Generation requires a live GPU and a Tailscale tunnel — see "CI status"
> at the bottom of this file before assuming any of this is automatable.

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

## Config shape: `forge.config.json` v2 — named profiles, no default

`forge.config.json` is **v2**: a top-level `comfy` block (the machine —
host/port/GPU/launch script, shared across every recipe) plus a
`profiles` map keyed by name. There are currently two profiles,
`character` and `environment`, each holding its own `models` /
`sampler` / other recipe data. **There is no default profile.**
`loadForge({ forgeDir, profile })` throws if `profile` is omitted or
unknown — callers must always name one explicitly
(`loadForge({ profile: "character" })`), because inheriting the wrong
recipe silently produces wrong-style art instead of an error.

Once loaded, code reads `forge.profile.*` (the resolved profile), never
`forge.config.*` directly — e.g. `forge.profile.sampler.denoise`, not
`forge.config.sampler.denoise`. `forge.config.comfy` is still the right
place for host/port/GPU, since that's shared across profiles.

> **`profiles.environment` exists but has no runner yet.** It is recipe
> data only — see "Stage: GENERATE" below and the "CI status" section.
> Do not go looking for an `env.mjs`; it has not been built.

## Stage: GENERATE — the winning v3 recipe (`profiles.character`)

Model: **Z-Image Turbo**, mode **img2img**, **denoise 0.82**, over
flat-grey per-job silhouettes cut from the approved human row via
ImageMagick magenta-key.

- **Proportion and pose** come from the silhouette.
- **Race and costume** come from the prompt.

This split is the whole trick: earlier attempts that tried to hold
proportion with text alone drifted on head-body ratio every time. See
`forge.config.json` → `profiles.character.sampler` /
`profiles.character.silhouettes` for the exact values.

The muscle gradient (`forge.config.json` →
`profiles.character.muscleGradient`) locks a race axis (lightest →
heaviest) crossed with a job axis, scored 6.0 → 8.5. Race identity
markers (`prompts/race-identity.json`) are locked by owner iteration and
referenced by `content/story/canon.md` §5 — treat them as canon, not as
suggestions.

## The environment profile (`profiles.environment`) — recipe only, no runner

`forge.config.json` also carries a measured recipe for environment
concept art: **flux1-schnell**, txt2img, ControlNet-depth at
**strength 0.30** (the usable window is 0.30–0.40 — the conventional
0.8–1.0 collapses schnell into flat vector art), plus a hires pass at
denoise 0.4. See `profiles.environment` in `forge.config.json` for the
full values and `profiles.environment._note` for the measurement
provenance and caveats — including that the checkpoint filename
**`flux1-schnell.safetensors` is unverified** against the live ComfyUI
box, because that box was unreachable when the profile was written.

This profile is **inert**: nothing in this repo executes it. The depth
control image producer (`blockin.mjs`) and the graph runner (a
prospective `generate/env.mjs`) both require the ComfyUI server at
`100.66.190.100:8188`, which has been unreachable, and neither has been
built. Treat `profiles.environment` as validated recipe data waiting for
a runner, not as a working pipeline.

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

**Every image goes through the artifact gate first** — every model tested
by the F-024 campaign hallucinates signature text (`CALENER SAFE`,
`©Arand Alita`, `©Llaman Woalo`), so unattended batches are unsafe
without it:

```bash
# exit 0 = PASS, 1 = FLAG. Always look at the corner sheet.
node artifact-gate.mjs out/<cell>.png --corner-sheet out/_corners.png
```

A PASS is triage, not proof: the gate flags 13 of 37 known-clean corpus
images and has no power on a textured corner. The normalised corner sheet
is what a human actually adjudicates. To intake despite a flag you must
supply a written reason, which is recorded in the manifest entry:
`intake-art.mjs ... --skip-artifact-gate "<why>"`.

Then QC runs **per row**, not per image:

1. Build a contact sheet for the row:

   ```bash
   magick montage row-*.png -tile 8x8 -geometry +2+2 contact-sheet.png
   ```

2. Inspect the contact sheet. Reroll **only the failing cells** — not
   the whole row — with a new seed plus reinforced identity words from
   `prompts/race-identity.json`.

## Files in this directory

- `forge.config.json` — v2, `comfy` (shared ComfyUI host/port/GPU) plus
  `profiles.character` and `profiles.environment` (model, sampler,
  silhouette/ControlNet, and muscle-gradient axes per profile). No
  default profile — see "Config shape" above.
- `prompts/style-laws.json` — positive/negative prompt fragments and the
  prompt laws above.
- `prompts/race-identity.json` — per-race identity markers and muscle
  score, locked canon (see `content/story/canon.md` §5).
- `generate/` — the character ComfyUI job scripts (`charsheet.mjs`,
  `i2i.mjs`, `batch-matrix.mjs`), all reading `profiles.character`.
  Present; not run in CI (see "CI status" below). There is no equivalent
  runner for `profiles.environment` yet — see above.
- `intake-art.mjs` — transactional, gate-verified intake of a generated
  PNG into `game-client/assets/art/concept/` + `art-manifest.json`. The
  only sanctioned way a generated image enters the repo.
- `artifact-gate.mjs` — screens an image for hallucinated watermarks,
  checkerboard/tiling artifacts and degenerate (flat-vector) renders.
  Wired into `intake-art.mjs`, so a flagged image cannot enter the
  manifest. **It is triage, not a classifier** — read
  `docs/worldbuilding/ABP-artifact-gate.md` for the measured detection
  rates and the blind spots before trusting a PASS.
- `tests/` — `node --test` coverage for `intake-art.mjs` and
  `artifact-gate.mjs`.

## CI status

> **Nothing under `generate/` runs in CI.** Generation needs a live GPU
> and a Tailscale tunnel into a specific machine on the owner's home
> network — there is no way to run it headlessly or in a pipeline. Every
> `generate/*` script (added in a later task) is a manual, interactive
> tool run by a human at a keyboard, never a CI step. Treat anything
> under `generate/` as out of scope for automated gates.
