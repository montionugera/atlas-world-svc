#!/usr/bin/env node
// F-042 Task 8: map render drift-gate (G-MAP-DRIFT).
//
// tools/mapforge/render-sheet.mjs's SHEETS map is the single registry of
// spine-driven sheets (cluster1, atlas). This gate re-builds every sheet
// from the live spine and byte-compares the result against the committed
// SVG under game-client/assets/art/maps/ — the same contract as
// check_spine_emit.mjs's mirror drift check, one layer downstream (spine ->
// geography mirror -> SVG). A missing committed file counts as stale, same
// as check_spine_emit.mjs's missing-mirror handling.
//
// CLI: --check (default) byte-compares and writes nothing; --write
// regenerates every sheet's SVG + PNG (the fix path the --check failure
// message points at). main() guarded by import.meta.url, same pattern as
// check_spine_emit.mjs:233,258.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { SHEETS } from "../tools/mapforge/render-sheet.mjs";
import { rasterize } from "../tools/mapforge/lib/raster.mjs";
import { C } from "../tools/mapforge/lib/draft.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PNG_WIDTH = 2000;

// Iterates SHEETS — adding a sheet to the registry is enough to cover it
// here, no per-sheet branch to add.
export function checkMapRender({ repoRoot }) {
  const stale = [];
  const problems = [];
  for (const [id, sheet] of Object.entries(SHEETS)) {
    const built = sheet.build({ repoRoot });
    if (built.problems.length) {
      problems.push(...built.problems.map((p) => `${id}: ${p}`));
      continue; // a sheet with build problems has no meaningful svg to compare
    }
    const outSvg = join(repoRoot, sheet.outSvg);
    let committed = null;
    try {
      committed = readFileSync(outSvg, "utf8");
    } catch {
      /* missing committed file counts as stale */
    }
    if (committed !== built.svg) stale.push(id);
  }
  return { stale, problems };
}

function writeAll({ repoRoot }) {
  let failed = false;
  for (const [id, sheet] of Object.entries(SHEETS)) {
    const built = sheet.build({ repoRoot });
    if (built.problems.length) {
      console.error(`check-map-render: ${id}: PROBLEMS:`);
      for (const p of built.problems) console.error(`    ${p}`);
      failed = true;
      continue;
    }
    const outSvg = join(repoRoot, sheet.outSvg);
    const outPng = join(repoRoot, sheet.outPng);
    mkdirSync(dirname(outSvg), { recursive: true });
    writeFileSync(outSvg, built.svg, "utf8");
    console.log(`check-map-render: wrote ${sheet.outSvg} (${built.svg.length} bytes)`);
    const result = rasterize({ svgPath: outSvg, pngPath: outPng, width: PNG_WIDTH, background: C.parchment });
    if (result.ok) console.log(`check-map-render: wrote ${sheet.outPng} (${PNG_WIDTH}px wide)`);
    else if (result.skipped) console.log(`check-map-render: ${result.message}`);
    else {
      console.error(`check-map-render: ${id}: rsvg-convert failed: ${result.message}`);
      failed = true;
    }
  }
  return !failed;
}

function main() {
  const argv = process.argv.slice(2);
  let mode = "check";
  for (const arg of argv) {
    if (arg === "--check") mode = "check";
    else if (arg === "--write") mode = "write";
    else {
      console.error(`check-map-render: unknown arg ${arg}`);
      process.exit(2);
    }
  }
  if (mode === "write") {
    const ok = writeAll({ repoRoot: ROOT });
    process.exit(ok ? 0 : 1);
  }
  const { stale, problems } = checkMapRender({ repoRoot: ROOT });
  if (problems.length) {
    for (const p of problems) console.error(`check-map-render: PROBLEM: ${p}`);
  }
  if (stale.length) {
    for (const id of stale) console.error(`check-map-render: DRIFT ${id} (${SHEETS[id].outSvg})`);
  }
  if (stale.length || problems.length) {
    console.error("check-map-render: fix with `node scripts/check_map_render.mjs --write`");
    process.exit(1);
  }
  console.log(`check-map-render: check clean, ${Object.keys(SHEETS).length} sheets`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
