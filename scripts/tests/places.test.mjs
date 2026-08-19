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
import { execFileSync } from "node:child_process";
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

// ── the contract in the direction that matters: doc null => problems non-empty ──
// The suite above pins the converse (never a doc WITH problems). This half is
// the one Task 6 leans on: all three gate joins `return 0` on a null doc, so a
// null doc carrying ZERO problems is a gate that stopped checking while still
// exiting 0.

test("loadPlaces REPORTS a mirror that parses to a non-object, never returns a silent null", () => {
  for (const body of ["null", "[]", "123", '"hi"', "true"]) {
    const dir = mkdtempSync(join(tmpdir(), "places-shape-"));
    try {
      mkdirSync(join(dir, "maps"), { recursive: true });
      writeFileSync(join(dir, "maps/cluster1-geography.json"), body);
      const { doc, problems } = loadPlaces({ contentRoot: dir });
      assert.equal(doc, null, `mirror body ${body} was accepted as a doc`);
      assert.equal(problems.length, 1, `mirror body ${body}: ${JSON.stringify(problems)}`);
      assert.match(problems[0], /shape-invalid/, problems[0]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("resolveWorld REPORTS a partial descriptor, never throws (the Task 7 sheet.json path)", () => {
  const { spine, tree } = realTree();
  const full = {
    rootId: "n-atlas", zoneRoot: "n-cluster1", landIds: ["n-cluster1"], seaIds: ["n-westsea"],
    terrainPatchIds: ["n-eastern-hills"], mireIds: ["n-saltmire"],
    featureIds: { coast: "f-west-coast", river: "f-the-meltwash", iceEdge: "f-northern-ice-edge" },
  };
  // The full descriptor must still resolve — the guard may not reject the
  // shape Task 7 is about to commit into content/spine/sheet.json.
  const ok = resolveWorld({ spine, tree, descriptor: full });
  assert.deepEqual(ok.problems, []);
  assert.equal(canonStringify(ok.doc) + "\n", readFileSync(MIRROR, "utf8"));

  for (const key of ["zoneRoot", "featureIds", "mireIds", "terrainPatchIds"]) {
    const partial = { ...full };
    delete partial[key];
    const { doc, problems } = resolveWorld({ spine, tree, descriptor: partial });
    assert.equal(doc, null, `descriptor without ${key} produced a doc`);
    assert.ok(problems.some((p) => p.includes(key)), `${key}: ${JSON.stringify(problems)}`);
  }
  const { doc, problems } = resolveWorld({ spine, tree, descriptor: { ...full, featureIds: { coast: "f-west-coast" } } });
  assert.equal(doc, null);
  assert.ok(problems.some((p) => p.includes("featureIds.river")), JSON.stringify(problems));
});

test("resolveWorld REPORTS a non-array spine.edges, never throws", () => {
  // loadSpine only applies `?? []` to a null/absent edges.json, so an
  // edges.json holding {"edges": []} reaches the three .filter() calls.
  const { spine, tree } = realTree();
  const { doc, problems } = resolveWorld({ spine: { ...spine, edges: { edges: [] } }, tree });
  assert.equal(doc, null);
  assert.ok(problems.some((p) => p.includes("spine.edges")), JSON.stringify(problems));
});

test("resolveWorld REPORTS a tree that is not a built tree, never throws", () => {
  const { spine } = realTree();
  for (const tree of [null, {}, { byId: {}, childrenOf: {} }]) {
    const { doc, problems } = resolveWorld({ spine, tree });
    assert.equal(doc, null);
    assert.ok(problems.some((p) => p.includes("tree")), JSON.stringify(problems));
  }
});

// ── the three gate joins must still COUNT, not merely exit 0 ───────────────
// All three call sites `return 0` when the geography load fails, so a botched
// re-home silently disables the gate rather than failing it. These assert the
// printed record counts, which is the only signal that the join still joined.

function runFullGate(contentRoot) {
  try {
    return { code: 0, out: execFileSync(process.execPath,
      [join(ROOT, "scripts/check_content.mjs"), "--content-root", contentRoot],
      { encoding: "utf8" }) };
  } catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}

test("gate joins: the real content root still counts 10 zones, 1 town and its placements", () => {
  const r = runFullGate(CONTENT);
  assert.equal(r.code, 0, r.out);
  // The counts the gate printed BEFORE the re-home. If the join went dark,
  // every one of these drops to 0 while the gate still exits 0.
  assert.match(r.out, /content-gate: \d+ sheets, \d+ maps, \d+ story, [1-9]\d* placements, 10 zones, 1 towns, 44 nodes, 0 failures/);
});

// ── the no-throw contract, at the shape level ──────────────────────────────
// The existing "never throws" tests all break a subject's EXISTENCE, which the
// validation block guards. None of them broke a resolved node's SHAPE, which
// nothing guarded — so `resolveWorld` threw a raw TypeError on a node that
// loadSpine accepts. From Task 6 that throw lands inside check_content.mjs and
// skips finish(), taking every FAIL and the summary line with it.

test("resolveWorld REPORTS a node missing an optional block, never throws", () => {
  const { spine, tree } = realTree();
  // n-saltmire loads clean without `lore`; the assembly reads salt.lore.note.
  tree.byId.set("n-saltmire", { ...tree.byId.get("n-saltmire"), lore: undefined });
  const { doc, problems } = resolveWorld({ spine, tree });
  assert.equal(doc, null);
  assert.equal(problems.length, 1, JSON.stringify(problems));
  assert.match(problems[0], /^resolveWorld: threw while assembling the world document/, problems[0]);
});

test("the gate REPORTS a shape-broken spine node instead of dying without printing", () => {
  // The whole point: a throw here is not just an ugly failure, it is a gate
  // that stops checking. Assert the two things a throw destroys — a FAIL line,
  // and the `content-gate:` summary that only finish() prints.
  const dir = mkdtempSync(join(tmpdir(), "places-shape-"));
  try {
    cpSync(CONTENT, join(dir, "content"), { recursive: true });
    const node = join(dir, "content/spine/nodes/n-saltmire.json");
    const parsed = JSON.parse(readFileSync(node, "utf8"));
    delete parsed.lore;
    writeFileSync(node, JSON.stringify(parsed, null, 2));

    const r = runFullGate(join(dir, "content"));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /FAIL {2}geography: resolveWorld: threw while assembling/, r.out);
    assert.match(r.out, /content-gate: .* failures, .* warnings/, r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the gate FAILS rather than zeroing its counts when the document is null (Risk A2)", () => {
  // Plan Step 8(a): "confirm the gate FAILS rather than exiting 0 with zeroed
  // counts". A null document is the one input that zeroes every count — all
  // three joins `return 0` on it — so it must never be reachable without a
  // FAIL. Exercised through the mirror-fallback branch, which is the only
  // route to a null doc a fixture can actually build.
  const dir = mkdtempSync(join(tmpdir(), "places-null-"));
  try {
    // Real content, minus the spine, plus a mirror holding literal `null`:
    // enough of a root that the gate reaches the geography join at all.
    cpSync(CONTENT, join(dir, "content"), { recursive: true });
    rmSync(join(dir, "content/spine"), { recursive: true, force: true });
    writeFileSync(join(dir, "content/maps/cluster1-geography.json"), "null\n");

    const r = runFullGate(join(dir, "content"));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /FAIL {2}geography: .*(shape-invalid|reported no problem)/, r.out);
    // finish() still ran — the counts are zeroed, but loudly, not silently.
    assert.match(r.out, /content-gate: .* 0 zones, 0 towns, .* [1-9]\d* failures/, r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
