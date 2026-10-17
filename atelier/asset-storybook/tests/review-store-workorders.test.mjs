// F-050 Task 5 — forge work orders appended to content/review-queue.json.
//
// A work order is a re-run request issued from the Forge tab: the UI never
// executes anything, it appends an order here and exports the file; the next
// human-run forge session consumes the orders. Same contract as verdicts —
// the committed file is the source of truth.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQueue, serializeQueue, addWorkOrder } from "../js/review/store.mjs";

const base = { version: 1, verdicts: {}, workOrders: [] };

test("addWorkOrder appends with id + createdAt, validates cell", () => {
  const q = addWorkOrder(base, { briefId: "A1-ART-03", cell: "render", seed: 44, reason: "flagged" });
  assert.equal(q.workOrders.length, 1);
  const wo = q.workOrders[0];
  assert.match(wo.id, /^wo-A1-ART-03-render-\d+-\d+$/);
  assert.ok(wo.createdAt);
  assert.throws(() => addWorkOrder(base, { briefId: "X", cell: "explode", reason: "r" }));
  assert.throws(() => addWorkOrder(base, { briefId: "X", cell: "gate" })); // reason required
});

test("addWorkOrder does not mutate its input queue", () => {
  addWorkOrder(base, { briefId: "A1-ART-03", cell: "render", seed: 44, reason: "flagged" });
  assert.deepEqual(base.workOrders, []);
});

test("addWorkOrder rejects a negative or non-integer seed", () => {
  assert.throws(() => addWorkOrder(base, { briefId: "X", cell: "render", seed: -1, reason: "r" }));
  assert.throws(() => addWorkOrder(base, { briefId: "X", cell: "render", seed: 1.5, reason: "r" }));
  // omitting seed entirely is fine (non-render cells have no seed)
  const q = addWorkOrder(base, { briefId: "X", cell: "intake", reason: "r" });
  assert.equal(q.workOrders[0].seed, undefined);
});

test("serializeQueue is byte-stable across calls (sorted keys)", () => {
  const q = addWorkOrder(base, { briefId: "A1-ART-03", cell: "render", seed: 44, reason: "flagged" });
  assert.equal(serializeQueue(q), serializeQueue(q));
});

test("serializeQueue preserves work-order array order but sorts verdict keys", () => {
  let q = parseQueue(JSON.stringify({ version: 1, verdicts: {}, workOrders: [] }));
  q = addWorkOrder(q, { briefId: "B", cell: "blockin", reason: "first" });
  q = addWorkOrder(q, { briefId: "A", cell: "gate", reason: "second" });
  const back = parseQueue(serializeQueue(q));
  assert.deepEqual(
    back.workOrders.map((w) => w.briefId),
    ["B", "A"],
  );
});

test("parseQueue accepts legacy file without workOrders key", () => {
  const q = parseQueue(JSON.stringify({ version: 1, verdicts: {} }));
  assert.deepEqual(q.workOrders, []);
});

// F-050 Task 9 — the exact round-trip the Forge tab performs: orders are
// appended in-session via addWorkOrder, exported with serializeQueue, the
// downloaded file is committed, and any later parseQueue of it must yield
// the identical order objects.
test("UI round-trip: addWorkOrder → serializeQueue → parseQueue is lossless", () => {
  let q = parseQueue(JSON.stringify({ version: 1, verdicts: {} }));
  q = addWorkOrder(q, {
    briefId: "A1-ART-02",
    cell: "render",
    seed: 44,
    reason: "flagged: low SW corner score",
  });
  q = addWorkOrder(q, { briefId: "A1-ART-02", cell: "gate", reason: "re-check after re-render" });
  const back = parseQueue(serializeQueue(q));
  assert.equal(back.workOrders.length, 2);
  assert.deepEqual(back.workOrders, q.workOrders);
  // And a re-export of the parsed-back queue is byte-identical — a human
  // re-exporting an unchanged committed file must not churn the git diff.
  assert.equal(serializeQueue(back), serializeQueue(q));
});
