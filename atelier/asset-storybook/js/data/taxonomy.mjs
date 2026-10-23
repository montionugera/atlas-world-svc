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
// Pure — no DOM, no fetch. Covered by atelier/asset-storybook/tests/taxonomy.test.mjs.

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

// `taxonomy` is nullable throughout: the storybook's manifest-fetch-failure
// path still renders the sidebar (combat lab + story stay reachable) before
// any registry has loaded. A null registry degrades to the raw id rather than
// throwing and taking the whole page down with it.

export function sectionForEntry(entry, taxonomy) {
  const kind = entry && entry.kind;
  if (!kind || !taxonomy) return UNTAXONOMIZED;
  return taxonomy.kindToSection.get(kind) || UNTAXONOMIZED;
}

export function labelForSection(sectionId, taxonomy) {
  if (sectionId === UNTAXONOMIZED) return "Untaxonomized";
  if (!taxonomy) return sectionId;
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

// ---------- kind ids (assets panel deep links) ----------
//
// `?tab=assets&kind=<id>` names a taxonomy section ("character") or a section
// narrowed to one manifest-key prefix ("character:mob" = the character entries
// whose key starts "mob:"). Section ids never contain ":", so the first colon is
// the split. A key with no colon ("player", "npc") is its own prefix.

export const ALL_KIND = "all";

export function keyPrefix(key) {
  const i = String(key).indexOf(":");
  return i === -1 ? String(key) : String(key).slice(0, i);
}

function splitKind(kindId) {
  const i = kindId.indexOf(":");
  return i === -1
    ? { section: kindId, prefix: null }
    : { section: kindId.slice(0, i), prefix: kindId.slice(i + 1) };
}

/**
 * The switcher model: one row per non-empty section (registry order), each with
 * its key-prefix children. Built from the data, so it can't offer a kind that
 * has no assets.
 * @returns {Array<{id:string,label:string,count:number,children:Array<{id:string,label:string,count:number}>}>}
 */
export function buildKindIndex(entries, taxonomy) {
  const groups = groupEntries(entries, taxonomy);
  const out = [];
  for (const [sid, list] of groups) {
    const prefixes = new Map();
    for (const [key] of list) {
      const p = keyPrefix(key);
      prefixes.set(p, (prefixes.get(p) || 0) + 1);
    }
    out.push({
      id: sid,
      label: labelForSection(sid, taxonomy),
      count: list.length,
      children: [...prefixes]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([p, count]) => ({ id: sid + ":" + p, label: p, count })),
    });
  }
  return out;
}

/** Entries matching a kind id; ALL_KIND (or empty) matches everything. */
export function filterByKind(entries, kindId, taxonomy) {
  if (!kindId || kindId === ALL_KIND) return entries;
  const { section, prefix } = splitKind(kindId);
  return entries.filter(
    ([key, entry]) =>
      sectionForEntry(entry, taxonomy) === section &&
      (prefix === null || keyPrefix(key) === prefix),
  );
}
