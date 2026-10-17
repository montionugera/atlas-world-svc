# Review — Millcross map-accurate concept roll, A1-ART-02, three cells (control=none)

**Role:** town-canon-reviewer (`.claude/agents/town-canon-reviewer.md`) · **Date:** 2026-08-29
**Subject:** `tools/art-forge/out/env/A1-ART-02-none-seed{12345,777,31337}.png` vs
`content/world/town-criteria.json` (Pass 2 + Pass 3), `content/towns/town-millcross.json`,
`tools/art-forge/briefs/A1-ART-02.json`, A1 §6 as amended (commit 6894e97).
**Writes:** this sheet only.

## 0 · Provenance (verified, not assumed)

`tools/art-forge/runs/A1-ART-02.json` lines 20–22: all three renders `type:render`,
`seed` 12345 / 777 / 31337, `hires:false`, **`control:"none"`, `strength:null`**, `briefHash:207feb8d8438ccdf` — matching the assignment. The depth block-in for the **same briefHash** exists
(`out/control/depth/A1-ART-02-depth.png`, lines 16–19) but was **never applied as ControlNet
conditioning**. Consequence stated up front: with `control=none`, the map-derived block-in
(masses derived from `town-millcross.json` geometry) had **zero conditioning force** — the
composition is prompt-only. Under the `map-derived-concept` realism rule
(town-criteria.json), a roll stage run this way **cannot structurally satisfy the rule**; every
map contradiction below is the expected failure mode of that omission, not bad luck.

## 1 · Verdict table (one row per cell, then per-criterion detail)

| Cell | Verdict | One-line reason |
|---|---|---|
| seed 12345 | **VETO** | Masonry arch **bridge replaces the ford** (canon contradiction, A1 §3.1/§6); the one tall thing is decorative **storybook fachwerk**, no mill-wheel housing over the race; **palm tree**; red-brick chimneys; all buildings on one bank. |
| seed 777 | **VETO** | **Utility pole with sagging wires** mid-frame — modern contamination, a styleGuard/era style-law break (the exact class ABP-segment-control.md already recorded for Millcross); canal-like **squared-stone embankments**; mill-wheel rendered as a small ornament on a gable away from the water; fachwerk; orange pantile roofs. |
| seed 31337 | **STRONG OBJECTION** (strongest cell; refine, do not accept as-is) | No modern contamination; queue/ribbon/both-banks composition closest to the map — but **timber trestle bridge instead of the ford**, **mill-over-race absent**, a **spired building** creating a second vertical accent, red tile roofs, fachwerk on the right-edge house. |

### seed 12345 — detail

| Criterion | Verdict | Evidence / comment |
|---|---|---|
| map-derived-concept | **VETO** | Two-arch **stone bridge** where the plan requires the cart road to meet water only at the ford (`town-millcross.json` roads/landmarks `the-ford [110,80]`; A1 §3.1 "fordable … in **exactly one** by cart"). A bridge also erases the ford economy A1 §6 builds the town on ("lives on the ford — tolls…, ferrying at high water"). **Mill-wheel housing over the race is absent** — the brief's central mustAssert composition; the only 2-storey mass is a fachwerk house set back from the water (`exactly-one-two-storey` requires the 2-storey mass to be the mill at the race). |
| layout (ribbon, both banks) | **STRONG OBJECTION** | All buildings on the near bank; far bank is empty fields — plan has west rows **and** terrace rows on both banks (`layout-ribbon-sprawl` check: "both banks carry building"). |
| materials-by-economy | **VETO-adjacent → named fix** | **Red-brick chimneys** — fired brick is Embervale's material (A1 §6 Embervale); Millcross set is mill timber / river stone footings / plaster / split shingle (A1 §6 amended + criteria `materials-by-economy`). **Palm tree** right edge — climate contradiction with the river-valley rain/snow load that justifies steep shingled roofs (`roof-climate-coherence`). |
| silhouette-ownership | **STRONG OBJECTION** | Embervale's warm brick migrating in; otherwise low horizontal ribbon roughly held. |
| Pass 3 anti-cliché as rendered | **VETO (style law)** | Decorative **storybook fachwerk** with ornamental bracing on the 2-storey house — `structure-not-decoration` forbids the register as *rendered*, not just as a token. Striped red/white shop awnings — quaint high-street register + off-palette (red is not ash-grey/rope-brown/tallow; emblem is *chalked*, undecorated canvas). No windmill sails / lanterns / castle / cobbles — clean on those. |
| first-sight grammar | RECOMMENDATION | Foreground is dominated by a loose **cattle herd** — reads as a drove, diluting "First thing a traveller sees: the cart queue" (A1 §6). Carts do queue on the road behind. |

### seed 777 — detail

| Criterion | Verdict | Evidence / comment |
|---|---|---|
| modern contamination | **VETO (style law)** | Wooden **utility pole with crossarm and sagging wires** along the road, mid-frame. Era law (forge.config.json environment.styleGuard) + ABP-segment-control.md already logs "wooden utility poles/wires" as Millcross's recurring contamination class. Hard fail regardless of everything else. |
| map-derived-concept | **STRONG OBJECTION** | **No ford and no crossing in frame at all**; the river is an engineered **canal with squared-stone embankment walls** — a gravel-bedded fordable river (A1 §3.1) has no masonry channel. **Mill wheel is a small decorative wheel mounted on a road-facing gable** of the fachwerk house — not a mill-wheel housing standing over a race (`exactly-one-two-storey` + canon "mill-wheel housing over the race"). Race channel absent. |
| materials / roof-climate | **STRONG OBJECTION** | Orange-red **clay pantile** roofs on nearly every building — Embervale's red pantile (A1 §6), no local warrant; local roof is split shingle. |
| Pass 3 as rendered | **VETO (via pole) + OBJECTION** | Fachwerk again; palette drifts orange. Queue of canvas-covered wagons reads closer to prairie-schooner than ox-carts loaded with sacks (canvas is the *temporary camp* register in the material set). Both banks partially present — best of the three on that axis. |
| first-sight grammar | PASS | The queue genuinely composes the frame down the trunk road — the strongest single element in any cell. |

### seed 31337 — detail

| Criterion | Verdict | Evidence / comment |
|---|---|---|
| map-derived-concept | **STRONG OBJECTION** | Queue of loaded ox-carts with walking drivers arrives **on the trunk road** and heads to a **timber trestle bridge** — again a built crossing where the plan/canon require a **ford** (`one-cart-crossing`: cart road intersects water only within the ford radius; a ford is waded, not bridged). **Mill-wheel housing over the race absent**; river rendered without the race channel; a **spired building** (chapel/dovecote register) plus a pyramid-roofed hall give **two extra vertical accents** against `exactly-one-two-storey` ("one tall thing"). |
| layout / silhouette | PASS (best of three) | Low horizontal ribbon of solid single-storey rows on **both banks**, chimneys, last house in open plain with low farmland beyond — matches A1 §6 silhouette and the brief's "beyond the town edge" assertion. |
| materials / roof-climate | **STRONG OBJECTION** | Red-orange **tile roofs** across the town — Embervale's material, not split shingle; also odd **red lattice/slat fences** (off-palette, decorative register). |
| Pass 3 as rendered | RECOMMENDATION x2 | Decorative **fachwerk** on the right-edge house; spire = generic-village vertical. No poles, no windmill sails, no castle/keep, no lanterns, no cobbles (hard-packed earth roads ✓), no walls — cleanest anti-cliché surface of the three. |

## 2 · Strongest-cell recommendation

**seed 31337** is the refinement candidate. Reasons: (1) only cell with **no modern
contamination**; (2) only cell where **first sight = the cart queue** composing the frame, on the
trunk road, with drivers — the A1 §6 first-sight grammar actually rendered; (3) only cell with
buildings on **both banks** in a low horizontal ribbon with an open town edge; (4) its failures
(bridge-instead-of-ford, missing mill, tile roofs, one fachwerk house, spire) are all
**localised, nameable edits**, unlike 777's pole/embankment systemic contamination or 12345's
composition-level bridge + one-bank layout.

## 3 · What the refinement pass must fix (binding for the next roll)

1. **The ford, not a bridge.** Remove any bridge structure in every cell; the cart road must
   descend to and cross **open shallow water** — carts standing in/awaiting the crossing, wet
   wheel ruts entering the river. This is the canon crossing (A1 §3.1, §6) and the plan's
   `one-cart-crossing` rule; a rendered bridge is a VETO on promotion.
2. **The mill-wheel housing over the race, as the one tall thing.** Exactly one 2-storey mass —
   timber mill housing with the great wheel turning in the race where it leaves the river near
   the crossing; remove every competing vertical (spire, pyramid hall, second 2-storey house).
   All three cells failed this; it is the town's signature silhouette (A1 §6) and its absence
   makes the render "a river village", not Millcross.
3. **Materials and palette back to the local set.** Split-shingle steep roofs (grey-brown, not
   red/orange tile), timber frames on stone footings with plain plastered walls — no fachwerk
   patterns, no red brick, no red lattice, no striped awnings; ash-grey / rope-brown /
   tallow-yellow overall.

Plus, mechanically: **re-roll with the block-in applied** (`control` on the depth map already
generated at briefHash 207feb8d8438ccdf, strength per ABP ladder) — `control=none` leaves the
map-derived composition unenforced, which is the root cause behind fixes 1–2.

## 4 · Rail changes (machine-check proposals)

- **RC-1** (`tools/art-forge` run guard): a roll stage labelled map-accurate must refuse
  `control == "none"` for town briefs with a committed block-in — throw when
  `runs/<brief>.json` latest render has `control:"none"` while
  `out/control/depth/<brief>-depth.png` exists at the same `briefHash`. (Data diff: run-guard
  rule `mapRollRequiresControl`, appliesTo `type:"render"`, source `reviewer:REVIEWER` +
  criteria `map-derived-concept`.)
- **RC-2** (`town-criteria.json` `antiCliche.forbiddenVocabulary`, extend `value`): add
  `"utility pole"`, `"power line"`, `"telegraph pole"` — the ABP-recorded recurring Millcross
  contamination class should be token-caught, not only eye-caught.
- **RC-3** (brief `A1-ART-02.json` mustNotShow, next revision): add `"stone bridge"`,
  `"timber bridge"`, `"bridge"` over the crossing — renders reached for a bridge in 2 of 3
  cells (3 of 3 rendered a built or formalised crossing of some kind) even though the prompt
  never contains the word; mustNotShow is the diffusion-side lever that exists for exactly this.

## 5 · Open questions for the owner

- **OQ-1:** The brief prompt says the mill-wheel housing "stands over the ford" while canon says
  "over the race" (plan: race meets the river near, not at, the ford). Recommend wording the
  refined prompt as canon has it — "over the race where it meets the river by the crossing" —
  at the same commit as the refinement brief edit. Owner's call; currently ambiguous enough to
  be steering renders wrong.
- **OQ-2:** None. The G5 quest contradiction ("Meet the road at the gate") stays open and is
  untouched by this review.

## 6 · Could not verify

Nothing material. All three images were viewed directly; the ledger was read, not summarised;
plan/criteria/brief/A1 §6 citations are from the worktree files. Machine gates
(`check_content.mjs` G-TOWN-*) were **not run** — none of them evaluates rendered pixels; this
sheet is the human-half pass the criteria file assigns to this role.
