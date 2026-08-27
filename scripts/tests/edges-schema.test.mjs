// Plan B Task 3 — content/spine/edges.json has carried 20 edges and no schema
// since it was created: checkSpine passes `spine.edges` straight into gSpineNet
// with the comment "edges have no schema so spine.edges is passed through as-is"
// (check_content.mjs:1675-1677). This pins the four kinds, the three endpoint-ref
// shapes actually in use, and the closed `attrs` union, so Plan E's canon-leg
// re-fit cannot invent a fifth kind or a new ref shape by accident.
//
// SHAPE ONLY. G-NET owns endpoint resolution; G-CANON-LEG owns the distances.
//
// (An earlier revision of this file carried a SCOPE NOTE claiming Task 3's file
// contract was "the schema + this test" and that wiring G-EDGE-SCHEMA into
// scripts/check_content.mjs was outside it. That was FALSE: the plan's Task 3
// Files block names `Modify: scripts/check_content.mjs` on its second line. The
// wiring landed in the fix pass and the gate-level tests below are the plan's
// mandated Step 1 tests, restored.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { TRUNK_EDGES, EDGES_BY_KIND, TRUNK_NODES } from "./helpers/census.mjs";

// Same ESM/CJS interop guard as scripts/lib/story.mjs:11 — `ajv` is CJS, so
// under ESM the constructor may arrive as the module namespace's `.default`.
const AjvClass = Ajv.default ?? Ajv;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");
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
const anyOfKind = (kind) => {
  const found = EDGES.find((e) => e.kind === kind);
  assert.ok(found, `no committed edge of kind "${kind}" — use a synthetic sample instead`);
  return clone(found);
};

// Plan E Task 6 Step 6b ruling 1 RETIRED both relays (`e-trunk-chain`,
// `e-flat-chain`): they chained `f-tower-*` features, and no tower survives the
// redraw. `relay` is STILL a declared kind in spine-edge.schema.json (:49) with
// its own `if/then` branch (:101), so its rules must stay armed — dropping the
// relay tests along with the relay edges would leave that branch untested and
// free to rot. The sample below is a minimal, schema-valid relay, kept here
// rather than read from the corpus for exactly that reason.
const SYNTHETIC_RELAY = Object.freeze({
  id: "e-synthetic-relay",
  kind: "relay",
  from: { feature: "f-town-gildmark" },
  to: { feature: "f-town-netstead" },
  via: [{ feature: "f-town-tallowquay" }],
  attrs: { note: "synthetic fixture — no relay survives the redraw (ruling 1)" },
});
const relaySample = () => clone(SYNTHETIC_RELAY);

// COUNTS COME FROM content/spine/trunk-census.json (Plan E, E-C4) — that file is
// the authority on the trunk's size and shape, so the next redraw updates ONE
// file instead of a scatter of literals.
test("every committed edge validates, and there are as many as the census says", () => {
  const v = compile();
  assert.equal(EDGES.length, TRUNK_EDGES,
    `edges.json holds ${EDGES.length}, content/spine/trunk-census.json says ${TRUNK_EDGES}`);
  for (const e of EDGES) assert.ok(v(e), `${e.id}: ${JSON.stringify(v.errors)}`);
});

test("the four kinds are present in the expected counts", () => {
  const n = {};
  for (const e of EDGES) n[e.kind] = (n[e.kind] ?? 0) + 1;
  // Census authority again: content/spine/trunk-census.json `edges.byKind`.
  assert.deepEqual(n, EDGES_BY_KIND);
  // The schema's ENUM is deliberately NOT census-derived: `relay` stays a legal
  // kind with a live if/then branch even though ruling 1 retired both relay
  // edges. A kind vanishing from this list is a schema change, not a redraw.
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
  const { via, ...noVia } = relaySample();
  assert.ok(v(relaySample()), `the synthetic relay must itself be valid: ${JSON.stringify(v.errors)}`);
  assert.equal(v(noVia), false);
});

test("an unknown kind is rejected", () => {
  const v = compile();
  assert.equal(v({ ...anyOfKind("leg"), kind: "ferry" }), false);
});

// The four if/then blocks each carry `required: ["kind"]`, so none of them can
// match vacuously on a kind-less document and impose its `then` on it.
//
// REVIEW FIX (was a tautology): the earlier version of this test asserted only
// that the errors on a kind-less doc include `missingProperty: "kind"`. The
// ROOT `required` already contains `kind`, so that assertion held no matter
// what the four `if`s did — deleting `required: ["kind"]` from all four of
// them, and even deleting the whole `allOf`, left it green. What the guard
// actually buys is the ABSENCE of the `then`-imposed errors, so that is what
// is measured now: with the guard, a kind-less road produces exactly one
// missing-property error (`kind`); without it, all four `if`s match vacuously
// and `relay`'s `then` demands `via` while `leg`/`sealane`'s `then` forbid the
// `points`/`weight`/`dashed` the document still carries.
test("a kind-less edge fails on the missing discriminator, not on a vacuous then", () => {
  const v = compile();
  const { kind, ...noKind } = anyOfKind("road");
  assert.equal(v(noKind), false);
  const missing = v.errors.map((e) => e.params?.missingProperty).filter(Boolean);
  assert.deepEqual(missing, ["kind"],
    `only the root's own \`kind\` may be reported — a vacuous then leaked: ${JSON.stringify(v.errors)}`);
  assert.deepEqual(v.errors.filter((e) => e.keyword === "not"), [],
    `a vacuous then imposed a \`not\` on a kind-less doc: ${JSON.stringify(v.errors)}`);
  assert.equal(v.errors.length, 1, JSON.stringify(v.errors));
});

// MA-5: the conditional requireds were covered, the unconditional ones were
// not — root `required` could be cut to ["kind"] with the suite green. A
// missing `to` is the corruption that used to CRASH gSpineNet (see the gate
// tests at the foot of this file), so it is the one worth pinning most.
test("every unconditionally-required top-level key is required", () => {
  assert.deepEqual([...SCHEMA.required].sort(), ["attrs", "from", "id", "kind", "to"]);
  const v = compile();
  for (const key of ["id", "kind", "from", "to", "attrs"]) {
    const doc = anyOfKind("road");
    delete doc[key];
    assert.equal(v(doc), false, `an edge with no \`${key}\` must be rejected`);
    assert.ok(
      v.errors.some((e) => e.keyword === "required" && e.params?.missingProperty === key),
      `${key}: ${JSON.stringify(v.errors)}`,
    );
  }
});

// MINOR-4: `dashed` is a road-only key on all 20 committed edges (8 roads carry
// it, nothing else does), but it was the one road key the three non-road
// branches forgot to exclude, while `points`/`weight`/`via` were all excluded.
test("dashed is road-only — the other three kinds reject it", () => {
  const v = compile();
  for (const e of EDGES) assert.equal("dashed" in e, e.kind === "road", e.id);
  for (const sample of [relaySample(), anyOfKind("leg"), anyOfKind("sealane")])
    assert.equal(v({ ...sample, dashed: true }), false, `${sample.kind} must reject dashed`);
  assert.ok(v(anyOfKind("road")), "a road still carries dashed legitimately");
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
  const relay = relaySample();
  assert.ok(Array.isArray(relay.via), "a relay via is an array");
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

// --- G-EDGE-SCHEMA at the GATE (plan Task 3 Step 1's mandated tests) --------
//
// A schema nothing compiles protects nothing. These spawn the real gate over a
// copy of content/, which is the only thing that can tell the wiring apart
// from a schema file sitting inertly in the tree. Measured before the wiring
// landed: `kind: "ferry"` passed --only=spine with 0 failures, an unknown
// `attrs` key passed, a leg carrying road `points` passed, and a missing `to`
// CRASHED the gate outright.

function realRoot(t) {
  const dir = mkdtempSync(join(tmpdir(), "edges-schema-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(ROOT, "content"), dir, { recursive: true });
  return dir;
}
// The committed root's warning count moved 19 -> 25 when Plan C Task 13
// committed content/world/fabric/ into it, then 25 -> 21 when Plan E's
// WATER_TIERS skip (E-C2) stopped the childless oceans warning, and now
// 21 -> 8 on the redrawn trunk. The 8 are the world layer describing itself,
// not drift: FIVE declared supply-limited surveyed regions (G-POI,
// budgets.json poi.supplyLimitedSurveyedRegions), ONE G-LANDFORM line naming
// the lexicon type no premise kit can place (sub-lacustrine-vent), and TWO
// G-SPINE-COMPLETE lines for the surviving alias-anchor regions n-thornveil /
// n-northern-icefield, which by E-C4 are the only two region NODES left and
// are deliberately childless. The count is asserted rather than ignored for
// the reason the header already gives: a gate that stopped checking also
// exits 0.
//
// This one is NOT census-derived and is re-pinned in place on purpose: it is a
// gate-BEHAVIOUR golden (which rules warn on this corpus), not a function of
// how many nodes the trunk holds. The node count beside it IS census-derived
// and is read from content/spine/trunk-census.json.
const SPINE_WARNINGS = 8;
const counts = (failures) =>
  new RegExp(`${TRUNK_NODES} nodes, ${failures} failures, ${SPINE_WARNINGS} warnings`);
function runGate(dir) {
  try {
    return { code: 0, out: execFileSync(process.execPath,
      [GATE, "--only=spine", "--content-root", dir], { encoding: "utf8" }) };
  } catch (e) { return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}
function writeEdges(dir, mutate) {
  const p = join(dir, "spine/edges.json");
  const edges = JSON.parse(readFileSync(p, "utf8"));
  mutate(edges);
  writeFileSync(p, JSON.stringify(edges, null, 2));
}

test("the real content root is green under the wired-in validation", (t) => {
  const r = runGate(realRoot(t));
  assert.equal(r.code, 0, r.out);
  // Trap 3: assert the printed record counts, never just exit 0 — a gate that
  // stopped checking also exits 0.
  assert.match(r.out, counts(0), r.out);
  assert.doesNotMatch(r.out, /G-EDGE-SCHEMA/);
});

test("the gate reports G-EDGE-SCHEMA on a malformed edge", (t) => {
  const dir = realRoot(t);
  writeEdges(dir, (edges) => { edges[0].weight = 7; }); // weight is an enum of three strings
  const r = runGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-EDGE-SCHEMA: spine\/edges\.json\[0\]/, r.out);
});

// The three corruption classes the reviewers measured as invisible to every
// gate. Named individually so a regression says WHICH one came back.
for (const [name, mutate, needle] of [
  ["a fifth kind", (E) => { E[0].kind = "ferry"; }, /\[0\] \(e-trade-road-trunk\): \/kind must be equal to one of the allowed values/],
  ["an unknown attrs key", (E) => { E[0].attrs.tollFee = 3; }, /\[0\] \(e-trade-road-trunk\): \/attrs must NOT have additional properties/],
  ["a leg smuggling road geometry", (E) => { E[E.findIndex((e) => e.kind === "leg")].points = [[0, 0], [1, 1]]; }, /G-EDGE-SCHEMA: spine\/edges\.json\[\d+\] \(e-leg-/],
]) {
  test(`the gate catches ${name}`, (t) => {
    const dir = realRoot(t);
    writeEdges(dir, mutate);
    const r = runGate(dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, needle, r.out);
  });
}

// Brief trap 6 — "gate functions never throw; an uncaught throw skips finish()
// and silently drops every failure recorded before it." An edge with no `to`
// used to reach gSpineNet's rootPoint and die on
// `TypeError: Cannot read properties of undefined (reading 'node')`, taking the
// whole report with it. G-EDGE-SCHEMA filters the edge out of validEdges, so
// the gate now reports and REACHES finish().
test("a `to`-less edge is one clean failure, not a crash", (t) => {
  const dir = realRoot(t);
  writeEdges(dir, (E) => { delete E[0].to; });
  const r = runGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-EDGE-SCHEMA: spine\/edges\.json\[0\] \(e-trade-road-trunk\): \/ must have required property 'to'/, r.out);
  assert.doesNotMatch(r.out, /TypeError/, "the gate must not throw");
  // finish() ran: the record counts printed, which is what a crash suppresses.
  assert.match(r.out, counts(1), r.out);
});

test("a content root with no edges.json is still green (soft-skip)", (t) => {
  const dir = realRoot(t);
  rmSync(join(dir, "spine/edges.json"));
  const r = runGate(dir);
  assert.doesNotMatch(r.out, /G-EDGE-SCHEMA/, r.out);
  assert.doesNotMatch(r.out, /spine-edge schema/, r.out);
});

// The plan's Step 4 text says a MISSING schema file should be one clean `fail`.
// That is wrong against this tree and was corrected: two live callers build a
// content root that has edges.json and copies only spine-node.schema.json —
// spine-gates.test.mjs's p4FixtureRoot and tools/mapforge/gen-world.mjs — and
// failing on the absent file reds both. Pinned as a test so the "correct" the
// plan asks for cannot be reapplied without seeing what it costs.
test("a content root with edges but no edge schema soft-skips (plan Step 4 corrected)", (t) => {
  const dir = realRoot(t);
  rmSync(join(dir, "schemas/spine-edge.schema.json"));
  const r = runGate(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, counts(0), r.out);
  assert.doesNotMatch(r.out, /spine-edge schema/, r.out);
});

// ...but a schema that IS present and unreadable is a clean in-band failure,
// never a crash, and finish() still prints.
test("an unparsable edge schema fails in-band and still reaches finish()", (t) => {
  const dir = realRoot(t);
  writeFileSync(join(dir, "schemas/spine-edge.schema.json"), "{ not json");
  const r = runGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /spine-edge schema: cannot read\/parse/, r.out);
  assert.doesNotMatch(r.out, /SyntaxError|TypeError/, r.out);
  assert.match(r.out, counts(1), r.out);
});

// The soft-skip on an absent schema means a DELETED content/schemas/
// spine-edge.schema.json would silently turn the gate off. This is the guard
// that makes that loud: the schema is a committed artifact of the real root.
test("the edge schema is committed in the real content root", () => {
  assert.ok(SCHEMA.$id === "spine-edge.schema.json" && Array.isArray(SCHEMA.allOf),
    "content/schemas/spine-edge.schema.json must exist and be the discriminated schema");
});
