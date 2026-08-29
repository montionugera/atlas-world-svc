import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FORGE_DIR,
  buildCreaturePrompt,
  buildPrompt,
  loadForge,
  negativePrompt,
  promptForbiddenTokens,
} from "../generate/charsheet.mjs";
import { buildEnvNegative, buildEnvPositive } from "../generate/env.mjs";
import {
  RULE_ASSERTION_MISSING,
  RULE_FORBIDDEN_TOKEN,
  RULE_NEGATION,
  RULE_SCALE_UNBOUNDED,
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

/* ------------------------------------------------------------------ *
 * The real, live config — the tests this module exists for.          *
 *                                                                    *
 * These compose the SHIPPED prompts/*.json + forge.config.json into  *
 * real positive prompts and assert zero violations. Before the F-039 *
 * fix the environment one reported ten R1-negation violations        *
 * ("NOT 3D", "NOT CGI", "NOT clay", "no cars", "no trucks",          *
 * "no modern", "no power", "no paved", "no contemporary",            *
 * "no modern") — the shipped config was the defect.                  *
 * ------------------------------------------------------------------ */

function assertClean(label, positive, forge) {
  assert.deepEqual(
    lintPositivePrompt(positive, { forbiddenTokens: promptForbiddenTokens(forge) }),
    [],
    `${label} composed to:\n${positive}`,
  );
}

test("the SHIPPED environment config composes a positive prompt with zero lint violations", () => {
  const forge = loadForge({ profile: "environment" });
  const positive = buildEnvPositive(
    "a river crossing town of timber and canvas on both banks, seen from the road",
    forge,
  );
  assertClean("environment config", positive, forge);
});

test("the era block reaches the positive prompt — the negatives it replaced must not", () => {
  const forge = loadForge({ profile: "environment" });
  const positive = buildEnvPositive("a river crossing town", forge);
  assert.ok(
    positive.includes(forge.profile.styleGuard.era),
    "styleGuard.era must be composed into the positive prompt",
  );
  assert.equal(forge.profile.styleGuard.negative, undefined, "styleGuard.negative must be gone");
});

test("every SHIPPED brief composes a clean environment positive prompt", () => {
  const forge = loadForge({ profile: "environment" });
  const dir = path.join(FORGE_DIR, "briefs");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0, "no briefs found");
  for (const file of files) {
    const brief = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    assertClean(file, buildEnvPositive(brief.prompt, forge), forge);
  }
});

test("every SHIPPED race x job cell composes a clean character positive prompt", () => {
  const forge = loadForge({ profile: "character" });
  const { raceAxis, jobAxis } = forge.profile.muscleGradient;
  for (const race of raceAxis) {
    for (const job of jobAxis) {
      assertClean(`${race} x ${job}`, buildPrompt({ race, job }, forge), forge);
    }
  }
});

test("every SHIPPED creature clause composes a clean character positive prompt", () => {
  const forge = loadForge({ profile: "character" });
  for (const id of Object.keys(forge.creatures)) {
    if (id.startsWith("_")) continue;
    assertClean(id, buildCreaturePrompt(id, forge), forge);
  }
});

test("the negative CONDITIONING node may still carry the real negative words", () => {
  const forge = loadForge({ profile: "environment" });
  assert.ok(buildEnvNegative(forge).length > 0, "the negative node must not go empty");
  assert.ok(
    negativePrompt(loadForge({ profile: "character" })).length > 0,
    "the character negative node must not go empty",
  );
});

/* --- the wiring: a bad prompt cannot be generated from --------------- */

test("a negation re-inserted into style-laws makes buildPrompt THROW, not queue", () => {
  const forge = loadForge({ profile: "character" });
  const poisoned = {
    ...forge,
    styleLaws: { ...forge.styleLaws, renderAssertion: ["NOT 3D render", "no fur"] },
  };
  assert.throws(
    () => buildPrompt({ race: "human", job: "swordsman" }, poisoned),
    /R1-negation/,
  );
});

test("a forbidden token re-inserted into a brief makes buildEnvPositive THROW, not queue", () => {
  const forge = loadForge({ profile: "environment" });
  assert.throws(
    () => buildEnvPositive("a crossing town with power lines along the road", forge),
    /R2-forbidden-token/,
  );
});

/* ------------------------------------------------------------------ *
 * R3 — unbounded scale words                                          *
 * ------------------------------------------------------------------ */

test("R3 flags a scale word whose sentence carries no bound marker", () => {
  const found = lintPositivePrompt(
    "A sprawling town on a grey river. A queue of carts waits at the ford.",
    { scaleTokens: ["sprawling"], boundMarkers: ["a few dozen", "beyond (the|its)"] },
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, RULE_SCALE_UNBOUNDED);
  assert.equal(found[0].match, "sprawling");
});

test("R3 accepts a scale word whose sentence carries a bound marker", () => {
  const found = lintPositivePrompt(
    "A sprawling town of a few dozen structures on a grey river.",
    { scaleTokens: ["sprawling"], boundMarkers: ["a few dozen"] },
  );
  assert.deepEqual(found, []);
});

test("R3 is sentence-scoped: a bound in the NEXT sentence does not rescue the previous one", () => {
  const found = lintPositivePrompt(
    "An endless shanty quarter. Beyond the town edge only farmland remains.",
    { scaleTokens: ["endless"], boundMarkers: ["beyond (the|its)", "only"] },
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, RULE_SCALE_UNBOUNDED);
});

test("R3 is inert without config vocabulary", () => {
  assert.deepEqual(lintPositivePrompt("a sprawling endless town"), []);
});

/* ------------------------------------------------------------------ *
 * R4 — required assertions                                            *
 * ------------------------------------------------------------------ */

test("R4 flags a missing required assertion", () => {
  const found = lintPositivePrompt("a small town by a river", {
    requiredAssertions: ["beyond the town edge"],
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, RULE_ASSERTION_MISSING);
});

test("R4 accepts the prompt when the required assertion is present", () => {
  const found = lintPositivePrompt(
    "a small town by a river; beyond the town edge only farmland remains",
    { requiredAssertions: ["beyond the town edge"] },
  );
  assert.deepEqual(found, []);
});

/* ------------------------------------------------------------------ *
 * The real briefs — the Millcross extent failure, end to end          *
 * ------------------------------------------------------------------ */

test("the fixed Millcross brief passes the full environment lint", () => {
  const forge = loadForge({ profile: "environment" });
  const brief = JSON.parse(
    fs.readFileSync(path.join(FORGE_DIR, "briefs", "A1-ART-02.json"), "utf8"),
  );
  const composed = buildEnvPositive(brief.prompt, forge, {
    requiredAssertions: brief.mustAssert ?? [],
  });
  assert.equal(typeof composed, "string");
});

test("the OLD Millcross wording (unbounded sprawl, no edge) is rejected", () => {
  const forge = loadForge({ profile: "environment" });
  const old = "A sprawling, wall-less crossing town on both banks of a grey river.";
  assert.throws(() => buildEnvPositive(old, forge), /R3-unbounded-scale/);
});

test("deleting the town-edge assertion from a brief fails the lint, not the render", () => {
  const forge = loadForge({ profile: "environment" });
  const brief = JSON.parse(
    fs.readFileSync(path.join(FORGE_DIR, "briefs", "A1-ART-02.json"), "utf8"),
  );
  // Strip the SENTENCE CARRYING the assertion phrase, not a prose-styled
  // opener: brief wording changes ("the last shelter" → "the last house")
  // must not silently hollow out this fixture.
  const edged = brief.prompt.replace(/[^.]*beyond the town edge[^.]*\.\s*/, "");
  assert.throws(
    () =>
      buildEnvPositive(edged, forge, {
        requiredAssertions: brief.mustAssert ?? [],
      }),
    /R4-assertion-missing/,
  );
});
