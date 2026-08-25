import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function ledgerPath(runsDir, briefId) {
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
