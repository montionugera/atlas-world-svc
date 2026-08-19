import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { rasterize } from "../lib/raster.mjs";

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
    // the PNG header back: a real image, at the width we asked for, big
    // enough that the pattern/stroke/glyph ink is actually present. A blank
    // 500 px canvas compresses to well under 2 KB.
    const png = readFileSync(pngPath);
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], "not a PNG");
    assert.equal(png.readUInt32BE(16), 500, "rasterize ignored width: 500");
    assert.ok(png.length > 2048, `png is only ${png.length} bytes — likely blank`);
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
// map_render_drift BEFORE mapforge_tests). This scans the whole DIRECTORY
// rather than that one file, so the hazard cannot come back under a new name.
//
// Two hardenings over the naive scan, both load-bearing:
//   1. Comments are stripped first. A comment that DESCRIBES the hazard (this
//      one does, at length) must not count as committing it. Without this the
//      scanner flags its own file — measured: 4 offenders, 2 of them this file.
//   2. The two trigger literals are assembled from fragments, so the
//      scanner's own source cannot match its own patterns.
// The path and the write-call must both appear in the same FILE, not the same
// line: the original hazard bound the path to a const on line 10 and wrote it
// on line 14, so a line-local rule would have missed the very thing it exists
// to catch. The cost is that a file which both mentions the path in live code
// and writes somewhere unrelated would be flagged; no file in this directory
// does, and the message names the file so the false positive is cheap.
const TRACKED_SHEET_DIR = ["game-client", "assets", "art", "maps"];
// matches the plain path and the backslash-escaped form used inside regexes
const SHEET_PATH = new RegExp(TRACKED_SHEET_DIR.join("\\\\?/"));
const WRITE_CALL = /writeFileSync|writeFile\(|execFileSync|spawnSync|execSync/;
const GIT_RESTORE = new RegExp("git" + "[\"'\\s,]+.*" + "check" + "out");

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

test("no mapforge test writes into the tracked sheet directory or restores it with git", () => {
  const dir = resolve(HERE);
  const files = readdirSync(dir).filter((n) => n.endsWith(".test.mjs"));
  // A scanner over an empty list passes vacuously; pin that it saw the suite.
  assert.ok(files.length >= 5, `only ${files.length} test files scanned`);
  const offenders = [];
  for (const f of files) {
    const src = stripComments(readFileSync(join(dir, f), "utf8"));
    if (GIT_RESTORE.test(src)) offenders.push(`${f}: restores a tracked file with a git subprocess`);
    if (SHEET_PATH.test(src) && WRITE_CALL.test(src))
      offenders.push(`${f}: writes into the tracked maps directory`);
  }
  assert.deepEqual(offenders, []);
});

test("the raster fixture is small — the 47 KB baseline cost 11.54 s at 2000 px", () => {
  const size = statSync(resolve(HERE, "fixtures/raster-probe.svg")).size;
  assert.ok(size < 5120, `raster-probe.svg is ${size} bytes, budget 5120`);
});
