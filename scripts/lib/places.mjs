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

// Plan A Task 7: the subject descriptor is DATA. It lives in
// content/spine/sheet.json's `subjects` block — the same file the sheet's
// title, hand and withheld list already live in — and there is no in-code
// default. Two sources of subject ids would be two ways for a sheet to break,
// and the code half would be the one nobody reviews when the basin is renamed.
// scripts/tests/places.test.mjs pins that no spine id is quoted in this file.

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

// "NEVER throws" is a CONTRACT, and until this wrapper existed it was only an
// intention. The validation block below guards the descriptor, the tree, the
// edges array and the EXISTENCE of every subject node — but nothing guards the
// SHAPE of a node once it resolves. `salt.lore.note`, `coast.attrs.note`,
// `hills.lore.labelAt`, `C.features.filter`, `C.lore.relay` and ~30 more
// dereferences in the assembly below all assume an optional block is present,
// and loadSpine does not require any of them: deleting `lore` from
// content/spine/nodes/n-saltmire.json loads clean and then throws a raw
// TypeError here.
//
// That throw is not a cosmetic failure. From Task 6 this runs INSIDE
// check_content.mjs (placesDoc -> loadGeographyZones -> checkBestiaryPlacement),
// where an uncaught throw skips finish() and takes every gate after it with it.
// Measured on that exact fixture: the gate printed 0 FAIL lines and 0
// `content-gate:` summary lines, and the `G-LOAD-BUDGET` failure the same
// fixture reports under --only=spine vanished completely. A gate that stops
// checking and says nothing is the failure mode this whole task exists to
// prevent.
//
// Guarding the five fields the reviewer happened to name would leave the sixth
// open, and Plans B/C/D each add fields to the assembly below. So the guarantee
// is structural: one wrapper, and every dereference inside is covered — now and
// for every field added later. A caught error becomes an ordinary in-band
// problem, which is strictly MORE visible than a stack trace that kills the
// process before finish() can print anything.
export function resolveWorld(args) {
  try {
    return resolveWorldFromSpine(args);
  } catch (e) {
    // Reaching here means a node resolved but was missing a block the assembly
    // assumes. Name the node-shape cause, and keep the stack for the human.
    return {
      doc: null,
      problems: [`resolveWorld: threw while assembling the world document — a spine node is missing a block the join requires: ${e?.stack ?? e?.message ?? e}`],
    };
  }
}

function resolveWorldFromSpine({ spine, tree, descriptor = null, fabric = null, civil = null }) {
  const problems = [];
  const S = descriptor ?? spine?.sheet?.subjects ?? null;
  if (!S) {
    problems.push("sheet: content/spine/sheet.json has no `subjects` descriptor — the sheet's subject ids are DATA, not code");
    return { doc: null, problems };
  }
  // Plan D supplies fabric/civil and makes spine/tree optional. Until then a
  // caller passing either is asking for a join this build cannot do, and
  // silently ignoring it would be the worst of the three options.
  if (fabric !== null || civil !== null)
    problems.push("resolveWorld: fabric/civil joins are Plan D — this build resolves from the spine only");

  // Input shape, checked BEFORE anything dereferences it. "NEVER throws" is
  // load-bearing rather than stylistic: from Task 6 three gate joins call this
  // from inside check_content.mjs, where an uncaught throw skips finish() and
  // silently drops every FAIL already recorded.
  //   - `descriptor`: Task 7 feeds it from content/spine/sheet.json, so a
  //     missing `featureIds`/`mireIds` key is the realistic failure and must be
  //     a named diagnosis, not `TypeError: … reading 'coast'`.
  //   - `spine.edges`: loadSpine (spine.mjs:228) only applies `?? []` to a
  //     null/absent read, so an edges.json that parses to a non-array reaches
  //     the three `.filter()` calls below with no error recorded upstream.
  //   - `tree`: duck-typed on .get so a cross-realm Map still passes.
  // `!S` was re-tested here and is dead: the guard above already returned on a
  // falsy S. What is NOT dead is the array case — `typeof [] === "object"`, so
  // an array descriptor used to reach the per-key checks and be diagnosed by
  // array index instead of by shape.
  if (typeof S !== "object" || Array.isArray(S)) {
    problems.push("resolveWorld: descriptor is not an object");
  } else {
    if (typeof S.zoneRoot !== "string")
      problems.push("resolveWorld: descriptor.zoneRoot is missing or not a string");
    for (const k of ["mireIds", "terrainPatchIds"])
      if (!Array.isArray(S[k]) || S[k].length === 0)
        problems.push(`resolveWorld: descriptor.${k} is missing or empty`);
    if (!S.featureIds || typeof S.featureIds !== "object")
      problems.push("resolveWorld: descriptor.featureIds is missing or not an object");
    else
      for (const k of ["coast", "river", "iceEdge"])
        if (typeof S.featureIds[k] !== "string")
          problems.push(`resolveWorld: descriptor.featureIds.${k} is missing or not a string`);
  }
  if (typeof tree?.byId?.get !== "function" || typeof tree?.childrenOf?.get !== "function")
    problems.push("resolveWorld: tree is missing its byId/childrenOf maps");
  if (!Array.isArray(spine?.edges)) problems.push("resolveWorld: spine.edges is not an array");
  if (problems.length) return { doc: null, problems };

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

  // R3: enumerate the region children of zoneRoot and REQUIRE a lore.order on
  // every one that is a zone. The old `.filter(n => n.lore?.order != null)`
  // SILENTLY DROPPED any region without the field — with a null-check scaled to
  // 160 regions, a region ceases to exist with every gate green. A missing
  // order inside this scope is now a FAIL.
  //
  // DEVIATION FROM PLAN (Task 7 Step 4c), and the reason for it: the plan
  // scopes the rule to `n.tier === "region"` alone and asserts "all 12
  // committed children carry one". They do not — the mire and the terrain
  // patch are region-tier children that are NOT zones and carry no lore.order,
  // so the plan's literal rule goes RED on content that is correct. The scope
  // is therefore the descriptor's own non-zone lists, which is also what the
  // plan wanted from the second filter it kills: the two-element id exclusion
  // that used to be typed into the emitter is now read from the descriptor.
  // Byte-identical today: the same 10 zones, in the same order.
  const excluded = new Set([...S.mireIds, ...S.terrainPatchIds]);
  const scoped = kids(S.zoneRoot).filter((n) => n.tier === "region" && !excluded.has(n.id));
  for (const r of scoped)
    if (r.lore?.order == null)
      problems.push(`sheet: region "${r.id}" under "${S.zoneRoot}" has no lore.order — a region without an order is dropped silently, which is how a region ceases to exist with every gate green`);
  if (problems.length) return { doc: null, problems };
  const regions = [...scoped].sort((a, b) => a.lore.order - b.lore.order);
  const rootAt = (n) => n.parentId === null
    ? n.placement.anchor
    : resolveToRoot({ tree, id: n.parentId, point: n.placement.anchor });
  const townNodes = regions.flatMap((r) => kids(r.id).filter((n) => n.tier === "town"));
  const towns = townNodes.filter((n) => !n.tags.includes("camp")).sort((a, b) => a.lore.order - b.lore.order);
  const camps = townNodes.filter((n) => n.tags.includes("camp"));
  const endName = (e, side) => e.attrs[side === "from" ? "geoFrom" : "geoTo"]
    ?? strip(tree.byId.get(e[side].node));

  const doc = {
    ...GEO_HEADER,
    // Review finding (Task 7): the five document ids used to be typed here as
    // literals — "west-coast", "the-meltwash", "the-saltmire",
    // "northern-ice-edge", "eastern-hills". They are the STRIPPED form of the
    // very subjects the descriptor names, so a literal here meant the
    // descriptor could be re-pointed at a different node and the emitted
    // document would keep the OLD subject's id: criterion 12 held for quoted
    // `n-`/`f-` ids only, and these five slipped under that regex. Derived via
    // strip() they follow the descriptor. Byte-identical today, and proven so
    // rather than argued: strip() returns exactly the five former literals
    // (n-saltmire carries lore.geoId "the-saltmire"; the other four are the
    // id minus its two-character prefix), and check_spine_emit --check is
    // clean over the regenerated mirror.
    coastline: { id: strip(coast), note: coast.attrs.note, points: coast.points },
    river: { id: strip(river), name: river.attrs.name, note: river.attrs.note,
      reaches: river.attrs.reaches, points: river.points, labelAt: river.attrs.labelAt,
      tidalLimit: river.attrs.tidalLimit, ford: river.attrs.ford },
    saltmire: { id: strip(salt), name: salt.title, note: salt.lore.note, polygon: salt.placement.points },
    iceEdge: { id: strip(ice), note: ice.attrs.note, hardEdgeAtY: ice.attrs.hardEdgeAtY, shelfLip: ice.points },
    terrainPatches: [{ id: strip(hills), label: hills.title, terrainKind: hills.terrainKind,
      labelAt: hills.lore.labelAt, note: hills.lore.note, polygon: hills.placement.points }],
    // `regions` is already the descriptor-scoped list: the mire and the
    // terrain patch were excluded before the lore.order rule ran, so there is
    // no second filter here.
    zones: regions.map((r) => {
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
      // Task 7: the zoneRoot is the descriptor's, not a constant's. A content
      // root whose spine carries no `subjects` descriptor has no zoneRoot to
      // test, so it falls THROUGH to the mirror exactly as a root with no
      // spine does — which is what the ~45 minimal fixture roots need (four of
      // them ship a spine/sheet.json that is title/hand/withheld only, with no
      // `subjects` block at all).
      //
      // Review finding (Task 7): "no descriptor" and "a descriptor that does
      // not resolve" are NOT the same case and used to share one silent exit.
      // A real content root whose descriptor names a zoneRoot the tree does not
      // have is CORRUPTION, and falling through to a stale mirror let the full
      // gate print unchanged counts and exit 0 — the going-dark failure this
      // module exists to prevent. Absent descriptor: fall through. Present but
      // unresolvable: report.
      const subjects = spine.sheet?.subjects ?? null;
      const zoneRoot = subjects?.zoneRoot;
      if (tree.errors.length === 0 && subjects) {
        if (typeof zoneRoot !== "string" || !tree.byId.has(zoneRoot)) {
          problems.push(`geography: content/spine/sheet.json has a \`subjects\` descriptor whose zoneRoot ${JSON.stringify(zoneRoot ?? null)} does not resolve in the spine — refusing to fall back to maps/cluster1-geography.json, which would report a stale world with every gate green`);
          return { doc: null, problems };
        }
        return resolveWorld({ spine, tree });
      }
    }
  }
  const mirror = join(contentRoot, "maps/cluster1-geography.json");
  if (existsSync(mirror)) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(mirror, "utf8"));
    } catch (e) {
      problems.push(`geography: ${mirror}: ${e.message}`);
      return { doc: null, problems };
    }
    // A mirror holding literal `null` (or an array, or a bare scalar) PARSES
    // fine. Without this guard it returned { doc: null, problems: [] } — a null
    // doc with zero diagnostics — and all three gate joins `return 0` on a null
    // doc, so the gate goes silently dark instead of red. This guard is not new
    // defensiveness: it is the one check_content.mjs's loadGeographyZones /
    // loadGeographyTowns already carry ("is shape-invalid — expected { zones:
    // [...] }"), whose own comment records that a file holding literal `null`
    // bit this repo once. Task 6 re-points those loaders here, so the guard has
    // to arrive with the source it protects.
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      problems.push(`geography: ${mirror} is shape-invalid — expected a JSON object`);
      return { doc: null, problems };
    }
    return { doc: parsed, problems };
  }
  problems.push(`geography: ${contentRoot} has neither a resolvable spine nor maps/cluster1-geography.json`);
  return { doc: null, problems };
}
