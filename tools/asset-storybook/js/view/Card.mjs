// One asset card, rendered from its baked thumbnail (F-038).
//
// Every render-type produces the SAME card here — that uniformity is the whole
// point of the thumbnail spine. A 3D model, a tileset and a nine-patch are all
// a 256px webp at this level, so 742 heterogeneous assets become comparable at
// a glance and cost the same to display. The live renderers in js/renderers.mjs
// still exist, but now run only inside the detail overlay, one at a time.
//
// Previously each card built its own renderer: 643 <model-viewer> elements,
// 11,268 DOM nodes, 92 MB of heap, and a HEAD request per card just to show a
// file size.

import { thumbUrlFor, sizeTextFor, hasThumb } from "../data/thumbs.mjs";
import { filenameOf } from "../utils.mjs";

function primaryPath(entry) {
  return entry.scene ?? entry.stream ?? "";
}

// A card whose asset has no baked thumbnail is LOUD, never blank — the same
// rule buildUnknown() has always followed. In practice guard (U) fails the
// build first, so this is defence in depth for a working tree mid-bake.
function buildMissingViewport(srcPath) {
  const viewport = document.createElement("div");
  viewport.className = "viewport unknown-viewport";
  const msg = document.createElement("div");
  msg.className = "unknown-msg";
  msg.textContent = srcPath
    ? "no baked thumbnail — run scripts/bake_thumbnails.mjs"
    : "entry has no scene/stream path";
  viewport.appendChild(msg);
  return viewport;
}

/**
 * @param {string} key       manifest key, e.g. "mob:aggressive"
 * @param {object} entry     manifest entry
 * @param {object} ctx       { thumbIndex, sectionId, onOpen }
 */
export function buildCard(key, entry, ctx) {
  const { thumbIndex, sectionId, onOpen } = ctx;
  const srcPath = primaryPath(entry);

  const card = document.createElement("div");
  card.className = "card thumb-card";
  card.dataset.key = key;
  card.dataset.kind = entry.kind || "unknown";
  card.tabIndex = 0;
  card.title = "Click to open — orbit, animation clips, full metadata";

  if (!hasThumb(srcPath, thumbIndex)) {
    card.classList.add("missing-entry");
    card.appendChild(buildMissingViewport(srcPath));
  } else {
    const viewport = document.createElement("div");
    viewport.className = "viewport thumb-viewport";
    const img = document.createElement("img");
    img.src = thumbUrlFor(srcPath, thumbIndex);
    img.alt = key;
    img.decoding = "async";
    viewport.appendChild(img);
    card.appendChild(viewport);
  }

  const meta = document.createElement("div");
  meta.className = "meta";

  const keyEl = document.createElement("p");
  keyEl.className = "key";
  keyEl.textContent = key;

  const fileEl = document.createElement("p");
  fileEl.className = "filename";
  fileEl.textContent = filenameOf(srcPath);
  const sizeEl = document.createElement("span");
  sizeEl.className = "filesize";
  // Read straight from the bake index — no HEAD request, no queue, no wait.
  sizeEl.textContent = sizeTextFor(srcPath, thumbIndex);
  fileEl.appendChild(sizeEl);

  const badges = document.createElement("div");
  badges.className = "badges";
  for (const [cls, text] of [
    ["badge tier-" + (entry.tier || "unknown"), entry.tier || "unknown tier"],
    ["badge kind", entry.kind || "unknown kind"],
    ["badge license", entry.license || "unknown license"],
  ]) {
    const b = document.createElement("span");
    b.className = cls;
    b.textContent = text;
    badges.appendChild(b);
  }

  meta.appendChild(keyEl);
  meta.appendChild(fileEl);
  meta.appendChild(badges);
  card.appendChild(meta);

  if (onOpen) {
    card.addEventListener("click", () => onOpen(key));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen(key);
      }
    });
  }

  card.dataset.section = sectionId || "";
  return card;
}
