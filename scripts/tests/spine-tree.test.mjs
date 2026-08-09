import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Snapshot of the committed 4-node table. Coverage math, pinned:
//   n-atlas: (26128 km² cluster1 land polygon + 2042 km² westsea strip) /
//            4,000,000 km² = 0.70425% → "0.7%" (Task 1.2 replaced the
//            Phase-0 coarse hulls with the transcribed coastline geometry);
//            interstitialUnsurveyed → UNCHECKED.
//   n-cluster1 / n-westsea: no children → 0.0%; authored interstitial → ASSERTED.
//   n-playroot: no children, unsurveyed → 0.0% UNCHECKED.
const EXPECTED = `n-atlas · world · km · coverage 0.7% UNCHECKED
├── n-cluster1 · continent · km · coverage 0.0% ASSERTED
└── n-westsea · ocean · km · coverage 0.0% ASSERTED
n-playroot · playroot · u · coverage 0.0% UNCHECKED
4 nodes · 2 roots
`;

test("spine-tree prints the committed table exactly (snapshot)", () => {
  const stdout = execFileSync(process.execPath, [join(ROOT, "scripts/spine-tree.mjs")], { encoding: "utf8" });
  assert.equal(stdout, EXPECTED);
});

test("spine-tree exits 1 on a broken tree (cycle fixture)", () => {
  // Reuse the Task 0.6 cycle fixture: build a root with only its spine/.
  const fixtureSpine = join(ROOT, "scripts/tests/fixtures/spine/g-tree-cycle");
  let code = 0, stderr = "";
  try {
    execFileSync(process.execPath, [join(ROOT, "scripts/spine-tree.mjs"), "--content-root", fixtureSpine], { encoding: "utf8" });
  } catch (e) { code = e.status; stderr = (e.stderr ?? "").toString(); }
  assert.equal(code, 1);
  assert.match(stderr, /cycle detected/);
});
