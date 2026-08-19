#!/usr/bin/env node
// mapforge — spine-driven sheet builder (F-042 Task 4).
//
// Same drawn-from-data contract as render-map.mjs, but the data comes from
// the spine (content/spine/) instead of the committed mirror JSON:
//   loadSpine -> buildTree -> emitGeography (canonical JSON string) -> parse
//   -> drawBasinSheet. Because the mirror file is itself byte-emitted from
//   the spine by check_spine_emit.mjs's emitGeography, this path produces a
//   byte-identical SVG to the mirror-driven render-map.mjs path.
//
// Usage:
//   node tools/mapforge/render-sheet.mjs --sheet <id> [--no-png] [--check]
//   --check: build, print problems, exit 1 if any OR if the built svg
//            differs from the committed outSvg; writes nothing.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { C } from "./lib/draft.mjs";
import { drawBasinSheet } from "./lib/basin-sheet.mjs";
import { buildAtlasSheet } from "./lib/atlas-sheet.mjs";
import { rasterize } from "./lib/raster.mjs";
import { loadSpine, buildTree } from "../../scripts/lib/spine.mjs";
import { emitGeography } from "../../scripts/check_spine_emit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const PNG_WIDTH = 2000;

export function buildCluster1Sheet({ repoRoot }) {
  const spine = loadSpine({ contentRoot: join(repoRoot, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  // Plan A Task 5: emitGeography returns { bytes, problems } and no longer
  // throws on a missing subject. Task 6 re-points this at places.mjs entirely.
  const { bytes, problems } = emitGeography({ spine, tree });
  if (problems.length) return { svg: "", notes: [], problems };
  const doc = JSON.parse(bytes);
  return drawBasinSheet({ doc });
}

export const SHEETS = {
  cluster1: {
    outSvg: "game-client/assets/art/maps/cluster1-world.svg",
    outPng: "game-client/assets/art/maps/cluster1-world.png",
    build: buildCluster1Sheet,
  },
  atlas: {
    outSvg: "game-client/assets/art/maps/atlas-world.svg",
    outPng: "game-client/assets/art/maps/atlas-world.png",
    build: buildAtlasSheet,
  },
};

function main() {
  const argv = process.argv.slice(2);
  let sheetId = null;
  const wantPng = !argv.includes("--no-png");
  const checkOnly = argv.includes("--check");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sheet") sheetId = argv[++i];
    else if (argv[i] === "--no-png" || argv[i] === "--check") continue;
    else {
      console.error(`render-sheet: unknown arg ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!sheetId) {
    console.error("render-sheet: pass --sheet <id>");
    process.exit(2);
  }
  const sheet = SHEETS[sheetId];
  if (!sheet || !sheet.build) {
    console.error(`render-sheet: unknown sheet "${sheetId}"`);
    process.exit(2);
  }

  const { svg, notes, problems } = sheet.build({ repoRoot: REPO_ROOT });
  const outSvg = join(REPO_ROOT, sheet.outSvg);
  const outPng = join(REPO_ROOT, sheet.outPng);

  console.log(`mapforge · ${sheetId}`);
  for (const n of notes) console.log(`  ${n}`);

  if (problems.length) {
    console.error("\n  PROBLEMS:");
    for (const p of problems) console.error(`    ${p}`);
    process.exit(1);
  }

  if (checkOnly) {
    let committed = null;
    try {
      committed = readFileSync(outSvg, "utf8");
    } catch {
      /* missing = drift */
    }
    if (committed !== svg) {
      console.error(`\n  --check: stale committed svg at ${sheet.outSvg}`);
      process.exit(1);
    }
    console.log("\n  --check: no files written, no drift");
    process.exit(0);
  }

  mkdirSync(dirname(outSvg), { recursive: true });
  writeFileSync(outSvg, svg, "utf8");
  console.log(`\n  wrote ${outSvg} (${svg.length} bytes)`);

  if (wantPng) {
    const result = rasterize({
      svgPath: outSvg,
      pngPath: outPng,
      width: PNG_WIDTH,
      background: C.parchment,
    });
    if (result.ok) console.log(`  wrote ${outPng} (${PNG_WIDTH}px wide)`);
    else if (result.skipped) console.log(`  ${result.message}`);
    else {
      console.error(`  rsvg-convert failed: ${result.message}`);
      process.exit(1);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
