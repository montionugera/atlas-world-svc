import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { surveyOf, loadFabricRegionIndex, fabricRegionCountsFor } from "../lib/survey.mjs";
import { checkSpineComplete, TRUNK_TIERS, WATER_TIERS, DEPTH_EXCEPTIONS } from "../lib/spine.mjs";

// A minimal tree double: checkSpineComplete only reads byId and childrenOf.
function treeOf(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map(nodes.map((n) => [n.id, []]));
  for (const n of nodes) if (n.parentId) childrenOf.get(n.parentId).push(n.id);
  return { byId, childrenOf };
}
const node = (id, tier, extra = {}) =>
  ({ id, tier, parentId: null, lore: {}, provenance: { generator: null }, ...extra });

test("surveyOf prefers the field, falls back to lore.reported, defaults surveyed", () => {
  assert.equal(surveyOf({ node: node("a", "region", { survey: "reported" }) }), "reported");
  assert.equal(surveyOf({ node: node("b", "region", { lore: { reported: true } }) }), "reported");
  assert.equal(surveyOf({ node: node("c", "region") }), "surveyed");
  // The field WINS over a stale lore flag — one source of truth after migration.
  assert.equal(
    surveyOf({ node: node("d", "region", { survey: "surveyed", lore: { reported: true } }) }),
    "surveyed");
});

test("TRUNK_TIERS gains ocean and sea; WATER_TIERS is exactly those two", () => {
  assert.deepEqual([...TRUNK_TIERS].sort(),
    ["continent", "ocean", "playroot", "playspace", "sea", "world"]);
  assert.deepEqual([...WATER_TIERS].sort(), ["ocean", "sea"]);
});

test("DEPTH_EXCEPTIONS gains continent>town for the town-plan host (E-C4)", () => {
  assert.deepEqual([...DEPTH_EXCEPTIONS].sort(), ["continent>town", "playspace>site"]);
});

test("a childless ocean or sea is complete — water has no surveyed interior (E-C2)", () => {
  const tree = treeOf([node("n-w", "world"), node("n-o", "ocean", { parentId: "n-w" }),
                       node("n-s", "sea", { parentId: "n-o" })]);
  const { errors, warns } = checkSpineComplete({ tree });
  assert.deepEqual(errors.filter((e) => /n-o|n-s/.test(e)), []);
  assert.deepEqual(warns.filter((w) => /n-o|n-s/.test(w)), []);
});

test("a childless continent FAILs without a fabric pin and passes with one (E-C3)", () => {
  const bare = treeOf([node("n-w", "world"), node("n-c", "continent", { parentId: "n-w" })]);
  assert.equal(checkSpineComplete({ tree: bare }).errors.filter((e) => /n-c/.test(e)).length, 1);
  const counts = new Map([["n-c", 8]]);
  assert.deepEqual(
    checkSpineComplete({ tree: bare, fabricRegionCounts: counts }).errors.filter((e) => /n-c/.test(e)),
    []);
});

test("a childless REPORTED trunk node is a warning, not a failure", () => {
  const tree = treeOf([node("n-w", "world"),
                       node("n-c", "continent", { parentId: "n-w", survey: "reported" })]);
  const { errors, warns } = checkSpineComplete({ tree });
  assert.deepEqual(errors.filter((e) => /n-c/.test(e)), []);
  assert.equal(warns.filter((w) => /n-c/.test(w)).length, 1);
  assert.match(warns.find((w) => /n-c/.test(w)), /reported, not surveyed/);
});

test("loadFabricRegionIndex counts regions per fabric file and reads their survey", () => {
  const root = mkdtempSync(join(tmpdir(), "fab-"));
  mkdirSync(join(root, "world/fabric"), { recursive: true });
  writeFileSync(join(root, "world/fabric/continent-02.json"), JSON.stringify({
    continent: "c02",
    regions: [{ id: "c02/r01", survey: "surveyed" }, { id: "c02/r02", survey: "reported" }],
  }));
  const idx = loadFabricRegionIndex({ contentRoot: root });
  assert.deepEqual(idx.problems, []);
  assert.equal(idx.byRegionId.get("c02/r01").survey, "surveyed");
  assert.equal(idx.countByFabricPath.get("content/world/fabric/continent-02.json"), 2);

  // n-cluster1, not n-wealdmarch: the c02 continent node keeps its live id
  // (Plan C manifest.landmasses[].nodeId, pinned by Plan C Task 10's
  // "every continent node id comes from manifest.landmasses[].nodeId").
  const counts = fabricRegionCountsFor({
    nodes: [{ id: "n-cluster1",
              provenance: { generator: { fabric: "content/world/fabric/continent-02.json" } } }],
    index: idx });
  assert.equal(counts.get("n-cluster1"), 2);
});

test("loadFabricRegionIndex soft-skips a content root with no fabric dir", () => {
  const root = mkdtempSync(join(tmpdir(), "fab-none-"));
  const idx = loadFabricRegionIndex({ contentRoot: root });
  assert.deepEqual(idx.problems, []);
  assert.equal(idx.byRegionId.size, 0);
});

test("loadFabricRegionIndex reports unreadable, shape-invalid and duplicate fabric docs in-band", () => {
  const root = mkdtempSync(join(tmpdir(), "fab-bad-"));
  mkdirSync(join(root, "world/fabric"), { recursive: true });
  writeFileSync(join(root, "world/fabric/continent-00.json"), "{ not json");
  writeFileSync(join(root, "world/fabric/continent-01.json"), JSON.stringify({ continent: "c01" }));
  writeFileSync(join(root, "world/fabric/continent-02.json"), JSON.stringify({
    continent: "c02",
    regions: [{ id: "dup/r01", survey: "surveyed" }, { id: "dup/r01", survey: "reported" }],
  }));
  const idx = loadFabricRegionIndex({ contentRoot: root });
  assert.match(idx.problems.find((p) => /continent-00/.test(p)), /is unreadable/);
  assert.match(idx.problems.find((p) => /continent-01/.test(p)), /shape-invalid/);
  assert.match(idx.problems.find((p) => /"dup\/r01"/.test(p)), /declared twice/);
});
