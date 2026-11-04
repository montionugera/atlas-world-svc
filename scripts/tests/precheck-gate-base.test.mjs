import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "../precheck.sh");
function repo(t) {
  const cwd = mkdtempSync(join(tmpdir(), "precheck-base-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  let tick = 0; // strictly increasing commit dates make `git log` order deterministic
  const git = (...args) => {
    const stamp = `2020-01-01T00:00:${String(tick++).padStart(2, "0")}Z`;
    const p = spawnSync("git", args, { cwd, encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp } });
    assert.equal(p.status, 0, `${args.join(" ")}: ${p.stderr}`);
    return p.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  let n = 0;
  const commit = (message) => {
    writeFileSync(join(cwd, `file-${n++}`), message);
    git("add", "."); git("commit", "-qm", message);
    return git("rev-parse", "HEAD");
  };
  const base = (extra = {}) => spawnSync("bash", [script, "--print-gate-base"], {
    cwd, encoding: "utf8", timeout: 10000,
    env: { ...process.env, PSRW_GATE_BASE: "", ...extra },
  });
  return { cwd, git, commit, base };
}
function expectBase(result, expected) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), expected);
}

test("release merge uses previous feature merge across chores and sync merges", (t) => {
  const { git, commit, base } = repo(t);
  const initial = commit("initial");
  git("update-ref", "refs/remotes/origin/main", initial);
  git("checkout", "-qb", "release/9.9");
  git("checkout", "-qb", "feat/first"); commit("first feature");
  git("checkout", "-q", "release/9.9");
  git("merge", "--no-ff", "-qm", "merge feat/first into release/9.9", "feat/first");
  const first = git("rev-parse", "HEAD");
  expectBase(base(), initial);
  commit("backlog chore");
  git("checkout", "-qb", "sync-main", initial); commit("main change");
  git("checkout", "-q", "release/9.9");
  git("merge", "--no-ff", "-qm", "merge main into release/9.9", "sync-main");
  git("checkout", "-qb", "feat/second"); commit("second feature");
  git("checkout", "-q", "release/9.9");
  git("merge", "--no-ff", "-qm", "merge feat/second into release/9.9", "feat/second");
  expectBase(base(), first);
  expectBase(base({ PSRW_GATE_BASE: initial }), initial);
  assert.notEqual(base({ PSRW_GATE_BASE: "missing-ref" }).status, 0);
});

test("feature branch uses active release merge-base and otherwise origin/main", (t) => {
  const { cwd, git, commit, base } = repo(t);
  const initial = commit("initial");
  git("update-ref", "refs/remotes/origin/main", initial);
  git("checkout", "-qb", "release/9.9");
  const release = commit("release work");
  git("checkout", "-qb", "feat/test"); commit("feature work");
  writeFileSync(join(cwd, ".release.json"), JSON.stringify({ in_progress: true, version: "9.9" }));
  expectBase(base(), release);
  writeFileSync(join(cwd, ".release.json"), JSON.stringify({ in_progress: false, version: "9.9" }));
  expectBase(base(), initial);
});

test("base resolution fails closed when history is unavailable", (t) => {
  const { commit, base } = repo(t);
  commit("initial");
  assert.notEqual(base().status, 0);
});

test("base walk is first-parent only: a feature-merge subject on a merged side branch is ignored", (t) => {
  const { git, commit, base } = repo(t);
  const initial = commit("initial");
  git("update-ref", "refs/remotes/origin/main", initial);
  git("checkout", "-qb", "release/9.9");
  git("checkout", "-qb", "feat/first"); commit("first feature");
  git("checkout", "-q", "release/9.9");
  git("merge", "--no-ff", "-qm", "merge feat/first into release/9.9", "feat/first");
  const first = git("rev-parse", "HEAD");
  // side branch, newer than `first`, carrying a look-alike subject; reachable only via a second parent
  git("checkout", "-qb", "side", initial); commit("merge feat/side into release/9.9");
  git("checkout", "-q", "release/9.9");
  git("merge", "--no-ff", "-qm", "merge main into release/9.9", "side");
  git("checkout", "-qb", "feat/second"); commit("second feature");
  git("checkout", "-q", "release/9.9");
  git("merge", "--no-ff", "-qm", "merge feat/second into release/9.9", "feat/second");
  expectBase(base(), first);
});

test("base walk accepts only exact 'merge feat/* into release/*' subjects", (t) => {
  const { git, commit, base } = repo(t);
  const initial = commit("initial");
  git("update-ref", "refs/remotes/origin/main", initial);
  git("checkout", "-qb", "release/9.9");
  git("checkout", "-qb", "feat/first"); commit("first feature");
  git("checkout", "-q", "release/9.9");
  git("merge", "--no-ff", "-qm", "merge feat/first into release/9.9", "feat/first");
  const first = git("rev-parse", "HEAD");
  commit("chore: merge feat/x into release/9.9");
  commit("merge main into release/9.9");
  commit("merge feature/y into release/9.9");
  git("checkout", "-qb", "feat/second"); commit("second feature");
  git("checkout", "-q", "release/9.9");
  git("merge", "--no-ff", "-qm", "merge feat/second into release/9.9", "feat/second");
  expectBase(base(), first);
});

test("HEAD subject anchor: a non-merge subject mentioning the pattern is not a release merge", (t) => {
  const { git, commit, base } = repo(t);
  const initial = commit("initial");
  git("update-ref", "refs/remotes/origin/main", initial);
  git("checkout", "-qb", "release/9.9");
  git("checkout", "-qb", "feat/first"); commit("first feature");
  git("checkout", "-q", "release/9.9");
  git("merge", "--no-ff", "-qm", "merge feat/first into release/9.9", "feat/first");
  commit("chore: merge feat/x into release/9.9"); // HEAD: looks like, but is not, a feature merge
  expectBase(base(), initial); // merge-base with origin/main, not the previous feature merge
});
