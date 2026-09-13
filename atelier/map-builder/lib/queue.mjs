import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createStageTracker } from "./stage-parser.mjs";
import { draftCommands, dryRunCommands, outDirFor } from "./commands.mjs";

export class ConflictError extends Error { constructor(msg) { super(msg); this.code = 409; } }

const SEED_GRAMMAR = /^[0-9a-f]{16}$/;

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

const defaultCommandsFor = ({ kind, job, repo }) =>
  kind === "dry-run" ? dryRunCommands({ job, version: repo.generatorVersion }) : draftCommands({ job, version: repo.generatorVersion });

export function createJobQueue(options) {
  const { store, runner, repo, concurrency, stageCount, commandsFor = defaultCommandsFor, events } = options;
  const pending = []; // [{ job, commands, outDir }]
  const active = new Map(); // jobId -> { job, commands, outDir }
  let idleWaiters = [];
  let closed = false;

  const activeOutDirs = () => new Set([...pending, ...active.values()].map((e) => e.outDir));

  const settleIdleIfDone = () => {
    if (pending.length === 0 && active.size === 0) {
      const waiters = idleWaiters; idleWaiters = [];
      for (const resolve of waiters) resolve();
    }
  };

  async function runJob(entry) {
    const { job: createdJob, commands, outDir } = entry;
    store.update(createdJob.id, { status: "running", startedAt: new Date().toISOString() });
    events.emit("job.started", { job: store.get(createdJob.id) });
    const tracker = createStageTracker({ stageCount });
    const t0 = Date.now();
    const timeoutMs = repo.timeouts?.[createdJob.kind] ?? repo.timeouts?.draft ?? 40000;
    const result = await runner.run({
      job: createdJob, commands, cwd: repo.repoRoot, timeoutMs,
      onLine: ({ label, stream, line }) => {
        store.appendLog(createdJob.id, `[${label}] ${line}\n`);
        if (stream !== "stdout") return;
        const ev = tracker.push(line);
        if (ev && ev.type === "job.step") {
          const job = store.update(createdJob.id, { steps: tracker.steps() });
          events.emit("job.step", { job, step: ev.step, stepIndex: ev.stepIndex, stepCount: ev.stepCount });
        }
      },
    });
    const status = result.cancelled ? "cancelled" : result.ok ? "succeeded" : "failed";
    let metrics = null;
    try { metrics = readMetrics(join(repo.repoRoot, outDir, "report.json")); } catch { metrics = null; }
    const dryRun = parseDryRun(result.captured["dry-run"] ?? []);
    const job = store.update(createdJob.id, {
      status, endedAt: new Date().toISOString(), durationMs: Date.now() - t0,
      exitCode: result.exitCode, error: result.error, steps: tracker.steps(), metrics, dryRun,
    });
    events.emit("job.done", { job });
    active.delete(createdJob.id);
    pump();
  }

  function pump() {
    if (closed) return;
    while (active.size < concurrency && pending.length > 0) {
      const entry = pending.shift();
      active.set(entry.job.id, entry);
      runJob(entry);
    }
    settleIdleIfDone();
  }

  return {
    store,
    options,
    enqueue({ kind, seed, reason, rerunOf } = {}) {
      if (!SEED_GRAMMAR.test(seed)) throw new Error(`invalid seed: ${seed}`);
      const outDir = outDirFor({ seed, version: repo.generatorVersion });
      if (activeOutDirs().has(outDir)) throw new ConflictError(`another job is active for out dir ${outDir}`);
      const job = store.create({ kind, seed, reason: reason ?? null, rerunOf: rerunOf ?? null, outDir });
      const commands = commandsFor({ kind, job, repo });
      pending.push({ job, commands, outDir });
      events.emit("job.created", { job });
      pump();
      return job;
    },
    cancel(id) {
      const pendingIndex = pending.findIndex((e) => e.job.id === id);
      if (pendingIndex !== -1) {
        pending.splice(pendingIndex, 1);
        const job = store.update(id, { status: "cancelled", endedAt: new Date().toISOString() });
        events.emit("job.done", { job });
        settleIdleIfDone();
        return job;
      }
      if (active.has(id)) { runner.cancel(id); return store.get(id); }
      return store.get(id);
    },
    activeOutDirs,
    running() { return active.size; },
    onIdle() {
      if (pending.length === 0 && active.size === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
    close() { closed = true; pending.length = 0; },
  };
}
