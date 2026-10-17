# Review · A1-ART-02 Millcross — materials probe (positive-only reword, one cell, seed 12345 @ s0.45, briefHash a03e1e72adf937a5) — verdict

**Date:** 2026-08-31 (render 2026-08-31T00:08:58.899Z per run ledger `tools/art-forge/runs/A1-ART-02.json`, final row) ·
**Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`) ·
**Verdict #11 in the loop; #3 on the SEGMENT path** — the MATERIALS PROBE this reviewer prescribed
(`reviews/2026-08-30-millcross-segment-confirmation-verdict.md`, change-set item 2) and the owner approved as
one cell, to answer one question: **does a positive-only rewording of the materials sentence move the
fachwerk/slate/brick drift on the confirmed cell?**

**Goal of this review, restated:** open and judge the probe PNG against the byte-identical confirmed cell it
was measured on (same seed/strength/control; prompt rewording the only variable) plus the segment control
map, run the machine gates, answer the materials question per building, rule ACCEPT / ACCEPT-WITH-REFINEMENT
/ REJECT on the cell, and write this one sheet — nothing else edited, no generator run, no commit.

**Reviewed (each opened and read at full frame; detail findings confirmed on 2.5–3.5× ImageMagick crops,
read-only, crops written to session temp only — 15 crops):**

| File | Role |
| --- | --- |
| `tools/art-forge/out/env/A1-ART-02-segment-materials-probe-seed12345-s0.45.png` | **the probe** — reworded prompt |
| `tools/art-forge/out/env/A1-ART-02-segment-seed12345-s0.45.png` | comparison substrate — the confirmed cell (byte-identity to the hash recorded at confirmation time: **intact**, sha256 `a5991a97…d0dba6` re-measured this review) |
| `tools/art-forge/out/control/segment/A1-ART-02-segment.png` | control map (adherence judging) |

sha256 recorded this review: probe `6365f072…05a094b5` · confirmed `a5991a97…33d0dba6` (matches the
confirmation verdict's record — **the probe did not overwrite the confirmed cell**; rail 7 generalisation
held, see render contract) · control `27125660…18255f49`.

**Render contract:** ledger row `2026-08-31T00:08:58.899Z` — seed **12345**, `control:"segment"`, strength
**0.45**, rolltag `materials-probe`, briefHash **a03e1e72adf937a5** (new — the confirmed cell's
`b7658d8607bbbe70` is untouched on its own rows). The brief diff (`git diff` on
`tools/art-forge/briefs/A1-ART-02.json`, uncommitted) is exactly the prescribed change and nothing else:
the materials sentence reworded positive-only ("…walls of smooth whitewashed plaster on stone footings,
timber frames visible only at corners and doorheads, under steep wood-shingle roofs" — roofs named without
the slate-co-occurring colour adjectives; palette still asserted in the palette sentence), the `_note`
extended with the probe record, **`masses`, horizon, focal, width, height, `mustAssert` all untouched**.
Sampler: the probe ledger row carries **no** `model`/`steps`/`cfg`/`guidance` fields — **rail 3, seventh
roll standing.** Model=dev rests on the handoff plus code path (`forge.config.json` samplerDev 20 steps /
cfg 1 / guidance 5.0; non-depth output ids never carry the `-dev` infix, `env.mjs:441`, so filenames cannot
discriminate). **Rail 7 (never overwrite a reviewed cell) is verified generalised to the plain path in the
uncommitted `env.mjs` diff** (`controlOutputId` accepts `rolltag` on every control branch) and the
`env-graph.test.mjs` additions are green this review.
**Control map verified by pixel sample this review (1280×832) — 12/12 exact at authored values:** sky
`000000`; far-bank `7D8288`; river `9AA4A8`; row-left `8F8A82`; row-right `948E84`; mill column `5C4A34`;
wheel disc `3A2C1C` at [790,512]; wall flank `C6C2B6` at [1150,727]; both gate towers `6B5A40`; queue
`241F18` exact; led animals `1C1712` exact. The map was regenerated during the probe blockin (mtime 07:07
local, new briefHash) and is **fair** — the masses are unchanged, consistent with the prompt-only diff.
**Canon base (re-read):** `docs/worldbuilding/A1-geography-cluster1.md` §6 Millcross (`:355-369` —
timber-and-earth wall, west gate, timber-framed houses on stone footings, **mill-wheel housing taller than
the wall and nothing else competes**, material local: mill timber, river stone, split shingle) and §9
brief (`:511`); `content/story/style.md` `:17` (two registers), `:129` (Millcross palette row);
`content/world/town-criteria.json` — `walled-core` `:73-77`, `one-cart-crossing` `:122-126`,
`first-sight-cart-queue` `:129`, REVIEWER v1.2 material ban `:156` (pantile / half-timbered / red tile
banned **in prompt text** — the present failure renders without any banned token, which is the point),
`countBand` `:159-169`, `materials-by-economy` (Millcross local set: mill timber, split shingle, river
stone, valley clay/lime plaster — **fired brick is Embervale's material**), `structure-not-decoration`
`:183-189`, `map-derived-concept` `:207-213`, `referencePolicy` `:252-273`; contamination law
`forge.config.json` `styleGuard` (`:104`, era "pre-industrial and pre-electric", forbidden tokens,
medium clause; `:140` `_note` — the measured history that negative *vocabulary in the positive prompt*
CAUSES its subjects); segment pin + measured note `forge.config.json:89-95`.
**Machine gates run this review:** `node scripts/check_content.mjs` → **exit 0, 0 failures, 34 warnings**
(same warning count as every prior review); `node tools/art-forge/generate/prompt-lint.mjs` → **exit 0**
(the reworded prompt is negation-free and token-clean); `node --test
tools/asset-storybook/tests/env-index.test.mjs` → **6/7 — NEW FAILURE: the probe render has no env-index
row** ("a render cannot hide"; the index update is owed, see rail changes — a bookkeeping gap, not a render
defect); `node --test tools/art-forge/tests/env-graph.test.mjs` → **all green** (rail-7 coverage included).

**Registers:** CANON = A1 §6/§9, style.md, ratified town-criteria entries as cited. INVENTED = brief masses,
per-mass values, venue list (traceability-tagged in the brief `_note`s). PROPOSED = this sheet's cell
verdict, the materials-lever ruling, rails, and open questions.

---

## Probe vs confirmed cell — the moving criteria

Same seed, same strength, same control map, same register lane; the prompt reword is the only variable, so
any delta between the columns is attributable to the rewording — and any sameness is attributable to the
sampler prior.

| Criterion | Probe (reworded) | Confirmed cell (pre-reword) | Δ attributable to the reword |
| --- | --- | --- | --- |
| **(f1) decorative fachwerk killed?** | **NO.** Gate tower: full fachwerk grid on its jettied upper storey (3×). Right-row terrace: full decorative bracing, jettied storey — **near-identical to the confirmed cell at 2.5×**. Left-row base band: full storybook curved-brace grid (3×) **plus a new hallucinated tangle-of-beams sculpture** on the house front. | Same three surfaces carry the same fachwerk classes. | **≈ ZERO on the failing surfaces.** The middle houses' large blank plaster planes read as the requested register in **both** cells, so the reword cannot claim them. |
| **(f2) slate → wood shingle?** | **NO.** Roof sample at 3×: uniform coursing of small dark blue-grey rectangles — slate, no shingle butt-ends; moss patches over. Palette sample roof `[300,300]` = `5F5A52`. | Same slate read (`6A6660`). | **ZERO.** Removing the colour adjectives did not move the roof material. |
| **(f3) red brick chimneys gone?** | **NO — brick GAINED surface.** Multiple saturated red fired-brick stacks (right row, row ends); the mill-slot mass re-skinned from a cream cupola hall into a **red-brick belfry tower with slate spire** — the tallest mass in frame. | Brick stacks present; mill slot = cream cupola hall. | **NEGATIVE.** One brick stack carries a glazed window at 3×; the new belfry is a competing tall mass (below). |
| **(c) mill wheel + housing + race** | **FAIL** — no wheel (12th consecutive roll), no column, no race; the slot renders a plain rough-cast gable behind the wall; the brick belfry tower (left of slot) is the competing tall mass A1 §6 forbids ("nothing else competes"). | FAIL (cupola hall in the column position). | **NONE — both fail; the probe's failure is a different building in the same slot.** |
| **(a) wall renders as a wall** | **YES** — continuous stone-coped run, town enclosed behind it, road outside, waist-to-eaves height; reproduces the confirmed cell. | YES. | NONE (stable outcome of seed+control, as measured since the ladder). |
| **(b) gate tower at the road gap** | **YES-position / FAIL-register** — timber gate tower at the gap, road passes through the wall gap at its flank, queue recedes through; but jettied fachwerk register, not "plain oak". The dark glyph signboard on the tower is **gone**. | Tower at the gap **with a glyph signboard**. | **SMALL POSITIVE** (signboard cleared). |
| **(d) queue / ford / no rival crossing** | Queue **PASS** (long, covered loads, led oxen, recedes through the gate). Ford **FAIL** — the road runs parallel to the river; no carts mid-stream, no wheel-hub shallows (2× crop of the queue end). No rival crossing. | Same split: queue PASS, ford FAIL. | **NONE.** The ford assert ("carts mid-stream") remains 0-for-the-loop. |
| **(e) town edge** | **PASS** — contained behind the wall, hazy open hills left; the right row runs to the frame edge behind the wall (soft edge, not a sprawl). | PASS. | NONE. |
| **(g) contamination / era** | **PARTIAL** — the lamp post with closed globe head renders again (flagged class); **the grey-blue box-on-post by the gate is GONE**; small human figures are period-dressed (red-jacket rider, walkers); no modern register anywhere. | Lamp post **and** box-on-post both present; signboard glyphs. | **POSITIVE — one of two flagged props cleared.** |
| **(h) hallucinated text** | **FAIL (chronic class)** — white cursive watermark bottom-right persists (3.5×, same class as confirmed); **the yellow garbled notice panel in the window is GONE**; cart-cover marks resolve to single glyphs, not text rows; the new beam-tangle is sculptural, not text. | Both instances present (notice panel + watermark). | **POSITIVE — one of two instances cleared; corner-band text remains.** |
| **(i) style register (gouache clause)** | **PARTIAL (the lane's known shape)** — matte, grained, poster-flat, gouache-adjacent; no visible brushwork. | Same. | NONE. |
| **(j) palette** | **PASS** — pixel samples vs confirmed within a few RGB steps everywhere sampled (sky `C7C4B8`, ground `897E54`, water `6C675E`, plaster `AB9D84`, covers `D9D3C2`): ash-grey / olive / muted cream, on style.md `:129`. | PASS. | NONE. |

## Cell verdict

**REJECT.** Ruled plainly, because this is the cell the owner was told is the shortest path to
sign-off-able: the probe's single purpose was to move the materials drift, and **the materials did not
move** — fachwerk persists on all three surfaces where it was failing, roofs are still slate, and brick
actually gained a prominent new surface. The chronic fails persist on top of it (no wheel/race, no ford in
frame, corner-band text). Two props cleared (box-on-post, notice panel) and the composition skeleton is
fully intact — this cell is the **best-looking REJECT of the loop** and it does not regress against the
confirmed cell — but improving criteria the probe did not target cannot upgrade a cell whose target
criterion is unchanged. **The measured answer to the probe's question is NO: a positive-only rewording of
the materials sentence, at this seed/strength/cell, is inert against the fachwerk/slate/brick attractor.**
That is a valuable measurement: it closes the brief-wording lever class and re-points the materials work at
the sampler prior (open question 1).

## The materials-probe answer, per building

- **West gate tower:** reword DID NOT LAND — full decorative fachwerk on the jettied upper storey; also
  fails "plain oak" register. (One small win: the glyph signboard is gone.)
- **Left-row terrace:** DID NOT LAND — storybook curved-brace grid across the base band, identical class to
  the confirmed cell, plus a new hallucinated beam-tangle sculpture.
- **Central hall group (mill slot):** renders large blank plaster planes with frames at corners — the
  requested register — **but the confirmed cell renders the same**, so this is the lane's default, not the
  reword's effect.
- **Right-row terrace:** DID NOT LAND — fachwerk + red brick + slate, near pixel-identical to the
  confirmed cell.
- **Roofs:** slate held everywhere sampled; "wood-shingle roofs" without colour adjectives did not take.
- **Chimneys/towers:** red fired brick multiplied — including the new brick belfry-with-spire tower, which
  is simultaneously a materials failure, a silhouette failure (A1 §6 "nothing else competes"), and a
  canon-shape question (no church/belfry is ratified in Millcross's venue list — open question 5).

## Remaining fails between this cell and sign-off

1. Materials: fachwerk (gate tower, left row, right row), slate roofs, red brick (stacks + belfry).
2. Mill: no wheel, no column, no race; competing tall belfry mass in/near the slot.
3. Ford: no carts mid-stream, no gravel-ford crossing in frame (queue passes the gate instead).
4. Text: corner-band cursive watermark.
5. Contamination flag: lamp post with closed globe head.

## Rail changes (concrete data diffs)

- **Rail 3 — carried, SEVENTH roll.** The probe's ledger row still carries neither `model` nor
  `steps`/`cfg`/`guidance`. Diff proposal unchanged: write those four fields at render time in `env.mjs`.
- **Rail 7 generalisation — VERIFIED, recommend landing.** The uncommitted `env.mjs` diff puts `rolltag` on
  every `controlOutputId` branch (not just anchors) with a doc comment; `env-graph.test.mjs` covers it and
  is green. Recommendation: land it in the same commit as the reworded brief + this sheet's env-index row.
- **NEW — env-index rows owed (machine gate currently red, 6/7):** add the probe row
  (`A1-ART-02-segment-materials-probe-seed12345-s0.45`, seed 12345, s0.45, segment, briefHash
  `a03e1e72adf937a5`, review = this sheet) and update the confirmed-cell 12345 row, which still points at
  the ladder verdict with the stale "Awaiting ladder verdict" note (`env-index.json:269-281` — carried from
  the confirmation verdict).
- **`era-ambiguous-props` — fifth instance family.** The lamp post reproduces alone on this cell; the
  box-on-post cleared. Keep the proposed check flag-only (wording unchanged from the confirmation verdict).
- **Materials-lever ledger (proposed measured-facts entry**, `content/world/town-criteria.json` or the
  brief `_note`): "Positive-only prompt rewording at the confirmed cell (probe, briefHash
  a03e1e72adf937a5) is MEASURED INERT for fachwerk/slate/brick; negative conditioning is inert at cfg 1
  (`env.mjs:284-286`); negative vocabulary in the positive prompt CAUSES its subjects
  (`forge.config.json:140`). Remaining materials levers: subject-position rewording, img2img refine on the
  confirmed cell, seed change — each requires owner approval before spending a cell."

## Open questions for the owner

1. **Next materials lever** (the probe's whole point). Options with my recommendation:
   **(a) Subject-position probe — RECOMMENDED first:** the reword kept "Timber-framed houses" as the
   materials sentence's subject; the first material noun phrase is the highest-attention token in the
   clause and is exactly the fachwerk attractor. One more single cell with the plaster plane promoted to
   subject ("Whitewashed plaster-and-stone houses, their timber frames visible only at corners and
   doorheads, stand inside…") — positive-only, same cell, new rolltag. Cheap, measured precedent for
   attention-position effects is the era/medium clause work; prior of success: moderate.
   **(b) img2img material refine** on the confirmed cell (anchor-path precedent exists for geometry; a
   materials-only pass is unmeasured). **(c) Seed change** — measured prior LOW (all three 0.45 lanes
   carried fachwerk). Owner's call; recommend (a), then (b) if (a) is also inert.
2. **Keep or revert the reworded brief text?** Recommendation: **KEEP** — it is canon-truth wording (A1 §6
   register), prompt-lint-clean, harmless to the sampler, and the right sentence for any future lever that
   does listen; reverting buys nothing.
3. **Land the env-index rows** with the next change-set commit (the gate is red until then).
4. **G5 quest contradiction** (`quests.json` "Meet the road at the gate" for a wall-less Millcross) remains
   open — carried untouched, as every verdict has; no roll settles canon.
5. **The belfry/church tower:** no church is ratified in Millcross's venue list, and A1 §6 forbids any
   competing tall mass. Recommendation: add "church spires / belfry towers" to `referencePolicy`
   `.forbiddenCharacteristics` (criteria-file change = owner approval), so the class is named rather than
   re-litigated per roll.

## What this review could not verify

- **briefHash `a03e1e72adf937a5` was not recomputed locally** (running the generator is outside review
  scope); verified by ledger internal consistency (the row's hash matches the working-tree brief's diff
  state) plus prompt-lint exit 0 on the exact prompt bytes.
- **Probe render model/steps/cfg/guidance** — absent from the ledger (rail 3, seventh roll); model=dev
  rests on the handoff plus the code path; filenames cannot discriminate (`env.mjs:441`).
- **Byte-identity of the regenerated control map to the pre-probe map** — no pre-probe hash existed; the
  fairness evidence is 12/12 exact pixel samples at authored values plus the git diff showing masses
  untouched.
- **The composed positive string actually sent** is not logged; the register-clean claim rests on code
  reading (`env.mjs` composition + `mustCompose` tests green) and prompt-lint exit 0.
- **Stability of the two cleared props** (box-on-post, notice panel) — one cell, by design; whether they
  are reword-attributable or sampler noise is unmeasured without a repeat.
- **Exact structure counts against mustAssert "a dozen and a half structures"** — occlusion defeats
  counting (carried from every prior review).
