import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createStageTracker } from "./stage-parser.mjs";
import { commandsForKind, outDirFor } from "./commands.mjs";
import { SEED_GRAMMAR } from "../../mapforge/generate-world.mjs";
import { JOB_ID, publicJob } from "./jobs.mjs";
import { createCompositeSteps, publishOrUndoActive, PNG_SKIP_LINE, PNG_WARNING, PUBLISH_REFUSED_ON_MAIN, SCRIPTS_DEPS_MISSING } from "./publish.mjs";

export class ConflictError extends Error { constructor(msg) { super(msg); this.code = 409; } }
const httpError = (status, message) => Object.assign(new Error(message), { status });
const isCompositeKind = (kind) => kind === "publish" || kind === "undo";
const SAFE_SNAPSHOT_ID = (id) => typeof id === "string" && id !== "" && !id.includes("/") && !id.includes("\\") && !id.includes("..");

export function parseDryRun(lines) {
  const out = { written: 0, deleted: 0, ratio: null, landKm2: null, files: [] };
  for (const l of lines) {
    let m = /^promote-world: (?:DRY RUN — )?(\d+) written, (\d+) deleted/.exec(l); if (m) { out.written = +m[1]; out.deleted = +m[2]; continue; }
    m = /^promote-world: ratio ([\d.]+) \(land ([\d.]+) km²\)/.exec(l); if (m) { out.ratio = +m[1]; out.landKm2 = +m[2]; continue; }
    m = /^  (DELETE|WRITE)\s+(\S+)$/.exec(l); if (m) out.files.push({ op: m[1], path: m[2] });
  }
  return out;
}

const readMetrics = (reportPath) => {
  const r = JSON.parse(readFileSync(reportPath, "utf8"));
  return { seaLand: r.seaToLandRatio, landKm2: r.landKm2, settlements: r.totals.settlements, landforms: r.totals.landformInstances, regions: r.totals.regions };
};

export function createJobQueue(options) {
  // snapshots/world/tools are only used by publish and undo (Task 14);
  // `tools` overrides individual tool argvs (tests only — see publish.mjs).
  const { store, runner, repo, concurrency, stageCount, commandsFor = commandsForKind, events, snapshots = null, world = null, tools } = options;
  const pending = []; // [{ job, outDir }]
  const active = new Map(); // jobId -> { job, outDir }
  let idleWaiters = [];
  let closed = false;

  const activeOutDirs = () => new Set([...pending, ...active.values()].map((e) => e.outDir));
  // Exclusivity (fix round 1, A): a publish/undo rewrites the live world that
  // drafts and dry-runs read, so it never runs alongside ANY other job.
  const compositeQueuedOrRunning = () => [...pending, ...active.values()].some((e) => isCompositeKind(e.job.kind));

  const settleIdleIfDone = () => {
    if (pending.length === 0 && active.size === 0) {
      const waiters = idleWaiters; idleWaiters = [];
      for (const resolve of waiters) resolve();
    }
  };

  // Publish auto-restore (Task 14): once the snapshot step has recorded an
  // id, ANY failure after it — a non-zero step, a hang, or a throw in this
  // file — puts the snapshot back before the job goes terminal (so the
  // single-flight guard still holds the world while the restore runs).
  const autoRestore = (id, liveJob) => {
    if (liveJob.kind !== "publish" || !liveJob.snapshotId) return { restored: false };
    try {
      const r = snapshots.restore({ id: liveJob.snapshotId });
      store.appendLog(id, `[restore] restored ${r.restored} file(s), deleted ${r.deleted} added file(s) from snapshot ${liveJob.snapshotId}\n`);
      return { restored: true };
    } catch (e) {
      const restoreError = String(e?.message ?? e);
      try { store.appendLog(id, `[restore] FAILED — the world may be half-published; undo from snapshot ${liveJob.snapshotId} by hand: ${restoreError}\n`); } catch { /* best-effort */ }
      return { restored: false, restoreError };
    }
  };

  // A publish that ends non-ok (failed, restore failed, interrupted) undoes the
  // "accepted" its enqueue recorded on the draft (re-review I4): otherwise the
  // draft is stuck — Review hides both buttons, the table says "Ready to
  // review", the badge skips it. Symmetric with the enqueue-time set: same
  // shape, same best-effort try/catch, same job.done frame for the draft
  // (repeated job.done for one id is safe — every consumer upserts by id).
  // A draft already published for real keeps its decision; publishedBy is
  // the record of that. Emitted AFTER the publish's own terminal frame.
  const reopenDraft = (publishJob) => {
    if (publishJob.kind !== "publish") return;
    try {
      const draft = store.get(publishJob.draftJobId);
      if (!draft || draft.publishedBy) return;
      events.emit("job.done", { job: publicJob(store.update(draft.id, { review: { decision: null, reasons: [], at: null } })) });
    } catch { /* draft record gone — nothing to reopen */ }
  };

  const emitWorldChanged = () => {
    try { events.emit("world.changed", { world: world.read() }); } catch { /* a world read failure must not fail the job */ }
  };

  async function runJob(entry) {
    const { job: createdJob, outDir } = entry;
    const id = createdJob.id;
    const t0 = Date.now();
    // Every terminal store.update() below shares these two fields — computed
    // once per call so `durationMs` isn't skewed across the three call sites.
    const terminalFields = (extra) => ({ endedAt: new Date().toISOString(), durationMs: Date.now() - t0, ...extra });
    // The live job object composite commands record onto (publish's snapshot
    // step sets snapshotId here; it is persisted after that step ends).
    const liveJob = { ...createdJob };
    try {
      const composite = isCompositeKind(createdJob.kind);
      const draftJob = createdJob.kind === "publish" ? store.get(createdJob.draftJobId) : null;
      const commands = commandsFor({ kind: createdJob.kind, job: liveJob, repo, snapshots, draftJob, tools });
      store.update(id, { status: "running", startedAt: new Date().toISOString() });
      events.emit("job.started", { job: publicJob(store.get(id)) });
      const tracker = createStageTracker({ stageCount });
      const cSteps = composite ? createCompositeSteps({ commands }) : null;
      const emitStep = (step) => {
        const job = store.update(id, { steps: cSteps.steps(), ...(liveJob.snapshotId ? { snapshotId: liveJob.snapshotId } : {}) });
        events.emit("job.step", { job: publicJob(job), step, stepIndex: cSteps.stepIndex(), stepCount: cSteps.stepCount });
      };
      const timeoutMs = repo.timeouts?.[createdJob.kind === "undo" ? "publish" : createdJob.kind] ?? repo.timeouts?.draft ?? 40000;
      const isDraft = createdJob.kind === "draft";
      const reportPath = isDraft ? join(repo.repoRoot, outDir, "report.json") : null; // undo has no out dir
      // The out dir is deterministic per seed+version, so a report.json left
      // over from an EARLIER run in the same dir must never be attributed to
      // THIS one (finding I4). Clear it before the command runs — it is one
      // of generate-world.mjs's own RUN_ENTRIES, so removing it up front is
      // exactly what a fresh run would do to it anyway and cannot trip
      // clearRun's foreign-entry refusal (verified against
      // generate-world.mjs's RUN_ENTRIES / clearRun). Whatever report.json
      // exists after the run — success, failure, or cancellation — was
      // written by this run (or wasn't written at all), so its metrics are
      // read regardless of outcome; a cancelled run killed before it wrote
      // a complete file simply yields metrics: null via the parse failing.
      //
      // Only a "draft" job (the one that runs generate-world.mjs) owns this
      // report.json. Other kinds (dry-run today; publish/undo in Phase 2)
      // reuse the SAME deterministic out dir as the draft they operate on —
      // clearing or reading report.json for them would erase or misattribute
      // the draft's own metrics (re-review round 3, Minor m1). They neither
      // touch the file nor derive metrics from it.
      if (isDraft) { try { rmSync(reportPath, { force: true }); } catch { /* best-effort */ } }
      const result = await runner.run({
        job: createdJob, commands, cwd: repo.repoRoot, timeoutMs,
        onLine: ({ label, stream, line }) => {
          // Runs inside readline's 'line' handler (see runner.mjs) — a throw
          // here is an uncaught exception, not a rejection. Never let one escape.
          try {
            store.appendLog(id, `[${label}] ${line}\n`);
            if (stream !== "stdout") return;
            if (composite) { if (label.startsWith("render:") && PNG_SKIP_LINE.test(line)) cSteps.warn(label, PNG_WARNING); return; }
            const ev = tracker.push(line);
            if (ev && ev.type === "job.step") {
              const job = store.update(id, { steps: tracker.steps() });
              events.emit("job.step", { job: publicJob(job), step: ev.step, stepIndex: ev.stepIndex, stepCount: ev.stepCount });
            }
          } catch { /* logged nowhere yet; must not crash the process */ }
        },
        ...(composite ? {
          onCommandStart: (cmd) => { try { emitStep(cSteps.start(cmd.label)); } catch { /* must not crash the run */ } },
          onCommandEnd: (cmd) => { try { emitStep(cSteps.end(cmd)); } catch { /* must not crash the run */ } },
        } : {}),
      });
      const status = result.cancelled ? "cancelled" : result.ok ? "succeeded" : "failed";
      if (composite) {
        const outcome = result.ok ? {} : autoRestore(id, liveJob);
        const job = store.update(id, terminalFields({
          status, exitCode: result.exitCode, error: result.error,
          steps: cSteps.steps(), snapshotId: liveJob.snapshotId ?? null, ...outcome,
        }));
        if (result.ok && createdJob.kind === "publish") {
          try { store.update(createdJob.draftJobId, { publishedBy: id }); } catch { /* draft record gone — publish itself succeeded */ }
          try { snapshots.prune(); } catch (e) { try { store.appendLog(id, `[prune] ${e?.message ?? e}\n`); } catch { /* best-effort */ } }
        }
        events.emit("job.done", { job: publicJob(job) });
        if (!result.ok) reopenDraft(createdJob);
        // Every composite terminal state (fix round 1): a success changed the
        // world, a failed restore or a failed undo `check` after its restore
        // left it changed, and even an unchanged world flips publishAllowed
        // back — the UI must refresh in all of these.
        emitWorldChanged();
        return;
      }
      // report.json at this path can only be from THIS run (see the rmSync
      // above) — read it regardless of outcome so a loop-budget failure that
      // wrote a fresh report before exiting still surfaces its metrics.
      // Non-draft kinds don't own this file (see the isDraft gate above), so
      // their metrics stay null — the brief only defines metrics for drafts.
      let metrics = null;
      if (isDraft) { try { metrics = readMetrics(reportPath); } catch { /* leave null */ } }
      const dryRun = parseDryRun(result.captured["dry-run"] ?? []);
      const job = store.update(id, terminalFields({
        status, exitCode: result.exitCode, error: result.error, steps: tracker.steps(), metrics, dryRun,
      }));
      events.emit("job.done", { job: publicJob(job) });
    } catch (e) {
      const job = store.update(id, terminalFields({
        status: "failed",
        error: String(e?.message ?? e), ...(isCompositeKind(createdJob.kind) ? { snapshotId: liveJob.snapshotId ?? null, ...autoRestore(id, liveJob) } : {}),
      }));
      events.emit("job.done", { job: publicJob(job) });
      reopenDraft(createdJob);
      if (isCompositeKind(createdJob.kind)) emitWorldChanged();
    } finally {
      active.delete(id);
      pump();
    }
  }

  function pump() {
    if (closed) { settleIdleIfDone(); return; }
    // No composite/active-mix guard here: enqueue()'s refusals (idle-queue
    // check for publish/undo, compositeQueuedOrRunning() for drafts/dry-runs)
    // already make it impossible for `pending` to hold a composite while
    // `active` is non-empty, or for anything to join `pending` while a
    // composite is active — confirmed dead, same as n2 above.
    while (active.size < concurrency && pending.length > 0) {
      const entry = pending.shift();
      active.set(entry.job.id, entry);
      runJob(entry).catch(() => {});
    }
    settleIdleIfDone();
  }

  return {
    store,
    options,
    enqueue({ kind, seed, reason, rerunOf, draftJobId, snapshotId } = {}) {
      if (kind === "publish" || kind === "undo") {
        // Order matters: shape (400) → single-flight / branch / deps (409) →
        // existence (404). Every refusal happens here, synchronously, BEFORE
        // a job record exists — so nothing (least of all the snapshot) runs.
        if (kind === "publish" && (typeof draftJobId !== "string" || !JOB_ID.test(draftJobId))) throw httpError(400, `invalid draftJobId: ${draftJobId}`);
        if (kind === "undo" && !SAFE_SNAPSHOT_ID(snapshotId)) throw httpError(400, `invalid snapshotId: ${JSON.stringify(snapshotId)}`);
        if (publishOrUndoActive(store)) throw new ConflictError("another publish or undo is already queued or running");
        if (pending.length > 0 || active.size > 0) throw new ConflictError(`${kind} needs an idle queue — wait for the queued or running drafts to finish (or cancel them), then retry`);
        const branch = repo.branch();
        if (branch.detached || branch.name === "main") throw new ConflictError(PUBLISH_REFUSED_ON_MAIN);
        if (!repo.contentGateDeps()) throw new ConflictError(SCRIPTS_DEPS_MISSING);
        let fields;
        if (kind === "publish") {
          const draft = store.get(draftJobId);
          if (!draft || draft.kind !== "draft" || draft.status !== "succeeded") throw httpError(404, `no succeeded draft ${draftJobId}`);
          // No out-dir check here — the idle-queue throw above (n2) already guarantees activeOutDirs() is empty.
          fields = { kind, seed: draft.seed, draftJobId, outDir: draft.outDir, snapshotId: null, restored: false };
        } else {
          let meta;
          // A well-shaped id whose snapshot.json is unreadable is not a conflict
          // (retrying never helps) nor a malformed request: 422, same message.
          try { meta = snapshots.get(snapshotId); } catch (e) { throw httpError(422, String(e?.message ?? e)); }
          if (!meta) throw httpError(404, `unknown snapshot ${snapshotId}`);
          fields = { kind, seed: meta.seed ?? null, snapshotId, outDir: null };
        }
        const job = store.create({ ...fields, reason: reason ?? null });
        pending.push({ job, outDir: fields.outDir });
        events.emit("job.created", { job: publicJob(job) });
        if (kind === "publish") {
          // Enqueueing a publish IS the owner's "accepted" decision (Batch H
          // review I2) — record it on the draft so the badge and Review banner
          // stop counting it as "to review", and push the draft's record as a
          // job frame (it is terminal, so job.done is its frame) so every
          // client learns without a resync. Best-effort like publishedBy at
          // the end of runJob: the publish itself must not fail on this.
          try {
            const draft = store.update(draftJobId, { review: { decision: "accepted", reasons: [], at: new Date().toISOString() } });
            events.emit("job.done", { job: publicJob(draft) });
          } catch { /* draft record gone — the publish job already exists */ }
        }
        pump();
        return job;
      }
      if (!SEED_GRAMMAR.test(seed)) throw new Error(`invalid seed: ${seed}`);
      if (compositeQueuedOrRunning()) throw new ConflictError(`a publish or undo is queued or running — it is replacing the world a ${kind} reads; wait for it to finish, then retry`);
      const outDir = outDirFor({ seed, version: repo.generatorVersion });
      if (activeOutDirs().has(outDir)) throw new ConflictError(`another job is active for out dir ${outDir}`);
      const job = store.create({ kind, seed, reason: reason ?? null, rerunOf: rerunOf ?? null, outDir });
      pending.push({ job, outDir });
      events.emit("job.created", { job: publicJob(job) });
      pump();
      return job;
    },
    cancel(id) {
      const pendingIndex = pending.findIndex((e) => e.job.id === id);
      if (pendingIndex !== -1) {
        pending.splice(pendingIndex, 1);
        const job = store.update(id, { status: "cancelled", endedAt: new Date().toISOString() });
        events.emit("job.done", { job: publicJob(job) });
        settleIdleIfDone();
        return job;
      }
      if (active.has(id)) {
        // A running publish/undo is never cancellable, at any step (fix round
        // 1, B): killing one mid-way leaves a half-replaced world. Refuse with
        // 409 rather than a 200 that silently ignores the request.
        if (isCompositeKind(active.get(id).job.kind))
          throw new ConflictError(`a running ${active.get(id).job.kind} cannot be cancelled — let it finish (a failed publish restores its snapshot automatically), then undo`);
        runner.cancel(id); return store.get(id);
      }
      return store.get(id);
    },
    // Shutdown (server.mjs): cancels every running draft/dry-run and never a
    // publish/undo. The in-flight composite is detected by KIND, not by a
    // cancel throwing, and a failing cancel is reported, never mistaken for a
    // composite (which would stretch the shutdown wait to the publish bound).
    cancelRunningForShutdown() {
      let compositeInFlight = false;
      const errors = [];
      for (const [id, entry] of active) {
        if (isCompositeKind(entry.job.kind)) { compositeInFlight = true; continue; }
        try { runner.cancel(id); } catch (e) { errors.push(`${id}: ${e?.message ?? e}`); }
      }
      return { compositeInFlight, errors };
    },
    activeOutDirs,
    running() { return active.size; },
    onIdle() {
      if (pending.length === 0 && active.size === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
    close() {
      closed = true;
      const dropped = pending.splice(0, pending.length);
      for (const dead of dropped) {
        // Per-record: one store.update throw (e.g. a disk error) must not
        // abort the loop and leave the rest of `dropped` stuck `queued` on
        // disk until the next boot's recoverInterrupted() (re-review m2).
        try {
          const job = store.update(dead.job.id, { status: "interrupted", endedAt: new Date().toISOString() });
          events.emit("job.done", { job: publicJob(job) });
          reopenDraft(dead.job);
        } catch { /* best-effort; this record recovers on next boot */ }
      }
      settleIdleIfDone();
    },
  };
}
