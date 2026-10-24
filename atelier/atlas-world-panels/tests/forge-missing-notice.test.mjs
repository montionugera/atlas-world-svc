// F-053 Phase 1 — out/ PNGs are gitignored (0 of the 59 ledgered renders are
// tracked), so in CI, in the image and in most checkouts every card said
// "png missing" on its own. The Forge tab now shows ONE notice per batch.
import { test } from "node:test";
import assert from "node:assert/strict";

import { PNG_MISSING_LEAD, missingNoticeText } from "../js/forge/gallery.mjs";

test("the notice leads with the exact copy 'png missing (local only)'", () => {
  assert.equal(PNG_MISSING_LEAD, "png missing (local only)");
  assert.ok(missingNoticeText({ count: 3 }).startsWith("png missing (local only) — "));
});

test("the notice counts renders with correct plurals and names the gitignored directory", () => {
  assert.match(missingNoticeText({ count: 1 }), /— 1 render in this batch;/);
  assert.match(missingNoticeText({ count: 12 }), /— 12 renders in this batch;/);
  assert.match(missingNoticeText({ count: 12 }), /atelier\/art-forge\/out\/ is gitignored/);
});
