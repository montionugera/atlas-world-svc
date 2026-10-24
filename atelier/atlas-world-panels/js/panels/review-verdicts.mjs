// Review verdicts panel — SSOT merge W2-D (`?tab=review&view=verdicts`).
//
// The asset-review half of the Review tab: every manifest + catalog asset as a
// baked-thumbnail card with reject / rebuild controls, narrowed by review state.
//   ?tab=review&view=verdicts                      all assets
//   ?tab=review&view=verdicts&verdict=reject       only rejected
//   ?tab=review&view=verdicts&verdict=rebuild      only "needs rebuild"
//   ?tab=review&view=verdicts&verdict=unreviewed   what has not been looked at yet
//
// Persistence is the server's: review/ui.mjs starts the verdict sync, which POSTs
// each mark to /api/review-queue/asset-verdicts (the single writer of
// content/review-queue.json). There is no download/copy step; this panel shows the
// save status instead. The Proposals half of the tab stays inline
// (renderReviewInbox) — the page's sub-view bar and the link below switch to it.
//
// The mounted DOM is kept by the registry, so the grid, scroll position and filter
// text survive a round trip through another tab.
import {
  MANIFEST_URL,
  CATALOG_MANIFEST_URL,
  RENDER_SPEC_URL,
  THUMB_INDEX_URL,
  REVIEW_QUEUE_URL,
  fetchJson,
} from "../state.mjs";
import { hasThumb, loadThumbIndex } from "../data/thumbs.mjs";
import { buildCard } from "../view/Card.mjs";
import { VirtualGrid } from "../view/VirtualGrid.mjs";
import {
  closeDetail,
  isDetailOpen,
  openDetail,
} from "../view/DetailOverlay.mjs";
import { buildFilterBar, matchesFilter } from "../view/FilterBar.mjs";
import { getSaveError, getStore, initReview } from "../review/ui.mjs";
import {
  VERDICT_FILTERS,
  filterByVerdict,
  normalizeVerdictFilter,
  verdictCounts,
} from "../review/verdict-filter.mjs";
import { ensureModelViewer } from "../review/model-viewer.mjs";
import { register } from "./registry.mjs";

let root = null;
let model = null; // set once mount() has succeeded

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setParams(patch, opts) {
  if (typeof window.atlasSetParams === "function") {
    window.atlasSetParams(patch, opts);
  }
}

// Visible, keyed messages: a failed optional source must say so on the page.
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
    console.warn("[review-verdicts] " + label + " unavailable:", err);
    setNote(noteId, message + " (" + String(err.message || err) + ")");
    return null;
  }
}

// ---------- mount ----------

async function mount(el0) {
  root = el0;
  root.replaceChildren(el("p", "empty-state", "Loading asset verdicts…"));

  const viewerLoad = ensureModelViewer().then(
    () => null,
    (err) => err,
  );

  const [manifest, catalog, renderSpec] = await Promise.all([
    fetchJson(MANIFEST_URL, "manifest"),
    fetchJson(CATALOG_MANIFEST_URL, "catalog-manifest"),
    fetchJson(RENDER_SPEC_URL, "render-spec"),
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
      "Baked thumbnail index unavailable — cards will show as missing; run `node scripts/bake_thumbnails.mjs`",
    ),
    optional(
      REVIEW_QUEUE_URL,
      "review-queue",
      setNote,
      "queue",
      "review-queue.json unavailable — existing verdicts are not shown, so everything looks unreviewed",
    ),
  ]);

  const thumbIndex = loadThumbIndex(thumbJson);
  const entries = [
    ...Object.entries(manifest.entries || {}),
    ...Object.entries(catalog.entries || {}),
  ];

  // initReview (hosted) also starts the verdict sync that writes to the server.
  const store =
    getStore() || initReview(queueJson || { version: 1, verdicts: {} });

  // --- chrome ---
  const toolbar = el("div", "subview-bar");
  toolbar.setAttribute("role", "group");
  toolbar.setAttribute("aria-label", "Verdict filter");
  toolbar.style.padding = "0 0 .5rem";

  const status = el("p", "empty-state");
  status.dataset.note = "persist";
  status.setAttribute("role", "status");
  status.style.cssText = "padding:0 0 .5rem;text-align:left";

  const section = el("section", "kind-section");
  section.dataset.kind = "verdicts";
  const heading = el("h2");
  const listStatus = el("p", "empty-state");
  listStatus.setAttribute("role", "status");
  listStatus.style.cssText = "padding:0 0 .75rem;text-align:left";
  const gridHost = el("div");
  section.append(heading, listStatus, gridHost);

  const filterBar = buildFilterBar({ entries, onChange: () => applyView() });

  frame.append(notesHost, toolbar, status, filterBar.el, section);
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
        sectionId: "verdicts",
        onOpen: openAsset,
      }),
  });

  model = {
    entries,
    renderSpec,
    thumbIndex,
    store,
    grid,
    setNote,
    toolbar,
    status,
    heading,
    listStatus,
    filterBar,
    filter: "all",
    unknownFilter: null,
    items: entries,
  };

  viewerLoad.then((err) => {
    if (err) {
      setNote(
        "viewer",
        "3D viewer failed to load (" +
          err.message +
          ") — previews are unavailable.",
      );
    }
  });

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

  // A mark made on a card re-sorts it out of (or into) the current filter, and every
  // save result repaints the status line. While hidden, show() repaints on return.
  const onVerdictChange = () => {
    if (root.hidden) return;
    applyView();
  };
  document.addEventListener("storybook:verdict-change", onVerdictChange);
  document.addEventListener("storybook:verdict-save-status", paintStatus);

  applyView();
}

// ---------- filter chips + status ----------

function lookup(key) {
  return model.store.get(key);
}

function paintToolbar(counts) {
  const { toolbar, filter } = model;
  const nodes = [];

  // The Proposals half of this tab is rendered inline; the page already offers the
  // switch in its own sub-view bar, this is the same thing within reach of the cards.
  if (typeof window.setSubView === "function") {
    const back = el(
      "button",
      "joy-button joy-button--sm joy-button--outline",
      "← Proposals (Step 3 Inbox)",
    );
    back.type = "button";
    back.dataset.subview = "proposals";
    back.addEventListener("click", () => window.setSubView("proposals"));
    nodes.push(back);
  }

  const label = el("span", "empty-state", "Asset verdicts —");
  label.style.padding = "0 .25rem";
  nodes.push(label);

  for (const f of VERDICT_FILTERS) {
    const on = f.id === filter;
    const b = el(
      "button",
      "joy-button joy-button--sm " +
        (on ? "joy-button--solid" : "joy-button--outline"),
      f.label + " (" + counts[f.id === "all" ? "all" : f.id] + ")",
    );
    b.type = "button";
    b.dataset.verdict = f.id;
    b.setAttribute("aria-pressed", String(on));
    b.addEventListener("click", () => setFilter(f.id, { push: true }));
    nodes.push(b);
  }
  toolbar.replaceChildren(...nodes);
}

function paintStatus() {
  if (!model) return;
  const { store, status } = model;
  const c = store.counts();
  const err = getSaveError();
  const summary = c.reject + " rejected · " + c.rebuild + " need rebuild";
  if (err) {
    status.style.color = "var(--err)";
    status.textContent = "⚠ " + summary + " — " + err;
  } else if (store.unsavedCount() > 0) {
    status.style.color = "var(--text-dim)";
    status.textContent = summary + " — saving to content/review-queue.json…";
  } else {
    status.style.color = "var(--text-dim)";
    status.textContent =
      summary +
      " — saved in content/review-queue.json (the server writes each mark as you make it).";
  }
}

function setFilter(id, { push = false } = {}) {
  model.filter = id;
  model.unknownFilter = null;
  applyView();
  setParams({ verdict: id === "all" ? null : id }, { push });
}

function applyView() {
  const { entries, grid, filterBar, heading, listStatus, setNote, filter } =
    model;
  const counts = verdictCounts(entries, lookup);
  paintToolbar(counts);
  paintStatus();

  setNote(
    "filter",
    model.unknownFilter
      ? "Unknown verdict filter “" +
          model.unknownFilter +
          "” — showing all assets."
      : null,
  );

  const byVerdict = filterByVerdict(entries, filter, lookup);
  const items = byVerdict.filter(([key, entry]) =>
    matchesFilter(key, entry, filterBar.state),
  );
  model.items = items;
  grid.setItems(items);

  const label = VERDICT_FILTERS.find((f) => f.id === filter).label;
  heading.textContent = label + " (" + items.length + ")";
  const textFiltered = items.length !== byVerdict.length;
  listStatus.textContent =
    items.length === 0
      ? "No assets match" +
        (textFiltered ? " the current filter." : " this verdict yet.")
      : textFiltered
        ? "Showing " +
          items.length +
          " of " +
          byVerdict.length +
          " in this view."
        : "";
  listStatus.hidden = listStatus.textContent === "";
}

// ---------- detail overlay ----------

function openAsset(key) {
  const { entries, items, renderSpec } = model;
  // Step through what is on screen; fall back to the whole library if the card
  // was just re-sorted out of the current view.
  let list = items;
  let index = list.findIndex(([k]) => k === key);
  if (index < 0) {
    list = entries;
    index = list.findIndex(([k]) => k === key);
  }
  if (index < 0) return;
  openDetail({ items: list, index, renderSpec });
}

// ---------- registration ----------

register("review-verdicts", {
  async mount(el0) {
    await mount(el0);
  },
  show(params = {}) {
    if (!model) return;
    const { id, known } = normalizeVerdictFilter(params.verdict);
    model.filter = id;
    model.unknownFilter = known ? null : params.verdict;
    applyView();
    model.grid.refresh();
  },
  hide() {
    // The overlay lives in the shared overlay root: hiding the panel does not hide
    // it, and a live <model-viewer> must not sit over another tab.
    if (isDetailOpen()) closeDetail({ silent: true });
  },
  count() {
    return model ? model.store.allKeys().length : null;
  },
});
