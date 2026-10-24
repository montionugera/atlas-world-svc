// W2-D — server-backed persistence in the review store: once the server has
// accepted a mark it stops counting as "unsaved", including after a reload.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, addWorkOrder } from "../js/review/store.mjs";

const COMMITTED = {
  version: 1,
  verdicts: {
    "mob:aggressive": { verdict: "rebuild", note: "barrel silhouette" },
  },
};

test("rebase makes the sent view the baseline and empties the buffer", () => {
  const persisted = [];
  const s = createStore({
    committed: COMMITTED,
    local: {},
    persist: (b) => persisted.push({ ...b }),
  });
  s.set("mob:new", "reject", "off-canon");
  s.clear("mob:aggressive");
  assert.equal(s.unsavedCount(), 2);

  s.rebase(s.effective());

  assert.equal(s.unsavedCount(), 0);
  assert.deepEqual(Object.keys(s.effective()), ["mob:new"]);
  assert.deepEqual(persisted.at(-1), {}); // localStorage is told the buffer is clear
});

test("rebase keeps a mark made after the snapshot was taken unsaved", () => {
  const s = createStore({ committed: COMMITTED, local: {} });
  s.set("mob:one", "reject", "first");
  const sent = s.effective(); // what the POST carried
  s.set("mob:two", "rebuild", "made while the POST was in flight");

  s.rebase(sent);

  assert.equal(s.unsavedCount(), 1);
  assert.equal(s.get("mob:two").verdict, "rebuild");
});

test("a buffered mark the committed file already holds is pruned on construction", () => {
  const persisted = [];
  const s = createStore({
    committed: COMMITTED,
    local: {
      "mob:aggressive": { verdict: "rebuild", note: "barrel silhouette" }, // saved last session
      "mob:pending": { verdict: "reject", note: "still unsaved" },
    },
    persist: (b) => persisted.push({ ...b }),
  });
  assert.equal(s.unsavedCount(), 1);
  assert.deepEqual(Object.keys(persisted.at(-1)), ["mob:pending"]);
});

test("a buffered clear of a verdict the server no longer has is pruned", () => {
  const s = createStore({
    committed: { version: 1, verdicts: {} },
    local: { "mob:gone": "__cleared__" },
  });
  assert.equal(s.unsavedCount(), 0);
});

test("a buffered mark that differs from committed is kept", () => {
  const s = createStore({
    committed: COMMITTED,
    local: { "mob:aggressive": { verdict: "reject", note: "changed my mind" } },
  });
  assert.equal(s.unsavedCount(), 1);
  assert.equal(s.get("mob:aggressive").verdict, "reject");
});

test("addWorkOrder carries its id as clientId so a retried POST is idempotent", () => {
  const q = addWorkOrder(
    { workOrders: [] },
    { briefId: "A1-ART-02", cell: "render", reason: "dark" },
  );
  const wo = q.workOrders[0];
  assert.equal(wo.clientId, wo.id);
  assert.match(wo.clientId, /^[A-Za-z0-9._:-]{1,120}$/); // the server's clientId rule
});
