import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  const dir = mkdtempSync(join(tmpdir(), "mb-api-"));
  const store = createJobStore({ dir: join(dir, "jobs") });
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

const api = (port, method, urlPath, body) => new Promise((resolve, reject) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const req = http.request({ host: "127.0.0.1", port, method, path: urlPath,
    headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {} }, (res) => {
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
    await queue.onIdle();
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
