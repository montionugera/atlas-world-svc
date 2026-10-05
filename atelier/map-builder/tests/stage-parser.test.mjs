import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStageLine, createStageTracker } from "../lib/stage-parser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(path.join(HERE, "fixtures/stage-report.txt"), "utf8").split("\n").filter(Boolean);

test("parses a step line", () => {
  assert.deepEqual(parseStageLine("stage: P2b substrate 41 ms"), { kind: "step", name: "P2b", label: "substrate", ms: 41 });
});
test("budget lines are not steps", () => {
  assert.deepEqual(parseStageLine("stage: generate TOTAL 5412 ms (budget 6000, fail 12000)"),
    { kind: "budget", stage: "generate", ms: 5412, budgetMs: 6000, failMs: 12000, total: true });
  assert.deepEqual(parseStageLine("stage: sheets 310 ms (budget 5000, fail 8000)"),
    { kind: "budget", stage: "sheets", ms: 310, budgetMs: 5000, failMs: 8000, total: false });
});
test("noise passes through", () => {
  assert.equal(parseStageLine("generate-world: wrote 40 files to x").kind, "noise");
});
test("tracker over the real fixture yields 18 distinct steps, loop stages count runs", () => {
  const t = createStageTracker({ stageCount: 18 });
  for (const l of FIXTURE) t.push(l);
  const steps = t.steps();
  assert.equal(steps.length, 18);
  assert.ok(steps.find((s) => s.name === "P11").runs >= 2);
  assert.equal(steps[0].name, "P1");
  assert.equal(t.stepIndex(), 18);
  assert.ok(steps.every((s) => s.status === "done" && Number.isInteger(s.ms)));
});
test("push returns a job.step event for steps and null for noise", () => {
  const t = createStageTracker({ stageCount: 18 });
  assert.equal(t.push("hello"), null);
  const ev = t.push("stage: P1 premise-masks 12 ms");
  assert.equal(ev.type, "job.step");
  assert.equal(ev.step.name, "P1");
  assert.equal(ev.stepIndex, 1);
});
