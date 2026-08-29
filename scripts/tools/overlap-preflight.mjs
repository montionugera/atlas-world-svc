#!/usr/bin/env node
// Plan A Task 2 — the G-OVERLAP equivalence pre-flight, as a report.
//
// Prints one line per sibling pair whose two algorithms disagree at all, plus
// the totals. Exit 0 always: this is a REPORT, in the always-exit-0 style of
// scripts/report_season1.mjs. The gate that fails is the test suite.
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSpine, buildTree, gridIntersectionArea, placementArea,
  SPINE_CELL_KM, SPINE_CELL_U,
} from "../lib/spine.mjs";
import { exactIntersectionArea, ringStructureProblem } from "../lib/geometry.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const contentRoot = process.argv.includes("--content-root")
  ? resolve(process.argv[process.argv.indexOf("--content-root") + 1])
  : join(ROOT, "content");

const spine = loadSpine({ contentRoot });
const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });

let pairs = 0, verdictDiff = 0, maxDev = 0, worst = "", tGrid = 0, tExact = 0;
// The equivalence claim is only worth as much as the kernel's own confidence
// in each number. Without this collector the tool reported "verdict
// differences 0 / max deviation 0.000000" on a root containing a ring the
// exact kernel REFUSES — both algorithms return 0, they agree perfectly, and
// the agreement is meaningless. Reported, deduplicated per node id; exit stays
// 0 because this is a report, and the gate that fails is G-RING-SIMPLE.
const refused = new Map();
// Two sources, because the per-pair collector alone is not enough: it only
// fills at stage 3 of exactIntersectionArea, so an unsound ring on an only
// child, or beside a sibling it does not touch, never reaches it. The per-RING
// sweep is the same predicate G-RING-SIMPLE runs and it sees every placement.
for (const node of tree.byId.values()) {
  if (node.placement?.shape !== "polygon") continue;
  const why = ringStructureProblem({ points: node.placement.points ?? [] });
  if (why) refused.set(node.id, why);
}
for (const parent of tree.byId.values()) {
  const kids = (tree.childrenOf.get(parent.id) ?? [])
    .map((i) => tree.byId.get(i))
    .filter((n) => n.placement.shape !== "point");
  const cell = parent.interior?.units === "u" ? SPINE_CELL_U : SPINE_CELL_KM;
  for (let i = 0; i < kids.length; i++)
    for (let j = i + 1; j < kids.length; j++) {
      pairs++;
      const t0 = process.hrtime.bigint();
      const grid = gridIntersectionArea({ a: kids[i].placement, b: kids[j].placement, cell });
      const t1 = process.hrtime.bigint();
      const problems = [];
      const exact = exactIntersectionArea({ a: kids[i].placement, b: kids[j].placement, problems });
      const t2 = process.hrtime.bigint();
      for (const pr of problems) {
        const bad = pr.startsWith("ring b") ? kids[j] : kids[i];
        if (!refused.has(bad.id)) refused.set(bad.id, pr.replace(/^ring [ab] is /, ""));
      }
      tGrid += Number(t1 - t0);
      tExact += Number(t2 - t1);
      const limit = 0.005 * Math.min(
        placementArea({ placement: kids[i].placement }),
        placementArea({ placement: kids[j].placement }),
      );
      if ((grid > limit) !== (exact > limit)) {
        verdictDiff++;
        console.log(`VERDICT DIFF ${kids[i].id} ∩ ${kids[j].id}: grid ${grid} exact ${exact} limit ${limit}`);
      }
      const dev = Math.max(grid, exact) - Math.min(grid, exact);
      if (dev > maxDev) { maxDev = dev; worst = `${kids[i].id} ∩ ${kids[j].id} (grid ${grid}, exact ${exact})`; }
    }
}
for (const [id, why] of refused) console.log(`NON-TRIANGULABLE ${id}: ${why}`);
console.log(`overlap-preflight: ${pairs} sibling pairs`);
console.log(`overlap-preflight: non-triangulable rings ${refused.size}`);
console.log(`overlap-preflight: verdict differences ${verdictDiff}`);
console.log(`overlap-preflight: max deviation ${maxDev.toFixed(6)} km² at ${worst}`);
console.log(`overlap-preflight: grid ${(tGrid / 1e6).toFixed(1)} ms, exact ${(tExact / 1e6).toFixed(2)} ms, speed-up ${(tGrid / tExact).toFixed(1)}x`);
