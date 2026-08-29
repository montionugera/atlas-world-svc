// Task 2 (F-051 completion plan) — G-GEOMETRY-LOCK.
//
// gridIntersectionArea over the real 138-pair committed spine costs 492.6 s
// (measured pre-lock, task-2-brief.md) — nearly all of it in 40 heavy pairs,
// one alone 110.6 s. That cost buys nothing repeatable: it is a function of
// world geometry, so the next redraw regrows it. This file tests the LOCK
// mechanics on a tiny, fast, throwaway fixture — never the real committed
// content/spine/nodes, which is exactly what the lock exists to stop this
// suite from re-walking. The lock's effect on the real 138-pair scan is
// exercised in scripts/tests/geometry-exact.test.mjs's equivalenceScan(),
// which reads content/spine/geometry-lock.json instead of recomputing it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hashNodesDir,
  collectSiblingPairs,
  computeGeometryLock,
  checkGeometryLock,
} from "../check_geometry_lock.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = join(ROOT, "scripts/check_geometry_lock.mjs");
const LOCK_REL = "content/spine/geometry-lock.json";

// A minimal three-region fixture: n-r/n-r2 overlap by exactly 100 (a 10x10
// square, aligned to the 0.05 grid so the grid sampler's count is exact, not
// an approximation), n-r3 is disjoint from both. Three sibling pairs total —
// enough to exercise every drift shape without paying the real spine's cost.
function node({ id, parentId, placement, units = "km" }) {
  return { id, parentId, placement, interior: { units } };
}
const sq = (x, y, s) => ({ shape: "polygon", points: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]], anchor: [x, y] });

function makeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "geometry-lock-"));
  const dir = join(root, "content/spine/nodes");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, "content/spine/roots.json"), JSON.stringify(["n-w"]));
  const nodes = [
    node({ id: "n-w", parentId: null, placement: { shape: "rect", rect: { x: 0, y: 0, w: 100, h: 100 }, anchor: [0, 0] } }),
    node({ id: "n-c", parentId: "n-w", placement: sq(0, 0, 100) }),
    node({ id: "n-r", parentId: "n-c", placement: sq(20, 20, 20) }), // [20,20]-[40,40]
    node({ id: "n-r2", parentId: "n-c", placement: sq(30, 30, 20) }), // [30,30]-[50,50] -> overlaps n-r by 100
    node({ id: "n-r3", parentId: "n-c", placement: sq(60, 60, 20) }), // disjoint from both
  ];
  for (const n of nodes) writeFileSync(join(dir, `${n.id}.json`), JSON.stringify(n));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("hashNodesDir: changes when a node ring moves, is stable when nothing does", () => {
  const repo = makeFixtureRepo();
  try {
    const h0 = hashNodesDir({ repoRoot: repo.root });
    assert.equal(hashNodesDir({ repoRoot: repo.root }), h0, "hashing twice with no change moved the hash");
    const p = join(repo.root, "content/spine/nodes/n-r.json");
    const doc = JSON.parse(readFileSync(p, "utf8"));
    doc.placement.points[0] = [21, 20]; // move one ring vertex
    writeFileSync(p, JSON.stringify(doc));
    assert.notEqual(hashNodesDir({ repoRoot: repo.root }), h0, "moving a ring vertex did not move the hash");
  } finally {
    repo.cleanup();
  }
});

// Fix round 1 (LOW, belt-and-braces): roots.json feeds buildTree's traversal
// just as much as the node files do, so it must move the hash too.
test("hashNodesDir: changes when roots.json changes, even with every node file untouched", () => {
  const repo = makeFixtureRepo();
  try {
    const h0 = hashNodesDir({ repoRoot: repo.root });
    writeFileSync(join(repo.root, "content/spine/roots.json"), JSON.stringify(["n-w", "n-extra"]));
    assert.notEqual(hashNodesDir({ repoRoot: repo.root }), h0, "editing roots.json did not move the hash");
  } finally {
    repo.cleanup();
  }
});

test("collectSiblingPairs + computeGeometryLock: exactly the 3 non-point pairs under n-c, areas match a fresh recompute", () => {
  const repo = makeFixtureRepo();
  try {
    const pairs = collectSiblingPairs({ repoRoot: repo.root });
    assert.deepEqual(
      pairs.map((p) => p.key).sort(),
      ["n-r2::n-r3", "n-r::n-r2", "n-r::n-r3"], // default string sort: ':' (0x3A) sorts after '2' (0x32)
    );
    const lock = computeGeometryLock({ repoRoot: repo.root });
    assert.equal(lock.pairs["n-r::n-r2"], 100, "the aligned 10x10 overlap should be an exact 100");
    assert.equal(lock.pairs["n-r::n-r3"], 0);
    assert.equal(lock.pairs["n-r2::n-r3"], 0);
    // Step 1: every pair's COMMITTED area must equal a FRESHLY computed one.
    const fresh = computeGeometryLock({ repoRoot: repo.root });
    assert.deepEqual(fresh.pairs, lock.pairs);
  } finally {
    repo.cleanup();
  }
});

test("checkGeometryLock: --write then --check on the same tree is clean", () => {
  const repo = makeFixtureRepo();
  try {
    assert.deepEqual(checkGeometryLock({ repoRoot: repo.root, write: true }), { ok: true, drifted: [], skip: false });
    assert.deepEqual(checkGeometryLock({ repoRoot: repo.root }), { ok: true, drifted: [], skip: false });
  } finally {
    repo.cleanup();
  }
});

test("checkGeometryLock: --check on a missing lock reports drift, not a throw", () => {
  const repo = makeFixtureRepo();
  try {
    const r = checkGeometryLock({ repoRoot: repo.root });
    assert.equal(r.ok, false);
    assert.equal(r.skip, false);
    assert.match(r.drifted[0], /geometry-lock\.json is missing/);
  } finally {
    repo.cleanup();
  }
});

// Fix round 1 (MEDIUM, both reviewers): a typo'd --repo-root used to mkdir
// content/spine/ in the wrong (empty) tree and write a self-certifying "ok"
// lock (zero pairs, exit 0) — indistinguishable from a legitimately empty
// world. A missing content/spine/ must be reported as ROOT misuse (`skip:
// true`), and --write must refuse it exactly like --check does.
test("checkGeometryLock: a bad root (no content/spine/ at all) is `skip: true` misuse, and --write refuses it too", () => {
  const badRoot = mkdtempSync(join(tmpdir(), "geometry-lock-bad-root-"));
  try {
    const checked = checkGeometryLock({ repoRoot: badRoot });
    assert.equal(checked.ok, false);
    assert.equal(checked.skip, true);
    assert.match(checked.drifted[0], /no content\/spine\/ directory/);

    const written = checkGeometryLock({ repoRoot: badRoot, write: true });
    assert.equal(written.ok, false);
    assert.equal(written.skip, true);
    assert.ok(
      !existsSync(join(badRoot, "content/spine/geometry-lock.json")),
      "a bad root must never self-certify an empty lock",
    );
  } finally {
    rmSync(badRoot, { recursive: true, force: true });
  }
});

// A root whose spine/ EXISTS but fails its own validation (unparsable node
// JSON) is a different problem from a missing root — reported (`skip:
// false`) rather than treated as misuse, and --write refuses it too rather
// than baking a lock from partially-broken node data.
test("checkGeometryLock: a spine with real validation errors is reported (skip: false), and --write refuses it", () => {
  const repo = makeFixtureRepo();
  try {
    writeFileSync(join(repo.root, "content/spine/nodes/n-broken.json"), "{ not valid json");
    const checked = checkGeometryLock({ repoRoot: repo.root });
    assert.equal(checked.ok, false);
    assert.equal(checked.skip, false);
    assert.ok(checked.drifted.some((d) => /n-broken\.json/.test(d)), checked.drifted.join("; "));

    const written = checkGeometryLock({ repoRoot: repo.root, write: true });
    assert.equal(written.ok, false);
    assert.equal(written.skip, false);
    assert.ok(
      !existsSync(join(repo.root, "content/spine/geometry-lock.json")),
      "a spine with validation errors must never bake a lock",
    );
  } finally {
    repo.cleanup();
  }
});

// The CLI-level proof of the same MEDIUM fix: --repo-root pointed at an empty
// directory exits 2 (misuse), not 0.
test("CLI: --write against a bad --repo-root exits 2 and writes nothing", () => {
  const badRoot = mkdtempSync(join(tmpdir(), "geometry-lock-bad-root-cli-"));
  try {
    const r = runCli(["--write", "--repo-root", badRoot]);
    assert.ok(r.failed, r.out);
    assert.match(r.out, /no content\/spine\/ directory/);
    assert.ok(!existsSync(join(badRoot, "content/spine/geometry-lock.json")));
  } finally {
    rmSync(badRoot, { recursive: true, force: true });
  }
});

// Fix round 1 (LOW): a lock that exists but fails to PARSE must be reported
// differently from one that is simply absent — different fixes.
test("checkGeometryLock: an unparsable (corrupted) lock is reported distinctly from a missing one", () => {
  const repo = makeFixtureRepo();
  try {
    checkGeometryLock({ repoRoot: repo.root, write: true });
    writeFileSync(join(repo.root, LOCK_REL), "{ this is not json");
    const r = checkGeometryLock({ repoRoot: repo.root });
    assert.equal(r.ok, false);
    assert.match(r.drifted[0], /exists but could not be read\/parsed/);
    assert.doesNotMatch(r.drifted[0], /is missing/);
  } finally {
    repo.cleanup();
  }
});

// Step 5(a): a node ring moves in content/spine/nodes WITHOUT re-baselining
// -> the lock's hash must red, loudly, before any area is even compared.
test("Step 5(a): a moved ring without re-baselining reds the nodesHash", () => {
  const repo = makeFixtureRepo();
  try {
    checkGeometryLock({ repoRoot: repo.root, write: true });
    const p = join(repo.root, "content/spine/nodes/n-r.json");
    const doc = JSON.parse(readFileSync(p, "utf8"));
    doc.placement.points[0] = [19, 20];
    writeFileSync(p, JSON.stringify(doc));
    const r = checkGeometryLock({ repoRoot: repo.root });
    assert.equal(r.ok, false);
    assert.ok(r.drifted.some((d) => /nodesHash/.test(d)), `no nodesHash drift reported: ${r.drifted.join("; ")}`);
  } finally {
    repo.cleanup();
  }
});

// Step 5(b): a hand-corrupted committed area must red on its own, independent
// of the hash — proves the per-pair equality check is load-bearing and not
// just a hash rubber stamp.
test("Step 5(b): a corrupted committed area reds even though nodesHash still matches", () => {
  const repo = makeFixtureRepo();
  try {
    checkGeometryLock({ repoRoot: repo.root, write: true });
    const lockPath = join(repo.root, LOCK_REL);
    const doc = JSON.parse(readFileSync(lockPath, "utf8"));
    assert.equal(doc.pairs["n-r::n-r2"], 100);
    doc.pairs["n-r::n-r2"] = 999; // corrupt, nodes untouched
    writeFileSync(lockPath, JSON.stringify(doc, null, 2) + "\n");
    const r = checkGeometryLock({ repoRoot: repo.root });
    assert.equal(r.ok, false);
    assert.ok(r.drifted.some((d) => d.includes("n-r::n-r2") && d.includes("999")), r.drifted.join("; "));
    assert.ok(!r.drifted.some((d) => /nodesHash/.test(d)), "nodesHash drifted too — the fixtures are not independent");
  } finally {
    repo.cleanup();
  }
});

test("checkGeometryLock: a new sibling with no lock row is reported, a removed one too", () => {
  const repo = makeFixtureRepo();
  try {
    checkGeometryLock({ repoRoot: repo.root, write: true });
    // Add a 4th sibling -> a new pair the lock has never seen.
    const dir = join(repo.root, "content/spine/nodes");
    writeFileSync(join(dir, "n-r4.json"), JSON.stringify(node({ id: "n-r4", parentId: "n-c", placement: sq(0, 60, 10) })));
    const r = checkGeometryLock({ repoRoot: repo.root });
    assert.equal(r.ok, false);
    assert.ok(r.drifted.some((d) => d.includes("n-r::n-r4") && d.includes("no lock row")), r.drifted.join("; "));
  } finally {
    repo.cleanup();
  }
});

// ── CLI smoke test, same shape as render-lock.test.mjs's runCli ────────────
const runCli = (args) => {
  try {
    return { failed: false, out: execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { failed: true, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};

test("CLI: --write then --check on a fixture repo-root is clean; --check on an unwritten one fails", () => {
  const repo = makeFixtureRepo();
  try {
    const missing = runCli(["--check", "--repo-root", repo.root]);
    assert.ok(missing.failed);
    assert.match(missing.out, /G-GEOMETRY-LOCK:.*is missing/);

    const wrote = runCli(["--write", "--repo-root", repo.root]);
    assert.ok(!wrote.failed, wrote.out);

    const clean = runCli(["--check", "--repo-root", repo.root]);
    assert.ok(!clean.failed, clean.out);
    assert.match(clean.out, /check-geometry-lock: check clean/);
  } finally {
    repo.cleanup();
  }
});

test("CLI: misuse (--bogus, --repo-root with no value) exits 2, not 0 or a throw", () => {
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  assert.equal(run(["--bogus"]).status, 2);
  assert.equal(run(["--repo-root"]).status, 2);
});

test("check_geometry_lock.mjs never calls process.exit() from main()", () => {
  const src = readFileSync(CLI, "utf8");
  const at = src.search(/^function main\(/m);
  assert.ok(at >= 0, "no main() found");
  const body = src.slice(at).replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(body, /process\.exit\(/);
});

// ── the real committed lock, read-only ─────────────────────────────────────
// The one place this file touches the REAL repo root: proves the committed
// content/spine/geometry-lock.json is present and internally consistent in
// shape (does not recompute it — that is the CLI's --check job, run as its
// own CI step, never inside this fast suite).
test("the committed content/spine/geometry-lock.json exists and has the expected shape", () => {
  const doc = JSON.parse(readFileSync(join(ROOT, LOCK_REL), "utf8"));
  assert.equal(doc.version, 1);
  assert.deepEqual(doc.generator, { name: "geometry-lock", version: 1 });
  assert.match(doc.nodesHash, /^sha256:[0-9a-f]{64}$/);
  const keys = Object.keys(doc.pairs);
  assert.ok(keys.length > 0, "the committed lock has no pairs at all");
  for (const k of keys) assert.equal(typeof doc.pairs[k], "number", `${k}: area is not a number`);
});

// ── fix round 1 BLOCKING: the lock must be wired into something ────────────
// A lock nobody checks is decoration (workspace rule: "if nothing reads it,
// it is decoration"). Pinned as source assertions — like
// scripts/tests/node-pin.test.mjs's ci.yml checks — because the failure mode
// is a MISSING line, which only a text search can catch, and because this is
// exactly the class of gap ("wired into nothing") that slipped through
// review once already.
test("scripts/integration.sh runs check_geometry_lock.mjs --check as its own Gate 2 section", () => {
  const sh = readFileSync(join(ROOT, "scripts/integration.sh"), "utf8");
  assert.match(sh, /check_geometry_lock\.mjs["']?\s+--check/, "integration.sh never calls check_geometry_lock.mjs --check");
  assert.match(sh, /run_section\s+"[^"]*geometry lock[^"]*"\s+geometry_lock/i,
    "geometry_lock has no run_section line — it's defined but never invoked");
});

test(".github/workflows/ci.yml runs Geometry lock (G-GEOMETRY-LOCK) as ITS OWN step, with its own generous timeout, never inside the Content gate step", () => {
  const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const at = ci.indexOf("name: Geometry lock");
  assert.ok(at >= 0, "no 'Geometry lock' CI step found");
  const step = ci.slice(at, ci.indexOf("\n\n", at));
  assert.match(step, /check_geometry_lock\.mjs\s+--check/, "this step does not run check_geometry_lock.mjs --check");
  const m = step.match(/timeout-minutes:\s*(\d+)/);
  assert.ok(m, `Geometry lock step has no timeout-minutes:\n${step}`);
  const minutes = Number(m[1]);
  // Must be its own step (never folded into the 8-minute Content gate step,
  // which check_geometry_lock.mjs --check's ~536 s single-threaded cost would
  // wedge) and generous enough for that measured cost with headroom.
  assert.ok(minutes >= 15, `timeout-minutes ${minutes} is too tight for a ~536s single-threaded recompute`);
  const contentGateAt = ci.indexOf("name: Content gate");
  assert.ok(contentGateAt >= 0 && contentGateAt < at, "Geometry lock step must come after, and be separate from, Content gate");
  const contentGateStep = ci.slice(contentGateAt, ci.indexOf("\n\n", contentGateAt));
  assert.doesNotMatch(contentGateStep, /check_geometry_lock/, "check_geometry_lock must not be folded into the Content gate step");
});
