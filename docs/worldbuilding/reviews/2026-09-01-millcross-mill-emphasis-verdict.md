# Review · A1-ART-02 Millcross — mill control-map emphasis cell (rolltag mill-emphasis, seed 12345, control "depth" @ s0.45, briefHash 60a4ce93c66997bf) — verdict

**Date:** 2026-09-01 (render 2026-09-01T14:59:02.766Z per run ledger `tools/art-forge/runs/A1-ART-02.json`, final row) ·
**Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`) ·
**Verdict #15 in the loop; #1 on the CONTROL-EMPHASIS path** — the mill control-map emphasis cell, opened
exactly as verdict #14 (`reviews/2026-09-01-millcross-materials-refine-r2-verdict.md`) prescribed in its open
question 2 and owner-approved in the landed ledger entry (`content/world/town-criteria.json:71` — "mill
control-map emphasis cell APPROVED (rolltag mill-emphasis, seed 12345, segment 0.45, mass edits per reviewer
prescription)"). One question: **do the prescribed mill mass edits (taller/left-extended darker housing,
darker distinct race slot, larger wheel shifted left over the race) visibly move the 15-roll mill fail
without opening a new veto-class fail?**

**Goal of this review, restated:** view the new cell (downscaled only), verify the four prescribed brief
edits landed, cross-check the render contract, judge the cell against the AMENDED bar (owner option b canon
amendment, same-commit) with the three passes, rule ACCEPT / ACCEPT-WITH-REFINEMENT / REJECT, and write this
one sheet — nothing else edited, no generator run, no commit.

**Reviewed:**

| File | Role |
| --- | --- |
| `tools/art-forge/out/env/A1-ART-02-mill-emphasis-seed12345-s0.45.png` | **THE CELL** — sha256 `047dbf138bdcd40e563b89fd007b0ad81ede9dcb3a432e2b5ef175dc4ceb951e`, viewed full-frame downscaled (sips -Z 1024) + five ImageMagick crops at 2.5–4× (right edge, tower top, right row, wheel/race, bottom-left band; crops in session temp only) |
| `tools/art-forge/briefs/A1-ART-02.json` | the amended brief — prescribed edits verified in data (below) |
| `tools/art-forge/runs/A1-ART-02.json` | render contract — final row cross-checked |

**Render contract:** ledger row `2026-09-01T14:59:02.766Z` — type render, seed **12345**, `control:"depth"`,
`strength:0.45`, `model:"schnell"`, `steps:8`, `cfg:1`, `denoise:1`, briefHash **`60a4ce93c66997bf`** —
matches the prescription exactly (rolltag-isolated filename `…mill-emphasis…`; the blockin rows since
14:47:21Z all carry the same new briefHash, i.e. the control map was rebuilt from the amended brief and the
depth path served it). Note: this is a **schnell/depth-path** row (steps 8, denoise 1), not the dev/anchor
img2img lineage — consistent with the prescription (control-map emphasis, not refine); the row is
self-documenting per the landed rail-3 mechanism.

**Prescribed edits verified in the brief (all four landed):**

1. `millwheel-housing` rect **[0.45, 0.28, 0.54, 0.9]**, value **#4a3a28** — present (`briefs/A1-ART-02.json:76-86`).
2. `race-channel` value **#707c84** (rect [0.53, 0.55, 0.58, 0.9], bg plane) — present (`:87-98`).
3. `mill-wheel` poly re-centred **[0.555, 0.585]**, r **0.105** (x-span 0.45–0.66, y-span 0.48–0.69), value **#3a2c1c** — present, points arithmetically consistent with centre/radius (`:223-278`).
4. Prompt contains **"steep slate roofs, with brick chimney stacks and brick plinths at their feet"** — present verbatim (`:4`).

**Canon base (amended bar, re-read the sections cited):** `docs/worldbuilding/A1-geography-cluster1.md` §6
(:355-368 — **amended same-commit per owner option b**: "mill timber, river stone, valley clay-and-lime
whitewash; slate and fired brick arrive as barge ballast landed at the ford" :361-362; mill-wheel housing
taller than the wall, nothing else competes :360-361) and §9 (:510-517 — "steep slate roofs, brick chimney
stacks and brick plinths" :513); `content/world/town-criteria.json` — `millcross-materials-lever-ledger`
owner decisions :71, `materials-by-economy` (amended :186-187), `roof-climate-coherence` (:199-203, "shingle
or slate"), `structure-not-decoration` (:191-194, decorative storybook fachwerk = forbidden REGISTER),
referencePolicy belfry/pinnacle amendment (:276-277); `content/story/style.md` two-registers law :17 and
Millcross palette :129; `forge.config.json` styleGuard era clause + segment pin 0.45 (:89-95).

**Registers:** CANON = A1 §6/§9 as amended, style.md, ratified criteria. INVENTED = brief masses/values
(traceability-tagged). PROPOSED = this sheet's verdict, rails, open questions.

**Machine gates run this review (exit codes):** `node scripts/check_content.mjs` → **exit 0, 0 failures, 34
warnings** (count unchanged); `node tools/art-forge/generate/prompt-lint.mjs` → **exit 0**; `node --test
tools/asset-storybook/tests/env-index.test.mjs` → **6/7 PASS, 1 FAIL** — the index's expected cell list
contains `A1-ART-02-mill-emphasis-seed12345-s0.45` and the served env index does **not**: **the mill-emphasis
cell was not indexed into the asset-storybook review surface** (the pre-roll indexing step that held at
#12/#14 was skipped for this cell — a process-gate break against the owner rule that every produced artifact
is observable in a review surface, not an image-content fail).

---

## Per-criterion table (three passes)

| # | Criterion | Verdict | Citation / evidence · one sentence |
| --- | --- | --- | --- |
| 1 | Slate roofs / brick stacks+plinths (#12 remaining fail 1) | **MOVED — now within amended canon** | A1 §6 :361-362 + §9 :513 + `materials-by-economy` :186 amended same-commit (owner option b); cell renders steep slate roofs, red brick stacks and plinth courses on both rows (right-row crop 2.5×); `roof-climate-coherence` :202 names slate on-law; the barge-ballast economy sentence answers Pass 2's "who ships slate to a ford town?" |
| 2 | Mill: housing taller/left-extended + DARKER | **PARTIALLY MOVED** | A1 :360-361, brief :76-86; a tall mass now stands at the mill slot (x≈0.45-0.54), rising well above wall and rooftops, extending left over the gate gap — height/position moved — but the value **did not land**: it renders light beige stone, not the authored dark #4a3a28 (tower-top crop 3×), and the register broke (criterion 4) |
| 3 | Mill: race channel darker distinct slot | **NOT MOVED** | brief :87-98 (`#707c84` bg band x 0.53-0.58); wheel/race crop 3×: no distinct darker blue-grey slot reads between tower and right row — the band area is stone parapet + shadow + glimpsed water; the race is not legible as an open water channel |
| 4 | Mill: wheel larger, shifted left over the race | **MOVED** | A1 :360 (wheel turning in the open race, taller than the wall); wheel/race crop 3×: a genuinely large wooden-spoked wheel with dark disc stands over the race position, spanning roughly x 0.53-0.64, y 0.48-0.64 — far larger than the #12-#14 parked echo and repositioned onto the slot; the 15-roll "no wheel at the mill" fail has moved for the first time |
| 5 | Mill-housing register (Pass 1/3) | **NEW FAIL — register break** | A1 :360-361 ("mill-wheel housing", timber by materials-by-economy); referencePolicy :276-277 (belfry towers, roof pinnacles/finials forbidden); tower-top crop 3×: the housing mass renders as a **crenellated stone tower with two tall arched belfry-style openings** — a castle/belfry register, not a mill housing; charter Pass 3 names castle imagery as the cliché to refuse |
| 6 | Gate tower "plain oak" (#12 remaining fail 6) | **NOT MOVED** | brief prompt :4 ("the west gate tower is plain oak"); the gate position is absorbed into the same stone tower — oak still not delivered, and the tower now competes in height even against the mill mass |
| 7 | Decorative fachwerk (#12 win to defend) | **REGRESSED — NEW FAIL (forbidden register)** | `structure-not-decoration` :191-194; right-row crop 2.5×: the right row renders full storybook black-on-white half-timber grids with curved braces — the register #12 cleared on all three surfaces is back on the right row (left row stays clean plaster) |
| 8 | Modern contamination / era | **NEW FAIL — VETO** | styleGuard era mustCompose + referencePolicy (no modern register); right-edge crop 4×: a **red modern pickup-type vehicle with dark glass and black tires** stands at the frame's right edge (≈x 1180-1280, y 430-480) in front of the right row — the #14 veto class reproduced on the segment/depth path |
| 9 | Cart queue / ford / no rival crossing (#12 fail 3) | **REGRESSED — WORSE** | A1 :363 ("First thing a traveller sees: the cart queue"), §9 :515-516; full frame: **no carts and no led animals anywhere** — the road to the ford is empty; the queue was stable-PASS since the ladder and is now absent entirely; ford-mid-stream assert remains unmet (0-for-loop, now 16 rolls) |
| 10 | Watermark / hallucinated text (#12 fail 4) | **NOT MOVED** | chronic class; full frame: large garbled white cursive block at bottom-left ("CONCEPTDA PAD WEST ELECTREV…") — the watermark persists, now bottom-left and more prominent |
| 11 | Lamp post (#12 fail 5) | **MOVED (absent)** | full frame: no lamp post renders in this cell; the flag has nothing to attach to — noted as cleared-this-cell, unmeasured singleton |
| 12 | Palette / register (gouache clause) | **PASS (frame-wide)** | style.md :129 + styleGuard :110; ash-grey sky, rope-brown/tallow masses, flat matte poster surface with grained stone — inside the lane's known register, no #14-style flat-vector flip on the sampled patches |
| 13 | Wall / composition skeleton | **HELD** | full frame: continuous stone-coped wall, single gate gap, town contained, no rival crossing, horizon as authored |
| 14 | Storybook indexing (process gate) | **FAIL** | env-index test 6/7: the cell is expected in the env index and absent from it — the review-surface owner rule is unmet until re-indexed |

## The three-pass answers, stated once

- **Pass 1 (canon):** slate/brick are inside the amended canon — the owner amendment landed same-commit and
  the cell satisfies it. But the mill housing renders as a crenellated stone belfry-registered tower, which
  is not what the canon sentence ("mill-wheel housing over the race") describes, and the cart queue the canon
  calls the town's first impression is absent.
- **Pass 2 (plausibility):** a wheel that large needs its race; the race channel is not legible, so the mill
  reads as a mounted wheel against a parapet rather than a working mill. Queue absence also empties the
  ford economy the frame exists to show.
- **Pass 3 (anti-cliché):** the crenellated tower is castle-register imagery; the right-row fachwerk is the
  forbidden storybook register; the red pickup is a modern-register break. Three separate tone-law hits.

## Cell verdict

**REJECT — with one VETO, naming the exact content that must not exist:**

1. **VETO (modern contamination, style law):** a red modern pickup-type vehicle renders at the frame's right
   edge (≈x 1180-1280, y 430-480). Era is a mustCompose style law; a modern register is forbidden by
   `referencePolicy`; a third register is forbidden outright (`content/story/style.md:17`). Same class as
   verdict #14's veto, now on the depth/segment path — the era risk is sampler-side on BOTH paths.

Supporting objections (independent of the VETO): the right row regressed to decorative fachwerk (forbidden
register, criterion 7); the cart queue — stable for the whole ladder — is absent (criterion 9); the
mill-housing mass moved in position/size but its value and register did not land (criteria 2, 5); the race
slot is not legible (criterion 3); the watermark persists (criterion 10); the storybook index gate fails
(criterion 14). The mill emphasis itself is measured **half-successful**: the wheel fail moved for the first
time in 16 rolls, the housing position moved, the darker-value and race-visibility halves did not.

## Remaining-fail checklist from verdict #12 (the PASS bar)

| #12 remaining fail | Status this cell |
| --- | --- |
| 1. Slate roofs; red brick stacks + plinths | **Moved — within amended canon** (owner option b) |
| 2. Mill: no wheel in open race / housing / column | **Half-moved** — wheel present and large, housing-position mass present; register/value/race-slot not landed |
| 3. Ford: no carts mid-stream | **Not moved — worse** (queue itself now absent) |
| 4. Text: watermark | **Not moved** (bottom-left, prominent) |
| 5. Lamp post | **Moved (absent this cell)** |
| 6. Gate tower oak register / height | **Not moved** (stone; now crenellated) |

Bar test: not every remaining fail moved, and a new veto-class fail exists — **the cell fails the PASS bar.**

## Rail changes (concrete data diffs)

- **Storybook index — re-index the mill-emphasis cell (blocking bookkeeping fix, not a test change).** The
  env-index test expects `A1-ART-02-mill-emphasis-seed12345-s0.45`; the index lacks it. Restore the pre-roll
  indexing step for this rolltag (with verdict-pending note referencing this sheet), re-run
  `node --test tools/asset-storybook/tests/env-index.test.mjs` to 7/7.
- **NEW RAIL — crenellation/battlement class.** The tower rendered crenellations + arched belfry openings at
  the mill slot; `referencePolicy` forbids belfries/pinnacles but not battlements. Diff proposal: extend
  `referencePolicy.value.forbiddenCharacteristics` (:276-277) with "crenellations, battlements and
  machicolations on non-military structures".
- **Mill-emphasis re-roll prescription (if the owner spends the next cell):** (a) housing register — name it
  timber in the prompt's mill sentence ("timber mill-wheel housing") so the stone/belfry attractor loses the
  slot; (b) race legibility — widen the race-channel band (x 0.53-0.58 → ≈0.52-0.60) and drop its value
  darker than the river's `#9aa4a8`; (c) era guard for this path — extend the landed refine era-risk note to
  read "any future cell on ANY path must be era-checked at the frame edges as well as the gate/queue region"
  (this veto surfaced at the right EDGE, a region no prior crop covered); (d) queue restoration — the
  cart-queue mass is in the brief but did not render; verify the block-in serves it before the next roll.
- **Keep the amended brief** (slate/brick sentence is canon-true and prompt-lint-clean; the mill mass edits
  are half-measured — do not revert the wheel poly that finally moved).

## Open questions for the owner

1. **Next cell:** spend the re-roll per the rail prescription above (RECOMMENDED — the wheel lever finally
   moved; the residuals are named and one cell addresses all four), or route the mill to the
   canon-amendment queue now? Recommendation: **one more control-map cell** with the corrected housing
   register + race width.
2. **Crenellation rail** — approve the `referencePolicy` extension above (criteria-file change = owner
   approval; recommended).
3. **The fachwerk regression + queue absence** — sampler-side regressions on a half-successful lever; carry
   them into the next cell's acceptance bar rather than amending anything for them (recommendation: carry,
   do not amend).
4. **G5 quest contradiction** (`content/story/quests.json` "Meet the road at the gate") — carried untouched,
   as every verdict has; no roll settles canon.

## What this review could not verify

- **briefHash `60a4ce93c66997bf` was not recomputed locally** (generator run outside review scope); verified
  by ledger internal consistency (blockin rows + render row all carry it) and prompt-lint exit 0 on the
  working-tree brief.
- **Whether the control map actually served the authored values** — I verified the brief, not the rendered
  depth PNG's pixels; the housing value's non-landing (#4a3a28 → light stone) is consistent with either
  control-to-render attenuation at s0.45 or plane-bucket painting; distinguishing those needs the block-in
  pixel sample, which I did not run.
- **Exact structure counts against mustAssert "a dozen and a half structures"** — occlusion defeats
  counting (carried from every prior review).
- **The composed positive string actually sent** is not logged; prompt-side cleanliness rests on prompt-lint
  exit 0 and code reading.
- **The full art-forge test suite** (`tools/art-forge/tests/*.test.mjs`, 233 tests at #14) was not re-run
  this review; the three gates above were.
