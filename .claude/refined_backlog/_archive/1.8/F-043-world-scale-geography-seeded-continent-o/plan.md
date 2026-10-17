# F-043 World-Scale Geography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the `n-atlas` world frame with named, canon-committed continents/regions/oceans/ice/sea-lanes, generated deterministically from the committed seed and hand-polished by a worldbuilding panel, so the atlas world sheet renders a complete mariners' chart.

**Architecture:** A pure generation library (`tools/mapforge/lib/world-gen.mjs`) + CLI (`tools/mapforge/gen-world.mjs`) emit schema-valid candidate spine nodes into a gitignored staging dir; a three-role panel promotes them into `content/spine/nodes/`; a new hard gate (`G-ATLAS-ROLLUP`) pins `n-atlas`'s rollup to 96/2/2 ±2 pp; the atlas sheet renderer extends with a surveyed-vs-reported visual grammar; canon amendments ship in the same branch (DR-006 no-silent-drift).

**Tech Stack:** Plain Node ESM (`.mjs`), `node:test` + `node:assert/strict`, existing `scripts/lib/spine.mjs` helpers, rsvg-convert rasters. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-12-world-geography-design.md` (owner + ultracode-panel approved, all 6 panel fixes applied).

## Global Constraints

- Deterministic everywhere: no `Math.random`, no `Date`, no `performance.now`. Same seed → byte-identical output.
- Reuse `scripts/lib/spine.mjs` helpers (`shoelaceArea`, `selfIntersects`, `placementArea`, `deriveNode`, `streamSeed`) — never re-implement.
- Frozen anchors: no existing node's `absoluteAnchor` or `placement` changes. `n-cluster1`, `n-westsea`, all basin nodes byte-identical except `n-atlas` (via `check_spine_emit.mjs --write`) and `edges.json` (append-only).
- The committed `e-sea-lane` edge and `f-trade-wind-far` feature stay **byte-identical** — the basin sheet (`cluster1-world.svg`) and the `cluster1-geography.json` mirror must not change (spec §8: no basin-sheet change). Verify with `git diff --exit-code` on both after every render step.
- New world nodes: tier `continent` (landmasses, ice cap) or `ocean` (seas) — `sea` tier is depth-2 and CANNOT hang off `n-atlas` (`TIER_DEPTH` in `scripts/lib/spine.mjs:28`).
- `lore.reported: true` marks reported (non-surveyed) nodes. The node schema's `lore` is an open object — **no schema edit is needed** (spec's "schema addition" is satisfied by convention; do not touch `spine-node.schema.json`).
- Composition targets: `n-atlas` committed 96/2/2 (ocean/rock/ice); rollup must land within ±2 pp per biome AND verdict CHECKED (requires child coverage ≥ 60%, `rollupComposition` in `scripts/lib/spine.mjs:416`).
- Naming: Ashen Vigil register only (`content/story/style.md` §2) — terse noun+noun compounds (Millcross/Gildmark/Hollowmarch pattern), G7-clean, no real-world homophones.
- Commit style: conventional subjects, one commit per task, never `--amend`.
- Branch: `feature/F-043-world-scale-geography` off `release/1.8`; merge `release/1.8` into the feature branch before Gate 1.

## Key repo facts (verified 2026-08-13 — do not re-derive)

- `n-atlas`: `placement.rect {x:0,y:0,w:2000,h:2000}`, seed `7c9e4a2f8b1d6e03`, `derived.resolvedSeedStreams.terrain = "d9a0051d32afab59"`, `names = "6033b1b1f52e861c"`, `interstitialUnsurveyed: true`, `rollupVerdict: "UNCHECKED"`.
- Basin corner: `n-cluster1` polygon occupies x∈[0,150], y∈[0,190] (26,017 km², rock 13.1%, ice 6.3%); `n-westsea` strip x∈[0,24], y∈[0,140] (2,042 km²). Both `perParentUnit: 1` → cluster km == atlas km.
- Budgets: `content/spine/load-budget.json` = `{maxNodes: 40, maxBytes: 262144}` (29 nodes exist — this feature adds ~13, so the budget MUST be raised, Task 3); `coverage-budget.json` = `{maxUnchecked: 2}`.
- Gates: `checkSpine` in `scripts/check_content.mjs:1536` (imperative, `fail("G-NAME: ...")` pattern); G-POLY requires OPEN rings, strictly positive shoelace, no self-intersection; G-COMP-SUM: keys ∈ BIOMES, values > 0, sum 100 ± 0.5; G-PROVENANCE requires `generator {name, version}` when `authored: "generated"`.
- `check_spine_emit.mjs` byte-checks EVERY node's canonical form (`NODE_FIELDS` order); `--write` fixes. The mirror's seaLane uses the FIRST `kind:"sealane"` edge in `edges.json` — new sealane edges must be appended AFTER `e-sea-lane`.
- Renderer: `tools/mapforge/lib/atlas-sheet.mjs` (`ATLAS_PX_PER_KM 0.7`, map frame px x∈[58,1458] y∈[96,1496], canvas 1504×1542); `createDraft` in `lib/draft.mjs:230` gives `{X, Y, poly, smooth, lineLabel, towerGlyph}`; `patternDefs()` exists (8 patterns incl. `pIce`) but atlas-sheet doesn't inject it yet; NO textPath/curved-label helper exists.
- Outputs: `game-client/assets/art/maps/atlas-world.{svg,png}` (NOT `content/maps/`). Regenerate with `node scripts/check_map_render.mjs --write` (byte-gates SVG only; PNG regenerated alongside, commit both).
- Tests: mapforge → `node --test tools/mapforge/tests/*.test.mjs` (from repo root); spine gates → `cd scripts && npm test`; gate-red fixtures under `scripts/tests/fixtures/spine/<slug>/spine/` run via `contentRootFor()`/`runGate()` helpers in `scripts/tests/spine-gates.test.mjs:16-33`.
- Canon collision sites (panel-verified): `docs/worldbuilding/A1-geography-cluster1.md:445-446` + `:485-486`, `A0-current-world.md` V8 (:329) / G18 (:402) / §5.2 (:461-465), `docs/story/undertow/core-story.md:26` (Thai), `content/spine/sheet-atlas.json` (`hand` + `withheld`). `content/story/canon.md` has NO collision line — it only GAINS entries (§4 end, before line 234; §6.2 rulings table row).

## World layout decision (locked here so tasks agree)

**Seam-and-bay template** (avoids polygon holes — placement polygons are simple rings):

- Frame 2000×2000 km. Exclusions: basin box [0,250]×[0,290] (basin + 100 km sea margin); all frame edges (25 km margin) EXCEPT the north edge for the ice cap; the ice cap alone abuts the basin's shelf near [150, 0..14].
- **Ice cap** `n-<name>-cap` (tier `continent`, `terrainKind: "ice"`, composition `{ice: 92, rock: 8}`): polygon along y=0 from x=150 to ~x=1150, noised southern edge, area fitted to 80,000 km².
- **Two vertical ocean seams** at seeded x ≈ 950 and x ≈ 1500 partition open water into **3 ocean nodes** (tier `ocean`, composition `{ocean: 100}`), each a simple polygon: its band rectangle minus the exclusion boxes and minus rectangular **bays** notched into its seam edges.
- **Bays** (reserved water rectangles on the seams) hold the landmasses: 2 major continents (fitted to ~22,000 and ~18,000 km²) + 3 archipelago chains (~4,000 / 3,500 / 3,000 km² — each chain node's polygon is its MAIN isle; outlying isles are `point` features and its reef is a `line` feature on the node). Landmass polygons are seeded radial-noise rings (12–24 vertices) fitted inside their bay with ≥15 km water clearance.
- Continent composition (rock-dominant per the spec's rollup note): majors `{rock: 55, upland: 20, forest: 15, meadow: 10}`, chains `{rock: 50, meadow: 30, forest: 20}`. Expected rollup: rock ≈ 0.95–1.1% (within 2±2 pp), ice ≈ 1.9%, ocean ≈ 96%. Coverage ≈ 90%+ → CHECKED.
- `n-atlas` edits (the ONLY existing-node change): `interstitialUnsurveyed` → `false`, `interstitial` → `{"ocean": 100}` (unclaimed slack is open water — bay margins), `derived` refreshed by `--write`.
- **Regions**: each major continent is split into 2–4 tier-2 `region` children by chord-splitting its polygon at vertices (exact tiling, no overlap) — coastal regions named, one "unsurveyed interior" region each (`lore.reported: true` everywhere).
- **Sea-lanes** (≥2, appended after `e-sea-lane`): `e-lane-<port>` kind `sealane` from `{node:"n-gildmark"}` to `{feature:"f-port-<name>"}` (a named `point` feature with `attrs: {role:"port", name:"<Name>"}` on the western major continent), attrs `{label, season:"the trade wind", passageDays: <n>, note}`; plus one foreign coastal lane between two foreign port features. The atlas sheet draws sealanes whose termini resolve on-sheet and SKIPS lanes whose `to` feature has `offSheet: true` (so the legacy arrow is replaced by the real lane on the atlas, while `e-sea-lane` keeps the basin sheet identical).

---

### Task 1: Generation library `tools/mapforge/lib/world-gen.mjs`

**Files:**
- Create: `tools/mapforge/lib/world-gen.mjs`
- Test: `tools/mapforge/tests/world-gen.test.mjs`

**Interfaces:**
- Consumes: `shoelaceArea`, `selfIntersects`, `placementArea` from `../../../scripts/lib/spine.mjs` (import exactly like `atlas-sheet.mjs:14-23` does).
- Produces (all pure, options-object single-path APIs):
  - `rng(seedHex: string): () => number` — mulberry32 seeded from first 8 hex chars.
  - `noiseRing({center, meanRadius, vertices, roughness, rand}): number[][]` — open ring, positive winding, 1-decimal coords.
  - `fitArea({points, center, targetArea}): number[][]` — scales ring about center by `sqrt(target/current)`.
  - `splitAtVertices({points, i, j}): [number[][], number[][]]` — exact chord split into two rings.
  - `validRing({points}): string[]` — reasons list (empty = valid): ≥3 pts, open, positive shoelace, no self-intersection, no repeated consecutive point (mirror of G-POLY, `check_content.mjs:1598-1615`).
  - `buildWorld({atlasNode}): {nodes: object[], edges: object[], summary: object[]}` — the full template layout; every returned node is a complete spine-node document (all `NODE_FIELDS` except `derived`).

- [ ] **Step 1: Write failing tests**

```js
// tools/mapforge/tests/world-gen.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { rng, noiseRing, fitArea, splitAtVertices, validRing, buildWorld } from "../lib/world-gen.mjs";
import { shoelaceArea, placementArea } from "../../../scripts/lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const atlasNode = JSON.parse(readFileSync(resolve(ROOT, "content/spine/nodes/n-atlas.json"), "utf8"));

test("rng is deterministic and in [0,1)", () => {
  const a = rng("d9a0051d32afab59"), b = rng("d9a0051d32afab59");
  const sa = [a(), a(), a()], sb = [b(), b(), b()];
  assert.deepEqual(sa, sb);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test("noiseRing produces a valid positive ring fitted to target area", () => {
  const ring = fitArea({
    points: noiseRing({ center: [1000, 700], meanRadius: 80, vertices: 18, roughness: 0.35, rand: rng("d9a0051d32afab59") }),
    center: [1000, 700], targetArea: 22000,
  });
  assert.deepEqual(validRing({ points: ring }), []);
  const area = shoelaceArea({ points: ring });
  assert.ok(Math.abs(area - 22000) / 22000 < 0.02, `area ${area}`);
});

test("splitAtVertices partitions area exactly", () => {
  const ring = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const [a, b] = splitAtVertices({ points: ring, i: 0, j: 2 });
  assert.equal(shoelaceArea({ points: a }) + shoelaceArea({ points: b }), shoelaceArea({ points: ring }));
});

test("buildWorld is deterministic and meets the budget table", () => {
  const w1 = buildWorld({ atlasNode });
  const w2 = buildWorld({ atlasNode });
  assert.deepEqual(w1, w2);
  const land = w1.nodes.filter((n) => n.tier === "continent" && n.terrainKind !== "ice");
  const majors = land.filter((n) => !n.tags.includes("archipelago"));
  const chains = land.filter((n) => n.tags.includes("archipelago"));
  const oceans = w1.nodes.filter((n) => n.tier === "ocean");
  const caps = w1.nodes.filter((n) => n.terrainKind === "ice");
  const regions = w1.nodes.filter((n) => n.tier === "region");
  assert.equal(majors.length, 2);
  assert.ok(chains.length >= 2 && chains.length <= 4);
  assert.ok(oceans.length >= 2 && oceans.length <= 3);
  assert.equal(caps.length, 1);
  for (const m of majors) {
    const kids = regions.filter((r) => r.parentId === m.id);
    assert.ok(kids.length >= 2 && kids.length <= 4, m.id);
    assert.ok(kids.some((r) => r.tags.includes("unsurveyed-interior")), m.id);
  }
  const newLand = land.reduce((s, n) => s + placementArea({ placement: n.placement }), 0);
  assert.ok(newLand > 40000 && newLand < 60000, `new land ${newLand}`);
  const capArea = placementArea({ placement: caps[0].placement });
  assert.ok(Math.abs(capArea - 80000) / 80000 < 0.05, `cap ${capArea}`);
  for (const n of w1.nodes) {
    assert.equal(n.provenance.authored, "generated");
    assert.deepEqual(n.provenance.generator, { name: "gen-world", version: 1 });
    assert.match(n.seed.value, /^[0-9a-f]{16}$/);
    assert.ok(n.lore.reported === true, n.id);
    if (n.placement.shape === "polygon") assert.deepEqual(validRing({ points: n.placement.points }), [], n.id);
  }
  const seeds = new Set(w1.nodes.map((n) => n.seed.value));
  assert.equal(seeds.size, w1.nodes.length);
  assert.ok(w1.edges.length >= 2 && w1.edges.every((e) => e.kind === "sealane"));
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tools/mapforge/tests/world-gen.test.mjs` from repo root. Expected: FAIL, cannot find module `../lib/world-gen.mjs`.

- [ ] **Step 3: Implement `world-gen.mjs`**

Core primitives (implement exactly; the template body follows the layout decision above):

```js
import { createHash } from "node:crypto";
import { shoelaceArea, selfIntersects } from "../../../scripts/lib/spine.mjs";

// mulberry32 — deterministic, seeded from the first 8 hex chars of a stream seed.
export function rng(seedHex) {
  let s = Number.parseInt(seedHex.slice(0, 8), 16) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n) => Math.round(n * 10) / 10;

export function noiseRing({ center, meanRadius, vertices, roughness, rand }) {
  const pts = [];
  for (let i = 0; i < vertices; i++) {
    const a = (i / vertices) * 2 * Math.PI;
    const r = meanRadius * (1 + roughness * (rand() * 2 - 1));
    pts.push([r1(center[0] + r * Math.cos(a)), r1(center[1] + r * Math.sin(a))]);
  }
  if (shoelaceArea({ points: pts }) < 0) pts.reverse();
  return pts;
}

export function fitArea({ points, center, targetArea }) {
  const k = Math.sqrt(targetArea / shoelaceArea({ points }));
  return points.map(([x, y]) => [r1(center[0] + (x - center[0]) * k), r1(center[1] + (y - center[1]) * k)]);
}

export function splitAtVertices({ points, i, j }) {
  const a = [], b = [];
  for (let k = i; ; k = (k + 1) % points.length) { a.push(points[k]); if (k === j) break; }
  for (let k = j; ; k = (k + 1) % points.length) { b.push(points[k]); if (k === i) break; }
  return [a, b];
}

export function validRing({ points }) {
  const out = [];
  if (!points || points.length < 3) return ["fewer than 3 points"];
  const [fx, fy] = points[0], [lx, ly] = points[points.length - 1];
  if (fx === lx && fy === ly) out.push("closed ring (author OPEN rings)");
  for (let i = 1; i < points.length; i++)
    if (points[i][0] === points[i - 1][0] && points[i][1] === points[i - 1][1]) out.push(`repeated point at ${i}`);
  if (!(shoelaceArea({ points }) > 0)) out.push("non-positive shoelace (winding)");
  if (selfIntersects({ points })) out.push("self-intersects");
  return out;
}

export function mintSeed({ parentStream, name }) {
  return createHash("sha256").update(`${parentStream}:${name}`).digest("hex").slice(0, 16);
}
```

`buildWorld({atlasNode})`:
1. `const terrain = atlasNode.derived.resolvedSeedStreams.terrain; const rand = rng(terrain);`
2. Seeded seam positions: `seamA = 900 + Math.floor(rand() * 120)`, `seamB = 1450 + Math.floor(rand() * 120)`.
3. Ice cap: baseline y=0 from x=150 to x=150+capW where `capW = 1000`, noised southern edge at depth `80000/capW ± jitter` per vertex (build the ring clockwise-in-screen so shoelace is positive: `[[150,0],[150+capW,0], ...noised south edge right-to-left back to [150, ~14]]`); `fitArea` about its centroid to 80,000. It must abut [150, 0..14] (the basin ice-shelf seam) — keep the first edge segment `[150,0]→[150,14]` exact.
4. Bays (water rects reserved on seams, jittered ±40 km along y): major A `[seamA−170, seamA+170]×[560,900]` (bay for the ~22,000 km² continent), major B `[seamB−160, seamB+160]×[1150,1470]`, chains: `[seamA−90, seamA+90]×[1300,1520]`, `[seamB−80, seamB+80]×[420,600]` (south of the cap, ≥40 km clearance), `[seamA−80, seamA+80]×[240,420]`. Landmasses: `fitArea(noiseRing({center: bayCenter, meanRadius: sqrt(target/π), vertices: 12–24, roughness: 0.3}))`, validated with `validRing`; on failure decrement roughness by 0.05 and rebuild (deterministic retry, max 5).
5. Ocean polygons: 3 band polygons (x∈[25,seamA], [seamA,seamB], [seamB,1975], y∈[25,1975]) with rectangular detours: band 1 excludes the basin box ([0,250]×[0,290] — route the boundary around it) ; every band's seam edge detours around the bay halves on its side; band 2's north edge starts below the ice cap's fitted south edge +15 km. All simple rings built by explicit vertex lists; assert `validRing` on each.
6. Regions: for each major continent, chord-split at seeded vertex pairs into 3 parts (split largest part again if a part exceeds 55% of area); tag the part whose centroid is furthest from the coast midpoint `unsurveyed-interior`.
7. Features: per major continent 1–2 `line` features (a ridge: chord polyline across the interior; a river mouth: 3-pt polyline from interior to a coast vertex); per chain 1 reef `line` (offset arc along the isle's seaward side) + 1–3 outlying-isle `point` features. Port feature on major A: `{id: "f-port-<slug>", kind: "point", at: <westernmost coast vertex>, attrs: {role: "port", name: null}}` (panel names it).
8. Node documents: ids/titles `null`-named placeholders keyed by the names stream: order name-candidate indices with `rng(atlasNode.derived.resolvedSeedStreams.names)`; actual candidate word pairs come from an embedded G7-clean parts list (e.g. `["Tarn","Fell","Drift","Cold","Rook","Salt","Stone","Reed","Gale","Harrow","Weld","Bright"]` × `["mark","hollow","stead","reach","tide","fall","moor","strand","holt","wick"]`) — emit as `nameCandidates: [c1, c2, c3]` in the summary; node `title` uses candidate 1 (panel may override). Every node: `parentId` (`n-atlas` or its continent), `provenance: {authored: "generated", generator: {name: "gen-world", version: 1}, source: "tools/mapforge/gen-world.mjs"}`, `frozen: false`, `seed: {value: mintSeed({parentStream: terrain, name: id}), epoch: 0, why: null}`, `placement: {shape: "polygon", points, anchor: centroid}`, `interior: {units: "km", perParentUnit: 1, size: [bbox.w, bbox.h], originInParent: [bbox.x, bbox.y]}`, composition per the layout decision, `interstitial: null`, `interstitialUnsurveyed: false`, `compositionTolerance: null`, `toleranceWhy: null`, `terrainKind` (ice cap only), `features`, `bands: []`, `runtime: {mapIds: [], originU: null, spawnAreas: [], mobSettings: null, seedDemoNPCs: false, collision: "none"}`, `representsNodeId: null`, `lore: {reported: true, summary: "<one line, panel rewrites>"}`, `tags` (`["archipelago"]`, `["unsurveyed-interior"]`, or `[]`), `levelBand: null`. NO `derived` and NO `absoluteAnchor` (`check_spine_emit --write` adds `derived`; `absoluteAnchor` is optional and omitted like `n-westsea`).
9. Edges: `e-lane-<portslug>` and one foreign-coastal lane, shapes per the layout decision.
10. Summary rows: `{id, tier, nameCandidates, areaKm2, composition, regionCount}`.

- [ ] **Step 4: Run tests** — `node --test tools/mapforge/tests/world-gen.test.mjs`. Expected: PASS (iterate on template geometry until valid; all failures are deterministic so debugging is stable).

- [ ] **Step 5: Quality gate** — reviewer subagent on the diff; fix findings; re-run tests.

- [ ] **Step 6: Commit** — `git add tools/mapforge/lib/world-gen.mjs tools/mapforge/tests/world-gen.test.mjs && git commit -m "feat(mapforge): deterministic world-generation library (F-043)"`

---

### Task 2: Generator CLI `tools/mapforge/gen-world.mjs`

**Files:**
- Create: `tools/mapforge/gen-world.mjs`
- Modify: `.gitignore` (append `content/spine/candidates/`)
- Test: `tools/mapforge/tests/gen-world.test.mjs`

**Interfaces:**
- Consumes: `buildWorld` from `./lib/world-gen.mjs`; `loadSpine`, `buildTree`, `deriveNode` from `scripts/lib/spine.mjs`; ajv is NOT available outside `scripts/` — validate against the schema by spawning the gate instead (see Step 3).
- Produces: `node tools/mapforge/gen-world.mjs [--out <dir>]` (default `content/spine/candidates/`) writing `<id>.json` per node + `edges-addition.json`; prints a summary table; exit 1 if any candidate fails validation or the composition budget; exit 0 otherwise. Also exports `generate({repoRoot, outDir})` for tests.

- [ ] **Step 1: Write failing tests**

```js
// tools/mapforge/tests/gen-world.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = join(ROOT, "tools/mapforge/gen-world.mjs");

function run(outDir) {
  return execFileSync(process.execPath, [CLI, "--out", outDir], { encoding: "utf8" });
}

test("gen-world: two runs are byte-identical (AC 1)", () => {
  const a = mkdtempSync(join(tmpdir(), "genw-a-")), b = mkdtempSync(join(tmpdir(), "genw-b-"));
  try {
    run(a); run(b);
    const fa = readdirSync(a).sort(), fb = readdirSync(b).sort();
    assert.deepEqual(fa, fb);
    for (const f of fa) assert.equal(readFileSync(join(a, f), "utf8"), readFileSync(join(b, f), "utf8"), f);
    assert.ok(fa.length >= 8, `only ${fa.length} files`);
    assert.ok(fa.includes("edges-addition.json"));
  } finally { rmSync(a, { recursive: true }); rmSync(b, { recursive: true }); }
});

test("gen-world: candidates pass the spine gate standalone (AC 1)", () => {
  const out = mkdtempSync(join(tmpdir(), "genw-gate-"));
  try {
    const stdout = run(out);
    assert.match(stdout, /gen-world: composition rollup ocean=9[4-8]/);
    assert.match(stdout, /gen-world: OK/);
  } finally { rmSync(out, { recursive: true }); }
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tools/mapforge/tests/gen-world.test.mjs`. Expected: FAIL (no CLI).

- [ ] **Step 3: Implement the CLI.** `generate({repoRoot, outDir})`:
  1. Load `n-atlas` from `content/spine/nodes/n-atlas.json`; `buildWorld({atlasNode})`.
  2. **Gate-proof in-memory**: construct a synthetic content root in `mkdtempSync` — copy the real `content/schemas/spine-node.schema.json`, the real `content/spine/nodes/*.json`, `roots.json`, `sheet-atlas.json`, budgets; add candidate nodes with a `derived` block computed via `buildTree` + `deriveNode` over the merged node set; write `edges.json` = committed edges + candidate edges; write a raised `load-budget.json` (`{maxNodes: 48, maxBytes: 393216}` — mirrors Task 3's committed bump); then `execFileSync(process.execPath, ["scripts/check_content.mjs", "--content-root", tmp, "--only=spine"])`. Non-zero exit → print the gate output, exit 1. This is the "candidates pass all spine gate rules standalone" acceptance, reusing the real gate.
  3. **Composition budget check**: `deriveNode({tree, id: "n-atlas"})` over the merged tree (with `interstitialUnsurveyed: false`, `interstitial: {ocean: 100}` applied to the in-memory n-atlas); assert `rollupVerdict === "CHECKED"` and `|computedComposition[b] − {ocean:96,rock:2,ice:2}[b]| ≤ 2` for the three biomes; print `gen-world: composition rollup ocean=<v> rock=<v> ice=<v> verdict=<v>`; violation → exit 1.
  4. Write candidates to `outDir` (JSON, 2-space indent, trailing newline, WITHOUT `derived` — promotion + `--write` owns that); write `edges-addition.json`; print the summary table (`id · tier · name-candidates · km² · composition · regions`) and `gen-world: OK`.
  5. `main()` guard: `import.meta.url === pathToFileURL(process.argv[1]).href` (copy `render-sheet.mjs:122`); unknown args exit 2.

- [ ] **Step 4: Append to `.gitignore`**: `content/spine/candidates/`. Run `node tools/mapforge/gen-world.mjs` (default out); `git status --short` must NOT list the candidates dir.

- [ ] **Step 5: Run tests** — `node --test tools/mapforge/tests/*.test.mjs` (all mapforge suites; the pre-existing ones must stay green). Expected: PASS.

- [ ] **Step 6: Quality gate** — reviewer subagent; fix; re-run.

- [ ] **Step 7: Commit** — `git add tools/mapforge/gen-world.mjs tools/mapforge/tests/gen-world.test.mjs .gitignore && git commit -m "feat(mapforge): gen-world CLI emits gate-valid world candidates (F-043)"`

---

### Task 3: Panel hand-polish + promotion (the canon act)

**Files:**
- Create: `content/spine/nodes/n-<name>.json` (~13 files: 2 majors, 3 chains, 1 ice cap, 3 oceans, 4–8 regions)
- Create: `docs/worldbuilding/F-043-wider-world-panel.md` (verdict artifact)
- Modify: `content/spine/nodes/n-atlas.json` (`interstitialUnsurveyed: false`, `interstitial: {"ocean": 100}` — via emit `--write` after the hand edit)
- Modify: `content/spine/edges.json` (append sealanes AFTER `e-sea-lane`)
- Modify: `content/spine/load-budget.json` → `{"maxNodes": 48, "maxBytes": 393216}`

**Interfaces:**
- Consumes: `content/spine/candidates/*.json` from Task 2.
- Produces: promoted nodes with `provenance.authored: "hand"` (keep the `generator` object — it records provenance origin; G-PROVENANCE only *requires* it for `"generated"`), final names/titles, final `lore.summary` one-liners, port feature named. Later tasks rely on: the port feature id `f-port-<slug>` with `attrs.name`, node ids listed in the verdict artifact, all gates green.

- [ ] **Step 1: Run the generator** — `node tools/mapforge/gen-world.mjs` → candidates in `content/spine/candidates/`.

- [ ] **Step 2: Convene the three-role panel as subagents** (I-048 format — dispatch three agents, each given the candidate JSONs + the naming/canon source list):
  - **Namer**: final names for every node, the port, seas, features — Ashen Vigil register (`style.md:104-124`), G7-clean, checked against ALL existing names (`content/story/regions.json`, spine node titles, A1:17-24 coinages). Output: `id → {title, rename?}` table + port name.
  - **Archivist**: canon collisions — verify the two "doors out" (A1:250-255) now point at real named places; confirm V8's invariant SURVIVES (foreign ports are foreign — Gildmark stays the basin's only port); list every doc line the Task 7 amendment must touch, with exact quotes. Output: collision table.
  - **Systems**: re-run `node tools/mapforge/gen-world.mjs` arithmetic; verify budget table vs spec §2; verify `maxNodes` math (29 committed + N new ≤ 48). Output: PASS/FAIL per budget row.
  Panel may adjust candidate shapes by editing candidate JSON (move/scale, never re-roll the seed).

- [ ] **Step 3: Promote** — for each accepted candidate: set `title`, flip `provenance.authored` to `"hand"`, write final `lore.summary` (one "reported, not surveyed" line each — no interior detail, F-033 lesson), move file to `content/spine/nodes/<id>.json`. Append the two sealane edges to `edges.json` AFTER `e-sea-lane` (order is load-bearing — the emitter's mirror takes the FIRST sealane). Hand-edit `n-atlas.json`: `interstitialUnsurveyed: false`, `interstitial: {"ocean": 100}`. Write `load-budget.json` bump. `roots.json` unchanged.

- [ ] **Step 4: Refresh derived blocks** — `node scripts/check_spine_emit.mjs --write` (adds `derived` to every new node, refreshes `n-atlas`'s). Then verify the basin is untouched: `git diff --exit-code content/maps/cluster1-geography.json content/spine/nodes/n-cluster1.json content/spine/nodes/n-westsea.json` — MUST be clean (only `n-atlas` + new files may change).

- [ ] **Step 5: Run gates** — `node scripts/check_content.mjs --only=spine` (expect exit 0; the `spine-comp:` report line for `n-atlas` shows `verdict=CHECKED`) and `node scripts/check_spine_emit.mjs --check` (expect `check clean`).

- [ ] **Step 6: Write the verdict artifact** `docs/worldbuilding/F-043-wider-world-panel.md`: date, panel roles, per-node table `| node | title | verdict | note |` (every row ACCEPT — a non-ACCEPT node goes back to Step 2), the Namer's register attestation, the Archivist's collision table (consumed by Task 7), Systems' budget PASS table. Format precedent: the I-051 prose verdict (`.claude/refined_backlog/_archive/1.7/F-032-*/spec.md:58-59`) — this file makes it per-node.

- [ ] **Step 7: Quality gate** — reviewer subagent (content review: naming register, lore one-liners, budget math); fix; re-run Step 5 gates.

- [ ] **Step 8: Commit** — `git add content/spine docs/worldbuilding/F-043-wider-world-panel.md && git commit -m "feat(content): the wider world — panel-promoted world-scale spine nodes (F-043)"`

---

### Task 4: New hard gate `G-ATLAS-ROLLUP`

**Files:**
- Modify: `scripts/check_content.mjs` (new rule inside `checkSpine`, after the `gSpineOverlapRollup` call at :1689)
- Create: `scripts/tests/fixtures/spine/g-atlas-rollup-drift/spine/` (red fixture)
- Test: append to `scripts/tests/spine-gates.test.mjs`

**Interfaces:**
- Consumes: `tree`, `deriveNode`, the `fail` closure — same pattern as existing delegated rules.
- Produces: gate failure string prefix `G-ATLAS-ROLLUP:` (Task 8's suite greps it).

- [ ] **Step 1: Write the failing (red-fixture) test** — build the fixture by copying `scripts/tests/fixtures/spine/base/` and giving the world root a child set whose rollup misses the committed composition by >2 pp (e.g. one 50%-area rock child), with `interstitialUnsurveyed: false`. Append to `spine-gates.test.mjs`:

```js
test("G-ATLAS-ROLLUP red: world rollup off committed composition by >2pp", () => {
  const { code, stdout } = runGate(contentRootFor("g-atlas-rollup-drift"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-ATLAS-ROLLUP: /);
});

test("G-ATLAS-ROLLUP green: the committed content passes", () => {
  const { code, stdout } = runGate(join(ROOT, "content"));
  assert.equal(code, 0, stdout);
});
```

(The green half runs the real content root — valid only after Task 3 landed; that ordering is why this task follows promotion. Red-then-green is thereby proven inside one branch.)

- [ ] **Step 2: Run to verify the red test fails** (rule not implemented yet → gate exits 0 on the fixture): `cd scripts && npm test`. Expected: the new red test FAILS.

- [ ] **Step 3: Implement the rule** in `checkSpine` (delegated style — walk `validNodes`, guard `tree.depthOf.has`):

```js
  // G-ATLAS-ROLLUP — F-043's hard gate: every world-tier root that has
  // claimed its water (interstitialUnsurveyed false) must roll up CHECKED
  // and within ±2 pp of its committed composition on every committed biome.
  for (const node of validNodes) {
    if (node.tier !== "world" || node.interstitialUnsurveyed || !tree.depthOf.has(node.id)) continue;
    const d = deriveNode({ tree, id: node.id, plans: townPlans });
    if (d.rollupVerdict !== "CHECKED")
      fail(`G-ATLAS-ROLLUP: ${node.id}: rollupVerdict ${d.rollupVerdict} — world coverage must reach CHECKED (>= 60% claimed)`);
    for (const [b, v] of Object.entries(node.composition ?? {})) {
      const got = d.computedComposition[b] ?? 0;
      if (Math.abs(got - v) > 2)
        fail(`G-ATLAS-ROLLUP: ${node.id}: ${b} rolls up to ${got.toFixed(2)} vs committed ${v} (tolerance ±2 pp)`);
    }
  }
```

(`deriveNode` and `townPlans` are already in scope in `checkSpine`. The `interstitialUnsurveyed` guard means the rule self-activates the moment Task 3's `n-atlas` edit lands — before that it is dormant, so the gate never breaks mid-branch.)

- [ ] **Step 4: Run tests** — `cd scripts && npm test`. Expected: red fixture FAILs the gate (test passes), real content passes. Also re-run `node scripts/check_content.mjs --only=spine` → exit 0.

- [ ] **Step 5: Quality gate** — reviewer subagent; fix; re-run.

- [ ] **Step 6: Commit** — `git add scripts/check_content.mjs scripts/tests && git commit -m "feat(gates): G-ATLAS-ROLLUP pins the world rollup to committed composition (F-043)"`

---

### Task 5: Renderer — the compiled mariners' chart

**Files:**
- Modify: `tools/mapforge/lib/draft.mjs` (add `curveLabel`, add `pReported` pattern to `patternDefs()`)
- Modify: `tools/mapforge/lib/atlas-sheet.mjs` (draw the world; extend self-checks)
- Modify: `content/spine/sheet-atlas.json` (re-voice)
- Test: extend `tools/mapforge/tests/atlas-sheet.test.mjs`

**Interfaces:**
- Consumes: promoted nodes (Task 3): tier-1 children of `n-atlas` with `lore.reported`, tier-2 regions, port/reef/isle features, sealane edges with `attrs.season`/`attrs.passageDays`.
- Produces: `drawAtlasSheet` unchanged signature; new draft export `curveLabel({id, d, text, size, tracking, fill, startOffset})` returning `{defs, text}` SVG strings — `d` is a ready path string (callers build it with `smooth(...)`).

- [ ] **Step 1: Write failing tests** (append to `atlas-sheet.test.mjs`; keep the existing three tests untouched — town-dot count stays 7):

```js
test("world sheet draws every reported tier-1 node with the reported grammar", () => {
  const { svg, problems } = buildAtlasSheet({ repoRoot: ROOT });
  assert.deepEqual(problems, []);
  const spine = loadSpine({ contentRoot: join(ROOT, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const reported = [...tree.byId.values()].filter((n) => n.parentId === "n-atlas" && n.lore?.reported);
  assert.ok(reported.length >= 6);
  for (const n of reported) assert.ok(svg.includes(esc(n.title.toUpperCase())) || svg.includes(esc(n.title)), n.id);
  assert.ok(svg.includes('class="coast-reported"'));
  assert.ok(svg.includes("pReported"));
  assert.ok(svg.includes('class="region-bound"'));
  assert.ok(svg.includes("textPath"));
});

test("sea-lanes terminate on named ports and carry season marks", () => {
  const { svg, problems } = buildAtlasSheet({ repoRoot: ROOT });
  assert.deepEqual(problems, []);
  const lanes = svg.match(/class="sea-lane"/g) ?? [];
  assert.ok(lanes.length >= 2);
  assert.ok(svg.includes("the trade wind"));
});
```

(Import `esc` from `../lib/draft.mjs`, `loadSpine`/`buildTree` like the lib does.)

- [ ] **Step 2: Run to verify failure** — `node --test tools/mapforge/tests/atlas-sheet.test.mjs`. Expected: new tests FAIL.

- [ ] **Step 3: Implement.** In `draft.mjs`: add `pReported` to `patternDefs()` (open diagonal hatch, e.g. `pat("pReported", 7, 7, '<path d="M0,7 L7,0" stroke="#241f18" stroke-width="0.45" opacity="0.5"/>')`); add:

```js
export function curveLabel({ id, d, text, size = 14, tracking = 3, fill = C.inkMid, startOffset = "50%" }) {
  return {
    defs: `<path id="${id}" d="${d}" fill="none"/>`,
    text: `<text font-size="${size}" letter-spacing="${tracking}" fill="${fill}" font-style="italic"><textPath href="#${id}" startOffset="${startOffset}" text-anchor="middle">${esc(text)}</textPath></text>`,
  };
}
```

In `atlas-sheet.mjs`, inside the clip group, after the basin block (leave the basin block byte-for-byte alone):
  1. Inject `patternDefs()` into the `<defs>` (it isn't there today).
  2. Iterate tier-1 children of `n-atlas` excluding `n-cluster1`/`n-westsea`, sorted by id. Oceans: no fill (parchment IS the sea on this sheet… no — the committed sheet fills sea via the basin block only); draw each ocean's **name** as a `curveLabel` along a gentle horizontal arc through its centroid (baseline `smooth` of 3 points: centroid ±180 km x, ∓25 km y). Land nodes (`lore.reported`): fill `url(#pReported)` + coast stroke `stroke="${C.ink}" stroke-width="0.55" class="coast-reported"` via `smooth(points, true, ZONE_TENSION)`; title as `lineLabel` at the anchor (uppercase, size 13, tracking 2). Ice cap: fill `url(#pIce)`, edge stroke 0.7.
  3. Regions: for each tier-2 child of a reported continent, draw `smooth(points, true)` with `stroke-dasharray="3 3"` `stroke-width="0.4"` `class="region-bound"` `fill="none"`, and its title via `lineLabel` at the anchor (size 9.5, `fill=C.inkSoft`).
  4. Features on reported nodes: `line` kind → `smooth(points)` 0.7 px (reef: `stroke-dasharray="1 3"`); named features get `lineLabel(attrs.name, alongKm(points, polylineKm(points)/2).at, angle)`; `point` kind with `attrs.role === "port"` → circle r 2 + name label; other points → circle r 1.1.
  5. Sealanes: replace the single-arrow block — iterate ALL `kind === "sealane"` edges; SKIP any whose `to.feature` resolves to a feature with `offSheet: true` (the legacy basin arrow); resolve termini (`{node}` → `resolveToRoot` via parent, `{feature}` → global feature search across all nodes' features, error if `attrs.name`/`attrs.role !== "port"` missing on a lane-terminal feature); draw a quadratic arc (control point = midpoint offset 6% of lane length perpendicular), `class="sea-lane"` `stroke-dasharray="6 5"` 0.8 px, arrowhead at the `to` end (reuse the existing arrowhead path construction), `attrs.label` via `lineLabel` at the arc midpoint (size 10.5, italic).
  6. Self-checks (extend the existing `problems` pattern): every tier-1/2 node drawn has a non-empty `title` (label traceability — every drawn string is `node.title` / `feature.attrs.name` / `edge.attrs.label` / `sheet.*` by construction; check the sources are present); pairwise coast-crossing check over all tier-1 land polygons (reuse the `properCross` idea: for each polygon pair, test every edge pair — push `"coast <a> crosses <b>"`); every drawn sealane's `to` feature has `attrs.role === "port"` and `attrs.name`; `checkFrame` every new polygon and lane point.
  7. Re-voice `content/spine/sheet-atlas.json`: `subtitle` → `"Bellfaith survey where the towers see; mariners' report beyond"`; `hand` → compiled-chart voice (2–3 sentences: the basin from the survey, the far coasts from masters' reports sworn at Gildmark harbor, hatched coasts are reported not vouched); `withheld` shrinks to `["the far interiors, past what any crew has walked", "whatever lies past the ice-cap's edge"]`; keep `title`, `northMark`, `surveyNote`, `noScaleBar`, `scaleBarNote`.

- [ ] **Step 4: Run tests** — `node --test tools/mapforge/tests/*.test.mjs`. Expected: ALL pass, including untouched basin/parity suites (they prove the basin block didn't drift).

- [ ] **Step 5: Quality gate** — reviewer subagent + open the freshly built SVG in Chrome for a visual pass (`node tools/mapforge/render-sheet.mjs --sheet atlas --no-png` then `open -a "Google Chrome" game-client/assets/art/maps/atlas-world.svg`; a complete map, no large empty frame — AC 4's human half). Fix findings; re-run tests. Then `git checkout -- game-client/` (Task 6 owns the committed artifacts).

- [ ] **Step 6: Commit** — `git add tools/mapforge content/spine/sheet-atlas.json && git commit -m "feat(mapforge): atlas sheet draws the wider world with surveyed-vs-reported grammar (F-043)"`

---

### Task 6: Committed artifacts + drift gates

**Files:**
- Modify: `game-client/assets/art/maps/atlas-world.svg`, `game-client/assets/art/maps/atlas-world.png` (regenerated)

**Interfaces:** consumes Tasks 3+5. Produces the committed artifacts G-MAP-DRIFT byte-gates.

- [ ] **Step 1: Regenerate** — `node scripts/check_map_render.mjs --write`. Verify rsvg-convert ran (no "skipped" line — the PNG must regenerate; magick-without-librsvg drops every stroke).
- [ ] **Step 2: Assert the basin sheet did NOT change** — `git diff --exit-code game-client/assets/art/maps/cluster1-world.svg game-client/assets/art/maps/cluster1-world.png` → clean.
- [ ] **Step 3: Run every drift gate** — `node scripts/check_map_render.mjs` (exit 0), `node scripts/check_spine_emit.mjs --check` (clean), `node scripts/check_content.mjs --only=spine` (exit 0), `cd scripts && npm test`, `node --test tools/mapforge/tests/*.test.mjs`. All green with visible exit codes.
- [ ] **Step 4: Commit** — `git add game-client/assets/art/maps/atlas-world.svg game-client/assets/art/maps/atlas-world.png && git commit -m "chore(maps): re-render atlas world sheet — complete chart (F-043)"`

---

### Task 7: Canon amendment (DR-006 option 3, no silent drift)

**Files:**
- Create: `docs/worldbuilding/A2-wider-world.md`
- Modify: `docs/worldbuilding/A1-geography-cluster1.md` (:250-255 area, :443-450 area, :479-486 art brief)
- Modify: `docs/worldbuilding/A0-current-world.md` (V8 :329 annotation, G18 :402, §5.2 :461-465)
- Modify: `docs/story/undertow/core-story.md` (:26)
- Modify: `content/story/canon.md` (§4 entries before :234; §6.2 rulings row)

**Interfaces:** consumes the Archivist's collision table + final names from Task 3's verdict artifact. Line numbers above were verified 2026-08-13 — re-locate by quoted text, not by number (canon line citations rot on insert).

- [ ] **Step 1: Write `A2-wider-world.md`** — the wider world as a compiled mariners' chart: one section per named continent/sea/chain/cap with its one-line lore hook (copy from the promoted nodes' `lore.summary` — single source is the node; A2 cites node ids), the port, the lanes (season + passage-days), an explicit epistemology section ("reported, not surveyed" — what a hatched coast means, what stays unknown), and the DR-006 provenance note (option 3, amendment list). NO interior detail beyond the unsurveyed-interior region names (F-033: added specificity is the fastest canon contradiction).
- [ ] **Step 2: Amend A1** (basin doc keeps its basin voice; every edit is an annotation, not a rewrite): after the "two doors" list (:250-255) add one line — both doors now point at named places, cite A2 + node ids. In §7.2, the withheld entries at :445-446 ("The map ends where the ice starts moving…") and :449-450 ("The sea beyond a day's sail…") each gain a trailing clarifier: *this* sheet is the basin survey; the wider chart is the atlas sheet (A2) — the basin parchment's edge is unchanged. Same clarifier appended to the A1-ART-01 hard-edge sentence (:485-486). Marker style: `**AMENDED <date> (F-043, DR-006 option 3).**` — the A0 G13/§5.4 precedent.
- [ ] **Step 3: Amend A0** — G18 row: prepend `**PARTIALLY RESOLVED <date> (F-043).**` and state what is now named (coasts, seas, one port — interiors still unpeopled, nobody in the story has been there). §5.2 item 2 (:464): append the same marker + one sentence (the door is now charted to a named far shore; still unused). **V8 is NOT amended** — record in the row's neighborhood nothing; instead canon.md's new entry states the invariant survives (Gildmark remains the basin's only port; foreign harbors give the sister towns nothing).
- [ ] **Step 4: Amend `core-story.md:26`** — additive Thai sentence at the end of the paragraph (shipped-narrative amendment, DR-006 option 3; follow the localization-th register — meaning-first, no invented specifics): draft: `ในหอบันทึกของกิลด์มาร์ก มีแผนที่เดินเรือฉบับรวมที่จดชื่อชายฝั่งโพ้นทะเลไว้จากคำให้การของนายเรือ — จดไว้ ไม่ใช่เห็นมาเอง` ("Gildmark's record-hall keeps a compiled chart that writes down the far coasts' names from shipmasters' sworn accounts — written down, not seen firsthand."). The Archivist reviews the final sentence against the surrounding prose; "ไม่มีใครในเรื่องนี้เคยเห็น" and "ประตูเดียว" clauses stay intact (reports ≠ seeing; one door is still one door).
- [ ] **Step 5: Amend `canon.md`** — new §4 bullets (before the `### How news travels` heading): one bullet per named continent/sea/cap/lane in the canon.md register (bolded claim + reason + source pointer to A2/node ids), one bullet stating the V8-survival rule explicitly. New §6.2 rulings-table row: `| The wider world is charted from mariners' reports; reported ≠ surveyed; Gildmark stays the only door (F-043, DR-006 opt. 3) | §4 |`.
- [ ] **Step 6: Citation check** — grep every file:line citation you touched or moved (`grep -rn "core-story.md:26\|canon.md:1[89]" docs/ content/` and re-verify quoted text still sits at cited lines; state the grep's scope in the commit body). Run `node scripts/check_content.mjs` (FULL sweep, not `--only=spine` — story-graph + canon gates).
- [ ] **Step 7: Quality gate** — reviewer subagent with the story-content-writer + localization-th lens on the Thai sentence and the A2 doc; fix; re-run Step 6.
- [ ] **Step 8: Commit** — `git add docs/worldbuilding docs/story content/story && git commit -m "docs(canon): the wider world — A2 chart canon + DR-006 amendments (F-043)"`

---

### Task 8: Full verification sweep + ship prep

- [ ] **Step 1: Merge `release/1.8` into the feature branch** (established practice — BEFORE Gate 1). Resolve any drift; re-run `node scripts/check_spine_emit.mjs --check`.
- [ ] **Step 2: Gate 1** — `bash scripts/precheck.sh` → expect `13/13 PASS`.
- [ ] **Step 3: Gate-2 content sections locally** (they're not in precheck): `node scripts/check_content.mjs --require-complete` (if flagless full sweep is the committed form, run that), `node scripts/check_spine_emit.mjs --check`, `node scripts/check_map_render.mjs`, `node tools/mapforge/render-map.mjs --check`, `node --test tools/mapforge/tests/*.test.mjs`, `cd scripts && npm test`. Every command's exit code shown.
- [ ] **Step 4: Acceptance-criteria walk** — check all 6 ACs in the spec against evidence (paste command output per AC into the ship notes). AC 4's visual half: open `atlas-world.svg` in Chrome once more.
- [ ] **Step 5: Ship** — `/ps-release-workflow:ship` from the feature worktree (Gate 1 + merge to `release/1.8` + catalog update).

## Risks (watch during execution)

1. **G-OVERLAP lattice cost** — `gridIntersectionArea` samples a 0.25 km lattice over pairwise bbox intersections; three frame-scale ocean polygons may make the spine gate slow. Measure at Task 3 Step 5; if `--only=spine` exceeds ~30 s, shrink pairwise bbox overlap by keeping seams axis-aligned (bays are the only overlap bands) — do NOT touch the gate.
2. **`maxBytes` 262144** — if the budget report shows the node-set bytes near the raised 393216, trim polygon vertex counts (12–16 per ring is enough at 0.7 px/km).
3. **Region chord-splits of noisy rings** can produce slivers — reject splits where either part < 15% of the parent area (deterministic re-pick of the vertex pair).
4. **`curveLabel` textPath rendering in rsvg-convert** — verify the PNG actually shows the sea names at Task 6 Step 1 (rsvg supports textPath, but confirm visually; fallback is `lineLabel` on a straight baseline).
