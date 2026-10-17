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
import { fileURLToPath } from "node:url";

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

/**
 * Reads a .glb, injects (or refreshes) its atlas-forge provenance stamp, and
 * writes it back to the same path in place. Shared by the stamp.mjs CLI and
 * by anything else (e.g. test fixture generation) that needs the exact same
 * stamp-writing code path.
 * @param {string} glbPath
 * @param {{ blender: string, blendSha256: string }} provenance
 * @returns {Promise<object>} the stamp that was written
 */
export async function stampGlb(glbPath, { blender, blendSha256 }) {
  const doc = await loadGlb(glbPath);
  const asset = doc.getRoot().getAsset();

  asset.extras = {
    ...asset.extras,
    atlasForge: {
      blender,
      blendSha256,
      forge: "1",
    },
  };

  const io = new NodeIO().setStrictResources(false);
  await io.write(glbPath, doc);

  return readStamp(doc);
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

  const stamp = await stampGlb(glbPath, {
    blender: flags.blender,
    blendSha256: flags["blend-sha"],
  });
  console.log(`stamp.mjs: wrote ${glbPath} -> ${JSON.stringify(stamp)}`);
}

// Only run the CLI when this file is executed directly (e.g. `node stamp.mjs
// ...` from bake.sh) -- not when `stampGlb` is imported as a module by
// something like tests/make-fixtures.mjs.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`stamp.mjs: ERROR: ${err.message}`);
    process.exit(1);
  });
}
