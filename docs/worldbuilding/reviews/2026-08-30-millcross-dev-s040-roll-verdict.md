# Review · A1-ART-02 Millcross — FLUX.1-dev roll (D-base, depth 0.40, styleGuard.medium) — verdict

**Date:** 2026-08-30 · **Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`)
**Reviewed:** `tools/art-forge/out/env/A1-ART-02-dev-seed{12345,42424,10001}-s0.40.png` (plain dev D-base per
`forge.config.json` `samplerDev` — 20 steps, cfg 1, guidance 5.0, euler/simple, denoise 1.0; depth strength 0.40;
hires off; 1280×832). This roll validates change set v2 (commit **3944eba**, verified: brief ±1 line,
`forge.config.json` +1 `styleGuard.medium`, `env.mjs` +2 composition, ledger): the A8 conditional from the
2026-08-30 s0.30 verdict sheet.
**Render contract:** brief `tools/art-forge/briefs/A1-ART-02.json` post-3944eba, briefHash **76ebb95880e0a174**
— confirmed against `tools/art-forge/runs/A1-ART-02.json` lines 67–72: depth re-blocked 09:56:33Z at that hash,
three renders 09:57–09:59Z, `"control":"depth","strength":0.4`, matching filenames. `styleGuard.medium`
("gouache on toned paper… muted overcast late-afternoon light, ash-grey sky") is composed into the env positive
by `env.mjs:297,304` (code-verified). Brief material nouns now read "whitewashed plaster" / "wood-shingle roofs".
**Canon base:** `docs/worldbuilding/A1-geography-cluster1.md:355-369` (§6 Millcross) and `:510-516` (§9 brief);
`:136` (§3.1 "fordable in a dozen places on foot, in **exactly one** by cart"); `:372-374` (pantile = Embervale);
`content/story/style.md` §1; `docs/worldbuilding/DR-001-L1-scope.md:37` (K5); `content/world/town-criteria.json`
(ratified `walled-core`, `one-cart-crossing`, `exactly-one-two-storey`, realism `structure-not-decoration`,
`map-derived-concept`); contamination law `forge.config.json:104-133`.
**Machine gates run this review:** `node scripts/check_content.mjs` → **exit 0, 0 failures** (34 warnings, same
count as the s0.30 review); `node tools/art-forge/generate/prompt-lint.mjs` → **exit 0**. Note: prompt-lint does
NOT enforce `medium` presence — the s0.30 rail change 1 was not landed (no `medium` in `prompt-lint.mjs`).

**Registers used below:** CANON = A1/A3/style.md/canon.md as cited. INVENTED = the brief's positive additions
(reviewer-ratified) and town-criteria reviewer values (no canon force). PROPOSED = this sheet's change set.

---

## Per-cell verdict table

| Criterion | seed12345 | seed42424 | seed10001 | Canon cite |
| --- | --- | --- | --- | --- |
| **P1 wall ring** | **FAIL** — no wall anywhere; picket fence + riverbank stones again | **FAIL** — low stone retaining walls + timber fences only | **FAIL** — stone footings + river-edge stones only | brief ¶2; town-criteria `walled-core` (owner-decision 2026-08-29); A1 §6 "timber-and-earth wall" |
| **P1 gate tower** | **FAIL** — none | **PARTIAL** — stone clock tower over an arched base passage; wrong material (stone vs plain oak), clock face in neither canon nor brief, no iron straps | **PARTIAL** — tall half-timbered tower with arched ground passage (best gesture of the roll) but decorative fachwerk + pantile, not plain oak; competes with the mill | brief ¶2 (INVENTED, d210d18) |
| **P1 venues (guild hall, inn, high street)** | **PASS** — best high street of the roll (awnings, frontages); storey discipline still lost (most rows read 2-storey) | **PARTIAL** — frontages read; hall/inn not distinguishable | **PASS** — awnings + venue row read; best storey discipline of the roll | brief ¶2, ¶5; A1 §6 |
| **P1 ford (carts wading) / no bridge** | **FAIL** — no wading; **stone arch bridge over the main river** — escalated from s0.30's timber footbridge; second cart-capable crossing | **FAIL** — no wading; **stone arch bridge (cart-capable)** over the main river, again | **PARTIAL** — **no bridge anywhere** (only cell of either roll to hold one-crossing) but no true wading: one cart + figures on a rocky shallow mid-river, ambiguous stranded-vs-wading | A1 §3.1:136 "in exactly one by cart"; brief ¶3; town-criteria `one-cart-crossing` |
| **P1 cart queue / town edge** | **PARTIAL** queue (carts line the road; no led animals) / **FAIL** edge (town thins into green parkland hills) | **PASS** queue (canopied loaded wagons in file) / **FAIL** edge (conifer forest + mountains swallow the town) | **PARTIAL** queue (led horses/cattle + carts by the gate; shorter than "longer than the town is wide") / **FAIL** edge (green hills to horizon) | brief ¶3 "longer than the town is wide", "beyond the town edge … low farmland" |
| **P2 materials (fachwerk / pantile drift)** | **PARTIAL** — roofs now **wood shingle, zero tile** (the noun landed) but decorative storybook fachwerk framing persists; red-brick chimneys add off-town warmth | **FAIL** — heaviest drift of the roll: **saturated orange-red pantile everywhere** (Embervale's material) + decorative fachwerk; shingle noun did not land | **FAIL** — saturated orange pantile + decorative fachwerk; whitewash panels and stone footings present | brief ¶2; A1 §6:361-362 ("split shingle"), :372-374 (pantile = Embervale); town-criteria `structure-not-decoration` |
| **P2 mill + race/sluice placement** | **FAIL** — no mill or wheel at all | **FAIL** — no wheel; the clock tower is the tall mass instead | **PARTIAL** — the only mill of either dev roll: large wooden wheel under an open housing, but bank-side on the main river, **two wheels overlapping** (artifact), no sluice, **no race cut**, and not taller than the tower | brief ¶4; A1 §6:360-361 "mill-wheel housing over the race is taller than the wall, and nothing else competes" |
| **P3 contamination (era tokens)** | **PASS** — no modern vehicles/pylons/skyline | **PASS** | **PASS** | `styleGuard.era`/`forbiddenTokens` (forge.config.json:104-133) |
| **P3 hallucinated text / off-world props** | **PASS** — round emblem plaque on the left gable reads as an in-brief emblem board; no garbled lettering | **PARTIAL** — faint pale mark bottom-right corner, possibly a hallucinated signature (low confidence — see could-not-verify) | **PASS** — none spotted | ABP-flux-dev-and-anchor.md:39-47 (corner/signature-text finding) |
| **P3 style register (A8 / medium clause)** | **FAIL** — glossy stylised 3D sim-key-art; clause visibly did not take | **FAIL** — bright storybook 3D, same lane as its s0.30 cell; clause did not take | **PARTIAL** — closest to the clause (muted, hazy, diffuse light, pale sky) but still painterly-3D storybook illustration, not gouache on toned paper | style.md §1; DR-001 K5; forge.config.json:105; s0.30 sheet A8 ruling |
| **Palette (ash-grey / rope-brown / tallow-yellow, overcast late afternoon)** | **FAIL** — bright blue sky, cumulus, verdant green, sunny | **FAIL** — blue sky, saturated warm roofs | **PARTIAL** — closest to ash-grey (haze, pale sky) but saturated roofs break the law | brief ¶1, ¶5; style.md §3 (C7); A1 §6:362-363 |

**Cell verdicts: seed12345 REJECT · seed42424 REJECT · seed10001 REJECT.** No cell is sign-off-able: all three
miss the wall ring and the palette; two of three breach the one-crossing law; the material law holds in zero
cells fully.

**Strongest cell: seed10001** — the only cell with the mill (the town's defining structure), the only cell of
either dev roll with no rival crossing, and the closest register/palette. **seed12345 second**: the only cell
where the shingle noun visibly won and the best street, but its stone arch bridge is the hardest single
contradiction in the roll and its mill is absent. **seed42424 weakest**: bridge + worst material drift +
clock-face tower + the suspected corner mark.

## Per-criterion roll-up (persona vocabulary)

- **P1 wall ring — VETO.** The walled core is owner-ratified (`town-criteria.json` `walled-core`, owner decision
  2026-08-29, same-commit A1 amendment) and the realism rule `map-derived-concept` makes a render contradicting
  the plan fail "even if the prompt was clean". 3/3 cells wall-less, third consecutive roll. The exact field the
  VETO names is in the control-map finding below.
- **P1 ford / no bridge — VETO.** A1 §3.1:136 — "fordable in a dozen places on foot, in **exactly one** by cart
  — that place is Millcross". Cart-capable stone arch bridges in 2/3 cells (same VETO as the 2026-08-29 concept
  roll, where the two-arch bridge was first named). The one-crossing economy is the town's reason to exist.
- **P1 gate tower — STRONG OBJECTION.** Two partials, both wrong in material and register; neither offers the
  plain-oak open cart passage.
- **P1 venues — PASS** (present 3/3; storey discipline remains the standing refinement).
- **P1 cart queue — PASS** (reads 3/3; led animals and length remain refinements). **Town edge — STRONG
  OBJECTION** (3/3 run to hills/forest; "low farmland" has never rendered).
- **P2 materials — STRONG OBJECTION.** Pantile is Embervale's material (A1 §6:372-374) — cross-town bleed; the
  decorative storybook fachwerk register contradicts `structure-not-decoration` and the owner's 2026-08-29
  "realistic-but-fantasy, not cliché" direction.
- **P2 mill + race — STRONG OBJECTION.** The defining structure: absent in 2/3, wrong in 1/3 (bank-side, no race,
  not dominant, doubled wheel).
- **P3 contamination — PASS** (3/3 clean; the era clause keeps holding on dev at 0.40).
- **P3 hallucinated text — PASS**, with the seed42424 corner-mark flag (UNVERIFIED at available resolution).
- **P3 style register — STRONG OBJECTION** (A8 conditional failed — see ruling).
- **Palette — STRONG OBJECTION.** Canon-sourced commitment (style.md §3 C7); 0/3 compliant; 10001 closest.

## Control-map finding (new this review — load-bearing)

The depth control actually served to this roll (`out/control/depth/A1-ART-02-depth.png`, re-blocked 09:56:33Z at
the roll's briefHash) contains **no wall ring, no race cut, and no ford gap**. Root cause is in the brief, not
the recipe: `blockin.mjs:25,53-57` requires mass rects in **normalised 0..1 coordinates**, but the four
`wall-*` rects in `briefs/A1-ART-02.json` (the `masses` entries `wall-north`, `wall-south`, `wall-west`,
`wall-east`) are authored in a different space — `[2,46,94,52]`, `[2,122,94,128]`, `[2,52,8,128]`,
`[88,52,94,128]` — a 0–100-style plan grid pasted in unconverted. Under the 0..1 contract every one of those
coordinates lands far off-canvas (e.g. y=46 → 46×832 px down), so the walls are clipped to nothing — which is
exactly what the served depth map shows. The same finding covers the other two standing failures: the
mill-housing mass sits across the river band as a solid slab (no race notch), and the cart-queue poly stops at
the near bank (y ≥ 0.82 vs river band 0.63–0.70), so the ford is never modelled in the control at all.

**This re-attributes three failures across both dev rolls** (wall ring, race cut, ford wading) from
"recipe/depth strength" to **brief authoring defect**. It also falsifies the s0.30 change set's premise that
depth 0.30 → 0.40 would "hold the committed wall masses and the race cut": those masses were never committed to
the control to hold. The generator held what the control carried — the tall mill mass surfaces in 2/3 cells at
0.40 (vs 0/3 at 0.30), the queue reads 3/3 — and could not hold what it was never given. Reported per the
persona's evidence-wins rule; the conflict with the prior sheet's change-set rationale is stated, not silently
resolved.

## A8 ruling follow-up — the conditional FAILED

Three seeds, three registers again: **12345** glossy stylised 3D sim-key-art; **42424** bright storybook 3D;
**10001** muted painterly storybook. No cell reads as gouache on toned paper; the clause's "muted overcast
late-afternoon light, ash-grey sky" is visible in no cell (blue skies in 2/3; 10001 is hazy but still
illustrated). The per-seed register lanes are the **same lanes** as the s0.30 roll — the clause moved no seed
out of its lane. Per the prior sheet's own condition ("if the clause does not stabilise the register across
seeds, dev is not batch-safe and the recipe question reopens"): **the A8 conditional fails; the recipe question
reopens.** Plumbing is not the cause: `env.mjs:297,304` composes `medium` (code-verified) and the briefHash
changed, so the renders genuinely tested the clause — the failure is the clause's efficacy, not its composition.
(The un-landed prompt-lint rail left the clause unguarded, but nothing suggests it was absent from any prompt.)

## Depth 0.40 verdict

Real but partial gain, and its rationale is superseded by the control-map finding: 0.40 measurably improved
adherence to the masses the control actually carried (tall central mass in 2/3, queue 3/3 — vs near-nothing at
0.30), but it was never the wall-ring lever the s0.30 change set hoped. It also has a cost: 12345's s0.30
timber footbridge **escalated into a full stone arch bridge** — more strength amplifies unwanted masses too.
There is no headroom left (>0.40 collapses flat, `forge.config.json` strength note). Depth strength is a closed
lever for this subject.

## Material-nouns verdict

Half-landed, in 1 of 3 cells. **"Wood-shingled roofs"**: visibly landed in 12345 (weathered shingle, zero tile)
— proof the noun can win — and failed in 42424/10001, where saturated orange pantile returned. **"Whitewashed
plaster walls"**: whitewash present 3/3 but always as infill between decorative storybook framing — the
structural/register split (`structure-not-decoration`) did not survive contact with the model.

## Ford/bridge law

Held in 0/3 cells. VETO-level breaches (cart-capable stone arch bridges) in 2/3 — in 12345 a regression from
s0.30. 10001 holds "no bridge" (the only cell of either dev roll to do so) but renders no wading either. The
brief's wading sentence has now failed to render in every dev roll at both strengths — and the control map shows
why: the queue mass never reaches the water in the control.

## Minimal change set for the next roll

Constraint honoured: no anchor work, no guidance change, no negative conditioning. Given the control-map
finding, the minimal set is one data fix plus one wording fix — everything else has exhausted its lever inside
the constraint:

1. **Re-author the four `wall-*` mass rects in normalised 0..1 coordinates** (`tools/art-forge/briefs/A1-ART-02.json`
   `masses`, per the `blockin.mjs:25` contract). This is the exact field the wall-ring VETO names. Same fix
   family in the same edit: give the mill-housing mass its **race notch** through the river band, and extend the
   cart-queue poly **across the river band at the ford** so the control finally carries the wading the brief
   asserts. Exact placement is the author's; the coordinate contract is not. Without this, no strength or
   wording can render a wall, a race, or a ford — the control has never carried them.
2. **One brief wording edit (positive form, no negation): assert the single crossing.** In the cart-queue
   sentence add "the gravel ford is the only crossing" and make the wading concrete: "the nearest carts stand
   mid-stream in the shallows, water at the wheel hubs". Declare "the only crossing" in `mustAssert` so
   prompt-lint guards it. Targets the bridge hallucination (two cells, two rolls) with a positive assertion
   instead of silence.

Nothing else. Depth stays at 0.40 (no headroom; amplification cost observed). Explicitly out of remaining
levers under the constraint: register stability (A8 failed; the medium clause is exhausted) and
decorative-fachwerk suppression (positive nouns tried, half-landed). Both now belong to the reopened recipe
decision — open question 1.

## Rail changes (concrete data diffs proposed)

- `tools/art-forge/generate/prompt-lint.mjs`: fail when a composed env positive omits `styleGuard.medium`
  (s0.30 rail 1, still not landed). Concrete shape: add `"mustCompose": ["era", "medium"]` beside
  `styleGuard.medium` in `forge.config.json` and have the lint assert composition, the same mechanism that
  enforces `mustAssert`.
- `content/world/town-criteria.json` → `towns.millcross.briefs.forbiddenPhrases.value` += `["pantile",
  "half-timbered", "red tile"]` (per-town, NOT global — pantile is Embervale's legal material in its own brief;
  source `reviewer:REVIEWER v1.2`, grounded in A1 §6:372-374). Makes the cross-town material bleed a
  prompt-lint R2 throw for Millcross briefs.
- Render intake: the ledger now records `control`/`strength`/`briefHash`/`seed` per render (verified this roll)
  but not `model` or `guidance` — add both (DR-002 tagging rule, ABP-flux-dev-and-anchor.md:352-353). Carried
  from s0.30 rail 2, partially landed.
- Review surface: wire A1-ART-02 (and art-forge env renders generally) into `tools/asset-storybook/world-index.json`
  — re-verified this roll: still no entry (2026-08-15 owner rule).

## Open questions for the owner

1. **Reopened recipe decision (A8 conditional failed).** Options: (a) resume the parked block-in anchor path and
   solve its flat-vector hijack first — my recommendation: two strengths × two prompt revisions now evidence
   that text+depth cannot hold register, and change 1 above removes the control-quality excuse the anchor had;
   (b) accept manual curation of many-seed rolls as the working mode; (c) park Millcross concept art until the
   recipe question closes. Recommend (a).
2. **Ratify the fachwerk register rule as style law?** `structure-not-decoration` and the antiCliché vocabulary
   are reviewer-authored (no canon force), yet decorative storybook fachwerk has now appeared in 6 of 6 dev
   cells across two rolls. Recommendation: ratify, making register breaks VETO-level.
3. **Review-surface rule** (rail 4): decide wiring vs exempting art-forge env renders.

## What this review could not verify

- briefHash `76ebb95880e0a174` could not be recomputed locally (that requires running the block-in generator,
  outside this review's scope); verified against the run ledger's internal consistency only.
- The composed positive prompt string was not inspected (no logged dump found); `medium` composition verified by
  code read (`env.mjs:297,304`) plus the briefHash change, not by a prompt string.
- The faint pale mark in seed42424's bottom-right corner (possible hallucinated signature): low confidence at
  available viewing resolution; not resolvable further without pixel-level tooling.
- That the depth map viewed is bit-identical to the one served per render: the ledger shows the same out path
  re-written per block-in, and the 09:56:33Z entry precedes all three renders — taken as the served map.
- Per-render sampler parameters (20 steps / cfg 1 / guidance 5.0) are taken from `forge.config.json`
  `samplerDev`, as in the prior sheet; not independently confirmed per render.
