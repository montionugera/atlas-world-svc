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
