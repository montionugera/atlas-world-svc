import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkNoTrackedCache, checkPullEntry, isPullOnly } from "../lib/pull-entry.mjs";
import { checkLicensePolicy } from "../lib/license-policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BYTES = Buffer.from("pull fixture");
const SHA = createHash("sha256").update(BYTES).digest("hex");
const entry = (over = {}) => ({
  scene: `res://studio-cache/${SHA}.glb`, license: "studio-private", source: "asset studio", kind: "pipelineCharacter",
  pull: { from: "asset-studio", assetStudioAsset: "a-1", tag: "t-1", sha256: SHA }, ...over,
});
function gameClient(content) {
  const gc = mkdtempSync(join(tmpdir(), "pull-entry-"));
  mkdirSync(join(gc, "studio-cache"));
  if (content) writeFileSync(join(gc, "studio-cache", `${SHA}.glb`), content);
  return gc;
}

test("studio-private is allowed only on a pull-only entry (never on a committed asset)", () => {
  const ok = []; checkLicensePolicy("npc:s", entry(), ok);
  assert.deepEqual(ok, []);
  for (const bad of [
    { scene: "res://assets/characters/s.glb", license: "studio-private", source: "x" },
    entry({ scene: "res://assets/characters/s.glb" }),
  ]) {
    const f = []; checkLicensePolicy("npc:s", bad, f);
    assert.match(f.join(), /studio-private is allowed only for pull-only entries/);
  }
});

test("CC0 / CC-BY / other licences are judged exactly as before", () => {
  const f = [];
  checkLicensePolicy("a", { license: "CC0" }, f);
  checkLicensePolicy("b", { license: "GPL" }, f);
  assert.equal(f.length, 1);
  assert.match(f[0], /"GPL" not allowed/);
});

test("isPullOnly needs asset id, tag, a 64-hex sha and the matching cache scene", () => {
  assert.equal(isPullOnly(entry()), true);
  assert.equal(isPullOnly(entry({ pull: { ...entry().pull, sha256: "abc" } })), false);
  assert.equal(isPullOnly(entry({ pull: { ...entry().pull, tag: "" } })), false);
  assert.equal(isPullOnly(entry({ scene: `res://studio-cache/${"0".repeat(64)}.glb` })), false);
  assert.equal(isPullOnly({ scene: "res://assets/a.glb" }), false);
});

test("cache present and matching → ok; tampered cache → failed", () => {
  const f = [];
  assert.equal(checkPullEntry("npc:s", entry(), gameClient(BYTES), f, { skipStudio: false }), "ok");
  assert.deepEqual(f, []);
  const g = [];
  assert.equal(checkPullEntry("npc:s", entry(), gameClient(Buffer.from("tampered")), g, { skipStudio: false }), "failed");
  assert.match(g.join(), /cache file sha256 [0-9a-f]{64} != pull\.sha256/);
});

test("cache empty → loud failure naming the pull command, unless ATLAS_SKIP_STUDIO (CI only)", () => {
  const f = [];
  assert.equal(checkPullEntry("npc:s", entry(), gameClient(null), f, { skipStudio: false }), "failed");
  assert.match(f.join(), /pull-only asset not in cache — run node scripts\/studio-pull\.mjs/);
  const g = [];
  assert.equal(checkPullEntry("npc:s", entry(), gameClient(null), g, { skipStudio: true }), "skipped");
  assert.deepEqual(g, []);
});

test("the real gate: an unpulled entry fails loudly (exit 1); ATLAS_SKIP_STUDIO=1 (CI) turns it into a reported SKIP (exit 0)", () => {
  const m = JSON.parse(readFileSync(join(ROOT, "game-client/assets/manifest.json"), "utf8"));
  const ghost = "e".repeat(64);
  m.entries["npc:ghost_pull"] = entry({ scene: `res://studio-cache/${ghost}.glb`, pull: { ...entry().pull, sha256: ghost } });
  const p = join(mkdtempSync(join(tmpdir(), "pull-gate-")), "manifest.json");
  writeFileSync(p, JSON.stringify(m));
  const run = (env) => spawnSync("node", [join(ROOT, "scripts/check_asset_manifest.mjs"), "--manifest", p],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });
  const loud = run({ ATLAS_SKIP_STUDIO: "" });
  assert.equal(loud.status, 1, loud.stdout);
  assert.match(loud.stdout, /npc:ghost_pull.*pull-only asset not in cache/);
  const skip = run({ ATLAS_SKIP_STUDIO: "1" });
  assert.equal(skip.status, 0, skip.stdout);
  // The SKIP line itself says "not in cache", so test for the FAIL line, not the phrase.
  assert.doesNotMatch(skip.stdout, /FAIL.*npc:ghost_pull/);
  assert.match(skip.stdout, /SKIP npc:ghost_pull: pull-only, not in cache \(ATLAS_SKIP_STUDIO=1\)/);
});

test("guard W: nothing under game-client/studio-cache is tracked by git", () => {
  const r = spawnSync("git", ["ls-files", "game-client/studio-cache"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.stdout.trim(), "");
});

test("guard W: a tracked thumbnail row or a tracked Godot file derived from studio-cache fails; the real repo is clean", () => {
  const repo = mkdtempSync(join(tmpdir(), "guard-w-"));
  spawnSync("git", ["init", "-q"], { cwd: repo });
  mkdirSync(join(repo, "game-client/assets/.thumbs"), { recursive: true });
  writeFileSync(join(repo, "game-client/assets/.thumbs/index.json"),
    JSON.stringify({ version: 1, entries: { [`res://studio-cache/${SHA}.glb`]: { thumb: "x.webp" }, "classes/a.png": { thumb: "y.webp" } } }));
  writeFileSync(join(repo, "game-client/assets/leak.glb.import"), `source_file="res://studio-cache/${SHA}.glb"\n`);
  assert.equal(spawnSync("git", ["add", "-A"], { cwd: repo }).status, 0);
  const f = [];
  checkNoTrackedCache(repo, f);
  assert.match(f.join("\n"), /\.thumbs\/index\.json records 1 thumbnail\(s\) of pull-only sources/);
  assert.match(f.join("\n"), /1 tracked file\(s\) reference studio-cache bytes: game-client\/assets\/leak\.glb\.import/);
  const clean = [];
  checkNoTrackedCache(ROOT, clean);
  assert.deepEqual(clean, []);
});

test("every new F-174 fixture is committable (git check-ignore exits non-zero for each)", () => {
  for (const p of [
    "scripts/tests/fixtures/studio/sergeant-asset-record.json",
    "scripts/tests/fixtures/studio/pull-manifest.json",
    "atelier/asset-forge/tests/studio-report.fixture.json",
  ]) {
    assert.notEqual(spawnSync("git", ["check-ignore", "-q", p], { cwd: ROOT }).status, 0, `${p} is gitignored: it would never be committed`);
  }
});

test("guard W: a tracked file under game-client/studio-cache fails checkNoTrackedCache", () => {
  const repo = mkdtempSync(join(tmpdir(), "guard-w-cache-"));
  spawnSync("git", ["init", "-q"], { cwd: repo });
  mkdirSync(join(repo, "game-client/studio-cache"), { recursive: true });
  writeFileSync(join(repo, `game-client/studio-cache/${SHA}.glb`), BYTES);
  assert.equal(spawnSync("git", ["add", "-f", "-A"], { cwd: repo }).status, 0);
  const f = [];
  checkNoTrackedCache(repo, f);
  assert.match(f.join("\n"), /\(W\) 1 file\(s\) under game-client\/studio-cache\/ are tracked/);
});

test("fix1: a pull-only entry MUST be studio-private (CC0 / CC-BY on a pull entry fail)", () => {
  for (const lic of ["CC0", "CC-BY-4.0"]) {
    const f = []; checkLicensePolicy("npc:s", entry({ license: lic, author: "a" }), f);
    assert.match(f.join(), /pull-only entry must have license studio-private/, lic);
  }
  const g = []; checkLicensePolicy("npc:s", { pull: { x: 1 }, scene: "res://assets/a.glb", license: "CC0" }, g);
  assert.match(g.join(), /pull-only entry must have license studio-private/);
});

test("fix3: guard W fails closed on a git error, and the thumb index check runs without git", () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-w-nogit-"));
  const f = [];
  checkNoTrackedCache(dir, f, { git: () => { throw Object.assign(new Error("fatal: detected dubious ownership"), { stderr: "fatal: detected dubious ownership" }); } });
  assert.match(f.join("\n"), /\(W\) git failed/);
  // a definite "not a git work tree" may skip the tracked-file check only
  const g = [];
  mkdirSync(join(dir, "game-client/assets/.thumbs"), { recursive: true });
  writeFileSync(join(dir, "game-client/assets/.thumbs/index.json"), JSON.stringify({ entries: { "res://studio-cache/a.glb": {} } }));
  checkNoTrackedCache(dir, g, { git: () => { throw Object.assign(new Error("x"), { stderr: "fatal: not a git repository (or any of the parent directories): .git" }); } });
  assert.doesNotMatch(g.join("\n"), /git failed/);
  assert.match(g.join("\n"), /index\.json records 1 thumbnail/);
});

test("fix4: a pull entry carrying any committed file field is not pull-only", () => {
  for (const over of [
    { stream: "res://assets/audio/a.ogg" }, { preview: "res://assets/previews/p.png" },
    { file: "res://assets/x.glb" }, { previewHashOf: "res://assets/x.glb" },
    { nested: { frame: "res://assets/y.png" } },
  ]) assert.equal(isPullOnly(entry(over)), false, JSON.stringify(over));
  assert.equal(isPullOnly(entry({ preview: `res://studio-cache/${SHA}.png` })), true);
  const f = []; checkPullEntry("npc:s", entry({ preview: "res://assets/p.png" }), gameClient(BYTES), f, { skipStudio: false });
  assert.equal(f.length, 1);
});

test("isPullOnly rejects a res:// path with a .. segment (F-174 final review)", () => {
  const esc = `res://studio-cache/../assets/${SHA}.glb`;
  assert.equal(isPullOnly(entry({ scene: esc })), false);
  assert.equal(isPullOnly(entry({ preview: "res://studio-cache/../assets/p.png" })), false);
  assert.equal(isPullOnly(entry({ extra: { frame: "res://studio-cache/a/../../assets/x.png" } })), false);
  assert.equal(isPullOnly(entry()), true);
});

test("guard W: a tracked .glb whose sha256 equals a manifest pull.sha256 fails (plain-copy leak)", () => {
  const repo = mkdtempSync(join(tmpdir(), "guard-w-copy-"));
  spawnSync("git", ["init", "-q"], { cwd: repo });
  mkdirSync(join(repo, "game-client/assets/characters"), { recursive: true });
  writeFileSync(join(repo, "game-client/assets/characters/copy.glb"), BYTES);
  writeFileSync(join(repo, "game-client/assets/characters/other.glb"), Buffer.from("something else"));
  assert.equal(spawnSync("git", ["add", "-A"], { cwd: repo }).status, 0);
  const f = [];
  checkNoTrackedCache(repo, f, { pullShas: new Set([SHA]) });
  assert.match(f.join("\n"), /\(W\) tracked glb game-client\/assets\/characters\/copy\.glb is a byte copy of a pull-only asset/);
  assert.doesNotMatch(f.join("\n"), /other\.glb/);
  const none = [];
  checkNoTrackedCache(repo, none, { pullShas: new Set(["0".repeat(64)]) });
  assert.deepEqual(none, []);
});
