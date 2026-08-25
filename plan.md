# F-049 — World Fill Plan D: Pinned Places, Bound Records and Relations

**This file is a pointer. The real plan is elsewhere. Do not implement from this file.**

| What | Where |
| --- | --- |
| **The plan you implement** | `docs/superpowers/plans/2026-08-16-world-fill-d-pinned-bound-relations.md` |
| **Read BEFORE any task** | `docs/superpowers/plans/world-fill-STATE.md` — running handover state, measured baselines, the traps (161 confirmed plan-vs-repo divergences; several are filed as Plan D hazards / Consumes-block entries) |
| **Approved design** | `docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md` |
| Backlog spec stub | `.claude/refined_backlog/F-049-world-fill-plan-d-pinned-places-bound-re/spec.md` |

## The one-line goal

Join hand-authored meaning onto the generated land: ~40 pinned places the generator must
honour (`G-PIN-SAT` against per-pin fabric receipts), 336 bound landmark records that carry
a stable generated handle + size band and no coordinate anywhere (`G-BIND` + `G-HANDLE-BAND`),
60 dungeon complexes / 190 floors within 2 region-hops of a settlement (`G-DUNGEON-REACH`),
a machine-checkable relation layer with prose citations, and `G-MEANING` — which re-derives
every declared claim and fails naming the citation and drifted value.

## Known hazards carried in from Plan C (from STATE — do not re-derive)

- The six canon towns pin at committed `absoluteAnchor` + shared `PIN_OFFSET = [81, 129]`
  (= `c02.footprint.centreKm - n-cluster1.placement.anchor`). No canon distance is re-derived.
- Netstead's capital pin lands on c04 Stonemoor, which has ZERO port-eligible cells.
- `pinReceipts.measured.shelterFetchKm` must read `narrowWaterKm` (min-over-axes), never
  `grid.fetchKm` (max-over-axes) — the max reading is unsatisfiable at 332 of 520 port cells
  and at all three generated capitals.
- Pin shape includes `title`; a titleless pin throws (`placeSettlements`, `townSlug`).
- `hopsToSettlement` stays typed `["integer","null"]` in `fabric-file.schema.json`.
- `pinReceipts[]` headroom: largest fabric file is at 93.1% of its 262,144 B cap with fractal
  coast OFF; receipts must fit what remains.

## Non-negotiables (same as Plans A-C)

- Zero bytes change in the game's spine, maps, sheets or server outside this plan's declared
  surfaces; the migration invariant holds per-commit against the right baseline tag.
- Every phase ends with the quality gate: implement -> verify by running the real command ->
  independent adversarial review of that phase's diff -> refactor on findings -> re-verify.
- Mutation-test every gate rule: delete the rule, re-run, the suite must go red.
- Every produced artifact is observable in the asset-storybook as part of its producing task.
