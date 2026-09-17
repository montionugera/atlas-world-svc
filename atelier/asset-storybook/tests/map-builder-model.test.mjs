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
  reviewDecided,
  publishFailure,
  historyRows,
  rerunChains,
  logTailUrl,
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

// Batch H review I1: "Review" now opens the Review screen, whose
// /api/drafts/:id/review route 404s for anything that is not a draft — so
// only a succeeded DRAFT may offer it. Same four kinds as the n3 test above,
// because that test only covered `running` and this gap slipped through.
test("row actions: only a succeeded draft offers Review (the review route 404s for other kinds)", () => {
  assert.deepEqual(rowActions({ status: "succeeded", kind: "draft" }).map((a) => a.id), ["review", "rerun", "delete"]);
  assert.deepEqual(rowActions({ status: "succeeded", kind: "dry-run" }).map((a) => a.id), ["rerun", "delete"]);
  assert.deepEqual(rowActions({ status: "succeeded", kind: "publish" }).map((a) => a.id), ["rerun", "delete"]);
  assert.deepEqual(rowActions({ status: "succeeded", kind: "undo" }).map((a) => a.id), ["rerun", "delete"]);
});

// Batch H review I2: once a draft has been accepted (the publish enqueue
// records the decision server-side) or published, the Review screen must
// stop offering Accept/Reject — a second publish of the same draft is not
// refused by the queue, and the badge/banner would keep saying "to review".
test("reviewDecided: accepted, rejected or published drafts hide the decision controls", () => {
  assert.equal(reviewDecided(job({ status: "succeeded" })), false);
  assert.equal(reviewDecided(job({ status: "succeeded", review: { decision: "accepted", reasons: [] } })), true);
  assert.equal(reviewDecided(job({ status: "succeeded", review: { decision: "rejected", reasons: ["other"] } })), true);
  assert.equal(reviewDecided(job({ status: "succeeded", publishedBy: "j9" })), true);
  assert.equal(reviewDecided(job({ status: "succeeded", review: undefined })), false);
});
test("a draft reopened by a failed publish (re-review I4) is back to review on all three surfaces", () => {
  // The server resets the draft's review to exactly this shape after a
  // failed/interrupted publish (queue.mjs, jobs.mjs) — the draft's own status
  // is still succeeded and publishedBy was never set, so badge, table and
  // Review must all agree it is to review again.
  const reopened = job({ status: "succeeded", review: { decision: null, reasons: [], at: null } });
  assert.equal(badgeCount([reopened]), 1);
  assert.equal(reviewDecided(reopened), false);
  assert.equal(statusText(reopened), "Ready to review");
  // A draft the same failed publish frame could NOT reopen: one published for real.
  const published = job({ status: "succeeded", publishedBy: "j9", review: { decision: null, reasons: [], at: null } });
  assert.equal(reviewDecided(published), true);
  assert.equal(statusText(published), "Published");
});

// Batch H review I3: the Failed sub-view must say so when the world may be
// half-published — a failed auto-restore, or a service restart mid-publish
// (status "interrupted", which world.undoAvailable does NOT cover per the
// Task-14 review) — and name the snapshot to undo from.
test("publishFailure: restored / restore failed / interrupted pick the right copy and undo snapshot", () => {
  const steps = [{ name: "promote", label: "Replace the world with the draft", status: "done" }, { name: "lock", label: "Re-baseline the render lock", status: "failed" }];
  const ok = publishFailure({ status: "failed", steps, error: "lock failed", restored: true, snapshotId: "s1" });
  assert.equal(ok.stepText, "Failed at: Re-baseline the render lock");
  assert.equal(ok.error, "lock failed");
  assert.equal(ok.restored, true);
  assert.equal(ok.halfPublished, null);

  const bad = publishFailure({ status: "failed", steps, error: "lock failed", restored: false, restoreError: "EACCES", snapshotId: "s2" });
  assert.equal(bad.restored, false);
  assert.equal(bad.halfPublished.snapshotId, "s2");
  assert.match(bad.halfPublished.text, /^Automatic restore failed/);
  assert.match(bad.halfPublished.text, /half-published/);
  assert.match(bad.halfPublished.text, /snapshot s2/);

  const cut = publishFailure({ status: "interrupted", steps: [], error: null, restored: false, snapshotId: "s3" });
  assert.equal(cut.stepText, "Publish did not complete.");
  assert.equal(cut.error, "");
  assert.equal(cut.halfPublished.snapshotId, "s3");
  assert.match(cut.halfPublished.text, /^Service restarted mid-publish/);
  assert.match(cut.halfPublished.text, /snapshot s3/);

  // Interrupted before the snapshot step ever ran: nothing was replaced, so
  // there is nothing to undo from and no half-published warning.
  const early = publishFailure({ status: "interrupted", steps: [], restored: false, snapshotId: null });
  assert.equal(early.halfPublished, null);
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

// Task 19 — History screen rows: duration against the per-kind target, the
// over-target flag, the re-run determinism badge, and the status text the
// Start table already uses.
test("historyRows: duration vs target, over flag, badge text, interrupted status", () => {
  const targets = { draft: 6000 };
  const rows = historyRows(
    [
      job({ id: "j1", status: "succeeded", durationMs: 5400, startedAt: "2026-09-17T10:00:00.000Z" }),
      job({ id: "j2", status: "failed", durationMs: 12600, error: "generate-world: LOOP BUDGET generate 13000 ms" }),
      job({ id: "j3", status: "succeeded", durationMs: 5000, rerunOf: "j1", rerunMatch: "identical", rerunDiff: [] }),
      job({ id: "j4", status: "succeeded", durationMs: 5100, rerunOf: "j1", rerunMatch: "differs", rerunDiff: ["manifest.json"] }),
      job({ id: "j5", status: "interrupted", durationMs: null, startedAt: null }),
      job({ id: "j6", kind: "publish", status: "succeeded", durationMs: 91000 }),
      job({ id: "j7", status: "queued" }),
    ],
    { stageCount: 18, targets },
  );
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId.j1.durationText, "5.4 s / 6 s target");
  assert.equal(byId.j1.over, false);
  assert.equal(byId.j1.statusText, "Ready to review");
  assert.equal(byId.j1.startedText, "2026-09-17T10:00:00.000Z");
  assert.equal(byId.j1.rerunBadge, null);
  assert.equal(byId.j1.rerunOf, null);
  assert.equal(byId.j2.durationText, "12.6 s / 6 s target");
  assert.equal(byId.j2.over, true);
  assert.equal(byId.j2.statusText, "Failed · took too long");
  assert.equal(byId.j3.rerunBadge, "Re-run identical");
  assert.equal(byId.j3.rerunOf, "j1");
  assert.equal(byId.j4.rerunBadge, "Re-run differs");
  assert.deepEqual(byId.j4.rerunDiff, ["manifest.json"]);
  assert.equal(byId.j5.statusText, "Interrupted");
  assert.equal(byId.j5.durationText, "—");
  assert.equal(byId.j5.startedText, "—");
  // A kind with no target shows the plain duration, never "over".
  assert.equal(byId.j6.durationText, "91 s");
  assert.equal(byId.j6.over, false);
  assert.equal(byId.j6.kind, "publish");
  assert.equal(byId.j7.durationText, "—");
  assert.equal(rows.length, 7);
});

test("historyRows: a running job's duration is elapsed-so-far and the over flag tracks it", () => {
  const rows = historyRows(
    [job({ id: "j1", status: "running", startedAt: new Date(Date.now() - 7000).toISOString(), steps: new Array(3).fill({}) })],
    { stageCount: 18, targets: { draft: 6000 } },
  );
  assert.match(rows[0].durationText, /^7(\.\d)? s \/ 6 s target$/);
  assert.equal(rows[0].over, true);
  assert.equal(rows[0].statusText, "Building · step 3 of 18");
});

// Re-run chains indent every re-run (including a re-run of a re-run) under
// the root job it descends from, oldest re-run first; a re-run whose original
// is no longer in the list is its own root.
test("rerunChains groups re-runs under their root, transitively", () => {
  const chains = rerunChains([
    job({ id: "j1", createdAt: "2026-09-17T10:00:00.000Z" }),
    job({ id: "j3", createdAt: "2026-09-17T10:02:00.000Z", rerunOf: "j2" }),
    job({ id: "j2", createdAt: "2026-09-17T10:01:00.000Z", rerunOf: "j1" }),
    job({ id: "j9", createdAt: "2026-09-17T10:03:00.000Z", rerunOf: "gone" }),
    job({ id: "j5", createdAt: "2026-09-17T10:04:00.000Z" }),
  ]);
  assert.deepEqual([...chains.keys()].sort(), ["j1", "j5", "j9"]);
  assert.deepEqual(chains.get("j1"), ["j2", "j3"]);
  assert.deepEqual(chains.get("j5"), []);
  assert.deepEqual(chains.get("j9"), []);
});

test("rerunChains never loops on a malformed cycle", () => {
  const chains = rerunChains([job({ id: "a", rerunOf: "b" }), job({ id: "b", rerunOf: "a" })]);
  assert.equal([...chains.keys()].length, 1);
});

test("logTailUrl points at the tail route", () => {
  assert.equal(logTailUrl("j_20260917_100000_deadbeef", 200), "/api/jobs/j_20260917_100000_deadbeef/log?tail=200");
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
