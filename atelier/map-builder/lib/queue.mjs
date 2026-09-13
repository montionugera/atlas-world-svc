import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createStageTracker } from "./stage-parser.mjs";
import { draftCommands, dryRunCommands, outDirFor } from "./commands.mjs";
import { SEED_GRAMMAR } from "../../mapforge/generate-world.mjs";

export class ConflictError extends Error { constructor(msg) { super(msg); this.code = 409; } }

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
  const pending = []; // [{ job, outDir }]
  const active = new Map(); // jobId -> { job, outDir }
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
    const { job: createdJob, outDir } = entry;
    const id = createdJob.id;
    const t0 = Date.now();
    try {
      const commands = commandsFor({ kind: createdJob.kind, job: createdJob, repo });
      store.update(id, { status: "running", startedAt: new Date().toISOString() });
      events.emit("job.started", { job: store.get(id) });
      const tracker = createStageTracker({ stageCount });
      const timeoutMs = repo.timeouts?.[createdJob.kind] ?? repo.timeouts?.draft ?? 40000;
      const reportPath = join(repo.repoRoot, outDir, "report.json");
      const result = await runner.run({
        job: createdJob, commands, cwd: repo.repoRoot, timeoutMs,
        onLine: ({ label, stream, line }) => {
          // Runs inside readline's 'line' handler (see runner.mjs) — a throw
          // here is an uncaught exception, not a rejection. Never let one escape.
          try {
            store.appendLog(id, `[${label}] ${line}\n`);
            if (stream !== "stdout") return;
            const ev = tracker.push(line);
            if (ev && ev.type === "job.step") {
              const job = store.update(id, { steps: tracker.steps() });
              events.emit("job.step", { job, step: ev.step, stepIndex: ev.stepIndex, stepCount: ev.stepCount });
            }
          } catch { /* logged nowhere yet; must not crash the process */ }
        },
      });
      const status = result.cancelled ? "cancelled" : result.ok ? "succeeded" : "failed";
      // Only a successful run's report.json is trustworthy — a failed or
      // cancelled job in a re-used out dir (deterministic per seed+version)
      // must never surface a PREVIOUS run's metrics as its own (finding I4).
      let metrics = null;
      if (result.ok) { try { metrics = readMetrics(reportPath); } catch { metrics = null; } }
      const dryRun = parseDryRun(result.captured["dry-run"] ?? []);
      const job = store.update(id, {
        status, endedAt: new Date().toISOString(), durationMs: Date.now() - t0,
        exitCode: result.exitCode, error: result.error, steps: tracker.steps(), metrics, dryRun,
      });
      events.emit("job.done", { job });
    } catch (e) {
      const job = store.update(id, {
        status: "failed", endedAt: new Date().toISOString(), durationMs: Date.now() - t0,
        error: String(e?.message ?? e),
      });
      events.emit("job.done", { job });
    } finally {
      active.delete(id);
      pump();
    }
  }

  function pump() {
    if (closed) { settleIdleIfDone(); return; }
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
    enqueue({ kind, seed, reason, rerunOf } = {}) {
      if (!SEED_GRAMMAR.test(seed)) throw new Error(`invalid seed: ${seed}`);
      const outDir = outDirFor({ seed, version: repo.generatorVersion });
      if (activeOutDirs().has(outDir)) throw new ConflictError(`another job is active for out dir ${outDir}`);
      const job = store.create({ kind, seed, reason: reason ?? null, rerunOf: rerunOf ?? null, outDir });
      pending.push({ job, outDir });
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
    close() {
      closed = true;
      const dropped = pending.splice(0, pending.length);
      for (const dead of dropped) {
        const job = store.update(dead.job.id, { status: "interrupted", endedAt: new Date().toISOString() });
        events.emit("job.done", { job });
      }
      settleIdleIfDone();
    },
  };
}
