import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAtlasSheet, drawAtlasSheet } from "../lib/atlas-sheet.mjs";
import { esc, LEGEND } from "../lib/draft.mjs";
import { GLYPHS } from "../lib/glyphs.mjs";
import { measureText, checkLabels } from "../lib/labels.mjs";
import { ATLAS_MAX_LABEL_RANK, ATLAS_LABEL_BUDGET, ATLAS_LEGEND_TIER } from "../lib/atlas-sheet.mjs";
import { SHEETS } from "../render-sheet.mjs";
import { loadSpine, buildTree } from "../../../scripts/lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("atlas sheet renders with no problems and is deterministic", () => {
  const a = buildAtlasSheet({ repoRoot: ROOT });
  const b = buildAtlasSheet({ repoRoot: ROOT });
  assert.deepEqual(a.problems, []);
  assert.equal(a.svg, b.svg);
});

// Re-keyed by the redraw: settlements are no longer town-TIER nodes with their
// own dot loop (the trunk keeps exactly one, n-millcross) — every settlement is
// a `f-town-*` point feature on its continent, and the sheet draws one mark
// each. EXACT, never `>=`: a `>=` here would stay green while the sheet
// silently stopped drawing half the world's towns, which is precisely the
// silent-deletion class this suite exists to catch. The expected number is
// derived from the trunk in the same test, so a settlement added or lost by a
// regeneration re-baselines itself instead of needing a literal chased down.
test("one settlement mark per f-town-* feature on a drawn landmass, no town labels", () => {
  const { svg } = buildAtlasSheet({ repoRoot: ROOT });
  const { tree } = realTree();
  const S = realSheet().subjects;
  const drawn = [...tree.byId.values()].filter(
    (n) => n.parentId === S.rootId && n.tier === "continent",
  );
  const townFeatures = drawn.flatMap((n) =>
    (n.features ?? []).filter((f) => f.kind === "point" && f.id.startsWith("f-town-")),
  );
  assert.equal(townFeatures.length, 47, "the trunk's settlement count moved");
  const marks = svg.match(/class="settlement-mark"/g) ?? [];
  assert.equal(marks.length, townFeatures.length);
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
  // 4, not the pre-redraw 6: only n-loamspit, n-quillreef, n-rimewall-cap and
  // n-skerryfast carry `lore.reported` on the generated trunk, while TWELVE
  // continents draw the reported hatch. That gap is Plan C defect (c), filed in
  // world-fill-STATE.md §28 rather than fixed here — this number tracks the
  // trunk, and moves when the generator starts writing the flag it draws from.
  assert.equal(reported.length, 4, reported.map((n) => n.id).join(", "));
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
  // The generated ocean nodes carry BARE titles ("Keelbreak", not "The
  // Keelbreak Sea") — Plan C defect (d), filed in world-fill-STATE.md §28. The
  // invariant under test is unchanged: each ocean name is lettered once.
  for (const name of ["Keelbreak", "Galereach", "Tarnmark"]) {
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
  // Re-keyed onto surviving names. NOT "Gildmark": the `hand` paragraph itself
  // says "sworn at Gildmark harbour", so its first occurrence is INSIDE the
  // chrome and the check would read as failing for the wrong reason.
  for (const needle of ["Keelbreak", "Galereach", "Tarnmark", "Tallowquay", "Northern Icefield"]) {
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

// Re-keyed by the redraw. The pre-redraw version of this test PASSED while
// swearing to `f-west-coast`, `f-the-meltwash` and a one-element `seaIds` —
// ids the redraw retired — so the descriptor's "the subject ids are DATA"
// contract was pinned to a world that no longer exists. Every id below is
// checked against the live tree, so a descriptor naming a dead node reds here
// instead of only at render time.
test("sheet-atlas.json carries the subjects descriptor, and every id in it resolves", () => {
  const sheet = realSheet();
  const { tree } = realTree();
  assert.ok(sheet.subjects, "content/spine/sheet-atlas.json has no `subjects` block");
  assert.equal(sheet.subjects.rootId, "n-atlas");
  assert.deepEqual(sheet.subjects.landIds, ["n-cluster1"]);
  // All NINE marginal seas, drawn and named. The chart's storybook row promises
  // "13 landmasses, 3 oceans, 9 marginal seas"; before the re-key it drew one.
  assert.equal(sheet.subjects.seaIds.length, 9);
  assert.deepEqual(
    [...sheet.subjects.seaIds].sort(),
    [...tree.byId.values()].filter((n) => n.tier === "sea").map((n) => n.id).sort(),
  );
  // The basin subjects retired with the trunk that carried them (owner ruling,
  // world-fill-STATE.md §28): the drawn west coast and the Meltwash come back
  // on the resolved-backed wealdmarch sheet in Task 8, not here.
  assert.equal(sheet.subjects.featureIds, undefined);
  for (const id of [sheet.subjects.rootId, ...sheet.subjects.landIds, ...sheet.subjects.seaIds])
    assert.ok(tree.byId.get(id), `descriptor names ${id}, which is not in the trunk`);
});

test("the atlas adapter names no spine id in its source — every id comes from the descriptor", () => {
  const src = readFileSync(join(ROOT, "tools/mapforge/lib/atlas-sheet.mjs"), "utf8");
  // Comments and problem-message templates are allowed to name ids; CODE is
  // not. Strip line comments, then look for quoted spine ids. All THREE
  // JavaScript string quotes must be rejected: a backtick-quoted literal is a
  // perfectly good hard-coded id, and checking only "" and '' let
  // `n.parentId === \`n-atlas\`` through while this test stayed green.
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  // Read from the descriptor rather than pinned as literals: the pre-redraw
  // list named f-west-coast and f-the-meltwash, which the redraw retired, so
  // two of its five checks had become assertions about nothing. Whatever the
  // descriptor names today is exactly what the adapter must not hard-code.
  const S = realSheet().subjects;
  for (const id of [S.rootId, ...S.landIds, ...S.seaIds]) {
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
// 15, not the pre-redraw 9. The authority for this number is the trunk census
// (E-C4, committed as content/spine/trunk-census.json by Task 6 Step 1): the
// root n-atlas carries 13 continent children + 3 ocean children = 16, and
// landIds absorbs one of them, leaving 15. The nine marginal seas are NOT in
// this count — they nest inside their ocean (G-CONTAIN), so they were never
// children of the root.
test("the shipped worldChildren filter reads landIds/seaIds — 15 world children, and moving one into landIds drops it", () => {
  const { spine, tree } = realTree();
  const sheet = realSheet();
  const S = sheet.subjects;
  const worldChildren = [...tree.byId.values()]
    .filter((n) => n.parentId === S.rootId && !S.landIds.includes(n.id) && !S.seaIds.includes(n.id))
    .map((n) => n.id)
    .sort();
  assert.equal(worldChildren.length, 15, JSON.stringify(worldChildren));

  const base = drawAtlasSheet({ spine, tree, sheet });
  assert.deepEqual(base.problems, []);
  const victim = tree.byId.get(worldChildren[0]);
  // A continent's title is lettered UPPERCASE, an ocean's as written — and the
  // id-sorted first world child is a continent now (it was an ocean before the
  // redraw), so the probe has to accept both forms, exactly as the
  // reported-grammar test above does.
  const drawn = (svg) =>
    svg.includes(esc(victim.title)) || svg.includes(esc(victim.title.toUpperCase()));
  assert.ok(drawn(base.svg), `${victim.id} is not drawn on the base sheet`);

  const moved = {
    ...sheet,
    subjects: { ...S, landIds: [...S.landIds, victim.id] },
  };
  const after = drawAtlasSheet({ spine, tree, sheet: moved });
  assert.ok(
    !drawn(after.svg),
    `${victim.id} is still drawn after landIds absorbed it — the filter is not reading the descriptor`,
  );
  assert.notEqual(after.svg, base.svg);
});

// ── Plan B Task 12: the sheet adopts the Phase 3 capabilities ──────────────

test("the atlas sheet places every label through the declutter, with none dropped", () => {
  const { notes, problems } = buildAtlasSheet({ repoRoot: ROOT });
  assert.deepEqual(problems, [], problems.join("\n"));
  const note = notes.find((n) => n.startsWith("labels "));
  assert.ok(note, notes.join(" | "));
  // The note now RECONCILES: asked = placed + dropped + above tier. Before the
  // seam-4 fix it reported only placed/dropped, so a name lost to the tier was
  // invisible in the very line that claimed to account for the labels.
  const m = /^labels (\d+) asked · (\d+) placed · (\d+) dropped · (\d+) above rank (\d+)/.exec(note);
  assert.ok(m, note);
  const [, asked, placed, dropped, above] = m.map(Number);
  assert.equal(dropped, 0, note);
  assert.equal(placed + dropped + above, asked, note);
});

// Re-derived from the EMITTED text, so the assertion does not trust the
// placer's own bookkeeping — a collider bug has to show up here as an overlap
// rather than as a clean report from the thing that made the mistake.
test("no two label boxes overlap on the built atlas sheet", () => {
  const { svg } = buildAtlasSheet({ repoRoot: ROOT });
  const texts = [
    ...svg.matchAll(
      /<text class="lbl" x="([-\d.]+)" y="([-\d.]+)" font-size="([\d.]+)"[^>]*letter-spacing="([\d.]+)"[^>]*>([^<]*)<\/text>/g,
    ),
  ];
  // Every `class="lbl"` text on this sheet now comes out of the ONE placement
  // pass — the survey note used to be painted straight onto the page, which is
  // how the redraw could sit it on top of the trade-wind lane's label with
  // every gate green. EXACT, so a name lost from the chart reds here.
  assert.equal(texts.length, 32, `${texts.length} placed labels on the sheet`);
  const boxes = texts.map((m) => {
    const size = Number(m[3]);
    const { w, h } = measureText({ text: m[5], size, tracking: Number(m[4]) });
    return { x: Number(m[1]), y: Number(m[2]) - h * 0.78, w, h, t: m[5] };
  });
  for (let i = 0; i < boxes.length; i++)
    for (let k = i + 1; k < boxes.length; k++) {
      const a = boxes[i], b = boxes[k];
      assert.ok(
        !(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h),
        `"${a.t}" overlaps "${b.t}"`,
      );
    }
});

test("the atlas sheet now carries a legend block", () => {
  const { svg } = buildAtlasSheet({ repoRoot: ROOT });
  assert.ok(svg.includes("reported, not surveyed"), "no legend row for the frontier hatch");
  assert.ok(
    [...svg.matchAll(/<rect [^>]*fill="url\(#p/g)].length >= 2,
    "no legend swatches",
  );
  for (const row of LEGEND.filter((r) => r.tier <= ATLAS_LEGEND_TIER))
    assert.ok(svg.includes(esc(row.label)), `legend row "${row.label}" is missing`);
});

// Both directions. The sheet used to emit nine <pattern> blocks and point a
// fill at two of them.
test("the atlas sheet emits only the patterns it references", () => {
  const { svg } = buildAtlasSheet({ repoRoot: ROOT });
  const emitted = new Set([...svg.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]));
  const referenced = new Set([...svg.matchAll(/url\(#(p[A-Za-z]+)\)/g)].map((m) => m[1]));
  assert.deepEqual([...emitted].sort(), [...referenced].sort());
});

// The zoom tier is a CONTENT decision with teeth: at the registry's old
// literal 3 the declutter would have deleted every region title, port name and
// line-feature name on the chart — 20 of the 26 — and reported nothing,
// because a label above the tier is not drawn AND not counted as dropped.
test("the sheet's zoom tier keeps every name the chart draws, and the registry reads it", () => {
  assert.equal(SHEETS.atlas.maxLabelRank, ATLAS_MAX_LABEL_RANK);
  const { svg, notes } = buildAtlasSheet({ repoRoot: ROOT });
  const note = notes.find((n) => n.startsWith("labels "));
  const [, asked, placed] = /^labels (\d+) asked · (\d+) placed/.exec(note);
  assert.equal(asked, placed, `${asked} labels asked, ${placed} placed — the tier is eating names`);
  // Re-keyed: the redraw retired every authored line feature, so the old
  // needles ("the Coldreach Interior", "the Stonemoor Spine") name nothing. One
  // survivor per rank above the ocean/continent/sea floor — region (4), harbour
  // (6) and the survey note (8) — so a tier that silently ate a band reds here.
  for (const needle of ["Thornveil", "Tallowquay", realSheet().surveyNote])
    assert.ok(svg.includes(esc(needle)), `${needle}: a rank-4+ name vanished`);
});

test("a tighter zoom tier really does drop the lower ranks (the tier is not decorative)", () => {
  const { spine, tree } = realTree();
  const tight = drawAtlasSheet({ spine, tree, sheet: realSheet(), maxLabelRank: 3 });
  assert.ok(!tight.svg.includes("Northern Icefield"), "a rank-4 name survived tier 3");
  assert.ok(tight.svg.includes("Keelbreak"), "a rank-1 name was dropped at tier 3");
});

// THE SILENT-DELETION FINDING, as a positive control (review A finding 6 and
// review B's open class). At tier 3 this sheet loses 20 of its 26 names, and
// before the fix that loss appeared NOWHERE: not in problems, not in notes,
// not in any count checkLabels was given. It is still not a FAILURE — a zoom
// tier exists to drop names — but it is now on the record, by id.
// A SYNTHETIC subject, deliberately: the redraw left the live chart with only
// five names above rank 3, so re-pinning this at the measured 5 would leave the
// control measuring world density rather than the accounting rule. Same trick
// as typedTree() below — hang the subject on a cloned tree so the number under
// test is the fixture's, not the corpus's.
const landformTree = ({ count }) => {
  const { spine, tree } = realTree();
  const S = realSheet().subjects;
  const land = [...tree.byId.values()].find(
    (n) => n.parentId === S.rootId && n.tier === "continent" && !S.landIds.includes(n.id),
  );
  assert.ok(land, "no reported continent to hang probe landforms on");
  const a = land.placement.anchor;
  land.features = [
    ...(land.features ?? []),
    ...Array.from({ length: count }, (_, i) => ({
      id: `f-probe-ridge-${i}`,
      kind: "line",
      points: [a, [a[0] + 1, a[1] + 1]],
      attrs: { name: `Probe Ridge ${i}` },
    })),
  ];
  return { spine, tree, count };
};

test("names lost to the zoom tier are COUNTED, not silently deleted", () => {
  const { spine, tree, count } = landformTree({ count: 15 });
  const tight = drawAtlasSheet({ spine, tree, sheet: realSheet(), maxLabelRank: 3 });
  const note = tight.notes.find((n) => n.startsWith("labels "));
  const m = /^labels (\d+) asked · (\d+) placed · (\d+) dropped · (\d+) above rank 3/.exec(note);
  assert.ok(m, note);
  const [, asked, placed, dropped, above] = m.map(Number);
  assert.ok(above >= count, `only ${above} names counted as above-tier: ${note}`);
  assert.equal(placed + dropped + above, asked, note);
  assert.ok(/\(.*f-probe-ridge-0.*\)/.test(note), `the note names no ids: ${note}`);
  // and it is a REPORT, not a failure
  assert.deepEqual(tight.problems, [], tight.problems.join("\n"));
});

// The accounting rule itself, driven from the gate rather than from a sheet:
// a label that reaches none of the three buckets is what "vanished" means, and
// it is the ONE thing here that is a hard failure.
test("G-LABEL reports a label that lands in no bucket at all", () => {
  const problems = checkLabels({ placed: [], dropped: [], aboveTier: [], asked: 3, tier: 8 });
  assert.ok(
    problems.some((p) => /3 labels asked for at tier 8 but 0 accounted for .* 3 vanished with no record/.test(p)),
    JSON.stringify(problems),
  );
  // the reconciled case is silent
  assert.deepEqual(
    checkLabels({ placed: [], dropped: [{ id: "a" }], aboveTier: [{ id: "b" }], asked: 2, tier: 8 }),
    [`G-LABEL: 1 labels dropped at tier 8: a`],
  );
});

test("G-LABEL's budget is armed on this sheet", () => {
  const { spine, tree } = realTree();
  const over = drawAtlasSheet({ spine, tree, sheet: realSheet(), labelBudget: 3 });
  assert.ok(
    // `tier 1` was a literal in the sheet while the placer ran at rank 8, so
    // every G-LABEL message named a tier the sheet is not drawn at.
    over.problems.some((p) => /G-LABEL: \d+ labels at zoom tier 8 > budget 3/.test(p)),
    JSON.stringify(over.problems),
  );
  // Re-key review finding 1. This line read `ATLAS_LABEL_BUDGET >= 26` — the
  // PRE-redraw label count — so it passed with six to spare while the sheet had
  // already climbed to 32 placed against a budget of 32: exactly the
  // zero-headroom state its own failure message swore it was checking. Swapping
  // 26 for 32 would be the same defect with a newer number, so nothing here is a
  // literal. The budget's subject is `placed.length` (that is the number
  // checkLabels compares against `budget`), so measure THAT from a real build
  // and assert the ceiling covers it. A redraw that adds or loses a name
  // re-measures itself instead of leaving a stale literal behind.
  const census = /^labels (\d+) asked · (\d+) placed/.exec(
    buildAtlasSheet({ repoRoot: ROOT }).notes.find((n) => n.startsWith("labels ")) ?? "",
  );
  assert.ok(census, "the build emitted no label census note to measure the budget against");
  const placedNow = Number(census[2]);
  assert.ok(placedNow > 0, `the sheet placed ${placedNow} labels — nothing to measure`);
  assert.ok(
    ATLAS_LABEL_BUDGET >= placedNow,
    `ATLAS_LABEL_BUDGET is ${ATLAS_LABEL_BUDGET} but the sheet places ${placedNow} labels — ` +
      "the committed budget is below the sheet's own label count",
  );
});

// ── the two G-GLYPH checks, ARMED (seam-4 review B, survivors 5 and 6) ──────
//
// Both deleted clean with the whole 204-test mapforge suite green, and the
// reason is stated in the sheet itself: "No committed feature carries a type
// today, so this is byte-zero until Plan D writes the first one." A rule whose
// subject does not exist yet is not covered by a sheet that has none of it.
// These build the subject. Nothing on the shipped path looks like this.
const typedTree = ({ glyph }) => {
  const { spine, tree } = realTree();
  let hit = null;
  for (const n of tree.byId.values())
    for (const f of n.features ?? [])
      if (f.kind === "point" && !hit) hit = f;
  assert.ok(hit, "the spine has no point feature to hang a lexicon type on");
  hit.type = "t-probe";
  return { spine, tree, featureId: hit.id, lexicon: [{ id: "t-probe", group: "g-probe", glyph }] };
};

test("G-GLYPH FIRES: a glyph is drawn but symbolDefs emitted no <symbol> for it", () => {
  // symbolDefs DROPS an id with no family rather than writing broken markup,
  // so without this loop the sheet would draw <use href="#nosuch"> at a symbol
  // that is not in the file — an invisible mark, and a silent one.
  const { spine, tree, lexicon } = typedTree({ glyph: "nosuch-family" });
  const out = drawAtlasSheet({ spine, tree, sheet: realSheet(), lexicon });
  assert.ok(
    out.problems.some((p) => p === 'G-GLYPH: glyph "nosuch-family" is drawn on this sheet but no <symbol> was emitted'),
    JSON.stringify(out.problems),
  );
  assert.ok(out.svg.includes('href="#nosuch-family"'), "the sheet did not actually draw the glyph");
  assert.ok(!out.svg.includes('<symbol id="nosuch-family"'), "a symbol WAS emitted; the fixture proves nothing");
});

test("G-GLYPH does NOT fire when the family exists — the rule is not just noise", () => {
  const { spine, tree, lexicon } = typedTree({ glyph: Object.keys(GLYPHS)[0] });
  const out = drawAtlasSheet({ spine, tree, sheet: realSheet(), lexicon });
  assert.deepEqual(
    out.problems.filter((p) => p.includes("no <symbol> was emitted")),
    [],
    JSON.stringify(out.problems),
  );
});

test("G-GLYPH FIRES: checkGlyphCoverage catches two groups sharing one glyph", () => {
  // The catalogue half. `alsoGroups` is a query tag, not a claim — two PRIMARY
  // groups keying the same mark means the reader cannot tell them apart.
  const { spine, tree } = realTree();
  const g = Object.keys(GLYPHS)[0];
  const lexicon = [
    { id: "t-a", group: "group-one", glyph: g },
    { id: "t-b", group: "group-two", glyph: g },
  ];
  const out = drawAtlasSheet({ spine, tree, sheet: realSheet(), lexicon });
  assert.ok(
    out.problems.some((p) => /^G-GLYPH: groups "group-one" and "group-two" share glyph/.test(p)),
    JSON.stringify(out.problems),
  );
});

// ── the atlas's G-BIOME-INK push, ARMED (seam-4 review B, survivor 4) ───────
//
// It was called `{ emittedIds: referencedPatterns, referencedIds:
// referencedPatterns }` — the same array twice — which the sibling canary's own
// comment says "can never fire". The two sides come from two places now, and
// `legendTier` is passed at all, which it was not.
// The two-fill fixture is SYNTHETIC. It used to lean on n-rimewall-cap being
// the one world child with `terrainKind: "ice"`; that broke when the generator
// started writing `terrainKind: null` on every continent (STATE §28 defect
// (a)) and the canary quietly became a one-pattern test. Injecting the kind on
// a clone measures the RULE — a tier that hides a drawn fill is reported —
// instead of the corpus, so it keeps measuring it whichever way the generator
// moves.
//
// The probe must be a REPORTED continent with no kind of its own: since the
// defect-(b)/(c) fix only a reported landmass takes a fill at all, injecting a
// kind onto surveyed ground would draw nothing and the canary would go silent
// for the second time. `terrainKind === null` stays a precondition rather than
// an overwrite, so a corpus where every reported landmass already has a kind
// fails loudly here instead of testing something else.
const terrainTree = ({ kind }) => {
  const { spine, tree } = realTree();
  const S = realSheet().subjects;
  const land = [...tree.byId.values()].find(
    (n) => n.parentId === S.rootId && n.tier === "continent" && !S.landIds.includes(n.id) &&
      n.lore?.reported === true && n.terrainKind === null,
  );
  assert.ok(land, "no reported continent without a terrainKind to hang one on");
  land.terrainKind = kind;
  return { spine, tree };
};

test("G-BIOME-INK FIRES on the atlas: a tier that hides a fill the chart draws", () => {
  // pIce is a tier-1 legend row, pReported a tier-2 one: at tier 0 both are
  // hidden, at tier 1 only pReported is.
  const { spine, tree } = terrainTree({ kind: "ice" });
  for (const [tier, want] of [[0, 2], [1, 1]]) {
    const out = drawAtlasSheet({ spine, tree, sheet: realSheet(), legendTier: tier });
    const hidden = out.problems.filter((p) =>
      new RegExp(`^G-BIOME-INK: pattern "p\\w+" is drawn at legend tier ${tier} but has no visible legend row$`).test(p),
    );
    assert.equal(hidden.length, want, `tier ${tier}: ${JSON.stringify(out.problems)}`);
  }
});

test("the atlas's committed legend tier explains every fill it draws", () => {
  const { problems } = buildAtlasSheet({ repoRoot: ROOT });
  assert.deepEqual(problems.filter((p) => p.startsWith("G-BIOME-INK")), [], problems.join("\n"));
  assert.equal(ATLAS_LEGEND_TIER, 2);
});


// ── the harbour predicate, ISOLATED (re-key review finding 4) ───────────────
//
// A harbour is DERIVED, not stamped: the closed attrs schema spends `role` on
// settlement rank, so what makes a town a harbour on this chart is that a
// charted sea-lane ENDS there (see harbourIds in atlas-sheet.mjs). Nothing
// tested that rule directly — the live chart's three harbours could have come
// from any predicate that happened to pick those three ids.
//
// SYNTHETIC, same trick as landformTree/terrainTree above: the edge list is
// replaced wholesale so the number under test is the fixture's, not the
// corpus's. Two of the three probe towns are the ends of the one sealane; the
// third is a COASTAL TOWN WITH NO LANE, which pins the semantics that matter —
// touching water is not what makes a harbour on this chart, and an edge of
// another kind between two towns does not make one either.
const harbourTree = () => {
  const { spine, tree } = realTree();
  const S = realSheet().subjects;
  const land = [...tree.byId.values()].find(
    (n) => n.parentId === S.rootId && n.tier === "continent" && !S.landIds.includes(n.id),
  );
  assert.ok(land, "no reported continent to hang probe towns on");
  const a = land.placement.anchor;
  const towns = [
    { id: "f-town-probe-lane-tail", name: "Probeport Tail", at: [a[0], a[1]] },
    { id: "f-town-probe-lane-head", name: "Probeport Head", at: [a[0] + 2, a[1]] },
    { id: "f-town-probe-no-lane", name: "Probeport Laneless", at: [a[0] + 4, a[1] + 2] },
  ];
  land.features = [
    ...(land.features ?? []),
    ...towns.map((t) => ({ id: t.id, kind: "point", at: t.at, attrs: { name: t.name, role: "hub" } })),
  ];
  // The WHOLE edge list, so no committed lane can contribute a harbour: what
  // survives the predicate must have come from these two edges alone.
  spine.edges = [
    {
      id: "e-probe-lane",
      kind: "sealane",
      from: { feature: towns[0].id },
      to: { feature: towns[1].id },
      attrs: { label: "the probe lane" },
    },
    // NOT a sealane. Its endpoints are towns and one of them is the laneless
    // coastal town, so a predicate that forgot to filter on kind would promote
    // it to a harbour and this fixture would catch it.
    {
      id: "e-probe-road",
      kind: "road",
      from: { feature: towns[2].id },
      to: { feature: towns[0].id },
      attrs: { label: "the probe road" },
    },
  ];
  return { spine, tree, towns };
};

test("a harbour is exactly a sealane endpoint — a coastal town with no lane is not one", () => {
  const { spine, tree, towns } = harbourTree();
  const { svg } = drawAtlasSheet({ spine, tree, sheet: realSheet() });
  // The harbour mark is the r=2 settlement circle; every other town on the
  // sheet (all 47 committed ones included) draws at r=1.1. EXACTLY two, so the
  // count is the fixture's two lane ends and cannot be world density.
  const harbourMarks = svg.match(/class="settlement-mark"[^>]*r="2"/g) ?? [];
  assert.equal(harbourMarks.length, 2, `${harbourMarks.length} harbour marks, expected the 2 lane ends`);
  // and the two that got them are the lane's own endpoints, by name — being a
  // harbour is also what earns a town its label on this sheet.
  assert.ok(svg.includes(esc(towns[0].name)), `${towns[0].name}: the lane's tail drew no harbour label`);
  assert.ok(svg.includes(esc(towns[1].name)), `${towns[1].name}: the lane's head drew no harbour label`);
  // THE SEMANTIC PIN: a town on the coast with no lane ending at it is not a
  // harbour here. It draws the plain settlement dot and no name at all.
  assert.ok(
    !svg.includes(esc(towns[2].name)),
    `${towns[2].name}: a town with no sealane was labelled as a harbour`,
  );
});

test("the harbour predicate follows the edge list — move the lane, move the harbours", () => {
  // The other direction: same three towns, the lane re-pointed at the town that
  // had none. A predicate keyed on anything else (coast proximity, role, id
  // order) would keep the old pair.
  const { spine, tree, towns } = harbourTree();
  spine.edges = [
    {
      id: "e-probe-lane",
      kind: "sealane",
      from: { feature: towns[0].id },
      to: { feature: towns[2].id },
      attrs: { label: "the probe lane" },
    },
  ];
  const { svg } = drawAtlasSheet({ spine, tree, sheet: realSheet() });
  assert.equal((svg.match(/class="settlement-mark"[^>]*r="2"/g) ?? []).length, 2);
  assert.ok(svg.includes(esc(towns[2].name)), "the new lane end did not become a harbour");
  assert.ok(!svg.includes(esc(towns[1].name)), "the old lane end is still drawn as a harbour");
});
