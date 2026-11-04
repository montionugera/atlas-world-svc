import test from "node:test";
import assert from "node:assert/strict";
import { gridIntersectionArea } from "../lib/spine.mjs";

const square = (x, y, s) => ({ shape: "polygon", points: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]], anchor: [x, y] });
const pairs = [
  { key: "first", a: { placement: square(0, 0, 4) }, b: { placement: square(2, 2, 4) }, cell: 1 },
  { key: "second", a: { placement: square(0, 0, 3) }, b: { placement: square(9, 9, 2) }, cell: 1 },
  { key: "third", a: { placement: square(0, 0, 2) }, b: { placement: square(0, 0, 2) }, cell: 1 },
];

test("pool retains every serial result in pair order", async () => {
  const { computePairAreas } = await import("../lib/geometry-lock-worker.mjs");
  const expected = pairs.map((p) => gridIntersectionArea({ a: p.a.placement, b: p.b.placement, cell: p.cell }));
  assert.deepEqual(expected, [4, 0, 4]);
  assert.deepEqual(await computePairAreas(pairs, 2), expected);
  assert.deepEqual(await computePairAreas(pairs, 1), expected);
});

test("a worker exception rejects instead of dropping a pair", async () => {
  const { computePairAreas } = await import("../lib/geometry-lock-worker.mjs");
  await assert.rejects(computePairAreas([...pairs, { key: "broken", a: null, b: null, cell: 1 }], 2));
});
