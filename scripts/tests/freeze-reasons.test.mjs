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

// The plan's rule here was `why.length >= 40` under the name "every reason is a
// sentence, not a label". An adversarial review measured it and it was theatre:
// `"x".repeat(45)` — one repeated character, no spaces, no punctuation, not a
// sentence under any definition — passed it, while the failure message told the
// reader a prose-shape gate existed. An assertion whose NAME claims more than
// its code checks is the same defect as a rule that cannot fail; it is narrowed
// here rather than renamed down, because the reasons file's whole value is that
// each entry is an argument someone can have at the next redraw, and a bare
// length floor cannot tell an argument from a keyboard mash.
//
// What is NOT checked, and cannot be: whether a reason is TRUE. Nothing here
// verifies that n-galereach really is one of the three ocean polygons
// G-ATLAS-ROLLUP rolls up through. That is a review's job, not a test's, and
// naming it is the honest alternative to a check that pretends to do it.
test("every reason is a sentence — length, words and a full stop, not a label", () => {
  for (const [id, why] of Object.entries(REASONS.reasons)) {
    assert.equal(typeof why, "string");
    assert.ok(why.length >= 40, `${id}: "${why}" is ${why.length} chars — a label, not a reason`);
    const words = why.trim().split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
    assert.ok(words.length >= 8,
      `${id}: "${why}" is ${words.length} word(s) — long enough to pass a length floor, not long enough to be a reason`);
    assert.ok(/[.!?]$/.test(why.trim()),
      `${id}: "${why}" does not end in a full stop — a reason is a sentence someone can disagree with, not a fragment`);
  }
});

test("every frozen node carries an absoluteAnchor and every unfrozen node does not", () => {
  for (const n of nodeDocs()) {
    if (n.frozen === true) assert.ok(Array.isArray(n.absoluteAnchor), `${n.id} frozen without absoluteAnchor`);
    else assert.equal(n.absoluteAnchor, undefined, `${n.id} unfrozen but carries absoluteAnchor`);
  }
});
