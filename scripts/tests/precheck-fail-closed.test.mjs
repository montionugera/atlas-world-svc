// Fail-closed guards of the Gate 1 Rust selector. Every guard has a test that goes
// red when the guard is removed (mutation-checked, see F-170 lane A round 2).
import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "../precheck.sh");
const EMBED = 'const C: &str = include_str!("../../content/embedded.json");\n';

function fixture(t, files = { "server-rs/src/lib.rs": EMBED }) {
  const cwd = mkdtempSync(join(tmpdir(), "precheck-fc-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, "scripts"), { recursive: true });
  copyFileSync(script, join(cwd, "scripts/precheck.sh"));
  const put = (rel, body) => {
    mkdirSync(dirname(join(cwd, rel)), { recursive: true });
    writeFileSync(join(cwd, rel), body);
  };
  for (const [rel, body] of Object.entries(files)) put(rel, body);
  let tick = 0;
  const git = (...args) => {
    const stamp = `2020-01-01T00:00:${String(tick++).padStart(2, "0")}Z`;
    const p = spawnSync("git", args, { cwd, encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp } });
    assert.equal(p.status, 0, `${args.join(" ")}: ${p.stderr}`);
    return p.stdout.trim();
  };
  const run = (flag, input = "") => spawnSync("bash", [join(cwd, "scripts/precheck.sh"), flag], {
    cwd, input, encoding: "utf8", timeout: 20000,
    env: { ...process.env, PRECHECK_FULL: "0", PSRW_GATE_BASE: "", LC_ALL: "en_US.UTF-8" },
  });
  const select = (path) => { const r = run("--print-rust-selector", `${path}\n`); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const decide = () => { const r = run("--print-rust-decision"); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test"); git("config", "user.email", "t@example.com");
  git("config", "core.quotePath", "true"); // the default; the script must override it
  return { cwd, put, git, run, select, decide };
}
function baseline(f) { // initial commit == origin/main, then a feature branch one commit ahead
  f.put("docs/readme.md", "docs");
  f.put("content/other.json", "{}");
  f.git("add", "."); f.git("commit", "-qm", "initial");
  f.git("update-ref", "refs/remotes/origin/main", "HEAD");
  f.git("checkout", "-qb", "feat/t");
  f.put("docs/readme.md", "docs v2");
  f.git("add", "."); f.git("commit", "-qm", "docs change");
}

test("every .rs under server-rs counts (tests/, benches/), but not server-rs/target", (t) => {
  const f = fixture(t, {
    "server-rs/src/lib.rs": EMBED,
    "server-rs/tests/it.rs": 'const T: &str = include_str!("../../content/from-tests.json");\n',
    "server-rs/benches/b.rs": 'const B: &[u8] = include_bytes!("../../content/from-benches.bin");\n',
    // build output: a non-literal include here must neither count nor poison the scan
    "server-rs/target/debug/build/x/out.rs": 'const Z: &str = include_str!(concat!(env!("OUT_DIR"), "/z.rs"));\nconst Y: &str = include_str!("../../../../../content/from-target.json");\n',
  });
  assert.equal(f.select("content/from-tests.json"), "RUN");
  assert.equal(f.select("content/from-benches.bin"), "RUN");
  assert.equal(f.select("content/embedded.json"), "RUN");
  assert.equal(f.select("content/from-target.json"), "SKIP");
  assert.equal(f.select("docs/x.md"), "SKIP");
});

test("scan guards: zero literals, non-literal include, no sources -> RUN", (t) => {
  const none = fixture(t, { "server-rs/src/lib.rs": "fn main() {}\n" });
  assert.equal(none.select("docs/x.md"), "RUN", "zero include literals must fail closed");
  const concat = fixture(t, { "server-rs/src/lib.rs": EMBED + 'const N: &str = include_str!(concat!(env!("OUT_DIR"), "/n.rs"));\n' });
  assert.equal(concat.select("docs/x.md"), "RUN", "non-literal include_str!(concat!(...)) must fail closed");
  const nosrc = fixture(t, { "README": "x" });
  assert.equal(nosrc.select("docs/x.md"), "RUN", "no Rust sources must fail closed");
  const ok = fixture(t);
  assert.equal(ok.select("docs/x.md"), "SKIP", "control: a clean scan still skips");
});

test("embed-scan error makes the decision RUN (not skip)", (t) => {
  const f = fixture(t, { "server-rs/src/lib.rs": EMBED + 'const N: &str = include_str!(concat!("a", "b"));\n' });
  baseline(f);
  assert.equal(f.decide(), "RUN");
});

test("control: docs-only change with a healthy scan is SKIP", (t) => {
  const f = fixture(t); baseline(f);
  assert.equal(f.decide(), "SKIP");
});

test("HEAD == base runs even if only docs changed in the working tree", (t) => {
  const f = fixture(t);
  f.put("docs/readme.md", "docs"); f.git("add", "."); f.git("commit", "-qm", "initial");
  f.git("update-ref", "refs/remotes/origin/main", "HEAD");
  f.put("docs/readme.md", "docs edited"); // uncommitted, irrelevant to Rust
  assert.equal(f.decide(), "RUN");
});

test("empty diff runs", (t) => {
  const f = fixture(t);
  f.put("docs/readme.md", "docs"); f.git("add", "."); f.git("commit", "-qm", "initial");
  f.git("update-ref", "refs/remotes/origin/main", "HEAD");
  f.git("checkout", "-qb", "feat/t"); f.git("commit", "-q", "--allow-empty", "-m", "empty");
  assert.equal(f.decide(), "RUN");
});

test("untracked files are counted", (t) => {
  const f = fixture(t); baseline(f);
  f.put("server-rs/src/new_module.rs", "pub fn x() {}\n"); // untracked, relevant
  assert.equal(f.decide(), "RUN");
});

test("non-ASCII paths are not quoted: tracked and untracked embeds", (t) => {
  const f = fixture(t, { "server-rs/src/lib.rs": EMBED + 'const U: &str = include_str!("../../content/é.json");\nconst V: &str = include_str!("../../content/ü-new.json");\n' });
  f.put("docs/readme.md", "docs"); f.put("content/é.json", "{}");
  f.git("add", "."); f.git("commit", "-qm", "initial");
  f.git("update-ref", "refs/remotes/origin/main", "HEAD");
  f.git("checkout", "-qb", "feat/t");
  f.put("docs/readme.md", "docs v2"); f.git("add", "."); f.git("commit", "-qm", "docs");
  assert.equal(f.decide(), "SKIP", "control: docs only");
  f.put("content/é.json", '{"v":2}'); // tracked edit of a non-ASCII embedded path
  assert.equal(f.decide(), "RUN", "tracked non-ASCII embed");
  f.git("checkout", "--", "content/é.json");
  f.put("content/ü-new.json", "{}"); // never committed: untracked only
  assert.equal(f.decide(), "RUN", "untracked non-ASCII embed");
  const r = f.run("--print-changed-paths");
  assert.match(r.stdout, /^content\/ü-new\.json$/m);
});
