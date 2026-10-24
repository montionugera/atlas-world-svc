// Combat Model Lab panel — SSOT merge W2-C.
//
// Embeds atelier/combat-lab/index.html in ONE iframe, created on mount and never
// reparented or destroyed (the registry only toggles `hidden`), so slider and scroll
// state survive tab switches. The lab is the DESIGN model (I-028, combat-model.json);
// the runtime prototype is the Rust balance sim (`?tab=sim`) — kept side by side, not merged.
import { COMBAT_LAB_URL, buildCombatLabFrame } from "../combat-lab.mjs";
import { register } from "./registry.mjs";

const SIM_TAB = "sim";

function headerBar() {
  const bar = document.createElement("div");
  bar.className = "combat-lab-header";
  bar.style.cssText =
    "display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:8px 0 12px";

  const text = document.createElement("p");
  text.style.cssText = "margin:0;flex:1 1 360px;font-size:13px;color:#9aa1b2;max-width:78ch";
  const strong = document.createElement("strong");
  strong.textContent = "Combat Model Lab";
  text.append(
    strong,
    " is the authoritative mathematical design model (",
    Object.assign(document.createElement("code"), {
      textContent: "atelier/combat-lab/combat-model.json",
    }),
    "). The runtime server simulation lives in the Rust Balance Simulator (",
    Object.assign(document.createElement("code"), {
      textContent: "server-rs/src/bin/balance_sim.rs",
    }),
    ").",
  );

  const sim = document.createElement("a");
  sim.className = "joy-button joy-button--outline joy-button--sm";
  sim.href = "/?tab=" + SIM_TAB;
  sim.dataset.combatLabSim = "1";
  sim.textContent = "⚙️ Rust Balance Simulator";
  sim.addEventListener("click", (ev) => {
    if (typeof window.switchTab !== "function") return; // standalone: follow the href
    ev.preventDefault();
    window.switchTab(SIM_TAB);
  });

  const full = document.createElement("a");
  full.className = "joy-button joy-button--ghost joy-button--sm";
  full.href = COMBAT_LAB_URL;
  full.target = "_blank";
  full.rel = "noopener";
  full.textContent = "Open full screen ↗";

  bar.append(text, sim, full);
  return bar;
}

register("combat-lab", {
  mount(el) {
    // Layout lives on an inner wrapper: an inline `display` on `el` would beat its `hidden` attribute.
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "display:flex;flex-direction:column;height:calc(100vh - 140px);min-height:560px";
    wrap.append(headerBar(), buildCombatLabFrame({ fill: true }));
    el.replaceChildren(wrap);
  },
  // The iframe stays alive while hidden; nothing in it is audible.
  hide() {},
  count() {
    return "LAB";
  },
});
