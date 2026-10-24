// Free-text + tag filter for the assets panel.
//
// matchesFilter() is pure (covered by tests/filter-bar.test.mjs); buildFilterBar()
// is the DOM half. Tag groups are derived from the data and a group with a single
// value is dropped — a chip row that can only ever say "CC0" filters nothing.

const TAG_FIELDS = [
  { id: "tier", label: "Tier" },
  { id: "license", label: "License" },
]; // `source` is free text (URLs) — searchable, but not worth a chip
const TEXT_FIELDS = ["kind", "tier", "license", "source", "author", "label"];

function basename(p) {
  return String(p || "")
    .split("/")
    .pop();
}

/**
 * @param {string} key
 * @param {object} entry
 * @param {{ text?: string, tags?: Record<string,string|null> }} filter
 */
export function matchesFilter(key, entry, filter) {
  const tags = (filter && filter.tags) || {};
  for (const [field, want] of Object.entries(tags)) {
    if (want && String(entry[field]) !== want) return false;
  }
  const terms = String((filter && filter.text) || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return true;
  const hay = [
    key,
    basename(entry.scene ?? entry.stream),
    ...TEXT_FIELDS.map((f) => entry[f]),
  ]
    .filter((v) => v !== undefined && v !== null)
    .join(" ")
    .toLowerCase();
  return terms.every((t) => hay.includes(t));
}

/** Tag groups worth showing: [{id,label,values:[[value,count]…]}], ≥2 distinct values only. */
export function tagGroupsFor(entries) {
  const groups = [];
  for (const { id, label } of TAG_FIELDS) {
    const counts = new Map();
    for (const [, entry] of entries) {
      if (entry[id] === undefined || entry[id] === null) continue;
      const v = String(entry[id]);
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    if (counts.size >= 2) {
      groups.push({
        id,
        label,
        values: [...counts].sort((a, b) => b[1] - a[1]),
      });
    }
  }
  return groups;
}

/**
 * @param {object} opts
 * @param {Array} opts.entries        every [key, entry] (tag groups are derived from these)
 * @param {(filter:{text:string,tags:Record<string,string|null>})=>void} opts.onChange
 * @returns {{ el: HTMLElement, state: {text:string,tags:object}, reset: ()=>void }}
 */
export function buildFilterBar({ entries, onChange }) {
  const state = { text: "", tags: {} };
  const el = document.createElement("div");
  el.className = "art-filter-row assets-filter-bar";
  el.style.flexWrap = "wrap";

  const input = document.createElement("input");
  input.type = "search";
  input.className = "art-filter-input";
  input.placeholder = "Filter by key, file, tier…";
  input.setAttribute("aria-label", "Filter assets");
  input.addEventListener("input", () => {
    state.text = input.value;
    onChange(state);
  });
  // The overlay's arrow-key handler is document-level; typing must stay local.
  input.addEventListener("keydown", (e) => e.stopPropagation());
  el.appendChild(input);

  const chipButtons = [];
  for (const group of tagGroupsFor(entries)) {
    const row = document.createElement("div");
    row.className = "subview-bar";
    row.style.padding = "0";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", group.label);
    const label = document.createElement("span");
    label.style.cssText = "color:var(--text-dim);font-size:.75rem";
    label.textContent = group.label;
    row.appendChild(label);
    for (const [value, count] of group.values) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "joy-button joy-button--sm joy-button--outline";
      b.dataset.tagField = group.id;
      b.dataset.tagValue = value;
      b.textContent = value + " (" + count + ")";
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => {
        state.tags[group.id] = state.tags[group.id] === value ? null : value;
        paintChips();
        onChange(state);
      });
      chipButtons.push(b);
      row.appendChild(b);
    }
    el.appendChild(row);
  }

  function paintChips() {
    for (const b of chipButtons) {
      const on = state.tags[b.dataset.tagField] === b.dataset.tagValue;
      b.classList.toggle("joy-button--solid", on);
      b.classList.toggle("joy-button--outline", !on);
      b.setAttribute("aria-pressed", String(on));
    }
  }

  return {
    el,
    state,
    reset() {
      state.text = "";
      state.tags = {};
      input.value = "";
      paintChips();
      onChange(state);
    },
  };
}
