#!/usr/bin/env node
// Generates tools/asset-storybook/audio-index.json — a flat listing of the raw
// Kenney RPG Audio seed pack under art-source/seed/audio/kenney-rpg-audio/.
//
// The asset storybook (tools/asset-storybook/index.html) fetches this file at
// runtime to render the soundboard. It exists so the page never has to guess
// or hand-invent the file list: this script reads the real directory on disk
// and writes it out. Re-run whenever files are added/removed from the seed
// pack:
//
//   node scripts/gen_audio_index.mjs
//
// Output shape:
//   { "version": 1, "generatedAt": "<ISO8601>", "sourceDir": "art-source/seed/audio/kenney-rpg-audio",
//     "files": [ { "name": "chop.ogg", "bytes": 9370 }, ... ] }

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const SOURCE_DIR_REL = "art-source/seed/audio/kenney-rpg-audio";
const SOURCE_DIR = join(REPO_ROOT, SOURCE_DIR_REL);
const OUT_PATH = join(REPO_ROOT, "tools/asset-storybook/audio-index.json");

function main() {
  const entries = readdirSync(SOURCE_DIR, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".ogg"))
    .map((e) => {
      const full = join(SOURCE_DIR, e.name);
      const { size } = statSync(full);
      return { name: e.name, bytes: size };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceDir: SOURCE_DIR_REL,
    files,
  };

  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${files.length} entries -> ${OUT_PATH}`);
}

main();
