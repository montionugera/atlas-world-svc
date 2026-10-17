# Review · A1-ART-02 Millcross — FLUX.1-dev change-set-v3 roll (D-base, depth 0.40, briefHash 354813a7745b1c2b) — verdict

**Date:** 2026-08-30 · **Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`)
**Reviewed:** `tools/art-forge/out/env/A1-ART-02-dev-seed{12345,42424,10001}-s0.40.png` (plain dev D-base per
`forge.config.json` `samplerDev` — 20 steps, cfg 1, guidance 5.0, euler/simple, denoise 1.0; depth strength 0.40;
hires off; 1280×832). The filenames are shared with the rejected v2 cells; **the files on disk are the v3
renders** — provenance disambiguated below. Also glanced as a cross-model data point (NOT part of this roll):
`A1-ART-02-seed12345-s0.40.png` — the new brief accidentally run on the default **schnell** model at the same
strength while validating the control.
**Render contract:** brief `tools/art-forge/briefs/A1-ART-02.json` post-v3, briefHash **354813a7745b1c2b** —
confirmed against `tools/art-forge/runs/A1-ART-02.json` lines 76–83: block-ins at 10:38:49–10:39:22Z at that
hash, the schnell control render 10:42:23Z (no `dev-` in filename), then the three dev renders 10:48:13 /
10:48:59 / 10:49:39Z, each `"control":"depth","strength":0.4`, matching filenames. Ledger timestamps (UTC)
match file mtimes (local UTC+7: 17:42–17:49). Brief verified by direct read: wall flanks now
`wall-flank-left` [0.02,0.85,0.45,0.92] / `wall-flank-right` [0.55,0.85,0.99,0.92] with the gate gap x 0.45–0.55,
`millwheel-housing` narrowed to x 0.46–0.53 (race channel x 0.53–0.58), cart-queue poly crossing the river band
(y 0.63–0.70, neck x 0.45–0.53), prompt asserts "the gravel ford is the only crossing" and "the nearest carts
stand mid-stream in the shallows with water at the wheel hubs", `"the only crossing"` in `mustAssert`. The
s040 medium clause is composed (`styleGuard.mustCompose: ["era","medium"]`, `forge.config.json:105-110`).
**Canon base:** `docs/worldbuilding/A1-geography-cluster1.md:355-369` (§6 Millcross) and `:510-516` (§9 brief);
`:136` (§3.1 "fordable in a dozen places on foot, in **exactly one** by cart"); `:372-374` (pantile = Embervale);
`content/story/style.md` §1 (two-register law) and §3 (Millcross row: ash-grey / rope-brown / tallow-yellow);
`content/world/town-criteria.json` (`walled-core` :72-78, `one-cart-crossing` :122-127,
`exactly-one-two-storey` :86-92, realism `structure-not-decoration` :183-189, `map-derived-concept` :199-213,
`forbiddenPhrases` :151-158); contamination law `forge.config.json:111-139`.
**Machine gates run this review:** `node scripts/check_content.mjs` → **exit 0, 0 failures** (34 warnings, same
count as both prior reviews); `node tools/art-forge/generate/prompt-lint.mjs` → **exit 0**. Supporting (tests,
not generators): `tools/art-forge/tests/blockin.test.mjs` → **16/16 pass**, including the new GUARD "every mass
rect in the real Millcross brief is normalised 0..1"; `tools/art-forge/tests/env-graph.test.mjs` → **39/39
pass**, including both `mustCompose` tests.
**Correction of record (s040 sheet):** rail 4 (storybook wiring) landed while that review ran —
`tools/asset-storybook/env-index.json` now indexes art-forge env renders (verified: A1-ART-02 and all three v3
dev filenames present; this sheet's filename pre-referenced). The s040 statement "still no entry" is
superseded.

**Registers used below:** CANON = A1/A3/style.md/canon.md as cited. INVENTED = the brief's positive additions
(reviewer-ratified) and town-criteria reviewer values (no canon force). PROPOSED = this sheet's change set.

---

## Per-cell verdict table

| Criterion | seed12345 | seed42424 | seed10001 | Canon cite |
| --- | --- | --- | --- | --- |
| **P1 wall ring** | **FAIL** — no wall anywhere; picket fence bottom-left, third roll running | **FAIL** — low stone retaining walls + timber fences only | **FAIL** — timber fences only | brief ¶2; town-criteria `walled-core` (owner-decision 2026-08-29); A1 §6 "timber-and-earth wall" |
| **P1 gate tower** | **FAIL** — none | **PARTIAL** — stone clock-face tower over an arched base, wooden wheel bolted to its flank; wrong material (stone vs plain oak), clock face in neither canon nor brief | **PARTIAL** — tall half-timbered tower left of frame; no legible open cart passage (dark doorway under an awning, ambiguous); decorative fachwerk, not plain oak | brief ¶2 (INVENTED, d210d18) |
| **P1 venues (guild hall, inn, high street)** | **PASS** — strong awninged street; storey discipline lost (every gable reads 2-storey) | **PARTIAL** — frontages read; hall/inn not distinguishable | **PASS** — best street life of the roll (awnings, loaded carts, led animals, figures); storey discipline still lost | brief ¶2, ¶5; A1 §6 |
| **P1 ford (carts wading) / no bridge** | **FAIL** — no wading; **single-arch stone bridge over the main river**, road-level and cart-capable — third consecutive roll in this seed's lane | **FAIL** — no wading; **arched bridge (stone piers) over the river** mid-distance right — second crossing again | **PARTIAL** — **no bridge legible** (a pale right-bank structure reads as jetty/fence; low confidence — see could-not-verify); the road visibly descends into the river and a drover + led cattle stand **mid-stream** in the shallows — the first true wading of any dev roll, though no cart is unambiguously mid-stream | A1 §3.1:136 "in exactly one by cart"; brief ¶3; town-criteria `one-cart-crossing` |
| **P1 cart queue / town edge** | **PASS** queue (ox-carts with sacks/barrels in file) / **FAIL** edge (green hills to horizon) | **PARTIAL** queue (led cattle + distant line; carts thin) / **FAIL** edge (conifer forest + mountains) | **PASS** queue (longest, most legible of the roll) / **FAIL** edge (hills + haze to horizon) | brief ¶3 "longer than the town is wide", "beyond the town edge … low farmland" |
| **P2 materials (fachwerk / pantile drift)** | **FAIL** — decorative storybook fachwerk on every building; roofs read grey-brown wood shingle (the noun landed again, as in v2); red-brick chimneys | **FAIL** — saturated orange-red pantile everywhere + decorative fachwerk; worst drift, same lane as v2 | **PARTIAL** — fachwerk unchanged; roofs warm orange-brown, shingle coursing visible on nearer roofs but still saturated (improved from v2's pantile; ambiguous at available resolution) | brief ¶2; A1 §6:361-362 ("split shingle"), :372-374 (pantile = Embervale); town-criteria `structure-not-decoration` |
| **P2 mill + race/sluice placement** | **FAIL** — no mill or wheel at all | **PARTIAL** — the wheel finally exists in this lane but bolted to the stone clock tower, bank-side on the main river; no race, no sluice; the wrong mass out-competes | **FAIL** — no wheel anywhere (regression: this seed carried the roll's only wheel in v2); the tall mass is the far-left fachwerk tower, not the mill at x 0.46–0.53 | brief ¶4; A1 §6:360-361 "mill-wheel housing over the race is taller than the wall, and nothing else competes" |
| **P3 contamination (era tokens)** | **PASS** — no modern vehicles/pylons/skyline | **PASS** | **PASS** | `styleGuard.era`/`forbiddenTokens` (forge.config.json:111-139) |
| **P3 hallucinated text / off-world props** | **PASS** — no garbled lettering | **PARTIAL** — faint pale mark bottom-right corner again (same lane as v2's flag; low confidence — see could-not-verify) | **PASS** — none spotted | ABP-flux-dev-and-anchor.md:39-47 (corner/signature-text finding) |
| **P3 style register (A8 / medium clause)** | **FAIL** — glossy stylised 3D sim-key-art; same lane as both prior rolls; clause visibly did not take | **FAIL** — bright storybook 3D; same lane; clause did not take | **PARTIAL** — closest to the clause again (muted, hazy, diffuse light, pale sky) but still painterly-3D storybook illustration, not gouache on toned paper | style.md §1; DR-001 K5; forge.config.json:110; s0.30 + s040 A8 rulings |
| **Palette (ash-grey / rope-brown / tallow-yellow, overcast late afternoon)** | **FAIL** — bright blue sky, cumulus, verdant green, sunny | **FAIL** — blue sky, cumulus, saturated warm roofs | **PARTIAL** — closest again (haze, pale sky) but saturated roofs break the law | brief ¶1, ¶5; style.md §3 (C7, Millcross row); A1 §6:362-363 |

**Cell verdicts: seed12345 REJECT · seed42424 REJECT · seed10001 REJECT.** No cell is sign-off-able: all three
miss the wall ring (fourth consecutive roll); two of three breach the one-crossing law (third consecutive roll);
the material register fails in all three; the palette fails in all three. seed10001 comes closest yet to
acceptable-with-refinement — the one-crossing law holds, the first wading appears, the queue is the roll's best —
but the wall-ring failure is VETO-level and the mill has vanished from the one seed that carried it before.

**Strongest cell: seed10001** — for the second roll running: only cell with no rival crossing, the first
mid-stream wading of any dev roll, best queue and street, closest register/palette. **seed12345 second**: the
only cell where the shingle noun fully won (grey-brown roofs, zero tile), best venue street — but its stone arch
bridge breach continues and its mill is absent. **seed42424 weakest**: bridge + worst material drift + stone
clock-face tower + the suspected corner mark, the same defect set as v2.

## Per-criterion roll-up (persona vocabulary)

- **P1 wall ring — VETO (standing).** Owner-ratified (`town-criteria.json` `walled-core`) and
  `map-derived-concept` makes a render contradicting the plan fail "even if the prompt was clean". 3/3
  wall-less, fourth consecutive roll. **Attribution now shifts again**: the control demonstrably carries a wall
  band (see control-adherence) and dev still drew none — the brief-coordinates excuse is closed; what remains is
  that the band is the weakest signal in the map (thin, dark-on-mid-grey, partially occluded by the foreground
  queue poly) and dev ignores weak signals at 0.40. The exact field any further fix names is in the change set
  below; whether to spend it is the owner's (open question 2).
- **P1 ford / no bridge — VETO (standing) in 2/3.** A1 §3.1:136. Cart-capable bridges in 12345 and 42424 —
  the same rate as v2. **The bridge recurrence is not broken**: the brief now *asserts* "the gravel ford is the
  only crossing" (mustAssert-guarded, verified in the brief) and the bridge hallucinated anyway in both lanes.
  Positive assertion did not suppress it. 10001 has now held no-bridge twice consecutively.
- **P1 gate tower — STRONG OBJECTION.** Two partials; wrong material and register in both; no plain-oak open
  cart passage has ever rendered in four rolls.
- **P1 venues — PASS** (3/3; storey discipline remains the standing refinement).
- **P1 cart queue — PASS** (3/3). **Town edge — STRONG OBJECTION** (3/3 run to hills/forest; "low farmland" has
  never rendered in any roll on any strength).
- **P2 materials — STRONG OBJECTION.** Decorative storybook fachwerk in **9 of 9 dev cells across three rolls**
  — the register is invariant. Pantile improved to 1/3 (42424 only) from 2/3; the shingle noun fully landed only
  in 12345. The `forbiddenPhrases` rail (rail 2) is landed and lint-green, which proves the prompt text is clean
  and the drift is model-side.
- **P2 mill + race — STRONG OBJECTION.** The defining structure: no correct rendering in any roll ever. This
  roll the wheel appears once (42424, attached to the wrong mass) and disappears from the seed that had it —
  while the control's clearest signal (the mill column) sits exactly where the brief puts it. The race channel
  rendered in 0/3 despite the control carrying the notch.
- **P3 contamination — PASS** (3/3 clean; the era clause has held in every dev roll).
- **P3 hallucinated text — PASS**, with the seed42424 corner-mark flag (UNVERIFIED at available resolution,
  same lane as v2).
- **P3 style register — STRONG OBJECTION.** A8 conditional: failed in v2, **confirmed failed here** — see
  A8/recipe status.
- **Palette — STRONG OBJECTION.** Canon-sourced commitment (style.md §3 C7, Millcross row); 0/3 compliant;
  10001 closest again.

## Control-adherence — the decisive question from the s040 sheet

The s040 sheet's decisive question was: *the control demonstrably carries the wall band, race notch, and ford
crossing — does the render honour them?* Answer, per element, judged on the served depth map
(`out/control/depth/A1-ART-02-depth.png`, last re-blocked 10:49:00Z at 354813a7745b1c2b, viewed this review):

- **Control carries it?** **Mill column — YES, unambiguously**: the tall grey column at x≈0.46–0.53 rising from
  y≈0.36 to the town rows is the strongest object in the map. **Race notch — YES**: the dark sliver at
  x≈0.53–0.58 between the column base and the right town row is visible. **Ford crossing — YES**: the light
  queue wedge interrupts the dark river band (y 0.63–0.70) at x≈0.45–0.55. **Wall band — FAINTLY**: a thin dark
  strip at y 0.85–0.92, readable at the left margin and right of the queue; the gate break is expressed by the
  queue wedge covering x 0.45–0.55. The band is the weakest signal in the map — ≈58 px tall, dark-on-mid-grey,
  partially occluded by the foreground queue and animal polys — but it is present.
- **Did dev render what the control carried?** **Mill mass — 1/3** (42424, displaced left and fused with the
  clock tower; absent in 12345, absent-with-no-wheel in 10001). **Race as a water channel — 0/3.** **Ford
  crossing — 1/3** (10001: road enters the water, drover + cattle mid-stream; 12345/42424 keep the road on the
  bank; carts wading specifically 0/3). **Wall band — 0/3.**
- **The pattern is now measured, not guessed:** the signals dev honours are the *strong* masses (queue wedge,
  mill column — surfacing in some lane in 2/3 cells); the signals dev ignores are the *thin/dark/occluded* ones
  (wall band) and the *absence-shaped* one (the race notch is a gap, and a depth map speaks in masses, not
  gaps). The two standing P1 failures (wall, race) are exactly the two weakest control signals.
- **Cross-model corroboration (the schnell data point, not part of this roll):** the identical brief + control +
  strength on the default 8-step model rendered the control *literally* — a wooden mill tower with open
  arched cart passage at the control column's position, the road running through it and into the water, a herd
  wading at the left bank, masonry quay walls along both band edges, grey overcast sky, and no bridge. It also
  produced garbled signage (schnell's known content-control weakness) and fachwerk/tile bleed. Reading: **the
  control is now legible enough that a weaker model followed it more faithfully than dev** — the control-quality
  excuse the anchor path had is gone, and the remaining failures on dev are recipe/model-side. It also
  demonstrates the wall signal *is* renderable (schnell turned the band edges into walls everywhere) and that
  the palette clause is reachable (the only grey sky of the day came from schnell).

## A8/recipe status — the conditional stays failed

The v3 roll was not framed as an A8 test, but it functions as the confirmation roll: three seeds, the **same
three lanes** as both prior rolls — 12345 glossy stylised 3D sim-key-art, 42424 bright storybook 3D, 10001
muted painterly storybook. The medium clause is visible in no cell; blue skies in 2/3. Nothing changed on the
register axis between v2 and v3 — and since the control changed materially between them, the register failure
is now cleanly attributable to the recipe with **no control-quality excuse remaining**. Per the s0.30 sheet's
own condition and the s040 sheet's follow-up: **the A8 conditional stays failed; the recipe question stays
reopened** (open question 1). Plumbing is verified, not presumed: `mustCompose` is enforced at composition
(`env.mjs:311-315` — build fails before GPU time if a listed clause is missing) and regression-tested
(`env-graph.test.mjs:90-104`, 39/39 green), so the clause was genuinely in every prompt.

## Minimal change set for the next roll

Constraint honoured: no anchor work, no guidance change, no negative conditioning. The s040 set (control
coordinates + wading wording) is spent — landed, tested, and its effects are visible. One brief-data fix family
remains with evidence behind it; everything past it is the owner's recipe decision:

1. **Make the wall band a signal dev can't ignore, and give the race a mass instead of a gap.** In
   `tools/art-forge/briefs/A1-ART-02.json` `masses`: (a) thicken and darken the two `wall-flank-*` rects
   (e.g. y 0.82→0.93 and a near-black value) so the band survives the block-in blur and the queue occlusion;
   (b) replace the race *gap* between `millwheel-housing` and `town-row-right` with an explicit thin
   `race-channel` mass (x ≈0.53–0.58, y ≈0.55–0.90, a distinct mid value) — positive form: the race becomes a
   rendered object rather than an absence the encoder can drop. Both are coordinate/value edits in the same
   family as the s040 fix; the blockin 0..1 regression test will guard them by construction. Note the
   composition risk this edit must respect: gate gap (0.45–0.55), queue crossing (0.45–0.53) and mill column
   (0.46–0.53) already stack in one x-band — canon-correct (the mill stands at the crossing), but adding the
   race mass there must not weld the column to the right row; keep the channel value clearly distinct.
2. **Nothing else.** Depth stays 0.40. Bridge suppression, register stability, and fachwerk register are
   **explicitly out of levers under the constraint** — the bridge hallucinated through a mustAssert-guarded
   positive sentence, and the medium clause has failed across two rolls × three seeds with clean plumbing.
   Those belong to the reopened recipe decision (open question 1); this review does not prescribe anchor work.

## Rail changes (status of the four standing rails — concrete state, not proposals)

- **Rail 1 (mustCompose) — LANDED**, mechanism changed from what was proposed: enforced in `buildEnvPositive`
  (`env.mjs:311-315`) at composition time plus regression tests (`env-graph.test.mjs:90-104`), rather than in
  `prompt-lint.mjs`. Functionally stronger than the proposal (fails before GPU queueing). `prompt-lint.mjs`
  itself still does not re-check composition — acceptable; no further action.
- **Rail 2 (per-town forbiddenPhrases) — LANDED.** `content/world/town-criteria.json:155-156` carries
  `["pantile", "half-timbered", "red tile"]` with the REVIEWER v1.2 provenance note; prompt-lint exit 0 against
  the current brief. No further action.
- **Rail 3 (ledger `model` + `guidance` fields) — STILL OPEN.** The v3 entries carry
  seed/hires/control/strength/briefHash but no model or guidance; model is inferable only from the `dev-`
  filename convention. This roll supplied the missing argument: the accidental schnell run landed in the same
  filename family with no model field — a `model` field would have made the misroute self-documenting instead
  of assignment-stated. Same concrete diff as s040: add `"model"` and `"guidance"` to the render ledger entry.
- **Rail 4 (storybook wiring) — LANDED** (during the s040 review). Verified this review:
  `tools/asset-storybook/env-index.json` indexes the art-forge env renders including all three v3 cells and
  pre-references this sheet's filename. The s040 "still no entry" statement is corrected; no further action.
- **New caveat worth one rail note (no action proposed):** `blockin.test.mjs` warns the two `wall-flank-*`
  masses have 0 separation under `SEGMENT_MIN_SEPARATION` — harmless on the depth path used here, but if a
  segment-path roll is ever run on this brief, the flanks may collapse into one label around the gate gap.

## Open questions for the owner

1. **The reopened recipe decision (carried from s040, now evidence-complete).** Three rolls × three seeds;
   per-seed lanes stable; medium clause failed with verified plumbing; wall ring failed four rolls; bridge
   breached three rolls including through a mustAssert-guarded assertion. Options: (a) resume the parked
   block-in anchor path and solve its flat-vector hijack first; (b) accept manual curation of many-seed rolls;
   (c) park Millcross concept art until the recipe question closes. **Recommendation: (a)** — the v3 roll
   strengthens the case: the control is finally good enough that the anchor has something worth anchoring
   against, and the schnell run shows the control is legible to a weaker model than dev.
2. **Spend the change-set roll (change 1 above) before or after the recipe decision?** My recommendation:
   run it once, before — it is one brief edit, no recipe change, and it answers cleanly whether dev can hold
   the wall when the control signal is strong. Either outcome de-risks the anchor path (success = wall ring
   achievable on plain dev; failure = the last text+depth lever is exhausted, documented).
3. **Ratify the fachwerk register rule as style law?** Carried from s040, now 9 of 9 dev cells (and present in
   the schnell data point too). `structure-not-decoration` remains reviewer-authored with no canon force.
   Recommendation: ratify, making the register break VETO-level.

## What this review could not verify

- briefHash `354813a7745b1c2b` could not be recomputed locally (that requires running the block-in generator,
  outside this review's scope); verified against the ledger's internal consistency only — all four v3 entries
  carry the same hash, a block-in precedes each render, and ledger timestamps match file mtimes (UTC+7).
- The composed positive prompt string was not inspected (no logged dump found); `medium` composition is
  verified by code read (`env.mjs:311-315`) plus the passing `env-graph` tests, and `mustAssert` content by
  direct brief read — not by a prompt string.
- That the depth map viewed is bit-identical to the one served per render: the ledger re-writes the same out
  path per block-in and every block-in is at the same hash; the last block-in (10:49:00Z) precedes the final
  render — taken as the served map.
- The faint pale mark in seed42424's bottom-right corner (possible hallucinated signature): low confidence at
  available viewing resolution; same lane as v2; not resolvable without pixel-level tooling.
- Whether seed10001's pale right-bank structure is a jetty or a small footbridge: unresolved at available
  resolution. No crossing of the main river is legible, so the one-crossing reading stands; flagged for the
  next roll's review.
- Whether any cart (vs led animals and a drover) is truly mid-stream in seed10001: the wading parties are
  animals; no cart is unambiguously in the water. Counted as partial, not a render of the brief's exact
  "carts stand mid-stream" sentence.
- Per-render sampler parameters (20 steps / cfg 1 / guidance 5.0) are taken from `forge.config.json`
  `samplerDev`, as in both prior sheets; not independently confirmed per render (rail 3 open — the ledger
  records neither `model` nor `guidance`).
