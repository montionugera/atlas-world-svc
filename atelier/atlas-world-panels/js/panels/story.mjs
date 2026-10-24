// Story panel — SSOT merge W1-D.
//
// Hosts the three iframe views of the story tab (?tab=story&view=reader|graph|undertow):
// the story-explorer reader, its narrative graph, and the Undertow novel. The Nodes
// sub-view (?view=nodes, the default) is rendered inline by the observatory and never
// reaches this panel; the shell's #subViewBar switches between all four.
//
// I-085: ONE iframe per view, created on first visit, never reparented and never
// destroyed — moving an iframe forces a reload, which would re-fetch the 1,259-line
// novel on every toggle. Switching views only toggles `hidden`.
import {
  STORY_VIEWS_URL,
  STORY_VIEWS_FALLBACK,
  fetchJson,
} from "../state.mjs";
import { register } from "./registry.mjs";

// The shell names the sub-view "undertow"; the registry (story-views.json) calls it "novel".
const VIEW_ALIAS = { undertow: "novel" };
const DEFAULT_VIEW = "reader";

let root = null;
let views = []; // registry entries with root-absolute src
let frames = {}; // view id → <iframe>
let links = {}; // view id → href for the "open full screen" link
let openLink = null;
let current = null;

// story-views.json keeps paths relative to atelier/atlas-world-panels/ (the packaging test
// resolves them from there). From the observatory's root the same files are served at
// their repo paths, so resolve against the registry's own URL and keep only the pathname.
function absolutize(src) {
  return new URL(src, new URL(STORY_VIEWS_URL, location.href)).pathname;
}

async function loadViews() {
  let list;
  try {
    list = await fetchJson(STORY_VIEWS_URL, "story-views");
    if (!Array.isArray(list) || list.length === 0)
      throw new Error("registry is not a non-empty array");
  } catch (err) {
    console.warn(
      "[atlas-panels] story-views.json unavailable — falling back to reader/graph/novel:",
      err,
    );
    list = STORY_VIEWS_FALLBACK;
  }
  return list.map((v) => ({ ...v, src: absolutize(v.src) }));
}

function viewFor(params) {
  const want = (params && params.view) || DEFAULT_VIEW;
  const id = VIEW_ALIAS[want] || want;
  return views.find((v) => v.id === id) || views.find((v) => v.id === DEFAULT_VIEW) || views[0];
}

function frameFor(view) {
  let frame = frames[view.id];
  if (!frame) {
    frame = document.createElement("iframe");
    frame.className = "story-overlay-frame";
    frame.title = view.label;
    frame.dataset.storyView = view.id;
    frame.src = view.src; // first visit only — later visits just unhide
    frame.hidden = true;
    frame.style.cssText =
      "width:100%;height:calc(100vh - 190px);min-height:480px;border:0;background:#0b0d12;display:block";
    frames[view.id] = frame;
    root.appendChild(frame);
  }
  return frame;
}

function select(view) {
  current = view;
  for (const v of views) if (frames[v.id]) frames[v.id].hidden = v.id !== view.id;
  frameFor(view).hidden = false;
  openLink.href = view.src;
  openLink.textContent = "Open " + view.label + " full screen ↗";
}

register("story", {
  async mount(el, params) {
    root = el;
    const loading = document.createElement("p");
    loading.className = "empty-state";
    loading.textContent = "Loading story views…";
    el.replaceChildren(loading);

    views = await loadViews();

    const bar = document.createElement("div");
    bar.className = "story-tabbar-row";
    openLink = document.createElement("a");
    openLink.className = "story-tab";
    openLink.target = "_blank";
    openLink.rel = "noopener";
    bar.appendChild(openLink);
    el.replaceChildren(bar);

    select(viewFor(params));
  },
  show(params) {
    if (!views.length) return;
    const view = viewFor(params);
    if (!current || current.id !== view.id) select(view);
  },
  // Frames stay alive while the panel is hidden; nothing in them is audible.
  hide() {},
  count() {
    return views.length || null;
  },
});
