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

  // ---- sheet geometry -------------------------------------------------------
  const MAP_W = EXT_W * ATLAS_PX_PER_KM;
  const MAP_H = EXT_H * ATLAS_PX_PER_KM;
  const SHEET_W = Math.round(ATLAS_MAP_LEFT + MAP_W + SHEET_PAD);
  const SHEET_H = Math.round(ATLAS_MAP_TOP + MAP_H + SHEET_PAD);
  const CX = ATLAS_MAP_LEFT + MAP_W / 2;

  const { X, Y, poly, smooth } = createDraft({
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

  put("</g>"); // end sheet clip

  // ---- the sea-lane, leaving the sheet ---------------------------------------
  // Same reading as the basin sheet: one arrow with the trade wind's season
  // written on it, and nothing else. It is meant to leave the sheet.
  if (laneFrom && laneFar) {
    const tail = [X(laneFrom[0]), Y(laneFrom[1])];
    const tip = [X(laneFar.at[0]), Y(laneFar.at[1])];
    put(
      `<path d="M${tail[0]},${tail[1]} L${tip[0]},${tip[1]}" stroke="${C.ink}" stroke-width="1.2"/>`,
    );
    const ang = r2(
      (Math.atan2(tip[1] - tail[1], tip[0] - tail[0]) * 180) / Math.PI,
    );
    put(
      `<path d="M${tip[0]},${tip[1]} l7,-3 l0,6 Z" fill="${C.ink}" transform="rotate(${ang + 180} ${tip[0]} ${tip[1]})"/>`,
    );
    const lx = r2(X(laneFar.at[0]) - 8);
    const ly = Y(laneFar.at[1]);
    put(
      `<text x="${lx}" y="${ly}" font-size="11.5" font-style="italic" fill="${C.inkMid}" ` +
        `text-anchor="middle" transform="rotate(-90 ${lx} ${ly})">${esc(seaLane.attrs.label)}</text>`,
    );
  }

  // ---- chrome from the sheet record: title, subtitle, hand, withheld --------
  let py = 520;
  put(
    `<text x="${r2(CX)}" y="${py}" text-anchor="middle" font-size="42" letter-spacing="10">${esc(sheet.title)}</text>`,
  );
  py += 40;
  put(
    `<text x="${r2(CX)}" y="${py}" text-anchor="middle" font-size="17" font-style="italic" ` +
      `fill="${C.inkMid}">${esc(sheet.subtitle)}</text>`,
  );
  py += 52;
  for (const ln of wrap(sheet.hand, 76)) {
    put(
      `<text x="${r2(CX)}" y="${py}" text-anchor="middle" font-size="13" font-style="italic" ` +
        `fill="${C.inkMid}">${esc(ln)}</text>`,
    );
    py += 19;
  }
  py += 30;
  put(
    `<text x="${r2(CX)}" y="${py}" text-anchor="middle" font-size="13" letter-spacing="4" ` +
      `fill="${C.inkMid}">NOT SHOWN ON THIS SHEET</text>`,
  );
  py += 22;
  for (const w of sheet.withheld) {
    put(
      `<text x="${r2(CX)}" y="${py}" text-anchor="middle" font-size="12.5" ` +
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
