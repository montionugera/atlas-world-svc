// The thumbnail filename, shared by every consumer so they cannot disagree:
//   scripts/bake_thumbnails.mjs                 writes .thumbs/<key>.webp
//   scripts/check_asset_manifest.mjs guard (U)  asserts it exists + is fresh
//   tools/asset-storybook/js/data/thumbs.mjs    reads it via .thumbs/index.json
//
// The FILENAME is addressed by SOURCE PATH, not source bytes, so it stays
// stable when the asset changes — a content-addressed filename would rename
// the thumbnail on every re-bake and turn every asset edit into an orphaned
// file plus index churn.
//
// A flat hashed directory (rather than mirroring game-client/assets/'s tree)
// means .thumbs has no layout that can drift out of sync with the real one.
//
// FRESHNESS, separately, is addressed by SOURCE BYTES via sourceHash(): the
// bake records each source's hash in .thumbs/index.json and guard (U) compares
// the hash on disk against that record. This used to be an mtime comparison,
// which is unsound anywhere the tree is materialised rather than edited: a
// fresh `git checkout` stamps every file with its own write time, and because
// `.thumbs` sorts before every other directory under assets/ it is always
// written FIRST — so every source came out "newer" than its thumbnail and CI
// reported 643 false STALEs on a tree with zero real drift. A content hash is
// invariant under checkout, copy, rsync and cache restore.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function thumbKey(resPath) {
  return createHash("sha256")
    .update(resPath, "utf8")
    .digest("hex")
    .slice(0, 16);
}

export function thumbFilename(resPath) {
  return thumbKey(resPath) + ".webp";
}

// Hash of a source file's BYTES — the freshness token recorded per entry in
// .thumbs/index.json. Same 16-hex truncation as thumbKey: 64 bits is far more
// than enough to notice an edited asset, and keeps the index small.
export function sourceHash(absPath) {
  return createHash("sha256")
    .update(readFileSync(absPath))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Carry forward the index rows that a `--only` run never looked at.
 *
 * WHY THIS EXISTS. `bake_thumbnails.mjs` rebuilds .thumbs/index.json from the
 * job list it just processed, and writes the whole file. That is correct for a
 * FULL run — an entry whose manifest row was deleted must be pruned, and a
 * whole-file write is what prunes it. It is destructive for a `--only` run:
 * the filter removes ~99% of the jobs, so the write erased 5,116 lines and 643
 * rows, and `check_asset_manifest.mjs` guard (U) immediately reported 643
 * UNRECORDED failures against a tree with zero real drift. Reproduced
 * 2026-08-21 while re-baking the three map thumbs, which is exactly the step
 * Plan B Task 11 instructs.
 *
 * The fix keeps both properties by distinguishing "not in the manifest any
 * more" from "not in THIS run's filter": `retainPaths` is the set of source
 * paths that exist in the unfiltered job list but were filtered out, so their
 * prior rows survive, while a path in neither list is still pruned.
 *
 * Pure, and never throws — a malformed prior index yields no carry-forward
 * rather than an exception inside the bake.
 */
export function carryForwardFiltered({ entries, prior, retainPaths } = {}) {
  const out = { ...(entries && typeof entries === "object" ? entries : {}) };
  if (!prior || typeof prior !== "object") return sortEntries(out);
  const retain =
    retainPaths instanceof Set
      ? retainPaths
      : new Set(Array.isArray(retainPaths) ? retainPaths : []);
  for (const path of retain) {
    if (Object.prototype.hasOwnProperty.call(out, path)) continue;
    const row = prior[path];
    if (row && typeof row === "object") out[path] = row;
  }
  return sortEntries(out);
}

// The bake writes sorted keys so an unchanged re-run is byte-identical; a
// carried-forward row must land in the same order, not appended at the end.
function sortEntries(obj) {
  const sorted = {};
  for (const k of Object.keys(obj).sort((a, b) => a.localeCompare(b)))
    sorted[k] = obj[k];
  return sorted;
}
