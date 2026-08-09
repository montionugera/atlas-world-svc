import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CELL_SIZE,
  CONNECTIVITY,
  PLAYER_RADIUS,
  cellIndexAt,
  floodFillRegions,
  pointInPoly,
  polyRectOverlap,
  rectsOverlap,
  roadPolygon,
  walkableGrid,
} from "../lib/town-geometry.mjs";

const onRoad = (quads, pt) => quads.some((q) => pointInPoly(pt, q));

/** A plan with nothing in it but ground, for tests that add one thing. */
const emptyPlan = (width, height) => ({
  extent: { width, height },
  footprints: [],
});

// ---------------------------------------------------------------- constants

test("the tuning constants are the measured scale contract, not taste", () => {
  // Pinned so a mutation has to edit this test on purpose. PLAYER_RADIUS is the
  // runtime player body; CELL_SIZE is under one player diameter (2.6) so a
  // 4-unit alley survives the inflation; CONNECTIVITY is the invented,
  // design-open choice documented at the constant.
  assert.equal(PLAYER_RADIUS, 1.3);
  assert.equal(CELL_SIZE, 1.0);
  assert.equal(CONNECTIVITY, 4);
});

// ------------------------------------------------------------- rectsOverlap

test("rects sharing positive area overlap", () => {
  assert.equal(rectsOverlap([0, 0, 10, 10], [5, 5, 15, 15]), true);
});

test("a contained rect overlaps its container", () => {
  assert.equal(rectsOverlap([0, 0, 10, 10], [2, 2, 4, 4]), true);
});

test("rects that only TOUCH along an edge do not overlap", () => {
  // Load-bearing: T5 wants a footprint to touch the road it opens onto while
  // T4 forbids it overlapping one. A non-strict test makes those contradict.
  assert.equal(rectsOverlap([0, 0, 10, 10], [10, 0, 20, 10]), false);
  assert.equal(rectsOverlap([0, 0, 10, 10], [0, 10, 10, 20]), false);
});

test("disjoint rects do not overlap", () => {
  assert.equal(rectsOverlap([0, 0, 10, 10], [11, 11, 20, 20]), false);
});

test("either corner order describes the same rect", () => {
  assert.equal(rectsOverlap([10, 10, 0, 0], [5, 5, 15, 15]), true);
});

// -------------------------------------------------------------- pointInPoly

test("a point inside a quad is inside", () => {
  const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  assert.equal(pointInPoly([5, 5], square), true);
  assert.equal(pointInPoly([15, 5], square), false);
  assert.equal(pointInPoly([5, -1], square), false);
});

test("pointInPoly handles a concave ring", () => {
  const ell = [
    [0, 0],
    [10, 0],
    [10, 4],
    [4, 4],
    [4, 10],
    [0, 10],
  ];
  assert.equal(pointInPoly([2, 8], ell), true);
  assert.equal(pointInPoly([8, 2], ell), true);
  assert.equal(pointInPoly([8, 8], ell), false); // the notch of the L
});

// ---------------------------------------------------------- polyRectOverlap

test("a road quad overlapping a footprint rect is detected", () => {
  const [quad] = roadPolygon(
    [
      [0, 0],
      [40, 0],
    ],
    12,
  );
  assert.equal(polyRectOverlap(quad, [10, -2, 20, 2]), true);
});

test("a footprint that only touches the road edge does not overlap it", () => {
  const [quad] = roadPolygon(
    [
      [0, 0],
      [40, 0],
    ],
    12,
  ); // spans y -6..6
  assert.equal(polyRectOverlap(quad, [10, 6, 20, 20]), false);
  assert.equal(polyRectOverlap(quad, [10, 5.9, 20, 20]), true);
});

test("a footprint clear of the road does not overlap it", () => {
  const [quad] = roadPolygon(
    [
      [0, 0],
      [40, 0],
    ],
    12,
  );
  assert.equal(polyRectOverlap(quad, [10, 30, 20, 40]), false);
});

test("a diagonal road quad is tested by its own edge normals, not its bbox", () => {
  const [quad] = roadPolygon(
    [
      [0, 0],
      [40, 40],
    ],
    4,
  );
  // Deep inside the quad's bounding box but far off the centreline.
  assert.equal(polyRectOverlap(quad, [30, 2, 34, 6]), false);
  assert.equal(polyRectOverlap(quad, [18, 18, 22, 22]), true);
});

// --------------------------------------------------------------- roadPolygon

test("a straight road is swept to exactly its authored width", () => {
  const [quad] = roadPolygon(
    [
      [0, 0],
      [40, 0],
    ],
    12,
  );
  const ys = quad.map((p) => p[1]);
  assert.equal(Math.max(...ys) - Math.min(...ys), 12);
});

test("a collinear polyline gets no joint quads", () => {
  const quads = roadPolygon(
    [
      [0, 0],
      [10, 0],
      [20, 0],
    ],
    12,
  );
  assert.equal(quads.length, 2); // two segments, zero joints
});

test("an L-bend has NO NOTCH at the corner", () => {
  // Right then up, width 12 (half-width 6). The outer corner square
  // x 10..16 / y -6..0 belongs to neither swept rect: rect 1 stops at x = 10,
  // rect 2 starts at y = 0. Without the joint quad this point is a hole in the
  // middle of the road.
  const quads = roadPolygon(
    [
      [0, 0],
      [10, 0],
      [10, 10],
    ],
    12,
  );
  const corner = [13, -3];
  const sweptOnly = quads.slice(0, 2);
  assert.equal(quads.length, 3, "two segments plus one joint quad");
  assert.equal(
    sweptOnly.some((q) => pointInPoly(corner, q)),
    false,
    "the swept rects alone leave the corner uncovered — that is the notch",
  );
  assert.equal(onRoad(quads, corner), true, "the joint quad fills it");
});

test("the L-bend joint fills the corner all the way to the outer edge", () => {
  const quads = roadPolygon(
    [
      [0, 0],
      [10, 0],
      [10, 10],
    ],
    12,
  );
  for (const pt of [
    [11, -1],
    [15, -5],
    [13, -5.5],
    [15.5, -1],
  ])
    assert.equal(onRoad(quads, pt), true, `corner point ${pt} should be road`);
  // ...and not beyond it: the road is still only 12 wide.
  assert.equal(onRoad(quads, [17, -3]), false);
  assert.equal(onRoad(quads, [13, -7]), false);
});

test("an acute bend is also filled", () => {
  const quads = roadPolygon(
    [
      [0, 0],
      [20, 0],
      [0, 6],
    ],
    4,
  );
  assert.equal(quads.length, 3);
  assert.equal(onRoad(quads, [20.5, 1]), true, "the corner of the bend is road");
  assert.equal(onRoad(quads, [21.5, 1]), false, "and the fill stops there");
  assert.equal(onRoad(quads, [10, 10]), false, "well off both centrelines");
});

test("repeated centreline points are dropped, not turned into a bad normal", () => {
  const quads = roadPolygon(
    [
      [0, 0],
      [0, 0],
      [10, 0],
    ],
    12,
  );
  assert.equal(quads.length, 1);
  assert.ok(quads[0].every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
});

test("roadPolygon rejects degenerate input", () => {
  assert.throws(() => roadPolygon([[0, 0]], 12), /2\+ centreline points/);
  assert.throws(
    () =>
      roadPolygon(
        [
          [0, 0],
          [10, 0],
        ],
        0,
      ),
    /width > 0/,
  );
  assert.throws(
    () =>
      roadPolygon(
        [
          [5, 5],
          [5, 5],
        ],
        12,
      ),
    /DISTINCT/,
  );
});

// -------------------------------------------------------------- walkableGrid

test("open ground is entirely walkable", () => {
  const grid = walkableGrid(emptyPlan(20, 10));
  assert.equal(grid.cols, 20);
  assert.equal(grid.rows, 10);
  assert.equal(grid.walkable.every((v) => v === 1), true);
});

test("a footprint blocks its own cells plus a player-radius margin", () => {
  const grid = walkableGrid({
    extent: { width: 20, height: 20 },
    footprints: [{ id: "hut", rect: [8, 8, 12, 12] }],
  });
  const at = (x, y) => grid.walkable[cellIndexAt(grid, [x, y])];
  assert.equal(at(10, 10), 0, "inside the building");
  assert.equal(at(7, 10), 0, "within 1.3 of the wall — the player would clip it");
  assert.equal(at(6, 10), 1, "2 units clear of the wall");
});

test("water and plazas are not collision (design §5)", () => {
  const plan = {
    extent: { width: 20, height: 20 },
    footprints: [],
    water: [
      {
        id: "river",
        poly: [
          [0, 8],
          [20, 8],
          [20, 12],
          [0, 12],
        ],
      },
    ],
    plazas: [{ id: "yard", rect: [0, 0, 20, 20] }],
  };
  const grid = walkableGrid(plan);
  assert.equal(grid.walkable.every((v) => v === 1), true);
  assert.equal(floodFillRegions(grid).count, 1);
});

test("walkableGrid rejects a plan with no usable extent", () => {
  assert.throws(() => walkableGrid({ extent: { width: 0, height: 10 } }), /extent/);
  assert.throws(() => walkableGrid(emptyPlan(10, 10), { cell: 0 }), /cell > 0/);
});

// ---------------------------------------------------------- floodFillRegions

test("a town with nothing in it is ONE region", () => {
  assert.equal(floodFillRegions(walkableGrid(emptyPlan(40, 20))).count, 1);
});

test("a building wall cutting the town in half gives TWO regions", () => {
  const grid = walkableGrid({
    extent: { width: 40, height: 20 },
    footprints: [{ id: "wall", rect: [19, 0, 21, 20] }],
  });
  const regions = floodFillRegions(grid);
  assert.equal(regions.count, 2);
  assert.equal(
    regions.sizes.reduce((a, b) => a + b, 0),
    grid.walkable.reduce((a, b) => a + b, 0),
  );
});

test("a ring of footprints seals its courtyard off — the T6 failure", () => {
  const grid = walkableGrid({
    extent: { width: 40, height: 40 },
    footprints: [
      { id: "n", rect: [10, 10, 30, 14] },
      { id: "s", rect: [10, 26, 30, 30] },
      { id: "w", rect: [10, 10, 14, 30] },
      { id: "e", rect: [26, 10, 30, 30] },
    ],
  });
  const regions = floodFillRegions(grid);
  assert.equal(regions.count, 2, "the courtyard interior plus the outside");
  const courtyard = regions.labels[cellIndexAt(grid, [20, 20])];
  const outside = regions.labels[cellIndexAt(grid, [1, 1])];
  assert.notEqual(courtyard, outside);
});

test("blocked cells are labelled -1 and belong to no region", () => {
  const grid = walkableGrid({
    extent: { width: 20, height: 20 },
    footprints: [{ id: "hut", rect: [8, 8, 12, 12] }],
  });
  const { labels } = floodFillRegions(grid);
  assert.equal(labels[cellIndexAt(grid, [10, 10])], -1);
});

test("a DIAGONAL-ONLY touch is two regions, not one (4-connectivity)", () => {
  // Cells (0,0) and (1,1) open, (1,0) and (0,1) blocked. Under 8-connectivity
  // this is one region; under 4 it is two, because a body with a radius cannot
  // squeeze through a corner-to-corner pinch.
  const grid = { cell: 1, cols: 2, rows: 2, walkable: Uint8Array.from([1, 0, 0, 1]) };
  assert.equal(floodFillRegions(grid).count, 2);
  assert.equal(floodFillRegions(grid, { connectivity: 8 }).count, 1);
});

test("floodFillRegions rejects a connectivity it does not implement", () => {
  const grid = walkableGrid(emptyPlan(4, 4));
  assert.throws(() => floodFillRegions(grid, { connectivity: 6 }), /connectivity must be 4 or 8/);
});

// ------------------------------------------------- the scale contract, live

test("a 4-unit alley stays walkable for the player, a 2-unit one does not", () => {
  // Two footprints pinned to the top and bottom edges with a gap between them:
  // the only way from the left half of the town to the right half.
  const alley = (gap) => {
    const half = (20 - gap) / 2;
    return floodFillRegions(
      walkableGrid({
        extent: { width: 40, height: 20 },
        footprints: [
          { id: "n", rect: [18, 0, 22, half] },
          { id: "s", rect: [18, 20 - half, 22, 20] },
        ],
      }),
    ).count;
  };
  assert.equal(alley(4), 1, "the 4-unit foot-road floor passes a 1.3 player");
  assert.equal(alley(2), 2, "half that does not");
});

test("a 12-unit cart road passes the largest mob, a 10-unit one does not", () => {
  // The counter-intuitive half of the scale contract: mob radius 5, not the
  // player's 1.3, is what sets the cart-road floor.
  const road = (gap) => {
    const half = (20 - gap) / 2;
    return floodFillRegions(
      walkableGrid(
        {
          extent: { width: 40, height: 20 },
          footprints: [
            { id: "n", rect: [18, 0, 22, half] },
            { id: "s", rect: [18, 20 - half, 22, 20] },
          ],
        },
        { playerRadius: 5 },
      ),
    ).count;
  };
  assert.equal(road(12), 1);
  assert.equal(road(10), 2);
});

// ---------------------------------------------------------------- cellIndexAt

test("cellIndexAt maps plan-space points to cells and rejects points off-map", () => {
  const grid = walkableGrid(emptyPlan(20, 10));
  assert.equal(cellIndexAt(grid, [0.5, 0.5]), 0);
  assert.equal(cellIndexAt(grid, [19.9, 9.9]), grid.cols * grid.rows - 1);
  assert.equal(cellIndexAt(grid, [-1, 5]), -1);
  assert.equal(cellIndexAt(grid, [21, 5]), -1);
});

test("a point exactly on the far edge lands in the last cell, not nowhere", () => {
  // T7 asks whether firstSight is reachable from the town EDGE, so a landmark
  // or road end authored at exactly extent.width must resolve to a real cell.
  const grid = walkableGrid(emptyPlan(20, 10));
  assert.equal(cellIndexAt(grid, [20, 5]), cellIndexAt(grid, [19.5, 5]));
  assert.equal(cellIndexAt(grid, [10, 10]), cellIndexAt(grid, [10, 9.5]));
  assert.equal(cellIndexAt(grid, [20, 10]), grid.cols * grid.rows - 1);
});
