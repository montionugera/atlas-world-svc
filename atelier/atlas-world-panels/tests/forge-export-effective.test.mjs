// F-050 review fix — the Forge tab's work-order export must build its
// verdicts from the review store's EFFECTIVE view (committed + unsaved
// localStorage buffer), not just the committed file, or pending marks are
// silently dropped from review-queue.json.
//
// The DOM/download flow itself is browser-only; this covers the store-level
// merge path that downloadQueue() now reads via store.effective().
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../js/review/store.mjs";

const COMMITTED = {
  version: 1,
  verdicts: {
    "mob:aggressive": {
      verdict: "rebuild",
      note: "silhouette reads as a barrel",
    },
    "icon:potion": { verdict: "reject", note: "wrong palette" },
  },
};

test("effective() merges committed verdicts with the unsaved buffer", () => {
  const s = createStore({
    committed: COMMITTED,
    local: {
      "mob:aggressive": { verdict: "reject", note: "still a barrel" },
      "npc:smith": { verdict: "rebuild", note: "anvil floats" },
    },
  });
  const eff = s.effective();
  // committed key overridden by buffer
  assert.deepEqual(eff["mob:aggressive"], {
    verdict: "reject",
    note: "still a barrel",
  });
  // untouched committed key passes through
  assert.deepEqual(eff["icon:potion"], COMMITTED.verdicts["icon:potion"]);
  // buffer-only key is present
  assert.deepEqual(eff["npc:smith"], {
    verdict: "rebuild",
    note: "anvil floats",
  });
});

test("effective() honors a cleared committed verdict (CLEARED tombstone)", () => {
  const s = createStore({ committed: COMMITTED, local: {} });
  s.clear("icon:potion");
  assert.equal(s.effective()["icon:potion"], undefined);
  // clearing does not leak into other keys
  assert.ok(s.effective()["mob:aggressive"]);
});
