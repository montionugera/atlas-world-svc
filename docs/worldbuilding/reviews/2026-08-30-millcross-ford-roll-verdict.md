# Millcross FORD roll — verdict sheet (2026-08-30)

Reviewer: town-canon-reviewer (Pass 1/2/3 per role sheet). Provenance verified, not assumed:
`tools/art-forge/runs/A1-ART-02.json` (2026-08-30T03:05Z) — seeds 10001 / 20002 / 30003,
`control:depth`, `strength:0.3`, briefHash `47928a1704220c52`. The brief
(`tools/art-forge/briefs/A1-ART-02.json:4`) verbatim asserts all three ford clauses under review:
carts "wading the shallow gravel-bed river, wet wheel ruts drying on the stones"; the wheel
"turning in the open race" beside "the sluice at the crossing"; "painted emblem boards — the
crossed roads over an empty bowl". It also asserts the anti-drift clauses ("steep shingled roofs
in ash-grey and rope-brown", "timber-and-earth town wall", "plain oak" gate tower).

## Per-cell verdict table

| Cell | Ford clause (carts wading, wet ruts) | Wheel clause (open race, beside sluice) | Emblem clause (crossed-roads-over-bowl boards) | Pass 1–3 summary | Verdict |
|---|---|---|---|---|---|
| seed10001-s0.30 | **FAIL** — no cart touches the water; the queue is oxen with cart wheels strapped to their flanks (cart-ox chimeras) on a dry road; no ruts. | **FAIL** — the wheel is a decorative ornament on the castle gatehouse face, above the arch, in no race, beside no sluice. | **FAIL** — no emblem boards; small gibberish plaque only. | Canon OK (walled core present, queue composes first sight, no bridge, no modern objects). **Style-law break:** full crenellated stone castle gatehouse + crenellated curtain — "fantasy-brochure battlements" are an owner-forbidden characteristic (`town-criteria.json:263-264`; "castle" register, :248). Pantile + fachwerk drift persist (:175-189). | **VETO** |
| seed20002-s0.30 | **PARTIAL** — the only cell with carts actually standing in shallow water, but the water is a flooded market square (stalls and benches standing in it), not a gravel-bed river; no ruts. | **FAIL** — no wheel, no mill, no race anywhere; several 2–3-storey masses compete (`exactly-one-two-storey`, :87-92, inverted). | **FAIL** — hallucinated roundels painted on cart canopies, not crossed-roads-over-bowl boards. | No wall ring or gate (walled-core fail, :73-78). Crenellated tower top-left = same battlement break. Gibberish fascia lettering ("SUILALATONS"-class). Pantile + fachwerk persist. | **VETO** |
| seed30003-s0.30 | **FAIL** — ox-cart chimeras loitering at a stagnant oval pond; no wading carts, no ruts. | **FAIL** — wheel present in a wall arch but **dry**: no flow, no race, no sluice — hydraulically incoherent (a mill wheel turns in moving water; Pass 2 ford/race coherence fails). | **FAIL** — roundel on the red awning is the campaign's closest emblem read, but it is printed-looking, not chalked, and no boards on brackets. | Long crenellated stone curtain with arcades = castle register, dominant element (**style-law break**, :263-264). Red pantile + brick chimneys (Embervale materials, `materials-by-economy` :175-181) + fachwerk. Gibberish signage. | **VETO** |

Recorded improvements, for honesty: **zero motor vehicles, zero bridges** across all three cells —
the modern-contamination class and the bridge-instead-of-ford class did not recur.

## Strongest cell

**seed10001-s0.30** — the only cell where wall, gate passage, cart-queue first-sight grammar and
a single dominant vertical all compose correctly; its defects (castle register, wheel-on-gate,
pantile/fachwerk) are one coherent wrong register rather than internal incoherence. Still a VETO —
strongest does not mean acceptable.

## Escalation ruling — this is now the cfg/sampler escalation

All three cells fail on the **same classes** as the previous sheets: pantile drift (3/3 here,
8/9 across the campaign), decorative fachwerk, gibberish painted lettering, castle-battlement
register, wheel displaced or absent (0/9 cells have ever rendered the wheel in the race). The
prompt-side levers are exhausted: the anti-drift clauses were **in the prompt verbatim** and fresh
seeds reproduced every class — so this is not seed-stochastic variance (my walled-roll directive 4
hypothesis) but a cfg-1 sampler-attention failure: negatives and fine compositional clauses carry
no force. **Another seed roll at these settings is not justified.**

## Minimal next step

Owner decision on the escalation knob, then one controlled re-roll — no further cfg-1 seed batches:

- **Recommended:** A/B raise of guidance strength (cfg) on this exact brief + same three seeds, per
  the pending escalation I filed on the pantile drift; keep depth 0.30.
- Alternative: sampler/steps change, or img2img fix-up lane off seed10001 at high denoise (loses
  seed determinism; second choice).

## Rail changes

Add to the Pass-3 visual-scan token list (`content/world/town-criteria.json`, per my walled-roll
proposal): `crenellation`, `battlement`, `cart wheels on animal`, `gibberish lettering` —
battlements are the recurring register the referencePolicy forbids but no token catches.

## Open questions for the owner

1. Escalation knob choice (above) — recommendation: cfg A/B first. This is the decision the
   pending escalation was filed to force.
2. Unchanged: G5 quest contradiction ("Meet the road at the gate") stays open, untouched here.

## Could not verify

Machine gates (`check_content.mjs` G-TOWN-*) not run — none evaluates rendered pixels; this sheet
is the human-half pass. Counts for the intervening 42424/90210/555001 batch (pantile 5/6) are taken
from the assignment and my walled-roll sheet, not re-derived from that sheet's images.
