# Review · A1-ART-02 Millcross — FLUX.1-dev change-set-v4 roll (D-base, depth 0.40, briefHash 3a66b22d4960cc77) — verdict

**Date:** 2026-08-30 · **Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`)
**Reviewed:** `tools/art-forge/out/env/A1-ART-02-dev-seed{12345,42424,10001}-s0.40.png` (plain dev D-base per
`forge.config.json` `samplerDev` — 20 steps, cfg 1, guidance 5.0, euler/simple, denoise 1.0; depth strength 0.40;
hires off; 1280×832). The filenames are shared with the rejected v2 and v3 cells; **the files on disk are the v4
renders** — provenance disambiguated below. No non-dev render occurred in the v4 window (the accidental schnell
misroute of the v3 window did not repeat).
**Render contract:** brief `tools/art-forge/briefs/A1-ART-02.json` post-v4, briefHash **3a66b22d4960cc77** —
confirmed against `tools/art-forge/runs/A1-ART-02.json` lines 87–94: guard-temp block-ins 11:05:24 / 11:06:47Z and
the real block-in 11:06:58Z at the new hash, then the three dev renders 11:07:36 / 11:08:40 / 11:09:19Z, each
`"control":"depth","strength":0.4`, matching filenames; ledger timestamps (UTC) match file mtimes (local UTC+7:
18:07–18:09) to the second. Lines 85–86 show the last old-hash (`354813a7745b1c2b`, v3) block-ins at
10:56–10:57Z, so the hash changed exactly once between the windows — after the brief edit, as expected. Brief
verified by direct read: `wall-flank-left` [0.02,**0.82**,0.45,**0.93**] / `wall-flank-right` [0.55,**0.82**,
0.99,**0.93**] (thickened from y 0.85–0.92), and the race is now an **explicit bg-plane mass** `race-channel`
[0.53, 0.55, 0.58, 0.90] with the river's value (#9aa4a8) instead of an absence-shaped gap — exactly the v3
change set. Prompt, `mustAssert` ("a dozen and a half structures", "beyond the town edge", "the only crossing"),
horizon, focal, all other masses: unchanged. No anchor text, no guidance change, no negative conditioning — the
standing constraint was honoured. The brief's `_note` records the translation finding this review confirms below:
the depth renderer paints by plane bucket (0/51/140/180), so a per-mass near-black value is not expressible on
the depth path — darkness/distinctness comes from plane membership; the channel is river-dark (bg) between the mg
column and the mg right row, and the flanks stay mg (row-toned). Session-reported test fix verified by direct
read: `tools/art-forge/tests/blockin.test.mjs:176-177` now pins the exact pair phrase (`"far-bank" and "river"`
— "34 apart — must NOT warn"), closing the dotall cross-pair match the v3 data exposed.
**Canon base:** `docs/worldbuilding/A1-geography-cluster1.md:355-369` (§6 Millcross) and `:510-516` (§9 brief);
`:136` (§3.1 "fordable in a dozen places on foot, in **exactly one** by cart"); `:372-374` (pantile = Embervale);
`content/story/style.md` §1 (two-register law) and §3 (Millcross row: ash-grey / rope-brown / tallow-yellow);
`content/world/town-criteria.json` (`walled-core` :72-78, `one-cart-crossing` :122-127,
`exactly-one-two-storey` :86-92, realism `structure-not-decoration` :183-189, `map-derived-concept` :199-213,
`forbiddenPhrases` :151-158); contamination law `forge.config.json:111-139`.
**Machine gates run this review:** `node scripts/check_content.mjs` → **exit 0, 0 failures** (34 warnings, same
count as every prior review); `node tools/art-forge/generate/prompt-lint.mjs` → **exit 0**; supporting (tests,
not generators): `tools/art-forge/tests/blockin.test.mjs` → **16/16 pass** (including the normalised-0..1 GUARD
and the pinned-pair guard) and `tools/art-forge/tests/env-graph.test.mjs` → **39/39 pass** (both `mustCompose`
tests).

**Registers used below:** CANON = A1/A3/style.md/canon.md as cited. INVENTED = the brief's positive additions
(reviewer-ratified) and town-criteria reviewer values (no canon force). PROPOSED = this sheet's open questions.

---

## Per-cell verdict table

| Criterion | seed12345 | seed42424 | seed10001 | Canon cite |
| --- | --- | --- | --- | --- |
| **P1 wall ring** | **FAIL** — no wall anywhere; whitewashed picket fence bottom-left, fourth consecutive roll in this lane | **FAIL** — low stone retaining walls + timber post-and-rail fences only, as v3 | **FAIL** — timber fences + a stone wall stub bottom-left | brief ¶2; town-criteria `walled-core` (owner-decision 2026-08-29); A1 §6 "timber-and-earth wall" |
| **P1 gate tower** | **FAIL** — none | **PARTIAL** — the stone clock-face tower again, wooden wheel mounted on its front above a timber porch; wrong material (stone vs plain oak), clock face in neither canon nor brief, wheel dry and bank-side | **PARTIAL** — tall half-timbered tower left of frame; dark doorway under an awning at its base, no legible open cart passage; decorative fachwerk, not plain oak | brief ¶2 (INVENTED, d210d18) |
| **P1 venues (guild hall, inn, high street)** | **PASS** — strong awninged street; storey discipline lost (multi-storey gables, red-brick chimneys) | **PARTIAL** — frontages read; hall/inn not distinguishable | **PASS** — best street life of the roll again (awnings, loaded carts, led animals, figures at the ford); storey discipline lost (many 2-storey masses) | brief ¶2, ¶5; A1 §6 |
| **P1 ford (carts wading) / no bridge** | **FAIL** — no wading; **single-arch stone bridge over the main river**, road-level and cart-capable — fourth consecutive roll in this lane | **FAIL** — no wading; **arched bridge (stone abutments) over the river** mid-right — third consecutive roll in this lane | **PARTIAL** — **no bridge legible (third consecutive hold)**; the road visibly descends to the water and people + led animals stand in the shallows, one man clearly mid-stream; no cart unambiguously in the water | A1 §3.1:136 "in exactly one by cart"; brief ¶3; town-criteria `one-cart-crossing` |
| **P1 cart queue / town edge** | **PASS** queue (ox-carts with sacks/barrels) / **FAIL** edge (green hills to horizon, sunny) | **PARTIAL** queue (cattle drive + distant line; carts thin) / **FAIL** edge (conifer forest + mountains) | **PASS** queue (longest, most legible of the roll) / **FAIL** edge (hills + haze to horizon) | brief ¶3 "longer than the town is wide", "beyond the town edge … low farmland" |
| **P2 materials (fachwerk / pantile drift)** | **FAIL** — decorative storybook fachwerk on every building; roofs grey-brown wood shingle (the noun landed in this lane again); red-brick chimneys | **FAIL** — saturated orange-red pantile everywhere + decorative fachwerk; worst drift again, same lane | **PARTIAL** — fachwerk unchanged; roofs saturated orange-brown with visible coursing on the nearest, still tile-register at available resolution | brief ¶2; A1 §6:361-362 ("split shingle"), :372-374 (pantile = Embervale); town-criteria `structure-not-decoration` |
| **P2 mill + race/sluice placement** | **FAIL** — no mill or wheel at all (third consecutive roll in this lane) | **PARTIAL** — the wheel again, but bolted to the stone clock tower's front, dry, bank-side on the main river; no race, no sluice; the wrong mass out-competes | **FAIL** — no wheel anywhere (second consecutive); water-side pile-buildings at the ford, but no wheel and no race channel legible | brief ¶4; A1 §6:360-361 "mill-wheel housing over the race is taller than the wall, and nothing else competes" |
| **P3 contamination (era tokens)** | **PASS** — no modern vehicles/pylons/skyline | **PASS** | **PASS** | `styleGuard.era`/`forbiddenTokens` (forge.config.json:111-139) |
| **P3 hallucinated text / off-world props** | **PASS** — no lettering; one tiny pale speck in the sky upper-right (reads as a bird; new this roll, low confidence — see could-not-verify) | **PARTIAL** — faint pale squiggle in the bottom-right corner again (same lane as the v2/v3 flag; low confidence — see could-not-verify) | **PASS** — none spotted | ABP-flux-dev-and-anchor.md:39-47 (corner/signature-text finding) |
| **P3 style register (A8 / medium clause)** | **FAIL** — glossy stylised 3D sim-key-art; same lane, third consecutive dev roll; clause visibly did not take | **FAIL** — bright storybook 3D; same lane; clause did not take | **PARTIAL** — closest again (muted, hazy, diffuse light, pale sky) but still painterly-3D storybook illustration, not gouache on toned paper | style.md §1; DR-001 K5; forge.config.json:110; s0.30 + s040 + v3 A8 rulings |
| **Palette (ash-grey / rope-brown / tallow-yellow, overcast late afternoon)** | **FAIL** — bright blue sky, cumulus, verdant green, sunny | **FAIL** — blue sky, cumulus, saturated warm roofs | **PARTIAL** — closest again (haze, pale sky, muted greens) but saturated roofs break the law | brief ¶1, ¶5; style.md §3 (C7, Millcross row); A1 §6:362-363 |

**Cell verdicts: seed12345 REJECT · seed42424 REJECT · seed10001 REJECT.** No cell is sign-off-able. The per-lane
defect sets are effectively **identical to v3**: all three miss the wall ring (fifth consecutive roll), two of
three breach the one-crossing law at the same 2/3 rate, the material register fails in all three, the palette
fails in all three, and the mill is absent or wrong in all three. seed10001 remains closest to
acceptable-with-refinement — the one-crossing law holds, wading reappears, the queue is the roll's best — but the
wall-ring failure is VETO-level and the mill/wheel is still missing from the seed that needs it most.

**Strongest cell: seed10001** — for the third roll running: only cell with no rival crossing, people and animals
in the shallows, best queue and street, closest register and palette. **seed12345 second**: the only cell where
the shingle noun fully won, best venue street — but its stone arch bridge breach is now four rolls old and its
mill is still absent. **seed42424 weakest**: bridge + worst material drift + stone clock-face tower + the
recurring corner mark — the same defect set as both prior rolls.

## Per-criterion roll-up (persona vocabulary)

- **P1 wall ring — VETO (standing).** Owner-ratified (`town-criteria.json` `walled-core`) and
  `map-derived-concept` makes a render contradicting the plan fail "even if the prompt was clean". 3/3 wall-less,
  **fifth consecutive roll**. **Attribution is now structural, and this is the roll's key finding**: the control
  change was applied exactly and the wall still did not render — but see control-adherence for why the depth path
  could only ever carry half the prescribed fix. The brief-data lever for the wall is closed by construction, not
  merely by dev's intransigence; what remains is the owner's recipe decision.
- **P1 ford / no bridge — VETO (standing) in 2/3.** A1 §3.1:136. Cart-capable bridges in 12345 and 42424 — the
  same rate as v2 and v3. The bridge hallucinated through the mustAssert-guarded "the gravel ford is the only
  crossing" sentence for the second roll running; positive assertion demonstrably does not suppress it. 10001 has
  now held no-bridge three rolls consecutively.
- **P1 gate tower — STRONG OBJECTION.** Two partials, the same two partials as v3; wrong material and register in
  both; no plain-oak open cart passage has ever rendered in five rolls.
- **P1 venues — PASS** (3/3; storey discipline remains the standing refinement, plus chimneys reading as fired
  brick in 12345 — a materials-by-economy nit inside a passing criterion).
- **P1 cart queue — PASS** (3/3). **Town edge — STRONG OBJECTION** (3/3 run to hills/forest/mountains; "low
  farmland" has never rendered in five rolls on any strength).
- **P2 materials — STRONG OBJECTION.** Decorative storybook fachwerk in **12 of 12 dev cells across four rolls**
  — the register is invariant. Pantile 1/3 (42424 only), as v3; the shingle noun fully landed only in 12345, as
  v3. The `forbiddenPhrases` rail (rail 2) is landed and lint-green: the prompt text is clean and the drift is
  model-side.
- **P2 mill + race — STRONG OBJECTION.** The defining structure: no correct rendering in any roll ever. This
  roll the wheel appears once (42424, on the wrong mass, dry-mounted — the same wrong attachment as v3) and the
  race channel renders **0/3 despite now being an explicit, distinct, dark mass in the control**. The data-fix
  lever for the race is exhausted (see loop status).
- **P3 contamination — PASS** (3/3 clean; the era clause has held in every dev roll).
- **P3 hallucinated text — PASS**, with the seed42424 corner-mark flag (UNVERIFIED, same lane as v2/v3) and a new
  low-confidence sky-speck note in 12345 (UNVERIFIED, reads as a bird).
- **P3 style register — STRONG OBJECTION.** A8 conditional: failed in v2, confirmed in v3, confirmed again here —
  three dev rolls, three stable lanes, zero visible effect of the medium clause.
- **Palette — STRONG OBJECTION.** Canon-sourced commitment (style.md §3 C7, Millcross row); 0/3 compliant;
  10001 partial and closest again.

## Control-adherence — what the applied change set bought

The v3 change set prescribed: thicken and darken the wall band; give the race a mass instead of a gap. The
session applied it within the depth path's expressiveness. Judged on the served depth map
(`out/control/depth/A1-ART-02-depth.png`, re-blocked at 3a66b22d4960cc77 before each render, viewed this review):

- **Control carries it?** **Mill column — YES, unambiguously** (unchanged: the tall light column at x≈0.46–0.53,
  y≈0.36 down to the queue occlusion, is the strongest object in the map). **Race channel — YES, and now as a
  real mass**: the bg-plane channel paints river-dark and is visibly present as a dark step rising from the river
  band between the column and the right row — a sliver at x≈0.53–0.55 along its full height, plus the wider
  x≈0.53–0.58 slice above the row top (y≈0.55–0.66). This is exactly the "dark step" the session reported.
  **Wall band — only partially, and now measurably at the path's limit**: the flanks are mg-plane, so they paint
  the same bucket (140) as the town rows they overlap; the thickening (y 0.82–0.93) deepens the merged base of
  both row blocks but cannot make a distinct band. The v3 set's "darken" half was **not expressible on the depth
  path at all** (per-mass values are ignored there — the brief `_note` records the translation, and the forge
  config's four-level measurement 0/51/140/180 is the mechanism). Queue wedge: unchanged.
- **Did dev render what the control carried?** **Wall band — 0/3** (fences, retaining walls, stubs — never a
  ring). **Race channel — 0/3** (the explicit dark mass was dropped everywhere; no cell shows a water channel
  beside or behind any tall structure). **Mill mass — 1/3** (42424, displaced onto its own stone tower at
  roughly the column's x-band; 12345 nothing; 10001's tall mass is far left of x 0.46–0.53). **Ford crossing —
  1/3** (10001: road enters the water, people + animals in the shallows; carts mid-stream 0/3). **Bridge —
  hallucinated 2/3 against a mustAssert sentence.**
- **The pattern, now complete and measured across four rolls:** the signals dev honours at depth 0.40 on this
  brief are exactly the **large light masses** (the fg queue wedge — honoured in every roll — and the mg mill
  column — honoured in some lane in most rolls). Everything else is dropped: thin bands even when thickened,
  dark masses **even when explicit and distinct**, absence-shaped gaps. The v3 reading ("dev ignores weak
  signals") is now tightened: **dev ignores dark signals too** — the race channel was the strongest dark signal
  this path can express, and it surfaced in zero cells. The recipe's effective signal vocabulary on this path is
  {large, light}.
- **Residual authoring limit worth one line:** the expressible channel is thinner than the brief's 0.05 x-width —
  the right row (mg) paints over the channel's x 0.55–0.58 overlap below y 0.66, so the distinct part is the
  x≈0.53–0.55 strip plus the step above the row top. Even a control-perfect model would see a narrow notch. This
  does not soften the verdict (the step was visible and still dropped), but it closes the door on further
  coordinate tuning: the depth path has no room left to make this signal bigger without moving canon geometry.

## A8/recipe status — the conditional stays failed

Same three lanes as v2, v3, and the s0.30 roll — 12345 glossy stylised 3D, 42424 bright storybook 3D, 10001
muted painterly storybook. The medium clause ("Painted concept art in gouache on toned paper…") is visible in no
cell; blue skies in 2/3. Nothing moved on the register axis across a roll whose control changed materially,
which leaves the recipe with no control-quality excuse. Plumbing is verified, not presumed: `mustCompose` fails
the build before GPU queueing (`env.mjs:311-315`) and is regression-tested (`env-graph.test.mjs:90-104`, 39/39
green this review), so the clause was genuinely in every prompt. **The A8 conditional stays failed; the recipe
question stays reopened** (open question 1).

## Loop status — the data-fix lever is exhausted; what remains is the owner's

The v3 sheet framed this roll as the test that answers whether dev can hold the wall and the race once the
control carries them as strong masses. It ran; here is the answer, element by element:

1. **Race — the data-fix lever is exhausted, cleanly.** The channel is now an explicit, distinct, dark mass —
   the strongest in-family signal the depth path can express — and dev dropped it in 3/3. No brief edit can make
   the race *more* present than a rendered mass. Documented; nothing further to spend here.
2. **Wall — the data-fix lever is exhausted by construction.** The v3 set's darkening half was never expressible
   on the depth path (plane-bucket painting merges the flanks into the rows they overlap), and the thickening
   half bought only a deeper merged base. There is **no remaining brief-data edit** that can make the wall a
   distinct band on this control type: coordinates are spent (thicker collides into the rows above and the frame
   below), values are not read on this path, and the only lever that would express darkness — plane membership —
   is fixed by the wall's true depth tier. Continuing to edit wall coordinates on the depth path would now be
   evidence-free.
3. **Everything else was never in the lever family:** the bridge breach (hallucinated through a guarded
   assertion, 2/3 again), the register (three dev rolls, three stable lanes), the palette (0/3), the fachwerk
   register (12/12), the town edge (5 rolls), and the mill's wrong-mass attachment are model/recipe-side, exactly
   as the v3 sheet partitioned them.
4. **v3's open question 2 (spend the change-set roll before or after the recipe decision?) is answered by this
   roll** — it was spent, and both outcomes it anticipated are now documented: the wall cannot be won on plain
   dev at depth 0.40, and the reason is now structural rather than speculative. What remains is **open question
   1, the recipe decision, which is now evidence-complete**: five rolls, the wall never rendered, the bridge
   breached three rolls including through a mustAssert sentence, the register failed three dev rolls with
   verified plumbing, and the control is as good as the brief-data family can make it — corroborated by the v3
   schnell data point, where a weaker model followed this control *more* faithfully than dev.

**No change set issues from this review.** The standing constraint (no anchor work, no guidance change, no
negative conditioning) is respected, and there is no brief-data change left whose success is not already
evidenced against. The one remaining in-family edit class — more coordinate tuning on the depth path — is
explicitly closed by finding 2 above.

## Rail changes (status of the four standing rails — concrete state, not proposals)

- **Rail 1 (mustCompose) — LANDED** (unchanged from v3): enforced in `buildEnvPositive` (`env.mjs:311-315`) at
  composition time plus regression tests (`env-graph.test.mjs:90-104`); functionally stronger than the original
  proposal. No further action.
- **Rail 2 (per-town forbiddenPhrases) — LANDED** (unchanged from v3): `content/world/town-criteria.json:155-156`
  carries `["pantile", "half-timbered", "red tile"]` with the REVIEWER v1.2 provenance note; prompt-lint exit 0
  against the current brief. No further action.
- **Rail 3 (ledger `model` + `guidance` fields) — STILL OPEN.** Verified this review: all three v4 render
  entries carry seed/hires/control/strength/briefHash but neither `model` nor `guidance`; the model is
  inferable only from the `dev-` filename convention (the v3-window schnell misroute is the standing argument
  for the field). Same concrete diff as s040/v3: add `"model"` and `"guidance"` to the render ledger entry.
- **Rail 4 (storybook wiring) — LANDED.** Verified this review: `tools/asset-storybook/env-index.json:180-207`
  indexes all three v4 cells and pre-references this sheet's filename. No further action.
- **Segment-path caveat (extends the v3 wall-flank note; no action proposed):** the blockin tests now warn
  `"river" and "race-channel"` 0 apart and `"wall-flank-left" and "wall-flank-right"` 0 apart. Both are
  same-substance by design — the channel borrows the river's value per the plane-membership translation, and the
  two flanks are one wall split by the gate gap. Harmless on the depth path used here; but if a segment-path roll
  ever runs on this brief, the channel will render inside the river's label and the two flanks as one — the race
  would vanish entirely on that control type. Recorded so the segment experiment (open question 1, option b)
  prices this in.
- **Test fix verified (no rail):** `blockin.test.mjs:176-177` pins the exact `"far-bank" and "river"` pair
  phrase ("34 apart — must NOT warn"), replacing the dotall regex that could match across different warning
  pairs. 16/16 green.

## Open questions for the owner

1. **The reopened recipe decision — now evidence-complete (carried from s040 and v3; this roll closes the
   evidence).** Five rolls; the wall never rendered; the race dropped even as an explicit dark mass; the bridge
   breached three rolls including through a mustAssert-guarded assertion; the register failed three dev rolls
   with verified plumbing; the brief-data lever is exhausted (loop status above). Options:
   (a) resume the parked block-in **anchor path** (D-anchored arm) and solve its flat-vector hijack first;
   (b) run the parked **segment-control** experiment — the only remaining control-type lever that can express
   the wall band's darkness and per-mass materials, priced against the same-substance-label caveat above and
   needing its own measured strength window (`segment.strength` is deliberately null; the F-026 0.30–0.40 depth
   window does not transfer);
   (c) accept manual curation of many-seed rolls;
   (d) park Millcross concept art until the recipe question closes.
   **Recommendation: (a)**, as at v3 — the control is now maximally good within its family, the schnell data
   point shows it is legible, and the anchor path exists precisely for this state; record (b) as the follow-up
   control experiment if the anchor window also fails on the wall.
2. **Ratify the fachwerk register rule as style law?** Carried from s040 and v3, now **12 of 12 dev cells across
   four rolls** (and present in the v3 schnell data point). `structure-not-decoration` remains reviewer-authored
   with no canon force. **Recommendation: ratify**, making the register break VETO-level.

(v3's question 2 — spend the change-set roll before or after the recipe decision — is closed by this roll: spent,
answered, documented in loop status.)

## What this review could not verify

- briefHash `3a66b22d4960cc77` could not be recomputed locally (that requires running the block-in generator,
  outside this review's scope); verified against the ledger's internal consistency only — all three v4 render
  entries and their preceding block-ins carry the same hash, the hash changes exactly once between the v3 and
  v4 windows (after the brief edit), and ledger timestamps match file mtimes (UTC+7) to the second.
- The composed positive prompt string was not inspected (no logged dump found); `medium` composition is verified
  by code read (`env.mjs:311-315`) plus the passing `env-graph` tests, and `mustAssert` content by direct brief
  read — not by a prompt string.
- That the depth map viewed is bit-identical to the one served per render: every block-in in the v4 window is at
  the same hash; the last real-path block-in (11:08:40.968Z) precedes the final render (11:09:19Z); mtime
  granularity cannot distinguish the 11:08:02 from the 11:08:40 write — same hash either way, taken as the
  served map.
- The faint pale mark in seed42424's bottom-right corner (possible hallucinated signature, flagged since v2) and
  the new pale speck in seed12345's upper-right sky (reads as a bird): both low confidence at available viewing
  resolution; not resolvable without pixel-level tooling.
- Whether any cart (vs the wading man, led animals, and cattle) is truly mid-stream in seed10001: the wading
  parties are people and animals; no cart is unambiguously in the water. Counted as partial, not a render of the
  brief's exact "carts stand mid-stream" sentence — as in v3.
- Per-render sampler parameters (20 steps / cfg 1 / guidance 5.0) are taken from `forge.config.json`
  `samplerDev`, as in all prior sheets; not independently confirmed per render (rail 3 open — the ledger records
  neither `model` nor `guidance`).
- Whether the race channel's expressible width (x≈0.53–0.55 plus the step above the row top, after the right
  row's mg overpaint) would survive a stronger model: untestable without a model/recipe change, which is the
  owner's decision; recorded as a residual authoring limit in control-adherence.
