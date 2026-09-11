// F-038 Task 14 — the reject/rebuild verdict store.
//
// A verdict is a WORK ORDER for the art pipeline, not a diary entry: art-forge
// or asset-forge reads content/review-queue.json and regenerates what is
// listed, using the note as the instruction. That is why a verdict without a
// note is refused outright, and why the committed file — not localStorage — is
// the source of truth.
//
// localStorage is only the unsaved working buffer, so marking is instant and
// survives a reload before you export.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, VERDICTS } from "../js/review/store.mjs";

const COMMITTED = {
  version: 1,
  verdicts: {
    "mob:aggressive": {
      verdict: "rebuild",
      note: "silhouette reads as a barrel",
    },
  },
};

test("the vocabulary is exactly reject and rebuild", () => {
  assert.deepEqual([...VERDICTS].sort(), ["rebuild", "reject"]);
});

test("reads committed verdicts", () => {
  const s = createStore({ committed: COMMITTED, local: {} });
  assert.equal(s.get("mob:aggressive").verdict, "rebuild");
  assert.equal(s.get("nothing:here"), null);
});

test("a local mark overrides the committed one for the same key", () => {
  const s = createStore({
    committed: COMMITTED,
    local: { "mob:aggressive": { verdict: "reject", note: "off-canon" } },
  });
  assert.equal(s.get("mob:aggressive").verdict, "reject");
});

test("an unknown verdict is refused", () => {
  const s = createStore({ committed: {}, local: {} });
  assert.throws(() => s.set("a", "maybe", "hmm"), /verdict/);
});

test("a missing or whitespace-only note is refused", () => {
  const s = createStore({ committed: {}, local: {} });
  assert.throws(() => s.set("a", "reject", ""), /note/);
  assert.throws(() => s.set("a", "reject", "   "), /note/);
  assert.throws(() => s.set("a", "reject", undefined), /note/);
});

test("set then get round-trips, and clear removes", () => {
  const s = createStore({ committed: {}, local: {} });
  s.set("a", "reject", "muddy colours");
  assert.deepEqual(s.get("a"), { verdict: "reject", note: "muddy colours" });
  s.clear("a");
  assert.equal(s.get("a"), null);
});

test("unsavedCount counts only what differs from committed", () => {
  const s = createStore({ committed: COMMITTED, local: {} });
  assert.equal(s.unsavedCount(), 0);

  // Re-asserting the identical committed verdict is not a change.
  s.set("mob:aggressive", "rebuild", "silhouette reads as a barrel");
  assert.equal(s.unsavedCount(), 0);

  s.set("mob:aggressive", "reject", "off-canon");
  assert.equal(s.unsavedCount(), 1);

  s.set("weapon:axe", "rebuild", "haft too short");
  assert.equal(s.unsavedCount(), 2);
});

test("clearing a committed verdict counts as an unsaved change", () => {
  const s = createStore({ committed: COMMITTED, local: {} });
  s.clear("mob:aggressive");
  assert.equal(s.unsavedCount(), 1);
  assert.equal(s.get("mob:aggressive"), null);
});

test("exportJson is byte-stable regardless of insertion order", () => {
  const a = createStore({ committed: {}, local: {} });
  a.set("z", "reject", "n1");
  a.set("a", "rebuild", "n2");

  const b = createStore({ committed: {}, local: {} });
  b.set("a", "rebuild", "n2");
  b.set("z", "reject", "n1");

  assert.equal(a.exportJson(), b.exportJson());
  // Stable across repeated calls too — an unstable export would churn the
  // committed file's diff on every save.
  assert.equal(a.exportJson(), a.exportJson());
});

test("exportJson merges committed and local, and drops cleared keys", () => {
  const s = createStore({ committed: COMMITTED, local: {} });
  s.set("weapon:axe", "reject", "wrong era");
  s.clear("mob:aggressive");
  const out = JSON.parse(s.exportJson());
  assert.deepEqual(Object.keys(out.verdicts), ["weapon:axe"]);
  assert.equal(out.version, 1);
});

test("counts by verdict drive the sidebar filters", () => {
  const s = createStore({ committed: COMMITTED, local: {} });
  s.set("weapon:axe", "reject", "wrong era");
  assert.deepEqual(s.counts(), { reject: 1, rebuild: 1 });
});

test("keysWith returns the keys carrying a given verdict", () => {
  const s = createStore({ committed: COMMITTED, local: {} });
  s.set("weapon:axe", "reject", "wrong era");
  assert.deepEqual(s.keysWith("reject"), ["weapon:axe"]);
  assert.deepEqual(s.keysWith("rebuild"), ["mob:aggressive"]);
});

test("a malformed committed file degrades to empty rather than throwing", () => {
  for (const bad of [
    null,
    undefined,
    {},
    { verdicts: null },
    { verdicts: 7 },
  ]) {
    const s = createStore({ committed: bad, local: {} });
    assert.equal(s.get("anything"), null);
    assert.equal(s.unsavedCount(), 0);
  }
});
