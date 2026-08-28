// tools/mapforge/lib/overlay-sheet.mjs — before/after.
//
// The BASELINE (the trunk polygons as they stand) ghosted under the generated
// coastline at full ink, plus a per-continent area-delta table. It is the
// sheet a reviewer reads to answer "what does the redraw actually change", and
// it is the one artifact in Plan C that shows both worlds at once.
//
// WHERE THE BASELINE COMES FROM, in order:
//   1. an explicit `baselineDir`;
//   2. `<repoRoot>/baseline/spine/nodes` — the copy `writeRun` takes at run
//      start, which is what makes this sheet correct inside a DRAFT root,
//      where `content/spine/nodes` is already the GENERATED trunk and a
//      generated-over-generated overlay would show nothing at all;
//   3. `<repoRoot>/content/spine/nodes`, for a render against the real tree.
// NEVER from git: `git show` fails in a dirty worktree and in a container with
// no repository (STATE §16 records two committed tests that fail for exactly
// that reason), and spec §7.4 says the draft folder carries its own baseline
// so the review works offline. `fabric-sheet.test.mjs` asserts the absence of
// any subprocess call from the source, so this stays true by measurement.
//
// DETERMINISM: reads, string joins, one fixed-point quantiser and one
// shoelace. No transcendental, no clock — tools/mapforge/lib/ is inventoried
// by the determinism scan and this file's inventory must stay empty. `abs()`
// appears nowhere in the geometry (house rule 1): a negative shoelace is a
// winding failure, not a magnitude, so the area sum below is signed and the
// sign is checked rather than erased.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { C } from "./draft.mjs";
import { loadFabricDir } from "./fabric-sheet.mjs";

const W = 400, H = 400, PX = 2.5;
const px = (v) => (v * PX).toFixed(1);
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
const path = (pts) => pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${px(x)},${px(y)}`).join(" ") + " Z";

/** Signed shoelace, in km². Positive is the drawing convention's winding. */
export function shoelace(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** The baseline directory this sheet will read, in the documented order. */
export function baselineDirFor({ repoRoot, baselineDir = null }) {
  if (baselineDir) return baselineDir;
  const draft = join(repoRoot, "baseline/spine/nodes");
  if (existsSync(draft)) return draft;
  return join(repoRoot, "content/spine/nodes");
}

export function buildOverlaySheet({ repoRoot, baselineDir = null }) {
  const problems = [], notes = [];
  const baseDir = baselineDirFor({ repoRoot, baselineDir });
  if (!existsSync(baseDir)) {
    problems.push(`overlay-sheet: baseline dir ${baseDir} does not exist`);
    return { svg: "", notes, problems };
  }

  const baseline = [];
  for (const f of readdirSync(baseDir).filter((x) => x.endsWith(".json")).sort()) {
    let n = null;
    try { n = JSON.parse(readFileSync(join(baseDir, f), "utf8")); }
    catch (e) { problems.push(`overlay-sheet: ${f} is not readable JSON: ${e.message}`); continue; }
    if (n.tier === "continent" && n.placement?.shape === "polygon" && Array.isArray(n.placement.points))
      baseline.push(n);
  }

  const { world, fabric, problems: fp } = loadFabricDir({ repoRoot });
  problems.push(...fp);
  if (fabric.length === 0) problems.push("overlay-sheet: no continent fabric files found");
  if (problems.length) return { svg: "", notes, problems };

  const body = [`<rect x="0" y="0" width="${px(W)}" height="${px(H)}" fill="${C.parchment}"/>`];
  for (const n of baseline)
    body.push(`<path d="${path(n.placement.points)}" fill="${C.ink}" fill-opacity="0.2" stroke="none"/>`);
  for (const f of fabric) {
    if (Array.isArray(f.outerRing) && f.outerRing.length >= 3)
      body.push(`<path d="${path(f.outerRing)}" fill="none" stroke="${C.ink}" stroke-width="1.2"/>`);
    for (const r of f.regions ?? [])
      for (const ring of Array.isArray(r.rings) ? r.rings : [])
        if (ring.length >= 3)
          body.push(`<path d="${path(ring)}" fill="none" stroke="${C.inkSoft}" stroke-width="0.35"/>`);
  }

  // ── the per-continent area-delta table ───────────────────────────────────
  //
  // GROSS land on both sides, because a trunk polygon is a coast contour and
  // encloses the continent's interior lakes — the same join G-TRUNK-AREA
  // makes, and scoring the polygon against NET land is the plan defect STATE
  // §5 records (c02 +9.54%, c06 +5.22% on a correct world).
  let baseTotal = 0;
  const wound = [];
  for (const n of baseline) {
    const a = shoelace(n.placement.points);
    if (a < 0) wound.push(n.id);
    baseTotal += a;
  }
  if (wound.length)
    problems.push(`overlay-sheet: negatively wound baseline placement(s): ${wound.join(", ")} — ` +
                  `a negative shoelace is a G-POLY winding failure, not a magnitude`);
  // The per-row delta needs BOTH sides, and a continent's baseline polygon is
  // found through content/world/manifest.json's `landmasses[].nodeId` — the
  // same column buildTrunk takes every generated node id from, and the reason
  // c02 Wealdmarch is still `n-cluster1`. Without the join the table is a list
  // of generated areas under a heading that promises a comparison.
  const byNode = new Map(baseline.map((n) => [n.id, shoelace(n.placement.points)]));
  let manifest = null;
  const manPath = join(repoRoot, "content/world/manifest.json");
  if (existsSync(manPath)) {
    try { manifest = JSON.parse(readFileSync(manPath, "utf8")); }
    catch (e) { problems.push(`overlay-sheet: content/world/manifest.json is not readable JSON: ${e.message}`); }
  } else problems.push(`overlay-sheet: ${manPath} does not exist — the per-continent baseline join needs it`);
  const nodeOf = new Map((manifest?.landmasses ?? []).map((l) => [l.id, l.nodeId]));
  const baseAreaOf = (cid) => {
    const nodeId = nodeOf.get(cid);
    if (nodeId === undefined) return null;
    return byNode.has(nodeId) ? byNode.get(nodeId) : null;
  };
  const cell = (f) => (typeof f.cellKm === "number" ? f.cellKm : 0.5);
  const rows = fabric.map((f) => {
    const c = f.cellCensus ?? {};
    const gross = ((c.land ?? 0) + (c.lake ?? 0) + (c.unowned ?? 0)) * cell(f) * cell(f);
    return { id: f.continent, km2: gross };
  });
  const newTotal = rows.reduce((s, r) => s + r.km2, 0);

  // The table is drawn LAST, on its own opaque panel: it sits over the sheet,
  // and a table you cannot read over a coastline is not a review artifact.
  const tx = 22, ty0 = 34, dy = 14, panelW = 330;
  const lines = [];
  for (const r of rows) {
    const b = baseAreaOf(r.id);
    lines.push(b === null
      ? `${r.id}  —  ->  ${r.km2.toFixed(1)} km²   NEW`
      : `${r.id}  ${b.toFixed(1)}  ->  ${r.km2.toFixed(1)} km²   x${(b === 0 ? 0 : r.km2 / b).toFixed(2)}`);
  }
  const ratio = baseTotal === 0 ? "n/a" : `x${(newTotal / baseTotal).toFixed(2)}`;
  lines.push(`TOTAL ${baseTotal.toFixed(1)}  ->  ${newTotal.toFixed(1)} km²   ${ratio}`);
  lines.push(`sea:land ${world ? world.seaToLandRatio : "?"} : 1 generated`);
  // Past tense since the redraw landed (bc393a4): this sheet's BASELINE is
  // the redrawn trunk, so the row above is a drift check between the trunk and
  // its own fabric, not a before/after of two worlds.
  lines.push(`baseline = the redrawn trunk; this row is trunk-vs-fabric drift`);
  const panelH = ty0 + (lines.length + 1) * dy;
  body.push(`<rect x="${tx - 10}" y="14" width="${panelW}" height="${panelH - 6}" fill="${C.parchment}" ` +
            `stroke="${C.ink}" stroke-width="0.8"/>`);
  body.push(`<text x="${tx}" y="${ty0}" font-family="Georgia, serif" font-size="14" fill="${C.ink}">` +
            `Area delta — baseline vs generated (gross land)</text>`);
  lines.forEach((l, i) => {
    body.push(`<text x="${tx}" y="${ty0 + (i + 1) * dy}" font-family="monospace" font-size="10" fill="${C.ink}">` +
              `${esc(l)}</text>`);
  });

  notes.push(`overlay-sheet: baseline ${baseline.length} continent polygons, generated ${fabric.length}`);
  notes.push(`overlay-sheet: gross land ${baseTotal.toFixed(1)} -> ${newTotal.toFixed(1)} km² (${ratio})`);
  notes.push(`overlay-sheet: baseline read from ${baseDir.endsWith("baseline/spine/nodes") ? "the draft folder's baseline/" : "content/spine/nodes"}`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px(W)}" height="${px(H)}" ` +
    `viewBox="0 0 ${px(W)} ${px(H)}">\n${body.join("\n")}\n</svg>\n`;
  return { svg, notes, problems };
}
