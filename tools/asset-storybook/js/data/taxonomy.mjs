// Section naming for the storybook, read from content/asset-taxonomy.json.
//
// This replaces the hand-maintained RENDER_LABELS lookup that used to live in
// js/sidebar.mjs. That lookup fell through to a generic
// capitalize-and-append-s branch whenever a `kind` was missing from it, which
// is how 283 dungeon assets came to sit under a section headed
// "Model3d:dungeons". A miss was indistinguishable from a hit.
//
// Here a miss is explicit: the entry lands in UNTAXONOMIZED, and guard (H) in
// scripts/check_asset_manifest.mjs fails the build on any kind that reaches
// it. The class of bug becomes impossible rather than fixed once.
//
// Pure — no DOM, no fetch. Covered by tools/asset-storybook/tests/taxonomy.test.mjs.

export const UNTAXONOMIZED = "__untaxonomized";

/**
 * @param {{sections?: Array<{id:string,label?:string,order?:number,kinds?:string[]}>}} json
 * @returns {{sections: Map<string,{id:string,label:string,order:number}>, kindToSection: Map<string,string>}}
 */
export function loadTaxonomy(json) {
  const sections = new Map();
  const kindToSection = new Map();
  const ordered = [...((json && json.sections) || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  for (const s of ordered) {
    sections.set(s.id, {
      id: s.id,
      label: s.label || s.id,
      order: s.order ?? 0,
    });
    for (const kind of s.kinds || []) kindToSection.set(kind, s.id);
  }
  return { sections, kindToSection };
}

export function sectionForEntry(entry, taxonomy) {
  const kind = entry && entry.kind;
  if (!kind) return UNTAXONOMIZED;
  return taxonomy.kindToSection.get(kind) || UNTAXONOMIZED;
}

export function labelForSection(sectionId, taxonomy) {
  if (sectionId === UNTAXONOMIZED) return "Untaxonomized";
  const s = taxonomy.sections.get(sectionId);
  return s ? s.label : sectionId;
}

/**
 * Buckets [key, entry] pairs into sections, in registry order rather than
 * insertion order, dropping sections that ended up empty so the sidebar never
 * shows an item that scrolls to nothing.
 */
export function groupEntries(entries, taxonomy) {
  const grouped = new Map();
  for (const id of taxonomy.sections.keys()) grouped.set(id, []);
  for (const [key, entry] of entries) {
    const sid = sectionForEntry(entry, taxonomy);
    if (!grouped.has(sid)) grouped.set(sid, []);
    grouped.get(sid).push([key, entry]);
  }
  for (const [sid, list] of [...grouped]) {
    if (list.length === 0) grouped.delete(sid);
  }
  return grouped;
}
