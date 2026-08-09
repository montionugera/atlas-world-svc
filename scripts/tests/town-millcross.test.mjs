// F-040 task 4 — the Millcross plan itself.
//
// tests/town-plan.test.mjs proves the SCHEMA is right. This file proves the one
// authored document is right: it validates against that schema, it is walkable
// by the geometry lib rather than by eye, and — the part a machine can still
// check — it says what A1 §6 says about Millcross and does not say anything A1
// §6 contradicts.
//
// The canon pins below are not decoration. The standing lesson from the F-033
// lore pass is that ADDING SPECIFICITY is the fastest way to contradict canon
// (four of six defects came from invented detail), so every claim A1 §6 makes
// flatly — no wall, one tall thing, tents on the east bank, the cart queue seen
// first — is pinned here where an edit that quietly drops it goes red.
//
// ---------------------------------------------------------------------------
// CANON-VS-INVENTED LEDGER for task 9's table. 30 ids in the plan; an id absent
// from all four buckets is the defect that table exists to catch.
//
// A. ID TAKEN VERBATIM FROM CANON (4) — cluster1-geography.json / A1 §3.1:
//    the-meltwash · trade-road-trunk · terrace-track · river-road-south
//    (plus town "millcross", anchor [86, 118], and the fact that those three
//    roads share the ford point — all read straight out of the geography file.)
//
// B. CANON THING, INVENTED ID STRING (15) — A1 §6 names the thing, not the id:
//    the-race, mill-house, mill-wheel ("one tall thing, the mill-wheel housing
//    over the race") · cart-queue ("First thing a traveller sees: the cart
//    queue") · the-ford (§3.1 "fordable ... in exactly one by cart") ·
//    cart-yard (the queue that "starts before the town does"; the cart yard is
//    design §6's derivation) · ford-stable ("stabling") · victual-shed
//    ("feeding whoever is waiting") · ferry-shed ("ferrying at high water") ·
//    tent-row-a..f ("the tents have grown plank walls and doorframes", east
//    bank).
//
// C. WHOLLY INVENTED, DESIGN-OPEN (11) — no canon referent:
//    mill-lane · bank-lane · tent-lane-north · tent-lane-south ·
//    west-row-a · west-row-b · ford-store · terrace-row-a..d
//
// D. INVENTED NUMBERS — canon carries no geometry at all, so EVERY coordinate,
//    rect, polygon and width in the file is authored:
//    · extent 220 x 160 (design D1's ~200 across, inside the 150-260 band)
//    · road widths 14/14/12/12 cart and 6/6/6 foot (the FLOORS are design §3;
//      the values above them are chosen)
//    · counts: 2 water bodies, 7 roads, 17 footprints, 1 plaza, 3 landmarks
//    · storeys: 1 stated explicitly on the 16 non-mill masses (A1 §6 says
//      "everything else a single storey"; writing the field down is authoring)
//    · the river runs NORTH-SOUTH through the middle. Derived, not free: the
//      Meltwash runs north-south past [86, 118] in cluster1-geography.json, and
//      A1 §6's "east bank" only exists if it does. The design §2 EXAMPLE draws
//      the band horizontally, but that example illustrates schema shape — a
//      horizontal river would leave Millcross with no east bank for the
//      refugee quarter to stand on.
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

import {
  roadPolygon,
  polyRectOverlap,
  rectsOverlap,
  pointInPoly,
  walkableGrid,
  floodFillRegions,
  cellIndexAt,
} from "../lib/town-geometry.mjs";

// Same ESM/CJS interop guard as scripts/lib/story.mjs:11 — `ajv` is CJS, so
// under ESM the constructor may arrive as the module namespace's `.default`.
const AjvClass = Ajv.default ?? Ajv;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCHEMA_PATH = join(ROOT, "content/schemas/town-plan.schema.json");
const PLAN_PATH = join(ROOT, "content/towns/town-millcross.json");
const GEOGRAPHY_PATH = join(ROOT, "content/maps/cluster1-geography.json");

const PLAN = JSON.parse(readFileSync(PLAN_PATH, "utf8"));

// The scale contract, design §3 — derived from measured radii, not taste.
// Largest mob radius 5 → diameter 10 plus clearance; player radius 1.3 →
// diameter 2.6 plus clearance.
const WIDTH_FLOOR = { cart: 12, foot: 4 };

// How close a footprint must come to the road it opens onto to count as
// TOUCHING it. Every entrance in this plan is authored flush against the road's
// swept edge (gap 0), so this is slack for floating-point, not a licence to
// float a building near a road.
const TOUCH_TOLERANCE = 0.25;

function grow(rect, d) {
  const [ax, ay, bx, by] = rect;
  return [
    Math.min(ax, bx) - d,
    Math.min(ay, by) - d,
    Math.max(ax, bx) + d,
    Math.max(ay, by) + d,
  ];
}

function roadQuads() {
  return new Map(PLAN.roads.map((r) => [r.id, roadPolygon(r.points, r.width)]));
}

function footprint(id) {
  const f = PLAN.footprints.find((x) => x.id === id);
  assert.ok(f, `no footprint ${id}`);
  return f;
}

function water(id) {
  const w = (PLAN.water ?? []).find((x) => x.id === id);
  assert.ok(w, `no water ${id}`);
  return w;
}

// ---------------------------------------------------------------------------
// The four assertions this task exists to make.
// ---------------------------------------------------------------------------

test("the plan validates against town-plan.schema.json", () => {
  const validate = new AjvClass({ allErrors: true }).compile(
    JSON.parse(readFileSync(SCHEMA_PATH, "utf8"))
  );
  const ok = validate(PLAN);
  assert.equal(ok, true, JSON.stringify(validate.errors, null, 2));
});

test("the walkable area is exactly ONE connected region", () => {
  const grid = walkableGrid(PLAN);
  const regions = floodFillRegions(grid);
  assert.equal(
    regions.count,
    1,
    `expected one region, got ${regions.count} of sizes ${regions.sizes.join(", ")}`
  );
  // A single region that is a sliver would satisfy the count and nothing else:
  // pin that most of the town is actually open ground.
  assert.ok(
    regions.sizes[0] > 0.5 * grid.cols * grid.rows,
    `the one region covers only ${regions.sizes[0]} of ${grid.cols * grid.rows} cells`
  );
});

test("ZERO footprints overlap any road's swept area", () => {
  const quads = roadQuads();
  const hits = [];
  for (const f of PLAN.footprints) {
    for (const [roadId, road] of quads) {
      if (road.some((q) => polyRectOverlap(q, f.rect))) hits.push(`${f.id} x ${roadId}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("no two footprints overlap each other", () => {
  const hits = [];
  for (let i = 0; i < PLAN.footprints.length; i++) {
    for (let j = i + 1; j < PLAN.footprints.length; j++) {
      const a = PLAN.footprints[i];
      const b = PLAN.footprints[j];
      if (rectsOverlap(a.rect, b.rect)) hits.push(`${a.id} x ${b.id}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("exactly ONE firstSight landmark, and it is the cart queue", () => {
  const first = PLAN.landmarks.filter((l) => l.firstSight === true);
  assert.equal(first.length, 1);
  // A1 §6: "First thing a traveller sees: the cart queue. It starts before the
  // town does, sometimes a mile out."
  assert.equal(first[0].id, "cart-queue");
  // ...so it stands out on the approach road, not buried in the middle.
  assert.ok(
    first[0].at[0] < PLAN.extent.width * 0.25,
    `the cart queue at ${first[0].at} is not out on the approach`
  );
});

test("the firstSight landmark stands in the walkable region", () => {
  const grid = walkableGrid(PLAN);
  const regions = floodFillRegions(grid);
  const first = PLAN.landmarks.find((l) => l.firstSight === true);
  const idx = cellIndexAt(grid, first.at);
  assert.notEqual(idx, -1, "the firstSight landmark falls outside the extent");
  assert.equal(grid.walkable[idx], 1, "the firstSight landmark stands inside a building");
  assert.equal(regions.labels[idx], 0, "the firstSight landmark is cut off from the town");
});

test("every cart road clears 12 units and every foot road clears 4", () => {
  assert.ok(PLAN.roads.some((r) => r.kind === "cart"));
  assert.ok(PLAN.roads.some((r) => r.kind === "foot"));
  for (const r of PLAN.roads) {
    assert.ok(
      r.width >= WIDTH_FLOOR[r.kind],
      `${r.id} is ${r.kind} at width ${r.width}, floor ${WIDTH_FLOOR[r.kind]}`
    );
  }
});

// ---------------------------------------------------------------------------
// The plan holds together on its own terms.
// ---------------------------------------------------------------------------

test("every entranceOn names a real road and the footprint touches it", () => {
  const quads = roadQuads();
  for (const f of PLAN.footprints) {
    if (f.entranceOn === undefined) continue;
    const road = quads.get(f.entranceOn);
    assert.ok(road, `${f.id} opens onto unknown road ${f.entranceOn}`);
    const touching = road.some((q) => polyRectOverlap(q, grow(f.rect, TOUCH_TOLERANCE)));
    assert.ok(touching, `${f.id} does not reach ${f.entranceOn}`);
  }
});

test("every footprint sits inside the extent and clears the 6-unit short side", () => {
  for (const f of PLAN.footprints) {
    const [x0, y0, x1, y1] = f.rect;
    assert.ok(Math.min(x0, x1) >= 0 && Math.max(x0, x1) <= PLAN.extent.width, `${f.id} x`);
    assert.ok(Math.min(y0, y1) >= 0 && Math.max(y0, y1) <= PLAN.extent.height, `${f.id} y`);
    const shortest = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0));
    assert.ok(shortest >= 6, `${f.id} is ${shortest} on its shorter side`);
  }
});

test("the extent is the ten-second crossing, 150-260 on both axes", () => {
  assert.deepEqual(PLAN.extent, { width: 220, height: 160 });
  for (const v of [PLAN.extent.width, PLAN.extent.height]) {
    assert.ok(v >= 150 && v <= 260, `extent axis ${v} is outside 150-260`);
  }
});

test("the anchor is Millcross's own `at` in cluster1-geography.json", () => {
  const geography = JSON.parse(readFileSync(GEOGRAPHY_PATH, "utf8"));
  const town = geography.towns.find((t) => t.id === PLAN.town);
  assert.ok(town, `${PLAN.town} is not a town in cluster1-geography.json`);
  assert.deepEqual(PLAN.anchor.geographyAt, town.at);
});

// ---------------------------------------------------------------------------
// Canon pins — A1 §6 (and §3.1 for the ford). Each one quotes what it enforces.
// ---------------------------------------------------------------------------

test("A1 §6: 'no wall and no plan' — no wall, and no gate footprint", () => {
  for (const f of PLAN.footprints) {
    assert.notEqual(f.kind, "gate", `${f.id} is a gate; Millcross has none`);
    assert.ok(!/wall|palisade|gate/i.test(f.id), `${f.id} names a wall or gate`);
  }
});

test("A1 §6: 'one tall thing, the mill-wheel housing over the race'", () => {
  const tall = PLAN.footprints.filter((f) => (f.storeys ?? 1) > 1);
  assert.equal(tall.length, 1, `expected one tall mass, got ${tall.map((f) => f.id).join(", ")}`);
  assert.equal(tall[0].id, "mill-house");
  assert.equal(tall[0].kind, "mill");
  assert.equal(tall[0].storeys, 2);
  // "over the race" is geometry, not a label: the mass must actually stand on it.
  assert.ok(
    polyRectOverlap(water("the-race").poly, tall[0].rect),
    "the mill does not stand over the race"
  );
  // "everything else a single storey of grey plank and patched canvas"
  for (const f of PLAN.footprints) {
    if (f.id === "mill-house") continue;
    assert.equal(f.storeys, 1, `${f.id} is not single storey`);
  }
});

test("A1 §6: the tents that grew plank walls are on the EAST bank", () => {
  const river = water("the-meltwash");
  const eastOfRiver = Math.max(...river.poly.map(([x]) => x));
  const tents = PLAN.footprints.filter((f) => f.kind === "tent");
  assert.ok(tents.length > 0, "the plank-and-tent quarter is missing");
  for (const t of tents) {
    assert.ok(
      Math.min(t.rect[0], t.rect[2]) > eastOfRiver,
      `${t.id} is not on the east bank (river reaches x=${eastOfRiver})`
    );
  }
});

test("A1 §3.1: the ford is where the roads cross the Meltwash", () => {
  // Three roads share the ford, exactly as cluster1-geography.json has three
  // sharing Millcross's `at`.
  const converging = ["trade-road-trunk", "terrace-track", "river-road-south"].map((id) => {
    const road = PLAN.roads.find((r) => r.id === id);
    assert.ok(road, `the plan drops the canon road ${id}`);
    return road.points[0];
  });
  for (const p of converging) assert.deepEqual(p, converging[0]);

  const ford = PLAN.landmarks.find((l) => l.id === "the-ford");
  assert.ok(ford, "no ford landmark");
  assert.deepEqual(ford.at, converging[0]);
  // "fordable ... in exactly one [place] by cart — that place is Millcross":
  // the crossing point is IN the river, so the roads meeting there cross it.
  assert.ok(pointInPoly(ford.at, water("the-meltwash").poly), "the ford is not in the river");
});

test("A1 §6: the roads ribbon-sprawl off the plan rather than ending in a core", () => {
  const { width, height } = PLAN.extent;
  const onEdge = ([x, y]) => x === 0 || y === 0 || x === width || y === height;
  for (const id of ["trade-road-trunk", "terrace-track", "river-road-south"]) {
    const road = PLAN.roads.find((r) => r.id === id);
    assert.ok(
      onEdge(road.points[road.points.length - 1]),
      `${id} stops inside the plan instead of spilling off it`
    );
  }
});
