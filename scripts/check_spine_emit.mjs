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
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { loadSpine, buildTree, deriveInterior, deriveNode, resolveToRoot } from "./lib/spine.mjs";

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

// ── spine → content/maps/cluster1-geography.json (G-EMIT-DRIFT, Phase 1) ──
// Header prose is mirror boilerplate, frozen here verbatim from the shipped
// file. GEOGRAPHY_VERSION bumps to 2 with the Task 1.12 boundary redraws.
export const GEOGRAPHY_VERSION = 2;
const GEO_HEADER = {
  id: "cluster1-geography",
  title: "Cluster 1 — the Meltwash basin",
  version: GEOGRAPHY_VERSION,
  source: "docs/worldbuilding/A1-geography-cluster1.md",
  about: "Machine-readable geography of cluster 1. This is the data the world map is DRAWN FROM; the SVG is a view of it, never the source of truth. Every proper noun here already exists in the Cartographer's document (A1) or content/story/canon.md — nothing is invented.",
  coordinateSystem: {
    units: "km",
    convention: "x increases EAST, y increases SOUTH (north is smaller y) — inherited unchanged from content/maps/atlas-frontier.md",
    extentKm: { width: 150, height: 190 },
    origin: "x=0 is the west edge of the sheet (open sea); y=0 is the hard parchment edge at the top (the ice). A1 §2: the land is roughly 190 km north-south and 150 km east-west.",
    tolerance: "Positions are authored to reproduce A1 §5.1's straight-line distances within ~8%. A1 §5.3 is explicit that the world preserves topology, adjacency, ordering and terrain — NOT exact metric distance — so these coordinates are a faithful schematic, not a survey. `distances[].deltaPct` records the residual for every canon-bearing leg.",
  },
};
const strip = (n) => n.lore?.geoId ?? n.id.slice(2);
export function emitGeography({ spine, tree }) {
  const C = tree.byId.get("n-cluster1");
  const feat = (id) => {
    const f = C.features.find((x) => x.id === id);
    if (!f) throw new Error(`emitGeography: missing feature ${id}`);
    return f;
  };
  const kids = (id) => (tree.childrenOf.get(id) ?? []).map((i) => tree.byId.get(i));
  const regions = kids("n-cluster1").filter((n) => n.tier === "region" && n.lore?.order != null)
    .sort((a, b) => a.lore.order - b.lore.order);
  const rootAt = (n) => n.parentId === null ? n.placement.anchor
    : resolveToRoot({ tree, id: n.parentId, point: n.placement.anchor });
  const townNodes = regions.flatMap((r) => kids(r.id).filter((n) => n.tier === "town"));
  const towns = townNodes.filter((n) => !n.tags.includes("camp")).sort((a, b) => a.lore.order - b.lore.order);
  const camps = townNodes.filter((n) => n.tags.includes("camp"));
  const coast = feat("f-west-coast"), river = feat("f-the-meltwash"), ice = feat("f-northern-ice-edge");
  const salt = tree.byId.get("n-saltmire"), hills = tree.byId.get("n-eastern-hills");
  const endName = (e, side) => e.attrs[side === "from" ? "geoFrom" : "geoTo"]
    ?? strip(tree.byId.get(e[side].node));
  const doc = {
    ...GEO_HEADER,
    coastline: { id: "west-coast", note: coast.attrs.note, points: coast.points },
    river: { id: "the-meltwash", name: river.attrs.name, note: river.attrs.note,
      reaches: river.attrs.reaches, points: river.points, labelAt: river.attrs.labelAt,
      tidalLimit: river.attrs.tidalLimit, ford: river.attrs.ford },
    saltmire: { id: "the-saltmire", name: salt.title, note: salt.lore.note, polygon: salt.placement.points },
    iceEdge: { id: "northern-ice-edge", note: ice.attrs.note, hardEdgeAtY: ice.attrs.hardEdgeAtY, shelfLip: ice.points },
    terrainPatches: [{ id: "eastern-hills", label: hills.title, terrainKind: hills.terrainKind,
      labelAt: hills.lore.labelAt, note: hills.lore.note, polygon: hills.placement.points }],
    zones: regions.filter((r) => !["n-saltmire", "n-eastern-hills"].includes(r.id)).map((r) => {
      const town = kids(r.id).find((n) => n.tier === "town" && !n.tags.includes("camp"));
      return {
        id: strip(r), name: r.title, order: r.lore.order, levelBand: r.levelBand,
        ...(r.bands.length ? { gradient: true } : {}),
        terrainKind: r.terrainKind, town: town ? strip(town) : null,
        labelAt: r.lore.labelAt, polygon: r.placement.points,
        ...(r.lore.note ? { note: r.lore.note } : {}),
        ...(r.bands.length ? { gradientSegments: r.bands.map((b) => ({
          id: b.id.slice(2), label: b.label, levelBand: b.levelBand,
          graveRows: b.attrs.graveRows, yFromKm: b.fromKm, yToKm: b.toKm,
          note: b.attrs.note })) } : {}),
      };
    }),
    towns: towns.map((n) => ({ id: strip(n), name: n.title, at: rootAt(n),
      zone: strip(tree.byId.get(n.parentId)),
      ...(n.tags.includes("ruin") ? { ruin: true } : {}),
      emblem: n.lore.emblem, reason: n.lore.reason, labelAnchor: n.lore.labelAnchor,
      ...(n.lore.wallsOnly ? { wallsOnly: n.lore.wallsOnly } : {}) })),
    camps: camps.map((n) => ({ id: strip(n), name: n.title, at: rootAt(n),
      zone: strip(tree.byId.get(n.parentId)), note: n.lore.note })),
    roads: spine.edges.filter((e) => e.kind === "road").map((e) => ({
      id: e.id.slice(2), name: e.attrs.name, from: endName(e, "from"), to: endName(e, "to"),
      weight: e.weight, dashed: e.dashed, days: e.attrs.days, daysLabel: e.attrs.daysLabel,
      roadKm: e.attrs.roadKm, ...(e.attrs.throughRoute ? { throughRoute: e.attrs.throughRoute } : {}),
      labelAtIndex: e.attrs.labelAtIndex, note: e.attrs.note, points: e.points })),
    relay: { ...C.lore.relay,
      chains: spine.edges.filter((e) => e.kind === "relay").map((e) => ({
        id: e.id.slice(2), note: e.attrs.note,
        towerIds: [e.from, ...(e.via ?? []), e.to].map((r) => r.feature.slice(2)) })),
      towers: C.features.filter((f) => /^f-tower-\d/.test(f.id)).map((f) => ({
        id: f.id.slice(2), at: f.at, ...(f.attrs.town ? { town: f.attrs.town } : {}) })),
      detachedTowers: C.features.filter((f) => f.attrs?.detached).map((f) => ({
        id: f.id.slice(2), at: f.at, town: f.attrs.town, note: f.attrs.note })) },
    distances: { ...C.lore.distances,
      legs: spine.edges.filter((e) => e.kind === "leg").map((e) => ({
        from: endName(e, "from"), to: endName(e, "to"), canonDays: e.attrs.canonDays,
        roadKm: e.attrs.roadKm, straightKm: e.attrs.straightKm })) },
    seaLane: (() => { const e = spine.edges.find((x) => x.kind === "sealane");
      return { note: e.attrs.note, from: rootAt(tree.byId.get(e.from.node)),
        to: feat(e.to.feature).at, label: e.attrs.label }; })(),
    sheet: spine.sheet,
  };
  return canonStringify(doc) + "\n";
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
  if (tree.byId.has("n-cluster1")) {
    outputs.push({ path: join(contentRoot, "maps/cluster1-geography.json"), bytes: emitGeography({ spine, tree }) });
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
