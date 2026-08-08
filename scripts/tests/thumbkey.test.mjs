// F-038 — the thumbnail key shared by three consumers:
//   scripts/bake_thumbnails.mjs   (writes .thumbs/<key>.webp)
//   scripts/check_asset_manifest.mjs guard (U)  (asserts freshness)
//   tools/asset-storybook/js/data/thumbs.mjs    (renders the card)
//
// All three must agree byte-for-byte on the filename or the gate passes while
// the page shows nothing. Keying on the SOURCE PATH rather than source bytes
// is deliberate: the freshness guard compares mtimes, so the filename has to
// stay stable when the asset itself changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { thumbKey, thumbFilename } from "../lib/thumbkey.mjs";

test("thumbKey is 16 lowercase hex chars", () => {
  assert.match(
    thumbKey("res://assets/characters/player_knight.glb"),
    /^[0-9a-f]{16}$/,
  );
});

test("thumbKey is stable across calls", () => {
  const p = "res://assets/characters/player_knight.glb";
  assert.equal(thumbKey(p), thumbKey(p));
});

test("different paths get different keys", () => {
  assert.notEqual(thumbKey("res://a.glb"), thumbKey("res://b.glb"));
});

test("paths differing only in case are distinct keys", () => {
  // macOS is case-insensitive but the repo and Linux CI are not; collapsing
  // these would make two assets share one thumbnail on a dev machine and not
  // in CI.
  assert.notEqual(
    thumbKey("res://Assets/A.glb"),
    thumbKey("res://assets/a.glb"),
  );
});

test("thumbFilename is the key plus .webp", () => {
  assert.equal(thumbFilename("res://a.glb"), thumbKey("res://a.glb") + ".webp");
});

test("a non-res:// path (concept art is a plain relative file) still keys", () => {
  assert.match(thumbFilename("concept/cast-liss.png"), /^[0-9a-f]{16}\.webp$/);
});
