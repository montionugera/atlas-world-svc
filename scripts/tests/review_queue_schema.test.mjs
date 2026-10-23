// content/review-queue.json has one canonical schema now (SSOT merge W0-5). It is
// written by scripts/atlas_world_web/review_queue.py and read by the observatory,
// so it is validated here against content/schemas/review-queue.schema.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileSchema } from "../lib/story.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const failures = [];
const validate = compileSchema(
  join(ROOT, "content/schemas/review-queue.schema.json"),
  "review-queue schema",
  (m) => failures.push(m),
);

test("the schema compiles", () => {
  assert.deepEqual(failures, []);
  assert.equal(typeof validate, "function");
});

test("the committed content/review-queue.json satisfies the schema", () => {
  const doc = JSON.parse(
    readFileSync(join(ROOT, "content/review-queue.json"), "utf8"),
  );
  assert.ok(validate(doc), JSON.stringify(validate.errors));
});

test("the canonical shapes validate and the legacy explorer shapes are refused", () => {
  const base = {
    version: 1,
    verdicts: {},
    workOrders: [],
    proposals: [],
    playerScaleAnchor: {},
  };
  const good = {
    ...base,
    verdicts: {
      "mob:aggressive": {
        verdict: "reject",
        note: "too tall",
        updatedAt: "2026-10-23T00:00:00Z",
        source: "proposal:rq-1",
      },
    },
    workOrders: [
      {
        id: "wo-0001",
        kind: "forge",
        clientId: "c1",
        briefId: "A1-ART-02",
        cell: "render",
        reason: "redo",
        seed: 3,
      },
      { id: "wo-001", proposalId: "rq-1", feedback: "legacy explorer order" },
    ],
  };
  assert.ok(validate(good), JSON.stringify(validate.errors));
  // the pre-merge explorer verdict shape {status, notes} is no longer a verdict
  assert.equal(
    validate({
      ...base,
      verdicts: { orc_warlord: { status: "approved", notes: "ok" } },
    }),
    false,
  );
  assert.equal(
    validate({ ...base, verdicts: { a: { verdict: "reject", note: "   " } } }),
    false,
  );
  assert.equal(
    validate({ ...base, verdicts: { a: { verdict: "approve", note: "x" } } }),
    false,
  );
  assert.equal(
    validate({ ...base, workOrders: [{ id: "wo-0002", cell: "nope" }] }),
    false,
  );
});
