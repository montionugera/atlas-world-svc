// Asset Key Coverage panel — SSOT merge W1-C.
//
// Joins the codegen keys (content/generated/asset-keys.json) against the manifest entries
// (manifest.json + catalog-manifest.json, disjoint keyspaces) and lists every key as mapped
// or unmapped. A mapped key links to ?tab=assets&key=<id>; an unmapped one is the same LOUD
// red card the standalone storybook shows. A source that cannot be read is a red banner,
// never a console.warn alone (that is how the old dead path hid for weeks).
import {
  ASSET_KEYS_URL,
  CATALOG_MANIFEST_URL,
  MANIFEST_URL,
  fetchJson,
} from "../state.mjs";
import {
  buildMappedKeyCard,
  buildMissingEntryCard,
  buildSourceUnavailableBanner,
  computeCoverage,
  filterCoverageRows,
} from "../coverage.mjs";
import { register } from "./registry.mjs";

const STATUSES = [
  ["all", "All"],
  ["unmapped", "Unmapped"],
  ["mapped", "Mapped"],
];

let model = null; // computeCoverage() result once mounted
let ui = null; // {stats, grid, count, kind, text, buttons}
const filter = { status: "all", kind: "", text: "" };

function stat(label, value) {
  const s = document.createElement("span");
  s.className = "stat";
  s.append(label + " ");
  const b = document.createElement("b");
  b.textContent = String(value);
  s.appendChild(b);
  return s;
}

function renderStats() {
  ui.stats.replaceChildren(
    stat("codegen keys", model.total),
    stat("mapped", model.mapped),
    stat("unmapped", model.unmapped),
    stat("coverage", model.pct + "%"),
  );
}

function renderGrid() {
  const rows = filterCoverageRows(model.rows, filter);
  ui.grid.replaceChildren(
    ...rows.map((r) =>
      r.mapped ? buildMappedKeyCard(r.id, r.kind) : buildMissingEntryCard(r.id, r.kind),
    ),
  );
  ui.count.textContent = rows.length + " of " + model.total + " keys shown";
  for (const [id, btn] of Object.entries(ui.buttons)) {
    btn.classList.toggle("joy-button--solid", id === filter.status);
    btn.classList.toggle("joy-button--outline", id !== filter.status);
    btn.setAttribute("aria-pressed", String(id === filter.status));
  }
  if (ui.kind.value !== filter.kind) ui.kind.value = filter.kind;
}

function toolbar() {
  const bar = document.createElement("div");
  bar.className = "subview-bar";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Coverage filters");
  bar.style.cssText = "padding:0 0 .75rem;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center";

  const buttons = {};
  for (const [id, label] of STATUSES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "joy-button joy-button--sm joy-button--outline";
    b.dataset.status = id;
    b.textContent = label;
    b.addEventListener("click", () => {
      filter.status = id;
      renderGrid();
    });
    buttons[id] = b;
    bar.appendChild(b);
  }

  const kind = document.createElement("select");
  kind.className = "art-filter-input";
  kind.style.width = "auto";
  kind.setAttribute("aria-label", "Filter by kind");
  kind.add(new Option("All kinds", ""));
  for (const k of [...new Set(model.rows.map((r) => r.kind))].sort()) {
    kind.add(new Option(k, k));
  }
  kind.addEventListener("change", () => {
    filter.kind = kind.value;
    if (window.atlasSetParams) window.atlasSetParams({ kind: kind.value });
    renderGrid();
  });

  const text = document.createElement("input");
  text.type = "search";
  text.className = "art-filter-input";
  text.style.width = "16rem";
  text.placeholder = "Filter by key…";
  text.setAttribute("aria-label", "Filter coverage keys by id");
  text.addEventListener("input", () => {
    filter.text = text.value;
    renderGrid();
  });

  const count = document.createElement("span");
  count.className = "stat";
  bar.append(kind, text, count);
  ui = { stats: null, grid: null, count, kind, text, buttons };
  return bar;
}

async function optionalJson(url, label) {
  try {
    return await fetchJson(url, label);
  } catch (err) {
    console.warn("[atlas-panels] coverage: " + label + " unavailable:", err);
    return null;
  }
}

register("coverage", {
  async mount(el) {
    const loading = document.createElement("p");
    loading.className = "empty-state";
    loading.textContent = "Loading coverage…";
    el.replaceChildren(loading);

    let assetKeys, manifest;
    try {
      [assetKeys, manifest] = await Promise.all([
        fetchJson(ASSET_KEYS_URL, "asset-keys"),
        fetchJson(MANIFEST_URL, "manifest"),
      ]);
    } catch (err) {
      el.replaceChildren(buildSourceUnavailableBanner(err));
      return;
    }
    const catalog = await optionalJson(CATALOG_MANIFEST_URL, "catalog-manifest");
    const ids = [
      ...Object.keys(manifest.entries || {}),
      ...Object.keys((catalog && catalog.entries) || {}),
    ];
    model = computeCoverage(assetKeys, ids);

    const section = document.createElement("section");
    section.className = "kind-section";
    section.id = "section-coverage";
    section.dataset.kind = "coverage";
    const h2 = document.createElement("h2");
    h2.textContent = "Asset Key Coverage";
    const blurb = document.createElement("p");
    blurb.className = "empty-state";
    blurb.style.cssText = "padding:0 0 1rem;text-align:left";
    blurb.textContent =
      "Codegen keys (content/generated/asset-keys.json) against manifest entries — the set the drift-gate reports as UNMAPPED. " +
      "Unmapped keys are LOUD red cards until a real entry lands; mapped keys link to their card in the Asset Library.";
    const stats = document.createElement("div");
    stats.className = "stat-row";
    stats.style.margin = "0 0 1rem";
    const bar = toolbar();
    const grid = document.createElement("div");
    grid.className = "grid";
    ui.stats = stats;
    ui.grid = grid;
    section.append(h2, blurb, stats, bar, grid);
    if (!catalog) {
      section.insertBefore(
        buildSourceUnavailableBanner(new Error("catalog-manifest.json — keys it maps may show as unmapped")),
        stats,
      );
    }
    el.replaceChildren(section);
    renderStats();
    renderGrid();
  },
  show(params) {
    if (!model) return;
    const kind = params && params.kind;
    if (kind && model.rows.some((r) => r.kind === kind)) filter.kind = kind;
    renderGrid();
  },
  count() {
    return model ? model.unmapped : null;
  },
});
