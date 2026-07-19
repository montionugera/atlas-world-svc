import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadGlb, sceneHeight, listClipNames, jointNames, countTriangles, readStamp } from "../lib/gltf.mjs";
const DONOR = new URL("../../../art-source/seed/kenney-mini-characters/character-male-b.glb", import.meta.url).pathname;

test("donor measurements", async (t) => {
  const head = readFileSync(DONOR, { encoding: "utf8", flag: "r" }).slice(0, 200);
  if (head.startsWith("version https://git-lfs")) {
    t.skip("donor is LFS pointer");
    return;
  }
  const doc = await loadGlb(DONOR);
  const h = sceneHeight(doc);
  assert.ok(h > 0.5 && h < 1.0, `kenney donor ~0.7u, got ${h}`);
  assert.ok(listClipNames(doc).includes("idle"));
  assert.ok(listClipNames(doc).includes("attack-melee-right"));
  assert.ok(jointNames(doc).length > 5);
  assert.ok(countTriangles(doc) > 100);
  assert.equal(readStamp(doc), null);
});
