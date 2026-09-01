# Review · A1-ART-02 Millcross — materials refine, r1 (anchor-recipe img2img @ denoise 0.75 over the subject-probe cell, seed 12345, briefHash c0ef116c7e149adf unchanged) — verdict

**Date:** 2026-09-01 (render 2026-09-01T13:23:44.518Z per run ledger `tools/art-forge/runs/A1-ART-02.json`) ·
**Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`) ·
**Verdict #13 in the loop; #1 on the REFINE path** — the MATERIALS REFINE, opened exactly as verdict #12
(`reviews/2026-09-01-millcross-subject-probe-verdict.md`) prescribed in its open question 1 (a) (refine spent on
roofs + chimneys/plinths together) and open question 2 (a) (mill slot included in scope), owner-approved as one
cell, to answer one question: **does an anchor-recipe img2img pass (denoise 0.75, no ControlNet) over the
probe — the loop's first ACCEPT-WITH-REFINEMENT cell — move the three remaining material fails (slate roofs;
red brick stacks + plinths; the absent mill), and what does it cost the probe's wins?**

**Goal of this review, restated:** open and judge the refine cell against the subject-probe cell it refined
(its base), run the machine gates, answer whether the targeted fails moved and whether anything REGRESSED,
rule ACCEPT / ACCEPT-WITH-REFINEMENT / REJECT on the cell, and write this one sheet — nothing else edited, no
generator run, no commit.

**Reviewed (each opened and read at full frame; detail findings confirmed on 2.5–4× ImageMagick crops,
read-only, crops written to session temp only — 12 crops, paired refine/probe per region):**

| File | Role |
| --- | --- |
| `tools/art-forge/out/env/A1-ART-02-dev-refine-materials-r1-seed12345.png` | **THE REFINE CELL** — re-measured this review: sha256 `00a5be0a5fdbcac93ab7e8354b051ad0f5d1a080536e9dc69a29e64ae5661736` |
| `tools/art-forge/out/env/A1-ART-02-segment-subject-probe-seed12345-s0.45.png` | the refine's base — verdict #12's ACCEPT-WITH-REFINEMENT cell; re-measured **intact**, sha256 `9e10d7511d0124ad35b3d2350fb72d41a254b6df0685dc2c28c1398abf4c2cdb` (exact match to the #12 record — **the refine did not overwrite the probe**; rail 7 held, now enforced by the `--refine` rolltag guard, `env-graph.test.mjs:367`) |
| `tools/art-forge/out/env/A1-ART-02-segment-seed12345-s0.45.png` | confirmed cell upstream in the lineage; re-verified **intact**, sha256 `a5991a975339c08696506480c095434f070f57fc9163c700a7f4be9c33d0dba6` (third consecutive review to re-measure it unchanged) |

**Render contract:** ledger row `2026-09-01T13:23:44.518Z` — type render, seed **12345**, `control:"refine"`,
`strength:null`, **`refineSource:"out/env/A1-ART-02-segment-subject-probe-seed12345-s0.45.png"`** — the refined
cell is **named in the ledger, not inferred from filenames**: the rail-3-era provenance mechanism proposed in
principle at #11/#12 DID land for the input side, and it matters, because the filename
`A1-ART-02-dev-refine-materials-r1-seed12345.png` deliberately carries no `-s<N>` suffix (strength is not a
ControlNet parameter on this pass). briefHash **c0ef116c7e149adf** — identical on the probe's own row
(`2026-09-01T12:53:25.827Z`) and the refine's: the refine changes no brief data, same composed prompt; the img2img
source is the only variable between the two cells. Rolltag `materials-r1`, rail-7-isolated. Recipe: the anchor
block, re-read this review from `forge.config.json` `profiles.environment.anchor` — **dev checkpoint, 27 steps,
cfg 1, guidance 5.0, denoise 0.75**, base uploaded as-is, NO grain/blur step (the source is already textured),
no ControlNet (`env-graph.test.mjs:342` asserts exactly this shape). Sampler fields (`model`/`steps`/`cfg`/
`guidance`) still absent from the ledger row — **rail 3, NINTH roll standing** (see rails).

**Machine gates run this review (exit codes):** `node scripts/check_content.mjs` → **exit 0, 0 failures, 34
warnings** (same warning count as every prior review); `node tools/art-forge/generate/prompt-lint.mjs` →
**exit 0**; `node --test tools/asset-storybook/tests/env-index.test.mjs` → **7/7 PASS** — the refine row was
indexed pre-review with this sheet's filename pre-referenced in its `reviews` array and a verdict-pending note;
`node --test tools/art-forge/tests/env-graph.test.mjs` → **41/41 PASS**, including the two new `--refine` tests
(anchor-recipe assertions `:342`; schnell + rolltag guards `:367`); `cd tools/art-forge && node --test
tests/*.test.mjs` → **231 tests, 224 pass, 0 fail, 7 skipped** (GPU-gated), including the fixed
`forge-config.test.mjs` segment-strength pin (`:52-56`, now asserting the measured 0.45 instead of the stale
pre-ladder `null`). All five gates green.

**Canon base (re-read the sections cited):** `docs/worldbuilding/A1-geography-cluster1.md` §6 Millcross
(`:355-369` — **"the mill-wheel housing over the race is taller than the wall, and nothing else competes
with it"** `:360-361`; material local: **mill timber, river stone, split shingle** `:361`) and §9 A1-ART-02
(`:510-516` — mill housing only structure above one storey, **"steep shingled roofs"**, queue to the ford);
`content/story/style.md` `:17` ("The world speaks in two registers. Nothing is written in a third.") and `:129`
(Millcross palette row: ash-grey, rope-brown, tallow-yellow); `content/world/town-criteria.json` —
forbiddenPhrases `:150-158` (pantile/half-timbered/red tile banned **in Millcross prompt text**; renders are
the review surface), countBand `:159-169` (18), `materials-by-economy` (**fired brick is Embervale's material**;
Millcross local: mill timber, split shingle, river stone, valley clay/lime plaster), **structure-not-decoration
`:183-189` ("decorative storybook fachwerk patterns … are a forbidden REGISTER")**, map-derived-concept
`:207-213`, referencePolicy `:252-273` (forbidden: castle-scale towers, storybook pastels and glow, clean
fantasy-brochure weathering; **belfry/pinnacle amendment still unlanded**); `forge.config.json`
`profiles.environment.styleGuard` (medium clause: "Painted concept art in **gouache** on toned paper,
**visible brushwork**, muted overcast late-afternoon light, ash-grey sky"; era clause) + anchor block;
`docs/worldbuilding/ABP-flux-dev-and-anchor.md` `:35` ("**the working denoise window is 0.70–0.78, and it only
exists if the block-in carries grain**"), `:254-277` (measured window table; the window was calibrated on
**grain-attenuated colour block-ins**, not finished cells).

---

## Measurements taken this review (ImageMagick, 1280×832; RGB means + HSL over like-for-like patches)

| Patch (full-frame coords) | refine | probe | Δ |
| --- | --- | --- | --- |
| Gable plaster `60x60+400+350` | RGB 187,176,160 · H50 **S74** L174 | RGB 177,166,146 · H38 **S48** L161 | refine ~+10 L, **saturation +54%**, hue warmed; flat fill, no grain |
| Chimney stack `16x40+365+200` | RGB 85,30,23 · **H8 S168** L54 | RGB 117,83,65 · H20 **S73** L91 | **brick saturation more than doubled** (S168 vs S73); brightest-saturated surface in frame |
| Roof plane `60x40+250+300` | RGB 85,89,93 · **H180 (cyan-blue)** S32 L89 | RGB 116,111,103 · **H38 (warm grey)** S17 L109 | hue flipped warm→cool; the refine roof reads as flat slate-blue fill |
| Local contrast `64x64+600+700` | std 25.3 | std 18.3 | refine higher only because hard vector **edges** cross the patch — this is edge contrast, not grain; brushwork/paper grain absent to the eye |

The grain caveat matters: the anchor recipe's own note says grain creates the denoise window on block-ins; on
this refine the OUTPUT has no grain or brushwork at all — the register left the styleGuard medium clause.

## Per-criterion table — refine vs probe (the Δ column is what the refine did)

| # | Criterion | Verdict | Citation / evidence · one sentence |
| --- | --- | --- | --- |
| 1 | Slate → wood shingle (targeted) | **NOT MOVED — WORSE** | A1 §6 `:361` (split shingle), §9 `:513` (shingled); roof crop 3×: refine roofs are flat slate-**blue** fills (H180) with hard edges, the probe's painted slate coursing (warm grey, H38) is gone — the surface now reads as neither slate coursing nor shingle rows |
| 2 | Red brick stacks + plinths gone (targeted) | **NOT MOVED — WORSE** | `town-criteria.json` materials-by-economy (fired brick is Embervale's); chimney crop 3× + measurement: brick persists on ≥7 stacks, saturation doubled (S168 vs S73), now the most saturated mass in frame; pink plinth bands persist on the gate-adjacent building |
| 3 | Mill slot: wheel-in-race / housing / column (targeted) | **NOT MOVED in substance** | A1 §6 `:360-361` (housing over the race taller than the wall — absent 14 consecutive rolls); mill-slot crop 3×: the wheel echo is now larger and legible but still a parked wheel against houses in grass — no housing, no open race, no column; briefHash unchanged so the refine had no mill-directed text; the Δ is sampler noise inside img2img |
| 4 | Gate tower oak-register / height residuals (targeted) | **NOT MOVED — WORSE** | A1 §9 `:512` (only the mill above one storey); tower still a competing multi-storey mass; probe's small pinnacle stubs became red-tipped ornamental finials on a pyramidal cap — adjacent to the unguarded belfry/pinnacle class (referencePolicy, amendment unlanded) |
| 5 | Fachwerk stays cleared (#12 win to defend) | **REGRESSED — VETO** | `town-criteria.json:183-189`; gate-tower crop 2.5×: decorative half-timber with diagonal braces is BACK across the tower's upper stage — the probe had a clean stone tower (probe crop, same frame); this is the forbidden decoration REGISTER, re-introduced |
| 6 | Register: matte/grained gouache (#12 win to defend) | **REGRESSED — VETO** | style.md `:17` (two registers) + styleGuard medium clause (gouache, visible brushwork); the refine is flat-vector storybook illustration — hard uniform edges, flat fills, zero brushwork, flat-design clouds; the v5/v6 finding that **img2img is the dominant register force** is confirmed from the harmful side, and extended: the 0.70–0.78 window (`ABP-flux-dev-and-anchor.md:35`) was measured on grain-attenuated block-ins and does NOT hold register on a finished cell |
| 7 | Plaster plane quality (#12 win to defend) | **REGRESSED** | measured: +10 L, S48→S74, flat; the probe's on-law bright plaster crossed into the referencePolicy's "clean fantasy-brochure weathering" forbidden class — surfaces are cleaner than the era law's unpainted-wood/mud/wear register |
| 8 | Palette on-law (ash-grey / rope-brown / tallow-yellow) | **DRIFTED** | style.md `:129`; brick S168 and roof H180 dominate; grass/plaster means moved less than the full-frame impression suggests (measured — grass bank near-identical), but the saturated brick + blue roofs + cream-white plaster pull the frame off the cheap-light law toward "storybook pastels" (referencePolicy forbidden characteristic) |
| 9 | Wall / gate / queue / edge composition intact (no ControlNet — drift must be judged) | **HELD** | full-frame overlay read: wall line, west gate position, road curve, queue length and path, river bend, building masses and horizon all align with the probe; no second tall mass, no wall breach, no town-centre rewrite — denoise 0.75 preserved layout as well as it preserved everything else it shouldn't have touched |
| 10 | Watermark / text (#12 fail) | **NOT MOVED — WORSE** | corner crop 3×: the bottom-right cursive gibberish signature persists and is **sharper/darker** than the probe's grain-dissolved version |
| 11 | Lamp post (#12 fail) | **NOT MOVED** | lamp crop 3×: black iron post with cross-arm still mid-queue; era-ambiguous-props flag stands as proposed at #12 (flag-only check) |
| 12 | Queue / cart reads | **HELD** | loaded carts with canvas covers, oxen in yoke, queue longer than the town is wide — A1 §6 `:363-364` cart-queue requirement still the frame's first read |

## Targeted-fail answers, per building class

- **Roofs: FAIL DID NOT MOVE.** Slate held in hue and got flatter; wood shingle never appeared. The one lever
  hypothesis left standing after #11 (img2img would re-texture surfaces) is now measured: at the anchor operating
  point it re-surfaces toward flat vector, not toward shingle.
- **Chimneys/plinths: FAIL DID NOT MOVE.** Fired brick (Embervale's material, never in any Millcross prompt —
  sampler prior per #11/#12) survived the pass and intensified.
- **Mill: FAIL DID NOT MOVE.** 14 consecutive rolls without the canon mill. The wheel echo grew — evidence the
  slot is reachable through img2img — but a parked wheel is not "the mill-wheel housing over the race … taller
  than the wall."
- **Gate tower: residual unchanged, ornament worse.** Height competition persists; pinnacles became finials.

## Cell verdict

**REJECT — with two VETOes, each naming the exact law broken:**

1. **VETO (register, style law):** the cell is flat-vector storybook illustration, not "Painted concept art in
   gouache on toned paper, visible brushwork" (`forge.config.json` `profiles.environment.styleGuard.medium`) —
   and a third register is forbidden outright (`content/story/style.md:17`). This is a rendered-artifact breach
   of the medium clause, the same clause prompt-lint R4 asserts into every positive prompt; the prompt was
   clean, the artifact is not, and the render is the review surface.
2. **VETO (decoration register):** decorative storybook fachwerk on the gate tower — "decorative storybook
   fachwerk patterns … are a forbidden REGISTER" (`content/world/town-criteria.json:183-189`), a class the
   subject-probe had cleared and this refine reintroduced.

The VETOes stand independently; either alone kills the cell. The refine lineage terminates here: **the
subject-probe cell remains the cell of record** and the loop's best artifact. The refine cell itself is not
deleted — it is evidence (see rails), and the ledger row + storybook row stand as provenance.

## Rail changes (concrete data diffs)

- **Rail 3 — carried, NINTH roll.** The refine row still carries no `model`/`steps`/`cfg`/`guidance`. Diff
  proposal unchanged (write the four fields at render time in `env.mjs`), **plus** the two refine-only fields
  the row now proves valuable: persist `refineSource` (landed — keep) and persist the effective
  **denoise** next to it (currently recoverable only from the anchor block + code path). Note for the record:
  `refineSource` naming the input cell is the first render-time provenance field the ledger has ever carried;
  rail 3's spirit is landed, its letter (sampler fields) is not.
- **NEW RAIL — refine register guard.** The anchor window's own law says it "only exists if the block-in
  carries grain" (`ABP-flux-dev-and-anchor.md:35`); the refine ran 0.75 over a FINISHED, already-textured cell
  and the register swung to flat vector while layout held. Diff proposal: add one sentence to
  `forge.config.json` `profiles.environment.anchor._note` — "On a FINISHED cell (not a grain-attenuated
  block-in) the 0.70–0.78 window is UNMEASURED and its single sample (verdict #13) flipped register to flat
  vector; any refine of a reviewed cell must re-measure the window low first." A register check in the
  artifact gate (I-055 territory) is the machine half when one exists.
- **Materials-lever ledger entry — STILL UNLANDED, and the #12 wording is now stale.** The entry proposed at
  #11, reworded at #12, must land with the #13 measurement appended: "img2img anchor-recipe refine (denoise
  0.75) on the finished subject-probe cell: slate/brick/mill fails did not move; register broke to flat
  vector and decorative fachwerk returned — the materials-refine lever at the anchor operating point is
  measured HARMFUL on a finished cell. Remaining levers: low-denoise refine re-measure, seed change (prior
  LOW), deliberate canon amendment."
- **`referencePolicy` belfry/pinnacle amendment — still unlanded (carried, #11 OQ5 / #12 rail).** The refine's
  red-tipped finials are exactly the ornament class the amendment names. Diff proposal unchanged: add
  "church spires / belfry towers / cupola halls" and "roof pinnacles / finials" to
  `referencePolicy.value.forbiddenCharacteristics`.
- **Keep the reworded brief — reiterate (carried, #11 OQ2 / #12 rail).** Unaffected by this verdict: the
  refine changed no brief data (briefHash identical on both rows), so the keep-ruling stands on the #12
  evidence.
- **G5 quest contradiction — carried, untouched** (`content/story/quests.json` "Meet the road at the gate"
  for wall-less Millcross); no roll settles canon, this one included.

## Open questions for the owner

1. **Is the img2img materials lever dead, or re-measured low?** Options: **(a) one re-measure at low denoise
   (0.30–0.45) on the probe cell — RECOMMENDED** if the lever is pursued at all: the segment-path evidence says
   register holds at segment-adjacent strengths, and 0.75-on-a-finished-cell is now a measured harmful
   operating point, not a verdict on img2img itself; **(b) abandon the refine lever** and route the material
   fails to the canon-amendment fork (accept slate/brick as declared register drift with a per-town note) —
   defensible after 14 rolls of sampler-prior evidence, but it sets the precedent #12 warned about for the
   other five towns. My recommendation: **(a) once**, then (b)'s fork with no further spend.
2. **The mill — 14th consecutive roll.** Options unchanged from #12 OQ2, re-ranked by this verdict's
   evidence: **(a) control-map emphasis on the mill column/race masses (now RECOMMENDED)** — the wheel echo
   growing under img2img shows the slot is reachable, but no prompt-side lever has moved it in 14 rolls;
   (b) deliberate canon amendment — owner's call, only if (a) fails; (c) include the mill in any future
   low-denoise refine scope (per OQ1 (a)).
3. **Land the two criteria-file changes** (materials-lever ledger entry with the #13 wording + the
   belfry/pinnacle amendment) with the next change-set commit — both owner-approval items, both recommended.
4. **Rail-3 completion** — extend the landed `refineSource` pattern to `model`/`steps`/`cfg`/`guidance`/
   `denoise` at render time; recommended, mechanical, and it retires the oldest standing rail.

## What this review could not verify

- **briefHash `c0ef116c7e149adf` was not recomputed locally** (running the generator is outside review scope);
  verified by ledger internal consistency — the probe's row and the refine's row carry the identical hash, and
  prompt-lint exit 0 ran on the working-tree brief.
- **The refine's effective checkpoint/sampler** — the ledger row names no model (rail 3, ninth roll); dev is
  asserted by the ledger's `control:"refine"` contract, the `--refine` test (`env-graph.test.mjs:342`, "dev
  checkpoint"), and the filename's `-dev-` infix; I could not independently confirm which checkpoint produced
  the bytes.
- **Whether the flat-vector register swing is deterministic at denoise 0.75** — this is ONE cell; a second
  refine roll at the same operating point would settle determinism vs. tail-risk, and spending it is the
  owner's call (none spent for this review, per assignment).
- **Palette deltas beyond the four sampled patches** — measurements are point samples, not a frame-wide
  histogram; the register and material verdicts rest on the crops, the numbers only anchor them.
- **The probe's ~28 RGB-step plaster brightening from #12** was not re-measured against the confirmed cell
  here — the refine-vs-probe Δ (+10 L at the sampled gable) is measured, the probe-vs-confirmed Δ is cited
  from #12's sheet.
