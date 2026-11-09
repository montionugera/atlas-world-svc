// The parallel plan and the serial plan of Gate 1 must run the same sections.
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "../precheck.sh");
const r = spawnSync("bash", [script, "--print-plan"], { encoding: "utf8", timeout: 20000 });
assert.equal(r.status, 0, r.stderr);
const rows = r.stdout.split("\n").filter((l) => l.includes("\t")).map((l) => l.split("\t"));
const serial = rows.filter(([g]) => g === "serial").map(([, e]) => e);
const grouped = rows.filter(([g]) => g !== "serial");

test("every serial section appears in exactly one parallel group, and vice versa", () => {
  assert.ok(serial.length >= 14, "serial plan unexpectedly short");
  assert.equal(new Set(serial).size, serial.length, "duplicate serial entry");
  assert.deepEqual(grouped.map(([, e]) => e).sort(), [...serial].sort());
});

test("section names are unique and each maps to a function", () => {
  const names = serial.map((e) => e.split("|")[0]);
  assert.equal(new Set(names).size, names.length);
  for (const e of serial) assert.match(e, /^[^|]+\|[a-z_]+$/, e);
});

test("shared-state constraints: contracts jest follows server-rs; explorer-sharing suites stay together", () => {
  const rust = grouped.filter(([g]) => g === "rust").map(([, e]) => e.split("|")[1]);
  assert.deepEqual(rust, ["rust_section", "contracts_tests"]);
  const explorer = new Set(grouped.filter(([g]) => g === "explorer").map(([, e]) => e.split("|")[1]));
  for (const fn of ["storybook_tests", "atlas_web_tests", "explorer_probes"]) assert.ok(explorer.has(fn), fn);
});
