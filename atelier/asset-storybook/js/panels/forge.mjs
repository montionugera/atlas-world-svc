// Forge panel — SSOT merge W2-D (`?tab=forge`).
//
// Art-forge pipeline runs and briefs: one pipeline row per brief, a gallery of
// renders per recipe version, and the pending work-orders list. Everything is
// read through the observatory's static mounts:
//   /atelier/asset-storybook/forge-briefs-index.json   (SB_BASE)
//   /atelier/art-forge/runs/*   run ledgers
//   /atelier/art-forge/briefs/* briefs (staleness hash)
//   /atelier/art-forge/out/*    renders (gitignored — a missing PNG shows "png missing")
//
// Work orders are the one write: an order issued from a card is a DRAFT in the
// browser's localStorage buffer until "Save" POSTs it to
// /api/review-queue/work-orders (forge/forge.mjs, forge/work-orders.mjs). The
// panel mounts once; the registry keeps its DOM across tab switches.
import { closeDetail, isDetailOpen } from "../view/DetailOverlay.mjs";
import { mountForge } from "../forge/forge.mjs";
import { register } from "./registry.mjs";

let root = null;
let mounted = false;

register("forge", {
  async mount(el) {
    root = el;
    el.replaceChildren(); // a retry after a failed mount must not stack a second section
    await mountForge(el);
    mounted = true;
  },
  hide() {
    // The ledger-entry detail lives in the shared overlay root, outside this panel.
    if (isDetailOpen()) closeDetail({ silent: true });
  },
  count() {
    return mounted ? root.querySelectorAll(".forge-pipeline-row").length : null;
  },
});
