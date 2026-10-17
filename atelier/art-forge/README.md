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

> **`profiles.environment` has a runner: `generate/env.mjs`.** It builds a
> schnell + depth-ControlNet graph, using `generate/blockin.mjs` to produce
> the depth control image — see "Stage: GENERATE" below and the "CI
> status" section for why neither runs in CI.

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

## The environment profile (`profiles.environment`) — recipe and runner

`forge.config.json` also carries a measured recipe for environment
concept art: **flux1-schnell-fp8**, txt2img, ControlNet-depth at
**strength 0.30** (the usable window is 0.30–0.40 — the conventional
0.8–1.0 collapses schnell into flat vector art), plus an **opt-in hires
pass** (`--hires`): a second job that re-uploads the base PNG and refines
it through `UpscaleModelLoader` (`4x-UltraSharp.pth`) ->
`ImageUpscaleWithModel` -> `ImageScale` (down to 1920x1248, 1.5x base — not
a naive 4x, which would be 5120x3328 and does not fit the box's VRAM) ->
`VAEEncode` -> a second `KSampler` at **10 steps, denoise 0.40**. See
`profiles.environment` in `forge.config.json` for the full values and
`profiles.environment._note`/`profiles.environment.hires._note` for the
measurement provenance and caveats. The checkpoint
(`flux1-schnell-fp8.safetensors`), ControlNet
(`flux-controlnet-union-pro-2.0.safetensors`) and hires upscaler
(`4x-UltraSharp.pth`) filenames are all **verified** against the live
ComfyUI server (v0.24.1) — see `profiles.environment._note` and
`profiles.environment.hires._note` for the verification method and date.

`--hires` is **off by default**. The 16 base-pass cells already measured
in `docs/worldbuilding/ABP-controlnet-replication.md` must stay
reproducible from committed code exactly as they were generated, so
opting into the hires pass never changes what a plain `env.mjs` invocation
produces. A real hires generation for A1-ART-02 seed 12345
(2026-08-03) confirmed the second pass genuinely resolves more detail —
tent seams, windmill roof shingles and clock face, individual figures in
the cart queue — over the base pass at the same crop, with no OOM (this
box's tight VRAM, ~3.8 GB free on the pinned GPU, was the open risk going
in) and no visible over-sharpening/checkerboard artifact on this subject.
Modern-contamination artifacts already present in the base pass (a
lattice-pylon silhouette, vehicle-like shapes) carry through unchanged —
the hires pass refines detail, it does not fix content.

`blockin.mjs` (the depth control image producer) and `generate/env.mjs`
(the schnell + depth-ControlNet graph runner, plus the opt-in hires pass)
both exist and are the sanctioned way to run this profile. Access is the
same as "Stage: ACCESS" above — run on mont-pc itself, or tunnel with
`ssh -N -L 8188:127.0.0.1:8188 Mont@100.66.190.100`. The server binds
`--listen 127.0.0.1`, so the Tailscale address `100.66.190.100:8188`
itself has never been directly reachable — see `forge.config.json`'s
`comfy._note`. Neither runner is wired into CI — see "CI status" below.

A replicated measurement of this recipe — 16 generations across four
subjects and two seeds, run 2026-08-03 — lives at
`docs/worldbuilding/ABP-controlnet-replication.md`, verdict **PARTIAL
HOLD**. Read that document for the current findings rather than assuming
this recipe is safe for unattended batch use.

## Prompt laws

See `prompts/style-laws.json` for the machine-readable lists. The
hard-won rules behind them:

- **Text alone CANNOT hold head-body ratio.** Always anchor with an
  image (the silhouette). The owner caught drift twice on text-only
  attempts.
- **NEVER write a negation into a positive prompt.** A diffusion text
  encoder attends to tokens; it has no operator for "no". `no cars`
  delivers `cars`. This file used to instruct the opposite — that
  because cfg 1 leaves the negative branch unevaluated, counter-words
  "belong inside the positive prompt". The cfg fact is right and the
  conclusion was backwards; it is why
  `docs/worldbuilding/ABP-controlnet-replication.md` found pylons and
  modern vehicles *despite* `no modern vehicles` being in the guard
  list, and why Cindervast rendered rubble on a brief whose own prose
  said "there is no rubble". Millcross re-run 2026-08-08 at ControlNet
  strength 0.00/0.30/0.45/0.60 showed pylons and painted road markings
  in every cell, control signal fully off included; a positive-only
  rewrite came back clean.
- **Assert what IS present.** `generate/prompt-lint.mjs` enforces this
  and throws at prompt-composition time, before a job is queued
  (~218 s of GPU per bad cell). Its forbidden-subject vocabulary comes
  from config (`style-laws.json` `forbiddenTokens`,
  `forge.config.json` `<profile>.styleGuard.forbiddenTokens`), never
  from the module.
- **Anti-3D assertions.** The words "raccoon", "goggles" and "dwarf"
  drag the model toward 3D-furry/Pixar. Counter with
  `KEMONOMIMI, HUMAN face, smooth bare human skin` and
  `crisp flat 2D anime illustration, hand-drawn 2D cel-shaded artwork,
clean ink linework over painted flat colour`.
- **The negative node still exists.** `style-laws.json` `negative` and
  `styleGuard.forbiddenTokens` feed a real `CLIPTextEncode` negative
  conditioning (inert at cfg 1, correct if cfg is raised). What is
  forbidden is that vocabulary entering the POSITIVE string.

## Stage: QC

**Every image goes through the artifact gate first** — every model tested
by the F-024 campaign hallucinates signature text (`CALENER SAFE`,
`©Arand Alita`, `©Llaman Woalo`), so unattended batches are unsafe
without it:

```bash
# exit 0 = PASS, 1 = FLAG. Always look at the corner sheet.
# --ledger tees the verdict into the brief's run ledger (see below).
node artifact-gate.mjs out/<cell>.png --corner-sheet out/_corners.png --ledger <briefId>
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

## Run ledger (`runs/`)

Every pipeline event — blockin, render attempt, gate verdict, intake — is
appended to an **append-only per-brief ledger** at `runs/<briefId>.json`
and committed alongside whatever change produced it. Line 1 is a header
object; every later line is ONE compact JSON entry (git-friendly diffs;
appends never rewrite earlier lines):

```
{"v":1,"briefId":"A1-ART-02"}
{"type":"blockin","ts":"…","briefHash":"3f9c…","out":"out/depth/A1-ART-02.png"}
{"type":"render","ts":"…","seed":42,"hires":false,"out":"out/env/A1-ART-02-seed0042-s030.png","briefHash":"3f9c…"}
{"type":"gate","ts":"…","png":"out/env/….png","ok":true,"reasons":[],"cornerSheet":null}
{"type":"gate-skipped","ts":"…","png":"out/env/….png","reason":"<mandatory reason>"}
{"type":"intake","ts":"…","assetKey":"environment/a1-art-02.png","manifest":"game-client/assets/art/art-manifest.json"}
```

Entry types and their fields:

- **blockin** — depth PNG confirmed on disk (`generate/blockin.mjs`);
  `briefHash` (16-hex identity hash of the brief), `out`.
- **render** — PNG downloaded (`generate/env.mjs`, once for the base pass
  and once per `-hires` pass); `seed`, `hires`, `briefHash`, `out`.
  Dry-run downloads nothing and records nothing.
- **gate** — artifact-gate verdict, both PASS and FLAG; `png`, `ok`,
  `reasons`, `cornerSheet` (`null` when none). Written only when the gate
  runs with `--ledger <briefId>`; a ledger write failure warns on stderr
  but never changes the gate's exit code.
- **gate-skipped** — intake bypassed the gate via
  `--skip-artifact-gate "<why>"`; `png`, `reason`. Recorded only when
  `intake-art.mjs --brief <briefId>` was given.
- **intake** — manifest entry fully committed (survived the drift gate);
  `assetKey`, `manifest`. Same `--brief` requirement as above.

After any manual ledger surgery, regenerate the storybook-facing index:

```bash
node ledger-index.mjs   # rebuilds runs/_index.json ({ v: 1, briefs: [...] })
```

The asset-storybook **Forge** tab reads these ledgers plus `briefs/` to
render per-brief pipeline rows with per-cell status/staleness. Re-runs are
requested as **work orders** in `content/review-queue.json`
(`workOrders[]`: `{ id, briefId, cell, reason, seed?, createdAt }`) — the
UI never executes anything.

### Consuming work orders during a forge session

Re-runs are human-executed at the keyboard (same access path as
"Stage: GENERATE"). For each pending order in `content/review-queue.json`:

1. Read the order's `cell` (`blockin` / `render` / `gate` / `intake`),
   `briefId` and optional `seed`, and execute it with the normal scripts.
2. The attempts append themselves automatically via the wiring above
   (pass `--ledger <briefId>` to the gate; `--brief <briefId>` to intake).
3. Delete each fulfilled order from `workOrders[]` **in the same commit**
   that lands the new ledger entries/outputs — an order left behind gets
   executed twice.

## Files in this directory

- `forge.config.json` — v2, `comfy` (shared ComfyUI host/port/GPU) plus
  `profiles.character` and `profiles.environment` (model, sampler,
  silhouette/ControlNet, and muscle-gradient axes per profile). No
  default profile — see "Config shape" above.
- `prompts/style-laws.json` — positive prompt fragments (`positive`,
  `renderAssertion`, `styleClause`), the negative-conditioning nouns
  (`negative`), the R2 `forbiddenTokens`, and the prompt laws above.
- `generate/prompt-lint.mjs` — pure positive-prompt guard (R1 negation,
  R2 forbidden tokens). No I/O, no built-in vocabulary; callers pass the
  tokens from config.
- `prompts/race-identity.json` — per-race identity markers and muscle
  score, locked canon (see `content/story/canon.md` §5).
- `generate/` — the character ComfyUI job scripts (`charsheet.mjs`,
  `i2i.mjs`, `batch-matrix.mjs`), reading `profiles.character`, plus the
  environment runner (`env.mjs`) and depth control producer
  (`blockin.mjs`), reading `profiles.environment` — see above. Present;
  not run in CI (see "CI status" below).
- `intake-art.mjs` — transactional, gate-verified intake of a generated
  PNG into `game-client/assets/art/concept/` + `art-manifest.json`. The
  only sanctioned way a generated image enters the repo.
- `artifact-gate.mjs` — screens an image for hallucinated watermarks,
  checkerboard/tiling artifacts and degenerate (flat-vector) renders.
  Wired into `intake-art.mjs`, so a flagged image cannot enter the
  manifest; `--ledger <briefId>` tees the verdict into the run ledger
  (see "Run ledger" above). **It is triage, not a classifier** — read
  `docs/worldbuilding/ABP-artifact-gate.md` for the measured detection
  rates and the blind spots before trusting a PASS.
- `lib/brief-hash.mjs` — brief normalization + 16-hex identity hash;
  `lib/run-ledger.mjs` — `appendAttempt` / `readLedger` for the per-brief
  ledgers under `runs/`.
- `runs/` — committed per-brief ledger files plus `_index.json`
  (regenerate with `node ledger-index.mjs`) — see "Run ledger" above.
- `tests/` — `node --test` coverage for `intake-art.mjs`,
  `artifact-gate.mjs`, the brief hash, the run ledger and the index.

## CI status

> **Nothing under `generate/` runs in CI.** Generation needs a live GPU
> and a Tailscale tunnel into a specific machine on the owner's home
> network — there is no way to run it headlessly or in a pipeline. Every
> `generate/*` script (added in a later task) is a manual, interactive
> tool run by a human at a keyboard, never a CI step. Treat anything
> under `generate/` as out of scope for automated gates.
