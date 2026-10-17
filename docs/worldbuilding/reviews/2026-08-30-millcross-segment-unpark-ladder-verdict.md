# Review · A1-ART-02 Millcross — segment-control unpark ladder (strength 0.30 / 0.45 / 0.60, seed 12345) — verdict

**Date:** 2026-08-31 (ladder rendered 2026-08-30 18:05–18:06Z; filename pinned by the storybook env-index reference) ·
**Reviewer role:** Town Canon & Plausibility Reviewer (`.claude/agents/town-canon-reviewer.md`)
**Verdict #9 in the loop; verdict #1 on the SEGMENT path.** The r3 verdict's pre-registered tripwire fired on a fair
test (anchor data-lever exhausted; wall masonry 0/3; standing wall VETO 0-for-8 rolls); the owner approved unparking
SEGMENT CONTROL, and this sheet measures the one number the 08-29 campaign left null: `environment.segment.strength`.

**Goal of this review, restated:** open and judge the three segment ladder cells plus the segment control map against
the standing criteria, run the machine gates, rule the measured strength window, rule whether the 2026-08-29
segment-control negative result (`docs/worldbuilding/ABP-segment-control.md`) is formally overturned on fair inputs,
and rule the 3-seed confirmation roll — all in this one sheet, nothing else edited.

**Reviewed (each opened and read at full frame this review; detail findings confirmed on 2.2–4× ImageMagick crops,
read-only, crops written to session temp only — 14 crops total):**

| File | Role |
| --- | --- |
| `tools/art-forge/out/env/A1-ART-02-segment-seed12345-s0.30.png` | rung 1 |
| `tools/art-forge/out/env/A1-ART-02-segment-seed12345-s0.45.png` | rung 2 |
| `tools/art-forge/out/env/A1-ART-02-segment-seed12345-s0.60.png` | rung 3 |
| `tools/art-forge/out/control/segment/A1-ART-02-segment.png` | control map (adherence judging) |

The 08-29 ladder's cells at s0.00 / s0.75 / s0.90 are still on disk, un-overwritten. **Evidence conflict, reported
not resolved:** the env-index rows for s0.30/0.45/0.60 carry a note that the 08-29 cells at those three strengths
were **overwritten** by this ladder (same filenames, new brief era) — so the 08-29 negative result's three mid-window
cells no longer exist as pixels; their provenance lives in the run ledger and `ABP-segment-control.md` only. The
un-overwritten 0.00/0.75/0.90 cells plus the ledger are what remains of that campaign's visual evidence.

**Render contract:** brief `tools/art-forge/briefs/A1-ART-02.json` at briefHash **b7658d8607bbbe70** (the corrected
colour-anchor-geometry brief r3 reviewed — same hash, no brief edits between the r3 roll and this ladder), verified
against `tools/art-forge/runs/A1-ART-02.json:170-172`: three render rows, seed **12345** at all three rungs,
`control:"segment"`, strength 0.30 / 0.45 / 0.60, window 18:05–18:06Z on 2026-08-30, every row carrying
`b7658d8607bbbe70`. Prompt and `mustAssert` unchanged on the face of the brief (same three assertions); prompt-lint
exit 0. Sampler: the dev D-base profile `tools/art-forge/forge.config.json:162-164` — **20 steps, cfg 1, guidance
5.0** — matches the handoff claim; per-render confirmation is rail 3's gap (see "could not verify"). This is a
**straight ControlNet pass** (no img2img colour-base anchor flow), which is precisely what makes it a fair re-test of
the 08-29 ladder's mechanism claim on different inputs. The register fix (rail 5(a)) is carried and re-verified in
code this review: `buildEnvPositive` composes `[medium, promptText, era]` (`tools/art-forge/generate/env.mjs:295-302`),
no character-cel vocabulary; lint exit 0.
**Control map verified by pixel sample this review (1280×832):** sky `000000` (depth/segment semantics — the label
map does not carry the colour base's gradient); far-bank `7D8288`, river `9AA4A8`; town-row-left `8F8A82`,
town-row-right `948E84`; mill column `5C4A34` (lower half occluded by the queue wedge — array order, as in r3's
colour base); **mill-wheel disc `3A2C1C` exact at [790,512]** — a distinct darker disc sitting on the south-tower
post (a lollipop: disc poly [0.53–0.70] overlaps tower-s rect [0.58–0.63] y 0.62–0.92); **wall-flank-right `C6C2B6`
exact at [1150,727]**, unoccluded; both gate towers `6B5A40`; cart-queue `241F18`, led-animals `1C1712`, ground
`8A8070` (overlaid by the animals wedge at the sampled point). All twelve masses present at authored values under
the `-blur 0x6` rasterisation. **The map is fair.**
**Canon base:** `docs/worldbuilding/A1-geography-cluster1.md` §6 Millcross (`:355-369`, re-read this review:
walled crossing town, timber-and-earth wall thrown up after the war, west gate, high street of timber-framed houses
on stone footings, mill-wheel housing taller than the wall and nothing else competes, local materials — mill timber,
river stone, split shingle — first sight is the cart queue, the wall guards the crossing) and §9 brief (`:511`);
`content/story/style.md` `:17` (two registers) and `:129` (Millcross palette row: ash-grey / rope-brown /
tallow-yellow); `content/world/town-criteria.json` — `walled-core` `:73-77` (owner-ratified 2026-08-29: timber-and-earth
wall, gates on the high street and the ford approach), `one-cart-crossing` `:122-126`, `first-sight-cart-queue`
`:129`, the REVIEWER v1.2 material ban `:156` (pantile / half-timbered / red tile, per-town), `structure-not-decoration`
`:183`, `map-derived-concept` `:207`; contamination law `forge.config.json` `profiles.environment.styleGuard` (era
"Pre-industrial and pre-electric", forbidden-token list); `ABP-segment-control.md` (the 08-29 negative under ruling);
`ABP-flux-dev-and-anchor.md` (denoise window 0.70–0.78) and `forge.config.json:160` (depth window 0.30–0.40) as the
window-discipline precedents. Note: the persona's reading list cites `content/towns/town-criteria.json`; the actual
file is `content/world/town-criteria.json` (flagged in rail changes).
**Machine gates run this review:** `node scripts/check_content.mjs` → **exit 0, 0 failures, 34 warnings** (same
warning count as every prior review); `node tools/art-forge/generate/prompt-lint.mjs` → **exit 0**;
`node --test tools/asset-storybook/tests/env-index.test.mjs` → **7/7 pass** (run before this sheet existed — the
index already references this filename and its provenance test passes against the run log including the three
segment rows).

**Registers:** CANON = A1 §6/§9, style.md, town-criteria ratified entries as cited. INVENTED = brief masses and
their per-mass `value` colours (traceability-tagged in the brief `_note`s). PROPOSED = this sheet's window ruling,
reversal ruling, change set, rails, and open questions.

---

## Per-rung verdict table

| Criterion | s0.30 | s0.45 | s0.60 | Canon cite |
| --- | --- | --- | --- | --- |
| **(a) wall band renders as masonry** | **PARTIAL — loop second masonry result**: the flank mass rendered as a real masonry run with a coping, an arched water-passage at its base and crenellation-like teeth on top, exactly at the flank position — but it reads as a stone bridge/causeway abutment spanning the water, not a wall enclosing anything; dressed ashlar, not timber-and-earth | **YES — loop first wall-as-wall**: a continuous barrier run with a coping follows the road the full width — masonry stretches with coping past the gate, timber-plank palisade stretches beside the queue (timber register is canon-compatible; A1 §6 "timber-and-earth"); town reads as enclosed, road outside; low height (waist-to-eaves) | **PARTIAL** — a timber plank palisade with visible posts runs along the road bend and reads as a fence that stops; earth embankment continues it; no enclosure read | brief `wall-flank-right`; A1 §6:356; `walled-core` :73 |
| **(b) gate tower(s) at the road gap** | **PARTIAL — strong gate read**: big crenellated stone gate tower with a true arched cart passage at the road, queue passes through it; drifted right of the authored gap (rendered ≈x 0.70 vs authored 0.38–0.63); ashlar + crenellations, not plain oak | **YES — best gate of the loop**: timber-framed gate tower standing at the road gap with the road passing **through** the base passage, queue entering, clear read at full frame; timber register right (fachwerk decoration wrong sub-style) | **PARTIAL** — timber tower present at the gap but the passage is not readable (road bends around/behind; dark awning at base) | brief `gate-tower-west-*`; A1 §6 "west gate"; `walled-core` :75 |
| **(c) mill wheel** | **FAIL** — no wheel, no column (column position = fachwerk houses), no race; empty wrought-iron bracket on a house echoes the emblem-board vocabulary | **FAIL** — no wheel, no column (column position = cream manor hall), no race; the label map's lollipop disc rendered as tower/building, not wheel | **FAIL** — no wheel, no column, no race | brief ¶4, `mill-wheel` mass; A1 §6:360-361 |
| **(d) queue + ford + no rival crossing** | **PARTIAL**: queue PASS (long, loaded, covered, receding to the gate); ford FAIL (queue never meets water); rival crossing UNRESOLVED — the arched structure spans a channel at water level (race read vs river bridge read; see could-not-verify) | **PARTIAL**: queue PASS (very long, covered loads, led cattle at the left end, receding into the gate); ford FAIL (road curves to the gate, not the water; nothing mid-stream); no rival crossing | **PARTIAL**: queue PASS (longest of the ladder, dense, led animals); ford FAIL; no rival crossing; road surface reads as pink brick paving, off the "well-worn earth road" register | A1 §3.1 "in exactly one by cart"; `one-cart-crossing` :122; `first-sight-cart-queue` :129 |
| **(e) town edge** | **PARTIAL** — open green plain + low hills at the left horizon; town sprawls centre-right | **PASS — loop first on this lane**: town contained inside its wall; beyond it open lowland and hazy hills on both horizons; the "beyond" exists | **PARTIAL** — hazy lowland beyond, but scattered horizon hamlets blur the edge | brief ¶3 "beyond the town edge"; mustAssert "beyond the town edge" |
| **(f) materials** | **FAIL** — decorative fachwerk on every house (black-on-white patterns), red-brick chimneys ×4+ | **FAIL** — decorative fachwerk on the gate tower and houses, red-brick chimneys ×6, grey slate roofs | **FAIL** — decorative fachwerk pervading the whole town, dark blue-grey roofs | A1 §6:357 (timber-framed on stone footings); `structure-not-decoration` :183; REVIEWER v1.2 ban :156 |
| **(g) contamination (era tokens)** | **PASS** — clean at every zoom tried; no pylons, no motors, no markings | **PARTIAL** — Victorian-register street lamp on the road edge (probable era break; oil-lamppost read strained) and a blue bin-like object on a post at the gate (flagged class, third instance across paths) | **PARTIAL** — the pink brick-paved road reads as modern paving register; the A-frame object on the road resolved at 4× as a covered wagon with an overhead frame (clean); red boxy carts resolved as hand/ox carts (clean) | `styleGuard.era` "pre-industrial and pre-electric" |
| **(h) hallucinated text** | **FAIL — lettering-class marks**: garbled two-row lettering-like stamps inside ovals on ≥3 cart covers (4×), plus a green oval house-sign with a glyph; all low-legibility | **FAIL — two confirmed instances**: bright yellow notice panel with multi-row garbled lettering pinned in a window (4×; printed-poster register, itself era-wrong) and a white cursive corner watermark (4×) | **PASS — text-clean at every zoom tried** (4× corner band clean — the full-frame "scribble" resolved to wash texture; the hall gable "plaque" resolved to a window) | ABP-flux-dev-and-anchor.md text scope; I-055 |
| **(i) style register (gouache clause)** | **FAIL** — soft 3D-render/painterly hybrid: glossy highlights on the sacks, volumetric clouds, smooth shading | **PARTIAL — best register of the loop on this path**: matte, grained, poster-flat, gouache-adjacent; still no visible brushwork | **PARTIAL** — flat matte washes, the flattest of the three; poster rather than gouache | `styleGuard.medium`; style.md :17 |
| **(j) palette (ash-grey / rope-brown / tallow-yellow)** | **FAIL** — bright blue-cream sky with white cumulus, saturated green grass, pink flowering plants; sunny, not ashy | **PASS** — flat ash-grey overcast sky, grey water, muted olive/sage ground, creams/browns on-law | **PARTIAL** — grey sky and muted browns on-law; the pink-red road surface is off-palette | style.md :129; brief ¶1, ¶5 |

**Cell verdicts: s0.30 REJECT · s0.45 REJECT · s0.60 REJECT.** Every rung is disqualified by the same single
standing criterion — **materials** (`structure-not-decoration` :183 + the REVIEWER v1.2 fachwerk ban :156;
A1 §6:357's register is timber-framed plaster on stone footings, not decorative half-timber) — plus per-rung text
and register findings. **No VETO criterion fails: the standing wall VETO is broken by rung 2.** After eight rolls
with no wall anywhere on screen, s0.45 renders a viewer-visible wall run with a gate the road passes through —
`walled-core`'s rendered-image test has its first yes. (The full ring remains unprovable from a single cart-height
view, as it always was; the town plan owns the ring, the render owes the viewer the wall.)

**Strongest cell: s0.45 — and it is the strongest cell of the entire nine-verdict loop on composition grounds.**
Wall, gate-with-passage, queue, led animals, painted river, contained town, open edge, on-law palette and the best
register, all in one frame for the first time. Its disqualifiers are the loop's two chronic single-lever problems
(fachwerk/brick materials; invoked signage text) plus one new probable era break (the lamp) — none of them
segment-specific. **s0.30 second**: the masonry-with-arch result is real but bridge-read, and register and palette
are off-law. **s0.60 third**: text-clean and structurally adherent, but the road register breaks and the wall read
weakens.

## Control-adherence — did the renders follow the label map?

| Base mass | Map evidence | s0.30 | s0.45 | s0.60 | Reading |
| --- | --- | --- | --- | --- | --- |
| Wall flank (cream strip) | `C6C2B6`, unoccluded, Δ≈(56,50,46) over row-right | **RENDERED AS MASONRY** (bridge-read) | **RENDERED AS A WALL RUN** | rendered as palisade/embankment | The label map's wall mass composes at every strength — 3/3, from 0/8 on the anchor path |
| Gate towers (two separated masses, real gap) | `6B5A40` both | **one tower rendered AT the road with a through-passage** | **tower at the gap, road passes through** | tower at the gap, passage weak | The gap opened the read on a third mechanism — gate-as-gate 3/3 positional |
| Mill-wheel disc | `3A2C1C` exact, lollipop on the south-tower post | dropped | dropped | dropped | 0/3 — the wheel gap persists on a third mechanism (see open question 3) |
| Mill column | `5C4A34`, lower half occluded by queue | dropped (houses) | dropped (manor) | dropped (house) | Column 0/3 positional — the straight segment pass does not carry it |
| Cart-queue wedge | `241F18` | **the queue** | **the queue** | **the queue** | 3/3, nine rolls running across paths |
| River band | `9AA4A8` distinct from far-bank `7D8288` | **PAINTED AS WATER** | **PAINTED AS WATER** | **PAINTED AS WATER** | 3/3 — the exact separation the depth map cannot encode is now painted at every strength |
| Race channel | `9AA4A8` sliver behind column | dropped | dropped | dropped | 0/3, nine rolls: below the survival floor on every carrier |
| Town rows / ground / led animals | taupe rows, ground patch | rows held | rows held | rows held | 3/3 |

**The measured pattern, one ladder of evidence:** the label map carries semantic *category* strongly (wall, gate,
queue, river, rows all land) but carries *object identity* weakly (column, wheel, race die at every strength — the
same shape-semantics result r3 measured on the colour base: a disc on a post and a bare column have no viewer
prior, and the sampler resolves them toward whatever the scene around them suggests). Adherence to category is
roughly flat 0.30→0.60 while **picture quality degrades gently** — register flattens, the road register breaks at
0.60 — instead of the 08-29 cliff (full collapse by 0.60). One new measured fact: **register on this path tracks
strength** (0.30 glossy-3D → 0.45 matte → 0.60 poster-flat), so the strength dial is itself the register lever here.
Note also that seed 12345 — the cel-lane attractor on the anchor path — renders painterly→matte on this path: the
per-seed register model from r3 is per-(seed, flow), and the confirmation roll will test whether lanes exist here
at all.

## The measured segment window

Same discipline as the depth window (0.30–0.40, `forge.config.json:160`) and the anchor denoise window (0.70–0.78):

- **0.30 — usable.** Full pictorial scene; all category masses honoured; river painted; no contamination found.
  Register (3D-glossy) and palette off-law.
- **0.45 — usable; RECOMMENDED OPERATING STRENGTH.** The best joint score of adherence × register × palette ×
  contamination on the ladder; no collapse; the only rung with an on-law palette.
- **0.60 — degrades; not recommended.** No 08-29-style collapse — the scene survives whole — but register
  flattens to poster, the road surface register breaks, and the wall read weakens. The top of the usable window is
  **measured at 0.45**; 0.50–0.55 is unmeasured and should not be assumed.
- Below 0.30 is unmeasured; the depth-path precedent (strength < 0.30 loses composition) may not transfer to a
  label map, and nothing in this ladder requires going lower.

**Data consequence (post-confirmation only):** `environment.segment.strength` (`forge.config.json:89-95`) should
move `null → 0.45` with a `_note` citing this window — but not before the confirmation roll lands (rail change 2).

## Ruling on the 2026-08-29 negative result — OVERTURNED, formally, on the mechanism

`ABP-segment-control.md` ruled three things: (1) no cell passed its acceptance bar; (2) the failure was a
**representation problem** — "neither carrier in this pipeline can hold that content… it is a representation
problem", attributed to the novelistic prose brief; (3) therefore the plan stops, `strength` stays `null`. Rerun
with fair inputs — the current map-accurate brief (briefHash b7658d8607bbbe70, per-mass `value` colour geometry,
`mustAssert`-bounded extent) at the corrected colour-anchor geometry — this ladder shows:

- The **representation premise is confirmed**: a label map + the brief's positive prompt composes the scene
  (queue, wall, gate, river, rows, edge co-occur 3/3) where the 08-29 cells never co-occurred even two of them.
- The **river is painted at every strength** — the exact separation the 08-29 doc proved impossible on depth and
  failed to get on segment is now 3/3.
- The 08-29 fatal artifacts are absent: **no lattice pylons** (08-29: both horizons), **no river-as-paved-road
  misread** (08-29: s0.45's failure mode), **no collapse at 0.60** (08-29: full collapse; here a degraded but
  whole scene).
- What did **not** change is the mechanism: same `SetUnionControlNetType "segment"` transport (verified on this
  install 2026-08-08), same `env.mjs` path. **What changed is the inputs** — brief accuracy and the colour-base
  geometry, exactly as the unpark decision anticipated.

**Ruling: the 08-29 negative result is overturned as a mechanism result.** The "the plan stops here / the
mechanism cannot carry the composition" holding is retired; `environment.segment` is a working carrier. The 08-29
doc's acceptance bar itself (which included the mill-wheel housing over the race and the both-bank town) is still
not met — the wheel is 0/3 here too — but that is the loop's known model-prior gap, shared with the anchor path,
and no longer evidence against the segment mechanism. `ABP-segment-control.md` should gain a pointer to this sheet
when the confirmation roll lands (not edited by this review).

## Minimal change set for the 3-seed confirmation roll

**Verdict: GO.** The mechanism is confirmed and the operating strength is measured; a 3-seed roll at s0.45 is the
proportionate next step. Change set:

1. **Nothing in the brief, the prompt, `mustAssert`, or the control map.** Byte-identical briefHash
   b7658d8607bbbe70; same segment map. The ladder is a fair test and s0.45 is its winner — introduce no variables.
2. Seeds **12345, 42424, 10001** at strength **0.45** — the same triple as the r3 anchor roll, for cross-path
   comparability (and because seed-lane behaviour on this path is genuinely unknown; see could-not-verify).
3. **Log model/steps/cfg/guidance on each ledger row** (rail 3, below) — this roll is the one to close that gap on,
   since its whole purpose is to pin a measured window into config.

## Rail changes (concrete data diffs)

- **Rail 3 — carried, FIFTH roll, and this sheet's top pick to close it.** Ledger render rows still carry neither
  `model` nor `steps`/`cfg`/`guidance` (re-verified against `runs/A1-ART-02.json:170-172`). Diff proposal: extend
  the render row with `"model","steps","cfg","guidance"` at write time in `env.mjs`; the env-index provenance test
  already round-trips the ledger, so the fields ride along for free.
- **Rail segment-strength pin — PROPOSED, conditional.** After the confirmation roll passes review:
  `forge.config.json:91` `"strength": null` → `"strength": 0.45`, `_note` += "measured 2026-08-30 segment ladder
  (reviews/2026-08-30-millcross-segment-unpark-ladder-verdict.md): usable 0.30–0.45, operating 0.45, ≥0.60
  degrades." Do **not** land before that roll; `env.mjs`'s refuse-without-`--strength` guard stays until then.
- **Artifact-gate flagged classes — third instance of the r3 class.** R3 proposed "free-standing white box-like
  objects adjacent to structures" (the 10001 cabinet, two rolls). Add alongside it, same flagged-not-fail class:
  **Victorian-register lamp posts** and **bin-like objects on posts** (s0.45, both at the gate). Wording for
  `content/world/town-criteria.json` or the lint gate: `{"id": "era-ambiguous-props", "check": "flag
  free-standing white box objects, lamp posts with closed globe heads, and bin-like objects on posts; fail only on
  a second flag in one cell"}`.
- **Documentation fix (no behaviour change):** the persona reading list (`.claude/agents/town-canon-reviewer.md`
  item 6) cites `content/towns/town-criteria.json`; the file is `content/world/town-criteria.json`.
- **No new rails.** The materials failure is a brief/prompt-vocabulary problem already owned by REVIEWER v1.2
  (:156) and the standing change sets; nothing about the segment path is silent about it.

## Open questions for the owner

1. **Confirm the 3-seed roll at s0.45.** Recommendation: **yes, GO** — change set above; it is the last
   measurement before the config pin.
2. **Path primacy if the confirmation roll holds.** The segment path broke the wall VETO in one roll where the
   anchor path needed nine; the anchor path still owns the only true wheel. If s0.45's register reproduces across
   seeds, recommend making the **segment pass the default concept-pass carrier** and reserving the colour-base
   anchor flow for wheel-critical subjects — owner's call after the roll, not before.
3. **The wheel on the segment path (0/3).** The wheel lever was proven on the colour-base anchor flow (r3: 42424's
   spoked wheel). Options: (a) judge the segment confirmation on the non-wheel criteria and keep the wheel an
   anchor-flow lever; (b) author a combined flow (segment for categories + img2img anchor for the wheel). My
   recommendation: **(a) for now** — do not spend the confirmation roll's simplicity on a hybrid.
4. **The known open contradiction (`quests.json` "Meet the road at the gate" for wall-less Millcross) — do not
   close silently.** s0.45 makes the quest's gate referent visually real for the first time; the G5-class item's
   resolution (canon.md §6: fix the content or amend canon deliberately in the same commit) now has a render to
   check against. No action this review; flagged so the segment result is not read as having settled it.

## What this review could not verify

- briefHash `b7658d8607bbbe70` was not recomputed locally (running the generator is outside review scope);
  verified by ledger internal consistency (all three ladder rows carry it) plus the env-index provenance test
  (7/7, run against the same run log).
- Per-render sampler parameters (20 steps / cfg 1 / guidance 5.0): taken from `forge.config.json:162-164` defaults
  and the handoff, not from per-render logs — rail 3's gap, five rolls standing.
- The composed positive string actually sent per render is not logged; the register-clean claim rests on code
  reading (`env.mjs:295-302`) + prompt-lint exit 0 this review.
- The 08-29 ladder's brief blob no longer exists on disk to diff; the "fair inputs" framing rests on the brief's
  `_note` history and the current brief's structure — taken as served, and stated as an assumption, not a
  measurement.
- **s0.30's arched structure: bridge over the river vs water-gate over the race — unresolved at 2.2×.** If it is a
  river bridge, `one-cart-crossing`'s rendered no-rival-crossing record (9/9 across paths) takes its first
  asterisk; if a race arch, the row is clean. The confirmation roll should crop this region by default.
- **s0.45's lamp: Victorian gas lamp vs period oil-lamppost — probable era break**, alternative read survives at
  4×; the cell REJECTs regardless.
- Whether the per-seed register attractors observed on the anchor path exist on the segment path at all: one seed,
  three strengths, is not enough — the confirmation roll is the experiment.
- The exact structure count against mustAssert "a dozen and a half structures": occlusion at cart height defeats a
  reliable count in all three cells (visually plausible in s0.45, ~a dozen visible); UNVERIFIED, as in every prior
  roll.
- The 08-29 mid-window cells (s0.30/0.45/0.60) no longer exist on disk (overwritten by this ladder, per the
  env-index note quoted above); the 08-29 verdicts for them rest on that campaign's recorded verdicts and ledger,
  not on viewable pixels. The surviving 08-29 cells (s0.00/0.75/0.90) were verified to exist at the documented
  sizes, not pixel-re-reviewed against their 08-29 verdict text.
