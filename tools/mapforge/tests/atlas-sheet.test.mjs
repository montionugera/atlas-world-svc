import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAtlasSheet } from "../lib/atlas-sheet.mjs";
import { esc } from "../lib/draft.mjs";
import { loadSpine, buildTree } from "../../../scripts/lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("atlas sheet renders with no problems and is deterministic", () => {
  const a = buildAtlasSheet({ repoRoot: ROOT });
  const b = buildAtlasSheet({ repoRoot: ROOT });
  assert.deepEqual(a.problems, []);
  assert.equal(a.svg, b.svg);
});

test("one town dot per town-tier node, no town labels", () => {
  const { svg } = buildAtlasSheet({ repoRoot: ROOT });
  const dots = svg.match(/class="town-dot"/g) ?? [];
  assert.equal(dots.length, 7); // millcross, rooktide, embervale, norhollow, gildmark, cindervast-town, expedition-camp
  assert.ok(!svg.includes(">Millcross<"));
});

test("world sheet title comes from the sheet record", () => {
  const { svg } = buildAtlasSheet({ repoRoot: ROOT });
  assert.ok(svg.includes("THE ATLAS WORLD"));
});

test("world sheet draws every reported tier-1 node with the reported grammar", () => {
  const { svg, problems } = buildAtlasSheet({ repoRoot: ROOT });
  assert.deepEqual(problems, []);
  const spine = loadSpine({ contentRoot: join(ROOT, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const reported = [...tree.byId.values()].filter((n) => n.parentId === "n-atlas" && n.lore?.reported);
  assert.ok(reported.length >= 6);
  for (const n of reported) assert.ok(svg.includes(esc(n.title.toUpperCase())) || svg.includes(esc(n.title)), n.id);
  assert.ok(svg.includes('class="coast-reported"'));
  assert.ok(svg.includes("pReported"));
  assert.ok(svg.includes('class="region-bound"'));
  assert.ok(!svg.includes("textPath"));
});

// Regression: ocean names used to be drawn TWICE — once via a curveLabel
// <textPath> (silently dropped by rsvg-convert, so a straight lineLabel
// fallback was added) and once via that straight lineLabel, at the same
// centroid. The committed SVG is viewed directly in browsers (textPath-
// capable), so the fallback was doubling every sea name there even though
// the shipped PNG only ever showed one copy. Fix: the straight lineLabel is
// the sole rendering now — each sea name must appear EXACTLY once.
test("each ocean name appears exactly once (no doubled textPath + lineLabel)", () => {
  const { svg, problems } = buildAtlasSheet({ repoRoot: ROOT });
  assert.deepEqual(problems, []);
  for (const name of ["The Keelbreak Sea", "The Galereach Sea", "The Tarnmark Sea"]) {
    const count = svg.split(esc(name)).length - 1;
    assert.equal(count, 1, `${name}: expected exactly 1 occurrence, found ${count}`);
  }
});

test("sea-lanes terminate on named ports and carry season marks", () => {
  const { svg, problems } = buildAtlasSheet({ repoRoot: ROOT });
  assert.deepEqual(problems, []);
  const lanes = svg.match(/class="sea-lane"/g) ?? [];
  assert.ok(lanes.length >= 2);
  assert.ok(svg.includes("the trade wind"));
});

// Regression: the chrome block (title/subtitle/hand text) carries an opaque
// parchment halo and used to paint OVER world labels drawn earlier in
// document order — ocean names and some Coldreach labels were fully erased
// on the rendered chart even though svg.includes(...) still found the text.
// Document order is the actual paint order for overlapping SVG text, so
// this asserts each mandated label's index is AFTER the chrome's last line.
test("world labels paint above the sheet chrome (document order)", () => {
  const { svg, problems } = buildAtlasSheet({ repoRoot: ROOT });
  assert.deepEqual(problems, []);
  const sheet = JSON.parse(readFileSync(join(ROOT, "content/spine/sheet-atlas.json"), "utf8"));
  const lastChromeLine = sheet.withheld[sheet.withheld.length - 1];
  const chromeEndIdx = svg.indexOf(esc(lastChromeLine));
  assert.ok(chromeEndIdx > -1, "chrome withheld list not found in svg");
  for (const needle of ["Keelbreak Sea", "Galereach Sea", "Tarnmark Sea", "Tallowquay", "the Coldreach Interior"]) {
    const idx = svg.indexOf(needle);
    assert.ok(idx > -1, `${needle}: not found in svg at all`);
    assert.ok(idx > chromeEndIdx, `${needle}: must paint after the chrome block (document order)`);
  }
});
