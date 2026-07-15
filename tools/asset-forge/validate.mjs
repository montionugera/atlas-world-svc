#!/usr/bin/env node
// Validates a baked .glb (or every entry in a game-client manifest) against
// Khronos structural rules plus atlas-forge's game rules: height range,
// pivot placement, required animation clips, skeleton shape, triangle/
// texture budgets, filename convention, license-ledger presence, and
// provenance stamping.
//
// Usage:
//   node validate.mjs <glb> --kind <kind> [--tier seed|bespoke]
//                     [--anims '<json>'] [--license-ledger <path>]
//                     [--config-dir <path>]
//   node validate.mjs --manifest <path> [--config-dir <path>]
//
// Prints `FAIL <rule>: <detail>` / `WARN <rule>: <detail>` lines and exits 1
// iff there are any failures.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getBounds } from "@gltf-transform/core";
import validator from "gltf-validator";
import {
  loadGlb,
  sceneHeight,
  minY,
  countTriangles,
  listClipNames,
  jointNames,
  maxTextureSize,
  readStamp,
} from "./lib/gltf.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Pivot tolerances (world units): feet must sit essentially on the ground
// plane, and the model must be centered on its X/Z footprint.
const PIVOT_Y_TOLERANCE = 0.02;
const PIVOT_XZ_TOLERANCE = 0.1;

const NAME_PATTERN = /^[a-z0-9_]+\.glb$/;

// Marker prepended to errors thrown by the external-resource loader when the
// referenced file simply doesn't exist on disk. Lets the structural-issue
// loop tell "resource missing" IO_ERRORs (demoted to warnings) apart from
// every other structural error (which stays a hard failure).
const RESOURCE_MISSING_MARKER = "ATLAS_FORGE_RESOURCE_MISSING:";

/**
 * Builds the gltf-validator externalResourceFunction for a glb at glbPath:
 * resolves relative URIs against the glb's own directory. A genuinely absent
 * file throws a marker-tagged error (recognized downstream and turned into a
 * warning); any other read error propagates as-is and stays a hard failure.
 * @param {string} glbPath
 */
function makeResourceLoader(glbPath) {
  const baseDir = path.dirname(path.resolve(glbPath));
  return async (uri) => {
    const resolved = path.resolve(baseDir, decodeURIComponent(uri));
    try {
      return new Uint8Array(readFileSync(resolved));
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new Error(`${RESOURCE_MISSING_MARKER}${uri}`);
      }
      throw err;
    }
  };
}

/**
 * Loads forge.config.json plus derived paths, relative to configDir (never
 * cwd) -- defaults to the directory this file lives in.
 * @param {string} [configDir]
 */
function loadConfig(configDir) {
  const dir = configDir ?? HERE;
  const raw = JSON.parse(
    readFileSync(path.join(dir, "forge.config.json"), "utf8"),
  );
  return {
    ...raw,
    configDir: dir,
    repoRoot: path.resolve(dir, "../.."),
    rigReferencePath: path.join(dir, raw.rigReference),
  };
}

function loadRigReferenceJoints(rigReferencePath) {
  const data = JSON.parse(readFileSync(rigReferencePath, "utf8"));
  return [...data.joints].sort();
}

function getPrimaryScene(doc) {
  const root = doc.getRoot();
  return root.getDefaultScene() ?? root.listScenes()[0];
}

/** @returns {{x: number, z: number}} bbox center on the X/Z plane. */
function bboxCenterXZ(doc) {
  const bbox = getBounds(getPrimaryScene(doc));
  return {
    x: (bbox.min[0] + bbox.max[0]) / 2,
    z: (bbox.min[2] + bbox.max[2]) / 2,
  };
}

function licenseLedgerHasEntry(ledgerPath, assetKey) {
  const text = readFileSync(ledgerPath, "utf8").toLowerCase();
  return text.includes(assetKey.toLowerCase());
}

/**
 * Texture-budget verdict for a document.
 * - 'empty': no textures at all -- nothing to check, pass silently.
 * - 'unreadable': textures exist but none expose a decodable size --
 *   never pass silently, never a hard fail; always a warning.
 * - 'ok': largest readable texture is within budgetPx.
 * - 'oversize': largest readable texture exceeds budgetPx.
 * @param {import('@gltf-transform/core').Document} doc
 * @param {number} budgetPx
 */
export function textureBudgetStatus(doc, budgetPx) {
  const textures = doc.getRoot().listTextures();
  if (textures.length === 0) return { status: "empty" };
  const largest = maxTextureSize(doc);
  const hasReadable = textures.some((t) => t.getSize());
  if (!hasReadable && largest === 0) return { status: "unreadable" };
  if (largest > budgetPx) return { status: "oversize", size: largest };
  return { status: "ok", size: largest };
}

/**
 * Validates a single baked .glb against Khronos structural rules and
 * atlas-forge's game rules for `kind`.
 * @param {string} glbPath
 * @param {{kind: string, tier?: "bespoke"|"seed", anims?: object|null, configDir?: string, licenseLedger?: string}} opts
 * @returns {Promise<{failures: string[], warnings: string[]}>}
 */
export async function validateGlb(glbPath, opts = {}) {
  const { kind, tier = "bespoke", anims = null, configDir, licenseLedger } =
    opts;
  const config = loadConfig(configDir);
  const kindConfig = config.kinds[kind];
  if (!kindConfig) {
    throw new Error(`validateGlb: unknown kind "${kind}"`);
  }

  const failures = [];
  const warnings = [];
  const demote = tier === "seed";

  // Game-rule failures are demoted to warnings at seed tier; structural
  // (Khronos) errors and provenance are never routed through this.
  function report(rule, detail) {
    const message = `${rule}: ${detail}`;
    if (demote) warnings.push(message);
    else failures.push(message);
  }

  // 1. Khronos structural validation -- always a hard failure, never
  // demoted. External resources (e.g. a texture URI like
  // Textures/colormap.png sitting next to the glb) are resolved relative to
  // the glb's directory; a resource that's genuinely absent on disk is
  // reported as a warning, not a structural failure.
  const bytes = readFileSync(glbPath);
  const structuralReport = await validator.validateBytes(
    new Uint8Array(bytes),
    { uri: glbPath, externalResourceFunction: makeResourceLoader(glbPath) },
  );
  for (const issue of structuralReport.issues.messages) {
    if (issue.severity !== 0) continue;
    const markerIndex = issue.message.indexOf(RESOURCE_MISSING_MARKER);
    if (issue.code === "IO_ERROR" && markerIndex !== -1) {
      const uri = issue.message.slice(
        markerIndex + RESOURCE_MISSING_MARKER.length,
      );
      warnings.push(`resources: ${uri} unresolved`);
      continue;
    }
    failures.push(`structural: ${issue.code} - ${issue.message}`);
  }

  const doc = await loadGlb(glbPath);

  // 2. Height range.
  const height = sceneHeight(doc);
  const [minHeight, maxHeight] = kindConfig.heightRange;
  if (height < minHeight || height > maxHeight) {
    report(
      "height",
      `${height.toFixed(3)}u (expected ${minHeight}-${maxHeight}u)`,
    );
  }

  // 3. Pivot: feet on the ground plane, centered on X/Z.
  const baseY = minY(doc);
  const { x: centerX, z: centerZ } = bboxCenterXZ(doc);
  if (
    Math.abs(baseY) > PIVOT_Y_TOLERANCE ||
    Math.abs(centerX) > PIVOT_XZ_TOLERANCE ||
    Math.abs(centerZ) > PIVOT_XZ_TOLERANCE
  ) {
    report(
      "pivot",
      `minY=${baseY.toFixed(3)}, center=(${centerX.toFixed(3)}, ${centerZ.toFixed(3)}) ` +
        `(expected |minY|<=${PIVOT_Y_TOLERANCE}, |x|<=${PIVOT_XZ_TOLERANCE}, |z|<=${PIVOT_XZ_TOLERANCE})`,
    );
  }

  // 4. Required animation clips, mapped via anims (if given) else defaultClipMap.
  const clipMap = anims ?? config.defaultClipMap;
  const clipNames = listClipNames(doc);
  for (const state of kindConfig.requiredStates) {
    const mappedName = clipMap[state];
    if (!mappedName || !clipNames.includes(mappedName)) {
      report(
        "clips",
        `state '${state}' -> expected clip '${mappedName}' not found (have: ${
          clipNames.join(", ") || "none"
        })`,
      );
    }
  }

  // 5. Skeleton: joint set must exactly match the rig reference.
  const referenceJoints = loadRigReferenceJoints(config.rigReferencePath);
  const joints = jointNames(doc);
  const jointsMatch =
    joints.length === referenceJoints.length &&
    joints.every((name, i) => name === referenceJoints[i]);
  if (!jointsMatch) {
    report(
      "skeleton",
      `joints [${joints.join(", ")}] != reference [${referenceJoints.join(", ")}]`,
    );
  }

  // 6. Triangle budget.
  const triangles = countTriangles(doc);
  if (triangles > kindConfig.maxTriangles) {
    report("triangles", `${triangles} > ${kindConfig.maxTriangles} budget`);
  }

  // 7. Texture budget. "Unreadable" (no decodable image data) is always a
  // warning -- never a silent pass, never a hard fail regardless of tier.
  const texStatus = textureBudgetStatus(doc, kindConfig.maxTextureSize);
  if (texStatus.status === "unreadable") {
    warnings.push("textures: no embedded image data readable");
  } else if (texStatus.status === "oversize") {
    report(
      "textures",
      `${texStatus.size}px > ${kindConfig.maxTextureSize}px budget`,
    );
  }

  // 8. Filename convention.
  const basename = path.basename(glbPath);
  if (!NAME_PATTERN.test(basename)) {
    report("naming", `'${basename}' does not match ${NAME_PATTERN}`);
  }

  // 9. License ledger -- only enforced here when a ledger path is given.
  if (licenseLedger) {
    const assetKey = basename.replace(/\.glb$/i, "");
    if (!licenseLedgerHasEntry(licenseLedger, assetKey)) {
      report("license", `'${assetKey}' not found in ${licenseLedger}`);
    }
  }

  // 10. Provenance stamp -- warn-only, never a failure, regardless of tier.
  if (!readStamp(doc)) {
    warnings.push("provenance: no atlas-forge stamp found");
  }

  return { failures, warnings };
}

/** Maps a manifest `scene` field to an absolute file path. */
function resolveScenePath(scene, repoRoot) {
  if (scene.startsWith("res://")) {
    return path.join(repoRoot, "game-client", scene.slice("res://".length));
  }
  return path.isAbsolute(scene) ? scene : path.join(repoRoot, scene);
}

/**
 * Validates every entry in a game-client asset manifest. Per entry: unknown
 * `kind` (not in forge.config.json) is skipped with a warning; a missing
 * file is skipped silently (that drift is drift-gate's job, not the
 * validator's). The license-ledger rule is always applied here (unlike
 * validateGlb, where it's opt-in).
 * @param {string} manifestPath
 * @param {{configDir?: string}} opts
 * @returns {Promise<{failures: string[], warnings: string[]}>}
 */
export async function validateManifest(manifestPath, opts = {}) {
  const { configDir } = opts;
  const config = loadConfig(configDir);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const licenseLedger = path.join(config.repoRoot, "art-source/LICENSES.md");

  const failures = [];
  const warnings = [];

  for (const [key, entry] of Object.entries(manifest.entries ?? {})) {
    if (!(entry.kind in config.kinds)) {
      warnings.push(
        `manifest: entry '${key}' has unknown kind '${entry.kind}', skipping`,
      );
      continue;
    }

    const scenePath = resolveScenePath(entry.scene, config.repoRoot);
    if (!existsSync(scenePath)) {
      // Missing file is drift-gate's job to catch, not the validator's.
      continue;
    }

    const result = await validateGlb(scenePath, {
      kind: entry.kind,
      tier: entry.tier ?? "bespoke",
      anims: entry.anims ?? null,
      configDir: config.configDir,
      licenseLedger,
    });
    for (const failure of result.failures) failures.push(`${key}: ${failure}`);
    for (const warning of result.warnings) warnings.push(`${key}: ${warning}`);
  }

  return { failures, warnings };
}

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

function printUsageAndExit() {
  console.error(
    "usage: node validate.mjs <glb> --kind <kind> [--tier seed|bespoke] [--anims '<json>'] [--license-ledger <path>] [--config-dir <path>]\n" +
      "       node validate.mjs --manifest <path> [--config-dir <path>]",
  );
  process.exit(1);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const configDir = flags["config-dir"]
    ? path.resolve(flags["config-dir"])
    : undefined;

  let result;
  if (flags.manifest) {
    result = await validateManifest(path.resolve(flags.manifest), {
      configDir,
    });
  } else {
    const [glbPath] = positional;
    if (!glbPath || !flags.kind) printUsageAndExit();
    result = await validateGlb(path.resolve(glbPath), {
      kind: flags.kind,
      tier: flags.tier ?? "bespoke",
      anims: flags.anims ? JSON.parse(flags.anims) : null,
      configDir,
      licenseLedger: flags["license-ledger"]
        ? path.resolve(flags["license-ledger"])
        : undefined,
    });
  }

  for (const failure of result.failures) console.log(`FAIL ${failure}`);
  for (const warning of result.warnings) console.log(`WARN ${warning}`);

  process.exit(result.failures.length > 0 ? 1 : 0);
}

// Only run the CLI when this file is executed directly -- not when
// validateGlb/validateManifest are imported as a module by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`validate.mjs: ERROR: ${err.message}`);
    process.exit(1);
  });
}
