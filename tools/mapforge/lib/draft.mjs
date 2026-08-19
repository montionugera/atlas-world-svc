// mapforge — pure drafting primitives.
//
// Extracted verbatim from render-map.mjs (F-042 Task 2): the deterministic
// math/string helpers, the terrain/road/legend constants, and the six
// transform-closured drawing helpers (X, Y, poly, smooth, lineLabel,
// towerGlyph), wrapped in createDraft({ pxPerKm, mapLeft, mapTop }).
//
// No behavior change: byte parity of the drawn sheet was the bar for the F-042
// extraction, and it still is. Plan A Task 12 deleted render-map.mjs and
// parity.test.mjs (which this line used to cite); the same guarantee is now
// held by content/world/render-lock.json via scripts/check_render_lock.mjs,
// which hashes every built sheet against a committed sha256.

// Ink on cream. ONE accent colour, reserved entirely for the relay towers and
// their sight-lines (A1-ART-01).
export const C = {
  parchment: "#f3e7ce",
  parchmentDeep: "#efe4ca",
  sea: "#dcd0b0",
  ink: "#241f18",
  ink2: "#4c443714",
  inkMid: "#5d5344",
  inkSoft: "#8a7f6c",
  accent: "#a86f22", // bell-bronze
  accentSoft: "#c8933f",
};

// zone outlines are drawn with a tighter tension than water: a zone is an
// administrative reading of the ground, not a natural feature, and must not
// balloon into a cloud.
export const ZONE_TENSION = 10;

// One line, widening downstream — the four reaches of A1 §3.1. A single
// stroke, never a cased double line: a cased line reads as a road.
export const REACH_W = { "the-heads": 1.4, "upper-meltwash": 2.4, "tidal-reach": 3.6 };

export const ROAD_W = { trunk: 3.2, spur: 2.2, track: 1.5 };

export const FILL_FOR = {
  ice: "pIce",
  upland: "pUpland",
  "alkali-flat": "pFlat",
  rim: "pRim",
  bramble: "pBramble",
  headland: "pRock",
  "river-country": "pRiver",
};

export const TERRAIN_LEGEND = [
  ["pIce", "ice shelf"],
  ["pUpland", "upland"],
  ["pFlat", "alkali flat"],
  ["pRim", "rim country"],
  ["pBramble", "bramble"],
  ["pMire", "tidal mire"],
];

// ---------------------------------------------------------------------------
// Small deterministic helpers
// ---------------------------------------------------------------------------
export const r2 = (n) => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

export const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function centroid(polygon) {
  let x = 0;
  let y = 0;
  for (const p of polygon) {
    x += p[0];
    y += p[1];
  }
  return [x / polygon.length, y / polygon.length];
}

function pointInPolygon(pt, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const hit =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function polylineKm(points) {
  let L = 0;
  for (let i = 1; i < points.length; i++) {
    L += Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
    );
  }
  return L;
}

/** Point at arc-length `d` km along a km polyline, plus the local heading. */
function alongKm(points, d) {
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const seg = Math.hypot(dx, dy);
    if (acc + seg >= d) {
      const t = seg === 0 ? 0 : (d - acc) / seg;
      return {
        at: [points[i - 1][0] + t * dx, points[i - 1][1] + t * dy],
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
      };
    }
    acc += seg;
  }
  const j = points.length - 1;
  return {
    at: points[j],
    angle:
      (Math.atan2(
        points[j][1] - points[j - 1][1],
        points[j][0] - points[j - 1][0],
      ) *
        180) /
      Math.PI,
  };
}

/** Offset a km polyline sideways by `d` km (positive = left of travel). */
function offsetKm(points, d) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const a = points[Math.max(i - 1, 0)];
    const b = points[Math.min(i + 1, points.length - 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    out.push([p[0] + (dy / len) * d, p[1] - (dx / len) * d]);
  }
  return out;
}

// wrap the hand note
function wrap(text, max) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) {
      lines.push(line.trim());
      line = w;
    } else line += " " + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export { centroid, pointInPolygon, polylineKm, alongKm, offsetKm, wrap };

export const pat = (id, w, h, body, transform = "") =>
  `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"${transform}>${body}</pattern>`;

// `includeReported` is opt-in (default false) so the ONE existing caller
// (basin-sheet.mjs, reached through render-sheet.mjs's SHEETS registry since
// Plan A Task 12 retired render-map.mjs) keeps byte-identical output —
// G-RENDER-LOCK pins that, in place of the deleted parity.test.mjs.
// The atlas sheet (F-043) is the only caller that
// passes `includeReported: true`, for the mariners'-report hatch.
export function patternDefs({ includeReported = false } = {}) {
  const patterns = [
    // ice — broken horizontal shelf lines
    pat(
      "pIce",
      26,
      13,
      `<path d="M0,4 h11 M15,4 h9 M4,9.5 h13 M20,9.5 h6" stroke="${C.inkSoft}" stroke-width="0.9" fill="none"/>`,
    ),
    // upland — chevrons
    pat(
      "pUpland",
      18,
      14,
      `<path d="M2,10 l4,-6 l4,6 M11,13 l3,-4.5 l3,4.5" stroke="${C.inkSoft}" stroke-width="0.9" fill="none"/>`,
    ),
    // alkali flat — sparse stipple
    pat(
      "pFlat",
      16,
      16,
      `<circle cx="3" cy="4" r="0.8" fill="${C.inkSoft}"/><circle cx="11" cy="9" r="0.8" fill="${C.inkSoft}"/><circle cx="6" cy="13" r="0.7" fill="${C.inkSoft}"/>`,
    ),
    // rim country — single 45 degree hatch
    pat(
      "pRim",
      11,
      11,
      `<path d="M0,11 l11,-11" stroke="${C.inkSoft}" stroke-width="0.75" fill="none"/>`,
    ),
    // bramble — cross-hatch
    pat(
      "pBramble",
      9,
      9,
      `<path d="M0,9 l9,-9 M0,0 l9,9" stroke="${C.inkSoft}" stroke-width="0.65" fill="none"/>`,
    ),
    // tidal mire — the marsh tuft: a horizontal line with ticks standing on it
    pat(
      "pMire",
      22,
      16,
      `<path d="M2,8 h9 M6.5,8 v-3.5 M4,8 v-2.5 M9,8 v-2.5" stroke="${C.inkMid}" stroke-width="0.8" fill="none"/>` +
        `<path d="M13,15 h8 M17,15 v-3 M14.8,15 v-2.2 M19.2,15 v-2.2" stroke="${C.inkMid}" stroke-width="0.8" fill="none"/>`,
    ),
    // headland rock — dense short strokes
    pat(
      "pRock",
      12,
      12,
      `<path d="M2,2 v4 M7,5 v4 M10,1 v3 M4,9 v3" stroke="${C.inkSoft}" stroke-width="0.9" fill="none"/>`,
    ),
    // river country — reed dashes
    pat(
      "pRiver",
      20,
      18,
      `<path d="M3,12 v-5 M6,14 v-4 M13,7 v-5 M16,9 v-4" stroke="${C.inkSoft}" stroke-width="0.8" fill="none"/>`,
    ),
  ];
  if (includeReported) {
    // mariners' report, not surveyed — an open diagonal hatch, lighter than
    // any of the six surveyed fills above (F-043 A1-ART-01 extension).
    patterns.push(
      pat(
        "pReported",
        7,
        7,
        `<path d="M0,7 L7,0" stroke="${C.ink}" stroke-width="0.45" opacity="0.5"/>`,
      ),
    );
  }
  return patterns.join("\n");
}

export function createDraft({ pxPerKm, mapLeft, mapTop }) {
  const X = (km) => r2(mapLeft + km * pxPerKm);
  const Y = (km) => r2(mapTop + km * pxPerKm);

  /** Straight polyline through km points. */
  function poly(points) {
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"}${X(p[0])},${Y(p[1])}`)
      .join(" ");
  }

  /**
   * Catmull-Rom -> cubic Bezier. Coastlines and rivers are natural features and
   * must not read as surveyor's polylines. Pure arithmetic, so deterministic.
   */
  function smooth(points, closed = false, tension = 6) {
    const n = points.length;
    if (n < 3) return poly(points);
    const at = (i) =>
      closed ? points[(i + n) % n] : points[Math.min(Math.max(i, 0), n - 1)];
    let d = `M${X(at(0)[0])},${Y(at(0)[1])}`;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = at(i - 1),
        p1 = at(i),
        p2 = at(i + 1),
        p3 = at(i + 2);
      const c1 = [
        p1[0] + (p2[0] - p0[0]) / tension,
        p1[1] + (p2[1] - p0[1]) / tension,
      ];
      const c2 = [
        p2[0] - (p3[0] - p1[0]) / tension,
        p2[1] - (p3[1] - p1[1]) / tension,
      ];
      d += ` C${X(c1[0])},${Y(c1[1])} ${X(c2[0])},${Y(c2[1])} ${X(p2[0])},${Y(p2[1])}`;
    }
    if (closed) d += " Z";
    return d;
  }

  /**
   * Lettering that sits ON a line. Rotated to the line, flipped when it would
   * read upside down, and given a cream halo via paint-order so the line does
   * not strike through the glyphs.
   */
  function lineLabel(text, at, angleDeg, opts = {}) {
    let a = angleDeg;
    while (a > 90) a -= 180;
    while (a < -90) a += 180;
    const size = opts.size ?? 13;
    const fill = opts.fill ?? C.ink;
    const dy = opts.dy ?? -5;
    return (
      `<text class="lbl" x="${X(at[0])}" y="${Y(at[1])}" dy="${dy}" ` +
      `transform="rotate(${r2(a)} ${X(at[0])} ${Y(at[1])})" ` +
      `text-anchor="middle" font-size="${size}" fill="${fill}" ` +
      `letter-spacing="${opts.tracking ?? 0.6}"` +
      `${opts.italic ? ' font-style="italic"' : ""}>${esc(text)}</text>`
    );
  }

  // ---- relay chain — the map's actual subject, in the one accent colour ------
  // Drawn OVER the roads it parallels, because on this sheet the chain is the
  // subject and the road is the context (A1 §7.1).
  function towerGlyph(px, py, hollow) {
    const shaft =
      `M${r2(px - 3.2)},${r2(py + 4.6)} L${r2(px - 1.9)},${r2(py - 3.6)} ` +
      `L${r2(px + 1.9)},${r2(py - 3.6)} L${r2(px + 3.2)},${r2(py + 4.6)} Z`;
    const cap = `M${r2(px - 4.6)},${r2(py - 3.6)} L${r2(px + 4.6)},${r2(py - 3.6)}`;
    return hollow
      ? `<path d="${shaft}" fill="none" stroke="${C.accentSoft}" stroke-width="1.1" stroke-dasharray="2 2"/>` +
          `<path d="${cap}" stroke="${C.accentSoft}" stroke-width="1.1" stroke-dasharray="2 2" fill="none"/>`
      : `<path d="${shaft}" fill="${C.accent}" stroke="none"/>` +
          `<path d="${cap}" stroke="${C.accent}" stroke-width="1.8" fill="none"/>`;
  }

  return { X, Y, poly, smooth, lineLabel, towerGlyph };
}
