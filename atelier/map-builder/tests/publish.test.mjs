import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJobStore } from "../lib/jobs.mjs";
import { createRunner } from "../lib/runner.mjs";
import { createJobQueue, ConflictError } from "../lib/queue.mjs";
import { createSnapshots } from "../lib/snapshots.mjs";
import { createWorldReader } from "../lib/world.mjs";
import { PUBLISH_STEPS, PNG_WARNING, PUBLISH_REFUSED_ON_MAIN, SCRIPTS_DEPS_MISSING } from "../lib/publish.mjs";
import { makeFakeRepoRoot, makeFakeRepo, fakeTools } from "./fake-repo.mjs";

const DRAFT_SEED = "0123456789abcdef";
const WORLD = "content/world/fabric/world.json";
const ADDED = "content/spine/nodes/n-ZZZ-added-by-publish.json";

// Every path this suite writes or deletes is under a mkdtempSync dir it owns:
// the fake repo root and a separate data dir (job store + snapshot store).
const setup = (t, { branch = "feat/F-052", deps = true, keep = 3, toolOpts = {} } = {}) => {
  const fake = makeFakeRepoRoot();
  const data = mkdtempSync(join(tmpdir(), "mb-pub-data-"));
  t.after(() => { fake.cleanup(); rmSync(data, { recursive: true, force: true }); });
  const state = { branch, deps };
  const repo = makeFakeRepo({ root: fake.root, state });
  const store = createJobStore({ dir: join(data, "jobs") });
  const snapshots = createSnapshots({ repoRoot: fake.root, dir: join(data, "snapshots"), keep });
  const events = [];
  const world = createWorldReader({ repo, store, snapshots });
  const queue = createJobQueue({ store, runner: createRunner({ killGraceMs: 100 }), repo, concurrency: 2, stageCount: 18,
    events: { emit: (type, payload) => events.push({ type, ...payload }) }, snapshots, world,
    tools: fakeTools({ draftSeed: DRAFT_SEED, ...toolOpts }) });
  const draft = store.create({ kind: "draft", seed: DRAFT_SEED, outDir: "build/mapforge/01234567-3.0.0", status: "succeeded" });
  const bytes = (rel) => readFileSync(join(fake.root, rel));
  return { root: fake.root, data, state, repo, store, snapshots, events, queue, draft, bytes };
};

test("happy path: six steps, publishedBy on the draft, world.changed emitted, snapshots pruned to keep", async (t) => {
  const s = setup(t, { keep: 2 });
  // Two older snapshots (distinct seeds so their ids never collide) — with
  // keep: 2 the publish's own snapshot must push one of them out.
  s.snapshots.create({ seed: "aaaaaaaaaaaaaaaa" });
  s.snapshots.create({ seed: "bbbbbbbbbbbbbbbb" });
  const job = s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id });
  await s.queue.onIdle();
  const done = s.store.get(job.id);
  assert.equal(done.status, "succeeded", done.error);
  assert.deepEqual(done.steps.map((x) => x.name), PUBLISH_STEPS);
  assert.ok(done.steps.every((x) => x.status === "done" && typeof x.label === "string" && typeof x.ms === "number"));
  assert.equal(done.steps.find((x) => x.name === "render").runs, 17);
  assert.equal(done.steps.find((x) => x.name === "verify").runs, 3);
  assert.equal(s.store.get(s.draft.id).publishedBy, job.id);
  // Batch H review I2: enqueueing a publish IS the owner's "accepted"
  // decision — recorded on the draft and pushed as a job frame so the
  // badge/banner stop counting it as "to review" without a reload.
  const decided = s.store.get(s.draft.id).review;
  assert.equal(decided.decision, "accepted");
  assert.deepEqual(decided.reasons, []);
  assert.ok(decided.at);
  const draftFrames = s.events.filter((e) => e.job?.id === s.draft.id);
  assert.ok(draftFrames.length >= 1, "a job frame for the draft was emitted");
  assert.equal(draftFrames[0].job.review.decision, "accepted");
  assert.equal(draftFrames[0].job._seq, undefined);
  assert.ok(done.snapshotId, "snapshotId recorded");
  assert.equal(s.repo.currentSeed(), DRAFT_SEED);
  const changed = s.events.filter((e) => e.type === "world.changed");
  assert.equal(changed.length, 1);
  assert.equal(changed[0].world.seed, DRAFT_SEED);
  const kept = s.snapshots.list();
  assert.equal(kept.length, 2);
  assert.equal(kept[0].id, done.snapshotId, "the publish's own snapshot is the newest and survives the prune");
});

test("failure at lock auto-restores the snapshot: failed, restored, world bytes back, added file removed", async (t) => {
  const s = setup(t, { toolOpts: { fail: "lock" } });
  const before = s.bytes(WORLD);
  const job = s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id });
  await s.queue.onIdle();
  const done = s.store.get(job.id);
  assert.equal(done.status, "failed");
  assert.equal(done.restored, true);
  assert.equal(done.error, "G-RENDER-LOCK: lock failed on purpose");
  assert.equal(done.steps.at(-1).name, "lock");
  assert.equal(done.steps.at(-1).status, "failed");
  assert.deepEqual(s.bytes(WORLD), before);
  assert.equal(existsSync(join(s.root, ADDED)), false);
  assert.match(s.store.readLog(job.id), /^\[restore\] /m);
  assert.equal(s.store.get(s.draft.id).publishedBy, undefined);
  // Emitted on every composite terminal state (fix round 1) — here the world
  // is back to its old seed and publish is allowed again.
  const changed = s.events.filter((e) => e.type === "world.changed");
  assert.equal(changed.length, 1);
  assert.equal(changed[0].world.seed, JSON.parse(before).seed);
  assert.equal(changed[0].world.publishAllowed, true);
  assert.equal(changed[0].world.undoAvailable, false, "an auto-restored publish leaves nothing to undo");
});

test("auto-restore failure: failed, restored:false, restoreError + 'undo by hand' log line, world.changed, undo still offered", async (t) => {
  const s = setup(t, { toolOpts: { fail: "lock" } });
  s.snapshots.restore = () => { throw new Error("snapshots: disk on fire"); };
  const job = s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id });
  await s.queue.onIdle();
  const done = s.store.get(job.id);
  assert.equal(done.status, "failed");
  assert.equal(done.restored, false);
  assert.equal(done.restoreError, "snapshots: disk on fire");
  assert.equal(done.error, "G-RENDER-LOCK: lock failed on purpose", "error stays the failing step's");
  assert.ok(done.snapshotId);
  assert.match(s.store.readLog(job.id), new RegExp(`^\\[restore\\] FAILED .*undo from snapshot ${done.snapshotId} by hand`, "m"));
  const changed = s.events.filter((e) => e.type === "world.changed");
  assert.equal(changed.length, 1, "the world may be half-published — the UI must refresh");
  assert.equal(changed[0].world.seed, DRAFT_SEED, "promote ran and nothing put it back");
  assert.equal(changed[0].world.undoAvailable, true);
});

test("undoAvailable: interrupted first publish → true; after its undo → false; a later publish → true", async (t) => {
  const s = setup(t);
  const world = createWorldReader({ repo: s.repo, store: s.store, snapshots: s.snapshots });
  assert.equal(world.read().undoAvailable, false, "no snapshot at all");
  // A crash mid-publish: the snapshot is on disk, recoverInterrupted() marked the job.
  const snap = s.snapshots.create({ seed: s.repo.currentSeed() });
  s.store.create({ kind: "publish", seed: DRAFT_SEED, draftJobId: s.draft.id, status: "interrupted", startedAt: snap.at, snapshotId: snap.id, restored: false, error: "service restarted" });
  assert.equal(world.read().undoAvailable, true, "no publish ever succeeded, but the interrupted one's snapshot is restorable");
  await new Promise((r) => setTimeout(r, 5)); // the undo must start strictly after the snapshot's `at`
  const undo = s.queue.enqueue({ kind: "undo", snapshotId: snap.id });
  await s.queue.onIdle();
  assert.equal(s.store.get(undo.id).status, "succeeded", s.store.get(undo.id).error);
  assert.equal(world.read().undoAvailable, false, "the undo already put that snapshot back");
  await new Promise((r) => setTimeout(r, 5));
  s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id });
  await s.queue.onIdle();
  assert.equal(world.read().undoAvailable, true, "a new publish's snapshot is undoable again");
});

test("a draft queued or running disables publish in /api/world (mirrors the queue's idle-queue 409)", (t) => {
  const s = setup(t);
  const world = createWorldReader({ repo: s.repo, store: s.store, snapshots: s.snapshots });
  assert.equal(world.read().publishAllowed, true);
  s.store.create({ kind: "draft", seed: "2123456789abcdef", outDir: "build/mapforge/21234567-3.0.0", status: "running" });
  const w = world.read();
  assert.equal(w.publishAllowed, false);
  assert.match(w.publishReason, /draft or dry-run is still queued or running/);
});

test("branch main or detached HEAD → 409 at enqueue, no snapshot taken, no job created", (t) => {
  for (const branch of ["main", null]) {
    const s = setup(t, { branch });
    assert.throws(() => s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id }),
      (e) => e instanceof ConflictError && e.code === 409 && e.message === PUBLISH_REFUSED_ON_MAIN);
    assert.equal(s.snapshots.list().length, 0);
    assert.equal(s.store.list({ kind: "publish" }).length, 0);
  }
});

test("missing scripts deps → 409 before any snapshot", (t) => {
  const s = setup(t, { deps: false });
  assert.throws(() => s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id }),
    (e) => e instanceof ConflictError && e.message === SCRIPTS_DEPS_MISSING);
  assert.equal(s.snapshots.list().length, 0);
});

test("draft not succeeded (or unknown) → 404", (t) => {
  const s = setup(t);
  const failed = s.store.create({ kind: "draft", seed: "1123456789abcdef", outDir: "build/mapforge/11234567-3.0.0", status: "failed" });
  assert.throws(() => s.queue.enqueue({ kind: "publish", draftJobId: failed.id }), (e) => e.status === 404);
  assert.throws(() => s.queue.enqueue({ kind: "publish", draftJobId: "j_20260913_000000_deadbeef" }), (e) => e.status === 404);
  assert.throws(() => s.queue.enqueue({ kind: "publish", draftJobId: "../../etc" }), (e) => e.status === 400);
  assert.equal(s.snapshots.list().length, 0);
});

test("a second publish (or an undo) while one is queued → 409", async (t) => {
  const s = setup(t);
  s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id });
  assert.throws(() => s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id }), (e) => e instanceof ConflictError);
  assert.throws(() => s.queue.enqueue({ kind: "undo", snapshotId: "whatever" }), (e) => e instanceof ConflictError);
  await s.queue.onIdle();
});

test("undo of the publish's snapshot restores the world and emits world.changed", async (t) => {
  const s = setup(t);
  const before = s.bytes(WORLD);
  const pub = s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id });
  await s.queue.onIdle();
  const { snapshotId } = s.store.get(pub.id);
  assert.equal(s.repo.currentSeed(), DRAFT_SEED);
  const undo = s.queue.enqueue({ kind: "undo", snapshotId });
  await s.queue.onIdle();
  const done = s.store.get(undo.id);
  assert.equal(done.status, "succeeded", done.error);
  assert.deepEqual(done.steps.map((x) => x.name), ["restore", "check"]);
  assert.deepEqual(s.bytes(WORLD), before);
  assert.equal(existsSync(join(s.root, ADDED)), false);
  const changed = s.events.filter((e) => e.type === "world.changed");
  assert.equal(changed.length, 2);
  assert.equal(changed[1].world.seed, JSON.parse(before).seed);
});

test("undo rejects unsafe ids (400) and unknown ids (404) before enqueueing", (t) => {
  const s = setup(t);
  for (const bad of ["../x", "a/b", "a\\b", "..", ""]) assert.throws(() => s.queue.enqueue({ kind: "undo", snapshotId: bad }), (e) => e.status === 400, bad);
  assert.throws(() => s.queue.enqueue({ kind: "undo", snapshotId: "2026-01-01T00-00-00.000Z-aaaaaaaaaaaaaaaa" }), (e) => e.status === 404);
  assert.equal(s.store.list({ kind: "undo" }).length, 0);
  assert.equal(readdirSync(join(s.data, "snapshots")).length, 0);
});

test("undo of a corrupt snapshot → 422 (not a 409 conflict), no job created", (t) => {
  const s = setup(t);
  const snap = s.snapshots.create({ seed: "aaaaaaaaaaaaaaaa" });
  writeFileSync(join(s.data, "snapshots", snap.id, "snapshot.json"), "{not json");
  assert.throws(() => s.queue.enqueue({ kind: "undo", snapshotId: snap.id }), (e) => !(e instanceof ConflictError) && e.status === 422 && /corrupt/.test(e.message));
  assert.equal(s.store.list({ kind: "undo" }).length, 0);
});

test("render skip line records a PNG warning on the render step; the job still succeeds", async (t) => {
  const s = setup(t, { toolOpts: { render: "skip" } });
  const job = s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id });
  await s.queue.onIdle();
  const done = s.store.get(job.id);
  assert.equal(done.status, "succeeded", done.error);
  const render = done.steps.find((x) => x.name === "render");
  assert.equal(render.warning, PNG_WARNING);
  assert.equal(render.status, "done");
});
