// tools/mapforge/tests/generate-world.test.mjs — Task 10b: the whole CLI.
//
// The CLI is run ONCE, into one temp directory, and every assertion below
// reads that one draft root. The plan spawns a fresh 6.5 s generation per test
// (19 of them, ~2 minutes); one build is the same evidence and it is also the
// only way the REPRODUCIBILITY claim below can be made honestly, because the
// second build is then a deliberate, separate act.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shoelaceArea, TIER_DEPTH, DEPTH_EXCEPTIONS } from "../../../scripts/lib/spine.mjs";
import { exactIntersectionArea } from "../../../scripts/lib/geometry.mjs";
import { codeOfFile } from "./_source-scan.mjs";
import { runIdOf, edgeWorkOrder, remedyFor, normaliseComposition, translatePlacement,
         placementInside, liveContinentAncestor, pinForNodeId, parseArgs, clearRun,
         SEED_GRAMMAR, RUN_ENTRIES, loopBudget } from "../generate-world.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = join(ROOT, "tools/mapforge/generate-world.mjs");
const GATE = join(ROOT, "scripts/check_content.mjs");
const SEED = "7c9e4a2f8b1d6e03";
const rj = (p) => JSON.parse(readFileSync(p, "utf8"));

// THE CLI EXITS 1 OVER ITS OWN LOOP BUDGET, AND THAT IS A WALL CLOCK.
// Measured: the same generation is ~6.5 s alone and 19.6 s while the rest of
// this suite runs in parallel — `node --test` runs files concurrently and
// render-sheet.test.mjs additionally spawns the whole suite again. The plan's
// Step 1 asserts `m.timings.total < 8000` inside exactly that, so as written it
// is a coin flip: it is the same defect as G-RASTER-BUDGET, which reds one run
// in three on a developer box. So a LOOP BUDGET exit is accepted here and the
// number is REPORTED; what is asserted is a ceiling four times the fail
// threshold, which a real regression still trips.
function generate(out) {
  try {
    return execFileSync(process.execPath,
      [CLI, "--seed", SEED, "--out", out, "--no-png", "--stage-report"],
      { encoding: "utf8", cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    const stdout = e.stdout ?? "";
    if (!/generate-world: LOOP BUDGET/.test(e.stderr ?? ""))
      throw new Error(`generate-world failed for a reason other than the loop budget:\n${stdout}\n${e.stderr ?? ""}`);
    return stdout;
  }
}

let RUN = null;
function run() {
  if (RUN) return RUN;
  const out = mkdtempSync(join(tmpdir(), "genw-"));
  const log = generate(out);
  const nodesDir = join(out, "content/spine/nodes");
  const nodes = readdirSync(nodesDir).filter((f) => f.endsWith(".json")).map((f) => rj(join(nodesDir, f)));
  RUN = { out, log, nodes, nodesDir,
          manifest: rj(join(out, "manifest.json")),
          world: rj(join(out, "content/world/fabric/world.json")) };
  return RUN;
}
after(() => { if (RUN) rmSync(RUN.out, { recursive: true, force: true }); });

const MANIFEST = rj(join(ROOT, "content/world/manifest.json"));
const LOAD_BUDGET = rj(join(ROOT, "content/spine/load-budget.json"));
const BUDGETS = rj(join(ROOT, "content/world/budgets.json"));
const fabricFiles = ({ out }) => readdirSync(join(out, "content/world/fabric"))
  .filter((f) => f !== "world.json").sort()
  .map((f) => rj(join(out, "content/world/fabric", f)));

test("the CLI builds a COMPLETE content root, not a candidate pile", { timeout: 240000 }, () => {
  const { out, log } = run();
  assert.match(log, /generate-world: (OK|wrote \d+ files)/);
  for (const p of ["content/spine/nodes", "content/spine/edges.json", "content/spine/roots.json",
                   "content/spine/load-budget.json", "content/spine/coverage-budget.json",
                   "content/spine/derived.json",
                   "content/schemas/spine-node.schema.json",
                   "content/world/fabric/world.json", "content/world/manifest.json",
                   "manifest.json", "report.md", "baseline"])
    assert.ok(existsSync(join(out, p)), `draft root is missing ${p}`);
  assert.equal(readdirSync(join(out, "content/world/fabric")).length, 14);
  assert.equal(readdirSync(join(out, "content/world/handles")).length, 13);
});

test("runIdOf is the committed grammar", () => {
  assert.equal(runIdOf({ seed: SEED, version: "3.0.0" }), "7c9e4a2f-3.0.0");
});

// ── the gate on the draft root ────────────────────────────────────────────

function gateOn(out) {
  try {
    return execFileSync(process.execPath, [GATE, "--only=spine", "--content-root", join(out, "content")],
      { encoding: "utf8", cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { return e.stdout ?? ""; }
}

test("THE REAL SPINE GATE on the draft root is CLEAN, and the edges are still carried whole",
  { timeout: 240000 }, () => {
  // The plan asks for "0 failures" AND for every authored edge to survive. Both
  // cannot hold: measured against the live file, all 20 committed edges point
  // at cluster-1 chart nodes and features the 36-file trunk census deletes, so
  // an edges.json filtered to what resolves is EMPTY — the exact outcome the
  // plan spends a paragraph forbidding. The edges are carried whole and every
  // consequence is a NAMED work order; this test is the join between the two.
  const { out, manifest } = run();
  const log = gateOn(out);
  assert.match(log, /36 nodes/);
  assert.match(log, /world-budget: fabric 14 files/);
  const fails = log.split("\n").filter((l) => l.startsWith("FAIL  "));
  const other = fails.filter((l) => !/G-NET|G-CANON-LEG/.test(l));
  // THE FIVE THIN SURVEYED REGIONS ARE A CONTENT SHORTFALL, DECLARED WITH ITS
  // NUMBERS RATHER THAN LOOSENED AWAY. STATE §15 filed them as "Task 11's" and
  // Task 11's gate is what makes them visible: spec §8.4's band is 12-30 points
  // of interest in a SURVEYED region, and five of the forty cannot reach twelve.
  //
  // They are SUPPLY-limited, not budget-limited, and that is why no rule change
  // closes them. Each of the five spent everything its ground could carry —
  // P10's spill loop deals surveyed regions first and repeats until no region
  // can place another instance — so the shortfall is the number of cells on
  // that ground satisfying any type in its continent's kit. c05/r06 is the
  // extreme: ZERO placeable types, already filed in STATE §13 as "a SURVEYED
  // region with zero landform instances". Raising the per-region budget hands
  // it nothing.
  //
  // Three dispositions were weighed. (1) Fix P10's supply — cannot close
  // c05/r06 at all, and re-baselines the instance digest, the ledgers, the
  // handles and the anchors for the other four. (2) Make the floor a WARNING —
  // the rule then cannot fail, and "a gate that cannot fail certifies" is the
  // whole reason this seam exists. (3) RECORD IT.
  //
  // CHANGED BY TASK 13, and this is the part seam 7 did not reach: recording
  // them HERE left the COMMITTED root at five failures the moment the fabric
  // was committed into it, which reds Gate 1 and acceptance criterion 3. So the
  // record moved into content/world/budgets.json's `poi.supplyLimitedSurveyedRegions`,
  // where the gate reads it — and it is a DECLARATION, not disposition (2): an
  // UNdeclared thin region is still a hard failure, and a DECLARED region that
  // is no longer thin is a hard failure too, so a row cannot outlive its cause.
  // The five are still pinned here by region AND count, off the WARN lines, so
  // a sixth thin region still reds this test and so does a fix.
  // SIX thin surveyed regions now. The five supply-limited rows above are
  // Plan C ground shortfalls; c02/r16 is Plan D Task 10's: the pinned basin
  // towns consume the hub/capital quota at fixed seed points and the 24 km /
  // 9 km separations around them pushed this region's second generated
  // village out of the greedy pool. Declared in budgets.json
  // poi.supplyLimitedSurveyedRegions with that reason (same mechanism, same
  // discipline: an undeclared thin region still reds, and a declaration whose
  // cause goes away reds too).
  const warns = log.split("\n").filter((l) => l.startsWith("WARN  "));
  const poi = warns.filter((l) => l.includes("G-POI: region "));
  assert.deepEqual(poi.map((l) => l.replace(/^WARN {2}G-POI: region /, "").replace(/ points of interest.*/, "")),
    ["c05/r06 (surveyed) has 0", "c05/r20 (surveyed) has 10", "c07/r06 (surveyed) has 10",
     "c08/r06 (surveyed) has 9", "c08/r08 (surveyed) has 11"],
    "the set of surveyed regions under G-POI's 12-POI floor moved — that is a change in what the " +
    "world is made of, not a test to re-baseline quietly");
  for (const l of poi)
    assert.match(l, /DECLARED in budgets\.json poi\.supplyLimitedSurveyedRegions: \S/,
      "a thin region is a warning without a stated reason — the declaration has stopped carrying one");
  assert.match(log, /G-POI: 40 surveyed regions \(band 12–30: 5 thin of which 5 declared, 0 over\)/);
  assert.deepEqual(other, [],
    `the draft root must be gate-clean apart from the carried canon:\n${other.join("\n")}`);
  // WAS `assert.ok(fails.length > 0, "if this ever reads zero the edges have
  // stopped being carried")`. The premise under it — that a carried edge
  // ALWAYS leaves a failure behind — died with the freeze pass: the last three
  // survivors were `endpoint n-millcross is not frozen`, and step 4b now
  // applies the committed freeze to the draft, so a clean gate is the expected
  // state and the guard would red on the fix. Worse, it was a PROXY: it read a
  // failure count to police a fact about edges. The fact is checked directly
  // below instead, on the draft's own edges.json, which is what the assertion
  // was named for.
  const draftEdges = JSON.parse(readFileSync(join(out, "content/spine/edges.json"), "utf8"));
  const byKind = {};
  for (const e of draftEdges) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  assert.deepEqual(byKind, { road: 6, leg: 7, sealane: 2 },
    "the authored edges are carried into the draft WHOLE — this is the fact the old " +
    "`fails.length > 0` guard was standing in for, and a filtered-to-what-resolves edges.json " +
    "(the outcome the plan spends a paragraph forbidding) reads as an empty or shrunken set here");
  // SET equality against the work order, not a count: gSpineNet reports a relay
  // edge's via chain twice (once in the generic endpoint walk, once in the
  // relay branch), so the counts differ by construction while the SETS must not.
  const gatePairs = new Set(fails.filter((l) => /G-NET|G-CANON-LEG/.test(l)).map((l) => l
    .replace(/^FAIL {2}spine: G-(NET|CANON-LEG) /, "")
    .replace(/^([a-z0-9-]+): endpoint (node|feature|edge) "([^"]+)".*/, "$1|$2 $3")
    .replace(/^([a-z0-9-]+): endpoint ([a-z0-9-]+) is not frozen$/, "$1|node $2")
    // KEY ON THE TIP COORDINATE, not on "road-end" alone. Collapsing both ends
    // of one road to the same key made a failure MOVING from one endpoint to
    // the other, or a second road-end failure on the same edge, invisible to
    // set equality. The gate line does not name the node, but it does print the
    // tip, and so does the work order.
    .replace(/^([a-z0-9-]+): road end (\[[^\]]*\]).*/, "$1|road-end $2")));
  const orderPairs = new Set(manifest.problems
    .filter((p) => p.startsWith("edge "))
    .map((p) => {
      let m = /^edge ([a-z0-9-]+) \([a-z]+\): endpoint (node|feature|edge) "([^"]+)"/.exec(p);
      if (m) return `${m[1]}|${m[2]} ${m[3]}`;
      m = /^edge ([a-z0-9-]+) \([a-z]+\): canon-leg endpoint ([a-z0-9-]+) is not frozen/.exec(p);
      if (m) return `${m[1]}|node ${m[2]}`;
      m = /^edge ([a-z0-9-]+) \([a-z]+\): road end (\[[^\]]*\])/.exec(p);
      if (m) return `${m[1]}|road-end ${m[2]}`;
      throw new Error(`unrecognised work order line: ${p}`);
    }));
  assert.deepEqual([...gatePairs].sort(), [...orderPairs].sort(),
    "every gate failure must have a work order and every work order a gate failure");

  // THE COUNTS, AS GOLDENS, BECAUSE SET EQUALITY IS SYMMETRIC. The assertion
  // above passes just as happily if a future change makes the gate report a
  // NEW failure and `edgeWorkOrder` report its matching order — which is the
  // likely shape of a regression, since both derive from the same "does this
  // resolve" predicate. A count is the cheapest independent oracle there is.
  //
  //   WAS 91 = 88 G-NET + 3 G-CANON-LEG, measured while content/spine/edges.json
  //   still carried all 20 pre-redraw edges through generation. Plan E Task 6
  //   Steps 6/6b applied the owner rulings to the COMMITTED file: 5 edges
  //   retired (both relays, e-sea-lane, both terrace tracks), the 7 legs and
  //   the 2 sea lanes re-pointed at f-town-* features, e-cindervast-approach
  //   re-sited, the road points translated. So the edges the generator now
  //   carries into the draft are 15 that already resolve, and the 88 G-NET
  //   lines are gone at their source rather than filtered away.
  //
  //   THEN 3, and now ZERO. The three that remained were all G-CANON-LEG
  //   `endpoint n-millcross is not frozen`, on the three legs that start at
  //   Millcross, because the draft unfroze the whole trunk by construction and
  //   G-FROZEN only permits refreezing under a frozen ancestor — so the freeze
  //   had to be re-applied by hand after every redraw. generate-world step 4b
  //   applies content/spine/freeze-reasons.json to the draft instead (the flag
  //   AND an absoluteAnchor composed from the regenerated geometry, continents
  //   included, which is what makes the set ancestor-closed), so all three
  //   resolve at their source. Measured on this run: 0 gate failures, 0 work
  //   orders, and the promoted node bytes are byte-identical to the ten Task 7
  //   froze by hand — the generator derives the same anchors.
  //
  //   ZERO IS NOT A WEAKER ASSERTION HERE. The empty set is pinned in BOTH
  //   directions: `other` above already forbids any non-edge failure, the set
  //   equality below still joins gate failures to work orders one-for-one, and
  //   the carried-whole edge census added above is what proves the subject is
  //   still present to fail. A leg whose endpoint leaves the freeze set, or an
  //   endpoint the redraw deletes, reds this line again.
  //
  // Moving either number is a WORLD CHANGE and needs a reason written beside
  // it, exactly like the ring goldens.
  assert.deepEqual(
    fails.map((l) => l.replace(/^FAIL {2}spine: /, "")).sort(),
    [],
    "the draft root's carried-canon failures moved — with the committed freeze applied to the " +
    "draft there is no legal residue left, so any line here is a real regression",
  );
  // NOT `fails.length - poi.length`, which is what this line used to be. That
  // subtraction LOOKED like it guarded the carried-canon count and did not: a
  // SIXTH thin surveyed region added one to both terms and the difference was
  // still 91. Measured — 15 instances stripped from c05/r15 gave fails 97,
  // poi 6, difference 91, green. It is moot now that the five are warnings, and
  // the filtered assertion below is what the line was always trying to say.
  assert.equal(fails.filter((l) => /G-NET|G-CANON-LEG/.test(l)).length, 0,
    "the draft root's carried-canon failure count moved");
  // The 63 work orders were 60 endpoint + 3 road-end, and the 28-line gap
  // against the gate's 91 was gSpineNet double-reporting each RELAY endpoint.
  // Both relays are retired (ruling 1), so the gap is gone with them and the
  // two sides agreed one-for-one at 3; the freeze pass took both to 0.
  assert.equal(manifest.problems.filter((p) => p.startsWith("edge ")).length, 0,
    "the work-order count moved");
  // The freeze pass reports its OWN dropped freezes as problems (a reason with
  // no node in the draft). None is the expected state; one here means the
  // redraw retired a node freeze-reasons.json still defends, which G-FROZEN
  // would only say after promotion.
  assert.deepEqual(manifest.problems.filter((p) => p.startsWith("freeze:")), [],
    "the redraw dropped a committed freeze");
});

test("lore.reported tracks the world this run BUILT, not the node it replaces", () => {
  // `lore.reported` is the only key in a generated continent's lore that
  // changes a GATE VERDICT: checkSpineComplete (scripts/lib/spine.mjs:941)
  // steps a childless trunk node down from a hard FAIL to a WARN when it is
  // true. Nothing pinned it, and mutating it to `undefined` on every continent
  // left the whole suite green while taking the draft root from 94 to 99
  // failures under --require-complete.
  //
  // ADJUDICATED (seam-6 fix pass): the value is DERIVED, and carrying the
  // committed one would be wrong. Six committed continents carry
  // `reported: true` — "no log claims what stands behind it" — and this world
  // SURVEYS five of them: Coldreach gets 6 surveyed regions, Stonemoor 7,
  // Reedstrand and Driftholt 3 each, Brightfall 1. Carrying the flag would
  // re-assert hearsay about ground the fabric file walks, and Plan E's
  // `surveyOf()` reads lore.reported as its fallback, so the false claim would
  // propagate into the survey model instead of stopping here.
  //
  // THE PIN IS AGAINST THE EMITTED FABRIC, not against the manifest column the
  // emitter happens to read. The two agree today; keying the test on the
  // fabric is what stops them drifting apart silently.
  const { nodes, out } = run();
  const continents = nodes.filter((n) => n.tier === "continent");
  assert.equal(continents.length, 13);
  let reported = 0;
  for (const n of continents) {
    const f = rj(join(out, `content/world/fabric/continent-${n.provenance.generator.fabric.slice(-7, -5)}.json`));
    const surveyed = f.regions.filter((r) => r.survey === "surveyed").length;
    if (surveyed === 0) {
      reported++;
      assert.equal(n.lore.reported, true,
        `${n.id} has no surveyed region in its fabric and must be a reported-world node — ` +
        `without the flag G-SPINE-COMPLETE gives it a hard FAIL under --require-complete`);
    } else {
      assert.equal(n.lore.reported, undefined,
        `${n.id} has ${surveyed} surveyed regions in its fabric, so it is not a mariners' ` +
        `chart entry — carrying the committed flag here would re-assert hearsay about ` +
        `ground this world walks, and Plan E's surveyOf() would inherit the false claim`);
    }
  }
  assert.equal(reported, 4, "c01, c11, c12 and c13 are the wholly-unsurveyed landmasses");
  // Water nodes never carry it: an ocean has no surveyed interior at all, and
  // Plan E's E-C2 gives them their own WATER_TIERS skip instead.
  for (const n of nodes.filter((x) => x.tier === "ocean" || x.tier === "sea"))
    assert.equal(n.lore.reported, undefined);
});

// ── THE CLI FLAG LAYER ─────────────────────────────────────────────────────
// Three mutations survived the whole suite before this block existed, and they
// are one finding: nothing drove the CLI's argument handling.
//   M1  ignore `--seed` entirely            — the suite's SEED is byte-identical
//                                             to manifest.seed, so no assertion
//                                             could ever tell.
//   M2  make `--no-png` set png = true      — the flag was assigned and never read.
//   M3  delete `process.exitCode = 1`       — no test ever drove the loop budget.

test("--seed is HONOURED, not merely accepted", { timeout: 240000 }, () => {
  // The one assertion that can distinguish "reads the flag" from "ignores it":
  // a seed that is NOT content/world/manifest.json's.
  const committed = rj(join(ROOT, "content/world/manifest.json")).seed;
  const other = "0123456789abcdef";
  assert.notEqual(other, committed, "pick a seed the manifest does not already carry");
  const out = mkdtempSync(join(tmpdir(), "genw-seed-"));
  try {
    execFileSync(process.execPath, [CLI, "--seed", other, "--out", out, "--no-png"],
      { encoding: "utf8", cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (!/LOOP BUDGET/.test(e.stderr ?? "")) throw e;
  }
  assert.equal(rj(join(out, "content/world/fabric/world.json")).seed, other);
  assert.equal(rj(join(out, "manifest.json")).seed, other);
  rmSync(out, { recursive: true, force: true });
});

test("--seed refuses anything that is not sixteen lowercase hex", () => {
  // A garbage seed used to exit 0 and write `"seed": "NOT_A_SEED"` into
  // content/world/fabric/world.json, where the fabric layer has no G-SEED to
  // reject it — and the draft root then read 93 failures instead of 91, so
  // "gate-clean apart from the carried canon" was a property of ONE seed that
  // nothing stated.
  const fails = [];
  const fail = (m) => fails.push(m);
  for (const bad of ["NOT_A_SEED", "7C9E4A2F8B1D6E03", "7c9e4a2f8b1d6e0", "7c9e4a2f8b1d6e034", ""])
    parseArgs(["node", "cli", "--seed", bad], { fail });
  assert.equal(fails.length, 5, `expected five refusals, got ${fails.length}: ${fails.join(" | ")}`);
  assert.ok(SEED_GRAMMAR.test("7c9e4a2f8b1d6e03"));
  // …and a good one is taken.
  assert.equal(parseArgs(["node", "cli", "--seed", "7c9e4a2f8b1d6e03"], { fail }).seed,
    "7c9e4a2f8b1d6e03");
});

test("a flag with no value is a refusal, not a silent theft of the next flag", () => {
  // `--seed --out x` used to take "--out" as the seed, fall back to the
  // manifest seed and run 6.5 s into the DEFAULT out dir — losing both flags.
  // `--out` with no value at all threw ERR_INVALID_ARG_TYPE out of
  // resolve(undefined) and printed a stack trace.
  const fails = [];
  const fail = (m) => fails.push(m);
  parseArgs(["node", "cli", "--seed", "--out", "x"], { fail });
  parseArgs(["node", "cli", "--out"], { fail });
  parseArgs(["node", "cli", "--seed"], { fail });
  assert.equal(fails.length, 3, fails.join(" | "));
  for (const m of fails) assert.match(m, /needs a value/);
});

test("--no-png is READ: it reaches the run manifest and refuses a raster it cannot make", () => {
  assert.equal(parseArgs(["node", "cli", "--no-png"]).png, false);
  assert.equal(parseArgs(["node", "cli"]).png, true);
  // The observable half — `writeRun` records the flag, so a run tells you how
  // it was produced and a mutation of the flag cannot hide in a no-op.
  const { manifest } = run();
  assert.equal(manifest.options.rasterise, false,
    "the suite drives the CLI with --no-png; the manifest must say so");
});

test("--out is CLEARED, and a directory holding anything else is refused", () => {
  // writeRun only ever created and overwrote, so a file a previous run wrote
  // and this one does not SURVIVED — and it was invisible to promote step 1,
  // which verifies the sha256 of the files the run manifest lists. Measured: a
  // planted content/spine/nodes/n-ZOMBIE.json survived a full run, the CLI
  // printed OK, and the gate on that root read 99 failures instead of 91.
  const out = mkdtempSync(join(tmpdir(), "genw-clear-"));
  mkdirSync(join(out, "content/spine/nodes"), { recursive: true });
  writeFileSync(join(out, "content/spine/nodes/n-ZOMBIE.json"), "{}");
  writeFileSync(join(out, "report.md"), "stale");
  const cleared = clearRun({ outDir: out });
  assert.deepEqual(cleared.foreign, []);
  assert.deepEqual(cleared.removed.sort(), ["content", "report.md"]);
  assert.equal(existsSync(join(out, "content")), false, "the whole draft content root must go");

  // BOUNDED, not an rm -rf of a user-supplied path: a directory holding
  // anything a mapforge run did not write is a refusal.
  writeFileSync(join(out, "MY-NOTES.txt"), "not yours");
  const refused = clearRun({ outDir: out });
  assert.deepEqual(refused.foreign, ["MY-NOTES.txt"]);
  assert.deepEqual(refused.removed, []);
  assert.equal(existsSync(join(out, "MY-NOTES.txt")), true, "a refusal must not delete anything");
  // An absent directory is a no-op, which is the first-run case.
  assert.deepEqual(clearRun({ outDir: join(out, "nope") }), { removed: [], foreign: [] });
  assert.ok(RUN_ENTRIES.includes("manifest.json") && RUN_ENTRIES.includes("baseline"));
  rmSync(out, { recursive: true, force: true });
});

test("the loop budget is a DECISION, drivable at a breach rather than at this box's speed", () => {
  // `main` used to inline this, which left "delete process.exitCode = 1" as a
  // surviving mutation — no test could drive the CLI over failMs without a
  // machine slow enough to be a flake. RESIDUAL GAP, stated rather than
  // papered over: the one line this does not cover is `main`'s assignment of
  // the exit code itself, asserted from the source below.
  const budgets = rj(join(ROOT, "content/world/budgets.json"));
  const gen = budgets.loop.find((r) => r.stage === "generate");
  const fast = loopBudget({ timings: { total: gen.failMs - 1, sheets: 0 }, budgets });
  assert.deepEqual(fast.over, []);
  assert.equal(fast.lines.length, 2, "one line per budgeted stage, always printed");
  const slow = loopBudget({ timings: { total: gen.failMs + 1, sheets: 0 }, budgets });
  assert.equal(slow.over.length, 1);
  assert.match(slow.over[0], /^generate \d+ ms > fail \d+ ms$/);
  // The boundary is `>`, not `>=`: exactly failMs is inside the budget.
  assert.deepEqual(loopBudget({ timings: { total: gen.failMs, sheets: 0 }, budgets }).over, []);
  const sheetRow = budgets.loop.find((r) => r.stage === "sheets");
  assert.equal(loopBudget({ timings: { total: 0, sheets: sheetRow.failMs + 1 }, budgets })
    .over.length, 1, "the sheets row is budgeted separately — an aggregate hides which stage moved");
  // …and the exit code the breach must produce.
  const src = readFileSync(CLI, "utf8");
  assert.match(src, /if \(over\.length\) \{[\s\S]{0,220}process\.exitCode = 1;/,
    "a loop-budget breach must leave a non-zero exit code");
});


test("the run manifest carries the seed, sea level, ratio and a hash per file", { timeout: 240000 }, () => {
  const { manifest } = run();
  assert.equal(manifest.seed, SEED);
  assert.equal(typeof manifest.seaLevel, "number");
  assert.ok(manifest.seaToLandRatio >= 1.2 && manifest.seaToLandRatio <= 1.8,
    `ratio ${manifest.seaToLandRatio} outside the band`);
  assert.equal(manifest.landKm2 + manifest.waterKm2, 160000);
  assert.ok(Object.keys(manifest.hashes).length > 20);
  for (const h of Object.values(manifest.hashes)) assert.match(h, /^sha256:[0-9a-f]{64}$/);
  const gen = BUDGETS.loop.find((r) => r.stage === "generate");
  // MEASURED (see budgets.json's cpuFailMsWhy): `manifest.timings.total` is a
  // WALL CLOCK sum, and Gate 2 runs this CLI as one of 32 concurrently
  // fanned-out mapforge test files on a 14-core box, several of which spawn
  // their own generation — that's real scheduling contention, not a
  // regression, and it inflated wall time 3.16x-4.28x in the measurement that
  // found this (a `< failMs * 4` ceiling had already been tried here and
  // Gate 2 still broke it at 50,555 ms). `manifest.timings.cpuTotal`
  // (process.cpuUsage() summed per stage, inside the same process) is what a
  // real regression in the generation work still moves and contention does
  // not: the same three runs measured cpuTotal inflation of only 1x/1.13x/
  // 1.19x while wall time moved 1x/3.16x/4.28x, because a process accrues no
  // CPU time while queued for a core. So THIS is the ceiling asserted, and it
  // is a CPU-time budget (gen.cpuFailMs), not the wall-clock one.
  assert.ok(manifest.timings.cpuTotal < gen.cpuFailMs,
    `generation consumed ${manifest.timings.cpuTotal} ms of CPU time against a fail ceiling of ` +
    `${gen.cpuFailMs} ms — CPU time does not inflate under scheduling contention the way wall ` +
    `time does (measured 1.13x-1.19x here vs 3.16x-4.28x for wall time under heavy load), so a ` +
    `breach here means the generation pipeline is doing more real work, not that it queued longer`);
  assert.equal(typeof manifest.timings.total, "number",
    "the wall-clock total is still reported for diagnostics — it is just not what this test gates on");
  assert.ok(Object.keys(manifest.timings).length >= 15,
    "a timing per pass, plus the wall total, the CPU total and the sheets");
});

test("all 13 landmasses sit within +/-3% of their manifest netKm2", { timeout: 240000 }, () => {
  const { world } = run();
  assert.equal(world.continents.length, 13);
  for (const c of world.continents) {
    const want = MANIFEST.landmasses.find((l) => l.id === c.id);
    const got = c.grossLandKm2 - (want.interiorWaterKm2 ?? 0);
    const pct = Math.abs(got - want.netKm2) / want.netKm2 * 100;
    assert.ok(pct <= 3, `${c.id}: ${got} km2 vs manifest ${want.netKm2} (${pct.toFixed(1)}%, tolerance 3%)`);
  }
});

test("the owner histogram identity holds: owned + unowned + lake + sea === 640000", { timeout: 240000 }, () => {
  // FOUR terms, not the plan's three. Regions tile NET land and lakes sit
  // BESIDE it (STATE §5), so `Σ ownerHistogram + unowned + sea` is 6,400 cells
  // short of the frame and the plan's assertion cannot hold on a correct world.
  const { out, world } = run();
  let owned = 0, unowned = 0, lake = 0;
  for (const d of fabricFiles({ out })) {
    owned += Object.values(d.ownerHistogram).reduce((a, b) => a + b, 0);
    unowned += d.cellCensus.unowned;
    lake += d.cellCensus.lake;
  }
  assert.equal(owned + unowned + lake + world.census.seaCells, 640000,
    "the cell partition is not exact — a cell is in two regions or none");
  assert.equal(lake, world.census.lakeCells);
  assert.equal(owned + unowned + lake, world.census.grossLandCells);
  // and `grossLandKm2` per continent is land + lake, never land alone
  for (const d of fabricFiles({ out })) {
    const row = world.continents.find((c) => c.id === d.continent);
    assert.equal(row.landCells, d.cellCensus.land + d.cellCensus.lake,
      `${d.continent}: world.json's landCells must be GROSS (land + lake)`);
  }
});

test("the draft trunk carries generator.fabric provenance on every continent node", { timeout: 240000 }, () => {
  const conts = run().nodes.filter((n) => n.tier === "continent");
  assert.equal(conts.length, 13);
  for (const n of conts) {
    assert.equal(n.provenance.authored, "generated");
    assert.equal(typeof n.provenance.generator.name, "string");
    assert.equal(typeof n.provenance.generator.version, "string");
    assert.match(n.provenance.generator.fabric, /^content\/world\/fabric\/continent-\d\d\.json$/);
  }
  for (const n of run().nodes.filter((x) => x.tier === "ocean" || x.tier === "sea"))
    assert.equal(n.provenance.generator.fabric, "content/world/fabric/world.json");
});

test("the runtime subtree is copied VERBATIM, byte for byte", { timeout: 240000 }, () => {
  const { nodesDir } = run();
  const live = join(ROOT, "content/spine/nodes");
  const all = readdirSync(live).map((f) => rj(join(live, f)));
  const byParent = new Map();
  for (const doc of all) {
    if (!byParent.has(doc.parentId)) byParent.set(doc.parentId, []);
    byParent.get(doc.parentId).push(doc.id);
  }
  const stack = ["n-playroot"], runtime = [];
  while (stack.length) { const id = stack.pop(); runtime.push(id); for (const c of byParent.get(id) ?? []) stack.push(c); }
  assert.ok(runtime.length >= 5, `only ${runtime.length} runtime nodes found`);
  for (const id of runtime)
    assert.equal(readFileSync(join(nodesDir, `${id}.json`), "utf8"),
                 readFileSync(join(live, `${id}.json`), "utf8"), `${id} was not copied verbatim`);
});

test("the draft trunk is EXACTLY 36 node files, with the per-tier tally Plan E commits", { timeout: 240000 }, () => {
  const { nodes } = run();
  const tally = {};
  for (const n of nodes) tally[n.tier] = (tally[n.tier] ?? 0) + 1;
  // 1 world + 13 continent + 3 ocean + 9 sea + 2 alias-anchor regions
  // + 1 town + 1 playroot + 1 playspace + 3 site + 2 fixture = 36.
  // Plan E's content/spine/trunk-census.json is byte-identical to this.
  assert.deepEqual(tally, {
    world: 1, continent: 13, ocean: 3, sea: 9, region: 2, town: 1,
    playroot: 1, playspace: 1, site: 3, fixture: 2,
  }, nodes.map((n) => n.id).sort().join("\n"));
  assert.equal(nodes.length, 36);
});

test("every continent node id comes from manifest.landmasses[].nodeId, and c02 stays n-cluster1",
  { timeout: 240000 }, () => {
  // Slugging the title would mint n-wealdmarch, and promote's reconciliation
  // would then delete n-cluster1 as an n-atlas descendant absent from the
  // draft. That takes twelve parentId references, check_spine_emit.mjs:104,
  // atlas-sheet.mjs:42, spine-coverage.mjs:14 and Plan D's PIN_OFFSET anchor
  // with it — none of which any gate would name.
  const conts = run().nodes.filter((n) => n.tier === "continent");
  assert.deepEqual(conts.map((n) => n.id).sort(), MANIFEST.landmasses.map((l) => l.nodeId).sort());
  const c02 = MANIFEST.landmasses.find((l) => l.id === "c02");
  assert.equal(c02.nodeId, "n-cluster1");
  const node = conts.find((n) => n.id === "n-cluster1");
  assert.ok(node, "the Wealdmarch continent node must still be n-cluster1 after generation");
  assert.equal(node.title, "Wealdmarch");
  assert.ok(!conts.some((n) => n.id === "n-wealdmarch"),
    "a slugged n-wealdmarch appeared — buildTrunk is deriving the id instead of reading nodeId");
  // and every ocean and sea id likewise
  const ids = new Set(run().nodes.map((n) => n.id));
  for (const o of MANIFEST.oceans) assert.ok(ids.has(o.nodeId), `ocean ${o.id} lost its nodeId`);
  for (const s of MANIFEST.seas) assert.ok(ids.has(s.nodeId), `sea ${s.id} lost its nodeId`);
});

test("every authored edge survives into the draft, endpoint shapes unmangled", { timeout: 240000 }, () => {
  // Measured against the live file, ZERO committed edge touches an n-playroot
  // descendant: the canon legs, roads and sea lanes are all between chart nodes
  // and features. A "keep the runtime edges" filter therefore promotes an EMPTY
  // edges.json and G-NET, G-CANON-LEG and Plan E Task 6 Step 6's leg re-fit
  // lose their subject at once. Two of the three endpoint SHAPES are not
  // `{node}` at all — `{feature}` and `{edge, atIndex}` — so a node-only filter
  // cannot even see them.
  //
  // COUNT AUTHORITY: the edge roster is content/spine/trunk-census.json's
  // `edges` block (Plan E, E-C4). This test used to name `e-trunk-chain` as its
  // `{feature}` witness; ruling 1 retired both relays, so a surviving edge of
  // each SHAPE is chosen from the live file rather than hard-coded — the
  // property under test is that generation does not mangle a shape, and that
  // property must keep holding whichever edges the census happens to carry.
  const { out, manifest } = run();
  const live = rj(join(ROOT, "content/spine/edges.json"));
  const draft = rj(join(out, "content/spine/edges.json"));
  const draftIds = new Set(draft.map((e) => e.id));
  for (const e of live) assert.ok(draftIds.has(e.id), `edge ${e.id} (${e.kind}) was dropped by generation`);
  assert.equal(draft.length, live.length, "generation invented or dropped an edge");
  const byId = new Map(draft.map((e) => [e.id, e]));
  const witness = (pred, what) => {
    const e = live.find((x) => pred(x.from) || pred(x.to));
    assert.ok(e, `no committed edge carries a ${what} endpoint — this shape has stopped being covered`);
    return e;
  };
  for (const [pred, what] of [
    [(r) => r && "node" in r, "{node}"],
    [(r) => r && "feature" in r, "{feature}"],
    [(r) => r && "edge" in r, "{edge, atIndex}"],
  ]) {
    const e = witness(pred, what);
    assert.deepEqual(byId.get(e.id).from, e.from, `${e.id}.from was mangled`);
    assert.deepEqual(byId.get(e.id).to, e.to, `${e.id}.to was mangled`);
  }
  // AND THE REDRAW NOW HAS NO UNRESOLVED CONSEQUENCE LEFT TO REPORT. This
  // assertion used to require the ONE surviving work order —
  // `canon-leg endpoint n-millcross is not frozen` — on the grounds that a run
  // naming nothing meant the reporting path had gone dark. Both halves have
  // moved: Step 6 re-pointed the vanished-town endpoints in the committed file,
  // and generate-world step 4b applies the committed freeze to the draft, so
  // the last three orders resolve at their source rather than being reported.
  //
  // "The reporting path is live" is asserted where it can be asserted without
  // requiring a defect to exist: edgeWorkOrder's own unit test below drives all
  // three endpoint shapes plus the frozen rule through it on a fixture. What
  // belongs HERE is the real run's outcome, and the honest one is empty.
  assert.deepEqual(manifest.problems.filter((p) => p.startsWith("edge ")), [],
    `every carried edge resolves in the draft now; a work order here is a real regression. ` +
    `problems: ${JSON.stringify(manifest.problems)}`);
  // The reason it is empty, stated as its own fact rather than inferred: the
  // leg endpoints G-CANON-LEG requires frozen ARE frozen in the draft.
  const draftNodes = readdirSync(join(out, "content/spine/nodes"))
    .map((f) => rj(join(out, "content/spine/nodes", f)));
  const nodeById = new Map(draftNodes.map((n) => [n.id, n]));
  const legEndpoints = [...new Set(draft.filter((e) => e.kind === "leg")
    .flatMap((e) => [e.from?.node, e.to?.node]).filter(Boolean))];
  assert.ok(legEndpoints.length > 0, "no leg carries a {node} endpoint — the frozen rule lost its subject");
  for (const id of legEndpoints)
    assert.equal(nodeById.get(id)?.frozen, true,
      `${id} is a canon-leg endpoint and G-CANON-LEG requires it frozen in the draft`);
});

test("edgeWorkOrder names all three endpoint shapes and the frozen rule", () => {
  const nodes = [{ id: "n-a", frozen: true, features: [{ id: "f-1" }] },
                 { id: "n-b", frozen: false, features: [] }];
  const edges = [
    { id: "e-ok", kind: "road", from: { node: "n-a" }, to: { feature: "f-1" } },
    { id: "e-node", kind: "road", from: { node: "n-gone" }, to: { node: "n-a" } },
    { id: "e-feat", kind: "relay", from: { feature: "f-gone" }, to: { feature: "f-1" },
      via: [{ feature: "f-also-gone" }] },
    { id: "e-edge", kind: "road", from: { edge: "e-gone", atIndex: 0 }, to: { node: "n-a" } },
    { id: "e-leg", kind: "leg", from: { node: "n-a" }, to: { node: "n-b" } },
  ];
  const w = edgeWorkOrder({ edges, nodes });
  // `canon-leg n-b`, not `node n-b`: the two are different breaks with
  // different fixes, and keying them the same is what let one blanket remedy
  // be appended to both. The gate's own line still reads "…is not frozen", so
  // the join in the gate test is unaffected.
  assert.deepEqual(w.map((x) => `${x.edge}:${x.ref}`),
    ["e-node:node n-gone", "e-feat:feature f-gone", "e-feat:feature f-also-gone",
     "e-edge:edge e-gone", "e-leg:canon-leg n-b"]);
  assert.equal(edgeWorkOrder({ edges: [edges[0]], nodes }).length, 0,
    "an edge whose endpoints all resolve must produce no work order");

  // THE REMEDY IS PER-KIND. One hardcoded "re-point it at the owning
  // continent's f-town-<slug> feature" used to be appended to all 63 orders on
  // the real run — right for 25 of them and wrong for 38: a relay sight-line
  // tower is not a town, a sea lane ends at a port, and re-pointing a
  // canon-leg EVADES G-CANON-LEG (which inspects ref.node only) instead of
  // satisfying it. Plan E reads these lines as a task list.
  const byRef = new Map(w.map((x) => [x.ref, x.remedy]));
  assert.match(byRef.get("node n-gone"), /f-town-<slug>/);
  assert.match(byRef.get("feature f-gone"), /port\/landfall/);
  assert.match(byRef.get("edge e-gone"), /via-chain|retire/);
  assert.match(byRef.get("canon-leg n-b"), /EVADES/);
  assert.ok(!/re-point it at/.test(byRef.get("canon-leg n-b")),
    "a canon-leg order must not be told to re-point — that evades the rule it breaks");
  // A relay tower feature gets the relay remedy, not the port one.
  const relay = edgeWorkOrder({
    edges: [{ id: "e-r", kind: "relay", from: { feature: "f-tower-09" }, to: { feature: "f-1" } }],
    nodes });
  assert.match(relay[0].remedy, /sight-line station/);
  assert.ok(!/re-point it at/.test(relay[0].remedy),
    "a relay tower has no f-town-<slug> to be re-pointed at");
  // And a road END is a MOVED endpoint, not a vanished one.
  assert.match(remedyFor({ kind: "road", ref: "road-end n-millcross" }), /re-route the road/);
});

test("the three preserved chart anchors survive generation, re-parented and translated",
  { timeout: 240000 }, () => {
  const { nodes } = run();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // X2: two representsNodeId targets; X4: the town-plan spineId host.
  // scripts/lib/spine.mjs:874-877 pushes a hard G-ALIAS ERROR if either of the
  // first two vanishes; check_content.mjs:1192 (T1) joins on the third.
  for (const id of ["n-thornveil", "n-northern-icefield", "n-millcross"]) {
    const n = byId.get(id);
    assert.ok(n, `${id} was deleted — G-ALIAS or T1 will go red`);
    assert.equal(byId.get(n.parentId).tier, "continent", `${id} must hang off a generated continent`);
  }
  // THE FREEZE TRAVELS. This block used to assert the opposite — `frozen ===
  // false` and no absoluteAnchor on all three — which was true of the carry and
  // was exactly the defect: a regeneration took the trunk from 10 frozen to 1
  // and only a Gate-2 test noticed. The freeze set is now applied from
  // content/spine/freeze-reasons.json (generate-world step 4b), so the draft
  // carries it, and the directional half of G-FROZEN is asserted from the
  // AUTHORITY rather than from a hard-coded list: everything the file names is
  // frozen with a composed anchor, everything it does not name is unfrozen with
  // no anchor.
  const reasons = rj(join(ROOT, "content/spine/freeze-reasons.json")).reasons;
  for (const n of nodes) {
    if (reasons[n.id]) {
      assert.equal(n.frozen, true, `${n.id} has a written freeze reason but came out of the draft unfrozen`);
      assert.ok(Array.isArray(n.absoluteAnchor) && n.absoluteAnchor.length === 2,
        `${n.id} is frozen in the draft without an absoluteAnchor — G-FROZEN fails a freeze with no anchor`);
    } else {
      assert.equal(n.frozen, false, `${n.id} is frozen in the draft with no entry in freeze-reasons.json`);
      assert.equal(n.absoluteAnchor, undefined,
        "G-FROZEN is directional: an unfrozen node carrying absoluteAnchor fails too");
    }
  }
  // Every id the authority names must EXIST in the draft, or the freeze was
  // dropped rather than carried — the half a per-node walk cannot see.
  for (const id of Object.keys(reasons))
    assert.ok(byId.has(id), `freeze-reasons.json defends ${id} and the draft does not carry it`);
  // THE PLAN SAID THEIR GEOMETRY SURVIVES VERBATIM (:6983) AND IT COULD NOT:
  // all three sat in the retired 30 x 38 km cluster-1 frame, and every one of
  // those points was open sea in the generated world.
  //
  // RE-PINNED 2026-08-28 (STATE §28 D1). The rule this used to assert — "each
  // preserved node moves by its lineage continent's own anchor delta" — was
  // measured wrong: it moved n-thornveil and n-northern-icefield by
  // [60.75, 133.75] while Step 6e moved the town host by PIN_OFFSET
  // [81, 129], leaving both regions 20.80 km from their own pins. And the
  // assertion could not see it, because the live tree IS the promoted tree:
  // `before` was the already-translated node, host anchor minus ancestor
  // anchor was [0, 0], and the equality compared a placement with itself.
  //
  // The rule now, for every preserved node: its COMPOSED WORLD ANCHOR IS ITS
  // PIN'S `at`, derived by inverting the parent composition. That is what is
  // asserted here — the draft placement against content/world/civil/
  // pinned-roster.json, two documents the generator does not reconcile
  // anywhere else — plus the containment G-CONTAIN checks. The translation
  // equality is kept for the shape claim (the placement moves rigidly, the
  // authored geometry is not redrawn) and is honestly noted as unarmed while
  // the run is idempotent: it can only speak on a tree whose preserved nodes
  // are NOT already on their pins. G-PIN-ANCHOR (scripts/check_content.mjs)
  // is the armed reader of this rule, proven red-then-green on the two
  // nodes above.
  const live = readdirSync(join(ROOT, "content/spine/nodes")).map((f) => rj(join(ROOT, "content/spine/nodes", f)));
  const liveById = new Map(live.map((d) => [d.id, d]));
  const roster = rj(join(ROOT, "content/world/civil/pinned-roster.json"));
  for (const id of ["n-thornveil", "n-northern-icefield", "n-millcross"]) {
    const before = liveById.get(id), afterNode = byId.get(id);
    const ancestor = liveContinentAncestor({ id, liveById });
    assert.equal(ancestor.id, "n-cluster1");
    const host = byId.get(afterNode.parentId);
    const pin = pinForNodeId({ nodeId: id, rows: roster.rows });
    assert.ok(pin, `${id} names no single civil pin — it cannot be re-placed`);
    // The whole host chain is km-per-1, so the composed root anchor IS the
    // placement anchor. Asserted, not assumed: a unit-changing frame here
    // would make the comparison below compare two different frames.
    assert.equal(host.interior.perParentUnit, 1);
    assert.equal(host.parentId, "n-atlas");
    assert.deepEqual(afterNode.placement.anchor, pin.at,
      `${id}: the draft anchor is not ${pin.id}'s at — a preserved node is placed on its pin, not near it`);
    const dx = pin.at[0] - before.placement.anchor[0];
    const dy = pin.at[1] - before.placement.anchor[1];
    assert.deepEqual(afterNode.placement,
      translatePlacement({ placement: before.placement, dx, dy }),
      `${id}: the draft placement is not its committed placement moved rigidly onto ${pin.id}`);
    assert.ok(placementInside({ placement: afterNode.placement, ring: host.placement.points }),
      `${id} is not inside ${host.id} after re-placement — G-CONTAIN would red it`);
  }
});

test("the water trunk closes the frame budget: 3 oceans, 9 nested seas, and no ocean encloses a landmass",
  { timeout: 240000 }, () => {
  const { nodes } = run();
  const oceans = nodes.filter((n) => n.tier === "ocean");
  const seas = nodes.filter((n) => n.tier === "sea");
  assert.equal(oceans.length, 3);
  assert.equal(seas.length, 9);
  const area = (n) => shoelaceArea({ points: n.placement.points });
  const total = oceans.reduce((a, n) => a + area(n), 0);
  const pct = Math.abs(total - MANIFEST.budget.oceanPolygonKm2) / MANIFEST.budget.oceanPolygonKm2 * 100;
  assert.ok(pct <= 3,
    `ocean polygons total ${total.toFixed(1)} km2 vs budget ${MANIFEST.budget.oceanPolygonKm2} (${pct.toFixed(1)}%)`);
  // G-CONTAIN: every sea ring is a strict subset of its parent ocean's ring.
  // Proved by the exact clipper, not by bbox.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const s of seas) {
    const row = MANIFEST.seas.find((x) => x.nodeId === s.id);
    assert.ok(row, `sea node ${s.id} is not in the manifest`);
    const ocean = byId.get(s.parentId);
    assert.equal(ocean.tier, "ocean");
    assert.equal(ocean.id, MANIFEST.oceans.find((o) => o.id === row.ocean).nodeId);
    const inter = exactIntersectionArea({ a: s.placement, b: ocean.placement });
    assert.ok(Math.abs(inter - area(s)) < 0.5,
      `${s.id} is not contained in ${ocean.id}: intersection ${inter.toFixed(2)} vs own ${area(s).toFixed(2)}`);
  }
  // n-westsea is DEMOTED to the sea tier — the first real use of it.
  assert.equal(byId.get("n-westsea").tier, "sea");
  // No ocean polygon may contain a landmass: a spine placement has no holes, so
  // an ocean that wrapped one would swallow it whole. Measured without the
  // corridors: Galereach contained Wealdmarch and Reedstrand, 18,300 km².
  for (const o of oceans)
    for (const c of nodes.filter((n) => n.tier === "continent")) {
      const inter = exactIntersectionArea({ a: o.placement, b: c.placement });
      assert.ok(inter < 0.005 * Math.min(area(o), area(c)),
        `G-OVERLAP ${o.id} ∩ ${c.id}: ${inter.toFixed(2)} km² — the ocean encloses the landmass`);
    }
});

test("the frame residual equals the committed interstitial budget", { timeout: 240000 }, () => {
  const { nodes, manifest } = run();
  const area = (n) => shoelaceArea({ points: n.placement.points });
  const land = nodes.filter((n) => n.tier === "continent").reduce((a, n) => a + area(n), 0);
  const ocean = nodes.filter((n) => n.tier === "ocean").reduce((a, n) => a + area(n), 0);
  const residual = 160000 - land - ocean;   // seas are SUBSETS, never added again
  const want = MANIFEST.budget.interstitialKm2;
  assert.ok(Math.abs(residual - want) / want <= 0.25,
    `interstitial ${residual.toFixed(1)} km2 vs budget ${want} — without the ocean polygons this is ` +
    `~94,400 and G-ATLAS-ROLLUP cannot hold`);
  // The 2.00% interstitial must stay clear of check_content.mjs:2161's 0.5%
  // threshold in BOTH directions.
  assert.ok(residual / 160000 > 0.005, "an interstitial at or below 0.5% is FORBIDDEN to be declared");
  // and the CELL census agrees with the polygons: the water no ocean claimed IS
  // the interstitial, to the cell.
  // ±1 km²: the pinned-water harbour notch adds a couple of sea cells
  // (Plan D root-cause ruling); the budget stays 3,200 within that hair.
  assert.ok(Math.abs(manifest.interstitialKm2 - want) <= 1,
    `interstitial ${manifest.interstitialKm2} vs budget ${want}`);
  assert.ok(manifest.corridors.length > 0 && manifest.corridors.length < 13,
    `${manifest.corridors.length} corridors — all thirteen means the loop is cutting blind`);
});

test("every settlement gets an f-town-<slug> point feature on its continent node", { timeout: 240000 }, () => {
  const { out, nodes } = run();
  const conts = nodes.filter((n) => n.tier === "continent");
  const settlements = fabricFiles({ out }).reduce((a, d) => a + d.settlements.length, 0);
  assert.equal(settlements, MANIFEST.quotas.settlements.total, "the settlement count matches the manifest quota");
  const feats = conts.flatMap((n) => n.features);
  assert.equal(feats.length, 47,
    "trunk features ARE the network — gSpineNet resolves road and leg edge endpoints against node.features");
  for (const f of feats) {
    assert.match(f.id, /^f-town-[a-z0-9-]+$/);
    assert.equal(f.kind, "point");
    assert.equal(f.type, null, "a settlement is not a landform");
    assert.equal(f.at.length, 2);
    // `attrs` is additionalProperties:false with a CLOSED key set, so the
    // plan's `{ rank, region }` is not a legal attrs object.
    assert.deepEqual(Object.keys(f.attrs).sort(), ["name", "role", "town"]);
  }
  assert.equal(new Set(feats.map((f) => f.id)).size, 47, "feature ids must be unique");
  // NOT ONE OF THEM IS f-town-null. The plan's buildTrunk writes
  // `slugOf(s.title)` and every generated title is null in Plan C.
  assert.equal(feats.filter((f) => f.id === "f-town-null").length, 0);
});

test("every fabric file carries one pinReceipt per committed pinned record — G-PIN-SAT ARMED", { timeout: 240000 }, () => {
  // Plan D Task 10 UPGRADED this tripwire: it used to pin the ABSENCE of
  // receipts (empty in Plan C); now the generator writes them, and the count
  // below is what ARMS gPinSat in scripts/lib/resolve.mjs. A fabric file with
  // FEWER receipts than its continent's committed pinned records would flip
  // the gate back to failing on "requires.receipt = present but fabric has
  // none" — which is correct behaviour for an under-filled receipt set, and
  // this test names it here first.
  const { out } = run();
  const roster = JSON.parse(readFileSync(join(ROOT, "content/world/civil/pinned-roster.json"), "utf8"));
  const wantByContinent = new Map();
  for (const row of roster.rows) {
    const c = row.requires?.continent ?? row.continent;
    wantByContinent.set(c, (wantByContinent.get(c) ?? 0) + 1);
  }
  const MEASURED_KEYS = ["biome", "depthM", "elevationM", "freshWaterWithinKm",
    "landform", "landformNearDistanceKm", "landformNearHandle", "landformNearId",
    "nearestLakeKm", "nearestRiverKm", "nearestSeaKm",
    "shelterFetchKm", "slope", "waterKind"];
  let verts = 0, total = 0;
  for (const doc of fabricFiles({ out })) {
    assert.ok(Array.isArray(doc.pinReceipts), `${doc.continent} has no pinReceipts array`);
    assert.equal(doc.pinReceipts.length, wantByContinent.get(doc.continent) ?? 0,
      `${doc.continent} carries ${doc.pinReceipts.length} receipts against ` +
      `${wantByContinent.get(doc.continent) ?? 0} committed pinned records`);
    for (const r of doc.pinReceipts) {
      assert.deepEqual(Object.keys(r.measured).sort(), MEASURED_KEYS,
        `${r.id} receipt is missing measured fields`);
      assert.equal(r.continent, doc.continent);
      total++;
    }
    assert.ok(Array.isArray(doc.outerRing) && doc.outerRing.length >= 3,
      `${doc.continent} has no outerRing — basin-sheet.mjs dereferences it unconditionally`);
    assert.ok(Array.isArray(doc.outerHoles));
    verts += doc.outerRing.length + doc.outerHoles.reduce((a, r) => a + r.length, 0);
  }
  assert.equal(total, roster.rows.length,
    "the world's receipts and its committed pinned records have diverged");
  // THE COAST IS NOT FRACTALISED, PINNED BY ITS VERTEX COUNT rather than by
  // reading the flag back. `FRACTAL_COAST = true` takes this to 18,030 — 7.5x —
  // for +211 ms of a 4,000 ms budget and +237,691 bytes, and it takes the
  // largest fabric file from 81.6% to 93.1% of its committed 262,144 B cap,
  // which is the headroom Plan D's pinReceipts have to fit in. What it buys is
  // detail BELOW the data's own resolution: 0.5 km cells, 0.25 km amplitude.
  // The venue is Plan E's redraw ink.
  // 2,413 -> 2,461: the pinned-water coves (Plan D root-cause ruling) grew
  // four coastlines where drowned coves were carved beside port pins.
  assert.equal(verts, 2455,
    "the fabric coast contour moved — if FRACTAL_COAST was turned on, re-read the note above");
});

test("regions carry rings AND holes, and every region's levelBand is banded", { timeout: 240000 }, () => {
  const { out } = run();
  let regions = 0, multi = 0, holed = 0;
  for (const doc of fabricFiles({ out }))
    for (const r of doc.regions) {
      regions++;
      assert.ok(Array.isArray(r.rings) && r.rings.length >= 1, `${r.id} has no rings`);
      assert.ok(Array.isArray(r.holes), `${r.id} has no holes array`);
      assert.ok(Array.isArray(r.levelBand) && r.levelBand.length === 2, `${r.id} is unbanded`);
      assert.equal(r.terrainKind === null, r.survey === "reported");
      assert.equal(r.provenance === null, r.survey === "surveyed");
      for (const ring of [...r.rings, ...r.holes])
        assert.ok(ring.length <= 200, `${r.id} ring has ${ring.length} vertices > 200`);
      if (r.rings.length > 1) multi++;
      if (r.holes.length > 0) holed++;
    }
  assert.equal(regions, 160);
  // 18 -> 19 with the seam-6 pinch split: c01/r10 pinched twice through one
  // lattice corner and was emitted as ONE non-simple ring. See
  // tools/mapforge/tests/partition.test.mjs for the full reason.
  assert.equal(multi, 19, "19 regions have a boundary of more than one ring");
  // 3 -> 6, same event as multi 18 -> 19: c02/r13, c02/r22 and c05/r19 each
  // carried a one-cell notch folded into their outer ring, which the split now
  // declares as the hole it is.
  assert.equal(holed, 6);
});

test("--stage-report prints per-stage budgets from budgets.json, not a constant", { timeout: 240000 }, () => {
  const { log } = run();
  const gen = BUDGETS.loop.find((r) => r.stage === "generate");
  assert.match(log, new RegExp(`stage: generate TOTAL \\d+ ms \\(budget ${gen.budgetMs}, fail ${gen.failMs}\\)`));
  const sh = BUDGETS.loop.find((r) => r.stage === "sheets");
  assert.match(log, new RegExp(`stage: sheets \\d+ ms \\(budget ${sh.budgetMs}, fail ${sh.failMs}\\)`));
});

test("--stage-report prints one line per pass with a millisecond figure", { timeout: 240000 }, () => {
  const { log } = run();
  for (const p of ["P1", "P3", "P6", "P9", "P10", "P11", "P14", "P14w"])
    assert.match(log, new RegExp(`stage: ${p} \\S+ \\d+ ms`), `no stage line for ${p}`);
});

test("SYNTHETIC_LOAD_BUDGET, PRE_WORLD_ATLAS_CHILDREN and PRE_WORLD_SEALANE_ID are gone", () => {
  // COMMENTS STRIPPED, by the repo's single stripper. TWO of the three names —
  // PRE_WORLD_ATLAS_CHILDREN and PRE_WORLD_SEALANE_ID — are discussed at length
  // in generate-world.mjs's own header, so a raw substring scan reds on the
  // PROSE that explains why they are gone, which is the exact defect seam 1
  // fixed for the two determinism scans. SYNTHETIC_LOAD_BUDGET is NOT named
  // there: the header says "no synthetic budget" in words and never spells the
  // symbol. Measured 2026-08-23, `grep -c SYNTHETIC_LOAD_BUDGET
  // tools/mapforge/generate-world.mjs` -> 0. The assertion below has always
  // been right about the one it checks; only the sentence was wrong, and it is
  // the sentence STATE §5 quoted.
  const src = codeOfFile(CLI);
  for (const bad of ["SYNTHETIC_LOAD_BUDGET", "PRE_WORLD_ATLAS_CHILDREN", "PRE_WORLD_SEALANE_ID"])
    assert.ok(!src.includes(bad), `${bad} survived into generate-world.mjs`);
  // and the stripper is not silently returning nothing
  assert.ok(src.includes("export function writeRun"), "the comment stripper ate the source");
  assert.ok(readFileSync(CLI, "utf8").includes("PRE_WORLD_ATLAS_CHILDREN"),
    "the header no longer explains what the three hardcodes were");
});

test("the draft root obeys the committed byte and vertex budgets", { timeout: 240000 }, () => {
  const { out, nodes } = run();
  const fam = BUDGETS.fabric;
  const dir = join(out, "content/world/fabric");
  let total = 0;
  const names = readdirSync(dir);
  for (const f of names) {
    const b = statSync(join(dir, f)).size;
    total += b;
    assert.ok(b <= fam.maxBytesPerFile, `${f} is ${b} bytes > ${fam.maxBytesPerFile}`);
  }
  assert.ok(names.length <= fam.maxFiles);
  assert.ok(total <= fam.maxBytesTotal, `fabric total ${total} > ${fam.maxBytesTotal}`);
  // G-VERTEX-BUDGET's EFFECTIVE cap is min(maxRingPoints, tier), and the
  // committed maxRingPoints is the tighter term on every tier.
  for (const n of nodes) {
    if (n.placement.shape !== "polygon") continue;
    assert.ok(n.placement.points.length <= LOAD_BUDGET.maxRingPoints,
      `${n.id} ring has ${n.placement.points.length} vertices > ${LOAD_BUDGET.maxRingPoints}`);
  }
});

test("the draft sheet plumbing writes and hashes whatever the registry gives it", { timeout: 240000 }, async () => {
  // This test used to pin the ABSENCE of the `fabric` and `overlay` entries so
  // that Task 13 registering them would go red and force the assertion to be
  // upgraded to the real files. Task 13 registered them; this is the upgrade.
  // The draft folder now carries both DRAWINGS beside the data, which is what
  // makes "two seeds sit side by side, diffable in place" true of a run rather
  // than of a plan sentence.
  const { SHEETS } = await import("../render-sheet.mjs");
  for (const id of ["fabric", "overlay"]) assert.ok(SHEETS[id], `SHEETS lost its "${id}" entry`);
  const { out, manifest } = run();
  for (const id of ["fabric", "overlay"]) {
    const p = join(out, `sheets/${id}.svg`);
    const svg = readFileSync(p, "utf8");
    assert.match(svg, /^<svg /, `sheets/${id}.svg is not an svg`);
    assert.match(svg, /<\/svg>\s*$/);
    assert.match(manifest.hashes[`sheets/${id}.svg`], /^sha256:[0-9a-f]{64}$/,
      `sheets/${id}.svg is written but not hashed — promote-world step 1 cannot verify it`);
  }
  // The DRAFT's sheets are drawn from the DRAFT, not from the live tree: the
  // overlay's baseline comes from the run's own baseline/ copy, so a draft
  // sheet is a picture of that run and diffing two runs is meaningful.
  assert.ok(readFileSync(join(out, "sheets/fabric.svg"), "utf8").includes("c13"),
    "the draft fabric sheet does not draw the run's own thirteenth landmass");
  assert.equal(typeof manifest.timings.sheets, "number");
  assert.ok(manifest.timings.sheets > 0, "the sheets stage took no time — nothing was built");
  // …and the plumbing itself is exercised directly, so it is not dead code.
  const { writeRun } = await import("../generate-world.mjs");
  const tmp = mkdtempSync(join(tmpdir(), "genw-sheet-"));
  try {
    const stub = { runManifest: { seed: SEED, version: "0", seaLevel: 0, rank: 0, landKm2: 1,
                     waterKm2: 1, seaToLandRatio: 1, corridors: [], interstitialKm2: 0, plateArea: [] },
                   fabric: [], handles: [], world: { continents: [] }, trunk: [], edges: [],
                   problems: [], substitutions: [], coverage: { placed: 0, total: 0 }, timings: {} };
    writeRun({ run: stub, outDir: tmp, repoRoot: ROOT,
      sheets: [{ id: "probe", build: () => ({ svg: "<svg/>", problems: ["a stub problem"] }) }] });
    assert.equal(readFileSync(join(tmp, "sheets/probe.svg"), "utf8"), "<svg/>");
    const m = rj(join(tmp, "manifest.json"));
    assert.match(m.hashes["sheets/probe.svg"], /^sha256:[0-9a-f]{64}$/);
    assert.ok(m.problems.includes("sheet probe: a stub problem"));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("DEPTH_EXCEPTIONS gained continent>town, and n-millcross is why", { timeout: 240000 }, () => {
  assert.equal(TIER_DEPTH.town - TIER_DEPTH.continent, 2, "the exception exists to bridge a two-tier skip");
  assert.ok(DEPTH_EXCEPTIONS.has("continent>town"));
  const { nodes } = run();
  const millcross = nodes.find((n) => n.id === "n-millcross");
  assert.equal(millcross.tier, "town");
  assert.equal(nodes.find((n) => n.id === millcross.parentId).tier, "continent");
});

test("normaliseComposition sums to exactly 100 and drops what rounds to nothing", () => {
  // G-COMP-SUM is 100 ± 0.5; the arithmetic is exact in TENTHS and only the
  // final division re-introduces float dust, so 0.05 is two orders inside the
  // gate and still catches a term that actually went missing.
  const near100 = (o) => Math.abs(Object.values(o).reduce((a, b) => a + b, 0) - 100) < 0.05;
  const out = normaliseComposition({ meadow: 61.234, forest: 20.06, rock: 18.7, dust: 0.006 });
  assert.ok(near100(out), JSON.stringify(out));
  assert.ok(!("dust" in out), "a share that rounds to zero is dropped, never written as 0");
  assert.equal(normaliseComposition({}).ocean, 100);
  assert.ok(near100(normaliseComposition({ a: 1, b: 1, c: 1 })));
  assert.ok(near100(normaliseComposition({ a: 99.96, b: 0.04 })));
  for (const v of Object.values(normaliseComposition({ a: 1, b: 1, c: 1 })))
    assert.ok(v > 0, "G-COMP-SUM refuses a zero or negative share");
});

test("every generated composition sums to 100 and n-atlas is the rollup of its children",
  { timeout: 240000 }, () => {
  const { nodes } = run();
  for (const n of nodes) {
    const sum = Object.values(n.composition).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 0.5, `G-COMP-SUM: ${n.id} composition sums to ${sum}`);
    for (const [b, v] of Object.entries(n.composition))
      assert.ok(v > 0, `G-COMP-SUM: ${n.id}.${b} = ${v} — values must be > 0`);
  }
  const atlas = nodes.find((n) => n.id === "n-atlas");
  const area = (n) => shoelaceArea({ points: n.placement.points });
  const A = 160000;
  const derived = {};
  let claimed = 0;
  for (const c of nodes.filter((n) => n.parentId === "n-atlas")) {
    const share = area(c) / A;
    claimed += share;
    for (const [b, v] of Object.entries(c.composition)) derived[b] = (derived[b] ?? 0) + share * v;
  }
  for (const [b, v] of Object.entries(atlas.interstitial)) derived[b] = (derived[b] ?? 0) + (1 - claimed) * v;
  for (const b of new Set([...Object.keys(atlas.composition), ...Object.keys(derived)]))
    assert.ok(Math.abs((atlas.composition[b] ?? 0) - (derived[b] ?? 0)) <= 2,
      `G-ATLAS-ROLLUP: ${b} rolls up to ${(derived[b] ?? 0).toFixed(2)} vs committed ${atlas.composition[b] ?? 0}`);
  // The plan's invented {ocean, rock, ice} triple would fail exactly this.
  assert.ok(Object.keys(atlas.composition).length > 3,
    "n-atlas's composition is the measured rollup, not a three-key stand-in");
});

test("REPRODUCIBLE: a second run of the CLI writes byte-identical content", { timeout: 480000 }, () => {
  const first = run();
  const out = mkdtempSync(join(tmpdir(), "genw-repro-"));
  try {
    generate(out);
    const b = rj(join(out, "manifest.json"));
    // The hash map covers every written file, so comparing it compares the
    // whole content root — and `timings` is deliberately NOT compared.
    assert.deepEqual(b.hashes, first.manifest.hashes);
    assert.deepEqual(b.problems, first.manifest.problems);
    assert.equal(b.seaToLandRatio, first.manifest.seaToLandRatio);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
