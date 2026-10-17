import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import http from "node:http";
import readline from "node:readline";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJobStore } from "../lib/jobs.mjs";
import { outDirFor } from "../lib/commands.mjs";
import { GENERATOR_VERSION } from "../../mapforge/lib/version.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const REPO = path.resolve(PKG, "..", "..");
const SERVER = path.join(PKG, "server.mjs");

const get = (port, urlPath) => new Promise((resolve, reject) => {
  const req = http.request({ host: "127.0.0.1", port, path: urlPath }, (res) => {
    res.resume();
    res.on("end", () => resolve({ status: res.statusCode, headers: res.headers }));
  });
  req.on("error", reject);
  req.end();
});

const post = (port, urlPath, body) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const req = http.request({ host: "127.0.0.1", port, method: "POST", path: urlPath,
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
  });
  req.on("error", reject);
  req.write(data);
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
  const dataDir = mkdtempSync(path.join(tmpdir(), "mb-server-"));
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
  const dataDir = mkdtempSync(path.join(tmpdir(), "mb-server-busy-"));
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

// Fix round 1, F4: recoverInterrupted() used to run before listen(), so a
// second instance refused on a busy port could still clobber a live
// instance's running job (shared, disk-backed data dir) moments before it
// died. Pre-seed a "running" record directly and confirm the refused
// instance never touches it.
test("a busy-port refusal leaves an existing running job record untouched", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "mb-server-recovery-"));
  const store = createJobStore({ dir: path.join(dataDir, "jobs") });
  const job = store.create({ kind: "draft", seed: "cccccccccccccccc", outDir: "build/mapforge/does-not-exist" });
  store.update(job.id, { status: "running", startedAt: new Date().toISOString() });

  const occupied = net.createServer();
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  const busyPort = occupied.address().port;
  const child = spawn(process.execPath, [SERVER, "--port", String(busyPort), "--data-dir", dataDir], { cwd: REPO });
  let stderr = "";
  child.stderr.on("data", (c) => { stderr += c.toString("utf8"); });
  try {
    const code = await new Promise((resolve) => child.on("exit", resolve));
    assert.equal(code, 1);
    const after = store.get(job.id);
    assert.equal(after.status, "running");
    assert.equal(after.error, null);
  } finally {
    occupied.close();
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(dataDir, { recursive: true, force: true });
  }
});

// Fix round 1, F6: cancel() only signals SIGTERM to the child; the
// "cancelled" record is written when the child actually exits. Exiting
// immediately on SIGTERM raced that write, leaving the on-disk record
// "running" (relabelled "Interrupted" on the next boot instead of
// "Cancelled"). Boot for real, start one real draft job, SIGTERM almost
// immediately, and assert the record reads "cancelled" and the process
// still exits promptly.
test("SIGTERM cancels a running job and records it as cancelled before exit", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "mb-server-shutdown-"));
  const child = spawn(process.execPath, [SERVER, "--port", "0", "--data-dir", dataDir], { cwd: REPO });
  let stderr = "";
  child.stderr.on("data", (c) => { stderr += c.toString("utf8"); });
  const seed = "dddddddddddddddd";
  const outDir = path.join(REPO, outDirFor({ seed, version: GENERATOR_VERSION }));
  try {
    const line = await waitForStdout(child, /map-builder: listening on http:\/\/127\.0\.0\.1:(\d+)/);
    const port = Number(/:(\d+)\/?/.exec(line)[1]);

    const created = await post(port, "/api/jobs", { kind: "draft", seed });
    const id = created.jobs[0].id;

    const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
    const t0 = Date.now();
    child.kill("SIGTERM");
    const code = await exited;
    assert.equal(code, 0);
    assert.ok(Date.now() - t0 < 6000, `shutdown took ${Date.now() - t0}ms`);

    const record = JSON.parse(readFileSync(path.join(dataDir, "jobs", `${id}.json`), "utf8"));
    assert.equal(record.status, "cancelled");
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("refuses a repo root that isn't atlas-world-svc", async () => {
  const notARepo = mkdtempSync(path.join(tmpdir(), "mb-server-notrepo-"));
  const dataDir = mkdtempSync(path.join(tmpdir(), "mb-server-notrepo-data-"));
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
