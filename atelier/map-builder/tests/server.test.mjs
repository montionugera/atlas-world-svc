import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import http from "node:http";
import readline from "node:readline";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const REPO = path.resolve(PKG, "..", "..");
const SERVER = join(PKG, "server.mjs");

const get = (port, urlPath) => new Promise((resolve, reject) => {
  const req = http.request({ host: "127.0.0.1", port, path: urlPath }, (res) => {
    res.resume();
    res.on("end", () => resolve({ status: res.statusCode, headers: res.headers }));
  });
  req.on("error", reject);
  req.end();
});

// Reads stdout line by line until `pattern` matches, then resolves with the
// matching line. Also collects stderr for assertions after the process exits.
const waitForStdout = (child, pattern) => new Promise((resolve, reject) => {
  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => { if (pattern.test(line)) { rl.close(); resolve(line); } });
  child.on("exit", (code) => reject(new Error(`process exited (${code}) before matching ${pattern}`)));
});

test("boots, serves the API and the static passthrough, and shuts down cleanly on SIGTERM", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "mb-server-"));
  const child = spawn(process.execPath, [SERVER, "--port", "0", "--data-dir", dataDir], { cwd: REPO });
  let stderr = "";
  child.stderr.on("data", (c) => { stderr += c.toString("utf8"); });
  try {
    const line = await waitForStdout(child, /map-builder: listening on http:\/\/127\.0\.0\.1:(\d+)/);
    const port = Number(/:(\d+)\/?/.exec(line)[1]);

    const health = await get(port, "/api/health");
    assert.equal(health.status, 200);
    const root = await get(port, "/");
    assert.equal(root.status, 302);

    const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
    const t0 = Date.now();
    child.kill("SIGTERM");
    const code = await exited;
    assert.equal(code, 0);
    assert.ok(Date.now() - t0 < 2000, `shutdown took ${Date.now() - t0}ms`);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("refuses to start on a busy port", async () => {
  const occupied = net.createServer();
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  const busyPort = occupied.address().port;
  const dataDir = mkdtempSync(join(tmpdir(), "mb-server-busy-"));
  const child = spawn(process.execPath, [SERVER, "--port", String(busyPort), "--data-dir", dataDir], { cwd: REPO });
  let stderr = "";
  child.stderr.on("data", (c) => { stderr += c.toString("utf8"); });
  try {
    const code = await new Promise((resolve) => child.on("exit", resolve));
    assert.equal(code, 1);
    assert.match(stderr, /map-builder: port \d+ is busy — is another builder running\? Use --port <n>/);
  } finally {
    occupied.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("refuses a repo root that isn't atlas-world-svc", async () => {
  const notARepo = mkdtempSync(join(tmpdir(), "mb-server-notrepo-"));
  const dataDir = mkdtempSync(join(tmpdir(), "mb-server-notrepo-data-"));
  const child = spawn(process.execPath, [SERVER, "--port", "0", "--repo-root", notARepo, "--data-dir", dataDir], { cwd: REPO });
  let stderr = "";
  child.stderr.on("data", (c) => { stderr += c.toString("utf8"); });
  try {
    const code = await new Promise((resolve) => child.on("exit", resolve));
    assert.equal(code, 1);
    assert.match(stderr, /not the atlas-world-svc repo root/);
  } finally {
    rmSync(notARepo, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
});
