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
import { exactIntersectionArea } from "../lib/geometry.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const contentRoot = process.argv.includes("--content-root")
  ? resolve(process.argv[process.argv.indexOf("--content-root") + 1])
  : join(ROOT, "content");

const spine = loadSpine({ contentRoot });
const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });

let pairs = 0, verdictDiff = 0, maxDev = 0, worst = "", tGrid = 0, tExact = 0;
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
      const exact = exactIntersectionArea({ a: kids[i].placement, b: kids[j].placement });
      const t2 = process.hrtime.bigint();
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
console.log(`overlap-preflight: ${pairs} sibling pairs`);
console.log(`overlap-preflight: verdict differences ${verdictDiff}`);
console.log(`overlap-preflight: max deviation ${maxDev.toFixed(6)} km² at ${worst}`);
console.log(`overlap-preflight: grid ${(tGrid / 1e6).toFixed(1)} ms, exact ${(tExact / 1e6).toFixed(2)} ms, speed-up ${(tGrid / tExact).toFixed(1)}x`);
