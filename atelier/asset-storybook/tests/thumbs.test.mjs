// F-038 — the page's read side of the thumbnail index.
//
// This replaces attachFileSize() in js/utils.mjs, which issued one HEAD
// request PER CARD to read Content-Length — 653 of them, capped at 8
// concurrent, of which only 198 had drained 15 seconds after load. The bake
// already knows every source's size, so one index fetch answers all of them
// instantly and exactly.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadThumbIndex,
  thumbUrlFor,
  sizeTextFor,
  hasThumb,
} from "../js/data/thumbs.mjs";

const IDX = {
  version: 1,
  entries: {
    "res://assets/a.glb": { thumb: "ab12.webp", bytes: 246784, w: 256, h: 256 },
    "concept/cast-liss.png": {
      thumb: "cd34.webp",
      bytes: 1199104,
      w: 171,
      h: 256,
    },
    "res://assets/tiny.png": { thumb: "ef56.webp", bytes: 900, w: 32, h: 32 },
  },
};

test("resolves a thumbnail url under .thumbs/", () => {
  const i = loadThumbIndex(IDX);
  assert.match(thumbUrlFor("res://assets/a.glb", i), /\.thumbs\/ab12\.webp$/);
});

test("formats size from the index with no network call", () => {
  const i = loadThumbIndex(IDX);
  assert.equal(sizeTextFor("res://assets/a.glb", i), " · 241.0 KB");
  assert.equal(sizeTextFor("concept/cast-liss.png", i), " · 1.1 MB");
  assert.equal(sizeTextFor("res://assets/tiny.png", i), " · 900 B");
});

test("an unindexed path yields null url and empty size, never a throw", () => {
  const i = loadThumbIndex(IDX);
  assert.equal(thumbUrlFor("res://nope.glb", i), null);
  assert.equal(sizeTextFor("res://nope.glb", i), "");
  assert.equal(hasThumb("res://nope.glb", i), false);
});

test("hasThumb distinguishes indexed from not", () => {
  const i = loadThumbIndex(IDX);
  assert.equal(hasThumb("res://assets/a.glb", i), true);
});

test("a missing or malformed index degrades instead of throwing", () => {
  // .thumbs/index.json is fetched non-critically: a repo that has never run
  // the bake should still render the page (with LOUD no-thumbnail cards),
  // not a blank screen.
  for (const bad of [null, undefined, {}, { entries: null }]) {
    const i = loadThumbIndex(bad);
    assert.equal(thumbUrlFor("res://assets/a.glb", i), null);
    assert.equal(sizeTextFor("res://assets/a.glb", i), "");
  }
});

test("size formatting matches the old attachFileSize output exactly", () => {
  // The card footer format is unchanged from the HEAD-probe version, so the
  // swap is invisible: " · <n> B" / " · <n.n> KB" / " · <n.n> MB".
  const i = loadThumbIndex({
    version: 1,
    entries: {
      a: { thumb: "x.webp", bytes: 1023, w: 1, h: 1 },
      b: { thumb: "y.webp", bytes: 1024, w: 1, h: 1 },
      c: { thumb: "z.webp", bytes: 1048576, w: 1, h: 1 },
      d: { thumb: "w.webp", bytes: 0, w: 1, h: 1 },
    },
  });
  assert.equal(sizeTextFor("a", i), " · 1023 B");
  assert.equal(sizeTextFor("b", i), " · 1.0 KB");
  assert.equal(sizeTextFor("c", i), " · 1.0 MB");
  assert.equal(sizeTextFor("d", i), ""); // 0 bytes renders nothing, as before
});
