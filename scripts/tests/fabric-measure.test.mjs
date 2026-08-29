import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measureOverWholeFabric, FABRIC_BLIND_SPOTS } from "../lib/fabric-measure.mjs";

function writeContinent(root, file, doc) {
  mkdirSync(join(root, "world/fabric"), { recursive: true });
  writeFileSync(join(root, "world/fabric", file), JSON.stringify(doc));
}

// Two continents: c01 has 2 regions (one surveyed, one reported) so "world"
// population proves it does NOT silently drop reported ground. c02 has 2
// regions and one road that geometrically threads through only one of them.
function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "fabric-measure-"));
  writeContinent(root, "continent-01.json", {
    continent: "c01",
    regions: [
      { id: "c01/r01", survey: "surveyed", areaKm2: 10, biomeShares: { bramble: 5 } },
      { id: "c01/r02", survey: "reported", areaKm2: 20, biomeShares: { bramble: 90 } },
    ],
    roads: [],
  });
  writeContinent(root, "continent-02.json", {
    continent: "c02",
    regions: [
      // A unit square [0,0]-[10,10] — the road's point (5,5) lies inside it.
      { id: "c02/r01", survey: "surveyed", areaKm2: 100,
        rings: [[[0, 0], [10, 0], [10, 10], [0, 10]]] },
      // A disjoint square far away — no road point falls inside it.
      { id: "c02/r02", survey: "reported", areaKm2: 50,
        rings: [[[100, 100], [110, 100], [110, 110], [100, 110]]] },
    ],
    roads: [
      { id: "c02/rdA", continent: "c02", from: "x", to: "y",
        points: [[1, 1], [5, 5], [9, 9]] },
    ],
  });
  return root;
}

test("population 'world' includes REPORTED regions too — never a survey-filtered set", () => {
  const contentRoot = fixtureRoot();
  const result = measureOverWholeFabric({ contentRoot, measure: "biomeShares.bramble", population: "world" });
  // 2 regions in c01 + 2 in c02 = 4, regardless of survey status.
  assert.equal(result.regionCount, 4);
  assert.ok(result.ranked.some((r) => r.region === "c01/r02"),
    "the REPORTED region must be present in a 'world' population");
  assert.equal(result.top.region, "c01/r02");
  assert.equal(result.top.value, 90);
});

test("population 'landmass:cNN' scopes to exactly that continent's regions", () => {
  const contentRoot = fixtureRoot();
  const result = measureOverWholeFabric({ contentRoot, measure: "areaKm2", population: "landmass:c01" });
  assert.equal(result.regionCount, 2);
  assert.deepEqual(result.ranked.map((r) => r.region).sort(), ["c01/r01", "c01/r02"]);
});

test("population 'road:<id>' resolves to the fabric regions the road's points actually fall inside", () => {
  const contentRoot = fixtureRoot();
  const result = measureOverWholeFabric({ contentRoot, measure: "areaKm2", population: "road:c02/rdA" });
  assert.equal(result.regionCount, 1, "only the region the road's points fall inside should be counted");
  assert.equal(result.top.region, "c02/r01");
});

test("an unknown road id is reported as a problem, not silently empty-and-quiet", () => {
  const contentRoot = fixtureRoot();
  const result = measureOverWholeFabric({ contentRoot, measure: "areaKm2", population: "road:does-not-exist" });
  assert.equal(result.regionCount, 0);
  assert.match(result.problems.join("\n"), /names no road loadFabricRegionIndex found/);
});

test("MUTATION PROOF: population has no shape a survey filter could ride in on", () => {
  const contentRoot = fixtureRoot();
  for (const bad of ["surveyed", "reported", "world:surveyed", "landmass:c01:surveyed", ""]) {
    const result = measureOverWholeFabric({ contentRoot, measure: "areaKm2", population: bad });
    assert.equal(result.regionCount, 0, `population "${bad}" must not resolve to any regions`);
    assert.match(result.problems.join("\n"), /is not one of "world" \| "landmass:cNN" \| "road:<id>"/);
  }
});

test("measure accepts a function as well as a dotted path", () => {
  const contentRoot = fixtureRoot();
  const result = measureOverWholeFabric({
    contentRoot, population: "landmass:c01",
    measure: (r) => r.areaKm2 * 2,
  });
  assert.deepEqual(result.ranked.map((r) => r.value).sort((a, b) => a - b), [20, 40]);
});

test("regions missing the measured field are excluded from ranking but VISIBLY, via unmeasured + a problem", () => {
  const contentRoot = fixtureRoot();
  // c02's regions carry no biomeShares at all in this fixture.
  const result = measureOverWholeFabric({ contentRoot, measure: "biomeShares.bramble", population: "landmass:c02" });
  assert.equal(result.regionCount, 2);
  assert.deepEqual(result.ranked, []);
  assert.equal(result.top, null);
  // F1 fix (review round 1): the gap between regionCount and ranked.length
  // must be a named number and a named problem, not something a caller has
  // to notice by subtracting themselves.
  assert.equal(result.unmeasured, 2);
  assert.match(result.problems.join("\n"),
    /2 of 2 region\(s\) in population "landmass:c02" had no finite numeric value/);
});

test("F1 REGRESSION (review round 1) — the reviewer's exact probe: a function measure " +
  "encoding a survey filter no longer reports a clean whole-corpus result", () => {
  const contentRoot = new URL("../../content", import.meta.url).pathname;
  const result = measureOverWholeFabric({
    contentRoot,
    measure: (r) => (r.survey === "surveyed" ? 1 : NaN),
    population: "world",
  });
  // Before the fix this returned regionCount:160, ranked.length:40,
  // problems:[] — a whole-corpus claim silently answered by 40 regions.
  assert.equal(result.regionCount, 160);
  assert.equal(result.ranked.length, 40);
  assert.equal(result.unmeasured, 120, "the 120 dropped (reported) regions must be counted");
  assert.match(result.problems.join("\n"),
    /120 of 160 region\(s\) in population "world" had no finite numeric value/,
    "the drop must be named in problems, not just inferable from regionCount - ranked.length");
});

test("every result carries the fabric-blind-spot caveat, naming the measured lava-tube count", () => {
  const contentRoot = fixtureRoot();
  const result = measureOverWholeFabric({ contentRoot, measure: "areaKm2", population: "world" });
  assert.equal(result.fabricOnly, FABRIC_BLIND_SPOTS);
  assert.ok(FABRIC_BLIND_SPOTS.some((s) => /9 lava-tube/.test(s)));
});

test("reproduces the known case: Withybar's bramble on the LIVE fabric at this commit", () => {
  const contentRoot = new URL("../../content", import.meta.url).pathname;
  const result = measureOverWholeFabric({
    contentRoot, measure: "biomeShares.bramble", population: "landmass:c08",
  });
  assert.deepEqual(result.problems, []);
  assert.equal(result.regionCount, 8, "Wracklow (c08) must carry exactly 8 regions");
  assert.equal(result.top.region, "c08/r08");
  assert.equal(result.top.value, 43.9);
});
