import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const NODES = join(ROOT, "content/spine/nodes");
const CENSUS = JSON.parse(readFileSync(join(ROOT, "content/spine/trunk-census.json"), "utf8"));

function tally() {
  const byTier = {};
  const ids = [];
  for (const f of readdirSync(NODES).filter((n) => n.endsWith(".json")).sort()) {
    const n = JSON.parse(readFileSync(join(NODES, f), "utf8"));
    byTier[n.tier] = (byTier[n.tier] ?? 0) + 1;
    ids.push(n.id);
  }
  return { byTier, ids };
}

test("the trunk matches its committed census exactly", () => {
  const { byTier, ids } = tally();
  assert.equal(
    ids.length,
    CENSUS.expected,
    `trunk holds ${ids.length} nodes, census says ${CENSUS.expected}`,
  );
  assert.deepEqual(byTier, CENSUS.byTier);
});

test("the census sums to its own expected total", () => {
  const sum = Object.values(CENSUS.byTier).reduce((a, b) => a + b, 0);
  assert.equal(
    sum,
    CENSUS.expected,
    `census byTier sums to ${sum} but expected is ${CENSUS.expected} — the census must be arithmetically closed before it can be an authority`,
  );
});

test("every census line carries a written reason", () => {
  for (const tier of Object.keys(CENSUS.byTier))
    assert.equal(
      typeof CENSUS.why[tier],
      "string",
      `census tier "${tier}" has no why — a node count nobody can justify is a node count nobody will defend`,
    );
});

test("the census names no tier the trunk does not carry", () => {
  const { byTier } = tally();
  for (const tier of Object.keys(CENSUS.why))
    assert.ok(
      Object.prototype.hasOwnProperty.call(byTier, tier),
      `census explains tier "${tier}" but no committed node carries it`,
    );
});

test("the two alias anchors survive — two representsNodeId pointers depend on them (X2)", () => {
  const { ids } = tally();
  for (const id of ["n-thornveil", "n-northern-icefield"])
    assert.ok(
      ids.includes(id),
      `${id} is the target of a runtime representsNodeId pointer; spine.mjs:875-877 hard-FAILs G-ALIAS if it vanishes`,
    );
});

test("the one committed town plan's spineId host survives", () => {
  const plan = JSON.parse(readFileSync(join(ROOT, "content/towns/town-millcross.json"), "utf8"));
  assert.ok(tally().ids.includes(plan.spineId));
});

test("the trunk fits the load budget", () => {
  const budget = JSON.parse(readFileSync(join(ROOT, "content/spine/load-budget.json"), "utf8"));
  assert.ok(tally().ids.length <= budget.maxNodes);
});

test("the edge census matches the committed edge list", () => {
  const doc = JSON.parse(readFileSync(join(ROOT, "content/spine/edges.json"), "utf8"));
  const edges = Array.isArray(doc) ? doc : doc.edges;
  const byKind = {};
  for (const e of edges) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  assert.equal(
    edges.length,
    CENSUS.edges.expected,
    `edges.json holds ${edges.length} edges, census says ${CENSUS.edges.expected}`,
  );
  assert.deepEqual(byKind, CENSUS.edges.byKind);
  const sum = Object.values(CENSUS.edges.byKind).reduce((a, b) => a + b, 0);
  assert.equal(sum, CENSUS.edges.expected, "the edge census must be arithmetically closed too");
});

// ── `bands` is EMPTY, and stays empty until someone decides what it means ───
//
// generate-world.mjs's preserved-node block spreads `...rest` and asserts, in
// a COMMENT, that "nothing else in the doc is parent-frame" — the licence on
// which `lore.labelAt` was singled out as the one field that must ride along
// with a moved placement. `bands` is inside that spread and is the one field
// the claim cannot be checked against: spine-node.schema.json declares it
// `{ "type": "array" }` with no item shape, nothing in scripts/ or tools/
// reads it, and the generator writes `bands: []` on every node it makes.
//
// So the claim holds today only because the field is empty. If a band ever
// carries coordinates it is very likely PARENT-FRAME — bands are level/extent
// ranges over a parent's ground — and it would be carried across a
// re-placement untranslated, silently, exactly the way labelAt was
// (G-LABEL-FRAME exists because that already happened once). This test is the
// tripwire: populate `bands` and you must come back to
// generate-world.mjs's frame classification and decide, rather than inherit a
// stale-frame bug with every gate green.
test("no committed node populates `bands` — the frame claim depends on it", () => {
  const bad = [];
  for (const f of readdirSync(NODES).filter((n) => n.endsWith(".json")).sort()) {
    const n = JSON.parse(readFileSync(join(NODES, f), "utf8"));
    if (!("bands" in n)) continue;
    if (!Array.isArray(n.bands))
      bad.push(`${n.id}: bands is ${n.bands === null ? "null" : typeof n.bands}, not an array`);
    else if (n.bands.length) bad.push(`${n.id}: bands carries ${n.bands.length} entr(y|ies)`);
  }
  assert.deepEqual(
    bad,
    [],
    "generate-world.mjs's preserved-node pass spreads `...rest` and claims in a comment that " +
      "nothing but `lore.labelAt` is parent-frame. `bands` is schema-unconstrained, unread, and " +
      "empty on every node, which is the only reason that claim is safe. It is no longer empty:\n" +
      bad.join("\n") +
      "\nGo re-classify the field's frame in tools/mapforge/generate-world.mjs before shipping it.",
  );
});
