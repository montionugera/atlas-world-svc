// Plan A Task 5 — the ONE join authority: spine (and, from Plan D, fabric +
// civil) -> the world document that gates and renderers read.
//
// This body was MOVED verbatim out of scripts/check_spine_emit.mjs's
// emitGeography(). Moving rather than reimplementing is what makes byte
// identity structural instead of merely tested — and the byte identity is
// what lets four consumers be re-pointed in one commit without a re-baseline.
//
// Conventions (inherited, non-negotiable):
//   - one options object per function;
//   - NEVER throws. A missing subject node or feature is problems.push(...).
//     The pre-Plan-A emitter threw a raw TypeError, which is why dropping
//     n-saltmire crashed both sheet builders instead of reporting;
//   - key insertion order IS the byte format. canonStringify walks
//     Object.keys() in insertion order and drops undefined-valued keys.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSpine, buildTree, resolveToRoot } from "./spine.mjs";

// The emitted document's key order, pinned. Changing this array changes the
// committed bytes of every consumer of the world document.
export const WORLD_DOC_KEYS = Object.freeze([
  "id", "title", "version", "source", "about", "coordinateSystem",
  "coastline", "river", "saltmire", "iceEdge", "terrainPatches",
  "zones", "towns", "camps", "roads", "relay", "distances", "seaLane", "sheet",
]);

// The subject descriptor. Task 7 moves this into content/spine/sheet.json's
// `subjects` block and deletes this constant; until then it holds EXACTLY the
// ids check_spine_emit.mjs:104-132 spelled inline, so the move is a pure
// relocation with no behaviour change.
export const DEFAULT_SUBJECTS = Object.freeze({
  rootId: "n-atlas",
  zoneRoot: "n-cluster1",
  landIds: ["n-cluster1"],
  seaIds: ["n-westsea"],
  terrainPatchIds: ["n-eastern-hills"],
  mireIds: ["n-saltmire"],
  featureIds: { coast: "f-west-coast", river: "f-the-meltwash", iceEdge: "f-northern-ice-edge" },
});

export const GEOGRAPHY_VERSION = 2;

// Header prose is mirror boilerplate, frozen verbatim from the shipped file.
const GEO_HEADER = {
  id: "cluster1-geography",
  title: "Cluster 1 — the Meltwash basin",
  version: GEOGRAPHY_VERSION,
  source: "docs/worldbuilding/A1-geography-cluster1.md",
  about: "GENERATED FILE — do not edit by hand. Emitted from content/spine/nodes/* by scripts/check_spine_emit.mjs (regenerate with --write; CI byte-compares with --check). Machine-readable geography of cluster 1: the data the world map is DRAWN FROM; the SVG is a view of it, never the source of truth. Every proper noun here already exists in the Cartographer's document (A1) or content/story/canon.md — nothing is invented.",
  coordinateSystem: {
    units: "km",
    convention: "x increases EAST, y increases SOUTH (north is smaller y) — inherited unchanged from content/maps/atlas-frontier.md",
    // F-045 Task 4 fix: this header was frozen boilerplate copied verbatim
    // from the pre-rescale file and never updated when rescale_spine.mjs
    // (Task 1) scaled n-cluster1's interior.size (and every town/road
    // coordinate this document's other fields derive from) 150x190 -> 30x38.
    // The towns/roads arrays below were already correct (they read live off
    // the spine); only this metadata literal had drifted, which silently
    // made basin-sheet.mjs's MAP_W/MAP_H 5x too big once its own px-per-km
    // was bumped for the F-045 density change.
    extentKm: { width: 30, height: 38 },
    origin: "x=0 is the west edge of the sheet (open sea); y=0 is the hard parchment edge at the top (the ice). A1 §2 (pre-F-045): the land was roughly 190 km north-south and 150 km east-west; F-045 (I-095) scales the basin ÷5 to 38 km north-south and 30 km east-west, same schematic.",
    tolerance: "Positions are authored to reproduce A1 §5.1's straight-line distances within ~8%. A1 §5.3 is explicit that the world preserves topology, adjacency, ordering and terrain — NOT exact metric distance — so these coordinates are a faithful schematic, not a survey. `distances[].deltaPct` records the residual for every canon-bearing leg.",
  },
};

const strip = (n) => n.lore?.geoId ?? n.id.slice(2);

export function resolveWorld({ spine, tree, descriptor = null, fabric = null, civil = null }) {
  const problems = [];
  const S = descriptor ?? DEFAULT_SUBJECTS;
  // Plan D supplies fabric/civil and makes spine/tree optional. Until then a
  // caller passing either is asking for a join this build cannot do, and
  // silently ignoring it would be the worst of the three options.
  if (fabric !== null || civil !== null)
    problems.push("resolveWorld: fabric/civil joins are Plan D — this build resolves from the spine only");

  const node = (key, id) => {
    const n = tree.byId.get(id);
    if (!n) problems.push(`sheet: subject "${key}" -> "${id}" does not resolve`);
    return n ?? null;
  };

  const C = node("zoneRoot", S.zoneRoot);
  const feat = (key, id) => {
    if (!C) return null;
    const f = (C.features ?? []).find((x) => x.id === id);
    if (!f) problems.push(`sheet: subject "${key}" -> "${id}" does not resolve`);
    return f ?? null;
  };

  const coast = feat("coast", S.featureIds.coast);
  const river = feat("river", S.featureIds.river);
  const ice = feat("iceEdge", S.featureIds.iceEdge);
  const salt = node("mireIds[0]", S.mireIds[0]);
  const hills = node("terrainPatchIds[0]", S.terrainPatchIds[0]);
  if (problems.length) return { doc: null, problems };

  const kids = (id) => (tree.childrenOf.get(id) ?? []).map((i) => tree.byId.get(i));
  const regions = kids(S.zoneRoot)
    .filter((n) => n.tier === "region" && n.lore?.order != null)
    .sort((a, b) => a.lore.order - b.lore.order);
  const rootAt = (n) => n.parentId === null
    ? n.placement.anchor
    : resolveToRoot({ tree, id: n.parentId, point: n.placement.anchor });
  const townNodes = regions.flatMap((r) => kids(r.id).filter((n) => n.tier === "town"));
  const towns = townNodes.filter((n) => !n.tags.includes("camp")).sort((a, b) => a.lore.order - b.lore.order);
  const camps = townNodes.filter((n) => n.tags.includes("camp"));
  const endName = (e, side) => e.attrs[side === "from" ? "geoFrom" : "geoTo"]
    ?? strip(tree.byId.get(e[side].node));
  const excluded = new Set([...S.mireIds, ...S.terrainPatchIds]);

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
    zones: regions.filter((r) => !excluded.has(r.id)).map((r) => {
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
    // F-045 Task 2: days/daysLabel -> hours/hoursLabel — edges.json stopped
    // carrying the day-count fields once rescale_spine.mjs (Task 1)
    // relabeled travel time to hours; this mirror was silently dropping the
    // travel-time data (canonStringify drops undefined-valued keys) until
    // it was updated to read the new field names.
    roads: spine.edges.filter((e) => e.kind === "road").map((e) => ({
      id: e.id.slice(2), name: e.attrs.name, from: endName(e, "from"), to: endName(e, "to"),
      weight: e.weight, dashed: e.dashed, hours: e.attrs.hours, hoursLabel: e.attrs.hoursLabel,
      roadKm: e.attrs.roadKm, ...(e.attrs.throughRoute ? { throughRoute: e.attrs.throughRoute } : {}),
      labelAtIndex: e.attrs.labelAtIndex, note: e.attrs.note,
      // F-045 Task 5 (final-review sweep): a handful of road notes still cite
      // pre-rescale day-counts/absolute km (I-095) — surfaced on the emitted
      // mirror the same way n-cluster1's lore fields are, so the marker is
      // visible wherever the note itself is.
      ...(e.attrs.amendedPending ? { amendedPending: e.attrs.amendedPending } : {}),
      points: e.points })),
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
        from: endName(e, "from"), to: endName(e, "to"), canonHours: e.attrs.canonHours,
        roadKm: e.attrs.roadKm, straightKm: e.attrs.straightKm })) },
    seaLane: (() => {
      const e = spine.edges.find((x) => x.kind === "sealane");
      if (!e) { problems.push(`sheet: subject "seaLane" -> no edge of kind "sealane"`); return null; }
      const far = (C.features ?? []).find((f) => f.id === e.to.feature);
      if (!far) { problems.push(`sheet: subject "seaLane.to" -> "${e.to.feature}" does not resolve`); return null; }
      return { note: e.attrs.note, from: rootAt(tree.byId.get(e.from.node)), to: far.at, label: e.attrs.label };
    })(),
    sheet: spine.sheet,
  };
  if (problems.length) return { doc: null, problems };
  return { doc, problems };
}

// The disk-facing entry point. Prefers the spine; falls back to the legacy
// mirror FILE for content roots that carry one but no spine — which is every
// fixture root in scripts/tests/{zone-content,town-plan,bestiary-placement}.test.mjs.
// Plan D deletes the fallback and points this at content/world/resolved/.
export function loadPlaces({ contentRoot }) {
  const problems = [];
  if (existsSync(join(contentRoot, "spine"))) {
    const spine = loadSpine({ contentRoot });
    if (spine.present && spine.errors.length === 0) {
      const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
      if (tree.errors.length === 0 && tree.byId.has(DEFAULT_SUBJECTS.zoneRoot))
        return resolveWorld({ spine, tree });
    }
  }
  const mirror = join(contentRoot, "maps/cluster1-geography.json");
  if (existsSync(mirror)) {
    try {
      return { doc: JSON.parse(readFileSync(mirror, "utf8")), problems };
    } catch (e) {
      problems.push(`geography: ${mirror}: ${e.message}`);
      return { doc: null, problems };
    }
  }
  problems.push(`geography: ${contentRoot} has neither a resolvable spine nor maps/cluster1-geography.json`);
  return { doc: null, problems };
}
