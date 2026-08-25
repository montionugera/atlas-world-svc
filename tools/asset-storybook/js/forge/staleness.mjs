// F-050 — forge staleness detection.
//
// Pure functions, no DOM: the Forge tab recomputes the brief hash client-side
// (crypto.subtle) and flags ledger attempts whose recorded briefHash no longer
// matches the current brief file. Staleness is display-only — nothing cascades
// or re-runs.
//
// CRITICAL invariant: canonicalBriefString + digestHex MUST produce hashes
// byte-identical to tools/art-forge/lib/brief-hash.mjs (node:crypto side):
// recursive key sort, `_note` dropped at all nesting levels, JSON.stringify,
// sha256 truncated to 16 hex. Enforced by tests/forge-staleness.test.mjs.

const DROP = new Set(["_note"]);

function sortValue(v) {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => !DROP.has(k))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, val]) => [k, sortValue(val)]),
    );
  }
  return v;
}

export function canonicalBriefString(brief) {
  return JSON.stringify(sortValue(brief));
}

export async function digestHex(canonical) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/**
 * One staleness flag per attempt, in order.
 *
 * Renders are stale when their recorded briefHash differs from the current
 * one. Gate entries carry no hash of their own — they inherit the staleness
 * of the render that produced the PNG they inspected; an unreferenced PNG
 * defaults to not stale. Blockin and intake are never stale (blockin's hash
 * is informational; intake means the art already shipped).
 * @param {object[]} attempts  ledger entries
 * @param {string} currentHash  digestHex(canonicalBriefString(currentBrief))
 * @returns {boolean[]}
 */
export function markStale(attempts, currentHash) {
  const staleByPng = new Map();
  for (const a of attempts) {
    // A render with no recorded out path cannot be referenced by anything,
    // so it must not claim the shared "no key" slot.
    if (a.type === "render" && a.out) {
      staleByPng.set(a.out, a.briefHash !== currentHash);
    }
  }
  return attempts.map((a) =>
    a.type === "render"
      ? a.briefHash !== currentHash
      : a.type === "gate" || a.type === "gate-skipped"
        ? a.png
          ? (staleByPng.get(a.png) ?? false)
          : false
        : false,
  );
}
