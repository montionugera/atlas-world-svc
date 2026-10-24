// Concept Art panel — SSOT merge W1-B.
//
// Wraps the existing concept-art modules (art.mjs buckets + group sections,
// art-tabs.mjs tab bar / filter) unchanged in behaviour. main.mjs used to do the
// two fetches and the bucketing for them; this panel owns that, plus an "All" tab
// and the `group` URL param (?tab=art&group=town, `art:town` accepted too).
import {
  ART_CLASS,
  ART_GROUPS_FALLBACK,
  ART_GROUPS_URL,
  ART_GROUP_LABELS,
  ART_MANIFEST_URL,
  artTabState,
  fetchJson,
} from "../state.mjs";
import { bucketArtEntries, buildArtGroupSection } from "../art.mjs";
import {
  ART_ALL_TAB,
  applyArtTabFilter,
  buildArtTabBar,
} from "../art-tabs.mjs";
import { register } from "./registry.mjs";

let root = null;
let total = null; // number of concept-art pieces once mounted
let tabIds = []; // selectable tab ids, "all" first

function note(text, cls = "empty-state") {
  const p = document.createElement("p");
  p.className = cls;
  p.textContent = text;
  return p;
}

// "art:town" and "town" both name the town group; anything unknown is not a tab.
function normalizeGroup(raw) {
  const g = String(raw || "").replace(/^art:/, "");
  return tabIds.includes(g) ? g : null;
}

function selectTab(id) {
  artTabState.activeArtTab = id;
  artTabState.artFilterText = "";
  const input = root.querySelector(".art-filter-input");
  if (input) input.value = "";
  applyArtTabFilter(root);
}

register("art", {
  async mount(el) {
    root = el;
    el.replaceChildren(note("Loading concept art…"));
    const manifest = await fetchJson(ART_MANIFEST_URL, "art-manifest");
    // The group registry only orders/labels sections; without it, fall back to
    // cast/race/class and say so rather than failing the panel.
    let groups = null;
    let groupsNote = null;
    try {
      groups = await fetchJson(ART_GROUPS_URL, "art-groups");
    } catch (err) {
      console.warn("[art panel] art-groups.json unavailable:", err);
      groupsNote =
        "art-groups.json unavailable (" +
        (err && err.message ? err.message : err) +
        ") — showing the default cast / race / class order.";
    }

    const entries = (manifest && manifest.entries) || {};
    const { order, buckets, unregistered } = bucketArtEntries(entries, groups);
    const lists = [];
    for (const g of order) {
      const list = buckets.get(g.id);
      if (!list || list.length === 0) continue; // empty groups get no tab, by design
      ART_GROUP_LABELS.set(g.id, g.label || g.id);
      lists.push({ id: g.id, label: g.label || g.id, list });
    }
    for (const [gid, list] of [...unregistered].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      ART_GROUP_LABELS.set(gid, gid);
      lists.push({ id: gid, label: gid, list });
    }

    total = lists.reduce((n, g) => n + g.list.length, 0);
    if (total === 0) {
      el.replaceChildren(
        note("No concept art in art-manifest.json (no entries with a file)."),
      );
      tabIds = [];
      return;
    }

    tabIds = [ART_ALL_TAB, ...lists.map((g) => g.id)];
    const tabs = [
      { id: ART_ALL_TAB, label: "All", count: total },
      ...lists.map((g) => ({ id: g.id, label: g.label, count: g.list.length })),
    ];
    const bar = buildArtTabBar(tabs, {
      onSelect(id) {
        if (window.atlasSetParams)
          window.atlasSetParams({ group: id }, { push: true });
      },
    });
    if (groupsNote) bar.appendChild(note(groupsNote, "art-tabbar-hint"));

    el.replaceChildren(
      bar,
      ...lists.map((g) => buildArtGroupSection(g.id, g.label, g.list)),
    );
    // Default like the storybook: first group, not All, so a bare ?tab=art does
    // not start 106 image fetches (F-038). Deep links override in show().
    artTabState.activeArtTab = lists[0].id;
    artTabState.artFilterText = "";
    applyArtTabFilter(root);
  },
  show(params) {
    if (!tabIds.length) return;
    const wanted = params && params.group ? normalizeGroup(params.group) : null;
    if (wanted && wanted !== artTabState.activeArtTab) selectTab(wanted);
    // An unknown group is left on the current tab; the URL keeps naming it, so
    // tell the user instead of silently ignoring it.
    const bad = params && params.group && !wanted;
    let warn = root.querySelector("[data-art-unknown-group]");
    if (bad) {
      if (!warn) {
        warn = note("", "art-tabbar-hint");
        warn.dataset.artUnknownGroup = "1";
        root.querySelector("section.kind-section")?.appendChild(warn);
      }
      warn.textContent =
        "Unknown concept-art group “" +
        params.group +
        "” — showing the current tab.";
    } else if (warn) {
      warn.remove();
    }
  },
  count() {
    return total;
  },
});
