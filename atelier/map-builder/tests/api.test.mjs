import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRepo, loadSteps } from "../lib/repo.mjs";
import { createJobStore } from "../lib/jobs.mjs";
import { createRunner } from "../lib/runner.mjs";
import { createJobQueue } from "../lib/queue.mjs";
import { createEventHub } from "../lib/sse.mjs";
import { createStaticHandler } from "../lib/static.mjs";
import { createWorldReader } from "../lib/world.mjs";
import { createApp } from "../lib/app.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const REPO = path.resolve(PKG, "..", "..");

// The queue needs a runnable command per job without spending 6s+ on a real
// generator run — sleepers as in Task 6's own queue.test.mjs.
const fakeCommandsFor = ({ job }) => [{ label: "generate", argv: [process.execPath, "-e",
  `console.log('stage: P1 premise-masks 1 ms'); setTimeout(() => { console.log('stage: P2 elevation 2 ms'); }, 200)`] }];

const setup = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "mb-api-"));
  const store = createJobStore({ dir: path.join(dir, "jobs") });
  const baseRepo = createRepo({ repoRoot: REPO });
  const steps = loadSteps({ dir: PKG });
  // The service composes stageCount onto the repo it hands to world.mjs and
  // queue.mjs (see task-9-report.md ruling) — createRepo() itself doesn't
  // know about steps.json.
  const repo = { ...baseRepo, stageCount: steps.stageCount };
  const events = createEventHub({ replay: 200 });
  const runner = createRunner({ killGraceMs: 100 });
  const queue = createJobQueue({ store, runner, repo, concurrency: 2, stageCount: steps.stageCount, commandsFor: fakeCommandsFor, events });
  const world = createWorldReader({ repo, store });
  const staticHandler = createStaticHandler({ root: REPO });
  const app = createApp({ repo, store, queue, events, world, staticHandler, steps, version: "test" });
  const server = http.createServer(app);
  return { dir, repo, store, queue, events, server, cleanup: () => { events.close(); rmSync(dir, { recursive: true, force: true }); } };
};

const withApp = async (fn) => {
  const s = setup();
  await new Promise((resolve) => s.server.listen(0, "127.0.0.1", resolve));
  const { port } = s.server.address();
  try {
    await fn({ ...s, port });
  } finally {
    await s.queue.onIdle().catch(() => {});
    await new Promise((resolve) => s.server.close(resolve));
    s.cleanup();
  }
};

// POST/DELETE always carry Content-Type: application/json, even with no body
// (cancel, rerun) — app.mjs now requires it on every POST/DELETE (fix round
// 1, F7), so every existing client of this helper must send it.
const api = (port, method, urlPath, body, extraHeaders = {}) => new Promise((resolve, reject) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const headers = { ...extraHeaders };
  if (method === "POST" || method === "DELETE") headers["Content-Type"] = "application/json";
  if (data) headers["Content-Length"] = Buffer.byteLength(data);
  const req = http.request({ host: "127.0.0.1", port, method, path: urlPath, headers }, (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let parsed = null;
      if (raw) { try { parsed = JSON.parse(raw); } catch { parsed = raw; } }
      resolve({ status: res.statusCode, headers: res.headers, body: parsed });
    });
  });
  req.on("error", reject);
  if (data) req.write(data);
  req.end();
});

const seed = (i) => `${i}f81c0aa9d2e5b17`;

test("GET /api/health reports ok and the current branch", async () => {
  await withApp(async ({ port }) => {
    const res = await api(port, "GET", "/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.branch);
  });
});

test("GET /api/world reports the committed seed, a valid ratio band, and every sheet", async () => {
  await withApp(async ({ port }) => {
    const res = await api(port, "GET", "/api/world");
    assert.equal(res.status, 200);
    assert.match(res.body.seed, /^[0-9a-f]{16}$/);
    assert.ok(res.body.ratio.min < res.body.ratio.max);
    assert.equal(res.body.sheets.count, 17);
  });
});

test("POST /api/jobs rejects an invalid seed", async () => {
  await withApp(async ({ port }) => {
    const res = await api(port, "POST", "/api/jobs", { kind: "draft", seed: "not-a-seed" });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });
});

test("POST /api/jobs with count:3 and no seed makes 3 jobs with distinct seeds", async () => {
  await withApp(async ({ port, queue }) => {
    const res = await api(port, "POST", "/api/jobs", { kind: "draft", count: 3 });
    assert.equal(res.status, 201);
    assert.equal(res.body.jobs.length, 3);
    assert.equal(new Set(res.body.jobs.map((j) => j.seed)).size, 3);
    for (const j of res.body.jobs) assert.equal(j._seq, undefined);
    await queue.onIdle();
  });
});

test("a typed seed forces count to 1 even if count says otherwise", async () => {
  await withApp(async ({ port, queue }) => {
    const res = await api(port, "POST", "/api/jobs", { kind: "draft", seed: seed(1), count: 3 });
    assert.equal(res.status, 201);
    assert.equal(res.body.jobs.length, 1);
    assert.equal(res.body.jobs[0].seed, seed(1));
    await queue.onIdle();
  });
});

test("GET /api/jobs filters by status", async () => {
  await withApp(async ({ port, queue }) => {
    await api(port, "POST", "/api/jobs", { kind: "draft", seed: seed(2) });
    const res = await api(port, "GET", "/api/jobs?status=queued");
    assert.equal(res.status, 200);
    assert.ok(res.body.jobs.every((j) => j.status === "queued" || j.status === "running"));
    await queue.onIdle();
  });
});

test("GET /api/jobs/:id/log?tail= returns the tail of the log", async () => {
  await withApp(async ({ port, queue }) => {
    const created = await api(port, "POST", "/api/jobs", { kind: "draft", seed: seed(3) });
    const id = created.body.jobs[0].id;
    await queue.onIdle();
    const res = await api(port, "GET", `/api/jobs/${id}/log?tail=1`);
    assert.equal(res.status, 200);
    assert.equal(res.body.split("\n").filter(Boolean).length, 1);
  });
});

test("cancelling a queued job marks it cancelled", async () => {
  await withApp(async ({ port, queue }) => {
    // Fill the two concurrency slots first so the third job stays queued.
    await api(port, "POST", "/api/jobs", { kind: "draft", seed: seed(4) });
    await api(port, "POST", "/api/jobs", { kind: "draft", seed: seed(5) });
    const created = await api(port, "POST", "/api/jobs", { kind: "draft", seed: seed(6) });
    const id = created.body.jobs[0].id;
    const res = await api(port, "POST", `/api/jobs/${id}/cancel`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "cancelled");
    await queue.onIdle();
  });
});

test("a second job for the same active seed is refused with 409", async () => {
  await withApp(async ({ port, queue }) => {
    await api(port, "POST", "/api/jobs", { kind: "draft", seed: seed(7) });
    const res = await api(port, "POST", "/api/jobs", { kind: "draft", seed: seed(7) });
    assert.equal(res.status, 409);
    await queue.onIdle();
  });
});

test("DELETE refuses an active job, then removes a finished one", async () => {
  await withApp(async ({ port, queue }) => {
    const created = await api(port, "POST", "/api/jobs", { kind: "draft", seed: seed(8) });
    const id = created.body.jobs[0].id;
    const activeDelete = await api(port, "DELETE", `/api/jobs/${id}`);
    assert.equal(activeDelete.status, 409);
    await queue.onIdle();
    const finishedDelete = await api(port, "DELETE", `/api/jobs/${id}`);
    assert.equal(finishedDelete.status, 204);
    const getAfter = await api(port, "GET", `/api/jobs/${id}`);
    assert.equal(getAfter.status, 404);
  });
});

test("GET /api/events receives job.created for a new POST", async () => {
  await withApp(async ({ port, queue }) => {
    const es = http.request({ host: "127.0.0.1", port, path: "/api/events" });
    let buf = "";
    const gotFrame = new Promise((resolve) => {
      es.on("response", (res) => res.on("data", (c) => {
        buf += c.toString("utf8");
        if (buf.includes("event: job.created")) resolve();
      }));
    });
    es.end();
    await new Promise((resolve) => es.once("response", resolve)); // wait for the ": ok" preamble before posting
    const created = await api(port, "POST", "/api/jobs", { kind: "draft", seed: seed(9) });
    await gotFrame;
    es.destroy();
    assert.match(buf, /event: job\.created\ndata: /);
    const dataLine = buf.split("\n").find((l) => l.startsWith("data: ") && l.includes(seed(9)));
    assert.ok(dataLine, buf);
    const payload = JSON.parse(dataLine.slice("data: ".length));
    assert.equal(payload.job.id, created.body.jobs[0].id);
    // Fix round 1, F3: the SSE payload carries the raw store record unless
    // the emit sites sanitise it — assert the leak is closed.
    assert.equal(payload.job._seq, undefined);
    await queue.onIdle();
  });
});

test("world.lastPublish strips _seq from the raw store record (fix round 1, F3)", async () => {
  await withApp(async ({ store, repo }) => {
    const job = store.create({ kind: "publish", seed: "abcdefabcdefabcd", outDir: "build/mapforge/x" });
    const world = createWorldReader({ repo, store });
    const read = world.read();
    assert.equal(read.lastPublish.id, job.id);
    assert.equal(read.lastPublish._seq, undefined);
  });
});

test("DELETE refuses when a rerun of the same seed is still active (fix round 1, F2)", async () => {
  await withApp(async ({ port, queue }) => {
    const s = "a1a1a1a1a1a1a1a1";
    const created = await api(port, "POST", "/api/jobs", { kind: "draft", seed: s });
    const id = created.body.jobs[0].id;
    await queue.onIdle();
    const rerun = await api(port, "POST", `/api/jobs/${id}/rerun`);
    assert.equal(rerun.status, 201);
    // The rerun is queued/running on the same out dir as the now-finished
    // original — deleting the original must not touch it mid-generation.
    const del = await api(port, "DELETE", `/api/jobs/${id}`);
    assert.equal(del.status, 409);
    await queue.onIdle();
  });
});

test("DELETE removes only the record when a finished rerun still shares the out dir, keeping the directory (fix round 1, F2)", async () => {
  await withApp(async ({ port, queue, repo }) => {
    const s = "b2b2b2b2b2b2b2b2";
    const created = await api(port, "POST", "/api/jobs", { kind: "draft", seed: s });
    const originalId = created.body.jobs[0].id;
    const outDirFull = path.join(repo.repoRoot, created.body.jobs[0].outDir);
    mkdirSync(outDirFull, { recursive: true });
    writeFileSync(path.join(outDirFull, "marker.txt"), "keep me");
    await queue.onIdle();
    const rerun = await api(port, "POST", `/api/jobs/${originalId}/rerun`);
    const rerunId = rerun.body.job.id;
    await queue.onIdle();
    try {
      const del = await api(port, "DELETE", `/api/jobs/${originalId}`);
      assert.equal(del.status, 204);
      assert.equal(existsSync(outDirFull), true, "shared out dir must survive while the rerun's record still references it");
      const rerunGet = await api(port, "GET", `/api/jobs/${rerunId}`);
      assert.equal(rerunGet.status, 200);
    } finally {
      rmSync(outDirFull, { recursive: true, force: true });
    }
  });
});

// Task 20: bulk cleanup of finished drafts — matches by status AND age,
// never an active job, never a succeeded one, and only removes an out dir
// no remaining record still references. Snapshots are a different store
// entirely (createSnapshots) and this route never sees it.
test("DELETE /api/jobs?status=&olderThanDays= removes matching finished records, logs and draft dirs only", async () => {
  await withApp(async ({ port, store, repo, queue }) => {
    const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
    const mk = (fields) => store.create({ kind: "draft", seed: "d4d4d4d4d4d4d4d4", outDir: "build/mapforge/d4d4d4d4-3.0.0", ...fields });
    const oldFailed = mk({ status: "failed", endedAt: daysAgo(10), error: "x" });
    const oldCancelled = mk({ status: "cancelled", endedAt: daysAgo(9), outDir: "build/mapforge/d5d5d5d5-3.0.0" });
    const oldInterrupted = mk({ status: "interrupted", createdAt: daysAgo(8), endedAt: null, outDir: "build/mapforge/d6d6d6d6-3.0.0" });
    const freshFailed = mk({ status: "failed", endedAt: daysAgo(1), error: "x" });
    const oldSucceeded = mk({ status: "succeeded", endedAt: daysAgo(30) });
    const running = mk({ status: "running", startedAt: daysAgo(20), outDir: "build/mapforge/d7d7d7d7-3.0.0" });
    for (const j of [oldFailed, oldCancelled, oldInterrupted]) store.appendLog(j.id, "log\n");
    const dirOf = (rel) => path.join(repo.repoRoot, rel);
    for (const rel of ["build/mapforge/d4d4d4d4-3.0.0", "build/mapforge/d5d5d5d5-3.0.0", "build/mapforge/d6d6d6d6-3.0.0"]) {
      mkdirSync(dirOf(rel), { recursive: true }); writeFileSync(path.join(dirOf(rel), "marker.txt"), "x");
    }
    try {
      // Shape: status is required and limited to the three finished-not-succeeded values.
      assert.equal((await api(port, "DELETE", "/api/jobs?olderThanDays=7")).status, 400);
      assert.equal((await api(port, "DELETE", "/api/jobs?status=succeeded&olderThanDays=7")).status, 400);
      assert.equal((await api(port, "DELETE", "/api/jobs?status=failed&olderThanDays=-1")).status, 400);
      assert.equal((await api(port, "DELETE", "/api/jobs?status=failed")).status, 400);

      const res = await api(port, "DELETE", "/api/jobs?status=failed,cancelled,interrupted&olderThanDays=7");
      assert.equal(res.status, 200);
      assert.equal(res.body.deleted, 3);
      assert.deepEqual(new Set(res.body.ids), new Set([oldFailed.id, oldCancelled.id, oldInterrupted.id]));
      for (const j of [oldFailed, oldCancelled, oldInterrupted]) {
        assert.equal(store.get(j.id), null, `${j.status} record removed`);
        assert.equal(existsSync(store.logPath(j.id)), false, "log removed");
      }
      for (const j of [freshFailed, oldSucceeded, running]) assert.ok(store.get(j.id), `${j.status} kept`);
      // d4 is still referenced by freshFailed + oldSucceeded → kept; d5/d6 had no other reference → removed.
      assert.equal(existsSync(dirOf("build/mapforge/d4d4d4d4-3.0.0")), true);
      assert.equal(existsSync(dirOf("build/mapforge/d5d5d5d5-3.0.0")), false);
      assert.equal(existsSync(dirOf("build/mapforge/d6d6d6d6-3.0.0")), false);
      // A second sweep finds nothing.
      assert.deepEqual((await api(port, "DELETE", "/api/jobs?status=failed,cancelled,interrupted&olderThanDays=7")).body, { deleted: 0, ids: [] });
      // olderThanDays=0 sweeps every finished-not-succeeded record regardless of age.
      assert.deepEqual((await api(port, "DELETE", "/api/jobs?status=failed&olderThanDays=0")).body, { deleted: 1, ids: [freshFailed.id] });
      assert.equal(store.get(freshFailed.id), null);
    } finally {
      for (const rel of ["build/mapforge/d4d4d4d4-3.0.0", "build/mapforge/d5d5d5d5-3.0.0", "build/mapforge/d6d6d6d6-3.0.0"]) rmSync(dirOf(rel), { recursive: true, force: true });
      // `running` is a bare record with no process behind it — leave the queue idle.
      await queue.onIdle();
    }
  });
});

// Task 18: an interrupted record (what recoverInterrupted leaves behind)
// re-runs like any finished job; a publish/undo record does not.
test("POST /api/jobs/:id/rerun accepts an interrupted draft and refuses a publish record with 400", async () => {
  await withApp(async ({ port, store, queue }) => {
    const cut = store.create({ kind: "draft", seed: "c3c3c3c3c3c3c3c3", outDir: "build/mapforge/c3c3c3c3-3.0.0", status: "interrupted", error: "service restarted" });
    const rerun = await api(port, "POST", `/api/jobs/${cut.id}/rerun`);
    assert.equal(rerun.status, 201);
    assert.equal(rerun.body.job.rerunOf, cut.id);
    assert.equal(rerun.body.job.kind, "draft");
    const pub = store.create({ kind: "publish", seed: "c3c3c3c3c3c3c3c3", outDir: "build/mapforge/c3c3c3c3-3.0.0", status: "failed", draftJobId: cut.id });
    const refused = await api(port, "POST", `/api/jobs/${pub.id}/rerun`);
    assert.equal(refused.status, 400);
    assert.match(refused.body.error.message, /only draft and dry-run/);
    await queue.onIdle();
  });
});

test("POST with a non-JSON Content-Type is rejected with 400 (fix round 1, F7)", async () => {
  await withApp(async ({ port }) => {
    const body = JSON.stringify({ kind: "draft", count: 1 });
    const res = await new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/api/jobs",
        headers: { "Content-Type": "text/plain", "Content-Length": Buffer.byteLength(body) } }, (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode }));
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });
    assert.equal(res.status, 400);
  });
});

test("a request with a disallowed Host header is refused with 403 (fix round 1, F7)", async () => {
  await withApp(async ({ port }) => {
    const res = await api(port, "GET", "/api/health", undefined, { Host: "evil.example" });
    assert.equal(res.status, 403);
  });
});

test("unknown /api route is a 404 JSON error", async () => {
  await withApp(async ({ port }) => {
    const res = await api(port, "GET", "/api/nope");
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });
});

test("GET / passes through to the static handler's redirect", async () => {
  await withApp(async ({ port }) => {
    const res = await api(port, "GET", "/");
    assert.equal(res.status, 302);
  });
});

// ── Phase 2 routes (Task 15) ────────────────────────────────────────────────
// Everything below runs against a FAKE repo root (mkdtempSync, see
// fake-repo.mjs) with fake tools — publish and undo rewrite and delete files,
// so they must never be pointed at the real checkout.
import { readFileSync as readFileSync2 } from "node:fs";
import { createSnapshots } from "../lib/snapshots.mjs";
import { makeFakeRepoRoot, makeFakeRepo, fakeTools } from "./fake-repo.mjs";

const DRAFT_SEED = "0123456789abcdef";

const withPhase2App = async (t, { branch = "feat/F-052" } = {}, fn) => {
  const fake = makeFakeRepoRoot();
  const data = mkdtempSync(path.join(tmpdir(), "mb-api2-"));
  const events = createEventHub({ replay: 200 });
  t.after(() => { events.close(); fake.cleanup(); rmSync(data, { recursive: true, force: true }); });
  const state = { branch, deps: true };
  const repo = makeFakeRepo({ root: fake.root, state });
  const store = createJobStore({ dir: path.join(data, "jobs") });
  const snapshots = createSnapshots({ repoRoot: fake.root, dir: path.join(data, "snapshots"), keep: 3 });
  const world = createWorldReader({ repo, store, snapshots });
  const queue = createJobQueue({ store, runner: createRunner({ killGraceMs: 100 }), repo, concurrency: 2, stageCount: 18, events,
    snapshots, world, tools: fakeTools({ draftSeed: DRAFT_SEED }) });
  const staticHandler = createStaticHandler({ root: fake.root });
  const app = createApp({ repo, store, queue, events, world, snapshots, staticHandler, steps: loadSteps({ dir: PKG }), version: "test" });
  const server = http.createServer(app);
  // The draft's out dir IS the fake root (absolute outDir, as review.test.mjs
  // does): a readable draft with the same fabric as the current world.
  const draft = store.create({ kind: "draft", seed: DRAFT_SEED, outDir: fake.root, status: "succeeded", metrics: null, dryRun: { written: 2, deleted: 0, ratio: null, landKm2: null, files: [] } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn({ port, root: fake.root, data, state, repo, store, snapshots, queue, draft, events });
  } finally {
    await queue.onIdle().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
};

test("GET /api/drafts/:id/review → 200 for a succeeded draft, 404 otherwise", async (t) => {
  await withPhase2App(t, {}, async ({ port, store, draft }) => {
    const ok = await api(port, "GET", `/api/drafts/${draft.id}/review`);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.draft.seed, DRAFT_SEED);
    assert.equal(ok.body.sheets.length, 17);
    assert.equal(ok.body.dryRun.written, 2);
    const failed = store.create({ kind: "draft", seed: "1123456789abcdef", outDir: "build/mapforge/x", status: "failed" });
    assert.equal((await api(port, "GET", `/api/drafts/${failed.id}/review`)).status, 404);
    assert.equal((await api(port, "GET", "/api/drafts/j_20260913_000000_deadbeef/review")).status, 404);
    assert.equal((await api(port, "GET", "/api/drafts/not-a-job-id/review")).status, 404);
  });
});

test("POST /api/drafts/:id/decision records review; 400 on other decisions or bad reasons; 404 unknown", async (t) => {
  await withPhase2App(t, {}, async ({ port, store, draft, events }) => {
    // Batch H stale-list root cause: this was the only job-store mutation
    // that never emitted a frame, so other tabs (and the badge) only learned
    // of a rejection on the next resync. Spy on the hub the app was built with.
    const emitted = [];
    const realEmit = events.emit;
    events.emit = (type, payload) => { emitted.push({ type, payload }); return realEmit(type, payload); };
    const rej = await api(port, "POST", `/api/drafts/${draft.id}/decision`, { decision: "rejected", reasons: ["too much sea"] });
    assert.equal(rej.status, 200, JSON.stringify(rej.body));
    assert.equal(store.get(draft.id).review.decision, "rejected");
    assert.deepEqual(store.get(draft.id).review.reasons, ["too much sea"]);
    assert.ok(store.get(draft.id).review.at);
    assert.equal(rej.body.job._seq, undefined);
    const frame = emitted.find((e) => e.payload?.job?.id === draft.id);
    assert.ok(frame, "the decision route emits a job frame for the draft");
    assert.equal(frame.payload.job.review.decision, "rejected");
    assert.equal(frame.payload.job._seq, undefined);
    const acc = await api(port, "POST", `/api/drafts/${draft.id}/decision`, { decision: "accepted" });
    assert.equal(acc.status, 200);
    assert.deepEqual(store.get(draft.id).review.reasons, []);
    assert.equal((await api(port, "POST", `/api/drafts/${draft.id}/decision`, { decision: "maybe", reasons: [] })).status, 400);
    assert.equal((await api(port, "POST", `/api/drafts/${draft.id}/decision`, { decision: "rejected", reasons: "nope" })).status, 400);
    assert.equal((await api(port, "POST", "/api/drafts/j_20260913_000000_deadbeef/decision", { decision: "accepted", reasons: [] })).status, 404);
  });
});

test("POST /api/publish: 400 without confirm:true, 404 unknown draft, 201 + job, 409 while one is queued; then snapshots/world/undo", async (t) => {
  await withPhase2App(t, {}, async ({ port, root, queue, draft }) => {
    const worldBefore = readFileSync2(path.join(root, "content/world/fabric/world.json"));
    let w = await api(port, "GET", "/api/world");
    assert.equal(w.body.undoAvailable, false);
    assert.equal(w.body.lastPublish, null);

    assert.equal((await api(port, "POST", "/api/publish", { draftJobId: draft.id })).status, 400);
    assert.equal((await api(port, "POST", "/api/publish", { draftJobId: draft.id, confirm: "yes" })).status, 400);
    assert.equal((await api(port, "POST", "/api/publish", { draftJobId: "j_20260913_000000_deadbeef", confirm: true })).status, 404);
    const pub = await api(port, "POST", "/api/publish", { draftJobId: draft.id, confirm: true });
    assert.equal(pub.status, 201, JSON.stringify(pub.body));
    assert.equal(pub.body.job.kind, "publish");
    assert.equal(pub.body.job._seq, undefined);
    const again = await api(port, "POST", "/api/publish", { draftJobId: draft.id, confirm: true });
    assert.equal(again.status, 409);
    // Fix round 1, B: a running publish is never cancellable — 409, not a 200 that ignores it.
    const cancel = await api(port, "POST", `/api/jobs/${pub.body.job.id}/cancel`);
    assert.equal(cancel.status, 409, JSON.stringify(cancel.body));
    assert.match(cancel.body.error.message, /cannot be cancelled/);
    // Fix round 1, A: no draft starts while the publish rewrites the world.
    const draftDuring = await api(port, "POST", "/api/jobs", { kind: "draft", seed: "4123456789abcdef" });
    assert.equal(draftDuring.status, 409, JSON.stringify(draftDuring.body));
    await queue.onIdle();

    w = await api(port, "GET", "/api/world");
    assert.equal(w.body.seed, DRAFT_SEED);
    assert.equal(w.body.lastPublish.id, pub.body.job.id);
    assert.equal(w.body.lastPublish.status, "succeeded");
    assert.equal(w.body.undoAvailable, true);

    const snaps = await api(port, "GET", "/api/snapshots");
    assert.equal(snaps.status, 200);
    assert.equal(snaps.body.snapshots.length, 1);
    const [snap] = snaps.body.snapshots;
    assert.match(snap.seed, /^[0-9a-f]{16}$/);
    assert.ok(snap.at && snap.fileCount > 0);
    assert.equal(snap.dir, undefined, "no absolute paths leak to the client");
    assert.equal(snap.files, undefined);

    assert.equal((await api(port, "POST", "/api/undo", { snapshotId: "../../x" })).status, 400);
    assert.equal((await api(port, "POST", "/api/undo", { snapshotId: "a\\b" })).status, 400);
    assert.equal((await api(port, "POST", "/api/undo", {})).status, 400);
    assert.equal((await api(port, "POST", "/api/undo", { snapshotId: "2026-01-01T00-00-00.000Z-aaaaaaaaaaaaaaaa" })).status, 404);
    const undo = await api(port, "POST", "/api/undo", { snapshotId: snap.id });
    assert.equal(undo.status, 201, JSON.stringify(undo.body));
    assert.equal(undo.body.job.kind, "undo");
    await queue.onIdle();
    assert.deepEqual(readFileSync2(path.join(root, "content/world/fabric/world.json")), worldBefore);
    assert.equal((await api(port, "GET", "/api/world")).body.undoAvailable, false, "nothing left to undo after the undo");
  });
});

test("POST /api/undo of a corrupt snapshot → 422", async (t) => {
  await withPhase2App(t, {}, async ({ port, data, snapshots }) => {
    const snap = snapshots.create({ seed: "aaaaaaaaaaaaaaaa" });
    writeFileSync(path.join(data, "snapshots", snap.id, "snapshot.json"), "{not json");
    const res = await api(port, "POST", "/api/undo", { snapshotId: snap.id });
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.match(res.body.error.message, /corrupt/);
  });
});

test("GET /api/snapshots lists a corrupt snapshot as { id, corrupt: true }", async (t) => {
  await withPhase2App(t, {}, async ({ port, data }) => {
    mkdirSync(path.join(data, "snapshots", "2026-01-01T00-00-00.000Z-orphan"), { recursive: true });
    const res = await api(port, "GET", "/api/snapshots");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.snapshots, [{ id: "2026-01-01T00-00-00.000Z-orphan", corrupt: true }]);
  });
});

test("POST /api/publish and /api/undo are refused with 409 on main", async (t) => {
  await withPhase2App(t, { branch: "main" }, async ({ port, draft, snapshots }) => {
    const pub = await api(port, "POST", "/api/publish", { draftJobId: draft.id, confirm: true });
    assert.equal(pub.status, 409);
    assert.match(pub.body.error.message, /refused on main/);
    const snap = snapshots.create({ seed: "aaaaaaaaaaaaaaaa" });
    assert.equal((await api(port, "POST", "/api/undo", { snapshotId: snap.id })).status, 409);
  });
});
