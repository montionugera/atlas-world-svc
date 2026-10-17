# Review · A1-ART-02 Millcross — first colour-anchor roll (D-anchored arm, briefHash 3703d78a3d4eab68) — verdict

**Date:** 2026-08-30 · **Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`)
**Verdict #6 in the loop; #1 on the resumed ANCHOR path** (this review's v4 recommendation, owner-approved).

**Reviewed:** `tools/art-forge/out/env/A1-ART-02-dev-anchor-seed{12345,42424,10001}.png`, judged against the
colour block-in base `tools/art-forge/out/control/colour/A1-ART-02-colour.png` and its grained variant
`-colour-grained.png` (both viewed this review). Corner/text detail judged on 2–3× ImageMagick crops of the
bottom strips and the focal masses (read-only; crops written to session temp only).

**Render contract:** brief `tools/art-forge/briefs/A1-ART-02.json` at briefHash **3703d78a3d4eab68**, verified
against `tools/art-forge/runs/A1-ART-02.json` lines 115–127: colour block-in → anchor render per seed, ledger
entries `"anchor":true,"strength":null` at 15:32:24 / 15:33:50 / 15:35:19Z, each preceded by a colour block-in
at the same hash. The anchor flow as code-read (`env.mjs:952-1015`): `renderColourPng` (content colours over
the REQUIRED `brief.anchor.sky` gradient — `blockin.mjs:351-392`, gradient painted as 64 interpolated strips
because ImageMagick's SVG rasteriser silently fills `url(#id)` sky black) → blur 0x6 → +noise Gaussian at
`anchor.grainAttenuate` 0.55 → upload → img2img graph (`env.mjs:646-690`: 27 steps, cfg 1, guidance 5.0,
denoise 0.75 — `forge.config.json` `anchor` block, all ABP-measured). Positive = `buildEnvPositive` output
(`env.mjs:656` conditions the anchor from the same composed string as the base pass).
**Bookkeeping honesty, carried forward:** the anchor flow's *base pass* clobbered reviewed filenames twice —
first run without `--strength` defaulted 0.30 and overwrote the three reviewed dev-s0.30 cells (ledger
107–114; env-index OVERWRITTEN notes, briefHash 47928a1704220c52 lost); re-run staged `--strength 0.40` and
overwrote the dev-s0.40 cells the same way (ledger 117/121/125 vs anchor 119/123/127; env-index notes
193/209/225). The three anchor files under review are untouched by this and correctly ledgered.
**Canon base:** `docs/worldbuilding/A1-geography-cluster1.md:355-369` (§6 Millcross) and `:510-516` (§9 brief);
`:136` (§3.1 "fordable in a dozen places on foot, in **exactly one** by cart"); `:372-374` (pantile =
Embervale, not here); `content/story/style.md` §1 (two-register law) and §3:129 (Millcross row: ash-grey /
rope-brown / tallow-yellow); `content/world/town-criteria.json` (`walled-core` :73, `one-cart-crossing` :122,
`structure-not-decoration` :183, `map-derived-concept` :207, `forbiddenPhrases` :151); contamination law
`forge.config.json:110-139` + `ABP-flux-dev-and-anchor.md:39-47` (anchored-corner watermark finding) and
`:199-308` (Job 2: window 0.70–0.78, grain law, 3–4 %-of-frame-width survival floor).
**Machine gates run this review:** `node scripts/check_content.mjs` → **exit 0, 0 failures** (34 warnings,
same count as every prior review); `node tools/art-forge/generate/prompt-lint.mjs` → **exit 0**; supporting
tests: `blockin.test.mjs` **19/19**, `env-graph.test.mjs` **39/39**, storybook `node --test
"tools/asset-storybook/tests/*.test.mjs"` **93/93** (the bare-directory invocation fails spuriously — use the
glob). All session-reported counts reproduce exactly.

**Registers:** CANON = A1/style.md/canon.md as cited. INVENTED = brief positive additions and town-criteria
reviewer values (no canon force). PROPOSED = this sheet's change sets and open questions.

---

## Per-cell verdict table

| Criterion | seed12345 | seed42424 | seed10001 | Canon cite |
| --- | --- | --- | --- | --- |
| **P1 wall ring** | **FAIL** — no ring; a short stone wall stub runs right of the gate only | **FAIL** — no wall anywhere; fence + lakeside causeway | **FAIL** — post-and-wire fence along the road, no ring | brief ¶2; town-criteria `walled-core` :73; A1 §6 "timber-and-earth wall" |
| **P1 gate tower** | **PARTIAL — best of six rolls**: a stone gatehouse *with a genuinely open cart passage* over the road (hipped roof, finial); wrong material (dressed stone vs plain oak) | **FAIL** — none | **FAIL** — the crenellated tower has a doorway, not a cart passage | brief ¶2 (INVENTED, d210d18) |
| **P1 venues (guild hall, inn, high street)** | **FAIL** — no town at all: one distant shed, open plain otherwise | **PARTIAL** — a row of shingled roofed-wagons reads as the road-camp (A1 §6:367-368 canon-adjacent), no hall/inn/street | **PARTIAL** — real streets of houses on both banks; hall/inn not distinguishable; many 2-storey masses | brief ¶2, ¶5; A1 §6 ("only the mill housing above one storey") |
| **P1 ford (carts wading) / no bridge** | **PARTIAL** — wet ford-approach track with water sheen; nothing in the water; **no bridge** | **FAIL** — water is a lakeside edge with a jetty; no ford, no crossing; no bridge | **FAIL** — river present behind the drove; nobody crosses, nothing wades; no bridge | A1 §3.1:136 "in exactly one by cart"; brief ¶3; town-criteria `one-cart-crossing` :122 |
| **P1 cart queue / town edge** | **PASS** queue (the roll's only true ox-cart queue: yokes, spoked wheels, tallow sacks) / **PARTIAL** edge (open plain + low hills — closest yet, still not "low farmland") | **PARTIAL** queue (parked wagon row, not a moving loaded queue) / **FAIL** edge (snowy mountains) | **PARTIAL** queue (long yoked drove with sacks, but **no carts at all**) / **FAIL** edge (forested hillside + mountains) | brief ¶3 "longer than the town is wide", "beyond the town edge … low farmland" |
| **P2 materials (fachwerk / pantile drift)** | **PARTIAL — first cell in six rolls with zero fachwerk**: plaster, timber trestle, stone, grey-brown shingle; one red-brick chimney | **FAIL** — decorative fachwerk chapel + house; shingle roofs | **FAIL** — decorative fachwerk on nearly every cottage; brown tile-register roofs; red chimney pots | brief ¶2; A1 §6:361-362 ("split shingle"), :372-374; town-criteria `structure-not-decoration` :183 |
| **P2 mill + race/sluice placement** | **FAIL** — the column's x-band rendered as a timber **trestle water-tower**; no wheel, no race | **FAIL** — the column's x-band rendered as a fachwerk **chapel spire**; no wheel, no race | **FAIL** — the column's x-band rendered as a **crenellated tower**; no wheel, no race | brief ¶4; A1 §6:360-361 "mill-wheel housing over the race … nothing else competes" |
| **P3 contamination (era tokens)** | **PASS** — clean | **FAIL — VETO (cell)**: a **telegraph/telephone pole line with crossarms and sagging wires** runs along the road to the horizon (confirmed at 2.5×; near pole wires into the tower) | **PASS** — clean | `styleGuard.era` (forge.config.json:111); era law "pre-industrial and pre-electric" |
| **P3 hallucinated text** | **PARTIAL** — a posted bill in the tower window with illegible coloured text-scribbles (confirmed at 3×); corners clean | **PASS** — no lettering found; corners clean | **FAIL** — a yellow plaque with a **legible white numeral "8"**, bolted, on the focal tower (confirmed at 3×); corners clean | ABP-flux-dev-and-anchor.md:39-47; the anchored text defect has **migrated from corners to focal signage** |
| **P3 style register (A8 / medium clause)** | **FAIL** — crisp flat cel-shaded 2D, clean ink linework (the styleLaws register won; see ruling) | **FAIL** — painterly/3D storybook hybrid (the old A8 swing, back) | **FAIL** — flat cel-2D anime-background style | style.md §1; forge.config.json:110; env.mjs:303-310 |
| **Palette (ash-grey / rope-brown / tallow-yellow, overcast late afternoon)** | **PARTIAL** — grey overcast sky, tallow horizon and sacks, rope-brown oxen; muted green pasture to horizon | **FAIL** — pale **blue** sky, snowy mountains | **PARTIAL** — grey-blue overcast held best, cream cumulus, muted greens | brief ¶1, ¶5; style.md §3:129; A1 §6:362-363 |

**Cell verdicts: seed12345 REJECT · seed42424 REJECT · seed10001 REJECT.** The standing VETO criterion
(wall ring, owner-ratified) fails in all three, so no cell is sign-off-able — but for the first time the
rejections are refinement-shaped, not lane-shaped: the composition, sky, queue and gate problems that
doomed five dev rolls are materially *better* here, and the new failures (a plaque, a pole line) are
single-element, not structural.

**Strongest cell: seed12345** — best palette of the entire loop, the first genuine gate-house cart passage,
the only true loaded ox-cart queue, the only fachwerk-free cell, clean contamination. **seed10001 second**:
the only cell where the *town exists* (rows on both banks at the base's heights), best sky after 12345 —
but the hallucinated "8" plaque sits dead on the focal mass and the carts vanished. **seed42424 weakest**
(fifth roll running in its lane): blue sky, mountains, the telegraph line, a fachwerk chapel on the mill's
x-band, no ford.

## Per-criterion roll-up (persona vocabulary)

- **P1 wall ring — VETO (standing).** Owner-ratified (`walled-core`) and `map-derived-concept` fails any
  render contradicting the plan. 0/3 here; every roll of every path so far. The wall band dropped on the
  anchor path too — see control-adherence for the measured reason and the one remaining lever.
- **P1 gate tower — STRONG OBJECTION, improving.** First open cart passage in six rolls (12345, wrong
  material). The passage has *never* been the failure; the material has never once been plain oak.
- **P1 venues — STRONG OBJECTION.** No cell renders a distinguishable hall/inn/high street; 12345 renders no
  town. Storey discipline (only the mill above one storey) is broken wherever buildings exist.
- **P1 ford / one-crossing — STRONG OBJECTION, with a first: no rival crossing in 3/3.** The dev path
  hallucinated cart-capable bridges in 2 of 3 cells for three consecutive rolls; the anchor path, whose base
  draws no bridge, drew no bridge in any cell. The mustAssert sentence is honoured — though vacuously in
  42424/10001, where no crossing of any kind renders. Carts mid-stream: 0/3.
- **P1 cart queue — PASS** (3/3 a long led line; quality varies; carts as wheeled objects 1/3).
  **Town edge — STRONG OBJECTION** (6 rolls; "low farmland" has never rendered; 12345's open plain + low
  hills is the closest approach).
- **P2 materials — STRONG OBJECTION, dividing.** Fachwerk: 2/3 here, vs 12/12 dev cells — 12345 is the
  first fachwerk-free cell of the loop, which is direct evidence the register is prompt-weight-sensitive,
  not fixed. Pantile: absent on the anchor path (1/3 lanes on dev). Brick chimneys recur as a nit.
- **P2 mill + race — STRONG OBJECTION (the loop's oldest wound).** The column's position is honoured 3/3 —
  the anchor reliably builds *a tall thing* there — but it has never been a mill: 0 wheels, 0 races in six
  rolls across both paths. The base never drew a wheel (below-3–4 % logic does not apply — a
  "taller than the wall" wheel is a large mass that was simply never drawn). This is now the clearest
  untried lever on the board; see change set.
- **P3 contamination — PASS 2/3; VETO on seed42424.** The telegraph-pole line is the first hard era-law
  break of the entire loop (the styleGuard.era clause has held everywhere else). A style-law break is a
  VETO per persona; it kills this cell but not the path.
- **P3 hallucinated text — the corner defect did NOT reproduce; it migrated.** Corners clean 3/3 (2×
  crops). But the anchored painterly/canvas trigger the ABP documented for corners surfaced instead as
  focal signage: a legible numeral plaque (10001) and a text-scribbled window bill (12345). The ABP's
  artifact gate (I-055) should therefore key on **text-like regions anywhere**, not corners only.
- **P3 style register — STRONG OBJECTION, with a new attribution** — see the register ruling.
- **Palette — PARTIAL, the best showing of the loop.** The sky gradient held in 2/3 (grey overcast,
  tallow horizon); blue sky survives only in the one painterly-register cell.

## Control-adherence — did the renders follow the colour base?

Judged per mass, base (`A1-ART-02-colour.png`) vs each render:

| Base mass | seed12345 | seed42424 | seed10001 | Reading |
| --- | --- | --- | --- | --- |
| **Sky gradient** (#71787f→#cdc3ac) | **HELD** — grey zenith, tallow horizon | **DROPPED** — pale blue + cumulus | **HELD** — grey-blue, cream clouds | Content-colour sky is readable to the sampler; it lost only where the register swung painterly |
| **Cart-queue** (fg dark wedge) | **HELD** — the ox-cart queue | **HELD** — the wagon row | **HELD** — the drove | 3/3: the strongest signal, as on the depth path |
| **Mill column** (tall brown, x .46–.53) | **HELD positionally** (trestle tower) | **HELD positionally** (chapel spire) | **HELD positionally** (crenellated tower) | 3/3 a tall mass at the right x — but a column is not a mill; no wheel was ever drawn |
| **River band** (bg, full width) | partial — wet ford track only, right side | **DROPPED** — became mountains + right-edge lake | **HELD** — river at the right height, left half | Mid-size light band: 1–2/3, first renderings of the river in the loop |
| **Town rows** (mg taupe, both banks) | **DROPPED** — open plain | **MORPHED** — the rows became the wagon row | **HELD** — buildings on both banks at the row heights | 1–2/3; where the queue wedge doesn't dominate, rows render as architecture |
| **Wall flanks** (dark bands y .82–.93) | **DROPPED** (stone stub only) | **DROPPED** | **DROPPED** (fence instead) | 0/3 on the anchor path too — the wall is now 0-for-everything |
| **Race channel** (pale sliver x .53–.58) | **DROPPED** | **DROPPED** | **DROPPED** | 0/3; a thin light strip is below the survival floor, same as on depth |
| **Led-animals** (fg bottom-right) | merged into queue | grazing beast | the drove's tail | fine |
| **Unpainted bottom-right ground** (cream hole in the base) | grass/track | rocks + water | road + fence | The base's own coverage hole invites invention — worth patching regardless |

**The pattern, one roll of evidence:** on the anchor path, **large masses hold regardless of value** (the
dark queue 3/3, the light column 3/3, the sky 2/3); **thin strips drop regardless of value** (wall 0/3, race
0/3). This matches the ABP's scale finding (below ~3–4 % of frame width does not survive) generalised to
*narrow-ness*, not just smallness — and it means the wall's problem on this path is geometric (band
thinness + low contrast against the rows it abuts), not the depth path's plane-bucket problem. There is
finally a lever left: **value is content here** — contrast and drawn form are expressible, unlike depth.

## Register ruling — the styleLaws.positive conflict is now measured, not theoretical

The composed env positive is, in order: brief prose → `styleLaws.positive` ("crisp flat 2D anime
illustration") → `styleLaws.renderAssertion` ("hand-drawn 2D cel-shaded artwork", "clean ink linework over
painted flat colour") → era → **medium ("Painted concept art in gouache on toned paper…")** →
`styleClause` (`env.mjs:303-310`). The conflict flagged for this review is real, structural, and
**decided itself in the render**: seed12345 and seed10001 are precisely the styleLaws register — crisp flat
cel-shaded 2D with clean ink linework, the first cells of the loop to match *any* declared style
vocabulary — while the gouache medium clause is visible in **0/3**, as it was in 0/12+ on dev. The cel
vocabulary sits earlier in the string and is concrete ("2D", "cel-shaded", "ink linework") where the medium
clause is materials-technical ("gouache", "toned paper"); the model resolves the fight for the concrete
early clause. seed42424 shows what the anchor does when neither wins decisively: the old A8 swing.

**Ruling:** this is no longer "the clause visibly did not take" (v4's wording) — the competing clause took.
Two defensible fixes exist, and they are a genuine owner decision because the *target register itself* is
the question:

- **(a) Environments are concept art (keep gouache):** remove the character-path vocabulary from the env
  composition and promote `medium` to the head of the string. The styleLaws arrays are documented as
  character-calibration ("RO proportion × Genshin-detail class artwork", style-laws.json `_note`) — their
  presence in an env prompt is a category error, not a tuning issue.
- **(b) Environments must match the game's cel look:** ratify the cel register for envs — replace
  `styleGuard.medium`'s text with the cel vocabulary and delete the gouache clause. This is coherent with
  set-coherence against the character pipeline, and 2/3 of this roll already comply for free.

**Recommendation: (a) for the concept-art loop, (b) if and when envs ship in-game** — concept exploration
wants the gouache target the briefs and palette law were written against; the deliverable gate can convert
later. Recommended to the owner as open question 1; either way the *conflict* must end — a composed prompt
that asserts two incompatible media is a standing A8 defect regardless of which wins.

**A8/medium status on the anchor path: FAIL, but the failure moved.** The night-poster failure is fixed —
all three cells are full-colour daylight scenes, the flat-vector hijack did not recur (grain + colour base
doing their ABP-measured job), and two cells sit in a *single stable register* instead of dev's three
divergent lanes. That is the closest the loop has been to set coherence; it is coherent around the wrong
clause.

## Minimal change set for the next anchor roll

One brief-data change set, no recipe change, all inside measured behaviour:

1. **Draw the wall as light architecture, not a dark strip.** `wall-flank-left/right` value `#3a352c` →
   an ash-stone grey **lighter than the rows behind** (e.g. `#a8a49a`), keeping y 0.82–0.93. On this path
   value is content: the dark-on-dark thin band dropped 3/3; a light band against darker rows is the
   strongest contrast the base can express, and 12345 proves stone walls *do* render when something
   architectural anchors them.
2. **Draw the gate** (it rendered once *undrawn*): two rope-brown tower masses flanking the existing gap —
   `x 0.42–0.46` and `x 0.54–0.58`, `y 0.62–0.92`, value `#6b5a40` — with the gap kept clear between them.
   Doubles the wall signal and gives the passage its long-missed oak vocabulary an anchor to land on.
3. **Draw the wheel.** The mill has never rendered because a wheel was never drawn; a "taller than the
   wall" wheel is a large mass (~0.18–0.22 of frame height) far above the 3–4 % floor. Add mass
   `mill-wheel`: a dark-timber disc (`#241f18`) centred ≈ `[0.575, 0.68]`, radius ≈ `0.10`, i.e. polygon
   approximating a circle just right of the column over the race channel. The 3/3 positional adherence of
   the column says the anchor will build around it.
4. **Patch the base's ground hole.** Paint the unpainted bottom-right ground (below the right row, right of
   the queue) with a muted earth tone so it stops inviting invention (it is where 42424 put water and rocks).
5. **No change** to sky, queue, rows, river, or prompt text: all either held or failed for reasons the
   above don't touch. Keep the standing prompt and mustAssert set byte-identical; the roll must isolate the
   base edit as its only variable.

Success test for the next roll: a light wall band rendered as masonry in ≥2/3 and *any* wheel form at the
column in ≥1/3 clears the path to an ACCEPT-WITH-REFINEMENT cell.

## Rail changes (concrete data diffs)

- **Rail 5 (NEW) — env register vocabulary (the styleLaws conflict, per the ruling above).** Diff, option
  (a): in `env.mjs:303-310` delete `...forge.styleLaws.positive`, `...forge.styleLaws.renderAssertion`, and
  `...forge.styleLaws.styleClause` from `buildEnvPositive`, and reorder to
  `[medium, promptText, era].join(", ")`; equivalently in data, `styleGuard.mustCompose` already guards
  `medium` so no new rail is needed — the deletion is the rail. Option (b): replace
  `styleGuard.medium`'s value with the cel vocabulary and drop the same three splices. Either way, add an
  `env-graph.test.mjs` case asserting the composed env positive contains neither `"anime"` nor `"gouache"`
  falsely (one assertion per chosen option).
- **Rail 6 (NEW) — anchor base-pass must not clobber reviewed renders.** Twice this window the anchor
  flow's base pass overwrote reviewed `dev-seed*-s*.png` filenames (see header). Diff: in `env.mjs:927-1015`,
  when `args.anchor` is set, either skip the base pass or write it to
  `${briefId}-dev-anchorbase-seed${seed}.png` with its own ledger entry (`anchorBase: true`). The env-index
  OVERWRITTEN notes propose the soft version ("pass --strength explicitly"); the filename change is the
  hard version and retires the human-memory dependency.
- **Rail 3 (carried, STILL OPEN) — ledger `model` + `guidance` fields.** Verified this review: the anchor
  ledger rows (119/123/127) carry seed/hires/control/strength/briefHash but neither `model` nor `guidance`.
  Additionally the anchor rows record `"control":"depth"` though the anchor pass consumes the *colour*
  block-in, not a depth ControlNet — extend the diff to record `"control":"anchor-colour"` (or the uploaded
  grained filename) on anchor rows.
- **Rail 4 (storybook wiring) — LANDED and verified:** `env-index.json` indexes all three anchor cells
  (roll `anchor-probe`) and pre-references this sheet's filename (lines 237/251/265). The OVERWRITTEN notes
  are present and accurate against the ledger. No further action.
- **Artifact-gate scope note (extends ABP item 5 / I-055):** the anchored text defect no longer presents as
  corner signatures — the gate must score **text-like high-contrast regions anywhere**, or the 10001 plaque
  class passes a corners-only check.

## Open questions for the owner

1. **Which register do environments target?** (The ruling above, spelled out: gouache concept art with the
   character vocabulary removed from env prompts — recommended — or cel-2D ratified for envs with
   `styleGuard.medium` rewritten.) Decision needed before the next anchor roll either way; the change set
   above is register-independent.
2. **Ratify the fachwerk register rule as style law?** Carried from v4 (12/12 dev cells); this roll
   strengthens it both ways — 2/3 anchor cells carry decorative fachwerk, and 12345 proves its absence is
   achievable. `structure-not-decoration` remains reviewer-authored. **Recommendation: ratify**, unchanged.
3. **Approve the five-item change set for anchor roll 2?** It is brief-data-only, every item traces to a
   measured adherence result in this sheet, and it isolates the base edit as the single variable.
   **Recommendation: approve** — the anchor path earned one more roll on this evidence; the segment
   experiment stays parked unless roll 2 fails the wall *and* the wheel with them drawn.

## What this review could not verify

- briefHash `3703d78a3d4eab68` could not be recomputed locally (requires running the generator, outside
  review scope); verified via ledger internal consistency: every block-in and render in the window carries
  the same hash, colour block-ins immediately precede each anchor render, and timestamps match the stated
  15:32–15:35Z window.
- That the grained PNG viewed (`-colour-grained.png`, current mtime) is bit-identical to the one uploaded
  per render — the flow regenerates it per run and the ledger logs the colour block-in but not the grain
  step; taken as the served base on flow-code evidence (`env.mjs:965-984`).
- Per-render sampler parameters (27 steps / cfg 1 / guidance 5.0 / denoise 0.75) are taken from
  `forge.config.json` `anchor` plus the graph code (`env.mjs:646-690`); not independently confirmed per
  render (rail 3 open).
- Whether the composed positive string's *order* is the sole cause of the cel register (option a) vs the
  anchor's img2img base biasing toward graphic flatness — the two hypotheses are confounded in this roll;
  the register decision (open question 1) should be judged again after one register-clean roll.
- seed42424's wagon-roof two-arm object (antenna read vs weather-vane read): low confidence; the pole line,
  crossarms and sagging wires are the solid VETO finding and are not in doubt at 2.5×.
- Whether any of 12345's sky specks are birds or artefacts: read as birds; cosmetic either way.
- Seed comparability across paths: an anchor seed samples img2img noise, not the txt2img noise of the dev
  rolls, so same-number seeds are labels, not a controlled pairing — per-criterion comparisons in this
  sheet are per-path, never per-seed.
