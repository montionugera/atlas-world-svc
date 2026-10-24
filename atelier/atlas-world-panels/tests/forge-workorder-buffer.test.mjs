// F-053 Phase 1 — C2.9: work orders issued on the Forge tab lived only in
// module memory and vanished on reload. They now buffer in localStorage (like
// review verdicts, js/review/ui.mjs) until exported and committed; once the
// committed review-queue.json carries an order's id, the buffer drops it.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  WORK_ORDER_LS_KEY,
  readOrderBuffer,
  writeOrderBuffer,
  pendingBufferedOrders,
  resolveSessionOrders,
} from "../js/review/workorder-buffer.mjs";

const order = (id, over = {}) => ({
  id,
  briefId: "A1-ART-02",
  cell: "render",
  reason: "too dark",
  createdAt: "2026-09-14T00:00:00.000Z",
  ...over,
});

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}

test("write then read round-trips orders under the versioned key", () => {
  const storage = memoryStorage();
  assert.equal(writeOrderBuffer({ storage, orders: [order("wo-1", { seed: 7 })] }), true);
  assert.ok(storage.map.has(WORK_ORDER_LS_KEY));
  assert.deepEqual(readOrderBuffer({ storage }), { orders: [order("wo-1", { seed: 7 })], ok: true });
});

test("an empty buffer reads as no orders, ok", () => {
  assert.deepEqual(readOrderBuffer({ storage: memoryStorage() }), { orders: [], ok: true });
});

test("unavailable or throwing storage never throws: ok is false", () => {
  const throwing = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };
  assert.deepEqual(readOrderBuffer({ storage: throwing }), { orders: [], ok: false });
  assert.equal(writeOrderBuffer({ storage: throwing, orders: [order("wo-1")] }), false);
  assert.deepEqual(readOrderBuffer({ storage: null }), { orders: [], ok: false });
  assert.equal(writeOrderBuffer({ storage: null, orders: [] }), false);
});

test("corrupt JSON or malformed entries are dropped, not trusted", () => {
  const storage = memoryStorage();
  storage.setItem(WORK_ORDER_LS_KEY, "{not json");
  assert.deepEqual(readOrderBuffer({ storage }), { orders: [], ok: false });
  storage.setItem(WORK_ORDER_LS_KEY, JSON.stringify([order("wo-1"), { id: "wo-2" }, "junk"]));
  assert.deepEqual(readOrderBuffer({ storage }).orders, [order("wo-1")]);
});

test("orders already in the committed queue are no longer pending in the buffer", () => {
  const committed = { workOrders: [order("wo-1")] };
  assert.deepEqual(
    pendingBufferedOrders({ committed, buffered: [order("wo-1"), order("wo-2")] }).map((o) => o.id),
    ["wo-2"],
  );
  assert.deepEqual(pendingBufferedOrders({ committed: {}, buffered: [order("wo-3")] }).map((o) => o.id), ["wo-3"]);
});

// F-053 Batch B fix — a tab remount must never destroy work orders issued
// earlier in this session just because the buffer read failed (storage
// unavailable / corrupt JSON). resolveSessionOrders is the pure decision
// forge.mjs's loadOrders delegates to: adopt the buffer only when it read
// cleanly, otherwise keep re-filtering whatever is already in memory.
test("resolveSessionOrders adopts the buffer's orders when the read succeeded", () => {
  const committed = {};
  const buffer = { orders: [order("wo-1")], ok: true };
  assert.deepEqual(
    resolveSessionOrders({ committed, buffer, current: [order("wo-2")] }).map((o) => o.id),
    ["wo-1"],
  );
});

test("resolveSessionOrders keeps the in-memory orders when the buffer read failed", () => {
  const committed = {};
  const buffer = { orders: [], ok: false };
  assert.deepEqual(
    resolveSessionOrders({ committed, buffer, current: [order("wo-2")] }).map((o) => o.id),
    ["wo-2"],
  );
});

test("resolveSessionOrders still filters out orders that reached the committed queue, on both paths", () => {
  const committed = { workOrders: [order("wo-1")] };
  assert.deepEqual(
    resolveSessionOrders({ committed, buffer: { orders: [order("wo-1")], ok: true }, current: [] }),
    [],
  );
  assert.deepEqual(
    resolveSessionOrders({
      committed,
      buffer: { orders: [], ok: false },
      current: [order("wo-1"), order("wo-2")],
    }).map((o) => o.id),
    ["wo-2"],
  );
});
