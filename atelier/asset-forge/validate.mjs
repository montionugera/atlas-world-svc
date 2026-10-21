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
import validator from "gltf-validator";
import {
  loadGlb,
  sceneHeight,
  skinnedBounds,
  countTriangles,
  listClipNames,
  jointNames,
  jointParents,
  maxTextureSize,
  readStamp,
} from "./lib/gltf.mjs";
import { detectCrushingTranslations } from "./lib/normalize-anim.mjs";

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
export function loadConfig(configDir) {
  const dir = configDir ?? HERE;
  const raw = JSON.parse(
    readFileSync(path.join(dir, "forge.config.json"), "utf8"),
  );
  // rigReference accepts a single path (legacy) or a list of paths -- the
  // model matches if its joint set exactly equals ANY reference in the list.
  const rigReferenceList = Array.isArray(raw.rigReference)
    ? raw.rigReference
    : [raw.rigReference];
  return {
    ...raw,
    configDir: dir,
    repoRoot: path.resolve(dir, "../.."),
    rigReferencePaths: rigReferenceList.map((p) => path.join(dir, p)),
  };
}

function loadRigReference(rigReferencePath) {
  const data = JSON.parse(readFileSync(rigReferencePath, "utf8"));
  return { ...data, joints: [...data.joints].sort() };
}

/** Both inputs are sorted arrays -- true iff they contain the same names in order. */
function jointArraysEqual(a, b) {
  return a.length === b.length && a.every((name, i) => name === b[i]);
}

/** Size of the symmetric difference between two joint-name arrays (as sets). */
function jointSetDistance(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  let distance = 0;
  for (const name of setA) if (!setB.has(name)) distance++;
  for (const name of setB) if (!setA.has(name)) distance++;
  return distance;
}

/**
 * Loads every rig reference that exists on disk (skipping missing ones with
 * a warning) and reports whether `joints` exactly matches any of them.
 * @param {string[]} rigReferencePaths
 * @param {string[]} joints
 * @returns {{references: {path: string, joints: string[]}[], matched: boolean}}
 */
function checkSkeleton(rigReferencePaths, joints, warnings) {
  const references = [];
  for (const refPath of rigReferencePaths) {
    if (!existsSync(refPath)) {
      warnings.push(`skeleton: reference ${refPath} missing`);
      continue;
    }
    references.push({ path: refPath, ...loadRigReference(refPath) });
  }
  const matched = references.some((ref) => jointArraysEqual(joints, ref.joints));
  return { references, matched };
}

// --- F-153 skeleton extension contract (allowExtras references) ----------
// Bone-name grammar for characters on a core skeleton plus extras.
const SEC_BONE_RE =
  /^sec_(hair|hem|cloth|cape|sleeve|bag|beard|tail|ear|acc)_(l|r|c)(f|b)?([0-9])_([1-3])$/;
const PROP_BONE_RE = /^prop_(weapon|shield|hat|back|fx)_(l|r|c)$/;
const EXTRA_BONE_CAP = 30;
// Weight-sum tolerance by WEIGHTS accessor: float 1e-3; normalized
// UNSIGNED_BYTE/SHORT allow rounding of up to 4 components (2/max).
const FLOAT_WEIGHT_TOLERANCE = 1e-3;
const U8_WEIGHT_TOLERANCE = 2 / 255;
const U16_WEIGHT_TOLERANCE = 2 / 65535;

function weightSumTolerance(accessor) {
  if (!accessor.getNormalized()) return FLOAT_WEIGHT_TOLERANCE;
  const array = accessor.getArray();
  if (array instanceof Uint8Array) return U8_WEIGHT_TOLERANCE;
  if (array instanceof Uint16Array) return U16_WEIGHT_TOLERANCE;
  return FLOAT_WEIGHT_TOLERANCE;
}

/** The reference with the smallest symmetric joint difference (first wins ties). */
function closestReference(references, joints) {
  return references.reduce((best, ref) =>
    jointSetDistance(joints, ref.joints) < jointSetDistance(joints, best.joints) ? ref : best,
  );
}

/**
 * An allowExtras reference is engaged only when it is the closest reference
 * AND the joints contain its whole core or declare sec_/prop_ intent.
 */
function engagedExtrasReference(references, joints) {
  if (references.length === 0) return null;
  const closest = closestReference(references, joints);
  if (!closest.allowExtras) return null;
  const hasIntent = joints.some((n) => /^(sec_|prop_)/.test(n));
  return hasIntent || closest.joints.every((n) => joints.includes(n)) ? closest : null;
}

/**
 * S1-S4 against an allowExtras reference. Returns [ruleId, detail] violations.
 * @returns {[string, string][]}
 */
function checkSkeletonExtras(ref, joints, parents) {
  const violations = [];
  const core = new Set(ref.joints);
  const jointSet = new Set(joints);
  const extras = joints.filter((n) => !core.has(n));

  // S1: core present, every core parent link unchanged.
  const missing = ref.joints.filter((n) => !jointSet.has(n));
  if (missing.length) violations.push(["skeleton-core", `missing core joints: ${missing.join(", ")}`]);
  for (const name of ref.joints) {
    const expected = ref.parents?.[name];
    if (!jointSet.has(name) || expected === undefined) continue;
    if (expected !== null && !jointSet.has(expected)) continue; // already reported as missing
    if ((parents[name] ?? null) !== expected) {
      violations.push([
        "skeleton-core",
        `${name} parent is ${parents[name] ?? "none"}, expected ${expected ?? "none"}`,
      ]);
    }
  }

  // S2 grammar + S3 topology, per extra joint.
  const secParents = new Set([...(ref.secParents ?? [])]);
  const sleeveParents = new Set([...secParents, ...(ref.sleeveParents ?? [])]);
  const propParents = new Set(ref.propParents ?? []);
  for (const name of extras) {
    const parent = parents[name] ?? null;
    const sec = SEC_BONE_RE.exec(name);
    if (sec) {
      const k = Number(sec[5]);
      if (k === 1) {
        const allowed = sec[1] === "sleeve" ? sleeveParents : secParents;
        if (!allowed.has(parent)) {
          violations.push(["skeleton-topology", `${name} parent ${parent ?? "none"} not in [${[...allowed].join(", ")}]`]);
        }
      } else {
        const expected = name.replace(/_[1-3]$/, `_${k - 1}`);
        if (parent !== expected) {
          violations.push(["skeleton-topology", `${name} parent is ${parent ?? "none"}, expected ${expected}`]);
        }
      }
    } else if (PROP_BONE_RE.test(name)) {
      if (!propParents.has(parent)) {
        violations.push(["skeleton-topology", `${name} parent ${parent ?? "none"} not in [${[...propParents].join(", ")}]`]);
      }
    } else {
      violations.push(["skeleton-grammar", `${name} matches neither sec_<kind>_<side><chain>_<1-3> nor prop_<kind>_<side>`]);
    }
  }

  // S4 cap.
  if (extras.length > EXTRA_BONE_CAP) {
    violations.push(["skeleton-cap", `${extras.length} extra bones > ${EXTRA_BONE_CAP} cap`]);
  }
  return violations;
}

/**
 * Weight sanity on skinned primitives only: no unweighted vertex,
 * |sum(w)-1| <= tolerance over WEIGHTS_0 (+ WEIGHTS_1 when JOINTS_1 exists,
 * which also warns that >4 influences are not checked). Normalized
 * UNSIGNED_BYTE/SHORT accessors are decoded by getElement.
 * @returns {{violations: string[], warnings: string[]}}
 */
function checkSkinWeights(doc) {
  const violations = [];
  const warnings = [];
  const seen = new Set();
  const buf = [0, 0, 0, 0];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!node.getSkin() || !mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      if (seen.has(prim)) continue;
      seen.add(prim);
      const weights1 = prim.getAttribute("JOINTS_1") ? prim.getAttribute("WEIGHTS_1") : null;
      if (prim.getAttribute("JOINTS_1")) {
        warnings.push(`skin-weights: ${mesh.getName()} has JOINTS_1 (>4 influences not checked)`);
      }
      const weights = prim.getAttribute("WEIGHTS_0");
      if (!weights) {
        violations.push(`${mesh.getName()}: skinned primitive has no WEIGHTS_0`);
        continue;
      }
      const tolerance = weightSumTolerance(weights);
      const buf1 = [0, 0, 0, 0];
      let zero = 0;
      let off = 0;
      for (let i = 0; i < weights.getCount(); i++) {
        weights.getElement(i, buf);
        let sum = buf[0] + buf[1] + buf[2] + buf[3];
        if (weights1) {
          weights1.getElement(i, buf1);
          sum += buf1[0] + buf1[1] + buf1[2] + buf1[3];
        }
        if (sum === 0) zero++;
        else if (Math.abs(sum - 1) > tolerance) off++;
      }
      if (zero) violations.push(`${mesh.getName()}: ${zero} vertices have all-zero weights`);
      if (off) violations.push(`${mesh.getName()}: ${off} vertices have weights not summing to 1`);
    }
  }
  return { violations, warnings };
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
  const kindConfig = Object.hasOwn(config.kinds, kind) ? config.kinds[kind] : null;
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

  // 3. Pivot: feet on the ground plane, centered on X/Z. Measured from
  // SKINNED meshes only -- bone-parented attachment meshes (a sword held out
  // in front) are unskinned and would drag the bbox center off-axis for
  // legitimate characters. Falls back to whole-scene bounds when nothing is
  // skinned (plain props). The height rule above stays whole-scene.
  const pivotBounds = skinnedBounds(doc);
  const baseY = pivotBounds.min[1];
  const centerX = (pivotBounds.min[0] + pivotBounds.max[0]) / 2;
  const centerZ = (pivotBounds.min[2] + pivotBounds.max[2]) / 2;
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

  // 5. Skeleton: joint set must exactly match ANY reference in the list.
  // A reference file that doesn't exist on disk (e.g. one still being
  // authored in a parallel workstream) is skipped with a warning rather than
  // failing the whole rule.
  const joints = jointNames(doc);
  const { references: rigReferences, matched: skeletonMatched } =
    checkSkeleton(config.rigReferencePaths, joints, warnings);
  const extrasRef = skeletonMatched ? null : engagedExtrasReference(rigReferences, joints);
  if (extrasRef) {
    if (!extrasRef.parents) {
      warnings.push(
        `skeleton-core: reference ${path.basename(extrasRef.path)} has no parents map, parent checks skipped`,
      );
    }
    for (const [rule, detail] of checkSkeletonExtras(extrasRef, joints, jointParents(doc))) {
      report(rule, detail);
    }
    if (joints.some((n) => !extrasRef.joints.includes(n))) {
      const weightCheck = checkSkinWeights(doc);
      for (const detail of weightCheck.violations) report("skin-weights", detail);
      warnings.push(...weightCheck.warnings);
    }
  } else if (rigReferences.length > 0 && !skeletonMatched) {
    // Name the closest reference (smallest symmetric difference) in the
    // FAIL message, to point at the most likely intended rig.
    const closest = closestReference(rigReferences, joints);
    report(
      "skeleton",
      `joints [${joints.join(", ")}] != reference [${closest.joints.join(", ")}] ` +
        `(closest: ${path.basename(closest.path)})`,
    );
  }

  // 5b. Rigid-skeleton crush: an oversized rig whose clips carry a mismatched
  // skeleton's bone translations collapses on playback. Intake normalizes this
  // automatically, so it is a warning (auditable), not a hard fail.
  const crushBones = detectCrushingTranslations(doc);
  if (crushBones.length > 0) {
    warnings.push(
      `animation: crushing translation tracks on ${crushBones.length} bones ` +
        `(worst ${crushBones[0].bone} drift ${crushBones[0].drift.toFixed(2)}); ` +
        `intake will pin them to rest`,
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
    if (!Object.hasOwn(config.kinds, entry.kind)) {
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
