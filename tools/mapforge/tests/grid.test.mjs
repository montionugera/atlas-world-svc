// tools/mapforge/tests/grid.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGrid, FLAG, SUBSTRATE_FLAGS, SUBSTRATE_MASK, D8, idx, inBounds, neighbourIdx, cx, cy, cellCentreKm, cellAreaKm2, setFlag, hasFlag, clearFlag } from "../lib/grid.mjs";

test("makeGrid allocates one typed array per field at the pinned resolution", () => {
  const g = makeGrid({ w: 800, h: 800, cellKm: 0.5 });
  assert.equal(g.w, 800);
  assert.equal(g.h, 800);
  assert.equal(g.cellKm, 0.5);
  assert.equal(g.elev.length, 640000);
  assert.ok(g.elev instanceof Float32Array);
  assert.ok(g.moist instanceof Float32Array);
  assert.ok(g.temp instanceof Float32Array);
  assert.ok(g.flowAcc instanceof Float32Array);
  assert.ok(g.flowDir instanceof Int8Array);
  assert.ok(g.owner instanceof Int16Array);
  assert.ok(g.plate instanceof Int8Array);
  assert.ok(g.biome instanceof Uint8Array);
  assert.ok(g.flags instanceof Uint16Array);
});

test("owner initialises to -1 (unowned) and flowDir to -1 (no outlet)", () => {
  const g = makeGrid({ w: 4, h: 4, cellKm: 0.5 });
  for (let i = 0; i < 16; i++) {
    assert.equal(g.owner[i], -1);
    assert.equal(g.flowDir[i], -1);
  }
});

// Every field where 0 is a MEANINGFUL value must start at a sentinel, or a
// pass that forgets to fill it hands the next pass a plausible answer. These
// four are Plan D's G-PIN-SAT inputs: a zeroed fetch/depth/fresh reads as
// "coastal, at sea level, on a river", which is a green receipt for nothing.
test("plate and the four pinned-constraint fields start at their -1 sentinels", () => {
  const g = makeGrid({ w: 4, h: 4, cellKm: 0.5 });
  for (let i = 0; i < 16; i++) {
    assert.equal(g.plate[i], -1, `plate[${i}]`);
    assert.equal(g.landform[i], -1, `landform[${i}]`);
    assert.equal(g.fetchKm[i], -1, `fetchKm[${i}]`);
    assert.equal(g.depthM[i], -1, `depthM[${i}]`);
    assert.equal(g.freshKm[i], -1, `freshKm[${i}]`);
  }
  // elev/moist/temp/flowAcc/biome/flags are the fields where 0 IS the correct
  // "nothing here yet" value, so they are zero-filled by construction.
  for (const f of ["elev", "moist", "temp", "flowAcc", "flags", "biome"])
    assert.equal(g[f][0], 0, `${f} must start at 0`);
});

test("FLAG bits are distinct powers of two and frozen", () => {
  const values = Object.values(FLAG);
  assert.equal(new Set(values).size, values.length);
  for (const v of values) assert.equal(v & (v - 1), 0, `${v} is not a power of two`);
  assert.throws(() => { FLAG.SEA = 999; });
});

test("the flag set fits Uint16Array, so no bit can be silently dropped", () => {
  for (const [k, v] of Object.entries(FLAG))
    assert.ok(v <= 0x8000, `FLAG.${k} = ${v} does not fit a Uint16Array cell`);
});

test("the substrate bits are exactly three, mutually exclusive, and their mask agrees", () => {
  assert.deepEqual([...SUBSTRATE_FLAGS], [FLAG.CARBONATE, FLAG.VOLCANIC, FLAG.SAND]);
  assert.equal(SUBSTRATE_MASK, FLAG.CARBONATE | FLAG.VOLCANIC | FLAG.SAND);
  assert.equal(SUBSTRATE_FLAGS.reduce((a, b) => a | b, 0), SUBSTRATE_MASK);
  assert.throws(() => { SUBSTRATE_FLAGS.push(1); });
  // nearFlag must NOT be able to ask for a substrate: the predicate domain is
  // deliberately smaller than the flag set (a row cannot be "near sandstone").
  for (const f of SUBSTRATE_FLAGS) assert.equal(f & ~SUBSTRATE_MASK, 0);
});

test("idx and cellCentreKm are exact inverses on the grid lattice", () => {
  const g = makeGrid({ w: 800, h: 800, cellKm: 0.5 });
  assert.equal(idx({ grid: g, cx: 0, cy: 0 }), 0);
  assert.equal(idx({ grid: g, cx: 799, cy: 799 }), 639999);
  assert.deepEqual(cellCentreKm({ grid: g, cx: 0, cy: 0 }), [0.25, 0.25]);
  assert.deepEqual(cellCentreKm({ grid: g, cx: 799, cy: 799 }), [399.75, 399.75]);
});

test("cx and cy invert idx for every cell of a small grid", () => {
  const g = makeGrid({ w: 7, h: 5, cellKm: 0.5 });
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 7; x++) {
      const i = idx({ grid: g, cx: x, cy: y });
      assert.equal(cx({ grid: g, i }), x);
      assert.equal(cy({ grid: g, i }), y);
    }
  assert.equal(cellAreaKm2({ grid: g }), 0.25);
});

test("D8 is eight distinct unit steps in a FIXED order, frozen", () => {
  // The ORDER is the contract, not just the membership: every tie-break in the
  // pipeline resolves to the lowest index in THIS order, so a reordering
  // silently moves flow directions, Poisson siting and Dijkstra results. The
  // previous version of this test asserted only count, distinctness and
  // magnitude — swapping entries 0 and 1 left it green (review finding).
  assert.deepEqual(D8.map(([a, b]) => [a, b]), [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ]);
  assert.equal(D8.length, 8);
  assert.equal(new Set(D8.map(([a, b]) => `${a},${b}`)).size, 8);
  for (const [dx, dy] of D8) {
    assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1);
    assert.ok(dx !== 0 || dy !== 0);
  }
  assert.throws(() => { D8.push([0, 0]); });
  // EVERY row, not row 0: unfreezing D8 row 2 survived a full mutation run
  // (review finding). A frozen array of live rows is not a frozen table.
  for (const [r, row] of D8.entries()) {
    assert.ok(Object.isFrozen(row), `D8 row ${r} is not frozen`);
    assert.throws(() => { row[0] = 5; }, `D8 row ${r} is writable`);
    assert.throws(() => { row.push(0); }, `D8 row ${r} is extensible`);
  }
});

// THE EAST EDGE WRAPS. `idx({ cx: 800, cy: 10 })` on the 800-wide grid returns
// 8800, which decodes to (0, 11) — the east coast joined to the west coast one
// row up. Tasks 3-9 walk D8 neighbours over all 640,000 cells for flow routing,
// flood fill, Poisson siting and Dijkstra; a wrap there produces a plausible
// world rather than a crash, which is the class this programme keeps shipping.
// idx stays unguarded on purpose (see its header); `inBounds` and
// `neighbourIdx` are the guard, and this is the fixture that proves the edge is
// answered rather than wrapped.
test("the grid has a named bounds guard, and the east edge does NOT wrap to the west", () => {
  const g = makeGrid({});
  // The hazard itself, pinned so nobody "fixes" idx and drops the helpers.
  assert.equal(idx({ grid: g, cx: 800, cy: 10 }), 8800);
  assert.equal(cx({ grid: g, i: 8800 }), 0);
  assert.equal(cy({ grid: g, i: 8800 }), 11);

  assert.ok(inBounds({ grid: g, cx: 0, cy: 0 }));
  assert.ok(inBounds({ grid: g, cx: 799, cy: 799 }));
  for (const [x, y] of [[800, 10], [-1, 10], [10, 800], [10, -1], [800, 800]])
    assert.ok(!inBounds({ grid: g, cx: x, cy: y }), `(${x}, ${y}) must be out of bounds`);

  // D8[0] is east. From the east edge that is off-grid, not the west edge.
  assert.equal(neighbourIdx({ grid: g, i: idx({ grid: g, cx: 799, cy: 10 }), d: 0 }), -1);
  assert.equal(neighbourIdx({ grid: g, i: idx({ grid: g, cx: 0, cy: 10 }), d: 4 }), -1);   // west from the west edge
  assert.equal(neighbourIdx({ grid: g, i: idx({ grid: g, cx: 10, cy: 0 }), d: 6 }), -1);   // north from the north edge
  assert.equal(neighbourIdx({ grid: g, i: idx({ grid: g, cx: 10, cy: 799 }), d: 2 }), -1); // south from the south edge
  // …and an interior walk still visits exactly the eight D8 offsets.
  const here = idx({ grid: g, cx: 400, cy: 400 });
  const got = D8.map((_, d) => neighbourIdx({ grid: g, i: here, d }));
  assert.deepEqual(got, D8.map(([dx, dy]) => idx({ grid: g, cx: 400 + dx, cy: 400 + dy })));
  assert.equal(new Set(got).size, 8);
  // Every corner cell has exactly three in-bounds neighbours; every edge cell
  // five. A wrap would report eight everywhere, which is how it stays invisible.
  const live = (x, y) => D8.filter((_, d) => neighbourIdx({ grid: g, i: idx({ grid: g, cx: x, cy: y }), d }) >= 0).length;
  for (const [x, y] of [[0, 0], [799, 0], [0, 799], [799, 799]]) assert.equal(live(x, y), 3, `corner (${x}, ${y})`);
  for (const [x, y] of [[400, 0], [0, 400], [799, 400], [400, 799]]) assert.equal(live(x, y), 5, `edge (${x}, ${y})`);
  assert.equal(live(400, 400), 8);
});

test("setFlag / hasFlag / clearFlag touch one bit and leave the rest alone", () => {
  const g = makeGrid({ w: 2, h: 2, cellKm: 0.5 });
  setFlag({ grid: g, i: 1, flag: FLAG.SEA });
  setFlag({ grid: g, i: 1, flag: FLAG.GLACIER });
  assert.ok(hasFlag({ grid: g, i: 1, flag: FLAG.SEA }));
  assert.ok(hasFlag({ grid: g, i: 1, flag: FLAG.GLACIER }));
  assert.ok(!hasFlag({ grid: g, i: 0, flag: FLAG.SEA }));
  clearFlag({ grid: g, i: 1, flag: FLAG.SEA });
  assert.ok(!hasFlag({ grid: g, i: 1, flag: FLAG.SEA }));
  assert.ok(hasFlag({ grid: g, i: 1, flag: FLAG.GLACIER }), "clearing SEA cleared a neighbour bit");
});

test("biomeName and regionId read through the index tables, and answer null when unset", () => {
  const g = makeGrid({ w: 2, h: 2, cellKm: 0.5 });
  assert.equal(g.biomeName(0), null, "no biome vocabulary yet");
  assert.equal(g.regionId(0), null, "owner is -1");
  g.biomeNames = ["ocean", "karst"];
  g.regionIds = ["c03/r07"];
  g.biome[0] = 1;
  g.owner[0] = 0;
  assert.equal(g.biomeName(0), "karst");
  assert.equal(g.regionId(0), "c03/r07");
  g.owner[1] = 4;                       // an owner with no row in regionIds
  assert.equal(g.regionId(1), null);
});

test("elevM turns the model's 0..1 elevation into metres", () => {
  const g = makeGrid({ w: 2, h: 2, cellKm: 0.5 });
  g.elev[0] = 0.42;
  assert.ok(Math.abs(g.elevM(0) - 420) < 1e-3);
});

test("makeGrid defaults to the pinned 800 x 800 x 0.5 km frame", () => {
  // makeGrid() with NO argument at all, not just `{}`: the plan's signature had
  // no `= {}` default and would have thrown here, and removing the default the
  // implementer added survived a full mutation run.
  assert.deepEqual([makeGrid().w, makeGrid().h, makeGrid().cellKm, makeGrid().n], [800, 800, 0.5, 640000]);
  const g = makeGrid({});
  assert.equal(g.w, 800);
  assert.equal(g.h, 800);
  assert.equal(g.cellKm, 0.5);
  assert.equal(g.n, 640000);
  assert.equal(g.w * g.cellKm, 400, "the grid must cover the 400 km frame exactly");
});

test("resident footprint is measured over EVERY field and stays under 24 MB", () => {
  // THE MEASUREMENT WAS WRONG, and its own guard comment ("a field is missing")
  // was the thing that was false. This test summed a hardcoded NINE arrays; the
  // same commit added four more (landform, fetchKm, depthM, freshKm) for Plan
  // D's G-PIN-SAT and counted them nowhere. 14.04 MB measured, 22.58 MB
  // actually allocated — and a tenth field added outside the list would not
  // have reddened it either. STATE §6 trap 7 in its literal form.
  //
  // 14.7 MB was an ESTIMATE in the plan preamble, never a budget, so the fix is
  // the measurement and not a smaller grid. The cap below is set from the real
  // number with headroom for one more Float32 field.
  const g = makeGrid({ w: 800, h: 800, cellKm: 0.5 });
  const fields = Object.entries(g).filter(([, v]) => ArrayBuffer.isView(v));
  assert.equal(fields.length, 13, `${fields.length} typed arrays — a field was added or removed without re-measuring`);
  const bytes = fields.reduce((s, [, a]) => s + a.byteLength, 0);
  assert.equal(bytes, 23680000, "the footprint moved; re-state it in grid.mjs's header and in budgets.json's cellKmWhy");
  assert.ok(bytes < 24 * 1024 * 1024, `${bytes} bytes resident`);
  // Every field is n cells long: a short one is a field allocated against the
  // wrong extent, which no byte total can see.
  for (const [k, a] of fields) assert.equal(a.length, g.n, `${k} is ${a.length} cells, not ${g.n}`);
});
