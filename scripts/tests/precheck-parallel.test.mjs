// Behaviour of Gate 1's parallel runner (run_groups_parallel), driven through the
// ATLAS_PRECHECK_TEST_PLAN seam with stub sections, never the real suites.
import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const script = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../precheck.sh",
);

const STUBS = `
sec_ok() { return 0; }
sec_crash() { sh -c 'kill -9 $PPID'; return 0; }
sec_child() { sh -c 'sleep 300 & echo $! > "$ATLAS_TEST_PIDFILE"; wait'; }
sec_fail() { return 1; }
sec_orphan() { sh -c 'sleep 300 & echo $! > "$ATLAS_TEST_PIDFILE"'; sleep 300; }
sec_forker() { local n=0; while [ $n -lt 400 ]; do sleep 20 & echo $! >> "$ATLAS_TEST_PIDFILE"; n=$((n+1)); sleep 0.005; done; wait; }
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
    ...process.env,
    ATLAS_PRECHECK_TEST_MODE: "1",
    ATLAS_PRECHECK_TEST_PLAN: file,
    ATLAS_PARALLEL_MIN_FREE_GB: "6",
    ATLAS_PARALLEL_FREE_GB_OVERRIDE: "64",
    ATLAS_TEST_PIDFILE: join(dir, "child.pid"),
    PRECHECK_FULL: "0",
  };
  return { dir, env };
}
function run(t, plan, extraEnv = {}) {
  const { env } = fixture(t, plan);
  return spawnSync("bash", [script, "--no-install"], {
    encoding: "utf8",
    timeout: 60000,
    env: { ...env, ...extraEnv },
  });
}

// Test mode must never look like a real Gate 1 pass: psrw reads only the exit code.
const TEST_PASS = 3;

test("baseline: stub groups pass in parallel", (t) => {
  const r = run(t, OK_PLAN);
  assert.equal(r.status, TEST_PASS, r.stdout + r.stderr);
  assert.match(r.stdout, /group a started/);
  assert.match(r.stdout, /RESULT: TEST MODE PASS/);
});

test("AC1: a passing test-mode run exits 3 and never prints GATE 1 PASS (parallel and serial)", (t) => {
  for (const extra of [{}, { GATE_PARALLEL: "0" }]) {
    const r = run(t, OK_PLAN, extra);
    assert.equal(r.status, TEST_PASS, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /GATE 1 PASS/);
    assert.match(r.stdout, /TEST MODE PASS — not a Gate 1 result/);
  }
});

test("AC1: --print-plan in test mode exits 3, not 0", (t) => {
  const { env } = fixture(t, OK_PLAN);
  const r = spawnSync("bash", [script, "--print-plan"], {
    encoding: "utf8",
    timeout: 20000,
    env,
  });
  assert.equal(r.status, TEST_PASS, r.stdout + r.stderr);
});

test("AC2: a failing test-mode run exits 1 and never prints GATE 1 PASS", (t) => {
  const r = run(
    t,
    OK_PLAN.replace(
      'GROUP_b=("three|sec_ok")',
      'GROUP_b=("three|sec_fail")',
    ).replace('"three|sec_ok" "two', '"three|sec_fail" "two'),
  );
  assert.equal(r.status, 1, r.stdout);
  assert.doesNotMatch(r.stdout, /GATE 1 PASS/);
  assert.match(r.stdout, /FAIL\s+three/);
});

test("H1: an unwritable TMPDIR cannot produce a PASS with sections missing", (t) => {
  const r = run(t, OK_PLAN, { TMPDIR: "/nonexistent-precheck-tmp" });
  assert.notEqual(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /RESULT: GATE 1 PASS/);
});

test("H1: a serial-plan section that no group runs fails the completeness guard", (t) => {
  const plan = OK_PLAN.replace('GROUP_b=("three|sec_ok")', "GROUP_b=()");
  const r = run(t, plan);
  assert.equal(r.status, 1, r.stdout);
  assert.doesNotMatch(r.stdout, /RESULT: GATE 1 PASS/);
  assert.match(r.stdout, /FAIL\s+.*three/);
});

test("L7: a crashing group yields FAIL for it and for its unrun sections", (t) => {
  const plan = OK_PLAN.replace(
    'GROUP_a=("one|sec_ok" "two|sec_ok")',
    'GROUP_a=("one|sec_crash" "two|sec_ok")',
  );
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
    assert.equal(r.status, TEST_PASS, r.stdout);
    assert.doesNotMatch(r.stdout, /group a started/);
    assert.match(r.stdout, /running serially/i);
    assert.match(r.stdout, /RESULT: TEST MODE PASS/);
  }
});

test("H2: TERM to the gate leaves no descendant of a group alive", async (t) => {
  const { dir, env } = fixture(
    t,
    OK_PLAN.replace(
      'GROUP_a=("one|sec_ok" "two|sec_ok")',
      'GROUP_a=("one|sec_child" "two|sec_ok")',
    ),
  );
  const child = spawn("bash", [script, "--no-install"], {
    env,
    stdio: "ignore",
  });
  const exited = new Promise((res) => child.on("exit", res));
  const pidfile = join(dir, "child.pid");
  for (let i = 0; i < 100 && !existsSync(pidfile); i++)
    await new Promise((r) => setTimeout(r, 100));
  assert.ok(existsSync(pidfile), "grandchild never started");
  const grandchild = Number(readFileSync(pidfile, "utf8").trim());
  assert.ok(grandchild > 1);
  child.kill("SIGTERM");
  await exited;
  let alive = true;
  for (let i = 0; i < 50 && alive; i++) {
    try {
      process.kill(grandchild, 0);
      await new Promise((r) => setTimeout(r, 100));
    } catch {
      alive = false;
    }
  }
  if (alive) process.kill(grandchild, "SIGKILL");
  assert.equal(alive, false, "grandchild survived TERM");
});

test("M3: explorer_probes INT/TERM handler cleans up then exits 143", () => {
  const src = readFileSync(script, "utf8");
  const m = src.match(/trap '([^\n]*)' INT TERM\n\s*trap '[^\n]*' RETURN/);
  assert.ok(
    m,
    "explorer_probes must install separate INT/TERM and RETURN traps",
  );
  assert.match(m[1], /exit 143/);
});

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const readPids = (f) =>
  existsSync(f)
    ? readFileSync(f, "utf8").split("\n").filter(Boolean).map(Number)
    : [];

test("AC3: TERM while a section forks in a tight loop leaves none of its children alive", async (t) => {
  const { dir, env } = fixture(
    t,
    OK_PLAN.replace(
      'GROUP_a=("one|sec_ok" "two|sec_ok")',
      'GROUP_a=("one|sec_forker" "two|sec_ok")',
    ),
  );
  const pidfile = join(dir, "child.pid");
  t.after(() => {
    for (const p of readPids(pidfile))
      if (isAlive(p))
        try {
          process.kill(p, "SIGKILL");
        } catch {}
  });
  const child = spawn("bash", [script, "--no-install"], {
    env,
    stdio: "ignore",
  });
  const exited = new Promise((res) => child.on("exit", res));
  for (let i = 0; i < 100 && readPids(pidfile).length < 50; i++)
    await new Promise((r) => setTimeout(r, 50));
  assert.ok(readPids(pidfile).length >= 50, "forker never got going");
  child.kill("SIGTERM");
  await exited;
  let alive = [];
  for (let i = 0; i < 30; i++) {
    alive = readPids(pidfile).filter(isAlive);
    if (alive.length === 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.deepEqual(alive, [], `${alive.length} forked children survived TERM`);
});

test("AC4: kill_tree returns 0 with an exited pid and leaves no stopped or live process", () => {
  const src = readFileSync(script, "utf8");
  const fns = src.match(/^stop_walk\(\)[^\n]*\n/m)?.[0] ?? "";
  const kt = src.match(/^kill_tree\(\) \{\n[\s\S]*?\n\}\n/m)?.[0];
  assert.ok(fns && kt, "stop_walk and kill_tree must be top-level functions");
  const sh = `${fns}${kt}
bash -c 'sleep 300 & sleep 300 & wait' & tree=$!
trap 'kill -9 $tree $kids 2>/dev/null' EXIT
sleep 0.3; kids=$(pgrep -P $tree | tr '\\n' ' ')
true & dead=$!; wait $dead
kill_tree "$dead" "$tree"; echo "rc=$?"
sleep 0.2; for p in $tree $kids; do ps -o pid=,stat= -p $p; done; echo end`;
  const r = spawnSync("bash", ["-c", sh], { encoding: "utf8", timeout: 20000 });
  assert.match(r.stdout, /rc=0/);
  const left = r.stdout
    .split("\n")
    .filter((l) => /^\s*\d+\s+\S/.test(l) && !/Z/.test(l));
  assert.deepEqual(
    left,
    [],
    "processes left (live or stopped): " + left.join(";"),
  );
});

// ── F-173: serial mode stop handler, re-parented orphans, never the caller's group ──
const SERIAL = { ATLAS_PARALLEL_FREE_GB_OVERRIDE: "1" };
async function termLeavesNothing(t, plan, extraEnv, minPids) {
  const { dir, env } = fixture(t, plan);
  const pidfile = join(dir, "child.pid");
  t.after(() => {
    for (const p of readPids(pidfile))
      if (isAlive(p))
        try {
          process.kill(p, "SIGKILL");
        } catch {}
  });
  const child = spawn("bash", [script, "--no-install"], {
    env: { ...env, ...extraEnv },
    stdio: "ignore",
  });
  const exited = new Promise((res) => child.on("exit", res));
  for (let i = 0; i < 100 && readPids(pidfile).length < minPids; i++)
    await new Promise((r) => setTimeout(r, 50));
  assert.ok(
    readPids(pidfile).length >= minPids,
    "section never started its children",
  );
  child.kill("SIGTERM");
  await exited;
  let alive = [];
  for (let i = 0; i < 30; i++) {
    alive = readPids(pidfile).filter(isAlive);
    if (alive.length === 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.deepEqual(alive, [], `${alive.length} process(es) survived TERM`);
}
const withA = (sec) =>
  OK_PLAN.replace(
    'GROUP_a=("one|sec_ok" "two|sec_ok")',
    `GROUP_a=("one|${sec}" "two|sec_ok")`,
  ).replace('SERIAL_PLAN=("one|sec_ok"', `SERIAL_PLAN=("one|${sec}"`);

test("F-173 AC1: serial mode — TERM leaves no descendant of a section alive", async (t) => {
  await termLeavesNothing(t, withA("sec_child"), SERIAL, 1);
});
test("F-173 AC1: serial mode — TERM during a tight fork loop leaves no child alive", async (t) => {
  await termLeavesNothing(t, withA("sec_forker"), SERIAL, 50);
});
test("F-173 AC3: a grandchild orphaned before TERM is killed (parallel)", async (t) => {
  await termLeavesNothing(t, withA("sec_orphan"), {}, 1);
});
test("F-173 AC3: a grandchild orphaned before TERM is killed (serial)", async (t) => {
  await termLeavesNothing(t, withA("sec_orphan"), SERIAL, 1);
});
test("F-173 AC2: serial mode keeps plan order and fails closed on a crashing section", (t) => {
  const ok = run(t, OK_PLAN, SERIAL);
  assert.equal(ok.status, TEST_PASS, ok.stdout);
  const order = [...ok.stdout.matchAll(/^ (?:PASS|FAIL|SKIP)\s+(\S+)$/gm)].map(
    (m) => m[1],
  );
  assert.deepEqual(order, ["one", "three", "two"]);
  const r = run(t, withA("sec_crash"), SERIAL);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /FAIL\s+one/);
  assert.match(r.stdout, /FAIL\s+three/);
  assert.match(r.stdout, /FAIL\s+two/);
  assert.doesNotMatch(r.stdout, /PASS — /);
});
test("F-173 AC4: kill_tree never group-signals the caller's own process group", () => {
  const src = readFileSync(script, "utf8");
  const fns = [
    ...src.matchAll(
      /^(?:stop_walk|pgid_of|kill_tree)\(\) \{[\s\S]*?^\}\n|^(?:stop_walk|pgid_of)\(\)[^\n]*\n/gm,
    ),
  ]
    .map((m) => m[0])
    .join("");
  // Shims: pgid_of says the target pid 4242 leads the CALLER's own group; kill only records.
  // Without the own-group guard kill_tree would send "-STOP -- -4242" (a group signal).
  const sh = `${fns}
pgid_of() { echo 4242; }
kill() { echo "kill $*"; }
kill_tree 4242`;
  const r = spawnSync("bash", ["-c", sh], { encoding: "utf8", timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /kill -STOP 4242/, "the tree itself is still frozen");
  assert.doesNotMatch(
    r.stdout,
    /-- -4242|-4242/,
    `group-signalled the caller's own group:
${r.stdout}`,
  );
});

test("F-173: serial mode streams section output live, not from a log file at the end", (t) => {
  const r = run(t, OK_PLAN, SERIAL);
  assert.equal(r.status, TEST_PASS, r.stdout);
  assert.match(r.stdout, /group serial started/);
  assert.doesNotMatch(
    r.stdout,
    /# GROUP: serial[\s\S]*▶ one/,
    "serial output was replayed from a log after the run",
  );
  assert.match(
    r.stdout,
    /▶ one[\s\S]*# GROUP: serial/,
    "section output must appear before the group footer",
  );
});
