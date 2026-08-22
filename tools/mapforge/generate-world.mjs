#!/usr/bin/env node
// tools/mapforge/generate-world.mjs — Plan C: the generator CLI.
//
// Replaces gen-world.mjs. The difference is not incremental: gen-world MERGED
// a candidate set onto the live root and needed three hardcodes to survive its
// own previous output. This builds a COMPLETE content root from scratch,
// reading exactly four things:
//   1. content/spine/nodes/n-atlas.json  (the frozen frame + seed streams)
//   2. content/world/premises/*.json
//   3. content/world/civil/ and content/world/relations/ (empty in Plan C)
//   4. the runtime subtree, byte-for-byte unchanged — identified by ROOT
//      MEMBERSHIP from content/spine/roots.json, never by a pinned id list.
// So there is no previous output to subtract, no synthetic budget, and no
// sealane id to special-case.
//
// PLAN C COMMITS ZERO SPINE NODE BYTES. Everything below lands in the
// gitignored draft root; Plan E's redraw is the commit that writes
// content/spine/nodes/.
//
// Usage:
//   node tools/mapforge/generate-world.mjs --seed <hex16> --out build/mapforge/<runId>
//                                          [--no-png] [--stage-report]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, cpSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeGrid, FLAG } from "./lib/grid.mjs";
import { mintSeed, namedStream, terrainStream } from "./lib/seed.mjs";
import { q } from "./lib/noise.mjs";
import { applyPremiseMasks } from "./lib/passes/mask.mjs";
import { buildElevation, assignSubstrate } from "./lib/passes/elevation.mjs";
import { selectSeaLevelByRank, classifySea, CELL_AREA_KM2 } from "./lib/passes/sea-level.mjs";
import { applyWinds } from "./lib/passes/winds.mjs";
import { priorityFlood, d8FlowDir, flowAccumulate } from "./lib/hydrology.mjs";
import { carveWater } from "./lib/passes/water.mjs";
import { classifyBiomes } from "./lib/passes/biome.mjs";
import { partitionRegions } from "./lib/passes/partition.mjs";
import { instanceLandforms } from "./lib/passes/landforms.mjs";
import { placeSettlements, assignLevelBands } from "./lib/passes/settlements.mjs";
import { routeRoads } from "./lib/passes/roads.mjs";
import { anchorDungeons } from "./lib/passes/dungeons.mjs";
import { buildRegionRings, buildCoastRings, buildTrunkRings, buildFabricFile, hashOf,
         fabricStringify, trunkRingCap, townFeatureId, townSlug, townFeatureIds } from "./lib/fabric.mjs";
import { GENERATOR_VERSION } from "./lib/version.mjs";
import { BIOMES, buildTree, placementArea } from "../../scripts/lib/spine.mjs";
import { canonicalNode, canonStringify, derivedSidecar } from "../../scripts/check_spine_emit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export function runIdOf({ seed, version }) { return `${seed.slice(0, 8)}-${version}`; }

// ── the pass pipeline ──────────────────────────────────────────────────────
// The plan declares `runPasses({ manifest, premises, pinned, relations })` and
// Plan D quotes that signature, so `lexicon` and `loadBudget` DEFAULT to the
// committed files rather than becoming required arguments — the plan's own
// version reads the lexicon inside the function for the same reason. A caller
// with its own fixture lexicon (Task 8's mini-lexicon) passes one.
export function runPasses({ manifest, premises,
                            lexicon = readJson(join(REPO_ROOT, "content/world/lexicon/landforms.json")),
                            loadBudget = readJson(join(REPO_ROOT, "content/spine/load-budget.json")),
                            pinned = [], relations = [], onStage = () => {} }) {
  const timings = {};
  const problems = [];
  const time = (name, label, fn) => {
    const t = Date.now();
    const r = fn();
    timings[name] = Date.now() - t;
    onStage(name, label, timings[name]);
    return r;
  };

  const seed = manifest.seed;
  // THE FOUR COMMITTED STREAM NAMES ARE INJECTED, NEVER MINTED FROM A PARENT.
  // `mintSeed({ parentStream, name: "terrain" })` THROWS (lib/seed.mjs's
  // RESERVED_STREAM_NAMES) and a source scan over tools/mapforge reds on the
  // written call site — the plan's own spelling (:6578, :6603, :6612) cannot
  // be run. `namedStream` takes the WORLD seed, which is what
  // content/spine/derived.json commits per node.
  const terrain = terrainStream({ worldSeed: seed });
  const settlementStream = namedStream({ worldSeed: seed, name: "settlements" });
  const nameStream = namedStream({ worldSeed: seed, name: "names" });
  // P9 TAKES THE TERRAIN STREAM, NOT `vegetation` — the plan (:6603) writes
  // `mintSeed({ parentStream: seed, name: "vegetation" })`, which cannot be
  // written at all (lib/seed.mjs throws on a reserved name) and which would
  // in any case build a DIFFERENT world from the one every committed golden
  // pins: partition.test.mjs, landforms.test.mjs, settlements.test.mjs,
  // roads.test.mjs and dungeons.test.mjs all drive partitionRegions off the
  // terrain stream. Re-seeding the partition here is a whole-world
  // re-baseline, which is not this task's to take. `vegetation` is committed
  // in derived.json and is unclaimed by any pass — filed, not spent.

  const grid = makeGrid({ w: manifest.grid.w, h: manifest.grid.h, cellKm: manifest.grid.cellKm });

  const { maskField, plateArea } = time("P1", "premise-masks", () =>
    applyPremiseMasks({ grid, premises, stream: terrain }));
  time("P2", "elevation", () => buildElevation({ grid, premises, maskField, stream: terrain }));
  // P2b runs INSIDE the P2 slot, before P3: it writes flag bits, never elev,
  // so the "P2 is the last pass that writes elev" ordering rule still holds.
  time("P2b", "substrate", () => assignSubstrate({ grid, premises, maskField }));

  const target = Math.round(manifest.budget.grossLandPolygonKm2 / CELL_AREA_KM2);
  const sea = time("P3", "sea-level-rank", () =>
    selectSeaLevelByRank({ elev: grid.elev, targetLandCells: target }));
  classifySea({ grid, seaLevel: sea.seaLevel });

  time("P5", "winds", () => applyWinds({ grid, stream: terrain }));
  time("P6", "hydrology", () => {
    const f = priorityFlood({ elev: grid.elev, w: grid.w, h: grid.h });
    grid.flowDir.set(d8FlowDir({ elev: f, w: grid.w, h: grid.h }));
    grid.flowAcc.set(flowAccumulate({ flowDir: grid.flowDir, w: grid.w, h: grid.h }));
  });
  time("P7", "lakes-deltas-glaciers", () => carveWater({ grid, premises, manifest }));
  time("P8", "biomes", () => classifyBiomes({ grid, premises, BIOMES }));

  const part = time("P9", "region-partition", () =>
    partitionRegions({ grid, premises, manifest, stream: terrain }));

  const land = time("P10", "landforms", () =>
    instanceLandforms({ grid, premises, regions: part.regions, lexicon, manifest,
      stream: terrain, nameStream }));

  const settle = time("P11", "settlements", () =>
    placeSettlements({ grid, premises, regions: part.regions, manifest, pinned,
      stream: settlementStream }));
  time("P11b", "level-bands", () =>
    assignLevelBands({ regions: part.regions, settlements: settle.settlements, manifest, problems }));

  const net = time("P12", "roads-lanes", () =>
    routeRoads({ grid, settlements: settle.settlements, regions: part.regions }));
  const dung = time("P13", "dungeon-anchors", () =>
    anchorDungeons({ instances: land.instances, regions: part.regions,
      settlements: settle.settlements, lexicon, manifest, stream: settlementStream }));

  const ringCap = trunkRingCap({ loadBudget });
  const rings = time("P14", "arcs-polygons-fabric", () => ({
    region: buildRegionRings({ grid, regions: part.regions, problems }),
    coast: buildCoastRings({ grid, premises, stream: terrain, problems }),
  }));
  // The water trunk is part of P14, not an afterthought: without it the frame
  // closure has no polygons behind its 91,200 km² of ocean, the promoted world
  // carries ~94,400 km² of interstitial against a budget of 3,200, and
  // G-ATLAS-ROLLUP's ±2 pp cannot hold — while G-SEALAND still passes, because
  // it measures the fabric cell census and not the polygons.
  //
  // NAMED `waterTrunk`, not `water` — the plan's `const water` at :6599 is
  // already bound by the P7 carve sixty lines up, and a second `const water`
  // in the same block scope is a hard SyntaxError. Here P7's result is not
  // bound at all, but the name still says which water it means.
  const waterTrunk = time("P14w", "water-trunk", () =>
    buildTrunkRings({ grid, premises, manifest, ringCap, problems }));

  // ── assemble the fabric files ────────────────────────────────────────────
  const generator = { name: "mapforge", version: GENERATOR_VERSION, seed, epoch: 0 };
  const fabric = [];
  const continents = [];
  let seaCells = 0, lakeCells = 0, grossLandCells = 0, unownedLandCells = 0;
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) !== 0) { seaCells++; continue; }
    grossLandCells++;
    // LAKE cells are gross land that regions deliberately do not tile (regions
    // tile NET land, STATE §5), so they are NOT "unowned" as well — counting
    // them twice puts the frame identity 6,400 cells over 640,000.
    if ((grid.flags[i] & FLAG.LAKE) !== 0) { lakeCells++; continue; }
    if (grid.owner[i] < 0) unownedLandCells++;
  }

  premises.forEach((p, k) => {
    const rs = part.regions.filter((r) => r.continent === p.id);
    const ids = new Set(rs.map((r) => r.id));
    const census = { land: 0, lake: 0, unowned: 0 };
    const hist = {};
    for (const r of rs) { hist[r.id] = r.cells; census.land += r.cells; }
    for (let i = 0; i < grid.n; i++) {
      if (grid.plate[i] !== k || (grid.flags[i] & FLAG.SEA) !== 0) continue;
      if ((grid.flags[i] & FLAG.LAKE) !== 0) { census.lake++; continue; }
      if (grid.owner[i] < 0) census.unowned++;
    }
    const coast = rings.coast.get(p.id);
    fabric.push(buildFabricFile({
      premise: p, generator, seaLevel: sea.seaLevel, cellKm: grid.cellKm, census, ownerHistogram: hist,
      regions: rs.map((r) => {
        const ring = rings.region.rings.get(r.id);
        return {
          id: r.id, survey: r.survey, areaKm2: q(r.areaKm2), terrainKind: r.terrainKind,
          biomeShares: Object.fromEntries(Object.entries(r.biomeShares)
            .map(([b, v]) => [grid.biomeNames[b] ?? BIOMES[b] ?? b, v])),
          // RINGS, PLURAL, AND HOLES. 18 of the 160 regions have a boundary of
          // more than one ring and three enclose holes; the plan's single
          // `ring` (line 318) drops 384.88 km² of second lobes and c04/r13
          // alone loses 162.50 of its declared 470.50. See fabric.mjs.
          rings: ring?.rings ?? [], holes: ring?.holes ?? [],
          levelBand: r.levelBand ?? null, adjacent: r.adjacent, centroidKm: r.centroidKm,
          // The settlement ids sited in this region. Plan D's G-DUNGEON-REACH
          // and the resolver both need the region -> settlement direction of
          // the join; without it `regions.get(id)?.settlements` is always
          // undefined and every dungeon reports Infinity hops to the nearest
          // town.
          settlements: settle.settlements.filter((x) => x.region === r.id).map((x) => x.id),
          // The epistemic gradient the frontier hatch is keyed on (spec §6.4
          // extension 1). NULL on every surveyed region — a walked region is
          // not a claim about how good the report was.
          provenance: r.survey === "reported" ? r.provenance : null,
        };
      }),
      // The continent's own coast contour and its largest river, at fabric
      // resolution. buildCoastRings already computed the first; P6's flow
      // accumulation already ranked the second.
      outerRing: coast?.rings?.[0] ?? null,
      outerHoles: coast?.holes ?? [],
      trunkRiver: net.trunkRivers?.[p.id] ?? null,
      instances: land.instances.filter((x) => ids.has(x.region)),
      settlements: settle.settlements.filter((x) => x.continent === p.id),
      roads: net.roads.filter((x) => x.continent === p.id),
      dungeonAnchors: dung.anchors.filter((x) => x.continent === p.id),
    }));
    // GROSS, not net. P9's census.land is the NET land regions tile; the
    // world.json key is `grossLandCells` and the lake cells sit inside it
    // (STATE §13's naming hazard for Task 10a).
    continents.push({ id: p.id, landCells: census.land + census.lake,
                      grossLandKm2: q((census.land + census.lake) * CELL_AREA_KM2),
                      fabric: `content/world/fabric/continent-${p.id.slice(1)}.json` });
  });

  const netLandKm2 = q((grossLandCells - lakeCells) * CELL_AREA_KM2);
  const worldFile = {
    seed, epoch: 0, generator: { name: generator.name, version: generator.version },
    cellKm: grid.cellKm, grid: { w: grid.w, h: grid.h, cells: grid.n },
    seaLevel: q(sea.seaLevel), rank: sea.rank,
    census: { grossLandCells, lakeCells, seaCells, unownedLandCells },
    areaKm2: { netLand: netLandKm2, water: q(160000 - netLandKm2), total: 160000 },
    seaToLandRatio: q((160000 - netLandKm2) / netLandKm2),
    continents, seaLanes: net.seaLanes,
  };

  const trunk = buildTrunk({ manifest, premises, grid, rings: waterTrunk, generator,
                             settlements: settle.settlements, problems });

  timings.total = Object.values(timings).reduce((a, b) => a + b, 0);
  problems.push(...settle.problems, ...net.problems, ...dung.problems);
  return { grid, fabric, world: worldFile, handles: land.ledgers,
           trunk: trunk.nodes, edges: trunk.edges, problems,
           substitutions: land.substitutions, coverage: land.coverage,
           // The run manifest is COMMITTED (build/mapforge/<runId>/manifest.json
           // is hashed by promote step 1), so it carries the water trunk's
           // problem COUNT, never the trunk object itself: 12 polygons of up to
           // 160 points each would be ~200 KB of duplicated ring data in a file
           // whose whole job is to be diffable between two seeds.
           runManifest: { seed, version: GENERATOR_VERSION, seaLevel: q(sea.seaLevel), rank: sea.rank,
                          landKm2: netLandKm2, waterKm2: q(160000 - netLandKm2),
                          seaToLandRatio: worldFile.seaToLandRatio,
                          corridors: waterTrunk.water.corridors,
                          interstitialKm2: q(waterTrunk.water.unclaimedSeaCells * CELL_AREA_KM2),
                          plateArea: Array.from(plateArea) },
           relations, timings };
}

// ── the trunk ──────────────────────────────────────────────────────────────
//
// The draft trunk: 13 continents + 3 oceans + 9 seas under n-atlas, PLUS the
// three preserved chart anchors re-parented in writeRun. Regions and landform
// instances are NOT nodes (spec §8.4). n-atlas itself is carried over verbatim
// from the live root apart from its composition.
//
// TRUNK FEATURES ARE THE NETWORK (spec §5.6). gSpineNet resolves road and leg
// edge endpoints against node.features (check_content.mjs:1986-1999), and
// G-CONTAIN's feature half checks each against its owning ring. So every
// settlement gets a `kind: "point"` feature on its continent node, id
// `f-town-<slug>`. Without them Plan E's canon-leg re-fit has nothing to point
// at and G-NET + G-CANON-LEG both go red at the redraw commit with no fix
// available inside Plan E.
//
// `townFeatureId`/`townSlug` are RE-EXPORTED from settlements.mjs, never
// redefined here — the plan's `slugOf(s.title)` would name all 45 towns
// `f-town-null`, because no generated settlement carries a title in Plan C.

// A CONTINENT'S NODE ID IS DATA, NOT A DERIVATION. It comes from
// manifest.landmasses[].nodeId — the same column the oceans and seas already
// carry — and never from slugging the title. c02 "Wealdmarch" is the reason:
// its live node is n-cluster1, twelve committed node files name it as their
// parentId, check_spine_emit.mjs:104 and atlas-sheet.mjs:42 resolve it by
// literal id and hard-fail without it, spine-coverage.mjs:14 walks its
// children, and Plan D derives PIN_OFFSET from its committed anchor. Slugging
// would mint n-wealdmarch, and promote's reconciliation would then delete
// n-cluster1 as an n-atlas descendant absent from the draft — taking all of
// that with it.
export function buildTrunk({ manifest, premises, grid, rings, generator, settlements, problems = [] }) {
  const nodes = [], edges = [];
  // Throws on a collision across the WHOLE world before a single node is built.
  // Minting them per continent below would let two landmasses agree on a slug
  // and produce one feature id at two points, which is the one thing G-NET
  // cannot resolve.
  townFeatureIds({ settlements });
  premises.forEach((p, k) => {
    const r = rings.rings.get(p.id);
    if (!r) { problems.push(`buildTrunk: ${p.id} produced no ring`); return; }
    const lm = manifest.landmasses.find((m) => m.id === p.id);
    if (!lm?.nodeId)
      throw new Error(`buildTrunk: manifest.landmasses has no nodeId for ${p.id} — ` +
        `the continent node id is authored in content/world/manifest.json, never derived from the title`);
    const mine = settlements.filter((s) => s.continent === p.id);
    nodes.push({
      id: lm.nodeId,
      tier: "continent", parentId: "n-atlas", title: p.title,
      provenance: { authored: "generated",
                    generator: { name: generator.name, version: generator.version,
                                 fabric: `content/world/fabric/continent-${p.id.slice(1)}.json` },
                    source: `content/world/premises/continent-${p.id.slice(1)}.json` },
      frozen: false,
      seed: { value: namedNodeSeed({ manifest, name: p.id }), epoch: 0, why: null },
      placement: { shape: "polygon", points: r.ring, anchor: r.anchor },
      interior: { units: "km", perParentUnit: 1 },
      composition: compositionOfPlate({ grid, plate: k }),
      interstitial: null, interstitialUnsurveyed: false,
      compositionTolerance: null, toleranceWhy: null,
      terrainKind: null,
      // One point feature per settlement, in the settlement order the pass
      // produced (which is itself deterministic), so edge endpoints resolve.
      // `type: null` — a settlement is not a landform; Plan B's typed
      // features[] item schema makes the field nullable for exactly this.
      // `attrs` is additionalProperties:false with a CLOSED key set, so the
      // plan's `{ rank, region }` is not a legal attrs object: the rank is
      // `role` and the settlement id is `town`.
      features: mine.map((s) => ({
        id: townFeatureId(townSlug({ settlement: s })),
        kind: "point",
        at: [q(s.atKm[0]), q(s.atKm[1])],
        attrs: { name: s.title ?? null, role: s.rank, town: s.id },
        type: null,
      })),
      bands: [], runtime: null, representsNodeId: null,
      lore: { summary: p.structuralIdea, reported: lm.surveyed === 0 ? true : undefined },
      tags: [], levelBand: [...p.levelBand],
    });
  });

  // The WATER trunk: 3 ocean nodes under n-atlas and 9 sea nodes under their
  // ocean. `n-westsea` is emitted at tier "sea", the first real use of the
  // declared-but-empty tier.
  manifest.oceans.forEach((o) => {
    const r = rings.rings.get(o.id);
    if (!r) { problems.push(`buildTrunk: ocean ${o.id} produced no ring`); return; }
    nodes.push(waterNode({ manifest, generator, id: o.nodeId, tier: "ocean", parentId: "n-atlas",
                           title: o.title, ring: r, streamName: o.id,
                           // An ocean's seas claim ~16% of it, so the rest is
                           // unclaimed water and G-COMP-ROLLUP demands an
                           // interstitial for it.
                           interstitial: { ocean: 100 } }));
  });
  manifest.seas.forEach((s) => {
    const r = rings.seas.get(s.id);
    if (!r) { problems.push(`buildTrunk: sea ${s.id} produced no ring`); return; }
    const parent = manifest.oceans.find((o) => o.id === s.ocean).nodeId;
    nodes.push(waterNode({ manifest, generator, id: s.nodeId, tier: "sea", parentId: parent,
                           title: s.title, ring: r, streamName: s.id, interstitial: null }));
  });
  return { nodes, edges };
}

function waterNode({ manifest, generator, id, tier, parentId, title, ring, streamName, interstitial }) {
  return {
    id, tier, parentId, title,
    provenance: { authored: "generated",
                  generator: { name: generator.name, version: generator.version,
                               fabric: "content/world/fabric/world.json" },
                  source: "content/world/manifest.json" },
    frozen: false,
    seed: { value: namedNodeSeed({ manifest, name: streamName }), epoch: 0, why: null },
    placement: { shape: "polygon", points: ring.ring, anchor: ring.anchor },
    interior: { units: "km", perParentUnit: 1 },
    composition: { ocean: 100 },
    interstitial, interstitialUnsurveyed: false,
    compositionTolerance: null, toleranceWhy: null,
    terrainKind: null, features: [], bands: [], runtime: null, representsNodeId: null,
    lore: { summary: null },
    tags: [], levelBand: null,
  };
}

// A node's own 16-hex seed, minted off the world seed. It is deliberately NOT
// `namedStream` — that minter is reserved for the four names
// content/spine/derived.json commits per node, and it refuses anything else.
// This is the node's own `seed.value`, which G-SEED requires to be 16 hex and
// globally unique; `c01`, `o01`, `s01` are not reserved names.
function namedNodeSeed({ manifest, name }) {
  return mintSeed({ parentStream: manifest.seed, name });
}

// The continent's declared composition is MEASURED off the classified biome
// field, not split evenly across the palette as the plan's `compositionFor`
// does. An even split is a claim the fabric contradicts on its own numbers,
// and n-atlas's composition is the area-weighted rollup of these — so an
// invented one propagates straight into G-ATLAS-ROLLUP's ±2 pp.
export function compositionOfPlate({ grid, plate }) {
  const counts = new Map();
  let total = 0;
  for (let i = 0; i < grid.n; i++) {
    if (grid.plate[i] !== plate || (grid.flags[i] & FLAG.SEA) !== 0) continue;
    const name = grid.biomeNames[grid.biome[i]] ?? BIOMES[grid.biome[i]];
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
    total++;
  }
  if (total === 0) return { ocean: 100 };
  return normaliseComposition(Object.fromEntries(
    [...counts].map(([b, c]) => [b, (c / total) * 100])));
}

/** Round to 0.1, drop anything that rounds to zero, and put the residue on the
 *  largest share so the object sums to EXACTLY 100 (G-COMP-SUM). */
export function normaliseComposition(raw) {
  const rows = Object.entries(raw).filter(([, v]) => v >= 0.05)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  if (rows.length === 0) return { ocean: 100 };
  // Accumulated in TENTHS as integers: summing rounded tenths as floats leaves
  // 100.00000000000001, and G-COMP-SUM compares against 100.
  const tenths = {};
  let sum = 0;
  for (const [b, v] of rows) { const t = Math.round(v * 10); tenths[b] = t; sum += t; }
  const first = rows[0][0];
  tenths[first] += 1000 - sum;
  const out = {};
  for (const b of Object.keys(tenths)) if (tenths[b] > 0) out[b] = tenths[b] / 10;
  return out;
}

// ── writing the draft root ─────────────────────────────────────────────────
//
// THE THREE PRESERVED CHART ANCHORS. `promote-world.mjs` step 2 is a SET
// RECONCILIATION: it deletes every n-atlas descendant absent from the draft.
// Three chart nodes are therefore load-bearing and must be carried forward, or
// promotion silently deletes them and reds a runtime-side gate:
//
//   n-thornveil          <- n-site-thornveil.representsNodeId  (spec X2)
//   n-northern-icefield  <- n-site-icefield.representsNodeId   (spec X2)
//   n-millcross          <- content/towns/town-millcross.json.spineId (spec X4)
//
// scripts/lib/spine.mjs:874-877 pushes a hard G-ALIAS ERROR when a
// representsNodeId target does not resolve, and check_content.mjs:1192 (T1)
// joins the town plan on its spineId. They are NOT found by root membership —
// they are n-atlas descendants, not n-playroot ones — so root membership alone
// deletes them.
//
// They are discovered, not hardcoded: the set is computed by scanning the live
// tree for representsNodeId targets and content/towns/*.json spineId hosts. A
// pinned id list is what PRE_WORLD_ATLAS_CHILDREN was, and this plan exists to
// kill that pattern.
export function preservedChartNodes({ repoRoot, live }) {
  const ids = new Set();
  for (const { doc } of live) if (doc.representsNodeId) ids.add(doc.representsNodeId);
  const townsDir = join(repoRoot, "content/towns");
  if (existsSync(townsDir))
    for (const f of readdirSync(townsDir).filter((x) => x.endsWith(".json"))) {
      const plan = JSON.parse(readFileSync(join(townsDir, f), "utf8"));
      if (plan.spineId) ids.add(plan.spineId);
    }
  return ids;
}

// THE PLAN SAYS THEIR GEOMETRY SURVIVES VERBATIM (:6983). IT CANNOT.
// All three sit in the retired 30 x 38 km cluster-1 frame — n-thornveil's
// anchor is [24.4, 26], n-millcross's [17.2, 23.6] — and in the generated
// 400 x 400 km world every one of those points is open sea: the nearest
// landmass, c07 Driftholt, runs x 16-76 / y 62-122, and c02 Wealdmarch
// x 14-178 / y 86-210. `pointInRing` finds no host, the plan's own code then
// pushes a problem and DROPS the node, and G-ALIAS goes red on two
// representsNodeId targets that no longer resolve.
//
// So they are TRANSLATED, by lineage rather than by geometry: each node's
// nearest continent-tier ancestor in the LIVE tree names a landmass whose node
// id survives generation (n-cluster1 is c02), and the whole subtree moves by
// that continent's own anchor delta. It is the same translation Plan D derives
// PIN_OFFSET from; Plan E's redraw is what re-pins them properly.
export function liveContinentAncestor({ id, liveById }) {
  let cur = liveById.get(id);
  for (let hops = 0; cur && hops < 32; hops++) {
    if (cur.tier === "continent") return cur;
    cur = cur.parentId ? liveById.get(cur.parentId) : null;
  }
  return null;
}

export function translatePlacement({ placement, dx, dy }) {
  const out = { ...placement, anchor: [q(placement.anchor[0] + dx), q(placement.anchor[1] + dy)] };
  if (placement.shape === "polygon")
    out.points = placement.points.map(([x, y]) => [q(x + dx), q(y + dy)]);
  else if (placement.shape === "rect")
    out.rect = { ...placement.rect, x: q(placement.rect.x + dx), y: q(placement.rect.y + dy) };
  else if (placement.shape === "point")
    out.at = [q(placement.at[0] + dx), q(placement.at[1] + dy)];
  return out;
}

const ringOfPlacement = (placement) => {
  if (placement.shape === "polygon") return placement.points;
  if (placement.shape === "rect") {
    const { x, y, w, h } = placement.rect;
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  }
  return [placement.at];
};

// The same containment test G-CONTAIN runs: every vertex AND every edge
// midpoint inside the parent ring, boundary counting as inside.
function insideRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > point[1]) !== (yj > point[1]) &&
        point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function placementInside({ placement, ring }) {
  const pts = ringOfPlacement(placement);
  const samples = [...pts];
  if (pts.length > 1)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], r = pts[(i + 1) % pts.length];
      samples.push([(p[0] + r[0]) / 2, (p[1] + r[1]) / 2]);
    }
  return samples.every((p) => insideRing(p, ring));
}

export function writeRun({ run, outDir, repoRoot, resolved = null, sheets = [] }) {
  const files = [];
  const write = (rel, bytes) => {
    const p = join(outDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, bytes);
    files.push(rel);
  };
  // 1. the authored inputs, copied so the draft root stands alone
  for (const rel of ["content/world/manifest.json", "content/world/budgets.json",
                     "content/spine/roots.json", "content/spine/load-budget.json",
                     "content/spine/coverage-budget.json", "content/spine/sheet.json",
                     "content/spine/sheet-atlas.json"]) {
    if (!existsSync(join(repoRoot, rel))) continue;
    write(rel, readFileSync(join(repoRoot, rel)));
  }
  for (const dir of ["content/schemas", "content/world/premises", "content/world/lexicon"])
    if (existsSync(join(repoRoot, dir)))
      cpSync(join(repoRoot, dir), join(outDir, dir), { recursive: true });

  // 2. the runtime subtree, found by ROOT MEMBERSHIP from roots.json — never by
  //    a pinned id list. Its nodes are not `cp`-ed: they go through
  //    `canonicalNode` with every other node, over the DRAFT tree. "Copied
  //    verbatim" is then a MEASURED consequence (generate-world.test.mjs
  //    compares the draft bytes to the live file byte for byte) rather than an
  //    artefact of the copy, and a canonicaliser that started producing
  //    different bytes for an unchanged node reds that test instead of hiding
  //    behind the copy.
  const liveNodesDir = join(repoRoot, "content/spine/nodes");
  const live = readdirSync(liveNodesDir).filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, doc: JSON.parse(readFileSync(join(liveNodesDir, f), "utf8")) }));
  const roots = JSON.parse(readFileSync(join(repoRoot, "content/spine/roots.json"), "utf8"));
  const kids = new Map();
  for (const { doc } of live) {
    if (!kids.has(doc.parentId)) kids.set(doc.parentId, []);
    kids.get(doc.parentId).push(doc.id);
  }
  const runtimeRoots = roots.filter((r) => r !== "n-atlas");
  const runtimeIds = new Set();
  const stack = [...runtimeRoots];
  while (stack.length) { const id = stack.pop(); runtimeIds.add(id); for (const c of kids.get(id) ?? []) stack.push(c); }

  // 2b. the three preserved chart anchors, RE-PARENTED onto the generated
  //     continent their live lineage names and TRANSLATED by that continent's
  //     anchor delta. Their ids, titles and lore survive verbatim, which is
  //     what the two representsNodeId pointers and the one town-plan spineId
  //     need; their coordinates cannot, because the old ones are open sea now.
  const preserved = preservedChartNodes({ repoRoot, live });
  const liveById = new Map(live.map(({ doc }) => [doc.id, doc]));
  const byGeneratedId = new Map(run.trunk.map((n) => [n.id, n]));
  const carried = [];
  for (const id of [...preserved].sort()) {
    const doc = liveById.get(id);
    if (!doc) continue;                       // already absent upstream: nothing to preserve
    if (runtimeIds.has(id)) continue;         // already copied verbatim above
    const ancestor = liveContinentAncestor({ id, liveById });
    const host = ancestor ? byGeneratedId.get(ancestor.id) : null;
    if (!host) {
      run.problems.push(`preserved chart node ${id}: its live lineage names ` +
        `${ancestor?.id ?? "no continent"}, which the generated trunk does not carry — ` +
        `G-ALIAS or T1 will go red on it`);
      continue;
    }
    const dx = host.placement.anchor[0] - ancestor.placement.anchor[0];
    const dy = host.placement.anchor[1] - ancestor.placement.anchor[1];
    const placement = translatePlacement({ placement: doc.placement, dx, dy });
    if (!placementInside({ placement, ring: host.placement.points }))
      run.problems.push(`preserved chart node ${id}: translated by [${q(dx)}, ${q(dy)}] onto ` +
        `${host.id} and still not inside its ring — G-CONTAIN will red it; Plan E's redraw must re-pin it`);
    // `derived` and `absoluteAnchor` are DROPPED, not overwritten: the sidecar
    // is regenerated for the whole draft tree, and G-FROZEN is directional —
    // an unfrozen node still carrying absoluteAnchor fails too.
    const { derived: _d, absoluteAnchor: _a, ...rest } = doc;
    carried.push({ ...rest, parentId: host.id, frozen: false, placement,
                   interior: { units: doc.interior?.units ?? "km",
                               perParentUnit: doc.interior?.perParentUnit ?? 1,
                               ...(doc.interior?.anchorInInterior !== undefined
                                 ? { anchorInInterior: doc.interior.anchorInInterior } : {}) } });
  }

  // 3. n-atlas, carried over with its frozen frame intact
  const atlas = JSON.parse(readFileSync(join(liveNodesDir, "n-atlas.json"), "utf8"));
  delete atlas.derived;
  atlas.interstitial = { ocean: 100 };
  atlas.interstitialUnsurveyed = false;

  // 4. the generated trunk + the carried anchors
  const generated = [...run.trunk, ...carried];
  // A generated continent id colliding with a runtime or carried id would
  // silently overwrite it. Loud, not silent — and the carried anchors are IN
  // the set, which the plan's guard (which walks only `generated`) misses.
  const seenIds = new Set();
  for (const n of [atlas, ...generated]) {
    if (seenIds.has(n.id) || runtimeIds.has(n.id))
      throw new Error(`generate-world: node id collision on "${n.id}" — a generated node collides ` +
        `with a runtime, preserved or generated node already in the draft`);
    seenIds.add(n.id);
  }
  const runtimeDocs = [...runtimeIds].sort()
    .map((id) => JSON.parse(readFileSync(join(liveNodesDir, `${id}.json`), "utf8")));
  // n-atlas's composition is the AREA-WEIGHTED ROLLUP of its children plus the
  // interstitial, computed here rather than invented: G-COMP-ROLLUP holds it
  // to ±3 pp per key and G-ATLAS-ROLLUP to ±2 pp, so a made-up {ocean, rock,
  // ice} triple reds both the moment the generated continents carry real
  // biome shares.
  atlas.composition = atlasComposition({ atlas, children: generated.filter((n) => n.parentId === "n-atlas") });

  // A continent that received a carried chart anchor now HAS children, so its
  // unclaimed share is > 0.5% and G-COMP-ROLLUP requires an interstitial for
  // it — measured: n-cluster1 came back "unclaimed 98.5% but no interstitial"
  // plus four per-key deltas. The interstitial is the continent's own
  // composition, which is what the unclaimed 98.5% of it is made of.
  const adopted = new Set(carried.map((n) => n.parentId));
  for (const n of run.trunk) if (adopted.has(n.id)) n.interstitial = { ...n.composition };

  const allNodes = [atlas, ...generated, ...runtimeDocs];
  const tree = buildTree({ nodes: allNodes.map((n) => ({ ...n, file: `${n.id}.json` })), rootIds: roots });
  if (tree.errors.length) throw new Error(`generate-world: draft tree is invalid: ${tree.errors.join("; ")}`);
  for (const node of allNodes) {
    const r = canonicalNode({ node: { ...node, file: `${node.id}.json` }, tree, plans: [] });
    if (r.error) throw new Error(`generate-world: ${r.error}`);
    write(`content/spine/nodes/${node.id}.json`, r.bytes);
  }
  // The derived sidecar is a GATED OUTPUT (G-DERIVED-DRIFT), written from the
  // SAME tree the nodes were written from, by the emitter's own producer.
  write("content/spine/derived.json", derivedSidecar({ tree, plans: [] }));

  // 5. edges: every AUTHORED edge is carried over, generated edges appended.
  //
  // Filtering by `runtimeIds.has(e.from?.node)` — an earlier draft's rule —
  // keeps NOTHING: measured against the live file, zero of the 20 committed
  // edges touches an n-playroot descendant. The 7 canon `leg` edges, 8 `road`
  // edges, 2 `relay` edges and 3 `sealane` edges are all hand-authored canon
  // between chart nodes and features, and `run.edges` is empty (the generator
  // authors no edges), so that rule promotes an EMPTY edges.json: G-NET,
  // G-CANON-LEG and Plan E Task 6 Step 6's leg re-fit all lose their subject at
  // once. Two of the three endpoint SHAPES are not `{node}` at all —
  // `{feature: "f-tower-01"}` and `{edge: "e-coastal-spur", atIndex: 2}` —
  // which is the class of bug PRE_WORLD_SEALANE_ID existed to paper over.
  //
  // So: carry them all. An edge whose `{node}` endpoint the redraw deleted is
  // re-pointed at the continent's `f-town-<slug>` feature by Plan E Task 6
  // Step 6, and `dangling` below turns "the endpoint vanished and nobody
  // re-pointed it" into a NAMED problem instead of a silent drop.
  const liveEdges = JSON.parse(readFileSync(join(repoRoot, "content/spine/edges.json"), "utf8"));
  const allEdges = [...liveEdges, ...run.edges];
  run.edgeWorkOrder = edgeWorkOrder({ edges: allEdges, nodes: allNodes });
  for (const w of run.edgeWorkOrder)
    run.problems.push(`edge ${w.edge} (${w.kind}): ${w.why} — ` +
      `re-point it at the owning continent's f-town-<slug> feature`);
  write("content/spine/edges.json", canonStringify([...liveEdges, ...run.edges]) + "\n");

  // 6. the fabric, the world file and the handle ledgers
  run.fabric.forEach((f) => write(`content/world/fabric/continent-${f.continent.slice(1)}.json`, fabricStringify(f) + "\n"));
  write("content/world/fabric/world.json", fabricStringify(run.world) + "\n");
  run.handles.forEach((h) => write(`content/world/handles/continent-${h.continent.slice(1)}.json`, fabricStringify(h) + "\n"));

  // 7. the baseline: the LIVE polygons, copied at run start, so the overlay
  //    sheet works in a dirty worktree without reading git.
  cpSync(join(repoRoot, "content/spine/nodes"), join(outDir, "baseline/spine/nodes"), { recursive: true });

  // 7b. the DRAWINGS. Spec §7.4 lists seven things in a draft folder and the
  //     two easiest to skip are the two a human actually reviews. SVG only
  //     (--no-png discipline): a raster in the review loop is 18 s and 8 MB
  //     per sheet. The `fabric` and `overlay` sheets are TASK 13's — they are
  //     not in render-sheet.mjs's SHEETS registry yet, so `sheets` is empty
  //     today and this loop writes nothing. The plumbing is here so Task 13 is
  //     a registry entry, not a CLI change.
  const tSheets = Date.now();
  for (const sheet of sheets) {
    const built = sheet.build({ repoRoot: outDir });
    write(`sheets/${sheet.id}.svg`, built.svg);
    for (const p of built.problems ?? []) run.problems.push(`sheet ${sheet.id}: ${p}`);
  }
  run.timings.sheets = Date.now() - tSheets;   // read by the CLI's loop-budget check

  // 7c. the civil join, when a civil layer was supplied. Plan C runs with an
  //     empty civil layer, so this is absent; Plan D's promote path supplies
  //     it and the file becomes the third diffable artifact.
  if (resolved) write("civil-resolved.json", canonStringify(resolved) + "\n");

  // 8. the run manifest, with a sha256 per written file — INCLUDING the sheets
  //    and civil-resolved.json, so promote-world step 1's hash verification
  //    covers the drawings and the join, not only the data.
  const hashes = {};
  for (const rel of files.slice().sort()) hashes[rel] = hashOf(readFileSync(join(outDir, rel)));
  const manifest = { ...run.runManifest, hashes, timings: run.timings,
                     problems: run.problems, substitutions: run.substitutions, coverage: run.coverage };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(join(outDir, "report.md"), renderReport({ run }));
  return { files };
}

/**
 * WHY THE DRAFT ROOT IS NOT G-NET CLEAN, ENUMERATED RATHER THAN HAND-WAVED.
 *
 * The plan asks for two things that cannot both be true: "every authored edge
 * survives into the draft" (Step 1) and "the REAL spine gate is green on the
 * draft root — 0 failures" (Step 1). Measured against the live file, ALL 20
 * committed edges point at cluster-1 chart nodes and features the 36-file trunk
 * census deletes — n-gildmark, n-embervale, n-norhollow, n-rooktide,
 * n-cindervast-town, n-expedition-camp and the 27 f-tower-* relay features —
 * so an edges.json filtered to what resolves is EMPTY, which is the exact
 * failure the plan spends a paragraph forbidding: G-NET, G-CANON-LEG and Plan E
 * Task 6 Step 6's leg re-fit all lose their subject at once.
 *
 * So the edges are carried WHOLE and every consequence is named here, one work
 * order per unresolved endpoint, in the same shape and the same order the gate
 * reports them. `generate-world.test.mjs` holds the two together: the draft
 * root's gate failures must be EXACTLY this list and nothing else.
 */
export function edgeWorkOrder({ edges, nodes }) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const featOwner = new Map();
  for (const n of nodes) for (const f of n.features ?? []) featOwner.set(f.id, n);
  const edgeIds = new Set(edges.map((e) => e.id));
  const out = [];
  for (const e of edges) {
    for (const ref of [e.from, e.to, ...(e.via ?? [])]) {
      if (!ref) continue;
      if (ref.node !== undefined && !nodeById.has(ref.node))
        out.push({ edge: e.id, kind: e.kind, ref: `node ${ref.node}`,
                   why: `endpoint node "${ref.node}" does not survive the redraw` });
      else if (ref.feature !== undefined && !featOwner.has(ref.feature))
        out.push({ edge: e.id, kind: e.kind, ref: `feature ${ref.feature}`,
                   why: `endpoint feature "${ref.feature}" does not survive the redraw` });
      else if (ref.edge !== undefined && !edgeIds.has(ref.edge))
        out.push({ edge: e.id, kind: e.kind, ref: `edge ${ref.edge}`,
                   why: `endpoint edge "${ref.edge}" does not survive the redraw` });
    }
    // G-NET's road-end proximity rule: a road's first and last point must sit
    // within 1 root unit of its endpoint's composed anchor. It fires on the
    // three roads that start at n-millcross, because n-millcross is TRANSLATED
    // into the generated world while the authored road points are still in the
    // retired cluster-1 frame. Composed anchor == own anchor here: every node
    // in the draft carries `interior.perParentUnit: 1` on the chain a road
    // endpoint resolves through, which is asserted rather than assumed.
    if (e.kind === "road" && e.points?.length) {
      const tips = [e.points[0], e.points[e.points.length - 1]];
      [e.from, e.to].forEach((ref, i) => {
        const n = ref?.node && nodeById.get(ref.node);
        if (!n) return;
        const chainIsIdentity = (() => {
          let cur = n.parentId && nodeById.get(n.parentId);
          for (let hops = 0; cur && hops < 32; hops++) {
            if ((cur.interior?.perParentUnit ?? 1) !== 1) return false;
            cur = cur.parentId ? nodeById.get(cur.parentId) : null;
          }
          return true;
        })();
        if (!chainIsIdentity) return;
        const dx = tips[i][0] - n.placement.anchor[0], dy = tips[i][1] - n.placement.anchor[1];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1)
          out.push({ edge: e.id, kind: e.kind, ref: `road-end ${n.id}`,
                     why: `road end [${tips[i].join(", ")}] is ${d.toFixed(2)} from endpoint ${n.id}, ` +
                          `which the redraw moved` });
      });
    }
    // G-CANON-LEG: a leg endpoint that DOES resolve must be frozen, and every
    // node this generator writes is unfrozen — n-millcross included, because
    // G-FROZEN refuses a frozen node under an unfrozen parent and its parent is
    // now a generated continent.
    if (e.kind === "leg")
      for (const ref of [e.from, e.to]) {
        const n = ref?.node && nodeById.get(ref.node);
        if (n && !n.frozen)
          out.push({ edge: e.id, kind: e.kind, ref: `node ${n.id}`,
                     why: `canon-leg endpoint ${n.id} is not frozen in the draft` });
      }
  }
  return out;
}

export function atlasComposition({ atlas, children }) {
  const A = placementArea({ placement: atlas.placement });
  const derived = {};
  let claimed = 0;
  for (const c of children) {
    const share = placementArea({ placement: c.placement }) / A;
    claimed += share;
    for (const [b, v] of Object.entries(c.composition ?? {})) derived[b] = (derived[b] ?? 0) + share * v;
  }
  const U = 1 - claimed;
  if (U > 0)
    for (const [b, v] of Object.entries(atlas.interstitial ?? {})) derived[b] = (derived[b] ?? 0) + U * v;
  return normaliseComposition(derived);
}

function renderReport({ run }) {
  const lines = [
    `# mapforge run ${run.runManifest.seed} / ${run.runManifest.version}`, "",
    `sea level ${run.runManifest.seaLevel} at rank ${run.runManifest.rank}`,
    `net land ${run.runManifest.landKm2} km2 · water ${run.runManifest.waterKm2} km2 · ratio ${run.runManifest.seaToLandRatio}`,
    `interstitial ${run.runManifest.interstitialKm2} km2 · corridors ${run.runManifest.corridors.map((c) => `${c.continent}(${c.cells})`).join(" ") || "none"}`,
    `landform types placed: ${run.coverage.placed} / ${run.coverage.total}`, "",
    "| continent | gross land km2 | regions | settlements | instances |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...run.fabric.map((f) => `| ${f.continent} | ${((f.cellCensus.land + f.cellCensus.lake) * 0.25).toFixed(1)} | ${f.regions.length} | ${f.settlements.length} | ${f.instances.length} |`),
    "", "## stage timings", "",
    ...Object.entries(run.timings).map(([k, v]) => `- ${k}: ${v} ms`),
  ];
  if (run.problems.length) lines.push("", "## problems", "", ...run.problems.map((p) => `- ${p}`));
  if (run.substitutions.length) lines.push("", "## landform substitutions", "",
    ...run.substitutions.map((s) => `- ${s.wanted} -> ${s.used ?? "(absent)"}: ${s.why}`));
  return lines.join("\n") + "\n";
}

// ── CLI ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { seed: null, outDir: null, png: true, stageReport: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed") opts.seed = argv[++i];
    else if (a === "--out") opts.outDir = resolve(argv[++i]);
    else if (a === "--no-png") opts.png = false;
    else if (a === "--stage-report") opts.stageReport = true;
    else { console.error(`generate-world: unknown arg ${a}`); process.exit(2); }
  }
  return opts;
}

// async because the draft sheets are imported lazily: render-sheet.mjs imports
// the sheet builders, which import scripts/lib/places.mjs, which reads a
// content root — importing it eagerly at module load would read the LIVE root
// before the draft exists.
async function main() {
  const opts = parseArgs(process.argv);
  const manifest = readJson(join(REPO_ROOT, "content/world/manifest.json"));
  if (opts.seed && opts.seed !== manifest.seed) manifest.seed = opts.seed;
  const premises = readdirSync(join(REPO_ROOT, "content/world/premises"))
    .filter((f) => f.endsWith(".json")).sort()
    .map((f) => readJson(join(REPO_ROOT, "content/world/premises", f)));
  const lexicon = readJson(join(REPO_ROOT, "content/world/lexicon/landforms.json"));
  const loadBudget = readJson(join(REPO_ROOT, "content/spine/load-budget.json"));
  const outDir = opts.outDir ?? join(REPO_ROOT, "build/mapforge",
    runIdOf({ seed: manifest.seed, version: GENERATOR_VERSION }));

  // The loop budget is a committed table, not a constant here — one authority
  // for the generator, the sheet build and the join (content/world/budgets.json).
  const budgets = readJson(join(REPO_ROOT, "content/world/budgets.json"));
  const loopRow = (stage) => budgets.loop.find((r) => r.stage === stage);

  const run = runPasses({ manifest, premises, lexicon, loadBudget,
    onStage: opts.stageReport ? (name, label, ms) => console.log(`stage: ${name} ${label} ${ms} ms`) : undefined });

  const { SHEETS } = await import(pathToFileURL(join(REPO_ROOT, "tools/mapforge/render-sheet.mjs")).href);
  const draftSheets = ["fabric", "overlay"].filter((id) => SHEETS[id])
    .map((id) => ({ id, build: SHEETS[id].build }));
  const { files } = writeRun({ run, outDir, repoRoot: REPO_ROOT, sheets: draftSheets });

  // Per-stage budgets with fail thresholds — goal G4's measure is explicitly
  // NOT one aggregate number, because an aggregate hides which stage regressed
  // and the loop silently drifts to minutes. The `generate` row covers every
  // pass; the `sheets` row covers the draft drawings written just above.
  const gen = loopRow("generate"), sheetRow = loopRow("sheets");
  const sheetMs = run.timings.sheets ?? 0;
  console.log(`stage: generate TOTAL ${run.timings.total} ms (budget ${gen.budgetMs}, fail ${gen.failMs})`);
  console.log(`stage: sheets ${sheetMs} ms (budget ${sheetRow.budgetMs}, fail ${sheetRow.failMs})`);
  const over = [];
  if (run.timings.total > gen.failMs) over.push(`generate ${run.timings.total} ms > fail ${gen.failMs} ms`);
  if (sheetMs > sheetRow.failMs) over.push(`sheets ${sheetMs} ms > fail ${sheetRow.failMs} ms`);

  console.log(`generate-world: wrote ${files.length} files to ${outDir}`);
  console.log(`generate-world: ratio ${run.runManifest.seaToLandRatio} (land ${run.runManifest.landKm2} km2)`);
  for (const p of run.problems) console.log(`generate-world: PROBLEM ${p}`);
  if (over.length) {
    for (const o of over) console.error(`generate-world: LOOP BUDGET ${o}`);
    process.exitCode = 1;
    return;
  }
  console.log("generate-world: OK");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
