# ABP · ControlNet on schnell — does it rescue the unrestricted model?

**Date:** 2026-08-01 · **Branch:** `feat/F-024` · **Hardware:** GPU 1 (RTX 3090, 24 GB), ComfyUI 0.24.1 on
`127.0.0.1:8189` · **Follows:** `ABP-anchor-model-choice.md` · **Decides against:**
`DR-002-flux-dev-licence-risk.md`

`ABP-anchor-model-choice.md` measured the crux exactly:

> schnell's denoise where it paints properly (0.90) is **above** the denoise where it stops honouring the
> img2img anchor (~0.85). There is no setting that gives both.

ControlNet attacks that directly: structure arrives through a control signal instead of through a low
denoise, so schnell can run at **denoise 1.0** — where it paints best — while layout is held externally.
This round tests whether that works.

## Verdict up front

<div class="callout success">

**Yes. schnell + ControlNet holds layout AND paints properly — and it beats dev + anchor on detail
density on both subjects.**

At **depth control, strength 0.30, denoise 1.0**, schnell retains **95 %** of its free-running paint
quality (Laplacian σ 0.4114 against an un-controlled ceiling of 0.4348) while taking the block-in's
layout: the tower lands at **x ≈ 0.27**, against the spec's declared focal of **0.26**. The
no-ControlNet control puts it at **x ≈ 0.51**, dead centre — the A5 failure. The ControlNet is
unambiguously doing the work.

</div>

<div class="callout warn">

**The dev-trained ControlNet transfers to schnell — but only at roughly one third of the conventional
strength.** At the usual `0.8–1.0` it does not merely over-constrain; it **collapses schnell into the
same flat vector poster art** the anchor produced (σ 0.053, **−88 %** against the un-controlled ceiling).
The structural conflict was not eliminated by ControlNet — **it was relocated from the denoise axis to
the strength axis**, where it happens to have a usable window that the denoise axis did not.

</div>

<div class="callout danger">

**A licence blocker sits on top of the whole result, and it must be resolved before DR-002 can be
reversed.** The control model is `flux-controlnet-union-pro-2.0.safetensors`, a **FLUX.1-dev-trained**
ControlNet. `DR-002` is a record about _licence exposure_, not quality. Swapping FLUX.1-dev for
"Apache-2.0 schnell **plus a dev-derived ControlNet**" may reintroduce the identical restriction through
the back door. **This licence was not verified in this round** and no conclusion about it is asserted
here. See "The blocking question" below.

</div>

<div class="metric-grid">
<div class="metric-tile"><strong>transfers</strong><br/>dev-trained CN works on schnell</div>
<div class="metric-tile"><strong>s0.30–0.40</strong><br/>usable strength window</div>
<div class="metric-tile"><strong>+55 % / +6 %</strong><br/>detail vs dev+anchor (Gildmark / Norhollow)</div>
<div class="metric-tile alarm"><strong>licence unverified</strong><br/>CN is dev-derived — blocks reversal</div>
</div>

## Method — what was held fixed

- **The Gildmark block-in was reused byte-identical.** `sha256 d50b58d62edddd2b99b54aaec092f2ee693079d0
4dbc8288f631204d8fcc24ab` — the same hash recorded in `ABP-anchor-model-choice.md`. **Nothing was
  re-authored.** The Norhollow block-in spec was likewise reused unmodified.
- **Briefs verbatim** from `tools/art-forge/out/l1/briefs.tsv`, read by the runner and length-asserted
  (645 chars Gildmark, 649 Norhollow) so a silent retype fails loudly.
- **Seed `12345`** throughout. Hires pass **10 steps @ 0.40**, unchanged from both prior ABPs.
- **Execution strictly sequential on `:8189`.** The runner asserts an empty queue before every job and
  aborts on any job it did not queue. It never fired.
- **Nothing on the remote host was restarted or reconfigured.** The only writes were four
  `POST /upload/image` calls of locally-derived control images — ordinary ControlNet usage.
- **dev + anchor was not regenerated.** The existing hires renders were reused as the control to beat.

### Where the wiring came from

Discovered from the running instance, not guessed. There is **no shipped Flux-Union ControlNet
template** — `flux_canny_model_example` is BFL's Flux.1-Canny _model_, a different thing entirely — so
the graph was built from `/object_info`:

- `GET /object_info/ControlNetLoader` → confirmed `flux-controlnet-union-pro-2.0.safetensors` is visible;
  output `CONTROL_NET`.
- `GET /object_info/SetUnionControlNetType` → `type` is a COMBO; the relevant options are **`depth`** and
  **`canny/lineart/anime_lineart/mlsd`**.
- `GET /object_info/ControlNetApplyAdvanced` → `(positive, negative, control_net, image, strength,
start_percent, end_percent)` plus an **optional `vae`**, returning **two** conditioning outputs.

<div class="callout idea">

**Supply the optional `vae` input.** Flux ControlNets condition in latent space, so
`ControlNetApplyAdvanced` needs the VAE. It is declared _optional_ in the schema — a graph that omits it
still validates and still runs, which is exactly how this gets silently mis-wired.

</div>

### How the control images were derived

Both come from the existing block-in. Neither introduces new composition.

| control   | derivation                                                                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **canny** | ImageMagick `-canny 0x1+8%+20%` on the **actual block-in PNG**. The block-in's mandatory Gaussian grain reads as edge noise, so it is de-grained (`-statistic median 5x5`, `-blur 0x3`) first. Geometry untouched.                                                             |
| **depth** | The **same spec**, same 20/17 masses, same polygons and draw order, re-filled by its existing `plane` field (`bg`/`mg`/`fg`) into a near-white / far-black ramp. Only the fill value changes. **No grain** — grain exists to feed the img2img latent, not the control encoder. |

## The strength curve — the central measurement

Gildmark, seed 12345, **empty latent, denoise 1.0** (no img2img anchor at all — structure comes only from
the control signal). Laplacian σ over the whole base render; higher = more real detail.

| arm                                 |          σ | vs un-controlled ceiling | paint verdict                        |
| ----------------------------------- | ---------: | -----------------------: | ------------------------------------ |
| **schnell, no ControlNet**          | **0.4348** |                        — | photoreal — but **centred**, A5 fail |
| **CN depth s0.30**                  | **0.4114** |                 **−5 %** | **photoreal, layout held**           |
| CN depth s0.80                      |     0.0534 |                **−88 %** | flat vector poster art               |
| CN canny s0.80                      |     0.0518 |                **−88 %** | flat vector poster art               |
| _dev + anchor 0.75 (reference)_     |   _0.2491_ |                  _−43 %_ | _smooth CG_                          |
| _schnell + anchor 0.90 (reference)_ |   _0.4492_ |                   _+3 %_ | _paints well, **layout gone**_       |

<div class="callout danger">

**This is the finding that matters, and it inverts the usual ControlNet convention.** ControlNet strength
is normally run at `0.8–1.0`. On schnell that is precisely where the model stops painting. The collapse is
not gradual — between `0.40` and `0.60` the output turns into a hard-edged cutout with a white halo, and by
`0.80` it is the same flat poster art the anchor produced. **A first attempt using the conventional
strength would have concluded "ControlNet does not work on schnell" and been wrong.**

</div>

Visible in row **C** and row **D** of `_sheet.png`: both control types degrade the same way, on the same
schedule. This is a property of the **model**, not of the control type.

### Early-stop does not rescue it

The obvious fix — let ControlNet set structure early, then release the model to paint — was tested at
`end_percent` **0.70 / 0.50 / 0.30** with strength 0.8. **All three stayed flat vector art.** At
`end_percent 0.30` on a 4-step schedule the ControlNet is active for roughly one step and the output is
_still_ flat. The medium is decided in schnell's first committed jump and the remaining steps do not
recover it. **Do not reach for `end_percent` here; reach for lower strength.**

### Step count

schnell is native-4. **8 steps is better than 4** for the controlled path (more material, more detail),
**16 was not tested**, and 8 steps at strength ≥ 0.50 produced the worst artifact in the round — the
cutout halo. Steps and strength interact; they are not independent knobs.

## Per-criterion scoring against §6.0

**✗** fails · **~** partial · **✓** clears the bar. schnell + ControlNet is scored at **its own best
(depth, s0.30, denoise 1.0, 8 steps)**.

### A1-ART-05 Gildmark

| #      | criterion            | dev+anchor 0.75               | schnell+anchor 0.82  | **schnell+CN depth s0.30**                       |
| ------ | -------------------- | ----------------------------- | -------------------- | ------------------------------------------------ |
| **A1** | detail density       | ✓                             | ✗ −24 %              | **✓✓ +55 % over dev**                            |
| **A2** | depth                | **✓** 4 planes incl. fg rocks | ~                    | **~** 3 planes — **fg occluder lost**            |
| **A3** | material read        | ~ smooth CG stone             | ✗ flat mustard slabs | **✓** coursed stone, rock strata, wet sand, weed |
| **A4** | light                | ✓                             | ✓                    | ✓ low raking sun, coherent                       |
| **A5** | composition          | **✓** mass left third         | ~ drifted centre     | **✓** tower x≈0.27 vs spec focal 0.26            |
| **A6** | thumbnail legibility | ✓                             | ✓                    | ✓                                                |
| **A7** | brief fidelity       | ~+                            | ~                    | ~                                                |
| **A8** | set coherence        | ✗                             | ~                    | **✓** (see below)                                |

### A1-ART-04 Norhollow — the replication

Run to give A8 a real reading rather than an assertion. Same recipe, second subject, same seed.

| #      | criterion            | dev+anchor             | schnell+anchor 0.82 | **schnell+CN depth s0.30**                                                           |
| ------ | -------------------- | ---------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| **A1** | detail density       | ✓ 0.2315               | ✗ 0.1232 (−47 %)    | **✓ 0.2443 (+6 %)**                                                                  |
| **A2** | depth                | ✓                      | ~                   | ~                                                                                    |
| **A3** | material read        | ~ flat cel             | ✗                   | **✓** timber grain, charred wood, bare winter trees                                  |
| **A4** | light                | ~                      | ~                   | ~ flat overcast                                                                      |
| **A5** | composition          | ✓                      | ✓                   | **✓** palisade dominates, gate focal, roof-peaks above                               |
| **A6** | thumbnail legibility | ✓                      | ✓                   | ✓                                                                                    |
| **A7** | brief fidelity       | ~+ emblem ✓, figures ✓ | ✗ crossed axes      | **~** crossed-stakes ✓, roof-peaks ✓, **figures ✗**, oak reads charred not weathered |
| **A8** | set coherence        | ✗                      | ~                   | **✓**                                                                                |

<div class="callout success">

**A8 is where the result is strongest, and it is the criterion dev failed hardest.** Row **E** of the
sheet shows it directly: dev's pair is a near-photoreal Gildmark beside a **flat cel-shaded Norhollow** —
they do not read as the same world. schnell + ControlNet returns **two photoreal images in one medium**.
`ABP-flux-dev-and-anchor.md` recommendation 8 ("fix A8 before any batch run") is materially addressed here.

</div>

<div class="callout warn">

**Where it genuinely loses: A2, the foreground occluding plane.** dev + anchor renders foreground rocks
framing both bottom corners. schnell + ControlNet renders the foreground plane as **open water** at every
strength tested. At the initial depth ramp (`fg = #e8e8e8`) it was worse — a near-white near-plane band
across the bottom was read as a **glossy blue boat gunwale**, visible in rows A and D. Softening the ramp
to **`fg = #b4b4b4` removes the artifact cleanly but does not bring the rocks back.** Below-horizon
occluding mass is an open gap.

</div>

## Artifact gate results — run on every output

`tools/art-forge/artifact-gate.mjs` landed during this round and all 30 outputs were run through it.

| image                                       | gate                                 |
| ------------------------------------------- | ------------------------------------ |
| Gildmark schnell+CN s0.30 base / hires      | **FLAG** — NW/NE/SW corner-signature |
| Gildmark schnell+CN s0.40 hires             | **FLAG** — SE                        |
| Norhollow schnell+CN s0.30 base / hires     | **FLAG** — NE + SW                   |
| schnell **no ControlNet** baseline          | **FLAG** — SE                        |
| CN depth **s0.60** (visually the worst arm) | **PASS**                             |

<div class="callout danger">

**Three separate gate findings, all worth recording.**

1. **False positives on photoreal skies.** The NW/NE flags on the best Gildmark renders are **wispy cirrus
   streaks** — long, thin, high-aspect, high-contrast, exactly the signature the detector looks for. All
   four corners were inspected at 1:1 and are **clean**. The gate flags the un-controlled baseline too, so
   this is not ControlNet-specific.
2. **A real miss.** The Gildmark s0.30 hires carries a large, legible hallucinated sign reading
   **`LA LASE / CIVCLE`** with an emblem — **mid-facade, at the centre of the frame**. A corner-only
   detector **provably cannot see it**. ControlNet's photoreal architecture puts legible signage on
   buildings, so this blind spot gets **worse**, not better, on the recipe this document recommends.
3. **PASS does not mean good.** The one arm that passed cleanly is the `s0.60` cutout-halo image — the
   worst-looking output of the round. The gate measures artifacts, not quality. It is not a substitute
   for the §6.0 review.

Norhollow's corner caption block (`SVENERA'S PALLIADE / CCLTNIESTIONL CENTIMESS`) **was** caught, so the
corner detector does work for what it targets.

</div>

## Does it clear the bar?

**On quality: yes.** Across two subjects, schnell + ControlNet matches or beats dev + anchor on **A1, A3
and A8** — including the two criteria dev was ahead on in the previous round and the one it failed
hardest. It ties on A4, A5, A6, A7 and loses only on **A2**.

**That is a reversal of the previous round's conclusion, and it should be read carefully.**
`ABP-anchor-model-choice.md` was right that _the anchor_ cannot rescue schnell, and this round does not
contradict it — the anchor still cannot. What changed is the **mechanism**: replacing the img2img anchor
with an external control signal removes the requirement for a low denoise, and with it the conflict.

## The blocking question

<div class="callout danger">

**`flux-controlnet-union-pro-2.0` is a FLUX.1-dev-trained ControlNet, and its licence was not verified in
this round.**

`DR-002` exists because FLUX.1-dev carries the **FLUX.1-dev Non-Commercial License** and the project
intends to ship. If this ControlNet inherits or carries a comparable non-commercial term, then
"schnell + this ControlNet" is **not** an unrestricted pipeline and the reversal argument collapses —
the exposure would simply have moved from a 16 GB file to a 4 GB one.

**This must be answered before anything else in this document is acted on.** It is a licence question,
not a quality question, and no amount of further image generation will settle it.

</div>

## Recommendation on DR-002

<div class="callout warn">

**Do not reverse `DR-002` yet — but put it on an explicit reversal track.** The quality objection that
kept dev in place is now measurably answered; the licence objection that `DR-002` is actually _about_
is not.

</div>

Strictly, `DR-002`'s literal reversal condition — _"the composition anchor closing the fidelity gap well
enough on schnell alone"_ — **remains unmet**, and this round confirms it: the anchor still does not close
it. A **different** mechanism does. The record's _intent_ (dev becomes unnecessary) is what is now in
reach, so the condition should be **rewritten** rather than declared satisfied.

Ranked by what actually blocks the reversal:

1. **Verify the ControlNet's licence.** Blocking, cheap, and no image work depends on it. If it is
   non-commercial, the correct next experiment is an **Apache-2.0 or permissively-licensed** Flux
   ControlNet, not more tuning of this one.
2. **Fix the artifact gate's mid-image blind spot before any batch run.** The recommended recipe puts
   legible hallucinated signage in the centre of the frame, where the corner detector cannot reach.
   This is now the single largest obstacle to unattended generation.
3. **Replicate across the remaining five L1 subjects and at least two seeds** before the owner's
   sample-and-approve (§6.0 Rule 4). This round is **two subjects, one seed** — enough to overturn a
   quality verdict, not enough to authorise a batch.
4. **Record the strength window per model, exactly as the denoise window had to be.**
   `dev-trained CN on schnell: strength 0.30–0.40`. The conventional `0.8–1.0` is actively wrong here
   and will be "corrected" upward by someone later unless it is written down.
5. **Solve the foreground occluding plane, or accept 3 planes.** `fg = #b4b4b4` in the depth ramp to
   avoid the gunwale artifact; the rocks themselves need either a stronger control type or a
   composited foreground pass.
6. **Do not delete the anchor.** It remains the source of the control images — the depth map is
   generated from the block-in spec, and the canny from the block-in pixels. The anchor work was not
   wasted; its output changed role from _latent_ to _control signal_.

## Honest notes

- **Two subjects, one seed.** The direction is consistent across both, the strength collapse is
  categorical rather than marginal, and the Laplacian method **reproduced both previously published
  deltas exactly** (−24 % Gildmark, −47 % Norhollow for schnell+anchor vs dev+anchor) before being
  applied to anything new — which is the reason to trust the new numbers. It is still a small sample.
- **Absolute σ values here are not comparable to `ABP-anchor-model-choice.md`'s.** That document used a
  different normalisation (0.0251 where this one reads 0.2008). Only **ratios within this document**
  are meaningful, and the ratios match.
- **A5 was scored by eye**, per §6.0, plus the one objective check available: the rendered tower's
  x-position against the spec's declared focal. The composition metrics both prior rounds tried are
  degenerate and were not re-attempted.
- **The hires pass is not free.** It roughly quadruples cost (15 s → 67 s) and introduces mild
  over-processing — the fern-like cloud smearing visible in the Gildmark hires sky. The **base** render
  at 8 steps is cleaner in the sky and only slightly softer.
- **`steps = 16` and strengths between 0.40 and 0.60 were not swept.** The window's upper edge is
  bracketed between a good 0.40 and a bad 0.60 but not located precisely.
- **Norhollow got no strength sweep** — only s0.30 and s0.40, on the window found for Gildmark. It is a
  replication, not an independent derivation.
- **Nothing was intaken.** No manifest, `art-groups.json`, `content/`, or gate script was touched, and
  no tooling under `tools/art-forge/` was modified. Only this document is committed.

## Artifacts

All git-ignored, under `tools/art-forge/out/cntest/`:

- **`_sheet.png`** (2560×2410) — five labelled rows: **A** decision row (dev+anchor | schnell+anchor |
  schnell+CN s0.30 | s0.40, all hires), **B** inputs + the no-ControlNet control, **C** canny strength
  sweep, **D** depth strength sweep, **E** the Norhollow replication.
- Best arms: `BEST-CN-depth-s0p{30,40}-d1p0-st8{,-hires}.png`,
  `NOR-CN-depth-s0p{30,40}-d1p0-st8{,-hires}.png`
- Sweeps: `CN-canny-s0p{30,50,80}-d1p0`, `CN-canny-s1p00-d1p0`,
  `CN-canny-s0p80-e0p{30,50,70}-d1p0`, `CN-depth-s0p{30,40,50,60,70,80}-d1p0-st8`
- Controls: `BASE-schnell-t2i-d1p0-s{4,8}` (no ControlNet), `CN-depth-s0p{30,50}-anchor-d0p90`
- Control images: `control-{depth,canny}-A1-ART-05.png`, `control-depth-softfg-A1-ART-05.png`,
  `control-depth-A1-ART-04.png`, generated by `make-control.mjs`
- Runner: `run.mjs` (+ `run-04.mjs`), arm definitions `matrix{1,2,3,4,5}.json`, sheet build `sheet.sh`
- Evidence crops: `corners-s0p30.png`, `text-crop.png` (the `LA LASE / CIVCLE` hallucination at 2:1)

## The working graph

schnell + ControlNet, **empty latent, denoise 1.0**. Differences from the schnell anchored graph in
`ABP-anchor-model-choice.md`: nodes `20`–`23` are new, node `7` is an empty latent rather than a
`VAEEncode` of the block-in, and the sampler runs at **denoise 1.0** rather than 0.82.

```
CheckpointLoaderSimple(1) ─┬─(0 MODEL)──────────────────────────────────┐
                           ├─(1 CLIP)─┬─> CLIPTextEncode(4) [brief] ────┤
                           │          └─> CLIPTextEncode(5) [""] ───────┤
                           │                                            v
                           │   ControlNetLoader(20) ─> SetUnionControlNetType(21)
                           │                                  │
                           │              LoadImage(22) ──────┤
                           ├─(2 VAE)──────────────────────────┤
                           │                                  v
                           │                    ControlNetApplyAdvanced(23)
                           │                       │ positive(0)  negative(1)
                           │        EmptySD3LatentImage(7)  │
                           │                       v        v
                           └──────────────────> KSampler(8) ─> VAEDecode(9) ─> SaveImage(10)
```

```json
{
  "20": {
    "class_type": "ControlNetLoader",
    "inputs": {
      "control_net_name": "flux-controlnet-union-pro-2.0.safetensors"
    }
  },
  "21": {
    "class_type": "SetUnionControlNetType",
    "inputs": { "control_net": ["20", 0], "type": "depth" }
  },
  "22": {
    "class_type": "LoadImage",
    "inputs": { "image": "cntest/control-depth-A1-ART-05.png" }
  },
  "23": {
    "class_type": "ControlNetApplyAdvanced",
    "inputs": {
      "positive": ["4", 0],
      "negative": ["5", 0],
      "control_net": ["21", 0],
      "image": ["22", 0],
      "strength": 0.3,
      "start_percent": 0.0,
      "end_percent": 1.0,
      "vae": ["1", 2]
    }
  },
  "7": {
    "class_type": "EmptySD3LatentImage",
    "inputs": { "width": 1280, "height": 832, "batch_size": 1 }
  },
  "8": {
    "class_type": "KSampler",
    "inputs": {
      "model": ["1", 0],
      "positive": ["23", 0],
      "negative": ["23", 1],
      "latent_image": ["7", 0],
      "seed": 12345,
      "steps": 8,
      "cfg": 1,
      "sampler_name": "euler",
      "scheduler": "simple",
      "denoise": 1.0
    }
  }
}
```

> **`strength: 0.3`, not the conventional `0.8`.** At 0.8 this graph returns flat vector poster art.
> **`denoise: 1.0`** — there is no img2img anchor in this graph at all; all structure comes from node
> `23`. The `vae` input on node `23` is schema-optional and functionally required.

### The depth control generator

```js
// derived from the EXISTING block-in spec — same masses, same polygons, same
// draw order as blockin.mjs. Only the fill value changes: plane -> depth ramp.
const PLANE_DEPTH = {
  fg: "#b4b4b4", // NOT #e8e8e8 — a near-white foreground band renders as a glossy boat gunwale
  mg: "#8c8c8c",
  bg: "#333333",
};
// canvas is black (sky is the farthest thing in frame), then masses draw
// back-to-front, then `-blur 0x6`.
// NO grain: grain feeds the img2img latent, not the control encoder.
```
