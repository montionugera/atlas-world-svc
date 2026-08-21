#!/usr/bin/env node
// mapforge — spine-driven sheet builder (F-042 Task 4).
//
// The drawn-from-data contract render-map.mjs used to carry, with the data
// coming from the spine (content/spine/) instead of a committed mirror JSON:
//   loadSpine -> buildTree -> resolveWorld (scripts/lib/places.mjs)
//   -> drawBasinSheet. That equivalence was proved before the switch: the
//   mirror was itself byte-emitted from this same join by check_spine_emit.mjs,
//   so this path produced a byte-identical SVG to the mirror-driven one.
//   Plan A Task 6 dropped the intermediate emitGeography serialise/parse, and
//   Task 12 deleted both the mirror and render-map.mjs — this is now the only
//   sheet builder, and G-RENDER-LOCK is what holds its bytes.
//
// Usage:
//   node tools/mapforge/render-sheet.mjs --sheet <id> [--png] [--png-width <n>] [--check]
//   default: SVG only. --png writes a 512 px REVIEW THUMB at outPng; that
//            thumb is the only raster ever committed. --png --png-width 2000
//            is the ship raster, produced on demand and NEVER committed.
//   --no-png: accepted and now a no-op, because not writing a PNG is the
//            default. Kept so every existing invocation and doc line — CI's
//            three `--no-png --check` lines included — keeps working.
//   --check: build, print problems, exit 1 if any OR if the built svg
//            differs from the committed outSvg; writes nothing.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { C } from "./lib/draft.mjs";
import { drawBasinSheet } from "./lib/basin-sheet.mjs";
import { buildAtlasSheet, ATLAS_MAX_LABEL_RANK } from "./lib/atlas-sheet.mjs";
import { buildSyntheticSheet } from "./lib/synthetic-sheet.mjs";
import { rasterize } from "./lib/raster.mjs";
import { loadSpine, buildTree } from "../../scripts/lib/spine.mjs";
// Plan A Task 6: the sheet reads the world document from the join authority
// directly. It used to import emitGeography from check_spine_emit.mjs and
// JSON.parse its output — the round-trip through a string was pure overhead:
// the mirror FILE was never read here (that was render-map.mjs), so this is
// a pure import swap with no byte consequence, proved by render-sheet.test.mjs.
import { resolveWorld } from "../../scripts/lib/places.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
// Plan B Task 11 (spec 2026-08-16 §7.5): the committed raster is a REVIEW
// THUMB, not the ship raster. .gitattributes:29 puts game-client/assets/**/
// *.png in LFS (but not *.svg), and LFS does not dedup across versions, so a
// committed 2000 px raster costs its full size on every redraw — the
// target-density canary alone was 2,534,694 B. The number lives in
// content/world/budgets.json (sheets.thumbWidthPx / maxThumbBytes) with its
// reason; this constant is the default that agrees with it, and
// tools/asset-storybook/tests/maps-index.test.mjs is what makes them agree.
const THUMB_WIDTH = 512;

export function buildCluster1Sheet({ repoRoot }) {
  const spine = loadSpine({ contentRoot: join(repoRoot, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const { doc, problems } = resolveWorld({ spine, tree });
  if (problems.length) return { svg: "", notes: [], problems };
  return drawBasinSheet({ doc });
}

export const SHEETS = {
  cluster1: {
    // `title` mirrors tools/asset-storybook/maps-index.json's row title —
    // the storybook parity gate (X8) checks paths today and Plan B extends it
    // to the title.
    //
    // `maxLabelRank` on THIS row is INERT, and saying so is the point (seam-4
    // review A, finding 6, verified): basin-sheet.mjs never calls placeLabels
    // at all — it draws its names directly — so nothing reads this number. It
    // stays because the roster is a contract every sheet answers the same
    // shape for, and because Plan E's redraw is where the basin sheet gets a
    // declutter pass; it is NOT a claim that the sheet declutters today. The
    // "which sheets actually RUN a label declutter" test in
    // tests/render-sheet.test.mjs pins that from the source, so this comment
    // cannot quietly stop being true. A world sheet was described here as
    // stopping at rank 3 — see the atlas row below for why that was wrong
    // about the sheet the repo actually ships.
    title: "Cluster 1 — Basin Survey",
    outSvg: "game-client/assets/art/maps/cluster1-world.svg",
    outPng: "game-client/assets/art/maps/cluster1-world.png",
    maxLabelRank: 10,
    build: buildCluster1Sheet,
  },
  atlas: {
    title: "The Atlas World — Mariners' Chart",
    outSvg: "game-client/assets/art/maps/atlas-world.svg",
    outPng: "game-client/assets/art/maps/atlas-world.png",
    // Plan B Task 12: read from the builder, not written twice. The literal
    // that used to sit here was 3, and the comment above described a world
    // sheet as drawing only "world title, ocean, continent, sea" — but this
    // sheet has lettered region titles (rank 4), port names (6) and
    // line-feature names (8) since F-043. Adopting the declutter at 3 would
    // have silently deleted 20 of its 26 names, because a label above the
    // tier is not drawn AND not counted as dropped.
    maxLabelRank: ATLAS_MAX_LABEL_RANK,
    build: buildAtlasSheet,
  },
  // Plan B Task 10 — the target-density canary. NOT geography: a synthetic
  // sheet at the size of the world Plan C generates (13 landmasses, 160
  // regions, 1,740 landform instances, 340 labels), so a render regression at
  // scale is visible against today's small chart. It is a registry entry, an
  // index row and a lock line like anything else the tree produces — the
  // "every produced artifact must be observable in a review surface" rule
  // applies to a test instrument too. `maxLabelRank: 10` because a canary that
  // hid seven of the ten ranks would be measuring the easy half.
  synthetic: {
    title: "Target-Density Canary",
    outSvg: "game-client/assets/art/maps/synthetic-density.svg",
    outPng: "game-client/assets/art/maps/synthetic-density.png",
    maxLabelRank: 10,
    build: buildSyntheticSheet,
  },
};

/**
 * The CLI contract, as a pure function — no process, no fs, no exit.
 *
 * It is separate from main() so the PNG POLICY can be tested at all. The
 * policy is "the default writes no raster", and the only other way to observe
 * that is to run the CLI and diff the output directory — which
 * tests/raster.test.mjs forbids outright, because game-client/assets/art/maps/
 * is the tracked tree and a suite that rewrites it mid-Gate-2 discards a
 * freshly regenerated sheet. So the contract is asserted here instead, and
 * main() below is a thin shell over it.
 *
 * Answers in-band ({ error }) rather than exiting or throwing — same
 * discipline as the sheet builders.
 */
export function parseArgs(argv) {
  let sheetId = null;
  // --png is OPT-IN. Not writing a raster is the default, so the expensive,
  // LFS-tracked byte can only appear when someone asked for it by name.
  const wantPng = argv.includes("--png");
  const checkOnly = argv.includes("--check");
  let pngWidth = THUMB_WIDTH;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sheet") sheetId = argv[++i];
    else if (argv[i] === "--png-width") pngWidth = Number(argv[++i]);
    else if (
      argv[i] === "--png" ||
      // --no-png is a LEGACY NO-OP: not writing a PNG is the default now. It
      // stays accepted because CI's three `--no-png --check` lines and the
      // README's examples would otherwise exit 2 on an unknown arg.
      argv[i] === "--no-png" ||
      argv[i] === "--check"
    )
      continue;
    else return { error: `render-sheet: unknown arg ${argv[i]}` };
  }
  if (!sheetId) return { error: "render-sheet: pass --sheet <id>" };
  if (!Number.isFinite(pngWidth) || pngWidth <= 0)
    return { error: "render-sheet: --png-width needs a positive number" };
  return { sheetId, wantPng, pngWidth, checkOnly };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(2);
  }
  const { sheetId, wantPng, pngWidth, checkOnly } = parsed;
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
      width: pngWidth,
      background: C.parchment,
    });
    if (result.ok) console.log(`  wrote ${outPng} (${pngWidth}px wide)`);
    else if (result.skipped) console.log(`  ${result.message}`);
    else {
      console.error(`  rsvg-convert failed: ${result.message}`);
      process.exit(1);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
