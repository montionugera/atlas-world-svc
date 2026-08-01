# ABP · Flux.1-schnell environment-art evaluation

**Date:** 2026-08-01 · **Branch:** `feat/F-024` · **Hardware:** GPU 1 (RTX 3090, 24 GB), ComfyUI 0.24.1 on
`127.0.0.1:8189` · **Follows:** `ABP-model-bakeoff.md`

## Why this ran

`ABP-model-bakeoff.md` concluded that **no installed checkpoint could hit the bar**, and named two specific
acquisitions as the fix: (1) a model with an LLM/T5-class text encoder — **"Flux.1-dev or SD3.5-Large"** — and
(2) an **upscale model** to make a two-pass hires-fix possible. Both have now been installed. This evaluation
tests that prediction.

## Verdict up front

> **Flux.1-schnell does not clear the bar — but it is a decisive step change, and it changes what the
> remaining problem is.**
>
> **F-hires is comfortably the best environment image the campaign has produced.** It is the first arm to
> genuinely clear **detail density**, and it also clears **depth**, **material read** and **light** — four
> criteria that every previous arm failed or half-failed.
>
> It fails on the two criteria that separate _concept art_ from _a photograph_: **composition** and **brief
> fidelity**. And on brief fidelity it is, on the named specifics, **worse than turbo T48**.

The headline is not "Flux wins, swap the model." It is: **Flux fixes the rendering problem and exposes the
control problem.** Turbo could not render; Flux can render but will not obey. Those need different fixes, and
the second one is not solved by a checkpoint swap.

<div class="callout warn">

**Two new defects turbo did not have.** F-base and F-hires on Norhollow both carry a fully-formed hallucinated
brand watermark — a brush-stroke badge reading **"CALENER SAFE"** — burned into the lower-left of the frame.
The hires pass also stamped a **black-and-white checkerboard** (texture-atlas artifact) onto two palisade logs.
Neither is promptable away reliably. This is a production blocker for unattended batch generation.

</div>

## Method

- **Subjects:** the two from the previous bake-off, so results are directly comparable —
  `A1-ART-05 Gildmark` (previous best) and `A1-ART-04 Norhollow` (previous worst).
- **Prompt:** taken **byte-identical** from `tools/art-forge/out/l1/briefs.tsv`, which is the same string the
  T24/T48 arms consumed. Verified by reading the TSV, not retyped from the markdown.
- **Seed:** `12345` for all four images. **Negative:** empty string (and see below — at cfg 1 it is ignored
  outright).
- **Execution:** strictly sequential, one job at a time. Queue verified empty on `:8189` before starting; the
  runner aborts if it finds a job it did not queue.
- **Arm coupling:** each subject ran as **one graph emitting two `SaveImage` nodes**. F-hires therefore
  refines the _byte-identical_ F-base image rather than a re-roll, so the F-base → F-hires delta is purely the
  second pass and nothing else.

### Where the graph came from

Not guessed, and not adapted from the z-image graph. Discovered in this order:

1. `GET /templates/index.json` → located the shipped template `flux_schnell` ("Flux.1 Schnell FP8").
2. `GET /templates/flux_schnell.json` → read its nodes, widget values **and link list** to recover exact
   wiring and slot indices.
3. `GET /object_info/CheckpointLoaderSimple` → confirmed outputs `MODEL, CLIP, VAE` on slots 0/1/2 and that
   `flux1-schnell-fp8.safetensors` is visible to this instance.
4. `GET /object_info/UpscaleModelLoader` → confirmed `4x-UltraSharp.pth` is loadable.

The shipped template carries an explicit `Note` node, quoted verbatim:

> _"Note that Flux dev and schnell do not have any negative prompt so CFG should be set to 1.0. Setting CFG to
> 1.0 means the negative prompt is ignored. The schnell model is a distilled model that can generate a good
> image with only 4 steps."_

This is the authoritative source for the settings below. The all-in-one fp8 checkpoint was used, so
`UNETLoader` + `DualCLIPLoader` were not needed — one `CheckpointLoaderSimple` supplies model, CLIP and VAE.

### Settings

| arm         | model                  | steps             | cfg | sampler / scheduler | denoise | size      |
| ----------- | ---------------------- | ----------------- | --: | ------------------- | ------: | --------- |
| **F-base**  | `flux1-schnell-fp8`    | 4                 |   1 | `euler` / `simple`  |     1.0 | 1280×832  |
| **F-hires** | same, 2nd pass on base | 10 (≈4 effective) |   1 | `euler` / `simple`  |    0.40 | 1920×1248 |
| _T48 (ref)_ | `z_image_turbo_bf16`   | 48                |   4 | `res_multistep`     |     1.0 | 1280×832  |

Two choices in the hires pass are mine, not the template's, and are justified rather than assumed:

- **1920×1248, not 5120×3328.** `4x-UltraSharp` outputs 4× (5120×3328); a Flux fp8 refine at 17 Mpx will not
  fit in 24 GB. The image is upscaled 4× by the model then resampled down to **1.5× base** with lanczos —
  the standard hires-fix shape. The upscaler still does the real work; the downsample just makes it fit.
- **10 steps × 0.40 denoise.** A `KSampler` at denoise _d_ runs the last _d·s_ steps. At schnell's native 4
  steps, a 0.40 denoise would run **1.6 steps** — not enough to resolve anything. 10 × 0.40 restores **4
  effective steps**, i.e. schnell's native count, while keeping the denoise genuinely low. This is the
  non-obvious part of hires-fixing a distilled model and is the reason a naive "4 steps / 0.35 denoise"
  second pass does nothing.

### Cost — Flux is not just better, it is cheaper

| job                       | wall clock                            |
| ------------------------- | ------------------------------------- |
| Gildmark (both passes)    | **117.6 s** — includes cold ckpt load |
| Norhollow (both passes)   | **59.0 s** — warm                     |
| _T48, single image (ref)_ | _114 s_                               |

**Warm, Flux produces both a base and a hires image in 59 s — roughly half the cost of one T48 image.** The
step/cfg tradeoff the previous doc recommended (moving environments to 48/4 for +58 s per image) is obsoleted.

## Per-criterion scoring

**✗** fails · **~** partial · **✓** clears the bar

| criterion                                           | T48 | F-base | F-hires |
| --------------------------------------------------- | --- | ------ | ------- |
| detail density (holds at full size)                 | ~   | ~      | **✓**   |
| depth (fg / mg / bg separation)                     | ~   | ✓      | **✓**   |
| material read (stone / tarred timber / water / mud) | ~   | ✓      | **✓**   |
| light (single coherent source, believable falloff)  | ✗   | ✓      | **✓**   |
| composition (deliberate focal point)                | ~   | ✗      | **✗**   |
| legibility at thumbnail                             | ✓   | ✓      | **✓**   |
| brief fidelity                                      | ~   | ✗      | **✗**   |

### Where Flux clearly wins

**Detail density — the first genuine pass.** Inspected at 100 %, not scaled-to-fit. The Gildmark F-hires crop
resolves individual window mullions, stone coursing, slate courses, chimney pots, railings and a conservatory
porch. The same region of F-base, magnified 1.5× to match, is soft — windows are blobs. **The second pass adds
real information, it is not sharpening.** The same region of T48 is heavily posterised with visible banding
and edge halos: the "over-sharpened photograph" signature the previous doc named.

**Light.** Gildmark has one coherent low sun from frame-left with believable warm falloff across the rock and
correct shadow logic on the terraces. T48 had no discernible light direction on either subject. This criterion
went from a hard fail to a clear pass.

**Material read.** Norhollow's palisade shows genuine char texture, wood grain, knots and wet iron banding.
T48's "timber" had a smooth vinyl sheen. Gildmark separates dressed stone, render, slate and green water.

**Depth.** Both Flux images have three real planes with atmospheric perspective. Norhollow: frost grass →
palisade → fogged treeline. T48's Norhollow had no midground at all — the roofline was a flat black cut-out.

### Where Flux fails — and the failure is structural

**Composition — unchanged, and it is the same failure.** Both Flux images are a **dead-centre, near-symmetric
subject on an empty backdrop**. Gildmark is a rock in the middle of flat water under flat sky, with no
foreground element. Norhollow is a centred gate with the frame mirrored about it. The previous doc called this
"the criterion every arm failed hardest" and predicted it was **not solvable by prompt text**. That prediction
is now confirmed against a far stronger model: **raw capability does not buy composition.**

**Brief fidelity — Flux gets the gestalt right and the specifics wrong. Turbo did the opposite.**

This is the most useful finding in the evaluation and it is not one-directional:

| brief element (Gildmark)            | T48                         | Flux                         |
| ----------------------------------- | --------------------------- | ---------------------------- |
| vertical town stacked up a headland | ✗ — a single cottage        | **✓ — nails it**             |
| five terraces                       | ✗                           | ~ — 3–4 tiers, not countable |
| slim tower, glazed cap              | ✓                           | **✓ — clear glazed lantern** |
| **tarred black seaward faces**      | **✓**                       | **✗ — pale stone and brick** |
| **mudflat, sandbar, wrecked hulls** | **✓ — hulls clearly there** | **✗ — absent entirely**      |
| palette gold / crimson / fog-grey   | ~                           | ✗ — generic blue and tan     |
| harbour-scale emblem                | ~ — a red roundel           | ✗                            |

| brief element (Norhollow)                          | T48                      | Flux                                              |
| -------------------------------------------------- | ------------------------ | ------------------------------------------------- |
| palisade dominates the silhouette                  | ✓                        | ✓                                                 |
| **only roof-peaks and smoke above**                | **✓ — exactly right**    | **✗ — a chateau and a modern steel gantry crane** |
| ore-head machinery on the slope                    | ✓ — winding wheel        | ✗ — anachronistic crane                           |
| palette hollow-green / frost-white / weathered oak | ✓                        | ✗ — charred black                                 |
| bell-over-crossed-stakes lintel emblem             | **✓ — clearly rendered** | ✗                                                 |
| waist-high tally boards                            | ✗                        | ✗                                                 |
| figures in layered furs                            | ✓                        | ~ — one modern-looking figure                     |

**On the named specifics, T48 is the more faithful arm.** Flux overrode the stated palette on both subjects
and dropped named props that turbo rendered.

**Why — and this is mechanistic, not vibes.** Schnell is **guidance-distilled**: it runs at **cfg 1.0**, which
means classifier-free guidance is off and the negative prompt is ignored (the shipped template says so
outright). There is **no guidance lever at all** on schnell. Turbo at cfg 4 has real guidance pressure pushing
it toward every clause of the brief. So turbo obeys harder and renders worse; schnell renders far better and
drifts toward its own priors — which are photographic, contemporary and Northern-European-coastal.

**And the medium is still wrong.** The bar is professional MMO concept art. Both Flux images read as
**travel photographs** — Gildmark could be a stock shot of St Michael's Mount. Painted value structure,
deliberate edge control and design intent are absent. That is a different failure from turbo's, but it is
still a failure against the stated standard.

## Does Flux clear the bar?

**No.** It clears 5 of 7 criteria against T48's 1 of 7, at half the render cost — a large, real, reproducible
improvement that should be adopted. But "professional concept art" requires the two it fails, and one of them
(brief fidelity) it fails **worse** than the model it replaces. Reporting this as a win would be overselling.

The honest framing: **the rendering bottleneck is solved; the control bottleneck is now the whole problem.**

## What should change in `tools/art-forge/`

Recommendations only — no tooling was modified in this evaluation.

1. **Adopt Flux.1-schnell as the environment renderer**, with the exact graph below. It is better and cheaper
   than T48 on every rendering axis. **Do not touch the character-sheet path** — that remains validated at
   `z_image_turbo` 24/3 by the original campaign and was not tested here.
2. **Drop the "move environments to 48/4" recommendation** from `ABP-model-bakeoff.md`. It cost +58 s per
   image for a worse result than Flux delivers in half the time.
3. **Add the hires-fix as a reusable stage**, not a one-off: `UpscaleModelLoader` → `ImageUpscaleWithModel` →
   `ImageScale` (1.5× base) → `VAEEncode` → second `KSampler`. **Encode the effective-steps rule** —
   `steps = ceil(native_steps / denoise)` — or the pass silently does nothing on a distilled model.
4. **Add a watermark/artifact gate.** The "CALENER SAFE" badge and the checkerboard patch would both have
   shipped unnoticed in an unattended batch. At minimum, flag high-contrast text-like regions in image
   corners for human review before a render is accepted.
5. **Record the negative prompt in the manifest `gen` block.** Still outstanding from the previous doc. Doubly
   worth it now: for schnell the correct value is "ignored at cfg 1", and recording that prevents someone
   later "fixing" a negative prompt that cannot do anything.
6. **Composition is the next piece of work, and it is not a model swap.** `art-forge`'s own `style-laws.json`
   already records _"Text alone CANNOT hold head-body ratio — always anchor with an image."_ Two arms of
   evidence now say the same law governs environment composition. The fix is to block in a value/composition
   sketch and drive it through the existing `i2i.mjs`, or a ControlNet depth/lineart pass.
7. **Worth testing next: Flux.1-dev.** `FluxGuidance` exists in this install (`/object_info/FluxGuidance`,
   `guidance` float, default 3.5) and is absent from the schnell template precisely because schnell is
   guidance-distilled. Dev would supply the adherence lever schnell structurally lacks, which is exactly the
   axis that failed here. **Flagged as an untested hypothesis, not a finding** — dev is not installed and this
   evaluation did not measure it.

## Artifacts

- 4 images: `tools/art-forge/out/flux/` (git-ignored)
- Comparison sheet: `tools/art-forge/out/flux/_sheet.png` (2580×1272) — two subject rows, **T48 beside F-base
  beside F-hires**, every cell labelled with arm, model and settings.

## The working graph

Per subject, one graph, two `SaveImage` outputs. Node `10` is F-base; node `16` is F-hires.

```
CheckpointLoaderSimple ─┬─(0 MODEL)──────────────────────────┬─> KSampler(8) ─> VAEDecode(9) ─> SaveImage(10)   [F-base]
                        ├─(1 CLIP)─> CLIPTextEncode(4 pos) ──┤        ▲                │
                        │         └> CLIPTextEncode(5 neg) ──┤        │                │  (neg ignored at cfg 1)
                        └─(2 VAE)───────────────────────┐    │  EmptySD3LatentImage(7) │
                                                        │    │                         v
                                                        │    └──────────< VAEEncode(14) <─ ImageScale(13) <─ ImageUpscaleWithModel(12) <─ UpscaleModelLoader(11)
                                                        │                      │
                                                        └──> KSampler(15) ─> VAEDecode(17) ─> SaveImage(16)     [F-hires]
```

```json
{
  "1": {
    "class_type": "CheckpointLoaderSimple",
    "inputs": { "ckpt_name": "flux1-schnell-fp8.safetensors" }
  },
  "4": {
    "class_type": "CLIPTextEncode",
    "inputs": { "clip": ["1", 1], "text": "<BRIEF PARAGRAPH VERBATIM>" }
  },
  "5": {
    "class_type": "CLIPTextEncode",
    "inputs": { "clip": ["1", 1], "text": "" }
  },
  "7": {
    "class_type": "EmptySD3LatentImage",
    "inputs": { "width": 1280, "height": 832, "batch_size": 1 }
  },
  "8": {
    "class_type": "KSampler",
    "inputs": {
      "model": ["1", 0],
      "positive": ["4", 0],
      "negative": ["5", 0],
      "latent_image": ["7", 0],
      "seed": 12345,
      "steps": 4,
      "cfg": 1,
      "sampler_name": "euler",
      "scheduler": "simple",
      "denoise": 1
    }
  },
  "9": {
    "class_type": "VAEDecode",
    "inputs": { "samples": ["8", 0], "vae": ["1", 2] }
  },
  "10": {
    "class_type": "SaveImage",
    "inputs": {
      "images": ["9", 0],
      "filename_prefix": "flux/<subject>__F-base"
    }
  },

  "11": {
    "class_type": "UpscaleModelLoader",
    "inputs": { "model_name": "4x-UltraSharp.pth" }
  },
  "12": {
    "class_type": "ImageUpscaleWithModel",
    "inputs": { "upscale_model": ["11", 0], "image": ["9", 0] }
  },
  "13": {
    "class_type": "ImageScale",
    "inputs": {
      "image": ["12", 0],
      "width": 1920,
      "height": 1248,
      "upscale_method": "lanczos",
      "crop": "disabled"
    }
  },
  "14": {
    "class_type": "VAEEncode",
    "inputs": { "pixels": ["13", 0], "vae": ["1", 2] }
  },
  "15": {
    "class_type": "KSampler",
    "inputs": {
      "model": ["1", 0],
      "positive": ["4", 0],
      "negative": ["5", 0],
      "latent_image": ["14", 0],
      "seed": 12345,
      "steps": 10,
      "cfg": 1,
      "sampler_name": "euler",
      "scheduler": "simple",
      "denoise": 0.4
    }
  },
  "17": {
    "class_type": "VAEDecode",
    "inputs": { "samples": ["15", 0], "vae": ["1", 2] }
  },
  "16": {
    "class_type": "SaveImage",
    "inputs": {
      "images": ["17", 0],
      "filename_prefix": "flux/<subject>__F-hires"
    }
  }
}
```

> **Do not "improve" this by raising cfg.** Schnell is guidance-distilled; cfg above 1.0 degrades it and the
> negative prompt is inert regardless. If you need prompt adherence, that is an argument for Flux.1-dev
> (item 7), not for turning knobs on schnell.
