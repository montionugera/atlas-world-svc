# World Rescale to 400×400 (I-095) — Design

**Date:** 2026-08-15
**Status:** Approved (owner, 2026-08-15: "APprove" on the ÷5 scale model; "forget about story, let focus on make the world make sense")
**Origin:** The owner's scale audit: world ≤ 400×400 km end-to-end, town-to-town ≤ 2 h (~12–24 km at 11 km/h), towns 0.5–2 km. The committed 2000×2000 frame fails all three at the travel-math level.

## 1. The scale contract (locked)

- **S = 0.2 (÷5) on all inter-town/world geography coordinates** — placements, anchors, feature points, edge polylines, `absoluteAnchor`, `labelAt`, road `roadKm`/`straightKm`, interior sizes/origins of GEOGRAPHY tiers (world/continent/ocean/region/sea/playspace).
- **Towns keep physical size**: town-tier `placement` polygons keep their absolute km dimensions, re-centered on the ÷5-scaled anchor. `KM_TO_U = 100` unchanged; town plans (u) byte-identical; `deriveInterior` town path unaffected.
- **Canonical travel math**: 11 km/h walk. Resulting distances: war towns 6 km (33 min), Millcross→Embervale 11 km (1 h), Gildmark legs 17–19 km (≤1.7 h), longest haul 38 km (3.5 h). All owner targets met.
- Day-count edge attrs (`days`, `daysLabel`, `canonDays`) re-labeled to **hours** (`hours`, `hoursLabel`; derived: roadKm÷5 at 11 km/h, rounded to halves). Story-prose re-voicing (novel, A-docs day references) is **explicitly deferred** to a follow-up pass — mark touched contradictions `AMENDED-PENDING (I-095)` instead of rewriting prose.

## 2. Mechanics

1. **Transform script** `scripts/rescale_spine.mjs` (one-shot, committed for provenance): reads every spine node + edges.json, applies S to geography tiers, re-centers town polygons (scale anchor, translate polygon to keep dimensions), rewrites roadKm/straightKm/hour attrs; `n-atlas` rect → `{x:0,y:0,w:400,h:400}`, interior size [400,400]. Deterministic, idempotent-guarded (refuses if frame already 400).
2. **Gate constants table** (each with a one-line why, same commit): relay sight-line 10 km → **2 km**; `SPINE_CELL_KM` 0.25 → **0.05** (same relative sampling resolution); leg tolerance ±8% unchanged (relative); G-CONTAIN/overlap unchanged (relative). Any test pinning absolute km re-pins deliberately.
3. **World tier regen**: re-run `gen-world` against the 400 frame with the budget table ÷25 by area (land ~3,200 km² total incl. 1,140 km² basin; majors ~800/700 km², chains 40–160 km², cap ~3,200 km², oceans partition the rest). Names/lore/panel verdicts carry over (same nodes, same ids — the panel doc gains a rescale addendum, no new panel). Sea passage Gildmark→Tallowquay ≈ 140–180 km; lane attrs re-labeled (sail-days: 1–2).
4. **Composition recompute**: `check_spine_emit --write` refreshes all derived blocks; committed compositions amended to computed truth where towns' unscaled footprints shift ratios (basin `built` rises; world ocean ≈ 97%). `G-ATLAS-ROLLUP` committed targets on `n-atlas` amended to the new truth in the same commit (red-then-green re-proven).
5. **Charts**: `ATLAS_PX_PER_KM` 0.7 → **3.5** (same canvas size, 5× denser); basin sheet constants likewise; both sheets re-rendered + re-pinned (G-MAP-DRIFT, baseline fixtures, parity tests — deliberate re-pins with mutation-proof preserved).
6. **Storybook**: nothing to change (parity gate covers the re-rendered sheets automatically) — observability rule holds.

## 3. Out of scope

Story-prose re-voicing (novel, canon.md distance prose, A-doc day-counts) beyond AMENDED-PENDING markers; runtime map/unit changes (u-world untouched); overworld traversal gameplay; town plan changes.

## 4. Acceptance criteria

1. `n-atlas` frame is 400×400; every geography coordinate scaled by exactly 0.2; town polygons keep pre-rescale dimensions (assert: per-town bbox w/h unchanged within 0.1 km).
2. All spine gates green with the new constants table; every re-pinned test proven by mutation (revert one node → red).
3. World regen deterministic at the new frame; `G-ATLAS-ROLLUP` green against amended targets, red-fixture updated.
4. Both sheets re-rendered, committed, G-MAP-DRIFT clean; basin sheet visibly denser (visual pass on the FULL sheet, both charts, controller-verified).
5. Travel table in the spec reproduced by a test: for each committed road edge, hours = roadKm/11 within rounding; all ≤ 2 h except the Cindervast haul.
6. Precheck 13/13; storybook parity gate green; Maps tab serves the re-rendered sheets.
