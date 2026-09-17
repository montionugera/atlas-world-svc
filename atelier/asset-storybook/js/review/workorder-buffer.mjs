// F-053 Phase 1 — browser buffer for Forge work orders (fixes C2.9).
//
// Same model as the review verdict buffer (js/review/ui.mjs): the committed
// content/review-queue.json is the source of truth; localStorage only holds
// orders issued in this browser that have not been exported + committed yet.
// Pure: the caller passes the storage object, so node tests use a fake.

export const WORK_ORDER_LS_KEY = "atlas-storybook-forge-workorders-v1";

const isOrder = (o) =>
  !!o &&
  typeof o === "object" &&
  ["id", "briefId", "cell", "reason", "createdAt"].every((k) => typeof o[k] === "string");

/** @param {{ storage: Storage | null }} opts */
export function readOrderBuffer({ storage }) {
  if (!storage) return { orders: [], ok: false };
  try {
    const raw = storage.getItem(WORK_ORDER_LS_KEY);
    if (!raw) return { orders: [], ok: true };
    const parsed = JSON.parse(raw);
    return { orders: Array.isArray(parsed) ? parsed.filter(isOrder) : [], ok: true };
  } catch {
    return { orders: [], ok: false };
  }
}

/** @param {{ storage: Storage | null, orders: object[] }} opts @returns {boolean} saved */
export function writeOrderBuffer({ storage, orders }) {
  if (!storage) return false;
  try {
    storage.setItem(WORK_ORDER_LS_KEY, JSON.stringify(orders));
    return true;
  } catch {
    return false;
  }
}

/** @param {{ committed: {workOrders?: object[]}, buffered: object[] }} opts */
export function pendingBufferedOrders({ committed, buffered }) {
  const committedIds = new Set((committed.workOrders || []).map((o) => o.id));
  return buffered.filter((o) => !committedIds.has(o.id));
}

/**
 * What a (re)mount should adopt as the new in-memory session orders.
 *
 * A tab remount (e.g. switching away from and back to the Forge tab) calls
 * this on every mount. When the buffer read failed — storage unavailable, a
 * quota error on an earlier write, corrupt JSON — `buffer.orders` is `[]`,
 * and blindly adopting it would silently wipe every order issued earlier in
 * this same session. Only trust the buffer when it read cleanly; otherwise
 * keep re-deriving from whatever is already in memory (`current`), so an
 * in-memory-only session degrades gracefully instead of losing data.
 *
 * @param {{ committed: {workOrders?: object[]}, buffer: {orders: object[], ok: boolean}, current: object[] }} opts
 */
export function resolveSessionOrders({ committed, buffer, current }) {
  return pendingBufferedOrders({ committed, buffered: buffer.ok ? buffer.orders : current });
}
