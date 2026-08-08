import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RULE_FORBIDDEN_TOKEN,
  RULE_NEGATION,
  assertPositivePromptClean,
  lintPositivePrompt,
} from "../generate/prompt-lint.mjs";

/* ------------------------------------------------------------------ *
 * R1 — negation constructions                                         *
 * ------------------------------------------------------------------ */

const REJECTED_NEGATIONS = [
  "no cars",
  "no modern city skyline",
  "NOT 3D render",
  "not a windmill",
  "without power lines",
  "never any wires",
  "avoid pylons",
  "exclude tarmac",
  "No smoke anywhere",
  "laid out with no plan along the roads",
  "a hood with no-frills stitching",
];

for (const text of REJECTED_NEGATIONS) {
  test(`R1 rejects a negation construction: "${text}"`, () => {
    const found = lintPositivePrompt(text);
    assert.equal(found.length > 0, true, `expected a violation in "${text}"`);
    assert.equal(found[0].rule, RULE_NEGATION);
    assert.equal(typeof found[0].index, "number");
    assert.equal(text.slice(found[0].index, found[0].index + found[0].match.length), found[0].match);
  });
}

/**
 * The false-positive set. Every one of these is legitimate prose that a
 * brief, a race identity or a costume clause can legitimately contain, and
 * every one of them contains a negation word as a SUBSTRING. A guard that
 * fires on these is a guard authors will rip out.
 */
const ACCEPTED_PROSE = [
  "on the north-facing walls, a faint violet afterglow",
  "nothing has grown over the street grid",
  "a notable landmark above the ford",
  "snow on the low hills",
  "a canopy of thorn over the track",
  "the notch between two ledges",
  "a nomad totem strung with bone",
  "the mill-house cannot be seen from the ford",
  "none of the plumes rise far",
  "known to every carter on the road",
  "an unnoticed side lane",
  "a piano-black lacquer chest",
  "the innocent bystanders in the square",
  "wall-less crossing town",
  "a fur-lined hood, layered nomad furs",
];

for (const text of ACCEPTED_PROSE) {
  test(`R1 accepts legitimate prose: "${text}"`, () => {
    assert.deepEqual(lintPositivePrompt(text), []);
  });
}

/* ------------------------------------------------------------------ *
 * R2 — forbidden-subject tokens                                       *
 * ------------------------------------------------------------------ */

test("R2 flags a forbidden token even with no negation around it", () => {
  const found = lintPositivePrompt("a dirt track with power lines overhead", {
    forbiddenTokens: ["power lines", "trucks"],
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, RULE_FORBIDDEN_TOKEN);
  assert.equal(found[0].match, "power lines");
});

test("R2 is case-insensitive", () => {
  const found = lintPositivePrompt("a Modern City Skyline on the horizon", {
    forbiddenTokens: ["modern city skyline"],
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].match, "Modern City Skyline");
});

test("R2 is word-boundaried — 'car' does not fire on 'caravan' or 'cart'", () => {
  assert.deepEqual(
    lintPositivePrompt("a caravan-wheel emblem above a loaded cart", { forbiddenTokens: ["car"] }),
    [],
  );
});

test("R2 flags nothing when the caller passes no tokens — the vocabulary lives in config", () => {
  assert.deepEqual(lintPositivePrompt("a truck on a paved road"), []);
});

test("R2 reports every distinct forbidden token present", () => {
  const found = lintPositivePrompt("trucks beside pylons on tarmac", {
    forbiddenTokens: ["trucks", "pylons", "tarmac"],
  });
  assert.equal(found.length, 3);
  assert.deepEqual(new Set(found.map((v) => v.match)), new Set(["trucks", "pylons", "tarmac"]));
});

test("a negated forbidden token trips BOTH rules — naming it is the harm", () => {
  const rules = lintPositivePrompt("no trucks", { forbiddenTokens: ["trucks"] }).map((v) => v.rule);
  assert.deepEqual(new Set(rules), new Set([RULE_NEGATION, RULE_FORBIDDEN_TOKEN]));
});

test("violations are sorted by index so the first one reported is the first one in the text", () => {
  const found = lintPositivePrompt("a clean dirt track, then trucks, then no wires", {
    forbiddenTokens: ["trucks"],
  });
  assert.deepEqual(
    found.map((v) => v.index),
    [...found.map((v) => v.index)].sort((a, b) => a - b),
  );
});

test("a clean positive-assertion prompt lints clean", () => {
  assert.deepEqual(
    lintPositivePrompt(
      "Pre-industrial and pre-electric throughout. The road is a rutted dirt track of bare " +
        "earth and cart ruts. Every vehicle is a wooden ox-drawn cart or a handcart. Every " +
        "structure is timber, canvas, thatch and daub. The horizon is open farmland and low hills.",
      { forbiddenTokens: ["cars", "trucks", "power lines", "paved road", "modern city skyline"] },
    ),
    [],
  );
});

/* ------------------------------------------------------------------ *
 * assertPositivePromptClean — the fail-fast wiring                    *
 * ------------------------------------------------------------------ */

test("assertPositivePromptClean throws naming the rule AND the offending substring", () => {
  assert.throws(
    () => assertPositivePromptClean("a town with no power lines", { forbiddenTokens: ["power lines"] }),
    (err) => {
      assert.match(err.message, new RegExp(RULE_NEGATION));
      assert.match(err.message, new RegExp(RULE_FORBIDDEN_TOKEN));
      assert.match(err.message, /no power/);
      assert.match(err.message, /power lines/);
      return true;
    },
  );
});

test("assertPositivePromptClean returns the text unchanged when it is clean", () => {
  const text = "a rutted dirt track of bare earth and cart ruts";
  assert.equal(assertPositivePromptClean(text, { forbiddenTokens: ["cars"] }), text);
});
