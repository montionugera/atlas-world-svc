import {
  STORY_CLASS,
  STORY_VIEWS_URL,
  STORY_VIEWS_FALLBACK,
} from "./state.mjs";
import { initHealth, bumpHealth, renderSidebarBadge } from "./health.mjs";
import { buildSidebarItem } from "./sidebar.mjs";

/**
 * The story surfaces (tools/story-explorer + the Undertow novel), embedded.
 *
 * Same contract as the combat lab (js/combat-lab.mjs): not an asset, no health
 * check, and a manifest 404 must not take it down — so main.mjs mounts this in
 * both its failure path and its happy path.
 *
 * Unlike the art tabs, the active tab is a closure local: nothing outside this
 * module reads or writes it, because the section shows and hides wholesale via
 * setActiveClass's data-kind match (sidebar.mjs:60-66).
 */
async function loadViews() {
  try {
    const res = await fetch(STORY_VIEWS_URL);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const views = await res.json();
    if (!Array.isArray(views) || views.length === 0)
      throw new Error("registry is not a non-empty array");
    return views;
  } catch (err) {
    console.warn(
      "[asset-storybook] story-views.json unavailable — falling back to reader/graph/novel:",
      err,
    );
    return STORY_VIEWS_FALLBACK;
  }
}

export async function mountStory(main) {
  const views = await loadViews();

  const section = document.createElement("section");
  section.className = "kind-section";
  section.id = "section-" + STORY_CLASS;
  section.dataset.kind = STORY_CLASS;

  const h2 = document.createElement("h2");
  h2.textContent = "Story — reader, graph & novel";
  section.appendChild(h2);

  const note = document.createElement("p");
  note.style.cssText =
    "color:#9aa1b2;font-size:13px;margin:0 0 12px;max-width:70ch";
  const noteText = document.createElement("span");
  noteText.textContent =
    "The narrative, live. Not an asset — no manifest, no health check. " +
    "Only the open tab loads. ";
  const fullLink = document.createElement("a");
  fullLink.target = "_blank";
  fullLink.rel = "noopener";
  fullLink.textContent = "Open full screen ↗";
  note.appendChild(noteText);
  note.appendChild(fullLink);
  section.appendChild(note);

  const tabRow = document.createElement("div");
  tabRow.className = "story-tabbar-row";
  section.appendChild(tabRow);

  const frame = document.createElement("iframe");
  frame.loading = "lazy";
  frame.style.cssText =
    "width:100%;height:80vh;border:1px solid #262c3a;border-radius:10px;background:#0b0d12;display:block";
  section.appendChild(frame);

  let activeView = null;
  function selectView(view) {
    activeView = view;
    frame.src = view.src;
    fullLink.href = view.src;
    tabRow.querySelectorAll(".story-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.storyTab === view.id);
    });
  }

  for (const view of views) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "story-tab";
    btn.dataset.storyTab = view.id;
    btn.textContent = view.label;
    btn.addEventListener("click", () => {
      if (activeView && activeView.id === view.id) return; // don't reload the open view
      selectView(view);
    });
    tabRow.appendChild(btn);
  }

  const hint = document.createElement("p");
  hint.className = "art-tabbar-hint";
  hint.textContent =
    "Tabs mirror the story-views.json registry order. Adding a view is a registry edit plus its Dockerfile COPY + allowlist lines.";
  section.appendChild(hint);

  selectView(views[0]);

  main.appendChild(section);
}

/** Sidebar entry for the story section. Separated so it can sit up top. */
export function mountStoryNav(sidebarNav) {
  initHealth(STORY_CLASS, 1);
  const btn = buildSidebarItem(STORY_CLASS, 1);
  btn.style.marginBottom = "10px";
  btn.style.borderBottom = "1px solid #262c3a";
  btn.style.paddingBottom = "10px";
  sidebarNav.appendChild(btn);
  bumpHealth(STORY_CLASS, { ok: 1 });
  renderSidebarBadge(STORY_CLASS);
}
