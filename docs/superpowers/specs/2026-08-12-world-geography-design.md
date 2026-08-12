# World-Scale Geography (I-092) — Design

**Date:** 2026-08-12
**Idea:** I-092 — seeded continent/ocean generation from the n-atlas seed + composition, hand-polished into canon
**Status:** Approved design (owner, 2026-08-12) — awaiting plan
**Origin:** Owner reaction to the shipped F-042 world sheet: *"I want complete high level map not emptiness."* The renderer works; the world-scale content does not exist. This feature authors it.

## 1. Goal

Fill the `n-atlas` world frame with **rich, named, canon-committed high-level geography** — continents, regions, oceans, ice, sea-lanes — generated deterministically from the existing world seed, then hand-polished by a worldbuilding pass, so the F-042 world sheet renders a **complete map** instead of honest emptiness.

Scope decisions made with the owner (2026-08-12):

- **Method:** seeded generation + hand polish (generator drafts, humans/panel canonize).
- **Richness:** continents **with named tier-2 regions** and map-scale features — not bare outlines, but interiors stay explicitly unsurveyed.
- **Voice:** the world sheet becomes a **compiled mariners' chart** (Bellfaith survey for the basin + reported foreign coasts), keeping the map-as-artifact tradition. Canon amended under DR-006 (option 3), collision fixes in the same commit.

## 2. Content budget (from committed data, not invention)

`n-atlas` composition is already canon: **96% ocean, 2% rock, 2% ice** over 2000×2000 km (4,000,000 km²). Targets:

| Element | Budget | Notes |
| --- | --- | --- |
| Land (non-ice) total | ~80,000 km² (2%) | includes the existing 26,017 km² cluster-1 continent |
| New landmasses | ~54,000 km² | **2 major continents** (~15,000–22,000 km² each) + **2–4 archipelago chains** (~1,000–4,000 km² each) |
| Ice cap | ~80,000 km² (2%) | one polar cap anchored on the north edge, continuous with the basin's ice shelf |
| Oceans/seas | remainder | the existing `n-westsea` plus **2–3 named ocean/sea nodes** partitioning open water |
| Regions | 2–4 per new continent, tier-2 | named, coastal-biased; interiors lumped as one "unsurveyed interior" region each |
| Features | 1–2 per continent | line/point features on the continent node: a mountain ridge, a great river mouth, a reef line |
| Sea-lanes | ≥2 `sealane` edges | at least the canonical Gildmark annual lane now terminates at a REAL named foreign port; edges carry season + passage-days attrs |
| Lore | 1 line per named node | "reported, not surveyed" hooks; no interior detail (F-033 lesson: added specificity is the fastest canon contradiction) |

After generation, `deriveNode(n-atlas)` area-weighted rollup must match the committed 96/2/2 composition within **±2 percentage points per biome**, and coverage of the frame approaches 100% (open-water nodes claim the remainder; `interstitialUnsurveyed` drops to `false`).

## 3. The generator — `tools/mapforge/gen-world.mjs`

Deterministic from the **existing** `n-atlas` seed streams (`resolvedSeedStreams` in the node file): `terrain` drives placement + shape noise, `names` drives name-candidate ordering. No `Math.random`, no `Date` — same seed, same world, byte-identical output.

- **Placement:** landmass seed points sampled in the 2000×2000 frame with exclusion zones: the authored basin corner ([0..150, 0..190] km plus a 100 km sea margin) and the frame edges (except the north edge for the ice cap). Sea-lane reachability constraint: every new continent's coast is reachable from Gildmark without crossing land.
- **Shape:** seeded radial-noise polygons (12–24 vertices), area-fitted to the budget table, then validated against the existing spine geometry rules (counter-clockwise winding, no self-intersection, min-area) — reusing `scripts/lib/spine.mjs` helpers (`shoelaceArea`, `selfIntersects`, `placementArea`), never re-implementing them.
- **Output:** candidate spine node JSONs + a candidate `edges.json` addition, written to a staging dir `content/spine/candidates/` (gitignored), each already schema-valid (`content/schemas/spine-node.schema.json`), with `provenance.authored: "generated"` and fresh unique seeds minted per node (derived from the parent stream, spine `streamSeed` pattern).
- **CLI:** `node tools/mapforge/gen-world.mjs [--out <dir>]` prints a summary table (name-candidate, area, composition, region count) and exits 1 if any candidate violates a spine gate rule or the composition budget.

## 4. The hand-polish pass (the canon act)

A three-role worldbuilding panel (the I-048 format, run as subagents): **Namer** (names in the established compound-earthy style — Millcross/Gildmark/Hollowmarch register — for continents, regions, seas, the foreign port), **Archivist** (canon collisions: the two "doors out" — Gildmark's sea-lane and the shut pass behind Cindervast — must now point at real named places; A1/canon.md citations), **Systems** (composition/budget arithmetic, gate compliance). The panel:

1. Reviews generator candidates; may adjust shapes (move/scale a landmass, re-noise a coast) by editing candidate JSON — never by re-rolling the seed.
2. Names everything; writes the one-line lore hooks.
3. Promotes candidates: `provenance.authored` flips to `"hand"`, files move to `content/spine/nodes/`, `edges.json` gains the sea-lanes, `roots.json` unchanged (all new nodes hang off `n-atlas`).
4. Ships the canon amendment: a "§ the wider world" section in `docs/worldbuilding/A1-geography-cluster1.md` (or a new A2 doc if A1 grows unwieldy) naming the chart's contents, plus the required collision fixes to `content/story/canon.md` lines that say nothing beyond the basin is known — same commit (DR-006 no-silent-drift rule).

The panel's verdict artifact (ACCEPT per node) is committed alongside, matching the I-051 gate pattern.

## 5. Renderer + sheet changes

- `tools/mapforge/lib/atlas-sheet.mjs` extends to draw: all tier-1 children of `n-atlas` (land fill + coast stroke; **fainter line weight + open hatching** on coasts of `reported: true` nodes — the mariners'-chart visual grammar), tier-2 region boundaries as dashed internal lines with name labels, continent features (ridge/river/reef glyphs reusing `lib/draft.mjs` primitives), named seas (curved water labels), the ice cap edge, and sea-lane arcs with season marks.
- `content/spine/sheet-atlas.json` re-voiced: title/subtitle/hand rewritten as the compiled chart ("Bellfaith survey where the towers see; mariners' report beyond"); the withheld list shrinks to what genuinely stays unknown (far interiors, whatever lies past the ice-cap edge).
- The basin corner renders exactly as F-042 drew it — surveyed weight, unchanged.
- New nodes carry a `lore.reported: true` flag (schema addition) distinguishing reported-coast rendering from surveyed rendering; the basin's nodes stay unflagged.

## 6. Gates and verification

1. **All existing spine gates stay green** (`scripts/check_content.mjs --only=spine`, `check_spine_emit.mjs --check`): schema, tier depth, unique ids/seeds, polygon winding/self-intersection, containment, composition sums. G-EMIT-DRIFT is untouched by design — the basin mirror reads only `n-cluster1`'s subtree.
2. **Composition rollup:** `n-atlas` `rollupVerdict` becomes **CHECKED** with computed composition within ±2 pp of 96/2/2 — this is the new hard gate of the feature (a `check_content` spine rule, red-then-green proven).
3. **Generator determinism test:** two runs produce byte-identical candidates (node --test, mapforge tests glob form).
4. **G-MAP-DRIFT (existing, from F-042):** forces the re-rendered `atlas-world.{svg,png}` to be committed in the same change.
5. **Renderer self-checks extend:** every drawn label traces to a node/edge/sheet string; no coast crosses another landmass; sea-lanes terminate on named ports.
6. **Panel verdict artifact** committed (ACCEPT per node) before promote.

## 7. Constraints

- Branch off `release/1.8`; feature worktree; merge release into feature before Gate 1 (established practice).
- Determinism everywhere; rsvg-convert-only rasters (F-042 policy).
- No runtime-tree changes, no `content/maps/` changes, no tier-3 (town/site) nodes on new continents.
- Schema addition (`lore.reported`) is additive-only; existing nodes unmodified except `n-atlas` (`interstitialUnsurveyed` → false once water is claimed) and `edges.json` (append-only).
- Frozen anchors: no existing node's `absoluteAnchor` or placement changes — new geography only ever adds siblings.

## 8. Out of scope

- Towns, sites, zones, mobs, or any gameplay content on new continents.
- Concept art / diffusion images for the new lands (map render only).
- Region sheets for new continents (the F-042 tier-depth decision stands).
- Any change to the basin sheet or the basin's geography.
- Interactive viewer.

## 9. Acceptance criteria

1. `node tools/mapforge/gen-world.mjs` is deterministic (two runs byte-identical) and its candidates pass all spine gate rules standalone.
2. `content/spine/nodes/` gains the promoted world nodes (2 continents + 2–4 archipelagos + ice cap + 2–3 seas, each `authored: "hand"` with panel verdict ACCEPT), and `n-atlas`'s derived rollup is CHECKED within ±2 pp of 96/2/2.
3. Every new continent has 2–4 named tier-2 regions (one being its unsurveyed interior) and 1–2 features; ≥2 sea-lanes exist and the Gildmark lane terminates at a named foreign port.
4. The re-rendered world sheet shows all of it — complete map, no large empty frame — with surveyed-vs-reported visual grammar, and G-MAP-DRIFT passes on the committed artifacts.
5. Canon amendment committed in the same change as the nodes (wider-world section + collision fixes to the "nothing beyond the basin" statements), citation-checked.
6. All pre-existing gates green: spine suite, G-EMIT-DRIFT, mapforge tests, manifest gate, precheck 13/13.
