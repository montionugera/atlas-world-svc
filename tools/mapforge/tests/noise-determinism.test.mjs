// tools/mapforge/tests/noise-determinism.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashNoise2D, fbm, smoothstep, UNIT_VECTORS, q } from "../lib/noise.mjs";
import { mintSeed } from "../lib/seed.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, "../lib");

// The spec's R5 mitigation is "no transcendentals on any path reaching a
// committed byte". A comment cannot enforce that; a source scan can.
const BANNED = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|hypot|cbrt|sinh|cosh|tanh)\b|\*\*/;

test("noise.mjs and seed.mjs contain no transcendental call and no ** operator", () => {
  for (const f of ["noise.mjs", "seed.mjs", "grid.mjs"]) {
    const src = readFileSync(join(LIB, f), "utf8");
    const offending = src.split("\n")
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => BANNED.test(line) && !line.trimStart().startsWith("//"));
    assert.deepEqual(offending, [], `${f} uses a banned operation: ${JSON.stringify(offending)}`);
  }
});

// The scan above reads TEXT, so the ways round it are textual: a computed
// member access (Math["cos"]), a built-up name, or a Reflect/globalThis hop.
// A regex that only knows the dotted form is a rule anyone can step over by
// accident. This half closes that, and it is the half the review asked for.
const EVASIONS = [
  /Math\s*\[/,                       // Math["cos"], Math[name]
  /Reflect\.get\s*\(\s*Math\b/,      // Reflect.get(Math, "cos")
  /globalThis\s*\[\s*["'`]Math/,     // globalThis["Math"]
  /\bnew\s+Function\b|\beval\s*\(/,  // a name assembled at runtime
];

test("the transcendental ban cannot be stepped over by a computed member access", () => {
  for (const f of ["noise.mjs", "seed.mjs", "grid.mjs"]) {
    const src = readFileSync(join(LIB, f), "utf8");
    for (const [i, line] of src.split("\n").entries()) {
      if (line.trimStart().startsWith("//")) continue;
      for (const re of EVASIONS)
        assert.ok(!re.test(line), `${f}:${i + 1} reaches Math indirectly: ${line.trim()}`);
    }
  }
});

test("smoothstep is the polynomial form and is exact at the endpoints", () => {
  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(1), 1);
  assert.equal(smoothstep(0.5), 0.5);
  assert.equal(smoothstep(0.25), 0.25 * 0.25 * (3 - 2 * 0.25));
});

test("hashNoise2D is in [-1, 1] and is a pure function of (x, y, stream)", () => {
  const a = hashNoise2D({ x: 12.25, y: 88.75, stream: "d9a0051d32afab59" });
  const b = hashNoise2D({ x: 12.25, y: 88.75, stream: "d9a0051d32afab59" });
  const c = hashNoise2D({ x: 12.25, y: 88.75, stream: "da45bd8930d33bb0" });
  assert.equal(a, b);
  assert.notEqual(a, c);
  for (let i = 0; i < 500; i++) {
    const v = hashNoise2D({ x: i * 0.37, y: i * 1.13, stream: "d9a0051d32afab59" });
    assert.ok(v >= -1 && v <= 1, `out of range at i=${i}: ${v}`);
  }
});

test("hashNoise2D is continuous: neighbouring samples never jump by more than 2/lattice", () => {
  let prev = hashNoise2D({ x: 0, y: 4, stream: "5eed5eed5eed5eed" });
  for (let i = 1; i <= 200; i++) {
    const v = hashNoise2D({ x: i * 0.01, y: 4, stream: "5eed5eed5eed5eed" });
    assert.ok(Math.abs(v - prev) < 0.2, `discontinuity at x=${i * 0.01}: ${prev} -> ${v}`);
    prev = v;
  }
});

// The `| 0` trap: truncation-toward-zero makes [-1, 0) and [0, 1) share the
// lattice cell 0, so the field folds at the origin and every negative
// coordinate is wrong. Math.floor is the only correct choice, and only a
// negative sweep can tell them apart — the positive sweep above passes under
// both. Crossing zero is the case that actually fires.
test("hashNoise2D is continuous across zero and through negative coordinates", () => {
  for (const y of [-7.5, -0.25, 0, 3.5]) {
    let prev = hashNoise2D({ x: -3, y, stream: "5eed5eed5eed5eed" });
    for (let i = 1; i <= 600; i++) {
      const x = -3 + i * 0.01;
      const v = hashNoise2D({ x, y, stream: "5eed5eed5eed5eed" });
      assert.ok(Math.abs(v - prev) < 0.2, `discontinuity at (${x}, ${y}): ${prev} -> ${v}`);
      assert.ok(v >= -1 && v <= 1, `out of range at (${x}, ${y}): ${v}`);
      prev = v;
    }
  }
});

test("fbm sums octaves deterministically and stays bounded", () => {
  const args = { x: 3.5, y: 7.25, stream: "d9a0051d32afab59", octaves: 6, lacunarity: 2, gain: 0.5 };
  assert.equal(fbm(args), fbm(args));
  for (let i = 0; i < 200; i++) {
    const v = fbm({ ...args, x: i * 0.11, y: i * 0.29 });
    assert.ok(v >= -1.001 && v <= 1.001, `fbm out of range: ${v}`);
  }
});

test("fbm stays normalised at the degenerate gains 1 and 0", () => {
  // gain 1 makes every octave amplitude 1, so `norm` is the octave count and
  // an un-normalised sum would leave [-1, 1] immediately. gain 0 makes every
  // octave after the first contribute nothing, and norm 1 — not 0.
  for (const gain of [1, 0.75, 0.5, 0]) {
    for (let i = 0; i < 120; i++) {
      const v = fbm({ x: i * 0.13 - 6, y: i * 0.31 - 9, stream: "d9a0051d32afab59", octaves: 6, lacunarity: 2, gain });
      assert.ok(v >= -1.001 && v <= 1.001, `gain ${gain}: fbm out of range: ${v}`);
    }
  }
  // Zero octaves is the one input with no amplitude at all: 0, never NaN.
  assert.equal(fbm({ x: 1, y: 2, stream: "d9a0051d32afab59", octaves: 0 }), 0);
});

test("UNIT_VECTORS is a committed literal table of 16 unit vectors", () => {
  assert.equal(UNIT_VECTORS.length, 16);
  for (const [dx, dy] of UNIT_VECTORS) {
    const len = Math.sqrt(dx * dx + dy * dy);
    assert.ok(Math.abs(len - 1) < 1e-9, `not a unit vector: ${dx},${dy} (len ${len})`);
  }
  assert.throws(() => { UNIT_VECTORS.push([0, 0]); });
  // Frozen one level down too: a frozen array of live rows is not a frozen
  // table, and a pass that normalised a row in place would move the world.
  assert.throws(() => { UNIT_VECTORS[0][0] = 99; });
});

test("q quantises to 2 decimals and is idempotent", () => {
  assert.equal(q(1.23456), 1.23);
  assert.equal(q(1.235), 1.24);
  assert.equal(q(q(1.23456)), q(1.23456));
  assert.equal(q(0.5), 0.5);   // grid corners survive unchanged
  assert.equal(q(-3.145), -3.14);
});

test("q is idempotent over a wide sweep, which is what a hash of its output needs", () => {
  for (let i = -5000; i <= 5000; i++) {
    const v = i * 0.0137;
    assert.equal(q(q(v)), q(v), `q is not idempotent at ${v}`);
  }
});

test("mintSeed is the pinned sha256 construction", () => {
  const s = mintSeed({ parentStream: "d9a0051d32afab59", name: "landform" });
  assert.match(s, /^[0-9a-f]{16}$/);
  assert.equal(s, mintSeed({ parentStream: "d9a0051d32afab59", name: "landform" }));
  assert.notEqual(s, mintSeed({ parentStream: "d9a0051d32afab59", name: "landforms" }));
});

test("a stream that is not hex is a THROW, never a silent collapse onto field 0", () => {
  // Number.parseInt("seedseed", 16) is NaN and `NaN | 0` is 0, so without this
  // guard every non-hex stream — a pass name passed by mistake, a truncated
  // seed, an undefined — samples the SAME field, deterministically, with every
  // test still green. That is the failure mode this rule exists for.
  for (const bad of ["seedseedseedseed", "abc", "", "ABCDEF01", undefined, null, 12345])
    assert.throws(() => hashNoise2D({ x: 1, y: 2, stream: bad }), /stream must be a lowercase hex string/,
      `stream ${JSON.stringify(bad)} was accepted`);
  // A real minted stream is accepted, and 16 hex chars are not required — the
  // first 8 are what the field is keyed on.
  assert.equal(typeof hashNoise2D({ x: 1, y: 2, stream: mintSeed({ parentStream: "7c9e4a2f8b1d6e03", name: "elevation" }) }), "number");
});
