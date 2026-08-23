// tools/mapforge/tests/repro.test.mjs — G-REPRO's THREE properties.
//
// generate-world.test.mjs asserts only the first, and it runs both generations
// on the same V8, so it cannot detect a cross-version divergence at all.
// Property 1 here is the same shape; properties 2 and 3 are new, and the CI
// Node (pinned in .release.json) is the one that matters — this file is inside
// `node --test tools/mapforge/tests/*.test.mjs`, which is a CI step and a
// Gate 2 section, so G-REPRO runs on the pinned Node by construction rather
// than by anyone remembering to.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { promoteWorld, REPLACED_FAMILIES } from "../promote-world.mjs";
import { ROOT, sharedRun, generateInto, scratchRepo, cleanup } from "./helpers/promote-fixture.mjs";
import { tmpdir } from "node:os";

after(cleanup);
const T = { timeout: 600000 };

// G-REPRO property 3 hashes the promoted tree. The set of directories it walks
// IS the definition of "the tree", so anything promotion writes but this omits
// is unguarded — the fixpoint claim would be true of a subset and false of the
// artifact. content/world/resolved/ is in the list because it is the ONLY file
// renderers read (D5); a stale one is a wrong drawing with a green hash.
// content/spine/derived.json is in it because step 3 writes it and nothing
// else in this list would notice if it stopped being written.
export const WORLD_DIGEST_INPUTS = Object.freeze([
  "content/spine/nodes",
  "content/spine/edges.json",
  "content/spine/derived.json",
  ...REPLACED_FAMILIES,
]);

// THE LIST IS DERIVED, NOT TRANSCRIBED — and the fourth property below cannot
// make it so.
//
// That property perturbs each MEMBER of this list, so it can only ever catch an
// entry that has gone DEAD. It can never catch an entry that has been REMOVED,
// because a removed entry is not iterated. MEASURED 2026-08-23: deleting
// `"content/world/resolved",` from the hand-written list left this file at
// 5/5 PASS — at exactly the entry whose own comment calls it the most dangerous
// one, because it is the only entry with ZERO files today and therefore the
// only one G-REPRO 3's exact `counted` floor cannot see either.
//
// So the three families promotion REPLACES are spread in from promote-world's
// own `REPLACED_FAMILIES` rather than retyped, and the three spine paths — the
// other half of promote's `toCopy`, plus the sidecar step 3 writes — are pinned
// by name and by length below. Adding a family to promotion now widens the
// fixpoint claim automatically; removing one from either side reds.
export const PROMOTION_SPINE_WRITES = Object.freeze([
  "content/spine/nodes",
  "content/spine/edges.json",
  "content/spine/derived.json",
]);

function walkFiles(dir, rel = "") {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.isDirectory()) out.push(...walkFiles(join(dir, e.name), `${rel}${e.name}/`));
    else out.push(`${rel}${e.name}`);
  }
  return out;
}

function treeHash(root, subpaths = WORLD_DIGEST_INPUTS) {
  const h = createHash("sha256");
  let counted = 0;
  for (const sub of subpaths) {
    const p = join(root, sub);
    if (!existsSync(p)) { h.update(`${sub}:ABSENT\n`); continue; }
    if (statSync(p).isDirectory())
      for (const f of walkFiles(p)) { h.update(`${sub}/${f}\n`); h.update(readFileSync(join(p, f))); counted++; }
    else { h.update(`${sub}\n`); h.update(readFileSync(p)); counted++; }
  }
  return { digest: h.digest("hex"), counted };
}

/** Every differing relative path under `sub`, or [] — never just the first. */
function diffTree(a, b, sub) {
  const pa = join(a, sub), pb = join(b, sub);
  if (!existsSync(pa) && !existsSync(pb)) return [];
  if (!existsSync(pa) || !existsSync(pb)) return [`${sub} exists on one side only`];
  const files = new Set([...walkFiles(pa), ...walkFiles(pb)]);
  const bad = [];
  for (const f of [...files].sort()) {
    let x = null, y = null;
    try { x = readFileSync(join(pa, f)); } catch { /* absent */ }
    try { y = readFileSync(join(pb, f)); } catch { /* absent */ }
    if (x === null || y === null || !x.equals(y)) bad.push(`${sub}/${f}`);
  }
  return bad;
}

// Everything a run writes that is a claim about the WORLD. `manifest.json` and
// `report.md` are deliberately outside it: both carry `timings`, so both differ
// on every re-run, neither is hashed by the run manifest and neither is
// promoted (STATE §16). Stating that here is what stops a future reader
// "fixing" a reproducibility test by narrowing it to the three easy dirs.
const RUN_COMPARED = ["content", "baseline", "sheets"];

test("G-REPRO 1: same seed, two scratch dirs, byte-identical", T, () => {
  const a = sharedRun();
  const b = realpathSync(mkdtempSync(join(tmpdir(), "repro-b-")));
  generateInto(b);
  const bad = RUN_COMPARED.flatMap((sub) => diffTree(a, b, sub));
  assert.deepEqual(bad, [], `G-REPRO: same seed, two scratch dirs differ at ${bad.join(", ")}`);
  // A comparison over an empty set is green for the wrong reason.
  assert.ok(walkFiles(join(a, "content")).length >= 72, "the run wrote fewer files than a complete content root");
});

test("G-REPRO 2: promotion does not change what the generator produces", T, () => {
  const run = sharedRun();
  const repo = scratchRepo();
  const r = promoteWorld({ repoRoot: repo, runDir: run });
  assert.equal(r.errors.length, 0, r.errors.join("\n"));
  const after = realpathSync(mkdtempSync(join(tmpdir(), "repro-after-")));
  generateInto(after, repo);       // regenerate FROM the promoted root
  for (const sub of ["content/world/fabric", "content/world/handles"]) {
    const bad = diffTree(run, after, sub);
    assert.deepEqual(bad, [], `G-REPRO: promotion changed generator output at ${bad.join(", ")}`);
  }
  // The drawings too: "two seeds sit side by side, diffable in place" is a
  // claim about what a human reviews, so the sheets must reproduce as well.
  // Plan C registers no draft sheet until Task 13 (`draftSheets` filters the
  // registry), so this is vacuous today and becomes live the moment the
  // `fabric` and `overlay` entries land — which is why the emptiness is
  // asserted rather than assumed.
  const sheetsPresent = existsSync(join(run, "sheets"));
  assert.deepEqual(diffTree(run, after, "sheets"), []);
  assert.equal(sheetsPresent, existsSync(join(after, "sheets")),
    "one run wrote draft sheets and the other did not");
});

test("G-REPRO 3: promotion is a fixpoint", T, () => {
  const run = sharedRun();
  const repo = scratchRepo();
  assert.equal(promoteWorld({ repoRoot: repo, runDir: run }).errors.length, 0);
  const h1 = treeHash(repo);
  assert.ok(h1.counted >= 36 + 1 + 1 + 14 + 13,
    `the fixpoint digest covers only ${h1.counted} files — it would be true of a subset`);
  assert.equal(promoteWorld({ repoRoot: repo, runDir: run }).errors.length, 0);
  const h2 = treeHash(repo);
  assert.equal(h1.digest, h2.digest, `G-REPRO: promotion is not a fixpoint — tree hash ${h1.digest} != ${h2.digest}`);
  assert.equal(h1.counted, h2.counted);
});

test("the digest's input list IS what promotion writes — it cannot silently shrink", () => {
  // The join the fourth property structurally cannot make. Both directions:
  // a family promotion replaces that the digest does not hash is a fixpoint
  // claim narrower than the artifact, and a digest entry naming nothing
  // promotion writes is a claim about someone else's files.
  for (const fam of REPLACED_FAMILIES)
    assert.ok(WORLD_DIGEST_INPUTS.includes(fam),
      `promote-world REPLACES ${fam} wholesale but the fixpoint digest does not hash it`);
  assert.deepEqual([...WORLD_DIGEST_INPUTS],
    [...PROMOTION_SPINE_WRITES, ...REPLACED_FAMILIES],
    "the digest's inputs are no longer exactly what promotion writes under content/");
  assert.equal(WORLD_DIGEST_INPUTS.length, 6,
    "the digest input list changed length — widen or narrow it deliberately, with a reason, not by editing an array");
  // The three spine paths are promote's `toCopy` minus the replaced families,
  // plus the sidecar step 3 writes. Asserted by NAME so a rename is visible.
  assert.deepEqual([...PROMOTION_SPINE_WRITES],
    ["content/spine/nodes", "content/spine/edges.json", "content/spine/derived.json"]);
});

test("the fixpoint digest would SEE a change in each of its inputs", T, () => {
  // A digest over a list is only as good as the list, and the failure mode is
  // silent: a path that is never present contributes the same "ABSENT" line
  // forever. Each input is perturbed in a scratch tree and must move the hash.
  const repo = scratchRepo();
  const base = treeHash(repo).digest;
  for (const sub of WORLD_DIGEST_INPUTS) {
    const p = join(repo, sub);
    const target = existsSync(p) && statSync(p).isDirectory()
      ? join(p, walkFiles(p)[0] ?? "planted.json")
      : p;
    const before = existsSync(target) ? readFileSync(target) : null;
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, (before ?? Buffer.from("")).toString() + "\n ");
    assert.notEqual(treeHash(repo).digest, base, `${sub} is in WORLD_DIGEST_INPUTS but changing it does not move the digest`);
    if (before === null) rmSync(target);
    else writeFileSync(target, before);
  }
  assert.equal(treeHash(repo).digest, base, "the perturbations were not fully undone");
});

test("the generator runs on the Node major pinned in .release.json", () => {
  const pin = JSON.parse(readFileSync(join(ROOT, ".release.json"), "utf8")).nodeMajor;
  assert.equal(typeof pin, "number", ".release.json has no nodeMajor pin");
  const running = Number(process.versions.node.split(".")[0]);
  if (running !== pin)
    console.log(`repro: NOTE — running Node ${running}, the pin is ${pin}. ` +
      `Byte identity is a VERSION-PINNED CONTRACT, not a portability claim: CI is the authority.`);
});
