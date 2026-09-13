import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertRepoRoot, createRepo, loadConfig, loadSteps } from "../lib/repo.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const REPO = path.resolve(PKG, "..", "..");

test("assertRepoRoot accepts the repo and refuses a package dir", () => {
  assert.doesNotThrow(() => assertRepoRoot({ repoRoot: REPO }));
  assert.throws(() => assertRepoRoot({ repoRoot: PKG }), /not the atlas-world-svc repo root/);
});

test("timeouts are 2× Σ failMs of the rows each kind runs", () => {
  const repo = createRepo({ repoRoot: REPO });
  const rows = Object.fromEntries(repo.budgets.loop.map((r) => [r.stage, r]));
  assert.equal(repo.timeouts.draft, 2 * (rows.generate.failMs + rows.sheets.failMs));
  const all = repo.budgets.loop.reduce((s, r) => s + r.failMs, 0);
  assert.equal(repo.timeouts.publish, 2 * all);
});

test("branch() and dirtyWorldFiles() use read-only git and parse detached HEAD", () => {
  const calls = [];
  const git = (cmd, args) => { calls.push(args.join(" ")); return args[0] === "rev-parse" ? "HEAD\n" : " M content/world/fabric/world.json\n?? content/spine/nodes/x.json\n"; };
  const repo = createRepo({ repoRoot: REPO, git });
  assert.deepEqual(repo.branch(), { name: null, detached: true });
  assert.deepEqual(repo.dirtyWorldFiles(), ["content/world/fabric/world.json", "content/spine/nodes/x.json"]);
  assert.ok(calls.every((c) => /^(rev-parse --abbrev-ref HEAD|status --porcelain --)/.test(c)), calls);
});

test("currentSeed() reads fabric/world.json, ratioBand() reads manifest ratio", () => {
  const repo = createRepo({ repoRoot: REPO });
  assert.match(repo.currentSeed(), /^[0-9a-f]{16}$/);
  const band = repo.ratioBand();
  assert.ok(band.min < band.max && band.min > 0);
});

test("loadConfig clamps concurrency to 2 and keeps port 6016", () => {
  const cfg = loadConfig({ dir: PKG });
  assert.equal(cfg.port, 6016);
  assert.equal(cfg.bind, "127.0.0.1");
  assert.equal(loadConfig({ dir: PKG, overrides: { concurrency: 5 } }).concurrency, 2);
});

test("steps.json names exactly the generator's 18 distinct stages", () => {
  const steps = loadSteps({ dir: PKG });
  const names = steps.groups.flatMap((g) => g.stages.map((s) => s.name));
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(new Set(names), new Set(["P1","P2","P2b","P3","P5","P6","P7","P8","P9","P10","P7b","P11p","P11","P11b","P12","P13","P14","P14w"]));
  assert.equal(steps.stageCount, 18);
});
