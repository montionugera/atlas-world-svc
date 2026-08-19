import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAtlasSheet, drawAtlasSheet } from "../lib/atlas-sheet.mjs";
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

// ── Plan A Task 8: the second adapter's ids are DATA ───────────────────────
const realSheet = () =>
  JSON.parse(readFileSync(join(ROOT, "content/spine/sheet-atlas.json"), "utf8"));
const realTree = () => {
  const spine = loadSpine({ contentRoot: join(ROOT, "content") });
  return { spine, tree: buildTree({ nodes: spine.nodes, rootIds: spine.roots }) };
};

test("sheet-atlas.json carries the subjects descriptor", () => {
  const sheet = realSheet();
  assert.ok(sheet.subjects, "content/spine/sheet-atlas.json has no `subjects` block");
  assert.equal(sheet.subjects.rootId, "n-atlas");
  assert.deepEqual(sheet.subjects.landIds, ["n-cluster1"]);
  assert.deepEqual(sheet.subjects.seaIds, ["n-westsea"]);
  assert.deepEqual(sheet.subjects.featureIds, {
    coast: "f-west-coast", river: "f-the-meltwash", iceEdge: "f-northern-ice-edge",
  });
});

test("the atlas adapter names no spine id in its source — every id comes from the descriptor", () => {
  const src = readFileSync(join(ROOT, "tools/mapforge/lib/atlas-sheet.mjs"), "utf8");
  // Comments and problem-message templates are allowed to name ids; CODE is
  // not. Strip line comments, then look for quoted spine ids. All THREE
  // JavaScript string quotes must be rejected: a backtick-quoted literal is a
  // perfectly good hard-coded id, and checking only "" and '' let
  // `n.parentId === \`n-atlas\`` through while this test stayed green.
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  for (const id of ["n-atlas", "n-cluster1", "n-westsea", "f-west-coast", "f-the-meltwash"]) {
    for (const q of ['"', "'", "`"]) {
      assert.ok(
        !code.includes(`${q}${id}${q}`),
        `atlas-sheet.mjs still hard-codes ${q}${id}${q} — a redraw that renames it needs a code edit`,
      );
    }
  }
});

test("a descriptor naming a missing land node REPORTS and returns an empty svg, never throws", () => {
  const { spine, tree } = realTree();
  const sheet = realSheet();
  const bad = { ...sheet, subjects: { ...sheet.subjects, landIds: ["n-not-a-node"] } };
  const { svg, problems } = drawAtlasSheet({ spine, tree, sheet: bad });
  assert.equal(svg, "");
  assert.ok(problems.some((p) => p.includes("n-not-a-node")), JSON.stringify(problems));
});

test("a sheet record with NO subjects block REPORTS and returns an empty svg", () => {
  const { spine, tree } = realTree();
  const { subjects, ...noSubjects } = realSheet();
  assert.ok(subjects, "fixture precondition: the committed sheet has subjects");
  const { svg, problems } = drawAtlasSheet({ spine, tree, sheet: noSubjects });
  assert.equal(svg, "");
  assert.ok(problems.some((p) => p.includes("`subjects` descriptor")), JSON.stringify(problems));
});

test("an EMPTY landIds/seaIds array is diagnosed by shape, not by indexing [0] of nothing", () => {
  const { spine, tree } = realTree();
  const sheet = realSheet();
  for (const key of ["landIds", "seaIds"]) {
    const bad = { ...sheet, subjects: { ...sheet.subjects, [key]: [] } };
    const { svg, problems } = drawAtlasSheet({ spine, tree, sheet: bad });
    assert.equal(svg, "");
    assert.ok(
      problems.some((p) => p.includes(`subjects.${key} is missing or empty`)),
      `${key}: ${JSON.stringify(problems)}`,
    );
    assert.ok(!problems.some((p) => p.includes('"undefined"')), `${key} indexed [0] of nothing`);
  }
});

// Correction C2 named the mire, but this adapter never dereferenced the mire —
// it already returned a report instead of a TypeError, so a mire-deletion test
// passes unchanged against the PRE-descriptor adapter and proves nothing. The
// invariant C2 actually wants is: a DESCRIBED subject vanishing from the tree
// reports through the descriptor and never throws. That is retargeted at
// landIds[0], which the adapter really does dereference.
test("a described subject vanishing from the tree reports through the descriptor, never throws (correction C2)", () => {
  const { spine, tree } = realTree();
  const sheet = realSheet();
  tree.byId.delete(sheet.subjects.landIds[0]);
  let out;
  assert.doesNotThrow(() => {
    out = drawAtlasSheet({ spine, tree, sheet });
  });
  assert.equal(out.svg, "");
  assert.ok(
    out.problems.some((p) => p.includes('subject "landIds[0]"') && p.includes("does not resolve")),
    JSON.stringify(out.problems),
  );
});

// This used to re-implement BOTH filters inside the test and compare them to
// each other — an identity check on two expressions the test itself wrote,
// green even against an adapter with no descriptor in it. Drive the SHIPPED
// adapter instead: move a world child into landIds and it must stop being
// drawn. Only a filter that really reads S can do that.
test("the shipped worldChildren filter reads landIds/seaIds — 9 world children, and moving one into landIds drops it", () => {
  const { spine, tree } = realTree();
  const sheet = realSheet();
  const S = sheet.subjects;
  const worldChildren = [...tree.byId.values()]
    .filter((n) => n.parentId === S.rootId && !S.landIds.includes(n.id) && !S.seaIds.includes(n.id))
    .map((n) => n.id)
    .sort();
  assert.equal(worldChildren.length, 9, JSON.stringify(worldChildren));

  const base = drawAtlasSheet({ spine, tree, sheet });
  assert.deepEqual(base.problems, []);
  const victim = tree.byId.get(worldChildren[0]);
  assert.ok(base.svg.includes(esc(victim.title)), `${victim.id} is not drawn on the base sheet`);

  const moved = {
    ...sheet,
    subjects: { ...S, landIds: [...S.landIds, victim.id] },
  };
  const after = drawAtlasSheet({ spine, tree, sheet: moved });
  assert.ok(
    !after.svg.includes(esc(victim.title)),
    `${victim.id} is still drawn after landIds absorbed it — the filter is not reading the descriptor`,
  );
  assert.notEqual(after.svg, base.svg);
});
