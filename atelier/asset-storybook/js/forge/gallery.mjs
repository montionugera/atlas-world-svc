// F-039 — Forge tab gallery grouping.
//
// Pure data layer for the redesigned Forge tab: render attempts become cards
// grouped by recipe version (briefHash), newest batches first; supporting
// stages (blockin/gate/intake) are not cards — gate/gate-skipped entries fold
// into per-card gate state via their `png` reference. DOM assembly lives in
// js/forge/forge.mjs.

function tsOf(card) {
  const t = new Date(card.entry.ts).getTime();
  return Number.isFinite(t) ? t : -Infinity;
}

/**
 * @param {object[]} attempts    full ledger attempts array (NDJSON lines)
 * @param {boolean[]} staleFlags markStale() output aligned with attempts indices
 * @returns {{ briefHash: string, cards: {entry: object, index: number, stale: boolean, isDev: boolean, gate: {state: "flag"|"ok"|"skipped"}|null}[] }[]}
 *   batches ordered newest-first; cards within a batch newest-first.
 */
export function buildForgeGallery(attempts, staleFlags = []) {
  const cards = [];
  attempts.forEach((entry, index) => {
    if (entry.type !== "render") return;
    cards.push({
      entry,
      index,
      stale: Boolean(staleFlags[index]),
      isDev: typeof entry.out === "string" && entry.out.includes("-dev-"),
      gate: null,
    });
  });

  // The latest gate entry in attempts order wins — a re-gate supersedes.
  for (const entry of attempts) {
    if (entry.type !== "gate" && entry.type !== "gate-skipped") continue;
    const card = cards.find((c) => c.entry.out === entry.png);
    if (!card) continue;
    card.gate = {
      state:
        entry.type === "gate-skipped" ? "skipped" : entry.ok ? "ok" : "flag",
    };
  }

  const byBatch = new Map();
  for (const card of cards) {
    const key = card.entry.briefHash || "unknown";
    if (!byBatch.has(key)) byBatch.set(key, []);
    byBatch.get(key).push(card);
  }

  return [...byBatch.entries()]
    .map(([briefHash, batchCards]) => {
      batchCards.sort((a, b) => tsOf(b) - tsOf(a));
      return { briefHash, cards: batchCards };
    })
    .sort((a, b) => tsOf(b.cards[0]) - tsOf(a.cards[0]));
}
