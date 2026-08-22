// tools/mapforge/tests/dungeons.test.mjs — Task 9c (P13 dungeon anchoring).
//
// The REAL-WORLD proof for this pass lives in settlements.test.mjs's civic
// block, because anchorDungeons consumes both instanceLandforms' and
// placeSettlements' output and the 800 x 800 world costs ~4.3 s to build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { anchorDungeons, hopsToSettlement, MAX_HOPS, MAX_PER_REGION } from "../lib/passes/dungeons.mjs";
import { SETTLEMENT_STREAM } from "./fixtures/coast-world.mjs";

const MINI = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)),
  "fixtures/mini-lexicon/landforms.json"), "utf8"));

// `stream` is the committed settlements stream — anchorDungeons mints its own
// `dungeons` child from it. The plan's fixtures pass "seedseedseedseed", which
// is not hex; `streamInt` has thrown on that since seam 1 (STATE §5).
const S = SETTLEMENT_STREAM;
const inst = (n, region, type = "karst-cenote") =>
  ({ handle: `c01/karst/h-${String(n).padStart(6, "0")}`, type, region, dungeonCapable:
     MINI.find((t) => t.id === type).dungeonCapable, cell: [n, n] });

test("MAX_HOPS is the spec's 2 and the per-region cap is 3", () => {
  assert.equal(MAX_HOPS, 2);
  assert.equal(MAX_PER_REGION, 3);
});

test("anchorDungeons only picks dungeonCapable landforms within 2 region hops of a settlement", () => {
  const instances = [
    { handle: "c01/karst/h-000001", type: "karst-cenote", region: "c01/r01", dungeonCapable: true },
    { handle: "c01/karst/h-000002", type: "karst-pavement", region: "c01/r01", dungeonCapable: false },
    { handle: "c01/karst/h-000003", type: "karst-fenster", region: "c01/r08", dungeonCapable: true },
  ];
  const regions = [
    { id: "c01/r01", continent: "c01", survey: "surveyed", adjacent: ["c01/r02"] },
    { id: "c01/r02", continent: "c01", survey: "surveyed", adjacent: ["c01/r01"] },
    { id: "c01/r08", continent: "c01", survey: "reported", adjacent: [] },
  ];
  const settlements = [{ id: "c01/s01", region: "c01/r02", rank: "hub" }];
  const r = anchorDungeons({ instances, regions, settlements, lexicon: MINI,
                             manifest: { quotas: { dungeons: { complexes: 5 } } }, stream: S });
  assert.deepEqual(r.anchors.map((a) => a.handle), ["c01/karst/h-000001"]);
  assert.equal(r.anchors[0].hopsToSettlement, 1);
  assert.equal(r.anchors[0].continent, "c01");
  assert.equal(r.anchors[0].region, "c01/r01");
  // h-000002 is not dungeonCapable; h-000003 is on an ISLAND region with no
  // path to any settled region at all — excluded, never given a hop count.
  assert.ok(r.problems.some((p) => /only 1 of 5 complexes/.test(p)), JSON.stringify(r.problems));
});

test("hopsToSettlement is SERIALISED, so G-DUNGEON-REACH reads it instead of re-walking the graph", () => {
  const instances = [
    { handle: "c01/karst/h-000001", type: "karst-cenote", region: "c01/r03", dungeonCapable: true },
  ];
  const regions = [
    { id: "c01/r01", continent: "c01", survey: "surveyed", adjacent: ["c01/r02"] },
    { id: "c01/r02", continent: "c01", survey: "surveyed", adjacent: ["c01/r01", "c01/r03"] },
    { id: "c01/r03", continent: "c01", survey: "surveyed", adjacent: ["c01/r02"] },
  ];
  const settlements = [{ id: "c01/s01", region: "c01/r01", rank: "hub" }];
  const r = anchorDungeons({ instances, regions, settlements, lexicon: MINI,
                             manifest: { quotas: { dungeons: { complexes: 1 } } }, stream: S });
  assert.equal(r.anchors.length, 1);
  assert.equal(r.anchors[0].hopsToSettlement, 2, "r03 is two hops from the settled r01");
  assert.equal(r.anchors[0].entranceType, "karst-cenote", "entranceType is serialised, not re-derivable");
  assert.deepEqual(r.problems, []);
});

test("MAX_HOPS is a real boundary: 3 hops is excluded, 2 is admitted", () => {
  const chain = ["c01/r01", "c01/r02", "c01/r03", "c01/r04"];
  const regions = chain.map((id, n) => ({ id, continent: "c01", survey: "surveyed",
    adjacent: [chain[n - 1], chain[n + 1]].filter(Boolean) }));
  const settlements = [{ id: "c01/s01", region: "c01/r01", rank: "hub" }];
  const run = (region) => anchorDungeons({
    instances: [inst(1, region)], regions, settlements, lexicon: MINI,
    manifest: { quotas: { dungeons: { complexes: 1 } } }, stream: S });
  assert.equal(run("c01/r03").anchors.length, 1, "2 hops must be admitted");
  assert.equal(run("c01/r03").anchors[0].hopsToSettlement, MAX_HOPS);
  assert.equal(run("c01/r04").anchors.length, 0, "3 hops must be excluded");
});

test("BFS is over UNDIRECTED adjacency, and a one-sided entry is REPORTED", () => {
  // regions[].adjacent is written by partitionRegions and is symmetric there —
  // but this number is what G-DUNGEON-REACH reads instead of walking the graph,
  // so a one-sided entry would make the gate LIE rather than fail.
  const regions = [
    { id: "c01/r01", continent: "c01", survey: "surveyed", adjacent: ["c01/r02"] },
    { id: "c01/r02", continent: "c01", survey: "surveyed", adjacent: [] },   // one-sided
  ];
  const problems = [];
  const hops = hopsToSettlement({ regions, settlements: [{ id: "c01/s01", region: "c01/r02" }], problems });
  assert.equal(hops.get("c01/r01"), 1, "the walk did not traverse the one-sided edge backwards");
  assert.ok(problems.some((p) => /one-sided/.test(p)), JSON.stringify(problems));
});

test("an adjacency naming a region that does not exist is REPORTED", () => {
  const problems = [];
  hopsToSettlement({
    regions: [{ id: "c01/r01", continent: "c01", adjacent: ["c01/r99"] }],
    settlements: [{ id: "c01/s01", region: "c01/r01" }], problems });
  assert.ok(problems.some((p) => /adjacent to c01\/r99, which is not a region/.test(p)),
    JSON.stringify(problems));
});

test("the LEXICON decides dungeonCapable, and a disagreeing instance is REPORTED", () => {
  const instances = [
    { handle: "c01/karst/h-000001", type: "karst-pavement", region: "c01/r01", dungeonCapable: true },
    { handle: "c01/karst/h-000002", type: "no-such-type", region: "c01/r01", dungeonCapable: true },
  ];
  const regions = [{ id: "c01/r01", continent: "c01", survey: "surveyed", adjacent: [] }];
  const r = anchorDungeons({ instances, regions, settlements: [{ id: "c01/s01", region: "c01/r01" }],
    lexicon: MINI, manifest: { quotas: { dungeons: { complexes: 1 } } }, stream: S });
  assert.equal(r.anchors.length, 0, "a pavement was used as a dungeon entrance");
  assert.ok(r.problems.some((p) => /says dungeonCapable=true and the lexicon row for karst-pavement says false/.test(p)),
    JSON.stringify(r.problems));
  assert.ok(r.problems.some((p) => /type no-such-type, which is not in the lexicon/.test(p)),
    JSON.stringify(r.problems));
});

test("an instance on a region that does not exist is REPORTED, not silently dropped", () => {
  const regions = [{ id: "c01/r01", continent: "c01", survey: "surveyed", adjacent: [] }];
  const r = anchorDungeons({
    instances: [inst(1, "c01/r99"), inst(2, "c01/r01")], regions,
    settlements: [{ id: "c01/s01", region: "c01/r01" }], lexicon: MINI,
    manifest: { quotas: { dungeons: { complexes: 2 } } }, stream: S });
  assert.deepEqual(r.anchors.map((a) => a.region), ["c01/r01"]);
  assert.ok(r.problems.some((p) => /is on region c01\/r99, which is not a region/.test(p)),
    JSON.stringify(r.problems));
});

test("at most MAX_PER_REGION anchors land in one region, spread round by round", () => {
  // 12 instances over 2 regions against a quota of 5: round 1 takes one from
  // each, round 2 a second from each, round 3 the fifth. Deleting the cap puts
  // all 5 in whichever region the draw favours.
  const regions = [
    { id: "c01/r01", continent: "c01", survey: "surveyed", adjacent: ["c01/r02"] },
    { id: "c01/r02", continent: "c01", survey: "surveyed", adjacent: ["c01/r01"] },
  ];
  const instances = Array.from({ length: 12 }, (_, n) => inst(n, `c01/r0${(n % 2) + 1}`));
  const r = anchorDungeons({ instances, regions, settlements: [{ id: "c01/s01", region: "c01/r01" }],
    lexicon: MINI, manifest: { quotas: { dungeons: { complexes: 5 } } }, stream: S });
  assert.equal(r.anchors.length, 5);
  // The EMITTED order is the handle order, not the draw order — a consumer that
  // diffs two ledgers must not see a re-ordering when nothing moved.
  assert.deepEqual(r.anchors.map((a) => a.handle), [...r.anchors.map((a) => a.handle)].sort());
  assert.deepEqual(r.anchors.map((a) => a.handle),
    ["c01/karst/h-000000", "c01/karst/h-000002", "c01/karst/h-000004",
     "c01/karst/h-000007", "c01/karst/h-000011"]);
  const per = new Map();
  for (const a of r.anchors) per.set(a.region, (per.get(a.region) ?? 0) + 1);
  for (const [rid, n] of per) assert.ok(n <= MAX_PER_REGION, `${rid} holds ${n} anchors`);
  assert.deepEqual([...per.values()].sort(), [2, 3]);
});

test("the per-region cap can starve the quota, and it says so rather than exceeding it", () => {
  const regions = [{ id: "c01/r01", continent: "c01", survey: "surveyed", adjacent: [] }];
  const instances = Array.from({ length: 12 }, (_, n) => inst(n, "c01/r01"));
  const r = anchorDungeons({ instances, regions, settlements: [{ id: "c01/s01", region: "c01/r01" }],
    lexicon: MINI, manifest: { quotas: { dungeons: { complexes: 10 } } }, stream: S });
  assert.equal(r.anchors.length, MAX_PER_REGION, "the per-region cap was exceeded");
  assert.equal(r.problems.length, 1, "the shortfall must be reported ONCE, not once per missing anchor");
  assert.match(r.problems[0], /only 3 of 10 complexes could be anchored/);
  assert.match(r.problems[0], /12 dungeonCapable instances/);
});

test("anchorDungeons reports a shortfall rather than inventing an anchor", () => {
  const r = anchorDungeons({ instances: [], regions: [], settlements: [], lexicon: MINI,
                             manifest: { quotas: { dungeons: { complexes: 60 } } }, stream: S });
  assert.equal(r.anchors.length, 0);
  assert.equal(r.problems.length, 1);
  assert.ok(/60/.test(r.problems[0]), `no shortfall reported: ${JSON.stringify(r.problems)}`);
});

test("anchorDungeons is deterministic", () => {
  const mk = () => ({
    instances: Array.from({ length: 12 }, (_, n) => inst(n, `c01/r0${(n % 2) + 1}`)),
    regions: [
      { id: "c01/r01", continent: "c01", survey: "surveyed", adjacent: ["c01/r02"] },
      { id: "c01/r02", continent: "c01", survey: "surveyed", adjacent: ["c01/r01"] },
    ],
    settlements: [{ id: "c01/s01", region: "c01/r01", rank: "hub" }],
    lexicon: MINI, manifest: { quotas: { dungeons: { complexes: 5 } } }, stream: S,
  });
  assert.equal(JSON.stringify(anchorDungeons(mk())), JSON.stringify(anchorDungeons(mk())));
});

test("the selection is keyed on the HANDLE, not on the position in instances[]", () => {
  // Seam 4's ruling, made a rule here: a re-ordering upstream must not move a
  // dungeon. Reversing an array of identical-in-every-other-way records picks
  // the same set.
  const regions = [{ id: "c01/r01", continent: "c01", survey: "surveyed", adjacent: [] }];
  const instances = Array.from({ length: 9 }, (_, n) => inst(n, "c01/r01"));
  const opts = { regions, settlements: [{ id: "c01/s01", region: "c01/r01" }], lexicon: MINI,
                 manifest: { quotas: { dungeons: { complexes: 3 } } }, stream: S };
  const a = anchorDungeons({ ...opts, instances });
  const b = anchorDungeons({ ...opts, instances: [...instances].reverse() });
  assert.deepEqual(a.anchors, b.anchors);
  assert.equal(a.anchors.length, 3);
});

test("a different stream picks a different set — the draw is not a constant", () => {
  const regions = [{ id: "c01/r01", continent: "c01", survey: "surveyed", adjacent: [] }];
  const instances = Array.from({ length: 40 }, (_, n) => inst(n, "c01/r01"));
  const opts = { instances, regions, settlements: [{ id: "c01/s01", region: "c01/r01" }],
                 lexicon: MINI, manifest: { quotas: { dungeons: { complexes: 3 } } } };
  const a = anchorDungeons({ ...opts, stream: S });
  const b = anchorDungeons({ ...opts, stream: "0123456789abcdef" });
  assert.notDeepEqual(a.anchors.map((x) => x.handle), b.anchors.map((x) => x.handle));
});
