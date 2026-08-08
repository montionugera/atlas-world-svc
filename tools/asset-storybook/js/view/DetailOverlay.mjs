// The one live renderer in the whole page (F-038).
//
// Cards are baked thumbnails; the moment you actually want to interrogate an
// asset — orbit it, step its animation clips, read its metadata — that happens
// here, in a full-bleed overlay that mounts ONE renderer and disposes it on
// close. 643 <model-viewer> elements become 1.
//
// Disposal order matters: removeAttribute("src") before remove(), or
// model-viewer holds its GPU resources until GC gets round to it.
//
// Arrow keys step through the current filtered list without leaving the
// overlay. On a 742-item review that is the difference between a pass you
// finish and one you abandon.

import { renderEntry } from "../renderers.mjs";

let state = null;

function disposeViewport(root) {
  for (const mv of root.querySelectorAll("model-viewer")) {
    try {
      mv.pause();
    } catch (e) {
      /* not loaded yet — nothing to pause */
    }
    mv.removeAttribute("src");
    mv.remove();
  }
  root.innerHTML = "";
}

function ensureOverlay() {
  let el = document.getElementById("detail-overlay");
  if (el) return el;

  el = document.createElement("div");
  el.id = "detail-overlay";
  el.className = "detail-overlay";
  el.hidden = true;
  el.innerHTML = `
    <div class="detail-backdrop" data-close="1"></div>
    <div class="detail-panel" role="dialog" aria-modal="true" aria-label="Asset detail">
      <div class="detail-head">
        <div>
          <p class="detail-key"></p>
          <p class="detail-sub"></p>
        </div>
        <div class="detail-nav">
          <button type="button" class="detail-btn" data-nav="-1" aria-label="Previous asset">←</button>
          <span class="detail-pos"></span>
          <button type="button" class="detail-btn" data-nav="1" aria-label="Next asset">→</button>
          <button type="button" class="detail-btn detail-close" data-close="1" aria-label="Close">✕</button>
        </div>
      </div>
      <div class="detail-stage"></div>
      <div class="detail-meta"></div>
    </div>`;
  document.body.appendChild(el);

  el.addEventListener("click", (e) => {
    if (e.target.dataset && e.target.dataset.close) closeDetail();
    const nav = e.target.dataset && e.target.dataset.nav;
    if (nav) step(Number(nav));
  });

  document.addEventListener("keydown", (e) => {
    if (!state) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeDetail();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    }
  });

  return el;
}

function step(delta) {
  if (!state) return;
  const next = state.index + delta;
  if (next < 0 || next >= state.items.length) return;
  openDetail({ items: state.items, index: next, renderSpec: state.renderSpec });
}

export function openDetail({ items, index, renderSpec }) {
  const el = ensureOverlay();
  const [key, entry] = items[index];
  state = { items, index, renderSpec };

  const stage = el.querySelector(".detail-stage");
  disposeViewport(stage); // tear the previous one down before mounting the next

  el.querySelector(".detail-key").textContent = key;
  el.querySelector(".detail-sub").textContent = [
    entry.kind,
    entry.tier,
    entry.license,
  ]
    .filter(Boolean)
    .join(" · ");
  el.querySelector(".detail-pos").textContent =
    index + 1 + " / " + items.length;

  // renderEntry() returns the full card; we only want its live viewport, so
  // the existing per-render-type builders are reused untouched. `null` as the
  // health key keeps overlay mounts out of the health totals — those are owned
  // by the thumbnail preload.
  const card = renderEntry(key, entry, renderSpec, null);
  const viewport = card.querySelector(".viewport");
  if (viewport) stage.appendChild(viewport);

  const meta = el.querySelector(".detail-meta");
  meta.innerHTML = "";
  const dl = document.createElement("dl");
  for (const [k, v] of Object.entries(entry)) {
    if (v === null || v === undefined || typeof v === "object") continue;
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = String(v);
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  meta.appendChild(dl);

  el.hidden = false;
  document.body.style.overflow = "hidden";
  el.querySelector(".detail-close").focus();
}

export function closeDetail() {
  const el = document.getElementById("detail-overlay");
  if (!el) return;
  disposeViewport(el.querySelector(".detail-stage"));
  el.hidden = true;
  document.body.style.overflow = "";
  state = null;
}

export function isDetailOpen() {
  return state !== null;
}
