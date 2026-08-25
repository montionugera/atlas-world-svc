import {
  ART_CLASS,
  SFX_CLASS,
  MUSIC_CLASS,
  COVERAGE_CLASS,
  COMBAT_CLASS,
  STORY_CLASS,
  FORGE_CLASS,
  REJECTED_CLASS,
  REBUILD_CLASS,
  UNREVIEWED_CLASS,
  ART_GROUP_LABELS,
  artTabState,
  taxonomyState,
} from "./state.mjs";
import { applyArtTabFilter, observeCardForPromotion } from "./art-tabs.mjs";
import { labelForSection } from "./data/taxonomy.mjs";

// ---------- sidebar ----------

// Asset sections are named by content/asset-taxonomy.json (see
// js/data/taxonomy.mjs), NOT by a lookup table here. The previous
// RENDER_LABELS map keyed sections by resolved render-type plus a
// "model3d:<kind>" split, and fell through to a generic
// capitalize-and-append-s branch on a miss — which is how 283 dungeon
// assets came to sit under a heading reading "Model3d:dungeons (283)".
// A miss was indistinguishable from a hit. Now a kind with no registry
// entry lands in UNTAXONOMIZED and guard (T) fails the build.
//
// The synthetic classes below (sfx/music/art/coverage/combat/story) are not
// manifest kinds and keep their hardcoded labels.

export function classLabel(cls) {
  if (cls === "all") return "All";
  if (cls === SFX_CLASS) return "SFX";
  if (cls === MUSIC_CLASS) return "Music";
  if (cls === ART_CLASS) return "Concept Art";
  if (cls === COVERAGE_CLASS) return "Coverage";
  if (cls === COMBAT_CLASS) return "Combat";
  if (cls === STORY_CLASS) return "Story";
  if (cls === FORGE_CLASS) return "Forge";
  if (cls === REJECTED_CLASS) return "Rejected";
  if (cls === REBUILD_CLASS) return "Needs rebuild";
  if (cls === UNREVIEWED_CLASS) return "Unreviewed";
  if (cls.startsWith(ART_CLASS + ":")) {
    const gid = cls.slice(ART_CLASS.length + 1);
    return ART_GROUP_LABELS.get(gid) || gid + " (unregistered)";
  }
  return labelForSection(cls, taxonomyState.taxonomy);
}

function setActiveClass(cls) {
  // I-085: lets the story overlay close itself on sidebar navigation without
  // sidebar.mjs importing story.mjs (story.mjs already imports from here — the
  // reverse import would be a cycle).
  document.dispatchEvent(
    new CustomEvent("storybook:class-change", { detail: { cls } }),
  );
  document.querySelectorAll(".sidebar-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.class === cls);
  });
  document.querySelectorAll("section.kind-section").forEach((sec) => {
    const show =
      cls === "all" || sec.dataset.kind === cls || sec.dataset.group === cls;
    sec.style.display = show ? "" : "none";
  });
  // Task 8: "all" and the aggregate "Concept Art" class both just made
  // every art-group section visible above (data-group match) — re-run
  // the tab/filter layer so switching back into the art region shows
  // only the active tab instead of every group at once again.
  if (cls === "all" || cls === ART_CLASS) {
    applyArtTabFilter();
  } else if (cls.startsWith(ART_CLASS + ":")) {
    // Review finding #2: the legacy per-group sidebar item (e.g.
    // "art:race") isolates its section directly via the `show` loop
    // above and never goes through applyArtTabFilter — so a filter
    // typed earlier left this section's cards exactly as the filter
    // last set them (mostly hidden), while the filter <input> itself
    // is now inside a hidden section (no visible control explaining
    // why). Clear the filter and force every card in the one section
    // `show` just made visible back on, so jumping to a single group
    // this way always shows that whole group, unconditionally.
    artTabState.artFilterText = "";
    const filterInput = document.querySelector(".art-filter-input");
    if (filterInput) filterInput.value = "";
    const sec = document.getElementById("section-" + cls);
    if (sec) {
      sec.querySelectorAll(".card").forEach((card) => {
        card.style.display = "";
        observeCardForPromotion(card);
      });
      sec.querySelectorAll(".art-race-row").forEach((row) => {
        row.style.display = "";
      });
    }
    // Keep the tab bar's own highlight in sync so returning to
    // "Concept Art" afterward resumes on the group just isolated here
    // instead of a stale earlier tab.
    artTabState.activeArtTab = cls.slice(ART_CLASS.length + 1);
    document.querySelectorAll(".art-tab").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.dataset.artTab === artTabState.activeArtTab,
      );
    });
  }
}

export function buildSidebarItem(cls, total) {
  const btn = document.createElement("button");
  btn.className = "sidebar-item";
  btn.dataset.class = cls;

  const dot = document.createElement("span");
  dot.className = "health-dot";
  dot.title = "loading…";

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = classLabel(cls);

  const count = document.createElement("span");
  count.className = "count";
  count.textContent = total;

  btn.appendChild(dot);
  btn.appendChild(label);
  btn.appendChild(count);

  btn.addEventListener("click", () => {
    setActiveClass(cls);
    if (cls !== "all") {
      // An aggregate class (e.g. "art") has no "section-<cls>" of its
      // own — it fans out over several sections via data-group
      // instead (see setActiveClass). Fall back to the first one
      // setActiveClass just made visible so the button still scrolls
      // somewhere.
      const target =
        document.getElementById("section-" + cls) ||
        [...document.querySelectorAll("section.kind-section")].find(
          (sec) => sec.dataset.group === cls && sec.style.display !== "none",
        );
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  return btn;
}

// groupKeyFor/groupByRender removed in F-038 — grouping now lives in
// js/data/taxonomy.mjs groupEntries(), keyed by manifest `kind` through
// content/asset-taxonomy.json rather than by resolved render-type with a
// "model3d:<kind>" special case. That old scheme is what produced the
// "Model3d:dungeons" heading; it is also why grouping and labelling could
// disagree, since one derived keys and the other looked them up.
