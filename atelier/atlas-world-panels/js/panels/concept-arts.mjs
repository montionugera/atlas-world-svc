// Game Concept Arts Panel.
// Image-first gallery reading content/concept-art/index.json with hero key-art,
// category & zone grouping, filter chips, search, lightbox, and deep links.

import {
  CATEGORY_LABELS,
  SCHEMA_CATEGORIES,
  buildConceptArtDeepLink,
  extractHeroKeyArt,
  filterConceptArts,
  groupConceptArtsByCategory,
  groupConceptArtsByZone,
  parseConceptArtParams,
  resolveZoneName,
} from "../concept-arts-model.mjs";
import { fetchJson } from "../state.mjs";
import { overlayRoot, register } from "./registry.mjs";

const CONCEPT_INDEX_URL = "/content/concept-art/index.json";
const STUDIO_PERSPECTIVES_URL = "/api/studio/perspectives";

let rootEl = null;
let allItems = [];
let totalCount = null;
let studioNodes = new Map(); // id -> name
let activeLightboxIndex = -1;
let currentFiltered = [];
let keydownHandler = null;

const state = {
  category: "all",
  zone: "all",
  text: "",
  groupBy: "category", // "category" | "zone"
  activeId: null,
};

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function updateParams(patch, opts = {}) {
  if (typeof window.atlasSetParams === "function") {
    window.atlasSetParams(patch, opts);
  } else if (typeof window.history?.pushState === "function") {
    try {
      const url = new URL(window.location.href);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") {
          url.searchParams.delete(k);
        } else {
          url.searchParams.set(k, v);
        }
      }
      if (opts.push) {
        window.history.pushState({}, "", url.toString());
      } else {
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      // Ignore in non-browser or sandbox environments
    }
  }
}

async function loadStudioNodes() {
  try {
    const data = await fetchJson(STUDIO_PERSPECTIVES_URL, "studio-perspectives");
    if (data && typeof data === "object") {
      for (const list of [data.nodes, data.continents, data.districts]) {
        if (Array.isArray(list)) {
          for (const node of list) {
            if (node && node.id) {
              studioNodes.set(node.id, node.name || node.id);
            }
          }
        }
      }
    }
  } catch {
    // If /api/studio/perspectives is unavailable, studio nodes resolve gracefully from zoneId
  }
}

function wireCrossLinks(root) {
  if (!root) return;
  const links = [
    ...root.querySelectorAll(".studio-link"),
    ...root.querySelectorAll(".lore-link"),
    ...root.querySelectorAll(".concept-studio-link"),
  ];
  for (const link of links) {
    link.addEventListener("click", (e) => {
      if (e && typeof e.preventDefault === "function") e.preventDefault();
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      const href = link.getAttribute("href") || link.href || "";
      const qIdx = href.indexOf("?");
      const qs = qIdx >= 0 ? href.slice(qIdx + 1) : href;
      const sp = new URLSearchParams(qs);
      const patch = {};
      for (const [k, v] of sp.entries()) patch[k] = v;
      if (activeLightboxIndex >= 0 || state.activeId) {
        closeLightbox({ updateUrl: false });
      }
      updateParams(patch, { push: true });
      if (patch.tab && typeof window.switchTab === "function" && typeof window.atlasSetParams !== "function") {
        window.switchTab(patch.tab);
      }
    });
  }
}

function closeLightbox({ updateUrl = true } = {}) {
  const overlay = document.getElementById("conceptLightboxOverlay");
  if (overlay) {
    overlay.remove();
  }
  activeLightboxIndex = -1;
  state.activeId = null;
  if (updateUrl) {
    updateParams({ id: null });
  }
  if (keydownHandler) {
    window.removeEventListener("keydown", keydownHandler);
    keydownHandler = null;
  }
}

function openLightbox(item, { updateUrl = true } = {}) {
  if (!item) return;
  const index = currentFiltered.findIndex((it) => it.id === item.id);
  activeLightboxIndex = index >= 0 ? index : 0;
  state.activeId = item.id;
  if (updateUrl) {
    updateParams({ id: item.id }, { push: true });
  }

  let overlay = document.getElementById("conceptLightboxOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "conceptLightboxOverlay";
    overlay.className = "concept-lightbox-overlay";
    overlayRoot().appendChild(overlay);
  }

  renderLightboxContent(overlay, item);

  if (!keydownHandler) {
    keydownHandler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeLightbox();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateLightbox(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateLightbox(1);
      }
    };
    window.addEventListener("keydown", keydownHandler);
  }
}

function navigateLightbox(delta) {
  if (!currentFiltered.length || activeLightboxIndex < 0) return;
  const nextIndex =
    (activeLightboxIndex + delta + currentFiltered.length) % currentFiltered.length;
  activeLightboxIndex = nextIndex;
  const nextItem = currentFiltered[nextIndex];
  state.activeId = nextItem.id;
  updateParams({ id: nextItem.id });
  const overlay = document.getElementById("conceptLightboxOverlay");
  if (overlay) {
    renderLightboxContent(overlay, nextItem);
  }
}

function renderLightboxContent(overlay, item) {
  const zoneName = item.zoneId ? resolveZoneName(item.zoneId, studioNodes) : "";
  const catLabel = CATEGORY_LABELS[item.category] || item.category;

  overlay.innerHTML = `
    <div class="concept-lightbox-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(item.title)}">
      <button type="button" class="concept-lightbox-close" aria-label="Close lightbox">&times;</button>
      ${
        currentFiltered.length > 1
          ? `
        <button type="button" class="concept-lightbox-nav-btn prev" aria-label="Previous image">&#8249;</button>
        <button type="button" class="concept-lightbox-nav-btn next" aria-label="Next image">&#8250;</button>
      `
          : ""
      }
      <div class="concept-lightbox-image-wrap">
        <img src="/content/concept-art/${escapeHtml(item.file)}" alt="${escapeHtml(item.title)}" />
      </div>
      <div class="concept-lightbox-details">
        <div class="concept-lightbox-header">
          <span class="concept-badge ${escapeHtml(item.category)}">${escapeHtml(catLabel)}</span>
          <h3 class="concept-lightbox-title">${escapeHtml(item.title)}</h3>
        </div>
        <p class="concept-lightbox-caption">${escapeHtml(item.caption)}</p>
        <div class="concept-lightbox-links">
          ${
            item.zoneId
              ? `<a href="?tab=studio&node=${encodeURIComponent(item.zoneId)}" class="studio-link" title="Open ${escapeHtml(zoneName)} in World Studio">🏰 ${escapeHtml(zoneName)}</a>`
              : ""
          }
          <a href="?tab=lore${item.loreRef ? "&ref=" + encodeURIComponent(item.loreRef) : ""}" class="lore-link" title="Read in Lore Codex">📜 Lore Codex</a>
        </div>
        <details class="concept-prompt-details">
          <summary>Generation Prompt</summary>
          <div class="concept-prompt-body"><code>${escapeHtml(item.prompt)}</code></div>
        </details>
        <div class="concept-lightbox-meta">
          <span><b>Tool:</b> ${escapeHtml(item.tool || "n/a")}</span>
          <span><b>Rights:</b> ${escapeHtml(item.rights || "concept-reference")}</span>
          <span><b>Verdict:</b> ${escapeHtml(item.verdict || "unreviewed")}</span>
        </div>
      </div>
    </div>
  `;

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeLightbox();
    }
  };

  overlay.querySelector(".concept-lightbox-close")?.addEventListener("click", () => {
    closeLightbox();
  });

  overlay.querySelector(".concept-lightbox-nav-btn.prev")?.addEventListener("click", (e) => {
    e.stopPropagation();
    navigateLightbox(-1);
  });

  overlay.querySelector(".concept-lightbox-nav-btn.next")?.addEventListener("click", (e) => {
    e.stopPropagation();
    navigateLightbox(1);
  });

  wireCrossLinks(overlay);
}

function renderGallery() {
  if (!rootEl) return;
  const container = rootEl.querySelector(".concept-arts-container");
  if (!container) return;

  const galleryEl = container.querySelector(".concept-gallery-stage");
  if (!galleryEl) return;

  currentFiltered = filterConceptArts(allItems, {
    category: state.category,
    zone: state.zone,
    text: state.text,
    studioNodes,
  });

  const countBadge = container.querySelector(".concept-shown-count");
  if (countBadge) {
    countBadge.textContent = `${currentFiltered.length} of ${allItems.length} pieces shown`;
  }

  if (currentFiltered.length === 0) {
    galleryEl.innerHTML = `<div class="empty-state">No concept arts match the current filters.</div>`;
    return;
  }

  galleryEl.innerHTML = "";

  if (state.groupBy === "zone") {
    const zoneGroups = groupConceptArtsByZone(currentFiltered, (id) =>
      resolveZoneName(id, studioNodes),
    );
    for (const grp of zoneGroups) {
      const section = document.createElement("section");
      section.className = "concept-group";
      const studioLinkHtml = grp.zoneId
        ? `<a href="?tab=studio&node=${encodeURIComponent(grp.zoneId)}" class="concept-studio-link">View in Studio &rarr;</a>`
        : "";
      section.innerHTML = `
        <div class="concept-group-header">
          <h3 class="concept-group-title">${escapeHtml(grp.zoneName)}</h3>
          <span class="concept-group-count">${grp.items.length} piece${grp.items.length === 1 ? "" : "s"}</span>
          ${studioLinkHtml}
        </div>
        <div class="concept-grid"></div>
      `;
      const grid = section.querySelector(".concept-grid");
      for (const item of grp.items) {
        grid.appendChild(buildCard(item));
      }
      wireCrossLinks(section);
      galleryEl.appendChild(section);
    }
  } else {
    // Default: Group by Category
    const catGroups = groupConceptArtsByCategory(currentFiltered);
    for (const grp of catGroups) {
      const section = document.createElement("section");
      section.className = "concept-group";
      section.innerHTML = `
        <div class="concept-group-header">
          <h3 class="concept-group-title">${escapeHtml(grp.label)}</h3>
          <span class="concept-group-count">${grp.items.length} piece${grp.items.length === 1 ? "" : "s"}</span>
        </div>
        <div class="concept-grid"></div>
      `;
      const grid = section.querySelector(".concept-grid");
      for (const item of grp.items) {
        grid.appendChild(buildCard(item));
      }
      wireCrossLinks(section);
      galleryEl.appendChild(section);
    }
  }
}

function buildCard(item) {
  const card = document.createElement("div");
  card.className = "concept-card";
  card.dataset.category = item.category;
  card.dataset.id = item.id;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", item.title);

  const zoneName = item.zoneId ? resolveZoneName(item.zoneId, studioNodes) : "";
  const catLabel = CATEGORY_LABELS[item.category] || item.category;

  card.innerHTML = `
    <div class="concept-card-thumb-wrap">
      <img loading="lazy" src="/content/concept-art/${escapeHtml(item.thumb)}" alt="${escapeHtml(item.title)}" />
    </div>
    <div class="concept-card-body">
      <div class="concept-card-top">
        <span class="concept-badge ${escapeHtml(item.category)}">${escapeHtml(catLabel)}</span>
        ${zoneName ? `<span class="concept-card-zone" title="${escapeHtml(zoneName)}">📍 ${escapeHtml(zoneName)}</span>` : ""}
      </div>
      <h4 class="concept-card-title">${escapeHtml(item.title)}</h4>
      <p class="concept-card-caption">${escapeHtml(item.caption)}</p>
    </div>
  `;

  // Any portrait image (a character or a design sheet) shows whole, not cropped.
  const thumb = card.querySelector("img");
  const markShape = () => {
    if (thumb.naturalHeight > thumb.naturalWidth) card.dataset.shape = "portrait";
  };
  if (thumb.complete) markShape();
  else thumb.addEventListener("load", markShape);

  card.addEventListener("click", () => {
    openLightbox(item);
  });
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openLightbox(item);
    }
  });

  return card;
}

function buildHero(heroItem) {
  if (!heroItem) return null;
  const hero = document.createElement("section");
  hero.className = "concept-hero";
  hero.dataset.heroId = heroItem.id;

  const zoneName = heroItem.zoneId ? resolveZoneName(heroItem.zoneId, studioNodes) : "";

  hero.innerHTML = `
    <div class="concept-hero-media">
      <img src="/content/concept-art/${escapeHtml(heroItem.file)}" alt="${escapeHtml(heroItem.title)}" />
    </div>
    <div class="concept-hero-body">
      <span class="concept-hero-badge">🌟 Key Art</span>
      <h2 class="concept-hero-title">${escapeHtml(heroItem.title)}</h2>
      <p class="concept-hero-caption">${escapeHtml(heroItem.caption)}</p>
      <div class="concept-lightbox-links">
        ${
          heroItem.zoneId
            ? `<a href="?tab=studio&node=${encodeURIComponent(heroItem.zoneId)}" class="studio-link" onclick="event.stopPropagation()">🏰 ${escapeHtml(zoneName)}</a>`
            : ""
        }
        <a href="?tab=lore${heroItem.loreRef ? "&ref=" + encodeURIComponent(heroItem.loreRef) : ""}" class="lore-link" onclick="event.stopPropagation()">📜 Lore Codex</a>
      </div>
    </div>
  `;

  hero.addEventListener("click", () => {
    openLightbox(heroItem);
  });
  wireCrossLinks(hero);
  return hero;
}

function renderUI() {
  if (!rootEl) return;

  if (allItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.dataset.conceptEmpty = "1";
    empty.textContent =
      "No concept art generated yet. Concept art items added to content/concept-art/index.json will appear here.";
    rootEl.replaceChildren(empty);
    return;
  }

  const container = document.createElement("div");
  container.className = "concept-arts-container";

  // 1. Hero key-art
  const heroItem = extractHeroKeyArt(allItems);
  if (heroItem) {
    const heroEl = buildHero(heroItem);
    if (heroEl) container.appendChild(heroEl);
  }

  // 2. Toolbar (Search, Filter chips, Grouping, Zone select)
  const toolbar = document.createElement("div");
  toolbar.className = "concept-toolbar";

  // Category counts
  const catCounts = { all: allItems.length };
  for (const c of SCHEMA_CATEGORIES) catCounts[c] = 0;
  for (const it of allItems) {
    if (catCounts[it.category] !== undefined) catCounts[it.category]++;
  }

  // Distinct zones
  const zoneSet = new Set();
  for (const it of allItems) {
    if (it.zoneId) zoneSet.add(it.zoneId);
  }

  toolbar.innerHTML = `
    <div class="concept-toolbar-row">
      <input type="search" class="concept-search-input" placeholder="Search concept arts (title, zone, prompt, tags)…" aria-label="Search concept arts" value="${escapeHtml(state.text)}" />
      <select class="concept-select concept-zone-select" aria-label="Filter by zone">
        <option value="all">All Zones</option>
        ${Array.from(zoneSet)
          .sort((a, b) => resolveZoneName(a, studioNodes).localeCompare(resolveZoneName(b, studioNodes)))
          .map(
            (zid) =>
              `<option value="${escapeHtml(zid)}" ${state.zone === zid ? "selected" : ""}>${escapeHtml(resolveZoneName(zid, studioNodes))}</option>`,
          )
          .join("")}
      </select>
      <div class="subview-bar" role="group" aria-label="Grouping mode">
        <button type="button" class="joy-button joy-button--sm ${state.groupBy === "category" ? "joy-button--solid" : "joy-button--outline"}" data-groupby="category">By Category</button>
        <button type="button" class="joy-button joy-button--sm ${state.groupBy === "zone" ? "joy-button--solid" : "joy-button--outline"}" data-groupby="zone">By Zone</button>
      </div>
      <span class="concept-shown-count stat" style="margin-left:auto;font-size:0.78rem;color:var(--text-dim)"></span>
    </div>
    <div class="concept-chips" role="radiogroup" aria-label="Filter by category">
      <button type="button" class="concept-chip ${state.category === "all" ? "active" : ""}" data-category="all">
        All <span class="concept-chip-count">${catCounts.all}</span>
      </button>
      ${SCHEMA_CATEGORIES.map((cat) => {
        const count = catCounts[cat] || 0;
        if (count === 0) return "";
        const label = CATEGORY_LABELS[cat] || cat;
        return `
          <button type="button" class="concept-chip ${state.category === cat ? "active" : ""}" data-category="${escapeHtml(cat)}">
            ${escapeHtml(label)} <span class="concept-chip-count">${count}</span>
          </button>
        `;
      }).join("")}
    </div>
  `;

  // Toolbar event listeners
  const searchInput = toolbar.querySelector(".concept-search-input");
  searchInput?.addEventListener("input", (e) => {
    state.text = e.target.value;
    updateParams({ search: state.text || null }, { push: false });
    renderGallery();
  });

  const zoneSelect = toolbar.querySelector(".concept-zone-select");
  zoneSelect?.addEventListener("change", (e) => {
    state.zone = e.target.value;
    updateParams({ zone: state.zone !== "all" ? state.zone : null });
    renderGallery();
  });

  const groupButtons = toolbar.querySelectorAll("[data-groupby]");
  for (const btn of groupButtons) {
    btn.addEventListener("click", () => {
      state.groupBy = btn.dataset.groupby;
      for (const b of groupButtons) {
        b.classList.toggle("joy-button--solid", b === btn);
        b.classList.toggle("joy-button--outline", b !== btn);
      }
      renderGallery();
    });
  }

  const chips = toolbar.querySelectorAll(".concept-chip");
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      state.category = chip.dataset.category;
      for (const c of chips) c.classList.toggle("active", c === chip);
      updateParams({ category: state.category !== "all" ? state.category : null });
      renderGallery();
    });
  }

  container.appendChild(toolbar);

  // 3. Gallery stage
  const galleryStage = document.createElement("div");
  galleryStage.className = "concept-gallery-stage";
  container.appendChild(galleryStage);

  rootEl.replaceChildren(container);
  renderGallery();

  // If initial activeId was passed in params, open lightbox without pushing duplicate URL history
  if (state.activeId) {
    const item = allItems.find((it) => it.id === state.activeId);
    if (item) openLightbox(item, { updateUrl: false });
  }
}

register("concept-arts", {
  async mount(el, params = {}) {
    rootEl = el;
    const loading = document.createElement("p");
    loading.className = "empty-state";
    loading.textContent = "Loading Game Concept Arts…";
    el.replaceChildren(loading);

    try {
      await loadStudioNodes();
      const doc = await fetchJson(CONCEPT_INDEX_URL, "concept-arts-index");
      allItems = doc && Array.isArray(doc.items) ? doc.items : [];
      totalCount = allItems.length;

      // Apply initial params
      const parsed = parseConceptArtParams(params);
      state.category = parsed.category || "all";
      state.zone = parsed.zone || "all";
      state.activeId = parsed.id || null;
      state.text = parsed.search || "";

      renderUI();
    } catch (err) {
      console.error("[concept-arts] failed to load:", err);
      const banner = document.createElement("div");
      banner.className = "empty-state error-banner";
      banner.dataset.conceptError = "1";
      banner.textContent =
        "Failed to load Game Concept Arts: " +
        (err && err.message ? err.message : String(err));
      el.replaceChildren(banner);
    }
  },

  show(params = {}) {
    if (!rootEl || !allItems.length) return;
    const parsed = parseConceptArtParams(params);
    const nextCategory = parsed.category || "all";
    const nextZone = parsed.zone || "all";
    const nextText = parsed.search || "";
    const nextId = parsed.id || null;

    let changed = false;
    if (nextCategory !== state.category) {
      state.category = nextCategory;
      changed = true;
    }
    if (nextZone !== state.zone) {
      state.zone = nextZone;
      changed = true;
    }
    if (nextText !== state.text) {
      state.text = nextText;
      changed = true;
    }

    if (!nextId && (activeLightboxIndex >= 0 || state.activeId)) {
      closeLightbox({ updateUrl: false });
    }
    state.activeId = nextId;

    if (changed) {
      renderUI();
    } else if (nextId) {
      const target = allItems.find((it) => it.id === nextId);
      if (target && activeLightboxIndex < 0) {
        openLightbox(target, { updateUrl: false });
      }
    }
  },

  hide() {
    closeLightbox({ updateUrl: false });
  },

  count() {
    return totalCount;
  },
});
