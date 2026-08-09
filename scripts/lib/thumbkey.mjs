// The thumbnail filename, shared by every consumer so they cannot disagree:
//   scripts/bake_thumbnails.mjs                 writes .thumbs/<key>.webp
//   scripts/check_asset_manifest.mjs guard (U)  asserts it exists + is fresh
//   tools/asset-storybook/js/data/thumbs.mjs    reads it via .thumbs/index.json
//
// Content-addressed by SOURCE PATH, not source bytes. The freshness guard
// compares mtimes, so the filename must stay stable when the asset changes —
// a content hash would rename the thumbnail on every re-bake and turn every
// asset edit into an orphaned file plus a manifest churn.
//
// A flat hashed directory (rather than mirroring game-client/assets/'s tree)
// means .thumbs has no layout that can drift out of sync with the real one.

import { createHash } from "node:crypto";

export function thumbKey(resPath) {
  return createHash("sha256")
    .update(resPath, "utf8")
    .digest("hex")
    .slice(0, 16);
}

export function thumbFilename(resPath) {
  return thumbKey(resPath) + ".webp";
}
