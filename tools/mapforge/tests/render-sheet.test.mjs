import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCluster1Sheet, SHEETS, parseArgs } from "../render-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const LOCK = join(ROOT, "content/world/render-lock.json");
const LOCKED_ARTIFACT = "game-client/assets/art/maps/cluster1-world.svg";

// Plan A Task 12: was a byte comparison against fixtures/basin-baseline.svg,
// a 47,020-byte duplicate of the committed sheet. The lock carries the same
// guarantee in one hash, so the fixture and its three consumers are retired.
test("the spine-driven cluster1 sheet matches the committed render lock", () => {
  const { svg, problems } = buildCluster1Sheet({ repoRoot: ROOT });
  assert.deepEqual(problems, []);
  const expected = JSON.parse(readFileSync(LOCK, "utf8")).artifacts[
    LOCKED_ARTIFACT
  ];
  assert.equal(
    typeof expected,
    "string",
    `render-lock.json has no row for ${LOCKED_ARTIFACT} — the assertion below would compare against undefined`,
  );
  assert.equal(
    "sha256:" + createHash("sha256").update(svg, "utf8").digest("hex"),
    expected,
  );
});

test("building twice is deterministic", () => {
  assert.equal(
    buildCluster1Sheet({ repoRoot: ROOT }).svg,
    buildCluster1Sheet({ repoRoot: ROOT }).svg,
  );
});

test("SHEETS entries declare title, outSvg, outPng and maxLabelRank", () => {
  // Pin the roster before iterating it. A `for…of Object.entries()` over an
  // empty registry passes every assertion below vacuously — verified: with
  // `export const SHEETS = {}` this test still reported ok. A test written to
  // stop the registry going dark must not be able to go dark itself, so the
  // key set is asserted first. Plan B extends this roster; updating this line
  // is the deliberate acknowledgement that the roster changed.
  assert.deepEqual(Object.keys(SHEETS).sort(), [
    "atlas",
    "cluster1",
    "synthetic",
  ]);
  for (const [id, sheet] of Object.entries(SHEETS)) {
    assert.equal(typeof sheet.title, "string", `${id}.title`);
    assert.ok(sheet.title.length > 0, `${id}.title is empty`);
    assert.match(
      sheet.outSvg,
      /^game-client\/assets\/art\/maps\/.+\.svg$/,
      `${id}.outSvg`,
    );
    assert.match(
      sheet.outPng,
      /^game-client\/assets\/art\/maps\/.+\.png$/,
      `${id}.outPng`,
    );
    assert.equal(typeof sheet.maxLabelRank, "number", `${id}.maxLabelRank`);
    assert.equal(typeof sheet.build, "function", `${id}.build`);
  }
});

// ── the PNG policy (Plan B Task 11) ───────────────────────────────────────
//
// spec 2026-08-16 §7.5: the committed raster is a 512 px review thumb; the
// 2000 px ship raster is on demand and never committed. Asserted on the pure
// parser, not by running the CLI — raster.test.mjs forbids any mapforge test
// from writing game-client/assets/art/maps/, and rendering is the only other
// way to observe the default.

test("--png is OPT-IN: the default writes no raster at all", () => {
  assert.equal(parseArgs(["--sheet", "atlas"]).wantPng, false);
  assert.equal(parseArgs(["--sheet", "atlas", "--check"]).wantPng, false);
  assert.equal(parseArgs(["--sheet", "atlas", "--png"]).wantPng, true);
});

test("the default png width is the committed-thumb width, not the ship width", () => {
  const budgets = JSON.parse(
    readFileSync(
      new URL("../../../content/world/budgets.json", import.meta.url),
      "utf8",
    ),
  );
  // One number, one home. If these ever disagree, the tool and the budget that
  // polices it are describing different artifacts.
  assert.equal(
    parseArgs(["--sheet", "atlas", "--png"]).pngWidth,
    budgets.sheets.thumbWidthPx,
  );
  assert.notEqual(budgets.sheets.thumbWidthPx, budgets.sheets.rasterWidthPx);
  assert.equal(
    parseArgs(["--sheet", "atlas", "--png", "--png-width", "2000"]).pngWidth,
    budgets.sheets.rasterWidthPx,
  );
});

test("--no-png stays accepted as a no-op, so CI's three --no-png lines still run", () => {
  const p = parseArgs(["--sheet", "cluster1", "--no-png", "--check"]);
  assert.equal(p.error, undefined);
  assert.equal(p.wantPng, false);
  assert.equal(p.checkOnly, true);
  assert.equal(p.sheetId, "cluster1");
});

test("bad arguments answer in-band, never by throwing", () => {
  assert.match(parseArgs(["--sheet", "atlas", "--bogus"]).error, /unknown arg/);
  assert.match(parseArgs([]).error, /--sheet/);
  for (const bad of ["nope", "0", "-5", ""])
    assert.match(
      parseArgs(["--sheet", "atlas", "--png-width", bad]).error,
      /positive number/,
      `--png-width ${JSON.stringify(bad)} should be rejected`,
    );
});

// ── G-RASTER-BUDGET, across the WHOLE roster (Plan B Task 12) ──────────────
//
// The 2 s budget existed and only the canary was measured against it. The
// canary passed at 0.77 s while the committed basin sheet took 11.31 s — 5.7x
// over — because the canary's regions carry a baked <image> underlay and its
// only pattern fills are 40x24 legend swatches. It was not covering the thing
// the live sheets do. Every sheet in the registry is measured here.
//
// SKIPS without librsvg, like every other raster test in this repo: CI has no
// rsvg-convert (see tests/raster.test.mjs). The deterministic backstop that
// runs everywhere is G-SHEET-BUDGET's maxPatternRectAreaRatio, which reads the
// same defect straight out of the committed text.
//
// Takes the BEST of three runs. `node --test` runs files in parallel and this
// suite shares a machine with a dozen others; a performance floor is a claim
// about what the renderer can do, not about what a contended box happened to
// do on one pass. The margin it is asserting is large (cluster1 1.08 s against
// a 2 s cap), so this is not a way of squeezing under the number.
const rsvg = (args) => spawnSync("rsvg-convert", args, { stdio: "pipe", maxBuffer: 1 << 26 });

test("BUDGET: every committed sheet rasterises inside maxRasterSeconds at rasterWidthPx", (t) => {
  const probe = rsvg(["--version"]);
  if (probe.error || probe.status !== 0) {
    t.skip("rsvg-convert not installed");
    return;
  }
  const budgets = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  const width = budgets.sheets.rasterWidthPx;
  const cap = budgets.sheets.maxRasterSeconds;
  const dir = mkdtempSync(join(tmpdir(), "sheet-raster-"));
  const slow = [];
  for (const [id, sheet] of Object.entries(SHEETS)) {
    const out = join(dir, `${id}.png`);
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t0 = process.hrtime.bigint();
      const run = rsvg(["-w", String(width), "-b", "#f3e7ce", join(ROOT, sheet.outSvg), "-o", out]);
      const secs = Number(process.hrtime.bigint() - t0) / 1e9;
      assert.equal(run.status, 0, `${id}: ${String(run.stderr)}`);
      if (secs < best) best = secs;
    }
    // rsvg-convert EXITS 0 on a page it drew nothing on, so a timing that is
    // fast because the sheet is empty must not read as a pass.
    assert.ok(statSync(out).size > 10000, `${id}: ${statSync(out).size} B — nothing was drawn`);
    if (best > cap) slow.push(`${id} ${best.toFixed(2)} s`);
  }
  assert.deepEqual(slow, [], `G-RASTER-BUDGET: over ${cap} s at ${width} px: ${slow.join(", ")}`);
});
