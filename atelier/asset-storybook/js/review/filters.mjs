// Verdict filters (F-038 Task 18).
//
// These slice the SAME item set by review state rather than by kind. Filtering
// re-windows each VirtualGrid via setItems() instead of hiding DOM — the point
// of virtualization is that a filter over 653 items stays instant, and hidden
// DOM would defeat it.
//
// On a 742-item catalog "show me what I have not looked at yet" is what makes
// the review finishable at all.

import { REJECTED_CLASS, REBUILD_CLASS, UNREVIEWED_CLASS } from "../state.mjs";
import { buildSidebarItem, classLabel } from "../sidebar.mjs";
import { getStore } from "./ui.mjs";

export function mountVerdictFilters({
  sidebarNav,
  groups,
  gridsBySection,
  totalItems,
}) {
  // --- verdict filters (Task 18). These slice the SAME item set by review
  //     state rather than by kind, so filtering re-windows the grids instead
  //     of hiding DOM — the point of virtualization is that a filter on 653
  //     items stays instant. ---
  const allItems = { length: totalItems };
  const sectionGrids = new Map(gridsBySection);

  function applyVerdictFilter(cls) {
    const store = getStore();
    if (!store) return;
    const keep = (key) => {
      const rec = store.get(key);
      if (cls === REJECTED_CLASS) return rec?.verdict === "reject";
      if (cls === REBUILD_CLASS) return rec?.verdict === "rebuild";
      if (cls === UNREVIEWED_CLASS) return !rec;
      return true;
    };
    for (const [groupKey, grid] of sectionGrids) {
      const list = groups.get(groupKey).filter(([key]) => keep(key));
      grid.setItems(list);
      const sec = document.getElementById("section-" + groupKey);
      if (sec) {
        sec.style.display = list.length === 0 ? "none" : "";
        const h2 = sec.querySelector("h2");
        if (h2)
          h2.textContent = classLabel(groupKey) + " (" + list.length + ")";
      }
    }
  }

  function clearVerdictFilter() {
    for (const [groupKey, grid] of sectionGrids) {
      const list = groups.get(groupKey);
      grid.setItems(list);
      const sec = document.getElementById("section-" + groupKey);
      if (sec) {
        const h2 = sec.querySelector("h2");
        if (h2)
          h2.textContent = classLabel(groupKey) + " (" + list.length + ")";
      }
    }
  }

  function refreshVerdictNav() {
    const store = getStore();
    if (!store) return;
    const c = store.counts();
    const reviewed = store.allKeys().length;
    const totals = {
      [REJECTED_CLASS]: c.reject,
      [REBUILD_CLASS]: c.rebuild,
      [UNREVIEWED_CLASS]: allItems.length - reviewed,
    };
    for (const [cls, n] of Object.entries(totals)) {
      const btn = document.querySelector(
        '.sidebar-item[data-class="' + cls + '"] .count',
      );
      if (btn) btn.textContent = n;
    }
  }

  for (const cls of [REJECTED_CLASS, REBUILD_CLASS, UNREVIEWED_CLASS]) {
    const btn = buildSidebarItem(cls, 0);
    // A verdict filter is a view over the same assets, not an asset class, so
    // it has no health of its own. Leaving the dot in place would strand three
    // permanent "loading…" indicators that can never resolve.
    btn.querySelector(".health-dot")?.remove();
    btn.addEventListener("click", () => applyVerdictFilter(cls));
    sidebarNav.appendChild(btn);
  }
  // "All" must also drop any active verdict filter, or the page stays
  // filtered while claiming to show everything.
  document.addEventListener("storybook:class-change", (e) => {
    if (e.detail && e.detail.cls === "all") clearVerdictFilter();
  });
  document.addEventListener("storybook:verdict-change", refreshVerdictNav);
  refreshVerdictNav();
}
