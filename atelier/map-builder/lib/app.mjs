import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import crypto from "node:crypto";
import { SEED_GRAMMAR } from "../../mapforge/generate-world.mjs";
import { ConflictError } from "./queue.mjs";
import { JOB_ID, publicJob } from "./jobs.mjs";
import { buildReview } from "./review.mjs";
import { SHEETS } from "../../mapforge/render-sheet.mjs";

const httpError = (status, message) => Object.assign(new Error(message), { status });
const badRequest = (message) => httpError(400, message);
const notFound = () => httpError(404, "not found");

// localhost/127.0.0.1/::1 are always allowed regardless of the configured
// bind (loopback-only service, spoofable Host header on a rebinding attack
// otherwise); the configured bind host is added on top so a deliberate
// non-loopback --bind still works (fix round 1, F7).
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// Parses both a bare `Host:` header value ("127.0.0.1:6016") and a full
// `Origin:` header value ("http://127.0.0.1:6016") into a bracket-free
// hostname, using the same WHATWG URL parser for both instead of two
// hand-rolled parsers.
function hostnameOf(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw.includes("://") ? raw : `http://${raw}`);
    return u.hostname.replace(/^\[|\]$/g, "");
  } catch { return null; }
}

const JSON_CONTENT_TYPE = /^application\/json(?:\s*;.*)?$/i;

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
const sendError = (res, status, message) => sendJson(res, status, { error: { code: status, message } });

async function readJsonBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw badRequest("invalid JSON body"); }
}

function seedsForCreate(body) {
  const { seed, count } = body ?? {};
  if (seed !== undefined) {
    if (!SEED_GRAMMAR.test(seed)) throw badRequest(`invalid seed: ${seed}`);
    return [seed]; // a typed seed forces count=1, whatever count said
  }
  const n = count ?? 1;
  if (!Number.isInteger(n) || n < 1 || n > 4) throw badRequest("count must be an integer 1-4");
  return Array.from({ length: n }, () => crypto.randomBytes(8).toString("hex"));
}

// Snapshot rows go to the client without `dir` (an absolute server path) or
// the per-file hash list; a corrupt row is passed through as { id, corrupt }.
const publicSnapshot = (m) => (m.corrupt ? { id: m.id, corrupt: true } : { id: m.id, at: m.at, seed: m.seed, fileCount: m.files.length });

export function createApp({ repo, store, queue, events, world, snapshots = null, staticHandler, steps, version, bind }) {
  // A draft the review/decision routes may act on: a well-formed id naming a
  // succeeded draft. Anything else — malformed, unknown, not a draft, not
  // succeeded — is the same 404 (store.get throws on a malformed id).
  const succeededDraft = (id) => {
    const job = JOB_ID.test(id) ? store.get(id) : null;
    if (!job || job.kind !== "draft" || job.status !== "succeeded") throw notFound();
    return job;
  };

  const allowedHosts = new Set(LOOPBACK_HOSTS);
  if (bind && bind !== "0.0.0.0" && bind !== "::") allowedHosts.add(bind);

  // Deletes a job's on-disk record + log the same way jobs.mjs names them
  // (`<id>.json` beside `<id>.log`) without reaching into its private
  // recPath — jobs.mjs only exposes logPath(id), which is enough to derive
  // the record path by swapping the extension.
  const removeJobFiles = (id) => {
    const logPath = store.logPath(id);
    for (const p of [logPath, logPath.replace(/\.log$/, ".json")]) {
      try { rmSync(p, { force: true }); } catch { /* best-effort */ }
    }
  };

  const removeOutDir = (outDir) => {
    if (!outDir) return;
    const full = resolve(repo.repoRoot, outDir);
    const base = resolve(repo.repoRoot, "build/mapforge") + sep;
    if (full.startsWith(base)) rmSync(full, { recursive: true, force: true }); // never rm outside build/mapforge/
  };

  const routes = [
    ["GET", /^\/api\/health$/, (ctx) => sendJson(ctx.res, 200, { ok: true, version, pid: process.pid, repoRoot: repo.repoRoot, branch: repo.branch() })],
    ["GET", /^\/api\/world$/, (ctx) => sendJson(ctx.res, 200, world.read())],
    ["GET", /^\/api\/steps$/, (ctx) => sendJson(ctx.res, 200, steps)],

    ["GET", /^\/api\/jobs$/, (ctx) => {
      const q = ctx.url.searchParams;
      const opts = {};
      if (q.has("kind")) opts.kind = q.get("kind");
      if (q.has("status")) opts.status = q.get("status");
      if (q.has("seed")) opts.seed = q.get("seed");
      if (q.has("limit")) opts.limit = Number(q.get("limit"));
      sendJson(ctx.res, 200, { jobs: store.list(opts).map(publicJob) });
    }],

    ["POST", /^\/api\/jobs$/, async (ctx) => {
      const body = await readJsonBody(ctx.req);
      const { kind, reason } = body ?? {};
      if (kind !== "draft" && kind !== "dry-run") throw badRequest(`invalid kind: ${kind}`);
      const seeds = seedsForCreate(body);
      const jobs = seeds.map((seed) => queue.enqueue({ kind, seed, reason: reason ?? null }));
      sendJson(ctx.res, 201, { jobs: jobs.map(publicJob) });
    }],

    ["GET", /^\/api\/jobs\/([^/]+)$/, (ctx) => {
      const job = store.get(ctx.params[0]);
      if (!job) throw notFound();
      sendJson(ctx.res, 200, publicJob(job));
    }],

    ["GET", /^\/api\/jobs\/([^/]+)\/log$/, (ctx) => {
      const id = ctx.params[0];
      if (!store.get(id)) throw notFound();
      const tail = ctx.url.searchParams.get("tail");
      const text = store.readLog(id, tail ? { tail: Number(tail) } : {});
      ctx.res.writeHead(200, { "Content-Type": "text/plain" });
      ctx.res.end(text);
    }],

    ["POST", /^\/api\/jobs\/([^/]+)\/cancel$/, (ctx) => {
      const id = ctx.params[0];
      if (!store.get(id)) throw notFound();
      sendJson(ctx.res, 200, publicJob(queue.cancel(id)));
    }],

    ["POST", /^\/api\/jobs\/([^/]+)\/rerun$/, async (ctx) => {
      const id = ctx.params[0];
      const original = store.get(id);
      if (!original) throw notFound();
      // Any finished status re-runs (failed, cancelled, interrupted included —
      // spec §7 boot recovery); only the kind is limited: a publish/undo is
      // driven by a draft/snapshot id, not a seed, so cloning it makes no
      // sense and would only trip enqueue's 400 on the missing draftJobId.
      if (original.kind !== "draft" && original.kind !== "dry-run") throw badRequest(`only draft and dry-run jobs can be re-run, not ${original.kind}`);
      const body = await readJsonBody(ctx.req);
      const job = queue.enqueue({ kind: original.kind, seed: original.seed, reason: body?.reason ?? `rerun of ${id}`, rerunOf: id });
      sendJson(ctx.res, 201, { job: publicJob(job) });
    }],

    ["DELETE", /^\/api\/jobs\/([^/]+)$/, (ctx) => {
      const id = ctx.params[0];
      const job = store.get(id);
      if (!job) throw notFound();
      if (job.status === "queued" || job.status === "running") throw httpError(409, "job is active");
      // outDir is deterministic per seed+version (runIdOf), so a rerun of this
      // seed shares it (fix round 1, F2). Refuse if another job still active
      // on it; if another finished job still references it, drop only this
      // job's own record/log and leave the shared directory in place.
      const sharing = store.list({}).filter((j) => j.id !== id && j.outDir === job.outDir);
      if (sharing.some((j) => j.status === "queued" || j.status === "running")) throw httpError(409, "out dir is in use by another job");
      removeJobFiles(id);
      if (sharing.length === 0) removeOutDir(job.outDir);
      ctx.res.writeHead(204);
      ctx.res.end();
    }],

    ["GET", /^\/api\/drafts\/([^/]+)\/review$/, (ctx) => {
      const job = succeededDraft(ctx.params[0]);
      sendJson(ctx.res, 200, buildReview({ repo, job, sheets: SHEETS }));
    }],

    ["POST", /^\/api\/drafts\/([^/]+)\/decision$/, async (ctx) => {
      const draft = succeededDraft(ctx.params[0]);
      const { decision, reasons = [] } = (await readJsonBody(ctx.req)) ?? {};
      if (decision !== "rejected" && decision !== "accepted") throw badRequest(`invalid decision: ${decision}`);
      if (!Array.isArray(reasons) || !reasons.every((r) => typeof r === "string")) throw badRequest("reasons must be an array of strings");
      const job = store.update(draft.id, { review: { decision, reasons, at: new Date().toISOString() } });
      // Every other job-store mutation pushes a frame (queue.mjs); without
      // this one the badge and other tabs only learned of a decision on the
      // next resync (Batch H review, stale-list root cause). The draft is
      // terminal, so job.done is the frame that carries its record.
      events.emit("job.done", { job: publicJob(job) });
      sendJson(ctx.res, 200, { job: publicJob(job) });
    }],

    ["POST", /^\/api\/publish$/, async (ctx) => {
      const { draftJobId, confirm } = (await readJsonBody(ctx.req)) ?? {};
      if (confirm !== true) throw badRequest("publish needs confirm: true");
      sendJson(ctx.res, 201, { job: publicJob(queue.enqueue({ kind: "publish", draftJobId })) });
    }],

    ["GET", /^\/api\/snapshots$/, (ctx) => sendJson(ctx.res, 200, { snapshots: (snapshots?.list() ?? []).map(publicSnapshot) })],

    ["POST", /^\/api\/undo$/, async (ctx) => {
      const { snapshotId } = (await readJsonBody(ctx.req)) ?? {};
      // Id shape (no / \ ..) is validated by queue.enqueue → 400, before any lookup.
      sendJson(ctx.res, 201, { job: publicJob(queue.enqueue({ kind: "undo", snapshotId })) });
    }],

    ["GET", /^\/api\/events$/, (ctx) => events.handle(ctx.req, ctx.res)],
  ];

  return function handler(req, res) {
    // Cross-site protection (fix round 1, F7): a loopback service with no
    // CORS headers is still reachable from any page via a simple-request
    // POST (text/plain, no preflight) and from a DNS-rebinding page that
    // becomes same-origin by spoofing Host. Both are checked before routing,
    // for /api AND static (rebinding can read files under the repo root too).
    if (!allowedHosts.has(hostnameOf(req.headers.host))) { sendError(res, 403, "host not allowed"); return; }
    if (req.headers.origin && !allowedHosts.has(hostnameOf(req.headers.origin))) { sendError(res, 403, "origin not allowed"); return; }

    const url = new URL(req.url, "http://internal");
    if (!url.pathname.startsWith("/api")) {
      if (!staticHandler(req, res)) { res.writeHead(404); res.end(); }
      return;
    }
    if ((req.method === "POST" || req.method === "DELETE") && !JSON_CONTENT_TYPE.test(req.headers["content-type"] ?? "")) {
      sendError(res, 400, "Content-Type must be application/json");
      return;
    }
    for (const [method, pattern, fn] of routes) {
      if (req.method !== method) continue;
      const m = pattern.exec(url.pathname);
      if (!m) continue;
      Promise.resolve().then(() => fn({ req, res, url, params: m.slice(1) })).catch((e) => {
        if (e instanceof ConflictError) { sendError(res, 409, e.message); return; }
        sendError(res, e.status ?? 500, e.message ?? "internal error");
      });
      return;
    }
    sendError(res, 404, "not found");
  };
}
