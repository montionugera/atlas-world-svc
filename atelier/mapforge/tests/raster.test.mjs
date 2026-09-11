import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { rasterize } from "../lib/raster.mjs";
import { acquireHeavyLock, releaseHeavyLock } from "./helpers/suite-lock.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// Plan A Task 11: was fixtures/basin-baseline.svg at the default 2000 px —
// 12.13 s, and a consumer of a 47 KB fixture that is a byte-identical
// duplicate of a committed file. raster-probe.svg is < 5 KB at 500 px and
// still carries a pattern fill, a stroke and two text runs, which is
// everything rsvg-convert can silently drop.
const FIXTURE_SVG = resolve(HERE, "fixtures/raster-probe.svg");

test("rasterize() converts an SVG fixture to a non-empty PNG", (t) => {
  const probe = spawnSync("rsvg-convert", ["--version"], { stdio: "pipe" });
  if (probe.error || probe.status !== 0) {
    t.skip("rsvg-convert not installed");
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "mapforge-raster-"));
  const pngPath = join(dir, "out.png");
  try {
    const result = rasterize({ svgPath: FIXTURE_SVG, pngPath, width: 500 });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, false);
    assert.ok(existsSync(pngPath));
    // `size > 0` also passes for a 1-byte file and for a blank canvas. Read
    // the PNG header back: a real image, at the width we asked for, and big
    // enough that the pattern fill and the glyphs are actually present.
    // The floor is measured, not guessed — rsvg-convert -w 500 on this
    // machine, three variants of this fixture:
    //   full probe (pattern + stroke + 2 text runs) 21,405 B
    //   pattern fill and both text runs REMOVED      5,643 B
    //   blank parchment rect only                    1,423 B
    // The first version of this test used a 2,048 B floor and its comment
    // claimed it proved the ink was present. It did not: the stripped variant
    // clears 2,048 four times over, so only the blank case was excluded.
    // 8,192 sits 2.6x below the full render and 1.45x above the ink-stripped
    // one, so dropping the pattern or the glyphs now turns this red.
    const png = readFileSync(pngPath);
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], "not a PNG");
    assert.equal(png.readUInt32BE(16), 500, "rasterize ignored width: 500");
    assert.ok(
      png.length > 8192,
      `png is only ${png.length} bytes — pattern/glyph ink is missing (blank 1423, ink-stripped 5643, full 21405)`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rasterize() reports a non-ok, non-skipped result for a bad svgPath", (t) => {
  const probe = spawnSync("rsvg-convert", ["--version"], { stdio: "pipe" });
  if (probe.error || probe.status !== 0) {
    t.skip("rsvg-convert not installed");
    return;
  }

  const result = rasterize({
    svgPath: "/nonexistent/does-not-exist.svg",
    pngPath: join(tmpdir(), "mapforge-raster-missing-out.png"),
  });
  assert.equal(result.ok, false);
  assert.equal(result.skipped, false);
  assert.ok(result.message.length > 0);
});

// Plan A Task 11: no test in this directory may write into the tracked tree.
// parity.test.mjs used to render the committed basin sheet in place and then
// restore it with a git subprocess, which silently discards a freshly
// regenerated uncommitted sheet mid-Gate-2 (integration.sh runs
// map_render_drift BEFORE mapforge_tests).
//
// This was first written as a SOURCE SCAN for the two literals — the tracked
// path and a write call, conjoined per file. Review demolished that: a text
// pattern only catches the spellings you thought of, and three evasions were
// built and observed to slip past it while the guard stayed green —
//   1. a test that spawns a render CLI (`render-map.mjs`, and after Task 12
//      `render-sheet.mjs`, whose writeFileSync(outSvg, …) targets the same
//      tracked directory) never
//      names the path at all, so the conjunction cannot fire. OBSERVED: guard
//      4 pass / 0 fail while the tracked sheet was silently rewritten;
//   2. `git restore --` — the spelling git itself now recommends — is not
//      the word `checkout`;
//   3. cpSync / copyFileSync / appendFileSync / renameSync are not the word
//      writeFileSync, and join("game-client","assets",…) is not the path.
// It also had a real false positive: render-sheet.test.mjs:38-39 already
// matches the path (inside a regex literal) and is one added spawnSync away
// from a spurious red.
//
// So the write half is now BEHAVIOURAL: run the suite and diff the directory.
// That is spelling-proof — it does not care how the bytes got there — and it
// has no false positives, because it observes the actual hazard rather than a
// proxy for it. Identical-byte rewrites count too: the snapshot carries mtime
// alongside the hash, because `render-sheet.mjs` re-emitting the committed
// bytes is still a test writing the tracked tree. (This named render-map.mjs
// until Plan A Task 12 deleted it; render-sheet.mjs is the surviving writer
// of that directory.)
//
// The source scan survives for ONE idiom the behavioural check provably cannot
// see: `git checkout --` / `git restore --` against an UNMODIFIED file rewrites
// nothing, so on the clean tree a suite normally runs against it is invisible —
// and a dirty tree mid-redraw is the entire hazard. Rather than enumerate git
// subcommands, no mapforge test may spawn git at all. Comments are stripped
// first (a comment describing the hazard must not count as committing it —
// measured: without stripping, 4 offenders, 2 of them this file) and the
// trigger literal is assembled from fragments so the scanner cannot match its
// own source.
const GIT_TOKEN = "g" + "it";
const GIT_SPAWN = new RegExp("[\"'`]" + GIT_TOKEN + "[\"'`\\s]");
const MAPS_DIR = resolve(HERE, "../../../game-client/assets/art/maps");
const CHILD_ENV = "MAPFORGE_TRACKED_TREE_CHILD";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

function testFiles() {
  return readdirSync(HERE)
    .filter((n) => n.endsWith(".test.mjs"))
    .sort();
}

function snapshotTrackedMaps() {
  const out = {};
  for (const name of readdirSync(MAPS_DIR).sort()) {
    const p = join(MAPS_DIR, name);
    const st = statSync(p);
    if (!st.isFile()) continue;
    out[name] = {
      size: st.size,
      mtimeMs: st.mtimeMs,
      sha256: createHash("sha256").update(readFileSync(p)).digest("hex"),
    };
  }
  return out;
}

test("running the whole mapforge suite touches nothing in the tracked maps directory", (t) => {
  // The child run below re-enters this file. Skip there, or it recurses.
  if (process.env[CHILD_ENV]) {
    t.skip("child run of the tracked-tree guard");
    return;
  }
  const files = testFiles();
  // A guard over an empty list passes vacuously; pin that it saw the suite.
  assert.ok(files.length >= 5, `only ${files.length} test files scanned`);

  // NODE_TEST_CONTEXT is set in this process by the runner and is INHERITED.
  // A child that sees it prints "run() is being called recursively within a
  // test file. skipping running files", writes nothing and exits 0 — a
  // vacuous green that observed no writes because it ran no tests. Measured
  // while building this: the child "ran" in 184 ms instead of 2.5 s, empty
  // stdout, status 0. Delete the variable, and then PROVE the child ran by
  // reading its own counters back rather than trusting its exit code.
  const env = { ...process.env, [CHILD_ENV]: "1" };
  delete env.NODE_TEST_CONTEXT;

  // Held across the child run so the wall-clock raster budget in
  // render-sheet.test.mjs is never measured against a box THIS test is
  // deliberately loading. See helpers/suite-lock.mjs for the measurements.
  const before = snapshotTrackedMaps();
  acquireHeavyLock();
  let child;
  try {
    child = spawnSync(
      process.execPath,
      ["--test", "--test-reporter=tap", ...files.map((f) => join(HERE, f))],
      { encoding: "utf8", stdio: "pipe", env },
    );
  } finally {
    releaseHeavyLock();
  }
  const after = snapshotTrackedMaps();

  // Report the tree damage FIRST: if the suite also failed, the write is still
  // the more serious finding and must not be buried under the child's output.
  assert.deepEqual(
    after,
    before,
    "a mapforge test wrote into game-client/assets/art/maps — run the files one at a time to find it",
  );

  const counted = (key) => Number(child.stdout.match(new RegExp(`^# ${key} (\\d+)$`, "m"))?.[1] ?? -1);
  const passed = counted("pass");
  assert.ok(
    passed >= files.length,
    `child ran only ${passed} tests over ${files.length} files — it did not really run:\n${child.stdout}\n${child.stderr}`,
  );
  assert.equal(counted("fail"), 0, `child suite failed:\n${child.stdout}`);
  assert.equal(child.status, 0, `child suite exited ${child.status}:\n${child.stdout}\n${child.stderr}`);
});

test("no mapforge test spawns a git subprocess", () => {
  const files = testFiles();
  assert.ok(files.length >= 5, `only ${files.length} test files scanned`);
  const offenders = [];
  for (const f of files) {
    const src = stripComments(readFileSync(join(HERE, f), "utf8"));
    if (GIT_SPAWN.test(src)) offenders.push(`${f}: spawns a version-control subprocess`);
  }
  assert.deepEqual(offenders, []);
});

test("the raster fixture is small — the 47 KB baseline cost 11.54 s at 2000 px", () => {
  const size = statSync(resolve(HERE, "fixtures/raster-probe.svg")).size;
  assert.ok(size < 5120, `raster-probe.svg is ${size} bytes, budget 5120`);
});
