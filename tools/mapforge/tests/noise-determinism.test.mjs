// tools/mapforge/tests/noise-determinism.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashNoise2D, fbm, falloff, smoothstep, UNIT_VECTORS, q } from "../lib/noise.mjs";
import { mintSeed, namedStream, RESERVED_STREAM_NAMES } from "../lib/seed.mjs";
import { codeOfFile, lineOf, stripComments, sourceFilesUnder, LEGACY_IMPRECISE_FILES } from "./_source-scan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, "../lib");
import { TRUNK_NODES } from "../../../scripts/tests/helpers/census.mjs";

const REPO = resolve(HERE, "../../..");
// DERIVED, not listed. This was `["noise.mjs", "seed.mjs", "grid.mjs"]` and
// nobody extended it when lib/passes/ landed, so the three generator passes on
// the committed-byte path got the census's coverage and not this file's
// stricter whitelist. MEASURED by review D: `const _M = Math; _M.cos(x)`
// appended to lib/passes/mask.mjs was GREEN, and the identical line in
// lib/noise.mjs was RED — a half-covered ban reads as a covered one.
//
// So: every source file under lib/, recursively, MINUS the four files frozen in
// determinism-inventory.test.mjs's INVENTORY. Those four legitimately carry
// Math.hypot/atan2/PI on byte-frozen geometry (see that file's header); every
// other file, present or FUTURE, gets the whitelist by default.
const LEGACY = new Set(LEGACY_IMPRECISE_FILES);
const SCANNED = sourceFilesUnder(LIB).filter((f) => !LEGACY.has(f));

// The spec's R5 mitigation is "no transcendentals on any path reaching a
// committed byte". A comment cannot enforce that; a source scan can.
//
// EVERY scan below reads COMMENT-STRIPPED source, through the one stripper
// tests/_source-scan.mjs holds — see its header. Before the seam-1 fix pass
// this file excluded only a line whose trimmed start was `//`, so a JSDoc
// block or a trailing comment naming Math.cos reddened the suite on prose,
// while determinism-inventory.test.mjs three files away deliberately stripped
// comments and said why. Two scans, one repo, contradictory policies. This is
// the reconciliation: same stripper, same policy, and the scan gets STRICTER
// as a side effect (a violation parked after a `*/` on a kept line no longer
// survives).
const BANNED = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|hypot|cbrt|sinh|cosh|tanh)\b|\*\*/;

test("noise.mjs and seed.mjs contain no transcendental call and no ** operator", () => {
  for (const f of SCANNED) {
    const code = codeOfFile(join(LIB, f));
    const offending = code.split("\n")
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => BANNED.test(line));
    assert.deepEqual(offending, [], `${f} uses a banned operation: ${JSON.stringify(offending)}`);
  }
});

// The scan above reads TEXT, so the ways round it are textual — and a
// BLACKLIST of spellings loses that race. Review finding, reproduced: with a
// blacklist, `const _trig = Math; _trig.sin(0)` and `Function("return " + "Ma"
// + "th.si" + "n(0)")()` both left the whole 278-test mapforge suite green.
//
// So the rule is a WHITELIST instead: the token `Math` may appear only as a
// dotted call on one of the operations ECMA-262 pins exactly — the integer and
// comparison ops, and Math.sqrt, which IEEE 754 mandates be correctly rounded.
// Every other appearance of the token, in any spelling — an alias, a
// destructure, a computed access, a Reflect hop — is a violation.
//
// WHAT THIS DOES NOT CLAIM, measured by the review rather than assumed: a name
// ASSEMBLED at run time (`globalThis["Ma" + "th"].cos`, `Reflect.get(globalThis,
// "Mat" + "h")`) is not caught, and neither is engine-dependent formatting that
// never names Math (`toFixed`, `toLocaleString`). This is accident prevention:
// the realistic failure is a later pass reaching for `Math.cos` BY NAME, and
// every plain named form is caught. An earlier version of this comment argued
// the indirect routes "cannot be written without the token" — they can, and
// claiming completeness invites the next author to trust it.
const ALLOWED_MATH = /^\.(imul|floor|ceil|round|trunc|abs|min|max|sqrt|sign)\b/;
// The one way to reach a transcendental without naming Math: build the name at
// runtime. `new Function`, `Function` and `eval` are banned by NAME, not by
// call shape — `const E = eval; E(...)` and `(0, eval)(...)` both dodge a
// regex that requires an immediately-following `(`.
const CODEGEN = /\bnew\s+Function\b|(?<![.\w$])Function\b|(?<![.\w$])eval\b/;

test("the transcendental ban is a WHITELIST: `Math` may only be a dotted exact op", () => {
  for (const f of SCANNED) {
    const code = codeOfFile(join(LIB, f));
    for (const m of code.matchAll(/\bMath\b/g)) {
      // The tail is taken across NEWLINES and with leading whitespace dropped,
      // so a legitimate call wrapped as `Math\n  .floor(x)` reads as `.floor`
      // and not as a bare `Math`. Line-at-a-time reddened correct code.
      const tail = code.slice(m.index + 4).replace(/^\s+/, "");
      assert.ok(ALLOWED_MATH.test(tail),
        `${f}:${lineOf(code, m.index)} uses Math in a form the ban cannot check: ${tail.slice(0, 60)}`);
    }
  }
});

test("the ban cannot be stepped over by building the name at runtime", () => {
  for (const f of SCANNED) {
    const code = codeOfFile(join(LIB, f));
    const m = CODEGEN.exec(code);
    assert.equal(m, null, m && `${f}:${lineOf(code, m.index)} builds code at runtime: ${m[0]}`);
  }
});

// The stripper is now load-bearing for BOTH scans, so it has its own fixtures:
// each string below is a shape that reddened the suite before the fix pass.
test("the scans read CODE: prose naming a banned op is not a violation, and a wrapped call is not one either", () => {
  for (const prose of [
    "/* Math.cos is not used here */",
    "/** @see Math.hypot */",
    "const probe = () => 1; // avoid Math.cos here",
  ]) {
    const stripped = stripComments(prose);
    assert.ok(!BANNED.test(stripped), `prose read as code: ${prose}`);
    assert.equal([...stripped.matchAll(/\bMath\b/g)].length, 0, prose);
  }
  // …while a real call, however it is spelled or wrapped, still reads as code.
  const wrapped = stripComments("Math\n  .floor(1.7);");
  const hits = [...wrapped.matchAll(/\bMath\b/g)];
  assert.equal(hits.length, 1);
  assert.ok(ALLOWED_MATH.test(wrapped.slice(hits[0].index + 4).replace(/^\s+/, "")),
    "a legitimate Math.floor wrapped over two lines must not read as a violation");
  assert.ok(BANNED.test(stripComments("const v = Math.cos(0); // not a comment")),
    "a real banned call on a line that also carries a comment must still be caught");
  // Line numbers survive stripping, or a violation reports the wrong place.
  const src = "a\n/* two\n   lines */\nMath.cos(0)\n";
  const code = stripComments(src);
  assert.equal(code.split("\n").length, src.split("\n").length);
  assert.equal(lineOf(code, code.indexOf("Math")), 4);
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
  // Frozen one level down too, on EVERY row — a frozen array of live rows is
  // not a frozen table, and a pass that normalised a row in place would move
  // the world. Checking row 0 only left rows 1..15 unprotected: unfreezing row
  // 1 and row 8 both survived a full mutation run (review finding).
  for (const [r, row] of UNIT_VECTORS.entries()) {
    assert.ok(Object.isFrozen(row), `UNIT_VECTORS row ${r} is not frozen`);
    assert.throws(() => { row[0] = 99; }, `UNIT_VECTORS row ${r} is writable`);
    assert.throws(() => { row.push(0); }, `UNIT_VECTORS row ${r} is extensible`);
  }
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

// ── THE RESERVED STREAM NAMES ─────────────────────────────────────────────
//
// THE SEAM-3 TRAP, AND THE GUARD THAT MAKES THE CLASS IMPOSSIBLE RATHER THAN
// THE INSTANCE FIXED. Three times a pass has minted a CHILD stream under one of
// the four names content/spine/derived.json already commits per node, got a
// different value, and used it — deterministically, self-consistently, with
// every golden stable and every review green. Seam 3 lost a whole seam to it on
// `terrain`; seam 4 repeated it on `names` in landforms.mjs's `assignNames`
// while a test three lines away joined `terrain` to the committed record.
//
// So the fix is not another join for `names`. It is: the four names cannot be
// minted as children at all, the list cannot rot away from the committed
// record, and no source file may spell one at a mintSeed call site.

test("RESERVED_STREAM_NAMES is exactly the key set derived.json commits", () => {
  const derived = JSON.parse(readFileSync(join(REPO, "content/spine/derived.json"), "utf8"));
  const keySets = new Set();
  let nodes = 0;
  for (const rec of Object.values(derived)) {
    if (!rec?.resolvedSeedStreams) continue;
    nodes++;
    keySets.add(Object.keys(rec.resolvedSeedStreams).sort().join(","));
  }
  // COUNT AUTHORITY: content/spine/trunk-census.json (Plan E, E-C4). `>= 44`
  // was the pre-redraw trunk; EXACT is what the join needs — a `>=` lets nodes
  // silently stop carrying streams as long as enough others still do.
  assert.equal(nodes, TRUNK_NODES,
    `${nodes} committed nodes carry resolvedSeedStreams; content/spine/trunk-census.json says ${TRUNK_NODES}`);
  assert.equal(keySets.size, 1, "committed nodes disagree about which streams they name");
  assert.equal([...keySets][0], [...RESERVED_STREAM_NAMES].sort().join(","),
    "mapforge's reserved list has drifted from what derived.json actually commits");
});

test("a reserved stream name is UNMINTABLE as a child, and namedStream is the only way in", () => {
  for (const name of RESERVED_STREAM_NAMES) {
    assert.throws(() => mintSeed({ parentStream: "d9a0051d32afab59", name }),
      /is one of the four stream names/, `mintSeed happily minted a child called "${name}"`);
    assert.match(namedStream({ worldSeed: "7c9e4a2f8b1d6e03", name }), /^[0-9a-f]{16}$/);
  }
  // …and the door only opens one way: namedStream refuses anything else, so it
  // cannot become a general-purpose minter that quietly re-admits the defect.
  assert.throws(() => namedStream({ worldSeed: "7c9e4a2f8b1d6e03", name: "provenance" }),
    /is not one of the committed stream names/);
  // The value is the committed one, joined here as well as in seed.mjs's own
  // test, so the two constructions cannot fork.
  const derived = JSON.parse(readFileSync(join(REPO, "content/spine/derived.json"), "utf8"));
  const worldSeed = JSON.parse(readFileSync(join(REPO, "content/spine/nodes/n-atlas.json"), "utf8")).seed.value;
  for (const [name, value] of Object.entries(derived["n-atlas"].resolvedSeedStreams))
    assert.equal(namedStream({ worldSeed, name }), value);
});

test("NO source file under tools/mapforge mints a reserved stream name", () => {
  // The runtime throw catches a call that RUNS. This catches one that is
  // written — including in a branch no fixture reaches — and it walks the tree
  // rather than a maintained list, so a pass added by Task 9 or Task 10 is
  // covered by default.
  const root = resolve(HERE, "..");
  const offenders = [];
  let scanned = 0, callSites = 0;
  for (const rel of sourceFilesUnder(root)) {
    const src = codeOfFile(join(root, rel));
    scanned++;
    // `mintSeed({ ... name: "<literal>" ... })` — the only spelling the tree
    // uses, and a template literal cannot be a bare reserved name.
    const re = /mintSeed\s*\(\s*\{[^}]*?name\s*:\s*"([^"]*)"/g;
    for (let m; (m = re.exec(src)) !== null; ) {
      callSites++;
      if (RESERVED_STREAM_NAMES.includes(m[1]))
        offenders.push(`${rel}:${lineOf(src, m.index)} mints the reserved stream "${m[1]}"`);
    }
  }
  assert.ok(scanned > 30, `only ${scanned} files scanned — the walk has gone dark`);
  assert.ok(callSites > 0, "no mintSeed call site found at all — this scan has stopped testing");
  assert.deepEqual(offenders, [],
    `a pass is deriving its own value for a stream derived.json already commits:\n${offenders.join("\n")}`);
});

// ── THE FIELD ITSELF, not just its shape ──────────────────────────────────
// Every test above this line proves f(a) === f(a), a range, or a continuity
// property. None of them names a VALUE, and six mutations that each produce a
// DIFFERENT WORLD survived a full run because of it (review, reproduced):
// hash3's multiplier constant, hash3's final xor-shift, toSigned's divisor,
// fbm's `freq *= lacunarity`, mintSeed's sha256 -> sha512, and mintSeed's join
// order. Plans C, D and E all inherit this field; a silent fork of it is a
// silently different world, on every sheet, with every gate green.
//
// So: literals. They are not magic numbers — each was READ OFF the
// implementation at f40d80b and every one of the six mutations moves at least
// one of them. If a deliberate change to the field is ever made, these are the
// lines that must be re-baselined, and having to do that is the point.
test("the noise field is pinned to committed golden values, not merely to itself", () => {
  assert.equal(hashNoise2D({ x: 12.25, y: 88.75, stream: "d9a0051d32afab59" }), -0.25916076946836725);
  // A negative-coordinate sample too: `| 0` for Math.floor folds the field
  // about the origin, and only this side of zero can see it.
  assert.equal(hashNoise2D({ x: -3.5, y: -0.25, stream: "d9a0051d32afab59" }), -0.3176275987364649);
  assert.equal(fbm({ x: 3.5, y: 7.25, stream: "d9a0051d32afab59", octaves: 6, lacunarity: 2, gain: 0.5 }),
               0.4815606085063886);
  assert.equal(smoothstep(0.25), 0.15625);
  assert.equal(falloff({ d: 1, k: 3 }), 0.07692307692307693);
});

// The strongest single assertion available in this file: it ties the new module
// to content/spine/derived.json AND to scripts/lib/spine.mjs's streamSeed() at
// once. seed.mjs's header CLAIMS the construction is unchanged from streamSeed;
// this is the claim under test rather than in a comment.
test("mintSeed reproduces every seed stream already committed in derived.json", () => {
  const derived = JSON.parse(readFileSync(join(REPO, "content/spine/derived.json"), "utf8"));
  // The golden literal first, so this test still pins a value if derived.json
  // is ever regenerated. It is a pure function of (worldSeed, name) and owes
  // nothing to the tree, which is why the redraw did not move it — the pair
  // was READ from the pre-redraw n-ashvale-front, a node the redraw retired,
  // and it stays here as an independent oracle on namedStream's construction.
  assert.equal(namedStream({ worldSeed: "fea688ddeefe8c42", name: "terrain" }), "c49af60a9fb6ecaf");
  let joined = 0;
  for (const [id, rec] of Object.entries(derived)) {
    const streams = rec?.resolvedSeedStreams;
    if (!streams) continue;
    const nodePath = join(REPO, "content/spine/nodes", `${id}.json`);
    if (!existsSync(nodePath)) continue;
    const parentStream = JSON.parse(readFileSync(nodePath, "utf8"))?.seed?.value;
    if (typeof parentStream !== "string") continue;
    for (const [name, value] of Object.entries(streams)) {
      assert.equal(namedStream({ worldSeed: parentStream, name }), value,
        `${id}/${name}: mapforge's namedStream has forked from the construction that minted the committed stream`);
      joined++;
    }
  }
  // Every committed node x its 4 named streams. A join that stops joining is a
  // test that stopped testing (STATE §6 trap 7), so the count is asserted —
  // EXACTLY, and derived from content/spine/trunk-census.json rather than typed,
  // so the next redraw updates one file instead of this literal.
  assert.equal(joined, TRUNK_NODES * RESERVED_STREAM_NAMES.length,
    `${joined} committed streams joined; the census expects ${TRUNK_NODES} nodes x ${RESERVED_STREAM_NAMES.length} streams`);
});

// falloff was EXPORTED WITH NO TEST AT ALL: `grep -c falloff` over both test
// files returned 0 and 0, and changing 1/(1+t+t²) to 1/(2+t+t²) — which breaks
// the f(0) = 1 the elevation and mask passes rely on — survived a full run.
// It is the one export whose whole purpose is to keep a later pass away from
// Math.exp.
test("falloff is the rational replacement for exp(-k*d): f(0) = 1, monotone, no pole", () => {
  assert.equal(falloff({ d: 0, k: 3 }), 1);
  assert.equal(falloff({ d: 0, k: 0 }), 1);
  assert.equal(falloff({ d: 12.5, k: 0 }), 1, "k = 0 is no falloff at all, at every distance");
  let prev = Infinity;
  for (let i = 0; i <= 400; i++) {
    const v = falloff({ d: i * 0.05, k: 3 });
    assert.ok(v > 0 && v <= 1, `falloff out of (0, 1] at d=${i * 0.05}: ${v}`);
    assert.ok(v < prev || i === 0, `falloff is not monotone decreasing at d=${i * 0.05}`);
    prev = v;
  }
  assert.ok(falloff({ d: 10, k: 3 }) < 0.01, "falloff must actually fall off");
  // The denominator 1 + t + t² has no real root, so there is no division by
  // zero anywhere on d >= 0 — the property that makes this safe as a mask.
  assert.ok(Number.isFinite(falloff({ d: 1e9, k: 1e9 })));
});

test("fbm stays in [-1, 1] for a NEGATIVE gain too, which a signed normaliser does not", () => {
  // The header claims "every gain". With `norm += amp` the amplitudes cancel
  // instead of normalising: measured -2.419 at gain -0.9, octaves 7.
  for (const gain of [-0.9, -1, -0.5]) {
    for (let i = 0; i < 60; i++) {
      const v = fbm({ x: i * 0.17 - 5, y: i * 0.23 - 3, stream: "d9a0051d32afab59", octaves: 7, lacunarity: 2, gain });
      assert.ok(v >= -1.001 && v <= 1.001, `gain ${gain}: fbm out of range: ${v}`);
    }
  }
  // …and the sign fix must not have moved the field for the gains anything
  // actually uses: the golden fbm value above is at gain 0.5.
  assert.equal(fbm({ x: 3.5, y: 7.25, stream: "d9a0051d32afab59", octaves: 6, lacunarity: 2, gain: 0.5 }),
               0.4815606085063886);
});

test("a non-finite coordinate is a THROW, matching streamInt rather than collapsing to a committed null", () => {
  // JSON.stringify(NaN) is "null", so an unguarded NaN coordinate reaches a
  // COMMITTED file as a plausible-looking null. Same class as the stream guard,
  // and it was the asymmetry the review named.
  for (const bad of [undefined, NaN, Infinity, -Infinity, null, "3"])
    for (const key of ["x", "y"]) {
      const args = { x: 1, y: 2, stream: "d9a0051d32afab59", [key]: bad };
      assert.throws(() => hashNoise2D(args), /x and y must be finite/, `${key} = ${String(bad)} was accepted`);
      assert.throws(() => fbm(args), /x and y must be finite/, `fbm accepted ${key} = ${String(bad)}`);
    }
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

test("the whitelist scan covers every non-legacy lib file, derived from the tree", () => {
  // The rule that has now failed twice is a MAINTAINED LIST. Pin the derivation
  // instead: the passes must be in, the four grandfathered sheet builders out,
  // and the count must be large enough that a walk which stopped recursing is
  // visible here rather than as a silent green.
  for (const f of ["noise.mjs", "seed.mjs", "grid.mjs",
                   "passes/mask.mjs", "passes/elevation.mjs", "passes/sea-level.mjs"])
    assert.ok(SCANNED.includes(f), `${f} is not whitelist-scanned: ${JSON.stringify(SCANNED)}`);
  for (const f of LEGACY_IMPRECISE_FILES)
    assert.ok(!SCANNED.includes(f), `${f} is inventoried AND whitelist-scanned — it would be permanently red`);
  assert.ok(SCANNED.length >= 14, `only ${SCANNED.length} files whitelist-scanned`);
  assert.ok(SCANNED.some((f) => f.includes("/")), "no file under a lib/ SUBDIRECTORY is whitelist-scanned");
});
