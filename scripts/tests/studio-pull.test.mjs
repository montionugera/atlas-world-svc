// F-174 pull-by-manifest. Offline: every network call goes through a fetch double.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { isCached, pullAsset, pullEntries } from "../lib/studio-pull.mjs";
import { studioToken } from "../lib/studio-token.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIX = join(ROOT, "scripts/tests/fixtures/studio");
const RECORD = JSON.parse(readFileSync(join(FIX, "sergeant-asset-record.json"), "utf8")).asset;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const BYTES = Buffer.from("glTF fixture bytes, not the sergeant");
const tmp = () => mkdtempSync(join(tmpdir(), "studio-pull-"));

// The record route returns `record`; the media route returns `body`.
function fakeFetch({ record = RECORD, body = BYTES, calls = [] } = {}) {
  return async (url, init) => {
    calls.push({ url: String(url), auth: init?.headers?.authorization ?? null });
    if (String(url).endsWith("/media")) return new Response(body, { status: 200 });
    return new Response(JSON.stringify({ asset: record }), { status: 200 });
  };
}

test("sha mismatch: bytes that do not hash to the recorded sha256 are refused and nothing is cached", async () => {
  const cacheDir = tmp();
  const r = await pullAsset({ assetId: RECORD.id, sha256: RECORD.sha256, cacheDir, token: "t", fetchImpl: fakeFetch() });
  assert.equal(r.ok, false);
  assert.match(r.failure, new RegExp(`sha256: ${sha(BYTES)} != recorded ${RECORD.sha256}`));
  assert.deepEqual(readdirSync(cacheDir), []);
});

test("sha match: bytes land at <cacheDir>/<sha>.glb; a second call is served from cache with no request", async () => {
  const cacheDir = tmp();
  const want = sha(BYTES);
  const calls = [];
  const f = fakeFetch({ record: { ...RECORD, sha256: want }, calls });
  const a = await pullAsset({ assetId: "a", sha256: want, cacheDir, token: "t", fetchImpl: f });
  assert.deepEqual(a, { ok: true, path: join(cacheDir, `${want}.glb`), cached: false });
  assert.equal(sha(readFileSync(a.path)), want);
  assert.ok(calls.every((c) => c.auth === "Bearer t"));
  const n = calls.length;
  const b = await pullAsset({ assetId: "a", sha256: want, cacheDir, token: null, fetchImpl: f });
  assert.equal(b.cached, true);
  assert.equal(calls.length, n);
});

test("a corrupted cache file is re-downloaded, not trusted by its name", async () => {
  const cacheDir = tmp();
  const want = sha(BYTES);
  writeFileSync(join(cacheDir, `${want}.glb`), "corrupt");
  const r = await pullAsset({ assetId: "a", sha256: want, cacheDir, token: "t", fetchImpl: fakeFetch({ record: { ...RECORD, sha256: want } }) });
  assert.equal(r.ok, true);
  assert.equal(r.cached, false);
  assert.equal(sha(readFileSync(r.path)), want);
});

test("the Asset Studio record must agree with the manifest sha256 before any download", async () => {
  const calls = [];
  const r = await pullAsset({ assetId: "a", sha256: "f".repeat(64), cacheDir: tmp(), token: "t", fetchImpl: fakeFetch({ calls }) });
  assert.equal(r.ok, false);
  assert.match(r.failure, /Asset Studio record sha256 7f1c54c3[0-9a-f]+ != manifest f{64}/);
  assert.equal(calls.filter((c) => c.url.endsWith("/media")).length, 0);
});

test("an unreachable studio or a missing token is reported as unreachable, never as a pass", async () => {
  const down = async () => { throw new TypeError("fetch failed"); };
  const a = await pullAsset({ assetId: "a", sha256: "a".repeat(64), cacheDir: tmp(), token: "t", fetchImpl: down });
  assert.deepEqual([a.ok, a.unreachable], [false, true]);
  const b = await pullAsset({ assetId: "a", sha256: "a".repeat(64), cacheDir: tmp(), token: null, fetchImpl: down });
  assert.deepEqual([b.ok, b.unreachable], [false, true]);
  assert.match(b.failure, /no Asset Studio token/);
});

test("a refused token (401/403) is a hard FAIL 'studio auth failed', never unreachable", async () => {
  for (const status of [401, 403]) {
    const r = await pullAsset({ assetId: "a", sha256: "a".repeat(64), cacheDir: tmp(), token: "t",
      fetchImpl: async () => new Response("refused", { status }) });
    assert.equal(r.ok, false);
    assert.equal(r.unreachable, undefined, `http ${status} must not count as unreachable`);
    assert.match(r.failure, new RegExp(`studio auth failed \\(http ${status}\\)`));
  }
});

test("every Asset Studio request carries an abort signal; every token-route call is bounded to 20 s", async () => {
  const want = sha(BYTES);
  const signals = [];
  const f = async (url, init) => {
    signals.push(init?.signal);
    return String(url).endsWith("/media") ? new Response(BYTES, { status: 200 })
      : new Response(JSON.stringify({ asset: { ...RECORD, sha256: want } }), { status: 200 });
  };
  const r = await pullAsset({ assetId: "a", sha256: want, cacheDir: tmp(), token: "t", fetchImpl: f });
  assert.equal(r.ok, true, r.failure);
  assert.equal(signals.length, 2);
  assert.ok(signals.every((x) => x instanceof AbortSignal), "record and media fetches both need AbortSignal.timeout");
  const seen = [];
  studioToken({ env: {}, run: (cmd, _args, o) => { seen.push([cmd, o?.timeout]); return { status: 1, stdout: "" }; } });
  assert.ok(seen.length >= 1);
  assert.ok(seen.every(([, t]) => t === 20000), JSON.stringify(seen));
});

test("pullEntries lists only entries with a pull block", () => {
  const m = { entries: { a: { scene: "res://assets/a.glb" }, b: { pull: { assetStudioAsset: "id", tag: "t", sha256: "x" } } } };
  assert.deepEqual(pullEntries(m), [{ id: "b", assetId: "id", tag: "t", sha256: "x" }]);
});

test("studioToken prefers STUDIO_TOKEN and runs nothing when it is set; a failed kubectl gives null", () => {
  let ran = 0;
  const run = () => { ran++; return { status: 1, stdout: "" }; };
  assert.equal(studioToken({ env: { STUDIO_TOKEN: "abc" }, run }), "abc");
  assert.equal(ran, 0);
  assert.equal(studioToken({ env: {}, run }), null);
});

test("CLI: empty cache + unreachable studio exits 2 and says local Gate 1 never skips", () => {
  const r = spawnSync("node", [join(ROOT, "scripts/studio-pull.mjs"), "--manifest", join(FIX, "pull-manifest.json"), "--cache-dir", tmp()], {
    cwd: ROOT, encoding: "utf8", timeout: 20000,
    env: { ...process.env, STUDIO_TOKEN: "t", ATLAS_STUDIO_URL: "http://127.0.0.1:9" },
  });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /local Gate 1 never skips/);
  assert.match(r.stdout, /only CI sets ATLAS_SKIP_STUDIO=1/);
});

test("the cache dir and everything Godot or the strip writes into it are gitignored", () => {
  for (const p of [
    "game-client/studio-cache/x.glb", "game-client/studio-cache/x.glb.import",
    "game-client/studio-cache/x_albedo.jpg", "game-client/studio-cache/renders/x.strip.png",
    "game-client/studio-cache/renders/x.strip.png.import",
  ]) {
    assert.equal(spawnSync("git", ["check-ignore", "-q", p], { cwd: ROOT }).status, 0, `${p} is not ignored`);
  }
});

test("if an export preset file exists, every exclude_filter names studio-cache/*", (t) => {
  const f = join(ROOT, "game-client/export_presets.cfg"); // gitignored + untracked on purpose: it holds app_store_team_id
  if (!existsSync(f)) return t.diagnostic("no export_presets.cfg — no export possible");
  const lines = readFileSync(f, "utf8").split("\n").filter((l) => l.startsWith("exclude_filter="));
  assert.ok(lines.length >= 1, "export_presets.cfg has no exclude_filter key");
  for (const l of lines) assert.match(l, /studio-cache\/\*/, l);
});

const want = sha(BYTES);
const recWith = (over) => ({ ...RECORD, sha256: want, ...over });
const run = (record, calls = []) => pullAsset({ assetId: "a", sha256: want, cacheDir: tmp(), token: "t", fetchImpl: fakeFetch({ record, calls }) });

test("a media url that leaves the studio origin is refused and the token is never sent there", async () => {
  const calls = [];
  const r = await run(recWith({ mediaUrl: "http://evil.example/x" }), calls);
  assert.equal(r.ok, false);
  assert.equal(r.unreachable, undefined);
  assert.match(r.failure, /bad record: media url off-origin/);
  assert.equal(calls.filter((c) => c.url.includes("evil.example")).length, 0);
  const calls2 = [];
  await run(recWith({ mediaUrl: "@evil.example/x" }), calls2); // userinfo trick: must stay on the studio host
  assert.ok(calls2.every((c) => new URL(c.url).hostname === "asset-studio.joymify.local.com"), JSON.stringify(calls2));
  const r3 = await run(recWith({ mediaUrl: "//evil.example/x" }));
  assert.match(r3.failure, /off-origin/);
});

test("a non-hex sha256 in the manifest or the record is refused before it reaches a path", async () => {
  const a = await pullAsset({ assetId: "a", sha256: "../../x", cacheDir: tmp(), token: "t", fetchImpl: fakeFetch() });
  assert.equal(a.ok, false);
  assert.match(a.failure, /bad record/);
  const b = await run(recWith({ sha256: "../../etc/passwd" }));
  assert.equal(b.ok, false);
  assert.match(b.failure, /bad record/);
  const c = await run(recWith({ sha256: want.toUpperCase() }));
  assert.match(c.failure, /bad record/);
});

test("a record without mediaUrl or a non-JSON 200 body is a bad record (hard), not unreachable", async () => {
  const a = await run(recWith({ mediaUrl: undefined }));
  assert.equal(a.ok, false);
  assert.equal(a.unreachable, undefined);
  assert.match(a.failure, /bad record: missing mediaUrl/);
  const b = await pullAsset({ assetId: "a", sha256: want, cacheDir: tmp(), token: "t", fetchImpl: async () => new Response("<html>nope", { status: 200 }) });
  assert.equal(b.ok, false);
  assert.equal(b.unreachable, undefined);
  assert.match(b.failure, /bad record/);
});

test("404 is a hard failure; 5xx and a fetch timeout are unreachable", async () => {
  const go = (f) => pullAsset({ assetId: "a", sha256: want, cacheDir: tmp(), token: "t", fetchImpl: f });
  const nf = await go(async () => new Response("no", { status: 404 }));
  assert.deepEqual([nf.ok, nf.unreachable], [false, undefined]);
  assert.match(nf.failure, /http 404/);
  const e5 = await go(async () => new Response("boom", { status: 503 }));
  assert.deepEqual([e5.ok, e5.unreachable], [false, true]);
  const to = await go(async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); });
  assert.deepEqual([to.ok, to.unreachable], [false, true]);
});

test("a failed cache write leaves no .part file behind", async () => {
  const cacheDir = tmp();
  chmodSync(cacheDir, 0o500);
  try {
    await assert.rejects(pullAsset({ assetId: "a", sha256: want, cacheDir, token: "t", fetchImpl: fakeFetch({ record: recWith({}) }) }));
  } finally { chmodSync(cacheDir, 0o700); }
  assert.deepEqual(readdirSync(cacheDir).filter((n) => n.endsWith(".part")), []);
});

test("isCached never touches a path built from a non-hex sha; the CLI reports bad record, exit 1", () => {
  const root = tmp();
  const cacheDir = join(root, "cache");
  mkdirSync(cacheDir);
  mkdirSync(join(root, "x.glb")); // a directory outside the cache: reading it throws EISDIR if a traversal sha reaches readFileSync
  assert.equal(isCached(cacheDir, "../x"), false);
  const manifest = join(root, "manifest.json");
  writeFileSync(manifest, JSON.stringify({ entries: { evil: { pull: { assetStudioAsset: "a", tag: "t", sha256: "../x" } } } }));
  const r = spawnSync("node", [join(ROOT, "scripts/studio-pull.mjs"), "--manifest", manifest, "--cache-dir", cacheDir], {
    cwd: ROOT, encoding: "utf8", timeout: 20000,
    env: { ...process.env, STUDIO_TOKEN: "t", ATLAS_STUDIO_URL: "http://127.0.0.1:9" },
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /bad record/);
});
