import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

// Single-writer assumption: ledgers are appended by one human-driven forge
// session at a time — there is no cross-process locking.

const BRIEF_ID_RE = /^[A-Za-z0-9-]+$/;

/** Tests set this so ledger writers never touch the committed runs/ ledgers. */
export const RUNS_DIR_ENV = "ART_FORGE_RUNS_DIR";

function assertValidBriefId(briefId) {
  if (typeof briefId !== "string" || !BRIEF_ID_RE.test(briefId)) {
    throw new Error(
      `invalid briefId ${JSON.stringify(briefId)} — must match /^[A-Za-z0-9-]+$/`,
    );
  }
}

/**
 * The runs dir a ledger writer should use: `$ART_FORGE_RUNS_DIR` when set,
 * else the caller's default. Read at CALL time, so a test can set the env
 * var after its imports have been hoisted.
 * @param {{ defaultDir: string }} opts
 */
export function resolveRunsDir({ defaultDir }) {
  const override = process.env[RUNS_DIR_ENV];
  return override ? override : defaultDir;
}

export function ledgerPath(runsDir, briefId) {
  assertValidBriefId(briefId);
  return join(runsDir, `${briefId}.json`);
}

function endsWithNewline(p, size) {
  const fd = openSync(p, "r");
  try {
    const byte = Buffer.alloc(1);
    readSync(fd, byte, 0, 1, size - 1);
    return byte[0] === 0x0a;
  } finally {
    closeSync(fd);
  }
}

export function appendAttempt(runsDir, briefId, entry) {
  mkdirSync(runsDir, { recursive: true });
  const p = ledgerPath(runsDir, briefId);
  const size = existsSync(p) ? statSync(p).size : 0;
  if (size === 0) {
    appendFileSync(p, JSON.stringify({ v: 1, briefId }) + "\n");
  } else if (!endsWithNewline(p, size)) {
    // Legacy files (and hand edits) end without a newline; separate first,
    // and never prepend one to a file that already ends in "\n" (that is
    // how a blank line got into A1-ART-02.json).
    appendFileSync(p, "\n");
  }
  appendFileSync(p, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
}

export function readLedger(runsDir, briefId) {
  const p = ledgerPath(runsDir, briefId);
  if (!existsSync(p)) return null;
  let header = null;
  const attempts = [];
  readFileSync(p, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.trim() === "") return;
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        const err = new Error(`${p}:${i + 1}: malformed JSON line: ${line.slice(0, 120)}`);
        err.line = i + 1;
        throw err;
      }
      if (header === null) header = value;
      else attempts.push(value);
    });
  return { header, attempts };
}
