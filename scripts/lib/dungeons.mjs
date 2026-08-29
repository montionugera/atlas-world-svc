// Plan D — dungeons as a file family.
//
// G-DUNGEON-REACH is two cheap assertions and one report:
//   1. the bound entrance resolves to a landform whose lexicon row is
//      dungeonCapable: true — a door has to be a door;
//   2. the committed fabric `dungeonAnchors[]` row finds a settlement within
//      2 region hops — a dungeon nobody can walk to is content nobody sees;
//   3. per-region density is REPORTED WITHOUT FAILING, so the Ragnarok ratio
//      (1 town : 5 fields : 6 dungeon floors) stays visible while authoring.
//      Same always-print discipline as G-LOAD-BUDGET and G-COMP-REPORT.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export function loadDungeons({ contentRoot }) {
  const dir = join(contentRoot, "dungeons");
  const out = { families: new Map(), dungeons: [], errors: [] };
  if (!existsSync(dir)) return out;
  const read = (p) => {
    try { return JSON.parse(readFileSync(p, "utf8")); }
    catch (e) { out.errors.push(`dungeons: ${p}: ${e.message}`); return null; }
  };
  const famDir = join(dir, "families");
  if (existsSync(famDir))
    for (const f of readdirSync(famDir).filter((x) => x.endsWith(".json")).sort()) {
      const doc = read(join(famDir, f));
      if (doc?.id) out.families.set(doc.id, doc);
    }
  for (const f of readdirSync(dir).filter((x) => /^dungeon-.+\.json$/.test(x)).sort()) {
    const doc = read(join(dir, f));
    if (doc) out.dungeons.push(doc);
  }
  return out;
}

export function expandFamily({ family, index }) {
  const b = family.levelBand;
  return { levelBand: [b.base + b.step * index, b.base + b.step * index + b.span], floors: family.floors };
}

// The region-hop distance is NOT re-derived here. Plan C's anchorDungeons
// already walks the region adjacency graph once, at generation time, and
// serialises the answer into every fabric file's `dungeonAnchors[]` row as
// `hopsToSettlement`. Reading it back is the whole point of committing it:
// a second BFS in the gate would carry its own copy of the settlement->region
// join, and the two copies are exactly what drifts. A missing anchor row is a
// LOUD problem naming the generator, not a silent Infinity.
function anchorIndex({ world }) {
  const byHandle = new Map();
  for (const f of Object.values(world.fabric))
    for (const a of f.dungeonAnchors ?? []) byHandle.set(a.handle, a);
  return byHandle;
}

export function gDungeonReach({ world, dungeons, lexicon }) {
  if (!world.present) return [];
  const problems = [];
  const anchors = anchorIndex({ world });
  for (const d of dungeons) {
    const h = world.handles.get(d.bind?.handle);
    if (!h) { problems.push(`G-DUNGEON-REACH: ${d.id} handle "${d.bind?.handle}" does not resolve in any ledger`); continue; }
    const row = lexicon.get(h.type);
    if (!row?.dungeonCapable)
      problems.push(`G-DUNGEON-REACH: ${d.id} entrance landform "${h.type}" is not dungeonCapable`);
    const anchor = anchors.get(d.bind.handle);
    if (!anchor) {
      problems.push(`G-DUNGEON-REACH: ${d.id} handle "${d.bind.handle}" is in a ledger but has no dungeonAnchors row in the fabric — re-run the generator, do not bind to a non-anchor`);
      continue;
    }
    // Plan C emits Infinity as null when no settled region is reachable at
    // all; "3 hops" and "unreachable" are different bugs and read differently.
    if (anchor.hopsToSettlement === null)
      problems.push(`G-DUNGEON-REACH: ${d.id} has no settled region reachable at any distance`);
    else if (anchor.hopsToSettlement > 2)
      problems.push(`G-DUNGEON-REACH: ${d.id} nearest settlement is ${anchor.hopsToSettlement} region hops (max 2)`);
  }
  return problems;
}

export function dungeonDensityLines({ world, dungeons }) {
  const byRegion = new Map();
  for (const d of dungeons) {
    const h = world.handles.get(d.bind?.handle);
    if (!h) continue;
    byRegion.set(h.region, (byRegion.get(h.region) ?? 0) + 1);
  }
  return [...byRegion.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([region, n]) => `dungeon-density: ${region} ${n} complexes`);
}
