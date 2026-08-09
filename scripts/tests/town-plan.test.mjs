import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

// Same ESM/CJS interop guard as scripts/lib/story.mjs:11 — `ajv` is CJS, so
// under ESM the constructor may arrive as the module namespace's `.default`.
const AjvClass = Ajv.default ?? Ajv;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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
