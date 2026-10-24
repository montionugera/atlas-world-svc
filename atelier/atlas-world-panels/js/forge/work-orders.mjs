// Forge work orders -> the observatory's single review-queue writer.
//
// Inside atlas-world the server owns content/review-queue.json. An order issued
// on the Forge panel is first a DRAFT in the browser buffer
// (js/review/workorder-buffer.mjs); "Save" POSTs the drafts here. The server
// assigns the real `wo-NNNN` id and treats a repeated clientId as a no-op, so a
// retry after a lost response never double-files an order.
//
// Pure + fetch-injectable (tests/forge-work-orders.test.mjs).

export const WORK_ORDERS_URL = "/api/review-queue/work-orders";

/** The wire shape for one buffered order; unknown fields never leave the browser. */
export function toWireOrder(order) {
  const wire = {
    kind: "forge",
    clientId: order.clientId || order.id,
    briefId: order.briefId,
    cell: order.cell,
    reason: order.reason,
  };
  if (order.seed !== undefined) wire.seed = order.seed;
  return wire;
}

async function errorDetail(res) {
  try {
    const body = await res.json();
    return (body.error && (body.error.message || body.error.code)) || "";
  } catch {
    return ""; // non-JSON error body — the status is enough
  }
}

/**
 * @param {object[]} orders  buffered drafts
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ created: string[], skipped: string[], queue: object }>}
 * @throws {Error} with the server's message when the POST is refused or unreachable
 */
export async function postWorkOrders(orders, { fetchImpl = fetch } = {}) {
  if (!Array.isArray(orders) || orders.length === 0) {
    throw new Error("no draft work orders to save");
  }
  const res = await fetchImpl(WORK_ORDERS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workOrders: orders.map(toWireOrder) }),
  });
  if (!res.ok) {
    const detail = await errorDetail(res);
    throw new Error("HTTP " + res.status + (detail ? " — " + detail : ""));
  }
  const body = await res.json();
  if (!body || !body.queue) throw new Error("server reply has no queue");
  return {
    created: Array.isArray(body.created) ? body.created : [],
    skipped: Array.isArray(body.skipped) ? body.skipped : [],
    queue: body.queue,
  };
}
