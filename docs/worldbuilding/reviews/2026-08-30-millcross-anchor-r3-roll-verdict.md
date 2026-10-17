# Review · A1-ART-02 Millcross — anchor roll 3 on the corrected base (briefHash b7658d8607bbbe70) — verdict

**Date:** 2026-08-30 · **Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`)
**Verdict #7's successor — #8 in the loop; #3 on the ANCHOR path** (this roll: the v6 sheet's four-item base-geometry
change set applied exactly, prompt untouched, register rail 5(a) in effect, rail 7 landed).

**Goal of this review, restated:** judge the three anchor-r3 renders + the re-rendered colour base against the
standing criteria and the v6 amended success test, run the machine gates, write this one sheet.

**Reviewed:** `tools/art-forge/out/env/A1-ART-02-dev-anchor-anchor-r3-seed{12345,42424,10001}.png` (each opened
and read at full frame this review), against the re-rendered colour block-in base
`tools/art-forge/out/control/colour/A1-ART-02-colour.png` (viewed; all corrected masses confirmed in it). Detail
findings were confirmed on 2.5–3.5× ImageMagick crops (read-only; crops written to session temp only): 12345
corner / wing sign / tower plaque / right wing; 42424 sign plaques / corner; 10001 cabinet / corner. Supporting
evidence on disk: the v6-reviewed cells `A1-ART-02-dev-anchor-seed*.png` are **still present, un-overwritten**
(rail 7 verified at the filesystem level), and the same-seed un-anchored passes
`A1-ART-02-dev-anchorbase-seed*-s0.40.png` exist for comparison (not themselves under review).

**Render contract:** brief `tools/art-forge/briefs/A1-ART-02.json` at briefHash **b7658d8607bbbe70**, verified
against `tools/art-forge/runs/A1-ART-02.json` (read this review): one depth block-in + anchorBase render
(`control:"depth"`, s 0.40) then a colour block-in immediately preceding each anchor render
(`control:"anchor-colour"`), window 17:31–17:36Z on 2026-08-30, every row carrying `b7658d8607bbbe70`, every
anchor `out` carrying the rolltag `-anchor-r3-`. (The handoff said "~17:0xZ"; the ledger says 17:31–17:36Z —
the ledger is the evidence and is internally consistent.) All four v6 change-set items verified applied in the
brief's `masses`, with pixel confirmation in the base: left flank **absent**; right flank `#c6c2b6` x 0.55–0.99
y 0.82–0.93 (sampled `#C6C2B6` — Δ≈(50,52,50) over the rows `#948e84`, ≥25 steps as specified); `mill-wheel`
`#3a2c1c` (sampled), centre [0.615, 0.615] r 0.085 (poly extents confirm), clear of the queue wedge except a
short lower-left arc; towers x 0.38–0.43 / 0.58–0.63, y 0.62–0.92, `#6b5a40` (sampled both), column x 0.46–0.53
between them with clear ground either side (gaps 0.03 / 0.05). Prompt + `mustAssert` unchanged on the face of
the brief (same three assertions); prompt-lint exit 0. **Rail 5(a) in effect:** positives compose
`[medium, promptText, era]`, no character cel vocabulary (`env.mjs:295-302`, pinned 39/39 in v6; config and
lint unchanged this roll — carried verification). **Rail 7 verified landed twice over:** rolltag filenames in
the ledger AND v6's reviewed pixels surviving on disk; the v6 minor finding is also fixed (anchorBase rows now
record the `-s0.40` names that match disk).
**Canon base:** `docs/worldbuilding/A1-geography-cluster1.md` §6 Millcross (re-read this review: timber-and-earth
wall thrown up after the war, mill-wheel housing taller than the wall and nothing else competes, first sight is
the cart queue, low farmland beyond the edge) and §9 brief (`:510-516`); `content/story/style.md` §1 and §3
Millcross palette row (ash-grey / rope-brown / tallow-yellow); `content/world/town-criteria.json` `walled-core`
(:73, owner-ratified), `one-cart-crossing` (:122), `structure-not-decoration` (:183), `map-derived-concept`
(:207); contamination law `forge.config.json` `profiles.environment.styleGuard` (era "Pre-industrial and
pre-electric", forbidden-token list, medium clause); `ABP-flux-dev-and-anchor.md` (grain law, denoise window
0.70–0.78).
**Machine gates run this review:** `node scripts/check_content.mjs` → **exit 0, 0 failures, 34 warnings** (same
warning count as every prior review); `node tools/art-forge/generate/prompt-lint.mjs` → **exit 0**;
`node --test tools/asset-storybook/tests/env-index.test.mjs` → **7/7 pass** (run before this sheet existed —
the index already referenced this filename; the sheet completes the reference).

**Registers:** CANON = A1 §6/§9, style.md, town-criteria ratified entries as cited. INVENTED = brief masses and
brief positive additions (traceability-tagged in the brief `_note`s). PROPOSED = this sheet's change set, rails,
and open questions.

---

## Per-cell verdict table

| Criterion | seed12345 | seed42424 | seed10001 | Canon cite |
| --- | --- | --- | --- | --- |
| **P1 wall ring** | **FAIL** — no wall anywhere; manor-clock-tower complex free on open pale ground | **FAIL** — dense town, no wall run; the flank-to-tower cluster rendered as a stone *building* (see wheel row) | **FAIL** — one freestanding crenellated tower; no connecting run | brief ¶2; `walled-core` :73; A1 §6 "timber-and-earth wall" |
| **P1 gate towers / passage** | **PARTIAL** — tower-mass at the column again (now a clock-tower); no flanking pair, no through-passage | **FAIL** — none at the road; two rooftop turrettes read as roof ornaments | **PARTIAL — best gate read of the loop**: crenellated light-stone tower with a tall arched cart-passage at its base, at the road, clear ground either side; single tower not a pair; dressed ashlar + crenellations, not plain oak | brief ¶2 (INVENTED); A1 §6 "plain oak" gate register |
| **P1 venues / storey law** | **FAIL** — one manor complex, 2-storey + tower; hall/inn indistinguishable | **FAIL** — several 2-storey fachwerk houses; hall/inn indistinguishable | **PARTIAL** — street rows both sides, houses 1–1.5 storey (**storey law held for houses — loop first**); the one tall mass is a non-mill tower; hall/inn indistinguishable | brief ¶5; A1 §6 "only the mill housing above one storey" |
| **P1 ford / no rival crossing** | **FAIL** — water at the left horizon only; queue on dry ground; no bridge (vacuous) | **PARTIAL** — puddle strip + wet square at left; queue not oriented to it; nothing in water; no bridge | **PARTIAL** — water at the left with the cart train receding toward it; nothing in the water; **no bridge** | A1 §3.1 "in exactly one by cart"; `one-cart-crossing` :122 |
| **P1 cart queue** | **PASS — best of the loop again**: long loaded ox-cart queue, sacks, spoked wheels, receding to the horizon | **PARTIAL** — ox drove + one loaded four-wheeled wain + partial wheels; not a long queue (first carts in this lane since v5) | **PASS** — loaded carts, tallow-tan covered loads, receding train toward the water | brief ¶3 "longer than the town is wide"; `first-sight-cart-queue` |
| **P1 town edge** | **PARTIAL** — open pale plain + genuinely low hazy hills | **FAIL** — town fills the frame edge-to-edge; no "beyond" exists | **PARTIAL — closest yet in this lane**: open green lowland + water beyond the rows; no hill-fort, no forest wall | brief ¶3 "beyond the town edge … low farmland" |
| **P2 materials** | **FAIL** — decorative fachwerk on the main gable; red-brick chimneys ×4 | **FAIL** — decorative fachwerk pervading the large right buildings and others; the stone hall itself is clean | **PASS** — plaster houses on stone footings, structural timber gables, shingle/slate; no fachwerk, no pantile, no brick | A1 §6:361-374; `structure-not-decoration` :183 |
| **P2 mill + wheel + race** | **FAIL** — column rendered as a clock-tower (town-hall object); no wheel at the column; no race | **PARTIAL — loop first**: a big spoked wheel (rim, spokes, hub) mounted on the stone hall face at the wheel's authored position, reading as a wheel object; but wall-mounted relief, no water, no race, sub-rooftop | **FAIL** — column rendered as a crenellated stone tower, second roll running in this lane; no wheel, no race | brief ¶4; A1 §6 "mill-wheel housing over the race … nothing else competes" |
| **P3 contamination (era tokens)** | **PASS** — clean at every zoom tried | **PASS** — clean; the signs are pre-industrial signboards | **PARTIAL** — the white panelled cabinet against the right house recurs (2.5×): free-standing double-door box on a plinth reads as a modern utility cabinet; probable era break, alternative pre-industrial read survives | `styleGuard.era` "pre-industrial and pre-electric" |
| **P3 hallucinated text** | **FAIL — three instances**: corner signature (3×: "@TEAǀREǀFE OOLCOME" register), garbled red signboard on the wing (3.5×), garbled plaque under the clock (3.5×); plus a clock face | **FAIL** — garbled text on a white signboard on the stone hall (2.5×), tiny text-marks on a second plaque, small white corner scribble (2.5×) | **PASS — first text-clean cell of the loop**: corners clean at 3×, no legible-as-lettering region at 2.5× anywhere | ABP-flux-dev-and-anchor.md:39-47; I-055 scope |
| **P3 style register (medium-first gouache)** | **FAIL** — crisp flat cel-2D with ink linework, third roll running in this lane | **PARTIAL — closest again**: matte, grained, poster-flat gouache-adjacent; still no visible brushwork | **FAIL** — soft 3D-render/painterly hybrid (volumetric clouds, glossy highlights), persists in this lane | `styleGuard.medium`; style.md §1 |
| **Palette (ash-grey / rope-brown / tallow-yellow)** | **PASS** — grey sky, tallow ground, muted gear; red-brick nit carried by materials | **PARTIAL** — grey-blue overcast held; olive hay; creams/browns on-law | **PARTIAL** — grey sky held (as puffy fair-weather cumulus); saturated green ground mass dominates, off the ashy family | brief ¶1, ¶5; style.md §3 |

**Cell verdicts: seed12345 REJECT · seed42424 REJECT · seed10001 REJECT.** The standing VETO criterion
(`walled-core`, owner-ratified) fails in all three — eighth roll of the loop — so no cell is sign-off-able.
12345 and 42424 carry independent text findings; 10001 carries a probable era break.

**Strongest cell: seed10001** — the roll's biggest single-step improvement and the loop's cleanest cell on
paper: zero text (loop first), zero fachwerk, house storey law held (loop first), best gate read of the loop,
queue-toward-water geometry, clean materials. Its disqualifiers are two single-lever problems (probable era
cabinet; 3D register). **seed42424 second**: it delivered the roll's stated purpose — the loop's first
wheel-that-reads-as-a-wheel — plus the closest register, but the fachwerk register pervades it and the town
edge is gone. **seed12345 third this roll** (was strongest in v5/v6): its lane regressed — text count grew
from one corner signature to three instances plus a clock face, with fachwerk and brick back.

## Per-criterion roll-up (persona vocabulary)

- **P1 wall ring — VETO (standing), 0/3, now fairly tested.** Unlike v6, the base *did* deliver the flank this
  time: unoccluded, Δ≈50 steps, connected to the south tower (measured above). It still rendered 0/3. The wall
  failure is no longer a base-signal failure — see control-adherence for the shape hypothesis.
- **P1 gate towers — STRONG OBJECTION, best result of the loop.** Opening a real gap worked: 10001 rendered a
  tower-with-cart-passage at the road with clear ground either side — the first cell where the gate *reads as a
  gate* (material register wrong: ashlar + crenellations vs plain oak).
- **P1 venues — STRONG OBJECTION** (unchanged, 8 rolls): no distinguishable hall/inn anywhere; storey law broken
  wherever 2-storey building appear — except 10001's houses, the first held instance.
- **P1 ford / one-cart-crossing — STRONG OBJECTION with progress:** no rival crossing 3/3 (mustAssert honoured,
  8/8 rolls); 10001 holds the queue-toward-water geometry it found in v6. Carts mid-stream: 0/3 across nine
  rolls.
- **P1 cart queue — PASS 2/3** (42424 partial). **Town edge — STRONG OBJECTION**, 8 rolls; 12345's plain and
  10001's open lowland are the two closest approaches.
- **P2 materials — STRONG OBJECTION.** Fachwerk 2/3 again; 10001 is the roll's clean lane (and the loop's
  second clean-materials cell after v6's 42424). Pantile 0/3 across nine rolls (holding).
- **P2 mill + wheel — STRONG OBJECTION, with the loop's first true wheel:** 42424's spoked wheel reads as a
  wheel object — the amended test's wheel half finally has a yes. Canon composition still fails 3/3: no race,
  no water, wall-mounted, not taller than any rooftop. Wheel-over-race: 0/3 across nine rolls.
- **P3 contamination — PASS 2/3; 10001's white cabinet recurred in the same lane two rolls running** — that is
  now a pattern, not a speck: the *class* (free-standing white box-like object beside a structure) belongs in
  the artifact gate.
- **P3 hallucinated text — 2/3, with the loop's first clean cell.** 10001 proves the model can render the scene
  textless; the failures concentrate where dense signage vocabulary is invoked (12345's manor, 42424's street).
  The I-055 "text-like regions anywhere" scope is again evidenced in both presentation modes (corner + signage).
- **P3 register — lane-stable three rolls running:** 12345 = cel, 42424 = gouache-adjacent, 10001 =
  3D/painterly. Per-seed attractors, not noise. Palette — sky held 3/3, two rolls running.

## Control-adherence — did the renders follow the corrected base? (with pixel measurements)

Base values sampled this review from `A1-ART-02-colour.png` (1280×832): flank `#C6C2B6` at [1150,727];
row-right `#948E84`; wheel `#3A2C1C` at [793,512]; column `#5C4A34`; queue `#241F18`; both towers `#6B5A40`;
ground patch overlaid by the led-animals wedge `#1C1712` at [1150,810]. The flank-vs-rows contrast is
Δ≈(50,52,50) — the ≥25-step spec met with margin. One base-authoring note: the flank rect (y 0.82–0.93)
overlaps the race channel's lower half (x 0.55–0.58), and array z-order paints the flank over the race — the
race sliver now survives only above y 0.82.

| Base mass | Base evidence this roll | seed12345 | seed42424 | seed10001 | Reading |
| --- | --- | --- | --- | --- | --- |
| **Sky gradient** | painted, held from v6 | **HELD** | **HELD** | **HELD** (as puffy cumulus) | 3/3, two rolls running |
| **Cart-queue wedge** | dark, fg | **HELD** — the queue | **HELD** — drove + wain | **HELD** — cart train | 3/3, seven rolls running |
| **Mill column** | brown, x .46–.53 | HELD positionally (clock-tower) | HELD positionally (stone hall) | HELD positionally (crenellated tower) | 9/9 positional across three anchor rolls; 0/9 a mill |
| **Mill-wheel disc** | **distinct dark disc on its own silhouette**, `#3a2c1c`, clear of the queue — the v6 fix visibly worked in the base | **DROPPED** | **RENDERED AS A WHEEL** — spoked, rimmed, at the disc's position | **DROPPED** | With a clean signal: literal wheel 1/3 (from 0/6). **The wheel lever works.** |
| **Wall flank (right)** | **present, unoccluded, Δ≈50 steps, touching the south tower** — the v6 fix visibly worked in the base | **DROPPED** | **RENDERED AS MASONRY — but as a stone building**, not a wall run | **DROPPED** | With a clean signal: wall 0/3. **The wall lever still does not work.** |
| **Gate towers** | two separated masses, real gap | merged into the manor | dropped (turrettes) | **one tower rendered AT the gap with a passage** | The gap opened the read: 1/3 gate-as-gate (from 0/6) |
| **Race channel** | pale sliver, lower half under the flank | DROPPED | DROPPED | DROPPED | 0/3, seven rolls: still below the survival floor |
| **Town rows / ground / river** | taupe rows, pale river, ground patch | rows dropped, ground held | rows held, ground = the pale square | rows held both sides, river → left-margin water | 2/3 rows |

**The pattern, three rolls of evidence, sharpened:** the anchor path holds large high-contrast masses and
**strong-prior shapes** — a disc at a building's face has a wheel prior, a tower-over-a-gap has a gate prior,
a long horizontal cream strip squeezed between row and ground has *no wall prior at all* (it reads as road,
plinth, or shadow, and the sampler resolves it toward whatever the seed likes). v6's diagnosis (signal quality)
is confirmed for the wheel — fix the signal, get the wheel — and **retired for the wall**: the wall's signal is
now clean and it still dies. The residual variable is the mass's *shape semantics*: 11% frame height,
horizontal, no vertical rhythm, no skyline. The one partial masonry result (42424) is exactly the cluster the
base chained together (flank + tower + wheel) — the sampler will render the chain, but it renders it as a
building, because nothing in the mass says "wall".

## Success test — ruling (the v6 amended test, verbatim)

> "the right-flank wall mass (or flank-to-tower chain) renders as masonry in ≥1/3, and a wheel reading as a
> wheel object — distinct silhouette against column/race/queue — in ≥1/3. Both halves judged on what a viewer
> reads, not on coordinates."

- **Wall half: NO — 0/3.** No cell shows a viewer a wall: no continuous barrier, no enclosure read, no
  wall-tower chain. seed42424 rendered the flank-to-tower cluster as masonry — *as a building*; a stone hall is
  not a wall, and the test's own terms (viewer-read) rule it out.
- **Wheel half: YES — 1/3.** seed42424's wheel reads as a wheel object, silhouette distinct against the stone
  hall, at the authored position. Caveats recorded: wall-mounted rather than turning in an open race, no water,
  sub-rooftop — the amended test's letter and its "viewer reads a wheel" intent are met; the full canon
  composition (wheel taller than the wall, in the race) is not.
- **The test is conjunctive; its wall half failed → the path to an ACCEPT-WITH-REFINEMENT cell did NOT clear —
  and this time the test was fair.** The v6 tripwire ("one corrected-base roll; if it fails the amended test,
  unpark segment") was contingent on exactly this roll, and the roll is a fair test: rail 7 preserved the
  evidence chain, the base visibly delivered both masses, one of the two levers demonstrably worked. **The
  tripwire's condition is now met on the merits.** I report that honestly; the decision is open question 1.

## Register follow-up — the fix held at the prompt layer; the lanes have settled

Rail 5(a) evidence is carried from v6 (code + 39/39 pins) with prompt-lint exit 0 this roll; nothing in the
config changed. At the render layer the interesting new fact is **lane stability**: for the third consecutive
roll each seed returns its own register (12345 cel, 42424 gouache-adjacent, 10001 painterly/3D) across
different bases. Register on this path behaves as a per-seed attractor, not a per-prompt or per-base property.
Consequence for open question 1 (v6): a recipe-side experiment (grain/denoise) would have to beat three
seed-level attractors, which one window-bound tweak is unlikely to do; ratifying 42424's lane as the anchor
register, or unparking segment, are the better-shaped options. Owner decision; not re-litigated here.

## Minimal change set for the next anchor roll, if the owner spends one (base geometry only; prompt byte-identical)

The wheel change is done — do not touch it. The queue, towers, gap, sky, rows, river stay. One problem remains
lever-shaped: the wall.

1. **Re-author the flank as a wall, not a strip.** Keep `#c6c2b6` (contrast is proven sufficient — Δ≈50). Give
   the mass vertical extent and a wall skyline: change `wall-flank-right` rect from `[0.55, 0.82, 0.99, 0.93]`
   to `[0.55, 0.72, 0.99, 0.93]` (top edge up to y 0.72 — ~21% of frame height, as tall as the town rows), and
   add three small vertical teeth rects (`#c6c2b6`, e.g. x 0.60–0.625 / 0.72–0.745 / 0.84–0.865, y 0.70–0.74)
   along the new top edge — a timber-palisade rhythm, canon-compatible with a timber-and-earth wall (do **not**
   author stone crenellations; that register was flagged wrong on 10001's tower). The mass then has height,
   rhythm, and a skyline — the three things a viewer's "wall" prior needs that a flat strip lacks.
2. **Connectivity, carefully.** The flank already overlaps the south tower. Do not extend it left to touch the
   mill column — the clear column↔tower ground is what produced the loop's first gate read; preserve it.
3. **No change** to wheel, queue, towers, rows, river, ground, sky, or any prompt text. One variable.

If the owner fires the segment tripwire instead (my reading of their own v5/v6 framing), this change set is
moot for the anchor path and should ride along only if segment also needs a colour base.

## Rail changes (concrete data diffs)

- **Rail 7 — LANDED, verified twice over.** Anchor renders write rolltag filenames
  (`A1-ART-02-dev-anchor-anchor-r3-seed<N>.png`); the v6-reviewed cells survive untouched on disk; the indexer
  carries all rows (env-index 7/7, provenance test passes against the run log). The v6 minor sibling is also
  fixed: anchorBase rows now record the `-s0.40` names matching disk. No further action.
- **Rail 3 — carried, STILL OPEN (fourth roll).** Anchor and anchorBase rows still carry neither `model` nor
  `guidance` (re-verified against this roll's ledger rows). Unchanged diff from v6.
- **Artifact-gate scope (I-055), fourth evidence roll, refined:** text appeared in 2/3 — and 10001 is the
  loop's first text-clean cell, which matters: it shows the failures are *invoked* by signage vocabulary in the
  scene (manor plaques, street signs), not ambient. The gate proposal stands: score **text-like high-contrast
  regions anywhere**, not corners only. The **white free-standing box-object check** is now two rolls of
  evidence in the same lane (10001) — add it to the same gate as a flagged class rather than a hard fail
  (pre-industrial cabinet reads exist).
- **No new rails proposed.** The wall finding is a brief-data problem with a concrete diff above, not a rule
  gap: nothing in the pipeline is silent about wall shape — the shape simply was never authored.

## Open questions for the owner

1. **The segment tripwire has fired on a fair test — unpark segment, or spend one wall-shape roll?** Your v5
   framing (carried through v6) set the trigger at "the corrected-base roll fails the amended test." It failed
   the wall half, fairly, with the wheel lever proving the mechanism works. **Recommendation: honour your own
   trigger — unpark segment.** If you would rather spend one more anchor roll, the change set above is the
   single lever, and the wheel result is the reason to believe one more roll is not a wasted sample. Decision
   needed before any roll 4 either way.
2. **Register round 2 (carried, re-shaped by lane stability):** with three seed-stable registers, the realistic
   options are (a) ratify 42424's lane as the anchor-path register and reserve gouache ambitions for the dev
   path, (b) unpark segment (overlaps question 1), or (c) a recipe-bounded experiment that must now beat three
   attractors. **Recommendation: (a) if the anchor path continues at all; the experiment (c) is no longer
   well-spent.**
3. **The 10001 white cabinet class:** confirm adding "free-standing white box-like objects adjacent to
   structures" to the artifact gate as a flagged class (rail section above has the wording). **Recommendation:
   yes** — two rolls, same lane, same read at 2.5×.
4. **One-sided wall acceptance (carried from v6, unchanged in substance):** if the anchor path survives
   question 1, authoring the visible right-flank half remains the right call; the plan still owns the full ring.

## What this review could not verify

- briefHash `b7658d8607bbbe70` was not recomputed locally (running the generator is outside review scope);
  verified by ledger internal consistency — every row in the 17:31–17:36Z window carries the hash, a colour
  block-in immediately precedes each anchor render, anchorBase rows precede their anchors, and the env-index
  provenance test passes against the run log.
- Byte-identity of prompt + `mustAssert` against the v5/v6 rolls: no prior brief blob is retained on disk to
  diff; verified as far as the face of the brief goes (same three assertions, lint exit 0, no `_note` history
  of prompt edits since) — taken as served.
- That the per-render grained upload matches the viewed colour block-in (the flow regenerates the grained
  variant per run and the ledger logs the block-in, not the grain step) — carried from v5/v6 on flow-code
  evidence.
- Per-render sampler parameters (steps / cfg / guidance / denoise / grainAttenuate) — rail 3 open; taken from
  `forge.config.json` + graph code, not confirmed per render.
- The composed positive string actually sent per render is not logged; register-clean claim rests on code
  reading + the env-graph pins (v6) + prompt-lint (this roll).
- The 10001 white cabinet: modern-utility read vs pre-industrial food-safe/market-cabinet read — both survive
  at 2.5×. Flagged **probable** era break; the cell REJECTs regardless.
- seed12345's clock face: an era-legal but register-wrong object (town-hall clock on a mill-town tower) —
  judged a cliché-register nit (recommendation level), not a style-law break; noted here so it is not lost.
- Whether 42424's left-margin water is river or marsh puddle: unresolved at 2.5×; affects the generosity of one
  PARTIAL, not any cell verdict.
- Anchor-seed comparability across rolls remains labels, never controlled pairs (carried from v6).
