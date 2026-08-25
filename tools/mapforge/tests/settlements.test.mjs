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
  townSlug, townFeatureId, townFeatureIds, slugOf,
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
import { routeRoads } from "../lib/passes/roads.mjs";
import { anchorDungeons, MAX_HOPS, MAX_PER_REGION } from "../lib/passes/dungeons.mjs";

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

test("every hard veto fires, and it is the ONLY veto its fixture trips", () => {
  // ISOLATION IS THE POINT, and the first draft of this test did not have it.
  // `grid.elev[high] = VETO.treeline + 0.01` raised ONE cell by +0.438 against
  // unchanged neighbours, which drove its D8 slope to 0.4390 — 5.5x the 0.08
  // cap. scoreSettlement short-circuits, so the SLOPE line answered and the
  // treeline line was never reached: deleting the treeline veto entirely left
  // the whole suite green (review I). A fixture that trips two vetoes proves
  // neither, so every case below asserts, independently of the pass's
  // short-circuit order, that exactly one veto rejects its cell.
  const grid = coastWorld(); ownRegions(grid);
  const biomeName = (b) => grid.biomeNames[b] ?? null;
  const at = (cx, cy) => idx({ grid, cx, cy });
  const score = (i, survey = "surveyed") => scoreSettlement({
    grid, i, v: view({ grid, i }),
    water: { inlandKm: 99, sheltered: false }, regionSurvey: survey, biomeName });
  // The veto set, enumerated rather than short-circuited — the same technique
  // the real-world census uses, at fixture scale.
  const vetoes = (i, survey = "surveyed") => {
    const v = view({ grid, i });
    const out = [];
    if ((grid.flags[i] & FLAG.SEA) !== 0) out.push("sea");
    if (survey !== "surveyed") out.push("reported");
    if (v.slope > VETO.slopeMax) out.push("slope");
    if (grid.elev[i] > VETO.treeline) out.push("treeline");
    if (v.freshWater < VETO.freshWaterMin) out.push("freshWater");
    const b = biomeName(grid.biome[i]);
    if (b === "ice" || b === "lava") out.push("biome");
    return out;
  };
  const only = (i, name, survey = "surveyed") => {
    assert.deepEqual(vetoes(i, survey), [name],
      `the ${name} fixture trips ${JSON.stringify(vetoes(i, survey))} — it proves nothing`);
    assert.equal(score(i, survey), 0, `${name} must be vetoed`);
  };

  const good = at(60, 30);
  assert.deepEqual(vetoes(good), [], "the control cell is already vetoed");
  assert.ok(score(good) > 0, "the control cell is already vetoed — the fixture proves nothing");

  // The sea cell is given MOISTURE first: without it the fresh-water veto
  // rejects it anyway and the water veto is untested.
  const wet = at(10, 30);
  grid.moist[wet] = 0.9;
  assert.ok(view({ grid, i: wet }).freshWater >= VETO.freshWaterMin, "the fixture sea cell is dry");
  only(wet, "sea");
  only(good, "reported", "reported");

  const steep = at(61, 30);
  grid.elev[steep] = grid.elev[steep] + VETO.slopeMax + 0.01;
  only(steep, "slope");

  // THE TREELINE, on a PLATEAU. Its 3x3 neighbourhood is raised with it, so the
  // slope it reads is 0 and the only rule left that can reject it is its own.
  // It also sits clear of the other fixture cells, so raising it cannot confound
  // theirs the way a single spike would.
  const high = at(70, 30);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
    grid.elev[at(70 + dx, 30 + dy)] = VETO.treeline + 0.01;
  assert.equal(view({ grid, i: high }).slope, 0, "the treeline fixture is a spike, not a plateau");
  only(high, "treeline");

  const dry = at(63, 30);
  grid.moist[dry] = VETO.freshWaterMin - 0.01;
  only(dry, "freshWater");

  for (const [name, index] of [["ice", 1], ["lava", 2]]) {
    const b = at(64 + index, 30);
    grid.biome[b] = index;
    assert.equal(biomeName(grid.biome[b]), name);
    only(b, "biome");
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

test("the fixture's six settlements are pinned records, not just six counts", () => {
  // THE TIEBREAKS ARE ONLY VISIBLE HERE. The fixture has 445 distinct scores
  // over 5,454 eligible cells, so ties are everywhere (largest group 67) and
  // the two best cells tie exactly — which of them is the CAPITAL is decided
  // by the `settlements` stream and then by cell index, and no count assertion
  // can see it. (On the real 800 x 800 field there are 18,895 eligible cells
  // and ZERO exact ties, so this fixture is the only venue.)
  const r = place();
  assert.deepEqual(r.settlements.map((x) => [x.id, x.rank, ...x.atKm, x.score, x.region]), [
    ["c01/s01", "capital", 60.5, 108.5, 0.93, "c01/r02"],
    ["c01/s02", "hub", 60.5, 11.5, 0.93, "c01/r01"],
    ["c01/s03", "hub", 60.5, 47.5, 0.68, "c01/r04"],
    ["c01/s04", "village", 60.5, 38.5, 0.68, "c01/r03"],
    ["c01/s05", "village", 60.5, 99.5, 0.68, "c01/r01"],
    ["c01/s06", "village", 60.5, 29.5, 0.68, "c01/r02"],
  ]);
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
  // THE RESET IS UNCONDITIONAL, and that is what makes a second call on the SAME
  // regions array idempotent. `if (!r.settlements) r.settlements = []` was an
  // undeclared mutation survivor (review I): with it, a re-run appends and every
  // region reports its settlements twice — and G-DUNGEON-REACH reads this array.
  const grid = coastWorld(); ownRegions(grid);
  const shared = regions();
  const first = placeSettlements({ grid, premises: PREMISES, regions: shared, manifest: M,
                                   stream: SETTLEMENT_STREAM }).settlements;
  placeSettlements({ grid, premises: PREMISES, regions: shared, manifest: M,
                     stream: SETTLEMENT_STREAM });
  assert.deepEqual(shared.flatMap((x) => x.settlements).sort(),
    first.map((x) => x.id).sort(), "a second run doubled the back-reference");
});

test("placeSettlements is deterministic", () => {
  const run = () => JSON.stringify(place().settlements);
  assert.equal(run(), run());
});

// ── the pinned path ───────────────────────────────────────────────────────

test("a re-ordered regions[] is a loud error — grid.owner is an INDEX into it", () => {
  const grid = coastWorld(); ownRegions(grid);
  assert.throws(() => placeSettlements({ grid, premises: PREMISES, regions: regions().reverse(),
    manifest: M, stream: SETTLEMENT_STREAM }), /grid\.owner indexes regions\[\]/);
  assert.throws(() => placeSettlements({ grid, premises: PREMISES, regions: regions().slice(0, 4),
    manifest: M, stream: SETTLEMENT_STREAM }), /grid\.regionIds has/);
});

test("a region naming a continent no premise declares is a loud error", () => {
  const grid = coastWorld(); ownRegions(grid);
  const regs = regions();
  regs[3].continent = "c99";
  assert.throws(() => placeSettlements({ grid, premises: PREMISES, regions: regs,
    manifest: M, stream: SETTLEMENT_STREAM }), /names continent c99/);
});

test("a raw pinned record is a loud TypeError, never a silent mis-placement", () => {
  assert.throws(() => place({
    pinned: [{ id: "gildmark", pin: { at: [60, 60] }, settlementRank: "capital" }],
  }), /is not a placePinned\(\) result/);
});

test("a pinned entry with no rank is a loud TypeError — it would consume no quota", () => {
  assert.throws(() => place({
    pinned: [{ id: "c01/s99", title: "Nowhere", at: [60, 30], cell: [60, 30], continent: "c01",
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

test("a duplicate pinned id and an out-of-bounds pinned cell are loud TypeErrors", () => {
  const pin = { id: "c01/s01", title: "Gildmark", at: [60, 30], cell: [60, 30], continent: "c01",
                region: "c01/r03", rank: "hub" };
  assert.throws(() => place({ pinned: [pin, { ...pin }] }), /pinned id c01\/s01 appears twice/);
  assert.throws(() => place({ pinned: [{ ...pin, cell: [600, 30] }] }),
    /outside the 120 x 120 grid/);
});

test("every way a pin can contradict the fabric is REPORTED, and the pin is never moved", () => {
  const mk = (over) => ({ id: "c01/s01", title: "Gildmark", at: [60, 30], cell: [60, 30],
                          continent: "c01", region: "c01/r03", rank: "hub", ...over });
  const at = (over) => place({ pinned: [mk(over)] }).problems;
  assert.ok(at({ cell: [10, 30], at: [10, 30], region: "c01/r03" })
    .some((p) => /is on a sea cell/.test(p)));
  assert.ok(at({ region: "c01/r06" }).some((p) => /a reported region/.test(p)));
  assert.ok(at({ region: "c01/r99" }).some((p) => /which is not a region/.test(p)));
  assert.ok(at({ at: [12, 90] }).some((p) => /the two disagree by more than one cell/.test(p)));
  // and in every case the pin is still placed at its committed point
  const r = place({ pinned: [mk({ region: "c01/r06" })] });
  assert.deepEqual(r.settlements.find((s) => s.id === "c01/s01").atKm, [60, 30]);
});

test("an over-filled tier is REPORTED — problems reported under-fill only", () => {
  const pins = [1, 2, 3].map((n) => ({ id: `c01/p0${n}`, title: `Pin ${n}`,
    at: [20 + n * 20, 20 + n * 20], cell: [20 + n * 20, 20 + n * 20], continent: "c01",
    region: "c01/r03", rank: "capital" }));
  const r = place({ pinned: pins });
  assert.ok(r.problems.some((p) => /3 pinned capitals against a quota of 1/.test(p)),
    JSON.stringify(r.problems));
  assert.equal(r.settlements.filter((s) => s.rank === "capital").length, 3, "a pin was dropped");
});

test("two pins closer than the village separation are REPORTED, not moved apart", () => {
  const pins = [
    { id: "c01/p01", title: "Pin One", at: [60, 30], cell: [60, 30], continent: "c01",
      region: "c01/r03", rank: "hub" },
    { id: "c01/p02", title: "Pin Two", at: [61, 30], cell: [61, 30], continent: "c01",
      region: "c01/r03", rank: "hub" },
  ];
  const r = place({ pinned: pins });
  assert.ok(r.problems.some((p) => /c01\/p01 and c01\/p02 are 1.00 km apart/.test(p)),
    JSON.stringify(r.problems));
  assert.deepEqual(r.settlements.find((s) => s.id === "c01/p02").atKm, [61, 30]);
});

test("a malformed `at` is a loud TypeError, not a [null, null] coordinate", () => {
  // WHAT THIS PREVENTS, measured before the guard existed: `at: []` produced a
  // record with `atKm: [null, null]` and `problems: []`; the at/cell
  // disagreement check could not fire (`NaN > cellKm` is false); the pin
  // exerted NO separation (`distKm(x, y, NaN, NaN) < min` is false), so a
  // generated village landed 4.00 km from a pin that should force 9.00; and
  // `assignLevelBands` then threw `bands[ring] is not iterable` from inside a
  // function that had reported nothing.
  const mk = (over) => ({ id: "c01/s01", title: "Gildmark", at: [60, 30], cell: [60, 30],
                          continent: "c01", region: "c01/r03", rank: "hub", ...over });
  for (const bad of [[], [60.5], [60.5, 30, 7], ["60.5", "30"], [60.5, NaN], [60.5, null]])
    assert.throws(() => place({ pinned: [mk({ at: bad })] }),
      /two finite numbers in each pair/, `at: ${JSON.stringify(bad)} was accepted`);
  for (const bad of [[], [60], ["60", "30"], [60, undefined]])
    assert.throws(() => place({ pinned: [mk({ cell: bad })] }),
      /two finite numbers in each pair/, `cell: ${JSON.stringify(bad)} was accepted`);
  // …and the well-formed pin still binds the 9 km separation it is supposed to
  const ok = place({ pinned: [mk({})] });
  for (const t of ok.settlements) {
    if (t.id === "c01/s01") continue;
    const d = Math.sqrt((t.atKm[0] - 60) ** 2 + (t.atKm[1] - 30) ** 2);
    assert.ok(d >= SEPARATION_KM[t.rank] - 1e-9, `${t.id} is ${d.toFixed(2)} km from the pin`);
  }
});

test("a pin with no title is a loud TypeError — its NAME is the f-town id", () => {
  const mk = (over) => ({ id: "c-town-gildmark", title: "Gildmark", at: [60, 30], cell: [60, 30],
                          continent: "c01", region: "c01/r03", rank: "capital", ...over });
  for (const bad of [null, undefined, "", "   ", 7])
    assert.throws(() => place({ pinned: [mk({ title: bad })] }), /is a NAMED place/,
      `title: ${JSON.stringify(bad)} was accepted`);
  // THE SILENT WRONG ID this refuses: legal, collision-free, and not the one
  // Plan E's committed `{ pinned: "c-town-gildmark", feature: "f-town-gildmark" }`
  // edges resolve.
  assert.equal(townFeatureId(slugOf("c-town-gildmark")), "f-town-c-town-gildmark");
  assert.throws(() => townSlug({ settlement: { id: "c-town-gildmark", title: null, pinned: true } }),
    /has no title/);
  // the fallback is still live for a GENERATED settlement, which is what it is for
  assert.equal(townSlug({ settlement: { id: "c02/s01", title: null } }), "c02-s01");
  assert.equal(townSlug({ settlement: { id: "c-town-gildmark", title: "Gildmark", pinned: true } }),
    "gildmark");
});

test("a pin declaring the wrong continent is REPORTED, and cannot slip past the capital rule", () => {
  const mk = (over) => ({ id: "c01/p01", title: "Gildmark", at: [60, 30], cell: [60, 30],
                          continent: "c01", region: "c01/r03", rank: "capital", ...over });
  const control = place({ pinned: [mk({})] });
  assert.deepEqual(control.problems, [], JSON.stringify(control.problems));
  assert.deepEqual(control.settlements.filter((s) => s.rank === "capital").map((s) => s.id),
    ["c01/p01"], "the pin consumed the single capital quota");
  // A TYPO IN ONE FIELD used to buy a second capital on the same landmass, with
  // problems: []. capitalsPerContinent is keyed on the DECLARED continent and
  // the generated tier on region.continent, so the two never met.
  const wrong = place({ pinned: [mk({ continent: "cZZ" })] });
  assert.ok(wrong.problems.some((p) => /declares continent cZZ and its region c01\/r03 is on c01/.test(p)),
    JSON.stringify(wrong.problems));
  // an unresolvable region cannot be cross-checked, so the premise set is
  assert.ok(place({ pinned: [mk({ region: "c01/r99", continent: "cZZ" })] })
    .problems.some((p) => /declares continent cZZ, which is not one of the/.test(p)));
});

test("a pinned record off owned land is a reported problem, not a placed settlement", () => {
  const r = place({ pinned: [{ id: "c01/s01", title: "Gildmark", at: [5, 5], cell: [5, 5],
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
  // THE OUTERMOST CLAMP. `bands` covers 0-360 km; the frame's diagonal is
  // 566 km, so a region past the last ring must land IN the last ring rather
  // than read `bands[undefined]`.
  regs[0].centroidKm = [origin.atKm[0] + 500, origin.atKm[1]];
  assignLevelBands({ regions: regs, settlements, manifest: M, problems });
  assert.deepEqual(regs[0].levelBand, bands[bands.length - 1],
    "a region beyond the outermost ring is not clamped into it");
  regs[0].centroidKm = [30, 20];
  assignLevelBands({ regions: regs, settlements, manifest: M, problems });
  // non-decreasing in distance, which is the property spec 11 buys
  const sorted = regs.map((r) => ({
    d: Math.sqrt((r.centroidKm[0] - origin.atKm[0]) ** 2 + (r.centroidKm[1] - origin.atKm[1]) ** 2),
    lo: r.levelBand[0], id: r.id })).sort((a, b) => a.d - b.d);
  for (let i = 1; i < sorted.length; i++)
    assert.ok(sorted[i].lo >= sorted[i - 1].lo, `${sorted[i].id} is further out but banded lower`);
});

test("the level-band fallback chain is ORDERED: the pin wins, and each step is reported", () => {
  // BOTH HALVES OF THIS WERE MUTATION SURVIVORS. Swapping `byPin` and
  // `byContinent`, and deleting the whole "anchored on X instead" report,
  // each left the suite green — because in Plan C `c-town-gildmark` does not
  // exist, so the real-world assertion `origin === "c02/s01"` is satisfied by
  // the CONTINENT fallback alone and says nothing about the chain. The property
  // that will matter in Plan D is exactly the one nothing pinned.
  const { regs, settlements } = place();
  regs.forEach((r, n) => { r.centroidKm = [30 + n * 8, 20 + n * 9]; });
  const M2 = { ...M, levelBands: { ...M.levelBands, originPinnedId: "c-town-gildmark",
                                   originFallbackContinent: "c01" } };
  const cap = settlements.find((s) => s.rank === "capital");
  assert.equal(cap.continent, "c01", "the fixture capital is not on the fallback continent");

  // 1. THE PIN WINS over a capital that satisfies the continent fallback.
  const pin = { id: "c-town-gildmark", title: "Gildmark", continent: "c01", rank: "capital",
                atKm: [95, 100], cell: [95, 100], region: "c01/r05", score: 1,
                portEligible: false, pinned: true };
  const withPin = [];
  const outPin = assignLevelBands({ regions: regs, settlements: [...settlements, pin],
                                    manifest: M2, problems: withPin });
  assert.equal(outPin.origin, "c-town-gildmark", "the continent fallback beat the pin");
  assert.deepEqual(withPin, [], "the pin is the FIRST choice, so nothing is reported");
  const km = (x0, y0, x1, y1) => Math.sqrt((x0 - x1) * (x0 - x1) + (y0 - y1) * (y0 - y1));
  const dPin = regs.map((r) => km(r.centroidKm[0], r.centroidKm[1], 95, 100));

  // 2. WITHOUT the pin the continent fallback answers — same chain, different origin.
  const noPin = [];
  const outCont = assignLevelBands({ regions: regs, settlements, manifest: M2, problems: noPin });
  assert.equal(outCont.origin, cap.id);
  assert.deepEqual(noPin, [], "the continent fallback is a declared step, not a degradation");
  // …and the two origins really do band the world differently, so step 1 above
  // is a claim about the OUTPUT and not only about a returned string.
  const dCont = regs.map((r) => km(r.centroidKm[0], r.centroidKm[1], cap.atKm[0], cap.atKm[1]));
  assert.notDeepEqual(dPin, dCont, "both origins are the same point — the fixture proves nothing");

  // 3. NEITHER: the rings move to another landmass, and it SAYS SO.
  const M3 = { ...M2, levelBands: { ...M2.levelBands, originFallbackContinent: "c99" } };
  const moved = [];
  const outAny = assignLevelBands({ regions: regs, settlements, manifest: M3, problems: moved });
  assert.equal(outAny.origin, cap.id);
  assert.ok(moved.some((p) => /no capital on c99 and no c-town-gildmark/.test(p) &&
                              new RegExp(`anchored on ${cap.id}`).test(p)), JSON.stringify(moved));

  // 4. A PIN RANKED BELOW CAPITAL still anchors, and is named for it.
  const ranked = [];
  assignLevelBands({ regions: regs, settlements: [...settlements, { ...pin, rank: "hub" }],
                     manifest: M2, problems: ranked });
  assert.ok(ranked.some((p) => /origin pin c-town-gildmark is ranked hub, not capital/.test(p)),
    JSON.stringify(ranked));

  // 5. AND IT CANNOT BE CALLED WITHOUT A LOG — the plan's Task-10 call site
  //    (:6614) passes no `problems` and reads no return value.
  assert.throws(() => assignLevelBands({ regions: regs, settlements, manifest: M2 }),
    /needs a problems array/);
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
  const p12 = routeRoads({ grid, settlements: p11.settlements, regions: part.regions });
  const p13 = anchorDungeons({ instances: lf.instances, regions: part.regions,
    settlements: p11.settlements, lexicon: LEXICON, manifest: MANIFEST, stream: settleStream });
  REAL = { grid, sea, part, lf, p11, bands, bandProblems, settleStream, p12, p13 };
  return REAL;
}

test("REAL WORLD — narrowWaterKm and grid.fetchKm are ONE construction, joined by re-deriving it", () => {
  // `narrow <= fetch` is a TAUTOLOGY (min <= max of the same two expressions)
  // and review A was right that it joins nothing. What joins them is
  // RE-DERIVING classifySea's own quantity from narrowWaterKm's sweeps and
  // comparing cell by cell: if either definition moves, this reds.
  const { grid } = realWorld();
  const narrow = narrowWaterKm({ grid });
  // the max-over-axes twin, built by swapping min for max in the same sweep
  const { w, h, n } = grid;
  const isSea = (i) => (grid.flags[i] & FLAG.SEA) !== 0;
  const runL = new Int32Array(n), runR = new Int32Array(n), runU = new Int32Array(n), runD = new Int32Array(n);
  for (let y = 0; y < h; y++) {
    let r = 0;
    for (let x = 0; x < w; x++) { const i = y * w + x; r = isSea(i) ? r + 1 : 0; runL[i] = r; }
    r = 0;
    for (let x = w - 1; x >= 0; x--) { const i = y * w + x; r = isSea(i) ? r + 1 : 0; runR[i] = r; }
  }
  for (let x = 0; x < w; x++) {
    let r = 0;
    for (let y = 0; y < h; y++) { const i = y * w + x; r = isSea(i) ? r + 1 : 0; runU[i] = r; }
    r = 0;
    for (let y = h - 1; y >= 0; y--) { const i = y * w + x; r = isSea(i) ? r + 1 : 0; runD[i] = r; }
  }
  let sea = 0, strictlyLess = 0;
  for (let i = 0; i < n; i++) {
    if (!isSea(i)) { assert.equal(narrow[i], -1); assert.equal(grid.fetchKm[i], -1); continue; }
    sea++;
    const across = runL[i] + runR[i] - 1, down = runU[i] + runD[i] - 1;
    assert.equal(grid.fetchKm[i], Math.max(across, down) * grid.cellKm,
      `cell ${i}: classifySea's fetchKm is no longer max-over-axes of these sweeps`);
    assert.equal(narrow[i], Math.min(across, down) * grid.cellKm);
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

test("REAL WORLD — what masks the treeline and ice/lava vetoes is the SURVEY DRAW", () => {
  // THE RECORD THIS FIXES. The first draft said the two vetoes were "waiting for
  // a premise with wet ground above the treeline or on lava", i.e. it blamed the
  // premise set. The world already carries that ground; only 10% of it is ever
  // scored. Pinned cell by cell so the attribution cannot rot the way §11's
  // c10 attribution did.
  const { grid, part } = realWorld();
  const above = {}, iceLava = {}, soleTreeline = {}, soleIceLava = {};
  let owned = 0, surveyed = 0;
  for (let i = 0; i < grid.n; i++) {
    if (grid.plate[i] < 0 || grid.owner[i] < 0) continue;
    const r = part.regions[grid.owner[i]];
    if (!r) continue;
    owned++;
    if (r.survey === "surveyed") surveyed++;
    if ((grid.flags[i] & FLAG.SEA) !== 0) continue;
    const v = view({ grid, i });
    const hi = grid.elev[i] > VETO.treeline;
    const b = grid.biomeNames[grid.biome[i]];
    const il = b === "ice" || b === "lava";
    if (hi) above[r.continent] = (above[r.continent] ?? 0) + 1;
    if (il) iceLava[r.continent] = (iceLava[r.continent] ?? 0) + 1;
    // the SOLE-veto census, with the survey pre-filter lifted and nothing else
    const rest = v.slope <= VETO.slopeMax && v.freshWater >= VETO.freshWaterMin;
    if (hi && !il && rest) soleTreeline[r.continent] = (soleTreeline[r.continent] ?? 0) + 1;
    if (il && !hi && rest) soleIceLava[r.continent] = (soleIceLava[r.continent] ?? 0) + 1;
  }
  assert.equal(owned, 256000);
  assert.equal(surveyed, 25600, "only 10% of owned land is ever scored");
  assert.deepEqual(above, { c01: 1841, c03: 309, c10: 1145 });
  assert.deepEqual(iceLava, { c01: 23244, c10: 834, c12: 2997 });
  // Lift the survey filter and both vetoes decide, on their own, at scale.
  assert.deepEqual(soleTreeline, { c03: 128 });
  assert.deepEqual(soleIceLava, { c01: 10554, c12: 2942 });
  // …and the continents holding that ground have no surveyed region at all,
  // which is the whole mechanism.
  for (const c of ["c01", "c11", "c12", "c13"])
    assert.equal(part.regions.filter((r) => r.continent === c && r.survey === "surveyed").length, 0,
      `${c} has a surveyed region — the masking explanation has moved`);
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

test("REAL WORLD — the shelterFetchKm hazard Plan D must decide, pinned as numbers", () => {
  // NOT A DEFECT IN THIS PASS — a decision filed in Plan D's Consumes block for
  // `pinReceipts[].measured.shelterFetchKm`. `grid.fetchKm` is MAX over the two
  // axes (wave exposure); the spec's shelter test is MIN over them (enclosure).
  // A pinned harbour declaring `water.shelterFetchKmMax: 15` measured against
  // grid.fetchKm is unsatisfiable at most of this world's ports, and measured
  // against narrowWaterKm it is true by construction — because `isPort` already
  // requires narrow < 15. The numbers are pinned here so the argument in Plan D
  // cannot rot into prose.
  const { grid, part, p11 } = realWorld();
  const narrow = narrowWaterKm({ grid });
  const { inlandKm, nearestSea } = seaProximity({ grid });
  const biomeName = (b) => grid.biomeNames[b] ?? null;
  let ports = 0, fetchOver = 0, narrowOver = 0;
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) !== 0 || grid.plate[i] < 0) continue;
    const o = grid.owner[i];
    if (o < 0 || part.regions[o].survey !== "surveyed") continue;
    const v = view({ grid, i });
    const near = nearestSea[i];
    const sheltered = near >= 0 && narrow[near] >= 0 && narrow[near] < SHELTER_FETCH_KM_MAX;
    if (scoreSettlement({ grid, i, v, water: { inlandKm: inlandKm[i], sheltered },
                          regionSurvey: "surveyed", biomeName }) <= 0) continue;
    if (!(inlandKm[i] >= 0 && inlandKm[i] <= COAST_NEAR_KM && sheltered)) continue;
    ports++;
    if (grid.fetchKm[near] > SHELTER_FETCH_KM_MAX) fetchOver++;
    if (narrow[near] > SHELTER_FETCH_KM_MAX) narrowOver++;
  }
  assert.equal(ports, 520);
  assert.equal(fetchOver, 332, "grid.fetchKm > 15 at a port-eligible cell");
  assert.equal(narrowOver, 0, "narrowWaterKm > 15 is impossible at a port — isPort requires < 15");
  const capitals = p11.settlements.filter((s) => s.rank === "capital");
  assert.deepEqual(capitals.map((s) => {
    const near = nearestSea[idx({ grid, cx: s.cell[0], cy: s.cell[1] })];
    return [s.id, grid.fetchKm[near], narrow[near]];
  }), [["c02/s01", 240.5, 9], ["c03/s01", 56.5, 10.5], ["c05/s01", 48.5, 6]]);
  // …and c04 Stonemoor has NO port-eligible cell at all, so `c-town-netstead`
  // cannot be a sheltered-port capital there whatever Plan D decides above.
  // (The per-continent port census two tests up has no c04 row; asserted here
  // in the words Plan D's Consumes block uses.)
  assert.equal(p11.settlements.filter((s) => s.continent === "c04" && s.portEligible).length, 0);
});

test("REAL WORLD — 47 settlements, 3 capital / 12 hub / 32 village, no problems", () => {
  // 32 villages, not 30: Plan D Task 10's frontier reservations (owner
  // ruling 2026-08-25). Pinned towns consume hub/capital quota at fixed seed
  // points and the separation cascade pushed marginal surveyed regions below
  // G-POI's 12-POI floor and left c09's bound dungeon handles unreachable;
  // two reserved villages restore them, so the manifest quota rises to match.
  const { p11 } = realWorld();
  assert.deepEqual(p11.problems, []);
  assert.equal(p11.settlements.length, 47);
  const byRank = {};
  for (const s of p11.settlements) byRank[s.rank] = (byRank[s.rank] ?? 0) + 1;
  assert.deepEqual(byRank, { capital: 3, hub: 12, village: 32 });
  assert.equal(new Set(p11.settlements.map((s) => s.id)).size, 47, "duplicate settlement id");
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

test("REAL WORLD — the score DISCRIMINATES: it is not one value wearing 47 hats", () => {
  const { p11 } = realWorld();
  const scores = p11.settlements.map((s) => s.score).sort((a, b) => a - b);
  assert.ok(scores[0] > 0, "a placed settlement scored 0 — it was vetoed and placed anyway");
  assert.ok(scores[scores.length - 1] <= 1);
  assert.ok(new Set(scores).size >= 10,
    `only ${new Set(scores).size} distinct scores among 47 settlements`);
  assert.ok(scores[scores.length - 1] - scores[0] > 0.2,
    `the placed range is ${scores[0]}..${scores[scores.length - 1]} — the score barely separates`);
  assert.deepEqual([scores[0], scores[scores.length - 1]], [0.54, 0.95]);
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

// ── THE REAL WORLD: P12 roads, sea lanes and trunk rivers ─────────────────

test("REAL WORLD — every settlement is on its continent's road network", () => {
  const { part, p11, p12 } = realWorld();
  // The only two problems on this world are the two single-cell "rivers" the
  // trunk-river rule declines to draw — no settlement is unreachable overland.
  assert.deepEqual(p12.problems, [
    "roads: c08's highest-accumulation river is a single cell at [226.25,322.25] — no trunk river emitted",
    "roads: c11's highest-accumulation river is a single cell at [332.75,82.25] — no trunk river emitted",
  ]);
  assert.equal(p12.problems.filter((x) => /not reachable overland/.test(x)).length, 0);
  const byCont = new Map();
  for (const s of p11.settlements) {
    if (!byCont.has(s.continent)) byCont.set(s.continent, []);
    byCont.get(s.continent).push(s);
  }
  let legs = 0;
  for (const [cont, list] of [...byCont.entries()].sort()) {
    const mine = p12.roads.filter((r) => r.continent === cont);
    assert.equal(mine.length, list.length - 1, `${cont}: ${mine.length} roads for ${list.length} settlements`);
    legs += mine.length;
    const adj = new Map(list.map((x) => [x.id, []]));
    for (const road of mine) { adj.get(road.from).push(road.to); adj.get(road.to).push(road.from); }
    const seen = new Set([list[0].id]);
    const queue = [list[0].id];
    while (queue.length) for (const n of adj.get(queue.pop())) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    assert.equal(seen.size, list.length, `${cont}'s road network is disconnected`);
  }
  assert.equal(p12.roads.length, 40);
  assert.equal(legs, 40);
  assert.equal(new Set(p12.roads.map((r) => r.id)).size, 40);
  assert.deepEqual([...byCont.keys()].sort(), ["c02", "c03", "c04", "c05", "c06", "c07", "c09"]);
});

test("REAL WORLD — no road point is at sea, and none leaves its own continent", () => {
  const { grid, part, p12 } = realWorld();
  let points = 0;
  for (const road of p12.roads)
    for (const [x, y] of road.points) {
      const i = idx({ grid, cx: Math.floor(x / grid.cellKm), cy: Math.floor(y / grid.cellKm) });
      assert.equal(grid.flags[i] & FLAG.SEA, 0, `road ${road.id} crosses the sea at ${x},${y}`);
      assert.equal(part.regions[grid.owner[i]].continent, road.continent,
        `road ${road.id} has a point on ${part.regions[grid.owner[i]].continent}`);
      points++;
    }
  assert.ok(points > 1000, `only ${points} road points on the whole world`);
});

test("REAL WORLD — two sea lanes join the three capitals, water end to end", () => {
  const { grid, p12, p11 } = realWorld();
  const caps = p11.settlements.filter((s) => s.rank === "capital");
  assert.equal(p12.seaLanes.length, caps.length - 1);
  assert.deepEqual(p12.seaLanes.map((l) => [l.id, l.from, l.to]),
    [["lane-01", "c02/s01", "c03/s01"], ["lane-02", "c03/s01", "c05/s01"]]);
  for (const lane of p12.seaLanes) {
    assert.ok(lane.km > 0);
    for (let k = 1; k < lane.points.length - 1; k++) {
      const i = idx({ grid, cx: Math.floor(lane.points[k][0] / grid.cellKm),
                      cy: Math.floor(lane.points[k][1] / grid.cellKm) });
      assert.notEqual(grid.flags[i] & FLAG.SEA, 0,
        `${lane.id} runs over land at ${lane.points[k]}`);
    }
  }
});

test("REAL WORLD — one trunk river per continent that has a river at all", () => {
  const { grid, part, p12 } = realWorld();
  const withRivers = new Set();
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.RIVER) === 0) continue;
    const o = grid.owner[i];
    if (o >= 0) withRivers.add(part.regions[o].continent);
  }
  const traced = Object.keys(p12.trunkRivers).sort();
  // c08 and c11 each hold ONE river cell that drains to sea with no inflow —
  // a single point, not a polyline. They are named in `problems` and omitted.
  assert.deepEqual(traced, ["c02", "c03", "c04", "c05", "c06", "c07", "c12"]);
  assert.deepEqual([...withRivers].sort(),
    ["c02", "c03", "c04", "c05", "c06", "c07", "c08", "c11", "c12"]);
  for (const c of traced) assert.ok(withRivers.has(c), `${c} has a trunk river and no RIVER cell`);
  for (const [c, r] of Object.entries(p12.trunkRivers)) {
    assert.equal(r.name, null, `${c}'s trunk river is named — Plan D mints names`);
    assert.ok(r.points.length >= 2, `${c}'s trunk river has ${r.points.length} point(s)`);
    // and every point is on its own landmass
    for (const [x, y] of r.points) {
      const i = idx({ grid, cx: Math.floor(x / grid.cellKm), cy: Math.floor(y / grid.cellKm) });
      assert.equal(part.regions[grid.owner[i]].continent, c,
        `${c}'s trunk river has a point on ${part.regions[grid.owner[i]].continent}`);
    }
  }
  assert.deepEqual(Object.fromEntries(traced.map((c) => [c, p12.trunkRivers[c].points.length])),
    { c02: 74, c03: 47, c04: 7, c05: 87, c06: 17, c07: 29, c12: 8 });
});

test("REAL WORLD — routeRoads is independent of the heap tiebreak and of input order", () => {
  const { grid, part, p11, p12 } = realWorld();
  const baseline = JSON.stringify(p12);
  const variants = [
    function (a, b) { return this.v[a] < this.v[b] || (this.v[a] === this.v[b] && this.i[a] > this.i[b]); },
    function (a, b) { return this.v[a] < this.v[b]; },
  ];
  const orders = [[...p11.settlements].reverse(),
                  [...p11.settlements].sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))];
  for (const less of variants) for (const order of orders)
    assert.equal(JSON.stringify(routeRoads({ grid, settlements: order, regions: part.regions, less })),
      baseline, "the road network moved under a comparator or input permutation");
});

// ── THE REAL WORLD: P13 dungeon anchors ───────────────────────────────────

test("REAL WORLD — 60 complexes anchored against the manifest quota, no problems", () => {
  const { p13 } = realWorld();
  assert.deepEqual(p13.problems, []);
  assert.equal(p13.anchors.length, MANIFEST.quotas.dungeons.complexes);
  assert.equal(p13.anchors.length, 60);
  assert.equal(new Set(p13.anchors.map((a) => a.handle)).size, 60, "an instance was anchored twice");
  // FLOORS ARE NOT PRODUCED HERE, and no pass in Plan C produces them. The
  // manifest declares `floors: 190` beside `complexes: 60`; P13 anchors the
  // DOOR. The count is pinned so the omission is a stated fact rather than a
  // number someone later assumes was generated.
  assert.deepEqual(MANIFEST.quotas.dungeons,
    { complexes: 60, floors: 190, families: 3, familySize: 8, bespoke: 36 });
  // P13 produces `complexes` and NOTHING ELSE: no floor, no family, no bespoke
  // marker. Pinned so the omission is a stated fact rather than a number a
  // later reader assumes was generated.
  for (const a of realWorld().p13.anchors)
    assert.deepEqual(Object.keys(a).sort(),
      ["continent", "entranceType", "handle", "hopsToSettlement", "region"]);
});

test("REAL WORLD — every anchor is dungeonCapable, in range, and its hops are serialised", () => {
  const { part, p11, p13 } = realWorld();
  const capable = new Set(LEXICON.filter((t) => t.dungeonCapable).map((t) => t.id));
  const byId = new Map(part.regions.map((r) => [r.id, r]));
  const settledRegions = new Set(p11.settlements.map((s) => s.region));
  for (const a of p13.anchors) {
    assert.ok(capable.has(a.entranceType), `${a.handle} entrance ${a.entranceType} is not dungeonCapable`);
    assert.ok(byId.has(a.region), `${a.handle} names region ${a.region}`);
    assert.equal(a.continent, a.region.split("/")[0]);
    assert.ok(Number.isInteger(a.hopsToSettlement) && a.hopsToSettlement >= 0 &&
              a.hopsToSettlement <= MAX_HOPS, `${a.handle} hops ${a.hopsToSettlement}`);
    if (a.hopsToSettlement === 0)
      assert.ok(settledRegions.has(a.region), `${a.handle} claims 0 hops from an unsettled region`);
  }
  // all three hop distances occur — the number carries information
  const hist = {};
  for (const a of p13.anchors) hist[a.hopsToSettlement] = (hist[a.hopsToSettlement] ?? 0) + 1;
  assert.deepEqual(hist, { 0: 48, 1: 2, 2: 10 });
});

test("REAL WORLD — no anchor lands in a reported region, because Task 11's G-POI forbids it", () => {
  // THE GATE THIS SEAM WOULD OTHERWISE HAVE REDDENED TWO SEAMS LATER. Task 11's
  // `gWorldPoi` counts every dungeonAnchors row into its region's POI total
  // unconditionally and requires a reported region's total to be exactly 0
  // (spec §6.4 rule 2, "no interior detail inside a reported region"). Before
  // the survey filter, 36 of these 60 anchors were in reported regions — 36
  // gate failures, authored here and payable there.
  const { part, p13 } = realWorld();
  const byId = new Map(part.regions.map((r) => [r.id, r]));
  const bySurvey = {};
  for (const a of p13.anchors) {
    const survey = byId.get(a.region).survey;
    bySurvey[survey] = (bySurvey[survey] ?? 0) + 1;
  }
  assert.deepEqual(bySurvey, { surveyed: 60 });
  // and the world still has plenty of reported regions to have failed on
  assert.equal(part.regions.filter((r) => r.survey === "reported").length, 120);
});

test("REAL WORLD — the per-region cap BINDS: 60 anchors over 33 legal regions needs round 2", () => {
  // The cap used to be provably dead here — setting MAX_PER_REGION to 1 left
  // all 60 anchors byte-identical, because P13 spread across 94 regions, 61 of
  // which the downstream G-POI forbids it to use. Confined to the legal ones the
  // rule decides something: 33 regions cannot seat 60 anchors in one round, so
  // 27 of them take a second. MAX_PER_REGION 3 -> 1 now yields 33 anchors and an
  // under-fill problem ON THIS WORLD, not only in a fixture.
  const { lf, part, p13 } = realWorld();
  const capable = new Set(LEXICON.filter((t) => t.dungeonCapable).map((t) => t.id));
  const byId = new Map(part.regions.map((r) => [r.id, r]));
  const supply = lf.instances.filter((i) => capable.has(i.type));
  assert.equal(supply.length, 307);
  assert.equal(new Set(supply.map((i) => i.region)).size, 117);
  // …of which only this many are on a region an anchor may legally occupy
  const legal = supply.filter((i) => byId.get(i.region)?.survey === "surveyed");
  assert.equal(legal.length, 135);
  assert.equal(new Set(legal.map((i) => i.region)).size, 37);
  const per = new Map();
  for (const a of p13.anchors) per.set(a.region, (per.get(a.region) ?? 0) + 1);
  assert.equal(per.size, 33, "the anchors no longer spread one-per-region");
  assert.equal(Math.max(...per.values()), 2);
  assert.ok(Math.max(...per.values()) <= MAX_PER_REGION);
  assert.equal([...per.values()].filter((v) => v === 2).length, 27);
  // round 3 is still unexercised — recorded, not read as dead: 33 regions seat
  // 60 anchors in two rounds, so the 2 -> 3 step of the cap has no venue on this
  // world and is killed by dungeons.test.mjs's direct fixture instead.
  assert.equal([...per.values()].filter((v) => v === 3).length, 0);
});

test("REAL WORLD — anchors are spread across the settled continents", () => {
  const { p13 } = realWorld();
  const byCont = {};
  for (const a of p13.anchors) byCont[a.continent] = (byCont[a.continent] ?? 0) + 1;
  assert.deepEqual(byCont, { c02: 17, c03: 12, c04: 14, c05: 8, c06: 3, c07: 4, c09: 2 });
  assert.equal(Object.values(byCont).reduce((a, b) => a + b, 0), 60);
  assert.ok(new Set(p13.anchors.map((a) => a.entranceType)).size >= 5,
    "the 60 doors are all the same kind of hole");
});

test("REAL WORLD — anchorDungeons does not move when instances[] is re-ordered", () => {
  const { part, p11, lf, p13, settleStream } = realWorld();
  const again = anchorDungeons({ instances: [...lf.instances].reverse(), regions: part.regions,
    settlements: p11.settlements, lexicon: LEXICON, manifest: MANIFEST, stream: settleStream });
  assert.deepEqual(again.anchors, p13.anchors);
});

// ── the f-town-<slug> hard interface for Plan E ───────────────────────────

test("townSlug falls back to the id, because every Plan C title is null", () => {
  assert.equal(townFeatureId("gildmark"), "f-town-gildmark");
  assert.equal(townSlug({ settlement: { id: "c02/s01", title: null } }), "c02-s01");
  assert.equal(townSlug({ settlement: { id: "c02/s01", title: "Gildmark" } }), "gildmark");
  assert.equal(townSlug({ settlement: { id: "c02/s01", title: "Netstead Bight" } }), "netstead-bight");
  assert.equal(townSlug({ settlement: { id: "c02/s01", title: "  Tallow'quay  " } }), "tallow-quay");
  // The plan's buildTrunk writes slugOf(s.title) directly; on a Plan C
  // settlement that is slugOf(null), which slugs to the string "null" — a
  // legal-looking id pointing at the wrong town, 45 times over.
  assert.equal(slugOf(null), "null");
  assert.throws(() => townSlug({ settlement: { id: "c02/s01", title: "???" } }),
    /is not a legal f-town-<slug> tail/);
});

test("REAL WORLD — 47 f-town ids, all conforming, none colliding", () => {
  const { p11 } = realWorld();
  const ids = townFeatureIds({ settlements: p11.settlements });
  assert.equal(ids.size, 47);
  for (const id of ids.keys()) assert.match(id, /^f-town-[a-z0-9-]+$/);
  assert.ok(ids.has("f-town-c02-s01"));
  assert.throws(() => townFeatureIds({
    settlements: [{ id: "a/b", title: "Gildmark" }, { id: "c/d", title: "GILDMARK" }] }),
    /both slug to f-town-gildmark/);
});
