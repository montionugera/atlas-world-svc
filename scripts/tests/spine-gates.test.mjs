import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpine, TIER_DEPTH, buildTree, deriveNode } from "../lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");
const FIXTURES = join(ROOT, "scripts/tests/fixtures/spine");
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "content/schemas/spine-node.schema.json"), "utf8"));

// Build a disposable content root from a committed fixture's spine/ plus the
// REAL schema (the schema under test is the shipped one, never a copy that
// can drift).
export function contentRootFor(fixture) {
  const dir = mkdtempSync(join(tmpdir(), "spine-gate-"));
  mkdirSync(join(dir, "schemas"), { recursive: true });
  cpSync(join(ROOT, "content/schemas/spine-node.schema.json"), join(dir, "schemas/spine-node.schema.json"));
  cpSync(join(FIXTURES, fixture, "spine"), join(dir, "spine"), { recursive: true });
  return dir;
}

export function runGate(contentRoot) {
  try {
    const stdout = execFileSync(process.execPath, [GATE, "--content-root", contentRoot, "--only=spine"], { encoding: "utf8" });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: (e.stdout ?? "").toString() };
  }
}

// ── schema discipline (the town-plan.test.mjs:105-118 pin, applied here) ───
test("spine-node schema declares no minimum/maximum anywhere — the G-* gates own every floor", () => {
  const found = [];
  (function walk(node, path) {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
    for (const [k, v] of Object.entries(node)) {
      if (k === "minimum" || k === "maximum" || k === "exclusiveMinimum" || k === "exclusiveMaximum")
        found.push(`${path}.${k}`);
      walk(v, `${path}.${k}`);
    }
  })(SCHEMA, "$");
  assert.deepEqual(found, [], `numeric bounds belong in the gate, not the schema: ${found.join(", ")}`);
});

test("spine-node schema is draft-07 with an $id", () => {
  assert.equal(SCHEMA.$schema, "http://json-schema.org/draft-07/schema#");
  assert.equal(typeof SCHEMA.$id, "string");
});

// ── the committed table parses and joins ───────────────────────────────────
// Task 1.3 transcribed the 12 cluster-1 regions (10 zones + n-saltmire +
// n-eastern-hills, HC-3: cluster 1 has 12 children, not 10), growing the
// table from 4 to 16 nodes. Task 1.4 transcribed the 6 towns + the
// expedition camp (tier town, depth 3, under their region parents), growing
// the table from 16 to 23 nodes. Ids come back sorted (loadSpine reads the
// directory sorted), so the 7 new n-* ids interleave with the existing 16.
test("the committed 23-node table loads clean: 2 roots, depths legal, no load errors", () => {
  const spine = loadSpine({ contentRoot: join(ROOT, "content") });
  assert.equal(spine.present, true);
  assert.deepEqual(spine.errors, []);
  assert.deepEqual(spine.nodes.map((n) => n.id), [
    "n-ashvale-front", "n-atlas", "n-cindervast-town", "n-cindervast", "n-cluster1",
    "n-eastern-hills", "n-emberdown", "n-embervale", "n-expedition-camp",
    "n-gildmark-head", "n-gildmark", "n-hollowmarch", "n-meltwash-terrace",
    "n-millcross-ford", "n-millcross", "n-norhollow", "n-northern-icefield",
    "n-playroot", "n-rooktide-reach", "n-rooktide", "n-saltmire", "n-thornveil",
    "n-westsea",
  ]);
  assert.deepEqual(spine.roots, ["n-atlas", "n-playroot"]);
  // Task 1.10: these were Phase-0 placeholders (48 / 4) until G-LOAD-BUDGET
  // and G-COMP-REPORT existed to enforce them; real values as of the 23-node
  // table (real UNCHECKED today: n-atlas, n-playroot).
  assert.deepEqual(spine.budgets.load, { maxNodes: 40, maxBytes: 262144 });
  assert.deepEqual(spine.budgets.coverage, { maxUnchecked: 2 });
  for (const n of spine.nodes) assert.equal(typeof TIER_DEPTH[n.tier], "number", n.id);
});

import { mkdtempSync as mkdtemp2 } from "node:fs";

test("soft-skip: a content root with NO spine/ (and no schema) exits 0 — skip happens BEFORE schema compile", () => {
  const dir = mkdtemp2(join(tmpdir2(), "spine-skip-"));
  const { code, stdout } = runGate(dir);
  assert.equal(code, 0, stdout);
  assert.match(stdout, /0 failures/);
});
// helper import for the test above
import { tmpdir as tmpdir2 } from "node:os";

test("HC-2 G-ID red: duplicate id across two files", () => {
  const { code, stdout } = runGate(contentRootFor("g-id-duplicate-id"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-ID: duplicate id "n-atlas"/);
});

test("HC-2 G-PARENT red: a depth-0 node not listed in roots.json", () => {
  const { code, stdout } = runGate(contentRootFor("g-parent-root-not-listed"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-PARENT: root n-rogue is not listed in roots\.json/);
});

test("HC-2 G-TREE red: a two-node parent cycle", () => {
  const { code, stdout } = runGate(contentRootFor("g-tree-cycle"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-TREE: cycle detected through n-loop-/);
  assert.match(stdout, /unreachable from any root/);
});

test("HC-2 G-DEPTH red: a town (depth 3) under a continent (depth 1)", () => {
  const { code, stdout } = runGate(contentRootFor("g-depth-town-under-continent"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-DEPTH: n-oops-town \(town, depth 3\) under n-shore \(continent, depth 1\)/);
});

test("HC-2 G-POLY red: a clockwise ring has strictly negative signed shoelace", () => {
  const { code, stdout } = runGate(contentRootFor("g-poly-clockwise-ring"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-POLY: n-badland: signed shoelace area -1600 is not strictly positive/);
});

test("HC-2 G-SEED red: two nodes sharing one seed.value", () => {
  const { code, stdout } = runGate(contentRootFor("g-seed-duplicate-seed"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-SEED: duplicate seed\.value "00000000000000aa" on n-copied and n-atlas/);
});

test("HC-2 G-COMP-SUM red: the 65-that-should-be-6.5 typo sums to 158.5", () => {
  const { code, stdout } = runGate(contentRootFor("g-comp-sum-typo"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-COMP-SUM: n-typo: composition sums to 158\.5/);
});

// ── the acceptance-criteria green: all 7 gates on the committed table ──────
test("all 7 structural gates are green on the committed 4-node spine", () => {
  const { code, stdout } = runGate(join(ROOT, "content"));
  assert.equal(code, 0, stdout);
  assert.match(stdout, /content-gate: .*, 0 failures/);
});

// ─── F-041 Phase 1 · Task 1.1: derive-writer ────────────────────────────────
import { test as t11 } from "node:test";
import assert11 from "node:assert/strict";
import { execFileSync as exec11 } from "node:child_process";
import { mkdtempSync as mkdtemp11, cpSync as cp11, readFileSync as read11, writeFileSync as write11 } from "node:fs";
import { tmpdir as tmp11 } from "node:os";
import { join as join11, resolve as resolve11, dirname as dirname11 } from "node:path";
import { fileURLToPath as f2p11 } from "node:url";

const ROOT11 = resolve11(dirname11(f2p11(import.meta.url)), "../..");
const EMIT = join11(ROOT11, "scripts/check_spine_emit.mjs");

function runEmit(dir, args) {
  try {
    const out = exec11(process.execPath, [EMIT, ...args, "--content-root", dir], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}

function realSpineCopy() {
  const dir = mkdtemp11(join11(tmp11(), "spine-emit-"));
  cp11(join11(ROOT11, "content/spine"), join11(dir, "spine"), { recursive: true });
  cp11(join11(ROOT11, "content/schemas/spine-node.schema.json"),
       join11(dir, "schemas/spine-node.schema.json"), { recursive: true });
  return dir;
}

t11("spine-emit --write is idempotent and --check is green after it", () => {
  const dir = realSpineCopy();
  assert11.equal(runEmit(dir, ["--write"]).code, 0);
  const first = read11(join11(dir, "spine/nodes/n-cluster1.json"), "utf8");
  assert11.equal(runEmit(dir, ["--write"]).code, 0);
  assert11.equal(read11(join11(dir, "spine/nodes/n-cluster1.json"), "utf8"), first);
  assert11.equal(runEmit(dir, ["--check"]).code, 0);
});

t11("spine-emit --check goes red on a hand-edited derived block", () => {
  const dir = realSpineCopy();
  runEmit(dir, ["--write"]);
  const p = join11(dir, "spine/nodes/n-cluster1.json");
  const doc = JSON.parse(read11(p, "utf8"));
  doc.derived.coveragePct = 99.9;
  write11(p, JSON.stringify(doc, null, 2) + "\n");
  const r = runEmit(dir, ["--check"]);
  assert11.equal(r.code, 1);
  assert11.match(r.out, /spine-emit: DRIFT .*n-cluster1\.json/);
});

// ─── F-041 Phase 1 · fixture builder (A3: reuse Phase 0's if equivalent) ────
const FIX = join11(ROOT11, "scripts/tests/fixtures/spine");
const GATE11 = join11(ROOT11, "scripts/check_content.mjs");
function spineFixture({ overlayDir = null, mutate = null } = {}) {
  const dir = mkdtemp11(join11(tmp11(), "spine-fix-"));
  cp11(join11(FIX, "base"), dir, { recursive: true });
  cp11(join11(ROOT11, "content/schemas/spine-node.schema.json"),
       join11(dir, "schemas/spine-node.schema.json"), { recursive: true });
  if (overlayDir) cp11(join11(FIX, overlayDir), dir, { recursive: true });
  exec11(process.execPath, [EMIT, "--write", "--content-root", dir]); // fill derived
  if (mutate) mutate(dir);
  return dir;
}
function runSpineGate(dir) {
  try {
    const out = exec11(process.execPath, [GATE11, "--only=spine", "--content-root", dir], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}

t11("base spine fixture is green", () => {
  const r = runSpineGate(spineFixture());
  assert11.equal(r.code, 0, r.out);
});
t11("G-CONTAIN red: child polygon pokes outside its parent", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-contain-child-outside" }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-CONTAIN.*n-r.*outside parent n-c/);
});
t11("G-ANCHOR red: anchor outside own placement", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-anchor-outside" }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-ANCHOR.*n-r.*anchor \[5, 5\] outside placement/);
});

// Review round 1, Important: gSpineGeometry must walk the SCHEMA-VALIDATED
// list (validNodes), not loadSpine()'s raw one — a node missing `placement`
// entirely already earned its clean schema FAIL and must not also reach
// ringOf()/ .anchor and crash the whole gate with an uncaught TypeError
// (which would also swallow every FAIL recorded before it, since finish()
// never runs). Delete `placement` AFTER --write (mutate), not before — a
// node with no placement can't be derived, so it can't survive the
// fixture's own emit step.
t11("G-SCHEMA-MISSING-PLACEMENT: a node missing placement FAILs cleanly, no crash", () => {
  const r = runSpineGate(
    spineFixture({
      mutate: (dir) => {
        const p = join11(dir, "spine/nodes/n-r.json");
        const doc = JSON.parse(read11(p, "utf8"));
        delete doc.placement;
        write11(p, JSON.stringify(doc, null, 2) + "\n");
      },
    }),
  );
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /FAIL {2}spine\/nodes\/n-r\.json: schema .*placement/);
  assert11.doesNotMatch(r.out, /TypeError/);
});

// ─── F-041 Phase 1 · Task 1.7: G-FRAME + G-SCALE + G-DERIVED-DRIFT +
// G-PROVENANCE ──────────────────────────────────────────────────────────────
t11("G-FRAME red: hand-edited originInParent", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => {
    const p = join11(dir, "spine/nodes/n-r.json");
    const doc = JSON.parse(read11(p, "utf8"));
    doc.interior.originInParent = [0, 0]; // truth is [20, 20]
    write11(p, JSON.stringify(doc, null, 2) + "\n");
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-FRAME n-r: interior\.originInParent \[0, 0\] != derived \[20, 20\]/);
});
t11("G-SCALE red: units flip without a scale factor", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-scale-units-flip" }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-SCALE n-r: units u under km parent but perParentUnit 1/);
});
t11("G-DERIVED-DRIFT red: hand-edited derived block", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => {
    const p = join11(dir, "spine/nodes/n-c.json");
    const doc = JSON.parse(read11(p, "utf8"));
    doc.derived.coveragePct = 99.9;
    write11(p, JSON.stringify(doc, null, 2) + "\n");
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-DERIVED-DRIFT n-c: committed derived block does not match recomputation/);
});
t11("G-PROVENANCE red: generated node without a generator pin", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-provenance-unpinned" }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-PROVENANCE n-r: authored "generated" requires generator \{name, version\}/);
});

// F-041 Phase 1 Task 1.8: G-FROZEN, then G-NET + G-CANON-LEG.
t11("G-FROZEN red: frozen node under an unfrozen ancestor", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-frozen-unfrozen-ancestor" }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-FROZEN n-r: frozen but ancestor n-c is not/);
});
t11("G-FROZEN red: absoluteAnchor drifted from the composed transform", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-frozen-unfrozen-ancestor", mutate: (dir) => {
    for (const id of ["n-w", "n-c"]) {  // freeze the chain properly first…
      const p = join11(dir, `spine/nodes/${id}.json`);
      const doc = JSON.parse(read11(p, "utf8"));
      doc.frozen = true; doc.absoluteAnchor = doc.placement.anchor;
      write11(p, JSON.stringify(doc, null, 2) + "\n");
    }
    const p = join11(dir, "spine/nodes/n-r.json");   // …then poison the leaf's pin
    const doc = JSON.parse(read11(p, "utf8"));
    doc.absoluteAnchor = [1, 1];
    write11(p, JSON.stringify(doc, null, 2) + "\n");
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-FROZEN n-r: absoluteAnchor \[1, 1\] != composed \[30, 30\]/);
});
t11("G-NET red: edge endpoint does not resolve", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => {
    write11(join11(dir, "spine/edges.json"), JSON.stringify([
      { id: "e-bad", kind: "road", from: { node: "n-r" }, to: { node: "n-ghost" },
        points: [[30, 30], [50, 50]], attrs: {} },
    ], null, 2) + "\n");
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-NET e-bad: endpoint node "n-ghost" does not resolve/);
});
t11("G-CANON-LEG red: straight-line distance breaks the ±8% budget", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => {
    for (const id of ["n-w", "n-c", "n-r"]) {
      const p = join11(dir, `spine/nodes/${id}.json`);
      const doc = JSON.parse(read11(p, "utf8"));
      doc.frozen = true;
      doc.absoluteAnchor = id === "n-r" ? [30, 30] : [50, 50];
      write11(p, JSON.stringify(doc, null, 2) + "\n");
    }
    write11(join11(dir, "spine/edges.json"), JSON.stringify([
      { id: "e-leg-r-c", kind: "leg", from: { node: "n-r" }, to: { node: "n-c" },
        attrs: { canonDays: "x", roadKm: 300, straightKm: 200 } },
    ], null, 2) + "\n");
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-CANON-LEG e-leg-r-c: straight-line .* vs straightKm 200 breaks ±8%/);
});

// ─── F-041 Phase 1 · Task 1.9: spine → geography emitter (G-EMIT-DRIFT) ─────
t11("G-EMIT-DRIFT: emitted geography drifts red on a hand-edit and is green when clean", () => {
  const dir = mkdtemp11(join11(tmp11(), "spine-geo-"));
  cp11(join11(ROOT11, "content/spine"), join11(dir, "spine"), { recursive: true });
  cp11(join11(ROOT11, "content/maps"), join11(dir, "maps"), { recursive: true });
  cp11(join11(ROOT11, "content/schemas/spine-node.schema.json"),
       join11(dir, "schemas/spine-node.schema.json"), { recursive: true });
  assert11.equal(runEmit(dir, ["--write"]).code, 0);
  assert11.equal(runEmit(dir, ["--check"]).code, 0);
  const p = join11(dir, "maps/cluster1-geography.json");
  write11(p, read11(p, "utf8").replace('"Millcross"', '"Milcros"'));
  const r = runEmit(dir, ["--check"]);
  assert11.equal(r.code, 1);
  assert11.match(r.out, /spine-emit: DRIFT .*cluster1-geography\.json/);
});

// ─── F-041 Phase 1 · Task 1.10: G-LOAD-BUDGET + G-COMP-REPORT ───────────────
// Note: the base fixture's committed coverage budget is maxUnchecked: 2
// (Task 1.6) because n-w and n-c are both UNCHECKED; the red test below
// lowers it to 0.
t11("G-LOAD-BUDGET red: node count over a lowered budget", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => {
    write11(join11(dir, "spine/load-budget.json"), '{ "maxNodes": 1, "maxBytes": 65536 }\n');
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-LOAD-BUDGET: 3 nodes > budget 1/);
});
t11("G-COMP-REPORT red: UNCHECKED count over the coverage budget", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => {
    write11(join11(dir, "spine/coverage-budget.json"), '{ "maxUnchecked": 0 }\n');
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-COMP-REPORT: \d+ UNCHECKED nodes > budget 0/);
});
t11("G-COMP-REPORT prints coverage and verdict for every node", () => {
  const r = runSpineGate(spineFixture());
  assert11.equal(r.code, 0);
  assert11.match(r.out, /spine-comp: n-c coverage=\d+(\.\d+)?% verdict=(CHECKED|ASSERTED|UNCHECKED)/);
  assert11.match(r.out, /spine-comp: totals CHECKED=\d+ ASSERTED=\d+ UNCHECKED=2/);
  assert11.match(r.out, /spine-load: 3 nodes, \d+ bytes \(budget 10 nodes, 65536 bytes\)/);
});

// ─── F-041 Phase 1 · Task 1.13: G-OVERLAP + G-COMP-ROLLUP (FAIL stage) ──────
t11("G-OVERLAP + G-COMP-ROLLUP red: overlapping twins now hard-fail", () => {
  const r = runSpineGate(spineFixture({ overlayDir: null, mutate: (dir) => {
    const base = JSON.parse(read11(join11(dir, "spine/nodes/n-r.json"), "utf8"));
    const twin = { ...base, id: "n-r2", seed: { value: "52fc1fdd51a099d7", epoch: 0, why: null } };
    delete twin.derived;
    write11(join11(dir, "spine/nodes/n-r2.json"), JSON.stringify(twin, null, 2) + "\n");
    exec11(process.execPath, [EMIT, "--write", "--content-root", dir]);
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-OVERLAP n-r ∩ n-r2: 400\.0 over limit 2\.0/);
});
t11("G-COMP-ROLLUP red: child mix contradicts the parent beyond tolerance", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => {
    const p = join11(dir, "spine/nodes/n-c.json");
    const doc = JSON.parse(read11(p, "utf8"));
    doc.interstitialUnsurveyed = false;
    doc.interstitial = { rock: 100 }; // children + interstitial say rock; node claims meadow
    write11(p, JSON.stringify(doc, null, 2) + "\n");
    exec11(process.execPath, [EMIT, "--write", "--content-root", dir]);
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-COMP-ROLLUP n-c: meadow off by .* pp \(tol 3\)/);
});

// ── F-041 Phase 3: hermetic fixture roots for the town-frame gates ──────────
// Copies a committed fixture dir to a tmp root, fills the codegen-owned
// `derived` block on every node via lib deriveNode (G-DERIVED-DRIFT stays
// green; each fixture fails ONLY on its authored defect), copies the two real
// schemas in, then runs the real gate binary with --only=spine.
//
// NOTE: the brief for this task names the runner `runSpineGate(root) →
// { status, out }`, but a same-named `runSpineGate(dir) → { code, out }`
// already exists at module scope (added for Task 1.7's fixture builder,
// used by ~15 tests above) — a second top-level `function runSpineGate`
// would be a SyntaxError (duplicate declaration), not a redefinition.
// Named `p3RunSpineGate` instead; behaviourally identical (same GATE binary,
// same --content-root/--only=spine invocation), field renamed `status` to
// match the brief's contract for Tasks 3.7–3.9 to reuse.
const P3_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures/spine");

function p3Root(fixtureName) {
  const root = mkdtempSync(join(tmpdir(), `spine-p3-`));
  cpSync(join(P3_FIXTURES, fixtureName), root, { recursive: true });
  mkdirSync(join(root, "schemas"), { recursive: true });
  for (const s of ["spine-node.schema.json", "town-plan.schema.json"])
    cpSync(join(ROOT, "content/schemas", s), join(root, "schemas", s));
  const spine = loadSpine({ contentRoot: root });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  // plans: same [{ file, doc }] shape checkSpine hands deriveNode — verified
  // against deriveNode's call site in check_content.mjs (gSpineFrames,
  // G-DERIVED-DRIFT): deriveNode's `plans` param is unused inside the
  // function today (§3.2 town reversal activates it later), so this shape
  // is inert for now but matches the future contract.
  const plans = readdirSync(join(root, "towns")).sort().map((f) => ({
    file: `towns/${f}`,
    doc: JSON.parse(readFileSync(join(root, "towns", f), "utf8")),
  }));
  for (const node of spine.nodes) {
    const file = join(root, "spine/nodes", `${node.id}.json`);
    const doc = JSON.parse(readFileSync(file, "utf8"));
    doc.derived = deriveNode({ tree, id: node.id, plans });
    writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
  }
  return root;
}

function p3RunSpineGate(root) {
  try {
    return { status: 0, out: execFileSync(process.execPath, [GATE, "--content-root", root, "--only=spine"], { encoding: "utf8" }) };
  } catch (e) {
    return { status: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

test("P3 fixture scaffolding: the green base passes --only=spine clean", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-gates-green-base"));
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /FAIL/);
});

test("G-TOWN-FRAME red: corner-as-anchor fixture (HC-2/HC-4)", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-frame-corner-as-anchor"));
  assert.equal(status, 1, out);
  assert.match(out, /G-TOWN-FRAME: towns\/town-t1\.json -> n-t1/);
  assert.match(out, /centre-of-interest, not the origin corner/);
});
