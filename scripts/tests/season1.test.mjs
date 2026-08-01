import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const budget = JSON.parse(readFileSync(join(ROOT, "content/season-1-budget.json"), "utf8"));

test("budget document has the expected envelope", () => {
  assert.equal(budget.version, 1);
  assert.equal(budget.season, 1);
  assert.equal(budget.cluster, 1);
  assert.equal(budget.record, "docs/worldbuilding/DR-003-season-1-budget.md");
  assert.ok(Array.isArray(budget.lines) && budget.lines.length > 0);
});

test("every line is well formed and ids are unique", () => {
  const ids = new Set();
  for (const line of budget.lines) {
    assert.equal(typeof line.id, "string", `line missing id: ${JSON.stringify(line)}`);
    assert.equal(ids.has(line.id), false, `duplicate line id: ${line.id}`);
    ids.add(line.id);
    assert.equal(typeof line.label, "string", `${line.id}: label must be a string`);
    assert.equal(Number.isInteger(line.target), true, `${line.id}: target must be an integer`);
    assert.equal(typeof line.source, "string", `${line.id}: source must cite where the number came from`);
    const measured = typeof line.measure === "string";
    const blocked = typeof line.blockedBy === "string";
    assert.ok(measured !== blocked, `${line.id}: needs exactly one of measure / blockedBy`);
  }
});
