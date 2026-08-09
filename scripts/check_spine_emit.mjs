#!/usr/bin/env node
// F-041: spine derive-writer + mirror emitter (G-EMIT-DRIFT).
// --write  : canonicalize every node file (recompute interior.size /
//            interior.originInParent + the whole `derived` block) and, once
//            Task 1.9 lands, regenerate every mirror. --check : byte-compare
//            instead of writing; exit 1 on any drift.
// FRAME RULE: a perParentUnit === 1 interior CONTINUES its parent's grid
// unchanged (composeToRoot identity, pinned in Phase 0) — every coordinate
// in the cluster-1 tree (placements, anchors, features, bands, edge points)
// is an A1 sheet-km coordinate at every depth. The rebased reading
// (originInParent + p / perParentUnit) applies only across a scale boundary
// (per ≠ 1). Corollary sanity check: n-cluster1's polygon touches x=0/y=0,
// so its derived interior.originInParent is [0,0].
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { loadSpine, buildTree, deriveInterior, deriveNode } from "./lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── canonical serializer: the ONE byte format for node files and mirrors ──
const isPrim = (v) => v === null || ["number", "string", "boolean"].includes(typeof v);
export function canonStringify(v, indent = 0) {
  const pad = "  ".repeat(indent), padIn = "  ".repeat(indent + 1);
  if (isPrim(v)) return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    if (v.every(isPrim)) return `[${v.map((e) => JSON.stringify(e)).join(", ")}]`;
    if (v.every((e) => Array.isArray(e) && e.every((n) => typeof n === "number")))
      return `[\n${v.map((e) => `${padIn}[${e.join(", ")}]`).join(",\n")}\n${pad}]`;
    return `[\n${v.map((e) => `${padIn}${canonStringify(e, indent + 1)}`).join(",\n")}\n${pad}]`;
  }
  const keys = Object.keys(v).filter((k) => v[k] !== undefined);
  if (keys.length === 0) return "{}";
  return `{\n${keys
    .map((k) => `${padIn}${JSON.stringify(k)}: ${canonStringify(v[k], indent + 1)}`)
    .join(",\n")}\n${pad}}`;
}

const NODE_FIELDS = [
  "id", "tier", "parentId", "title", "provenance", "frozen", "absoluteAnchor",
  "seed", "placement", "interior", "composition", "interstitial",
  "interstitialUnsurveyed", "compositionTolerance", "toleranceWhy",
  "terrainKind", "features", "bands", "runtime", "representsNodeId", "lore",
  "tags", "levelBand", "derived",
];

export function canonicalNode({ node, tree }) {
  const { file, ...doc } = node; // loadSpine metadata, never serialized
  const unknown = Object.keys(doc).filter((k) => !NODE_FIELDS.includes(k));
  if (unknown.length) return { error: `${node.id}: unknown fields ${unknown.join(", ")}` };
  const d = deriveInterior({ node, plan: null });
  const interior = {
    units: doc.interior.units,
    perParentUnit: doc.interior.perParentUnit,
    size: d.size,
    originInParent: d.originInParent,
    ...(doc.interior.anchorInInterior !== undefined
      ? { anchorInInterior: doc.interior.anchorInInterior } : {}),
  };
  const out = {};
  for (const k of NODE_FIELDS) {
    if (k === "interior") out.interior = interior;
    else if (k === "derived") out.derived = deriveNode({ tree, id: doc.id, plans: {} });
    else if (doc[k] !== undefined) out[k] = doc[k];
  }
  return { bytes: canonStringify(out) + "\n" };
}

export function collectOutputs({ contentRoot }) {
  const spine = loadSpine({ contentRoot });
  if (!spine.present) return { skip: true };
  if (spine.errors.length) return { errors: spine.errors };
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  if (tree.errors.length) return { errors: tree.errors };
  const outputs = [];
  for (const node of spine.nodes) {
    const r = canonicalNode({ node, tree });
    if (r.error) return { errors: [r.error] };
    outputs.push({ path: join(contentRoot, "spine/nodes", node.file), bytes: r.bytes });
  }
  return { outputs, spine, tree };
}

function main() {
  const argv = process.argv.slice(2);
  let mode = null, contentRoot = join(ROOT, "content");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--check") mode = "check";
    else if (argv[i] === "--write") mode = "write";
    else if (argv[i] === "--content-root") contentRoot = resolve(argv[++i]);
    else { console.error(`spine-emit: unknown arg ${argv[i]}`); process.exit(2); }
  }
  if (!mode) { console.error("spine-emit: pass --check or --write"); process.exit(2); }
  const r = collectOutputs({ contentRoot });
  if (r.skip) { console.error("spine-emit: no spine/ directory"); process.exit(2); }
  if (r.errors) { for (const e of r.errors) console.error(`spine-emit: ${e}`); process.exit(1); }
  let drift = 0;
  for (const { path, bytes } of r.outputs) {
    let committed = null;
    try { committed = readFileSync(path, "utf8"); } catch { /* missing = drift */ }
    if (committed === bytes) continue;
    if (mode === "write") { writeFileSync(path, bytes); console.log(`spine-emit: wrote ${path}`); }
    else { console.error(`spine-emit: DRIFT ${path}`); drift++; }
  }
  if (mode === "check" && drift) process.exit(1);
  console.log(`spine-emit: ${mode} clean, ${r.outputs.length} files`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
