import { COVERAGE_CLASS } from "./state.mjs";

// ---------- coverage panel ----------
//
// Codegen asset keys (asset-keys.json) with no manifest entry yet.
// Distinct from the __unknown renderer: __unknown fires when an entry
// EXISTS but its render-type has no builder; this fires when the
// codegen key has no entry AT ALL. Both are LOUD red cards — §1 goal 4
// ("never silently show nothing, never silently pass drift").

export function buildMissingEntryCard(id, kind) {
  const viewport = document.createElement("div");
  viewport.className = "viewport unknown-viewport";
  const msg = document.createElement("div");
  msg.className = "unknown-msg";
  msg.textContent = "MISSING ENTRY";
  viewport.appendChild(msg);

  const card = document.createElement("div");
  card.className = "card missing-entry";
  card.dataset.kind = kind || "unknown";
  card.appendChild(viewport);

  const meta = document.createElement("div");
  meta.className = "meta";
  const keyEl = document.createElement("p");
  keyEl.className = "key";
  keyEl.textContent = id;
  const fileEl = document.createElement("p");
  fileEl.className = "filename";
  fileEl.textContent = "no manifest entry — kind: " + (kind || "unknown");
  meta.appendChild(keyEl);
  meta.appendChild(fileEl);
  card.appendChild(meta);
  return card;
}

export function buildCoverageSection(missingKeys) {
  const section = document.createElement("section");
  section.className = "kind-section";
  section.id = "section-" + COVERAGE_CLASS;
  section.dataset.kind = COVERAGE_CLASS;

  const h2 = document.createElement("h2");
  h2.textContent = "Coverage — Missing Entries (" + missingKeys.length + ")";
  section.appendChild(h2);

  const note = document.createElement("p");
  note.className = "empty-state";
  note.style.padding = "0 0 1rem";
  note.style.textAlign = "left";
  note.textContent =
    "Codegen asset keys (content/generated/asset-keys.json) with " +
    "no manifest entry yet — same set the drift-gate reports as UNMAPPED. " +
    "Never silently missing: each renders as a LOUD red card until a real entry lands.";
  section.appendChild(note);

  const grid = document.createElement("div");
  grid.className = "grid";
  for (const k of missingKeys) {
    grid.appendChild(buildMissingEntryCard(k.id, k.kind));
  }
  section.appendChild(grid);
  return section;
}

// ---------- pure model (node-testable; no DOM) ----------

/**
 * Joins the codegen keys against the ids that have a manifest entry.
 * `entryIds` is any iterable of ids (manifest + catalog-manifest keyspaces are disjoint).
 * Returns {rows: [{id, kind, mapped}], total, mapped, unmapped, pct} — rows keep the
 * codegen order; pct is a whole-number percentage (0 when there are no keys).
 */
export function computeCoverage(assetKeys, entryIds) {
  const have = new Set(entryIds || []);
  const rows = [];
  for (const k of (assetKeys && assetKeys.keys) || []) {
    if (!k || typeof k.id !== "string" || !k.id) continue;
    rows.push({ id: k.id, kind: k.kind || "unknown", mapped: have.has(k.id) });
  }
  const mapped = rows.filter((r) => r.mapped).length;
  return {
    rows,
    total: rows.length,
    mapped,
    unmapped: rows.length - mapped,
    pct: rows.length ? Math.round((mapped / rows.length) * 100) : 0,
  };
}

/** Filters rows by status ("all" | "unmapped" | "mapped"), kind ("" = any) and id text. */
export function filterCoverageRows(rows, { status = "all", kind = "", text = "" } = {}) {
  const needle = String(text || "").trim().toLowerCase();
  return rows.filter((r) => {
    if (status === "unmapped" && r.mapped) return false;
    if (status === "mapped" && !r.mapped) return false;
    if (kind && r.kind !== kind) return false;
    return !needle || r.id.toLowerCase().includes(needle);
  });
}

/** The deep link a mapped key opens in the Asset Library (hash form wins over ?search in the explorer). */
export function assetDeepLink(id) {
  return "#tab=assets&key=" + encodeURIComponent(id);
}

// ---------- panel pieces ----------

/** A mapped key's card: links straight to its 3D asset card in the Assets tab. */
export function buildMappedKeyCard(id, kind) {
  const viewport = document.createElement("div");
  viewport.className = "viewport";
  const msg = document.createElement("div");
  msg.className = "unknown-msg";
  msg.style.color = "var(--ok)";
  msg.textContent = "MAPPED";
  viewport.appendChild(msg);

  const card = document.createElement("div");
  card.className = "card mapped-entry";
  card.dataset.kind = kind || "unknown";
  card.appendChild(viewport);

  const meta = document.createElement("div");
  meta.className = "meta";
  const keyEl = document.createElement("p");
  keyEl.className = "key";
  const link = document.createElement("a");
  link.href = assetDeepLink(id);
  link.textContent = id;
  link.title = "Open in Asset Library";
  link.style.color = "var(--accent)";
  keyEl.appendChild(link);
  const fileEl = document.createElement("p");
  fileEl.className = "filename";
  fileEl.textContent = "manifest entry — kind: " + (kind || "unknown");
  meta.append(keyEl, fileEl);
  card.appendChild(meta);
  return card;
}

/** Loud banner for an unreadable coverage source — a silent console.warn is what hid the dead path. */
export function buildSourceUnavailableBanner(err) {
  const el = document.createElement("div");
  el.className = "empty-state";
  el.dataset.coverageError = "1";
  el.setAttribute("role", "alert");
  el.style.color = "var(--err)";
  el.textContent =
    "Coverage source unavailable: " + String(err && err.message ? err.message : err);
  return el;
}
