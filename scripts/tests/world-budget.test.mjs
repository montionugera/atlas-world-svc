// Plan B Task 5 — the grown vocabulary, the world budget file, and the two
// gates that read them. Both PRINT on every run (the G-LOAD-BUDGET /
// G-COMP-REPORT discipline) so drift is visible before it is a failure;
// G-LANDFORM SCORES coverage and fails only below the floor.
//
// Two deliberate departures from the plan's transcription of this file, both
// recorded so a reviewer does not have to discover them in a diff:
//
//  1. The gate runs IN-PROCESS via `runSpineGateInProcess` rather than
//     `execFileSync`. world-fill-STATE.md §4 names that export as the one new
//     gate fixture tests should use, and it resets all six module-level
//     bindings on entry. Seven spawns of a 0.6 s gate is 4 s of wall time this
//     file does not need to spend.
//  2. `tmpRoot()` puts the copied tree at `<tmp>/content`, not at `<tmp>`
//     itself. G-SHEET-BUDGET measures `<contentRoot>/../game-client/assets/
//     art/maps`, so a content root sitting directly in os.tmpdir() would
//     reach into a SHARED directory that other suites also write to. One
//     level of nesting makes every fixture's sheet census private, and is
//     what lets the sheet-cap rules below be tested at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  cpSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BIOMES, TERRAIN_KINDS, TERRAIN_IMPLIES } from "../lib/spine.mjs";
import { encodePng } from "../../tools/mapforge/lib/texture-bake.mjs";
import { runSpineGateInProcess } from "../check_content.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LEX_PATH = join(ROOT, "content/world/lexicon/landforms.json");
const LEX = JSON.parse(readFileSync(LEX_PATH, "utf8"));
const BUDGETS = JSON.parse(
  readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"),
);

// `<tmp>/content` — see note 2 in the header.
function tmpRoot() {
  const base = mkdtempSync(join(tmpdir(), "world-budget-"));
  const contentRoot = join(base, "content");
  cpSync(join(ROOT, "content"), contentRoot, { recursive: true });
  return {
    base,
    contentRoot,
    drop: () => rmSync(base, { recursive: true, force: true }),
  };
}
// EMPTY the world layer this fixture root inherited.
//
// `tmpRoot()` copies the REAL content/, and since Plan C Task 13 that carries
// 14 fabric files, 13 handle ledgers and 1,740 instances. Every test below
// that writes its OWN fabric stub is making a claim about a root holding
// exactly that stub — "0 instances", "120 instances", "types placed: 99 / 170"
// — and inheriting the committed world makes each of those claims a claim
// about the committed world instead. That is the same defect as a fixture that
// tests nothing: measured, "an EMPTY content/world/fabric/ directory arms
// nothing" read `types placed: 168 / 170` off the real fabric.
function emptyWorldLayer(contentRoot) {
  // Plan D Task 5 added content/world/civil/bound/ to the committed world:
  // 336 records that BIND to handle-ledger entries. A root stripped of
  // world/handles but still carrying the bound layer is not "an empty world
  // with one stub", it is 336 dangling-handle G-BIND failures — so the bound
  // layer goes with the ledgers it binds to.
  for (const fam of ["world/fabric", "world/handles", "world/civil/bound"])
    rmSync(join(contentRoot, fam), { recursive: true, force: true });
  mkdirSync(join(contentRoot, "world/fabric"), { recursive: true });
}
function runGate(contentRoot, ...extra) {
  return runSpineGateInProcess({
    argv: ["--content-root", contentRoot, "--only=spine", ...extra],
  });
}
const readNode = (contentRoot, id) =>
  JSON.parse(
    readFileSync(join(contentRoot, "spine/nodes", `${id}.json`), "utf8"),
  );
const writeNode = (contentRoot, id, doc) =>
  writeFileSync(
    join(contentRoot, "spine/nodes", `${id}.json`),
    JSON.stringify(doc, null, 2) + "\n",
  );
const writeJson = (path, doc) =>
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");

// ── the vocabulary ─────────────────────────────────────────────────────────

test("BIOMES is exactly the 20 pinned ids in the pinned order", () => {
  assert.deepEqual(
    [...BIOMES],
    [
      "ocean",
      "ice",
      "marsh",
      "river",
      "meadow",
      "forest",
      "bramble",
      "rock",
      "upland",
      "alkali",
      "ash",
      "built",
      "tundra",
      "lake",
      "scree",
      "karst",
      "badland",
      "desert",
      "lava",
      "reef",
    ],
  );
});

test("TERRAIN_KINDS is exactly the 18 pinned ids in the pinned order", () => {
  assert.deepEqual(
    [...TERRAIN_KINDS],
    [
      "ice",
      "upland",
      "alkali-flat",
      "rim",
      "bramble",
      "headland",
      "river-country",
      "tundra-steppe",
      "sand-sea",
      "badlands",
      "karst-plateau",
      "volcanic-arc",
      "lava-field",
      "cloud-forest",
      "reef-shelf",
      "fjordland",
      "lake-country",
      "tidal-mire",
    ],
  );
});

test("every terrain kind implies at least one biome, and every implied biome is a biome", () => {
  assert.equal(Object.keys(TERRAIN_IMPLIES).length, 18);
  for (const kind of TERRAIN_KINDS) {
    const implied = TERRAIN_IMPLIES[kind];
    assert.ok(
      Array.isArray(implied) && implied.length > 0,
      `${kind}: no implication`,
    );
    for (const b of implied)
      assert.ok(BIOMES.includes(b), `${kind} implies non-biome "${b}"`);
  }
});

// Plan Step 10 (b): a kind implying three or more biomes is unusable, because
// G-TERRAINKIND demands >= 15% of composition for EACH implied biome and a
// region has only 100 points to spend across everything else too.
test("no terrain kind implies three or more biomes", () => {
  for (const kind of TERRAIN_KINDS)
    assert.ok(
      TERRAIN_IMPLIES[kind].length <= 2,
      `${kind} implies ${TERRAIN_IMPLIES[kind].length} biomes — unusable under G-TERRAINKIND's 15% floor`,
    );
});

test("TERRAIN_IMPLIES has a row for every kind and no row for a non-kind", () => {
  assert.deepEqual(
    Object.keys(TERRAIN_IMPLIES).sort(),
    [...TERRAIN_KINDS].sort(),
  );
});

test("every biome named by a lexicon row is in BIOMES", () => {
  for (const r of LEX)
    for (const b of r.biomes)
      assert.ok(BIOMES.includes(b), `${r.id}: biome "${b}" is outside BIOMES`);
});

// The join above only bites if the lexicon actually EXERCISES the new half of
// the vocabulary. It does — 8 of the 19 distinct strings the 170 rows name
// were outside the old 12, across 93 rows. Without this assertion the join
// could be satisfied by a lexicon that never left the old vocabulary.
test("the lexicon exercises the 8 biomes Task 5 added", () => {
  const used = new Set(LEX.flatMap((r) => r.biomes));
  for (const b of [
    "tundra",
    "lake",
    "scree",
    "karst",
    "badland",
    "desert",
    "lava",
    "reef",
  ])
    assert.ok(used.has(b), `no lexicon row names the added biome "${b}"`);
});

// ── the budget file ────────────────────────────────────────────────────────

test("budgets.json pins cellKm and the landform + sheet caps", () => {
  assert.equal(BUDGETS.cellKm, 0.5);
  assert.deepEqual(BUDGETS.landforms, {
    maxInstances: 2400,
    maxNamed: 500,
    minTypes: 100,
    maxTypes: 200,
    typeCoverageFloor: 100,
    dungeonCapableTypes: 23,
  });
  // Plan B Task 11 added thumbWidthPx + maxThumbBytes: the committed raster is
  // a 512 px review thumb, the 2000 px ship raster is on demand and never
  // committed. deepEqual (not a subset check) is the point — a key added
  // without a `sheetsWhy` line beside it should red this test, which is how
  // the budget file keeps its stated reasons.
  assert.deepEqual(BUDGETS.sheets, {
    maxSheets: 18,
    maxSvgBytes: 524288,
    maxRasterSeconds: 2,
    // Plan B Task 12: the structural companion to maxSvgBytes. Bytes were the
    // only guard and they guarded nothing — 47 KB of sheet, 11.31 s of raster.
    maxPatternRectAreaRatio: 1.5,
    // F-047 seam-4 fix pass: the DIRECT half. The aggregate above passes a
    // two-zone regression (0.397 + 2 x 0.49 = 1.38); this fires on the first.
    maxPatternRectClipRatio: 3,
    rasterWidthPx: 2000,
    thumbWidthPx: 512,
    maxThumbBytes: 393216,
    // F-047 seam-4 fix pass: the FLOOR that did not exist. Every rule above
    // bounds a committed raster from the top; a blank one passed all of them.
    minThumbInkFraction: 0.02,
    minThumbInkRowFraction: 0.5,
    minThumbDistinctColours: 64,
  });
  for (const k of Object.keys(BUDGETS.sheets))
    assert.ok(
      typeof BUDGETS.sheetsWhy[k] === "string" &&
        BUDGETS.sheetsWhy[k].length > 40,
      `budgets.json sheets.${k} has no sheetsWhy line — a number without a stated reason`,
    );
});

// ── G-SHEET-BUDGET's structural half (Plan B Task 12) ──────────────────────
//
// POSITIVE CONTROL FIRST. The fixture below is the defect this rule was
// calibrated on, reduced to its shape: a sheet that draws its pattern fills as
// full-frame rects and clips each one down to a small zone. The real basin
// sheet measured 6.61x its own canvas that way, at 47 KB and 11.31 s. If this
// fixture ever stops failing, the rule has stopped covering the thing it was
// built for, whatever else is green.
const FRAME = 'width="1000" height="1000"';
const fullFrameRect = (id) =>
  `<rect x="0" y="0" width="1000" height="1000" fill="url(#pRim)" clip-path="url(#${id})"/>`;
const boundedRect = (id) =>
  `<rect x="10" y="10" width="120" height="120" fill="url(#pRim)" clip-path="url(#${id})"/>`;

test("G-SHEET-BUDGET: pattern rects that cover the frame and are clipped small are REJECTED", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  const rects = Array.from({ length: 12 }, (_, i) => fullFrameRect(`z${i}`)).join("");
  writeFileSync(join(maps, "greedy.svg"), `<svg ${FRAME}>${rects}</svg>`);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SHEET-BUDGET: sheet greedy\.svg pattern-filled rects cover 12\.00x its own canvas > budget 1\.5/);
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

test("G-SHEET-BUDGET: the same twelve fills, bounded to their clips, PASS", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  const rects = Array.from({ length: 12 }, (_, i) => boundedRect(`z${i}`)).join("");
  writeFileSync(join(maps, "bounded.svg"), `<svg ${FRAME}>${rects}</svg>`);
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^world-budget: sheet pattern-rect area 0\.17x canvas worst \(bounded\.svg\) \(budget 1\.5\)$/m);
  drop();
});

// The measurement PRINTS on every run, like every other budget in this file —
// a cap that has stopped measuring is invisible unless it says what it saw.
test("the gate PRINTS a world-budget line for sheet pattern area on every run", () => {
  const { base, contentRoot, drop } = tmpRoot();
  mkdirSync(join(base, "game-client/assets/art/maps"), { recursive: true });
  const r = runGate(contentRoot);
  assert.match(r.out, /^world-budget: sheet pattern-rect area 0\.00x canvas worst \(none\) \(budget 1\.5\)$/m);
  drop();
});

// A sheet with no pattern rect at all must not be asked for a canvas it has no
// reason to carry — the soft-skip discipline. `<svg/>` is a real fixture shape
// in this file and in three other suites.
test("G-SHEET-BUDGET: a sheet with no pattern fill needs no readable canvas", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(maps, "a.svg"), "<svg/>");
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /could not be measured/);
  drop();
});

// ...but a sheet that DOES pattern-fill and hides its canvas reports, rather
// than scoring zero. Silence is how a cap stops covering.
test("G-SHEET-BUDGET red, not silent: a pattern-filled sheet with no readable canvas", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(maps, "headless.svg"), `<svg viewBox="0 0 10 10">${fullFrameRect("z0")}</svg>`);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SHEET-BUDGET: sheet headless\.svg has no readable <svg width\/height>/);
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

test("G-SHEET-BUDGET red, not a throw: budgets.json sheets has no maxPatternRectAreaRatio", () => {
  const { base, contentRoot, drop } = tmpRoot();
  mkdirSync(join(base, "game-client/assets/art/maps"), { recursive: true });
  const b = structuredClone(BUDGETS);
  delete b.sheets.maxPatternRectAreaRatio;
  writeJson(join(contentRoot, "world/budgets.json"), b);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SHEET-BUDGET: world\/budgets\.json sheets has no numeric maxPatternRectAreaRatio/);
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

// ── G-SHEET-BUDGET's DIRECT half (F-047 seam-4 fix pass) ──────────────────
//
// THE POSITIVE CONTROL IS THE HOLE IN THE AGGREGATE RULE. Reviewer A measured
// it: cluster1's real pattern area is 0.397x its canvas, one full-frame rect
// adds 0.49, so TWO regressed zones score 1.38 and PASS the 1.5 cap. The
// fixture below is exactly that shape — a sheet whose aggregate is comfortably
// inside the cap and which has nonetheless gone back to painting the frame.
const withClip = (id, d) => `<clipPath id="${id}"><path d="${d}"/></clipPath>`;

test("G-SHEET-BUDGET: ONE regressed zone is caught, at an aggregate the old cap PASSES", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  // 1000x1000 canvas; one 120x120 zone painted with a full-frame rect.
  const svg =
    `<svg ${FRAME}><defs>${withClip("z0", "M10,10 L130,10 L130,130 L10,130 Z")}</defs>` +
    `<rect x="0" y="0" width="1000" height="1000" fill="url(#pRim)" clip-path="url(#z0)"/></svg>`;
  writeFileSync(join(maps, "one-regressed.svg"), svg);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  // The aggregate rule sees 1.00x and is HAPPY. That is the finding.
  assert.match(r.out, /^world-budget: sheet pattern-rect area 1\.00x canvas worst/m);
  assert.doesNotMatch(r.out, /pattern-filled rects cover .* > budget 1\.5/);
  // The direct rule is what fires.
  assert.match(
    r.out,
    /G-SHEET-BUDGET: sheet one-regressed\.svg <rect> fill clipped to #z0 covers 69\.44x that clip's own box > budget 3/,
  );
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

test("G-SHEET-BUDGET: the same fill BOUNDED to its clip passes both halves", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  const svg =
    `<svg ${FRAME}><defs>${withClip("z0", "M10,10 L130,10 L130,130 L10,130 Z")}</defs>` +
    `<rect x="8" y="8" width="124" height="124" fill="url(#pRim)" clip-path="url(#z0)"/></svg>`;
  writeFileSync(join(maps, "bounded-one.svg"), svg);
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^world-budget: pattern fill vs its own clip 1\.0\dx worst \(bounded-one\.svg z0\)/m);
  drop();
});

test("G-SHEET-BUDGET: an UNCLIPPED pattern fill is exempt — it is not hiding anything", () => {
  // The atlas legend draws 14 x 960 px^2 swatches and the canary 25 x 216 px^2,
  // all unclipped. A rule that policed those would be measuring the legend.
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  writeFileSync(
    join(maps, "legend.svg"),
    `<svg ${FRAME}><rect x="5" y="5" width="40" height="24" fill="url(#pRim)"/></svg>`,
  );
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /pattern fill vs its own clip 0\.00x worst \(none\) over 0 clipped fill\(s\), 0 unresolved/);
  drop();
});

test("G-SHEET-BUDGET: a clip the gate cannot resolve is COUNTED, not failed", () => {
  // The aggregate rule still sees the shape; hard-failing here would police the
  // fixtures above, which name clip ids they never define.
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(maps, "dangling.svg"), `<svg ${FRAME}>${fullFrameRect("nowhere")}</svg>`);
  const r = runGate(contentRoot);
  assert.match(r.out, /pattern fill vs its own clip 0\.00x worst \(none\) over 0 clipped fill\(s\), 1 unresolved/);
  // the aggregate rule still MEASURES it — the shape is not invisible, only
  // exempt from the per-clip ratio
  assert.match(r.out, /^world-budget: sheet pattern-rect area 1\.00x canvas worst \(dangling\.svg\)/m);
  assert.equal(r.code, 0, r.out);
  drop();
});

// Review A finding 4, second half: the aggregate rule read `<rect ...
// fill="url(#` and NOTHING else. Each shape below was invisible to it.
test("G-SHEET-BUDGET sees pattern fills the old regex could not: shapes and quoting", () => {
  const cases = [
    ['<circle cx="500" cy="500" r="500" fill="url(#pRim)"/>', "circle"],
    ['<ellipse cx="500" cy="500" rx="500" ry="500" fill="url(#pRim)"/>', "ellipse"],
    ['<polygon points="0,0 1000,0 1000,1000 0,1000" fill="url(#pRim)"/>', "polygon"],
    [`<rect x="0" y="0" width="1000" height="1000" fill='url(#pRim)'/>`, "single quotes"],
    ['<rect x="0" y="0" width="1000" height="1000" style="fill:url(#pRim)"/>', "style fill"],
  ];
  for (const [shape, label] of cases) {
    const { base, contentRoot, drop } = tmpRoot();
    const maps = join(base, "game-client/assets/art/maps");
    mkdirSync(maps, { recursive: true });
    // Two of them: one alone is 1.00x and inside the 1.5 cap.
    writeFileSync(join(maps, "hidden.svg"), `<svg ${FRAME}>${shape}${shape}</svg>`);
    const r = runGate(contentRoot);
    assert.equal(r.code, 1, `${label}: ${r.out}`);
    assert.match(r.out, /G-SHEET-BUDGET: sheet hidden\.svg pattern-filled rects cover 2\.00x/, label);
    drop();
  }
});

test("G-SHEET-BUDGET red, not a throw: budgets.json sheets has no maxPatternRectClipRatio", () => {
  const { base, contentRoot, drop } = tmpRoot();
  mkdirSync(join(base, "game-client/assets/art/maps"), { recursive: true });
  const b = structuredClone(BUDGETS);
  delete b.sheets.maxPatternRectClipRatio;
  writeJson(join(contentRoot, "world/budgets.json"), b);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SHEET-BUDGET: world\/budgets\.json sheets has no numeric maxPatternRectClipRatio/);
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

// ── the gate NEVER THROWS, even on a directory named like a sheet ──────────
//
// Seam-4 review A finding 3, reproduced and REAL. `readdirSync` lists a
// DIRECTORY named `weird.svg`, and `readFileSync` on it raises EISDIR. `fail()`
// only PUSHES onto a list that finish()/summaryLines() renders, so a throw
// anywhere in a gate means every failure already recorded is never printed.
// MEASURED both ways on this fixture: without the directory the run prints
// `FAIL  G-LANDFORM: 0 landform instances > budget -1` and a `content-gate:`
// summary; with it, both lines vanished and only a stack survived.
test("G-SHEET-BUDGET: a DIRECTORY named *.svg reports, and does not eat the report", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(join(maps, "weird.svg"), { recursive: true });
  // A real failure recorded BEFORE the sheet census runs. If the gate throws,
  // this line is the one that disappears — which is the whole finding.
  const b = structuredClone(BUDGETS);
  b.landforms.maxInstances = -1;
  writeJson(join(contentRoot, "world/budgets.json"), b);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.doesNotMatch(r.out, /check-content: \w*Error/, r.out);
  assert.match(r.out, /G-SHEET-BUDGET: sheet weird\.svg could not be read as a file/);
  // 1,740 since Plan C Task 13 committed the fabric; the number is the real
  // root's and the point of the line is that it SURVIVES the sheet census.
  assert.match(r.out, /G-LANDFORM: \d+ landform instances > budget -1/, "the earlier failure was dropped");
  assert.match(r.out, /^content-gate: .*failures/m, "finish() was skipped");
  drop();
});

test("G-SHEET-BUDGET: a DIRECTORY named *.png reports too, and still no throw", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(join(maps, "weird.png"), { recursive: true });
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.doesNotMatch(r.out, /check-content: \w*Error/, r.out);
  assert.match(r.out, /G-SHEET-BUDGET: thumb weird\.png could not be read as a file/);
  assert.match(r.out, /^content-gate: .*failures/m);
  drop();
});

// ── G-SHEET-BUDGET's INK floor (F-047 seam-4 fix pass) ─────────────────────
//
// POSITIVE CONTROL FIRST, and it is the exact defect: at d86f948 a blank 512 px
// PNG substituted for a committed thumb passed the storybook suite,
// check_render_lock, check_asset_manifest AND this gate. Nothing looked at a
// pixel. The blank page is built from the repo's own encoder rather than
// checked in, so the control cannot rot into agreement with the thumbs.
const solidPng = (w, h, rgb) => {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = rgb[0];
    rgba[i * 4 + 1] = rgb[1];
    rgba[i * 4 + 2] = rgb[2];
    rgba[i * 4 + 3] = 255;
  }
  const { dataUri, problems } = encodePng({ w, h, rgba });
  assert.deepEqual(problems, []);
  return Buffer.from(dataUri.slice("data:image/png;base64,".length), "base64");
};

test("G-SHEET-BUDGET: a BLANK committed thumb is REJECTED", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(maps, "blank.png"), solidPng(256, 256, [243, 231, 206]));
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SHEET-BUDGET: thumb blank\.png is 0\.00% ink < floor 2\.00%/);
  assert.match(r.out, /G-SHEET-BUDGET: thumb blank\.png has 1 distinct colours < floor 64/);
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

test("G-SHEET-BUDGET: a REAL committed thumb passes the same floor", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  cpSync(join(ROOT, "game-client/assets/art/maps/atlas-world.png"), join(maps, "atlas-world.png"));
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^world-budget: thumb ink 5\.\d\d% least \(atlas-world\.png\) of 1 thumb\(s\) \(floor 2\.00%\)$/m);
  drop();
});

test("G-SHEET-BUDGET: a thumb whose ink is all in ONE BAND is rejected on rows", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  // 300x300, the top 30 rows a 100-colour gradient, the rest parchment: 10% ink
  // and 100 colours — over both of those floors — on 10% of the scanlines.
  const w = 300, h = 300;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const band = y < 30;
      rgba[i] = band ? (x * 7) % 200 : 243;
      rgba[i + 1] = band ? 20 : 231;
      rgba[i + 2] = band ? 30 : 206;
      rgba[i + 3] = 255;
    }
  const { dataUri, problems } = encodePng({ w, h, rgba });
  assert.deepEqual(problems, []);
  writeFileSync(join(maps, "band.png"), Buffer.from(dataUri.slice("data:image/png;base64,".length), "base64"));
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SHEET-BUDGET: thumb band\.png draws on 10\.0% of its scanlines < floor 50\.0%/);
  assert.doesNotMatch(r.out, /is 0\.00% ink/, "the fraction floor should NOT be what caught this");
  drop();
});

// THE PNG SIGNATURE IS THE CLAIM. A file that says it is a PNG and then will
// not decode FAILS; a file that never said so warns and is left to
// check_asset_manifest. Both branches are pinned, because the difference is
// what keeps the ".svg only" fixture below (thirty 600 KB junk *.png files)
// green while a genuinely corrupt committed raster still goes red.
test("G-SHEET-BUDGET: a file that CLAIMS to be a PNG and will not decode FAILS", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  const real = solidPng(64, 64, [243, 231, 206]);
  writeFileSync(join(maps, "corrupt.png"), real.subarray(0, 40));
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SHEET-BUDGET: thumb corrupt\.png could not be measured for ink:/);
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

test("G-SHEET-BUDGET: a file that never claimed to be a PNG warns, and does not red the run", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(maps, "notreally.png"), Buffer.from("this is not a PNG, but it is long enough to be tested"));
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /WARN.*thumb notreally\.png could not be measured for ink: not a PNG/);
  drop();
});

// Soft-skip discipline: ~27-30 fixture roots have no sheets at all, and Plan
// C/D/E fixtures write .svg without a thumb beside it. An absent subject is
// not a failure — but the measurement still PRINTS, because a floor that has
// stopped measuring is invisible unless it says what it saw.
test("G-SHEET-BUDGET: a maps directory with no PNG is silent, and still prints", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(maps, "a.svg"), "<svg/>");
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^world-budget: thumb ink 0\.00% least \(none\) of 0 thumb\(s\) \(floor 2\.00%\)$/m);
  drop();
});

test("G-SHEET-BUDGET red, not a throw: budgets.json sheets has no ink floor", () => {
  for (const key of ["minThumbInkFraction", "minThumbInkRowFraction", "minThumbDistinctColours"]) {
    const { base, contentRoot, drop } = tmpRoot();
    mkdirSync(join(base, "game-client/assets/art/maps"), { recursive: true });
    const b = structuredClone(BUDGETS);
    delete b.sheets[key];
    writeJson(join(contentRoot, "world/budgets.json"), b);
    const r = runGate(contentRoot);
    assert.equal(r.code, 1, `${key}: ${r.out}`);
    assert.match(r.out, /G-SHEET-BUDGET: world\/budgets\.json sheets is missing a numeric minThumbInkFraction/);
    assert.doesNotMatch(r.out, /check-content: \w*Error/);
    drop();
  }
});

// Plan C adds `fabric`, `civil` and `loop` to this same file and owns
// G-WORLD-BUDGET. Until Plan C Task 1 this test asserted Task 5 had not
// PRE-EMPTED them (all three undefined); Task 1 landed them, so the same
// join now runs the other way — the three sections exist and are Plan C's,
// and the sections Plan B owns are still untouched beside them.
test("budgets.json carries Plan C's sections beside Plan B's, and both are intact", () => {
  for (const k of ["fabric", "civil", "loop"])
    assert.notEqual(
      BUDGETS[k],
      undefined,
      `budgets.json has lost Plan C's "${k}" section`,
    );
  assert.equal(BUDGETS.fabric.maxFiles, 20);
  assert.equal(BUDGETS.civil.maxFiles, 600);
  assert.equal(BUDGETS.loop.length, 6);
  // Plan B's two sections are the ones this file's other ~40 tests read.
  assert.equal(typeof BUDGETS.landforms, "object");
  assert.equal(typeof BUDGETS.sheets, "object");
});

// ── the printed record — a gate that passes may have stopped checking ──────

// On the REAL root, which since Plan C Task 13 carries the fabric — so this is
// no longer the "0 instances" degenerate case (that one has its own test
// below, on a root whose world layer is emptied first) but the live census.
test("the gate PRINTS a world-budget line for landforms on every run", () => {
  const { contentRoot, drop } = tmpRoot();
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^world-budget: landforms 170 types, 1740 instances \(budget 100-200 types, 2400 instances\)$/m,
  );
  assert.match(r.out, /^G-LANDFORM: types placed: 168 \/ 170$/m);
  drop();
});

test("the gate PRINTS a world-budget line for sheets when the maps dir exists", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(maps, "a.svg"), "<svg/>");
  writeFileSync(join(maps, "b.svg"), "<svg>xx</svg>");
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^world-budget: sheets 2 files, 13 bytes largest \(b\.svg\) \(budget 18, 524288\)$/m,
  );
  drop();
});

test("the real repo tree prints its own sheet census and stays inside budget", () => {
  const r = runGate(join(ROOT, "content"));
  assert.equal(r.code, 0, r.out);
  const m = r.out.match(
    /^world-budget: sheets (\d+) files, (\d+) bytes largest \((\S+)\) \(budget 18, 524288\)$/m,
  );
  assert.ok(m, `no sheet census line in:\n${r.out}`);
  assert.ok(
    Number(m[1]) <= 18 && Number(m[2]) <= 524288,
    `sheet census out of budget: ${m[0]}`,
  );
});

// ── G-LANDFORM reds ────────────────────────────────────────────────────────

test("G-LANDFORM red: a spine feature cites a type that is not in the lexicon", () => {
  const { contentRoot, drop } = tmpRoot();
  const doc = readNode(contentRoot, "n-cluster1");
  doc.features[0].type = "not-a-landform";
  writeNode(contentRoot, "n-cluster1", doc);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-LANDFORM: .*type "not-a-landform" is not in the lexicon/,
  );
  drop();
});

test("G-LANDFORM red: a feature's kind contradicts its lexicon geometry", () => {
  const { contentRoot, drop } = tmpRoot();
  const doc = readNode(contentRoot, "n-cluster1");
  const line = doc.features.find((f) => f.kind === "line");
  line.type = "karst-cenote"; // lexicon geometry is "point"
  writeNode(contentRoot, "n-cluster1", doc);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-LANDFORM: .*kind "line" but lexicon geometry is "point"/,
  );
  drop();
});

// A feature whose type MATCHES its lexicon geometry is not a failure — the
// rule above must reject the contradiction, not the citation.
test("G-LANDFORM green: a feature citing a type of its own geometry", () => {
  const { contentRoot, drop } = tmpRoot();
  const doc = readNode(contentRoot, "n-cluster1");
  doc.features.find((f) => f.kind === "point").type = "karst-cenote";
  writeNode(contentRoot, "n-cluster1", doc);
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  drop();
});

test("G-LANDFORM red: the catalogue falls outside the 100-200 type band", () => {
  const { contentRoot, drop } = tmpRoot();
  writeJson(
    join(contentRoot, "world/lexicon/landforms.json"),
    LEX.slice(0, 42),
  );
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-LANDFORM: catalogue holds 42 types — budget is 100-200/,
  );
  drop();
});

test("G-LANDFORM red: the dungeonCapable count drifts off the pinned 23", () => {
  const { contentRoot, drop } = tmpRoot();
  const lex = structuredClone(LEX);
  lex.find((r) => r.dungeonCapable).dungeonCapable = false;
  writeJson(join(contentRoot, "world/lexicon/landforms.json"), lex);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-LANDFORM: 22 dungeonCapable types, budget pins 23/);
  drop();
});

// The label is repo-relative, like every sibling message. An absolute path
// here moves with the content root, so a fixture could never pin the line.
test("G-LANDFORM red: the lexicon file is missing under an existing content/world/", () => {
  const { contentRoot, drop } = tmpRoot();
  rmSync(join(contentRoot, "world/lexicon"), { recursive: true, force: true });
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /^FAIL {2}G-LANDFORM: world\/lexicon\/landforms\.json is missing$/m,
  );
  drop();
});

// The lexicon <-> BIOMES join as a GATE rule, not only a unit test on the
// repo's own file: any other content root — a fixture, Plan C's generated
// lexicon — could name a biome the spine vocabulary lacks, and before this
// the gate exited 0 on it.
test("G-LANDFORM red: a lexicon row names a biome outside BIOMES", () => {
  const { contentRoot, drop } = tmpRoot();
  const lex = structuredClone(LEX);
  lex[0].biomes = ["swamp"];
  writeJson(join(contentRoot, "world/lexicon/landforms.json"), lex);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    new RegExp(
      `G-LANDFORM: type "${lex[0].id}": biome "swamp" is outside BIOMES`,
    ),
  );
  drop();
});

test("G-LANDFORM red, not a throw: a lexicon row's biomes is not an array", () => {
  const { contentRoot, drop } = tmpRoot();
  const lex = structuredClone(LEX);
  lex[0].biomes = "forest";
  writeJson(join(contentRoot, "world/lexicon/landforms.json"), lex);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    new RegExp(`G-LANDFORM: type "${lex[0].id}": biomes is not an array`),
  );
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

// typeof [] === "object", so a section saved as a list used to pass the guard,
// destructure to six `undefined`s, and silently switch the catalogue-band rule
// off inside a run that still exited 1 for another reason.
test("G-LANDFORM red, not a throw: the landforms section is an array", () => {
  const { contentRoot, drop } = tmpRoot();
  const b = structuredClone(BUDGETS);
  b.landforms = [];
  writeJson(join(contentRoot, "world/budgets.json"), b);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-LANDFORM: world\/budgets\.json has no landforms section/,
  );
  assert.doesNotMatch(r.out, /budget undefined-undefined/);
  drop();
});

// Trap 6: a gate function never throws. A malformed catalogue or budget file
// is ordinary bad content and must report, not take down finish() and silently
// drop every failure recorded before it.
test("G-LANDFORM red, not a throw: the lexicon is a JSON object instead of an array", () => {
  const { contentRoot, drop } = tmpRoot();
  writeJson(join(contentRoot, "world/lexicon/landforms.json"), { rows: LEX });
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-LANDFORM: .*landforms\.json is not a JSON array/);
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

test("G-LANDFORM red, not a throw: budgets.json has no landforms section", () => {
  const { contentRoot, drop } = tmpRoot();
  const b = structuredClone(BUDGETS);
  delete b.landforms;
  writeJson(join(contentRoot, "world/budgets.json"), b);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-LANDFORM: world\/budgets\.json has no landforms section/,
  );
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

test("G-SHEET-BUDGET red, not a throw: budgets.json has no sheets section", () => {
  const { base, contentRoot, drop } = tmpRoot();
  mkdirSync(join(base, "game-client/assets/art/maps"), { recursive: true });
  const b = structuredClone(BUDGETS);
  delete b.sheets;
  writeJson(join(contentRoot, "world/budgets.json"), b);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-SHEET-BUDGET: world\/budgets\.json has no sheets section/,
  );
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

// Same array hole as the landforms section: typeof [] === "object" passed the
// guard and both sheet caps then compared against `undefined`, i.e. never.
test("G-SHEET-BUDGET red, not a throw: the sheets section is an array", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  for (let i = 0; i < 19; i++) writeFileSync(join(maps, `s${i}.svg`), "<svg/>");
  const b = structuredClone(BUDGETS);
  b.sheets = [];
  writeJson(join(contentRoot, "world/budgets.json"), b);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-SHEET-BUDGET: world\/budgets\.json has no sheets section/,
  );
  assert.doesNotMatch(r.out, /budget undefined, undefined/);
  drop();
});


// ── the fabric stubs, made SCHEMA-VALID by Plan C Task 11 ──────────────────
//
// These fixtures existed before content/schemas/fabric-file.schema.json did,
// so they wrote `{ instances: [...] }` — the two keys G-LANDFORM reads and
// nothing else — into a path that now has a shape and four gates over it.
// Task 11 gave `world/fabric/*.json` an ajv venue, so a fifteen-key-short stub
// is a schema failure that has nothing to do with the rule under test.
//
// `writeFabric` wraps whatever instance rows a test wants in a document that is
// legal, and it chooses the regions so that no OTHER gate has an opinion:
// every region is `reported`, which makes each one's G-POI count exactly 0
// (instances are POIs only in a surveyed region), and the rows are dealt
// round-robin so at most one NAMED instance lands in any region — spec §6.4
// rule 2's "at most one named landform". Nothing about G-LANDFORM's census
// changes: it counts rows across the file, never per region.
const REGION_CAPACITY = 25;
// Every region is SURVEYED once there are at least twelve rows, because
// round-robin dealing then puts 12-25 instances in each — inside G-POI's 12-30
// band by construction — and a surveyed region has no cap on NAMED landforms,
// which two of these fixtures deliberately exceed. Below twelve rows the
// regions are REPORTED, whose POI count must be exactly 0 and is.
const fabricRegion = (n, survey) => ({
  id: `c01/r${String(n).padStart(2, "0")}`, survey,
  areaKm2: survey === "surveyed" ? 160 : 480,
  terrainKind: null, biomeShares: { rock: 100 },
  rings: [[[n, 0], [n + 1, 0], [n + 1, 1], [n, 1]]], holes: [],
  levelBand: [1, 10], adjacent: [], centroidKm: [n + 0.5, 0.5],
  settlements: [], provenance: survey === "reported" ? "hearsay" : null,
});
function writeFabric(contentRoot, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const survey = list.length >= 12 ? "surveyed" : "reported";
  const nRegions = Math.max(1, Math.ceil(list.length / REGION_CAPACITY));
  const regions = Array.from({ length: nRegions }, (_, n) => fabricRegion(n + 1, survey));
  const instances = list.map((row, i) => {
    const region = regions[i % nRegions];
    // The row's own fields win — that is what these fixtures are for — EXCEPT
    // `id` and `region`, which have a grammar the schema enforces and which no
    // G-LANDFORM assertion reads.
    const { id: _ignoredId, region: _ignoredRegion, ...rest } = row;
    return {
      id: `lf-c01-${region.id.slice(-3)}-${String(i).padStart(4, "0")}`,
      type: "sea-stack",
      geometry: { shape: "point", at: [(i % 800) * 0.01, 0.5] }, sizeKm: 0.2, cell: [i % 800, 0],
      handle: `c01/coastal/h-${String(i % 1000000).padStart(6, "0")}`,
      named: false, glyph: "g-stack", dungeonCapable: false,
      provenance: { authored: "generated", fabric: "fabric/c01",
                    generator: { pass: "landforms", seedStream: "landform:c01", epoch: 0 } },
      ...rest,
      region: region.id,
    };
  });
  writeJson(join(contentRoot, "world/fabric/c01.json"), {
    continent: "c01", premise: "content/world/premises/continent-01.json",
    generator: { name: "mapforge", version: "3.0.0", seed: "7c9e4a2f8b1d6e03", epoch: 0 },
    seaLevel: 0.42, cellKm: 0.5,
    cellCensus: { land: 100, lake: 0, unowned: 0 },
    ownerHistogram: Object.fromEntries(regions.map((r) => [r.id, 1])),
    outerRing: null, outerHoles: [], trunkRiver: null,
    regions,
    // A non-array `rows` is written through VERBATIM: the "instances is not an
    // array" fixture needs a document that is legal everywhere else so the two
    // venues that object — G-LANDFORM's message and the schema's — are the only
    // things it hears.
    instances: Array.isArray(rows) ? instances : rows,
    settlements: [], roads: [], dungeonAnchors: [], pinReceipts: [],
  });
}

// ── the instance census, dormant until Plan C writes content/world/fabric/ ──

// R8 — degrade, never deadlock. `mkdir content/world/fabric` is Plan C's very
// first commit, and it used to arm the coverage floor plus all 170
// absentBecause rules at once: 171 failures for creating a folder. An empty
// container is not content, so the census arms on INSTANCES.
test("degrade: an EMPTY content/world/fabric/ directory arms nothing", () => {
  const { contentRoot, drop } = tmpRoot();
  emptyWorldLayer(contentRoot);
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^G-LANDFORM: types placed: 0 \/ 170$/m);
  assert.doesNotMatch(r.out, /below the floor|no absentBecause/);
  // …and it stays green under Gate 2's flag too: an empty dir is not a
  // half-built world, it is no world.
  const rc = runGate(contentRoot, "--require-complete");
  assert.equal(rc.code, 0, rc.out);
  drop();
});

// The same, one step later: fabric files exist but hold no instances yet.
test("degrade: fabric files with empty instance arrays arm nothing", () => {
  const { contentRoot, drop } = tmpRoot();
  emptyWorldLayer(contentRoot);
  writeFabric(contentRoot, []);
  const r = runGate(contentRoot, "--require-complete");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^G-LANDFORM: types placed: 0 \/ 170$/m);
  assert.doesNotMatch(r.out, /below the floor|no absentBecause/);
  drop();
});

test("G-LANDFORM counts fabric instances and scores type coverage", () => {
  const { contentRoot, drop } = tmpRoot();
  emptyWorldLayer(contentRoot);
  const ids = LEX.slice(0, 120).map((r) => r.id);
  writeFabric(contentRoot, ids.map((id, i) => ({ type: id, named: i < 3 })));
  const r = runGate(contentRoot, "--require-complete");
  assert.match(
    r.out,
    /^world-budget: landforms 170 types, 120 instances \(budget 100-200 types, 2400 instances\)$/m,
  );
  assert.match(r.out, /^G-LANDFORM: types placed: 120 \/ 170$/m);
  // 120 clears the floor of 100, so this passes even under Gate 2's flag —
  // which is the whole point of pinning the floor at 100. The 50 unplaced
  // rows are REPORTED, aggregated and capped, never failed: as a failure that
  // rule demanded 170/170 and made budgets.json's own number unreachable.
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^WARN {2}G-LANDFORM: 50 type\(s\) have 0 instances and no absentBecause: \S+, \S+, \S+, \S+, \S+ \(\+45 more\)$/m,
  );
  drop();
});

// The floor is a real, reachable rule — and it ESCALATES: a warning while the
// fabric is being built (precheck.sh, CI's bare sweep), a failure only under
// --require-complete, which is Gate 2 at promote.
test("G-LANDFORM: type coverage below the floor WARNs by default", () => {
  const { contentRoot, drop } = tmpRoot();
  emptyWorldLayer(contentRoot);
  writeFabric(contentRoot, LEX.slice(0, 99).map((r, i) => ({ id: `i-${i}`, type: r.id })));
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^WARN {2}G-LANDFORM: types placed: 99 \/ 170 — below the floor of 100$/m,
  );
  drop();
});

test("G-LANDFORM red: type coverage below the floor under --require-complete", () => {
  const { contentRoot, drop } = tmpRoot();
  emptyWorldLayer(contentRoot);
  writeFabric(contentRoot, LEX.slice(0, 99).map((r, i) => ({ id: `i-${i}`, type: r.id })));
  const r = runGate(contentRoot, "--require-complete");
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /^FAIL {2}G-LANDFORM: types placed: 99 \/ 170 — below the floor of 100$/m,
  );
  drop();
});

// absentBecause's teeth: a declared reason for absence contradicted by a real
// instance is a lie in the catalogue. Always a failure — nothing reaches it
// until an author writes a reason, so it can never deadlock.
test("G-LANDFORM red: a type declares absentBecause and is placed anyway", () => {
  const { contentRoot, drop } = tmpRoot();
  emptyWorldLayer(contentRoot);
  const lex = structuredClone(LEX);
  lex[0].absentBecause = "no terrain in Season 1 supports it";
  writeJson(join(contentRoot, "world/lexicon/landforms.json"), lex);
  writeFabric(contentRoot, LEX.slice(0, 120).map((r, i) => ({ id: `i-${i}`, type: r.id })));
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    new RegExp(
      `G-LANDFORM: type "${lex[0].id}" declares absentBecause .* but has instances`,
    ),
  );
  drop();
});

// …and a HONEST declaration excuses the row from the shortfall report.
test("G-LANDFORM: a declared-absent type is excused from the shortfall report", () => {
  const { contentRoot, drop } = tmpRoot();
  emptyWorldLayer(contentRoot);
  const lex = structuredClone(LEX);
  for (const row of lex.slice(120))
    row.absentBecause = "out of scope for Season 1";
  writeJson(join(contentRoot, "world/lexicon/landforms.json"), lex);
  writeFabric(contentRoot, LEX.slice(0, 120).map((r, i) => ({ id: `i-${i}`, type: r.id })));
  const r = runGate(contentRoot, "--require-complete");
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /no absentBecause/);
  drop();
});

test("G-LANDFORM red: more instances than the budget allows", () => {
  const { contentRoot, drop } = tmpRoot();
  emptyWorldLayer(contentRoot);
  const instances = [];
  for (let i = 0; i < 2401; i++)
    instances.push({ id: `i-${i}`, type: LEX[i % LEX.length].id });
  writeFabric(contentRoot, instances);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-LANDFORM: 2401 landform instances > budget 2400/);
  drop();
});

test("G-LANDFORM red: more named landforms than the budget allows", () => {
  const { contentRoot, drop } = tmpRoot();
  emptyWorldLayer(contentRoot);
  const instances = [];
  for (let i = 0; i < 501; i++)
    instances.push({ id: `i-${i}`, type: LEX[i % LEX.length].id, named: true });
  writeFabric(contentRoot, instances);
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-LANDFORM: 501 named landforms > budget 500/);
  drop();
});

test("G-LANDFORM red, not a throw: a fabric file whose instances are not an array", () => {
  const { contentRoot, drop } = tmpRoot();
  emptyWorldLayer(contentRoot);
  writeFabric(contentRoot, { a: 1 });
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-LANDFORM: world\/fabric\/c01\.json: instances is not an array/,
  );
  assert.doesNotMatch(r.out, /check-content: \w*Error/);
  drop();
});

// ── G-SHEET-BUDGET reds ────────────────────────────────────────────────────

test("G-SHEET-BUDGET red: more sheets than the roster allows", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  for (let i = 0; i < 19; i++) writeFileSync(join(maps, `s${i}.svg`), "<svg/>");
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SHEET-BUDGET: 19 sheets > budget 18/);
  drop();
});

test("G-SHEET-BUDGET red: one sheet over the SVG byte cap", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(maps, "fat.svg"), "x".repeat(524289));
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(
    r.out,
    /G-SHEET-BUDGET: sheet fat\.svg is 524289 bytes > budget 524288/,
  );
  drop();
});

// …but a case-only rename must not walk past either cap. macOS preserves
// case, so `Basin.SVG` is a real sheet that `.endsWith(".svg")` could not see:
// nineteen of them censused as 0 files and exited 0.
test("G-SHEET-BUDGET is case-insensitive: .SVG sheets still count", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  for (let i = 0; i < 19; i++) writeFileSync(join(maps, `S${i}.SVG`), "<svg/>");
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-SHEET-BUDGET: 19 sheets > budget 18/);
  drop();
});

// A .png beside the .svg must not be counted — the two committed sheets ship
// with one each, so counting every file would read 4 sheets, not 2.
test("G-SHEET-BUDGET counts .svg only", () => {
  const { base, contentRoot, drop } = tmpRoot();
  const maps = join(base, "game-client/assets/art/maps");
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(maps, "a.svg"), "<svg/>");
  for (let i = 0; i < 30; i++)
    writeFileSync(join(maps, `p${i}.png`), "x".repeat(600000));
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^world-budget: sheets 1 files, 6 bytes largest \(a\.svg\) \(budget 18, 524288\)$/m,
  );
  drop();
});

// ── soft-skip: ~27 fixture roots have no content/world/ at all ─────────────

test("soft-skip: a content root with no content/world/ is still green", () => {
  const { contentRoot, drop } = tmpRoot();
  rmSync(join(contentRoot, "world"), { recursive: true, force: true });
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /G-LANDFORM|G-SHEET-BUDGET|world-budget/);
  drop();
});

// budgets.json's absence is Plan C's G-WORLD-BUDGET to report, not this
// gate's — so the lexicon half must go quiet too rather than half-report.
// gSpineWorld's budgets-file-missing branch stays quiet — that is what this
// test pinned before Plan C. It is still pinned: G-LANDFORM and G-SHEET-BUDGET
// say nothing. What CHANGED is that the file now has an owner: Plan C Task 1's
// G-WORLD-BUDGET holds this file's existence check, so a world root with no
// budgets.json is a FAILURE, spoken by exactly one gate rather than by none.
test("content/world/ without budgets.json: Plan B's gates stay quiet, G-WORLD-BUDGET speaks", () => {
  const { contentRoot, drop } = tmpRoot();
  rmSync(join(contentRoot, "world/budgets.json"), { force: true });
  const r = runGate(contentRoot);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /G-WORLD-BUDGET: world\/budgets\.json is missing/);
  assert.doesNotMatch(r.out, /G-LANDFORM|G-SHEET-BUDGET/);
  // Exactly one gate speaks: no double-report of the same absent file.
  assert.equal((r.out.match(/world\/budgets\.json is missing/g) ?? []).length, 1, r.out);
  drop();
});

// The load-bearing half of the soft-skip: a MINIMAL root — no content/world/,
// no game-client sibling — is exactly the shape of the ~27 fixture roots under
// scripts/tests/fixtures/spine/, which is the whole reason the skip exists.
// Built the way spine-gates.test.mjs' spineFixture() builds it, including the
// `check_spine_emit --write` pass that fills `derived`.
test("soft-skip: the minimal spine fixture root stays green", () => {
  const base = mkdtempSync(join(tmpdir(), "world-budget-min-"));
  const contentRoot = join(base, "content");
  cpSync(join(ROOT, "scripts/tests/fixtures/spine/base"), contentRoot, {
    recursive: true,
  });
  cpSync(
    join(ROOT, "content/schemas/spine-node.schema.json"),
    join(contentRoot, "schemas/spine-node.schema.json"),
    { recursive: true },
  );
  cpSync(
    join(ROOT, "content/schemas/spine-edge.schema.json"),
    join(contentRoot, "schemas/spine-edge.schema.json"),
    { recursive: true },
  );
  execFileSync(process.execPath, [
    join(ROOT, "scripts/check_spine_emit.mjs"),
    "--write",
    "--content-root",
    contentRoot,
  ]);
  const r = runGate(contentRoot);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /G-LANDFORM|G-SHEET-BUDGET|world-budget/);
  rmSync(base, { recursive: true, force: true });
});
