// Panel registry — SSOT merge W0-2.
//
// The observatory (scripts/catalog_explorer_web.py) rebuilds #mainContent with
// innerHTML on every render(), which would destroy a <model-viewer>, decoded
// audio buffers or a pan/zoom position. Mounted panels therefore live in
// #panelHost, a sibling that render() never touches. A panel is mounted ONCE,
// on first show; switching tabs only toggles `hidden`, so its DOM and closure
// state survive.
//
// Contract (window.ATLAS_PANELS, called from INDEX_HTML's render()):
//   claims(tab, params) → bool   does the panel host own this tab+params?
//   show(tab, params)            mount on first call, then reveal + show(params)
//   hideAll()                    leave the panel host (inline tab is rendering)
//   count(id) → any|null         sidebar badge, null until the panel reports one
//   register(id, impl)           impl = {mount(el, params), show(params), hide(), count()}
//
// A panel module registers itself when it loads; the registry loads it lazily
// on first show. Ids without an implementation get a clean placeholder.

// Tabs owned by the panel host outright, and the sub-views of tabs that are
// otherwise rendered inline. Mirrored (and parity-checked by tests) by
// `panel: true` in INDEX_HTML's NAV_GROUPS and atlasPanelGuess().
const PANEL_TABS = [
  "map-sheets",
  "map-builder",
  "assets",
  "audio",
  "art",
  "coverage",
  "forge",
  "combat-lab",
  "lore",
  "concept-arts",
];
const VIEW_CLAIMS = {
  story: { views: ["reader", "graph", "undertow"], panel: "story" },
  review: { views: ["verdicts"], panel: "review-verdicts" },
};

// Every panel id below has a file ./<id>.mjs. Until its wave lands, that file is a
// two-line stub (registerPlaceholder); a wave replaces ONLY its own stub file, so no two
// packages in a wave ever edit registry.mjs. tests/test_atlas_world_web.py checks the files exist.
const PANEL_IDS = [
  ...PANEL_TABS,
  ...Object.values(VIEW_CLAIMS).map((r) => r.panel),
];

const entries = new Map(); // id → {id, el, impl, loading, visible}
let currentId = null;

function hostEl() {
  return document.getElementById("panelHost");
}

/** The panel id that owns (tab, params), or null when the inline view does. */
export function panelIdFor(tab, params = {}) {
  if (PANEL_TABS.includes(tab)) return tab;
  const rule = VIEW_CLAIMS[tab];
  if (rule && rule.views.includes(params.view)) return rule.panel;
  return null;
}

export function claims(tab, params = {}) {
  return panelIdFor(tab, params) !== null;
}

export function register(id, impl) {
  const entry = entryFor(id);
  entry.impl = impl;
}

export function count(id) {
  const entry = entries.get(id);
  if (!entry || !entry.impl || typeof entry.impl.count !== "function")
    return null;
  try {
    return entry.impl.count();
  } catch {
    return null;
  }
}

function entryFor(id) {
  let entry = entries.get(id);
  if (!entry) {
    const el = document.createElement("section");
    el.className = "atlas-panel";
    el.dataset.panel = id;
    el.hidden = true;
    entry = { id, el, impl: null, loading: null, visible: false, attempts: 0 };
    entries.set(id, entry);
    hostEl()?.appendChild(el);
  }
  return entry;
}

/** Registers the "pending" placeholder for a panel whose wave has not landed yet. */
export function registerPlaceholder(id, wave) {
  register(id, {
    mount(el) {
      const note = document.createElement("div");
      note.className = "empty-state";
      note.dataset.panelPlaceholder = id;
      note.textContent = "Panel “" + id + "” is pending (Wave " + wave + ").";
      el.replaceChildren(note);
    },
  });
}

function fail(entry, err) {
  console.error("[atlas-panels] " + entry.id + " failed to load:", err);
  const note = document.createElement("div");
  note.className = "empty-state";
  note.dataset.panelError = entry.id;
  note.textContent =
    "Panel “" +
    entry.id +
    "” failed to load: " +
    String(err && err.message ? err.message : err);
  entry.el.replaceChildren(note);
}

async function load(entry, params) {
  try {
    // A failed dynamic import is remembered by the browser's module map; a cache-busting query
    // makes the retry on the next show() a genuinely new fetch.
    const retry = entry.attempts++ ? "?r=" + entry.attempts : "";
    if (!entry.impl) await import("./" + entry.id + ".mjs" + retry); // the module registers itself
    if (!entry.impl)
      throw new Error("module loaded but did not call register()");
    await entry.impl.mount(entry.el, params);
  } catch (err) {
    fail(entry, err);
    entry.loading = null; // a retry on the next show() re-mounts (the module stays cached and registered)
  }
}

function leave(entry) {
  if (!entry.visible) return;
  entry.visible = false;
  entry.el.hidden = true;
  try {
    entry.impl?.hide?.();
  } catch (err) {
    console.error("[atlas-panels] " + entry.id + " hide() threw:", err);
  }
}

export function hideAll() {
  currentId = null;
  for (const entry of entries.values()) leave(entry);
}

export async function show(tab, params = {}) {
  const id = panelIdFor(tab, params);
  const host = hostEl();
  if (!id || !host) return;
  host.querySelector("[data-panel-loading]")?.remove();
  currentId = id;
  for (const entry of entries.values()) if (entry.id !== id) leave(entry);

  const entry = entryFor(id);
  // Reveal BEFORE mounting: IntersectionObserver warm-ups never fire on a hidden board.
  entry.el.hidden = false;
  entry.visible = true;
  const firstMount = !entry.loading;
  if (firstMount) entry.loading = load(entry, params);
  await entry.loading;
  // Even if the user moved on mid-mount, the sidebar badge must hear that the panel now has a count.
  if (firstMount) window.dispatchEvent(new Event("atlas-panels-updated"));
  if (currentId !== id) return; // the user moved on while it was loading
  if (entry.impl) {
    try {
      entry.impl.show?.(params);
    } catch (err) {
      console.error("[atlas-panels] " + id + " show() threw:", err);
    }
  }
}

/**
 * Root for overlays that must sit on <body> (detail/story/map overlays are position:fixed and
 * would otherwise be clipped by the scroll stage). panels.css scopes every rule and custom
 * property under `.atlas-panel`, so anything appended straight to <body> is unstyled — append
 * to this element instead.
 */
export function overlayRoot() {
  let el = document.getElementById("atlasOverlayRoot");
  if (!el) {
    el = document.createElement("div");
    el.id = "atlasOverlayRoot";
    el.className = "atlas-panel";
    el.style.cssText =
      "background:none;margin:0;padding:0;height:0;overflow:visible";
    document.body.appendChild(el);
  }
  return el;
}

export function ids() {
  return { tabs: [...PANEL_TABS], panels: [...PANEL_IDS] };
}

window.ATLAS_PANELS = {
  register,
  registerPlaceholder,
  claims,
  show,
  hideAll,
  count,
  ids,
  panelIdFor,
  overlayRoot,
};
window.dispatchEvent(new Event("atlas-panels-ready"));
