#!/usr/bin/env node
// Transactional intake: takes a baked, validated .glb and lands it in the
// game-client asset tree as a single atomic operation.
//
// Order of operations:
//   1. validate the source .glb (validateGlb, kind "character", tier
//      "bespoke", against `<root>/art-source/LICENSES.md`) -- any failure
//      aborts with zero side effects.
//   2. copy the .glb into `<root>/game-client/assets/characters/`.
//   3. backup the current manifest, then write the flipped entry
//      `{scene, source: "internal", license, tier: "bespoke", kind:
//      "character"}` atomically.
//   4. run the drift-gate (`node <root>/scripts/check_asset_manifest.mjs`
//      by default, injectable via `driftGate` for tests).
//   5. on ANY failure after step 1, roll back: restore the manifest to its
//      exact pre-write bytes and delete the copied .glb.
//
// Usage:
//   node intake.mjs <glb> --key <manifest-key> --license "<text>" [--dry-run]
//
// Exit 0 on success, 1 on any failure (validation, drift-gate, or thrown
// error). `--dry-run` reports the actions that would be taken and exits 0
// without touching the filesystem.

import {
  existsSync,
  readFileSync,
  copyFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateGlb } from "./validate.mjs";
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
 * @param {{key: string, license: string, root: string, dryRun?: boolean, driftGate?: (ctx: {root: string, key: string}) => Promise<{ok: boolean}>}} opts
 * @returns {Promise<{ok: boolean, actions: string[], failures?: string[]}>}
 */
export async function intake(glbPath, opts = {}) {
  const { key, license, root, dryRun = false, driftGate } = opts;
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

  // 1. Validate -- any failure aborts with zero side effects.
  const validation = await validateGlb(glbPath, {
    kind: "character",
    tier: "bespoke",
    licenseLedger: existsSync(licenseLedgerPath)
      ? licenseLedgerPath
      : undefined,
  });
  if (validation.failures.length > 0) {
    return { ok: false, actions, failures: validation.failures };
  }
  actions.push(`validate: ${glbPath} OK`);

  if (dryRun) {
    actions.push(`copy (planned): ${glbPath} -> ${destPath}`);
    actions.push(`manifest (planned): write entries["${key}"]`);
    actions.push("drift-gate (planned): run");
    return { ok: true, actions };
  }

  // 2. Copy the glb into the game-client asset tree.
  mkdirSync(charactersDir, { recursive: true });
  copyFileSync(glbPath, destPath);
  actions.push(`copy: ${glbPath} -> ${destPath}`);

  // 3. Backup + write the flipped manifest entry.
  const backupText = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(backupText);
  manifest.entries ??= {};
  manifest.entries[key] = {
    scene,
    source: "internal",
    license,
    tier: "bespoke",
    kind: "character",
  };

  function rollback() {
    writeManifestRaw(manifestPath, backupText);
    rmSync(destPath, { force: true });
  }

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

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      flags["dry-run"] = true;
      continue;
    }
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

function printUsageAndExit() {
  console.error(
    'usage: node intake.mjs <glb> --key <manifest-key> --license "<text>" [--dry-run]',
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
