// tools/mapforge/tests/landforms.test.mjs — Task 8 (P10 instancing + handles).
//
// The plan's suite asserts the two things that were never in doubt (the
// predicate switch and the handle grammar) and nothing about the two that
// decide whether the pass works: the instance COUNT and the per-type COVERAGE.
// Both are measured here on the real world, and both were wrong under the
// plan's own allocation — see landforms.mjs's header for the arithmetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeGrid, FLAG, idx } from "../lib/grid.mjs";
import { BIOMES, shoelaceArea } from "../../../scripts/lib/spine.mjs";
import {
  instanceLandforms, matchesRequires, compileRequires, cellView, REQUIRES_KEYS, PRODUCIBLE_ROCK,
  mintHandle, orderHandles, orderDigestOf, assertHandlesUnique, footprintOf,
  GROUP_TARGETS, REPORTED_INSTANCES_PER_REGION, HANDLE_HEX,
} from "../lib/passes/landforms.mjs";
import { classifyBiomes } from "../lib/passes/biome.mjs";
import { partitionRegions } from "../lib/passes/partition.mjs";
import { priorityFlood, d8FlowDir, flowAccumulate } from "../lib/hydrology.mjs";
import { applyPremiseMasks } from "../lib/passes/mask.mjs";
import { buildElevation, assignSubstrate } from "../lib/passes/elevation.mjs";
import { selectSeaLevelByRank, classifySea, CELL_AREA_KM2 } from "../lib/passes/sea-level.mjs";
import { applyWinds } from "../lib/passes/winds.mjs";
import { carveWater } from "../lib/passes/water.mjs";
import { placePinned } from "../lib/passes/settlements.mjs";
import { gPinSat, PIN_LANDFORM_NEAR_KM } from "../../../scripts/lib/resolve.mjs";
import { terrainStream, mintSeed, namedStream } from "../lib/seed.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const MINI = JSON.parse(readFileSync(join(HERE, "fixtures/mini-lexicon/landforms.json"), "utf8"));
const REAL_LEXICON = join(ROOT, "content/world/lexicon/landforms.json");
const INSTANCE_SCHEMA = JSON.parse(
  readFileSync(join(ROOT, "content/schemas/landform-instance.schema.json"), "utf8"));
const WORLD_MANIFEST = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
const DERIVED = JSON.parse(readFileSync(join(ROOT, "content/spine/derived.json"), "utf8"));
const STREAM = "d9a0051d32afab59";
// The COMMITTED names stream, injected — never minted inside the pass. See the
// "the naming stream is the committed one" test below.
const NAME_STREAM = DERIVED["n-atlas"].resolvedSeedStreams.names;

// ── the predicate language ────────────────────────────────────────────────

test("GROUP_TARGETS is the spec's group distribution and sums to 1740", () => {
  assert.equal(Object.values(GROUP_TARGETS).reduce((a, b) => a + b, 0), 1740);
  assert.equal(GROUP_TARGETS.coastal, 300);
  assert.equal(GROUP_TARGETS.fluvial, 260);
  assert.equal(GROUP_TARGETS.oceanic, 35);
});

test("the per-region instance budget closes on the manifest's own totals", () => {
  // 120 x 8 + 40 x 19.5 = 1,740. The plan's area-proportional split puts ~174
  // instances in surveyed regions against a naming census that needs 276.
  const { count: nSur } = WORLD_MANIFEST.regions.surveyed;
  const { count: nRep } = WORLD_MANIFEST.regions.reported;
  const total = WORLD_MANIFEST.landformCatalogue.instances.total;
  const surveyedPool = total - nRep * REPORTED_INSTANCES_PER_REGION;
  assert.equal(surveyedPool, 780);
  assert.equal(surveyedPool / nSur, 19.5);
  assert.ok(surveyedPool > WORLD_MANIFEST.landformCatalogue.named.total - Math.round(nRep / 2),
    "the surveyed tier must be able to carry the names the reported tier cannot");
});

const CELL = { rock: "carbonate", precipDecile: 6, tempDecile: 5, elev: 0.5, slope: 0.03,
               flowAcc: 12, flags: FLAG.RIVER, nearFlags: FLAG.RIVER | FLAG.SEA };

test("matchesRequires reads cell fields, never invents them", () => {
  assert.equal(matchesRequires({ requires: { rock: "carbonate" }, cell: CELL }), true);
  assert.equal(matchesRequires({ requires: { rock: "volcanic" }, cell: CELL }), false);
  assert.equal(matchesRequires({ requires: { rock: "clastic" }, cell: CELL }), false);
  // "granite" and "sandstone" were an earlier draft's classifier output. They
  // are not in Plan B's enum, so they THROW rather than quietly never match.
  for (const dead of ["granite", "sandstone"])
    assert.throws(() => matchesRequires({ requires: { rock: dead }, cell: CELL }), /is not a substrate class/, dead);
  assert.equal(matchesRequires({ requires: { precipDecileMin: 4 }, cell: CELL }), true);
  assert.equal(matchesRequires({ requires: { precipDecileMin: 8 }, cell: CELL }), false);
  assert.equal(matchesRequires({ requires: { tempDecileMax: 2 }, cell: CELL }), false);
  assert.equal(matchesRequires({ requires: { tempDecileMax: 7 }, cell: CELL }), true);
  assert.equal(matchesRequires({ requires: { elevMin: 0.4, elevMax: 0.6 }, cell: CELL }), true);
  assert.equal(matchesRequires({ requires: { nearFlag: "SEA" }, cell: CELL }), true);
  assert.equal(matchesRequires({ requires: { nearFlag: "GLACIER" }, cell: CELL }), false);
  assert.equal(matchesRequires({ requires: { flowAccMin: 10 }, cell: CELL }), true);
  assert.equal(matchesRequires({ requires: {}, cell: CELL }), true);
});

test("matchesRequires rejects an unknown predicate key instead of ignoring it", () => {
  assert.throws(() => matchesRequires({ requires: { unicornDensity: 3 }, cell: CELL }), /unknown predicate/);
  // The keys a rejected earlier draft used. They are NOT in the committed
  // schema, so a lexicon row written with them would fail validation anyway —
  // this asserts the two sides fail in the SAME direction.
  for (const dead of ["coastal", "flagsAny", "flagsAll", "flagsNone", "tempMin", "tempMax"])
    assert.throws(() => matchesRequires({ requires: { [dead]: 1 }, cell: CELL }), /unknown predicate/, dead);
  assert.throws(() => compileRequires({ requires: { unicornDensity: 3 } }), /unknown predicate/);
  assert.throws(() => compileRequires({ requires: { rock: "granite" } }), /is not a substrate class/);
  assert.throws(() => compileRequires({ requires: { nearFlag: "MARSH" } }), /is not a FLAG/);
});

test("EVERY requires key in the committed lexicon is handled by matchesRequires", () => {
  const lex = JSON.parse(readFileSync(REAL_LEXICON, "utf8"));
  const used = new Set();
  for (const row of lex) for (const k of Object.keys(row.requires ?? {})) used.add(k);
  const unhandled = [...used].filter((k) => !REQUIRES_KEYS.includes(k)).sort();
  assert.deepEqual(unhandled, [], `matchesRequires would THROW on: ${unhandled.join(", ")}`);
  const schema = JSON.parse(readFileSync(join(ROOT, "content/schemas/landform-type.schema.json"), "utf8"));
  assert.deepEqual([...REQUIRES_KEYS].sort(),
    Object.keys(schema.properties.requires.properties).sort(),
    "the switch and the committed schema disagree about the predicate language");
  // KEYS are only half of it. The key-set cross-check passes happily while
  // `requires.rock: "volcanic"` matches nothing.
  const rockEnum = schema.properties.requires.properties.rock.enum;
  assert.deepEqual([...rockEnum].sort(), ["carbonate", "clastic", "volcanic"]);
  const usedRock = new Set(lex.map((r) => r.requires?.rock).filter(Boolean));
  for (const v of usedRock)
    assert.ok(PRODUCIBLE_ROCK.has(v),
      `the lexicon requires rock "${v}", which cellView can never return (it returns ${[...PRODUCIBLE_ROCK].join(", ")})`);
  for (const want of new Set(lex.map((r) => r.requires?.nearFlag).filter(Boolean)))
    assert.ok(FLAG[want] !== undefined, `the lexicon requires nearFlag "${want}", which is not a FLAG bit`);
  // The count the plan and grid.mjs both got wrong: 45 rows carry requires.rock
  // (carbonate 10, clastic 19, volcanic 16), not 34 or 35.
  const rockRows = lex.filter((r) => r.requires?.rock);
  assert.equal(rockRows.length, 45);
  assert.deepEqual(rockRows.reduce((a, r) => { a[r.requires.rock] = (a[r.requires.rock] ?? 0) + 1; return a; }, {}),
    { carbonate: 10, clastic: 19, volcanic: 16 });
});

test("PRODUCIBLE_ROCK is exactly what cellView can return", () => {
  assert.deepEqual([...PRODUCIBLE_ROCK].sort(), ["carbonate", "clastic", "volcanic"]);
});

// ── handles ───────────────────────────────────────────────────────────────

test("mintHandle follows the committed grammar cNN/group/h-XXXXXX", () => {
  // SIX hex, not the plan preamble's four. `landform-instance.schema.json`
  // allows `h-[0-9a-f]{4,6}` — Plan B widened it deliberately — and the length
  // is what makes a handle independent of its bucket. See mintHandle.
  const h = mintHandle({ continent: "c03", group: "karst", contentHash: "sha256:0f42abcd" });
  assert.equal(h, "c03/karst/h-0f42ab");
  assert.match(h, /^c[0-9]{2}\/[a-z-]+\/h-[0-9a-f]{6}$/);
  assert.match(h, new RegExp(INSTANCE_SCHEMA.properties.handle.pattern));
});

test("orderHandles is a TOTAL order on (-sizeKm, contentHash) — never insertion order", () => {
  const hs = [
    { handle: "a", sizeKm: 0.2, contentHash: "sha256:bbbb" },
    { handle: "b", sizeKm: 0.9, contentHash: "sha256:aaaa" },
    { handle: "c", sizeKm: 0.2, contentHash: "sha256:aaaa" },
  ];
  const o = orderHandles({ handles: hs });
  assert.deepEqual(o.map((h) => h.handle), ["b", "c", "a"]);
  assert.deepEqual(orderHandles({ handles: [...hs].reverse() }).map((h) => h.handle), ["b", "c", "a"]);
  o.forEach((h, i) => assert.equal(h.rank, i));
});

test("orderDigestOf is stable and changes when any handle changes", () => {
  const hs = [{ handle: "a", sizeKm: 0.2, contentHash: "sha256:bbbb" }];
  const d1 = orderDigestOf({ handles: orderHandles({ handles: hs }) });
  assert.match(d1, /^sha256:[0-9a-f]{64}$/);
  assert.equal(d1, orderDigestOf({ handles: orderHandles({ handles: hs }) }));
  const d2 = orderDigestOf({ handles: orderHandles({ handles: [{ ...hs[0], sizeKm: 0.3 }] }) });
  assert.notEqual(d1, d2);
});

test("a handle is a PURE FUNCTION of its own content — a later arrival cannot renumber one", () => {
  // THE PROPERTY PLAN D NEEDS. `bind.handle` is an authored string; if a handle
  // can move when some OTHER instance appears, an authored record silently
  // detaches. The shipped 4-hex form could move one: the walk ran in rank order,
  // rank is dominated by `sizeKm`, so a larger colliding newcomer took `h-abcd`
  // and pushed the incumbent to `h-abcd0`. Re-keying that walk on `contentHash`
  // does not help — a newcomer whose hash sorts first displaces the incumbent
  // just the same. The fix is that the length no longer depends on the bucket.
  const incumbent = { continent: "c01", group: "karst",
    contentHash: "sha256:abcd0000" + "0".repeat(56) };
  const before = mintHandle(incumbent);
  assert.equal(before, "c01/karst/h-abcd00");
  // Every kind of later arrival, including one that collides at four hex and is
  // larger, and one whose hash sorts first.
  for (const hash of ["abcd99", "abcd01", "0000ff", "abcd0f"].map((h) => h + "9".repeat(2))) {
    const newcomer = { continent: "c01", group: "karst", contentHash: "sha256:" + hash + "0".repeat(56) };
    assert.notEqual(mintHandle(newcomer), before, "two distinct hashes collided in the fixture");
    assert.equal(mintHandle(incumbent), before, "an existing handle moved when a neighbour arrived");
  }
  assert.equal(HANDLE_HEX, 6, "the grammar's last legal length; see mintHandle");
});

test("assertHandlesUnique THROWS on a real six-hex collision rather than lengthening", () => {
  // Six is the last length `h-[0-9a-f]{4,6}` allows, so there is nothing to
  // resolve: a duplicate here needs a wider grammar, and it must be loud.
  const dup = [0, 1].map((rank) =>
    ({ handle: "c01/karst/h-abcdef", contentHash: "sha256:abcdef" + String(rank).repeat(58), rank }));
  assert.throws(() => assertHandlesUnique({ handles: dup }), /is claimed twice/);
  const ok = [
    { handle: "c01/karst/h-abcdef", contentHash: "sha256:a", rank: 0 },
    { handle: "c01/karst/h-abcde0", contentHash: "sha256:b", rank: 1 },
  ];
  assert.doesNotThrow(() => assertHandlesUnique({ handles: ok }));
});

test("every handle the real world mints matches the committed grammar at six hex", () => {
  const { r } = realRun();
  const re = new RegExp(INSTANCE_SCHEMA.properties.handle.pattern);
  const lengths = {};
  for (const inst of r.instances) {
    assert.match(inst.handle, re, `${inst.handle} left the committed grammar`);
    const n = inst.handle.split("-").pop().length;
    lengths[n] = (lengths[n] ?? 0) + 1;
  }
  assert.deepEqual(lengths, { 6: 1740 }, "handles are uniform length by construction");
  assert.equal(new Set(r.instances.map((i) => i.handle)).size, 1740);
});

// ── geometry ──────────────────────────────────────────────────────────────

test("footprintOf writes the branch the committed schema declares for each geometry", () => {
  // The plan writes `{ shape, at }` for ALL THREE. The committed schema is a
  // oneOf with additionalProperties:false per branch — `point` takes `at`,
  // `line` takes `points`, `area` takes `ring` — and 126 of the 170 lexicon
  // rows are line or area, so the plan's record fails validation on three
  // quarters of the world.
  const at = [10.25, 20.75];
  const p = footprintOf({ shape: "point", atKm: at, sizeKm: 0.3, salt: 1 });
  assert.deepEqual(p, { shape: "point", at });
  const l = footprintOf({ shape: "line", atKm: at, sizeKm: 4, salt: 3 });
  assert.deepEqual(Object.keys(l).sort(), ["points", "shape"]);
  assert.ok(l.points.length >= 2 && l.points.length <= 40);
  const a = footprintOf({ shape: "area", atKm: at, sizeKm: 4, salt: 3 });
  assert.deepEqual(Object.keys(a).sort(), ["ring", "shape"]);
  assert.equal(a.ring.length, 8);
  assert.ok(shoelaceArea({ points: a.ring }) > 0, "the ring is not positively wound");
  // …and the branch keys are the ones the schema names, read from the schema.
  const branches = Object.fromEntries(INSTANCE_SCHEMA.properties.geometry.oneOf
    .map((b) => [b.properties.shape.const, b.required.filter((k) => k !== "shape")[0]]));
  assert.deepEqual(branches, { point: "at", line: "points", area: "ring" });
});

test("the smallest lexicon size still yields a distinct, positively wound ring", () => {
  // sizeKm 0.05 halves to 0.025 km, which q() quantises to 0.03/0.02 and
  // collapses an octagon's neighbouring vertices. MIN_FOOTPRINT_KM is why the
  // committed ring never gets there.
  const lex = JSON.parse(readFileSync(REAL_LEXICON, "utf8"));
  const smallest = Math.min(...lex.filter((t) => t.geometry === "area").map((t) => t.sizeKm[0]));
  assert.equal(smallest, 0.05);
  for (const salt of [0, 5, 11]) {
    const a = footprintOf({ shape: "area", atKm: [100.25, 100.75], sizeKm: smallest, salt });
    assert.equal(new Set(a.ring.map((p) => p.join(","))).size, 8, "quantisation merged two vertices");
    assert.ok(shoelaceArea({ points: a.ring }) > 0);
  }
});

// ── the pass, on a synthetic single-continent world ───────────────────────

function karstWorld() {
  const grid = makeGrid({ w: 100, h: 100, cellKm: 2 });
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
    const i = idx({ grid, cx: x, cy: y });
    const land = x >= 20 && x < 80 && y >= 20 && y < 80;
    grid.plate[i] = land ? 0 : -1;
    grid.elev[i] = land ? 0.5 : -0.7;
    grid.moist[i] = 0.6;
    grid.temp[i] = 0.5;
    if (!land) grid.flags[i] |= FLAG.SEA;
    if (land && x < 50) grid.flags[i] |= FLAG.CARBONATE;
    if (land && y === 50) { grid.flags[i] |= FLAG.RIVER; grid.flowAcc[i] = 500; }
  }
  return grid;
}

const REGIONS = Array.from({ length: 6 }, (_, n) => ({
  id: `c01/r0${n + 1}`, continent: "c01",
  survey: n < 2 ? "surveyed" : "reported",
  cells: 600, areaKm2: 2400, adjacent: [],
}));

const MANIFEST = { landmasses: [{ id: "c01", title: "T", class: "major", netKm2: 14400,
                                  interiorWaterKm2: 0, surveyed: 2, reported: 4 }],
                   landformCatalogue: { instances: { total: 60 }, named: { total: 12 } } };

function assignOwners(grid) {
  let n = 0;
  for (let i = 0; i < grid.n; i++) {
    if (grid.plate[i] < 0) continue;
    grid.owner[i] = n % 6;
    n++;
  }
}

const KIT = ["karst", "fluvial", "coastal"];
const premisesFor = (kit = KIT) => [{
  id: "c01", title: "T", class: "major", landformKit: kit,
  palette: ["karst", "river", "meadow"],
  footprint: { centreKm: [100, 100], radiiKm: [70, 70], warpKm: 0 }, structures: [],
}];

function runMini({ kit = KIT, lexicon = MINI } = {}) {
  const grid = karstWorld();
  assignOwners(grid);
  return { grid, r: instanceLandforms({
    grid, premises: premisesFor(kit), regions: REGIONS, lexicon, manifest: MANIFEST,
    stream: STREAM, nameStream: NAME_STREAM }) };
}

test("every instance satisfies its type's requires predicate", () => {
  const { grid, r } = runMini();
  assert.ok(r.instances.length > 0, "no instances at all");
  const byType = new Map(MINI.map((t) => [t.id, t]));
  for (const inst of r.instances) {
    const t = byType.get(inst.type);
    assert.ok(t, `instance names unknown type ${inst.type}`);
    const i = idx({ grid, cx: inst.cell[0], cy: inst.cell[1] });
    assert.ok(matchesRequires({ requires: t.requires, cell: cellView({ grid, i }) }),
      `${inst.id} (${inst.type}) sits on a cell its own predicate rejects`);
  }
});

test("the COASTAL kit places instances — nearFlag: SEA is not silently false", () => {
  // A cellView that never wrote `nearFlags` makes `undefined & FLAG.SEA` zero,
  // i.e. EVERY nearFlag predicate false, and 105 of the 170 real types place
  // nothing at all while a carbonate-only fixture stays green.
  const { grid, r } = runMini();
  const coastal = r.instances.filter((i) => MINI.find((t) => t.id === i.type).group === "coastal");
  assert.ok(coastal.length > 0,
    `zero coastal instances — every nearFlag predicate returned false. substitutions: ${JSON.stringify(r.substitutions)}`);
  assert.ok(coastal.some((i) => i.type === "sea-stack"),
    "sea-stack requires only { nearFlag: SEA } and the land square is ringed by sea — it must place");
  for (const inst of coastal) {
    const [cx, cy] = inst.cell;
    const i = idx({ grid, cx, cy });
    assert.equal(grid.flags[i] & FLAG.SEA, 0, `${inst.id} is IN the sea, not near it`);
    let sawSea = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
      if ((grid.flags[idx({ grid, cx: nx, cy: ny })] & FLAG.SEA) !== 0) sawSea = true;
    }
    assert.ok(sawSea, `${inst.id} claims nearFlag SEA with no sea cell in its neighbourhood`);
  }
  assert.ok(r.instances.some((i) => MINI.find((t) => t.id === i.type).group === "fluvial"),
    "zero fluvial instances — nearFlag: RIVER is false too");
});

test("instances are never placed in a sea cell", () => {
  const { grid, r } = runMini();
  for (const inst of r.instances) {
    const i = idx({ grid, cx: inst.cell[0], cy: inst.cell[1] });
    assert.equal(grid.flags[i] & FLAG.SEA, 0, `${inst.id} is in the sea`);
  }
});

test("the instance total is the manifest's, exactly", () => {
  const { r } = runMini();
  assert.equal(r.instances.length, MANIFEST.landformCatalogue.instances.total);
  assert.deepEqual(r.shortfalls, []);
});

test("named instances hit the manifest quota exactly and carry no title", () => {
  const { r } = runMini();
  assert.equal(r.instances.filter((i) => i.named).length, MANIFEST.landformCatalogue.named.total);
  for (const inst of r.instances) assert.equal(inst.title, undefined, "naming belongs to Plan D, not the generator");
});

test("one handle per instance, all unique, all matching the ledger", () => {
  const { r } = runMini();
  const handles = r.instances.map((i) => i.handle);
  assert.equal(new Set(handles).size, handles.length, "duplicate handle");
  assert.equal(r.ledgers.length, 1);
  assert.equal(new Set(r.ledgers[0].handles.map((h) => h.handle)).size, handles.length);
  assert.deepEqual([...new Set(handles)].sort(), [...new Set(r.ledgers[0].handles.map((h) => h.handle))].sort());
  assert.match(r.ledgers[0].orderDigest, /^sha256:[0-9a-f]{64}$/);
  r.ledgers[0].handles.forEach((h, n) => assert.equal(h.rank, n));
});

test("no two ordered handles share a content hash — the ordering key is total", () => {
  const { r } = runMini();
  const hs = r.ledgers[0].handles;
  for (let i = 1; i < hs.length; i++)
    assert.notEqual(hs[i].contentHash, hs[i - 1].contentHash,
      "two handles share a content hash — the ordering key is not total");
});

test("an unsatisfiable type degrades to a legal group-mate and RECORDS which", () => {
  // The plan writes `used: null` unconditionally, so the field it declares for
  // the fallback never carries one.
  const lex = [...MINI, { id: "lava-tube", group: "volcanic", alsoGroups: [], geometry: "point",
                          biomes: ["lava"], sizeKm: [0.1, 0.5], dungeonCapable: true, glyph: "g-tube",
                          rarity: "rare", requires: { nearFlag: "CLIFF", elevMin: 0.95 },
                          gloss: "x", absentBecause: null },
                         { id: "lava-field", group: "volcanic", alsoGroups: [], geometry: "area",
                          biomes: ["lava"], sizeKm: [1, 5], dungeonCapable: false, glyph: "g-field",
                          rarity: "common", requires: { elevMin: 0.2 },
                          gloss: "y", absentBecause: null }];
  const { r } = runMini({ kit: [...KIT, "volcanic"], lexicon: lex });
  assert.ok(r.substitutions.length > 0, "an impossible type produced no substitution record");
  const sub = r.substitutions.find((s) => s.wanted === "lava-tube");
  assert.ok(sub, "lava-tube can never match and was not recorded");
  assert.equal(sub.used, "lava-field", "the substitution must NAME the group-mate it degraded to");
  assert.match(sub.why, /no cell on c01 satisfies requires/);
  assert.equal(r.instances.filter((i) => i.type === "lava-tube").length, 0);
});

test("the naming census is PER TIER: at most ONE named landform per reported region", () => {
  // §6.4 rule 2 caps a reported region at one named landform, and G-POI derives
  // `drawn = survey === "surveyed" || instance.named` from exactly that, so a
  // second named instance silently doubles a frontier region's drawn POI count
  // with every gate green.
  const { r } = runMini();
  const surveyOf = new Map(REGIONS.map((x) => [x.id, x.survey]));
  const perReported = new Map();
  for (const inst of r.instances) {
    if (surveyOf.get(inst.region) !== "reported" || !inst.named) continue;
    perReported.set(inst.region, (perReported.get(inst.region) ?? 0) + 1);
  }
  for (const [region, n] of perReported)
    assert.equal(n, 1, `reported region ${region} carries ${n} named landforms — the cap is 1`);
  const reportedRegions = REGIONS.filter((x) => x.survey === "reported");
  assert.equal(perReported.size, Math.round(reportedRegions.length / 2),
    "exactly half the reported regions carry a named landform");
  assert.equal(r.instances.filter((i) => i.named).length, MANIFEST.landformCatalogue.named.total,
    "the per-tier split must still hit the manifest total exactly");
});

test("coverage is REPORTED, not enforced — the pass never throws on a shortfall", () => {
  const { r } = runMini({ kit: ["karst"] });
  assert.ok(typeof r.coverage.placed === "number" && typeof r.coverage.total === "number");
  assert.ok(r.coverage.placed <= r.coverage.total);
});

test("the pass REFUSES to run before P9", () => {
  const grid = karstWorld();
  assert.throws(() => instanceLandforms({
    grid, premises: premisesFor(), regions: [], lexicon: MINI, manifest: MANIFEST,
    stream: STREAM, nameStream: NAME_STREAM }),
    /partitionRegions must run before P10/);
});

test("the pass is deterministic", () => {
  assert.equal(JSON.stringify(runMini().r), JSON.stringify(runMini().r));
});

test("grid.landform and grid.landformNames name the type under each instance", () => {
  const { grid, r } = runMini();
  assert.deepEqual(grid.landformNames, MINI.map((t) => t.id));
  for (const inst of r.instances) {
    const i = idx({ grid, cx: inst.cell[0], cy: inst.cell[1] });
    assert.ok(grid.landform[i] >= 0, `${inst.id} left grid.landform unset`);
    assert.ok(grid.landformNames[grid.landform[i]] !== undefined);
  }
});

test("every real premise landformKit entry is a real lexicon group", () => {
  const lex = JSON.parse(readFileSync(REAL_LEXICON, "utf8"));
  const groups = new Set(lex.flatMap((t) => [t.group, ...(t.alsoGroups ?? [])]));
  for (const f of readdirSync(join(ROOT, "content/world/premises")).filter((x) => x.endsWith(".json"))) {
    const p = JSON.parse(readFileSync(join(ROOT, "content/world/premises", f), "utf8"));
    for (const g of p.landformKit)
      assert.ok(groups.has(g), `${p.id} landformKit names "${g}", which is not a lexicon group`);
  }
});

test("PIN RESERVATIONS — bypassed, G-PIN-SAT reds the receipt; enabled, it is satisfied", () => {
  // STATE §25's recorded mutation ("reservations disabled → 18 unsatisfied
  // landform receipts return (red)") had no automated regression. This is the
  // unit-level form, on the cheap karst-world fixture rather than a second
  // full generation: one pin whose required type cannot reach it — sea-stack
  // hugs the coast (requires nearFlag SEA) and the pin sits at the exact
  // centre of the 120 x 120 km land square, ~58 km from the nearest coast —
  // run through instanceLandforms twice, measured by placePinned, judged by
  // the real gPinSat gate.
  const pin = { id: "c-town-probe", title: "Probe",
                pin: { at: [100, 100], toleranceKm: 1.5 },
                requires: { continent: "c01", landform: "sea-stack" } };
  const worldOf = (receipts) => ({ present: true,
    fabric: { c01: { continent: "c01", pinReceipts: receipts } },
    pinned: [{ doc: { id: pin.id, pin: pin.pin, requires: pin.requires } }] });
  const run = (pinned) => {
    const grid = karstWorld();
    assignOwners(grid);
    grid.regionIds = REGIONS.map((r) => r.id);   // placePinned joins through it
    const r = instanceLandforms({
      grid, premises: premisesFor(), regions: REGIONS, lexicon: MINI, manifest: MANIFEST,
      stream: STREAM, nameStream: NAME_STREAM, pinned });
    return { grid, r };
  };

  // BYPASSED (reservations disabled): no instance of the type within the limit.
  const bypassed = run([]);
  const red = placePinned({ grid: bypassed.grid, cellKm: 2,
                            instances: bypassed.r.instances, pinned: [pin] });
  assert.equal(red.receipts.length, 1);
  const miss = red.receipts[0].measured.landformNearDistanceKm;
  assert.ok(miss === null || miss > PIN_LANDFORM_NEAR_KM,
    `the bypassed world read ${miss} km — there is no miss for the gate to catch`);
  assert.ok(gPinSat({ world: worldOf(red.receipts) }).some((p) => p.includes(pin.id)),
    "G-PIN-SAT did not report the unsatisfied receipt");

  // ENABLED: the same world grows ONE new sea-stack near the pin — additive
  // only, every budgeted instance untouched by construction — and goes green.
  const enabled = run([pin]);
  assert.equal(enabled.r.instances.length, bypassed.r.instances.length + 1);
  const green = placePinned({ grid: enabled.grid, cellKm: 2,
                              instances: enabled.r.instances, pinned: [pin] });
  const m = green.receipts[0].measured;
  assert.ok(m.landformNearId && m.landformNearDistanceKm <= PIN_LANDFORM_NEAR_KM,
    `the reserved instance reads ${m.landformNearId} at ${m.landformNearDistanceKm} km`);
  assert.deepEqual(gPinSat({ world: worldOf(green.receipts) }), []);
});

// ── THE REAL WORLD ────────────────────────────────────────────────────────

let REAL = null;
function realRun() {
  if (REAL) return REAL;
  const premises = readdirSync(join(ROOT, "content/world/premises"))
    .filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(readFileSync(join(ROOT, "content/world/premises", f), "utf8")));
  const derived = JSON.parse(readFileSync(join(ROOT, "content/spine/derived.json"), "utf8"));
  const stream = terrainStream({ worldSeed: WORLD_MANIFEST.seed });
  assert.equal(stream, derived["n-atlas"].resolvedSeedStreams.terrain,
    "the terrain stream is not the one committed in derived.json");
  assert.equal(stream, STREAM);
  const grid = makeGrid({ w: 800, h: 800, cellKm: 0.5 });
  const { maskField } = applyPremiseMasks({ grid, premises, stream });
  buildElevation({ grid, premises, maskField, stream });
  assignSubstrate({ grid, premises, maskField });
  const sea = selectSeaLevelByRank({
    elev: grid.elev, targetLandCells: WORLD_MANIFEST.budget.grossLandPolygonKm2 / CELL_AREA_KM2 });
  classifySea({ grid, seaLevel: sea.seaLevel });
  const filled = priorityFlood({ elev: grid.elev, w: grid.w, h: grid.h });
  const dir = d8FlowDir({ elev: filled, w: grid.w, h: grid.h });
  grid.flowDir.set(dir);
  grid.flowAcc.set(flowAccumulate({ flowDir: dir, w: grid.w, h: grid.h }));
  applyWinds({ grid, stream });
  carveWater({ grid, premises, manifest: WORLD_MANIFEST });
  classifyBiomes({ grid, premises, BIOMES });
  const part = partitionRegions({ grid, premises, manifest: WORLD_MANIFEST, stream });
  const lexicon = JSON.parse(readFileSync(REAL_LEXICON, "utf8"));
  const r = instanceLandforms({
    grid, premises, regions: part.regions, lexicon, manifest: WORLD_MANIFEST, stream,
    nameStream: NAME_STREAM });
  REAL = { grid, premises, part, lexicon, r, stream };
  return REAL;
}

test("REAL WORLD — the compiled predicate agrees with matchesRequires on every lexicon row", () => {
  // Two enumerations of one predicate language is how P10 ends up placing a
  // landform where its substrate does not exist. The fast path is checked
  // against the reference over the whole catalogue and 4,000 real cells.
  const { grid, lexicon } = realRun();
  const cells = [];
  for (let i = 0; i < grid.n && cells.length < 4000; i += 157) cells.push(i);
  let checked = 0, matched = 0;
  for (const row of lexicon) {
    const compiled = compileRequires({ requires: row.requires, id: row.id });
    for (const i of cells) {
      const view = cellView({ grid, i });
      const reference = matchesRequires({ requires: row.requires, cell: view });
      const fast =
        (compiled.rock < 0 || ["carbonate", "volcanic", "clastic"][compiled.rock] === view.rock) &&
        view.precipDecile >= compiled.precipMin && view.precipDecile <= compiled.precipMax &&
        view.tempDecile >= compiled.tempMin && view.tempDecile <= compiled.tempMax &&
        view.elev >= compiled.elevMin && view.elev <= compiled.elevMax &&
        view.slope >= compiled.slopeMin && view.slope <= compiled.slopeMax &&
        view.flowAcc >= compiled.flowAccMin &&
        (compiled.nearFlag === 0 || (view.nearFlags & compiled.nearFlag) !== 0);
      assert.equal(fast, reference, `${row.id} disagrees on cell ${i}`);
      checked++;
      if (reference) matched++;
    }
  }
  assert.equal(checked, lexicon.length * cells.length);
  assert.ok(matched > 0 && matched < checked, "the sweep is degenerate — every row agreed vacuously");
});

test("REAL WORLD — 1,740 instances and 336 named, exactly the manifest's numbers", () => {
  const { r, part } = realRun();
  assert.equal(r.instances.length, WORLD_MANIFEST.landformCatalogue.instances.total);
  assert.equal(r.instances.filter((i) => i.named).length, WORLD_MANIFEST.landformCatalogue.named.total);
  assert.deepEqual(r.shortfalls, []);
  const surveyOf = new Map(part.regions.map((x) => [x.id, x.survey]));
  const perReported = new Map();
  for (const inst of r.instances) {
    if (surveyOf.get(inst.region) !== "reported" || !inst.named) continue;
    perReported.set(inst.region, (perReported.get(inst.region) ?? 0) + 1);
  }
  assert.equal(Math.max(...perReported.values()), 1, "a reported region carries two named landforms");
  assert.equal(perReported.size, 60, "half of the 120 reported regions must carry exactly one name");
  assert.equal(r.instances.filter((i) => i.named && surveyOf.get(i.region) === "surveyed").length, 276);
  // 155 of the 160 regions hold an instance. The other five have no ground any
  // type in their continent's kit accepts; their budget moved to the rest of
  // the same continent, which is why the world total is still exact.
  assert.equal(new Set(r.instances.map((i) => i.region)).size, 155);
});

test("REAL WORLD — per-type coverage is PROVEN, and the five gaps have zero candidates", () => {
  // "A `requires` predicate the generator cannot satisfy means those landform
  // types silently degrade to substitutions — a defect that looks exactly like
  // a green run." So the unplaced set is enumerated and each one is shown to
  // have NO satisfying cell anywhere it is eligible, rather than to have merely
  // lost a draw.
  const { grid, r, lexicon, premises } = realRun();
  assert.equal(r.coverage.total, 170);
  assert.equal(r.coverage.placed, 168);
  const budgets = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  assert.ok(r.coverage.placed >= budgets.landforms.typeCoverageFloor,
    `types placed ${r.coverage.placed} is below the committed floor ${budgets.landforms.typeCoverageFloor}`);
  const placed = new Set(r.instances.map((i) => i.type));
  const unplaced = lexicon.filter((t) => !placed.has(t.id)).map((t) => t.id);
  // TWO, not the five the seam shipped. The three reef types were the third:
  // `oceanic` is in exactly ONE premise kit — c11 Quillreef's, the atoll — and
  // their committed `requires` carried `tempDecileMin: 7` on top of that, which
  // c11's climate (warmest land cell 0.183) can never reach. A kit that names a
  // group has already decided which continent a type may land on; a second
  // GLOBAL climate gate inside the predicate only lets the premise and the
  // lexicon disagree, and it was silently overruling the one continent whose
  // title, coastClass and structuralIdea are all "atoll". The term was dropped
  // from `fringing-reef`, `barrier-reef` and `reef-shelf-bank` — see
  // STATE section 12. The two that remain are kit gaps, not climate gaps.
  assert.deepEqual(unplaced, ["sinking-river", "sub-lacustrine-vent"]);
  // Each of the five, counted over every cell of every continent whose kit
  // admits it. Zero means unplaceable BY CONSTRUCTION, not unlucky.
  const kits = premises.map((p) => new Set(p.landformKit));
  const byId = new Map(lexicon.map((t) => [t.id, t]));
  const counts = Object.fromEntries(unplaced.map((id) => [id, 0]));
  for (let i = 0; i < grid.n; i++) {
    if (grid.owner[i] < 0) continue;
    let view = null;
    for (const id of unplaced) {
      const row = byId.get(id);
      const groups = [row.group, ...(row.alsoGroups ?? [])];
      if (!groups.some((g) => kits[grid.plate[i]].has(g))) continue;
      view = view ?? cellView({ grid, i });
      if (matchesRequires({ requires: row.requires, cell: view })) counts[id]++;
    }
  }
  assert.deepEqual(counts, { "sinking-river": 0, "sub-lacustrine-vent": 0 });
});

test("REAL WORLD — every instance record matches the committed schema's grammar", () => {
  const { r } = realRun();
  const idRe = new RegExp(INSTANCE_SCHEMA.properties.id.pattern);
  const handleRe = new RegExp(INSTANCE_SCHEMA.properties.handle.pattern);
  const regionRe = new RegExp(INSTANCE_SCHEMA.properties.region.pattern);
  const glyphRe = new RegExp(INSTANCE_SCHEMA.properties.glyph.pattern);
  const required = INSTANCE_SCHEMA.required;
  for (const inst of r.instances) {
    assert.deepEqual(Object.keys(inst).sort(), [...required].sort(),
      `${inst.id} has keys the schema does not allow (additionalProperties is false)`);
    assert.match(inst.id, idRe);
    assert.match(inst.handle, handleRe);
    assert.match(inst.region, regionRe);
    assert.match(inst.glyph, glyphRe);
    assert.ok(inst.sizeKm > 0, `${inst.id} sizeKm ${inst.sizeKm} is not exclusiveMinimum 0`);
    assert.equal(inst.provenance.authored, "generated");
    const g = inst.geometry;
    if (g.shape === "point") assert.equal(g.at.length, 2);
    else if (g.shape === "line") {
      assert.ok(g.points.length >= 2 && g.points.length <= 40, `${inst.id} ${g.points.length} points`);
    } else {
      assert.ok(g.ring.length >= 3 && g.ring.length <= 40, `${inst.id} ${g.ring.length} ring points`);
      assert.ok(shoelaceArea({ points: g.ring }) > 0, `${inst.id} ring is not positively wound`);
    }
  }
  assert.equal(new Set(r.instances.map((i) => i.id)).size, 1740, "duplicate instance id");
  assert.equal(new Set(r.instances.map((i) => i.handle)).size, 1740, "duplicate handle");
  // G-VERTEX-BUDGET's landform tier is 40 and the schema mirrors it; the widest
  // record this pass emits is the eight-vertex octagon.
  const widest = Math.max(...r.instances.map((i) =>
    i.geometry.ring?.length ?? i.geometry.points?.length ?? 1));
  assert.equal(widest, 8);
});

test("REAL WORLD — handles, ledgers and the order digest are pinned", () => {
  const { r } = realRun();
  assert.equal(r.ledgers.length, 13);
  assert.deepEqual(r.ledgers.map((l) => `${l.continent}:${l.handles.length}`),
    ["c01:96", "c02:360", "c03:280", "c04:305", "c05:301", "c06:97", "c07:97", "c08:86",
     "c09:35", "c10:35", "c11:16", "c12:16", "c13:16"]);
  assert.equal(r.ledgers.reduce((a, l) => a + l.handles.length, 0), 1740);
  // The ledger row is EXACTLY the plan's shape. The seam carried a `collisions`
  // counter here; with six-hex handles it is constant zero, and Task 11's
  // handle-ledger.schema.json is additionalProperties:false, so it is gone.
  for (const l of r.ledgers) assert.deepEqual(Object.keys(l), ["continent", "orderDigest", "handles"]);
  assert.deepEqual(r.ledgers.map((l) => l.orderDigest.slice(7, 19)),
    ["95a28f9ebc1d", "6136da1f706e", "17ed8830a7a1", "45a9b3738e36", "11499ab51d89",
     "b69f92eed647", "fe6a05b049ea", "1e14fc13cb47", "76c5b9817c69", "3a2213cf9b7f",
     "ff05321fb23b", "fe81541a3c69", "250d99141aa9"]);
  for (const l of r.ledgers) {
    const reordered = orderHandles({ handles: [...l.handles].reverse() });
    assert.equal(orderDigestOf({ handles: reordered }), l.orderDigest,
      `${l.continent}'s digest depends on insertion order`);
  }
});

test("REAL WORLD — the instance set and grid.landform are pinned by digest", () => {
  const { grid, r } = realRun();
  assert.equal(createHash("sha256").update(JSON.stringify(r.instances)).digest("hex").slice(0, 16),
    "3a4add619666e08b", "the landform instancing moved");
  assert.equal(createHash("sha256")
    .update(Buffer.from(grid.landform.buffer, grid.landform.byteOffset, grid.landform.byteLength))
    .digest("hex").slice(0, 16), "cf18ada96d78372c", "grid.landform moved");
  // Distributions, so a digest of a degenerate field cannot pass as a stable
  // one. Every group in every kit is represented; the three geometries all
  // occur; 307 instances are dungeonCapable, which is what P13 will draw from.
  const byId = new Map(r.instances.map((i) => [i.type, i]));
  assert.ok(byId.size >= 168);
  const groups = {};
  const lex = new Map(realRun().lexicon.map((t) => [t.id, t]));
  for (const i of r.instances) { const g = lex.get(i.type).group; groups[g] = (groups[g] ?? 0) + 1; }
  assert.deepEqual(groups, { coastal: 562, glacial: 51, mountain: 131, fluvial: 484, erosional: 23,
    wetland: 103, lakes: 28, karst: 168, desert: 142, island: 17, volcanic: 21, oceanic: 10 });
  const shapes = {};
  for (const i of r.instances) shapes[i.geometry.shape] = (shapes[i.geometry.shape] ?? 0) + 1;
  assert.deepEqual(shapes, { area: 856, line: 392, point: 492 });
  assert.equal(r.instances.filter((i) => i.dungeonCapable).length, 307);
});

test("REAL WORLD — no instance sits on water, off-mask ground or an unowned cell", () => {
  const { grid, r } = realRun();
  for (const inst of r.instances) {
    const i = idx({ grid, cx: inst.cell[0], cy: inst.cell[1] });
    assert.equal(grid.flags[i] & (FLAG.SEA | FLAG.LAKE), 0, `${inst.id} is on water`);
    assert.ok(grid.plate[i] >= 0, `${inst.id} is off the continental mask`);
    assert.ok(grid.owner[i] >= 0, `${inst.id} is on an unowned cell`);
    assert.equal(grid.regionId(i), inst.region, `${inst.id} names a region it does not sit in`);
  }
});

test("REAL WORLD — the naming stream is the COMMITTED one, not a grandchild under the same name", () => {
  // THE SEAM-3 TRAP, THIRD OCCURRENCE. `assignNames` used to mint
  // mintSeed(terrainStream, "names") = a39da863a8093b67 while
  // content/spine/derived.json commits n-atlas.resolvedSeedStreams.names =
  // 6033b1b1f52e861c. Two streams, one name, nothing joining them — and Plan D
  // mints the 336 titles from the COMMITTED one. The pass no longer derives it
  // at all; it is injected, and lib/seed.mjs makes minting it impossible.
  const worldSeed = WORLD_MANIFEST.seed;
  assert.equal(NAME_STREAM, namedStream({ worldSeed, name: "names" }),
    "the injected names stream is not the child of the world seed derived.json commits");
  assert.notEqual(NAME_STREAM, mintSeed({ parentStream: STREAM, name: "landform-names" }));
  // The name is built rather than spelled: noise-determinism.test.mjs scans
  // every source file under tools/mapforge for a `mintSeed({ name: "<reserved>" })`
  // call site and reds on one, and it should not have to special-case the test
  // that proves the throw.
  const reserved = ["na", "mes"].join("");
  assert.throws(() => mintSeed({ parentStream: STREAM, name: reserved }),
    /is one of the four stream names/);
  // …and the pass refuses to run without it, rather than quietly minting one.
  const { grid, premises, part, lexicon } = realRun();
  assert.throws(() => instanceLandforms({ grid, premises, regions: part.regions, lexicon,
    manifest: WORLD_MANIFEST, stream: STREAM }), /nameStream must be the 16-hex/);
});

test("REAL WORLD — `named` is keyed on CONTENT: a permutation of the same instances names the same set", () => {
  // `named` used to be drawn on `mix32(nameSalt, n)` with `n` the index into
  // the global instances array — which contradicts this file's own
  // `orderHandles` rule ("NEVER insertion order") and means one extra instance
  // anywhere reshuffles all 336 names world-wide. Reversing the array with
  // IDENTICAL objects named a different set (3 of 12 in common on the mini
  // world). The draw is keyed on the handle now, so it is invariant.
  const { r, part, lexicon, grid, premises } = realRun();
  const baseline = new Set(r.instances.filter((i) => i.named).map((i) => i.handle));
  assert.equal(baseline.size, WORLD_MANIFEST.landformCatalogue.named.total);

  // assignNames is internal; exercise it through the pass on a permuted MINI
  // world, where the whole instance list is small enough to shuffle wholesale.
  const mini = runMini();
  const named = (rr) => new Set(rr.instances.filter((i) => i.named).map((i) => i.handle));
  const forward = named(mini.r);
  assert.ok(forward.size > 0, "the mini world named nothing — the test would be vacuous");
  // A second run with the lexicon rows reversed produces the same instance SET
  // in a different array order (the ledger's total order is content-keyed), so
  // the named set must be identical.
  const reversed = runMini({ lexicon: [...MINI].reverse() });
  assert.deepEqual([...named(reversed.r)].sort(), [...forward].sort(),
    "the named set moved when only the array order changed");
});

test("REAL WORLD — `Decile` is a VALUE BUCKET, and the histograms say by how much", () => {
  // landforms.mjs's header used to claim these keys are rank-based and
  // therefore 1-ULP-immune. They are `min(9, floor(v * 10))`. 84 committed
  // lexicon rows read them and Plan D writes predicates against them, so the
  // real selectivity is pinned rather than described: a true decile would put
  // 25,600 of the 256,000 owned land cells in every bin.
  const { grid } = realRun();
  const temp = new Array(10).fill(0), precip = new Array(10).fill(0);
  let owned = 0;
  for (let i = 0; i < grid.n; i++) {
    if (grid.owner[i] < 0) continue;
    owned++;
    temp[Math.min(9, Math.floor(grid.temp[i] * 10))]++;
    precip[Math.min(9, Math.floor(grid.moist[i] * 10))]++;
  }
  assert.equal(owned, 256000);
  assert.deepEqual(temp, [50506, 24053, 38238, 26656, 25199, 40821, 26402, 17574, 6551, 0]);
  assert.deepEqual(precip, [32000, 38819, 40725, 40374, 40489, 34589, 19082, 6737, 513, 2672]);
  const atLeast7 = temp[7] + temp[8] + temp[9];
  assert.equal(atLeast7, 24125);
  assert.ok(atLeast7 / owned < 0.10 && atLeast7 / owned > 0.09,
    `tempDecileMin: 7 selects ${((100 * atLeast7) / owned).toFixed(1)}% of land, not the 30% "decile" promises`);
});

test("REAL WORLD — the spec's group census CANNOT be met, and the ceiling is the reason", () => {
  // Reviewer H: "the group census is missed by up to 88% and nothing gates it."
  // The miss is real and the cause is arithmetic, not placement. A group can
  // only receive instances from continents whose KIT names it, and each
  // continent's instance budget is fixed by region count — so every group has a
  // hard CEILING, and two of the twelve targets are above their own.
  const { r, lexicon, premises } = realRun();
  const lex = new Map(lexicon.map((t) => [t.id, t]));
  const budgetOf = new Map();
  for (const i of r.instances) {
    const c = i.region.split("/")[0];
    budgetOf.set(c, (budgetOf.get(c) ?? 0) + 1);
  }
  const placed = {};
  for (const i of r.instances) { const g = lex.get(i.type).group; placed[g] = (placed[g] ?? 0) + 1; }
  const ceiling = {};
  for (const g of Object.keys(GROUP_TARGETS)) {
    let c = 0;
    for (const p of premises) if (p.landformKit.includes(g)) c += budgetOf.get(p.id) ?? 0;
    ceiling[g] = c;
  }
  assert.deepEqual(ceiling, { coastal: 1404, fluvial: 1170, mountain: 809, glacial: 392, karst: 305,
    erosional: 1087, desert: 301, volcanic: 35, wetland: 570, lakes: 762, island: 169, oceanic: 16 });
  const impossible = Object.keys(GROUP_TARGETS).filter((g) => ceiling[g] < GROUP_TARGETS[g]);
  assert.deepEqual(impossible, ["volcanic", "oceanic"],
    "a group whose target exceeds the total budget of every continent that may carry it");
  // volcanic wants 110 from a continent that holds 35 instances in total;
  // oceanic wants 35 from one that holds 16. 145 targeted instances against a
  // 51 ceiling — 94 that MUST land in another group whatever the draw does.
  assert.equal(GROUP_TARGETS.volcanic + GROUP_TARGETS.oceanic, 145);
  assert.equal(ceiling.volcanic + ceiling.oceanic, 51);
  for (const g of Object.keys(GROUP_TARGETS))
    assert.ok(placed[g] <= ceiling[g], `${g} placed ${placed[g]} above its ceiling ${ceiling[g]}`);
});

test("REAL WORLD — Task 9 has the dungeon supply the spec asserts, by a different route", () => {
  // The spec derives "the 270 karst + volcanic instances comfortably supply all
  // 60 dungeon doors" from the group census. Both halves of the premise are
  // wrong: the world holds 189 karst + volcanic, and only 120 of those are
  // dungeonCapable. The CONCLUSION survives with a wide margin because
  // `dungeonCapable` is not a karst/volcanic property — it is spread over
  // twelve groups. Measured here so Task 9 does not have to trust the spec.
  const { r, lexicon } = realRun();
  const lex = new Map(lexicon.map((t) => [t.id, t]));
  const kv = r.instances.filter((i) => ["karst", "volcanic"].includes(lex.get(i.type).group));
  assert.equal(kv.length, 189, "the spec's 270 karst + volcanic is not this world");
  const capable = new Set(lexicon.filter((t) => t.dungeonCapable).map((t) => t.id));
  assert.equal(kv.filter((i) => capable.has(i.type)).length, 120);
  const dc = r.instances.filter((i) => capable.has(i.type));
  assert.equal(dc.length, 307);
  const perRegion = new Map();
  for (const i of dc) perRegion.set(i.region, (perRegion.get(i.region) ?? 0) + 1);
  assert.equal(perRegion.size, 117, "dungeonCapable instances are spread over this many regions");
  // P13 takes at most `round` per region over three rounds, so the supply the
  // quota can actually reach is Σ min(count, 3) — before Task 9's own
  // 2-region-hop reachability filter, which is Task 9's to measure.
  const reachable = [...perRegion.values()].reduce((a, c) => a + Math.min(c, 3), 0);
  assert.equal(reachable, 235);
  const want = WORLD_MANIFEST.quotas.dungeons.complexes;
  assert.equal(want, 60);
  assert.ok(reachable >= want * 3, `dungeon supply ${reachable} is not a comfortable margin over ${want}`);
});

test("REAL WORLD — the substitution ledger names a used type wherever one exists", () => {
  const { r } = realRun();
  assert.equal(r.substitutions.length, 106);
  assert.equal(r.substitutions.filter((s) => s.used !== null).length, 43);
  // The five world-wide gaps are all recorded, and sub-lacustrine-vent — the
  // one STATE §5 filed as unplaceable before the seam started — is among them.
  const wanted = new Set(r.substitutions.map((s) => s.wanted));
  for (const id of ["sub-lacustrine-vent", "sinking-river"])
    assert.ok(wanted.has(id), `${id} is unplaced and unrecorded`);
  for (const s of r.substitutions) {
    assert.notEqual(s.wanted, s.used);
    assert.match(s.why, /^no cell on c[0-9]{2} satisfies requires /);
  }
});
