#!/usr/bin/env node
// Injects (or refreshes) an atlas-forge provenance stamp into a .glb's
// asset.extras, in place.
//
// Usage:
//   node stamp.mjs <glb> --blender <version> --blend-sha <sha256>
//
// Idempotent: re-running with the same inputs against an already-stamped glb
// overwrites asset.extras.atlasForge with the same object rather than
// appending/duplicating anything.

import { NodeIO } from "@gltf-transform/core";
import { loadGlb, readStamp } from "./lib/gltf.mjs";

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`missing value for --${key}`);
      }
      flags[key] = value;
      i++;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [glbPath] = positional;

  if (!glbPath || !flags.blender || !flags["blend-sha"]) {
    console.error(
      "usage: node stamp.mjs <glb> --blender <version> --blend-sha <sha256>",
    );
    process.exit(1);
  }

  const doc = await loadGlb(glbPath);
  const asset = doc.getRoot().getAsset();

  asset.extras = {
    ...asset.extras,
    atlasForge: {
      blender: flags.blender,
      blendSha256: flags["blend-sha"],
      forge: "1",
    },
  };

  const io = new NodeIO().setStrictResources(false);
  await io.write(glbPath, doc);

  const stamp = readStamp(doc);
  console.log(`stamp.mjs: wrote ${glbPath} -> ${JSON.stringify(stamp)}`);
}

main().catch((err) => {
  console.error(`stamp.mjs: ERROR: ${err.message}`);
  process.exit(1);
});
