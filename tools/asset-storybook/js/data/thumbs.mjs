// The page's read side of game-client/assets/.thumbs/index.json (F-038).
//
// Replaces attachFileSize() in js/utils.mjs, which fired one HEAD request per
// card to read Content-Length — 653 of them at 8 concurrent, of which only 198
// had drained 15 seconds after load, competing with real asset traffic the
// whole time. The bake already recorded every source's size, so a single index
// fetch answers all of them instantly and exactly.
//
// Pure — no DOM, no fetch. Covered by tools/asset-storybook/tests/thumbs.test.mjs.

// Relative to tools/asset-storybook/, matching ASSET_ROOT in state.mjs.
const THUMB_ROOT = "../../game-client/assets/.thumbs/";

/**
 * @param {{entries?: Record<string, {thumb:string,bytes:number,w:number,h:number}>}|null} json
 * @returns {Map<string, {thumb:string,bytes:number,w:number,h:number}>}
 */
export function loadThumbIndex(json) {
  const entries = json && json.entries;
  if (!entries || typeof entries !== "object") return new Map();
  return new Map(Object.entries(entries));
}

export function hasThumb(srcPath, index) {
  return index.has(srcPath);
}

export function thumbUrlFor(srcPath, index) {
  const rec = index.get(srcPath);
  return rec ? THUMB_ROOT + rec.thumb : null;
}

// Byte formatting is deliberately identical to the fmtBytes() the HEAD-probe
// version used, so swapping the data source leaves the card footer looking
// exactly the same.
function fmtBytes(n) {
  if (!isFinite(n) || n <= 0) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

export function sizeTextFor(srcPath, index) {
  const rec = index.get(srcPath);
  if (!rec) return "";
  const txt = fmtBytes(rec.bytes);
  return txt ? " · " + txt : "";
}

export function thumbDimsFor(srcPath, index) {
  const rec = index.get(srcPath);
  return rec ? { w: rec.w, h: rec.h } : null;
}
