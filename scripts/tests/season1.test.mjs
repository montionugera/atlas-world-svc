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

import { MEASURES, buildRows, renderTable } from "../lib/season1.mjs";

const FIXTURE = join(ROOT, "scripts/tests/fixtures/season1");

test("mobBases counts the codegen mob type ids", () => {
  assert.equal(MEASURES.mobBases(FIXTURE), 2);
});

test("bestiaryDesigns counts the top-level array", () => {
  assert.equal(MEASURES.bestiaryDesigns(FIXTURE), 3);
});

test("actIndependentQuests excludes act gates, event gates, their descendants and cycles", () => {
  // free: quest-free-root, quest-free-child, quest-two-free-parents (both of
  // its unlockedBy entries are themselves free). Everything else is gated,
  // downstream of a gate, or in a cycle that never resolves — including
  // quest-mixed-gate, whose unlockedBy mixes a free quest id with an act-*
  // id: this proves the AND-gate (every prerequisite must be free), since an
  // OR-gate (any prerequisite free) would wrongly admit it via quest-free-root.
  assert.equal(MEASURES.actIndependentQuests(FIXTURE), 3);
});

test("art measures count by key prefix", () => {
  assert.equal(MEASURES.townArt(FIXTURE), 2);
  assert.equal(MEASURES.bestiaryArt(FIXTURE), 0);
});

test("buildRows reports blocked lines without inventing a delta", () => {
  const doc = {
    lines: [
      { id: "measured", label: "M", target: 5, measure: "mobBases", source: "s" },
      { id: "stuck", label: "S", target: 1, blockedBy: "P3 - buried-ground design", source: "s" },
    ],
  };
  const [measured, stuck] = buildRows(doc, FIXTURE);
  assert.equal(measured.actual, 2);
  assert.equal(measured.note, "3 short");
  assert.equal(stuck.actual, null);
  assert.match(stuck.note, /^blocked: P3/);
});

test("buildRows never throws when a measured file is missing", () => {
  const doc = { lines: [{ id: "measured", label: "M", target: 5, measure: "mobBases", source: "s" }] };
  const [row] = buildRows(doc, join(ROOT, "scripts/tests/fixtures/does-not-exist"));
  assert.equal(row.actual, null);
  assert.match(row.note, /^unmeasurable:/);
});

test("renderTable emits a header and one line per row", () => {
  const out = renderTable(
    buildRows({ lines: [{ id: "measured", label: "M", target: 5, measure: "mobBases", source: "s" }] }, FIXTURE),
  );
  assert.match(out, /measured/);
  assert.match(out, /target/);
});

import { execFileSync } from "node:child_process";

const CLI = join(ROOT, "scripts/report_season1.mjs");

test("CLI prints every budget line and exits 0", () => {
  const out = execFileSync(process.execPath, [CLI], { encoding: "utf8" });
  for (const line of budget.lines) assert.match(out, new RegExp(line.id));
  assert.match(out, /Season 1 budget/);
});

test("CLI still exits 0 when every measured file is missing", () => {
  // The guarantee that makes this a report and not a gate.
  // --root also moves the default budget path, so --budget is passed
  // explicitly: the missing fixture root has no budget file to read.
  const out = execFileSync(
    process.execPath,
    [
      CLI,
      "--root",
      join(ROOT, "scripts/tests/fixtures/does-not-exist"),
      "--budget",
      join(ROOT, "content/season-1-budget.json"),
    ],
    { encoding: "utf8" },
  );
  assert.match(out, /unmeasurable:/);
});

test("CLI rejects an unknown flag with exit 2", () => {
  assert.throws(
    () => execFileSync(process.execPath, [CLI, "--nope"], { encoding: "utf8", stdio: "pipe" }),
    (err) => err.status === 2,
  );
});
