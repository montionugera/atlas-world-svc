# Review · A1-ART-02 Millcross — subject-position probe (plaster plane promoted to sentence subject, one cell, seed 12345 @ s0.45, briefHash c0ef116c7e149adf) — verdict

**Date:** 2026-09-01 (render 2026-09-01T12:53:25.827Z per run ledger `tools/art-forge/runs/A1-ART-02.json`, final row) ·
**Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`) ·
**Verdict #12 in the loop; #4 on the SEGMENT path** — the SUBJECT-POSITION PROBE, opened exactly as verdict #11
(`reviews/2026-08-30-millcross-materials-probe-verdict.md`) prescribed in its open question 1 (a) and the owner
approved as one cell, to answer one question: **does promoting the plaster plane to the materials sentence's
subject move the fachwerk/slate/brick drift that the verdict-#11 rewording measured INERT?**

**Goal of this review, restated:** open and judge the probe cell against the byte-identical confirmed cell it
was measured on (same seed/strength/control; prompt rewording the only variable), run the machine gates, answer
the subject-position question per building, rule ACCEPT / ACCEPT-WITH-REFINEMENT / REJECT on the cell, and write
this one sheet — nothing else edited, no generator run, no commit.

**Reviewed (each opened and read at full frame; detail findings confirmed on 2.5–4× ImageMagick crops,
read-only, crops written to session temp only — 16 crops):**

| File | Role |
| --- | --- |
| `tools/art-forge/out/env/A1-ART-02-segment-subject-probe-seed12345-s0.45.png` | **the probe** — reworded prompt (plaster as subject) |
| `tools/art-forge/out/env/A1-ART-02-segment-seed12345-s0.45.png` | comparison substrate — the confirmed cell (byte-identity to the hash recorded at confirmation time: **intact**, sha256 `a5991a97…33d0dba6` re-measured this review — rail 7 held again) |
| `tools/art-forge/out/control/segment/A1-ART-02-segment.png` | control map (fairness judging) |

sha256 recorded this review: probe `9e10d751…4c2cdb` · confirmed `a5991a97…33d0dba6` (exact match to the
confirmation-time record — **the probe did not overwrite the confirmed cell**; the rolltag-isolated filename
`…segment-subject-probe…` kept the cells apart, consistent with rail 7's generalisation verified at #11).

**Render contract:** ledger row `2026-09-01T12:53:25.827Z` — seed **12345**, `control:"segment"`, strength
**0.45**, briefHash **c0ef116c7e149adf** (new — the confirmed cell's rows keep `b7658d8607bbbe70`, the
materials probe's `a03e1e72adf937a5` is untouched on its own row), out
`out/env/A1-ART-02-segment-subject-probe-seed12345-s0.45.png`. The brief diff (`git diff` on
`tools/art-forge/briefs/A1-ART-02.json`, uncommitted) is exactly the prescribed change and nothing else: the
materials sentence's subject replaced —
- **previous:** "Timber-framed houses stand inside a timber-and-earth town wall, walls of smooth whitewashed
  plaster on stone footings, timber frames visible only at corners and doorheads, under steep wood-shingle
  roofs;"
- **as-rolled:** "Whitewashed plaster-and-stone houses, their timber frames visible only at corners and
  doorheads, stand inside a timber-and-earth town wall, under steep wood-shingle roofs;"

plus the `_note` extension recording the probe. The as-rolled wording matches verdict #11's OQ1(a)
prescription **verbatim**. What the reword dropped: the texture adjective "smooth"; "on stone footings" as a
separate phrase (stone now carried by the "plaster-and-stone" compound); and "Timber-framed houses" as subject
— the first material noun phrase, which verdict #11 identified as the highest-attention slot and exactly the
fachwerk attractor. `masses`, horizon, focal, width, height, `mustAssert` untouched (diff shows only the two
lines). Sampler: the ledger row carries **no** `model`/`steps`/`cfg`/`guidance` fields — **rail 3, EIGHTH roll
standing.** Model=dev rests on the session handoff plus the code path (`forge.config.json` samplerDev; non-depth
output ids never carry the `-dev` infix, `env.mjs:441`, so filenames cannot discriminate).

**Control map verified by pixel sample this review (1280×832) — all authored values exact:** histogram contains
every authored value (sky `000000` 571k px; queue `241F18` 97k px; row-right `948E84`; row-left `8F8A82`; wall
flank `C6C2B6` 25k px **exact at [1150,727]**; river `9AA4A8` 15k px; wheel disc `3A2C1C` 15k px **exact at
[790,512]**; led animals `1C1712` 14k px; mill column `5C4A34`; gate towers `6B5A40` **both sampled exact**;
far-bank `7D8288` 10k px, located as a full-width band y 499–514 — at the horizon, per the authored geometry).
Direct samples MATCH at 8/8 attempted points; my three initial misses were guessed coordinates inside adjacent
masses, not control errors. The map was regenerated during this roll's blockin (new briefHash) and is **fair** —
masses unchanged, consistent with the prompt-only diff.

**Canon base (re-read the sections cited):** `docs/worldbuilding/A1-geography-cluster1.md` §6 Millcross
(`:355-369` — timber-and-earth wall, west gate, timber-framed houses on stone footings, **mill-wheel housing
taller than the wall and nothing else competes**, material local: mill timber, river stone, split shingle) and
§9 brief (`:511`); `content/story/style.md` `:17` (two registers) and `:129` (Millcross palette row: ash-grey,
rope-brown, tallow-yellow); `content/world/town-criteria.json` — REVIEWER forbidden phrases `:150-158` (pantile
/ half-timbered / red tile banned **in prompt text** — renders are the review surface, which is the point),
`countBand` `:159-169`, `materials-by-economy` (**fired brick is Embervale's material**; Millcross local set:
mill timber, split shingle, river stone, valley clay/lime plaster), `structure-not-decoration` `:183-189`,
`map-derived-concept` `:207-213`, `referencePolicy` `:252-273` (**no belfry/church characteristic yet — verdict
#11 OQ5 still unlanded**); contamination law `forge.config.json` `styleGuard` (era/medium mustCompose,
forbidden-token data, `_note` `:140` — negative vocabulary in the positive prompt CAUSES its subjects);
segment pin + measured note `forge.config.json:89-95` (0.45 OPERATING, window 0.30–0.45).

**Machine gates run this review (exit codes):** `node scripts/check_content.mjs` → **exit 0, 0 failures, 34
warnings** (same warning count as every prior review); `node tools/art-forge/generate/prompt-lint.mjs` →
**exit 0** (the reworded prompt is negation-free and token-clean); `node --test
tools/asset-storybook/tests/env-index.test.mjs` → **7/7 PASS** — the probe row was indexed **pre-roll** with
this sheet's filename pre-referenced and the note recording verdict-pending (the #11 bookkeeping gap is fixed;
the confirmed-cell row note now records the ladder overwrite history and is wired); `node --test
tools/art-forge/tests/env-graph.test.mjs` → **39/39 PASS, all green** (rail-7 coverage included).

**Registers:** CANON = A1 §6/§9, style.md, ratified town-criteria entries as cited. INVENTED = brief masses,
per-mass values, venue list (traceability-tagged in the brief `_note`s). PROPOSED = this sheet's cell verdict,
the subject-position ruling, rails, and open questions.

---

## Probe vs confirmed cell — the moving criteria

Same seed, same strength, same control map (verified fair above), same register lane; the prompt reword is the
only variable, so any delta between the columns is attributable to the rewording — and any sameness is
attributable to the sampler prior.

| Criterion | Probe (subject reword) | Confirmed cell (pre-reword) | Δ attributable to the reword |
| --- | --- | --- | --- |
| **(f1) decorative fachwerk killed?** | **YES — on all three surfaces.** Left row: plain white plaster gables, zero timber framing, zero storybook bracing (3×). Right row: large blank plaster planes, no bracing (3×). Gate tower: plain coursed stone, no jettied grid (3×). Plaster sample `C3B7A1` vs confirmed `A6977D` — the whitewashed plane is measurably brighter/more dominant. | Full storybook curved-brace grid on the left row, decorative bracing across the right row, full fachwerk grid on the gate tower's jettied storeys. | **THE REWORD LANDED.** This is the loop's first wording lever with a measured positive effect on its target. |
| **(f2) slate → wood shingle?** | **NO.** Roof sample at 4×: uniform coursing of small dark blue-grey rectangles — slate, no shingle butt-ends (`67655F`). | Same slate read (`65625B`). | **ZERO** — same result as the #11 probe: roof material does not listen to wording. |
| **(f3) red brick chimneys gone?** | **NO.** Saturated red fired-brick stacks persist on both rows (4×); brick also renders as plinth/skirt bands at the right-row house foots (a new surface location). | Brick stacks present. | **NONE on stacks; small NEGATIVE on plinths** (brick gained a surface class). Brick is not in the prompt at all — pure sampler prior, consistent with Embervale's material bleeding across towns. |
| **(c) mill wheel + housing + race** | **FAIL (13th consecutive roll).** No housing, no column, no race; the slot area behind the wall renders blank. A **new static wheel object** leans against the garden wall behind the town wall at left (4×) — a discarded-wheel read with a tangle of debris, not a turning wheel in an open race, not taller than the wall, no housing. | FAIL (cupola/belfry hall mass in the column position). | **NONE as success.** The wheel echo is plausibly attention-shift noise from the changed conditioning string; it is an object, not the canon mill. |
| **Competing tall masses** | The confirmed cell's cream cupola/belfry hall — verdict #11's worst brick surface and silhouette competitor — **is GONE**; the frame reads low and horizontal except the gate tower (below). | Cupola hall left + decorated gate tower right. | **POSITIVE (silhouette)** — closer to A1 §6 "the silhouette stays horizontal and low… nothing else competes", though not yet correct (the mill that should own the height is absent). |
| **(a) wall renders as a wall** | **YES** — continuous stone-coped run, town enclosed behind it, road outside (3×); reproduces the confirmed cell. | YES. | NONE (stable outcome of seed+control, as measured since the ladder). |
| **(b) gate tower at the road gap** | **YES-position / register HALF-landed** — tower at the gap, road and queue recede through; register now plain stone (decor cleared) but **"plain oak" still not delivered** (stone, not oak), small corner pinnacles on the roof (mild brochure echo, no crenellation), and the tower remains a 3+-storey competing mass. A small painted emblem board renders on the tower face. | Tower at the gap in full decorated fachwerk with glyph board and hanging props. | **SMALL POSITIVE (register decor cleared) with two named residuals** (oak register; competing height). |
| **(d) queue / ford / no rival crossing** | Queue **PASS** (long, loaded, led animals, recedes through the gate). Ford **FAIL** — no carts mid-stream, no wheel-hub shallows; the road runs along the bank (full frame + 2.5×; crop region hit near-shore only — see could-not-verify). No rival crossing. | Same split: queue PASS, ford FAIL. | **NONE.** The ford assert remains 0-for-the-loop. |
| **(e) town edge** | **PASS** — contained behind the wall, hazy open hills left; right row soft-edges at the frame behind the wall. | PASS. | NONE. |
| **(g) contamination / era** | **PARTIAL** — the lamp post with a small head renders again at the queue (flagged class; head form unresolvable at 4×); figures period-dressed; no modern register. | Lamp post present. | NONE (the #11 positive — box-on-post cleared — is stable in the probe). |
| **(h) hallucinated text** | **FAIL (chronic class)** — white cursive watermark bottom-right persists (4×, same class as confirmed). The yellow garbled notice panel stays **gone** (stable from #11). New minor instance: tiny garbled glyph marks on two doorheads (3×). | Watermark + notice panel both present. | **STABLE POSITIVE** (notice panel) + one new minor text instance (doorheads). |
| **(i) style register (gouache clause)** | **PARTIAL (the lane's known shape)** — matte, grained, poster-flat, gouache-adjacent; no visible brushwork. | Same. | NONE. |
| **(j) palette** | **PASS** — sky `D3CFC3` vs `D4D1C6`, water `A1A399` vs `9FA29A`, roof `67655F` vs `65625B`, ground `8E8259` vs `81774D` — all within a few steps of the confirmed cell and inside style.md `:129` (ash-grey / rope-brown / tallow-yellow). The plaster plane's ~28-step brightening is the one deliberate content delta and it sits in the whitewash/cream register. | PASS. | The brightening is the reword's, and it is on-palette. |

## Cell verdict

**ACCEPT-WITH-REFINEMENT.** Unlike verdict #11's REJECT, this probe's single purpose — move the materials drift
with the one lever #11 recommended — **succeeded on its primary target**: decorative fachwerk is cleared from
all three surfaces where it was failing, the plaster plane is measurably the subject of the frame, and the
competing belfry/cupola mass is gone. The cell does not regress against the confirmed cell on any criterion,
the composition skeleton is fully intact, and the palette and wall/gate/queue/edge structure all hold. It is
**not sign-off-able**: slate roofs, red brick (stacks + new plinths), the absent mill (13 rolls), the
ford-less crossing, the corner watermark, the lamp post, and the gate tower's oak-register/height residuals all
stand. The refinement is named, not gestural: keep this wording (see rails), and aim the next lever at
slate/brick — which this measurement now shows are **not** reachable by brief wording.

## The subject-position answer, per building class

- **House rows (left + right): MOVED.** Fachwerk cleared on every surface; plain plaster planes with frames
  confined to doorheads as written; plaster value brighter (`C3B7A1` vs `A6977D`). This is the first measured
  confirmation in the loop that the materials sentence's subject position controls the fachwerk attractor.
- **Gate tower: PARTIALLY MOVED.** Decorative framing cleared (register now plain), but "plain oak" is not
  delivered (stone instead) and the tower remains a competing tall mass with small roof pinnacles.
- **Roofs: NOT MOVED.** Slate held everywhere sampled; the roof clause does not respond to position or wording.
- **Chimneys: NOT MOVED.** Fired brick persists (and gained plinth bands); brick was never in the prompt — it
  is sampler prior (`materials-by-economy`: brick is Embervale's material).
- **Silhouette: MOVED (positive).** The cupola/belfry competitor is gone; the frame is horizontal and low
  except the gate tower — closer to A1 §6, though the mill that should own the height is still absent.

## Remaining fails between this cell and sign-off

1. Materials: slate roofs; red brick stacks + plinths. (Fachwerk: cleared this cell.)
2. Mill: no wheel in an open race, no housing, no column; a static discarded-wheel echo behind the wall.
3. Ford: no carts mid-stream, no gravel-ford crossing in frame.
4. Text: corner-band cursive watermark; two minor doorhead glyph marks.
5. Contamination flag: lamp post (head form unresolvable at 4×).
6. Gate tower register: plain stone rendered, "plain oak" asserted; tower competes in height; small roof pinnacles.

## Rail changes (concrete data diffs)

- **Rail 3 — carried, EIGHTH roll.** The probe's ledger row still carries neither `model` nor
  `steps`/`cfg`/`guidance`. Diff proposal unchanged: write those four fields at render time in `env.mjs`.
- **Materials-lever ledger — UPDATE THE PROPOSED ENTRY, and land it.** The measured-facts entry proposed at #11
  is still absent from `content/world/town-criteria.json`; only the brief `_note` records the rolls. Proposed
  wording to land with the next change-set commit: "Positive-only rewording at the confirmed cell (materials
  probe, briefHash a03e1e72adf937a5) is MEASURED INERT for fachwerk/slate/brick; subject-position rewording
  (subject probe, briefHash c0ef116c7e149adf) MOVED fachwerk — cleared on all three surfaces, plaster plane
  brightened ~28 RGB steps — and is INERT for slate/brick; brick is sampler prior (not in prompt). Remaining
  materials levers: img2img refine on the subject-probe cell, seed change — each requires owner approval before
  spending a cell."
- **`referencePolicy` belfry amendment — still unlanded (carried, verdict #11 OQ5).** This cell cleared its
  belfry instance but the class remains unguarded; the gate tower gained small roof pinnacles (adjacent class).
  Diff proposal unchanged: add "church spires / belfry towers / cupola halls" (and consider "roof pinnacles")
  to `referencePolicy.value.forbiddenCharacteristics`.
- **Keep the reworded brief text — reiterate (verdict #11 OQ2), now with evidence.** The subject-position
  wording is canon-truth register (A1 §6), prompt-lint-clean, and the loop's only wording lever measured to
  land. Recommendation: keep; do not revert toward the "Timber-framed houses" subject.
- **`era-ambiguous-props` — unchanged.** Lamp post reproduces; keep the proposed check flag-only.

## Open questions for the owner

1. **Next materials lever (slate + brick).** This measurement closes the wording lever for both. Options:
   **(a) img2img material refine on THIS cell — RECOMMENDED:** the cell now has a fachwerk-free, palette-clean
   base; an anchor-path precedent exists for geometry, and a materials-only pass is the unmeasured half. Spend
   it on roofs + chimneys/plinths together. **(b) Seed change** — measured prior LOW (all 0.45 lanes carried
   slate/brick). **(c) Accept slate/brick as register drift and ship with a note** — not recommended: brick is
   a per-town material law (`materials-by-economy`), and letting Embervale's brick stand in Millcross sets a
   precedent the other five towns will inherit.
2. **The mill assert — 13 consecutive rolls.** The wheel echo this cell produced is an object, not the canon
   mill. Options: **(a) include the mill slot in the img2img refine scope (recommended — one pass, two fails);
   (b) control-map emphasis on the mill column/race masses (unmeasured at segment strength); (c) deliberate
   canon amendment** — owner's call, and only if (a)+(b) fail.
3. **Land the materials-lever ledger entry + `referencePolicy` amendment** with the next change-set commit
   (both are criteria-file changes = owner approval, both recommended).
4. **G5 quest contradiction** (`content/story/quests.json:208` "Meet the road at the gate" for wall-less
   Millcross) remains open — carried untouched, as every verdict has; no roll settles canon.
5. **Keep or revert the reworded brief text** — recommendation **KEEP** (see rails); if kept, the confirmed
   cell's briefHash lineage in the run ledger remains the record of what each cell was rendered from, so no
   re-render is implied.

## What this review could not verify

- **briefHash `c0ef116c7e149adf` was not recomputed locally** (running the generator is outside review scope);
  verified by ledger internal consistency (the row's hash matches the working-tree brief's diff state) plus
  prompt-lint exit 0 on the exact prompt bytes.
- **Probe render model/steps/cfg/guidance** — absent from the ledger (rail 3, eighth roll); model=dev rests on
  the handoff plus the code path; filenames cannot discriminate (`env.mjs:441`).
- **The composed positive string actually sent** is not logged; the register-clean claim rests on code reading
  (`env.mjs` composition + `mustCompose` tests green) and prompt-lint exit 0.
- **The lamp post's head form** — flagged prop present, but the head is unresolvable at 4×; the flag stands
  either way, the specific "closed globe" class is unconfirmed this cell.
- **Whether the wheel object, the belfry clearance, and the doorhead glyph marks are reword-attributable or
  sampler noise** — one cell by design; without a repeat, treat as unmeasured singletons.
- **The ford crop region** missed the mid-stream band (hit near-shore); the ford FAIL is judged from the full
  frames of both cells, which show no carts in the water and the road running along the bank.
- **Exact structure counts against mustAssert "a dozen and a half structures"** — occlusion defeats counting
  (carried from every prior review).
