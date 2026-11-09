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
