# ABP · ControlNet recipe replication — four subjects, two seeds

**Date:** 2026-08-03 · **Branch:** `feat/F-026` · **Hardware:** GPU 0 (cuda:0, ~3.8 GB VRAM free),
ComfyUI 0.24.1 on `127.0.0.1:8188` via SSH tunnel · **Follows:**
`ABP-controlnet-rescue.md`, `ABP-artifact-gate.md` · **Consumes:** the environment profile in
`tools/art-forge/forge.config.json` and the four block-ins revised in commit `04e7a40`

`ABP-controlnet-rescue.md` measured the strength/paint-quality tradeoff on **two subjects, one
seed** (Gildmark, Norhollow) and flagged that as thin evidence. This round runs the **four L1
towns that were never generated before** — Millcross, Embervale, Rooktide, Cindervast — at **two
seeds** and **both ends of the recommended strength window (0.30, 0.40)**, and looks at every
image, not just the numbers.

## Verdict up front

<div class="callout warn">

**PARTIAL HOLD.** The narrow claim under test — strength 0.30–0.40 keeps FLUX.1-schnell painting
instead of collapsing into flat vector art — **replicates cleanly: 16/16 cells are painted, 0
flat-vector collapses**, across all four subjects and both seeds. That part of the recipe is now
measured on six subjects total (two from the rescue round, four here), not two.

**The profile as a whole is not yet safe for unattended batch use.** Two things broke that the
strength axis does not explain: **Embervale's composition fails at all 4/4 cells** — it renders as
one stepped pyramid, not the six-ledge hill town the brief describes — and the **lattice-pylon
utility-tower artifact recurs in 5 of 16 cells across 3 of the 4 subjects**, unsuppressed by the
current `styleGuard.negative` list. A near-repeat of the original Millcross modern-vehicle failure
also appeared once, and Cindervast's "no rubble, clean walls" clause failed in all 4/4 cells.

</div>

<div class="callout danger">

**Read this before reading anything else in this document.** Four block-in compositions were
authored, not measured. Only Gildmark and Norhollow were ever blocked in by the original
worldbuilding campaign, and even Gildmark's record is partial (6 of 17 masses). Millcross,
Embervale, Rooktide and Cindervast's block-ins were newly authored for this recipe, revised once in
commit `04e7a40` to fix inverted depth planes and thin land coverage, and — before this task ran —
**only Millcross had ever been validated through a real generation.** Embervale, Rooktide and
Cindervast were verified at **depth-map level only**: nobody had looked at what schnell actually
did with them.

That means this round is the **first** real look at three of the four compositions, at the same
time as it is the replication of the strength claim. **A "hold" on those three partly measures our
own drafts, not just the recipe** — and the Embervale failure below cannot be cleanly attributed to
"the recipe" versus "the block-in," because both were untested going in. Where the finding is
about paint quality (steps/cfg/sampler/strength), the evidence is strong: those knobs are shared
identically by all six subjects tested across both rounds. Where the finding is about composition
or brief fidelity, it is entangled with an unvalidated draft and should be read that way.

</div>

<div class="metric-grid">
<div class="metric-tile"><strong>16/16</strong><br/>painted, 0 flat-vector collapses</div>
<div class="metric-tile alarm"><strong>4/4</strong><br/>Embervale cells render as one pyramid, not a town</div>
<div class="metric-tile alarm"><strong>5/16</strong><br/>cells show the lattice-pylon artifact, 3 of 4 subjects</div>
<div class="metric-tile"><strong>0</strong><br/>OOMs or ComfyUI failures — 16/16 generations completed</div>
</div>

## Method — what was held fixed, what was new

- **Subjects:** `A1-ART-02` Millcross, `A1-ART-03` Embervale, `A1-ART-06` Rooktide, `A1-ART-07`
  Cindervast. Four, not the ABP's original "five" — `A1-ART-01` is the world map, which commit
  `ae74b5f` deliberately made an authored vector rather than a diffusion image, so it was never in
  scope for this recipe.
- **Seeds:** `12345` (carried over from the rescue round) and **`741852`**, chosen fresh for this
  round and recorded here so it can be reused for a future replication.
- **Strengths:** `0.30` and `0.40` — the full window `ABP-controlnet-rescue.md` bracketed as usable.
  `0.50`–`0.60` and above were not re-tested; that document already showed the collapse starts in
  that range.
- **Everything else identical to the config:** checkpoint `flux1-schnell-fp8.safetensors`,
  ControlNet `flux-controlnet-union-pro-2.0.safetensors`, depth control, denoise `1.0`, 8 steps,
  cfg `1`, euler/simple, 1280×832. The **base pass only** — no hires upscale — same as the config's
  documented recipe; `env.mjs` does not build a hires graph.
- **Prompts:** the brief prose from `tools/art-forge/briefs/*.json` plus the house style
  vocabulary and the anti-modern-contamination `styleGuard.negative` list, composed by
  `buildEnvPositive`/`buildEnvNegative` in `generate/env.mjs` — never a bare prompt. This is the
  fix that already went in after Millcross's first real generation rendered as a photoreal modern
  settlement; see "What recurred anyway" below for how much of that fix actually held.
- **Runner:** `env.mjs`'s own `generateEnv()` — the same code path as `node generate/env.mjs
  --brief <id> --seed <n>` — called 16 times from a driver script that overrode only
  `controlNet.strength` per cell (the one axis under test; `env.mjs` has no CLI flag for it, and
  `forge.config.json` on disk was never mutated mid-run). Every job was awaited in the foreground
  via `env.mjs`'s own `awaitHistory` poll loop before the next was queued — nothing was
  backgrounded.
- **Nothing on `tools/art-forge/` was modified** by the generation run itself (the driver script
  lived outside the repo). Only this document and the `forge.config.json` evidence note are
  committed from this task.

## The matrix actually run

All 16 cells completed. **Zero failures, zero OOMs** — cuda:0's ~3.8 GB free was sufficient for
every base-pass cell at 8 steps (15–22 s each).

| subject | seed | strength | result | notes |
| --- | --- | --- | --- | --- |
| A1-ART-02 Millcross | 12345 | 0.30 | ok | lattice pylons visible, bg right |
| A1-ART-02 Millcross | 12345 | 0.40 | ok | close crowd/banner framing, no bg town visible |
| A1-ART-02 Millcross | 741852 | 0.30 | ok | modern-looking vehicles + wooden utility poles/wires along road |
| A1-ART-02 Millcross | 741852 | 0.40 | ok | guard-tower framing, clean |
| A1-ART-03 Embervale | 12345 | 0.30 | ok | single stepped pyramid, not 6 ledges; lattice pylon bg; hallucinated banner text |
| A1-ART-03 Embervale | 12345 | 0.40 | ok | same pyramid composition; lattice pylon bg |
| A1-ART-03 Embervale | 741852 | 0.30 | ok | same pyramid composition; no pylon this seed |
| A1-ART-03 Embervale | 741852 | 0.40 | ok | same pyramid composition; no pylon this seed |
| A1-ART-06 Rooktide | 12345 | 0.30 | ok | strong brief match, rook flock, no pylon |
| A1-ART-06 Rooktide | 12345 | 0.40 | ok | barge crane (brief-consistent), no pylon |
| A1-ART-06 Rooktide | 741852 | 0.30 | ok | modern red tractor with crane arm (contamination) |
| A1-ART-06 Rooktide | 741852 | 0.40 | ok | hallucinated US flag emblem, hallucinated fake copyright text, lattice/lookout tower |
| A1-ART-07 Cindervast | 12345 | 0.30 | ok | hazy modern city skyline in bg; cracked/rubbled walls |
| A1-ART-07 Cindervast | 12345 | 0.40 | ok | sparser detail; cracked walls |
| A1-ART-07 Cindervast | 741852 | 0.30 | ok | hazy modern city skyline in bg (again); cracked walls |
| A1-ART-07 Cindervast | 741852 | 0.40 | ok | cracked walls; no skyline visible this crop |

Contact sheet: `tools/art-forge/out/env-replication/_sheet-replication.png` (4 rows × 4 columns —
rows are subjects in the order above, columns are seed12345-s0.30, seed12345-s0.40,
seed741852-s0.30, seed741852-s0.40).

## Per-subject observations

### A1-ART-02 Millcross — the one previously-validated subject

Holds up well as a second look. Both strengths keep the painted quality; the mill/windmill
structure, the cart-and-animal queue, and the plank-and-canvas town all read close to the brief.
One seed (`741852`) rendered what look like modern SUV-shaped vehicles and a line of wooden
utility poles with visible wires strung along the road — not the pickup trucks and skyline from the
original failure, but the **same failure mode at lower amplitude**: `styleGuard.negative`
("no cars", "no power lines") reduced but did not eliminate modern contamination on this subject.
The other seed (`12345`, strength 0.30) shows two electricity-transmission lattice pylons in the
mid-background — confirmed by crop, unambiguous.

### A1-ART-03 Embervale — composition fails at all 4/4 cells

<div class="callout danger">

**The clearest and most consistent finding of the round, and not a strength-axis finding.** Every
one of Embervale's four cells — both seeds, both strengths — renders as **one large stepped
pyramid/pagoda-like building**, not "a terraced hill town of six stacked ledges seen from the
fields below." The six ledges in the block-in are drawn as concentric, centred rectangles in the
depth map; the depth signal reads unambiguously as **one structure receding toward its own apex**,
not six separate rows of buildings receding into a hillside. This is visible immediately on the
contact sheet's second row — four near-identical silhouettes.

</div>

This is very likely a **block-in authoring problem, not a ControlNet-strength problem** — and per
the honesty caveat above, this is also the **first time anyone looked at what this block-in
produces**. The paint quality itself is excellent at both strengths (strong dusk lighting, coursed
stone/tile detail, banner cloth folds) — the strength axis is not what failed here. A hallucinated
nonsense banner reading "Slathey Love" appeared at seed 12345/strength 0.30 (same family as the
"LA LASE / CIVCLE" hallucination `ABP-controlnet-rescue.md` recorded on Gildmark). The lattice
pylon appears at seed 12345 (both strengths) and is absent at seed 741852 — the only subject where
the same artifact both appeared and disappeared purely on a seed change with strength held fixed,
which argues the pylon is a seed-sensitive prior in the checkpoint rather than something
strength or the control image is driving.

### A1-ART-06 Rooktide — brief fidelity strong, contamination present

The rook flock, tidal staging, salvaged-plank sheds and the rook-in-flight emblem all land well;
this is the subject closest to its brief prose of the four. Two separate contamination artifacts
appeared on the `741852` seed only: a **modern red tractor with a crane arm** at strength 0.30
(despite "no modern vehicles" in the guard list), and at strength 0.40 a **hallucinated US flag
emblem** in place of the brief's rook emblem plus **hallucinated fake watermark/copyright text**
("©RJC Roal Degtiget 2010") — a hallucination family not previously recorded in either prior ABP.
A thin metal lookout/lattice tower is also visible at strength 0.40; a barge crane at strength 0.40
on the other seed is brief-consistent ("barge cranes ... dominate the foreground") and was not
counted as the pylon artifact.

### A1-ART-07 Cindervast — stable composition, one consistent brief violation

Gate, crown emblem, statue and standing figures are compositionally stable across all four cells —
the strongest depth-adherence of the four subjects. But **all 4/4 cells show visibly cracked,
patched or rubbled walls**, directly contradicting the brief's "no rubble ... walls standing clean
with mortar intact." This reads as a prompt-emphasis gap rather than a seed artifact, since it is
consistent regardless of seed or strength. A hazy modern city skyline is visible in the background
on both `0.30` cells (both seeds) — confirmed by crop — a faint recurrence of the same
modern-contamination class Millcross first surfaced, now showing up on a third subject.

## The lattice-pylon artifact — frequency, as requested

The brief asked this round to record how often the previously-reported lattice/pylon "utility
tower" motif appears, since two prior rounds saw it and the `styleGuard` list has never targeted
it directly (it guards against modern *vehicles* and *skylines*, not transmission infrastructure).

| subject | seed 12345, s0.30 | seed 12345, s0.40 | seed 741852, s0.30 | seed 741852, s0.40 |
| --- | --- | --- | --- | --- |
| Millcross | **pylon** | — (framing excludes bg) | poles+wires (related) | — |
| Embervale | **pylon** | **pylon** | — | — |
| Rooktide | — | — | — | **lookout tower** |
| Cindervast | — | — | — | — |

**5 of 16 cells (31%), 3 of 4 subjects.** It clusters on seed `12345` (4 of 5 occurrences) — the
same seed the original `ABP-controlnet-rescue.md` used throughout — which is circumstantial but
notable: this may be a **seed-linked prior** in the checkpoint rather than a property of the
control signal or the brief text, since Embervale showed it at both strengths on `12345` and at
neither on `741852` with nothing else changed. **This is not proof** — one new seed is not enough
to confirm a seed-linked cause, only enough to raise it as the leading hypothesis for whoever adds
a targeted negative word next.

## Does it clear the bar?

**On the strength-vs-paint-quality claim specifically: yes, cleanly.** 16/16 new cells painted,
0 flat-vector collapses, across four subjects the original round never touched. Combined with the
two subjects from `ABP-controlnet-rescue.md`, the core recipe (depth control, strength 0.30–0.40,
denoise 1.0, 8 steps) is now evidenced on **six subjects, two seeds** — no longer "two subjects,
one seed."

**On "safe for unattended batch use": no.** A profile that reliably produces a wrong building for
one of four subjects, and unsuppressed modern-world artifacts in nearly a third of cells, is not
ready to run unattended. The failures are not spread evenly — Embervale's is total and
compositional, the others are intermittent and content-level (hallucinated text, contaminating
objects, one recurring silhouette) — so the fix is **not** "lower the strength further." It is:
fix Embervale's block-in, add pylon/tower and rubble/damage words to the negative list, and expect
to still spot-check every batch output by eye.

## What remains unswept

- **`steps = 16`** was never tested on any of these four subjects (only 8, per the config).
- **Strengths 0.40–0.60** were not explored on these four subjects beyond the single 0.40 point;
  `ABP-controlnet-rescue.md`'s bracket (good at 0.40, bad at 0.60) was not independently confirmed
  here.
- **The hires pass was not run** for any of the 16 cells — base pass only, matching what `env.mjs`
  currently builds.
- **`tools/art-forge/artifact-gate.mjs` was not run** against these 16 outputs. The prior round
  found it has a real corner-only blind spot (it missed centre-frame hallucinated signage); given
  this round found hallucinated text/emblems again, running the gate here would have been useful
  and was not done — a gap for the next round, not a claim this one makes.
- **Only one replacement seed was tried.** `741852` is one data point on "is seed 12345
  pylon-prone"; a third seed would be needed to treat that as more than a hypothesis.
- **Embervale's block-in was not re-authored in response to this finding.** This document reports
  the failure; fixing the composition is separate work.

## Contact sheets

`tools/art-forge/generate/contact-sheet.sh` and `tools/art-forge/compare.sh` **do not work on this
data** and no attempt was made to force them to: both are hardcoded to the character profile's
`<race>-<job>.png` naming and (for `compare.sh`) to a `game-client` manifest keyed
`art:class-<race>-<job>` — there is no equivalent manifest entry shape for environment subjects.
Running `contact-sheet.sh A1-ART-02` and `compare.sh A1-ART-02 seed12345` both fail immediately
with "no cells found" / "no generated cell", exactly as expected given the naming mismatch — this
is stated plainly rather than left silent. A contact sheet was built directly with
`magick montage` instead: `tools/art-forge/out/env-replication/_sheet-replication.png`, 4×4,
labelled by filename, git-ignored under `out/` like all other generated art.

## Artifacts

All git-ignored, under `tools/art-forge/out/env-replication/`:

- **`_sheet-replication.png`** — the 4×4 contact sheet described above.
- 16 base-pass PNGs, named `<subject>-seed<seed>-s<strength>.png`.
- `_results.json` — per-cell status, byte size, timing and ComfyUI `prompt_id`, written
  incrementally as the run progressed (all 16 entries `status: "ok"`).
- `crops/` — the zoomed crops used to confirm the lattice-pylon, utility-pole, and modern-skyline
  findings above by direct visual inspection rather than by description alone.
