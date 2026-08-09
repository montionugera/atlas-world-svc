import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Snapshot of the committed 23-node table. Coverage math, pinned:
//   n-atlas: (26128 km² cluster1 land polygon + 2042 km² westsea strip) /
//            4,000,000 km² = 0.70425% → "0.7%" (Task 1.2 replaced the
//            Phase-0 coarse hulls with the transcribed coastline geometry);
//            interstitialUnsurveyed → UNCHECKED.
//   n-cluster1: Task 1.3 transcribed the 12 cluster-1 regions (10 zones +
//            saltmire + eastern-hills), so its 12 children now cover
//            15202 km² of its 26128 km² polygon = 58.18279...% → "58.2%";
//            authored interstitial → ASSERTED (coverage stays under the 60%
//            CHECKED threshold — expected, region children have no children
//            of their own yet).
//   n-westsea: no children → 0.0%; authored interstitial → ASSERTED.
//   the 12 region nodes: Task 1.4 gave 6 of them a town child (7th is a
//            camp) — every one is `placement.shape: "point"` (area 0 —
//            research §5.3 excludes points from every rollup), so coverage
//            stays 0.0% ASSERTED for both parent and child regardless.
//   the 7 town-tier nodes (6 towns + n-expedition-camp): no children →
//            0.0% ASSERTED.
//   n-playroot: no children, unsurveyed → 0.0% UNCHECKED.
const EXPECTED = `n-atlas · world · km · coverage 0.7% UNCHECKED
├── n-cluster1 · continent · km · coverage 58.2% ASSERTED
│   ├── n-ashvale-front · region · km · coverage 0.0% ASSERTED
│   ├── n-cindervast · region · km · coverage 0.0% ASSERTED
│   │   └── n-cindervast-town · town · km · coverage 0.0% ASSERTED
│   ├── n-eastern-hills · region · km · coverage 0.0% ASSERTED
│   ├── n-emberdown · region · km · coverage 0.0% ASSERTED
│   │   └── n-embervale · town · km · coverage 0.0% ASSERTED
│   ├── n-gildmark-head · region · km · coverage 0.0% ASSERTED
│   │   └── n-gildmark · town · km · coverage 0.0% ASSERTED
│   ├── n-hollowmarch · region · km · coverage 0.0% ASSERTED
│   │   └── n-norhollow · town · km · coverage 0.0% ASSERTED
│   ├── n-meltwash-terrace · region · km · coverage 0.0% ASSERTED
│   │   └── n-expedition-camp · town · km · coverage 0.0% ASSERTED
│   ├── n-millcross-ford · region · km · coverage 0.0% ASSERTED
│   │   └── n-millcross · town · km · coverage 0.0% ASSERTED
│   ├── n-northern-icefield · region · km · coverage 0.0% ASSERTED
│   ├── n-rooktide-reach · region · km · coverage 0.0% ASSERTED
│   │   └── n-rooktide · town · km · coverage 0.0% ASSERTED
│   ├── n-saltmire · region · km · coverage 0.0% ASSERTED
│   └── n-thornveil · region · km · coverage 0.0% ASSERTED
└── n-westsea · ocean · km · coverage 0.0% ASSERTED
n-playroot · playroot · u · coverage 0.0% UNCHECKED
23 nodes · 2 roots
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
