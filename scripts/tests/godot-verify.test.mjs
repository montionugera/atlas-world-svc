// godot-verify.sh must never accept an exit code alone (PATH godot exits 0 on C# failure),
// must never hang, and must import a fresh project before probing it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MONO = "4.7.2.stable.mono.official.ed1daf0bf";
// A stub godot: --version prints `version`; --import is logged, runs `importBody` and exits 0;
// any other call is logged and runs `body`.
function stubs({ version = MONO, body, importBody = ":", dotnetBody = "exit 0" }) {
  const bin = mkdtempSync(join(tmpdir(), "gv-"));
  writeFileSync(join(bin, "dotnet"), `#!/bin/sh\n${dotnetBody}\n`);
  writeFileSync(join(bin, "godot"), [
    "#!/bin/sh",
    `if [ "$1" = "--version" ]; then echo ${version}; exit 0; fi`,
    'echo "$*" >> "$ATLAS_STUB_LOG"',
    `case " $* " in *" --import "*) ${importBody}; exit 0;; esac`,
    body, "",
  ].join("\n"));
  chmodSync(join(bin, "dotnet"), 0o755); chmodSync(join(bin, "godot"), 0o755);
  return bin;
}
function project({ imported = true } = {}) {
  const p = mkdtempSync(join(tmpdir(), "gv-proj-"));
  if (imported) mkdirSync(join(p, ".godot/imported"), { recursive: true });
  return p;
}
function run(bin, { proj = project(), env = {} } = {}) {
  const log = join(proj, "stub.log");
  const r = spawnSync("bash", [join(ROOT, "scripts/godot-verify.sh"), "ATLAS_VERIFY_PIPELINE_CHAR", "^\\[PipelineCharVerify\\] VERDICT PASS$"], {
    encoding: "utf8", timeout: 30000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ATLAS_GODOT_MONO: join(bin, "godot"),
      ATLAS_GODOT_PROJECT: proj, ATLAS_STUB_LOG: log, ...env },
  });
  return { ...r, calls: existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [] };
}

test("exit 0 without the PASS line is a failure", () => {
  assert.equal(run(stubs({ body: 'echo "[PipelineCharVerify] BEGIN"; exit 0' })).status, 1);
});
test("PASS line with a non-zero exit is a failure", () => {
  assert.equal(run(stubs({ body: 'echo "[PipelineCharVerify] VERDICT PASS"; exit 1' })).status, 1);
});
test("a non-mono binary is refused", () => {
  assert.equal(run(stubs({ version: "4.7.2.stable.official.ed1daf0bf", body: 'echo "[PipelineCharVerify] VERDICT PASS"; exit 0' })).status, 1);
});
test("PASS line and exit 0 pass, and the probe env var reaches the binary", () => {
  const r = run(stubs({ body: '[ "$ATLAS_VERIFY_PIPELINE_CHAR" = 1 ] || exit 1; echo "[PipelineCharVerify] VERDICT PASS"; exit 0' }));
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test("a probe that never quits fails on the timeout instead of hanging", () => {
  const r = run(stubs({ body: "sleep 20; exit 0" }), { env: { ATLAS_GODOT_TIMEOUT: "2" } });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /timed out after 2s/);
});
test("a fresh project (no .godot/imported) is imported before the probe runs", () => {
  const r = run(stubs({ body: 'echo "[PipelineCharVerify] VERDICT PASS"; exit 0' }), { proj: project({ imported: false }) });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.calls[0], /--headless --path \S+ --import/);
  assert.doesNotMatch(r.calls[1], /--import/);
});
test("the import has its own, longer bound: a 3 s import passes under a 2 s probe timeout", () => {
  const r = run(stubs({ body: 'echo "[PipelineCharVerify] VERDICT PASS"; exit 0', importBody: "sleep 3" }),
    { proj: project({ imported: false }), env: { ATLAS_GODOT_TIMEOUT: "2", ATLAS_GODOT_IMPORT_TIMEOUT: "10" } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test("an import past ATLAS_GODOT_IMPORT_TIMEOUT fails and names the import bound", () => {
  const r = run(stubs({ body: 'echo "[PipelineCharVerify] VERDICT PASS"; exit 0', importBody: "sleep 5" }),
    { proj: project({ imported: false }), env: { ATLAS_GODOT_IMPORT_TIMEOUT: "1" } });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /godot --import timed out after 1s \(ATLAS_GODOT_IMPORT_TIMEOUT\)/);
});
test("a pulled glb without its .import sidecar also triggers the import", () => {
  const proj = project();
  mkdirSync(join(proj, "studio-cache"));
  writeFileSync(join(proj, "studio-cache", `${"a".repeat(64)}.glb`), "x");
  const r = run(stubs({ body: 'echo "[PipelineCharVerify] VERDICT PASS"; exit 0' }), { proj });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.calls[0], /--import/);
});
test("a probe that ignores SIGTERM is still killed (timeout -k), it cannot hang Gate 1", () => {
  const t0 = Date.now();
  const r = run(stubs({ body: "trap '' TERM; while :; do sleep 1; done" }), { env: { ATLAS_GODOT_TIMEOUT: "1" } });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /timed out after 1s/);
  assert.ok(Date.now() - t0 < 20000, "should be killed by the -k grace, not run to the test timeout");
});
test("a failed --import prints the tail of its output instead of discarding it", () => {
  const r = run(stubs({ body: "exit 0", importBody: 'echo "IMPORT-BOOM line"; exit 3' }), { proj: project({ imported: false }) });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /godot --import exited 3/);
  assert.match(r.stdout, /IMPORT-BOOM line/);
});

test("a dotnet build that never returns is killed and FAILS (F-174 final review)", () => {
  const bin = stubs({ dotnetBody: "sleep 60", body: 'echo "[PipelineCharVerify] VERDICT PASS"; exit 0' });
  const t0 = Date.now();
  const r = run(bin, { env: { ATLAS_DOTNET_BUILD_TIMEOUT: "1" } });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(Date.now() - t0 < 25000, "build was not bounded");
  assert.match(r.stdout, /dotnet build/);
  assert.equal(r.calls.length, 0, "godot must not run after a failed build");
});
