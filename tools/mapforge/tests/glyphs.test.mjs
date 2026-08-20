// Plan B Task 7 — G-GLYPH. 40 families cover 170 types; a group never shares
// a glyph with another group; every emitted glyph resolves to a symbol; and
// the 1,404 unnamed texture instances are exempt by design.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GLYPHS,
  symbolDefs,
  glyphForType,
  checkGlyphCoverage,
  glyphUse,
} from "../lib/glyphs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const LIB = join(HERE, "../lib/glyphs.mjs");
const LEX = JSON.parse(
  readFileSync(join(ROOT, "content/world/lexicon/landforms.json"), "utf8"),
);

// The lexicon is the authority on ids, groups and glyph names — never a
// hardcoded spelling. These are derived so a lexicon edit moves the tests.
const groupOfGlyph = new Map();
for (const row of LEX) if (!groupOfGlyph.has(row.glyph)) groupOfGlyph.set(row.glyph, row.group);

/** A row whose glyph belongs to a group other than `group` — for the red tests. */
const rowWithForeignGlyph = (group) =>
  LEX.find((r) => r.group !== group && groupOfGlyph.get(r.glyph) === r.group);

test("there are exactly 40 glyph families and each is a function", () => {
  assert.equal(Object.keys(GLYPHS).length, 40);
  for (const [id, fn] of Object.entries(GLYPHS)) {
    assert.equal(typeof fn, "function", id);
    assert.match(id, /^g-[a-z0-9]+(-[a-z0-9]+)*$/);
  }
});

test("every glyph the lexicon names exists, and every family is used", () => {
  const used = new Set(LEX.map((r) => r.glyph));
  for (const id of used) assert.ok(GLYPHS[id], `lexicon names glyph "${id}" with no family`);
  for (const id of Object.keys(GLYPHS)) assert.ok(used.has(id), `family "${id}" is never used`);
});

test("every glyph produces a non-trivial, well-formed path", () => {
  for (const [id, fn] of Object.entries(GLYPHS)) {
    const d = fn({ x: 100, y: 50, size: 8, seed: 7 });
    assert.equal(typeof d, "string", id);
    assert.ok(d.length > 8, `${id}: path is too short to be a mark`);
    assert.match(d, /^M/, `${id}: a path must start with a moveto`);
    assert.doesNotMatch(d, /NaN|undefined|Infinity/, `${id}: non-finite coordinate`);
  }
});

test("glyphs are deterministic and seed-sensitive", () => {
  for (const [id, fn] of Object.entries(GLYPHS)) {
    const a = fn({ x: 10, y: 10, size: 8, seed: 1 });
    assert.equal(a, fn({ x: 10, y: 10, size: 8, seed: 1 }), `${id}: not deterministic`);
  }
  // At least one family must actually vary with the seed, or the jitter is dead code.
  const varies = Object.entries(GLYPHS).some(
    ([, fn]) =>
      fn({ x: 10, y: 10, size: 8, seed: 1 }) !== fn({ x: 10, y: 10, size: 8, seed: 2 }),
  );
  assert.ok(varies, "no family responds to seed — the jitter is dead");
});

// Stronger than the "some family varies" probe above: EVERY family must move
// somewhere in a seed sweep. A single family with its jitter term dropped is
// invisible to the `some()` check but caught here. The sweep (not a single
// pair) is deliberate: r2() quantises to 0.01, so two adjacent seeds can round
// to the same string for a small-amplitude family without the jitter being dead.
test("every family responds to the seed somewhere in a seed sweep", () => {
  const SEEDS = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
  for (const [id, fn] of Object.entries(GLYPHS)) {
    const shapes = new Set(SEEDS.map((seed) => fn({ x: 40, y: 40, size: 12, seed })));
    assert.ok(shapes.size > 1, `${id}: identical for all of ${SEEDS.length} seeds — jitter is dead`);
  }
});

test("glyphs scale and translate with size and position", () => {
  for (const [id, fn] of Object.entries(GLYPHS)) {
    assert.notEqual(
      fn({ x: 0, y: 0, size: 8, seed: 3 }),
      fn({ x: 40, y: 0, size: 8, seed: 3 }),
      `${id}: ignores x`,
    );
    assert.notEqual(
      fn({ x: 0, y: 0, size: 8, seed: 3 }),
      fn({ x: 0, y: 0, size: 16, seed: 3 }),
      `${id}: ignores size`,
    );
    assert.notEqual(
      fn({ x: 0, y: 0, size: 8, seed: 3 }),
      fn({ x: 0, y: 40, size: 8, seed: 3 }),
      `${id}: ignores y`,
    );
  }
});

test("G-GLYPH: no two landform GROUPS share a glyph", () => {
  const problems = checkGlyphCoverage({ lexicon: LEX });
  assert.deepEqual(problems, []);
});

test("G-GLYPH red: two groups sharing a glyph", () => {
  // Derived from the lexicon, not spelled: take a karst row and give it a
  // glyph another group already owns.
  const victim = LEX.find((r) => r.group === "karst");
  const thief = rowWithForeignGlyph("karst");
  assert.ok(victim && thief, "lexicon shape changed — no cross-group pair to build the red case");
  const bad = LEX.map((r) => (r.id === victim.id ? { ...r, glyph: thief.glyph } : r));
  const problems = checkGlyphCoverage({ lexicon: bad });
  assert.ok(
    problems.some(
      (p) => p === `G-GLYPH: groups "${thief.group}" and "${victim.group}" share glyph "${thief.glyph}"`,
    ),
    problems.join("\n"),
  );
});

test("G-GLYPH red: a type with named instances and no family", () => {
  const victim = LEX[0];
  const bad = LEX.map((r) => (r.id === victim.id ? { ...r, glyph: "g-nonexistent" } : r));
  const problems = checkGlyphCoverage({ lexicon: bad, namedCounts: { [victim.id]: 4 } });
  assert.ok(
    problems.some(
      (p) => p === `G-GLYPH: type "${victim.id}" has 4 named instances but no glyph family`,
    ),
    problems.join("\n"),
  );
});

test("G-GLYPH: unnamed instances never demand a family", () => {
  const victim = LEX[0];
  const bad = LEX.map((r) => (r.id === victim.id ? { ...r, glyph: "g-nonexistent" } : r));
  const problems = checkGlyphCoverage({ lexicon: bad, namedCounts: { [victim.id]: 0 } });
  assert.ok(!problems.some((p) => p.includes("named instances")), problems.join("\n"));
});

test("G-GLYPH: namedCounts === null audits the whole catalogue, {} audits nothing", () => {
  const victim = LEX[0];
  const bad = LEX.map((r) => (r.id === victim.id ? { ...r, glyph: "g-nonexistent" } : r));
  // null = "no instance census available" -> every catalogued row must resolve.
  assert.ok(
    checkGlyphCoverage({ lexicon: bad, namedCounts: null }).some(
      (p) => p === `G-GLYPH: type "${victim.id}" names glyph "g-nonexistent" with no family`,
    ),
  );
  // {} = "census says nothing is named" -> nothing is demanded.
  assert.deepEqual(checkGlyphCoverage({ lexicon: bad, namedCounts: {} }), []);
});

test("G-GLYPH red: a referenced glyph is not among the emitted symbols", () => {
  const problems = checkGlyphCoverage({ lexicon: LEX, emittedIds: ["g-cave"] });
  assert.ok(
    problems.some((p) =>
      /^G-GLYPH: glyph "g-[a-z-]+" is referenced but no <symbol> was emitted$/.test(p),
    ),
    problems.join("\n"),
  );
  // ...and the one that IS emitted is not reported.
  assert.ok(!problems.some((p) => p.includes('"g-cave" is referenced')), problems.join("\n"));
  // A complete emission is clean.
  assert.deepEqual(checkGlyphCoverage({ lexicon: LEX, emittedIds: Object.keys(GLYPHS) }), []);
});

test("symbolDefs emits one symbol per requested id, deterministically", () => {
  const out = symbolDefs({ ids: ["g-cave", "g-dune", "g-reef"] });
  assert.deepEqual(
    [...out.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]),
    ["g-cave", "g-dune", "g-reef"],
  );
  assert.equal(out, symbolDefs({ ids: ["g-cave", "g-dune", "g-reef"] }));
  const all = symbolDefs({ ids: Object.keys(GLYPHS) });
  assert.ok(all.length < 40 * 900, "40 symbols must stay well under 36 KB");
});

test("symbolDefs follows the ids argument, not GLYPHS key order, and drops strangers", () => {
  const forward = symbolDefs({ ids: ["g-dune", "g-cave"] });
  const reverse = symbolDefs({ ids: ["g-cave", "g-dune"] });
  assert.notEqual(forward, reverse, "symbolDefs must honour the caller's order");
  // An unknown id is dropped rather than emitting a broken <symbol>;
  // checkGlyphCoverage({ emittedIds }) is what turns that into a failure.
  assert.equal(symbolDefs({ ids: ["g-not-a-family"] }), "");
});

test("glyphForType resolves through the lexicon and returns null for a stranger", () => {
  const row = LEX.find((r) => r.glyph === "g-cenote");
  assert.equal(glyphForType({ lexicon: LEX, typeId: row.id }), "g-cenote");
  assert.equal(glyphForType({ lexicon: LEX, typeId: "not-a-type" }), null);
});

test("glyphUse is a compact <use>, not an inlined path", () => {
  const u = glyphUse({ id: "g-dune", x: 12.345, y: 6.789, size: 7 });
  assert.match(u, /^<use href="#g-dune" x="[-\d.]+" y="[-\d.]+" width="7" height="7"\/>$/);
  assert.ok(u.length < 90);
});

// ---------------------------------------------------------------------------
// Determinism, hard version
// ---------------------------------------------------------------------------

/** sha256 over every family across a position/size/seed sweep. */
const SWEEP_SRC = `
import { GLYPHS } from ${JSON.stringify(LIB)};
import { createHash } from "node:crypto";
const h = createHash("sha256");
for (const id of Object.keys(GLYPHS).sort())
  for (const size of [6, 8, 10, 13.5, 26])
    for (const seed of [0, 1, 2, 7, 4242])
      h.update(id + "|" + GLYPHS[id]({ x: 137.5, y: -42.25, size, seed }) + "\\n");
process.stdout.write(h.digest("hex"));
`;

function sweepDigestInProcess() {
  const h = createHash("sha256");
  for (const id of Object.keys(GLYPHS).sort())
    for (const size of [6, 8, 10, 13.5, 26])
      for (const seed of [0, 1, 2, 7, 4242])
        h.update(id + "|" + GLYPHS[id]({ x: 137.5, y: -42.25, size, seed }) + "\n");
  return h.digest("hex");
}

test("glyph output is byte-identical across runs and across processes", () => {
  const a = sweepDigestInProcess();
  assert.equal(a, sweepDigestInProcess(), "not stable within one process");
  const child = execFileSync(process.execPath, ["--input-type=module", "-e", SWEEP_SRC], {
    encoding: "utf8",
  });
  assert.equal(child, a, "a fresh process produced different bytes");
});

test("no family reaches for a non-deterministic or transcendental primitive", () => {
  // Strip comments first: the header prose legitimately NAMES the banned
  // primitives to say it does not use them, and a scan that reads prose as
  // code is a scan that has to be worked around instead of obeyed.
  const src = readFileSync(LIB, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const banned = [
    /Math\.random/,
    /Math\.hypot/,
    /Math\.(sin|cos|tan|asin|acos|atan2?|exp|log2?|log10|pow|cbrt)\b/,
    /\bDate\b/,
    /performance\.now/,
    /\*\*/, // exponentiation operator
  ];
  for (const re of banned) assert.doesNotMatch(src, re, `glyphs.mjs uses ${re}`);
});

test("emitted coordinates never print in exponential notation", () => {
  for (const [id, fn] of Object.entries(GLYPHS))
    for (const size of [0.5, 1, 8, 26, 1000])
      for (const x of [0, -1e-9, 1e6])
        assert.doesNotMatch(fn({ x, y: x, size, seed: 3 }), /e[+-]/i, `${id} @ size ${size}`);
});

// ---------------------------------------------------------------------------
// Distinguishability — the machine half. The eye half is the contact sheet.
// ---------------------------------------------------------------------------

/**
 * What a mark looks like with its jitter averaged OUT: the command sequence
 * plus every coordinate meaned over 256 seeds and quantised to half a unit at
 * the canonical size-10 pose.
 *
 * Averaging is the load-bearing part. A bbox-of-one-seed fingerprint does not
 * work: copy a family into another group, give the copy a different jitter
 * SALT, and its one-seed coordinates differ by the jitter while the picture is
 * identical — which is exactly the mutation this rule has to catch. Jitter is
 * zero-mean, so over 256 seeds the copy converges onto the original.
 */
function pictureFingerprint(fn) {
  const SEEDS = 256;
  let cmds = null;
  let sum = null;
  for (let s = 0; s < SEEDS; s++) {
    const d = fn({ x: 0, y: 0, size: 10, seed: s * 7919 + 1 });
    const c = d.replace(/[-\d.,]+/g, "").replace(/\s+/g, "");
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
    if (cmds === null) {
      cmds = c;
      sum = nums.slice();
      continue;
    }
    // A family whose command sequence moves with the seed is its own shape.
    if (c !== cmds || nums.length !== sum.length) return `variable:${c}:${sum.length}`;
    for (let i = 0; i < nums.length; i++) sum[i] += nums[i];
  }
  const mean = sum.map((v) => Math.round((v / SEEDS) * 2) / 2 || 0);
  return `${cmds}|${mean.join(",")}`;
}

test("no two families in DIFFERENT groups draw the same picture", () => {
  const seen = new Map(); // fingerprint -> {id, group}
  for (const [id, fn] of Object.entries(GLYPHS)) {
    const group = groupOfGlyph.get(id);
    const fp = pictureFingerprint(fn);
    const prev = seen.get(fp);
    if (prev && prev.group !== group)
      assert.fail(
        `"${prev.id}" (${prev.group}) and "${id}" (${group}) draw the same picture — ` +
          `two groups a reader cannot tell apart`,
      );
    if (!prev) seen.set(fp, { id, group });
  }
});

test("all 40 canonical paths are distinct strings", () => {
  const canonical = Object.entries(GLYPHS).map(([id, fn]) => [
    id,
    fn({ x: 0, y: 0, size: 10, seed: 0 }),
  ]);
  assert.equal(new Set(canonical.map(([, d]) => d)).size, 40);
});
