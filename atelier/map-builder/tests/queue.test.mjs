import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
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
// Splices a synchronous report.json write into a `node -e` fixture script,
// the same way the real generator writes it before exiting.
const writeReportSrc = (path, obj) => `require('fs').writeFileSync(${JSON.stringify(path)}, ${JSON.stringify(JSON.stringify(obj))})`;

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
  // report.json is written DURING the run (as the real generator would,
  // before it exits) — not pre-seeded before enqueue() — so this fixture
  // can't be confused with a stale file left over from an earlier run.
  const reportSrc = writeReportSrc(join(out, "report.json"), { seaToLandRatio: 1.5, landKm2: 100, totals: { settlements: 3, landformInstances: 4, regions: 5 } });
  const q = createJobQueue({ ...s.queue.options, commandsFor: () => [{ label: "generate", argv: [process.execPath, "-e",
    `console.log('stage: P1 premise-masks 1 ms'); ${reportSrc}`] },
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

// I4 (round 1): a stale report.json left over from an EARLIER run in the
// same (deterministic) out dir must never be attributed to a job that
// didn't produce it — the failing command here writes no report.json of
// its own, so the pre-seeded stale one must be cleared, not read.
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

// I4 (round 2): a failing run that writes its OWN fresh report.json before
// exiting (e.g. a loop-budget failure caught after the generator already
// wrote the report) must keep those metrics — round 1 over-corrected by
// gating metrics on result.ok, which discarded exactly this case.
test("failed run that writes a fresh report.json keeps its own metrics", async () => {
  const s = setup();
  const out = join(s.dir, "build/mapforge/8f81c0aa-3.0.0"); mkdirSync(out, { recursive: true });
  const reportSrc = writeReportSrc(join(out, "report.json"), { seaToLandRatio: 1.2, landKm2: 200, totals: { settlements: 6, landformInstances: 7, regions: 8 } });
  const q = createJobQueue({ ...s.queue.options, commandsFor: () => [{ label: "generate", argv: [process.execPath, "-e",
    `${reportSrc}; console.error('generate-world: LOOP BUDGET generate 13000 ms'); process.exitCode = 1`] }] });
  const j = q.enqueue({ kind: "draft", seed: seed(8) });
  await q.onIdle();
  const done = q.store.get(j.id);
  assert.equal(done.status, "failed");
  assert.match(done.error, /LOOP BUDGET/);
  assert.deepEqual(done.metrics, { seaLand: 1.2, landKm2: 200, settlements: 6, landforms: 7, regions: 8 });
  s.cleanup();
});

// m1 (re-review round 3): a non-draft job (dry-run today; publish/undo in
// Phase 2) shares the draft's deterministic out dir. It must not clear or
// read that draft's report.json — doing so would erase the metrics Task 7's
// review payload (spec.md ~line 103) builds from it.
test("a draft's report.json survives a later non-draft job on the same out dir", async () => {
  const s = setup();
  const out = join(s.dir, "build/mapforge/9f81c0aa-3.0.0"); mkdirSync(out, { recursive: true });
  const reportObj = { seaToLandRatio: 1.7, landKm2: 300, totals: { settlements: 1, landformInstances: 2, regions: 3 } };
  const reportSrc = writeReportSrc(join(out, "report.json"), reportObj);
  const q = createJobQueue({ ...s.queue.options, commandsFor: ({ job }) => job.kind === "draft"
    ? [{ label: "generate", argv: [process.execPath, "-e", reportSrc] }]
    : [{ label: "dry-run", argv: [process.execPath, "-e", "console.log('promote-world: DRY RUN — 0 written, 0 deleted')"] }] });

  const draft = q.enqueue({ kind: "draft", seed: seed(9) });
  await q.onIdle();
  assert.deepEqual(q.store.get(draft.id).metrics, { seaLand: 1.7, landKm2: 300, settlements: 1, landforms: 2, regions: 3 });

  const dryRun = q.enqueue({ kind: "dry-run", seed: seed(9) });
  await q.onIdle();
  const done = q.store.get(dryRun.id);
  assert.equal(done.status, "succeeded");
  assert.equal(done.metrics, null);
  assert.deepEqual(JSON.parse(readFileSync(join(out, "report.json"), "utf8")), reportObj);
  s.cleanup();
});

// Task 18 — re-run determinism badge. The fake generator writes a
// manifest.json { hashes } into the out dir the way the real one does
// (writeRun); a succeeded draft records it, and a re-run compares its own
// against the original's.
const writeManifestSrc = (path, hashes) => `require('fs').writeFileSync(${JSON.stringify(path)}, ${JSON.stringify(JSON.stringify({ hashes }))})`;
const manifestSetup = (hashesByRun) => {
  const s = setup();
  const out = join(s.dir, "build/mapforge/af81c0aa-3.0.0"); mkdirSync(out, { recursive: true });
  let run = 0;
  const q = createJobQueue({ ...s.queue.options, commandsFor: () => [{ label: "generate", argv: [process.execPath, "-e",
    writeManifestSrc(join(out, "manifest.json"), hashesByRun[Math.min(run++, hashesByRun.length - 1)])] }] });
  return { ...s, q };
};
test("a succeeded draft records manifest.json's hashes; a re-run with identical hashes → rerunMatch identical", async () => {
  const s = manifestSetup([{ a: "1", b: "2" }, { a: "1", b: "2" }]);
  const original = s.q.enqueue({ kind: "draft", seed: seed("a") }); await s.q.onIdle();
  assert.deepEqual(s.q.store.get(original.id).manifestHashes, { a: "1", b: "2" });
  assert.equal(s.q.store.get(original.id).rerunMatch, null, "an original is not a re-run");
  const rerun = s.q.enqueue({ kind: "draft", seed: seed("a"), rerunOf: original.id }); await s.q.onIdle();
  const done = s.q.store.get(rerun.id);
  assert.equal(done.status, "succeeded");
  assert.equal(done.rerunMatch, "identical");
  assert.deepEqual(done.rerunDiff, []);
  assert.deepEqual(done.manifestHashes, { a: "1", b: "2" });
  s.cleanup();
});
test("a re-run whose hashes differ → rerunMatch differs, rerunDiff names the changed keys", async () => {
  const s = manifestSetup([{ a: "1", b: "2" }, { a: "2", b: "2", c: "9" }]);
  const original = s.q.enqueue({ kind: "draft", seed: seed("a") }); await s.q.onIdle();
  const rerun = s.q.enqueue({ kind: "draft", seed: seed("a"), rerunOf: original.id }); await s.q.onIdle();
  const done = s.q.store.get(rerun.id);
  assert.equal(done.rerunMatch, "differs");
  assert.deepEqual(done.rerunDiff, ["a", "c"], "a changed, c added; b unchanged");
  s.cleanup();
});
test("a re-run of an interrupted record is accepted, and stays unbadged when the original recorded no hashes", async () => {
  const s = manifestSetup([{ a: "1" }]);
  // The way recoverInterrupted() leaves a record after a killed service — no manifestHashes ever recorded.
  const interrupted = s.q.store.create({ kind: "draft", seed: seed("a"), outDir: "build/mapforge/af81c0aa-3.0.0", status: "interrupted", error: "service restarted" });
  const rerun = s.q.enqueue({ kind: "draft", seed: seed("a"), rerunOf: interrupted.id }); await s.q.onIdle();
  const done = s.q.store.get(rerun.id);
  assert.equal(done.status, "succeeded");
  assert.equal(done.rerunOf, interrupted.id);
  assert.equal(done.rerunMatch, null);
  assert.deepEqual(done.manifestHashes, { a: "1" });
  s.cleanup();
});
test("a failed draft records no manifestHashes even if a manifest.json exists in the out dir", async () => {
  const s = setup();
  const out = join(s.dir, "build/mapforge/bf81c0aa-3.0.0"); mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ hashes: { stale: "x" } }));
  const q = createJobQueue({ ...s.queue.options, commandsFor: () => [{ label: "generate", argv: [process.execPath, "-e", "process.exitCode = 1"] }] });
  const j = q.enqueue({ kind: "draft", seed: seed("b") }); await q.onIdle();
  assert.equal(q.store.get(j.id).status, "failed");
  assert.equal(q.store.get(j.id).manifestHashes, null);
  s.cleanup();
});

// Composite-job fixture (fix round 1, A + B): a publish whose snapshot step
// waits on a gate the test releases, an undo, and a 300 ms draft — all fake,
// no repo or snapshot store touched. Everything lives under one mkdtempSync dir.
const compositeSetup = ({ runner = createRunner({ killGraceMs: 100 }) } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "mb-q-pub-"));
  const store = createJobStore({ dir: join(dir, "jobs") });
  const repo = { repoRoot: dir, timeouts: { draft: 5000, publish: 5000 }, generatorVersion: "3.0.0",
    branch: () => ({ name: "feat/x", detached: false }), contentGateDeps: () => true, currentSeed: () => "0123456789abcdef" };
  let releaseSnapshot; const snapshotGate = new Promise((r) => { releaseSnapshot = r; });
  const commandsFor = ({ kind }) => {
    if (kind === "publish") return [
      { label: "snapshot", fn: async () => { await snapshotGate; } },
      { label: "promote", argv: [process.execPath, "-e", "setTimeout(() => {}, 400)"] },
    ];
    if (kind === "undo") return [{ label: "restore", fn: async () => {} }, { label: "check", argv: [process.execPath, "-e", "setTimeout(() => {}, 300)"] }];
    return [{ label: "generate", argv: [process.execPath, "-e", "setTimeout(() => {}, 300)"] }];
  };
  const queue = createJobQueue({ store, runner, repo, concurrency: 2, stageCount: 18, commandsFor,
    events: { emit: () => {} }, snapshots: { prune: () => [], get: (id) => ({ id, seed: "0123456789abcdef" }) }, world: { read: () => ({}) } });
  const draft = store.create({ kind: "draft", seed: "0123456789abcdef", outDir: "build/mapforge/01234567-3.0.0", status: "succeeded" });
  const tick = (ms) => new Promise((r) => setTimeout(r, ms));
  return { dir, store, queue, draft, releaseSnapshot, tick, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};
const isConflict = (re) => (e) => e instanceof ConflictError && e.code === 409 && re.test(e.message);

test("a running publish or undo refuses cancel with 409 at every step, including the in-process snapshot step", async () => {
  const s = compositeSetup();
  try {
    const job = s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id });
    await s.tick(50);
    assert.equal(s.store.get(job.id).steps.at(-1).name, "snapshot");
    assert.throws(() => s.queue.cancel(job.id), isConflict(/cannot be cancelled/), "cancel during step 1 (fn) is refused, not silently ignored");
    s.releaseSnapshot();
    await s.tick(100);
    assert.throws(() => s.queue.cancel(job.id), isConflict(/cannot be cancelled/), "cancel during promote");
    await s.queue.onIdle();
    assert.equal(s.store.get(job.id).status, "succeeded");

    const undo = s.queue.enqueue({ kind: "undo", snapshotId: "2026-01-01T00-00-00.000Z-0123456789abcdef" });
    await s.tick(100);
    assert.equal(s.store.get(undo.id).steps.at(-1).name, "check");
    assert.throws(() => s.queue.cancel(undo.id), isConflict(/running undo cannot be cancelled/), "cancel during undo's check step, after restore");
    await s.queue.onIdle();
    assert.equal(s.store.get(undo.id).status, "succeeded");
  } finally { s.cleanup(); }
});

test("a draft or dry-run enqueued while a publish is queued or running → 409, and nothing starts beside it", async () => {
  const s = compositeSetup();
  try {
    const pub = s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id });
    for (const kind of ["draft", "dry-run"])
      assert.throws(() => s.queue.enqueue({ kind, seed: seed(1) }), isConflict(/publish or undo is queued or running/), kind);
    assert.equal(s.queue.running(), 1);
    s.releaseSnapshot();
    await s.queue.onIdle();
    assert.equal(s.store.get(pub.id).status, "succeeded");
    assert.equal(s.store.list({ kind: "draft" }).length, 1, "only the fixture draft — the refused ones were never created");
    s.queue.enqueue({ kind: "draft", seed: seed(1) }); // idle again → accepted
    await s.queue.onIdle();
  } finally { s.cleanup(); }
});

test("a publish or undo enqueued while any draft is queued or running → 409", async () => {
  const s = compositeSetup();
  try {
    s.releaseSnapshot();
    const d = s.queue.enqueue({ kind: "draft", seed: seed(2) });
    assert.throws(() => s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id }), isConflict(/needs an idle queue/));
    assert.throws(() => s.queue.enqueue({ kind: "undo", snapshotId: "2026-01-01T00-00-00.000Z-0123456789abcdef" }), isConflict(/needs an idle queue/));
    await s.queue.onIdle();
    assert.equal(s.store.get(d.id).status, "succeeded");
    assert.equal(s.store.list({ kind: "publish" }).length + s.store.list({ kind: "undo" }).length, 0);
    s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id }); // idle again → accepted
    await s.queue.onIdle();
  } finally { s.cleanup(); }
});

test("cancelRunningForShutdown cancels a running draft and reports no composite", async () => {
  const s = compositeSetup();
  try {
    const d = s.queue.enqueue({ kind: "draft", seed: seed(3) });
    assert.deepEqual(s.queue.cancelRunningForShutdown(), { compositeInFlight: false, errors: [] });
    await s.queue.onIdle();
    assert.equal(s.store.get(d.id).status, "cancelled");
  } finally { s.cleanup(); }
});

test("cancelRunningForShutdown detects a publish in its snapshot step by kind and leaves it running", async () => {
  const s = compositeSetup();
  try {
    const job = s.queue.enqueue({ kind: "publish", draftJobId: s.draft.id });
    await s.tick(50);
    assert.deepEqual(s.queue.cancelRunningForShutdown(), { compositeInFlight: true, errors: [] });
    s.releaseSnapshot();
    await s.queue.onIdle();
    assert.equal(s.store.get(job.id).status, "succeeded", "never cancelled");
  } finally { s.cleanup(); }
});

test("cancelRunningForShutdown reports a throwing cancel as an error, never as a composite in flight", async () => {
  let finish;
  const runner = { cancel: () => { throw new Error("boom"); }, run: () => new Promise((r) => { finish = r; }) };
  const s = compositeSetup({ runner });
  try {
    const d = s.queue.enqueue({ kind: "draft", seed: seed(4) });
    await s.tick(10);
    const r = s.queue.cancelRunningForShutdown();
    assert.equal(r.compositeInFlight, false);
    assert.deepEqual(r.errors, [`${d.id}: boom`]);
    finish({ ok: true, exitCode: 0, error: null, cancelled: false, timedOut: false, captured: {} });
    await s.queue.onIdle();
  } finally { s.cleanup(); }
});

// n1 (re-review): the runJob catch path emits world.changed for a composite
// too — a throw inside queue code itself (not the runner) must still refresh
// the UI's publishAllowed/undoAvailable state, same as any other terminal.
test("a composite whose queue code throws before running still emits world.changed", async () => {
  const s = compositeSetup();
  try {
    const events = [];
    const q = createJobQueue({ ...s.queue.options, events: { emit: (type) => events.push(type) },
      commandsFor: () => { throw new Error("commandsFor boom"); } });
    const job = q.enqueue({ kind: "publish", draftJobId: s.draft.id });
    await q.onIdle();
    const done = q.store.get(job.id);
    assert.equal(done.status, "failed");
    assert.match(done.error, /commandsFor boom/);
    assert.equal(events.filter((t) => t === "world.changed").length, 1);
  } finally { s.cleanup(); }
});
