// F-170 fix round: concurrent probe blocks must not share browser storage.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { chromeAvailable, closeSharedBrowser, launch } from "../probes/atlas_audit_lib.mjs";

test("two launch() tabs have isolated localStorage and one kill leaves the other intact", { skip: !chromeAvailable() && "Chrome not found" }, async () => {
  const server = http.createServer((_q, s) => { s.setHeader("content-type", "text/html"); s.end("<!doctype html><title>x</title>"); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const a = await launch({ w: 390, h: 844, url: "about:blank" });
  const b = await launch({ w: 390, h: 844, url: "about:blank" });
  try {
    for (const c of [a, b]) { await c.send("Page.navigate", { url }); await new Promise((r) => setTimeout(r, 400)); }
    await a.eval(`localStorage.setItem('atlas-hud-hidden','1'); 0`);
    assert.equal(await b.eval(`localStorage.getItem('atlas-hud-hidden')`), null, "tab B saw tab A's localStorage");
    await b.eval(`localStorage.setItem('k','b'); 0`);
    await b.kill();
    assert.equal(await a.eval(`localStorage.getItem('atlas-hud-hidden')`), "1", "killing B cleared A's storage");
  } finally {
    await a.kill().catch(() => {});
    server.close();
    closeSharedBrowser();
  }
});
