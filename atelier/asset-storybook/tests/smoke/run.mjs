#!/usr/bin/env node
// F-053 Phase 1 — headless smoke for the asset storybook's Forge tab.
//
// Zero npm dependencies: a node:http server at the repo root + the SYSTEM
// Chrome driven over the DevTools protocol on --remote-debugging-pipe (fd 3
// in, fd 4 out, NUL-delimited JSON). Chosen over the spec's --dump-dom iframe
// harness because this gate must see console errors thrown by the page's own
// module scripts. Works on Node 18 (the CI pin).
//
// Exit: 0 all ok (or "SKIPPED: no Chrome"), 1 a scenario failed,
//       2 no Chrome while STORYBOOK_SMOKE_REQUIRED=1.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
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

function startServer({ fail = [], override = {} }) {
  const log = [];
  const server = createServer((req, res) => {
    const repoPath = decodeURIComponent(new URL(req.url, "http://smoke").pathname).replace(/^\/+/, "");
    log.push({ method: req.method, path: repoPath });
    if (fail.includes(repoPath)) {
      res.writeHead(404);
      res.end("smoke: forced 404");
      return;
    }
    const file = override[repoPath] ? resolve(HERE, override[repoPath]) : resolve(REPO_ROOT, repoPath);
    if (!override[repoPath] && !file.startsWith(REPO_ROOT + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      if (!statSync(file).isFile()) throw new Error("not a file");
      const body = readFileSync(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () => ok({ server, log, base: `http://127.0.0.1:${server.address().port}` })),
  );
}

function launchChrome(chromePath) {
  const userDataDir = mkdtempSync(join(tmpdir(), "sb-smoke-chrome-"));
  const args = [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-pipe", `--user-data-dir=${userDataDir}`, "--window-size=1440,1000", "about:blank",
  ];
  if (process.env.CI) args.push("--no-sandbox"); // GitHub's ubuntu runners restrict the Chrome sandbox
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
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}

async function runScenario({ browser, base, scenario, expectedBriefs }) {
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
    const nav = await send("Page.navigate", { url: `${base}/atelier/asset-storybook/index.html` });
    if (nav?.errorText) throw new Error(`navigation failed: ${nav.errorText}`);
    await scenario.steps({ evaluate, waitFor, expectedBriefs, reload: () => send("Page.reload") });
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
  try {
    for (const scenario of SCENARIOS) {
      if (process.env.SMOKE_BASE && scenario.server) {
        console.log(`SKIPPED (needs local server): ${scenario.name}`);
        // Fix round 1, item 2: push a (skipped) result instead of `continue`
        // silently dropping it, so the final summary's denominator reflects
        // the true scenario count, not just the ones actually run.
        results.push({ name: scenario.name, ok: false, skipped: true, reason: "needs local server (SMOKE_BASE set)" });
        continue;
      }
      let local = null;
      if (!process.env.SMOKE_BASE) {
        local = await startServer({
          fail: scenario.server?.fail,
          override: { ...globalOverride, ...(scenario.server?.override || {}) },
        });
      }
      const result = await runScenario({ browser, base: process.env.SMOKE_BASE || local.base, scenario, expectedBriefs });
      if (local) {
        const nonGet = local.log.filter((r) => r.method !== "GET" && r.method !== "HEAD");
        if (result.ok && nonGet.length) Object.assign(result, { ok: false, reason: `non-GET requests: ${JSON.stringify(nonGet)}` });
        local.server.close();
      }
      console.log(result.ok ? `ok    ${result.name}` : `FAIL  ${result.name} — ${result.reason}`);
      results.push(result);
    }
  } finally {
    await browser.close();
    activeBrowser = null;
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
