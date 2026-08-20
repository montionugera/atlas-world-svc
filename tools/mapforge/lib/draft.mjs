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

// Plan B Task 6 — the ink layer, closed. Three tables and one registry:
//   BIOME_FILL   biome        -> pattern id   (20; there were ZERO before)
//   FILL_FOR     terrainKind  -> pattern id   (18; was 7)
//   PATTERNS     pattern id   -> <pattern> markup
//   LEGEND       one row per REACHABLE pattern, with a zoom tier
// G-BIOME-INK (lib/ink.mjs) closes all four loops in both directions.
export const BIOME_FILL = {
  ocean: "pOcean",
  ice: "pIce",
  marsh: "pMire",
  river: "pRiver",
  meadow: "pMeadow",
  forest: "pForest",
  bramble: "pBramble",
  rock: "pRock",
  upland: "pUpland",
  alkali: "pFlat",
  ash: "pAsh",
  built: "pBuilt",
  tundra: "pTundra",
  lake: "pLake",
  scree: "pScree",
  karst: "pKarst",
  badland: "pBadland",
  desert: "pDesert",
  lava: "pLava",
  reef: "pReef",
};

export const FILL_FOR = {
  ice: "pIce",
  upland: "pUpland",
  "alkali-flat": "pFlat",
  rim: "pRim",
  bramble: "pBramble",
  headland: "pRock",
  "river-country": "pRiver",
  // Plan B Task 6 (+11)
  "tundra-steppe": "pTundra",
  "sand-sea": "pDesert",
  badlands: "pBadland",
  "karst-plateau": "pKarst",
  "volcanic-arc": "pAsh",
  "lava-field": "pLava",
  "cloud-forest": "pForest",
  "reef-shelf": "pReef",
  fjordland: "pScree",
  "lake-country": "pLake",
  "tidal-mire": "pMire",
};

// Zoom tiers: a sheet draws every row with `tier <= its legendTier`. Tier 1 is
// EXACTLY today's six basin rows in today's order — that is what keeps
// cluster1-world.svg byte-identical until Task 12 deliberately re-inks it.
export const LEGEND = [
  { pattern: "pIce", label: "ice shelf", tier: 1 },
  { pattern: "pUpland", label: "upland", tier: 1 },
  { pattern: "pFlat", label: "alkali flat", tier: 1 },
  { pattern: "pRim", label: "rim country", tier: 1 },
  { pattern: "pBramble", label: "bramble", tier: 1 },
  { pattern: "pMire", label: "tidal mire", tier: 1 },
  { pattern: "pRock", label: "headland rock", tier: 2 },
  { pattern: "pRiver", label: "river country", tier: 2 },
  { pattern: "pForest", label: "forest", tier: 2 },
  { pattern: "pMeadow", label: "meadow", tier: 2 },
  { pattern: "pReported", label: "reported, not surveyed", tier: 2 },
  { pattern: "pReportedSworn", label: "reported — sworn log", tier: 2 },
  { pattern: "pReportedHearsay", label: "reported — hearsay", tier: 2 },
  { pattern: "pReportedInferred", label: "reported — inferred", tier: 2 },
  { pattern: "pOcean", label: "open sea", tier: 3 },
  { pattern: "pLake", label: "lake", tier: 3 },
  { pattern: "pTundra", label: "tundra", tier: 3 },
  { pattern: "pScree", label: "scree", tier: 3 },
  { pattern: "pKarst", label: "karst pavement", tier: 3 },
  { pattern: "pBadland", label: "badland", tier: 3 },
  { pattern: "pDesert", label: "sand sea", tier: 3 },
  { pattern: "pLava", label: "lava field", tier: 3 },
  { pattern: "pAsh", label: "ash plain", tier: 3 },
  { pattern: "pReef", label: "reef", tier: 3 },
  { pattern: "pBuilt", label: "built ground", tier: 3 },
];

// Kept as a DERIVED alias so basin-sheet.mjs's legend block is untouched and
// cluster1-world.svg stays byte-identical. Task 12 replaces the call site.
export const TERRAIN_LEGEND = LEGEND.filter((r) => r.tier <= 1).map((r) => [
  r.pattern,
  r.label,
]);

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

// The eight ids today's two sheets emit, in today's emit order. patternDefs()
// with no `ids` reproduces that <defs> block byte for byte.
export const LEGACY_PATTERN_IDS = Object.freeze([
  "pIce",
  "pUpland",
  "pFlat",
  "pRim",
  "pBramble",
  "pMire",
  "pRock",
  "pRiver",
]);

export const PATTERNS = {
  // --- the eight originals, moved verbatim out of patternDefs() ---
  // ice — broken horizontal shelf lines
  pIce: pat(
    "pIce",
    26,
    13,
    `<path d="M0,4 h11 M15,4 h9 M4,9.5 h13 M20,9.5 h6" stroke="${C.inkSoft}" stroke-width="0.9" fill="none"/>`,
  ),
  // upland — chevrons
  pUpland: pat(
    "pUpland",
    18,
    14,
    `<path d="M2,10 l4,-6 l4,6 M11,13 l3,-4.5 l3,4.5" stroke="${C.inkSoft}" stroke-width="0.9" fill="none"/>`,
  ),
  // alkali flat — sparse stipple
  pFlat: pat(
    "pFlat",
    16,
    16,
    `<circle cx="3" cy="4" r="0.8" fill="${C.inkSoft}"/><circle cx="11" cy="9" r="0.8" fill="${C.inkSoft}"/><circle cx="6" cy="13" r="0.7" fill="${C.inkSoft}"/>`,
  ),
  // rim country — single 45 degree hatch
  pRim: pat(
    "pRim",
    11,
    11,
    `<path d="M0,11 l11,-11" stroke="${C.inkSoft}" stroke-width="0.75" fill="none"/>`,
  ),
  // bramble — cross-hatch
  pBramble: pat(
    "pBramble",
    9,
    9,
    `<path d="M0,9 l9,-9 M0,0 l9,9" stroke="${C.inkSoft}" stroke-width="0.65" fill="none"/>`,
  ),
  // tidal mire — the marsh tuft: a horizontal line with ticks standing on it
  pMire: pat(
    "pMire",
    22,
    16,
    `<path d="M2,8 h9 M6.5,8 v-3.5 M4,8 v-2.5 M9,8 v-2.5" stroke="${C.inkMid}" stroke-width="0.8" fill="none"/>` +
      `<path d="M13,15 h8 M17,15 v-3 M14.8,15 v-2.2 M19.2,15 v-2.2" stroke="${C.inkMid}" stroke-width="0.8" fill="none"/>`,
  ),
  // headland rock — dense short strokes
  pRock: pat(
    "pRock",
    12,
    12,
    `<path d="M2,2 v4 M7,5 v4 M10,1 v3 M4,9 v3" stroke="${C.inkSoft}" stroke-width="0.9" fill="none"/>`,
  ),
  // river country — reed dashes
  pRiver: pat(
    "pRiver",
    20,
    18,
    `<path d="M3,12 v-5 M6,14 v-4 M13,7 v-5 M16,9 v-4" stroke="${C.inkSoft}" stroke-width="0.8" fill="none"/>`,
  ),
  // mariners' report, not surveyed — an open diagonal hatch, lighter than
  // any of the six surveyed fills above (F-043 A1-ART-01 extension).
  pReported: pat(
    "pReported",
    7,
    7,
    `<path d="M0,7 L7,0" stroke="${C.ink}" stroke-width="0.45" opacity="0.5"/>`,
  ),

  // --- The frontier hatch is an EPISTEMIC GRADIENT, not a binary (spec §6.4
  // extension 1). A reported region carries `provenance` in the fabric, and
  // these three densities draw it: a master's sworn log reads darker and
  // tighter than wharf-talk, which reads darker than the generator's own
  // fill. That register is what A2-wider-world.md §1 already commits to in
  // prose; without the three densities the chart flattens it back to "not
  // surveyed" and the honest-frontier policy stops being visible.
  // pReported stays as the fallback for a reported region with no provenance.
  pReportedSworn: pat(
    "pReportedSworn",
    7,
    7,
    `<path d="M0,7 L7,0" stroke="${C.ink}" stroke-width="0.45" opacity="0.5"/>`,
  ),
  pReportedHearsay: pat(
    "pReportedHearsay",
    11,
    11,
    `<path d="M0,11 L11,0" stroke="${C.ink}" stroke-width="0.45" opacity="0.42"/>`,
  ),
  pReportedInferred: pat(
    "pReportedInferred",
    15,
    15,
    `<path d="M0,15 L15,0" stroke="${C.ink}" stroke-width="0.45" opacity="0.3"/>`,
  ),

  // --- Plan B Task 6: thirteen new fills. Every one is line/dot work in the
  // same two inks; no new colour enters the palette (A1-ART-01: ink on cream,
  // ONE accent reserved for the relay chain). Every tile is >= 7 px on both
  // axes — a tile under ~6 px reads as a solid grey smear at thumbnail scale
  // (the F-044 lesson).
  pOcean: pat(
    "pOcean",
    24,
    24,
    `<path d="M0,6 q6,-3 12,0 t12,0 M0,18 q6,-3 12,0 t12,0" stroke="${C.inkSoft}" stroke-width="0.5" fill="none" opacity="0.55"/>`,
  ),
  pMeadow: pat(
    "pMeadow",
    20,
    20,
    `<path d="M4,15 v-3 M10,18 v-3 M16,13 v-3" stroke="${C.inkSoft}" stroke-width="0.6" fill="none"/>`,
  ),
  pForest: pat(
    "pForest",
    18,
    18,
    `<path d="M5,14 l3,-6 l3,6 Z M12,17 l2.5,-5 l2.5,5 Z" fill="none" stroke="${C.inkSoft}" stroke-width="0.7"/>`,
  ),
  pAsh: pat(
    "pAsh",
    14,
    14,
    `<circle cx="3" cy="3" r="0.55" fill="${C.inkMid}"/><circle cx="9" cy="7" r="0.55" fill="${C.inkMid}"/><circle cx="5" cy="11" r="0.5" fill="${C.inkMid}"/><circle cx="12" cy="12" r="0.5" fill="${C.inkMid}"/>`,
  ),
  pBuilt: pat(
    "pBuilt",
    12,
    12,
    `<path d="M0,6 h12 M6,0 v12" stroke="${C.inkSoft}" stroke-width="0.5" fill="none"/>`,
  ),
  pTundra: pat(
    "pTundra",
    20,
    20,
    `<path d="M3,10 h5 M12,16 h5" stroke="${C.inkSoft}" stroke-width="0.6" fill="none"/><circle cx="15" cy="6" r="0.5" fill="${C.inkSoft}"/>`,
  ),
  pLake: pat(
    "pLake",
    18,
    18,
    `<path d="M2,7 q4,-2.5 8,0 M6,14 q4,-2.5 8,0" stroke="${C.inkMid}" stroke-width="0.6" fill="none"/>`,
  ),
  pScree: pat(
    "pScree",
    14,
    14,
    `<path d="M2,3 l2,2 M8,2 l2,2 M4,9 l2,2 M10,10 l2,2" stroke="${C.inkSoft}" stroke-width="0.7" fill="none"/>`,
  ),
  pKarst: pat(
    "pKarst",
    16,
    16,
    `<path d="M0,5 h16 M0,11 h16 M5,0 v5 M11,5 v6 M3,11 v5" stroke="${C.inkSoft}" stroke-width="0.6" fill="none"/>`,
  ),
  pBadland: pat(
    "pBadland",
    15,
    15,
    `<path d="M2,14 l3,-9 l3,9 M9,14 l2.5,-6 l2.5,6" stroke="${C.inkSoft}" stroke-width="0.6" fill="none"/>`,
  ),
  pDesert: pat(
    "pDesert",
    22,
    14,
    `<path d="M0,10 q5.5,-5 11,0 t11,0" stroke="${C.inkSoft}" stroke-width="0.7" fill="none"/>`,
  ),
  pLava: pat(
    "pLava",
    13,
    13,
    `<path d="M1,4 l3,3 l-3,3 M7,2 l3,3 l-3,3 M4,10 l3,2" stroke="${C.inkMid}" stroke-width="0.75" fill="none"/>`,
  ),
  pReef: pat(
    "pReef",
    16,
    16,
    `<path d="M3,12 v-4 M3,10 h-1.6 M3,10 h1.6 M11,14 v-5 M11,11 h-1.6 M11,11 h1.6" stroke="${C.inkMid}" stroke-width="0.6" fill="none"/>`,
  ),
};

const FRONTIER_TIER_IDS = [
  "pReportedSworn",
  "pReportedHearsay",
  "pReportedInferred",
];

// `ids` (Plan B Task 6) is what keeps the live sheets byte-identical: the
// default IS today's emit list, so the existing two callers change nothing.
//
// `includeReported` and `frontierTiers` are TWO flags, not one, and that is
// load-bearing. atlas-sheet.mjs calls `patternDefs({ includeReported: true })`
// today and gets exactly nine patterns. If the three provenance densities rode
// along on `includeReported`, that untouched call site would start emitting
// twelve, atlas-world.svg's <defs> would move at Task 6, and the Task 6-11
// byte-identity invariant would break two tasks before its one recorded
// carve-out (Task 12). So `includeReported` appends exactly `pReported`,
// forever, and the densities are opt-in separately.
//
// `baked` swaps the vector patterns for the single <image> underlay
// texture-bake.mjs produces (Task 9) — a sheet passes it when the pattern
// layer would otherwise cover most of the canvas, which is 100% of
// rsvg-convert's cost.
export function patternDefs({
  includeReported = false,
  frontierTiers = false,
  baked = false,
  ids = LEGACY_PATTERN_IDS,
} = {}) {
  if (baked) return "";
  const wanted = [...ids];
  const add = (id) => {
    if (!wanted.includes(id)) wanted.push(id);
  };
  if (includeReported) add("pReported");
  if (frontierTiers) FRONTIER_TIER_IDS.forEach(add);
  return wanted
    .map((id) => PATTERNS[id])
    .filter(Boolean)
    .join("\n");
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
