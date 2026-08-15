// tools/mapforge/lib/atlas-sheet.mjs — the world (atlas) sheet as a function.
//
// F-042 Task 6. Draws the full 2000×2000 km frame of n-atlas with the
// Meltwash basin as a surveyed miniature in its top-left corner, the western
// sea strip, seven town dots, the Gildmark sea-lane leaving the sheet, and
// honest empty parchment everywhere the survey has never reached.
//
// Every drawn element traces to a spine node/feature/edge or a string in
// content/spine/sheet-atlas.json — no invented geography. The ~99%
// unauthored area stays empty parchment on purpose.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  C,
  ZONE_TENSION,
  r2,
  esc,
  pointInPolygon,
  wrap,
  createDraft,
  centroid,
  polylineKm,
  alongKm,
  patternDefs,
} from "./draft.mjs";
import { loadSpine, buildTree, resolveToRoot } from "../../../scripts/lib/spine.mjs";

export const ATLAS_PX_PER_KM = 0.7; // 2000 km → 1400 px map frame
export const ATLAS_MAP_LEFT = 58;
export const ATLAS_MAP_TOP = 96;
const SHEET_PAD = 46;

export function drawAtlasSheet({ spine, tree, sheet }) {
  const problems = [];
  const notes = [];

  // ---- data joins — everything drawn is looked up here ---------------------
  const atlas = tree.byId.get("n-atlas");
  const cluster = tree.byId.get("n-cluster1");
  const westsea = tree.byId.get("n-westsea");
  if (!atlas || !cluster || !westsea) {
    problems.push(
      `missing spine node(s): ${["n-atlas", "n-cluster1", "n-westsea"]
        .filter((id) => !tree.byId.get(id))
        .join(", ")}`,
    );
    return { svg: "", notes, problems };
  }

  const [EXT_W, EXT_H] = atlas.interior.size; // [2000, 2000] atlas-km
  const feature = (id) => (cluster.features ?? []).find((f) => f.id === id);
  const coast = feature("f-west-coast");
  const river = feature("f-the-meltwash");
  if (!coast) problems.push("n-cluster1: feature f-west-coast not found");
  if (!river) problems.push("n-cluster1: feature f-the-meltwash not found");

  const seaLane = (spine.edges ?? []).find((e) => e.kind === "sealane");
  let laneFrom = null;
  let laneFar = null;
  if (!seaLane) {
    problems.push("edges.json: no sealane edge");
  } else {
    const fromNode = tree.byId.get(seaLane.from?.node);
    laneFar = feature(seaLane.to?.feature);
    if (!fromNode)
      problems.push(`sealane: from node "${seaLane.from?.node}" not found`);
    else
      laneFrom = resolveToRoot({
        tree,
        id: fromNode.parentId,
        point: fromNode.placement.anchor,
      });
    if (!laneFar)
      problems.push(`sealane: far feature "${seaLane.to?.feature}" not found`);
    else if (!laneFar.offSheet)
      problems.push(`sealane: far point ${laneFar.id} is not declared offSheet`);
  }

  // one dot per town-tier node; anchor is in the PARENT's frame, so resolve
  // through the parent (the spine's shared-grid rule makes these atlas-km).
  const towns = [...tree.byId.values()]
    .filter((n) => n.tier === "town")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const townDots = [];
  for (const t of towns) {
    const at = resolveToRoot({ tree, id: t.parentId, point: t.placement.anchor });
    if (at === null) {
      problems.push(`town ${t.id}: anchor could not be resolved to the root frame`);
      continue;
    }
    if (!pointInPolygon(at, cluster.placement.points))
      problems.push(`town ${t.id} at [${at}] is outside the n-cluster1 polygon`);
    townDots.push({ id: t.id, at });
  }
  if (townDots.length !== towns.length)
    problems.push(
      `town-tier count ${towns.length} != dot count ${townDots.length}`,
    );
  notes.push(`towns ${towns.length} · dots ${townDots.length}`);

  // ---- self-check: nothing drawn may leave the frame except offSheet points
  const checkFrame = (label, pts) => {
    for (const p of pts)
      if (p[0] < 0 || p[0] > EXT_W || p[1] < 0 || p[1] > EXT_H)
        problems.push(
          `${label}: point [${p}] outside the ${EXT_W}x${EXT_H} km frame`,
        );
  };
  checkFrame("n-cluster1 polygon", cluster.placement.points);
  checkFrame("n-westsea polygon", westsea.placement.points);
  if (coast) checkFrame("f-west-coast", coast.points);
  if (river) checkFrame("f-the-meltwash", river.points);
  checkFrame("town dots", townDots.map((d) => d.at));
  checkFrame("north mark", [sheet.northMark.at]);
  if (laneFrom) checkFrame("sea-lane tail", [laneFrom]);
  // laneFar is declared offSheet — exempt by design (it leaves the sheet).

  // ---- F-043: the wider world — tier-1 children of n-atlas beyond the -------
  // basin pair (n-cluster1/n-westsea already joined above). Sorted by id for
  // determinism, same rule the basin block's town list uses.
  const worldChildren = [...tree.byId.values()]
    .filter((n) => n.parentId === "n-atlas" && n.id !== "n-cluster1" && n.id !== "n-westsea")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const worldLand = worldChildren.filter((n) => n.tier === "continent");
  const worldOceans = worldChildren.filter((n) => n.tier === "ocean");

  // self-check: pairwise coast-crossing, over every tier-1 land polygon
  // (the surveyed basin's n-cluster1 counts as land too). Reuses the proper-
  // crossing test scripts/lib/spine.mjs's selfIntersects() is built on.
  const orient = (p, q, r) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const properCross = (p1, p2, p3, p4) => {
    const o1 = orient(p1, p2, p3);
    const o2 = orient(p1, p2, p4);
    const o3 = orient(p3, p4, p1);
    const o4 = orient(p3, p4, p2);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
  };
  const landPolys = [
    { id: cluster.id, pts: cluster.placement.points },
    ...worldLand.map((n) => ({ id: n.id, pts: n.placement.points })),
  ];
  for (let i = 0; i < landPolys.length; i++) {
    for (let j = i + 1; j < landPolys.length; j++) {
      const A = landPolys[i];
      const B = landPolys[j];
      let crossed = false;
      for (let a = 0; a < A.pts.length && !crossed; a++) {
        const a1 = A.pts[a];
        const a2 = A.pts[(a + 1) % A.pts.length];
        for (let b = 0; b < B.pts.length; b++) {
          const b1 = B.pts[b];
          const b2 = B.pts[(b + 1) % B.pts.length];
          if (properCross(a1, a2, b1, b2)) {
            crossed = true;
            break;
          }
        }
      }
      if (crossed) problems.push(`coast ${A.id} crosses ${B.id}`);
    }
  }

  // ---- F-043 fix: land-bbox helper for the ocean-label clear-of-land nudge -
  // (used below, ocean-name loop). 60km (the spec'd "steer clear of the
  // coast" margin) left a real overlap on Galereach/Coldreach in visual QA —
  // the thing that has to stay clear is a rotated, ~18-character label's
  // rendered footprint, not just its single anchor point — but a much wider
  // margin (tried 220km) over-triggers: Keelbreak's own centroid then reads
  // as "inside" Coldreach's expanded box too, nudging a sea that was never
  // near land. 100km is the smallest margin that clears the real Galereach/
  // Coldreach overlap (confirmed against the built SVG) without dragging in
  // Keelbreak or Tarnmark, which both stay a no-op at this value.
  const LAND_CLEARANCE_KM = 100;
  const landBboxes = landPolys.map(({ id, pts }) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return {
      id,
      minX: Math.min(...xs) - LAND_CLEARANCE_KM,
      maxX: Math.max(...xs) + LAND_CLEARANCE_KM,
      minY: Math.min(...ys) - LAND_CLEARANCE_KM,
      maxY: Math.max(...ys) + LAND_CLEARANCE_KM,
    };
  });
  const insideAnyLandBbox = (pt) =>
    landBboxes.some(
      (b) => pt[0] >= b.minX && pt[0] <= b.maxX && pt[1] >= b.minY && pt[1] <= b.maxY,
    );

  // The nudge below also has to dodge sea-lanes drawn on this same sheet
  // (below) — a first pass that only checked land pushed Galereach's label
  // straight onto "a foreign coastal lane"'s own dashed line and text.
  // Light endpoint resolution, independent of the sea-lane drawing loop's
  // own resolveLaneEnd (that one runs later and also draws); this one only
  // needs coordinates for a distance check.
  const resolveLaneEndpoint = (ref) => {
    if (ref?.node) {
      const node = tree.byId.get(ref.node);
      return node
        ? resolveToRoot({ tree, id: node.parentId, point: node.placement.anchor })
        : null;
    }
    if (ref?.feature) {
      for (const n of tree.byId.values())
        for (const f of n.features ?? []) if (f.id === ref.feature) return f.at ?? null;
    }
    return null;
  };
  const laneSegments = (spine.edges ?? [])
    .filter((e) => e.kind === "sealane")
    .map((lane) => [resolveLaneEndpoint(lane.from), resolveLaneEndpoint(lane.to)])
    .filter(([a, b]) => a && b);
  const distToSegment = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const LANE_CLEARANCE_KM = 60;
  const nearAnySeaLane = (pt) =>
    laneSegments.some(([a, b]) => distToSegment(pt, a, b) < LANE_CLEARANCE_KM);

  const blocked = (pt) => insideAnyLandBbox(pt) || nearAnySeaLane(pt);
  // Deterministic nudge: step the point along y, away from the offending
  // land box's own vertical center (toward more open water in a strip-
  // shaped sea), in fixed 40km increments, until clear of every land bbox
  // AND every sea-lane. Bounded at 10 steps (400km) — comfortably more than
  // this 2000km frame needs.
  const nudgeClearOfLand = (pt) => {
    if (!blocked(pt)) return pt;
    const hit = landBboxes.find(
      (b) => pt[0] >= b.minX && pt[0] <= b.maxX && pt[1] >= b.minY && pt[1] <= b.maxY,
    );
    const dir = !hit || pt[1] <= (hit.minY + hit.maxY) / 2 ? -1 : 1;
    for (let step = 1; step <= 10; step++) {
      const candidate = [pt[0], pt[1] + dir * 40 * step];
      if (!blocked(candidate)) return candidate;
    }
    return pt; // exhausted the bound — leave as-is rather than loop forever
  };

  // self-check: label traceability — every tier-1/2 node this sheet draws
  // must carry a real title (the string a lineLabel draws from).
  for (const n of [
    ...worldLand,
    ...worldOceans,
    ...worldLand.flatMap((land) => (tree.childrenOf.get(land.id) ?? []).map((id) => tree.byId.get(id))),
  ])
    if (typeof n.title !== "string" || n.title.trim() === "")
      problems.push(`${n.id}: missing title — nothing to letter on the sheet`);

  // ---- sheet geometry -------------------------------------------------------
  const MAP_W = EXT_W * ATLAS_PX_PER_KM;
  const MAP_H = EXT_H * ATLAS_PX_PER_KM;
  const SHEET_W = Math.round(ATLAS_MAP_LEFT + MAP_W + SHEET_PAD);
  const SHEET_H = Math.round(ATLAS_MAP_TOP + MAP_H + SHEET_PAD);

  const { X, Y, poly, smooth, lineLabel } = createDraft({
    pxPerKm: ATLAS_PX_PER_KM,
    mapLeft: ATLAS_MAP_LEFT,
    mapTop: ATLAS_MAP_TOP,
  });

  const o = [];
  const put = (s) => o.push(s);

  put(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${SHEET_H}" viewBox="0 0 ${SHEET_W} ${SHEET_H}" role="img" aria-label="${esc(sheet.title)} — ${esc(sheet.subtitle)}">`,
  );
  put(`<title>${esc(sheet.title)} — ${esc(sheet.subtitle)}</title>`);
  put(
    `<desc>Authored vector map drawn from content/spine/ (nodes + sheet-atlas.json) by tools/mapforge/render-sheet.mjs. Not a generated image.</desc>`,
  );

  put("<defs>");
  put(patternDefs({ includeReported: true }));
  // nothing may spill past the sheet's own border
  put(
    `<clipPath id="clip-sheet"><rect x="${ATLAS_MAP_LEFT}" y="${ATLAS_MAP_TOP}" width="${r2(MAP_W)}" height="${r2(MAP_H)}"/></clipPath>`,
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
    `<rect x="${ATLAS_MAP_LEFT}" y="${ATLAS_MAP_TOP}" width="${r2(MAP_W)}" height="${r2(MAP_H)}" fill="${C.parchmentDeep}"/>`,
  );

  // the basin miniature lives inside the sheet border
  put(`<g clip-path="url(#clip-sheet)">`);

  // ---- the western sea strip (n-westsea) + sea west of the coast ------------
  put(`<path d="${poly(westsea.placement.points)} Z" fill="${C.sea}"/>`);
  if (coast) {
    const cp = coast.points;
    const first = cp[0];
    const last = cp[cp.length - 1];
    // close the sea fill along the frame's west edge (x = 0)
    put(
      `<path d="${smooth(cp)} L${X(0)},${Y(last[1])} L${X(0)},${Y(first[1])} Z" fill="${C.sea}"/>`,
    );
    put(
      `<path d="${smooth(cp)}" fill="none" stroke="${C.ink}" stroke-width="0.9"/>`,
    );
  }

  // ---- the continent outline (n-cluster1 placement polygon) -----------------
  put(
    `<path d="${smooth(cluster.placement.points, true, ZONE_TENSION)}" fill="none" stroke="${C.ink}" stroke-width="1"/>`,
  );

  // ---- the Meltwash, one 1 px smoothed line ----------------------------------
  if (river)
    put(
      `<path d="${smooth(river.points)}" fill="none" stroke="${C.ink}" stroke-width="1" stroke-linecap="round"/>`,
    );

  // ---- town dots — no per-town labels at this scale --------------------------
  for (const d of townDots)
    put(
      `<circle class="town-dot" cx="${X(d.at[0])}" cy="${Y(d.at[1])}" r="1.6" fill="${C.ink}"/>`,
    );

  // ---- the basin label, right of the miniature -------------------------------
  // placed just east of the polygon's extent, level with its anchor
  const clusterMaxX = Math.max(...cluster.placement.points.map((p) => p[0]));
  put(
    `<text class="lbl" x="${X(clusterMaxX + 15)}" y="${Y(cluster.placement.anchor[1])}" font-size="12.5" font-style="italic" ` +
      `letter-spacing="1.2" fill="${C.inkMid}">${esc(sheet.surveyNote)}</text>`,
  );

  // ---- F-043: the wider world — surveyed-vs-reported mariners'-chart -------
  // grammar. Everything below traces to a spine node/feature; no invented
  // geography. Drawn INSIDE the sheet clip, after the basin block, which
  // stays byte-for-byte untouched above this line.
  //
  // Fix (post-review): world content is spread across the whole 2000x2000 km
  // frame, so no fixed position for the chrome block (title/subtitle/hand
  // text, below) can dodge every promoted landmass/lane, and the chrome's
  // opaque halo was painting OVER world labels drawn earlier in document
  // order — three ocean names and two Coldreach labels were being fully
  // erased on the rendered chart (0/3 ocean names visible). Every LABEL
  // (not fill/stroke geometry — that stays put() in place, painting order
  // among opaque hatches doesn't matter) is buffered via putLabel() and
  // flushed after the chrome block, so labels always paint on top of it
  // regardless of where either one falls on the sheet.
  const labelBuf = [];
  const putLabel = (s) => labelBuf.push(s);
  for (const land of worldLand) {
    checkFrame(`${land.id} polygon`, land.placement.points);
    const isIce = land.terrainKind === "ice";
    put(
      `<path d="${smooth(land.placement.points, true, ZONE_TENSION)}" ` +
        `fill="url(#${isIce ? "pIce" : "pReported"})" stroke="${C.ink}" stroke-width="${isIce ? 0.7 : 0.55}"` +
        `${isIce ? "" : ' class="coast-reported"'}/>`,
    );
    // ---- F-043 fix (controller visual pass): the majors (Coldreach,
    // Stonemoor) each carry a title + 2 regions + 2 line features + 1 port,
    // all anchored within one ~200x190 km landmass — close enough at this
    // map scale that their labels cut through each other ("Netstead"/"the
    // Stonemoor Shore", "the Stonemoor Spine"/"the Sto[nemoor Shore]").
    // Collect every one of this continent's labels (title included — it
    // collided too, e.g. "COLDREACH" under "the Coldreach Shore") instead of
    // painting them immediately, then run a greedy vertical label-stack pass
    // before flushing them: sort by actual anchor y (not id — id order is
    // unrelated to geography and, tried first, an alternating id-sorted
    // stagger accidentally CANCELLED Netstead/"the Stonemoor Spine"'s own
    // ~23px natural separation instead of widening it), then walk top to
    // bottom enforcing a minimum gap, pushing a label down only as far as it
    // takes to clear the one above it. Monotonic by construction — it can
    // only increase separation between any two labels, never flip or shrink
    // it. Singleton continents (Brightfall/Driftholt/Reedstrand, one reef
    // label + title) are 2 items that are already far enough apart, so no
    // push happens — a no-op, same as before.
    const clusterLabels = [
      {
        id: land.id,
        text: land.title.toUpperCase(),
        at: land.placement.anchor,
        angleDeg: 0,
        opts: { size: 13, tracking: 2 },
      },
    ];

    // tier-2 regions of this continent, dashed administrative boundaries
    const regionIds = (tree.childrenOf.get(land.id) ?? []).filter(
      (id) => tree.byId.get(id)?.tier === "region",
    );
    for (const rid of regionIds) {
      const region = tree.byId.get(rid);
      checkFrame(`${region.id} polygon`, region.placement.points);
      put(
        `<path d="${smooth(region.placement.points, true)}" fill="none" stroke="${C.ink}" ` +
          `stroke-width="0.4" stroke-dasharray="3 3" class="region-bound"/>`,
      );
      clusterLabels.push({
        id: region.id,
        text: region.title,
        at: region.placement.anchor,
        angleDeg: 0,
        opts: { size: 9.5, fill: C.inkSoft },
      });
    }

    // features on the continent itself (reef/ridge/river-mouth lines, port
    // and outlying-isle points) — regions carry none in this corpus, but the
    // loop reads `.features ?? []` so a future authored region draws too.
    for (const node of [land, ...regionIds.map((id) => tree.byId.get(id))]) {
      for (const f of node.features ?? []) {
        if (f.kind === "line") {
          checkFrame(`${f.id} line`, f.points);
          const isReef = f.id.includes("reef");
          put(
            `<path d="${smooth(f.points)}" fill="none" stroke="${C.ink}" stroke-width="0.7"` +
              `${isReef ? ' stroke-dasharray="1 3"' : ""}/>`,
          );
          if (f.attrs?.name) {
            const mid = alongKm(f.points, polylineKm(f.points) / 2);
            clusterLabels.push({
              id: f.id,
              text: f.attrs.name,
              at: mid.at,
              angleDeg: mid.angle,
              opts: { size: 10.5, italic: true, fill: C.inkMid },
            });
          } else {
            problems.push(`${f.id}: line feature has no attrs.name for its label`);
          }
        } else if (f.kind === "point") {
          checkFrame(`${f.id} point`, [f.at]);
          const isPort = f.attrs?.role === "port";
          put(`<circle cx="${X(f.at[0])}" cy="${Y(f.at[1])}" r="${isPort ? 2 : 1.1}" fill="${C.ink}"/>`);
          if (isPort) {
            if (!f.attrs?.name) problems.push(`${f.id}: port feature has no attrs.name`);
            else
              clusterLabels.push({
                id: f.id,
                text: f.attrs.name,
                at: f.at,
                angleDeg: 0,
                opts: { size: 10, italic: true, fill: C.inkMid },
              });
          }
          // outlying-isle points carry attrs.name: null by design — an
          // unnamed circle, no label attempted (F-043 spec).
        }
      }
    }

    clusterLabels.sort((a, b) => (a.at[1] - b.at[1] || (a.id < b.id ? -1 : 1)));
    const MIN_GAP_KM = 16 / ATLAS_PX_PER_KM; // ~16px baseline-to-baseline at map scale
    let lastY = -Infinity;
    for (const l of clusterLabels) {
      const y = Math.max(l.at[1], lastY + MIN_GAP_KM);
      lastY = y;
      putLabel(lineLabel(l.text, [l.at[0], y], l.angleDeg, l.opts));
    }
  }

  // ocean names, lettered along a gentle arc through each sea's centroid —
  // no polygon fill is drawn for oceans on this sheet (bare parchment IS
  // the sea here; only the basin block fills real water).
  //
  // Fix (post-review, visual QA): rsvg-convert — the ONLY rasterizer this
  // repo uses (tools/mapforge/lib/raster.mjs explicitly forbids the
  // ImageMagick fallback) — does not render <textPath> text at all. Verified
  // directly: a minimal <path>+<textPath>HELLO</textPath> test SVG rasterized
  // with the curve visible and the text completely absent. curveLabel's
  // <textPath> output renders correctly in a real SVG viewer (Chrome) but is
  // silently dropped in the shipped PNG asset regardless of document order —
  // no z-order fix can paint text a renderer can't draw at all. A follow-up
  // review found the fix had been applied by ADDING a straight lineLabel
  // alongside the curveLabel rather than replacing it, so every sea name
  // painted twice in any textPath-capable viewer (browsers). Straight
  // rotated labels are the deliberate, SOLE rendering here — spec §5's
  // "curved water labels" resolved to the plan's Risk 4 fallback, not the
  // curved treatment (F-043).
  for (const ocean of worldOceans) {
    // clear-of-land nudge (F-043 fix, controller visual pass): a sea's bay
    // can indent far enough that its vertex-average centroid lands close to
    // the coast — Galereach's did, next to Coldreach — so nudge off any
    // nearby land before drawing, rather than trusting the raw centroid.
    const c = nudgeClearOfLand(centroid(ocean.placement.points));
    const arcPts = [
      [c[0] - 180, c[1] + 25],
      [c[0], c[1]],
      [c[0] + 180, c[1] - 25],
    ];
    checkFrame(`${ocean.id} label arc`, arcPts);
    const angle = r2(
      (Math.atan2(arcPts[2][1] - arcPts[0][1], arcPts[2][0] - arcPts[0][0]) * 180) / Math.PI,
    );
    putLabel(lineLabel(ocean.title, c, angle, { size: 15, tracking: 4, italic: true, fill: C.inkSoft }));
  }

  put("</g>"); // end sheet clip

  // ---- F-043: every sea-lane, curved and lettered with its season -----------
  // Replaces the single leaving-the-sheet arrow above: this sheet draws ALL
  // charted lanes, skipping only the one whose far end is declared offSheet
  // (e-sea-lane, f-trade-wind-far) — that legacy arrow stays the basin
  // sheet's business (basin-sheet.mjs is untouched by F-043).
  const findFeatureGlobal = (id) => {
    for (const n of tree.byId.values())
      for (const f of n.features ?? []) if (f.id === id) return f;
    return null;
  };
  const resolveLaneEnd = (ref) => {
    if (ref?.node) {
      const node = tree.byId.get(ref.node);
      if (!node) return { at: null, feature: null };
      return {
        at: resolveToRoot({ tree, id: node.parentId, point: node.placement.anchor }),
        feature: null,
      };
    }
    if (ref?.feature) {
      const f = findFeatureGlobal(ref.feature);
      return { at: f ? f.at : null, feature: f };
    }
    return { at: null, feature: null };
  };
  for (const lane of (spine.edges ?? []).filter((e) => e.kind === "sealane")) {
    const toEnd = resolveLaneEnd(lane.to);
    if (toEnd.feature?.offSheet) continue; // the legacy basin arrow
    const fromEnd = resolveLaneEnd(lane.from);
    if (!fromEnd.at || !toEnd.at) {
      problems.push(`sealane ${lane.id}: could not resolve its endpoints`);
      continue;
    }
    if (!lane.attrs?.label) problems.push(`sealane ${lane.id}: attrs.label missing`);
    // the "to" end must ALWAYS resolve to a named port feature (not just
    // when one happens to be present) — a {node}-style "to" ref would
    // otherwise skip this check entirely instead of failing it.
    if (!toEnd.feature || toEnd.feature.attrs?.role !== "port" || !toEnd.feature.attrs?.name)
      problems.push(
        `sealane ${lane.id}: "to" does not resolve to a named port feature` +
          (toEnd.feature ? ` (got "${toEnd.feature.id}")` : ""),
      );
    checkFrame(`sealane ${lane.id} tail`, [fromEnd.at]);
    checkFrame(`sealane ${lane.id} head`, [toEnd.at]);

    // quadratic arc: control point offset 6% of the lane's length, sideways
    const dx = toEnd.at[0] - fromEnd.at[0];
    const dy = toEnd.at[1] - fromEnd.at[1];
    const len = Math.hypot(dx, dy) || 1;
    const off = len * 0.06;
    const ctrl = [
      (fromEnd.at[0] + toEnd.at[0]) / 2 - (dy / len) * off,
      (fromEnd.at[1] + toEnd.at[1]) / 2 + (dx / len) * off,
    ];
    const tail = [X(fromEnd.at[0]), Y(fromEnd.at[1])];
    const tip = [X(toEnd.at[0]), Y(toEnd.at[1])];
    const ctrlPx = [X(ctrl[0]), Y(ctrl[1])];
    put(
      `<path d="M${tail[0]},${tail[1]} Q${ctrlPx[0]},${ctrlPx[1]} ${tip[0]},${tip[1]}" ` +
        `fill="none" stroke="${C.ink}" stroke-width="0.8" stroke-dasharray="6 5" class="sea-lane"/>`,
    );
    const ang = r2((Math.atan2(tip[1] - ctrlPx[1], tip[0] - ctrlPx[0]) * 180) / Math.PI);
    put(
      `<path d="M${tip[0]},${tip[1]} l7,-3 l0,6 Z" fill="${C.ink}" transform="rotate(${ang + 180} ${tip[0]} ${tip[1]})"/>`,
    );
    if (lane.attrs?.label)
      putLabel(lineLabel(lane.attrs.label, ctrl, r2((Math.atan2(dy, dx) * 180) / Math.PI), { size: 10.5, italic: true, fill: C.inkMid }));
  }

  // ---- chrome from the sheet record: title, subtitle, hand, withheld --------
  // F-043 fix (controller visual pass): the original centred position (CX,
  // py=520 — F-042's placement for an EMPTY frame) now sits directly on top
  // of Coldreach, the primary continent (anchor ~[994,741] km, ~px
  // [754,615]) — the hand-paragraph interleaved with Tallowquay/Coldreach's
  // own labels and buried the continent. Moved the whole block into the
  // open west-central Keelbreak water instead — verified empty against the
  // built SVG: no land polygon, region, feature, port, sea-lane, or basin
  // element falls in x∈[220,620]px / y∈[900,1400]px (nearest neighbours are
  // Driftholt's polygon, starting x=729px, and the sea-lane's own label,
  // which passes well north of y=900 on its way to Tallowquay). Kept the
  // parchment halo (class="zn") — world LABELS are still buffered (putLabel,
  // above) and flushed below, AFTER this block, so they always paint on top
  // of the chrome regardless of where either falls on the sheet.
  const CHROME_CX = 420;
  let py = 950;
  put(
    `<text class="zn" x="${r2(CHROME_CX)}" y="${py}" text-anchor="middle" font-size="42" letter-spacing="10">${esc(sheet.title)}</text>`,
  );
  py += 40;
  put(
    `<text class="zn" x="${r2(CHROME_CX)}" y="${py}" text-anchor="middle" font-size="17" font-style="italic" ` +
      `fill="${C.inkMid}">${esc(sheet.subtitle)}</text>`,
  );
  py += 52;
  for (const ln of wrap(sheet.hand, 76)) {
    put(
      `<text class="zn" x="${r2(CHROME_CX)}" y="${py}" text-anchor="middle" font-size="13" font-style="italic" ` +
        `fill="${C.inkMid}">${esc(ln)}</text>`,
    );
    py += 19;
  }
  py += 30;
  put(
    `<text class="zn" x="${r2(CHROME_CX)}" y="${py}" text-anchor="middle" font-size="13" letter-spacing="4" ` +
      `fill="${C.inkMid}">NOT SHOWN ON THIS SHEET</text>`,
  );
  py += 22;
  for (const w of sheet.withheld) {
    put(
      `<text class="zn" x="${r2(CHROME_CX)}" y="${py}" text-anchor="middle" font-size="12.5" ` +
        `fill="${C.inkMid}">·  ${esc(w)}</text>`,
    );
    py += 18;
  }

  // ---- F-043: flush every buffered world label — AFTER the chrome block, --
  // so continent/region/feature/port/ocean/sea-lane labels always paint on
  // top of it (fixes the erased-label defect above).
  for (const l of labelBuf) put(l);

  // ---- the north mark ---------------------------------------------------------
  {
    const n = sheet.northMark;
    const px = X(n.at[0]);
    const npy = Y(n.at[1]);
    put(
      `<g stroke="${C.ink}" stroke-width="1.6" fill="none">` +
        `<path d="M${px},${r2(npy + 22)} L${px},${r2(npy - 20)}"/>` +
        `<path d="M${r2(px - 5)},${r2(npy - 12)} L${px},${r2(npy - 22)} L${r2(px + 5)},${r2(npy - 12)} Z" fill="${C.ink}"/>` +
        `</g>`,
    );
    put(
      `<text x="${px}" y="${r2(npy + 38)}" text-anchor="middle" font-size="15" letter-spacing="2" fill="${C.ink}">${esc(n.label)}</text>`,
    );
  }

  // ---- the frame border --------------------------------------------------------
  put(
    `<rect x="${ATLAS_MAP_LEFT}" y="${ATLAS_MAP_TOP}" width="${r2(MAP_W)}" height="${r2(MAP_H)}" ` +
      `fill="none" stroke="${C.ink}" stroke-width="1.6"/>`,
  );

  put("</svg>");
  const svg = o.join("\n") + "\n";
  return { svg, notes, problems };
}

export function buildAtlasSheet({ repoRoot }) {
  const spine = loadSpine({ contentRoot: join(repoRoot, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const sheet = JSON.parse(
    readFileSync(join(repoRoot, "content/spine/sheet-atlas.json"), "utf8"),
  );
  return drawAtlasSheet({ spine, tree, sheet });
}
