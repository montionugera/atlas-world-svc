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
  curveLabel,
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

  // self-check: label traceability — every tier-1/2 node this sheet draws
  // must carry a real title (the string a lineLabel/curveLabel draws from).
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
  const CX = ATLAS_MAP_LEFT + MAP_W / 2;

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
  for (const land of worldLand) {
    checkFrame(`${land.id} polygon`, land.placement.points);
    const isIce = land.terrainKind === "ice";
    put(
      `<path d="${smooth(land.placement.points, true, ZONE_TENSION)}" ` +
        `fill="url(#${isIce ? "pIce" : "pReported"})" stroke="${C.ink}" stroke-width="${isIce ? 0.7 : 0.55}"` +
        `${isIce ? "" : ' class="coast-reported"'}/>`,
    );
    put(lineLabel(land.title.toUpperCase(), land.placement.anchor, 0, { size: 13, tracking: 2 }));

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
      put(lineLabel(region.title, region.placement.anchor, 0, { size: 9.5, fill: C.inkSoft }));
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
            put(lineLabel(f.attrs.name, mid.at, mid.angle, { size: 10.5, italic: true, fill: C.inkMid }));
          } else {
            problems.push(`${f.id}: line feature has no attrs.name for its label`);
          }
        } else if (f.kind === "point") {
          checkFrame(`${f.id} point`, [f.at]);
          const isPort = f.attrs?.role === "port";
          put(`<circle cx="${X(f.at[0])}" cy="${Y(f.at[1])}" r="${isPort ? 2 : 1.1}" fill="${C.ink}"/>`);
          if (isPort) {
            if (!f.attrs?.name) problems.push(`${f.id}: port feature has no attrs.name`);
            else put(lineLabel(f.attrs.name, f.at, 0, { size: 10, italic: true, fill: C.inkMid }));
          }
          // outlying-isle points carry attrs.name: null by design — an
          // unnamed circle, no label attempted (F-043 spec).
        }
      }
    }
  }

  // ocean names, lettered along a gentle arc through each sea's centroid —
  // no polygon fill is drawn for oceans on this sheet (bare parchment IS
  // the sea here; only the basin block fills real water).
  for (const ocean of worldOceans) {
    const c = centroid(ocean.placement.points);
    const arcPts = [
      [c[0] - 180, c[1] + 25],
      [c[0], c[1]],
      [c[0] + 180, c[1] - 25],
    ];
    checkFrame(`${ocean.id} label arc`, arcPts);
    const { defs, text } = curveLabel({
      id: `curve-${ocean.id}`,
      d: smooth(arcPts),
      text: ocean.title,
      size: 15,
      tracking: 4,
      fill: C.inkSoft,
    });
    put(defs);
    put(text);
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
      put(lineLabel(lane.attrs.label, ctrl, r2((Math.atan2(dy, dx) * 180) / Math.PI), { size: 10.5, italic: true, fill: C.inkMid }));
  }

  // ---- chrome from the sheet record: title, subtitle, hand, withheld --------
  // F-043: the world content now covers most of the sheet, so the chrome
  // block (centred here since before F-043) is guaranteed to sit over some
  // of it — no fixed position dodges every promoted landmass and lane. Give
  // it the same parchment halo (class="lbl") every other label on this
  // sheet already uses for exactly this — legible over a hatch or a line —
  // rather than chasing coordinates for a "clear" spot that may not exist
  // once more tier-1 content is promoted later.
  let py = 520;
  put(
    `<text class="zn" x="${r2(CX)}" y="${py}" text-anchor="middle" font-size="42" letter-spacing="10">${esc(sheet.title)}</text>`,
  );
  py += 40;
  put(
    `<text class="zn" x="${r2(CX)}" y="${py}" text-anchor="middle" font-size="17" font-style="italic" ` +
      `fill="${C.inkMid}">${esc(sheet.subtitle)}</text>`,
  );
  py += 52;
  for (const ln of wrap(sheet.hand, 76)) {
    put(
      `<text class="zn" x="${r2(CX)}" y="${py}" text-anchor="middle" font-size="13" font-style="italic" ` +
        `fill="${C.inkMid}">${esc(ln)}</text>`,
    );
    py += 19;
  }
  py += 30;
  put(
    `<text class="zn" x="${r2(CX)}" y="${py}" text-anchor="middle" font-size="13" letter-spacing="4" ` +
      `fill="${C.inkMid}">NOT SHOWN ON THIS SHEET</text>`,
  );
  py += 22;
  for (const w of sheet.withheld) {
    put(
      `<text class="zn" x="${r2(CX)}" y="${py}" text-anchor="middle" font-size="12.5" ` +
        `fill="${C.inkMid}">·  ${esc(w)}</text>`,
    );
    py += 18;
  }

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
