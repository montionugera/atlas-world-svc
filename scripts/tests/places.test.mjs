// Plan A Task 5 — scripts/lib/places.mjs.
//
// The ONE assertion that matters is byte-identity: canonStringify over
// resolveWorld's doc must equal the committed content/maps/cluster1-geography.json
// EXACTLY. Everything downstream (three gate joins, two sheet builders) is
// only safe to re-point because of it, and key ORDER is half of it —
// canonStringify walks Object.keys() in insertion order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpine, buildTree } from "../lib/spine.mjs";
import { canonStringify } from "../check_spine_emit.mjs";
import { WORLD_DOC_KEYS, resolveWorld, loadPlaces } from "../lib/places.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT = join(ROOT, "content");
const MIRROR = join(CONTENT, "maps/cluster1-geography.json");

function realTree() {
  const spine = loadSpine({ contentRoot: CONTENT });
  return { spine, tree: buildTree({ nodes: spine.nodes, rootIds: spine.roots }) };
}

test("resolveWorld reproduces the committed mirror BYTE for BYTE", () => {
  const { spine, tree } = realTree();
  const { doc, problems } = resolveWorld({ spine, tree });
  assert.deepEqual(problems, []);
  assert.equal(canonStringify(doc) + "\n", readFileSync(MIRROR, "utf8"));
});

test("resolveWorld builds the doc in the pinned key order", () => {
  const { spine, tree } = realTree();
  const { doc } = resolveWorld({ spine, tree });
  assert.deepEqual(Object.keys(doc), WORLD_DOC_KEYS);
  assert.equal(WORLD_DOC_KEYS.length, 19);
});

test("resolveWorld REPORTS a missing subject node, never throws (the C2 TypeError)", () => {
  const { spine, tree } = realTree();
  tree.byId.delete("n-saltmire");
  const { doc, problems } = resolveWorld({ spine, tree });
  assert.equal(doc, null);
  assert.ok(
    problems.some((p) => p.includes("n-saltmire")),
    `expected a problem naming n-saltmire, got ${JSON.stringify(problems)}`,
  );
});

test("resolveWorld REPORTS a missing subject feature, never throws", () => {
  const { spine, tree } = realTree();
  const cluster = tree.byId.get("n-cluster1");
  tree.byId.set("n-cluster1", { ...cluster, features: cluster.features.filter((f) => f.id !== "f-west-coast") });
  const { doc, problems } = resolveWorld({ spine, tree });
  assert.equal(doc, null);
  assert.ok(problems.some((p) => p.includes("f-west-coast")), JSON.stringify(problems));
});

test("resolveWorld REPORTS a missing zoneRoot without a cascade of feature problems", () => {
  const { spine, tree } = realTree();
  tree.byId.delete("n-cluster1");
  const { doc, problems } = resolveWorld({ spine, tree });
  assert.equal(doc, null);
  assert.ok(problems.some((p) => p.includes("n-cluster1")), JSON.stringify(problems));
});

test("resolveWorld REPORTS the Plan D fabric/civil joins it cannot do", () => {
  const { spine, tree } = realTree();
  const { doc, problems } = resolveWorld({ spine, tree, fabric: {} });
  assert.equal(doc, null);
  assert.ok(problems.some((p) => p.includes("Plan D")), JSON.stringify(problems));
});

test("resolveWorld never returns a doc alongside problems (the seaLane late-push path)", () => {
  // seaLane is the ONLY subject resolved during doc construction, i.e. after
  // the early return. A half-built doc escaping with problems attached would
  // be re-pointed straight into two sheet builders in Task 6.
  const { spine, tree } = realTree();
  const noLane = { ...spine, edges: spine.edges.filter((e) => e.kind !== "sealane") };
  const { doc, problems } = resolveWorld({ spine: noLane, tree });
  assert.equal(doc, null);
  assert.ok(problems.some((p) => p.includes("sealane")), JSON.stringify(problems));
});

test("loadPlaces on the real content root resolves from the SPINE and matches the mirror", () => {
  const { doc, problems } = loadPlaces({ contentRoot: CONTENT });
  assert.deepEqual(problems, []);
  assert.equal(canonStringify(doc) + "\n", readFileSync(MIRROR, "utf8"));
});

test("loadPlaces FALLS BACK to the mirror file when the root has no spine (the fixture path)", () => {
  // zone-content.test.mjs, town-plan.test.mjs and bestiary-placement.test.mjs
  // all build exactly this shape: a maps/ dir, no spine/ dir. Without the
  // fallback, ~60 gate tests go dark (all three joins `return 0` on a failed
  // load, so the gate would silently stop counting rather than fail).
  const dir = mkdtempSync(join(tmpdir(), "places-fallback-"));
  try {
    mkdirSync(join(dir, "maps"), { recursive: true });
    const fixture = { id: "x", zones: [{ id: "z1" }], towns: [{ id: "t1" }], camps: [], roads: [] };
    writeFileSync(join(dir, "maps/cluster1-geography.json"), JSON.stringify(fixture));
    const { doc, problems } = loadPlaces({ contentRoot: dir });
    assert.deepEqual(problems, []);
    assert.deepEqual(doc.zones, [{ id: "z1" }]);
    assert.deepEqual(doc.towns, [{ id: "t1" }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadPlaces REPORTS an unparsable mirror, never throws", () => {
  const dir = mkdtempSync(join(tmpdir(), "places-bad-"));
  try {
    mkdirSync(join(dir, "maps"), { recursive: true });
    writeFileSync(join(dir, "maps/cluster1-geography.json"), "{ not json");
    const { doc, problems } = loadPlaces({ contentRoot: dir });
    assert.equal(doc, null);
    assert.equal(problems.length, 1);
    assert.ok(problems[0].startsWith("geography: "), problems[0]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadPlaces on an empty root returns doc null and one problem, never throws", () => {
  const dir = mkdtempSync(join(tmpdir(), "places-empty-"));
  try {
    const { doc, problems } = loadPlaces({ contentRoot: dir });
    assert.equal(doc, null);
    assert.equal(problems.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadPlaces prefers the SPINE over a stale mirror on a root that has both", () => {
  const dir = mkdtempSync(join(tmpdir(), "places-both-"));
  try {
    cpSync(join(CONTENT, "spine"), join(dir, "spine"), { recursive: true });
    cpSync(join(CONTENT, "towns"), join(dir, "towns"), { recursive: true });
    mkdirSync(join(dir, "maps"), { recursive: true });
    writeFileSync(join(dir, "maps/cluster1-geography.json"), JSON.stringify({ zones: [], towns: [] }));
    const { doc, problems } = loadPlaces({ contentRoot: dir });
    assert.deepEqual(problems, []);
    assert.ok(doc.zones.length > 0, "fell back to the stale mirror instead of resolving the spine");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadPlaces falls back to the mirror when the spine is present but BROKEN", () => {
  // A spine dir that loads with errors must not yield a half-built doc: the
  // spine branch has to fall THROUGH to the mirror, not return early.
  const dir = mkdtempSync(join(tmpdir(), "places-broken-spine-"));
  try {
    mkdirSync(join(dir, "spine/nodes"), { recursive: true });
    writeFileSync(join(dir, "spine/roots.json"), "{ not json");
    mkdirSync(join(dir, "maps"), { recursive: true });
    writeFileSync(join(dir, "maps/cluster1-geography.json"), JSON.stringify({ zones: [{ id: "z1" }] }));
    const { doc, problems } = loadPlaces({ contentRoot: dir });
    assert.deepEqual(problems, []);
    assert.deepEqual(doc.zones, [{ id: "z1" }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
