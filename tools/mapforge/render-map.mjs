#!/usr/bin/env node
// mapforge — draws the cluster-1 world map as an AUTHORED VECTOR DOCUMENT from
// content/maps/cluster1-geography.json.
//
// This is a drafting problem, not a painting problem: a diffusion model cannot
// draw THIS world's coastline, THIS world's roads, or letter THIS world's place
// names and day-counts correctly. So the map is drawn, from data, in code.
//
// Contract:
//   * pure Node, no dependencies, no network, no GPU
//   * DETERMINISTIC — same input JSON, byte-identical SVG. No Math.random(),
//     no Date, no locale-dependent formatting, no object-iteration-order
//     surprises (every list is an array in the source JSON).
//   * every string lettered on the sheet comes from the JSON or from the
//     hard-coded legend vocabulary below; no place name is invented here.
//
// Usage:
//   node tools/mapforge/render-map.mjs            # SVG (+ PNG if rsvg-convert)
//   node tools/mapforge/render-map.mjs --no-png   # SVG only
//   node tools/mapforge/render-map.mjs --check    # self-checks, write nothing
//
// See tools/mapforge/README.md for the schema and the PNG step.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const SRC = join(REPO_ROOT, "content/maps/cluster1-geography.json");
const OUT_SVG = join(
  REPO_ROOT,
  "game-client/assets/art/maps/cluster1-world.svg",
);
const OUT_PNG = join(
  REPO_ROOT,
  "game-client/assets/art/maps/cluster1-world.png",
);
const PNG_WIDTH = 2000;

// ---------------------------------------------------------------------------
// Sheet geometry. km -> px is a single uniform scale; A1 §5.3 is explicit that
// the world must not be unevenly compressed.
// ---------------------------------------------------------------------------
const PX_PER_KM = 6.6;
const MAP_LEFT = 58;
const MAP_TOP = 96; // room above for the hard parchment edge + its caption
const PANEL_GAP = 34;
const PANEL_W = 486;
const SHEET_PAD = 46;

// Ink on cream. ONE accent colour, reserved entirely for the relay towers and
// their sight-lines (A1-ART-01).
const C = {
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

// ---------------------------------------------------------------------------
// Small deterministic helpers
// ---------------------------------------------------------------------------
const r2 = (n) => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};
const X = (km) => r2(MAP_LEFT + km * PX_PER_KM);
const Y = (km) => r2(MAP_TOP + km * PX_PER_KM);

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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

// ---------------------------------------------------------------------------
// Load + self-check
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const wantPng = !argv.includes("--no-png");
const checkOnly = argv.includes("--check");

const geo = JSON.parse(readFileSync(SRC, "utf8"));
const townById = Object.fromEntries(geo.towns.map((t) => [t.id, t]));
const zoneById = Object.fromEntries(geo.zones.map((z) => [z.id, z]));

const notes = [];
const problems = [];

for (const t of geo.towns) {
  const z = zoneById[t.zone];
  if (!z) problems.push(`town ${t.id}: unknown zone "${t.zone}"`);
  else if (!pointInPolygon(t.at, z.polygon))
    problems.push(`town ${t.id} at [${t.at}] is outside zone ${z.id}`);
}
for (const c of geo.camps) {
  const z = zoneById[c.zone];
  if (z && !pointInPolygon(c.at, z.polygon))
    problems.push(`camp ${c.id} is outside zone ${z.id}`);
}
for (const road of geo.roads) {
  if (road.roadKm == null) continue;
  const drawn = polylineKm(road.points);
  const delta = ((drawn - road.roadKm) / road.roadKm) * 100;
  notes.push(
    `road ${road.id.padEnd(22)} drawn ${drawn.toFixed(1).padStart(6)} km  ` +
      `declared ${String(road.roadKm).padStart(4)} km  (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%)`,
  );
}
for (const leg of geo.distances.legs) {
  const a = townById[leg.from];
  const b = townById[leg.to];
  if (!a || !b) {
    problems.push(`distance leg ${leg.from}->${leg.to}: unknown town`);
    continue;
  }
  const d = Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]);
  const delta = ((d - leg.straightKm) / leg.straightKm) * 100;
  if (Math.abs(delta) > 8)
    problems.push(
      `distance ${leg.from}->${leg.to}: computed ${d.toFixed(1)} km vs declared ${leg.straightKm} km (${delta.toFixed(1)}%)`,
    );
  notes.push(
    `leg  ${(leg.from + "->" + leg.to).padEnd(22)} straight ${d.toFixed(1).padStart(6)} km  ` +
      `declared ${String(leg.straightKm).padStart(4)} km  (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%)`,
  );
}
const towerById = Object.fromEntries(geo.relay.towers.map((t) => [t.id, t]));
let maxSpan = 0;
for (const chain of geo.relay.chains) {
  for (let i = 1; i < chain.towerIds.length; i++) {
    const a = towerById[chain.towerIds[i - 1]];
    const b = towerById[chain.towerIds[i]];
    if (!a || !b) {
      problems.push(`relay chain ${chain.id}: unknown tower id`);
      continue;
    }
    maxSpan = Math.max(
      maxSpan,
      Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]),
    );
  }
}
if (maxSpan > 10)
  problems.push(
    `relay: longest sight-line ${maxSpan.toFixed(1)} km exceeds the 10 km line-of-sight budget`,
  );
notes.push(
  `relay towers ${geo.relay.towers.length} (${geo.relay.towers.filter((t) => !t.town).length} field, ` +
    `${geo.relay.towers.filter((t) => t.town).length} town) · longest sight-line ${maxSpan.toFixed(1)} km`,
);

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------
const MAP_W = geo.coordinateSystem.extentKm.width * PX_PER_KM;
const MAP_H = geo.coordinateSystem.extentKm.height * PX_PER_KM;
const PANEL_X = MAP_LEFT + MAP_W + PANEL_GAP;
const SHEET_W = Math.round(PANEL_X + PANEL_W + SHEET_PAD);
const SHEET_H = Math.round(MAP_TOP + MAP_H + SHEET_PAD);
const MAP_RIGHT = MAP_LEFT + MAP_W;
const MAP_BOTTOM = MAP_TOP + MAP_H;

const o = [];
const put = (s) => o.push(s);

put(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${SHEET_H}" viewBox="0 0 ${SHEET_W} ${SHEET_H}" role="img" aria-label="${esc(geo.title)} — ${esc(geo.sheet.subtitle)}">`,
);
put(`<title>${esc(geo.title)} — ${esc(geo.sheet.subtitle)}</title>`);
put(
  `<desc>Authored vector map drawn from content/maps/cluster1-geography.json by tools/mapforge/render-map.mjs. Not a generated image.</desc>`,
);

// ---- defs: the six terrain fills, plus road/relay furniture ---------------
put("<defs>");
const pat = (id, w, h, body, transform = "") =>
  `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"${transform}>${body}</pattern>`;

// ice — broken horizontal shelf lines
put(
  pat(
    "pIce",
    26,
    13,
    `<path d="M0,4 h11 M15,4 h9 M4,9.5 h13 M20,9.5 h6" stroke="${C.inkSoft}" stroke-width="0.9" fill="none"/>`,
  ),
);
// upland — chevrons
put(
  pat(
    "pUpland",
    18,
    14,
    `<path d="M2,10 l4,-6 l4,6 M11,13 l3,-4.5 l3,4.5" stroke="${C.inkSoft}" stroke-width="0.9" fill="none"/>`,
  ),
);
// alkali flat — sparse stipple
put(
  pat(
    "pFlat",
    16,
    16,
    `<circle cx="3" cy="4" r="0.8" fill="${C.inkSoft}"/><circle cx="11" cy="9" r="0.8" fill="${C.inkSoft}"/><circle cx="6" cy="13" r="0.7" fill="${C.inkSoft}"/>`,
  ),
);
// rim country — single 45 degree hatch
put(
  pat(
    "pRim",
    11,
    11,
    `<path d="M0,11 l11,-11" stroke="${C.inkSoft}" stroke-width="0.75" fill="none"/>`,
  ),
);
// bramble — cross-hatch
put(
  pat(
    "pBramble",
    9,
    9,
    `<path d="M0,9 l9,-9 M0,0 l9,9" stroke="${C.inkSoft}" stroke-width="0.65" fill="none"/>`,
  ),
);
// tidal mire — the marsh tuft: a horizontal line with ticks standing on it
put(
  pat(
    "pMire",
    22,
    16,
    `<path d="M2,8 h9 M6.5,8 v-3.5 M4,8 v-2.5 M9,8 v-2.5" stroke="${C.inkMid}" stroke-width="0.8" fill="none"/>` +
      `<path d="M13,15 h8 M17,15 v-3 M14.8,15 v-2.2 M19.2,15 v-2.2" stroke="${C.inkMid}" stroke-width="0.8" fill="none"/>`,
  ),
);
// headland rock — dense short strokes
put(
  pat(
    "pRock",
    12,
    12,
    `<path d="M2,2 v4 M7,5 v4 M10,1 v3 M4,9 v3" stroke="${C.inkSoft}" stroke-width="0.9" fill="none"/>`,
  ),
);
// river country — reed dashes
put(
  pat(
    "pRiver",
    20,
    18,
    `<path d="M3,12 v-5 M6,14 v-4 M13,7 v-5 M16,9 v-4" stroke="${C.inkSoft}" stroke-width="0.8" fill="none"/>`,
  ),
);
// sea — the parchment stays bare; the coast echoes carry it

// zone outlines are drawn with a tighter tension than water: a zone is an
// administrative reading of the ground, not a natural feature, and must not
// balloon into a cloud.
const ZONE_TENSION = 10;
for (const z of geo.zones.concat(geo.terrainPatches ?? [])) {
  put(
    `<clipPath id="clip-${z.id}"><path d="${smooth(z.polygon, true, ZONE_TENSION)}"/></clipPath>`,
  );
}
put(
  `<clipPath id="clip-saltmire"><path d="${smooth(geo.saltmire.polygon, true, 8)}"/></clipPath>`,
);
// nothing may spill past the sheet's own border
put(
  `<clipPath id="clip-sheet"><rect x="${MAP_LEFT}" y="${MAP_TOP}" width="${r2(MAP_W)}" height="${r2(MAP_H)}"/></clipPath>`,
);
put("</defs>");

put(`<style>
  text { font-family: Georgia, "Iowan Old Style", "Times New Roman", serif; fill: ${C.ink}; }
  .lbl { paint-order: stroke fill; stroke: ${C.parchment}; stroke-width: 3.4px; stroke-linejoin: round; }
  .zn { paint-order: stroke fill; stroke: ${C.parchment}; stroke-width: 3.8px; stroke-linejoin: round; }
</style>`);

// ---- parchment ------------------------------------------------------------
put(`<rect width="${SHEET_W}" height="${SHEET_H}" fill="${C.parchment}"/>`);
put(
  `<rect x="${MAP_LEFT}" y="${MAP_TOP}" width="${r2(MAP_W)}" height="${r2(MAP_H)}" fill="${C.parchmentDeep}"/>`,
);

// everything from here to the sea-lane arrow lives inside the sheet border
put(`<g clip-path="url(#clip-sheet)">`);

// ---- the sea (west of the coastline) + coast echoes ------------------------
const coast = geo.coastline.points;
const seaPath =
  smooth(coast) +
  ` L${X(coast[coast.length - 1][0])},${Y(geo.coordinateSystem.extentKm.height)}` +
  ` L${MAP_LEFT},${Y(geo.coordinateSystem.extentKm.height)} L${MAP_LEFT},${MAP_TOP} Z`;
put(`<path d="${seaPath}" fill="${C.sea}"/>`);
put(`<g fill="none" stroke="${C.inkSoft}" stroke-width="0.8" opacity="0.62">`);
for (const d of [1.6, 3.4, 5.6]) {
  put(`<path d="${smooth(offsetKm(coast, d))}"/>`);
}
put("</g>");

// ---- terrain fills, clipped to each zone ----------------------------------
const FILL_FOR = {
  ice: "pIce",
  upland: "pUpland",
  "alkali-flat": "pFlat",
  rim: "pRim",
  bramble: "pBramble",
  headland: "pRock",
  "river-country": "pRiver",
};
for (const z of (geo.terrainPatches ?? []).concat(geo.zones)) {
  const fill = FILL_FOR[z.terrainKind];
  if (!fill) {
    problems.push(`${z.id}: no fill for terrainKind "${z.terrainKind}"`);
    continue;
  }
  put(
    `<rect x="${MAP_LEFT}" y="${MAP_TOP}" width="${r2(MAP_W)}" height="${r2(MAP_H)}" fill="url(#${fill})" clip-path="url(#clip-${z.id})" opacity="0.8"/>`,
  );
}
// terrain patches are ground, not zones: named in lower case, no level band,
// no boundary drawn.
for (const t of geo.terrainPatches ?? []) {
  put(
    `<text class="lbl" x="${X(t.labelAt[0])}" y="${Y(t.labelAt[1])}" text-anchor="middle" ` +
      `font-size="13" font-style="italic" letter-spacing="1.2" fill="${C.inkMid}">${esc(t.label)}</text>`,
  );
}

// ---- the Ashvale Front's grave rows ---------------------------------------
// A1 §7.1: grave rows as a hatched band; §7.2: the northern deep is left as
// BARE hatch with no rows drawn. The Bell School does not publish an
// inventory of its own unfinished work.
const front = zoneById["ashvale-front"];
put(
  `<g clip-path="url(#clip-ashvale-front)" stroke="${C.inkMid}" stroke-width="1" opacity="0.85">`,
);
for (const seg of front.gradientSegments) {
  if (!seg.graveRows) continue;
  for (let y = seg.yFromKm; y <= seg.yToKm; y += 3) {
    for (let x = 40; x <= 80; x += 3.4) {
      put(`<path d="M${X(x)},${Y(y)} v${r2(1.5 * PX_PER_KM)}"/>`);
    }
  }
}
put("</g>");

// ---- zone outlines --------------------------------------------------------
put(
  `<g fill="none" stroke="${C.inkMid}" stroke-width="1.15" stroke-dasharray="7 4 1.5 4" opacity="0.55">`,
);
for (const z of geo.zones)
  put(`<path d="${smooth(z.polygon, true, ZONE_TENSION)}"/>`);
put("</g>");

// ---- the Saltmire ---------------------------------------------------------
put(
  `<path d="${smooth(geo.saltmire.polygon, true, 8)}" fill="${C.sea}" stroke="${C.inkMid}" stroke-width="1.2" stroke-dasharray="3 3"/>`,
);
put(
  `<rect x="${MAP_LEFT}" y="${MAP_TOP}" width="${r2(MAP_W)}" height="${r2(MAP_H)}" fill="url(#pMire)" clip-path="url(#clip-saltmire)"/>`,
);

// ---- the river ------------------------------------------------------------
// One line, widening downstream — the four reaches of A1 §3.1. A single
// stroke, never a cased double line: a cased line reads as a road.
const river = geo.river.points;
const REACH_W = { "the-heads": 1.4, "upper-meltwash": 2.4, "tidal-reach": 3.6 };
for (const reach of geo.river.reaches) {
  if (reach.id === "into-the-mire") continue; // the river stops being a river
  const seg = river.slice(
    Math.max(reach.fromIndex - 1, 0),
    reach.toIndex + 2 > river.length ? river.length : reach.toIndex + 2,
  );
  put(
    `<path d="${smooth(seg)}" fill="none" stroke="${C.ink}" stroke-width="${REACH_W[reach.id]}" stroke-linecap="round"/>`,
  );
}
// the last reach dissolves: dotted, thinning, no bank
put(
  `<path d="${smooth(river.slice(geo.river.reaches[3].fromIndex))}" fill="none" ` +
    `stroke="${C.inkMid}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="9 5" opacity="0.75"/>`,
);
put(
  `<text class="lbl" x="${X(geo.river.labelAt[0])}" y="${Y(geo.river.labelAt[1])}" font-size="13.5" ` +
    `font-style="italic" letter-spacing="1.2" fill="${C.inkMid}">${esc(geo.river.name)}</text>`,
);

// tidal limit tick
{
  const tl = geo.river.tidalLimit;
  put(
    `<path d="M${X(tl.at[0] - 3.2)},${Y(tl.at[1] - 1.6)} L${X(tl.at[0] + 3.2)},${Y(tl.at[1] + 1.6)}" stroke="${C.ink}" stroke-width="1.6"/>`,
  );
  put(
    lineLabel(tl.label, [tl.at[0] - 8.5, tl.at[1] - 3.4], 0, {
      size: 12,
      italic: true,
      fill: C.inkMid,
      dy: 0,
    }),
  );
}

// the ford — a ROAD symbol, not a town symbol (A1 §7.1)
{
  const f = geo.river.ford;
  put(
    `<g stroke="${C.ink}" stroke-width="1.5" fill="none">` +
      `<path d="M${X(f.at[0] - 2.6)},${Y(f.at[1] - 1.4)} L${X(f.at[0] + 2.6)},${Y(f.at[1] - 1.4)}"/>` +
      `<path d="M${X(f.at[0] - 2.6)},${Y(f.at[1] + 1.4)} L${X(f.at[0] + 2.6)},${Y(f.at[1] + 1.4)}"/>` +
      `</g>`,
  );
  put(
    lineLabel(f.label, [f.at[0] - 1, f.at[1] + 4.6], 0, {
      size: 12,
      italic: true,
      fill: C.inkMid,
      dy: 0,
    }),
  );
}

// ---- roads ----------------------------------------------------------------
const ROAD_W = { trunk: 3.2, spur: 2.2, track: 1.5 };
for (const road of geo.roads) {
  const w = ROAD_W[road.weight] ?? 1.5;
  const dash = road.dashed ? ' stroke-dasharray="7 6"' : "";
  put(
    `<path d="${smooth(road.points)}" fill="none" stroke="${C.parchmentDeep}" stroke-width="${w + 3}" stroke-linecap="round"/>`,
  );
  put(
    `<path d="${smooth(road.points)}" fill="none" stroke="${C.ink}" stroke-width="${w}" stroke-linecap="round"${dash}/>`,
  );
}

// waystations at the interior day boundaries — A1 §7.2: the map draws
// waystations because the day-counts need somewhere to end.
put(`<g fill="${C.parchment}" stroke="${C.ink}" stroke-width="1.3">`);
for (const road of geo.roads) {
  if (!road.days || road.days < 2) continue;
  const L = polylineKm(road.points);
  for (let k = 1; k < road.days; k++) {
    const s = alongKm(road.points, (L * k) / road.days);
    put(`<circle cx="${X(s.at[0])}" cy="${Y(s.at[1])}" r="3.4"/>`);
  }
}
put("</g>");

// day-counts lettered ALONG the roads
for (const road of geo.roads) {
  if (!road.daysLabel) continue;
  const i = Math.min(road.labelAtIndex ?? 1, road.points.length - 2);
  const a = road.points[i];
  const b = road.points[i + 1];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  put(
    lineLabel(road.daysLabel, mid, ang, {
      size: road.days ? 14 : 12,
      italic: !road.days,
      fill: road.days ? C.ink : C.inkMid,
      dy: -7,
      tracking: 1,
    }),
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
put(
  `<g stroke="${C.accent}" stroke-width="1.7" stroke-dasharray="6 4" fill="none">`,
);
for (const chain of geo.relay.chains) {
  const pts = chain.towerIds.map((id) => towerById[id].at);
  put(`<path d="${poly(pts)}"/>`);
}
put("</g>");
for (const t of geo.relay.towers)
  put(towerGlyph(X(t.at[0]), Y(t.at[1]), false));
for (const t of geo.relay.detachedTowers ?? [])
  put(towerGlyph(X(t.at[0]), Y(t.at[1]), true));

// ---- Cindervast: walls and gate, no interior (A1 §7.2) --------------------
// City walls are built, not grown — drawn as the straight polygon they are,
// with a gap where the gate is. This IS the ruin symbol; there is no second
// marker, and nothing is drawn inside.
{
  const cv = townById.cindervast;
  put(
    `<path d="${poly(cv.wallsOnly.outline.concat([cv.wallsOnly.outline[0]]))}" ` +
      `fill="${C.parchment}" stroke="${C.ink}" stroke-width="2.4"/>`,
  );
  const g = cv.wallsOnly.gateAt;
  put(
    `<path d="M${X(g[0] - 1.6)},${Y(g[1])} L${X(g[0] + 1.6)},${Y(g[1])}" stroke="${C.parchment}" stroke-width="3.4"/>`,
  );
}

// ---- towns + the camp -----------------------------------------------------
for (const t of geo.towns) {
  const px = X(t.at[0]);
  const py = Y(t.at[1]);
  if (!t.ruin) {
    put(
      `<circle cx="${px}" cy="${py}" r="6" fill="${C.parchment}" stroke="${C.ink}" stroke-width="2.2"/>`,
    );
    put(`<circle cx="${px}" cy="${py}" r="2.4" fill="${C.ink}"/>`);
  }
  const east = t.labelAnchor === "east";
  const off = t.ruin ? 30 : 11;
  put(
    `<text class="lbl" x="${r2(px + (east ? off : -off))}" y="${r2(py + 5)}" ` +
      `text-anchor="${east ? "start" : "end"}" font-size="19" letter-spacing="1.6" ` +
      `fill="${C.ink}">${esc(t.name)}</text>`,
  );
}
for (const c of geo.camps) {
  const px = X(c.at[0]);
  const py = Y(c.at[1]);
  put(
    `<path d="M${r2(px)},${r2(py - 5)} L${r2(px + 5)},${r2(py + 4)} L${r2(px - 5)},${r2(py + 4)} Z" fill="none" stroke="${C.ink}" stroke-width="1.6"/>`,
  );
  put(
    `<text class="lbl" x="${r2(px + 9)}" y="${r2(py + 5)}" font-size="12.5" font-style="italic" fill="${C.inkMid}">${esc(c.name)}</text>`,
  );
}

// ---- zone labels with level bands -----------------------------------------
for (const z of geo.zones) {
  const at = z.labelAt ?? centroid(z.polygon);
  const band = z.gradient
    ? `${z.levelBand[0]}–${z.levelBand[1]} · gradient`
    : `${z.levelBand[0]}–${z.levelBand[1]}`;
  put(
    `<text class="zn" x="${X(at[0])}" y="${Y(at[1])}" text-anchor="middle" ` +
      `font-size="16" letter-spacing="3" fill="${C.inkMid}">${esc(z.name.toUpperCase())}</text>`,
  );
  put(
    `<text class="zn" x="${X(at[0])}" y="${r2(Y(at[1]) + 17)}" text-anchor="middle" ` +
      `font-size="12.5" letter-spacing="1.4" fill="${C.inkSoft}">${esc(band)}</text>`,
  );
}
// the Front's three gradient segments, lettered inside it
for (const seg of front.gradientSegments) {
  const y = seg.yFromKm + (seg.yToKm - seg.yFromKm) * 0.25;
  put(
    `<text class="lbl" x="${X(59)}" y="${Y(y)}" text-anchor="middle" font-size="11.5" ` +
      `font-style="italic" fill="${C.inkMid}">${esc(seg.label)} · ${seg.levelBand[0]}–${seg.levelBand[1]}</text>`,
  );
}
put("</g>"); // end sheet clip

// ---- the sea lane, one arrow off the west edge -----------------------------
// A1 §7.2: one arrow off the west edge with the trade wind's season written
// on it, and nothing else. It is meant to leave the sheet.
{
  const s = geo.seaLane;
  const tail = [X(s.from[0] - 4), Y(s.from[1] - 3)];
  const tip = [r2(MAP_LEFT - 26), Y(s.to[1])];
  put(
    `<path d="M${tail[0]},${tail[1]} L${tip[0]},${tip[1]}" stroke="${C.ink}" stroke-width="1.5"/>`,
  );
  const ang = r2(
    (Math.atan2(tip[1] - tail[1], tip[0] - tail[0]) * 180) / Math.PI,
  );
  put(
    `<path d="M${tip[0]},${tip[1]} l9,-4 l0,8 Z" fill="${C.ink}" transform="rotate(${ang + 180} ${tip[0]} ${tip[1]})"/>`,
  );
  put(
    `<text x="${r2(MAP_LEFT - 24)}" y="${r2(Y(s.to[1]) - 12)}" font-size="11.5" font-style="italic" ` +
      `fill="${C.inkMid}" transform="rotate(-90 ${r2(MAP_LEFT - 24)} ${r2(Y(s.to[1]) - 12)})">${esc(s.label)}</text>`,
  );
}

// ---- the sea, named -------------------------------------------------------
put(
  `<text class="lbl" x="${X(5)}" y="${Y(70)}" text-anchor="middle" font-size="15" ` +
    `letter-spacing="6" font-style="italic" fill="${C.inkSoft}" ` +
    `transform="rotate(-90 ${X(5)} ${Y(70)})">THE SEA</text>`,
);

// ---- the north mark (no compass rose — A1-ART-01) -------------------------
{
  const n = geo.sheet.northMark;
  const px = X(n.at[0]);
  const py = Y(n.at[1]);
  put(
    `<g stroke="${C.ink}" stroke-width="1.6" fill="none">` +
      `<path d="M${px},${r2(py + 22)} L${px},${r2(py - 20)}"/>` +
      `<path d="M${r2(px - 5)},${r2(py - 12)} L${px},${r2(py - 22)} L${r2(px + 5)},${r2(py - 12)} Z" fill="${C.ink}"/>` +
      `</g>`,
  );
  put(
    `<text x="${px}" y="${r2(py + 38)}" text-anchor="middle" font-size="15" letter-spacing="2" fill="${C.ink}">${esc(n.label)}</text>`,
  );
}

// ---- the hard parchment edge along the top --------------------------------
// A1 §7.2 / A1-ART-01: the map ends where the ice starts moving. There is a
// north edge to the parchment and it is NOT a coastline.
put(
  `<rect x="${MAP_LEFT}" y="${MAP_TOP - 7}" width="${r2(MAP_W)}" height="7" fill="${C.parchment}"/>`,
);
put(
  `<path d="M${MAP_LEFT},${MAP_TOP} L${r2(MAP_RIGHT)},${MAP_TOP}" stroke="${C.ink}" stroke-width="4.5"/>`,
);
put(
  `<path d="M${MAP_LEFT},${r2(MAP_TOP - 5)} L${r2(MAP_RIGHT)},${r2(MAP_TOP - 5)}" stroke="${C.ink}" stroke-width="1.2"/>`,
);
put(
  `<text x="${r2(MAP_LEFT + MAP_W / 2)}" y="${r2(MAP_TOP - 14)}" text-anchor="middle" font-size="12.5" ` +
    `font-style="italic" letter-spacing="1.4" fill="${C.inkMid}">the sheet ends here · the ice moves beyond it</text>`,
);
// the remaining three sides — a plain working border, no cartouche flourish
put(
  `<path d="M${MAP_LEFT},${MAP_TOP} L${MAP_LEFT},${r2(MAP_BOTTOM)} L${r2(MAP_RIGHT)},${r2(MAP_BOTTOM)} L${r2(MAP_RIGHT)},${MAP_TOP}" ` +
    `fill="none" stroke="${C.ink}" stroke-width="1.6"/>`,
);

// ---------------------------------------------------------------------------
// The right-hand panel: title block, legend, walking table, hand + omissions
// ---------------------------------------------------------------------------
let py = MAP_TOP + 4;
const panelText = (s, opts = {}) => {
  put(
    `<text x="${opts.x ?? PANEL_X}" y="${r2(py)}" font-size="${opts.size ?? 13}" ` +
      `fill="${opts.fill ?? C.ink}" letter-spacing="${opts.tracking ?? 0}"` +
      `${opts.italic ? ' font-style="italic"' : ""}` +
      `${opts.anchor ? ` text-anchor="${opts.anchor}"` : ""}>${esc(s)}</text>`,
  );
  py += opts.lead ?? 18;
};
const rule = (gap = 12) => {
  py += gap;
  put(
    `<path d="M${PANEL_X},${r2(py)} L${r2(PANEL_X + PANEL_W)},${r2(py)}" stroke="${C.ink}" stroke-width="1" opacity="0.5"/>`,
  );
  py += gap + 6;
};

py = MAP_TOP + 26;
panelText(geo.sheet.title, { size: 25, tracking: 3, lead: 26 });
panelText(geo.sheet.subtitle, {
  size: 15,
  italic: true,
  fill: C.inkMid,
  lead: 20,
});
rule(10);

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
for (const ln of wrap(geo.sheet.hand, 62))
  panelText(ln, { size: 12, italic: true, fill: C.inkMid, lead: 16 });
rule(10);

// --- legend ---
panelText("LEGEND", { size: 13, tracking: 4, fill: C.inkMid, lead: 22 });

const swatchX = PANEL_X + 4;
const textX = PANEL_X + 78;
function legendRow(drawFn, label, sub) {
  const cy = py - 4;
  put(drawFn(swatchX, cy));
  put(
    `<text x="${textX}" y="${r2(py)}" font-size="13" fill="${C.ink}">${esc(label)}</text>`,
  );
  if (sub) {
    py += 15;
    put(
      `<text x="${textX}" y="${r2(py)}" font-size="11.5" font-style="italic" fill="${C.inkSoft}">${esc(sub)}</text>`,
    );
  }
  py += 22;
}

legendRow(
  (x, y) =>
    `<path d="M${x},${y} h56" stroke="${C.ink}" stroke-width="3.2" stroke-linecap="round"/>`,
  "the trade road",
  "day-counts are lettered on the legs",
);
legendRow(
  (x, y) =>
    `<path d="M${x},${y} h56" stroke="${C.ink}" stroke-width="2.2" stroke-linecap="round"/>`,
  "the coastal spur · the river road",
);
legendRow(
  (x, y) =>
    `<path d="M${x},${y} h56" stroke="${C.ink}" stroke-width="1.5" stroke-linecap="round"/>`,
  "rim tracks",
);
legendRow(
  (x, y) =>
    `<path d="M${x},${y} h56" stroke="${C.ink}" stroke-width="1.5" stroke-dasharray="7 6"/>`,
  "not maintained",
);
legendRow(
  (x, y) =>
    `<circle cx="${x + 28}" cy="${y}" r="3.4" fill="${C.parchment}" stroke="${C.ink}" stroke-width="1.3"/>`,
  "a waystation",
  "where a day's walk ends",
);
legendRow(
  (x, y) =>
    `<circle cx="${x + 28}" cy="${y}" r="6" fill="${C.parchment}" stroke="${C.ink}" stroke-width="2.2"/>` +
    `<circle cx="${x + 28}" cy="${y}" r="2.4" fill="${C.ink}"/>`,
  "a town",
  "sized by nothing — the map does not rank them",
);
legendRow(
  (x, y) =>
    `<path d="M${x + 19},${y - 5} L${x + 35},${y - 4} L${x + 37},${y + 1} L${x + 34},${y + 5} L${x + 21},${y + 4} L${x + 18},${y} Z" ` +
    `fill="none" stroke="${C.ink}" stroke-width="1.9"/>` +
    `<path d="M${x + 25},${y + 4.4} h6" stroke="${C.parchment}" stroke-width="2.8"/>`,
  "a ruin · walls and gate, no interior",
);
legendRow(
  (x, y) =>
    `<g stroke="${C.ink}" stroke-width="1.5" fill="none"><path d="M${x + 20},${y - 3} h16"/><path d="M${x + 20},${y + 3} h16"/></g>`,
  "the ford",
  "infrastructure, not a settlement",
);
legendRow(
  (x, y) =>
    `<path d="M${x + 24},${y + 3.4} L${x + 25.1},${y - 3.2} L${x + 28.1},${y - 3.2} L${x + 29.2},${y + 3.4} Z" fill="${C.accent}"/>` +
    `<path d="M${x + 23},${y - 3.2} h7.2" stroke="${C.accent}" stroke-width="1.4"/>` +
    `<path d="M${x},${y} h20 M${x + 33},${y} h23" stroke="${C.accentSoft}" stroke-width="1.1" stroke-dasharray="2 4"/>`,
  "a relay tower and its sight-line",
  "the Bellfaith's chain — this sheet's subject",
);

const TERRAIN_LEGEND = [
  ["pIce", "ice shelf"],
  ["pUpland", "upland"],
  ["pFlat", "alkali flat"],
  ["pRim", "rim country"],
  ["pBramble", "bramble"],
  ["pMire", "tidal mire"],
];
py += 4;
put(
  `<text x="${PANEL_X}" y="${r2(py)}" font-size="12" letter-spacing="2" fill="${C.inkMid}">SIX FILLS · NO CONTOURS</text>`,
);
py += 16;
for (let i = 0; i < TERRAIN_LEGEND.length; i++) {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const bx = PANEL_X + col * 250;
  const by = py + row * 34;
  put(
    `<rect x="${bx}" y="${r2(by)}" width="40" height="24" fill="${C.parchmentDeep}" stroke="${C.inkSoft}" stroke-width="0.8"/>`,
  );
  put(
    `<rect x="${bx}" y="${r2(by)}" width="40" height="24" fill="url(#${TERRAIN_LEGEND[i][0]})"/>`,
  );
  put(
    `<text x="${bx + 48}" y="${r2(by + 16)}" font-size="12.5" fill="${C.ink}">${esc(TERRAIN_LEGEND[i][1])}</text>`,
  );
}
py += 3 * 34 + 4;
rule(8);

// --- the walking table (A1 §7.1: no scale bar; a walking table) ------------
panelText("THE WALKING TABLE", {
  size: 13,
  tracking: 4,
  fill: C.inkMid,
  lead: 8,
});
panelText(geo.sheet.scaleBarNote.replace(/^A1 §7\.1: /, ""), {
  size: 11.5,
  italic: true,
  fill: C.inkSoft,
  lead: 22,
});
for (const leg of geo.distances.legs) {
  const a = townById[leg.from].name;
  const b = townById[leg.to].name;
  put(
    `<text x="${PANEL_X}" y="${r2(py)}" font-size="12.5" fill="${C.ink}">${esc(a)} — ${esc(b)}</text>`,
  );
  put(
    `<text x="${r2(PANEL_X + PANEL_W)}" y="${r2(py)}" font-size="12.5" text-anchor="end" fill="${C.ink}">${esc(leg.canonDays)}</text>`,
  );
  py += 19;
}
py += 2;
panelText(`a travel-day is about ${geo.distances.paceKmPerDay} km of road`, {
  size: 11.5,
  italic: true,
  fill: C.inkSoft,
  lead: 16,
});
rule(8);

// --- what this sheet does not show ----------------------------------------
panelText("NOT SHOWN ON THIS SHEET", {
  size: 13,
  tracking: 4,
  fill: C.inkMid,
  lead: 20,
});
for (const w of geo.sheet.withheld) {
  put(
    `<text x="${PANEL_X}" y="${r2(py)}" font-size="12" fill="${C.inkMid}">·  ${esc(w)}</text>`,
  );
  py += 17;
}

// --- provenance foot ------------------------------------------------------
put(
  `<text x="${PANEL_X}" y="${r2(MAP_BOTTOM - 16)}" font-size="11" font-style="italic" fill="${C.inkSoft}">` +
    `drawn from content/maps/cluster1-geography.json</text>`,
);
put(
  `<text x="${PANEL_X}" y="${r2(MAP_BOTTOM)}" font-size="11" font-style="italic" fill="${C.inkSoft}">` +
    `by tools/mapforge/render-map.mjs — authored vector, not generated</text>`,
);

put("</svg>");

const svg = o.join("\n") + "\n";

// ---------------------------------------------------------------------------
// Report + write
// ---------------------------------------------------------------------------
console.log("mapforge · cluster 1");
console.log(`  source: ${SRC}`);
for (const n of notes) console.log(`  ${n}`);
console.log(`  sheet:  ${SHEET_W} x ${SHEET_H} px @ ${PX_PER_KM} px/km`);

if (problems.length) {
  console.error("\n  PROBLEMS:");
  for (const p of problems) console.error(`    ${p}`);
  process.exit(1);
}

if (checkOnly) {
  console.log("\n  --check: no files written");
  process.exit(0);
}

mkdirSync(dirname(OUT_SVG), { recursive: true });
writeFileSync(OUT_SVG, svg, "utf8");
console.log(`\n  wrote ${OUT_SVG} (${svg.length} bytes)`);

if (wantPng) {
  const probe = spawnSync("rsvg-convert", ["--version"], { encoding: "utf8" });
  if (probe.status === 0) {
    const res = spawnSync(
      "rsvg-convert",
      ["-w", String(PNG_WIDTH), "-b", C.parchment, OUT_SVG, "-o", OUT_PNG],
      { encoding: "utf8" },
    );
    if (res.status === 0)
      console.log(`  wrote ${OUT_PNG} (${PNG_WIDTH}px wide)`);
    else {
      console.error(`  rsvg-convert failed: ${res.stderr || res.status}`);
      process.exit(1);
    }
  } else {
    console.log(
      `  rsvg-convert not on PATH — PNG not written. To produce it:\n` +
        `    rsvg-convert -w ${PNG_WIDTH} -b '${C.parchment}' ${OUT_SVG} -o ${OUT_PNG}\n` +
        `  (any of: librsvg, ImageMagick 'magick -density 200', or\n` +
        `   'Google Chrome' --headless --screenshot will do; the SVG is self-contained)`,
    );
  }
}
