// F-053 Phase 1 — C0.3: a blank line in a run ledger made parseLedgerText
// throw, and forge.mjs swallowed the error, so the brief vanished from the
// Forge tab with no visible trace. Blank lines are now skipped, and a genuinely
// malformed line is named by its PHYSICAL line number in a visible row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseLedgerText } from "../js/forge/staleness.mjs";
import { ledgerErrorText } from "../js/forge/pipeline.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const HEADER = '{"v":1,"briefId":"A1"}';
const ENTRY = '{"ts":"2026-01-01T00:00:00Z","type":"blockin","briefHash":"x"}';

test("parseLedgerText skips blank and whitespace-only lines anywhere in the file", () => {
  const parsed = parseLedgerText(`\n${HEADER}\n\n${ENTRY}\n   \n${ENTRY}\n\n`);
  assert.equal(parsed.header.briefId, "A1");
  assert.equal(parsed.attempts.length, 2);
});

test("parseLedgerText reports the physical line number of a malformed line, counting blank lines", () => {
  assert.throws(
    () => parseLedgerText(`${HEADER}\n\n${ENTRY}\n{not json\n`),
    (err) => err.line === 4 && /line 4/.test(err.message) && /malformed JSON line/.test(err.message),
  );
});

test("the committed A1-ART-02 ledger has no blank lines and parses", () => {
  const text = readFileSync(join(REPO_ROOT, "atelier/art-forge/runs/A1-ART-02.json"), "utf8");
  const blankLines = text
    .replace(/\n$/, "")
    .split("\n")
    .map((l, i) => (l.trim() === "" ? i + 1 : null))
    .filter((n) => n !== null);
  assert.deepEqual(blankLines, [], "blank lines in atelier/art-forge/runs/A1-ART-02.json");
  assert.ok(parseLedgerText(text).attempts.length > 0);
});

test("ledgerErrorText names the ledger file, the line when known, and the message", () => {
  const withLine = Object.assign(new Error("ledger attempt on line 3: malformed JSON line: {x"), { line: 3 });
  assert.equal(
    ledgerErrorText({ briefId: "A1-ART-02", error: withLine }),
    "ledger A1-ART-02.json unreadable (line 3): ledger attempt on line 3: malformed JSON line: {x",
  );
  assert.equal(
    ledgerErrorText({ briefId: "A1-ART-02", error: new Error("ledger A1-ART-02: HTTP 404") }),
    "ledger A1-ART-02.json unreadable: ledger A1-ART-02: HTTP 404",
  );
});
