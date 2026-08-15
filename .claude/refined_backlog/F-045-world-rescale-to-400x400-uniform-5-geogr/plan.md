# F-045 World Rescale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rescale the world to a 400×400 km frame — uniform ÷5 on geography, towns keep physical size, hour-scale travel — per the approved spec `docs/superpowers/specs/2026-08-15-world-rescale-design.md` (READ IT FIRST; its §1–§2 carry the exact locked values; its §4 the acceptance criteria).

**Architecture:** one deterministic transform script rewrites the spine; gate constants scale with a committed why-table; the world tier regenerates at the new frame; both charts re-render denser; every re-pin is mutation-proven.

## Global Constraints

- The spec's scale contract §1 is law: S = 0.2 on geography tiers; town polygons keep absolute dimensions re-centered on scaled anchors; `KM_TO_U = 100` unchanged; town plans byte-identical.
- Deterministic everywhere; no Date/Math.random. Foreground commands only (timeout 600000) — never park on background jobs.
- Every test re-pin must be mutation-proven (break it once, watch red, restore). A green suite must stay a covering suite.
- `check_spine_emit.mjs --write` owns derived blocks — never hand-write them. Canon-citation repairs by quoted text, never arithmetic.
- Story prose untouched except `AMENDED-PENDING (I-095)` markers (spec §1 last bullet).
- Commit per task, conventional subjects, never --amend. Branch feat/F-045 (release/1.8 merged in).

### Task 1: Transform script + travel test
Files: create `scripts/rescale_spine.mjs` + `scripts/tests/rescale.test.mjs`; modifies all `content/spine/nodes/*.json` + `edges.json` when run.
Core transform (per spec §2.1): geography tiers (world/continent/ocean/region/sea/playspace/fixture) scale every coordinate pair ×0.2 (r1-rounded); town tier: `anchor ×0.2`, polygon translated by `(newAnchor − oldAnchor)` with vertex offsets from old anchor PRESERVED (bbox w/h unchanged); `interior` size/originInParent scale for geography tiers only (recompute origin from scaled bbox); road/leg attrs: `roadKm/straightKm ×0.2`, `days/daysLabel/canonDays` → `hours/hoursLabel` at 11 km/h rounded to halves; sealane `passageDays` → `sailDays` 1–2; `n-atlas` rect/interior → 400. Idempotence guard: refuse if `n-atlas` w === 400. Steps: TDD (travel-table test per spec AC 5 + town-bbox-invariance test per AC 1, red first via fixture copy), implement, run script ON REAL CONTENT, `check_spine_emit --write`, commit content + script together.
### Task 2: Gate constants + re-pins
Per spec §2.2: relay sight-line 10→2 km, `SPINE_CELL_KM` 0.25→0.05 (each with a why-comment); run `--only=spine` and full suite; deliberately re-pin every failing content-shape/gate test (list each in the report with its mutation proof). G-ATLAS-ROLLUP committed targets amended (spec §2.4) with red-fixture updated.
### Task 3: World regen at 400
Per spec §2.3: scale `world-gen.mjs` template constants ÷5 (frame, seams, bays, target areas ÷25, margins, cap abutment [30, 0..~2.8]), regen via gen-world, promotion carries names/lore/ids over (same files, new geometry), panel doc gains a rescale addendum, `gen-world` tests stay green (pre-world root logic unchanged).
### Task 4: Charts re-render
Per spec §2.5: `ATLAS_PX_PER_KM` 0.7→3.5; basin sheet px-per-km ×5 likewise (check its constant name in basin-sheet.mjs); re-render both sheets, re-pin baseline fixtures + parity + `check_map_render` artifacts; basin byte-parity tests re-pinned deliberately (this feature DOES change the basin sheet — density, not content). CONTROLLER visual pass on both FULL sheets before commit (chrome-burial lesson).
### Task 5: Sweep + ship
AMENDED-PENDING markers on touched day-count contradictions (A1/canon distance tables — markers only, quoted-text located); precheck 13/13; storybook parity green; ship via psrw (fresh worktree: `cd scripts && npm install` first — the known trap).
