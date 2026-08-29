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
// So EVERY label — building, plaza, landmark caption, water, road — is placed by
// one pass that scores a small enumerated set of candidate positions against
// everything already committed to the page, and joins the obstacle set the
// moment it is placed. There is no second mechanism and nothing is positioned by
// hand: hand-nudged coordinates would fix Millcross and break the other five
// towns D4 says follow once the pattern is proven.
//
// Three things this got wrong on the first pass, all fixed here, all pinned by
// tests, because each is the kind of bug that only shows up in the picture:
//
//   * A label that was placed did not become an obstacle for the labels placed
//     after it, so `mill-lane · 12u` and `trade-road-trunk · 14u` both landed at
//     the same spot left of the ford.
//   * Landmark captions were positioned by a fixed rule and never scored at all,
//     so `mill-wheel` sat on the mill-house.
//   * Boxes that merely TOUCH still read as one garbled block, so clearance is
//     now enforced with LABEL_PAD rather than bare intersection.
//
// Deliberately NOT a general label-placement solver: the candidate set is small
// and enumerated, so the worst case is a label that still overlaps something —
// never a label somewhere surprising, and never a run that does not terminate.

/** Vertical advance of one text line, as a multiple of its font size. */
const LINE_ADVANCE = 1.35;

/**
 * Clearance every label keeps from everything else, in world units.
 *
 * Zero is not enough. Two labels whose boxes merely abut read as a single
 * garbled block — which is exactly what `mill-lane · 12u` stacked flush on
 * `trade-road-trunk · 14u` looked like, even though the boxes did not strictly
 * intersect. The pad is applied when SCORING a candidate; the box stored on the
 * placed label is the true one, so "no two labels intersect" stays a statement
 * about the drawing rather than about the margin.
 */
export const LABEL_PAD = 0.9;

/** Width and height of a block of text lines, in world units. */
function blockMetrics(lines) {
  return {
    w: Math.max(...lines.map((l) => textWidth(l.str, l.size))),
    h: lines.reduce((s, l) => s + l.size * LINE_ADVANCE, 0),
  };
}

/** The rect a block occupies. A candidate is anchored by its TOP edge, so a
 *  one-line and a two-line caption can share the same candidate generator. */
function blockBox(lines, { x, top, anchor }) {
  const { w, h } = blockMetrics(lines);
  const x0 = anchor === "middle" ? x - w / 2 : anchor === "start" ? x : x - w;
  return [x0, top, x0 + w, top + h];
}

/** The text runs of a block, converting its top edge into per-line baselines. */
function blockRuns(lines, { x, top, anchor }) {
  let cursor = top;
  return lines.map((l) => {
    cursor += l.size * 0.95;
    const run = { ...l, x, y: cursor, anchor };
    cursor += l.size * (LINE_ADVANCE - 0.95);
    return run;
  });
}

/** Total area a box steals from things already on the page. */
function clashArea(box, obstacles) {
  return obstacles.reduce((sum, o) => sum + overlapArea(box, o), 0);
}

/** How much of a box falls outside the drawable band. Keeps a label from
 *  wandering into the title or footer to escape a crowded quarter. */
function spillArea(box, bounds) {
  const area = (box[2] - box[0]) * (box[3] - box[1]);
  return area - overlapArea(box, bounds);
}

/**
 * Pick the clearest candidate.
 *
 * A clash outweighs spill, and spill outweighs `rank`, so preference only ever
 * decides between positions that are equally clear. Ties are broken by candidate
 * order, which is fixed — the same plan always renders the same map.
 */
function place(lines, candidates, obstacles, bounds) {
  let best = null;
  for (const c of candidates) {
    const box = blockBox(lines, c);
    const score = clashArea(outset(box, LABEL_PAD), obstacles) * 1000 + spillArea(box, bounds) * 20 + c.rank;
    if (!best || score < best.score) best = { ...c, box, score };
  }
  return best;
}

function markerRadius(l) {
  return l.firstSight ? 6.6 : 3.1;
}

/** The marker disc itself — fixed geometry, since a landmark must be drawn AT
 *  its point. Only the caption moves. */
function markerBox(l) {
  const r = markerRadius(l) + 0.4;
  return [l.at[0] - r, l.at[1] - r, l.at[0] + r, l.at[1] + r];
}

/** Candidates around a rect: inside if it fits, then below, above, and either
 *  flank — each of the outside rows offered centred and edge-aligned. */
function rectCandidates([x0, y0, x1, y1], lines, allowInside) {
  const { h } = blockMetrics(lines);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const out = [];
  if (allowInside) out.push({ x: cx, top: cy - h / 2, anchor: "middle", inside: true, rank: 0 });
  for (const [top, base] of [
    [y1 + 1.0, 1],
    [y0 - 1.0 - h, 2],
  ]) {
    for (const [x, anchor, bump] of [
      [cx, "middle", 0],
      [x0, "start", 0.4],
      [x1, "end", 0.4],
    ]) {
      out.push({ x, top, anchor, inside: false, rank: base + bump });
    }
  }
  out.push({ x: x1 + 1.6, top: cy - h / 2, anchor: "start", inside: false, rank: 3 });
  out.push({ x: x0 - 1.6, top: cy - h / 2, anchor: "end", inside: false, rank: 3.1 });
  return out;
}

/** Eight positions ringing a landmark's marker. */
function ringCandidates(l, lines) {
  const [cx, cy] = l.at;
  const { h } = blockMetrics(lines);
  const r = markerRadius(l) + 1.6;
  const d = r * 0.72;
  return [
    { x: cx, top: cy + r, anchor: "middle", rank: 0 },
    { x: cx + r, top: cy - h / 2, anchor: "start", rank: 1 },
    { x: cx - r, top: cy - h / 2, anchor: "end", rank: 1.1 },
    { x: cx, top: cy - r - h, anchor: "middle", rank: 2 },
    { x: cx + d, top: cy + d, anchor: "start", rank: 3 },
    { x: cx - d, top: cy + d, anchor: "end", rank: 3.1 },
    { x: cx + d, top: cy - d - h, anchor: "start", rank: 3.2 },
    { x: cx - d, top: cy - d - h, anchor: "end", rank: 3.3 },
  ];
}

/**
 * Candidates for a road label: seven points along each segment, and three
 * offsets at each — above the road, ON it, and below.
 *
 * The on-centreline offset matters more than it looks. Roads are not obstacles
 * (a label on pale road surface is perfectly readable) and on the east bank the
 * lanes are the ONLY clear corridors left between rows of tents, so without it
 * `tent-lane-north · 6u` has nowhere to go but across a building — which is
 * where it went.
 */
function roadCandidates(road, lines) {
  const { h } = blockMetrics(lines);
  const gap = road.width / 2 + 1.6;
  const out = [];
  for (let i = 0; i < road.points.length - 1; i++) {
    const [ax, ay] = road.points[i];
    const [bx, by] = road.points[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay);
    for (const t of [0.5, 0.4, 0.6, 0.25, 0.75, 0.1, 0.9]) {
      const mx = ax + (bx - ax) * t;
      const my = ay + (by - ay) * t;
      // Prefer the longest segment, then its middle, then the side a label
      // conventionally sits on.
      const base = -len * 0.5 + Math.abs(t - 0.5) * 12;
      if (horizontal) {
        out.push({ x: mx, top: my - gap - h, anchor: "middle", rank: base });
        out.push({ x: mx, top: my - h / 2, anchor: "middle", rank: base + 0.5 });
        out.push({ x: mx, top: my + gap, anchor: "middle", rank: base + 1 });
      } else {
        out.push({ x: mx + gap, top: my - h / 2, anchor: "start", rank: base });
        out.push({ x: mx, top: my - h / 2, anchor: "middle", rank: base + 0.5 });
        out.push({ x: mx - gap, top: my - h / 2, anchor: "end", rank: base + 1 });
      }
    }
  }
  return out;
}

/** Candidates along a water body's long axis. The Meltwash runs the full height
 *  of the plan and its centroid is the ford — so the centroid is precisely where
 *  the river's name is guaranteed to meet the busiest landmark on the map. */
function waterCandidates(w, lines) {
  const xs = w.poly.map((p) => p[0]);
  const ys = w.poly.map((p) => p[1]);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const [cx, cy] = centroid(w.poly);
  const { h } = blockMetrics(lines);
  const alongY = bbox[3] - bbox[1] >= bbox[2] - bbox[0];
  return [0.5, 0.35, 0.65, 0.2, 0.8].map((t) => ({
    x: alongY ? cx : bbox[0] + (bbox[2] - bbox[0]) * t,
    top: (alongY ? bbox[1] + (bbox[3] - bbox[1]) * t : cy) - h / 2,
    anchor: "middle",
    rank: Math.abs(t - 0.5),
  }));
}

/**
 * Place every label on the plan, in one ordered pass.
 *
 * Order is least-freedom-first: a building's name has to stay near its building,
 * a landmark's near its dot, while a road label can slide anywhere along a road.
 * Giving the constrained labels first pick and letting the free ones route around
 * them is what makes the crowded east bank resolvable at all.
 *
 * Exported for the tests, which assert the invariant this whole section exists to
 * produce: no two placed labels intersect, and no label crosses a footprint that
 * is not its own.
 *
 * @param {object} plan
 * @returns {Array<{ kind: string, id: string, owner: number[]|null, box: number[],
 *                   runs: Array<object> }>}
 */
export function planLabels(plan) {
  const footprints = plan.footprints ?? [];
  const plazas = plan.plazas ?? [];
  const landmarks = plan.landmarks ?? [];
  const bounds = [-MARGIN, -4, plan.extent.width + MARGIN, plan.extent.height + 4];

  // Fixed geometry: masses and marker discs, which no label may cross.
  const fpRects = footprints.map((f) => normalizeRect(f.rect));
  const plazaRects = plazas.map((p) => normalizeRect(p.rect));
  const markerRects = landmarks.map(markerBox);
  const obstacles = [...fpRects, ...plazaRects, ...markerRects];

  const placed = [];
  const commit = (kind, id, owner, lines, at) => {
    const entry = { kind, id, owner, box: at.box, inside: at.inside === true, runs: blockRuns(lines, at) };
    obstacles.push(entry.box);
    placed.push(entry);
  };
  // A label is allowed to sit on the thing it names; everything else is an
  // obstacle. Identity, not geometry — two footprints could share a rect.
  const others = (own) => (own ? obstacles.filter((o) => o !== own) : obstacles);

  plazas.forEach((p, i) => {
    const lines = [{ str: p.id, size: FS_LABEL, fill: PALETTE.ink, weight: "400", halo: PALETTE.paper }];
    const at = place(lines, rectCandidates(plazaRects[i], lines, true), others(plazaRects[i]), bounds);
    commit("plaza", p.id, plazaRects[i], lines, at);
  });

  footprints.forEach((f, i) => {
    const multi = (f.storeys ?? 1) >= 2;
    const str = multi ? `${f.id} · ${f.storeys} storeys` : f.id;
    const [x0, , x1] = fpRects[i];
    const fits = textFits(str, FS_SMALL, x1 - x0);
    const dark = luminance(footprintFill(f)) < 0.55;
    const probe = [{ str, size: FS_SMALL }];
    const at = place(probe, rectCandidates(fpRects[i], probe, fits), others(fpRects[i]), bounds);
    // Ink flips only INSIDE the mass; a label that ended up on paper stays dark
    // and takes a halo, wherever the scorer put it.
    const lines = [
      {
        str,
        size: FS_SMALL,
        weight: "400",
        fill: at.inside && dark ? PALETTE.paper : PALETTE.ink,
        halo: at.inside ? null : PALETTE.paper,
      },
    ];
    commit("footprint", f.id, fpRects[i], lines, at);
  });

  landmarks.forEach((l, i) => {
    const lines = l.firstSight
      ? [
          { str: l.id, size: FS_LABEL, weight: "700", fill: PALETTE.ink, halo: PALETTE.paper },
          { str: "FIRST SIGHT", size: FS_SMALL, weight: "700", fill: PALETTE.goldInk, halo: PALETTE.paper },
        ]
      : [{ str: l.id, size: FS_LABEL, weight: "400", fill: PALETTE.ink, halo: PALETTE.paper }];
    const at = place(lines, ringCandidates(l, lines), others(markerRects[i]), bounds);
    commit("landmark", l.id, markerRects[i], lines, at);
  });

  for (const w of plan.water ?? []) {
    const lines = [{ str: w.id, size: FS_SMALL, weight: "400", fill: PALETTE.waterInk, halo: null }];
    commit("water", w.id, null, lines, place(lines, waterCandidates(w, lines), obstacles, bounds));
  }

  for (const r of plan.roads ?? []) {
    const str = `${r.id} · ${num(r.width)}u`;
    const lines = [{ str, size: FS_SMALL, weight: "400", fill: PALETTE.inkSoft, halo: PALETTE.paper }];
    commit("road", r.id, null, lines, place(lines, roadCandidates(r, lines), obstacles, bounds));
  }

  return placed;
}

/** Every placed label, as one layer. Order within the layer does not matter —
 *  by construction they do not overlap. */
function drawLabels(labels) {
  return labels.flatMap((l) => l.runs.map((run) => text(run))).join("\n  ");
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
 * Landmark MARKERS. The one with `firstSight: true` — what A1 §6 says a
 * traveller sees before anything else — gets a gold ring and a star, because
 * "which of these dots is the first sight" is exactly the question the owner
 * will put to the picture.
 *
 * Markers only: the captions are placed by `planLabels` along with every other
 * label. A marker must be drawn AT its point, so it is fixed geometry and enters
 * the placement pass as an obstacle rather than as something to position.
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
          `</g>`,
        ].join("\n  ");
      }
      return [
        `<g class="landmark" data-landmark="${esc(l.id)}">`,
        `  <circle cx="${u(x)}" cy="${u(y)}" r="${u(3.1)}" fill="${PALETTE.paper}"/>`,
        `  <circle cx="${u(x)}" cy="${u(y)}" r="${u(2.3)}" fill="${PALETTE.ink}"/>`,
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
  // PLAN E TASK 14: `plan.town` is the resolved world's town ID since the
  // re-home (`c-town-millcross`) — check_content's T1 joins it to
  // content/world/resolved#towns, which is keyed by `id`, not by slug. The
  // title wants the display NAME, so the id prefix is DERIVED away rather than
  // the name being retyped beside it. A bare slug — every fixture here, and
  // every plan before the re-home — passes through untouched.
  const name = String(plan.town ?? "town").replace(/^c-town-/, "");
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

  const layers = [
    drawGround(plan, vb),
    drawWater(plan),
    drawPlazas(plan),
    drawRoads(plan),
    drawFootprints(plan),
    drawLandmarks(plan),
    // Every label, placed in one pass so none can collide with another.
    drawLabels(planLabels(plan)),
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
