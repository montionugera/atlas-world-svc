import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { TRUNK_NODES } from "./helpers/census.mjs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpine, TIER_DEPTH, buildTree } from "../lib/spine.mjs";
// Plan D Task 11: the sheet-subject diagnoses are pinned from resolveWorld —
// the gate no longer resolves the spine for geography.
import { resolveWorld } from "../lib/places.mjs";
// Plan B Task 4: the ONE producer of content/spine/derived.json's bytes. The
// P3 fixture builder below uses it so its roots match `--write` byte for byte.
import { derivedSidecar } from "../check_spine_emit.mjs";
// Plan A Task 13: the gate, imported rather than spawned. Safe only because
// check_content.mjs now ends in an `import.meta.url` entry guard — before it
// did, this import ran the whole gate and called process.exit(), and `node
// --test` reported that as "tests 1 / pass 1 / fail 0", exit 0. A green run
// of one test out of 87. The last test in this file pins the guard's source.
import { runSpineGateInProcess, gSpinePinAnchor } from "../check_content.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");
const FIXTURES = join(ROOT, "scripts/tests/fixtures/spine");
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "content/schemas/spine-node.schema.json"), "utf8"));

// Build a disposable content root from a committed fixture's spine/ plus the
// REAL schema (the schema under test is the shipped one, never a copy that
// can drift).
export function contentRootFor(fixture) {
  const dir = mkdtempSync(join(tmpdir(), "spine-gate-"));
  mkdirSync(join(dir, "schemas"), { recursive: true });
  cpSync(join(ROOT, "content/schemas/spine-node.schema.json"), join(dir, "schemas/spine-node.schema.json"));
  cpSync(join(FIXTURES, fixture, "spine"), join(dir, "spine"), { recursive: true });
  return dir;
}

// Plan A Task 13: in-process, not spawned. ~60 spawns at ~0.4 s of Node
// startup + ajv compile each was 93.3 s of a 108 s content-gate suite.
// Return-property names are UNCHANGED (`code`/`stdout`) — ~50 tests across the
// four helpers destructure them, and renaming would have made this diff touch
// assertion lines, which is precisely what a harness change must not do.
export function runGate(contentRoot) {
  const r = runSpineGateInProcess({ argv: ["--content-root", contentRoot, "--only=spine"] });
  return { code: r.code, stdout: r.out };
}

// ── schema discipline (the town-plan.test.mjs:105-118 pin, applied here) ───
test("spine-node schema declares no minimum/maximum anywhere — the G-* gates own every floor", () => {
  const found = [];
  (function walk(node, path) {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
    for (const [k, v] of Object.entries(node)) {
      if (k === "minimum" || k === "maximum" || k === "exclusiveMinimum" || k === "exclusiveMaximum")
        found.push(`${path}.${k}`);
      walk(v, `${path}.${k}`);
    }
  })(SCHEMA, "$");
  assert.deepEqual(found, [], `numeric bounds belong in the gate, not the schema: ${found.join(", ")}`);
});

test("spine-node schema is draft-07 with an $id", () => {
  assert.equal(SCHEMA.$schema, "http://json-schema.org/draft-07/schema#");
  assert.equal(typeof SCHEMA.$id, "string");
});

// ── the committed table parses and joins ───────────────────────────────────
// Task 1.3 transcribed the 12 cluster-1 regions (10 zones + n-saltmire +
// n-eastern-hills, HC-3: cluster 1 has 12 children, not 10), growing the
// table from 4 to 16 nodes. Task 1.4 transcribed the 6 towns + the
// expedition camp (tier town, depth 3, under their region parents), growing
// the table from 16 to 23 nodes. Task 4.3 (F-041 P4) authored the runtime
// subtree — n-frontier-shelf + 3 sites + 2 fixtures — growing the table from
// 23 to 29 nodes. F-043 ("the wider world", commit 415a765) panel-promoted
// 15 world-scale spine nodes from candidates/ into nodes/ — 2 more
// continents (n-coldreach, n-stonemoor) each with 3 regions, 3 archipelago
// continents with no regions yet (n-brightfall, n-driftholt, n-reedstrand),
// 1 ice cap (n-rimewall-cap, tier continent), and 3 oceans (n-galereach,
// n-keelbreak, n-tarnmark) — growing the table from 29 to 44 nodes. Ids come
// back sorted (loadSpine reads the directory sorted), so the 15 new n-* ids
// interleave with the existing 29.
// COUNT/ROSTER AUTHORITY: content/spine/trunk-census.json (Plan E, E-C4).
// The 44 ids that used to be typed out here were re-typed on every promotion,
// and re-typing 36 of them would just move the chore. What loadSpine is
// actually on the hook for is reading EVERY node file and dropping none, so
// that is what is asserted: its id list against the directory it reads, and
// the directory against the census. trunk-census.test.mjs pins the per-tier
// composition, which is the half a directory listing cannot see.
test("the committed table loads clean: every node file, 2 roots, depths legal, no load errors", () => {
  const spine = loadSpine({ contentRoot: join(ROOT, "content") });
  assert.equal(spine.present, true);
  assert.deepEqual(spine.errors, []);
  const stems = readdirSync(join(ROOT, "content/spine/nodes"))
    .filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
  assert.equal(stems.length, TRUNK_NODES,
    `content/spine/nodes holds ${stems.length}; content/spine/trunk-census.json says ${TRUNK_NODES}`);
  assert.deepEqual(spine.nodes.map((n) => n.id).sort(), stems,
    "loadSpine dropped or renamed a committed node");
  assert.deepEqual(spine.roots, ["n-atlas", "n-playroot"]);
  // Task 1.10: these were Phase-0 placeholders (48 / 4) until G-LOAD-BUDGET
  // and G-COMP-REPORT existed to enforce them. F-043 bumped the load budget
  // to {48, 393216} (Systems panel blocking item #1) to make room for the 15
  // promoted nodes; the coverage budget's maxUnchecked stayed at 2 — F-043
  // also hand-edited n-atlas's interstitialUnsurveyed to false (its
  // composition is now real: {ocean:100}), which flips n-atlas from
  // UNCHECKED to CHECKED, so the real UNCHECKED count today is 0.
  // Plan A Task 4 replaced the single node-count term with three: maxNodes 96
  // is loader sanity only, maxChildrenPerParent 24 is the real governor (the
  // sibling-overlap check is quadratic — 24 children is 276 pairs), and
  // maxRingPoints 160 is where the per-pair cost curve flattens. maxBytes
  // doubles to 786432 because hoisting `derived` lands the trunk near 150 KB.
  assert.deepEqual(spine.budgets.load, { maxNodes: 96, maxChildrenPerParent: 24, maxRingPoints: 160, maxBytes: 786432 });
  assert.deepEqual(spine.budgets.coverage, { maxUnchecked: 2 });
  for (const n of spine.nodes) assert.equal(typeof TIER_DEPTH[n.tier], "number", n.id);
});

import { mkdtempSync as mkdtemp2 } from "node:fs";

test("soft-skip: a content root with NO spine/ (and no schema) exits 0 — skip happens BEFORE schema compile", () => {
  const dir = mkdtemp2(join(tmpdir2(), "spine-skip-"));
  const { code, stdout } = runGate(dir);
  assert.equal(code, 0, stdout);
  assert.match(stdout, /0 failures/);
});
// helper import for the test above
import { tmpdir as tmpdir2 } from "node:os";

test("HC-2 G-ID red: duplicate id across two files", () => {
  const { code, stdout } = runGate(contentRootFor("g-id-duplicate-id"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-ID: duplicate id "n-atlas"/);
});

test("HC-2 G-PARENT red: a depth-0 node not listed in roots.json", () => {
  const { code, stdout } = runGate(contentRootFor("g-parent-root-not-listed"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-PARENT: root n-rogue is not listed in roots\.json/);
});

test("HC-2 G-TREE red: a two-node parent cycle", () => {
  const { code, stdout } = runGate(contentRootFor("g-tree-cycle"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-TREE: cycle detected through n-loop-/);
  assert.match(stdout, /unreachable from any root/);
});

// The fixture was `continent > town` until Plan C Task 10. That pair is now a
// DEPTH_EXCEPTION — Plan C's regions live in content/world/fabric/ and are not
// spine nodes at all, so a town's only possible parent is a continent and
// n-millcross is re-parented onto one. The rule still has to have a red case,
// so the fixture skips a depth with `site` instead, which is not an exception.
test("HC-2 G-DEPTH red: a depth skip (site, depth 3) under a continent (depth 1)", () => {
  const { code, stdout } = runGate(contentRootFor("g-depth-skip-under-continent"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-DEPTH: n-oops-site \(site, depth 3\) under n-shore \(continent, depth 1\)/);
});

test("HC-2 G-POLY red: a clockwise ring has strictly negative signed shoelace", () => {
  const { code, stdout } = runGate(contentRootFor("g-poly-clockwise-ring"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-POLY: n-badland: signed shoelace area -1600 is not strictly positive/);
});

test("HC-2 G-SEED red: two nodes sharing one seed.value", () => {
  const { code, stdout } = runGate(contentRootFor("g-seed-duplicate-seed"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-SEED: duplicate seed\.value "00000000000000aa" on n-copied and n-atlas/);
});

test("HC-2 G-COMP-SUM red: the 65-that-should-be-6.5 typo sums to 158.5", () => {
  const { code, stdout } = runGate(contentRootFor("g-comp-sum-typo"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-COMP-SUM: n-typo: composition sums to 158\.5/);
});

// ── the acceptance-criteria green: all 7 gates on the committed table ──────
test("all 7 structural gates are green on the committed 4-node spine", () => {
  const { code, stdout } = runGate(join(ROOT, "content"));
  assert.equal(code, 0, stdout);
  assert.match(stdout, /content-gate: .*, 0 failures/);
});

// ─── F-041 Phase 1 · Task 1.1: derive-writer ────────────────────────────────
import { test as t11 } from "node:test";
import assert11 from "node:assert/strict";
import { execFileSync as exec11 } from "node:child_process";
import { mkdtempSync as mkdtemp11, cpSync as cp11, readFileSync as read11, writeFileSync as write11 } from "node:fs";
import { tmpdir as tmp11 } from "node:os";
import { join as join11, resolve as resolve11, dirname as dirname11 } from "node:path";
import { fileURLToPath as f2p11 } from "node:url";

const ROOT11 = resolve11(dirname11(f2p11(import.meta.url)), "../..");
const EMIT = join11(ROOT11, "scripts/check_spine_emit.mjs");

function runEmit(dir, args) {
  try {
    const out = exec11(process.execPath, [EMIT, ...args, "--content-root", dir], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
}

function realSpineCopy() {
  const dir = mkdtemp11(join11(tmp11(), "spine-emit-"));
  cp11(join11(ROOT11, "content/spine"), join11(dir, "spine"), { recursive: true });
  cp11(join11(ROOT11, "content/schemas/spine-node.schema.json"),
       join11(dir, "schemas/spine-node.schema.json"), { recursive: true });
  return dir;
}

t11("spine-emit --write is idempotent and --check is green after it", () => {
  const dir = realSpineCopy();
  assert11.equal(runEmit(dir, ["--write"]).code, 0);
  const first = read11(join11(dir, "spine/nodes/n-cluster1.json"), "utf8");
  assert11.equal(runEmit(dir, ["--write"]).code, 0);
  assert11.equal(read11(join11(dir, "spine/nodes/n-cluster1.json"), "utf8"), first);
  assert11.equal(runEmit(dir, ["--check"]).code, 0);
});

// Plan B Task 4 retarget: `derived` is no longer inside n-cluster1.json, so
// the hand-edit this test exists to catch now lands in the sidecar. Same
// claim as before — the emitter's --check sees a hand-edited derived value —
// against the file the value actually lives in.
t11("spine-emit --check goes red on a hand-edited derived block", () => {
  const dir = realSpineCopy();
  runEmit(dir, ["--write"]);
  const p = join11(dir, "spine/derived.json");
  const side = JSON.parse(read11(p, "utf8"));
  side["n-cluster1"].coveragePct = 99.9;
  write11(p, JSON.stringify(side, null, 2) + "\n");
  const r = runEmit(dir, ["--check"]);
  assert11.equal(r.code, 1);
  assert11.match(r.out, /spine-emit: DRIFT .*derived\.json/);
});

// ─── F-041 Phase 1 · fixture builder (A3: reuse Phase 0's if equivalent) ────
const FIX = join11(ROOT11, "scripts/tests/fixtures/spine");
const GATE11 = join11(ROOT11, "scripts/check_content.mjs");
function spineFixture({ overlayDir = null, mutate = null } = {}) {
  const dir = mkdtemp11(join11(tmp11(), "spine-fix-"));
  cp11(join11(FIX, "base"), dir, { recursive: true });
  cp11(join11(ROOT11, "content/schemas/spine-node.schema.json"),
       join11(dir, "schemas/spine-node.schema.json"), { recursive: true });
  if (overlayDir) cp11(join11(FIX, overlayDir), dir, { recursive: true });
  exec11(process.execPath, [EMIT, "--write", "--content-root", dir]); // fill derived
  if (mutate) mutate(dir);
  return dir;
}
// Plan A Task 13: in-process, not spawned. See runGate's header.
function runSpineGate(dir) {
  return runSpineGateInProcess({ argv: ["--content-root", dir, "--only=spine"] }); // {code, out}
}

t11("base spine fixture is green", () => {
  const r = runSpineGate(spineFixture());
  assert11.equal(r.code, 0, r.out);
});
t11("G-CONTAIN red: child polygon pokes outside its parent", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-contain-child-outside" }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-CONTAIN.*n-r.*outside parent n-c/);
});
t11("G-ANCHOR red: anchor outside own placement", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-anchor-outside" }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-ANCHOR.*n-r.*anchor \[5, 5\] outside placement/);
});

// ─── Plan E Task 6 · G-PIN-ANCHOR ──────────────────────────────────────────
//
// A node that names a pinned place stands where the pin is.
// The rule exists because the redraw moved the three preserved chart nodes by
// TWO different offsets — the town host by PIN_OFFSET, the two regions by the
// generator's continent-anchor delta — and nothing read the disagreement:
// G-CONTAIN only asks that a node sit inside its parent's ring, so both
// regions sat 20.80 km from their own pins with every gate green.
//
// The fixture is hermetic: the base tree's `n-r` is hand-authored at [30, 30]
// under a per-1 chain, so its composed anchor IS [30, 30] and the roster is
// written here rather than read out of the corpus.
const pinRoster = (dir, rows) => {
  mkdirSync(join11(dir, "world/civil"), { recursive: true });
  write11(join11(dir, "world/civil/pinned-roster.json"),
    JSON.stringify({ version: 1, pinOffset: [0, 0], rows }, null, 2) + "\n");
};

t11("G-PIN-ANCHOR red: a node 1 km off its own pin", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) =>
    pinRoster(dir, [{ id: "c-lm-r", kind: "landmark", continent: "c00", at: [31, 30] }]) }));
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out,
    /G-PIN-ANCHOR n-r: composed anchor \[30, 30\] is 1\.000 km from its pin c-lm-r \[31, 30\]/);
  // and it is the PIN rule failing, not the ring rule: the node is still
  // inside its parent, which is the whole reason nothing caught this.
  assert11.doesNotMatch(r.out, /G-CONTAIN.*n-r/);
});

// GREEN is asserted as "no G-PIN-ANCHOR line", not as exit 0: writing
// world/civil/ into this fixture arms the whole world-budget family, which
// then wants world/budgets.json and world/lexicon/landforms.json the spine
// fixture has never carried. Asserting the exit code here would be asserting
// those two unrelated gates.
t11("G-PIN-ANCHOR green: the same node ON its pin", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) =>
    pinRoster(dir, [{ id: "c-lm-r", kind: "landmark", continent: "c00", at: [30, 30] }]) }));
  assert11.doesNotMatch(r.out, /G-PIN-ANCHOR/, r.out);
});

// The scope, armed, on gSpinePinAnchor directly — the water tiers cannot be
// built inside the spine fixture (a sea's parent is an ocean, and G-TIER owns
// that), and the rule under test is about the TIER, not the tree shape.
//
// Why the exemption exists: every civil row is a town or a landmark on a
// continent, i.e. a point on a landmass, so a slug shared with a body of
// water is a coincidence of naming. On the live corpus the marginal seas
// n-reed-shallows and n-rimewall-margin share a slug with the landmarks
// c-lm-reed-shallows and c-lm-rimewall-margin, which are points on their
// SHORES. The land case beside them is what proves the exemption is a
// water exemption and not a silence.
t11("G-PIN-ANCHOR exempts water by TIER, and only water", () => {
  const at = (id, tier) => ({ id, tier, parentId: null, placement: { anchor: [10, 10] },
                              provenance: { authored: "generated", generator: {}, source: "x" } });
  const nodes = [at("n-a", "ocean"), at("n-b", "sea"), at("n-c", "region")];
  const tree = { byId: new Map(nodes.map((n) => [n.id, n])),
                 depthOf: new Map(nodes.map((n) => [n.id, 0])) };
  const fails = [];
  gSpinePinAnchor({ nodes, tree, fail: (m) => fails.push(m), roster: { rows: [
    { id: "c-lm-a", at: [90, 90] }, { id: "c-lm-b", at: [90, 90] }, { id: "c-lm-c", at: [90, 90] },
  ] } });
  assert11.equal(fails.length, 1, fails.join("\n"));
  assert11.match(fails[0], /G-PIN-ANCHOR n-c: composed anchor \[10, 10\] is 113\.137 km from its pin c-lm-c/);
});

// ─── Plan E Task 6 · G-LABEL-FRAME ─────────────────────────────────────────
//
// G-PIN-ANCHOR's companion, one field over. `lore.labelAt` is authored in the
// SAME frame as `placement` — on both preserved regions the committed value
// was byte-equal to `placement.anchor` — so when the redraw moved the
// placements onto their pins and carried `lore` forward verbatim, the two
// nodes came out with world-km placements and basin-local labels
// (n-thornveil [24.4, 26] against a placement at [105.4, 155]) and every
// committed gate stayed green, because nothing read the field.
//
// Containment, not equality: a label may legitimately sit off-centre inside
// its own footprint. What it cannot do is land outside it — that is a frame
// disagreement, which is the only thing this rule is for.
const withLabelAt = (labelAt) => (dir) => {
  const p = join11(dir, "spine/nodes/n-r.json");
  const doc = JSON.parse(read11(p, "utf8"));
  doc.lore = { ...doc.lore, labelAt };
  write11(p, JSON.stringify(doc, null, 2) + "\n");
};

t11("G-LABEL-FRAME red: labelAt in a different frame from its placement", () => {
  // n-r's placement is the square [20,20]..[40,40]; [5, 5] is the shape the
  // real defect took — a label left behind in a retired origin.
  const r = runSpineGate(spineFixture({ mutate: withLabelAt([5, 5]) }));
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out,
    /G-LABEL-FRAME n-r: lore\.labelAt \[5, 5\] is outside the node's own placement/);
  // and it is the LABEL rule failing, not the anchor or the ring rules: the
  // placement itself never moved, which is exactly why nothing caught this.
  assert11.doesNotMatch(r.out, /G-ANCHOR.*n-r/);
  assert11.doesNotMatch(r.out, /G-CONTAIN.*n-r/);
});

t11("G-LABEL-FRAME green: labelAt inside its own placement, on and off centre", () => {
  for (const at of [[30, 30], [23.5, 37]]) {
    const r = runSpineGate(spineFixture({ mutate: withLabelAt(at) }));
    assert11.equal(r.code, 0, r.out);
    assert11.doesNotMatch(r.out, /G-LABEL-FRAME/, r.out);
  }
});

t11("G-PIN-ANCHOR red: two roster rows claim one slug", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => pinRoster(dir, [
    { id: "c-lm-r", kind: "landmark", continent: "c00", at: [30, 30] },
    { id: "c-town-r", kind: "town", continent: "c00", at: [30, 30] },
  ]) }));
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-PIN-ANCHOR n-r: pinned-roster\.json holds two rows for slug "r"/);
});

// Review round 1, Important: gSpineGeometry must walk the SCHEMA-VALIDATED
// list (validNodes), not loadSpine()'s raw one — a node missing `placement`
// entirely already earned its clean schema FAIL and must not also reach
// ringOf()/ .anchor and crash the whole gate with an uncaught TypeError
// (which would also swallow every FAIL recorded before it, since finish()
// never runs). Delete `placement` AFTER --write (mutate), not before — a
// node with no placement can't be derived, so it can't survive the
// fixture's own emit step.
t11("G-SCHEMA-MISSING-PLACEMENT: a node missing placement FAILs cleanly, no crash", () => {
  const r = runSpineGate(
    spineFixture({
      mutate: (dir) => {
        const p = join11(dir, "spine/nodes/n-r.json");
        const doc = JSON.parse(read11(p, "utf8"));
        delete doc.placement;
        write11(p, JSON.stringify(doc, null, 2) + "\n");
      },
    }),
  );
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /FAIL {2}spine\/nodes\/n-r\.json: schema .*placement/);
  assert11.doesNotMatch(r.out, /TypeError/);
});

// ─── F-041 Phase 1 · Task 1.7: G-FRAME + G-SCALE + G-DERIVED-DRIFT +
// G-PROVENANCE ──────────────────────────────────────────────────────────────
t11("G-FRAME red: hand-edited originInParent", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => {
    const p = join11(dir, "spine/nodes/n-r.json");
    const doc = JSON.parse(read11(p, "utf8"));
    doc.interior.originInParent = [0, 0]; // truth is [20, 20]
    write11(p, JSON.stringify(doc, null, 2) + "\n");
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-FRAME n-r: interior\.originInParent \[0, 0\] != derived \[20, 20\]/);
});
t11("G-SCALE red: units flip without a scale factor", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-scale-units-flip" }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-SCALE n-r: units u under km parent but perParentUnit 1/);
});
// (Plan B Task 4: the per-node "G-DERIVED-DRIFT red: hand-edited derived
// block" case that stood here is replaced, not dropped — `derived` no longer
// lives in n-c.json, so the same hand-edit is made in the sidecar by
// "G-DERIVED-DRIFT red: one hand-edited number in the sidecar" at the end of
// this file, together with five more cases the whole-file rule needs:
// missing, stale id, missing id, malformed, and the two soft-skip shapes.)
t11("G-PROVENANCE red: generated node without a generator pin", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-provenance-unpinned" }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-PROVENANCE n-r: authored "generated" requires generator \{name, version\}/);
});

// F-041 Phase 1 Task 1.8: G-FROZEN, then G-NET + G-CANON-LEG.
t11("G-FROZEN red: frozen node under an unfrozen ancestor", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-frozen-unfrozen-ancestor" }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-FROZEN n-r: frozen but ancestor n-c is not/);
});
t11("G-FROZEN red: absoluteAnchor drifted from the composed transform", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-frozen-unfrozen-ancestor", mutate: (dir) => {
    for (const id of ["n-w", "n-c"]) {  // freeze the chain properly first…
      const p = join11(dir, `spine/nodes/${id}.json`);
      const doc = JSON.parse(read11(p, "utf8"));
      doc.frozen = true; doc.absoluteAnchor = doc.placement.anchor;
      write11(p, JSON.stringify(doc, null, 2) + "\n");
    }
    const p = join11(dir, "spine/nodes/n-r.json");   // …then poison the leaf's pin
    const doc = JSON.parse(read11(p, "utf8"));
    doc.absoluteAnchor = [1, 1];
    write11(p, JSON.stringify(doc, null, 2) + "\n");
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-FROZEN n-r: absoluteAnchor \[1, 1\] != composed \[30, 30\]/);
});
t11("G-NET red: edge endpoint does not resolve", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => {
    write11(join11(dir, "spine/edges.json"), JSON.stringify([
      { id: "e-bad", kind: "road", from: { node: "n-r" }, to: { node: "n-ghost" },
        points: [[30, 30], [50, 50]], attrs: {} },
    ], null, 2) + "\n");
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-NET e-bad: endpoint node "n-ghost" does not resolve/);
});
t11("G-CANON-LEG red: straight-line distance breaks the ±8% budget", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => {
    for (const id of ["n-w", "n-c", "n-r"]) {
      const p = join11(dir, `spine/nodes/${id}.json`);
      const doc = JSON.parse(read11(p, "utf8"));
      doc.frozen = true;
      doc.absoluteAnchor = id === "n-r" ? [30, 30] : [50, 50];
      write11(p, JSON.stringify(doc, null, 2) + "\n");
    }
    write11(join11(dir, "spine/edges.json"), JSON.stringify([
      { id: "e-leg-r-c", kind: "leg", from: { node: "n-r" }, to: { node: "n-c" },
        attrs: { canonDays: "x", roadKm: 300, straightKm: 200 } },
    ], null, 2) + "\n");
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-CANON-LEG e-leg-r-c: straight-line .* vs straightKm 200 breaks ±8%/);
});

// ─── F-041 Phase 1 · Task 1.9: an emitted MIRROR drifts red (G-EMIT-DRIFT) ──
// Plan A Task 12 retargeted this from maps/cluster1-geography.json, which the
// same task deleted, onto maps/atlas-frontier.md — the surviving mirror in the
// same fixture. The SHAPE being tested is what matters and is unchanged: a
// hand-edit to an emitted MIRROR (as opposed to a node file, covered above at
// the n-cluster1.json drift test) must red. Dropping the test instead would
// have left G-EMIT-DRIFT's mirror half with no red-path coverage in this file.
t11("G-EMIT-DRIFT: an emitted mirror drifts red on a hand-edit and is green when clean", () => {
  const dir = mkdtemp11(join11(tmp11(), "spine-geo-"));
  cp11(join11(ROOT11, "content/spine"), join11(dir, "spine"), { recursive: true });
  cp11(join11(ROOT11, "content/maps"), join11(dir, "maps"), { recursive: true });
  cp11(join11(ROOT11, "content/schemas/spine-node.schema.json"),
       join11(dir, "schemas/spine-node.schema.json"), { recursive: true });
  assert11.equal(runEmit(dir, ["--write"]).code, 0);
  assert11.equal(runEmit(dir, ["--check"]).code, 0);
  const p = join11(dir, "maps/atlas-frontier.md");
  const before = read11(p, "utf8");
  const after = before.replace(/^ {2}width: \d+$/m, "  width: 999");
  assert11.notEqual(after, before, "the front-matter key this test edits is gone — re-point it");
  write11(p, after);
  const r = runEmit(dir, ["--check"]);
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /spine-emit: DRIFT .*atlas-frontier\.md/);
});

// ─── F-041 Phase 1 · Task 1.10: G-LOAD-BUDGET + G-COMP-REPORT ───────────────
// Note: the base fixture's committed coverage budget is maxUnchecked: 2
// (Task 1.6) because n-w and n-c are both UNCHECKED; the red test below
// lowers it to 0.
// Review fix: this fixture stayed two-key when Plan A Task 4 migrated the six
// on-disk budget files, so it was also tripping the two missing-term rules —
// three FAILs where the test isolates one, and `code === 1` satisfiable
// without the node-count rule firing at all. Carries all four terms now, with
// only maxNodes lowered, so the rule under test is the only one that can fire.
t11("G-LOAD-BUDGET red: node count over a lowered budget", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => {
    write11(join11(dir, "spine/load-budget.json"),
      '{ "maxNodes": 1, "maxChildrenPerParent": 24, "maxRingPoints": 160, "maxBytes": 65536 }\n');
  } }));
  assert11.doesNotMatch(r.out, /has no maxChildrenPerParent|has no maxRingPoints/);
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-LOAD-BUDGET: 3 nodes > budget 1/);
});
t11("G-COMP-REPORT red: UNCHECKED count over the coverage budget", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => {
    write11(join11(dir, "spine/coverage-budget.json"), '{ "maxUnchecked": 0 }\n');
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-COMP-REPORT: \d+ UNCHECKED nodes > budget 0/);
});
t11("G-COMP-REPORT prints coverage and verdict for every node", () => {
  const r = runSpineGate(spineFixture());
  assert11.equal(r.code, 0);
  assert11.match(r.out, /spine-comp: n-c coverage=\d+(\.\d+)?% verdict=(CHECKED|ASSERTED|UNCHECKED)/);
  assert11.match(r.out, /spine-comp: totals CHECKED=\d+ ASSERTED=\d+ UNCHECKED=2/);
  // Plan A Task 4 widened this line to three measured terms; the F-041 shape
  // it pinned (`3 nodes, N bytes (budget 10 nodes, 65536 bytes)`) is still
  // asserted here, with the two new terms spliced in where they now print.
  assert11.match(r.out, /spine-load: 3 nodes, \d+ bytes, max children \d+\/\d+, max ring \d+\/\d+ \(budget 10 nodes, 65536 bytes\)/);
});

// ─── F-041 Phase 1 · Task 1.13: G-OVERLAP + G-COMP-ROLLUP (FAIL stage) ──────
t11("G-OVERLAP + G-COMP-ROLLUP red: overlapping twins now hard-fail", () => {
  const r = runSpineGate(spineFixture({ overlayDir: null, mutate: (dir) => {
    const base = JSON.parse(read11(join11(dir, "spine/nodes/n-r.json"), "utf8"));
    const twin = { ...base, id: "n-r2", seed: { value: "52fc1fdd51a099d7", epoch: 0, why: null } };
    write11(join11(dir, "spine/nodes/n-r2.json"), JSON.stringify(twin, null, 2) + "\n");
    exec11(process.execPath, [EMIT, "--write", "--content-root", dir]);
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-OVERLAP n-r ∩ n-r2: 400\.0 over limit 2\.0/);
  // F-043 perf fix: the parent-level double-count check (gSpineOverlapRollup)
  // switched from a gridUnionArea() scan to summing the pairwise
  // gridIntersectionArea() values from the loop above. n-r/n-r2 are full
  // duplicates with a single pair, so the pairwise sum equals the old
  // union-based figure exactly (400.0) — this pins that the fixture's
  // reported double-count number did not change after the swap.
  assert11.match(r.out, /G-OVERLAP n-c: children double-count 400\.0 \(limit 32\.0\)/);
});

// ─── Plan A Task 2 review fix (MAJOR): the silent-blindness path ────────────
// The exact kernel returns 0 for a ring it cannot triangulate, which is
// indistinguishable from "genuinely disjoint". G-POLY does not catch that
// class — it rejects PROPER self-crossing only, so this ring (shoelace +537.5,
// selfIntersects false, open, no repeated CONSECUTIVE point, 6 points) passes
// G-POLY clean. The retired lattice sampler needed no triangulation and
// reported it loudly; the swap must not turn that into a silent pass. This
// test fails if the `problems` collector is dropped from the call site.
t11("G-OVERLAP red: a ring the exact kernel cannot triangulate FAILS, never silently reports 0", () => {
  const r = runSpineGate(spineFixture({ overlayDir: null, mutate: (dir) => {
    const base = JSON.parse(read11(join11(dir, "spine/nodes/n-r.json"), "utf8"));
    const bad = {
      ...base,
      id: "n-r2",
      seed: { value: "52fc1fdd51a099d7", epoch: 0, why: null },
      // [60,40] is revisited from index 4 and one lobe is negatively wound, so
      // no honest triangulation exists. Wholly inside n-c ([10,10]-[90,90]);
      // anchor sits inside the ring, so G-CONTAIN and G-ANCHOR stay green.
      placement: {
        shape: "polygon",
        points: [[70, 60], [60, 40], [30, 55], [25, 20], [60, 40], [65, 55]],
        anchor: [45, 45],
      },
    };
    write11(join11(dir, "spine/nodes/n-r2.json"), JSON.stringify(bad, null, 2) + "\n");
    exec11(process.execPath, [EMIT, "--write", "--content-root", dir]);
  } }));
  assert11.equal(r.code, 1, r.out);
  assert11.doesNotMatch(r.out, /G-POLY: n-r2/); // the gap this FAIL exists to cover
  assert11.match(r.out, /G-OVERLAP n-r2: not triangulable/);
});
t11("G-COMP-ROLLUP red: child mix contradicts the parent beyond tolerance", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => {
    const p = join11(dir, "spine/nodes/n-c.json");
    const doc = JSON.parse(read11(p, "utf8"));
    doc.interstitialUnsurveyed = false;
    doc.interstitial = { rock: 100 }; // children + interstitial say rock; node claims meadow
    write11(p, JSON.stringify(doc, null, 2) + "\n");
    exec11(process.execPath, [EMIT, "--write", "--content-root", dir]);
  } }));
  assert11.equal(r.code, 1);
  assert11.match(r.out, /G-COMP-ROLLUP n-c: meadow off by .* pp \(tol 3\)/);
});

// ─── Plan A Task 4: the three-term load budget + G-VERTEX-BUDGET ───────────
t11("G-LOAD-BUDGET prints all three measured terms on every run", () => {
  const r = runSpineGate(spineFixture());
  assert11.equal(r.code, 0, r.out);
  assert11.match(r.out, /spine-load: 3 nodes, \d+ bytes, max children \d+\/\d+, max ring \d+\/\d+ \(budget 10 nodes, 65536 bytes\)/);
});

t11("G-LOAD-BUDGET red: a parent over maxChildrenPerParent names the quadratic cost", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-children-cap" }));
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-LOAD-BUDGET: n-c has 2 children > budget 1 — the pairwise overlap check is quadratic in siblings \(1 pairs\); introduce an intermediate node rather than raising the cap/);
});

t11("G-VERTEX-BUDGET red: a ring over the global maxRingPoints", () => {
  const r = runSpineGate(spineFixture({ overlayDir: "g-vertex-budget-region" }));
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-VERTEX-BUDGET: n-r ring has 4 vertices > 3 for tier region/);
});

// ── review fix: the PER-TIER half of G-VERTEX-BUDGET had ZERO coverage ─────
// The effective cap is min(maxRingPoints, VERTEX_CAP[tier]). Everything above
// exercises only the GLOBAL term: the committed budget sets maxRingPoints 160
// against table rows of 200 and 800, so min() returns 160 for every tier, and
// the red fixture lowers the global to 3, so min() returns 3 for every tier.
// MEASURED before this test existed: replacing the whole expression with
// `const cap = maxRingPoints` left spine-gates.test.mjs at 74 pass / 0 fail —
// the table was a rule the suite could not tell from deleted.
//
// The pair below is the missing half. One ring, 208 vertices, under a global
// cap of 300 that cannot bind: RED on n-r (tier region, table cap 200), GREEN
// on n-c (tier continent, table cap 800). Same ring, same budget, opposite
// verdicts — only the tier differs, so only the table can explain it.
//
// Densifying inserts collinear points on the EXISTING edges, so the polygon is
// geometrically identical: shoelace area, containment, anchor and sibling
// overlap are all unchanged and only the vertex count moves. That keeps the
// fixture green on every other gate, and keeps a 208-point literal out of the
// repo — the same reason Task 4 chose to lower the cap rather than author a
// 201-point ring by hand.
function densifyRing(points, per) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    out.push(a);
    for (let k = 1; k < per; k++)
      out.push([
        Math.round((a[0] + (b[0] - a[0]) * k / per) * 100) / 100,
        Math.round((a[1] + (b[1] - a[1]) * k / per) * 100) / 100,
      ]);
  }
  return out;
}

// maxRingPoints 300 is deliberately ABOVE every vertex count here, so a
// failure can only have come from the per-tier row.
function tierCapFixture({ nodeId, per = 52 }) {
  return spineFixture({ mutate: (dir) => {
    write11(join11(dir, "spine/load-budget.json"), JSON.stringify(
      { maxNodes: 10, maxChildrenPerParent: 24, maxRingPoints: 300, maxBytes: 262144 }, null, 2) + "\n");
    const p = join11(dir, `spine/nodes/${nodeId}.json`);
    const doc = JSON.parse(read11(p, "utf8"));
    doc.placement.points = densifyRing(doc.placement.points, per);
    write11(p, JSON.stringify(doc, null, 2) + "\n");
    exec11(process.execPath, [EMIT, "--write", "--content-root", dir]); // re-derive the widened ring
  } });
}

t11("G-VERTEX-BUDGET: the PER-TIER cap binds — 208 vertices is RED for tier region under a global 300", () => {
  const r = runSpineGate(tierCapFixture({ nodeId: "n-r" }));
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-VERTEX-BUDGET: n-r ring has 208 vertices > 200 for tier region/);
  // The global term is 300 and prints as such: it is not what fired.
  assert11.match(r.out, /max ring 208\/300/);
});

t11("G-VERTEX-BUDGET: the PER-TIER cap is read per tier — the SAME 208-vertex ring is GREEN for tier continent", () => {
  const r = runSpineGate(tierCapFixture({ nodeId: "n-c" }));
  assert11.equal(r.code, 0, r.out);
  assert11.doesNotMatch(r.out, /G-VERTEX-BUDGET/);
  assert11.match(r.out, /max ring 208\/300/);
});

// A budget file that predates this task must not silently disable the two new
// governors: both missing terms are their own clean FAIL, not a skipped rule.
t11("G-LOAD-BUDGET red: a two-key budget file fails on both missing terms", () => {
  const r = runSpineGate(spineFixture({ mutate: (dir) => {
    write11(join11(dir, "spine/load-budget.json"), '{ "maxNodes": 10, "maxBytes": 65536 }\n');
  } }));
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-LOAD-BUDGET: spine\/load-budget\.json has no maxChildrenPerParent/);
  assert11.match(r.out, /G-LOAD-BUDGET: spine\/load-budget\.json has no maxRingPoints/);
});

// This is a FALSE-POSITIVE guard, not rule coverage, and the distinction is
// worth naming: `doesNotMatch` passes identically when the rule is deleted, so
// it proves the rule does not fire on committed content and nothing more. The
// evidence that the rule EXISTS is the three red tests above.
t11("G-VERTEX-BUDGET green: every committed node is inside its tier cap", () => {
  const r = runGate(join(ROOT, "content"));
  assert11.equal(r.code, 0, r.stdout);
  assert11.doesNotMatch(r.stdout, /G-VERTEX-BUDGET/);
});

t11("G-LOAD-BUDGET green: the committed table is inside all three terms", () => {
  const r = runGate(join(ROOT, "content"));
  // The node count is READ from content/spine/trunk-census.json (Plan E, E-C4);
  // the other two terms are MEASURED facts of the redrawn trunk, re-pinned here
  // because the redraw legitimately moved them: n-atlas now has 16 children
  // (13 continents + 3 oceans) where n-cluster1 used to top out at 12, and the
  // widest ring is a generated continent outline at 156 points where the old
  // hand-drawn n-galereach was 27.
  //
  // 156/160 IS THE FINDING THIS LINE NOW CARRIES: the redrawn trunk sits at
  // 97.5% of maxRingPoints with four points of headroom. The budget was NOT
  // raised to absorb it — a re-simplification that adds five points to any
  // continent outline reds G-LOAD-BUDGET, which is the gate saying the ring
  // needs simplifying, not that the budget needs raising.
  assert11.match(r.stdout, new RegExp(
    `spine-load: ${TRUNK_NODES} nodes, \\d+ bytes, max children 16/24, max ring 156/160 \\(budget 96 nodes, 786432 bytes\\)`));
});

// ── F-041 Phase 3: hermetic fixture roots for the town-frame gates ──────────
// Copies a committed fixture dir to a tmp root, writes the codegen-owned
// content/spine/derived.json sidecar via the emitter's own derivedSidecar
// (G-DERIVED-DRIFT stays green; each fixture fails ONLY on its authored
// defect), copies the two real schemas in, then runs the real gate binary
// with --only=spine.
//
// NOTE: the brief for this task names the runner `runSpineGate(root) →
// { status, out }`, but a same-named `runSpineGate(dir) → { code, out }`
// already exists at module scope (added for Task 1.7's fixture builder,
// used by ~15 tests above) — a second top-level `function runSpineGate`
// would be a SyntaxError (duplicate declaration), not a redefinition.
// Named `p3RunSpineGate` instead; behaviourally identical (same GATE binary,
// same --content-root/--only=spine invocation), field renamed `status` to
// match the brief's contract for Tasks 3.7–3.9 to reuse.
const P3_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures/spine");

// `mutate(root)` runs on the copied root BEFORE the derived blocks are filled,
// so a mutation is indistinguishable from a committed authoring defect — the
// derived blocks are consistent with whatever the mutation left behind, and
// the fixture still fails ONLY on the defect under test.
function p3Root(fixtureName, mutate = null) {
  const root = mkdtempSync(join(tmpdir(), `spine-p3-`));
  cpSync(join(P3_FIXTURES, fixtureName), root, { recursive: true });
  mkdirSync(join(root, "schemas"), { recursive: true });
  for (const s of ["spine-node.schema.json", "town-plan.schema.json"])
    cpSync(join(ROOT, "content/schemas", s), join(root, "schemas", s));
  if (mutate) mutate(root);
  const spine = loadSpine({ contentRoot: root });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  // plans: the ONE [{ file, doc }] shape documented at lib/spine.mjs's
  // planForNode(). NO LONGER INERT — the P3 phase-review wave activated it:
  // deriveNode's rollupVerdict is CHECKED for a town with a linked plan
  // (§5.5), so the derived blocks written here must be derived from the SAME
  // list the gate reads out of the fixture's towns/ dir, or every fixture
  // reds on G-DERIVED-DRIFT instead of on the gate under test.
  const plans = readdirSync(join(root, "towns")).sort().map((f) => ({
    file: `towns/${f}`,
    doc: JSON.parse(readFileSync(join(root, "towns", f), "utf8")),
  }));
  // Plan B Task 4: one sidecar instead of 3-per-fixture inline blocks. Built
  // by the emitter's OWN producer (derivedSidecar), not a hand-rolled loop, so
  // these roots are byte-identical to what `check_spine_emit --write` would
  // write — the whole-file G-DERIVED-DRIFT compares bytes, and a locally
  // JSON.stringify'd copy would red every P3 fixture on formatting alone.
  writeFileSync(join(root, "spine/derived.json"), derivedSidecar({ tree, plans }));
  return root;
}

// Plan A Task 13: in-process, not spawned. `status` (not `code`) is kept —
// ten P3 tests destructure it. See runGate's header.
function p3RunSpineGate(root) {
  const r = runSpineGateInProcess({ argv: ["--content-root", root, "--only=spine"] });
  return { status: r.code, out: r.out };
}

test("P3 fixture scaffolding: the green base passes --only=spine clean", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-gates-green-base"));
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /FAIL/);
});

test("G-TOWN-FRAME red: corner-as-anchor fixture (HC-2/HC-4)", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-frame-corner-as-anchor"));
  assert.equal(status, 1, out);
  assert.match(out, /G-TOWN-FRAME: towns\/town-t1\.json -> n-t1/);
  assert.match(out, /centre-of-interest, not the origin corner/);
});

test("G-TOWN-COMP red: footprints-only built (10 declared vs 28 derived) is outside ±3 pp (HC-2)", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-comp-footprints-only-built"));
  assert.equal(status, 1, out);
  assert.match(out, /G-TOWN-COMP: towns\/town-t1\.json -> n-t1: declared built 10 vs derived 28\.00/);
});

test("G-TERRAINKIND red: river-country with river at 10% misses the 15% implied-biome floor (HC-2)", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-terrainkind-implied-biome-missing"));
  assert.equal(status, 1, out);
  assert.match(out, /G-TERRAINKIND: n-r1: terrainKind "river-country" implies biome "river" at >= 15% of composition, found 10/);
});

// ── F-041 P3 phase-review wave ─────────────────────────────────────────────
// Five findings, one plumbing change: the gate now loads town plans ONCE,
// schema-validated, at the top of checkSpine, and hands that ONE list to
// G-FRAME (the reversed town arrow), G-COMP-REPORT (the CHECKED verdict) and
// the G-TOWN-* gates. The tests below pin each finding's failure mode.

const readJ = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJ = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
const planPath = (root) => join(root, "towns/town-t1.json");
const nodePath = (root, id) => join(root, "spine/nodes", `${id}.json`);

// Finding 1 (HIGH). checkSpine used to read towns/*.json with NO schema and
// hand the raw docs to townCompErrors, whose normRect(fp.rect) TypeErrors on
// a plan missing footprints[0].rect. An uncaught throw skips finish(), so
// every FAIL recorded before it is SWALLOWED and the process still exits 0.
// The mutation below plants BOTH defects at once: the schema-invalid plan and
// an unrelated earlier G-COMP-SUM failure that must survive to be printed.
test("town plans are schema-validated before the town gates consume them (a plan missing footprints[0].rect must not crash checkSpine)", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-gates-green-base", (root) => {
    const plan = readJ(planPath(root));
    delete plan.footprints[0].rect;         // the shape normRect would TypeError on
    writeJ(planPath(root), plan);
    const c1 = readJ(nodePath(root, "n-c1"));
    c1.composition = { meadow: 40, forest: 40 }; // sums to 80, not 100 — an EARLIER gate
    writeJ(nodePath(root, "n-c1"), c1);
  }));
  assert.equal(status, 1, out);
  assert.doesNotMatch(out, /TypeError/);
  // the plan earns its own clean schema FAIL line …
  assert.match(out, /FAIL {2}towns\/town-t1\.json: schema \/footprints\/0 must have required property 'rect'/);
  // … and the failure recorded BEFORE the town gates still reaches the report.
  assert.match(out, /FAIL {2}G-COMP-SUM: n-c1: composition sums to 80/);
});

// Finding 2 (HIGH). deriveInterior's town branch (research §3.2: the PLAN is
// the authority on a town's interior) was dead code — both production call
// sites passed plan: null, so a drifted plan extent changed nothing and the
// gate exited 0. Real plans are joined on spineId now.
test("G-FRAME red: a drifted plan extent contradicts the committed interior.size (the plan is the authority — research §3.2)", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-gates-green-base", (root) => {
    const plan = readJ(planPath(root));
    plan.extent.width = 235;               // node n-t1 still commits size [200, 160]
    writeJ(planPath(root), plan);
  }));
  assert.equal(status, 1, out);
  assert.match(out, /G-FRAME n-t1: interior\.size \[200, 160\] != derived \[235, 160\]/);
  assert.match(out, /the town plan's extent is the authority/);
});

// … and the epsilon half of the same finding: the reversed arrow divides and
// subtracts authored decimals, so the SHIPPED n-millcross derives 220 as
// 220.00000000000003. G-FRAME's JSON.stringify equality would red on correct
// content; the town arrow compares within FRAME_EPS. Real content, not a
// fixture — that is the whole point.
test("G-FRAME green: real content survives the activated town arrow (float-safe, not JSON.stringify-exact)", () => {
  const r = runGate(join(ROOT, "content"));
  assert.equal(r.code, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /G-FRAME/);
});

// Finding 3 (MEDIUM). §5.5 / plan.md task 3.8: a town whose spineId-linked
// plan exists is CHECKED. A town has no children, so child coverage can never
// be its evidence — the plan is.
test("G-COMP-REPORT: a town with a spineId-linked plan is CHECKED at 0% child coverage (§5.5)", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-gates-green-base"));
  assert.equal(status, 0, out);
  assert.match(out, /spine-comp: n-t1 coverage=0\.0% verdict=CHECKED/);
});

test("G-COMP-REPORT: the SAME town with its plan removed falls back to ASSERTED", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-gates-green-base", (root) => {
    rmSync(planPath(root));
  }));
  assert.equal(status, 0, out);
  assert.match(out, /spine-comp: n-t1 coverage=0\.0% verdict=ASSERTED/);
});

// A node is CHECKED when its composition is authored AND rolled up from real
// children. Pre-redraw that was four nodes; the redraw retired the region
// children of n-coldreach and n-stonemoor (their regions are fabric rows now,
// per E-C3), so both fall back to ASSERTED and the shipped table reports TWO
// CHECKED nodes: n-atlas (whose real {ocean:...} composition F-043 authored,
// now 98.0% against the redrawn landmasses) and n-millcross (the one committed
// town plan). This is a MEASURED move of the report, not a widened assertion —
// every node is still accounted for, and the totals line below is what proves
// the census did not quietly shrink.
test("G-COMP-REPORT: the shipped table reports exactly two CHECKED nodes (n-atlas, n-millcross)", () => {
  const r = runGate(join(ROOT, "content"));
  assert.equal(r.code, 0, r.stdout);
  assert.match(r.stdout, /spine-comp: n-atlas coverage=98\.0% verdict=CHECKED/);
  assert.match(r.stdout, /spine-comp: n-millcross coverage=0\.0% verdict=CHECKED/);
  assert.doesNotMatch(r.stdout, /spine-comp: n-coldreach .*CHECKED/);
  assert.doesNotMatch(r.stdout, /spine-comp: n-stonemoor .*CHECKED/);
  // CHECKED + ASSERTED + UNCHECKED must still add up to the committed census.
  const m = r.stdout.match(/spine-comp: totals CHECKED=(\d+) ASSERTED=(\d+) UNCHECKED=(\d+)/);
  assert.ok(m, r.stdout);
  assert.deepEqual(m.slice(1, 4).map(Number), [2, TRUNK_NODES - 2, 0]);
});

// Finding 4 (MEDIUM). terrainKindErrors ran over raw spine.nodes, so a node
// that already earned a clean schema FAIL (composition missing) ALSO earned a
// fabricated G-TERRAINKIND line claiming its implied biome sits at 0% — a
// second failure about a field the author never wrote.
test("G-TERRAINKIND walks validNodes: a schema-invalid node earns its schema FAIL and no fabricated implied-biome line", () => {
  const { status, out } = p3RunSpineGate(p3Root("g-town-gates-green-base", (root) => {
    const t1 = readJ(nodePath(root, "n-t1"));
    t1.terrainKind = "river-country";
    delete t1.composition;                 // schema-required — n-t1 leaves validNodes
    writeJ(nodePath(root, "n-t1"), t1);
  }));
  assert.equal(status, 1, out);
  assert.match(out, /FAIL {2}spine\/nodes\/n-t1\.json: schema \/ must have required property 'composition'/);
  assert.doesNotMatch(out, /G-TERRAINKIND/);
});

// ── F-041 Phase 4 helpers: overlay fixtures on the real content root ──
// (rmSync added to the existing node:fs import; tmpdir/spawnSync added
//  only if not already imported. FIXTURES = Phase 0's constant for
//  scripts/tests/fixtures/spine — if your checkout's FIXTURES points one
//  level higher, use join(FIXTURES, "spine", overlayDir) below.)

// NOTE (brief bug, corrected): the brief's version of this helper omits
// schemas/ — checkSpine compiles content/schemas/spine-node.schema.json
// BEFORE it ever reaches the tree walk, so without it the gate exits 1 on
// "cannot read/parse .../schemas/spine-node.schema.json: ENOENT" and the
// G-RUNTIME line never prints (confirmed red-for-the-wrong-reason before
// this fix). towns/ is NOT required: loadTownPlans soft-skips a missing
// towns/ dir, so the real n-millcross town plan being absent here just
// drops its CHECKED verdict to ASSERTED (and trips G-DERIVED-DRIFT on it),
// which is exactly the "may also break G-DERIVED-DRIFT" noise the test
// below already expects and does not assert against.
function p4FixtureRoot(t, overlayDir) {
  const tmp = mkdtempSync(join(tmpdir(), "spine-fix-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  mkdirSync(join(tmp, "schemas"), { recursive: true });
  cpSync(join(ROOT, "content/schemas/spine-node.schema.json"), join(tmp, "schemas/spine-node.schema.json"));
  cpSync(join(ROOT, "content/spine"), join(tmp, "spine"), { recursive: true });
  cpSync(join(ROOT, "content/maps"), join(tmp, "maps"), { recursive: true });
  const edgesPath = join(tmp, "spine/edges.json");
  const edges = JSON.parse(readFileSync(edgesPath, "utf8"));
  writeFileSync(edgesPath, JSON.stringify(edges.filter((e) => e.kind !== "leg"), null, 2));
  stripFabricPins(tmp);
  if (overlayDir) cpSync(join(FIXTURES, overlayDir), tmp, { recursive: true });
  return tmp;
}

// PLAN E: the redrawn trunk PINS its fabric (E-C3 — `provenance.generator.fabric`
// is how a childless continent proves completeness, and G-TRUNK-AREA's ±3%
// activation key). This fixture root deliberately carries only spine/ + maps/,
// so every one of those 25 pins points at a `content/world/fabric/` file the
// root does not have: 13 dangling-pin FAILs plus their G-TRUNK-AREA twins, in
// EVERY p4 fixture, drowning the one authored defect each fixture exists to
// show. A pin to a file the root does not have is not "a spine-only root", it
// is a dangling pointer — the same argument world-budget.test.mjs's
// emptyWorldLayer already makes for the bound/handles/dungeons/relations
// layers. Nulling the pin is what makes the root honestly spine-only.
function stripFabricPins(root) {
  const dir = join(root, "spine/nodes");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const p = join(dir, f);
    const doc = JSON.parse(readFileSync(p, "utf8"));
    if (doc.provenance?.generator?.fabric == null) continue;
    doc.provenance.generator.fabric = null;
    writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  }
}

// Unique name on purpose — never shadows Task 1.6's or Task 3.6's runners.
// Plan A Task 13: in-process, not spawned. See runGate's header. The one
// `extraArgs` caller passes `--require-complete`, which parseArgs accepts
// alongside `--only=spine`; anything parseArgs rejects still exits the process
// (it always did), so this helper must never be handed an unparseable flag.
function runP4Gate(root, extraArgs = []) {
  return runSpineGateInProcess({ argv: ["--only=spine", "--content-root", root, ...extraArgs] }); // {code, out}
}

test("G-RUNTIME goes red on an originU that is not the accumulated origin (HC-2)", (t) => {
  const { code, out } = runP4Gate(p4FixtureRoot(t, "g-runtime-originu-mismatch"));
  assert.equal(code, 1);
  assert.match(out, /G-RUNTIME: "n-frontier-shelf" runtime\.originU \[1,0\]/);
  // NOTE: the mutated copy may also break G-DERIVED-DRIFT's digest — expected;
  // this test asserts the G-RUNTIME line specifically.
});

test("G-SPAWN-FIT goes red on a rect with insufficient margin (HC-2)", (t) => {
  const { code, out } = runP4Gate(p4FixtureRoot(t, "g-spawn-fit-margin"));
  assert.equal(code, 1);
  assert.match(out, /G-SPAWN-FIT: spawn area "thornveil_interior" east margin 3 < required 10/);
});

test("G-SPAWN-ID-STABLE goes red on a renamed spawn id (HC-2)", (t) => {
  const { code, out } = runP4Gate(p4FixtureRoot(t, "g-spawn-id-stable-renamed"));
  assert.equal(code, 1);
  assert.match(out, /G-SPAWN-ID-STABLE: spawn-id set != content\/spine\/frozen-spawn-ids\.json/);
  assert.match(out, /missing: \[east_dunes_renamed\]/);
  assert.match(out, /extra: \[east_dunes\]/);
});

test("G-ALIAS goes red on a map region id with no site node (HC-2)", (t) => {
  const { code, out } = runP4Gate(p4FixtureRoot(t, "g-alias-dangling-region"));
  assert.equal(code, 1);
  assert.match(out, /G-ALIAS: map region "region-ghost" resolves to no spine node \(expected "n-site-ghost"\)/);
});

test("G-SPINE-COMPLETE goes red under --require-complete on a childless non-leaf-tier fixture (HC-2)", (t) => {
  const root = p4FixtureRoot(t, "g-spine-complete-childless");
  // The overlay node ships derived: null and shifts n-playroot's rollup —
  // regenerate derived on the overlaid root so G-DERIVED-DRIFT stays out
  // of both runs (fixture-root --write only touches the tmp copy: the
  // emit mirrors are keyed off --content-root, Tasks 4.10/4.11).
  const w = spawnSync(process.execPath,
    [join(ROOT, "scripts/check_spine_emit.mjs"), "--write", "--content-root", root], { encoding: "utf8" });
  assert.equal(w.status, 0, (w.stdout ?? "") + (w.stderr ?? ""));
  const red = runP4Gate(root, ["--require-complete"]);
  assert.equal(red.code, 1);
  assert.match(red.out, /G-SPINE-COMPLETE: "n-ghost-shelf" \(tier playspace\) has no children/);
  // without the flag the same defect is a WARN, not a FAIL — scoped to
  // THIS gate's line so an unrelated failure can't hide behind it
  const soft = runP4Gate(root);
  assert.ok(!soft.out.match(/^FAIL .*G-SPINE-COMPLETE.*n-ghost-shelf/m), soft.out);
});

test("G-SPINE-COMPLETE: a childless ocean and sea are complete (plan E, E-C2)", () => {
  const dir = spineFixture({ overlayDir: "e-water-childless" });
  const { out } = runSpineGate(dir);
  assert.doesNotMatch(out, /G-SPINE-COMPLETE: "n-e-ocean"/);
  assert.doesNotMatch(out, /G-SPINE-COMPLETE: "n-e-sea"/);
});

test("G-SPINE-COMPLETE: a childless continent needs a fabric pin (plan E, E-C3)", () => {
  const dir = spineFixture({ overlayDir: "e-continent-fabric" });
  const { out } = runSpineGate(dir);
  assert.doesNotMatch(out, /G-SPINE-COMPLETE: "n-e-cont-pinned"/);
  assert.match(out,
    /G-SPINE-COMPLETE: "n-e-cont-bare" \(tier continent\) has no children/);
});

test("a stale fabric pin fails in-band naming the node and the dead path (plan E)", () => {
  // The pin points at continent-99.json but the file is gone: before the
  // fix this collapsed to count 0 and surfaced only as the generic
  // "has no children" — indistinguishable from n-e-cont-bare's honest
  // never-pinned failure. The gate must name the dead path.
  const dir = spineFixture({
    overlayDir: "e-continent-fabric",
    mutate: (d) => rmSync(join(d, "world/fabric/continent-99.json")),
  });
  const { code, out } = runSpineGate(dir);
  assert.equal(code, 1, out);
  assert.match(out,
    /fabric: spine node "n-e-cont-pinned" pins "content\/world\/fabric\/continent-99\.json" but no such fabric file was counted/);
  assert.doesNotMatch(out, /check-content: \w*Error/, "a stack trace means the gate threw");
});

test("the fabric index fails in-band on an unreadable continent file (plan E)", () => {
  const dir = spineFixture({ mutate: (d) => {
    mkdirSync(join(d, "world/fabric"), { recursive: true });
    writeFileSync(join(d, "world/fabric/continent-00.json"), "{ not json");
  } });
  const { out } = runSpineGate(dir);
  // The gate must REACH the failure line and print it — an uncaught throw
  // here would skip finish() and drop every FAIL before it.
  assert.match(out, /fabric: content\/world\/fabric\/continent-00\.json is unreadable/);
  assert.doesNotMatch(out, /check-content: \w*Error/, "a stack trace means the gate threw");
});

// ── F-041 P4 phase-review fix wave: HC-2 red proofs ───────────────────────
// Each of these reds a hole the Phase-4 review PROVED was silent. They use
// the same p4FixtureRoot overlay harness as the Task 4.x gate tests above.

// Review finding 1: G-SPAWN-ID-STABLE's union was seeded from the runtime
// artifact, so deleting one of the three dual-listed ids from the SPINE left
// the union identical — zero gate signal, and the emitted atlas-frontier.md
// silently lost a mobSpawnAreas row.
test("G-SPAWN-ID-STABLE goes red on a spine-side deletion of a dual-listed id (HC-2)", (t) => {
  const { code, out } = runP4Gate(p4FixtureRoot(t, "g-spawn-id-stable-spine-deletion"));
  assert.equal(code, 1);
  assert.match(out, /G-SPAWN-ID-STABLE: frozen spawn id\(s\) no longer authored in content\/spine\/nodes\/\*: \[thornveil_interior\]/);
});

// Review finding 2: checkSpawnFit bounded every rect against the MAP only, so
// a root-frame authoring mistake inside a 300x300 site passed all four
// margins and displaced the emitted row by the site origin (350u here).
test("G-SPAWN-FIT goes red on a spawn rect authored outside its OWNING node (HC-2)", (t) => {
  const { code, out } = runP4Gate(p4FixtureRoot(t, "g-spawn-fit-intra-node"));
  assert.equal(code, 1);
  assert.match(out, /G-SPAWN-FIT: spawn area "meadow_wilds" rect \(400,400 200x200\) is not contained by its owning node "n-site-spawn-meadow" interior\.size \[300, 300\]/);
});

// Review finding 3: FRONTIER_DOC.siteOrder hardcoded three sites, so a fourth
// site under n-frontier-shelf was silently omitted from the emitted mirror and
// the one-directional G-ALIAS said nothing. Two proofs in one fixture:
//   (a) the reverse G-ALIAS direction reds while the mirror lacks the region;
//   (b) --write then puts the row in the mirror, because the site list is now
//       derived from the tree rather than from the constant.
test("G-ALIAS reverse + derived siteOrder: a 4th site reds until the mirror is regenerated, then emits (HC-2)", (t) => {
  const root = p4FixtureRoot(t, "g-alias-unemitted-site");
  const pristineMirror = readFileSync(join(ROOT, "content/maps/atlas-frontier.md"), "utf8");
  const write = () => {
    const w = spawnSync(process.execPath,
      [join(ROOT, "scripts/check_spine_emit.mjs"), "--write", "--content-root", root], { encoding: "utf8" });
    assert.equal(w.status, 0, (w.stdout ?? "") + (w.stderr ?? ""));
  };
  write();                                                        // fill the new node's derived block
  writeFileSync(join(root, "maps/atlas-frontier.md"), pristineMirror); // ...but hold the mirror at 3 sites
  const red = runP4Gate(root);
  assert.equal(red.code, 1);
  assert.match(red.out, /G-ALIAS: spine site "n-site-newvale" has no map region "region-newvale"/);
  // (b) the emitter is no longer pinned to the 3 hardcoded ids
  write();
  const emitted = readFileSync(join(root, "maps/atlas-frontier.md"), "utf8");
  assert.match(emitted, /- id: region-newvale/);
  assert.equal(runP4Gate(root).code, 0);
});

// Review finding 5 (LOW): mirror-loss hardening. The frontier mirror's read
// was wrapped in a bare catch{}, so any non-ENOENT failure silently dropped
// an OUTPUT while the emitter still printed "check clean". Two pins:
// the emitted file set, and that a non-ENOENT read is an error.
const { collectOutputs } = await import("../check_spine_emit.mjs");

test("spine-emit emits every node file plus BOTH surviving mirrors — a silently dropped mirror reds", () => {
  const contentRoot = join(ROOT, "content");
  const { outputs, errors } = collectOutputs({ contentRoot });
  assert.equal(errors, undefined, JSON.stringify(errors));
  const paths = outputs.map((o) => o.path);
  const nodeFiles = readdirSync(join(contentRoot, "spine/nodes")).filter((f) => f.endsWith(".json")).length;
  // Plan A Task 12: 3 -> 2. The geography mirror was retired once every
  // consumer moved to scripts/lib/places.mjs; the two RUNTIME-facing mirrors
  // stay, and mapDimensions.ts is compiled server code.
  // Plan B Task 4: +1 — content/spine/derived.json, the hoisted `derived`
  // sidecar. 44 nodes + 3 = 47 outputs on the committed root.
  assert.equal(outputs.length, nodeFiles + 3, paths.join("\n"));
  for (const suffix of ["spine/derived.json",
                        "maps/atlas-frontier.md",
                        "colyseus-server/src/config/generated/mapDimensions.ts"])
    assert.ok(paths.some((p) => p.endsWith(suffix)), `missing mirror ${suffix} in:\n${paths.join("\n")}`);
  assert.ok(!paths.some((p) => p.endsWith("cluster1-geography.json")),
    "the retired geography mirror is being emitted again");
});

test("spine-emit: a non-ENOENT failure reading the frontier mirror is an error, not a silent skip (HC-2)", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "spine-emit-eisdir-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  cpSync(join(ROOT, "content/spine"), join(tmp, "spine"), { recursive: true });
  cpSync(join(ROOT, "content/maps"), join(tmp, "maps"), { recursive: true });
  // a DIRECTORY where the mirror should be: readFileSync throws EISDIR, which
  // the old bare catch{} swallowed as "fixture root has no maps/".
  rmSync(join(tmp, "maps/atlas-frontier.md"));
  mkdirSync(join(tmp, "maps/atlas-frontier.md"));
  const r = collectOutputs({ contentRoot: tmp });
  assert.ok(r.errors, "expected an in-band error, got outputs");
  assert.match(r.errors[0], /maps\/atlas-frontier\.md: cannot read/);
});

// ── F-041 Phase 5: G-ALIAS (story half + external sweep) — HC-2 reds ─────
// The fixture is a full copy of the repo's content/ tree: the only content
// root guaranteed to hold a valid spine + populated story regions without
// re-authoring one. keys/manifest/mob-types/art-manifest fall back to the
// gate's real committed default artifacts, so a clean copy behaves exactly
// like the repo (exit 0) and one dangling reference is the single
// difference per test. Assertions on WARN-able sources pin the
// "FAIL  spine-alias:" prefix, not just exit code 1 — some tampered values
// also trip pre-existing FAIL-severity gates (G-TOWN-FRAME on the town
// plan, the bestiary bible-region check, the season-1 art:town count), so
// exit 1 alone would not prove the flip below is load-bearing.

function aliasContentCopy() {
  const dir = mkdtempSync(join(tmpdir(), "spine-alias-"));
  cpSync(join(ROOT, "content"), join(dir, "content"), { recursive: true });
  return dir;
}

function runAliasGate(dir, extraArgs = []) {
  try {
    const out = execFileSync(
      process.execPath,
      [GATE, "--content-root", join(dir, "content"), ...extraArgs],
      { encoding: "utf8" },
    );
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function editJson(path, mutate) {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  mutate(doc);
  writeFileSync(path, JSON.stringify(doc, null, 2));
}

test("G-ALIAS story half: a dangling spineId is a hard FAIL", () => {
  const dir = aliasContentCopy();
  editJson(join(dir, "content/story/regions.json"), (regions) => {
    regions[0].spineId = "n-nope"; // regions[0] is region-spawn-meadow
  });
  const r = runAliasGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL\s+spine-alias: story\/regions\.json#region-spawn-meadow: spineId "n-nope" does not resolve to a spine node/);
});

test("G-ALIAS story half: prints each record's resolved tier on the clean tree", () => {
  // Plan D Task 11: run under --only=spine, which still runs this sweep but
  // skips the zone/town sweeps whose legacy-id orphans the cutover FAILs on
  // until Plan E movement 2 re-homes them.
  const dir = aliasContentCopy();
  const r = execFileSync(process.execPath,
    [GATE, "--only=spine", "--content-root", join(dir, "content")], { encoding: "utf8" });
  assert.match(r, /spine-alias: region-millcross → n-millcross \(town\)/);
  assert.match(r, /spine-alias: region-icefield → n-northern-icefield \(region\)/);
});

test("G-ALIAS sweep: a dangling zone-content spineId is a hard FAIL", () => {
  const dir = aliasContentCopy();
  editJson(join(dir, "content/zones/zone-thornveil.json"), (z) => {
    z.spineId = "n-nope"; // optional field: present-but-dangling must fail
  });
  const r = runAliasGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL\s+spine-alias: zones\/zone-thornveil\.json: spineId "n-nope" does not resolve to a spine node/);
});

test("G-ALIAS sweep: a dangling town-plan spineId is a hard FAIL", () => {
  const dir = aliasContentCopy();
  editJson(join(dir, "content/towns/town-millcross.json"), (t) => {
    t.spineId = "n-nope";
  });
  const r = runAliasGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL\s+spine-alias: towns\/town-millcross\.json: spineId "n-nope" does not resolve to a spine node/);
});

test("G-ALIAS sweep: a bestiary region slug with no spine node is a hard FAIL", () => {
  const dir = aliasContentCopy();
  editJson(join(dir, "content/bestiary/bestiary.json"), (rows) => {
    rows[0].region = "nopeland";
  });
  const r = runAliasGate(dir);
  assert.equal(r.code, 1, r.out);
  // Plan A Task 9 rewrote this message to name BOTH attempts. This test keeps
  // its own job — pinning the FAIL severity, not just exit 1 — and follows the
  // wording. (The plan's Step 3 named only the art:town string as changing;
  // the two bestiary strings change too, and both live assertions are here.)
  assert.match(r.out, /FAIL\s+spine-alias: bestiary\.json region "nopeland": neither n-nopeland \(spine\) nor "nopeland" \(resolved world\) exists/);
});

test("G-ALIAS sweep: a character region link whose record lost its spineId is a hard FAIL", () => {
  const dir = aliasContentCopy();
  editJson(join(dir, "content/story/regions.json"), (regions) => {
    delete regions.find((r) => r.id === "region-thornveil").spineId;
  });
  const r = runAliasGate(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL\s+spine-alias: characters\/mob-bramble-drake\.md: links\.story "region-thornveil" has no resolving spineId in story\/regions\.json/);
});

test("G-ALIAS sweep: an art:town-* key with no town-tier node is a hard FAIL", () => {
  const dir = aliasContentCopy();
  const artPath = join(dir, "art-manifest.json");
  const art = JSON.parse(readFileSync(join(ROOT, "game-client/assets/art/art-manifest.json"), "utf8"));
  art.entries["art:town-nopeville"] = { ...Object.values(art.entries)[0] };
  writeFileSync(artPath, JSON.stringify(art, null, 2));
  const r = runAliasGate(dir, ["--art-manifest", artPath]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAIL\s+spine-alias: art-manifest art:town-nopeville: neither a town-tier spine node n-nopeville \/ n-nopeville-town nor "nopeville" \(resolved world\) exists/);
});

// ─── Plan A Task 9: the alias sweep's second resolution path ───────────────
// X4: 116 bestiary rows + 10 story regions + 6 art:town keys + 10 zone files
// + 1 town plan all resolve against `n-<slug>` spine nodes today. Plan E's
// 36-node trunk removes region and town tiers from content/spine/nodes/, so
// the sweep needs a path through the resolved world document. Landed HERE,
// with the spine path still PRIMARY, so today's output is byte-identical.

// The RECORD COUNT, not just the exit code. Risk A2: a re-pointed join whose
// resolution silently returns nothing still exits 0 while checking nothing.
// Ruling 7b (Plan E Task 6f, owner-approved): six story regions and 26
// bestiary rows now resolve through the resolved world — the sweep still
// examines every record (35 alias lines: 10 story regions + 1 town plan +
// 9 distinct bestiary regions + 1 placement + 8 character links + 6 art:town
// keys), but four of those lines print `(resolved)`/`(resolved-zone)` instead
// of a spine tier. If the sweep stops examining records this number drops and
// the test reds; the literal is compared against gate OUTPUT, never against a
// second copy of itself.
t11("alias sweep: every record still resolves — spine primary, resolved world for the re-homed records", () => {
  const r = runGate(join(ROOT, "content"));
  assert11.equal(r.code, 0, r.stdout);
  const printed = r.stdout.split("\n").filter((l) => l.includes("spine-alias: "));
  assert11.equal(printed.length, 35, printed.join("\n"));
  // Spine-primary records are untouched by the rulings. Town slugs resolve
  // through the SPINE while their nodes exist (pre-redraw) and through the
  // resolved world's civil ids once the trunk shrinks (post-redraw) — the
  // assertion accepts either path because BOTH are contract-green.
  assert11.match(r.stdout, /spine-alias: bestiary\.json region "millcross" ×\d+ → (n-millcross \(town\)|millcross \(resolved-town\))/);
  assert11.match(r.stdout, /spine-alias: bestiary\.json region "rooktide" ×\d+ → (n-rooktide \(town\)|rooktide \(resolved-town\))/);
  assert11.match(r.stdout, /spine-alias: art-manifest art:town-rooktide → (n-rooktide \(town\)|rooktide \(resolved-town\))/);
  // Ruling 7b: story regions re-homed onto resolved refs name their kind.
  assert11.match(r.stdout, /spine-alias: region-rooktide → c-town-rooktide \(resolved\)/);
  assert11.match(r.stdout, /spine-alias: region-ashvale-front → c02\/r11 \(resolved\)/);
});

t11("alias sweep: a slug with NO spine node resolves through the world document instead", () => {
  const dir = aliasContentCopy();
  // Plan D Task 11: the resolved world is READ, not derived — its ids are the
  // GENERATED region/town ids (c02/rNN, c-town-*), so a slug that misses the
  // spine and still resolves through the document is now exactly one of those.
  // (The pre-cutover fixture modelled Plan E's rename-and-geoId shape against
  // a spine-DERIVED world; that derivation no longer exists.) The committed
  // bestiary keeps its legacy slugs until Plan E movement 2 re-homes them;
  // this fixture re-points ONE row to show the mechanism.
  const bestiary = join(dir, "content/bestiary/bestiary.json");
  const rows = JSON.parse(readFileSync(bestiary, "utf8"));
  rows[0].region = "c02/r01";
  writeFileSync(bestiary, JSON.stringify(rows, null, 2) + "\n");
  const r = runAliasGate(dir);
  assert11.doesNotMatch(r.out, /spine-alias: bestiary\.json region "c02\/r01": /);
  assert11.match(r.out, /spine-alias: bestiary\.json region "c02\/r01" ×\d+ → c02\/r01 \(resolved-zone\)/);
});

t11("alias sweep: a slug in NEITHER source names both attempts in one message", () => {
  // Both bestiary families in one fixture. The nopeland test above already
  // covers the region site's severity, so this one earns its place on the
  // placement-file site, which nothing else pins, and on the both-attempts
  // wording that is this task's contract.
  const dir = aliasContentCopy();
  const bestiary = join(dir, "content/bestiary/bestiary.json");
  const rows = JSON.parse(readFileSync(bestiary, "utf8"));
  rows[0].region = "nowhereshire";
  writeFileSync(bestiary, JSON.stringify(rows, null, 2) + "\n");
  const placement = join(dir, "content/bestiary/placement-thornveil.json");
  const doc = JSON.parse(readFileSync(placement, "utf8"));
  doc.zone = "nowhereshire";
  writeFileSync(placement, JSON.stringify(doc, null, 2) + "\n");
  const r = runAliasGate(dir);
  assert11.equal(r.code, 1);
  assert11.match(r.out, /spine-alias: bestiary\.json region "nowhereshire": neither n-nowhereshire \(spine\) nor "nowhereshire" \(resolved world\) exists/);
  assert11.match(r.out, /spine-alias: bestiary\/placement-thornveil\.json: zone "nowhereshire": neither n-nowhereshire \(spine\) nor "nowhereshire" \(resolved world\) exists/);
});

// Task 9 review finding, MAJOR: the fallback originally consulted the resolved
// world's ZONES only, while the primary lookup it backs up (`byId.get("n-"+
// slug)`) is tier-agnostic. 5 of the 9 bestiary region slugs — millcross,
// embervale, gildmark, norhollow, rooktide, 48 of the 116 rows — are TOWN-tier
// nodes, and the resolved world keeps zones and towns in disjoint arrays, so
// those 48 would still have gone red in Plan E's redraw. The thornveil test
// above only ever exercised the zone half. This is the town half, and without
// the `resolvedKind` fix it FAILS (measured: `FAIL spine-alias: bestiary.json
// region "rooktide": neither n-rooktide (spine) nor "rooktide" (resolved
// world) exists`, on a fixture where loadPlaces resolves 0 problems and lists
// "rooktide" among its 6 towns).
t11("alias sweep: a TOWN-tier slug with no spine node resolves through the world document too", () => {
  const dir = aliasContentCopy();
  // Plan D Task 11: the town half answers with a GENERATED settlement id —
  // the resolved towns array carries c-town-* pins, none of which answer to
  // an `n-<slug>` spine node.
  const bestiary = join(dir, "content/bestiary/bestiary.json");
  const rows = JSON.parse(readFileSync(bestiary, "utf8"));
  rows[0].region = "c-town-tallowquay";
  writeFileSync(bestiary, JSON.stringify(rows, null, 2) + "\n");
  const r = runAliasGate(dir);
  assert11.doesNotMatch(r.out, /spine-alias: bestiary\.json region "c-town-tallowquay": /);
  assert11.match(r.out, /spine-alias: bestiary\.json region "c-town-tallowquay" ×\d+ → c-town-tallowquay \(resolved-town\)/);
});

// ── F-043 Task 4: G-ATLAS-ROLLUP — the world rollup is pinned to committed
// composition (±2pp), independent of G-COMP-ROLLUP's looser per-node
// tolerance. Red fixture: g-atlas-rollup-drift/ (copied from base/, world
// root n-w flipped to interstitialUnsurveyed:false with a committed
// composition 4pp off its true rollup). Green half runs the real content
// root — valid only once Task 3's n-atlas promotion has landed.
test("G-ATLAS-ROLLUP red: world rollup off committed composition by >2pp", () => {
  const { code, stdout } = runGate(contentRootFor("g-atlas-rollup-drift"));
  assert.equal(code, 1, stdout);
  assert.match(stdout, /FAIL {2}G-ATLAS-ROLLUP: /);
});

test("G-ATLAS-ROLLUP green: the committed content passes", () => {
  const { code, stdout } = runGate(join(ROOT, "content"));
  assert.equal(code, 0, stdout);
});

// ─── Plan A Task 3 review fix (d): message ORDER under the bbox index ───────
// The two literal fixtures above pin a TWO-child parent, where there is only
// one pair and therefore no order to get wrong. The index's real risk (plan
// Risk A8) is that it turns the pair walk into an index-driven one and
// reorders G-OVERLAP reports — only ~2 of the ~130 possible messages are
// pinned anywhere, so a reordering would ship silently. This fixture gives
// n-c FIVE children: three mutually overlapping (n-r, n-r2, n-r3) and two
// sitting far away inside n-c (n-r4, n-r5). Ten pairs, three reported, seven
// skipped by the index — so the index is demonstrably doing work AND the
// surviving reports must still come out in outer-i<j order.
t11("G-OVERLAP order: three overlapping children report in i<j order, index or not", () => {
  const r = runSpineGate(spineFixture({ overlayDir: null, mutate: (dir) => {
    const base = JSON.parse(read11(join11(dir, "spine/nodes/n-r.json"), "utf8"));
    const mk = (id, seed, points) => {
      const n = { ...base, id, seed: { value: seed, epoch: 0, why: null } };
      n.placement = { shape: "polygon", points, anchor: points[0] };
      write11(join11(dir, `spine/nodes/${id}.json`), JSON.stringify(n, null, 2) + "\n");
    };
    mk("n-r2", "52fc1fdd51a099d7", [[25, 25], [45, 25], [45, 45], [25, 45]]);
    mk("n-r3", "62fc1fdd51a099d7", [[30, 30], [50, 30], [50, 50], [30, 50]]);
    mk("n-r4", "72fc1fdd51a099d7", [[70, 70], [85, 70], [85, 85], [70, 85]]);
    mk("n-r5", "82fc1fdd51a099d7", [[70, 20], [85, 20], [85, 35], [70, 35]]);
    exec11(process.execPath, [EMIT, "--write", "--content-root", dir]);
  } }));
  assert11.equal(r.code, 1);
  // deepEqual on the ORDERED list, not three independent `match`es: a match
  // sweep passes no matter what order the lines came out in.
  assert11.deepEqual(
    r.out.split("\n").filter((l) => l.includes("G-OVERLAP")).map((l) => l.trim()),
    [
      "FAIL  spine: G-OVERLAP n-r ∩ n-r2: 225.0 over limit 2.0",
      "FAIL  spine: G-OVERLAP n-r ∩ n-r3: 100.0 over limit 2.0",
      "FAIL  spine: G-OVERLAP n-r2 ∩ n-r3: 225.0 over limit 2.0",
      "FAIL  spine: G-OVERLAP n-c: children double-count 550.0 (limit 32.0)",
    ],
  );
});

// ─── Plan A review round 3 · G-RING-SIMPLE and G-RECT ──────────────────────
// The per-PAIR triangulability report pinned above only fires at stage 3 of
// exactIntersectionArea — after a bbox overlap AND a failed ringsDisjoint().
// Every fixture below is a ring the kernel refuses (or mis-measures) that the
// pair path CANNOT reach, and each one exited 0 with no output at all before
// G-RING-SIMPLE existed. Delete the rule in check_content.mjs and all four go
// green again; that is the mutation test these exist to survive.
t11("G-RING-SIMPLE red: an ONLY-CHILD unsound ring fails — no sibling needed", () => {
  const r = runSpineGate(spineFixture({ overlayDir: null, mutate: (dir) => {
    const p = join11(dir, "spine/nodes/n-r.json");
    const doc = JSON.parse(read11(p, "utf8"));
    // [50,20] sits on the INTERIOR of the non-adjacent edge [20,20]→[80,20].
    // G-POLY green: 5 points, open, no repeated consecutive point, shoelace
    // +1200, selfIntersects() sees no PROPER crossing. earClip finds no ear.
    doc.placement = { shape: "polygon", points: [[20, 20], [80, 20], [80, 60], [50, 20], [20, 60]], anchor: [30, 30] };
    write11(p, JSON.stringify(doc, null, 2) + "\n");
    exec11(process.execPath, [EMIT, "--write", "--content-root", dir]);
  } }));
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-RING-SIMPLE: n-r: non-adjacent edges meet/);
  assert11.doesNotMatch(r.out, /G-POLY: n-r:/); // the gap this rule exists to cover
  assert11.doesNotMatch(r.out, /G-OVERLAP n-r: not triangulable/); // unreachable: no sibling
});
t11("G-RING-SIMPLE red: an unsound ring beside a NON-meeting sibling fails", () => {
  const r = runSpineGate(spineFixture({ overlayDir: null, mutate: (dir) => {
    const base = JSON.parse(read11(join11(dir, "spine/nodes/n-r.json"), "utf8"));
    const mk = (id, seed, points, anchor) => {
      const n = { ...base, id, seed: { value: seed, epoch: 0, why: null } };
      n.placement = { shape: "polygon", points, anchor };
      write11(join11(dir, `spine/nodes/${id}.json`), JSON.stringify(n, null, 2) + "\n");
    };
    // Bboxes strictly overlap on both axes, so neither the stage-1 reject nor
    // any candidate filter skips the pair — but the rings do not meet, so
    // ringsDisjoint() returns before triangulation is ever attempted.
    mk("n-r", "42fc1fdd51a099d7", [[20, 20], [40, 20], [40, 40], [20, 40]], [30, 30]);
    mk("n-r2", "52fc1fdd51a099d7", [[55, 35], [85, 35], [85, 85], [60, 35], [35, 85], [35, 55]], [78, 50]);
    exec11(process.execPath, [EMIT, "--write", "--content-root", dir]);
  } }));
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-RING-SIMPLE: n-r2: non-adjacent edges meet/);
  assert11.doesNotMatch(r.out, /G-OVERLAP n-r2: not triangulable/); // unreachable: rings do not meet
});
t11("G-RING-SIMPLE red: overlapping lobes — the shape the area identity passes", () => {
  const r = runSpineGate(spineFixture({ overlayDir: null, mutate: (dir) => {
    const p = join11(dir, "spine/nodes/n-r.json");
    const doc = JSON.parse(read11(p, "utf8"));
    // The ring revisits [20,20], and splitAtRepeat cuts it into two lobes that
    // cover the same ground TWICE. Ear clipping returns positively-wound
    // triangles whose shoelaces sum to the ring's own — so triangulateOrNull's
    // conservation check PASSES and no `problems` entry is ever emitted —
    // while the true covered area is a third of the number reported. Only a
    // STRUCTURAL rule catches this; the area identity cannot police itself,
    // because the shoelace double-counts a doubly-wound region too.
    doc.placement = { shape: "polygon", points: [[20, 20], [80, 20], [80, 80], [20, 80], [20, 20], [30, 30], [70, 30], [70, 70], [30, 70]], anchor: [25, 50] };
    write11(p, JSON.stringify(doc, null, 2) + "\n");
    exec11(process.execPath, [EMIT, "--write", "--content-root", dir]);
  } }));
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-RING-SIMPLE: n-r: non-adjacent edges meet/);
  assert11.doesNotMatch(r.out, /G-POLY: n-r:/);
});
t11("G-RECT red: a rect with both extents negative fails", () => {
  const r = runSpineGate(spineFixture({ overlayDir: null, mutate: (dir) => {
    const p = join11(dir, "spine/nodes/n-r.json");
    const doc = JSON.parse(read11(p, "utf8"));
    // Both negative winds the ring POSITIVELY over [10,30]x[10,30], so the
    // exact kernel reports a real area there while the grid sampler reports 0.
    doc.placement = { shape: "rect", rect: { x: 30, y: 30, w: -20, h: -20 }, anchor: [20, 20] };
    write11(p, JSON.stringify(doc, null, 2) + "\n");
    exec11(process.execPath, [EMIT, "--write", "--content-root", dir]);
  } }));
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-RECT: n-r: rect extent w=-20 h=-20/);
});

// ─── Plan A Task 7 · the sheet subject descriptor ───────────────────────────
// Built on a real content copy, NOT on the `base` fixture: base's nodes are
// n-c/n-r/n-w, so it has no zoneRoot at all and nothing resolves a world —
// the test would prove nothing. Only spine/sheet.json is overwritten, so the
// ONLY difference from a green run is the bad subject.
//
// PLAN A TASK 12 RE-POINT, and the reason matters. These three ran the EMITTER
// (check_spine_emit.mjs), because check_spine_emit.mjs called resolveWorld() to
// write content/maps/cluster1-geography.json. Task 12 deleted that mirror and
// with it the emitter's only call into places.mjs, so run against the emitter
// these tests would have gone quietly vacuous — exit 1 for unrelated reasons,
// asserting on messages nothing prints any more. The descriptor is now
// validated where it is actually consumed: check_content.mjs's placesDoc(),
// which fail()s every problem loadPlaces reports. Same three messages, same
// no-TypeError contract, one binary downstream. Verified by running the full
// gate on each fixture by hand before this edit.
function realContentCopy() {
  const dir = mkdtemp11(join11(tmp11(), "sheet-subject-"));
  for (const sub of ["spine", "schemas", "zones", "towns", "characters"])
    cp11(join11(ROOT11, "content", sub), join11(dir, sub), { recursive: true });
  return dir;
}
// ─── sheet-subject diagnoses ────────────────────────────────────────────────
// Plan D Task 11: check_content's geography source is content/world/resolved/,
// so these three descriptor faults are no longer reachable through a gate
// spawn — the gate never resolves the spine for geography. The diagnoses
// themselves moved home with their only consumers: resolveWorld(), called by
// the sheet builders (render-sheet / basin-sheet), where each is still pinned
// in-process.

t11("sheet subjects: a descriptor naming a missing node REPORTS, never a raw TypeError", () => {
  const dir = realContentCopy();
  cp11(join11(FIX, "g-sheet-subject-missing"), dir, { recursive: true });
  const spine = loadSpine({ contentRoot: dir });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const { doc, problems } = resolveWorld({ spine, tree });
  assert11.equal(doc, null);
  assert11.ok(problems.some((p) => p.includes('subject "mireIds[0]" -> "n-not-a-node" does not resolve')),
    JSON.stringify(problems));
});

t11("sheet subjects: a spine whose sheet.json has NO subjects block REPORTS", () => {
  // The other half of "the ids are data": deleting the descriptor must be a
  // named diagnosis, not a crash. Plan A Task 12 routed this through
  // loadPlaces; Plan D Task 11 removed that module's spine branch entirely,
  // so it is pinned from resolveWorld directly.
  const dir = realContentCopy();
  const p = join11(dir, "spine/sheet.json");
  const doc = JSON.parse(read11(p, "utf8"));
  delete doc.subjects;
  write11(p, JSON.stringify(doc, null, 2) + "\n");
  const spine = loadSpine({ contentRoot: dir });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const { doc: d, problems } = resolveWorld({ spine, tree });
  assert11.equal(d, null);
  assert11.deepEqual(problems, [
    "sheet: content/spine/sheet.json has no `subjects` descriptor — the sheet's subject ids are DATA, not code",
  ]);
});

// PLAN E RULING 8 (Task 6). R3 — "a region without a lore.order is REPORTED,
// not silently dropped" — used to be exercised on the REAL content root, by
// deleting `lore.order` from n-thornveil and running resolveWorld over the
// committed basin. There is no committed basin any more: the redrawn 36-node
// trunk hosts none of the five subjects the descriptor named, ruling 8's tail
// retired those keys from content/spine/sheet.json, and resolveWorld now
// returns three shape diagnoses before it ever reaches a region.
//
// Re-pointing the mutation at some surviving node would have left a test that
// passes while proving nothing — the early return makes any region mutation a
// no-op — which is precisely the failure this repo has a standing rule about
// (see the twelve retired tests documented at the head of places.test.mjs).
//
// So the subject moves to a basin resolveWorld CAN resolve: a synthetic one,
// built here in memory, the same clone-and-inject pattern the atlas sheet's
// landformTree()/harbourTree() fixtures use. Two consequences worth stating:
// the numbers below are the fixture's and not world density's, and the control
// test — resolveWorld returning a document with ZERO problems — is what makes
// the mutation test's red mean "the rule fired" rather than "the fixture is
// broken". Nothing about R3 depends on the real world's shape, so nothing real
// is lost; what is gained is that R3 stays armed while the basin is dormant.
function syntheticBasin() {
  const poly = (x, y) => [[x, y], [x + 4, y], [x + 4, y + 4], [x, y + 4]];
  const region = (id, order) => ({
    id, tier: "region", parentId: "n-basin", title: id.slice(2), tags: [],
    terrainKind: "meadow", levelBand: [1, 10], bands: [],
    placement: { shape: "polygon", points: poly(order * 5, 0), anchor: [order * 5 + 2, 2] },
    lore: { order, labelAt: [order * 5 + 2, 2], note: `${id} note` },
  });
  const C = {
    id: "n-basin", tier: "continent", parentId: null, title: "The Basin", tags: [],
    placement: { shape: "polygon", points: poly(0, 0), anchor: [0, 0] },
    features: [
      { id: "f-coast", kind: "line", attrs: { note: "the drawn coast" }, points: [[0, 0], [0, 20]] },
      { id: "f-river", kind: "line", points: [[2, 0], [2, 20]],
        attrs: { name: "The River", note: "n", reaches: [], labelAt: [2, 10],
                 tidalLimit: [2, 6], ford: [2, 12] } },
      { id: "f-ice", kind: "line", attrs: { note: "the shelf lip", hardEdgeAtY: 0 }, points: [[0, 0], [20, 0]] },
      { id: "f-far", kind: "point", at: [40, 40], attrs: {} },
    ],
    lore: {
      relay: { owner: "the fixture", spacingKm: 10, note: "n", derivation: "d", withheld: [] },
      distances: { paceKmPerHour: 4, drawnRoadsAreCentrelines: true },
    },
  };
  const mire = { id: "n-mire", tier: "region", parentId: "n-basin", title: "The Mire", tags: [],
    placement: { shape: "polygon", points: poly(0, 10), anchor: [2, 12] },
    lore: { geoId: "the-mire", note: "brackish" } };
  const hills = { id: "n-hills", tier: "region", parentId: "n-basin", title: "The Hills", tags: [],
    terrainKind: "rock", placement: { shape: "polygon", points: poly(10, 10), anchor: [12, 12] },
    lore: { labelAt: [12, 12], note: "stony" } };
  const nodes = [C, mire, hills, region("n-zone-a", 1), region("n-zone-b", 2)];
  const tree = {
    byId: new Map(nodes.map((n) => [n.id, structuredClone(n)])),
    childrenOf: new Map([["n-basin", ["n-mire", "n-hills", "n-zone-a", "n-zone-b"]],
      ["n-mire", []], ["n-hills", []], ["n-zone-a", []], ["n-zone-b", []]]),
  };
  const spine = {
    sheet: { title: "fixture", subjects: null },
    edges: [{ id: "e-lane", kind: "sealane", from: { node: "n-basin" }, to: { feature: "f-far" },
      attrs: { note: "out and back", label: "the lane" }, points: [[0, 0], [40, 40]] }],
  };
  const descriptor = {
    rootId: "n-basin", zoneRoot: "n-basin", landIds: ["n-basin"], seaIds: [],
    mireIds: ["n-mire"], terrainPatchIds: ["n-hills"],
    featureIds: { coast: "f-coast", river: "f-river", iceEdge: "f-ice" },
  };
  return { spine, tree, descriptor };
}

t11("sheet subjects: the CONTROL — resolveWorld assembles a basin it can resolve with zero problems", () => {
  const { spine, tree, descriptor } = syntheticBasin();
  const { doc, problems } = resolveWorld({ spine, tree, descriptor });
  assert11.deepEqual(problems, []);
  assert11.ok(doc, "the synthetic basin did not assemble");
  assert11.deepEqual(doc.zones.map((z) => z.id), ["zone-a", "zone-b"]);
  assert11.equal(doc.saltmire.id, "the-mire");
  assert11.equal(doc.terrainPatches[0].id, "hills");
});

t11("sheet subjects: a zone region losing its lore.order REPORTS instead of vanishing", () => {
  // R3 end-to-end. Before Task 7 this produced a mirror with NINE zones and
  // exit 0 — the region did not fail, it ceased to exist.
  const { spine, tree, descriptor } = syntheticBasin();
  delete tree.byId.get("n-zone-b").lore.order;
  const { doc: d, problems } = resolveWorld({ spine, tree, descriptor });
  assert11.equal(d, null, "the region vanished silently instead of being reported");
  assert11.doesNotMatch(JSON.stringify(problems), /TypeError/);
  assert11.ok(problems.some((x) => x.includes("has no lore.order")), JSON.stringify(problems));
  assert11.ok(problems.some((x) => x.includes("n-zone-b")), JSON.stringify(problems));
});

// ─── Plan A Task 13: in-process gate runs ──────────────────────────────────
// 66 child-process spawns, ~0.38 s each of pure Node startup + ajv compile,
// is 93.3 s of a 108 s content-gate suite. The gate's own tests cost more
// than the gate. These pin the in-process entry's contract: identical
// {code, out} shape, and no state leaking between runs.
// `runSpineGateInProcess` is imported statically at the top of this file.

t11("in-process: a green fixture returns code 0 and the same summary line as a spawn", () => {
  const dir = spineFixture();
  const inproc = runSpineGateInProcess({ argv: ["--content-root", dir, "--only=spine"] });
  const spawned = (() => {
    try { return { code: 0, out: exec11(process.execPath, [GATE11, "--only=spine", "--content-root", dir], { encoding: "utf8" }) }; }
    catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
  })();
  assert11.equal(inproc.code, spawned.code);
  assert11.equal(inproc.out, spawned.out);
});

t11("in-process: a red fixture returns code 1 and the same output as a spawn", () => {
  const dir = spineFixture({ overlayDir: "g-contain-child-outside" });
  const inproc = runSpineGateInProcess({ argv: ["--content-root", dir, "--only=spine"] });
  const spawned = (() => {
    try { return { code: 0, out: exec11(process.execPath, [GATE11, "--only=spine", "--content-root", dir], { encoding: "utf8" }) }; }
    catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
  })();
  assert11.equal(inproc.code, 1);
  assert11.equal(inproc.out, spawned.out);
});

t11("in-process: failures do NOT leak from one run into the next", () => {
  const red = spineFixture({ overlayDir: "g-contain-child-outside" });
  const green = spineFixture();
  assert11.equal(runSpineGateInProcess({ argv: ["--content-root", red, "--only=spine"] }).code, 1);
  const second = runSpineGateInProcess({ argv: ["--content-root", green, "--only=spine"] });
  assert11.equal(second.code, 0, second.out);
  assert11.doesNotMatch(second.out, /G-CONTAIN/);
});

t11("in-process: importing check_content.mjs does NOT run the gate", () => {
  // Before this task the file ended in a bare `main();` — importing it ran
  // the whole gate against the real content root and called process.exit().
  // The entry guard is what makes every other test in this block possible.
  const src = read11(join11(ROOT11, "scripts/check_content.mjs"), "utf8");
  assert11.match(src, /if \(process\.argv\[1\] && import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href\) main\(\);/);
  assert11.doesNotMatch(src, /^main\(\);$/m);
});

// The two tests above cover `failures`/`warnings`. Risk A7's quieter half is
// the two MEMOS. Both are keyed by content root, so the naive reading —
// "cross-root reuse is impossible, therefore they are safe" — is true and
// beside the point: the leak is SAME-root re-entry. Each memo short-circuits
// BEFORE the fail() calls that populate it, so run two of the same root prints
// fewer failures than run one, and fewer than a spawn. Both are pinned by the
// same rule (two runs of one root are byte-identical) because that is the rule
// a future edit would break, and both were mutation-checked: deleting the
// matching reset line in runSpineGateInProcess turns each of these red
// (2 FAILs -> 1, and 1 geography FAIL -> 0 respectively).

t11("in-process: townPlansCache does NOT leak — an unparsable town plan FAILs on EVERY run", () => {
  const dir = spineFixture();
  cp11(join11(ROOT11, "content/schemas/town-plan.schema.json"), join11(dir, "schemas/town-plan.schema.json"));
  mkdirSync(join11(dir, "towns"), { recursive: true });
  // readTownPlans only reads /^town-.+\.json$/ — a differently-named file is
  // invisible to the loader and would make this test pass for no reason.
  write11(join11(dir, "towns/town-broken.json"), "{ not json");
  const first = runSpineGateInProcess({ argv: ["--content-root", dir, "--only=spine"] });
  const second = runSpineGateInProcess({ argv: ["--content-root", dir, "--only=spine"] });
  const failsOf = (r) => r.out.split("\n").filter((l) => l.startsWith("FAIL  towns/town-broken.json: cannot read/parse"));
  assert11.equal(first.code, 1, first.out);
  assert11.equal(failsOf(first).length, 1, first.out);
  assert11.equal(failsOf(second).length, 1, second.out);
  assert11.equal(second.out, first.out);
});

t11("in-process: placesByRoot does NOT leak — a geography problem FAILs on EVERY run", () => {
  // Reaching placesDoc() under --only=spine needs BOTH halves, and the test is
  // vacuous without either: (1) an alias that MISSES the spine, which is what
  // sends checkSpineExternalAliases down its resolvedWorld() second chance,
  // and (2) a content root loadPlaces cannot resolve, so there is a problem to
  // swallow. The rename in (1) is main()'s own documented reproduction.
  // Plan D Task 11: loadPlaces reads content/world/resolved/ only, and the
  // problem it reports for a root without one names the directory.
  const dir = realContentCopy();
  cp11(join11(ROOT11, "content/bestiary"), join11(dir, "bestiary"), { recursive: true });
  // PLAN E: the rename used to be n-rooktide, which the redraw retired — every
  // basin town but Millcross is a resolved-world pin now (E-C4). n-millcross is
  // the surviving node that two live aliases still name (`region-millcross` and
  // content/towns/town-millcross.json's spineId), so renaming IT is what still
  // makes an alias MISS the spine and take the resolvedWorld() second chance
  // this test is about. Half (1) of the test's own preamble, unchanged in kind.
  const from = join11(dir, "spine/nodes/n-millcross.json");
  const doc = JSON.parse(read11(from, "utf8"));
  doc.id = "n-millcross-town";
  write11(join11(dir, "spine/nodes/n-millcross-town.json"), JSON.stringify(doc, null, 2) + "\n");
  rmSync(from);
  rmSync(join11(dir, "spine/sheet.json"), { force: true });
  const first = runSpineGateInProcess({ argv: ["--only=spine", "--content-root", dir] });
  const second = runSpineGateInProcess({ argv: ["--only=spine", "--content-root", dir] });
  const geoOf = (r) => r.out.split("\n").filter((l) => /^FAIL {2}geography: .* holds no continent files/.test(l));
  assert11.equal(geoOf(first).length, 1, first.out);
  assert11.equal(geoOf(second).length, 1, second.out);
  assert11.equal(second.out, first.out);
});

t11("in-process: no test in this file is async — the console capture's safety argument depends on it", () => {
  // runSpineGateInProcess swaps console.log/console.error and restores them in
  // a `finally`. That is safe against interleaving for ONE reason: the call and
  // its caller are both synchronous, so nothing can run in between — a stronger
  // guarantee than any --test-concurrency setting. The moment a test in this
  // file becomes `async`, that reasoning lapses silently and a concurrent
  // test's output could land in another test's captured buffer. This pins the
  // premise so the lapse cannot be silent.
  const src = read11(join11(ROOT11, "scripts/tests/spine-gates.test.mjs"), "utf8");
  assert11.doesNotMatch(src, /,\s*async\s*\(/);
});

t11("in-process: a bad flag returns code 2 like a spawn, instead of killing the test runner", () => {
  // Review finding 2. parseArgs used to `console.error(...) + process.exit(2)`
  // unconditionally; in-process that is uncatchable, skips the `finally` that
  // restores console, and takes the runner down — `node --test` then reports
  // ONE synthetic "test failed" and ERASES the tests that had already passed
  // from the totals. The three arg-error sites now exit only when
  // check_content.mjs is the CLI entry, and throw otherwise.
  const dir = spineFixture();
  const argv = ["--content-root", dir, "--only=spine", "--nonsense"];
  const inproc = runSpineGateInProcess({ argv });
  const spawned = (() => {
    try { return { code: 0, out: exec11(process.execPath, [GATE11, ...argv], { encoding: "utf8" }) }; }
    catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
  })();
  assert11.equal(spawned.code, 2, spawned.out);   // the behaviour being matched, not a constant
  assert11.equal(inproc.code, 2, inproc.out);
  assert11.equal(inproc.out, spawned.out);
  // The runner is still alive and the console still works: this assertion, and
  // every test after it, only run at all because process.exit() did not fire.
  assert11.equal(runSpineGateInProcess({ argv: ["--content-root", dir, "--only=spine"] }).code, 0);
});

t11("in-process: an unsupported --only value also returns 2, and --only=spine is still required", () => {
  const dir = spineFixture();
  // Rejected by parseArgs -> ArgError -> code 2, same as a spawn.
  assert11.equal(runSpineGateInProcess({ argv: ["--content-root", dir, "--only=full"] }).code, 2);
  // Rejected by runSpineGateInProcess' own --only=spine-only contract. NOT a
  // spawn-equivalent case by design: a spawn with no --only runs the full
  // sweep. The plan refuses that here, so it is code 1 with the refusal named.
  const none = runSpineGateInProcess({ argv: ["--content-root", dir] });
  assert11.equal(none.code, 1);
  assert11.match(none.out, /supports --only=spine only/);
  // A supported input must not answer with a stack trace. This is the whole
  // point of ModeError having its own branch rather than falling into the
  // gate-threw one — collapse the two and this assertion goes red.
  assert11.equal(none.out, "check-content: runSpineGateInProcess supports --only=spine only\n");
  assert11.doesNotMatch(none.out, /\n {4}at |check_content\.mjs:\d+/);
});

// ─── Plan B Task 4 · derived hoisted to content/spine/derived.json ──────────
// The block that used to sit inline in all 44 node files is now ONE sidecar,
// content/spine/derived.json, emitted by check_spine_emit and byte-compared
// whole by G-DERIVED-DRIFT. Three independent things make a leftover inline
// block loud: the emitter's NODE_FIELDS whitelist, the node schema's closed
// root, and this gate.
t11("no committed node file carries an inline derived block", () => {
  const dir = join11(ROOT11, "content/spine/nodes");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const doc = JSON.parse(read11(join11(dir, f), "utf8"));
    assert11.equal(doc.derived, undefined, `${f} still carries derived`);
  }
});

t11("the sidecar covers exactly the committed node ids, in ascending order", () => {
  const ids = readdirSync(join11(ROOT11, "content/spine/nodes"))
    .filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
  const side = JSON.parse(read11(join11(ROOT11, "content/spine/derived.json"), "utf8"));
  assert11.deepEqual(Object.keys(side), ids);
  for (const id of ids)
    assert11.ok(typeof side[id].digest === "string" && side[id].digest.startsWith("sha256:"), id);
});

t11("spine-emit --write emits the sidecar and --check is green after it", () => {
  const dir = realSpineCopy();
  assert11.equal(runEmit(dir, ["--write"]).code, 0);
  const first = read11(join11(dir, "spine/derived.json"), "utf8");
  assert11.equal(runEmit(dir, ["--write"]).code, 0);
  assert11.equal(read11(join11(dir, "spine/derived.json"), "utf8"), first, "not idempotent");
  assert11.equal(runEmit(dir, ["--check"]).code, 0);
});

// The emitter's half of the whitelist: a node file that still carries an
// inline `derived` is an EMITTER error, not a silently-stripped field.
t11("spine-emit rejects a node file that still carries an inline derived block", () => {
  const dir = realSpineCopy();
  assert11.equal(runEmit(dir, ["--write"]).code, 0);
  const p = join11(dir, "spine/nodes/n-cluster1.json");
  const doc = JSON.parse(read11(p, "utf8"));
  doc.derived = { anything: 1 };
  write11(p, JSON.stringify(doc, null, 2) + "\n");
  const r = runEmit(dir, ["--check"]);
  assert11.equal(r.code, 1);
  assert11.match(r.out, /n-cluster1: unknown fields derived/);
});

t11("G-DERIVED-DRIFT red: one hand-edited number in the sidecar", () => {
  const dir = spineFixture({ mutate: (d) => {
    const p = join11(d, "spine/derived.json");
    const side = JSON.parse(read11(p, "utf8"));
    side[Object.keys(side)[0]].coveragePct = 99.9;
    write11(p, JSON.stringify(side, null, 2) + "\n");
  } });
  const r = runSpineGate(dir);
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out,
    /G-DERIVED-DRIFT: content\/spine\/derived\.json differs from the recomputed block/);
  // Per-node diagnosability, given up when 44 messages became one and restored
  // in the seam-2 fix pass (migration review MINOR-2): a VALUE change leaves
  // both id sets equal, so without this the operator gets "differs" and a
  // 44-entry file to diff by hand.
  assert11.match(r.out, /— changed ids: n-/);
});

// The one no-throw branch in Task 4 with no test holding it in place: deleting
// the try/catch around readFileSync left all 817 tests green (coverage review
// M57). existsSync passes for a DIRECTORY and readFileSync then throws EISDIR;
// uncaught, that throw skips finish() and silently drops every failure
// recorded before it — the exact crash class seam 1 closed.
t11("G-DERIVED-DRIFT red, not a throw: the sidecar is a DIRECTORY (EISDIR)", () => {
  const dir = spineFixture({ mutate: (d) => {
    const p = join11(d, "spine/derived.json");
    rmSync(p);
    mkdirSync(p, { recursive: true });
  } });
  const r = runSpineGate(dir);
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-DERIVED-DRIFT: content\/spine\/derived\.json is unreadable: EISDIR/);
  // finish() ran: the summary line is its output, and no stack escaped.
  assert11.match(r.out, /content-gate: .* failures/);
  assert11.doesNotMatch(r.out, /check-content: \w*Error|\n\s+at /);
});

t11("G-DERIVED-DRIFT red: the sidecar is missing entirely", () => {
  const dir = spineFixture({ mutate: (d) => rmSync(join11(d, "spine/derived.json")) });
  const r = runSpineGate(dir);
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-DERIVED-DRIFT: content\/spine\/derived\.json is missing/);
});

t11("G-DERIVED-DRIFT red: a stale id left in the sidecar after a node is deleted", () => {
  const dir = spineFixture({ mutate: (d) => {
    const p = join11(d, "spine/derived.json");
    const side = JSON.parse(read11(p, "utf8"));
    side["n-ghost"] = side[Object.keys(side)[0]];
    write11(p, JSON.stringify(side, null, 2) + "\n");
  } });
  const r = runSpineGate(dir);
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-DERIVED-DRIFT: .* — stale ids: n-ghost/);
});

t11("G-DERIVED-DRIFT red: an id missing from the sidecar is named as missing", () => {
  const dir = spineFixture({ mutate: (d) => {
    const p = join11(d, "spine/derived.json");
    const side = JSON.parse(read11(p, "utf8"));
    delete side["n-r"];
    write11(p, JSON.stringify(side, null, 2) + "\n");
  } });
  const r = runSpineGate(dir);
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-DERIVED-DRIFT: .* — missing ids: n-r/);
});

// Gate functions never throw. A sidecar that is present but not parseable
// JSON must still produce ONE clean in-band line — an uncaught SyntaxError
// here would skip finish() and swallow every failure recorded before it.
t11("G-DERIVED-DRIFT red: a malformed sidecar fails in-band, no crash", () => {
  const dir = spineFixture({ mutate: (d) => write11(join11(d, "spine/derived.json"), "{ not json") });
  const r = runSpineGate(dir);
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /G-DERIVED-DRIFT: content\/spine\/derived\.json differs from the recomputed block/);
  assert11.match(r.out, /is not parseable JSON/);
  assert11.doesNotMatch(r.out, /SyntaxError|TypeError/);
});

// Soft-skip discipline, both halves. loadSpine must still answer present:false
// with NO errors for a content root that has no spine/ at all, and the derived
// key must be a harmless {} in that shape rather than undefined.
t11("loadSpine soft-skip: no spine/ dir is present:false, derived {}, zero errors", () => {
  const dir = mkdtemp11(join11(tmp11(), "spine-nospine-"));
  const s = loadSpine({ contentRoot: dir });
  assert11.equal(s.present, false);
  assert11.deepEqual(s.errors, []);
  assert11.deepEqual(s.derived, {});
});

// ...and a spine root that HAS nodes but no sidecar reads `derived: null` —
// ABSENT is distinguishable from present-but-empty, which is what lets
// G-DERIVED-DRIFT report "is missing" rather than a byte diff against "{}".
t11("loadSpine: a spine root with no derived.json reads derived: null, not an error", () => {
  const dir = spineFixture({ mutate: (d) => rmSync(join11(d, "spine/derived.json")) });
  const s = loadSpine({ contentRoot: dir });
  assert11.equal(s.present, true);
  assert11.equal(s.derived, null);
  assert11.deepEqual(s.errors, []);
});

// The node schema's half of the three-way enforcement. Removing the
// `derived` property from the closed root is what makes a leftover inline
// block a SCHEMA failure as well as an emitter one — put the property back
// and this test is the only thing that notices, which is the point: without
// it the schema edit was a green mutation.
t11("a node file carrying an inline derived block is a SCHEMA failure", () => {
  const dir = spineFixture({ mutate: (d) => {
    const p = join11(d, "spine/nodes/n-c.json");
    const doc = JSON.parse(read11(p, "utf8"));
    doc.derived = { areaParentUnits2: 1 };
    write11(p, JSON.stringify(doc, null, 2) + "\n");
  } });
  const r = runSpineGate(dir);
  assert11.equal(r.code, 1, r.out);
  assert11.match(r.out, /FAIL {2}spine\/nodes\/n-c\.json: schema \/ must NOT have additional properties/);
});

// The `tree.errors.length` bail in gSpineDerived, pinned. check_spine_emit's
// collectOutputs returns before writing ANY output when the tree is broken,
// so on a CYCLIC tree the sidecar legitimately does not exist — reporting
// "content/spine/derived.json is missing" there would be a second, false
// diagnosis stacked on the honest G-TREE one. Delete the bail and this goes
// red with exactly that spurious line.
//
// PLAN CORRECTION: Task 4's "Fixture safety" note names g-id-duplicate-id
// alongside g-tree-cycle as handled by this bail. It is not, and cannot be:
// buildTree treats a duplicate id as G-ID's business and keeps the FIRST
// occurrence, so tree.errors stays EMPTY and the bail never fires. The
// emitter would happily write a sidecar for that root, so the gate saying
// one is missing is agreement, not noise — the second half below pins that
// boundary so a future reader does not "fix" the bail to cover it.
t11("G-DERIVED-DRIFT stays silent on a CYCLIC tree — G-TREE is the honest failure", () => {
  const { code, stdout } = runGate(contentRootFor("g-tree-cycle"));
  assert11.equal(code, 1, stdout);
  assert11.doesNotMatch(stdout, /G-DERIVED-DRIFT/, "spurious G-DERIVED-DRIFT on a cyclic tree");
  assert11.match(stdout, /G-TREE: cycle detected/);
});

t11("...but a duplicate id leaves the tree valid, so the missing sidecar IS reported", () => {
  const { code, stdout } = runGate(contentRootFor("g-id-duplicate-id"));
  assert11.equal(code, 1, stdout);
  assert11.match(stdout, /G-ID: duplicate id/);
  assert11.match(stdout, /G-DERIVED-DRIFT: content\/spine\/derived\.json is missing/);
});
