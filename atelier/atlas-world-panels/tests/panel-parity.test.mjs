// SSOT merge W3 — panel parity gate.
//
// The asset storybook's tabs now live inside atlas-world (scripts/catalog_explorer_web.py) as
// panels. Two things must not drift apart silently:
//   1. every storybook tab id (the *_CLASS constants in js/state.mjs) has a row in the
//      storybook → atlas-world mapping below (plan §2.1) AND that row's atlas-world tab exists
//      in NAV_GROUPS — so a tab added to the storybook cannot be left unreachable;
//   2. every `panel: true` NAV_GROUPS entry has a registered panel module under js/panels/
//      (none left as a registerPlaceholder stub), and the registry's own tab list agrees.
// Static source checks only: no browser, no server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VERDICT_FILTERS } from "../js/review/verdict-filter.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SB = resolve(HERE, "..");
const REPO = resolve(SB, "../..");
const PANELS = join(SB, "js/panels");

const read = (p) => readFileSync(p, "utf8");
const STATE_SRC = read(join(SB, "js/state.mjs"));
const EXPLORER_SRC = read(join(REPO, "scripts/catalog_explorer_web.py"));
const REGISTRY_SRC = read(join(PANELS, "registry.mjs"));

// storybook tab id → atlas-world destination (plan §2.1 table).
//   tab    the NAV_GROUPS id that must exist
//   panel  the js/panels/<id>.mjs module that serves it
//   view   a `&view=` sub-view of an inline tab that the panel host claims
const TAB_MAP = {
  combat: { tab: "combat-lab", panel: "combat-lab" },
  story: { tab: "story", panel: "story", view: ["reader", "graph", "undertow"] },
  "map-sheets": { tab: "map-sheets", panel: "map-sheets" },
  forge: { tab: "forge", panel: "forge" },
  "map-builder": { tab: "map-builder", panel: "map-builder" },
  sfx: { tab: "audio", panel: "audio" },
  music: { tab: "audio", panel: "audio" },
  art: { tab: "art", panel: "art" },
  coverage: { tab: "coverage", panel: "coverage" },
  "verdict:reject": { tab: "review", panel: "review-verdicts", view: ["verdicts"] },
  "verdict:rebuild": { tab: "review", panel: "review-verdicts", view: ["verdicts"] },
  "verdict:unreviewed": { tab: "review", panel: "review-verdicts", view: ["verdicts"] },
};
// `all` is dropped on purpose (the atlas-world sidebar replaces it); taxonomy kinds land on assets.
const KIND_DEST = { tab: "assets", panel: "assets" };

function navItems() {
  const items = [];
  for (const line of EXPLORER_SRC.split("\n")) {
    const m = line.match(/^\s*\{\s*id:\s*'([a-z0-9-]+)',\s*label:/);
    if (!m) continue;
    items.push({ id: m[1], panel: /\bpanel:\s*true\b/.test(line) });
  }
  return items;
}

function stateTabIds() {
  return [...STATE_SRC.matchAll(/export const [A-Z_]+_CLASS = "([^"]+)"/g)].map((m) => m[1]);
}

function registryList(name) {
  const m = REGISTRY_SRC.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(m, `registry.mjs has no ${name} array`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function assertRealPanel(id) {
  const file = join(PANELS, id + ".mjs");
  assert.ok(existsSync(file), `panel module js/panels/${id}.mjs is missing`);
  const src = read(file);
  assert.match(src, new RegExp(`\\bregister\\(\\s*"${id}"`), `js/panels/${id}.mjs never calls register("${id}", …)`);
  assert.doesNotMatch(src, /registerPlaceholder\s*\(/, `js/panels/${id}.mjs is still a registerPlaceholder stub`);
}

test("state.mjs declares the storybook tab ids this gate expects to see", () => {
  const ids = stateTabIds();
  for (const must of ["sfx", "music", "art", "coverage", "combat", "story", "map-sheets", "forge", "map-builder"]) {
    assert.ok(ids.includes(must), `state.mjs lost the "${must}" class — update TAB_MAP in this test if it was renamed on purpose`);
  }
});

test("every storybook tab id has a row in the atlas-world mapping table", () => {
  const unmapped = stateTabIds().filter((id) => !(id in TAB_MAP) && !id.startsWith("verdict:"));
  assert.deepEqual(unmapped, [], `storybook tab id(s) with no atlas-world destination: ${unmapped.join(", ")}`);
  for (const id of ["verdict:reject", "verdict:rebuild", "verdict:unreviewed"]) {
    assert.ok(stateTabIds().includes(id), `state.mjs no longer defines ${id}`);
    assert.ok(id in TAB_MAP, `${id} has no mapping row`);
  }
});

test("every mapping row lands on a NAV_GROUPS tab that exists", () => {
  const nav = new Set(navItems().map((i) => i.id));
  for (const [from, dest] of [...Object.entries(TAB_MAP), ["<taxonomy kind>", KIND_DEST]]) {
    assert.ok(nav.has(dest.tab), `storybook "${from}" maps to atlas-world tab "${dest.tab}", which is not in NAV_GROUPS`);
  }
});

test("the verdict filters the panel offers are exactly the verdict:* tab ids", () => {
  const filterIds = VERDICT_FILTERS.map((f) => f.id).filter((id) => id !== "all");
  const classIds = stateTabIds().filter((id) => id.startsWith("verdict:")).map((id) => id.slice("verdict:".length));
  assert.deepEqual([...filterIds].sort(), [...classIds].sort());
});

test("every panel: true NAV_GROUPS entry has a registered (non-placeholder) panel module", () => {
  const panelTabs = navItems().filter((i) => i.panel).map((i) => i.id);
  assert.ok(panelTabs.length >= 8, `expected the 8+ panel tabs in NAV_GROUPS, found ${panelTabs.length}`);
  for (const id of panelTabs) assertRealPanel(id);
});

test("registry PANEL_TABS is exactly the set of panel: true NAV_GROUPS ids", () => {
  const nav = navItems().filter((i) => i.panel).map((i) => i.id).sort();
  assert.deepEqual(registryList("PANEL_TABS").sort(), nav);
});

test("every panel the registry can load (tab panels + sub-view panels) is a real module", () => {
  const viewPanels = [...REGISTRY_SRC.matchAll(/panel:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(viewPanels.includes("story") && viewPanels.includes("review-verdicts"), "VIEW_CLAIMS lost story/review-verdicts");
  for (const id of new Set([...registryList("PANEL_TABS"), ...viewPanels])) assertRealPanel(id);
});

test("the sub-view claims in the table match the registry's VIEW_CLAIMS", () => {
  for (const [from, dest] of Object.entries(TAB_MAP)) {
    if (!dest.view) continue;
    const m = REGISTRY_SRC.match(new RegExp(`${dest.tab}:\\s*\\{\\s*views:\\s*\\[([^\\]]*)\\]\\s*,\\s*panel:\\s*"${dest.panel}"`));
    assert.ok(m, `VIEW_CLAIMS has no ${dest.tab} → ${dest.panel} rule (needed by storybook "${from}")`);
    const views = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    for (const v of dest.view) assert.ok(views.includes(v), `VIEW_CLAIMS.${dest.tab} does not claim view=${v}`);
  }
});

test("the taxonomy kinds the assets panel groups by exist (a kind must land on assets&kind=)", () => {
  const tax = JSON.parse(read(join(REPO, "content/asset-taxonomy.json")));
  const kinds = (tax.sections || []).flatMap((s) => s.kinds || []);
  assert.ok(kinds.length > 0, "content/asset-taxonomy.json lists no kinds");
  assertRealPanel(KIND_DEST.panel);
});
