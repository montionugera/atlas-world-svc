import { repoUrl, esc } from "./maps-vocabulary.mjs";

/**
 * The fabric census panel (world-fill Plan C Task 13) — the Maps tab's table
 * of what the generated world layer actually holds.
 *
 * WHY IT EXISTS. Plan C's artifacts are 14 fabric files and 13 handle ledgers,
 * and two of them are drawn (the `fabric` and `overlay` sheets above this
 * panel). But a drawing shows shape, not census: nobody looking at the sheet
 * can see that c05/r06 is a surveyed region with nothing in it, or that c10
 * Ashen Spar carries no settlement at all, or that the sea-to-land ratio the
 * whole plan exists to move now reads 1.5 : 1. The standing rule (owner,
 * 2026-08-15) is that a produced artifact which cannot be VIEWED in a review
 * surface is not delivered, and for a data layer the view is the numbers.
 *
 * HOW IT FINDS THE FILES. A browser cannot list a directory, so the roster
 * comes from `world.json`'s own `continents[].fabric` column — the same column
 * `G-TRUNK-AREA` joins through. That is deliberate: the panel and the gate
 * read the world through the same key, so a continent missing from that list
 * is missing from both rather than from one.
 *
 * DEGRADATION. Every failure removes the PANEL, never the tab — the same
 * contract as loadIndex()/loadLock() in maps.mjs and mountVocabulary in
 * maps-vocabulary.mjs. A repo checkout served from the wrong document root, a
 * root with no fabric layer, or one unreadable file all end the same way: a
 * console warning and no panel.
 */

/** The one number per continent a reviewer is looking for. */
export function fabricCensusRows({ world, fabric }) {
  const rows = [];
  for (const f of fabric) {
    if (!f || typeof f !== "object") continue;
    const cell = typeof f.cellKm === "number" ? f.cellKm : 0.5;
    const c = f.cellCensus ?? {};
    const regions = Array.isArray(f.regions) ? f.regions : [];
    rows.push({
      id: String(f.continent ?? "?"),
      grossLandKm2: ((c.land ?? 0) + (c.lake ?? 0) + (c.unowned ?? 0)) * cell * cell,
      regions: regions.length,
      surveyed: regions.filter((r) => r && r.survey === "surveyed").length,
      settlements: Array.isArray(f.settlements) ? f.settlements.length : 0,
      instances: Array.isArray(f.instances) ? f.instances.length : 0,
      anchors: Array.isArray(f.dungeonAnchors) ? f.dungeonAnchors.length : 0,
    });
  }
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const total = rows.reduce((t, r) => ({
    id: "TOTAL",
    grossLandKm2: t.grossLandKm2 + r.grossLandKm2,
    regions: t.regions + r.regions,
    surveyed: t.surveyed + r.surveyed,
    settlements: t.settlements + r.settlements,
    instances: t.instances + r.instances,
    anchors: t.anchors + r.anchors,
  }), { id: "TOTAL", grossLandKm2: 0, regions: 0, surveyed: 0, settlements: 0, instances: 0, anchors: 0 });
  const headline = world && world.areaKm2
    ? `sea:land ${world.seaToLandRatio} : 1 on ${world.areaKm2.netLand} km² of net land ` +
      `(water ${world.areaKm2.water} km², frame ${world.areaKm2.total} km²)`
    : "sea:land — world.json carries no areaKm2";
  return { rows, total, headline };
}

/** Fetch world.json and every continent file it names. Never rejects. */
export async function loadFabric({ fetchImpl = fetch, baseUrl } = {}) {
  const url = (p) => repoUrl(p, baseUrl);
  const getJson = async (p) => {
    const res = await fetchImpl(url(p));
    if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
    return res.json();
  };
  try {
    const world = await getJson("content/world/fabric/world.json");
    const paths = (world.continents ?? [])
      .map((c) => c && c.fabric)
      .filter((p) => typeof p === "string");
    if (paths.length === 0) throw new Error("world.json names no continent fabric files");
    const fabric = await Promise.all(paths.map(getJson));
    return { world, fabric };
  } catch (err) {
    console.warn("[asset-storybook] content/world/fabric unavailable — census panel disabled:", err);
    return null;
  }
}

const COLS = [
  ["id", "continent"],
  ["grossLandKm2", "gross land km²"],
  ["regions", "regions"],
  ["surveyed", "surveyed"],
  ["settlements", "settlements"],
  ["instances", "landforms"],
  ["anchors", "dungeons"],
];

/** Pure: the panel's markup, so it can be driven without a DOM. */
export function fabricCensusHtml({ rows, total, headline }) {
  const cell = (r, key) =>
    key === "grossLandKm2" ? r[key].toFixed(1) : esc(r[key]);
  const tr = (r, cls) =>
    `<tr${cls ? ` class="${cls}"` : ""}>` +
    COLS.map(([k]) => `<td>${cell(r, k)}</td>`).join("") + "</tr>";
  return (
    `<h3>Fabric census</h3>` +
    `<p class="maps-fabric-headline">${esc(headline)}</p>` +
    `<table class="maps-fabric-table"><thead><tr>` +
    COLS.map(([, label]) => `<th>${esc(label)}</th>`).join("") +
    `</tr></thead><tbody>` +
    rows.map((r) => tr(r, "")).join("") +
    tr(total, "maps-fabric-total") +
    `</tbody></table>` +
    `<p class="maps-fabric-note">Read live from content/world/fabric/. Titles are Plan D's, so the ` +
    `continent ids stand in for names; the trunk under content/spine/ still describes the old world ` +
    `and is redrawn in Plan E.</p>`
  );
}

/** Mount the panel under `section`. Removes itself on any failure. */
export async function mountFabricCensus(section, opts = {}) {
  const loaded = await loadFabric(opts);
  if (!loaded) return null;
  const panel = document.createElement("div");
  panel.className = "maps-fabric";
  panel.innerHTML = fabricCensusHtml(fabricCensusRows(loaded));
  section.appendChild(panel);
  return panel;
}
