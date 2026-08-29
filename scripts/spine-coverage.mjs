#!/usr/bin/env node
// F-041: coverage rendering of the cluster-1 children (HANDOFF recipe:
// 1 km raster + point-in-polygon, RLE rows so the SVG stays ~48 KB).
// Usage: node scripts/spine-coverage.mjs <out.svg>
import { writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpine, buildTree, pointInPolygon } from "./lib/spine.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2];
if (!out) { console.error("usage: spine-coverage.mjs <out.svg>"); process.exit(2); }
const spine = loadSpine({ contentRoot: join(ROOT, "content") });
const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
const kids = (tree.childrenOf.get("n-cluster1") ?? []).map((i) => tree.byId.get(i))
  .filter((n) => n.placement.shape === "polygon");
const W = 150, H = 190, COLORS = ["#1b2430", "#4e9a6f", "#c05050"]; // 0,1,≥2 claims
let rects = "";
for (let y = 0; y < H; y++) {
  let runStart = 0, runVal = -1;
  for (let x = 0; x <= W; x++) {
    const v = x === W ? -2
      : Math.min(2, kids.filter((k) => pointInPolygon({ point: [x + 0.5, y + 0.5], points: k.placement.points })).length);
    if (v !== runVal) {
      if (runVal > 0) rects += `<rect x="${runStart}" y="${y}" width="${x - runStart}" height="1" fill="${COLORS[runVal]}"/>\n`;
      runStart = x; runVal = v;
    }
  }
}
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${COLORS[0]}"/>\n${rects}</svg>\n`);
console.log(`spine-coverage: wrote ${out}`);
