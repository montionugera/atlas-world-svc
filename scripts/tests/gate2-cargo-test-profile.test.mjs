// Gate 2 must run the server-rs tests in the same profile as CI. The dev-token
// login is compiled out of release builds (server-rs/src/auth/jwt.rs), so tests
// that use it can only pass in debug: `cargo test --release` failed 8 websocket
// tests with a 401 and stopped before the remaining test files, while CI stayed
// green on plain `cargo test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

test("Gate 2 runs cargo test in the debug profile, like CI", () => {
  const gate = read("scripts/integration.sh");
  const calls = gate.match(/cargo test[^\n)]*/g) ?? [];
  assert.ok(calls.length > 0, "integration.sh no longer runs cargo test");
  for (const call of calls) {
    if (call.includes('"')) continue; // a section label, not a command
    assert.ok(!call.includes("--release"), `release-profile test run: ${call}`);
  }
});

test("Gate 2's section label names the same command", () => {
  assert.ok(!read("scripts/integration.sh").includes("cargo test --release"));
});

test("CI still runs cargo test in the debug profile", () => {
  assert.match(read(".github/workflows/server-rs.yml"), /run: cargo test --locked\n/);
});
