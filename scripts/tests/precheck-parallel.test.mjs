// Behaviour of Gate 1's parallel runner (run_groups_parallel), driven through the
// ATLAS_PRECHECK_TEST_PLAN seam with stub sections, never the real suites.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "../precheck.sh");

const STUBS = `
sec_ok() { return 0; }
sec_crash() { sh -c 'kill -9 $PPID'; return 0; }
sec_child() { sh -c 'sleep 300 & echo $! > "$ATLAS_TEST_PIDFILE"; wait'; }
`;
const OK_PLAN = `
GROUP_ORDER="a b"
GROUP_a=("one|sec_ok" "two|sec_ok")
GROUP_b=("three|sec_ok")
SERIAL_PLAN=("one|sec_ok" "three|sec_ok" "two|sec_ok")
${STUBS}`;

function fixture(t, plan) {
  const dir = mkdtempSync(join(tmpdir(), "precheck-par-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "plan.sh");
  writeFileSync(file, plan);
  const env = {
    ...process.env, ATLAS_PRECHECK_TEST_MODE: "1", ATLAS_PRECHECK_TEST_PLAN: file,
    ATLAS_PARALLEL_MIN_FREE_GB: "6", ATLAS_PARALLEL_FREE_GB_OVERRIDE: "64",
    ATLAS_TEST_PIDFILE: join(dir, "child.pid"), PRECHECK_FULL: "0",
  };
  return { dir, env };
}
function run(t, plan, extraEnv = {}) {
  const { env } = fixture(t, plan);
  return spawnSync("bash", [script, "--no-install"], { encoding: "utf8", timeout: 60000, env: { ...env, ...extraEnv } });
}

test("baseline: stub groups pass in parallel", (t) => {
  const r = run(t, OK_PLAN);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /group a started/);
  assert.match(r.stdout, /RESULT: GATE 1 PASS/);
});

test("H1: an unwritable TMPDIR cannot produce a PASS with sections missing", (t) => {
  const r = run(t, OK_PLAN, { TMPDIR: "/nonexistent-precheck-tmp" });
  assert.notEqual(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /RESULT: GATE 1 PASS/);
});

test("H1: a serial-plan section that no group runs fails the completeness guard", (t) => {
  const plan = OK_PLAN.replace('GROUP_b=("three|sec_ok")', 'GROUP_b=()');
  const r = run(t, plan);
  assert.equal(r.status, 1, r.stdout);
  assert.doesNotMatch(r.stdout, /RESULT: GATE 1 PASS/);
  assert.match(r.stdout, /FAIL\s+.*three/);
});

test("L7: a crashing group yields FAIL for it and for its unrun sections", (t) => {
  const plan = OK_PLAN.replace('GROUP_a=("one|sec_ok" "two|sec_ok")', 'GROUP_a=("one|sec_crash" "two|sec_ok")');
  const r = run(t, plan);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /FAIL\s+one/);
  assert.match(r.stdout, /FAIL\s+two/);
  assert.match(r.stdout, /PASS\s+three/);
  assert.match(r.stdout, /no result recorded/);
});

test("L8: section start and end lines stream to stdout while groups run", (t) => {
  const r = run(t, OK_PLAN);
  assert.match(r.stdout, /^\[group a\] ▶ one$/m);
  assert.match(r.stdout, /^\[group a\] ✅ one \d+s$/m);
  assert.match(r.stdout, /^\[group b\] ✅ three \d+s$/m);
});

test("M6: low or unknown available memory runs the serial plan and says why", (t) => {
  for (const v of ["1", "unknown"]) {
    const r = run(t, OK_PLAN, { ATLAS_PARALLEL_FREE_GB_OVERRIDE: v });
    assert.equal(r.status, 0, r.stdout);
    assert.doesNotMatch(r.stdout, /group a started/);
    assert.match(r.stdout, /running serially/i);
    assert.match(r.stdout, /RESULT: GATE 1 PASS/);
  }
});

test("H2: TERM to the gate leaves no descendant of a group alive", async (t) => {
  const { dir, env } = fixture(t, OK_PLAN.replace('GROUP_a=("one|sec_ok" "two|sec_ok")', 'GROUP_a=("one|sec_child" "two|sec_ok")'));
  const child = spawn("bash", [script, "--no-install"], { env, stdio: "ignore" });
  const exited = new Promise((res) => child.on("exit", res));
  const pidfile = join(dir, "child.pid");
  for (let i = 0; i < 100 && !existsSync(pidfile); i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(existsSync(pidfile), "grandchild never started");
  const grandchild = Number(readFileSync(pidfile, "utf8").trim());
  assert.ok(grandchild > 1);
  child.kill("SIGTERM");
  await exited;
  let alive = true;
  for (let i = 0; i < 50 && alive; i++) {
    try { process.kill(grandchild, 0); await new Promise((r) => setTimeout(r, 100)); } catch { alive = false; }
  }
  if (alive) process.kill(grandchild, "SIGKILL");
  assert.equal(alive, false, "grandchild survived TERM");
});

test("M3: explorer_probes INT/TERM handler cleans up then exits 143", () => {
  const src = readFileSync(script, "utf8");
  const m = src.match(/trap '([^\n]*)' INT TERM\n\s*trap '[^\n]*' RETURN/);
  assert.ok(m, "explorer_probes must install separate INT/TERM and RETURN traps");
  assert.match(m[1], /exit 143/);
});
