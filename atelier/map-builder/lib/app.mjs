import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import crypto from "node:crypto";
import { SEED_GRAMMAR } from "../../mapforge/generate-world.mjs";
import { ConflictError } from "./queue.mjs";

const httpError = (status, message) => Object.assign(new Error(message), { status });
const badRequest = (message) => httpError(400, message);
const notFound = (message = "not found") => httpError(404, message);

// _seq is JobStore's internal sort tie-breaker (see jobs.mjs) — real, but
// not part of the job's public shape, so the API never exposes it.
const sanitizeJob = (job) => { if (!job) return job; const { _seq, ...rest } = job; return rest; };

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

export function createApp({ repo, store, queue, events, world, staticHandler, steps, version }) {
  // Deletes a job's on-disk record + log the same way jobs.mjs names them
  // (`<id>.json` beside `<id>.log`) without reaching into its private
  // recPath — jobs.mjs only exposes logPath(id), which is enough to derive
  // the record path by swapping the extension.
  const removeJobFiles = (id) => {
    for (const p of [store.logPath(id), store.logPath(id).replace(/\.log$/, ".json")]) {
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
      sendJson(ctx.res, 200, { jobs: store.list(opts).map(sanitizeJob) });
    }],

    ["POST", /^\/api\/jobs$/, async (ctx) => {
      const body = await readJsonBody(ctx.req);
      const { kind, reason } = body ?? {};
      if (kind !== "draft" && kind !== "dry-run") throw badRequest(`invalid kind: ${kind}`);
      const seeds = seedsForCreate(body);
      const jobs = seeds.map((seed) => queue.enqueue({ kind, seed, reason: reason ?? null }));
      sendJson(ctx.res, 201, { jobs: jobs.map(sanitizeJob) });
    }],

    ["GET", /^\/api\/jobs\/([^/]+)$/, (ctx) => {
      const job = store.get(ctx.params[0]);
      if (!job) throw notFound();
      sendJson(ctx.res, 200, sanitizeJob(job));
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
      sendJson(ctx.res, 200, sanitizeJob(queue.cancel(id)));
    }],

    ["POST", /^\/api\/jobs\/([^/]+)\/rerun$/, async (ctx) => {
      const id = ctx.params[0];
      const original = store.get(id);
      if (!original) throw notFound();
      const body = await readJsonBody(ctx.req);
      const job = queue.enqueue({ kind: original.kind, seed: original.seed, reason: body?.reason ?? `rerun of ${id}`, rerunOf: id });
      sendJson(ctx.res, 201, { job: sanitizeJob(job) });
    }],

    ["DELETE", /^\/api\/jobs\/([^/]+)$/, (ctx) => {
      const id = ctx.params[0];
      const job = store.get(id);
      if (!job) throw notFound();
      if (job.status === "queued" || job.status === "running") throw httpError(409, "job is active");
      removeJobFiles(id);
      removeOutDir(job.outDir);
      ctx.res.writeHead(204);
      ctx.res.end();
    }],

    ["GET", /^\/api\/events$/, (ctx) => events.handle(ctx.req, ctx.res)],
  ];

  return function handler(req, res) {
    const url = new URL(req.url, "http://internal");
    if (!url.pathname.startsWith("/api")) {
      if (!staticHandler(req, res)) { res.writeHead(404); res.end(); }
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
