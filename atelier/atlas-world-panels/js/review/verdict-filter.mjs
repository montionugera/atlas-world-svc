// Verdict filters for the Review panel's "Asset verdicts" sub-view.
//
// These slice the SAME asset list by review state rather than by kind. Pure — the
// caller supplies `lookup(key) -> {verdict, note} | null` (store.get), so this is
// testable without a DOM (tests/review-verdict-filter.test.mjs).
//
// `?tab=review&view=verdicts&verdict=<id>` carries the filter id; no `verdict`
// param means "all".

export const VERDICT_FILTERS = [
  { id: "all", label: "All" },
  { id: "reject", label: "Rejected" },
  { id: "rebuild", label: "Needs rebuild" },
  { id: "unreviewed", label: "Unreviewed" },
];

const IDS = new Set(VERDICT_FILTERS.map((f) => f.id));

/** @returns {{id: string, known: boolean}} unknown/absent values fall back to "all" */
export function normalizeVerdictFilter(value) {
  if (value === undefined || value === null || value === "") {
    return { id: "all", known: true };
  }
  return IDS.has(value)
    ? { id: value, known: true }
    : { id: "all", known: false };
}

/** @param {string} filter @param {{verdict:string}|null} rec */
export function matchesVerdict(filter, rec) {
  if (filter === "reject") return rec?.verdict === "reject";
  if (filter === "rebuild") return rec?.verdict === "rebuild";
  if (filter === "unreviewed") return !rec;
  return true;
}

/**
 * @param {Array<[string, object]>} entries  [key, manifestEntry] pairs
 * @param {string} filter
 * @param {(key:string)=>({verdict:string}|null)} lookup
 */
export function filterByVerdict(entries, filter, lookup) {
  if (filter === "all") return entries;
  return entries.filter(([key]) => matchesVerdict(filter, lookup(key)));
}

/** @returns {{all:number, reject:number, rebuild:number, unreviewed:number}} */
export function verdictCounts(entries, lookup) {
  const out = { all: entries.length, reject: 0, rebuild: 0, unreviewed: 0 };
  for (const [key] of entries) {
    const rec = lookup(key);
    if (!rec) out.unreviewed++;
    else if (rec.verdict === "reject") out.reject++;
    else if (rec.verdict === "rebuild") out.rebuild++;
  }
  return out;
}
