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

/**
 * Segment control producer — a sibling of the depth path above, NOT a
 * replacement. Same masses, same back-to-front PLANE_ORDER, same
 * -blur 0x6 rasterisation, but each polygon is filled with the mass's OWN
 * `value` colour instead of its plane's PLANE_DEPTH bucket. This is what
 * lets a river and its far bank — both plane "bg" — render as two distinct
 * labels instead of collapsing into one grey band. See
 * .superpowers/sdd/2026-08-08-town-art-segment-control/ for the design.
 */

/**
 * Minimum Chebyshev (max-per-channel) distance required between any two
 * mass `value` colours in one brief. A segment control image is a LABEL
 * map: two masses painted within a few levels of each other are one label
 * to the encoder, which is the exact failure the depth path had.
 */
export const SEGMENT_MIN_SEPARATION = 24;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** "#9aa4a8" -> [154, 164, 168]. Throws on anything that is not #rrggbb. */
export function parseHexColour(value, massName) {
  if (typeof value !== "string" || !HEX_RE.test(value)) {
    throw new Error(
      `mass "${massName}" has value ${JSON.stringify(value)} — a segment mass ` +
        'needs an explicit #rrggbb colour; an unfilled mass renders as the black ' +
        "canvas and becomes unlabelled space",
    );
  }
  const v = value.slice(1);
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

/**
 * Warn (never throw) about any pair of masses in one brief whose `value`
 * colours are closer than SEGMENT_MIN_SEPARATION. Advisory only — deferred
 * from being an enforced gate (see
 * .superpowers/sdd/2026-08-08-town-art-segment-control/task-2-report.md's
 * SEGMENT_MIN_SEPARATION section): A1-ART-02 "Millcross" already has
 * plausibly-deliberate near-identical pairs (town-row-left/town-row-right,
 * same substance on opposite riverbanks, spatially disjoint) that a strict
 * gate would have broken. This surfaces every such pair at render time so
 * Task 3's human verdict sees it without having to read that report.
 */
function warnOnNearSeparationPairs(parsedMasses) {
  for (let i = 0; i < parsedMasses.length; i++) {
    for (let j = i + 1; j < parsedMasses.length; j++) {
      const a = parsedMasses[i];
      const b = parsedMasses[j];
      const distance = Math.max(...a.rgb.map((c, k) => Math.abs(c - b.rgb[k])));
      if (distance < SEGMENT_MIN_SEPARATION) {
        console.warn(
          `[art-forge] segment masses "${a.name}" and "${b.name}" are only ${distance} apart ` +
            `(SEGMENT_MIN_SEPARATION=${SEGMENT_MIN_SEPARATION}) — they may render as one label to ` +
            "the ControlNet encoder; confirm this is intentional (same-substance masses that never " +
            "share a boundary) before trusting a segment result",
        );
      }
    }
  }
}

/**
 * Convert `brief.masses` into the pixel-space, per-plane shape
 * `buildSegmentSvg` renders. Same plane validation as `depthPlanesFromBrief`,
 * but each polygon carries its OWN fill taken from `mass.value`. Throws by
 * mass name if `value` is missing or malformed — an unfilled mass would
 * render as CANVAS_FILL, i.e. silently become unlabelled space. Also warns
 * (never throws) on any pair of masses too close to distinguish as separate
 * labels — see `warnOnNearSeparationPairs`.
 */
export function segmentMassesFromBrief({ brief, width, height }) {
  const planes = { bg: [], mg: [], fg: [] };
  const parsedMasses = [];
  for (const mass of brief.masses ?? []) {
    if (!Object.hasOwn(planes, mass.plane)) {
      throw new Error(
        `mass "${mass.name}" has plane "${mass.plane}" — must be one of: ${PLANE_ORDER.join(", ")}`,
      );
    }
    const rgb = parseHexColour(mass.value, mass.name); // validate before it reaches the SVG
    parsedMasses.push({ name: mass.name, rgb });
    planes[mass.plane].push({
      points: massToPoints({ mass, width, height }),
      fill: mass.value,
    });
  }
  warnOnNearSeparationPairs(parsedMasses);
  return { planes };
}

/**
 * Build the segment SVG. Planes draw back to front (same PLANE_ORDER as
 * depth) so nearer masses win overlaps; canvas fill stays CANVAS_FILL
 * (#000000 = unlabelled space).
 */
export function buildSegmentSvg({ brief, width, height }) {
  const { planes } = segmentMassesFromBrief({ brief, width, height });
  const body = PLANE_ORDER.flatMap((plane) =>
    planes[plane].map((poly) => `<polygon points="${poly.points}" fill="${poly.fill}"/>`),
  ).join("\n  ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <rect width="${width}" height="${height}" fill="${CANVAS_FILL}"/>`,
    `  ${body}`,
    `</svg>`,
  ].join("\n");
}

/**
 * Render a segment control PNG for one brief to `outPath`. Same `magick`
 * invocation and same `-blur 0x6` as renderDepthPng. Returns outPath.
 */
export async function renderSegmentPng({ brief, width, height, outPath }) {
  const svg = buildSegmentSvg({ brief, width, height });
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
        'renderSegmentPng needs the "magick" binary (ImageMagick) on PATH to rasterise the ' +
          "segment SVG, and it was not found. Install it — e.g. `brew install imagemagick` on " +
          "macOS — then retry.",
        { cause: err },
      );
    }
    throw err;
  } finally {
    await unlink(svgPath).catch(() => {});
  }
  return outPath;
}
