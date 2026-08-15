# F-043 — The Wider World: three-role panel verdict

**Date:** 2026-08-14
**Feature:** F-043 world-scale geography — seeded continent generator, hand-polished and promoted into the real spine.
**Panel:** Namer (naming register + collision check), Archivist (canon collision audit), Systems (budget/composition verification).
**Scope of this document:** Task 3 (promotion) only. It records what the panel ruled and what promotion applied mechanically. Rows touching `docs/` amendments belong to Task 7 (canon amendment, DR-006) and are marked "routed to Task 7" below — not applied here.

---

## Per-node verdict table

All 15 candidate nodes promoted from `content/spine/candidates/*.json` into `content/spine/nodes/*.json`. `provenance.authored` set to `"hand"` (generator object kept for traceability). Ids renamed per DR-004 (permanent public names); everything else derives from the Namer + Archivist rulings below.

| node id (final) | title | verdict | note |
|---|---|---|---|
| n-coldreach | Coldreach | ACCEPT | Continent; id unchanged. Composition/placement untouched from generator; title+lore from Namer table. |
| n-coldreach-shore | the Coldreach Shore | ACCEPT | Renamed from n-coldreach-shore-1. Coastal region, reported-only voice. |
| n-peatrun-coast | the Peatrun Coast | ACCEPT | Renamed from n-coldreach-coast-0. |
| n-coldreach-interior | the Coldreach Interior | ACCEPT | Id unchanged. compositionTolerance=10 applied (Archivist #9). |
| n-stonemoor | Stonemoor | ACCEPT | Continent; id unchanged. |
| n-stonemoor-shore | the Stonemoor Shore | ACCEPT | Renamed from n-stonemoor-shore-1. |
| n-slateflow-coast | the Slateflow Coast | ACCEPT | Renamed from n-stonemoor-coast-0. |
| n-stonemoor-interior | the Stonemoor Interior | ACCEPT | Id unchanged. compositionTolerance=10 applied (Archivist #10). |
| n-rimewall-cap | the Rimewall Cap | ACCEPT | Renamed from n-harrowreach-cap. compositionTolerance=10 applied; tooling-voice lore rewritten (Archivist #11 — resolved by Namer's replacement summary, which drops "world frame"). |
| n-driftholt | Driftholt | ACCEPT | Renamed from n-rookwick. Archipelago chain. |
| n-reedstrand | Reedstrand | ACCEPT | Renamed from n-stonehollow. Archipelago chain. |
| n-brightfall | Brightfall | ACCEPT | Id unchanged. Archipelago chain. |
| n-keelbreak | The Keelbreak Sea | ACCEPT | Renamed from n-rookmark. "seams" tooling voice removed by Namer's replacement summary (Archivist #12). |
| n-galereach | The Galereach Sea | ACCEPT | Id unchanged. Same #12 resolution. |
| n-tarnmark | The Tarnmark Sea | ACCEPT | Id unchanged. Same #12 resolution. |

Two sea-lane edges appended to `content/spine/edges.json` after the existing `e-sea-lane` entry (order preserved, per Archivist's "keeps the first-sealane mirror" ruling):

| edge id | verdict | note |
|---|---|---|
| e-lane-coldreach | ACCEPT | Label/note rewritten to state this is the SAME once-a-year trade-wind voyage as `e-sea-lane` (Archivist #1), not a second service. Terminus renamed to `f-port-tallowquay`. |
| e-lane-stonemoor-foreign | ACCEPT | Season/note rephrased as reported ("mariners say it runs the year round"), not asserted as fact (Archivist #14). Termini renamed to `f-port-tallowquay` / `f-port-netstead`. |

`content/spine/nodes/n-atlas.json`: `interstitialUnsurveyed` → `false`, `interstitial` → `{"ocean": 100}` (hand-edited, everything else untouched; `derived` refreshed by the emitter). `content/spine/load-budget.json` bumped to `{"maxNodes": 48, "maxBytes": 393216}` per Systems' blocking item #1.

**Basin integrity:** `content/maps/cluster1-geography.json`, `content/spine/nodes/n-cluster1.json`, `content/spine/nodes/n-westsea.json` are byte-identical to their pre-promotion state (`git diff --exit-code` clean) — this promotion is additive-only to the basin.

---

## Namer — register attestation (copied verbatim from `panel-namer.md`)

Authority: `content/story/style.md` §2 (Ashen Vigil: terse noun+noun compounds, no titles, no of-constructions). Collision list checked: `content/story/regions.json`, every `content/spine/nodes/*.json` title, A1 coinages (the Meltwash, the Saltmire, Meltwash Terrace, Emberdown, Hollowmarch, Gildmark Head). Title conventions followed: continents bare (`Millcross` pattern); seas `The <Name> Sea` (per `The West Sea`); ice cap `the <Name> Cap` (lowercase-the, per `the Saltmire`); regions `the <X> Coast/Shore/Interior`.

Every final name was checked against style.md §2 (terse two-noun compound, no titles, no of-constructions, no Gilded-Rot "the"-as-office), against the full collision list (regions.json, all spine node titles, A1's six coinages), and G7 (no real-world place/people/institution, no near-homophone). Rejections and near-misses:

- **Rooktide** (n-brightfall c3) — existing town; hard reject. **Rookwick / Rookmark / Rookstrand / Rookfall** — Rook- is Rooktide's distinctive first element; near-echo, all rejected.
- **Harrowreach** — Harrow is a real London borough (G7); would also be a third fused -reach. **Tarnreach** — reach echo + Tarn reserved for the sea. **Coldfall** — Coldfall Wood is a real London place (G7) + Cold- echoes Coldreach. Cap renamed **Rimewall** (rime + wall, fresh morphemes).
- **Stonehollow / Tarnhollow** — -hollow echoes Norhollow and Hollowmarch; took candidate-2 **Reedstrand**.
- **Driftmark** — Drift- would echo Driftholt, -mark duplicates Tarnmark (and it is a well-known fictional seat). **Reedmark / Reedstead** — Reed- echoes Reedstrand. West sea coined fresh: **Keelbreak**.
- **Blackrun** (own draft, Coldreach river) — near-homophone of Blackburn (real city); replaced with **the Peatrun**.
- **Farwick / Coldwick / Saltwick** (own drafts, port) — every -wick coinage sat one letter from a real toponym (Warwick, Colwick, Saltwick Bay); replaced with **Tallowquay** (tallow + quay; "tallow" appears in canon only as a Millcross palette *word*, not a name — no collision).
- Accepted with note: **Stonemoor** (vs real Stanmore — different vowel and stress, transparent stone+moor compound); **Tarnmark** (vs Danmark — different onset and vowel; tarn is a plain English noun); **Brightfall** (vs Brightwell — distinct second element); **Coldreach + Galereach** share only the -reach suffix (generic geographic suffix, same class as canon's repeated Ford/Head/Terrace generics; first elements fully distinct); **Spine** repeated twice as a chart generic of that same class, marking sibling features of two unrelated continents.
- Duplicate-candidate trap noted in the brief: **Tarnmark** appeared under both n-rookmark and n-tarnmark; assigned once, to n-tarnmark.

**Outlying isles** (`f-*-isle-*`, `attrs.name: null`): left deliberately unnamed — they exist only by mariners' report, and an unnamed mark on a chart is the honest register for that. Applied as-is; only their ids were renamed to match their renamed parent chain (`f-driftholt-isle-*`, `f-reedstrand-isle-*`).

---

## Archivist — collision table dispositions

| # | collision | required amendment | disposition |
|---|---|---|---|
| 1 | `e-lane-coldreach` drops the "once a year" frequency | label/note must state SAME once-a-year voyage, not a second service | **applied-here** — edge label/note rewritten |
| 2 | pass shut by a dead city — no candidate touches it | no amendment | **applied-here** (no-op, confirmed) |
| 3 | V8 "sister towns have neither ships nor ports" | V8 row stays untouched; canon.md gains a bullet | **routed-to-Task-7** (canon.md edit) |
| 4 | canon.md:212 "only deepwater port on this coast" | none, wording survives | **applied-here** (no-op, confirmed — foreign ports are on other coasts) |
| 5 | A0:402 G18 "nothing is named..." | G18 row gains PARTIALLY RESOLVED marker | **routed-to-Task-7** (A0-current-world.md edit) |
| 6 | A0:464 "nothing beyond that sentence has been spent" | append marker + clarifier line | **routed-to-Task-7** (A0-current-world.md edit) |
| 7 | A1:445-446 "map ends where the ice starts moving" | trailing clarifier on A1 | **routed-to-Task-7** (A1-geography-cluster1.md edit) |
| 8 | A1:485-486 "does not pretend to know what is past the ice" | same clarifier on A1-ART-01 brief | **routed-to-Task-7** (A1-geography-cluster1.md edit) |
| 9 | n-coldreach-interior precise composition on "unsurveyed" node | compositionTolerance + toleranceWhy | **applied-here** — `compositionTolerance: 10`, `toleranceWhy: "mariners' report, not surveyed — a chartman's allowance, not a survey figure"` |
| 10 | n-rimewall-cap (was n-harrowreach-cap) precise rock fraction | same tolerance/why treatment | **applied-here** — same tolerance/why applied |
| 11 | n-rimewall-cap lore "world frame's northern edge" (tooling voice) | rewrite in-world | **applied-here** — resolved: Namer's replacement `lore.summary` ("Every master who has run far enough north reports the same white wall...") drops "world frame" entirely, so the tooling-voice phrase no longer exists on the node |
| 12 | n-galereach/n-keelbreak/n-tarnmark lore "between the charted seams" (tooling voice) | rewrite as "between the charted coasts" | **applied-here** — resolved the same way: Namer's replacement summaries for all three oceans drop "seams" entirely |
| 13 | `f-port-coldreach` name null | Namer fills port names; attribute to mariners' usage | **applied-here** — ids renamed to `f-port-tallowquay`/`f-port-netstead`, `attrs.name` filled, lane termini updated |
| 14 | `e-lane-stonemoor-foreign` asserts a schedule as fact | phrase as reported | **applied-here** — note rewritten: "Mariners say it runs the year round — no log from Gildmark confirms the claim." |

Rows 3, 5, 6, 7, 8 and the A2 doc creation are **Task 7's** (canon amendment, DR-006) — not touched by this promotion.

No FAIL verdicts in the per-node canon-safety table; V8 survives untouched; the pass stays shut.

---

## Systems — budget verification (PASS table)

Recomputed independently via `scripts/lib/spine.mjs` post-promotion.

| Check | Computed | Target | Verdict |
|---|---|---|---|
| n-atlas composition rollup | ocean=96.1% rock=0.9% ice=1.9% | 96/2/2 ±2pp | PASS |
| n-atlas rollupVerdict | CHECKED | CHECKED | PASS |
| Node count | 44 (29 existing + 15 promoted) | ≤48 | PASS |
| Load-budget file | `{maxNodes:48, maxBytes:393216}` | bumped per Systems blocking item #1 | PASS (committed, no longer synthetic-only) |
| Coverage/UNCHECKED | 0 UNCHECKED (CHECKED=4, ASSERTED=40) | maxUnchecked=2 | PASS |
| Basin byte-identity | `git diff` clean on cluster1-geography.json, n-cluster1.json, n-westsea.json | must be clean | PASS |
| G-EMIT-DRIFT | `check_spine_emit.mjs --check` → "check clean, 47 files" | clean | PASS |
| G-ID / G-SEED / G-POLY / G-COMP-ROLLUP / G-LOAD-BUDGET (real content root) | `check_content.mjs --only=spine` exit 0, 0 failures | 0 failures | PASS |

Systems' second blocking item (confirm two live Gildmark sea-lanes — old `e-sea-lane` + new `e-lane-coldreach` — is intended lore, not a stale duplicate) is confirmed intended: Archivist row #1 explicitly rules that `e-lane-coldreach` is the *same* once-a-year voyage as `e-sea-lane`, now with its far end charted, not a second lane. Both edges coexist by design.

---

## Known concern (not blocking promotion, reported per Task 3 step 8)

`tools/mapforge/tests/gen-world.test.mjs` — both tests now fail. `gen-world.mjs`'s synthetic-root builder merges the REAL content root's nodes with a freshly-regenerated candidate set from `buildWorld()`. Before promotion, `content/spine/nodes/` had no F-043 nodes, so the merge was collision-free. After promotion, the real root already contains the promoted nodes (7 with unchanged ids: n-coldreach, n-stonemoor, n-brightfall, n-galereach, n-tarnmark, n-coldreach-interior, n-stonemoor-interior; 8 with renamed ids), and `buildWorld()` still deterministically regenerates the *original* candidate set on every run — so the synthetic root now doubles up every F-043 landmass (52 nodes instead of 44, duplicate seeds, self-overlap, budget/composition failures). This is the generator test asserting against a root shape that Task 3 intentionally changed; the generator itself (`tools/mapforge/lib/world-gen.mjs`) was not modified. Per this task's brief, this is reported here rather than patched — it is a Task 4/6 concern (the synthetic-root builder needs to exclude nodes already promoted, or gen-world.mjs's test scope needs revisiting) since patching the test or the generator is out of scope for a promotion task.
