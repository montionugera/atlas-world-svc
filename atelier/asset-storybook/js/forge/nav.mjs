// F-050 Task 8 — Forge tab sidebar entry.
//
// Same mount contract as the combat lab / story surfaces
// (js/combat-lab.mjs, js/story.mjs): not an asset, no manifest dependency,
// no real health check — a missing runs index must degrade to the tab's
// empty state, never take the page down. The section itself is mounted by
// mountForge() (js/forge/forge.mjs); this only adds the sidebar item, using
// the SAME buildSidebarItem mechanism as every other entry.

import { FORGE_CLASS } from "../state.mjs";
import { initHealth, bumpHealth, renderSidebarBadge } from "../health.mjs";
import { buildSidebarItem } from "../sidebar.mjs";

export function mountForgeNav(sidebarNav) {
  initHealth(FORGE_CLASS, 1);
  const btn = buildSidebarItem(FORGE_CLASS, 1);
  btn.style.marginBottom = "10px";
  btn.style.borderBottom = "1px solid #262c3a";
  btn.style.paddingBottom = "10px";
  sidebarNav.appendChild(btn);
  bumpHealth(FORGE_CLASS, { ok: 1 });
  renderSidebarBadge(FORGE_CLASS);
}

export { mountForge } from "./forge.mjs";
