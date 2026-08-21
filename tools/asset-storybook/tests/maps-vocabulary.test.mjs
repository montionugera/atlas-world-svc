// Plan B Task 11 — the Maps tab's vocabulary panel.
//
// The panel is the deliverable, not a side effect: Tasks 6-7 produced 25
// terrain fills and 40 glyph families bound to 170 landform types, and the
// standing rule (owner, 2026-08-15) is that a produced artifact which cannot
// be VIEWED in a review surface is not delivered.
//
// Two things are tested here, and they fail in different ways:
//   the SUMMARY (buildVocabulary) is pure and tested directly;
//   the PACKAGING is tested because the panel's failure mode is silent. It
//   imports draft.mjs and glyphs.mjs from the browser, and both must be
//   dependency-free and actually present in the document root. In the
//   container the document root is built by tools/asset-storybook/Dockerfile,
//   which did not ship tools/mapforge/ — so without a rule here the panel
//   works locally, removes itself in the deployed storybook, and nobody
//   learns until someone opens it. That is the same omission that shipped a
//   "NOT LOCKED" card on every sheet in F-046.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVocabulary, repoUrl } from "../js/maps-vocabulary.mjs";
import { LEGEND, patternDefs } from "../../mapforge/lib/draft.mjs";
import { GLYPHS } from "../../mapforge/lib/glyphs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const STORYBOOK_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(STORYBOOK_ROOT, "../..");
const LEXICON = JSON.parse(
  readFileSync(join(REPO_ROOT, "content/world/lexicon/landforms.json"), "utf8"),
);

// ── the summary the panel prints ──────────────────────────────────────────

test("the panel summarises the real vocabularies, not a sample of them", () => {
  const { fills, marks, stats } = buildVocabulary({
    legend: LEGEND,
    glyphs: GLYPHS,
    lexicon: LEXICON,
  });
  assert.equal(fills.length, LEGEND.length);
  assert.equal(marks.length, Object.keys(GLYPHS).length);
  assert.equal(stats.types, LEXICON.length);
  // The counts must come from the artifacts, not from literals that can rot:
  // these are the same numbers content/world/budgets.json polices.
  assert.ok(stats.types >= 100, `lexicon has only ${stats.types} types`);
  assert.ok(stats.families > 0 && stats.fills > 0);
});

test("every lexicon row names a glyph family that actually exists", () => {
  // A dangling family draws NOTHING on the sheet. The panel reports this in
  // its stats line so it is visible; this makes it a failure too.
  const { stats } = buildVocabulary({
    legend: LEGEND,
    glyphs: GLYPHS,
    lexicon: LEXICON,
  });
  assert.deepEqual(
    stats.danglingGlyphs,
    [],
    "content/world/lexicon/landforms.json names glyph families glyphs.mjs does not define",
  );
});

// POSITIVE CONTROL for the test above. On today's content danglingGlyphs is
// [], so `assert.deepEqual(stats.danglingGlyphs, [])` passes whether the
// detector works or not — deleting the detection left that test GREEN
// (observed 2026-08-21). This fixture is what makes the metric prove it can
// still see the thing it was calibrated on.
test("the dangling-family detector reports a family that does not exist", () => {
  const { stats, marks } = buildVocabulary({
    legend: LEGEND,
    glyphs: GLYPHS,
    lexicon: [
      { id: "real-one", glyph: Object.keys(GLYPHS)[0] },
      { id: "broken-a", glyph: "g-not-a-family" },
      { id: "broken-b", glyph: "g-also-missing" },
      { id: "broken-a-again", glyph: "g-not-a-family" },
    ],
  });
  assert.deepEqual(stats.danglingGlyphs, ["g-also-missing", "g-not-a-family"]);
  // ...and a dangling row must not be credited to any real family.
  assert.equal(marks.find((m) => m.id === Object.keys(GLYPHS)[0]).types, 1);
});

// The unbound-family count is the panel's other review signal, and it is 0 or
// near-0 on real content for the same reason — pin it on a fixture too.
test("a glyph family bound to no landform type is counted and flagged", () => {
  const first = Object.keys(GLYPHS)[0];
  const { marks, stats } = buildVocabulary({
    legend: LEGEND,
    glyphs: GLYPHS,
    lexicon: [{ id: "only-one", glyph: first }],
  });
  assert.equal(stats.unboundFamilies, Object.keys(GLYPHS).length - 1);
  assert.equal(marks.find((m) => m.id === first).unbound, false);
  assert.equal(marks.filter((m) => m.unbound).length, stats.unboundFamilies);
});

test("type counts are bound per family, and they sum to the rows that carry a glyph", () => {
  const { marks } = buildVocabulary({
    legend: LEGEND,
    glyphs: GLYPHS,
    lexicon: LEXICON,
  });
  const total = marks.reduce((n, m) => n + m.types, 0);
  const withGlyph = LEXICON.filter((r) => typeof r.glyph === "string").length;
  assert.equal(total, withGlyph);
  assert.ok(
    marks.some((m) => m.types > 0),
    "no family is bound to any type — the binding is not being read",
  );
});

test("an absent or malformed lexicon degrades to zero bindings, never a throw", () => {
  for (const bad of [null, undefined, 7, "x", {}, [null, 3, { glyph: 9 }]]) {
    let out;
    assert.doesNotThrow(
      () => {
        out = buildVocabulary({ legend: LEGEND, glyphs: GLYPHS, lexicon: bad });
      },
      `lexicon=${JSON.stringify(bad)}`,
    );
    assert.equal(out.marks.length, Object.keys(GLYPHS).length);
    assert.equal(out.stats.unboundFamilies, out.marks.length);
  }
  assert.doesNotThrow(() => buildVocabulary());
});

// ── the packaging the panel depends on ────────────────────────────────────

test("repo paths resolve against the DOCUMENT, not this module's own depth", () => {
  // The bug this pins, observed in Chrome 2026-08-21: the panel's dynamic
  // import()s were written as REPO_ROOT_REL + path, copying maps.mjs's
  // img.src/fetch idiom. But import() resolves against the IMPORTING MODULE's
  // url, and these modules sit one level deeper in js/ than index.html — so
  // "../../tools/mapforge/lib/draft.mjs" asked for tools/TOOLS/mapforge/...,
  // 404'd, and the panel removed itself while every test stayed green.
  const doc = "http://h:6007/tools/asset-storybook/index.html";
  assert.equal(
    repoUrl("tools/mapforge/lib/draft.mjs", doc),
    "http://h:6007/tools/mapforge/lib/draft.mjs",
  );
  assert.equal(
    repoUrl("content/world/lexicon/landforms.json", doc),
    "http://h:6007/content/world/lexicon/landforms.json",
  );
  // Depth-independence: the answer must not change if this module moves.
  for (const modUrl of [
    "http://h:6007/tools/asset-storybook/js/maps-vocabulary.mjs",
    "http://h:6007/tools/asset-storybook/js/data/deeper.mjs",
  ]) {
    assert.notEqual(
      new URL("../../tools/mapforge/lib/draft.mjs", modUrl).href,
      repoUrl("tools/mapforge/lib/draft.mjs", doc),
      "a module-relative specifier resolves somewhere else — that is the bug",
    );
  }
  // ...and it works from a deployed sub-path root too (the container serves
  // the page at the same real path, so this is the container's case).
  assert.equal(
    repoUrl(
      "tools/mapforge/lib/glyphs.mjs",
      "http://c/tools/asset-storybook/index.html",
    ),
    "http://c/tools/mapforge/lib/glyphs.mjs",
  );
});

test("the modules the panel imports from the browser are dependency-free", () => {
  // draft.mjs imports nothing; glyphs.mjs imports r2 from draft.mjs. A
  // `node:` import anywhere on that path would throw in the browser and take
  // the panel out silently.
  for (const rel of ["lib/draft.mjs", "lib/glyphs.mjs"]) {
    const src = readFileSync(join(REPO_ROOT, "tools/mapforge", rel), "utf8");
    for (const m of src.matchAll(
      /^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm,
    )) {
      assert.ok(
        m[1].startsWith("./") || m[1].startsWith("../"),
        `${rel} imports "${m[1]}" — the vocabulary panel loads this file in a browser`,
      );
    }
  }
});

test("the storybook image ships the drawing library the panel imports", () => {
  // The panel resolves tools/mapforge/lib/* against the document root. The
  // container's document root is whatever the Dockerfile COPYs, and the
  // dockerignore is a whitelist — both have to name it or the panel 404s in
  // the deployed review surface while passing every test here.
  const dockerfile = readFileSync(join(STORYBOOK_ROOT, "Dockerfile"), "utf8");
  const ignore = readFileSync(
    join(STORYBOOK_ROOT, "Dockerfile.dockerignore"),
    "utf8",
  );
  assert.match(
    dockerfile,
    /^COPY tools\/mapforge\/lib tools\/mapforge\/lib$/m,
    "tools/asset-storybook/Dockerfile does not COPY tools/mapforge/lib — the Maps vocabulary panel will 404 in the container",
  );
  assert.match(
    ignore,
    /^!tools\/mapforge\/lib\/\*\*$/m,
    "tools/asset-storybook/Dockerfile.dockerignore does not whitelist tools/mapforge/lib — the COPY above has nothing to copy",
  );
  // Same for the lexicon the panel fetches. content/world/** already covers
  // it; assert that rather than assume it.
  assert.match(dockerfile, /^COPY content\/world content\/world$/m);
  assert.match(ignore, /^!content\/world\/\*\*$/m);
});

test("every fill in the panel renders a real pattern body", () => {
  // patternDefs() drops an unknown id silently (`.filter(Boolean)`), so a
  // LEGEND row naming a pattern PATTERNS does not define would render as a
  // blank swatch with a caption — a lie, not an error.
  const { fills } = buildVocabulary({
    legend: LEGEND,
    glyphs: GLYPHS,
    lexicon: LEXICON,
  });
  for (const f of fills) {
    const defs = patternDefs({ ids: [f.pattern] });
    assert.ok(
      defs.includes(`id="${f.pattern}"`),
      `LEGEND row "${f.pattern}" (${f.label}) has no pattern body — it would render as an empty swatch`,
    );
  }
});

test("every glyph family draws a non-empty path at the panel's call shape", () => {
  for (const [id, fn] of Object.entries(GLYPHS)) {
    const d = fn({ x: 32, y: 32, size: 34, seed: 1 });
    assert.equal(typeof d, "string", `${id} did not return a path`);
    assert.ok(d.length > 4, `${id} drew an empty path`);
    assert.ok(!/NaN|undefined/.test(d), `${id} drew ${d.slice(0, 60)}`);
  }
});
