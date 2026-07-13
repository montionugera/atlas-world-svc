#!/usr/bin/env node
// Asset manifest drift-gate (F-002, Stage 0): keys ↔ manifest ↔ files ↔ license.
//
// Asserts that the committed client asset manifest is internally consistent with
// the codegen-emitted key set (the single source of truth) and with the files on
// disk. Mirrors the spirit of colyseus-server/scripts/test_contracts.sh.
//
// Inputs (defaults resolve relative to the repo root):
//   - colyseus-server/generated/asset-keys.json  { version, keys: [{ id, kind }] }
//   - game-client/assets/manifest.json           { version, entries: { <id>: { scene, source, license, tier, kind } } }
//   - game-client/assets/audio-manifest.json     { version, entries: { <event>: { stream, license } } }
//   - res:// scene/stream paths resolve against game-client/ (the Godot project root).
//
// Rules (visual manifest):
//   FAILURE  — manifest/keys file missing or malformed
//   FAILURE  — an entry's `scene` is not a res:// path, or the resolved file is missing
//   FAILURE  — an entry's `license` is empty/whitespace
//   FAILURE  — an entry's `source` is empty/whitespace
//   WARNING  — a key present in asset-keys.json has no manifest entry (UNMAPPED)
//   WARNING  — a manifest entry whose id is not a known asset key (UNKNOWN)
//
// Rules (audio manifest — event keys like `sfx:attack` are a curated set, not
// codegen-derived, so this only checks the manifest is internally consistent,
// not that it maps 1:1 onto some generated key list):
//   FAILURE  — audio-manifest.json missing or malformed
//   FAILURE  — an entry's `stream` is not a res:// path, or the resolved file is
//              missing / not a regular file / zero bytes
//   FAILURE  — an entry's `license` is empty/whitespace
//
// Stage-0 default: unmapped keys are warnings (the manifest ships empty and
// fills in over Stage 0.5). Pass --require-complete to make unmapped keys a
// hard FAILURE (Stage 0.5+ once every key is expected to resolve).
//
// Collects ALL violations before exiting (no fail-fast) for a useful report.
// Exit 0 iff there are no FAILUREs; else exit 1.
//
// Flags:
//   --require-complete       unmapped keys become failures
//   --keys <path>            override asset-keys.json path (testing)
//   --manifest <path>        override manifest.json path (testing)
//   --audio-manifest <path>  override audio-manifest.json path (testing)
//   --game-client <dir>      override the res:// root dir (testing)

import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function parseArgs(argv) {
  const opts = {
    requireComplete: false,
    keys: join(REPO_ROOT, "colyseus-server/generated/asset-keys.json"),
    manifest: join(REPO_ROOT, "game-client/assets/manifest.json"),
    audioManifest: join(REPO_ROOT, "game-client/assets/audio-manifest.json"),
    gameClient: join(REPO_ROOT, "game-client"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--require-complete") opts.requireComplete = true;
    else if (a === "--keys") opts.keys = resolve(argv[++i]);
    else if (a === "--manifest") opts.manifest = resolve(argv[++i]);
    else if (a === "--audio-manifest") opts.audioManifest = resolve(argv[++i]);
    else if (a === "--game-client") opts.gameClient = resolve(argv[++i]);
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

// Read + parse JSON, pushing a FAILURE (and returning null) on any problem so
// the caller can bail cleanly instead of throwing.
function readJson(path, label, failures) {
  if (!existsSync(path)) {
    failures.push(`${label}: file not found at ${path}`);
    return null;
  }
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    failures.push(`${label}: cannot read ${path} — ${e.message}`);
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    failures.push(`${label}: malformed JSON in ${path} — ${e.message}`);
    return null;
  }
}

// Resolve a res:// scene path to a filesystem path under the game-client root.
// Returns null if the value is not a proper res:// path.
function resolveResPath(scene, gameClientRoot) {
  if (typeof scene !== "string" || !scene.startsWith("res://")) return null;
  const relative = scene.slice("res://".length);
  return join(gameClientRoot, relative);
}

function isNonEmpty(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const failures = [];
  const warnings = [];

  // Audio manifest validation is independent of the visual manifest/keys —
  // run it unconditionally so it isn't skipped by an early bail-out below.
  validateAudioManifest(opts, failures, warnings);

  const keysDoc = readJson(opts.keys, "asset-keys", failures);
  const manifestDoc = readJson(opts.manifest, "manifest", failures);

  // If either file failed to load/parse, there's nothing further to check.
  if (keysDoc === null || manifestDoc === null) {
    return report(failures, warnings, opts);
  }

  const keys = Array.isArray(keysDoc.keys) ? keysDoc.keys : null;
  if (keys === null) {
    failures.push("asset-keys: expected a `keys` array");
  }
  const entries =
    manifestDoc.entries && typeof manifestDoc.entries === "object"
      ? manifestDoc.entries
      : null;
  if (entries === null) {
    failures.push("manifest: expected an `entries` object");
  }
  if (keys === null || entries === null) {
    return report(failures, warnings, opts);
  }

  const keyIds = new Set(keys.map((k) => k && k.id).filter(Boolean));

  // 1. Validate every manifest entry: scene file exists, license + source set.
  for (const [id, entry] of Object.entries(entries)) {
    if (!entry || typeof entry !== "object") {
      failures.push(`entry "${id}": not an object`);
      continue;
    }

    const fsPath = resolveResPath(entry.scene, opts.gameClient);
    if (fsPath === null) {
      failures.push(
        `entry "${id}": scene must be a res:// path (got ${JSON.stringify(entry.scene)})`,
      );
    } else if (!existsSync(fsPath) || !statSync(fsPath).isFile()) {
      failures.push(
        `entry "${id}": scene file not found — ${entry.scene} → ${fsPath}`,
      );
    }

    if (!isNonEmpty(entry.license)) {
      failures.push(`entry "${id}": license is empty`);
    }
    if (!isNonEmpty(entry.source)) {
      failures.push(`entry "${id}": source is empty`);
    }

    // A manifest entry for an id the codegen doesn't know about is drift —
    // warn (not fatal), since it points at a stale/renamed key.
    if (!keyIds.has(id)) {
      warnings.push(`entry "${id}": not a known asset key (stale or renamed?)`);
    }
  }

  // 2. Every generated key should eventually have a manifest entry. Stage-0:
  //    unmapped is a warning; --require-complete makes it a hard failure.
  for (const id of keyIds) {
    if (!(id in entries)) {
      const msg = `key "${id}": no manifest entry (UNMAPPED)`;
      if (opts.requireComplete) failures.push(msg);
      else warnings.push(msg);
    }
  }

  return report(failures, warnings, opts);
}

function validateAudioManifest(opts, failures, warnings) {
  const audioDoc = readJson(opts.audioManifest, "audio-manifest", failures);
  if (audioDoc === null) return;

  const entries =
    audioDoc.entries && typeof audioDoc.entries === "object"
      ? audioDoc.entries
      : null;
  if (entries === null) {
    failures.push("audio-manifest: expected an `entries` object");
    return;
  }

  for (const [id, entry] of Object.entries(entries)) {
    if (!entry || typeof entry !== "object") {
      failures.push(`audio entry "${id}": not an object`);
      continue;
    }

    const fsPath = resolveResPath(entry.stream, opts.gameClient);
    if (fsPath === null) {
      failures.push(
        `audio entry "${id}": stream must be a res:// path (got ${JSON.stringify(entry.stream)})`,
      );
    } else if (!existsSync(fsPath) || !statSync(fsPath).isFile()) {
      failures.push(
        `audio entry "${id}": stream file not found — ${entry.stream} → ${fsPath}`,
      );
    } else if (statSync(fsPath).size === 0) {
      failures.push(
        `audio entry "${id}": stream file is empty — ${entry.stream} → ${fsPath}`,
      );
    }

    if (!isNonEmpty(entry.license)) {
      failures.push(`audio entry "${id}": license is empty`);
    }
  }
}

function report(failures, warnings, opts) {
  console.log("asset-manifest drift-gate");
  console.log(
    `  mode: ${opts.requireComplete ? "require-complete (Stage 0.5+)" : "stage-0 (unmapped = warning)"}`,
  );
  console.log(`  keys:           ${opts.keys}`);
  console.log(`  manifest:       ${opts.manifest}`);
  console.log(`  audio-manifest: ${opts.audioManifest}`);
  console.log("");

  for (const w of warnings) console.log(`  ⚠️  WARN  ${w}`);
  for (const f of failures) console.log(`  ❌ FAIL  ${f}`);

  console.log("");
  console.log(`  ${warnings.length} warning(s), ${failures.length} failure(s)`);

  if (failures.length > 0) {
    console.log("❌ asset-manifest drift-gate FAILED");
    process.exit(1);
  }
  console.log("✅ asset-manifest drift-gate passed");
  process.exit(0);
}

main();
