// view/VerdictSync.mjs: the diff, and the POST/retry behaviour around it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffVerdicts, startVerdictSync } from "../js/view/VerdictSync.mjs";

const rej = (note) => ({ verdict: "reject", note });

test("diffVerdicts: nothing to send → null", () => {
  assert.equal(diffVerdicts({}, {}), null);
  assert.equal(diffVerdicts({ a: rej("x") }, { a: rej("x") }), null);
});

test("diffVerdicts: new, changed and removed keys (removed → null)", () => {
  const out = diffVerdicts(
    { a: rej("x"), b: rej("y"), c: rej("z") },
    { a: rej("x"), b: rej("changed"), d: { verdict: "rebuild", note: "n" } },
  );
  assert.deepEqual(out, {
    b: rej("changed"),
    d: { verdict: "rebuild", note: "n" },
    c: null,
  });
});

function harness({ responses }) {
  const calls = [];
  const target = new EventTarget();
  let effective = {};
  const statuses = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), method: init.method });
    const r = responses.shift() ?? { ok: true, status: 200 };
    return { ok: r.ok, status: r.status, json: async () => r.json ?? {} };
  };
  const sync = startVerdictSync({
    store: { effective: () => effective },
    committed: {},
    onStatus: (m) => statuses.push(m),
    fetchImpl,
    target,
  });
  return {
    calls,
    statuses,
    sync,
    // Dispatch only — the event IS the trigger. (An extra flush() here would retry
    // a failed POST inside the same step and hide the failure.)
    async set(v) {
      effective = v;
      target.dispatchEvent(new Event("storybook:verdict-change"));
      await new Promise((r) => setImmediate(r));
    },
  };
}

test("a mark is POSTed to /api/review-queue/asset-verdicts as {verdicts:{key:{verdict,note}}}", async () => {
  const h = harness({ responses: [] });
  await h.set({ "mob:aggressive": rej("too small") });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, "/api/review-queue/asset-verdicts");
  assert.equal(h.calls[0].method, "POST");
  assert.deepEqual(h.calls[0].body, {
    verdicts: { "mob:aggressive": rej("too small") },
  });
  assert.deepEqual(h.statuses, [null]);
});

test("clearing a verdict POSTs null for that key; an unchanged state sends nothing", async () => {
  const h = harness({ responses: [] });
  await h.set({ a: rej("x") });
  await h.set({}); // cleared
  assert.deepEqual(h.calls[1].body, { verdicts: { a: null } });
  await h.set({}); // nothing new
  assert.equal(h.calls.length, 2);
});

test("a failed POST is surfaced, and the next change re-sends the whole outstanding delta", async () => {
  const h = harness({
    responses: [
      { ok: false, status: 400, json: { error: { message: "empty note" } } },
    ],
  });
  await h.set({ a: rej("x") });
  assert.match(h.statuses.at(-1), /not saved.*400.*empty note/);
  await h.set({ a: rej("x"), b: rej("y") });
  assert.deepEqual(h.calls[1].body, { verdicts: { a: rej("x"), b: rej("y") } });
  assert.equal(h.statuses.at(-1), null);
});

test("a network error is surfaced too", async () => {
  const target = new EventTarget();
  const statuses = [];
  const sync = startVerdictSync({
    store: { effective: () => ({ a: rej("x") }) },
    committed: {},
    onStatus: (m) => statuses.push(m),
    fetchImpl: async () => {
      throw new Error("offline");
    },
    target,
  });
  const origErr = console.error;
  console.error = () => {};
  try {
    await sync.flush();
  } finally {
    console.error = origErr;
  }
  assert.match(statuses.at(-1), /offline/);
});

test("committed verdicts count as already synced", async () => {
  const target = new EventTarget();
  const calls = [];
  const sync = startVerdictSync({
    store: { effective: () => ({ a: rej("x") }) },
    committed: {
      a: { verdict: "reject", note: "x", updatedAt: "t", source: "assets" },
    },
    onStatus: () => {},
    fetchImpl: async (...a) => (calls.push(a), { ok: true, status: 200 }),
    target,
  });
  await sync.flush();
  assert.equal(calls.length, 0);
});
