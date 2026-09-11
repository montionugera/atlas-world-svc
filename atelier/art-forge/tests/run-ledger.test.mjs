import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAttempt, readLedger, ledgerPath } from "../lib/run-ledger.mjs";

function tmpRuns() {
  return mkdtempSync(join(tmpdir(), "ledger-"));
}

test("appendAttempt creates header then appends one-line entries", () => {
  const dir = tmpRuns();
  try {
    appendAttempt(dir, "A1-ART-02", {
      type: "render",
      seed: 42,
      hires: false,
    });
    appendAttempt(dir, "A1-ART-02", { type: "gate", ok: false, reasons: ["blur"] });
    const lines = readFileSync(ledgerPath(dir, "A1-ART-02"), "utf8")
      .trim()
      .split("\n");
    assert.equal(lines.length, 3);
    assert.deepEqual(JSON.parse(lines[0]), { v: 1, briefId: "A1-ART-02" });
    assert.equal(JSON.parse(lines[1]).seed, 42);
    // each entry is exactly one line, ts injected once
    const entry = JSON.parse(lines[1]);
    assert.ok(entry.ts && entry.type === "render");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readLedger returns {header, attempts}", () => {
  const dir = tmpRuns();
  try {
    appendAttempt(dir, "B", { type: "blockin" });
    const { header, attempts } = readLedger(dir, "B");
    assert.equal(header.briefId, "B");
    assert.equal(attempts.length, 1);
    assert.equal(readLedger(dir, "missing"), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
