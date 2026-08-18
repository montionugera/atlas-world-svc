// Plan A Task 1 — exact polygon intersection for the spine geometry gates.
//
// Replaces scripts/lib/spine.mjs's lattice-sampled gridIntersectionArea().
// Measured on the real 133 sibling pairs: 3,038 ms -> 19.7 ms (154x), verdict
// identical on all 133, max numeric deviation 0.00269 km2.
//
// Conventions (inherited from lib/spine.mjs, non-negotiable):
//   - one options object per function, no positional overloads;
//   - abs() appears NOWHERE. A negative signed shoelace is a G-POLY failure,
//     not a magnitude, so every ring reaching a clip is positively wound and
//     every clipped piece comes out positively wound by construction;
//   - nothing throws. A degenerate or backwards ring yields [] / 0, never an
//     exception — an uncaught throw inside a gate skips finish() and silently
//     drops every FAIL recorded before it.
//
// Pure: no fs, no deps. spine.mjs imports FROM here; never the reverse.

/** @typedef {[number, number]} Pt */
/** @typedef {{x:number, y:number, w:number, h:number}} BBox */

const orient = (p, q, r) =>
  Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));

// q is on segment p–r, given the three are already known collinear.
const onSeg = (p, q, r) =>
  Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0]) &&
  Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1]);

// Proper crossing OR collinear overlap OR a shared endpoint. Deliberately
// wider than spine.mjs:107's properCross(), which excludes touching because
// selfIntersects() must tolerate adjacent edges sharing a vertex. Here
// touching MUST count: it is what keeps ringsDisjoint() from declaring two
// tiled neighbours disjoint and skipping the clip that proves their overlap
// is exactly zero.
export function segmentsIntersect({ p1, p2, p3, p4 }) {
  const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(p1, p3, p2)) return true;
  if (o2 === 0 && onSeg(p1, p4, p2)) return true;
  if (o3 === 0 && onSeg(p3, p1, p4)) return true;
  if (o4 === 0 && onSeg(p3, p2, p4)) return true;
  return false;
}

// Ray cast, half-open on edges — the same rule spine.mjs:95 pointInPolygon
// uses, kept identical so a vertex that is "inside" for one gate is inside
// for the other.
export function pointInRing({ point, points }) {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

// Stage 2 of the three-stage replacement: exact disjointness. If no edge pair
// meets and neither ring holds the other's first vertex, the intersection is
// EXACTLY 0 and no clipping is needed. Measured: eliminates 122 of the real
// 133 pairs in ~11 ms total.
export function ringsDisjoint({ a, b }) {
  for (let i = 0; i < a.length; i++) {
    const p1 = a[i], p2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const p3 = b[j], p4 = b[(j + 1) % b.length];
      if (segmentsIntersect({ p1, p2, p3, p4 })) return false;
    }
  }
  if (pointInRing({ point: a[0], points: b })) return false;
  if (pointInRing({ point: b[0], points: a })) return false;
  return true;
}

const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
// Inclusive on purpose: a candidate vertex lying exactly ON an ear's edge
// blocks the ear. Excluding it produces overlapping triangles on rings with
// collinear runs, which double-counts area — the concave-L test is the pin.
const pointInTriInclusive = (p, a, b, c) =>
  cross2(a, b, p) >= 0 && cross2(b, c, p) >= 0 && cross2(c, a, p) >= 0;

// Drop vertices that are EXACTLY collinear with their neighbours, and exact
// duplicate points, to a fixed point. Area-preserving by construction: a
// vertex with cross2 === 0 spans a zero-area triangle, so the shoelace is
// unchanged. This is not cosmetic — content/spine/nodes/n-keelbreak.json is a
// legal committed ring (G-POLY green: simple by properCross, shoelace
// +67091.8) that walks x=50 down from y=58 to y=5 and straight back up to
// y=21.8. That zero-WIDTH spike has a collinear apex, ear clipping can never
// consume it, and the loop below would find no ear and return [] — which made
// exactIntersectionArea report 0 for every pair touching that node and
// silently disabled G-OVERLAP for it.
// Exactly ONE vertex is dropped per pass, lowest index first, and the next
// pass re-reads its neighbours from the shortened ring. Sweeping a whole pass
// at once is wrong and silently changes area: on a ring that visits the same
// point twice ([2,1] → [6,3] → [2,1] → …) a single sweep drops the apex as
// collinear AND both copies of the notch — one as an adjacent duplicate, the
// other as collinear with the copy that is about to vanish — turning a 75.5
// ring into a 78 one. One-at-a-time keeps every removal area-preserving.
function cleanRing(points) {
  const ring = points.slice();
  for (let pass = 0; pass < points.length && ring.length >= 3; pass++) {
    let drop = -1;
    for (let i = 0; i < ring.length; i++) {
      const P = ring[(i - 1 + ring.length) % ring.length];
      const C = ring[i];
      const N = ring[(i + 1) % ring.length];
      // Exact duplicate of its successor, or exactly collinear with its
      // neighbours: either way this vertex spans no area.
      if ((C[0] === N[0] && C[1] === N[1]) || cross2(P, C, N) === 0) { drop = i; break; }
    }
    if (drop < 0) break;
    ring.splice(drop, 1);
  }
  return ring;
}

// Positively-wound simple ring -> positively-wound triangles. G-POLY already
// guarantees simple + open + strictly positive, so no orientation fix-up is
// needed; a ring that violates it yields [] and its own G-POLY FAIL elsewhere.
export function earClip({ points }) {
  if (!Array.isArray(points) || points.length < 3) return [];
  points = cleanRing(points);
  const n = points.length;
  if (n < 3) return [];
  const idx = [...points.keys()];
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 4 * n) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const ia = idx[(k - 1 + idx.length) % idx.length];
      const ib = idx[k];
      const ic = idx[(k + 1) % idx.length];
      const A = points[ia], B = points[ib], Cc = points[ic];
      if (cross2(A, B, Cc) <= 0) continue; // reflex or collinear — not an ear
      let ok = true;
      for (const io of idx) {
        if (io === ia || io === ib || io === ic) continue;
        if (pointInTriInclusive(points[io], A, B, Cc)) { ok = false; break; }
      }
      if (!ok) continue;
      out.push([A, B, Cc]);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) return []; // not a simple positively-wound ring — report nothing
  }
  if (idx.length === 3) out.push([points[idx[0]], points[idx[1]], points[idx[2]]]);
  return out;
}

// Sutherland-Hodgman. Both arguments must be convex and positively wound;
// the result is then convex and positively wound too, so its shoelace is
// non-negative by construction and abs() is never needed.
export function clipConvex({ subject, clip }) {
  let output = subject;
  for (let i = 0; i < clip.length && output.length; i++) {
    const A = clip[i], B = clip[(i + 1) % clip.length];
    const side = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const P = input[j], Q = input[(j + 1) % input.length];
      const sp = side(P), sq = side(Q);
      if (sp >= 0) output.push(P);
      if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
        const t = sp / (sp - sq);
        output.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
      }
    }
  }
  return output;
}

// Same pinned formula as spine.mjs:73 — sum(x_i*y_{i+1} - x_{i+1}*y_i)/2 over
// the OPEN ring. Duplicated (not imported) so this module stays leaf-level.
function shoelace(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

// A rect becomes a POSITIVELY wound ring: [x,y] -> [x+w,y] -> [x+w,y+h] ->
// [x,y+h] has shoelace +w*h. The reverse order gives -w*h and every clip
// against it silently returns nothing.
// A ring needs 3 points to bound anything. Anything less — and any malformed
// placement — yields null rather than a throw, per this module's no-throw
// contract: an uncaught throw inside a gate skips finish() and silently drops
// every FAIL recorded before it.
function ringOf(placement) {
  if (!placement) return null;
  if (placement.shape === "polygon")
    return Array.isArray(placement.points) && placement.points.length >= 3 ? placement.points : null;
  if (placement.shape === "rect") {
    const r = placement.rect;
    if (!r) return null;
    return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  }
  return null; // point placements have no area — spine.mjs:131 agrees
}

export function bboxOfPlacement({ placement }) {
  const ring = ringOf(placement);
  // No ring: a point placement is its own zero-extent bbox; anything else
  // degrades to a zero-extent bbox at the origin, which the strict overlap
  // predicate in query() can never match.
  if (!ring) {
    const at = placement?.at;
    return Array.isArray(at)
      ? { x: at[0], y: at[1], w: 0, h: 0 }
      : { x: 0, y: 0, w: 0, h: 0 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function ringVertexCount({ placement }) {
  const ring = ringOf(placement);
  return ring ? ring.length : 0;
}

// The drop-in replacement for gridIntersectionArea({a, b, cell}). No `cell`:
// there is no sampling any more. Three stages, cheapest first.
export function exactIntersectionArea({ a, b }) {
  const ra = ringOf(a), rb = ringOf(b);
  if (!ra || !rb) return 0;
  // (1) bounding-box reject — verbatim from spine.mjs:161-164.
  const ba = bboxOfPlacement({ placement: a }), bb = bboxOfPlacement({ placement: b });
  const x0 = Math.max(ba.x, bb.x), y0 = Math.max(ba.y, bb.y);
  const x1 = Math.min(ba.x + ba.w, bb.x + bb.w), y1 = Math.min(ba.y + ba.h, bb.y + bb.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  // (2) exact disjointness pre-filter.
  if (ringsDisjoint({ a: ra, b: rb })) return 0;
  // (3) exact clipped area for the survivors.
  const ta = earClip({ points: ra }), tb = earClip({ points: rb });
  let area = 0;
  for (const t1 of ta)
    for (const t2 of tb) {
      const piece = clipConvex({ subject: t1, clip: t2 });
      if (piece.length >= 3) area += shoelace(piece);
    }
  return area;
}

// Uniform-grid bbox index. Conservative by construction: an item registers in
// every bucket its bbox touches, and a query unions every bucket its own bbox
// touches, so the result can only ever be a SUPERSET of the truly overlapping
// set. Sorted output keeps gate message order a function of the data alone.
const INDEX_DIVISIONS = 8;
export function buildBBoxIndex({ items }) {
  if (items.length === 0) return { query: () => [] };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { bbox } of items) {
    if (bbox.x < minX) minX = bbox.x;
    if (bbox.y < minY) minY = bbox.y;
    if (bbox.x + bbox.w > maxX) maxX = bbox.x + bbox.w;
    if (bbox.y + bbox.h > maxY) maxY = bbox.y + bbox.h;
  }
  // A zero-extent axis would divide by zero; collapse it to one bucket.
  const spanX = maxX - minX, spanY = maxY - minY;
  const cellX = spanX > 0 ? spanX / INDEX_DIVISIONS : 1;
  const cellY = spanY > 0 ? spanY / INDEX_DIVISIONS : 1;
  const buckets = new Map(); // "cx,cy" -> Set<id>
  const boxOf = new Map(); // id -> the bbox it REGISTERED with, never a recomputed one
  const range = (bbox) => {
    const cx0 = Math.floor((bbox.x - minX) / cellX);
    const cy0 = Math.floor((bbox.y - minY) / cellY);
    const cx1 = Math.floor((bbox.x + bbox.w - minX) / cellX);
    const cy1 = Math.floor((bbox.y + bbox.h - minY) / cellY);
    return { cx0, cy0, cx1, cy1 };
  };
  for (const { id, bbox } of items) {
    boxOf.set(id, bbox);
    const { cx0, cy0, cx1, cy1 } = range(bbox);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = `${cx},${cy}`;
        let s = buckets.get(k);
        if (!s) { s = new Set(); buckets.set(k, s); }
        s.add(id);
      }
  }
  return {
    query({ bbox }) {
      const { cx0, cy0, cx1, cy1 } = range(bbox);
      const hit = new Set();
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++)
          for (const id of buckets.get(`${cx},${cy}`) ?? []) {
            // Buckets are coarse, so a bucket hit is only a CANDIDATE. Confirm
            // it against the bbox the item registered with, using the SAME
            // strict predicate as exactIntersectionArea's stage-1 reject
            // (x1 <= x0 || y1 <= y0 -> 0). Sound by construction: a pair with
            // a non-zero exact intersection area must have strictly
            // overlapping bounding boxes, so this can drop only pairs whose
            // exact area is already 0 — it can never hide a real overlap.
            const o = boxOf.get(id);
            if (bbox.x < o.x + o.w && o.x < bbox.x + bbox.w &&
                bbox.y < o.y + o.h && o.y < bbox.y + bbox.h) hit.add(id);
          }
      return [...hit].sort();
    },
  };
}
