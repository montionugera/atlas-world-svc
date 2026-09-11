import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Single-writer assumption: ledgers are appended by one human-driven forge
// session at a time — there is no cross-process locking.

const BRIEF_ID_RE = /^[A-Za-z0-9-]+$/;

function assertValidBriefId(briefId) {
  if (typeof briefId !== "string" || !BRIEF_ID_RE.test(briefId)) {
    throw new Error(
      `invalid briefId ${JSON.stringify(briefId)} — must match /^[A-Za-z0-9-]+$/`,
    );
  }
}

export function ledgerPath(runsDir, briefId) {
  assertValidBriefId(briefId);
  return join(runsDir, `${briefId}.json`);
}

export function appendAttempt(runsDir, briefId, entry) {
  mkdirSync(runsDir, { recursive: true });
  const p = ledgerPath(runsDir, briefId);
  if (!existsSync(p)) {
    appendFileSync(p, JSON.stringify({ v: 1, briefId }));
  }
  appendFileSync(
    p,
    "\n" + JSON.stringify({ ts: new Date().toISOString(), ...entry }),
  );
}

export function readLedger(runsDir, briefId) {
  const p = ledgerPath(runsDir, briefId);
  if (!existsSync(p)) return null;
  const lines = readFileSync(p, "utf8").trim().split("\n");
  return {
    header: JSON.parse(lines[0]),
    attempts: lines.slice(1).map((l) => JSON.parse(l)),
  };
}
