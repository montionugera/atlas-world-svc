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
//            of their own yet). Task 1.12 redrew five region boundaries to
//            close the G-OVERLAP siblings and pulled cluster-1's own west
//            edge east so the sea strip becomes n-westsea's alone, shrinking
//            cluster-1's own polygon from 26128 to 26017 km²; the redrawn
//            children now cover 13885.5 km² of that = 53.37...% → "53.4%"
//            (n-atlas's 0.7% land-fraction of the 4,000,000 km² world is
//            unaffected within rounding).
//   n-westsea: no children → 0.0%; authored interstitial → ASSERTED.
//   the 12 region nodes: Task 1.4 gave 6 of them a town child (7th is a
//            camp) — every one was originally `placement.shape: "point"`
//            (area 0 — research §5.3 excludes points from every rollup),
//            so coverage stayed 0.0% ASSERTED for both parent and child.
//            Task 3.4 (F-041 P3) landed the km→u frame on all 7 town-tier
//            nodes: their units flip from `km` to `u`, and the six
//            plan-less ones convert their point placement to a real
//            2.0×1.6 km rect centred on the same anchor (millcross uses
//            its plan-derived 2.2×1.6 km rect; rooktide's anchor sits only
//            0.438 km from its parent's boundary, so it's quartered to
//            0.5×0.4 km to clear G-CONTAIN). Real rect area now rolls up
//            into the parent region's coverage: n-cindervast 0.3%,
//            n-emberdown 0.4%, n-gildmark-head 0.5%, n-hollowmarch 0.9%,
//            n-meltwash-terrace 0.5%, n-millcross-ford 0.5% — all still
//            ASSERTED (well under the 60% CHECKED threshold).
//            n-rooktide-reach's child area (0.2 km² from the quartered
//            rect) rounds to 0.0% at one decimal place, so it is
//            unchanged from before.
//   the 7 town-tier nodes (6 towns + n-expedition-camp): no children →
//            0.0% ASSERTED (unchanged — they gained area, not children),
//            EXCEPT n-millcross. The P3 phase-review wave implemented §5.5's
//            town-with-plan ⇒ CHECKED: n-millcross is the one town whose
//            spineId-linked plan (content/towns/town-millcross.json) exists,
//            and the plan IS the survey — its built/river shares are held
//            against the declared composition by G-TOWN-COMP — so it reads
//            CHECKED at 0.0% child coverage. A town has no children; coverage
//            can never be the evidence for one.
//   n-playroot: Task 4.3 (F-041 P4) authored its runtime subtree — 2 fixture
//            children (n-fixture-deflect 100×100 u, n-fixture-projectile
//            1000×1000 u) plus the n-frontier-shelf playspace (1000×1000 u,
//            3 site children of its own: n-site-icefield, n-site-spawn-meadow,
//            n-site-thornveil, each 0.0% ASSERTED — no children yet). Combined
//            child area is 2,010,000 of the 4,000,000 u² frame = 50.25% →
//            "50.2%". The composition rollup no longer closes against the old
//            5%-built guess once real fixture footprints (both 100% built)
//            claim area, so the same commit flips interstitialUnsurveyed to
//            false, authors a real interstitial (the unclaimed wilds beyond
//            the shelf/fixtures), and rebalances composition to match the
//            derived total — n-playroot reads ASSERTED, not UNCHECKED, from
//            here on. n-frontier-shelf itself: 465,000 of 1,000,000 u² claimed
//            by its 3 sites = 46.5% → "46.5%" ASSERTED.
const EXPECTED = `n-atlas · world · km · coverage 0.7% UNCHECKED
├── n-cluster1 · continent · km · coverage 53.4% ASSERTED
│   ├── n-ashvale-front · region · km · coverage 0.0% ASSERTED
│   ├── n-cindervast · region · km · coverage 0.3% ASSERTED
│   │   └── n-cindervast-town · town · u · coverage 0.0% ASSERTED
│   ├── n-eastern-hills · region · km · coverage 0.0% ASSERTED
│   ├── n-emberdown · region · km · coverage 0.4% ASSERTED
│   │   └── n-embervale · town · u · coverage 0.0% ASSERTED
│   ├── n-gildmark-head · region · km · coverage 0.5% ASSERTED
│   │   └── n-gildmark · town · u · coverage 0.0% ASSERTED
│   ├── n-hollowmarch · region · km · coverage 0.9% ASSERTED
│   │   └── n-norhollow · town · u · coverage 0.0% ASSERTED
│   ├── n-meltwash-terrace · region · km · coverage 0.5% ASSERTED
│   │   └── n-expedition-camp · town · u · coverage 0.0% ASSERTED
│   ├── n-millcross-ford · region · km · coverage 0.5% ASSERTED
│   │   └── n-millcross · town · u · coverage 0.0% CHECKED
│   ├── n-northern-icefield · region · km · coverage 0.0% ASSERTED
│   ├── n-rooktide-reach · region · km · coverage 0.0% ASSERTED
│   │   └── n-rooktide · town · u · coverage 0.0% ASSERTED
│   ├── n-saltmire · region · km · coverage 0.0% ASSERTED
│   └── n-thornveil · region · km · coverage 0.0% ASSERTED
└── n-westsea · ocean · km · coverage 0.0% ASSERTED
n-playroot · playroot · u · coverage 50.2% ASSERTED
├── n-fixture-deflect · fixture · u · coverage 0.0% ASSERTED
├── n-fixture-projectile · fixture · u · coverage 0.0% ASSERTED
└── n-frontier-shelf · playspace · u · coverage 46.5% ASSERTED
    ├── n-site-icefield · site · u · coverage 0.0% ASSERTED
    ├── n-site-spawn-meadow · site · u · coverage 0.0% ASSERTED
    └── n-site-thornveil · site · u · coverage 0.0% ASSERTED
29 nodes · 2 roots
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
