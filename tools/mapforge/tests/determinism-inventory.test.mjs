// F-047 seam-4 fix pass — the determinism ban, made COHERENT and MECHANICAL.
//
// THE FINDING (review A, 7). The plan's rule reads "`Math.sqrt` allowed;
// `Math.hypot` BANNED", and a note filed during this feature said `Math.hypot`
// appears at 2 sites. Both are wrong in the same direction:
//
//  * it is 7 hypot sites, not 2 — and the same functions reach for
//    `Math.atan2` and `Math.PI` on the identical code path, so singling out
//    hypot is incoherent. `alongKm`/`offsetKm` compute a length with hypot and
//    an angle with atan2 two lines apart, and both results are r2()'d straight
//    into a committed, byte-compared SVG;
//  * and hypot is not even the largest exposure. `world-gen.mjs` — which
//    builds the canary sheet, whose SVG IS committed and IS in the render lock
//    — uses `Math.cos`, `Math.sin` and the `**` operator. Neither reviewer
//    found that, because a prose ban naming one function is not a search.
//
// WHY THESE ARE THE FUNCTIONS THAT MATTER. IEEE 754 mandates that `Math.sqrt`
// be correctly rounded, so it is bit-identical on every engine there has ever
// been. It mandates nothing of the kind for hypot, atan2, sin, cos, exp, log
// or pow: each implementation picks its own polynomial, and two engines may
// legitimately differ in the last place. That difference reaches a committed
// byte only if it crosses one of `r2()`'s 0.005 boundaries — vanishingly
// unlikely per call, and not something a byte-compared artifact should rest on
// as an argument.
//
// WHAT WE ACTUALLY KNOW, as opposed to what we fear: the render lock hashes
// all three committed SVGs and is verified GREEN on CI's pinned Node 18 and on
// local Node 26. So on the two engines this repo runs, every one of the calls
// below is empirically byte-identical. That is the evidence, and it is why
// none of this was ripped out: a rewrite of working, byte-frozen geometry to
// satisfy a rule stated about a different function would be a redraw nobody
// ordered, at real risk, for a hazard the lock is already measuring.
//
// SO THE RULE IS AN INVENTORY, NOT A BAN. Every use is frozen below, by file
// and by count. A NEW one reds this test, and whoever adds it has to decide
// deliberately: prove it cannot move a byte, or don't add it. That is a rule
// a reader can obey, which the prose ban was not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments, codeOfFile, sourceFilesUnder, isSourceFile, LEGACY_IMPRECISE_FILES } from "./_source-scan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, "../lib");
const MAPFORGE = resolve(HERE, "..");

// `Date`, `performance.now` and `Math.random` are a different class: they are
// not merely imprecise, they are not FUNCTIONS of the input at all. Those stay
// a flat ban with no inventory, below.
const IMPRECISE =
  /Math\.(hypot|sin|cos|tan|asin|acos|atan2|atan|exp|expm1|log1p|log2|log10|log|pow|cbrt|sinh|cosh|tanh|fround)\b|Math\.(PI|E|LN2|LN10|LOG2E|LOG10E|SQRT1_2)\b|\*\*/g;
const NEVER = [
  [/Math\.random/, "Math.random"],
  [/\bDate\b/, "Date"],
  [/performance\.now/, "performance.now"],
];

/** Source with comments removed: the headers legitimately NAME these to say
 *  they are not used, and a scan that reads prose as code gets worked around
 *  instead of obeyed.
 *
 *  The stripper moved to tests/_source-scan.mjs in the seam-1 fix pass so that
 *  noise-determinism.test.mjs — which read prose as code, and reddened on a
 *  JSDoc block — uses the SAME one. Two scans over the same files with
 *  opposite comment policies is not a rule anybody can obey. */
const codeOf = (file) => codeOfFile(join(LIB, file));

// THE FILE LIST IS DERIVED FROM THE TREE, not maintained. Two seams running,
// this ban was found holed by a MAINTAINED LIST: seam 1 by a non-recursive
// readdir (lib/passes/ dark to both scans), seam 2 by `endsWith(".mjs")` (a
// `lib/helper.js` with Math.cos AND Date.now, importable from every pass, green
// in both scans) and by a non-recursive top-level walk (`tools/mapforge/cli/`
// dark). The walk, the extension class and the legacy exemption now all live in
// tests/_source-scan.mjs, and both scans read them from there — so a new
// directory, a new extension or a new pass is covered by DEFAULT.
const libFiles = () => sourceFilesUnder(LIB);
// Everything under tools/mapforge/ EXCEPT lib/ (inventoried above) and tests/.
// Recursive, so a sibling directory — Task 10's CLI layer is the next one — is
// covered without anybody remembering to add it.
const outsideLibFiles = () =>
  sourceFilesUnder(MAPFORGE).filter((f) => !f.startsWith("lib/") && !f.startsWith("tests/"));

function census(file) {
  const counts = {};
  for (const m of codeOf(file).matchAll(IMPRECISE)) counts[m[0]] = (counts[m[0]] ?? 0) + 1;
  return counts;
}

// FROZEN 2026-08-22. Every entry predates this feature's base tag; each is
// r2()'d into a committed artifact and each is proven byte-identical on Node 18
// and Node 26 by check_render_lock. Adding a line here is a determinism
// decision, not a formality.
const INVENTORY = {
  // alongKm/offsetKm/polylineKm: label anchors and offset coast echoes.
  // hypot for the length, atan2 + PI for the heading, two lines apart — which
  // is the whole reason banning one and not the other made no sense.
  "draft.mjs": { "Math.hypot": 3, "Math.atan2": 2, "Math.PI": 2 },
  // the sea-lane and relay geometry: distance to a segment, and a normal.
  "atlas-sheet.mjs": { "Math.hypot": 2, "Math.atan2": 2, "Math.PI": 2 },
  "basin-sheet.mjs": { "Math.hypot": 2, "Math.atan2": 2, "Math.PI": 2 },
  // noiseRing walks a circle: the LARGEST exposure on this path and the one
  // the prose ban never mentioned. Its output is the canary sheet, which is
  // committed and locked.
  "world-gen.mjs": { "Math.PI": 2, "Math.cos": 1, "Math.sin": 1, "**": 2 },
};

test("the committed-byte path's imprecise-Math inventory is exactly the frozen one", () => {
  const files = libFiles();
  assert.ok(files.length >= 8, `only ${files.length} lib files scanned — this test cannot go dark`);
  assert.ok(files.some((f) => f.includes("/")),
    "no file under a lib/ SUBDIRECTORY was scanned — the walk stopped recursing and lib/passes/ is dark");
  const actual = {};
  for (const f of files) {
    const c = census(f);
    if (Object.keys(c).length) actual[f] = c;
  }
  assert.deepEqual(
    actual,
    INVENTORY,
    "a file on the committed-byte path gained or lost an imprecise Math call. " +
      "IEEE 754 does not mandate correct rounding for these, so two engines may " +
      "differ in the last place and r2() only hides it until a value lands near " +
      "a 0.005 boundary. Adding one means deciding it cannot move a committed " +
      "byte — and then writing that here.",
  );
});

test("Math.sqrt is NOT in the inventory — it is correctly rounded and always allowed", () => {
  // Stated as a test so the distinction survives: the ban is about functions
  // whose result is implementation-defined, not about square roots.
  const users = libFiles().filter((f) => /Math\.sqrt/.test(codeOf(f)));
  assert.ok(users.length > 0, "nothing uses Math.sqrt — the distinction has stopped being live");
  for (const f of users) assert.ok(!(census(f)["Math.sqrt"] ?? 0), `${f}: sqrt was inventoried`);
});

// THE GAP ONE LEVEL UP. Measured by the review: a `Math.cos` helper placed in
// lib/ is caught by the census above, but the SAME helper at
// tools/mapforge/trig-helper.mjs — beside gen-world.mjs and render-sheet.mjs —
// left the whole suite green with Math.cos reachable from lib/. That is not an
// adversary's route, it is an ordinary one: Plan C Task 10 puts a CLI at
// tools/mapforge/generate-world.mjs, and a helper dropped next to it is exactly
// where a later task would put one.
//
// The top-level files are on the committed-byte path (gen-world.mjs writes the
// draft trunk; render-sheet.mjs writes the locked SVGs), and MEASURED 2026-08-22
// both are clean of every entry in IMPRECISE and of every NEVER. So their
// inventory is EMPTY, and an empty inventory is the strongest kind: the next
// author who needs one of these here has to decide deliberately and write it
// down, which is the whole point of the inventory form.
test("everything under tools/mapforge/ outside lib/ carries no imprecise Math at all", () => {
  const files = outsideLibFiles();
  assert.ok(files.length >= 2, `only ${files.length} non-lib mapforge files scanned — this test cannot go dark`);
  const actual = {};
  for (const f of files) {
    const counts = {};
    for (const m of codeOfFile(join(MAPFORGE, f)).matchAll(IMPRECISE)) counts[m[0]] = (counts[m[0]] ?? 0) + 1;
    if (Object.keys(counts).length) actual[f] = counts;
  }
  assert.deepEqual(actual, {},
    "a file under tools/mapforge/ outside lib/ gained an imprecise Math call. lib/ is inventoried; this layer is not, " +
      "because nothing here has ever needed one. Adding the first is a determinism decision — make it here, in writing.");
});

// The ONE file allowed to read a wall clock, and the reason, written where the
// ban is rather than in the file that wants the exception.
//
// `generate-world.mjs` MEASURES the run: the plan's `--stage-report` prints a
// millisecond figure per pass and the CLI compares the total against
// content/world/budgets.json's `generate` row, failing the run over `failMs`.
// A generator that cannot time itself cannot hold a loop budget, and the loop
// budget is goal G4's whole measure.
//
// The exemption is narrow and it is NOT a promise made in prose: what enforces
// the property the ban exists for is
// tools/mapforge/tests/generate-world.test.mjs' "REPRODUCIBLE" test, which
// runs the CLI twice and compares the sha256 of EVERY file it wrote under
// content/. A clock reaching a committed byte reds that immediately. The
// timings themselves live in the draft folder's manifest.json, outside
// content/, and are deliberately excluded from that comparison.
const CLOCK_EXEMPT = Object.freeze(["generate-world.mjs"]);

test("the clock exemption is exactly one file, and it is the CLI", () => {
  assert.deepEqual([...CLOCK_EXEMPT], ["generate-world.mjs"],
    "a second file wants a wall clock — write its reason above before adding it");
  assert.ok(outsideLibFiles().includes("generate-world.mjs"),
    "the exempt file is not in the scanned set, so the exemption is exempting nothing");
  // and it really does read one, so the exemption is not vestigial
  assert.match(codeOfFile(join(MAPFORGE, "generate-world.mjs")), /\bDate\b/);
});

test("nothing on the committed-byte path reads a clock or a random number", () => {
  // A flat ban with ONE declared exception (above): these are not imprecise,
  // they are not functions of the input at all. A single one of them makes the
  // artifact unreproducible rather than merely engine-dependent.
  const offenders = [];
  // Both derived lists: lib/ recursively, and everything else under
  // tools/mapforge/ except tests/. No name is written down here, so nothing can
  // be left off it.
  for (const [label, files] of [["lib", libFiles().map((f) => [join(LIB, f), `lib/${f}`])],
                                [".", outsideLibFiles().map((f) => [join(MAPFORGE, f), f])]])
    for (const [path, name] of files) {
      if (label !== "lib" && CLOCK_EXEMPT.includes(name)) continue;
      const src = codeOfFile(path);
      for (const [re, n] of NEVER) if (re.test(src)) offenders.push(`${label === "lib" ? "" : "./"}${name}: ${n}`);
    }
  assert.deepEqual(offenders.sort(), []);
});

// THE STRIPPER ITSELF, because a scan is only as good as what it reads and
// this is the THIRD time the ban's coverage has been found holed. The
// two-regex form ran the block rule first, so a `/*` inside a LINE comment —
// `// 2. content/world/premises/*.json`, an ordinary header line — opened a
// block comment and blanked the file down to the next `*/`. Reproduced
// 2026-08-22: that comment plus `Math.cos(1) + Date.now()` prepended to
// lib/fabric.mjs left BOTH determinism scans at 30 pass / 0 fail.
test("stripComments: a /* inside a // comment does not open a block comment", () => {
  const src = [
    "// reads content/world/premises/*.json",
    "export const PROBE = Math.cos(1) + Date.now();",
    "/** a real jsdoc mentioning Math.hypot */",
    "export const REAL = 1;",
  ].join("\n");
  const out = stripComments(src);
  assert.equal(out.split("\n").length, src.split("\n").length, "line numbering must survive stripping");
  assert.ok(out.includes("Math.cos(1) + Date.now()"), "the planted violation was blanked with the comment");
  assert.ok(out.includes("export const REAL = 1;"), "the stripper ran past the jsdoc and ate live code");
  assert.ok(!out.includes("premises/*.json"), "the line comment itself must still be stripped");
  assert.ok(!out.includes("Math.hypot"), "the jsdoc must still be stripped");
});

test("stripComments: a REGEX literal full of quotes does not open a string", () => {
  // ink.mjs:38 is `/^<pattern id="([^"]*)" width="([^"]*)" …/` — NINE quotes,
  // an odd number. A string scanner without a newline bound read the next
  // twenty lines as string content and left a `/**` block comment unstripped.
  const src = [
    'const RE = /^<pattern id="([^"]*)" width="([^"]*)"/;',
    "/**",
    " * Math.hypot in a jsdoc",
    " */",
    "export const AFTER = 2;",
  ].join("\n");
  const out = stripComments(src);
  assert.ok(out.includes("const RE = /^<pattern"), "the regex line is code and must survive");
  assert.ok(!out.includes("Math.hypot"), "the block comment after the regex was not stripped");
  assert.ok(out.includes("export const AFTER = 2;"));
});

test("stripComments: a comment opener inside a STRING is not a comment", () => {
  const out = stripComments('const p = "path/*.json"; const q = "// not a comment";\nexport const X = 1;');
  assert.ok(out.includes('"path/*.json"'), "a path in a string must not open a block comment");
  assert.ok(out.includes('"// not a comment"'));
  assert.ok(out.includes("export const X = 1;"));
});

test("the scan reads CODE, not the prose that names these to disclaim them", () => {
  // Three lib headers say "no Math.hypot" in a comment. A scan that counted
  // those would be permanently red and would get deleted rather than obeyed.
  assert.match(readFileSync(join(LIB, "synthetic-sheet.mjs"), "utf8"), /Math\.hypot/);
  assert.equal(census("synthetic-sheet.mjs")["Math.hypot"], undefined);
  assert.match(readFileSync(join(LIB, "labels.mjs"), "utf8"), /Math\.hypot/);
  assert.equal(census("labels.mjs")["Math.hypot"], undefined);
});

// The coverage RULE itself, pinned — because the thing that has failed twice is
// not the scan, it is the belief that the scan covers what it is thought to.
test("the scan's coverage is DERIVED from the tree: extension class and directory recursion", () => {
  // Every extension a file under tools/mapforge/ could plausibly carry and be
  // loadable from an .mjs. `.js` is the one that was dark: no root package.json
  // makes it CommonJS, and an .mjs imports CommonJS fine.
  for (const name of ["a.mjs", "a.js", "a.cjs", "a.ts", "a.mts", "a.cts"])
    assert.ok(isSourceFile(name), `${name} is not scanned — the ban has a hole one extension wide`);
  for (const name of ["a.json", "a.svg", "a.md", "a.mjs.bak"]) assert.ok(!isSourceFile(name), name);

  // Recursion, proven on the real tree rather than asserted: lib/passes/ exists
  // and its files must appear with their directory in the key.
  const lib = libFiles();
  assert.ok(lib.includes("passes/mask.mjs") && lib.includes("passes/elevation.mjs")
    && lib.includes("passes/sea-level.mjs"),
    `lib/passes/ is not being walked: ${JSON.stringify(lib)}`);
  assert.ok(lib.length >= 18, `only ${lib.length} lib files — the walk stopped recursing`);

  // The legacy exemption and the inventory are ONE list, not two that can drift.
  assert.deepEqual(Object.keys(INVENTORY).sort(), [...LEGACY_IMPRECISE_FILES].sort(),
    "the inventory's files and _source-scan.mjs's LEGACY_IMPRECISE_FILES disagree — " +
      "noise-determinism.test.mjs exempts the second list, so a file in one and not the other " +
      "is either scanned twice or not at all");
});
