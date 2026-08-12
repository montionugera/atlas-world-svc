import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkMapRender } from "../check_map_render.mjs";
import { SHEETS } from "../../tools/mapforge/render-sheet.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("committed sheets are fresh", () => {
  const { stale, problems } = checkMapRender({ repoRoot: ROOT });
  assert.deepEqual({ stale, problems }, { stale: [], problems: [] });
});

// Integration-style variant (brief §Step 1 alternative): mutate the real
// committed file in place, assert it's caught as stale, then restore with
// `git checkout --` — same idiom as tools/mapforge/tests/parity.test.mjs.
// Self-healing (resets to the index regardless of what state the file was
// in going in) so a superseded CI run killed mid-test (ci.yml's
// cancel-in-progress) can't leave the committed svg truncated on disk.
test("a stale committed sheet is detected", () => {
  const outSvg = join(ROOT, SHEETS.cluster1.outSvg);
  const original = readFileSync(outSvg, "utf8");
  try {
    writeFileSync(outSvg, original.slice(0, Math.floor(original.length / 2)));
    const { stale } = checkMapRender({ repoRoot: ROOT });
    assert.ok(stale.includes("cluster1"));
  } finally {
    execFileSync("git", ["checkout", "--", outSvg], { cwd: ROOT });
  }
});
