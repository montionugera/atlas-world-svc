#!/usr/bin/env node
// Generates the .glb fixtures consumed by tests/*.test.mjs, under fixtures/
// (gitignored, regenerated on every `npm test` via the `pretest` script).
//
// Fixtures, all derived from the kenney-mini-characters donor
// (art-source/seed/kenney-mini-characters/character-male-b.glb):
//   good.glb          - donor scaled to 1.8u via root-node scale, stamped
//   too_short.glb     - donor as-is (unscaled), stamped
//   missing_clip.glb  - good.glb minus the "die" animation clip
//   renamed_bone.glb  - good.glb with one joint renamed (rig-breaking)
//   no_provenance.glb - good.glb, unstamped
//
// Skips (exit 0) rather than failing if the donor is an unresolved git-lfs
// pointer, so this doesn't hard-fail on a machine/CI without LFS objects
// pulled.

import { NodeIO } from "@gltf-transform/core";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadGlb, sceneHeight, jointNames } from "../lib/gltf.mjs";
import { stampGlb } from "../stamp.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FORGE_DIR = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(FORGE_DIR, "../..");
const DONOR = path.join(
  REPO_ROOT,
  "art-source/seed/kenney-mini-characters/character-male-b.glb",
);
const FIXTURES_DIR = path.join(FORGE_DIR, "fixtures");
const TARGET_HEIGHT = 1.8;

// Fake but well-formed provenance for fixtures -- these aren't real bakes,
// just documents whose stamp needs to read back non-null.
const FIXTURE_PROVENANCE = {
  blender: "4.5.11",
  blendSha256: "0".repeat(64),
};

// The donor references an external "Textures/colormap.png" that isn't
// shipped alongside the .glb (loadGlb tolerates this at read time via
// setStrictResources(false)). Writing back to .glb requires every texture to
// carry real embedded image bytes though, so any texture left imageless by
// the lenient read gets backfilled with a minimal valid 1x1 PNG -- these
// fixtures are for rig/height/clip/provenance checks, not texture content.
const PLACEHOLDER_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000a4944415478da63000100000500010d0a2db400000000" +
    "49454e44ae426082",
  "hex",
);

function fillMissingTextureData(doc) {
  for (const texture of doc.getRoot().listTextures()) {
    if (!texture.getImage()) {
      texture.setImage(PLACEHOLDER_PNG).setMimeType("image/png");
    }
  }
  return doc;
}

function isLfsPointer(filePath) {
  const head = readFileSync(filePath, { encoding: "utf8", flag: "r" }).slice(
    0,
    200,
  );
  return head.startsWith("version https://git-lfs");
}

function getPrimaryScene(doc) {
  const root = doc.getRoot();
  return root.getDefaultScene() ?? root.listScenes()[0];
}

async function writeDoc(doc, outPath) {
  const io = new NodeIO().setStrictResources(false);
  await io.write(outPath, doc);
}

/** Loads a fresh copy of the donor, with placeholder texture data backfilled. */
async function loadDonor() {
  const doc = await loadGlb(DONOR);
  return fillMissingTextureData(doc);
}

/** Loads a fresh copy of the donor, scaled (via root scene-node scale) to TARGET_HEIGHT. */
async function loadScaledDonor() {
  const doc = await loadDonor();
  const factor = TARGET_HEIGHT / sceneHeight(doc);
  const scene = getPrimaryScene(doc);
  for (const node of scene.listChildren()) {
    const [sx, sy, sz] = node.getScale();
    node.setScale([sx * factor, sy * factor, sz * factor]);
  }
  return doc;
}

async function main() {
  if (isLfsPointer(DONOR)) {
    console.log(
      `make-fixtures.mjs: SKIP (donor is an unresolved git-lfs pointer, not a real file: ${DONOR})`,
    );
    process.exit(0);
  }

  mkdirSync(FIXTURES_DIR, { recursive: true });

  // good.glb: donor scaled to 1.8u, stamped.
  const goodPath = path.join(FIXTURES_DIR, "good.glb");
  await writeDoc(await loadScaledDonor(), goodPath);
  await stampGlb(goodPath, FIXTURE_PROVENANCE);
  console.log(`make-fixtures.mjs: wrote ${goodPath}`);

  // too_short.glb: donor as-is (unscaled, ~0.7u), stamped.
  const tooShortPath = path.join(FIXTURES_DIR, "too_short.glb");
  await writeDoc(await loadDonor(), tooShortPath);
  await stampGlb(tooShortPath, FIXTURE_PROVENANCE);
  console.log(`make-fixtures.mjs: wrote ${tooShortPath}`);

  // missing_clip.glb: good.glb minus the "die" animation.
  const missingClipPath = path.join(FIXTURES_DIR, "missing_clip.glb");
  const missingClipDoc = await loadScaledDonor();
  const dieClip = missingClipDoc
    .getRoot()
    .listAnimations()
    .find((anim) => anim.getName() === "die");
  if (!dieClip) {
    throw new Error('donor is missing an expected "die" animation clip');
  }
  dieClip.dispose();
  await writeDoc(missingClipDoc, missingClipPath);
  await stampGlb(missingClipPath, FIXTURE_PROVENANCE);
  console.log(`make-fixtures.mjs: wrote ${missingClipPath} (dropped "die" clip)`);

  // renamed_bone.glb: good.glb with one joint renamed -> rig-breaking.
  const renamedBonePath = path.join(FIXTURES_DIR, "renamed_bone.glb");
  const renamedBoneDoc = await loadScaledDonor();
  const joints = jointNames(renamedBoneDoc);
  const renameFrom = joints.includes("arm-left") ? "arm-left" : joints[0];
  const renameTo = "arm_left_x";
  let renamedCount = 0;
  for (const skin of renamedBoneDoc.getRoot().listSkins()) {
    for (const joint of skin.listJoints()) {
      if (joint.getName() === renameFrom) {
        joint.setName(renameTo);
        renamedCount++;
      }
    }
  }
  if (renamedCount === 0) {
    throw new Error(`could not find joint "${renameFrom}" to rename`);
  }
  await writeDoc(renamedBoneDoc, renamedBonePath);
  await stampGlb(renamedBonePath, FIXTURE_PROVENANCE);
  console.log(
    `make-fixtures.mjs: wrote ${renamedBonePath} (renamed joint "${renameFrom}" -> "${renameTo}")`,
  );

  // no_provenance.glb: good.glb, unstamped.
  const noProvenancePath = path.join(FIXTURES_DIR, "no_provenance.glb");
  await writeDoc(await loadScaledDonor(), noProvenancePath);
  console.log(`make-fixtures.mjs: wrote ${noProvenancePath} (unstamped)`);
}

main().catch((err) => {
  console.error(`make-fixtures.mjs: ERROR: ${err.message}`);
  process.exit(1);
});
