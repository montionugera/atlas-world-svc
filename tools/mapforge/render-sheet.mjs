#!/usr/bin/env node
// mapforge — spine-driven sheet builder (F-042 Task 4).
//
// Every sheet is drawn from data in content/ — no committed mirror JSON. Plan A
// Task 12 deleted the last mirror and render-map.mjs; G-RENDER-LOCK holds the
// built bytes.
//
// PLAN E RULING 8 (STATE §28, owner-approved 2026-08-26) — the `cluster1`
// basin sheet is RETIRED from SHEETS in the redraw commit. Its descriptor
// (content/spine/sheet.json) names subjects the redrawn 36-node trunk no
// longer hosts (f-west-coast, f-the-meltwash, f-northern-ice-edge, n-saltmire,
// n-eastern-hills, and ten basin regions under n-cluster1), so
// resolveWorld() returns five unresolvable-subject PROBLEMS and the sheet
// cannot render at all. The same ground survives in the RESOLVED world under
// different keys (coastline, river, saltmire, iceEdge, terrainPatches), which
// is why the ruling rebuilds this sheet resolved-backed in Plan E Task 8
// rather than repairing the spine-backed builder here. tools/mapforge/lib/
// basin-sheet.mjs and scripts/lib/places.mjs#resolveWorld are left on disk as
// that rebuild's raw material; nothing in this file reaches them any more.
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
import { buildAtlasSheet, ATLAS_MAX_LABEL_RANK } from "./lib/atlas-sheet.mjs";
import { buildSyntheticSheet } from "./lib/synthetic-sheet.mjs";
import { buildFabricSheet } from "./lib/fabric-sheet.mjs";
import { buildOverlaySheet } from "./lib/overlay-sheet.mjs";
import { rasterize } from "./lib/raster.mjs";

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

export const SHEETS = {
  // RETIRED (Plan E ruling 8): `cluster1` — the basin survey. Its subject
  // world died with the old trunk; see the header for the full reasoning and
  // for where it comes back. The storybook row, the art:map-cluster1 manifest
  // block and the committed cluster1-world.svg/.png bytes retire in the SAME
  // commit as this entry, because tools/asset-storybook/tests/
  // maps-index.test.mjs asserts the SHEETS <-> index correspondence in BOTH
  // directions and runs in Gate 1 AND CI — a stale row reds as hard as a
  // missing one. Roster arithmetic from the ruling: 5 -> 4 here; Task 8's 13
  // continent sheets take it to 17, inside budgets.sheets.maxSheets = 18,
  // which stays as the committed ceiling.
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
  // Plan C Task 13 — the two REVIEW sheets for the fabric layer. Registering
  // them here is not cosmetic: tools/asset-storybook/tests/maps-index.test.mjs
  // asserts in BOTH directions that every SHEETS id has an index row with
  // byte-matching svg/png paths that exist on disk, and that suite runs in
  // Gate 1 AND CI. That is the owner's every-artifact-observable rule made
  // mechanical, and it is why these entries and the storybook rows land in
  // the same commit as the fabric they draw.
  //
  // `maxLabelRank` on BOTH rows is INERT, and saying so is the point (the same
  // disclosure the cluster1 row above carries): neither builder calls
  // placeLabels — the fabric sheet draws thirteen continent ids directly and
  // the overlay sheet draws a fixed table — so nothing reads these numbers.
  // They stay because the roster is a contract every sheet answers the same
  // shape for, and render-sheet.test.mjs's "which sheets actually RUN a label
  // declutter" test pins the fact from the source so this cannot rot.
  fabric: {
    title: "The Generated World — Fabric Survey",
    outSvg: "game-client/assets/art/maps/world-fabric.svg",
    outPng: "game-client/assets/art/maps/world-fabric.png",
    maxLabelRank: 3,
    build: buildFabricSheet,
  },
  overlay: {
    title: "Coastline Overlay — Baseline vs Generated",
    outSvg: "game-client/assets/art/maps/world-overlay.svg",
    outPng: "game-client/assets/art/maps/world-overlay.png",
    maxLabelRank: 2,
    build: buildOverlaySheet,
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
