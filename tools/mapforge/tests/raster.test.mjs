import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, statSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { rasterize } from "../lib/raster.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_SVG = resolve(HERE, "fixtures/basin-baseline.svg");

test("rasterize() converts an SVG fixture to a non-empty PNG", (t) => {
  const probe = spawnSync("rsvg-convert", ["--version"], { stdio: "pipe" });
  if (probe.error || probe.status !== 0) {
    t.skip("rsvg-convert not installed");
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "mapforge-raster-"));
  const pngPath = join(dir, "out.png");
  try {
    const result = rasterize({ svgPath: FIXTURE_SVG, pngPath });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, false);
    assert.ok(existsSync(pngPath));
    assert.ok(statSync(pngPath).size > 0);
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
