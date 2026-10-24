// W2-D — Forge drafts -> POST /api/review-queue/work-orders (js/forge/work-orders.mjs),
// and the buffer dedupe that keys on the server-stored clientId.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WORK_ORDERS_URL,
  postWorkOrders,
  toWireOrder,
} from "../js/forge/work-orders.mjs";
import {
  pendingBufferedOrders,
  resolveSessionOrders,
} from "../js/review/workorder-buffer.mjs";

const draft = (id, over = {}) => ({
  id,
  clientId: id,
  briefId: "A1-ART-02",
  cell: "render",
  seed: 7,
  reason: "too dark",
  createdAt: "2026-10-23T00:00:00.000Z",
  ...over,
});

const reply = (status, body, { json = true } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (!json) throw new SyntaxError("not json");
    return body;
  },
});

test("toWireOrder sends only the fields the server accepts, kind forge", () => {
  assert.deepEqual(toWireOrder(draft("wo-A1-ART-02-render-1-1")), {
    kind: "forge",
    clientId: "wo-A1-ART-02-render-1-1",
    briefId: "A1-ART-02",
    cell: "render",
    reason: "too dark",
    seed: 7,
  });
});

test("toWireOrder omits an unset seed and never leaks createdAt / local id", () => {
  const wire = toWireOrder(draft("x1", { seed: undefined, cell: "gate" }));
  assert.equal("seed" in wire, false);
  assert.equal("createdAt" in wire, false);
  assert.equal("id" in wire, false);
});

test("toWireOrder falls back to id when an older buffered order has no clientId", () => {
  const { clientId, ...legacy } = draft("wo-legacy-1");
  assert.equal(toWireOrder(legacy).clientId, "wo-legacy-1");
});

test("postWorkOrders POSTs JSON to the work-orders route and returns the new queue", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return reply(200, {
      ok: true,
      created: ["wo-0001"],
      skipped: [],
      queue: { workOrders: [{ id: "wo-0001" }] },
    });
  };
  const out = await postWorkOrders([draft("c1")], { fetchImpl });
  assert.equal(seen.url, WORK_ORDERS_URL);
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers["Content-Type"], "application/json");
  assert.deepEqual(
    JSON.parse(seen.init.body).workOrders.map((o) => o.clientId),
    ["c1"],
  );
  assert.deepEqual(out.created, ["wo-0001"]);
  assert.equal(out.queue.workOrders[0].id, "wo-0001");
});

test("postWorkOrders surfaces the server's refusal message", async () => {
  const fetchImpl = async () =>
    reply(400, {
      error: { code: "BAD_REQUEST", message: "a work order needs a reason" },
    });
  await assert.rejects(
    postWorkOrders([draft("c1")], { fetchImpl }),
    /HTTP 400 — a work order needs a reason/,
  );
});

test("postWorkOrders reports a bare status when the error body is not JSON", async () => {
  const fetchImpl = async () => reply(502, null, { json: false });
  await assert.rejects(
    postWorkOrders([draft("c1")], { fetchImpl }),
    /^Error: HTTP 502$/,
  );
});

test("postWorkOrders lets a network failure through so the caller keeps the drafts", async () => {
  const fetchImpl = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(
    postWorkOrders([draft("c1")], { fetchImpl }),
    /Failed to fetch/,
  );
});

test("postWorkOrders refuses an empty batch and a reply with no queue", async () => {
  await assert.rejects(postWorkOrders([]), /no draft work orders/);
  const fetchImpl = async () => reply(200, { ok: true });
  await assert.rejects(
    postWorkOrders([draft("c1")], { fetchImpl }),
    /no queue/,
  );
});

test("a draft the server stored under its clientId is no longer pending", () => {
  const committed = {
    workOrders: [{ id: "wo-0001", clientId: "c1", briefId: "A1-ART-02" }],
  };
  const pending = pendingBufferedOrders({
    committed,
    buffered: [draft("c1"), draft("c2")],
  });
  assert.deepEqual(
    pending.map((o) => o.id),
    ["c2"],
  );
});

test("resolveSessionOrders applies the clientId dedupe on a clean buffer read", () => {
  const committed = { workOrders: [{ id: "wo-0001", clientId: "c1" }] };
  const sessions = resolveSessionOrders({
    committed,
    buffer: { ok: true, orders: [draft("c1"), draft("c2")] },
    current: [],
  });
  assert.deepEqual(
    sessions.map((o) => o.id),
    ["c2"],
  );
});
