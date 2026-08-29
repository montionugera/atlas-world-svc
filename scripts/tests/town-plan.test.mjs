import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

// Same ESM/CJS interop guard as scripts/lib/story.mjs:11 — `ajv` is CJS, so
// under ESM the constructor may arrive as the module namespace's `.default`.
const AjvClass = Ajv.default ?? Ajv;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");
const SCHEMA_PATH = join(ROOT, "content/schemas/town-plan.schema.json");

const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));

function compile() {
  return new AjvClass({ allErrors: true }).compile(JSON.parse(readFileSync(SCHEMA_PATH, "utf8")));
}

// Design §2's closed enums. NO T-rule owns either one, which is exactly why they
// belong in the schema rather than in the gate.
const ROAD_KINDS = ["cart", "foot"];
const FOOTPRINT_KINDS = ["mill", "dwelling", "store", "stable", "shrine", "gate", "tent", "ruin"];

// A plan that satisfies the SHAPE and nothing more. Its numbers are deliberately
// NOT scale-contract-clean (see the shape-only tests below) — proving the floors
// are somebody else's job.
function townPlan() {
  return {
    town: "millcross",
    extent: { width: 220, height: 160 },
    anchor: { geographyAt: [86, 118] },
    water: [{ id: "the-meltwash", kind: "river", poly: [[0, 52], [220, 58], [220, 74], [0, 68]] }],
    roads: [
      { id: "ford-approach", kind: "cart", width: 14, points: [[110, 160], [108, 96], [104, 60]] },
      { id: "tent-lane", kind: "foot", width: 5, points: [[140, 90], [170, 92]] },
    ],
    footprints: [
      { id: "mill-house", kind: "mill", rect: [96, 44, 116, 60], storeys: 2, entranceOn: "ford-approach" },
      // `storeys` and `entranceOn` are both optional: the pass case proves no
      // rule silently requires them (a ruin opens onto nothing).
      { id: "old-shell", kind: "ruin", rect: [10, 10, 20, 20] },
    ],
    plazas: [{ id: "cart-yard", rect: [88, 100, 132, 126], why: "where the queue waits when the ford is busy" }],
    landmarks: [
      {
        id: "mill-wheel", at: [118, 52], firstSight: true,
        source: "docs/worldbuilding/A1-geography-cluster1.md#6",
      },
      // `firstSight` and `source` are optional on a second landmark.
      { id: "cart-queue", at: [104, 112] },
    ],
  };
}

// Every object-typed node in the schema, as `[path, node]`. Used by the
// structural pins below so a level added later cannot escape them.
function objectNodes(node, path = "$", out = []) {
  if (node === null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((v, i) => objectNodes(v, `${path}[${i}]`, out));
    return out;
  }
  if (node.type === "object") out.push([path, node]);
  for (const [k, v] of Object.entries(node)) objectNodes(v, `${path}.${k}`, out);
  return out;
}

// ---------------------------------------------------------------------------
// Structural pins. These are what make the "delete one additionalProperties:
// false" mutation go red no matter WHICH level it is deleted from — a
// behavioural test can only cover the levels somebody remembered to write one
// for.
// ---------------------------------------------------------------------------

test("the schema is draft-07 and carries an $id", () => {
  assert.equal(SCHEMA.$schema, "http://json-schema.org/draft-07/schema#");
  assert.equal(typeof SCHEMA.$id, "string");
  assert.ok(SCHEMA.$id.length > 0);
});

test("every object level in the schema sets additionalProperties: false", () => {
  const nodes = objectNodes(SCHEMA);
  const leaky = nodes.filter(([, n]) => n.additionalProperties !== false).map(([p]) => p);
  assert.deepEqual(leaky, [], `object levels missing additionalProperties:false: ${leaky.join(", ")}`);
});

test("the schema has exactly the eight object levels the design names", () => {
  // root, extent, anchor, water[], roads[], footprints[], plazas[], landmarks[].
  // A new level must be added to this count DELIBERATELY, which forces whoever
  // adds it past the additionalProperties pin above.
  assert.equal(objectNodes(SCHEMA).length, 8);
});

// ---------------------------------------------------------------------------
// SHAPE ONLY. The gate `continue`s past a schema-invalid document, so any floor
// duplicated into the schema makes the matching T-rule dead code whose mutation
// cannot flip. These tests pin the division of labour.
// ---------------------------------------------------------------------------

test("the schema declares no minimum/maximum anywhere — T2/T3 own the floors", () => {
  const found = [];
  (function walk(node, path) {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
    for (const [k, v] of Object.entries(node)) {
      if (k === "minimum" || k === "maximum" || k === "exclusiveMinimum" || k === "exclusiveMaximum") {
        found.push(`${path}.${k}`);
      }
      walk(v, `${path}.${k}`);
    }
  })(SCHEMA, "$");
  assert.deepEqual(found, [], `numeric bounds belong in the gate, not the schema: ${found.join(", ")}`);
});

test("schema accepts a cart road far under the 12-unit floor (T3 owns it)", () => {
  const validate = compile();
  const doc = townPlan();
  doc.roads[0].width = 0.5;
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("schema accepts a foot road far under the 4-unit floor (T3 owns it)", () => {
  const validate = compile();
  const doc = townPlan();
  doc.roads[1].width = 0.25;
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("schema accepts an extent outside 150-260 on both axes (T2 owns it)", () => {
  const validate = compile();
  const doc = townPlan();
  doc.extent = { width: 3, height: 9999 };
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("schema accepts a footprint under the 6-unit shorter-side floor (the gate owns it)", () => {
  const validate = compile();
  const doc = townPlan();
  doc.footprints[0].rect = [10, 10, 11, 10.5];
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("schema accepts overlapping footprints and roads (T4 owns overlap)", () => {
  const validate = compile();
  const doc = townPlan();
  doc.footprints[1].rect = [...doc.footprints[0].rect];
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("schema accepts an entranceOn naming no real road (T5 owns the reference)", () => {
  const validate = compile();
  const doc = townPlan();
  doc.footprints[0].entranceOn = "no-such-road";
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("schema accepts zero, one and two firstSight landmarks (T7 owns the count)", () => {
  const validate = compile();
  for (const flags of [[], [true], [true, true]]) {
    const doc = townPlan();
    doc.landmarks.forEach((l, i) => {
      if (flags[i] === undefined) delete l.firstSight;
      else l.firstSight = flags[i];
    });
    assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
  }
});

test("schema accepts duplicate ids (de-duplication belongs to the gate)", () => {
  const validate = compile();
  const doc = townPlan();
  doc.footprints[1].id = doc.footprints[0].id;
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

// ---------------------------------------------------------------------------
// The baseline, and the strictness the schema DOES own.
// ---------------------------------------------------------------------------

test("the baseline plan validates", () => {
  const validate = compile();
  assert.ok(validate(townPlan()), JSON.stringify(validate.errors, null, 2));
});

test("the design's own §2 example validates", () => {
  // Transcribed verbatim from docs/superpowers/specs/2026-08-09-town-plan-view-design.md §2.
  const validate = compile();
  const doc = {
    town: "millcross",
    extent: { width: 220, height: 160 },
    anchor: { geographyAt: [86, 118] },
    water: [{ id: "the-meltwash", kind: "river", poly: [[0, 52], [220, 58], [220, 74], [0, 68]] }],
    roads: [{ id: "ford-approach", kind: "cart", width: 14, points: [[110, 160], [108, 96], [104, 60]] }],
    footprints: [
      { id: "mill-house", kind: "mill", rect: [96, 44, 116, 60], storeys: 2, entranceOn: "ford-approach" },
    ],
    plazas: [{ id: "cart-yard", rect: [88, 100, 132, 126], why: "where the queue waits when the ford is busy" }],
    landmarks: [
      {
        id: "mill-wheel", at: [118, 52], firstSight: true,
        source: "docs/worldbuilding/A1-geography-cluster1.md#6",
      },
    ],
  };
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("schema accepts a root spineId — the F-041 foreign key to content/spine/nodes/", () => {
  const validate = compile();
  assert.ok(
    validate({ ...townPlan(), spineId: "n-millcross" }),
    JSON.stringify(validate.errors, null, 2)
  );
});

test("water and plazas are optional", () => {
  const validate = compile();
  const doc = townPlan();
  delete doc.water;
  delete doc.plazas;
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

for (const key of ["town", "extent", "anchor", "roads", "footprints", "landmarks"]) {
  test(`schema rejects a plan with no ${key}`, () => {
    const doc = townPlan();
    delete doc[key];
    assert.equal(compile()(doc), false);
  });
}

// One rejection per object level, so the additionalProperties mutation is
// visible behaviourally as well as structurally.

test("schema rejects an unknown top-level property", () => {
  assert.equal(compile()({ ...townPlan(), surprise: true }), false);
});

test("schema rejects an unknown property inside extent", () => {
  const doc = townPlan();
  doc.extent.depth = 3;
  assert.equal(compile()(doc), false);
});

test("schema rejects an unknown property inside anchor", () => {
  const doc = townPlan();
  doc.anchor.rotation = 90;
  assert.equal(compile()(doc), false);
});

test("schema rejects an unknown property inside a water body", () => {
  const doc = townPlan();
  doc.water[0].depth = 2;
  assert.equal(compile()(doc), false);
});

test("schema rejects an unknown property inside a road", () => {
  const doc = townPlan();
  doc.roads[0].surface = "cobble";
  assert.equal(compile()(doc), false);
});

test("schema rejects an unknown property inside a footprint", () => {
  const doc = townPlan();
  doc.footprints[0].roof = "thatch";
  assert.equal(compile()(doc), false);
});

test("schema rejects an unknown property inside a plaza", () => {
  const doc = townPlan();
  doc.plazas[0].market = true;
  assert.equal(compile()(doc), false);
});

test("schema rejects an unknown property inside a landmark", () => {
  const doc = townPlan();
  doc.landmarks[0].name = "The Mill Wheel";
  assert.equal(compile()(doc), false);
});

// Required keys per level.

test("schema rejects a road missing width or points", () => {
  for (const key of ["id", "kind", "width", "points"]) {
    const doc = townPlan();
    delete doc.roads[0][key];
    assert.equal(compile()(doc), false, `roads[].${key} must be required`);
  }
});

test("schema rejects a footprint missing id, kind or rect", () => {
  for (const key of ["id", "kind", "rect"]) {
    const doc = townPlan();
    delete doc.footprints[0][key];
    assert.equal(compile()(doc), false, `footprints[].${key} must be required`);
  }
});

test("schema rejects a landmark missing id or at", () => {
  for (const key of ["id", "at"]) {
    const doc = townPlan();
    delete doc.landmarks[0][key];
    assert.equal(compile()(doc), false, `landmarks[].${key} must be required`);
  }
});

test("schema rejects a water body missing id, kind or poly", () => {
  for (const key of ["id", "kind", "poly"]) {
    const doc = townPlan();
    delete doc.water[0][key];
    assert.equal(compile()(doc), false, `water[].${key} must be required`);
  }
});

test("schema rejects a plaza missing id or rect", () => {
  for (const key of ["id", "rect"]) {
    const doc = townPlan();
    delete doc.plazas[0][key];
    assert.equal(compile()(doc), false, `plazas[].${key} must be required`);
  }
});

// The two closed enums.

test("roads[].kind accepts exactly cart and foot", () => {
  const validate = compile();
  for (const kind of ROAD_KINDS) {
    const doc = townPlan();
    doc.roads[0].kind = kind;
    assert.ok(validate(doc), `${kind} must be a legal road kind`);
  }
  assert.deepEqual(SCHEMA.properties.roads.items.properties.kind.enum, ROAD_KINDS);
});

test("roads[].kind rejects anything else", () => {
  for (const kind of ["track", "Cart", "", "highway"]) {
    const doc = townPlan();
    doc.roads[0].kind = kind;
    assert.equal(compile()(doc), false, `${kind} must not be a legal road kind`);
  }
});

test("footprints[].kind accepts exactly the design's eight values", () => {
  const validate = compile();
  for (const kind of FOOTPRINT_KINDS) {
    const doc = townPlan();
    doc.footprints[0].kind = kind;
    assert.ok(validate(doc), `${kind} must be a legal footprint kind`);
  }
  assert.deepEqual(SCHEMA.properties.footprints.items.properties.kind.enum, FOOTPRINT_KINDS);
});

test("footprints[].kind rejects anything else", () => {
  for (const kind of ["tower", "Mill", "", "wall"]) {
    const doc = townPlan();
    doc.footprints[0].kind = kind;
    assert.equal(compile()(doc), false, `${kind} must not be a legal footprint kind`);
  }
});

// Coordinate shapes.

test("schema rejects a rect that is not four numbers", () => {
  for (const rect of [[1, 2, 3], [1, 2, 3, 4, 5], [1, 2, 3, "4"]]) {
    const doc = townPlan();
    doc.footprints[0].rect = rect;
    assert.equal(compile()(doc), false, `${JSON.stringify(rect)} must not be a legal rect`);
  }
});

test("schema rejects a point that is not a number pair", () => {
  const doc = townPlan();
  doc.roads[0].points = [[1, 2], [3, 4, 5]];
  assert.equal(compile()(doc), false);
});

test("schema rejects a road polyline with fewer than two points", () => {
  const doc = townPlan();
  doc.roads[0].points = [[1, 2]];
  assert.equal(compile()(doc), false);
});

test("schema rejects a water polygon with fewer than three points", () => {
  const doc = townPlan();
  doc.water[0].poly = [[1, 2], [3, 4]];
  assert.equal(compile()(doc), false);
});

test("schema rejects a non-pair anchor.geographyAt", () => {
  const doc = townPlan();
  doc.anchor.geographyAt = [86];
  assert.equal(compile()(doc), false);
});

test("schema rejects a non-boolean firstSight and a non-integer storeys", () => {
  const bad = townPlan();
  bad.landmarks[0].firstSight = "yes";
  assert.equal(compile()(bad), false);
  const bad2 = townPlan();
  bad2.footprints[0].storeys = 1.5;
  assert.equal(compile()(bad2), false);
});

// ===========================================================================
// The gate — checkTownPlan() in scripts/check_content.mjs.
//
// These go through the REAL gate binary against a hermetic temp content root,
// so they cover the WIRING as well as the rules: a green rule that main() never
// calls would still let every fixture below pass.
//
// All seven rules. The baseline plan below is clean for every one of them (no
// footprint overlaps a road or another footprint, the walkable area is one
// connected region, exactly one firstSight), so each test manufactures exactly
// the single defect it asserts.
// ===========================================================================

// The Cartographer's authority for T1. `zones: []` because checkZoneContent
// soft-skips a root with no content/zones dir and never reads it — but
// loadGeographyZones would FAIL shape-invalid if some other check did.
const GEOGRAPHY = {
  zones: [],
  towns: [
    { id: "millcross", name: "Millcross", at: [86, 118], zone: "millcross-ford" },
    { id: "gildmark", name: "Gildmark", at: [11, 157], zone: "gildmark-head" },
  ],
};

// A plan that satisfies T1, T2, T3 and T5 and sits EXACTLY on every floor, so
// no test has slack and no test can pass by accident:
//
//   extent 150 x 260 — exactly T2's minimum on one axis and its maximum on the
//                      other, proving the range is inclusive at both ends
//   cart-road width 12 — exactly T3's cart floor (mob diameter 10 + clearance)
//   alley width 4      — exactly T3's foot floor (player diameter 2.6 + clearance)
//   mill-house x0 = 81 — the cart road's swept edge is x = 81, so the footprint
//                        abuts it with a gap of exactly 0, the strictest thing
//                        T5 can be asked to accept while T4 still forbids overlap
//   cart-shed y0 = 122 — same, against the alley's lower swept edge (y = 122)
function gatePlan() {
  return {
    town: "millcross",
    extent: { width: 150, height: 260 },
    anchor: { geographyAt: [86, 118] },
    water: [{ id: "the-meltwash", kind: "river", poly: [[0, 150], [150, 150], [150, 170], [0, 170]] }],
    roads: [
      { id: "cart-road", kind: "cart", width: 12, points: [[75, 0], [75, 260]] },
      { id: "alley", kind: "foot", width: 4, points: [[75, 120], [110, 120]] },
    ],
    footprints: [
      { id: "mill-house", kind: "mill", rect: [81, 20, 101, 40], storeys: 2, entranceOn: "cart-road" },
      { id: "cart-shed", kind: "stable", rect: [90, 122, 106, 138], entranceOn: "alley" },
      // No entranceOn: T5 must not silently require one (a ruin opens onto
      // nothing). If it did, this footprint would FAIL and the baseline would
      // never be green.
      { id: "old-shell", kind: "ruin", rect: [10, 200, 26, 216] },
    ],
    plazas: [{ id: "cart-yard", rect: [100, 60, 130, 90], why: "where the queue waits when the ford is busy" }],
    landmarks: [
      {
        id: "mill-wheel", at: [78, 30], firstSight: true,
        source: "docs/worldbuilding/A1-geography-cluster1.md#6",
      },
      { id: "cart-queue", at: [75, 250] },
    ],
  };
}

// `mutate` runs on the baseline plan, so each test manufactures exactly the one
// defect it asserts and inherits a clean plan for every other rule.
function onePlan(mutate) {
  const plan = gatePlan();
  if (mutate) mutate(plan);
  return { "town-millcross.json": plan };
}

// `towns: null` = do not create content/towns at all (the first soft-skip
// shape). `townSchema: false` = do not copy the schema either, which is what a
// content root that never adopted town plans actually looks like.
// Plan D Task 11: loadPlaces() lost its legacy-mirror fallback, so this
// fixture root carries its geography in the RESOLVED shape — one
// content/world/resolved/continent-02.json wrapping the same towns array.
// Only the FILE and the wrapper keys changed; every downstream assertion is
// untouched.
function writeResolvedFixture(dir, { zones = [], towns = [] }) {
  mkdirSync(join(dir, "content/world/resolved"), { recursive: true });
  // The fixture root now HAS a content/world/, so G-WORLD-BUDGET arms; give it
  // the committed budget table and manifest so it stays green here.
  cpSync(join(ROOT, "content/world/budgets.json"), join(dir, "content/world/budgets.json"));
  cpSync(join(ROOT, "content/world/manifest.json"), join(dir, "content/world/manifest.json"));
  writeFileSync(join(dir, "content/world/resolved/continent-02.json"),
    JSON.stringify({
      continent: "c02",
      coastline: { id: "f-coast-c02", points: [[0, 0], [10, 0], [10, 10]] },
      river: null, saltmire: null, iceEdge: null, terrainPatches: [],
      zones, towns, camps: [], roads: [], landmarks: [], dungeons: [],
      instances: [], relay: null, distances: null, seaLane: null, sheet: null,
    }));
}

function fixture({ towns = {}, geography = GEOGRAPHY, townSchema = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "town-gate-"));
  mkdirSync(join(dir, "content/characters"), { recursive: true });
  mkdirSync(join(dir, "content/schemas"), { recursive: true });
  writeResolvedFixture(dir, { zones: geography.zones ?? [], towns: geography.towns ?? [] });
  const schemas = ["character.schema.json", "map.schema.json"];
  if (townSchema) schemas.push("town-plan.schema.json");
  for (const s of schemas)
    cpSync(join(ROOT, "content/schemas", s), join(dir, "content/schemas", s));
  if (towns !== null) {
    mkdirSync(join(dir, "content/towns"), { recursive: true });
    for (const [name, body] of Object.entries(towns))
      writeFileSync(join(dir, "content/towns", name),
        typeof body === "string" ? body : JSON.stringify(body));
  }
  // Hermeticity: every external artifact the gate reads is a fixture, so these
  // tests can never silently track the live committed files.
  writeFileSync(join(dir, "keys.json"), JSON.stringify({ version: 1, keys: [] }));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ version: 2, entries: {} }));
  writeFileSync(join(dir, "mob-types.json"), JSON.stringify({ version: 1, mobTypes: [] }));
  writeFileSync(join(dir, "spawn-areas.json"), JSON.stringify({ version: 1, areas: [] }));
  return dir;
}

function runGate(dir, extra = []) {
  try {
    const out = execFileSync(process.execPath, [
      GATE,
      "--content-root", join(dir, "content"),
      "--keys", join(dir, "keys.json"),
      "--manifest", join(dir, "manifest.json"),
      "--mob-types", join(dir, "mob-types.json"),
      "--spawn-areas", join(dir, "spawn-areas.json"),
      ...extra,
    ], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

// --------------------------- wiring + soft-skip ----------------------------
// The soft-skip is what protects every pre-existing fixture in
// check_content.test.mjs and bestiary-placement.test.mjs: none of them has a
// content/towns dir OR a town-plan schema, so the skip MUST happen before the
// schema is compiled.

test("no content/towns directory skips silently", () => {
  const r = runGate(fixture({ towns: null, townSchema: false }));
  assert.equal(r.code, 0);
  assert.match(r.out, /, 0 towns, 0 nodes,/);
  assert.doesNotMatch(r.out, /town-plan schema/);
});

test("a content/towns directory with no town-*.json skips silently", () => {
  const r = runGate(fixture({ towns: {}, townSchema: false }));
  assert.equal(r.code, 0);
  assert.match(r.out, /, 0 towns, 0 nodes,/);
  assert.doesNotMatch(r.out, /town-plan schema/);
});

test("the townCount reaches the finish() count line", () => {
  const r = runGate(fixture({ towns: onePlan() }));
  assert.equal(r.code, 0);
  assert.match(r.out, /, 1 towns, 0 nodes,/);
});

test("the baseline plan passes every T-rule and raises nothing", () => {
  const r = runGate(fixture({ towns: onePlan() }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /FAIL/);
});

test("a schema-invalid plan is a FAIL, not a crash, and its T-rules are skipped", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.surprise = true; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /towns\/town-millcross\.json: schema /);
  assert.doesNotMatch(r.out, /at Object\.<anonymous>/); // no stack trace
  assert.match(r.out, /, 0 towns, 0 nodes,/);
});

test("an unparsable town file is one FAIL, not a crash", () => {
  const r = runGate(fixture({ towns: { "town-millcross.json": "{ not json" } }));
  assert.equal(r.code, 1);
  assert.doesNotMatch(r.out, /at Object\.<anonymous>/);
});

test("a geography with no towns at all orphans the plan loudly, not silently", () => {
  // Plan D Task 11: the geography lives in resolved continent files now, and
  // the merge NORMALISES every array key — a continent file without `towns`
  // yields an empty towns map, never a shape-invalid document. The failure
  // mode for a world that declares no towns is therefore T1's named orphan:
  const r = runGate(fixture({ towns: onePlan(), geography: { zones: [] } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /towns\/town-millcross\.json: town "millcross" not in content\/world\/resolved#towns/);
  assert.match(r.out, /, 0 towns, 0 nodes,/);
});

// ---------------------------------- T1 -------------------------------------

test("T1: a plan naming a town the geography declares passes", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.town = "gildmark"; }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /not in content\/world\/resolved/);
});

test("T1: a plan naming a town the geography does not declare FAILs and is not counted", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.town = "nowhere-ford"; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /towns\/town-millcross\.json: town "nowhere-ford" not in content\/world\/resolved#towns/);
  assert.match(r.out, /, 0 towns, 0 nodes,/);
});

// ---------------------------------- T2 -------------------------------------

test("T2: an extent exactly on both endpoints of 150-260 passes", () => {
  // The baseline already is 150 x 260; assert it explicitly so a later edit
  // that gives the fixture slack is visible here rather than silently
  // weakening every T2 test.
  assert.deepEqual(gatePlan().extent, { width: 150, height: 260 });
  const r = runGate(fixture({ towns: onePlan() }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /is outside 150-260/);
});

test("T2: an extent width below 150 FAILs", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.extent.width = 149.9; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /extent width 149\.9 is outside 150-260 world units/);
});

test("T2: an extent height below 150 FAILs", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.extent.height = 149.9; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /extent height 149\.9 is outside 150-260 world units/);
});

test("T2: an extent width above 260 FAILs", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.extent.width = 260.1; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /extent width 260\.1 is outside 150-260 world units/);
});

test("T2: an extent height above 260 FAILs", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.extent.height = 260.1; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /extent height 260\.1 is outside 150-260 world units/);
});

// ---------------------------------- T3 -------------------------------------

test("T3: roads exactly on the 12 and 4 unit floors pass", () => {
  const plan = gatePlan();
  assert.equal(plan.roads.find((r) => r.kind === "cart").width, 12);
  assert.equal(plan.roads.find((r) => r.kind === "foot").width, 4);
  const r = runGate(fixture({ towns: onePlan() }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /needs at least/);
});

test("T3: a cart road under 12 FAILs — a mob of radius 5 could not pass", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.roads[0].width = 11.9; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /road "cart-road" \(kind "cart"\) is 11\.9 wide, needs at least 12/);
});

test("T3: a foot road under 4 FAILs — a player of radius 1.3 could not pass", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.roads[1].width = 3.9; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /road "alley" \(kind "foot"\) is 3\.9 wide, needs at least 4/);
});

test("T3: the floor is chosen by kind — a 4-wide road is legal as foot and illegal as cart", () => {
  const asFoot = runGate(fixture({ towns: onePlan((p) => { p.roads[0].kind = "foot"; p.roads[0].width = 4; }) }));
  assert.doesNotMatch(asFoot.out, /road "cart-road".*needs at least/);
  const asCart = runGate(fixture({ towns: onePlan((p) => { p.roads[1].kind = "cart"; }) }));
  assert.equal(asCart.code, 1);
  assert.match(asCart.out, /road "alley" \(kind "cart"\) is 4 wide, needs at least 12/);
});

test("T3: a degenerate road width is a FAIL, not a thrown roadPolygon", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.roads[0].width = 0; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /is 0 wide, needs at least 12/);
  assert.doesNotMatch(r.out, /TypeError/);
});

// ---------------------------------- T5 -------------------------------------

test("T5: a footprint abutting the road it opens onto passes, and entranceOn is optional", () => {
  const plan = gatePlan();
  assert.equal(plan.footprints[0].rect[0], 81); // exactly the cart road's swept edge
  assert.equal(plan.footprints[1].rect[1], 122); // exactly the alley's swept edge
  assert.equal(plan.footprints[2].entranceOn, undefined);
  const r = runGate(fixture({ towns: onePlan() }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /entranceOn|does not touch road/);
});

test("T5: an entranceOn naming no road in the plan FAILs", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.footprints[0].entranceOn = "no-such-road"; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /footprint "mill-house" entranceOn "no-such-road" names no road in this plan/);
});

test("T5: a footprint set back from the road it opens onto FAILs", () => {
  // One unit clear of the cart road's swept edge — twice the touch tolerance,
  // so it is unambiguously not opening onto anything.
  const r = runGate(fixture({ towns: onePlan((p) => { p.footprints[0].rect = [82, 20, 102, 40]; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /footprint "mill-house" does not touch road "cart-road" it opens onto/);
});

test("T5: touching the WRONG road is not touching the one it opens onto", () => {
  // cart-shed physically abuts the alley, but claims to open onto cart-road,
  // which is 15 units west of it. A rule that only asked "does this footprint
  // touch SOME road" would wave this through.
  const r = runGate(fixture({ towns: onePlan((p) => { p.footprints[1].entranceOn = "cart-road"; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /footprint "cart-shed" does not touch road "cart-road" it opens onto/);
});

test("T5: opening onto a road with no swept area is a FAIL, not a crash", () => {
  // A zero-width road cannot be swept, so roadPolygon throws. T3 already FAILs
  // the width; T5 must report the dependency rather than let the throw escape.
  const r = runGate(fixture({ towns: onePlan((p) => { p.roads[0].width = 0; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /footprint "mill-house" opens onto road "cart-road", which has no swept area/);
  assert.doesNotMatch(r.out, /TypeError/);
});

// ---------------------------------- T4 -------------------------------------
// No footprint overlaps a road's swept area, and no two footprints overlap.
//
// Every overlap fixture below is placed on a STRAIGHT stretch of road. The
// swept area of a polyline claims slightly MORE than the drawn width near a
// bend (roadPolygon's joint quad reaches a little past the minimal bevel), so a
// footprint parked against a corner would register an overlap that is an
// artefact of the sweep rather than the authored geometry. Both baseline roads
// are two-point straights, which keeps these fixtures testing the rule.

test("T4: a footprint abutting a road with a gap of exactly 0 is not an overlap", () => {
  // The strictest thing T4 can be asked to accept, and the same fixture T5
  // needs to pass: touching is not overlapping, or the two rules contradict.
  const plan = gatePlan();
  assert.equal(plan.footprints[0].rect[0], 81); // cart-road's swept edge is x = 81
  assert.equal(plan.footprints[1].rect[1], 122); // alley's swept edge is y = 122
  const r = runGate(fixture({ towns: onePlan() }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /overlaps the swept area/);
});

test("T4: a footprint reaching into a foot road's swept area FAILs", () => {
  // cart-shed 2 units into the alley (swept y 118-122). It still TOUCHES the
  // road it opens onto, so T5 stays green and only T4 can be reporting this.
  const r = runGate(fixture({ towns: onePlan((p) => { p.footprints[1].rect = [90, 120, 106, 138]; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /footprint "cart-shed" overlaps the swept area of road "alley"/);
  assert.doesNotMatch(r.out, /does not touch road/);
});

test("T4: a footprint reaching into a cart road's swept area FAILs", () => {
  // old-shell has no entranceOn at all, so no other rule has an opinion about
  // where it sits — this is T4 alone.
  const r = runGate(fixture({ towns: onePlan((p) => { p.footprints[2].rect = [70, 200, 86, 216]; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /footprint "old-shell" overlaps the swept area of road "cart-road"/);
});

test("T4: a footprint swallowing a road whole FAILs", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.footprints[2].rect = [60, 200, 92, 216]; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /footprint "old-shell" overlaps the swept area of road "cart-road"/);
});

test("T4: two footprints sharing area FAIL, naming both", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.footprints[2].rect = [100, 130, 116, 146]; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /footprints "cart-shed" and "old-shell" overlap/);
});

test("T4: two footprints sharing only an edge do NOT overlap", () => {
  // old-shell's west edge is cart-shed's east edge, exactly. A non-strict
  // overlap test would reject a terrace of adjoining buildings.
  const r = runGate(fixture({ towns: onePlan((p) => { p.footprints[2].rect = [106, 122, 122, 138]; }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /overlap/);
});

test("T4: a road with no swept area cannot be overlapped, and does not crash", () => {
  // Zero width: roadPolygon throws, the road is absent from roadQuads, and T3
  // owns the report. T4 must neither crash nor invent an overlap.
  const r = runGate(fixture({ towns: onePlan((p) => { p.roads[1].width = 0; }) }));
  assert.equal(r.code, 1);
  assert.doesNotMatch(r.out, /overlaps the swept area of road "alley"/);
  assert.doesNotMatch(r.out, /TypeError/);
});

// ---------------------------------- T6 -------------------------------------
// THE LOAD-BEARING RULE: the walkable area must be exactly ONE connected
// region. A town that looks fine on the render and cannot be walked is the
// exact failure this feature exists to prevent.

// Four footprints ringing an interior plaza, in empty ground south-east of the
// baseline's alley. Walls are 8 units thick and the yard inside is 24 x 24 —
// comfortably bigger than a player, so the sealed region is real open ground
// and not a rounding artefact. The four rects only TOUCH each other at the
// corners, so the ring is T4-clean and T6 is the only rule that can object.
function ringWalls() {
  return [
    { id: "court-north", kind: "dwelling", rect: [100, 160, 140, 168] },
    { id: "court-west", kind: "dwelling", rect: [100, 168, 108, 192] },
    { id: "court-east", kind: "dwelling", rect: [132, 168, 140, 192] },
    { id: "court-south", kind: "dwelling", rect: [100, 192, 140, 200] },
  ];
}

// The same ring with a 6-unit doorway cut into its south wall. 6 units clears
// the 2.6 the player-radius inflation eats from a gap, so the yard is joined to
// the town and the plan is legal.
function ringWallsWithDoorway() {
  const walls = ringWalls();
  walls.pop();
  walls.push({ id: "court-south-west", kind: "dwelling", rect: [100, 192, 117, 200] });
  walls.push({ id: "court-south-east", kind: "dwelling", rect: [123, 192, 140, 200] });
  return walls;
}

function sealCourtyard(p) {
  p.footprints.push(...ringWalls());
  p.plazas.push({ id: "sealed-yard", rect: [110, 170, 130, 190], why: "the yard the ring encloses" });
}

test("T6: the baseline town is one connected region", () => {
  const r = runGate(fixture({ towns: onePlan() }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /disconnected regions/);
});

test("T6: a sealed courtyard FAILs — four footprints ringing an interior plaza", () => {
  const r = runGate(fixture({ towns: onePlan(sealCourtyard) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /walkable area is 2 disconnected regions .*must be exactly 1/);
  // Nothing else objects: the ring is T4-clean, opens onto no road, and the
  // firstSight landmark is outside it. Delete T6 and this plan goes green,
  // which is exactly what its mutation test proves.
  assert.doesNotMatch(r.out, /overlap/);
  assert.doesNotMatch(r.out, /firstSight/);
});

test("T6: the same ring with a doorway PASSES — the rule is about connectivity, not about rings", () => {
  const r = runGate(fixture({ towns: onePlan((p) => {
    p.footprints.push(...ringWallsWithDoorway());
    p.plazas.push({ id: "open-yard", rect: [110, 170, 130, 190], why: "the yard the ring encloses" });
  }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /disconnected regions/);
});

test("T6: a doorway narrower than the player is NOT a doorway", () => {
  // The same south wall, but the gap is 2 units — under the 2.6 the player
  // radius eats from either side, so no body can pass and the yard is sealed
  // again. This is the case an eye on a rendered map cannot judge.
  const r = runGate(fixture({ towns: onePlan((p) => {
    const walls = ringWalls();
    walls.pop();
    walls.push({ id: "court-south-west", kind: "dwelling", rect: [100, 192, 119, 200] });
    walls.push({ id: "court-south-east", kind: "dwelling", rect: [121, 192, 140, 200] });
    p.footprints.push(...walls);
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /walkable area is 2 disconnected regions/);
});

test("T6: a pocket severed against the town edge FAILs too", () => {
  // Two footprints meeting at an edge, one reaching the west extent and one the
  // south, cut the bottom-left corner off. The pocket TOUCHES the town edge, so
  // a rule that only asked "does this region reach the extent" would wave it
  // through — it is unreachable because no path connects it to the rest.
  const r = runGate(fixture({ towns: onePlan((p) => {
    p.footprints.push({ id: "corner-bar", kind: "dwelling", rect: [0, 230, 32, 238] });
    p.footprints.push({ id: "corner-post", kind: "dwelling", rect: [32, 230, 40, 260] });
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /walkable area is 2 disconnected regions/);
  assert.doesNotMatch(r.out, /overlap/);
});

test("T6: a degenerate extent is a T2 FAIL, not a thrown walkableGrid", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.extent.width = 0; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /extent width 0 is outside 150-260/);
  assert.doesNotMatch(r.out, /disconnected regions/);
  assert.doesNotMatch(r.out, /TypeError/);
});

// ---------------------------------- T7 -------------------------------------
// Exactly one firstSight landmark, and it is reachable from the town edge.

test("T7: exactly one firstSight, standing on walkable ground, passes", () => {
  const plan = gatePlan();
  assert.equal(plan.landmarks.filter((l) => l.firstSight === true).length, 1);
  const r = runGate(fixture({ towns: onePlan() }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /firstSight/);
});

test("T7: zero firstSight landmarks FAILs", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { delete p.landmarks[0].firstSight; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /0 landmarks are marked firstSight, must be exactly 1/);
});

test("T7: firstSight: false counts as zero, not as a marking", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.landmarks[0].firstSight = false; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /0 landmarks are marked firstSight, must be exactly 1/);
});

test("T7: two firstSight landmarks FAIL", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.landmarks[1].firstSight = true; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /2 landmarks are marked firstSight, must be exactly 1/);
});

test("T7: a firstSight standing inside a building FAILs", () => {
  // Inside mill-house [81, 20, 101, 40]. The plan draws an arrival marker where
  // no body of player radius can stand.
  const r = runGate(fixture({ towns: onePlan((p) => { p.landmarks[0].at = [91, 30]; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /firstSight landmark "mill-wheel" at \[91, 30\] stands on blocked ground/);
  assert.doesNotMatch(r.out, /disconnected regions/);
});

test("T7: a firstSight outside the town extent FAILs", () => {
  const r = runGate(fixture({ towns: onePlan((p) => { p.landmarks[0].at = [200, 30]; }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /firstSight landmark "mill-wheel" at \[200, 30\] lies outside the town extent/);
});

test("T7: a firstSight sealed inside a courtyard is unreachable from the town edge", () => {
  // The reachability branch, distinct from the count and from blocked ground:
  // the landmark stands on perfectly walkable open ground that no traveller can
  // ever arrive at. T6 reports the severance, T7 reports the consequence.
  const r = runGate(fixture({ towns: onePlan((p) => {
    sealCourtyard(p);
    p.landmarks[0].at = [120, 180];
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /firstSight landmark "mill-wheel" at \[120, 180\] is not reachable from the town edge/);
  assert.match(r.out, /walkable area is 2 disconnected regions/);
});

test("T7: reachability is asked of EVERY candidate, not just of a lone survivor", () => {
  // Two firstSights, the second of them inside a building. Reporting only the
  // count would hide the unreachable one behind it.
  const r = runGate(fixture({ towns: onePlan((p) => {
    p.landmarks[1].firstSight = true;
    p.landmarks[1].at = [91, 30];
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /2 landmarks are marked firstSight/);
  assert.match(r.out, /firstSight landmark "cart-queue" at \[91, 30\] stands on blocked ground/);
});
