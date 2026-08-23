// tools/mapforge/tests/promote.test.mjs — Plan C Task 12.
//
// Promotion is the one command in this plan that DELETES committed content, so
// every rule here is written from the harmful side: what would have to be true
// for a promotion to lose something.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { promoteWorld, classifyLiveNodes, parseArgs, listFiles, reportLines, REPLACED_FAMILIES } from "../promote-world.mjs";
import { ROOT, sharedRun, copyRun, scratchRepo, cleanup, scriptsAreLinked } from "./helpers/promote-fixture.mjs";

after(cleanup);

const T = { timeout: 300000 };
const nodesOf = (repo) => readdirSync(join(repo, "content/spine/nodes")).sort();
const shaOf = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const snap = (d) => readdirSync(d).sort().map((f) => `${f}:${readFileSync(join(d, f), "utf8")}`).join("\n");

// A live n-atlas descendant that the 36-file trunk census does NOT keep.
// NOT n-galereach, which the plan's own test names: n-galereach is a
// GENERATED ocean node — it exists only in the draft, so asserting the
// promoted root lacks it is vacuously true and proves no reconciliation.
// n-gildmark is a committed cluster-1 town the redraw deletes.
const STALE_LIVE_NODE = "n-gildmark.json";

test("the fixture repo links node_modules rather than copying 25 MB of them", T, () => {
  const repo = scratchRepo();
  assert.ok(scriptsAreLinked(repo), "the scratch repo cannot resolve ajv — check_content will not run in it");
  assert.ok(existsSync(join(repo, STALE_LIVE_NODE.replace(/^/, "content/spine/nodes/"))),
    "the scratch repo does not carry the live node the reconciliation tests delete");
});

test("promote --dry-run writes nothing and lists what it would do", T, () => {
  const repo = scratchRepo(), run = sharedRun();
  const before = nodesOf(repo);
  const emitBefore = readFileSync(join(repo, "colyseus-server/src/config/generated/mapDimensions.ts"), "utf8");
  const r = promoteWorld({ repoRoot: repo, runDir: run, dryRun: true });
  assert.deepEqual(nodesOf(repo), before, "dry run wrote files");
  assert.ok(r.written.length > 0);
  assert.ok(r.deleted.length > 0, "dry run reported no deletions — reconciliation is not happening");
  assert.equal(r.errors.length, 0, r.errors.join("; "));
  // It returns ABOVE step 3, so neither the derive-writer nor the renderer ran.
  assert.equal(readFileSync(join(repo, "colyseus-server/src/config/generated/mapDimensions.ts"), "utf8"), emitBefore);
  assert.deepEqual(r.notes, [], "a dry run produced notes — something after step 2 ran");
  assert.equal(existsSync(join(repo, "game-client/assets/art/maps")), false, "a dry run rendered a sheet");
});

test("promote RECONCILES: every n-atlas descendant absent from the draft is DELETED", T, () => {
  const repo = scratchRepo(), run = sharedRun();
  assert.ok(nodesOf(repo).includes(STALE_LIVE_NODE), "the fixture no longer carries the stale node");
  const r = promoteWorld({ repoRoot: repo, runDir: run });
  const after = new Set(nodesOf(repo));
  assert.ok(!after.has(STALE_LIVE_NODE), "a stale n-atlas descendant survived promotion");
  assert.ok(r.deleted.includes(`content/spine/nodes/${STALE_LIVE_NODE}`));
  assert.ok(after.has("n-atlas.json"));
  // The promoted node set IS the draft's node set — not a superset.
  assert.deepEqual(nodesOf(repo), readdirSync(join(run, "content/spine/nodes")).sort());
});

test("promote NEVER deletes the three alias-anchor chart nodes", T, () => {
  const repo = scratchRepo(), run = sharedRun();
  // n-site-thornveil -> n-thornveil and n-site-icefield -> n-northern-icefield
  // are representsNodeId pointers running FROM the runtime tree INTO the
  // chart; scripts/lib/spine.mjs pushes a hard G-ALIAS ERROR if either target
  // vanishes. town-millcross.json's spineId host is n-millcross.
  // Reconciliation deletes every n-atlas descendant absent from the DRAFT, so
  // the guarantee lives in generate-world's preservedChartNodes — this test is
  // what proves the two halves agree.
  const r = promoteWorld({ repoRoot: repo, runDir: run });
  for (const id of ["n-thornveil", "n-northern-icefield", "n-millcross"]) {
    assert.ok(!r.deleted.includes(`content/spine/nodes/${id}.json`), `${id} was deleted by promotion — G-ALIAS or T1 goes red`);
    assert.ok(existsSync(join(repo, `content/spine/nodes/${id}.json`)), `${id} is gone from the promoted root`);
  }
  assert.equal(r.errors.length, 0, r.errors.join("\n"));
});

test("promote replaces content/world/resolved/ wholesale, not incrementally", T, () => {
  const repo = scratchRepo(), run = copyRun();
  // A stale resolved file from an earlier seed must NOT survive a promotion.
  // content/world/resolved/ is the ONLY file renderers read (D5), so a stale
  // one means the drawn world is the previous seed's with every gate green.
  mkdirSync(join(repo, "content/world/resolved"), { recursive: true });
  writeFileSync(join(repo, "content/world/resolved/continent-99.json"), '{"continent":"c99"}\n');
  mkdirSync(join(run, "content/world/resolved"), { recursive: true });
  const rel = "content/world/resolved/continent-02.json";
  writeFileSync(join(run, rel), '{"continent":"c02"}\n');
  // The run manifest is the authority on what may be promoted, so a file added
  // to the draft must be added to its hash map too — that IS the guard the
  // next test drives from the harmful side.
  const manPath = join(run, "manifest.json");
  const man = JSON.parse(readFileSync(manPath, "utf8"));
  man.hashes[rel] = "sha256:" + shaOf(join(run, rel));
  writeFileSync(manPath, JSON.stringify(man, null, 2) + "\n");

  const r = promoteWorld({ repoRoot: repo, runDir: run });
  assert.equal(r.errors.length, 0, r.errors.join("\n"));
  assert.ok(r.deleted.includes("content/world/resolved/continent-99.json"), "the stale resolved file survived");
  assert.ok(!existsSync(join(repo, "content/world/resolved/continent-99.json")));
  assert.ok(existsSync(join(repo, rel)));
});

test("promote PRESERVES the runtime subtree and its edges, byte for byte", T, () => {
  const repo = scratchRepo(), run = sharedRun();
  const before = readFileSync(join(repo, "content/spine/nodes/n-playroot.json"), "utf8");
  const spawnBefore = readFileSync(join(repo, "content/spine/frozen-spawn-ids.json"), "utf8");
  promoteWorld({ repoRoot: repo, runDir: run });
  assert.equal(readFileSync(join(repo, "content/spine/nodes/n-playroot.json"), "utf8"), before,
    "the runtime root changed — the runtime is a NON-GOAL");
  assert.equal(readFileSync(join(repo, "content/spine/frozen-spawn-ids.json"), "utf8"), spawnBefore);
});

// The plan's test here asserts `doc.derived.digest` on every node file. That
// shape is GONE: Plan B Task 4 hoisted every node's `derived` block into the
// single sidecar content/spine/derived.json (which is why the emit census is
// 47 files and not 46). Asserting the old shape would red on correct content;
// asserting the sidecar is the same claim about the same emitter.
test("promote runs the derive-writer, so every promoted node is derived in the sidecar", T, () => {
  const repo = scratchRepo(), run = sharedRun();
  const sidecar = join(repo, "content/spine/derived.json");
  const before = readFileSync(sidecar, "utf8");
  const r = promoteWorld({ repoRoot: repo, runDir: run });
  assert.equal(r.errors.length, 0, r.errors.join("\n"));
  assert.ok(r.notes.some((n) => /^promote: spine-emit: write clean, \d+ files$/.test(n)), r.notes.join("\n"));
  const after = JSON.parse(readFileSync(sidecar, "utf8"));
  assert.notEqual(readFileSync(sidecar, "utf8"), before, "the sidecar was not rewritten — the derive-writer no-opped over a changed tree");
  for (const f of nodesOf(repo)) {
    const id = f.replace(/\.json$/, "");
    assert.ok(after[id] && typeof after[id].digest === "string", `${id} has no entry in content/spine/derived.json`);
  }
  for (const doc of nodesOf(repo).map((f) => JSON.parse(readFileSync(join(repo, "content/spine/nodes", f), "utf8"))))
    assert.equal(doc.derived, undefined, "a node file carries an inline `derived` block — Plan B Task 4 hoisted it into the sidecar");
});

test("promoting TWICE is a no-op — step 2 is a SET reconciliation", T, () => {
  const repo = scratchRepo(), run = sharedRun();
  promoteWorld({ repoRoot: repo, runDir: run });
  const a = snap(join(repo, "content/spine/nodes"));
  const r2 = promoteWorld({ repoRoot: repo, runDir: run });
  assert.equal(snap(join(repo, "content/spine/nodes")), a, "the second promotion changed the tree");
  assert.equal(r2.errors.length, 0, r2.errors.join("; "));
  assert.deepEqual(r2.deleted, [], "the second promotion still had something to delete");
});

test("promote refuses a draft whose files do not match its own manifest hashes", T, () => {
  const repo = scratchRepo(), run = copyRun();
  const p = join(run, "content/world/fabric/world.json");
  writeFileSync(p, readFileSync(p, "utf8").replace(/"seaLevel": [0-9.]+/, '"seaLevel": 9.99'));
  const r = promoteWorld({ repoRoot: repo, runDir: run, dryRun: true });
  assert.ok(r.errors.some((e) => /hash/i.test(e)), `no hash mismatch reported: ${JSON.stringify(r.errors)}`);
  assert.deepEqual(r.written, [], "a refused promotion still listed writes");
});

// ── THE STALE RIDER — the seam-6 hazard, closed at the consuming end ────────
test("promote refuses a draft file that the run manifest never hashed", T, () => {
  const repo = scratchRepo(), run = copyRun();
  // Exactly the seam-6 reproduction: a node file that survived into the draft
  // without the manifest ever seeing it. Every hash in the map still matches,
  // so the plan's one-directional check is GREEN on this root.
  writeFileSync(join(run, "content/spine/nodes/n-ZOMBIE.json"), '{"id":"n-ZOMBIE"}\n');
  const r = promoteWorld({ repoRoot: repo, runDir: run, dryRun: true });
  assert.ok(r.errors.some((e) => /n-ZOMBIE\.json is NOT in the run manifest/.test(e)),
    `the unhashed rider was not refused: ${JSON.stringify(r.errors)}`);
  assert.deepEqual(r.written, []);
  assert.equal(existsSync(join(repo, "content/spine/nodes/n-ZOMBIE.json")), false);
});

test("every file promotion copies is covered by the run manifest's hash map", T, () => {
  const repo = scratchRepo(), run = sharedRun();
  const hashes = JSON.parse(readFileSync(join(run, "manifest.json"), "utf8")).hashes;
  const r = promoteWorld({ repoRoot: repo, runDir: run, dryRun: true });
  assert.ok(r.written.length >= 36 + 1 + 14 + 13, `only ${r.written.length} files would be written`);
  for (const rel of r.written)
    assert.ok(Object.prototype.hasOwnProperty.call(hashes, rel), `${rel} is promoted but not hashed`);
  // …and the families it replaces are the ones it declares, not a longer list.
  const fams = new Set(r.written.filter((f) => f.startsWith("content/world/")).map((f) => f.split("/").slice(0, 3).join("/")));
  assert.deepEqual([...fams].sort(), REPLACED_FAMILIES.filter((f) => fams.has(f)).sort());
});

// ── EDGES ──────────────────────────────────────────────────────────────────
test("promote refuses to replace edges.json when the draft has dropped an authored edge", T, () => {
  const repo = scratchRepo(), run = copyRun();
  const p = join(run, "content/spine/edges.json");
  const edges = JSON.parse(readFileSync(p, "utf8"));
  const dropped = edges.shift();
  writeFileSync(p, JSON.stringify(edges, null, 2) + "\n");
  const man = JSON.parse(readFileSync(join(run, "manifest.json"), "utf8"));
  man.hashes["content/spine/edges.json"] = "sha256:" + shaOf(p);
  writeFileSync(join(run, "manifest.json"), JSON.stringify(man, null, 2) + "\n");
  const r = promoteWorld({ repoRoot: repo, runDir: run, dryRun: true });
  assert.ok(r.errors.some((e) => e.includes(`"${dropped.id}"`)),
    `dropping edge ${dropped.id} was not refused: ${JSON.stringify(r.errors)}`);
});

test("promote carries every authored edge forward, feature endpoints included", T, () => {
  const repo = scratchRepo(), run = sharedRun();
  const before = JSON.parse(readFileSync(join(repo, "content/spine/edges.json"), "utf8"));
  const featureEnders = before.filter((e) =>
    JSON.stringify(e).includes('"feature"'));
  assert.ok(featureEnders.length > 0, "the fixture has no feature-endpoint edge — this test proves nothing");
  promoteWorld({ repoRoot: repo, runDir: run });
  const after = JSON.parse(readFileSync(join(repo, "content/spine/edges.json"), "utf8"));
  const ids = new Set(after.map((e) => e.id));
  for (const e of before) assert.ok(ids.has(e.id), `authored edge ${e.id} was lost by promotion`);
});

// ── THE RECONCILIATION'S TWO TREE HAZARDS, driven directly ─────────────────
test("a node reachable from BOTH n-atlas and a runtime root is refused, not deleted", () => {
  const live = [
    { f: "n-atlas.json", doc: { id: "n-atlas", parentId: null } },
    { f: "n-playroot.json", doc: { id: "n-playroot", parentId: null } },
    { f: "n-c01.json", doc: { id: "n-c01", parentId: "n-atlas" } },
    // one file, two parents is impossible — but two files claiming the same id
    // under different roots is exactly what a bad rebase produces.
    { f: "dup.json", doc: { id: "n-c01", parentId: "n-playroot" } },
  ];
  const { problems } = classifyLiveNodes({ live, roots: ["n-atlas", "n-playroot"] });
  assert.ok(problems.some((p) => /reachable from BOTH/.test(p)), problems.join("; "));
});

test("a node with a dangling parentId is NAMED, not silently kept", () => {
  const live = [
    { f: "n-atlas.json", doc: { id: "n-atlas", parentId: null } },
    { f: "n-orphan.json", doc: { id: "n-orphan", parentId: "n-gone" } },
  ];
  const { problems, atlasIds } = classifyLiveNodes({ live, roots: ["n-atlas"] });
  assert.ok(problems.some((p) => /parentId "n-gone", which names no node/.test(p)), problems.join("; "));
  assert.ok(!atlasIds.has("n-orphan"), "an orphan was counted as the generator's territory");
});

test("a parent cycle REACHABLE FROM n-atlas does not hang the walk", () => {
  // The cycle has to be reachable or the guard is never exercised: a stray
  // a<->b pair off to one side terminates the walk trivially and the test is
  // green with the guard deleted. Two files claiming id "a" — one parented on
  // n-atlas, one on "b" — is what a bad rebase actually produces, and it makes
  // kids: n-atlas->[a], a->[b], b->[a].
  const live = [
    { f: "n-atlas.json", doc: { id: "n-atlas", parentId: null } },
    { f: "a.json", doc: { id: "a", parentId: "n-atlas" } },
    { f: "a-dup.json", doc: { id: "a", parentId: "b" } },
    { f: "b.json", doc: { id: "b", parentId: "a" } },
  ];
  const { atlasIds } = classifyLiveNodes({ live, roots: ["n-atlas"] });
  assert.deepEqual([...atlasIds].sort(), ["a", "b", "n-atlas"]);
});

test("roots.json that does not list n-atlas is refused", () => {
  const live = [{ f: "n-playroot.json", doc: { id: "n-playroot", parentId: null } }];
  const { problems } = classifyLiveNodes({ live, roots: ["n-playroot"] });
  assert.ok(problems.some((p) => /does not list n-atlas/.test(p)), problems.join("; "));
});

// ── THE GATE MUST NOT LOSE ITS REPORT (STATE §19) ──────────────────────────
test("step 5 records the gate's own summary line, so the step cannot become a no-op", T, () => {
  const repo = scratchRepo(), run = sharedRun();
  const r = promoteWorld({ repoRoot: repo, runDir: run });
  const gate = r.notes.find((n) => /gate exit/.test(n));
  assert.ok(gate, `no gate note: ${r.notes.join("\n")}`);
  assert.match(gate, /content-gate: .*\d+ failures/);
  // The promoted root reports the Plan C accounted set, and that is NOT an
  // error: 88 G-NET + 3 G-CANON-LEG on the carried canon (63 named work
  // orders) + 5 G-POI thin surveyed regions. Plan E's redraw clears them.
  const n = Number(/(\d+) failures/.exec(gate)[1]);
  assert.ok(n > 0, "the gate on a promoted Plan C world reported 0 failures — the accounted set has moved");
  assert.equal(r.errors.length, 0, r.errors.join("\n"));
});

test("step 4 renders every sheet in the registry, and a sheet drawn for the OLD trunk is a note not an error", T, () => {
  const repo = scratchRepo(), run = sharedRun();
  const r = promoteWorld({ repoRoot: repo, runDir: run });
  const rendered = r.notes.filter((n) => /^promote: render /.test(n));
  assert.ok(rendered.length >= 3, `only ${rendered.length} sheets were rendered: ${r.notes.join("\n")}`);
  assert.equal(r.errors.length, 0, r.errors.join("\n"));
});

// ── DISCIPLINE ─────────────────────────────────────────────────────────────
test("promoteWorld never shells out to git", () => {
  const src = readFileSync(join(ROOT, "tools/mapforge/promote-world.mjs"), "utf8");
  assert.ok(!/["'`\s]git[\s"'`]/.test(src.replace(/\/\/[^\n]*/g, "")),
    "promote-world.mjs names git outside a comment — it must work in a dirty worktree and must never mutate history");
});

test("promote-world.mjs never calls process.exit after printing", () => {
  const src = readFileSync(join(ROOT, "tools/mapforge/promote-world.mjs"), "utf8");
  assert.ok(!/process\.exit\(/.test(src.replace(/\/\/[^\n]*/g, "")),
    "process.exit() discards unflushed stdout on a pipe (STATE §19) — use process.exitCode");
});

test("parseArgs refuses a --from that ate the next flag, and an unknown arg", () => {
  const said = [];
  const fail = (m) => { said.push(m); };
  assert.equal(parseArgs(["--from", "--dry-run"], { fail }), null);
  assert.equal(parseArgs(["--from"], { fail }), null);
  assert.equal(parseArgs(["--dry-run"], { fail }), null);
  assert.equal(parseArgs(["--wat"], { fail }), null);
  assert.equal(said.length, 4, said.join(" | "));
  const ok = parseArgs(["--from", "/tmp/x", "--dry-run"], { fail });
  assert.equal(ok.dryRun, true);
  assert.match(ok.runDir, /\/tmp\/x$/);
});

test("promote refuses a run dir with no manifest, and one with an empty hash map", T, () => {
  const repo = scratchRepo(), run = copyRun();
  assert.match(promoteWorld({ repoRoot: repo, runDir: join(run, "nope") }).errors[0], /does not exist/);
  writeFileSync(join(run, "manifest.json"), '{"hashes":{}}\n');
  assert.ok(promoteWorld({ repoRoot: repo, runDir: run }).errors.some((e) => /lists no file hashes/.test(e)));
});

test("listFiles answers [] for a missing directory, so an absent family is a no-op", () => {
  assert.deepEqual(listFiles(join(ROOT, "content/world/definitely-not-here")), []);
  assert.ok(listFiles(join(ROOT, "content/world/premises")).length > 0);
});

test("the promoted root is EMIT-CLEAN, and the one node the derive-writer re-derives is named", T, () => {
  const repo = scratchRepo(), run = sharedRun();
  promoteWorld({ repoRoot: repo, runDir: run });
  // Self-consistency is the property that makes a second promotion a no-op:
  // after step 3 the tree emits to itself.
  const emit = spawnSync(process.execPath,
    [join(repo, "scripts/check_spine_emit.mjs"), "--check", "--content-root", join(repo, "content")],
    { encoding: "utf8", cwd: repo });
  assert.equal(emit.status, 0, `${emit.stdout}${emit.stderr}`);
  assert.match(emit.stdout, /spine-emit: check clean, \d+ files/);

  // Every promoted node is byte-identical to the draft's EXCEPT n-millcross,
  // and the exception is not drift. `deriveInterior` takes a town's frame from
  // its town plan (§3.2), and the draft root carries no content/towns/ — the
  // generator copies the world inputs, not the civil ones — so the draft's
  // n-millcross is derived from its bbox and the promoted one from the plan
  // that owns it. The town plan is the authority, so the promoted bytes are
  // the right ones; what matters is that the set of nodes this happens to is
  // exactly one and is stated, not discovered by a later reader.
  const differing = readdirSync(join(run, "content/spine/nodes")).filter((f) =>
    readFileSync(join(repo, "content/spine/nodes", f), "utf8") !==
    readFileSync(join(run, "content/spine/nodes", f), "utf8"));
  assert.deepEqual(differing, ["n-millcross.json"]);
  assert.ok(statSync(join(repo, "content/spine/derived.json")).size > 0);
});

test("the CLI's dry-run report LISTS every write and delete, not just two counts", T, () => {
  const repo = scratchRepo(), run = sharedRun();
  const r = promoteWorld({ repoRoot: repo, runDir: run, dryRun: true });
  const lines = reportLines({ result: r, dryRun: true });
  assert.match(lines[0], /^promote-world: DRY RUN — \d+ written, \d+ deleted$/);
  assert.match(lines[1], /^promote-world: ratio 1\.5 \(land 64000 km²\)$/);
  for (const f of r.deleted) assert.ok(lines.includes(`  DELETE ${f}`), `${f} is deleted but unlisted`);
  for (const f of r.written) assert.ok(lines.includes(`  WRITE  ${f}`), `${f} is written but unlisted`);
  assert.equal(lines.length, 2 + r.deleted.length + r.written.length);
  // A real promotion's report is the counts plus what steps 3-5 saw; the file
  // list would be 64 lines of noise there.
  const full = reportLines({ result: r, dryRun: false });
  assert.equal(full.filter((l) => /^ {2}(WRITE|DELETE)/.test(l)).length, 0);
});

test("promoteWorld itself prints nothing — the report is the CLI's", () => {
  const src = readFileSync(join(ROOT, "tools/mapforge/promote-world.mjs"), "utf8");
  const body = src.slice(src.indexOf("export function promoteWorld"), src.indexOf("export function reportLines"));
  assert.ok(!/console\./.test(body.replace(/\/\/[^\n]*/g, "")),
    "promoteWorld writes to the console — three test files call it in a loop");
});

// ── A TOOL THAT RUNS AND SAYS NOTHING (STATE §19) ──────────────────────────
//
// Both of these were mutation SURVIVORS until they had a fixture: the error
// branch is unreachable in a healthy tree, and the whole point of it is a tree
// that is not healthy. The shapes are the measured ones — a gate that threw
// before finish(), a gate whose report was truncated by process.exit() on a
// pipe, and a CLI spawned through a path whose realpath differs so main()
// never runs at all (which is how this suite found the class in the first
// place).
const stub = (repo, script, body) => writeFileSync(join(repo, script), body);

test("a derive-writer that runs and prints no summary line is an ERROR, not a silent skip", T, () => {
  const repo = scratchRepo(), run = sharedRun();
  // The truncation shape: the per-file lines survive, the summary does not.
  stub(repo, "scripts/check_spine_emit.mjs", "console.log('spine-emit: wrote /some/path.json');\n");
  const r = promoteWorld({ repoRoot: repo, runDir: run });
  assert.ok(r.errors.some((e) => /derive-writer produced no "spine-emit: write clean/.test(e)),
    `a truncated derive-writer report was accepted: ${JSON.stringify(r.errors)}`);
  // …and the main()-never-ran shape: exit 0, no output at all.
  const repo2 = scratchRepo();
  stub(repo2, "scripts/check_spine_emit.mjs", "");
  assert.ok(promoteWorld({ repoRoot: repo2, runDir: run }).errors.some((e) => /did not run/.test(e)));
});

test("a content gate that loses its report is an ERROR, not a green promotion", T, () => {
  const repo = scratchRepo(), run = sharedRun();
  // Exactly §19's shape: the failure lines are printed, the summary line the
  // exit code is supposed to agree with is not, and the exit code is honest.
  stub(repo, "scripts/check_content.mjs",
    "console.error('FAIL G-SOMETHING: a thing');\nprocess.exitCode = 1;\n");
  const r = promoteWorld({ repoRoot: repo, runDir: run });
  assert.ok(r.errors.some((e) => /produced no "content-gate:" summary line/.test(e)),
    `a truncated gate report was accepted: ${JSON.stringify(r.errors)}`);
  // And the same stub printing the summary line is NOT an error, however red
  // it is — a red gate on a promoted Plan C world is the accounted set.
  const repo2 = scratchRepo();
  stub(repo2, "scripts/check_content.mjs",
    "console.log('content-gate: 36 nodes, 96 failures, 24 warnings');\nprocess.exitCode = 1;\n");
  const r2 = promoteWorld({ repoRoot: repo2, runDir: run });
  assert.equal(r2.errors.length, 0, r2.errors.join("\n"));
  assert.ok(r2.notes.some((n) => /gate exit 1 — content-gate: 36 nodes, 96 failures/.test(n)), r2.notes.join("\n"));
});
