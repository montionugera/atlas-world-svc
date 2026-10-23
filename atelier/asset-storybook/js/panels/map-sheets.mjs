// Map Sheets panel — SSOT merge W2-A.
//
// Mounts the mapforge sheet viewer (maps.mjs), the map vocabulary and the fabric
// census (maps-vocabulary.mjs / maps-fabric.mjs) and the Places & Meaning table
// inside #panelHost. maps.mjs does its own fetches (maps-index.json and
// world-index.json via SB_BASE, sheet assets and content/world via the
// document-relative REPO_ROOT_REL, which resolves to the server root from both "/"
// and "/atelier/asset-storybook/"). Its pan/zoom overlay is hosted on
// ATLAS_PANELS.overlayRoot(); hide() closes it so a tab switch never strands it.
import { buildMapsSection, closeMapSheetViewer } from "../maps.mjs";
import { register } from "./registry.mjs";

let total = null;

register("map-sheets", {
  async mount(el) {
    el.replaceChildren(
      Object.assign(document.createElement("p"), {
        className: "empty-state",
        textContent: "Loading map sheets…",
      }),
    );
    const built = await buildMapsSection();
    if (!built) {
      total = 0;
      el.replaceChildren(
        Object.assign(document.createElement("p"), {
          className: "empty-state",
          textContent:
            "No map sheets: maps-index.json is missing or empty (see the console).",
        }),
      );
      return;
    }
    total = built.count;
    el.replaceChildren(built.section);
  },
  hide() {
    closeMapSheetViewer();
  },
  count() {
    return total;
  },
});
