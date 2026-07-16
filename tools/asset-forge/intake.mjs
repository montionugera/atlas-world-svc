#!/usr/bin/env node
// Transactional intake: takes a baked, validated .glb and lands it in the
// game-client asset tree as a single atomic operation.
//
// Order of operations:
//   1. validate the source .glb (validateGlb, kind "character", tier
//      "bespoke", against `<root>/art-source/LICENSES.md`) -- any failure
//      aborts with zero side effects.
//   2. read + parse the manifest and snapshot any glb already at the
//      destination -- a missing/malformed manifest aborts here, still with
//      zero side effects (nothing has been copied yet).
//   3. copy the .glb into `<root>/game-client/assets/characters/`, then
//      write the flipped entry `{scene, source: "internal", license, tier:
//      "bespoke", kind: "character"}` atomically.
//   4. run the drift-gate (`node <root>/scripts/check_asset_manifest.mjs`
//      by default, injectable via `driftGate` for tests).
//   5. on ANY failure after step 2, roll back: restore the manifest to its
//      exact pre-write bytes, and either restore the pre-existing glb bytes
//      (re-intake) or delete the newly-copied glb.
//
// Usage:
//   node intake.mjs <glb> --key <manifest-key> --license "<text>" [--dry-run]
//                   [--anims '<json>']
//
// Exit 0 on success, 1 on any failure (validation, drift-gate, or thrown
// error). `--dry-run` reports the actions that would be taken and exits 0
// without touching the filesystem. `--anims` overrides the clip-name mapping
// used for the required-states check (see validateGlb) and is written into
// the manifest entry as `anims`; its keys must exactly be a subset of the
// "character" kind's requiredStates -- an unknown state key aborts with zero
// side effects, same as any other validation failure.

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
import { validateGlb, loadConfig } from "./validate.mjs";
import {
  repoRoot,
  writeManifestAtomic,
  writeManifestRaw,
} from "./lib/manifest.mjs";

const REMINDER = "Commit the Godot .import sidecar together with the glb";

/**
 * Default drift-gate runner: spawns
 * `node scripts/check_asset_manifest.mjs` with cwd=root.
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
 * Transactional intake of a baked .glb into the game-client asset tree.
 * @param {string} glbPath
 * @param {{key: string, license: string, root: string, dryRun?: boolean, anims?: object|null, driftGate?: (ctx: {root: string, key: string}) => Promise<{ok: boolean}>}} opts
 * @returns {Promise<{ok: boolean, actions: string[], failures?: string[]}>}
 */
export async function intake(glbPath, opts = {}) {
  const { key, license, root, dryRun = false, anims = null, driftGate } = opts;
  if (!key) throw new Error("intake: 'key' is required");
  if (!root) throw new Error("intake: 'root' is required");

  const actions = [];
  const manifestPath = path.join(root, "game-client/assets/manifest.json");
  const charactersDir = path.join(root, "game-client/assets/characters");
  const licenseLedgerPath = path.join(root, "art-source/LICENSES.md");
  const basename = path.basename(glbPath);
  const name = basename.replace(/\.glb$/i, "");
  const destPath = path.join(charactersDir, basename);
  const scene = `res://assets/characters/${name}.glb`;

  // 0. anims (if given) must be a plain object whose keys are exactly a
  // subset of the "character" kind's requiredStates -- an unknown state key
  // aborts here, before validation/copy, with zero side effects.
  if (anims != null) {
    if (typeof anims !== "object" || Array.isArray(anims)) {
      return {
        ok: false,
        actions,
        failures: ["anims: must be a JSON object mapping state to clip name"],
      };
    }
    const requiredStates = loadConfig().kinds.character.requiredStates;
    const unknown = Object.keys(anims).filter(
      (state) => !requiredStates.includes(state),
    );
    if (unknown.length > 0) {
      return {
        ok: false,
        actions,
        failures: [
          `anims: unknown state(s) ${unknown.join(", ")} (expected one of: ${requiredStates.join(", ")})`,
        ],
      };
    }
  }

  // 1. Validate -- any failure aborts with zero side effects.
  const validation = await validateGlb(glbPath, {
    kind: "character",
    tier: "bespoke",
    anims,
    licenseLedger: existsSync(licenseLedgerPath)
      ? licenseLedgerPath
      : undefined,
  });
  if (validation.failures.length > 0) {
    return { ok: false, actions, failures: validation.failures };
  }
  actions.push(`validate: ${glbPath} OK`);
  // Surface non-fatal validation warnings rather than silently dropping them.
  for (const w of validation.warnings ?? []) actions.push(`warn: ${w}`);

  if (dryRun) {
    actions.push(`copy (planned): ${glbPath} -> ${destPath}`);
    actions.push(`manifest (planned): write entries["${key}"]`);
    actions.push("drift-gate (planned): run");
    return { ok: true, actions };
  }

  // 2. Read + parse the manifest BEFORE touching the filesystem, so a
  //    missing/malformed manifest aborts with zero side effects (no
  //    orphaned glb copy).
  let backupText;
  let manifest;
  try {
    backupText = readFileSync(manifestPath, "utf8");
    manifest = JSON.parse(backupText);
  } catch (err) {
    return {
      ok: false,
      actions,
      failures: [`manifest read: ${err.message}`],
    };
  }
  manifest.entries ??= {};
  manifest.entries[key] = {
    scene,
    source: "internal",
    license,
    tier: "bespoke",
    kind: "character",
    ...(anims ? { anims } : {}),
  };

  // Snapshot any glb already at destPath so rollback restores it byte-for-byte
  // (a re-intake of an already-shipped key) instead of deleting a file that
  // existed before this run.
  const destExisted = existsSync(destPath);
  const destBackup = destExisted ? readFileSync(destPath) : null;

  function rollback() {
    writeManifestRaw(manifestPath, backupText);
    if (destExisted) writeFileSync(destPath, destBackup);
    else rmSync(destPath, { force: true });
  }

  // 3. Copy the glb into the game-client asset tree, then write the entry.
  mkdirSync(charactersDir, { recursive: true });
  copyFileSync(glbPath, destPath);
  actions.push(`copy: ${glbPath} -> ${destPath}`);

  try {
    writeManifestAtomic(manifestPath, manifest);
  } catch (err) {
    rollback();
    return { ok: false, actions, failures: [`manifest write: ${err.message}`] };
  }
  actions.push(`manifest: wrote entries["${key}"]`);

  // 4. Drift-gate.
  const gate = driftGate ?? defaultDriftGateRunner;
  let gateResult;
  try {
    gateResult = await gate({ root, key });
  } catch (err) {
    gateResult = { ok: false, error: err.message };
  }

  if (!gateResult || !gateResult.ok) {
    rollback();
    return { ok: false, actions, failures: ["drift-gate: failed"] };
  }
  actions.push("drift-gate: passed");

  console.log(REMINDER);
  return { ok: true, actions };
}

/**
 * Minimal argv parser. Supports `--flag value`, `--flag=value` (so a value
 * may itself begin with `--`, e.g. license text), and the boolean
 * `--dry-run`. Exported for testing.
 * @param {string[]} argv
 * @returns {{positional: string[], flags: Record<string, string | true>}}
 */
export function parseArgs(argv) {
  const positional = [];
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
        // `--flag=value` -- value may start with `--`.
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`missing value for --${body}`);
      }
      flags[body] = value;
      i++;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function printUsageAndExit() {
  console.error(
    'usage: node intake.mjs <glb> --key <manifest-key> --license "<text>" ' +
      "[--dry-run] [--anims '<json>']",
  );
  process.exit(1);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [glbPath] = positional;
  if (!glbPath || !flags.key || !flags.license) printUsageAndExit();

  const root = repoRoot();
  const result = await intake(path.resolve(glbPath), {
    key: flags.key,
    license: flags.license,
    root,
    dryRun: Boolean(flags["dry-run"]),
    anims: flags.anims ? JSON.parse(flags.anims) : null,
  });

  for (const action of result.actions) console.log(action);
  for (const failure of result.failures ?? []) console.log(`FAIL ${failure}`);

  process.exit(result.ok ? 0 : 1);
}

// Only run the CLI when this file is executed directly -- not when
// `intake` is imported as a module by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`intake.mjs: ERROR: ${err.message}`);
    process.exit(1);
  });
}
