#!/usr/bin/env node
// Extracts sorted, de-duplicated skin-joint node names from a donor .glb and
// writes them out as rig-reference JSON:
//   { "joints": [...sorted bone names...] }
//
// Usage:
//   node extract-bones.mjs <donor.glb> <out.json>
//
// This is a one-off authoring tool: run it once against a donor rig and
// commit the resulting JSON under rig-reference/. validate.mjs (a later
// task) compares incoming assets' joint names against the committed
// reference to catch rig-breaking renames.

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadGlb, jointNames } from "./lib/gltf.mjs";

async function main() {
  const [glbPath, outPath] = process.argv.slice(2);
  if (!glbPath || !outPath) {
    console.error("usage: node extract-bones.mjs <donor.glb> <out.json>");
    process.exit(1);
  }

  const doc = await loadGlb(glbPath);
  const joints = jointNames(doc);
  if (joints.length === 0) {
    console.error(`extract-bones.mjs: ERROR: no skin joints found in ${glbPath}`);
    process.exit(1);
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ joints }, null, 2) + "\n");
  console.log(`extract-bones.mjs: wrote ${outPath} (${joints.length} joints: ${joints.join(", ")})`);
}

main().catch((err) => {
  console.error(`extract-bones.mjs: ERROR: ${err.message}`);
  process.exit(1);
});
