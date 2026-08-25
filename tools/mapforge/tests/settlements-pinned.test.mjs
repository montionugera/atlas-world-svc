// Plan D — P11 places the pinned layer FIRST.
//
// The ordering is the whole point. If pinned records were placed after the
// scored pass, the generator would already have spent the 60 km capital
// separation budget and a pinned capital could be rejected by its own rules.
// The design's phrase is "constraints are generation INPUTS, not post-hoc
// joins".
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGrid, FLAG, idx } from "../lib/grid.mjs";
import { placePinned, measureCell, placeSettlements, narrowWaterKm } from "../lib/passes/settlements.mjs";

// A 40 x 40 toy grid at the real 0.5 km cell edge: 20 x 20 km of ground.
function toyGrid() {
  const g = makeGrid({ w: 40, h: 40, cellKm: 0.5 });
  for (let i = 0; i < g.elev.length; i++) { g.elev[i] = 0.6; g.moist[i] = 0.5; g.owner[i] = 0; }
  for (let i = 0; i < 40; i++) g.flags[i * 40] |= FLAG.SEA; // a west coast
  // placeSettlements joins a pin to its region through grid.regionId(i) ->
  // grid.regionIds[grid.owner[i]]; owner is 0 everywhere, so one row covers it.
  g.regionIds = ["c02/r01"];
  return g;
}

test("a pinned record lands on its committed cell, not on the scorer's choice", () => {
  const g = toyGrid();
  const pinned = [{ id: "c-town-gildmark", pin: { at: [2.25, 5.25], toleranceKm: 1.5 }, requires: { continent: "c02" } }];
  const r = placePinned({ grid: g, pinned, cellKm: 0.5 });
  assert.deepEqual(r.problems, []);
  assert.equal(r.placed.length, 1);
  assert.deepEqual(r.placed[0].cell, [4, 10]);
  assert.deepEqual(r.receipts[0].at, [2.25, 5.25]);
});

test("every pinned record gets a receipt with all eight measured fields", () => {
  const g = toyGrid();
  const r = placePinned({ grid: g, pinned: [{ id: "c-town-gildmark", pin: { at: [2.25, 5.25], toleranceKm: 1.5 }, requires: {} }], cellKm: 0.5 });
  assert.deepEqual(Object.keys(r.receipts[0].measured).sort(), [
    "biome", "depthM", "elevationM", "freshWaterWithinKm", "landform", "shelterFetchKm", "slope", "waterKind",
  ]);
});

test("a pin on a water cell is a GENERATION failure, named", () => {
  const g = toyGrid();
  const r = placePinned({ grid: g, pinned: [{ id: "c-town-gildmark", pin: { at: [0.25, 5.25], toleranceKm: 1.5 }, requires: {} }], cellKm: 0.5 });
  assert.equal(r.placed.length, 0);
  assert.match(r.problems[0], /^placePinned: c-town-gildmark at \[0\.25, 5\.25\] is a water cell — a pinned place cannot sit in the sea$/);
});

test("the scored pass honours the pinned separation budget instead of spending it", () => {
  const g = toyGrid();
  const pinnedResult = placePinned({ grid: g, pinned: [{ id: "c-town-gildmark", title: "Gildmark",
    settlementRank: "capital", pin: { at: [10.25, 10.25], toleranceKm: 1.5 }, requires: {} }], cellKm: 0.5 });
  // The FULL Plan C signature — `premises` is required and there is no
  // defaulted overload. Passing `pinnedResult.placed` (not the raw records) is
  // the contract: Plan C reads `.at`/`.cell`/`.rank` and throws a named
  // TypeError on anything else.
  //
  // STREAM, adapted from the plan's `"settle"`: assertStream (Plan C Task 9a)
  // refuses anything that is not the committed 16-hex settlements stream, so
  // the plan's literal string cannot reach the pass. This is the real value
  // derived.json commits for n-atlas.
  const out = placeSettlements({
    grid: g,
    premises: [{ id: "c02", title: "Wealdmarch", class: "major",
                 footprint: { centreKm: [10, 10], radiiKm: [10, 10], warpKm: 0 },
                 palette: ["meadow"], landformKit: ["fluvial"], structures: [] }],
    manifest: { quotas: { settlements: { capital: 1, hub: 0, village: 2, total: 3 } } },
    regions: [{ id: "c02/r01", survey: "surveyed", continent: "c02" }],
    stream: "da45bd8930d33bb0", pinned: pinnedResult.placed, BIOME_NAME: () => "meadow",
  });
  const gild = out.settlements.find((s) => s.id === "c-town-gildmark");
  assert.ok(gild, "the pinned capital must appear in the output, unmoved");
  assert.deepEqual(gild.atKm, [10.25, 10.25]);
  assert.equal(out.settlements.filter((s) => s.rank === "capital").length, 1,
    "the pinned capital consumes the capital quota — it is not placed twice");
  for (const s of out.settlements)
    if (s.id !== "c-town-gildmark") {
      const dx = s.atKm[0] - 10.25, dy = s.atKm[1] - 10.25;
      assert.ok(Math.sqrt(dx * dx + dy * dy) >= 9, `${s.id} violates the 9 km village separation from the pinned capital`);
    }
});

test("measureCell reads the grid, never a random", () => {
  const g = toyGrid();
  const a = measureCell({ grid: g, cell: [4, 10], cellKm: 0.5 });
  const b = measureCell({ grid: g, cell: [4, 10], cellKm: 0.5 });
  assert.deepEqual(a, b);
});

test("no receipt field is null or zero for a land pin — the grid arrays ARE populated", () => {
  // The failure this catches: measureCell reading a grid array Plan C never
  // allocated. Guarded reads would produce forty receipts of all-zeros and
  // G-PIN-SAT would either fail all forty for the wrong reason or pass
  // vacuously. Unguarded reads make it a loud TypeError instead — this test
  // is what proves the arrays exist rather than trusting the absence of a `?.`.
  const g = toyGrid();
  // An enclosed notch in the west coast: rows 10-11 run sea out to column 5,
  // so the pin just east of it commands a pocket of water two cells across —
  // narrowWaterKm (min over the axes) reads 1 km there where grid.fetchKm
  // (max over the axes) would read the whole row's run. THE MEASUREMENT SOURCE
  // is narrowWaterKm, never fetchKm — see gPinSat's comment in
  // scripts/lib/resolve.mjs and STATE §"C, Task 9a Step 3".
  for (const y of [10, 11]) for (let x = 0; x <= 5; x++) g.flags[y * 40 + x] |= FLAG.SEA;
  g.landform[idx({ grid: g, cx: 6, cy: 10 })] = 0;
  g.landformNames = ["river-terrace"];
  g.depthM[idx({ grid: g, cx: 5, cy: 10 })] = 18;
  g.freshKm[idx({ grid: g, cx: 6, cy: 10 })] = 0.4;
  g.biomeNames = ["meadow"];
  const m = measureCell({ grid: g, cell: [6, 10], cellKm: 0.5 });
  assert.equal(m.landform, "river-terrace");
  assert.equal(m.waterKind, "sea");
  const narrow = narrowWaterKm({ grid: g })[idx({ grid: g, cx: 5, cy: 10 })];
  assert.equal(m.shelterFetchKm, narrow, "shelterFetchKm IS the adjacent water's min-over-axes width");
  assert.ok(m.shelterFetchKm > 0 && m.shelterFetchKm < 15);
  assert.equal(m.depthM, 18, "depthM is read off the same adjacent water cell");
  assert.equal(m.freshWaterWithinKm, 0.4);
  assert.equal(m.biome, "meadow");
  assert.ok(m.elevationM > 0);
});

test("a dry pin with no water in the coast band measures none/0/0, not its neighbour's harbour", () => {
  const g = toyGrid();
  g.landformNames = ["river-terrace"];
  g.landform[idx({ grid: g, cx: 30, cy: 30 })] = 0;
  const m = measureCell({ grid: g, cell: [30, 30], cellKm: 0.5 });
  assert.equal(m.waterKind, "none");
  assert.equal(m.shelterFetchKm, 0);
  assert.equal(m.depthM, 0);
});

test("measureCell CRASHES rather than guessing when a grid array is missing", () => {
  const g = toyGrid();
  delete g.landformNames;   // simulate a Plan C pass that forgot to fill it
  assert.throws(() => measureCell({ grid: g, cell: [10, 10], cellKm: 0.5 }), TypeError);
});
