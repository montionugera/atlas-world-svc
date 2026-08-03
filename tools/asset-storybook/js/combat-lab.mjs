import { COMBAT_CLASS } from "./state.mjs";
import { initHealth, bumpHealth, renderSidebarBadge } from "./health.mjs";
import { buildSidebarItem } from "./sidebar.mjs";

/**
 * The combat balance lab (tools/combat-lab), embedded.
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
    '<a href="../combat-lab/index.html" target="_blank" rel="noopener">Open full screen ↗</a>';
  section.appendChild(note);

  const frame = document.createElement("iframe");
  frame.src = "../combat-lab/index.html";
  frame.loading = "lazy";
  frame.style.cssText =
    "width:100%;height:80vh;border:1px solid #262c3a;border-radius:10px;background:#0b0d12;display:block";
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

