import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpine, TIER_DEPTH } from "../lib/spine.mjs";

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
// table from 4 to 16 nodes. Ids come back sorted (loadSpine reads the
// directory sorted), so the 12 new n-* ids interleave with the original 4.
test("the committed 16-node table loads clean: 2 roots, depths legal, no load errors", () => {
  const spine = loadSpine({ contentRoot: join(ROOT, "content") });
  assert.equal(spine.present, true);
  assert.deepEqual(spine.errors, []);
  assert.deepEqual(spine.nodes.map((n) => n.id), [
    "n-ashvale-front", "n-atlas", "n-cindervast", "n-cluster1", "n-eastern-hills",
    "n-emberdown", "n-gildmark-head", "n-hollowmarch", "n-meltwash-terrace",
    "n-millcross-ford", "n-northern-icefield", "n-playroot", "n-rooktide-reach",
    "n-saltmire", "n-thornveil", "n-westsea",
  ]);
  assert.deepEqual(spine.roots, ["n-atlas", "n-playroot"]);
  assert.deepEqual(spine.budgets.load, { maxNodes: 48, maxBytes: 262144 });
  assert.deepEqual(spine.budgets.coverage, { maxUnchecked: 4 });
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
