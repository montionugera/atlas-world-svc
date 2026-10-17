# Review · A1-ART-02 Millcross — race-channel geometry re-prescription for mill-emphasis-r2 (race-slot fix) — verdict

**Date:** 2026-09-01 · **Reviewer role:** Town Canon & Plausibility Reviewer · Verdict #16 in the loop; rail (b)
re-prescription only (verdict #15 `reviews/2026-09-01-millcross-mill-emphasis-verdict.md` rail b was found
structurally undeliverable by the loop's pre-roll block-in verification). One question: which geometry fix
delivers the race as a distinct open-water slot, and at what roll parameters.

**Goal (verbatim):** re-prescribe the race-channel geometry for the mill-emphasis-r2 cell.

**Measured basis (re-verified this review):** brief `tools/art-forge/briefs/A1-ART-02.json` masses/plane
order; `tools/art-forge/generate/blockin.mjs` — depth renderer paints per-PLANE bucket (`buildDepthSvg`
:92-95, `PLANE_DEPTH[plane]`, per-mass values ignored), segment renderer paints per-mass value (:262-264),
paint order = plane buckets bg→mg→fg, array order within plane; separation metric = Chebyshev max-channel,
advisory (`SEGMENT_MIN_SEPARATION = 24`, :181, :214). Occlusion recomputed from rects: housing [0.45,0.28,
0.54,0.90] eats race x 0.52-0.54 at ALL race y; town-row-right [0.55,0.66,0.99,0.90]; gate-tower-west-s
[0.58,0.62,0.63,0.92]; wall-flank-right [0.55,0.82,0.99,0.93]; mill-wheel 12-gon r 0.105 at [0.555,0.585];
cart-queue fg lobe x 0.45-0.53 y 0.64-0.74 + wedge to (0.62,1.04).

## Verdicts

| # | Criterion | Verdict | Evidence · one sentence |
| --- | --- | --- | --- |
| 1 | Rail (b) fix choice | **(b) — lift race-channel to mg, last before wheel** | see prescription below; (a) impossible (mg covers x 0.38-0.99 × y 0.62-0.93 — no clear corridor near the mill), (c) still collapses to ≈0.5% (south gate tower eats x 0.58-0.60 y 0.62-0.92, wall flank eats y 0.82-0.90 — a 3-mass cascade for no gain), (d) rejected on canon (A1 §6:360 "the great wooden wheel turning in the open race" — the open race is canon, not taste; verdict #15 Pass 2 already ruled a race-less mill reads as a mounted wheel against a parapet) |
| 2 | Race value #56616b | **RATIFY** | Chebyshev vs all 12 masses recomputed: min 39 (far-bank), next 43 (gate towers) — clears 24 with margin; darker than river #9aa4a8 by 68; ash-grey family per style.md §3 palette law |
| 3 | housing↔wheel Chebyshev 16 | **PRESCRIBE FIX** | lighten `millwheel-housing` #4a3a28 → **#53412b** (vs wheel 25, vs gate towers 25, all others ≥47); do NOT darken the wheel — cart-queue #241f18 is already only 22 Chebyshev below #3a2c1c and darkening collapses that pair; the pair shares a boundary (wheel's left rim over the housing face), so the warning's "never share a boundary" intentional-out does not apply |
| 4 | wheel↔queue Chebyshev 22 (filed finding) | **INTENTIONAL-CONFIRM** | fg queue paints over the wheel's lower-left rim (carts in front — physically right); wheel identity is carried by the race-facing rim (79) and row-facing rim (90); never darken the wheel toward the queue |
| 5 | Depth-path race semantics | **DEPTH TRUTH CORRECTION** | as bg the race encoded a depth lie (near water painted far-dark); as mg the depth map paints it in the near bucket — correct; the distinct-darker-slot acceptance therefore rides the SEGMENT path, where per-mass labels are the mechanism (the depth path could never serve it — 3 bucket greys) |

## The prescription (exact numbers)

1. `race-channel`: plane `"bg"` → `"mg"`; rect `[0.52, 0.55, 0.6, 0.9]` → **`[0.53, 0.63, 0.60, 0.90]`**;
   array position: **last mg mass, immediately before `mill-wheel`** (after `gate-tower-west-s`).
   - Left edge 0.53 laps the housing's right wall (1% waterline stripe, kills the abutment seam; "the
     mill-wheel housing over the race", A1 §6).
   - Top edge 0.63 = river-band top: the mouth meets the river with no far-side poke above the far-bank
     (the wheel arc covers y 0.63-0.69 of the band; water emerges from under the wheel).
   - Must paint after town-row-right, wall-flank-right and gate-tower-west-s (its only remaining occluders)
     or it re-collapses to the 1% slot; must paint before mill-wheel ("wheel turning IN the open race").
   - Net visible (segment block-in): x 0.53-0.60 × y 0.69-0.90 minus the queue wedge ≈ **1.4% of frame,
     ≈7% wide (≈90 px at 1280)** vs today's ≈0.63% 1%-wide sliver.
2. Keep value **#56616b** (ratified, row 2).
3. `millwheel-housing` value #4a3a28 → **#53412b** (row 3).
4. r2 roll: **rolltag `mill-emphasis-r2`, seed 12345, control `"segment"`, strength 0.45** (the pinned
   measured operating strength, `forge.config.json:89-95`). Rationale: both failing values (housing dark,
   race dark slot) are structurally undeliverable on the depth path (per-plane bucket paint); the segment
   path is the measured path where labels land. Named risk: wheel re-render on segment is unmeasured
   (segment-confirmation verdict line 242) — this cell tests race-slot + wheel-on-segment together; if the
   wheel regresses on segment, the depth path keeps the geometry win.
   Carried acceptance bar (from verdict #15, unchanged): race slot legible as darker open water + wheel
   present over it + housing dark timber register + era check at frame edges + fachwerk-watch right row +
   queue present.

## Open questions for the owner

- None new. The G5 quest contradiction ("Meet the road at the gate" vs wall-less Millcross) stays carried,
  untouched, as every verdict has.

## What this review could not verify

- Nothing rendered — this is a data/geometry prescription; the r2 block-in probes (loop's pre-roll
  verification, rail d) remain the pixel-level evidence before the cell is spent.
