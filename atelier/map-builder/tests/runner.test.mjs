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

test("an in-process fn step runs, logs through onLine, and participates in onCommandStart/End", async () => {
  const lines = [], starts = [], ends = [];
  const r = await createRunner({}).run({ job: { id: "j5" }, cwd: REPO, timeoutMs: 10000,
    commands: [{ label: "snapshot", fn: async ({ log }) => { log("took snapshot s1"); } }, nodeE("after", "console.log('ran after')")],
    onLine: (l) => lines.push(l), onCommandStart: (c) => starts.push(c.label), onCommandEnd: (c) => ends.push({ label: c.label, exitCode: c.exitCode, ms: c.ms }) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.captured.snapshot, ["took snapshot s1"]);
  assert.deepEqual(r.captured.after, ["ran after"]);
  assert.ok(lines.some((l) => l.label === "snapshot" && l.stream === "stdout" && l.line === "took snapshot s1"));
  assert.deepEqual(starts, ["snapshot", "after"]);
  assert.deepEqual(ends.map((e) => [e.label, e.exitCode]), [["snapshot", 0], ["after", 0]]);
  assert.ok(ends.every((e) => typeof e.ms === "number" && e.ms >= 0));
});

test("a throwing fn step fails the run with the thrown message and stops the sequence", async () => {
  let ranAfter = false; const ends = [];
  const r = await createRunner({}).run({ job: { id: "j6" }, cwd: REPO, timeoutMs: 10000,
    commands: [{ label: "verify:seed", fn: async () => { throw new Error("map-builder: committed seed aaaa != draft seed bbbb"); } }, nodeE("after", "console.log('x')")],
    onLine: (l) => { if (l.label === "after") ranAfter = true; }, onCommandEnd: (c) => ends.push(c) });
  assert.equal(r.ok, false); assert.equal(r.exitCode, 1); assert.equal(ranAfter, false);
  assert.equal(r.error, "map-builder: committed seed aaaa != draft seed bbbb");
  assert.equal(ends[0].exitCode, 1); assert.equal(ends[0].error, r.error);
});

test("cancel() during an fn step is ignored — the step completes and the next one runs", async () => {
  const runner = createRunner({ killGraceMs: 200 });
  let release; const gate = new Promise((res) => { release = res; });
  const p = runner.run({ job: { id: "j7" }, cwd: REPO, timeoutMs: 10000,
    commands: [{ label: "restore", fn: async () => { await gate; } }, nodeE("check", "console.log('checked')")] });
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(runner.cancel("j7"), false);
  release();
  const r = await p;
  assert.equal(r.ok, true); assert.equal(r.cancelled, false); assert.deepEqual(r.captured.check, ["checked"]);
});

test("a failing command's error comes from its OWN stderr, not an earlier step's", async () => {
  const r = await createRunner({}).run({ job: { id: "j8" }, cwd: REPO, timeoutMs: 10000,
    commands: [nodeE("promote", "console.error('promote-world: note — nothing to worry about')"), nodeE("lock", "console.error('G-RENDER-LOCK: atlas drifted'); process.exitCode = 1")] });
  assert.equal(r.ok, false); assert.equal(r.error, "G-RENDER-LOCK: atlas drifted");
});

// Final review I3: an uncaught throw in the generator prints Node's stack
// trace — location line, source line, caret, blank, `Error: …`, frames,
// blank, `Node.js vX` — and none of it carries a tool prefix. The LAST line
// (the version banner) is the least useful line on the whole stream; the
// `Error: …` line is the one the owner needs to see.
test("a real uncaught throw surfaces its `Error:` line, not Node's version banner", async () => {
  const r = await createRunner({}).run({ job: { id: "j9" }, cwd: REPO, timeoutMs: 10000,
    commands: [nodeE("gen", "throw new Error('placePinned: 1 pinned record(s) cannot be placed — c-lm-skerryfast-fjord at [254,44] is a water cell')")] });
  assert.equal(r.ok, false);
  assert.equal(r.error, "Error: placePinned: 1 pinned record(s) cannot be placed — c-lm-skerryfast-fjord at [254,44] is a water cell");
});

test("a tool-prefixed line still wins over an `Error:` line that follows it", async () => {
  const r = await createRunner({}).run({ job: { id: "j10" }, cwd: REPO, timeoutMs: 10000,
    commands: [nodeE("gen", "console.error('generate-world: LOOP BUDGET generate 13000 ms > fail 12000'); console.error('Error: wrapped'); process.exitCode = 1")] });
  assert.equal(r.error, "generate-world: LOOP BUDGET generate 13000 ms > fail 12000");
});

test("with neither a tool prefix nor an `Error:` line, the FIRST non-empty stderr line surfaces", async () => {
  const r = await createRunner({}).run({ job: { id: "j11" }, cwd: REPO, timeoutMs: 10000,
    commands: [nodeE("gen", "console.error(''); console.error('boom: the real reason'); console.error('Node.js v0.0.0'); process.exitCode = 1")] });
  assert.equal(r.error, "boom: the real reason");
});
