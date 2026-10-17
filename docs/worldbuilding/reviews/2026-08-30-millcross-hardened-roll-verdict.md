# Millcross HARDENED walled roll — verdict sheet (2026-08-30)

Reviewer: town-canon-reviewer (Pass 1/2/3 per role sheet, criteria v1.1). Roll: depth control,
strength 0.30, briefHash `3623c1009f1eb5b9` (post-`d210d18`), seeds 42424 / 90210 / 555001
(ledger `tools/art-forge/runs/A1-ART-02.json:35-40`, block-in regenerated per render at the same
briefHash — conditioning provenance verified, not assumed). Brief: `tools/art-forge/briefs/A1-ART-02.json:4`
— all four reviewer-ratified additions from the previous sheet are present in the prompt (oak gate
tower + cart passage + hinge straps, sluice-side mill taller than any rooftop, emblem boards on
wrought-iron brackets, ash-grey/rope-brown shingle). Vocabulary rail live: `content/world/town-criteria.json:216`
→ prompt-lint R2 + styleGuard at generation (`generate/env.mjs:254`). Canon floor for Pass 1:
A1 §3.1 line 136 — the Meltwash is "fordable in **exactly one** by cart — that place is Millcross";
criteria `:73` walled-core.

## Per-cell verdict table

| Cell | Pass 1 — walled structure & the crossing | Pass 2 — materials & silhouette | Pass 3 — contamination | Verdict |
|---|---|---|---|---|
| seed42424-s0.30 | **FAIL.** Stone wall runs full frame width; central timber gatehouse with open cart passage (the ratified gate read landed). But the water is a **stone quay with mooring pilings and a dock** on the right — a deep-water harbour register where the ford must be; the road never descends to water, no shallow crossing, no carts wading. Ford absent = `one-cart-crossing` failed (A1 §3.1:136). Gibberish "IBLAYAS" + star board on the gate lintel. One gate in frame — count UNVERIFIED (per prior owner call). | Grey shingle present but **red-orange pantile** on several roofs; **ornamental storybook fachwerk** on nearly every house (structure-not-decoration register); the mill wheel renders as a **detached wheel bolted to the wall face as ornament** — no housing, no sluice, no race; gatehouse and the right gabled house tie for tallest. Green market stall + red shop awning off-palette. | No motor vehicles, poles, or clock faces — era clean. Gibberish pseudo-lettering on **three** boards (gate board, right fascia, left hanging sign); the emblem-board addition did not displace lettering. | **REJECT** — harbour-instead-of-ford is the canon crossing failure, veto-grade. |
| seed90210-s0.30 | **FAIL.** **No wall ring at all** — the stone gatehouse stands free between streets (same failure class as 777 last roll, worse: this brief had the hardened gate sentence). **No water anywhere in frame** — no ford, no river. A **clock face** is set in the gate gable — the exact emblem-contamination class found on 777. Street holds a loose **cattle herd**, not the brief's loaded ox-cart queue. | **Full Embervale register:** red-orange pantile + black slate on every roof, red-brick chimney stacks, ornamental fachwerk with jetted floors throughout. **No mill, no wheel, no sluice** (a lone cartwheel leans against a left-edge building). Gatehouse is tallest but is not the mill. | Clock face (known class); gibberish "WEL…" board right edge; green + yellow striped café awnings. No vehicles. | **REJECT** — worst cell; wall, ford, mill, cart queue, and palette all absent or drifted. |
| seed555001-s0.30 | **FAIL (closest gate read of the three).** Timber gate tower on stone footings with open cart passage and crenellated top — the ratified oak-gate sentence conditioned best here; **two hanging shield-shaped emblem boards** flank the passage (emblem-board addition landed). But the tower is **freestanding — no wall ring continues** in either direction. The road never meets water: the river sits left behind a post-and-rail fence reading as a millpond; **no ford, no crossing**. A tall bare pole stands mid-frame (no crossarm, no wires — pole-ambiguous, recommendation only). | Grey-brown shingle on the left cluster (on-palette) but **orange pantile** on the right cluster and a conical orange turret roof; red-brick chimneys; ornamental fachwerk everywhere; left building sits on **stone arcades over the water** (engineered-embankment register, 777-08-29 class) with **no wheel, no sluice** — mill absent. **Second vertical accent:** 3-storey house with conical turret and weathervane spire — `exactly-one-two-storey` broken. Canvas-covered wagons read prairie-schooner, not sack-laden ox-carts. | Gibberish "GERMITT" on the tower fascia (the emblem boards themselves read clean); spired turret is the generic-village vertical. No modern vehicles, no clock. | **REJECT** — freestanding gate + fordless road + missing mill; but the fewest distinct defects. |

Reversal worth recording: 90210 inherits 777's lane and repeats its failure class exactly
(no wall + emblem contamination). 42424 inherits 12345's lane and stays strongest. Seed lanes are
again consistent within a brief, so fresh-seed re-rolls in the 42424/555001 lanes remain the
cheapest path; 90210's lane looks seed-cursed under walled briefs.

## Strongest cell

**seed42424-s0.30** — the only cell with wall ring, cart-passable gate, and a loaded cart queue in
frame simultaneously. Its defects (quay-for-ford, ornament wheel, pantile patches, sign lettering)
are all nameable, but the ford failure alone vetoes it; none of the three passes conditionally.

## Minimal change set for the next roll (positive-form only — the prompt lint bans negation)

1. **Assert the ford as the in-frame crossing.** Append to the ford-gate sentence: "the road runs
   down to the ford where loaded carts wade the wide shallow gravel-bed river, wet wheel ruts
   entering the water." Targets the harbour register (42424) and the dry street (90210) — the
   current brief names the ford only in the beyond-the-edge clause, so the sampler never renders
   the crossing itself.
2. **Assert wheel-in-water.** Extend the mill sentence: "its great oak wheel turns in the open
   race channel where the sluice water leaves the river." Targets the detached ornament wheel
   (42424) and absent wheel (555001, 90210) — "stands beside the sluice" alone left the wheel
   unrendered in all three cells.
3. **Extend the emblem to the boards.** Append to the emblem-board clause: "each board painted
   with the circle crossed by two strokes." Replaces pseudo-lettering tokens with the emblem
   register the awnings already carry; gibberish appeared in 3 of 3 cells this roll.
4. **No prompt removals.** The era paragraph and all four d210d18 additions stay — gate and
   emblem-board additions demonstrably conditioned (42424 gate, 555001 boards); removing text
   cannot fix a seed-level sampler failure.

## Escalation (owner decision, per prior directive 4's spirit)

- **Pantile drift is no longer seed-stochastic:** red/orange tile in 5 of 6 cells across two
  walled rolls despite the ratified "steep shingled roofs in ash-grey and rope-brown" sitting
  directly in the positive prompt. The phrase is not binding at cfg 1. Owner call: raise cfg,
  add a second conditioning lever, or accept the drift for concept-stage cells. My
  recommendation: one more roll with the change set above; if pantile persists in ≥2 of 3,
  escalate to a cfg experiment rather than more prompt text.
- Same bucket, weaker signal: ornamental fachwerk in 6 of 6 cells from "timber-framed houses
  with plastered walls" — the storybook prior on that token pair is strong.

## Rail changes

None new. The five 2026-08-30 visual-scan tokens (clock face, poster window, red conveyance,
bus, motor van) were the right list and all three cells are clean on them; the harbour-register
failure is a composition fact, not a token, and stays eye-caught.

## Open questions for the owner

- OQ (carried, unchanged): gate-tower count remains UNVERIFIED from ground-level cells; one
  visible gate + wall continuity still satisfies review for concept cells per your 08-30 call.
- OQ (new): the cfg-vs-prompt-text decision above. Recommendation stated; your call before the
  next roll is queued.

## Could not verify

Gate-tower count (3, amendment `579836d`) — single ground-level vantage, per standing owner call.
Machine gates (`check_content.mjs` G-TOWN-*) not run: none evaluates rendered pixels; this sheet
is the human-half pass. All three images viewed directly; ledger and brief read, not summarised.
