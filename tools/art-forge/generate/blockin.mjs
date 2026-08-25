import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { briefHash } from "../lib/brief-hash.mjs";
import { appendAttempt } from "../lib/run-ledger.mjs";

const execFileAsync = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FORGE_DIR = path.resolve(HERE, "..");
const RUNS_DIR = path.join(FORGE_DIR, "runs");

/**
 * Block-in / depth control producer.
 *
 * `blockin.mjs` was scratchpad-only and lost before it was ever committed
 * (see task-5-report.md for the recovery trail). This is a reconstruction,
 * recovered from two measurement records rather than guessed:
 *
 *  - docs/worldbuilding/ABP-flux-dev-and-anchor.md ("Job 2 — the composition
 *    anchor" + "The block-in generator") — the composition spec shape: a
 *    `masses` array of named, plane-tagged (`bg`/`mg`/`fg`) shapes
 *    (`rect` or `poly`) in normalised 0..1 coordinates, drawn back to front
 *    (painter's algorithm) with a `-blur` pass.
 *  - docs/worldbuilding/ABP-controlnet-rescue.md ("The depth control
 *    generator") — the depth-specific recipe: reuse that SAME spec
 *    ("same masses, same polygons, same draw order") but re-fill each mass
 *    by its `plane` bucket instead of its own colour `value`; the canvas
 *    itself is black (sky is the farthest thing in frame); no grain (grain
 *    feeds the img2img latent, not the ControlNet control encoder).
 *
 * Fill values are measured, not chosen.
 */
export const PLANE_DEPTH = Object.freeze({
  fg: "#b4b4b4", // NEVER #e8e8e8 — a near-white fg band renders as a glossy boat gunwale
  mg: "#8c8c8c",
  bg: "#333333",
});

// Masses draw back to front so nearer planes win overlaps.
const PLANE_ORDER = ["bg", "mg", "fg"];

// The canvas itself represents unaddressed space (sky) — the farthest thing
// in frame, per ABP-controlnet-rescue.md's depth generator comment ("canvas
// is black ... then masses draw back-to-front"). Deliberately NOT
// PLANE_DEPTH.bg: bg is a tier for drawn masses (e.g. a "sea" mass), one
// step lighter than empty sky. Collapsing them to the same value removes a
// depth tier — pinned by the "canvas fill is black" test below.
const CANVAS_FILL = "#000000";

/** Convert one mass (normalised 0..1 `rect` or `poly`) to an SVG points string in pixel space. */
function massToPoints({ mass, width, height }) {
  const px = (v, n) => Math.round(v * n);
  if (mass.shape === "rect") {
    const [x0, y0, x1, y1] = mass.rect;
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ]
      .map(([x, y]) => `${px(x, width)},${px(y, height)}`)
      .join(" ");
  }
  if (mass.shape === "poly") {
    return mass.points.map(([x, y]) => `${px(x, width)},${px(y, height)}`).join(" ");
  }
  throw new Error(`unknown shape "${mass.shape}" in mass "${mass.name}"`);
}

/**
 * Convert a full block-in spec (`brief.masses`, normalised 0..1 coordinates,
 * same shape a colour block-in would use) into the pixel-space,
 * plane-bucketed shape `buildDepthSvg` renders.
 */
export function depthPlanesFromBrief({ brief, width, height }) {
  const planes = { bg: [], mg: [], fg: [] };
  for (const mass of brief.masses ?? []) {
    if (!Object.hasOwn(planes, mass.plane)) {
      throw new Error(
        `mass "${mass.name}" has plane "${mass.plane}" — must be one of: ${PLANE_ORDER.join(", ")}`,
      );
    }
    planes[mass.plane].push({ points: massToPoints({ mass, width, height }) });
  }
  return { planes };
}

/** Build the depth SVG for one brief. Planes draw back to front. */
export function buildDepthSvg({ brief, width, height }) {
  const body = PLANE_ORDER.flatMap((plane) =>
    (brief.planes?.[plane] ?? []).map(
      (poly) => `<polygon points="${poly.points}" fill="${PLANE_DEPTH[plane]}"/>`,
    ),
  ).join("\n  ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <rect width="${width}" height="${height}" fill="${CANVAS_FILL}"/>`,
    `  ${body}`,
    `</svg>`,
  ].join("\n");
}

/**
 * Render a depth control PNG for one subject brief and write it to
 * `outPath`. Rasterises via ImageMagick (`magick`), already a repo
 * dependency for the silhouette pipeline — see forge.config.json's
 * `profiles.character.silhouettes` note — rather than adding a new one.
 * Applies the measured `-blur 0x6` pass; no grain (grain feeds the img2img
 * latent, not the ControlNet control encoder).
 */
export async function renderDepthPng({ brief, width, height, outPath }) {
  const svg = buildDepthSvg({
    brief: depthPlanesFromBrief({ brief, width, height }),
    width,
    height,
  });
  await mkdir(path.dirname(outPath), { recursive: true });
  const svgPath = `${outPath}.svg`;
  await writeFile(svgPath, svg, "utf8");
  try {
    await execFileAsync("magick", [
      svgPath,
      "-blur",
      "0x6",
      "-alpha",
      "off",
      "-colorspace",
      "sRGB",
      "-depth",
      "8",
      outPath,
    ]);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        'renderDepthPng needs the "magick" binary (ImageMagick) on PATH to rasterise the ' +
          "depth SVG, and it was not found. Install it — e.g. `brew install imagemagick` on " +
          "macOS — then retry.",
        { cause: err },
      );
    }
    throw err;
  } finally {
    await unlink(svgPath).catch(() => {});
  }
  // Run-ledger entry (F-050): the depth PNG is confirmed on disk — record
  // the block-in attempt against the brief's identity hash. Ledger failure
  // must NOT fail the run after the PNG was produced — warn and continue
  // (same policy as artifact-gate.mjs).
  try {
    appendAttempt(RUNS_DIR, brief.id, {
      type: "blockin",
      briefHash: briefHash(brief),
      out: path.relative(FORGE_DIR, outPath),
    });
  } catch (err) {
    console.error(`blockin.mjs: WARNING: ledger append failed: ${err.message}`);
  }
  return outPath;
}
