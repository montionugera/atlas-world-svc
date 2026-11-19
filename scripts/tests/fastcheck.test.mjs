import test from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fastcheck = join(root, "scripts/fastcheck.sh");

test("fastcheck.sh --help exits 0 and prints usage", () => {
  const res = spawnSync("bash", [fastcheck, "--help"], { cwd: root, encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Usage:/);
});

test("fastcheck.sh rejects unknown flags with exit 2", () => {
  const res = spawnSync("bash", [fastcheck, "--nope"], { cwd: root, encoding: "utf8" });
  assert.equal(res.status, 2);
});

test("fastcheck.sh does not compile a deleted python file (F-217)", async () => {
  const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "fastcheck-"));
  const git = (...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, encoding: "utf8" });
  try {
    mkdirSync(join(dir, "scripts"));
    copyFileSync(fastcheck, join(dir, "scripts/fastcheck.sh"));
    writeFileSync(join(dir, "scripts/gone.py"), "x = 1\n");
    git("init", "-q");
    git("add", "-A");
    git("commit", "-qm", "one");
    writeFileSync(join(dir, "note.txt"), "n\n");
    git("add", "-A");
    git("commit", "-qm", "two"); // base falls back to HEAD~1 in a repo without precheck.sh
    rmSync(join(dir, "scripts/gone.py"));
    const res = spawnSync("bash", [join(dir, "scripts/fastcheck.sh")], { cwd: dir, encoding: "utf8" });
    assert.match(res.stdout, /scripts\/gone\.py/, "the deleted file must be in the changed list");
    assert.equal(res.status, 0, res.stdout + res.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
