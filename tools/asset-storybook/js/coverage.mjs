import { COVERAGE_CLASS } from "./state.mjs";

// ---------- coverage panel ----------
//
// Codegen asset keys (asset-keys.json) with no manifest entry yet.
// Distinct from the __unknown renderer: __unknown fires when an entry
// EXISTS but its render-type has no builder; this fires when the
// codegen key has no entry AT ALL. Both are LOUD red cards — §1 goal 4
// ("never silently show nothing, never silently pass drift").

function buildMissingEntryCard(id, kind) {
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
  h2.textContent =
    "Coverage — Missing Entries (" + missingKeys.length + ")";
  section.appendChild(h2);

  const note = document.createElement("p");
  note.className = "empty-state";
  note.style.padding = "0 0 1rem";
  note.style.textAlign = "left";
  note.textContent =
    "Codegen asset keys (colyseus-server/generated/asset-keys.json) with " +
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

