// Renderer tests for F-040 task 7.
//
// These assert on the SVG STRING ONLY. Nothing here spawns `magick`, so the
// suite runs in CI on a box with no ImageMagick — the rasterisation step is
// verified by hand (the CLI writes the PNG the owner looks at), while everything
// that could silently go WRONG about the drawing is a string assertion.
//
// The one that matters most is road width. A map whose 12-unit cart road does
// not render three times a 4-unit alley is worse than no map: it looks
// authoritative while lying about the scale contract. So the width is MEASURED
// off the emitted polygon rather than read back from an attribute the renderer
// wrote — a data-width assertion would only prove the bookkeeping agrees with
// itself, which is exactly the bug class it needs to catch.
//
// The second-most important group is the fill-only guard. This machine's
// ImageMagick has no librsvg and its internal MSVG renderer silently drops every
// stroke, so a stroked shape looks correct in a browser and vanishes from the
// PNG. Nothing else would catch that.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CART_ROAD_FLOOR,
  DRAW_SCALE,
  planLabels,
  FOOT_ROAD_FLOOR,
  KIND_FILL,
  MULTI_STOREY_FILL,
  ROAD_CASING_WIDTH,
  SCALE_BAR_UNITS,
  buildTownPlanSvg,
  luminance,
  parseArgs,
  planViewBox,
  roadQuads,
} from "../generate/townplan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");
const SOURCE_PATH = path.join(HERE, "../generate/townplan.mjs");
const MILLCROSS_PATH = path.join(REPO_ROOT, "content/towns/town-millcross.json");

const millcross = JSON.parse(await readFile(MILLCROSS_PATH, "utf8"));
const source = await readFile(SOURCE_PATH, "utf8");

/* -------------------------------- helpers -------------------------------- */

/** Every element open-tag in the SVG, as raw strings. */
function elements(svg) {
  return svg.match(/<[a-zA-Z-]+\b[^>]*>/g) ?? [];
}

function attr(el, name) {
  const m = el.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

/** The `<g>` block whose open tag carries `attrName="value"`, contents included. */
function group(svg, attrName, value) {
  const re = new RegExp(`<g[^>]*${attrName}="${value}"[^>]*>([\\s\\S]*?)</g>`);
  const m = re.exec(svg);
  assert.ok(m, `no <g> with ${attrName}="${value}"`);
  return m[1];
}

function polygons(fragment) {
  return (fragment.match(/<polygon\b[^>]*>/g) ?? []).map((el) =>
    attr(el, "points")
      .split(" ")
      .map((p) => p.split(",").map(Number)),
  );
}

function dist([ax, ay], [bx, by]) {
  return Math.hypot(bx - ax, by - ay);
}

/** World units, from a length in the markup's own (DRAW_SCALE'd) user units. */
function toWorld(n) {
  return n / DRAW_SCALE;
}

/**
 * Tolerance for a width measured off the markup, in world units.
 *
 * Coordinates are written to 3 decimals of USER units, so a road whose normal is
 * not axis-aligned round-trips with a little error. 2e-3 world units leaves
 * ample room and is still three orders of magnitude tighter than the failure it
 * has to catch: sweeping along the bounding box instead of the normal would make
 * a 45° 12-unit road measure 8.49.
 */
const WIDTH_TOLERANCE = 2e-3;

/**
 * The drawn width of a road IN WORLD UNITS, measured off the first segment quad
 * it emits. roadQuads lays each segment out as [A+n·h, B+n·h, B−n·h, A−n·h], so
 * the distance from corner 0 to corner 3 is the full swept width.
 */
function measuredRoadWidth(svg, id) {
  const quads = polygons(group(svg, "data-road", id));
  assert.ok(quads.length > 0, `road ${id} emitted no polygons`);
  return toWorld(dist(quads[0][0], quads[0][3]));
}

/* ------------------------------- the input ------------------------------- */

test("renders the real authored Millcross plan, not a fixture", () => {
  assert.equal(millcross.town, "millcross");
  assert.ok(millcross.roads.length > 0);
  assert.ok(millcross.footprints.length > 0);
});

/* ------------------------ roads at their true width ----------------------- */

test("every road is DRAWN at exactly its authored width in world units", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  for (const road of millcross.roads) {
    assert.ok(
      Math.abs(measuredRoadWidth(svg, road.id) - road.width) < WIDTH_TOLERANCE,
      `${road.id} must be drawn ${road.width} world units wide, measured ${measuredRoadWidth(svg, road.id)}`,
    );
  }
});

test("the declared data-width agrees with the measured geometry", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  for (const road of millcross.roads) {
    const el = elements(svg).find((e) => e.includes(`data-road="${road.id}"`));
    assert.equal(Number(attr(el, "data-width")), road.width);
    assert.ok(Math.abs(measuredRoadWidth(svg, road.id) - Number(attr(el, "data-width"))) < WIDTH_TOLERANCE);
  }
});

test("a 12-unit road renders three times a 4-unit alley — the ratio, not just the number", () => {
  const plan = {
    town: "ratio",
    extent: { width: 100, height: 100 },
    anchor: { geographyAt: [0, 0] },
    roads: [
      { id: "cart", kind: "cart", width: 12, points: [[10, 10], [90, 10]] },
      { id: "alley", kind: "foot", width: 4, points: [[10, 40], [90, 40]] },
    ],
    footprints: [],
    landmarks: [],
  };
  const svg = buildTownPlanSvg({ plan });
  assert.equal(measuredRoadWidth(svg, "cart") / measuredRoadWidth(svg, "alley"), 3);
});

test("a diagonal road is not silently narrower than an axis-aligned one", () => {
  // The bug this catches: sweeping along the bounding box instead of the normal
  // makes a 45° road render at width/√2 and the scale contract quietly stops
  // holding for exactly the roads that bend.
  const plan = {
    town: "diag",
    extent: { width: 100, height: 100 },
    anchor: { geographyAt: [0, 0] },
    roads: [{ id: "d", kind: "cart", width: 12, points: [[10, 10], [80, 80]] }],
    footprints: [],
    landmarks: [],
  };
  assert.ok(Math.abs(measuredRoadWidth(buildTownPlanSvg({ plan }), "d") - 12) < WIDTH_TOLERANCE);
});

test("a bend emits a bevel joint so the corner has no notch", () => {
  // One quad per segment, plus a PAIR of bevel triangles per interior vertex.
  // Without the joint the outside of every turn shows a square bite.
  assert.equal(roadQuads([[0, 0], [10, 0]], 4).length, 1);
  assert.equal(roadQuads([[0, 0], [10, 0], [10, 10]], 4).length, 1 + 1 + 2);
  // Collinear points add no joint — a degenerate sliver is worse than none.
  assert.equal(roadQuads([[0, 0], [5, 0], [10, 0]], 4).length, 2);
});

test("a joint never reaches further from the bend than the road's half width", () => {
  // The fin bug, pinned. The gate's parallelogram joint (V ± n1·h ± n2·h) is a
  // deliberate OVER-estimate — safe for rejecting footprints near a bend, wrong
  // for a picture: at a shallow bend it reaches a full width from the vertex and
  // draws a visible spike out of the road. The exact bevel reaches exactly h.
  const width = 12;
  const h = width / 2;
  const bend = [10, 0];
  // A deliberately shallow turn — where the parallelogram was worst.
  const quads = roadQuads([[0, 0], bend, [24, 3]], width);
  const joints = quads.slice(2);
  assert.equal(joints.length, 2, "a bend must emit both bevel triangles");
  for (const tri of joints) {
    for (const p of tri) {
      assert.ok(
        dist(p, bend) <= h + 1e-9,
        `joint corner ${p} is ${dist(p, bend)} from the bend, over the ${h} half width`,
      );
    }
  }
});

test("the casing sits UNDER the surface and is wider, so it never eats the width", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  const road = millcross.roads[0];
  const casing = polygons(group(svg, "data-road-casing", road.id));
  assert.ok(
    Math.abs(toWorld(dist(casing[0][0], casing[0][3])) - (road.width + ROAD_CASING_WIDTH)) < WIDTH_TOLERANCE,
  );
  assert.ok(
    svg.indexOf(`data-road-casing="${road.id}"`) < svg.indexOf(`data-road="${road.id}"`),
    "casings must be painted before surfaces",
  );
});

test("the viewBox is world units times DRAW_SCALE, and nothing else", () => {
  // DRAW_SCALE exists only to clear MSVG's glyph-clipping cliff. If it ever
  // stopped being a single uniform factor, every measured width in this file
  // would quietly start meaning something different.
  const vb = planViewBox(millcross);
  const svg = buildTownPlanSvg({ plan: millcross });
  assert.match(
    svg,
    new RegExp(
      `viewBox="${vb.x * DRAW_SCALE} ${vb.y * DRAW_SCALE} ${vb.width * DRAW_SCALE} ${vb.height * DRAW_SCALE}"`,
    ),
  );
  assert.ok(vb.width > millcross.extent.width, "the viewBox must clear the extent for margins");
  assert.ok(vb.height > millcross.extent.height, "the viewBox must clear the extent for title and footer");
});

test("every font-size clears the MSVG glyph-clipping cliff", () => {
  // Measured, not assumed: below roughly 5 SVG user units this ImageMagick
  // shears the ascenders off, turning `h` into `n` and `d` into `a`. It is a
  // user-space threshold — rendering at higher resolution does not help — so
  // DRAW_SCALE is the only thing standing between the map and unreadable labels.
  const svg = buildTownPlanSvg({ plan: millcross });
  const sizes = elements(svg)
    .filter((e) => e.startsWith("<text"))
    .map((e) => Number(attr(e, "font-size")));
  assert.ok(sizes.length > 0);
  assert.ok(Math.min(...sizes) >= 20, `smallest font-size is ${Math.min(...sizes)} user units`);
});

test("uniform scale: pixel aspect is derived from the plan, never letterboxed", () => {
  const vb = planViewBox(millcross);
  const svg = buildTownPlanSvg({ plan: millcross, width: 1000 });
  assert.match(svg, /width="1000"/);
  assert.match(svg, new RegExp(`height="${Math.round((1000 * vb.height) / vb.width)}"`));
});

/* ------------------------------ what is drawn ----------------------------- */

test("footprint count matches the plan, one element each, keyed by id", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  const drawn = elements(svg).filter((e) => /data-footprint="/.test(e));
  assert.equal(drawn.length, millcross.footprints.length);
  for (const f of millcross.footprints) {
    assert.equal(
      drawn.filter((e) => e.includes(`data-footprint="${f.id}"`)).length,
      1,
      `${f.id} must be drawn exactly once`,
    );
  }
});

test("footprint rects carry the plan's own corners, normalised", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  for (const f of millcross.footprints) {
    const el = elements(svg).find((e) => e.includes(`data-footprint="${f.id}"`));
    const [x0, y0, x1, y1] = f.rect;
    assert.equal(toWorld(Number(attr(el, "x"))), Math.min(x0, x1));
    assert.equal(toWorld(Number(attr(el, "y"))), Math.min(y0, y1));
    assert.equal(toWorld(Number(attr(el, "width"))), Math.abs(x1 - x0));
    assert.equal(toWorld(Number(attr(el, "height"))), Math.abs(y1 - y0));
  }
});

test("the 2-storey mill-house is tonally distinct from every single-storey kind", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  const mill = elements(svg).find((e) => e.includes('data-footprint="mill-house"'));
  assert.equal(attr(mill, "data-storeys"), "2");
  assert.equal(attr(mill, "fill"), MULTI_STOREY_FILL);
  // Distinct, not merely different: it must not collide with any kind fill, or
  // "the mill reads as taller" depends on the reader knowing which brown is which.
  assert.ok(!Object.values(KIND_FILL).includes(MULTI_STOREY_FILL));
  for (const f of millcross.footprints) {
    if ((f.storeys ?? 1) >= 2) continue;
    const el = elements(svg).find((e) => e.includes(`data-footprint="${f.id}"`));
    assert.notEqual(attr(el, "fill"), MULTI_STOREY_FILL, `${f.id} is 1 storey`);
  }
  // ...and distinct in VALUE, so the distinction survives greyscale.
  const darkest = Math.min(...Object.values(KIND_FILL).map(luminance));
  assert.ok(luminance(MULTI_STOREY_FILL) < darkest, "the 2-storey tone must be the darkest mass");
});

test("Millcross has exactly one 2-storey mass and it is the mill-house (A1 §6)", () => {
  const multi = millcross.footprints.filter((f) => (f.storeys ?? 1) >= 2);
  assert.deepEqual(multi.map((f) => f.id), ["mill-house"]);
});

test("water and plazas are drawn, keyed by id", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  for (const w of millcross.water ?? []) assert.match(svg, new RegExp(`data-water="${w.id}"`));
  for (const p of millcross.plazas ?? []) assert.match(svg, new RegExp(`data-plaza="${p.id}"`));
});

test("the ford, the cart yard and the mill all appear by name", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  for (const id of ["the-ford", "cart-yard", "mill-house"]) {
    assert.ok(svg.includes(id), `${id} must appear in the drawing`);
  }
});

/* --------------------------- label placement ------------------------------ */
//
// Two invariants instead of a list of positional assertions. A positional
// assertion ("mill-wheel sits at x=91") pins one town and rots the moment a
// coordinate moves; these pin the PROPERTY the placement pass exists to produce,
// and hold for the other five towns D4 says follow.

/** Do two rects share positive area? Touching does not count. */
function intersects(a, b) {
  return a[0] < b[2] - 1e-9 && b[0] < a[2] - 1e-9 && a[1] < b[3] - 1e-9 && b[1] < a[3] - 1e-9;
}

test("no two placed labels overlap each other", () => {
  const labels = planLabels(millcross);
  assert.ok(labels.length >= millcross.footprints.length + millcross.roads.length);
  const hits = [];
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (intersects(labels[i].box, labels[j].box)) hits.push(`${labels[i].id} × ${labels[j].id}`);
    }
  }
  assert.deepEqual(hits, [], `overlapping labels: ${hits.join(", ")}`);
});

test("no label crosses a footprint other than the one it names", () => {
  // A label INSIDE its own mass is the whole point of an inside placement, so
  // ownership is the exemption — not "any footprint", which would let a road
  // label sit on a building as long as some other label owned it.
  const labels = planLabels(millcross);
  const hits = [];
  for (const l of labels) {
    for (const f of millcross.footprints) {
      const r = [
        Math.min(f.rect[0], f.rect[2]),
        Math.min(f.rect[1], f.rect[3]),
        Math.max(f.rect[0], f.rect[2]),
        Math.max(f.rect[1], f.rect[3]),
      ];
      if (l.kind === "footprint" && l.id === f.id) continue;
      if (intersects(l.box, r)) hits.push(`${l.kind} ${l.id} × ${f.id}`);
    }
  }
  assert.deepEqual(hits, [], `labels crossing buildings: ${hits.join(", ")}`);
});

test("no label crosses a landmark marker other than its own", () => {
  const labels = planLabels(millcross);
  const hits = [];
  for (const l of labels) {
    for (const lm of millcross.landmarks) {
      if (l.kind === "landmark" && l.id === lm.id) continue;
      const r = lm.firstSight ? 6.6 : 3.1;
      const disc = [lm.at[0] - r, lm.at[1] - r, lm.at[0] + r, lm.at[1] + r];
      if (intersects(l.box, disc)) hits.push(`${l.kind} ${l.id} × ${lm.id}`);
    }
  }
  assert.deepEqual(hits, [], `labels over markers: ${hits.join(", ")}`);
});

test("every label on the plan is placed exactly once", () => {
  const labels = planLabels(millcross);
  const expect = (kind, ids) =>
    assert.deepEqual(
      labels.filter((l) => l.kind === kind).map((l) => l.id).sort(),
      [...ids].sort(),
      `${kind} labels`,
    );
  expect("footprint", millcross.footprints.map((f) => f.id));
  expect("road", millcross.roads.map((r) => r.id));
  expect("water", millcross.water.map((w) => w.id));
  expect("plaza", millcross.plazas.map((p) => p.id));
  expect("landmark", millcross.landmarks.map((l) => l.id));
});

test("placement is deterministic — the same plan renders the same map", () => {
  assert.deepEqual(
    planLabels(millcross).map((l) => [l.id, l.box]),
    planLabels(millcross).map((l) => [l.id, l.box]),
  );
});

test("a label that cannot fit inside its mass is moved out, not shrunk or clipped", () => {
  // tent rects are 12 units wide and "tent-row-a" needs more, so its label must
  // leave the mass entirely rather than overflow it.
  const labels = planLabels(millcross);
  const tent = labels.find((l) => l.id === "tent-row-a");
  assert.equal(tent.inside, false);
  assert.equal(tent.runs[0].size, planLabels(millcross).find((l) => l.id === "mill-house").runs[0].size);
});

test("label ink flips against the mass under it", () => {
  // A dark label on the dark mill-house, or a pale one on a pale tent, is a
  // label that is not there.
  assert.ok(luminance(MULTI_STOREY_FILL) < 0.55, "mill-house takes pale ink");
  assert.ok(luminance(KIND_FILL.tent) >= 0.55, "tents take dark ink");
});

/* ------------------------------- first sight ------------------------------ */

test("the firstSight landmark is marked, and only that one", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  const expected = millcross.landmarks.filter((l) => l.firstSight);
  assert.equal(expected.length, 1, "the plan itself must have exactly one firstSight");
  const marked = elements(svg).filter((e) => /data-first-sight="/.test(e));
  assert.equal(marked.length, 1);
  assert.equal(attr(marked[0], "data-first-sight"), expected[0].id);
  assert.match(svg, /FIRST SIGHT/);
});

test("every landmark is drawn, firstSight or not", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  assert.equal(elements(svg).filter((e) => /data-landmark="/.test(e)).length, millcross.landmarks.length);
});

test("a plan with no firstSight gets no marker rather than a wrong one", () => {
  const svg = buildTownPlanSvg({
    plan: {
      town: "quiet",
      extent: { width: 60, height: 60 },
      anchor: { geographyAt: [0, 0] },
      roads: [{ id: "r", kind: "foot", width: 4, points: [[0, 30], [60, 30]] }],
      footprints: [],
      landmarks: [{ id: "well", at: [30, 20] }],
    },
  });
  assert.doesNotMatch(svg, /data-first-sight=/);
  assert.match(svg, /data-landmark="well"/);
});

/* ------------------------------- scale bar -------------------------------- */

test("a scale bar in world units is present and declares its length", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  assert.match(svg, new RegExp(`data-scale-bar="${SCALE_BAR_UNITS}"`));
  assert.match(svg, /world units/);
  assert.ok(svg.includes(`>${SCALE_BAR_UNITS}<`), "the far tick must be labelled with the bar's length");
});

test("the scale bar spans exactly SCALE_BAR_UNITS in the map's own coordinates", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  const bar = group(svg, "data-scale-bar", String(SCALE_BAR_UNITS));
  const rects = (bar.match(/<rect\b[^>]*>/g) ?? []).map((e) => ({
    x: toWorld(Number(attr(e, "x"))),
    w: toWorld(Number(attr(e, "width"))),
  }));
  const left = Math.min(...rects.map((r) => r.x));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  // The casing outsets the bar by 0.4 on each side; the bar proper is the rest.
  assert.ok(Math.abs(right - left - (SCALE_BAR_UNITS + 0.8)) < WIDTH_TOLERANCE);
});

test("the two scale-contract floors are drawn as bands at TRUE world size", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  const bands = elements(svg).filter((e) => /data-swatch-band="/.test(e));
  assert.deepEqual(
    bands.map((e) => Number(attr(e, "data-swatch-band"))).sort((a, b) => a - b),
    [FOOT_ROAD_FLOOR, CART_ROAD_FLOOR],
  );
  // A band not drawn at its own thickness cannot be compared to a road.
  for (const b of bands) {
    assert.equal(toWorld(Number(attr(b, "height"))), Number(attr(b, "data-swatch-band")));
  }
});

test("the scale contract floors are the measured numbers, not tuned ones", () => {
  // Design §3: largest mob radius 5 → diameter 10 plus clearance → 12; player
  // radius 1.3 → diameter 2.6 plus clearance → 4. If either drifts, the swatches
  // stop matching the gate and the map starts lying.
  assert.equal(CART_ROAD_FLOOR, 12);
  assert.equal(FOOT_ROAD_FLOOR, 4);
});

test("every cart road in Millcross clears the cart floor the swatch advertises", () => {
  for (const r of millcross.roads.filter((r) => r.kind === "cart")) {
    assert.ok(r.width >= CART_ROAD_FLOOR, `${r.id} is ${r.width}, under the ${CART_ROAD_FLOOR} floor`);
  }
  for (const r of millcross.roads.filter((r) => r.kind === "foot")) {
    assert.ok(r.width >= FOOT_ROAD_FLOOR, `${r.id} is ${r.width}, under the ${FOOT_ROAD_FLOOR} floor`);
  }
});

/* ------------------------------ orientation ------------------------------- */

test("a north arrow is drawn — the Meltwash runs north-south and +y is downward", () => {
  assert.match(buildTownPlanSvg({ plan: millcross }), /class="north-arrow"/);
});

test("the title names the town and states the extent", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  assert.match(svg, /Millcross — town plan/);
  assert.ok(svg.includes(`${millcross.extent.width} × ${millcross.extent.height}`));
});

test("the legend says the extent is a plan bound, not a wall", () => {
  assert.match(buildTownPlanSvg({ plan: millcross }), /no wall/);
});

/* --------------------- the rasteriser's own constraints -------------------- */

test("no shape carries a stroke — this ImageMagick's MSVG renderer drops them", () => {
  // Measured, not assumed: `magick -list configure` shows no rsvg delegate, so
  // SVG goes through the internal MSVG renderer, which silently ignores stroke
  // on every element. A stroked road renders as NOTHING in the PNG while looking
  // perfect in a browser. Outlines are casings instead — a larger shape behind.
  const svg = buildTownPlanSvg({ plan: millcross });
  for (const el of elements(svg)) {
    if (el.startsWith("<text") || el.startsWith("<svg")) continue;
    assert.ok(!/\sstroke="/.test(el), `shape carries a stroke MSVG will drop: ${el.slice(0, 110)}`);
  }
});

test("no fill-opacity or dasharray — MSVG ignores both", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  assert.doesNotMatch(svg, /fill-opacity=/);
  assert.doesNotMatch(svg, /stroke-opacity=/);
  assert.doesNotMatch(svg, /stroke-dasharray=/);
});

test("font-family is a single unquoted family — MSVG rejects a quoted CSS stack", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  for (const el of elements(svg).filter((e) => e.startsWith("<text"))) {
    const family = attr(el, "font-family");
    assert.ok(family && !family.includes(",") && !family.includes("'"), `bad font-family: ${family}`);
  }
});

/* --------------------------------- no blur -------------------------------- */

test("the SVG carries no blur filter — this is a map, not a ControlNet signal", () => {
  const svg = buildTownPlanSvg({ plan: millcross });
  assert.doesNotMatch(svg, /feGaussianBlur|\sfilter=/);
});

test("the rasteriser never passes -blur to magick", () => {
  assert.doesNotMatch(source, /"-blur"/);
});

test("a missing magick is reported as something to install", () => {
  assert.match(source, /ENOENT/);
  assert.match(source, /brew install imagemagick/);
});

/* ---------------------------------- misc ---------------------------------- */

test("markup is escaped rather than injected", () => {
  const svg = buildTownPlanSvg({
    plan: {
      town: "esc",
      extent: { width: 40, height: 40 },
      anchor: { geographyAt: [0, 0] },
      roads: [{ id: '<script>&"', kind: "foot", width: 4, points: [[0, 20], [40, 20]] }],
      footprints: [],
      landmarks: [],
    },
  });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
});

test("a plan without an extent fails by name instead of drawing nonsense", () => {
  assert.throws(() => buildTownPlanSvg({ plan: { town: "broken" } }), /extent\.width\/height/);
});

test("roadQuads rejects a degenerate centreline rather than emitting NaN", () => {
  assert.throws(() => roadQuads([[0, 0]], 4), /2\+ centreline points/);
  assert.throws(() => roadQuads([[0, 0], [0, 0]], 4), /2\+ DISTINCT/);
  assert.throws(() => roadQuads([[0, 0], [1, 0]], 0), /width > 0/);
});

test("parseArgs handles --flag value and --flag=value", () => {
  assert.deepEqual(parseArgs(["--plan", "a.json", "--out=b.png", "--width", "900"]), {
    plan: "a.json",
    out: "b.png",
    width: "900",
  });
});
