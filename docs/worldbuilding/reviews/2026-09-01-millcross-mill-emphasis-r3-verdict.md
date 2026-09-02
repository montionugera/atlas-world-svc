# Review · A1-ART-02 Millcross — mill-emphasis-r3 cell (rolltag mill-emphasis-r3, seed 42424, control "segment" @ s0.45, briefHash 9c10d497b9ca3d0a) — verdict

**Date:** 2026-09-01 (render 2026-09-01T16:35:18.536Z per run ledger `tools/art-forge/runs/A1-ART-02.json`, last render row) ·
**Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`) ·
**Verdict #17 in the loop; the seed-change cell prescribed by #16's rail.** One question: **are verdict
#16's sampler-stubborn fails (housing tan stone · storybook fachwerk braces · crenellated crown ·
wheel arch-mounted-not-over-race) SEED-LOCKED or SYSTEMATIC?** One variable was spent per the
`millcross-materials-lever-ledger` :71 prescription — seed 12345 → **42424**, identical brief
(briefHash unchanged), identical segment path, identical strength 0.45, r2 as control. If r3 cleared
every carried fail it would replace the subject-probe cell as cell of record.

**Goal of this review, restated:** view the new cell (downscaled + four targeted crops only), verify the
render contract, judge the seven-item PASS bar with the three passes, rule seed-locked vs systematic per
carried fail, and write this one sheet — nothing else edited, no generator run, no commit.

**Reviewed:**

| File | Role |
| --- | --- |
| `tools/art-forge/out/env/A1-ART-02-segment-mill-emphasis-r3-seed42424-s0.45.png` | **THE CELL** — sha256 `ac58968e364e3739ea5afd671dabefd306c763270e5b313b5322e28f9d12bad3`, 1280×832, viewed full-frame downscaled (sips -Z 1024) + four ImageMagick crops (mill region 2×, wheel/face zoom 3×, right edge 2× at x 1030-1280, right row 1.5×; crops in session temp only) |
| `tools/art-forge/runs/A1-ART-02.json` | render contract — last render row cross-checked |
| `docs/worldbuilding/reviews/2026-09-01-millcross-mill-emphasis-r2-verdict.md` | carried bar + seed-change prescription (#16) |
| `docs/worldbuilding/reviews/2026-09-01-millcross-race-channel-represcription-verdict.md` | geometry prescription ratified by #16 |

**Render contract:** ledger row `2026-09-01T16:35:18.536Z` — type render, seed **42424**, `control:"segment"`,
`strength:0.45`, `model:"schnell"`, `steps:8`, `cfg:1`, `denoise:1`, briefHash **`9c10d497b9ca3d0a`**,
out = the r3 cell — matches the #16 prescription exactly: **one variable (seed), everything else identical
to the r2 control.** The experiment is clean.

**Canon base (re-read the sections cited):** `docs/worldbuilding/A1-geography-cluster1.md` §6 (:355-368 —
mill-wheel housing taller than the wall, nothing else competes :360-361; amended material sentence "mill
timber" :361-362; "First thing a traveller sees: the cart queue" :363) and §9 (:510-517 — timber frames on
stone footings, whitewashed plaster, steep slate roofs, brick stacks and plinths; queue of loaded carts and
led animals); `content/world/town-criteria.json` — `materials-by-economy` :183-189 ("mill timber → frames"),
`roof-climate-coherence` :199-203 ("shingle or slate"), `referencePolicy.forbiddenCharacteristics` :271-279
(incl. crenellation class :278 — "on non-military structures"), `millcross-materials-lever-ledger` :66-74
(seed change spent 2026-09-01 per :71 owner-approved prescription).

**Registers:** CANON = A1 §6/§9 as amended, style.md, ratified criteria. INVENTED = brief masses/values
(traceability-tagged). PROPOSED = this sheet's verdict, seed-lock rulings, rails, open questions.

**Machine gates run this review (exit codes):** `node scripts/check_content.mjs` → **exit 0, 0 failures,
34 warnings** (counts unchanged from #16); `node tools/art-forge/generate/prompt-lint.mjs` → **exit 0**;
`node --test tools/asset-storybook/tests/env-index.test.mjs` → **FAIL** — the served env index ends at
`…segment-mill-emphasis-r2-seed12345-s0.45` and does **not** contain
`A1-ART-02-segment-mill-emphasis-r3-seed42424-s0.45` (the r2 entry is still missing too): **the r3 cell was
not indexed into the asset-storybook review surface — the #15/#16 process-gate break, third occurrence.**

---

## Per-criterion table (three passes · the seven-item PASS bar)

| # | Criterion | Verdict | Citation / evidence · one sentence |
| --- | --- | --- | --- |
| 1 | Housing reads DARK TIMBER (not tan stone) (#16 fail) | **HALF-MOVED — NOT MET** | mill-region crop 2×: the tan stone is gone (seed moved the value) but the housing mass renders as a flat near-black charcoal/slate slab with **zero timber articulation** — no framing, no planks, no #53412b brown register; `materials-by-economy` :186 "mill timber → frames" still unmet in the render, now 0-for-3 paths (depth: light stone; r2: tan stone; r3: charcoal slab) |
| 2 | No decorative fachwerk braces (#16 fail) | **FAIL — persists** | right-row crop 1.5×: full storybook black-on-white half-timber facades with decorative gabled braces on multiple houses (incl. the signed inn) — the forbidden register of `structure-not-decoration` :191-194, back on the same brief that cleared it in the subject-probe cell |
| 3 | No crenellated crown (banned class :278) (#16 fail) | **MOVED — MET on the housing** | mill-region crop: the housing crown is a clean plain slate roof edge, no battlements; the frame's one crenellated tower is the west **gate** tower over the arch — a military structure, outside the :278 class as written ("on non-military structures") |
| 4 | Wheel present OVER the race (#16: arch-mounted) | **FAIL — wheel absent** | wheel/face zoom 3×: **no wheel renders at all** — the pale disc on the housing face is a soft moon-like orb (no rim, no spokes, not wooden) and the race face is a white weir cascade; r2's arch-disc wheel is gone, and A1 §9 "the great wooden wheel turning in the open race" remains undelivered |
| 5 | Race slot legible (dark distinct channel) | **FAIL — occluded / re-rendered white** | full frame: the prescribed slot x≈0.53-0.60, y≈0.69-0.90 is covered by a gibberish signboard, brick parapet and road; what renders instead is a **white** full-width weir cascade under the relocated housing — distinct but white-weir register, not the ratified dark channel #56616b, and no wheel beside it |
| 6 | Queue present | **MET** | full frame: the tan-canopied cart/bale queue with led animals fills the left-centre road descending toward the crossing — A1 :363 "first thing a traveller sees" served (mid-stream cart still not confirmable, carried) |
| 7 | Era clean incl. right edge x≈1080-1280 (#15 VETO region) | **MET — PASS** | right-edge crop 2× (x 1030-1280): no pickup, no vehicle, no modern register anywhere; the edge terminates in the housing mass, teal water, parapet and row tail; garbled sign text persists (chronic class, non-veto disposition unchanged from #16) |

**Other passes:** silhouette law held (the mill mass is the tallest mass, nothing competes — A1 :360-361);
roofs steep slate/shingle in register (:199-203); palette held (no flat-vector flip); no windmill, no spire,
no new veto class; two garbled signboards = chronic watermark class, disposition unchanged.

## The three-pass answers, stated once

- **Pass 1 (canon):** the two canon sentences that matter are still violated in the render — the housing is
  not timber in any register (:361-362, `materials-by-economy` :186), and the wheel does not turn in the
  open race because there is no wheel (A1 §9); the queue and the silhouette law are served.
- **Pass 2 (plausibility):** a dark featureless slab with a white weir face and no wheel is not a mill —
  the seed change destroyed the r2 wheel and re-registered the race as a cascade without ever binding them;
  the mill's mechanism is absent, which is a stronger realism fail than r2's ornament wheel.
- **Pass 3 (anti-cliché):** storybook fachwerk returned with the brief it always follows; crenellation left
  the housing but sits legitimately on the gate tower; era register is clean — the cell's one unqualified win,
  same as r2.

## Cell verdict

**REJECT — four of the seven PASS-bar items unmet:** housing timber register (1), decorative fachwerk (2),
wheel absent (4), race slot occluded/white (5). No VETO-class new fail (era clean, no banned object class).

## Seed-locked vs systematic — the experiment's answer, per carried fail

| #16 carried fail | r3 outcome at seed 42424 | Ruling |
| --- | --- | --- |
| Housing tan stone | value moved (no tan stone) but register still not timber — now a charcoal slab | The **colour fail was seed-locked** (seed moved it); the **register fail is SYSTEMATIC** — three paths, three non-timber registers, block-in and prompt asserting timber every time. The sampler, not the seed, owns this lever. |
| Storybook fachwerk braces | returned identically | **SYSTEMATIC across seeds — and seed-inert**: it follows the *brief* (subject-probe's reworded briefHash cleared it; this r2-hash brief regresses it), exactly as the lever ledger :71 measured. |
| Crenellated crown on housing | cleared (clean slate crown; gate-tower crenellation is military-class, allowed) | **SEED-LOCKED** — the manifestation died with seed 12345. |
| Wheel arch-mounted-not-over-race | worse: wheel absent entirely | **SYSTEMATIC at s0.45** — two seeds, two wrong manifests (arch ornament, then nothing); the sampler will not bind wheel to race on this brief/geometry. Not a seed lever. |

**Bottom line:** the seed lever is measured **inert for the register fails that matter** (timber, fachwerk,
wheel-over-race) and only reshuffles their surface manifests (stone→slab, arch-disc→absent, crown on→off).
The #16 condition for replacing the subject-probe cell — clear every carried fail — is not met.

## Rail changes (concrete data diffs)

- **Storybook index — re-index BOTH mill-emphasis cells (blocking bookkeeping fix, not a test change).**
  Third occurrence: restore the pre-roll indexing step for rolltags `mill-emphasis-r2` and
  `mill-emphasis-r3` (verdict-pending notes referencing #16 and this sheet), re-run
  `node --test tools/asset-storybook/tests/env-index.test.mjs` to pass.
- **Seed lever — mark SPENT AND INERT for register fails** in `millcross-materials-lever-ledger` :71
  (data diff: append "seed change SPENT 2026-09-01 (r3, verdict #17): colour manifests moved
  (tan-stone→charcoal slab, housing crenellation cleared) but timber register, fachwerk and
  wheel-over-race did not move — seed ruled inert for register fails"). Remaining levers per :71:
  **control-map emphasis for the mill** (next measured candidate) or **deliberate canon amendment**
  (owner's call, never a loop outcome). Do not spend another seed.
- **Housing register — the two surviving levers both route through the owner.** Control-map emphasis
  needs a new prescription sheet; canon amendment (accepting a non-timber mill housing) contradicts
  `materials-by-economy` :186 and A1 :361-362 and can only be deliberate, same-commit.
- **Wheel/race — carry the acceptance item forward unchanged** (wheel rendered dipping into the race
  water); the race-slot geometry prescription stays ratified (a legible slot rendered in r2), but no
  cell since has delivered wheel+race together.
- **Keep the amended brief unchanged** — it is canon-true; the failure is sampler-side on every
  measured lever.

## Open questions for the owner

1. **Cell of record:** keep the **subject-probe cell** — **RECOMMENDED** (still the only fachwerk-clean
   cell; r3 does not clear the bar and does not replace it) — while citing r2/r3 as the seed-lever
   evidence pair.
2. **Next lever:** approve the **mill control-map emphasis** prescription as the next measured lever, or
   open the **canon-amendment decision** on the housing register — **RECOMMENDED: decide the canon
   question first**; a third lever spent on a register the owner may amend is a wasted cell.
3. **G5 quest contradiction** (`content/story/quests.json` "Meet the road at the gate" vs wall-less
   Millcross) — carried untouched, as every verdict; no roll settles canon.

## What this review could not verify

- **briefHash `9c10d497b9ca3d0a` was not recomputed locally**; verified by ledger internal consistency
  (the r3 row carries the same hash as the r2 control row and the 16:09 blockin rows) and prompt-lint
  exit 0 on the working-tree brief.
- **Whether the pale disc on the housing face is a moon or an orb-ornament** — at review resolution it
  has moon-like mottling; either reading is non-canon-noise on the housing face, and the wheel finding
  (absent) gates regardless.
- **Mid-stream cart assert** — queue reaches the water region; nearest cart standing mid-stream not
  confirmable at review resolution (carried, now 19 rolls).
- **Sampler-side attribution** — whether the charcoal slab is value-attenuation of #53412b or a full
  register re-render needs a probe outside review scope; the rendered outcome (no timber articulation)
  gates either way.
- **Exact structure counts against mustAssert "a dozen and a half structures"** — occlusion defeats
  counting (carried from every prior review).
