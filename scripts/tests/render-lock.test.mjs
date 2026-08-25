// Plan A Task 10 — the checksum lock that replaces five byte comparisons.
//
// The honest cost of a checksum is that it says THAT something changed, not
// WHAT. unifiedDiff is the mitigation and it ships here, in the same file, so
// the two can never separate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeLock,
  checkLock,
  unifiedDiff,
  GENERATOR_VERSION,
  lockExtraPaths,
} from "../lib/render-lock.mjs";
import { SHEETS } from "../../tools/mapforge/render-sheet.mjs";
import { makeTempRepo } from "./helpers/temp-repo.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LOCK_PATH = join(ROOT, "content/world/render-lock.json");
const CLI = join(ROOT, "scripts/check_render_lock.mjs");
const sha = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");

test("computeLock hashes every sheet's BUILT bytes, keyed by repo-relative outSvg", () => {
  const lock = computeLock({ repoRoot: ROOT, sheets: SHEETS });
  assert.equal(lock.version, 2);
  assert.deepEqual(lock.generator, {
    name: "mapforge",
    version: GENERATOR_VERSION,
  });
  for (const sheet of Object.values(SHEETS)) {
    const got = lock.artifacts[sheet.outSvg];
    assert.match(
      got ?? "",
      /^sha256:[0-9a-f]{64}$/,
      `no lock entry for ${sheet.outSvg}`,
    );
    assert.equal(got, sha(sheet.build({ repoRoot: ROOT }).svg));
  }
});

test("computeLock hashes extraPaths from DISK (the growth point for Plan C's fabric)", () => {
  const dir = mkdtempSync(join(tmpdir(), "lock-extra-"));
  try {
    writeFileSync(join(dir, "thing.json"), "hello\n");
    const lock = computeLock({
      repoRoot: dir,
      sheets: {},
      extraPaths: ["thing.json"],
    });
    assert.equal(lock.artifacts["thing.json"], sha("hello\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a receipts-only change does NOT drift the fabric hash; a geometry change DOES (ruling 2)", () => {
  // OWNER RULING 2, 2026-08-25: pinReceipts[] is metadata G-PIN-SAT re-derives
  // and gates on its own, so the lock hashes each fabric file WITHOUT it.
  // Everything else in the file stays locked — proven by the second half,
  // where moving one region-ring coordinate reds the hash.
  const dir = mkdtempSync(join(tmpdir(), "lock-fabric-"));
  mkdirSync(join(dir, "content/world/fabric"), { recursive: true });
  try {
    const fp = join(dir, "content/world/fabric/continent-02.json");
    const base = {
      continent: "c02",
      regions: [{ id: "c02/r01", rings: [[[0, 0], [1, 0], [1, 1]]], holes: [] }],
      settlements: [{ id: "c02/s01" }],
      pinReceipts: [{ id: "c-town-gildmark", measured: { landformNearDistanceKm: 9 } }],
    };
    writeFileSync(fp, JSON.stringify(base));
    const lockA = computeLock({
      repoRoot: dir, sheets: {},
      extraPaths: lockExtraPaths({ repoRoot: dir }),
    });
    // RECEIPTS-ONLY: change a measured distance and add a receipt -> SAME hash
    base.pinReceipts[0].measured.landformNearDistanceKm = 12.5;
    base.pinReceipts.push({ id: "c-town-millcross", measured: {} });
    writeFileSync(fp, JSON.stringify(base));
    const lockB = computeLock({
      repoRoot: dir, sheets: {},
      extraPaths: lockExtraPaths({ repoRoot: dir }),
    });
    assert.equal(lockB.artifacts["content/world/fabric/continent-02.json"],
      lockA.artifacts["content/world/fabric/continent-02.json"],
      "a receipts-only change drifted the lock — the exemption regressed");
    // GEOMETRY: move one ring vertex -> DIFFERENT hash
    base.regions[0].rings[0][1] = [2, 0];
    writeFileSync(fp, JSON.stringify(base));
    const lockC = computeLock({
      repoRoot: dir, sheets: {},
      extraPaths: lockExtraPaths({ repoRoot: dir }),
    });
    assert.notEqual(lockC.artifacts["content/world/fabric/continent-02.json"],
      lockA.artifacts["content/world/fabric/continent-02.json"],
      "a geometry change stopped red-ing the lock");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("computeLock uses caller-supplied built bytes instead of rendering twice", () => {
  // check_render_lock.mjs builds every sheet up front to collect problems.
  // Before `built` existed it then handed computeLock the sheets registry and
  // the renderer ran a second time on every sheet — measured at ~20 ms per
  // sheet here, ~40 ms of the CLI's 204 ms, and it scales with Plan B's
  // 18-sheet roster.
  let calls = 0;
  const fake = {
    probe: {
      outSvg: "probe/out.svg",
      build: () => {
        calls++;
        return { svg: "rebuilt", notes: [], problems: [] };
      },
    },
  };
  const withBytes = computeLock({
    repoRoot: ROOT,
    sheets: fake,
    built: { "probe/out.svg": "handed-in\n" },
  });
  assert.equal(
    calls,
    0,
    "computeLock rebuilt a sheet whose bytes it was given",
  );
  assert.equal(withBytes.artifacts["probe/out.svg"], sha("handed-in\n"));

  const withoutBytes = computeLock({ repoRoot: ROOT, sheets: fake });
  assert.equal(calls, 1, "omitting `built` must still build");
  assert.equal(withoutBytes.artifacts["probe/out.svg"], sha("rebuilt"));
});

test("the committed lock matches what the sheets build right now", () => {
  const committed = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
  // `lockExtraPaths` and not a second list: the CLI passes the same function,
  // so the lock the gate checks and the lock this test recomputes cannot be
  // computed over different artifact sets. Plan C Task 13 added the 27
  // committed fabric and handle files to it.
  const computed = computeLock({
    repoRoot: ROOT, sheets: SHEETS, extraPaths: lockExtraPaths({ repoRoot: ROOT }),
  });
  assert.deepEqual(
    checkLock({
      committed: committed.artifacts,
      computed: computed.artifacts,
    }),
    { drift: [], missing: [], extra: [] },
  );
});

test("lockExtraPaths names every committed fabric and handle file, and nothing else", () => {
  const paths = lockExtraPaths({ repoRoot: ROOT });
  // A list that answered [] would make the clause above vacuous.
  assert.equal(paths.length, 27, `lockExtraPaths returned ${paths.length} paths`);
  for (const p of paths) assert.match(p, /^content\/world\/(fabric|handles)\/[a-z0-9-]+\.json$/);
  assert.deepEqual(paths, [...paths].sort(), "the extra paths are not sorted — the lock's key order would depend on readdir");
  // A root with neither family locks the sheets alone, which is what every
  // fixture root and the tree before Task 13 look like.
  assert.deepEqual(lockExtraPaths({ repoRoot: join(ROOT, "scripts") }), []);
});

test("checkLock separates drift, missing and extra — three different mistakes", () => {
  const r = checkLock({
    committed: { a: "sha256:1", b: "sha256:2", gone: "sha256:3" },
    computed: { a: "sha256:1", b: "sha256:CHANGED", added: "sha256:4" },
  });
  assert.deepEqual(r, { drift: ["b"], missing: ["gone"], extra: ["added"] });
});

test("unifiedDiff shows the changed region with a hunk header and respects maxLines", () => {
  const a = ["one", "two", "three", "four", "five"].join("\n");
  const b = ["one", "two", "THREE", "four", "five"].join("\n");
  const d = unifiedDiff({ a, b });
  assert.match(d, /^@@ -3,1 \+3,1 @@$/m);
  assert.match(d, /^-three$/m);
  assert.match(d, /^\+THREE$/m);
});

test("unifiedDiff on identical input is the empty string", () => {
  assert.equal(unifiedDiff({ a: "x\ny\n", b: "x\ny\n" }), "");
});

test("unifiedDiff truncates and says so", () => {
  const a = Array.from({ length: 500 }, (_, i) => `a${i}`).join("\n");
  const b = Array.from({ length: 500 }, (_, i) => `b${i}`).join("\n");
  const d = unifiedDiff({ a, b, maxLines: 10 });
  assert.ok(
    d.split("\n").length <= 12,
    `diff is ${d.split("\n").length} lines`,
  );
  assert.match(d, /truncated/);
});

test("unifiedDiff survives an empty side, a strict prefix and a missing trailing newline", () => {
  // (d) from the Task 10 reviewer brief, pinned as a test rather than a claim.
  const full = "alpha\nbeta\ngamma\n";
  assert.match(unifiedDiff({ a: "", b: full }), /^@@ -1,0 \+1,3 @@$/m);
  assert.match(unifiedDiff({ a: full, b: "" }), /^@@ -1,3 \+1,0 @@$/m);
  // a is a strict prefix of b: no trailing newline on the short side.
  const d = unifiedDiff({ a: "alpha\nbeta", b: "alpha\nbeta\ngamma" });
  assert.match(d, /^@@ -3,0 \+3,1 @@$/m);
  assert.match(d, /^\+gamma$/m);
  assert.equal(
    unifiedDiff({ a: "alpha\nbeta", b: "alpha\nbeta" }),
    "",
    "no trailing newline must not manufacture a diff",
  );
});

// ---------------------------------------------------------------------------
// CLI tests.
//
// Everything that has to prove the gate FIRES runs against a sandbox repo root
// (--repo-root). The earlier shape of these tests truncated the real, TRACKED
// game-client/assets/art/maps/cluster1-world.svg and restored it in a
// `finally`. That is safe with one mutator and unsafe with two, and Task 10
// created the second: scripts/tests/check_map_render.test.mjs mutates the same
// file, `node --test` runs test FILES in parallel, and a lost update there
// writes truncated bytes over a drawn artifact permanently. Measured before
// this change: 1 of 4 runs of this file failed with check_map_render looping
// alongside it. See scripts/tests/helpers/temp-repo.mjs.
//
// Only the read-only smoke test below still touches the real root.
// ---------------------------------------------------------------------------

const runCli = (args) => {
  try {
    return {
      failed: false,
      out: execFileSync(process.execPath, [CLI, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (e) {
    return { failed: true, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};

test("the CLI --check exits 0 on the committed tree", () => {
  execFileSync(process.execPath, [CLI, "--check"], { encoding: "utf8" }); // throws on non-zero
});

test("the CLI --check exits 1 on a tampered lock", () => {
  const repo = makeTempRepo({ sheets: SHEETS });
  try {
    const lockPath = join(repo.root, "content/world/render-lock.json");
    const doc = JSON.parse(readFileSync(lockPath, "utf8"));
    doc.artifacts[Object.keys(doc.artifacts)[0]] = "sha256:" + "0".repeat(64);
    writeFileSync(lockPath, JSON.stringify(doc, null, 2) + "\n");
    const { failed, out } = runCli(["--check", "--repo-root", repo.root]);
    assert.ok(failed, "--check exited 0 on a tampered lock");
    assert.match(
      out,
      /G-RENDER-LOCK: .+ sha256 sha256:[0-9a-f]{64} != locked sha256:0{64}/,
    );
  } finally {
    repo.cleanup();
  }
});

test("the CLI --check catches a STALE committed svg, not just a stale lock", () => {
  const repo = makeTempRepo({ sheets: SHEETS });
  try {
    const svgPath = join(repo.root, SHEETS.cluster1.outSvg);
    const original = readFileSync(svgPath, "utf8");
    writeFileSync(svgPath, original.slice(0, Math.floor(original.length / 2)));
    const { failed, out } = runCli(["--check", "--repo-root", repo.root]);
    assert.ok(failed, "--check exited 0 on a truncated committed svg");
    assert.match(
      out,
      /@@ /,
      "no unified diff was printed — the checksum's whole mitigation",
    );
  } finally {
    repo.cleanup();
  }
});

test("the CLI --check reports a lock whose generator/version no longer matches the tool", () => {
  // GENERATOR_VERSION only distinguishes a tool-caused re-baseline from a
  // world-caused one if a stale header is actually caught. Without this the
  // constant is decoration: the lock can claim 0.0.0 forever and stay green.
  const repo = makeTempRepo({ sheets: SHEETS });
  try {
    const lockPath = join(repo.root, "content/world/render-lock.json");
    const doc = JSON.parse(readFileSync(lockPath, "utf8"));
    doc.generator.version = "0.0.0";
    doc.version = 99;
    writeFileSync(lockPath, JSON.stringify(doc, null, 2) + "\n");
    const { failed, out } = runCli(["--check", "--repo-root", repo.root]);
    assert.ok(failed, "--check exited 0 on a lock with a stale header");
    assert.match(out, /G-RENDER-LOCK: lock version 99 != 2/);
    assert.match(out, /G-RENDER-LOCK: lock generator .*0\.0\.0/);
  } finally {
    repo.cleanup();
  }
});

// --- the build-problems refusal guard -------------------------------------
//
// computeLock `continue`s past a sheet whose build reports problems. The only
// thing standing between that and a silently shrunken lock is the CLI's
// refusal to run at all when any sheet has problems. Deleting that guard used
// to leave all ten tests green; these two hold it in place. Both are the
// Task 10 Step 11 review brief items (a) and (b), pinned as tests rather than
// asserted in a commit body.
//
// A sheet is broken WITHOUT touching code by removing the `subjects`
// descriptor Task 7 added to content/spine/sheet.json: resolveWorld then
// reports "no `subjects` descriptor" and buildCluster1Sheet returns problems.
// The atlas sheet reads sheet-atlas.json and still builds — so exactly one of
// two sheets is broken, which is precisely the shrunken-lock scenario.
function brokenSheetRepo() {
  const repo = makeTempRepo({ sheets: SHEETS });
  const sheetJson = join(repo.root, "content/spine/sheet.json");
  const doc = JSON.parse(readFileSync(sheetJson, "utf8"));
  delete doc.subjects;
  writeFileSync(sheetJson, JSON.stringify(doc, null, 2) + "\n");
  return repo;
}

test("--check REFUSES to run when a sheet reports build problems", () => {
  const repo = brokenSheetRepo();
  try {
    const { failed, out } = runCli(["--check", "--repo-root", repo.root]);
    assert.ok(failed, "--check exited 0 with a broken renderer");
    assert.match(out, /check-render-lock: PROBLEM: cluster1: /);
    assert.doesNotMatch(
      out,
      /check clean/,
      "a broken renderer must never produce a clean check",
    );
  } finally {
    repo.cleanup();
  }
});

test("--write REFUSES to run when a sheet reports build problems", () => {
  const repo = brokenSheetRepo();
  try {
    const lockPath = join(repo.root, "content/world/render-lock.json");
    const before = readFileSync(lockPath, "utf8");
    const { failed, out } = runCli(["--write", "--repo-root", repo.root]);
    assert.ok(failed, "--write exited 0 with a broken renderer");
    assert.match(out, /check-render-lock: PROBLEM: cluster1: /);
    assert.equal(
      readFileSync(lockPath, "utf8"),
      before,
      "--write shrank the lock instead of refusing — the next --check would " +
        "report `missing` instead of the real problem",
    );
  } finally {
    repo.cleanup();
  }
});

// ── THE GATE MUST NOT LOSE ITS OWN REPORT (STATE §19, §21) ─────────────────
//
// SECOND OCCURRENCE, and that is why this is written as a SWEEP and not as one
// assertion about check_render_lock.mjs. §19 retired the class in
// check_content.mjs; check_render_lock.mjs kept it, on the path THIS release
// made ten times larger — lockExtraPaths() took the lock from 3 artifacts to
// 32, so one content/world/fabric/*.json change now redraws the fabric sheet
// and prints a six-figure unified diff. MEASURED in node:18, one fabric file
// removed: 104,257 bytes when stdout was a FILE, 8,413–16,605 bytes over six
// runs when it was a PIPE — 84–92 % of the report gone, a different amount
// each run, exit code honest throughout. Every `run:` step in ci.yml and every
// run_section capture in precheck.sh / integration.sh is a pipe.
//
// The rule is scoped to main() on purpose. A `process.exit()` in an argument
// parser prints one line and cannot return a usable value to its caller;
// converting it would change control flow for no measurable gain. What must
// never happen is a REPORT followed by an exit, and every report in these five
// tools is printed from main().
//
// A behavioural test would be green for the wrong reason: the loss cannot be
// reproduced on the macOS box this suite is written on (0/100 truncations at
// 76 KB, against 81/100 on linux). So the pin is on the source.
test("no gate CLI calls process.exit() from main() — reports on a pipe are lost", () => {
  const GATE_CLIS = [
    "scripts/check_content.mjs",
    "scripts/check_render_lock.mjs",
    "scripts/check_spine_emit.mjs",
    "scripts/check_asset_manifest.mjs",
    "scripts/gen_story_graph.mjs",
  ];
  const offenders = [];
  for (const rel of GATE_CLIS) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    const at = src.search(/^(?:async )?function main\(/m);
    assert.ok(at >= 0, `${rel} has no main() — this sweep can no longer see it`);
    const body = src.slice(at).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const n = (body.match(/process\.exit\(/g) ?? []).length;
    if (n) offenders.push(`${rel} (${n})`);
  }
  assert.deepEqual(offenders, [],
    `process.exit() after a report discards whatever libuv has not flushed to a pipe — use process.exitCode and return: ${offenders.join(", ")}`);
});

test("the five gate CLIs keep their exit codes after the exitCode conversion", () => {
  // The conversion is only safe if the status is unchanged, so the status is
  // what is asserted — clean 0, drift 1, misuse 2 — through a PIPE, which is
  // the venue the class lives in.
  const run = (args, opts = {}) => {
    const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", ...opts });
    return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
  };
  const emitClean = run([join(ROOT, "scripts/check_spine_emit.mjs"), "--check"]);
  assert.equal(emitClean.status, 0, emitClean.out);
  assert.match(emitClean.out, /spine-emit: check clean, \d+ files/);
  assert.equal(run([join(ROOT, "scripts/check_spine_emit.mjs"), "--bogus"]).status, 2);
  assert.equal(run([join(ROOT, "scripts/check_spine_emit.mjs"), "--check", "--content-root", join(tmpdir(), "definitely-not-a-content-root")]).status, 2);

  const lock = run([join(ROOT, "scripts/check_render_lock.mjs"), "--check"]);
  assert.equal(lock.status, 0, lock.out.slice(-2000));
  assert.match(lock.out, /check-render-lock: check clean, \d+ artifacts/);
  assert.equal(run([join(ROOT, "scripts/check_render_lock.mjs"), "--nope"]).status, 2);
  assert.equal(run([join(ROOT, "scripts/check_render_lock.mjs"), "--repo-root"]).status, 2);

  const graph = run([join(ROOT, "scripts/gen_story_graph.mjs"), "--check"]);
  assert.equal(graph.status, 0, graph.out);
  assert.match(graph.out, /is in sync \(\d+ nodes, \d+ edges\)/);
});
