import { test } from "node:test";
import assert from "node:assert/strict";
import { Document } from "@gltf-transform/core";
import {
  normalizeRigidTranslations,
  detectCrushingTranslations,
} from "../lib/normalize-anim.mjs";

// Builds a minimal skinned doc: a `root` joint plus `boneCount` child bones,
// each given a rest translation and a single-key translation track offset from
// rest by `drift` (0 => track sits at rest). `coreNames` controls how many of
// the bones count toward the systemic gate (non-IK/handslot names).
function makeRig({ boneCount, drift, corePrefix = "bone" }) {
  const doc = new Document();
  const root = doc.createNode("root").setTranslation([0, 0, 0]);
  const skin = doc.createSkin("rig").addJoint(root);
  const anim = doc.createAnimation("Idle");
  const input = doc
    .createAccessor()
    .setType("SCALAR")
    .setArray(new Float32Array([0]));
  for (let i = 0; i < boneCount; i++) {
    const rest = [0, 1 + i * 0.1, 0];
    const bone = doc.createNode(`${corePrefix}${i}`).setTranslation(rest);
    root.addChild(bone);
    skin.addJoint(bone);
    const out = doc
      .createAccessor()
      .setType("VEC3")
      .setArray(new Float32Array([rest[0], rest[1] - drift, rest[2]]));
    const sampler = doc
      .createAnimationSampler()
      .setInput(input)
      .setOutput(out);
    anim
      .addSampler(sampler)
      .addChannel(
        doc
          .createAnimationChannel()
          .setTargetNode(bone)
          .setTargetPath("translation")
          .setSampler(sampler),
      );
  }
  return doc;
}

test("systemic crush: strips every offending non-root translation track", () => {
  const doc = makeRig({ boneCount: 10, drift: 0.4 });
  const rep = normalizeRigidTranslations(doc);
  assert.equal(rep.removedChannels, 10);
  assert.equal(rep.pinnedBones.length, 10);
  // channels are gone -> bones fall back to rest
  const remaining = doc
    .getRoot()
    .listAnimations()[0]
    .listChannels()
    .filter((c) => c.getTargetPath() === "translation");
  assert.equal(remaining.length, 0);
});

test("below the systemic threshold: leaves the file untouched", () => {
  const doc = makeRig({ boneCount: 4, drift: 0.4 }); // 4 < MIN_SYSTEMIC (8)
  const rep = normalizeRigidTranslations(doc);
  assert.equal(rep.removedChannels, 0);
  assert.deepEqual(rep.pinnedBones, []);
});

test("no drift: correctly-authored rig is a no-op", () => {
  const doc = makeRig({ boneCount: 12, drift: 0 });
  const rep = normalizeRigidTranslations(doc);
  assert.equal(rep.removedChannels, 0);
});

test("IK/handslot bones do not count toward the systemic gate", () => {
  const doc = makeRig({ boneCount: 10, drift: 0.4, corePrefix: "handslotIK" });
  const rep = normalizeRigidTranslations(doc);
  assert.equal(rep.removedChannels, 0, "peripheral-only drift must not trip");
});

test("detectCrushingTranslations mirrors the systemic gate", () => {
  assert.ok(detectCrushingTranslations(makeRig({ boneCount: 10, drift: 0.4 })).length > 0);
  assert.equal(detectCrushingTranslations(makeRig({ boneCount: 3, drift: 0.4 })).length, 0);
});
