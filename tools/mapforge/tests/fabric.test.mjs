// tools/mapforge/tests/fabric.test.mjs — Task 10a. The ring builders, the arc
// vertex cap and the water partition, tested on small synthetic grids where a
// failure names a function rather than "the pipeline", plus ONE real 800 x 800
// build for the claims that are only true of the real world.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  capArc, fitArcTopology, widestRing, quantiseRing, trunkRingCap,
  TRUNK_TIER_VERTEX_CAP, MAX_REGION_RING_POINTS, ARC_CAP_LADDER, capEpsilon,
  assignByQuota, ringsFromOwner, oceanSeedCell, interiorPointKm,
  enclosedLandmasses, cutCorridor, buildWaterPartition, buildSeaPartition,
  buildTrunkRings, buildRegionRings, buildCoastRings, plateOwnerField,
  buildFabricFile, hashOf, OCEAN_OWNER_BASE, CORRIDOR_HALF_WIDTH,
  townFeatureId, slugOf, townSlug, townFeatureIds,
} from "../lib/fabric.mjs";
import * as SETTLEMENTS from "../lib/passes/settlements.mjs";
import { makeGrid, FLAG } from "../lib/grid.mjs";
import { extractArcs, simplifyArc, assembleRings, DP_EPSILON_KM } from "../lib/arcs.mjs";
import { shoelaceArea, BIOMES } from "../../../scripts/lib/spine.mjs";
import { exactIntersectionArea } from "../../../scripts/lib/geometry.mjs";
import { terrainStream } from "../lib/seed.mjs";
import { applyPremiseMasks } from "../lib/passes/mask.mjs";
import { buildElevation, assignSubstrate } from "../lib/passes/elevation.mjs";
import { selectSeaLevelByRank, classifySea, CELL_AREA_KM2 } from "../lib/passes/sea-level.mjs";
import { priorityFlood, d8FlowDir, flowAccumulate } from "../lib/hydrology.mjs";
import { applyWinds } from "../lib/passes/winds.mjs";
import { carveWater } from "../lib/passes/water.mjs";
import { classifyBiomes } from "../lib/passes/biome.mjs";
import { partitionRegions } from "../lib/passes/partition.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const rj = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const MANIFEST = rj("content/world/manifest.json");
const DERIVED = rj("content/spine/derived.json");
const LOAD_BUDGET = rj("content/spine/load-budget.json");
const PREMISES = readdirSync(join(ROOT, "content/world/premises"))
  .filter((f) => f.endsWith(".json")).sort().map((f) => rj(`content/world/premises/${f}`));
const poly = (points) => ({ shape: "polygon", points, anchor: points[0] });

// ── the vertex cap: one-shot per arc, never per ring ──────────────────────

test("capArc is a ONE-SHOT simplification of the RAW points at a single epsilon", () => {
  // A ragged polyline with enough detail to survive several rungs.
  const pts = Array.from({ length: 120 }, (_, i) => [i * 0.5, (i % 7) * 0.5 - (i % 3) * 0.25]);
  const out = capArc({ points: pts, cap: 20, epsilonKm: DP_EPSILON_KM });
  assert.ok(out.length <= 20, `capArc returned ${out.length} vertices against a cap of 20`);
  // It must equal simplifyArc(RAW, eps) for the rung it settled on — NOT a
  // re-simplification of an already-simplified list, which is what tears a
  // shared boundary (plan :6193, STATE §5).
  let matched = -1;
  for (let k = 0; k <= 60; k++) {
    const c = simplifyArc({ points: pts, epsilonKm: capEpsilon({ rung: k }) });
    if (c.length === out.length && JSON.stringify(c) === JSON.stringify(out)) { matched = k; break; }
  }
  assert.ok(matched >= 1, "capArc's result is not any one-shot simplification of the raw points");
  // and the rung below it must still be over the cap — it takes the SMALLEST
  // epsilon that fits, so the damage is the least the cap admits.
  const below = simplifyArc({ points: pts, epsilonKm: capEpsilon({ rung: matched - 1 }) });
  assert.ok(below.length > 20, `rung ${matched - 1} already fit the cap (${below.length}) — capArc overshot`);
});

test("capArc under a cap it already meets is exactly the base one-shot", () => {
  const pts = [[0, 0], [1, 0.4], [2, 0], [3, 0.4], [4, 0]];
  assert.deepEqual(capArc({ points: pts, cap: 999 }), simplifyArc({ points: pts, epsilonKm: DP_EPSILON_KM }));
  assert.deepEqual(capArc({ points: pts, cap: Infinity }), simplifyArc({ points: pts, epsilonKm: DP_EPSILON_KM }));
});

// A ragged two-owner field: owner 0 left, owner 1 right, with a jagged seam.
function raggedPair({ w = 60, h = 40 } = {}) {
  const g = makeGrid({ w, h, cellKm: 0.5 });
  const owner = new Int16Array(g.n).fill(-1);
  for (let y = 0; y < h; y++) {
    const seam = 30 + ((y * 7) % 5) - ((y * 3) % 3);
    for (let x = 0; x < w; x++) {
      if (x < 4 || x >= w - 4 || y < 4 || y >= h - 4) continue;   // keep clear of the frame
      owner[y * w + x] = x < seam ? 0 : 1;
    }
  }
  return { g, owner };
}

test("the shared seam is BIT-IDENTICAL in both owners at every cap — no tear", () => {
  const { g, owner } = raggedPair();
  const { arcs } = extractArcs({ owner, w: g.w, h: g.h, cellKm: g.cellKm });
  const seamArcs = arcs.filter((a) => (a.left === 0 && a.right === 1) || (a.left === 1 && a.right === 0));
  assert.ok(seamArcs.length >= 1, "the fixture has no shared seam to tear");
  for (const cap of [Infinity, 64, 32, 16, 8]) {
    const simp = arcs.map((a) => ({ ...a, points: capArc({ points: a.points, cap }) }));
    const r0 = assembleRings({ arcs: simp, ownerId: 0 });
    const r1 = assembleRings({ arcs: simp, ownerId: 1 });
    const set0 = new Set(r0.rings[0].map((p) => `${p[0]},${p[1]}`));
    const seam = simp.find((a) => a.id === seamArcs[0].id).points;
    for (const p of seam)
      assert.ok(set0.has(`${p[0]},${p[1]}`), `cap ${cap}: seam vertex [${p}] is not in owner 0's ring`);
    const set1 = new Set(r1.rings[0].map((p) => `${p[0]},${p[1]}`));
    for (const p of seam)
      assert.ok(set1.has(`${p[0]},${p[1]}`), `cap ${cap}: seam vertex [${p}] is not in owner 1's ring`);
    // and the two areas must still sum to the census, cap by cap
    const cells = [0, 0];
    for (let i = 0; i < g.n; i++) if (owner[i] >= 0) cells[owner[i]]++;
    const sum = r0.areaKm2 + r1.areaKm2;
    assert.ok(Math.abs(sum - (cells[0] + cells[1]) * 0.25) < 1e-9,
      `cap ${cap}: the two owners no longer tile their census (${sum} vs ${(cells[0] + cells[1]) * 0.25})`);
  }
});

test("the PLAN's ring-level fitVertexCap tears the same seam — the reason capArc exists", () => {
  // Reproduces plan :6193-6201 verbatim so the finding cannot rot into folklore.
  const planFit = ({ ring, cap, epsilonKm = DP_EPSILON_KM }) => {
    let out = ring, eps = epsilonKm;
    for (let n = 0; n < 12 && out.length > cap; n++) {
      out = simplifyArc({ points: [...out, out[0]], epsilonKm: eps });
      out.pop();
      eps *= 2;
    }
    return out;
  };
  const { g, owner } = raggedPair();
  const { arcs } = extractArcs({ owner, w: g.w, h: g.h, cellKm: g.cellKm });
  const simp = arcs.map((a) => ({ ...a, points: simplifyArc({ points: a.points, epsilonKm: DP_EPSILON_KM }) }));
  const r0 = assembleRings({ arcs: simp, ownerId: 0 }).rings[0];
  const r1 = assembleRings({ arcs: simp, ownerId: 1 }).rings[0];
  const cap = Math.min(r0.length, r1.length) - 4;
  const p0 = planFit({ ring: r0, cap });
  const p1 = planFit({ ring: r1, cap });
  const shared = (a, b) => {
    const s = new Set(b.map((p) => `${p[0]},${p[1]}`));
    return a.filter((p) => s.has(`${p[0]},${p[1]}`)).length;
  };
  const before = shared(r0, r1), after = shared(p0, p1);
  assert.ok(after < before,
    `the plan's ring-level cap kept ${after} shared vertices of ${before} — if this ever stops ` +
    `dropping, re-read STATE §5 before deleting capArc`);
  // and the tear shows up as an area that no longer tiles
  const cells = [0, 0];
  for (let i = 0; i < g.n; i++) if (owner[i] >= 0) cells[owner[i]]++;
  const planSum = shoelaceArea({ points: p0 }) + shoelaceArea({ points: p1 });
  const arcSum = (() => {
    const s = arcs.map((a) => ({ ...a, points: capArc({ points: a.points, cap }) }));
    return assembleRings({ arcs: s, ownerId: 0 }).areaKm2 + assembleRings({ arcs: s, ownerId: 1 }).areaKm2;
  })();
  assert.equal(arcSum, (cells[0] + cells[1]) * 0.25, "the arc-level cap must still tile exactly");
  assert.notEqual(planSum, arcSum);
});

test("fitArcTopology brings every ring under the cap and reports one it cannot", () => {
  const { g, owner } = raggedPair();
  const { arcs } = extractArcs({ owner, w: g.w, h: g.h, cellKm: g.cellKm });
  const loose = fitArcTopology({ arcs, ownerIds: [["a", 0], ["b", 1]], ringCap: 10000 });
  assert.equal(loose.tightened, 0, "a cap nothing exceeds must tighten no arc");
  const problems = [];
  const tight = fitArcTopology({ arcs, ownerIds: [["a", 0], ["b", 1]], ringCap: 12, problems });
  for (const [label, r] of tight.assembled)
    assert.ok(widestRing(r) <= 12 || problems.some((p) => p.includes(label)),
      `${label} is over the cap at ${widestRing(r)} and nothing said so`);
  assert.ok(tight.tightened > 0, "the cap was met without tightening a single arc");
  // An impossible cap must REPORT rather than loop or lie.
  const hard = [];
  const impossible = fitArcTopology({ arcs, ownerIds: [["a", 0], ["b", 1]], ringCap: 3, problems: hard, what: "x" });
  assert.ok(hard.length > 0, "a cap below the arc-count floor must be named in problems");
  assert.ok(hard[0].includes("bounded by its ARC COUNT"));
  assert.ok(impossible.rounds < arcs.length * ARC_CAP_LADDER.length + 2, "the fit did not settle");
});

test("trunkRingCap reads the committed budget, and the effective cap is the GLOBAL term", () => {
  assert.equal(TRUNK_TIER_VERTEX_CAP, 800);
  assert.equal(LOAD_BUDGET.maxRingPoints, 160);
  assert.equal(trunkRingCap({ loadBudget: LOAD_BUDGET }), 160,
    "check_content.mjs:2592 takes min(maxRingPoints, VERTEX_CAP[tier]); a trunk ring built to the " +
    "plan's bare 800 fails G-VERTEX-BUDGET on the draft root");
  assert.equal(trunkRingCap({ loadBudget: { maxRingPoints: 4000 } }), 800);
  assert.throws(() => trunkRingCap({ loadBudget: {} }), /maxRingPoints/);
});

// ── the water partition ───────────────────────────────────────────────────

// A 40 x 40 grid (0.5 km cells = 20 x 20 km) with a 10-cell-wide land bar
// down the middle and sea either side. Small enough to reason about by hand.
function seaGrid() {
  const g = makeGrid({ w: 40, h: 40, cellKm: 0.5 });
  for (let i = 0; i < g.n; i++) {
    const x = i % g.w;
    if (x < 15 || x >= 25) g.flags[i] |= FLAG.SEA;
  }
  return g;
}

test("assignByQuota respects quotas exactly and is insertion-order independent", () => {
  const g = seaGrid();
  const mask = (i) => (g.flags[i] & FLAG.SEA) !== 0;
  const a = new Int16Array(g.n).fill(-1);
  const takenA = assignByQuota({ grid: g, owner: a, seeds: [0, g.n - 1], quotas: [200, 300], mask });
  assert.deepEqual(takenA, [200, 300]);
  const b = new Int16Array(g.n).fill(-1);
  const takenB = assignByQuota({ grid: g, owner: b, seeds: [g.n - 1, 0], quotas: [300, 200], mask });
  // Same partition, sources swapped: the (cost, cellIndex) tiebreak means the
  // CELLS assigned to a given seed do not depend on which seed was pushed first.
  assert.deepEqual([...a].map((v) => (v === 0 ? "s0" : v === 1 ? "s1" : ".")),
                   [...b].map((v) => (v === 0 ? "s1" : v === 1 ? "s0" : ".")));
  assert.deepEqual(takenB, [300, 200]);
});

test("assignByQuota never crosses its mask", () => {
  const g = seaGrid();
  const owner = new Int16Array(g.n).fill(-1);
  assignByQuota({ grid: g, owner, seeds: [0], quotas: [g.n], mask: (i) => (g.flags[i] & FLAG.SEA) !== 0 });
  for (let i = 0; i < g.n; i++)
    if ((g.flags[i] & FLAG.SEA) === 0) assert.equal(owner[i], -1, `land cell ${i} was claimed by an ocean`);
});

test("ringsFromOwner produces positively-wound rings under the vertex cap", () => {
  const g = seaGrid();
  const owner = new Int16Array(g.n).fill(-1);
  assignByQuota({ grid: g, owner, seeds: [0], quotas: [600], mask: (i) => (g.flags[i] & FLAG.SEA) !== 0 });
  const rings = ringsFromOwner({ grid: g, owner, count: 1, cap: 60 });
  const ring = rings.get(0).rings[0];
  assert.ok(ring.length >= 3 && ring.length <= 60, `ring has ${ring.length} vertices`);
  assert.ok(shoelaceArea({ points: ring }) > 0, "G-POLY requires a strictly positive signed shoelace");
});

test("enclosedLandmasses SEES an enclosure and is quiet without one", () => {
  // A 3-cell island in the middle of a fully-claimed sea: enclosed.
  const g = makeGrid({ w: 30, h: 30, cellKm: 0.5 });
  for (let i = 0; i < g.n; i++) { g.flags[i] |= FLAG.SEA; g.plate[i] = -1; }
  for (let y = 12; y < 18; y++) for (let x = 12; x < 18; x++) {
    const i = y * g.w + x; g.flags[i] &= ~FLAG.SEA; g.plate[i] = 0;
  }
  const owner = new Int16Array(g.n).fill(-1);
  for (let i = 0; i < g.n; i++) owner[i] = (g.flags[i] & FLAG.SEA) ? 13 : 0;
  assert.deepEqual([...enclosedLandmasses({ grid: g, owner, oceanValue: 13 })], [0]);
  // now cut a corridor and the enclosure is gone
  const reserved = new Uint8Array(g.n);
  const cut = cutCorridor({ grid: g, plate: 0, reserved, halfWidth: 1 });
  assert.ok(cut > 0, "the corridor reserved no cells");
  for (let i = 0; i < g.n; i++) if (reserved[i]) owner[i] = -1;
  assert.deepEqual([...enclosedLandmasses({ grid: g, owner, oceanValue: 13 })], [],
    "a corridor to the frame edge must break the enclosure");
});

test("interiorPointKm answers a point INSIDE a concave owner, where a centroid does not", () => {
  // A C-shape: the vertex mean falls in the mouth, outside the shape.
  const g = makeGrid({ w: 40, h: 40, cellKm: 0.5 });
  const owner = new Int16Array(g.n).fill(-1);
  for (let y = 6; y < 34; y++) for (let x = 6; x < 34; x++) {
    if (x >= 14 && y >= 14 && y < 26) continue;      // the mouth, open to the east
    owner[y * g.w + x] = 0;
  }
  const p = interiorPointKm({ grid: g, owner, value: 0 });
  const cell = Math.floor(p[1] / g.cellKm) * g.w + Math.floor(p[0] / g.cellKm);
  assert.equal(owner[cell], 0, `interiorPointKm returned [${p}], which is not an owned cell`);
  const rings = ringsFromOwner({ grid: g, owner, count: 1, cap: 400 }).get(0).rings[0];
  let mx = 0, my = 0;
  for (const [x, y] of rings) { mx += x; my += y; }
  const meanCell = Math.floor((my / rings.length) / g.cellKm) * g.w + Math.floor((mx / rings.length) / g.cellKm);
  assert.notEqual(owner[meanCell], 0,
    "the fixture is not concave enough to separate the centroid from the interior point");
});

// ── the fabric record ─────────────────────────────────────────────────────

test("buildFabricFile emits pinReceipts even when no pinned layer exists", () => {
  const doc = buildFabricFile({
    premise: { id: "c03" }, generator: { name: "mapforge", version: "3.0.0" },
    seaLevel: 0.4213, cellKm: 0.5, census: { land: 1, lake: 0, unowned: 0 },
    ownerHistogram: {}, regions: [], instances: [], settlements: [], roads: [], dungeonAnchors: [],
  });
  assert.deepEqual(doc.pinReceipts, [], "G-PIN-SAT reads this key; an absent key makes it pass vacuously");
  assert.equal(doc.continent, "c03");
  assert.equal(doc.premise, "content/world/premises/continent-03.json");
  assert.equal(doc.seaLevel, 0.42, "every committed number passes q() first");
});

test("buildFabricFile PROJECTS a settlement, it does not spread it", () => {
  const doc = buildFabricFile({
    premise: { id: "c02" }, generator: {}, seaLevel: 0.1, cellKm: 0.5,
    census: { land: 0, lake: 0, unowned: 0 }, ownerHistogram: {}, regions: [], instances: [],
    settlements: [{ id: "c02/s01", title: null, rank: "capital", atKm: [1, 2], cell: [2, 4],
                    region: "c02/r01", continent: "c02", score: 0.5,
                    portEligible: true, pinned: false, tie: 7 }],
    roads: [], dungeonAnchors: [],
  });
  // `portEligible` and `tie` are working keys of the pass that never reach
  // the fabric; `pinned` reaches it ONLY when true (Plan D Task 10: the flag
  // gWorldPoi exempts from a reported region's zero rule). fabric-file.schema
  // .json is additionalProperties:false, so a spread would fail validation
  // with an ajv message naming neither the key nor the pass.
  assert.deepEqual(Object.keys(doc.settlements[0]).sort(),
    ["atKm", "cell", "continent", "id", "rank", "region", "score", "title"]);
  const pinnedDoc = buildFabricFile({
    premise: { id: "c02" }, generator: {}, seaLevel: 0.1, cellKm: 0.5,
    census: { land: 0, lake: 0, unowned: 0 }, ownerHistogram: {}, regions: [], instances: [],
    settlements: [{ id: "c-town-gildmark", title: "Gildmark", rank: "capital", atKm: [1, 2],
                    cell: [2, 4], region: "c02/r01", continent: "c02", score: 1,
                    portEligible: false, pinned: true }],
    roads: [], dungeonAnchors: [],
  });
  assert.deepEqual(Object.keys(pinnedDoc.settlements[0]).sort().includes("pinned"), true);
  assert.equal(pinnedDoc.settlements[0].pinned, true);
});

test("hashOf is a sha256 in the committed grammar", () => {
  assert.match(hashOf(Buffer.from("x")), /^sha256:[0-9a-f]{64}$/);
});

test("the town id grammar is RE-EXPORTED from settlements.mjs, never redefined", () => {
  assert.equal(townFeatureId, SETTLEMENTS.townFeatureId);
  assert.equal(slugOf, SETTLEMENTS.slugOf);
  assert.equal(townSlug, SETTLEMENTS.townSlug);
  assert.equal(townFeatureIds, SETTLEMENTS.townFeatureIds);
  // and the titleless-PIN refusal seam 5 shipped is still the behaviour here
  assert.throws(() => townSlug({ settlement: { id: "c-town-gildmark", pinned: true, title: null } }),
    /never from its id/);
  assert.equal(townSlug({ settlement: { id: "c02/s01", title: null } }), "c02-s01");
});

// ── THE REAL WORLD ────────────────────────────────────────────────────────
// Built ONCE, from the committed TERRAIN STREAM.

let REAL = null;
function realWorld() {
  if (REAL) return REAL;
  const stream = terrainStream({ worldSeed: MANIFEST.seed });
  assert.equal(stream, DERIVED["n-atlas"].resolvedSeedStreams.terrain,
    "the terrain stream is not the one committed in derived.json");
  const grid = makeGrid({ w: 800, h: 800, cellKm: 0.5 });
  const { maskField } = applyPremiseMasks({ grid, premises: PREMISES, stream });
  buildElevation({ grid, premises: PREMISES, maskField, stream });
  assignSubstrate({ grid, premises: PREMISES, maskField });
  const sea = selectSeaLevelByRank({
    elev: grid.elev, targetLandCells: MANIFEST.budget.grossLandPolygonKm2 / CELL_AREA_KM2 });
  classifySea({ grid, seaLevel: sea.seaLevel });
  const filled = priorityFlood({ elev: grid.elev, w: grid.w, h: grid.h });
  const dir = d8FlowDir({ elev: filled, w: grid.w, h: grid.h });
  grid.flowDir.set(dir);
  grid.flowAcc.set(flowAccumulate({ flowDir: dir, w: grid.w, h: grid.h }));
  applyWinds({ grid, stream });
  carveWater({ grid, premises: PREMISES, manifest: MANIFEST });
  classifyBiomes({ grid, premises: PREMISES, BIOMES });
  const part = partitionRegions({ grid, premises: PREMISES, manifest: MANIFEST, stream });
  REAL = { grid, sea, part, stream };
  return REAL;
}

test("REAL WORLD — region rings CARRY the declared area, which one ring cannot", () => {
  const { grid, part } = realWorld();
  const problems = [];
  const built = buildRegionRings({ grid, regions: part.regions, problems });
  assert.equal(built.rings.size, 160);
  let extraLobes = 0, holeArea = 0, worstShort = 0, worstShortId = null;
  let multi = 0, holed = 0, worstDrift = 0, worstId = null, worstRing = 0;
  for (const rec of part.regions) {
    const r = built.rings.get(rec.id);
    assert.ok(r, `${rec.id} produced no ring`);
    if (r.rings.length > 1) multi++;
    if (r.holes.length > 0) holed++;
    if (r.widest > worstRing) worstRing = r.widest;
    assert.ok(r.widest <= MAX_REGION_RING_POINTS,
      `${rec.id} ring has ${r.widest} vertices > ${MAX_REGION_RING_POINTS}`);
    // the plan's projection — rings[0] alone — against the whole shape
    const ring0 = shoelaceArea({ points: r.rings[0] });
    for (let i = 1; i < r.rings.length; i++) extraLobes += shoelaceArea({ points: r.rings[i] });
    for (const h of r.holes) holeArea += shoelaceArea({ points: h });
    if (rec.areaKm2 - ring0 > worstShort) { worstShort = rec.areaKm2 - ring0; worstShortId = rec.id; }
    const drift = Math.abs(r.areaKm2 - rec.areaKm2) / rec.areaKm2 * 100;
    if (drift > worstDrift) { worstDrift = drift; worstId = rec.id; }
    for (const ring of [...r.rings, ...r.holes])
      assert.ok(shoelaceArea({ points: ring }) > 0, `${rec.id} has a non-positively-wound ring`);
  }
  // GOLDENS MOVED, 2026-08-22, seam-6 adjudicating fix pass — 18 -> 19 and
  // 3 -> 6, one event: `assembleRings` now splits a closed chain at its
  // repeated vertices, so the four rings that used to pinch through a lattice
  // corner come back as simple loops. c01/r10 becomes three lobes; c02/r13,
  // c02/r22 and c05/r19 each declare the one-cell notch they used to fold into
  // their outer ring. Every `areaKm2` is unchanged (the pinched shoelace was
  // already right) — what moved is only whether the shape can be MEASURED:
  // `scripts/lib/geometry.mjs` refuses a non-simple ring, so before the split
  // `exactIntersectionArea(c02/r13, n-cluster1)` returned 0.00 for a region
  // lying wholly inside n-cluster1, and now returns 471.00.
  assert.equal(multi, 19, "19 of the 160 regions have a boundary of more than one ring");
  assert.equal(holed, 6);
  // THE INVARIANT THOSE TWO COUNTS EXIST TO PROTECT. A count can be met by a
  // pinched ring; strict simplicity cannot, and it is what every downstream
  // consumer (Plan D's pinReceipts containment, Plan E's ink, G-OVERLAP)
  // actually needs. Region rings had no equivalent of the trunk's
  // "sixteen DISJOINT polygons" test until this line.
  for (const rec of part.regions) {
    const r = built.rings.get(rec.id);
    for (const ring of [...r.rings, ...r.holes])
      assert.equal(new Set(ring.map((p) => p.join(","))).size, ring.length,
        `${rec.id} emits a ring that repeats a vertex — exactIntersectionArea refuses it and ` +
        `reports 0 km2 of overlap, which is indistinguishable from "genuinely disjoint"`);
  }
  // THE AGGREGATE HIDES IT, and that is the whole point of measuring both
  // terms. Taking rings[0] alone drops 384.88 km² of second lobes while
  // silently ADDING 358.88 km² of enclosed holes, so the world-wide net is
  // 29.00 km² — 0.05% — and a fabric built that way would look fine in total
  // while c04/r13 alone was short 162.50 of its declared 470.50 (34.5%).
  assert.ok(extraLobes > 380 && holeArea > 350,
    `lobes outside rings[0] ${extraLobes.toFixed(2)} km², holes inside it ${holeArea.toFixed(2)} km²; ` +
    `STATE §5 measured 384.50 for the first`);
  assert.ok(worstShort > 150,
    `the worst single region loses ${worstShort.toFixed(2)} km² under the plan's single-'ring' shape ` +
    `(${worstShortId}); STATE §13 measured c04/r13 at 162.50 of 470.50`);
  assert.equal(worstShortId, "c04/r13");
  assert.ok(worstDrift < 1,
    `worst region area drift ${worstDrift.toFixed(3)}% on ${worstId} — the x1.125 cap ladder is what ` +
    `keeps this under 1%; a doubling ladder measured 3.672%`);
  assert.equal(problems.length, 0, problems.join("\n"));
  // the two named regions STATE §13 pins
  const r13 = built.rings.get("c04/r13"), r19 = built.rings.get("c04/r19"), r02 = built.rings.get("c07/r02");
  assert.equal(r13.rings.length, 2);
  assert.equal(r19.rings.length, 2);
  assert.equal(r02.rings.length, 5);
  for (const [id, r] of [["c04/r13", r13], ["c04/r19", r19], ["c07/r02", r02]]) {
    const declared = part.regions.find((x) => x.id === id).areaKm2;
    assert.ok(Math.abs(r.areaKm2 - declared) / declared < 0.01,
      `${id} draws ${r.areaKm2} against a declared ${declared}`);
    assert.ok(shoelaceArea({ points: r.rings[0] }) < declared * 0.999,
      `${id} is multi-ring, so rings[0] alone MUST be short of the declared area`);
  }
  assert.ok(built.tightened <= 4,
    `${built.tightened} of ${built.arcCount} arcs were tightened; the longest-arc rule keeps it at 1`);
});

test("REAL WORLD — what the 160-point cap COSTS the coastline, pinned so it cannot worsen silently", () => {
  // The module header used to characterise `fitArcTopology` with the REGION
  // topology's figures ("5 rounds, ONE arc of 532 tightened") as though they
  // described the function. On the TRUNK topology — the case the module exists
  // for — it is an order of magnitude more aggressive, and nothing saw it,
  // because every trunk gate here is an AREA gate and the areas hold to 1.3%.
  //
  // ADJUDICATED (seam-6 fix pass) as ACCEPTABLE OUTPUT, not a defect to bound:
  // an ocean's one-shot ring is 1,112 vertices against G-VERTEX-BUDGET's
  // effective cap of 160, so ~85% has to go by arithmetic, and a floor on
  // vertices-per-arc would only move the failure to a red G-VERTEX-BUDGET on
  // the draft root. The single lever is `load-budget.json`'s `maxRingPoints`,
  // which Plan C's acceptance criterion 9 forbids it from touching.
  //
  // What this test buys is that the cost is now a NUMBER under a golden rather
  // than a shape nobody measured. It bounds the tightening from the harmful
  // side only: fewer tightened arcs and a wider worst ring are both fine.
  const { grid } = realWorld();
  const cap = trunkRingCap({ loadBudget: LOAD_BUDGET });
  const problems = [];
  const trunk = buildTrunkRings({ grid, premises: PREMISES, manifest: MANIFEST, ringCap: cap, problems });
  assert.equal(problems.length, 0, problems.join("\n"));
  assert.equal(trunk.arcCount, 70, "the trunk arc topology changed shape");
  assert.ok(trunk.tightened <= 22,
    `${trunk.tightened} of ${trunk.arcCount} trunk arcs were tightened below the one-shot epsilon; ` +
    `22 is the measured cost of the committed 160-point cap and MORE is a regression`);
  assert.ok(trunk.rounds <= 89, `${trunk.rounds} fitting rounds; 89 is the measured figure`);
  // The worst-hit owner, by name. c06 Reedstrand is a 3,156 km2 landmass whose
  // whole placement is a hexadecagon; its one-shot coast would be 154 points.
  const c06 = trunk.rings.get("c06");
  assert.ok(c06.ring.length >= 16,
    `n-reedstrand's placement is ${c06.ring.length} vertices — below the measured 16, the trunk ` +
    `polygon has stopped resembling the landmass at all`);
  // WHERE THE DETAIL SURVIVES, asserted rather than promised, because this is
  // the half Plan E has to act on: the fabric coast contour is an order of
  // magnitude finer than the placement on exactly the owner the cap hurt most.
  const coast = buildCoastRings({ grid, premises: PREMISES, stream: () => 0.5, problems });
  const c06Coast = coast.get("c06");
  assert.ok(c06Coast.rings[0].length > 8 * c06.ring.length,
    `c06's fabric outerRing is ${c06Coast.rings[0].length} points against a ${c06.ring.length}-point ` +
    `placement; if these ever converge, Plan E has lost the coastline it is meant to ink`);
});

test("REAL WORLD — the trunk is sixteen DISJOINT polygons inside the committed vertex cap", () => {
  const { grid } = realWorld();
  const cap = trunkRingCap({ loadBudget: LOAD_BUDGET });
  const problems = [];
  const trunk = buildTrunkRings({ grid, premises: PREMISES, manifest: MANIFEST, ringCap: cap, problems });
  assert.equal(problems.length, 0, problems.join("\n"));
  assert.equal(trunk.rings.size, 16);
  const polys = [];
  for (const [label, r] of trunk.rings) {
    // Asserted against the COMMITTED number, not against `cap` — using the
    // value the build was handed would make this a tautology.
    assert.ok(r.ring.length <= LOAD_BUDGET.maxRingPoints,
      `G-VERTEX-BUDGET: ${label} ring has ${r.ring.length} vertices > ${LOAD_BUDGET.maxRingPoints}`);
    assert.equal(r.holes, 0, `${label} encloses ${r.holes} hole(s) — its polygon would swallow them`);
    assert.equal(r.lobes, 1, `${label} has ${r.lobes} disjoint lobes`);
    assert.ok(shoelaceArea({ points: r.ring }) > 0, `${label} is not positively wound`);
    polys.push([label, r]);
  }
  // G-OVERLAP, on the real numbers, at the real limit.
  let pairSum = 0;
  for (let i = 0; i < polys.length; i++)
    for (let j = i + 1; j < polys.length; j++) {
      const a = poly(polys[i][1].ring), b = poly(polys[j][1].ring);
      const probs = [];
      const inter = exactIntersectionArea({ a, b, problems: probs });
      assert.equal(probs.length, 0, `${polys[i][0]} / ${polys[j][0]}: ${probs.join("; ")}`);
      const limit = 0.005 * Math.min(shoelaceArea({ points: a.points }), shoelaceArea({ points: b.points }));
      assert.ok(inter <= limit,
        `G-OVERLAP ${polys[i][0]} ∩ ${polys[j][0]}: ${inter.toFixed(2)} over limit ${limit.toFixed(2)}`);
      pairSum += inter;
    }
  assert.equal(pairSum, 0,
    "one shared arc topology means the sixteen polygons tile exactly; any non-zero here is a torn seam");
  // the frame closes on the committed budget
  const land = PREMISES.reduce((s, p) => s + shoelaceArea({ points: trunk.rings.get(p.id).ring }), 0);
  const ocean = MANIFEST.oceans.reduce((s, o) => s + shoelaceArea({ points: trunk.rings.get(o.id).ring }), 0);
  const residual = 160000 - land - ocean;
  assert.ok(Math.abs(land - MANIFEST.budget.grossLandPolygonKm2) / MANIFEST.budget.grossLandPolygonKm2 <= 0.03,
    `land polygons total ${land.toFixed(1)} vs budget ${MANIFEST.budget.grossLandPolygonKm2}`);
  assert.ok(Math.abs(ocean - MANIFEST.budget.oceanPolygonKm2) / MANIFEST.budget.oceanPolygonKm2 <= 0.03,
    `ocean polygons total ${ocean.toFixed(1)} vs budget ${MANIFEST.budget.oceanPolygonKm2}`);
  assert.ok(Math.abs(residual - MANIFEST.budget.interstitialKm2) / MANIFEST.budget.interstitialKm2 <= 0.25,
    `interstitial ${residual.toFixed(1)} km² vs budget ${MANIFEST.budget.interstitialKm2} — without the ` +
    `ocean polygons this is ~94,400 and G-ATLAS-ROLLUP cannot hold`);
  assert.ok(residual / 160000 > 0.005, "an interstitial at or below 0.5% is FORBIDDEN to be declared");
  // the anchors are inside their own rings (G-ANCHOR)
  for (const [label, r] of trunk.rings) {
    const inter = exactIntersectionArea({ a: poly([[r.anchor[0] - 0.05, r.anchor[1] - 0.05],
      [r.anchor[0] + 0.05, r.anchor[1] - 0.05], [r.anchor[0] + 0.05, r.anchor[1] + 0.05],
      [r.anchor[0] - 0.05, r.anchor[1] + 0.05]]), b: poly(r.ring) });
    assert.ok(inter > 0.009, `${label}: anchor [${r.anchor}] is not inside its own placement`);
  }
});

test("REAL WORLD — the corridor loop is LOAD-BEARING: without it three oceans enclose four landmasses", () => {
  const { grid } = realWorld();
  // the partition the plan describes: no corridors at all
  const cellKm2 = 0.25;
  const quotas = MANIFEST.oceans.map((o) => Math.round(o.polygonKm2 / cellKm2));
  const owner = new Int16Array(grid.n).fill(-1);
  for (let i = 0; i < grid.n; i++)
    if (grid.plate[i] >= 0 && (grid.flags[i] & FLAG.SEA) === 0) owner[i] = grid.plate[i];
  const water = new Int16Array(grid.n).fill(-1);
  assignByQuota({ grid, owner: water, quotas,
    seeds: MANIFEST.oceans.map((o, j) => oceanSeedCell({ grid, index: j })),
    mask: (i) => (grid.flags[i] & FLAG.SEA) !== 0 });
  for (let i = 0; i < grid.n; i++) if (water[i] >= 0) owner[i] = OCEAN_OWNER_BASE + water[i];
  const enclosed = new Set();
  for (let j = 0; j < 3; j++)
    for (const k of enclosedLandmasses({ grid, owner, oceanValue: OCEAN_OWNER_BASE + j })) enclosed.add(k);
  assert.deepEqual([...enclosed].sort((a, b) => a - b).map((k) => PREMISES[k].id),
    ["c02", "c06", "c07", "c10"],
    "the plan's un-corridored water partition must still enclose these four, or the corridor code is dead");
  // and the enclosure is not academic: the outer ring swallows them
  const { arcs } = extractArcs({ owner, w: grid.w, h: grid.h, cellKm: grid.cellKm });
  const simp = arcs.map((a) => ({ ...a, points: simplifyArc({ points: a.points, epsilonKm: DP_EPSILON_KM }) }));
  const o01 = assembleRings({ arcs: simp, ownerId: OCEAN_OWNER_BASE });
  assert.ok(o01.holes.length >= 1);
  const swallowed = shoelaceArea({ points: o01.rings[0] }) - o01.areaKm2;
  assert.ok(swallowed > 15000,
    `the un-corridored Galereach polygon would contain ${swallowed.toFixed(0)} km² it does not own`);
});

test("REAL WORLD — the corridors ARE the interstitial budget, to the cell", () => {
  const { grid } = realWorld();
  const problems = [];
  const water = buildWaterPartition({ grid, premises: PREMISES, manifest: MANIFEST, problems });
  assert.equal(problems.length, 0, problems.join("\n"));
  assert.equal(water.passes, 2, "the corridor loop settles in two passes on this world");
  assert.deepEqual(water.corridors.map((c) => c.continent), ["c02", "c06", "c07", "c10", "c13"]);
  const reserved = water.reserved.reduce((a, b) => a + b, 0);
  assert.equal(reserved, 1020, `${reserved} cells reserved; measured 1,020 (255.0 km²)`);
  assert.equal(water.unclaimedSeaCells * 0.25, MANIFEST.budget.interstitialKm2,
    "the water left over after the three quotas IS the committed interstitial");
  MANIFEST.oceans.forEach((o, j) =>
    assert.equal(water.taken[j] * 0.25, o.polygonKm2, `${o.id} did not fill its committed polygonKm2`));
});

test("REAL WORLD — every sea is a strict subset of its own ocean", () => {
  const { grid } = realWorld();
  const cap = trunkRingCap({ loadBudget: LOAD_BUDGET });
  const problems = [];
  const trunk = buildTrunkRings({ grid, premises: PREMISES, manifest: MANIFEST, ringCap: cap, problems });
  assert.equal(trunk.seas.size, 9);
  for (const s of MANIFEST.seas) {
    const sea = trunk.seas.get(s.id);
    const ocean = trunk.rings.get(s.ocean);
    assert.ok(sea.ring.length <= LOAD_BUDGET.maxRingPoints,
      `G-VERTEX-BUDGET: ${s.id} ring has ${sea.ring.length} vertices > ${LOAD_BUDGET.maxRingPoints}`);
    assert.equal(sea.holes, 0);
    const own = shoelaceArea({ points: sea.ring });
    const probs = [];
    const inter = exactIntersectionArea({ a: poly(sea.ring), b: poly(ocean.ring), problems: probs });
    // A REFUSED ring returns 0, which is indistinguishable from "disjoint" —
    // so the collector is not optional here, it is half the assertion.
    assert.deepEqual(probs, [], `${s.id} or ${s.ocean} is not triangulable`);
    // TOLERANCE TIGHTENED, 2026-08-22 (seam-6 fix pass). This was
    // `Math.abs(inter - own) < 0.5`, and the 0.5 km² was pure slack: the sea
    // and its ocean are traced from DIFFERENT topologies, so a sliver looked
    // plausible — but there is no sliver. Measured across the whole margin
    // ladder, the area of a sea lying OUTSIDE its ocean is EXACTLY 0.000 at
    // every margin of 2 cells or more, and the slack only ever hid a real
    // leak: at `SEA_MARGIN_CELLS = 1` it is 0.230 km² on s06 and the old
    // tolerance passed it. Assert the direction that matters — nothing of the
    // child outside the parent — at zero.
    assert.ok(own - inter <= 1e-6,
      `G-CONTAIN ${s.id}: ${(own - inter).toFixed(3)} km² of it lies OUTSIDE ${s.ocean} ` +
      `(own ${own.toFixed(2)}, intersection ${inter.toFixed(2)})`);
    assert.ok(Math.abs(own - s.polygonKm2) / s.polygonKm2 <= 0.03,
      `${s.id} draws ${own.toFixed(1)} km² against a committed ${s.polygonKm2}`);
  }
  assert.equal(problems.length, 0, problems.join("\n"));
});

test("REAL WORLD — the fabric coast contour is finer than the trunk ring, and both are the same world", () => {
  const { grid, stream } = realWorld();
  const problems = [];
  const coast = buildCoastRings({ grid, premises: PREMISES, stream, problems });
  assert.equal(problems.length, 0, problems.join("\n"));
  const trunk = buildTrunkRings({ grid, premises: PREMISES, manifest: MANIFEST,
    ringCap: trunkRingCap({ loadBudget: LOAD_BUDGET }), problems: [] });
  const plate = plateOwnerField({ grid });
  const cells = new Int32Array(PREMISES.length);
  for (let i = 0; i < grid.n; i++) if (plate[i] >= 0) cells[plate[i]]++;
  let worst = 0, worstId = null;
  PREMISES.forEach((p, k) => {
    const c = coast.get(p.id), t = trunk.rings.get(p.id);
    assert.ok(c.rings[0].length > t.ring.length,
      `${p.id}: the fabric contour (${c.rings[0].length}) is not finer than the trunk ring (${t.ring.length})`);
    // G-TRUNK-AREA's ±3% is what pins the two together.
    const d = Math.abs(shoelaceArea({ points: t.ring }) - c.areaKm2) / c.areaKm2 * 100;
    if (d > worst) { worst = d; worstId = p.id; }
    assert.ok(d <= 3, `${p.id}: trunk ring is ${d.toFixed(2)}% off the fabric contour (G-TRUNK-AREA ±3%)`);
    const census = cells[k] * 0.25;
    assert.ok(Math.abs(c.areaKm2 - census) / census < 0.01,
      `${p.id}: the fabric contour draws ${c.areaKm2.toFixed(2)} against a cell census of ${census}`);
  });
  assert.ok(worst < 3, `worst trunk-vs-fabric drift ${worst.toFixed(2)}% on ${worstId}`);
});
