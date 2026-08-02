# ABP · the artifact gate — what it catches, what it provably cannot

**Date:** 2026-08-01 · **Branch:** `feat/F-024` · **Code:** `tools/art-forge/artifact-gate.mjs` ·
**Tests:** `tools/art-forge/tests/artifact-gate.test.mjs` ·
**Follows:** `ABP-flux-eval.md`, `ABP-anchor-model-choice.md` ·
**Implements:** recommendation 4 of `ABP-flux-eval.md` and recommendation 3 of `ABP-anchor-model-choice.md`

`ABP-anchor-model-choice.md` established that **the hallucinated watermark is universal** — it appears on
schnell + anchor, dev + anchor Gildmark and dev + anchor Norhollow alike, tracking the painterly look rather
than the model. That made a gate mandatory before any unattended batch. This document records what the gate
actually achieves, measured against the campaign's own output.

## Verdict up front

<div class="callout danger">

**This is a triage tool, not a watermark classifier. A PASS is not a clean bill of health.**

On the 52-image campaign corpus the corner check caught **15 of 15** watermarked images — at the cost of
flagging **13 of 37** clean ones. That operating point is a **knife edge**: changing the neighbourhood
radius from 6 to 4 drops recall from 15 to 8 while barely moving the false-positive count. The thresholds
were selected from a 4 374-point sweep against only 15 positives, so **the measured recall is optimistic and
will not transfer cleanly to new images.**

**The mandatory corner sheet, reviewed by a human, is the actual defence.** The automated checks exist to
make that review cheaper and to make unattended batches fail loudly rather than silently.

</div>

<div class="metric-grid">
<div class="metric-tile"><strong>15 / 15</strong><br/>watermarks caught (corpus)</div>
<div class="metric-tile alarm"><strong>13 / 37</strong><br/>clean images also flagged</div>
<div class="metric-tile"><strong>6 / 6</strong><br/>degenerate arms caught, 0 false</div>
<div class="metric-tile alarm"><strong>unstable</strong><br/>ring 6→4 halves recall</div>
</div>

## The corpus

`tools/art-forge/out/{flux,devtest,anchorcmp}` — **52 PNGs**, git-ignored, produced by the flux/dev/schnell
evaluation rounds. Ground truth was established by eye, on **histogram-normalised crops of all four corners
of all 52 images**: several watermarks are literally invisible until the crop is `-normalize`d.

**15 images carry a hallucinated signature. Every one is in a BOTTOM corner; not one top corner in the
corpus carries a mark.** Two structurally different families:

| family             | example                                                             | appearance                                                             | where                                      |
| ------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| **solid badge**    | `CALENER SAFE`                                                      | large black brushstroke, white sans-serif, huge contrast on pale grass | `flux/ART-04-norhollow__F-{base,hires}` SW |
| **thin signature** | `©Arand Alita`, `©Llaman Woalo`, `©Lorlluifurerou`, cursive scrawls | small, low-contrast, often same-hue-as-background                      | 13 images, SW or SE                        |

That split matters: the two families have almost nothing in common except location, and **no single
geometric template covers both cheaply** (see "Why precision is poor").

## What it detects

Three independent checks. Any one firing flags the image and exits non-zero.

### 1 · `degenerate` — the render failed and returned flat vector art

Standard deviation of the Laplacian over a width-1024 greyscale, in `[0,1]` luminance units. This is the
**same detail-density measure `ABP-anchor-model-choice.md` already used** to rank dev against schnell
(0.0289 vs 0.0154 on Norhollow), reused rather than reinvented so gate numbers and eval numbers stay
comparable.

|                                    | measured σ          |
| ---------------------------------- | ------------------- |
| the six failed `A-*` arms          | **0.0039 – 0.0424** |
| every image that actually rendered | **0.0574 – 0.1821** |
| **threshold**                      | **0.05**            |

**Result: 6 / 6 caught, 0 false positives.** Clean separation — but note the margin is only **1.35×**
between the worst true positive (0.0424) and the lowest clean image (0.0574). It is not a wide moat.

<div class="callout warn">

**This check does NOT separate schnell's "flat vector poster art" from dev's rendered art.** Those sit at
0.057–0.082 and 0.088–0.127 respectively — overlapping ranges, no usable cut. Laplacian σ detects a
**catastrophically failed render**, not a stylistically flat one. Judging schnell-vs-dev quality remains a
human call against the §6.0 criteria.

</div>

### 2 · `corner-signature` — hallucinated watermark / artist mark

Four corner windows (34 % × 20 % of the frame each), **each resized so its width is always 512 px** — that
normalisation is what lets one threshold hold across 1280×832 base renders and 1920×1248 hires renders,
because signature text occupies roughly the same _fraction_ of the frame at both sizes.

Inside a window: Sobel edge energy per 8×8 block → background is the **median of a 13×13 block ring around
each block** (local, not global — that is what makes the same threshold work on flat water _and_ on textured
grass) → hot blocks are `> max(3.0 × local background, 0.8)` → connected components → a candidate must be a
**bounded, wide, short band** whose column-energy profile **alternates** the way letters and gaps do.

The alternation test is what rejects the dominant false positive: a horizon or waterline is a smooth
continuous band and barely crosses its own mean, while text crosses it once per stroke.

**Result: 15 / 15 caught (100 % recall), 13 / 37 clean images flagged (35 % false-positive rate).**

Falsely flagged: `flux/ART-05-gildmark__F-{base,hires}`, `devtest/ART-04-norhollow__D-g3p5`,
`devtest/ART-05-gildmark__{A-d0p8, AC-d0p6, AC-d0p85, D-base_00001}`,
`anchorcmp/ART-04-norhollow__{D-anchored-base, S-anchored-base, S-anchored-best-base, S-anchored-hires}`,
`anchorcmp/ART-05-gildmark__{S-anchored-base, S-anchored-d0p70-base}`.

### 3 · `tiling` — checkerboard / texture-atlas artifact

A checkerboard of cell size _c_ anticorrelates with itself at lag _c_ **along both axes at once**. Natural
texture — wood grain, grass, water — is directional: it may anticorrelate along one axis but almost never
along both at the same lag. The score is the minimum of the two axis anticorrelations, maximised over lags
2–12 in 32×32 blocks, **at native resolution**.

|                                            | score                                |
| ------------------------------------------ | ------------------------------------ |
| synthetic checkerboard, 2 / 4 / 8 px cells | **1.000** (period recovered exactly) |
| corpus maximum over 52 images (lag ≥ 2)    | **0.485**                            |
| **threshold**                              | **0.55**                             |

**Result: 0 false positives on 52 real renders; fires perfectly on synthetic checkerboards.**

<div class="callout warn">

**This detector is validated synthetically, not against the real artifact.** `ABP-flux-eval.md` reports a
black-and-white checkerboard stamped onto two palisade logs of `flux/ART-04-norhollow__F-hires`. **I could
not locate it** by inspection of that image, and the detector does not fire on it. So the gate is proven to
catch checkerboards _in general_ and proven not to false-positive on this corpus, but it is **not** proven
to catch the specific artifact that motivated it. If that patch is ever located, add it as a fixture.

</div>

Two deliberate limits: **lag 1 is excluded** (single-pixel alternation is ordinary dithering, and the corpus
reaches 0.603 there), and **analysis runs at native resolution** — measured on a 2 px fixture, downscaling
640→256 loses the artifact entirely (1.000 → 0.115) while 640→400 still "hits" but reports period 9 for a
2 px artifact.

## What it provably cannot do

<div class="callout danger">

These are measured limitations, not hedges.

1. **It cannot read text.** It has no OCR and never will without a dependency. It detects _structure that
   looks like a mark_, so a hallucinated logo with no text and no thin strokes is invisible to it.
2. **It has no power on a busy corner.** The check is a local-outlier test. Where the corner is already
   textured — foliage, rubble, choppy water — a signature is not an outlier and cannot be separated from
   scene content by this method. **Absence of a flag in a textured corner means nothing.**
3. **It only looks at the four corners**, 34 % × 20 % each. A mark placed centrally, or along an edge
   midpoint, is out of scope by construction. All 15 corpus watermarks happened to be in bottom corners;
   that is an observation about these models, not a guarantee.
4. **It cannot separate flat-but-rendered from flat-because-failed** (see the `degenerate` caveat).
5. **Its precision is poor and its calibration is fragile** — the next section.
6. **File size is not used and must never be.** `ABP-anchor-model-choice.md` measured failing arms writing
   1.7–1.9 MB. Any check built on PNG size is unsound; it was tried there and gave the wrong answer.

</div>

### Why precision is poor — and why widening it is not free

The measured trade-off across the sweep, best recall achievable at each false-positive level:

| false positives |      recall | note                              |
| --------------: | ----------: | --------------------------------- |
|          0 / 37 |      9 / 15 | misses both `CALENER SAFE` images |
|          2 / 37 |     12 / 15 | misses both `CALENER SAFE` images |
|          8 / 37 |     14 / 15 |                                   |
|     **13 / 37** | **15 / 15** | **shipped**                       |

**The geometry window that admits the thin cursive signatures excludes the large `CALENER SAFE` badge** —
the badge is roughly 3× wider and taller than a signature. Widening the window until the badge fits is
precisely what pushes the false-positive rate from ~5 % to 35 %. There is no setting that catches both
families cheaply.

### The calibration is a knife edge

One-at-a-time perturbation of the shipped config, reported as `recall/false-positives`:

| parameter                | shipped | perturbations                                          |
| ------------------------ | ------- | ------------------------------------------------------ |
| `cornerRing`             | 6       | **3 → 8/9** · **4 → 8/9** · 6 → 15/13                  |
| `cornerRatio`            | 3.0     | 3 → 15/13 · 3.5 → 12/12 · 4 → 9/11 · **5 → 5/5**       |
| `cornerMinRatio`         | 2.5     | 2.5 → 15/13 · 4 → 12/6 · **5 → 4/2**                   |
| `cornerMinCrossPerBlock` | 0.7     | 0.5 → 15/18 · 0.7 → 15/13 · **0.9 → 10/11**            |
| `cornerMinAspect`        | 3       | 3 → 15/13 · 4 → 12/10 · 5 → 11/9                       |
| `cornerAbsFloor`         | 0.8     | 0.5 / 0.8 / 1.2 → 15/13 (flat — genuinely insensitive) |
| `cornerMinCrossings`     | 8       | 2 → 15/22 · 5 → 15/20 · 8 → 15/13                      |

Only `cornerAbsFloor` sits on a real plateau. **`cornerRing` and `cornerRatio` are cliffs.** Read this as:
the shipped numbers describe _this corpus_, and a 100 % recall claim on new output would be unjustified.

## How it is wired in

`tools/art-forge/intake-art.mjs` runs the gate **inside its validate phase**, before any file copy or
manifest write — a flagged image aborts with zero side effects and never enters the repo.

```bash
# inspect one image, with the human-review sheet
node tools/art-forge/artifact-gate.mjs <image.png> --corner-sheet /tmp/corners.png
node tools/art-forge/artifact-gate.mjs <image.png> --json   # metrics for adjudication
# exit 0 = PASS, 1 = FLAG, 2 = usage/IO error

# intake refuses a flagged image
node tools/art-forge/intake-art.mjs --src <png> --id art:... --group ... --title ... --note ...

# deliberate override — REQUIRES a written reason, which is recorded forever
node tools/art-forge/intake-art.mjs ... --skip-artifact-gate "reviewed corner sheet, flat sky intentional"
```

The bypass is deliberate by construction: there is no boolean form, an empty or whitespace reason is
rejected, a bare `--skip-artifact-gate` exits non-zero, and the reason lands in the manifest entry as
`artifactGate: { skipped: true, reason }`. A **passing** gate writes no key at all, so the mere presence of
`artifactGate` on an entry is the audit signal. The committed
`scripts/check_asset_manifest.mjs` accepts the key unchanged — verified, and that file was not modified.

### The corner sheet is the real gate

`writeCornerSheet()` emits a 2×2 sheet laid out as the corners sit in the frame (NW | NE over SW | SE), each
crop `-normalize`d — because several corpus watermarks cannot be seen otherwise. **Look at it.** Given the
35 % false-positive rate and the blind spots above, the sheet is what a human actually adjudicates; the
automated verdict just says which sheets to look at first.

## Running the tests

```bash
cd tools/art-forge && npm test          # 41 tests
```

Two tiers. **Synthetic** fixtures are built with ImageMagick at test time and always run — they prove each
detector fires on the defect it claims. **Corpus** tests carry the calibration and pin
`tp=15, fp=13, degenerate=6 exactly`; they **skip loudly** when `out/` is absent (it is git-ignored) rather
than passing silently. No images are committed.

The suite was verified load-bearing by breaking the code and watching the right tests fail:

| break                            | tests that failed                                           |
| -------------------------------- | ----------------------------------------------------------- |
| `cornerRing` 6 → 4               | the two named-watermark tests + the calibration test        |
| `degenerateLaplacianMin` → 0.001 | 5 tests incl. the intake-blocking test                      |
| `tilingAntiCorr` → 1.5           | all 3 tiling tests                                          |
| intake ignores the gate verdict  | "a gate-failing image aborts intake with ZERO side effects" |
| skip reason not recorded         | "skipArtifactGate records the reason in the manifest entry" |

## How to extend it

- **Add a fixture before a threshold.** Every number in `DEFAULT_CONFIG` is pinned by a corpus test; change
  one and the test tells you what it cost. Do not edit the expected counts to make it green.
- **New detectors go in as a separate check**, added to `CHECKS` and given its own `only:` name so it can be
  measured in isolation against the corpus before being trusted.
- **The highest-value improvement is recall on textured corners**, which needs a genuinely different
  signal — the local-outlier model is exhausted. Approaches worth measuring: a text-detector model (rejected
  here, it needs a dependency and a GPU), or generating each image twice with different seeds and diffing —
  a watermark is unlikely to land identically twice, while scene content is anchored.
- **If the `ABP-flux-eval` checkerboard is ever located**, add it as a corpus fixture; the tiling detector
  currently has no real positive.
- **Do not add a file-size check.** See above.

## Honest notes

- **52 images, 15 positives, two subjects, one campaign.** The corpus is small and its clean images are not
  independent — several are near-duplicate denoise steps of the same render, so the effective sample is
  smaller than the counts suggest.
- **Ground truth is mine, by eye.** It was established on normalised corner crops of all four corners of all
  52 images, but it has not been independently reviewed. A missed faint mark would show up as a false
  positive in these numbers.
- **The thresholds were selected on the same corpus they are reported on.** There is no held-out set. The
  perturbation table is included precisely so the reader can see how much of the headline number is real.
- **Nothing under `content/`, no manifest, `art-groups.json` or `scripts/check_asset_manifest.mjs` was
  modified.** No images are committed; `tools/art-forge/out/` is git-ignored.
