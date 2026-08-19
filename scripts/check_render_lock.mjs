#!/usr/bin/env node
// Plan A Task 10 — G-RENDER-LOCK CLI.
//
// --check  rebuild every SHEETS entry, hash it, and assert BOTH that the hash
//          matches content/world/render-lock.json AND that the committed SVG
//          on disk is that same artifact. The first catches a stale lock; the
//          second catches a stale committed sheet — which is what
//          scripts/check_map_render.mjs used to do and this absorbs.
// --write  re-baseline the lock. Does NOT write the SVGs: re-rendering is
//          `node tools/mapforge/render-sheet.mjs --sheet <id>`, and keeping
//          the two commands separate is what makes a re-baseline a decision.
//
// Both modes refuse to run when ANY sheet reports build problems. That is
// what keeps computeLock's `continue`-past-a-broken-sheet from ever producing
// a green --check or a silently shrunken --write.
//
// main() guarded by import.meta.url, same pattern as check_spine_emit.mjs:277.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SHEETS } from "../tools/mapforge/render-sheet.mjs";
import { computeLock, checkLock, unifiedDiff } from "./lib/render-lock.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK_PATH = join(ROOT, "content/world/render-lock.json");

function readLock() {
  try {
    return JSON.parse(readFileSync(LOCK_PATH, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  const argv = process.argv.slice(2);
  let mode = "check";
  for (const arg of argv) {
    if (arg === "--check") mode = "check";
    else if (arg === "--write") mode = "write";
    else {
      console.error(`check-render-lock: unknown arg ${arg}`);
      process.exit(2);
    }
  }

  // Build once; both modes need the same bytes.
  const built = {};
  const problems = [];
  for (const [id, sheet] of Object.entries(SHEETS)) {
    const r = sheet.build({ repoRoot: ROOT });
    if (r.problems.length)
      problems.push(...r.problems.map((p) => `${id}: ${p}`));
    else built[sheet.outSvg] = r.svg;
  }
  if (problems.length) {
    for (const p of problems) console.error(`check-render-lock: PROBLEM: ${p}`);
    process.exit(1);
  }

  const computed = computeLock({ repoRoot: ROOT, sheets: SHEETS });

  if (mode === "write") {
    mkdirSync(dirname(LOCK_PATH), { recursive: true });
    writeFileSync(LOCK_PATH, JSON.stringify(computed, null, 2) + "\n");
    console.log(
      `check-render-lock: wrote ${Object.keys(computed.artifacts).length} artifact hashes to content/world/render-lock.json`,
    );
    process.exit(0);
  }

  const committed = readLock();
  if (!committed) {
    console.error(
      "G-RENDER-LOCK: content/world/render-lock.json is missing — baseline it with `node scripts/check_render_lock.mjs --write`",
    );
    process.exit(1);
  }

  let bad = 0;
  const { drift, missing, extra } = checkLock({
    committed: committed.artifacts,
    computed: computed.artifacts,
  });
  for (const path of drift) {
    console.error(
      `G-RENDER-LOCK: ${path} sha256 ${computed.artifacts[path]} != locked ${committed.artifacts[path]}`,
    );
    let onDisk = "";
    try {
      onDisk = readFileSync(join(ROOT, path), "utf8");
    } catch {
      /* missing */
    }
    const d = unifiedDiff({ a: onDisk, b: built[path] ?? "" });
    if (d) console.error(d);
    bad++;
  }
  for (const path of missing) {
    console.error(
      `G-RENDER-LOCK: ${path} is locked but nothing builds it any more`,
    );
    bad++;
  }
  for (const path of extra) {
    console.error(
      `G-RENDER-LOCK: ${path} builds but has no lock row — baseline it with --write`,
    );
    bad++;
  }

  // Second assertion: the COMMITTED file must be the artifact the lock names.
  // A green lock over a stale committed SVG is exactly what check_map_render.mjs
  // existed to prevent, and dropping it would be a coverage regression.
  for (const [path, svg] of Object.entries(built)) {
    let onDisk = null;
    try {
      onDisk = readFileSync(join(ROOT, path), "utf8");
    } catch {
      /* missing = stale */
    }
    if (onDisk === svg) continue;
    console.error(
      `G-RENDER-LOCK: ${path} on disk is not the artifact it builds to — re-render with \`node tools/mapforge/render-sheet.mjs --sheet <id>\``,
    );
    const d = unifiedDiff({ a: onDisk ?? "", b: svg });
    if (d) console.error(d);
    bad++;
  }

  if (bad) process.exit(1);
  console.log(
    `check-render-lock: check clean, ${Object.keys(computed.artifacts).length} artifacts`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
