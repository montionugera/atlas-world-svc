// Task 3 (F-051 completion plan) — a killed run must never read as a failure.
//
// The four fixtures below are not invented shapes — each is a trimmed,
// byte-accurate capture of a REAL `node --test --test-reporter=tap` run on
// this Node build (only absolute paths and durations are normalized), taken
// while building this task: a clean pass, a genuine `assert` failure, one
// isolated per-file test process SIGTERM'd while its siblings finished
// (child-kill), and the whole `node --test` process SIGTERM'd mid-run
// (parent-kill). See task-3-report.md for how each was produced.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyTestRun } from "../classify-test-run.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = join(ROOT, "scripts/classify-test-run.mjs");

const CLEAN = `TAP version 13
# Subtest: quick pass
ok 1 - quick pass
  ---
  duration_ms: 1.006667
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 9.5
`;

const FAILED = `TAP version 13
# Subtest: a genuine assertion failure
not ok 1 - a genuine assertion failure
  ---
  duration_ms: 2.274666
  type: 'test'
  location: '/repo/scripts/tests/example.test.mjs:3:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    1 !== 2

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 2
  actual: 1
  operator: 'strictEqual'
  ...
# Subtest: quick pass
ok 2 - quick pass
  ---
  duration_ms: 1.030625
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 1
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 192.703875
`;

// A genuine failure from a whole FILE crashing (uncaught exception, exits via
// a CODE not a signal) must ALSO classify as FAILED — signal: ~ is unquoted
// YAML null, not a signal name, and must not be mistaken for one.
const FAILED_FILE_CRASH = `TAP version 13
# Subtest: about to crash the whole file
ok 1 - about to crash the whole file
  ---
  duration_ms: 1.154875
  type: 'test'
  ...
# Subtest: crash.test.mjs
not ok 2 - crash.test.mjs
  ---
  duration_ms: 213.53125
  type: 'test'
  location: '/repo/scripts/tests/crash.test.mjs:1:1'
  failureType: 'testCodeFailure'
  exitCode: 1
  signal: ~
  error: 'test failed'
  code: 'ERR_TEST_FAILURE'
  ...
1..2
# tests 2
# suites 0
# pass 1
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 242.874083
`;

// Child-kill: one isolated per-file test process (--test-isolation=process,
// the default when running multiple files, exactly as
// `npm test --prefix scripts` does) was SIGTERM'd; the PARENT `node --test`
// survived and printed a full summary. Node cannot recover the killed file's
// real subtest structure, so it synthesizes ONE "not ok" block using the
// FILENAME, tagged with the fields a genuine failure never carries:
// `exitCode: ~` and a QUOTED `signal:`. Zero GENUINE (non-signal-tagged)
// not-ok blocks — the defining shape of a kill, not a failure.
const CHILD_KILL = `TAP version 13
# Subtest: quick pass
ok 1 - quick pass
  ---
  duration_ms: 1.006667
  type: 'test'
  ...
# Subtest: slow.test.mjs
not ok 2 - slow.test.mjs
  ---
  duration_ms: 8907.923417
  type: 'test'
  location: '/repo/scripts/tests/slow.test.mjs:1:1'
  failureType: 'testCodeFailure'
  exitCode: ~
  signal: 'SIGTERM'
  error: 'test failed'
  code: 'ERR_TEST_FAILURE'
  ...
1..2
# tests 2
# suites 0
# pass 1
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 8947.613709
`;

// Fix round 1 (both reviewers, confirmed defect — the classifier had the
// INVERSE of the bug it fixes): a genuine assertion failure whose message
// happens to quote captured TAP text is a LIVE path in this repo — several
// tests here and in render-lock.test.mjs assert `assert.ok(cond, capturedOut)`
// where capturedOut can itself be a child-kill dump, and Node's real
// `error: |-` block scalar indents that embedded content at 4 spaces (one
// level deeper than the 2-space top-level diagnostic keys — see the FAILED
// fixture above's real captured "    Expected values..." line). Built by
// explicit line join (not a template literal) so the adversarial lines land
// at that REAL 4-space content indent, not the 2-space column the
// synthesized `exitCode:`/`signal:` fields always occupy — the original
// `/\n\s*signal: '.../` matched this regardless of indent; the fixed
// column-anchored + co-occurring-exitCode regex must not.
const FAILED_WITH_EMBEDDED_SIGNAL_TEXT = [
  "TAP version 13",
  "# Subtest: assert on a captured killed-run fixture",
  "not ok 1 - assert on a captured killed-run fixture",
  "  ---",
  "  duration_ms: 3.1",
  "  type: 'test'",
  "  location: '/repo/scripts/tests/example.test.mjs:10:1'",
  "  failureType: 'testCodeFailure'",
  "  error: |-",
  "    Expected the run to be classified CLEAN. Captured tap text:",
  "    TAP version 13",
  "    exitCode: ~",
  "    signal: 'SIGTERM'",
  "    1..0",
  "  code: 'ERR_ASSERTION'",
  "  name: 'AssertionError'",
  "  ...",
  "1..1",
  "# tests 1",
  "# suites 0",
  "# pass 0",
  "# fail 1",
  "# cancelled 0",
  "# skipped 0",
  "# todo 0",
  "# duration_ms 12.3",
  "",
].join("\n");

// Parent-kill: the whole `node --test` process was signalled (a CI job
// cancellation, or an operator killing the process group). It dies before
// printing a final summary at all — only Node's own in-flight marker for
// whatever test was still running when the signal landed.
const PARENT_KILL = `TAP version 13
# Subtest: quick pass
ok 1 - quick pass
  ---
  duration_ms: 1.0815
  type: 'test'
  ...
# Interrupted while running: slow.test.mjs at /repo/scripts/tests/slow.test.mjs:1:1
`;

test("classifyTestRun: a clean run is CLEAN", () => {
  assert.equal(classifyTestRun(CLEAN), "CLEAN");
});

test("classifyTestRun: a genuine assertion failure is FAILED", () => {
  assert.equal(classifyTestRun(FAILED), "FAILED");
});

test("classifyTestRun: a whole file crashing (exitCode, unquoted signal: ~) is FAILED, not KILLED", () => {
  assert.equal(classifyTestRun(FAILED_FILE_CRASH), "FAILED");
});

// THE fix-round-1 regression test: a genuine failure must never read as
// KILLED just because its own error message quotes signal-shaped text.
test("classifyTestRun: a genuine failure whose message QUOTES a signal line is FAILED, not KILLED", () => {
  assert.equal(classifyTestRun(FAILED_WITH_EMBEDDED_SIGNAL_TEXT), "FAILED");
});

test("classifyTestRun: a child (isolated test-file) process SIGTERM'd is KILLED, not FAILED", () => {
  assert.equal(classifyTestRun(CHILD_KILL), "KILLED");
});

test("classifyTestRun: the whole node --test process SIGTERM'd mid-run is KILLED", () => {
  assert.equal(classifyTestRun(PARENT_KILL), "KILLED");
});

// A run with BOTH a genuine failure and a killed sibling file must not let
// the kill hide the real defect — FAILED wins.
test("classifyTestRun: a genuine failure alongside a killed sibling is still FAILED", () => {
  const mixed = FAILED.replace(/^1\.\.2[\s\S]*$/m, "") + CHILD_KILL.split("1..2")[0] +
    `1..3\n# tests 3\n# suites 0\n# pass 1\n# fail 2\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 999\n`;
  assert.equal(classifyTestRun(mixed), "FAILED");
});

test("classifyTestRun: text with no not-ok and no final summary at all is KILLED, never CLEAN by default", () => {
  assert.equal(classifyTestRun("TAP version 13\n# Subtest: quick pass\nok 1 - quick pass\n"), "KILLED");
});

test("classifyTestRun: empty input is KILLED, not a throw", () => {
  assert.equal(classifyTestRun(""), "KILLED");
});

// ── CLI: reads a file arg or stdin, prints the verdict, exits 0/1/2 ─────────
test("CLI: stdin -> exit codes are 0/1/2 for CLEAN/FAILED/KILLED, and the verdict is printed", () => {
  const withStdin = (text) => spawnSync(process.execPath, [CLI], { input: text, encoding: "utf8" });
  const clean = withStdin(CLEAN);
  assert.equal(clean.status, 0);
  assert.equal(clean.stdout.trim(), "CLEAN");

  const failed = withStdin(FAILED);
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout.trim(), "FAILED");

  const killed = withStdin(CHILD_KILL);
  assert.equal(killed.status, 2);
  assert.equal(killed.stdout.trim(), "KILLED");

  const parentKilled = withStdin(PARENT_KILL);
  assert.equal(parentKilled.status, 2);
  assert.equal(parentKilled.stdout.trim(), "KILLED");
});

test("CLI: a file argument works the same as stdin", () => {
  const tmp = join(ROOT, "scripts/tests/.classify-cli-fixture.tmp");
  writeFileSync(tmp, CLEAN);
  try {
    const out = execFileSync(process.execPath, [CLI, tmp], { encoding: "utf8" }); // throws on non-zero
    assert.equal(out.trim(), "CLEAN");
  } finally {
    rmSync(tmp, { force: true });
  }
});

test("CLI: a missing file argument exits 2 (misuse), not a throw", () => {
  const r = spawnSync(process.execPath, [CLI, "/definitely/not/a/real/file.tap"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stdout + r.stderr, /could not read/);
});

// Fix round 1 (LOW): an unknown flag used to fall through to reading stdin —
// harmless here (stdin is closed/empty under spawnSync with no `input`), but
// a real hang on an interactive TTY. Must be rejected before ever touching
// stdin, so this also proves it never gets there: no `input` is passed, and
// the assertion is the exit code + message, not "did it eventually exit".
test("CLI: an unknown flag exits 2 (misuse) and never falls through to reading stdin", () => {
  const r = spawnSync(process.execPath, [CLI, "--bogus"], { encoding: "utf8", timeout: 5000 });
  assert.equal(r.signal, null, "the process did not exit on its own — it fell through to a stdin read");
  assert.equal(r.status, 2);
  assert.match(r.stdout + r.stderr, /unknown arg --bogus/);
});

test("classify-test-run.mjs never calls process.exit() from main()", () => {
  const src = readFileSync(CLI, "utf8");
  const at = src.search(/^function main\(/m);
  assert.ok(at >= 0, "no main() found");
  const body = src.slice(at).replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(body, /process\.exit\(/);
});

// Task 3: `npm test --prefix scripts` had no timeout ANYWHERE, so a genuine
// wedge burned GitHub's 360-minute default. Pinned as a source assertion
// (like scripts/tests/node-pin.test.mjs's ci.yml checks) rather than a
// behavioural one — the failure mode is a MISSING line, which only a text
// search can catch.
test("the Content gate CI step (npm test --prefix scripts) has a timeout-minutes, and it's minutes not GitHub's 360-minute default", () => {
  const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const at = ci.indexOf("name: Content gate");
  assert.ok(at >= 0, "the Content gate step is gone or renamed — this pin can no longer see it");
  const step = ci.slice(at, ci.indexOf("\n\n", at));
  assert.match(step, /npm test --prefix scripts/, "this is not the step that runs the scripts suite");
  const m = step.match(/timeout-minutes:\s*(\d+)/);
  assert.ok(m, `no timeout-minutes on the Content gate step:\n${step}`);
  const minutes = Number(m[1]);
  assert.ok(minutes > 0 && minutes < 60, `timeout-minutes ${minutes} is not a small, deliberate bound`);
});
