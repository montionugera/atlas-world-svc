import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIER_DEPTH, LEAF_TIERS, BIOMES, TERRAIN_KINDS, TERRAIN_IMPLIES,
  SPINE_CELL_KM, SPINE_CELL_U, KM_TO_U, ID_RE, SEED_RE,
  shoelaceArea, polygonBBox, pointInPolygon, selfIntersects,
  placementArea, gridIntersectionArea, gridUnionArea,
  townFrameErrors, townCompDerived, townCompErrors, terrainKindErrors,
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

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSpine, buildTree, ancestorChain, subtreeIds } from "../lib/spine.mjs";

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
