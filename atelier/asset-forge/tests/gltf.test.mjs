import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Document } from "@gltf-transform/core";
import { loadGlb, sceneHeight, listClipNames, jointNames, jointParents, countTriangles, readStamp } from "../lib/gltf.mjs";
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

test("jointParents: root under a non-joint Rig node is null; chain hips -> spine", () => {
  const doc = new Document();
  const rig = doc.createNode("Rig");
  const root = doc.createNode("root");
  const hips = doc.createNode("hips");
  const spine = doc.createNode("spine");
  rig.addChild(root);
  root.addChild(hips);
  hips.addChild(spine);
  doc.createScene("s").addChild(rig);
  doc.createSkin("skin").addJoint(root).addJoint(hips).addJoint(spine);
  assert.deepEqual(jointParents(doc), { root: null, hips: "root", spine: "hips" });
});
