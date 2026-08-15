// tools/mapforge/lib/basin-sheet.mjs — the basin sheet as a function.
//
// Moved verbatim out of render-map.mjs: the self-check block, sheet-size
// derivation, the whole draw pass, and the join. File loading, argv parsing,
// writing, and PNG rasterization stay in render-map.mjs (the thin CLI).

import {
  C,
  ZONE_TENSION,
  REACH_W,
  ROAD_W,
  FILL_FOR,
  TERRAIN_LEGEND,
  r2,
  esc,
  centroid,
  pointInPolygon,
  polylineKm,
  alongKm,
  offsetKm,
  wrap,
  patternDefs,
  createDraft,
} from "./draft.mjs";

// ---------------------------------------------------------------------------
// Sheet geometry. km -> px is a single uniform scale; A1 §5.3 is explicit that
// the world must not be unevenly compressed.
// ---------------------------------------------------------------------------
// F-045 Task 4: 6.6 -> 33 (×5) — the basin's own km extent (extentKm, from
// content/maps/cluster1-geography.json) shrank ÷5 in the same rescale, so
// canvas size (extentKm * PX_PER_KM) is unchanged; only density improves.
const PX_PER_KM = 33;
const MAP_LEFT = 58;
const MAP_TOP = 96; // room above for the hard parchment edge + its caption
const PANEL_GAP = 34;
const PANEL_W = 486;
const SHEET_PAD = 46;

export function drawBasinSheet({ doc }) {
  const geo = doc;

  const { X, Y, poly, smooth, lineLabel, towerGlyph } = createDraft({
    pxPerKm: PX_PER_KM,
    mapLeft: MAP_LEFT,
    mapTop: MAP_TOP,
  });

  // ---------------------------------------------------------------------------
  // Self-check
  // ---------------------------------------------------------------------------
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
  // F-045 Task 4: 10 -> 2 (÷5) — matches scripts/check_content.mjs's Task 2
  // relay-hop gate constant (same budget, this is the basin sheet's own
  // independent self-check of it).
  if (maxSpan > 2)
    problems.push(
      `relay: longest sight-line ${maxSpan.toFixed(1)} km exceeds the 2 km line-of-sight budget`,
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
  put(patternDefs());
  // sea — the parchment stays bare; the coast echoes carry it

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
  put(
    `<g fill="none" stroke="${C.inkSoft}" stroke-width="0.8" opacity="0.62">`,
  );
  // F-045 Task 4: 1.6/3.4/5.6 -> 0.32/0.68/1.12 (÷5) — coast-echo offset
  // distances (offsetKm call sites), true km against the now-30x38 basin.
  for (const d of [0.32, 0.68, 1.12]) {
    put(`<path d="${smooth(offsetKm(coast, d))}"/>`);
  }
  put("</g>");

  // ---- terrain fills, clipped to each zone ----------------------------------
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
  // F-045 Task 4: row spacing 3 -> 0.6, column range 40-80 -> 8-16 (was a
  // hardcoded x-window bracketing ashvale-front's own pre-rescale x-extent,
  // ~42-78 — now the region's real 8.4-15.6 x-range), column step 3.4 -> 0.68,
  // tick length 1.5 -> 0.3 km — all real km values, ÷5.
  for (const seg of front.gradientSegments) {
    if (!seg.graveRows) continue;
    for (let y = seg.yFromKm; y <= seg.yToKm; y += 0.6) {
      for (let x = 8; x <= 16; x += 0.68) {
        put(`<path d="M${X(x)},${Y(y)} v${r2(0.3 * PX_PER_KM)}"/>`);
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
  // F-045 Task 4: tick half-extent 3.2/1.6 -> 0.64/0.32, label offset
  // 8.5/3.4 -> 1.7/0.68 (÷5) — real km offsets from tl.at (a rescaled
  // geo-anchor), fed through X()/Y() same as offsetKm/alongKm call sites.
  {
    const tl = geo.river.tidalLimit;
    put(
      `<path d="M${X(tl.at[0] - 0.64)},${Y(tl.at[1] - 0.32)} L${X(tl.at[0] + 0.64)},${Y(tl.at[1] + 0.32)}" stroke="${C.ink}" stroke-width="1.6"/>`,
    );
    put(
      lineLabel(tl.label, [tl.at[0] - 1.7, tl.at[1] - 0.68], 0, {
        size: 12,
        italic: true,
        fill: C.inkMid,
        dy: 0,
      }),
    );
  }

  // the ford — a ROAD symbol, not a town symbol (A1 §7.1)
  // F-045 Task 4: mark half-extent 2.6/1.4 -> 0.52/0.28, label offset
  // 1/4.6 -> 0.2/0.92 (÷5) — same real-km-offset-from-anchor pattern as the
  // tidal-limit tick above.
  {
    const f = geo.river.ford;
    put(
      `<g stroke="${C.ink}" stroke-width="1.5" fill="none">` +
        `<path d="M${X(f.at[0] - 0.52)},${Y(f.at[1] - 0.28)} L${X(f.at[0] + 0.52)},${Y(f.at[1] - 0.28)}"/>` +
        `<path d="M${X(f.at[0] - 0.52)},${Y(f.at[1] + 0.28)} L${X(f.at[0] + 0.52)},${Y(f.at[1] + 0.28)}"/>` +
        `</g>`,
    );
    put(
      lineLabel(f.label, [f.at[0] - 0.2, f.at[1] + 0.92], 0, {
        size: 12,
        italic: true,
        fill: C.inkMid,
        dy: 0,
      }),
    );
  }

  // ---- roads ----------------------------------------------------------------
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

  // waystations at the interior hour boundaries — A1 §7.2: the map draws
  // waystations because the day-counts need somewhere to end (F-045 Task 4:
  // road.days/daysLabel -> road.hours/hoursLabel — the field rescale_spine.mjs
  // (Task 1) applied to edges.json/cluster1-geography.json, but this
  // renderer still read the old names, so every road silently evaluated
  // `undefined` here: zero waystations and zero road labels were drawn on
  // the pre-fix render — a "green" chart with an invisible whole layer
  // missing, caught by the Task 4 controller visual pass).
  put(`<g fill="${C.parchment}" stroke="${C.ink}" stroke-width="1.3">`);
  for (const road of geo.roads) {
    if (!road.hours || road.hours < 2) continue;
    const L = polylineKm(road.points);
    for (let k = 1; k < road.hours; k++) {
      const s = alongKm(road.points, (L * k) / road.hours);
      put(`<circle cx="${X(s.at[0])}" cy="${Y(s.at[1])}" r="3.4"/>`);
    }
  }
  put("</g>");

  // hour-counts lettered ALONG the roads
  for (const road of geo.roads) {
    if (!road.hoursLabel) continue;
    const i = Math.min(road.labelAtIndex ?? 1, road.points.length - 2);
    const a = road.points[i];
    const b = road.points[i + 1];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    put(
      lineLabel(road.hoursLabel, mid, ang, {
        size: road.hours ? 14 : 12,
        italic: !road.hours,
        fill: road.hours ? C.ink : C.inkMid,
        dy: -7,
        tracking: 1,
      }),
    );
  }

  // ---- relay chain — the map's actual subject, in the one accent colour ------
  // Drawn OVER the roads it parallels, because on this sheet the chain is the
  // subject and the road is the context (A1 §7.1).
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
  // F-045 Task 4: fixed label column x=59 -> 11.8 (÷5) — a hardcoded km
  // x-position for this zone's gradient-segment lettering, was tuned to sit
  // inside ashvale-front's pre-rescale x-extent.
  for (const seg of front.gradientSegments) {
    const y = seg.yFromKm + (seg.yToKm - seg.yFromKm) * 0.25;
    put(
      `<text class="lbl" x="${X(11.8)}" y="${Y(y)}" text-anchor="middle" font-size="11.5" ` +
        `font-style="italic" fill="${C.inkMid}">${esc(seg.label)} · ${seg.levelBand[0]}–${seg.levelBand[1]}</text>`,
    );
  }
  put("</g>"); // end sheet clip

  // ---- the sea lane, one arrow off the west edge -----------------------------
  // A1 §7.2: one arrow off the west edge with the trade wind's season written
  // on it, and nothing else. It is meant to leave the sheet.
  {
    // F-045 Task 4: tail offset 4/3 -> 0.8/0.6 (÷5) — real km offset from
    // s.from (a rescaled geo-anchor); the tip stays MAP_LEFT-relative px,
    // untouched (it deliberately leaves the sheet off the west edge).
    const s = geo.seaLane;
    const tail = [X(s.from[0] - 0.8), Y(s.from[1] - 0.6)];
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
  // F-045 Task 4: fixed position (5,70) -> (1,14) (÷5) — hardcoded km spot
  // for "THE SEA" in the open water west of the coast.
  put(
    `<text class="lbl" x="${X(1)}" y="${Y(14)}" text-anchor="middle" font-size="15" ` +
      `letter-spacing="6" font-style="italic" fill="${C.inkSoft}" ` +
      `transform="rotate(-90 ${X(1)} ${Y(14)})">THE SEA</text>`,
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
    // F-045 Task 5: was "day-counts are lettered on the legs" — the sheet's
    // roads now carry hour labels (rescale_spine.mjs, Task 1), not day-counts.
    "hours are lettered on the legs",
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
    // F-045 Task 5: was "where a day's walk ends" — waystations are now
    // drawn at hour boundaries (see the road loop above), not day boundaries.
    "where an hour of the road ends",
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
      // F-045 Task 4: leg.canonDays -> leg.canonHours (same rename bug as
      // the road waystations above — this printed literal "undefined" for
      // every row in the walking table until fixed).
      `<text x="${r2(PANEL_X + PANEL_W)}" y="${r2(py)}" font-size="12.5" text-anchor="end" fill="${C.ink}">${esc(leg.canonHours)}</text>`,
    );
    py += 19;
  }
  py += 2;
  // F-045 Task 5: was `paceKmPerDay` ("a travel-day is about 30 km of
  // road") — the walking table above already prints hours per leg
  // (leg.canonHours), so the footnote now speaks in the same unit.
  panelText(`a travel-hour is about ${geo.distances.paceKmPerHour} km of road`, {
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

  return { svg, notes, problems };
}
