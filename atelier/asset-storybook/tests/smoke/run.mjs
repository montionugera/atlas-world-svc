#!/usr/bin/env node
// F-053 Phase 1 / SSOT merge W3 — headless smoke for the atlas-world panels.
//
// The asset storybook now lives inside atlas-world (scripts/catalog_explorer_web.py), so this
// gate spawns THAT server on a free port, with ATLAS_REVIEW_QUEUE_PATH pointed at a temp copy of
// content/review-queue.json (a smoke run never dirties the repo) and MAP_BUILDER_PORT pointed at
// a port nothing listens on (the map-builder-down scenario is deterministic), and polls /healthz.
// Each scenario gets a thin node:http proxy in front of it that can force a 404 (`fail`) or swap
// a file (`override`) for one repo path and logs every request; everything else is forwarded.
//
// Zero npm dependencies: the SYSTEM Chrome driven over the DevTools protocol on
// --remote-debugging-pipe (fd 3 in, fd 4 out, NUL-delimited JSON). Chosen over the spec's
// --dump-dom iframe harness because this gate must see console errors thrown by the page's own
// module scripts. Works on Node 18 (the CI pin).
//
// Exit: 0 all ok (or "SKIPPED: no Chrome"), 1 a scenario failed,
//       2 no Chrome while STORYBOOK_SMOKE_REQUIRED=1.
import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { createServer as createNetServer } from "node:net";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS } from "./scenarios.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 45000);
// Fix round 1, item 1: a per-CDP-call timeout so a single stuck command can't
// hang forever even if Chrome is technically alive but wedged. Independent of
// TIMEOUT_MS (which paces waitFor()'s polling loop) — a fixed, generous value.
const SEND_TIMEOUT_MS = Number(process.env.SMOKE_SEND_TIMEOUT_MS || 30000);
const MIME = {
  ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".wav": "audio/wav", ".md": "text/markdown",
};

function findChrome() {
  const candidates = process.env.CHROME_BIN
    ? [process.env.CHROME_BIN] // exclusive: a bad value means "no Chrome", never a fallback
    : ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  for (const c of candidates) {
    if (isAbsolute(c)) {
      if (existsSync(c)) return c;
      continue;
    }
    const hit = (process.env.PATH || "").split(delimiter).map((d) => join(d, c)).find((p) => existsSync(p));
    if (hit) return hit;
  }
  return null;
}

function freePort() {
  return new Promise((ok, fail) => {
    const srv = createNetServer();
    srv.on("error", fail);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => ok(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getStatus(url) {
  try {
    const res = await fetch(url);
    return res.status;
  } catch {
    return 0;
  }
}

// Spawns scripts/catalog_explorer_web.py and waits for /healthz. `queueFile` is the temp copy
// every write lands in; `deadPort` is a port with no listener (stands in for the Map Builder).
async function startExplorer() {
  const dir = mkdtempSync(join(tmpdir(), "sb-smoke-explorer-"));
  const queueFile = join(dir, "review-queue.json");
  copyFileSync(join(REPO_ROOT, "content/review-queue.json"), queueFile);
  const port = await freePort();
  const deadPort = await freePort();
  const proc = spawn("python3", [join(REPO_ROOT, "scripts/catalog_explorer_web.py"), "--port", String(port)], {
    cwd: REPO_ROOT,
    env: { ...process.env, ATLAS_REVIEW_QUEUE_PATH: queueFile, MAP_BUILDER_PORT: String(deadPort) },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  proc.stderr.on("data", (d) => { stderr = (stderr + d).slice(-4000); });
  let exitedWith = null;
  proc.on("exit", (code, signal) => { exitedWith = `code=${code} signal=${signal}`; });
  proc.on("error", (err) => { exitedWith = `spawn error: ${err.message}`; });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + Number(process.env.SMOKE_SERVER_TIMEOUT_MS || 90000);
  while (Date.now() < deadline) {
    if (exitedWith) throw new Error(`catalog_explorer_web.py exited before /healthz answered (${exitedWith}): ${stderr.trim()}`);
    if ((await getStatus(base + "/healthz")) === 200) {
      return {
        base,
        queueFile,
        async close() {
          if (exitedWith === null) {
            proc.kill();
            await Promise.race([new Promise((r) => proc.once("exit", r)), sleep(3000)]);
          }
          rmSync(dir, { recursive: true, force: true });
        },
      };
    }
    await sleep(250);
  }
  proc.kill();
  throw new Error(`catalog_explorer_web.py did not answer /healthz within the timeout: ${stderr.trim()}`);
}

// A per-scenario proxy in front of the explorer. `fail` = repo paths answered 404, `override` =
// repo path -> fixture file served instead; all else is forwarded verbatim (method, headers —
// Host and Origin included, so the explorer's same-origin write guard sees what the browser sent).
function startProxy({ upstream, fail = [], override = {} }) {
  const log = [];
  const server = createServer((req, res) => {
    const repoPath = decodeURIComponent(new URL(req.url, "http://smoke").pathname).replace(/^\/+/, "");
    const entry = { method: req.method, path: repoPath, status: 0 };
    log.push(entry);
    if (fail.includes(repoPath)) {
      entry.status = 404;
      res.writeHead(404);
      res.end("smoke: forced 404");
      req.resume();
      return;
    }
    if (override[repoPath]) {
      entry.status = 200;
      res.writeHead(200, { "content-type": MIME[extname(override[repoPath])] || "application/octet-stream" });
      res.end(readFileSync(resolve(HERE, override[repoPath])));
      req.resume();
      return;
    }
    const up = new URL(upstream);
    const proxied = httpRequest(
      { host: up.hostname, port: up.port, path: req.url, method: req.method, headers: req.headers },
      (upRes) => {
        entry.status = upRes.statusCode;
        res.writeHead(upRes.statusCode, upRes.headers);
        upRes.pipe(res);
      },
    );
    proxied.on("error", (err) => {
      entry.status = 502;
      res.writeHead(502);
      res.end("smoke proxy: " + err.message);
    });
    req.pipe(proxied);
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () => ok({ server, log, base: `http://127.0.0.1:${server.address().port}` })),
  );
}

function launchChrome(chromePath) {
  const userDataDir = mkdtempSync(join(tmpdir(), "sb-smoke-chrome-"));
  const args = [
    // SwiftShader (software WebGL), not --disable-gpu: <model-viewer> throws on a null renderer.
    "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-pipe", `--user-data-dir=${userDataDir}`, "--window-size=1440,1000", "about:blank",
  ];
  if (process.env.CI && process.platform === "linux") args.push("--no-sandbox"); // GitHub's ubuntu runners restrict the Chrome sandbox
  const proc = spawn(chromePath, args, {
    stdio: ["ignore", "ignore", process.env.SMOKE_DEBUG ? "inherit" : "ignore", "pipe", "pipe"],
  });
  const toChrome = proc.stdio[3];
  const fromChrome = proc.stdio[4];
  const pending = new Map();
  const listeners = new Set();
  let nextId = 1;
  let buffered = Buffer.alloc(0);
  // Fix round 1, item 1: once Chrome or its DevTools pipe dies, `deadError`
  // is latched and every pending + future send() rejects immediately instead
  // of hanging until the global watchdog (item 2/4 cover that backstop).
  let deadError = null;
  let exited = false;

  function failAllPending(err) {
    if (deadError) return;
    deadError = err;
    for (const entry of pending.values()) entry.reject(err);
    pending.clear();
  }

  proc.on("exit", (code, signal) => {
    exited = true;
    failAllPending(new Error(`Chrome process exited (code=${code}, signal=${signal})`));
  });
  // Fix round 1, item 5: an unhandled 'error' event (e.g. a bad CHROME_BIN
  // causing EACCES) would otherwise crash the whole process with a raw stack
  // trace, bypassing the documented exit-code contract and leaking
  // userDataDir. Route it through the same failAllPending() path instead.
  proc.on("error", (err) => {
    exited = true;
    failAllPending(new Error(`Chrome process error: ${err.message}`));
  });
  toChrome.on("error", (err) => failAllPending(new Error(`DevTools pipe (fd3, to Chrome) error: ${err.message}`)));
  toChrome.on("close", () => failAllPending(new Error("DevTools pipe (fd3, to Chrome) closed")));
  fromChrome.on("error", (err) => failAllPending(new Error(`DevTools pipe (fd4, from Chrome) error: ${err.message}`)));
  fromChrome.on("close", () => failAllPending(new Error("DevTools pipe (fd4, from Chrome) closed — Chrome likely exited")));

  fromChrome.on("data", (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    let end;
    while ((end = buffered.indexOf(0)) !== -1) {
      const msg = JSON.parse(buffered.subarray(0, end).toString("utf8"));
      buffered = buffered.subarray(end + 1);
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve: ok, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else ok(msg.result);
      } else {
        for (const fn of listeners) fn(msg);
      }
    }
  });
  const send = (method, params = {}, sessionId) => {
    if (deadError) return Promise.reject(deadError);
    return new Promise((ok, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP call timed out after ${SEND_TIMEOUT_MS} ms waiting for a response to: ${method}`));
      }, SEND_TIMEOUT_MS);
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); ok(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      try {
        toChrome.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
      } catch (err) {
        pending.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  };
  // Fix round 1, item 3: wait for the child to actually exit (bounded) before
  // rmSync'ing its userDataDir — otherwise Chrome can still hold files open
  // under it, producing an intermittent ENOTEMPTY on cleanup.
  function waitForExit(timeoutMs = 4000) {
    return new Promise((resolvePromise) => {
      if (exited) return resolvePromise();
      const timer = setTimeout(resolvePromise, timeoutMs);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolvePromise();
      });
    });
  }
  return {
    send,
    on: (fn) => listeners.add(fn),
    off: (fn) => listeners.delete(fn),
    async close() {
      await Promise.race([send("Browser.close").catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
      if (!exited) {
        try {
          proc.kill();
        } catch {
          // already gone — nothing to do
        }
      }
      await waitForExit();
      // Fix round 1, item 3: bounded retries absorb the OS-level lag between
      // the process actually exiting and its open file handles releasing.
      try {
        rmSync(userDataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
      } catch {
        // Ignore late Chrome helper ENOTEMPTY cleanup races in /tmp after exit
      }
    },
  };
}

async function runScenario({ browser, base, scenario, expectedBriefs, log, queueFile }) {
  const consoleErrors = [];
  let browserContextId;
  let onMessage;
  try {
    // Fix round 1, item 6: these three setup calls used to sit before this
    // try block — a throw here escaped runScenario entirely (no clean
    // {ok:false} result) and skipped the context-disposal / server-close
    // cleanup below. Now they're covered by the same try/catch/finally as
    // everything else.
    ({ browserContextId } = await browser.send("Target.createBrowserContext"));
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    onMessage = (msg) => {
      if (msg.sessionId !== sessionId) return;
      const p = msg.params;
      if (msg.method === "Runtime.exceptionThrown") {
        consoleErrors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text);
      } else if (msg.method === "Runtime.consoleAPICalled" && p.type === "error") {
        consoleErrors.push(p.args.map((a) => a.value ?? a.description).join(" "));
      } else if (msg.method === "Log.entryAdded" && p.entry.level === "error" && p.entry.source !== "network") {
        // source "network" = a 404 for local-only data (gitignored PNGs, thumbs): expected, not a page bug.
        consoleErrors.push(p.entry.text);
      }
    };
    browser.on(onMessage);
    const send = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`page expression threw: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    };
    const waitFor = async (expression, label) => {
      const deadline = Date.now() + TIMEOUT_MS;
      let lastError = null;
      while (Date.now() < deadline) {
        try {
          if (await evaluate(expression)) return;
        } catch (err) {
          lastError = err; // navigation in progress destroys the context; retry
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error(`timed out after ${TIMEOUT_MS} ms waiting for: ${label}${lastError ? ` (last: ${lastError.message})` : ""}`);
    };
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.enable");
    // Fix round 1, item 7: surface a navigation failure (e.g. connection
    // refused) immediately instead of letting it masquerade as a slow page
    // and reporting a misleading "timed out waiting for: ..." ~TIMEOUT_MS
    // later.
    const nav = await send("Page.navigate", { url: `${base}${scenario.path || "/?tab=forge"}` });
    if (nav?.errorText) throw new Error(`navigation failed: ${nav.errorText}`);
    const readQueue = () => JSON.parse(readFileSync(queueFile, "utf8"));
    const requests = (pred) => (log || []).filter(pred);
    await scenario.steps({
      evaluate, waitFor, expectedBriefs, readQueue, requests,
      reload: () => send("Page.reload"),
    });
    if (consoleErrors.length) throw new Error(`console errors: ${consoleErrors.join(" | ")}`);
    return { name: scenario.name, ok: true };
  } catch (err) {
    return { name: scenario.name, ok: false, reason: err.message };
  } finally {
    if (onMessage) browser.off(onMessage);
    if (browserContextId) await browser.send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
  }
}

let activeBrowser = null; // hoisted so a firing watchdog can route through real cleanup (item 4)

function exitClean(code) {
  clearTimeout(watchdogTimer);
  process.exit(code);
}

async function fireWatchdog() {
  console.error("smoke: FAIL — global timeout (Chrome hung?)");
  try {
    if (activeBrowser) await activeBrowser.close();
  } catch (err) {
    console.error("smoke: watchdog cleanup also failed —", err.message);
  }
  exitClean(1);
}

// Fix round 1, item 2/4: NOT unref()'d — an unref'd timer lets Node exit
// silently (code 0) if Chrome dies and nothing else is holding the event
// loop open, which is exactly how the false-green hole happened. Cleared
// explicitly via exitClean() on every exit path from main() instead. On
// firing, it routes through the browser's own close() (item 4) rather than
// calling process.exit() directly, so a watchdog-fired failure no longer
// leaks a live Chrome process + its temp profile directory.
const watchdogTimer = setTimeout(fireWatchdog, 6 * TIMEOUT_MS + 30000);

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    if (process.env.STORYBOOK_SMOKE_REQUIRED === "1") {
      console.error("smoke: FAIL — no Chrome found and STORYBOOK_SMOKE_REQUIRED=1");
      exitClean(2);
    }
    console.log("SKIPPED: no Chrome — storybook smoke did not run");
    exitClean(0);
  }
  const expectedBriefs = JSON.parse(
    readFileSync(join(REPO_ROOT, "atelier/asset-storybook/forge-briefs-index.json"), "utf8"),
  ).briefs.length;
  const globalOverride = process.env.SMOKE_OVERRIDE ? JSON.parse(process.env.SMOKE_OVERRIDE) : {};
  const browser = launchChrome(chrome);
  activeBrowser = browser;
  const results = [];
  let explorer = null;
  try {
    if (!process.env.SMOKE_BASE) explorer = await startExplorer();
    for (const scenario of SCENARIOS) {
      // Scenarios that fail/override a path or write the queue need the spawned explorer: against an
      // external SMOKE_BASE there is no proxy and no temp queue (a write would hit the real repo file).
      if (process.env.SMOKE_BASE && (scenario.server || scenario.writes)) {
        console.log(`SKIPPED (needs local server): ${scenario.name}`);
        // Fix round 1, item 2: push a (skipped) result instead of `continue`
        // silently dropping it, so the final summary's denominator reflects
        // the true scenario count, not just the ones actually run.
        results.push({ name: scenario.name, ok: false, skipped: true, reason: "needs local server (SMOKE_BASE set)" });
        continue;
      }
      let local = null;
      if (explorer) {
        local = await startProxy({
          upstream: explorer.base,
          fail: scenario.server?.fail,
          override: { ...globalOverride, ...(scenario.server?.override || {}) },
        });
      }
      const result = await runScenario({
        browser, base: process.env.SMOKE_BASE || local.base, scenario, expectedBriefs,
        log: local?.log, queueFile: explorer?.queueFile,
      });
      if (local) {
        // Writes are only legitimate for scenarios that declare them (`writes: true`).
        const nonGet = local.log.filter((r) => r.method !== "GET" && r.method !== "HEAD");
        if (result.ok && nonGet.length && !scenario.writes) Object.assign(result, { ok: false, reason: `non-GET requests: ${JSON.stringify(nonGet)}` });
        // A panel module or the vendored viewer that 404s is a broken page even if nothing threw.
        const forced = new Set(scenario.server?.fail || []);
        const broken = local.log.filter((r) =>
          (r.status === 0 || r.status >= 400) && !forced.has(r.path) &&
          (r.path.startsWith("atelier/asset-storybook/js/") || r.path.startsWith("atelier/asset-storybook/css/") || r.path.startsWith("vendor/")));
        if (result.ok && broken.length) Object.assign(result, { ok: false, reason: `page code failed to load: ${JSON.stringify(broken)}` });
        local.server.close();
      }
      console.log(result.ok ? `ok    ${result.name}` : `FAIL  ${result.name} — ${result.reason}`);
      results.push(result);
    }
  } finally {
    await browser.close();
    activeBrowser = null;
    if (explorer) await explorer.close();
  }
  // Fix round 1, item 2: the false-green hole — with SMOKE_BASE set and
  // Chrome failing to launch/dying, the old code could reach here having run
  // zero scenarios and still exit 0. Treat an empty result set as a hard
  // failure rather than silently printing "0/0 scenarios ok".
  if (results.length === 0) {
    console.error("smoke: FAIL — zero scenarios ran (results.length === 0)");
    exitClean(1);
  }
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.skipped && !r.ok).length;
  const ok = results.length - skipped - failed;
  console.log(`smoke: ${ok}/${results.length} scenarios ok${skipped ? ` (${skipped} skipped)` : ""} (${chrome})`);
  exitClean(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("smoke: FAIL —", err);
  exitClean(1);
});
