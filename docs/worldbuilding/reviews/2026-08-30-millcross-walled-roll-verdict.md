# Millcross WALLED concept roll — verdict sheet (2026-08-30)

Reviewer: town-canon-reviewer (Pass 1/2/3 per role sheet, criteria v1.1).
Roll: depth control, strength 0.30, briefHash `def7756ea00475b0`, seeds 12345 / 777 / 31337
(ledger `tools/art-forge/runs/A1-ART-02.json:28-32`, 2026-08-30T01:30Z). Brief: `docs/worldbuilding/A1-geography-cluster1.md:510` (A1-ART-02) + wall amendment commit `579836d` (wall ring west core, 3 gate towers, 7 venues). Criteria: `content/world/town-criteria.json:73` (walled-core), `:163-167` (count band 18), `:202-204` (silhouette non-transfer), `:248` (anti-cliché v1.1 — rampart/palisade legal).

## Per-cell verdict table

| Cell | Pass 1 — walled structure | Pass 2 — materials & silhouette | Pass 3 — contamination | Verdict |
|---|---|---|---|---|
| seed12345-s0.30 | **PASS.** Stone wall with timber crest runs full frame width (crest legal per v1.1 `:248`). Central oak gate tower with dark cart passage, road enters it. Tallow-yellow awnings front readable fachwerk rows both sides. River at left, race sluices under the wall, ford in frame bottom-left, **no bridge**. Only 1 of 3 gate towers in frame — frame crops the rest, count UNVERIFIED. | Grey shingle, timber, plaster — on-brief; **no** red pantile. Tallest structure carries the wheel, but it is the **gate tower wearing the mill wheel** — the wheel sits displaced from the race at the left sluice. Mill-housing-as-tallest roughly holds. | Gibberish painted lettering on **two** signboards: gate lintel (`I.GA K.K.I`-class pseudo-text) and the left building's fascia. Period covered ox-carts — clean. No modern objects. | **PASS (conditional) — strongest cell.** |
| seed777-s0.30 | **FAIL.** Wall ring absent — one short stone wall stub around the wheel base, left of frame. No gate tower, no gate. Venues readable but the walled brief's core subject did not condition. No bridge; water right rear. | One thatch, otherwise fachwerk + tile; orange/red tile drifts toward Embervale pantile. **Silhouette FAIL** — tallest building is a plain 3-storey house; the wheel sits on a low stone base; mill neither tallest nor at the race. | Exterior **clock face** mounted on the right gable (emblem contamination); striped café-style awning on the central porch. No vehicles. | **REJECT** — walled-core rule not met (`town-criteria.json:73`). |
| seed31337-s0.30 | **FAIL.** Wall present (long coping-topped stone wall, full width), but the "gate" is a **5-bar wooden field gate** — farm gate, not a town gate tower. One shopfront venue, poster-clad. Road crosses a channel on a culvert/causeway, millpond right — ford ambiguous, no bridge over the main river. | **Material drift:** red pantile roofs throughout = Embervale's fired-brick/red-pantile register migrated into Millcross (`:202-204`). **No mill, no wheel**; central shop is tallest. Circled-X emblem painted on the central roof. | **FAIL — exact known class (sampler ignores negatives at cfg 1).** (a) red-and-white single-deck **bus/coach** behind the wall at left, among houses; (b) red motor **delivery van** with white canopy on the road in front of the wall, right of centre; (c) colourful **poster display** in the central shopfront window (modern retail signage). | **REJECT** — modern contamination, Pass 3 veto-grade. |

Reversal worth recording: 31337 was the **unwalled** roll's refinement candidate (commit `07a585f`); under the walled brief it is the worst cell. Seed rankings do **not** carry across brief changes.

## Strongest cell

**seed12345-s0.30** — the only cell where wall, gate, ford, venues, palette, and materials all read on-brief simultaneously.

## Next-iteration directives (positive-form only — prompt lint bans negation)

1. **Re-roll same settings** (depth 0.30, briefHash `def7756ea00475b0`) with **fresh seeds** in 12345's lane (e.g. 42424, 90210, 555001). Do **not** re-roll 31337 on this brief. The contamination is seed-stochastic, so treat by re-roll, not prompt surgery.
2. **Ratify these prompt additions:**
   - "the great timber mill-wheel housing stands beside the sluice on the river side of the wall, the only structure above one storey" — re-seats the wheel from the gate tower to the race.
   - "the west gate tower is plain oak with an open cart passage and black iron hinge straps" — pins the gate read that 31337 reduced to a field gate.
   - "shop fronts hang painted emblem boards on wrought-iron sign brackets" — replaces hallucinated lettering with the emblem register the brief already uses.
   - "steep shingled roofs in ash-grey and rope-brown" — forecloses the pantile drift.
3. **Prompt removals: none.** The era paragraph stays; removing prompt text cannot fix a seed-level sampler failure.
4. **Escalate only if** a fresh 3-seed batch still shows motor vehicles on ≥1 cell — then raise the cfg-1 sampler question with the owner; the era paragraph is measured-good and the evidence says re-roll first.
5. Brief-fidelity carry-over: the chalked crossed-roads-over-an-empty-bowl awning marks (A1:513) are absent in all three cells — fold into the next brief pass rather than this one.

## Rail changes

Add a reviewer visual-scan token list to `content/world/town-criteria.json` Pass-3 data (machine-readable checklist for image review, not prompt text): `exterior clock face`, `poster-plastered shop window`, `red-painted conveyance`, `single-deck bus`, `motor van`. These are the five recurring 2026-08-30 finds.

## Open questions for the owner

- Gate-tower count (3, amendment `579836d`) cannot be verified from one ground-level cell — is a second vantage cell required per roll, or does one tower in frame satisfy review? Recommendation: accept one visible gate + wall continuity for concept cells; verify the count only on the final key art.
