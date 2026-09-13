import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";

export const JOB_ID = /^j_\d{8}_\d{6}_[0-9a-f]{8}$/;
const pad = (n, w = 2) => String(n).padStart(w, "0");
export function newJobId(now = new Date(), rand = crypto) {
  const d = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const t = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `j_${d}_${t}_${rand.randomBytes(4).toString("hex")}`;
}
const assertId = (id) => { if (!JOB_ID.test(id)) throw new Error(`invalid job id: ${id}`); return id; };

export function createJobStore({ dir }) {
  mkdirSync(dir, { recursive: true });
  const recPath = (id) => join(dir, `${assertId(id)}.json`);
  const logPath = (id) => join(dir, `${assertId(id)}.log`);
  const write = (job) => { const p = recPath(job.id); writeFileSync(p + ".tmp", JSON.stringify(job, null, 2)); renameSync(p + ".tmp", p); return job; };
  const read = (id) => (existsSync(recPath(id)) ? JSON.parse(readFileSync(recPath(id), "utf8")) : null);
  // Monotonic in-process tie-breaker: createdAt is ms-resolution but calls made
  // back-to-back in the same tick (e.g. enqueuing several drafts at once) can
  // land on the same millisecond, and the id's random suffix has no relation to
  // creation order — sorting by id or createdAt alone then silently breaks the
  // "newest first" guarantee. _seq is exact within this process; createdAt still
  // orders correctly across restarts (a fresh process's counter starts over).
  let seq = 0;
  return {
    create(fields) {
      const job = { id: newJobId(), status: "queued", createdAt: new Date().toISOString(), startedAt: null, endedAt: null,
        durationMs: null, steps: [], exitCode: null, error: null, rerunOf: null, rerunMatch: null, metrics: null,
        review: { decision: null, reasons: [], at: null }, ...fields, _seq: ++seq };
      return write(job);
    },
    get: read,
    update(id, patch) { const j = read(id); if (!j) throw new Error(`no job ${id}`); return write({ ...j, ...patch }); },
    list({ kind, status, seed, limit } = {}) {
      let jobs = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => read(f.slice(0, -5))).filter(Boolean);
      if (kind) jobs = jobs.filter((j) => j.kind === kind);
      if (status) jobs = jobs.filter((j) => j.status === status);
      if (seed) jobs = jobs.filter((j) => j.seed === seed);
      jobs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : (b._seq ?? 0) - (a._seq ?? 0)));
      return limit ? jobs.slice(0, limit) : jobs;
    },
    appendLog(id, text) { appendFileSync(logPath(id), text); },
    readLog(id, { tail } = {}) {
      if (!existsSync(logPath(id))) return "";
      const txt = readFileSync(logPath(id), "utf8");
      if (!tail) return txt;
      const lines = txt.split("\n"); if (lines[lines.length - 1] === "") lines.pop();
      return lines.slice(-tail).join("\n") + "\n";
    },
    logPath,
    recoverInterrupted() {
      return this.list({}).filter((j) => j.status === "queued" || j.status === "running")
        .map((j) => { write({ ...j, status: "interrupted", endedAt: new Date().toISOString(), error: "service restarted" }); return j.id; });
    },
  };
}
