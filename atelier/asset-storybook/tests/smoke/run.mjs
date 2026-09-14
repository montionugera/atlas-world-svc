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
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: ok, reject });
      toChrome.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
    });
  return {
    send,
    on: (fn) => listeners.add(fn),
    off: (fn) => listeners.delete(fn),
    async close() {
      await Promise.race([send("Browser.close").catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
      proc.kill();
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

async function runScenario({ browser, base, scenario, expectedBriefs }) {
  const { browserContextId } = await browser.send("Target.createBrowserContext");
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const consoleErrors = [];
  const onMessage = (msg) => {
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
  try {
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.enable");
    await send("Page.navigate", { url: `${base}/atelier/asset-storybook/index.html` });
    await scenario.steps({ evaluate, waitFor, expectedBriefs, reload: () => send("Page.reload") });
    if (consoleErrors.length) throw new Error(`console errors: ${consoleErrors.join(" | ")}`);
    return { name: scenario.name, ok: true };
  } catch (err) {
    return { name: scenario.name, ok: false, reason: err.message };
  } finally {
    browser.off(onMessage);
    await browser.send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
  }
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    if (process.env.STORYBOOK_SMOKE_REQUIRED === "1") {
      console.error("smoke: FAIL — no Chrome found and STORYBOOK_SMOKE_REQUIRED=1");
      process.exit(2);
    }
    console.log("SKIPPED: no Chrome — storybook smoke did not run");
    process.exit(0);
  }
  const expectedBriefs = JSON.parse(
    readFileSync(join(REPO_ROOT, "atelier/asset-storybook/forge-briefs-index.json"), "utf8"),
  ).briefs.length;
  const globalOverride = process.env.SMOKE_OVERRIDE ? JSON.parse(process.env.SMOKE_OVERRIDE) : {};
  const browser = launchChrome(chrome);
  const results = [];
  try {
    for (const scenario of SCENARIOS) {
      if (process.env.SMOKE_BASE && scenario.server) {
        console.log(`SKIPPED (needs local server): ${scenario.name}`);
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
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`smoke: ${results.length - failed}/${results.length} scenarios ok (${chrome})`);
  process.exit(failed ? 1 : 0);
}

const watchdog = setTimeout(() => {
  console.error("smoke: FAIL — global timeout (Chrome hung?)");
  process.exit(1);
}, 6 * TIMEOUT_MS + 30000);
watchdog.unref();
main().catch((err) => {
  console.error("smoke: FAIL —", err);
  process.exit(1);
});
