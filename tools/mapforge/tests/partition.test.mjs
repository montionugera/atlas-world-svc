// tools/mapforge/tests/partition.test.mjs — Task 7 (P8 biomes, P9 regions).
//
// Three of the plan's own fixtures could not have passed and are corrected
// here, each with its evidence at the test:
//
//  * every fixture except one calls `partitionRegions` WITHOUT `classifyBiomes`
//    first, so `grid.biomeNames` is empty and every `biomeShares` key would be
//    a Uint8Array index. P9 now throws on that, and the fixtures run P8;
//  * `partition.mjs`'s `mintSeed` is used and never imported in the plan's
//    listing, so the provenance line is a ReferenceError on the first reported
//    region;
//  * and the plan's suite asserts region COUNTS but never region AREA, which is
//    the quantity the manifest actually constrains — and the plan's allocation
//    misses it on 33 of 120. The real-world golden below is where that is
//    measured.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeGrid, FLAG, idx } from "../lib/grid.mjs";
import { BIOMES, TERRAIN_KINDS } from "../../../scripts/lib/spine.mjs";
import { classifyBiomes, TERRAIN_FOR_BIOMES, BIOME_RULE_NAMES } from "../lib/passes/biome.mjs";
import {
  partitionRegions, POISSON_R_KM, SMOOTHING_PASSES, allocateQuotas, poissonSites, siteOrder,
  growRegions, MinHeap,
} from "../lib/passes/partition.mjs";
import { priorityFlood, d8FlowDir, flowAccumulate } from "../lib/hydrology.mjs";
import { applyPremiseMasks } from "../lib/passes/mask.mjs";
import { buildElevation, assignSubstrate } from "../lib/passes/elevation.mjs";
import { selectSeaLevelByRank, classifySea, CELL_AREA_KM2 } from "../lib/passes/sea-level.mjs";
import { applyWinds } from "../lib/passes/winds.mjs";
import { carveWater } from "../lib/passes/water.mjs";
import { terrainStream } from "../lib/seed.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
const PREMISES = readdirSync(join(ROOT, "content/world/premises"))
  .filter((f) => f.endsWith(".json")).sort()
  .map((f) => JSON.parse(readFileSync(join(ROOT, "content/world/premises", f), "utf8")));

const digest = (arr) =>
  createHash("sha256").update(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength))
    .digest("hex").slice(0, 16);

// ── the synthetic world the plan's fixtures use ───────────────────────────
// A two-plate synthetic world: two square landmasses, everything else sea.
function twoPlateWorld({ cellKm = 2 } = {}) {
  const grid = makeGrid({ w: 200, h: 200, cellKm });
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
    const i = idx({ grid, cx: x, cy: y });
    const inA = x >= 20 && x < 80 && y >= 20 && y < 80;
    const inB = x >= 120 && x < 160 && y >= 120 && y < 160;
    if (inA || inB) { grid.plate[i] = inA ? 0 : 1; grid.elev[i] = 0.4; grid.moist[i] = 0.5; grid.temp[i] = 0.5; }
    else { grid.plate[i] = -1; grid.elev[i] = -0.7; grid.flags[i] |= FLAG.SEA; }
  }
  return grid;
}

// The same world with the second landmass left as sea, for the one-premise
// fixtures: a plate index with no premise is a wiring bug and P8 now says so.
function onePlateWorld({ cellKm = 2 } = {}) {
  const grid = twoPlateWorld({ cellKm });
  for (let y = 120; y < 160; y++) for (let x = 120; x < 160; x++) {
    const i = idx({ grid, cx: x, cy: y });
    grid.plate[i] = -1; grid.elev[i] = -0.7; grid.flags[i] |= FLAG.SEA;
  }
  return grid;
}

const TWO_PLATE_MANIFEST = {
  ...MANIFEST,
  landmasses: [
    { id: "c01", title: "A", class: "major", netKm2: 14400, interiorWaterKm2: 0, surveyed: 4, reported: 6 },
    { id: "c02", title: "B", class: "minor", netKm2: 6400, interiorWaterKm2: 0, surveyed: 2, reported: 3 },
  ],
};
const ONE_PLATE_MANIFEST = { ...MANIFEST, landmasses: [TWO_PLATE_MANIFEST.landmasses[0]] };
const STREAM = "d9a0051d32afab59";

/** P8 then P9, the pipeline order. The plan's fixtures skip P8 and cannot. */
function classifyAndPartition({ grid, premises, manifest }) {
  classifyBiomes({ grid, premises, BIOMES });
  return partitionRegions({ grid, premises, manifest, stream: STREAM });
}

const twoPremises = () => [{ ...PREMISES[0], id: "c01" }, { ...PREMISES[1], id: "c02" }];
const onePremise = () => [{ ...PREMISES[0], id: "c01" }];

// ── P8: the biome table ───────────────────────────────────────────────────

test("every premise palette entry is a real biome", () => {
  for (const p of PREMISES)
    for (const b of p.palette)
      assert.ok(BIOMES.includes(b), `${p.id} palette names "${b}", which is not in BIOMES`);
});

test("classifyBiomes assigns every land cell a biome from its premise palette", () => {
  const grid = twoPlateWorld();
  const premises = [
    { ...PREMISES[0], palette: ["meadow", "forest"] },
    { ...PREMISES[1], palette: ["rock", "upland"] },
  ];
  classifyBiomes({ grid, premises, BIOMES });
  for (let i = 0; i < grid.n; i++) {
    if (grid.plate[i] < 0) continue;
    const name = BIOMES[grid.biome[i]];
    assert.ok(premises[grid.plate[i]].palette.includes(name),
      `cell ${i} on plate ${grid.plate[i]} got "${name}", outside its palette`);
  }
});

test("classifyBiomes marks every sea cell as ocean", () => {
  const grid = twoPlateWorld();
  classifyBiomes({ grid, premises: PREMISES, BIOMES });
  const oceanIdx = BIOMES.indexOf("ocean");
  for (let i = 0; i < grid.n; i++)
    if ((grid.flags[i] & FLAG.SEA) !== 0) assert.equal(grid.biome[i], oceanIdx);
});

test("classifyBiomes sets grid.biomeNames, which is what grid.biomeName(i) reads", () => {
  const grid = twoPlateWorld();
  classifyBiomes({ grid, premises: twoPremises(), BIOMES });
  assert.deepEqual(grid.biomeNames, [...BIOMES]);
  assert.equal(grid.biomeName(idx({ grid, cx: 0, cy: 0 })), "ocean");
});

test("a rule naming a biome BIOMES does not carry is a throw, not a silent ocean", () => {
  const grid = twoPlateWorld();
  assert.throws(() => classifyBiomes({ grid, premises: twoPremises(), BIOMES: ["ocean", "meadow"] }),
    /names a biome BIOMES does not carry/);
  assert.throws(() => classifyBiomes({ grid, premises: twoPremises(), BIOMES: ["meadow"] }),
    /no 'ocean' entry/);
});

test("TERRAIN_FOR_BIOMES is TOTAL over BIOMES and every value is a real TERRAIN_KIND", () => {
  // The plan's map is partial with a `?? \"headland\"` tail, which turns a biome
  // added to BIOMES into a silent headland instead of a red test.
  for (const b of BIOMES)
    assert.ok(TERRAIN_FOR_BIOMES[b] !== undefined, `TERRAIN_FOR_BIOMES has no entry for "${b}"`);
  for (const [b, k] of Object.entries(TERRAIN_FOR_BIOMES))
    assert.ok(TERRAIN_KINDS.includes(k), `${b} maps to "${k}", which is not a TERRAIN_KIND`);
  assert.equal(Object.keys(TERRAIN_FOR_BIOMES).length, BIOMES.length);
  // The one TERRAIN_KIND no biome implies — see biome.mjs. Pinned so that a
  // later plan wiring it up has to say so here.
  assert.deepEqual(TERRAIN_KINDS.filter((k) => !Object.values(TERRAIN_FOR_BIOMES).includes(k)),
    ["fjordland"]);
});

// ── P9: the partition, on the synthetic world ─────────────────────────────

test("POISSON_R_KM is the pinned 11 / 19", () => {
  assert.equal(POISSON_R_KM.surveyed, 11);
  assert.equal(POISSON_R_KM.reported, 19);
});

test("partitionRegions REFUSES to run before classifyBiomes", () => {
  // Without this the biomeShares of every region are keyed by a Uint8Array
  // index whose vocabulary nothing has set — which is what the plan's own
  // fixtures do, and what a committed fabric file would then have carried.
  const grid = twoPlateWorld();
  assert.throws(
    () => partitionRegions({ grid, premises: twoPremises(), manifest: TWO_PLATE_MANIFEST, stream: STREAM }),
    /classifyBiomes must run before P9/);
});

test("partitionRegions owns EVERY land cell: histogram + unowned + lake + sea === n", () => {
  const grid = twoPlateWorld();
  const r = classifyAndPartition({ grid, premises: twoPremises(), manifest: TWO_PLATE_MANIFEST });
  let landCells = 0;
  for (let i = 0; i < grid.n; i++)
    if (grid.plate[i] >= 0 && (grid.flags[i] & (FLAG.SEA | FLAG.LAKE)) === 0) landCells++;
  const owned = Object.values(r.ownerHistogram).reduce((a, b) => a + b, 0);
  assert.equal(owned + r.unownedLandCells, landCells,
    "the owner histogram identity failed — a land cell is in two regions or none");
  assert.equal(r.unownedLandCells, 0, "residual cells were not distributed");
  // THE INTEGER PROOF OF NON-OVERLAP, and it needs a LAKE term the plan's
  // three-way form does not have: regions tile NET land, so a standing-water
  // cell is neither owned nor sea.
  const { land, lake, sea, unowned, offMask } = r.census;
  assert.equal(owned, land - unowned);
  assert.equal(land + lake + sea + offMask, grid.n);
});

test("partitionRegions produces exactly the manifest's surveyed and reported counts", () => {
  const grid = twoPlateWorld();
  const r = classifyAndPartition({ grid, premises: twoPremises(), manifest: TWO_PLATE_MANIFEST });
  const byCont = (id) => r.regions.filter((x) => x.continent === id);
  assert.equal(byCont("c01").filter((x) => x.survey === "surveyed").length, 4);
  assert.equal(byCont("c01").filter((x) => x.survey === "reported").length, 6);
  assert.equal(byCont("c02").filter((x) => x.survey === "surveyed").length, 2);
  assert.equal(byCont("c02").filter((x) => x.survey === "reported").length, 3);
});

test("region ids are stable, dense and namespaced cNN/rNN", () => {
  const grid = twoPlateWorld();
  const r = classifyAndPartition({ grid, premises: twoPremises(), manifest: TWO_PLATE_MANIFEST });
  for (const reg of r.regions) assert.match(reg.id, /^c[0-9]{2}\/r[0-9]{2}$/);
  assert.equal(new Set(r.regions.map((x) => x.id)).size, r.regions.length);
  // grid.regionId(i) must answer the SAME id the record carries — Plan D's
  // measureCell reads it and must not re-derive the owner -> id join.
  for (let i = 0; i < grid.n; i++) {
    const o = grid.owner[i];
    if (o >= 0) { assert.equal(grid.regionId(i), r.regions[o].id); break; }
  }
});

test("reported regions carry no terrainKind, surveyed regions do", () => {
  const grid = onePlateWorld();
  const r = classifyAndPartition({ grid, premises: onePremise(), manifest: ONE_PLATE_MANIFEST });
  for (const reg of r.regions) {
    if (reg.survey === "reported") assert.equal(reg.terrainKind, null, `${reg.id} is reported but carries a terrainKind`);
    else assert.ok(typeof reg.terrainKind === "string", `${reg.id} is surveyed but has no terrainKind`);
  }
});

test("biomeShares are keyed by biome NAME and sum to ~100", () => {
  // The plan keys them by the Uint8Array INDEX, so a committed fabric file
  // would have read {"15": 62} where the shape declares {"karst": 62}.
  const grid = twoPlateWorld();
  const r = classifyAndPartition({ grid, premises: twoPremises(), manifest: TWO_PLATE_MANIFEST });
  for (const reg of r.regions) {
    const keys = Object.keys(reg.biomeShares);
    assert.ok(keys.length > 0, `${reg.id} has no biome shares`);
    for (const k of keys) assert.ok(BIOMES.includes(k), `${reg.id} share key "${k}" is not a biome name`);
    const sum = Object.values(reg.biomeShares).reduce((a, b) => a + b, 0);
    assert.ok(sum > 99 && sum < 101, `${reg.id} shares sum to ${sum}`);
  }
});

test("a LAKE cell is never owned by a region", () => {
  const grid = twoPlateWorld();
  // Punch a lake into the middle of plate 0.
  for (let y = 40; y < 50; y++) for (let x = 40; x < 50; x++) grid.flags[idx({ grid, cx: x, cy: y })] |= FLAG.LAKE;
  const r = classifyAndPartition({ grid, premises: twoPremises(), manifest: TWO_PLATE_MANIFEST });
  let lake = 0;
  for (let i = 0; i < grid.n; i++)
    if ((grid.flags[i] & FLAG.LAKE) !== 0) { lake++; assert.equal(grid.owner[i], -1, `lake cell ${i} is owned`); }
  assert.equal(lake, 100);
  assert.equal(r.census.lake, 100);
});

test("the partition does not depend on insertion order — two runs agree exactly", () => {
  const run = () => {
    const grid = onePlateWorld();
    const r = classifyAndPartition({ grid, premises: onePremise(), manifest: ONE_PLATE_MANIFEST });
    return { ids: r.regions.map((x) => x.id), owner: Array.from(grid.owner) };
  };
  assert.deepEqual(run(), run());
});

test("adjacency is symmetric", () => {
  const grid = onePlateWorld();
  const r = classifyAndPartition({ grid, premises: onePremise(), manifest: ONE_PLATE_MANIFEST });
  const byId = new Map(r.regions.map((x) => [x.id, x]));
  for (const reg of r.regions)
    for (const a of reg.adjacent)
      assert.ok(byId.get(a).adjacent.includes(reg.id), `${reg.id} lists ${a} but not the other way round`);
});

// ── the quota allocator ───────────────────────────────────────────────────

test("allocateQuotas gives surveyed the nominal and shares the rest equally", () => {
  const sites = [
    { survey: "surveyed" }, { survey: "surveyed" },
    { survey: "reported" }, { survey: "reported" }, { survey: "reported" },
  ];
  const q = allocateQuotas({ total: 10_000, sites, sQuota: 640, rQuota: 1920 });
  assert.deepEqual([...q].slice(0, 2), [640, 640]);
  // 10,000 - 1,280 = 8,720 over three = 2,906 remainder 2, to the first two.
  assert.deepEqual([...q].slice(2), [2907, 2907, 2906]);
  assert.equal([...q].reduce((a, b) => a + b, 0), 10_000, "quotas must sum to the land exactly");
});

test("allocateQuotas falls back to a weighted split when the land cannot seat the nominal", () => {
  const notes = [];
  const sites = [{ survey: "surveyed" }, { survey: "reported" }];
  const q = allocateQuotas({ total: 100, sites, sQuota: 640, rQuota: 1920, note: (m) => notes.push(m) });
  assert.equal([...q].reduce((a, b) => a + b, 0), 100);
  assert.equal(notes.length, 1, "a continent too small for its own quota must SAY so");
  assert.ok(q[1] > q[0], "the reported weight is three times the surveyed one");
});

test("allocateQuotas always sums to the total, over a sweep", () => {
  for (let s = 0; s <= 4; s++) for (let r = 1; r <= 5; r++) for (const total of [37, 640, 5000, 44011]) {
    const sites = [...Array(s).fill({ survey: "surveyed" }), ...Array(r).fill({ survey: "reported" })];
    const q = allocateQuotas({ total, sites, sQuota: 640, rQuota: 1920 });
    assert.equal([...q].reduce((a, b) => a + b, 0), total, `s=${s} r=${r} total=${total}`);
    for (const v of q) assert.ok(v >= 0, "a negative quota");
  }
});

// ── Poisson siting ────────────────────────────────────────────────────────

test("poissonSites relaxes a starving radius and still fills the count", () => {
  // The plan retries ONCE, recursively, with no floor: a chain continent whose
  // land is smaller than one 19 km disc returns fewer sites than the manifest
  // demands, and every count assertion in the plan's suite runs on a square
  // large enough never to see it.
  const grid = makeGrid({ w: 40, h: 40, cellKm: 0.5 });    // a 20 x 20 km world
  const cells = [];
  for (let i = 0; i < grid.n; i++) cells.push(i);
  const ordered = siteOrder({ grid, cells, stream: STREAM });
  const got = poissonSites({ grid, ordered, radiusKm: 19, count: 12 });
  assert.equal(got.length, 12, "the relaxation ladder did not fill the quota");
  assert.equal(new Set(got).size, 12, "duplicate sites");
});

test("poissonSites honours the radius when the room is there", () => {
  const grid = makeGrid({ w: 400, h: 400, cellKm: 0.5 });   // 200 x 200 km
  const cells = [];
  for (let i = 0; i < grid.n; i++) cells.push(i);
  const ordered = siteOrder({ grid, cells, stream: STREAM });
  const got = poissonSites({ grid, ordered, radiusKm: 19, count: 12 });
  assert.equal(got.length, 12);
  const r2 = (19 / grid.cellKm) ** 2;
  for (let a = 0; a < got.length; a++) for (let b = a + 1; b < got.length; b++) {
    const dx = (got[a] % grid.w) - (got[b] % grid.w);
    const dy = ((got[a] / grid.w) | 0) - ((got[b] / grid.w) | 0);
    assert.ok(dx * dx + dy * dy >= r2, `sites ${got[a]} and ${got[b]} are closer than 19 km`);
  }
});

test("siteOrder is a total order and is the same for a subset", () => {
  const grid = makeGrid({ w: 60, h: 60, cellKm: 0.5 });
  const cells = []; for (let i = 0; i < grid.n; i++) cells.push(i);
  const all = siteOrder({ grid, cells, stream: STREAM });
  const even = cells.filter((i) => i % 2 === 0);
  const sub = siteOrder({ grid, cells: even, stream: STREAM });
  assert.deepEqual([...sub], [...all].filter((i) => i % 2 === 0),
    "the subset order must be the full order restricted — the two pools depend on it");
});

// ── the heap ──────────────────────────────────────────────────────────────

test("classifyBiomes names a plate with no premise instead of reading undefined", () => {
  const grid = twoPlateWorld();
  assert.throws(() => classifyBiomes({ grid, premises: onePremise(), BIOMES }),
    /only 1 premises were given/);
});

test("MinHeap pops in (cost, cell, owner) order whatever the insertion order", () => {
  const entries = [[1, 5, 2], [1, 5, 1], [1, 4, 9], [0.5, 99, 0], [1, 5, 3], [2, 0, 0]];
  const expect = [[0.5, 99, 0], [1, 4, 9], [1, 5, 1], [1, 5, 2], [1, 5, 3], [2, 0, 0]];
  for (const perm of [entries, [...entries].reverse(), [entries[3], ...entries.slice(0, 3), ...entries.slice(4)]]) {
    const h = new MinHeap(2);                       // capacity 2 forces a grow
    for (const [v, c, o] of perm) h.push(v, c, o);
    const out = [];
    while (h.size) { const { value, cell, owner } = h.pop(); out.push([value, cell, owner]); }
    assert.deepEqual(out, expect);
  }
});

// ── THE REAL WORLD ────────────────────────────────────────────────────────
// Built ONCE, from the committed TERRAIN STREAM. Seam 3 shipped goldens built
// from `manifest.seed` — the WORLD seed, the parent of four named streams —
// and so pinned a different world from the one the premises were fitted to.

let REAL = null;
function realWorld() {
  if (REAL) return REAL;
  const derived = JSON.parse(readFileSync(join(ROOT, "content/spine/derived.json"), "utf8"));
  const stream = terrainStream({ worldSeed: MANIFEST.seed });
  assert.equal(stream, derived["n-atlas"].resolvedSeedStreams.terrain,
    "the terrain stream is not the one committed in derived.json");
  assert.equal(stream, STREAM, "the fixtures' stream is no longer the terrain stream");
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
  REAL = { grid, sea, stream };
  return REAL;
}

/** P8 + P9 on the real field, from a clean owner/biome state. */
function realPartition({ smoothingPasses } = {}) {
  const { grid, stream } = realWorld();
  grid.owner.fill(-1);
  const biomes = classifyBiomes({ grid, premises: PREMISES, BIOMES });
  const regions = partitionRegions({
    grid, premises: PREMISES, manifest: MANIFEST, stream, smoothingPasses });
  return { grid, biomes, ...regions };
}

test("REAL WORLD — every one of the 18 biome rules is the CHOSEN rule somewhere", () => {
  // The seam's own defect detector. Two of the plan's rules could never win:
  // `lava` tested FLAG.CLIFF, which no pass in the pipeline sets (0 of 640,000
  // cells), and `ash` tested FLAG.SAND — the CLASTIC default — while `ash` is
  // in exactly one palette, c10's, the one continent that carries VOLCANIC and
  // therefore never SAND. Both fired zero times as the chosen rule and the plan
  // has no assertion that could see it.
  const { biomes } = realPartition();
  assert.equal(biomes.ruleWins.length, 18);
  const dead = BIOME_RULE_NAMES.filter((_, r) => biomes.ruleWins[r] === 0);
  assert.deepEqual(dead, [], `these rules can never win: ${dead.join(", ")}`);
  // Pinned VALUES, not just "> 0" — a rule that quietly stops firing on all but
  // a handful of cells is the same defect one order of magnitude down.
  assert.deepEqual([...biomes.ruleWins],
    [560, 26241, 6400, 3672, 770, 1884, 30078, 278, 1021, 2502, 43208, 14542, 3610, 5381, 1991,
     962, 6441, 89768]);
});

test("REAL WORLD — the biome histogram and the palette fallback are pinned", () => {
  const { biomes } = realPartition();
  const hist = Object.fromEntries(BIOMES.map((b, i) => [b, biomes.histogram[i]]));
  assert.deepEqual(hist, {
    ocean: 377600, ice: 26241, marsh: 770, river: 3672, meadow: 89768, forest: 6441,
    bramble: 962, rock: 4298, upland: 2502, alkali: 5381, ash: 1991, built: 0,
    tundra: 30078, lake: 6400, scree: 278, karst: 43208, badland: 3610, desert: 34082,
    lava: 834, reef: 1884,
  });
  assert.equal([...biomes.histogram].reduce((a, b) => a + b, 0), 640000);
  // 19 of the 20 biomes occur. `built` is the exception BY DESIGN — a
  // composition biome, which landform-type.schema.json states independently
  // ("the one BIOMES member no row names").
  assert.deepEqual(BIOMES.filter((b, i) => biomes.histogram[i] === 0), ["built"]);
  // THE FALLBACK IS MEASURED, NOT SILENT. 8.80% of land matches no rule its
  // palette allows and takes palette[0]; c05 Thirstwold is 44.4% of that on its
  // own (moist temperate ground on a continent whose palette has no temperate
  // biome). A change that grows this is a change in what the world is made of.
  assert.equal(biomes.fallbacks, 23091);
  assert.deepEqual([...biomes.fallbacksByPlate],
    [0, 0, 0, 0, 19540, 0, 0, 0, 2276, 274, 0, 1001, 0]);
});

test("REAL WORLD — 160 regions, 40 surveyed / 120 reported, one per manifest row", () => {
  const { regions } = realPartition();
  assert.equal(regions.length, 160);
  assert.equal(regions.filter((r) => r.survey === "surveyed").length, 40);
  assert.equal(regions.filter((r) => r.survey === "reported").length, 120);
  for (const lm of MANIFEST.landmasses) {
    const mine = regions.filter((r) => r.continent === lm.id);
    assert.equal(mine.filter((r) => r.survey === "surveyed").length, lm.surveyed, `${lm.id} surveyed`);
    assert.equal(mine.filter((r) => r.survey === "reported").length, lm.reported, `${lm.id} reported`);
  }
});

test("REAL WORLD — every region is inside its own manifest area tolerance", () => {
  // The plan's per-region nominal quota puts 33 of 120 reported regions
  // OUTSIDE this band, spread 63.5 to 744.5 km2. See allocateQuotas and
  // rebalance in partition.mjs for the two rules that close it.
  const { regions } = realPartition();
  const band = (t) => {
    const spec = MANIFEST.regions[t];
    return [spec.nominalKm2 * (1 - spec.tolerancePct / 100), spec.nominalKm2 * (1 + spec.tolerancePct / 100)];
  };
  const out = [];
  for (const r of regions) {
    const [lo, hi] = band(r.survey);
    if (r.areaKm2 < lo || r.areaKm2 > hi) out.push(`${r.id} ${r.survey} ${r.areaKm2}`);
  }
  assert.deepEqual(out, [], `regions outside tolerance: ${out.join(", ")}`);
  const sv = regions.filter((r) => r.survey === "surveyed").map((r) => r.areaKm2);
  const rp = regions.filter((r) => r.survey === "reported").map((r) => r.areaKm2);
  assert.deepEqual([Math.min(...sv), Math.max(...sv)], [160, 160]);
  assert.deepEqual([Math.min(...rp), Math.max(...rp)], [419.75, 504]);
  assert.equal(regions.reduce((a, r) => a + r.areaKm2, 0), MANIFEST.budget.netLandKm2,
    "the regions must tile the manifest's NET land exactly");
});

test("REAL WORLD — the integer proof of non-overlap closes on 640,000 cells", () => {
  const { grid, ownerHistogram, census, unownedLandCells } = realPartition();
  const owned = Object.values(ownerHistogram).reduce((a, b) => a + b, 0);
  assert.deepEqual(census, { land: 256000, lake: 6400, sea: 377600, unowned: 0, offMask: 0 });
  assert.equal(owned + unownedLandCells + census.lake + census.sea + census.offMask, grid.n);
  assert.equal(owned, 256000);
  // …and cell by cell, not only in aggregate: no cell is owned twice (an
  // Int16Array cannot express that) and no owned cell is water or off-mask.
  let owning = 0;
  for (let i = 0; i < grid.n; i++) {
    if (grid.owner[i] < 0) continue;
    owning++;
    assert.equal(grid.flags[i] & (FLAG.SEA | FLAG.LAKE), 0, `cell ${i} is water and owned`);
    assert.ok(grid.plate[i] >= 0, `cell ${i} is off-mask and owned`);
  }
  assert.equal(owning, owned);
});

test("REAL WORLD — the owner and biome fields are pinned by digest", () => {
  const { grid, shortfalls, starved } = realPartition();
  assert.equal(digest(grid.owner), "cb92d2923c5c8e6f", "the region partition moved");
  assert.equal(digest(grid.biome), "cc5d943407d64136", "the biome field moved");
  assert.deepEqual(starved, [], "a continent could not seat its own region quota");
  // Two regions cannot reach their quota because no surplus is reachable across
  // the region graph at all. Both are still well inside tolerance (441.5 and
  // 444.0 km2 against [384, 576]); they are REPORTED rather than absorbed.
  assert.deepEqual(shortfalls, [
    { region: "c02/r25", quota: 1880, cells: 1766, shortBy: 114 },
    { region: "c05/r27", quota: 1881, cells: 1776, shortBy: 105 },
  ]);
});

test("REAL WORLD — terrainKind, provenance and adjacency", () => {
  const { regions } = realPartition();
  for (const r of regions) {
    if (r.survey === "reported") {
      assert.equal(r.terrainKind, null);
      assert.ok(["sworn", "hearsay", "inferred"].includes(r.provenance), `${r.id} ${r.provenance}`);
    } else {
      assert.ok(TERRAIN_KINDS.includes(r.terrainKind), `${r.id} terrainKind ${r.terrainKind}`);
      assert.equal(r.provenance, null, "a walked region makes no claim about a report");
    }
  }
  assert.deepEqual(
    regions.reduce((a, r) => { const k = String(r.provenance); a[k] = (a[k] ?? 0) + 1; return a; }, {}),
    { hearsay: 77, sworn: 19, inferred: 24, null: 40 });
  assert.deepEqual([...new Set(regions.filter((r) => r.terrainKind).map((r) => r.terrainKind))].sort(),
    ["bramble", "cloud-forest", "headland", "karst-plateau", "sand-sea", "tundra-steppe", "volcanic-arc"]);
  const byId = new Map(regions.map((r) => [r.id, r]));
  for (const r of regions) {
    assert.ok(r.adjacent.length > 0, `${r.id} is adjacent to nothing`);
    for (const a of r.adjacent)
      assert.ok(byId.get(a)?.adjacent.includes(r.id), `${r.id} lists ${a} but not the other way round`);
  }
  // FOUR PAIRS OF LANDMASSES PHYSICALLY TOUCH on the refitted mask, so some
  // adjacency crosses a continent boundary. Measured cell-adjacency counts:
  // c01-c12 247, c02-c07 335, c03-c11 126, c05-c08 95. That is seam 2's
  // geometry, not this pass's — pinned here because a per-continent fabric file
  // will carry an `adjacent` id from another file and Task 10a must expect it.
  const cross = new Set();
  for (const r of regions)
    for (const a of r.adjacent) {
      const other = a.slice(0, 3);
      if (other !== r.continent) cross.add([r.continent, other].sort().join("-"));
    }
  assert.deepEqual([...cross].sort(), ["c01-c12", "c02-c07", "c03-c11", "c05-c08"]);
});

test("REAL WORLD — the pass is deterministic across two full runs", () => {
  const a = realPartition();
  const ownerA = digest(a.grid.owner);
  const idsA = a.regions.map((r) => `${r.id}:${r.cells}:${r.terrainKind}:${r.provenance}`);
  const b = realPartition();
  assert.equal(digest(b.grid.owner), ownerA);
  assert.deepEqual(b.regions.map((r) => `${r.id}:${r.cells}:${r.terrainKind}:${r.provenance}`), idsA);
});

test("REAL WORLD — growRegions is independent of the order the sites are inserted", () => {
  // Seam 3 proved this for flow routing with three comparator variants x three
  // insertion orders. The same shape, on a real continent (c08, 11,988 net-land
  // cells, 8 regions) rather than the whole world so it can afford nine runs.
  const { grid, stream } = realWorld();
  grid.owner.fill(-1);
  classifyBiomes({ grid, premises: PREMISES, BIOMES });
  const plate = 7;                                       // c08 Wracklow
  assert.equal(PREMISES[plate].id, "c08");
  const land = [];
  for (let i = 0; i < grid.n; i++)
    if (grid.plate[i] === plate && (grid.flags[i] & (FLAG.SEA | FLAG.LAKE)) === 0) land.push(i);
  assert.equal(land.length, 11988);
  const order = siteOrder({ grid, cells: land, stream });
  const sSites = poissonSites({ grid, ordered: order, radiusKm: POISSON_R_KM.surveyed, count: 2 });
  const taken = new Set(sSites);
  const rSites = poissonSites({
    grid, ordered: order.filter((i) => !taken.has(i)), radiusKm: POISSON_R_KM.reported, count: 6 });
  const sites = [...sSites.map((cell) => ({ cell, survey: "surveyed" })),
                 ...rSites.map((cell) => ({ cell, survey: "reported" }))].sort((a, b) => a.cell - b.cell);
  const quota = allocateQuotas({ total: land.length, sites, sQuota: 640, rQuota: 1920 });

  // Three comparators, all of them refinements of "cost first". The result must
  // not move: only ONE of them can ever be consulted for a pair that matters,
  // because no two live entries share (cost, cell, owner).
  const comparators = {
    pinned: null,
    ownerBeforeCell(a, b) {
      if (this.v[a] !== this.v[b]) return this.v[a] < this.v[b];
      if (this.o[a] !== this.o[b]) return this.o[a] < this.o[b];
      return this.c[a] < this.c[b];
    },
    descendingIndex(a, b) {
      if (this.v[a] !== this.v[b]) return this.v[a] < this.v[b];
      if (this.c[a] !== this.c[b]) return this.c[a] > this.c[b];
      return this.o[a] > this.o[b];
    },
  };
  const permutations = {
    forward: (s) => s.map((_, n) => n),
    reverse: (s) => s.map((_, n) => s.length - 1 - n),
    interleaved: (s) => [...s.keys()].filter((n) => n % 2 === 0).concat([...s.keys()].filter((n) => n % 2 === 1)),
  };
  const results = [];
  for (const [cname, less] of Object.entries(comparators)) {
    for (const [pname, perm] of Object.entries(permutations)) {
      const p = perm(sites);
      const permuted = p.map((n) => sites[n]);
      const permQuota = Int32Array.from(p, (n) => quota[n]);
      const heap = new MinHeap(land.length * 2);
      if (less) heap.less = less;
      grid.owner.fill(-1);
      growRegions({ grid, plate, land, sites: permuted, base: 0, heap, quota: permQuota });
      // Map each cell back to the SITE CELL that owns it, which is the identity
      // independent of where the site sat in the array.
      const byCell = new Int32Array(grid.n).fill(-1);
      for (const i of land) byCell[i] = grid.owner[i] < 0 ? -1 : permuted[grid.owner[i]].cell;
      results.push([`${cname}/${pname}`, digest(byCell)]);
    }
  }
  const first = results[0][1];
  for (const [name, d] of results)
    assert.equal(d, first, `${name} produced a different partition from ${results[0][0]}`);
  assert.equal(results.length, 9);
});

test("REAL WORLD — SMOOTHING SWEEP: 2 is the only pass count that meets tolerance", () => {
  // The measurement behind SMOOTHING_PASSES, run rather than remembered.
  assert.equal(SMOOTHING_PASSES, 2);
  const outside = (regions) => regions.filter((r) => {
    const spec = MANIFEST.regions[r.survey];
    const lo = spec.nominalKm2 * (1 - spec.tolerancePct / 100);
    const hi = spec.nominalKm2 * (1 + spec.tolerancePct / 100);
    return r.areaKm2 < lo || r.areaKm2 > hi;
  }).length;
  assert.equal(outside(realPartition({ smoothingPasses: 1 }).regions), 1);
  assert.equal(outside(realPartition({ smoothingPasses: 2 }).regions), 0);
  assert.equal(outside(realPartition({ smoothingPasses: 3 }).regions), 3);
});
