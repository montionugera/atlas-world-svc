# Review · A1-ART-02 Millcross — FLUX.1-dev roll (D-base, depth 0.30) — verdict

**Date:** 2026-08-30 · **Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`)
**Reviewed:** `tools/art-forge/out/env/A1-ART-02-dev-seed{12345,42424,10001}-s0.30.png` (plain dev D-base per
`forge.config.json` `samplerDev` — 20 steps, cfg 1, guidance 5.0, euler/simple; depth 0.30; anchor pass parked).
**Render contract:** `tools/art-forge/briefs/A1-ART-02.json` (walled brief, post-d210d18) — wall ring, plain-oak
west gate tower with open cart passage, sluice mill "taller than the wall or any rooftop", guild hall + inn as the
only other two-storey masses, carts **wading** the gravel ford, no bridge anywhere, plastered walls on stone
footings, steep shingled roofs, palette ash-grey / rope-brown / tallow-yellow, emblem boards on brackets, town
edge bounded ("beyond the town edge … low farmland").
**Canon base:** `docs/worldbuilding/A1-geography-cluster1.md:355-369` (§6 town entry) and `:510-516` (§9 brief);
`content/story/style.md` §1; `docs/worldbuilding/DR-001-L1-scope.md:37` (K5); contamination law
`tools/art-forge/forge.config.json:104-133` (`styleGuard.era` + `forbiddenTokens`).
**Machine gates run this review:** `node scripts/check_content.mjs` → **0 failures** (34 declared warnings);
`node tools/art-forge/generate/prompt-lint.mjs` → **exit 0**.

**Registers used below:** CANON = A1/A3/canon.md/style.md as cited. INVENTED = the brief's positive additions
(reviewer-ratified per d210d18). The renders are the artefacts under judgement; nothing here proposes canon change.

---

## Per-cell verdict table

| Criterion | seed12345 | seed42424 | seed10001 | Canon cite |
| --- | --- | --- | --- | --- |
| **P1 wall ring** | **FAIL** — no timber-and-earth wall anywhere; a picket fence stands in its place | **FAIL** — no wall ring; only low stone retaining walls | **FAIL** — no wall ring | brief ¶2; A1 §6 "timber-and-earth wall" |
| **P1 gate tower** | **FAIL** — none | **PARTIAL** — arch tower present but decorative plastered fachwerk, not "plain oak … black iron hinge straps" | **PARTIAL** — conical-roof tower, no open cart passage | brief ¶2 (INVENTED, d210d18) |
| **P1 venues (guild hall, inn, high street)** | **PASS** — awninged high street reads; too many of the houses are 2–3 storey (discipline lost) | **PARTIAL** — frontages read, hall/inn not distinguishable | **PASS** — awnings + street frontage read | brief ¶2, ¶5; A1 §6 |
| **P1 ford (carts wading) / no bridge** | **PARTIAL** — no wading; small timber footbridge over a race-like channel only (no main-river bridge — least damage) | **FAIL** — no wading; **stone arch bridge over the main river** = a second cart-capable crossing, contradicting the one-crossing economy | **FAIL** — no wading; one wagon stranded mid-river instead; **stone arch bridge** mid-distance | brief ¶3; A1 §6 "stabling, ferrying at high water"; A1 §4 "exactly one [cart crossing]" |
| **P1 cart queue / town edge** | **PASS** queue / **FAIL** edge (street tiles into distant sprawl + mountains) | **PASS** queue / **FAIL** edge (town runs to wooded horizon) | **PASS** queue / **FAIL** edge (green hills to horizon) | brief ¶3 "longer than the town is wide", "beyond the town edge … low farmland" |
| **P2 materials (fachwerk / tile drift)** | **FAIL** — exposed decorative half-timber + red clay tile; brief demands **plastered** walls, **shingled** roofs; red pantile is *Embervale's* material (A1 §6:372-374) — cross-town material bleed | **FAIL** — same drift, storybook register strongest | **FAIL** — heaviest drift: saturated orange tile, Embervale's iron-red register | brief ¶2; A1 §6:361-362 ("split shingle"), :372-374 (pantile = Embervale) |
| **P2 mill + race/sluice placement** | **FAIL** — no mill or wheel at all; the defining structure is absent | **FAIL** — vestigial wheel bolted to a bank building; no race, no sluice; gate tower out-competes it | **PARTIAL** — best wheel of the roll (large, wooden, turning) but bank-side on the main river, no sluice/race cut | brief ¶4; A1 §6:360-361 "mill-wheel housing over the race is taller than the wall, and nothing else competes" |
| **P3 contamination (era tokens)** | **PASS** — no modern vehicles/pylons/skyline | **PASS** | **PASS** | `styleGuard.era`/`forbiddenTokens` (forge.config.json:104-133) |
| **P3 hallucinated text / off-world props** | **FAIL** — garbled sign text on hanging board; picket fence | **FAIL** — garbled plaque on gate tower | **PASS** — none spotted | ABP-flux-dev-and-anchor.md:39-47 (corner/signature-text finding) |
| **P3 style register (A8)** | Painterly w/ 3D lean — closest to concept register | Soft storybook — nearest to the banned "storybook half-timbered-everything" | **Flat poster / vector-leaning** — the documented hijack register, un-anchored | style.md §1 two-register law; DR-001 K5; A8 finding ABP-flux-dev-and-anchor.md:19-22 |
| **Palette (ash-grey / rope-brown / tallow-yellow, late afternoon)** | **FAIL** — bright midday blue sky, verdant green | **FAIL** — same | **FAIL** — worst: saturated warm orange/green | brief ¶1, ¶5; A1 §6:362-363 |

**Cell verdicts: seed12345 REJECT · seed42424 REJECT · seed10001 REJECT.** No cell is sign-off-able, even
acceptable-with-refinement: all three miss the wall ring, the ford-wading, the palette, and the material law.

**Strongest cell: seed12345** — least canon damage (no main-river bridge), the best venue street and cart queue,
and the register closest to usable concept art. **seed10001 is the mill reference** (its wheel is the only one
worth carrying forward as a visual target) but has the worst register and palette. **seed42424 is weakest**
(its bridge is the hardest canon contradiction in the roll: a second river crossing defeats the town's entire
reason to exist).

## A8 ruling — is dev's style register a ship blocker?

**No — the register is not the blocker; the instability is.** Within this one roll the three seeds landed in
three different media: painterly-3D (12345), storybook (42424), flat poster/vector (10001). That confirms A8
(`ABP-flux-dev-and-anchor.md:19-22`, :194-197) on plain D-base and fails set coherence: six towns rolled this
way will not read as one world, which **is** a blocker for the six-town recipe at the owner's long-term bar —
but it is a **recipe blocker, not a register verdict**. A painted concept register is acceptable for concept art
and compatible with K5 "bright art, grim world". Recommended lever: **style-clause wording**, not guidance —
guidance is already measured subject-dependent (7.0 buys structure, costs atmosphere; :107-118) and these cells
sat at the 5.0 compromise, so turning that dial cannot fix medium. Recommend **accept-dev-register-as-concept-
style conditional on the medium clause below being added and validated on one re-roll**; if the clause does not
stabilise the register across seeds, dev is not batch-safe and the recipe question reopens.

## Minimal positive-form change set for the next roll

1. **Shared medium/light clause (the A8 lever).** Add one positive sentence to every environment prompt — as a
   new `styleGuard.medium` beside `era` (forge.config.json:104), or appended to `era` — e.g. *"Painted concept
   art in gouache on toned paper, visible brushwork, muted overcast late-afternoon light, ash-grey sky."*
   Positive form only, no negation; prompt-lint stays green by construction. Targets: register instability +
   the blue-midday palette miss.
2. **Depth strength 0.30 → 0.40** (top of the measured window) for the walled block-in. All three cells at 0.30
   dropped the committed wall masses and the race cut entirely — thin linear masses did not survive; the
   measured usable window is 0.30–0.40 and the >0.40 end collapses to flat (forge.config.json strength note;
   ABP-controlnet-replication.md). One number; no brief edit.
3. **One brief edit (optional but recommended):** concrete nouns over abstractions — "whitewashed plaster walls"
   and "wood-shingled roofs" for "plastered walls" / "steep shingled roofs". The red tile arrived from the prior
   despite the abstract words already in the prompt.

Nothing else. No anchor work (parked), no guidance change, no negative conditioning (measured to *cause*
contamination — forge.config.json:105 `_note`).

## Rail changes (concrete data diffs proposed)

- `tools/art-forge/forge.config.json` → `styleGuard`: add `"medium": "<clause from change 1>"`, composed into
  every env positive by `buildEnvPositive()` exactly as `era` is; extend prompt-lint to fail if an env prompt
  omits it (same mechanism that enforces `mustAssert`).
- Render intake: record `model`, `guidance`, `depthStrength` in the output manifest/filename metadata per
  DR-002 tagging rule (ABP-flux-dev-and-anchor.md:352-353) — currently only recoverable from filenames.

## Open questions for the owner

1. **Accept the A8 ruling?** Recommendation: yes — register acceptable-as-concept-style, conditional on the
   medium clause validating on the next roll.
2. **Storybook surface.** `tools/asset-storybook/world-index.json` contains no `A1-ART-02` entry — these cells
   (and the recipe itself) are not observable in a review surface, against the 2026-08-15 owner rule. Wire
   art-forge env renders into the storybook before the next roll.
3. **Contingency.** If the next roll still cannot hold the wall ring from text + depth 0.40, the structural fix
   is the (parked) block-in anchor with its flat-vector hijack resolved — that is where the remaining risk sits.

## What this review could not verify

- Generation parameters beyond filenames + assignment statement (depth 0.30, D-base recipe): no run manifest was
  checked — judged on stated settings.
- The "3 gate towers" figure lives in the committed town-plan context, not in the brief text (which asserts one
  west gate tower); `content/towns/town-millcross.json` was gate-checked (content-gate 1 town, 0 failures) but
  not read line-by-line for tower count. Immaterial to the verdict: no cell renders *any* gate tower to spec.
- Whether the anchor pass's "flat-vector despite grain" failure has a recorded cell-by-cell record; it is taken
  as parked per the assignment and was not re-tested here.
