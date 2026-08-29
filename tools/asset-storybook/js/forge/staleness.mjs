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
 * Parse a run-ledger file's RAW TEXT into { header, attempts }.
 *
 * Ledgers are NDJSON (tools/art-forge/lib/run-ledger.mjs): one header JSON
 * object on the first line, then one attempt object per line. `res.json()`
 * throws on that multi-line format, so the Forge tab must fetch text and
 * parse here instead.
 *
 * @param {string} text
 * @returns {{ header: object, attempts: object[] } | null}
 *   null for an empty/whitespace-only file (no runs recorded yet).
 * @throws {Error} with a clear message on any malformed line.
 */
export function parseLedgerText(text) {
  if (typeof text !== "string" || text.trim() === "") return null;

  function parseLine(line, what) {
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(
        `ledger ${what}: malformed JSON line: ${line.slice(0, 120)}`,
      );
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(
        `ledger ${what}: expected a JSON object on line "${line.slice(0, 120)}"`,
      );
    }
    return value;
  }

  const lines = text.trim().split("\n");
  const header = parseLine(lines[0], "header");
  const attempts = lines
    .slice(1)
    .map((l, i) => parseLine(l, `attempt on line ${i + 2}`));
  return { header, attempts };
}

/**
 * One staleness flag per attempt, in order.
 *
 * Renders are stale when their recorded briefHash differs from the current
 * one. Gate entries carry no hash of their own — they inherit the staleness
 * of the render that produced the PNG they inspected; an unreferenced PNG
 * defaults to not stale. Blockin is never stale (its hash is informational);
 * intake is only ever stale via the fork cascade below.
 *
 * UC5 fork-staleness (OR-ed on top of the hash logic): a re-run never
 * cascades downstream. Any gate / gate-skipped / intake cell whose ts is
 * OLDER than the newest render attempt's ts sits below an out-of-date
 * render, so it is flagged stale (pending-recheck) regardless of briefHash.
 * @param {object[]} attempts  ledger entries
 * @param {string} currentHash  digestHex(canonicalBriefString(currentBrief))
 * @returns {boolean[]}
 */
const FORK_CELLS = new Set(["gate", "gate-skipped", "intake"]);

export function markStale(attempts, currentHash) {
  const staleByPng = new Map();
  for (const a of attempts) {
    // A render with no recorded out path cannot be referenced by anything,
    // so it must not claim the shared "no key" slot.
    if (a.type === "render" && a.out) {
      // First occurrence wins: a re-render of the same out path under a new
      // era's briefHash would otherwise flip the gate verdict for PNGs the
      // gate actually inspected at first-render time. Gates follow the FIRST
      // render that produced the png.
      if (!staleByPng.has(a.out)) staleByPng.set(a.out, a.briefHash !== currentHash);
    }
  }

  // Newest successful render ts anchors the fork cascade; attempts with no
  // parsable ts never count and never get flagged by it.
  let newestRenderTs = -Infinity;
  for (const a of attempts) {
    if (a.type !== "render") continue;
    const t = Date.parse(a.ts);
    if (Number.isFinite(t) && t > newestRenderTs) newestRenderTs = t;
  }

  return attempts.map((a) => {
    const hashStale =
      a.type === "render"
        ? // A render with no recorded hash cannot be proven current — mark it
          // stale (conservative: better a false "stale" flag than silently
          // trusting an unattributable render).
          a.briefHash !== currentHash
        : a.type === "gate" || a.type === "gate-skipped"
          ? a.png
            ? (staleByPng.get(a.png) ?? false)
            : false
          : false;
    if (hashStale) return true;
    if (!FORK_CELLS.has(a.type) || newestRenderTs === -Infinity) return false;
    const ts = Date.parse(a.ts);
    return Number.isFinite(ts) && ts < newestRenderTs;
  });
}
