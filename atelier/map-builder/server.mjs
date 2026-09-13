#!/usr/bin/env node
// map-builder service CLI — assembles the lib/ pieces into a running HTTP
// server. No root package.json / pnpm script: `node atelier/map-builder/server.mjs`
// from the repo root is the start command (Global Constraints).
import http from "node:http";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertRepoRoot, createRepo, loadConfig, loadSteps } from "./lib/repo.mjs";
import { createJobStore } from "./lib/jobs.mjs";
import { createRunner } from "./lib/runner.mjs";
import { createJobQueue } from "./lib/queue.mjs";
import { createEventHub } from "./lib/sse.mjs";
import { createStaticHandler } from "./lib/static.mjs";
import { createWorldReader } from "./lib/world.mjs";
import { createApp } from "./lib/app.mjs";

const PKG_DIR = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--port") args.port = Number(argv[++i]);
    else if (flag === "--bind") args.bind = argv[++i];
    else if (flag === "--repo-root") args.repoRoot = argv[++i];
    else if (flag === "--data-dir") args.dataDir = argv[++i];
    else if (flag === "--concurrency") args.concurrency = Number(argv[++i]);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  // Same pattern as render-sheet.mjs:49 — the package's grandparent is the repo root.
  const repoRoot = args.repoRoot ?? resolve(PKG_DIR, "..", "..");

  try {
    assertRepoRoot({ repoRoot });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
    return;
  }

  const overrides = {};
  if (args.port !== undefined) overrides.port = args.port;
  if (args.bind !== undefined) overrides.bind = args.bind;
  if (args.concurrency !== undefined) overrides.concurrency = args.concurrency;
  const config = loadConfig({ dir: PKG_DIR, overrides });

  const dataDir = args.dataDir ?? join(repoRoot, "build/map-builder");
  mkdirSync(dataDir, { recursive: true });

  const steps = loadSteps({ dir: PKG_DIR });
  // stageCount lives in steps.json, which createRepo() doesn't read — this
  // is the composition root, so it's the one place that stitches the two
  // together for world.mjs and queue.mjs (world-8 ruling).
  const repo = { ...createRepo({ repoRoot }), stageCount: steps.stageCount };
  const store = createJobStore({ dir: join(dataDir, "jobs") });
  const runner = createRunner({ killGraceMs: config.killGraceMs });
  const events = createEventHub({ replay: 200 });
  const queue = createJobQueue({ store, runner, repo, concurrency: config.concurrency, stageCount: steps.stageCount, events });
  const world = createWorldReader({ repo, store });
  const staticHandler = createStaticHandler({ root: repoRoot });
  // A per-boot token, not a semver — package.json carries no version field.
  // The UI polls /api/health and compares this against what it saw on load;
  // a change means the service restarted, which is the "live/read-only
  // switch" the spec describes (a restart can drop in-memory queue state).
  const version = crypto.randomBytes(4).toString("hex");
  const app = createApp({ repo, store, queue, events, world, staticHandler, steps, version });

  const recovered = store.recoverInterrupted();
  console.log(`map-builder: marked ${recovered.length} interrupted job(s)`);

  const bind = config.bind ?? "127.0.0.1";
  const port = config.port ?? 6016;
  const server = http.createServer(app);

  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.error(`map-builder: port ${port} is busy — is another builder running? Use --port <n>`);
      process.exit(1);
      return;
    }
    throw e;
  });

  server.listen(port, bind, () => {
    const actualPort = server.address().port;
    console.log(`map-builder: listening on http://${bind}:${actualPort}/  (storybook: /atelier/asset-storybook/index.html, api: /api/health)`);
  });

  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const job of store.list({ status: "running" })) queue.cancel(job.id);
    queue.close(); // marks dropped-pending interrupted; does not touch actives (cancelled above)
    events.close();
    server.close(() => process.exit(0));
    // server.close() waits for open keep-alive/SSE sockets to close on their
    // own — force them shut so shutdown can't hang on an idle client (Node
    // 18.2+; CI resolves latest 18.x per Global Constraints).
    server.closeAllConnections?.();
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
