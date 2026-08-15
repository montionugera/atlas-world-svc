// tools/mapforge/tests/world-gen.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { rng, noiseRing, fitArea, splitAtVertices, validRing, buildWorld } from "../lib/world-gen.mjs";
import { shoelaceArea, placementArea, pointInPolygon } from "../../../scripts/lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const atlasNode = JSON.parse(readFileSync(resolve(ROOT, "content/spine/nodes/n-atlas.json"), "utf8"));

test("rng is deterministic and in [0,1)", () => {
  const a = rng("d9a0051d32afab59"), b = rng("d9a0051d32afab59");
  const sa = [a(), a(), a()], sb = [b(), b(), b()];
  assert.deepEqual(sa, sb);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test("noiseRing produces a valid positive ring fitted to target area", () => {
  // F-045 Task 3: center/meanRadius ÷5, targetArea ÷25 (was [1000,700]/80/22000).
  const ring = fitArea({
    points: noiseRing({ center: [200, 140], meanRadius: 16, vertices: 18, roughness: 0.35, rand: rng("d9a0051d32afab59") }),
    center: [200, 140], targetArea: 880,
  });
  assert.deepEqual(validRing({ points: ring }), []);
  const area = shoelaceArea({ points: ring });
  assert.ok(Math.abs(area - 880) / 880 < 0.02, `area ${area}`);
});

test("splitAtVertices partitions area exactly", () => {
  const ring = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const [a, b] = splitAtVertices({ points: ring, i: 0, j: 2 });
  assert.equal(shoelaceArea({ points: a }) + shoelaceArea({ points: b }), shoelaceArea({ points: ring }));
});

test("buildWorld is deterministic and meets the budget table", () => {
  const w1 = buildWorld({ atlasNode });
  const w2 = buildWorld({ atlasNode });
  assert.deepEqual(w1, w2);
  const land = w1.nodes.filter((n) => n.tier === "continent" && n.terrainKind !== "ice");
  const majors = land.filter((n) => !n.tags.includes("archipelago"));
  const chains = land.filter((n) => n.tags.includes("archipelago"));
  const oceans = w1.nodes.filter((n) => n.tier === "ocean");
  const caps = w1.nodes.filter((n) => n.terrainKind === "ice");
  const regions = w1.nodes.filter((n) => n.tier === "region");
  assert.equal(majors.length, 2);
  assert.ok(chains.length >= 2 && chains.length <= 4);
  assert.ok(oceans.length >= 2 && oceans.length <= 3);
  assert.equal(caps.length, 1);
  for (const m of majors) {
    const kids = regions.filter((r) => r.parentId === m.id);
    assert.ok(kids.length >= 2 && kids.length <= 4, m.id);
    assert.ok(kids.some((r) => r.tags.includes("unsurveyed-interior")), m.id);
  }
  // F-045 Task 3: both bounds ÷25 (area scales with the square of the ÷5
  // linear rescale) — was newLand in (40000, 60000), cap ~80000.
  const newLand = land.reduce((s, n) => s + placementArea({ placement: n.placement }), 0);
  assert.ok(newLand > 1600 && newLand < 2400, `new land ${newLand}`);
  const capArea = placementArea({ placement: caps[0].placement });
  assert.ok(Math.abs(capArea - 3200) / 3200 < 0.05, `cap ${capArea}`);
  for (const n of w1.nodes) {
    assert.equal(n.provenance.authored, "generated");
    assert.deepEqual(n.provenance.generator, { name: "gen-world", version: "1" });
    assert.match(n.seed.value, /^[0-9a-f]{16}$/);
    assert.ok(n.lore.reported === true, n.id);
    if (n.placement.shape === "polygon") assert.deepEqual(validRing({ points: n.placement.points }), [], n.id);
    if (n.placement.shape === "polygon") {
      for (const f of n.features ?? []) {
        if (f.kind === "point") assert.ok(pointInPolygon({ point: f.at, points: n.placement.points }), `${n.id} feature ${f.id} not contained`);
      }
    }
  }
  const seeds = new Set(w1.nodes.map((n) => n.seed.value));
  assert.equal(seeds.size, w1.nodes.length);
  assert.ok(w1.edges.length >= 2 && w1.edges.every((e) => e.kind === "sealane"));
});

// F-045 Task 3: the committed world-tier nodes (content/spine/nodes/*.json
// with parentId n-atlas) are F-043's output as PROMOTED (panel-renamed,
// possibly reordered) then rescaled ÷5/÷25 by Task 1-2's transform — they
// will NOT byte-match a fresh regen at the native 400 frame (see Task 3
// report). What SHOULD hold: the fresh regen's world-tier areas land close
// to the committed ones, because both share the same seed logic and the
// same ÷5 (linear) / ÷25 (area) scale factors. Matched by nearest area
// (not id) since promotion may rename/reorder — geometry is what this task
// rescaled, not naming.
test("regenerated world-tier areas land within 10% of the committed world nodes (F-045 Task 3)", () => {
  const w = buildWorld({ atlasNode });
  const regenAreas = w.nodes
    .filter((n) => n.tier === "continent" || n.tier === "ocean")
    .map((n) => shoelaceArea({ points: n.placement.points }));

  // n-cluster1/n-westsea predate F-043's generator (gen-world.mjs's own
  // PRE_WORLD_ATLAS_CHILDREN) — not something buildWorld ever produces.
  const nodesDir = resolve(ROOT, "content/spine/nodes");
  const committedAreas = readdirSync(nodesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(resolve(nodesDir, f), "utf8")))
    .filter((n) => n.parentId === "n-atlas" && (n.tier === "continent" || n.tier === "ocean"))
    .filter((n) => n.id !== "n-cluster1" && n.id !== "n-westsea")
    .map((n) => placementArea({ placement: n.placement }));

  assert.equal(regenAreas.length, committedAreas.length, "regen vs committed world-tier node count differs");

  const remaining = [...committedAreas];
  for (const area of regenAreas) {
    let bestIdx = -1, bestDiff = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const diff = Math.abs(remaining[i] - area) / remaining[i];
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    assert.ok(bestIdx !== -1 && bestDiff < 0.1, `regen area ${area} has no committed match within 10% (closest diff ${(bestDiff * 100).toFixed(1)}%)`);
    remaining.splice(bestIdx, 1);
  }
});
