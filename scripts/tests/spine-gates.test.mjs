import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
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
// the table from 16 to 23 nodes. Task 4.3 (F-041 P4) authored the runtime
// subtree — n-frontier-shelf + 3 sites + 2 fixtures — growing the table from
// 23 to 29 nodes. Ids come back sorted (loadSpine reads the directory
// sorted), so the 6 new n-* ids interleave with the existing 23.
test("the committed 29-node table loads clean: 2 roots, depths legal, no load errors", () => {
  const spine = loadSpine({ contentRoot: join(ROOT, "content") });
  assert.equal(spine.present, true);
  assert.deepEqual(spine.errors, []);
  assert.deepEqual(spine.nodes.map((n) => n.id), [
    "n-ashvale-front", "n-atlas", "n-cindervast-town", "n-cindervast", "n-cluster1",
    "n-eastern-hills", "n-emberdown", "n-embervale", "n-expedition-camp",
    "n-fixture-deflect", "n-fixture-projectile", "n-frontier-shelf",
    "n-gildmark-head", "n-gildmark", "n-hollowmarch", "n-meltwash-terrace",
    "n-millcross-ford", "n-millcross", "n-norhollow", "n-northern-icefield",
    "n-playroot", "n-rooktide-reach", "n-rooktide", "n-saltmire",
    "n-site-icefield", "n-site-spawn-meadow", "n-site-thornveil", "n-thornveil",
    "n-westsea",
  ]);
  assert.deepEqual(spine.roots, ["n-atlas", "n-playroot"]);
  // Task 1.10: these were Phase-0 placeholders (48 / 4) until G-LOAD-BUDGET
  // and G-COMP-REPORT existed to enforce them; real values as of the 29-node
  // table (real UNCHECKED today: n-atlas only — Task 4.3 flipped n-playroot's
  // interstitialUnsurveyed to false, so it now reads ASSERTED; maxUnchecked
  // stays 2, well over the actual count of 1, so no budget bump was needed).
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
  // F-043 perf fix: the parent-level double-count check (gSpineOverlapRollup)
  // switched from a gridUnionArea() scan to summing the pairwise
  // gridIntersectionArea() values from the loop above. n-r/n-r2 are full
  // duplicates with a single pair, so the pairwise sum equals the old
  // union-based figure exactly (400.0) — this pins that the fixture's
  // reported double-count number did not change after the swap.
  assert11.match(r.out, /G-OVERLAP n-c: children double-count 400\.0 \(limit 32\.0\)/);
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

// `mutate(root)` runs on the copied root BEFORE the derived blocks are filled,
// so a mutation is indistinguishable from a committed authoring defect — the
// derived blocks are consistent with whatever the mutation left behind, and
// the fixture still fails ONLY on the defect under test.
function p3Root(fixtureName, mutate = null) {
  const root = mkdtempSync(join(tmpdir(), `spine-p3-`));
  cpSync(join(P3_FIXTURES, fixtureName), root, { recursive: true });
  mkdirSync(join(root, "schemas"), { recursive: true });
  for (const s of ["spine-node.schema.json", "town-plan.schema.json"])
    cpSync(join(ROOT, "content/schemas", s), join(root, "schemas", s));
  if (mutate) mutate(root);
  const spine = loadSpine({ contentRoot: root });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  // plans: the ONE [{ file, doc }] shape documented at lib/spine.mjs's
  // planForNode(). NO LONGER INERT — the P3 phase-review wave activated it:
  // deriveNode's rollupVerdict is CHECKED for a town with a linked plan
  // (§5.5), so the derived blocks written here must be derived from the SAME
  // list the gate reads out of the fixture's towns/ dir, or every fixture
  // reds on G-DERIVED-DRIFT instead of on the gate under test.
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

test("G-TOWN-COMP red: footprints-only built (10 declared vs 28 derived) is outside ±3 pp (HC-2)", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-comp-footprints-only-built"));
  assert.equal(status, 1, out);
  assert.match(out, /G-TOWN-COMP: towns\/town-t1\.json -> n-t1: declared built 10 vs derived 28\.00/);
});

test("G-TERRAINKIND red: river-country with river at 10% misses the 15% implied-biome floor (HC-2)", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-terrainkind-implied-biome-missing"));
  assert.equal(status, 1, out);
  assert.match(out, /G-TERRAINKIND: n-r1: terrainKind "river-country" implies biome "river" at >= 15% of composition, found 10/);
});

// ── F-041 P3 phase-review wave ─────────────────────────────────────────────
// Five findings, one plumbing change: the gate now loads town plans ONCE,
// schema-validated, at the top of checkSpine, and hands that ONE list to
// G-FRAME (the reversed town arrow), G-COMP-REPORT (the CHECKED verdict) and
// the G-TOWN-* gates. The tests below pin each finding's failure mode.

const readJ = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJ = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
const planPath = (root) => join(root, "towns/town-t1.json");
const nodePath = (root, id) => join(root, "spine/nodes", `${id}.json`);

// Finding 1 (HIGH). checkSpine used to read towns/*.json with NO schema and
// hand the raw docs to townCompErrors, whose normRect(fp.rect) TypeErrors on
// a plan missing footprints[0].rect. An uncaught throw skips finish(), so
// every FAIL recorded before it is SWALLOWED and the process still exits 0.
// The mutation below plants BOTH defects at once: the schema-invalid plan and
// an unrelated earlier G-COMP-SUM failure that must survive to be printed.
test("town plans are schema-validated before the town gates consume them (a plan missing footprints[0].rect must not crash checkSpine)", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-gates-green-base", (root) => {
    const plan = readJ(planPath(root));
    delete plan.footprints[0].rect;         // the shape normRect would TypeError on
    writeJ(planPath(root), plan);
    const c1 = readJ(nodePath(root, "n-c1"));
    c1.composition = { meadow: 40, forest: 40 }; // sums to 80, not 100 — an EARLIER gate
    writeJ(nodePath(root, "n-c1"), c1);
  }));
  assert.equal(status, 1, out);
  assert.doesNotMatch(out, /TypeError/);
  // the plan earns its own clean schema FAIL line …
  assert.match(out, /FAIL {2}towns\/town-t1\.json: schema \/footprints\/0 must have required property 'rect'/);
  // … and the failure recorded BEFORE the town gates still reaches the report.
  assert.match(out, /FAIL {2}G-COMP-SUM: n-c1: composition sums to 80/);
});

// Finding 2 (HIGH). deriveInterior's town branch (research §3.2: the PLAN is
// the authority on a town's interior) was dead code — both production call
// sites passed plan: null, so a drifted plan extent changed nothing and the
// gate exited 0. Real plans are joined on spineId now.
test("G-FRAME red: a drifted plan extent contradicts the committed interior.size (the plan is the authority — research §3.2)", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-gates-green-base", (root) => {
    const plan = readJ(planPath(root));
    plan.extent.width = 235;               // node n-t1 still commits size [200, 160]
    writeJ(planPath(root), plan);
  }));
  assert.equal(status, 1, out);
  assert.match(out, /G-FRAME n-t1: interior\.size \[200, 160\] != derived \[235, 160\]/);
  assert.match(out, /the town plan's extent is the authority/);
});

// … and the epsilon half of the same finding: the reversed arrow divides and
// subtracts authored decimals, so the SHIPPED n-millcross derives 220 as
// 220.00000000000003. G-FRAME's JSON.stringify equality would red on correct
// content; the town arrow compares within FRAME_EPS. Real content, not a
// fixture — that is the whole point.
test("G-FRAME green: real content survives the activated town arrow (float-safe, not JSON.stringify-exact)", () => {
  const r = runGate(join(ROOT, "content"));
  assert.equal(r.code, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /G-FRAME/);
});

// Finding 3 (MEDIUM). §5.5 / plan.md task 3.8: a town whose spineId-linked
// plan exists is CHECKED. A town has no children, so child coverage can never
// be its evidence — the plan is.
test("G-COMP-REPORT: a town with a spineId-linked plan is CHECKED at 0% child coverage (§5.5)", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-gates-green-base"));
  assert.equal(status, 0, out);
  assert.match(out, /spine-comp: n-t1 coverage=0\.0% verdict=CHECKED/);
});

test("G-COMP-REPORT: the SAME town with its plan removed falls back to ASSERTED", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-gates-green-base", (root) => {
    rmSync(planPath(root));
  }));
  assert.equal(status, 0, out);
  assert.match(out, /spine-comp: n-t1 coverage=0\.0% verdict=ASSERTED/);
});

test("G-COMP-REPORT: the shipped table reports exactly one CHECKED node (n-millcross, the one town with a plan)", () => {
  const r = runGate(join(ROOT, "content"));
  assert.equal(r.code, 0, r.stdout);
  assert.match(r.stdout, /spine-comp: n-millcross coverage=0\.0% verdict=CHECKED/);
  assert.match(r.stdout, /spine-comp: totals CHECKED=1 ASSERTED=27 UNCHECKED=1/);
});

// Finding 4 (MEDIUM). terrainKindErrors ran over raw spine.nodes, so a node
// that already earned a clean schema FAIL (composition missing) ALSO earned a
// fabricated G-TERRAINKIND line claiming its implied biome sits at 0% — a
// second failure about a field the author never wrote.
test("G-TERRAINKIND walks validNodes: a schema-invalid node earns its schema FAIL and no fabricated implied-biome line", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-gates-green-base", (root) => {
    const t1 = readJ(nodePath(root, "n-t1"));
    t1.terrainKind = "river-country";
    delete t1.composition;                 // schema-required — n-t1 leaves validNodes
    writeJ(nodePath(root, "n-t1"), t1);
  }));
  assert.equal(status, 1, out);
  assert.match(out, /FAIL {2}spine\/nodes\/n-t1\.json: schema \/ must have required property 'composition'/);
  assert.doesNotMatch(out, /G-TERRAINKIND/);
});

// ── F-041 Phase 4 helpers: overlay fixtures on the real content root ──
// (rmSync added to the existing node:fs import; tmpdir/spawnSync added
//  only if not already imported. FIXTURES = Phase 0's constant for
//  scripts/tests/fixtures/spine — if your checkout's FIXTURES points one
//  level higher, use join(FIXTURES, "spine", overlayDir) below.)

// NOTE (brief bug, corrected): the brief's version of this helper omits
// schemas/ — checkSpine compiles content/schemas/spine-node.schema.json
// BEFORE it ever reaches the tree walk, so without it the gate exits 1 on
// "cannot read/parse .../schemas/spine-node.schema.json: ENOENT" and the
// G-RUNTIME line never prints (confirmed red-for-the-wrong-reason before
// this fix). towns/ is NOT required: loadTownPlans soft-skips a missing
// towns/ dir, so the real n-millcross town plan being absent here just
// drops its CHECKED verdict to ASSERTED (and trips G-DERIVED-DRIFT on it),
// which is exactly the "may also break G-DERIVED-DRIFT" noise the test
// below already expects and does not assert against.
function p4FixtureRoot(t, overlayDir) {
  const tmp = mkdtempSync(join(tmpdir(), "spine-fix-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  mkdirSync(join(tmp, "schemas"), { recursive: true });
  cpSync(join(ROOT, "content/schemas/spine-node.schema.json"), join(tmp, "schemas/spine-node.schema.json"));
  cpSync(join(ROOT, "content/spine"), join(tmp, "spine"), { recursive: true });
  cpSync(join(ROOT, "content/maps"), join(tmp, "maps"), { recursive: true });
  if (overlayDir) cpSync(join(FIXTURES, overlayDir), tmp, { recursive: true });
  return tmp;
}

// Unique name on purpose — never shadows Task 1.6's or Task 3.6's runners.
function runP4Gate(root, extraArgs = []) {
  const r = spawnSync(process.execPath,
    [join(ROOT, "scripts/check_content.mjs"), "--only=spine", "--content-root", root, ...extraArgs],
    { encoding: "utf8" });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

test("G-RUNTIME goes red on an originU that is not the accumulated origin (HC-2)", (t) => {
  const { code, out } = runP4Gate(p4FixtureRoot(t, "g-runtime-originu-mismatch"));
  assert.equal(code, 1);
  assert.match(out, /G-RUNTIME: "n-frontier-shelf" runtime\.originU \[1,0\]/);
  // NOTE: the mutated copy may also break G-DERIVED-DRIFT's digest — expected;
  // this test asserts the G-RUNTIME line specifically.
});

test("G-SPAWN-FIT goes red on a rect with insufficient margin (HC-2)", (t) => {
  const { code, out } = runP4Gate(p4FixtureRoot(t, "g-spawn-fit-margin"));
  assert.equal(code, 1);
  assert.match(out, /G-SPAWN-FIT: spawn area "thornveil_interior" east margin 3 < required 10/);
});

test("G-SPAWN-ID-STABLE goes red on a renamed spawn id (HC-2)", (t) => {
  const { code, out } = runP4Gate(p4FixtureRoot(t, "g-spawn-id-stable-renamed"));
  assert.equal(code, 1);
  assert.match(out, /G-SPAWN-ID-STABLE: spawn-id set != content\/spine\/frozen-spawn-ids\.json/);
  assert.match(out, /missing: \[east_dunes_renamed\]/);
  assert.match(out, /extra: \[east_dunes\]/);
});

test("G-ALIAS goes red on a map region id with no site node (HC-2)", (t) => {
  const { code, out } = runP4Gate(p4FixtureRoot(t, "g-alias-dangling-region"));
  assert.equal(code, 1);
  assert.match(out, /G-ALIAS: map region "region-ghost" resolves to no spine node \(expected "n-site-ghost"\)/);
});

test("G-SPINE-COMPLETE goes red under --require-complete on a childless non-leaf-tier fixture (HC-2)", (t) => {
  const root = p4FixtureRoot(t, "g-spine-complete-childless");
  // The overlay node ships derived: null and shifts n-playroot's rollup —
  // regenerate derived on the overlaid root so G-DERIVED-DRIFT stays out
  // of both runs (fixture-root --write only touches the tmp copy: the
  // emit mirrors are keyed off --content-root, Tasks 4.10/4.11).
  const w = spawnSync(process.execPath,
    [join(ROOT, "scripts/check_spine_emit.mjs"), "--write", "--content-root", root], { encoding: "utf8" });
  assert.equal(w.status, 0, (w.stdout ?? "") + (w.stderr ?? ""));
  const red = runP4Gate(root, ["--require-complete"]);
  assert.equal(red.code, 1);
  assert.match(red.out, /G-SPINE-COMPLETE: "n-ghost-shelf" \(tier playspace\) has no children/);
  // without the flag the same defect is a WARN, not a FAIL — scoped to
  // THIS gate's line so an unrelated failure can't hide behind it
  const soft = runP4Gate(root);
  assert.ok(!soft.out.match(/^FAIL .*G-SPINE-COMPLETE.*n-ghost-shelf/m), soft.out);
});

// ── F-041 P4 phase-review fix wave: HC-2 red proofs ───────────────────────
// Each of these reds a hole the Phase-4 review PROVED was silent. They use
// the same p4FixtureRoot overlay harness as the Task 4.x gate tests above.

// Review finding 1: G-SPAWN-ID-STABLE's union was seeded from the runtime
// artifact, so deleting one of the three dual-listed ids from the SPINE left
// the union identical — zero gate signal, and the emitted atlas-frontier.md
// silently lost a mobSpawnAreas row.
test("G-SPAWN-ID-STABLE goes red on a spine-side deletion of a dual-listed id (HC-2)", (t) => {
  const { code, out } = runP4Gate(p4FixtureRoot(t, "g-spawn-id-stable-spine-deletion"));
  assert.equal(code, 1);
  assert.match(out, /G-SPAWN-ID-STABLE: frozen spawn id\(s\) no longer authored in content\/spine\/nodes\/\*: \[thornveil_interior\]/);
});

// Review finding 2: checkSpawnFit bounded every rect against the MAP only, so
// a root-frame authoring mistake inside a 300x300 site passed all four
// margins and displaced the emitted row by the site origin (350u here).
test("G-SPAWN-FIT goes red on a spawn rect authored outside its OWNING node (HC-2)", (t) => {
  const { code, out } = runP4Gate(p4FixtureRoot(t, "g-spawn-fit-intra-node"));
  assert.equal(code, 1);
  assert.match(out, /G-SPAWN-FIT: spawn area "meadow_wilds" rect \(400,400 200x200\) is not contained by its owning node "n-site-spawn-meadow" interior\.size \[300, 300\]/);
});

// Review finding 3: FRONTIER_DOC.siteOrder hardcoded three sites, so a fourth
// site under n-frontier-shelf was silently omitted from the emitted mirror and
// the one-directional G-ALIAS said nothing. Two proofs in one fixture:
//   (a) the reverse G-ALIAS direction reds while the mirror lacks the region;
//   (b) --write then puts the row in the mirror, because the site list is now
//       derived from the tree rather than from the constant.
test("G-ALIAS reverse + derived siteOrder: a 4th site reds until the mirror is regenerated, then emits (HC-2)", (t) => {
  const root = p4FixtureRoot(t, "g-alias-unemitted-site");
  const pristineMirror = readFileSync(join(ROOT, "content/maps/atlas-frontier.md"), "utf8");
  const write = () => {
    const w = spawnSync(process.execPath,
      [join(ROOT, "scripts/check_spine_emit.mjs"), "--write", "--content-root", root], { encoding: "utf8" });
    assert.equal(w.status, 0, (w.stdout ?? "") + (w.stderr ?? ""));
  };
  write();                                                        // fill the new node's derived block
  writeFileSync(join(root, "maps/atlas-frontier.md"), pristineMirror); // ...but hold the mirror at 3 sites
  const red = runP4Gate(root);
  assert.equal(red.code, 1);
  assert.match(red.out, /G-ALIAS: spine site "n-site-newvale" has no map region "region-newvale"/);
  // (b) the emitter is no longer pinned to the 3 hardcoded ids
  write();
  const emitted = readFileSync(join(root, "maps/atlas-frontier.md"), "utf8");
  assert.match(emitted, /- id: region-newvale/);
  assert.equal(runP4Gate(root).code, 0);
});

// Review finding 5 (LOW): mirror-loss hardening. The frontier mirror's read
// was wrapped in a bare catch{}, so any non-ENOENT failure silently dropped
// an OUTPUT while the emitter still printed "check clean". Two pins:
// the emitted file set, and that a non-ENOENT read is an error.
const { collectOutputs } = await import("../check_spine_emit.mjs");

test("spine-emit emits every node file plus all three mirrors — a silently dropped mirror reds", () => {
  const contentRoot = join(ROOT, "content");
  const { outputs, errors } = collectOutputs({ contentRoot });
  assert.equal(errors, undefined, JSON.stringify(errors));
  const paths = outputs.map((o) => o.path);
  const nodeFiles = readdirSync(join(contentRoot, "spine/nodes")).filter((f) => f.endsWith(".json")).length;
  assert.equal(outputs.length, nodeFiles + 3, paths.join("\n"));
  for (const suffix of ["maps/cluster1-geography.json", "maps/atlas-frontier.md",
                        "colyseus-server/src/config/generated/mapDimensions.ts"])
    assert.ok(paths.some((p) => p.endsWith(suffix)), `missing mirror ${suffix} in:\n${paths.join("\n")}`);
});

test("spine-emit: a non-ENOENT failure reading the frontier mirror is an error, not a silent skip (HC-2)", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "spine-emit-eisdir-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  cpSync(join(ROOT, "content/spine"), join(tmp, "spine"), { recursive: true });
  cpSync(join(ROOT, "content/maps"), join(tmp, "maps"), { recursive: true });
  // a DIRECTORY where the mirror should be: readFileSync throws EISDIR, which
  // the old bare catch{} swallowed as "fixture root has no maps/".
  rmSync(join(tmp, "maps/atlas-frontier.md"));
  mkdirSync(join(tmp, "maps/atlas-frontier.md"));
  const r = collectOutputs({ contentRoot: tmp });
  assert.ok(r.errors, "expected an in-band error, got outputs");
  assert.match(r.errors[0], /maps\/atlas-frontier\.md: cannot read/);
});

// ── F-041 Phase 5: G-ALIAS (story half + external sweep) — HC-2 reds ─────
// The fixture is a full copy of the repo's content/ tree: the only content
// root guaranteed to hold a valid spine + populated story regions without
// re-authoring one. keys/manifest/mob-types/art-manifest fall back to the
// gate's real committed default artifacts, so a clean copy behaves exactly
// like the repo (exit 0) and one dangling reference is the single
// difference per test. Assertions on WARN-able sources pin the
// "FAIL  spine-alias:" prefix, not just exit code 1 — some tampered values
// also trip pre-existing FAIL-severity gates (G-TOWN-FRAME on the town
// plan, the bestiary bible-region check, the season-1 art:town count), so
// exit 1 alone would not prove the flip below is load-bearing.

function aliasContentCopy() {
  const dir = mkdtempSync(join(tmpdir(), "spine-alias-"));
  cpSync(join(ROOT, "content"), join(dir, "content"), { recursive: true });
  return dir;
}

function runAliasGate(dir, extraArgs = []) {
  try {
    const out = execFileSync(
      process.execPath,
      [GATE, "--content-root", join(dir, "content"), ...extraArgs],
      { encoding: "utf8" },
    );
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function editJson(path, mutate) {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  mutate(doc);
  writeFileSync(path, JSON.stringify(doc, null, 2));
}

test("G-ALIAS story half: a dangling spineId is a hard FAIL", () => {
  const dir = aliasContentCopy();
  editJson(join(dir, "content/story/regions.json"), (regions) => {
    regions[0].spineId = "n-nope"; // regions[0] is region-spawn-meadow
  });
  const r = runAliasGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL\s+spine-alias: story\/regions\.json#region-spawn-meadow: spineId "n-nope" does not resolve to a spine node/);
});

test("G-ALIAS story half: prints each record's resolved tier on the clean tree", () => {
  const r = runAliasGate(aliasContentCopy());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /spine-alias: region-millcross → n-millcross \(town\)/);
  assert.match(r.out, /spine-alias: region-icefield → n-northern-icefield \(region\)/);
});

test("G-ALIAS sweep: a dangling zone-content spineId is a hard FAIL", () => {
  const dir = aliasContentCopy();
  editJson(join(dir, "content/zones/zone-thornveil.json"), (z) => {
    z.spineId = "n-nope"; // optional field: present-but-dangling must fail
  });
  const r = runAliasGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL\s+spine-alias: zones\/zone-thornveil\.json: spineId "n-nope" does not resolve to a spine node/);
});

test("G-ALIAS sweep: a dangling town-plan spineId is a hard FAIL", () => {
  const dir = aliasContentCopy();
  editJson(join(dir, "content/towns/town-millcross.json"), (t) => {
    t.spineId = "n-nope";
  });
  const r = runAliasGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL\s+spine-alias: towns\/town-millcross\.json: spineId "n-nope" does not resolve to a spine node/);
});

test("G-ALIAS sweep: a bestiary region slug with no spine node is a hard FAIL", () => {
  const dir = aliasContentCopy();
  editJson(join(dir, "content/bestiary/bestiary.json"), (rows) => {
    rows[0].region = "nopeland";
  });
  const r = runAliasGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL\s+spine-alias: bestiary\.json region "nopeland": n-nopeland is not a spine node/);
});

test("G-ALIAS sweep: a character region link whose record lost its spineId is a hard FAIL", () => {
  const dir = aliasContentCopy();
  editJson(join(dir, "content/story/regions.json"), (regions) => {
    delete regions.find((r) => r.id === "region-thornveil").spineId;
  });
  const r = runAliasGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL\s+spine-alias: characters\/mob-bramble-drake\.md: links\.story "region-thornveil" has no resolving spineId in story\/regions\.json/);
});

test("G-ALIAS sweep: an art:town-* key with no town-tier node is a hard FAIL", () => {
  const dir = aliasContentCopy();
  const artPath = join(dir, "art-manifest.json");
  const art = JSON.parse(readFileSync(join(ROOT, "game-client/assets/art/art-manifest.json"), "utf8"));
  art.entries["art:town-nopeville"] = { ...Object.values(art.entries)[0] };
  writeFileSync(artPath, JSON.stringify(art, null, 2));
  const r = runAliasGate(dir, ["--art-manifest", artPath]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL\s+spine-alias: art-manifest art:town-nopeville: no town-tier spine node n-nopeville \/ n-nopeville-town/);
});

// ── F-043 Task 4: G-ATLAS-ROLLUP — the world rollup is pinned to committed
// composition (±2pp), independent of G-COMP-ROLLUP's looser per-node
// tolerance. Red fixture: g-atlas-rollup-drift/ (copied from base/, world
// root n-w flipped to interstitialUnsurveyed:false with a committed
// composition 4pp off its true rollup). Green half runs the real content
// root — valid only once Task 3's n-atlas promotion has landed.
test("G-ATLAS-ROLLUP red: world rollup off committed composition by >2pp", () => {
  const { code, stdout } = runGate(contentRootFor("g-atlas-rollup-drift"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-ATLAS-ROLLUP: /);
});

test("G-ATLAS-ROLLUP green: the committed content passes", () => {
  const { code, stdout } = runGate(join(ROOT, "content"));
  assert.equal(code, 0, stdout);
});
