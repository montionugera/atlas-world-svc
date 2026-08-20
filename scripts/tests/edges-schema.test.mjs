// Plan B Task 3 — content/spine/edges.json has carried 20 edges and no schema
// since it was created: checkSpine passes `spine.edges` straight into gSpineNet
// with the comment "edges have no schema so spine.edges is passed through as-is"
// (check_content.mjs:1675-1677). This pins the four kinds, the three endpoint-ref
// shapes actually in use, and the closed `attrs` union, so Plan E's canon-leg
// re-fit cannot invent a fifth kind or a new ref shape by accident.
//
// SHAPE ONLY. G-NET owns endpoint resolution; G-CANON-LEG owns the distances.
//
// SCOPE NOTE: this task's file contract is the schema + this test. Wiring a
// G-EDGE-SCHEMA rule into scripts/check_content.mjs (plan Task 3 Step 4) is NOT
// in it, so the gate-level tests the plan sketches are deliberately absent —
// they would assert wiring that does not exist. Until that wiring lands, this
// file is the only thing holding edges.json to the schema.
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
const SCHEMA_PATH = join(ROOT, "content/schemas/spine-edge.schema.json");
const EDGES_PATH = join(ROOT, "content/spine/edges.json");

const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const EDGES = JSON.parse(readFileSync(EDGES_PATH, "utf8"));

function compile() {
  return new AjvClass({ allErrors: true }).compile(
    JSON.parse(readFileSync(SCHEMA_PATH, "utf8")),
  );
}

// A deep clone, so a mutation in one test cannot leak into another via the
// module-level EDGES array (node --test runs files in parallel but tests in a
// file share this module instance).
const clone = (v) => JSON.parse(JSON.stringify(v));
const anyOfKind = (kind) => clone(EDGES.find((e) => e.kind === kind));

test("all 20 committed edges validate", () => {
  const v = compile();
  assert.equal(EDGES.length, 20);
  for (const e of EDGES) assert.ok(v(e), `${e.id}: ${JSON.stringify(v.errors)}`);
});

test("the four kinds are present in the expected counts", () => {
  const n = {};
  for (const e of EDGES) n[e.kind] = (n[e.kind] ?? 0) + 1;
  assert.deepEqual(n, { road: 8, relay: 2, leg: 7, sealane: 3 });
  assert.deepEqual([...SCHEMA.properties.kind.enum].sort(), [
    "leg",
    "relay",
    "road",
    "sealane",
  ]);
});

// --- the discriminator ------------------------------------------------------

test("a leg carrying road geometry is rejected", () => {
  const v = compile();
  assert.equal(
    v({
      ...anyOfKind("leg"),
      points: [
        [0, 0],
        [1, 1],
      ],
    }),
    false,
  );
});

test("a leg carrying a road weight is rejected", () => {
  const v = compile();
  assert.equal(v({ ...anyOfKind("leg"), weight: "trunk" }), false);
});

test("a sealane carrying relay hops is rejected", () => {
  const v = compile();
  assert.equal(
    v({ ...anyOfKind("sealane"), via: [{ feature: "f-tower-02" }] }),
    false,
  );
});

test("a road with no weight is rejected", () => {
  const v = compile();
  const { weight, ...noWeight } = anyOfKind("road");
  assert.equal(v(noWeight), false);
});

test("a road with no points is rejected", () => {
  const v = compile();
  const { points, ...noPoints } = anyOfKind("road");
  assert.equal(v(noPoints), false);
});

test("a relay with no via is rejected", () => {
  const v = compile();
  const { via, ...noVia } = anyOfKind("relay");
  assert.equal(v(noVia), false);
});

test("an unknown kind is rejected", () => {
  const v = compile();
  assert.equal(v({ ...anyOfKind("leg"), kind: "ferry" }), false);
});

// The four if/then blocks each carry `required: ["kind"]`, so none of them can
// match vacuously on a kind-less document and impose its `then` on it. A
// kind-less edge must fail for the ONE honest reason: `kind` is required.
test("a kind-less edge fails on the missing discriminator, not on a vacuous then", () => {
  const v = compile();
  const { kind, ...noKind } = anyOfKind("road");
  assert.equal(v(noKind), false);
  const paths = v.errors.map((e) => e.params?.missingProperty);
  assert.ok(paths.includes("kind"), JSON.stringify(v.errors));
});

// --- endpoint refs ----------------------------------------------------------

test("all three committed endpoint-ref shapes are accepted", () => {
  const v = compile();
  const leg = anyOfKind("leg");
  for (const ref of [
    { node: "n-gildmark" },
    { feature: "f-tower-02" },
    { edge: "e-coastal-spur", atIndex: 2 },
  ]) {
    assert.ok(v({ ...leg, to: ref }), `${JSON.stringify(ref)}: ${JSON.stringify(v.errors)}`);
  }
});

test("an unknown endpoint ref shape is rejected", () => {
  const v = compile();
  assert.equal(v({ ...anyOfKind("leg"), to: { town: "n-gildmark" } }), false);
});

test("an endpoint ref with an extra key is rejected", () => {
  const v = compile();
  assert.equal(
    v({ ...anyOfKind("leg"), from: { node: "n-gildmark", atIndex: 0 } }),
    false,
  );
});

test("an edge-relative ref without its index is rejected", () => {
  const v = compile();
  assert.equal(v({ ...anyOfKind("leg"), to: { edge: "e-coastal-spur" } }), false);
});

test("a non-object endpoint ref is rejected", () => {
  const v = compile();
  assert.equal(v({ ...anyOfKind("leg"), to: "n-gildmark" }), false);
});

// --- via: an ARRAY of refs, which is what the file actually holds -----------

test("relay via is an array of endpoint refs, and an object via is rejected", () => {
  const v = compile();
  const relay = anyOfKind("relay");
  assert.ok(Array.isArray(relay.via), "the committed relay via is an array");
  assert.equal(v({ ...relay, via: { feature: "f-tower-02" } }), false);
  assert.equal(v({ ...relay, via: [] }), false);
  assert.equal(v({ ...relay, via: [{ town: "f-tower-02" }] }), false);
});

// --- closed key sets --------------------------------------------------------

test("an unknown top-level key is rejected", () => {
  const v = compile();
  assert.equal(v({ ...anyOfKind("leg"), colour: "red" }), false);
});

test("an unknown attrs key is rejected", () => {
  const leg = anyOfKind("leg");
  const v = compile();
  assert.equal(v({ ...leg, attrs: { ...leg.attrs, tollFee: 3 } }), false);
});

// The schema is only worth having if it tracks the file. Every attrs key any
// committed edge carries must be DECLARED — otherwise additionalProperties:false
// would already have failed the first test, but this names the drift directly.
test("every attrs key the committed edges carry is declared in the schema", () => {
  const declared = new Set(Object.keys(SCHEMA.properties.attrs.properties));
  const used = new Set();
  for (const e of EDGES) for (const k of Object.keys(e.attrs ?? {})) used.add(k);
  assert.deepEqual([...used].filter((k) => !declared.has(k)), []);
  // and nothing declared that no edge uses — the union stays closed both ways.
  assert.deepEqual([...declared].filter((k) => !used.has(k)), []);
});

// --- value shapes the census found and the plan's draft schema got wrong ----

test("attrs nulls are legal where the corpus states no figure", () => {
  const v = compile();
  const road = anyOfKind("road");
  assert.ok(
    v({ ...road, attrs: { ...road.attrs, roadKm: null, hours: null, hoursLabel: null } }),
    JSON.stringify(v.errors),
  );
});

test("throughRoute is a closed object, not a string", () => {
  const v = compile();
  const road = anyOfKind("road");
  assert.ok(
    v({ ...road, attrs: { ...road.attrs, throughRoute: { to: "gildmark", roadKm: 19, hours: 1.5 } } }),
    JSON.stringify(v.errors),
  );
  assert.equal(v({ ...road, attrs: { ...road.attrs, throughRoute: "gildmark" } }), false);
  assert.equal(
    v({ ...road, attrs: { ...road.attrs, throughRoute: { to: "gildmark", detour: true } } }),
    false,
  );
});

// The plan's draft schema typed these two as ["number","string"]. The committed
// file holds canonHours as a string on all 7 legs and sailDays as a number on
// all 3 sealanes, so the union is closed to what is there — which also keeps
// ajv's strictTypes quiet when the gate compiles this schema.
test("canonHours and sailDays are closed to the type the file actually holds", () => {
  const v = compile();
  const leg = anyOfKind("leg");
  assert.equal(typeof leg.attrs.canonHours, "string");
  assert.equal(v({ ...leg, attrs: { ...leg.attrs, canonHours: 12 } }), false);
  const lane = clone(EDGES.find((e) => e.kind === "sealane" && "sailDays" in e.attrs));
  assert.equal(typeof lane.attrs.sailDays, "number");
  assert.equal(v({ ...lane, attrs: { ...lane.attrs, sailDays: "twelve" } }), false);
});

test("a weight outside the three-value enum is rejected", () => {
  const v = compile();
  assert.equal(v({ ...anyOfKind("road"), weight: "motorway" }), false);
  assert.equal(v({ ...anyOfKind("road"), weight: 7 }), false);
});

test("an id outside the e-<kebab> pattern is rejected", () => {
  const v = compile();
  for (const id of ["trade-road-trunk", "e-Trade-Road", "e_trade_road", "e-", "e-trade--road"]) {
    assert.equal(v({ ...anyOfKind("leg"), id }), false, id);
  }
});

test("a points ring of non-pairs is rejected", () => {
  const v = compile();
  const road = anyOfKind("road");
  assert.equal(v({ ...road, points: [[0, 0, 0], [1, 1, 1]] }), false);
  assert.equal(v({ ...road, points: [[0, 0]] }), false);
  assert.equal(v({ ...road, points: [["0", "0"], [1, 1]] }), false);
});

test("labelAtIndex must be a non-negative integer", () => {
  const v = compile();
  const road = anyOfKind("road");
  assert.equal(v({ ...road, attrs: { ...road.attrs, labelAtIndex: -1 } }), false);
  assert.equal(v({ ...road, attrs: { ...road.attrs, labelAtIndex: 1.5 } }), false);
});

test("the schema declares its $id so a future $ref can name it", () => {
  assert.equal(SCHEMA.$id, "spine-edge.schema.json");
  assert.equal(SCHEMA.$schema, "http://json-schema.org/draft-07/schema#");
  assert.equal(SCHEMA.additionalProperties, false);
});
