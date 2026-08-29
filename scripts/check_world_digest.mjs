#!/usr/bin/env node
// G-WORLD-DIGEST CLI. --check compares content/spine/world-digest.json against
// a fresh computation; --write re-baselines it. Exactly the affordance
// check_spine_emit.mjs and check_render_lock.mjs already have.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { computeWorldDigest, checkWorldDigest } from "./lib/world-digest.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = join(REPO_ROOT, "content/spine/world-digest.json");

function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes("--write");
  const computed = computeWorldDigest({ repoRoot: REPO_ROOT });
  if (write) {
    writeFileSync(LOCK, JSON.stringify(computed, null, 2) + "\n", "utf8");
    console.log(`world-digest: wrote ${computed.digest}`);
    for (const [k, v] of Object.entries(computed.inputs)) console.log(`  ${k}  ${v}`);
    process.exit(0);
  }
  if (!existsSync(LOCK)) {
    console.error("G-WORLD-DIGEST: content/spine/world-digest.json is missing — run --write");
    process.exit(1);
  }
  const committed = JSON.parse(readFileSync(LOCK, "utf8"));
  const problems = checkWorldDigest({ committed, computed });
  console.log("world-digest · check");
  for (const [k, v] of Object.entries(computed.inputs)) console.log(`  ${k}  ${v}`);
  if (problems.length) {
    console.error("\n  PROBLEMS:");
    for (const p of problems) console.error(`    ${p}`);
    process.exit(1);
  }
  console.log(`\n  ${computed.digest} — matches`);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
