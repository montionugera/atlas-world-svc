import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const FRONT = path.join(ROOT, "scripts/atlas_world_web/frontend");
const recordsJs = readFileSync(
  path.join(FRONT, "02c_records_search.js"),
  "utf8",
);

// Load the record-page script with the one helper it needs from another slice; no DOM is touched at load.
const ctx = vm.createContext({
  escapeHtml: (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;"),
});
vm.runInContext(`${recordsJs}\nthis.renderRecordMap = renderRecordMap;`, ctx);

const node = (id, x, y, over = {}) => ({
  id,
  label: id,
  kind: "town",
  level: [1, 5],
  x,
  y,
  record: `node:${id}`,
  ...over,
});

test("renderRecordMap escapes data and links nodes to their record", () => {
  const svg = ctx.renderRecordMap({
    nodes: [
      node("a", 0, 0, { label: '<img src=x onerror=alert(1)> "q"' }),
      node("b", 1, 0, { kind: "unbuilt", level: null }),
    ],
    edges: [{ a: "a", b: "b", state: "closed", danger: false, label: "" }],
  });
  assert.ok(svg.includes("<svg"));
  assert.ok(!svg.includes("<img"), "a label with < must not become markup");
  assert.ok(svg.includes("&lt;img"));
  assert.ok(
    svg.includes('data-record="node:a"') && svg.includes('tabindex="0"'),
  );
  assert.ok(svg.includes("Not built yet") && svg.includes("rm-edge--closed"));
});

test("danger edges carry a text mark and the legend explains it; continent edges show priority", () => {
  const danger = ctx.renderRecordMap({
    nodes: [node("a", 0, 0), node("b", 1, 0, { kind: "outside" })],
    edges: [{ a: "a", b: "b", state: "open", danger: true, label: "" }],
  });
  assert.ok(
    danger.includes("rm-edge--danger") &&
      danger.includes(">!</text>") &&
      danger.includes("much higher level"),
  );
  const cont = ctx.renderRecordMap({
    nodes: [
      node("a", 10, 20, { kind: "district" }),
      node("b", 60, 70, { kind: "district" }),
    ],
    edges: [{ a: "a", b: "b", state: "closed", danger: false, label: "P1" }],
  });
  assert.ok(cont.includes(">P1</text>") && cont.includes("record-map--plane"));
});

test("the record page draws the map when the payload has one", () => {
  assert.match(recordsJs, /body\.map \? renderRecordMap\(body\.map\)/);
});

const tmp = mkdtempSync(path.join(os.tmpdir(), "atlas-web-record-map-"));
const DB = path.join(tmp, "catalog.sqlite");
test.after(() => rmSync(tmp, { recursive: true, force: true }));
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

test("API: district and continent records carry a map from the studio files", async (t) => {
  const r = spawnSync("python3", ["scripts/build_catalog_db.py"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ATLAS_CATALOG_DB: DB },
  });
  assert.equal(r.status, 0, r.stderr);
  const port = await freePort();
  const child = spawn(
    "python3",
    ["scripts/catalog_explorer_web.py", "--port", String(port)],
    {
      cwd: ROOT,
      env: { ...process.env, ATLAS_READ_ONLY: "", ATLAS_CATALOG_DB: DB },
      stdio: "ignore",
    },
  );
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i += 1) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) break;
    } catch {
      /* not up yet */
    }
    assert.ok(i < 600, "server did not start");
    await new Promise((res) => setTimeout(res, 100));
  }
  const get = async (k, id) =>
    await (await fetch(`${base}/api/record?kind=${k}&id=${id}`)).json();
  const d = (await get("district", "district-porcelain-cradle")).map;
  assert.equal(d.nodes.length, 7);
  assert.equal(d.edges.filter((e) => e.danger).length, 2);
  assert.equal(d.nodes.find((n) => n.label.startsWith("Celadon")).x, -1);
  const c = (await get("continent", "continent-01-hearthbloom-basin")).map;
  assert.equal(c.nodes.length, 11);
  assert.equal(c.edges.length, 18);
  assert.equal((await get("town", "nope")).map, undefined);
});
