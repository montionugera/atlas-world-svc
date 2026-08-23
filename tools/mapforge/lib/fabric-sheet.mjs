// tools/mapforge/lib/fabric-sheet.mjs — the generated world, drawn from the
// COMMITTED fabric alone.
//
// Deliberately minimal ink: sea, land, region outlines, coastlines, trunk
// rivers, roads, settlement dots, continent labels. No biome patterns, no
// glyphs, no label declutter — those are Plan B's phase-3 capability and this
// sheet must not block on them. Plan E enriches it.
//
// It reads content/world/fabric/ and NOT the spine, on purpose: the whole
// value of this sheet is that a reviewer can see what the fabric says while
// the trunk still says something else. `fabric-sheet.test.mjs` asserts that
// from the source, so the property cannot rot into a spine read.
//
// It takes a repoRoot and reads `<repoRoot>/content/world/fabric/`, which is
// what lets `writeRun` build it against the DRAFT root (`repoRoot: outDir`)
// and render-sheet.mjs build it against the real one, with no flag.
//
// DETERMINISM: no transcendental, no clock, no randomness — the whole file is
// reads, string joins and one fixed-point quantiser, which is why the render
// lock can hash it. tools/mapforge/lib/ is INVENTORIED by the determinism scan
// and this file's inventory must stay empty.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { C } from "./draft.mjs";

const W = 400, H = 400, PX = 2.5;                    // 1000 x 1000 px sheet
const px = (v) => (v * PX).toFixed(1);
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
const path = (pts) => pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${px(x)},${px(y)}`).join(" ") + " Z";
const poly = (pts) => pts.map(([x, y]) => `${px(x)},${px(y)}`).join(" ");

/** Read `<repoRoot>/content/world/fabric/`. Answers in-band, never throws. */
export function loadFabricDir({ repoRoot }) {
  const dir = join(repoRoot, "content/world/fabric");
  const problems = [];
  if (!existsSync(dir)) return { world: null, fabric: [], problems: [`fabric-sheet: ${dir} does not exist`] };
  let world = null;
  const fabric = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    let doc = null;
    try { doc = JSON.parse(readFileSync(join(dir, f), "utf8")); }
    catch (e) { problems.push(`fabric-sheet: ${f} is not readable JSON: ${e.message}`); continue; }
    if (f === "world.json") world = doc; else fabric.push(doc);
  }
  return { world, fabric, problems };
}

export function buildFabricSheet({ repoRoot }) {
  const notes = [];
  const { world, fabric, problems } = loadFabricDir({ repoRoot });
  if (!world) problems.push("fabric-sheet: content/world/fabric/world.json is missing");
  if (fabric.length === 0) problems.push("fabric-sheet: no continent fabric files found");
  if (problems.length) return { svg: "", notes, problems };

  const body = [`<rect x="0" y="0" width="${px(W)}" height="${px(H)}" fill="${C.sea}"/>`];

  let regions = 0, settlements = 0, surveyed = 0;
  for (const f of fabric) {
    // The COAST first, as one filled shape per landmass with its interior
    // water knocked out, so the region outlines above it read as divisions of
    // land rather than as free-floating polygons. `outerRing` is the traced
    // coastline — 2,413 vertices over the thirteen — and NOT the trunk
    // node's `placement.points`, which the vertex cap tightens to as few as
    // 16 (STATE §17). Drawing the placement here would put c06 Reedstrand on
    // the sheet as a hexagon.
    if (Array.isArray(f.outerRing) && f.outerRing.length >= 3) {
      const holes = (f.outerHoles ?? []).filter((h) => Array.isArray(h) && h.length >= 3);
      body.push(`<path d="${[f.outerRing, ...holes].map(path).join(" ")}" fill-rule="evenodd" ` +
                `fill="${C.parchment}" stroke="${C.ink}" stroke-width="1.1"/>`);
    } else problems.push(`fabric-sheet: ${f.continent} has no outer ring`);

    for (const r of f.regions ?? []) {
      regions++;
      if (r.survey === "surveyed") surveyed++;
      const rings = Array.isArray(r.rings) ? r.rings : [];
      if (rings.length === 0) { problems.push(`fabric-sheet: region ${r.id} has no ring`); continue; }
      const holes = (r.holes ?? []).filter((h) => Array.isArray(h) && h.length >= 3);
      const d = [...rings.filter((g) => g.length >= 3), ...holes].map(path).join(" ");
      // Surveyed ground is inked and firmly outlined; reported ground is left
      // bare parchment under a faint line. That IS spec §6.4 rule 2's detail
      // gradient — the honest-frontier policy — drawn, and the difference has
      // to be VISIBLE at thumb scale or the comment is a claim the sheet does
      // not support: parchmentDeep against parchment alone is 4 levels of one
      // channel, which reads as nothing at 512 px, so the stroke carries it.
      const walked = r.survey === "surveyed";
      body.push(`<path d="${d}" fill-rule="evenodd" fill="${walked ? C.parchmentDeep : "none"}" ` +
                `stroke="${walked ? C.inkMid : C.inkSoft}" stroke-width="${walked ? "0.7" : "0.3"}"/>`);
    }

    if (Array.isArray(f.trunkRiver?.points) && f.trunkRiver.points.length > 1)
      body.push(`<polyline points="${poly(f.trunkRiver.points)}" fill="none" stroke="${C.inkMid}" stroke-width="1.1"/>`);

    for (const road of f.roads ?? [])
      body.push(`<polyline points="${poly(road.points)}" fill="none" stroke="${C.ink}" ` +
                `stroke-width="0.6" stroke-dasharray="3 2"/>`);

    for (const s of f.settlements ?? []) {
      settlements++;
      const r = s.rank === "capital" ? 4 : s.rank === "hub" ? 2.8 : 1.8;
      body.push(`<circle cx="${px(s.atKm[0])}" cy="${px(s.atKm[1])}" r="${r}" fill="${C.ink}"/>`);
    }
  }

  // The two sea lanes, over the water, so the three capitals read as a network.
  for (const lane of world.seaLanes ?? [])
    if (Array.isArray(lane.points) && lane.points.length > 1)
      body.push(`<polyline points="${poly(lane.points)}" fill="none" stroke="${C.accent}" ` +
                `stroke-width="0.8" stroke-dasharray="6 4"/>`);

  // One title per landmass, at the area-weighted centroid of its regions.
  // Titles are Plan D's; until then the continent id is the honest label, and
  // "c07" on the sheet beside an unnamed coast is exactly the state of the
  // world this sheet exists to show.
  for (const f of fabric) {
    let cx = 0, cy = 0, tot = 0;
    for (const r of f.regions ?? []) {
      if (!Array.isArray(r.centroidKm) || typeof r.areaKm2 !== "number") continue;
      cx += r.centroidKm[0] * r.areaKm2; cy += r.centroidKm[1] * r.areaKm2; tot += r.areaKm2;
    }
    if (tot <= 0) { problems.push(`fabric-sheet: ${f.continent} has no region centroid to label`); continue; }
    body.push(`<text x="${px(cx / tot)}" y="${px(cy / tot)}" text-anchor="middle" ` +
              `font-family="Georgia, serif" font-size="15" fill="${C.ink}">${esc(f.continent)}</text>`);
  }

  notes.push(`fabric-sheet: ${fabric.length} landmasses, ${regions} regions ` +
             `(${surveyed} surveyed), ${settlements} settlements`);
  notes.push(`fabric-sheet: sea/land ${world.seaToLandRatio} on ${world.areaKm2.netLand} km² of net land`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px(W)}" height="${px(H)}" ` +
    `viewBox="0 0 ${px(W)} ${px(H)}">\n${body.join("\n")}\n</svg>\n`;
  return { svg, notes, problems };
}
