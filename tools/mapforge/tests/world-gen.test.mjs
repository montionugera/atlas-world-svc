// tools/mapforge/tests/world-gen.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { rng, noiseRing, fitArea, splitAtVertices, validRing, buildWorld } from "../lib/world-gen.mjs";
import { shoelaceArea, placementArea } from "../../../scripts/lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const atlasNode = JSON.parse(readFileSync(resolve(ROOT, "content/spine/nodes/n-atlas.json"), "utf8"));

test("rng is deterministic and in [0,1)", () => {
  const a = rng("d9a0051d32afab59"), b = rng("d9a0051d32afab59");
  const sa = [a(), a(), a()], sb = [b(), b(), b()];
  assert.deepEqual(sa, sb);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test("noiseRing produces a valid positive ring fitted to target area", () => {
  const ring = fitArea({
    points: noiseRing({ center: [1000, 700], meanRadius: 80, vertices: 18, roughness: 0.35, rand: rng("d9a0051d32afab59") }),
    center: [1000, 700], targetArea: 22000,
  });
  assert.deepEqual(validRing({ points: ring }), []);
  const area = shoelaceArea({ points: ring });
  assert.ok(Math.abs(area - 22000) / 22000 < 0.02, `area ${area}`);
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
  const newLand = land.reduce((s, n) => s + placementArea({ placement: n.placement }), 0);
  assert.ok(newLand > 40000 && newLand < 60000, `new land ${newLand}`);
  const capArea = placementArea({ placement: caps[0].placement });
  assert.ok(Math.abs(capArea - 80000) / 80000 < 0.05, `cap ${capArea}`);
  for (const n of w1.nodes) {
    assert.equal(n.provenance.authored, "generated");
    assert.deepEqual(n.provenance.generator, { name: "gen-world", version: 1 });
    assert.match(n.seed.value, /^[0-9a-f]{16}$/);
    assert.ok(n.lore.reported === true, n.id);
    if (n.placement.shape === "polygon") assert.deepEqual(validRing({ points: n.placement.points }), [], n.id);
  }
  const seeds = new Set(w1.nodes.map((n) => n.seed.value));
  assert.equal(seeds.size, w1.nodes.length);
  assert.ok(w1.edges.length >= 2 && w1.edges.every((e) => e.kind === "sealane"));
});
