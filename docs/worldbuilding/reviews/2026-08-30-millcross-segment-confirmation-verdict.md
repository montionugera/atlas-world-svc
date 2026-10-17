# Review · A1-ART-02 Millcross — segment confirmation roll (3 seeds @ s0.45, control segment, briefHash b7658d8607bbbe70) — verdict

**Date:** 2026-08-31 (renders 2026-08-30 18:29–18:31Z per run ledger `tools/art-forge/runs/A1-ART-02.json:173-175`) ·
**Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`)
**Verdict #10 in the loop; #2 on the SEGMENT path** — the 3-seed confirmation roll the unpark ladder verdict
(`reviews/2026-08-30-millcross-segment-unpark-ladder-verdict.md`) ordered as its change set, at the measured
operating strength 0.45. The pin `environment.segment.strength: 0.45` (`forge.config.json:89-95`) is already
landed; **sequencing deviation recorded below** (the ladder conditioned the pin on this roll landing first —
the renders ran, but this review is the conditioned gate and it happened second).

**Goal of this review, restated:** open and judge the three confirmation cells plus the segment control map
against the standing criteria, run the machine gates, rule whether the ladder's s0.45 result reproduces across
seeds (does the wall VETO stay broken; do the per-seed register lanes reproduce or flatten), rule
ACCEPT / ACCEPT-WITH-REFINEMENT / REJECT per cell, and attach the minimal change set — nothing else edited.

**Reviewed (each opened and read at full frame this review; detail findings confirmed on 2.5–4× ImageMagick
crops, read-only, crops written to session temp only — 12 crops):**

| File | Role |
| --- | --- |
| `tools/art-forge/out/env/A1-ART-02-segment-seed12345-s0.45.png` | deterministic confirmation — the 18:29Z rerun of the ladder's 18:06Z cell (same filename; original bytes overwritten) |
| `tools/art-forge/out/env/A1-ART-02-segment-seed42424-s0.45.png` | new seed lane |
| `tools/art-forge/out/env/A1-ART-02-segment-seed10001-s0.45.png` | new seed lane |
| `tools/art-forge/out/control/segment/A1-ART-02-segment.png` | control map (adherence judging) |

sha256 recorded this review (for any future rerun): 12345 `a5991a97…d0dba6` · 42424 `30168c61…56139f8` ·
10001 `493f90ff…aa70296a` · control `36322829…b77db16`. **Byte-identity of the rerun to the ladder cell is
UNVERIFIED** — the 18:06 bytes no longer exist on disk and no hash was recorded at ladder time; every ladder
finding I re-checked on the rerun reproduced (see table), which is consistent with determinism but is not a
byte measurement.

**Render contract:** brief `tools/art-forge/briefs/A1-ART-02.json` at briefHash **b7658d8607bbbe70** (unchanged
from the r3 review and the ladder — same hash on ledger rows 170-175, prompt and the three `mustAssert`
assertions unchanged on the face of the brief), `control:"segment"`, strength **0.45** on all three rows.
Prompt-lint exit 0. Sampler: ledger rows still carry **no** `model`/`steps`/`cfg`/`guidance` fields — **rail 3,
sixth roll standing.** Model=dev rests on the handoff plus code path: `resolveModel` maps dev →
`models.dev.checkpoint` + the measured `samplerDev` profile (20 steps, cfg 1, guidance 5.0,
`forge.config.json:161-168`; `env.mjs:350-368`). Note: non-depth output ids never carry the `-dev` infix
(`env.mjs:441`), so filenames cannot discriminate model — stated as an assumption served by the handoff, not a
per-render measurement.
**Control map verified by pixel sample this review (1280×832):** sky `000000`; far-bank `7D8288`; river
`9AA4A8`; town-row-left `8F8A82`; town-row-right `948E84`; mill column `5C4A34`; **mill-wheel disc `3A2C1C`
exact at [790,512]**; wall-flank-right `C6C2B6` exact at [1150,727]; both gate towers `6B5A40`; queue
`252019`≈`241F18` (blur edge); led-animals `1C1712`. 11 of my 12 probes exact at authored values under the
`-blur 0x6` rasterisation (my "ground" probe at [900,730] hit the wall-flank band — y 730 is inside the flank
rect y 0.82–0.93; probe error, not map error). **The map is fair.**
**Canon base:** `docs/worldbuilding/A1-geography-cluster1.md` §6 Millcross (`:355-369`, re-read: walled
crossing town, timber-and-earth wall, west gate, timber-framed houses on stone footings, mill-wheel housing
taller than the wall and nothing else competes, local materials, first sight is the cart queue, the wall guards
the crossing) and §9 brief (`:511`); `content/story/style.md` `:17` (two registers) and `:129` (Millcross
palette row); `content/world/town-criteria.json` — `walled-core` `:73-77`, `one-cart-crossing` `:122-126`,
`first-sight-cart-queue` `:129`, REVIEWER v1.2 material ban `:156`, `countBand` `:159-169`,
`structure-not-decoration` `:183-189`, `map-derived-concept` `:207-213`, `referencePolicy` `:252-273`
(forbidden characteristics incl. castle-scale towers — renders reviewed against characteristics, not tokens);
contamination law `forge.config.json` `styleGuard` (era "Pre-industrial and pre-electric", forbidden-token
list, medium clause); segment pin + note `forge.config.json:89-95`; `ABP-segment-control.md` (the 08-29
negative, overturned as a mechanism result by the ladder — the owed pointer is still owed); persona reading
list still cites `content/towns/town-criteria.json` for the real `content/world/town-criteria.json` (carried
doc fix).
**Machine gates run this review:** `node scripts/check_content.mjs` → **exit 0, 0 failures, 34 warnings**
(same warning count as every prior review); `node tools/art-forforge/generate/prompt-lint.mjs` → **exit 0**
(run as `tools/art-forge/generate/prompt-lint.mjs`); `node --test tools/asset-storybook/tests/env-index.test.mjs`
→ **7/7 pass**. The env-index already pins this sheet's filename on the 42424/10001 rows (`env-index.json:431-454`);
the 12345 row still points at the ladder verdict with note "Awaiting ladder verdict" (`:269-281`) — stale, see
rail changes.

**Registers:** CANON = A1 §6/§9, style.md, ratified town-criteria entries as cited. INVENTED = brief masses and
per-mass `value` colours (traceability-tagged in the brief `_note`s). PROPOSED = this sheet's cell verdicts,
lane ruling, change set, rails, and open questions.

---

## Per-cell verdict table

| Criterion | seed 12345 (rerun) | seed 42424 | seed 10001 | Canon cite |
| --- | --- | --- | --- | --- |
| **(a) wall renders as a wall** | **YES — reproduces**: continuous wall run with stone coping and timber post stubs in the bank (timber-and-earth read, A1 §6 register), town enclosed behind it, road outside, waist-to-eaves height | **PARTIAL** — a wall mass renders at the flank position but as a stone river-wall/bridge-abutment with an arched water span; the town sprawls unwalled far beyond it; no enclosure read | **FAIL** — no wall anywhere; buildings line the street directly | brief `wall-flank-right`; A1 §6:356; `walled-core` :73 |
| **(b) gate tower at the road gap** | **YES — reproduces**: timber gate tower at the gap, road passes through the base passage, queue entering (fachwerk decoration noted under (f)) | **PARTIAL** — plain square stone tower at the water gap, but its "passage" is the water-level arch of the wall's span (bridge read), not a cart gate; ashlar keep register, not plain oak | **FAIL** — no gate, no tower at any gap | brief `gate-tower-west-*`; A1 §6 "west gate"; `walled-core` :75 |
| **(c) mill wheel + housing + race** | **FAIL** — no wheel, no column (a cupola-topped cream hall occupies the column position), no race | **FAIL** — no wheel; a tall stone chimney tower adds a competing tall mass (canon: nothing else competes) | **PARTIAL — segment-path first wheel**: a true spoked paddle-wheel renders on the stone tower's flank — but mounted high, race-less, on a stone keep-register tower; placement contradicts the race/sluice geometry | brief ¶4, `mill-wheel` mass; A1 §6:360-361 |
| **(d) queue + ford + no rival crossing** | **PARTIAL**: queue PASS (long, covered loads, led cattle incl. horned oxen at the left end, receding to the gate); ford FAIL (road curves to the gate, nothing mid-stream); no rival crossing | **PARTIAL**: queue FAIL (a cattle herd replaces the carts; only distant cart specks); ford PARTIAL (herd waters at the bank, no carts in the shallows); **rival crossing read PRESENT-ambiguous** — a stone arch spans the water under the tower carrying a walkable top into town (first instance on the segment path; ladder's 9-for-9 no-rival record takes its first asterisk if the bridge read holds) | **PARTIAL**: queue PASS (long, sack-loaded, receding into haze); ford FAIL — the water reads as a stone-quayed canal, not a fordable river; no crossing at all | A1 §3.1 "in exactly one by cart"; `one-cart-crossing` :122; `first-sight-cart-queue` :129 |
| **(e) town edge** | **PASS — reproduces**: town contained behind its wall; open lowland and hazy hills beyond on the left horizon | **FAIL** — the town sprawls to both horizons, tops a castle-ruined hill, and visibly exceeds the count band (see (f) note); the "beyond" is more town | **PARTIAL** — the street strings into haze with open hills behind; edge soft but present | brief ¶3; mustAssert "beyond the town edge" |
| **(f) materials** | **FAIL — reproduces**: decorative fachwerk on the gate tower and left-row houses, grey slate roofs, red-brick chimneys (multiple) | **FAIL** — decorative fachwerk pervasive (full bracing patterns on gables), red-brown tile roofs everywhere | **FAIL** — fachwerk gables, orange-red pantile roofs, stone-keep tower | A1 §6:357; `structure-not-decoration` :183; REVIEWER v1.2 ban :156 |
| **(g) contamination (era tokens)** | **PARTIAL — reproduces**: the lamp post and the grey-blue box-on-post at the gate both render again (flagged class); otherwise clean | **PARTIAL** — saturated red crate/cart cluster by the houses; **castle-ruin backdrop = a referencePolicy forbidden characteristic rendered** (VETO-class, cell-specific — see roll-up) | **FAIL — loop's first modern-dressed human figure**: a man in a blue crew-neck t-shirt and knee-length shorts walks the road (4×), smooth 3D-shaded; era break and register break at once | `styleGuard.era` "pre-industrial and pre-electric"; `referencePolicy` :262-268 |
| **(h) hallucinated text** | **FAIL — reproduces both instances**: yellow notice panel with multi-row garbled lettering pinned in a window (4×), white cursive watermark bottom-right (4×); cart-cover marks resolve to single chalk-style glyphs, not text rows | **FAIL** — handwritten cursive signature on the water, bottom-right (4×) | **FAIL** — cursive handwriting on the road surface (4×) plus dark signboards with light glyph-marks on several buildings (generic signage vocabulary) | ABP-flux-dev-and-anchor.md text scope; I-055 |
| **(i) style register (gouache clause)** | **PARTIAL — reproduces**: matte, grained, poster-flat, gouache-adjacent; still no visible brushwork | **PARTIAL** — soft painterly hybrid: smooth shading, volumetric clouds, gentle gloss | **FAIL** — glossy 3D render register; the figure is smooth-shaded against a painterly scene | `styleGuard.medium`; style.md :17 |
| **(j) palette (ash-grey / rope-brown / tallow-yellow)** | **PASS — reproduces**: flat ash-grey overcast, grey water, muted olive/sage ground, creams/browns on-law | **PARTIAL** — muted sky, but saturated red/orange/green fields of colour across the town | **FAIL** — warm tan ground, orange roofs, blue water; the ash-grey register is gone | style.md :129; brief ¶1, ¶5 |

## Cell verdicts and strongest cell

**seed12345 s0.45: REJECT** (identical failure profile to the ladder cell it deterministically re-renders:
materials + text, plus wheel/ford). **seed42424 s0.45: REJECT** (materials + text + VETO-class castle-ruin
characteristic + rival-crossing read + edge/count overflow + register). **seed10001 s0.45: REJECT** (materials
+ text + modern-dressed figure + no wall/gate + canal read + register). **No cell earns ACCEPT or
ACCEPT-WITH-REFINEMENT today** — upgrading the rerun would bless the same fachwerk/brick/slate profile the
loop has rejected nine times, and the new lanes are strictly worse.

**Strongest cell: seed12345 — unchanged, and now confirmed.** Every ladder finding I re-checked reproduced in
detail: wall-as-wall with coping and post stubs, gate tower with the road through it, long queue with led
oxen, contained town with an open edge, on-law palette, matte register — and both text instances, the
fachwerk/slate/brick materials, the missing wheel/column/race, and the two flagged gate props. This is the
loop's first deterministic confirmation of a full-frame composition, and it is the cell the refinement track
attaches to (change set below).

## Per-criterion roll-up

| Criterion | Roll-up | Behind it |
| --- | --- | --- |
| Wall / walled-core | **PASS with lane caveat** | 12345 YES (2-for-2 runs on this cell); 42424 PARTIAL (wall mass composes, enclosure doesn't); 10001 FAIL. The standing wall VETO **stays broken on the operating cell and does not generalize across seeds** — wall-as-wall is lane-specific (1/3), as the ladder's could-not-verify anticipated |
| Gate towers | **STRONG OBJECTION** | 1/3 (12345); the passage read degrades to a water arch (42424) or vanishes (10001) |
| Mill + wheel + race | **STRONG OBJECTION** | Wheel presence 1/3 (segment-path first, on 10001) but placement canon-contradictory; race 0/3 across eleven rolls on every carrier |
| Queue / ford / one crossing | **STRONG OBJECTION** | Queue 2/3; ford 0/3 (canal read on 10001); rival-crossing first ambiguous instance (42424) |
| Town edge + count band | **STRONG OBJECTION** | 12345 PASS; 42424 renders visibly ≫ the "dozen and a half" band with the edge dissolved; exact counts remain uncountable (occlusion) except as an overflow read on 42424 |
| Materials | **STRONG OBJECTION (chronic)** | 3/3 FAIL; the loop's standing single-lever problem, now measured on a third mechanism |
| Contamination / era | **VETO on 42424 only; STRONG OBJECTION on 10001; PARTIAL on 12345** | The castle-ruin backdrop is a `referencePolicy` forbidden characteristic rendered — a style-law break on that cell (naming the exact thing that must change: the hilltop castle mass); the modern-dressed figure is an era-law failure (criterion class, as prior verdicts have treated contamination); lamp/bin reproduce as flagged props |
| Hallucinated text | **STRONG OBJECTION (worst roll of the loop)** | 3/3 FAIL — first roll where every cell carries text; corner-band text is now 3-for-3 across the roll (watermark / signature / handwriting) |
| Style register | **STRONG OBJECTION** | 1/3 matte (12345), 1/3 soft painterly, 1/3 glossy 3D |
| Palette | **STRONG OBJECTION** | 1/3 on-law (12345) |

No VETO fires on the operating cell; nothing in this roll re-opens the 08-29 mechanism reversal, and nothing
here is segment-path-specific except the lane structure itself (below).

## Control-adherence — did the renders follow the label map?

| Base mass | 12345 | 42424 | 10001 | Reading |
| --- | --- | --- | --- | --- |
| Wall flank (cream strip) | **wall run** ✓ | wall-at-river/abutment ~✓ | dropped ✗ | 2/3; the ladder's 3/3 holds only on the 12345 lane |
| Gate towers (two masses, gap) | tower at gap, through-passage ✓ | stone tower at the water gap, water-arch "passage" ~✓ | dropped ✗ | 2/3 positional, 1/3 identity |
| Mill-wheel disc (lollipop) | dropped ✗ | dropped ✗ | **rendered as a wheel** (tower flank) ~✓ | 1/3 — the disc composes on the segment path for the first time in eleven rolls, in the wrong place |
| Mill column | dropped (cupola hall) ✗ | dropped ✗ | stone tower ~✓ positional | ~1/3 |
| Cart-queue wedge | **the queue** ✓ | cattle herd (category drift) ✗ | **the queue** ✓ | 2/3 |
| River band | **painted as water** ✓ | painted ✓ | painted ✓ (canalized read) | 3/3 — still the path's signature strength |
| Race channel | dropped ✗ | dropped ✗ | dropped ✗ | 0/3, eleven rolls |
| Town rows / led animals | rows ✓, oxen ✓ | rows ✓ (overrun), herd ✓✓ | rows ✓, animals dropped ✗ | rows 3/3; animals 2/3 |

Category adherence is no longer flat across seeds — it is **lane-dependent**. The 12345 lane adheres like the
ladder cell did; 42424 spends adherence on sprawl; 10001 trades wall/gate for the wheel and the queue.

## Register and lanes — the seed lanes exist, and the segment pass does not flatten them

The roll's actual experiment (ladder could-not-verify: "whether the per-seed register attractors exist on the
segment path at all") returns **yes, they exist, and they match the cross-path per-seed pattern**: 12345 =
matte/grained/poster-flat (the on-law lane — the same lane it holds on the anchor path), 42424 = soft
painterly hybrid with smooth shading and volumetric clouds, 10001 = glossy 3D render. The r3 model "per-(seed,
flow)" amends on this evidence to **per-seed, surviving a flow change** (two flows, same seeds, same lanes).
Practical consequence: the operating strength 0.45 carries three different pictures depending on seed; the
register lever on this path is the seed dial, not the strength dial (strength's register effect, measured on
the ladder, ran 0.30 glossy → 0.45 matte → 0.60 poster for one seed).

## The landed config pin and the sequencing deviation — reported, not resolved

`forge.config.json:91` now reads `"strength": 0.45` with a `_note` citing the ladder, and the
`resolveStrength` guard (`env.mjs:411-427`) therefore no longer fires for segment (it throws only on null).
The ladder's own instruction was "do not land before the confirmation roll"; the roll rendered, but this
review — the conditioned gate — ran second. **Evidence ruling: the value survives review** (0.45 reproduces
its cell deterministically and remains the only measured on-law lane), so I do not recommend reverting; the
deviation is recorded so it is not silently inherited as process. The `env.mjs` null-guard remains meaningful
for any future unmeasured control.

## Minimal change set for the refinement roll (all measured levers, nothing new invented)

**Headline: the segment path at 0.45 is refinement-trackable but not yet sign-off-able; seed 12345 is the
carrier.** Change set, in priority order:

1. **Nothing in the brief, the prompt, `mustAssert`, the control map, or the strength.** Byte-identical
   briefHash b7658d8607bbbe70, segment @ 0.45, seed **12345** — the confirmed cell is the refinement substrate;
   introduce no variables.
2. **Materials probe (the one lever that needs owner approval):** the brief already asserts the right register
   ("timber-framed houses with whitewashed plaster on stone footings", shingle roofs) and every measured cell
   still drifted to fachwerk/tile/slate/brick — the drift is sampler-side, not brief-side. Proportionate next
   step: a **positive-only prompt rewording probe** on the same cell (candidates to owner: foreground the
   plaster wall plane — "walls of smooth whitewashed plaster, frames visible only at corners and doorheads";
   name the roof explicitly "wood-shingle roofs" without the colour adjectives that currently co-occur with
   slate). A wording change means a new briefHash — a new measurement, so: one probe cell first, not a roll.
3. **Text:** corner-band watermark/signature/handwriting and the notice lettering are sampler artifacts
   (I-055 class). Do not move strength for text (0.50+ is measured-degrading). The artifact-gate crop check
   (rail below) makes this machine-caught; seed is the only measured lever that has produced a text-clean
   cell on this path (ladder s0.60), and it costs the register lane — record, don't spend.
4. **Wheel:** keep it an anchor-flow lever (ladder open-question 3, option (a), now reinforced: 10001's wheel
   is placement-wrong, so the segment path still has not earned the wheel). Do not spend the refinement roll
   on a hybrid.
5. **Ford-in-frame:** the control map already carries the queue across the river band and every render drops
   it; no lever measured. Open, recorded.

## Rail changes (concrete data diffs)

- **Rail 3 — carried, SIXTH roll.** Ledger rows 173-175 still carry neither `model` nor `steps`/`cfg`/`guidance`
  (re-verified). Diff proposal unchanged: extend the render row with `"model","steps","cfg","guidance"` at
  write time in `env.mjs`; the env-index provenance test round-trips the ledger.
- **`era-ambiguous-props` flagged class — fourth instance family** (lamp + bin-on-post reproduce on the rerun).
  Wording unchanged from the ladder proposal: `{"id": "era-ambiguous-props", "check": "flag free-standing
  white box objects, lamp posts with closed globe heads, and bin-like objects on posts; fail only on a second
  flag in one cell"}` (12345 has exactly two flags — this rail would currently make (g) a fail on that cell;
  owner's call on the threshold, stated plainly).
- **NEW rail — no-figures-in-env:** `{"id": "no-figures-in-env", "check": "flag any human figure in an
  environment render; fail when figure clothing reads modern-register (t-shirt, shorts, printed fabric)"}` —
  10001's figure is the loop's first, and characters belong to the charsheet pipeline, not env cells.
- **NEW rail — corner-band text check:** 3/3 cells carry corner text of some class. `{"id":
  "corner-band-text", "check": "crop each cell's four corner bands at 4×; lettering-class marks fail"}` —
  machine-half of the I-055 scope.
- **Doc rail — env-index 12345 row:** append this sheet to its `reviews[]` and replace the stale
  "Awaiting ladder verdict" note (`env-index.json:269-281`) with the confirmation outcome.
- **Doc rail — carried:** persona reading list item 6 cites `content/towns/town-criteria.json`; the file is
  `content/world/town-criteria.json`. `ABP-segment-control.md` still owes its pointer to the ladder sheet.

## Open questions for the owner

1. **Path primacy + seed pin** (ladder open-question 2, now answerable): the segment path is confirmed as the
   concept-pass carrier on the 12345 lane; lanes are per-seed and survive flow changes. Recommendation: make
   the segment pass the default carrier, note seed 12345 as the register lane in the config `_note`, and keep
   the colour-base anchor flow for wheel-critical subjects. Owner's call.
2. **Materials probe approval** (change-set item 2): positive-only rewording = new briefHash = new
   measurement. Recommendation: approve one probe cell, judge before any further roll.
3. **`era-ambiguous-props` threshold:** the proposed "fail on a second flag" rule would fail the keeper cell
   as measured. Recommendation: flag-only for now, revisit after the materials probe (the props may fall with
   the same drift).
4. **Sequencing deviation** (section above): accept the retroactive cover of the config pin, or revert-and-reland
   for process hygiene. Recommendation: accept — the evidence supports the value — and record the ordering rule
   as a ps-release-workflow-style gate note if this recurs.
5. **The G5 quest contradiction (`quests.json` "Meet the road at the gate") remains open** — `town-criteria.json`
   `knownOpenItems` already marks it resolved-by-amendment pending traceability; 42424 renders a town with no
   readable cart gate and a castle backdrop, which is a reminder that no roll settles canon. No action this
   review; flagged so the confirmation is not read as having settled it.

## What this review could not verify

- **Byte-identity of the 18:29Z rerun to the ladder's 18:06Z cell** — the original bytes were overwritten
  (same filename) and no hash was recorded at ladder time; sha256 is recorded now for any future rerun. The
  deterministic claim rests on identical ledger parameters plus point-for-point finding reproduction.
- briefHash `b7658d8607bbbe70` was not recomputed locally (running the generator is outside review scope);
  verified by ledger internal consistency (rows 173-175) plus the env-index provenance test (7/7).
- Per-render sampler parameters and model (20 steps / cfg 1 / guidance 5.0 / flux1-dev): taken from
  `forge.config.json:161-168` defaults, `env.mjs:350-368` code path, and the handoff — ledger rows carry no
  such fields (rail 3, sixth roll). Non-depth filenames cannot carry the dev infix (`env.mjs:441`), so
  filenames cannot discriminate model.
- The composed positive string actually sent per render is not logged; the register-clean claim rests on code
  reading (`env.mjs` `buildEnvPositive`) + prompt-lint exit 0 this review.
- Exact structure counts against mustAssert "a dozen and a half structures": occlusion defeats counting on
  12345/10001; 42424 is measured only as a visible overflow (≫18, exact count uncountable at its sprawl).
- 42424's arched span: stone bridge (rival crossing) vs weir/wall-abutment — ambiguous at 2.5×; ruled
  PRESENT-ambiguous, not confirmed bridge. A future cell on this lane should crop that region by default.
- The ladder's s0.30 bridge question is untouched by this roll (different cell, not re-rendered here).
- Whether the 10001 wheel would re-render in-race at any measured strength: unmeasured; the wheel lever
  remains anchor-flow property per open-question 3 of the ladder.
