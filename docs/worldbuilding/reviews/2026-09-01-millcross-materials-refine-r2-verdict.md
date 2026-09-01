# Review · A1-ART-02 Millcross — low-denoise refine re-measure, r2 (anchor-recipe img2img @ denoise 0.45 over the subject-probe cell, seed 12345, briefHash c0ef116c7e149adf unchanged) — verdict

**Date:** 2026-09-01 (render 2026-09-01T13:47:17.525Z per run ledger `tools/art-forge/runs/A1-ART-02.json`) ·
**Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`) ·
**Verdict #14 in the loop; #2 on the REFINE path** — the LOW-DENOISE REFINE RE-MEASURE, opened exactly as
verdict #13 (`reviews/2026-09-01-millcross-materials-refine-verdict.md`) prescribed in its open question 1 (a)
(one re-measure at low denoise 0.30–0.45 on the probe cell, then the fork, no further spend), owner-approved
as one cell at **denoise 0.45** — the top of the prescribed window, chosen because the segment-path evidence
says register holds at segment-adjacent strengths and 0.45 is the measured segment operating strength
(`forge.config.json:94`), giving the materials their best chance to move while register holds. One question:
**does LOW denoise keep the register while moving slate/brick/mill where 0.75 could not?**

**Goal of this review, restated:** open and judge the re-measure cell against the subject-probe cell it
refined (its base), run the machine gates, answer the re-measure's question, rule
ACCEPT / ACCEPT-WITH-REFINEMENT / REJECT on the cell, close the lever's measurement either way, and write
this one sheet — nothing else edited, no generator run, no commit.

**Reviewed (each opened and read at full frame; detail findings confirmed on 2.5–3× ImageMagick crops,
read-only, crops written to session temp only — 24 crops, tripled r2/probe/r1 per region):**

| File | Role |
| --- | --- |
| `tools/art-forge/out/env/A1-ART-02-dev-refine-materials-r2-seed12345.png` | **THE RE-MEASURE CELL** — re-measured this review: sha256 `ba6a920b09f94e9eacdfa50bc1ce6c015d387f3510749a5da12adc79a6718dcf` |
| `tools/art-forge/out/env/A1-ART-02-segment-subject-probe-seed12345-s0.45.png` | the base — verdict #12's ACCEPT-WITH-REFINEMENT cell, cell of record; re-measured **intact**, sha256 `9e10d7511d0124ad35b3d2350fb72d41a254b6df0685dc2c28c1398abf4c2cdb` (exact match to the #12/#13 record — **rail 7 held again**; the refine did not overwrite the probe) |
| `tools/art-forge/out/env/A1-ART-02-dev-refine-materials-r1-seed12345.png` | the #13 REJECT cell, as the register/materials contrast data point; re-verified, sha256 `00a5be0a5fdbcac93ab7e8354b051ad0f5d1a080536e9dc69a29e64ae5661736` |

**Render contract:** ledger row `2026-09-01T13:47:17.525Z` — type render, seed **12345**, `control:"refine"`,
`strength:null`, **`refineSource:"out/env/A1-ART-02-segment-subject-probe-seed12345-s0.45.png"`** (the input
cell named in the ledger, not inferred from filenames), `model:"dev"`, `steps:27`, `cfg:1`, `guidance:5`,
**`denoise:0.45`**, briefHash **c0ef116c7e149adf** — identical on the probe's own row (`12:53:25.827Z`) and
the r2 row: the refine changes no brief data, and the working-tree brief diff carries the probe's as-rolled
prompt byte-unchanged (only `_note` history appended since HEAD — no brief data changed). Out
`out/env/A1-ART-02-dev-refine-materials-r2-seed12345.png`, rolltag `materials-r2`, rail-7-isolated. Note for
the record: **this is the loop's first ledger row that is self-documenting down to the sampler** —
`model`/`steps`/`cfg`/`guidance`/`denoise` plus `refineSource` all written at render time
(`generate/env.mjs:467-479,603`; asserted by the `ledgerSamplerFields` test, `env-graph.test.mjs:428`, and
the `--denoise` tests `:399-424`, incl. the refine-only loud-fail `:424`).

**Session rails landed since #13 — all six verified in data this review:** (1) rail 3's letter landed (the
ledger row, above); (2) the refine register guard sentence landed verbatim in `forge.config.json`
`profiles.environment.anchor._note` (:176 — "On a FINISHED cell … must re-measure the window low first");
(3) the materials-lever ledger entry landed in `content/world/town-criteria.json` `measured[]` (:68-72, the
#12-+#13 wording, `source: "reviewer:…"`); (4) the `referencePolicy` belfry/pinnacle amendment landed
(:276-277 — "church spires, belfry towers and cupola halls…" + "roof pinnacles and finials…"); (5) the stale
segment-strength test now pins the measured 0.45 (`forge-config.test.mjs:52-56`); (6) `--refine` gained the
`--denoise` override (refine-only, loud-fail; tested `env-graph.test.mjs:399-424`).

**Machine gates run this review (exit codes):** `node scripts/check_content.mjs` → **exit 0, 0 failures, 34
warnings** (warning count unchanged — the two new reviewer-worded criteria entries did not shift the count);
`node tools/art-forge/generate/prompt-lint.mjs` → **exit 0**; `node --test
tools/asset-storybook/tests/env-index.test.mjs` → **7/7 PASS, exit 0** — the r2 row was indexed pre-review
with this sheet's filename pre-referenced in its `reviews` array and the verdict-pending note recording the
rail-3 landing; `cd tools/art-forge && node --test tests/*.test.mjs` → **233 tests, 226 pass, 0 fail, 7
skipped (GPU-gated), exit 0** — env-graph **43/43** including `ledgerSamplerFields` and the `--denoise`
tests. All four gates green.

**Canon base (re-read the sections cited):** `docs/worldbuilding/A1-geography-cluster1.md` §6 Millcross
(:355-369 — **"the mill-wheel housing over the race is taller than the wall"** :360; material local: mill
timber, river stone, split shingle :361) and §9 A1-ART-02 (:511 — the mill housing is **the only structure**
above one storey; :513 — **"steep shingled roofs"**); `content/story/style.md` :17 ("The world speaks in two
registers. Nothing is written in a third.") and :129 (Millcross palette row: ash-grey, rope-brown,
tallow-yellow); `content/world/town-criteria.json` — materials-by-economy (:183; **fired brick is
Embervale's material**; Millcross local: mill timber, split shingle, river stone, valley clay/lime plaster),
**structure-not-decoration** (:191-194 — decorative storybook fachwerk is "a forbidden REGISTER"),
referencePolicy :260 with the landed belfry/pinnacle amendment :276-277; `forge.config.json` styleGuard
medium clause :110 ("Painted concept art in **gouache** on toned paper, **visible brushwork**, muted overcast
late-afternoon light, ash-grey sky") + era mustCompose, anchor block with the landed refine guard :176,
segment measured note :94; `docs/worldbuilding/ABP-flux-dev-and-anchor.md` :35 (the window "only exists if
the block-in carries grain").

**Registers:** CANON = A1 §6/§9, style.md, ratified criteria entries as cited. INVENTED = brief masses,
per-mass values, venue list (traceability-tagged in the brief `_note`s). PROPOSED = this sheet's cell
verdict, the lever-closure ruling, rails, and open questions.

---

## Measurements taken this review (ImageMagick, 1280×832; RGB means + HSL + grey std over the #12/#13 patch coords, so all five columns are comparable)

| Patch (full-frame coords) | r2 (0.45) | probe | r1 (0.75) | r2 Δ vs probe — attributable to the re-measure |
| --- | --- | --- | --- | --- |
| Gable plaster `60x60+400+350` | RGB 177,167,150 · H49 **S55** L164 · std 50 | RGB 174,163,144 · H38 **S47** L159 · std 33 | RGB 182,172,157 · H54 **S74** L170 · std 62 | small drift toward r1 (+3 L, hue warmed 38→49, sat +17% rel.) — a fraction of r1's +10 L/S74 break; std up (crisper edges) |
| Chimney stack `16x40+365+200` | RGB 92,50,39 · **H12 S112** L66 | RGB 117,83,65 · H20 **S72** L91 | RGB 84,29,23 · **H9 S170** L53 | **brick saturation +56%** (S72→S112), darker and redder — r2 moved ~halfway to r1's harmful S170 |
| Roof plane `60x40+250+300` | RGB 107,105,101 · **H172 (cool)** S14 L104 | RGB 118,113,104 · **H38 (warm grey)** S17 L111 | RGB 89,92,95 · **H176 (cool)** S33 L92 | hue flipped warm→cool like r1 (H38→H172) at low saturation — the roof register drift reproduced at 0.45, muted |
| Grass `64x64+300+650` | RGB 130,123,85 · std 21 | RGB 134,123,85 · std 10 | RGB 117,115,72 · std 22 | means near-identical; std doubled (crisper reed/edge work — edges, not grain) |
| Sky `64x64+640+80` | RGB 201,198,187 · std 2 | RGB 207,204,193 · std 2 | RGB 196,194,185 · std 4 | near-identical smooth gradient |

The std caveat from #13 applies: local-contrast numbers count edges as well as grain. The register judgment
below rests on the crops (grain/brushwork/edge character), the numbers only anchor the direction of drift:
**on plaster, brick, and roof, r2 sits between the probe and r1 — the 0.75 drift direction reproduced at
roughly half strength.**

## Per-criterion table — r2 vs probe (the Δ column is what the re-measure did)

| # | Criterion | Verdict | Citation / evidence · one sentence |
| --- | --- | --- | --- |
| 1 | Slate → wood shingle (targeted) | **NOT MOVED** | A1 §9 :513 (shingled), §6 :361 (split shingle); roof crop 3×: r2 roofs are flat slate fills with a few faint seams, zero shingle butt-rows; measured hue cooled H38→H172 toward r1's slate-blue — the slate fail survived and the surface drifted toward the wrong register |
| 2 | Red brick stacks + plinths gone (targeted) | **NOT MOVED — WORSE** | `town-criteria.json` :183 (fired brick is Embervale's; never in any Millcross prompt — sampler prior); chimney crop 3× + measurement: stacks persist, saturation +56% (S72→S112), coursing crisper and redder; plinth crop 3×: the red skirt band on the right-row house foot persists unchanged |
| 3 | Mill slot: wheel-in-race / housing / column (targeted) | **NOT MOVED — 15th consecutive roll** | A1 :360 (housing over the race, taller than the wall — absent 15 consecutive rolls); mill crop 3×: the parked wheel echo persists behind the garden wall in grass — no housing, no open race, no column, not taller than the wall; the wheel itself got flatter/cleaner (hard white spokes vs the probe's grained wheel); briefHash unchanged, so the refine had no mill-directed text — the Δ is sampler noise inside img2img |
| 4 | Gate tower register / height (targeted) | **PARTIAL — #12's clearance SURVIVED; residuals stand** | A1 §9 :511 (only the mill above one storey); tower crop 3×: plain coursed stone, **no decorative fachwerk** (the #13 VETO did not reproduce at 0.45), r1's red-tipped finials did not reproduce (plain grey-topped corner stubs — pinnacle-adjacent, now a named forbidden class :276-277); "plain oak" still not delivered (stone), tower still a 3+-storey competing mass; probe's painted emblem board did not survive (reads as a dark window slot now) |
| 5 | Register: matte/grained gouache-adjacent (the re-measure's first question) | **PARTIAL — REGRESSED** | style.md :17 + styleGuard :110; crops: r2's built surfaces (tower face, roofs, wheel, windows) went hard-edged and flat-filled vs the probe's grained painterly surface; landscape patches (grass, sky, hills) keep grain and gradient — this is NOT r1's full flat-vector flip (clouds retain soft edges), but the probe's gouache-adjacent surface did not survive 0.45 intact; no visible brushwork anywhere |
| 6 | Modern contamination / era | **NEW FAIL — VETO** | styleGuard era mustCompose + referencePolicy (no modern register); gate crop 2.5× and lamp crop 3×: **car-silhouette vehicles with windshield bands and window cutouts render on the queue road receding through the west gate** (white body w/ dark glass band + red cargo, red sedan-like forms); the probe's same region carries period ox-carts with spoked wheels (pb-gate crop), and r1's queue (r1-gate crop) carries no cars — the flip is specific to this 0.45 pass |
| 7 | Plaster plane quality (#12 win to defend) | **HELD with noted drift** | measured: +3 L, S47→S55 — nowhere near r1's brochure break (+10 L, S74); the on-law bright whitewash plane survives |
| 8 | Palette on-law (ash-grey / rope-brown / tallow-yellow) | **DRIFTED (mild)** | style.md :129; sky/grass/plaster near-probe (measured), but the saturated brick (S112) and cooled roofs (H172) pull their masses off-law toward r1's palette; frame-wide read stays closer to the probe than to r1 |
| 9 | Wall / gate / queue / edge composition | **HELD** | full-frame overlay read: wall line, west gate position, road curve, queue length and path, river bend, building masses and horizon all align with the probe; no second tall mass, no wall breach |
| 10 | Watermark / text (#12 fail) | **NOT MOVED — WORSE** | watermark crop 3×: the bottom-right cursive gibberish signature persists, **sharper and more legible** than the probe's grain-dissolved version |
| 11 | Lamp post (#12 fail) | **NOT MOVED** | lamp crop 3×: black post with a distinct lantern head mid-queue; in r2 it reads more modern than the probe's; era-ambiguous-props flag stands (flag-only check) |
| 12 | Queue / cart reads | **REGRESSED** | queue length, loaded carts, led animals all reproduce — but the queue tail through the gate broke to car silhouettes (criterion 6), which is a queue-read failure, not just an era one |

## Targeted-fail answers, per building class

- **Roofs: FAIL DID NOT MOVE.** No shingle appeared; slate held and its surface cooled toward r1's
  slate-blue. The last unmeasured operating point cannot rescue this lever.
- **Chimneys/plinths: FAIL DID NOT MOVE — WORSE.** The sampler's brick prior survived and *intensified*
  (+56% saturation); the plinth band persists.
- **Mill: FAIL DID NOT MOVE — 15th consecutive roll.** The parked wheel echo is now flatter and more
  vector-like than the probe's; no housing, race, or column.
- **Gate tower: the one #12 win defended.** Fachwerk stayed cleared at 0.45; r1's finial ornament did not
  reproduce; height and oak-register residuals stand unchanged.

## The re-measure's answer, stated once

**No — LOW denoise did not keep the register, and it moved nothing.** At 0.45 — the segment path's measured
register-holding strength — the refine (a) drifted the built-surface register measurably toward flat vector
(halfway to r1 on every sampled patch), (b) moved zero of the three targeted material fails, (c) sharpened
the watermark, and (d) surfaced a new modern-era break (car-like vehicles in the gate queue) that neither
the probe nor r1 contains. The img2img materials-refine lever is now **measured at both ends of its
plausible window**: harmful at 0.75 (#13), inert-and-regressing at 0.45 (#14). Below 0.45 a refine
converges toward a copy of its base — and the base is already the cell of record, already carrying the
fails. **There is no window left to sample: the refine lineage terminates with the measurement complete.**

## Cell verdict

**REJECT — with one VETO, naming the exact content that must not exist:**

1. **VETO (modern contamination, style law):** car-silhouette vehicles with windshield bands render on the
   queue road through the west gate (frame ~x 790–900, y 395–470). The era clause is a mustCompose style law
   (`forge.config.json` styleGuard), a modern register is forbidden by `referencePolicy`, and a third
   register is forbidden outright (`content/story/style.md:17`). The prompt was clean; the artifact is not;
   the render is the review surface.

Supporting objections (independent of the VETO): the three targeted material fails did not move (criterion
set 1–3) — the cell fails its own purpose — and the register regressed (criterion 5). The subject-probe cell
(verdict #12, ACCEPT-WITH-REFINEMENT) **remains the cell of record** and the loop's best artifact. The r2
cell is not deleted — it is the evidence that closes the lever; the ledger row and storybook row stand as
provenance.

## Closing the fork (#13 open question 1 — now evidence-complete)

The fork is no longer conditional: both arms of the refine lever are measured, the wording levers were
measured inert for slate/brick (#11/#12), and the seed-change prior is LOW (all 0.45 lanes carried
slate/brick). The owner chooses between:

1. **Accept-with-note (RECOMMENDED now):** ship the subject-probe cell as the A1-ART-02 concept with a
   per-town register-drift note declaring slate roofs + brick stacks/plinths as known, uncorrected sampler
   drift, recorded in `town-criteria.json` (the landed materials-lever ledger entry already half-does this).
   Pros: zero further spend; the cell of record is otherwise on-law; the contradiction stays explicit and
   reviewable, which is the canon.md way. Cons: the criteria file permanently disagrees with the shipped
   concept, and #12's precedent warning for the other five towns stands.
2. **Deliberate canon amendment (owner's call, deferred):** amend Millcross's material law (A1 §6 local
   materials + `materials-by-economy`) in the same commit as an authored, traceability-tagged story for
   slate and brick in Millcross (the walled-core amendment, OWNER-2026-08-29-evening, is the in-repo
   precedent for same-commit canon amendment). Pros: honest canon-art consistency, no standing exception.
   Cons: it amends world truth to match a sampler prior on concept-art evidence — every prior verdict
   flagged this as last resort, and brick specifically needs an authored trade story to stay plausible
   (Embervale's material arriving in Millcross). **Do not do this as a side effect of this verdict; it is a
   separate, deliberate owner decision.**

The mill is a separate fail with a live lever: **control-map emphasis on the mill column/race masses
(#13 OQ2 (a), still RECOMMENDED and still unmeasured)** before any mill canon amendment is even discussed.

## Rail changes (concrete data diffs)

- **Rail 3 — RETIRED.** The r2 row carries `model`/`steps`/`cfg`/`guidance`/`denoise` + `refineSource` at
  write time (`runs/A1-ART-02.json:204`; `env.mjs:467-479,603`; tests `env-graph.test.mjs:399-436`). The
  mechanism is accepted; no further rail. Nine rolls well spent.
- **Refine register guard — LANDED, accepted** (`forge.config.json:176`, verbatim). No further rail.
- **NEW RAIL — refine era risk (modern-vehicle prior).** At 0.45 the queue tail flipped to car silhouettes
  on a base (the probe) whose queue was period carts — the era guard is prompt-side (`mustCompose`), and
  this break is sampler-side, invisible to prompt-lint. Diff proposal: append one sentence to the anchor
  `_note` (or a new `refine` note): "Denoise 0.45 on the finished probe cell surfaced modern car-like
  vehicles in the gate queue (verdict #14) — the refine path's era risk is sampler-side; any future refine
  cell must be era-checked on the gate/queue region, and an artifact-gate era check (I-055) is the machine
  half."
- **Materials-lever ledger entry — UPDATE with the #14 measurement and land it.** The landed entry's final
  sentence ("Remaining levers: low-denoise refine re-measure, seed change (prior LOW), deliberate canon
  amendment") is now stale in its first item. Proposed replacement sentence: "Low-denoise refine re-measure
  (denoise 0.45, verdict #14): materials did not move; built-surface register drifted toward flat vector
  (brick S72→S112, roof hue warm→cool), the watermark sharpened, and modern car-like vehicles surfaced in
  the gate queue — the img2img materials-refine lever is measured DEAD at both ends of its plausible window
  (0.75 harmful #13, 0.45 inert-and-regressing #14). Remaining levers: seed change (prior LOW),
  control-map emphasis for the mill, deliberate canon amendment."
- **`referencePolicy` belfry/pinnacle amendment — landed (:276-277); no further rail.** Directly relevant
  this review: r1's finials were the named class; r2's corner stubs are pinnacle-adjacent.
- **Keep the reworded brief — stands (carried, #11 OQ2 / #12 rail).** briefHash unchanged across probe and
  r2 rows; r2 changed no brief data.
- **G5 quest contradiction — carried, untouched** (`content/story/quests.json` :208 "Meet the road at the
  gate" for wall-less Millcross is the standing G5-class item; the rendered town is now walled, which makes
  the quest line consistent with the ART but the canon contradiction is unresolved by renders — no roll
  settles canon, this one included).

## Open questions for the owner

1. **Fork ruling (evidence-complete):** accept-with-note now (recommended, see above) or hold sign-off for a
   deliberate canon amendment? My recommendation: **accept the subject-probe cell with the drift note; do
   not amend canon on this evidence** — amendment remains available later if the drift blocks downstream
   use, and doing it later costs nothing this does not.
2. **The mill — 15th consecutive roll:** spend a cell on control-map emphasis of the mill column/race
   masses at segment 0.45 (recommended, unmeasured), or route the mill straight to the canon-amendment
   queue? Recommendation: **one control-map cell**, then amendment if it fails.
3. **Land the ledger-entry update + the refine era-risk note** with the next change-set commit (both
   criteria-file edits = owner approval; both recommended).
4. **Rail 3 retirement** — recorded here; no action needed.

## What this review could not verify

- **briefHash `c0ef116c7e149adf` was not recomputed locally** (running the generator is outside review
  scope); verified by ledger internal consistency — the probe row and the r2 row carry the identical hash,
  and prompt-lint exit 0 ran on the working-tree brief.
- **Determinism at 0.45** — one cell by design: whether the car-vehicle flip, the register drift, and the
  flatter wheel reproduce on a second roll at this operating point is unmeasured, and sampling more is not
  recommended (the lever is dead on materials regardless of the answer).
- **The exact identity of the white/red queue objects** — at 2.5–3× they carry windshield bands, window
  cutouts and car silhouettes, and they do not read as carts at viewing size; I rule them modern
  contamination on that register read, while noting the honest limit of a 1280×832 source.
- **The composed positive string actually sent** is not logged; prompt-side cleanliness rests on code
  reading (`env.mjs` composition + mustCompose tests green) and prompt-lint exit 0.
- **The r2 emblem board** — the probe's small painted emblem board on the tower face did not clearly
  survive (reads as a dark window slot); whether it is gone or repainted is unresolvable at 3×.
- **Exact structure counts against mustAssert "a dozen and a half structures"** — occlusion defeats
  counting (carried from every prior review).
