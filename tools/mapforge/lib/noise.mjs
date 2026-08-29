// tools/mapforge/lib/noise.mjs — Plan C: integer-hash value noise.
//
// R5 (spec 7.3): ECMA-262 leaves Math.sin / cos / exp / log / pow
// implementation-approximated and V8 has changed them between versions, so a
// Node upgrade with ZERO content change can red every byte gate. This file
// therefore uses only + - * / % and Math.sqrt (all pinned to correctly-rounded
// IEEE-754 by the spec) plus Math.imul and the bitwise operators (exact
// integer ops). Math.hypot is BANNED even though it is not transcendental: its
// error bound is implementation-defined.
//
// tests/noise-determinism.test.mjs scans this file's own source for
// violations, in TWO passes — the dotted call form, and the indirect forms
// (Math["cos"], `const M = Math`, `const { cos } = Math`, globalThis.Math.cos,
// new Function / eval) a naive text scan would otherwise miss. Do not add one
// and "fix" the test.
//
// The scan is ACCIDENT prevention, not an adversarial sandbox, and the
// difference is measured, not assumed: every form that SPELLS the token `Math`
// is caught, and that is every form a later pass reaching for `Math.cos` by
// name will actually use. Forms that assemble the name at run time —
// globalThis["Ma" + "th"].cos, Reflect.get(globalThis, "Mat" + "h") — are NOT
// caught and are not meant to be. Nor is engine-dependent formatting reached
// without Math at all (toFixed, toLocaleString). Do not read the scan as a
// completeness guarantee.

// -- the hash --------------------------------------------------------------
// xor-shift / multiply finaliser. Math.imul is exact 32-bit multiplication.
function hash3(x, y, s) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (s | 0)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x3d4d51c3) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// A 16-hex stream seed -> one exact 32-bit integer. Number.parseInt on 8 hex
// chars is exact: the value is integral and below 2^32, so no rounding can
// occur. A stream shorter than 8 hex chars, or one carrying a non-hex
// character, would parse to NaN and silently collapse every stream onto the
// same field — so that is a throw, at the one place it is cheap to catch.
export function streamInt(stream) {
  if (typeof stream !== "string" || !/^[0-9a-f]{8}/.test(stream))
    throw new TypeError(`noise: stream must be a lowercase hex string of at least 8 chars, got ${JSON.stringify(stream)}`);
  return Number.parseInt(stream.slice(0, 8), 16) >>> 0;
}

// [-1, 1], and EXACTLY [-1, 1] at the ends: 2147483647.5 x 2 is 4294967295,
// the largest value hash3 can return, and 4294967295 / 2 is representable, so
// the division is one correctly-rounded op with no residue at either end.
const toSigned = (h) => (h / 2147483647.5) - 1;

// Polynomial smoothstep — the transcendental-free interpolant.
export function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// Value noise on the integer lattice, bilinearly interpolated through
// smoothstep. Continuous, deterministic, no trig.
//
// Math.floor, NEVER `| 0`. Truncation toward zero makes [-1, 0) and [0, 1)
// share lattice cell 0, which folds the whole field about the origin and
// makes every negative coordinate wrong — and a positive-only test passes
// under both. tests/noise-determinism.test.mjs sweeps across zero for exactly
// this reason.
export function hashNoise2D({ x, y, stream }) {
  // Same rule as streamInt's, for the same reason: a NaN or undefined
  // coordinate makes `Math.floor(x)` NaN, `NaN | 0` 0 inside hash3, and the
  // result NaN — which q() carries through to `null` in a COMMITTED json
  // (JSON.stringify(NaN) is "null"). A silent collapse is worse than a throw,
  // and this is the one place it is cheap to catch. Measured cost of the two
  // Number.isFinite calls: ~3.6 ns/call, against a streamInt regex test this
  // function already runs on every call.
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new TypeError(`noise: x and y must be finite, got (${x}, ${y})`);
  const s = streamInt(stream);
  const xi = Math.floor(x), yi = Math.floor(y);
  const tx = smoothstep(x - xi), ty = smoothstep(y - yi);
  const v00 = toSigned(hash3(xi, yi, s));
  const v10 = toSigned(hash3(xi + 1, yi, s));
  const v01 = toSigned(hash3(xi, yi + 1, s));
  const v11 = toSigned(hash3(xi + 1, yi + 1, s));
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

// Fractal brownian motion, normalised by the amplitude SUM so the result stays
// in [-1, 1] for every octave count and every gain — including gain 1, where
// each octave keeps amplitude 1 and an un-normalised sum would leave the range
// on the second octave.
export function fbm({ x, y, stream, octaves = 6, lacunarity = 2, gain = 0.5 }) {
  // fbm needs its OWN guard, not hashNoise2D's: it passes `x * freq`, and
  // `null * 1` is 0 while `"3" * 1` is 3 — so a bad coordinate is coerced to a
  // plausible one before the inner guard ever sees it.
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new TypeError(`noise: x and y must be finite, got (${x}, ${y})`);
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * hashNoise2D({ x: x * freq, y: y * freq, stream });
    norm += amp < 0 ? -amp : amp;   // |amp|: a negative gain alternates the sign, and a SIGNED sum cancels instead of normalising (measured: gain -0.9, 7 octaves left fbm at -2.419)
    amp *= gain;
    freq *= lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}

// 16 committed unit vectors at 22.5-degree steps. Written as literals BECAUSE
// Math.cos is banned here: these are the directions every pass (winds, domain
// warp, arc fractalisation) samples along. Frozen TWO levels deep — a frozen
// array of live rows is not a frozen table, and a pass that normalised a row
// in place would move the world.
export const UNIT_VECTORS = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([0.9238795325112867, 0.3826834323650898]),
  Object.freeze([0.7071067811865476, 0.7071067811865476]),
  Object.freeze([0.3826834323650898, 0.9238795325112867]),
  Object.freeze([0, 1]),
  Object.freeze([-0.3826834323650898, 0.9238795325112867]),
  Object.freeze([-0.7071067811865476, 0.7071067811865476]),
  Object.freeze([-0.9238795325112867, 0.3826834323650898]),
  Object.freeze([-1, 0]),
  Object.freeze([-0.9238795325112867, -0.3826834323650898]),
  Object.freeze([-0.7071067811865476, -0.7071067811865476]),
  Object.freeze([-0.3826834323650898, -0.9238795325112867]),
  Object.freeze([0, -1]),
  Object.freeze([0.3826834323650898, -0.9238795325112867]),
  Object.freeze([0.7071067811865476, -0.7071067811865476]),
  Object.freeze([0.9238795325112867, -0.3826834323650898]),
]);

// Rational falloff, replacing exp(-k*d). Monotonic on d >= 0, f(0) = 1,
// f(inf) -> 0 — every property the elevation and mask passes rely on.
export function falloff({ d, k }) {
  const t = k * d;
  return 1 / (1 + t + t * t);
}

// THE quantiser. Every committed number passes through this before
// JSON.stringify + sha256 (spec 7.3 fix 3). 0.5 is exactly representable in
// binary, so grid corners survive unchanged, and q is idempotent, which is
// what a hash taken over its output requires.
export function q(v) {
  return Math.round(v * 100) / 100;
}
