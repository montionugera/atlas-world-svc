import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCanonLegs } from "../check_canon_legs.mjs";
import { gSpineNet } from "../check_content.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = join(ROOT, "scripts/check_canon_legs.mjs");

const LEGS = {
  version: 1, toleranceFraction: 0.08, why: "test",
  legs: {
    "e-leg-a-b": { from: { pinned: "c-a", feature: "f-a" },
                   to:   { pinned: "c-b", feature: "f-b" } },
  },
};
// 3-4-5 triangle: [0,0] -> [3,4] is exactly 5 km.
const EDGES = [{ id: "e-leg-a-b", kind: "leg", from: { feature: "f-a" },
                 to: { feature: "f-b" }, attrs: { straightKm: 5 } }];

function root({ legs = LEGS, edges = EDGES, pins }) {
  const dir = mkdtempSync(join(tmpdir(), "legs-"));
  mkdirSync(join(dir, "spine"), { recursive: true });
  mkdirSync(join(dir, "world/civil/pinned"), { recursive: true });
  writeFileSync(join(dir, "spine/canon-legs.json"), JSON.stringify(legs));
  writeFileSync(join(dir, "spine/edges.json"), JSON.stringify(edges));
  for (const [id, at] of Object.entries(pins))
    writeFileSync(join(dir, `world/civil/pinned/${id}.json`),
      JSON.stringify({ id, pin: { at, toleranceKm: 1.5, why: "test" } }));
  return dir;
}

test("a leg inside +/-8% passes and reports its residual", () => {
  const dir = root({ pins: { "c-a": [0, 0], "c-b": [3, 4] } });
  const r = checkCanonLegs({ contentRoot: dir });
  assert.deepEqual(r.problems, []);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].resolvedKm, 5);
  assert.equal(r.rows[0].deltaPct, 0);
  assert.equal(r.rows[0].verdict, "OK");
});

test("a leg outside +/-8% fails and names the remedy", () => {
  // [0,0] -> [3,5] = 5.83 km against straightKm 5 => +16.6%
  const dir = root({ pins: { "c-a": [0, 0], "c-b": [3, 5] } });
  const r = checkCanonLegs({ contentRoot: dir });
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0],
    /^G-CANON-LEG-PREFLIGHT: e-leg-a-b: pinned c-a → c-b is 5\.8 km vs straightKm 5 \(\+16\.6%\) — breaks ±8%; move the pin, do not rewrite canon$/);
});

test("a missing pinned record is diagnosable, never a crash", () => {
  const dir = root({ pins: { "c-a": [0, 0] } });
  const r = checkCanonLegs({ contentRoot: dir });
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0],
    /^G-CANON-LEG-PREFLIGHT: e-leg-a-b: pinned record "c-b" does not resolve/);
});

test("every leg edge in edges.json is covered by canon-legs.json", () => {
  const dir = root({ edges: [...EDGES, { id: "e-leg-x-y", kind: "leg",
    from: { feature: "f-x" }, to: { feature: "f-y" }, attrs: { straightKm: 9 } }],
    pins: { "c-a": [0, 0], "c-b": [3, 4] } });
  const r = checkCanonLegs({ contentRoot: dir });
  assert.ok(r.problems.some((p) =>
    /^G-CANON-LEG-PREFLIGHT: e-leg-x-y: no entry in content\/spine\/canon-legs\.json/.test(p)));
});

test("the CLI soft-skips a content root with no pinned layer and exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "legs-empty-"));
  mkdirSync(join(dir, "spine"), { recursive: true });
  writeFileSync(join(dir, "spine/canon-legs.json"), JSON.stringify(LEGS));
  writeFileSync(join(dir, "spine/edges.json"), JSON.stringify(EDGES));
  const out = execFileSync("node", [CLI, "--content-root", dir], { encoding: "utf8" });
  assert.match(out, /canon-legs: no pinned layer yet — skipped/);
});

test("the live repo's seven legs are all covered", () => {
  const legs = JSON.parse(readFileSync(join(ROOT, "content/spine/canon-legs.json"), "utf8"));
  const edges = JSON.parse(readFileSync(join(ROOT, "content/spine/edges.json"), "utf8"));
  const ids = edges.filter((e) => e.kind === "leg").map((e) => e.id).sort();
  assert.equal(ids.length, 7);
  assert.deepEqual(Object.keys(legs.legs).sort(), ids);
});

// F-051 fix-pass finding 1 (MINOR): the gate's missing-ledger case keys on the
// REAL content root — a condition no temp fixture root can satisfy — so it is
// unit-tested against gSpineNet directly instead of spawned.
test("a leg edge with no ledger FAILS on the real content root, naming the remedy", () => {
  const problems = [];
  gSpineNet({ nodes: [], edges: EDGES, tree: { byId: new Map(), depthOf: new Map() },
              canonLegs: null, pinnedIds: new Set(), isRealContentRoot: true,
              fail: (m) => problems.push(m) });
  const ledger = problems.filter((p) =>
    p.startsWith("spine: G-CANON-LEG: content/spine/canon-legs.json is missing"));
  assert.equal(ledger.length, 1, `expected exactly one ledger failure, got ${JSON.stringify(problems)}`);
  assert.match(ledger[0], /check_canon_legs\.mjs|restore the committed ledger/);
});

test("the same shape on a FIXTURE root keeps the frozen-only soft-skip fallback", () => {
  // A FROZEN endpoint passes the fallback and no ledger is demanded — this is
  // exactly the shape every minimal spine fixture ships, and it must stay
  // silent rather than demand the ledger the fixture never claimed to carry.
  const problems = [];
  const mk = (id, at) => ({ id, parentId: null, frozen: true, placement: { anchor: at }, features: [] });
  const a = mk("n-a", [0, 0]), b = mk("n-b", [3, 4]); // 3-4-5: exactly straightKm 5
  gSpineNet({ nodes: [a, b],
              edges: [{ id: "e-leg-a-b", kind: "leg",
                        from: { node: "n-a" }, to: { node: "n-b" }, attrs: { straightKm: 5 } }],
              tree: { byId: new Map([["n-a", a], ["n-b", b]]), depthOf: new Map([["n-a", 1], ["n-b", 1]]) },
              canonLegs: null, pinnedIds: new Set(), isRealContentRoot: false,
              fail: (m) => problems.push(m) });
  assert.deepEqual(problems, []);
});

test("an UNFROZEN endpoint under the fixture-root soft-skip still reds (fallback intact)", () => {
  const problems = [];
  const node = { id: "n-a", parentId: null, placement: { anchor: [0, 0] }, features: [] };
  gSpineNet({ nodes: [node],
              edges: [{ id: "e-leg-a-b", kind: "leg",
                        from: { node: "n-a" }, to: { node: "n-a" }, attrs: { straightKm: 5 } }],
              tree: { byId: new Map([["n-a", node]]), depthOf: new Map([["n-a", 1]]) },
              canonLegs: null, pinnedIds: new Set(), isRealContentRoot: false,
              fail: (m) => problems.push(m) });
  assert.ok(problems.some((p) => p === "spine: G-CANON-LEG e-leg-a-b: endpoint n-a is not frozen"));
});
