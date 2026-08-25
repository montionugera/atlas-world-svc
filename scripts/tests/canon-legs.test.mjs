import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCanonLegs } from "../check_canon_legs.mjs";

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
