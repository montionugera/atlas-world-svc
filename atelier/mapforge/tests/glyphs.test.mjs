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
  GLYPH_SIZE,
  symbolDefs,
  glyphForType,
  checkGlyphCoverage,
  checkGlyphSizes,
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

// Trap 6: a gate that throws skips its caller's finish() and silently drops
// every failure recorded before it. `lexicon: null` is what a failed readJson
// hands you, so it is a realistic state, not a hypothetical.
test("checkGlyphCoverage reports degenerate input in-band and never throws", () => {
  const cases = [
    [undefined, /lexicon is undefined, not an array/],
    [{}, /lexicon is undefined, not an array/],
    [{ lexicon: null }, /lexicon is null, not an array/],
    [{ lexicon: "abc" }, /lexicon is string, not an array/],
    [{ lexicon: 7 }, /lexicon is number, not an array/],
    [{ lexicon: [null] }, /lexicon row is null, not a record/],
    [{ lexicon: ["x"] }, /lexicon row is string, not a record/],
    [{ lexicon: [], namedCounts: "x" }, /namedCounts is string, not a census object/],
    [{ lexicon: LEX, emittedIds: "g-cave" }, /emittedIds is string, not an array/],
  ];
  for (const [arg, re] of cases) {
    let out;
    assert.doesNotThrow(() => {
      out = arg === undefined ? checkGlyphCoverage() : checkGlyphCoverage(arg);
    }, `checkGlyphCoverage(${JSON.stringify(arg)}) threw`);
    assert.ok(Array.isArray(out), "problems must come back as an array");
    assert.ok(out.some((p) => re.test(p)), `${JSON.stringify(arg)} -> ${out.join(" | ")}`);
    for (const p of out) assert.match(p, /^G-GLYPH: /);
  }
  // A per-character walk over a string lexicon must NOT be mistaken for work.
  assert.equal(checkGlyphCoverage({ lexicon: "abc" }).length, 1);
  // An empty catalogue is clean, not an error: nothing is claimed, nothing fails.
  assert.deepEqual(checkGlyphCoverage({ lexicon: [] }), []);
});

test("glyphForType never throws on a degenerate lexicon", () => {
  for (const lexicon of [null, undefined, "abc", 7, [null], [{}]])
    assert.equal(glyphForType({ lexicon, typeId: "x" }), null, String(lexicon));
  assert.equal(glyphForType(), null);
});

// The size contract exists so Tasks 10 and 12 cannot pick 8 px by accident.
test("GLYPH_SIZE states the verified instance-size contract", () => {
  assert.deepEqual({ ...GLYPH_SIZE }, { generic: 16, min: 18, preferred: 20, hero: 26 });
  assert.ok(Object.isFrozen(GLYPH_SIZE));
  assert.ok(GLYPH_SIZE.generic < GLYPH_SIZE.min);
  assert.ok(GLYPH_SIZE.min <= GLYPH_SIZE.preferred);
  assert.ok(GLYPH_SIZE.preferred <= GLYPH_SIZE.hero);
});

test("checkGlyphSizes enforces the minimum, and reports rather than throws", () => {
  // At or above the minimum: silent.
  assert.deepEqual(
    checkGlyphSizes({
      instances: [
        { id: "g-cave", size: GLYPH_SIZE.min },
        { id: "g-dune", size: GLYPH_SIZE.preferred },
        { id: "g-reef", size: GLYPH_SIZE.hero },
      ],
    }),
    [],
  );
  // Between the generic floor and the minimum: identity is eroding.
  assert.deepEqual(checkGlyphSizes({ instances: [{ id: "g-cave", size: 17 }] }), [
    'G-GLYPH: glyph "g-cave" is placed at 17 px, below the 18 px family-identity minimum',
  ]);
  // Under the floor — the 8 px case the plan must not reach by accident.
  assert.deepEqual(checkGlyphSizes({ instances: [{ id: "g-cenote", size: 8 }] }), [
    'G-GLYPH: glyph "g-cenote" is placed at 8 px, under the 16 px floor where family ' +
      "identity is unreadable — place one generic mark instead",
  ]);
  assert.equal(checkGlyphSizes({ instances: [{ id: "g-cave", size: 15.9 }] }).length, 1);
  // Degenerate input reports in-band.
  for (const arg of [undefined, {}, { instances: null }, { instances: "x" }]) {
    const out = arg === undefined ? checkGlyphSizes() : checkGlyphSizes(arg);
    assert.ok(Array.isArray(out) && out.length === 1, JSON.stringify(arg));
    assert.match(out[0], /^G-GLYPH: instances is \w+, not an array/);
  }
  assert.match(
    checkGlyphSizes({ instances: [null] })[0],
    /^G-GLYPH: instance is null, not a record/,
  );
  assert.match(
    checkGlyphSizes({ instances: [{ id: "g-cave", size: "20" }] })[0],
    /^G-GLYPH: glyph "g-cave" has a non-numeric size \(string\)/,
  );
  assert.equal(checkGlyphSizes({ instances: [{ id: "g-cave", size: NaN }] }).length, 1);
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

// The markup itself is the artifact. Asserting only that a <symbol> tag comes
// out leaves fill="#000" (every mark a solid blob), stroke-width="3"
// (illegible at 26 px) and a halved viewBox (every mark clipped) all green.
test("symbolDefs emits the exact ink the sheets depend on", () => {
  const out = symbolDefs({ ids: ["g-cave"] });
  assert.match(out, /^<symbol id="g-cave" viewBox="-6 -6 12 12" overflow="visible">/);
  assert.match(out, /<path d="[^"]+" fill="none" stroke="currentColor" /);
  assert.match(out, / stroke-width="0.9" stroke-linejoin="round"\/><\/symbol>$/);
  // fill="none" is not decorative: a filled glyph is a blob at every size.
  assert.doesNotMatch(out, /fill="(?!none")/);
  // The viewBox must be the size-10 pose with a half-unit of stroke bleed on
  // each side. A tighter box clips; a looser one silently shrinks every mark.
  const [, vb] = out.match(/viewBox="([^"]+)"/);
  const [minX, minY, w, h] = vb.split(" ").map(Number);
  assert.equal(w, 12);
  assert.equal(h, 12);
  assert.equal(minX, -w / 2);
  assert.equal(minY, -h / 2);
});

test("symbolDefs never throws on a degenerate argument", () => {
  for (const arg of [undefined, {}, { ids: null }, { ids: "g-cave" }, { ids: 7 }])
    assert.equal(symbolDefs(arg), "", `symbolDefs(${JSON.stringify(arg)})`);
});

test("glyphUse centres the symbol on its point", () => {
  // Centring is the entire contract: <use> places the viewBox's top-left
  // corner, so x/y must be the point MINUS half the size. A regex that accepts
  // any number accepts a glyph drawn half a mark off its own feature.
  assert.equal(
    glyphUse({ id: "g-dune", x: 100, y: 50, size: 8 }),
    '<use href="#g-dune" x="96" y="46" width="8" height="8"/>',
  );
  assert.equal(
    glyphUse({ id: "g-cave", x: 0, y: 0, size: 26 }),
    '<use href="#g-cave" x="-13" y="-13" width="26" height="26"/>',
  );
  // ...and it stays centred when the offset does not land on a whole pixel.
  const u = glyphUse({ id: "g-dune", x: 12.345, y: 6.789, size: 7 });
  assert.equal(u, '<use href="#g-dune" x="8.85" y="3.29" width="7" height="7"/>');
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
//
// WHY THIS IS A RASTER AND NOT A COORDINATE FINGERPRINT.
//
// The first version of this rule hashed the command sequence plus every
// coordinate meaned over 256 seeds. Averaging did close the re-salted-copy
// hole, but a REFLECTION walked straight through it: mirroring g-cave into
// group `island` stayed green, because g-cave is symmetric about x apart from
// its jitter, so the mirrored path draws literally the same picture while a
// sign flip changes every number the fingerprint averages. A rule a mirror
// defeats is not a rule.
//
// So the comparison happens on the DRAWING, not on the numbers: each family is
// rasterised into a 24x24 occupancy grid at the canonical size-10 pose, the
// jitter is averaged out over 48 seeds, and two families are compared by
// Jaccard overlap under all EIGHT symmetries of the square. Reflections and
// rotations are therefore not escapes — they are part of the comparison.
//
// Rasterising needs no transcendentals: lines and quadratics are polynomial,
// and the only arcs in the vocabulary are the semicircles CIRC() emits, which
// refine by chord-midpoint using Math.sqrt (exactly rounded per IEEE-754).

const N = 24; // grid cells per side; at 26 px one cell is ~1.2 device pixels
const LO = -5.5;
const CELL = 11 / N;
const HALF_STROKE = 0.45; // stroke-width 0.9 in the size-10 pose
const SEEDS = 48;

/** Flatten a path `d` to sample points. M/L/Q/A/Z only — the whole vocabulary. */
function samplePath(d) {
  const pts = [];
  const toks = d.match(/[MLQAZ]|-?\d+(?:\.\d+)?/g) || [];
  let i = 0;
  let cur = null;
  let start = null;
  const num = () => Number(toks[i++]);
  const line = (a, b) => {
    const n = Math.max(2, Math.ceil((Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])) / 0.05));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  };
  const quad = (a, c, b) => {
    for (let k = 0; k <= 200; k++) {
      const t = k / 200;
      const m = 1 - t;
      pts.push([
        m * m * a[0] + 2 * m * t * c[0] + t * t * b[0],
        m * m * a[1] + 2 * m * t * c[1] + t * t * b[1],
      ]);
    }
  };
  // CIRC() emits half-circles, so the chord midpoint IS the centre. Refining
  // by projecting each chord midpoint onto the circle needs only sqrt.
  const arc = (a, b, r) => {
    const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const onArc = (p0, p1) => {
      let vx = (p0[0] + p1[0]) / 2 - c[0];
      let vy = (p0[1] + p1[1]) / 2 - c[1];
      let len = Math.sqrt(vx * vx + vy * vy);
      if (len < 1e-9) {
        vx = -(p1[1] - p0[1]);
        vy = p1[0] - p0[0];
        len = Math.sqrt(vx * vx + vy * vy);
      }
      return [c[0] + (vx / len) * r, c[1] + (vy / len) * r];
    };
    const rec = (p0, p1, depth) => {
      const m = onArc(p0, p1);
      if (depth === 0) {
        pts.push(p0, m, p1);
        return;
      }
      rec(p0, m, depth - 1);
      rec(m, p1, depth - 1);
    };
    rec(a, b, 7);
  };
  while (i < toks.length) {
    const c = toks[i++];
    if (c === "M") {
      cur = [num(), num()];
      start = cur;
      pts.push(cur);
    } else if (c === "L") {
      const p = [num(), num()];
      line(cur, p);
      cur = p;
    } else if (c === "Q") {
      const cp = [num(), num()];
      const p = [num(), num()];
      quad(cur, cp, p);
      cur = p;
    } else if (c === "A") {
      const r = num();
      num(); // ry
      num(); // x-rotation
      num(); // large-arc
      num(); // sweep
      const p = [num(), num()];
      arc(cur, p, r);
      cur = p;
    } else if (c === "Z") {
      if (cur && start) line(cur, start);
      cur = start;
    } else {
      assert.fail(`samplePath cannot read command "${c}" — the vocabulary grew`);
    }
  }
  return pts;
}

/** Jitter-averaged occupancy grid, dilated by one cell to absorb hairline offsets. */
function pictureGrid(fn) {
  const acc = new Uint16Array(N * N);
  const rad = Math.ceil(HALF_STROKE / CELL);
  for (let s = 0; s < SEEDS; s++) {
    const hit = new Uint8Array(N * N);
    for (const [px, py] of samplePath(fn({ x: 0, y: 0, size: 10, seed: s * 7919 + 1 }))) {
      const ci = Math.floor((px - LO) / CELL);
      const cj = Math.floor((py - LO) / CELL);
      for (let a = ci - rad; a <= ci + rad; a++)
        for (let b = cj - rad; b <= cj + rad; b++) {
          if (a < 0 || b < 0 || a >= N || b >= N) continue;
          const dx = LO + (a + 0.5) * CELL - px;
          const dy = LO + (b + 0.5) * CELL - py;
          if (dx * dx + dy * dy <= HALF_STROKE * HALF_STROKE) hit[b * N + a] = 1;
        }
    }
    for (let k = 0; k < hit.length; k++) acc[k] += hit[k];
  }
  const on = new Uint8Array(N * N);
  for (let k = 0; k < on.length; k++) on[k] = acc[k] * 2 >= SEEDS ? 1 : 0;
  const out = new Uint8Array(N * N);
  for (let b = 0; b < N; b++)
    for (let a = 0; a < N; a++) {
      if (!on[b * N + a]) continue;
      for (let db = -1; db <= 1; db++)
        for (let da = -1; da <= 1; da++) {
          const a2 = a + da;
          const b2 = b + db;
          if (a2 >= 0 && b2 >= 0 && a2 < N && b2 < N) out[b2 * N + a2] = 1;
        }
    }
  return out;
}

/** The eight symmetries of the square: identity, 3 rotations, 4 reflections. */
const SYMMETRIES = [
  ["as drawn", (a, b) => [a, b]],
  ["mirrored left-right", (a, b) => [N - 1 - a, b]],
  ["mirrored top-bottom", (a, b) => [a, N - 1 - b]],
  ["rotated 180", (a, b) => [N - 1 - a, N - 1 - b]],
  ["transposed", (a, b) => [b, a]],
  ["rotated 90", (a, b) => [N - 1 - b, a]],
  ["rotated 270", (a, b) => [b, N - 1 - a]],
  ["anti-transposed", (a, b) => [N - 1 - b, N - 1 - a]],
];

/** Strongest Jaccard overlap of two grids over the eight symmetries. */
function overlap(g1, g2) {
  let best = 0;
  let how = SYMMETRIES[0][0];
  for (const [name, t] of SYMMETRIES) {
    let inter = 0;
    let uni = 0;
    for (let b = 0; b < N; b++)
      for (let a = 0; a < N; a++) {
        const [a2, b2] = t(a, b);
        const p = g1[b2 * N + a2];
        const q = g2[b * N + a];
        if (p && q) inter++;
        if (p || q) uni++;
      }
    const s = uni ? inter / uni : 1;
    if (s > best) {
      best = s;
      how = name;
    }
  }
  return { score: best, how };
}

/**
 * The ceiling, and why it is this number.
 *
 * MEASURED on the shipped 40: the most-alike cross-group pair scores 0.745
 * (g-falls ~ g-playa, and only when one is transposed). MEASURED on copies:
 * an exact copy scores 1.000, a copy with a different jitter salt 0.995, a
 * mirrored copy of a symmetric family 1.000, a mirrored or 180-rotated copy of
 * an ASYMMETRIC family 1.000. The ceiling sits between those two clouds with
 * ~0.10 of clearance below and ~0.15 above, so it is not a hand-tuned fudge:
 * halving either margin still separates them.
 */
const MAX_OVERLAP = 0.85;

/** Pinned one below the real minimum, so a redraw that erodes the set fails. */
const WORST_OBSERVED = 0.75;

const GRIDS = new Map(Object.entries(GLYPHS).map(([id, fn]) => [id, pictureGrid(fn)]));

test("no two families draw the same picture, under any symmetry of the square", () => {
  const ids = [...GRIDS.keys()];
  let worst = { score: 0 };
  for (let i = 0; i < ids.length; i++)
    for (let k = i + 1; k < ids.length; k++) {
      const { score, how } = overlap(GRIDS.get(ids[i]), GRIDS.get(ids[k]));
      if (score > worst.score) worst = { score, how, a: ids[i], b: ids[k] };
    }
  assert.ok(
    worst.score <= MAX_OVERLAP,
    `"${worst.a}" (${groupOfGlyph.get(worst.a)}) and "${worst.b}" ` +
      `(${groupOfGlyph.get(worst.b)}) overlap ${worst.score.toFixed(3)} ${worst.how} — ` +
      `two marks a reader cannot tell apart`,
  );
  // A ratchet: the set may not quietly get more alike than it is today.
  assert.ok(
    worst.score <= WORST_OBSERVED,
    `the most-alike pair is now ${worst.score.toFixed(3)} (${worst.a} ~ ${worst.b} ` +
      `${worst.how}), worse than the ${WORST_OBSERVED} this set was verified at`,
  );
});

/**
 * POSITIVE CONTROL. A threshold is only worth its number if the metric can see
 * the defect it was built to see, so this is the mark that actually failed
 * review: g-mesa as it was first drawn, a plain trapezoid, which at 26 px read
 * as g-cave (karst) with nothing but its slanted sides to tell them apart.
 *
 * It must score ABOVE the ratchet. Without this, "the set is distinguishable"
 * rests on a number no failing input was ever measured against — and the
 * one-cell dilation that makes the score track the eye rather than the pixels
 * could be deleted with the whole suite still green.
 */
const PRE_FIX_MESA = ({ x, y, size, seed }) => {
  const u = size / 10;
  const d = (((Math.imul(seed | 0, 0x27d4eb2d) ^ Math.imul(11, 0x9e3779b1)) >>> 0) % 1000) / 5000;
  return [
    `M${-4.5 * u + x},${3 * u + y}`,
    `L${-2.6 * u + x},${-2.5 * u + y}`,
    `L${2.6 * u + x + d},${-2.5 * u + y}`,
    `L${4.5 * u + x},${3 * u + y}`,
    "Z",
  ].join(" ");
};

test("the rule can see the mark that actually failed review", () => {
  const { score, how } = overlap(GRIDS.get("g-cave"), pictureGrid(PRE_FIX_MESA));
  assert.ok(
    score > WORST_OBSERVED,
    `the pre-fix trapezoid g-mesa scores only ${score.toFixed(3)} (${how}) against g-cave — ` +
      `the metric can no longer see a collision it was calibrated on`,
  );
  // ...and it is NOT a duplicate: the ceiling must not be so low that two
  // merely-similar marks read as the same family.
  assert.ok(score < MAX_OVERLAP, `score ${score.toFixed(3)} would be reported as a duplicate`);
});

// The four ways a family can be duplicated without the coordinate fingerprint
// noticing. Each must score above the ceiling.
const mirrorX = (fn) => (o) =>
  fn(o).replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (m, a, b) => `${-Number(a) || 0},${b}`);
const rotate180 = (fn) => (o) =>
  fn(o).replace(
    /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g,
    (m, a, b) => `${-Number(a) || 0},${-Number(b) || 0}`,
  );

test("a duplicated family is caught however it is disguised", () => {
  // g-cave is symmetric about x (the mirror that defeated the old rule);
  // g-wadi is not, so it covers the asymmetric case too.
  for (const victim of ["g-cave", "g-wadi"]) {
    const orig = GLYPHS[victim];
    const copies = {
      "an exact copy": orig,
      "a copy with a different jitter salt": ({ x, y, size, seed }) =>
        orig({ x, y, size, seed: seed * 31 + 12345 }),
      "a mirrored copy": mirrorX(orig),
      "a 180-rotated copy": rotate180(orig),
    };
    for (const [what, fn] of Object.entries(copies)) {
      const { score, how } = overlap(GRIDS.get(victim), pictureGrid(fn));
      assert.ok(
        score > MAX_OVERLAP,
        `${what} of ${victim} scored only ${score.toFixed(3)} (${how}) — it would pass the rule`,
      );
    }
  }
});

test("all 40 canonical paths are distinct strings", () => {
  const canonical = Object.entries(GLYPHS).map(([id, fn]) => [
    id,
    fn({ x: 0, y: 0, size: 10, seed: 0 }),
  ]);
  // Compare against the corpus, not the literal 40: a 41st duplicate family
  // must not leave this assertion green.
  assert.equal(new Set(canonical.map(([, d]) => d)).size, canonical.length);
});
