// Plan D — the world loader and the binding gates.
//
// Fixture discipline is copied verbatim from spine-gates.test.mjs: a `base`
// dir holding a complete green world, plus one overlay dir per red case that
// is copied OVER the base. That is what keeps a red test one file long and
// makes "which rule fired" unambiguous.
//
// The fixture lives under fixtures/world-d/, NOT fixtures/world/base/: Plan
// B/C's world-gates.test.mjs already owns that directory (its worldFixture
// copies it verbatim and pins its manifest and budgets to the committed ones,
// asserting e.g. `fabric 0 files`), so landing a miniature fabric beside it
// would redden their suite rather than ours.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCivil, gBind, BANNED_COORDINATE_KEYS } from "../lib/resolve.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIX = join(ROOT, "scripts/tests/fixtures/world-d");
const GATE = join(ROOT, "scripts/check_content.mjs");

export function worldFixture({ overlayDir = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "world-fix-"));
  cpSync(join(FIX, "base"), dir, { recursive: true });
  if (overlayDir) cpSync(join(FIX, overlayDir), dir, { recursive: true });
  return dir;
}

export function runWorldGate(dir) {
  try {
    const out = execFileSync(process.execPath, [GATE, "--only=spine", "--content-root", dir], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}

test("loadCivil reads two continents, three families and the lexicon", () => {
  const w = loadCivil({ contentRoot: worldFixture() });
  assert.equal(w.present, true);
  assert.deepEqual(w.errors, []);
  assert.deepEqual(Object.keys(w.fabric).sort(), ["c02", "c10"]);
  assert.equal(w.handles.size, 5);
  assert.equal(w.pinned.length, 1);
  assert.equal(w.bound.length, 1);
  assert.equal(w.relations.length, 1);
  assert.equal(w.lexicon.get("karst-cenote").dungeonCapable, true);
});

test("loadCivil soft-skips a content root with no world/ and records NO error", () => {
  const w = loadCivil({ contentRoot: join(ROOT, "scripts/tests/fixtures/spine/base") });
  assert.equal(w.present, false);
  assert.deepEqual(w.errors, []);
});

test("the banned coordinate keys are exactly the four the design names", () => {
  assert.deepEqual([...BANNED_COORDINATE_KEYS], ["at", "points", "rect", "anchor"]);
});

test("G-BIND is silent on the green fixture", () => {
  assert.deepEqual(gBind({ world: loadCivil({ contentRoot: worldFixture() }) }), []);
});

test("G-BIND red: a bound record carrying a coordinate key, at any depth", () => {
  const p = gBind({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-bind-coordinate" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-BIND: world\/civil\/bound\/c-lm-the-drowned-stair\.json carries key "at" — bound records hold meaning, never coordinates$/);
});

test("G-BIND red: two records claiming one handle", () => {
  const p = gBind({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-bind-shared-handle" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-BIND: handle "c02\/karst\/h-0f42" is claimed by 2 records: c-lm-the-drowned-stair, c-lm-the-second-stair$/);
});

test("G-BIND red: a handle no ledger carries", () => {
  const p = gBind({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-bind-dangling-handle" }) }) });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-BIND: c-lm-the-drowned-stair handle "c02\/karst\/h-dead" does not resolve in any ledger$/);
});

test("G-BIND's output order is deterministic when one record breaks two rules", () => {
  // The problems are printed into a gate log that gets diffed, so the order is
  // part of the contract: per record, the banned-key line precedes the handle
  // lines, and records iterate in sorted-filename order.
  const p = gBind({ world: loadCivil({ contentRoot: worldFixture({ overlayDir: "g-bind-multi" }) }) });
  assert.deepEqual(p, [
    `G-BIND: world/civil/bound/c-lm-the-drowned-stair.json carries key "at" — bound records hold meaning, never coordinates`,
    `G-BIND: c-lm-the-drowned-stair handle "c02/karst/h-dead" does not resolve in any ledger`,
  ]);
});

test("the gate wires G-BIND into --only=spine and still exits 0 on the green world", () => {
  const r = runWorldGate(worldFixture());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /world-civil: 1 pinned, 1 bound, 1 relations, 5 handles/);
});

test("the gate goes red, with the exact message, on the coordinate overlay", () => {
  const r = runWorldGate(worldFixture({ overlayDir: "g-bind-coordinate" }));
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL {2}G-BIND: .*carries key "at"/);
});

test("a content root with no world\\/ dir stays green and prints no world-civil line", () => {
  const r = runWorldGate(join(ROOT, "scripts/tests/fixtures/spine/base"));
  assert.doesNotMatch(r.out, /world-civil:/);
});
