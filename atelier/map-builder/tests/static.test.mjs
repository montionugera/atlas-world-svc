import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStaticHandler } from "../lib/static.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");

const withServer = async (fn, { root = REPO } = {}) => {
  const handler = createStaticHandler({ root });
  const server = http.createServer((req, res) => { if (!handler(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const get = (port, urlPath, headers = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: "127.0.0.1", port, path: urlPath, headers }, (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
  });
  req.on("error", reject);
  req.end();
});

test("GET / redirects to the storybook index", async () => {
  await withServer(async (port) => {
    const res = await get(port, "/");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/atelier/asset-storybook/index.html");
  });
});

test("GET /healthz returns ok", async () => {
  await withServer(async (port) => {
    const res = await get(port, "/healthz");
    assert.equal(res.status, 200);
    assert.equal(res.body, "ok");
  });
});

test("serves the storybook index with text/html", async () => {
  await withServer(async (port) => {
    const res = await get(port, "/atelier/asset-storybook/index.html");
    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], "text/html");
  });
});

test("json manifests get no-store", async () => {
  await withServer(async (port) => {
    const res = await get(port, "/atelier/asset-storybook/maps-index.json");
    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], "application/json");
    assert.equal(res.headers["cache-control"], "no-store");
  });
});

// The exact filename "atlas.svg" the brief describes doesn't exist on disk
// (the real committed file is "atlas-world.svg") — using the real file so
// this exercises the actual static-file-serving path against real content.
test("serves an svg map asset with image/svg+xml", async () => {
  await withServer(async (port) => {
    const res = await get(port, "/game-client/assets/art/maps/atlas-world.svg");
    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], "image/svg+xml");
  });
});

test("path traversal is refused with 404", async () => {
  await withServer(async (port) => {
    const a = await get(port, "/../etc/passwd");
    assert.equal(a.status, 404);
    const b = await get(port, "/atelier/%2e%2e/x");
    assert.equal(b.status, 404);
  });
});

test("a directory path is 404, not a listing", async () => {
  await withServer(async (port) => {
    const res = await get(port, "/atelier/");
    assert.equal(res.status, 404);
  });
});

// Fix round 1, F1/I3: a file that stats fine but can't be opened (mode 000)
// must 404 instead of taking the whole service down with an uncaught 'error'
// event on the read stream — and the server must still answer afterwards.
test("a file that cannot be opened returns 404 and the server survives the next request", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mb-static-unreadable-"));
  const filePath = join(dir, "secret.txt");
  writeFileSync(filePath, "shh");
  chmodSync(filePath, 0o000);
  try {
    await withServer(async (port) => {
      const bad = await get(port, "/secret.txt");
      assert.equal(bad.status, 404);
      const next = await get(port, "/healthz");
      assert.equal(next.status, 200);
      assert.equal(next.body, "ok");
    }, { root: dir });
  } finally {
    chmodSync(filePath, 0o644);
    rmSync(dir, { recursive: true, force: true });
  }
});

// Fix round 1, F5/I4: --repo-root with a trailing slash (shell
// tab-completion appends one) must not blank the whole storybook.
test("a root with a trailing slash still serves files", async () => {
  await withServer(async (port) => {
    const res = await get(port, "/atelier/asset-storybook/index.html");
    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], "text/html");
  }, { root: REPO + "/" });
});
