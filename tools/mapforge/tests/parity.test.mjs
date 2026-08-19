// Plan A Task 11: this test used to run the render-map.mjs CLI, which writes
// into the TRACKED game-client sheet under assets/art/maps, and then
// `git checkout --`ed it. integration.sh runs map_render_drift BEFORE this
// suite, so during a redraw it silently reverted a freshly regenerated,
// uncommitted sheet mid-Gate-2. render-map.mjs derives its output path from
// its own location and offers no --out flag, so the CLI cannot be redirected:
// the fix is to assert on the LIBRARY, which is what the CLI is a thin shell
// around. Task 12 deletes this file entirely along with render-map.mjs and
// the baseline fixture; it is fixed first so the hazard cannot survive a
// half-done deletion.
//
// What survives the rewrite is the PARITY the file is named for: this test
// draws from the legacy MIRROR document (content/maps/cluster1-geography.json)
// while render-sheet.test.mjs draws the same sheet from the SPINE. Both must
// land on the same bytes. Losing either side would leave the mirror and the
// spine free to diverge until Task 12 retires the mirror.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drawBasinSheet } from "../lib/basin-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const FIXTURE = join(HERE, "fixtures/basin-baseline.svg");

test("the mirror-driven draw reproduces the baseline byte-for-byte (no file writes)", () => {
  const doc = JSON.parse(readFileSync(join(ROOT, "content/maps/cluster1-geography.json"), "utf8"));
  const { svg, problems } = drawBasinSheet({ doc });
  assert.deepEqual(problems, []);
  assert.equal(svg, readFileSync(FIXTURE, "utf8"));
});
