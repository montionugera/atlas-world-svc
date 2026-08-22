// tools/mapforge/tests/settlements.test.mjs — Task 9a (P11 settlements).
//
// This file also carries the REAL-WORLD proof for P12 (roads.test.mjs) and P13
// (dungeons.test.mjs), because both consume P11's output and neither can be
// measured on the real field without it. Building the 800 x 800 world costs
// ~4.3 s; one build in one process is the whole reason the civic block lives
// here rather than three times over. The two sibling files say so at the top.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeGrid, FLAG, idx, neighbourIdx } from "../lib/grid.mjs";
import {
  placeSettlements, assignLevelBands, scoreSettlement, view, coastTerm,
  narrowWaterKm, seaProximity,
  SEPARATION_KM, VETO, SCORE_WEIGHTS, SHELTER_FETCH_KM_MAX,
  COAST_NEAR_KM, COAST_FAR_KM, COAST_EXPOSED,
  MAX_SETTLEMENTS_PER_REGION, MAX_CAPITALS_PER_CONTINENT,
} from "../lib/passes/settlements.mjs";
import { coastWorld, ownRegions, regions, REGIONS, PREMISES, M, paint,
         SETTLEMENT_STREAM, DERIVED } from "./fixtures/coast-world.mjs";
import { BIOMES } from "../../../scripts/lib/spine.mjs";
import { classifyBiomes } from "../lib/passes/biome.mjs";
import { partitionRegions } from "../lib/passes/partition.mjs";
import { instanceLandforms } from "../lib/passes/landforms.mjs";
import { applyPremiseMasks } from "../lib/passes/mask.mjs";
import { buildElevation, assignSubstrate } from "../lib/passes/elevation.mjs";
import { selectSeaLevelByRank, classifySea, CELL_AREA_KM2 } from "../lib/passes/sea-level.mjs";
import { priorityFlood, d8FlowDir, flowAccumulate } from "../lib/hydrology.mjs";
import { applyWinds } from "../lib/passes/winds.mjs";
import { carveWater } from "../lib/passes/water.mjs";
import { terrainStream, namedStream } from "../lib/seed.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
const ALL_PREMISES = readdirSync(join(ROOT, "content/world/premises"))
  .filter((f) => f.endsWith(".json")).sort()
  .map((f) => JSON.parse(readFileSync(join(ROOT, "content/world/premises", f), "utf8")));
const LEXICON = JSON.parse(readFileSync(join(ROOT, "content/world/lexicon/landforms.json"), "utf8"));

const place = (over = {}) => {
  const grid = over.grid ?? coastWorld();
  if (!over.grid) ownRegions(grid);
  const regs = over.regions ?? regions();
  return { grid, regs,
    ...placeSettlements({ grid, premises: PREMISES, regions: regs, manifest: over.manifest ?? M,
                          stream: SETTLEMENT_STREAM, pinned: over.pinned ?? [] }) };
};

// ── constants ─────────────────────────────────────────────────────────────

test("the pinned constants are the spec's", () => {
  assert.equal(SEPARATION_KM.capital, 60);
  assert.equal(SEPARATION_KM.hub, 24);
  assert.equal(SEPARATION_KM.village, 9);
  assert.equal(VETO.slopeMax, 0.08);
  assert.equal(VETO.freshWaterMin, 0.20);
  assert.equal(VETO.treeline, 0.72);
  assert.equal(SHELTER_FETCH_KM_MAX, 15);
  assert.equal(COAST_NEAR_KM, 2);
  assert.equal(COAST_FAR_KM, 6);
  assert.equal(COAST_EXPOSED, 0.4);
});

test("the four score weights are spec 6.5's and they sum to exactly 1", () => {
  assert.deepEqual(SCORE_WEIGHTS,
    { river: 0.30, coast: 0.25, slope: 0.25, resource: 0.20 });
  const sum = SCORE_WEIGHTS.river + SCORE_WEIGHTS.coast + SCORE_WEIGHTS.slope + SCORE_WEIGHTS.resource;
  assert.ok(Math.abs(sum - 1) < 1e-12, `weights sum to ${sum}, not 1 — the score is no longer in [0,1]`);
});

// ── the coast term's THREE bands ──────────────────────────────────────────

test("coastTerm implements spec 6.5's THREE bands, not two", () => {
  // 1.0 within 2 km of the sea-level contour when the adjacent water is
  // sheltered; 0.4 exposed; 0 beyond 6 km inland; a linear taper between.
  assert.equal(coastTerm({ inlandKm: 0.5, sheltered: true }), 1);
  assert.equal(coastTerm({ inlandKm: COAST_NEAR_KM, sheltered: true }), 1);
  assert.equal(coastTerm({ inlandKm: 0.5, sheltered: false }), COAST_EXPOSED);
  assert.equal(coastTerm({ inlandKm: COAST_FAR_KM, sheltered: true }), 0);
  assert.equal(coastTerm({ inlandKm: COAST_FAR_KM + 0.001, sheltered: true }), 0);
  assert.equal(coastTerm({ inlandKm: -1, sheltered: true }), 0);
  // the middle band exists and is strictly between the two endpoints
  const mid = coastTerm({ inlandKm: 4, sheltered: true });
  assert.ok(mid > 0 && mid < 1, `the 2-6 km band collapsed to ${mid}`);
  assert.equal(mid, 0.5);
  assert.equal(coastTerm({ inlandKm: 4, sheltered: false }), 0.5 * COAST_EXPOSED);
});

test("narrowWaterKm reads a bay as sheltered and open water as exposed", () => {
  const grid = coastWorld();
  const nw = narrowWaterKm({ grid });
  // The 6 x 10 km notch at x in [20,26), y in [50,60): 10 km across vertically.
  assert.equal(nw[idx({ grid, cx: 22, cy: 55 })], 10);
  assert.ok(nw[idx({ grid, cx: 22, cy: 55 })] < SHELTER_FETCH_KM_MAX, "the bay is not sheltered");
  // The open west sea is 20 km wide.
  assert.equal(nw[idx({ grid, cx: 10, cy: 30 })], 20);
  assert.ok(nw[idx({ grid, cx: 10, cy: 30 })] >= SHELTER_FETCH_KM_MAX, "open water reads as sheltered");
  assert.equal(nw[idx({ grid, cx: 60, cy: 60 })], -1, "a land cell has no water width");
});

test("seaProximity measures inland distance and carries the source sea cell", () => {
  const grid = coastWorld();
  const { inlandKm, nearestSea } = seaProximity({ grid });
  assert.equal(inlandKm[idx({ grid, cx: 10, cy: 30 })], 0, "a sea cell is 0 km inland");
  assert.equal(inlandKm[idx({ grid, cx: 20, cy: 30 })], 1, "the shore is one cell inland");
  assert.equal(inlandKm[idx({ grid, cx: 26, cy: 55 })], 1, "the bay's east shore is one cell inland");
  const near = nearestSea[idx({ grid, cx: 26, cy: 55 })];
  const nx = near % grid.w, ny = (near / grid.w) | 0;
  assert.ok(nx >= 20 && nx < 26 && ny >= 50 && ny < 60,
    `the bay shore's nearest water is (${nx},${ny}), which is not in the notch`);
  // BOUNDED at COAST_FAR_KM: the deep interior is deliberately unmeasured, and
  // coastTerm returns 0 for -1, which is what makes the bound sound.
  assert.equal(inlandKm[idx({ grid, cx: 60, cy: 60 })], -1);
  assert.equal(coastTerm({ inlandKm: -1, sheltered: false }), 0);
});

// ── the vetoes, each one fired on purpose ─────────────────────────────────

test("every hard veto fires, and the cell it vetoes would otherwise score", () => {
  const grid = coastWorld(); ownRegions(grid);
  const biomeName = (b) => grid.biomeNames[b] ?? null;
  const at = (cx, cy) => idx({ grid, cx, cy });
  const score = (i, survey = "surveyed") => scoreSettlement({
    grid, i, v: view({ grid, i }),
    water: { inlandKm: 99, sheltered: false }, regionSurvey: survey, biomeName });

  const good = at(60, 30);
  assert.ok(score(good) > 0, "the control cell is already vetoed — the fixture proves nothing");

  assert.equal(score(at(10, 30)), 0, "a sea cell must be vetoed");
  assert.equal(score(good, "reported"), 0, "a reported region must be vetoed");

  const steep = at(61, 30);
  grid.elev[steep] = grid.elev[steep] + VETO.slopeMax + 0.01;
  assert.equal(score(steep), 0, "slope > 0.08 must be vetoed");

  const high = at(62, 30);
  grid.elev[high] = VETO.treeline + 0.01;
  assert.equal(score(high), 0, "elevation above the treeline must be vetoed");

  const dry = at(63, 30);
  grid.moist[dry] = VETO.freshWaterMin - 0.01;
  assert.equal(score(dry), 0, "freshWater < 0.20 must be vetoed");

  for (const [name, index] of [["ice", 1], ["lava", 2]]) {
    const b = at(64 + index, 30);
    grid.biome[b] = index;
    assert.equal(biomeName(grid.biome[b]), name);
    assert.equal(score(b), 0, `a ${name} biome must be vetoed`);
  }
});

test("the ice/lava veto cannot be silently off — an unclassified grid THROWS", () => {
  const grid = coastWorld(); ownRegions(grid);
  grid.biomeNames = [];
  assert.throws(() => placeSettlements({ grid, premises: PREMISES, regions: regions(),
    manifest: M, stream: SETTLEMENT_STREAM }), /grid\.biomeNames is empty/);
});

test("a lava field on the ground removes its cells from the pool", () => {
  const grid = coastWorld(); ownRegions(grid);
  const before = place({ grid, regions: regions() });
  paint({ grid, x0: 20, x1: 100, y0: 10, y1: 60, biome: 2 });   // lava over regions r01-r05's north
  const after = place({ grid, regions: regions() });
  assert.notDeepEqual(after.settlements.map((s) => s.id + s.atKm.join()),
                      before.settlements.map((s) => s.id + s.atKm.join()),
                      "painting half the surveyed ground with lava changed nothing");
  for (const s of after.settlements)
    assert.notEqual(grid.biome[idx({ grid, cx: s.cell[0], cy: s.cell[1] })], 2,
      `${s.id} is standing on lava`);
});

// ── the stream ────────────────────────────────────────────────────────────

test("the stream is the COMMITTED settlements stream, and a wrong shape throws", () => {
  assert.equal(namedStream({ worldSeed: MANIFEST.seed, name: "settlements" }),
    DERIVED["n-atlas"].resolvedSeedStreams.settlements,
    "the settlements stream is not the one committed in derived.json");
  assert.equal(SETTLEMENT_STREAM, "da45bd8930d33bb0");
  for (const bad of [undefined, null, "", "seedseedseedseed", "DA45BD8930D33BB0", "da45bd89"])
    assert.throws(() => placeSettlements({ grid: coastWorld(), premises: PREMISES,
      regions: regions(), manifest: M, stream: bad }), /16-hex settlements stream/,
      `stream ${JSON.stringify(bad)} was accepted`);
});

// ── quotas, separations, back-references ──────────────────────────────────

test("placeSettlements meets the quota exactly, by tier", () => {
  const r = place();
  assert.equal(r.problems.length, 0, JSON.stringify(r.problems));
  assert.equal(r.settlements.filter((s) => s.rank === "capital").length, 1);
  assert.equal(r.settlements.filter((s) => s.rank === "hub").length, 2);
  assert.equal(r.settlements.filter((s) => s.rank === "village").length, 3);
});

test("no settlement lands on a sea cell, an ice/lava biome, or a reported region", () => {
  const r = place();
  const byId = new Map(REGIONS.map((x) => [x.id, x]));
  for (const s of r.settlements) {
    const i = idx({ grid: r.grid, cx: s.cell[0], cy: s.cell[1] });
    assert.equal(r.grid.flags[i] & FLAG.SEA, 0, `${s.id} is at sea`);
    assert.equal(byId.get(s.region).survey, "surveyed", `${s.id} is on a reported region`);
    assert.ok(!["ice", "lava"].includes(r.grid.biomeNames[r.grid.biome[i]]), `${s.id} is on ${s.region}`);
  }
});

test("minimum separations hold within each tier AND across every pair", () => {
  const r = place();
  for (const tier of ["capital", "hub", "village"]) {
    const list = r.settlements.filter((s) => s.rank === tier);
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const dx = list[a].atKm[0] - list[b].atKm[0], dy = list[a].atKm[1] - list[b].atKm[1];
      const d = Math.sqrt(dx * dx + dy * dy);
      assert.ok(d >= SEPARATION_KM[tier] - 1e-9,
        `${tier}s ${list[a].id} and ${list[b].id} are ${d.toFixed(1)} km apart, min ${SEPARATION_KM[tier]}`);
    }
  }
  // THE CROSS-TIER HALF. Spec 6.5 derives the per-region cap from the 9 km
  // separation, which is a claim about ALL settlements. The plan's Step 7
  // review brief proposes same-tier-only ("a village 3 km from a capital is
  // fine"), which cannot deliver it.
  const all = r.settlements;
  for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
    const dx = all[a].atKm[0] - all[b].atKm[0], dy = all[a].atKm[1] - all[b].atKm[1];
    assert.ok(Math.sqrt(dx * dx + dy * dy) >= SEPARATION_KM.village - 1e-9,
      `${all[a].id} and ${all[b].id} are closer than the 9 km village separation`);
  }
});

test("capitals are port-eligible: restricted BEFORE pass 1, not rejected after", () => {
  const r = place();
  const caps = r.settlements.filter((x) => x.rank === "capital");
  assert.ok(caps.length > 0);
  for (const s of caps) assert.ok(s.portEligible === true, `${s.id} is a capital but not port-eligible`);
  // "restricted BEFORE pass 1" has teeth only if a HIGHER-scoring non-port cell
  // exists that the capital tier passed over. It does: the fixture's best
  // inland cells outscore some ports.
  const best = r.settlements.filter((x) => x.rank !== "capital" && !x.portEligible);
  assert.ok(best.length > 0, "no non-port settlement exists, so the restriction is untested");
});

test("at most 2 settlements land in any one region", () => {
  const r = place();
  const per = new Map();
  for (const s of r.settlements) per.set(s.region, (per.get(s.region) ?? 0) + 1);
  for (const [rid, n] of per)
    assert.ok(n <= MAX_SETTLEMENTS_PER_REGION, `${rid} holds ${n} settlements`);
});

test("every region gets a settlements[] back-reference, empty ones included", () => {
  const { regs, settlements } = place();
  for (const reg of regs)
    assert.ok(Array.isArray(reg.settlements), `${reg.id} has no settlements[] — G-DUNGEON-REACH reads it`);
  const flat = regs.flatMap((x) => x.settlements).sort();
  assert.deepEqual(flat, settlements.map((s) => s.id).sort());
  assert.ok(regs.some((x) => x.settlements.length === 0), "no empty back-reference in the fixture");
});

test("placeSettlements is deterministic", () => {
  const run = () => JSON.stringify(place().settlements);
  assert.equal(run(), run());
});

// ── the pinned path ───────────────────────────────────────────────────────

test("a raw pinned record is a loud TypeError, never a silent mis-placement", () => {
  assert.throws(() => place({
    pinned: [{ id: "gildmark", pin: { at: [60, 60] }, settlementRank: "capital" }],
  }), /is not a placePinned\(\) result/);
});

test("a pinned entry with no rank is a loud TypeError — it would consume no quota", () => {
  assert.throws(() => place({
    pinned: [{ id: "c01/s99", at: [60, 30], cell: [60, 30], continent: "c01",
               region: "c01/r03", rank: null }],
  }), /rank null/);
});

test("pinned records are placed BEFORE scoring and consume their tier's quota", () => {
  const pin = { id: "c01/s01", title: "Gildmark", at: [60, 30], cell: [60, 30],
                continent: "c01", region: "c01/r03", rank: "capital" };
  const r = place({ pinned: [pin] });
  assert.equal(r.problems.length, 0, JSON.stringify(r.problems));
  const caps = r.settlements.filter((s) => s.rank === "capital");
  assert.deepEqual(caps.map((s) => s.id), ["c01/s01"], "the pin did not consume the capital quota");
  assert.equal(caps[0].pinned, true);
  assert.equal(caps[0].title, "Gildmark", "a pinned title survives; a generated one is null");
  // …and the pin constrains the GENERATED ones, which is the whole point of
  // placing it first rather than merging it afterwards.
  for (const s of r.settlements) {
    if (s.id === pin.id) continue;
    const d = Math.sqrt((s.atKm[0] - pin.at[0]) ** 2 + (s.atKm[1] - pin.at[1]) ** 2);
    assert.ok(d >= SEPARATION_KM[s.rank] - 1e-9,
      `${s.id} (${s.rank}) is ${d.toFixed(1)} km from the pinned capital`);
  }
  // the pin's id is not re-issued to a generated settlement
  assert.equal(new Set(r.settlements.map((s) => s.id)).size, r.settlements.length);
});

test("a pinned record off owned land is a reported problem, not a placed settlement", () => {
  const r = place({ pinned: [{ id: "c01/s01", at: [5, 5], cell: [5, 5],
                               continent: "c01", region: null, rank: "hub" }] });
  assert.deepEqual(r.problems, ["settlements: pinned c01/s01 at [5,5] is not on owned land"]);
  // The id is then FREE, and a generated settlement may take it — what must not
  // happen is a record carrying `pinned: true` at [undefined, undefined].
  assert.ok(!r.settlements.some((s) => s.pinned));
});

// ── level bands ───────────────────────────────────────────────────────────

test("assignLevelBands rings by distance from the origin capital and reports the origin", () => {
  const { regs, settlements } = place();
  regs.forEach((r, n) => { r.centroidKm = [30 + n * 8, 20 + n * 9]; });
  const problems = [];
  const out = assignLevelBands({ regions: regs, settlements, manifest: M, problems });
  const origin = settlements.find((s) => s.rank === "capital");
  assert.equal(out.origin, origin.id);
  assert.equal(out.banded, regs.length);
  const { ringKm, bands } = M.levelBands;
  for (const r of regs) {
    const d = Math.sqrt((r.centroidKm[0] - origin.atKm[0]) ** 2 + (r.centroidKm[1] - origin.atKm[1]) ** 2);
    assert.deepEqual(r.levelBand, bands[Math.min(bands.length - 1, Math.floor(d / ringKm))],
      `${r.id} at ${d.toFixed(1)} km is banded ${JSON.stringify(r.levelBand)}`);
  }
  // non-decreasing in distance, which is the property spec 11 buys
  const sorted = regs.map((r) => ({
    d: Math.sqrt((r.centroidKm[0] - origin.atKm[0]) ** 2 + (r.centroidKm[1] - origin.atKm[1]) ** 2),
    lo: r.levelBand[0], id: r.id })).sort((a, b) => a.d - b.d);
  for (let i = 1; i < sorted.length; i++)
    assert.ok(sorted[i].lo >= sorted[i - 1].lo, `${sorted[i].id} is further out but banded lower`);
});

test("a region with no centroidKm is REPORTED unbanded, never silently skipped", () => {
  const { regs, settlements } = place();
  regs.forEach((r) => { r.centroidKm = [60, 60]; });
  regs[2].centroidKm = null;
  const problems = [];
  assignLevelBands({ regions: regs, settlements, manifest: M, problems });
  assert.ok(problems.some((p) => /1 of 8 regions have no centroidKm/.test(p)), JSON.stringify(problems));
});

test("partitionRegions writes centroidKm, quantised, for assignLevelBands to read", () => {
  const grid = makeGrid({ w: 60, h: 60, cellKm: 2 });
  grid.biomeNames = [...BIOMES];
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    const i = idx({ grid, cx: x, cy: y });
    if (x >= 10 && x < 50 && y >= 10 && y < 50) {
      grid.plate[i] = 0; grid.elev[i] = 0.4; grid.moist[i] = 0.5; grid.temp[i] = 0.5;
    } else { grid.plate[i] = -1; grid.elev[i] = -0.7; grid.flags[i] |= FLAG.SEA; }
  }
  classifyBiomes({ grid, premises: PREMISES, BIOMES });
  const { regions: regs } = partitionRegions({
    grid, premises: PREMISES, manifest: M, stream: SETTLEMENT_STREAM });
  for (const r of regs) {
    assert.ok(Array.isArray(r.centroidKm), `${r.id} has no centroidKm`);
    for (const v of r.centroidKm) {
      assert.equal(v, Math.round(v * 100) / 100, "centroidKm is not quantised through q()");
      assert.ok(v > 20 && v < 100, `${r.id} centroid ${v} is off the landmass`);
    }
  }
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
  const { maskField } = applyPremiseMasks({ grid, premises: ALL_PREMISES, stream });
  buildElevation({ grid, premises: ALL_PREMISES, maskField, stream });
  assignSubstrate({ grid, premises: ALL_PREMISES, maskField });
  const sea = selectSeaLevelByRank({
    elev: grid.elev, targetLandCells: MANIFEST.budget.grossLandPolygonKm2 / CELL_AREA_KM2 });
  classifySea({ grid, seaLevel: sea.seaLevel });
  const filled = priorityFlood({ elev: grid.elev, w: grid.w, h: grid.h });
  const dir = d8FlowDir({ elev: filled, w: grid.w, h: grid.h });
  grid.flowDir.set(dir);
  grid.flowAcc.set(flowAccumulate({ flowDir: dir, w: grid.w, h: grid.h }));
  applyWinds({ grid, stream });
  carveWater({ grid, premises: ALL_PREMISES, manifest: MANIFEST });
  classifyBiomes({ grid, premises: ALL_PREMISES, BIOMES });
  const part = partitionRegions({ grid, premises: ALL_PREMISES, manifest: MANIFEST, stream });
  const lf = instanceLandforms({
    grid, premises: ALL_PREMISES, regions: part.regions, lexicon: LEXICON, manifest: MANIFEST,
    stream, nameStream: namedStream({ worldSeed: MANIFEST.seed, name: "names" }) });
  const settleStream = namedStream({ worldSeed: MANIFEST.seed, name: "settlements" });
  assert.equal(settleStream, DERIVED["n-atlas"].resolvedSeedStreams.settlements,
    "the settlements stream is not the one committed in derived.json");
  const p11 = placeSettlements({
    grid, premises: ALL_PREMISES, regions: part.regions, manifest: MANIFEST, stream: settleStream });
  const bandProblems = [];
  const bands = assignLevelBands({
    regions: part.regions, settlements: p11.settlements, manifest: MANIFEST, problems: bandProblems });
  REAL = { grid, sea, part, lf, p11, bands, bandProblems, settleStream };
  return REAL;
}

test("REAL WORLD — the two water measures are ONE construction, joined cell by cell", () => {
  // grid.fetchKm is max-over-axes (wave exposure, what Plan D's pinned harbour
  // records declare against); narrowWaterKm is min-over-axes (enclosure, what
  // spec 6.5's bay test needs). Same four sweeps, so narrow <= fetch always.
  const { grid } = realWorld();
  const narrow = narrowWaterKm({ grid });
  let sea = 0, strictlyLess = 0;
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) === 0) { assert.equal(narrow[i], -1); continue; }
    sea++;
    assert.ok(narrow[i] <= grid.fetchKm[i] + 1e-6,
      `cell ${i}: narrow ${narrow[i]} > fetch ${grid.fetchKm[i]}`);
    if (narrow[i] < grid.fetchKm[i]) strictlyLess++;
  }
  assert.equal(sea, 377600);
  assert.ok(strictlyLess > sea * 0.5,
    `only ${strictlyLess} of ${sea} sea cells differ — the two measures have collapsed into one`);
});

test("REAL WORLD — every hard veto fires, and none of them fires on everything", () => {
  // A veto that never rejects and a veto that rejects everything are the same
  // defect. Counted INDEPENDENTLY over the 25,600-cell surveyed pool, not in
  // the short-circuiting order the pass evaluates them.
  const { grid, part } = realWorld();
  const { inlandKm } = seaProximity({ grid });
  let pool = 0;
  const hits = { slope: 0, treeline: 0, fresh: 0, iceLava: 0 };
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) !== 0 || grid.plate[i] < 0) continue;
    const o = grid.owner[i];
    if (o < 0 || part.regions[o].survey !== "surveyed") continue;
    pool++;
    const v = view({ grid, i });
    if (v.slope > VETO.slopeMax) hits.slope++;
    if (grid.elev[i] > VETO.treeline) hits.treeline++;
    if (v.freshWater < VETO.freshWaterMin) hits.fresh++;
    const b = grid.biomeNames[grid.biome[i]];
    if (b === "ice" || b === "lava") hits.iceLava++;
  }
  assert.equal(pool, 25600, "the surveyed pool is 40 regions x 640 cells");
  assert.deepEqual(hits, { slope: 360, treeline: 173, fresh: 6345, iceLava: 108 });
  for (const [name, n] of Object.entries(hits)) {
    assert.ok(n > 0, `the ${name} veto fires on NOTHING — it is a rule that measures nothing`);
    assert.ok(n < pool, `the ${name} veto rejects EVERYTHING`);
  }
  // and the survivors
  assert.ok(inlandKm.length === grid.n);
});

test("REAL WORLD — the coast term's three bands and the shelter test are all populated", () => {
  const { grid, part } = realWorld();
  const narrow = narrowWaterKm({ grid });
  const { inlandKm, nearestSea } = seaProximity({ grid });
  const bands = { near: 0, mid: 0, far: 0 };
  const shelter = { sheltered: 0, exposed: 0 };
  let eligible = 0, ports = 0;
  const portsByContinent = new Map();
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) !== 0 || grid.plate[i] < 0) continue;
    const o = grid.owner[i];
    if (o < 0 || part.regions[o].survey !== "surveyed") continue;
    const v = view({ grid, i });
    const near = nearestSea[i];
    const sheltered = near >= 0 && narrow[near] >= 0 && narrow[near] < SHELTER_FETCH_KM_MAX;
    const s = scoreSettlement({ grid, i, v, water: { inlandKm: inlandKm[i], sheltered },
      regionSurvey: "surveyed", biomeName: (b) => grid.biomeNames[b] ?? null });
    if (s <= 0) continue;
    eligible++;
    const d = inlandKm[i];
    if (d >= 0 && d <= COAST_NEAR_KM) bands.near++;
    else if (d >= 0 && d <= COAST_FAR_KM) bands.mid++;
    else { bands.far++; continue; }
    if (sheltered) shelter.sheltered++; else shelter.exposed++;
    if (d <= COAST_NEAR_KM && sheltered) {
      ports++;
      const c = part.regions[o].continent;
      portsByContinent.set(c, (portsByContinent.get(c) ?? 0) + 1);
    }
  }
  assert.equal(eligible, 18895, "the settlement-eligible pool moved");
  assert.deepEqual(bands, { near: 2574, mid: 6955, far: 9366 });
  assert.deepEqual(shelter, { sheltered: 2126, exposed: 7403 });
  assert.equal(ports, 520);
  assert.deepEqual([...portsByContinent.entries()].sort(),
    [["c02", 38], ["c03", 99], ["c05", 165], ["c07", 63], ["c09", 155]]);
  assert.ok(portsByContinent.size >= 3,
    "fewer than three continents carry a port — the capital tier cannot be spread");
});

test("REAL WORLD — 45 settlements, 3 capital / 12 hub / 30 village, no problems", () => {
  const { p11 } = realWorld();
  assert.deepEqual(p11.problems, []);
  assert.equal(p11.settlements.length, 45);
  const byRank = {};
  for (const s of p11.settlements) byRank[s.rank] = (byRank[s.rank] ?? 0) + 1;
  assert.deepEqual(byRank, { capital: 3, hub: 12, village: 30 });
  assert.equal(new Set(p11.settlements.map((s) => s.id)).size, 45, "duplicate settlement id");
  for (const s of p11.settlements) {
    assert.match(s.id, /^c\d\d\/s\d\d$/);
    assert.equal(s.title, null, "a name is meaning; Plan D mints it");
    assert.equal(s.pinned, undefined, "Plan C pins nothing");
  }
});

test("REAL WORLD — the capitals are one per landmass, port-eligible and 60 km apart", () => {
  const { p11 } = realWorld();
  const caps = p11.settlements.filter((s) => s.rank === "capital");
  assert.deepEqual(caps.map((s) => s.id), ["c02/s01", "c03/s01", "c05/s01"]);
  assert.deepEqual(caps.map((s) => s.atKm), [[9.25, 160.25], [343.75, 92.75], [153.75, 350.75]]);
  for (const s of caps) assert.equal(s.portEligible, true);
  assert.equal(new Set(caps.map((s) => s.continent)).size, 3, "two capitals on one landmass");
  assert.equal(MAX_CAPITALS_PER_CONTINENT, 1);
  for (let a = 0; a < caps.length; a++) for (let b = a + 1; b < caps.length; b++) {
    const d = Math.sqrt((caps[a].atKm[0] - caps[b].atKm[0]) ** 2 + (caps[a].atKm[1] - caps[b].atKm[1]) ** 2);
    assert.ok(d >= SEPARATION_KM.capital, `${caps[a].id} and ${caps[b].id} are ${d.toFixed(1)} km apart`);
  }
});

test("REAL WORLD — the per-region cap and every pairwise separation hold", () => {
  const { p11 } = realWorld();
  const per = new Map();
  for (const s of p11.settlements) per.set(s.region, (per.get(s.region) ?? 0) + 1);
  const worst = Math.max(...per.values());
  assert.equal(worst, MAX_SETTLEMENTS_PER_REGION, "the per-region cap is not the binding constraint");
  assert.equal(per.size, 27, "settlements are spread over 27 of the 40 surveyed regions");
  const all = p11.settlements;
  for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
    const d = Math.sqrt((all[a].atKm[0] - all[b].atKm[0]) ** 2 + (all[a].atKm[1] - all[b].atKm[1]) ** 2);
    assert.ok(d >= SEPARATION_KM[all[b].rank] - 1e-9,
      `${all[a].id} and ${all[b].id} are ${d.toFixed(1)} km apart`);
  }
});

test("REAL WORLD — the score DISCRIMINATES: it is not one value wearing 45 hats", () => {
  const { p11 } = realWorld();
  const scores = p11.settlements.map((s) => s.score).sort((a, b) => a - b);
  assert.ok(scores[0] > 0, "a placed settlement scored 0 — it was vetoed and placed anyway");
  assert.ok(scores[scores.length - 1] <= 1);
  assert.ok(new Set(scores).size >= 10,
    `only ${new Set(scores).size} distinct scores among 45 settlements`);
  assert.ok(scores[scores.length - 1] - scores[0] > 0.2,
    `the placed range is ${scores[0]}..${scores[scores.length - 1]} — the score barely separates`);
  assert.deepEqual([scores[0], scores[scores.length - 1]], [0.55, 0.95]);
});

test("REAL WORLD — c10 ASHEN SPAR carries no settlement, and the treeline is NOT why", () => {
  // STATE section 11 attributes this to the treeline veto against a volcanic
  // arc's relief and offers two remedies (lower the relief, exempt
  // volcanic-arc). Measured here: BOTH would achieve nothing.
  const { grid, part, p11 } = realWorld();
  assert.equal(p11.settlements.filter((s) => s.continent === "c10").length, 0);
  const counts = { cells: 0, slope: 0, treeline: 0, fresh: 0, lava: 0,
                   passAllButTreeline: 0, river: 0, lake: 0 };
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) !== 0 || grid.plate[i] < 0) continue;
    const o = grid.owner[i];
    if (o < 0 || part.regions[o].continent !== "c10") continue;
    if ((grid.flags[i] & FLAG.RIVER) !== 0) counts.river++;
    if ((grid.flags[i] & FLAG.LAKE) !== 0) counts.lake++;
    if (part.regions[o].survey !== "surveyed") continue;
    counts.cells++;
    const v = view({ grid, i });
    if (v.slope > VETO.slopeMax) counts.slope++;
    if (grid.elev[i] > VETO.treeline) counts.treeline++;
    if (v.freshWater < VETO.freshWaterMin) counts.fresh++;
    if (grid.biomeNames[grid.biome[i]] === "lava") counts.lava++;
    if (v.slope <= VETO.slopeMax && v.freshWater >= VETO.freshWaterMin &&
        grid.biomeNames[grid.biome[i]] !== "lava") counts.passAllButTreeline++;
  }
  assert.deepEqual(counts, { cells: 640, slope: 25, treeline: 173, fresh: 615, lava: 108,
                             passAllButTreeline: 0, river: 0, lake: 0 });
  // The decisive number: ZERO cells clear every other veto, so deleting the
  // treeline veto outright still leaves Ashen Spar with nothing. The cause is
  // fresh water — 615 of 640 cells — on a landmass with no river and no lake.
  assert.equal(counts.passAllButTreeline, 0,
    "some c10 cell fails ONLY on the treeline, so the treeline remedy would work after all");
});

test("REAL WORLD — all 9 level-band rings are populated from the Wealdmarch capital", () => {
  const { part, bands, bandProblems } = realWorld();
  assert.deepEqual(bandProblems, []);
  assert.equal(bands.origin, "c02/s01");
  assert.equal(bands.originContinent, MANIFEST.levelBands.originFallbackContinent);
  assert.equal(bands.banded, 160);
  const population = MANIFEST.levelBands.bands.map((b) =>
    part.regions.filter((r) => r.levelBand && r.levelBand[0] === b[0] && r.levelBand[1] === b[1]).length);
  assert.deepEqual(population, [5, 16, 13, 13, 14, 23, 26, 28, 22]);
  assert.equal(population.reduce((a, b) => a + b, 0), 160);
  for (let k = 0; k < population.length; k++)
    assert.ok(population[k] > 0, `ring ${k} (${JSON.stringify(MANIFEST.levelBands.bands[k])}) is empty`);
});
