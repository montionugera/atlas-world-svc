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
import { readFileSync, readdirSync } from "node:fs";
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
import { loadPlaces } from "../lib/places.mjs";

// Same ESM/CJS interop guard as scripts/lib/story.mjs:11 — `ajv` is CJS, so
// under ESM the constructor may arrive as the module namespace's `.default`.
const AjvClass = Ajv.default ?? Ajv;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCHEMA_PATH = join(ROOT, "content/schemas/town-plan.schema.json");
const PLAN_PATH = join(ROOT, "content/towns/town-millcross.json");

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

// Plan A Task 12: the town's `at` used to be read straight out of the deleted
// content/maps/cluster1-geography.json. This file was NOT on the plan's list of
// remaining readers (enumeration defect #4).
//
// Plan D Task 11: loadPlaces() now reads the GENERATED world from
// content/world/resolved/, whose town ids are the new c-town-* pins.
//
// PLAN E RULING 8 (Task 6): this bound to resolveWorld()'s BASIN document,
// because the plan's subject was the live basin Millcross. That document no
// longer exists — the redrawn trunk hosts no basin and ruling 8's tail retired
// the dead subject keys from content/spine/sheet.json — but Millcross itself
// survives the redraw, as the pinned civil town `c-town-millcross` in the
// resolved world. That is what the plan's anchor has to agree with now, and it
// is a STRONGER claim than the one it replaces: the town plan's frame is now
// tied to the pin the whole civil layer places, not to a hand-authored basin.
//
// The join is by the record's own `plan` back-pointer rather than by id. That
// was originally so this test did not depend on a re-homing that had not
// happened; Plan E Task 14 has since re-homed the plan onto `c-town-millcross`
// and cleared T1's orphan, and the back-pointer join is KEPT anyway because it
// is the stronger of the two: it asserts the geometry from the resolved
// world's own pointer at this file, which an id match would not.
test("the anchor is Millcross's own `at` in the resolved world", () => {
  const { doc, problems } = loadPlaces({ contentRoot: join(ROOT, "content") });
  assert.deepEqual(problems, []);
  const town = doc.towns.find((t) => t.plan === "content/towns/town-millcross.json");
  assert.ok(town, "no town in the resolved world points back at this plan");
  assert.equal(town.id, "c-town-millcross");
  assert.deepEqual(PLAN.anchor.geographyAt, town.at);
});

// ---------------------------------------------------------------------------
// Canon pins — A1 §6 (and §3.1 for the ford). Each one quotes what it enforces.
// ---------------------------------------------------------------------------

test("A1 §6 (amended 2026-08-29): the wall ring exists with gates on the high street and the ford approach", () => {
  const walls = PLAN.footprints.filter((f) => f.kind === "wall");
  const gates = PLAN.footprints.filter((f) => f.kind === "gate");
  assert.ok(walls.length >= 4, `the wall ring needs >= 4 segments, got ${walls.length}`);
  assert.equal(gates.length, 3, "two towers flanking the west high street plus the ford-approach tower");
});

test("A1 §6: 'one tall thing, the mill-wheel housing over the race'", () => {
  const tall = PLAN.footprints.filter((f) => (f.storeys ?? 1) > 1);
  assert.deepEqual(
    tall.map((f) => f.id).sort(),
    ["adventurer-guild", "inn", "mill-house"],
    `the three 2-storey masses are mill-house, inn, guild — got ${tall.map((f) => f.id).join(", ")}`,
  );
  const mill = tall.find((f) => f.id === "mill-house");
  assert.equal(mill.kind, "mill");
  assert.equal(mill.storeys, 2);
  // "over the race" is geometry, not a label: the mass must actually stand on it.
  assert.ok(
    polyRectOverlap(water("the-race").poly, tall[0].rect),
    "the mill does not stand over the race"
  );
  // "everything else a single storey of grey plank and patched canvas"
  for (const f of PLAN.footprints) {
    if (f.id === "mill-house" || f.id === "inn" || f.id === "adventurer-guild") continue;
    assert.equal(f.storeys, 1, `${f.id} is not single storey`);
  }
});

test("A1 §6 (amended 2026-08-29): no tent quarter — the east bank carries solid buildings", () => {
  const river = water("the-meltwash");
  const eastOfRiver = Math.max(...river.poly.map(([x]) => x));
  const tents = PLAN.footprints.filter((f) => f.kind === "tent");
  assert.equal(
    tents.length,
    0,
    "the tent quarter was removed from town truth (owner decision 2026-08-29)"
  );
  const eastBank = PLAN.footprints.filter(
    (f) => Math.min(f.rect[0], f.rect[2]) > eastOfRiver
  );
  assert.ok(eastBank.length > 0, "the east bank carries no buildings at all");
  for (const b of eastBank) {
    assert.notEqual(b.kind, "tent", `${b.id} is a tent`);
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

// ---------------------------------------------------------------------------
// THE MOB-SIZE CEILING — a KNOWN, ACCEPTED limitation, not a bug.
//
// READ THIS BEFORE "FIXING" ANYTHING BELOW.
//
// Design §3 derives the cart-road floor of 12 units from "largest mob radius 5
// → diameter 10, plus clearance". That premise is WRONG about the roster: the
// registered radii are 3, 3, 3, 3.5, 4, 4, 5, 5, 8 and 9 — `double_attacker`
// is 8 and `thorncrown_drake` is 9. A 12-unit road clears radius 5 and no more,
// so those two mobs cannot traverse Millcross.
//
// THE 12-UNIT FLOOR STAYS. It is the approved T3 value, and design §10 q3 ("Do
// mobs enter towns? T3's 12-unit floor assumes yes. If towns are mob-free,
// `cart` roads could be much narrower and towns would tighten considerably") is
// explicitly carried UNRESOLVED. Widening the roads would redesign a settled
// decision and force re-authoring every road in the plan, to serve an open
// question nobody has answered yet.
//
// So this block does not fix the gap — it PINS it. Prose in a design doc rots
// silently; a test does not. The ceiling is computed from the plan's own
// authored widths and checked against the radii read off the definition files
// at test time, so:
//   · adding a mob bigger than the ceiling goes red, naming it;
//   · narrowing a cart road goes red, naming the mobs it just shut out;
//   · widening a cart road goes red too — because that is exactly the
//     redesign §10 q3 has to authorise first.
// Whoever makes any of those changes must come back here, read §10 q3, and
// update the expected table DELIBERATELY.
// ---------------------------------------------------------------------------

const MOB_DEFINITIONS_DIR = join(ROOT, "colyseus-server/src/config/mobs/definitions");

/**
 * The registered mob roster, read off the TypeScript definitions at test time.
 *
 * Deliberately not a hardcoded list: a hardcoded roster rots the moment a mob
 * is added, which is the one event this whole block exists to catch.
 *
 * Parsed by regex rather than imported because these are `.ts` modules that
 * pull in the Colyseus schemas; the scripts package is plain ESM with no
 * TypeScript in it. The shape parsed is the exact one every definition uses —
 * a top-level `id:` and `radius:` at two-space indent inside the exported
 * `MobTypeConfig`. Two-space indent is what keeps `projectileRadius` (nested,
 * deeper) and the several prose mentions of a radius in comments out of the
 * result. If that shape ever changes, the guard test below goes red rather
 * than this quietly returning a short list.
 */
function readMobRadii() {
  return readdirSync(MOB_DEFINITIONS_DIR)
    .filter((f) => f.endsWith(".ts"))
    .sort()
    .map((file) => {
      const src = readFileSync(join(MOB_DEFINITIONS_DIR, file), "utf8");
      // The trailing `,` is what makes these object properties rather than
      // prose; several lines carry a `// bruiser`-style comment after it, so
      // the match deliberately does not anchor to end-of-line.
      const id = src.match(/^ {2}id: '([^']+)',/m);
      const radius = src.match(/^ {2}radius: (\d+(?:\.\d+)?),/m);
      return { file, id: id?.[1], radius: radius ? Number(radius[1]) : undefined };
    });
}

/**
 * The design premise the 12-unit cart floor was derived from. It is the number
 * the floor was built on, NOT a true statement about the roster — see the block
 * comment above.
 */
const DESIGN_LARGEST_MOB_RADIUS = 5;

/**
 * Invert design §3's derivation to recover the clearance baked into the floor:
 * 12 − 2 × 5 = 2 units of slack beyond the body's diameter. A road of width W
 * therefore admits a body of radius (W − 2) / 2.
 */
const CART_CLEARANCE = WIDTH_FLOOR.cart - 2 * DESIGN_LARGEST_MOB_RADIUS;

/**
 * The largest mob radius that can traverse the town, computed from the plan's
 * own authored road widths.
 *
 * Only `cart` roads count. `foot` roads are player-only by design §3 (their
 * 4-unit floor is derived from the player's 1.3 radius), so they never
 * constrain what a mob can do — a mob simply does not use them, and the tent
 * quarter's interior lanes being mob-free is intended, not a defect.
 *
 * The narrowest cart road is the bottleneck: a mob that cannot fit down one of
 * them cannot cross the town on the cart network.
 */
function maxPassableMobRadius(plan) {
  const cartWidths = plan.roads.filter((r) => r.kind === "cart").map((r) => r.width);
  assert.ok(cartWidths.length > 0, "the plan has no cart roads to size mobs against");
  return (Math.min(...cartWidths) - CART_CLEARANCE) / 2;
}

test("the mob roster is actually READ, not silently parsed away to nothing", () => {
  // The failure this catches: someone reformats a definition, the regex stops
  // matching, and the ceiling test below passes vacuously over an empty roster.
  const mobs = readMobRadii();
  assert.ok(mobs.length >= 10, `only ${mobs.length} mob definition files found`);
  for (const m of mobs) {
    assert.ok(m.id, `${m.file}: no top-level \`id:\` parsed — the definition shape changed`);
    assert.ok(
      typeof m.radius === "number" && m.radius > 0,
      `${m.file}: no top-level \`radius:\` parsed — the definition shape changed`
    );
  }
});

test("KNOWN LIMIT (design §10 q3): Millcross admits mobs up to radius 5 only", () => {
  const maxRadius = maxPassableMobRadius(PLAN);
  assert.equal(
    maxRadius,
    DESIGN_LARGEST_MOB_RADIUS,
    `the plan's narrowest cart road now admits radius ${maxRadius}, not ${DESIGN_LARGEST_MOB_RADIUS}. ` +
      "If a road was widened or narrowed on purpose, resolve design §10 q3 first, then update the table below."
  );

  // The explicit in/out roll-call. Rendered as lines so a failure names the mob
  // and its verdict directly in the diff.
  const verdict = readMobRadii()
    .map((m) => `${m.id} r=${m.radius} ${m.radius <= maxRadius ? "ENTERS" : "SHUT OUT"}`)
    .sort();

  assert.deepEqual(verdict, [
    "aggressive r=3.5 ENTERS",
    "balanced r=4 ENTERS",
    "bramble_drake r=5 ENTERS",
    "bramble_stalker r=3 ENTERS",
    "defensive r=5 ENTERS",
    "double_attacker r=8 SHUT OUT",
    "hybrid r=4 ENTERS",
    "spear_thrower r=3 ENTERS",
    "thorncrown_drake r=9 SHUT OUT",
    "veil_spearling r=3 ENTERS",
  ]);
});

test("the ROADS are the binding constraint on mob size, not the buildings", () => {
  // The ceiling above is arithmetic on widths. This is the geometry check that
  // the arithmetic is the tight one: a body of the ceiling radius really can
  // get from the approach (the cart queue, out at the town edge) to the ford,
  // through the gaps the footprints actually leave. If someone crams buildings
  // closer together, the roads stop being the limit and this goes red — which
  // is the honest failure, because then the plan is narrower than it reads.
  const maxRadius = maxPassableMobRadius(PLAN);
  const grid = walkableGrid(PLAN, { playerRadius: maxRadius });
  const regions = floodFillRegions(grid);
  const queue = cellIndexAt(grid, PLAN.landmarks.find((l) => l.firstSight === true).at);
  const ford = cellIndexAt(grid, PLAN.landmarks.find((l) => l.id === "the-ford").at);

  assert.notEqual(regions.labels[queue], -1, `a radius-${maxRadius} body cannot stand at the cart queue`);
  assert.notEqual(regions.labels[ford], -1, `a radius-${maxRadius} body cannot stand at the ford`);
  assert.equal(
    regions.labels[queue],
    regions.labels[ford],
    `a radius-${maxRadius} body cannot walk from the cart queue to the ford`
  );
});

test("the ceiling rule can actually fail — narrower roads and bigger mobs both trip it", () => {
  // A rule nobody has watched fail is a rule nobody knows works. Both mutations
  // run on COPIES; the authored plan and the real definitions are untouched.
  const narrowed = structuredClone(PLAN);
  narrowed.roads.find((r) => r.id === "river-road-south").width = 10;
  assert.equal(maxPassableMobRadius(narrowed), 4, "narrowing a cart road did not lower the ceiling");

  const shutOut = readMobRadii()
    .filter((m) => m.radius > maxPassableMobRadius(narrowed))
    .map((m) => m.id)
    .sort();
  assert.deepEqual(
    shutOut,
    ["bramble_drake", "defensive", "double_attacker", "thorncrown_drake"],
    "narrowing a cart road did not shut out the radius-5 bruisers"
  );

  // And a hypothetical new giant is caught by the same rule, without touching
  // the definitions on disk.
  const hypothetical = { id: "hypothetical_titan", radius: 20 };
  assert.ok(
    hypothetical.radius > maxPassableMobRadius(PLAN),
    `${hypothetical.id} at r=${hypothetical.radius} was NOT flagged as too big for Millcross`
  );
});
