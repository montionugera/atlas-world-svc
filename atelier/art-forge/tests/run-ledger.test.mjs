import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendAttempt,
  readLedger,
  ledgerPath,
  resolveRunsDir,
  RUNS_DIR_ENV,
} from "../lib/run-ledger.mjs";

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

test("appendAttempt adds no blank line when the file already ends with a newline", () => {
  const dir = tmpRuns();
  try {
    writeFileSync(ledgerPath(dir, "C"), '{"v":1,"briefId":"C"}\n');
    appendAttempt(dir, "C", { type: "blockin" });
    appendAttempt(dir, "C", { type: "blockin" });
    const text = readFileSync(ledgerPath(dir, "C"), "utf8");
    assert.doesNotMatch(text, /\n\s*\n/);
    assert.ok(text.endsWith("\n"));
    assert.equal(readLedger(dir, "C").attempts.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("appendAttempt separates entries when the existing file has no trailing newline", () => {
  const dir = tmpRuns();
  try {
    writeFileSync(ledgerPath(dir, "D"), '{"v":1,"briefId":"D"}');
    appendAttempt(dir, "D", { type: "blockin" });
    const lines = readFileSync(ledgerPath(dir, "D"), "utf8").split("\n").filter((l) => l !== "");
    assert.equal(lines.length, 2);
    lines.forEach((l) => JSON.parse(l));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readLedger skips blank lines and names the physical line of a malformed one", () => {
  const dir = tmpRuns();
  try {
    writeFileSync(ledgerPath(dir, "E"), '{"v":1,"briefId":"E"}\n\n{"type":"blockin"}\n');
    assert.equal(readLedger(dir, "E").attempts.length, 1);
    writeFileSync(ledgerPath(dir, "E"), '{"v":1,"briefId":"E"}\n\n{"type":"blockin"}\n{oops\n');
    assert.throws(
      () => readLedger(dir, "E"),
      (err) => err.line === 4 && /E\.json:4: malformed JSON line/.test(err.message),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(`${RUNS_DIR_ENV} overrides the default runs dir, and only when set`, () => {
  const prev = process.env[RUNS_DIR_ENV];
  try {
    process.env[RUNS_DIR_ENV] = "/sandbox/runs";
    assert.equal(resolveRunsDir({ defaultDir: "/repo/runs" }), "/sandbox/runs");
    delete process.env[RUNS_DIR_ENV];
    assert.equal(resolveRunsDir({ defaultDir: "/repo/runs" }), "/repo/runs");
  } finally {
    if (prev === undefined) delete process.env[RUNS_DIR_ENV];
    else process.env[RUNS_DIR_ENV] = prev;
  }
});

test("committed ledgers hold no test-sandbox entries (no absolute or ../ out paths)", () => {
  const runsDir = new URL("../runs/", import.meta.url);
  for (const name of readdirSync(runsDir).filter((n) => n.endsWith(".json") && n !== "_index.json")) {
    const bad = readFileSync(new URL(name, runsDir), "utf8")
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => line.trim() !== "")
      .filter(({ line }) => {
        const out = JSON.parse(line).out;
        return typeof out === "string" && (out.startsWith("/") || out.startsWith(".."));
      })
      .map(({ n }) => `${name}:${n}`);
    assert.deepEqual(bad, [], "test-written ledger entries (a test called a ledger writer without ART_FORGE_RUNS_DIR)");
  }
});
