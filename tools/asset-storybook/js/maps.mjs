import { MAPS_CLASS, MAPS_INDEX_URL, REPO_ROOT_REL } from "./state.mjs";
import { initHealth, bumpHealth, renderSidebarBadge } from "./health.mjs";
import { buildSidebarItem } from "./sidebar.mjs";

/**
 * The Maps tab (F-044): every mapforge sheet (tools/mapforge/render-sheet.mjs
 * SHEETS), listed from maps-index.json and viewable with a vanilla-JS
 * wheel-zoom + drag-pan viewer.
 *
 * Same mount contract as combat-lab.mjs/story.mjs: not an asset-manifest
 * kind, no dependency on manifest.json et al, mounted in both main.mjs's
 * failure and happy paths so a manifest 404 never takes this section down
 * with it. This is the "every produced artifact must be observable in a
 * review surface" rule (owner intent, 2026-08-15) — F-043 shipped
 * atlas-world.svg and it took a separate ask to notice it wasn't here.
 */
async function loadIndex() {
  try {
    const res = await fetch(MAPS_INDEX_URL);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const index = await res.json();
    if (!Array.isArray(index.sheets) || index.sheets.length === 0)
      throw new Error("maps-index.json has no sheets");
    return index.sheets;
  } catch (err) {
    console.warn(
      "[asset-storybook] maps-index.json unavailable — Maps section disabled:",
      err,
    );
    return [];
  }
}

// maps-index.json's svg/png fields are repo-relative (see state.mjs
// REPO_ROOT_REL) — this just prefixes the "../../" back on.
function repoPath(p) {
  return REPO_ROOT_REL + p;
}

// ---------- the pan/zoom viewer (module-level singleton, mirrors story.mjs's overlay) ----------

let overlay = null;
let stage = null;
let img = null;
let titleEl = null;
let pngLink = null;
let svgLink = null;
let closeBtn = null;
let lastTrigger = null;
let escHandler = null;

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
let scale = 1;
let tx = 0;
let ty = 0;
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragOriginTx = 0;
let dragOriginTy = 0;

function applyTransform() {
  img.style.transform =
    "translate(" + tx + "px, " + ty + "px) scale(" + scale + ")";
}

function resetView() {
  scale = 1;
  tx = 0;
  ty = 0;
  applyTransform();
}

function onWheel(ev) {
  ev.preventDefault();
  const rect = stage.getBoundingClientRect();
  const cx = ev.clientX - rect.left;
  const cy = ev.clientY - rect.top;
  const prevScale = scale;
  const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
  scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
  // Zoom toward the cursor: keep the point under the cursor stationary by
  // solving for the translate that leaves (cx,cy) mapped to the same image
  // point before and after the scale change.
  tx = cx - ((cx - tx) / prevScale) * scale;
  ty = cy - ((cy - ty) / prevScale) * scale;
  applyTransform();
}

function onPointerDown(ev) {
  dragging = true;
  dragStartX = ev.clientX;
  dragStartY = ev.clientY;
  dragOriginTx = tx;
  dragOriginTy = ty;
  stage.setPointerCapture(ev.pointerId);
  stage.style.cursor = "grabbing";
}

function onPointerMove(ev) {
  if (!dragging) return;
  tx = dragOriginTx + (ev.clientX - dragStartX);
  ty = dragOriginTy + (ev.clientY - dragStartY);
  applyTransform();
}

function onPointerUp(ev) {
  dragging = false;
  try {
    stage.releasePointerCapture(ev.pointerId);
  } catch (e) {
    /* already released — ignore */
  }
  stage.style.cursor = "grab";
}

function buildOverlay() {
  overlay = document.createElement("div");
  overlay.className = "story-overlay maps-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Map viewer");

  const header = document.createElement("div");
  header.className = "story-overlay-header";

  titleEl = document.createElement("strong");
  titleEl.className = "maps-overlay-title";
  header.appendChild(titleEl);

  const spacer = document.createElement("div");
  spacer.className = "story-overlay-spacer";
  header.appendChild(spacer);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "story-tab";
  resetBtn.textContent = "Reset view";
  resetBtn.addEventListener("click", resetView);
  header.appendChild(resetBtn);

  svgLink = document.createElement("a");
  svgLink.className = "story-tab";
  svgLink.target = "_blank";
  svgLink.rel = "noopener";
  svgLink.textContent = "Open SVG ↗";
  header.appendChild(svgLink);

  pngLink = document.createElement("a");
  pngLink.className = "story-tab";
  pngLink.target = "_blank";
  pngLink.rel = "noopener";
  pngLink.textContent = "Open PNG ↗";
  header.appendChild(pngLink);

  closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "story-tab";
  closeBtn.textContent = "Exit ✕";
  closeBtn.setAttribute("aria-label", "Close the map viewer");
  closeBtn.addEventListener("click", () => closeMapViewer());
  header.appendChild(closeBtn);

  overlay.appendChild(header);

  stage = document.createElement("div");
  stage.className = "maps-overlay-stage";
  stage.style.cursor = "grab";
  stage.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointercancel", onPointerUp);

  img = document.createElement("img");
  img.className = "maps-overlay-img";
  img.draggable = false;
  stage.appendChild(img);

  overlay.appendChild(stage);
  document.body.appendChild(overlay);
}

// Tab/Shift+Tab trap while the overlay is open — same rationale as
// story.mjs's trapFocus (no <iframe> here, so no partial-trap caveat).
function trapFocus(ev) {
  const focusable = Array.from(overlay.querySelectorAll("button, a[href]"));
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

function openMapViewer(sheet, trigger) {
  if (!overlay) buildOverlay();
  lastTrigger = trigger || null;
  titleEl.textContent = sheet.title;
  const svgSrc = repoPath(sheet.svg);
  img.src = svgSrc;
  img.alt = sheet.title;
  svgLink.href = svgSrc;
  pngLink.href = repoPath(sheet.png);
  resetView();
  if (overlay.hidden) {
    document.body.style.overflow = "hidden";
    overlay.hidden = false;
    escHandler = (ev) => {
      if (ev.key === "Escape") closeMapViewer();
      else if (ev.key === "Tab") trapFocus(ev);
    };
    document.addEventListener("keydown", escHandler);
  }
  closeBtn.focus();
}

function closeMapViewer() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.style.overflow = "";
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
  if (lastTrigger) lastTrigger.focus();
}

// Closing on sidebar navigation, same as story.mjs (see its comment for why
// this goes through a DOM event rather than an import — avoids a cycle
// through sidebar.mjs).
document.addEventListener("storybook:class-change", () => closeMapViewer());

// ---------- the section: grid of sheet cards ----------

export async function mountMaps(main) {
  const sheets = await loadIndex();
  if (sheets.length === 0) return; // degrade silently — same treatment as a missing story-views.json

  // Re-init with the real count now that it's known; mountMapsNav below only
  // had a placeholder of 1 available before this resolved.
  initHealth(MAPS_CLASS, sheets.length);

  const section = document.createElement("section");
  section.className = "kind-section";
  section.id = "section-" + MAPS_CLASS;
  section.dataset.kind = MAPS_CLASS;

  const h2 = document.createElement("h2");
  h2.textContent = "Map Sheets (" + sheets.length + ")";
  section.appendChild(h2);

  const note = document.createElement("p");
  note.className = "empty-state";
  note.style.padding = "0 0 1rem";
  note.style.textAlign = "left";
  note.textContent =
    "World/basin sheets from tools/mapforge/, indexed by maps-index.json — " +
    "kept in parity with the SHEETS registry by tests/maps-index.test.mjs. " +
    "Click a card to open it in the pan/zoom viewer (scroll to zoom, drag to pan).";
  section.appendChild(note);

  const grid = document.createElement("div");
  grid.className = "grid";

  for (const sheet of sheets) {
    const card = document.createElement("div");
    card.className = "card maps-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", "Open " + sheet.title);

    const viewport = document.createElement("div");
    viewport.className = "viewport maps-thumb-viewport";
    const thumb = document.createElement("img");
    thumb.src = repoPath(sheet.svg);
    thumb.alt = sheet.title;
    thumb.loading = "lazy";
    viewport.appendChild(thumb);
    card.appendChild(viewport);

    const meta = document.createElement("div");
    meta.className = "meta";

    const key = document.createElement("p");
    key.className = "key";
    key.textContent = sheet.title;
    meta.appendChild(key);

    if (sheet.note) {
      const noteP = document.createElement("p");
      noteP.className = "filename";
      noteP.textContent = sheet.note;
      meta.appendChild(noteP);
    }

    const pngA = document.createElement("a");
    pngA.className = "story-tab maps-png-link";
    pngA.href = repoPath(sheet.png);
    pngA.target = "_blank";
    pngA.rel = "noopener";
    pngA.textContent = "Open PNG ↗";
    // Don't let the "open PNG" click also open the viewer underneath it.
    pngA.addEventListener("click", (ev) => ev.stopPropagation());
    meta.appendChild(pngA);

    card.appendChild(meta);

    const open = () => openMapViewer(sheet, card);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    });

    grid.appendChild(card);
    bumpHealth(MAPS_CLASS, { ok: 1 });
  }

  section.appendChild(grid);
  main.appendChild(section);
}

/** Sidebar entry for the Maps section. Mirrors mountStoryNav/mountCombatNav. */
export function mountMapsNav(sidebarNav) {
  initHealth(MAPS_CLASS, 1);
  const btn = buildSidebarItem(MAPS_CLASS, 1);
  sidebarNav.appendChild(btn);
  bumpHealth(MAPS_CLASS, { ok: 1 });
  renderSidebarBadge(MAPS_CLASS);
}
