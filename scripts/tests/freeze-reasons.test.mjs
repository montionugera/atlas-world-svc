// Plan E Task 7 (spec §9.3) — the shrunken freeze.
//
// Under generated land a coordinate is generated, so pinning an individual
// anchor is both wrong and useless. What survives the shrink is the set whose
// POSITION is load-bearing for something OUTSIDE the geometry: a runtime
// pointer, a canon distance, a town plan's frame, or the sea-to-land rollup.
// Each of those is a sentence someone can argue with at the next redraw, so
// the freeze and the reasons file are held equal in BOTH directions here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const NODES = join(ROOT, "content/spine/nodes");
const REASONS = JSON.parse(readFileSync(join(ROOT, "content/spine/freeze-reasons.json"), "utf8"));

const nodeDocs = () => readdirSync(NODES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(NODES, f), "utf8")));

const frozenIds = () => nodeDocs().filter((n) => n.frozen === true).map((n) => n.id).sort();

test("the freeze set is exactly the reasons file, both directions", () => {
  assert.deepEqual(frozenIds(), Object.keys(REASONS.reasons).sort(),
    "a frozen node with no written reason is a freeze nobody can defend, and an unfrozen node with a reason is a freeze someone quietly dropped");
});

test("the freeze has shrunk from 14 to 10", () => {
  assert.equal(frozenIds().length, 10);
});

test("every reason is a sentence, not a label", () => {
  for (const [id, why] of Object.entries(REASONS.reasons)) {
    assert.equal(typeof why, "string");
    assert.ok(why.length >= 40, `${id}: "${why}" is a label, not a reason`);
  }
});

test("every frozen node carries an absoluteAnchor and every unfrozen node does not", () => {
  for (const n of nodeDocs()) {
    if (n.frozen === true) assert.ok(Array.isArray(n.absoluteAnchor), `${n.id} frozen without absoluteAnchor`);
    else assert.equal(n.absoluteAnchor, undefined, `${n.id} unfrozen but carries absoluteAnchor`);
  }
});
