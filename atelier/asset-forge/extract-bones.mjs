#!/usr/bin/env node
// Extracts sorted, de-duplicated skin-joint node names from a donor .glb and
// writes them out as rig-reference JSON:
//   { "joints": [...sorted bone names...], "parents": { joint: parentJoint|null } }
// With --allow-extras the reference also carries allowExtras:true plus the
// default sec_/prop_ parent allow-lists (see validate.mjs skeleton rules).
//
// Usage:
//   node extract-bones.mjs <donor.glb> <out.json> [--allow-extras]
//
// This is a one-off authoring tool: run it once against a donor rig and
// commit the resulting JSON under rig-reference/. validate.mjs (a later
// task) compares incoming assets' joint names against the committed
// reference to catch rig-breaking renames.

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadGlb, jointNames, jointParents } from "./lib/gltf.mjs";

// Default S3 allow-lists written by --allow-extras. Names absent from the
// donor's joint set are dropped (and reported) rather than kept dangling.
const DEFAULT_SEC_PARENTS = ["head", "chest", "spine", "hips", "upperleg.l", "upperleg.r"];
const DEFAULT_SLEEVE_PARENTS = ["upperarm.l", "upperarm.r", "lowerarm.l", "lowerarm.r"];
const DEFAULT_PROP_PARENTS = [
  "hand.l", "hand.r", "wrist.l", "wrist.r", "lowerarm.l", "lowerarm.r",
  "handslot.l", "handslot.r", "head", "chest", "spine", "hips", "root",
];

async function main() {
  const args = process.argv.slice(2);
  const allowExtras = args.includes("--allow-extras");
  const [glbPath, outPath] = args.filter((a) => a !== "--allow-extras");
  if (!glbPath || !outPath) {
    console.error("usage: node extract-bones.mjs <donor.glb> <out.json> [--allow-extras]");
    process.exit(1);
  }

  const doc = await loadGlb(glbPath);
  const joints = jointNames(doc);
  if (joints.length === 0) {
    console.error(`extract-bones.mjs: ERROR: no skin joints found in ${glbPath}`);
    process.exit(1);
  }

  const reference = { joints, parents: jointParents(doc) };
  if (allowExtras) {
    reference.allowExtras = true;
    for (const [key, names] of [
      ["secParents", DEFAULT_SEC_PARENTS],
      ["sleeveParents", DEFAULT_SLEEVE_PARENTS],
      ["propParents", DEFAULT_PROP_PARENTS],
    ]) {
      reference[key] = names.filter((n) => joints.includes(n));
      const dropped = names.filter((n) => !joints.includes(n));
      if (dropped.length) console.log(`extract-bones.mjs: ${key} dropped (not in joint set): ${dropped.join(", ")}`);
    }
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(reference, null, 2) + "\n");
  console.log(`extract-bones.mjs: wrote ${outPath} (${joints.length} joints: ${joints.join(", ")})`);
}

main().catch((err) => {
  console.error(`extract-bones.mjs: ERROR: ${err.message}`);
  process.exit(1);
});
