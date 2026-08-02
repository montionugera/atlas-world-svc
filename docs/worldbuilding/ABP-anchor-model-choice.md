# ABP · schnell + anchor vs dev + anchor — the DR-002 reversal test

**Date:** 2026-08-01 · **Branch:** `feat/F-024` · **Hardware:** GPU 1 (RTX 3090, 24 GB), ComfyUI 0.24.1 on
`127.0.0.1:8189` · **Follows:** `ABP-flux-dev-and-anchor.md` · **Decides against:**
`DR-002-flux-dev-licence-risk.md`

`DR-002` names an explicit reversal condition: _"the composition anchor closing the fidelity gap well
enough on schnell alone, making dev unnecessary."_ The anchor now exists and works. This round tests that
condition directly, because clearing it would let the project drop a non-commercially-licensed model.

## Verdict up front

<div class="callout danger">

**No parity. schnell + anchor does not match dev + anchor, and the gap is not a tuning problem.**

At the matched recipe (denoise 0.75) schnell returns **flat vector poster art** — the exact
`ABP-flux-dev-and-anchor.md` Finding-1 failure that grain was supposed to have solved. Grain solved it
**for dev only**. Swept across its own range, schnell has **no denoise value that delivers both a rendered
image and the anchored layout**: below 0.78 it does not render, from 0.78–0.85 it renders but leaves the
anchor's flat regions as flat colour bands, and at 0.90 it finally paints properly — with the layout gone.

**DR-002's reversal condition is NOT met. Do not drop dev on this evidence.**

</div>

<div class="callout warn">

**The denoise window does not transfer between models.** dev's `0.70–0.78` is not a property of the
anchor; it is a property of dev. schnell's usable band is **`0.78–0.85`** — disjoint from dev's default and
overlapping it only at the single upper-edge value. **One config key per asset class is not enough; the
anchor denoise must be keyed per model.**

</div>

<div class="callout danger">

**The hallucinated watermark is universal.** It appears on schnell + anchor (`©Arand Alita`), on dev +
anchor Gildmark (`©Llaman Woalo`), and on dev + anchor Norhollow (`©Lorlluifurerou` plus a monogram). It is
**not a dev artifact and not an anchor-plus-dev artifact** — it tracks the painterly/canvas look itself.
**The artifact gate is mandatory regardless of which model is chosen.**

</div>

<div class="metric-grid">
<div class="metric-tile alarm"><strong>no parity</strong><br/>dev wins A1 + A3 on both subjects</div>
<div class="metric-tile alarm"><strong>window did not transfer</strong><br/>dev 0.70–0.78 · schnell 0.78–0.85</div>
<div class="metric-tile alarm"><strong>watermark universal</strong><br/>3 of 3 anchored arms</div>
<div class="metric-tile"><strong>DR-002 stands</strong><br/>reversal condition unmet</div>
</div>

## Method — what was held fixed

The comparison is only worth anything if nothing but the model moved.

- **The Gildmark block-in is byte-identical to the one the dev run used.** It was still resident on the
  host; it was downloaded and `sha256`-compared against the local copy before any job ran —
  `d50b58d6…4dbc8288f631204d8fcc24ab` on both sides. **Nothing was regenerated.**
- **Briefs verbatim** from `tools/art-forge/out/l1/briefs.tsv`, read by the runner, never retyped.
- **Seed `12345`** throughout. **Hires pass `10 steps @ 0.40`** unchanged for both models.
- **Execution strictly sequential on `:8189`.** The runner asserts the queue is empty before every job and
  aborts if a job it did not queue appears. It never fired.
- **Nothing on the remote host was restarted or reconfigured.** The single write was one
  `POST /upload/image` of the new Norhollow block-in — ordinary img2img usage.

### One deviation from the brief, stated plainly

**The prior round never produced a dev + anchor Norhollow** — only Gildmark was anchored, and no Norhollow
block-in existed. There was therefore nothing to compare a schnell Norhollow against.

Rather than drop the second subject, a Norhollow block-in was authored to the same schema and parameters
(`blur 6`, `noise 0.55`, 1280×832, asymmetric by construction) and **both models were run on it in this
round**. The Norhollow comparison is therefore internally controlled — same block-in, same seed, only the
model differs — but its dev arm is **new here, not carried over**. Read the Gildmark row as the
carried-forward comparison and the Norhollow row as a same-round replication.

### Step count is not the explanation — this was tested, not assumed

schnell is native-4-step and dev native-20, so `steps = ceil(native / denoise)` gives schnell **6** steps at
denoise 0.75 against dev's 27. The obvious objection is that schnell simply had too few steps.

**It did not.** An extra arm ran schnell at denoise 0.75 with **20 steps** — dev's count.

| arm                          | result                                                                      |
| ---------------------------- | --------------------------------------------------------------------------- |
| schnell, 6 steps @ 0.75      | flat vector poster art                                                      |
| **schnell, 20 steps @ 0.75** | **flat vector poster art** — marginally more tower detail, medium unchanged |

Step count moved nothing that matters. For that reason **steps were then held at 6 for the whole denoise
sweep**, so denoise is the only variable across the window test.

## The window-transfer result

schnell + the Gildmark anchor, seed 12345, steps 6 constant:

| denoise  | renders?                 | layout held?                       | verdict                      |
| -------- | ------------------------ | ---------------------------------- | ---------------------------- |
| 0.70     | ✗ flat vector poster art | ✓ (trivially — it _is_ the anchor) | unusable                     |
| 0.75     | ✗ flat vector poster art | ✓ (trivially)                      | **unusable — dev's default** |
| **0.78** | ✓ first genuine render   | ✓                                  | lower bound                  |
| **0.80** | ✓                        | ✓                                  | usable                       |
| **0.82** | ✓ best compromise        | ✓                                  | **schnell's best**           |
| **0.85** | ✓                        | ✓ (edge)                           | upper bound                  |
| 0.90     | ✓ **properly painted**   | ✗ centred island, planes gone      | layout lost                  |

<div class="callout danger">

**This is the crux, and it is a structural problem, not a tuning gap.** The denoise at which schnell stops
producing flat graphics (**0.90**) is above the denoise at which it stops honouring the anchor (**~0.85**).
The two requirements do not overlap. dev has a comfortable overlap; **schnell has none.**

</div>

Note also that dev at 0.82 was run as a control, to rule out "higher denoise is simply better." It is not:
**dev renders fully at 0.75 _and_ 0.82**, so the flatness at low denoise is specific to schnell.

### Why — the mechanism

Anchored img2img asks the model to **transform a flat input into texture**. That is refinement work, and
refinement is exactly what distillation trades away. schnell's 4-step schedule takes large committed jumps;
it is superb at growing an image out of noise and poor at digesting a flat region into material. dev's
20-step schedule has the capacity to convert the anchor's terrace rectangles into coursed stone.

<div class="callout idea">

**The anchor and schnell interact badly for a reason that will not go away: the anchor removes precisely the
thing schnell is good at.** schnell's measured strength in the previous rounds was rendering _from noise_.
The anchor replaces the noise with structure. This also **reverses the prior round's A1 result** — un-anchored,
schnell beat dev on detail density; anchored, dev beats schnell on detail density on **both** subjects.

</div>

Supporting measurement — Laplacian σ on the hires renders (higher = more real detail):

| subject   | dev + anchor | schnell + anchor (0.82) |     delta |
| --------- | -----------: | ----------------------: | --------: |
| Gildmark  |   **0.0251** |                  0.0190 | **−24 %** |
| Norhollow |   **0.0289** |                  0.0154 | **−47 %** |

## Per-criterion scoring against §6.0

**✗** fails · **~** partial · **✓** clears the bar. schnell is scored at **its own best (0.82)**, not at
dev's 0.75 — scoring it at a setting tuned for another model would be rigging the test.

### A1-ART-05 Gildmark

| #      | criterion            | dev+anchor 0.75                             | schnell+anchor 0.75            | schnell+anchor 0.82                   |
| ------ | -------------------- | ------------------------------------------- | ------------------------------ | ------------------------------------- |
| **A1** | detail density       | **✓**                                       | ✗ dissolves to flat shapes     | ~ buildings good, terraces flat       |
| **A2** | depth                | **✓** 4 planes                              | ~ planes are flat cutouts      | ✓                                     |
| **A3** | material read        | **✓** coursed stone, rock, mud all distinct | ✗                              | **✗** terraces are flat mustard slabs |
| **A4** | light                | **✓**                                       | ~ flat ambient                 | ✓                                     |
| **A5** | composition          | **✓** mass on left third                    | ~ held but graphic             | ~ mass drifted centre                 |
| **A6** | thumbnail legibility | ✓                                           | ✓ (trivially — it is a poster) | ✓                                     |
| **A7** | brief fidelity       | **~+**                                      | ✗                              | ~ beached hull ✓, tarred faces ✗      |
| **A8** | set coherence        | ✗                                           | ✗                              | ~                                     |

### A1-ART-04 Norhollow

| #      | criterion            | dev+anchor 0.75                  | schnell+anchor 0.75                 | schnell+anchor 0.82           |
| ------ | -------------------- | -------------------------------- | ----------------------------------- | ----------------------------- |
| **A1** | detail density       | **✓**                            | ✗                                   | **✗** −47 % edge energy       |
| **A2** | depth                | **✓**                            | ~                                   | ~                             |
| **A3** | material read        | **✓** timber grain, stone, grass | ✗                                   | ~ trunks grained, ground bare |
| **A4** | light                | ~                                | ~                                   | ~                             |
| **A5** | composition          | **✓** gate focal at right third  | ✓                                   | ✓                             |
| **A6** | thumbnail legibility | ✓                                | ✓                                   | ✓                             |
| **A7** | brief fidelity       | **~+** emblem ✓, figures ✓       | ✗ crossed-_tools_ glyph, no figures | ✗ no figures, no tally boards |
| **A8** | set coherence        | ✗                                | ~                                   | ~                             |

### Named specifics

| Gildmark brief element        | dev+anchor                        | schnell+anchor 0.82                               |
| ----------------------------- | --------------------------------- | ------------------------------------------------- |
| five terraces                 | ~ (2–3 tiers)                     | ✗ flat colour bands, not architecture             |
| tarred black seaward faces    | ~ dark base wall                  | ✗                                                 |
| slim tower, glazed cap        | **✓ clear lantern**               | ✓ clock tower, cap present                        |
| mudflat / sandbar             | **✓**                             | **✓**                                             |
| **wrecked hulls**             | ✗ (ribs → rocks)                  | **~ one beached boat** — schnell's only clear win |
| palette gold / crimson / grey | **✓**                             | ~ gold dominates, crimson absent                  |
| harbour-scale emblem          | **~ carved plaque over the door** | ✗                                                 |

| Norhollow brief element           | dev+anchor                 | schnell+anchor 0.82               |
| --------------------------------- | -------------------------- | --------------------------------- |
| palisade dominates the silhouette | ✓                          | ✓                                 |
| only roof-peaks and smoke above   | ~ full chateau town behind | ~ sparse buildings                |
| emblem: bell over crossed stakes  | **✓ on the lintel**        | ✗ crossed **axes**                |
| waist-high tally boards           | ✗                          | ✗ (present at 0.75, lost at 0.82) |
| figures in layered furs           | **✓ two guards**           | ✗                                 |
| timber material read              | **✓ grain on every trunk** | ~                                 |

**The one place schnell is not behind:** **A8 set coherence**. dev's pair still swings medium — a
near-photoreal Gildmark against a flat cel Norhollow. schnell's two images are at least consistently
graphic. That is a real point, but it is coherence at a **lower** quality level, which is not the trade the
project wants.

## Does it clear the bar?

**No.** dev + anchor beats schnell + anchor on **A1 detail density** and **A3 material read** on **both**
subjects, and on **A7 brief fidelity** decisively on Norhollow (emblem, figures, timber). schnell's single
advantage is a marginally more coherent set, achieved by both images being flatter.

### What dev still does better, concretely

1. **It digests the anchor instead of parroting it.** dev turns the block-in's terrace rectangles into
   coursed stone and rock geology; schnell leaves them as flat gold bands at every denoise that preserves
   layout. This is the single most visible difference and it is visible at thumbnail size.
2. **It carries small brief elements through the anchored pass** — the carved plaque over the counting-house
   door, the emblem on Norhollow's gate lintel, two figures in furs. schnell drops all of them.
3. **It has a working denoise overlap at all.** dev can be set once and batched. schnell cannot be set to
   any value that satisfies both requirements.

### Is that worth the licence restriction?

**On quality grounds, dev is clearly ahead. On shipping grounds, that does not settle it** — a
non-commercial licence is a legal exposure, not a quality trade, and the two are not commensurable. The
honest position is the one `DR-002` already takes: **dev output remains evaluation material, tagged
`licence-restricted`, and is not intaken as shipped art.** Nothing in this round changes that, and nothing
in this round justifies relaxing it either.

## Recommendation on DR-002

<div class="callout warn">

**Do not reverse DR-002.** The stated reversal condition — the anchor closing the fidelity gap on schnell
alone — is **measurably unmet**. Keep the record open with its mitigations intact.

</div>

But the licence exposure is real and unresolved, so the follow-ups are ranked by what would actually close
it:

1. **Give schnell structure it can keep at high denoise.** schnell at 0.90 paints genuinely well and only
   fails on layout. A structure-preserving conditioning that does not rely on low denoise — depth or
   line ControlNet, or a two-stage schnell 0.90 render re-anchored afterwards — would attack the one thing
   that is actually broken. **This is the highest-value next experiment and it is cheap** (schnell base is
   ~10 s).
2. **Key the anchor denoise per model, not per asset class.** Recommendation 3 of the previous ABP
   (`0.70–0.78` in `forge.config.json`) is **wrong as written** — it is dev-specific. Record
   `dev: 0.75` / `schnell: 0.82` as separate keys, with the flat-vector failure noted against schnell.
3. **Ship the artifact gate now, unconditionally.** It was already blocking; this round removes the last
   excuse to make it model-conditional. It must run whichever model wins.
4. **Do not batch on schnell + anchor as it stands.** A full L1 set generated this way would be flat-banded
   poster art with the layout intact — worse than the un-anchored schnell set that started this campaign.
5. **Re-run this test if either model changes.** The comparison is a fixture now: same block-ins, same
   briefs, same seed, one runner.

## Honest notes

- **Only two subjects, one seed.** The direction is consistent across both and across the whole denoise
  sweep, and the failure at 0.70/0.75 is categorical rather than marginal — but this is not a large sample.
  It is enough to refuse a reversal; it would not be enough to claim a precise quality ratio.
- **The Norhollow dev arm is new in this round**, not carried over. See the deviation note above.
- **The file-size heuristic from the previous round does not work here.** `ABP-flux-dev-and-anchor.md`
  used "0.4 MB PNG = flat vector, did not render" as the failure signature. Every schnell arm in this round
  wrote **1.7–1.9 MB** and several still returned flat vector art — the anchor's grain survives into the
  output and inflates the file. **Do not use PNG size as a render-success gate.** It was checked first and
  it gave the wrong answer; the images had to be looked at.
- **Automated composition metrics were not re-attempted.** The previous round recorded both candidates as
  degenerate. A5 was scored by eye, which is what §6.0 specifies.
- **Nothing was intaken.** No manifest, `art-groups.json`, `content/`, or gate script was touched. No
  tooling under `tools/art-forge/` was modified. Only this document is committed.

## Artifacts

All git-ignored, under `tools/art-forge/out/anchorcmp/`:

- **`_sheet.png`** (1812×1800) — Gildmark row and Norhollow row, each **dev+anchor | schnell+anchor (matched
  0.75) | schnell+anchor (best 0.82)**, plus the full six-cell schnell denoise-window row
  (0.70 / 0.75 / 0.78 / 0.80 / 0.85 / 0.90). Every cell labelled with model, denoise and step count.
- Gildmark schnell: `ART-05-gildmark__S-anchored-{base,hires}`, `-s20-base`,
  `-d0p{70,78,80,82,85,90}-base`, `-best-{base,hires}`
- Gildmark dev control at the upper edge: `ART-05-gildmark__D-anchored-d0p82-base`
- Norhollow both models: `ART-04-norhollow__{D,S}-anchored-{base,hires}`,
  `ART-04-norhollow__S-anchored-best-{base,hires}`
- Norhollow block-in generator input: `tools/art-forge/out/devtest/anchor/A1-ART-04.colour.json` and
  `blockin-A1-ART-04-colour.png` (built with the existing `anchor/blockin.mjs`, unmodified)

## The schnell anchored graph

Identical to the dev anchored graph in `ABP-flux-dev-and-anchor.md` except: the checkpoint is
`flux1-schnell-fp8.safetensors`, there is **no `FluxGuidance` node** (schnell is guidance-distilled and has
no lever), the negative is an **empty `CLIPTextEncode`** rather than `ConditioningZeroOut` per schnell's
shipped template, and the sampler is:

```json
{
  "8": {
    "class_type": "KSampler",
    "inputs": {
      "model": ["1", 0],
      "positive": ["4", 0],
      "negative": ["5", 0],
      "latent_image": ["31", 0],
      "seed": 12345,
      "steps": 6,
      "cfg": 1,
      "sampler_name": "euler",
      "scheduler": "simple",
      "denoise": 0.82
    }
  }
}
```

> `denoise: 0.82`, **not** dev's `0.75`. At 0.75 this graph returns flat vector art. `steps: 6` is
> `ceil(4 / 0.75)` and was held constant across the sweep after 20 steps was shown to change nothing —
> for schnell the step count is not the lever, the denoise is.
