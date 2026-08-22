// tools/mapforge/tests/roads.test.mjs — Task 9b (P12 roads, sea lanes, rivers).
//
// The REAL-WORLD proof for this pass lives in settlements.test.mjs's civic
// block, because routeRoads consumes placeSettlements' output and the 800 x 800
// world costs ~4.3 s to build: one build, one process. This file is the
// fixture half — the rules, each fired on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGrid, FLAG, idx } from "../lib/grid.mjs";
import { placeSettlements } from "../lib/passes/settlements.mjs";
import { routeRoads, traceTrunkRivers, stepCost, SLOPE_PENALTY, RIVER_CROSSING } from "../lib/passes/roads.mjs";
import { coastWorld, ownRegions, regions, PREMISES, M, SETTLEMENT_STREAM } from "./fixtures/coast-world.mjs";

function settled() {
  const grid = coastWorld(); ownRegions(grid);
  const regs = regions();
  const s = placeSettlements({ grid, premises: PREMISES, regions: regs, manifest: M,
                               stream: SETTLEMENT_STREAM });
  return { grid, regs, settlements: s.settlements };
}

test("the cost constants are the plan's", () => {
  assert.equal(SLOPE_PENALTY, 26);
  assert.equal(RIVER_CROSSING, 6);
});

test("stepCost charges slope, diagonals and river crossings, and nothing else", () => {
  const grid = makeGrid({ w: 4, h: 4, cellKm: 2 });
  const a = idx({ grid, cx: 1, cy: 1 }), b = idx({ grid, cx: 2, cy: 1 });
  grid.elev[a] = 0.3; grid.elev[b] = 0.3;
  assert.equal(stepCost({ grid, from: a, to: b, diagonal: false }), 2);
  assert.equal(stepCost({ grid, from: a, to: b, diagonal: true }), 2 * 1.4142135623730951);
  // `elev` is a Float32Array, so the expectation is computed from the STORED
  // values: 0.4 - 0.3 in float32 is 0.10000000149011612, not 0.1.
  grid.elev[b] = 0.4;                                   // climbing
  const up = grid.elev[b] - grid.elev[a];
  assert.equal(stepCost({ grid, from: a, to: b, diagonal: false }), 2 * (1 + SLOPE_PENALTY * up));
  grid.elev[b] = 0.2;                                   // descending costs the same
  const down = grid.elev[a] - grid.elev[b];
  assert.equal(stepCost({ grid, from: a, to: b, diagonal: false }), 2 * (1 + SLOPE_PENALTY * down));
  assert.ok(Math.abs(up - down) < 1e-7, "the fixture's climb and descent are not the same size");
  grid.elev[b] = 0.3; grid.flags[b] |= FLAG.RIVER;
  assert.equal(stepCost({ grid, from: a, to: b, diagonal: false }), 2 + RIVER_CROSSING);
});

test("routeRoads asserts the grid.owner -> regions[] join, exactly as placeSettlements does", () => {
  // AN UNDECLARED MUTATION SURVIVOR until this fixture existed: deleting
  // `assertRegionIndex` from routeRoads left all five suites green, while the
  // record credited the guard as "used by P11 and P12" (review J). P11's copy
  // was covered and P12's was not — the shape of a guard that is credited and
  // unenforced. The road raster is masked by `grid.owner`, so a regions[] whose
  // order does not match the index would confine a continent's roads to another
  // continent's cells with problems: [].
  const { grid, regs, settlements } = settled();
  assert.throws(() => routeRoads({ grid, settlements, regions: [...regs].reverse() }),
    /^Error: roads: .*grid\.owner indexes regions\[\]/s);
  assert.throws(() => routeRoads({ grid, settlements, regions: regs.slice(0, 4) }),
    /^Error: roads: .*grid\.regionIds has/s);
});

test("routeRoads connects every settlement into one component", () => {
  const { grid, regs, settlements } = settled();
  const r = routeRoads({ grid, settlements, regions: regs });
  assert.deepEqual(r.problems, []);
  assert.equal(r.roads.length, settlements.length - 1, "an MST over n settlements has n-1 edges");
  const adj = new Map(settlements.map((x) => [x.id, []]));
  for (const road of r.roads) { adj.get(road.from).push(road.to); adj.get(road.to).push(road.from); }
  const seen = new Set([settlements[0].id]);
  const queue = [settlements[0].id];
  while (queue.length) for (const n of adj.get(queue.pop())) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  assert.equal(seen.size, settlements.length, "the road network is disconnected");
  assert.equal(new Set(r.roads.map((x) => x.id)).size, r.roads.length, "duplicate road id");
  for (const road of r.roads) {
    assert.match(road.id, /^c01\/rd\d\d$/);
    assert.ok(road.km > 0);
    assert.ok(road.points.length >= 2);
  }
});

test("road points never cross a sea cell", () => {
  const { grid, regs, settlements } = settled();
  const r = routeRoads({ grid, settlements, regions: regs });
  for (const road of r.roads)
    for (const [x, y] of road.points) {
      const i = idx({ grid, cx: Math.floor(x / grid.cellKm), cy: Math.floor(y / grid.cellKm) });
      assert.equal(grid.flags[i] & FLAG.SEA, 0, `road ${road.id} crosses the sea at ${x},${y}`);
    }
});

test("a road stays on its OWN continent's owned land", () => {
  // Four pairs of landmasses touch on the refitted mask, so "anything that is
  // not sea" is not the same raster as "this continent". Here: two plates that
  // share a land border, one settlement pair per plate.
  const grid = makeGrid({ w: 60, h: 20, cellKm: 1 });
  grid.biomeNames = ["meadow"];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 60; x++) {
    const i = idx({ grid, cx: x, cy: y });
    if (y >= 5 && y < 15) { grid.plate[i] = x < 30 ? 0 : 1; grid.elev[i] = 0.3; }
    else { grid.plate[i] = -1; grid.elev[i] = 0.28; grid.flags[i] |= FLAG.SEA; }
  }
  const regs = [
    { id: "cA/r01", continent: "cA", survey: "surveyed", adjacent: [] },
    { id: "cB/r01", continent: "cB", survey: "surveyed", adjacent: [] },
  ];
  for (let i = 0; i < grid.n; i++) if (grid.plate[i] >= 0) grid.owner[i] = grid.plate[i];
  // cA's two settlements sit either side of a river the direct route would
  // avoid by detouring across cB. Simpler and sharper: put one cA settlement on
  // each end and assert no point leaves cA.
  const settlements = [
    { id: "cA/s01", continent: "cA", rank: "hub", cell: [2, 7], atKm: [2.5, 7.5], region: "cA/r01" },
    { id: "cA/s02", continent: "cA", rank: "village", cell: [28, 12], atKm: [28.5, 12.5], region: "cA/r01" },
    { id: "cB/s01", continent: "cB", rank: "hub", cell: [32, 7], atKm: [32.5, 7.5], region: "cB/r01" },
    { id: "cB/s02", continent: "cB", rank: "village", cell: [58, 12], atKm: [58.5, 12.5], region: "cB/r01" },
  ];
  const r = routeRoads({ grid, settlements, regions: regs });
  assert.deepEqual(r.problems, []);
  assert.equal(r.roads.length, 2, "one leg per continent");
  for (const road of r.roads)
    for (const [x, y] of road.points) {
      const i = idx({ grid, cx: Math.floor(x), cy: Math.floor(y) });
      assert.equal(regs[grid.owner[i]].continent, road.continent,
        `${road.id} (${road.continent}) has a point on ${regs[grid.owner[i]].continent}`);
    }
});

test("an overland-unreachable settlement is REPORTED, never silently dropped", () => {
  const grid = makeGrid({ w: 40, h: 20, cellKm: 1 });
  grid.biomeNames = ["meadow"];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 40; x++) {
    const i = idx({ grid, cx: x, cy: y });
    const land = (x >= 2 && x < 12 || x >= 28 && x < 38) && y >= 5 && y < 15;
    if (land) { grid.plate[i] = 0; grid.elev[i] = 0.3; grid.owner[i] = 0; }
    else { grid.plate[i] = -1; grid.elev[i] = 0.28; grid.flags[i] |= FLAG.SEA; }
  }
  const regs = [{ id: "cA/r01", continent: "cA", survey: "surveyed", adjacent: [] }];
  const settlements = [
    { id: "cA/s01", continent: "cA", rank: "hub", cell: [5, 8], atKm: [5.5, 8.5], region: "cA/r01" },
    { id: "cA/s02", continent: "cA", rank: "village", cell: [33, 8], atKm: [33.5, 8.5], region: "cA/r01" },
  ];
  const r = routeRoads({ grid, settlements, regions: regs });
  assert.equal(r.roads.length, 0);
  assert.ok(r.problems.some((p) => /cA\/s02 is not reachable overland/.test(p)),
    JSON.stringify(r.problems));
});

// ── sea lanes ─────────────────────────────────────────────────────────────

function twoIslands() {
  const grid = makeGrid({ w: 80, h: 20, cellKm: 1 });
  grid.biomeNames = ["meadow"];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 80; x++) {
    const i = idx({ grid, cx: x, cy: y });
    const a = x >= 2 && x < 14 && y >= 5 && y < 15;
    const b = x >= 66 && x < 78 && y >= 5 && y < 15;
    if (a || b) { grid.plate[i] = a ? 0 : 1; grid.elev[i] = 0.3; grid.owner[i] = a ? 0 : 1; }
    else { grid.plate[i] = -1; grid.elev[i] = 0.28; grid.flags[i] |= FLAG.SEA; }
  }
  const regs = [
    { id: "cA/r01", continent: "cA", survey: "surveyed", adjacent: [] },
    { id: "cB/r01", continent: "cB", survey: "surveyed", adjacent: [] },
  ];
  return { grid, regs };
}

test("a sea lane is water end to end except at its two endpoints", () => {
  const { grid, regs } = twoIslands();
  // Both capitals are placed 3 cells INLAND, so neither is D8-adjacent to water
  // — the plan's endpoint whitelist would find no first step and drop the lane.
  const settlements = [
    { id: "cA/s01", continent: "cA", rank: "capital", cell: [5, 8], atKm: [5.5, 8.5], region: "cA/r01" },
    { id: "cB/s01", continent: "cB", rank: "capital", cell: [74, 11], atKm: [74.5, 11.5], region: "cB/r01" },
  ];
  const r = routeRoads({ grid, settlements, regions: regs });
  assert.deepEqual(r.problems, []);
  assert.equal(r.seaLanes.length, 1);
  const lane = r.seaLanes[0];
  assert.equal(lane.id, "lane-01");
  assert.equal(lane.from, "cA/s01");
  assert.equal(lane.to, "cB/s01");
  assert.deepEqual(lane.points[0], settlements[0].atKm);
  assert.deepEqual(lane.points[lane.points.length - 1], settlements[1].atKm);
  // `km` must be the length of the line it emits, INCLUDING the two short land
  // legs from each capital to its water. Measuring only the water path
  // understates it, and a length that is not the length of the drawn line is a
  // number a later reader trusts.
  let poly = 0;
  for (let k = 1; k < lane.points.length; k++) {
    const dx = lane.points[k][0] - lane.points[k - 1][0];
    const dy = lane.points[k][1] - lane.points[k - 1][1];
    poly += Math.sqrt(dx * dx + dy * dy);
  }
  assert.equal(lane.km, Math.round(poly * 100) / 100);
  const water = lane.points.slice(1, -1);
  let inner = 0;
  for (let k = 1; k < water.length; k++) {
    const dx = water[k][0] - water[k - 1][0], dy = water[k][1] - water[k - 1][1];
    inner += Math.sqrt(dx * dx + dy * dy);
  }
  assert.ok(lane.km > Math.round(inner * 100) / 100, "the two land legs are not in `km`");
  for (let k = 1; k < lane.points.length - 1; k++) {
    const i = idx({ grid, cx: Math.floor(lane.points[k][0] / grid.cellKm),
                    cy: Math.floor(lane.points[k][1] / grid.cellKm) });
    assert.notEqual(grid.flags[i] & FLAG.SEA, 0,
      `sea lane ${lane.id} runs over land at ${lane.points[k]} — it can cut across a continent`);
  }
});

test("no sea lane is emitted between two capitals on the same landmass", () => {
  const { grid, regs } = twoIslands();
  const settlements = [
    { id: "cA/s01", continent: "cA", rank: "capital", cell: [4, 6], atKm: [4.5, 6.5], region: "cA/r01" },
    { id: "cA/s02", continent: "cA", rank: "capital", cell: [12, 13], atKm: [12.5, 13.5], region: "cA/r01" },
  ];
  const r = routeRoads({ grid, settlements, regions: regs });
  assert.equal(r.seaLanes.length, 0, "a boat trip between two ports of one coast");
  assert.equal(r.roads.length, 1, "the road network already joins them");
});

// ── trunk rivers ──────────────────────────────────────────────────────────

test("routeRoads emits exactly one trunk river per continent, unnamed", () => {
  const { grid, regs, settlements } = settled();
  const r = routeRoads({ grid, settlements, regions: regs });
  assert.deepEqual(Object.keys(r.trunkRivers), ["c01"]);
  assert.ok(r.trunkRivers.c01.points.length >= 2, "the trunk river has no course");
  assert.equal(r.trunkRivers.c01.name, null, "a name is meaning; Plan D mints it, not this pass");
  // source -> mouth, and the mouth is the cell that drains to the sea
  const pts = r.trunkRivers.c01.points;
  assert.deepEqual(pts[0], [60.5, 10.5]);
  assert.deepEqual(pts[pts.length - 1], [60.5, 109.5]);
  assert.equal(pts.length, 100);
});

test("an interior sink is NOT elected a river mouth", () => {
  // The plan reads `flowDir < 0` as "drains" (:5399-5405), so a pit priority
  // flood failed to route would become a river mouth in the middle of a
  // continent. Two RIVER cells: one landlocked sink with a huge flowAcc, one
  // real mouth on the coast with a small one.
  const grid = makeGrid({ w: 20, h: 20, cellKm: 1 });
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const i = idx({ grid, cx: x, cy: y });
    if (x >= 2 && x < 18 && y >= 2 && y < 18) { grid.plate[i] = 0; grid.owner[i] = 0; grid.elev[i] = 0.3; }
    else { grid.plate[i] = -1; grid.elev[i] = 0.28; grid.flags[i] |= FLAG.SEA; }
  }
  const regs = [{ id: "c01/r01", continent: "c01", survey: "surveyed", adjacent: [] }];
  const sink = idx({ grid, cx: 10, cy: 10 });
  grid.flags[sink] |= FLAG.RIVER; grid.flowAcc[sink] = 9999; grid.flowDir[sink] = -1;
  const mouth = idx({ grid, cx: 5, cy: 17 });
  grid.flags[mouth] |= FLAG.RIVER; grid.flowAcc[mouth] = 10; grid.flowDir[mouth] = 2;  // D8[2] = [0,1]
  const up = idx({ grid, cx: 5, cy: 16 });
  grid.flags[up] |= FLAG.RIVER; grid.flowAcc[up] = 5; grid.flowDir[up] = 2;
  const problems = [];
  const out = traceTrunkRivers({ grid, regions: regs, problems });
  assert.deepEqual(problems, []);
  assert.deepEqual(out.c01.points[out.c01.points.length - 1], [5.5, 17.5],
    "the landlocked sink was elected the mouth");
  assert.deepEqual(out.c01.points, [[5.5, 16.5], [5.5, 17.5]]);
});

test("the upstream walk emits a SIMPLE path — no cell twice, no branch doubling back", () => {
  // The plan bounds the walk by grid.n, which turns a repeated cell into a
  // 640,000-point chain rather than stopping it. The visited set cannot
  // actually be reached on a valid field — `flowDir` is a function, so the
  // inflow relation is its inverse and the walk is a tree traversal — so what
  // is assertable is the property itself, on a branching river.
  const grid = makeGrid({ w: 20, h: 20, cellKm: 1 });
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const i = idx({ grid, cx: x, cy: y });
    if (x >= 2 && x < 18 && y >= 2 && y < 18) { grid.plate[i] = 0; grid.owner[i] = 0; grid.elev[i] = 0.3; }
    else { grid.plate[i] = -1; grid.elev[i] = 0.28; grid.flags[i] |= FLAG.SEA; }
  }
  const regs = [{ id: "c01/r01", continent: "c01", survey: "surveyed", adjacent: [] }];
  const river = (cx, cy, acc, dir) => {
    const i = idx({ grid, cx, cy });
    grid.flags[i] |= FLAG.RIVER; grid.flowAcc[i] = acc; grid.flowDir[i] = dir;
  };
  river(5, 17, 90, 2);                                   // mouth, D8[2] = [0,1] -> sea
  river(5, 16, 80, 2);
  river(5, 15, 70, 2);
  river(4, 14, 30, 1);                                   // the SMALL branch, D8[1] = [1,1]
  river(6, 14, 60, 3);                                   // the BIG branch,  D8[3] = [-1,1]
  river(7, 13, 50, 3);
  const out = traceTrunkRivers({ grid, regions: regs });
  const pts = out.c01.points;
  assert.equal(new Set(pts.map((p) => p.join())).size, pts.length, "a cell appears twice");
  // the trunk follows the LARGER accumulation at the fork, not the first found
  assert.deepEqual(pts, [[7.5, 13.5], [6.5, 14.5], [5.5, 15.5], [5.5, 16.5], [5.5, 17.5]]);
});

test("Prim's target tiebreak resolves on the TARGET ID, not on cell index", () => {
  // A corridor with the tree's only member in the middle and two candidates at
  // exactly equal cost. The lower cell index is the WEST one; the lower id is
  // the EAST one, so the two rules disagree and the test can see which wins.
  const grid = makeGrid({ w: 24, h: 5, cellKm: 1 });
  for (let y = 0; y < 5; y++) for (let x = 0; x < 24; x++) {
    const i = idx({ grid, cx: x, cy: y });
    if (y === 2 && x >= 4 && x < 20) { grid.plate[i] = 0; grid.owner[i] = 0; grid.elev[i] = 0.3; }
    else { grid.plate[i] = -1; grid.elev[i] = 0.3; grid.flags[i] |= FLAG.SEA; }
  }
  const regs = [{ id: "cA/r01", continent: "cA", survey: "surveyed", adjacent: [] }];
  const settlements = [
    { id: "cA/s01", continent: "cA", rank: "hub", cell: [12, 2], atKm: [12.5, 2.5], region: "cA/r01" },
    { id: "cA/s02", continent: "cA", rank: "village", cell: [17, 2], atKm: [17.5, 2.5], region: "cA/r01" },
    { id: "cA/s03", continent: "cA", rank: "village", cell: [7, 2], atKm: [7.5, 2.5], region: "cA/r01" },
  ];
  const r = routeRoads({ grid, settlements, regions: regs });
  assert.deepEqual(r.problems, []);
  assert.equal(r.roads.length, 2);
  assert.deepEqual([r.roads[0].from, r.roads[0].to], ["cA/s01", "cA/s02"],
    "the first leg went to the lower CELL INDEX instead of the lower target id");
  assert.equal(r.roads[0].km, r.roads[1].km, "the two candidates were not actually tied");
});

// ── determinism ───────────────────────────────────────────────────────────

test("routeRoads is deterministic", () => {
  const run = () => {
    const { grid, regs, settlements } = settled();
    return JSON.stringify(routeRoads({ grid, settlements, regions: regs }));
  };
  assert.equal(run(), run());
});

test("routeRoads is independent of heap tiebreak AND of settlement input order", () => {
  // The standard seam 3 set for flow routing and seam 4 for the region
  // partition: replace the only comparison in the module, and permute the
  // input, and the output must not move.
  const variants = [
    null,
    function (a, b) { return this.v[a] < this.v[b] || (this.v[a] === this.v[b] && this.i[a] > this.i[b]); },
    function (a, b) { return this.v[a] < this.v[b]; },
  ];
  const orders = [(x) => x, (x) => [...x].reverse(),
                  (x) => [...x].sort((p, r) => (p.atKm[1] - r.atKm[1]) || (p.atKm[0] - r.atKm[0]))];
  let baseline = null;
  for (const less of variants) for (const order of orders) {
    const { grid, regs, settlements } = settled();
    const out = JSON.stringify(routeRoads({ grid, settlements: order(settlements), regions: regs, less }));
    if (baseline === null) baseline = out; else assert.equal(out, baseline);
  }
  assert.ok(baseline.length > 100);
});

test("a river never leaves its own landmass, and a one-cell river is NAMED not emitted", () => {
  // Two plates that share a land border, one river crossing the join. The road
  // raster has this rule; before review B the river walk did not.
  const grid = makeGrid({ w: 30, h: 20, cellKm: 1 });
  for (let y = 0; y < 20; y++) for (let x = 0; x < 30; x++) {
    const i = idx({ grid, cx: x, cy: y });
    if (y >= 4 && y < 16) { grid.plate[i] = x < 15 ? 0 : 1; grid.owner[i] = x < 15 ? 0 : 1; grid.elev[i] = 0.3; }
    else { grid.plate[i] = -1; grid.elev[i] = 0.28; grid.flags[i] |= FLAG.SEA; }
  }
  const regs = [
    { id: "cA/r01", continent: "cA", survey: "surveyed", adjacent: [] },
    { id: "cB/r01", continent: "cB", survey: "surveyed", adjacent: [] },
  ];
  const river = (cx, cy, acc, dir) => {
    const i = idx({ grid, cx, cy });
    grid.flags[i] |= FLAG.RIVER; grid.flowAcc[i] = acc; grid.flowDir[i] = dir;
  };
  // cA's mouth at (12,15) draining south, with a course that runs EAST across
  // the cA/cB border at x = 15.
  river(12, 15, 90, 2);
  river(13, 14, 80, 3);   // D8[3] = [-1,1]
  river(14, 13, 70, 3);
  river(15, 12, 60, 3);   // this and the next are on cB
  river(16, 11, 50, 3);
  // cB's own river: one cell draining straight to the southern sea, no inflow.
  river(20, 15, 40, 2);
  const problems = [];
  const out = traceTrunkRivers({ grid, regions: regs, problems });
  for (const [x] of out.cA.points)
    assert.ok(x < 15, `cA's trunk river has a point at x=${x}, which is on cB`);
  assert.deepEqual(out.cA.points, [[14.5, 13.5], [13.5, 14.5], [12.5, 15.5]]);
  // cB's own highest-accumulation cell that drains to sea is a single cell, so
  // cB gets no trunk river and the omission is named rather than drawn.
  assert.equal(out.cB, undefined);
  assert.ok(problems.some((p) => /cB's highest-accumulation river is a single cell/.test(p)),
    JSON.stringify(problems));
});

test("a continent with a single settlement emits no road and reports nothing", () => {
  const { grid, regs } = twoIslands();
  const settlements = [
    { id: "cA/s01", continent: "cA", rank: "hub", cell: [5, 8], atKm: [5.5, 8.5], region: "cA/r01" },
    { id: "cB/s01", continent: "cB", rank: "village", cell: [70, 8], atKm: [70.5, 8.5], region: "cB/r01" },
  ];
  const r = routeRoads({ grid, settlements, regions: regs });
  assert.deepEqual(r.roads, []);
  assert.deepEqual(r.seaLanes, [], "neither is a capital");
  assert.deepEqual(r.problems, []);
});
