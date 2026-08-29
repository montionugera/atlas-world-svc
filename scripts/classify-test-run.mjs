#!/usr/bin/env node
// Task 3 (F-051 completion plan) — a killed run must never read as a failure.
//
// THE MEASURED DEFECT: the default `node --test` reporter DISCARDS `signal:`
// entirely — a killed run's TAP-equivalent output ("✔ slow test (60003ms)")
// is byte-for-byte indistinguishable from one that actually finished. This
// already cost this programme directly: three tools/mapforge/tests/ files
// (promote, raster, render-sheet — all blocking in spawnSync) were reported
// as real failures when an operator had SIGTERM'd them, and promote.test.mjs
// is 42/42 standalone (i.e. it was never actually broken).
//
// Under `--test-reporter=tap` the two kills ARE distinguishable (verified
// empirically against this Node build, task-3-report.md has the byte-for-byte
// captures):
//   - PARENT-KILL (the whole `node --test` process was signalled — e.g. a CI
//     job cancellation, or an operator killing the process group): Node
//     prints `# Interrupted while running: <file> at <loc>` for whatever was
//     in flight and NEVER reaches a final `# pass \d+` summary line at all.
//   - CHILD-KILL (one isolated per-FILE test process was signalled, the
//     parent survives and finishes normally — e.g. only the offending file's
//     process was in the kill's target set): the run DOES reach a final
//     summary, but the killed file's "not ok" block is a Node-synthesized
//     stand-in tagged `exitCode: ~` and `signal: 'SIGTERM'` (any signal name)
//     — never a real assertion failure, which carries no `signal: '<NAME>'`
//     field at all (an in-process assertion has no signal key; a crashed
//     file that exited via a code, not a signal, prints `signal: ~`, unquoted
//     YAML null).
//
// classifyTestRun is deliberately about SHAPE, not about running anything —
// it takes text that has already been captured, from a live `node --test
// --test-reporter=tap` run or a fixture, and answers the one question that
// matters: does this text prove the code failed, or does it merely prove the
// process was cut off?
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Fix round 1 (both reviewers, confirmed): the original `/\n\s*signal:
// '[A-Za-z0-9]+'/` matched a quoted signal name at ANY indent, ANYWHERE in
// the block — including inside a genuine failure's own YAML `error: |-`
// literal block, if that failure's message happens to quote TAP text
// containing a signal line (this repo asserts on spawnSync results, and
// scripts/tests/classify-test-run.test.mjs now commits a fixture proving the
// path is live). That inverted the defect this file exists to fix: a REAL
// failure would read as KILLED (rc 2) instead of FAILED (rc 1) — hiding a
// genuine bug behind "oh, just a kill", strictly worse than the original
// problem. Node's own synthesized field is always column-anchored at exactly
// two spaces and always ships PAIRED with `exitCode: ~` on its own line (see
// the CHILD_KILL fixture) — a real failure's `error:` payload is YAML-BLOCK
// TEXT, indented at least 4 spaces inside the block scalar, so anchoring to
// the top-level 2-space field width plus requiring the co-occurring
// `exitCode: ~` sibling line rejects any string a failure's own message
// happens to contain.
const SYNTHESIZED_EXIT_CODE = /^  exitCode: ~$/m;
const SYNTHESIZED_SIGNAL = /^  signal: '[A-Za-z0-9]+'$/m;

export function classifyTestRun(tapText) {
  // Parent-kill: the top-level process died before it could print anything
  // past this line — there is no summary to read at all.
  if (/^# Interrupted while running:/m.test(tapText)) return "KILLED";
  // No summary for ANY other reason is equally unproven — never CLEAN by
  // the absence of evidence.
  if (!/^# pass \d+/m.test(tapText)) return "KILLED";
  const blocks = tapText.split(/^not ok /m).slice(1);
  if (blocks.length === 0) return "CLEAN";
  const genuine = blocks.filter((b) => !(SYNTHESIZED_EXIT_CODE.test(b) && SYNTHESIZED_SIGNAL.test(b)));
  return genuine.length > 0 ? "FAILED" : "KILLED";
}

const EXIT_CODE = { CLEAN: 0, FAILED: 1, KILLED: 2 };

function main() {
  const argv = process.argv.slice(2);
  // Fix round 1 (LOW): this CLI has exactly one positional arg (an optional
  // file path) and NO flags at all — an unrecognized `--foo` used to fall
  // straight through to `readFileSync(0)` (stdin), which hangs forever on an
  // interactive TTY instead of failing fast. Any `--`-looking arg is misuse.
  const badFlag = argv.find((a) => a.startsWith("--"));
  if (badFlag) {
    console.error(`classify-test-run: unknown arg ${badFlag} — usage: classify-test-run.mjs [file.tap] (reads stdin if omitted)`);
    process.exitCode = 2;
    return;
  }
  const fileArg = argv[0];
  let text;
  try {
    text = readFileSync(fileArg ?? 0, "utf8");
  } catch (e) {
    console.error(`classify-test-run: could not read ${fileArg ?? "stdin"}: ${e.message}`);
    process.exitCode = 2;
    return;
  }
  const verdict = classifyTestRun(text);
  console.log(verdict);
  process.exitCode = EXIT_CODE[verdict];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
