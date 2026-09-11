import { ART_CLASS, artTabState } from "./state.mjs";

// ---------- concept-art tab bar + filter (Task 8) ----------
//
// The art groups above render as one long stacked page once there are
// more than a couple of them. This adds a tab layer *on top of* the
// existing per-group sections built by buildArtGroupSection() — it
// never re-buckets, re-fetches, or touches `health`; it only toggles
// `style.display` on the sections/cards bucketArtEntries() already
// built. Tabs default to the first group; typing in the filter shows
// every group at once (filtered by title/tags), and clearing it
// restores the active tab.

export function buildArtTabBar(tabs) {
  const section = document.createElement("section");
  section.className = "kind-section";
  section.id = "section-" + ART_CLASS;
  section.dataset.kind = ART_CLASS;
  section.dataset.group = ART_CLASS;

  const h2 = document.createElement("h2");
  h2.textContent = "Concept Art";
  section.appendChild(h2);

  const filterRow = document.createElement("div");
  filterRow.className = "art-filter-row";
  const filterInput = document.createElement("input");
  filterInput.type = "search";
  filterInput.className = "art-filter-input";
  filterInput.placeholder = "Filter by title or tag…";
  filterInput.setAttribute("aria-label", "Filter concept art by title or tag");
  filterInput.addEventListener("input", () => {
    artTabState.artFilterText = filterInput.value;
    applyArtTabFilter();
  });
  filterRow.appendChild(filterInput);
  section.appendChild(filterRow);

  const tabRow = document.createElement("div");
  tabRow.className = "art-tabbar-row";
  for (const tab of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "art-tab";
    btn.dataset.artTab = tab.id;
    btn.textContent = tab.label + " (" + tab.count + ")";
    btn.addEventListener("click", () => {
      artTabState.activeArtTab = tab.id;
      filterInput.value = "";
      artTabState.artFilterText = "";
      applyArtTabFilter();
    });
    tabRow.appendChild(btn);
  }
  section.appendChild(tabRow);

  const hint = document.createElement("p");
  hint.className = "art-tabbar-hint";
  hint.textContent =
    "Tabs mirror the art-groups.json registry order. Typing in the filter searches every group's title/tags at once.";
  section.appendChild(hint);

  return section;
}

// F-038: promote on VIEWPORT ENTRY, not on section reveal.
//
// The previous version flipped every card in a newly-visible section from
// loading="lazy" to "eager" in one pass. Because the tab bar defaults to the
// first group (Cast) and applyArtTabFilter() runs at init, that downloaded all
// 9 Cast reference sheets — 1.1-1.5 MB each — before the user had scrolled
// anywhere near them. Measured: 16.39 MB decoded at rest, 15.98 MB of it
// images.
//
// Observing preserves the reason the eager flip existed (a card inside a
// display:none section has no layout box, so its lazy <img> never fetches at
// all) while paying only for cards that actually reach the viewport. Cards in
// a hidden tab still cost nothing — that is the scale win the tab layer is
// for.
const promoter = new IntersectionObserver(
  (entries, obs) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const img = e.target.querySelector("img");
      if (img && img.loading === "lazy") img.loading = "eager";
      obs.unobserve(e.target);
    }
  },
  { rootMargin: "300px" },
);

export function observeCardForPromotion(card) {
  promoter.observe(card);
}

// Applies the active tab + filter text to every already-rendered
// art-group section and card. Pure visibility toggle: health totals
// (set once by initHealth in init()) are never touched here, so the
// aggregate "Concept Art" dot stays the sum of every group's whether
// or not that group is currently hidden by the tab/filter.
export function applyArtTabFilter() {
  const term = artTabState.artFilterText.trim().toLowerCase();
  const filtering = term.length > 0;

  document
    .querySelectorAll("section.kind-section[data-art-group-id]")
    .forEach((sec) => {
      const showGroup =
        filtering || sec.dataset.artGroupId === artTabState.activeArtTab;
      sec.style.display = showGroup ? "" : "none";
      sec.querySelectorAll(".card").forEach((card) => {
        const hay = card.dataset.artSearch || "";
        const showCard = showGroup && (!filtering || hay.includes(term));
        card.style.display = showCard ? "" : "none";
        if (showCard) observeCardForPromotion(card);
      });
      // Classes' race sub-headings (buildArtClassesBody) aren't
      // touched by the card loop above — without this a filter can
      // leave an "Ogre (8)" heading standing over zero visible cards
      // (review finding, Minor). No-op for groups with no race rows.
      sec.querySelectorAll(".art-race-row").forEach((row) => {
        const anyVisible = [...row.querySelectorAll(".card")].some(
          (c) => c.style.display !== "none",
        );
        row.style.display = anyVisible ? "" : "none";
      });
    });

  document.querySelectorAll(".art-tab").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.dataset.artTab === artTabState.activeArtTab,
    );
  });
}
