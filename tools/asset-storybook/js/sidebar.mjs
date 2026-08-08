import {
  ART_CLASS,
  SFX_CLASS,
  MUSIC_CLASS,
  COVERAGE_CLASS,
  COMBAT_CLASS,
  STORY_CLASS,
  ART_GROUP_LABELS,
  artTabState,
} from "./state.mjs";
import { applyArtTabFilter, eagerLoadCard } from "./art-tabs.mjs";
import { resolveRender } from "./renderers.mjs";

// ---------- sidebar ----------

// Sections are grouped by resolved render-type (image, __unknown, ...),
// except model3d: commit 2191257 added vfx scenes (weapon glTFs + zone
// discs, kind: "vfx") that render through the same <model-viewer>
// builder as characters (kind: "character"). Grouping by render-type
// alone would lump all 19 model3d entries into one "Characters"
// section and hide the vfx set, so groupKeyFor() below further splits
// model3d by manifest `kind` into "model3d:character" / "model3d:vfx"
// — labeled here. Every other render-type still maps 1:1, so this
// stays a small lookup + generic fallback, not a per-asset-key list.
const RENDER_LABELS = {
  model3d: "Characters",
  "model3d:character": "Characters",
  "model3d:vfx": "VFX",
  "model3d:creature": "Creatures",
  "model3d:environment": "Environment",
  "model3d:weapon": "Weapons",
  "model3d:loot": "Loot & Items",
  image: "Icons",
  spritesheet: "Sprites",
  ninepatch: "UI Kits",
  tileset: "Tilesets",
  theme: "Themes",
  __unknown: "Unknown",
};

export function classLabel(cls) {
  if (cls === "all") return "All";
  if (cls === SFX_CLASS) return "SFX";
  if (cls === MUSIC_CLASS) return "Music";
  if (cls === ART_CLASS) return "Concept Art";
  if (cls === COVERAGE_CLASS) return "Coverage";
  if (cls === COMBAT_CLASS) return "Combat";
  if (cls === STORY_CLASS) return "Story";
  if (cls.startsWith(ART_CLASS + ":")) {
    const gid = cls.slice(ART_CLASS.length + 1);
    return ART_GROUP_LABELS.get(gid) || gid + " (unregistered)";
  }
  if (RENDER_LABELS[cls]) return RENDER_LABELS[cls];
  return cls.charAt(0).toUpperCase() + cls.slice(1) + "s";
}

function setActiveClass(cls) {
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
        eagerLoadCard(card);
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

// model3d covers both true characters and vfx scenes since both share
// the <model-viewer> renderer — split the group key by manifest `kind`
// so vfx entries get their own nav section/count instead of being
// folded into "Characters" (§ RENDER_LABELS comment above). Every
// other render-type is unaffected and still groups 1:1.
function groupKeyFor(entry, spec) {
  const render = resolveRender(entry, spec);
  if (render === "model3d" && entry.kind) return render + ":" + entry.kind;
  return render;
}

export function groupByRender(entries, spec) {
  const groups = new Map();
  for (const [key, entry] of entries) {
    const groupKey = groupKeyFor(entry, spec);
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push([key, entry]);
  }
  return groups;
}
