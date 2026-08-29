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
// --repo-root <dir> points every read and write at a different tree. It exists
//          so the suite can prove this gate FIRES without truncating the real,
//          TRACKED committed SVG: two test files doing that concurrently is a
//          lost-update race on a drawn artifact (see
//          scripts/tests/helpers/temp-repo.mjs for the measurement).
//
// main() guarded by import.meta.url, same pattern as check_spine_emit.mjs:277.
//
// ── process.exitCode, NEVER process.exit() — THE GATE WAS LOSING ITS REPORT ──
//
// STATE §19 retired this class in check_content.mjs and it survived here, on
// the one path this seam made TEN TIMES LARGER: lockExtraPaths() took the lock
// from 3 artifacts to 32, so a single content/world/fabric/*.json change now
// redraws the fabric sheet and prints a six-figure unified diff. On POSIX,
// console.error to a PIPE is asynchronous and process.exit() discards whatever
// libuv has not flushed. MEASURED in node:18 (the pinned CI Node) with one
// fabric file removed: 104,257 bytes when stdout was a FILE (synchronous fd),
// and 8,413–16,605 bytes over six runs when it was a PIPE — 84–92 % of the
// report gone, a different amount each run. The exit code stayed honest
// throughout, which is what makes it invisible. Every `run:` step in ci.yml and
// every run_section capture in precheck.sh / integration.sh is a pipe.
//
// main() is the module's last statement and every branch below is in tail
// position, so `process.exitCode = n; return;` is exactly equivalent for the
// exit status and correct for the output. scripts/tests/render-lock.test.mjs
// pins the absence of process.exit() by source assertion, because the loss
// cannot be reproduced on the macOS box the suite is written on.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SHEETS } from "../tools/mapforge/render-sheet.mjs";
import { computeLock, checkLock, unifiedDiff, lockExtraPaths } from "./lib/render-lock.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK_REL = "content/world/render-lock.json";

function readLock(lockPath) {
  try {
    return JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  const argv = process.argv.slice(2);
  let mode = "check";
  let root = DEFAULT_ROOT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") mode = "check";
    else if (arg === "--write") mode = "write";
    else if (arg === "--repo-root") {
      const dir = argv[++i];
      if (!dir) {
        console.error("check-render-lock: --repo-root needs a directory");
        process.exitCode = 2;
        return;
      }
      root = resolve(dir);
    } else {
      console.error(`check-render-lock: unknown arg ${arg}`);
      process.exitCode = 2;
      return;
    }
  }
  const LOCK_PATH = join(root, LOCK_REL);

  // Build once; both modes need the same bytes, and computeLock below is
  // handed these rather than rebuilding every sheet a second time.
  const built = {};
  const problems = [];
  for (const [id, sheet] of Object.entries(SHEETS)) {
    const r = sheet.build({ repoRoot: root });
    if (r.problems.length)
      problems.push(...r.problems.map((p) => `${id}: ${p}`));
    else built[sheet.outSvg] = r.svg;
  }
  if (problems.length) {
    for (const p of problems) console.error(`check-render-lock: PROBLEM: ${p}`);
    process.exitCode = 1;
    return;
  }

  const computed = computeLock({ repoRoot: root, sheets: SHEETS, built, extraPaths: lockExtraPaths({ repoRoot: root }) });

  if (mode === "write") {
    mkdirSync(dirname(LOCK_PATH), { recursive: true });
    writeFileSync(LOCK_PATH, JSON.stringify(computed, null, 2) + "\n");
    console.log(
      `check-render-lock: wrote ${Object.keys(computed.artifacts).length} artifact hashes to ${LOCK_REL}`,
    );
    return;
  }

  const committed = readLock(LOCK_PATH);
  if (!committed) {
    console.error(
      "G-RENDER-LOCK: content/world/render-lock.json is missing — baseline it with `node scripts/check_render_lock.mjs --write`",
    );
    process.exitCode = 1;
    return;
  }

  let bad = 0;

  // The lock's HEADER is part of the record, not decoration. GENERATOR_VERSION
  // exists so a re-baseline caused by a tool change is distinguishable from one
  // caused by a world change — which it cannot be if the committed field is
  // allowed to say 3.0.0 while the tool says 3.1.0 and --check stays green.
  // Checked here rather than inside checkLock() because checkLock's signature
  // ({committed, computed} -> {drift, missing, extra}) is the artifacts-only
  // contract Plans C and E consume.
  if (committed.version !== computed.version) {
    console.error(
      `G-RENDER-LOCK: lock version ${JSON.stringify(committed.version)} != ${computed.version} — re-baseline with --write`,
    );
    bad++;
  }
  if (
    committed.generator?.name !== computed.generator.name ||
    committed.generator?.version !== computed.generator.version
  ) {
    console.error(
      `G-RENDER-LOCK: lock generator ${JSON.stringify(committed.generator ?? null)} != ${JSON.stringify(computed.generator)} — re-baseline with --write`,
    );
    bad++;
  }

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
      onDisk = readFileSync(join(root, path), "utf8");
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
      onDisk = readFileSync(join(root, path), "utf8");
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

  if (bad) {
    process.exitCode = 1;
    return;
  }
  console.log(
    `check-render-lock: check clean, ${Object.keys(computed.artifacts).length} artifacts`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
