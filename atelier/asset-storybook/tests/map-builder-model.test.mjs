import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  statusText,
  groupSteps,
  progress,
  rowActions,
  validateSeed,
  badgeCount,
  reduce,
  reviewRows,
  publishStepsText,
  decisionReasons,
  PUBLISH_STEPS,
} from "../js/map-builder-model.mjs";
// Drift guard (Task 16): the client cannot import server code (publish.mjs
// pulls in Node-only fs/mapforge machinery), so PUBLISH_STEPS is duplicated
// in map-builder-model.mjs by hand — this test is what makes that drift fail
// loudly instead of silently, by importing the server's real export directly
// (this test file runs under node:test, not the browser, so the import itself
// is safe here even though map-builder-model.mjs could never do the same).
import { PUBLISH_STEPS as SERVER_PUBLISH_STEPS } from "../../map-builder/lib/publish.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STEPS = JSON.parse(readFileSync(path.resolve(HERE, "../../map-builder/steps.json"), "utf8"));
const job = (o) => ({ id: "j1", kind: "draft", status: "queued", steps: [], review: { decision: null, reasons: [] }, ...o });

test("status strings are the canvas set", () => {
  assert.equal(statusText(job({}), { stageCount: 18 }), "Queued");
  assert.equal(statusText(job({ status: "running", steps: new Array(11).fill({}) }), { stageCount: 18 }), "Building · step 11 of 18");
  assert.equal(statusText(job({ status: "succeeded" }), { stageCount: 18 }), "Ready to review");
  assert.equal(statusText(job({ status: "failed", error: "generate-world: LOOP BUDGET generate 13000 ms" }), { stageCount: 18 }), "Failed · took too long");
  assert.equal(statusText(job({ status: "failed", error: "hung" }), { stageCount: 18 }), "Failed · hung");
  assert.equal(statusText(job({ status: "failed", error: "generate-world: --out x holds y" }), { stageCount: 18 }), "Failed · generate-world: --out x holds y");
  assert.equal(statusText(job({ status: "succeeded", review: { decision: "rejected", reasons: ["too much sea"] } }), { stageCount: 18 }), "Rejected · too much sea");
  assert.equal(statusText(job({ status: "succeeded", publishedBy: "j9" }), { stageCount: 18 }), "Published");
  assert.equal(statusText(job({ status: "interrupted" }), { stageCount: 18 }), "Interrupted");
});
test("groupSteps marks done/current/pending and buckets unknown stages", () => {
  const g = groupSteps({ steps: [{ name: "P1", ms: 3, runs: 1 }, { name: "P2", ms: 4, runs: 1 }, { name: "PX", label: "mystery", ms: 1, runs: 1 }], stepsJson: STEPS, running: true });
  assert.equal(g[0].stages[0].status, "done"); assert.equal(g[0].stages[2].status, "pending");
  assert.equal(g.find((x) => x.id === "other").stages[0].name, "PX");
  assert.equal(g.flatMap((x) => x.stages).filter((s) => s.status === "current").length, 1);
});
test("progress against the budgets marks", () => {
  const p = progress(job({ status: "running", startedAt: new Date(Date.now() - 7000).toISOString() }), { targetMs: 6000, failMs: 12000 });
  assert.equal(p.over, "target"); assert.equal(p.targetPct, 50); assert.ok(p.pct > 50 && p.pct < 70);
});
test("row actions by status", () => {
  assert.deepEqual(rowActions(job({ status: "running" })).map((a) => a.id), ["watch", "cancel"]);
  assert.deepEqual(rowActions(job({ status: "succeeded" })).map((a) => a.id), ["review", "rerun", "delete"]);
  assert.deepEqual(rowActions(job({ status: "failed" })).map((a) => a.id), ["why", "rerun", "delete"]);
  assert.deepEqual(rowActions(job({ status: "queued" })).map((a) => a.id), ["cancel"]);
});
test("seed validation and badge", () => {
  assert.equal(validateSeed("3f81c0aa9d2e5b17").ok, true); assert.equal(validateSeed("3F81").ok, false);
  assert.equal(badgeCount([job({ status: "succeeded" }), job({ status: "succeeded", review: { decision: "rejected", reasons: [] } }), job({ status: "failed" })]), 1);
});
test("reduce applies SSE events", () => {
  let s = reduce({ jobs: new Map(), world: null, connected: false }, { type: "job.created", job: job({}) });
  s = reduce(s, { type: "job.step", job: job({ status: "running", steps: [{ name: "P1" }] }) });
  assert.equal(s.jobs.get("j1").status, "running");
  s = reduce(s, { type: "world.changed", world: { seed: "abc" } }); assert.equal(s.world.seed, "abc");
});

// Fix round 1, D2: jobs.synced is the resync mechanism used both by the poll
// fallback AND by the new "resync on every SSE open" fix — it must upsert a
// whole page without dropping jobs the page doesn't mention.
test("jobs.synced upserts a page of jobs (the resync path for D2)", () => {
  let s = reduce({ jobs: new Map(), world: null, connected: false }, { type: "job.created", job: job({ id: "j1" }) });
  s = reduce(s, {
    type: "jobs.synced",
    jobs: [job({ id: "j1", status: "succeeded" }), job({ id: "j2", status: "queued" })],
  });
  assert.equal(s.jobs.size, 2);
  assert.equal(s.jobs.get("j1").status, "succeeded");
  assert.equal(s.jobs.get("j2").status, "queued");
});

test("connected/disconnected toggle state.connected", () => {
  let s = reduce({ jobs: new Map(), world: null, connected: false }, { type: "connected" });
  assert.equal(s.connected, true);
  s = reduce(s, { type: "disconnected" });
  assert.equal(s.connected, false);
});

// Carried from the Batch G re-review (finding n3): queue.mjs refuses to
// cancel a running publish/undo at every step (409 always) — a Cancel
// button on a running composite job can never actually do anything, so
// rowActions must not offer one for those two kinds.
test("row actions: a running publish/undo has no Cancel (the server always refuses it)", () => {
  assert.deepEqual(rowActions({ status: "running", kind: "publish" }).map((a) => a.id), ["watch"]);
  assert.deepEqual(rowActions({ status: "running", kind: "undo" }).map((a) => a.id), ["watch"]);
  assert.deepEqual(rowActions({ status: "running", kind: "draft" }).map((a) => a.id), ["watch", "cancel"]);
  assert.deepEqual(rowActions({ status: "running", kind: "dry-run" }).map((a) => a.id), ["watch", "cancel"]);
});

test("reviewRows sorts by |Δ landKm2| desc and caps at 5 unless showAll", () => {
  const row = (id, delta) => ({
    id,
    landKm2: { draft: 0, current: 0, delta },
    regions: { draft: 0, current: 0, delta: 0 },
    settlements: { draft: 0, current: 0, delta: 0 },
  });
  // Deliberately NOT pre-sorted, and mixing signs — reviewRows must sort by
  // magnitude itself, not trust the caller's order.
  const deltas = [row("c0", 1), row("c1", -8), row("c2", 3), row("c3", -2), row("c4", 5), row("c5", 0.5), row("c6", -6), row("c7", 4)];
  const review = { deltas };
  const top5 = reviewRows(review);
  assert.equal(top5.length, 5);
  assert.deepEqual(top5.map((r) => r.id), ["c1", "c6", "c4", "c7", "c2"]);
  assert.equal(reviewRows(review, { showAll: true }).length, 8);
});

test("publishStepsText returns the six publish step labels in order", () => {
  const labels = publishStepsText();
  assert.equal(labels.length, 6);
  assert.deepEqual(labels, [
    "Save a snapshot of the current world",
    "Replace the world with the draft",
    "Redraw every map sheet",
    "Check the Map Sheets index",
    "Re-baseline the render lock",
    "Verify the published world",
  ]);
});

test("the client's duplicated PUBLISH_STEPS matches the server's (drift guard)", () => {
  assert.deepEqual(PUBLISH_STEPS, SERVER_PUBLISH_STEPS);
});

test("decisionReasons is the fixed five-reason set", () => {
  assert.deepEqual(decisionReasons, [
    "too much sea",
    "too little sea",
    "coastline too regular",
    "settlements misplaced",
    "other",
  ]);
});
