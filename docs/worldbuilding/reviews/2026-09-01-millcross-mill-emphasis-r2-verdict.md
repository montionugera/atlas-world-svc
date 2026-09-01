# Review · A1-ART-02 Millcross — mill-emphasis-r2 cell (rolltag mill-emphasis-r2, seed 12345, control "segment" @ s0.45, briefHash 9c10d497b9ca3d0a) — verdict

**Date:** 2026-09-01 (render 2026-09-01T16:13:08.424Z per run ledger `tools/art-forge/runs/A1-ART-02.json`, final row) ·
**Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`) ·
**Verdict #16 in the loop; #1 on the re-prescribed race-channel geometry** — the cell opened exactly as
verdict #15-rail-b re-prescription (`reviews/2026-09-01-millcross-race-channel-represcription-verdict.md`)
prescribed after the loop's pre-roll block-in verification found rail (b) structurally undeliverable. One
question: **does the lifted race-channel plane + dark-timber housing prescription deliver the six-item
carried bar (race legible · wheel present and over the race · housing dark timber · era edge-check ·
fachwerk-watch · queue present) without a veto-class new fail?**

**Goal of this review, restated:** view the new cell (downscaled + three targeted crops only), verify the
prescribed brief state landed, cross-check the render contract, judge against the carried bar with the
three passes, rule PASS / ACCEPT-WITH-REFINEMENT / REJECT, and write this one sheet — nothing else edited,
no generator run, no commit.

**Reviewed:**

| File | Role |
| --- | --- |
| `tools/art-forge/out/env/A1-ART-02-segment-mill-emphasis-r2-seed12345-s0.45.png` | **THE CELL** — sha256 `4aec9bf93539fcc60035410b544b92a1addbd993e218925d2eb2578bd4731a5e`, 1280×832, viewed full-frame downscaled (sips -Z 1024) + three ImageMagick crops (mill region 1.5×, right edge 2× at x 1080-1280, right row 2×; crops in session temp only) |
| `tools/art-forge/briefs/A1-ART-02.json` | the re-prescribed brief — verified in data (below) |
| `tools/art-forge/runs/A1-ART-02.json` | render contract — final row cross-checked |

**Render contract:** ledger row `2026-09-01T16:13:08.424Z` — type render, seed **12345**, `control:"segment"`,
`strength:0.45`, `model:"schnell"`, `steps:8`, `cfg:1`, `denoise:1`, briefHash **`9c10d497b9ca3d0a`**,
out = the r2 cell — matches the prescription exactly (rolltag-isolated filename; the two blockin rows at
16:09 carry the same briefHash, i.e. the control map was rebuilt from the re-prescribed brief and the
segment path served it). This is the **segment** path as prescribed (both failing values are structurally
undeliverable on the depth path's per-plane buckets).

**Prescribed brief state verified landed (all items):**

1. `race-channel` plane **mg**, rect **[0.53, 0.63, 0.6, 0.9]**, value **#56616b** — present
   (`briefs/A1-ART-02.json:211-222`).
2. Array position: immediately after `gate-tower-west-s` (`:200`) and immediately before `mill-wheel`
   (`:224`) — exactly the prescribed last-mg-before-wheel slot.
3. `millwheel-housing` value **#53412b** — present (`:85`), the reviewer-prescribed lightening from #4a3a28.
4. Prompt contains **"One timber mill-wheel housing stands beside the sluice at the crossing, the great
   wooden wheel turning in the open race"** and **"steep slate roofs, with brick chimney stacks and brick
   plinths at their feet"** — present verbatim (`:4`).

**Canon base (re-read the sections cited):** `docs/worldbuilding/A1-geography-cluster1.md` §6 (:355-368 —
"the mill-wheel housing over the race is taller than the wall, and nothing else competes" :360-361;
amended material sentence :361-362; "First thing a traveller sees: the cart queue" :363) and §9
(:510-518 — one mill-wheel housing the only structure above one storey; timber frames on stone footings,
whitewashed plaster, steep slate roofs, brick stacks and plinths; queue of loaded carts and led animals
from the foreground toward the ford); `content/world/town-criteria.json` — `materials-by-economy`
(:183-189, "mill timber → frames", slate/brick barge-ballast amendment), `structure-not-decoration`
(:191-194, decorative storybook fachwerk = forbidden REGISTER), `roof-climate-coherence` (:199-203,
"shingle or slate"), `referencePolicy.forbiddenCharacteristics` (:271-279 — **incl. the NEW crenellation
class :278**, owner-approved 2026-09-01 per verdict #15 rail: "crenellations, battlements and
machicolations on non-military structures"), `millcross-materials-lever-ledger` owner decisions (:66-74).

**Registers:** CANON = A1 §6/§9 as amended, style.md, ratified criteria. INVENTED = brief masses/values
(traceability-tagged). PROPOSED = this sheet's verdict, rails, open questions.

**Machine gates run this review (exit codes):** `node scripts/check_content.mjs` → **exit 0, 0 failures,
34 warnings** (count unchanged); `node tools/art-forge/generate/prompt-lint.mjs` → **exit 0**;
`node --test tools/asset-storybook/tests/env-index.test.mjs` → **FAIL** — the served env index ends at
`…segment-subject-probe-seed12345-s0.45` and does **not** contain
`A1-ART-02-segment-mill-emphasis-r2-seed12345-s0.45`: **the r2 cell was not indexed into the
asset-storybook review surface** — the same process-gate break as #15, repeated.

**Pre-roll verification facts (loop-measured, carried into evidence):** segment block-in pixel probes —
race #56616B served at 3/4 probes + top-14 histogram; queue #241F18 served 2/4 in-canvas probes; housing
#53412B + wheel #3A2C1C + river #9AA4A8 all in top-14; wheel↔queue 22 confirmed intentional; housing↔wheel
25 (prescription applied). These facts matter below: **the block-in served every disputed value — the
failures in this cell are sampler-side attenuation at s0.45, not brief or block-in faults.**

---

## Per-criterion table (three passes)

| # | Criterion | Verdict | Citation / evidence · one sentence |
| --- | --- | --- | --- |
| 1 | Race slot legible as distinct darker open water (#15 fail: "race slot not delivered") | **MOVED** | mill-region crop 1.5×: a dark blue-grey open-water channel is now legible at x≈0.56-0.60, y≈0.69-0.91 — inside the prescribed rect (x 0.53-0.60, y 0.63-0.90), distinctly darker than road, wall and river, first time in 17 rolls; caveat: it reads beside the **road**, not beside the **wheel** (see 2) |
| 2 | Wheel present AND over the race | **HALF-MOVED** | a dark wooden-spoked wheel is present (x≈0.47-0.51, y≈0.50-0.56) — but mounted as a disc in the housing tower's base arch facing the viewer, shrunk well below the prescribed span (r 0.105 → x 0.45-0.66, y 0.48-0.69), and **not over the race**: the race top sits ≈0.13 frame-heights below the wheel bottom with road + parapet between; A1 §9 "the great wooden wheel turning in the open race" is not delivered — the wheel reads as arch ornament |
| 3 | Housing dark timber (#15 fail: light stone) | **NOT MOVED** | brief `:85` #53412b + block-in probe served it (top-14) + prompt asserts timber — yet the housing mass renders light tan/khaki **stone** (mill-region crop); third consecutive cell where the block-in serves the dark value and the s0.45 sampler flips the register to stone; `materials-by-economy` :186 "mill timber → frames" unmet in the render |
| 4 | Crenellations (banned class, new at :278) | **STILL PRESENT — criteria violation** | mill-region crop: the housing tower renders clear battlements at its crown — `referencePolicy.forbiddenCharacteristics` :278 (owner-approved verdict #15 rail) bans "crenellations, battlements and machicolations on non-military structures"; the banned register reproduced on the very mass that was regenerated |
| 5 | Era edge-check incl. right edge x≈1180-1280 (#15 VETO: modern pickup) | **MOVED — absent; PASS** | full frame + right-edge crop 2× (x 1080-1280): no pickup, no vehicle, no modern register anywhere; the right edge terminates in plaster-and-timber houses under slate with brick stacks; the #15 VETO object is gone from the exact region it stood |
| 6 | Fachwerk-watch (decorative fachwerk must not return) | **FAIL — regression persists** | right-row crop 2×: full storybook black-on-white half-timber grids with curved/diagonal braces across whole facades (incl. ornamental braces and a hanging sign) — the forbidden decorative register of `structure-not-decoration` :191-194; the subject-probe win stays un-defended; left row remains clean plaster |
| 7 | Queue present (#15 fail: queue absent) | **MOVED — MET** | full frame + mill-region crop: ox-cart queue with led animals fills the road descending toward the water, prominent centre-frame — A1 :363 "first thing a traveller sees" served; mid-stream carts still not confirmable (carried) |
| 8 | Watermark / hallucinated text (chronic) | **NOT MOVED** | full frame: garbled cursive signature block bottom-left ("Aamal' Ronper") — chronic class persists, unchanged disposition |
| 9 | Silhouette / composition / palette | **HELD** | the mill mass is the tallest structure and nothing competes (A1 :360-361 ✓); wall continuous, single crossing, no rival bridge; left row slate + brick chimneys + brick plinth courses read on-law; right-row roofs render brown — inside `roof-climate-coherence` :202 ("shingle or slate") though the prompt asserts slate; ash-grey/rope-brown/tallow palette held, no flat-vector flip |
| 10 | Storybook indexing (process gate) | **FAIL** | env-index test fails: the r2 cell is expected in the env index and absent from it — review-surface owner rule unmet until re-indexed (same break as #15) |

## The three-pass answers, stated once

- **Pass 1 (canon):** the race slot and the cart queue are now canon-true and legible — but the
  mill-housing canon sentence is doubly violated in the render: the timber register did not land
  (`materials-by-economy` :186; prompt asserts timber) and the crown is crenellated, a register class the
  owner banned at :278 in the same cycle that produced this cell.
- **Pass 2 (plausibility):** a mill wheel that does not touch its race is not a mill — the wheel hangs as
  an arch disc while the race starts a road-width away below a parapet; the block-in geometry was correct
  (probes served the race under the wheel arc) and the sampler detached them at s0.45.
- **Pass 3 (anti-cliché):** crenellated tower (banned class) + storybook fachwerk on the right row — the
  two tone-law hits from #15 persist; era contamination is clean this cell, which is the cell's one
  unqualified win of register.

## Cell verdict

**REJECT — no VETO this cell (era is clean), on three persistent carried fails:**

1. **Housing register/value:** light tan stone, not the authored dark timber #53412b — the core
   mill-emphasis lever, now measured 0-for-2 across paths (depth #15, segment r2) with the block-in serving
   the value correctly both times.
2. **Crenellated crown:** banned register class (`town-criteria.json:278`), reproduced on the regenerated
   housing mass.
3. **Right-row decorative fachwerk:** forbidden register (`:191-194`), regression unresolved.

And one continuity fail: **the wheel is not over the race** — legible wheel, legible race, no physical
connection between them, so the mill still reads as ornament, not as a working mill (Pass 2).

**Measured credit (what moved, for the record):** the race slot is legible as distinct darker open water
for the first time in 17 rolls — the rail-b re-prescription (bg→mg lift + rect + paint order) **worked and
is ratified by this cell**; the cart queue is restored; the #15 era-VETO object is absent; the wheel is
present. Three of the six carried bar items are met; the PASS bar requires every #15 fail moved or absent —
the cell fails it.

## Rail changes (concrete data diffs)

- **Storybook index — re-index the r2 cell (blocking bookkeeping fix, not a test change).** Same rail as
  #15: restore the pre-roll indexing step for rolltag `mill-emphasis-r2` (verdict-pending note referencing
  this sheet), re-run `node --test tools/asset-storybook/tests/env-index.test.mjs` to pass.
- **Housing-lever deadlock — stop re-prescribing values and prompt words (measured exhausted).** The dark
  housing value was served by the block-in on both paths and flipped to light stone by the sampler at s0.45
  in both cells; the "One timber mill-wheel housing…" subject-prompt sentence did not move it. Remaining
  lever per `millcross-materials-lever-ledger` :71 (owner approval required before spending a cell): **seed
  change** — prescription if spent: identical brief, identical segment path, seed 42424, rolltag
  `mill-emphasis-r3`, one variable only, this r2 cell as control.
- **Wheel/race continuity — no prompt-only fix is measured to exist.** The block-in geometry is right and
  the sampler detaches the pair; do not re-edit masses for it. Fold it into the seed-change cell's
  acceptance bar (wheel rendered dipping into the race water) rather than amending anything.
- **Keep the amended brief unchanged.** The race geometry is ratified by this cell's legible slot; the
  housing value and timber prompt sentence stay — they are canon-true and the next lever (seed) tests the
  same brief.
- **No new crenellation rail needed** — the class landed at :278; the finding is enforcement, not
  legislation.

## Open questions for the owner

1. **Next cell:** approve the seed-change cell (mill-emphasis-r3, seed 42424, identical brief, segment
   0.45) — **RECOMMENDED**, one variable, r2 as control — or stop spending cells on the mill and route the
   housing-register deadlock to a deliberate decision (accepting a stone mill housing would be a canon
   amendment against `materials-by-economy` "mill timber → frames" — the owner's call, never a loop
   outcome).
2. **Cell of record:** keep the **subject-probe cell** as cell of record — **RECOMMENDED** (it is the only
   cell that cleared fachwerk; this r2 cell regresses it and carries the banned tower) — while citing this
   r2 cell as the mill-geometry evidence (the race-slot legibility proof).
3. **G5 quest contradiction** (`content/story/quests.json` "Meet the road at the gate" vs wall-less
   Millcross) — carried untouched, as every verdict; no roll settles canon.

## What this review could not verify

- **briefHash `9c10d497b9ca3d0a` was not recomputed locally**; verified by ledger internal consistency
  (the 16:09 blockin rows and the 16:13 render row all carry it) and prompt-lint exit 0 on the
  working-tree brief.
- **Mid-stream cart assert** — the queue reaches the water region but the nearest cart standing mid-stream
  is not confirmable at review resolution (carried, now 18 rolls).
- **Sampler-side attribution** — whether the tan tower is value-attenuation of #53412b or a full register
  re-render needs a probe outside review scope; the rendered outcome (stone register + battlements) gates
  either way.
- **Exact structure counts against mustAssert "a dozen and a half structures"** — occlusion defeats
  counting (carried from every prior review).
