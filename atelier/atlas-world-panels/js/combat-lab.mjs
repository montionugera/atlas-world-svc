import { COMBAT_CLASS } from "./state.mjs";
import { initHealth, bumpHealth, renderSidebarBadge } from "./health.mjs";
import { buildSidebarItem } from "./sidebar.mjs";

// Resolved against this module, not the page: the lab is `/atelier/combat-lab/` whether the
// page is the observatory at `/` (atlas-world) or `/atelier/atlas-world-panels/index.html`,
// where the old page-relative "../combat-lab/index.html" only worked for the latter.
export const COMBAT_LAB_URL = new URL(
  "../../combat-lab/index.html",
  import.meta.url,
).pathname;

/** The lab iframe. Shared by the standalone section and the observatory panel. */
export function buildCombatLabFrame({ fill = false } = {}) {
  const frame = document.createElement("iframe");
  frame.src = COMBAT_LAB_URL;
  frame.title = "Combat Model Lab";
  frame.dataset.combatLabFrame = "1";
  frame.style.cssText =
    "width:100%;border:1px solid #262c3a;border-radius:10px;background:#0b0d12;display:block;" +
    (fill ? "flex:1 1 auto;min-height:480px" : "height:80vh");
  return frame;
}

/**
 * The combat balance lab (atelier/combat-lab), embedded.
 *
 * Deliberately independent of every manifest: it is not an asset, it has
 * no health check, and a manifest 404 must not take it down — which it did
 * on the first attempt, because it was mounted after the fetch that
 * returns early on failure.
 */
export function mountCombatLab(main) {
  const section = document.createElement("section");
  section.className = "kind-section";
  section.id = "section-" + COMBAT_CLASS;
  section.dataset.kind = COMBAT_CLASS;

  const h2 = document.createElement("h2");
  h2.textContent = "Combat — balance lab (I-028)";
  section.appendChild(h2);

  const note = document.createElement("p");
  note.style.cssText =
    "color:#9aa1b2;font-size:13px;margin:0 0 12px;max-width:70ch";
  note.innerHTML =
    "The combat stat model, live. Not an asset — no manifest, no health check. " +
    "Scroll inside the frame for the rank ladder, the eight player groups and the fight storyboard. " +
    "<a href=\"" + COMBAT_LAB_URL + "\" target=\"_blank\" rel=\"noopener\">Open full screen ↗</a>";
  section.appendChild(note);

  const frame = buildCombatLabFrame();
  frame.loading = "lazy";
  section.appendChild(frame);

  main.appendChild(section);
}

/** Sidebar entry for the embedded lab. Separated so it can sit up top. */
export function mountCombatNav(sidebarNav) {
  initHealth(COMBAT_CLASS, 1);
  const btn = buildSidebarItem(COMBAT_CLASS, 1);
  btn.style.marginBottom = "10px";
  btn.style.borderBottom = "1px solid #262c3a";
  btn.style.paddingBottom = "10px";
  sidebarNav.appendChild(btn);
  bumpHealth(COMBAT_CLASS, { ok: 1 });
  renderSidebarBadge(COMBAT_CLASS);
}
