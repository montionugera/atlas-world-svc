import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { statusText, groupSteps, progress, rowActions, validateSeed, badgeCount, reduce, reduceConnection, INITIAL_CONNECTION_STATUS } from "../js/map-builder-model.mjs";

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

// Fix round 1, D1: after one transient SSE error the browser auto-reconnects
// and fires "open" again — reduceConnection must settle back to "live" (so
// the DOM layer stops polling) rather than getting stuck "polling" forever,
// and a lone reconnect with no prior error must not start polling at all.
test("reduceConnection: sse.error moves to polling, sse.open always settles to live", () => {
  assert.equal(reduceConnection(INITIAL_CONNECTION_STATUS, "sse.open"), "live");
  let c = reduceConnection(INITIAL_CONNECTION_STATUS, "sse.error");
  assert.equal(c, "polling");
  c = reduceConnection(c, "sse.open"); // reconnect after the error
  assert.equal(c, "live");
  c = reduceConnection(c, "sse.error"); // a second, later error
  assert.equal(c, "polling");
  c = reduceConnection(c, "sse.open");
  assert.equal(c, "live");
});
