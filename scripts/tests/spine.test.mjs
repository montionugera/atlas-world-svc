import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIER_DEPTH, LEAF_TIERS, BIOMES, TERRAIN_KINDS, TERRAIN_IMPLIES,
  SPINE_CELL_KM, SPINE_CELL_U, KM_TO_U, ID_RE, SEED_RE,
  shoelaceArea, polygonBBox, pointInPolygon, selfIntersects,
  placementArea, gridIntersectionArea, gridUnionArea,
  townFrameErrors, townCompDerived, townCompErrors, terrainKindErrors,
  DEPTH_EXCEPTIONS, depthLegal,
} from "../lib/spine.mjs";

// ── constants ──────────────────────────────────────────────────────────────
test("TIER_DEPTH is the pinned depth table", () => {
  assert.deepEqual(TIER_DEPTH, {
    world: 0, playroot: 0,
    continent: 1, ocean: 1, playspace: 1, fixture: 1,
    region: 2, sea: 2,
    town: 3, site: 3,
  });
});

test("G-DEPTH: playspace -> site is the one legal exception pair (runtime tree has no depth-2 tier)", () => {
  assert.equal(depthLegal({ parentTier: "playspace", childTier: "site" }), true);
  assert.equal(DEPTH_EXCEPTIONS.has("playspace>site"), true);
  // the normal rule still holds everywhere else
  assert.equal(depthLegal({ parentTier: "continent", childTier: "region" }), true);
  assert.equal(depthLegal({ parentTier: "continent", childTier: "town" }), false); // depth skip stays illegal
  assert.equal(depthLegal({ parentTier: "playspace", childTier: "town" }), false); // exception is exactly one pair
});

test("LEAF_TIERS, BIOMES, TERRAIN_KINDS, TERRAIN_IMPLIES are the pinned enums", () => {
  assert.deepEqual([...LEAF_TIERS].sort(), ["fixture", "site", "town"]);
  assert.deepEqual(BIOMES, ["ocean", "ice", "marsh", "river", "meadow", "forest",
    "bramble", "rock", "upland", "alkali", "ash", "built"]);
  assert.deepEqual(TERRAIN_KINDS, ["ice", "upland", "alkali-flat", "rim",
    "bramble", "headland", "river-country"]);
  assert.deepEqual(TERRAIN_IMPLIES, {
    ice: ["ice"], upland: ["upland"], "alkali-flat": ["alkali"], rim: ["rock"],
    bramble: ["bramble"], headland: ["rock", "meadow"], "river-country": ["river", "meadow"],
  });
  assert.equal(SPINE_CELL_KM, 0.25);
  assert.equal(SPINE_CELL_U, 1.0);
  assert.equal(KM_TO_U, 100);
});

test("ID_RE and SEED_RE accept/reject the documented shapes", () => {
  assert.ok(ID_RE.test("n-atlas"));
  assert.ok(ID_RE.test("n-millcross-ford"));
  assert.ok(!ID_RE.test("n-Atlas"));       // case-sensitive keyspace
  assert.ok(!ID_RE.test("millcross"));     // must be n- prefixed
  assert.ok(!ID_RE.test("n-"));
  assert.ok(SEED_RE.test("9f2c4a1b77de0351"));
  assert.ok(!SEED_RE.test("9F2C4A1B77DE0351")); // lowercase only
  assert.ok(!SEED_RE.test("9f2c4a1b77de035"));  // 15 chars
});

// ── geometry ───────────────────────────────────────────────────────────────
test("shoelaceArea is SIGNED: positive one way, negative reversed, abs() nowhere", () => {
  const tri = [[0, 0], [4, 0], [0, 4]];
  assert.equal(shoelaceArea({ points: tri }), 8);
  assert.equal(shoelaceArea({ points: [...tri].reverse() }), -8);
});

test("polygonBBox returns min-corner + dims", () => {
  assert.deepEqual(
    polygonBBox({ points: [[8, 4], [142, 4], [148, 120], [120, 186], [30, 186], [6, 110]] }),
    { x: 6, y: 4, w: 142, h: 182 },
  );
});

test("pointInPolygon: inside true, outside false", () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(pointInPolygon({ point: [5, 5], points: sq }), true);
  assert.equal(pointInPolygon({ point: [15, 5], points: sq }), false);
});

test("selfIntersects: bowtie true, square false", () => {
  assert.equal(selfIntersects({ points: [[0, 0], [4, 4], [4, 0], [0, 4]] }), true);
  assert.equal(selfIntersects({ points: [[0, 0], [4, 0], [4, 4], [0, 4]] }), false);
});

test("placementArea: polygon signed shoelace, rect w*h, point 0", () => {
  assert.equal(placementArea({ placement: { shape: "polygon", points: [[0, 0], [4, 0], [0, 4]] } }), 8);
  assert.equal(placementArea({ placement: { shape: "rect", rect: { x: 1, y: 1, w: 3, h: 5 } } }), 15);
  assert.equal(placementArea({ placement: { shape: "point", at: [2, 2] } }), 0);
});

test("gridIntersectionArea / gridUnionArea are exact on cell-aligned rects", () => {
  const a = { shape: "rect", rect: { x: 0, y: 0, w: 4, h: 4 } };
  const b = { shape: "rect", rect: { x: 2, y: 0, w: 4, h: 4 } };
  assert.equal(gridIntersectionArea({ a, b, cell: 1.0 }), 8);
  assert.equal(gridUnionArea({ placements: [a, b], cell: 1.0 }), 24);
  const far = { shape: "rect", rect: { x: 100, y: 100, w: 2, h: 2 } };
  assert.equal(gridIntersectionArea({ a, b: far, cell: 1.0 }), 0);
});

// F-043 perf fix: gSpineOverlapRollup's double-count check replaces the
// O(area) gridUnionArea() scan with a running Σ of the pairwise
// gridIntersectionArea() values it already computes in the sibling loop.
// By inclusion-exclusion, Σareas − union = Σpairwise − Σtriple + …, so this
// is exact whenever no three placements overlap at a shared point (the case
// pinned here) and only ever OVER-reports otherwise — never masks a real
// double-count. This test pins that equivalence directly against the
// exported grid helpers, independent of the rollup function itself.
test("pairwise Σ(gridIntersectionArea) equals Σareas − gridUnionArea when no triple overlap", () => {
  const cell = 1.0;
  const a = { shape: "rect", rect: { x: 0, y: 0, w: 4, h: 4 } }; // area 16
  const b = { shape: "rect", rect: { x: 2, y: 0, w: 4, h: 4 } }; // area 16, a∩b = 8
  const c = { shape: "rect", rect: { x: 4, y: 0, w: 4, h: 4 } }; // area 16, b∩c = 8, a∩c = 0 (touch only)
  const kids = [a, b, c];
  let pairSum = 0;
  for (let i = 0; i < kids.length; i++)
    for (let j = i + 1; j < kids.length; j++)
      pairSum += gridIntersectionArea({ a: kids[i], b: kids[j], cell });
  const sum = kids.reduce((s, k) => s + placementArea({ placement: k }), 0);
  const union = gridUnionArea({ placements: kids, cell });
  assert.equal(pairSum, 16); // a∩b=8 + b∩c=8 + a∩c=0
  assert.equal(sum - union, 16);
  assert.equal(pairSum, sum - union);
});

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSpine, buildTree, ancestorChain, subtreeIds, flattenSpawnAreas, checkRuntime, LIVE_MAP_IDS, BOUNDARY_THICKNESS_U, MOB_RADIUS_U, checkSpawnFit, checkSpawnIdStable, checkPlayspaceAliases, TRUNK_TIERS, checkSpineComplete, parseRuntimeSpawnRects, spawnGeometryReportLines, renderFrontierFile, FRONTIER_DOC, frontierSiteIds } from "../lib/spine.mjs";

function tinyNode(id, tier, parentId, seedValue) {
  return {
    id, tier, parentId, title: id,
    seed: { value: seedValue, epoch: 0, why: null },
    placement: { shape: "rect", rect: { x: 0, y: 0, w: 10, h: 10 }, anchor: [5, 5] },
    composition: { meadow: 100 },
  };
}

function writeSpineRoot({ nodes, roots }) {
  const dir = mkdtempSync(join(tmpdir(), "spine-lib-"));
  mkdirSync(join(dir, "spine", "nodes"), { recursive: true });
  writeFileSync(join(dir, "spine", "roots.json"), JSON.stringify(roots, null, 2) + "\n");
  for (const n of nodes)
    writeFileSync(join(dir, "spine", "nodes", `${n.id}.json`), JSON.stringify(n, null, 2) + "\n");
  return dir;
}

test("loadSpine: present:false on a root with no spine/ dir", () => {
  const dir = mkdtempSync(join(tmpdir(), "spine-lib-"));
  const spine = loadSpine({ contentRoot: dir });
  assert.equal(spine.present, false);
  assert.deepEqual(spine.errors, []);
});

test("loadSpine: loads nodes sorted, retains file, reports parse errors in-band", () => {
  const dir = writeSpineRoot({
    nodes: [tinyNode("n-b", "world", null, "00000000000000b1"), tinyNode("n-a", "world", null, "00000000000000a1")],
    roots: ["n-a", "n-b"],
  });
  writeFileSync(join(dir, "spine", "nodes", "n-broken.json"), "{ not json");
  const spine = loadSpine({ contentRoot: dir });
  assert.equal(spine.present, true);
  assert.deepEqual(spine.nodes.map((n) => n.file), ["n-a.json", "n-b.json"]); // sorted, broken skipped
  assert.deepEqual(spine.roots, ["n-a", "n-b"]);
  assert.equal(spine.errors.length, 1);
  assert.match(spine.errors[0], /n-broken\.json/);
  assert.equal(spine.budgets.load, null);   // missing budget files are null, not errors (G-LOAD-BUDGET is Phase 1)
  assert.equal(spine.budgets.coverage, null);
});

test("buildTree: happy path — depths, sorted children", () => {
  const nodes = [
    tinyNode("n-root", "world", null, "0000000000000001"),
    tinyNode("n-zeta", "continent", "n-root", "0000000000000002"),
    tinyNode("n-alpha", "continent", "n-root", "0000000000000003"),
    tinyNode("n-deep", "region", "n-alpha", "0000000000000004"),
  ];
  const tree = buildTree({ nodes, rootIds: ["n-root"] });
  assert.deepEqual(tree.errors, []);
  assert.equal(tree.depthOf.get("n-deep"), 2);
  assert.deepEqual(tree.childrenOf.get("n-root"), ["n-alpha", "n-zeta"]); // sorted-id order
});

test("buildTree: dangling parent, cycle, root-not-listed all reported", () => {
  const nodes = [
    tinyNode("n-root", "world", null, "0000000000000005"),
    tinyNode("n-lost", "continent", "n-ghost", "0000000000000006"),
    tinyNode("n-loop-a", "continent", "n-loop-b", "0000000000000007"),
    tinyNode("n-loop-b", "continent", "n-loop-a", "0000000000000008"),
    tinyNode("n-rogue", "world", null, "0000000000000009"),
  ];
  const tree = buildTree({ nodes, rootIds: ["n-root"] });
  assert.ok(tree.errors.some((e) => /dangling parentId: n-lost/.test(e)), tree.errors.join("\n"));
  assert.ok(tree.errors.some((e) => /cycle detected/.test(e)), tree.errors.join("\n"));
  assert.ok(tree.errors.some((e) => /^root n-rogue is not listed in roots\.json$/.test(e)), tree.errors.join("\n"));
  assert.ok(tree.errors.some((e) => /unreachable/.test(e)), tree.errors.join("\n"));
});

test("ancestorChain (self first, root last) and subtreeIds (DFS preorder, sorted)", () => {
  const nodes = [
    tinyNode("n-root", "world", null, "000000000000000a"),
    tinyNode("n-mid", "continent", "n-root", "000000000000000b"),
    tinyNode("n-leafb", "region", "n-mid", "000000000000000c"),
    tinyNode("n-leafa", "region", "n-mid", "000000000000000d"),
  ];
  const tree = buildTree({ nodes, rootIds: ["n-root"] });
  assert.deepEqual(ancestorChain({ tree, id: "n-leafa" }), ["n-leafa", "n-mid", "n-root"]);
  assert.deepEqual(subtreeIds({ tree, id: "n-root" }), ["n-root", "n-mid", "n-leafa", "n-leafb"]);
});

import { composeToRoot, resolveToRoot, deriveInterior, rollupComposition, deriveNode } from "../lib/spine.mjs";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

function fictionTree() {
  // world → region(per=1, same km grid) → town(per=100, rebased) — the
  // Millcross numbers from HANDOFF.md (HC-4 fixed input).
  const nodes = [
    {
      id: "n-root", tier: "world", parentId: null, title: "root",
      seed: { value: "00000000000000e1", epoch: 0, why: null },
      placement: { shape: "rect", rect: { x: 0, y: 0, w: 2000, h: 2000 }, anchor: [1000, 1000] },
      interior: { units: "km", perParentUnit: 1, size: [2000, 2000], originInParent: [0, 0] },
      composition: { ocean: 100 },
    },
    {
      id: "n-zone", tier: "continent", parentId: "n-root", title: "zone",
      seed: { value: "00000000000000e2", epoch: 0, why: null },
      placement: { shape: "polygon", points: [[72, 106], [100, 106], [100, 132], [84, 138], [72, 136]], anchor: [86, 118] },
      interior: { units: "km", perParentUnit: 1, size: [28, 32], originInParent: [72, 106] },
      composition: { river: 46, meadow: 32, built: 12, marsh: 10 },
    },
    {
      id: "n-town", tier: "region", parentId: "n-zone", title: "town",
      seed: { value: "00000000000000e3", epoch: 0, why: null },
      placement: { shape: "rect", rect: { x: 84.9, y: 117.2, w: 2.2, h: 1.6 }, anchor: [86, 118] },
      interior: { units: "u", perParentUnit: 100, size: [220, 160], originInParent: [84.9, 117.2], anchorInInterior: [110, 80] },
      composition: { built: 28, river: 9, meadow: 63 },
    },
  ];
  return buildTree({ nodes, rootIds: ["n-root"] });
}

test("composeToRoot: per=1 frames are identity; the town frame rebases at 1/100", () => {
  const tree = fictionTree();
  const zone = composeToRoot({ tree, id: "n-zone" });
  assert.deepEqual(zone.origin, [0, 0]);
  assert.equal(zone.scale, 1);
  const town = composeToRoot({ tree, id: "n-town" });
  close(town.origin[0], 84.9, "town origin x");
  close(town.origin[1], 117.2, "town origin y");
  close(town.scale, 0.01, "town scale");
});

test("resolveToRoot: the ford at town-local [110,80] resolves to km [86,118] (HC-4)", () => {
  const tree = fictionTree();
  const p = resolveToRoot({ tree, id: "n-town", point: [110, 80] });
  close(p[0], 86, "ford x");
  close(p[1], 118, "ford y");
});

test("deriveInterior normal arrow: size/originInParent from bbox(placement)", () => {
  const node = {
    tier: "continent",
    placement: { shape: "polygon", points: [[8, 4], [142, 4], [148, 120], [120, 186], [30, 186], [6, 110]], anchor: [75, 95] },
    interior: { units: "km", perParentUnit: 1 },
  };
  const d = deriveInterior({ node, plan: null });
  assert.deepEqual(d.originInParent, [6, 4]);
  assert.deepEqual(d.size, [142, 182]);
});

test("deriveInterior town arrow REVERSED: plan extent is authority, anchor is the CENTRE-of-interest (HC-4)", () => {
  const node = {
    tier: "town",
    interior: { units: "u", perParentUnit: 100, anchorInInterior: [110, 80] },
  };
  const plan = { extent: { width: 220, height: 160 }, anchor: { geographyAt: [86, 118] } };
  const d = deriveInterior({ node, plan });
  assert.deepEqual(d.size, [220, 160]);
  close(d.originInParent[0], 84.9, "town origin x"); // 86 - 110/100 — NOT 86 (corner ≠ centre)
  close(d.originInParent[1], 117.2, "town origin y");
  assert.equal(d.placement.shape, "rect");
  close(d.placement.rect.w, 2.2, "rect w");
  close(d.placement.rect.h, 1.6, "rect h");
  assert.deepEqual(d.placement.anchor, [86, 118]);
});

test("rollupComposition: shares, U-weighted interstitial, verdicts", () => {
  const mk = (id, tier, parentId, seedTail, placement, composition, extra = {}) => ({
    id, tier, parentId, title: id,
    seed: { value: `000000000000${seedTail}`, epoch: 0, why: null },
    placement, composition, ...extra,
  });
  // parent 10×10, child rect 40 u² → share 0.4, U 0.6
  const parent = mk("n-p", "world", null, "00f1",
    { shape: "rect", rect: { x: 0, y: 0, w: 10, h: 10 }, anchor: [5, 5] },
    { meadow: 60, forest: 40 },
    { interstitial: { meadow: 100 }, interstitialUnsurveyed: false });
  const child = mk("n-c", "continent", "n-p", "00f2",
    { shape: "rect", rect: { x: 0, y: 0, w: 8, h: 5 }, anchor: [4, 2] },
    { forest: 100 });
  const pointChild = mk("n-pt", "continent", "n-p", "00f3",
    { shape: "point", at: [9, 9], anchor: [9, 9] },
    { built: 100 });
  const tree = buildTree({ nodes: [parent, child, pointChild], rootIds: ["n-p"] });
  const r = rollupComposition({ tree, id: "n-p" });
  close(r.coveragePct, 40, "coverage");           // point child contributes ZERO area
  close(r.unclaimedPct, 60, "unclaimed");
  close(r.derived.forest, 40, "derived forest");  // 0.4 × 100
  close(r.derived.meadow, 60, "derived meadow");  // 0.6 × 100 interstitial
  close(r.l1, 0, "l1");
  assert.equal(r.verdict, "ASSERTED");            // coverage 40% < 60
  // verdict CHECKED at coverage ≥ 60
  const bigChild = mk("n-big", "continent", "n-p", "00f4",
    { shape: "rect", rect: { x: 0, y: 5, w: 10, h: 5 }, anchor: [5, 7] }, { meadow: 100 });
  const tree2 = buildTree({ nodes: [parent, child, bigChild], rootIds: ["n-p"] });
  assert.equal(rollupComposition({ tree: tree2, id: "n-p" }).verdict, "CHECKED"); // 90%
  // verdict UNCHECKED under interstitialUnsurveyed
  const unsurveyed = { ...parent, interstitial: null, interstitialUnsurveyed: true };
  const tree3 = buildTree({ nodes: [unsurveyed, child], rootIds: ["n-p"] });
  assert.equal(rollupComposition({ tree: tree3, id: "n-p" }).verdict, "UNCHECKED");
});

test("deriveNode: emits the full derived block with a stable digest", () => {
  const tree = fictionTree();
  const d1 = deriveNode({ tree, id: "n-zone", plans: [] });
  const d2 = deriveNode({ tree, id: "n-zone", plans: [] });
  assert.deepEqual(d1, d2); // deterministic
  for (const k of ["areaParentUnits2", "childAreaParentUnits2", "coveragePct", "unclaimedPct",
    "computedComposition", "rollupVerdict", "absoluteAnchorRoot", "resolvedSeedStreams", "digest"])
    assert.ok(k in d1, `missing derived.${k}`);
  assert.deepEqual(d1.absoluteAnchorRoot, [86, 118]); // per=1 chain: anchor already in root km
  assert.match(d1.digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(d1.resolvedSeedStreams.terrain, /^[0-9a-f]{16}$/);
});

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { streamSeed, reroll } from "../lib/spine.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("streamSeed: 16 lowercase hex, deterministic, name-namespaced", () => {
  const node = { seed: { value: "9f2c4a1b77de0351", epoch: 0, why: null } };
  const a = streamSeed({ node, name: "terrain" });
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a, streamSeed({ node, name: "terrain" }));       // pure
  assert.notEqual(a, streamSeed({ node, name: "settlements" })); // namespaced
});

test("reroll: bumps epoch, records why, skips frozen, requires why (pure, mintHex injected)", () => {
  const nodes = [
    { id: "n-p", tier: "world", parentId: null, frozen: false, seed: { value: "1111111111111111", epoch: 0, why: null } },
    { id: "n-c", tier: "continent", parentId: "n-p", frozen: true, seed: { value: "2222222222222222", epoch: 0, why: null } },
    { id: "n-d", tier: "continent", parentId: "n-p", frozen: false, seed: { value: "3333333333333333", epoch: 2, why: "old" } },
  ];
  let i = 0;
  const mintHex = () => ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"][i++];
  const res = reroll({ nodes, targetId: "n-p", subtree: true, why: "test reroll", mintHex });
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.skippedFrozen, ["n-c"]);
  assert.deepEqual(res.changed, [
    { id: "n-p", oldSeed: "1111111111111111", newSeed: "aaaaaaaaaaaaaaaa", epoch: 1 },
    { id: "n-d", oldSeed: "3333333333333333", newSeed: "bbbbbbbbbbbbbbbb", epoch: 3 },
  ]);
  // nodes were NOT mutated (pure)
  assert.equal(nodes[0].seed.value, "1111111111111111");
  // no why → in-band error, nothing changed
  const bad = reroll({ nodes, targetId: "n-p", subtree: false, why: "", mintHex: () => "cccccccccccccccc" });
  assert.equal(bad.changed.length, 0);
  assert.match(bad.errors[0], /--why/);
  // without --subtree only the target itself
  const solo = reroll({ nodes, targetId: "n-p", subtree: false, why: "solo", mintHex: () => "dddddddddddddddd" });
  assert.deepEqual(solo.changed.map((c) => c.id), ["n-p"]);
});

test("reroll: a cyclic parentId under --subtree is an in-band error, not a stack overflow", () => {
  const nodes = [
    { id: "n-a", tier: "world", parentId: "n-b", frozen: false, seed: { value: "6666666666666666", epoch: 0, why: null } },
    { id: "n-b", tier: "world", parentId: "n-a", frozen: false, seed: { value: "7777777777777777", epoch: 0, why: null } },
  ];
  const res = reroll({ nodes, targetId: "n-a", subtree: true, why: "cycle test", mintHex: () => "eeeeeeeeeeeeeeee" });
  assert.deepEqual(res.changed, []);
  assert.deepEqual(res.skippedFrozen, []);
  assert.ok(res.errors.some((e) => /cycle/.test(e)), res.errors.join("\n"));
});

test("reroll CLI: rewrites the target file, leaves frozen siblings untouched, refuses without --why", () => {
  const dir = writeSpineRoot({
    nodes: [
      { ...tinyNode("n-w", "world", null, "4444444444444444"), frozen: false },
      { ...tinyNode("n-k", "continent", "n-w", "5555555555555555"), frozen: true },
    ],
    roots: ["n-w"],
  });
  const cli = join(REPO, "scripts/lib/spine.mjs");
  // refuses without --why
  let code = 0;
  try { execFileSync(process.execPath, [cli, "reroll", "n-w", "--content-root", dir], { encoding: "utf8" }); }
  catch (e) { code = e.status; }
  assert.equal(code, 2);
  // rerolls the unfrozen root, skips the frozen child
  const out = execFileSync(process.execPath,
    [cli, "reroll", "n-w", "--subtree", "--why", "cli demo", "--content-root", dir], { encoding: "utf8" });
  assert.match(out, /rerolled n-w: 4444444444444444 → [0-9a-f]{16} \(epoch 1\)/);
  assert.match(out, /skipped frozen n-k/);
  const w = JSON.parse(readFileSync(join(dir, "spine/nodes/n-w.json"), "utf8"));
  assert.notEqual(w.seed.value, "4444444444444444");
  assert.match(w.seed.value, /^[0-9a-f]{16}$/);
  assert.equal(w.seed.epoch, 1);
  assert.equal(w.seed.why, "cli demo");
  const k = JSON.parse(readFileSync(join(dir, "spine/nodes/n-k.json"), "utf8"));
  assert.equal(k.seed.value, "5555555555555555"); // frozen: untouched
});

// ── F-041 Phase 3: town-frame gate logic ────────────────────────────────────
function p3TownNode(overrides = {}) {
  return {
    id: "n-t1", tier: "town",
    interior: { units: "u", perParentUnit: 100, size: [200, 160],
                originInParent: [249, 249.2], anchorInInterior: [100, 80] },
    composition: { built: 28, river: 9, meadow: 63 },
    terrainKind: null,
    ...overrides,
  };
}
function p3PlanDoc(overrides = {}) {
  return {
    town: "t1", spineId: "n-t1",
    extent: { width: 200, height: 160 },
    anchor: { geographyAt: [250, 250] },
    water: [{ id: "w-river", kind: "river", poly: [[120, 0], [152, 0], [152, 90], [120, 90]] }],
    roads: [],
    footprints: [{ id: "big-block", kind: "store", rect: [0, 0, 80, 112] }],
    plazas: [],
    landmarks: [{ id: "the-centre", at: [100, 80], firstSight: true }],
    ...overrides,
  };
}
const p3Tree = (node) => ({ byId: new Map([[node.id, node]]) });

test("townFrameErrors: the HC-4 centre identity holds on a reverse-derived frame", () => {
  assert.deepEqual(
    townFrameErrors({ tree: p3Tree(p3TownNode()), plans: [{ file: "towns/town-t1.json", doc: p3PlanDoc() }] }),
    []);
});

test("townFrameErrors: corner-as-anchor (anchorInInterior [0,0], placement unchanged) is rejected", () => {
  const node = p3TownNode();
  node.interior = { ...node.interior, anchorInInterior: [0, 0] };
  const errors = townFrameErrors({ tree: p3Tree(node), plans: [{ file: "towns/town-t1.json", doc: p3PlanDoc() }] });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /centre-of-interest, not the origin corner/);
});

test("townFrameErrors: a missing anchorInInterior is a defect, not a skip", () => {
  const node = p3TownNode();
  delete node.interior.anchorInInterior;
  const errors = townFrameErrors({ tree: p3Tree(node), plans: [{ file: "towns/town-t1.json", doc: p3PlanDoc() }] });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /anchorInInterior is missing/);
});

test("townFrameErrors: a dangling spineId is reported; a non-town target is reported", () => {
  const dangling = townFrameErrors({ tree: p3Tree(p3TownNode()),
    plans: [{ file: "towns/town-x.json", doc: p3PlanDoc({ spineId: "n-nope" }) }] });
  assert.equal(dangling.length, 1);
  assert.match(dangling[0], /resolves to no spine node/);
  const region = townFrameErrors({ tree: p3Tree(p3TownNode({ tier: "region" })),
    plans: [{ file: "towns/town-t1.json", doc: p3PlanDoc() }] });
  assert.equal(region.length, 1);
  assert.match(region[0], /tier "region", must be "town"/);
});

test("townFrameErrors: a plan without spineId is G-ALIAS's business (Phase 5), silence here", () => {
  const doc = p3PlanDoc();
  delete doc.spineId;
  assert.deepEqual(townFrameErrors({ tree: p3Tree(p3TownNode()), plans: [{ file: "towns/town-t1.json", doc }] }), []);
});

test("townCompDerived: exact axis-aligned fixture rasterizes to built 28.00, river 9.00", () => {
  const { builtPct, riverPct } = townCompDerived({ plan: p3PlanDoc() });
  assert.ok(Math.abs(builtPct - 28) < 0.01, `builtPct ${builtPct}`);
  assert.ok(Math.abs(riverPct - 9) < 0.01, `riverPct ${riverPct}`);
});

test("townCompDerived: water under a footprint is built, not river — union partition, not sum", () => {
  const doc = p3PlanDoc({ water: [{ id: "w", kind: "river", poly: [[0, 0], [80, 0], [80, 112], [0, 112]] }] });
  assert.ok(townCompDerived({ plan: doc }).riverPct < 0.01, "water fully under the footprint must contribute 0 river");
});

test("townCompDerived: a swept road counts as built", () => {
  const doc = p3PlanDoc({ footprints: [], roads: [{ id: "r", kind: "cart", width: 16, points: [[0, 80], [200, 80]] }] });
  const { builtPct } = townCompDerived({ plan: doc });
  assert.ok(Math.abs(builtPct - 10) < 0.6, `builtPct ${builtPct} — 16u x 200u over 32000u² is 10%`);
});

test("townCompErrors: declared built 10 against derived 28 is outside ±3 pp (the footprints-only mistake)", () => {
  const node = p3TownNode({ composition: { built: 10, river: 9, meadow: 81 } });
  const errors = townCompErrors({ tree: p3Tree(node), plans: [{ file: "towns/town-t1.json", doc: p3PlanDoc() }] });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /declared built 10 vs derived 28\.00/);
});

test("townCompErrors: the true declaration passes within ±3 pp", () => {
  assert.deepEqual(
    townCompErrors({ tree: p3Tree(p3TownNode()), plans: [{ file: "towns/town-t1.json", doc: p3PlanDoc() }] }),
    []);
});

test("townCompErrors: a degenerate extent (smaller than the sampling cell) is reported, not silently NaN'd away", () => {
  const doc = p3PlanDoc({ extent: { width: 0.3, height: 0.3 } });
  const errors = townCompErrors({ tree: p3Tree(p3TownNode()), plans: [{ file: "towns/town-t1.json", doc }] });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /extent 0\.3x0\.3 is smaller than the sampling cell/);
});

test("terrainKindErrors: implied biome under 15% is a defect; null terrainKind is silence; unknown kind is a defect", () => {
  assert.deepEqual(terrainKindErrors({ nodes: [p3TownNode()] }), []);
  const under = terrainKindErrors({ nodes: [{ id: "n-r1", terrainKind: "river-country", composition: { river: 10, meadow: 90 } }] });
  assert.equal(under.length, 1);
  assert.match(under[0], /implies biome "river" at >= 15%/);
  const unknown = terrainKindErrors({ nodes: [{ id: "n-x", terrainKind: "volcano", composition: { rock: 100 } }] });
  assert.equal(unknown.length, 1);
  assert.match(unknown[0], /is not one of/);
});

// ── F-041 Phase 4: G-RUNTIME (mapIds string[] resolve, units u, rect
// flattening, accumulated-originU identity) ─────────────────────────────
function runtimeTree(mutate = () => {}) {
  const nodes = [
    { id: "n-playroot", tier: "playroot", parentId: null,
      interior: { units: "u", perParentUnit: 1, size: [2000, 2000], originInParent: [0, 0] },
      runtime: { mapIds: [], originU: null, spawnAreas: [], mobSettings: null, seedDemoNPCs: false, collision: "none" } },
    { id: "n-shelf", tier: "playspace", parentId: "n-playroot",
      placement: { shape: "rect", rect: { x: 0, y: 0, w: 1000, h: 1000 }, anchor: [500, 500] },
      interior: { units: "u", perParentUnit: 1, size: [1000, 1000], originInParent: [0, 0] },
      runtime: { mapIds: ["map-01-sector-a", "map-for-play", "map-for-test-deflect", "map-for-test-projectile"],
                 originU: [0, 0], spawnAreas: [], mobSettings: null, seedDemoNPCs: true, collision: "none" } },
    { id: "n-site-a", tier: "site", parentId: "n-shelf",
      placement: { shape: "rect", rect: { x: 750, y: 250, w: 250, h: 500 }, anchor: [875, 500] },
      interior: { units: "u", perParentUnit: 1, size: [250, 500], originInParent: [750, 250] },
      runtime: { mapIds: [], originU: [750, 250],
                 spawnAreas: [{ id: "area_x", x: 140, y: 150, width: 95, height: 160, mobType: "bramble_drake", count: 1 }],
                 mobSettings: null, seedDemoNPCs: false, collision: "none" } },
  ];
  mutate(nodes);
  return buildTree({ nodes, rootIds: ["n-playroot"] });
}

test("flattenSpawnAreas flattens a site rect into its owning map node's frame", () => {
  const { errors, areas } = flattenSpawnAreas({ tree: runtimeTree() });
  assert.deepEqual(errors, []);
  assert.equal(areas.length, 1);
  assert.deepEqual(areas[0].abs, { x: 890, y: 400, width: 95, height: 160 });
  assert.equal(areas[0].mapNodeId, "n-shelf");
  assert.deepEqual(areas[0].mapSize, [1000, 1000]);
});

test("G-RUNTIME: a scalar mapIds is an HC-5 violation", () => {
  const tree = runtimeTree((ns) => { ns[1].runtime.mapIds = "map-01-sector-a"; });
  const { errors } = checkRuntime({ tree, mobTypes: new Set(["bramble_drake"]) });
  assert.ok(errors.some((e) => e.includes("HC-5")), errors.join("\n"));
});

test("G-RUNTIME: originU must equal the accumulated origin in root units (NOT composeToRoot, which is [0,0] on an all-per-1 tree)", () => {
  // the authored value [750,250] passes: it equals the originInParent walk to the root
  const ok = checkRuntime({ tree: runtimeTree(), mobTypes: new Set(["bramble_drake"]) });
  assert.deepEqual(ok.errors, []);
  // one unit off fails
  const tree = runtimeTree((ns) => { ns[2].runtime.originU = [751, 250]; });
  const { errors } = checkRuntime({ tree, mobTypes: new Set(["bramble_drake"]) });
  assert.ok(errors.some((e) => e.includes('G-RUNTIME: "n-site-a" runtime.originU')), errors.join("\n"));
});

test("G-RUNTIME: live map ids must all resolve, and no node may claim a non-live id", () => {
  assert.deepEqual(LIVE_MAP_IDS, ["map-01-sector-a", "map-for-play", "map-for-test-deflect", "map-for-test-projectile"]);
  const tree = runtimeTree((ns) => { ns[1].runtime.mapIds = ["map-01-sector-a", "map-ghost"]; });
  const { errors } = checkRuntime({ tree, mobTypes: new Set(["bramble_drake"]) });
  assert.ok(errors.some((e) => e.includes('live mapId "map-for-play" resolves to no spine node')));
  assert.ok(errors.some((e) => e.includes('"map-ghost" which is not a live server map id')));
});

test("G-SPAWN-FIT: margins are per-area (boundary 5 + radius(mobType)), not a global max", () => {
  assert.equal(BOUNDARY_THICKNESS_U, 5);
  assert.equal(MOB_RADIUS_U.bramble_drake, 5);
  // area_x abs (890,400,95,160) in 1000x1000: east margin 15 >= 10 -> green
  assert.deepEqual(checkSpawnFit({ tree: runtimeTree() }).errors, []);
  // push it 12 east: abs x 902, east margin 3 < 10 -> red on the east side only
  const tree = runtimeTree((ns) => { ns[2].runtime.spawnAreas[0].x = 152; });
  const { errors } = checkSpawnFit({ tree });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /G-SPAWN-FIT: spawn area "area_x" east margin 3 < required 10/);
});

test("G-SPAWN-FIT: an unknown mobType radius is its own failure, not a silent pass", () => {
  const tree = runtimeTree((ns) => { ns[2].runtime.spawnAreas[0].mobType = "ghost_mob"; });
  const { errors } = checkSpawnFit({ tree });
  assert.ok(errors.some((e) => e.includes('no radius entry in MOB_RADIUS_U')), errors.join("\n"));
});

// `exempt` names the ids allowed to be frozen WITHOUT spine authorship (the
// real gate passes LEGACY_UNPAIRED). Here that is the synthetic runtime-only
// id, so the subset direction added by the Phase-4 review can't fire.
const EXEMPT_RUNTIME_ONLY = new Set(["runtime_only"]);

test("G-SPAWN-ID-STABLE is set equality against the frozen file, not superset", () => {
  const tree = runtimeTree(); // one spine area: area_x
  const ok = checkSpawnIdStable({ tree, frozenIds: ["area_x", "runtime_only"], runtimeIds: ["runtime_only"], exempt: EXEMPT_RUNTIME_ONLY });
  assert.deepEqual(ok.errors, []);
  // a rename on the spine side is missing+extra, not a pass
  const bad = checkSpawnIdStable({ tree, frozenIds: ["area_y", "runtime_only"], runtimeIds: ["runtime_only"], exempt: new Set(["runtime_only", "area_y"]) });
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /G-SPAWN-ID-STABLE/);
  assert.match(bad.errors[0], /missing: \[area_y\]/);
  assert.match(bad.errors[0], /extra: \[area_x\]/);
});

// Review finding 1 (MEDIUM), unit level. The union was seeded from the
// runtime artifact, so an id present in BOTH tables could be deleted from the
// spine with zero change to the union — and zero gate signal.
test("G-SPAWN-ID-STABLE: a spine-side deletion of a DUAL-listed id is caught by the subset direction, not by the union", () => {
  const tree = runtimeTree((ns) => { ns[2].runtime.spawnAreas = []; }); // area_x deleted from the spine
  const frozenIds = ["area_x", "runtime_only"];
  const runtimeIds = ["area_x", "runtime_only"]; // area_x is dual-listed: the union is UNCHANGED
  const { errors } = checkSpawnIdStable({ tree, frozenIds, runtimeIds, exempt: EXEMPT_RUNTIME_ONLY });
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.match(errors[0], /no longer authored in content\/spine\/nodes\/\*: \[area_x\]/);
  assert.doesNotMatch(errors[0], /missing:/); // the union really is still equal — this is the added direction
});

test("G-ALIAS playspace half: region-<slug> resolves to n-site-<slug> and prints the tier", () => {
  const tree = runtimeTree((ns) => {
    ns[2].id = "n-site-thornveil"; ns[2].representsNodeId = "n-shelf"; // any resolvable id works for the unit test
  });
  const ok = checkPlayspaceAliases({ tree, regionIds: ["region-thornveil"] });
  assert.deepEqual(ok.errors, []);
  assert.ok(ok.lines.includes("G-ALIAS: region-thornveil → n-site-thornveil (site)"));
  assert.ok(ok.lines.includes("G-ALIAS: n-site-thornveil represents n-shelf (playspace)"));
  const bad = checkPlayspaceAliases({ tree, regionIds: ["region-ghost"] });
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /G-ALIAS: map region "region-ghost" resolves to no spine node \(expected "n-site-ghost"\)/);
});

test("G-SPINE-COMPLETE: childless trunk tiers fail; childless region/sea/ocean only warn (Gate 2 must stay green)", () => {
  assert.deepEqual([...TRUNK_TIERS].sort(), ["continent", "playroot", "playspace", "world"]);
  // childless playspace -> error
  const t1 = runtimeTree((ns) => { ns.splice(2, 1); }); // drop the site: n-shelf is now childless
  const r1 = checkSpineComplete({ tree: t1 });
  assert.equal(r1.errors.length, 1);
  assert.match(r1.errors[0], /G-SPINE-COMPLETE: "n-shelf" \(tier playspace\) has no children/);
  // leaf tiers are exempt; a full tree has no errors
  const r2 = checkSpineComplete({ tree: runtimeTree() });
  assert.deepEqual(r2.errors, []);
});

// F-043 amendment: reported-world nodes (mariners' chart entries, `lore.reported:
// true`) are deliberately childless — unsurveyed regions the spec says must stay
// bare. checkSpineComplete predates that concept, so a childless trunk-tier node
// still needs the same hard FAIL unless it is explicitly marked reported.
test("G-SPINE-COMPLETE: a childless trunk-tier node WITHOUT lore.reported still errors", () => {
  const t = runtimeTree((ns) => { ns.splice(2, 1); }); // n-shelf (playspace) childless, no lore field at all
  const { errors, warns } = checkSpineComplete({ tree: t });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /G-SPINE-COMPLETE: "n-shelf" \(tier playspace\) has no children/);
  assert.ok(!warns.some((w) => w.includes("n-shelf")));
});

test("G-SPINE-COMPLETE: a childless trunk-tier node WITH lore.reported: true is a WARN, not an error", () => {
  const t = runtimeTree((ns) => {
    ns.splice(2, 1); // drop the site: n-shelf is now childless
    ns[1].lore = { reported: true, summary: "charted by mariners, never surveyed" };
  });
  const { errors, warns } = checkSpineComplete({ tree: t });
  assert.ok(!errors.some((e) => e.includes("n-shelf")), errors.join("\n"));
  assert.equal(warns.filter((w) => w.includes("n-shelf")).length, 1);
  assert.match(
    warns.find((w) => w.includes("n-shelf")),
    /G-SPINE-COMPLETE: "n-shelf" \(tier playspace\) is childless — reported, not surveyed; childless by design \(F-043\)/,
  );
});

test("G-SPINE-COMPLETE: a reported trunk-tier node WITH children has no warn at all", () => {
  const t = runtimeTree((ns) => {
    ns[1].lore = { reported: true, summary: "charted by mariners, and later surveyed" };
  }); // n-shelf keeps its site child (n-site-a)
  const { errors, warns } = checkSpineComplete({ tree: t });
  assert.ok(!errors.some((e) => e.includes("n-shelf")));
  assert.ok(!warns.some((w) => w.includes("n-shelf")));
});

// ── F-041 P4 Task 4.9: informational authored-vs-runtime spawn geometry
// report (never-FAIL) ───────────────────────────────────────────────────
test("parseRuntimeSpawnRects extracts all 8 runtime rects from the live mapConfig.ts (drift pin)", () => {
  const source = readFileSync(new URL("../../colyseus-server/src/config/mapConfig.ts", import.meta.url), "utf8");
  const { rects, errors } = parseRuntimeSpawnRects({ source });
  assert.deepEqual(errors, []);
  assert.equal(rects.size, 8);   // if mapConfig's format drifts, THIS test reds — the report itself never fails
  assert.deepEqual(rects.get("thornveil_interior"), { x: 820, y: 420, width: 150, height: 150 });
  assert.deepEqual(rects.get("center_courtyard"), { x: 400, y: 400, width: 200, height: 200 });
});

test("spawn geometry report prints authored and runtime rects side by side, dashes when a side is absent", () => {
  const areas = [{ id: "thornveil_interior", abs: { x: 890, y: 400, width: 95, height: 160 } }];
  const runtimeRects = new Map([
    ["thornveil_interior", { x: 820, y: 420, width: 150, height: 150 }],
    ["boss_area", { x: 450, y: 450, width: 100, height: 100 }],
  ]);
  const lines = spawnGeometryReportLines({ areas, runtimeRects });
  assert.ok(lines.includes("spawn-geometry: thornveil_interior authored=(890,400 95x160) runtime=(820,420 150x150)"));
  assert.ok(lines.includes("spawn-geometry: boss_area authored=— runtime=(450,450 100x100)"));
});

// ── atlas-frontier.md emitter (G-EMIT-DRIFT mirror #2) ─────────────────────
test("frontier emitter reproduces content/maps/atlas-frontier.md byte-exactly from the spine", () => {
  const contentRoot = new URL("../../content", import.meta.url).pathname;
  const spine = loadSpine({ contentRoot });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const current = readFileSync(`${contentRoot}/maps/atlas-frontier.md`, "utf8");
  const { text, errors } = renderFrontierFile({ tree, currentText: current });
  assert.deepEqual(errors, []);
  assert.equal(text, current);
});

// ── F-041 P4 phase-review fix wave (unit level) ───────────────────────────

// Review finding 2 (MEDIUM): a spawnAreas rect is ALWAYS node-local, but the
// margin test bounds it against the MAP. area_x on the 250x500 site, moved to
// (400,400), sits fully outside its owner yet keeps legal map margins.
test("G-SPAWN-FIT: a spawn rect outside its OWNING node reds even when every map margin is legal", () => {
  // n-site-a is (750,250) 250x500 inside a 1000x1000 map. Local (-700,-200)
  // lands the rect at abs (50,50) 95x160: comfortable margins on all four
  // sides, yet the rect is nowhere near the node that owns it.
  const tree = runtimeTree((ns) => { ns[2].runtime.spawnAreas[0].x = -700; ns[2].runtime.spawnAreas[0].y = -200; });
  const { errors } = checkSpawnFit({ tree });
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.match(errors[0], /"area_x" rect \(-700,-200 95x160\) is not contained by its owning node "n-site-a" interior\.size \[250, 500\]/);
  assert.doesNotMatch(errors[0], /margin/); // the margins really do pass — that was the hole
  // overflowing the far edge is the same defect from the other side
  const over = checkSpawnFit({ tree: runtimeTree((ns) => { ns[2].runtime.spawnAreas[0].x = 200; }) });
  assert.ok(over.errors.some((e) => e.includes('is not contained by its owning node')), over.errors.join("\n"));
});

// Review finding 4 (MEDIUM): three readings of the same coordinate —
// composeToRoot (canonical: o + origin/per), checkRuntime's originU walk and
// flattenSpawnAreas (both plain sums) — agree ONLY at perParentUnit 1. A
// per !== 1 in a runtime-bearing subtree is rejected rather than silently
// resolved by whichever walk got there first.
test("G-RUNTIME: perParentUnit !== 1 anywhere above a runtime-bearing node is an in-band FAIL", () => {
  const tree = runtimeTree((ns) => { ns[2].interior.perParentUnit = 2; });
  const { errors } = checkRuntime({ tree, mobTypes: new Set(["bramble_drake"]) });
  assert.ok(errors.some((e) => /"n-site-a" carries runtime data under a scale boundary — "n-site-a" interior\.perParentUnit is 2/.test(e)),
    errors.join("\n"));
  assert.ok(errors.some((e) => e.includes("composeToRoot")), errors.join("\n"));
});

test("G-RUNTIME: the empty runtime stub every fiction node ships does NOT trip the per-unit guard (towns are legitimately per 100)", () => {
  const tree = runtimeTree((ns) => {
    ns[2].interior.perParentUnit = 100;
    ns[2].runtime = { mapIds: [], originU: null, spawnAreas: [], mobSettings: null, seedDemoNPCs: false, collision: "none" };
  });
  const { errors } = checkRuntime({ tree, mobTypes: new Set(["bramble_drake"]) });
  assert.deepEqual(errors.filter((e) => e.includes("scale boundary")), []);
});

// Review finding 3 (MEDIUM): FRONTIER_DOC.siteOrder hardcoded three sites, so
// a 4th was silently omitted from the mirror. It is now an ORDER PIN over a
// list DERIVED from the tree, and G-ALIAS gained the reverse direction.
test("frontierSiteIds derives the site list from the tree; the constant only pins the order of known ids", () => {
  const tree = runtimeTree((ns) => {
    ns[1].id = "n-frontier-shelf";
    for (const n of ns) if (n.parentId === "n-shelf") n.parentId = "n-frontier-shelf";
    ns[2].id = "n-site-thornveil";
    ns.push({ ...ns[2], id: "n-site-newvale", runtime: { mapIds: [], originU: null, spawnAreas: [], mobSettings: null, seedDemoNPCs: false, collision: "none" } });
  });
  const { ids, errors } = frontierSiteIds({ tree });
  // pinned ids keep their committed order; the unknown 4th appends
  assert.deepEqual(ids, ["n-site-thornveil", "n-site-newvale"]);
  assert.deepEqual(errors.filter((e) => !e.includes("not found")), []);
});

test("G-ALIAS reverse: a site authored under the playspace but missing from the map mirror reds", () => {
  const tree = runtimeTree((ns) => {
    ns[1].id = "n-frontier-shelf";
    for (const n of ns) if (n.parentId === "n-shelf") n.parentId = "n-frontier-shelf";
    ns[2].id = "n-site-thornveil";
  });
  assert.deepEqual(checkPlayspaceAliases({ tree, regionIds: ["region-thornveil"] }).errors, []);
  const { errors } = checkPlayspaceAliases({ tree, regionIds: [] });
  assert.equal(errors.length, 1, errors.join("\n"));
  assert.match(errors[0], /spine site "n-site-thornveil" has no map region "region-thornveil"/);
});

// Review finding 7 (LOW/OPTIONAL): LIVE_MAP_IDS was triplicated (this
// library, mapDimensions.test.ts, and the mapConfig/mobSpawnConfig branches)
// with nothing binding the copies. mapConfig.ts is NOT scannable — two of the
// four ids never appear in it (map-01-sector-a and map-for-play live in
// GameRoom/the client picker), so a scan there would be a false-green. But
// colyseus-server/src/config/mobSpawnConfig.ts keys MAP_MOB_SETTINGS by
// exactly the live ids, in one top-level object literal: that IS the list, so
// bind to it. A format change cannot silently pass — the parse would yield a
// different set and this test reds.
test("LIVE_MAP_IDS equals the per-map override keys in the live mobSpawnConfig.ts (no fourth copy drifting alone)", () => {
  const source = readFileSync(new URL("../../colyseus-server/src/config/mobSpawnConfig.ts", import.meta.url), "utf8");
  const block = source.match(/const MAP_MOB_SETTINGS[^=]*=\s*\{([\s\S]*?)\n\}/);
  assert.ok(block, "MAP_MOB_SETTINGS object literal not found — mobSpawnConfig.ts format changed");
  const keys = [...block[1].matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1]);
  assert.deepEqual(keys.sort(), [...LIVE_MAP_IDS].sort());
});
