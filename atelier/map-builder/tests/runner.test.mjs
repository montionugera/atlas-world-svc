import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRunner } from "../lib/runner.mjs";
import { draftCommands, outDirFor } from "../lib/commands.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const nodeE = (label, src) => ({ label, argv: [process.execPath, "-e", src] });

test("draft command plan uses the verified generator flags and out dir", () => {
  const job = { id: "j_20260913_000000_00000000", seed: "3f81c0aa9d2e5b17" };
  const cmds = draftCommands({ repoRoot: REPO, job, version: "3.0.0" });
  assert.equal(cmds.length, 2);
  assert.deepEqual(cmds[0].argv.slice(1), ["atelier/mapforge/generate-world.mjs", "--seed", job.seed, "--out", "build/mapforge/3f81c0aa-3.0.0", "--no-png", "--stage-report", "--json-report"]);
  assert.deepEqual(cmds[1].argv.slice(1), ["atelier/mapforge/promote-world.mjs", "--dry-run", "--from", "build/mapforge/3f81c0aa-3.0.0"]);
  assert.equal(outDirFor({ seed: job.seed, version: "3.0.0" }), "build/mapforge/3f81c0aa-3.0.0");
});

test("runs commands in sequence, streams lines, captures stdout per label", async () => {
  const lines = [];
  const r = await createRunner({}).run({ job: { id: "j1" }, cwd: REPO, timeoutMs: 10000,
    commands: [nodeE("a", "console.log('stage: P1 premise-masks 3 ms'); console.error('warn')"), nodeE("b", "console.log('promote-world: DRY RUN — 2 written, 0 deleted')")],
    onLine: (l) => lines.push(l) });
  assert.equal(r.ok, true); assert.equal(r.exitCode, 0);
  assert.deepEqual(r.captured.a, ["stage: P1 premise-masks 3 ms"]);
  assert.ok(lines.some((l) => l.label === "a" && l.stream === "stderr" && l.line === "warn"));
  assert.ok(lines.findIndex((l) => l.label === "b") > lines.findIndex((l) => l.label === "a"));
});

test("non-zero exit stops the sequence and surfaces the tool's own first error line", async () => {
  let ranB = false;
  const r = await createRunner({}).run({ job: { id: "j2" }, cwd: REPO, timeoutMs: 10000,
    commands: [nodeE("a", "console.error('generate-world: LOOP BUDGET generate 13000 ms > fail 12000'); process.exitCode = 1"), nodeE("b", "process.stdout.write('x')")],
    onLine: (l) => { if (l.label === "b") ranB = true; } });
  assert.equal(r.ok, false); assert.equal(r.exitCode, 1); assert.equal(ranB, false);
  assert.equal(r.error, "generate-world: LOOP BUDGET generate 13000 ms > fail 12000");
});

test("timeout kills a hung child and reports hung", async () => {
  const t0 = Date.now();
  const r = await createRunner({ killGraceMs: 200 }).run({ job: { id: "j3" }, cwd: REPO, timeoutMs: 300,
    commands: [nodeE("hang", "setInterval(() => {}, 1000)")], onLine: () => {} });
  assert.equal(r.timedOut, true); assert.equal(r.error, "hung"); assert.ok(Date.now() - t0 < 3000);
});

test("cancel ends a running job as cancelled", async () => {
  const runner = createRunner({ killGraceMs: 200 });
  const p = runner.run({ job: { id: "j4" }, cwd: REPO, timeoutMs: 10000, commands: [nodeE("hang", "setInterval(() => {}, 1000)")], onLine: () => {} });
  await new Promise((res) => setTimeout(res, 150));
  assert.equal(runner.cancel("j4"), true);
  const r = await p; assert.equal(r.cancelled, true); assert.equal(r.ok, false);
  assert.equal(runner.cancel("j4"), false);
});
