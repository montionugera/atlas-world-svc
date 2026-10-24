// Assets panel — SSOT merge W1-A (Asset Classes & 3D viewer).
//
// One windowed grid of baked-thumbnail cards over every manifest + catalog entry,
// narrowed by a taxonomy-kind switcher and a free-text/tag filter. Clicking a card
// opens the detail overlay — the ONLY place a live <model-viewer> exists (one at a
// time; 643 grid viewers was the 92 MB failure this architecture replaced).
//
// Deep links (params arrive via registry.show on every render):
//   ?tab=assets&kind=creature | character:mob   a section, or a section + key prefix
//   ?tab=assets&key=mob:aggressive              open that asset's detail overlay
//
// The mounted DOM is kept by the registry, so the grid, scroll position and filter
// text survive a round trip through another tab.
import {
  MANIFEST_URL,
  CATALOG_MANIFEST_URL,
  RENDER_SPEC_URL,
  TAXONOMY_URL,
  THUMB_INDEX_URL,
  REVIEW_QUEUE_URL,
  fetchJson,
} from "../state.mjs";
import {
  ALL_KIND,
  buildKindIndex,
  filterByKind,
  loadTaxonomy,
} from "../data/taxonomy.mjs";
import { hasThumb, loadThumbIndex } from "../data/thumbs.mjs";
import { buildCard } from "../view/Card.mjs";
import { VirtualGrid } from "../view/VirtualGrid.mjs";
import {
  closeDetail,
  isDetailOpen,
  openDetail,
} from "../view/DetailOverlay.mjs";
import { buildFilterBar, matchesFilter } from "../view/FilterBar.mjs";
import { startVerdictSync } from "../view/VerdictSync.mjs";
import { getStore, initReview } from "../review/ui.mjs";
import { register } from "./registry.mjs";

const MODEL_VIEWER_SRC = "/vendor/model-viewer.min.js";
const MODEL_VIEWER_TIMEOUT_MS = 15000;

// ---------- <model-viewer> (vendored; loaded once, on first mount) ----------

let modelViewerReady = null;

function ensureModelViewer() {
  if (customElements.get("model-viewer")) return Promise.resolve();
  if (modelViewerReady) return modelViewerReady;
  modelViewerReady = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out defining <model-viewer>")),
      MODEL_VIEWER_TIMEOUT_MS,
    );
    const done = (fn, arg) => {
      clearTimeout(timer);
      fn(arg);
    };
    let script = document.querySelector("script[data-atlas-model-viewer]");
    if (!script) {
      script = document.createElement("script");
      script.type = "module";
      script.src = MODEL_VIEWER_SRC;
      script.dataset.atlasModelViewer = "1";
      script.addEventListener("error", () => {
        script.remove();
        done(reject, new Error("could not load " + MODEL_VIEWER_SRC));
      });
      document.head.appendChild(script);
    }
    customElements.whenDefined("model-viewer").then(
      () => done(resolve),
      (err) => done(reject, err),
    );
  }).catch((err) => {
    modelViewerReady = null; // a later open retries instead of caching the failure
    throw err;
  });
  return modelViewerReady;
}

// ---------- panel state ----------

let root = null;
let model = null; // set once mount() has succeeded

function setParams(patch, opts) {
  if (typeof window.atlasSetParams === "function") {
    window.atlasSetParams(patch, opts);
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Visible, keyed messages. A failed optional source or an unknown deep link must
// say so on the page — a console.warn is what hid the dead Coverage path.
function makeNotes(host) {
  const byId = new Map();
  return function setNote(id, text, tone = "err") {
    let p = byId.get(id);
    if (!text) {
      if (p) p.remove();
      byId.delete(id);
      return;
    }
    if (!p) {
      p = el("p", "empty-state");
      p.dataset.note = id;
      p.setAttribute("role", "status");
      p.style.cssText = "padding:0 0 .5rem;text-align:left";
      byId.set(id, p);
      host.appendChild(p);
    }
    p.style.color = tone === "err" ? "var(--err)" : "var(--text-dim)";
    p.textContent = text;
  };
}

async function optional(url, label, setNote, noteId, message) {
  try {
    return await fetchJson(url, label);
  } catch (err) {
    console.warn("[assets] " + label + " unavailable:", err);
    setNote(noteId, message + " (" + String(err.message || err) + ")");
    return null;
  }
}

// Review chrome (#review-bar, #compare-tray) is appended to <body> by review/ui.mjs,
// where panels.css (scoped under .atlas-panel) does not reach. Re-home it.
function adoptReviewChrome() {
  const host = window.ATLAS_PANELS && window.ATLAS_PANELS.overlayRoot();
  if (!host) return;
  for (const id of ["review-bar", "compare-tray"]) {
    const node = document.getElementById(id);
    if (node && node.parentNode !== host) host.appendChild(node);
  }
}

// ---------- mount ----------

async function mount(el0) {
  root = el0;
  root.replaceChildren(el("p", "empty-state", "Loading asset library…"));

  // Start the 1 MB viewer script in parallel with the data; only the overlay needs it.
  const viewerLoad = ensureModelViewer().then(
    () => null,
    (err) => err,
  );

  const [manifest, catalog, renderSpec, taxonomyJson] = await Promise.all([
    fetchJson(MANIFEST_URL, "manifest"),
    fetchJson(CATALOG_MANIFEST_URL, "catalog-manifest"),
    fetchJson(RENDER_SPEC_URL, "render-spec"),
    fetchJson(TAXONOMY_URL, "asset-taxonomy"),
  ]);

  const frame = el("div");
  const notesHost = el("div");
  const setNote = makeNotes(notesHost);

  const [thumbJson, queueJson] = await Promise.all([
    optional(
      THUMB_INDEX_URL,
      "thumb-index",
      setNote,
      "thumbs",
      "Baked thumbnail index unavailable — every card will show as missing; run `node scripts/bake_thumbnails.mjs`",
    ),
    optional(
      REVIEW_QUEUE_URL,
      "review-queue",
      setNote,
      "queue",
      "review-queue.json unavailable — existing verdicts are not shown",
    ),
  ]);

  const thumbIndex = loadThumbIndex(thumbJson);
  const taxonomy = loadTaxonomy(taxonomyJson);
  const entries = [
    ...Object.entries(manifest.entries || {}),
    ...Object.entries(catalog.entries || {}),
  ];
  const kinds = buildKindIndex(entries, taxonomy);
  const knownKinds = new Set(
    kinds.flatMap((k) => [k.id, ...k.children.map((c) => c.id)]),
  );

  // Review layer: cards get reject/rebuild controls only once a store exists.
  const queue = queueJson || { version: 1, verdicts: {} };
  const store = getStore() || initReview(queue);
  adoptReviewChrome();
  startVerdictSync({
    store,
    committed: queue.verdicts || {},
    onStatus: (msg) => setNote("verdict-sync", msg),
  });

  // --- chrome ---
  const kindBar = el("div", "subview-bar");
  kindBar.setAttribute("role", "group");
  kindBar.setAttribute("aria-label", "Asset class");
  kindBar.style.padding = "0 0 .5rem";
  const childBar = el("div", "subview-bar");
  childBar.setAttribute("role", "group");
  childBar.setAttribute("aria-label", "Asset sub-class");
  childBar.style.padding = "0 0 .5rem";

  const section = el("section", "kind-section");
  section.dataset.kind = "assets";
  const heading = el("h2");
  const status = el("p", "empty-state");
  status.setAttribute("role", "status");
  status.style.cssText = "padding:0 0 .75rem;text-align:left";
  const gridHost = el("div");
  section.append(heading, status, gridHost);

  const filterBar = buildFilterBar({
    entries,
    onChange: () => applyView(),
  });

  frame.append(notesHost, kindBar, childBar, filterBar.el, section);
  root.replaceChildren(frame);

  // Attach BEFORE constructing the grid: it measures clientWidth for its columns.
  const grid = new VirtualGrid({
    container: gridHost,
    items: [],
    rowHeight: 340,
    minColumnWidth: 260,
    buildCard: ([key, entry]) =>
      buildCard(key, entry, {
        thumbIndex,
        sectionId: model ? model.activeKind : ALL_KIND,
        onOpen: openAsset,
      }),
  });

  model = {
    entries,
    taxonomy,
    kinds,
    knownKinds,
    renderSpec,
    thumbIndex,
    grid,
    setNote,
    status,
    heading,
    kindBar,
    childBar,
    filterBar,
    activeKind: ALL_KIND,
    items: entries,
    openKey: null,
    viewerLoad,
  };

  const missing = entries.filter(
    ([, e]) => !hasThumb(e.scene ?? e.stream ?? "", thumbIndex),
  ).length;
  if (missing > 0 && thumbJson) {
    setNote(
      "thumbs",
      missing +
        " asset(s) have no baked thumbnail — run `node scripts/bake_thumbnails.mjs`",
    );
  }
  model.missing = missing;

  buildKindButtons();
  applyView();
}

// ---------- kind switcher ----------

function kindButton(id, label, count) {
  const b = el("button", "joy-button joy-button--sm joy-button--outline");
  b.type = "button";
  b.dataset.kind = id;
  b.textContent = label + " (" + count + ")";
  b.addEventListener("click", () => setKind(id, { push: true }));
  return b;
}

function buildKindButtons() {
  const { kindBar, kinds, entries } = model;
  kindBar.replaceChildren(
    kindButton(ALL_KIND, "All", entries.length),
    ...kinds.map((k) => kindButton(k.id, k.label, k.count)),
  );
}

function sectionOf(kindId) {
  const i = kindId.indexOf(":");
  return i === -1 ? kindId : kindId.slice(0, i);
}

function paintKinds() {
  const { kindBar, childBar, kinds, activeKind } = model;
  const active = sectionOf(activeKind);
  for (const b of kindBar.querySelectorAll("button")) {
    const on = b.dataset.kind === active;
    b.classList.toggle("joy-button--solid", on);
    b.classList.toggle("joy-button--outline", !on);
    b.setAttribute("aria-pressed", String(on));
  }
  // Sub-chips only where a section really has more than one key prefix.
  const section = kinds.find((k) => k.id === active);
  if (!section || section.children.length < 2) {
    childBar.hidden = true;
    childBar.replaceChildren();
    return;
  }
  childBar.hidden = false;
  childBar.replaceChildren(
    kindButton(section.id, "All " + section.label, section.count),
    ...section.children.map((c) => kindButton(c.id, c.label, c.count)),
  );
  for (const b of childBar.querySelectorAll("button")) {
    const on = b.dataset.kind === activeKind;
    b.classList.toggle("joy-button--solid", on);
    b.classList.toggle("joy-button--outline", !on);
    b.setAttribute("aria-pressed", String(on));
  }
}

function setKind(kindId, { push = false } = {}) {
  model.activeKind = kindId;
  applyView();
  setParams({ kind: kindId === ALL_KIND ? null : kindId }, { push });
}

function labelOfKind(kindId) {
  if (kindId === ALL_KIND) return "All assets";
  for (const k of model.kinds) {
    if (k.id === kindId) return k.label;
    const child = k.children.find((c) => c.id === kindId);
    if (child) return k.label + " · " + child.label;
  }
  return kindId;
}

function applyView() {
  const { entries, activeKind, grid, filterBar, heading, status, setNote } =
    model;
  paintKinds();

  const unknown = activeKind !== ALL_KIND && !model.knownKinds.has(activeKind);
  setNote(
    "kind",
    unknown
      ? "Unknown asset kind “" +
          activeKind +
          "” — nothing matches it. Pick a class above."
      : null,
  );

  const byKind = unknown
    ? []
    : filterByKind(entries, activeKind, model.taxonomy);
  const items = byKind.filter(([key, entry]) =>
    matchesFilter(key, entry, filterBar.state),
  );
  model.items = items;
  grid.setItems(items);

  heading.textContent = labelOfKind(activeKind) + " (" + items.length + ")";
  const filtered = items.length !== byKind.length;
  status.textContent =
    items.length === 0
      ? unknown
        ? ""
        : "No assets match" + (filtered ? " the current filter." : ".")
      : filtered
        ? "Showing " + items.length + " of " + byKind.length + " in this class."
        : "";
  status.hidden = status.textContent === "";
}

// ---------- detail overlay (+ ?key= deep link) ----------

function openAsset(key) {
  const { entries, items, renderSpec, setNote } = model;
  // Prefer the visible (filtered) list so arrow keys step through what is on screen;
  // a deep-linked key outside it falls back to the whole library.
  let list = items;
  let index = list.findIndex(([k]) => k === key);
  if (index < 0) {
    list = entries;
    index = list.findIndex(([k]) => k === key);
  }
  if (index < 0) {
    setNote("key", "Asset key “" + key + "” is not in the manifest.");
    return false;
  }
  setNote("key", null);
  openDetail({
    items: list,
    index,
    renderSpec,
    onChange: (k) => {
      model.openKey = k;
      setParams({ key: k });
    },
    onClose: () => {
      model.openKey = null;
      setParams({ key: null });
    },
  });
  return true;
}

async function syncOverlay(key) {
  if (!key) {
    if (isDetailOpen()) closeDetail({ silent: true });
    model.openKey = null;
    model.setNote("key", null);
    return;
  }
  if (key === model.openKey && isDetailOpen()) return; // already showing it
  const viewerError = await model.viewerLoad;
  if (viewerError) {
    model.setNote(
      "viewer",
      "3D viewer failed to load (" +
        viewerError.message +
        ") — previews are unavailable.",
    );
  } else {
    model.setNote("viewer", null);
  }
  openAsset(key);
}

// ---------- registration ----------

register("assets", {
  async mount(el0) {
    await mount(el0);
  },
  show(params = {}) {
    if (!model) return;
    const kind = params.kind || ALL_KIND;
    if (kind !== model.activeKind) {
      model.activeKind = kind;
      applyView();
    } else {
      model.grid.refresh();
    }
    syncOverlay(params.key || null);
  },
  hide() {
    // The overlay lives in the shared overlay root, outside this panel: hiding the
    // panel does not hide it, and a live <model-viewer> must not sit over another tab.
    if (isDetailOpen()) closeDetail({ silent: true });
    if (model) model.openKey = null;
  },
  count() {
    return model ? model.entries.length : null;
  },
});
