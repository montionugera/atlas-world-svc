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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { loadSpine, buildTree, deriveInterior, deriveNode, readTownPlans, planForNode, renderFrontierFile, renderMapDimensionsTs } from "./lib/spine.mjs";

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
  "tags", "levelBand",
];

// `plans` is the ONE shape documented in lib/spine.mjs (planForNode):
// [{ file, doc }]. The writer MUST see the same plans the gate sees, or the
// bytes it writes fail G-FRAME / G-DERIVED-DRIFT the moment the gate runs —
// a town's interior.size comes from its plan's extent (research §3.2) and its
// rollupVerdict is CHECKED because the plan exists (§5.5).
export function canonicalNode({ node, tree, plans = [] }) {
  const { file, ...doc } = node; // loadSpine metadata, never serialized
  const unknown = Object.keys(doc).filter((k) => !NODE_FIELDS.includes(k));
  if (unknown.length) return { error: `${node.id}: unknown fields ${unknown.join(", ")}` };
  const d = deriveInterior({ node, plan: planForNode({ plans, id: doc.id }) });
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
    else if (doc[k] !== undefined) out[k] = doc[k];
  }
  return { bytes: canonStringify(out) + "\n" };
}

// Plan A Task 12: emitGeography() and the mirror it wrote are gone. Every
// consumer — the three content-gate joins, both sheet builders, the alias
// sweep — now resolves the world through scripts/lib/places.mjs instead.
// GEOGRAPHY_VERSION stays re-exported: content/zones/zone-cindervast.json and
// content/spine/nodes/n-saltmire.json still cite the document in provenance
// strings, and Plan D's resolved files inherit the version number.
export { GEOGRAPHY_VERSION } from "./lib/places.mjs";

// Plan B Task 4 — the hoisted `derived` block. One object keyed by node id,
// ids ASCENDING (readdir is already sorted and G-ID pins id === filename
// stem, but the sort is explicit so the bytes never depend on that coupling).
// Only ids BFS-reached from a root are derived: deriveNode -> composeToRoot
// loops forever on a cyclic parentId chain, which is already a G-TREE
// failure. collectOutputs bails on tree.errors before reaching here, so the
// gate's matching bail keeps emitter and gate agreeing on when this file
// should exist at all.
export function derivedSidecar({ tree, plans = [] }) {
  const out = {};
  for (const id of [...tree.byId.keys()].filter((i) => tree.depthOf.has(i)).sort())
    out[id] = deriveNode({ tree, id, plans });
  return canonStringify(out) + "\n";
}

export function collectOutputs({ contentRoot }) {
  const spine = loadSpine({ contentRoot });
  if (!spine.present) return { skip: true };
  if (spine.errors.length) return { errors: spine.errors };
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  if (tree.errors.length) return { errors: tree.errors };
  // Town plans are the authority on a town's frame (§3.2). An UNPARSABLE plan
  // is an error here, not a silent short list: deriving a town from bbox
  // because its plan failed to parse would write bytes the gate then rejects.
  // Schema validation stays with the gate (check_content.mjs) — this is an
  // emitter, and a schema-invalid plan is reported there with a clean line.
  const { plans, unreadable } = readTownPlans({ contentRoot });
  if (unreadable.length) return { errors: unreadable.map((u) => `${u.file}: cannot parse: ${u.message}`) };
  const outputs = [];
  for (const node of spine.nodes) {
    const r = canonicalNode({ node, tree, plans });
    if (r.error) return { errors: [r.error] };
    outputs.push({ path: join(contentRoot, "spine/nodes", node.file), bytes: r.bytes });
  }
  // Plan B Task 4 output: the one sidecar carrying every node's `derived`
  // block. Unconditional — every root that reaches this point has a valid
  // tree, so every root gets one (that is what lets G-DERIVED-DRIFT fail
  // hard on its absence instead of soft-skipping into blindness).
  outputs.push({ path: join(contentRoot, "spine/derived.json"), bytes: derivedSidecar({ tree, plans }) });
  // F-041 P4 mirror #2: the runtime map's frontmatter (body preserved
  // verbatim). It is guarded on a node id and keyed on contentRoot — fixture
  // roots without the runtime subtree skip it, and --write on a fixture root
  // can only touch the fixture's own copy. (This comment used to say the guard
  // "mirrors the n-cluster1 geography push above"; Plan A Task 12 deleted that
  // push along with the legacy geography mirror it wrote, so the pattern is
  // now described on its own terms rather than by reference to dead code.
  // The mirror is deliberately NOT named by path here: places.test.mjs's
  // STEP 5 PROOF greps every executable file for that path and this file is
  // not on its allowlist — naming it, even in a comment, reds the suite.)
  // Unlike a pure computed emit, this one PRESERVES the
  // body of the existing file, so it also needs the file to exist — several
  // spine-gates.test.mjs fixtures (realSpineCopy, spineFixture's `base` +
  // overlays) copy content/spine wholesale but never content/maps, so
  // n-frontier-shelf can be present with no maps/atlas-frontier.md on disk;
  // that is a fixture-completeness gap, not drift, so it's skipped too.
  if (tree.byId.has("n-frontier-shelf")) {
    const frontierPath = join(contentRoot, "maps/atlas-frontier.md");
    let currentText = null;
    // ENOENT ONLY. A bare catch{} here turns every other read failure
    // (EACCES, EISDIR, a directory where the mirror should be) into a
    // silent mirror LOSS: the emitter would report "check clean" while one
    // of its outputs simply stopped being emitted.
    try { currentText = readFileSync(frontierPath, "utf8"); }
    catch (e) {
      if (e.code !== "ENOENT") return { errors: [`maps/atlas-frontier.md: cannot read: ${e.message}`] };
      /* fixture root has no maps/ — skip */
    }
    if (currentText != null) {
      const fr = renderFrontierFile({ tree, currentText });
      if (fr.errors.length) return { errors: fr.errors };
      outputs.push({ path: frontierPath, bytes: fr.text });
    }
  }
  // F-041 P4 mirror #3: generated TypeScript world sizes, imported at build
  // time (never JSON-at-room-create — GameRoom.onCreate has no try/catch).
  // Path is derived FROM the content root: on a fixture root the sibling
  // colyseus-server/ doesn't exist and the mirror is skipped entirely.
  const serverDir = join(contentRoot, "..", "colyseus-server");
  if (tree.byId.has("n-frontier-shelf") && existsSync(serverDir)) {
    const md = renderMapDimensionsTs({ tree });
    if (md.errors.length) return { errors: md.errors };
    outputs.push({ path: join(serverDir, "src/config/generated/mapDimensions.ts"), bytes: md.text });
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
    if (mode === "write") { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); console.log(`spine-emit: wrote ${path}`); }
    else { console.error(`spine-emit: DRIFT ${path}`); drift++; }
  }
  if (mode === "check" && drift) process.exit(1);
  console.log(`spine-emit: ${mode} clean, ${r.outputs.length} files`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
