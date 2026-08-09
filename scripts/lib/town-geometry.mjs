// Town-plan geometry (F-040) — the maths the T4/T6/T7 gate rules and the
// renderer both need, kept PURE so either can use it.
//
// No file I/O and no imports at all: this module must stay callable from a
// unit test, from scripts/check_content.mjs, and from the art-forge renderer
// without any of them dragging in the others. Same reason lib/spawn-pairing.mjs
// exists — check_content.mjs ends in a bare main() + process.exit(), so logic
// that a test needs cannot live inside it.
//
// Coordinates are the town plan's own local space (design §2, D2), in WORLD
// UNITS, x to the right and y downward as a top-down map is drawn. Nothing here
// knows about the geography anchor.
//
// Shapes, as authored in content/towns/town-<id>.json:
//   rect  [x0, y0, x1, y1]   axis-aligned; either corner order is accepted
//   poly  [[x, y], ...]      a ring; the last point is NOT repeated
//   point [x, y]
//
// The scale contract these numbers serve (design §3, measured not invented):
// player radius 1.3 · mob radii 3–5 · a mob-passable cart road clears 12 units ·
// a player-only alley clears 4 · a town is ~200 units across.

/**
 * Grid resolution for walkability, in world units. 1.0 is a little under one
 * player diameter (2.6), so an alley at the 4-unit floor is still two or three
 * cells wide after the player-radius inflation eats 2.6 of it.
 */
export const CELL_SIZE = 1.0;

/**
 * Default agent radius the walkable grid is carved for, in world units.
 * Measured from the runtime player body, not chosen — see design §3.
 */
export const PLAYER_RADIUS = 1.3;

/**
 * Flood-fill connectivity. 4 means a diagonal-only touch between two open
 * cells does NOT join them into one region.
 *
 * INVENTED, DESIGN-OPEN. Neither the design doc nor A1 §6 says which
 * connectivity a town's walkability is judged by, and the runtime has no
 * navmesh to copy the answer from. 4 is the conservative pick: a body with a
 * radius cannot squeeze through a corner-to-corner pinch, so calling that pinch
 * walkable would let the gate certify a town the player cannot actually cross.
 * If a later feature lands real pathfinding, this is the knob to revisit — it
 * is exported so a mutation test can target it.
 */
export const CONNECTIVITY = 4;

/** Shared tolerance. Touching counts as NOT overlapping, everywhere. */
export const EPSILON = 1e-9;

function normalizeRect(rect) {
  if (!Array.isArray(rect) || rect.length !== 4)
    throw new TypeError("town-geometry: a rect must be [x0, y0, x1, y1]");
  const [ax, ay, bx, by] = rect;
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}

/**
 * Two axis-aligned rects overlap when they share POSITIVE AREA. Rects that
 * merely touch along an edge do not overlap.
 *
 * That strictness is load-bearing: T5 requires a footprint to TOUCH the road it
 * opens onto, while T4 forbids it OVERLAPPING one. A non-strict test would make
 * the two rules contradict each other.
 *
 * @param {[number, number, number, number]} a
 * @param {[number, number, number, number]} b
 * @returns {boolean}
 */
export function rectsOverlap(a, b) {
  const [ax0, ay0, ax1, ay1] = normalizeRect(a);
  const [bx0, by0, bx1, by1] = normalizeRect(b);
  return (
    ax0 < bx1 - EPSILON &&
    bx0 < ax1 - EPSILON &&
    ay0 < by1 - EPSILON &&
    by0 < ay1 - EPSILON
  );
}

/**
 * A point is inside a polygon by even-odd ray casting. Works for any simple
 * ring, convex or not.
 *
 * Points lying exactly ON an edge are undefined — the classic half-open
 * behaviour. Callers that care (the gate does not; it asks about cell centres
 * and landmark points) should offset by a hair rather than trust the edge.
 *
 * @param {[number, number]} pt
 * @param {Array<[number, number]>} poly
 * @returns {boolean}
 */
export function pointInPoly(pt, poly) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const straddles = yi > y !== yj > y;
    if (straddles && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function projectOnAxis(points, ax, ay) {
  let min = Infinity;
  let max = -Infinity;
  for (const [px, py] of points) {
    const d = px * ax + py * ay;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

/**
 * A CONVEX polygon and an axis-aligned rect share positive area (separating
 * axis theorem over the rect's two axes plus every polygon edge normal).
 *
 * Convexity is a real precondition, and it is met by construction: the only
 * polygons the gate feeds this are the quads roadPolygon() emits and the water
 * rings, which are authored convex. A concave ring would give false positives,
 * never false negatives, so the failure mode is a noisier gate rather than a
 * town that slips through.
 *
 * @param {Array<[number, number]>} poly
 * @param {[number, number, number, number]} rect
 * @returns {boolean}
 */
export function polyRectOverlap(poly, rect) {
  if (!Array.isArray(poly) || poly.length < 3)
    throw new TypeError("town-geometry: polyRectOverlap needs a ring of 3+ points");
  const [x0, y0, x1, y1] = normalizeRect(rect);
  const rectPts = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];

  const axes = [
    [1, 0],
    [0, 1],
  ];
  for (let i = 0; i < poly.length; i++) {
    const [px, py] = poly[i];
    const [qx, qy] = poly[(i + 1) % poly.length];
    const ex = qx - px;
    const ey = qy - py;
    const len = Math.hypot(ex, ey);
    if (len <= EPSILON) continue;
    axes.push([-ey / len, ex / len]);
  }

  for (const [ax, ay] of axes) {
    const [aMin, aMax] = projectOnAxis(poly, ax, ay);
    const [bMin, bMax] = projectOnAxis(rectPts, ax, ay);
    if (aMax <= bMin + EPSILON || bMax <= aMin + EPSILON) return false;
  }
  return true;
}

/**
 * The swept area of a road of the given width along a polyline, as a list of
 * CONVEX quads whose union is the road. One quad per segment, plus one joint
 * quad per interior vertex.
 *
 * The joint quad is why this is not just a map() over the segments. Two swept
 * rects meeting at an L-bend leave a square notch on the OUTSIDE of the turn:
 * the first rect stops at the vertex, the second starts there, and the corner
 * belongs to neither. The joint quad is the parallelogram V ± n1·h ± n2·h,
 * which contains the bevel triangle (V, V+n1·h, V+n2·h) that exactly fills the
 * gap — so the union has no notch at any turn angle.
 *
 * At a right-angle bend that parallelogram IS the miter square. At other angles
 * it reaches a little past the minimal bevel, on the inside of the turn as well
 * as the outside, so the swept area is a slight OVER-estimate near a corner.
 * That is the safe direction for T4 (a footprint too close to a bend is
 * rejected rather than waved through), but a fixture author placing a building
 * right against a corner should expect the road to claim a touch more than the
 * drawn width there.
 *
 * Returned as a list rather than one merged ring on purpose: the union of the
 * quads is generally non-convex, and every consumer (overlap tests, the SVG
 * renderer) is happy to iterate convex pieces. Callers ask "is this point on
 * the road?" with `quads.some((q) => pointInPoly(pt, q))`.
 *
 * @param {Array<[number, number]>} points centreline, 2+ points
 * @param {number} width full road width in world units
 * @returns {Array<Array<[number, number]>>}
 */
export function roadPolygon(points, width) {
  if (!Array.isArray(points) || points.length < 2)
    throw new TypeError("town-geometry: roadPolygon needs 2+ centreline points");
  if (!(width > 0)) throw new TypeError("town-geometry: roadPolygon needs width > 0");

  // Drop repeated points — a zero-length segment has no direction and so no
  // normal, and would poison every joint that touches it.
  const pts = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > EPSILON) pts.push([p[0], p[1]]);
  }
  if (pts.length < 2)
    throw new TypeError("town-geometry: roadPolygon needs 2+ DISTINCT centreline points");

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
    // Collinear (or an exact reversal): the two swept rects already abut, so
    // there is no notch and the joint quad would be a degenerate sliver.
    if (Math.abs(n1x * n2y - n1y * n2x) <= EPSILON) continue;
    const [vx, vy] = pts[i];
    const corners = [
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
    ].map(([s1, s2]) => [vx + s1 * n1x * h + s2 * n2x * h, vy + s1 * n1y * h + s2 * n2y * h]);
    corners.sort((p, q) => Math.atan2(p[1] - vy, p[0] - vx) - Math.atan2(q[1] - vy, q[0] - vx));
    quads.push(corners);
  }

  return quads;
}

/**
 * Rasterise a town plan into a grid of walkable / blocked cells.
 *
 * What blocks: FOOTPRINTS ONLY. Roads and plazas are the absence of collision
 * rather than surfaces, and water is explicitly not collision in this feature
 * (design §5; whether a river blocks, slows or drowns is design §10's open
 * question and is not decided here). So the walkable area is "everything inside
 * the extent that is not a building" — which is exactly what makes a sealed
 * courtyard detectable: a ring of footprints cuts its interior off from the
 * rest of the town.
 *
 * Each footprint is inflated by `playerRadius` before it is stamped, so a cell
 * is walkable only if a body of that radius actually fits with its centre
 * there. The inflation is a square (Chebyshev) grow rather than a true Minkowski
 * sum, which over-blocks slightly at building corners — conservative in the
 * safe direction: the gate can never certify a gap the player cannot enter.
 *
 * The town edge is NOT inset. A town has no wall (A1 §6) and roads run off the
 * map at the extent, so edge cells must stay walkable for T7's "reachable from
 * the town edge" to mean anything.
 *
 * @param {{ extent: { width: number, height: number }, footprints?: Array<{ rect: number[] }> }} plan
 * @param {{ cell?: number, playerRadius?: number }} [options]
 * @returns {{ cell: number, playerRadius: number, cols: number, rows: number,
 *             width: number, height: number, walkable: Uint8Array }}
 */
export function walkableGrid(plan, { cell = CELL_SIZE, playerRadius = PLAYER_RADIUS } = {}) {
  const width = plan?.extent?.width;
  const height = plan?.extent?.height;
  if (!(width > 0) || !(height > 0))
    throw new TypeError("town-geometry: walkableGrid needs plan.extent.width/height > 0");
  if (!(cell > 0)) throw new TypeError("town-geometry: walkableGrid needs cell > 0");
  if (!(playerRadius >= 0))
    throw new TypeError("town-geometry: walkableGrid needs playerRadius >= 0");

  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const walkable = new Uint8Array(cols * rows).fill(1);

  const blockers = (plan.footprints ?? []).map((f) => {
    const [x0, y0, x1, y1] = normalizeRect(f.rect);
    return [x0 - playerRadius, y0 - playerRadius, x1 + playerRadius, y1 + playerRadius];
  });

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * cell;
      const cy = (r + 0.5) * cell;
      for (const [x0, y0, x1, y1] of blockers) {
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
          walkable[r * cols + c] = 0;
          break;
        }
      }
    }
  }

  return { cell, playerRadius, cols, rows, width, height, walkable };
}

/**
 * The grid index containing a plan-space point, or -1 if it falls outside the
 * grid. Lets a caller ask which region a landmark or a road end sits in.
 *
 * A point sitting exactly ON the far boundary (x === width) belongs to the last
 * cell, not to nowhere. Roads run off the map at the extent and T7 asks whether
 * the firstSight landmark is reachable from the town EDGE, so an authored edge
 * point must resolve to a real cell rather than silently reading as unreachable.
 *
 * @param {{ cell: number, cols: number, rows: number }} grid
 * @param {[number, number]} pt
 * @returns {number}
 */
export function cellIndexAt(grid, pt) {
  let c = Math.floor(pt[0] / grid.cell);
  let r = Math.floor(pt[1] / grid.cell);
  if (c === grid.cols && pt[0] <= grid.cols * grid.cell + EPSILON) c = grid.cols - 1;
  if (r === grid.rows && pt[1] <= grid.rows * grid.cell + EPSILON) r = grid.rows - 1;
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return -1;
  return r * grid.cols + c;
}

function neighbourOffsets(connectivity) {
  if (connectivity === 4)
    return [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
  if (connectivity === 8)
    return [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
  throw new TypeError("town-geometry: connectivity must be 4 or 8");
}

/**
 * Label the connected regions of a walkable grid.
 *
 * CONNECTIVITY IS 4 — see the constant's note: a diagonal-only touch between
 * two open cells leaves them in SEPARATE regions. That is an invented,
 * design-open choice, made conservative on purpose. The connectivity is read
 * from the exported constant (and overridable per call) so a mutation test can
 * flip it and watch the diagonal fixture change answer.
 *
 * Iterative breadth-first, not recursive: a 220 × 160 town at cell 1.0 is
 * 35 200 cells and a recursive fill would blow the stack on the open ones.
 *
 * @param {{ cols: number, rows: number, walkable: Uint8Array }} grid
 * @param {{ connectivity?: number }} [options]
 * @returns {{ count: number, labels: Int32Array, sizes: number[] }}
 *   `labels` is -1 for blocked cells and a region index otherwise.
 */
export function floodFillRegions(grid, { connectivity = CONNECTIVITY } = {}) {
  const { cols, rows, walkable } = grid;
  const offsets = neighbourOffsets(connectivity);
  const labels = new Int32Array(cols * rows).fill(-1);
  const sizes = [];
  const queue = new Int32Array(cols * rows);

  for (let start = 0; start < walkable.length; start++) {
    if (!walkable[start] || labels[start] !== -1) continue;
    const label = sizes.length;
    let head = 0;
    let tail = 0;
    labels[start] = label;
    queue[tail++] = start;
    let size = 0;
    while (head < tail) {
      const idx = queue[head++];
      size++;
      const c = idx % cols;
      const r = (idx - c) / cols;
      for (const [dc, dr] of offsets) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const n = nr * cols + nc;
        if (!walkable[n] || labels[n] !== -1) continue;
        labels[n] = label;
        queue[tail++] = n;
      }
    }
    sizes.push(size);
  }

  return { count: sizes.length, labels, sizes };
}
