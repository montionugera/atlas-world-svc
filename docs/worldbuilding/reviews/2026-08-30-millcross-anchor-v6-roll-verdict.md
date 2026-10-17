# Review · A1-ART-02 Millcross — anchor roll 2 with change set + register fix (briefHash 9a49bb0146173126) — verdict

**Date:** 2026-08-30 · **Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`)
**Verdict #7 in the loop; #2 on the resumed ANCHOR path** (v6 roll: my anchor-verdict change set, all four
items, plus owner-approved register rail 5 option (a) and hard rail 6).

**Reviewed:** `tools/art-forge/out/env/A1-ART-02-dev-anchor-seed{12345,42424,10001}.png`, judged against the
re-rendered colour block-in base `tools/art-forge/out/control/colour/A1-ART-02-colour.png` (viewed this
review, four new masses confirmed present in it). Detail findings below were confirmed on 2–3× ImageMagick
crops of the bottom strips, the focal masses, and the right-edge object (read-only; crops written to session
temp only). Supporting evidence: the same-seed un-anchored base passes
`A1-ART-02-dev-anchorbase-seed*-s0.40.png` (one viewed — see register ruling; not themselves under review).

**Render contract:** brief `tools/art-forge/briefs/A1-ART-02.json` at briefHash **9a49bb0146173126**, verified
against `tools/art-forge/runs/A1-ART-02.json`: colour block-in at 16:33:17 / 16:41:05 / 16:54:11Z immediately
preceding each anchor render at 16:34:03 / 16:47:14 / 16:54:59Z, every entry in the window carrying
`9a49bb0146173126`. Prompt + mustAssert byte-identical to the v5 anchor roll, as my change set prescribed —
the base masses are the only brief-layer variable, plus the prompt-composition change outside the brief.
**Rail 5 verified landed:** `buildEnvPositive` (`env.mjs:295-302`) now composes `[medium, promptText, era]` —
the character `styleLaws.positive`/`renderAssertion`/`styleClause` splices are gone; `env-graph.test.mjs`
pins medium-leads (`:76`) and bans `anime`/`cel-shaded`/`ink linework`/`genshin` from the composed positive
(`:89-95`) — **39/39 pass**. **Rail 6 verified landed (hard version):** the base passes wrote
`A1-ART-02-dev-anchorbase-seed*-s0.40.png` with `anchorBase:true` ledger rows (`env.mjs:907-925`), and the
anchor rows now record `"control":"anchor-colour"` (`env.mjs:1015`) — but see rail changes: **rail 6 protects
only the base pass; the anchor render itself re-used the v5 reviewed filenames.**
**Canon base:** `docs/worldbuilding/A1-geography-cluster1.md:355-369` (§6 Millcross), `:510-516` (§9 brief),
`:136` (§3.1 one cart crossing), `:372-374` (pantile = Embervale); `content/story/style.md` §1 and §3:129
(ash-grey / rope-brown / tallow-yellow); `content/world/town-criteria.json` (`walled-core` :73,
`one-cart-crossing` :122, `structure-not-decoration` :183, `map-derived-concept` :207); contamination law
`forge.config.json` `styleGuard.era` + `anchor` block; `ABP-flux-dev-and-anchor.md` (grain law, window
0.70–0.78, corner-watermark finding).
**Machine gates run this review:** `node scripts/check_content.mjs` → **exit 0, 0 failures** (34 warnings —
same count as every prior review); `node tools/art-forge/generate/prompt-lint.mjs` → **exit 0**;
`node --test tools/asset-storybook/tests/env-index.test.mjs` → **7/7 pass** (this sheet's filename is pinned
at `env-index.test.mjs:208`); supporting: `env-graph.test.mjs` **39/39**.

**Registers:** CANON = A1/style.md/town-criteria ratified entries as cited. INVENTED = brief positive
additions and brief masses (traceability-tagged in the brief `_note`). PROPOSED = this sheet's change set,
rails, and open questions.

---

## Per-cell verdict table

| Criterion | seed12345 | seed42424 | seed10001 | Canon cite |
| --- | --- | --- | --- | --- |
| **P1 wall ring** | **FAIL** — no wall anywhere; the column mass stands free on open plain | **FAIL** — dark palisade fence (wrong material) + crenellated towers on a hilltop ridge; no ring around the visited town | **FAIL** — freestanding light-stone towers along the road; no connecting wall run | brief ¶2; `walled-core` :73; A1 §6 "timber-and-earth wall" |
| **P1 gate towers / passage** | **PARTIAL** — an arched cart-passage-shaped opening at the base of the column mass (2×), but it reads as a barn doorway on a freestanding building; no flanking towers | **FAIL** — none at the road; the towers migrated to the hill skyline | **PARTIAL — best of the roll**: a crenellated light-stone tower with a tall arched opening at the column/gap — single tower, not a flanking pair; dressed stone, not plain oak | brief ¶2 (INVENTED, d210d18) |
| **P1 venues / storey law** | **FAIL** — no town; one barn-chapel mass | **PARTIAL** — a real hillside town of plastered houses; hall/inn indistinguishable; 2-storey houses present | **PARTIAL** — street rows both sides of the road; hall/inn not distinguishable; storey law broken (2-storey rows + a tower far taller than any wall) | brief ¶2, ¶5; A1 §6 "only the mill housing above one storey" |
| **P1 ford / no rival crossing** | **FAIL** — no water anywhere in frame (vacuous no-bridge) | **PARTIAL** — a pale expanse the drove walks through (shallow-water or salt-flat read unresolved); no carts in it; no bridge | **PARTIAL — loop first**: water at the right height left-of-column and a loaded queue approaching a probable ford gap between two distant towers; nothing in the water; **no bridge** | A1 §3.1:136 "in exactly one by cart"; `one-cart-crossing` :122 |
| **P1 cart queue** | **PASS — best of the loop**: long loaded ox-cart queue with sacks, spoked wheels, led animals and drovers, receding past the column to the horizon | **PARTIAL** — a long circling drove of yoked cattle, **zero carts** | **PASS** — loaded carts with tallow-yellow tarp sacks and a mule-pannier train approaching along the water | brief ¶3 "longer than the town is wide"; `first-sight-cart-queue` |
| **P1 town edge** | **PARTIAL — closest yet again**: open plain + genuinely low hills at the horizon | **FAIL** — a hill-fort silhouette (Embervale's register, not Millcross's) | **FAIL** — forested hillside right, hazy hills left | brief ¶3 "beyond the town edge … low farmland" |
| **P2 materials (fachwerk / pantile)** | **FAIL** — decorative fachwerk across the column mass and right row; red-brick chimneys | **PASS — only clean cell this roll**: plaster/stone boxes, shingle; no fachwerk, no pantile | **FAIL** — decorative fachwerk on the right row; red-brick chimneys | A1 §6:361-362, :372-374; `structure-not-decoration` :183 |
| **P2 mill + wheel + race** | **FAIL with a footnote** — column rendered as a fachwerk barn-**chapel** (bell-cote spire, iron cross finial, green "eye" in the gable); the only wheel-form is a **spoked-disc roundel on the gable** (decorative, not at water); no race | **FAIL** — column rendered as a tapered **cone kiln** on stilts; no wheel, no race | **FAIL** — column rendered as a crenellated stone **tower**; no wheel, no race | brief ¶4; A1 §6:360-361 "mill-wheel housing over the race … nothing else competes" |
| **P3 contamination (era tokens)** | **PASS** — clean (one unresolved speck, see could-not-verify) | **PASS** — clean; the v5 telegraph line did **not** recur | **PARTIAL** — a white double-door cabinet against the right row reads as a modern appliance box at 2.5× (probable era break, alternative read noted); small red-marked sign | `styleGuard.era` "pre-industrial and pre-electric" |
| **P3 hallucinated text** | **FAIL** — large legible-as-lettering garbled **signature bottom-right corner** (2.5×): the anchored corner defect returned | **FAIL — worst of the loop**: a **focal signboard dead-centre-right with three lines of large garbled text** ("A KABSET / I 6onill / CON", 2×) plus a corner scribble | **PARTIAL** — small illegible red-marked hanging sign + framed plaque; corners clean | ABP-flux-dev-and-anchor.md:39-47; I-055 scope |
| **P3 style register (medium-first gouache)** | **FAIL** — crisp flat cel-2D with ink linework again, despite the prompt fix | **PARTIAL — closest to target yet**: matte, grained, gouache-adjacent poster look; still flatter than gouache | **FAIL** — painterly/3D-render swing persists in this lane | `styleGuard.medium`; style.md §1 |
| **Palette (ash-grey / rope-brown / tallow-yellow)** | **PASS — best of the loop again**: grey overcast, tallow horizon, muted greens, rope-brown gear | **PARTIAL** — grey-blue overcast held; the pale expanse reads cool; creams/browns otherwise on-law | **PARTIAL** — grey overcast held, tallow-yellow tarps on-law; red/blue pack accents off-palette | brief ¶1, ¶5; style.md §3:129 |

**Cell verdicts: seed12345 REJECT · seed42424 REJECT · seed10001 REJECT.** The standing VETO criterion
(`walled-core`, owner-ratified) fails in all three — as it has in every roll of every path — so no cell is
sign-off-able. Two cells carry text/contamination findings that would kill them independently.

**Strongest cell: seed12345**, again — the loop's best queue, best palette, zero era tokens; its corner
signature is single-element and the composition is otherwise refinement-shaped. **seed10001 second**: the
only cell of eight rolls to render water *and* a queue oriented toward a plausible crossing — new compositional
ground — but it carries the probable era break and the painterly swing. **seed42424 weakest** (sixth roll
running in its lane): focal text, no carts — though its lane *improved* (blue sky, mountains, telegraph line,
fachwerk chapel all gone; closest register yet).

## Per-criterion roll-up (persona vocabulary)

- **P1 wall ring — VETO (standing), 0/3, and the lever's failure is now MEASURED.** The change set's light-wall
  lever was correct about value but blind to plane dominance — see control-adherence: in the colour base the
  left flank is occluded by the foreground queue (sampled `#241f18` at the flank's own centre) and the right
  flank, correctly painted `#a8a49a`, is only ~13 RGB steps above the row behind it (`#948e84`). The base
  never gave the sampler a wall worth keeping; 0/3 is the base's own doing, not sampler variance.
- **P1 gate towers — STRONG OBJECTION, improving.** Tower-masses at the gap influenced all three renders
  (barn, kiln, tower); 10001 produced the loop's best gate-adjacent object. The towers as authored flank the
  *mill column* (gap x .46–.54 is filled by the column x .46–.53), so all three merged into one central
  cluster — the "gate" read never had a gap to sit in.
- **P1 venues — STRONG OBJECTION** (unchanged): no cell renders a distinguishable guild hall or inn; storey
  law broken wherever buildings exist.
- **P1 ford / one-cart-crossing — STRONG OBJECTION with a first positive:** no rival crossing 3/3 (mustAssert
  honoured), and 10001 finally renders the queue-toward-water geometry. Carts mid-stream: 0/3 across eight
  rolls.
- **P1 cart queue — PASS 3/3** (carts as wheeled loaded objects in 2/3 — up from 1/3). **Town edge — STRONG
  OBJECTION** (7 rolls; 12345's plain-and-low-hills remains the closest approach).
- **P2 materials — STRONG OBJECTION.** Fachwerk regressed to 2/3 under the register fix (12345 had been the
  one clean cell in v5); 42424 is now the clean lane. Pantile 0/3 (holding). Brick chimneys recur as a nit.
- **P2 mill + wheel — STRONG OBJECTION, with the first wheel-form of the loop:** 12345's gable roundel is a
  spoked disc at the column — decorative, not hydraulic. Mill-wheel-over-race: 0/3 across eight rolls; the
  drawn disc rendered 0/3 as a wheel (value-merged with the queue in the base — see control-adherence).
- **P3 contamination — PASS 2/3; 10001 flagged probable era break** (white cabinet). No telegraph recurrence.
- **P3 hallucinated text — now 3/3 cells, and both presentation modes appeared:** the ABP's corner signature
  (12345, 42424 corner) AND focal signage (42424's three-line board — the largest text failure of the loop).
  The I-055 "text-like regions anywhere" scope is triply evidenced this roll; a corners-only gate would have
  caught only half of it.
- **P3 style register — see ruling.** Palette — best two-roll stretch of the loop (sky held 3/3 for the first
  time).

## Control-adherence — did the renders follow the new base? (with pixel measurements)

Sampled from `A1-ART-02-colour.png` (1280×832) with ImageMagick this review:

| Base mass | Base pixel evidence | seed12345 | seed42424 | seed10001 | Reading |
| --- | --- | --- | --- | --- | --- |
| **Sky gradient** | painted `#71787f→#cdc3ac` | **HELD** | **HELD** | **HELD** | **3/3 — first time.** The gouache-first prompt or the calmer register both plausible causes |
| **Cart-queue wedge** | dark `#241f18`, fg | **HELD** — the queue | **HELD** — the drove | **HELD** — queue + pannier train | 3/3, six rolls running: the fg wedge is unbeatable |
| **Mill column** | brown `#5c4a34`, x .46–.53 | HELD positionally (barn-chapel) | HELD positionally (cone kiln) | HELD positionally (tower) | 6/6 positional across both anchor rolls; 0/6 a mill |
| **Mill-wheel disc** | `#241f18` **same value as the queue**, overlapping the wedge's climb — sampled dark at [660,545] and [700,600] | **MORPHED** — gable roundel | **DROPPED** | **DROPPED** | The disc had **no silhouette of its own**: identical value to the queue it abuts. Literal wheel-form 1/3; wheel 0/3 |
| **Wall flanks** | left flank **occluded by the queue** (sampled `#241f18` at [300,728], inside the flank rect); right flank correctly `#a8a49a` vs row `#948e84` — Δ≈13 RGB steps | **DROPPED** | **DROPPED** (palisade + hill towers instead) | **DROPPED** (towers only) | 0/3. The left flank never existed in the base; the right was too faint a step to survive img2img |
| **Gate towers** | `#6b5a40`, x .42–.46 / .54–.58 — flanking the **column**, not a gap | MORPHED into the barn cluster | DROPPED at the road (hill towers) | MORPHED — one big tower spanning column+gap | The authored "gate gap" is filled by the mill column; the masses merged centrally in all three |
| **Race channel** | pale sliver | **DROPPED** | **DROPPED** | **DROPPED** | 0/3, six rolls: thin strip below survival floor, as measured on both paths |
| **Ground-right patch** | `#8a8070` | HELD (grass/road) | **DROPPED** (the pale expanse invades) | HELD (grass/road) | 2/3 — the patch ended v5's water-in-the-hole invention in 2 of 3 lanes |
| **Town rows** | taupe, both banks | **DROPPED** (open plain) | **HELD** (hillside rows) | **HELD** (street rows) | 2/3 |

**The pattern, two rolls of evidence, now with a mechanism:** the anchor path holds **large high-contrast
masses** (queue 6/6, column 6/6, sky 5/6) and drops **low-contrast or occluded or thin masses** regardless of
intent. The v6 failures were base-authoring failures visible in the base's own pixels: the wall was
plane-occluded (fg queue over mg wall) or a 13-step whisper; the wheel was value-identical to its neighbour;
the gate had no gap. The sampler did not fail the change set; the change set's signals never cleanly existed.

## Register ruling follow-up — did the fix hold?

**The fix landed exactly as specified and held at the prompt layer — and did not hold at the render layer.**

- **Prompt layer (machine-verified):** `buildEnvPositive` composes `[medium, promptText, era]`; the character
  vocabulary is gone; `env-graph.test.mjs` 39/39 asserts it; prompt-lint exit 0. The composed string that
  reached all three renders carried no cel vocabulary.
- **Render layer:** gouache clearly visible **0/3**; seed42424 is gouache-**adjacent** (matte, grained,
  poster-flat) and is the closest any of eleven cells has come; seed12345 still rendered crisp flat cel-2D
  with ink linework — the register the prompt no longer names.
- **The v5 confound is now disentangled.** The un-anchored same-seed base pass
  (`A1-ART-02-dev-anchorbase-seed12345-s0.40.png`, viewed) renders **painted realism — not cel** — from the
  same fixed prompt. Same prompt, same seed: without the anchor img2img step the register is
  concept-art-adjacent; with it, cel. **The grained colour block-in + img2img at denoise 0.75 is now the
  dominant register force.** v5's prompt-order hypothesis was real but secondary; with the vocabulary removed
  the remaining cel pull is the base image's graphic flatness winning at 0.75 denoise.
- **Consequence:** no further prompt-side lever exists — the string already leads with the medium. The next
  register lever is inside the anchor recipe (grain attenuation 0.55, blur 0x6, denoise window 0.70–0.78), or
  the register target itself changes. That is an owner decision (open question 1); it is also bounded by the
  ABP's measured window — this is tuning inside measured rails, not a new recipe.

## Success test — ruling (from the v5 sheet, verbatim)

> "a light wall band rendered as masonry in ≥2/3 and *any* wheel form at the column in ≥1/3 clears the path
> to an ACCEPT-WITH-REFINEMENT cell."

- **Light wall band as masonry, ≥2/3: NO — 0/3.** No cell renders any wall band. Measured cause: the left
  flank is plane-occluded by the queue in the base itself; the right flank survives in the base at only Δ≈13
  RGB steps over the row and died in every render.
- **Any wheel form at the column, ≥1/3: YES at the letter — 1/3, and NO at the intent.** seed12345's gable
  roundel is a spoked disc at the column x-band — a wheel *form*. It is decorative relief on a barn-chapel,
  not a wheel at a race; the mill does not read as a mill. Mill-wheel-over-race: 0/3.
- **The test is conjunctive; its wall half failed outright → the path to an ACCEPT-WITH-REFINEMENT cell did
  NOT clear.** Additionally, the v5 open question 3 set the tripwire for reconsidering the parked segment
  experiment at "roll 2 fails the wall *and* the wheel with them drawn". Both were drawn; both failed to land
  (wall 0/3, wheel 0/3 as a wheel). **The tripwire's condition is met.** My recommendation (open question 3)
  is one corrected-base roll first, because this roll's pixel evidence shows the v6 base never delivered the
  signals — but the owner's stated trigger has fired, and I report that honestly rather than quietly reset it.

## Minimal change set for the next anchor roll (base geometry only; prompt stays byte-identical)

Every item traces to a pixel measurement or a render result in this sheet. No recipe change, no prompt change.

1. **Re-author the wall where it can exist.** The mg-plane left flank can never survive under the fg queue
   (plane dominance, measured above). Options, in order of my preference: (a) drop the left flank; keep ONE
   right-flank mass, raise its contrast to ≥25 RGB steps over the rows (e.g. `#c6c2b6` vs `#948e84`), and
   extend it to meet the right gate tower so the wall-tower-gate-ford chain reads as one structure; or
   (b) move both flanks up-plane (y ≈ 0.72–0.86) at x-ranges the queue does not cover (right of x 0.58).
   Do not re-paint the left flank at y 0.82–0.93 — that coordinate is the queue's.
2. **Give the wheel its own silhouette.** Change `mill-wheel` value from `#241f18` (identical to the queue)
   to a distinct dark rope-brown (e.g. `#3a2c1c` — still 25+ steps off the column `#5c4a34` and the race
   `#9aa4a8`), and shift the centre right/up to ≈ [0.615, 0.615] r ≈ 0.085 so the disc's left edge clears the
   queue wedge's x 0.53 shoulder. A disc that shares its value and edge with the queue is one blob, and one
   blob renders as whatever the seed likes.
3. **Open a real gate gap.** Move the towers to x 0.38–0.43 and x 0.58–0.63 (keeping y 0.62–0.92, `#6b5a40`)
   so the column (x .46–.53) stands *between* towers with clear ground either side, instead of inside a
   three-mass cluster. This also un-merges the column's silhouette, which the mill read needs.
4. **No change** to sky, queue, rows, river, ground patch, or any prompt text. The register lever is spent on
   the prompt side; the roll must isolate base geometry as its only variable.

**Amended success test for roll 3** (the v5 test assumed both flanks were renderable — the plane-dominance
measurement retires that assumption): **the right-flank wall mass (or flank-to-tower chain) renders as
masonry in ≥1/3, and a wheel reading as a wheel object — distinct silhouette against column/race/queue — in
≥1/3.** Both halves judged on what a viewer reads, not on coordinates.

## Rail changes (concrete data diffs)

- **Rail 7 (NEW — rail 6 is only half-landed): the anchor render itself clobbered the v5-reviewed anchor
  files.** Rail 6 renamed the *base pass* output; the *anchor pass* still writes
  `${briefId}-dev-anchor-seed<N>.png`, so this roll overwrote all three v5-reviewed anchor cells at the same
  paths (ledger 16:34:03 / 16:47:14 / 16:54:59 at `9a49bb0146173126` vs the v5 sheet's reviewed pixels at
  `3703d78a3d4eab68`). The v5 sheet's evidence pixels are unrecoverable, and `env-index.json` now carries only
  the v6 anchor rows — the v5 rows were replaced, not annotated OVERWRITTEN, unlike the dev-0.30 precedent.
  Diff: anchor output → `${briefId}-dev-anchor-<rolltag>-seed<N>.png` (rolltag from CLI, e.g. `anchor-r2`),
  and the indexer appends an OVERWRITTEN note to superseded rows instead of replacing them. Minor sibling
  finding, fold into rail 3: anchorBase ledger rows record the **pre-rename** `out` name (no `-s0.40`
  suffix) — the ledger disagrees with disk (`env.mjs:915` renames after the row is staged).
- **Rail 3 (carried, STILL OPEN):** anchor rows still carry neither `model` nor `guidance` (verified against
  this roll's rows). Unchanged diff; now also covers the anchorBase `out`-name mismatch above.
- **Rails 4/5/6 — LANDED and verified.** Rail 4 storybook wiring (this sheet's filename pinned, all three
  cells indexed, env-index 7/7); rail 5 register composition (code + 39/39 pins); rail 6 anchorBase naming +
  `anchor-colour` control field. No further action on 4/5; rail 6 needs rail 7 to be true to its purpose.
- **Artifact-gate scope (I-055), third consecutive evidence roll:** text/lettering appeared in **3/3** cells —
  corner signature (12345), focal three-line signboard (42424), corner scribble + marked plaque (10001). The
  gate must score **text-like high-contrast regions anywhere**, and additionally flag **free-standing white
  box-like objects** adjacent to structures (the 10001 cabinet class). Corners-only would have passed 42424,
  the worst cell of the roll.

## Open questions for the owner

1. **Register, round 2 — the prompt is exonerated, the recipe is not.** The prompt-side fix worked and the
   cel register persisted anyway; the same seed without img2img renders painted realism. Options:
   (a) one recipe-bounded experiment — raise `grainAttenuate` (0.55 → ~0.7) or drop denoise to the window's
   floor (0.70), so the base keeps more of its painted texture through img2img; (b) ratify the
   block-in-convergent flat register for anchor-path envs and reserve gouache for the dev path; (c) park the
   anchor path and unpark the segment experiment — the v5 tripwire for this fired this roll. **Recommendation:
   (a), once** — the evidence now isolates a single step, the window is already measured, and (c) remains
   available if the corrected-base roll also fails the wall and the wheel. Note (a) is a recipe change and
   must ride *with* the geometry change set above or the roll confounds two variables again — if the owner
   wants single-variable isolation, sequence geometry first (it gates the cell verdicts) and recipe second.
2. **Accept the one-sided wall?** Canon wants a wall ring; the anchor base's plane ordering means the left
   flank is unpaintable at the queue's coordinates. Author the visible (right/flank-to-tower) half and accept
   a partial ring in concept art, or re-plan the composition (queue lower/left, wall band clear above it).
   **Recommendation: author the visible half** — concept art needs one credible wall run, not a geodesically
   complete one; the *plan* (town-millcross.json) still owns the full ring.
3. **Approve the four-item geometry change set + amended success test for roll 3 — or fire the segment
   tripwire now?** Your v5 framing ("unless roll 2 fails the wall *and* the wheel with them drawn") fired on
   this roll's letter. My recommendation stands with the evidence: this roll's base never delivered a wall or
   a wheel to the sampler (occluded, value-merged, gapless — all measured), so roll 3 with the corrected base
   is the first roll that actually tests the levers. **Recommendation: one corrected-base roll; if it fails
   the amended test, unpark segment.** Decision needed before any roll 3 either way.
4. **The lost v5 anchor pixels** (rail 7): accept the loss (the v5 sheet documents them in words) or have the
   owner re-render v5's brief for the record. **Recommendation: accept + rail 7** — a re-render is a new
   sample and proves nothing about what was reviewed.

## What this review could not verify

- briefHash `9a49bb0146173126` was not recomputed locally (running the generator is outside review scope);
  verified by ledger internal consistency — every block-in and render in the 16:31–16:55Z window carries the
  hash, a colour block-in immediately precedes each anchor render, and the anchorBase rows precede their
  anchors.
- That the per-render grained upload matches the colour block-in viewed (the flow regenerates the grained
  variant per run and the ledger logs the block-in, not the grain step) — taken as served on flow-code
  evidence, as in v5.
- Per-render sampler parameters (27 steps / cfg 1 / guidance 5.0 / denoise 0.75 / grainAttenuate 0.55) are
  taken from `forge.config.json` `anchor` + graph code; not independently confirmed per render (rail 3 open —
  no `model`/`guidance` in the ledger rows).
- The composed positive string actually sent per render is not logged; the register-clean claim rests on
  code reading + the env-graph test pins, not a per-render capture.
- The 10001 white double-door cabinet: modern-appliance read vs painted food-safe/notice-cabinet read — both
  survive at 2.5×. Flagged **probable** era break; not asserted as one. The cell REJECTs regardless.
- seed12345's tiny T-shaped object on the left horizon (possible windmill speck): unresolvable at available
  zoom; low confidence, cosmetic if real — but a windmill would be a canon-material break, so it is named
  here rather than dropped.
- Whether 42424's pale expanse is shallow water (generous → PARTIAL ford) or a salt flat (FAIL): unresolved
  at 2×; affects one criterion's generosity, not the cell verdict.
- Anchor-seed comparability across rolls: same numbers sample different img2img noise against different
  bases; per-seed comparisons across v5→v6 are labels, never controlled pairs (carried).
