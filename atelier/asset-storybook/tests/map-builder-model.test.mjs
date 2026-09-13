import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { statusText, groupSteps, progress, rowActions, validateSeed, badgeCount, reduce } from "../js/map-builder-model.mjs";

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
