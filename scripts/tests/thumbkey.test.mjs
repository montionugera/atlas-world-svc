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
import {
  thumbKey,
  thumbFilename,
  carryForwardFiltered,
} from "../lib/thumbkey.mjs";

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

// ── carryForwardFiltered — the `--only` index-erasure guard ────────────────
//
// POSITIVE CONTROL. The defect this was calibrated on, kept as a fixture:
// `node scripts/bake_thumbnails.mjs --only maps/` rebuilt .thumbs/index.json
// from the 3 filtered jobs and wrote the whole file, erasing 643 rows and
// making check_asset_manifest.mjs report 643 UNRECORDED failures on a tree
// with zero real drift (reproduced 2026-08-21). If this suite stops detecting
// that shape, it has stopped covering the thing it exists for.
const PRIOR = {
  "maps/atlas-world.png": {
    thumb: "a.webp",
    bytes: 1,
    w: 1,
    h: 1,
    srcHash: "aa",
  },
  "concept/cast-liss.png": {
    thumb: "b.webp",
    bytes: 2,
    w: 1,
    h: 1,
    srcHash: "bb",
  },
  "res://assets/x.glb": {
    thumb: "c.webp",
    bytes: 3,
    w: 1,
    h: 1,
    srcHash: "cc",
  },
};

test("a --only run keeps the rows it never looked at", () => {
  const built = {
    "maps/atlas-world.png": {
      thumb: "a.webp",
      bytes: 9,
      w: 2,
      h: 2,
      srcHash: "zz",
    },
  };
  const out = carryForwardFiltered({
    entries: built,
    prior: PRIOR,
    retainPaths: new Set(["concept/cast-liss.png", "res://assets/x.glb"]),
  });
  assert.equal(Object.keys(out).length, 3);
  assert.deepEqual(
    out["concept/cast-liss.png"],
    PRIOR["concept/cast-liss.png"],
  );
  assert.deepEqual(out["res://assets/x.glb"], PRIOR["res://assets/x.glb"]);
});

test("the freshly baked row wins over the prior row it replaces", () => {
  const built = {
    "maps/atlas-world.png": {
      thumb: "a.webp",
      bytes: 9,
      w: 2,
      h: 2,
      srcHash: "zz",
    },
  };
  const out = carryForwardFiltered({
    entries: built,
    prior: PRIOR,
    retainPaths: new Set(["maps/atlas-world.png"]),
  });
  assert.equal(out["maps/atlas-world.png"].srcHash, "zz");
});

test("a FULL run still prunes: nothing retained means nothing carried", () => {
  // This is the property the naive fix breaks. A manifest row that was
  // deleted is not in the job list at all, so it is not in retainPaths, and
  // it must NOT come back from the prior index.
  const built = {
    "maps/atlas-world.png": {
      thumb: "a.webp",
      bytes: 9,
      w: 2,
      h: 2,
      srcHash: "zz",
    },
  };
  const out = carryForwardFiltered({
    entries: built,
    prior: PRIOR,
    retainPaths: new Set(),
  });
  assert.deepEqual(Object.keys(out), ["maps/atlas-world.png"]);
});

test("output keys are sorted, so an unchanged re-run is byte-identical", () => {
  const out = carryForwardFiltered({
    entries: { "zz.png": { thumb: "z.webp" } },
    prior: PRIOR,
    retainPaths: new Set(Object.keys(PRIOR)),
  });
  assert.deepEqual(
    Object.keys(out),
    [...Object.keys(out)].sort((a, b) => a.localeCompare(b)),
  );
});

test("malformed input degrades instead of throwing", () => {
  for (const bad of [null, undefined, 7, "x", []]) {
    assert.doesNotThrow(() =>
      carryForwardFiltered({ entries: bad, prior: bad, retainPaths: bad }),
    );
  }
  assert.doesNotThrow(() => carryForwardFiltered());
});

test("a malformed prior index carries nothing, rather than throwing mid-bake", () => {
  // The case that actually REACHES the guard: retainPaths is non-empty, so the
  // loop dereferences `prior`. Without the guard this is `null[path]` — a
  // TypeError thrown from inside main(), after the 2D queue has already
  // written thumbnails, leaving .thumbs/ and index.json disagreeing.
  for (const bad of [null, undefined, 7, "x"]) {
    let out;
    assert.doesNotThrow(
      () => {
        out = carryForwardFiltered({
          entries: { "a.png": { thumb: "a.webp" } },
          prior: bad,
          retainPaths: ["b.png", "c.png"],
        });
      },
      `prior=${JSON.stringify(bad)}`,
    );
    assert.deepEqual(Object.keys(out), ["a.png"]);
  }
});
