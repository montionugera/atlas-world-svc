# Review · A1-ART-02 Millcross — final review of the CELL OF RECORD vs the FULLY AMENDED BAR, shipping designation — verdict #18 — FINAL

**Date:** 2026-09-01 ·
**Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`) ·
**Verdict #18 in the loop; the FINAL review.** Owner decisions 2026-09-01, in sequence: (1) canon
amendment option b on materials — slate/brick as barge-ballast river trade (commit `356d1a2`);
(2) mill-emphasis cells approved and spent — verdicts #15 REJECT veto-pickup, #16 REJECT no-veto,
#17 REJECT seed-inert (commits `f278d06`, `02d9b7a`); (3) crenellation rail approved (`e467bd2`);
(4) canon amendment on the mill housing register — mass-and-wheel asserted, joinery released as
measured-systematic, wheel-over-race demoted to best-effort, fachwerk-on-amended-hash accepted as
known cost, NO further mill cell this cycle, cell of record for shipping = the subject-probe cell
(commit `fdb261a`). This sheet closes the loop: it judges the cell of record against the fully
amended bar and issues the shipping designation.

**Goal of this review, restated:** confirm the cell of record is byte-intact to its review record,
judge it once more (three passes) against the amended canon, and issue verdict #18 —
ACCEPT-AS-SHIP-CELL with a named remainder, or REJECT with the failing item. Nothing else edited.

**Cell of record:** `tools/art-forge/out/env/A1-ART-02-segment-subject-probe-seed12345-s0.45.png`
(viewed this review, downscaled `sips -Z 1024` to session temp — the token-budget rule; findings
carry over from verdict #12's 2.5–4× crop work on the same bytes).

**Byte-intactness:** sha256 measured this review `9e10d7511d0124ad35b3d2350fb72d41a254b6df0685dc2c28c1398abf4c2cdb`
— exact match to the record at verdict #12 (sheet line 24: probe `9e10d751…4c2cdb`). Ledger row
`tools/art-forge/runs/A1-ART-02.json` ts `2026-09-01T12:53:25.827Z`: seed 12345, control `segment`,
strength 0.45, briefHash `c0ef116c7e149adf`, out path — all match the render contract. Note: the
row carries **no sha field** (bookkeeping gap, rail-3 class); intactness rests on the verdict-#12
review record, which the fresh measurement matches. Honest close, not silently passed.

**Amended bar read this review:** `docs/worldbuilding/A1-geography-cluster1.md:355-372` (§6
Millcross economy — "slate and fired brick arrive as barge ballast landed at the ford", AMENDED
marker) and `:510-521` (§9 brief — materials register + "canon asserts the mass and the wheel, not
the joinery", AMENDED 2026-09-01, verdicts #15–#17); `content/world/town-criteria.json:66-74`
(`millcross-materials-lever-ledger` — full owner-decision chain + fork resolution verbatim),
`:183-189` (`structure-not-decoration`), `:199-203` (`millcross-brief-forbidden-phrases` —
pantile/half-timbered/red tile per-town ban), `:271-279` (`referencePolicy` forbidden
characteristics — storybook/fachwerk/windmill/castle class).

**Machine gates run THIS review (criteria file changed since #12, so re-run was mandatory):**
`node scripts/check_content.mjs` → **exit 0, 0 failures, 34 warnings** (the standing warning count
of every prior review); `node tools/art-forge/generate/prompt-lint.mjs` → **exit 0**.

---

## Three-pass judge vs the amended bar — the (a)–(f) items

| Item | Bar (citation) | Cell of record | Verdict |
| --- | --- | --- | --- |
| **(a) slate/brick register** | A1 §6:361-363 AMENDED — "slate and fired brick arrive as barge ballast landed at the ford"; brief :514-517 "steep slate roofs, brick chimney stacks and brick plinths" | Uniform slate coursing on all roofs (`67655F` per #12 f2); saturated red fired-brick stacks on both rows; brick plinth bands at right-row foots — exactly the amended register | **WITHIN CANON (amended)** |
| **(b) mill housing register** | Brief :518-521 AMENDED — "canon asserts the mass and the wheel, not the joinery"; criteria :66-74 fork resolution | Cell renders the static wheel echo (left, behind the wall), no housing mass — but the register is canon **as measured**; the weak presence is the named remainder (below), not a bar fail this cycle (owner decision 4: no further mill cell) | **WITHIN CANON (amended)** |
| **(c) wheel-over-race** | Criteria :66-74 — "wheel-over-race demoted to best-effort (systematic across two seeds)" | Not present in the cell; **not a PASS bar** — demoted by owner decision, recorded in the ledger | **DEMOTED — not a bar** |
| **(d) fachwerk** | Brief as-rolled :514 "timber frames visible only at corners and doorheads"; criteria :271-279 fachwerk-class ban; subject-probe is the fachwerk-clean reference (criteria :66-74) | Viewed this review: plain plaster gables both rows, zero timber bracing, zero storybook grid — matches #12 f1 "YES on all three surfaces" on the same bytes | **CLEAN** |
| **(e) crenellation** | Approved rail, `e467bd2` | #12 :99, on these bytes: "small corner pinnacles on the roof (mild brochure echo, **no crenellation**)" — the downscaled view confirms (corner pips, no battlement band) | **NONE** |
| **(f) era / modern intrusion** | `styleGuard` era law; #12 (g) PARTIAL | Figures period-dressed, no modern register, frame edges clean (hazy hills left, wall right — #12 (e) PASS); the **lamp post** renders (flagged class) and the **watermark** sits in the bottom-right corner band — both are NAMED REMAINDER below, not new intrusion | **HOLDS** (with the two carried flags) |

## Named remainder carried into shipping — the honest close

Carried from verdict #12 "Remaining fails", each re-confirmed present on the cell this review, each
with a disposition. **None silently dropped.**

| # | Remainder | Evidence (this cell) | Disposition |
| --- | --- | --- | --- |
| 1 | **Ford-crossing legibility** — no carts mid-stream, no gravel-ford/wheel-hub shallows; road runs along the bank | #12 (d) FAIL, 0-for-the-loop; full-frame view this review confirms | **CARRY to a future cycle** — the ford assert is the loop's oldest unmet composition goal; needs its own lever (control-map or composition change), owner-approved |
| 2 | **Watermark** — corner-band cursive, bottom-right; plus two minor doorhead glyph marks | #12 (h); faint cursive visible in the downscaled view this review | **CARRY** — chronic pipeline-artifact class; a post-process strip or sampler-side fix, not a brief lever |
| 3 | **Lamp-post** — flagged era-ambiguous prop in the queue; head form unresolvable at 4× | #12 (g); pole visible in the queue this review | **CARRY** — `era-ambiguous-props` flag-only check stands; flag, not a veto class |
| 4 | **Mill weak-presence** — static discarded-wheel echo, no housing mass, no race; gate-tower height competitor + oak-vs-stone register residual fold in here | #12 (c) FAIL (13th consecutive at the time) + (b) residuals; view this review confirms the wheel echo only | **PARTIALLY COVERED, rest CARRIED** — wheel-over-race and joinery are covered by the amendment/demotion (owner decision 4); the *weak presence itself* (no asserted mass in frame) carries to a future cycle as best-effort |

## Cell verdict — the shipping designation

**VERDICT #18: ACCEPT-AS-SHIP-CELL.** Items (a)–(f) all hold against the fully amended bar: the
materials register and the mill housing register are canon as amended (same-commit amendments,
commits `356d1a2` / `fdb261a` — no silent contradiction, no veto), wheel-over-race is demoted and
is not judged as a bar, the cell is the loop's fachwerk-clean reference and carries no crenellation,
and the era read holds with the two flagged props named and carried. The designation ships with the
four-item named remainder above — that list is part of the verdict, not an appendix. **Not a bare
PASS; the remainder is the honest close.**

## Rails for Phase 5 bookkeeping

- **Storybook note (the cell-of-record row), one line:** "SHIPPED cell of record (verdict #18,
  2026-09-01): subject-probe seed 12345 s0.45, briefHash c0ef116c7e149adf — judged ACCEPT-AS-SHIP-CELL
  under the AMENDED canon (materials option b: slate/brick as barge-ballast trade; mill housing
  register: mass-and-wheel asserted, joinery released, wheel-over-race best-effort). Named remainder
  carried, none dropped: ford-crossing legibility, corner watermark (+ doorhead glyphs), lamp-post
  flag, mill weak-presence. This cell is the fachwerk-clean reference."
- **Ledger sha gap:** future render rows should carry the output PNG's sha256 (rail-3 class gap,
  found at #18; intactness this time rested on the review record).
- **Remainder ledger:** the four carried items are future-cycle candidates, each requiring owner
  approval before a cell is spent (standing rule; criteria :66-74 `check` field).
- **G5 quest contradiction** ("Meet the road at the gate" for wall-less Millcross,
  `content/story/quests.json:208`) remains open — carried untouched, as every verdict has.

## What this review could not verify

- **briefHash** was not recomputed locally (generator out of review scope); verified by ledger
  internal consistency, unchanged since #12.
- **Lamp-post head form** — unresolvable at 4× per #12; the flag stands either way.
- **Downscale caveat** — this review's fresh view was the token-budget downscale (`sips -Z 1024`);
  fine-detail findings (doorhead glyphs, pinnacle form) rest on #12's crop work on the same
  byte-identical PNG. Byte-identity is what makes that carry legitimate.
