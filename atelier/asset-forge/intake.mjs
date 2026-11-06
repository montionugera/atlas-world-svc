#!/usr/bin/env node
// Transactional intake: takes a baked, validated .glb and lands it in the
// game-client manifest as a single atomic operation.
//
// Two modes:
//   copy mode   <glb> --key <k> --license "<text>"
//               copies the glb into game-client/assets/characters/ (unchanged behaviour).
//   studio mode (F-174) --from-report <report.json> --slug <slug> | --studio-asset <id> --tag <tag>
//               fetches the Asset Studio record, requires the tag, pulls the bytes (sha256 from the
//               RECORD, never from the local file) into the gitignored game-client/studio-cache/,
//               validates a staged copy named --dest-name, and writes a PULL-ONLY entry with
//               license "studio-private". Nothing is copied into game-client/assets/ and no byte
//               of the asset is ever tracked: this repo is public.
//
// Order of operations:
//   0. kind + anims checks (anims default: forge.config.json pipelineClipMap for pipelineCharacter);
//      studio mode: record fetch + tag check, then the sha256-verified pull.
//   1. validate a staged copy named <dest-name> (so the naming and ledger rules see the shipped
//      name, never "out" or "<sha>") -- any failure aborts with zero side effects.
//   2. read + parse the manifest -- a missing/malformed manifest aborts, still with no writes.
//   3. copy mode: copy the glb; studio mode: nothing to copy. 3b. normalize: copy mode rewrites
//      crushing tracks in place; studio mode checks IN MEMORY and fails rather than change
//      approved bytes. Then write the entry atomically.
//   4. run the drift-gate (`node <root>/scripts/check_asset_manifest.mjs`, injectable).
//   5. on ANY failure after step 2, roll back the manifest to its exact pre-write bytes. Copy
//      mode also restores/deletes the copied glb. Studio mode NEVER deletes the cache file: it is
//      content-addressed, sha-verified, gitignored, and the next run reuses it.
//
// Every result carries `seconds`; the last action is the timing line, which in studio mode also
// carries the batch's Tripo credits (credits_spent / credits_est): the goal's "faster" and
// "lower cost" numbers.
//
// Exit 0 on success, 1 on any failure. `--dry-run` writes nothing: copy mode validates and
// reports; studio mode reads the record and checks the tag, and never downloads the media.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  realpathSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { validateGlb, loadConfig, stateKeysForKind } from "./validate.mjs";
import { normalizeRigidTranslations } from "./lib/normalize-anim.mjs";
import {
  repoRoot,
  writeManifestAtomic,
  writeManifestRaw,
} from "./lib/manifest.mjs";
import { pullAsset, fetchAssetRecord } from "../../scripts/lib/studio-pull.mjs";
import { studioToken } from "../../scripts/lib/studio-token.mjs";

const REMINDER = "Commit the Godot .import sidecar together with the glb";
const CACHE_REL = "game-client/studio-cache";
const HEX64 = /^[0-9a-f]{64}$/;

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

/** {assetId, tag, cost} for a PASS row of an atlas-char batch report (batches/<name>/report.json). */
export function rowFromReport(report, slug) {
  const row = (report?.characters ?? []).find((c) => c.slug === slug);
  if (!row) throw new Error(`slug ${slug} not in report`);
  if (row.status !== "PASS") throw new Error(`slug ${slug} status ${row.status}, need PASS`);
  const num = (v) => (typeof v === "number" ? v : null);
  return {
    assetId: row.asset,
    tag: row.tag,
    // Credits are recorded per batch (atlas_char/batch.py:147), not per row.
    cost: {
      batch: report.name ?? "?",
      creditsSpent: num(report.credits_spent),
      creditsEst: num(report.credits_est),
      genSeconds: num(row.seconds),
    },
  };
}

/** The default anims for a kind: the standard pipeline clip map for pipelineCharacter. */
export function defaultAnimsFor(kind, config) {
  return kind === "pipelineCharacter" ? structuredClone(config.pipelineClipMap) : null;
}

function costText(cost) {
  if (!cost) return "credits n/a (no batch report)";
  const n = (v) => (v === null ? "?" : String(v));
  const gen = cost.genSeconds === null ? "" : ` · gen ${cost.genSeconds.toFixed(1)} s`;
  return `credits spent ${n(cost.creditsSpent)} / est ${n(cost.creditsEst)} (batch ${cost.batch} total)${gen}`;
}

function checkAnims(anims, kindConfig) {
  if (anims == null) return null;
  if (typeof anims !== "object" || Array.isArray(anims)) {
    return "anims: must be a JSON object mapping state to clip name";
  }
  const allowed = stateKeysForKind(kindConfig);
  const unknown = Object.keys(anims).filter((state) => !allowed.includes(state));
  if (unknown.length > 0) {
    return `anims: unknown state(s) ${unknown.join(", ")} (expected one of: ${allowed.join(", ")})`;
  }
  for (const [state, v] of Object.entries(anims)) {
    const okValue = (typeof v === "string" && v !== "") ||
      (Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === "string" && c !== ""));
    if (!okValue) return `anims: '${state}' must be a clip name or a non-empty list of clip names`;
  }
  return null;
}

/**
 * Transactional intake of a baked .glb (copy mode) or an Asset Studio asset (studio mode).
 * @param {string|null} glbPath  ignored in studio mode
 * @param {{key: string, license?: string, root: string, kind?: string, dryRun?: boolean,
 *   anims?: object|null, driftGate?: Function, destName?: string|null,
 *   studio?: {assetId: string, tag: string, token?: string, fetchImpl?: Function, baseUrl?: string,
 *             cost?: {batch: string, creditsSpent: number|null, creditsEst: number|null, genSeconds: number|null}|null}|null}} opts
 * @returns {Promise<{ok: boolean, actions: string[], failures?: string[], seconds: number,
 *   credits?: {spent: number|null, est: number|null}|null}>}
 */
export async function intake(glbPath, opts = {}) {
  const t0 = performance.now();
  const {
    key, license, root, kind = "character", dryRun = false, driftGate,
    destName = null, studio = null,
  } = opts;
  if (!key) throw new Error("intake: 'key' is required");
  if (!root) throw new Error("intake: 'root' is required");

  const actions = [];
  // Every return goes through done(): the timing line is always the last action.
  const done = (result) => {
    const seconds = (performance.now() - t0) / 1000;
    actions.push(`intake: done in ${seconds.toFixed(1)} s${studio ? ` · ${costText(studio.cost ?? null)}` : ""}`);
    const out = { ...result, actions, seconds };
    if (studio) {
      out.credits = studio.cost ? { spent: studio.cost.creditsSpent, est: studio.cost.creditsEst } : null;
    }
    return out;
  };

  const manifestPath = path.join(root, "game-client/assets/manifest.json");
  const charactersDir = path.join(root, "game-client/assets/characters");
  const licenseLedgerPath = path.join(root, "art-source/LICENSES.md");

  const config = loadConfig();
  const kinds = config.kinds;
  if (!Object.hasOwn(kinds, kind)) {
    return done({
      ok: false,
      failures: [`kind: unknown kind "${kind}" (expected one of: ${Object.keys(kinds).join(", ")})`],
    });
  }
  const anims = opts.anims ?? defaultAnimsFor(kind, config);

  if (studio && !destName) {
    return done({ ok: false, failures: ["studio: --dest-name is required (the cache file is named by sha256)"] });
  }
  if (!studio && !glbPath) {
    return done({ ok: false, failures: ["intake: a glb path is required outside studio mode"] });
  }
  // --dest-name is a bare, lowercase [a-z0-9_]+.glb name (same rule as validate.mjs NAME_PATTERN):
  // never a path, so it cannot write outside game-client/assets/characters.
  if (destName !== null && !/^[a-z0-9_]+\.glb$/.test(destName)) {
    return done({ ok: false, failures: [`dest-name: "${destName}" must be a bare name matching /^[a-z0-9_]+\\.glb$/ (no path, no uppercase)`] });
  }
  // Copy mode must never move a private studio-cache asset into the committed asset tree.
  if (!studio) {
    const real = (p) => { try { return realpathSync(p); } catch { return path.resolve(p); } };
    const cacheReal = real(path.join(root, CACHE_REL));
    const srcReal = real(glbPath);
    if (srcReal === cacheReal || srcReal.startsWith(cacheReal + path.sep) ||
        srcReal.split(path.sep).join("/").includes("game-client/studio-cache/")) {
      return done({ ok: false, failures: ["refusing to copy a studio-cache asset into game-client/assets — use --from-report (pull-only)"] });
    }
  }
  const basename = destName ?? path.basename(glbPath);
  const name = basename.replace(/\.glb$/i, "");

  // 0. anims -- an unknown state key or a bad value aborts with zero side effects.
  const animsFailure = checkAnims(anims, kinds[kind]);
  if (animsFailure) return done({ ok: false, failures: [animsFailure] });

  // 0b. Studio mode: provenance from the Asset Studio API record of the approved asset. Never
  //     from sheet.json, never by hashing the local file (that compares the file with itself).
  let srcPath = glbPath;
  let pull = null;
  let gen = null;
  if (studio) {
    let rec;
    try {
      rec = await fetchAssetRecord(studio.assetId, studio);
    } catch (err) {
      // fetchAssetRecord words a 401/403 as "studio auth failed (http …)".
      return done({ ok: false, failures: [err.auth ? err.message : `studio: ${err.message}`] });
    }
    const tags = rec.tags ?? [];
    if (!tags.includes(studio.tag)) {
      return done({ ok: false, failures: [`studio: tag ${studio.tag} not in asset ${studio.assetId} tags (${tags.join(", ")})`] });
    }
    if (!HEX64.test(rec.sha256 ?? "")) {
      return done({ ok: false, failures: [`studio: asset ${studio.assetId} record has no 64-hex sha256`] });
    }
    pull = { from: "asset-studio", assetStudioAsset: studio.assetId, tag: studio.tag, sha256: rec.sha256 };
    gen = {
      ...(tags.includes("tripo") ? { model: "tripo", provider: "tripo" } : {}),
      ...(tags.includes("mixamo") ? { rig: "mixamo", clips: "mixamo" } : {}),
    };
    const cacheDir = path.join(root, CACHE_REL);
    if (dryRun) {
      // Read-only: the record was fetched, the media is not, and nothing is written.
      actions.push(`pull (planned): ${studio.assetId} tag ${studio.tag} sha256 ${rec.sha256} -> ${path.join(cacheDir, `${rec.sha256}.glb`)}`);
      actions.push(`manifest (planned): write pull-only entries["${key}"] (license studio-private)`);
      actions.push("drift-gate (planned): run");
      return done({ ok: true });
    }
    const r = await pullAsset({
      assetId: studio.assetId, sha256: rec.sha256, cacheDir, token: studio.token,
      fetchImpl: studio.fetchImpl, baseUrl: studio.baseUrl, record: rec,
    });
    if (!r.ok) return done({ ok: false, failures: [r.failure] });
    actions.push(`pull: ${studio.assetId} tag ${studio.tag} sha256 ${rec.sha256} -> ${r.path}${r.cached ? " (cached)" : ""}`);
    srcPath = r.path;
  }
  const scene = pull ? `res://studio-cache/${pull.sha256}.glb` : `res://assets/characters/${name}.glb`;
  const destPath = pull ? srcPath : path.join(charactersDir, basename);

  // 1. Validate a staged copy named `basename`, so the naming rule and the ledger rule see the
  //    shipped name. A `<sha>.glb` cache name must never reach the ledger substring check.
  let validatePath = srcPath;
  let stageDir = null;
  let validation;
  try {
    if (basename !== path.basename(srcPath)) {
      stageDir = mkdtempSync(path.join(tmpdir(), "atlas-intake-"));
      validatePath = path.join(stageDir, basename);
      copyFileSync(srcPath, validatePath);
    }
    validation = await validateGlb(validatePath, {
      kind,
      tier: "bespoke",
      anims,
      licenseLedger: existsSync(licenseLedgerPath) ? licenseLedgerPath : undefined,
    });
  } finally {
    if (stageDir) rmSync(stageDir, { recursive: true, force: true });
  }
  if (validation.failures.length > 0) {
    return done({ ok: false, failures: validation.failures });
  }
  actions.push(`validate: ${srcPath}${validatePath !== srcPath ? ` (as ${basename})` : ""} OK`);
  for (const w of validation.warnings ?? []) actions.push(`warn: ${w}`);

  if (dryRun) {
    actions.push(`copy (planned): ${srcPath} -> ${destPath}`);
    actions.push(`manifest (planned): write entries["${key}"]`);
    actions.push("drift-gate (planned): run");
    return done({ ok: true });
  }

  // 2. Read + parse the manifest BEFORE touching the filesystem.
  let backupText;
  let manifest;
  try {
    backupText = readFileSync(manifestPath, "utf8");
    manifest = JSON.parse(backupText);
  } catch (err) {
    return done({ ok: false, failures: [`manifest read: ${err.message}`] });
  }
  manifest.entries ??= {};
  manifest.entries[key] = {
    scene,
    source: pull ? `Asset Studio library asset ${pull.assetStudioAsset} (client atlas-world); bytes not in this repo` : "internal",
    license: pull ? "studio-private" : license,
    tier: "bespoke",
    kind,
    ...(pull ? { pull } : {}),
    ...(gen && Object.keys(gen).length ? { gen } : {}),
    ...(anims ? { anims } : {}),
  };

  // Copy mode: snapshot any glb already at destPath so rollback restores it byte-for-byte.
  const destExisted = !pull && existsSync(destPath);
  const destBackup = destExisted ? readFileSync(destPath) : null;

  function rollback() {
    writeManifestRaw(manifestPath, backupText);
    // Studio mode: NEVER rmSync the cache file. It is content-addressed and sha-verified,
    // gitignored, outside the tracked tree, and the next run reuses it.
    if (pull) return;
    if (destExisted) writeFileSync(destPath, destBackup);
    else rmSync(destPath, { force: true });
  }

  // 3. Copy mode only: copy the glb into the game-client asset tree.
  if (!pull) {
    mkdirSync(charactersDir, { recursive: true });
    copyFileSync(srcPath, destPath);
    actions.push(`copy: ${srcPath} -> ${destPath}`);
  }

  // 3b. Normalize rigid-skeleton animations (see lib/normalize-anim.mjs). Copy mode rewrites the
  //     copied glb in place. Studio mode runs IN MEMORY only: rewriting the cache file would
  //     break its sha256, so a pull-only asset that needs normalizing is refused.
  try {
    const io = new NodeIO().setStrictResources(false);
    const doc = await io.read(destPath);
    const rep = normalizeRigidTranslations(doc);
    if (rep.removedChannels > 0) {
      if (pull) {
        rollback();
        return done({
          ok: false,
          failures: [`normalize: pull-only asset needs ${rep.removedChannels} channel(s) normalized — fix it in the pipeline; intake must not change approved bytes`],
        });
      }
      await io.write(destPath, doc);
      actions.push(
        `normalize: pinned ${rep.pinnedBones.length} crushing bones ` +
          `(${rep.removedChannels} channels) to rest`,
      );
    }
  } catch (err) {
    rollback();
    return done({ ok: false, failures: [`normalize: ${err.message}`] });
  }

  try {
    writeManifestAtomic(manifestPath, manifest);
  } catch (err) {
    rollback();
    return done({ ok: false, failures: [`manifest write: ${err.message}`] });
  }
  actions.push(`manifest: wrote entries["${key}"]${pull ? " (pull-only)" : ""}`);

  // 4. Drift-gate. No thumbnail bake: bake_thumbnails and guard (U) both skip pull entries.
  const gate = driftGate ?? defaultDriftGateRunner;
  let gateResult;
  try {
    gateResult = await gate({ root, key });
  } catch (err) {
    gateResult = { ok: false, error: err.message };
  }
  if (!gateResult || !gateResult.ok) {
    rollback();
    return done({ ok: false, failures: ["drift-gate: failed"] });
  }
  actions.push("drift-gate: passed");

  // The .import reminder is for committed glbs. A pull-only asset commits nothing.
  if (!pull) console.log(REMINDER);
  return done({ ok: true });
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
      "[--dry-run] [--anims '<json>'] [--kind <kind>] [--dest-name <file.glb>]\n" +
      "     | node intake.mjs (--from-report <report.json> --slug <slug> | --studio-asset <id> --tag <tag>) " +
      "--key <k> --kind pipelineCharacter --dest-name <file.glb> [--dry-run] [--anims '<json>']",
  );
  process.exit(1);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [glbPath] = positional;

  let studio = null;
  if (flags["from-report"]) {
    if (!flags.slug) printUsageAndExit();
    studio = rowFromReport(JSON.parse(readFileSync(path.resolve(flags["from-report"]), "utf8")), flags.slug);
  } else if (flags["studio-asset"]) {
    if (!flags.tag) printUsageAndExit();
    studio = { assetId: flags["studio-asset"], tag: flags.tag, cost: null };
  }
  if (!flags.key || (!studio && (!glbPath || !flags.license))) printUsageAndExit();
  if (studio) {
    studio.token = studioToken(); // scripts/lib/studio-token.mjs; never printed
    if (!studio.token) {
      console.log("FAIL studio: no Asset Studio token (set STUDIO_TOKEN, or start the orbstack asset-studio namespace)");
      process.exit(1);
    }
  }

  const result = await intake(studio ? null : path.resolve(glbPath), {
    key: flags.key,
    license: flags.license,
    root: repoRoot(),
    dryRun: Boolean(flags["dry-run"]),
    kind: flags.kind,
    anims: flags.anims ? JSON.parse(flags.anims) : null,
    destName: flags["dest-name"] || null,
    studio,
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
