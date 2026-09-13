import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJobStore } from "../lib/jobs.mjs";
import { createRunner } from "../lib/runner.mjs";
import { createJobQueue, parseDryRun, ConflictError } from "../lib/queue.mjs";

const setup = ({ concurrency = 2, sleepMs = 300 } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "mb-q-")); const events = []; const repo = { repoRoot: dir, timeouts: { draft: 5000, publish: 5000 }, generatorVersion: "3.0.0" };
  const commandsFor = ({ job }) => [{ label: "generate", argv: [process.execPath, "-e",
    `console.log('stage: P1 premise-masks 1 ms'); setTimeout(() => { console.log('stage: P2 elevation 2 ms'); }, ${sleepMs})`] }];
  const queue = createJobQueue({ store: createJobStore({ dir: join(dir, "jobs") }), runner: createRunner({ killGraceMs: 100 }), repo,
    concurrency, stageCount: 18, commandsFor, events: { emit: (type, p) => events.push({ type, job: p.job }) } });
  return { dir, events, queue, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};
const seed = (i) => `${i}f81c0aa9d2e5b17`;

test("FIFO with at most `concurrency` running", async () => {
  const s = setup(); const jobs = [1, 2, 3].map((i) => s.queue.enqueue({ kind: "draft", seed: seed(i) }));
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(s.queue.running(), 2); assert.equal(s.queue.store.get(jobs[2].id).status, "queued");
  await s.queue.onIdle();
  const done = s.events.filter((e) => e.type === "job.done").map((e) => e.job.id);
  assert.deepEqual(done.slice(0, 2).sort(), [jobs[0].id, jobs[1].id].sort()); assert.equal(done[2], jobs[2].id);
  assert.ok(s.events.some((e) => e.type === "job.step")); s.cleanup();
});
test("same out dir twice → 409 while active", async () => {
  const s = setup(); s.queue.enqueue({ kind: "draft", seed: seed(1) });
  assert.throws(() => s.queue.enqueue({ kind: "draft", seed: seed(1) }), (e) => e instanceof ConflictError && e.code === 409);
  await s.queue.onIdle(); assert.ok(s.queue.enqueue({ kind: "draft", seed: seed(1) })); await s.queue.onIdle(); s.cleanup();
});
test("cancel queued removes it; cancel running kills it", async () => {
  const s = setup({ concurrency: 1, sleepMs: 2000 }); const a = s.queue.enqueue({ kind: "draft", seed: seed(1) }); const b = s.queue.enqueue({ kind: "draft", seed: seed(2) });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(s.queue.cancel(b.id).status, "cancelled"); assert.equal(s.queue.cancel(a.id).status, "running");
  await s.queue.onIdle(); assert.equal(s.queue.store.get(a.id).status, "cancelled"); s.cleanup();
});
test("succeeded draft records steps, durationMs, metrics from report.json and dryRun from stdout", async () => {
  const s = setup({ sleepMs: 10 });
  const out = join(s.dir, "build/mapforge/1f81c0aa-3.0.0"); mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "report.json"), JSON.stringify({ seaToLandRatio: 1.5, landKm2: 100, totals: { settlements: 3, landformInstances: 4, regions: 5 } }));
  const q = createJobQueue({ ...s.queue.options, commandsFor: () => [{ label: "generate", argv: [process.execPath, "-e", "console.log('stage: P1 premise-masks 1 ms')"] },
    { label: "dry-run", argv: [process.execPath, "-e", "console.log('promote-world: DRY RUN — 2 written, 1 deleted'); console.log('promote-world: ratio 1.5 (land 100 km²)'); console.log('  DELETE a'); console.log('  WRITE  b'); console.log('  WRITE  c')"] }] });
  const j = q.enqueue({ kind: "draft", seed: seed(1) }); await q.onIdle(); const done = q.store.get(j.id);
  assert.equal(done.status, "succeeded"); assert.equal(done.steps.length, 1); assert.ok(done.durationMs >= 0);
  assert.deepEqual(done.metrics, { seaLand: 1.5, landKm2: 100, settlements: 3, landforms: 4, regions: 5 });
  assert.deepEqual(done.dryRun, { written: 2, deleted: 1, ratio: 1.5, landKm2: 100, files: [{ op: "DELETE", path: "a" }, { op: "WRITE", path: "b" }, { op: "WRITE", path: "c" }] });
  s.cleanup();
});
test("parseDryRun handles the exact promote-world format", () => {
  assert.deepEqual(parseDryRun(["promote-world: DRY RUN — 0 written, 0 deleted"]), { written: 0, deleted: 0, ratio: null, landKm2: null, files: [] });
});
test("failed draft keeps the tool's error and exit code", async () => {
  const s = setup(); const q = createJobQueue({ ...s.queue.options, commandsFor: () => [{ label: "generate", argv: [process.execPath, "-e", "console.error('generate-world: LOOP BUDGET generate 13000 ms'); process.exitCode = 1"] }] });
  const j = q.enqueue({ kind: "draft", seed: seed(2) }); await q.onIdle(); const done = q.store.get(j.id);
  assert.equal(done.status, "failed"); assert.equal(done.exitCode, 1); assert.match(done.error, /LOOP BUDGET/); s.cleanup();
});

// I2: a throw anywhere inside runJob must not wedge the queue — no dangling
// active slot, no stuck `running` record, `onIdle()` must still resolve.
test("commandsFor throwing marks the job failed instead of wedging the queue", async () => {
  const s = setup();
  const q = createJobQueue({ ...s.queue.options, commandsFor: () => { throw new Error("commandsFor boom"); } });
  const j = q.enqueue({ kind: "draft", seed: seed(3) });
  await q.onIdle();
  const done = q.store.get(j.id);
  assert.equal(done.status, "failed");
  assert.match(done.error, /commandsFor boom/);
  assert.equal(q.running(), 0);
  s.cleanup();
});

// I2 (continued): onLine fires inside readline's 'line' handler (runner.mjs)
// via store.appendLog — a throw there must be swallowed, not crash the run.
test("a throwing onLine side effect (e.g. appendLog) does not crash the job", async () => {
  const s = setup({ sleepMs: 10 });
  const throwingStore = { ...s.queue.store, appendLog: () => { throw new Error("disk full"); } };
  const q = createJobQueue({ ...s.queue.options, store: throwingStore,
    commandsFor: () => [{ label: "generate", argv: [process.execPath, "-e", "console.log('stage: P1 premise-masks 1 ms')"] }] });
  const j = q.enqueue({ kind: "draft", seed: seed(4) });
  await q.onIdle();
  const done = q.store.get(j.id);
  assert.equal(done.status, "succeeded");
  assert.equal(q.running(), 0);
  s.cleanup();
});

// I3: close() must settle onIdle() waiters and give dropped pending jobs a
// terminal status instead of leaving them "queued" on disk forever.
test("close() settles onIdle and marks dropped pending jobs interrupted", async () => {
  const s = setup({ concurrency: 1, sleepMs: 300 });
  const a = s.queue.enqueue({ kind: "draft", seed: seed(5) });
  const b = s.queue.enqueue({ kind: "draft", seed: seed(6) });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(s.queue.store.get(a.id).status, "running");
  assert.equal(s.queue.store.get(b.id).status, "queued");
  s.queue.close();
  await s.queue.onIdle();
  assert.equal(s.queue.store.get(b.id).status, "interrupted");
  assert.equal(s.queue.store.get(a.id).status, "succeeded");
  s.cleanup();
});

// I4: a stale report.json from a previous run in the same (deterministic)
// out dir must never be attributed to a job that didn't produce it.
test("stale report.json in the out dir does not leak into a failed job's metrics", async () => {
  const s = setup();
  const out = join(s.dir, "build/mapforge/7f81c0aa-3.0.0"); mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "report.json"), JSON.stringify({ seaToLandRatio: 9.9, landKm2: 999, totals: { settlements: 9, landformInstances: 9, regions: 9 } }));
  const q = createJobQueue({ ...s.queue.options,
    commandsFor: () => [{ label: "generate", argv: [process.execPath, "-e", "console.error('generate-world: LOOP BUDGET generate 13000 ms'); process.exitCode = 1"] }] });
  const j = q.enqueue({ kind: "draft", seed: seed(7) });
  await q.onIdle();
  const done = q.store.get(j.id);
  assert.equal(done.status, "failed");
  assert.equal(done.metrics, null);
  s.cleanup();
});
