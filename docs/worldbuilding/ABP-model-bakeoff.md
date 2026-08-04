# ABP · Environment concept-art model bake-off

**Date:** 2026-08-01 · **Branch:** `feat/F-024` · **Hardware:** GPU 1 (RTX 3090), ComfyUI 0.24.1 on `127.0.0.1:8189`

## Why this ran

The concept-art pipeline uses `z_image_turbo_bf16` at **steps 24 / cfg 3**. Those numbers were chosen and
validated by the F-024 calibration campaign against a **character sheet** (`ogre-mage.png`), not against
environments. On town illustrations the output is visibly under-delivering — flat, graphic, no depth.

This bake-off asks two separate questions at once:

1. Is turbo simply **under-stepped** for environments? (T24 vs T48)
2. Does a **different installed model** do better? (`animagine-xl-4.0`, two settings points)

## Verdict up front

> **No winner. All four arms fall short of the professional bar.**
>
> **T48 is the best of the four** and is a real, reproducible improvement over the T24 baseline — but it is a
> better _bad_ result, not a good one. **`animagine-xl-4.0` is disqualified outright**: it produced incoherent
> non-images on 4 of 4 runs.

The actionable finding is therefore **not** a model swap. It is (a) bump the environment step/cfg point, and
(b) accept that **no currently installed checkpoint can hit the bar** — see _What would actually be needed_.

## Method

- **Subjects:** two, so the result is not a fluke of one prompt.
  - `A1-ART-05 Gildmark` — the current best result, hardest to beat.
  - `A1-ART-04 Norhollow` — the current worst, flat and graphic.
- **Prompt:** the brief paragraph taken **verbatim** from `docs/worldbuilding/A1-geography-cluster1.md`
  (newlines collapsed to spaces — byte-identical to how `tools/art-forge/out/l1/briefs.tsv` stored it for the
  shipped run). Identical text across all four arms within a subject.
- **Seed:** `12345` for all 8. **Denoise:** `1` (txt2img) for all 8.
- **Negative prompt:** empty string, **identical across all four arms**, so no arm is handicapped or helped by
  prompt engineering.
- **Execution:** strictly sequential, one job at a time, queue verified empty before starting.
- The T24/T48 arms call `buildBaseGraph()` from the shipped `tools/art-forge/generate/charsheet.mjs`, so the
  baseline arm is literally the production code path rather than a re-implementation.

### Settings per arm

| arm      | model                | loader                   | steps | cfg | sampler / scheduler          | shift | size     | time  |
| -------- | -------------------- | ------------------------ | ----- | --- | ---------------------------- | ----- | -------- | ----- |
| **T24**  | `z_image_turbo_bf16` | `UNETLoader`             | 24    | 3   | `res_multistep` / `simple`   | 3     | 1280×832 | 56 s  |
| **T48**  | `z_image_turbo_bf16` | `UNETLoader`             | 48    | 4   | `res_multistep` / `simple`   | 3     | 1280×832 | 114 s |
| **XL-a** | `animagine-xl-4.0`   | `CheckpointLoaderSimple` | 30    | 6   | `dpmpp_2m` / `karras`        | —     | 1216×832 | 16 s  |
| **XL-b** | `animagine-xl-4.0`   | `CheckpointLoaderSimple` | 45    | 8.5 | `euler_ancestral` / `normal` | —     | 1216×832 | 17 s  |

1216×832 is one of the SDXL-trained resolutions listed in this install's shipped
`templates/sdxl_simple_example.json` note. The SDXL graph shape was read from that template and from
`GET /object_info/CheckpointLoaderSimple` (outputs `MODEL, CLIP, VAE`), not guessed.

> **Note on reproducing the shipped baseline.** The negative prompt used for the original `out/l1/` run was
> never recorded, so T24 is _not_ byte-identical to the shipped `A1-ART-05.png` (RMSE 0.2398). Settings match
> the documented baseline exactly; only the unrecorded negative differs. Worth recording the negative in the
> manifest `gen` block going forward.

## Per-criterion judgement

Scores: **✗** fails · **~** partial · **✓** clears the bar.

| criterion                                          | T24 | T48 | XL-a | XL-b |
| -------------------------------------------------- | --- | --- | ---- | ---- |
| detail density (holds at full size)                | ~   | ~   | ✗    | ✗    |
| depth (fg / mg / bg separation)                    | ~   | ~   | ✗    | ✗    |
| material read (stone vs timber vs water vs mud)    | ✗   | ~   | ✗    | ✗    |
| light (single coherent source, believable falloff) | ✗   | ✗   | ✗    | ✗    |
| composition (deliberate focal point)               | ✗   | ~   | ✗    | ✗    |
| legibility at thumbnail                            | ✓   | ✓   | ✗    | ✗    |
| brief fidelity                                     | ✗   | ~   | ✗    | ✗    |

### T24 — the baseline. Photo-filter realism that ignores the brief.

Gildmark is rendered as **a single harbour cottage**, not the five-terrace vertical port town the brief
specifies. No terraces, no counting-house, no harbour-scale emblem. It looks like a lightly posterised
photograph of a Cornish quay — pleasant, but it is not concept art and it is not Gildmark.

Norhollow is the known failure mode and it is worse: the entire roofline behind the palisade is a **flat black
cut-out silhouette** with zero internal information, the sky is blown to featureless white, and there is no
discernible light direction. The palisade logs are the only rendered surface in the frame, so there is no
midground at all. Materials do not separate — the "timber" has a smooth vinyl sheen. The tally boards named
as a focal element in the brief are absent.

**Verdict: fails on light, materials, composition and brief fidelity.**

### T48 — best of four. Genuinely better, still not good.

Doubling steps and nudging cfg to 4 produces a **real and repeatable** improvement on both subjects:

- **More of the brief lands.** Norhollow gains the ore-head winding wheel on the slope behind (explicitly
  called for), a fur-clad palisade guard, bare trees, and a legible bell-over-crossed-stakes lintel emblem.
  Gildmark gains a second and third building, a rendered-plaster white frontage against the tarred black, and
  a fog-graded headland.
- **Depth improves** from one plane to roughly two-and-a-half — there is now a background, though the
  transition is abrupt rather than atmospheric.
- **Material read improves** to partial: on Gildmark the stone quay, tarred timber, wet sand and green water
  do begin to separate.

But the core defects survive: the Norhollow roofline is **still a flat black silhouette**, there is **still no
coherent single light source** on either image, and the extra steps buy local texture rather than structure —
detail is sprayed evenly across the frame instead of being organised toward a focal point. The result reads
as an **over-sharpened, posterised photograph**, which is a different failure from the professional target
(painted concept art with deliberate value structure). Turbo was under-stepped, but under-stepping was not
the whole problem.

**Verdict: clearly better than T24; still fails light, composition and detail density.**

### XL-a — catastrophic. Not an image.

`animagine-xl-4.0` at 30 steps / cfg 6 produced, for Gildmark, a **flat green cartoon lineart field** of
repeated cylinder-shapes with no horizon logic and no relationship to the brief; and for Norhollow, an
**incoherent brown lattice of tiny repeated objects** resembling a cluttered shelf wall. Neither is a
landscape. Neither is legible at any size. There is nothing to score.

**Verdict: total failure, both subjects.**

### XL-b — catastrophic in a different way.

Raising to 45 steps / cfg 8.5 with `euler_ancestral` did not rescue it. Gildmark became a **uniform mint-green
tiled sprawl** under a flat orange dot; Norhollow became a **dense grey-pink noise field** of repeated pseudo-
architectural fragments. Higher cfg increased contrast and edge crunch without producing structure — the
classic signature of a prompt that is entirely outside the model's distribution.

**Verdict: total failure, both subjects.**

### Why animagine failed — and why that is still a valid conclusion

`animagine-xl-4.0` is a **Danbooru-tag-conditioned anime character finetune**. It expects short comma-separated
booru tags plus its own quality-tag template, and it is trained overwhelmingly on single characters, not
landscapes. A 100-word English prose paragraph describing coastal geology is comprehensively off-distribution.
SDXL's CLIP text encoder also hard-chunks at 77 tokens, so a prose brief of this length is split into
weakly-weighted fragments — whereas turbo's `qwen_3_4b` LLM text encoder ingests the whole paragraph coherently.

**This is a confound, and it is stated honestly: the test did not establish "SDXL is worse than turbo."** It
established the thing that actually matters for this pipeline: **the pipeline feeds prose briefs, and
`animagine-xl-4.0` cannot consume prose briefs.** Tag-rewriting every brief to booru syntax would be a
different pipeline, and would still be asking an anime _character_ model to paint _environments_. Not worth
the spend.

## What would actually be needed to clear the bar

No installed checkpoint can do this. Three gaps, roughly in priority order:

1. **A checkpoint actually trained for environments/illustration.** The install has exactly three image
   checkpoints — an anime character finetune, an SD1.5 general model (`DreamShaper_8`, too old and too low-res
   for 1280-wide concept art), and turbo. There is **no SDXL base, no matte-painting or concept-art finetune,
   and no modern high-capability model.** The right acquisition is a model with an LLM/T5-class text encoder
   that can consume the prose briefs as-is — **Flux.1-dev** or **SD3.5-Large** — optionally with a
   concept-art/matte-painting LoRA. That single change addresses detail density, material read and light
   together.

2. **A two-pass hires-fix, which requires an upscale model.** _None is installed._ Detail that "holds up at
   full size" is normally produced by generate-at-base-res → upscale → low-denoise refine pass. Every arm here
   was single-pass, which structurally caps achievable detail density. Install e.g. `4x-UltraSharp` or
   `4x_NMKD-Siax` and add an `UpscaleModelLoader` → `ImageUpscaleWithModel` → `VAEEncode` → second `KSampler`
   at denoise ~0.35 stage.

3. **Composition control.** "A deliberate focal point, not a centred object on a backdrop" is the criterion
   every arm failed hardest, and it is not reliably solvable by prompt text. The fix is structural: block in a
   value/composition sketch and drive it through **img2img** (`i2i.mjs` already exists) or a **ControlNet
   depth/lineart** pass. Note `art-forge` already proved this exact principle for characters — `style-laws.json`
   records _"Text alone CANNOT hold head-body ratio — always anchor with an image."_ The same law applies to
   environment composition and is currently not being applied.

**Interim recommendation:** move the environment step/cfg point to **48 / 4** (T48) as a cheap, verified
improvement over the current 24 / 3, while treating the above as the real fix. Cost is 114 s vs 56 s per
image. Do **not** change the character-sheet settings — those remain validated at 24 / 3 by the original
campaign and are out of scope here.

## Artifacts

- 8 images + labelled sheet: `tools/art-forge/out/bakeoff/` (git-ignored)
- Comparison sheet: `tools/art-forge/out/bakeoff/_sheet.png` (2644×1016, grouped by subject, one row of four
  arms each, every cell labelled with arm + model + settings)

## Graph JSON — T48 (best of four)

Recorded so the interim recommendation can be implemented. `buildBaseGraph()` in
`tools/art-forge/generate/charsheet.mjs` already emits exactly this shape; only `steps`, `cfg` and the
latent dimensions change from the character-sheet defaults.

```
UNETLoader ─> ModelSamplingAuraFlow ─┐
CLIPLoader ─> CLIPTextEncode(pos) ───┼─> KSampler ─> VAEDecode ─> SaveImage
           └> CLIPTextEncode(neg) ───┤       ▲
VAELoader ───────────────────────────┘       │
EmptySD3LatentImage ─────────────────────────┘
```

```json
{
  "1": {
    "class_type": "UNETLoader",
    "inputs": {
      "unet_name": "z_image_turbo_bf16.safetensors",
      "weight_dtype": "default"
    }
  },
  "2": {
    "class_type": "ModelSamplingAuraFlow",
    "inputs": { "model": ["1", 0], "shift": 3 }
  },
  "3": {
    "class_type": "CLIPLoader",
    "inputs": {
      "clip_name": "qwen_3_4b.safetensors",
      "type": "lumina2",
      "device": "default"
    }
  },
  "4": {
    "class_type": "CLIPTextEncode",
    "inputs": { "clip": ["3", 0], "text": "<BRIEF PARAGRAPH VERBATIM>" }
  },
  "5": {
    "class_type": "CLIPTextEncode",
    "inputs": { "clip": ["3", 0], "text": "" }
  },
  "6": {
    "class_type": "VAELoader",
    "inputs": { "vae_name": "ae.safetensors" }
  },
  "7": {
    "class_type": "EmptySD3LatentImage",
    "inputs": { "width": 1280, "height": 832, "batch_size": 1 }
  },
  "8": {
    "class_type": "KSampler",
    "inputs": {
      "model": ["2", 0],
      "positive": ["4", 0],
      "negative": ["5", 0],
      "latent_image": ["7", 0],
      "seed": 12345,
      "steps": 48,
      "cfg": 4,
      "sampler_name": "res_multistep",
      "scheduler": "simple",
      "denoise": 1
    }
  },
  "9": {
    "class_type": "VAEDecode",
    "inputs": { "samples": ["8", 0], "vae": ["6", 0] }
  },
  "10": {
    "class_type": "SaveImage",
    "inputs": {
      "images": ["9", 0],
      "filename_prefix": "bakeoff/<subject>__T48"
    }
  }
}
```

### Rejected: the `animagine-xl-4.0` graph

Recorded only so nobody re-derives it. The graph is correct and ran cleanly — the **model** is the problem,
not the wiring. `CheckpointLoaderSimple` returns `MODEL, CLIP, VAE` on slots 0/1/2, replacing the separate
`UNETLoader` + `CLIPLoader` + `VAELoader` trio, and `EmptySD3LatentImage` is replaced by `EmptyLatentImage`.

```
CheckpointLoaderSimple ─┬─(0 MODEL)──────────────────┐
                        ├─(1 CLIP)─> CLIPTextEncode ─┼─> KSampler ─> VAEDecode ─> SaveImage
                        └─(2 VAE)───────────────────────────────────────┘
EmptyLatentImage ───────────────────────────────────┘
```
