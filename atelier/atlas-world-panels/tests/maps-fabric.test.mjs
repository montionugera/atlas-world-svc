// atelier/atlas-world-panels/tests/maps-fabric.test.mjs — the fabric census panel.
//
// The panel is the review surface for a DATA artifact: 14 fabric files and 13
// handle ledgers that two sheets draw the SHAPE of and nothing shows the
// NUMBERS of. Everything here is the pure half — rows, totals, markup and the
// world.json-driven roster — driven against the committed fabric, so the panel
// cannot quietly stop agreeing with the files it claims to read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMounted } from "./_mounted.mjs";
import { fabricCensusRows, fabricCensusHtml, loadFabric } from "../js/maps-fabric.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const readJson = (p) => JSON.parse(readFileSync(join(REPO_ROOT, p), "utf8"));

const committed = () => {
  const world = readJson("content/world/fabric/world.json");
  return { world, fabric: world.continents.map((c) => readJson(c.fabric)) };
};

test("the census reproduces the committed world's own totals", () => {
  const { rows, total, headline } = fabricCensusRows(committed());
  assert.equal(rows.length, 13);
  assert.deepEqual(rows.map((r) => r.id),
    ["c01", "c02", "c03", "c04", "c05", "c06", "c07", "c08", "c09", "c10", "c11", "c12", "c13"]);
  assert.equal(total.regions, 160);
  assert.equal(total.surveyed, 40);
  assert.equal(total.settlements, 47);
  assert.equal(total.instances, 1758);
  assert.equal(total.anchors, 60);
  // Gross land is the manifest's budget.grossLandPolygonKm2, reached from the
  // cell census rather than restated — if the panel and the budget ever
  // disagree, the panel is reading a different world.
  const manifest = readJson("content/world/manifest.json");
  assert.equal(Math.round(total.grossLandKm2), manifest.budget.grossLandPolygonKm2);
  assert.match(headline, /^sea:land 1\.5 : 1 on 63999\.5 km² of net land/);
});

test("the roster comes from world.json's own continents[].fabric column", async () => {
  // The same column G-TRUNK-AREA joins through. Driven with a stub fetch so
  // the derivation is observable: a continent dropped from that list is a
  // continent the panel does not show, which is the intended coupling.
  const asked = [];
  const world = readJson("content/world/fabric/world.json");
  const trimmed = { ...world, continents: world.continents.slice(0, 2) };
  const fetchImpl = async (url) => {
    asked.push(url);
    const rel = url.replace(/^.*?(content\/world\/.*)$/, "$1");
    const body = rel.endsWith("world.json") ? trimmed : readJson(rel);
    return { ok: true, json: async () => body };
  };
  const loaded = await loadFabric({ fetchImpl, baseUrl: "http://x/atelier/atlas-world-panels/index.html" });
  assert.equal(loaded.fabric.length, 2);
  assert.equal(asked.length, 3);
  assert.match(asked[0], /content\/world\/fabric\/world\.json$/);
  assert.equal(fabricCensusRows(loaded).rows.length, 2);
});

test("every failure removes the PANEL, never the tab", async () => {
  const warned = [];
  const realWarn = console.warn;
  console.warn = (...a) => warned.push(a.join(" "));
  try {
    assert.equal(await loadFabric({ fetchImpl: async () => ({ ok: false, status: 404 }) }), null);
    assert.equal(await loadFabric({ fetchImpl: async () => { throw new Error("offline"); } }), null);
    assert.equal(await loadFabric({
      fetchImpl: async () => ({ ok: true, json: async () => ({ continents: [] }) }),
    }), null, "a world.json naming no continent files must disable the panel, not render an empty table");
  } finally { console.warn = realWarn; }
  assert.equal(warned.length, 3, warned.join(" | "));
});

test("the markup escapes what it interpolates and carries a TOTAL row", () => {
  const html = fabricCensusHtml(fabricCensusRows({
    world: null,
    fabric: [{ continent: "<script>x</script>", cellKm: 0.5, cellCensus: { land: 4, lake: 0, unowned: 0 }, regions: [], settlements: [], instances: [], dungeonAnchors: [] }],
  }));
  assert.ok(!html.includes("<script>"), html);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /maps-fabric-total/);
  assert.match(html, /world\.json carries no areaKm2/);
});

test("the panel is mounted by the Maps tab, not left as an unreferenced module", () => {
  const src = readFileSync(join(REPO_ROOT, "atelier/atlas-world-panels/js/maps.mjs"), "utf8");
  assert.match(src, /import \{ mountFabricCensus \} from "\.\/maps-fabric\.mjs"/);
  assert.match(src, /await mountFabricCensus\(section\)/);
});

test("atlas-world serves the fabric the census panel reads", () => {
  // A1 Task 10's lesson, restated for the merged surface: a panel that reads content/world/fabric/
  // is blank unless the server's static-mount allowlist (scripts/atlas_world_web/static_mounts.py)
  // names that path. (This used to assert the storybook Dockerfile COPYed content/world.)
  const rel = "content/world/fabric";
  const f = existsSync(join(REPO_ROOT, rel)) && readdirSync(join(REPO_ROOT, rel)).find((n) => n.endsWith(".json"));
  if (!f) return; // no fabric committed, nothing to promise
  const url = `/${rel}/${f}`;
  assert.ok(resolveMounted([url])[url],
    `${url} is not served by static_mounts.py — the fabric census panel would be silently absent on atlas-world`);
});
