// Town plan renderer (F-040, task 7).
//
// Draws a town plan authored against content/schemas/town-plan.schema.json as a
// top-down map a human can READ — not a ControlNet signal. That distinction is
// the whole brief: blockin.mjs blurs its output on purpose because a control
// encoder wants soft depth bands; this file must never blur, because a map is
// judged by whether the owner can look at it and check the cart road really is
// three times an alley.
//
// The reference the owner named is Genshin's Mondstadt plan view. Mondstadt is
// walled, planned and tiered, and Millcross is none of those — A1 §6 says it has
// "no wall and no plan". So this takes Mondstadt's METHOD (a road spine at true
// width, footprints as masses, plazas and named landmarks) and drops its FORM
// (no ring wall, no bounded core). The legibility a wall would have given for
// free is bought back three ways instead:
//   1. every road is labelled with its own width in world units;
//   2. a scale bar plus two reference swatches — a 12-unit band and a 4-unit
//      band drawn at TRUE world size — sit in the footer, so the reader can hold
//      a road against the swatch with no arithmetic and no legend lookup;
//   3. the plan extent is drawn as a hairline and captioned as a plan bound, not
//      a wall, so an absent boundary reads as a decision rather than a bug.
//
// COORDINATE SPACE. Every drawing function below works in the plan's own WORLD
// UNITS (design §2, D2). Serialisation multiplies by DRAW_SCALE and nothing
// else, so a polygon measured off the markup and divided by DRAW_SCALE is a
// world measurement. That is not a convenience: it is what makes the drawing
// checkable, because there is no pixels-per-unit factor anywhere that could
// silently be wrong, and it is why the width test can MEASURE a road rather than
// read back an attribute this file wrote.
//
// ============================================================================
// THE RASTERISER CONSTRAINT — read this before changing any drawing code.
// ============================================================================
// The `magick` this renders through (ImageMagick 7.1.1 Q16-HDRI) is built
// WITHOUT librsvg — `magick -list configure | grep DELEGATES` lists no `rsvg` —
// so SVG goes through ImageMagick's own internal MSVG renderer, which converts
// the document to MVG and drops much of it. Measured with probe renders, not
// assumed. Three findings, and every one of them shapes the code below:
//
//   1. STROKE IS IGNORED on every element — <path>, <polyline>, <rect>,
//      <polygon>, <circle>. A stroked road renders as nothing at all. So does
//      stroke-dasharray, fill-opacity and stroke-opacity.
//      → This file is FILL-ONLY. Every outline is a "casing": a slightly larger
//        shape in the edge colour drawn underneath the fill. A casing renders
//        identically in MSVG, in librsvg and in a browser; a hairline does not.
//
//   2. A QUOTED CSS FONT STACK IS REJECTED outright — `font-family` is parsed
//      straight into an MVG `font` primitive and a list aborts the render with
//      "non-conforming drawing primitive definition".
//      → One unquoted family name, and no fallback list is available.
//
//   3. GLYPH ASCENDERS ARE CLIPPED below roughly 5 USER UNITS of font-size,
//      turning `h` into `n` and `d` into `a`. It is a user-space threshold, not
//      a pixel one: rendering the same document at four times the resolution
//      does not help, but scaling the document's own coordinate space does.
//      → DRAW_SCALE. The whole drawing is emitted at 16x, which puts the
//        smallest label at ~31 user units, comfortably clear of the cliff.
//
// If a future box has librsvg, none of this needs undoing — the output is
// ordinary SVG that any renderer draws correctly. But if someone adds a stroke
// or a font stack, it will look right in their browser and break in the PNG,
// which is what the rasteriser-constraint tests exist to catch.
//
// WHY ROADS ARE POLYGONS, NOT STROKES. Finding 1 left no choice, but it is also
// the right shape: scripts/lib/town-geometry.mjs already sweeps a road into
// convex quads plus a joint at every interior vertex, because two swept rects
// meeting at a bend leave a notch that belongs to neither. `roadQuads` below
// COPIES that approach rather than importing it — every module in
// tools/art-forge is self-contained and this package has no dependency on
// scripts/, so an import across that boundary would be the first one.
//
// It copies the approach with ONE DELIBERATE DIFFERENCE, documented on the
// function: the gate's joint is a parallelogram that over-estimates the swept
// area, which is the safe direction for a rule that rejects footprints too close
// to a road. For a picture it is the wrong direction — it draws fins sticking
// out of every shallow bend. The renderer uses the exact bevel instead.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

/* ---------------------------- layout constants ---------------------------- */

/**
 * SVG user units per world unit.
 *
 * Exists solely to clear MSVG's glyph-clipping cliff (header, finding 3): at
 * 1:1 a 2.1-unit label renders with its ascenders sheared off. 16 puts the
 * smallest text at ~31 user units with room to spare, and costs nothing —
 * the raster size is set by the <svg> width/height, not by this.
 *
 * Exported because the width tests divide by it. Every drawing function stays
 * in world units; only serialisation knows this number exists.
 */
export const DRAW_SCALE = 16;

/** Side margin around the plan extent, in world units. Roads run off the extent
 *  (the town "spills up each road"), so this must clear the widest road's half
 *  width — 7 for a 14-unit cart road — or a trunk road is cropped mid-surface. */
export const MARGIN = 14;

/** Title band above the extent, in world units. */
export const TITLE_BAND = 24;

/** Footer band below the extent: rule, scale bar + swatches, two legend rows. */
export const FOOTER_BAND = 58;

/** Length of the scale bar, in world units. Round, and about a fifth of a
 *  ~200-unit town so it compares to a real distance without dominating. */
export const SCALE_BAR_UNITS = 40;

/** The two scale-contract floors, drawn at true world size in the footer as
 *  reference bands. Measured, not chosen — design §3: largest mob radius 5 →
 *  a mob-passable cart road clears 12; player radius 1.3 → an alley clears 4. */
export const CART_ROAD_FLOOR = 12;
export const FOOT_ROAD_FLOOR = 4;

/** Default raster width in pixels. Height is derived from the plan's own aspect
 *  so the map is never letterboxed. */
export const DEFAULT_PX_WIDTH = 1800;

/** Casing thickness for a road, in world units: the surface sits on a band this
 *  much wider so the network reads as a drawn edge rather than a colour change.
 *  Purely cosmetic — the SURFACE is what carries the authored width. */
export const ROAD_CASING_WIDTH = 1.4;

/** Casing outset for a rect (footprint, plaza, legend swatch), in world units. */
const RECT_CASING = 0.55;
const RECT_CASING_HEAVY = 0.95;

/* -------------------------------- palette -------------------------------- */

// Warm cartographic parchment. Legibility only: unlike blockin.mjs's measured
// depth greys — where a wrong tone changes what the diffusion model generates —
// nothing downstream reads these values.
export const PALETTE = Object.freeze({
  paper: "#f3ead5",
  ground: "#ece0c4",
  extentLine: "#a8946e",
  water: "#7ba7c4",
  waterEdge: "#4d7d9c",
  waterInk: "#f2fbff",
  plaza: "#ddcda6",
  plazaEdge: "#a8946e",
  roadCasing: "#c2ac80",
  roadCart: "#efe3c2",
  roadFoot: "#e6d9b6",
  footprintEdge: "#53331d",
  tentEdge: "#8c7a53",
  ink: "#2f2a22",
  inkSoft: "#6b6152",
  gold: "#d99b1c",
  goldInk: "#7d5806",
});

/**
 * Footprint fills by `kind`. The plank-and-tent quarter is canvas rather than
 * roof tile, which is the one place a `kind` earns its own tone: A1 §6 makes the
 * east bank's tents a different KIND of settlement, not a different building.
 */
export const KIND_FILL = Object.freeze({
  mill: "#a9603a",
  dwelling: "#c08457",
  store: "#b7794c",
  stable: "#ab7048",
  shrine: "#b98a63",
  gate: "#9c7a55",
  tent: "#ded0ae",
  ruin: "#9d968a",
});

/** Fill for any footprint with `storeys >= 2`. Deliberately the darkest mass on
 *  the map: "tonally distinct" has to survive being printed in greyscale, so the
 *  distinction is VALUE, not hue. */
export const MULTI_STOREY_FILL = "#6f3a20";

/* --------------------------------- type ---------------------------------- */

/** One unquoted family — see the header, finding 2. No fallback list is possible. */
const FONT = "Helvetica";

// Font sizes in WORLD units, tuned for a ~200-unit town. DRAW_SCALE lifts them
// clear of the glyph-clipping cliff at serialisation time, so these can stay at
// the size the map's layout actually wants.
const FS_TITLE = 7.5;
const FS_SUBTITLE = 3.0;
const FS_LABEL = 2.4;
const FS_SMALL = 2.1;

/** Rough advance width per character as a fraction of font size. Used to decide
 *  whether a label fits inside a rect, and to place road labels clear of
 *  buildings — approximate on purpose, since exact metrics would need the font. */
const CHAR_ADVANCE = 0.53;

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A plain number, for data attributes and label text — NOT scaled. */
function num(n) {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

/** A world-unit length or coordinate, in SVG user units. The only place
 *  DRAW_SCALE is applied. */
function u(n) {
  return num(n * DRAW_SCALE);
}

/**
 * Relative luminance of a #rrggbb colour, 0..1. Picks label ink: dark text on a
 * pale tent, pale text on a dark mill. Computed rather than hard-coded per kind
 * so adding a kind to KIND_FILL cannot produce an unreadable label.
 */
export function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const v = parseInt(m[1], 16);
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * A text run.
 *
 * Emitted as a haloed copy plus the real glyphs. The halo uses `fill="none"` +
 * stroke, which MSVG ignores entirely — harmless, the two runs sit exactly on
 * top of each other — but which a browser or librsvg draws properly. So one
 * piece of markup is a plain label in the PNG and a haloed label wherever haloes
 * work, with no branch and nothing to keep in sync.
 */
function text({
  x,
  y,
  str,
  size = FS_LABEL,
  fill = PALETTE.ink,
  anchor = "middle",
  weight = "400",
  halo = PALETTE.paper,
}) {
  const common = `x="${u(x)}" y="${u(y)}" font-family="${FONT}" font-size="${u(size)}" font-weight="${weight}" text-anchor="${anchor}"`;
  const body = esc(str);
  const haloEl = halo
    ? `<text ${common} fill="none" stroke="${halo}" stroke-width="${u(size * 0.34)}" stroke-linejoin="round">${body}</text>`
    : "";
  return `${haloEl}<text ${common} fill="${fill}">${body}</text>`;
}

/** Approximate width of a label in world units. */
function textWidth(str, size) {
  return str.length * CHAR_ADVANCE * size;
}

function textFits(str, size, availableWidth) {
  return textWidth(str, size) <= availableWidth - 1;
}

/* -------------------------------- geometry -------------------------------- */

const EPSILON = 1e-9;

function normalizeRect(r) {
  const [ax, ay, bx, by] = r;
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}

function outset([x0, y0, x1, y1], d) {
  return [x0 - d, y0 - d, x1 + d, y1 + d];
}

function overlapArea(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

function rect([x0, y0, x1, y1], fill, extra = "") {
  return `<rect x="${u(x0)}" y="${u(y0)}" width="${u(x1 - x0)}" height="${u(y1 - y0)}" fill="${fill}"${extra ? ` ${extra}` : ""}/>`;
}

function polygonPoints(poly) {
  return poly.map(([x, y]) => `${u(x)},${u(y)}`).join(" ");
}

/**
 * The swept area of a road of the given width along a polyline, as convex
 * polygons whose union is the road: one quad per segment, then a bevel joint at
 * every interior vertex.
 *
 * COPIED FROM scripts/lib/town-geometry.mjs `roadPolygon` — same sweep, same
 * reasoning about why joints are needed at all, deliberately not imported (see
 * the header note on package boundaries).
 *
 * IT DIVERGES ON THE JOINT, on purpose. The gate emits the parallelogram
 * V ± n1·h ± n2·h, which CONTAINS the notch and then some: at a shallow bend
 * |n1 + n2| approaches 2, so it reaches a full width from the centreline instead
 * of a half width. For a gate that over-estimate is the safe direction — a
 * footprint too close to a bend gets rejected rather than waved through. For a
 * picture it is simply wrong, and it looked it: every shallow bend in the
 * Millcross spine grew a visible fin.
 *
 * So the joint here is the exact bevel — the two triangles (V, V+n1·h, V+n2·h)
 * and (V, V−n1·h, V−n2·h). Together they fill the notch precisely and reach no
 * further than the road does. One of the pair is always redundant (on the inside
 * of a turn the swept rects already overlap) but it is the same fill, and
 * emitting both avoids a cross-product branch for no gain.
 *
 * SEGMENT QUADS COME FIRST, and each is [A+n·h, B+n·h, B−n·h, A−n·h] — so the
 * distance from a quad's corner 0 to its corner 3 is exactly `width`. That is
 * what the width test measures.
 *
 * @param {Array<[number, number]>} points centreline, 2+ points
 * @param {number} width full road width in world units
 * @returns {Array<Array<[number, number]>>}
 */
export function roadQuads(points, width) {
  if (!Array.isArray(points) || points.length < 2)
    throw new TypeError("townplan: roadQuads needs 2+ centreline points");
  if (!(width > 0)) throw new TypeError("townplan: roadQuads needs width > 0");

  // Drop repeated points: a zero-length segment has no direction, so no normal,
  // and would poison every joint touching it.
  const pts = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > EPSILON) pts.push([p[0], p[1]]);
  }
  if (pts.length < 2) throw new TypeError("townplan: roadQuads needs 2+ DISTINCT centreline points");

  const h = width / 2;
  const quads = [];
  const normals = [];

  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    normals.push([nx, ny]);
    quads.push([
      [ax + nx * h, ay + ny * h],
      [bx + nx * h, by + ny * h],
      [bx - nx * h, by - ny * h],
      [ax - nx * h, ay - ny * h],
    ]);
  }

  for (let i = 1; i < pts.length - 1; i++) {
    const [n1x, n1y] = normals[i - 1];
    const [n2x, n2y] = normals[i];
    // Collinear (or an exact reversal): the swept rects already abut, so there
    // is no notch and the bevel would be a degenerate sliver.
    if (Math.abs(n1x * n2y - n1y * n2x) <= EPSILON) continue;
    const [vx, vy] = pts[i];
    for (const s of [1, -1]) {
      quads.push([
        [vx, vy],
        [vx + s * n1x * h, vy + s * n1y * h],
        [vx + s * n2x * h, vy + s * n2y * h],
      ]);
    }
  }

  return quads;
}

function centroid(poly) {
  let sx = 0;
  let sy = 0;
  for (const [x, y] of poly) {
    sx += x;
    sy += y;
  }
  return [sx / poly.length, sy / poly.length];
}

/** The SVG viewBox for a plan, in WORLD units: the extent plus a margin, a title
 *  band on top and a footer band below. Serialisation scales it by DRAW_SCALE. */
export function planViewBox(plan) {
  const w = plan?.extent?.width;
  const h = plan?.extent?.height;
  if (!(w > 0) || !(h > 0)) {
    throw new TypeError("townplan: plan.extent.width/height must be positive numbers");
  }
  return {
    x: -MARGIN,
    y: -TITLE_BAND,
    width: w + 2 * MARGIN,
    height: TITLE_BAND + h + FOOTER_BAND,
  };
}

/* --------------------------------- layers --------------------------------- */

/** Paper, then the plan extent as a hairline casing with the ground inside it.
 *  The extent is a PLAN BOUND, not a wall — captioned as such in the legend, so
 *  the missing wall reads as A1 §6's "no wall and no plan" rather than an
 *  unfinished drawing. */
function drawGround(plan, vb) {
  const { width: w, height: h } = plan.extent;
  return [
    rect([vb.x, vb.y, vb.x + vb.width, vb.y + vb.height], PALETTE.paper),
    rect([-0.5, -0.5, w + 0.5, h + 0.5], PALETTE.extentLine, 'class="extent-edge"'),
    rect([0, 0, w, h], PALETTE.ground, 'class="extent"'),
  ].join("\n  ");
}

function drawWater(plan) {
  return (plan.water ?? [])
    .map(
      (w) =>
        `<polygon class="water" data-water="${esc(w.id)}" points="${polygonPoints(w.poly)}" fill="${PALETTE.water}"/>`,
    )
    .join("\n  ");
}

function drawPlazas(plan) {
  return (plan.plazas ?? [])
    .flatMap((p) => {
      const r = normalizeRect(p.rect);
      return [
        rect(outset(r, RECT_CASING), PALETTE.plazaEdge, 'class="plaza-casing"'),
        rect(r, PALETTE.plaza, `class="plaza" data-plaza="${esc(p.id)}"`),
      ];
    })
    .join("\n  ");
}

/**
 * Roads, as filled swept polygons at their TRUE authored width.
 *
 * Two global passes, not casing+surface per road: a casing drawn per-road would
 * be painted over its neighbour's surface at every junction and the spine would
 * read as a chain of separate sticks. All casings first, then all surfaces, and
 * the network reads as one continuous surface — which is what "the town spills
 * up each road" has to look like.
 *
 * Only the SURFACE group carries `data-road`, so "the road's drawn width equals
 * the authored width" stays one unambiguous measurement.
 */
function drawRoads(plan) {
  const roads = plan.roads ?? [];
  const group = (r, width, fill, cls, idAttr) =>
    [
      `<g class="${cls}"${idAttr}>`,
      ...roadQuads(r.points, width).map((q) => `  <polygon points="${polygonPoints(q)}" fill="${fill}"/>`),
      `</g>`,
    ].join("\n  ");

  const casings = roads.map((r) =>
    group(r, r.width + ROAD_CASING_WIDTH, PALETTE.roadCasing, "road-casing", ` data-road-casing="${esc(r.id)}"`),
  );
  const surfaces = roads.map((r) =>
    group(
      r,
      r.width,
      r.kind === "cart" ? PALETTE.roadCart : PALETTE.roadFoot,
      `road road--${esc(r.kind)}`,
      ` data-road="${esc(r.id)}" data-kind="${esc(r.kind)}" data-width="${num(r.width)}"`,
    ),
  );
  return [...casings, ...surfaces].join("\n  ");
}

/* ---------------------------- label placement ----------------------------- */
//
// Millcross has no bounded core: roads ribbon out past rows of buildings, so
// there is no "outside the town" to push labels into and no free ring the way a
// walled plan like Mondstadt gets for free. Placing every label at the obvious
// spot collided four of seven road labels with a building and buried the river's
// name under a landmark dot.
//
// So the free-form labels (roads, water) are placed by scoring a small fixed set
// of candidate positions against everything already committed to the page, and
// each label joins the obstacle set once placed. Deliberately NOT a general
// label-placement solver: the candidate set is small and enumerated, so the
// worst case is a label that still overlaps something — never a label somewhere
// surprising, and never a run that does not terminate.

/** The rect a label occupies, in world units. `y` is the text baseline. */
function labelBox(x, y, str, size, anchor) {
  const w = textWidth(str, size);
  const h = size * 1.25;
  const x0 = anchor === "middle" ? x - w / 2 : anchor === "start" ? x : x - w;
  return [x0, y - h * 0.8, x0 + w, y + h * 0.2];
}

/** Total area a candidate box steals from things already on the page. */
function clashArea(box, obstacles) {
  return obstacles.reduce((sum, o) => sum + overlapArea(box, o), 0);
}

/** Pick the lowest-scoring candidate. `rank` breaks ties between equally clear
 *  positions, so a clash always outweighs any preference. */
function bestCandidate(candidates, obstacles) {
  let best = null;
  for (const c of candidates) {
    const score = clashArea(c.box, obstacles) * 1000 + c.rank;
    if (!best || score < best.score) best = { ...c, score };
  }
  return best;
}

/** Where a footprint's label goes: inside the mass if it fits, otherwise just
 *  below it. Fixed rather than searched — a building's name belongs to the
 *  building, and moving it elsewhere would cost more legibility than it buys. */
function footprintLabelPlacement(f) {
  const [x0, y0, x1, y1] = normalizeRect(f.rect);
  const multi = (f.storeys ?? 1) >= 2;
  const str = multi ? `${f.id} · ${f.storeys} storeys` : f.id;
  const inside = textFits(str, FS_SMALL, x1 - x0);
  const x = (x0 + x1) / 2;
  const y = inside ? (y0 + y1) / 2 + FS_SMALL * 0.35 : y1 + FS_SMALL + 1.4;
  return {
    x,
    y,
    str,
    inside,
    onDark: inside && luminance(footprintFill(f)) < 0.55,
    box: labelBox(x, y, str, FS_SMALL, "middle"),
  };
}

/** The marker and caption of a landmark, as one box to steer other labels around. */
function landmarkBox(l) {
  const [x, y] = l.at;
  const r = l.firstSight ? 6.6 : 3.1;
  const caption = labelBox(
    l.firstSight ? x - 9 : x,
    l.firstSight ? y + 3.2 : y + 7,
    l.id,
    FS_LABEL,
    l.firstSight ? "end" : "middle",
  );
  return [Math.min(x - r, caption[0]), Math.min(y - r, caption[1]), Math.max(x + r, caption[2]), Math.max(y + r, caption[3])];
}

/** Everything already committed to the page before the free-form labels run. */
function committedBoxes(plan) {
  return [
    ...(plan.footprints ?? []).map((f) => normalizeRect(f.rect)),
    ...(plan.plazas ?? []).map((p) => normalizeRect(p.rect)),
    ...(plan.footprints ?? []).map((f) => footprintLabelPlacement(f).box),
    ...(plan.landmarks ?? []).map(landmarkBox),
  ];
}

/**
 * Candidate positions for a road's label: three points along each segment, on
 * either side of the road. Roads themselves are not obstacles — a label on pale
 * road surface is perfectly readable, and on a plan this dense there is nowhere
 * else for most of them to go.
 */
function placeRoadLabel(road, label, obstacles) {
  const gap = road.width / 2 + 2;
  const h = FS_SMALL * 1.25;
  const candidates = [];

  for (let i = 0; i < road.points.length - 1; i++) {
    const [ax, ay] = road.points[i];
    const [bx, by] = road.points[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay);
    for (const t of [0.5, 0.3, 0.7]) {
      const mx = ax + (bx - ax) * t;
      const my = ay + (by - ay) * t;
      for (const side of [-1, 1]) {
        const pos = horizontal
          ? { x: mx, y: my + side * gap + (side < 0 ? 0 : h * 0.8), anchor: "middle" }
          : { x: mx + side * gap, y: my, anchor: side > 0 ? "start" : "end" };
        candidates.push({
          ...pos,
          box: labelBox(pos.x, pos.y, label, FS_SMALL, pos.anchor),
          // Prefer the longest segment, then its midpoint, then the side a label
          // conventionally sits on (above the road, or to its right).
          rank: -len + Math.abs(t - 0.5) * 40 + (side < 0 ? 0 : 1),
        });
      }
    }
  }
  return bestCandidate(candidates, obstacles);
}

/** Road labels carry the width in world units — the map's own claim about the
 *  scale contract, which is what makes the 12-unit floor checkable per road
 *  rather than only against the footer band. */
function drawRoadLabels(plan, obstacles) {
  return (plan.roads ?? [])
    .map((r) => {
      const label = `${r.id} · ${num(r.width)}u`;
      const at = placeRoadLabel(r, label, obstacles);
      if (!at) return "";
      obstacles.push(at.box);
      return text({ x: at.x, y: at.y, str: label, size: FS_SMALL, fill: PALETTE.inkSoft, anchor: at.anchor });
    })
    .join("\n  ");
}

function footprintFill(f) {
  return (f.storeys ?? 1) >= 2 ? MULTI_STOREY_FILL : (KIND_FILL[f.kind] ?? KIND_FILL.dwelling);
}

/** Footprint casings, then fills, then the upper-storey inset on the tall ones —
 *  three passes for the same reason roads use two. */
function drawFootprints(plan) {
  const fps = plan.footprints ?? [];
  const casings = fps.map((f) => {
    const multi = (f.storeys ?? 1) >= 2;
    const edge = f.kind === "tent" && !multi ? PALETTE.tentEdge : PALETTE.footprintEdge;
    return rect(
      outset(normalizeRect(f.rect), multi ? RECT_CASING_HEAVY : RECT_CASING),
      edge,
      'class="footprint-casing"',
    );
  });
  const fills = fps.map((f) =>
    rect(
      normalizeRect(f.rect),
      footprintFill(f),
      `class="footprint footprint--${esc(f.kind)}${(f.storeys ?? 1) >= 2 ? " footprint--multi-storey" : ""}" data-footprint="${esc(f.id)}" data-kind="${esc(f.kind)}" data-storeys="${num(f.storeys ?? 1)}"`,
    ),
  );
  // An inset ring reads as an upper storey without pretending to be 3D.
  // `storeys` is a rendering hint only (design §2) — the collision binder gets
  // the flat rect either way.
  const uppers = fps
    .filter((f) => (f.storeys ?? 1) >= 2)
    .flatMap((f) => {
      const r = normalizeRect(f.rect);
      return [
        rect(outset(r, -1.6), PALETTE.paper, 'class="footprint-upper-ring"'),
        rect(outset(r, -2.1), MULTI_STOREY_FILL, 'class="footprint-upper"'),
      ];
    });
  return [...casings, ...fills, ...uppers].join("\n  ");
}

function drawFootprintLabels(plan) {
  return (plan.footprints ?? [])
    .map((f) => {
      const at = footprintLabelPlacement(f);
      return text({
        x: at.x,
        y: at.y,
        str: at.str,
        size: FS_SMALL,
        fill: at.onDark ? PALETTE.paper : PALETTE.ink,
        halo: at.inside ? null : PALETTE.paper,
      });
    })
    .join("\n  ");
}

function drawPlazaLabels(plan) {
  return (plan.plazas ?? [])
    .map((p) => {
      const [x0, y0, x1, y1] = normalizeRect(p.rect);
      return text({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, str: p.id, size: FS_LABEL, fill: PALETTE.ink });
    })
    .join("\n  ");
}

/**
 * Water labels ride along the body's long axis rather than sitting at its
 * centroid. The Meltwash runs the full height of the plan and its centroid is
 * the ford — so the centroid is precisely where the river's name is guaranteed
 * to collide with the busiest landmark on the map. It did.
 */
function drawWaterLabels(plan, obstacles) {
  return (plan.water ?? [])
    .map((w) => {
      const xs = w.poly.map((p) => p[0]);
      const ys = w.poly.map((p) => p[1]);
      const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const [cx, cy] = centroid(w.poly);
      const alongY = bbox[3] - bbox[1] >= bbox[2] - bbox[0];
      const candidates = [0.5, 0.25, 0.75, 0.15, 0.85].map((t) => {
        const x = alongY ? cx : bbox[0] + (bbox[2] - bbox[0]) * t;
        const y = alongY ? bbox[1] + (bbox[3] - bbox[1]) * t : cy;
        return { x, y, box: labelBox(x, y, w.id, FS_SMALL, "middle"), rank: Math.abs(t - 0.5) };
      });
      const at = bestCandidate(candidates, obstacles);
      obstacles.push(at.box);
      return text({ x: at.x, y: at.y, str: w.id, size: FS_SMALL, fill: PALETTE.waterInk, halo: null });
    })
    .join("\n  ");
}

/** A five-pointed star, centred — only ever the firstSight marker. */
function starPath(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return `M${pts.map(([x, y]) => `${u(x)},${u(y)}`).join("L")}Z`;
}

/**
 * Landmarks. The one with `firstSight: true` — what A1 §6 says a traveller sees
 * before anything else — gets a gold ring, a star and a shouted caption, because
 * "which of these dots is the first sight" is exactly the question the owner
 * will put to the picture.
 *
 * Its caption sits BESIDE the ring rather than under it. A firstSight landmark
 * is on a road by definition — it is what you see on the way in — and a road has
 * buildings on both sides, so the space under the marker is the one place the
 * caption is most likely to collide. (It did: the first render put "cart-queue /
 * FIRST SIGHT" straight through west-row-a's label.)
 */
function drawLandmarks(plan) {
  return (plan.landmarks ?? [])
    .map((l) => {
      const [x, y] = l.at;
      if (l.firstSight) {
        return [
          `<g class="landmark landmark--first-sight" data-landmark="${esc(l.id)}" data-first-sight="${esc(l.id)}">`,
          `  <circle cx="${u(x)}" cy="${u(y)}" r="${u(6.6)}" fill="${PALETTE.gold}"/>`,
          `  <circle cx="${u(x)}" cy="${u(y)}" r="${u(5.4)}" fill="${PALETTE.paper}"/>`,
          `  <path d="${starPath(x, y, 4.3)}" fill="${PALETTE.gold}"/>`,
          `  ${text({ x: x - 9, y: y - 0.4, str: l.id, size: FS_LABEL, weight: "700", anchor: "end" })}`,
          `  ${text({ x: x - 9, y: y + 3.2, str: "FIRST SIGHT", size: FS_SMALL, fill: PALETTE.goldInk, weight: "700", anchor: "end" })}`,
          `</g>`,
        ].join("\n  ");
      }
      return [
        `<g class="landmark" data-landmark="${esc(l.id)}">`,
        `  <circle cx="${u(x)}" cy="${u(y)}" r="${u(3.1)}" fill="${PALETTE.paper}"/>`,
        `  <circle cx="${u(x)}" cy="${u(y)}" r="${u(2.3)}" fill="${PALETTE.ink}"/>`,
        `  ${text({ x, y: y + 7, str: l.id, size: FS_LABEL })}`,
        `</g>`,
      ].join("\n  ");
    })
    .join("\n  ");
}

/** North arrow. Worth the ink: the Meltwash runs north–south down this plan and
 *  +y is drawn downward, so "up is north" is not something a reader can infer. */
function drawNorthArrow(plan) {
  const x = plan.extent.width - 6;
  const y = -TITLE_BAND + 6;
  return [
    `<g class="north-arrow">`,
    `  <path d="M${u(x)},${u(y)} L${u(x - 2.8)},${u(y + 7.4)} L${u(x)},${u(y + 5.4)} L${u(x + 2.8)},${u(y + 7.4)} Z" fill="${PALETTE.ink}"/>`,
    `  ${text({ x, y: y + 12.8, str: "N", size: FS_SUBTITLE, weight: "700" })}`,
    `</g>`,
  ].join("\n  ");
}

function drawTitle(plan) {
  const y = -TITLE_BAND;
  const name = String(plan.town ?? "town");
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  const anchor = (plan.anchor?.geographyAt ?? []).map(num).join(", ");
  return [
    text({ x: 0, y: y + 9, str: `${title} — town plan`, size: FS_TITLE, anchor: "start", weight: "700", halo: null }),
    text({
      x: 0,
      y: y + 15.5,
      str: `top-down · world units · extent ${num(plan.extent.width)} × ${num(plan.extent.height)} · anchored at [${anchor}]`,
      size: FS_SUBTITLE,
      anchor: "start",
      fill: PALETTE.inkSoft,
      halo: null,
    }),
  ].join("\n  ");
}

/**
 * Scale bar plus the two reference bands.
 *
 * The bands are the point of this footer. A scale bar alone answers "how far is
 * that", but the brief asks whether the 12-unit cart road is VISUALLY CHECKABLE
 * — so the footer also carries a band exactly 12 units thick and one exactly 4
 * units thick, in the same world space as the map. Holding a road against them
 * is a direct comparison with no arithmetic and no legend lookup.
 */
function drawScaleBar(plan) {
  const h = plan.extent.height;
  const top = h + 8;
  const barY = top + 11;
  const barH = 3;
  const seg = SCALE_BAR_UNITS / 4;
  const parts = [
    rect([0, top, plan.extent.width, top + 0.4], PALETTE.extentLine, 'class="footer-rule"'),
    `<g class="scale-bar" data-scale-bar="${num(SCALE_BAR_UNITS)}">`,
    `  ${rect(outset([0, barY, SCALE_BAR_UNITS, barY + barH], 0.4), PALETTE.ink)}`,
  ];
  for (let i = 0; i < 4; i++) {
    parts.push(`  ${rect([i * seg, barY, (i + 1) * seg, barY + barH], i % 2 === 0 ? PALETTE.ink : PALETTE.paper)}`);
  }
  for (const t of [0, SCALE_BAR_UNITS / 2, SCALE_BAR_UNITS]) {
    parts.push(`  ${text({ x: t, y: barY - 1.8, str: num(t), size: FS_SMALL, halo: null })}`);
  }
  parts.push(
    `  ${text({ x: SCALE_BAR_UNITS / 2, y: barY + barH + 4.2, str: "world units", size: FS_SMALL, fill: PALETTE.inkSoft, halo: null })}`,
  );
  parts.push(`</g>`);

  const band = (x, units, caption) => {
    const r = [x, barY + barH / 2 - units / 2, x + 26, barY + barH / 2 + units / 2];
    return [
      `<g class="scale-swatch" data-swatch-units="${num(units)}">`,
      `  ${rect(outset(r, 0.5), PALETTE.roadCasing)}`,
      `  ${rect(r, PALETTE.roadCart, `class="swatch-band" data-swatch-band="${num(units)}"`)}`,
      `  ${text({ x: x + 13, y: barY + barH + 7.6, str: caption, size: FS_SMALL, fill: PALETTE.inkSoft, halo: null })}`,
      `</g>`,
    ].join("\n  ");
  };

  parts.push(band(74, CART_ROAD_FLOOR, `cart floor ${num(CART_ROAD_FLOOR)}u — mob-passable`));
  parts.push(band(140, FOOT_ROAD_FLOOR, `foot floor ${num(FOOT_ROAD_FLOOR)}u — player-only`));
  parts.push(
    text({
      x: plan.extent.width,
      y: barY - 3.4,
      str: "bands drawn at true world size — hold a road against them",
      size: FS_SMALL,
      fill: PALETTE.inkSoft,
      anchor: "end",
      halo: null,
    }),
  );
  return parts.join("\n  ");
}

function boxSwatch(fill, edge) {
  return (x, y) => [rect(outset([x, y, x + 5, y + 4], 0.5), edge), rect([x, y, x + 5, y + 4], fill)].join(" ");
}

function legendChip({ x, y, swatch, label }) {
  return [
    `<g class="legend-chip">`,
    `  ${swatch(x, y)}`,
    `  ${text({ x: x + 7.5, y: y + 3.2, str: label, size: FS_SMALL, anchor: "start", halo: null })}`,
    `</g>`,
  ].join("\n  ");
}

/** Two legend rows rather than one: ten chips on a single line at this size
 *  collide, and a legend that must be squinted at defeats itself. */
function drawLegend(plan) {
  const h = plan.extent.height;
  const rows = [
    [
      [boxSwatch(PALETTE.water, PALETTE.waterEdge), "water — not collision"],
      [boxSwatch(PALETTE.roadCart, PALETTE.roadCasing), "cart road"],
      [boxSwatch(PALETTE.roadFoot, PALETTE.roadCasing), "foot road"],
      [boxSwatch(PALETTE.plaza, PALETTE.plazaEdge), "plaza"],
      [boxSwatch(PALETTE.ground, PALETTE.extentLine), "plan extent — no wall (A1 §6)"],
    ],
    [
      [boxSwatch(KIND_FILL.dwelling, PALETTE.footprintEdge), "dwelling / store / stable"],
      [boxSwatch(KIND_FILL.tent, PALETTE.tentEdge), "plank-and-tent quarter"],
      [boxSwatch(MULTI_STOREY_FILL, PALETTE.footprintEdge), "2 storeys — the mill-house"],
      [(x, y) => `<circle cx="${u(x + 2.5)}" cy="${u(y + 2)}" r="${u(2)}" fill="${PALETTE.ink}"/>`, "landmark"],
      [(x, y) => `<path d="${starPath(x + 2.5, y + 2, 2.8)}" fill="${PALETTE.gold}"/>`, "first sight"],
    ],
  ];
  const colWidth = plan.extent.width / 5;
  return rows
    .flatMap((row, r) =>
      row.map(([swatch, label], c) => legendChip({ x: c * colWidth, y: h + 34 + r * 8, swatch, label })),
    )
    .join("\n  ");
}

/* --------------------------------- build --------------------------------- */

/**
 * Build the town-plan SVG for one plan document.
 *
 * `width` / `height` are PIXEL dimensions of the raster. The drawing itself is
 * world units scaled by DRAW_SCALE, so changing them rescales the image without
 * touching a single number in the geometry. Omit `height` and it is derived from
 * the plan's aspect — the only way to guarantee no letterboxing.
 *
 * @param {object} args
 * @param {object} args.plan   a document matching content/schemas/town-plan.schema.json
 * @param {number} [args.width]
 * @param {number} [args.height]
 * @returns {string}
 */
export function buildTownPlanSvg({ plan, width = DEFAULT_PX_WIDTH, height } = {}) {
  if (!plan || typeof plan !== "object") throw new TypeError("townplan: buildTownPlanSvg needs { plan }");
  const vb = planViewBox(plan);
  const pxWidth = width;
  const pxHeight = height ?? Math.round((pxWidth * vb.height) / vb.width);

  // One shared, growing obstacle set: each free-form label steers around
  // everything already committed, including the labels placed before it.
  const obstacles = committedBoxes(plan);

  const layers = [
    drawGround(plan, vb),
    drawWater(plan),
    drawPlazas(plan),
    drawRoads(plan),
    drawFootprints(plan),
    drawWaterLabels(plan, obstacles),
    drawRoadLabels(plan, obstacles),
    drawPlazaLabels(plan),
    drawFootprintLabels(plan),
    drawLandmarks(plan),
    drawTitle(plan),
    drawNorthArrow(plan),
    drawScaleBar(plan),
    drawLegend(plan),
  ].filter(Boolean);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pxWidth}" height="${pxHeight}" viewBox="${u(vb.x)} ${u(vb.y)} ${u(vb.width)} ${u(vb.height)}" preserveAspectRatio="xMidYMid meet">`,
    `  ${layers.join("\n  ")}`,
    `</svg>`,
  ].join("\n");
}

/**
 * Rasterise a town plan to PNG at `outPath`.
 *
 * Same `magick` execFile route blockin.mjs uses — ImageMagick is already a repo
 * dependency for the silhouette pipeline, so this adds none — and the same
 * ENOENT → "install imagemagick" error shape, because a missing binary should
 * say what to install rather than surface a bare spawn failure.
 *
 * NO `-blur`. blockin.mjs blurs because a ControlNet depth encoder wants soft
 * bands; this is a map for a human to read, and every blurred pixel is a road
 * edge the owner can no longer measure against the footer bands.
 *
 * @param {object} args
 * @param {object} args.plan
 * @param {string} args.outPath
 * @param {number} [args.width]
 * @param {number} [args.height]
 * @returns {Promise<string>} outPath
 */
export async function renderTownPlanPng({ plan, outPath, width, height } = {}) {
  if (!outPath) throw new TypeError("townplan: renderTownPlanPng needs { outPath }");
  const svg = buildTownPlanSvg({ plan, width, height });
  await mkdir(path.dirname(outPath), { recursive: true });
  const svgPath = `${outPath}.svg`;
  await writeFile(svgPath, svg, "utf8");
  try {
    await execFileAsync("magick", [svgPath, "-alpha", "off", "-colorspace", "sRGB", "-depth", "8", outPath]);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        'renderTownPlanPng needs the "magick" binary (ImageMagick) on PATH to rasterise the ' +
          "town plan SVG, and it was not found. Install it — e.g. `brew install imagemagick` on " +
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

/** Read a town plan document from disk. */
export async function loadPlan(planPath) {
  return JSON.parse(await readFile(planPath, "utf8"));
}

/* ---------------------------------- CLI ---------------------------------- */

/** Minimal `--flag value` / `--flag=value` / `--bool` parser — the same shape
 *  charsheet.mjs exports, inlined so this module keeps no local imports. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith("--")) continue;
    const eq = tok.indexOf("=");
    if (eq !== -1) out[tok.slice(2, eq)] = tok.slice(eq + 1);
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) out[tok.slice(2)] = argv[++i];
    else out[tok.slice(2)] = true;
  }
  return out;
}

const USAGE =
  "usage: node tools/art-forge/generate/townplan.mjs --plan <town-plan.json> --out <plan.png> [--width 1800]";

async function main() {
  const args = parseArgs();
  if (!args.plan || !args.out) throw new Error(USAGE);
  const plan = await loadPlan(args.plan);
  const width = args.width ? Number(args.width) : undefined;
  if (width !== undefined && !(width > 0)) throw new Error("--width must be a positive number");
  const outPath = await renderTownPlanPng({ plan, outPath: args.out, width });
  console.log(`[art-forge] town plan → ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(`[art-forge] FAILED: ${err.message}`);
    process.exitCode = 1;
  });
}
