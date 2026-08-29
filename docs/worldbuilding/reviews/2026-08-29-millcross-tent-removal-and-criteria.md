# Review — Millcross tent-quarter removal (6894e97 + 4a0ee15) and `town-criteria.json` v1

**Date:** 2026-08-29 · **Reviewer role:** town-canon-reviewer (`.claude/agents/town-canon-reviewer.md`)
**Subject:** ratify/VETO the tent-removal commit set and the "a dozen structures" brief wording; author the machine-readable town criteria; revise the remaining stage plan.
**Reviewed:** `git show 6894e97`, `git show 4a0ee15`, current `content/towns/town-millcross.json`, `content/schemas/town-plan.schema.json`, `content/spine/nodes/n-millcross.json`, `content/world/resolved/continent-02.json`, A1 §6/§9, A3, `docs/worldbuilding/ABP-segment-control.md`, `content/story/style.md` §3, `content/story/canon.md` §6, `content/story/quests.json`, `tools/art-forge/forge.config.json` styleGuard, `tools/art-forge/generate/prompt-lint.mjs`.

## Verdict up front

**RATIFY the removal — every structural element of it is sound and deliberately canon-amended. One VETO on a single prompt sentence** (carried into this commit set by the count edit, contradicting the canon sentence the same commit amended). Two STRONG OBJECTIONS on stale A3 prose the reconciliation commit missed. Fix all three in one small follow-up commit before the concept roll consumes the brief.

---

## Criterion rows

| # | Criterion | Verdict | Evidence | Comment |
| --- | --- | --- | --- | --- |
| C1 | `kind: "tent"` removed from schema enum AND from the plan | **PASS** | schema line 89 (7-value enum); plan has 11 footprints, 0 tents; `town-millcross.test.mjs` now asserts `tents.length === 0` + non-empty east bank (110/110 pass) | Enum and renderer map tightened in the same commit — no orphan value. |
| C2 | Canon amendment is deliberate and same-commit | **PASS** | A1 §6 rewritten in 6894e97 (materials upgrade + "camps … came down when the timber rows went up"); A3 §2 rows re-quoted with the amendment date | Satisfies `canon.md` §6: content and canon changed together, never silently. |
| C3 | Plan internal consistency after removal | **PASS** | 11 footprints · 5 roads (cart 14,14,12,12 · foot 6) · `storeys:2` only on `mill-house`; A3 §3.2 row counts match the file exactly | Road/vertex counts (5 polylines, 17 vertices) verified against the file. |
| C4 | Composition re-derivation (built 28→24, meadow 63→67) | **PASS** | `G-TOWN-COMP` green in my content-gate run (0 failures); derivation is area(footprints ∪ roads ∪ plazas)/extent, ±3 pp (`scripts/lib/spine.mjs:652`) | Hand-check: ~2 776 u² footprints + ~5 000 u² roads + 728 u² yard ≈ 24% of 220×160. Honest. |
| C5 | Spine re-baseline (world-digest, geometry-lock, resolved) | **PASS** | `check_world_digest --check` → digest matches; `check_resolved --check` → 13 continents, 0 drifted; `check_geometry_lock --check` → result recorded in §Evidence (≈492 s by design, own CI step) | geometry-lock `--check` is *supposed* to be slow; do not fold it into fast suites (its own header says so). |
| C6 | Reconciliation commit 4a0ee15 completeness | **STRONG OBJECTION** | A3 §3.1 heading still "The 30 ids"; counts line still "4 CANON-ID · 15 CANON-THING · 11 INVENTED = 30" (true pre-removal: 30 ids; now 22 = 4+9+9); §3.2 element-counts row still "7 roads · 17 footprints" | The per-id rows were fixed; the prose counts and heading above them were not. Coverage command passes (22↔22) only because it checks id membership, not the prose. Fix named in R-2. |
| C7 | "a dozen structures" wording | **PASS** (with rail) | Plan truth: 11 footprints; "a dozen" = 12; \|12−11\| = 1. `mustAssert` enforces the phrase (prompt-lint R3/R4) | Owner-set wording is a bounded approximation, not a miscount. Rail: `brief-count-band` (tolerance ±2) added to the criteria file so any future footprint change forces a phrase re-derivation. |
| C8 | Prompt sentence "ranged in tidy rows along the hard-packed earth roads" | **VETO** | Canon A1 §6: "no plan"; amended A1 §9 block: "strung with **no plan** along the roads" — same commit. The brief JSON prompt asserts the opposite register. `briefs/A1-ART-02.json` `.prompt` is the exact field. | Predates 6894e97 (the F-039 2026-08-08 negation workaround) but 6894e97 rewrote the *adjacent* sentence and left this one, so the commit ships prompt↔canon contradiction. Positive rewording required (prompt-lint bans negation), e.g. "strung out along the hard-packed earth roads on both banks" or "each house set where its trade needed it, along the hard-packed earth roads" — owner picks; "not tidy" is not an option (feeds `tidy`). |
| C9 | Truth-surface sweep (art manifest, `_promptNote`) | **PASS** | 4a0ee15 F5 fixed both; manifest description now "single-storey timber-framed houses with plastered walls on stone footings"; `_promptNote` records the tent removal + frozen depth-mass caveat | The "no longer world truth" note on the frozen `refugee-tents-midground` mass is exactly the right shape. |
| C10 | Story tents stay story (temporary road-side register) | **PASS** | `quests.json` tents untouched; A1 §6 amendment re-scopes camps as "on the road camp under canvas … and move on"; emblem "chalked on awnings" keeps the canvas register without a built quarter | The removal makes the Quartermaster's tents *more* coherent, not less. |
| C11 | Known G5 item not silently closed | **PASS** | `quest-the-road-of-strangers` "Meet the road at the gate" still contradicts wall-less Millcross; recorded as open in `town-criteria.json` `knownOpenItems` | Not re-litigated, per mandate; flagged so nobody closes it by accident. |
| C12 | Anchor truth plan ↔ node ↔ resolved world | **PASS** | `anchor.geographyAt [98.2,152.6]` byte-identical to `n-millcross.json` `placement.anchor` and `continent-02.json` `towns[3].at` | See C13 for the stale doc quotes. |
| C13 | A3 anchor quotes | **STRONG OBJECTION** | A3 §2 ("`towns[millcross].at = [86,118]`"), §3.1 counts note, §3.2 row, §6 q2 all cite `[86,118]` / `cluster1-geography.json`, a file deleted by F-043 (I-092 continent world). §0/§5 quote it too. | Predates this commit set, but 6894e97 edited the surrounding table rows without noticing. Fix named in R-3. |
| C14 | Gates actually run by the reviewer | **PASS** | See §Evidence — content gate 0 failures; town tests 110/110; art-forge 210 pass / 7 skip / 0 fail (= 217); town-statics 7/7; world-digest, resolved clean; geometry-lock per §Evidence | No gate declared that I did not run. |

**VETO/OBJECTION list:** V-1 = C8 (one prompt sentence); SO-1 = C6 (A3 §3 prose counts); SO-2 = C13 (A3 anchor quotes).

---

## Rail changes (concrete data diffs)

**R-1 · DELIVERED — `content/world/town-criteria.json` v1** (new file, this review). 6 measured rules (road floors 12/4, foot-road-is-mob-free, extent band 150–260, footprint shorter side ≥ 6, mob-band caveat), 11 ratified Millcross rules (wall-less, no-tent-quarter, exactly-one-two-storey, authored widths 14/14/12/12+6, extent 220×160, palette, ribbon sprawl, one cart crossing, first-sight cart-queue, no-toll-house, water-mill-not-wind), 5 realism rules (materials-by-economy, structure-not-decoration, roof-climate coherence, silhouette ownership, map-derived-concept), 30-token forbidden cliché vocabulary + Mondstadt/Gludio reference policy (characteristics only, never prompt text), millcross brief `forbiddenPhrases` (incl. "tidy rows") and `countBand`. Consumers: consistency test, prompt-lint, styleGuard. Every entry carries `source`; reviewer-authored entries claim no canon force.

**R-2 · PROPOSED — A3 §3 prose repair** (follow-up commit):
- `### 3.1 The 30 ids` → `### 3.1 The 22 ids`
- Counts line → `4 CANON-ID · 9 CANON-THING · 9 INVENTED = 22`
- §3.2 element-counts row → `2 water · 5 roads · 11 footprints · 1 plaza · 3 landmarks`
- Extend the §3.3 coverage command to also parse and assert the counts line, so this drift class is machine-caught next time.

**R-3 · PROPOSED — A3 anchor re-frame** (same follow-up commit): annotate §0/§5 as the pre-F-043 cluster-1 sheet record (their file no longer exists); rewrite §2's frame sentence, §3.1 counts note, §3.2 `anchor.geographyAt` row and §6 q2 to `[98.2, 152.6]` with `content/world/resolved/continent-02.json` as the citation.

**R-4 · PROPOSED — prompt fix for V-1** (same follow-up commit, owner picks wording): `briefs/A1-ART-02.json` `.prompt` — replace "ranged in tidy rows along the hard-packed earth roads" with a positive no-plan wording; extend prompt-lint tests with the R-1 `forbiddenPhrases` list for A1-ART-02.

---

## Revised stage list (remaining F-039 work — replaces the implementer's order)

Order rationale: repair the traceability the gates will cite, prove the criteria file is consumable *before* writing the doc that references it, then codify, then generate. Per global rule 11: a criterion nothing reads is decoration — the gate must exist before the workflow doc makes claims on it.

| Stage | Scope | Acceptance criteria (gate-checkable) | What I review at stage end |
| --- | --- | --- | --- |
| **0 · A3 reconciliation** (new, first) | R-2 + R-3 + R-4 in one `fix(world)` commit | §3.3 coverage command green *with* the counts assertion; grep shows zero `[86,118]` outside annotated §0/§5; prompt-lint green on the reworded prompt | The diff only — no JSON truth files may move. |
| **1 · Consistency gate** | New `scripts/tests/town-criteria.test.mjs` | Reads `content/world/town-criteria.json` **as data** (no duplicated constants); runs every `check` for `measured` + `towns.millcross.ratified` + `briefs` against every plan file; a seeded-violation negative test proves it fails; `node --test` green | That the JSON is the single enforcement surface (no second copy of a floor anywhere), and that a `source`-less rule would be rejected by a schema-lite assert. |
| **2 · Workflow doc** | `docs/worldbuilding/town-concept-workflow.md` | Encodes: criteria → consistency gate → brief lint → map-accurate block-in → roll → review; cites both ABP negative results as constraints; the segment-control acceptance bar is re-derived from the **amended** brief (the ABP doc's "plank/canvas" bar is historical and must not be inherited); no new unmeasured numbers | Canon citations section by section; I veto any stage that lets prose reach the model without passing the merged vocabulary lint. |
| **3 · Run manifest standard** | Codify `tools/art-forge/runs/*.json` | Schema: briefId + briefHash chain, seed, control mode, model, out path, ts; guard-probe temp paths excluded (or typed as probes); trailing newline; existing `runs/A1-ART-02.json` migrated to schema | Schema + migration diff only. No taste. |
| **4 · Map-accurate concept roll** | The actual Millcross concept pass | Composition derived from `town-millcross.json` geometry (footprints/roads/ford/race drive the block-in; overlay comparison committed); prompt passes merged R2 (modern + cliché vocabulary + millcross phrases) and R4 (`mustAssert`: "a dozen structures", "beyond the town edge"); mustNotShow checked per cell (pylons, vehicles, windmill sails, road markings, town wall); palette asserted; owner cherry-picks | Every candidate cell against the criteria file + plan overlay; verdict sheet per roll; a cell that paints a planned village or a camp is rejected even if the prompt was clean (map-derived-concept rule). |

---

## Open questions for the owner

1. **V-1 wording** — pick the positive no-plan phrase for the brief prompt (options in C8). My recommendation: "strung out along the hard-packed earth roads on both banks" (closest to the amended §9 sentence, zero new tokens).
2. **Ratify the reviewer-authored criteria rules** — `materials-by-economy`, `structure-not-decoration`, `map-derived-concept`, the forbidden vocabulary and the reference policy ship in v1 tagged `reviewer:`. Keep, edit, or strike — silence at next review = I treat them as active and enforce them.
3. **"a dozen" vs "eleven"** — keep the bounded approximation (my recommendation: keep; the count-band rail makes it safe) or switch the brief to the exact count.

---

## Verdict-sheet template (future runs reuse this)

```markdown
# Review — <subject>
**Date:** <YYYY-MM-DD> · **Reviewer role:** <role file> · **Commits/artifacts reviewed:** <list>

## Verdict up front
<RATIFY | RATIFY WITH FIXES | VETO> — <one sentence>. Fix list: <V-n/SO-n ids>.

## Criterion rows
| # | Criterion | Verdict (PASS/STRONG OBJECTION/VETO/UNVERIFIED) | Evidence (file+section or command+output) | Comment (one sentence) |
| --- | --- | --- | --- | --- |

## Registers used
CANON: <files+sections> · INVENTED: <tagged values> · PROPOSED: <this diff>
(any INVENTED value claiming canon force → VETO, cite the field)

## Rail changes
R-n · <DELIVERED | PROPOSED> — <concrete data diff: file, field, value, consumer>

## Open questions for the owner
1. <decision only a human can make> — recommendation: <one line>.

## Evidence log (commands I ran, not gates I was told are green)
<command> → <result>
## Not verified
<what I could not run or read, and why>
```

---

## Evidence log

- `node scripts/check_content.mjs` → `content-gate: 12 sheets, 1 maps, 158 story, 1 placements, 40 zones, 1 towns, 36 nodes, 0 failures, 34 warnings`
- `node --test scripts/tests/town-millcross.test.mjs scripts/tests/town-plan.test.mjs` → 110 pass / 0 fail
- `node --test tools/art-forge/tests/*.test.mjs` → 210 pass / 7 skipped / 0 fail (217 total, matches the 4a0ee15 message)
- `npx jest town-statics` (colyseus-server) → 7 passed
- `node scripts/check_world_digest.mjs --check` → digest matches
- `node scripts/check_resolved.mjs --check` → 13 continents, 0 drifted
- `node scripts/check_geometry_lock.mjs --check` → `check-geometry-lock: check clean` (full recompute, own-CI-step runtime)
- A3 §3.3 coverage command (run verbatim) → idsInJson=22, idsInTable=22, COVERAGE OK — while the §3.1 heading and counts line still say 30 (C6)
- Node checks: plan 11 footprints / 0 tents; `continent-02.json` `towns[3].at = [98.2, 152.6]`; `n-millcross.json` `placement.anchor` byte-identical

## Not verified

- Nothing outstanding. `check_geometry_lock.mjs --check` completed after this sheet was drafted: **`check-geometry-lock: check clean`** (full pair-area recompute, ~10 min — its designed own-CI-step cost; the C5 row's PASS now stands on its own output, not on the nodesHash inference alone).
- The freehand spike images ("a camp, not a town") were not re-reviewed — judged by the owner; only the recorded verdict was consumed.
