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

import { codeOfFile } from "./_source-scan.mjs";

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
  const files = readdirSync(LIB).filter((f) => f.endsWith(".mjs")).sort();
  assert.ok(files.length >= 8, `only ${files.length} lib files scanned — this test cannot go dark`);
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
  const users = readdirSync(LIB)
    .filter((f) => f.endsWith(".mjs") && /Math\.sqrt/.test(codeOf(f)))
    .sort();
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
test("the mapforge CLI layer, one level above lib/, carries no imprecise Math at all", () => {
  const files = readdirSync(MAPFORGE).filter((f) => f.endsWith(".mjs")).sort();
  assert.ok(files.length >= 2, `only ${files.length} top-level mapforge files scanned — this test cannot go dark`);
  const actual = {};
  for (const f of files) {
    const counts = {};
    for (const m of codeOfFile(join(MAPFORGE, f)).matchAll(IMPRECISE)) counts[m[0]] = (counts[m[0]] ?? 0) + 1;
    if (Object.keys(counts).length) actual[f] = counts;
  }
  assert.deepEqual(actual, {},
    "a file directly under tools/mapforge/ gained an imprecise Math call. lib/ is inventoried; this layer is not, " +
      "because nothing here has ever needed one. Adding the first is a determinism decision — make it here, in writing.");
});

test("nothing on the committed-byte path reads a clock or a random number", () => {
  // A flat ban, no inventory and no grandfathering: these are not imprecise,
  // they are not functions of the input at all. A single one of them makes the
  // artifact unreproducible rather than merely engine-dependent.
  const offenders = [];
  for (const [dir, label] of [[LIB, "lib"], [MAPFORGE, "."]])
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".mjs"))) {
      const src = codeOfFile(join(dir, f));
      for (const [re, name] of NEVER) if (re.test(src)) offenders.push(`${label}/${f}: ${name}`);
    }
  assert.deepEqual(offenders.sort(), []);
});

test("the scan reads CODE, not the prose that names these to disclaim them", () => {
  // Three lib headers say "no Math.hypot" in a comment. A scan that counted
  // those would be permanently red and would get deleted rather than obeyed.
  assert.match(readFileSync(join(LIB, "synthetic-sheet.mjs"), "utf8"), /Math\.hypot/);
  assert.equal(census("synthetic-sheet.mjs")["Math.hypot"], undefined);
  assert.match(readFileSync(join(LIB, "labels.mjs"), "utf8"), /Math\.hypot/);
  assert.equal(census("labels.mjs")["Math.hypot"], undefined);
});
