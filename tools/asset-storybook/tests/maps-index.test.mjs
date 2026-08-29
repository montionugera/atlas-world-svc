// F-044 — Maps tab parity gate.
//
// maps-index.json (committed, sibling to this test's tools/asset-storybook/)
// is the storybook's OWN registry of mapforge sheets. It must never drift
// from tools/mapforge/render-sheet.mjs's SHEETS export — the source of truth
// for which sheets exist and where they're written. This is the
// "every produced artifact must be observable in a review surface" rule
// (owner intent, 2026-08-15) made mechanical: add a third sheet to SHEETS
// without indexing it here, and this suite goes red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SHEETS } from "../../mapforge/render-sheet.mjs";
import { inkStats } from "../../mapforge/lib/png-ink.mjs";
import { encodePng } from "../../mapforge/lib/texture-bake.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const STORYBOOK_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(STORYBOOK_ROOT, "../..");
const INDEX_PATH = join(STORYBOOK_ROOT, "maps-index.json");

function loadIndex() {
  const raw = readFileSync(INDEX_PATH, "utf8");
  return JSON.parse(raw);
}

test("maps-index.json exists and is well-formed", () => {
  const index = loadIndex();
  assert.ok(Array.isArray(index.sheets), "index.sheets must be an array");
  assert.ok(index.sheets.length > 0, "index.sheets must not be empty");
});

test("every mapforge SHEETS id appears in maps-index.json", () => {
  const index = loadIndex();
  const indexedIds = new Set(index.sheets.map((s) => s.id));
  for (const id of Object.keys(SHEETS)) {
    assert.ok(
      indexedIds.has(id),
      `sheet "${id}" is registered in tools/mapforge/render-sheet.mjs SHEETS ` +
        `but missing from tools/asset-storybook/maps-index.json`,
    );
  }
});

test("every indexed sheet's svg/png paths match SHEETS and exist on disk", () => {
  const index = loadIndex();
  for (const sheet of index.sheets) {
    const registrySheet = SHEETS[sheet.id];
    assert.ok(
      registrySheet,
      `maps-index.json row "${sheet.id}" has no matching SHEETS entry`,
    );
    assert.equal(
      sheet.svg,
      registrySheet.outSvg,
      `maps-index.json "${sheet.id}".svg must match SHEETS[${sheet.id}].outSvg`,
    );
    assert.equal(
      sheet.png,
      registrySheet.outPng,
      `maps-index.json "${sheet.id}".png must match SHEETS[${sheet.id}].outPng`,
    );
    assert.ok(
      existsSync(join(REPO_ROOT, sheet.svg)),
      `${sheet.svg} does not exist on disk`,
    );
    assert.ok(
      existsSync(join(REPO_ROOT, sheet.png)),
      `${sheet.png} does not exist on disk`,
    );
  }
});

// Plan B Task 11 — PNGs left the review loop (spec 2026-08-16 §7.5). What is
// committed at SHEETS[id].outPng is a <= `thumbWidthPx` REVIEW THUMB, because
// F-044 proved SVG ink vanishes at card scale, so the storybook card cannot
// simply point at the vector. The 2000 px ship raster is produced on demand
// with `--png-width 2000` and is NEVER committed: .gitattributes:29 puts
// game-client/assets/**/*.png in LFS but not *.svg, so every redraw of a full
// sheet roster at ship width is tens of MB of undeduplicated LFS blobs. The
// synthetic canary alone was 2,534,694 B before this rule existed.
//
// The budget lives in content/world/budgets.json so the number has one home
// and a stated reason (`sheetsWhy`), not three copies.
test("every committed sheet PNG is a review THUMB, not a ship raster", () => {
  const index = loadIndex();
  const budgets = JSON.parse(
    readFileSync(join(REPO_ROOT, "content/world/budgets.json"), "utf8"),
  );
  const max = budgets.sheets.maxThumbBytes;
  assert.equal(
    typeof max,
    "number",
    "content/world/budgets.json sheets.maxThumbBytes must be a number",
  );
  for (const sheet of index.sheets) {
    const bytes = statSync(join(REPO_ROOT, sheet.png)).size;
    assert.ok(
      bytes <= max,
      `${sheet.png} is ${bytes} bytes — a committed sheet PNG must be a ` +
        `<= ${budgets.sheets.thumbWidthPx} px thumb (budget ${max}); re-bake ` +
        `with \`node tools/mapforge/render-sheet.mjs --sheet ${sheet.id} --png\``,
    );
  }
});

/**
 * A PNG's pixel width, straight out of the IHDR chunk — bytes 16-19,
 * big-endian, right after the 8-byte signature and the 8-byte chunk header.
 * Parsed here rather than imported because this suite runs in Gate 1 AND in
 * CI, and `sharp` lives in scripts/, which the storybook tests do not install.
 */
function pngWidth(absPath) {
  const head = readFileSync(absPath).subarray(0, 24);
  assert.equal(
    head.subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
    `${absPath} is not a PNG`,
  );
  return head.readUInt32BE(16);
}

// The byte cap alone does NOT enforce the policy, and adversarial review
// proved it: `--png --png-width 2000` on the atlas sheet produces a 2000 px
// SHIP RASTER of 373,157 B, which is UNDER the 393,216 B cap. Committed by
// mistake it would pass every other mechanism — check_render_lock.mjs hashes
// only the SVGs, and art-manifest.json's `"width": 512` is prose. So the
// width claim is checked against the actual file, not against the budget's
// own copy of the number.
test("every committed sheet PNG is at the thumb WIDTH, not merely under the byte cap", () => {
  const budgets = JSON.parse(
    readFileSync(join(REPO_ROOT, "content/world/budgets.json"), "utf8"),
  );
  const want = budgets.sheets.thumbWidthPx;
  assert.equal(typeof want, "number");
  for (const sheet of loadIndex().sheets) {
    const abs = join(REPO_ROOT, sheet.png);
    assert.equal(
      pngWidth(abs),
      want,
      `${sheet.png} is ${pngWidth(abs)} px wide, not ${want} — a committed ` +
        `sheet PNG is a review thumb; the ship raster (--png-width ` +
        `${budgets.sheets.rasterWidthPx}) is never committed. Re-bake with ` +
        `\`node tools/mapforge/render-sheet.mjs --sheet ${sheet.id} --png\``,
    );
  }
});

// ── THE INK FLOOR (F-047 seam-4 fix pass) ─────────────────────────────────
//
// Every rule above binds a committed thumb from ABOVE — under a byte cap, at
// exactly this width — and none of them looks at a pixel. Both seam-4
// reviewers found the consequence independently: a blank 512 px PNG dropped
// in place of the atlas thumb left THIS SUITE 47/0 and check_render_lock,
// check_asset_manifest and check_content all clean. The review surface could
// silently go blank, which is exactly what the owner's standing
// every-artifact-observable rule (2026-08-15) exists to prevent.
//
// The measure decodes the committed bytes (tools/mapforge/lib/png-ink.mjs) and
// needs no rendering library, so unlike G-RASTER-BUDGET it runs HERE — Gate 1
// and CI — and in check_content.mjs's G-SHEET-BUDGET. Three venues, none of
// them needing librsvg.
//
// POSITIVE CONTROL FIRST, and it is not a fixture file: the blank page is
// built here from the repo's own encoder, so the control cannot rot into
// agreement with whatever the thumbs happen to be.
const blankThumb = (w, h) => {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 243;
    rgba[i * 4 + 1] = 231;
    rgba[i * 4 + 2] = 206;
    rgba[i * 4 + 3] = 255;
  }
  const { dataUri, problems } = encodePng({ w, h, rgba });
  assert.deepEqual(problems, [], "the blank control could not be encoded");
  return Buffer.from(dataUri.slice("data:image/png;base64,".length), "base64");
};

test("a BLANK thumb is rejected by the same measure the committed ones pass", () => {
  const budgets = JSON.parse(
    readFileSync(join(REPO_ROOT, "content/world/budgets.json"), "utf8"),
  );
  const st = inkStats(blankThumb(budgets.sheets.thumbWidthPx, 570));
  assert.equal(st.error, undefined, st.error);
  assert.ok(
    st.inkFraction < budgets.sheets.minThumbInkFraction,
    `a blank page measured ${st.inkFraction} ink — the floor has stopped separating blank from drawn`,
  );
  assert.ok(st.distinct < budgets.sheets.minThumbDistinctColours);
});

test("every committed sheet PNG carries INK, not just bytes and a width", () => {
  const budgets = JSON.parse(
    readFileSync(join(REPO_ROOT, "content/world/budgets.json"), "utf8"),
  );
  const { minThumbInkFraction, minThumbInkRowFraction, minThumbDistinctColours } =
    budgets.sheets;
  for (const k of [minThumbInkFraction, minThumbInkRowFraction, minThumbDistinctColours])
    assert.equal(typeof k, "number", "budgets.json sheets is missing an ink floor");
  const sheets = loadIndex().sheets;
  assert.ok(sheets.length > 0, "an empty roster passes this test vacuously");
  for (const sheet of sheets) {
    const st = inkStats(readFileSync(join(REPO_ROOT, sheet.png)));
    assert.equal(st.error, undefined, `${sheet.png}: ${st.error}`);
    assert.ok(
      st.inkFraction >= minThumbInkFraction,
      `${sheet.png} is ${(st.inkFraction * 100).toFixed(2)}% ink, floor ` +
        `${(minThumbInkFraction * 100).toFixed(2)}% — a committed raster that is ` +
        `blank passes every OTHER rule about it. Re-bake with \`node ` +
        `scripts/bake_thumbnails.mjs\` and look at the file.`,
    );
    assert.ok(
      st.inkRowFraction >= minThumbInkRowFraction,
      `${sheet.png} draws on ${(st.inkRowFraction * 100).toFixed(1)}% of its ` +
        `scanlines, floor ${(minThumbInkRowFraction * 100).toFixed(1)}% — the ink is all in one band`,
    );
    assert.ok(
      st.distinct >= minThumbDistinctColours,
      `${sheet.png} has ${st.distinct} distinct colours, floor ${minThumbDistinctColours} — that is a placeholder, not a drawing`,
    );
  }
});

// The art manifest records the raster settings each committed PNG was made
// with. That record is read by humans deciding whether to trust the file, so
// a stale number there is a lie about a shipped artifact — and it was one
// until this task, since all three entries still claimed `"width": 2000`.
test("art-manifest's recorded raster width matches the committed thumbs", () => {
  const budgets = JSON.parse(
    readFileSync(join(REPO_ROOT, "content/world/budgets.json"), "utf8"),
  );
  const manifest = JSON.parse(
    readFileSync(
      join(REPO_ROOT, "game-client/assets/art/art-manifest.json"),
      "utf8",
    ),
  );
  const mapEntries = Object.entries(manifest.entries).filter(
    ([, e]) => e && e.group === "map",
  );
  assert.equal(
    mapEntries.length,
    loadIndex().sheets.length,
    "every sheet PNG needs an art-manifest entry — check_asset_manifest.mjs guard (M) fails on an unmanifested art file",
  );
  for (const [id, entry] of mapEntries) {
    assert.equal(
      entry.gen.width,
      budgets.sheets.thumbWidthPx,
      `art-manifest "${id}".gen.width is ${entry.gen.width}, but the committed PNG is a ${budgets.sheets.thumbWidthPx} px thumb`,
    );
  }
});

// The card is the review surface; a thumb with no words beside it is an image,
// not a review. Both fields are already carried by maps-index.json — this
// pins them so a fourth sheet cannot be indexed as a bare path pair.
test("every sheet also has a card title and note, so the storybook explains what it is", () => {
  for (const sheet of loadIndex().sheets) {
    assert.ok(
      typeof sheet.title === "string" && sheet.title.length > 0,
      `${sheet.id}: maps-index.json row needs a title`,
    );
    assert.ok(
      typeof sheet.note === "string" && sheet.note.length > 20,
      `${sheet.id}: maps-index.json row needs a note explaining what the sheet is`,
    );
  }
});
