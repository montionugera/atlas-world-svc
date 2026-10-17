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

// _seq is the store's internal sort tie-breaker (see the comment above) — real
// on disk, but not part of a job's public shape. Every surface that hands a
// job record to a client (JSON routes, SSE frames, world.lastPublish) must
// strip it through this one sanitiser (fix round 1, F3) instead of each
// reimplementing the same destructure.
export const publicJob = (job) => { if (!job) return job; const { _seq, ...rest } = job; return rest; };

// The one "not decided yet" review shape: a draft's default at create, and
// what a non-ok publish (failed, cancelled, interrupted — at runtime in
// queue.mjs's reopenDraft, at boot in recoverInterrupted below) resets the
// draft to. A fresh object per call: records are spread and serialised, and
// a shared frozen `reasons` array would break the first consumer that pushes.
export const undecidedReview = () => ({ decision: null, reasons: [], at: null });

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
        durationMs: null, steps: [], exitCode: null, error: null, rerunOf: null, rerunMatch: null, rerunDiff: null, manifestHashes: null, metrics: null,
        review: undecidedReview(), ...fields, _seq: ++seq };
      return write(job);
    },
    get: read,
    update(id, patch) { const j = read(id); if (!j) throw new Error(`no job ${id}`); return write({ ...j, ...patch }); },
    list({ kind, status, seed, limit } = {}) {
      let jobs = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => read(f.slice(0, -5))).filter(Boolean);
      if (kind) jobs = jobs.filter((j) => j.kind === kind);
      if (status) jobs = jobs.filter((j) => j.status === status);
      if (seed) jobs = jobs.filter((j) => j.seed === seed);
      jobs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b._seq - a._seq));
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
        .map((j) => {
          write({ ...j, status: "interrupted", endedAt: new Date().toISOString(), error: "service restarted" });
          // An interrupted publish never set publishedBy, so the "accepted"
          // its enqueue recorded on the draft must be undone or the draft is
          // stuck undecidable (re-review I4) — same rule as queue.mjs's
          // reopenDraft, applied at boot where no event bus exists yet.
          if (j.kind === "publish") {
            const draft = j.draftJobId ? read(j.draftJobId) : null;
            if (draft && !draft.publishedBy) write({ ...draft, review: undecidedReview() });
          }
          return j.id;
        });
    },
  };
}
