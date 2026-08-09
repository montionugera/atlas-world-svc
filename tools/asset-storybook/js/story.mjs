import {
  STORY_CLASS,
  STORY_VIEWS_URL,
  STORY_VIEWS_FALLBACK,
} from "./state.mjs";
import { initHealth, bumpHealth, renderSidebarBadge } from "./health.mjs";
import { buildSidebarItem } from "./sidebar.mjs";

/**
 * The story surfaces (tools/story-explorer + the Undertow novel).
 *
 * Same mount contract as the combat lab (js/combat-lab.mjs): not an asset, no
 * health check, and a manifest 404 must not take it down — so main.mjs mounts
 * this in both its failure path and its happy path.
 *
 * I-085: the section itself holds NO iframe. F-034 put one at height:80vh in the
 * page flow, which meant reading a 29,298px document through a 688px slot while
 * a 75,284px page scrolled behind it — and showing a ~400px sliver of that slot
 * whenever the section was only partly scrolled into view. The section is now a
 * launcher; reading happens in a full-viewport overlay that owns the screen.
 *
 * There is exactly ONE iframe and it is never reparented: moving an iframe
 * between parents forces a reload in every major browser, which would re-fetch
 * the novel on every open/close.
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

// ---------- the reading overlay (module-level singleton) ----------

let overlay = null;
let overlayFrame = null;
let overlayTabRow = null;
let overlayLink = null;
let overlayCloseBtn = null;
let activeView = null;
let savedScrollY = 0;
let lastTrigger = null;
let escHandler = null;

function buildOverlay(views) {
  overlay = document.createElement("div");
  overlay.className = "story-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Story reading view");

  const header = document.createElement("div");
  header.className = "story-overlay-header";

  overlayTabRow = document.createElement("div");
  overlayTabRow.className = "story-tabbar-row";
  overlayTabRow.style.margin = "0";
  for (const view of views) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "story-tab";
    btn.dataset.storyTab = view.id;
    btn.textContent = view.label;
    btn.addEventListener("click", () => selectView(view));
    overlayTabRow.appendChild(btn);
  }
  header.appendChild(overlayTabRow);

  const spacer = document.createElement("div");
  spacer.className = "story-overlay-spacer";
  header.appendChild(spacer);

  overlayLink = document.createElement("a");
  overlayLink.className = "story-tab";
  overlayLink.target = "_blank";
  overlayLink.rel = "noopener";
  overlayLink.textContent = "Open full screen ↗";
  header.appendChild(overlayLink);

  overlayCloseBtn = document.createElement("button");
  overlayCloseBtn.type = "button";
  overlayCloseBtn.className = "story-tab";
  overlayCloseBtn.textContent = "Exit ✕";
  overlayCloseBtn.setAttribute("aria-label", "Close the story reading view");
  overlayCloseBtn.addEventListener("click", () => closeStoryView());
  header.appendChild(overlayCloseBtn);

  overlay.appendChild(header);

  overlayFrame = document.createElement("iframe");
  overlayFrame.className = "story-overlay-frame";
  overlay.appendChild(overlayFrame);

  document.body.appendChild(overlay);
}

function selectView(view) {
  if (activeView && activeView.id === view.id) return; // don't reload the open view
  activeView = view;
  overlayFrame.src = view.src;
  overlayLink.href = view.src;
  overlayTabRow.querySelectorAll(".story-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.storyTab === view.id);
  });
}

// Tab/Shift+Tab trap while the overlay is open. Queried fresh on every
// keydown rather than cached: the tab row is built once, but overlayLink's
// href (and so its place as a real, focusable `a[href]`) changes per view.
// The iframe is included as the last stop — it's the reading content itself,
// so a keyboard-only user must be able to Tab into it. Known trade-off: once
// focus is inside the iframe's own document, keydown fires there, not here,
// so this trap cannot intercept it — focus can leave the overlay from inside
// the iframe. Accepted: being able to read the content by keyboard outweighs
// a perfectly sealed trap. Do not "fix" this with polling, focus/blur
// ping-pong, or reaching into the iframe's document.
function trapFocus(ev) {
  const focusable = Array.from(
    overlay.querySelectorAll("button, a[href], iframe"),
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (ev.shiftKey) {
    if (document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    }
  } else if (document.activeElement === last) {
    ev.preventDefault();
    first.focus();
  }
}

function openStoryView(view, views, trigger) {
  if (!overlay) buildOverlay(views);
  if (trigger) lastTrigger = trigger;
  if (overlay.hidden) {
    savedScrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    overlay.hidden = false;
    escHandler = (ev) => {
      if (ev.key === "Escape") {
        closeStoryView();
      } else if (ev.key === "Tab") {
        trapFocus(ev);
      }
    };
    document.addEventListener("keydown", escHandler);
  }
  selectView(view);
  // Move focus into the dialog on open (WCAG 2.4.3 / the modal pattern) —
  // the active view's own tab button is the natural landing spot; fall back
  // to the Exit button on the vanishingly unlikely chance it's missing.
  const activeTabBtn = overlayTabRow.querySelector(
    '[data-story-tab="' + view.id + '"]',
  );
  (activeTabBtn || overlayCloseBtn).focus();
}

function closeStoryView() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.style.overflow = "";
  window.scrollTo(0, savedScrollY);
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
  if (lastTrigger) lastTrigger.focus();
}

// Closing on sidebar navigation goes through a DOM event rather than an import.
// sidebar.mjs cannot import this module: story.mjs already imports
// buildSidebarItem from sidebar.mjs, and the reverse import would make a cycle.
document.addEventListener("storybook:class-change", () => closeStoryView());

// ---------- the inline launcher ----------

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
  note.textContent =
    "The narrative, live. Not an asset — no manifest, no health check. " +
    "Pick a view to open it full screen; nothing loads until you do. " +
    "Exit with the ✕ or the Escape key.";
  section.appendChild(note);

  const row = document.createElement("div");
  row.className = "story-launcher-row";
  for (const view of views) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "story-tab";
    btn.dataset.storyLaunch = view.id;
    btn.textContent = view.label;
    btn.addEventListener("click", () => openStoryView(view, views, btn));
    row.appendChild(btn);

    const out = document.createElement("a");
    out.className = "story-tab";
    out.href = view.src;
    out.target = "_blank";
    out.rel = "noopener";
    out.textContent = "↗";
    out.title = "Open " + view.label + " in a new tab";
    out.setAttribute("aria-label", "Open " + view.label + " in a new tab");
    row.appendChild(out);
  }
  section.appendChild(row);

  const hint = document.createElement("p");
  hint.className = "art-tabbar-hint";
  hint.textContent =
    "Views mirror the story-views.json registry order. Adding a view is a registry edit plus its Dockerfile COPY + allowlist lines.";
  section.appendChild(hint);

  // I-085: appended last, this landed at ~95% of a ~74,000px page. Anchoring
  // to the combat lab does NOT fix this: main.mjs:249 appends every asset
  // section in the loop before :252 appends combat, so the combat section
  // itself sits ~13th, not near the top (only its sidebar entry is near the
  // top). Prepending is the only placement that satisfies "near the top"
  // without reordering other sections, which is out of scope for this
  // feature — accepted trade-off: body order (Story first) no longer
  // matches the sidebar order (Combat above Story).
  //
  // Exception: on main.mjs's manifest-failure path (:61), main.innerHTML is
  // set to a `.empty-state` diagnostic div BEFORE combat and story mount.
  // An unconditional prepend would push that diagnostic below the story
  // section, hiding it. If that notice is present, insert right after it
  // instead so it stays the first thing on the page.
  //
  // Scoped to DIRECT children only (":scope > .empty-state"), not
  // main.querySelector(".empty-state"): the class is reused for ordinary
  // section blurbs (SFX/Music/Coverage descriptive text nested inside their
  // own <section>s), which are healthy-page content, not error notices. An
  // unscoped descendant query would find one of those instead if a
  // blurb-bearing section ever mounted before story, and insert the story
  // section INSIDE it — a nested <section> in the middle of another list.
  const failureNotice = main.querySelector(":scope > .empty-state");
  if (failureNotice) failureNotice.after(section);
  else main.prepend(section);
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
