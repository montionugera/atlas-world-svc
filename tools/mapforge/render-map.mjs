#!/usr/bin/env node
// mapforge — draws the cluster-1 world map as an AUTHORED VECTOR DOCUMENT from
// content/maps/cluster1-geography.json.
//
// This is a drafting problem, not a painting problem: a diffusion model cannot
// draw THIS world's coastline, THIS world's roads, or letter THIS world's place
// names and day-counts correctly. So the map is drawn, from data, in code.
//
// Contract:
//   * pure Node, no dependencies, no network, no GPU
//   * DETERMINISTIC — same input JSON, byte-identical SVG. No Math.random(),
//     no Date, no locale-dependent formatting, no object-iteration-order
//     surprises (every list is an array in the source JSON).
//   * every string lettered on the sheet comes from the JSON or from the
//     hard-coded legend vocabulary below; no place name is invented here.
//
// Usage:
//   node tools/mapforge/render-map.mjs            # SVG (+ PNG if rsvg-convert)
//   node tools/mapforge/render-map.mjs --no-png   # SVG only
//   node tools/mapforge/render-map.mjs --check    # self-checks, write nothing
//
// See tools/mapforge/README.md for the schema and the PNG step.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { C } from "./lib/draft.mjs";
import { drawBasinSheet } from "./lib/basin-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const SRC = join(REPO_ROOT, "content/maps/cluster1-geography.json");
const OUT_SVG = join(
  REPO_ROOT,
  "game-client/assets/art/maps/cluster1-world.svg",
);
const OUT_PNG = join(
  REPO_ROOT,
  "game-client/assets/art/maps/cluster1-world.png",
);
const PNG_WIDTH = 2000;

// ---------------------------------------------------------------------------
// Load + draw
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const wantPng = !argv.includes("--no-png");
const checkOnly = argv.includes("--check");

const geo = JSON.parse(readFileSync(SRC, "utf8"));
const { svg, notes, problems } = drawBasinSheet({ doc: geo });

// ---------------------------------------------------------------------------
// Report + write
// ---------------------------------------------------------------------------
const PX_PER_KM = 6.6; // must match lib/basin-sheet.mjs; only used for this note
const [, sheetW, sheetH] = svg.match(/width="(\d+)" height="(\d+)"/);

console.log("mapforge · cluster 1");
console.log(`  source: ${SRC}`);
for (const n of notes) console.log(`  ${n}`);
console.log(`  sheet:  ${sheetW} x ${sheetH} px @ ${PX_PER_KM} px/km`);

if (problems.length) {
  console.error("\n  PROBLEMS:");
  for (const p of problems) console.error(`    ${p}`);
  process.exit(1);
}

if (checkOnly) {
  console.log("\n  --check: no files written");
  process.exit(0);
}

mkdirSync(dirname(OUT_SVG), { recursive: true });
writeFileSync(OUT_SVG, svg, "utf8");
console.log(`\n  wrote ${OUT_SVG} (${svg.length} bytes)`);

if (wantPng) {
  const probe = spawnSync("rsvg-convert", ["--version"], { encoding: "utf8" });
  if (probe.status === 0) {
    const res = spawnSync(
      "rsvg-convert",
      ["-w", String(PNG_WIDTH), "-b", C.parchment, OUT_SVG, "-o", OUT_PNG],
      { encoding: "utf8" },
    );
    if (res.status === 0)
      console.log(`  wrote ${OUT_PNG} (${PNG_WIDTH}px wide)`);
    else {
      console.error(`  rsvg-convert failed: ${res.stderr || res.status}`);
      process.exit(1);
    }
  } else {
    console.log(
      `  rsvg-convert not on PATH — PNG not written. To produce it:\n` +
        `    rsvg-convert -w ${PNG_WIDTH} -b '${C.parchment}' ${OUT_SVG} -o ${OUT_PNG}\n` +
        `  (any of: librsvg, ImageMagick 'magick -density 200', or\n` +
        `   'Google Chrome' --headless --screenshot will do; the SVG is self-contained)`,
    );
  }
}
