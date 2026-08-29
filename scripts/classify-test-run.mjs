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

// A quoted signal name is the one thing a genuine assertion/crash failure
// never has: an in-process failure has no `signal:` field, and a crashed
// file that exited via a code (not a signal) prints `signal: ~` (unquoted
// YAML null). Only Node's own synthesized "the child process was signalled"
// block prints `signal: 'SIGTERM'` (or any other quoted name).
const SIGNAL_TAGGED = /\n\s*signal: '[A-Za-z0-9]+'/;

export function classifyTestRun(tapText) {
  // Parent-kill: the top-level process died before it could print anything
  // past this line — there is no summary to read at all.
  if (/^# Interrupted while running:/m.test(tapText)) return "KILLED";
  // No summary for ANY other reason is equally unproven — never CLEAN by
  // the absence of evidence.
  if (!/^# pass \d+/m.test(tapText)) return "KILLED";
  const blocks = tapText.split(/^not ok /m).slice(1);
  if (blocks.length === 0) return "CLEAN";
  const genuine = blocks.filter((b) => !SIGNAL_TAGGED.test(b));
  return genuine.length > 0 ? "FAILED" : "KILLED";
}

const EXIT_CODE = { CLEAN: 0, FAILED: 1, KILLED: 2 };

function main() {
  const argv = process.argv.slice(2);
  const fileArg = argv.find((a) => !a.startsWith("--"));
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
