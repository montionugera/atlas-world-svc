// Map Builder panel — SSOT merge W2-B.
//
// Hosts the Start / Build / History / Review / Publish screens of js/map-builder.mjs inside
// #panelHost. The builder itself stays the loopback Node service (atelier/map-builder, port
// 6016) — the only writer of content/world/** — and the observatory reaches it through the
// /api/map-builder/* proxy. When the service is down the panel shows the read-only "Builder
// service not running" notice with a "Check again" button, and mounts the real UI the next time
// it is shown (or checked) with the service up.
import { mountMapBuilder } from "../map-builder.mjs";
import { register } from "./registry.mjs";

let root = null;
let handle = null; // {ready, setActive} of the current mount
let mounting = null;
let badge = null; // drafts awaiting review, once the service has answered
let checkedAt = 0;
const RECHECK_MS = 2000; // show() right after mount() must not probe the service twice

function openMaps() {
  if (typeof window.switchTab === "function") window.switchTab("map-sheets");
  else location.assign("/?tab=map-sheets");
}

function recheckButton() {
  const wrap = document.createElement("p");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "joy-button joy-button--sm joy-button--outline";
  btn.dataset.mapBuilderRecheck = "";
  btn.textContent = "Check again";
  btn.addEventListener("click", () => {
    btn.disabled = true;
    mount().catch(() => {});
  });
  wrap.appendChild(btn);
  return wrap;
}

// One mount at a time; a failed health check leaves the notice (plus the retry button) in place.
function mount() {
  if (mounting) return mounting;
  const next = document.createElement("div");
  next.dataset.mapBuilderBody = "";
  checkedAt = Date.now();
  if (!root.firstChild) root.appendChild(next); // attached while mounting so pan/zoom stages can measure
  mounting = mountMapBuilder(next, {
    onBadge: (count) => {
      badge = count;
      window.dispatchEvent(new Event("atlas-panels-updated"));
    },
    onOpenMaps: openMaps,
  })
    .then((result) => {
      handle = result;
      if (!result.ready) {
        badge = null;
        next.appendChild(recheckButton());
      }
      root.replaceChildren(next);
      return result;
    })
    .catch((err) => {
      console.error("[atlas-panels] map-builder mount failed:", err);
      throw err;
    })
    .finally(() => {
      mounting = null;
    });
  return mounting;
}

register("map-builder", {
  async mount(el) {
    root = el;
    await mount();
  },
  async show() {
    if (mounting) await mounting.catch(() => {});
    if (!handle) return;
    if (handle.ready) handle.setActive(true);
    else if (Date.now() - checkedAt > RECHECK_MS) await mount().catch(() => {}); // service may be up now
  },
  hide() {
    handle?.setActive(false);
  },
  count() {
    return badge;
  },
});
