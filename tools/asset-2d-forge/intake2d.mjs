#!/usr/bin/env node
// Transactional 2D-asset intake: takes a source PNG + a render-spec-declared
// render type and lands it in the game-client 2D asset tree + the curated
// catalog-manifest.json as a single atomic, rollback-safe operation.
//
// This is the 2D analog of tools/asset-forge/intake.mjs (the glb intake) —
// same SHAPE (validate → snapshot → copy → write-entry → gate → rollback),
// different validator (render-spec-driven, see lib/validate2d.mjs) and a
// different sink (catalog-manifest.json, the curated driftGated:false 2D sink,
// NOT the codegen-keyed manifest.json).
//
// Order of operations:
//   1. validate — the source file exists, the render type is a real 2D
//      renderer in render-spec.json, the key is not in a reserved codegen
//      namespace, and every render-spec `require[]`/`oneOf` field for this
//      render is provided. ANY failure aborts with ZERO side effects.
//   2. snapshot — read catalog-manifest.json's exact bytes (and any PNG
//      already at the destination) before touching anything.
//   3. copy — the source PNG into game-client/assets/<subdir>/ (icons/ui/
//      tiles/vfx, chosen by render type).
//   4. write-entry — append the license/source-stamped entry to
//      catalog-manifest.json via the REUSED atomic writer (tmp+rename) from
//      tools/asset-forge/lib/manifest.mjs.
//   5. gate — run `node scripts/check_asset_manifest.mjs`.
//   6. rollback — on ANY failure after step 2, restore catalog-manifest.json
//      to its exact snapshot bytes and restore/delete the copied PNG.
//
// `dryRun:true` computes + returns the entry it WOULD write and touches
// nothing.
//
// DEFERRED — Godot `.import` sidecar. A real .import carries a Godot-generated
// `uid://` and a content hash that only Godot's own importer can produce; a
// hand-synthesized one would be wrong and would fight the editor on first
// open. So this tool intentionally does NOT write a .import. Generating the
// .import (and the client consuming these keys) is a deferred Godot-side step:
// open the project in Godot once so its importer bakes the sidecars, then
// commit them alongside.
//
// This tool writes to exactly TWO places — the copied PNG under
// game-client/assets/<subdir>/ and the catalog-manifest.json entry. It never
// writes manifest.json (codegen-keyed), render-spec.json, or scripts/.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
// REUSE the proven atomic manifest writer from the glb intake — do not
// reinvent tmp-file+rename semantics.
import {
  repoRoot,
  writeManifestAtomic,
  writeManifestRaw,
} from "../asset-forge/lib/manifest.mjs";
import { validate2d, SUBDIRS } from "./lib/validate2d.mjs";

// Fields (beyond license/source, which live at entry top-level) that a render
// type may require or reference in oneOf — passed straight through onto the
// entry when provided. The render-spec `require`/`oneOf` lists decide which of
// these are mandatory for a given render; this is just the passthrough set.
const RENDER_FIELDS = [
  "tileSize",
  "patchMargins",
  "frame",
  "frames",
  "atlas",
  "animations",
  "previewHashOf",
];

/**
 * Default drift-gate runner: spawns `node scripts/check_asset_manifest.mjs`
 * with cwd=root. Injectable via opts.driftGate for tests.
 * @param {{root: string}} ctx
 * @returns {Promise<{ok: boolean}>}
 */
function defaultDriftGateRunner({ root }) {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/check_asset_manifest.mjs"], {
      cwd: root,
      stdio: "inherit",
    });
    child.on("error", () => resolve({ ok: false }));
    child.on("exit", (code) => resolve({ ok: code === 0 }));
  });
}

/**
 * Build the catalog entry this call would land. Pure — no I/O.
 * `author` is optional: CC0 needs none, but any CC-BY* license requires a
 * non-empty author (the gate enforces it) so it is set only when provided.
 * @param {{src: string, render: string, license: string, source: string, author?: string, extras: object}} args
 */
function buildEntry({ src, render, license, source, author, extras }) {
  const basename = path.basename(src);
  const subdir = SUBDIRS[render];
  const entry = {
    scene: `res://assets/${subdir}/${basename}`,
    render,
    source,
    license,
  };
  if (author !== undefined) entry.author = author;
  for (const f of RENDER_FIELDS) {
    if (extras[f] !== undefined) entry[f] = extras[f];
  }
  return entry;
}

/**
 * Transactional intake of a source PNG into the game-client 2D asset tree +
 * catalog-manifest.json. Single-path options object (repo invariant — no
 * positional args, no boolean-flag branching that changes behavior).
 *
 * @param {object} opts
 * @param {string} opts.src            path to the source PNG
 * @param {string} opts.key            catalog key (e.g. "icon:sword")
 * @param {string} opts.render         2D render type (image|ninepatch|tileset|spritesheet)
 * @param {string} opts.license        license string (e.g. "CC0")
 * @param {string} opts.source         provenance string (required by render-spec)
 * @param {string} [opts.author]       attribution author — required by the gate for any CC-BY* license
 * @param {object} [opts.tileSize]     tileset: {w,h}
 * @param {object} [opts.patchMargins] ninepatch: {l,t,r,b}
 * @param {object} [opts.frame]        spritesheet: {w,h}
 * @param {number} [opts.frames]       spritesheet: frame count
 * @param {string} [opts.atlas]        spritesheet: atlas res:// path
 * @param {Array}  [opts.animations]   spritesheet: animation defs
 * @param {string} [opts.previewHashOf] baked-preview source path (passthrough)
 * @param {boolean}[opts.dryRun]       compute+return the entry, touch nothing
 * @param {string} [opts.root]         repo root (defaults to git toplevel)
 * @param {Function}[opts.driftGate]   injectable gate runner (tests)
 * @returns {Promise<{ok: boolean, actions: string[], entry?: object, failures?: string[]}>}
 */
export async function intake2d(opts = {}) {
  const {
    src,
    key,
    render,
    license,
    source,
    author,
    dryRun = false,
    root = repoRoot(),
    driftGate,
  } = opts;

  const actions = [];
  const fail = (...failures) => ({ ok: false, actions, failures });

  // --- Argument presence (single-path: every field is an explicit key) ---
  if (!src) return fail("intake2d: 'src' is required");
  if (!key) return fail("intake2d: 'key' is required");
  if (!render) return fail("intake2d: 'render' is required");

  // 1a. Source file must exist.
  if (!existsSync(src)) return fail(`source file not found: ${src}`);

  // Read render-spec.json — the single contract shared with the gate.
  const specPath = path.join(root, "game-client/assets/render-spec.json");
  let spec;
  try {
    spec = JSON.parse(readFileSync(specPath, "utf8"));
  } catch (err) {
    return fail(`render-spec read: ${err.message}`);
  }

  // 1b. Codegen boundary — a curated 2D asset may never squat a reserved
  //     codegen namespace (player/npc/mob:/projectile:/zone:/item:). Same rule
  //     the gate enforces (guard H), enforced here so we never even write it.
  const reserved = spec.codegenReservedNamespaces ?? [];
  if (reserved.some((ns) => key === ns || key.startsWith(ns))) {
    return fail(
      `key "${key}" uses a reserved codegen namespace ` +
        `(${reserved.join(", ")}) — forbidden in the curated catalog`,
    );
  }

  // Assemble the entry, then validate it against render-spec's require/oneOf.
  const extras = {};
  for (const f of RENDER_FIELDS) {
    if (opts[f] !== undefined) extras[f] = opts[f];
  }
  const entry = buildEntry({ src, render, license, source, author, extras });

  const { failures } = validate2d({ render, spec, entry, key });
  if (failures.length > 0) return { ok: false, actions, failures };
  actions.push(`validate: ${key} (${render}) OK`);

  const subdir = SUBDIRS[render];
  const assetsDir = path.join(root, "game-client/assets");
  const destDir = path.join(assetsDir, subdir);
  const destPath = path.join(destDir, path.basename(src));
  const catalogPath = path.join(assetsDir, "catalog-manifest.json");

  if (dryRun) {
    actions.push(`copy (planned): ${src} -> ${destPath}`);
    actions.push(`catalog (planned): write entries["${key}"]`);
    actions.push("drift-gate (planned): run");
    return { ok: true, actions, entry };
  }

  // 2. Snapshot the catalog's exact bytes BEFORE touching the filesystem, so
  //    a missing/malformed catalog aborts with zero side effects.
  let backupText;
  let catalog;
  try {
    backupText = readFileSync(catalogPath, "utf8");
    catalog = JSON.parse(backupText);
  } catch (err) {
    return fail(`catalog read: ${err.message}`);
  }
  catalog.entries ??= {};
  if (catalog.entries[key]) {
    return fail(`key "${key}" already exists in catalog-manifest.json`);
  }
  catalog.entries[key] = entry;

  // Snapshot any file already at destPath so rollback restores it byte-for-byte
  // rather than deleting a file that pre-existed this run.
  const destExisted = existsSync(destPath);
  const destBackup = destExisted ? readFileSync(destPath) : null;

  function rollback() {
    writeManifestRaw(catalogPath, backupText);
    if (destExisted) writeFileSync(destPath, destBackup);
    else rmSync(destPath, { force: true });
  }

  // 3. Copy the PNG into the 2D asset tree. Inside try/rollback: an overwrite
  //    copy that throws mid-write could truncate a pre-existing dest, so any
  //    failure here must trigger the same rollback (restore catalog + dest).
  try {
    mkdirSync(destDir, { recursive: true });
    copyFileSync(src, destPath);
  } catch (err) {
    rollback();
    return fail(`copy: ${err.message}`);
  }
  actions.push(`copy: ${src} -> ${destPath}`);

  // 4. Append the entry atomically (reused tmp+rename writer).
  try {
    writeManifestAtomic(catalogPath, catalog);
  } catch (err) {
    rollback();
    return fail(`catalog write: ${err.message}`);
  }
  actions.push(`catalog: wrote entries["${key}"]`);

  // 5. Drift-gate.
  const gate = driftGate ?? defaultDriftGateRunner;
  let gateResult;
  try {
    gateResult = await gate({ root, key });
  } catch (err) {
    gateResult = { ok: false, error: err.message };
  }
  if (!gateResult || !gateResult.ok) {
    rollback();
    return fail("drift-gate: failed (rolled back)");
  }
  actions.push("drift-gate: passed");

  return { ok: true, actions, entry };
}

/**
 * Minimal argv parser: `--flag value`, `--flag=value` (value may start with
 * `--`, e.g. license text), and boolean `--dry-run`. JSON-valued flags
 * (--tileSize, --patchMargins, --frame, --animations) are parsed by the
 * caller. Exported for testing.
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      flags["dry-run"] = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`missing value for --${body}`);
      }
      flags[body] = value;
      i++;
    }
  }
  return flags;
}

function printUsageAndExit() {
  console.error(
    "usage: node intake2d.mjs --src <png> --key <catalog-key> " +
      "--render <image|ninepatch|tileset|spritesheet> --license <text> " +
      "--source <provenance> [--author <name>] [--tileSize '<json>'] [--patchMargins '<json>'] " +
      "[--frame '<json>'] [--frames <n>] [--atlas <res://>] " +
      "[--animations '<json>'] [--dry-run]",
  );
  process.exit(1);
}

// JSON-valued CLI flags parsed into objects/arrays before handing to intake2d.
const JSON_FLAGS = ["tileSize", "patchMargins", "frame", "animations"];

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (!flags.src || !flags.key || !flags.render) printUsageAndExit();

  const parsed = {};
  for (const f of JSON_FLAGS) {
    if (flags[f] !== undefined) parsed[f] = JSON.parse(flags[f]);
  }
  if (flags.frames !== undefined) parsed.frames = Number(flags.frames);

  const result = await intake2d({
    src: path.resolve(flags.src),
    key: flags.key,
    render: flags.render,
    license: flags.license,
    source: flags.source,
    author: flags.author,
    atlas: flags.atlas,
    previewHashOf: flags.previewHashOf,
    dryRun: Boolean(flags["dry-run"]),
    ...parsed,
  });

  for (const action of result.actions) console.log(action);
  if (result.entry && (flags["dry-run"] || !result.ok)) {
    console.log(`entry: ${JSON.stringify(result.entry, null, 2)}`);
  }
  for (const failure of result.failures ?? []) console.log(`FAIL ${failure}`);

  process.exit(result.ok ? 0 : 1);
}

// Only run the CLI when executed directly — not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`intake2d.mjs: ERROR: ${err.message}`);
    process.exit(1);
  });
}
