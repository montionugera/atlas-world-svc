import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
  });
}
function select(path) {
  const result = spawnSync("bash", [join(root, "scripts/precheck.sh"), "--print-rust-selector"], {
    cwd: root, input: `${path}\n`, encoding: "utf8", timeout: 10000,
    env: { ...process.env, PRECHECK_FULL: "0" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
const embedded = new Set();
for (const source of files(join(root, "server-rs/src")).filter((p) => p.endsWith(".rs"))) {
  const text = readFileSync(source, "utf8");
  for (const match of text.matchAll(/include_(?:str|bytes)!\s*\(\s*"([^"\n]+)"\s*\)/g)) {
    embedded.add(relative(root, resolve(dirname(source), match[1])));
  }
}

// server-rs also reads content at RUNTIME (world_regions.rs, map.rs: "../content/maps/{id}.json").
const RUNTIME_READ = "content/maps/";
test("Rust selector skips documentation and a real content file the binary neither embeds nor reads", () => {
  assert.ok(embedded.size > 0, "independent source scan found no embeds");
  const other = files(join(root, "content")).map((p) => relative(root, p))
    .find((p) => !embedded.has(p) && !p.startsWith(RUNTIME_READ));
  assert.ok(other, "expected a non-embedded, non-runtime-read content file");
  assert.equal(select("docs/x.md"), "SKIP");
  assert.equal(select(other), "SKIP");
});

test("Rust selector runs for every independently discovered embed and Rust inputs", () => {
  assert.ok(embedded.size > 0);
  for (const path of embedded) assert.equal(select(path), "RUN", path);
  for (const path of ["server-rs/src/main.rs", "contracts/content/items.json", "scripts/precheck.sh"]) {
    assert.equal(select(path), "RUN", path);
  }
});

test("alternate Rust macro delimiters cannot cause an unsafe skip", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "precheck-includes-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(join(fixture, "scripts"), { recursive: true });
  mkdirSync(join(fixture, "server-rs/src"), { recursive: true });
  copyFileSync(join(root, "scripts/precheck.sh"), join(fixture, "scripts/precheck.sh"));
  writeFileSync(join(fixture, "server-rs/src/lib.rs"),
    'const C: &str = include_str!("../../content/c.json");\nconst A: &str = include_str!{"../../content/a.json"};\nconst B: &[u8] = include_bytes!["../../content/b.bin"];\n');
  for (const path of ["content/a.json", "content/b.bin"]) {
    const result = spawnSync("bash", [join(fixture, "scripts/precheck.sh"), "--print-rust-selector"],
      { cwd: fixture, input: `${path}\n`, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "RUN", path);
  }
});

test("a content/maps file that server-rs reads at runtime triggers Rust", () => {
  const map = files(join(root, "content/maps")).map((p) => relative(root, p)).find((p) => p.endsWith(".json"));
  assert.ok(map, "expected a content/maps/*.json file");
  assert.ok(!embedded.has(map), "fixture must be a non-embedded map");
  assert.equal(select(map), "RUN", map);
});

function selectInFixture(t, rsSource, path) {
  const fixture = mkdtempSync(join(tmpdir(), "precheck-runtime-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(join(fixture, "scripts"), { recursive: true });
  mkdirSync(join(fixture, "server-rs/src"), { recursive: true });
  copyFileSync(join(root, "scripts/precheck.sh"), join(fixture, "scripts/precheck.sh"));
  writeFileSync(join(fixture, "server-rs/src/lib.rs"),
    'const C: &str = include_str!("../../content/c.json");\n' + rsSource);
  const result = spawnSync("bash", [join(fixture, "scripts/precheck.sh"), "--print-rust-selector"],
    { cwd: fixture, input: `${path}\n`, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("runtime content reads: placeholder literals reduce to a directory prefix", (t) => {
  const src = 'fn f(id: &str) { let _ = format!("../content/data/{id}.json"); let _ = format!("content/x/{id}"); }\n';
  assert.equal(selectInFixture(t, src, "content/data/a.json"), "RUN");
  assert.equal(selectInFixture(t, src, "content/other/a.json"), "SKIP");
  assert.equal(selectInFixture(t, src, "docs/a.md"), "SKIP");
});

test("runtime content reads: a dynamic base that cannot be reduced fails closed", (t) => {
  const src = 'fn f(root: &str) { let _ = format!("{root}/content/data.json"); }\n';
  assert.equal(selectInFixture(t, src, "docs/a.md"), "RUN");
});
